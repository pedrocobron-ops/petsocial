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
  cover_url: string | null;
  published_at: string | null;
  scheduled_at: string | null;
  updated_at: string;
  created_at: string;
  category: { name: string; color: string } | null;
}

type Aba = "revisar" | "agendadas" | "no-ar";

/** Converte nome de usuário em e-mail interno ("Pedro Amaral" -> pedro.amaral@redacao.maestropet.com). */
function usuarioParaEmail(usuario: string): string {
  const u = usuario.trim();
  if (u.includes("@")) return u;
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

function dataCurta(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function RedacaoPage() {
  const { carregando, session, isAdmin } = useAdmin();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("revisar");

  async function carregarLista() {
    const { data } = await supabaseBrowser()
      .from("news_articles")
      .select("id, slug, title, status, is_featured, view_count, cover_url, published_at, scheduled_at, updated_at, created_at, category:news_categories!category_id(name, color)")
      .order("updated_at", { ascending: false })
      .limit(300);
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

  async function publicar(l: Linha) {
    await supabaseBrowser()
      .from("news_articles")
      .update({
        status: "published",
        published_at: l.published_at ?? new Date().toISOString(),
        scheduled_at: null,
      })
      .eq("id", l.id);
    await revalidarSite(l.slug);
    carregarLista();
  }

  async function despublicar(l: Linha) {
    if (!confirm(`Tirar do ar a matéria "${l.title}"? Ela volta para a fila de revisão.`)) return;
    await supabaseBrowser()
      .from("news_articles")
      .update({ status: "draft", scheduled_at: null })
      .eq("id", l.id);
    await revalidarSite();
    carregarLista();
  }

  async function cancelarAgendamento(l: Linha) {
    await supabaseBrowser()
      .from("news_articles")
      .update({ status: "draft", scheduled_at: null })
      .eq("id", l.id);
    await revalidarSite();
    carregarLista();
  }

  const todas = linhas ?? [];
  const rascunhos = todas.filter((l) => l.status === "draft");
  const agendadas = todas.filter((l) => l.status === "scheduled");
  const publicadas = todas.filter((l) => l.status === "published");

  const daAba = aba === "revisar" ? rascunhos : aba === "agendadas" ? agendadas : publicadas;
  const visiveis = busca
    ? daAba.filter((l) => l.title.toLowerCase().includes(busca.toLowerCase()))
    : daAba;

  const ABAS: { id: Aba; rotulo: string; icone: string; n: number }[] = [
    { id: "revisar", rotulo: "Aguardando revisão", icone: "📥", n: rascunhos.length },
    { id: "agendadas", rotulo: "Agendadas", icone: "🗓", n: agendadas.length },
    { id: "no-ar", rotulo: "No ar", icone: "✅", n: publicadas.length },
  ];

  return (
    <div className="admin-panel">
      <header className="admin-topo">
        <div className="admin-titulo">
          <div>
            <h1>Mesa de matérias</h1>
            <span>
              {rascunhos.length} aguardando revisão · {agendadas.length} agendadas ·{" "}
              {publicadas.length} no ar
            </span>
          </div>
        </div>
        <div className="admin-acoes">
          <Link href="/redacao/nova" className="btn-primary">+ Nova matéria</Link>
        </div>
      </header>

      {/* Abas por etapa do fluxo editorial */}
      <nav className="mesa-abas" aria-label="Etapas">
        {ABAS.map((a) => (
          <button
            key={a.id}
            className={aba === a.id ? "ativa" : ""}
            onClick={() => setAba(a.id)}
          >
            <span className="ico">{a.icone}</span>
            {a.rotulo}
            <span className="cont">{a.n}</span>
          </button>
        ))}
      </nav>

      <input
        className="mesa-busca"
        type="search"
        placeholder="🔎 Buscar nesta lista pelo título…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {!linhas ? (
        <p className="admin-carregando">Carregando matérias…</p>
      ) : visiveis.length === 0 ? (
        <div className="mesa-vazia">
          {aba === "revisar" && (
            <>
              <h3>Nenhuma matéria esperando por você 🎉</h3>
              <p>Tudo revisado! A próxima leva chega amanhã às 7h.</p>
            </>
          )}
          {aba === "agendadas" && (
            <>
              <h3>Nenhuma matéria agendada</h3>
              <p>Abra uma matéria e use o painel &ldquo;Agendar publicação&rdquo; para programar a saída.</p>
            </>
          )}
          {aba === "no-ar" && (
            <>
              <h3>Nenhuma matéria publicada ainda</h3>
              <p>Revise um rascunho e clique em Publicar para ele aparecer aqui.</p>
            </>
          )}
        </div>
      ) : (
        <ul className="mesa-lista">
          {visiveis.map((l) => (
            <li key={l.id} className="mesa-item">
              <Link href={`/redacao/editar/${l.id}`} className="mesa-capa" aria-hidden tabIndex={-1}>
                {/* Sem foto, mostra a capa gerada, que é o que o leitor veria
                    hoje. A tarja avisa que ainda cabe uma fotografia ali. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.cover_url || `/api/capa/${l.slug}`} alt="" loading="lazy" />
                {!l.cover_url && <span className="capa-gerada">sem foto</span>}
              </Link>

              <div className="mesa-info">
                <div className="mesa-meta">
                  {l.category && (
                    <span className="mesa-cat" style={{ color: l.category.color }}>
                      {l.category.name}
                    </span>
                  )}
                  {l.is_featured && <span className="mesa-destaque">⭐ Manchete</span>}
                </div>
                <h3>
                  <Link href={`/redacao/editar/${l.id}`}>{l.title}</Link>
                </h3>
                <p className="mesa-datas">
                  {aba === "revisar" && (
                    <>
                      Criada em {dataCurta(l.created_at)}
                      {l.scheduled_at && (
                        <span className="mesa-sugestao">
                          💡 sugerido para {dataCurta(l.scheduled_at)}
                        </span>
                      )}
                    </>
                  )}
                  {aba === "agendadas" && (
                    <span className="agendada-quando">🗓 Sai em {dataCurta(l.scheduled_at)}</span>
                  )}
                  {aba === "no-ar" && (
                    <>
                      No ar desde {dataCurta(l.published_at)} · 👁 {l.view_count} leituras
                      {l.updated_at > (l.published_at ?? "") && (
                        <> · editada em {dataCurta(l.updated_at)}</>
                      )}
                    </>
                  )}
                </p>
              </div>

              <div className="mesa-acoes">
                <Link href={`/redacao/editar/${l.id}`} className="btn-primary">
                  {aba === "no-ar" ? "✏️ Atualizar" : "✏️ Editar"}
                </Link>

                <Link href={`/redacao/social/${l.id}`} className="btn-ghost">
                  📷 Instagram
                </Link>

                {aba === "revisar" && (
                  <>
                    <a className="btn-ghost" href={`/redacao/previa/${l.id}`} target="_blank" rel="noreferrer">👁 Prévia</a>
                    <button className="btn-ghost" onClick={() => publicar(l)}>🚀 Publicar</button>
                  </>
                )}

                {aba === "agendadas" && (
                  <>
                    <a className="btn-ghost" href={`/redacao/previa/${l.id}`} target="_blank" rel="noreferrer">👁 Prévia</a>
                    <button className="btn-ghost" onClick={() => publicar(l)}>🚀 Publicar já</button>
                    <button className="btn-ghost" onClick={() => cancelarAgendamento(l)}>Cancelar</button>
                  </>
                )}

                {aba === "no-ar" && (
                  <>
                    <a className="btn-ghost" href={`/noticias/${l.slug}`} target="_blank" rel="noreferrer">Ver no site ↗</a>
                    <button className="btn-ghost" onClick={() => despublicar(l)}>Tirar do ar</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
