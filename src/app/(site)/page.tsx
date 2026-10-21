import Image from "next/image";
import Link from "next/link";
import { PRODUTOS, reais } from "@/lib/produtos";

export default function Home() {
  return (
    <>
      <section className="hero-home">
        <div className="container hero-home-grid">
          <div>
            <span className="eyebrow">Guias práticos para tutores</span>
            <h1>Problemas do dia a dia com seu pet, <em>resolvidos com método</em>.</h1>
            <p className="lead">
              Guias curtos, ilustrados e direto ao ponto — com passo a passo, checklists e material para imprimir.
              Feitos para você aplicar hoje, com reforço positivo e sem castigo.
            </p>
            <div className="hero-ctas">
              <Link className="btn btn-lg" href="/xixi">Conheça o Xixi no Lugar Certo</Link>
              <a className="btn btn-ghost btn-lg" href="#guias">Ver todos os guias</a>
            </div>
            <ul className="selos">
              <li>Acesso imediato</li>
              <li>Garantia de 7 dias</li>
              <li>Pagamento seguro</li>
            </ul>
          </div>
          <div className="hero-art">
            <Image src="/mozart/acenando.webp" alt="Mozart, o border collie do Maestro Pet, acenando" width={560} height={560} priority />
          </div>
        </div>
      </section>

      <section className="secao" id="guias">
        <div className="container">
          <span className="eyebrow">Nossos guias</span>
          <h2>Escolha o problema que você quer resolver</h2>
          <div className="guias">
            {PRODUTOS.map((p) => {
              const card = (
                <>
                  <div className="guia-capa">
                    {p.capa ? <Image src={p.capa} alt={`Capa do guia ${p.nome}`} width={300} height={424} /> : <span className="guia-breve">Em breve</span>}
                  </div>
                  <div className="guia-corpo">
                    <span className="guia-dor">“{p.dor}”</span>
                    <h3>{p.nome}</h3>
                    <p>{p.chamada}</p>
                    {p.lancado ? <span className="guia-preco"><s>{reais(p.precoDe)}</s> {reais(p.preco)}</span> : <span className="guia-preco muted">Lançamento em breve</span>}
                  </div>
                </>
              );
              return p.lancado ? (
                <Link key={p.slug} href={`/${p.slug}`} className="guia">{card}</Link>
              ) : (
                <div key={p.slug} className="guia guia-off">{card}</div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container como">
          <div>
            <span className="eyebrow">Como funciona</span>
            <h2>Do problema à solução em três passos</h2>
          </div>
          <ol className="passos">
            <li><b>Escolha o guia</b> do problema que mais incomoda hoje.</li>
            <li><b>Pague com Pix ou cartão</b> e receba o acesso na hora, no seu e-mail.</li>
            <li><b>Siga o passo a passo</b> e use os materiais para imprimir. Não gostou? Em até 7 dias você recebe 100% do valor de volta.</li>
          </ol>
        </div>
      </section>
    </>
  );
}
