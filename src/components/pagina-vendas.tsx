import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import {
  ArrowDown, ArrowUp, Heart, Square, Star, Ban, Cake, Calculator, Calendar, Camera, Car, Cat, Check, ClipboardList, Compass, Cookie, Dog, FileText, Gift, GraduationCap,
  House, Info, Landmark, Layers, ListChecks, Luggage, Mail, Medal, Minus, NotebookPen, PawPrint, PenLine, Phone, Plane, Printer,
  Sparkles, Tag, Wallet, Wrench,
} from "lucide-react";
import AviseMe from "@/components/avise-me";
import ListaCompleta from "@/components/lista-completa";
import BarraCompra from "@/components/barra-compra";
import Comprar from "@/components/comprar";
import Amostras from "@/components/amostras";
import Trilho from "@/components/trilho";
import { Seta } from "@/components/icones";
import { Palco } from "@/components/palco";
import { FaixaProva, LinhaPagamento, Risco } from "@/components/pagamento";
import { DepoisDaCompra, QuemFaz, Selos } from "@/components/confianca";
import { CartaoProduto } from "@/components/vitrine";
import { VerProduto } from "@/components/meta-pixel";
import type { Produto } from "@/lib/produtos";
import { comoProduto, daFamilia, linhaDe, reais, urlProduto } from "@/lib/produtos";
import type { PaginaVendas as Conteudo, FichaExemplo, IconeLucide } from "@/lib/vendas/tipos";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

/** Converte **negrito** do conteúdo em <b>. */
function Rico({ texto }: { texto: string }) {
  return <>{texto.split(/(\*\*[^*]+\*\*)/g).map((t, i) => (t.startsWith("**") ? <b key={i}>{t.slice(2, -2)}</b> : t))}</>;
}

/** Título com uma expressão em itálico marcada com *asteriscos* (brief 20, 4.3). */
function Titulo({ t }: { t: string }) {
  return <>{t.split(/(\*[^*]+\*)/g).map((x, i) => (x.length > 2 && x.startsWith("*") && x.endsWith("*") ? <em key={i}>{x.slice(1, -1)}</em> : x))}</>;
}

const ICONES: Record<IconeLucide, typeof Check> = {
  ClipboardList, Calculator, Camera, FileText, PawPrint, ListChecks, Ban, Phone, Cat, Sparkles, Gift, Luggage, Compass, Car,
  Calendar, Printer, Wrench, NotebookPen, Wallet, Mail, Dog, Tag, House, Landmark, Medal, GraduationCap, Cake, Cookie, Layers, PenLine, Plane,
};

/** "R$ 19,90"; preço redondo sem centavos ("R$ 67"), como pede a linha Negócios. */
const preco = (v: number) => (Number.isInteger(v) ? `R$\u00a0${v}` : reais(v));
/** Só o número, para o preço grande da folha: "19,90" / "67". */
const valor = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

/**
 * Perguntas que valem para todos os produtos (brief 20, 6.18), cada uma com até 3 linhas no celular (≈ 180 caracteres).
 * `fora`: perguntas do arquivo do produto que esta resposta substitui (a do arquivo sai, para não repetir).
 * `pula`: se o arquivo já tem uma pergunta assim, a fixa não entra (a do produto é mais específica).
 */
