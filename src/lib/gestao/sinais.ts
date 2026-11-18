import { lerConta, type ValoresDaEstadia } from "./hotel";
import { contando, lerTudo } from "./paginas";
import type { Banco } from "./supabase";
import { centavos as real } from "./util";

/**
 * Sinais da creche e do hotel num período (a mesma conta de Relatórios, cartão do hotel, e do Mozart, "quanto recebi de sinal?"):
 * - recebido: cada parte do sinal (ou do valor pago adiantado) conta no dia em que entrou. A conta do sinal é um lançamento;
 *   o que foi recebido dela em partes são lançamentos ligados a ela (`conta_id`), e a própria conta, quando quitada, guarda a
 *   última parte. Sinal que ficou sem a conta (ela foi apagada depois de recebida) vale o dia em que foi dado como pago;
 * - devolvido: as devoluções de sinal (cancelamento com "Devolver o sinal") pelo dia da devolução, mais o que sobrou do que
 *   foi pago antes e voltou ao tutor no check-out (`conta.sobra`);
 * - deixado de crédito para o tutor: o sinal da reserva cancelada que virou crédito e o que sobrou no check-out e ficou de
 *   crédito (as linhas de `clientes_creditos` ligadas a uma estadia, pelo dia em que o crédito foi deixado). O crédito ainda é
 *   do tutor: o Financeiro só conta quando ele usa;
 * - a receber agora: sinais ainda em A receber (pedido aceito, sinal combinado e não pago), com o total que falta.
 * `de` e `ate` são dias "AAAA-MM-DD" (os dois contam). `fusoMin`: o dia da conta do check-out no fuso do pet shop.
 */
export type SinaisDoPeriodo = {
  recebido: number; recebidos: number;
  devolvido: number; devolucoes: number;
  credito: number;
  /** Parte do crédito que veio do sinal de reservas canceladas (o resto sobrou no check-out). */
  creditoDoCancelamento: number; creditos: number;
  aReceber: number; aReceberN: number;
};

type Sinal = Pick<ValoresDaEstadia, "estadia_id" | "sinal" | "sinal_estado" | "sinal_pago_em" | "sinal_devolvido_em" | "sinal_devolucao_id" | "sinal_lancamento_id">;
const diaLocal = (iso: string, fusoMin: number) => new Date(new Date(iso).getTime() + fusoMin * 60000).toISOString().slice(0, 10);
const mais1 = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);

