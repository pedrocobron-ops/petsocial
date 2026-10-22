import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Sobre",
  description: "Quem somos: o Maestro Pet cria guias práticos para tutores de cães e gatos.",
  alternates: { canonical: "/sobre" },
};

export default function SobrePage() {
  return (
    <div className="container prose">
      <Image src="/mozart/acenando.webp" alt="Mozart acenando" width={180} height={180} />
      <h1>Sobre o Maestro Pet</h1>
      <p>
        O Maestro Pet cria guias práticos para ajudar tutores a resolver os problemas do dia a dia com seus cães e
        gatos — xixi no lugar errado, filhote que chora à noite, ansiedade quando fica sozinho, alimentação e mais.
      </p>
      <p>
        Nossos guias são curtos, ilustrados e diretos ao ponto: em vez de teoria, você recebe um passo a passo para
        aplicar no mesmo dia. Todos os métodos usam <b>reforço positivo</b>, sem castigo, e indicam o veterinário
        sempre que um comportamento pode ter causa de saúde.
      </p>
      <h2>Quem é o Mozart?</h2>
      <p>
        O Mozart é o nosso mascote: um border collie curioso que apresenta cada guia e aparece com dicas ao longo do
        caminho. Ele é a lembrança de que, do ponto de vista do cachorro, quase todo “mau comportamento” é só falta
        de alguém explicar direito.
      </p>
      <h2>Fale com a gente</h2>
      <p>Dúvidas, sugestões ou suporte: <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>.</p>
    </div>
  );
}
