"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";

/**
 * Ações a mais do cabeçalho de uma tela. No computador os botões aparecem todos, como sempre. No celular (até 719 px)
 * ficam guardados no botão "Mais", para o conteúdo da tela não começar depois de quatro fileiras de botões: no alto ficam
 * só a ação principal, uma segunda e o "Mais". Uso, dentro de `g-acoes`:
 *
 *   <MaisAcoes>{…botões e links `g-btn sec`…}</MaisAcoes>
 *
 * O que entra aqui são os mesmos botões de antes (nada some, só muda de lugar). Tocar num deles fecha a lista.
 */
export function MaisAcoes({ children, rotulo = "Mais" }: { children: React.ReactNode; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: Event) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setAberto(false); botao.current?.focus(); } };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla, true);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", tecla, true); };
  }, [aberto]);
  return (
    <div ref={raiz} className={`g-mais-acoes${aberto ? " aberto" : ""}`}>
      <button ref={botao} type="button" className="g-btn sec g-mais-botao" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((a) => !a)}>
        <Ellipsis aria-hidden />{rotulo}
      </button>
      {/* o foco volta para o "Mais" antes da ação: a folha que abrir devolve o foco para ele ao fechar */}
      <div id={id} className="g-mais-lista" role="group" aria-label="Mais ações"
        onClickCapture={(e) => { if (aberto && (e.target as Element).closest("button, a")) { botao.current?.focus(); setAberto(false); } }}>
        {children}
      </div>
    </div>
  );
}
