/**
 * Gatilho diário que preenche a imagem das matérias novas.
 *
 * Roda logo depois da rotina das 7h, para as matérias chegarem à mesa já
 * ilustradas em vez de esperarem alguém lembrar de buscar foto. O trabalho em
 * si acontece na Edge Function preencher-imagens, que vive na infraestrutura
 * do Supabase e tem saída para o Wikimedia Commons.
 *
 * Só entra imagem de domínio público, CC0 ou CC BY, com crédito do autor na
 * legenda. A fila é news_articles.cover_query, montada pela redação.
 *
 * Autorização: a chamada do agendador da Vercel traz o cabeçalho x-vercel-cron.
 * A chave também abre, para dar um jeito de rodar na mão quando precisar. O
 * alcance é pequeno de propósito: a rota não aceita entrada, só drena uma fila
 * que a redação já definiu.
 */

const FN = "https://aefrcwysifgniogumxwk.supabase.co/functions/v1/preencher-imagens";
const CHAVE = "mzt-img-9w2r5t-2026";

// Teto de tempo abaixo do limite da função, para responder antes de ser cortada.
const TETO_MS = 50_000;

export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daVercel = req.headers.get("x-vercel-cron") !== null;
  if (!daVercel && url.searchParams.get("key") !== CHAVE) {
    return Response.json({ ok: false, erro: "Sem permissão." }, { status: 403 });
  }

  const comecou = Date.now();
  let capas = 0;
  let fotos = 0;
  let restantes = 0;
  const semFoto: string[] = [];

  try {
    while (Date.now() - comecou < TETO_MS) {
      const r = await fetch(`${FN}?key=${CHAVE}&lote=3`);
      if (!r.ok) break;
      const j = await r.json();

      for (const f of j.feitas ?? []) {
        if (f.capa) capas++;
        else semFoto.push(f.slug);
        fotos += f.fotos ?? 0;
      }
      restantes = j.restantes ?? 0;
      if (!j.feitas?.length || restantes === 0) break;
    }
  } catch (e) {
    return Response.json({ ok: false, erro: String(e), capas, fotos }, { status: 500 });
  }

  return Response.json({ ok: true, capas, fotos, restantes, semFoto });
}
