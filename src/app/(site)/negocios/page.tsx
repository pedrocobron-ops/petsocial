import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Seta } from "@/components/icones";
import { FaixaProva } from "@/components/pagamento";
import { Rico, pares } from "@/components/pagina-vendas";
import { CartaoProduto } from "@/components/vitrine";
import { FaqVitrine } from "@/components/vitrine-blocos";
import { FaixaMercado } from "@/components/mercado";
import { fixa } from "@/lib/faq";
import { FEED_AREAS } from "@/lib/feed-pronto";
import { PRODUTOS, linhaDe } from "@/lib/produtos";
import { PAGINAS } from "@/lib/vendas";

export const metadata: Metadata = {
  title: "Para negócios pet: manuais para empreender no mercado pet",
  description: "Manuais para começar e crescer num negócio pet: a lei do seu ramo, quanto cobrar e as ferramentas, com fonte e data. Sem promessa de renda.",
  alternates: { canonical: "/negocios" },
};

/** Como fazemos (padrão numerado 01–04 da home). */
const PILARES = [
  ["Pesquisa com fonte e data", "Cada número, regra e preço vem de fonte oficial ou de mercado, com data. A lista de fontes está no fim de cada manual."],
  ["As regras certas, com o texto da norma", "O que a lei pede para o seu ramo, com o link de cada norma, e o que confirmar com o contador."],
  ["Ferramentas para usar", "Planilha de preço, contrato, fichas e checklists prontos. Não é só leitura."],
  ["Sem promessa de renda", "Contas de exemplo marcadas como exemplo. O resultado depende da sua cidade, do seu tempo e do seu trabalho."],
] as const;

const FAQ: [string, string][] = [
  ["Servem para quem está começando do zero?", "Sim. Todos começam pelo básico (o mercado, o perfil, o investimento em 3 níveis) e vão até o plano de carreira, para quem já atende e quer crescer."],
  ["Preciso de CNPJ para começar?", "Não necessariamente. Cada manual explica quando e como formalizar no seu ramo (MEI, nota fiscal) e o que depende de um contador."],
  ["O manual substitui o contador ou o responsável técnico?", "Não. Ele mostra o que a norma pede e o que perguntar. Enquadramento, impostos e a aprovação técnica são com o profissional."],
  ["Os manuais garantem que vou ganhar dinheiro?", "Não. Nenhum material sério pode garantir renda. Entregamos o caminho, as ferramentas e as regras; o resultado depende de você e da sua região."],
  ["Como recebo?", "O acesso chega no e-mail da compra logo após o pagamento: o manual em PDF, a planilha e os materiais para imprimir e editar."],
  fixa("Como peço o reembolso"),
];

