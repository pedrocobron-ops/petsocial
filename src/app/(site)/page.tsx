import Image from "next/image";
import Link from "next/link";
import { getFeatured, getLatest, getMostRead, type NewsArticle } from "@/lib/news";
import { mozart } from "@/lib/mozart";
import { dataLonga } from "@/lib/format";
import ArticleCard from "@/components/article-card";
import AdSlot from "@/components/ad-slot";
import Reveal from "@/components/reveal";
import { capaDe } from "@/lib/capa";

export const revalidate = 60; // atualiza a cada minuto (capta publicações agendadas)

export default async function Home() {
  const [destaques, ultimas, maisLidas] = await Promise.all([
    getFeatured(1),
    getLatest(40),
    getMostRead(5),
  ]);

  const principal = destaques[0] ?? ultimas[0];

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

  const corPrincipal = principal.category?.color ?? "#f97316";
  const restantes = ultimas.filter((a) => a.id !== principal.id);

  // Bandas por editoria: agrupa as últimas por categoria (até 3 bandas com 3+ matérias)
  const porCategoria = new Map<string, NewsArticle[]>();
  for (const artigo of restantes) {
    if (!artigo.category) continue;
    const lista = porCategoria.get(artigo.category.id) ?? [];
    lista.push(artigo);
    porCategoria.set(artigo.category.id, lista);
  }
  const bandas = [...porCategoria.values()]
    .filter((lista) => lista.length >= 3)
    .slice(0, 3);
  const usadosEmBandas = new Set(bandas.flat().map((a) => a.id));
  const graderestante = restantes.filter((a) => !usadosEmBandas.has(a.id)).slice(0, 6);

  return (
    <div className="container">
      {/* ---------- Destaque principal + Mais lidas ---------- */}
      <section className="lead-grid">
        <div>
          <article className="lead-main" style={{ ["--cat-cor" as string]: corPrincipal }}>
            <Link href={`/noticias/${principal.slug}`} className="cover">
              <Image
                src={capaDe(principal)}
                alt=""
                fill
                priority
                sizes="(max-width: 920px) 100vw, 66vw"
                style={{ objectFit: "cover" }}
              />
            </Link>
            <div className="lead-body">
              {principal.category && (
                <span className="kicker" style={{ color: corPrincipal }}>
                  {principal.category.emoji} {principal.category.name}
                </span>
              )}
              <h2><Link href={`/noticias/${principal.slug}`}>{principal.title}</Link></h2>
              {principal.dek && <p className="dek">{principal.dek}</p>}
              <p className="byline">
                Por <b>{principal.author_name}</b> · {dataLonga(principal.published_at)}
              </p>
            </div>
          </article>
        </div>

        <div>
          <aside className="mais-lidas" aria-label="Mais lidas">
            <div className="titulo">🔥 Mais lidas</div>
            <ol>
              {maisLidas.map((artigo) => (
                <li key={artigo.id}>
                  <div>
                    {artigo.category && (
                      <span className="cat" style={{ color: artigo.category.color }}>
                        {artigo.category.name}
                      </span>
                    )}
                    <h3><Link href={`/noticias/${artigo.slug}`}>{artigo.title}</Link></h3>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>

      <AdSlot slot="home-topo" />

      {/* ---------- Bandas por editoria ---------- */}
      {bandas.map((lista, i) => {
        const cat = lista[0].category!;
        return (
          <section key={cat.id} aria-label={cat.name}>
            <Reveal delay={i * 60}>
              <div className="section-head" style={{ ["--cor" as string]: cat.color }}>
                <h2><span className="emoji">{cat.emoji}</span>{cat.name}</h2>
                <Link href={`/categoria/${cat.slug}`} className="ver-tudo">
                  Ver tudo →
                </Link>
              </div>
              <div className="grid">
                {lista.slice(0, 3).map((artigo) => (
                  <ArticleCard key={artigo.id} artigo={artigo} />
                ))}
              </div>
            </Reveal>
          </section>
        );
      })}

      {/* ---------- Últimas ---------- */}
      {graderestante.length > 0 && (
        <section aria-label="Últimas notícias">
          <Reveal>
            <div className="section-head" style={{ ["--cor" as string]: "#f97316" }}>
              <h2><span className="emoji">📰</span>Últimas notícias</h2>
            </div>
            <div className="grid">
              {graderestante.map((artigo) => (
                <ArticleCard key={artigo.id} artigo={artigo} />
              ))}
            </div>
          </Reveal>
        </section>
      )}

      {/* ---------- Faixa do Mozart ---------- */}
      <Reveal>
        <aside className="mozart-strip">
          <div className="face">
            <Image src={mozart("oi")} alt="Mozart, o border collie mascote, acenando" width={84} height={84} style={{ objectFit: "cover" }} unoptimized />
          </div>
          <div>
            <div className="titulo">Au! Eu sou o Mozart 🐾</div>
            <p>
              Border collie, editor-chefe e farejador oficial de notícias. Todo dia
              eu garimpo o melhor do universo pet para você e seu melhor amigo.
            </p>
          </div>
        </aside>
      </Reveal>
    </div>
  );
}
