"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdmin } from "@/components/admin/use-admin";
import InstagramKit from "@/components/admin/instagram-kit";
import type { MateriaSocial } from "@/lib/instagram";

type Materia = MateriaSocial & { id: string; ig_legenda: string | null };

export default function SocialPage() {
  const params = useParams<{ id: string }>();
  const { carregando, session, isAdmin } = useAdmin();
  const [artigo, setArtigo] = useState<Materia | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    supabaseBrowser()
      .from("news_articles")
      .select(
        "id, slug, title, dek, animals, cover_url, ig_legenda, categoria:news_categories!category_id(name, color)"
      )
      .eq("id", params.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setErro(error?.message ?? "Matéria não encontrada.");
          return;
        }
        // O PostgREST devolve o embed como lista quando não consegue provar a
        // cardinalidade; normalizamos para um objeto só.
        const categoria = Array.isArray(data.categoria) ? data.categoria[0] : data.categoria;
        setArtigo({ ...data, categoria: categoria ?? null } as Materia);
      });
  }, [isAdmin, params.id]);

  if (carregando) return <p className="admin-carregando">Carregando…</p>;
  if (!session || !isAdmin) {
    return (
      <p className="admin-carregando">
        Acesso restrito. <Link href="/redacao">Fazer login</Link>
      </p>
    );
  }
  if (erro) return <p className="admin-carregando">❌ {erro}</p>;
  if (!artigo) return <p className="admin-carregando">Carregando matéria…</p>;

  return (
    <div className="admin-panel">
      <header className="admin-topo">
        <Link href="/redacao" className="btn-ghost">← Voltar</Link>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 600 }}>📷 Instagram</h1>
        <Link href={`/redacao/editar/${artigo.id}`} className="btn-ghost">
          ✏️ Editar matéria
        </Link>
      </header>

      <p className="editor-dica" style={{ marginBottom: 18 }}>
        Artes geradas a partir da capa e do título desta matéria. Se você trocar
        a foto ou o título, volte aqui e baixe de novo.
      </p>

      <InstagramKit artigo={artigo} />
    </div>
  );
}
