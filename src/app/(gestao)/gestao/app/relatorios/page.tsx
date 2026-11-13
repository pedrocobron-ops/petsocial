"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleCheck, Clock, CreditCard, Download, HandCoins, Home, Moon, PawPrint, Printer, Receipt, Scissors, Sun, TrendingUp, UserPlus, Users, UserX } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPessoa, AvatarPet, Esqueleto, useAvisos, useDados, Vazio } from "@/components/gestao/ui";
import { baixarPlanilha, brlMini, Chips, COR_FORMA, dinheiroCsv, ErroDeCarga, numeroCsv, PALETA, paginar, SemAcesso, somaPorForma, type Cel } from "@/components/gestao/financeiro/comum";
import { Anel, Barras, Kpi, Rosca, Tile } from "@/components/gestao/painel";
import { partesDoLancamento, percentuaisQueFecham } from "@/lib/gestao/dinheiro";
import type { Banco } from "@/lib/gestao/supabase";
import { FORMAS } from "@/lib/gestao/tipos";
import { brl, dataCompleta, dataCurta, deIsoDia, inicioDaSemana, inicioDoDia, isoDia, nomeDiaCurto, somaDias } from "@/lib/gestao/util";
import "./relatorios.css";

export default function PaginaRelatorios() {
  const { vejoFinanceiro } = useGestao();
  return vejoFinanceiro ? <Relatorios /> : <SemAcesso />;
}

const PERIODOS = [
  { id: "semana", rotulo: "Esta semana" },
  { id: "mes", rotulo: "Este mês" },
  { id: "mes_passado", rotulo: "Mês passado" },
  { id: "90", rotulo: "Últimos 90 dias" },
  { id: "livre", rotulo: "Personalizado" },
] as const;
/** Maior período aceito nas datas livres. */
const MAX_DIAS = 366;
type Periodo = (typeof PERIODOS)[number]["id"];

/** Primeiro e último dia do período (os dois entram na conta). */
function intervalo(p: Exclude<Periodo, "livre">, hoje: Date): { de: Date; ate: Date } {
  if (p === "semana") { const de = inicioDaSemana(hoje); return { de, ate: somaDias(de, 6) }; }
  if (p === "mes") return { de: new Date(hoje.getFullYear(), hoje.getMonth(), 1), ate: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0) };
  if (p === "mes_passado") return { de: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), ate: new Date(hoje.getFullYear(), hoje.getMonth(), 0) };
  return { de: somaDias(inicioDoDia(hoje), -89), ate: inicioDoDia(hoje) };
}

/**
 * Período logo antes do escolhido, com o mesmo tamanho. Mês inteiro compara com o mês inteiro anterior;
 * nos outros, os mesmos dias contados para trás a partir da véspera do começo.
 */
function periodoAnterior(p: Periodo, de: Date, ate: Date): { de: Date; ate: Date } {
  if (p === "mes" || p === "mes_passado") return { de: new Date(de.getFullYear(), de.getMonth() - 1, 1), ate: new Date(de.getFullYear(), de.getMonth(), 0) };
  const dias = Math.round((ate.getTime() - de.getTime()) / 864e5) + 1;
  return { de: somaDias(de, -dias), ate: somaDias(de, -1) };
}

type Ag = {
  id: string; inicio: string; status: string; preco: number | null; pet_id: string; servico_id: string | null; profissional_id: string | null; pacote_cliente_id: string | null;
  pets: { id: string; nome: string; foto: string | null; especie: string | null; clientes: { id: string; nome: string } | null } | null;
  servicos: { id: string; nome: string; cor: string | null } | null;
};
type Entrada = { id: string; data: string; valor: number; cliente_id: string | null; agendamento_id: string | null; itens: unknown; forma: string | null; pagamentos: unknown };
/** Conta de um atendimento (uma por atendimento): já recebida, ou anotada para o cliente pagar depois (`pago: false`). */
type Recebimento = { agendamento_id: string | null; valor: number; itens: unknown; pago?: boolean };

/**
 * Quanto foi realmente cobrado pelo serviço de um atendimento concluído:
 * - com recebimento lançado: a parte de serviço da conta, com o desconto rateado (sem itens, o valor recebido);
 * - conta que o cliente paga depois (fiado): a mesma conta, pelo valor cobrado, mesmo sem o dinheiro ter entrado;
 * - pago com pacote: nada (o dinheiro entrou na venda do pacote);
 * - sem recebimento ainda: o preço combinado na agenda.
 */
function cobradoDe(a: Pick<Ag, "preco" | "pacote_cliente_id">, recebimento: Recebimento | undefined): { valor: number; como: "recebido" | "fiado" | "pacote" | "agenda" } {
  if (recebimento) return { valor: partesDoLancamento(recebimento)?.servico ?? Number(recebimento.valor), como: recebimento.pago === false ? "fiado" : "recebido" };
  if (a.pacote_cliente_id) return { valor: 0, como: "pacote" };
  return { valor: Number(a.preco ?? 0), como: "agenda" };
}

/**
 * A conta de cada atendimento concluído: a entrada recebida no período, se houver; senão a conta dele em qualquer data
 * (paga em outro dia, ou ainda a receber porque o cliente paga depois).
 */
