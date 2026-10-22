import type { Metadata } from "next";
import Image from "next/image";
import CadastroFogos from "@/components/cadastro-fogos";

export const metadata: Metadata = {
  title: "Plano Anti-Fogos — e-book grátis para o seu cão",
  description:
    "Guia gratuito com o plano de 6 semanas para preparar o seu cão para o Réveillon e qualquer noite de fogos ou trovões: cantinho seguro, treino do som baixinho e checklist da virada.",
  alternates: { canonical: "/fogos" },
  openGraph: { title: "Plano Anti-Fogos — e-book grátis", images: [{ url: "/produtos/fogos-capa.webp", width: 600, height: 849 }] },
};

const ITENS = [
  ["O termômetro do medo", "Descubra em que nível o seu cão está e por onde começar."],
  ["O cantinho seguro", "Onde montar, o que colocar e como fazer ele ir por vontade própria."],
  ["O treino do som baixinho", "O plano de 6 semanas para o barulho virar sinal de petisco e brincadeira."],
  ["O plano rápido de 2 semanas", "Para quando falta pouco para a festa."],
  ["O checklist do dia dos fogos", "Manhã, tarde e noite, para imprimir e colar na geladeira."],
  ["Se ele fugir", "O que fazer nas primeiras horas, com um aviso pronto para postar."],
];

export default function FogosPage() {
  return (
    <>
      <section className="lp-hero" id="topo-fogos">
        <div className="container lp-hero-grid fogos-hero">
          <div>
            <span className="eyebrow">E-book grátis · Plano Anti-Fogos</span>
            <h1>Seu cão treme com os fogos? <em>Comece a preparar agora.</em></h1>
            <p className="lead">
              O plano de 6 semanas para chegar no Réveillon com o seu cão mais tranquilo: cantinho seguro, treino com o som
              baixinho e o checklist da noite da virada. Serve também para trovões.
            </p>
            <CadastroFogos />
          </div>
          <div className="mockup">
            <div className="livro">
              <Image src="/produtos/fogos-capa.webp" alt="Capa do e-book Plano Anti-Fogos" width={420} height={594} priority />
            </div>
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <span className="eyebrow">O que tem no e-book</span>
          <h2>12 páginas ilustradas, com o passo a passo do Mozart</h2>
          <div className="recebe">
            <ol>{ITENS.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ol>
            <div className="paginas">
              <Image src="/produtos/fogos-pag7.webp" alt="Página com o plano de 6 semanas para imprimir" width={300} height={424} />
              <Image src="/produtos/fogos-pag9.webp" alt="Página com o checklist do dia dos fogos" width={300} height={424} />
            </div>
          </div>
        </div>
      </section>

      <section className="secao secao-escura">
        <div className="container virada">
          <Image className="virada-art" src="/produtos/fogos-cantinho.webp" alt="Mozart tranquilo no cantinho seguro, uma caixa coberta com manta" width={330} height={220} />
          <div>
            <span className="eyebrow">Por que começar agora</span>
            <h2>O treino leva semanas. A festa tem data marcada.</h2>
            <p>Na noite dos fogos não dá para ensinar nada: o objetivo é só proteger e acalmar. O que faz diferença é o que você faz nas semanas antes, com sessões de 5 minutos por dia.</p>
            <p>Para o Réveillon, o ideal é começar até a metade de novembro. Se faltar menos que isso, o e-book tem um plano rápido de 2 semanas.</p>
          </div>
        </div>
      </section>

      <section className="secao cta-final">
        <div className="container">
          <h2>Baixe grátis e comece hoje.</h2>
          <a className="btn btn-lg" href="#topo-fogos">Quero meu e-book grátis</a>
          <p className="aviso">
            Material educativo. Não substitui a avaliação de um(a) médico(a)-veterinário(a). Cães com medo intenso, que se
            machucam ou tentam fugir, devem ser avaliados por um profissional. Nunca dê remédio sem orientação veterinária.
          </p>
        </div>
      </section>
    </>
  );
}
