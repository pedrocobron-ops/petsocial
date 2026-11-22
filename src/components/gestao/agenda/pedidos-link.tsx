"use client";

import { horarioDaCreche } from "@/lib/gestao/horario-loja";
import { etiquetaPromo, lerPromoDoHorario } from "@/lib/gestao/promocoes";
import { saudacaoZap } from "@/lib/gestao/agenda";
import { useEffect, useState } from "react";
import { CalendarClock, Check, Clock, Link2, MessageCircle, UserX, X } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { useTrava } from "@/lib/gestao/uma-vez";
import { AvatarPessoa, AvatarPet, Folha, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import type { Database } from "@/lib/gestao/banco";
import { abreNoDia, precoDaExperiencia } from "@/lib/gestao/creche";
import { pixDoSinal } from "@/lib/gestao/hotel";
import { porteDe, sinalDe } from "@/lib/gestao/hotel-opcoes";
import { nomeDaCasa } from "@/lib/gestao/modulos";
import { opcoesDoLink, prazoPorExtenso, usouOpcoesDoLink } from "@/lib/gestao/link-opcoes";
import { brl, NOTA_PORTE, precoMudaComPorte, centavos } from "@/lib/gestao/util";
import { PORTES } from "@/lib/gestao/tipos";
import { dataCurta, fmtTelefone, hora, inicioDoDia, isoDia, linkWhatsApp, nomeDia, somaDias, chamar } from "@/lib/gestao/util";
import { precoDoPedido } from "@/lib/gestao/preco-do-pedido";
import { lerVisto, valorNaFrase, type LinhaDeValor } from "@/lib/gestao/link-precos";
import { fraseDoEndereco } from "@/lib/gestao/endereco";
import { acharPet, nomeDePet, perguntaDoPet, simDoPet, type PetDaFicha } from "@/lib/gestao/pet-parecido";
import "./pedidos-link.css";

type Pedido = Database["public"]["Tables"]["pedidos_agendamento"]["Row"];
/** `tutor` é o nome de quem ficou com o pedido (o tutor que já existia, quando a pessoa escolheu usar a ficha dele). */
type Respondido = { pedido: Pedido; servico: string | null; resposta: "aceito" | "recusado" | "cancelou"; tutor?: string };
/** "13/11 às 10:02" */
const diaHora = (iso: string) => `${dataCurta(new Date(iso))} às ${hora(iso)}`;
type TutorDoTelefone = { id: string; nome: string; telefone: string | null };
/** O telefone do pedido já é de outro nome: espera a pessoa dizer se é a mesma. */
type Duvida = { lista: Pedido[]; grupo: string; existente: TutorDoTelefone };
/** `alvo`: o tutor da ficha em que o pedido vai entrar (sem ele, o tutor é novo e não há pet para conferir). */
type Decisao = { como: "existente" | "novo"; tutor?: string; alvo?: string };
type PetDoTutor = PetDaFicha & { foto: string | null; raca: string | null };
/** O pet da ficha que a pessoa confirmou em cada pedido ("Sim, é ele"): id do pedido → pet. Fora daqui, o banco decide (nome igual ou pet novo). */
type Escolhidos = Record<string, PetDoTutor>;
/** O nome do pet do pedido parece o de um pet da ficha: espera a pessoa dizer se é o mesmo. */
type PerguntaPet = { lista: Pedido[]; grupo: string; decisao: Decisao; tutor: string; perguntas: { pedido: Pedido; pets: PetDoTutor[] }[]; respostas: Record<string, PetDoTutor | "outro"> };
/** "Era outro pet?": o pedido aceito que criou um pet novo, e os outros pets do mesmo tutor. */
type Troca = { pedido: Pedido; pets: PetDoTutor[] };
/** Porte respondido na hora de aceitar: P, M, G, GG ou "depois" (não sabe ainda: o valor fica para conferir na hora). */
type Portes = Record<string, string>;
/** Pedido de serviço sem porte e com preço que muda com o porte: espera a pessoa dizer o porte (ou que não sabe). */
type PerguntaPorte = { lista: Pedido[]; grupo: string; decisao: Decisao; escolhidos: Escolhidos; faltam: Pedido[]; respostas: Portes };

const ESPECIE: Record<string, string> = { cao: "cão", gato: "gato", outro: "outro" };

/** "hoje", "amanhã" ou "sexta, 14/11" (para mostrar na tela). */
function quandoNaTela(inicio: string) {
  const d = new Date(inicio);
  const dif = Math.round((inicioDoDia(d).getTime() - inicioDoDia(new Date()).getTime()) / 864e5);
  return dif === 0 ? "hoje" : dif === 1 ? "amanhã" : `${nomeDia(d)}, ${dataCurta(d)}`;
}
/** "hoje", "amanhã" ou "na sexta, 14/11" (para caber numa frase). */
function quandoNaFrase(inicio: string) {
  const d = new Date(inicio);
  const dif = Math.round((inicioDoDia(d).getTime() - inicioDoDia(new Date()).getTime()) / 864e5);
  if (dif === 0) return "hoje";
  if (dif === 1) return "amanhã";
  const fimDeSemana = d.getDay() === 0 || d.getDay() === 6;
  return `${fimDeSemana ? "no" : "na"} ${nomeDia(d)}, ${dataCurta(d)}`;
}
/** Pedido de creche ou de hotel: vira reserva em Creche e hotel, não horário na agenda. */
const ehEstadia = (p: Pedido) => p.tipo === "creche" || p.tipo === "hotel";
/** Dias do pedido de creche em que o pet shop não abre (pelo horário de Meu pet shop). O aceite continua possível: é só um aviso. */
function fechadosDe(p: Pedido, horario: unknown): string[] {
  const dias: string[] = [];
  for (let d = inicioDoDia(new Date(p.inicio)), i = 0; d <= new Date(p.fim) && i < 62; d = somaDias(d, 1), i++) if (!abreNoDia(horario, isoDia(d))) dias.push(isoDia(d));
  return dias;
}
/** "sexta, 14/11" ou "de 14/11 a 17/11". */
function periodoDe(p: Pedido) {
  const a = new Date(p.inicio), b = new Date(p.fim);
  return inicioDoDia(a).getTime() === inicioDoDia(b).getTime() ? `${nomeDia(a)}, ${dataCurta(a)}` : `de ${dataCurta(a)} a ${dataCurta(b)}`;
}
const primeiroNome = (nome: string) => chamar(nome);
const textoDoErro = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e ?? ""));
/** "Nina", "Nina e Bob", "Nina, Bob e Mel". */
const listaDe = (itens: string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);
/** Pedidos feitos juntos (vários pets do mesmo tutor) têm o mesmo `grupo_id`; pedido sozinho é o próprio grupo. */
const chaveDe = (p: Pedido) => p.grupo_id ?? p.id;
function agrupar<T>(itens: T[], chave: (x: T) => string) {
  const grupos = new Map<string, T[]>();
  for (const x of itens) grupos.set(chave(x), [...(grupos.get(chave(x)) ?? []), x]);
  return [...grupos.entries()].map(([id, lista]) => ({ id, lista }));
}
const porHora = (a: Pedido, b: Pedido) => a.inicio.localeCompare(b.inicio) || new Date(a.inicio).getTime() - new Date(b.inicio).getTime();

/**
 * Pedidos que chegaram pelo link de agendamento e esperam resposta.
 * Sem pedido, não aparece nada. Vários pets do mesmo tutor vêm num cartão só, com "Aceitar todos".
 * Depois de aceitar ou recusar, fica um atalho para avisar o tutor no WhatsApp. O atalho não some ao recarregar:
 * o pedido respondido continua na lista até alguém avisar o tutor (ou marcar "Já avisei"), e isso fica gravado no pedido.
 */
