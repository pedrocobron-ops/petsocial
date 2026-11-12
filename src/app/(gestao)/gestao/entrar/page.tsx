"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco, configurado } from "@/lib/gestao/supabase";
import CampoSenha from "./campo-senha";

export default function Entrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!configurado) { setErro("O sistema ainda não está ligado neste endereço."); return; }
    setIndo(true);
    const { error } = await banco().auth.signInWithPassword({ email: email.trim(), password: senha });
    setIndo(false);
    if (error) {
      setErro(/confirm/i.test(error.message) ? "Confirme o seu e-mail pelo link que enviamos antes de entrar."
        : /invalid/i.test(error.message) ? "E-mail ou senha não conferem." : "Não consegui entrar agora. Tente de novo em instantes.");
      return;
    }
    router.replace("/gestao/app");
  }

  return (
    <Porta titulo="Que bom te ver" texto="Entre para abrir o seu pet shop.">
      <form className="g-form" onSubmit={enviar}>
        <label className="g-campo"><span>E-mail</span>
          <input className="g-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="g-campo"><span>Senha</span>
          <CampoSenha valor={senha} aoMudar={setSenha} />
        </label>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <button className="g-btn pri cheio" disabled={indo}>{indo ? "Entrando…" : "Entrar"}</button>
      </form>
      <div className="g-pilha p g-p">
        <Link className="g-link" href="/gestao/recuperar">Esqueci a senha</Link>
        <p className="g-muted">Ainda não tem conta? <Link className="g-link" href="/gestao/criar-conta">Teste 7 dias grátis</Link></p>
      </div>
    </Porta>
  );
}
