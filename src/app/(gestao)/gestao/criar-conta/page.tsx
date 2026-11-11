"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco, configurado } from "@/lib/gestao/supabase";

/** `?email=` vem no convite da equipe: o campo já chega preenchido com o e-mail que liga a pessoa ao pet shop. */
export default function CriarConta() {
  return <Suspense fallback={<Formulario emailInicial="" />}><ComConvite /></Suspense>;
}

function ComConvite() {
  const email = (useSearchParams().get("email") ?? "").trim().toLowerCase().slice(0, 254);
  return <Formulario key={email} emailInicial={email} />;
}

function Formulario({ emailInicial }: { emailInicial: string }) {
  const router = useRouter();
  const convidado = emailInicial !== "";
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState(emailInicial);
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
      <Porta titulo="Confira o seu e-mail" texto={`Enviamos um link de confirmação para ${email.trim()}. Abra o link para ${convidado ? "entrar na equipe" : "começar os seus 7 dias grátis"}.`}>
        <p className="g-muted g-p">Não chegou? Olhe a caixa de spam ou <button className="g-link" onClick={() => setConfirmar(false)}>tente de novo</button>.</p>
      </Porta>
    );
  }

  return (
    <Porta titulo={convidado ? "Crie a sua conta para entrar na equipe" : "Comece os seus 7 dias grátis"}
      texto={convidado ? "Você foi convidado por um pet shop. É só escolher uma senha." : "Sem cartão. Você só decide se assina depois de testar."}>
      <form className="g-form" onSubmit={enviar}>
        <label className="g-campo"><span>Seu nome</span>
          <input className="g-input" autoComplete="name" required maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label className="g-campo"><span>E-mail</span>
          <input className="g-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {convidado && <small>{email.trim().toLowerCase() === emailInicial ? "Use este e-mail: é ele que liga a sua conta ao pet shop." : `O convite foi feito para ${emailInicial}. Com outro e-mail, você não entra na equipe.`}</small>}
        </label>
        <label className="g-campo"><span>Crie uma senha</span>
          <input className="g-input" type="password" autoComplete="new-password" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
          <small>Pelo menos 8 caracteres.</small>
        </label>
        <label className="g-check">
          <input type="checkbox" checked={aceito} onChange={(e) => setAceito(e.target.checked)} required />
          <span>Li e aceito os <Link className="g-link" href="/gestao/termos" target="_blank">Termos de Uso</Link> e a <Link className="g-link" href="/gestao/privacidade" target="_blank">Política de Privacidade</Link>.</span>
        </label>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <button className="g-btn pri cheio" disabled={indo}>{indo ? "Criando…" : "Criar minha conta"}</button>
      </form>
      <p className="g-muted g-p">Já tem conta? <Link className="g-link" href="/gestao/entrar">Entrar</Link></p>
    </Porta>
  );
}
