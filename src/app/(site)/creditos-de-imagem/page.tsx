import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Créditos de imagem",
  description:
    "Como o Maestro Pet seleciona, licencia e credita as fotografias publicadas no jornal.",
  alternates: { canonical: "/creditos-de-imagem" },
};

export default function CreditosPage() {
  return (
    <div className="prose">
      <h1>Créditos de imagem</h1>
      <p>
        Todas as fotografias publicadas no <strong>Maestro Pet</strong> são
        obtidas em acervos de uso livre, com licenças que permitem uso
        comercial. Não utilizamos imagens de bancos pagos sem autorização nem
        fotografias encontradas em buscadores sem verificação de licença.
      </p>

      <h2>Licenças que utilizamos</h2>
      <ul>
        <li>
          <strong>Domínio público</strong> e{" "}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br" target="_blank" rel="noopener noreferrer nofollow">
            CC0
          </a>{" "}
          — obras liberadas para qualquer uso, sem exigências.
        </li>
        <li>
          <a href="https://creativecommons.org/licenses/by/4.0/deed.pt-br" target="_blank" rel="noopener noreferrer nofollow">
            CC BY
          </a>{" "}
          — uso livre mediante crédito ao autor.
        </li>
        <li>
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br" target="_blank" rel="noopener noreferrer nofollow">
            CC BY-SA
          </a>{" "}
          — uso livre mediante crédito ao autor, com cláusula de
          compartilhamento pela mesma licença para obras derivadas.
        </li>
      </ul>

      <h2>Como creditamos</h2>
      <p>
        Cada fotografia traz, na própria legenda, o nome do autor (quando
        informado pelo acervo), a origem e a licença correspondente, com link
        para o texto oficial da licença. As imagens são utilizadas em seu
        conteúdo original, sem alterações que caracterizem obra derivada,
        podendo haver apenas redimensionamento para adequação ao layout.
      </p>

      <h2>Encontrou um problema?</h2>
      <p>
        Se você é autor de alguma imagem publicada e identificou crédito
        incorreto ou uso indevido, escreva para{" "}
        <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>. Nosso
        compromisso é corrigir ou remover a imagem em até 48 horas úteis.
      </p>
    </div>
  );
}
