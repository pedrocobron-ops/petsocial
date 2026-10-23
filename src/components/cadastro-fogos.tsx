"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rastrear } from "@/components/meta-pixel";

/** Ficha curta do guia grátis: grava o cadastro (via /api/cadastro) e leva direto à página de download. */
export default function CadastroFogos() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    const f = new FormData(e.currentTarget);
    const dados = { nome: f.get("nome"), email: f.get("email"), cao: f.get("cao"), site: f.get("site") };
    // Espera o cadastro ser gravado (até 8 s); se falhar, a pessoa recebe o guia mesmo assim.
    try {
      // AbortSignal.timeout não existe no Safari antigo (iOS 15 ou anterior).
      const signal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
      const r = await fetch("/api/cadastro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dados),
        signal,
      });
      if (r.ok) rastrear("Lead", { content_name: "Plano Anti-Fogos" });
    } catch {
      // segue para o download
    } finally {
      router.push("/fogos/baixar");
    }
  }

  return (
    <form className="cadastro" onSubmit={enviar}>
      <label>
        Seu nome
        <input name="nome" required autoComplete="given-name" placeholder="Como podemos te chamar?" />
      </label>
      <label>
        Seu e-mail
        <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="voce@email.com" pattern="[^\s@]+@[^\s@]+\.[^\s@]+" title="Confira o e-mail: precisa ter @ e um domínio, como nome@gmail.com" />
      </label>
      <label>
        Como se chama o seu cão? <small>(opcional)</small>
        <input name="cao" placeholder="Ex.: Mozart" />
      </label>
      {/* Campo-armadilha: pessoas não veem; robôs preenchem e o cadastro é descartado. */}
      <input name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="armadilha" />
      <button className="btn btn-lg" type="submit" disabled={enviando}>
        {enviando ? "Abrindo o seu guia…" : "Quero meu guia grátis"}
      </button>
      <p className="cadastro-lgpd">
        Seus dados ficam só com a Maestro Pet, sem spam. Você pode pedir para apagar quando quiser.{" "}
        <a href="/politica-de-privacidade">Política de privacidade</a>
      </p>
    </form>
  );
}
