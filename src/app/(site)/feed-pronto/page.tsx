import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FEED_AREAS, POSTS_POR_PACOTE, imgFeed, nomeFeed } from "@/lib/feed-pronto";

export const metadata: Metadata = {
  title: "Feed Pronto: posts editáveis no Canva para negócios pet",
  description: `Pacotes com ${POSTS_POR_PACOTE} posts prontos para o Instagram de pet shops, clínicas, adestradores, dog walkers e outros negócios pet.`,
  // Fora do Google até o lançamento da linha.
  ...(FEED_AREAS.some((a) => a.lancado) ? {} : { robots: { index: false, follow: false } }),
  alternates: { canonical: "/feed-pronto" },
};

export default function Page() {
  return (
    <>
      <section className="lp-hero">
        <div className="container">
          <span className="eyebrow">Feed Pronto · Maestro Pet</span>
          <h1>Posts prontos para o Instagram do seu <em>negócio pet</em></h1>
          <p className="lead">
            Escolha a sua área e receba {POSTS_POR_PACOTE} posts editáveis no Canva, com textos e legendas já escritos.
            Você troca a logo, as fotos e os preços e posta.
          </p>
          <ul className="selos"><li>Editável no Canva grátis</li><li>Legendas prontas</li><li>Acesso imediato</li></ul>
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <span className="eyebrow">Escolha a sua área</span>
          <h2>Um pacote para cada tipo de negócio</h2>
          <div className="feed-areas">
            {FEED_AREAS.map((a) => (
              <Link key={a.slug} href={`/feed-pronto/${a.slug}`} className="feed-area">
                <Image src={imgFeed(a, "capa.webp")} alt={`Capa do ${nomeFeed(a)}`} width={300} height={375} />
                <div>
                  <h3>{nomeFeed(a)}</h3>
                  <p>{a.chamada}</p>
                  {!a.lancado && <span className="guia-breve">Em breve</span>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
