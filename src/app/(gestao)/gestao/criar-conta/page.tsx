"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco, configurado } from "@/lib/gestao/supabase";
import { DOCUMENTOS, aceiteDoCadastro } from "@/lib/gestao/documentos";
import { aceitarConvite, lerCodigoDoConvite } from "@/lib/gestao/convite";
import CampoSenha from "../entrar/campo-senha";

/**
 * `?email=…&convite=<código>` vêm no link do convite da equipe: o campo já chega preenchido com o e-mail do convite, e o
 * código (que só a pessoa convidada recebeu) é o que liga a conta ao pet shop depois do cadastro.
 */
export default function CriarConta() {
  return <Suspense fallback={<Formulario emailInicial="" codigo="" />}><ComConvite /></Suspense>;
}

function ComConvite() {
  const busca = useSearchParams();
  const email = (busca.get("email") ?? "").trim().toLowerCase().slice(0, 254);
  const codigo = lerCodigoDoConvite(busca.get("convite"));
  return <Formulario key={`${email}:${codigo}`} emailInicial={email} codigo={codigo} />;
}

function Formulario({ emailInicial, codigo }: { emailInicial: string; codigo: string }) {
  const router = useRouter();
  const convidado = emailInicial !== "" || codigo !== "";
  const entrarComConvite = codigo ? `/gestao/entrar?convite=${encodeURIComponent(codigo)}` : "/gestao/entrar";
  const [erroConvite, setErroConvite] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState(emailInicial);
  const [email2, setEmail2] = useState("");
  const [senha, setSenha] = useState("");
  const [aceito, setAceito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!configurado) { setErro("O sistema ainda não está ligado neste endereço."); return; }
    if (!convidado && email.trim().toLowerCase() !== email2.trim().toLowerCase()) {
      setErro("Os dois e-mails não estão iguais. Confira: é por esse e-mail que você recupera a senha."); return;
    }
    if (senha.length < 8) { setErro("A senha precisa de pelo menos 8 caracteres."); return; }
    if (!aceito) { setErro("Para criar a conta, leia e aceite os Termos de uso e a Política de privacidade."); return; }
    setIndo(true);
    const { data, error } = await banco().auth.signUp({
      email: email.trim(), password: senha,
      // `app: "maestro"` deixa o modelo de e-mail do Supabase (projeto dividido com outro app) mostrar a marca certa.
      // `aceite`: as versões dos documentos aceitas aqui; o gatilho do banco grava o aceite quando o login é criado.
      // com confirmação de e-mail ligada, o link do e-mail volta para a tela de entrar com o código, que aceita o convite
      options: { data: { app: "maestro", nome: nome.trim(), aceite: aceiteDoCadastro(), ...(convidado ? { convidado: true } : {}) }, emailRedirectTo: codigo ? `${location.origin}${entrarComConvite}` : `${location.origin}/gestao/comecar` },
    });
    if (error) {
      setIndo(false);
      setErro(/registered|already/i.test(error.message) ? (codigo ? "Este e-mail já tem conta. Toque em Entrar, logo abaixo, e entre com ela para aceitar o convite." : "Este e-mail já tem conta. Entre ou recupere a senha.")
        : /password/i.test(error.message) ? "Escolha uma senha mais forte, com pelo menos 8 caracteres."
        : "Não consegui criar a conta agora. Tente de novo em instantes.");
      return;
    }
    if (data.session && codigo) {
      const r = await aceitarConvite(banco(), codigo);
      setIndo(false);
      if ("erro" in r) { setErroConvite(r.erro); return; }
      router.replace("/gestao/app");
      return;
    }
    setIndo(false);
    if (data.session) router.replace("/gestao/comecar");
    else setConfirmar(true);
  }

  if (erroConvite) {
    return (
      <Porta titulo="A conta foi criada, mas o convite não entrou" texto={erroConvite}>
        <div className="g-pilha p">
          <p className="g-muted g-p">Peça ao dono do pet shop para mandar o convite de novo, em Equipe. Depois é só abrir o link novo: a sua conta já está pronta.</p>
          <Link className="g-btn sec cheio" href="/gestao/comecar">Continuar sem o convite</Link>
        </div>
      </Porta>
    );
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
          {convidado && emailInicial && <small>{email.trim().toLowerCase() === emailInicial ? "Use este e-mail: o convite foi feito para ele." : `O convite foi feito para ${emailInicial}. Com outro e-mail, você não entra na equipe.`}</small>}
        </label>
        {!convidado && (
          <label className="g-campo"><span>Digite o e-mail de novo</span>
            <input className="g-input" type="email" autoComplete="off" required value={email2} onChange={(e) => setEmail2(e.target.value)}
              onPaste={(e) => e.preventDefault()} />
            <small>{email2 && email.trim().toLowerCase() !== email2.trim().toLowerCase() ? "Ainda não está igual ao de cima." : "É por esse e-mail que você recupera a senha, se esquecer."}</small>
          </label>
        )}
        <label className="g-campo"><span>Crie uma senha</span>
          <CampoSenha valor={senha} aoMudar={setSenha} nova />
          <small>Pelo menos 8 caracteres.</small>
        </label>
        <label className="g-check grande">
          <input type="checkbox" name="aceite" checked={aceito} onChange={(e) => setAceito(e.target.checked)} required />
          <span>
            Li e aceito os <Link className="g-link" href="/gestao/termos" target="_blank">Termos de uso</Link> e a <Link className="g-link" href="/gestao/privacidade" target="_blank">Política de privacidade</Link>.
            <small className="g-muted" style={{ display: "block", marginTop: 2 }}>Uso profissional, para o meu negócio. Versão {DOCUMENTOS.termos.versao} dos Termos e {DOCUMENTOS.privacidade.versao} da Política.</small>
          </span>
        </label>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <button className="g-btn pri cheio" disabled={indo}>{indo ? "Criando…" : "Criar minha conta"}</button>
      </form>
      <p className="g-muted g-p">Já tem conta? <Link className="g-link" href={entrarComConvite}>{codigo ? "Entrar e aceitar o convite" : "Entrar"}</Link></p>
    </Porta>
  );
}