export async function lerSinaisDoPeriodo(sb: Banco, petshopId: string, de: string, ate: string, fusoMin = -180): Promise<SinaisDoPeriodo> {
  const desde = new Date(Date.parse(`${de}T00:00:00Z`) - 864e5).toISOString(), antesDe = new Date(Date.parse(`${mais1(ate)}T00:00:00Z`) + 864e5).toISOString();
  const [sinais, contas, creditos] = await Promise.all([
    lerTudo<Sinal>((a, b, contar) => sb.from("estadias_valores").select("estadia_id, sinal, sinal_estado, sinal_pago_em, sinal_devolvido_em, sinal_devolucao_id, sinal_lancamento_id", contando(contar))
      .eq("petshop_id", petshopId).not("sinal", "is", null).order("estadia_id").range(a, b)),
    // contas fechadas no período (com um dia de folga dos dois lados: o dia certo sai pelo fuso do pet shop)
    lerTudo<Pick<ValoresDaEstadia, "estadia_id" | "conta">>((a, b, contar) => sb.from("estadias_valores").select("estadia_id, conta", contando(contar)).eq("petshop_id", petshopId)
      .not("conta", "is", null).gte("conta->>quando", new Date(Date.parse(`${de}T00:00:00Z`) - 864e5).toISOString()).lt("conta->>quando", new Date(Date.parse(`${mais1(ate)}T00:00:00Z`) + 864e5).toISOString())
      .order("estadia_id").range(a, b)),
    // crédito deixado para o tutor numa estadia (sinal da reserva cancelada ou o que sobrou no check-out)
    lerTudo<{ id: string; estadia_id: string | null; valor: number; criado_em: string }>((a, b, contar) => sb.from("clientes_creditos").select("id, estadia_id, valor, criado_em", contando(contar))
      .eq("petshop_id", petshopId).not("estadia_id", "is", null).gt("valor", 0).gte("criado_em", desde).lt("criado_em", antesDe).order("id").range(a, b)),
  ]);
  const devolucoes = sinais.filter((s) => s.sinal_devolucao_id && s.sinal_devolvido_em && s.sinal_devolvido_em >= de && s.sinal_devolvido_em <= ate).map((s) => s.sinal_devolucao_id!);
  const dev = devolucoes.length ? (await sb.from("lancamentos").select("id, valor").eq("petshop_id", petshopId).in("id", devolucoes)).data ?? [] : [];
  const contasDoSinal = new Map(sinais.filter((x) => x.sinal_lancamento_id).map((x) => [x.sinal_lancamento_id!, x.estadia_id]));
  const idsDoSinal = [...contasDoSinal.keys()];
  const entrou = new Map<string, number>();
  let aReceber = 0, aReceberN = 0;
  for (let i = 0; i < idsDoSinal.length; i += 80) {
    const parte = idsDoSinal.slice(i, i + 80);
    const [quitadas, partes, abertas] = await Promise.all([
      sb.from("lancamentos").select("id, valor").eq("petshop_id", petshopId).eq("pago", true).gte("data", de).lte("data", ate).in("id", parte),
      sb.from("lancamentos").select("conta_id, valor").eq("petshop_id", petshopId).eq("pago", true).gte("data", de).lte("data", ate).in("conta_id", parte).limit(1000),
      sb.from("lancamentos").select("id, valor").eq("petshop_id", petshopId).eq("pago", false).in("id", parte),
    ]);
    for (const l of quitadas.data ?? []) { const e = contasDoSinal.get(l.id)!; entrou.set(e, real((entrou.get(e) ?? 0) + Number(l.valor))); }
    for (const l of partes.data ?? []) { const e = contasDoSinal.get(l.conta_id!)!; entrou.set(e, real((entrou.get(e) ?? 0) + Number(l.valor))); }
    for (const l of abertas.data ?? []) { aReceber = real(aReceber + Number(l.valor)); aReceberN++; }
  }
  for (const x of sinais) if (!x.sinal_lancamento_id && x.sinal_pago_em && x.sinal_pago_em >= de && x.sinal_pago_em <= ate) entrou.set(x.estadia_id, real(Number(x.sinal)));
  let devolvidoNaConta = 0, devolucoesNaConta = 0, credito = 0, creditoDoCancelamento = 0, nCreditos = 0;
  for (const v of contas) {
    const c = lerConta(v);
    if (!c) continue;
    const dia = diaLocal(c.quando, fusoMin);
    if (dia < de || dia > ate) continue;
    if (c.sobra?.destino === "devolvido") { devolvidoNaConta = real(devolvidoNaConta + c.sobra.valor); devolucoesNaConta++; }
  }
  const doPeriodo = creditos.filter((x) => { const dia = diaLocal(x.criado_em, fusoMin); return dia >= de && dia <= ate; });
  if (doPeriodo.length) {
    const ids = [...new Set(doPeriodo.map((x) => x.estadia_id!))];
    const canceladas = new Set<string>();
    for (let i = 0; i < ids.length; i += 80) {
      const r = await sb.from("estadias").select("id, status").eq("petshop_id", petshopId).in("id", ids.slice(i, i + 80));
      for (const e of r.data ?? []) if (e.status === "cancelada") canceladas.add(e.id);
    }
    for (const x of doPeriodo) {
      credito = real(credito + Number(x.valor)); nCreditos++;
      if (canceladas.has(x.estadia_id!)) creditoDoCancelamento = real(creditoDoCancelamento + Number(x.valor));
    }
  }
  return {
    recebido: real([...entrou.values()].reduce((t, n) => t + n, 0)),
    recebidos: [...entrou.values()].filter((n) => n > 0).length,
    devolvido: real(dev.reduce((t, l) => t + Number(l.valor), 0) + devolvidoNaConta),
    devolucoes: dev.length + devolucoesNaConta,
    credito, creditoDoCancelamento, creditos: nCreditos, aReceber, aReceberN,
  };
}
