import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PaginaVendas from "@/components/pagina-vendas";
import { PRODUTOS, linhaDe } from "@/lib/produtos";
import { PAGINAS } from "@/lib/vendas";

type Params = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return PRODUTOS.filter((p) => linhaDe(p) === "tutor" && PAGINAS[p.slug]).map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const slug = (await params).slug;
  const c = PAGINAS[slug];
  const p = PRODUTOS.find((x) => x.slug === slug);
  return {
    // Guia ainda não lançado: a página existe para revisão, mas fica fora do Google até entrar na vitrine.
    ...(p && !p.lancado ? { robots: { index: false, follow: false } } : {}),
    title: c.seo.titulo,
    description: c.seo.descricao,
    alternates: { canonical: `/${c.slug}` },
    openGraph: { title: c.seo.titulo, description: c.seo.descricao, images: [{ url: `/og/${c.slug}.png`, width: 1200, height: 630 }] },
  };
}

export default async function Page({ params }: Params) {
  const { slug } = await params;
  const c = PAGINAS[slug];
  const p = PRODUTOS.find((x) => x.slug === slug && linhaDe(x) === "tutor");
  if (!c || !p) notFound();
  return <PaginaVendas c={c} p={p} />;
}
