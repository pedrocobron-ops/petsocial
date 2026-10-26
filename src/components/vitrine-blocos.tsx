import Image from "next/image";
import Link from "next/link";
import AviseMe from "@/components/avise-me";
import type { Produto } from "@/lib/produtos";
import { urlProduto } from "@/lib/produtos";

/** Marquee de capas (brief 20, 6.25): o único loop da página; a cópia do trilho fica escondida dos leitores de tela. */
export function Marquee({ capas, rotulo = "Guias à venda" }: { capas: Produto[]; rotulo?: string }) {
  const lista = capas.filter((p) => p.capa);
  if (!lista.length) return null;
  return (
    <section className="marquee" aria-label={rotulo} style={{ ["--n" as string]: lista.length }}>
      <div className="marquee-trilho">
        <ul aria-label={rotulo}>
          {lista.map((p) => <li key={p.slug}><Link href={urlProduto(p)} tabIndex={-1}><Image src={p.capa!} alt={p.nome} width={140} height={198} sizes="140px" /></Link></li>)}
        </ul>
        <ul aria-hidden>
          {lista.map((p) => <li key={p.slug}><Image src={p.capa!} alt="" width={140} height={198} sizes="140px" /></li>)}
        </ul>
      </div>
    </section>
  );
}

/** Leque de capas (6.26): 3 capas lançadas a −8° / 0° / +8°, a do meio à frente. */
export function Leque({ produtos, className = "", prioridade = false }: { produtos: Produto[]; className?: string; prioridade?: boolean }) {
  return (
    <div className={`leque ${className}`.trim()} aria-hidden>
      {produtos.filter((p) => p.capa).slice(0, 3).map((p) => (
        <Image key={p.slug} src={p.capa!} alt="" width={300} height={424} sizes="(max-width: 899px) 30vw, 200px" priority={prioridade} />
      ))}
    </div>
  );
}

/**
 * "Em preparo" (6.11): um bloco único no lugar dos cards apagados. Mosaico de até 12 capas a 72 px,
 * a contagem real dos não lançados e o formulário de aviso (/api/cadastro).
 */
export function EmPreparo({ produtos, linha }: { produtos: Produto[]; linha: "tutores" | "negócios" }) {
  if (!produtos.length) return null;
  const n = produtos.length;
  return (
    <section className="secao bloco-suave preparo" id="em-preparo" aria-labelledby="preparo-titulo">
      <div className="container preparo-grid">
        <ul className="preparo-mosaico rv" aria-label={`Capas dos ${n} materiais em preparo`}>
          {produtos.filter((p) => p.capa).slice(0, 12).map((p) => (
            <li key={p.slug}><Image src={p.capa!} alt={p.nome} width={144} height={204} sizes="72px" /></li>
          ))}
        </ul>
        <div className="preparo-texto rv">
          <span className="rotulo">Em preparo</span>
          <h2 id="preparo-titulo">Mais {n} {linha === "tutores" ? "guias e kits estão sendo" : "materiais estão sendo"} <em>terminados.</em></h2>
          <p>Deixe o e-mail e avisamos no dia do lançamento. Sem spam.</p>
          <div id="avise"><AviseMe produto={`Em preparo · ${linha}`} origem="em-preparo" /></div>
        </div>
      </div>
    </section>
  );
}

/** FAQ das vitrines (6.18): rótulo e título alinhados à esquerda, 2 colunas no desktop, como nas páginas de venda. */
export function FaqVitrine({ faq, id }: { faq: [string, string][]; id?: string }) {
  const meio = Math.ceil(faq.length / 2);
  return (
    <section className="secao" id={id}>
      <div className="container">
        <div className="cab rv">
          <span className="rotulo">Dúvidas</span>
          <h2>Perguntas <em>frequentes.</em></h2>
        </div>
        <div className="faq faq2">
          {[faq.slice(0, meio), faq.slice(meio)].map((col, k) => (
            <div key={k}>{col.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
          ))}
        </div>
      </div>
    </section>
  );
}
