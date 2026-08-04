import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { buscarNoCommons, salvarNoStorage } from "@/lib/commons";

/**
 * Busca manual de imagem, usada pelos botões da Redação.
 *
 * Por que existe uma rota aqui, e não só as Edge Functions: a busca precisa
 * sair para a internet, e quem tem saída livre é o servidor do site. O
 * navegador não serve (o Commons não libera CORS para a API de busca) e a
 * automação da rotina depende da rede do ambiente em que ela roda, que pode
 * estar restrita.
 *
 * A autorização é a mesma de /api/revalidar (token do editor mais is_admin()
 * no banco), e o upload usa o token do próprio usuário, exatamente como o
 * botão de subir imagem já faz pelo navegador. O filtro de licença e o
 * crédito ficam em lib/commons, compartilhados com a rotina em lote.
 */

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

export async function POST(req: Request) {
  const sb = await conferirAdmin(req);
  if (!sb) return Response.json({ ok: false, erro: "Sem permissão." }, { status: 403 });

  const corpo = await req.json().catch(() => null);
  if (!corpo) return Response.json({ ok: false, erro: "Requisição inválida." }, { status: 400 });

  try {
    if (corpo.acao === "buscar") {
      const termo = String(corpo.termo ?? "").trim();
      if (!termo) return Response.json({ ok: false, erro: "Escreva o que procurar." }, { status: 400 });
      return Response.json({ ok: true, candidatas: await buscarNoCommons(termo) });
    }

    if (corpo.acao === "salvar") {
      const url = await salvarNoStorage(sb, String(corpo.origem ?? ""), String(corpo.nome ?? ""));
      return url
        ? Response.json({ ok: true, url })
        : Response.json({ ok: false, erro: "Não consegui salvar essa imagem." });
    }

    return Response.json({ ok: false, erro: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    return Response.json({ ok: false, erro: String(e) }, { status: 500 });
  }
}
