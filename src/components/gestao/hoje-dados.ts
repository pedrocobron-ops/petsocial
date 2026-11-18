import type { Banco } from "@/lib/gestao/supabase";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO } from "@/lib/gestao/tipos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { comPrecosDeAgendamento, comPrecosLidos, idsParaCobrar } from "@/lib/gestao/reservado";
import { ajustesDoFaturamento, CATEGORIAS_DEVOLUCAO, montarAjustes, SEM_AJUSTES, type AjustesDoFaturamento } from "@/lib/gestao/faturamento";
import { deIsoDia, inicioDaSemana, isoDia, somaDias } from "@/lib/gestao/util";
import { buscarSaudeVencendo, limiteSaudeHoje, resumirSaudeVencendo, type SaudeVencendo } from "@/components/gestao/clientes/saude-avisos";
import type { CuidadoResumido } from "@/components/gestao/clientes/saude";

/**
 * O que a tela Hoje lê no primeiro olhar. Vem numa ida só ao banco (`gestao_hoje`, migração 20261195), com o login de quem pede:
 * as mesmas regras de cada tabela e as mesmas funções de preço. Se a função ainda não existe (banco antes da atualização) ou
 * falhar, lê do jeito de antes, uma consulta por parte, ao mesmo tempo. As duas leituras entregam a mesma coisa.
 */
/** `checkins`: estadias que entraram na casa (em casa ou encerradas); banco antigo não manda, e vale `estadias`. */
export type Contagens = { pets: number; agendamentos: number; concluidos: number; lembrados: number; estadias: number; produtos: number; checkins?: number };
type Curto = { id: string; inicio: string; pets: { nome: string } | null };
type Amanha = { id: string; lembrete_em: string | null; status: string; pets: { clientes: { id: string; telefone: string | null } | null } | null };
type Lanc = { valor: number; tipo: string; categoria?: string | null };
type Conta = { id: string; valor: number; vencimento: string | null; tipo?: string; categoria?: string };
type Produto = { id: string; nome: string; estoque: number; estoque_minimo: number };
type EmCasa = { id: string; status: string; entrada: string | null; saida_prevista: string | null };
export type DadosDoHoje = {
  lista: AgendamentoCompleto[];
  amanha: Amanha[];
  emCasa: EmCasa[];
  acabando: Produto[];
  contagens: Contagens;
  entradas: Lanc[];
  contas: Conta[];
  pacotes: number;
  semana: { inicio: string; status: string }[];
  /** serviços dos últimos 30 dias (sem cancelado e faltou), na ordem em que cada um apareceu primeiro */
  servicosMes: { rotulo: string; valor: number; cor: string | null }[];
  /** o que entrou em cada um dos últimos 7 dias */
  ultimos7: { valor: number; data: string }[];
  proximos: Curto[];
  semFechar: { total: number; primeiros: Curto[] };
  saude: SaudeVencendo | null;
  aj: AjustesDoFaturamento;
  /** check-outs sem cobrança e saídas depois do horário (só para quem recebe e tem creche e hotel) */
  paraCobrar: number;
  atrasos: number;
  /** horários de hoje concluídos que ninguém cobrou (agendamentos_para_cobrar); null: a tela lê à parte (useParaCobrar) */
  cobrarHoje: string[] | null;
};
export type QuemVeHoje = { vejoEstoque: boolean; vejoFinanceiro: boolean; cuidoDoFinanceiro: boolean; vejoPacotes: boolean; cobrar: boolean; cobrarHoje: boolean };

function datas(hoje: Date) {
  const amanha = somaDias(hoje, 1), depois = somaDias(hoje, 2);
  const seg = inicioDaSemana(hoje), ha30 = somaDias(hoje, -30), ha6 = somaDias(hoje, -6);
  return { hoje, hojeIso: isoDia(hoje), amanha, depois, seg, ha30, ha6 };
}