type Fixa = { q: [string, string]; peso: number; fora?: RegExp; pula?: RegExp };
const FIXAS: Fixa[] = [
  { peso: 1, q: ["Pix ou cartão? Parcela?", "Pix ou cartão de crédito, no checkout da Cakto. Se escolher parcelar, o checkout mostra as parcelas e os juros antes de você confirmar."], pula: /pix|parcel|formas? de pagamento/i },
  { peso: 2, q: ["Como peço o reembolso e em quanto tempo volta?", "Em até 7 dias, em reembolso.cakto.com.br ou pelo nosso e-mail. A Cakto processa em até 24 h; no Pix costuma voltar em minutos, no cartão segue o prazo do banco."], fora: /reembolso|não gostar|não for para mim|devolu/i },
  { peso: 3, q: ["Precisa de cadastro ou aplicativo?", "Não precisa de aplicativo. O acesso chega no e-mail da compra, e o PDF abre no celular ou no computador."], pula: /aplicativo|cadastro/i },
  { peso: 6, q: ["Preciso imprimir?", "Não. Dá para usar tudo no celular ou no computador. As páginas para imprimir são opcionais e saem em A4, numa impressora comum."], pula: /imprimir|impress/i },
  { peso: 7, q: ["Recebo nota fiscal?", "O comprovante da compra chega no e-mail da Cakto. Para pedir nota fiscal, escreva para contato@maestropet.com com o e-mail usado na compra."], pula: /nota fiscal/i },
  { peso: 8, q: ["Por que não tem depoimentos?", "Porque não inventamos. Preferimos mostrar as páginas de verdade, que você vê nesta página antes de decidir."], pula: /depoimento/i },
  { peso: 9, q: ["O pagamento é seguro?", "Sim. Você paga no checkout da Cakto, com Pix ou cartão. Nós não vemos os dados do seu cartão, e o valor final aparece antes de você confirmar."], pula: /seguro\?/i },
];

/**
 * Ordem por objeção (6.18): como recebo · Pix ou cartão · reembolso · cadastro · o caso do produto · imprimir · nota · depoimentos · segurança.
 * Uma pergunta do arquivo que a fixa substitui sai (ex. "E se eu não gostar?" e o reembolso fixo não aparecem juntos).
 */
function montaFaq(faq: [string, string][]) {
  const doArquivo = faq.filter(([q]) => !FIXAS.some((f) => f.fora?.test(q)));
  const fixas = FIXAS.filter((f) => !f.pula || !faq.some(([q]) => f.pula!.test(q)));
  const peso = ([q]: [string, string]) =>
    /como recebo|recebo o|acesso/i.test(q) ? 0 : /pix|cart[ãa]o|parcel/i.test(q) ? 1 : /cadastro|aplicativo/i.test(q) ? 3
      : /imprimir/i.test(q) ? 6 : /nota fiscal/i.test(q) ? 7 : /depoimento/i.test(q) ? 8 : /seguro\?/i.test(q) ? 9 : 5;
  const todas = [...doArquivo.map((x) => [x, peso(x)] as const), ...fixas.map((f) => [f.q, f.peso] as const)];
  return todas.map(([x, w], i) => [x, w, i] as const).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(([x]) => x);
}

/** A página em 1500 px para a tela cheia, quando existe (`xixi-pag14.webp` → `xixi-pag14-1500.webp`). */
function comGrande([src, legenda]: [string, string]): [string, string, string?] {
  const grande = src.replace(/\.webp$/, "-1500.webp");
  return existsSync(path.join(process.cwd(), "public", grande)) ? [src, legenda, grande] : [src, legenda];
}

/** "**Ilusão:** … **Real:** …" → [ilusão, real]; os parágrafos da virada da linha Negócios. */
function pares(paragrafos: string[]) {
  const r = paragrafos.map((t) => t.match(/^\*\*Ilusão:\*\*\s*(.+?)\s*\*\*Real:\*\*\s*(.+)$/s));
  const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return r.every(Boolean) ? r.map((m) => [maiuscula(m![1]), maiuscula(m![2])] as [string, string]) : null;
}

