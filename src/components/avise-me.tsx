"use client";

import { useState } from "react";
import { rastrear } from "@/components/meta-pixel";

/**
 * "Avise-me" de produto ainda não lançado (brief 20, 7.6 e 6.11): só o e-mail, campo de 56 px,
 * gravado pelo mesmo /api/cadastro do guia grátis. Nenhum preço ao lado.
 */
export default function AviseMe({ produto, origem, escuro = false }: { produto: string; origem: string; escuro?: boolean }) {
  const [estado, setEstado] = useState<"livre" | "enviando" | "ok" | "erro">("livre");

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEstado("enviando");
    const f = new FormData(e.currentTarget);
    try {
      const signal = typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(8000) : undefined;
      const r = await fetch("/api/cadastro", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // O formulário de cadastro guarda nome, e-mail e cão: aqui o "nome" registra de qual lançamento é o aviso.
        body: JSON.stringify({ nome: `Avise-me · ${produto}`, email: f.get("email"), cao: "", site: f.get("site") }),
        signal,
      });
      if (!r.ok) throw new Error(String(r.status));
      setEstado("ok");
      rastrear("Lead", { content_name: `Avise-me · ${produto}`, content_category: origem });
    } catch {
      setEstado("erro");
    }
  }

  if (estado === "ok") {
    return <p className={`avise-ok${escuro ? " avise-escuro" : ""}`} role="status">Pronto. Avisamos no seu e-mail no dia do lançamento.</p>;
  }
  return (
    <form className={`avise${escuro ? " avise-escuro" : ""}`} onSubmit={enviar}>
      <label className="sr-only" htmlFor={`avise-${origem}`}>Seu e-mail</label>
      <div className="avise-linha">
        <input id={`avise-${origem}`} name="email" type="email" required autoComplete="email" inputMode="email" placeholder="seu@email.com" pattern="[^\s@]+@[^\s@]+\.[^\s@]+" title="Confira o e-mail: precisa ter @ e um domínio, como nome@gmail.com" />
        <button className="btn btn-secundario" type="submit" disabled={estado === "enviando"}>{estado === "enviando" ? "Enviando…" : "Avise-me"}</button>
      </div>
      <input name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="armadilha" />
      <p className="avise-lgpd">
        {estado === "erro" ? "Não deu certo agora. Tente de novo ou escreva para contato@maestropet.com. " : "Só o aviso do lançamento, sem spam. "}
        <a href="/politica-de-privacidade">Política de privacidade</a>
      </p>
    </form>
  );
}
