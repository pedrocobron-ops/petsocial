import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PRODUTOS, reais } from "@/lib/produtos";

export const metadata: Metadata = {
  title: "Seu Plano Anti-Fogos está pronto",
  robots: { index: false, follow: false },
  alternates: { canonical: "/fogos/baixar" },
};

export default function BaixarFogosPage() {
  const guias = PRODUTOS.filter((p) => p.lancado && p.checkout);
  return (
    <>
      <section className="lp-hero">
        <div className="container baixar">
          <div className="livro baixar-capa">
            <Image src="/produtos/fogos-capa.webp" alt="Capa do guia Plano Anti-Fogos" width={300} height={424} priority />
          </div>
          <div>
            <span className="eyebrow">Cadastro feito</span>
            <h1>Seu guia <em>está pronto!</em></h1>
            <p className="lead">Toque no botão para baixar o Plano Anti-Fogos. Dá para ler no celular, no computador ou imprimir as páginas de checklist.</p>
            <a className="btn btn-lg" href="/gratis/plano-anti-fogos.pdf" download="Plano-Anti-Fogos-Maestro-Pet.pdf">
              Baixar o Plano Anti-Fogos
            </a>
            <p className="muted baixar-dica">Dica: salve o arquivo no celular para ter o checklist à mão na noite dos fogos.</p>
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <span className="eyebrow">Gostou do Mozart?</span>
          <h2>Conheça os guias completos</h2>
          <div className="guias">
            {guias.map((p) => (
              <Link key={p.slug} className="guia" href={`/${p.slug}`}>
                <div className="guia-capa">{p.capa && <Image src={p.capa} alt="" width={120} height={170} />}</div>
                <div>
                  <span className="guia-dor">{p.dor}</span>
                  <h3>{p.nome}</h3>
                  <p>{p.chamada}</p>
                  <span className="guia-preco"><s>{reais(p.precoDe)}</s> {reais(p.preco)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