/** Uma página do guia (a ficha de uma atividade), desenhada em HTML com o texto real do guia. */
function Ficha({ f }: { f: FichaExemplo }) {
  return (
    <article className="fx" aria-label={`Ficha da atividade ${f.numero}: ${f.nome}`}>
      <header className="fx-topo"><span>{f.capitulo}</span><span>Atividade {String(f.numero).padStart(2, "0")} de 100</span></header>
      <div className="fx-cab">
        <b className="fx-n">{String(f.numero).padStart(2, "0")}</b>
        <div><h3>{f.nome}</h3><p>{f.frase}</p></div>
      </div>
      <dl className="fx-rapida">
        <div><dt>Tempo médio</dt><dd>{f.tempo}</dd></div>
        <div><dt>Dificuldade</dt><dd><span className="fx-estrelas" role="img" aria-label={`${f.nivel} de 3 estrelas`}>{Array.from({ length: 3 }, (_, i) => <Star key={i} size={16} strokeWidth={1.75} className={i < f.nivel ? "on" : ""} aria-hidden />)}</span> {f.nivelNome}</dd></div>
        <div><dt>Porte</dt><dd>{f.porte}</dd></div>
        <div><dt>Idade</dt><dd>{f.idade}</dd></div>
      </dl>
      <div className="fx-ind">
        <h4>Indicadores de enriquecimento <small>de 0 a 5</small></h4>
        <ul>
          {f.indicadores.map(([nome, v]) => (
            <li key={nome}><span>{nome}</span><span className="fx-bolas" aria-label={`${v} de 5`}>{Array.from({ length: 5 }, (_, i) => <i key={i} className={i < v ? "on" : ""} />)}</span></li>
          ))}
        </ul>
      </div>
      <details className="fx-mais">
        <summary>Ver a ficha inteira</summary>
      <p className="fx-porque"><b>Por que funciona:</b> {f.porque}</p>
      <div className="fx-meio">
        <div><h4>Materiais</h4><ul>{f.materiais.map((m) => <li key={m}>{m}</li>)}</ul></div>
        <div><h4>Passo a passo</h4><ol>{f.passos.map((m) => <li key={m}>{m}</li>)}</ol></div>
      </div>
      <div className="fx-var"><p><b><ArrowDown size={16} strokeWidth={2} aria-hidden />Mais fácil</b>{f.facil}</p><p><b><ArrowUp size={16} strokeWidth={2} aria-hidden />Mais difícil</b>{f.dificil}</p></div>
      <p className="fx-cuid"><b>Cuidado:</b> {f.cuidado}</p>
      <div className="fx-dica"><Image src="/mozart/sorrindo-112.webp" alt="" width={48} height={48} /><p><b>Dica do Mozart</b>{f.dica}</p></div>
      <footer className="fx-rodape">
        <p><b>Combina com</b> {f.combina.join(" · ")}</p>
        <p className="fx-diario">
          <span>Já fizemos <i aria-hidden>{Array.from({ length: 5 }, (_, i) => <Square key={i} size={16} strokeWidth={1.75} />)}</i></span>
          <span>Ele gostou <i aria-hidden>{Array.from({ length: 5 }, (_, i) => <Heart key={i} size={16} strokeWidth={1.75} />)}</i></span>
        </p>
      </footer>
      </details>
    </article>
  );
}

/** Número que sobe ao entrar na tela (8.2). O valor real fica para leitores de tela; o desenho é só visual. */
function Numero({ n, rotulo }: { n: string; rotulo: string }) {
  const inteiro = /^\d+$/.test(n);
  return (
    <li className="rv">
      <b className="num">
        {inteiro ? (
          <><span className="sr-only">{n}</span><span className="num-v" aria-hidden="true" data-n={n} style={{ ["--alvo" as string]: n }} /></>
        ) : n}
      </b>
      <span>{rotulo}</span>
    </li>
  );
}

/** Selo da garantia (6.16): texto circular que gira devagar; no centro, o Mozart (tutores) ou o "7" (Negócios). */
function SeloGarantia({ negocios }: { negocios: boolean }) {
  return (
    <div className="selo" role="img" aria-label="Garantia de 7 dias">
      <svg className="selo-anel" viewBox="0 0 128 128" aria-hidden="true">
        <defs><path id="anel-garantia" d="M64,64 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0" /></defs>
        <text><textPath href="#anel-garantia" textLength="312" lengthAdjust="spacing">garantia de 7 dias · pix ou cartão ·</textPath></text>
      </svg>
      {negocios ? <span className="selo-7" aria-hidden>7</span> : <Image className="selo-mozart" src="/mozart/sorrindo-112.webp" alt="" width={56} height={56} />}
    </div>
  );
}