export default function Negocios() {
  const manuais = PRODUTOS.filter((p) => linhaDe(p) === "negocios" && p.grupo === "comece").sort((a, b) => Number(b.lancado) - Number(a.lancado));
  const aVenda = manuais.filter((p) => p.lancado).length;
  // Feed Pronto só aparece quando houver área lançada (7.3 e 7.9); até lá, nem botão nem bloco.
  const feedLancado = FEED_AREAS.some((a) => a.lancado);
  const confeitaria = pares(PAGINAS.confeitaria.virada.paragrafos) ?? [];
  const passeador = pares(PAGINAS.passeador.virada.paragrafos) ?? [];
  const ilusao: [string, string, string][] = [
    ...confeitaria.slice(0, 2).map(([i, r]) => [i, r, "Confeitaria Pet"] as [string, string, string]),
    ...passeador.slice(0, 1).map(([i, r]) => [i, r, "Passeador de Cães"] as [string, string, string]),
  ];
  return (
    <div className="negocios">
      {/* 1 · Hero (7.3): rótulo, h1 com itálico, lead de 3 linhas, um botão; foto 4:5 de borda a borda */}
      <section className="hero-neg">
        <div className="hero-neg-texto hero-texto">
          <span className="rotulo">Para negócios pet{aVenda > 0 ? ` · ${aVenda} ${aVenda === 1 ? "manual" : "manuais"} à venda` : ""}</span>
          <h1>Viver de pets é um <em>ofício.</em> Aprenda as regras dele.</h1>
          <p className="lead">Manuais para começar e crescer num negócio pet: a lei do seu ramo, quanto cobrar e as ferramentas. Sem promessa de renda.</p>
          <div className="botoes"><a className="btn btn-largo" id="cta-home" href="#manuais">Ver os manuais<Seta /></a></div>
          <p className="risco risco-linha"><span>Fonte e data em tudo</span><span>Pagamento único</span><span>7 dias para desistir</span></p>
          {feedLancado && <Link className="btn-link" href="/negocios/feed-pronto">Posts prontos para o seu Instagram</Link>}
        </div>
        <figure className="hero-neg-foto">
          <Image src="/fotos/negocios-confeitaria-hero-4x5.webp" alt="Confeitaria pet: porta da loja com a vitrine de bolos e biscoitos para cães" width={1040} height={1300} priority sizes="(max-width: 899px) 100vw, 50vw" />
        </figure>
      </section>

      {/* 2 · O mercado pet no Brasil: 4 números com fonte e o convite */}
      <FaixaMercado hub>
        <div className="mercado-convite rv">
          <p><b>Quem atende bem tem espaço.</b> O mercado cresce, e o cliente procura quem cuida direito do pet dele. Comece com as regras certas e um preço que fecha a conta.</p>
          <a className="btn btn-claro" href="#manuais">Escolher o meu ofício<Seta /></a>
        </div>
      </FaixaMercado>

      {/* 3 · Os manuais */}
      <section className="secao vitrine-sec" id="manuais" aria-labelledby="manuais-titulo">
        <div className="container">
          <div className="cab cab-lado rv">
            <div>
              <span className="rotulo">Manuais{aVenda === 0 ? " · lançamento em breve" : ""}</span>
              <h2 id="manuais-titulo">Quatro ofícios, <em>um método.</em></h2>
            </div>
            <p>Lei, preço, ferramentas e plano de carreira em 4 níveis, com fonte e data em tudo.</p>
          </div>
          <div className="cards">{manuais.map((p) => <CartaoProduto key={p.slug} p={p} />)}</div>
        </div>
      </section>

      {/* 4 · Ilusão × real */}
      {ilusao.length > 0 && (
        <section className="secao bloco-suave" aria-labelledby="ilusao-titulo">
          <div className="container">
            <div className="cab rv">
              <span className="rotulo">O que é real e o que é ilusão</span>
              <h2 id="ilusao-titulo">Antes de investir, <em>compare as duas colunas.</em></h2>
            </div>
            <ul className="ilusao ilusao-claro">
              {ilusao.map(([i, r, manual]) => (
                <li key={i} className="rv">
                  <div><span className="rotulo">Ilusão</span><p><Rico texto={i} /></p></div>
                  <div><span className="rotulo">Real</span><p><Rico texto={r} /></p><small>Do manual {manual}</small></div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* 5 · Feed Pronto: só com área lançada */}
      {feedLancado && (
        <section className="secao" aria-labelledby="feed-titulo">
          <div className="container cab">
            <span className="rotulo">Divulgue o seu negócio</span>
            <h2 id="feed-titulo">Posts prontos para o <em>seu Instagram.</em></h2>
            <p>Posts editáveis no Canva grátis, com legenda pronta. Você troca a logo e posta.</p>
            <Link className="btn btn-secundario" href="/negocios/feed-pronto">Escolher a minha área</Link>
          </div>
        </section>
      )}

      {/* 6 · Como fazemos: 4 pilares numerados + uma página real em moldura */}
      <section className="secao" id="como-fazemos" aria-labelledby="como-titulo">
        <div className="container como-grid2">
          <div>
            <div className="cab rv">
              <span className="rotulo">Como fazemos</span>
              <h2 id="como-titulo">Só o que dá <em>para provar.</em></h2>
            </div>
            <ol className="pilares-n pilares-2x2">
              {PILARES.map(([t, d], i) => (
                <li key={t} className="rv"><span aria-hidden>{String(i + 1).padStart(2, "0")}</span><b>{t}</b><p>{d}</p></li>
              ))}
            </ol>
          </div>
          <figure className="moldura moldura-sumario rv">
            <Image src="/produtos/negocios/confeitaria-pag4.webp" alt="Sumário do manual Confeitaria Pet" width={744} height={1053} sizes="(max-width: 899px) 86vw, 420px" />
            <figcaption>Página do manual Confeitaria Pet: o sumário.</figcaption>
          </figure>
        </div>
      </section>

      {aVenda > 0 && (
        <section className="secao secao-prova">
          <div className="container"><FaixaProva negocios className="rv" /></div>
        </section>
      )}

      {/* 7 · FAQ */}
      <FaqVitrine faq={FAQ} />
    </div>
  );
}
