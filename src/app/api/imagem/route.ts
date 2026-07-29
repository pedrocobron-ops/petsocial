import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

/**
 * Busca e salvamento de imagem do Wikimedia Commons, para a Redação.
 *
 * Por que existe uma rota aqui, e não só as Edge Functions: a busca precisa
 * sair para a internet, e quem tem saída livre é o servidor do site. O
 * navegador não serve (o Commons não libera CORS para a API de busca) e a
 * automação da rotina depende da rede do ambiente em que ela roda, que pode
 * estar restrita. Esta rota é o caminho que sempre funciona: o editor logado
 * chama o próprio site, e o site fala com o Commons.
 *
 * Nenhum segredo novo entra no jogo. A autorização é a mesma de /api/revalidar
 * (token do editor + is_admin() no banco), e o upload usa o token do próprio
 * usuário, exatamente como o botão de subir imagem já faz pelo navegador.
 */

const UA = "MaestroPetJornal/1.0 (contato@maestropet.com)";

/** Títulos que não servem para jornalismo: gravura, pintura, mapa, diagrama. */
const RUIM =
  /engraving|lithograph|\bdrawing\b|sketch|\bmap\b|diagram|coat of arms|\bpainting\b|1[6789]\d\d|\blogo\b|poster|\bstamp\b|\bcoin\b|\bflag\b|emblem|statue|sculpture|cartoon|skull|x-ray|xray/i;

function limpar(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** Crédito no formato que o jornal usa nas legendas. */
function credito(meta: Record<string, { value?: string }>) {
  const licenca = (meta.LicenseShortName?.value ?? "").toLowerCase();
  const artista = limpar(meta.Artist?.value ?? "").slice(0, 50);
  const dominioPublico = /cc0|public domain|^pd/.test(licenca);
  if (dominioPublico) {
    return artista
      ? `Foto: ${artista} / Wikimedia Commons (dominio publico)`
      : "Foto: Wikimedia Commons (dominio publico)";
  }
  return `Foto: ${artista || "autor nao informado"} / Wikimedia Commons (${
    meta.LicenseShortName?.value ?? "CC BY"
  })`;
}

async function conferirAdmin(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: isAdmin } = await sb.rpc("is_admin");
  return isAdmin ? sb : null;
}

async function buscar(termo: string) {
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=search&gsrnamespace=6&gsrlimit=40&gsrsearch=" +
    encodeURIComponent(termo) +
    "&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1000";

  const r = await fetch(api, { headers: { "User-Agent": UA } });
  if (!r.ok) return { ok: false as const, erro: `Commons respondeu ${r.status}` };
  const j = await r.json();

  const paginas = (Object.values(j?.query?.pages ?? {}) as Array<Record<string, unknown>>).sort(
    (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0)
  );

  const candidatas: Array<{ titulo: string; thumb: string; credito: string; largura: number }> = [];

  for (const p of paginas) {
    const ii = (p.imageinfo as Array<Record<string, unknown>> | undefined)?.[0];
    if (!ii) continue;

    const largura = Number(ii.width ?? 0);
    const url = String(ii.url ?? "");
    if (largura < 800) continue;
    if (!/\.(jpe?g|png)$/i.test(url)) continue;

    const titulo = String(p.title ?? "").replace(/^File:/, "");
    if (RUIM.test(titulo)) continue;

    const meta = (ii.extmetadata ?? {}) as Record<string, { value?: string }>;
    const licenca = (meta.LicenseShortName?.value ?? "").toLowerCase();
    if (!/cc0|public domain|^pd|cc by/.test(licenca)) continue;

    candidatas.push({
      titulo,
      thumb: String(ii.thumburl ?? url),
      credito: credito(meta),
      largura,
    });
    if (candidatas.length >= 12) break;
  }

  return { ok: true as const, candidatas };
}

/** Cliente já autenticado como o editor logado, do jeito que conferirAdmin devolve. */
type ClienteEditor = NonNullable<Awaited<ReturnType<typeof conferirAdmin>>>;

async function salvar(sb: ClienteEditor, origem: string, nomeBruto: string) {
  const nome = nomeBruto.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!origem || !nome) return { ok: false as const, erro: "Faltou a imagem ou o nome do arquivo." };
  // Só aceita origem do Commons: a rota baixa o que mandarem, e sem essa
  // trava ela viraria um buscador de URL arbitrária dentro do site.
  if (!/^https:\/\/upload\.wikimedia\.org\//.test(origem)) {
    return { ok: false as const, erro: "A imagem precisa vir do Wikimedia Commons." };
  }

  const r = await fetch(origem, { headers: { "User-Agent": UA }, redirect: "follow" });
  const tipo = r.headers.get("content-type") ?? "";
  if (!r.ok || !tipo.startsWith("image/")) {
    return { ok: false as const, erro: `Não consegui baixar a imagem (${r.status} ${tipo}).` };
  }

  const bytes = new Uint8Array(await r.arrayBuffer());
  const caminho = `news-img/${nome}.jpg`;

  const { error } = await sb.storage
    .from("sponsored")
    .upload(caminho, bytes, { contentType: tipo, cacheControl: "31536000", upsert: true });
  if (error) return { ok: false as const, erro: error.message };

  const { data } = sb.storage.from("sponsored").getPublicUrl(caminho);
  // O parâmetro de versão evita que o CDN sirva a imagem antiga quando o
  // editor troca a foto reaproveitando o mesmo nome de arquivo.
  return { ok: true as const, url: `${data.publicUrl}?v=${Date.now()}` };
}

export async function POST(req: Request) {
  const sb = await conferirAdmin(req);
  if (!sb) return Response.json({ ok: false, erro: "Sem permissão." }, { status: 403 });

  const corpo = await req.json().catch(() => null);
  if (!corpo) return Response.json({ ok: false, erro: "Requisição inválida." }, { status: 400 });

  try {
    if (corpo.acao === "buscar") {
      const termo = String(corpo.termo ?? "").trim();
      if (!termo) return Response.json({ ok: false, erro: "Escreva o que procurar." }, { status: 400 });
      return Response.json(await buscar(termo));
    }

    if (corpo.acao === "salvar") {
      return Response.json(await salvar(sb, String(corpo.origem ?? ""), String(corpo.nome ?? "")));
    }

    return Response.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
