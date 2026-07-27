import ReactMarkdown, { type Components } from "react-markdown";
import AdSlot from "./ad-slot";

/**
 * Corpo da matéria com recursos editoriais de jornal:
 * **negrito**, *itálico*, ## intertítulos, > frases em destaque,
 * - listas e imagens adicionais via ![legenda](url).
 * Textos antigos (parágrafos simples) continuam renderizando igual.
 */

const componentes: Components = {
  // parágrafo que contém só uma imagem vira figura (evita <figure> dentro de <p>)
  p: ({ node, children }) => {
    const filhos = (node?.children ?? []) as { tagName?: string }[];
    const soImagem = filhos.length === 1 && filhos[0].tagName === "img";
    return soImagem ? <>{children}</> : <p>{children}</p>;
  },
  img: ({ src, alt }) => (
    <figure className="body-figure">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} loading="lazy" />
      {alt ? <figcaption>{alt}</figcaption> : null}
    </figure>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  ),
};

export default function ArticleBody({ body }: { body: string }) {
  const blocos = body.split(/\n\s*\n/).filter((b) => b.trim());
  const inicio = blocos.slice(0, 2).join("\n\n");
  const resto = blocos.slice(2).join("\n\n");

  return (
    <div className="article-body">
      <ReactMarkdown components={componentes}>{inicio}</ReactMarkdown>
      {blocos.length > 3 && <AdSlot slot="materia-meio" />}
      {resto && <ReactMarkdown components={componentes}>{resto}</ReactMarkdown>}
    </div>
  );
}
