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
  scheduled_at: string | null;
  updated_at: string;
  category: { name: string; color: string } | null;
}

/** Converte nome de usuário em e-mail interno ("Pedro Amaral" -> pedro.amaral@redacao.maestropet.com). */
function usuarioParaEmail(usuario: string): string {
  const u = usuario.trim();
  if (u.includes("@")) return u; // aceita e-mail direto também
  const slug = u
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  return `${slug}@redacao.maestropet.com`;
}

function LoginForm() {
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const { error } = await supabaseBrowser().auth.signInWithPassword({
      email: usuarioParaEmail(usuario),
      password: senha,
    });
    setEnviando(false);
    if (error) setErro("Usuário ou senha incorretos.");
  }

  return (
    <div className="admin-login">
      <Image src="/mozart/rosto.png" alt="" width={72} height={72} style={{ borderRadius: "50%", margin: "0 auto 14px" }} />
      <h1>Redação Maestro Pet</h1>
      <p className="admin-sub">Área restrita da equipe editorial.</p>
      <form onSubmit={entrar}>
        <input
          type="text" placeholder="Nome de usuário" value={usuario} required
          onChange={(e) => setUsuario(e.target.value)} autoComplete="username"
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
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "published" | "draft">("todas");

  async function carregarLista() {
    const { data } = await supabaseBrowser()
      .from("news_articles")
      .select("id, slug, title, status, is_featured, view_count, published_at, scheduled_at, updated_at, category:news_categories!category_id(name, color)")
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

  const noAr = (linhas ?? []).filter((l) => l.status === "published").length;
  const rascunhos = (linhas ?? []).filter((l) => l.status !== "published").length;

  const visiveis = (linhas ?? []).filter((l) => {
    if (filtro !== "todas" && (filtro === "published") !== (l.status === "published")) return false;
    if (busca && !l.title.toLowerCase().includes(busca.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="admin-panel">
      <header className="admin-topo">
        <div className="admin-titulo">
          <div>
            <h1>Mesa de matérias</h1>
            <span>{noAr} no ar · {rascunhos} aguardando revisão</span>
          </div>
        </div>
        <div className="admin-acoes">
          <Link href="/redacao/nova" className="btn-primary">+ Nova matéria</Link>
        </div>
      </header>

      <div className="admin-filtros">
        <input
          type="search"
          placeholder="🔎 Buscar matéria pelo título…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="admin-filtros-status">
          <button className={filtro === "todas" ? "on" : ""} onClick={() => setFiltro("todas")}>
            Todas
          </button>
          <button className={filtro === "published" ? "on" : ""} onClick={() => setFiltro("published")}>
            No ar ({noAr})
          </button>
          <button className={filtro === "draft" ? "on" : ""} onClick={() => setFiltro("draft")}>
            Rascunhos ({rascunhos})
          </button>
        </div>
      </div>

      {!linhas ? (
        <p className="admin-carregando">Carregando matérias…</p>
      ) : visiveis.length === 0 ? (
        <p className="admin-carregando">Nenhuma matéria encontrada com esses filtros.</p>
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
            {visiveis.map((l) => (
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
                  <span className={`admin-badge ${l.status === "published" ? "pub" : l.status === "scheduled" ? "agen" : "raso"}`}>
                    {l.status === "published" ? "No ar" : l.status === "scheduled" ? "🗓 Agendada" : "Rascunho"}
                  </span>
                  {l.status === "scheduled" && l.scheduled_at && (
                    <span className="admin-agen-quando">
                      {new Date(l.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </td>
                <td>{l.view_count}</td>
                <td className="admin-td-acoes">
                  <Link href={`/redacao/editar/${l.id}`}>Editar</Link>
                  <button onClick={() => alternarPublicacao(l)}>
                    {l.status === "published" ? "Despublicar" : "Publicar"}
                  </button>
                  {l.status === "published" ? (
                    <a href={`/noticias/${l.slug}`} target="_blank" rel="noreferrer">Ver ↗</a>
                  ) : (
                    <a href={`/redacao/previa/${l.id}`} target="_blank" rel="noreferrer">Prévia ↗</a>
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
