import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaVendas from "@/components/pagina-vendas";
import { PRODUTOS } from "@/lib/produtos";
import { PAGINAS } from "@/lib/vendas";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PAGINAS).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = PAGINAS[(await params).slug];
  return {
    title: c.seo.titulo,
    description: c.seo.descricao,
    alternates: { canonical: `/${c.slug}` },
    openGraph: { title: c.seo.titulo, description: c.seo.descricao, images: [{ url: `/og/${c.slug}.png`, width: 1200, height: 630 }] },
  };
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const c = PAGINAS[slug];
  const p = PRODUTOS.find((x) => x.slug === slug);
  if (!c || !p) notFound();
  return <PaginaVendas c={c} p={p} />;
}
