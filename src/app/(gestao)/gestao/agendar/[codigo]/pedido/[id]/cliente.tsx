"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, CalendarPlus, CalendarX, Clock, Hourglass, MapPin, MessageCircle, RefreshCw } from "lucide-react";
import { configurado } from "@/lib/gestao/supabase-config";
import { adiantarBanco, bancoDepois as banco } from "@/lib/gestao/supabase-depois";
import { Marca } from "@/components/gestao/marca";
import { dataLonga, deIsoDia, hora as horaDe, isoDia, linkWhatsApp, nomeDia, nomeDiaCurto, somaDias } from "@/lib/gestao/util";
import { horarioDoServico, janelaDoDia } from "@/lib/gestao/horario-loja";
import { enderecoDaLoja, enderecoEmLinha, linkDoMapa } from "@/lib/gestao/endereco";
import { comDesconto, lerVisto, partesPorExtenso, portePorExtenso, real, totalPorExtenso, valorPorExtenso, type LinhaDeValor } from "@/lib/gestao/link-precos";
import { icsDaAgenda } from "@/lib/gestao/ics";
import LogoLoja from "@/components/gestao/logo-loja";
import { aplicarTema } from "@/lib/gestao/identidade";
import { MUITOS_PEDIDOS, prazoPorExtenso } from "@/lib/gestao/link-opcoes";
import "./pedido.css";
import type { PedidoInicial } from "@/lib/gestao/link-servidor";

type Situacao = "pendente" | "aceito" | "recusado" | "cancelado" | "concluido" | "cliente";
type Item = {
  pet: string; servico: string | null; dia: string; hora: string; status: Situacao; tipo?: string | null; ate?: string | null;
  /** banco com a migração 20261235: o serviço, o começo e o fim de verdade, a hora de buscar (creche e hotel) e o valor que o link mostrou */
  servico_id?: string | null; inicio?: string | null;
  /** banco com a migração 20261239: com mais de um serviço, os nomes de todos e os ids dos que vêm junto com o principal */
  servicos?: string[] | null; extras?: string[] | null; fim?: string | null; hora_fim?: string | null; ate_hora?: string | null; valor?: unknown;
};
type Pedido = {
  logo?: string | null; tema?: string | null; petshop: string; telefone: string | null; codigo: string; tutor: string; itens: Item[];
  endereco?: string | null; bairro?: string | null; complemento?: string | null; cidade?: string | null; uf?: string | null;
};
/** O que a página precisa do link para oferecer outro horário (link_info e link_fechados). */
type Agenda = { hoje: string; horario: unknown; horarios: unknown[]; fechados: Set<string> };
const DIAS_PARA_MUDAR = 14;
/** O que o tutor pode fazer com o pedido (vem de `link_pedido_cliente`; só existe quando quem recebe o pedido ligou a opção). */
type Acoes = {
  ligado: boolean; horas: number; aberto: boolean; limite: string | null; limite_dia?: string | null; limite_hora?: string | null; no_prazo: boolean;
  itens: { chave: string; cancelado_cliente: boolean }[];
  pediu: "cancelar" | "mudar" | null; pediu_em: string | null; recado: string | null;
  /** depois do pedido de outra data, o horário já foi remarcado (banco com a migração 20261171) */ remarcado_depois?: boolean;
};

const TEXTO: Record<Situacao, { rotulo: string; tom: string }> = {
  pendente: { rotulo: "Aguardando a confirmação", tom: "amarelo" },
  aceito: { rotulo: "Confirmado", tom: "verde" },
  recusado: { rotulo: "Não deu neste horário", tom: "vermelho" },
  cancelado: { rotulo: "Cancelado", tom: "vermelho" },
  concluido: { rotulo: "Atendido", tom: "verde" },
  cliente: { rotulo: "Cancelado por você", tom: "vermelho" },
};
/** Creche e hotel falam de vaga e de datas, não de horário. */
const ehEstadia = (i: Item) => i.tipo === "creche" || i.tipo === "hotel";
const rotuloDe = (i: Item) => (ehEstadia(i) && i.status === "recusado" ? "Sem vaga nessas datas" : ehEstadia(i) && i.status === "concluido" ? "Encerrado" : TEXTO[i.status].rotulo);
const diaEHora = (iso: string) => `${dataLonga(new Date(iso))}, às ${horaDe(iso)}`;
const listaE = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);

