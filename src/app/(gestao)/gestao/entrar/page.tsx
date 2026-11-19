"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco, configurado } from "@/lib/gestao/supabase";
import { registrarAcesso } from "@/lib/gestao/registro-acesso";
import { aceitarConvite, avisoDoConvite, conferirConvite, lerCodigoDoConvite, type SituacaoDoConvite } from "@/lib/gestao/convite";
import CampoSenha from "./campo-senha";

/**
 * `?convite=<código>`: link do convite da equipe para quem já tem conta. Logado, aceita na hora; senão, depois de entrar.
 * Sem login, o link é conferido ao abrir (`convite_conferir`): vencido, trocado ou cancelado aparece antes de pedir a senha.
 */
export default function Entrar() {
  return <Suspense fallback={<Formulario codigo="" />}><ComConvite /></Suspense>;
}

function ComConvite() {
  const codigo = lerCodigoDoConvite(useSearchParams().get("convite"));
  return <Formulario key={codigo} codigo={codigo} />;
}

function Formulario({ codigo }: { codigo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  // convite que não entrou, com a pessoa já logada: mostra o motivo e o que fazer
  const [erroConvite, setErroConvite] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(codigo !== "");
  const [convite, setConvite] = useState<{ situacao: SituacaoDoConvite; petshop: string | null } | null>(null);
  const feito = useRef(false);

  async function usarConvite() {
    const r = await aceitarConvite(banco(), codigo);
    if ("erro" in r) {
      // o banco só diz "não vale mais": a conferência explica se venceu, foi trocado por um mais novo ou cancelado
      const c = /outro e-mail|já está na equipe/i.test(r.erro) ? null : await conferirConvite(banco(), codigo);
      const a = c && c.situacao !== "muitos" ? avisoDoConvite(c.situacao, c.petshop) : null;
      setErroConvite(a ? `${a.titulo}. ${a.texto}` : r.erro);
      return;
    }
    router.replace("/gestao/app");
  }

  // já logado (ou voltando do link de confirmação do e-mail): aceita o convite sem pedir a senha de novo
  useEffect(() => {
    if (!codigo || !configurado || feito.current) { setConferindo(false); return; }
    feito.current = true;
    void (async () => {
      const { data } = await banco().auth.getSession();
      if (data.session) await usarConvite();
      else setConvite(await conferirConvite(banco(), codigo));
      setConferindo(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!configurado) { setErro("O sistema ainda não está ligado neste endereço."); return; }
    setIndo(true);
    const { data, error } = await banco().auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setIndo(false);
      setErro(/confirm/i.test(error.message) ? "Confirme o seu e-mail pelo link que enviamos antes de entrar."
        : /invalid/i.test(error.message) ? "E-mail ou senha não conferem." : "Não consegui entrar agora. Tente de novo em instantes.");
      return;
    }
    // registro de acesso (Marco Civil): sai sem esperar, não atrasa a abertura
    registrarAcesso(banco(), "login", data.user?.id);
    if (codigo) { await usarConvite(); setIndo(false); return; }
    setIndo(false);
    router.replace("/gestao/app");
  }

  async function sair() {
    await banco().auth.signOut();
    setErroConvite(null); setSenha("");
  }

  if (conferindo) return <Porta titulo="Abrindo o convite…"><span /></Porta>;

  // link que não serve mais: diz logo, antes de pedir a senha ("usado" segue para o formulário: pode ser a própria pessoa)
  const aviso = convite && !["valido", "usado", "muitos", "outro_email"].includes(convite.situacao) ? avisoDoConvite(convite.situacao, convite.petshop) : null;
  if (aviso) {
    return (
      <Porta titulo={aviso.titulo} texto={aviso.texto}>
        <div className="g-pilha p">
          <Link className="g-btn sec cheio" href="/gestao/entrar">Entrar sem o convite</Link>
        </div>
      </Porta>
    );
  }

  if (erroConvite) {
    return (
      <Porta titulo="O convite não entrou" texto={erroConvite}>
        <div className="g-pilha p">
          <p className="g-muted g-p">Se o link venceu ou já foi usado, peça ao dono do pet shop para mandar o convite de novo, em Equipe. Se você entrou com outra conta, saia e entre com a conta do e-mail que recebeu o convite.</p>
          <button type="button" className="g-btn pri cheio" onClick={() => void sair()}>Sair e entrar com outra conta</button>
          <Link className="g-btn sec cheio" href="/gestao/app">Abrir o sistema sem o convite</Link>
        </div>
      </Porta>
    );
  }

  return (
    <Porta titulo={codigo ? "Entre para aceitar o convite" : "Que bom te ver"}
      texto={codigo ? `Use a conta do e-mail que recebeu o convite${convite?.petshop ? ` de ${convite.petshop}` : ""}. Ao entrar, você já cai na equipe.` : "Entre para abrir o seu pet shop."}>
      {convite?.situacao === "usado" && <p className="g-aviso" role="status">Este convite já foi usado. Se foi você, entre normalmente com o seu e-mail e a sua senha.</p>}
      <form className="g-form" onSubmit={enviar}>
        <label className="g-campo"><span>E-mail</span>
          <input className="g-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="g-campo"><span>Senha</span>
          <CampoSenha valor={senha} aoMudar={setSenha} />
        </label>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <button className="g-btn pri cheio" disabled={indo}>{indo ? "Entrando…" : codigo ? "Entrar e aceitar o convite" : "Entrar"}</button>
      </form>
      <div className="g-pilha p g-p">
        <Link className="g-link" href="/gestao/recuperar">Esqueci a senha</Link>
        <span className="g-muted g-pp" style={{ display: "block", marginTop: 10 }}><Link className="g-link" href="/gestao/termos">Termos de uso</Link> · <Link className="g-link" href="/gestao/privacidade">Política de privacidade</Link></span>
        {codigo
          ? <p className="g-muted">Ainda não tem conta? <Link className="g-link" href={`/gestao/criar-conta?convite=${encodeURIComponent(codigo)}`}>Criar a conta para entrar na equipe</Link></p>
          : <p className="g-muted">Ainda não tem conta? <Link className="g-link" href="/gestao/criar-conta">Teste 7 dias grátis</Link></p>}
      </div>
    </Porta>
  );
}
