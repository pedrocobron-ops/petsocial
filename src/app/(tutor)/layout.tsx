import TopoVenda from "@/components/topo-venda";
import RodapeVenda from "@/components/rodape-venda";
import Animacoes from "@/components/animacoes";

/** Páginas de venda da linha "tutor": topo sem menu e rodapé enxuto. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopoVenda linha="tutor" />
      <main className="linha-tutor">{children}</main>
      <RodapeVenda linha="tutor" />
      <Animacoes />
    </>
  );
}