/** Junta o pedido (link_pedido) com o que o tutor pode fazer (link_pedido_cliente): o que ele mesmo cancelou vira "Cancelado por você". */
function montar(data: unknown, extra: unknown): { pedido: Pedido | null; acoes: Acoes | null } {
  const lido = data && typeof data === "object" ? { ...(data as Pedido) } : null;
  const a = (extra as Acoes | null) ?? null;
  // o que o próprio tutor cancelou aparece como "Cancelado por você", não como recusa
  const dele = new Set((a?.itens ?? []).filter((x) => x.cancelado_cliente).map((x) => x.chave));
  if (lido?.itens && dele.size) lido.itens = lido.itens.map((i) => (dele.has(`${i.pet}|${i.dia}|${i.hora}`) ? { ...i, status: "cliente" } : i));
  return { pedido: lido, acoes: a };
}
/** O sinal da reserva só conta com vaga de creche ou hotel aceita. */
const comVagaAceita = (p: Pedido | null) => !!p?.itens?.some((i) => (i.tipo === "creche" || i.tipo === "hotel") && i.status === "aceito");
const lerSinal = (d: unknown) => { const x = d as { valor?: number; estado?: string } | null; return x && Number(x.valor) > 0 ? { valor: Number(x.valor), estado: String(x.estado) } : null; };

/**
 * Página que o tutor abre para ver se o pedido (de horário ou de vaga na creche e no hotel) foi confirmado.
 * Atualiza sozinha enquanto está aguardando. Quando quem recebe o pedido deixa, o tutor também cancela ou pede outra data por aqui.
 */
