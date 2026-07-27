import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/lib/news";
import { dataDeHoje } from "@/lib/format";

export default async function SiteHeader() {
  const categorias = await getCategories();

  return (
    <header>
      <div className="topbar">
        <div className="container">
          <span>{dataDeHoje()}</span>
          <span className="motto">O universo pet, bem informado. 🐾</span>
        </div>
      </div>

      <div className="masthead">
        <div className="container">
          <Link href="/" className="masthead-inner" aria-label="Maestro Pet — página inicial">
            <span className="mozart-face">
              <Image src="/mozart/rosto.png" alt="Mozart, o mascote do Maestro Pet" width={64} height={64} priority />
            </span>
            <span className="brand">
              Maestro<em>Pet</em>
            </span>
          </Link>
          <p className="tagline">Jornal do Universo Pet</p>
        </div>
      </div>

      <nav className="catnav" aria-label="Categorias">
        <div className="container">
          <ul>
            <li><Link href="/">Início</Link></li>
            {categorias.map((c) => (
              <li key={c.id}>
                <Link href={`/categoria/${c.slug}`}>{c.name}</Link>
              </li>
            ))}
            <li><Link href="/sobre">Sobre</Link></li>
          </ul>
        </div>
      </nav>
    </header>
  );
}
