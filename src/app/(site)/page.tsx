import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CalendarCheck, Check, Mic, Store } from "lucide-react";
import { Seta } from "@/components/icones";
import { FaixaProva } from "@/components/pagamento";
import { Leque, Marquee } from "@/components/vitrine-blocos";
import type { Produto } from "@/lib/produtos";
import { PRODUTOS, linhaDe, produto, reais, urlProduto } from "@/lib/produtos";
import { PLANOS } from "@/lib/gestao/planos";

export const metadata: Metadata = { alternates: { canonical: "/" } };

/** Uma linha por guia em destaque. */
const LINHA: Record<string, string> = {
  xixi: "Método de 7 dias",
  filhote: "Os primeiros 30 dias",
  petiscos: "30 receitas seguras",
};

/** O que o sistema faz, em 4 linhas curtas. */
const GESTAO: string[] = [
  "Agenda de banho e tosa, por dia e por profissional",
  "Link para o cliente agendar sozinho, com a sua marca",
  "Clientes, pets, caixa e estoque num lugar só",
  "Assistente de inteligência artificial: você fala, ele prepara",
];

/** Os 4 pilares de "Como fazemos". */
const PILARES = [
  ["Pesquisa com fonte e data", "Leis, preços e dados vêm de órgãos oficiais e entidades do setor, citados no próprio material."],
  ["Reforço positivo, veterinário primeiro", "Nada de castigo. Quando pode ser saúde, o guia manda procurar o veterinário."],
  ["Sem depoimento inventado", "Preferimos mostrar as páginas de verdade a inventar elogios."],
  ["7 dias para desistir", "Se não valer a pena, o dinheiro volta pelo mesmo meio do pagamento."],
] as const;

