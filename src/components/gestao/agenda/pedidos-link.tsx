"use client";

import { saudacaoZap } from "@/lib/gestao/agenda";
import { useEffect, useState } from "react";
import { CalendarClock, Check, Clock, Link2, MessageCircle, UserX, X } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { useTrava } from "@/lib/gestao/uma-vez";
import { AvatarPessoa, AvatarPet, Folha, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import type { Database } from "@/lib/gestao/banco";
import { abreNoDia } from "@/lib/gestao/creche";
import { pixDoSinal } from "@/lib/gestao/hotel";
import { porteDe, sinalDe } from "@/lib/gestao/hotel-opcoes";
import { nomeDaCasa } from "@/lib/gestao/modulos";
import { opcoesDoLink, prazoPorExtenso, usouOpcoesDoLink } from "@/lib/gestao/link-opcoes";
import { brl, NOTA_PORTE, precoMudaComPorte } from "@/lib/gestao/util";
import { PORTES } from "@/lib/gestao/tipos";
import { dataCurta, fmtTelefone, hora, inicioDoDia, isoDia, linkWhatsApp, nomeDia, somaDias, chamar, semAcento } from "@/lib/gestao/util";
import "./pedidos-link.css";

type Pedido = Database["public"]["Tables"]["pedidos_agendamento"]["Row"];
/** `tutor` é o nome de quem ficou com o pedido (o tutor que já existia, quando a pessoa escolheu usar a ficha dele). */
type Respondido = { pedido: Pedido; servico: string | null; resposta: "aceito" | "recusado" | "cancelou"; tutor?: string };
/** "13/11 às 10:02" */
const diaHora = (iso: string) => `${dataCurta(new Date(iso))} às ${hora(iso)}`;
type TutorDoTelefone = { id: string; nome: string; telefone: string | null };
/** O telefone do pedido já é de outro nome: espera a pessoa dizer se é a mesma. */
type Duvida = { lista: Pedido[]; grupo: string; existente: TutorDoTelefone };
type Decisao = { como: "existente" | "novo"; tutor?: string };
/** Porte respondido na hora de aceitar: P, M, G, GG ou "depois" (não sabe ainda: o valor fica para conferir na hora). */
type Portes = Record<string, string>;
/** Pedido de serviço sem porte e com preço que muda com o porte: espera a pessoa dizer o porte (ou que não sabe). */
type PerguntaPorte = { lista: Pedido[]; grupo: string; decisao: Decisao; faltam: Pedido[]; respostas: Portes };

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
  const { sb, petshop, equipe, servicos, vejoFinanceiro } = useGestao();
  const casa = nomeDaCasa(petshop);
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [quem, setQuem] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  // nome de quem ficou com o pedido, quando a pessoa escolheu usar a ficha de um tutor que já existia (vale até recarregar)
  const [tutores, setTutores] = useState<Record<string, string>>({});
  const [duvida, setDuvida] = useState<Duvida | null>(null);
  const [perguntaPorte, setPerguntaPorte] = useState<PerguntaPorte | null>(null);
  const comOpcoes = usouOpcoesDoLink(petshop);
  const doLink = opcoesDoLink(petshop);

  const { dados: tudo, recarregar } = useDados(async () => {
    const [pendentes, semAviso, recados] = await Promise.all([
      sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).eq("status", "pendente").order("inicio").limit(100),
      // respondidos em que o tutor ainda não foi avisado (e os que o próprio tutor cancelou, até alguém ver)
      sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).in("status", ["aceito", "recusado"]).is("avisado_em", null).order("inicio").limit(60),
      // o tutor pediu outra data, ou pediu para cancelar algo que tem dinheiro no meio: só para quem ligou isso no link
      comOpcoes ? sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).not("cliente_pediu", "is", null).is("cliente_pedido_visto_em", null).order("inicio").limit(40) : null,
    ]);
    // o sinal das reservas aceitas que ainda esperam o aviso: só quem recebe lê o valor (para a mensagem levar quanto é)
    const sinais = new Map<string, number>();
    const comReserva = ((semAviso.data ?? []) as Pedido[]).filter((p) => p.estadia_id);
    if (vejoFinanceiro && sinalDe(petshop).ativo && comReserva.length) {
      const v = await sb.from("estadias_valores").select("estadia_id, sinal, sinal_estado").eq("petshop_id", petshop.id).in("estadia_id", comReserva.map((p) => p.estadia_id!));
      for (const x of v.data ?? []) if (x.sinal != null && x.sinal_estado === "a_receber") sinais.set(x.estadia_id, Number(x.sinal));
    }
    return { pendentes: ok(pendentes) as Pedido[], semAviso: (semAviso.data ?? []) as Pedido[], recados: (recados?.data ?? []) as Pedido[], sinais };
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
  const rotulo = (p: Pedido) => (p.tipo === "creche" ? "Creche" : p.tipo === "hotel" ? "Hotel" : nomeServico(p.servico_id));
  const corServico = (id: string | null) => servicos.find((s) => s.id === id)?.cor ?? "#f97316";
  const respondidos: Respondido[] = (tudo?.semAviso ?? []).map((p) => ({ pedido: p, servico: rotulo(p), resposta: p.cliente_cancelou_em ? "cancelou" : p.status === "aceito" ? "aceito" : "recusado", tutor: tutores[p.id] }));
  // recados do tutor (outra data ou cancelamento que depende de você), um cartão por tutor
  const gruposRecados = agrupar(tudo?.recados ?? [], (p) => `${chaveDe(p)}:${p.cliente_pediu}`).map((g) => ({ ...g, lista: [...g.lista].sort(porHora) }));

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
  const aceiteDe = (p: Pedido) => p.termos_aceitos_em
    ? <span className="g-tag verde" title={p.termos_texto ?? undefined}>aceitou {p.termos_texto ? "as regras" : "a declaração de vacinas"}{p.termos_texto && p.termos_vacinas ? " e declarou vacinas em dia" : ""} em {diaHora(p.termos_aceitos_em)}</span>
    : doLink.pedeAceite ? <span className="g-tag amarelo">sem aceite das regras</span> : null;
  const pendentes = dados ?? [];

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
    return (r.data ?? []).some((x) => semAcento(x.tutor_nome) === semAcento(p.tutor_nome));
  }

  /**
   * Marca os pedidos na agenda, um por um. Se algum falhar, os outros seguem e o erro aparece no fim.
   * Antes, confere se o telefone do pedido já é de um tutor com outro nome: aí pergunta se é a mesma pessoa
   * (`decisao`: "existente" usa a ficha que já existe; "novo" cria ou usa um tutor com o nome do pedido).
   */
  // trava na hora do primeiro toque: dois toques seguidos em Aceitar não respondem o pedido duas vezes
  // (o banco aceitaria só o primeiro, mas a pessoa veria um erro de "já foi respondido" sem ter feito nada errado)
  const umaVez = useTrava();
  const aceitar = (lista: Pedido[], grupo: string, decisao?: Decisao, portes?: Portes) => umaVez(() => aceitarJa(lista, grupo, decisao, portes));
  async function aceitarJa(lista: Pedido[], grupo: string, decisao?: Decisao, portes?: Portes) {
    if (somenteLeitura() || ocupado) return;
    const profissional = atendem.length > 1 ? quem[grupo] || undefined : atendem[0]?.id;
    setOcupado(lista.length > 1 ? grupo : lista[0].id);
    if (!decisao) {
      // sem resposta do banco, segue como sempre foi (o pedido entra no tutor que tem o telefone)
      const r = await sb.rpc("pedido_tutores_do_telefone", { p_id: lista[0].id });
      const donos = (r.error ? [] : r.data ?? []) as TutorDoTelefone[];
      const igual = donos.findIndex((c) => semAcento(c.nome) === semAcento(lista[0].tutor_nome));
      if (donos.length && igual < 0) {
        // a pergunta é uma só por pedido: se outro pet do mesmo pedido (ou do mesmo tutor, na mesma hora) já foi aceito
        // e ninguém ganhou ficha com o nome de quem pediu, a resposta foi "é a mesma pessoa"
        if (await jaRespondeu(lista[0])) decisao = { como: "existente", tutor: donos[0].nome };
        else { setDuvida({ lista, grupo, existente: donos[0] }); setOcupado(null); return; }
      }
      // já existe um tutor com esse telefone e esse nome: é ele (mesmo que não seja o mais antigo com o número)
      decisao ??= { como: igual > 0 ? "novo" : "existente" };
    }
    // o valor depende do porte e ninguém disse o porte (nem o pedido, nem a ficha do pet): pergunta agora, antes de marcar
    if (!portes) {
      const faltam = await semPorteParaPerguntar(lista);
      if (faltam.length) { setPerguntaPorte({ lista, grupo, decisao, faltam, respostas: {} }); setOcupado(null); return; }
    }
    const feitos: Pedido[] = [];
    let falha: unknown = null;
    for (const p of lista) {
      const args = { p_id: p.id, p_profissional: ehEstadia(p) ? undefined : profissional, p_tutor_novo: decisao.como === "novo" };
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
    const reservas = feitos.filter(ehEstadia);
    for (const p of reservas) await acertarDiaria(p);
    let comSinal = 0;
    for (const p of reservas) if (await criarSinal(p)) comSinal++;
    if (feitos.length) {
      const tutor = decisao.tutor;
      if (tutor) setTutores((t) => ({ ...t, ...Object.fromEntries(feitos.map((p) => [p.id, tutor])) }));
      void recarregar();
      const doSinal = comSinal ? ` ${comSinal === 1 ? "O sinal já ficou" : "Os sinais já ficaram"} em A receber, pela sua regra.` : "";
      avisar(feitos.length === 1 ? (ehEstadia(feitos[0]) ? `Reserva de ${feitos[0].pet_nome} feita. Ela está em ${casa}.${doSinal}` : `Horário de ${feitos[0].pet_nome} marcado.`)
        : feitos.every(ehEstadia) ? `Reservas de ${listaDe(feitos.map((p) => p.pet_nome))} feitas. Elas estão em ${casa}.${doSinal}` : `Horários de ${listaDe(feitos.map((p) => p.pet_nome))} marcados.`);
      avisarMudanca();
    }
    if (falha) { avisarErro(falha); void recarregar(); }
    setOcupado(null);
  }

  /** Dos pedidos da lista, os de serviço em que o valor muda com o porte e nem o pedido nem a ficha do pet dizem o porte. */
  async function semPorteParaPerguntar(lista: Pedido[]): Promise<Pedido[]> {
    const candidatos = lista.filter((p) => !ehEstadia(p) && !p.porte && precoMudaComPorte(servicos.find((s) => s.id === p.servico_id)));
    if (!candidatos.length) return [];
    // pet que já é da casa e tem porte na ficha: o banco usa o da ficha, não precisa perguntar
    const r = await sb.rpc("pedido_tutores_do_telefone", { p_id: lista[0].id });
    const donos = (r.error ? [] : r.data ?? []) as TutorDoTelefone[];
    if (!donos.length) return candidatos;
    const pets = (await sb.from("pets").select("nome, porte").eq("petshop_id", petshop.id).in("cliente_id", donos.map((d) => d.id)).not("porte", "is", null).limit(200)).data ?? [];
    const comPorte = new Set(pets.map((x) => semAcento(x.nome)));
    return candidatos.filter((p) => !comPorte.has(semAcento(p.pet_nome)));
  }
  /**
   * Depois de aceitar com o porte respondido na hora. Com o porte: guarda na ficha do pet (se estava em branco) e coloca no
   * horário o preço do serviço para esse porte (o banco deixou em branco, porque o pedido veio sem porte).
   * Com "Não sei ainda": o horário segue sem valor e ganha o lembrete para conferir na hora.
   */
  async function depoisDoPorte(agendamentoId: unknown, resposta: string) {
    if (typeof agendamentoId !== "string") return;
    try {
      const ag = (await sb.from("agendamentos").select("pet_id, servico_id, preco, obs").eq("id", agendamentoId).eq("petshop_id", petshop.id).maybeSingle()).data;
      if (!ag) return;
      if (resposta === "depois") {
        if (!(ag.obs ?? "").includes(NOTA_PORTE)) await sb.from("agendamentos").update({ obs: [ag.obs, NOTA_PORTE].filter(Boolean).join(" ").slice(0, 400) }).eq("id", agendamentoId).eq("petshop_id", petshop.id).select("id");
        return;
      }
      await sb.from("pets").update({ porte: resposta }).eq("id", ag.pet_id).eq("petshop_id", petshop.id).is("porte", null).select("id");
      const s = servicos.find((x) => x.id === ag.servico_id);
      const preco = s ? { P: s.preco_p, M: s.preco_m, G: s.preco_g, GG: s.preco_gg }[resposta] ?? null : null;
      if (ag.preco == null && preco != null) await sb.from("agendamentos").update({ preco }).eq("id", agendamentoId).eq("petshop_id", petshop.id).is("preco", null).select("id");
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
    if (valores.every((v): v is number => v != null)) {
      const total = Math.round(valores.reduce((t, v) => t + v, 0) * 100) / 100;
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
    if (ehEstadia(p)) {
      const oQue = `${p.tipo === "hotel" ? "o hotel" : "a creche"} de ${nomes}, ${periodoDe(p)}`;
      return lista[0].resposta === "recusado"
        ? `${oi} Recebemos o seu pedido para ${oQue}, mas não temos vaga nessas datas. Você pode escolher outras datas aqui: ${base}\n\nSe preferir, me diga o período que fica bom para você.`
        : `${oi} Está confirmado: ${oQue}, com chegada às ${hora(p.inicio)}${p.tipo === "hotel" ? ` e saída às ${hora(p.fim)}` : ""}.${fraseDoSinal(lista.map((r) => r.pedido))} Esperamos vocês!${acompanhar}`;
    }
    if (lista[0].resposta === "recusado") {
      return `${oi} Recebemos o seu pedido para ${nomes}, mas ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}, não vamos conseguir atender. Você pode escolher outro horário livre aqui: ${base}\n\nSe preferir, me diga os dias e períodos que ficam bons para você.`;
    }
    if (lista.length === 1) {
      const oQue = lista[0].servico ? `${lista[0].servico} de ${p.pet_nome}` : `horário de ${p.pet_nome}`;
      return `${oi} Está confirmado: ${oQue} ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}. Esperamos vocês!${acompanhar}`;
    }
    // cada pet com o seu serviço, o seu dia e a sua hora (o dia só se repete quando muda)
    const linhas = lista.map((r, i) => {
      const dia = quandoNaFrase(r.pedido.inicio);
      const mesmoDia = i > 0 && dia === quandoNaFrase(lista[i - 1].pedido.inicio);
      return `${r.servico ? `${r.servico} de ${r.pedido.pet_nome}` : r.pedido.pet_nome} ${mesmoDia ? "" : `${dia}, `}às ${hora(r.pedido.inicio)}`;
    });
    return `${oi} Está confirmado: ${listaDe(linhas)}. Esperamos vocês!${acompanhar}`;
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
                    {p.cliente_recado ? ` Recado: “${p.cliente_recado}”.` : ""}
                    {mudar
                      ? ` Nada foi desmarcado. Para mudar, ${p.status === "pendente" ? "recuse este pedido e combine a nova data" : ehEstadia(p) ? `abra a reserva em ${casa}` : "abra o horário na Agenda"}.`
                      : ` Há ${ehEstadia(p) ? "sinal nesta reserva" : "pagamento neste horário"}, então nada foi cancelado: ${ehEstadia(p) ? `cancele a reserva em ${casa}` : "desmarque o horário na Agenda"} e decida o que fazer com o valor.`}
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
                    {p.cliente_recado ? ` Motivo: “${p.cliente_recado}”.` : ""}
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
                  {passou && <span className="g-tag vermelho">{ehEstadia(p) ? "a data já passou" : "horário já passou"}</span>}
                  {p.tipo === "creche" && fechadosDe(p, petshop.horario).length > 0 && <span className="g-tag amarelo">pelo seu horário, a creche não abre em {fechadosDe(p, petshop.horario).map((d) => dataCurta(d)).join(", ")}</span>}
                  {aceiteDe(p)}
                </div>
                {p.obs && <p className="g-pl-obs">{p.obs}</p>}
                <div className="g-pl-acoes">
                  {seletor}
                  <button type="button" className="g-btn verde p" disabled={ocupado !== null} onClick={() => void aceitar([p], g.id)}><Check />{ocupado === p.id ? "Um instante…" : "Aceitar"}</button>
                  <button type="button" className="g-btn sec p" disabled={ocupado !== null} onClick={() => void recusar([p], g.id)}>Recusar</button>
                </div>
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
                {passou && <span className="g-tag vermelho">{ehEstadia(p) ? "a data já passou" : "horário já passou"}</span>}
                {aceiteDe(p)}
              </div>
              <ul className="g-pl-pets">
                {g.lista.map((x) => {
                  const detalhes = detalhesDe(x);
                  return (
                    <li key={x.id}>
                      {!ehEstadia(x) && <span className="g-pl-pet-h">{hora(x.inicio)}</span>}
                      <span className="g-pl-pet-n"><b>{x.pet_nome}</b>{detalhes && <small>{detalhes}</small>}</span>
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
                <button type="button" className="g-btn verde p" disabled={ocupado !== null} onClick={() => void aceitar(g.lista, g.id)}><Check />{ocupado === g.id ? "Um instante…" : "Aceitar todos"}</button>
                <button type="button" className="g-btn sec p" disabled={ocupado !== null} onClick={() => void recusar(g.lista, g.id)}>Recusar todos</button>
              </div>
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
              <button type="button" className="g-btn pri" disabled={!tudoRespondido} onClick={() => { setPerguntaPorte(null); void aceitar(q.lista, q.grupo, q.decisao, q.respostas); }}>{q.lista.length > 1 ? "Aceitar todos" : "Aceitar"}</button>
            </>}>
            <div className="g-pilha">
              <p className="g-muted g-p">O pedido veio sem o porte, e o valor do serviço muda com ele. Escolha o porte para o horário já entrar com o valor certo. Fechando esta janela, o pedido continua esperando.</p>
              {q.faltam.map((p) => {
                const s = servicos.find((x) => x.id === p.servico_id);
                const precoDe = (porte: string) => (s ? { P: s.preco_p, M: s.preco_m, G: s.preco_g, GG: s.preco_gg }[porte] ?? null : null);
                return (
                  <div key={p.id} className="g-card areia g-pilha p" role="group" aria-label={`Porte de ${p.pet_nome}`}>
                    <div className="g-fila"><AvatarPet pet={{ nome: p.pet_nome, especie: p.especie }} /><div className="g-cresce"><b>{p.pet_nome}</b><div className="g-pp g-muted">{s?.nome ?? "Serviço"} · {quandoNaTela(p.inicio)}, {hora(p.inicio)}</div></div></div>
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

      {duvida && (
        <Folha titulo={`Este telefone já é de ${duvida.existente.nome}`} aoFechar={() => setDuvida(null)}
          rodape={<>
            <button type="button" className="g-btn sec" onClick={() => { const d = duvida; setDuvida(null); void aceitar(d.lista, d.grupo, { como: "novo" }); }}>Criar outro tutor</button>
            <button type="button" className="g-btn pri" autoFocus onClick={() => { const d = duvida; setDuvida(null); void aceitar(d.lista, d.grupo, { como: "existente", tutor: d.existente.nome }); }}>Usar {duvida.existente.nome}</button>
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