export default function PedidosLink() {
  const { sb, petshop, equipe, servicos, vejoFinanceiro, posso } = useGestao();
  const casa = nomeDaCasa(petshop);
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [quem, setQuem] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  // enquanto um pedido está sendo aceito, fechar ou recarregar a aba pede confirmação (o aceite é uma operação só no banco,
  // mas a pessoa precisa ver o resultado antes de sair)
  useEffect(() => {
    if (!ocupado) return;
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [ocupado]);
  // nome de quem ficou com o pedido, quando a pessoa escolheu usar a ficha de um tutor que já existia (vale até recarregar)
  const [tutores, setTutores] = useState<Record<string, string>>({});
  const [duvida, setDuvida] = useState<Duvida | null>(null);
  const [perguntaPorte, setPerguntaPorte] = useState<PerguntaPorte | null>(null);
  const [perguntaPet, setPerguntaPet] = useState<PerguntaPet | null>(null);
  const [troca, setTroca] = useState<Troca | null>(null);
  // pedidos que acabaram de ser aceitos ou recusados aqui: saem da lista na hora, sem esperar a busca de novo
  // (antes, o cartão com Aceitar e Recusar ficava na tela uns segundos e convidava a um segundo toque)
  const [respondidosAgora, setRespondidosAgora] = useState<Set<string>>(() => new Set());
  const marcarRespondidos = (ids: string[]) => setRespondidosAgora((s) => new Set([...s, ...ids]));
  const comOpcoes = usouOpcoesDoLink(petshop);
  const doLink = opcoesDoLink(petshop);

  const { dados: tudo, recarregar } = useDados(async () => {
    const [pendentes, semAviso, recados, vistosLidos] = await Promise.all([
      sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).eq("status", "pendente").order("inicio").limit(100),
      // respondidos em que o tutor ainda não foi avisado (e os que o próprio tutor cancelou, até alguém ver)
      sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).in("status", ["aceito", "recusado"]).is("avisado_em", null).order("inicio").limit(60),
      // o tutor pediu outra data, ou pediu para cancelar algo que tem dinheiro no meio: só para quem ligou isso no link
      comOpcoes ? sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).not("cliente_pediu", "is", null).is("cliente_pedido_visto_em", null).order("inicio").limit(40) : null,
      // o valor que o link mostrou ao tutor em cada pedido (só quem recebe lê; banco antes da migração 20261235: sem isso)
      vejoFinanceiro ? Promise.resolve((sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }).rpc("pedidos_vistos", { p: petshop.id })).then((r) => (r.error ? null : r.data), () => null) : null,
    ]);
    const vistos = (vistosLidos && typeof vistosLidos === "object" ? vistosLidos : {}) as Record<string, unknown>;
    // o sinal das reservas aceitas que ainda esperam o aviso: só quem recebe lê o valor (para a mensagem levar quanto é)
    const sinais = new Map<string, number>();
    const sinaisPagos = new Map<string, number>();
    let respondidosAinda = (semAviso.data ?? []) as Pedido[];
    // aceito e depois cancelado em Hotel (ou na Agenda): esse pet sai do aviso; se todos foram cancelados, o aviso some.
    // Assim a mensagem nunca confirma uma reserva que já não existe.
    const recadosLidos = (recados?.data ?? []) as Pedido[];
    const idsEstadia = [...respondidosAinda, ...recadosLidos].filter((p) => p.status === "aceito" && p.estadia_id).map((p) => p.estadia_id!);
    const idsHorario = [...respondidosAinda, ...recadosLidos].filter((p) => p.status === "aceito" && p.agendamento_id).map((p) => p.agendamento_id!);
    const [estEstadias, estHorarios] = await Promise.all([
      idsEstadia.length ? sb.from("estadias").select("id, status, entrada, pets(nome)").eq("petshop_id", petshop.id).in("id", idsEstadia) : null,
      idsHorario.length ? sb.from("agendamentos").select("id, status, pets(nome)").eq("petshop_id", petshop.id).in("id", idsHorario) : null,
    ]);
    const canceladas = new Set([...(estEstadias?.data ?? []).filter((e) => e.status === "cancelada"), ...(estHorarios?.data ?? []).filter((a) => a.status === "cancelado")].map((x) => x.id));
    if (canceladas.size) respondidosAinda = respondidosAinda.filter((p) => !(p.status === "aceito" && !p.cliente_cancelou_em && ((p.estadia_id && canceladas.has(p.estadia_id)) || (p.agendamento_id && canceladas.has(p.agendamento_id)))));
    // a reserva aceita já andou: o pet chegou (ou já foi embora), ou a entrada mudou de dia. A confirmação com as datas do
    // pedido não serve mais (mandaria as datas antigas): o aviso sai.
    const entrouOuMudou = new Map((estEstadias?.data ?? []).map((e) => [e.id, e]));
    respondidosAinda = respondidosAinda.filter((p) => {
      const e = p.status === "aceito" && !p.cliente_cancelou_em && p.estadia_id ? entrouOuMudou.get(p.estadia_id) : undefined;
      return !e || (e.status !== "em_casa" && e.status !== "encerrada" && !(e.status === "reservada" && isoDia(new Date(e.entrada)) !== isoDia(new Date(p.inicio))));
    });
    const comReserva = respondidosAinda.filter((p) => p.estadia_id);
    if (vejoFinanceiro && sinalDe(petshop).ativo && comReserva.length) {
      const v = await sb.from("estadias_valores").select("estadia_id, sinal, sinal_estado").eq("petshop_id", petshop.id).in("estadia_id", comReserva.map((p) => p.estadia_id!));
      for (const x of v.data ?? []) {
        if (x.sinal != null && x.sinal_estado === "a_receber") sinais.set(x.estadia_id, Number(x.sinal));
        if (x.sinal != null && x.sinal_estado === "pago") sinaisPagos.set(x.estadia_id, Number(x.sinal));
      }
    }
    // o horário pode ter sido remarcado depois do pedido: o aviso e a mensagem usam a data de agora do horário, não a do pedido
    const comHorario = [...respondidosAinda, ...recadosLidos].filter((p) => p.agendamento_id && !ehEstadia(p as Pedido)) as Pedido[];
    const atual = new Map<string, { inicio: string; fim: string }>();
    if (comHorario.length) {
      const h = await sb.from("agendamentos").select("id, inicio, fim").eq("petshop_id", petshop.id).in("id", [...new Set(comHorario.map((p) => p.agendamento_id!))]);
      for (const x of h.data ?? []) atual.set(x.id, { inicio: x.inicio, fim: x.fim });
    }
    // aceito: o nome do pet é o da ficha (o tutor escreveu "Tor", a pessoa disse que é o Thor; ou trocou em "Era outro pet?").
    // O cartão e a mensagem de confirmação usam esse nome.
    const nomeDe = (x: { pets?: unknown }) => { const t = Array.isArray(x.pets) ? x.pets[0] : x.pets; return t && typeof t === "object" && typeof (t as { nome?: unknown }).nome === "string" ? (t as { nome: string }).nome : null; };
    const naFicha = new Map<string, string>();
    for (const x of [...(estEstadias?.data ?? []), ...(estHorarios?.data ?? [])] as { id: string; pets?: unknown }[]) { const n = nomeDe(x); if (n) naFicha.set(x.id, n); }
    const nomeDaFicha = (p: Pedido) => { const n = p.status === "aceito" ? naFicha.get(p.estadia_id ?? p.agendamento_id ?? "") : undefined; return n && n !== p.pet_nome ? { ...p, pet_nome: n } : p; };
    const emDia = (l: Pedido[]) => l.map(nomeDaFicha).map((p) => (p.agendamento_id && atual.has(p.agendamento_id) && !ehEstadia(p) ? { ...p, ...atual.get(p.agendamento_id)! } : p));
    return { pendentes: ok(pendentes) as Pedido[], semAviso: emDia(respondidosAinda), recados: emDia(recadosLidos), sinais, sinaisPagos, canceladas, vistos };
  }, [petshop.id, comOpcoes, vejoFinanceiro]);
  const dados = tudo?.pendentes;

  // o pedido chega de fora: olha de novo a cada minuto e quando a pessoa volta para a aba
  useEffect(() => {
    const olhar = () => { if (document.visibilityState === "visible") void recarregar(); };
    const relogio = setInterval(olhar, 60_000);
    document.addEventListener("visibilitychange", olhar);
    return () => { clearInterval(relogio); document.removeEventListener("visibilitychange", olhar); };
  }, [recarregar]);

  const atendem = equipe.filter((p) => p.ativo && p.atende);
  const nomeServico = (id: string | null) => servicos.find((s) => s.id === id)?.nome ?? null;
  /** Os serviços do pedido: o principal e os que vêm junto no mesmo horário (migração 20261239). */
  const servicosDe = (p: Pedido) => [p.servico_id, ...(p.outros_servicos ?? [])].filter((id): id is string => !!id).map((id) => servicos.find((s) => s.id === id));
  /** "Banho e tosa" ou "Banho e tosa + Hidratação + Corte de unhas". */
  const rotulo = (p: Pedido) => (p.tipo === "creche" ? "Creche" : p.tipo === "hotel" ? "Hotel"
    : p.outros_servicos?.length ? [nomeServico(p.servico_id), ...p.outros_servicos.map(nomeServico)].filter(Boolean).join(" + ") || null : nomeServico(p.servico_id));
  // o valor do pedido, como o link mostrou ao tutor (só para quem vê o dinheiro)
  const valorDe = (p: Pedido) => {
    if (!vejoFinanceiro) return null;
    const porte = porteDe(petshop);
    const v = precoDoPedido(p, p.outros_servicos?.length ? servicosDe(p) : servicos.find((s) => s.id === p.servico_id), { diaria_creche: petshop.diaria_creche, diaria_hotel: petshop.diaria_hotel,
      diariaHotelDoPorte: porte.ativo && p.porte ? porte[p.porte as "P" | "M" | "G" | "GG"] ?? null : null });
    return v && <span className="g-pl-valor">{v}</span>;
  };
  /** O que o link mostrou ao tutor (o banco guardou ao receber o pedido): linhas de valor dos pedidos da lista. Só para quem recebe. */
  const vistosDe = (lista: Pedido[]): LinhaDeValor[] => lista.flatMap((p) => { const v = lerVisto(tudo?.vistos?.[p.id]); return v ? [{ nome: p.pet_nome, v }] : []; });
  /** "o cliente viu: R$ 118,82 (Mel R$ 42,41 e Bob R$ 76,41)" — o cartão diz o mesmo número que o tutor leu no link. */
  const vistoDe = (lista: Pedido[]) => {
    const linhas = vistosDe(lista);
    const frase = linhas.length === lista.length ? valorNaFrase(linhas) : null;
    return frase ? <span className="g-tag azul" data-teste="cliente-viu" title="O valor que o link mostrou ao tutor quando ele pediu (preço da lista no porte, com a promoção do horário; no hotel, a estimativa das datas).">o cliente viu: {frase}</span> : null;
  };
  const corServico = (id: string | null) => servicos.find((s) => s.id === id)?.cor ?? "#f97316";
  const respondidos: Respondido[] = (tudo?.semAviso ?? []).map((p) => ({ pedido: p, servico: rotulo(p), resposta: p.cliente_cancelou_em ? "cancelou" : p.status === "aceito" ? "aceito" : "recusado", tutor: tutores[p.id] }));
  // recados do tutor (outra data ou cancelamento que depende de você), um cartão por tutor
  const gruposRecados = agrupar(tudo?.recados ?? [], (p) => `${chaveDe(p)}:${p.cliente_pediu}`).map((g) => ({ ...g, lista: [...g.lista].sort(porHora) }));

  /** Todos os pets do recado já tiveram a reserva (ou o horário) cancelada aqui dentro? */
  const jaCancelada = (lista: Pedido[]) => lista.every((x) => (x.estadia_id && tudo?.canceladas.has(x.estadia_id)) || (x.agendamento_id && tudo?.canceladas.has(x.agendamento_id)));
  /** A pessoa respondeu (ou resolveu) o recado do tutor: ele sai da lista, em todos os aparelhos. */
  async function recadoVisto(lista: Pedido[]) {
    try {
      ok(await sb.from("pedidos_agendamento").update({ cliente_pedido_visto_em: new Date().toISOString() }).in("id", lista.map((p) => p.id)).eq("petshop_id", petshop.id).select("id"));
      void recarregar();
    } catch (e) { avisarErro(e); }
  }
  /** "o banho de Nina na sexta, 14/11, às 10:00" ou "o hotel de Nina e Bob, de 20/11 a 23/11". */
  function oQueFoi(lista: Pedido[]) {
    const p = lista[0];
    const nomes = listaDe(lista.map((x) => x.pet_nome));
    if (ehEstadia(p)) return `${p.tipo === "hotel" ? "o hotel" : "a creche"} de ${nomes}, ${periodoDe(p)}`;
    const s = rotulo(p);
    return `o horário de ${nomes}${s ? ` (${s})` : ""} ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}`;
  }
  const enderecoDoLink = () => `${window.location.origin}/gestao/agendar/${petshop.link_codigo}`;
  /** Resposta pronta para o tutor que cancelou pelo link. */
  const mensagemDoCancelado = (lista: Pedido[]) =>
    `${saudacaoZap(lista[0].tutor_nome, petshop.nome)} Vi que você cancelou ${oQueFoi(lista)}. Está cancelado por aqui também. Quando quiser marcar de novo, é só escolher por aqui: ${enderecoDoLink()}`;
  /** Resposta pronta para o recado do tutor (outra data, ou cancelamento que depende de você). */
  const mensagemDoRecado = (lista: Pedido[]) => {
    const p = lista[0];
    const escreveu = p.cliente_recado ? ` Você escreveu: "${p.cliente_recado}".` : "";
    return p.cliente_pediu === "mudar"
      ? `${saudacaoZap(p.tutor_nome, petshop.nome)} Recebi o seu pedido para mudar ${oQueFoi(lista)}.${escreveu} Vou conferir a agenda e já te respondo.`
      : `${saudacaoZap(p.tutor_nome, petshop.nome)} Recebi o seu pedido para cancelar ${oQueFoi(lista)}.${escreveu} Vou conferir o que já foi pago e já te respondo.`;
  };
  /** Com as regras ligadas no link, o cartão do pedido diz se o tutor aceitou (e quando). */
  // o pedido leva a promoção que valia no horário pedido (o cliente viu no link); aceito, o horário fica com ela
  const promoDe = (p: Pedido) => { const x = lerPromoDoHorario(p.promo); return x ? <span className="g-tag verde" title="O cliente pediu com a promoção. Aceito, o horário fica com ela.">{`promoção ${x.nome} · ${etiquetaPromo(x)}`}</span> : null; };
  const aceiteDe = (p: Pedido) => p.termos_aceitos_em
    ? <span className="g-tag verde" title={p.termos_texto ?? undefined}>aceitou {p.termos_texto ? "as regras" : "a declaração de vacinas"}{p.termos_texto && p.termos_vacinas ? " e declarou vacinas em dia" : ""} em {diaHora(p.termos_aceitos_em)}</span>
    : doLink.pedeAceite ? <span className="g-tag amarelo">sem aceite das regras</span> : null;
  const pendentes = (dados ?? []).filter((p) => !respondidosAgora.has(p.id));

  /** O tutor foi avisado (ou a pessoa disse que já avisou): o pedido sai da lista, em todos os aparelhos. */
  async function avisado(lista: Respondido[]) {
    try {
      ok(await sb.from("pedidos_agendamento").update({ avisado_em: new Date().toISOString() }).in("id", lista.map((r) => r.pedido.id)).eq("petshop_id", petshop.id).select("id"));
      void recarregar();
    } catch (e) { avisarErro(e); }
  }
  const gruposPendentes = agrupar(pendentes, chaveDe).map((g) => ({ ...g, lista: [...g.lista].sort(porHora) }));
  // um cartão por tutor e por resposta: quem aceitou dois pets avisa os dois numa mensagem só
  const gruposRespondidos = agrupar(respondidos, (r) => `${chaveDe(r.pedido)}:${r.resposta}`)
    .map((g) => ({ ...g, lista: [...g.lista].sort((a, b) => porHora(a.pedido, b.pedido)) }));

  /**
   * A pergunta "É a mesma pessoa?" já foi respondida para este pedido? Vale quando outro pedido do mesmo grupo (vários pets
   * pedidos juntos), ou do mesmo telefone e nome feito até um dia antes ou depois, já foi aceito. Lê do banco: vale em qualquer
   * aparelho e depois de recarregar a tela.
   */
  async function jaRespondeu(p: Pedido) {
    const base = () => sb.from("pedidos_agendamento").select("id, tutor_nome, criado_em").eq("petshop_id", petshop.id).eq("status", "aceito").neq("id", p.id);
    const r = p.grupo_id ? await base().eq("grupo_id", p.grupo_id).limit(1)
      : await base().eq("telefone", p.telefone).gte("criado_em", somaDias(new Date(p.criado_em), -1).toISOString()).lte("criado_em", somaDias(new Date(p.criado_em), 1).toISOString()).limit(20);
    return (r.data ?? []).some((x) => nomeDePet(x.tutor_nome) === nomeDePet(p.tutor_nome));
  }

  /**
   * Marca os pedidos na agenda, um por um. Se algum falhar, os outros seguem e o erro aparece no fim.
   * Antes, confere se o telefone do pedido já é de um tutor com outro nome: aí pergunta se é a mesma pessoa
   * (`decisao`: "existente" usa a ficha que já existe; "novo" cria ou usa um tutor com o nome do pedido).
   */
  // trava na hora do primeiro toque: dois toques seguidos em Aceitar não respondem o pedido duas vezes
  // (o banco aceitaria só o primeiro, mas a pessoa veria um erro de "já foi respondido" sem ter feito nada errado)
  const umaVez = useTrava();
  const aceitar = (lista: Pedido[], grupo: string, decisao?: Decisao, escolhidos?: Escolhidos, portes?: Portes) => umaVez(() => aceitarJa(lista, grupo, decisao, escolhidos, portes));
  async function aceitarJa(lista: Pedido[], grupo: string, decisao?: Decisao, escolhidos?: Escolhidos, portes?: Portes) {
    if (somenteLeitura() || ocupado) return;
    const profissional = atendem.length > 1 ? quem[grupo] || undefined : atendem[0]?.id;
    setOcupado(lista.length > 1 ? grupo : lista[0].id);
    if (!decisao) {
      // sem resposta do banco, segue como sempre foi (o pedido entra no tutor que tem o telefone)
      const r = await sb.rpc("pedido_tutores_do_telefone", { p_id: lista[0].id });
      const donos = (r.error ? [] : r.data ?? []) as TutorDoTelefone[];
      // a mesma conta do banco (nome_de_pet): sem acento, maiúsculas e espaços ("José" = "Jose")
      const igual = donos.findIndex((c) => nomeDePet(c.nome) === nomeDePet(lista[0].tutor_nome));
      if (donos.length && igual < 0) {
        // a pergunta é uma só por pedido: se outro pet do mesmo pedido (ou do mesmo tutor, na mesma hora) já foi aceito
        // e ninguém ganhou ficha com o nome de quem pediu, a resposta foi "é a mesma pessoa"
        if (await jaRespondeu(lista[0])) decisao = { como: "existente", tutor: donos[0].nome, alvo: donos[0].id };
        else { setDuvida({ lista, grupo, existente: donos[0] }); setOcupado(null); return; }
      }
      // já existe um tutor com esse telefone e esse nome: é ele (mesmo que não seja o mais antigo com o número)
      decisao ??= igual > 0 ? { como: "novo", alvo: donos[igual].id } : { como: "existente", alvo: donos[0]?.id };
    }
    // o nome do pet parece o de um pet da ficha do tutor (Tor e Thor, Mel e Melzinha): pergunta se é o mesmo, antes de marcar
    if (!escolhidos) {
      const perguntas = await petsParaPerguntar(lista, decisao.alvo);
      if (perguntas.length) {
        setPerguntaPet({ lista, grupo, decisao, tutor: decisao.tutor ?? lista[0].tutor_nome, perguntas, respostas: {} });
        setOcupado(null);
        return;
      }
      escolhidos = {};
    }
    // o valor depende do porte e ninguém disse o porte (nem o pedido, nem a ficha do pet): pergunta agora, antes de marcar
    if (!portes) {
      const faltam = await semPorteParaPerguntar(lista, escolhidos);
      if (faltam.length) { setPerguntaPorte({ lista, grupo, decisao, escolhidos, faltam, respostas: {} }); setOcupado(null); return; }
    }
    const feitos: Pedido[] = [];
    let falha: unknown = null;
    let comSinal = 0;
    // Uma operação só no banco (pedidos_aceitar_juntos, migração 20261235): ou todos os pets do pedido são aceitos, com a diária
    // do porte e o sinal, ou nenhum. Antes era uma ida ao banco por pet e por passo: demorava, e sair da tela no meio deixava
    // o pedido aceito pela metade.
    type Solto = { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
    const comoNovo = decisao.como === "novo";
    // o pet confirmado em cada pedido (migração 20261243). Sem nenhum, a chamada é a de sempre.
    const pets = Object.fromEntries(Object.entries(escolhidos).map(([pedido, pet]) => [pedido, pet.id]));
    const juntos = (forcar: boolean) => (sb as unknown as Solto).rpc("pedidos_aceitar_juntos", {
      p_ids: lista.map((p) => p.id), p_profissional: profissional ?? null, p_forcar: forcar, p_tutor_novo: comoNovo, p_portes: portes ?? null,
      ...(Object.keys(pets).length ? { p_pets: pets } : {}),
    });
    let r = await juntos(false);
    // creche ou hotel sem vaga em algum dia: o banco recusa e explica; a pessoa decide se aceita assim mesmo
    const cheia = r.error ? /CASA_CHEIA:\s*(.+)/.exec(textoDoErro(r.error))?.[1]?.trim() : null;
    if (cheia) {
      const forcar = await confirmar({
        titulo: "Casa cheia",
        texto: `${cheia.charAt(0).toUpperCase()}${cheia.slice(1)} Aceitar ${lista.length > 1 ? `os pedidos de ${listaDe(lista.map((p) => p.pet_nome))}` : `o pedido de ${lista[0].pet_nome}`} mesmo assim? Se não, o pedido continua esperando a sua resposta.`,
        confirmar: "Aceitar mesmo assim", perigo: true,
      });
      if (!forcar) { setOcupado(null); return; } // desistiu: o pedido segue pendente
      r = await juntos(true);
    }
    const semFuncao = !!r.error && (r.error.code === "PGRST202" || r.error.code === "42883");
    if (!semFuncao && r.error) falha = r.error;
    else if (!semFuncao) { feitos.push(...lista); comSinal = Number((r.data as { sinais?: unknown } | null)?.sinais ?? 0) || 0; }
    // banco antes da atualização: um por um, como era
    if (semFuncao) for (const p of lista) {
      const args = { p_id: p.id, p_profissional: ehEstadia(p) ? undefined : profissional, p_tutor_novo: comoNovo };
      try {
        const criado = ok(await sb.rpc("pedido_aceitar_como", args));
        if (portes?.[p.id]) await depoisDoPorte(criado, portes[p.id]);
        feitos.push(p);
      } catch (e) {
        // creche ou hotel sem vaga em algum dia: o banco recusa e explica; a pessoa decide se aceita assim mesmo
        const cheia = /CASA_CHEIA:\s*(.+)/.exec(textoDoErro(e))?.[1]?.trim();
        if (!cheia) { falha ??= e; continue; }
        const forcar = await confirmar({
          titulo: "Casa cheia",
          texto: `${cheia.charAt(0).toUpperCase()}${cheia.slice(1)} Aceitar o pedido de ${p.pet_nome} mesmo assim? Se não, o pedido continua esperando a sua resposta.`,
          confirmar: "Aceitar mesmo assim", perigo: true,
        });
        if (!forcar) continue; // desistiu: o pedido segue pendente
        try {
          ok(await sb.rpc("pedido_aceitar_como", { ...args, p_forcar: true }));
          feitos.push(p);
        } catch (e2) { falha ??= e2; }
      }
    }
    // com todas as reservas do pedido criadas: a diária de cada pet (pelo porte) e, por último, o sinal da regra do dono.
    // Nessa ordem a conta do sinal já enxerga os outros pets do mesmo tutor (desconto do segundo pet).
    const reservas = semFuncao ? feitos.filter(ehEstadia) : [];
    for (const p of reservas) await acertarDiaria(p);
    for (const p of reservas) if (await criarSinal(p)) comSinal++;
    if (feitos.length) {
      const tutor = decisao.tutor;
      if (tutor) setTutores((t) => ({ ...t, ...Object.fromEntries(feitos.map((p) => [p.id, tutor])) }));
      marcarRespondidos(feitos.map((p) => p.id));
      const doSinal = comSinal ? ` ${comSinal === 1 ? "O sinal já ficou" : "Os sinais já ficaram"} em A receber, pela sua regra.` : "";
      // o pet confirmado na pergunta do nome parecido: a mensagem usa o nome da ficha (Thor, não o "Tor" do pedido)
      const nomeDoPet = (p: Pedido) => escolhidos?.[p.id]?.nome ?? p.pet_nome;
      avisar(feitos.length === 1 ? (ehEstadia(feitos[0]) ? `Reserva de ${nomeDoPet(feitos[0])} feita. Ela está em ${casa}.${doSinal}` : `Horário de ${nomeDoPet(feitos[0])} marcado.`)
        : feitos.every(ehEstadia) ? `Reservas de ${listaDe(feitos.map(nomeDoPet))} feitas. Elas estão em ${casa}.${doSinal}` : `Horários de ${listaDe(feitos.map(nomeDoPet))} marcados.`);
      avisarMudanca();
    }
    if (falha) { avisarErro(falha); void recarregar(); }
    setOcupado(null);
  }

  /**
   * Dos pedidos da lista, os em que o nome do pet parece o de um pet ativo da ficha do tutor (e não é igual: igual, o banco já
   * usa a ficha). Tutor novo (sem `alvo`): nenhum. A conta é de src/lib/gestao/pet-parecido.ts.
   */
  async function petsParaPerguntar(lista: Pedido[], alvo: string | undefined): Promise<PerguntaPet["perguntas"]> {
    if (!alvo) return [];
    const r = await sb.from("pets").select("id, nome, especie, sexo, porte, ativo, foto, raca").eq("petshop_id", petshop.id).eq("cliente_id", alvo).order("criado_em").limit(100);
    const pets = (r.error ? [] : r.data ?? []) as PetDoTutor[];
    if (!pets.length) return [];
    const achados = lista.map((p) => ({ pedido: p, achado: acharPet(p.pet_nome, p.especie, pets) }));
    // o pet que já é de outro pedido da lista pelo nome igual não entra na pergunta dos outros
    const usados = new Set(achados.flatMap((x) => (x.achado.tipo === "igual" ? [x.achado.pet.id] : [])));
    return achados.flatMap(({ pedido, achado }) => {
      const candidatos = achado.tipo === "parecido" ? achado.pets.filter((x) => !usados.has(x.id)) : [];
      return candidatos.length ? [{ pedido, pets: candidatos }] : [];
    });
  }

  /** "Era outro pet?": busca os outros pets do tutor do pedido aceito e abre a escolha. */
  async function abrirTroca(p: Pedido) {
    try {
      const deOnde = p.estadia_id ? await sb.from("estadias").select("pet_id").eq("id", p.estadia_id).eq("petshop_id", petshop.id).maybeSingle()
        : p.agendamento_id ? await sb.from("agendamentos").select("pet_id").eq("id", p.agendamento_id).eq("petshop_id", petshop.id).maybeSingle() : null;
      const atual = deOnde?.data?.pet_id;
      const dono = atual ? (await sb.from("pets").select("cliente_id").eq("id", atual).eq("petshop_id", petshop.id).maybeSingle()).data?.cliente_id : null;
      if (!atual || !dono) throw new Error("Não achei o horário deste pedido. Recarregue a tela e tente de novo.");
      const outros = ok(await sb.from("pets").select("id, nome, especie, sexo, porte, ativo, foto, raca").eq("petshop_id", petshop.id).eq("cliente_id", dono).eq("ativo", true).neq("id", atual).order("nome").limit(100)) as PetDoTutor[];
      if (!outros.length) { avisar(`${primeiroNome(p.tutor_nome)} não tem outro pet na ficha.`); return; }
      setTroca({ pedido: p, pets: outros });
    } catch (e) { avisarErro(e); }
  }
  const trocarPet = (pedido: Pedido, pet: PetDoTutor) => umaVez(async () => {
    try {
      const r = ok(await sb.rpc("pedido_trocar_pet", { p_id: pedido.id, p_pet: pet.id })) as { apagado?: boolean } | null;
      setTroca(null);
      avisar(`Pronto: ${ehEstadia(pedido) ? "a reserva" : "o horário"} agora é de ${pet.nome}.${r?.apagado ? ` A ficha de ${pedido.pet_nome}, criada no pedido, foi apagada.` : ""}`);
      avisarMudanca();
      void recarregar();
    } catch (e) { avisarErro(e); }
  });

  /** Dos pedidos da lista, os de serviço em que o valor muda com o porte e nem o pedido nem a ficha do pet dizem o porte. */
  async function semPorteParaPerguntar(lista: Pedido[], escolhidos: Escolhidos = {}): Promise<Pedido[]> {
    // o pet confirmado na pergunta do nome parecido: vale o porte da ficha dele
    const candidatos = lista.filter((p) => !ehEstadia(p) && !p.porte && !escolhidos[p.id]?.porte && servicosDe(p).some((s) => precoMudaComPorte(s)));
    if (!candidatos.length) return [];
    // pet que já é da casa e tem porte na ficha: o banco usa o da ficha, não precisa perguntar
    const r = await sb.rpc("pedido_tutores_do_telefone", { p_id: lista[0].id });
    const donos = (r.error ? [] : r.data ?? []) as TutorDoTelefone[];
    if (!donos.length) return candidatos;
    const pets = (await sb.from("pets").select("nome, porte").eq("petshop_id", petshop.id).in("cliente_id", donos.map((d) => d.id)).not("porte", "is", null).limit(200)).data ?? [];
    const comPorte = new Set(pets.map((x) => nomeDePet(x.nome)));
    return candidatos.filter((p) => !comPorte.has(nomeDePet(p.pet_nome)));
  }
  /**
   * Depois de aceitar com o porte respondido na hora. Com o porte: guarda na ficha do pet (se estava em branco) e coloca no
   * horário o preço do serviço para esse porte (o banco deixou em branco, porque o pedido veio sem porte).
   * Com "Não sei ainda": o horário segue sem valor e ganha o lembrete para conferir na hora.
   */
  async function depoisDoPorte(agendamentoId: unknown, resposta: string) {
    if (typeof agendamentoId !== "string") return;
    try {
      const ag = (await sb.from("agendamentos").select("pet_id, servico_id, obs").eq("id", agendamentoId).eq("petshop_id", petshop.id).maybeSingle()).data;
      if (!ag) return;
      if (resposta === "depois") {
        if (!(ag.obs ?? "").includes(NOTA_PORTE)) await sb.from("agendamentos").update({ obs: [ag.obs, NOTA_PORTE].filter(Boolean).join(" ").slice(0, 400) }).eq("id", agendamentoId).eq("petshop_id", petshop.id).select("id");
        return;
      }
      await sb.from("pets").update({ porte: resposta }).eq("id", ag.pet_id).eq("petshop_id", petshop.id).is("porte", null).select("id");
      // o banco coloca o preço da lista para esse porte, só se o horário estava sem valor (quem aceita pode não ver a lista)
      const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ error: { code?: string } | null }> }).rpc("agendamento_preco_da_tabela", { p_id: agendamentoId });
      if (r.error && (r.error.code === "PGRST202" || r.error.code === "42883")) {
        // banco antes da atualização: a mesma conta aqui
        const atual = (await sb.from("agendamentos").select("preco").eq("id", agendamentoId).eq("petshop_id", petshop.id).maybeSingle()).data as { preco: number | null } | null;
        const s = servicos.find((x) => x.id === ag.servico_id);
        const preco = s ? { P: s.preco_p, M: s.preco_m, G: s.preco_g, GG: s.preco_gg }[resposta] ?? null : null;
        if (atual && atual.preco == null && preco != null) await sb.from("agendamentos").update({ preco }).eq("id", agendamentoId).eq("petshop_id", petshop.id).is("preco", null).select("id");
      }
    } catch { /* o horário já foi marcado: o porte e o valor ficam para acertar na ficha e no horário */ }
  }

  /** Reserva de hotel aceita pelo link com a opção de diária por porte ligada: a diária da reserva passa a ser a do porte do pedido. */
  async function acertarDiaria(p: Pedido) {
    // a conta é do banco: quem aceita o pedido pode não ver a lista de preços
    if (p.tipo !== "hotel" || !porteDe(petshop).ativo || !p.porte) return;
    await sb.rpc("pedido_acertar_diaria", { p_id: p.id }).then(() => {}, () => {});
  }

  /**
   * Com "Sinal na reserva" ligado, a reserva aceita pelo link já nasce com o sinal em A receber, como a reserva feita aqui dentro.
   * A conta é do banco, pela regra do dono (quem aceita pode não mexer com dinheiro). Banco antes da atualização: segue sem sinal.
   */
  async function criarSinal(p: Pedido) {
    const regra = sinalDe(petshop);
    if (!regra.ativo || !regra.valor || (p.tipo !== "hotel" && !regra.creche)) return false;
    const r = await sb.rpc("pedido_criar_sinal", { p_id: p.id });
    return !r.error && (r.data as { criado?: boolean } | null)?.criado === true;
  }

  const recusar = (lista: Pedido[], grupo: string) => umaVez(() => recusarJa(lista, grupo));
  async function recusarJa(lista: Pedido[], grupo: string) {
    if (somenteLeitura() || ocupado) return;
    const nomes = listaDe(lista.map((p) => p.pet_nome));
    const sim = await confirmar({
      titulo: lista.length > 1 ? `Recusar os pedidos de ${nomes}?` : `Recusar o pedido de ${nomes}?`,
      texto: `${lista.every(ehEstadia) ? (lista.length > 1 ? "As vagas voltam a ficar livres" : "A vaga volta a ficar livre") : lista.length > 1 ? "Os horários voltam a ficar livres" : "O horário volta a ficar livre"} no link. Depois é só avisar o tutor pelo WhatsApp.`,
      confirmar: lista.length > 1 ? "Recusar todos" : "Recusar", perigo: true,
    });
    if (!sim) return;
    setOcupado(lista.length > 1 ? grupo : lista[0].id);
    try {
      const linhas = ok(await sb.from("pedidos_agendamento").update({ status: "recusado" }).in("id", lista.map((p) => p.id)).eq("petshop_id", petshop.id).eq("status", "pendente").select("id"));
      const feitos = lista.filter((p) => linhas.some((l) => l.id === p.id));
      if (!feitos.length) throw new Error(lista.length > 1 ? "Esses pedidos já foram respondidos." : "Esse pedido já foi respondido.");
      marcarRespondidos(feitos.map((p) => p.id));
      avisar(feitos.length > 1 ? "Pedidos recusados." : "Pedido recusado.");
      void recarregar();
    } catch (e) {
      avisarErro(e);
      void recarregar();
    } finally { setOcupado(null); }
  }

  /**
   * Com o sinal ligado nas opções do hotel, a confirmação já pede o sinal: quanto é (o valor que ficou em A receber em cada reserva),
   * o texto que o dono escreveu e a chave Pix. Quem não mexe com dinheiro não lê o valor: a mensagem dele fala só da regra.
   */
  function fraseDoSinal(lista: Pedido[]) {
    const p = lista[0];
    const s = sinalDe(petshop);
    if (!s.ativo || !s.valor || (p.tipo !== "hotel" && !s.creche)) return "";
    const politica = s.politica.trim() ? ` ${s.politica.trim()}` : "";
    const valores = lista.map((x) => (x.estadia_id ? tudo?.sinais.get(x.estadia_id) : undefined));
    const pagos = lista.map((x) => (x.estadia_id ? tudo?.sinaisPagos.get(x.estadia_id) : undefined));
    // o sinal de todos já entrou: a mensagem diz que foi recebido, sem pedir de novo
    if (pagos.every((v): v is number => v != null)) {
      const total = centavos(pagos.reduce((t, v) => t + v, 0));
      return ` O sinal de ${brl(total)} já foi recebido.${politica}`;
    }
    // parte pago, parte a receber: pede só o que falta
    if (valores.some((v) => v != null) && valores.every((v, i) => v != null || pagos[i] != null)) {
      const falta = lista.flatMap((x, i) => (valores[i] != null ? [{ nome: x.pet_nome, v: valores[i]! }] : []));
      const total = centavos(falta.reduce((t, x) => t + x.v, 0));
      const partes = lista.length > 1 ? ` (${listaDe(falta.map((x) => `${brl(x.v)} de ${x.nome}`))})` : "";
      const pix = pixDoSinal(petshop);
      return ` Para garantir a reserva, pedimos um sinal de ${brl(total)}${partes}.${politica}${pix ? ` Pix: ${pix}.` : " Me diga como prefere pagar."}`;
    }
    if (valores.every((v): v is number => v != null)) {
      const total = centavos(valores.reduce((t, v) => t + v, 0));
      const partes = lista.length > 1 ? ` (${listaDe(lista.map((x, i) => `${brl(valores[i])} de ${x.pet_nome}`))})` : "";
      const pix = pixDoSinal(petshop);
      return ` Para garantir a reserva, pedimos um sinal de ${brl(total)}${partes}.${politica}${pix ? ` Pix: ${pix}.` : " Me diga como prefere pagar."}`;
    }
    return ` Para garantir a reserva, pedimos um sinal de ${s.modo === "valor" ? `${brl(s.valor)}${lista.length > 1 ? " por pet" : ""}` : `${s.valor}% do valor da reserva`}.${politica}${vejoFinanceiro ? "" : " O valor certo e a forma de pagar eu te passo em seguida."}`;
  }

  /** Mensagem pronta para o tutor: cita todos os pets da mesma resposta e o horário de cada um. */
  function mensagem(lista: Respondido[]) {
    const p = lista[0].pedido;
    const oi = saudacaoZap(lista[0].tutor ?? p.tutor_nome, petshop.nome);
    const nomes = listaDe(lista.map((r) => r.pedido.pet_nome));
    // endereços para o tutor: a página do pedido (confirmação) e o link para escolher outro horário (recusa)
    const base = `${window.location.origin}/gestao/agendar/${petshop.link_codigo}`;
    // com o cancelamento pelo link ligado, a confirmação já diz que é por esse endereço que o tutor cancela ou pede outra data
    // o prazo de cancelar pelo link conta da chegada: se ele já passou (reserva para amanhã, prazo de 2 dias), a mensagem não promete
    const noPrazo = new Date(p.inicio).getTime() - doLink.cancelarHoras * 36e5 > Date.now();
    const acompanhar = `\n\nVeja a confirmação aqui: ${base}/pedido/${p.id}${!doLink.cancelar ? "" : noPrazo ? `\nPor esse endereço você também cancela ou pede outra data, ${prazoPorExtenso(doLink.cancelarHoras)}.` : "\nSe precisar mudar ou cancelar, fale com a gente por aqui."}`;
    // o valor que o tutor viu no link (só quem recebe lê) e o endereço do pet shop, quando preenchido em Meu pet shop
    const linhasVistas = vistosDe(lista.map((r) => r.pedido));
    const visto = lista[0].resposta === "aceito" && linhasVistas.length === lista.length ? valorNaFrase(linhasVistas) : null;
    const doValor = !visto ? "" : ehEstadia(p) ? ` A estimativa que o link mostrou: ${visto}.` : ` Valor: ${visto}.`;
    const ondeFica = fraseDoEndereco(petshop);
    if (ehEstadia(p)) {
      // dia de experiência: a mensagem diz que é o dia de experiência e quanto custa (o preço só para quem vê o dinheiro)
      const exp = p.tipo === "creche" && lista.every((r) => r.pedido.experiencia);
      const precoExp = exp && vejoFinanceiro ? precoDaExperiencia(petshop) : null;
      const oQue = exp ? `o dia de experiência de ${nomes} na creche, ${periodoDe(p)}` : `${p.tipo === "hotel" ? "o hotel" : "a creche"} de ${nomes}, ${periodoDe(p)}`;
      const doPreco = !exp || lista[0].resposta === "recusado" ? "" : precoExp == null ? "" : precoExp > 0 ? ` O dia de experiência custa ${brl(precoExp)}${lista.length > 1 ? " por pet" : ""}, pago na saída.` : " O dia de experiência é por nossa conta.";
      return lista[0].resposta === "recusado"
        ? `${oi} Recebemos o seu pedido para ${oQue}, mas não temos vaga nessas datas. Você pode escolher outras datas aqui: ${base}\n\nSe preferir, me diga o período que fica bom para você.`
        : `${oi} Está confirmado: ${oQue}, com chegada às ${hora(p.inicio)}${p.tipo === "hotel" ? ` e saída às ${hora(p.fim)}` : ""}.${doPreco}${doValor}${fraseDoSinal(lista.map((r) => r.pedido))}${ondeFica} Esperamos vocês!${acompanhar}`;
    }
    if (lista[0].resposta === "recusado") {
      return `${oi} Recebemos o seu pedido para ${nomes}, mas ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}, não vamos conseguir atender. Você pode escolher outro horário livre aqui: ${base}\n\nSe preferir, me diga os dias e períodos que ficam bons para você.`;
    }
    // na mensagem, vários serviços viram uma lista: "Banho e tosa, Hidratação e Corte de unhas"
    const naFrase = (x: Respondido) => (x.pedido.outros_servicos?.length ? listaDe(servicosDe(x.pedido).flatMap((s) => (s ? [s.nome] : []))) || x.servico : x.servico);
    if (lista.length === 1) {
      const oQue = naFrase(lista[0]) ? `${naFrase(lista[0])} de ${p.pet_nome}` : `horário de ${p.pet_nome}`;
      return `${oi} Está confirmado: ${oQue} ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}.${doValor}${ondeFica} Esperamos vocês!${acompanhar}`;
    }
    // cada pet com o seu serviço, o seu dia e a sua hora (o dia só se repete quando muda)
    const linhas = lista.map((r, i) => {
      const dia = quandoNaFrase(r.pedido.inicio);
      const mesmoDia = i > 0 && dia === quandoNaFrase(lista[i - 1].pedido.inicio);
      return `${naFrase(r) ? `${naFrase(r)} de ${r.pedido.pet_nome}` : r.pedido.pet_nome} ${mesmoDia ? "" : `${dia}, `}às ${hora(r.pedido.inicio)}`;
    });
    return `${oi} Está confirmado: ${listaDe(linhas)}.${doValor}${ondeFica} Esperamos vocês!${acompanhar}`;
  }

  if (!pendentes.length && !respondidos.length && !gruposRecados.length) return null;
  const novidadeDoCliente = gruposRecados.length > 0 || respondidos.some((r) => r.resposta === "cancelou");
  // conta gente, não pedido: o mesmo tutor (telefone) com vários pedidos é um só
  const esperam = new Set(pendentes.map((p) => p.telefone.replace(/\D/g, "").slice(-8) || p.id)).size;

  return (
    <section className="g-pl" aria-label="Pedidos pelo link">
      <div className="g-pl-t">
        <span className="g-pl-ico" aria-hidden><Link2 /></span>
        <div>
          <h2>Pedidos pelo link</h2>
          <p className="g-p">{esperam === 0 ? (novidadeDoCliente ? "Tem novidade de cliente nos pedidos." : "Tudo respondido. Falta só avisar o tutor.") : `${esperam === 1 ? "1 tutor espera" : `${esperam} tutores esperam`} a sua resposta${pendentes.length > esperam ? ` (${pendentes.length} pedidos)` : ""}.`}</p>
        </div>
        {pendentes.length > 0 && <span className="g-tag laranja" title={pendentes.length === 1 ? "1 pedido esperando" : `${pendentes.length} pedidos esperando`}>{pendentes.length}</span>}
      </div>

      <div className="g-pl-lista">
        {gruposRecados.map((g) => {
          const p = g.lista[0];
          const mudar = p.cliente_pediu === "mudar";
          const zap = linkWhatsApp(p.telefone, mensagemDoRecado(g.lista));
          return (
            <article key={`r:${g.id}`} className="g-pl-item respondido cliente">
              <div className="g-pl-quem">
                <span className="g-pl-feito" aria-hidden><CalendarClock /></span>
                <div className="g-pl-nome">
                  <b>{listaDe(g.lista.map((x) => x.pet_nome))} <span className={`g-tag ${mudar ? "azul" : "amarelo"}`}>{mudar ? "pediu outra data" : "pediu para cancelar"}</span></b>
                  <span>
                    {primeiroNome(p.tutor_nome)} {mudar ? "pediu pelo link para mudar" : "pediu pelo link para cancelar"} {oQueFoi(g.lista)}{p.status === "pendente" ? " (ainda esperando a sua resposta)" : ""}.
                    {p.cliente_recado ? ` Recado: “${p.cliente_recado.trim()}”${/[.!?…]$/.test(p.cliente_recado.trim()) ? "" : "."}` : ""}
                    {jaCancelada(g.lista) ? ` A reserva já foi cancelada em ${casa}. Falta só responder ao tutor.`
                      : mudar
                      ? ` Nada foi desmarcado. Para mudar, ${p.status === "pendente" ? "recuse este pedido e combine a nova data" : ehEstadia(p) ? `abra a reserva em ${casa}` : "abra o horário na Agenda"}.`
                      : ` ${ehEstadia(p) ? "Esta reserva tem sinal combinado (pago ou a receber)" : "Há pagamento neste horário"}, então nada foi cancelado: ${ehEstadia(p) ? `cancele a reserva em ${casa}` : "desmarque o horário na Agenda"} e decida o que fazer com o valor.`}
                  </span>
                </div>
              </div>
              <div className="g-pl-acoes">
                {zap && <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void recadoVisto(g.lista)}><MessageCircle />Responder no WhatsApp</a>}
                <button type="button" className="g-btn fantasma p" onClick={() => void recadoVisto(g.lista)}>{mudar ? "Já respondi" : "Já resolvi"}</button>
              </div>
            </article>
          );
        })}

        {gruposRespondidos.filter((g) => g.lista[0].resposta === "cancelou").map((g) => {
          const lista = g.lista.map((r) => r.pedido);
          const p = lista[0];
          const tinhaAceito = lista.some((x) => x.agendamento_id || x.estadia_id);
          const zap = linkWhatsApp(p.telefone, mensagemDoCancelado(lista));
          return (
            <article key={g.id} className="g-pl-item respondido recusado cliente">
              <div className="g-pl-quem">
                <span className="g-pl-feito" aria-hidden><UserX /></span>
                <div className="g-pl-nome">
                  <b>{listaDe(lista.map((x) => x.pet_nome))} <span className="g-tag vermelho">cancelado pelo cliente</span></b>
                  <span>
                    {primeiroNome(p.tutor_nome)} cancelou pelo link {oQueFoi(lista)}{p.cliente_cancelou_em ? `, em ${diaHora(p.cliente_cancelou_em)}` : ""}.
                    {tinhaAceito ? (ehEstadia(p) ? ` A reserva saiu de ${casa} e a vaga voltou.` : " O horário foi desmarcado na Agenda e voltou a ficar livre.") : " O pedido ainda esperava a sua resposta."}
                    {p.cliente_recado ? ` Motivo: “${p.cliente_recado.trim()}”${/[.!?…]$/.test(p.cliente_recado.trim()) ? "" : "."}` : ""}
                  </span>
                </div>
              </div>
              <div className="g-pl-acoes">
                {zap && <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void avisado(g.lista)}><MessageCircle />Responder no WhatsApp</a>}
                <button type="button" className="g-btn fantasma p" onClick={() => void avisado(g.lista)}>Já vi</button>
              </div>
            </article>
          );
        })}

        {gruposRespondidos.filter((g) => g.lista[0].resposta !== "cancelou").map((g) => {
          const p = g.lista[0].pedido;
          const aceito = g.lista[0].resposta === "aceito";
          const zap = linkWhatsApp(p.telefone, mensagem(g.lista));
          const varios = g.lista.length > 1;
          return (
            <article key={g.id} className={`g-pl-item respondido ${g.lista[0].resposta}`}>
              <div className="g-pl-quem">
                <span className="g-pl-feito" aria-hidden>{aceito ? <Check /> : <X />}</span>
                <div className="g-pl-nome">
                  <b>{listaDe(g.lista.map((r) => r.pedido.pet_nome))}</b>
                  <span>
                    {!aceito ? (varios ? "Pedidos recusados." : "Pedido recusado.")
                      : varios && ehEstadia(p) ? `Reservas de ${p.tipo === "hotel" ? "hotel" : "creche"} feitas: ${periodoDe(p)}.`
                      : varios ? `Marcados para ${quandoNaTela(p.inicio)}: ${listaDe(g.lista.map((r) => `${r.pedido.pet_nome} às ${hora(r.pedido.inicio)}`))}.`
                      : ehEstadia(p) ? `Reserva de ${p.tipo === "hotel" ? "hotel" : "creche"} feita: ${periodoDe(p)}.`
                      : `Marcado para ${quandoNaTela(p.inicio)}, às ${hora(p.inicio)}.`} Avise {primeiroNome(g.lista[0].tutor ?? p.tutor_nome)}.
                  </span>
                  {/* o aceite criou um pet novo para um tutor que já tinha outros: um toque para corrigir, se era um deles */}
                  {/* só para quem cuida da área do pedido (o banco confere o mesmo: agenda para horário, creche_hotel para reserva) */}
                  {aceito && g.lista.some((r) => r.pedido.pet_novo && posso(ehEstadia(r.pedido) ? "creche_hotel" : "agenda")) && (
                    <span className="g-pl-petnovo">
                      {g.lista.filter((r) => r.pedido.pet_novo && posso(ehEstadia(r.pedido) ? "creche_hotel" : "agenda")).map((r) => (
                        <span key={r.pedido.id} data-teste="pet-novo">
                          <span className="g-tag amarelo" title="O nome não bate com nenhum pet da ficha deste tutor. Foi criado um pet novo.">{varios ? `${r.pedido.pet_nome}: pet novo` : "pet novo"}</span>
                          <button type="button" className="g-link" aria-label={`${r.pedido.pet_nome} era outro pet?`} onClick={() => void abrirTroca(r.pedido)}>Era outro pet?</button>
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
              <div className="g-pl-acoes">
                {zap && (
                  <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void avisado(g.lista)}>
                    <MessageCircle />{aceito ? "Confirmar no WhatsApp" : ehEstadia(p) ? "Sugerir outras datas" : "Sugerir outro horário"}
                  </a>
                )}
                <button type="button" className="g-btn fantasma p" onClick={() => void avisado(g.lista)}>Já avisei</button>
              </div>
            </article>
          );
        })}

        {gruposPendentes.map((g) => {
          const p = g.lista[0];
          const varios = g.lista.length > 1;
          const servico = rotulo(p);
          const fim = g.lista[g.lista.length - 1].fim;
          const passou = new Date(p.inicio).getTime() < Date.now();
          const detalhesDe = (x: Pedido) => [ESPECIE[x.especie] ?? null, x.porte ? `porte ${x.porte}` : null].filter(Boolean).join(", ");
          const nomes = listaDe(g.lista.map((x) => x.pet_nome));
          const seletor = atendem.length > 1 && !ehEstadia(p) && (
            <select className="g-select g-pl-com" aria-label={`Quem atende ${nomes}`} value={quem[g.id] ?? ""} onChange={(e) => setQuem((q) => ({ ...q, [g.id]: e.target.value }))}>
              <option value="">Quem atende? Decidir depois</option>
              {atendem.map((x) => <option key={x.id} value={x.id}>Com {x.nome}</option>)}
            </select>
          );

          if (!varios) {
            const detalhes = detalhesDe(p);
            return (
              <article key={g.id} className="g-pl-item" style={{ "--cor": p.tipo === "creche" ? "#3b9bd9" : p.tipo === "hotel" ? "#7c6bd6" : corServico(p.servico_id) } as React.CSSProperties}>
                <div className="g-pl-quem">
                  <AvatarPet pet={{ nome: p.pet_nome, especie: p.especie }} />
                  <div className="g-pl-nome">
                    <b>{p.pet_nome}{detalhes && <small> · {detalhes}</small>}</b>
                    <span>{p.tutor_nome} · {fmtTelefone(p.telefone)}</span>
                  </div>
                </div>
                <div className="g-pl-quando">
                  <span className="g-pl-serv"><i aria-hidden />{servico ?? "Serviço"}</span>
                  <span className="g-pl-hora"><Clock aria-hidden />{ehEstadia(p) ? periodoDe(p) : `${quandoNaTela(p.inicio)}, ${hora(p.inicio)}`}</span>
                  {valorDe(p)}
                  {vistoDe([p])}
                  {passou && <span className="g-tag vermelho">{ehEstadia(p) ? "a data já passou" : "horário já passou"}</span>}
                  {p.experiencia && <span className="g-tag azul">pediu dia de experiência</span>}
                  {p.tipo === "creche" && fechadosDe(p, horarioDaCreche(petshop)).length > 0 && <span className="g-tag amarelo">pelo seu horário, a creche não abre em {fechadosDe(p, horarioDaCreche(petshop)).map((d) => dataCurta(d)).join(", ")}</span>}
                  {promoDe(p)}
                  {aceiteDe(p)}
                </div>
                {p.obs && <p className="g-pl-obs">{p.obs}</p>}
                <div className="g-pl-acoes">
                  {seletor}
                  <button type="button" className="g-btn verde p" disabled={ocupado !== null} aria-busy={ocupado === p.id} onClick={() => void aceitar([p], g.id)}><Check />{ocupado === p.id ? "Aceitando…" : "Aceitar"}</button>
                  <button type="button" className="g-btn sec p" disabled={ocupado !== null} onClick={() => void recusar([p], g.id)}>Recusar</button>
                </div>
                {ocupado === p.id && <p className="g-pl-andando" role="status">Marcando o pedido de {p.pet_nome}… Espere só um instante nesta tela.</p>}
              </article>
            );
          }

          return (
            <article key={g.id} className="g-pl-item" style={{ "--cor": p.tipo === "creche" ? "#3b9bd9" : p.tipo === "hotel" ? "#7c6bd6" : corServico(p.servico_id) } as React.CSSProperties}>
              <div className="g-pl-quem">
                <span className="g-pl-varios" aria-hidden>
                  {g.lista.slice(0, 3).map((x) => <AvatarPet key={x.id} pet={{ nome: x.pet_nome, especie: x.especie }} />)}
                </span>
                <div className="g-pl-nome">
                  <b>{nomes} <small>· {primeiroNome(p.tutor_nome)}</small></b>
                  <span>{p.tutor_nome} · {fmtTelefone(p.telefone)}</span>
                </div>
              </div>
              <div className="g-pl-quando">
                <span className="g-pl-serv"><i aria-hidden />{servico ?? "Serviço"}</span>
                <span className="g-pl-hora"><Clock aria-hidden />{ehEstadia(p) ? `${periodoDe(p)}, chega às ${hora(p.inicio)} e sai às ${hora(p.fim)}` : `${quandoNaTela(p.inicio)}, das ${hora(p.inicio)} às ${hora(fim)}`}</span>
                <span className="g-tag azul">{ehEstadia(p) ? `${g.lista.length} pets do mesmo tutor` : `${g.lista.length} pets, um depois do outro`}</span>
                {vistoDe(g.lista)}
                {passou && <span className="g-tag vermelho">{ehEstadia(p) ? "a data já passou" : "horário já passou"}</span>}
                {p.experiencia && <span className="g-tag azul">pediram dia de experiência</span>}
                {promoDe(p)}
                {aceiteDe(p)}
              </div>
              <ul className="g-pl-pets">
                {g.lista.map((x) => {
                  const detalhes = detalhesDe(x);
                  return (
                    <li key={x.id}>
                      {!ehEstadia(x) && <span className="g-pl-pet-h">{hora(x.inicio)}</span>}
                      <span className="g-pl-pet-n"><b>{x.pet_nome}</b>{detalhes && <small>{detalhes}</small>}{valorDe(x) && <small className="g-pl-valor-p">{valorDe(x)}</small>}</span>
                      <span className="g-pl-pet-b">
                        <button type="button" className="g-btn sec p" disabled={ocupado !== null} aria-label={`Aceitar só ${x.pet_nome}`} onClick={() => void aceitar([x], g.id)}>{ocupado === x.id ? "…" : "Aceitar"}</button>
                        <button type="button" className="g-btn fantasma p" disabled={ocupado !== null} aria-label={`Recusar só ${x.pet_nome}`} onClick={() => void recusar([x], g.id)}>Recusar</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {p.obs && <p className="g-pl-obs">{p.obs}</p>}
              <div className="g-pl-acoes">
                {seletor}
                <button type="button" className="g-btn verde p" disabled={ocupado !== null} aria-busy={ocupado === g.id} onClick={() => void aceitar(g.lista, g.id)}><Check />{ocupado === g.id ? "Aceitando todos…" : "Aceitar todos"}</button>
                <button type="button" className="g-btn sec p" disabled={ocupado !== null} onClick={() => void recusar(g.lista, g.id)}>Recusar todos</button>
              </div>
              {ocupado === g.id && <p className="g-pl-andando" role="status">Marcando os {g.lista.length} pedidos de uma vez… Espere só um instante nesta tela.</p>}
            </article>
          );
        })}
      </div>

      {perguntaPorte && (() => {
        const q = perguntaPorte;
        const tudoRespondido = q.faltam.every((p) => q.respostas[p.id]);
        const responder = (id: string, v: string) => setPerguntaPorte({ ...q, respostas: { ...q.respostas, [id]: v } });
        return (
          <Folha titulo={q.faltam.length > 1 ? "Qual é o porte de cada um?" : `Qual é o porte de ${q.faltam[0].pet_nome}?`} aoFechar={() => setPerguntaPorte(null)}
            rodape={<>
              <button type="button" className="g-btn sec" onClick={() => setPerguntaPorte(null)}>Voltar</button>
              <button type="button" className="g-btn pri" disabled={!tudoRespondido} onClick={() => { setPerguntaPorte(null); void aceitar(q.lista, q.grupo, q.decisao, q.escolhidos, q.respostas); }}>{q.lista.length > 1 ? "Aceitar todos" : "Aceitar"}</button>
            </>}>
            <div className="g-pilha">
              <p className="g-muted g-p">O pedido veio sem o porte, e o valor do serviço muda com ele. Escolha o porte para o horário já entrar com o valor certo. Fechando esta janela, o pedido continua esperando.</p>
              {q.faltam.map((p) => {
                const lista = servicosDe(p);
                // com mais de um serviço, o preço do porte é a soma (sem preço em algum deles: não mostra)
                const precoDe = (porte: string) => {
                  if (!lista.length || lista.some((s) => !s)) return null;
                  const v = lista.map((s) => ({ P: s!.preco_p, M: s!.preco_m, G: s!.preco_g, GG: s!.preco_gg }[porte] ?? null));
                  return v.some((x) => x == null) ? null : centavos(v.reduce<number>((t, x) => t + Number(x), 0));
                };
                return (
                  <div key={p.id} className="g-card areia g-pilha p" role="group" aria-label={`Porte de ${p.pet_nome}`}>
                    <div className="g-fila"><AvatarPet pet={{ nome: p.pet_nome, especie: p.especie }} /><div className="g-cresce"><b>{p.pet_nome}</b><div className="g-pp g-muted">{rotulo(p) ?? "Serviço"} · {quandoNaTela(p.inicio)}, {hora(p.inicio)}</div></div></div>
                    <div className="g-chips">
                      {PORTES.map((x) => <button key={x.id} type="button" className="g-chip" aria-pressed={q.respostas[p.id] === x.id} onClick={() => responder(p.id, x.id)}>{x.rotulo}{vejoFinanceiro && precoDe(x.id) != null ? ` · ${brl(precoDe(x.id))}` : ""}</button>)}
                    </div>
                    <button type="button" className="g-chip" aria-pressed={q.respostas[p.id] === "depois"} onClick={() => responder(p.id, "depois")}>Não sei ainda — conferir o valor na hora</button>
                    {q.respostas[p.id] === "depois" && <p className="g-muted g-pp" role="status">O horário entra sem valor, com a anotação "{NOTA_PORTE}"</p>}
                  </div>
                );
              })}
            </div>
          </Folha>
        );
      })()}

      {perguntaPet && (() => {
        const q = perguntaPet;
        const umSo = q.perguntas.length === 1 && q.perguntas[0].pets.length === 1;
        // um toque por pergunta: respondida a última, o aceite segue sozinho
        const responder = (id: string, r: PetDoTutor | "outro") => {
          const respostas = { ...q.respostas, [id]: r };
          if (!q.perguntas.every((x) => respostas[x.pedido.id])) { setPerguntaPet({ ...q, respostas }); return; }
          setPerguntaPet(null);
          const escolhidos: Escolhidos = {};
          for (const [pedido, v] of Object.entries(respostas)) if (v !== "outro") escolhidos[pedido] = v;
          void aceitar(q.lista, q.grupo, q.decisao, escolhidos);
        };
        // o mesmo pet não serve a dois pedidos (o banco recusa): o escolhido num pedido fica desligado nos outros
        const escolhidoEm = (pet: PetDoTutor, pedido: string) =>
          Object.entries(q.respostas).some(([outro, v]) => outro !== pedido && v !== "outro" && v.id === pet.id);
        const detalhesDoPet = (x: PetDoTutor) => [ESPECIE[x.especie ?? ""] ?? null, x.raca, x.porte ? `porte ${x.porte}` : null].filter(Boolean).join(" · ");
        return (
          <Folha titulo={umSo ? perguntaDoPet(q.perguntas[0].pets[0]) : q.perguntas.length > 1 ? "Esses pets já estão na ficha?" : `${q.perguntas[0].pedido.pet_nome} já está na ficha?`} aoFechar={() => setPerguntaPet(null)}>
            <div className="g-pilha" data-teste="pergunta-pet">
              <p className="g-muted g-p">Na ficha de {primeiroNome(q.tutor)} tem um nome parecido com o do pedido. Fechando esta janela, o pedido continua esperando.</p>
              {q.perguntas.map(({ pedido, pets }) => {
                const r = q.respostas[pedido.id];
                const livres = pets.filter((x) => !escolhidoEm(x, pedido.id));
                return (
                  <div key={pedido.id} className="g-card areia g-pilha p" role="group" aria-label={`Pet do pedido: ${pedido.pet_nome}`}>
                    <div className="g-pp g-muted">No pedido: <b>{pedido.pet_nome}</b>{ESPECIE[pedido.especie] ? ` · ${ESPECIE[pedido.especie]}` : ""}{pedido.porte ? ` · porte ${pedido.porte}` : ""}</div>
                    {!livres.length && (
                      <p className="g-pp g-muted" data-teste="pet-ja-escolhido">
                        {pets.map((x) => x.nome).join(" e ")} já {pets.length > 1 ? "foram escolhidos" : "foi escolhido"} para outro pedido.
                      </p>
                    )}
                    {livres.length > 0 && pets.map((x) => (
                      <div key={x.id} className="g-fila">
                        <AvatarPet pet={x} />
                        <div className="g-cresce"><b>{x.nome}</b><div className="g-pp g-muted">{detalhesDoPet(x) || "já é da casa"}</div></div>
                      </div>
                    ))}
                    <div className="g-fila g-pl-sim">
                      {livres.length > 0 && pets.map((x) => (
                        <button key={x.id} type="button" className="g-btn pri p" aria-pressed={r !== undefined && r !== "outro" && r.id === x.id}
                          disabled={escolhidoEm(x, pedido.id)} title={escolhidoEm(x, pedido.id) ? `${x.nome} já foi escolhido para outro pedido` : undefined}
                          onClick={() => responder(pedido.id, x)}>{simDoPet(x, pets.length > 1)}</button>
                      ))}
                      <button type="button" className="g-btn sec p" aria-pressed={r === "outro"} onClick={() => responder(pedido.id, "outro")}>É outro pet</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Folha>
        );
      })()}

      {troca && (
        <Folha titulo="Era outro pet?" aoFechar={() => setTroca(null)} rodape={<button type="button" className="g-btn sec" onClick={() => setTroca(null)}>Voltar</button>}>
          <div className="g-pilha" data-teste="troca-pet">
            <p className="g-muted g-p">
              Escolha o pet certo: {ehEstadia(troca.pedido) ? "a reserva passa" : "o horário passa"} para ele. A ficha de {troca.pedido.pet_nome}, criada neste pedido, sai se não tiver mais nada.
            </p>
            {troca.pets.map((x) => (
              <button key={x.id} type="button" className="g-card areia g-fila p g-pl-trocar" onClick={() => trocarPet(troca.pedido, x)}>
                <AvatarPet pet={x} />
                <span className="g-cresce"><b>{x.nome}</b><span className="g-pp g-muted">{[ESPECIE[x.especie ?? ""] ?? null, x.porte ? `porte ${x.porte}` : null].filter(Boolean).join(" · ")}</span></span>
              </button>
            ))}
          </div>
        </Folha>
      )}

      {duvida && (
        <Folha titulo={`Este telefone já é de ${duvida.existente.nome}`} aoFechar={() => setDuvida(null)}
          rodape={<>
            <button type="button" className="g-btn sec" onClick={() => { const d = duvida; setDuvida(null); void aceitar(d.lista, d.grupo, { como: "novo" }); }}>Criar outro tutor</button>
            <button type="button" className="g-btn pri" autoFocus onClick={() => { const d = duvida; setDuvida(null); void aceitar(d.lista, d.grupo, { como: "existente", tutor: d.existente.nome, alvo: d.existente.id }); }}>Usar {duvida.existente.nome}</button>
          </>}>
          <div className="g-pilha">
            <div className="g-card areia g-pilha p">
              <div className="g-fila"><AvatarPessoa nome={duvida.lista[0].tutor_nome} /><div className="g-cresce"><b>{duvida.lista[0].tutor_nome}</b><div className="g-pp g-muted">quem pediu pelo link · {fmtTelefone(duvida.lista[0].telefone)}</div></div></div>
              <div className="g-fila"><AvatarPessoa nome={duvida.existente.nome} /><div className="g-cresce"><b>{duvida.existente.nome}</b><div className="g-pp g-muted">já é cliente · {fmtTelefone(duvida.existente.telefone)}</div></div></div>
            </div>
            <p><b>É a mesma pessoa?</b></p>
            <p className="g-muted g-p">
              Se for, toque em Usar {duvida.existente.nome}: {listaDe(duvida.lista.map((x) => x.pet_nome))} {duvida.lista.length > 1 ? "entram" : "entra"} na ficha que já existe.
              Se for outra pessoa que usa o mesmo número, toque em Criar outro tutor: {duvida.lista[0].tutor_nome} ganha uma ficha própria.
              Fechando esta janela, o pedido continua esperando.
            </p>
          </div>
        </Folha>
      )}
    </section>
  );
}
