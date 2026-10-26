import TopoVenda from "@/components/topo-venda";
import Rodape from "@/components/rodape";

/** Páginas de venda da linha "tutor": topo sem menu (não fixo) e o rodapé único. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopoVenda linha="tutor" />
      <main className="linha-tutor">{children}</main>
      <Rodape linha="tutor" />
    </>
  );
}
