import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { EMPRESA } from "@/lib/empresa";

export const metadata: Metadata = { title: "Obrigado pela compra", robots: { index: false, follow: false } };

export default function ObrigadoPage() {
  return (
    <div className="container pc">
      <p className="pc-ok"><CircleCheck size={20} aria-hidden /> Compra aprovada</p>
      <h1>Obrigado! O seu acesso está a caminho.</h1>
      <p className="lead">O link para baixar os arquivos chega no e-mail que você usou na compra, em poucos minutos. Se não aparecer, olhe o spam e a aba Promoções.</p>
      <p className="lead">Não chegou? Escreva para <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> com o e-mail da compra.</p>
      <p><Link className="btn btn-secundario" href="/">Voltar para o site</Link></p>
    </div>
  );
}
