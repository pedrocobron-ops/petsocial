"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarX, Clock, Hourglass, MessageCircle, RefreshCw } from "lucide-react";
import { banco, configurado } from "@/lib/gestao/supabase";
import { Marca } from "@/components/gestao/marca";
import { dataLonga, deIsoDia, linkWhatsApp } from "@/lib/gestao/util";
import LogoLoja from "@/components/gestao/logo-loja";
import { aplicarTema } from "@/lib/gestao/identidade";
import "./pedido.css";

type Situacao = "pendente" | "aceito" | "recusado" | "cancelado" | "concluido";
type Item = { pet: string; servico: string | null; dia: string; hora: string; status: Situacao; tipo?: string | null; ate?: string | null };
type Pedido = { logo?: string | null; tema?: string | null; petshop: string; telefone: string | null; codigo: string; tutor: string; itens: Item[] };

const TEXTO: Record<Situacao, { rotulo: string; tom: string }> = {
  pendente: { rotulo: "Aguardando a confirmação", tom: "amarelo" },
  aceito: { rotulo: "Confirmado", tom: "verde" },
  recusado: { rotulo: "Não deu neste horário", tom: "vermelho" },
  cancelado: { rotulo: "Cancelado", tom: "vermelho" },
  concluido: { rotulo: "Atendido", tom: "verde" },
};
/** Creche e hotel falam de vaga e de datas, não de horário. */
const ehEstadia = (i: Item) => i.tipo === "creche" || i.tipo === "hotel";
const rotuloDe = (i: Item) => (ehEstadia(i) && i.status === "recusado" ? "Sem vaga nessas datas" : ehEstadia(i) && i.status === "concluido" ? "Encerrado" : TEXTO[i.status].rotulo);

/** Página que o tutor abre para ver se o pedido (de horário ou de vaga na creche e no hotel) foi confirmado. Atualiza sozinha enquanto está aguardando. */
export default function AcompanharPedido({ params }: { params: Promise<{ codigo: string; id: string }> }) {
  const { codigo, id } = use(params);
  const [pedido, setPedido] = useState<Pedido | null | undefined>(undefined);
  const [atualizando, setAtualizando] = useState(false);

  const buscar = useCallback(async () => {
    if (!configurado || !/^[0-9a-f-]{36}$/i.test(id)) { setPedido(null); return; }
    setAtualizando(true);
    const { data, error } = await banco().rpc("link_pedido", { p_id: id });
    setAtualizando(false);
    if (error) { setPedido((p) => p ?? null); return; }
    const lido = (data as unknown as Pedido | null) ?? null;
    aplicarTema(lido?.tema);
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
  const algumRecusado = itens.some((i) => i.status === "recusado" || i.status === "cancelado");
  const geral: "aguardando" | "confirmado" | "recusado" | "misto" = aguardando ? "aguardando" : todos("aceito") || todos("concluido") ? "confirmado" : itens.every((i) => i.status === "recusado" || i.status === "cancelado") ? "recusado" : "misto";
  // só creche e hotel: a página fala de vaga e de datas; com banho no meio, fala de horário
  const soEstadia = itens.length > 0 && itens.every(ehEstadia);
  const umaEstadia = itens.find(ehEstadia);
  const oPedido = soEstadia ? `um pedido de vaga ${umaEstadia?.tipo === "hotel" ? "no hotel" : "na creche"}` : "um pedido de horário";
  const zap = pedido ? linkWhatsApp(pedido.telefone, `Oi! Fiz ${oPedido} pelo link e queria falar sobre ele.`) : null;

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
              <h1>{geral === "aguardando" ? `${pedido.tutor}, seu pedido chegou.` : geral === "confirmado" ? "Está confirmado!" : geral === "recusado" ? (soEstadia ? "Não temos vaga nessas datas." : "Não deu neste horário.") : `${pedido.petshop} respondeu.`}</h1>
              <p className="g-muted">
                {geral === "aguardando" ? `${pedido.petshop} ainda vai confirmar. Esta página atualiza sozinha; pode deixar aberta ou voltar depois.`
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
              <div className="g-lkp-acoes">
                {algumRecusado && <Link className="g-btn pri" href={`/gestao/agendar/${pedido.codigo}`}>{soEstadia ? "Escolher outras datas" : "Escolher outro horário"}</Link>}
                {aguardando && <button className="g-btn sec" onClick={() => void buscar()} disabled={atualizando}><RefreshCw />{atualizando ? "Atualizando…" : "Atualizar"}</button>}
                {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {pedido.petshop}</a>}
              </div>
            </section>
            {!algumRecusado && <p className="g-lkp-nota">Precisa mudar ou cancelar? Fale com {pedido.petshop} pelo WhatsApp.</p>}
          </>
        )}
        <p className="g-lkp-pe"><Marca tamanho={16} /> Feito com Maestro Pet Gestão · <Link href="/gestao/privacidade">Privacidade</Link></p>
      </div>
    </main>
  );
}
