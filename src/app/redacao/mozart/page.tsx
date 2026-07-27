"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdmin } from "@/components/admin/use-admin";

const BASE =
  "https://aefrcwysifgniogumxwk.supabase.co/storage/v1/object/public/sponsored/mozart";

/** Galeria interna: mostra as artes numeradas do Mozart importadas do Drive
    para identificarmos qual número corresponde a cada pose. */
export default function GaleriaMozart() {
  const { carregando, session, isAdmin } = useAdmin();
  const [arquivos, setArquivos] = useState<string[] | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    supabaseBrowser()
      .storage.from("sponsored")
      .list("mozart", { limit: 40 })
      .then(({ data }) => {
        const nomes = (data ?? [])
          .map((f) => f.name)
          .filter((n) => /\.(png|jpe?g|webp)$/i.test(n))
          .sort((a, b) => parseInt(a) - parseInt(b));
        setArquivos(nomes);
      });
  }, [isAdmin]);

  if (carregando) return <p className="admin-carregando">Carregando…</p>;
  if (!session || !isAdmin) {
    return (
      <p className="admin-carregando">
        Acesso restrito. <Link href="/redacao">Fazer login</Link>
      </p>
    );
  }

  return (
    <div className="admin-panel">
      <header className="admin-topo">
        <Link href="/redacao" className="btn-ghost">← Voltar</Link>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 600 }}>
          🐶 Galeria do Mozart
        </h1>
      </header>

      <p style={{ marginBottom: 20, color: "var(--muted)", fontSize: 14.5 }}>
        Estas são as artes importadas do seu Drive. Me diga no chat qual número
        corresponde a cada pose (ex.: &ldquo;a 3 é o Mozart acenando, a 7 é ele
        dormindo&rdquo;) que eu aplico nos lugares certos do site.
      </p>

      {!arquivos ? (
        <p className="admin-carregando">Carregando artes…</p>
      ) : arquivos.length === 0 ? (
        <p className="admin-carregando">
          Nenhuma arte encontrada ainda — a importação pode estar em andamento.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          {arquivos.map((nome) => (
            <figure
              key={nome}
              style={{
                background: "#fff",
                border: "1px solid var(--hairline)",
                borderRadius: 10,
                overflow: "hidden",
                textAlign: "center",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${BASE}/${nome}`}
                alt={nome}
                style={{ width: "100%", aspectRatio: "1", objectFit: "contain", background: "#FFFBF5" }}
                loading="lazy"
              />
              <figcaption style={{ padding: "8px 0", fontWeight: 800, fontSize: 18 }}>
                Nº {parseInt(nome)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
