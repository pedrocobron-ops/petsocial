import TopoVenda from "@/components/topo-venda";
import RodapeVenda from "@/components/rodape-venda";
import Animacoes from "@/components/animacoes";

/** Páginas de venda da linha "negocios": topo sem menu e rodapé enxuto. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopoVenda linha="negocios" />
      <main className="linha-negocios">{children}</main>
      <RodapeVenda linha="negocios" />
      <Animacoes />
    </>
  );
}
