import Image from "next/image";
import Link from "next/link";
import type { Produto } from "@/lib/produtos";
import { reais, urlProduto } from "@/lib/produtos";

/** Cartão de produto das vitrines. Produto ainda não lançado aparece como "Em breve", mas abre a página (que mostra o que vem e o botão "Em breve"). */
export function CartaoProduto({ p }: { p: Produto }) {
  const card = (
    <>
      <div className="guia-capa">
        {p.capa && <Image src={p.capa} alt={`Capa: ${p.nome}`} width={300} height={424} />}
        {!p.lancado && <span className="guia-breve">Em breve</span>}
      </div>
      <div className="guia-corpo">
        <span className="guia-dor">“{p.dor}”</span>
        <h3>{p.nome}</h3>
        <p>{p.chamada}</p>
        {p.lancado ? (
          <span className="guia-preco">{p.ofertas && <small>a partir de </small>}{reais(p.preco)}</span>
        ) : (
          <span className="guia-preco muted">Lançamento em breve</span>
        )}
      </div>
    </>
  );
  return <Link href={urlProduto(p)} className={p.lancado ? "guia" : "guia guia-off"}>{card}</Link>;
}

/** Uma seção da vitrine: título, texto e os cartões. Lançados primeiro. */
export function SecaoVitrine({ id, titulo, texto, produtos }: { id: string; titulo: string; texto: string; produtos: Produto[] }) {
  if (!produtos.length) return null;
  const ordem = [...produtos].sort((a, b) => Number(b.lancado) - Number(a.lancado));
  return (
    <section className="secao vitrine-secao" id={id}>
      <div className="container">
        <h2>{titulo}</h2>
        <p className="lead">{texto}</p>
        <div className="guias">{ordem.map((p) => <CartaoProduto key={p.slug} p={p} />)}</div>
      </div>
    </section>
  );
}
