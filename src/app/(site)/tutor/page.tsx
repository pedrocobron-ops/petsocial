import type { Metadata } from "next";
import Image from "next/image";
import { Seta } from "@/components/icones";
import { FaixaProva } from "@/components/pagamento";
import { CartaoProduto } from "@/components/vitrine";
import { EmPreparo, FaqVitrine, Leque, Marquee } from "@/components/vitrine-blocos";
import { fixa } from "@/lib/faq";
import { GRUPOS, PRODUTOS, linhaDe } from "@/lib/produtos";

export const metadata: Metadata = {
  title: "Para tutores: guias para cães e gatos",
  description: "Guias práticos para os problemas do dia a dia com cães e gatos, com reforço positivo, passo a passo ilustrado e 7 dias para desistir.",
  alternates: { canonical: "/tutor" },
};

/** Dica do Mozart (brief 20, 7.2, bloco 5): três coisas que já mudam hoje, com a ilustração do guia em moldura. */
const DICAS = [
  ["Recompense em até 3 segundos", "O cachorro liga a recompensa ao que fazia naquele exato momento. Elogio e petisco vêm logo depois do acerto: um minuto depois, ele já não sabe pelo que ganhou."],
  ["Fareja em círculos? Hora do banheiro", "Farejar o chão andando em círculo, parar de brincar de repente e ir para um canto são os sinais clássicos. Leve-o ao lugar certo na hora."],
  ["Morde tudo? Ofereça o que pode", "Morder faz parte da fase de dentes. Em vez de só tirar o chinelo da boca, troque por um brinquedo de mastigar e elogie quando ele morder o objeto certo."],
] as const;

const FAQ: [string, string][] = [
  ["Como recebo o guia?", "O acesso chega no e-mail da compra logo após o pagamento. É um PDF ilustrado para ler no celular, no computador ou imprimir."],
  fixa("Pix ou cartão"),
  fixa("Como peço o reembolso"),
  fixa("Preciso imprimir"),
];

export default function Tutor() {
  const tutor = PRODUTOS.filter((p) => linhaDe(p) === "tutor");
  const lancados = tutor.filter((p) => p.lancado);
  const emPreparo = tutor.filter((p) => !p.lancado);
  // Subtítulos por grupo só quando há guias suficientes para eles não ficarem com um card só.
  const grupos = GRUPOS.tutor.map(([id, titulo]) => [titulo, lancados.filter((p) => p.grupo === id)] as const).filter(([, l]) => l.length > 0);
  const comSubtitulos = lancados.length > 4 && grupos.length > 1;
  return (
    <>
      {/* 1 · Hero (7.2): rótulo, h1 com itálico, lead de 2 linhas, um botão, linha de risco curta; leque das capas lançadas */}
      <section className="hero hero-vitrine">
        <div className="container hero-grade hero-grade-leque">
          <div className="hero-texto">
            <span className="rotulo">Para tutores · {lancados.length} {lancados.length === 1 ? "guia" : "guias"} à venda</span>
            <h1>Seu pet feliz, <em>sua casa em paz.</em></h1>
            <p className="lead">Guias para o dia a dia com o seu pet, um problema de cada vez.</p>
            <div className="botoes"><a className="btn btn-largo" id="cta-home" href="#guias">Ver os guias<Seta /></a></div>
            <p className="risco risco-linha"><span>Pagamento único</span><span>Pix ou cartão</span><span>7 dias para desistir</span></p>
          </div>
          <Leque produtos={lancados} className="leque-hero" prioridade />
        </div>
      </section>

      {/* 2 · Faixa de prova */}
      <section className="secao secao-prova">
        <div className="container"><FaixaProva className="rv" /></div>
      </section>

      {/* 3 · Guias à venda: só os lançados */}
      <section className="secao vitrine-sec" id="guias" aria-labelledby="guias-titulo">
        <div className="container">
          {comSubtitulos ? (
            <>
              <div className="cab rv">
                <span className="rotulo">Guias ilustrados</span>
                <h2 id="guias-titulo">Um problema por guia, <em>um passo por página.</em></h2>
              </div>
              {grupos.map(([titulo, lista]) => (
                <div key={titulo} className="vitrine-grupo">
                  <h3 className="vitrine-subtitulo">{titulo}</h3>
                  <div className={`cards${lista.length % 2 ? " cards-impar" : ""}`}>{lista.map((p) => <CartaoProduto key={p.slug} p={p} />)}</div>
                </div>
              ))}
            </>
          ) : (
            <div className={`cards cards-com-cab${lancados.length % 2 ? " cards-impar" : ""}`}>
              <div className="cab cab-card rv">
                <span className="rotulo">Guias ilustrados</span>
                <h2 id="guias-titulo">Um problema por guia, <em>um passo por página.</em></h2>
                <p>Cada guia resolve uma coisa, com reforço positivo e passo a passo ilustrado.</p>
              </div>
              {lancados.map((p) => <CartaoProduto key={p.slug} p={p} />)}
            </div>
          )}
        </div>
      </section>

      {/* 4 · Em preparo (6.11) */}
      <EmPreparo produtos={emPreparo} linha="tutores" />

      {/* 5 · Dica do Mozart */}
      <section className="secao dica-sec" aria-labelledby="dica-titulo">
        <div className="container dica-grid">
          <figure className="moldura-dica rv">
            <span className="moldura-dica-img"><Image src="/produtos/dica-petisco.webp" alt="Mozart recebendo um petisco da tutora logo depois do acerto" width={645} height={800} sizes="(max-width: 899px) 90vw, 480px" /></span>
            <figcaption>Ilustração do guia</figcaption>
          </figure>
          <div>
            <div className="cab rv">
              <span className="rotulo rotulo-mozart"><Image src="/mozart/sorrindo-112.webp" alt="" width={48} height={48} />Dica do Mozart</span>
              <h2 id="dica-titulo">Três coisas que já mudam <em>hoje.</em></h2>
            </div>
            <ol className="pilares-n pilares-lista">
              {DICAS.map(([t, d], i) => (
                <li key={t} className="rv"><span aria-hidden>{String(i + 1).padStart(2, "0")}</span><b>{t}</b><p>{d}</p></li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* 6 · Marquee: só com 6 ou mais capas à venda. Com 3, o loop repete a mesma capa no quadro ou abre buracos,
          e a grade logo acima já mostra as mesmas capas. */}
      {lancados.length >= 6 && <Marquee capas={lancados} />}

      {/* 7 · FAQ */}
      <FaqVitrine faq={FAQ} />
    </>
  );
}
