"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdmin, revalidarSite } from "@/components/admin/use-admin";

interface Linha {
  id: string;
  slug: string;
  title: string;
  status: string;
  is_featured: boolean;
  view_count: number;
  published_at: string | null;
  updated_at: string;
  category: { name: string; color: string } | null;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });
    setEnviando(false);
    if (error) setErro("E-mail ou senha incorretos.");
  }

  return (
    <div className="admin-login">
      <Image src="/mozart/rosto.png" alt="" width={72} height={72} style={{ borderRadius: "50%", margin: "0 auto 14px" }} />
      <h1>Redação Maestro Pet</h1>
      <p className="admin-sub">Área restrita da equipe editorial.</p>
      <form onSubmit={entrar}>
        <input
          type="email" placeholder="E-mail" value={email} required
          onChange={(e) => setEmail(e.target.value)} autoComplete="email"
        />
        <input
          type="password" placeholder="Senha" value={senha} required
          onChange={(e) => setSenha(e.target.value)} autoComplete="current-password"
        />
        {erro && <p className="admin-erro">{erro}</p>}
        <button type="submit" className="btn-primary" disabled={enviando}>
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default function RedacaoPage() {
  const { carregando, session, isAdmin } = useAdmin();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);

  async function carregarLista() {
    const { data } = await supabaseBrowser()
      .from("news_articles")
      .select("id, slug, title, status, is_featured, view_count, published_at, updated_at, category:news_categories(name, color)")
      .order("updated_at", { ascending: false })
      .limit(200);
    setLinhas((data as unknown as Linha[]) ?? []);
  }

  useEffect(() => {
    if (isAdmin) carregarLista();
  }, [isAdmin]);

  if (carregando) return <p className="admin-carregando">Carregando…</p>;
  if (!session) return <LoginForm />;

  if (!isAdmin) {
    return (
      <div className="admin-login">
        <h1>Sem permissão</h1>
        <p className="admin-sub">
          Esta conta ({session.user.email}) não é da equipe editorial.
        </p>
        <button className="btn-ghost" onClick={() => supabaseBrowser().auth.signOut()}>
          Sair
        </button>
      </div>
    );
  }

  async function alternarPublicacao(l: Linha) {
    const publicar = l.status !== "published";
    await supabaseBrowser()
      .from("news_articles")
      .update(
        publicar
          ? { status: "published", published_at: l.published_at ?? new Date().toISOString() }
          : { status: "draft" }
      )
      .eq("id", l.id);
    await revalidarSite();
    carregarLista();
  }

  return (
    <div className="admin-panel">
      <header className="admin-topo">
        <div className="admin-titulo">
          <Image src="/mozart/rosto.png" alt="" width={40} height={40} style={{ borderRadius: "50%" }} />
          <div>
            <h1>Redação</h1>
            <span>{session.user.email}</span>
          </div>
        </div>
        <div className="admin-acoes">
          <Link href="/" className="btn-ghost" target="_blank">Ver o site ↗</Link>
          <Link href="/redacao/nova" className="btn-primary">+ Nova matéria</Link>
          <button className="btn-ghost" onClick={() => supabaseBrowser().auth.signOut()}>Sair</button>
        </div>
      </header>

      {!linhas ? (
        <p className="admin-carregando">Carregando matérias…</p>
      ) : (
        <table className="admin-tabela">
          <thead>
            <tr>
              <th>Matéria</th>
              <th>Status</th>
              <th>Views</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/redacao/editar/${l.id}`} className="admin-link-titulo">
                    {l.is_featured && <span title="Em destaque">⭐ </span>}
                    {l.title}
                  </Link>
                  {l.category && (
                    <span className="admin-cat" style={{ color: l.category.color }}>
                      {l.category.name}
                    </span>
                  )}
                </td>
                <td>
                  <span className={`admin-badge ${l.status === "published" ? "pub" : "raso"}`}>
                    {l.status === "published" ? "No ar" : "Rascunho"}
                  </span>
                </td>
                <td>{l.view_count}</td>
                <td className="admin-td-acoes">
                  <Link href={`/redacao/editar/${l.id}`}>Editar</Link>
                  <button onClick={() => alternarPublicacao(l)}>
                    {l.status === "published" ? "Despublicar" : "Publicar"}
                  </button>
                  {l.status === "published" && (
                    <a href={`/noticias/${l.slug}`} target="_blank" rel="noreferrer">Ver ↗</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
