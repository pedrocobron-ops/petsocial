import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { buscarNoCommons, salvarNoStorage } from "@/lib/commons";

/**
 * Preenche as imagens que faltam nas matérias, em lote.
 *
 * Por que existe: capa é obrigatória no jornal, e a busca de foto precisa sair
 * para o Wikimedia Commons. Quem tem saída garantida para a internet é o
 * servidor do site, não o ambiente onde a redação automática roda. Então a
 * escolha editorial fica gravada em news_articles.cover_query (e, para as fotos
 * de corpo, no termo que a própria matéria carrega na nota ao editor), e a
 * parte mecânica acontece aqui.
 *
 * Só entra imagem de domínio público, CC0 ou CC BY, com o crédito do autor
 * montado na legenda. O filtro de licença é feito em lib/commons.
 *
 * Trabalha em lotes pequenos porque baixar e subir imagem é lento, e função
 * serverless tem teto de tempo. A tela da Redação chama de novo até zerar.
 */

const LOTE_PADRAO = 3;

/** Marcador que a redação deixa no corpo quando falta foto naquele ponto. */
const NOTA_FOTO =
  /^> \*\*\[NOTA PARA O EDITOR, apagar antes de publicar\]\*\* Foto pendente neste ponto: (.+?)\. Use o botão 🔎 Buscar foto com o termo "(.+?)"\.$/gm;

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

type Cliente = NonNullable<Awaited<ReturnType<typeof conferirAdmin>>>;

/** Baixa a melhor candidata e devolve a URL já hospedada no jornal. */
async function resolverImagem(sb: Cliente, termo: string, nome: string, contexto: string) {
  const candidatas = await buscarNoCommons(termo);
  if (candidatas.length === 0) return null;

  // Ordena por aderência do título ao que a matéria pediu. Miniatura engana:
  // foto boa da espécie errada continua sendo foto errada, e o título é o
  // único sinal textual disponível para julgar isso sem olhar a imagem.
  const palavras = `${termo} ${contexto}`
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/)
    .filter((p) => p.length > 3);

  const ranqueadas = candidatas
    .map((c) => {
      const titulo = c.titulo.toLowerCase();
      const acertos = palavras.filter((p) => titulo.includes(p)).length;
      return { ...c, nota: acertos * 10 + Math.min(c.largura, 4000) / 1000 };
    })
    .sort((a, b) => b.nota - a.nota);

  for (const escolhida of ranqueadas.slice(0, 3)) {
    const salva = await salvarNoStorage(sb, escolhida.thumb, nome);
    if (salva) return { url: salva, credito: escolhida.credito, titulo: escolhida.titulo };
  }
  return null;
}

export async function POST(req: Request) {
  const sb = await conferirAdmin(req);
  if (!sb) return Response.json({ ok: false, erro: "Sem permissão." }, { status: 403 });

  const corpo = await req.json().catch(() => ({}));
  const lote = Math.min(Math.max(Number(corpo?.lote) || LOTE_PADRAO, 1), 5);

  // cover_query é a fila. Vale para matéria sem capa nenhuma e também para
  // matéria cuja capa veio do aplicativo antigo, sem autor e sem licença:
  // imagem de origem desconhecida é passivo, e trocar por uma do Commons,
  // com crédito, resolve o texto e a exposição de uma vez.
  //
  // Rascunho vem primeiro. Matéria que ainda não saiu é a que trava a
  // publicação; matéria antiga já está no ar e pode esperar a próxima volta.
  const colunas = "id, slug, title, body, cover_url, cover_query";
  const fila = (status?: string) => {
    const q = sb.from("news_articles").select(colunas).not("cover_query", "is", null);
    return (status ? q.eq("status", status) : q)
      .order("created_at", { ascending: true })
      .limit(lote);
  };

  let { data: pendentes, error } = await fila("draft");
  if (!error && (pendentes?.length ?? 0) === 0) ({ data: pendentes, error } = await fila());

  if (error) return Response.json({ ok: false, erro: error.message }, { status: 500 });

  const relatorio: Array<{ slug: string; capa: string | null; fotos: number; aviso?: string }> = [];

  for (const artigo of pendentes ?? []) {
    let capa: string | null = null;
    let aviso: string | undefined;

    const escolhida = await resolverImagem(
      sb,
      artigo.cover_query as string,
      `${artigo.slug}-capa`,
      artigo.title as string
    );

    if (escolhida) {
      capa = escolhida.titulo;
      await sb
        .from("news_articles")
        .update({ cover_url: escolhida.url, cover_caption: escolhida.credito, cover_query: null })
        .eq("id", artigo.id);
    } else {
      // Sai da fila mesmo sem achar foto, senão o lote seguinte pega a mesma
      // matéria e o botão gira em falso até bater o limite de voltas. O nome
      // dela vai no relatório para o editor tentar outro termo na mão.
      aviso = "Nenhuma candidata livre de direitos para este termo.";
      await sb.from("news_articles").update({ cover_query: null }).eq("id", artigo.id);
    }

    // Fotos do corpo: cada nota ao editor traz o termo que a redação escolheu.
    let corpoNovo = artigo.body as string;
    let fotos = 0;
    const notas = [...(artigo.body as string).matchAll(NOTA_FOTO)];

    for (const [linhaInteira, descricao, termo] of notas) {
      const foto = await resolverImagem(
        sb,
        termo,
        `${artigo.slug}-foto${fotos + 1}`,
        descricao
      );
      if (!foto) continue;
      corpoNovo = corpoNovo.replace(
        linhaInteira,
        `![${descricao}. ${foto.credito}](${foto.url})`
      );
      fotos += 1;
    }

    if (fotos > 0) {
      await sb.from("news_articles").update({ body: corpoNovo }).eq("id", artigo.id);
    }

    relatorio.push({ slug: artigo.slug as string, capa, fotos, aviso });
  }

  const { count } = await sb
    .from("news_articles")
    .select("id", { count: "exact", head: true })
    .not("cover_query", "is", null);

  return Response.json({ ok: true, processadas: relatorio, restantes: count ?? 0 });
}
