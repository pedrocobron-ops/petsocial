"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Blocos das páginas ainda não migradas que também entram com o reveal.
 * As páginas novas já escrevem `className="rv"` no HTML.
 */
const LEGADO = [
  ".secao h2", ".secao .eyebrow", ".pilar", ".cards > .card", ".dica", ".dores blockquote", ".virada-art",
  ".recebe li", ".dia", ".bonus-card", ".pq", ".oferta-box", ".faq details", ".familia-card", ".depois-passos li",
].join(",");

/**
 * Reveal guiado pela rolagem (brief 20, 8.3). O CSS faz tudo com `animation-timeline: view()`;
 * este componente só entra onde o navegador não tem isso: põe `.rv-js` no <html> e revela com IntersectionObserver.
 * Sem JavaScript, nada fica escondido.
 */
export default function Revela() {
  const caminho = usePathname();
  useEffect(() => {
    const raiz = document.documentElement;
    document.querySelectorAll<HTMLElement>(LEGADO).forEach((el) => {
      if (el.closest(".topo, .rodape, .barra, [data-sem-rv]")) return;
      el.classList.add("rv");
    });
    if (CSS.supports("animation-timeline: view()") || !("IntersectionObserver" in window)) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    raiz.classList.add("rv-js");
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          // Já passou (página aberta no meio da rolagem): aparece sem esperar.
          if (!e.isIntersecting && e.boundingClientRect.bottom > 0) continue;
          const el = e.target as HTMLElement;
          const irmaos = el.parentElement ? Array.from(el.parentElement.children).filter((x) => x.classList.contains("rv")) : [];
          el.style.transitionDelay = `${Math.min(Math.max(irmaos.indexOf(el), 0), 3) * 70}ms`;
          el.classList.add("rv-on");
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px 200px 0px" },
    );
    document.querySelectorAll(".rv:not(.rv-on)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [caminho]);
  return null;
}
