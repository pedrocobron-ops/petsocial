import { NextResponse } from "next/server";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { bancoDeServico } from "@/lib/gestao/faxina";
import { comRegistro } from "@/lib/gestao/erros-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const json = (status: number, corpo: Record<string, unknown>) => NextResponse.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
type Rpc = (f: string, a?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * "Apagar o meu login": só para quem não está em nenhum pet shop (saiu da equipe, ou teve o acesso tirado).
 *
 * Quem decide é o banco (`meu_login_apagar`, migração 20261236), chamado com o login da própria pessoa: recusa quem ainda
 * abre um pet shop, não apaga login com dados em outro produto do mesmo projeto (fica anotado para a equipe) e põe os outros
 * na fila `logins_lixo`. Aqui, com a chave de serviço, o login sai do Auth na hora; sem ela (ou se falhar), fica na fila e a
 * faxina diária apaga. Devolve { ok, apagado } ou { ok: false, motivo: "outro_produto" }.
 */
async function tratar(req: Request) {
  if (!configurado) return json(503, { erro: "sem_banco", mensagem: "O sistema ainda não está ligado neste endereço." });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { erro: "sem_login", mensagem: "Entre de novo para apagar o login." });
  const sb = bancoDoUsuario(token);
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return json(401, { erro: "sem_login", mensagem: "Entre de novo para apagar o login." });

  const r = await (sb.rpc.bind(sb) as unknown as Rpc)("meu_login_apagar");
  if (r.error) return json(409, { erro: "recusado", mensagem: r.error.message });
  const d = (r.data ?? {}) as { ok?: boolean; motivo?: string };
  if (!d.ok) {
    return json(200, { ok: false, motivo: d.motivo ?? "outro_produto", mensagem: "Este login também é usado em outro produto nosso, então não foi apagado. A nossa equipe foi avisada e fala com você pelo e-mail da conta." });
  }

  // na hora, quando o servidor tem a chave de serviço. O banco confere de novo se o login continua solto e só do Gestão.
  let apagado = false;
  const svc = bancoDeServico();
  if (svc) {
    const rpc = svc.rpc.bind(svc) as unknown as Rpc;
    const fila = await rpc("gestao_logins_lixo", { p_limite: 500 });
    if (!fila.error && Array.isArray(fila.data) && (fila.data as string[]).includes(u.user.id)) {
      const del = await svc.auth.admin.deleteUser(u.user.id);
      apagado = !del.error;
      await rpc("gestao_login_lixo_feito", { p_user: u.user.id, p_ok: apagado, p_erro: del.error?.message ?? null });
    }
  }
  return json(200, { ok: true, apagado, mensagem: apagado ? "Seu login foi apagado." : "Pedido anotado. O seu login é apagado em até 1 dia." });
}

export const POST = comRegistro("/api/gestao/minha-conta/apagar", tratar);
