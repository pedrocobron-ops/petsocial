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
  const p = PRODUTOS.find((x) => x.slug === c.slug);
  return {
    title: c.seo.titulo,
    description: c.seo.descricao,
    alternates: { canonical: `/${c.slug}` },
    openGraph: p?.capa ? { images: [{ url: p.capa }] } : undefined,
  };
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const c = PAGINAS[slug];
  const p = PRODUTOS.find((x) => x.slug === slug);
  if (!c || !p) notFound();
  return <PaginaVendas c={c} p={p} />;
}