export async function lerDadosDoHoje(sb: Banco, petshopId: string, hoje: Date, q: QuemVeHoje): Promise<DadosDoHoje> {
  const d = datas(hoje);
  const r = await sb.rpc("gestao_hoje", {
    p: petshopId,
    a: {
      hoje_ini: d.hoje.toISOString(), amanha: d.amanha.toISOString(), depois: d.depois.toISOString(), seg: d.seg.toISOString(),
      seg7: somaDias(d.seg, 7).toISOString(), ha30: d.ha30.toISOString(), dia: d.hojeIso, ha6: isoDia(d.ha6), mais7: isoDia(somaDias(hoje, 7)),
      saude_ate: limiteSaudeHoje(), cred_de: deIsoDia(isoDia(d.ha6)).toISOString(), cred_ate: somaDias(deIsoDia(d.hojeIso), 1).toISOString(),
      devolucao: CATEGORIAS_DEVOLUCAO, estoque: q.vejoEstoque, financeiro: q.vejoFinanceiro, cuido: q.cuidoDoFinanceiro, pacotes: q.vejoPacotes, cobrar: q.cobrar, cobrar_hoje: q.cobrarHoje,
    },
  });
  const h = (!r.error && r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : null) as Record<string, unknown> | null;
  if (!h || !Array.isArray(h.lista) || !h.contagens) return lerDoJeitoAntigo(sb, petshopId, d, q);

  const lista = h.lista as AgendamentoCompleto[];
  const precos = h.precos as { id: string; preco: number | null }[] | null;
  const saude = h.saude as { perto: CuidadoResumido[]; depois: CuidadoResumido[]; pets: { id: string; nome: string }[] } | null;
  const [ags, saudeVencendo] = await Promise.all([
    // sem a função de preços (ou se ela falhou), o preço vem pelo caminho de sempre
    precos ? comPrecosLidos(lista, precos) : comPrecosDeAgendamento(sb, petshopId, lista),
    saude ? resumirSaudeVencendo([...saude.perto, ...saude.depois], async () => new Map(saude.pets.map((p) => [p.id, p.nome]))).catch(() => null)
      : buscarSaudeVencendo(sb, petshopId).catch(() => null),
  ]);
  const c = h.contagens as Contagens;
  const lin = <T,>(k: string) => (Array.isArray(h[k]) ? h[k] : []) as T[];
  return {
    lista: ags as unknown as AgendamentoCompleto[],
    amanha: lin<Amanha>("amanha"),
    emCasa: lin<EmCasa>("em_casa"),
    acabando: lin<Produto>("acabando"),
    contagens: { pets: Number(c.pets ?? 0), agendamentos: Number(c.agendamentos ?? 0), concluidos: Number(c.concluidos ?? 0), lembrados: Number(c.lembrados ?? 0), estadias: Number(c.estadias ?? 0), produtos: Number(c.produtos ?? 0), ...(c.checkins == null ? {} : { checkins: Number(c.checkins) }) },
    entradas: lin<Lanc>("entradas"),
    contas: lin<Conta>("contas"),
    pacotes: lin<{ id: string }>("pacotes").length,
    semana: lin<{ inicio: string; status: string }>("semana"),
    servicosMes: lin<{ rotulo: string; valor: number; cor: string | null }>("servicos_mes").map((s) => ({ rotulo: s.rotulo, valor: Number(s.valor), cor: s.cor })),
    ultimos7: lin<{ valor: number; data: string }>("ultimos7"),
    proximos: lin<Curto>("proximos"),
    semFechar: { total: Number(h.sem_fechar_total ?? 0), primeiros: lin<Curto>("sem_fechar") },
    saude: saudeVencendo,
    aj: q.cuidoDoFinanceiro ? montarAjustes(lin("devolucoes"), lin("creditos")) : SEM_AJUSTES,
    paraCobrar: q.cobrar ? Number(h.para_cobrar ?? 0) : 0,
    atrasos: q.cobrar ? Number(h.atrasos ?? 0) : 0,
    cobrarHoje: !q.cobrarHoje ? [] : Array.isArray(h.cobrar_hoje) ? (h.cobrar_hoje as string[]) : null,
  };
}

