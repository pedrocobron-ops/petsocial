import TopoVenda from "@/components/topo-venda";
import Rodape from "@/components/rodape";

/** Páginas de venda da linha "negocios": wrapper `.negocios` (verde-garrafa nos blocos escuros), topo sem menu e o rodapé único. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="negocios">
      <TopoVenda linha="negocios" />
      <main className="linha-negocios">{children}</main>
      <Rodape linha="negocios" />
    </div>
  );
}
