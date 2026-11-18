"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChevronRight, MessageCircleQuestion, Mic } from "lucide-react";
import { ROTA_MANUAL, nomeDaTela, telaDoCaminho, topicosDaRota } from "@/lib/gestao/manual";
import { modoSimples } from "@/lib/gestao/modo-simples";
import { useGestao } from "../contexto";
import { Folha, abrirAssistente } from "../ui";
import { ItemTopico, useUmLoginSo } from "./topico";
import "./manual.css";

/** Evento para abrir a conversa da Ajuda de qualquer tela (o Manual usa quando a busca não acha nada). */
export const EVENTO_AJUDA = "gestao:ajuda";
export const abrirAjuda = () => window.dispatchEvent(new Event(EVENTO_AJUDA));

/**
 * A Ajuda: um lugar só para pedir ajuda, no botão "Ajuda" da barra de cima de todas as telas (e no Ajuda do menu).
 * Abre uma folha com o passo a passo da tela aberta (os tópicos do manual dela) e as três saídas: tirar uma dúvida
 * (a conversa da Ajuda), pedir para o Mozart fazer e o manual completo. Fica na casca, uma vez só, e se orienta pelo endereço.
 */
export default function AjudaDaTela({ aberta, aoFechar, aoPerguntar }: {
  /** O botão "Ajuda" fica na casca (aparece já com a tela, antes deste arquivo baixar); aqui, a folha. */
  aberta: boolean; aoFechar: () => void;
  /** abre a conversa da Ajuda */
  aoPerguntar: () => void;
}) {
  const { petshop, souDono } = useGestao();
  const umLogin = useUmLoginSo();
  const caminho = usePathname();
  const tela = telaDoCaminho(caminho);
  const [topico, setTopico] = useState<string | null>(null);
  // só os tópicos do que o pet shop usa: quem não tem creche não lê sobre a chamada
  const topicos = tela && tela !== ROTA_MANUAL ? topicosDaRota(caminho, petshop) : [];

  // mudou de tela: a folha fecha (só quando muda: este arquivo pode montar já com a folha aberta pelo toque no botão)
  const caminhoAntes = useRef(caminho);
  useEffect(() => { if (caminhoAntes.current !== caminho) { caminhoAntes.current = caminho; aoFechar(); } }, [caminho]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ouvir = () => { aoFechar(); aoPerguntar(); };
    window.addEventListener(EVENTO_AJUDA, ouvir);
    return () => window.removeEventListener(EVENTO_AJUDA, ouvir);
  }, [aoPerguntar, aoFechar]);
  useEffect(() => { if (aberta) setTopico(topicos.length > 0 && topicos.length <= 2 ? topicos[0].id : null); }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps

  const nome = tela ? nomeDaTela(tela, petshop) : "";
  const saida = (icone: React.ReactNode, titulo: string, texto: string, aoTocar: () => void, teste: string) => (
    <button type="button" className="g-ajc-saida" onClick={aoTocar} data-teste={teste}>
      <span className="ic" aria-hidden>{icone}</span>
      <span className="t"><b>{titulo}</b><small>{texto}</small></span>
      <ChevronRight aria-hidden />
    </button>
  );

  return (
    <>
      {aberta && (
        <Folha larga titulo="Ajuda" aoFechar={aoFechar}>
          <div className="g-man-folha g-ajc">
            <div className="g-ajc-saidas">
              {saida(<MessageCircleQuestion />, "Tirar uma dúvida", "Escreva ou fale a pergunta: a resposta vem na hora.", () => { aoFechar(); aoPerguntar(); }, "ajuda-duvida")}
              {saida(<Mic />, "Pedir para o Mozart fazer", "Ele marca, recebe e anota por você. Você confere antes de gravar.", () => { aoFechar(); abrirAssistente(); }, "ajuda-mozart")}
              <Link className="g-ajc-saida" href={ROTA_MANUAL} onClick={aoFechar} data-teste="ajuda-manual">
                <span className="ic" aria-hidden><BookOpen /></span>
                <span className="t"><b>Manual</b><small>Todo o passo a passo, com busca.</small></span>
                <ChevronRight aria-hidden />
              </Link>
            </div>
            {topicos.length > 0 && (
              <div className="g-pilha p">
                <p className="g-rotulo">{tela === "/gestao/app" ? "Como usar a tela Hoje" : `Como usar: ${nome}`}</p>
                <div className="g-man-lista">
                  {topicos.map((t) => (
                    <ItemTopico key={t.id} prefixo="f" topico={t} aberto={topico === t.id} aoAlternar={() => setTopico((a) => (a === t.id ? null : t.id))}
                      semTela={tela ?? undefined} aoIr={aoFechar} semQuem={umLogin} />
                  ))}
                </div>
              </div>
            )}
            {souDono && modoSimples(petshop) && (
              <p className="g-muted g-pp">Modo simples ligado: Relatórios, Escola e outras telas ficam em Outras áreas, no fim do menu. <Link className="g-link" href="/gestao/app/meu-petshop#modo-simples" onClick={aoFechar}>Mudar em Meu pet shop</Link>.</p>
            )}
          </div>
        </Folha>
      )}
    </>
  );
}
