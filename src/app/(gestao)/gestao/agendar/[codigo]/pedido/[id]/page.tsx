"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, CalendarX, Clock, Hourglass, MessageCircle, RefreshCw } from "lucide-react";
import { banco, configurado } from "@/lib/gestao/supabase";
import { Marca } from "@/components/gestao/marca";
import { dataLonga, deIsoDia, hora as horaDe, linkWhatsApp } from "@/lib/gestao/util";
import LogoLoja from "@/components/gestao/logo-loja";
import { aplicarTema } from "@/lib/gestao/identidade";
import { prazoPorExtenso } from "@/lib/gestao/link-opcoes";
import "./pedido.css";

type Situacao = "pendente" | "aceito" | "recusado" | "cancelado" | "concluido" | "cliente";
type Item = { pet: string; servico: string | null; dia: string; hora: string; status: Situacao; tipo?: string | null; ate?: string | null };
type Pedido = { logo?: string | null; tema?: string | null; petshop: string; telefone: string | null; codigo: string; tutor: string; itens: Item[] };
/** O que o tutor pode fazer com o pedido (vem de `link_pedido_cliente`; só existe quando quem recebe o pedido ligou a opção). */
type Acoes = {
  ligado: boolean; horas: number; aberto: boolean; limite: string | null; no_prazo: boolean;
  itens: { chave: string; cancelado_cliente: boolean }[];
  pediu: "cancelar" | "mudar" | null; pediu_em: string | null; recado: string | null;
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

/**
 * Página que o tutor abre para ver se o pedido (de horário ou de vaga na creche e no hotel) foi confirmado.
 * Atualiza sozinha enquanto está aguardando. Quando quem recebe o pedido deixa, o tutor também cancela ou pede outra data por aqui.
 */
export default function AcompanharPedido({ params }: { params: Promise<{ codigo: string; id: string }> }) {
  const { codigo, id } = use(params);
  const [pedido, setPedido] = useState<Pedido | null | undefined>(undefined);
  const [acoes, setAcoes] = useState<Acoes | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [painel, setPainel] = useState<"cancelar" | "mudar" | null>(null);
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const travado = useRef(false);

  const buscar = useCallback(async () => {
    if (!configurado || !/^[0-9a-f-]{36}$/i.test(id)) { setPedido(null); return; }
    setAtualizando(true);
    const [{ data, error }, extra] = await Promise.all([
      banco().rpc("link_pedido", { p_id: id }),
      banco().rpc("link_pedido_cliente", { p_id: id }),
    ]);
    setAtualizando(false);
    if (error) { setPedido((p) => p ?? null); return; }
    const lido = (data as unknown as Pedido | null) ?? null;
    const a = extra.error ? null : ((extra.data as unknown as Acoes | null) ?? null);
    // o que o próprio tutor cancelou aparece como "Cancelado por você", não como recusa
    const dele = new Set((a?.itens ?? []).filter((x) => x.cancelado_cliente).map((x) => x.chave));
    if (lido?.itens && dele.size) lido.itens = lido.itens.map((i) => (dele.has(`${i.pet}|${i.dia}|${i.hora}`) ? { ...i, status: "cliente" } : i));
    aplicarTema(lido?.tema);
    setAcoes(a);
    setPedido(lido);
  }, [id]);

  useEffect(() => { void buscar(); }, [buscar]);
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
  const zap = pedido ? linkWhatsApp(pedido.telefone, `Oi! Fiz ${oPedido} pelo link e queria falar sobre ele.`) : null;
  const loja = pedido?.petshop ?? "";

  // cancelar e pedir outra data por aqui: só quando quem recebe o pedido ligou, e só no que ainda está por vir
  const podeMexer = !!acoes?.ligado && acoes.aberto;
  const prazo = acoes ? prazoPorExtenso(acoes.horas) : "";
  const abertos = itens.filter((i) => i.status === "pendente" || i.status === "aceito").map((i) => i.pet);

  async function mandar(qual: "cancelar" | "mudar") {
    if (travado.current) return; // dois toques seguidos valem um
    const texto = recado.trim();
    if (qual === "mudar" && texto.length < 3) { setErro("Escreva que dia e horário ficam bons para você."); return; }
    travado.current = true;
    setOcupado(true);
    setErro(null);
    try {
      const { data, error } = qual === "cancelar"
        ? await banco().rpc("link_pedido_cancelar", { p_id: id, p_recado: texto || undefined })
        : await banco().rpc("link_pedido_pedir_mudanca", { p_id: id, p_recado: texto });
      const r = data as unknown as { ok?: boolean; erro?: string; cancelados?: number; pedidos?: number } | null;
      if (error || !r) { setErro("Não deu para enviar agora. Confira a internet e tente de novo."); return; }
      if (!r.ok) {
        setErro(r.erro === "prazo" ? `O prazo para ${qual === "cancelar" ? "cancelar" : "pedir outra data"} por aqui já passou (${prazo}). Fale com ${loja} pelo WhatsApp.`
          : r.erro === "desligado" ? `${loja} não está recebendo isso por aqui agora. Fale pelo WhatsApp.`
          : r.erro === "fechado" ? "Este pedido já foi encerrado. Atualizei a página."
          : r.erro === "recado" ? "Escreva que dia e horário ficam bons para você."
          : "Algo deu errado. Tente de novo em instantes.");
        if (r.erro !== "recado") void buscar();
        return;
      }
      setFeito(qual === "mudar" ? `Recado enviado. ${loja} responde pelo seu WhatsApp. Até lá, o que está combinado continua valendo.`
        : (r.pedidos ?? 0) > 0 && !(r.cancelados ?? 0) ? `Pedido de cancelamento enviado. Como há pagamento combinado, ${loja} conclui o cancelamento e fala com você.`
        : (r.pedidos ?? 0) > 0 ? `Cancelado em parte. Onde há pagamento combinado, ${loja} conclui o cancelamento e fala com você.`
        : (r.cancelados ?? 0) > 0 ? "Cancelado." : "Este pedido já estava cancelado.");
      setPainel(null);
      setRecado("");
      await buscar();
    } finally { travado.current = false; setOcupado(false); }
  }
  const abrir = (qual: "cancelar" | "mudar") => { setPainel(qual); setRecado(""); setErro(null); setFeito(null); };

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
              <h1>{desistiu ? "Pedido cancelado." : geral === "aguardando" ? `${pedido.tutor}, seu pedido chegou.` : geral === "confirmado" ? "Está confirmado!" : geral === "recusado" ? (soEstadia ? "Não temos vaga nessas datas." : "Não deu neste horário.") : `${pedido.petshop} respondeu.`}</h1>
              <p className="g-muted">
                {desistiu ? `Você cancelou este pedido e ${pedido.petshop} já vê isso por lá. Se quiser, é só pedir de novo.`
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
                      <span>{[i.servico, dataLonga(deIsoDia(i.dia)), i.ate && i.ate !== i.dia ? `até ${dataLonga(deIsoDia(i.ate))}` : null].filter(Boolean).join(" · ")}</span>
                    </div>
                    <div className="lado">
                      {(!i.tipo || i.tipo === "servico") && <span className="hora"><Clock aria-hidden />{i.hora}</span>}
                      <span className={`g-tag ${TEXTO[i.status].tom}`}>{rotuloDe(i)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {feito && <p className="g-lkp-feito" role="status">{feito}</p>}
              {acoes?.pediu && acoes.aberto && !painel && (
                <p className="g-lkp-recado">
                  <CalendarClock aria-hidden />
                  <span>
                    {acoes.pediu === "mudar" ? "Você pediu outra data" : "Você pediu para cancelar"}{acoes.pediu_em ? ` em ${diaEHora(acoes.pediu_em)}` : ""}.
                    {acoes.recado ? ` Seu recado: “${acoes.recado}”` : ""} {pedido.petshop} responde pelo seu WhatsApp.{acoes.pediu === "mudar" ? " Até lá, o que está combinado continua valendo." : ""}
                  </span>
                </p>
              )}
              <div className="g-lkp-acoes">
                {algumRecusado && <Link className="g-btn pri" href={`/gestao/agendar/${pedido.codigo}`}>{desistiu ? "Fazer um novo pedido" : soEstadia ? "Escolher outras datas" : "Escolher outro horário"}</Link>}
                {aguardando && <button className="g-btn sec" onClick={() => void buscar()} disabled={atualizando}><RefreshCw />{atualizando ? "Atualizando…" : "Atualizar"}</button>}
                {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {pedido.petshop}</a>}
              </div>
            </section>

            {podeMexer && acoes!.no_prazo && !painel && (
              <section className="g-card g-lkp-mexer">
                <h2>Precisa mudar ou cancelar?</h2>
                <p className="g-muted g-p">
                  {acoes!.limite ? `Dá para fazer por aqui ${prazo}: até ${diaEHora(acoes!.limite)}.` : "Dá para fazer por aqui enquanto o pedido espera a confirmação."}
                </p>
                <div className="g-lkp-acoes">
                  <button type="button" className="g-btn sec" onClick={() => abrir("mudar")}><CalendarClock />Pedir outra data</button>
                  <button type="button" className="g-btn perigo" onClick={() => abrir("cancelar")}><CalendarX />Cancelar o pedido</button>
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
                <label className="g-campo"><span>{painel === "cancelar" ? <>Quer dizer o motivo? <small>(opcional)</small></> : "Que dia e horário ficam bons para você?"}</span>
                  <textarea className="g-textarea" value={recado} maxLength={300} placeholder={painel === "cancelar" ? "" : "Pode ser na sexta de manhã ou no sábado à tarde"} onChange={(e) => { setRecado(e.target.value); setErro(null); }} />
                </label>
                {erro && <p className="g-lkp-erro" role="alert">{erro}</p>}
                <div className="g-lkp-acoes">
                  <button type="button" className="g-btn sec" disabled={ocupado} onClick={() => { setPainel(null); setErro(null); }}>Voltar</button>
                  {painel === "cancelar"
                    ? <button type="button" className="g-btn perigo" disabled={ocupado} onClick={() => void mandar("cancelar")}>{ocupado ? "Cancelando…" : "Sim, cancelar"}</button>
                    : <button type="button" className="g-btn pri" disabled={ocupado} onClick={() => void mandar("mudar")}>{ocupado ? "Enviando…" : "Enviar recado"}</button>}
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
