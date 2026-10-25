import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import BarraCompra from "@/components/barra-compra";
import Comprar from "@/components/comprar";
import { VerProduto } from "@/components/meta-pixel";
import type { Produto } from "@/lib/produtos";
import { comoProduto, daFamilia, linhaDe, reais, urlProduto } from "@/lib/produtos";
import type { PaginaVendas as Conteudo, FichaExemplo } from "@/lib/vendas/tipos";

/** Converte **negrito** do conteúdo em <b>. */
function Rico({ texto }: { texto: string }) {
  return <>{texto.split(/(\*\*[^*]+\*\*)/g).map((t, i) => (t.startsWith("**") ? <b key={i}>{t.slice(2, -2)}</b> : t))}</>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

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
        <div><dt>Dificuldade</dt><dd><span className="fx-estrelas" aria-label={`${f.nivel} de 3 estrelas`}>{"★".repeat(f.nivel)}<i>{"★".repeat(3 - f.nivel)}</i></span> {f.nivelNome}</dd></div>
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
      <p className="fx-porque"><b>Por que funciona:</b> {f.porque}</p>
      <div className="fx-meio">
        <div><h4>Materiais</h4><ul>{f.materiais.map((m) => <li key={m}>{m}</li>)}</ul></div>
        <div><h4>Passo a passo</h4><ol>{f.passos.map((m) => <li key={m}>{m}</li>)}</ol></div>
      </div>
      <div className="fx-var"><p><b>↓ Mais fácil</b>{f.facil}</p><p><b>↑ Mais difícil</b>{f.dificil}</p></div>
      <p className="fx-cuid"><b>Cuidado:</b> {f.cuidado}</p>
      <div className="fx-dica"><Image src="/mozart/rosto.png" alt="" width={48} height={48} /><p><b>Dica do Mozart</b>{f.dica}</p></div>
      <footer className="fx-rodape">
        <p><b>Combina com</b> {f.combina.join(" · ")}</p>
        <p className="fx-diario"><span>Já fizemos <i>□□□□□</i></span><span>Ele gostou <i>♡♡♡♡♡</i></span></p>
      </footer>
    </article>
  );
}

