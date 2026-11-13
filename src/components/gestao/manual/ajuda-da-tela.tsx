"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CircleHelp, LifeBuoy } from "lucide-react";
import { NOME_TELA, ROTA_MANUAL, telaDoCaminho, topicosDaRota } from "@/lib/gestao/manual";
import { Folha } from "../ui";
import { ItemTopico } from "./topico";
import "./manual.css";

/** Evento para abrir a conversa da Ajuda de qualquer tela (o Manual usa quando a busca não acha nada). */
export const EVENTO_AJUDA = "gestao:ajuda";
export const abrirAjuda = () => window.dispatchEvent(new Event(EVENTO_AJUDA));

/**
 * Botão "Como usar esta tela", na barra de cima de todas as telas: abre o passo a passo dos tópicos do manual
 * que pertencem à tela aberta. Fica na casca, uma vez só, e se orienta pelo endereço.
 */
export default function AjudaDaTela({ aoPerguntar }: { /** abre a conversa da Ajuda */ aoPerguntar: () => void }) {
  const caminho = usePathname();
  const tela = telaDoCaminho(caminho);
  const [aberta, setAberta] = useState(false);
  const [topico, setTopico] = useState<string | null>(null);
  const topicos = topicosDaRota(caminho);

  useEffect(() => { setAberta(false); }, [caminho]);
  useEffect(() => {
    const ouvir = () => { setAberta(false); aoPerguntar(); };
    window.addEventListener(EVENTO_AJUDA, ouvir);
    return () => window.removeEventListener(EVENTO_AJUDA, ouvir);
  }, [aoPerguntar]);

  // no próprio Manual o botão seria repetição
  if (!tela || tela === ROTA_MANUAL || !topicos.length) return null;
  const nome = NOME_TELA[tela];
  const abrir = () => { setTopico(topicos.length <= 2 ? topicos[0].id : null); setAberta(true); };

  return (
    <>
      <button type="button" className="g-man-botao" onClick={abrir} aria-label="Como usar esta tela" title="Como usar esta tela">
        <CircleHelp aria-hidden /><span>Como usar<i> esta tela</i></span>
      </button>
      {aberta && (
        <Folha larga titulo={tela === "/gestao/app" ? "Como usar a tela Hoje" : `Como usar: ${nome}`} aoFechar={() => setAberta(false)}>
          <div className="g-man-folha">
            <p className="g-muted g-p">Toque no que você quer fazer para ver o passo a passo.</p>
            <div className="g-man-lista">
              {topicos.map((t) => (
                <ItemTopico key={t.id} prefixo="f" topico={t} aberto={topico === t.id} aoAlternar={() => setTopico((a) => (a === t.id ? null : t.id))}
                  semTela={tela} aoIr={() => setAberta(false)} />
              ))}
            </div>
            <div className="g-man-saidas">
              <Link className="g-btn sec" href={ROTA_MANUAL} onClick={() => setAberta(false)}><BookOpen />Ver o manual completo</Link>
              <button type="button" className="g-btn verde" onClick={() => { setAberta(false); aoPerguntar(); }}><LifeBuoy />Perguntar para a Ajuda</button>
            </div>
          </div>
        </Folha>
      )}
    </>
  );
}
