import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Comprar from "@/components/comprar";
import { FEED_AREAS, POSTS_POR_PACOTE, areaFeed, deNegocio, imgFeed, nomeFeed, type AreaFeed } from "@/lib/feed-pronto";
import type { Produto } from "@/lib/produtos";
import { reais } from "@/lib/produtos";

type Params = { params: Promise<{ area: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return FEED_AREAS.map((a) => ({ area: a.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const a = areaFeed((await params).area);
  if (!a) return {};
  const titulo = `${nomeFeed(a)}: ${POSTS_POR_PACOTE} posts editáveis no Canva`;
  const descricao = `${POSTS_POR_PACOTE} posts prontos para o Instagram ${deNegocio(a)}, editáveis no Canva grátis e com legenda pronta para cada um.`;
  return {
    // Fora do Google até o lançamento.
    ...(!a.lancado ? { robots: { index: false, follow: false } } : {}),
    title: titulo,
    description: descricao,
    alternates: { canonical: `/feed-pronto/${a.slug}` },
  };
}

/** O pacote visto como produto, para o botão de compra e o Pixel. */
const comoProduto = (a: AreaFeed): Produto => ({
  slug: `feed-pronto-${a.slug}`, nome: nomeFeed(a), chamada: a.chamada, dor: a.dores[0], preco: a.preco ?? 0, checkout: a.checkout, lancado: a.lancado,
});

const PASSOS: [string, string][] = [
  ["Receba o link", "Depois da compra, o acesso chega no seu e-mail."],
  ["Abra no seu Canva", "O pacote abre na sua conta. A conta grátis do Canva já serve."],
  ["Deixe com a sua cara", "Troque a logo, o nome, as fotos e os preços. Tudo é editável."],
  ["Copie a legenda e poste", "Cada post tem a legenda pronta. Baixe a imagem e publique."],
];

export default async function Page({ params }: Params) {
  const a = areaFeed((await params).area);
  if (!a) notFound();
  const p = comoProduto(a);
  const outras = FEED_AREAS.filter((x) => x.slug !== a.slug);
  const faq: [string, string][] = [
    ["Preciso pagar o Canva?", "Não. O pacote funciona na conta grátis do Canva, no computador ou no celular."],
    ["Dá para editar tudo?", "Sim. Textos, cores, fotos, ícones e enfeites são elementos soltos, que você muda como quiser."],
    ["As fotos e os preços dos posts são exemplos?", "Sim. Use as fotos do pacote ou troque pelas suas. Os preços, horários e endereços são exemplos para você ajustar."],
    ["Como recebo?", "Assim que o pagamento é confirmado, o link de acesso chega no e-mail informado na compra."],
    ["Posso usar em mais de um negócio?", "Pode usar nos perfis dos negócios que você administra. Não é permitido revender nem repassar o pacote."],
    ["E se eu não gostar?", "Você tem 7 dias de garantia. Peça o reembolso e recebe 100% do valor de volta."],
  ];
  return (
    <div className="com-barra">
      <section className="lp-hero">
        <div className="container lp-hero-grid">
          <div>
            <span className="eyebrow">Feed Pronto · Maestro Pet</span>
            <h1>{POSTS_POR_PACOTE} posts prontos para o Instagram <em>{deNegocio(a)}</em></h1>
            <p className="lead">{a.chamada} Tudo editável no Canva, com a legenda de cada post já escrita.</p>
            <div className="hero-ctas">
              <a className="btn btn-lg" href="#oferta">Quero o {nomeFeed(a)}</a>
              <a className="btn btn-ghost btn-lg" href="#exemplos">Ver os posts</a>
            </div>
            <ul className="selos"><li>Editável no Canva grátis</li><li>Legendas prontas</li><li>Acesso imediato</li></ul>
          </div>
          <div className="mockup feed-capa">
            <Image src={imgFeed(a, "capa.webp")} alt={`Capa do ${nomeFeed(a)}`} width={420} height={525} priority />
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <span className="eyebrow">Você se identifica?</span>
          <h2>Postar todo dia não precisa tomar o seu dia</h2>
          <div className="dores">{a.dores.map((d) => <blockquote key={d}>“{d}”</blockquote>)}</div>
        </div>
      </section>

      <section className="secao secao-creme" id="exemplos">
        <div className="container">
          <span className="eyebrow">Alguns dos {POSTS_POR_PACOTE} posts</span>
          <h2>Bonitos, com texto pronto e a cara {deNegocio(a)}</h2>
          <div className="feed-exemplos">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <Image key={n} src={imgFeed(a, `exemplo-${n}.webp`)} alt={`Exemplo de post ${n} do ${nomeFeed(a)}`} width={360} height={450} />
            ))}
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <span className="eyebrow">O que vem no pacote</span>
          <h2>Conteúdo para meses de Instagram</h2>
          <div className="recebe feed-recebe">
            <ol>
              <li><b>{POSTS_POR_PACOTE} posts editáveis</b><span>No formato do feed (1080 × 1350), com textos já escritos.</span></li>
              <li><b>{a.carrosseis} carrosséis completos</b><span>Posts de várias páginas, que o seguidor salva e compartilha.</span></li>
              <li><b>Legenda pronta para cada post</b><span>Com chamada para ação e hashtags. É só copiar e colar.</span></li>
              <li><b>Todos os temas que o seu perfil precisa</b><span>{a.temas.join(" · ")}.</span></li>
              <li><b>Guia de uso</b><span>Como trocar a logo, as fotos e os preços em poucos minutos.</span></li>
              <li><b>Bônus: Calendário de Postagens</b><span>Os posts organizados em 3 por semana e as datas comemorativas do ano. É só seguir.</span></li>
            </ol>
          </div>
          <h3 className="feed-extras-titulo">Se quiser, no checkout você também pode levar</h3>
          <ul className="feed-extras">
            <li><b>Stories Prontos</b><span>A versão vertical de cada post, feita para a tela do celular.</span></li>
            <li><b>Avisos Prontos</b><span>30 avisos (feriado, horário, regras, pagamento) para postar e imprimir em A4.</span></li>
            <li><b>Kit Perfil Profissional</b><span>Capas de destaques e bios prontas para o Instagram.</span></li>
            <li><b>30 Roteiros de Reels</b><span>Manual de gravação e roteiros cena a cena.</span></li>
          </ul>
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container">
          <span className="eyebrow">Como funciona</span>
          <h2>Da compra ao primeiro post em poucos minutos</h2>
          <div className="dias" style={{ ["--cols" as string]: PASSOS.length }}>
            {PASSOS.map(([t, d], i) => (
              <div key={t} className="dia"><small>Passo</small><b>{i + 1}</b><strong>{t}</strong><span>{d}</span></div>
            ))}
          </div>
        </div>
      </section>

      {a.cores && (
        <section className="secao">
          <div className="container">
            <span className="eyebrow">Edições de cor</span>
            <h2>Escolha a cor que combina com a sua marca</h2>
            <p className="lead">Além da edição azul e amarela, o {nomeFeed(a)} tem as edições {a.cores.join(" e ").toLowerCase()}, com os mesmos posts.</p>
          </div>
        </section>
      )}

      <section className="secao secao-creme">
        <div className="container para-quem">
          <div className="pq pq-sim"><h3>É para você se…</h3><ul>
            <li>Você cuida {deNegocio(a)} e quer o Instagram sempre ativo</li>
            <li>Não tem tempo nem verba para um designer toda semana</li>
            <li>Quer posts bonitos sem começar do zero</li>
          </ul></div>
          <div className="pq pq-nao"><h3>Não é para você se…</h3><ul>
            <li>Você procura alguém para postar no seu lugar</li>
            <li>Não quer usar o Canva, nem a versão grátis</li>
          </ul></div>
        </div>
      </section>

      <section className="secao oferta-sec" id="oferta">
        <div className="container oferta">
          <div className="oferta-mockup feed-capa"><Image src={imgFeed(a, "capa.webp")} alt="" width={360} height={450} /></div>
          <div className="oferta-box">
            <span className="eyebrow">Feed Pronto · Maestro Pet</span>
            <h2>{nomeFeed(a)}</h2>
            <ul className="oferta-itens">
              <li>{POSTS_POR_PACOTE} posts editáveis no Canva</li>
              <li>{a.carrosseis} carrosséis completos</li>
              <li>Legenda pronta para cada post</li>
              <li>Guia de uso</li>
              <li>Bônus: Calendário de Postagens</li>
            </ul>
            {a.preco ? <div className="preco"><strong>{reais(a.preco)}</strong><small>pagamento único · Pix ou cartão</small></div> : null}
            <Comprar produto={p} texto="Quero o meu Feed Pronto" grande />
            <p className="seguro">Pagamento seguro processado pela Cakto · acesso enviado por e-mail · garantia de 7 dias</p>
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container faq">
          <span className="eyebrow">Dúvidas</span>
          <h2>Perguntas frequentes</h2>
          {faq.map(([q, r]) => <details key={q}><summary>{q}</summary><p>{r}</p></details>)}
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container">
          <span className="eyebrow">Linha Feed Pronto</span>
          <h2>Tem outro negócio pet?</h2>
          <ul className="feed-outras">{outras.map((o) => <li key={o.slug}><Link href={`/feed-pronto/${o.slug}`}>{nomeFeed(o)}</Link></li>)}</ul>
          <p className="feed-combo-link">Atende mais de um público? <Link href="/feed-pronto/combo">Leve as 10 áreas no Combo Pet Completo</Link>.</p>
        </div>
      </section>
    </div>
  );
}
