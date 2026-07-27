import type { Metadata } from "next";
import AdminShell from "@/components/admin/shell";

// Sistema interno da Redação: independente do jornal, fora do sitemap e
// invisível para buscadores.
export const metadata: Metadata = {
  title: { absolute: "Redação — Maestro Pet" },
  robots: { index: false, follow: false, nocache: true },
};

export default function RedacaoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-wrap">
      <AdminShell />
      <main>{children}</main>
    </div>
  );
}
