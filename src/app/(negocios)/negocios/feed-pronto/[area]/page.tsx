import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import Comprar from "@/components/comprar";
import {
  AMOSTRAS, EDICOES_COR, FEED_AREAS, POSTS_POR_PACOTE, PRECO_COMPLEMENTO, areaFeed, deNegocio, imgFeed, nomeFeed, type AreaFeed,
} from "@/lib/feed-pronto";
import type { Produto } from "@/lib/produtos";
import { reais } from "@/lib/produtos";
import "../../../../feed-pronto.css";

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
    alternates: { canonical: `/negocios/feed-pronto/${a.slug}` },
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

/**
 * Imagem que amplia ao tocar, sem JavaScript: o botão abre um popover nativo (fecha com Esc, com o botão
 * ou tocando fora). A imagem grande só carrega quando o popover abre.
 */
function Ampliavel({ id, src, alt, rotulo, largura = 360 }: { id: string; src: string; alt: string; rotulo?: string; largura?: number }) {
  return (
    <>
      <button type="button" className="fp-amostra" popoverTarget={id} aria-label={`Ampliar: ${alt}`}>
        <Image src={src} alt={alt} width={largura} height={Math.round(largura * 1.25)} sizes={`(max-width: 760px) 50vw, ${largura}px`} />
        <span className="fp-lupa" aria-hidden>Ampliar</span>
      </button>
      <div id={id} popover="auto" className="fp-zoom" role="dialog" aria-label={alt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" width={800} height={1000} />
        {rotulo ? <p className="fp-zoom-legenda">{rotulo}</p> : null}
        <button type="button" className="fp-zoom-fechar" popoverTarget={id} popoverTargetAction="hide" aria-label="Fechar">×</button>
      </div>
    </>
  );
}

export default async function Page({ params }: Params) {
  const a = areaFeed((await params).area);
  if (!a) notFound();
  const p = comoProduto(a);
  const outras = FEED_AREAS.filter((x) => x.slug !== a.slug);
  const am = AMOSTRAS[a.slug];
  const img = (arquivo: string) => imgFeed(a, arquivo);
  const tituloEx = (n: number) => am.exemplos[n - 1];
  const faq: [string, ReactNode][] = [
    ["Preciso pagar o Canva?", "Não. O pacote funciona na conta grátis do Canva, no computador ou no celular."],
    ["Dá para editar tudo?", "Sim. Textos, cores, fotos, ícones e enfeites são elementos soltos, que você muda como quiser."],
    ["As fotos e os preços dos posts são exemplos?", "Sim. Use as fotos do pacote ou troque pelas suas. Os preços, horários e endereços são exemplos para você ajustar."],
    ["Como recebo?", "Assim que o pagamento é confirmado, o link de acesso chega no e-mail informado na compra."],
    ["Outros negócios vão ter os mesmos posts?", (
      <>
        <span className="fp-faq-p">Sim. O pacote é o mesmo para todo mundo que compra o {nomeFeed(a)}. O que muda é o que você troca no Canva: logo, cores, fotos, nome e preços. Algumas dicas para o post ficar com a cara {deNegocio(a)}:</span>
        <ol className="fp-faq-dicas">
          <li><b>Use as suas fotos.</b> Troque as fotos de exemplo por fotos dos seus clientes e do seu espaço (com a autorização do tutor). É o que mais diferencia o post.</li>
          <li><b>Use a cor da sua marca.</b> Escolha a edição de cor mais próxima (azul, rosa ou verde) ou troque as cores no Canva, e coloque a sua logo no círculo do topo.</li>
          <li><b>Escreva do seu jeito.</b> Mude o título e a primeira linha da legenda com o nome do bairro, os seus serviços e o jeito como você fala com os clientes.</li>
        </ol>
      </>
    )],
    ["Posso usar em mais de um perfil?", "Pode, desde que sejam perfis dos negócios que você administra (por exemplo, a loja e a filial). Não é permitido revender, repassar ou compartilhar o pacote com outros negócios."],
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
          <span className="eyebrow">{am.exemplos.length} dos {POSTS_POR_PACOTE} posts</span>
          <h2>Veja {am.exemplos.length} posts do pacote, como você recebe</h2>
          <p className="fp-intro">Toque num post para ampliar. O nome, o @, as fotos e os preços são exemplos: no Canva, você troca pelos seus.</p>
          <div className="fp-grade">
            {am.exemplos.map((t, i) => (
              <Ampliavel key={t + i} id={`fp-ex-${i + 1}`} src={img(`exemplo-${i + 1}.webp`)} alt={`Post “${t}” do ${nomeFeed(a)}`} rotulo={`Post ${i + 1} de ${am.exemplos.length} · ${t}`} />
            ))}
          </div>

          <div className="fp-bloco">
            <h3>Um dos {a.carrosseis} carrosséis, página por página</h3>
            <p className="fp-intro">“{am.carrossel.titulo}”: {am.carrossel.paginas} páginas para postar juntas, na ordem. Arraste para o lado para ver todas.</p>
            <div className="fp-carrossel" tabIndex={0} aria-label={`Carrossel “${am.carrossel.titulo}”, ${am.carrossel.paginas} páginas`}>
              {Array.from({ length: am.carrossel.paginas }, (_, i) => (
                <div key={i} className="fp-carrossel-item">
                  <Ampliavel id={`fp-car-${i + 1}`} src={img(`carrossel-${i + 1}.webp`)} alt={`Carrossel “${am.carrossel.titulo}”, página ${i + 1} de ${am.carrossel.paginas}`} rotulo={`Página ${i + 1} de ${am.carrossel.paginas}`} largura={260} />
                  <small>{i + 1}/{am.carrossel.paginas}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="fp-bloco fp-legenda">
            <div className="fp-legenda-post">
              <Ampliavel id="fp-leg" src={img(`exemplo-${am.legenda.exemplo}.webp`)} alt={`Post “${tituloEx(am.legenda.exemplo)}”`} rotulo={tituloEx(am.legenda.exemplo)} largura={280} />
            </div>
            <div>
              <h3>Assim vem a legenda, é só copiar</h3>
              <p className="fp-intro">Cada post vem com a legenda pronta, com chamada para ação e hashtags. Esta é a legenda deste post, exatamente como está no pacote:</p>
              <blockquote className="fp-legenda-texto">{am.legenda.texto}</blockquote>
              <p className="fp-nota">Dica: antes de postar, acrescente uma frase sua e confira preços e condições.</p>
            </div>
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
          <h3 className="feed-extras-titulo">Se quiser, no checkout você também pode levar (opcional, {reais(PRECO_COMPLEMENTO)} cada)</h3>
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

      <section className="secao">
        <div className="container">
          <span className="eyebrow">Edições de cor</span>
          <h2>Escolha a cor que combina com a sua marca</h2>
          <p className="fp-intro">O pacote vem em 3 edições com os mesmos {POSTS_POR_PACOTE} posts: azul e amarela, {EDICOES_COR.join(" e ").toLowerCase()}. Veja o mesmo post nas 3. Se a sua marca tem outra cor, dá para trocar no Canva.</p>
          <div className="fp-cores">
            {[["Azul e amarela", "exemplo"], ...EDICOES_COR.map((c) => [c, c.toLowerCase()])].map(([cor, pref]) => (
              <div key={cor} className="fp-cor">
                <h3>{cor}</h3>
                {am.cores.map((n, k) => {
                  const src = pref === "exemplo" ? img(`exemplo-${n}.webp`) : img(`${pref}-${k + 1}.webp`);
                  return <Ampliavel key={n} id={`fp-cor-${pref}-${k + 1}`} src={src} alt={`Post “${tituloEx(n)}”, edição ${cor.toLowerCase()}`} rotulo={`Edição ${cor.toLowerCase()} · ${tituloEx(n)}`} largura={240} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

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
          {faq.map(([q, r]) => <details key={q}><summary>{q}</summary>{typeof r === "string" ? <p>{r}</p> : <div className="fp-faq-r">{r}</div>}</details>)}
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container">
          <span className="eyebrow">Linha Feed Pronto</span>
          <h2>Tem outro negócio pet?</h2>
          <ul className="feed-outras">{outras.map((o) => <li key={o.slug}><Link href={`/negocios/feed-pronto/${o.slug}`}>{nomeFeed(o)}</Link></li>)}</ul>
          <p className="feed-combo-link">Atende mais de um público? <Link href="/negocios/feed-pronto/combo">Leve as 10 áreas no Combo Pet Completo</Link>.</p>
        </div>
      </section>
    </div>
  );
}
