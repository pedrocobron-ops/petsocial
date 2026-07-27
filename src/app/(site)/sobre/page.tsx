import type { Metadata } from "next";
import Image from "next/image";
import { mozart } from "@/lib/mozart";

export const metadata: Metadata = {
  title: "Sobre o Maestro Pet",
  description:
    "Conheça o Maestro Pet, o jornal do universo pet, e o Mozart, nosso border collie editor-chefe.",
  alternates: { canonical: "/sobre" },
};

export default function SobrePage() {
  return (
    <div className="prose">
      <h1>Sobre o Maestro Pet</h1>
      <p>
        O <strong>Maestro Pet</strong> é um jornal digital dedicado ao universo
        pet. Publicamos notícias, guias práticos e curiosidades sobre cães,
        gatos e a vida ao lado deles — sempre com linguagem clara, carinho e
        responsabilidade.
      </p>
      <p>
        Nossas editorias cobrem <strong>Saúde &amp; Bem-estar</strong>,{" "}
        <strong>Comportamento</strong>, <strong>Nutrição</strong>,{" "}
        <strong>Adoção &amp; Causas</strong>, <strong>Produtos &amp; Reviews</strong>{" "}
        e <strong>Curiosidades</strong> — os temas que fazem diferença real no
        dia a dia de quem tem um melhor amigo de quatro patas.
      </p>

      <h2>Quem é o Mozart? 🐾</h2>
      <div style={{ float: "right", margin: "0 0 12px 18px" }}>
        <Image
          src={mozart("maestro")}
          alt="Mozart, o border collie mascote do Maestro Pet, vestido de maestro"
          width={150}
          height={150}
          style={{ borderRadius: "50%", border: "3px solid #FED7AA", objectFit: "cover" }}
          unoptimized
        />
      </div>
      <p>
        O Mozart é o nosso mascote e editor-chefe: um border collie curioso,
        esperto e incansável — como todo bom repórter deve ser. É ele quem
        &ldquo;fareja&rdquo; as pautas e garante que cada matéria chegue até você com o
        selo de qualidade Maestro Pet.
      </p>

      <h2>Quem assina</h2>
      <p>
        As matérias do Maestro Pet são assinadas por{" "}
        <a href="/autor/pedro-amaral">Pedro Amaral</a>, editor-chefe do jornal,
        que revisa pessoalmente cada texto antes da publicação. As fontes
        consultadas são citadas ao longo das reportagens, e as imagens seguem
        nossa <a href="/creditos-de-imagem">política de créditos</a>.
      </p>

      <h2>Compromisso editorial</h2>
      <p>
        Nosso conteúdo tem caráter informativo e educativo. Ele{" "}
        <strong>não substitui a consulta com um médico-veterinário</strong>. Ao
        notar qualquer sinal de alerta na saúde do seu pet, procure sempre um
        profissional de confiança.
      </p>
      <p>
        Quer falar com a redação? Visite a página de{" "}
        <a href="/contato">contato</a>.
      </p>
    </div>
  );
}
