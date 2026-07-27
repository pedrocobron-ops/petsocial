"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdmin } from "@/components/admin/use-admin";
import ArticleBody from "@/components/article-body";
import { dataHora, tempoDeLeitura } from "@/lib/format";
import { animalPorSlug } from "@/lib/animais";

interface Previa {
  id: string;
  title: string;
  dek: string | null;
  body: string;
  cover_url: string | null;
  cover_caption: string | null;
  author_name: string;
  status: string;
  animals: string[];
  published_at: string | null;
  category: { name: string; emoji: string; color: string } | null;
}

/** Pré-visualização de rascunho: mostra a matéria como ela vai aparecer no jornal. */
export default function PreviaPage() {
  const params = useParams<{ id: string }>();
  const { carregando, session, isAdmin } = useAdmin();
  const [artigo, setArtigo] = useState<Previa | null | "erro">(null);

  useEffect(() => {
    if (!isAdmin || !params.id) return;
    supabaseBrowser()
      .from("news_articles")
      .select("id, title, dek, body, cover_url, cover_caption, author_name, status, animals, published_at, category:news_categories!category_id(name, emoji, color)")
      .eq("id", params.id)
      .maybeSingle()
      .then(({ data }) => setArtigo((data as unknown as Previa) ?? "erro"));
  }, [isAdmin, params.id]);

  if (carregando) return <p className="admin-carregando">Carregando…</p>;
  if (!session || !isAdmin) {
    return (
      <p className="admin-carregando">
        Acesso restrito. <Link href="/redacao">Fazer login</Link>
      </p>
    );
  }
  if (artigo === null) return <p className="admin-carregando">Montando a prévia…</p>;
  if (artigo === "erro") return <p className="admin-carregando">Matéria não encontrada.</p>;

  const cor = artigo.category?.color ?? "#f97316";

  return (
    <div style={{ background: "var(--bg)" }}>
      <div className="previa-banner">
        👁 PRÉVIA {artigo.status !== "published" && "DE RASCUNHO"} — é assim que a matéria vai
        aparecer no jornal ·{" "}
        <Link href={`/redacao/editar/${artigo.id}`}>Voltar a editar</Link>
      </div>

      <article style={{ ["--cat-cor" as string]: cor, paddingBottom: 60 }}>
        <header className="article-head">
          {artigo.category && (
            <span className="kicker-chip">
              {artigo.category.emoji} {artigo.category.name}
            </span>
          )}
          <h1>{artigo.title}</h1>
          {artigo.dek && <p className="dek">{artigo.dek}</p>}
          <div className="article-meta">
            <span>Por <b>{artigo.author_name}</b></span>
            <span>{artigo.published_at ? `Publicado em ${dataHora(artigo.published_at)}` : "Ainda não publicada"}</span>
            <span>⏱ {tempoDeLeitura(artigo.body)} min de leitura</span>
          </div>
          {(artigo.animals ?? []).length > 0 && (
            <div className="chips-row">
              {artigo.animals.map((slug) => {
                const a = animalPorSlug(slug);
                return a ? <span key={slug} className="chip">{a.emoji} {a.nome}</span> : null;
              })}
            </div>
          )}
        </header>

        {artigo.cover_url && (
          <figure className="article-cover">
            <div className="frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={artigo.cover_url}
                alt={artigo.cover_caption ?? artigo.title}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            {artigo.cover_caption && <figcaption>{artigo.cover_caption}</figcaption>}
          </figure>
        )}

        <ArticleBody body={artigo.body} />
      </article>
    </div>
  );
}
