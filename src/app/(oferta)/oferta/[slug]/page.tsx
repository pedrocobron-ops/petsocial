import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Check } from "lucide-react";
import { OFERTAS, oferta } from "@/lib/ofertas";
import { produto } from "@/lib/produtos";

export const metadata: Metadata = { title: "Sua compra foi aprovada", robots: { index: false, follow: false } };
export const generateStaticParams = () => OFERTAS.map((o) => ({ slug: o.slug }));

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function OfertaPage({ params }: { params: Promise<{ slug: string }> }) {
  const o = oferta((await params).slug);
  if (!o) notFound();
  const p = produto(o.alvo);
  const kit = o.slug === "tedio";
  return (
    <div className="container pc">
      <p className="pc-ok"><CircleCheck size={20} aria-hidden /> Compra aprovada. O acesso ao {o.origem} chega no seu e-mail em poucos minutos.</p>
      <span className="rotulo">Antes de sair, uma oferta só para quem acabou de comprar</span>
      <h1>{o.titulo}</h1>
      <div className="pc-corpo">
        <Image src={p.capa ?? "/produtos/tedio-capa.webp"} alt={`Capa do ${p.nome}`} width={420} height={594} className="pc-capa" priority />
        <div>
          <p className="lead">{o.porque}</p>
          <ul className="pc-pontos">{o.pontos.map((t) => <li key={t}><Check size={18} aria-hidden /> {t}</li>)}</ul>
          <p className="pc-preco">
            <b>{brl(o.preco)}</b>
            <span>{kit ? "a mais, e você recebe o Kit Completo com os 5 guias" : `nesta página. No site, ${brl(o.precoNormal)}.`}</span>
          </p>
          {o.botaoCakto ? (
            <div className="pc-botao" dangerouslySetInnerHTML={{ __html: o.botaoCakto }} />
          ) : (
            <a className="btn pc-sim" href={o.checkout}>Sim, quero por {brl(o.preco)}</a>
          )}
          <p className="pc-nota">Pagamento único. Também tem 7 dias de garantia.</p>
          <Link className="pc-nao" href="/obrigado">Não, obrigado. Quero só o que já comprei.</Link>
        </div>
      </div>
    </div>
  );
}
