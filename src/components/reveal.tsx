"use client";

import { useEffect, useRef } from "react";

/** Revela o conteúdo com fade + subida suave quando entra na tela. */
export default function Reveal({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Navegador sem IntersectionObserver: mostra direto. Perder a animação é
    // melhor do que esconder matéria.
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("visible");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            el.classList.add("visible");
            io.disconnect();
          }
        });
      },
      // Sem threshold percentual de propósito. Uma fração da altura só funciona
      // em blocos curtos: numa grade com dezenas de matérias, a seção é bem
      // mais alta que a janela e a razão exigida só é atingida depois de
      // centenas de pixels de rolagem, deixando o topo da lista em branco.
      // Com threshold 0, basta o bloco encostar na tela. A margem negativa
      // segura a entrada por 60px para o fade não começar colado na borda.
      { rootMargin: "0px 0px -60px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="reveal" style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
