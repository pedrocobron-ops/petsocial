import Image from "next/image";
import Link from "next/link";
import { Seta } from "@/components/icones";
import { FaixaProva } from "@/components/pagamento";
import { CartaoProduto } from "@/components/vitrine";
import { PRODUTOS, linhaDe, produto, reais, urlProduto } from "@/lib/produtos";

/** Uma linha por guia lançado no índice "Nesta edição" (brief 20, 7.1, bloco 1b). */
const LINHA: Record<string, string> = {
  xixi: "Método de 7 dias",
  filhote: "Os primeiros 30 dias",
  petiscos: "30 receitas seguras",
};

/** Os 4 pilares de "Como fazemos" (6.21, sem retrato: sem moldura vazia). */
const PILARES = [
  ["Pesquisa com fonte e data", "Leis, preços e dados vêm de órgãos oficiais e entidades do setor, citados no próprio material."],
  ["Reforço positivo, veterinário primeiro", "Nada de castigo. Quando pode ser saúde, o guia manda procurar o veterinário."],
  ["Sem depoimento inventado", "Preferimos mostrar as páginas de verdade a inventar elogios."],
  ["7 dias para desistir", "Se não valer a pena, o dinheiro volta pelo mesmo meio do pagamento."],
] as const;

export default function Home() {
  const lancados = PRODUTOS.filter((p) => p.lancado && linhaDe(p) === "tutor");
  const edicao = ["xixi", "filhote", "petiscos"].map(produto).filter((p) => p?.lancado);
  const manuais = PRODUTOS.filter((p) => linhaDe(p) === "negocios" && p.grupo === "comece");
  const leque = ["filhote", "xixi", "petiscos"].map(produto).filter((p) => p?.capa);
  const capas = [...lancados, ...manuais].filter((p) => p.capa);
  const confeitaria = produto("confeitaria");
  return (
    <>
      <section className="hero">
        <div className="container hero-grade">
          <div className="hero-texto">
            <span className="rotulo">Guias e manuais para o mundo pet</span>
            <h1>Cuidar bem é uma <em>arte</em> que se aprende.</h1>
            <p className="lead">Guias passo a passo para quem tem cão ou gato, e manuais para quem trabalha com eles.</p>
            <div className="botoes">
              <Link className="btn" id="cta-home" href="/tutor">Tenho um pet<Seta /></Link>
              <Link className="btn btn-secundario" href="/negocios">Trabalho com pets</Link>
            </div>
            <p className="risco">Pagamento único · Pix ou cartão · 7 dias para desistir</p>
          </div>
          {edicao.length > 0 && (
            <aside className="edicao" aria-labelledby="edicao-titulo">
              <span className="rotulo" id="edicao-titulo">Nesta edição</span>
              <ul>
                {edicao.map((p) => (
                  <li key={p.slug}>
                    <Link href={urlProduto(p)}>
                      {p.capa && <Image src={p.capa} alt="" width={56} height={79} />}
                      <span className="edicao-nome"><b>{p.nome}</b><small>{LINHA[p.slug] ?? p.chamada}</small></span>
                      <span className="edicao-preco">{reais(p.preco)}</span>
                      <Seta />
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </section>

      <section className="secao-portas" aria-label="Escolha o seu caminho">
        <div className="container portas">
          <article className="porta rv">
            <span className="porta-num">01 · Para tutores</span>
            <div className="leque" aria-hidden>
              {leque.map((p) => <Image key={p.slug} src={p.capa!} alt="" width={300} height={424} sizes="(max-width: 899px) 30vw, 180px" />)}
            </div>
            <h2>Um problema por guia, <em>um passo por página.</em></h2>
            <p>Xixi no lugar certo, filhote, petiscos seguros e kits para imprimir. A partir de {reais(Math.min(...lancados.map((p) => p.preco)))}.</p>
            <Link className="btn-link" href="/tutor">Ver os guias</Link>
          </article>
          <article className="porta rv">
            <span className="porta-num">02 · Para negócios pet</span>
            <div className="foto-porta">
              <Image src="/fotos/negocios-confeitaria-porta-16x10.webp" alt="Fachada de uma confeitaria pet com vitrine de bolos para cães" width={1600} height={1000} sizes="(max-width: 899px) 100vw, 580px" />
              {confeitaria?.capa && <Image className="foto-porta-capa" src={confeitaria.capa} alt="" width={300} height={424} sizes="140px" />}
            </div>
            <h2>Viver de pets é um <em>ofício.</em></h2>
            <p>Manuais de confeitaria pet, passeador, pet sitter e fotografia: a lei, o preço e as ferramentas.</p>
            <Link className="btn-link" href="/negocios">Ver os manuais</Link>
          </article>
        </div>
      </section>

      <section className="marquee" aria-label="Guias e manuais">
        <div className="marquee-trilho">
          <ul aria-label="Guias à venda">
            {capas.map((p) => <li key={p.slug}><Link href={urlProduto(p)} tabIndex={-1}><Image src={p.capa!} alt={p.nome} width={140} height={198} sizes="140px" /></Link></li>)}
          </ul>
          <ul aria-hidden>
            {capas.map((p) => <li key={p.slug}><Image src={p.capa!} alt="" width={140} height={198} sizes="140px" /></li>)}
          </ul>
        </div>
      </section>

      <section className="secao so-celular" aria-labelledby="venda-hoje">
        <div className="container">
          <div className="cab">
            <span className="rotulo">Nesta edição</span>
            <h2 id="venda-hoje">Os guias que resolvem <em>a semana.</em></h2>
          </div>
          <div className="cards">{lancados.map((p) => <CartaoProduto key={p.slug} p={p} />)}</div>
        </div>
      </section>

      <section className="secao secao-prova">
        <div className="container"><FaixaProva className="rv" /></div>
      </section>

      <section className="secao bloco-suave" aria-labelledby="como-fazemos">
        <div className="container">
          <div className="cab">
            <span className="rotulo">Como fazemos</span>
            <h2 id="como-fazemos">Só o que dá <em>para provar.</em></h2>
          </div>
          <ol className="pilares-n">
            {PILARES.map(([t, d], i) => (
              <li key={t} className="rv"><span>{String(i + 1).padStart(2, "0")}</span><b>{t}</b><p>{d}</p></li>
            ))}
          </ol>
          <p className="pilares-link"><Link className="btn-link" href="/sobre">Quem faz o Maestro Pet</Link></p>
        </div>
      </section>
    </>
  );
}