async function contasDosAtendimentos(sb: Banco, petshopId: string, concluidos: string[], entradas: Recebimento[]) {
  const recebimentos = new Map<string, Recebimento>();
  for (const l of entradas) if (l.agendamento_id) recebimentos.set(l.agendamento_id, l);
  const sem = concluidos.filter((id) => !recebimentos.has(id));
  const blocos: string[][] = [];
  for (let i = 0; i < sem.length; i += 150) blocos.push(sem.slice(i, i + 150));
  for (let i = 0; i < blocos.length; i += 4) {
    const respostas = await Promise.all(blocos.slice(i, i + 4).map((ids) =>
      sb.from("lancamentos").select("agendamento_id, valor, itens, pago").eq("petshop_id", petshopId).eq("tipo", "entrada").in("agendamento_id", ids)));
    for (const r of respostas) {
      if (r.error) throw new Error(r.error.message);
      for (const l of r.data ?? []) if (l.agendamento_id) recebimentos.set(l.agendamento_id, l);
    }
  }
  return recebimentos;
}

/** Valor médio cobrado por atendimento concluído; quem pagou com pacote fica de fora da conta. */
function valorMedio(concluidos: Pick<Ag, "id" | "preco" | "pacote_cliente_id">[], recebimentos: Map<string, Recebimento>): number | null {
  let soma = 0, pagantes = 0;
  for (const a of concluidos) {
    const c = cobradoDe(a, recebimentos.get(a.id));
    if (c.como !== "pacote") pagantes++;
    soma += c.valor;
  }
  return pagantes ? real(real(soma) / pagantes) : null;
}

/** Os quatro números do período anterior, com as mesmas contas do período escolhido. */
async function carregarAnterior(sb: Banco, petshopId: string, de: Date, ate: Date) {
  const comeco = de.toISOString(), final = somaDias(ate, 1).toISOString();
  const [ags, entradas, novos] = await Promise.all([
    paginar<Pick<Ag, "id" | "preco" | "pacote_cliente_id">>((a, b) => sb.from("agendamentos").select("id, preco, pacote_cliente_id")
      .eq("petshop_id", petshopId).eq("status", "concluido").gte("inicio", comeco).lt("inicio", final).order("inicio").order("id").range(a, b)),
    paginar<Recebimento>((a, b) => sb.from("lancamentos").select("agendamento_id, valor, itens").eq("petshop_id", petshopId).eq("pago", true).eq("tipo", "entrada")
      .is("movimento", null).gte("data", isoDia(de)).lte("data", isoDia(ate)).order("data").order("id").range(a, b)),
    sb.from("clientes").select("id", { count: "exact", head: true }).eq("petshop_id", petshopId).gte("criado_em", comeco).lt("criado_em", final),
  ]);
  if (novos.error) throw new Error(novos.error.message);
  const recebimentos = await contasDosAtendimentos(sb, petshopId, ags.map((a) => a.id), entradas);
  return {
    faturamento: real(entradas.reduce((s, l) => s + Number(l.valor), 0)),
    concluidos: ags.length,
    ticket: valorMedio(ags, recebimentos),
    clientesNovos: novos.count ?? 0,
  };
}

/** Estadia de creche ou hotel encerrada (a saída é a data que vale para o período). */
type EstadiaRel = { id: string; tipo: string; entrada: string; saida: string | null; diarias_cobradas: number | null; valor_cobrado: number | null; obs: string | null; mensalista?: string | null };
/** A mesma nota que o check-out de Creche e hotel grava na observação quando a saída é com pacote. */
const NOTA_PACOTE = "Saiu usando o pacote.";
/** A mesma conta de Creche e hotel: hotel cobra por noite; creche, por dia em que o pet esteve aqui. Sempre pelo menos 1. */
function contarDiarias(e: Pick<EstadiaRel, "tipo" | "entrada">, fim: Date) {
  const dias = Math.round((inicioDoDia(fim).getTime() - inicioDoDia(new Date(e.entrada)).getTime()) / 864e5);
  return Math.max(1, e.tipo === "hotel" ? dias : dias + 1);
}
const TIPOS_ESTADIA = [{ id: "creche", nome: "Creche", icone: Sun }, { id: "hotel", nome: "Hotel", icone: Moon }] as const;

/** Resumo das estadias encerradas de um tipo, como o Histórico de Creche e hotel mostra cada uma. */
function resumoEstadias(lista: EstadiaRel[]) {
  const x = { n: lista.length, diarias: 0, valor: 0, comValor: 0, pacote: 0, cortesia: 0, semValor: 0, estimadas: 0, mensalistas: 0 };
  for (const e of lista) {
    if (e.diarias_cobradas == null) {
      // estadia antiga, sem o que foi cobrado: diárias pelas datas, sem valor
      x.diarias += contarDiarias(e, new Date(e.saida ?? e.entrada));
      x.estimadas++;
      continue;
    }
    x.diarias += e.diarias_cobradas;
    // dia de mensalista: coberto pela mensalidade (ou cobrado como dia extra na cobrança do mês)
    if (e.mensalista) x.mensalistas++;
    else if (e.obs?.includes(NOTA_PACOTE)) x.pacote++;
    else if (e.valor_cobrado == null) x.semValor++;
    else if (Number(e.valor_cobrado) === 0) x.cortesia++;
    else { x.comValor++; x.valor = real(x.valor + Number(e.valor_cobrado)); }
  }
  return x;
}

const DIAS_DA_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const DIAS_CURTOS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const real = (n: number) => Math.round(n * 100) / 100;
const vezes = (n: number) => (n === 1 ? "1 vez" : `${n} vezes`);
const atendimentos = (n: number) => (n === 1 ? "1 atendimento" : `${n} atendimentos`);

