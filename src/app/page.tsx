import Image from "next/image";
import Link from "next/link";
import { getFeatured, getLatest } from "@/lib/news";
import { dataLonga } from "@/lib/format";
import ArticleCard from "@/components/article-card";
import AdSlot from "@/components/ad-slot";

export const revalidate = 300; // atualiza a cada 5 minutos

export default async function Home() {
  const [destaques, ultimas] = await Promise.all([getFeatured(4), getLatest(15)]);

  const principal = destaques[0] ?? ultimas[0];
  const laterais = (
    principal
      ? [...destaques.slice(1), ...ultimas.filter((a) => a.id !== principal.id)]
      : ultimas
  )
    .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
    .slice(0, 3);

  const usados = new Set([principal?.id, ...laterais.map((a) => a.id)]);
  const grade = ultimas.filter((a) => !usados.has(a.id)).slice(0, 9);

  if (!principal) {
    return (
      <div className="container empty-state">
        <div className="face">
          <Image src="/mozart/rosto.png" alt="" width={90} height={90} />
        </div>
        <h2>O Mozart está preparando a redação…</h2>
        <p>As primeiras notícias chegam em instantes. Volte logo mais!</p>
      </div>
    );
  }

  return (
    <div className="container">
      {/* ---------- Destaque principal ---------- */}
      <section className="lead-grid">
        <article className="lead-main">
          <Link href={`/noticias/${principal.slug}`} className="cover">
            {principal.cover_url && (
              <Image
                src={principal.cover_url}
                alt=""
                fill
                priority
                sizes="(max-width: 900px) 100vw, 60vw"
                style={{ objectFit: "cover" }}
              />
            )}
          </Link>
          {principal.category && (
            <span className="kicker" style={{ color: principal.category.color }}>
              {principal.category.name}
            </span>
          )}
          <h2><Link href={`/noticias/${principal.slug}`}>{principal.title}</Link></h2>
          {principal.dek && <p className="dek">{principal.dek}</p>}
          <p className="byline">
            Por <b>{principal.author_name}</b> · {dataLonga(principal.published_at)}
          </p>
        </article>

        <div className="lead-side">
          {laterais.map((artigo) => (
            <article className="side-item" key={artigo.id}>
              <div>
                {artigo.category && (
                  <span className="kicker" style={{ color: artigo.category.color }}>
                    {artigo.category.name}
                  </span>
                )}
                <h3><Link href={`/noticias/${artigo.slug}`}>{artigo.title}</Link></h3>
                <p className="byline">{dataLonga(artigo.published_at)}</p>
              </div>
              <Link href={`/noticias/${artigo.slug}`} className="thumb" aria-hidden tabIndex={-1}>
                {artigo.cover_url && (
                  <Image src={artigo.cover_url} alt="" fill sizes="108px" style={{ objectFit: "cover" }} />
                )}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <AdSlot slot="home-topo" />

      <hr className="rule-double" />

      {/* ---------- Últimas notícias ---------- */}
      <section aria-label="Últimas notícias">
        <h2 className="section-title"><span className="dot">●</span> Últimas notícias</h2>
        <div className="grid">
          {grade.map((artigo) => (
            <ArticleCard key={artigo.id} artigo={artigo} />
          ))}
        </div>
      </section>

      {/* ---------- Faixa do Mozart ---------- */}
      <aside className="mozart-strip">
        <div className="face">
          <Image src="/mozart/rosto.png" alt="Mozart, o border collie mascote" width={72} height={72} />
        </div>
        <div>
          <div className="titulo">Au! Eu sou o Mozart 🐾</div>
          <p>
            Border collie, editor-chefe e farejador oficial de notícias.
            Todo dia eu garimpo o melhor do universo pet para você e seu melhor amigo.
          </p>
        </div>
      </aside>
    </div>
  );
}
