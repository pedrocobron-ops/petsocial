"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Porta from "@/components/gestao/porta";
import { banco, configurado } from "@/lib/gestao/supabase";
import { DOCUMENTOS, aceiteDoCadastro } from "@/lib/gestao/documentos";
import { aceitarConvite, avisoDoConvite, conferirConvite, lerCodigoDoConvite, type SituacaoDoConvite } from "@/lib/gestao/convite";
import CampoSenha from "../entrar/campo-senha";

/**
 * `?email=…&convite=<código>` vêm no link do convite da equipe: o campo já chega preenchido com o e-mail do convite, e o
 * código (que só a pessoa convidada recebeu) é o que liga a conta ao pet shop depois do cadastro.
 * O link é conferido ao abrir (`convite_conferir`): link vencido, trocado por um mais novo ou já usado aparece logo, e o
 * e-mail digitado é conferido antes de criar a conta, para não sobrar conta que nunca entra na equipe.
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
  const emailsDiferentes = Boolean(email2) && email.trim().toLowerCase() !== email2.trim().toLowerCase();
  const [aceito, setAceito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  // o link do convite, conferido ao abrir: null = ainda não sei (ou não deu para conferir; a tela segue como antes)
  const [convite, setConvite] = useState<{ situacao: SituacaoDoConvite; petshop: string | null } | null>(null);
  // já conectado com outra conta neste aparelho (o dono testando o link, por exemplo)
  const [conectado, setConectado] = useState<string | null>(null);

  useEffect(() => {
    if (!configurado) return;
    let vivo = true;
    void (async () => {
      const [c, s] = await Promise.all([codigo ? conferirConvite(banco(), codigo) : Promise.resolve(null), convidado ? banco().auth.getSession() : Promise.resolve(null)]);
      if (!vivo) return;
      if (c) setConvite(c);
      setConectado(s?.data.session?.user.email ?? null);
    })();
    return () => { vivo = false; };
  }, [codigo, convidado]);

  async function sair() {
    await banco().auth.signOut();
    setConectado(null);
  }

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
    // convite: confere o link com o e-mail digitado ANTES de criar a conta (e-mail errado não cria conta nenhuma)
    if (codigo) {
      const c = await conferirConvite(banco(), codigo, email);
      if (c && c.situacao !== "valido") {
        setIndo(false);
        if (c.situacao === "outro_email" || c.situacao === "muitos") { setErro(avisoDoConvite(c.situacao, c.petshop, emailInicial)?.texto ?? null); return; }
        setConvite(c);
        return;
      }
    }
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
          <p className="g-muted g-p">{/outro e-mail/i.test(erroConvite)
            ? "Esta conta não entra na equipe, porque o convite é de outro e-mail. Entre com a conta do e-mail convidado, ou peça um convite para este e-mail."
            : "A sua conta já está pronta: quando chegar o link novo, é só abrir e entrar com o seu e-mail e a sua senha."}</p>
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

  const aviso = convite && convite.situacao !== "outro_email" && convite.situacao !== "muitos" ? avisoDoConvite(convite.situacao, convite.petshop, emailInicial) : null;
  if (aviso) {
    return (
      <Porta titulo={aviso.titulo} texto={aviso.texto}>
        <div className="g-pilha p">
          {convite?.situacao === "usado"
            ? <Link className="g-btn pri cheio" href={entrarComConvite}>Entrar</Link>
            : <Link className="g-btn sec cheio" href="/gestao/entrar">Já tenho conta: entrar</Link>}
          <p className="g-muted g-pp">Nenhuma conta foi criada por este link.</p>
        </div>
      </Porta>
    );
  }

  const daEquipe = convite?.petshop ? `Você foi convidado para a equipe de ${convite.petshop}. É só escolher uma senha.` : "Você foi convidado por um pet shop. É só escolher uma senha.";
  return (
    <Porta titulo={convidado ? "Crie a sua conta para entrar na equipe" : "Comece os seus 7 dias grátis"}
      texto={convidado ? daEquipe : "Sem cartão. Você só decide se assina depois de testar."}>
      {convidado && conectado && (
        <div className="g-aviso" role="status">
          <span>Você está conectado como <b>{conectado}</b>. Se esta é a conta que recebeu o convite, toque em Entrar e aceitar o convite, logo abaixo. Para criar outra conta, saia primeiro.</span>
          <button type="button" className="g-btn p sec" onClick={() => void sair()}>Sair</button>
        </div>
      )}
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
              aria-invalid={emailsDiferentes ? true : undefined} onPaste={(e) => e.preventDefault()} />
            {/* diferente do de cima: na cor de erro (não na cor da dica) */}
            {emailsDiferentes ? <small className="erro">Ainda não está igual ao de cima.</small> : <small>É por esse e-mail que você recupera a senha, se esquecer.</small>}
          </label>
        )}
        <label className="g-campo"><span>Crie uma senha</span>
          <CampoSenha valor={senha} aoMudar={setSenha} nova />
          <small>Pelo menos 8 caracteres.</small>
        </label>
        <label className="g-check grande">
          <input type="checkbox" name="aceite" checked={aceito} onChange={(e) => { setAceito(e.target.checked); setErro(null); }} />
          <span>
            Li e aceito os <Link className="g-link" href="/gestao/termos" target="_blank">Termos de uso</Link> e a <Link className="g-link" href="/gestao/privacidade" target="_blank">Política de privacidade</Link>.
            <small className="g-muted" style={{ display: "block", marginTop: 2 }}>{convidado ? "Uso profissional, no trabalho com a equipe do pet shop." : "Uso profissional, para o meu negócio."} Versão {DOCUMENTOS.termos.versao} dos Termos e {DOCUMENTOS.privacidade.versao} da Política.</small>
          </span>
        </label>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <button type="submit" className="g-btn pri cheio" disabled={indo}>{indo ? "Criando…" : "Criar minha conta"}</button>
      </form>
      <p className="g-muted g-p">Já tem conta? <Link className="g-link" href={entrarComConvite}>{codigo ? "Entrar e aceitar o convite" : "Entrar"}</Link></p>
    </Porta>
  );
}
