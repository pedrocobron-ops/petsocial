import Image from "next/image";
import Link from "next/link";
import type { Produto } from "@/lib/produtos";
import { linhaDe, reais, urlProduto } from "@/lib/produtos";

/**
 * Cartão de produto (brief 20, 6.10): a capa como objeto num bloco de papel, depois nome, uma linha e preço.
 * Linha Negócios: bloco verde e capa reta. Não lançado: "Em breve" no lugar do preço (nunca apagado).
 */
export function CartaoProduto({ p }: { p: Produto }) {
  const negocios = linhaDe(p) === "negocios";
  return (
    <Link href={urlProduto(p)} className={`card${negocios ? " card-negocios" : ""}${p.lancado ? "" : " card-breve"}`}>
      <div className="card-palco">
        {p.capa && <Image src={p.capa} alt={`Capa: ${p.nome}`} width={300} height={424} sizes="(max-width: 899px) 30vw, 180px" />}
      </div>
      <h3>{p.nome}</h3>
      <p>{p.chamada}</p>
      {p.lancado ? (
        <span className="card-preco"><b>{p.ofertas && <small>a partir de </small>}{reais(p.preco)}</b> <small>pagamento único</small></span>
      ) : (
        <span className="card-preco"><small>Em breve · avise-me</small></span>
      )}
    </Link>
  );
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
        <div className="cards">{ordem.map((p) => <CartaoProduto key={p.slug} p={p} />)}</div>
      </div>
    </section>
  );
}
