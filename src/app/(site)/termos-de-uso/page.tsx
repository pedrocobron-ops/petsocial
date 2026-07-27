import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de Uso",
  description: "Termos de uso do Maestro Pet.",
  alternates: { canonical: "/termos-de-uso" },
};

export default function TermosPage() {
  return (
    <div className="prose">
      <h1>Termos de Uso</h1>

      <h2>1. Sobre o conteúdo</h2>
      <p>
        O conteúdo do <strong>Maestro Pet</strong> tem caráter exclusivamente
        informativo e educativo. As matérias <strong>não substituem</strong> a
        avaliação, o diagnóstico ou o tratamento realizados por um
        médico-veterinário. Em caso de emergência ou sinais de doença, procure
        imediatamente um profissional.
      </p>

      <h2>2. Propriedade intelectual</h2>
      <p>
        Textos, marca, logotipo e o personagem Mozart são de propriedade do
        Maestro Pet. É permitido compartilhar links para as matérias; a
        reprodução integral do conteúdo sem autorização prévia não é permitida.
      </p>

      <h2>3. Links externos</h2>
      <p>
        Podemos indicar links para sites de terceiros. Não nos
        responsabilizamos pelo conteúdo, políticas ou práticas desses sites.
      </p>

      <h2>4. Publicidade</h2>
      <p>
        O site pode exibir anúncios de terceiros (como Google AdSense) e
        conteúdo patrocinado devidamente identificado. Anunciantes são
        responsáveis pelas ofertas que veiculam.
      </p>

      <h2>5. Contato</h2>
      <p>
        Dúvidas sobre estes termos? Escreva para{" "}
        <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>.
      </p>
    </div>
  );
}