export default function Home() {
  const lancados = PRODUTOS.filter((p) => p.lancado && linhaDe(p) === "tutor");
  const destaque = ["xixi", "filhote", "petiscos"].map(produto).filter((p): p is Produto => !!p?.lancado);
  const manuais = PRODUTOS.filter((p) => linhaDe(p) === "negocios" && p.grupo === "comece");
  const leque = ["filhote", "xixi", "petiscos"].map(produto).filter((p) => p?.capa);
  const capas = [...lancados, ...manuais].filter((p) => p.capa);
  const confeitaria = produto("confeitaria");
  const menorGuia = Math.min(...lancados.map((p) => p.preco));
  const menorPlano = Math.min(...PLANOS.map((p) => p.preco));
  return (
    <>
      <section className="h2-hero">
        <div className="container">
          <div className="h2-hero-topo">
            <div>
              <span className="rotulo">Maestro Pet</span>
              <h1>Tudo para quem <em>cuida</em> de pets.</h1>
              <p className="lead">Guias para quem tem cão ou gato, manuais para quem trabalha com pets e um sistema para o seu pet shop.</p>
            </div>
            <Image className="h2-mozart" src="/mozart/acenando.webp" alt="" width={300} height={300} priority />
          </div>

          <nav className="h2-portas" aria-label="Escolha o seu caminho">
            <Link className="h2-porta" href="/tutor" id="cta-home">
              <span className="h2-porta-tag">Para tutores</span>
              <b>Tenho um pet</b>
              <small>Guias passo a passo, a partir de {reais(menorGuia)}</small>
              <Seta />
            </Link>
            <Link className="h2-porta" href="/negocios">
              <span className="h2-porta-tag">Para negócios pet</span>
              <b>Trabalho com pets</b>
              <small>Manuais de confeitaria, passeio, pet sitter e fotografia</small>
              <Seta />
            </Link>
            <Link className="h2-porta h2-porta-gestao" href="/gestao">
              <span className="h2-porta-tag"><span className="h2-novo">Novo</span>Sistema</span>
              <b>Tenho pet shop</b>
              <small>Agenda, clientes e caixa. 7 dias grátis</small>
              <Seta />
            </Link>
          </nav>
        </div>
      </section>

      <section className="h2-gestao" aria-labelledby="gestao-titulo">
        <div className="container h2-gestao-grade">
          <div className="h2-gestao-texto">
            <span className="h2-selo"><Store size={16} aria-hidden />Maestro Pet Gestão</span>
            <h2 id="gestao-titulo">O sistema do seu <em>pet shop</em>, no celular.</h2>
            <p>Para banho e tosa, pet shop, creche e hotel. Feito para o dia a dia de quem atende no balcão.</p>
            <ul className="h2-lista">
              {GESTAO.map((t) => <li key={t}><Check size={18} aria-hidden />{t}</li>)}
            </ul>
            <div className="h2-gestao-ctas">
              <Link className="btn" href="/gestao/criar-conta">Testar grátis por 7 dias<Seta /></Link>
              <Link className="btn h2-btn-claro" href="/gestao">Conhecer o sistema</Link>
            </div>
            <p className="h2-gestao-nota">Sem cartão para testar. Planos a partir de R$ {menorPlano} por mês, sem fidelidade.</p>
          </div>
          <div className="h2-gestao-telas" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="h2-tela-pc" src="/gestao/telas/pc-hoje.webp" alt="" width={1760} height={1093} loading="eager" decoding="async" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="h2-tela-cel" src="/gestao/telas/cel-agenda.webp" alt="" width={780} height={1328} loading="eager" decoding="async" />
            <span className="h2-bolha h2-bolha-1"><Mic size={16} />“Marca banho da Mel sexta às dez”</span>
            <span className="h2-bolha h2-bolha-2"><CalendarCheck size={16} />Agendado pelo link</span>
          </div>
        </div>
      </section>

      {destaque.length > 0 && (
        <section className="secao h2-guias" aria-labelledby="guias-titulo">
          <div className="container">
            <div className="h2-cab">
              <div>
                <span className="rotulo">Para tutores</span>
                <h2 id="guias-titulo">Os guias mais <em>procurados.</em></h2>
              </div>
              <Link className="btn-link" href="/tutor">Ver todos os guias</Link>
            </div>
            <ul className="h2-cards">
              {destaque.map((p) => (
                <li key={p.slug}>
                  <Link className="h2-card" href={urlProduto(p)}>
                    <span className="h2-card-palco">{p.capa && <Image src={p.capa} alt="" width={300} height={424} sizes="160px" />}</span>
                    <span className="h2-card-txt">
                      <b>{p.nome}</b>
                      <small>{LINHA[p.slug] ?? p.chamada}</small>
                      <span className="h2-card-preco">{reais(p.preco)}<Seta /></span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="secao h2-duo" aria-label="Guias e manuais">
        <div className="container h2-duo-grade">
          <Link className="h2-bloco" href="/tutor">
            <Leque produtos={leque as Produto[]} />
            <span className="rotulo">Para tutores</span>
            <h3>Um problema por guia, <em>um passo por página.</em></h3>
            <p>Xixi no lugar certo, filhote, petiscos seguros e kits para imprimir.</p>
            <span className="btn-link">Ver os guias</span>
          </Link>
          <Link className="h2-bloco h2-bloco-negocios" href="/negocios">
            <span className="foto-porta">
              <Image src="/fotos/negocios-confeitaria-porta-16x10.webp" alt="" width={1600} height={1000} sizes="(max-width: 899px) 100vw, 580px" />
              {confeitaria?.capa && <Image className="foto-porta-capa" src={confeitaria.capa} alt="" width={300} height={424} sizes="140px" />}
            </span>
            <span className="rotulo">Para negócios pet</span>
            <h3>Viver de pets é um <em>ofício.</em></h3>
            <p>Confeitaria pet, passeador, pet sitter e fotografia: a lei, o preço e as ferramentas.</p>
            <span className="btn-link">Ver os manuais</span>
          </Link>
        </div>
      </section>

      <Marquee capas={capas} rotulo="Guias e manuais" />

      <section className="secao secao-prova">
        <div className="container"><FaixaProva /></div>
      </section>

      <section className="secao bloco-suave" aria-labelledby="como-fazemos">
        <div className="container">
          <div className="h2-cab">
            <div>
              <span className="rotulo">Como fazemos</span>
              <h2 id="como-fazemos">Só o que dá <em>para provar.</em></h2>
            </div>
            <Link className="btn-link" href="/sobre">Quem faz o Maestro Pet</Link>
          </div>
          <ol className="h2-pilares">
            {PILARES.map(([t, d], i) => (
              <li key={t}><span>{String(i + 1).padStart(2, "0")}</span><b>{t}</b><p>{d}</p></li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
