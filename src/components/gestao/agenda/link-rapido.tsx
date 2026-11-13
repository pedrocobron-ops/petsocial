"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Link2, MessageCircle, Settings2 } from "lucide-react";
import type { PetComTutor } from "@/lib/gestao/tipos";
import { linkWhatsApp } from "@/lib/gestao/util";
import { textoDoLink } from "@/lib/gestao/agenda";
import { useGestao } from "../contexto";
import { EscolherPet, Folha, ok, useAvisos, useSomenteLeitura } from "../ui";
import { EVENTO_LINK } from "../lembrado";
import "./link-rapido.css";

/**
 * Atalho do link de agendamento: copiar, mandar no WhatsApp (para qualquer contato ou direto para um cliente)
 * e ligar o link, sem precisar ir até Meu pet shop.
 */
export default function LinkRapido({ rotulo = "Link do cliente" }: { rotulo?: string }) {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [ligando, setLigando] = useState(false);
  // os primeiros passos e o resumo da semana pedem para abrir esta janela
  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener(EVENTO_LINK, abrir);
    return () => window.removeEventListener(EVENTO_LINK, abrir);
  }, []);
  const endereco = `${typeof window === "undefined" ? "" : window.location.origin}/gestao/agendar/${petshop.link_codigo}`;
  const convite = (nome?: string | null) => textoDoLink(petshop, endereco, nome);

  async function copiar() {
    try { await navigator.clipboard.writeText(endereco); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { avisar("Não consegui copiar. Segure o dedo no endereço para copiar."); }
  }
  async function ligar() {
    if (somenteLeitura() || ligando) return;
    setLigando(true);
    try {
      ok(await sb.from("petshops").update({ link_ativo: true }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisar("Link ligado. Já pode mandar para os clientes.");
    } catch (e) { avisarErro(e); } finally { setLigando(false); }
  }
  async function alternar(campo: "link_creche" | "link_hotel", valor: boolean) {
    if (somenteLeitura()) return;
    try {
      ok(await sb.from("petshops").update(campo === "link_creche" ? { link_creche: valor } : { link_hotel: valor }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisar(valor ? `O link agora recebe pedido de ${campo === "link_creche" ? "creche" : "hotel"}.` : `O link não recebe mais pedido de ${campo === "link_creche" ? "creche" : "hotel"}.`);
    } catch (e) { avisarErro(e); }
  }
  function mandarPara(pet: PetComTutor) {
    const url = linkWhatsApp(pet.clientes?.telefone, convite(pet.clientes?.nome));
    if (!url) { avisar(`${pet.clientes?.nome ?? "Esse tutor"} está sem telefone no cadastro.`); return; }
    window.open(url, "_blank", "noopener,noreferrer");
    setEscolhendo(false);
  }

  return (
    <>
      <button className="g-btn sec" onClick={() => setAberto(true)}><Link2 /><span className="g-lr-rot">{rotulo}</span></button>
      {aberto && (
        <Folha titulo="Link de agendamento" aoFechar={() => { setAberto(false); setEscolhendo(false); }}>
          {!petshop.link_ativo ? (
            <div className="g-pilha">
              <p className="g-muted">O link está desligado. Com ele ligado, o cliente escolhe o serviço e um horário livre pelo celular e manda o pedido. Nada é marcado sem você aceitar.</p>
              {souDono ? <button className="g-btn pri" disabled={ligando} onClick={() => void ligar()}>{ligando ? "Ligando…" : "Ligar o link"}</button>
                : <p className="g-p">Peça ao dono do pet shop para ligar o link em Meu pet shop.</p>}
            </div>
          ) : escolhendo ? (
            <div className="g-pilha">
              <p className="g-muted g-p">Escolha o pet: o WhatsApp do tutor abre com o convite e o link.</p>
              <EscolherPet aoEscolher={mandarPara} autoFocus />
              <button className="g-btn sec" onClick={() => setEscolhendo(false)}>Voltar</button>
            </div>
          ) : (
            <div className="g-pilha">
              <p className="g-muted g-p">O cliente vê só os horários livres: o que já está marcado, pedido ou bloqueado não aparece para ele. O pedido chega aqui para você aceitar ou recusar.</p>
              <div className="g-lr-endereco"><span>{endereco}</span></div>
              <div className="g-lr-acoes">
                <button className="g-btn verde" onClick={() => void copiar()}>{copiado ? <Check /> : <Copy />}{copiado ? "Copiado" : "Copiar link"}</button>
                <button className="g-btn zap" onClick={() => setEscolhendo(true)}><MessageCircle />Mandar para um cliente</button>
                <a className="g-btn sec" href={`https://wa.me/?text=${encodeURIComponent(convite())}`} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar para outro contato</a>
                <a className="g-btn fantasma" href={endereco} target="_blank" rel="noopener noreferrer">Ver como o cliente vê</a>
              </div>
              {souDono && (
                <div className="g-card liso g-pilha p">
                  <b className="g-p">O que o cliente pode pedir pelo link</b>
                  <p className="g-muted g-pp">Os serviços de banho e tosa aparecem sempre. Creche e hotel, só se você ligar aqui. O preço da diária e as vagas ficam em Meu pet shop.</p>
                  <label className="g-check"><input type="checkbox" checked={petshop.link_creche} onChange={(e) => void alternar("link_creche", e.target.checked)} />Creche (passar o dia)</label>
                  <label className="g-check"><input type="checkbox" checked={petshop.link_hotel} onChange={(e) => void alternar("link_hotel", e.target.checked)} />Hotel (dormir)</label>
                </div>
              )}
              {souDono && <Link className="g-btn fantasma p" href="/gestao/app/meu-petshop" style={{ justifySelf: "start" }}><Settings2 />Recado e ajustes do link</Link>}
            </div>
          )}
        </Folha>
      )}
    </>
  );
}
