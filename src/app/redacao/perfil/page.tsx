"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdmin, revalidarSite } from "@/components/admin/use-admin";
import { AUTORES, urlFotoAutor } from "@/lib/autores";

/** Perfil do autor: foto que aparece na página /autor/[slug] e na assinatura. */
export default function PerfilPage() {
  const { carregando, session, isAdmin } = useAdmin();
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");
  const [versao, setVersao] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const autor = AUTORES[0];

  if (carregando) return <p className="admin-carregando">Carregando…</p>;
  if (!session || !isAdmin) {
    return (
      <p className="admin-carregando">
        Acesso restrito. <Link href="/redacao">Fazer login</Link>
      </p>
    );
  }

  async function subir(arquivo: File) {
    setEnviando(true);
    setMsg("");
    const { error } = await supabaseBrowser()
      .storage.from("sponsored")
      .upload(`autores/${autor.slug}.jpg`, arquivo, {
        contentType: arquivo.type || "image/jpeg",
        cacheControl: "300",
        upsert: true,
      });
    setEnviando(false);
    if (error) {
      setMsg("❌ Não consegui subir: " + error.message);
      return;
    }
    await revalidarSite();
    setVersao((v) => v + 1);
    setMsg("✅ Foto atualizada! Ela já aparece na sua página de autor.");
  }

  return (
    <div className="admin-panel">
      <header className="admin-topo">
        <Link href="/redacao" className="btn-ghost">← Voltar</Link>
        <h1 style={{ fontFamily: "var(--display)", fontWeight: 600 }}>👤 Meu perfil</h1>
      </header>

      <div className="perfil-grid">
        <div className="perfil-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={versao}
            src={`${urlFotoAutor(autor.slug)}?v=${versao}`}
            alt="Foto atual do autor"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="perfil-vazio">Sem foto ainda</span>
        </div>

        <div>
          <h2 className="admin-secao" style={{ marginTop: 0 }}>{autor.nome}</h2>
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 4 }}>{autor.cargo}</p>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, marginBottom: 18 }}>{autor.bio}</p>

          <button
            className="btn-primary"
            disabled={enviando}
            onClick={() => fileRef.current?.click()}
          >
            {enviando ? "Enviando…" : "📤 Escolher foto do computador"}
          </button>
          <input
            ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) subir(f); e.target.value = ""; }}
          />

          {msg && <p className="admin-msg" style={{ marginTop: 16 }}>{msg}</p>}

          <p className="editor-dica" style={{ marginTop: 16 }}>
            Dica: use uma foto em que o seu rosto apareça bem. A imagem é
            recortada em círculo, então prefira algo com o rosto centralizado.
            Foto real do autor conta ponto na avaliação do Google.
          </p>

          <p style={{ marginTop: 18 }}>
            <a href={`/autor/${autor.slug}`} target="_blank" rel="noreferrer" className="btn-ghost">
              Ver minha página de autor ↗
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
