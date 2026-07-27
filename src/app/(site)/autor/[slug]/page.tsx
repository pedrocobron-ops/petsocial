import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AUTORES, autorPorSlug, fotoDoAutor } from "@/lib/autores";
import { getLatest } from "@/lib/news";
import ArticleCard from "@/components/article-card";
import Reveal from "@/components/reveal";
import { mozart } from "@/lib/mozart";

export const revalidate = 300;
export const dynamicParams = false;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return AUTORES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const autor = autorPorSlug(slug);
  if (!autor) return { title: "Autor não encontrado" };
  return {
    title: `${autor.nome} — ${autor.cargo}`,
    description: autor.bio.slice(0, 160),
    alternates: { canonical: `/autor/${autor.slug}` },
  };
}

export default async function AutorPage({ params }: Props) {
  const { slug } = await params;
  const autor = autorPorSlug(slug);
  if (!autor) notFound();

  const [todas, foto] = await Promise.all([getLatest(60), fotoDoAutor(autor.slug)]);
  const doAutor = todas.filter((a) => a.author_name === autor.nome);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: autor.nome,
      jobTitle: autor.cargo,
      description: autor.bio,
      url: `${SITE_URL}/autor/${autor.slug}`,
      image: foto ?? undefined,
      email: autor.email,
      worksFor: { "@type": "NewsMediaOrganization", name: "Maestro Pet", url: SITE_URL },
    },
  };

  return (
    <div className="container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="autor-hero">
        <div className="autor-foto">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt={`${autor.nome}, ${autor.cargo} do Maestro Pet`} />
          ) : (
            <Image src={mozart("rosto")} alt="" width={140} height={140} />
          )}
        </div>
        <div className="autor-dados">
          <span className="autor-cargo">{autor.cargo}</span>
          <h1>{autor.nome}</h1>
          <p>{autor.bio}</p>
          {autor.email && (
            <a href={`mailto:${autor.email}`} className="autor-contato">
              ✉️ {autor.email}
            </a>
          )}
        </div>
      </header>

      <hr className="rule" />

      <section aria-label={`Matérias de ${autor.nome}`}>
        <div className="section-head" style={{ ["--cor" as string]: "#f97316" }}>
          <h2><span className="emoji">📝</span>Matérias assinadas</h2>
        </div>
        {doAutor.length === 0 ? (
          <p style={{ color: "var(--muted)", paddingBottom: 30 }}>
            Nenhuma matéria publicada por este autor ainda.
          </p>
        ) : (
          <Reveal>
            <div className="grid">
              {doAutor.map((a) => <ArticleCard key={a.id} artigo={a} />)}
            </div>
          </Reveal>
        )}
      </section>
    </div>
  );
}
