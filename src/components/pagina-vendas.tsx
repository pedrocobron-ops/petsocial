import Image from "next/image";
import BarraCompra from "@/components/barra-compra";
import Comprar from "@/components/comprar";
import type { Produto } from "@/lib/produtos";
import { reais } from "@/lib/produtos";
import type { PaginaVendas as Conteudo } from "@/lib/vendas/tipos";

/** Converte **negrito** do conteúdo em <b>. */
function Rico({ texto }: { texto: string }) {
  return <>{texto.split(/(\*\*[^*]+\*\*)/g).map((t, i) => (t.startsWith("**") ? <b key={i}>{t.slice(2, -2)}</b> : t))}</>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

export default function PaginaVendas({ c, p }: { c: Conteudo; p: Produto }) {
  const produtoLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.nome,
    description: c.seo.descricao,
    image: p.capa ? `${SITE_URL}${p.capa}` : undefined,
    brand: { "@type": "Brand", name: "Maestro Pet" },
    offers: {
      "@type": "Offer",
      price: p.preco.toFixed(2),
      priceCurrency: "BRL",
      availability: p.checkout ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      url: `${SITE_URL}/${p.slug}`,
    },
  };
  return (
    <div className="com-barra">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(produtoLd) }} />
      <div className="progresso" aria-hidden />
      <section className="lp-hero">
        <div className="container lp-hero-grid">
          <div>
            <span className="eyebrow">{c.hero.eyebrow}</span>
            <h1>{c.hero.antes}<em>{c.hero.destaque}</em>{c.hero.depois}</h1>
            <p className="lead">{c.hero.lead}</p>
            <div className="hero-ctas">
              <a className="btn btn-lg" href="#oferta">Quero o guia por {reais(p.preco)}</a>
            </div>
            <ul className="selos">{c.hero.selos.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
          {p.capa && (
            <div className="mockup">
              <div className="livro">
                <Image src={p.capa} alt={`Capa do guia ${p.nome}`} width={420} height={594} priority />
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

      <section className="secao">
        <div className="container">
          <span className="eyebrow">O que tem no guia</span>
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
          <div className="dias" style={{ ["--cols" as string]: Math.min(c.metodo.passos.length, 7) }}>
            {c.metodo.passos.map(([t, d], i) => (
              <div key={t} className="dia"><small>Passo</small><b>{i + 1}</b><strong>{t}</strong><span>{d}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container">
          <span className="eyebrow">Incluído no guia</span>
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

      <section className="secao secao-creme">
        <div className="container para-quem">
          <div className="pq pq-sim"><h3>É para você se…</h3><ul>{c.paraQuem.sim.map((s) => <li key={s}>{s}</li>)}</ul></div>
          <div className="pq pq-nao"><h3>Não é para você se…</h3><ul>{c.paraQuem.nao.map((s) => <li key={s}>{s}</li>)}</ul></div>
        </div>
      </section>

      <section className="secao oferta-sec" id="oferta">
        <div className="container oferta">
          {p.capa && (
            <div className="oferta-mockup">
              <div className="livro"><Image src={p.capa} alt="" width={360} height={509} loading="eager" /></div>
            </div>
          )}
          <div className="oferta-box">
            <span className="eyebrow">Oferta de lançamento</span>
            <h2>{p.nome}</h2>
            <ul className="oferta-itens">{c.oferta.itens.map((i) => <li key={i}>{i}</li>)}</ul>
            <div className="preco">
              <s>De {reais(p.precoDe)}</s>
              <strong>{reais(p.preco)}</strong>
              <small>pagamento único · Pix ou cartão</small>
            </div>
            {c.oferta.complemento && <p className="complemento"><b>No checkout:</b> {c.oferta.complemento}</p>}
            <Comprar produto={p} texto="Quero o guia agora" grande />
            <p className="seguro">Pagamento seguro processado pela Cakto · acesso enviado por e-mail</p>
          </div>
        </div>
      </section>

      <section className="secao">
        <div className="container garantia">
          <Image src="/mozart/medalha.webp" alt="Selo de garantia" width={200} height={200} />
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
          <a className="btn btn-lg" href="#oferta">Quero o guia por {reais(p.preco)}</a>
          <p className="aviso">{c.aviso}</p>
        </div>
      </section>

      <BarraCompra nome={p.nome} preco={reais(p.preco)} />
    </div>
  );
}