export default function AcompanharPedido({ codigo, id, inicial }: { codigo: string; id: string; inicial?: PedidoInicial }) {
  // o servidor já leu (a página chega pronta no HTML); sem `inicial`, lê pelo navegador, como antes
  const [primeiro] = useState(() => (inicial ? montar(inicial.pedido, inicial.acoes) : null));
  const [pedido, setPedido] = useState<Pedido | null | undefined>(primeiro ? primeiro.pedido : undefined);
  const [acoes, setAcoes] = useState<Acoes | null>(primeiro?.acoes ?? null);
  const [atualizando, setAtualizando] = useState(false);
  const [painel, setPainel] = useState<"cancelar" | "mudar" | null>(null);
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  // o sinal da reserva (creche ou hotel), quando quem recebe o pedido combinou um: quanto é e se já foi pago
  const [sinal, setSinal] = useState<{ valor: number; estado: string } | null>(() => (primeiro && comVagaAceita(primeiro.pedido) ? lerSinal(inicial?.sinal) : null));
  const [ocupado, setOcupado] = useState(false);
  const travado = useRef(false);
  // datas e horas que dependem do relógio do aparelho só entram depois de a página abrir no navegador (o servidor tem outro fuso)
  const [montado, setMontado] = useState(false);
  useEffect(() => { setMontado(true); }, []);
  // "Pedir outra data" escolhendo um horário livre do link (só pedido de horário; creche e hotel seguem pelo recado)
  const [agenda, setAgenda] = useState<Agenda | null | undefined>(undefined);
  const [diaNovo, setDiaNovo] = useState<string | null>(null);
  const [horasLivres, setHorasLivres] = useState<string[] | null>(null);
  const [horaNova, setHoraNova] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    if (!configurado || !/^[0-9a-f-]{36}$/i.test(id)) { setPedido(null); return; }
    setAtualizando(true);
    const [{ data, error }, extra] = await Promise.all([
      banco().rpc("link_pedido", { p_id: id }),
      banco().rpc("link_pedido_cliente", { p_id: id }),
    ]);
    setAtualizando(false);
    if (error) { setPedido((p) => p ?? null); return; }
    const { pedido: lido, acoes: a } = montar(data, extra.error ? null : extra.data);
    aplicarTema(lido?.tema);
    setAcoes(a);
    setPedido(lido);
    if (comVagaAceita(lido)) {
      const r = await banco().rpc("link_pedido_sinal", { p_id: id });
      setSinal(r.error ? null : lerSinal(r.data));
    } else setSinal(null);
  }, [id]);

  useEffect(() => {
    if (!primeiro) { void buscar(); return; }
    aplicarTema(primeiro.pedido?.tema); // o HTML já veio com as cores do pet shop
    adiantarBanco(); // atualizar, cancelar e pedir outra data: a biblioteca do banco baixa agora, sem segurar a página
  }, [buscar, primeiro]);
  const aguardando = pedido?.itens?.some((i) => i.status === "pendente") ?? false;
  useEffect(() => {
    if (!aguardando) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void buscar(); }, 30000);
    const volta = () => { if (document.visibilityState === "visible") void buscar(); };
    document.addEventListener("visibilitychange", volta);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", volta); };
  }, [aguardando, buscar]);

  const itens = pedido?.itens ?? [];
  const todos = (s: Situacao) => itens.length > 0 && itens.every((i) => i.status === s);
  const fora = (i: Item) => i.status === "recusado" || i.status === "cancelado" || i.status === "cliente";
  const algumRecusado = itens.some(fora);
  const desistiu = todos("cliente");
  const geral: "aguardando" | "confirmado" | "recusado" | "misto" = aguardando ? "aguardando" : todos("aceito") || todos("concluido") ? "confirmado" : itens.every(fora) ? "recusado" : "misto";
  // só creche e hotel: a página fala de vaga e de datas; com banho no meio, fala de horário
  const soEstadia = itens.length > 0 && itens.every(ehEstadia);
  const umaEstadia = itens.find(ehEstadia);
  const oPedido = soEstadia ? `um pedido de vaga ${umaEstadia?.tipo === "hotel" ? "no hotel" : "na creche"}` : "um pedido de horário";
  const loja = pedido?.petshop ?? "";
  // a conversa já começa dizendo de que pedido se trata (pet, serviço e dia)
  const resumoDoPedido = (() => {
    const i = itens[0];
    if (!i) return "";
    const nomes = listaE([...new Set(itens.map((x) => x.pet))]);
    const quando = `${dataLonga(deIsoDia(i.dia))}${ehEstadia(i) ? (i.ate && i.ate !== i.dia ? ` até ${dataLonga(deIsoDia(i.ate))}` : "") : `, às ${i.hora}`}`;
    return `${ehEstadia(i) ? (i.tipo === "hotel" ? "hotel" : "creche") : (i.servico ?? "horário").toLowerCase()} para ${nomes}, ${quando}`;
  })();
  const zap = pedido ? linkWhatsApp(pedido.telefone, resumoDoPedido ? `Oi! Fiz ${oPedido} pelo link (${resumoDoPedido}) e queria falar sobre ele.` : `Oi! Fiz ${oPedido} pelo link e queria falar sobre ele.`) : null;
  // tudo já aconteceu (atendido, estadia encerrada): a página não diz mais "Está confirmado!"
  const feitoTudo = todos("concluido");
  // o valor que o link mostrou, pet por pet (o banco guardou ao receber o pedido); só no que não foi recusado nem cancelado
  const valores: LinhaDeValor[] = itens.filter((i) => !fora(i)).flatMap((i) => { const v = lerVisto(i.valor); return v ? [{ nome: i.pet, v }] : []; });
  const total = totalPorExtenso(valores);
  const endereco = enderecoDaLoja(pedido), mapa = linkDoMapa(pedido, pedido?.petshop);
  // "Adicionar à agenda": só o que está confirmado e ainda vai acontecer
  const paraAgenda = itens.filter((i) => i.status === "aceito" && i.inicio && i.fim);
  function baixarAgenda() {
    const ics = icsDaAgenda(paraAgenda.map((i, n) => ({
      id: `${id}-${n}`, titulo: `${i.servico ?? "Horário"} de ${i.pet} · ${loja}`, inicio: i.inicio!, fim: i.fim!,
      onde: enderecoEmLinha(pedido) ?? loja, descricao: `Pedido confirmado por ${loja}. Para mudar ou cancelar: ${window.location.href}`,
    })));
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "pedido.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // outro horário: os itens de serviço ainda abertos, todos do mesmo serviço (o link marca um depois do outro)
  const abertosDeServico = itens.filter((i) => (i.status === "pendente" || i.status === "aceito") && !ehEstadia(i) && i.servico_id);
  const servicoParaMudar = abertosDeServico.length > 0 && abertosDeServico.length === itens.filter((i) => i.status === "pendente" || i.status === "aceito").length
    && abertosDeServico.every((i) => i.servico_id === abertosDeServico[0].servico_id && (i.extras ?? []).join(",") === (abertosDeServico[0].extras ?? []).join(",")) ? abertosDeServico[0].servico_id! : null;
  // os serviços que vêm junto (o tempo de cada pet é a soma de todos)
  const extrasParaMudar = servicoParaMudar ? (abertosDeServico[0].extras ?? []) : [];
  const codigoDoLink = pedido?.codigo ?? codigo;
  useEffect(() => {
    if (painel !== "mudar" || !servicoParaMudar || agenda !== undefined) return;
    let vale = true;
    void Promise.all([banco().rpc("link_info", { p_codigo: codigoDoLink }), banco().rpc("link_fechados", { p_codigo: codigoDoLink })]).then(([i, f]) => {
      if (!vale) return;
      const x = i.data as { hoje?: unknown; horario?: unknown; servicos?: { id: string; horario?: unknown }[] } | null;
      // cada serviço no horário próprio (ou no do pet shop): o dia novo precisa ser um dia em que todos funcionam
      const lista = Array.isArray(x?.servicos) ? x!.servicos : [];
      const horarios = [servicoParaMudar, ...extrasParaMudar].map((id) => horarioDoServico(lista.find((s) => s.id === id), x?.horario));
      // link desligado ou sem leitura: fica só o recado escrito, como sempre foi
      setAgenda(!i.error && x && typeof x.hoje === "string" ? { hoje: x.hoje, horario: x.horario, horarios, fechados: new Set(Array.isArray(f.data) ? (f.data as unknown as string[]) : []) } : null);
    }, () => { if (vale) setAgenda(null); });
    return () => { vale = false; };
  }, [painel, servicoParaMudar, agenda, codigoDoLink]); // eslint-disable-line react-hooks/exhaustive-deps
  const diasParaMudar = agenda ? Array.from({ length: DIAS_PARA_MUDAR }, (_, n) => somaDias(deIsoDia(agenda.hoje), n)).map((d) => ({ iso: isoDia(d), data: d, aberto: !!janelaDoDia(agenda.horarios, d.getDay()) && !agenda.fechados.has(isoDia(d)) })) : [];
  useEffect(() => {
    if (!diaNovo || !servicoParaMudar) return;
    let vale = true;
    setHorasLivres(null);
    setHoraNova(null);
    void banco().rpc("link_horarios", { p_codigo: codigoDoLink, p_servico: servicoParaMudar, p_dia: diaNovo, p_pets: Math.min(4, Math.max(1, abertosDeServico.length)), ...(extrasParaMudar.length ? { p_extras: extrasParaMudar } : {}) }).then(({ data, error }) => {
      if (vale) setHorasLivres(error ? [] : ((data ?? []) as string[]).map((h) => String(h).slice(0, 5)));
    });
    return () => { vale = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaNovo, servicoParaMudar, codigoDoLink, abertosDeServico.length, extrasParaMudar.join(",")]);

  // cancelar e pedir outra data por aqui: só quando quem recebe o pedido ligou, e só no que ainda está por vir
  const podeMexer = !!acoes?.ligado && acoes.aberto;
  const prazo = acoes ? prazoPorExtenso(acoes.horas) : "";
  const abertos = itens.filter((i) => i.status === "pendente" || i.status === "aceito").map((i) => i.pet);

  async function mandar(qual: "cancelar" | "mudar") {
    if (travado.current) return; // dois toques seguidos valem um
    const texto = recado.trim();
    const comHorario = qual === "mudar" && !!diaNovo && !!horaNova;
    if (qual === "mudar" && !comHorario && texto.length < 3) { setErro(agenda ? "Escolha um dia e um horário, ou escreva o que fica bom para você." : "Escreva que dia e horário ficam bons para você."); return; }
    travado.current = true;
    setOcupado(true);
    setErro(null);
    try {
      const { data, error } = qual === "cancelar"
        ? await banco().rpc("link_pedido_cancelar", { p_id: id, p_recado: texto || undefined })
        : comHorario
          ? await (banco() as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }).rpc("link_pedido_pedir_horario", { p_id: id, p_dia: diaNovo, p_hora: horaNova })
          : await banco().rpc("link_pedido_pedir_mudanca", { p_id: id, p_recado: texto });
      const r = data as unknown as { ok?: boolean; erro?: string; cancelados?: number; pedidos?: number } | null;
      if (error || !r) { setErro("Não deu para enviar agora. Confira a internet e tente de novo."); return; }
      if (!r.ok) {
        setErro(r.erro === "prazo" ? `O prazo para ${qual === "cancelar" ? "cancelar" : "pedir outra data"} por aqui já passou (${prazo}). Fale com ${loja} pelo WhatsApp.`
          : r.erro === "desligado" ? `${loja} não está recebendo isso por aqui agora. Fale pelo WhatsApp.`
          : r.erro === "fechado" ? "Este pedido já foi encerrado. Atualizei a página."
          : r.erro === "recado" ? "Escreva que dia e horário ficam bons para você."
          : r.erro === "ocupado" ? "Esse horário acabou de ser ocupado. Escolha outro, por favor."
          : r.erro === "muitos" ? MUITOS_PEDIDOS
          : "Algo deu errado. Tente de novo em instantes.");
        if (r.erro === "ocupado") { const d = diaNovo; setDiaNovo(null); setHoraNova(null); setTimeout(() => setDiaNovo(d), 0); return; }
        if (r.erro !== "recado" && r.erro !== "muitos") void buscar();
        return;
      }
      setDiaNovo(null); setHoraNova(null); setHorasLivres(null);
      setFeito(qual === "mudar" ? `${comHorario ? "Pedido de outro horário enviado" : "Recado enviado"}. ${loja} responde pelo seu WhatsApp. Até lá, o que está combinado continua valendo.`
        : (r.pedidos ?? 0) > 0 && !(r.cancelados ?? 0) ? `Pedido de cancelamento enviado. Como há pagamento combinado, ${loja} conclui o cancelamento e fala com você.`
        : (r.pedidos ?? 0) > 0 ? `Cancelado em parte. Onde há pagamento combinado, ${loja} conclui o cancelamento e fala com você.`
        : (r.cancelados ?? 0) > 0 ? "Cancelado." : "Este pedido já estava cancelado.");
      setPainel(null);
      setRecado("");
      await buscar();
    } finally { travado.current = false; setOcupado(false); }
  }
  const abrir = (qual: "cancelar" | "mudar") => { setPainel(qual); setRecado(""); setErro(null); setFeito(null); setDiaNovo(null); setHoraNova(null); };

  return (
    <main className="g-lkp">
      <div className="g-lkp-miolo">
        {pedido === undefined ? <div className="g-esq" style={{ minHeight: 220 }} aria-busy="true" /> : pedido === null ? (
          <section className="g-card g-lkp-cartao">
            <span className="g-lkp-selo cinza"><CalendarX /></span>
            <h1>Pedido não encontrado</h1>
            <p className="g-muted">Confira se o endereço está completo. Se preferir, faça um pedido novo.</p>
            <Link className="g-btn verde" href={`/gestao/agendar/${codigo}`}>Fazer um pedido</Link>
          </section>
        ) : (
          <>
            <section className={`g-card g-lkp-cartao ${geral}`}>
              <span className={`g-lkp-selo ${geral}`}>{geral === "aguardando" ? <Hourglass /> : geral === "recusado" ? <CalendarX /> : <CalendarCheck />}</span>
              <p className="g-lkp-loja"><LogoLoja nome={pedido.petshop} logo={pedido.logo} tamanho={28} /><span className="g-rotulo">{pedido.petshop}</span></p>
              <h1>{desistiu ? "Pedido cancelado." : geral === "aguardando" ? `${pedido.tutor}, seu pedido chegou.` : feitoTudo ? (soEstadia ? "Estadia encerrada." : "Atendimento feito.") : geral === "confirmado" ? "Está confirmado!" : geral === "recusado" ? (soEstadia ? "Não temos vaga nessas datas." : "Não deu neste horário.") : `${pedido.petshop} respondeu.`}</h1>
              <p className="g-muted">
                {desistiu ? `Você cancelou este pedido e ${pedido.petshop} já vê isso por lá. Se quiser, é só pedir de novo.`
                  : feitoTudo ? `${soEstadia ? "A estadia já terminou" : "O atendimento já foi feito"}. Obrigado por vir! Quando quiser, é só pedir de novo.`
                  : geral === "aguardando" ? `${pedido.petshop} ainda vai confirmar. Esta página atualiza sozinha; pode deixar aberta ou voltar depois.`
                  : geral === "confirmado" ? (soEstadia ? `${pedido.petshop} confirmou a vaga. É só trazer no dia combinado.` : `${pedido.petshop} confirmou. É só aparecer no dia e na hora.`)
                  : geral === "recusado" ? (soEstadia ? `${pedido.petshop} não tem vaga nesse período. Escolha outras datas.` : `${pedido.petshop} não consegue atender nesse horário. Escolha outro dia ou hora.`)
                  : "Veja abaixo a situação de cada pet."}
              </p>
              <ul className="g-lkp-itens">
                {itens.map((i, n) => (
                  <li key={n}>
                    <div>
                      <b>{i.pet}</b>
                      <span>{[i.servico, `${dataLonga(deIsoDia(i.dia))}${ehEstadia(i) && i.hora ? `, chegada às ${i.hora}` : ""}`, i.ate && i.ate !== i.dia ? `até ${dataLonga(deIsoDia(i.ate))}${i.ate_hora ? `, busca às ${i.ate_hora}` : ""}` : ehEstadia(i) && i.ate_hora ? `busca às ${i.ate_hora}` : null].filter(Boolean).join(" · ")}</span>
                    </div>
                    <div className="lado">
                      {(!i.tipo || i.tipo === "servico") && <span className="hora"><Clock aria-hidden />{i.hora}</span>}
                      <span className={`g-tag ${TEXTO[i.status].tom}`}>{rotuloDe(i)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {valores.length > 0 && geral !== "recusado" && !desistiu && (
                <div className="g-lkp-valor" data-teste="valor-do-pedido">
                  <b>{valores[0].v.tipo === "servico" ? "Valor" : "Estimativa"}{valores.some((l) => l.v.promo) ? ` com a promoção ${valores.find((l) => l.v.promo)!.v.promo!.nome}` : ""}</b>
                  {valores.map((l, n) => [
                    <div key={n} className="l" data-teste="valor-do-pet">
                      <span>{l.nome}{l.v.tipo === "servico" ? <small> {portePorExtenso(l.v)}</small> : l.v.tipo === "hotel" && l.v.noites ? <small> {l.v.noites} {l.v.noites === 1 ? "noite" : "noites"}</small> : l.v.dias ? <small> {l.v.dias} {l.v.dias === 1 ? "dia" : "dias"}</small> : null}</span>
                      <span>{comDesconto(l.v) && l.v.valor != null ? <><s>{real(l.v.base!)}</s> <b>{real(l.v.valor)}</b></> : `${valorPorExtenso(l.v)}${l.v.valor == null ? ", conforme o porte" : ""}`}</span>
                    </div>,
                    partesPorExtenso(l.v) ? <small key={`${n}-p`} className="g-lkp-partes" data-teste="valor-partes">{partesPorExtenso(l.v)}</small> : null,
                  ])}
                  {valores.length > 1 && total && <div className="l forte" data-teste="valor-total"><span>Total</span><span>{total}</span></div>}
                  <small>{valores[0].v.tipo === "servico" ? "É o valor que o link mostrou quando você pediu" : "É a estimativa que o link mostrou quando você pediu"}. Quem confirma o valor é {pedido.petshop}. Nada é pago por aqui.</small>
                </div>
              )}
              {endereco && geral !== "recusado" && !desistiu && !feitoTudo && (
                <p className="g-lkp-onde" data-teste="endereco"><MapPin aria-hidden /><span>{endereco}{mapa && <> · <a href={mapa} target="_blank" rel="noopener noreferrer">Abrir no mapa</a></>}</span></p>
              )}
              {sinal && geral !== "recusado" && !desistiu && (
                <p className="g-lkp-recado" role="status">
                  <span>{sinal.estado === "pago"
                    ? `Sinal de ${sinal.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}: já recebido. Obrigado!`
                    : `Para garantir a vaga, ${pedido.petshop} pede um sinal de ${sinal.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. O pagamento é combinado direto com ${pedido.petshop}: nada é pago por aqui.`}</span>
                </p>
              )}
              {feito && <p className="g-lkp-feito" role="status">{feito}</p>}
              {acoes?.pediu && acoes.aberto && !painel && !feito && (
                <p className="g-lkp-recado">
                  <CalendarClock aria-hidden />
                  <span>
                    {acoes.pediu === "mudar" && acoes.remarcado_depois
                      ? <>Você pediu outra data{acoes.pediu_em && montado ? ` em ${diaEHora(acoes.pediu_em)}` : ""}, e {pedido.petshop} já remarcou. A data que vale é a que está aqui em cima.</>
                      : <>{acoes.pediu === "mudar" ? "Você pediu outra data" : "Você pediu para cancelar"}{acoes.pediu_em && montado ? ` em ${diaEHora(acoes.pediu_em)}` : ""}.
                    {acoes.recado ? ` Seu recado: “${acoes.recado}”` : ""} {pedido.petshop} responde pelo seu WhatsApp.{acoes.pediu === "mudar" ? " Até lá, o que está combinado continua valendo." : ""}</>}
                  </span>
                </p>
              )}
              <div className="g-lkp-acoes">
                {algumRecusado && <Link className="g-btn pri" href={`/gestao/agendar/${pedido.codigo}`}>{desistiu ? "Fazer um novo pedido" : soEstadia ? "Escolher outras datas" : "Escolher outro horário"}</Link>}
                {feitoTudo && <Link className="g-btn pri" href={`/gestao/agendar/${pedido.codigo}`}>Fazer um novo pedido</Link>}
                {!aguardando && !feitoTudo && paraAgenda.length > 0 && <button type="button" className="g-btn sec" onClick={baixarAgenda}><CalendarPlus />Adicionar à agenda</button>}
                {aguardando && <button className="g-btn sec" onClick={() => void buscar()} disabled={atualizando}><RefreshCw />{atualizando ? "Atualizando…" : "Atualizar"}</button>}
                {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {pedido.petshop}</a>}
              </div>
            </section>

            {podeMexer && acoes!.no_prazo && !painel && (
              <section className="g-card g-lkp-mexer">
                <h2>Precisa mudar ou cancelar?</h2>
                <p className="g-muted g-p">
                  {acoes!.limite ? `Dá para fazer por aqui ${prazo}${acoes!.limite_dia && acoes!.limite_hora ? `: até ${dataLonga(deIsoDia(acoes!.limite_dia))}, às ${acoes!.limite_hora}` : montado ? `: até ${diaEHora(acoes!.limite)}` : ""}.` : "Dá para fazer por aqui enquanto o pedido espera a confirmação."}
                </p>
                <div className="g-lkp-acoes">
                  <button type="button" className="g-btn sec" onClick={() => abrir("mudar")}><CalendarClock />Pedir outra data</button>
                  {acoes!.pediu !== "cancelar" && <button type="button" className="g-btn perigo" onClick={() => abrir("cancelar")}><CalendarX />Cancelar o pedido</button>}
                </div>
              </section>
            )}
            {podeMexer && acoes!.no_prazo && painel && (
              <section className="g-card g-lkp-mexer" aria-live="polite">
                <h2>{painel === "cancelar" ? `Cancelar o pedido de ${listaE(abertos) || "seu pet"}?` : "Pedir outra data"}</h2>
                <p className="g-muted g-p">
                  {painel === "cancelar"
                    ? `${abertos.length > 1 ? "O cancelamento vale para todos os pets deste pedido. " : ""}${soEstadia ? "A vaga" : "O horário"} volta a ficar livre para outro cliente. Se você já pagou algum valor, combine direto com ${pedido.petshop}: nada é devolvido por aqui.`
                    : `Nada é desmarcado agora: ${pedido.petshop} recebe o seu recado e responde pelo WhatsApp. Até lá, o que está combinado continua valendo.`}
                </p>
                {painel === "mudar" && servicoParaMudar && agenda && (
                  <div className="g-lkp-outro" data-teste="outro-horario">
                    <span className="g-rotulo" id="g-lkp-outro-dia">Escolha um dia</span>
                    <div className="g-lkp-dias" role="group" aria-labelledby="g-lkp-outro-dia">
                      {diasParaMudar.map((d) => (
                        <button key={d.iso} type="button" className="g-lkp-dia" disabled={!d.aberto} aria-pressed={d.iso === diaNovo}
                          aria-label={`${nomeDia(d.data)}, ${d.data.getDate()}${d.aberto ? "" : ", fechado"}`} onClick={() => { setDiaNovo(d.iso); setErro(null); }}>
                          <span>{d.iso === agenda.hoje ? "hoje" : nomeDiaCurto(d.data)}</span><b>{d.data.getDate()}</b>
                        </button>
                      ))}
                    </div>
                    {diaNovo && (horasLivres === null ? <p className="g-muted g-p" aria-busy="true">Vendo os horários livres…</p>
                      : !horasLivres.length ? <p className="g-muted g-p">Sem horário livre nesse dia. Escolha outro dia ou escreva abaixo.</p>
                      : (
                        <>
                          <span className="g-rotulo" id="g-lkp-outro-hora">Horários livres em {dataLonga(deIsoDia(diaNovo))}</span>
                          <div className="g-lkp-horas" role="group" aria-labelledby="g-lkp-outro-hora">
                            {horasLivres.map((h) => <button key={h} type="button" className="g-lkp-hora" aria-pressed={h === horaNova} onClick={() => { setHoraNova(h); setErro(null); }}>{h}</button>)}
                          </div>
                        </>
                      ))}
                    {diaNovo && horaNova && <p className="g-p" role="status"><b>Pedir para mudar para {dataLonga(deIsoDia(diaNovo))}, às {horaNova}.</b> {pedido.petshop} confirma a mudança.</p>}
                  </div>
                )}
                {!(painel === "mudar" && diaNovo && horaNova) && (
                  <label className="g-campo"><span>{painel === "cancelar" ? <>Quer dizer o motivo? <small>(opcional)</small></> : servicoParaMudar && agenda ? "Nenhum desses serve? Escreva o que fica bom para você" : "Que dia e horário ficam bons para você?"}</span>
                    <textarea className="g-textarea" value={recado} maxLength={300} placeholder={painel === "cancelar" ? "" : "Pode ser na sexta de manhã ou no sábado à tarde"} onChange={(e) => { setRecado(e.target.value); setErro(null); }} />
                  </label>
                )}
                {erro && <p className="g-lkp-erro" role="alert">{erro}</p>}
                <div className="g-lkp-acoes">
                  <button type="button" className="g-btn sec" disabled={ocupado} onClick={() => { setPainel(null); setErro(null); }}>Voltar</button>
                  {painel === "cancelar"
                    ? <button type="button" className="g-btn perigo" disabled={ocupado} onClick={() => void mandar("cancelar")}>{ocupado ? "Cancelando…" : "Sim, cancelar"}</button>
                    : <button type="button" className="g-btn pri" disabled={ocupado} onClick={() => void mandar("mudar")}>{ocupado ? "Enviando…" : diaNovo && horaNova ? "Pedir este horário" : "Enviar recado"}</button>}
                </div>
              </section>
            )}
            {erro && !painel && <p className="g-lkp-erro" role="alert">{erro}</p>}
            {podeMexer && !acoes!.no_prazo && <p className="g-lkp-nota">O prazo para cancelar ou mudar por aqui já passou ({prazo}). Fale com {pedido.petshop} pelo WhatsApp.</p>}
            {!podeMexer && !algumRecusado && <p className="g-lkp-nota">Precisa mudar ou cancelar? Fale com {pedido.petshop} pelo WhatsApp.</p>}
          </>
        )}
        <p className="g-lkp-pe"><Marca tamanho={16} /> Feito com Maestro Pet Gestão · <Link href="/gestao/privacidade">Privacidade</Link></p>
      </div>
    </main>
  );
}
