import { NextResponse } from "next/server";
import { areasDe, podeArea } from "@/lib/gestao/acessos";
import { lerEquipe, lerPetshop } from "@/lib/gestao/reservado";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { contaLiberada } from "@/lib/gestao/assistente/conversa";
import { desfazerAcao } from "@/lib/gestao/assistente/automatico-servidor";
import type { Contexto } from "@/lib/gestao/assistente/ferramentas";
import { comRegistro } from "@/lib/gestao/erros-servidor";

export const runtime = "nodejs";

/**
 * Desfazer do modo automático do Mozart: { petshopId, acao } → { ok: true, titulo } ou { ok: false, mensagem }.
 * Confere quem pede (login, equipe, a área da ferramenta, a conta) e o banco desfaz com as regras dessa pessoa
 * (`mozart_desfazer`: só quem pediu ou o dono, 24 horas, nada mudado depois). Não chama o modelo: não conta no limite do dia.
 */
async function tratar(req: Request) {
  const erro = (status: number, mensagem: string) => NextResponse.json({ ok: false, mensagem }, { status });
  if (!configurado) return erro(503, "O sistema ainda não está ligado neste endereço.");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return erro(401, "Entre de novo para desfazer.");
  const corpo = (await req.json().catch(() => null)) as { petshopId?: string; acao?: string } | null;
  if (!corpo?.petshopId || !corpo.acao) return erro(400, "Pedido incompleto.");
  const sb = bancoDoUsuario(token);
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return erro(401, "Entre de novo para desfazer.");
  const [p, e, acesso] = await Promise.all([
    lerPetshop(sb, corpo.petshopId), lerEquipe(sb, corpo.petshopId),
    sb.rpc("acesso_liberado", { p: corpo.petshopId }).then((r) => r, () => ({ data: null, error: { message: "sem resposta" } })),
  ]);
  const eu = (e.data ?? []).find((x) => x.user_id === u.user!.id && x.ativo);
  if (!p.data || !eu) return erro(403, "Você não faz parte deste pet shop.");
  const c: Contexto = {
    sb, userId: u.user.id, petshop: p.data, eu, equipe: e.data ?? [], servicos: [],
    vejoFinanceiro: podeArea(eu, "caixa") || podeArea(eu, "financeiro") || podeArea(eu, "relatorios"),
    cuidoDoFinanceiro: podeArea(eu, "financeiro") || podeArea(eu, "relatorios"),
    areas: areasDe(eu), dono: eu.papel === "dono", fusoMin: 0, agora: new Date().toISOString().slice(0, 16),
  };
  const r = await desfazerAcao(c, String(corpo.acao), contaLiberada(acesso.error ? null : acesso.data, p.data));
  if (!r.ok) return NextResponse.json({ ok: false, mensagem: r.motivo }, { status: 200 });
  return NextResponse.json({ ok: true, titulo: r.titulo });
}

export const POST = comRegistro("/api/gestao/assistente/desfazer", tratar);
