import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import Logo from "@/components/logo";
import type { Linha } from "@/lib/produtos";

/**
 * Topo das páginas de venda (brief 20, 6.1): não é fixo, sem menu e sem links de fuga.
 * Logo à esquerda e "Garantia de 7 dias" à direita.
 */
export default function TopoVenda({ linha }: { linha: Linha }) {
  return (
    <header className="topo topo-venda">
      <div className="container topo-in">
        <Link href="/" className="logo" aria-label="Maestro Pet, sobre a empresa">
          <Logo negocios={linha === "negocios"} prioridade />
        </Link>
        <p className="topo-garantia"><ShieldCheck size={18} strokeWidth={1.75} aria-hidden /><span><span className="topo-garantia-longo">Garantia de </span>7 dias</span></p>
      </div>
    </header>
  );
}
