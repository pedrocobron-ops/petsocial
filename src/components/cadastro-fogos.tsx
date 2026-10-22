"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { rastrear } from "@/components/meta-pixel";

/** Formulário do Google que recebe os cadastros (as respostas caem numa planilha da conta da Maestro Pet). */
const FORM = "https://docs.google.com/forms/d/e/1FAIpQLScbh_y1nrAZbee81OOUGP_0tKXQ2l41ri0Tqu7Yb-6hs6cGAg/formResponse";
const CAMPOS = { nome: "entry.1743077274", email: "entry.514587458", cao: "entry.126728612" };

/** Ficha curta do e-book grátis: envia para o formulário e leva direto à página de download. */
export default function CadastroFogos() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    const f = new FormData(e.currentTarget);
    const dados = new URLSearchParams();
    for (const [campo, entrada] of Object.entries(CAMPOS)) dados.append(entrada, String(f.get(campo) ?? "").trim());
    // sendBeacon continua o envio mesmo depois que a página muda; o fetch é a reserva.
    const foi = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(FORM, dados);
    if (!foi) fetch(FORM, { method: "POST", mode: "no-cors", body: dados, keepalive: true }).catch(() => {});
    rastrear("Lead", { content_name: "Plano Anti-Fogos" });
    router.push("/fogos/baixar");
  }

  return (
    <form className="cadastro" onSubmit={enviar}>
      <label>
        Seu nome
        <input name="nome" required autoComplete="given-name" placeholder="Como podemos te chamar?" />
      </label>
      <label>
        Seu e-mail
        <input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="voce@email.com" />
      </label>
      <label>
        Como se chama o seu cão? <small>(opcional)</small>
        <input name="cao" placeholder="Ex.: Mozart" />
      </label>
      <button className="btn btn-lg" type="submit" disabled={enviando}>
        {enviando ? "Abrindo o seu e-book…" : "Quero meu e-book grátis"}
      </button>
      <p className="cadastro-lgpd">
        Seus dados ficam só com a Maestro Pet, sem spam. Você pode pedir para apagar quando quiser.{" "}
        <a href="/politica-de-privacidade">Política de privacidade</a>
      </p>
    </form>
  );
}
