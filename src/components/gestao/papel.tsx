"use client";

import { useEffect, type ReactNode } from "react";
import Link from "@/components/gestao/link-depois";
import { ArrowLeft, Printer } from "lucide-react";
import { dataCurta, hora } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import LogoLoja from "./logo-loja";
import "@/app/(gestao)/gestao/app/agenda/imprimir/imprimir.css";
import "./papel.css";

/**
 * Peças das folhas para imprimir ou salvar em PDF (cobranças da creche, fechamento do caixa, ficha de cuidados).
 * Mesmo jeito da Agenda impressa e da Folha do dia: os controles ficam só na tela; no papel sai o cabeçalho com a logo,
 * o nome do pet shop e a hora da impressão, e o rodapé "Maestro Pet Gestão".
 */

/** O nome do arquivo quando a pessoa escolhe "Salvar como PDF" vem do título da página. */
export function useTituloDoPapel(titulo: string) {
  useEffect(() => {
    const antes = document.title;
    document.title = titulo;
    return () => { document.title = antes; };
  }, [titulo]);
}

/** Voltar, os seletores da folha e o botão de imprimir. Nada disto sai no papel. */
export function ControlesDoPapel({ voltar, rotuloVoltar, children, dica, botao = "Imprimir ou salvar em PDF" }: {
  voltar: string; rotuloVoltar: string; children?: ReactNode; dica?: ReactNode; botao?: string;
}) {
  return (
    <div className="g-imp-controles">
      <Link className="g-btn sec g-imp-voltar" href={voltar}><ArrowLeft />{rotuloVoltar}</Link>
      {children}
      <div className="g-imp-linha">
        <button type="button" className="g-btn pri" onClick={() => window.print()}><Printer />{botao}</button>
      </div>
      <p className="g-muted g-pp">Para salvar em PDF, toque em Imprimir e escolha &quot;Salvar como PDF&quot; no lugar da impressora.{dica ? <> {dica}</> : null}</p>
    </div>
  );
}

/** Cabeçalho da folha: logo, nome do pet shop, o que é a folha e quando foi impressa. */
export function CabecalhoDoPapel({ titulo, apoio }: { titulo: ReactNode; apoio?: ReactNode }) {
  const { petshop } = useGestao();
  const agora = new Date();
  return (
    <header className="g-imp-cab">
      <div className="g-imp-marca">
        <LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={46} />
        <div><h1>{petshop.nome}</h1><p>{titulo}</p>{apoio && <p className="g-pa-apoio">{apoio}</p>}</div>
      </div>
      <p className="g-imp-quando">Impresso em {dataCurta(agora)}, {hora(agora)}</p>
    </header>
  );
}

/** Folha inteira: cabeçalho, conteúdo e rodapé. `classe` muda o tamanho (ex.: "compacta"). */
export function Papel({ classe, children, pe }: { classe?: string; children: ReactNode; pe?: ReactNode }) {
  return (
    <article className={`g-imp-folha g-pa${classe ? ` ${classe}` : ""}`}>
      {children}
      <footer className="g-imp-pe">{pe ? <>{pe} · </> : null}Maestro Pet Gestão</footer>
    </article>
  );
}

/** Pares nome e valor (resumo do caixa, totais), em duas colunas que alinham. */
export function Pares({ linhas }: { linhas: ({ nome: ReactNode; valor: ReactNode; forte?: boolean; recuo?: boolean } | null | false | undefined | 0)[] }) {
  return (
    <dl className="g-pa-pares">
      {linhas.filter(Boolean).map((l, i) => {
        const x = l as { nome: ReactNode; valor: ReactNode; forte?: boolean; recuo?: boolean };
        return (
          <div key={i} className={`${x.forte ? "forte" : ""}${x.recuo ? " recuo" : ""}`}>
            <dt>{x.nome}</dt><dd>{x.valor}</dd>
          </div>
        );
      })}
    </dl>
  );
}
