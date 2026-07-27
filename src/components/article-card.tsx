import Image from "next/image";
import Link from "next/link";
import type { NewsArticle } from "@/lib/news";
import { dataLonga } from "@/lib/format";

export default function ArticleCard({ artigo }: { artigo: NewsArticle }) {
  const href = `/noticias/${artigo.slug}`;
  return (
    <article className="card">
      <Link href={href} className="cover" aria-hidden tabIndex={-1}>
        {artigo.cover_url && (
          <Image
            src={artigo.cover_url}
            alt=""
            fill
            sizes="(max-width: 580px) 100vw, (max-width: 900px) 50vw, 33vw"
            style={{ objectFit: "cover" }}
          />
        )}
      </Link>
      {artigo.category && (
        <span className="kicker" style={{ color: artigo.category.color }}>
          {artigo.category.name}
        </span>
      )}
      <h3><Link href={href}>{artigo.title}</Link></h3>
      {artigo.dek && <p className="dek">{artigo.dek}</p>}
      <p className="byline">{dataLonga(artigo.published_at)}</p>
    </article>
  );
}
