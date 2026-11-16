"use client";

import { useEffect } from "react";
import { registrarErro } from "@/lib/gestao/erros-navegador";

/** Último recurso: o próprio esqueleto do site quebrou. Texto simples, sem depender do CSS do site. */
export default function ErroGeral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const naGestao = typeof location !== "undefined" && location.pathname.startsWith("/gestao");
  useEffect(() => { if (location.pathname.startsWith("/gestao")) registrarErro(error, "tela"); }, [error]);
  const botao = { padding: "12px 20px", borderRadius: 12, font: "600 1rem system-ui, sans-serif", border: "1px solid #1e3a2f", cursor: "pointer", textDecoration: "none" } as const;
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#faf7f2", color: "#1e3a2f", font: "1rem/1.5 system-ui, sans-serif" }}>
        <main role="alert" style={{ maxWidth: 420, padding: 24, textAlign: "center", display: "grid", gap: 12 }}>
          <b style={{ fontSize: "1.25rem" }}>Opa, algo travou</b>
          <p style={{ margin: 0 }}>Nada do que você já salvou se perdeu. Tente de novo em instantes.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={{ ...botao, background: "#e8743b", color: "#fff", borderColor: "#e8743b" }} onClick={() => reset()}>Tentar de novo</button>
            <a style={{ ...botao, background: "#fff", color: "#1e3a2f" }} href={naGestao ? "/gestao/app" : "/"}>{naGestao ? "Voltar para Hoje" : "Voltar ao início"}</a>
          </div>
        </main>
      </body>
    </html>
  );
}
