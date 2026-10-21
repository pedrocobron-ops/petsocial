"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Blocos que entram com animação quando aparecem na tela. */
const ALVOS = [
  ".secao .eyebrow", ".secao h2", ".virada p",
  ".pilar", ".guia", ".dica", ".passos li",
  ".dores blockquote", ".virada-art", ".recebe li", ".paginas img", ".metodo-art", ".dia",
  ".bonus-card", ".pq", ".oferta-mockup", ".oferta-box", ".garantia img", ".garantia > div",
  ".faq details", ".cta-final .btn", ".prose > *",
].join(",");

/**
 * Revela os blocos ao rolar a página e marca o topo quando a página sai do início.
 * Sem JavaScript (ou com "reduzir movimento" ligado) tudo aparece normalmente.
 */
export default function Animacoes() {
  const caminho = usePathname();

  useEffect(() => {
    const topo = document.querySelector(".topo");
    const aoRolar = () => topo?.classList.toggle("rolou", window.scrollY > 8);
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });

    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir || !("IntersectionObserver" in window)) return () => window.removeEventListener("scroll", aoRolar);

    const raiz = document.documentElement;
    raiz.classList.add("mv");
    const els = Array.from(document.querySelectorAll<HTMLElement>(ALVOS)).filter((el) => !el.classList.contains("vis"));
    const ordem = new Map<Element, number>();
    for (const el of els) {
      const pai = el.parentElement;
      const i = ordem.get(pai!) ?? 0;
      ordem.set(pai!, i + 1);
      el.style.setProperty("--i", String(Math.min(i, 8)));
      el.classList.add("rv");
    }

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.classList.add("in", "vis");
          // Depois de entrar, devolve ao bloco as próprias transições (hover etc.).
          const fim = (ev: TransitionEvent) => {
            if (ev.target !== el || ev.propertyName !== "opacity") return;
            el.classList.remove("rv", "in");
            el.style.removeProperty("--i");
            el.removeEventListener("transitionend", fim);
          };
          el.addEventListener("transitionend", fim);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", aoRolar);
    };
  }, [caminho]);

  return null;
}
