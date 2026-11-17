"use client";

import Link from "next/link";
import { MessageCircle, RotateCcw, Ticket } from "lucide-react";
import { ETIQUETA_MOTIVO, fraseDoPacote, lerPacotesAcabando, linkRenovar, textoOferecerRenovar, type PacoteAcabando } from "@/lib/gestao/pacote-acabando";
import { linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { Tile } from "./painel";
import { useDados } from "./ui";
import "./pacote-acabando.css";

/**
 * Aviso de pacote acabando de um pet (na ficha do tutor, no horário e em Fechar a conta): sobra 1 uso, acabou há pouco,
 * vence em até 7 dias ou venceu há pouco. "Oferecer renovar" abre o WhatsApp do aparelho com o texto pronto (nada vai sozinho);
 * "Vender de novo" abre a venda do pacote já preenchida, em Pacotes.
 */
export function AvisoPacoteAcabando({ petId, petIds, compacto }: { petId?: string; petIds?: string[]; compacto?: boolean }) {
  const { sb, petshop, posso } = useGestao();
  const ids = petIds ?? (petId ? [petId] : []);
  const { dados } = useDados(async () => {
    if (!ids.length) return [] as PacoteAcabando[];
    const listas = await Promise.all(ids.map((id) => lerPacotesAcabando(sb, petshop.id, id)));
    return listas.flat();
  }, [petshop.id, ids.join(",")]);
  if (!dados?.length) return null;
  const vende = posso("pacotes");
  return (
    <div className={`g-pac-aviso${compacto ? " compacto" : ""}`} role="status" aria-label="Pacote acabando">
      {dados.map((p) => <LinhaAcabando key={p.id} p={p} vende={vende} />)}
    </div>
  );
}

/** Uma linha: o pet, o pacote, o que está acontecendo e os dois botões. */
export function LinhaAcabando({ p, vende, comPet, aoRenovar }: { p: PacoteAcabando; vende: boolean; comPet?: boolean; /** na própria tela Pacotes: abre a venda aqui */ aoRenovar?: () => void }) {
  const { petshop } = useGestao();
  const zap = p.tutor?.nao_quer ? null : linkWhatsApp(p.tutor?.telefone, textoOferecerRenovar(p, petshop.nome));
  return (
    <div className="g-pac-aviso-linha">
      <Tile icone={Ticket} tom="lilas" tamanho="p" />
      <span className="t">
        <b>{comPet ? `${p.pet.nome} · ` : ""}{/^pacote\b/i.test(p.nome) ? p.nome : `Pacote ${p.nome}`}: {fraseDoPacote(p)}</b>
        <span><span className={`g-tag ${p.motivo === "acabou" || p.motivo === "vencido" ? "vermelho" : "laranja"}`}>{ETIQUETA_MOTIVO[p.motivo]}</span>{" "}
          {p.tutor ? (p.tutor.nao_quer ? `${p.tutor.nome} não quer receber mensagens.` : !zap ? `${p.tutor.nome} está sem telefone na ficha.` : "Vale oferecer a renovação.") : "Sem tutor na ficha."}</span>
      </span>
      <span className="g-pac-aviso-acoes">
        {zap && <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Oferecer renovar</a>}
        {vende && (aoRenovar
          ? <button type="button" className="g-btn sec p" onClick={aoRenovar}><RotateCcw />Vender de novo</button>
          : <Link className="g-btn sec p" href={linkRenovar(p.id)}><RotateCcw />Vender de novo</Link>)}
      </span>
    </div>
  );
}
