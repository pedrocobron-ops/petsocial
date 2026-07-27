import type { Metadata } from "next";

// Página escondida: fora do sitemap e invisível para buscadores.
export const metadata: Metadata = {
  title: "Redação",
  robots: { index: false, follow: false, nocache: true },
};

export default function RedacaoLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-wrap">{children}</div>;
}
