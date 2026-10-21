import Image from "next/image";
import Link from "next/link";

export default function SiteHeader() {
  return (
    <header className="topo">
      <div className="container topo-inner">
        <Link href="/" className="marca" aria-label="Maestro Pet — página inicial">
          <Image src="/mozart/rosto.png" alt="" width={40} height={40} priority />
          <span>Maestro<em>Pet</em></span>
        </Link>
        <nav aria-label="Principal">
          <Link href="/#guias">Guias</Link>
          <Link href="/sobre">Sobre</Link>
          <Link href="/contato">Contato</Link>
        </nav>
      </div>
    </header>
  );
}
