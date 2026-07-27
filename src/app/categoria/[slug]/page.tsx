import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getByCategory, getCategories, getCategoryBySlug } from "@/lib/news";
import ArticleCard from "@/components/article-card";
import AdSlot from "@/components/ad-slot";

export const revalidate = 300;
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const categorias = await getCategories();
  return categorias.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categoria = await getCategoryBySlug(slug);
  if (!categoria) return { title: "Categoria não encontrada" };
  return {
    title: `${categoria.name} — notícias e guias`,
    description: `As últimas notícias de ${categoria.name} no jornal do universo pet Maestro Pet.`,
    alternates: { canonical: `/categoria/${categoria.slug}` },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const categoria = await getCategoryBySlug(slug);
  if (!categoria) notFound();

  const artigos = await getByCategory(categoria.id, 30);

  return (
    <div className="container">
      <header className="cat-hero">
        <div className="emoji" aria-hidden>{categoria.emoji}</div>
        <h1 style={{ color: categoria.color }}>{categoria.name}</h1>
        <p>Tudo sobre {categoria.name.toLowerCase()} no universo pet.</p>
      </header>

      <hr className="rule" />

      {artigos.length === 0 ? (
        <div className="empty-state">
          <h2>Ainda não há matérias aqui</h2>
          <p>O Mozart já está farejando novidades para esta editoria. 🐾</p>
        </div>
      ) : (
        <div className="grid">
          {artigos.map((a) => <ArticleCard key={a.id} artigo={a} />)}
        </div>
      )}

      <AdSlot slot="categoria-fim" />
    </div>
  );
}
