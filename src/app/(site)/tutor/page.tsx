import type { Metadata } from "next";
import Image from "next/image";
import { BookOpen, HeartHandshake, ShieldCheck, Zap } from "lucide-react";
import { GRUPOS, PRODUTOS, linhaDe } from "@/lib/produtos";
import { SecaoVitrine } from "@/components/vitrine";

export const metadata: Metadata = {
  title: "Para tutores: guias e kits para cães e gatos",
  description: "Guias práticos para os problemas do dia a dia com cães e gatos, kits para imprimir e receitas seguras. Com reforço positivo e garantia de 7 dias.",
  alternates: { canonical: "/tutor" },
};

const PILARES = [
  [HeartHandshake, "Reforço positivo", "Nada de bronca ou castigo. Métodos que ensinam com confiança e carinho."],
  [BookOpen, "Passo a passo ilustrado", "Guias diretos, visuais e práticos, para aplicar no mesmo dia."],
  [Zap, "Acesso imediato", "Pagou, recebeu no e-mail. Leia no celular, no computador ou imprima."],
  [ShieldCheck, "Garantia de 7 dias", "Não gostou? Devolvemos 100% do valor, sem perguntas."],
] as const;

const DICAS = [
  { img: "/produtos/dica-petisco.webp", titulo: "Recompense em até 3 segundos", texto: "O cachorro liga a recompensa ao que estava fazendo naquele exato momento. Elogio e petisco precisam vir logo depois do acerto — um minuto depois, ele já não sabe pelo que ganhou." },
  { img: "/produtos/dica-farejando.webp", titulo: "Fareja em círculos? Hora do banheiro", texto: "Farejar o chão andando em círculo, parar de brincar de repente e ir para um canto são os sinais clássicos de que ele precisa fazer xixi. Leve-o ao lugar certo na hora." },
  { img: "/produtos/dica-filhote.webp", titulo: "Filhote morde tudo? Ofereça o que pode", texto: "Morder faz parte da fase de dentes. Em vez de só tirar o chinelo da boca, troque por um brinquedo de mastigar e elogie quando ele morder o objeto certo." },
];

const FAQ = [
  ["Como recebo o guia?", "Assim que o pagamento é confirmado, você recebe o acesso no e-mail informado na compra. Os guias são PDFs para ler no celular, no computador ou imprimir."],
  ["Quais formas de pagamento?", "Pix e cartão de crédito, em ambiente seguro processado pela Cakto."],
  ["E se eu não gostar?", "Todos os guias têm garantia de 7 dias. Peça o reembolso e você recebe 100% do valor de volta."],
  ["Os guias substituem o veterinário?", "Não. Eles ensinam rotina, comportamento e cuidados do dia a dia. Sempre que um problema pode ter causa de saúde, o guia indica procurar um(a) veterinário(a)."],
];

export default function Tutor() {
  const tutor = PRODUTOS.filter((p) => linhaDe(p) === "tutor");
  return (
    <>
      <section className="hero-home">
        <div className="container hero-home-grid">
          <div>
            <span className="eyebrow">Maestro Pet · Para tutores</span>
            <h1>Seu pet feliz, <em>sua casa em paz</em>.</h1>
            <p className="lead">
              Guias que resolvem os problemas do dia a dia com cães e gatos, kits para imprimir e receitas seguras.
              Com o passo a passo do Mozart, nosso border collie, e sempre com reforço positivo.
            </p>
            <div className="hero-ctas"><a className="btn btn-lg" href="#comportamento">Ver os guias</a></div>
            <ul className="selos"><li>Acesso imediato</li><li>Garantia de 7 dias</li><li>Pix ou cartão</li></ul>
          </div>
          <div className="hero-art">
            <Image src="/mozart/acenando.webp" alt="Mozart, o border collie do Maestro Pet, acenando" width={560} height={560} priority />
          </div>
        </div>
      </section>

      <section className="pilares">
        <div className="container pilares-grid">
          {PILARES.map(([Icone, t, d]) => (
            <div key={t} className="pilar"><span className="pilar-ic"><Icone size={24} aria-hidden /></span><div><b>{t}</b><p>{d}</p></div></div>
          ))}
        </div>
      </section>

      {GRUPOS.tutor.map(([id, titulo, texto]) => (
        <SecaoVitrine key={id} id={id} titulo={titulo} texto={texto} produtos={tutor.filter((p) => p.grupo === id)} />
      ))}

      <section className="secao secao-creme">
        <div className="container">
          <span className="eyebrow">Dicas do Mozart</span>
          <h2>Comece hoje: três dicas que já fazem diferença</h2>
          <div className="dicas">
            {DICAS.map((d) => (
              <article key={d.titulo} className="dica">
                <Image src={d.img} alt="" width={400} height={400} />
                <div><h3>{d.titulo}</h3><p>{d.texto}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container faq">
          <span className="eyebrow">Dúvidas</span>
          <h2>Perguntas frequentes</h2>
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>
    </>
  );
}
