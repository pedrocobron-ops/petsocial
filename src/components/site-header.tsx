"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Topo das páginas institucionais e das vitrines (as páginas de venda usam o TopoVenda, sem menu). */
export default function SiteHeader() {
  // O Mozart é o rosto da linha de tutores; nas páginas da empresa e de negócios, a marca aparece sem o mascote.
  const tutor = usePathname()?.startsWith("/tutor") ?? false;
  return (
    <header className="topo">
      <div className="container topo-inner">
        <Link href="/" className="marca" aria-label="Maestro Pet — página inicial">
          {tutor ? <Image src="/mozart/rosto.png" alt="" width={40} height={40} priority /> : <span className="marca-selo" aria-hidden>M</span>}
          <span>Maestro<em>Pet</em></span>
        </Link>
        <nav aria-label="Principal">
          <Link href="/tutor">Para tutores</Link>
          <Link href="/negocios">Para negócios pet</Link>
          <Link href="/sobre" className="so-desktop">Quem somos</Link>
          <Link href="/contato" className="so-desktop">Contato</Link>
        </nav>
      </div>
    </header>
  );
}