export default function PaginaVendas({ c, p }: { c: Conteudo; p: Produto }) {
  const ofertas = p.ofertas;
  const offer = (preco: number, checkout: string, nome?: string) => ({
    "@type": "Offer",
    ...(nome ? { name: nome } : {}),
    price: preco.toFixed(2),
    priceCurrency: "BRL",
    availability: checkout ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
    url: `${SITE_URL}${urlProduto(p)}`,
  });
  const produtoLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nome,
    description: c.seo.descricao,
    image: p.capa ? `${SITE_URL}${p.capa}` : undefined,
    brand: { "@type": "Brand", name: "Maestro Pet" },
    offers: ofertas ? ofertas.map((o) => offer(o.preco, o.checkout, o.nome)) : offer(p.preco, p.checkout),
  };
  const item = c.item ?? "o guia";
  /** "o guia" → "no guia", "a carteira" → "na carteira". */
  const noItem = `n${item.slice(1)}`;
  const negocios = linhaDe(p) === "negocios";
  const familia = daFamilia(p);
  const ctaTopo = ofertas ? `Quero ${item}` : `Quero ${item} por ${reais(p.preco)}`;
  const passos = c.metodo.passos.length;
  return (
    <div className="com-barra">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(produtoLd) }} />
      <div className="progresso" aria-hidden />
      <VerProduto nome={p.nome} preco={p.preco} />
      <section className="lp-hero">
        <div className="container lp-hero-grid">
          <div>
            <span className="eyebrow">{c.hero.eyebrow}</span>
            <h1>{c.hero.antes}<em>{c.hero.destaque}</em>{c.hero.depois}</h1>
            <p className="lead">{c.hero.lead}</p>
            <div className="hero-ctas">
              <a className="btn btn-lg" href="#oferta">{ctaTopo}</a>
              {c.hero.secundario && <a className="btn btn-ghost btn-lg" href={c.hero.secundario[1]}>{c.hero.secundario[0]}</a>}
            </div>
            {ofertas && <p className="hero-precos">{ofertas.map((o) => `${o.nome} ${reais(o.preco)}`).join(" · ")} · pagamento único</p>}
            <ul className="selos">{c.hero.selos.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          {p.capa && (
            <div className="mockup">
              <div className="livro">
                <Image src={p.capa} alt={`Capa: ${p.nome}`} width={420} height={594} priority />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <span className="eyebrow">Você se identifica?</span>
          <h2>{c.dores.titulo}</h2>
          <div className="dores">{c.dores.frases.map((d) => <blockquote key={d}>“{d}”</blockquote>)}</div>
        </div>
      </section>

      <section className="secao secao-escura">
        <div className="container virada">
          <Image className="virada-art" src={c.virada.imagem} alt={c.virada.alt} width={330} height={409} />
          <div>
            <span className="eyebrow">{c.virada.eyebrow}</span>
            <h2>{c.virada.titulo}</h2>
            {c.virada.paragrafos.map((t, i) => <p key={i}><Rico texto={t} /></p>)}
          </div>
        </div>
      </section>

      {c.ficha && (
        <section className="secao secao-creme" id="comece">
          <div className="container">
            <span className="eyebrow">{c.ficha.eyebrow}</span>
            <h2>{c.ficha.titulo}</h2>
            <p className="lead fx-lead">{c.ficha.lead}</p>
            <div className="fx-grid">
              <Ficha f={c.ficha} />
              <div className="fx-lado">
                <h3>O que vem em cada página</h3>
                <ol className="fx-legenda">{c.ficha.legenda.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ol>
                {c.ficha.nota && <p className="fx-nota">{c.ficha.nota}</p>}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="secao">
        <div className="container">
          <span className="eyebrow">O que tem {noItem}</span>
          <h2>{c.recebe.titulo}</h2>
          <div className="recebe">
            <ol>{c.recebe.itens.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}</ol>
            <div className="paginas">
              {c.recebe.paginas.map(([src, alt]) => <Image key={src} src={src} alt={alt} width={300} height={424} />)}
            </div>
          </div>
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container">
          <span className="eyebrow">{c.metodo.eyebrow}</span>
          <h2>{c.metodo.titulo}</h2>
          {c.metodo.imagem && <Image className="metodo-art" src={c.metodo.imagem} alt={c.metodo.alt ?? ""} width={1100} height={618} />}
          <div className="dias" style={{ ["--cols" as string]: passos > 7 ? Math.ceil(passos / 2) : passos }}>
            {c.metodo.passos.map(([t, d], i) => (
              <div key={t} className="dia"><small>{c.metodo.rotulo ?? "Passo"}</small><b>{i + 1}</b><strong>{t}</strong><span>{d}</span></div>
            ))}
          </div>
        </div>
      </section>

      {c.todas && (
        <section id="todas" className="secao">
          <div className="container">
            <span className="eyebrow">{c.todas.eyebrow}</span>
            <h2>{c.todas.titulo}</h2>
            <p className="lead">{c.todas.lead}</p>
            <div className="todas">
              {c.todas.grupos.map(([g, itens], i) => (
                <div key={g} className="todas-grupo">
                  <h3><small>Capítulo {i + 1}</small>{g}</h3>
                  <ul>{itens.map((t) => <li key={t}><b>{t.slice(0, 2)}</b>{t.slice(3)}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="secao">
        <div className="container">
          <span className="eyebrow">Incluído {noItem}</span>
          <h2>{c.bonus.titulo}</h2>
          <div className="bonus">
            {c.bonus.itens.map((b) => (
              <div key={b.titulo} className="bonus-card">
                {b.imagem ? <Image src={b.imagem} alt="" width={220} height={300} /> : <div className="bonus-icone">{b.icone}</div>}
                <div><h3>{b.titulo}</h3><p>{b.texto}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {c.kit && (
        <section className="secao secao-escura">
          <div className="container">
            <span className="eyebrow">{c.kit.eyebrow}</span>
            <h2>{c.kit.titulo}</h2>
            <p className="kit-texto">{c.kit.texto}</p>
            <div className="kit">
              {c.kit.itens.map((k) => (
                <div key={k.titulo} className="kit-card">
                  <Image src={k.imagem} alt={`Capa do guia prático ${k.titulo}`} width={260} height={368} />
                  <div><h3>{k.titulo}</h3><p>{k.texto}</p></div>
                </div>
              ))}
            </div>
            {c.kit.nota && <p className="kit-nota">{c.kit.nota}</p>}
          </div>
        </section>
      )}

      <section className="secao secao-creme">
        <div className="container para-quem">
          <div className="pq pq-sim"><h3>É para você se…</h3><ul>{c.paraQuem.sim.map((s) => <li key={s}>{s}</li>)}</ul></div>
          <div className="pq pq-nao"><h3>Não é para você se…</h3><ul>{c.paraQuem.nao.map((s) => <li key={s}>{s}</li>)}</ul></div>
        </div>
      </section>

      {ofertas ? (
        <section className="secao oferta-sec" id="oferta">
          <div className="container oferta-planos">
            <span className="eyebrow">Escolha o seu plano</span>
            <h2>{p.nome}</h2>
            <div className="planos">
              {ofertas.map((o) => {
                const pl = c.oferta.planos?.[o.id];
                const outro = ofertas.find((x) => !x.destaque);
                return (
                  <div key={o.id} className={`plano${o.destaque ? " plano-destaque" : ""}`}>
                    {pl?.selo && <span className="plano-selo">{pl.selo}</span>}
                    <div className="plano-capas">
                      {p.capa && <Image src={p.capa} alt="" width={120} height={170} />}
                      {pl?.capas?.map((src) => <Image key={src} src={src} alt="" width={80} height={113} />)}
                    </div>
                    <h3>{o.nome}</h3>
                    {pl && <p className="plano-desc">{pl.descricao}</p>}
                    {pl && <ul className="oferta-itens">{pl.itens.map((i) => <li key={i}>{i}</li>)}</ul>}
                    <div className="preco">
                      <strong>{reais(o.preco)}</strong>
                      <small>pagamento único · Pix ou cartão</small>
                    </div>
                    {o.destaque && outro && outro !== o && <p className="plano-dif">Só {reais(o.preco - outro.preco)} a mais que o {outro.nome}.</p>}
                    <Comprar produto={comoProduto(p, o)} texto={`Quero o ${o.nome}`} grande />
                  </div>
                );
              })}
            </div>
            <p className="seguro">Pagamento seguro processado pela Cakto · material digital, com acesso enviado para o seu e-mail</p>
          </div>
        </section>
      ) : (
      <section className="secao oferta-sec" id="oferta">
        <div className="container oferta">
          {p.capa && (
            <div className="oferta-mockup">
              <div className="livro"><Image src={p.capa} alt="" width={360} height={509} loading="eager" /></div>
            </div>
          )}
          <div className="oferta-box">
            <span className="eyebrow">O que você leva</span>
            <h2>{p.nome}</h2>
            <ul className="oferta-itens">{c.oferta.itens.map((i) => <li key={i}>{i}</li>)}</ul>
            <div className="preco">
              {p.precoDe && <s>De {reais(p.precoDe)}</s>}
              <strong>{reais(p.preco)}</strong>
              <small>pagamento único · Pix ou cartão</small>
            </div>
            {c.oferta.complemento && <p className="complemento"><b>{negocios ? "Também disponível:" : "No checkout:"}</b> {c.oferta.complemento}</p>}
            <Comprar produto={p} texto={`Quero ${item} agora`} grande />
            <p className="seguro">Pagamento seguro processado pela Cakto · acesso enviado por e-mail</p>
          </div>
        </div>
      </section>
      )}

      <section className="secao">
        <div className="container garantia">
          {negocios ? <span className="garantia-selo" aria-hidden><ShieldCheck size={96} /></span> : <Image src="/mozart/medalha.webp" alt="Selo de garantia" width={200} height={200} />}
          <div><h2>Garantia incondicional de 7 dias</h2><p>{c.garantia}</p></div>
        </div>
      </section>

      <section className="secao secao-creme">
        <div className="container faq">
          <span className="eyebrow">Dúvidas</span>
          <h2>Perguntas frequentes</h2>
          {c.faq.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </section>

      <section className="secao cta-final">
        <div className="container">
          <h2>{c.ctaFinal}</h2>
          <a className="btn btn-lg" href="#oferta">{ofertas ? "Escolher meu plano" : `Quero ${item} por ${reais(p.preco)}`}</a>
          <p className="aviso">{c.aviso}</p>
        </div>
      </section>

      {familia.length > 0 && (
        <section className="secao secao-creme">
          <div className="container">
            <span className="eyebrow">{negocios ? "Também da Maestro Pet Negócios" : "Também do Maestro Pet"}</span>
            <h2>Combina com este</h2>
            <div className="familia">
              {familia.map((x) => (
                <Link key={x.slug} href={urlProduto(x)} className="familia-card">
                  {x.capa && <Image src={x.capa} alt="" width={120} height={170} />}
                  <div><b>{x.nome}</b><span>{x.chamada}</span><em>{reais(x.preco)}</em></div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <BarraCompra produto={p} />
    </div>
  );
}
