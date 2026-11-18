"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { escolherCookies, lerEscolhaCookies, pixelNaRota } from "@/components/meta-pixel";

// Só o que é de formulário (campos e os links e botões dentro de um formulário, como "Política de privacidade" do cadastro
// da dobra). Antes valia qualquer link: numa página cheia de links (a capa do Gestão no celular) a pílula ficava sempre
// escondida e ninguém conseguia tocar em Recusar.
const ALVOS = "input, select, textarea, form a[href], form button";

/** Algum campo de formulário (ou link/botão dentro de um formulário) está embaixo da pílula? */
function cobreAlgo(pilula: HTMLElement) {
  const r = pilula.getBoundingClientRect();
  if (!r.height) return false;
  return Array.from(document.querySelectorAll<HTMLElement>(ALVOS)).some((el) => {
    if (pilula.contains(el) || el.closest(".barra, dialog")) return false;
    const e = el.getBoundingClientRect();
    if (!e.width || !e.height) return false;
    return e.bottom > r.top - 4 && e.top < r.bottom + 4 && e.right > r.left && e.left < r.right;
  });
}

/**
 * Aviso de cookies (LGPD), em uma linha (brief 20, 6.20). Só aparece onde o Pixel carrega (`pixelNaRota`): no aplicativo,
 * no cadastro, na entrada e nas páginas dos tutores não há medição, então não há aviso. "Aceitar" ou "Recusar" (a política do
 * site, parte 5, diz que dá para recusar): recusando, o Pixel não manda nada deste navegador (`escolherCookies`).
 * Fica abaixo da barra de compra, some sozinho depois de 160 px de rolagem (volta na próxima página até a pessoa escolher)
 * e some de vez em "Aceitar" ou "Recusar". Não cobre formulário: sai do caminho enquanto houver campo de formulário embaixo dela
 * (ex.: a linha "Política de privacidade" do formulário da dobra) e some de vez quando um formulário recebe foco.
 */
export default function AvisoCookies() {
  const pathname = usePathname();
  const comPixel = pixelNaRota(pathname);
  const [aberto, setAberto] = useState(false);
  const [fora, setFora] = useState(false);
  const [desvia, setDesvia] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { localStorage.getItem("x"); } catch { return; /* navegação privada sem armazenamento: não mostra */ }
    if (!lerEscolhaCookies()) setAberto(true);
  }, []);
  useEffect(() => {
    if (!aberto || fora) return;
    let quadro = 0;
    let visivelDesde: number | null = null;
    const confere = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const cobre = cobreAlgo(el);
        setDesvia(cobre);
        // Some de vez depois de 160 px rolados com a pílula à vista.
        if (!cobre && visivelDesde === null) visivelDesde = window.scrollY;
        if (visivelDesde !== null && Math.abs(window.scrollY - visivelDesde) > 160) setFora(true);
      });
    };
    const aoFocar = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.matches("input, select, textarea") && !ref.current?.contains(t)) setFora(true);
    };
    confere();
    window.addEventListener("scroll", confere, { passive: true });
    window.addEventListener("resize", confere);
    document.addEventListener("focusin", aoFocar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", confere);
      window.removeEventListener("resize", confere);
      document.removeEventListener("focusin", aoFocar);
    };
  }, [aberto, fora]);
  if (!aberto || !comPixel) return null;
  const escolher = (v: "aceito" | "recusado") => {
    escolherCookies(v);
    setFora(true);
  };
  const escondida = fora || desvia;
  return (
    <div ref={ref} className={`cookies${fora ? " fora" : ""}${desvia && !fora ? " desvia" : ""}`} role="region" aria-label="Aviso de cookies" aria-hidden={escondida || undefined}>
      <Link href="/politica-de-privacidade#cookies" tabIndex={escondida ? -1 : undefined}>Usamos cookies de medição</Link>
      <span className="cookies-botoes">
        <button type="button" className="recusar" onClick={() => escolher("recusado")} tabIndex={escondida ? -1 : undefined}>Recusar</button>
        <button type="button" onClick={() => escolher("aceito")} tabIndex={escondida ? -1 : undefined}>Aceitar</button>
      </span>
    </div>
  );
}