export default function PaginaVendas({ c, p }: { c: Conteudo; p: Produto }) {
  const ofertas = p.ofertas;
  const offer = (v: number, checkout: string, nome?: string) => ({
    "@type": "Offer",
    ...(nome ? { name: nome } : {}),
    price: v.toFixed(2),
    priceCurrency: "BRL",
    availability: checkout && p.lancado ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
    url: `${SITE_URL}${urlProduto(p)}`,
  });
  const produtoLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nome,
    description: c.seo.descricao,
    image: p.capa ? `${SITE_URL}${p.capa}` : undefined,
    brand: { "@type": "Brand", name: "Maestro Pet" },
    // Produto ainda não lançado não publica preço nem disponibilidade: não há checkout.
    ...(p.lancado ? { offers: ofertas ? ofertas.map((o) => offer(o.preco, o.checkout, o.nome)) : offer(p.preco, p.checkout) } : {}),
  };
  const item = c.item ?? "o guia";
  const feminino = item.startsWith("a ");
  const nomeItem = item.replace(/^(o|a) /, "");
  /** "o guia" → "do guia", "a carteira" → "da carteira". */
  const doItem = `d${item}`;
  const esteItem = `${feminino ? "esta" : "este"} ${nomeItem}`;
  const negocios = linhaDe(p) === "negocios";
  const lancado = p.lancado;
  const familia = daFamilia(p, 2);
  const fatos = c.hero.fatos ?? c.hero.eyebrow.split(" · ");
  const paginas = c.recebe.paginas.map(comGrande);
  const textoCompra = `Quero ${item} por ${preco(p.preco)}`;
  const faq = montaFaq(c.faq);
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
  const meioFaq = Math.ceil(faq.length / 2);
  const ilusao = negocios ? pares(c.virada.paragrafos) : null;
  const imagemMetodo = c.metodo.imagem ?? (negocios ? c.virada.imagem : undefined);
  const altMetodo = c.metodo.imagem ? c.metodo.alt ?? "" : c.virada.alt;
  const [frase1, ...outras] = c.dores.frases;
  const passos = c.metodo.passos;

  return (
    <div className="com-barra venda" data-sem-rv>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(produtoLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <VerProduto nome={p.nome} preco={p.preco} />

      {/* 1 · Dobra */}
      <section className={`dobra${c.hero.foto ? " dobra-com-foto" : ""}`}>
        <div className="container dobra-grid">
          <div className="dobra-texto">
            <ul className="fatos">{fatos.map((f) => <li key={f}>{f}</li>)}</ul>
            <h1>{c.hero.antes}<em>{c.hero.destaque}</em>{c.hero.depois}</h1>
            <p className="lead">{c.hero.lead}</p>
            {lancado && ofertas && <p className="dobra-planos">{ofertas.map((o) => `${o.nome} ${preco(o.preco)}`).join(" · ")} · pagamento único</p>}
            {lancado && <LinhaPagamento />}
            {!lancado ? (
              <a className="btn btn-secundario btn-largo" href="#dentro">Ver o que vem n{item}<Seta /></a>
            ) : ofertas ? (
              <a className="btn btn-largo" id="cta-dobra" href="#oferta">Ver os {ofertas.length} planos<Seta /></a>
            ) : (
              <Comprar produto={p} texto={textoCompra} origem="dobra" id="cta-dobra" className="btn-largo" />
            )}
            {lancado ? <Risco /> : (
              <div className="dobra-breve" id="cta-dobra">
                <p>Lançamento em breve. Deixe o e-mail e avisamos no dia.</p>
                <AviseMe produto={p.nome} origem="dobra" />
              </div>
            )}
            {lancado && paginas.length > 0 && <a className="btn-link" href="#dentro">Ver {paginas.length} {paginas.length > 1 ? "páginas" : "página"} {doItem}</a>}
          </div>
          {c.hero.foto ? (
            <figure className="dobra-foto">
              <Image className="dobra-foto-img" src={c.hero.foto[0]} alt={c.hero.foto[1]} width={1040} height={1300} priority sizes="(max-width: 899px) 100vw, 540px" />
              {p.capa && <Image className="dobra-foto-capa" src={p.capa} alt={`Capa: ${p.nome}`} width={300} height={424} sizes="(max-width: 899px) 28vw, 150px" />}
            </figure>
          ) : p.capa && <Palco capa={p.capa} alt={`Capa: ${p.nome}`} assinatura={!negocios} />}
        </div>
        <div className="container"><FaixaProva negocios={negocios} breve={!lancado} /></div>
      </section>

      {/* 3 · Por dentro */}
      {paginas.length > 0 && (
        <section className="secao dentro-sec" id="dentro">
          <div className="container">
            <div className="cab cab-lado rv">
              <div><span className="rotulo">Por dentro</span><h2>Páginas de verdade, <em>do PDF que você recebe.</em></h2></div>
              <p>Abra uma página para ver em tela cheia. É a prova que não exige confiar em ninguém.</p>
            </div>
            <Amostras paginas={paginas} trilho />
          </div>
        </section>
      )}

      {/* 3b · Uma página inteira (ficha) */}
      {c.ficha && (
        <section className="secao bloco-suave" id="comece">
          <div className="container">
            <div className="cab rv">
              <span className="rotulo">{c.ficha.eyebrow}</span>
              <h2><Titulo t={c.ficha.titulo} /></h2>
              <p>{c.ficha.lead}</p>
            </div>
            <div className="fx-grid">
              <div className="moldura moldura-ficha rv"><Ficha f={c.ficha} /></div>
              <div className="fx-lado rv">
                <h3>O que vem em cada página</h3>
                <ol className="fx-legenda">{c.ficha.legenda.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ol>
                {c.ficha.nota && <p className="fx-nota">{c.ficha.nota}</p>}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4 · O que vem */}
      <section className="secao vem-sec" id="conteudo">
        <div className="container">
          <div className="cab rv">
            <span className="rotulo">O que vem n{item}</span>
            <h2><Titulo t={c.recebe.titulo} /></h2>
          </div>
          {c.numeros && c.numeros.length > 0 && (
            <ul className={`numeros numeros-${c.numeros.length}`}>{c.numeros.slice(0, 3).map(([n, r]) => <Numero key={r} n={n} rotulo={r} />)}</ul>
          )}
          <ol className="capitulos">
            {c.recebe.itens.map(([t, d, pg], i) => (
              <li key={t} className="rv">
                <span className="cap-n" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                <b>{t}</b>
                {pg ? <span className="cap-p">p. {pg}</span> : <span className="cap-p" />}
                <p>{d}</p>
              </li>
            ))}
          </ol>
          {c.todas && (
            <ListaCompleta resumo={`Ver ${c.todas.titulo.replace(/,.*$/, "").replace(/^As /, "as ")}`}>
              <p className="todas-lead">{c.todas.lead}</p>
              <div className="todas">
                {c.todas.grupos.map(([g, itens], i) => (
                  <div key={g} className="todas-grupo">
                    <h3><small>Capítulo {i + 1}</small>{g}</h3>
                    <ul>{itens.map((t) => <li key={t}><b>{t.slice(0, 2)}</b>{t.slice(3)}</li>)}</ul>
                  </div>
                ))}
              </div>
            </ListaCompleta>
          )}
        </div>
      </section>

      {/* 5 · Oferta */}
      {ofertas ? (
        <section className="secao oferta-sec" id="oferta">
          <div className="container">
            <div className="cab rv">
              <span className="rotulo">Escolha o seu plano</span>
              <h2>{p.nome}</h2>
            </div>
            <div className="planos2">
              {ofertas.map((o) => {
                const pl = c.oferta.planos?.[o.id];
                const outro = ofertas.find((x) => x !== o && !x.destaque);
                return (
                  <div key={o.id} className={`folha plano2${o.destaque ? " plano2-destaque" : ""}`}>
                    {pl?.selo && <span className="rotulo">{pl.selo}</span>}
                    <div className="plano2-capas">
                      {p.capa && <Image src={p.capa} alt="" width={240} height={340} sizes="96px" />}
                      {pl?.capas?.map((src) => <Image key={src} src={src} alt="" width={160} height={226} sizes="64px" />)}
                    </div>
                    <h3>{o.nome}</h3>
                    {pl && <p className="plano2-desc">{pl.descricao}</p>}
                    {pl && <ul className="folha-itens">{pl.itens.map((i) => <li key={i}><Check size={18} strokeWidth={2.25} aria-hidden />{i}</li>)}</ul>}
                    {lancado && (
                      <>
                        <div className="folha-preco"><span className="rs">R$</span><strong>{valor(o.preco)}</strong><span>pagamento único<br />sem mensalidade</span></div>
                        {o.destaque && outro && <p className="plano2-dif">Só {preco(o.preco - outro.preco)} a mais que o {outro.nome}.</p>}
                        <Comprar produto={comoProduto(p, o)} texto={`Quero o ${o.nome} por ${preco(o.preco)}`} origem="oferta" className="btn-largo" />
                        <Risco resto="7 dias para pedir o dinheiro de volta" />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {lancado ? (
              <div className="planos2-cakto"><Selos /></div>
            ) : (
              <div className="folha folha-avise" id="avise">
                <h3>Lançamento em breve</h3>
                <p>Deixe o e-mail e avisamos no dia em que os dois planos abrirem.</p>
                <AviseMe produto={p.nome} origem="oferta" />
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="secao oferta-sec" id="oferta">
          <div className="container oferta-grid">
            {p.capa && (
              <div className="oferta-capa" aria-hidden>
                <Image src={p.capa} alt="" width={420} height={594} sizes="300px" />
              </div>
            )}
            <div className="oferta-lado">
              <span className="rotulo">O que você leva</span>
              <div className="folha">
                <div className="folha-cab">
                  {p.capa && <Image className="folha-capa" src={p.capa} alt="" width={128} height={181} sizes="64px" />}
                  <div><h3>{p.nome}</h3><small>{fatos.join(" · ")}</small></div>
                </div>
                <ul className="folha-itens">{c.oferta.itens.map((i) => <li key={i}><Check size={18} strokeWidth={2.25} aria-hidden />{i}</li>)}</ul>
                {lancado ? (
                  <>
                    <div className="folha-preco"><span className="rs">R$</span><strong>{valor(p.preco)}</strong><span>pagamento único<br />sem mensalidade</span></div>
                    {c.comparacao && <p className="comparacao">{c.comparacao}</p>}
                    <Comprar produto={p} texto={textoCompra} origem="oferta" className="btn-largo" />
                    <Risco resto="7 dias para pedir o dinheiro de volta" />
                    {c.oferta.complemento && <p className="complemento"><b>{negocios ? "Também disponível:" : "No checkout:"}</b> {c.oferta.complemento} É opcional.</p>}
                    <Selos />
                  </>
                ) : (
                  <div className="folha-breve" id="avise">
                    <p><b>Lançamento em breve.</b> Deixe o e-mail e avisamos no dia em que a venda abrir.</p>
                    <AviseMe produto={p.nome} origem="oferta" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 6 · Garantia */}
      {lancado && (
      <section className="secao" id="garantia">
        <div className="container garantia-grid">
          <SeloGarantia negocios={negocios} />
          <div>
            <div className="cab rv">
              <span className="rotulo">Garantia</span>
              <h2>Se não valer a pena, <em>o dinheiro volta.</em></h2>
              <p>Peça o reembolso em até 7 dias depois da compra. Devolvemos 100%, pelo mesmo meio que você pagou.</p>
            </div>
            <ol className="passos3">
              <li className="rv"><span className="passo-n" aria-hidden>1</span><b>Você pede</b><span>Em reembolso.cakto.com.br ou no nosso e-mail, até 7 dias depois da compra. Não precisa explicar o motivo.</span></li>
              <li className="rv"><span className="passo-n" aria-hidden>2</span><b>A Cakto devolve</b><span>O pedido é processado em até 24 horas, sem depender de nós.</span></li>
              <li className="rv"><span className="passo-n" aria-hidden>3</span><b>Pelo mesmo meio</b><span>No Pix costuma voltar em minutos ou horas; no cartão, o estorno segue o prazo do banco.</span></li>
            </ol>
          </div>
        </div>
      </section>
      )}

      {/* 6b · O que vem a mais no Kit (depois da garantia, para a oferta chegar antes) */}
      {c.kit && (
        <section className="secao bloco-suave kit-sec">
          <div className="container">
            <div className="cab rv">
              <span className="rotulo">{c.kit.eyebrow}</span>
              <h2><Titulo t={c.kit.titulo} /></h2>
              <p>{c.kit.texto}</p>
            </div>
            <ul className="kit-lista">
              {c.kit.itens.map((k) => (
                <li key={k.titulo} className="rv">
                  <Image src={k.imagem} alt={`Capa do guia prático ${k.titulo}`} width={192} height={272} sizes="96px" />
                  <div><h3>{k.titulo}</h3><p>{k.texto}</p></div>
                </li>
              ))}
            </ul>
            {c.kit.nota && <p className="kit-nota2">{c.kit.nota}</p>}
          </div>
        </section>
      )}

      {/* 7 · Ainda em dúvida? */}
      {negocios ? c.fontes && c.fontes.length > 0 && (
        <section className="secao fontes-sec">
          <div className="container">
            <div className="cab rv">
              <span className="rotulo">Com fonte</span>
              <h2>Três regras do ofício, <em>com a norma na mão.</em></h2>
            </div>
            <ul className="fontes-lista">
              {c.fontes.map(([termo, frase, nome, url]) => (
                <li key={termo} className="rv">
                  <b>{termo}</b>
                  <p>{frase}</p>
                  <a href={url} target="_blank" rel="noopener noreferrer">Fonte: {nome}</a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : frase1 && (
        <section className={`secao duvida-sec${c.dores.foto ? " duvida-com-foto" : ""}`}>
          <div className="container duvida-grid">
            {c.dores.foto && (
              <figure className="duvida-foto rv">
                <Image src={c.dores.foto[0]} alt={c.dores.foto[1]} width={960} height={1200} sizes="(max-width: 899px) 100vw, 520px" />
              </figure>
            )}
            <div>
              <span className="rotulo rv">Ainda em dúvida?</span>
              <h2 className="duvida-frase rv">“{frase1}”</h2>
              {outras.length > 0 && <ul className="duvida-outras">{outras.slice(0, 2).map((f) => <li key={f} className="rv">“{f}”</li>)}</ul>}
              <p className="duvida-fecho rv">Se alguma dessas é a sua semana, {esteItem} foi {feminino ? "escrita" : "escrito"} para ela.</p>
            </div>
          </div>
        </section>
      )}

      {/* 8 · Virada (tutores) ou Ilusão × real (Negócios) */}
      <section className="secao secao-escura virada-sec">
        {ilusao ? (
          <div className="container">
            <div className="cab rv">
              <span className="rotulo">{c.virada.eyebrow}</span>
              <h2><Titulo t={c.virada.titulo} /></h2>
            </div>
            <ul className="ilusao">
              {ilusao.map(([i, r]) => (
                <li key={i} className="rv">
                  <div><span className="rotulo">Ilusão</span><p><Rico texto={i} /></p></div>
                  <div><span className="rotulo">Real</span><p><Rico texto={r} /></p></div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="container virada-grid">
            {!negocios && (
              <figure className="moldura moldura-escura rv">
                <Image src={c.virada.imagem} alt={c.virada.alt} width={726} height={900} sizes="(max-width: 899px) 86vw, 420px" />
                <figcaption>Ilustração do guia</figcaption>
              </figure>
            )}
            <div>
              <div className="cab rv">
                <span className="rotulo">{c.virada.eyebrow}</span>
                <h2><Titulo t={c.virada.titulo} /></h2>
              </div>
              {c.virada.paragrafos.map((t, i) => <p key={i} className="virada-p rv"><Rico texto={t} /></p>)}
            </div>
          </div>
        )}
      </section>

      {/* 9 · O método / plano de carreira */}
      <section className="secao metodo-sec">
        <div className="container">
          <div className={`metodo-topo${imagemMetodo ? " metodo-com-fig" : ""}`}>
            <div className="cab rv">
              <span className="rotulo">{c.metodo.eyebrow}</span>
              <h2><Titulo t={c.metodo.titulo} /></h2>
            </div>
            {imagemMetodo && (
              <figure className={`moldura moldura-metodo rv${negocios && !c.metodo.imagem ? " moldura-pagina" : ""}`}>
                <Image src={imagemMetodo} alt={altMetodo} width={1100} height={negocios && !c.metodo.imagem ? 1362 : 618} sizes="(max-width: 899px) 90vw, 680px" />
                <figcaption>{negocios ? "Página do manual" : "Ilustração do guia"}</figcaption>
              </figure>
            )}
          </div>
          <Trilho total={passos.length} as="ol" className={`linha-tempo${passos.length > 7 ? " linha-tempo-longa" : ""}`} indicadorClasse="so-celular">
            {passos.map(([t, d], i) => (
              <li key={t} className="marco">
                <span className="marco-rotulo">{c.metodo.rotulo ?? "Passo"} {i + 1}</span>
                <b>{t}</b>
                <span className="marco-texto">{d}</span>
              </li>
            ))}
          </Trilho>
        </div>
      </section>

      {/* 10 · Para imprimir / ferramentas */}
      <section className="secao imprimir-sec">
        <div className="container">
          <div className="cab rv">
            <span className="rotulo">{negocios ? "Ferramentas" : "Para imprimir e aplicar"}</span>
            <h2><Titulo t={c.bonus.titulo} /></h2>
          </div>
          <ul className={`imprimir imprimir-${Math.min(c.bonus.itens.length, 4)}`}>
            {c.bonus.itens.map((b) => {
              const Icone = b.icone ? ICONES[b.icone] : FileText;
              return (
                <li key={b.titulo} className="rv">
                  <div className="imprimir-txt"><h3>{b.titulo}</h3><p>{b.texto}</p></div>
                  {b.imagem ? (
                    <span className="imprimir-mini"><Image src={b.imagem} alt="" width={192} height={272} sizes="(max-width: 899px) 96px, 140px" /></span>
                  ) : (
                    <span className="imprimir-ic"><Icone size={24} strokeWidth={1.75} aria-hidden /></span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* 11 · Quem faz / Como fazemos */}
      <QuemFaz negocios={negocios} />

      {/* 12 · É / não é */}
      <section className="secao">
        <div className="container">
          <div className="cab rv"><span className="rotulo">Para quem é</span></div>
          <div className="para-quem2">
            <div className="rv"><h3>É para você se…</h3><ul className="pq-lista">{c.paraQuem.sim.map((s) => <li key={s}><Check size={20} strokeWidth={2} aria-hidden />{s}</li>)}</ul></div>
            <div className="rv"><h3>Não é para você se…</h3><ul className="pq-lista pq-nao2">{c.paraQuem.nao.map((s) => <li key={s}><Minus size={20} strokeWidth={2} aria-hidden />{s}</li>)}</ul></div>
          </div>
        </div>
      </section>

      {/* 13 · Depois que você paga */}
      {lancado && <DepoisDaCompra item={item} />}

      {/* 14 · FAQ */}
      <section className="secao bloco-suave">
        <div className="container">
          <div className="cab rv">
            <span className="rotulo">Dúvidas</span>
            <h2>Perguntas <em>frequentes.</em></h2>
          </div>
          <div className="faq faq2">
            {[faq.slice(0, meioFaq), faq.slice(meioFaq)].map((col, k) => (
              <div key={k}>
                {col.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 15 · CTA final */}
      <section className="secao cta-final" id="cta-final">
        <div className="container cta-grid">
          <h2 className="rv"><Titulo t={c.ctaFinal} /></h2>
          <div className="cta-acao rv">
            {!lancado ? (
              <a className="btn btn-secundario btn-claro btn-largo" href="#avise">Avise-me no lançamento<Seta /></a>
            ) : ofertas ? (
              <a className="btn btn-largo" href="#oferta">Escolher meu plano<Seta /></a>
            ) : (
              <Comprar produto={p} texto={textoCompra} origem="cta-final" className="btn-largo" />
            )}
            {lancado && <Risco />}
          </div>
        </div>
      </section>

      {/* 16 · Combina com este */}
      {familia.length > 0 && (
        <section className="secao combina-sec">
          <div className="container combina-grid">
            <div className="cab rv">
              <span className="rotulo">Combina com este</span>
              <h2>Para o mesmo {negocios ? "ofício" : "cão"}, <em>o mesmo método.</em></h2>
              <p>{negocios ? "Outros manuais da linha, com as mesmas regras: fonte e data em tudo." : "Outros guias à venda, com o mesmo cuidado: reforço positivo e passo a passo ilustrado."}</p>
            </div>
            <div className="cards cards-2">{familia.map((x) => <CartaoProduto key={x.slug} p={x} />)}</div>
          </div>
        </section>
      )}

      {/* 17 · Nota educativa */}
      <aside className="container nota-edu">
        <Info size={18} strokeWidth={1.75} aria-hidden />
        <p>{c.aviso}</p>
      </aside>

      <BarraCompra produto={p} item={item} />
    </div>
  );
}
