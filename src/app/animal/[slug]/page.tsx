import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getByAnimal } from "@/lib/news";
import { ANIMAIS, animalPorSlug } from "@/lib/animais";
import ArticleCard from "@/components/article-card";
import AdSlot from "@/components/ad-slot";
import Reveal from "@/components/reveal";

export const revalidate = 300;
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return ANIMAIS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const animal = animalPorSlug(slug);
  if (!animal) return { title: "Página não encontrada" };
  return {
    title: `${animal.nome} — notícias, saúde e comportamento`,
    description: `Todas as notícias e guias sobre ${animal.nome.toLowerCase()} no Maestro Pet: saúde, comportamento, nutrição, adoção e curiosidades.`,
    alternates: { canonical: `/animal/${animal.slug}` },
  };
}

export default async function AnimalPage({ params }: Props) {
  const { slug } = await params;
  const animal = animalPorSlug(slug);
  if (!animal) notFound();

  const artigos = await getByAnimal(animal.slug, 30);

  return (
    <div>
      <header className="cat-hero" style={{ ["--cor" as string]: "#f97316" }}>
        <div className="emoji" aria-hidden>{animal.emoji}</div>
        <h1>{animal.nome}</h1>
        <p>Tudo sobre {animal.nome.toLowerCase()}: saúde, comportamento, nutrição e mais.</p>
      </header>

      <div className="container">
        {artigos.length === 0 ? (
          <div className="empty-state">
            <h2>Em breve por aqui!</h2>
            <p>O Mozart já está farejando as primeiras pautas sobre {animal.nome.toLowerCase()}. 🐾</p>
          </div>
        ) : (
          <Reveal>
            <div className="grid">
              {artigos.map((a) => <ArticleCard key={a.id} artigo={a} />)}
            </div>
          </Reveal>
        )}
        <AdSlot slot="animal-fim" />
      </div>
    </div>
  );
}
