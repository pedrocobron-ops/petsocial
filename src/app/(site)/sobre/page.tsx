import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Quem somos",
  description: "A Maestro Pet faz guias práticos para tutores de cães e gatos e manuais para quem trabalha no mercado pet.",
  alternates: { canonical: "/sobre" },
};

export default function SobrePage() {
  return (
    <div className="container prose">
      <Image src="/mozart/acenando.webp" alt="Mozart acenando" width={180} height={180} />
      <h1>Quem somos</h1>
      <p>
        A Maestro Pet é uma empresa de conteúdo sobre o mundo pet. Fazemos materiais práticos para dois públicos:
        quem tem um cão ou um gato em casa e quem trabalha, ou quer trabalhar, no mercado pet.
      </p>
      <h2>Para tutores</h2>
      <p>
        Guias que resolvem os problemas do dia a dia (xixi no lugar errado, filhote que chora à noite, ansiedade quando
        fica sozinho, gato que arranha o sofá), receitas seguras e kits para imprimir. Todos os métodos usam
        <b> reforço positivo</b>, sem castigo, e indicam o veterinário sempre que um comportamento pode ter causa de saúde.
        Quem apresenta os guias é o Mozart, o nosso border collie. <Link href="/tutor">Ver os guias e kits</Link>.
      </p>
      <h2>Para negócios pet</h2>
      <p>
        Manuais completos para começar e crescer no mercado pet, com plano de carreira, as regras de cada ramo,
        planilhas, contratos e mensagens prontas, e posts editáveis no Canva para divulgar o negócio. Nenhum manual
        promete renda: mostramos o caminho, as contas de exemplo e as ferramentas. <Link href="/negocios">Ver os manuais</Link>.
      </p>
      <h2>Como trabalhamos</h2>
      <ul>
        <li>Pesquisamos em fontes oficiais, entidades do setor e imprensa especializada, e listamos as fontes nos materiais.</li>
        <li>Não usamos depoimentos inventados, números sem fonte nem promessas de resultado.</li>
        <li>Saúde é com o veterinário; impostos e contratos do seu caso, com um contador ou advogado.</li>
        <li>Todos os produtos têm garantia de 7 dias e pagamento seguro pela Cakto.</li>
      </ul>
      <h2>Fale com a gente</h2>
      <p>Dúvidas, sugestões ou suporte: <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>. Instagram: <a href="https://www.instagram.com/maestro_pet_/">@maestro_pet_</a>.</p>
    </div>
  );
}
