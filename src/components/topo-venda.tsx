import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import Logo from "@/components/logo";
import type { Linha } from "@/lib/produtos";

/**
 * Topo das páginas de venda (brief 20, 6.1): não é fixo, sem menu e sem links de fuga.
 * Logo à esquerda e "Garantia de 7 dias" à direita, sempre por extenso (na linha Negócios o sufixo some abaixo de 420 px).
 * A logo não pede prioridade: na venda o LCP é a capa ou o h1.
 */
export default function TopoVenda({ linha }: { linha: Linha }) {
  return (
    <header className="topo topo-venda">
      <div className="container topo-in">
        <Link href="/" className="logo" aria-label={linha === "negocios" ? "Maestro Pet Negócios, página inicial" : "Maestro Pet, página inicial"}>
          <Logo negocios={linha === "negocios"} />
        </Link>
        <p className="topo-garantia"><ShieldCheck size={18} strokeWidth={1.75} aria-hidden /><span>Garantia de 7 dias</span></p>
      </div>
    </header>
  );
}