function Relatorios() {
  const { sb, petshop, equipe } = useGestao();
  const { avisar } = useAvisos();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const hojeIso = isoDia(new Date());
  // datas livres: começam no mês até hoje; só valem quando estão certas (ordem e no máximo 366 dias)
  const [livreDe, setLivreDe] = useState(() => `${hojeIso.slice(0, 8)}01`);
  const [livreAte, setLivreAte] = useState(hojeIso);
  const [livreValido, setLivreValido] = useState(() => ({ de: `${hojeIso.slice(0, 8)}01`, ate: hojeIso }));
  const erroLivre = erroDasDatas(livreDe, livreAte);
  function mudarLivre(deNovo: string, ateNovo: string) {
    setLivreDe(deNovo); setLivreAte(ateNovo);
    if (!erroDasDatas(deNovo, ateNovo)) setLivreValido({ de: deNovo, ate: ateNovo });
  }
  const { de, ate } = useMemo(
    () => (periodo === "livre" ? { de: deIsoDia(livreValido.de), ate: deIsoDia(livreValido.ate) } : intervalo(periodo, deIsoDia(hojeIso))),
    [periodo, hojeIso, livreValido]);
  const deIso = isoDia(de), ateIso = isoDia(ate);
  const antes = useMemo(() => periodoAnterior(periodo, de, ate), [periodo, de, ate]);
  const antesDeIso = isoDia(antes.de), antesAteIso = isoDia(antes.ate);
  const nomeDoPeriodo = periodo === "livre" ? `De ${dataCompleta(de)} a ${dataCompleta(ate)}` : PERIODOS.find((p) => p.id === periodo)?.rotulo ?? "";

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const comeco = de.toISOString();
    const final = somaDias(ate, 1).toISOString();
    const [ags, entradas, novos, estadias, anterior] = await Promise.all([
      paginar<Ag>(async (a, b) => {
        const r = await sb.from("agendamentos")
          .select("id, inicio, status, preco, pet_id, servico_id, profissional_id, pacote_cliente_id, pets(id, nome, foto, especie, clientes(id, nome)), servicos(id, nome, cor)")
          .eq("petshop_id", petshop.id).gte("inicio", comeco).lt("inicio", final).order("inicio").order("id").range(a, b);
        return { data: r.data as unknown as Ag[] | null, error: r.error };
      }),
      paginar<Entrada>((a, b) => sb.from("lancamentos").select("id, data, valor, cliente_id, agendamento_id, itens, forma, pagamentos").eq("petshop_id", petshop.id).eq("pago", true).eq("tipo", "entrada")
        .is("movimento", null).gte("data", deIso).lte("data", ateIso).order("data").order("id").range(a, b)),
      sb.from("clientes").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).gte("criado_em", comeco).lt("criado_em", final),
      // creche e hotel: estadias encerradas, pela data da saída
      paginar<EstadiaRel>((a, b) => sb.from("estadias").select("id, tipo, entrada, saida, diarias_cobradas, valor_cobrado, obs, mensalista").eq("petshop_id", petshop.id).eq("status", "encerrada")
        .gte("saida", comeco).lt("saida", final).order("saida").order("id").range(a, b)),
      carregarAnterior(sb, petshop.id, antes.de, antes.ate),
    ]);
    if (novos.error) throw new Error(novos.error.message);
    // conta de cada atendimento concluído do período: paga em outro dia (fora do período) ou ainda a receber (cliente paga depois)
    const recebimentos = await contasDosAtendimentos(sb, petshop.id, ags.filter((a) => a.status === "concluido").map((a) => a.id), entradas);
    return { ags, entradas, recebimentos, clientesNovos: novos.count ?? 0, estadias, anterior };
  }, [petshop.id, deIso, ateIso, antesDeIso, antesAteIso]);

  const r = useMemo(() => {
    if (!dados) return null;
    const concluidos = dados.ags.filter((a) => a.status === "concluido");
    const faltas = dados.ags.filter((a) => a.status === "faltou").length;
    // valor realmente cobrado de cada atendimento concluído (não o preço combinado na agenda)
    const cobrado = new Map(concluidos.map((a) => [a.id, cobradoDe(a, dados.recebimentos.get(a.id))]));
    const valorDe = (a: Ag) => cobrado.get(a.id)?.valor ?? 0;
    const pagoComPacote = (a: Ag) => cobrado.get(a.id)?.como === "pacote";
    const comPacote = concluidos.filter(pagoComPacote).length;
    const aReceber = concluidos.filter((a) => cobrado.get(a.id)?.como === "agenda" && Number(a.preco ?? 0) > 0).length;
    // contas que o cliente ficou de pagar depois: o serviço conta como feito, o dinheiro ainda não entrou
    const fiados = concluidos.filter((a) => cobrado.get(a.id)?.como === "fiado");
    const valorFiado = real(fiados.reduce((s, a) => s + Number(dados.recebimentos.get(a.id)?.valor ?? 0), 0));
    // por forma de pagamento: o pagamento dividido entra repartido
    const porFormaMapa = somaPorForma(dados.entradas);
    const porForma = FORMAS.map((f) => ({ id: f.id as string, rotulo: f.rotulo as string, valor: porFormaMapa.get(f.id) ?? 0, cor: COR_FORMA[f.id] })).filter((f) => f.valor > 0);
    const ticket = valorMedio(concluidos, dados.recebimentos);
    // quanto cada tutor gastou no período: todas as entradas recebidas ligadas a ele (a mesma conta de "Já gastou aqui" na ficha)
    const gastoDoTutor = new Map<string, number>();
    for (const l of dados.entradas) if (l.cliente_id) gastoDoTutor.set(l.cliente_id, real((gastoDoTutor.get(l.cliente_id) ?? 0) + Number(l.valor)));
    const faturamento = real(dados.entradas.reduce((s, l) => s + Number(l.valor), 0));

    // faturamento por dia, ou por semana quando o período é comprido
    const dias = Math.round((ate.getTime() - de.getTime()) / 864e5) + 1;
    const porSemana = dias > 45;
    const barras = Array.from({ length: porSemana ? Math.ceil(dias / 7) : dias }, (_, i) => {
      const dia = somaDias(de, porSemana ? i * 7 : i);
      return { dia, valor: 0 };
    });
    for (const l of dados.entradas) {
      const n = Math.round((deIsoDia(l.data).getTime() - de.getTime()) / 864e5);
      const b = barras[porSemana ? Math.floor(n / 7) : n];
      if (b) b.valor = real(b.valor + Number(l.valor));
    }

    const contar = <T,>(lista: Ag[], chave: (a: Ag) => string | null | undefined, extra: (a: Ag) => T) => {
      const mapa = new Map<string, { chave: string; n: number; valor: number; pacote: number; extra: T }>();
      for (const a of lista) {
        const k = chave(a);
        if (!k) continue;
        const x = mapa.get(k) ?? { chave: k, n: 0, valor: 0, pacote: 0, extra: extra(a) };
        x.n++;
        x.valor = real(x.valor + valorDe(a));
        if (pagoComPacote(a)) x.pacote++;
        mapa.set(k, x);
      }
      return [...mapa.values()].sort((a, b) => b.n - a.n || b.valor - a.valor);
    };
    const usadas = new Set<string>();
    const servicosTodos = contar(concluidos, (a) => a.servico_id ?? "sem", (a) => ({ nome: a.servicos?.nome ?? "Sem serviço escolhido", cor: a.servicos?.cor ?? null }));
    const servicos = servicosTodos.slice(0, 8)
      .map((s) => {
        // cada fatia com uma cor só dela: a do serviço, ou a próxima livre da paleta
        const cor = s.extra.cor && !usadas.has(s.extra.cor) ? s.extra.cor : PALETA.find((c) => !usadas.has(c)) ?? "#a39a90";
        usadas.add(cor);
        return { n: s.n, valor: s.valor, pacote: s.pacote, extra: s.extra.nome, cor };
      });
    const pets = contar(concluidos, (a) => a.pet_id, (a) => a.pets).slice(0, 5);
    const tutoresTodos = contar(concluidos, (a) => a.pets?.clientes?.id, (a) => a.pets?.clientes?.nome ?? "")
      .map((t) => ({ ...t, valor: gastoDoTutor.get(t.chave) ?? 0 }));
    const tutores = tutoresTodos.slice(0, 5);

    // comissão: sobre o que foi cobrado pelo serviço; atendimento pago com pacote conta pelo preço do serviço na agenda
    const comissoes = equipe.filter((p) => Number(p.comissao_pct) > 0).map((p) => {
      const dele = concluidos.filter((a) => a.profissional_id === p.id);
      const base = real(dele.reduce((s, a) => s + (pagoComPacote(a) ? Number(a.preco ?? 0) : valorDe(a)), 0));
      return { p, n: dele.length, pacote: dele.filter(pagoComPacote).length, base, comissao: real((base * Number(p.comissao_pct)) / 100) };
    }).filter((c) => c.p.ativo || c.n > 0).sort((a, b) => b.comissao - a.comissao);

    // movimento: tudo que foi marcado e não foi cancelado
    const marcados = dados.ags.filter((a) => a.status !== "cancelado");
    const porDia = DIAS_DA_SEMANA.map((nome) => ({ nome, n: 0 }));
    const porHora = new Map<number, number>();
    for (const a of marcados) {
      const d = new Date(a.inicio);
      porDia[(d.getDay() + 6) % 7].n++;
      porHora.set(d.getHours(), (porHora.get(d.getHours()) ?? 0) + 1);
    }
    const horas = [...porHora].map(([h, n]) => ({ h, n })).sort((a, b) => b.n - a.n || a.h - b.h).slice(0, 3);

    const comEntrada = barras.filter((b) => b.valor > 0);
    const melhor = comEntrada.reduce<{ dia: Date; valor: number } | null>((m, b) => (!m || b.valor > m.valor ? b : m), null);
    const diaCheio = porDia.reduce((m, d, i) => (d.n > porDia[m].n ? i : m), 0);

    const estadias = TIPOS_ESTADIA.map((t) => ({ ...t, ...resumoEstadias(dados.estadias.filter((e) => e.tipo === t.id)) }));

    return {
      comEntrada: comEntrada.length, melhor, diaCheio,
      totalComissao: real(comissoes.reduce((s, c) => s + c.comissao, 0)),
      concluidos: concluidos.length, faltas, taxaFalta: concluidos.length + faltas ? (faltas / (concluidos.length + faltas)) * 100 : null,
      faturamento, ticket, comPacote, aReceber, fiados: fiados.length, valorFiado, porForma,
      barras, porSemana, servicos, servicosTodos, pets, tutores, tutoresTodos, comissoes, porDia, horas, marcados: marcados.length,
      estadias, totalEstadias: dados.estadias.length,
    };
  }, [dados, de, ate, equipe]);

  /** Planilha do período: resumo, serviços, comissão, formas de pagamento e tutores. */
  function exportar() {
    if (!r || !dados) return;
    const t: Cel[][] = [
      ["Relatório", petshop.nome],
      ["Período", `${dataCompleta(de)} a ${dataCompleta(ate)}`],
      [],
      ["Resumo do período"],
      ["Faturamento (entradas já recebidas)", dinheiroCsv(r.faturamento)],
      ["A receber de atendimentos do período (cliente paga depois)", dinheiroCsv(r.valorFiado)],
      ["Contas a receber de atendimentos do período", numeroCsv(r.fiados)],
      ["Atendimentos concluídos", numeroCsv(r.concluidos)],
      ["Faltas", numeroCsv(r.faltas)],
      ["Atendimentos pagos com pacote", numeroCsv(r.comPacote)],
      ["Valor médio por atendimento", r.ticket == null ? "" : dinheiroCsv(r.ticket)],
      ["Clientes novos", numeroCsv(dados.clientesNovos)],
      ["Comissão total", dinheiroCsv(r.totalComissao)],
      [],
      ["Período anterior", `${dataCompleta(antes.de)} a ${dataCompleta(antes.ate)}`],
      ["Faturamento (entradas já recebidas)", dinheiroCsv(dados.anterior.faturamento)],
      ["Atendimentos concluídos", numeroCsv(dados.anterior.concluidos)],
      ["Valor médio por atendimento", dados.anterior.ticket == null ? "" : dinheiroCsv(dados.anterior.ticket)],
      ["Clientes novos", numeroCsv(dados.anterior.clientesNovos)],
      [],
      ...(r.totalEstadias ? [
        ["Creche e hotel (estadias encerradas no período; o valor recebido já está no faturamento)"],
        ["Tipo", "Estadias", "Diárias", "Valor cobrado", "Com pacote", "Cortesia", "Sem valor lançado", "Antigas (diárias pelas datas)"],
        ...r.estadias.map((x): Cel[] => [x.nome, numeroCsv(x.n), numeroCsv(x.diarias), dinheiroCsv(x.valor), numeroCsv(x.pacote), numeroCsv(x.cortesia), numeroCsv(x.semValor), numeroCsv(x.estimadas)]),
        [],
      ] satisfies Cel[][] : []),
      ["Serviços mais feitos"],
      ["Serviço", "Vezes", "Com pacote", "Valor cobrado"],
      ...r.servicosTodos.map((x): Cel[] => [x.extra.nome, numeroCsv(x.n), numeroCsv(x.pacote), dinheiroCsv(x.valor)]),
      [],
      ["Comissão por profissional"],
      ["Profissional", "Atendimentos", "Com pacote", "Base", "Percentual", "Comissão"],
      ...r.comissoes.map((c): Cel[] => [c.p.nome, numeroCsv(c.n), numeroCsv(c.pacote), dinheiroCsv(c.base), numeroCsv(Number(c.p.comissao_pct)), dinheiroCsv(c.comissao)]),
      [],
      ["Por forma de pagamento (entradas recebidas)"],
      ["Forma", "Valor"],
      ...r.porForma.map((f): Cel[] => [f.rotulo, dinheiroCsv(f.valor)]),
      ["Total", dinheiroCsv(r.faturamento)],
      [],
      ["Tutores que mais vieram"],
      ["Tutor", "Vezes", "Com pacote", "Pagou no período"],
      ...r.tutoresTodos.map((x): Cel[] => [x.extra, numeroCsv(x.n), numeroCsv(x.pacote), dinheiroCsv(x.valor)]),
    ];
    baixarPlanilha(t, `relatorio-${deIso}-a-${ateIso}.csv`);
    avisar("Planilha baixada.");
  }

  const semNada = r && !r.marcados && !r.faturamento && !dados?.clientesNovos && !r.faltas && !r.totalEstadias;
  const emAndamento = ateIso >= hojeIso && deIso <= hojeIso;

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Relatórios</h1>
          <p className="g-muted">De {dataCompleta(de)} a {dataCompleta(ate)}</p>
        </div>
        <div className="g-acoes">
          <button className="g-btn sec" onClick={exportar} disabled={!r || !dados || carregando} title="Baixar os números deste período em planilha"><Download />Exportar</button>
          <button className="g-btn sec" onClick={() => window.print()}><Printer />Imprimir</button>
        </div>
      </header>

      <div className="g-pilha">
        <div className="gf-rola gf-nao-imprime">
          <Chips opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} rotulo="Período" />
        </div>
        {periodo === "livre" && (
          <div className="g-rel-livre gf-nao-imprime">
            <label className="g-campo"><span>De</span>
              <input type="date" className="g-input" value={livreDe} max={livreAte || undefined} aria-invalid={erroLivre ? true : undefined} onChange={(e) => mudarLivre(e.target.value, livreAte)} />
            </label>
            <label className="g-campo"><span>Até</span>
              <input type="date" className="g-input" value={livreAte} min={livreDe || undefined} aria-invalid={erroLivre ? true : undefined} onChange={(e) => mudarLivre(livreDe, e.target.value)} />
            </label>
            {erroLivre && <p className="g-rel-livre-erro" role="alert">{erroLivre} Mostrando de {dataCompleta(de)} a {dataCompleta(ate)}.</p>}
          </div>
        )}
        <p className="gf-so-papel g-p">{petshop.nome} · {nomeDoPeriodo}</p>

        {erro && <ErroDeCarga erro={erro} tentar={recarregar} />}
        {carregando || !r || !dados ? (erro ? null : <Esqueleto linhas={5} />) : semNada ? (
          <Vazio titulo="Nada por aqui neste período." texto="Quando houver atendimentos e pagamentos, os números aparecem aqui." />
        ) : (
          <>
            <div className="g-grade kpis">
              <Kpi icone={CircleCheck} tom="pessego" rotulo="Atendimentos concluídos" valor={r.concluidos}
                apoio={<Apoio texto={r.taxaFalta == null ? "nenhum no período" : `${(100 - r.taxaFalta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% compareceram`}
                  atual={r.concluidos} anterior={dados.anterior.concluidos} />}
                lado={r.taxaFalta == null ? undefined : <Anel parte={1 - r.taxaFalta / 100} cor="var(--g-laranja)">{Math.round(100 - r.taxaFalta)}%</Anel>} />
              <Kpi icone={UserX} tom="rosa" rotulo="Faltas" valor={r.faltas}
                apoio={r.taxaFalta == null ? "nenhuma falta" : `${r.taxaFalta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de falta`} />
              <Kpi icone={Receipt} tom="ceu" rotulo="Valor médio por atendimento" valor={<span className="gf-kpi-v">{r.ticket == null ? "—" : brl(r.ticket)}</span>}
                apoio={<Apoio texto={r.comPacote ? `cobrado · fora ${r.comPacote} com pacote` : "valor cobrado, com desconto"}
                  atual={r.ticket} anterior={dados.anterior.ticket} formato={brl} />} />
              <Kpi icone={UserPlus} tom="lilas" rotulo="Clientes novos" valor={dados.clientesNovos}
                apoio={<Apoio texto={dados.clientesNovos === 1 ? "cadastrado no período" : "cadastrados no período"} atual={dados.clientesNovos} anterior={dados.anterior.clientesNovos} />} />
            </div>
            <p className="g-muted g-pp g-rel-antes">
              Período anterior: de {dataCompleta(antes.de)} a {dataCompleta(antes.ate)}.{emAndamento && " O período escolhido ainda não terminou, então a comparação pode mudar."}
            </p>

            <div className="g-duas">
              <section className="g-card g-rel-fat">
                <div className="g-card-t">
                  <h3><Tile icone={TrendingUp} tom="menta" tamanho="p" />Faturamento por {r.porSemana ? "semana" : "dia"}</h3>
                  <span className="g-muted g-pp">entradas já recebidas</span>
                </div>
                <p className="g-rotulo">Faturamento</p>
                <p className="g-rel-total">{brl(r.faturamento)}</p>
                <Comparacao atual={r.faturamento} anterior={dados.anterior.faturamento} formato={brl} longo />
                {r.faturamento > 0 ? (
                  <>
                    {r.barras.length <= 7
                      ? <Barras itens={r.barras.map((b) => ({ rotulo: nomeDiaCurto(b.dia), valor: b.valor }))} formato={brlMini} altura={176}
                          destaque={r.barras.findIndex((b) => isoDia(b.dia) === hojeIso)} />
                      : <Area pontos={r.barras} porSemana={r.porSemana} />}
                    <div className="g-rel-fatos">
                      {r.melhor && (
                        <div><small>{r.porSemana ? "Melhor semana" : "Melhor dia"}</small><b>{brl(r.melhor.valor)}</b><small>{r.porSemana ? `semana de ${dataCurta(r.melhor.dia)}` : dataCurta(r.melhor.dia)}</small></div>
                      )}
                      <div><small>{r.porSemana ? "Semanas com entrada" : "Dias com entrada"}</small><b>{r.comEntrada} de {r.barras.length}</b><small>no período</small></div>
                    </div>
                  </>
                ) : <p className="g-muted g-p" style={{ marginTop: 10 }}>Nenhuma entrada recebida neste período.</p>}
                {r.fiados > 0 && (
                  <p className="g-rel-areceber">
                    <HandCoins aria-hidden />
                    <span><b>{brl(r.valorFiado)} a receber</b> de {r.fiados === 1 ? "1 atendimento" : `${r.fiados} atendimentos`} deste período que o cliente ficou de pagar depois. Não está no faturamento: entra quando você der baixa em Financeiro, A receber.</span>
                  </p>
                )}
                {r.porForma.length > 0 && (
                  <div className="g-rel-formas">
                    <p className="g-rotulo"><CreditCard size={14} aria-hidden /> Por forma de pagamento</p>
                    <div className="g-legenda">
                      {r.porForma.map((f, i, todas) => (
                        <div key={f.id}><i style={{ background: f.cor }} /><span>{f.rotulo} <span className="g-muted g-pp">{percentuaisQueFecham(todas.map((x) => x.valor))[i]}%</span></span><b>{brl(f.valor)}</b></div>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={CalendarDays} tom="pessego" tamanho="p" />Dias mais cheios</h3><span className="g-muted g-pp">por dia da semana</span></div>
                {r.marcados ? (
                  <>
                    <div title={r.porDia.map((d) => `${d.nome}: ${d.n}`).join(" · ")}>
                      <Barras itens={r.porDia.map((d, i) => ({ rotulo: DIAS_CURTOS[i], valor: d.n }))} destaque={r.diaCheio} altura={148} />
                    </div>
                    <p className="g-rotulo" style={{ margin: "18px 0 8px" }}>Horários mais cheios</p>
                    <div className="g-rel-horas">
                      {r.horas.map((h) => (
                        <div key={h.h}><Tile icone={Clock} tom="pessego" tamanho="p" /><span><b>{h.h}h</b><small>{h.n === 1 ? "1 horário" : `${h.n} horários`}</small></span></div>
                      ))}
                    </div>
                    <p className="g-muted g-pp" style={{ marginTop: 12 }}>Conta tudo o que foi marcado, menos os cancelados.</p>
                  </>
                ) : <p className="g-muted g-p">Nenhum horário marcado neste período.</p>}
              </section>
            </div>

            {r.totalEstadias > 0 && (
              <section className="g-card">
                <div className="g-card-t">
                  <h3><Tile icone={Home} tom="ceu" tamanho="p" />Creche e hotel</h3>
                  <span className="g-muted g-pp">estadias encerradas no período</span>
                </div>
                <div className="g-rel-ch">
                  {r.estadias.map((x) => (
                    <div key={x.id} className="g-rel-ch-tipo">
                      <p className="g-rel-ch-nome"><Tile icone={x.icone} tom="ceu" tamanho="p" /><b>{x.nome}</b></p>
                      {x.n ? (
                        <>
                          <div className="g-rel-ch-nums">
                            <div><small>{x.n === 1 ? "Estadia" : "Estadias"}</small><b>{x.n}</b></div>
                            <div><small>{x.diarias === 1 ? "Diária" : "Diárias"}</small><b>{x.diarias}</b></div>
                            <div><small>Cobrado</small><b>{x.comValor ? brl(x.valor) : "—"}</b></div>
                          </div>
                          {(x.pacote > 0 || x.cortesia > 0 || x.semValor > 0 || x.estimadas > 0 || x.mensalistas > 0) && (
                            <p className="g-muted g-pp">
                              {[
                                x.mensalistas > 0 && `${x.mensalistas} de mensalista`,
                                x.pacote > 0 && `${x.pacote} com pacote`,
                                x.cortesia > 0 && `${x.cortesia} de cortesia`,
                                x.semValor > 0 && `${x.semValor} sem valor lançado`,
                                x.estimadas > 0 && `${x.estimadas} ${x.estimadas === 1 ? "antiga, com as diárias contadas" : "antigas, com as diárias contadas"} pelas datas`,
                              ].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </>
                      ) : <p className="g-muted g-p">Nenhuma estadia de {x.nome.toLowerCase()} encerrada neste período.</p>}
                    </div>
                  ))}
                </div>
                <p className="g-muted g-pp g-rel-nota">
                  Conta as estadias pela data da saída. O valor é o que foi cobrado no check-out e não soma de novo: o que já foi recebido está no faturamento lá em cima.
                  O que o cliente ficou de pagar depois entra no faturamento quando você der baixa em Financeiro, A receber.
                </p>
              </section>
            )}

            <div className="g-duas">
              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={Scissors} tom="pessego" tamanho="p" />Serviços mais feitos</h3><span className="g-muted g-pp">concluídos</span></div>
                {r.servicos.length ? (
                  <div className="g-rel-rosca">
                    <Rosca fatias={r.servicos.map((s) => ({ valor: s.n, cor: s.cor }))} tamanho={148}>{r.concluidos}<small>{r.concluidos === 1 ? "feito" : "feitos"}</small></Rosca>
                    <div className="g-legenda">
                      {r.servicos.map((s, i) => (
                        <div key={i}>
                          <i style={{ background: s.cor }} />
                          <span className="nome">{s.extra}<small>{vezes(s.n)} · {Math.round((s.n / r.concluidos) * 100)}%{s.pacote > 0 ? ` · ${s.pacote === s.n ? "pago com pacote" : `${s.pacote} com pacote`}` : ""}</small></span>
                          <b>{s.pacote === s.n ? "pacote" : brl(s.valor)}</b>
                        </div>
                      ))}
                    </div>
                    <p className="g-muted g-pp g-rel-nota">
                      O valor é o que foi cobrado pelo serviço, já com o desconto. Produto e extra da mesma conta não entram aqui.
                      {r.comPacote > 0 && ` ${r.comPacote === 1 ? "1 atendimento foi pago com pacote e não soma" : `${r.comPacote} atendimentos foram pagos com pacote e não somam`} de novo: o dinheiro entrou na venda do pacote.`}
                      {r.fiados > 0 && ` ${r.fiados === 1 ? "1 ficou para o cliente pagar depois e conta" : `${r.fiados} ficaram para o cliente pagar depois e contam`} pelo valor cobrado, mesmo sem o dinheiro ter entrado.`}
                      {r.aReceber > 0 && ` ${r.aReceber === 1 ? "1 ainda está sem conta fechada e conta" : `${r.aReceber} ainda estão sem conta fechada e contam`} pelo preço da agenda.`}
                    </p>
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={PawPrint} tom="lilas" tamanho="p" />Pets que mais vieram</h3></div>
                {r.pets.length ? (
                  <div className="g-lista">
                    {r.pets.map((p, i) => (
                      <div key={i} className="g-linha">
                        <span className={`g-rel-pos${i === 0 ? " um" : ""}`}>{i + 1}</span>
                        <AvatarPet pet={p.extra ?? { nome: "Pet" }} />
                        <span className="t"><b>{p.extra?.nome ?? "Pet"}</b><span>{p.extra?.clientes?.nome ?? "Sem tutor"}</span></span>
                        <span className="g-tag">{vezes(p.n)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>
            </div>

            <div className="g-duas">
              <section className="g-card">
                <div className="g-card-t">
                  <h3><Tile icone={HandCoins} tom="menta" tamanho="p" />Comissão por profissional</h3>
                  {r.comissoes.length > 0 && <b className="g-tab">{brl(r.totalComissao)}</b>}
                </div>
                {r.comissoes.length ? (
                  <div className="g-lista">
                    {r.comissoes.map((c) => (
                      <div key={c.p.id} className="g-linha g-rel-com">
                        <AvatarPessoa nome={c.p.nome} cor={c.p.cor} />
                        <span className="t">
                          <b>{c.p.nome}</b>
                          <span>{atendimentos(c.n)}{c.pacote > 0 ? ` (${c.pacote} com pacote)` : ""} · base {brl(c.base)} · {Number(c.p.comissao_pct).toLocaleString("pt-BR")}%</span>
                          {r.totalComissao > 0 && <span className="g-prog"><i style={{ width: `${(c.comissao / r.comissoes[0].comissao) * 100}%`, background: c.p.cor ?? undefined }} /></span>}
                        </span>
                        <span className="d"><b>{brl(c.comissao)}</b></span>
                      </div>
                    ))}
                  </div>
                ) : <p className="g-muted g-p">Ninguém da equipe tem comissão definida. A porcentagem de cada pessoa fica no cadastro da equipe.</p>}
                <p className="g-muted g-pp" style={{ marginTop: 10 }}>
                  A base é o valor cobrado pelo serviço nos atendimentos concluídos de cada profissional, já com o desconto (produto e extra ficam de fora).
                  Atendimento pago com pacote conta pelo preço do serviço na agenda; o que ainda está sem conta fechada, também.
                  Conta que o cliente ficou de pagar depois entra pelo valor cobrado, mesmo antes de o dinheiro entrar.
                </p>
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={Users} tom="ceu" tamanho="p" />Tutores que mais vieram</h3></div>
                {r.tutores.length ? (
                  <div className="g-lista">
                    {r.tutores.map((t, i) => (
                      <div key={i} className="g-linha">
                        <span className={`g-rel-pos${i === 0 ? " um" : ""}`}>{i + 1}</span>
                        <AvatarPessoa nome={t.extra || "?"} />
                        <span className="t"><b>{t.extra}</b><span>{vezes(t.n)}{t.pacote > 0 ? ` · ${t.pacote} com pacote` : ""}</span></span>
                        <span className="d">{brl(t.valor)}</span>
                      </div>
                    ))}
                    <p className="g-muted g-pp" style={{ marginTop: 10 }}>
                      O valor é tudo o que o tutor pagou no período (atendimentos, produtos, pacotes, creche e hotel): a mesma conta de "Já gastou aqui" na ficha dele, que soma todos os períodos.
                    </p>
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Linha de apoio do indicador, com a comparação logo abaixo. */
function Apoio({ texto, ...comparacao }: { texto: string } & Parameters<typeof Comparacao>[0]) {
  return <span className="g-rel-apoio"><span>{texto}</span><Comparacao {...comparacao} /></span>;
}

/**
 * Comparação com o período anterior. A porcentagem só aparece quando o período anterior teve valor maior que zero
 * e o atual existe: fora disso, só o texto.
 */
function Comparacao({ atual, anterior, formato = (n: number) => n.toLocaleString("pt-BR"), longo }: {
  atual: number | null; anterior: number | null; formato?: (n: number) => string; longo?: boolean;
}) {
  if (anterior == null || !(anterior > 0)) return <span className="g-rel-comp">sem movimento no período anterior</span>;
  const variacao = atual == null ? null : ((atual - anterior) / anterior) * 100;
  const pct = variacao == null ? null : `${variacao > 0 ? "+" : variacao < 0 ? "-" : ""}${Math.abs(variacao).toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(variacao) < 10 ? 1 : 0 })}%`;
  const Seta = variacao != null && variacao < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span className="g-rel-comp">
      <span>{formato(anterior)} no período anterior</span>
      {variacao != null && (variacao === 0
        ? <span>{longo ? "igual ao período anterior" : "igual"}</span>
        : <b className={variacao > 0 ? "sobe" : "desce"} title={`${pct} em relação ao período anterior`}><Seta aria-hidden />{pct}{longo ? " em relação ao período anterior" : <span className="g-rel-leitor"> em relação ao período anterior</span>}</b>)}
    </span>
  );
}

/** O que está errado nas datas livres (em português); null quando pode buscar. */
function erroDasDatas(de: string, ate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return "Escolha a data inicial e a final.";
  if (de > ate) return "A data inicial não pode ser depois da final.";
  const dias = Math.round((deIsoDia(ate).getTime() - deIsoDia(de).getTime()) / 864e5) + 1;
  if (dias > MAX_DIAS) return `O período pode ter no máximo ${MAX_DIAS} dias (um ano).`;
  return null;
}

/** Linha com área para muitos pontos (dias do mês ou semanas dos 90 dias). */
function Area({ pontos, porSemana }: { pontos: { dia: Date; valor: number }[]; porSemana: boolean }) {
  const L = 100, A = 40;
  const maior = Math.max(...pontos.map((p) => p.valor), 1);
  const passo = L / Math.max(1, pontos.length - 1);
  const xy = pontos.map((p, i) => [i * passo, A - 1 - (p.valor / maior) * (A - 5)] as const);
  const linha = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const pico = pontos.findIndex((p) => p.valor === maior);
  const nome = (p: { dia: Date }) => (porSemana ? `Semana de ${dataCurta(p.dia)}` : dataCurta(p.dia));
  const meio = pontos[Math.floor((pontos.length - 1) / 2)];
  return (
    <div className="g-rel-area" role="img" aria-label={`Faturamento por ${porSemana ? "semana" : "dia"}. Maior valor: ${brl(maior)}.`}>
      <div className="palco">
        <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="g-rel-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f6b4c" stopOpacity=".34" />
              <stop offset="1" stopColor="#2f6b4c" stopOpacity=".02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={L} y1={A * f} y2={A * f} className="grade" vectorEffect="non-scaling-stroke" />)}
          <path d={`${linha} L${L} ${A} L0 ${A} Z`} fill="url(#g-rel-grad)" />
          <path d={linha} className="traco" vectorEffect="non-scaling-stroke" />
        </svg>
        {pico >= 0 && pontos[pico].valor > 0 && (
          <span className={`pico${xy[pico][0] > 55 ? " esq" : ""}`} style={{ left: `${xy[pico][0]}%`, top: `${(xy[pico][1] / A) * 100}%` }}><b>{brl(maior)}</b></span>
        )}
        <div className="alvos">{pontos.map((p, i) => <span key={i} title={`${nome(p)}: ${brl(p.valor)}`} />)}</div>
      </div>
      <div className="eixo"><span>{dataCurta(pontos[0].dia)}</span><span>{dataCurta(meio.dia)}</span><span>{dataCurta(pontos[pontos.length - 1].dia)}</span></div>
    </div>
  );
}
