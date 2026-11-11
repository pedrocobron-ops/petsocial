"use client";

import { useState } from "react";
import Link from "next/link";
import Porta from "@/components/gestao/porta";
import { banco } from "@/lib/gestao/supabase";

export default function Recuperar() {
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [indo, setIndo] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setIndo(true);
    // A resposta é a mesma exista ou não a conta: assim ninguém descobre quem é cliente.
    await banco().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/gestao/nova-senha` });
    setIndo(false);
    setEnviado(true);
  }

  return (
    <Porta titulo="Vamos criar uma senha nova" texto={enviado ? "Se este e-mail tiver conta, o link para criar a senha nova chega em instantes." : "Digite o e-mail da sua conta e enviamos um link."}>
      {!enviado && (
        <form className="g-form" onSubmit={enviar}>
          <label className="g-campo"><span>E-mail</span>
            <input className="g-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="g-btn pri cheio" disabled={indo}>{indo ? "Enviando…" : "Enviar link"}</button>
        </form>
      )}
      <p className="g-p"><Link className="g-link" href="/gestao/entrar">Voltar para a entrada</Link></p>
    </Porta>
  );
}
