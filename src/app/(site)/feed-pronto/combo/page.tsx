import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Comprar from "@/components/comprar";
import { COMBO, FEED_AREAS, imgFeed, nomeFeed } from "@/lib/feed-pronto";
import type { Produto } from "@/lib/produtos";
import { reais } from "@/lib/produtos";

export const metadata: Metadata = {
  title: `${COMBO.nome}: as 10 áreas do Feed Pronto num pacote só`,
  description: "600 posts, 600 stories, 300 avisos, capas de destaques, bios, 300 roteiros de Reels e calendários para negócios pet. Editável no Canva grátis.",
  // Fora do Google até o lançamento.
  ...(!COMBO.lancado ? { robots: { index: false, follow: false } } : {}),
  alternates: { canonical: "/feed-pronto/combo" },
};

const produto: Produto = {
  slug: COMBO.slug, nome: COMBO.nome, chamada: COMBO.chamada, dor: "", preco: COMBO.preco ?? 0, checkout: COMBO.checkout, lancado: COMBO.lancado,
};

export default function Page() {
  const faq: [string, string][] = [
    ["Preciso pagar o Canva?", "Não. Tudo funciona na conta grátis do Canva, no computador ou no celular."],
    ["Como recebo?", "Assim que o pagamento é confirmado, chega no seu e-mail um arquivo com os links de todas as áreas e complementos."],
    ["É conteúdo genérico?", "Não. Cada área tem textos escritos para aquele tipo de negócio: a clínica fala de vacinas e consultas, o adestrador de comportamento, o pet shop de banho e tosa."],
    ["Atendo só uma área. Vale a pena?", "Se você só precisa de uma área, a página dela tem o pacote avulso. O combo é para quem atende mais de um público (pet shop com hotel, clínica com banho e tosa) ou administra mais de um perfil."],
    ["Posso revender?", "Não. Você pode usar nos perfis dos negócios que administra, mas não pode revender nem repassar o material."],
    ["E se eu não gostar?", "Você tem 7 dias de garantia. Peça o reembolso e recebe 100% do valor de volta."],
  ];
  return (
    <>
      <section className="lp-hero">
        <div className="container lp-hero-grid">
          <div>
            <span className="eyebrow">Feed Pronto · Maestro Pet</span>
            <h1>{COMBO.nome}: <em>todo o Instagram</em> do seu negócio pet, pronto</h1>
            <p className="lead">{COMBO.chamada} Mais de 2.500 artes editáveis no Canva, escritas para cada tipo de negócio, com legendas e roteiros.</p>
            <ul className="selos"><li>Editável no Canva grátis</li><li>10 áreas</li><li>Acesso imediato</li></ul>
            <div className="hero-cta"><a className="btn btn-lg" href="#oferta">Ver o que vem no combo</a></div>
          </div>
          <div className="feed-capa"><Image src="/feed-pronto/combo/capa.webp" alt={`Capa do ${COMBO.nome}`} width={400} height={500} priority /></div>
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <span className="eyebrow">O que vem no combo</span>
          <h2>Conteúdo para todas as áreas, de uma vez</h2>
          <div className="recebe feed-recebe">
            <ol>
              {COMBO.itens.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
            </ol>
          </div>
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container">
          <span className="eyebrow">As 10 áreas</span>
          <h2>Cada área com textos próprios</h2>
          <div className="feed-areas">
            {FEED_AREAS.map((a) => (
              <Link key={a.slug} href={`/feed-pronto/${a.slug}`} className="feed-area">
                <Image src={imgFeed(a, "capa.webp")} alt={`Capa do ${nomeFeed(a)}`} width={300} height={375} />
                <div><h3>{nomeFeed(a)}</h3><p>{a.chamada}</p></div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="secao oferta-sec" id="oferta">
        <div className="container oferta">
          <div className="oferta-mockup feed-capa"><Image src="/feed-pronto/combo/capa.webp" alt="" width={360} height={450} /></div>
          <div className="oferta-box">
            <span className="eyebrow">Feed Pronto · Maestro Pet</span>
            <h2>{COMBO.nome}</h2>
            <ul className="oferta-itens">
              {COMBO.itens.map(([t]) => <li key={t}>{t}</li>)}
            </ul>
            {COMBO.preco ? (
              <div className="preco">
                {COMBO.precoSeparado ? <small>Separado: {reais(COMBO.precoSeparado)}</small> : null}
                <strong>{reais(COMBO.preco)}</strong><small>pagamento único · Pix ou cartão</small>
              </div>
            ) : null}
            <Comprar produto={produto} texto="Quero o Combo Pet Completo" grande />
            <p className="seguro">Pagamento seguro processado pela Cakto · acesso enviado por e-mail · garantia de 7 dias</p>
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container faq">
          <span className="eyebrow">Dúvidas</span>
          <h2>Perguntas frequentes</h2>
          {faq.map(([q, r]) => <details key={q}><summary>{q}</summary><p>{r}</p></details>)}
        </div>
      </section>
    </>
  );
}
