import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllPublishedSlugs, getArticle, getRelated } from "@/lib/news";
import { dataLonga, paragrafos, tempoDeLeitura } from "@/lib/format";
import ArticleCard from "@/components/article-card";
import AdSlot from "@/components/ad-slot";
import ShareRow from "@/components/share-row";
import ViewTracker from "@/components/view-tracker";
import ProgressBar from "@/components/progress-bar";
import Reveal from "@/components/reveal";

export const revalidate = 300;
export const dynamicParams = true;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllPublishedSlugs();
  return slugs.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const artigo = await getArticle(slug);
  if (!artigo) return { title: "Matéria não encontrada" };

  const descricao = artigo.dek ?? paragrafos(artigo.body)[0]?.slice(0, 160) ?? "";
  return {
    title: artigo.title,
    description: descricao,
    alternates: { canonical: `/noticias/${artigo.slug}` },
    openGraph: {
      type: "article",
      title: artigo.title,
      description: descricao,
      publishedTime: artigo.published_at ?? undefined,
      modifiedTime: artigo.updated_at,
      authors: [artigo.author_name],
      section: artigo.category?.name,
      images: artigo.cover_url ? [{ url: artigo.cover_url }] : undefined,
    },
    twitter: { card: "summary_large_image" },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const artigo = await getArticle(slug);
  if (!artigo) notFound();

  const relacionadas = await getRelated(artigo, 3);
  const corpo = paragrafos(artigo.body);
  const url = `${SITE_URL}/noticias/${artigo.slug}`;
  const cor = artigo.category?.color ?? "#f97316";

  // Matéria "atualizada" quando editada mais de 1h após a publicação
  const foiAtualizada =
    artigo.published_at &&
    new Date(artigo.updated_at).getTime() - new Date(artigo.published_at).getTime() >
      60 * 60 * 1000;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: artigo.title,
    description: artigo.dek ?? undefined,
    image: artigo.cover_url ? [artigo.cover_url] : undefined,
    datePublished: artigo.published_at ?? undefined,
    dateModified: artigo.updated_at,
    inLanguage: "pt-BR",
    isAccessibleForFree: true,
    articleSection: artigo.category?.name,
    mainEntityOfPage: url,
    author: { "@type": "Organization", name: artigo.author_name, url: `${SITE_URL}/sobre` },
    publisher: {
      "@type": "NewsMediaOrganization",
      name: "Maestro Pet",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/mozart/rosto.png` },
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: SITE_URL },
      ...(artigo.category
        ? [{
            "@type": "ListItem",
            position: 2,
            name: artigo.category.name,
            item: `${SITE_URL}/categoria/${artigo.category.slug}`,
          }]
        : []),
      {
        "@type": "ListItem",
        position: artigo.category ? 3 : 2,
        name: artigo.title,
        item: url,
      },
    ],
  };

  return (
    <article style={{ ["--cat-cor" as string]: cor }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <ProgressBar />
      <ViewTracker articleId={artigo.id} />

      <header className="article-head">
        <nav className="breadcrumbs" aria-label="Você está em">
          <Link href="/">Início</Link>
          <span className="sep">›</span>
          {artigo.category && (
            <>
              <Link href={`/categoria/${artigo.category.slug}`}>{artigo.category.name}</Link>
              <span className="sep">›</span>
            </>
          )}
          <span className="atual">Matéria</span>
        </nav>
        {artigo.category && (
          <span className="kicker-chip">
            {artigo.category.emoji} {artigo.category.name}
          </span>
        )}
        <h1>{artigo.title}</h1>
        {artigo.dek && <p className="dek">{artigo.dek}</p>}
        <div className="article-meta">
          <span>Por <b>{artigo.author_name}</b></span>
          <span>{dataLonga(artigo.published_at)}</span>
          {foiAtualizada && <span>Atualizada em {dataLonga(artigo.updated_at)}</span>}
          <span>⏱ {tempoDeLeitura(artigo.body)} min de leitura</span>
        </div>
        <ShareRow url={url} title={artigo.title} />
      </header>

      {artigo.cover_url && (
        <Reveal>
          <figure className="article-cover">
            <div className="frame">
              <Image
                src={artigo.cover_url}
                alt={artigo.cover_caption ?? artigo.title}
                fill
                priority
                sizes="(max-width: 1040px) 100vw, 1000px"
                style={{ objectFit: "cover" }}
              />
            </div>
            {artigo.cover_caption && <figcaption>{artigo.cover_caption}</figcaption>}
          </figure>
        </Reveal>
      )}

      <div className="article-body">
        {corpo.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}
        {corpo.length > 3 && <AdSlot slot="materia-meio" />}
        {corpo.slice(2).map((p, i) => <p key={i + 2}>{p}</p>)}
      </div>

      <div className="container">
        <AdSlot slot="materia-fim" />
        {relacionadas.length > 0 && (
          <section aria-label="Matérias relacionadas" style={{ marginTop: 24 }}>
            <Reveal>
              <div className="section-head" style={{ ["--cor" as string]: cor }}>
                <h2><span className="emoji">🐾</span>Leia também</h2>
              </div>
              <div className="grid">
                {relacionadas.map((a) => <ArticleCard key={a.id} artigo={a} />)}
              </div>
            </Reveal>
          </section>
        )}
      </div>
    </article>
  );
}
