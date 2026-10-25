import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search, ShieldCheck, Sparkles, Zap } from "lucide-react";

const PILARES = [
  [Search, "Pesquisa de verdade", "Métodos e números com fonte. Nada de achismo nem promessa milagrosa."],
  [Sparkles, "Prático do começo ao fim", "Passo a passo, checklists e materiais para usar no mesmo dia."],
  [Zap, "Acesso imediato", "Pagou, recebeu no e-mail. Pix ou cartão, em ambiente seguro."],
  [ShieldCheck, "Garantia de 7 dias", "Não fez sentido para você? Devolvemos 100% do valor."],
] as const;

export default function Home() {
  return (
    <>
      <section className="hero-home hero-empresa">
        <div className="container">
          <span className="eyebrow">Maestro Pet</span>
          <h1>Conhecimento prático para quem ama pets <em>e para quem vive deles</em>.</h1>
          <p className="lead">
            Guias e kits para tutores de cães e gatos, e manuais completos para quem quer empreender no mercado pet.
            Escolha o seu caminho.
          </p>
        </div>
      </section>

      <section className="secao portas-sec">
        <div className="container portas">
          <Link href="/tutor" className="porta porta-tutor">
            <Image src="/mozart/acenando.webp" alt="Mozart, o border collie do Maestro Pet" width={260} height={260} />
            <div>
              <span className="eyebrow">Tenho um pet</span>
              <h2>Para tutores</h2>
              <p>Xixi no lugar certo, filhote, gato, saúde, receitas seguras e kits para imprimir. Com o passo a passo do Mozart.</p>
              <span className="porta-cta">Ver guias e kits <ArrowRight size={18} aria-hidden /></span>
            </div>
          </Link>
          <Link href="/negocios" className="porta porta-negocios">
            <Image src="/negocios-porta.webp" alt="" width={260} height={325} />
            <div>
              <span className="eyebrow">Trabalho ou quero trabalhar com pets</span>
              <h2>Para negócios pet</h2>
              <p>Manuais para começar e crescer (confeitaria pet, passeador, pet sitter, fotografia) e posts prontos no Canva para divulgar.</p>
              <span className="porta-cta">Ver manuais e materiais <ArrowRight size={18} aria-hidden /></span>
            </div>
          </Link>
        </div>
      </section>

      <section className="pilares">
        <div className="container pilares-grid">
          {PILARES.map(([Icone, t, d]) => (
            <div key={t} className="pilar"><span className="pilar-ic"><Icone size={24} aria-hidden /></span><div><b>{t}</b><p>{d}</p></div></div>
          ))}
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container prose-home">
          <span className="eyebrow">Quem somos</span>
          <h2>Uma empresa de conteúdo sobre o mundo pet</h2>
          <p>
            O Maestro Pet nasceu ensinando tutores a resolver o dia a dia com seus cães e gatos, sempre com reforço positivo
            e com o veterinário por perto quando é caso de saúde. Hoje também fazemos manuais para quem trabalha no mercado pet,
            com a mesma regra: pesquisa séria, passo a passo prático e nenhuma promessa que a gente não possa cumprir.
          </p>
          <p><Link href="/sobre">Conheça a Maestro Pet</Link> · <Link href="/contato">Fale com a gente</Link></p>
        </div>
      </section>
    </>
  );
}
