"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco, configurado } from "@/lib/gestao/supabase";

export default function CriarConta() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [aceito, setAceito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!configurado) { setErro("O sistema ainda não está ligado neste endereço."); return; }
    if (senha.length < 8) { setErro("A senha precisa de pelo menos 8 caracteres."); return; }
    setIndo(true);
    const { data, error } = await banco().auth.signUp({
      email: email.trim(), password: senha,
      options: { data: { nome: nome.trim() }, emailRedirectTo: `${location.origin}/gestao/comecar` },
    });
    setIndo(false);
    if (error) {
      setErro(/registered|already/i.test(error.message) ? "Este e-mail já tem conta. Entre ou recupere a senha."
        : /password/i.test(error.message) ? "Escolha uma senha mais forte, com pelo menos 8 caracteres."
        : "Não consegui criar a conta agora. Tente de novo em instantes.");
      return;
    }
    if (data.session) router.replace("/gestao/comecar");
    else setConfirmar(true);
  }

  if (confirmar) {
    return (
      <Porta titulo="Confira o seu e-mail" texto={`Enviamos um link de confirmação para ${email.trim()}. Abra o link para começar os seus 7 dias grátis.`}>
        <p className="g-muted g-p">Não chegou? Olhe a caixa de spam ou <button className="g-link" onClick={() => setConfirmar(false)}>tente de novo</button>.</p>
      </Porta>
    );
  }

  return (
    <Porta titulo="Comece os seus 7 dias grátis" texto="Sem cartão. Você só decide se assina depois de testar.">
      <form className="g-form" onSubmit={enviar}>
        <label className="g-campo"><span>Seu nome</span>
          <input className="g-input" autoComplete="name" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="g-campo"><span>E-mail</span>
          <input className="g-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="g-campo"><span>Crie uma senha</span>
          <input className="g-input" type="password" autoComplete="new-password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
          <small>Pelo menos 8 caracteres.</small>
        </label>
        <label className="g-check">
          <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} required />
          <span>Li e aceito os <Link className="g-link" href="/termos-de-uso" target="_blank">Termos de Uso</Link> e a <Link className="g-link" href="/politica-de-privacidade" target="_blank">Política de Privacidade</Link>.</span>
        </label>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <button className="g-btn pri cheio" disabled={indo}>{indo ? "Criando…" : "Criar minha conta"}</button>
      </form>
      <p className="g-muted g-p">Já tem conta? <Link className="g-link" href="/gestao/entrar">Entrar</Link></p>
    </Porta>
  );
}
