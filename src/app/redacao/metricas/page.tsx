"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdmin } from "@/components/admin/use-admin";

interface Metricas {
  visitas_hoje: number;
  visitas_7d: number;
  visitas_30d: number;
  visitantes_hoje: number;
  visitantes_7d: number;
  views_total: number;
  publicadas: number;
  rascunhos: number;
  paginas_top_7d: { path: string; visitas: number }[];
}

interface TopMateria {
  title: string;
  slug: string;
  view_count: number;
  status: string;
}

export default function MetricasPage() {
  const { carregando, session, isAdmin } = useAdmin();
  const [m, setM] = useState<Metricas | null>(null);
  const [top, setTop] = useState<TopMateria[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    supabaseBrowser().rpc("jornal_metricas").then(({ data }) => setM(data as Metricas));
    supabaseBrowser()
      .from("news_articles")
      .select("title, slug, view_count, status")
      .order("view_count", { ascending: false })
      .limit(10)
      .then(({ data }) => setTop((data as TopMateria[]) ?? []));
  }, [isAdmin]);

  if (carregando) return <p className="admin-carregando">Carregando…</p>;
  if (!session || !isAdmin) {
    return (
      <p className="admin-carregando">
        Acesso restrito. <Link href="/redacao">Fazer login</Link>
      </p>
    );
  }

  const cards = m
    ? [
        { rotulo: "Visitas hoje (24h)", valor: m.visitas_hoje },
        { rotulo: "Visitantes hoje", valor: m.visitantes_hoje },
        { rotulo: "Visitas 7 dias", valor: m.visitas_7d },
        { rotulo: "Visitantes 7 dias", valor: m.visitantes_7d },
        { rotulo: "Visitas 30 dias", valor: m.visitas_30d },
        { rotulo: "Leituras de matérias (total)", valor: m.views_total },
        { rotulo: "Matérias no ar", valor: m.publicadas },
        { rotulo: "Rascunhos aguardando", valor: m.rascunhos },
      ]
    : [];

  return (
    <div className="admin-panel">
      <header className="admin-topo">
        <Link href="/redacao" className="btn-ghost">← Voltar</Link>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 600 }}>📊 Métricas do Jornal</h1>
      </header>

      {!m ? (
        <p className="admin-carregando">Calculando métricas…</p>
      ) : (
        <>
          <div className="metric-grid">
            {cards.map((c) => (
              <div className="metric-card" key={c.rotulo}>
                <div className="valor">{c.valor.toLocaleString("pt-BR")}</div>
                <div className="rotulo">{c.rotulo}</div>
              </div>
            ))}
          </div>

          <h2 className="admin-secao">🏆 Matérias mais lidas</h2>
          <table className="admin-tabela">
            <thead>
              <tr><th>Matéria</th><th>Leituras</th><th>Status</th></tr>
            </thead>
            <tbody>
              {top.map((t) => (
                <tr key={t.slug}>
                  <td>
                    <a href={`/noticias/${t.slug}`} target="_blank" rel="noreferrer" className="admin-link-titulo">
                      {t.title}
                    </a>
                  </td>
                  <td>{t.view_count}</td>
                  <td>
                    <span className={`admin-badge ${t.status === "published" ? "pub" : "raso"}`}>
                      {t.status === "published" ? "No ar" : "Rascunho"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="admin-secao">📄 Páginas mais visitadas (7 dias)</h2>
          {m.paginas_top_7d.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 14.5 }}>
              Ainda sem dados — o medidor de visitas acabou de ser ligado e começa a contar a partir de agora.
            </p>
          ) : (
            <table className="admin-tabela">
              <thead><tr><th>Página</th><th>Visitas</th></tr></thead>
              <tbody>
                {m.paginas_top_7d.map((p) => (
                  <tr key={p.path}>
                    <td>{p.path}</td>
                    <td>{p.visitas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
