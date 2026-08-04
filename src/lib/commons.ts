import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Busca e salvamento de imagem do Wikimedia Commons.
 *
 * Só passa por aqui imagem que o jornal pode publicar sem risco de direito
 * autoral: domínio público, CC0 ou CC BY. O crédito do autor sai montado junto,
 * porque a licença CC BY exige atribuição e a legenda é onde ela aparece.
 *
 * Este módulo roda no servidor do site, que é quem tem saída para a internet.
 */

const UA = "MaestroPetJornal/1.0 (contato@maestropet.com)";

/** Títulos que não servem para jornalismo: gravura, pintura, mapa, diagrama. */
const RUIM =
  /engraving|lithograph|\bdrawing\b|sketch|\bmap\b|diagram|coat of arms|\bpainting\b|1[6789]\d\d|\blogo\b|poster|\bstamp\b|\bcoin\b|\bflag\b|emblem|statue|sculpture|cartoon|skull|x-ray|xray/i;

export interface Candidata {
  titulo: string;
  thumb: string;
  credito: string;
  largura: number;
}

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

export async function buscarNoCommons(termo: string): Promise<Candidata[]> {
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*" +
    "&generator=search&gsrnamespace=6&gsrlimit=40&gsrsearch=" +
    encodeURIComponent(termo) +
    "&prop=imageinfo&iiprop=url%7Csize%7Cextmetadata&iiurlwidth=1200";

  const r = await fetch(api, { headers: { "User-Agent": UA } });
  if (!r.ok) return [];
  const j = await r.json();

  const paginas = (Object.values(j?.query?.pages ?? {}) as Array<Record<string, unknown>>).sort(
    (a, b) => Number(a.index ?? 0) - Number(b.index ?? 0)
  );

  const candidatas: Candidata[] = [];

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

  return candidatas;
}

/**
 * Baixa a imagem escolhida e guarda no storage do jornal.
 * Devolve a URL pública, ou null se a origem não entregar uma imagem válida.
 */
export async function salvarNoStorage(
  sb: SupabaseClient,
  origem: string,
  nomeBruto: string
): Promise<string | null> {
  const nome = nomeBruto.toLowerCase().replace(/[^a-z0-9-]/g, "");
  // Trava de origem: a rota baixa o que mandarem, e sem isso ela viraria um
  // buscador de URL arbitrária hospedado dentro do site.
  if (!nome || !/^https:\/\/upload\.wikimedia\.org\//.test(origem)) return null;

  const r = await fetch(origem, { headers: { "User-Agent": UA }, redirect: "follow" });
  const tipo = r.headers.get("content-type") ?? "";
  if (!r.ok || !tipo.startsWith("image/")) return null;

  const bytes = new Uint8Array(await r.arrayBuffer());
  const caminho = `news-img/${nome}.jpg`;

  const { error } = await sb.storage
    .from("sponsored")
    .upload(caminho, bytes, { contentType: tipo, cacheControl: "31536000", upsert: true });
  if (error) return null;

  const { data } = sb.storage.from("sponsored").getPublicUrl(caminho);
  // O parâmetro de versão evita que o CDN sirva a imagem antiga quando o
  // editor troca a foto reaproveitando o mesmo nome de arquivo.
  return `${data.publicUrl}?v=${Date.now()}`;
}
