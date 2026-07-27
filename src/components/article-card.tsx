import Image from "next/image";
import Link from "next/link";
import type { NewsArticle } from "@/lib/news";
import { dataLonga } from "@/lib/format";

export default function ArticleCard({ artigo }: { artigo: NewsArticle }) {
  const href = `/noticias/${artigo.slug}`;
  const cor = artigo.category?.color ?? "#f97316";

  return (
    <article className="card" style={{ ["--cat-cor" as string]: cor }}>
      {artigo.cover_url && (
        <Link href={href} className="cover" aria-hidden tabIndex={-1}>
          <Image
            src={artigo.cover_url}
            alt=""
            fill
            sizes="(max-width: 600px) 100vw, (max-width: 920px) 50vw, 33vw"
            style={{ objectFit: "cover" }}
          />
        </Link>
      )}
      <div className="card-body">
        {artigo.category && (
          <span className="kicker" style={{ color: cor }}>
            {artigo.category.name}
          </span>
        )}
        <h3><Link href={href}>{artigo.title}</Link></h3>
        {artigo.dek && <p className="dek">{artigo.dek}</p>}
        <p className="byline">{dataLonga(artigo.published_at)}</p>
      </div>
    </article>
  );
}
