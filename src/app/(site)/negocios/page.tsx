import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookOpenCheck, FileSpreadsheet, Scale, Search } from "lucide-react";
import { GRUPOS, PRODUTOS, linhaDe } from "@/lib/produtos";
import { SecaoVitrine } from "@/components/vitrine";

export const metadata: Metadata = {
  title: "Para negócios pet: manuais para empreender no mercado pet",
  description: "Manuais completos para começar e crescer no mercado pet — confeitaria pet, passeador, pet sitter, fotografia — e posts prontos no Canva para divulgar o seu negócio.",
  alternates: { canonical: "/negocios" },
};

const COMO = [
  [Search, "Pesquisa com fonte", "Cada número, regra e preço vem de fonte oficial ou de mercado, com data. A lista de fontes está no fim de cada manual."],
  [Scale, "As regras certas", "O que a lei pede para o seu tipo de negócio: formalização, nota fiscal, contrato e, quando é o caso, as regras do MAPA e da prefeitura."],
  [FileSpreadsheet, "Ferramentas para usar", "Planilha de preço e de controle, contrato, ficha do cliente, checklists e mensagens prontas. Não é só leitura."],
  [BookOpenCheck, "Sem promessa de renda", "Mostramos contas de exemplo e o caminho, nunca um valor garantido. O resultado depende do seu trabalho, da sua cidade e do tempo."],
] as const;

const FAQ = [
  ["Os manuais servem para quem está começando do zero?", "Sim. Todos começam pelo básico (o mercado, o perfil, o investimento inicial em 3 níveis) e vão até o plano de carreira, para quem já atende e quer crescer."],
  ["Preciso ter CNPJ para começar?", "Não necessariamente. Cada manual explica quando e como formalizar no seu tipo de negócio (MEI, nota fiscal) e o que depende de um contador."],
  ["Os manuais garantem que vou ganhar dinheiro?", "Não. Nenhum material sério pode garantir renda. Entregamos o passo a passo, as ferramentas e as regras; o resultado depende de você, da sua região e do tempo."],
  ["Quem faz os manuais?", "A equipe da Maestro Pet, a mesma dos guias para tutores, com pesquisa em fontes oficiais, entidades do setor e imprensa especializada. As fontes estão listadas em cada manual."],
  ["Como recebo?", "Logo depois da confirmação do pagamento, o acesso chega no seu e-mail. São materiais digitais (PDF, planilhas e arquivos editáveis)."],
  ["E se eu não gostar?", "Você tem 7 dias de garantia: pediu, recebe 100% do valor de volta."],
];

export default function Negocios() {
  const manuais = PRODUTOS.filter((p) => linhaDe(p) === "negocios");
  const influenciador = PRODUTOS.filter((p) => p.grupo === "redes");
  const [comece, redes] = GRUPOS.negocios;
  return (
    <div className="linha-negocios">
      <section className="hero-home hero-negocios">
        <div className="container hero-home-grid">
          <div>
            <span className="eyebrow">Maestro Pet Negócios</span>
            <h1>Construa a sua renda no mercado pet, <em>com método</em>.</h1>
            <p className="lead">
              Manuais completos para começar e crescer num negócio pet, com plano de carreira, as regras do seu ramo,
              planilhas e mensagens prontas. E posts editáveis no Canva para divulgar o que você já faz.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-lg" href="#comece">Ver os manuais</a>
              <Link className="btn btn-ghost btn-lg" href="/negocios/feed-pronto">Posts prontos para o seu Instagram</Link>
            </div>
            <ul className="selos"><li>Pesquisa com fontes</li><li>Ferramentas prontas</li><li>Garantia de 7 dias</li></ul>
          </div>
          <div className="hero-art hero-foto">
            <Image src="/negocios-porta.webp" alt="Border collie em estúdio" width={520} height={650} priority />
          </div>
        </div>
      </section>

      <section className="secao secao-escura">
        <div className="container mercado-num">
          <div><b>R$ 77,96 bi</b><span>foi o faturamento do setor pet no Brasil em 2025 (Abempet)</span></div>
          <div><b>+22%</b><span>na abertura de pequenos negócios pet entre 2023 e 2025, a maioria MEI (Sebrae)</span></div>
          <div><b>Muita gente</b><span>começa sem saber o que a lei pede, quanto cobrar e onde achar o primeiro cliente. É aí que os manuais entram.</span></div>
        </div>
      </section>

      <SecaoVitrine id={comece[0]} titulo={comece[1]} texto={comece[2]} produtos={manuais.filter((p) => p.grupo === comece[0])} />

      <section className="secao secao-creme">
        <div className="container feed-combo">
          <Image src="/feed-pronto/combo/capa.webp" alt="Capa do Feed Pronto" width={260} height={325} />
          <div>
            <span className="eyebrow">Divulgue o seu negócio</span>
            <h2>Feed Pronto: posts editáveis no Canva</h2>
            <p className="lead">Pacotes com posts, stories e legendas prontos para pet shops, clínicas, adestradores, dog walkers, confeitarias pet e outros negócios. Você troca a logo e posta.</p>
            <Link className="btn" href="/negocios/feed-pronto">Escolher a minha área</Link>
          </div>
        </div>
      </section>

      <SecaoVitrine id={redes[0]} titulo={redes[1]} texto={redes[2]} produtos={influenciador} />

      <section className="secao">
        <div className="container">
          <span className="eyebrow">Como fazemos</span>
          <h2>Um manual de negócio sério, do jeito que você gostaria de comprar</h2>
          <div className="pilares-grid como-grid">
            {COMO.map(([Icone, t, d]) => (
              <div key={t} className="pilar"><span className="pilar-ic"><Icone size={24} aria-hidden /></span><div><b>{t}</b><p>{d}</p></div></div>
            ))}
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
    </div>
  );
}
