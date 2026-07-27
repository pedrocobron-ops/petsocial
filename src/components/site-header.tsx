import Image from "next/image";
import Link from "next/link";
import { getCategories, getLatest } from "@/lib/news";
import { dataDeHoje } from "@/lib/format";

export default async function SiteHeader() {
  // Barra mostra as primeiras editorias (ordem do banco); todas ficam no rodapé.
  const [categorias, ultimas] = await Promise.all([getCategories(), getLatest(8)]);
  const principais = categorias.slice(0, 8);

  return (
    <header>
      {/* Ticker de últimas notícias (pausa ao passar o mouse) */}
      {ultimas.length > 0 && (
        <div className="ticker" aria-label="Últimas notícias">
          <span className="tag"><span className="pulse" /> Últimas</span>
          <div className="ticker-viewport">
            <div className="ticker-track">
              {[...ultimas, ...ultimas].map((artigo, i) => (
                <Link key={`${artigo.id}-${i}`} href={`/noticias/${artigo.slug}`}>
                  {artigo.title}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="masthead">
        <div className="container">
          <Link href="/" className="masthead-inner" aria-label="Maestro Pet — página inicial">
            <span className="mozart-face">
              <Image src="/mozart/rosto.png" alt="Mozart, o mascote do Maestro Pet" width={68} height={68} priority />
            </span>
            <span className="brand">
              Maestro<em>Pet</em>
            </span>
          </Link>
          <p className="tagline">
            Jornal do Universo Pet · <span className="data-hoje">{dataDeHoje()}</span>
          </p>
        </div>
      </div>

      <nav className="catnav" aria-label="Editorias">
        <div className="container">
          <ul>
            <li><Link href="/" style={{ ["--cat-cor" as string]: "#f97316" }}>Início</Link></li>
            {principais.map((c) => (
              <li key={c.id}>
                <Link href={`/categoria/${c.slug}`} style={{ ["--cat-cor" as string]: c.color }}>
                  {c.name}
                </Link>
              </li>
            ))}
            <li><Link href="/sobre" style={{ ["--cat-cor" as string]: "#f97316" }}>Sobre</Link></li>
          </ul>
        </div>
      </nav>
    </header>
  );
}
