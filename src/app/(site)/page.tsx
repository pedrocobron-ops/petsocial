import Image from "next/image";
import Link from "next/link";
import { BookOpen, HeartHandshake, ShieldCheck, Zap } from "lucide-react";
import { PRODUTOS, reais } from "@/lib/produtos";

const PILARES = [
  [HeartHandshake, "Reforço positivo", "Nada de bronca ou castigo. Métodos que ensinam com confiança e carinho."],
  [BookOpen, "Passo a passo ilustrado", "Guias curtos, visuais e diretos, para aplicar no mesmo dia."],
  [Zap, "Acesso imediato", "Pagou, recebeu no e-mail. Leia no celular, no computador ou imprima."],
  [ShieldCheck, "Garantia de 7 dias", "Não gostou? Devolvemos 100% do valor, sem perguntas."],
] as const;

const DICAS = [
  {
    img: "/produtos/dica-petisco.webp",
    titulo: "Recompense em até 3 segundos",
    texto: "O cachorro liga a recompensa ao que estava fazendo naquele exato momento. Elogio e petisco precisam vir logo depois do acerto — um minuto depois, ele já não sabe pelo que ganhou.",
  },
  {
    img: "/produtos/dica-farejando.webp",
    titulo: "Fareja em círculos? Hora do banheiro",
    texto: "Farejar o chão andando em círculo, parar de brincar de repente e ir para um canto são os sinais clássicos de que ele precisa fazer xixi. Leve-o ao lugar certo na hora.",
  },
  {
    img: "/produtos/dica-filhote.webp",
    titulo: "Filhote morde tudo? Ofereça o que pode",
    texto: "Morder faz parte da fase de dentes. Em vez de só tirar o chinelo da boca, troque por um brinquedo de mastigar e elogie quando ele morder o objeto certo.",
  },
];

const FAQ = [
  ["Como recebo o guia?", "Assim que o pagamento é confirmado, você recebe o acesso no e-mail informado na compra. Os guias são PDFs ilustrados para ler no celular, no computador ou imprimir."],
  ["Quais formas de pagamento?", "Pix e cartão de crédito, em ambiente seguro processado pela Cakto."],
  ["E se eu não gostar?", "Todos os guias têm garantia de 7 dias. Peça o reembolso e você recebe 100% do valor de volta."],
  ["Os guias substituem o veterinário?", "Não. Eles ensinam rotina, comportamento e cuidados do dia a dia. Sempre que um problema pode ter causa de saúde, o guia indica procurar um(a) veterinário(a)."],
];

export default function Home() {
  const lancados = PRODUTOS.filter((p) => p.lancado);
  return (
    <>
      <section className="hero-home">
        <div className="container hero-home-grid">
          <div>
            <span className="eyebrow">Maestro Pet · Guias práticos para tutores</span>
            <h1>Seu pet feliz, <em>sua casa em paz</em>.</h1>
            <p className="lead">
              Guias ilustrados que resolvem os problemas do dia a dia com cães e gatos — xixi no lugar errado,
              filhote bagunceiro, ansiedade e muito mais. Com o passo a passo do Mozart, nosso border collie, e sempre
              com reforço positivo.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-lg" href="#guias">Ver os guias</a>
              {lancados[0] && <Link className="btn btn-ghost btn-lg" href={`/${lancados[0].slug}`}>Começar pelo {lancados[0].nome}</Link>}
            </div>
            <ul className="selos">
              <li>Acesso imediato</li>
              <li>Garantia de 7 dias</li>
              <li>Pix ou cartão</li>
            </ul>
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

      <section className="secao" id="guias">
        <div className="container">
          <span className="eyebrow">Nossos guias</span>
          <h2>Escolha o problema que você quer resolver</h2>
          <div className="guias">
            {PRODUTOS.map((p) => {
              const card = (
                <>
                  <div className="guia-capa">
                    {p.capa && <Image src={p.capa} alt={`Capa do guia ${p.nome}`} width={300} height={424} />}
                    {!p.lancado && <span className="guia-breve">Em breve</span>}
                  </div>
                  <div className="guia-corpo">
                    <span className="guia-dor">“{p.dor}”</span>
                    <h3>{p.nome}</h3>
                    <p>{p.chamada}</p>
                    {p.lancado ? <span className="guia-preco">{p.precoDe && <s>{reais(p.precoDe)}</s>} {p.ofertas && <small>a partir de </small>}{reais(p.preco)}</span> : <span className="guia-preco muted">Lançamento em breve</span>}
                  </div>
                </>
              );
              return p.lancado ? (
                <Link key={p.slug} href={`/${p.slug}`} className="guia">{card}</Link>
              ) : (
                <div key={p.slug} className="guia guia-off">{card}</div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="secao secao-escura">
        <div className="container virada">
          <Image className="virada-art" src="/produtos/tutora.webp" alt="Tutora elogiando o Mozart" width={330} height={186} />
          <div>
            <span className="eyebrow">Quem é o Mozart</span>
            <h2>Do ponto de vista do cachorro, quase todo “mau comportamento” é falta de alguém explicar direito.</h2>
            <p>
              O Mozart é o border collie que apresenta cada guia do Maestro Pet. Com ele, você aprende a enxergar a casa
              como o seu pet enxerga — e a ensinar do jeito que ele entende: com rotina, paciência e recompensa.
            </p>
            <p>
              Nossos guias são <b>curtos, ilustrados e práticos</b>. Nada de teoria sem fim: você abre, entende e aplica
              no mesmo dia. E sempre que um comportamento pode ter causa de saúde, a gente avisa para procurar o veterinário.
            </p>
          </div>
        </div>
      </section>

      <section className="secao">
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

      <section className="secao secao-creme">
        <div className="container como">
          <div>
            <span className="eyebrow">Como funciona</span>
            <h2>Do problema à solução em três passos</h2>
          </div>
          <ol className="passos">
            <li><b>Escolha o guia</b> do problema que mais incomoda hoje.</li>
            <li><b>Pague com Pix ou cartão</b> e receba o acesso na hora, no seu e-mail.</li>
            <li><b>Siga o passo a passo</b> e use os materiais para imprimir. Não gostou? Em até 7 dias você recebe 100% do valor de volta.</li>
          </ol>
        </div>
      </section>

      <section className="secao">
        <div className="container garantia">
          <Image src="/mozart/medalha.webp" alt="Selo de garantia" width={200} height={200} />
          <div>
            <h2>Satisfação garantida ou seu dinheiro de volta</h2>
            <p>Todos os guias do Maestro Pet têm garantia incondicional de 7 dias. Se não fizer sentido para você e seu pet, devolvemos 100% do valor.</p>
          </div>
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container faq">
          <span className="eyebrow">Dúvidas</span>
          <h2>Perguntas frequentes</h2>
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="secao cta-final">
        <div className="container">
          <h2>Seu pet não precisa de bronca. Precisa de método.</h2>
          <a className="btn btn-lg" href="#guias">Escolher meu guia</a>
        </div>
      </section>
    </>
  );
}
