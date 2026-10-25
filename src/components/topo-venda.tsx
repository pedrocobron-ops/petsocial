import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { Linha } from "@/lib/produtos";

/**
 * Topo das páginas de venda: só a marca e os selos de confiança, sem menu.
 * Quem chega pelo anúncio fica na página do produto, sem caminhos para outras linhas.
 */
export default function TopoVenda({ linha }: { linha: Linha }) {
  return (
    <header className={`topo topo-venda${linha === "negocios" ? " topo-negocios" : ""}`}>
      <div className="container topo-inner">
        <Link href="/" className="marca" aria-label="Maestro Pet — sobre a empresa">
          {linha === "tutor" ? (
            <Image src="/mozart/rosto.png" alt="" width={40} height={40} priority />
          ) : (
            <span className="marca-selo" aria-hidden>M</span>
          )}
          <span>Maestro<em>Pet</em>{linha === "negocios" && <small className="marca-linha">Negócios</small>}</span>
        </Link>
        <p className="topo-confianca"><ShieldCheck size={18} aria-hidden /> <span className="so-desktop">Compra segura · </span>Garantia de 7 dias</p>
      </div>
    </header>
  );
}