/** A leitura de antes da `gestao_hoje`: uma consulta por parte, todas ao mesmo tempo. */
async function lerDoJeitoAntigo(sb: Banco, petshopId: string, d: ReturnType<typeof datas>, q: QuemVeHoje): Promise<DadosDoHoje> {
  const { hoje, hojeIso, amanha, depois, seg, ha30, ha6 } = d;
  // primeiros passos e aviso de fim de teste: seis contagens, sem trazer linha nenhuma, numa ida só ao banco
  // (banco antes da atualização, sem `gestao_contagens`: uma contagem por pedido, como antes)
  const contagens: Promise<Contagens> = Promise.resolve(sb.rpc("gestao_contagens", { p: petshopId })).then(async (r) => {
    if (!r.error && r.data && typeof r.data === "object") return r.data as unknown as Contagens;
    const n = (x: { count: number | null }) => x.count ?? 0;
    const [pets, agendamentos, concluidos, lembrados, estadias, produtos] = await Promise.all([
      sb.from("pets").select("id", { count: "exact", head: true }).eq("petshop_id", petshopId).then(n),
      sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshopId).then(n),
      sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshopId).eq("status", "concluido").then(n),
      sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshopId).not("lembrete_em", "is", null).then(n),
      sb.from("estadias").select("id", { count: "exact", head: true }).eq("petshop_id", petshopId).then(n),
      sb.from("produtos").select("id", { count: "exact", head: true }).eq("petshop_id", petshopId).then(n),
    ]);
    return { pets, agendamentos, concluidos, lembrados, estadias, produtos };
  });
  const { vejoEstoque, vejoFinanceiro, cuidoDoFinanceiro, vejoPacotes, cobrar } = q;
  const [lista, agsAmanha, emCasa, produtos, c, entradas, contas, pacotes, daSemana, doMes, ultimos7, proximosDias, semFechar, saude, aj, paraCobrar, atrasos] = await Promise.all([
    // o preço de cada horário vem à parte; o banco só entrega a quem recebe (o formulário de editar regrava o que leu)
    sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshopId).gte("inicio", hoje.toISOString()).lt("inicio", amanha.toISOString()).order("inicio")
      .then(async (ags) => await comPrecosDeAgendamento(sb, petshopId, (ags.data ?? []) as unknown as AgendamentoCompleto[]) as unknown as AgendamentoCompleto[]),
    sb.from("agendamentos").select("id, lembrete_em, status, pets(clientes(id, telefone))").eq("petshop_id", petshopId).gte("inicio", amanha.toISOString()).lt("inicio", depois.toISOString()),
    sb.from("estadias").select("id, status, entrada, saida_prevista").eq("petshop_id", petshopId).in("status", ["em_casa", "reservada"]).limit(1000),
    // estoque e pacotes só entram no aviso de quem tem a área
    vejoEstoque ? lerTudo<Produto>((de, ate, contar) => sb.from("produtos").select("id, nome, estoque, estoque_minimo", contando(contar)).eq("petshop_id", petshopId).eq("ativo", true).gt("estoque_minimo", 0).order("nome").order("id").range(de, ate)) : Promise.resolve([] as Produto[]),
    contagens,
    vejoFinanceiro ? sb.from("lancamentos").select("valor, tipo, categoria").eq("petshop_id", petshopId).eq("pago", true).is("movimento", null).eq("data", hojeIso) : Promise.resolve({ data: [] }),
    cuidoDoFinanceiro ? sb.from("lancamentos").select("id, valor, vencimento, tipo, categoria").eq("petshop_id", petshopId).eq("pago", false).lte("vencimento", hojeIso) : Promise.resolve({ data: [] }),
    vejoPacotes ? sb.from("pacotes_clientes").select("id").eq("petshop_id", petshopId).eq("ativo", true).gte("vence_em", hojeIso).lte("vence_em", isoDia(somaDias(hoje, 7))) : Promise.resolve({ data: [] }),
    sb.from("agendamentos").select("inicio, status").eq("petshop_id", petshopId).gte("inicio", seg.toISOString()).lt("inicio", somaDias(seg, 7).toISOString()),
    lerTudo<{ status: string; servicos: { nome: string; cor: string | null } | null }>((de, ate, contar) => sb.from("agendamentos").select("status, servicos(nome, cor)", contando(contar)).eq("petshop_id", petshopId).gte("inicio", ha30.toISOString()).lt("inicio", amanha.toISOString()).order("inicio").order("id").range(de, ate)),
    cuidoDoFinanceiro ? lerTudo<{ valor: number; data: string }>((de, ate, contar) => sb.from("lancamentos").select("valor, data", contando(contar)).eq("petshop_id", petshopId).eq("pago", true).eq("tipo", "entrada").is("movimento", null).gte("data", isoDia(ha6)).lte("data", hojeIso).order("data").order("id").range(de, ate)) : Promise.resolve([]),
    // os próximos horários depois de hoje: a tela não diz "nada por vir" quando há banho marcado para segunda
    sb.from("agendamentos").select("id, inicio, pets(nome)").eq("petshop_id", petshopId).gte("inicio", amanha.toISOString()).in("status", ["marcado", "confirmado"]).order("inicio").order("id").limit(2),
    // horários de dias anteriores que ninguém fechou (nem concluído, nem falta, nem cancelado)
    sb.from("agendamentos").select("id, inicio, pets(nome)", { count: "exact" }).eq("petshop_id", petshopId).lt("inicio", hoje.toISOString()).in("status", ["marcado", "confirmado", "em_atendimento"]).order("inicio").order("id").limit(3),
    buscarSaudeVencendo(sb, petshopId).catch(() => null),
    // devolução ao tutor e crédito deixado para ele saem do que entrou (a mesma regra do faturamento nos Relatórios)
    cuidoDoFinanceiro ? ajustesDoFaturamento(sb, petshopId, isoDia(ha6), hojeIso).catch(() => SEM_AJUSTES) : Promise.resolve(SEM_AJUSTES),
    cobrar ? idsParaCobrar(sb, petshopId).then((ids) => ids.length) : Promise.resolve(0),
    // (só no banco antes da gestao_hoje; o módulo da taxa de atraso é grande e vem à parte)
    cobrar ? import("@/components/gestao/creche/atraso").then((m) => m.contarAtrasosPendentes(sb, petshopId)) : Promise.resolve(0),
  ]);
  // serviços mais pedidos: na ordem em que cada um apareceu primeiro (a tela ordena pelo total)
  const porServico = new Map<string, { rotulo: string; valor: number; cor: string | null }>();
  for (const a of doMes) {
    if (["cancelado", "faltou"].includes(a.status) || !a.servicos) continue;
    const x = porServico.get(a.servicos.nome) ?? { rotulo: a.servicos.nome, valor: 0, cor: a.servicos.cor };
    x.valor++; porServico.set(a.servicos.nome, x);
  }
  return {
    lista,
    amanha: (agsAmanha.data ?? []) as unknown as Amanha[],
    emCasa: (emCasa.data ?? []) as EmCasa[],
    acabando: produtos,
    contagens: c,
    entradas: (entradas.data ?? []) as Lanc[],
    contas: (contas.data ?? []) as Conta[],
    pacotes: (pacotes.data ?? []).length,
    semana: (daSemana.data ?? []) as { inicio: string; status: string }[],
    servicosMes: [...porServico.values()],
    ultimos7,
    proximos: (proximosDias.data ?? []) as unknown as Curto[],
    semFechar: { total: semFechar.count ?? 0, primeiros: (semFechar.data ?? []) as unknown as Curto[] },
    saude,
    aj,
    paraCobrar,
    atrasos,
    cobrarHoje: null,
  };
}
