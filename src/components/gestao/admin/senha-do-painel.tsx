"use client";

import { useEffect, useState } from "react";
import { KeyRound, LogOut, Mail } from "lucide-react";
import { banco } from "@/lib/gestao/supabase";
import {
  SENHA_MAX, type SituacaoDoPainel, emailDisfarcado, motivoDaSenhaNova, problemaDaSenhaNova, textoDaSenhaErrada, textoDoBloqueio, travado,
} from "@/lib/gestao/senha-do-painel";

type Resposta = { ok?: boolean; motivo?: string; restam?: number; bloqueado_ate?: string } | null;

/**
 * A porta do painel do administrador: a senha do painel (migração 20261247), separada da senha da conta. O banco só entrega
 * os dados do painel depois que a senha é conferida nesta sessão de login (sou_admin); a tela só pergunta e mostra.
 *
 * Três situações: com senha registrada, pede a senha; sem senha, ou para trocar, manda um link para o e-mail da conta
 * (o mesmo e-mail de entrada do Supabase Auth) e, de volta pelo link, deixa escolher a senha nova. O banco só aceita a senha
 * nova de quem chegou pelo e-mail há no máximo 15 minutos. Cinco senhas erradas seguidas travam as tentativas por 15 minutos.
 */
export default function SenhaDoPainel({ usuario, email, situacao, pelaSenha, aoAbrir, aoRever, aoSair }: {
  usuario: string; email: string; situacao: SituacaoDoPainel;
  /** Acabou de fechar o painel: mesmo podendo trocar a senha (chegou pelo e-mail há pouco), começa pedindo a senha. */
  pelaSenha?: boolean;
  /** O painel abriu nesta sessão. */
  aoAbrir: () => void;
  /** A sessão de login mudou (chegou pelo código do e-mail): pergunta a situação de novo. */
  aoRever: () => void;
  aoSair: () => void;
}) {
  const [usarAtual, setUsarAtual] = useState(Boolean(pelaSenha));
  const [senha, setSenha] = useState("");
  const [nova, setNova] = useState("");
  const [repetida, setRepetida] = useState("");
  const [codigo, setCodigo] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const [bloqueadoAte, setBloqueadoAte] = useState<string | null>(situacao.bloqueadoAte);
  const [agora, setAgora] = useState(() => Date.now());

  // a trava some sozinha da tela quando o tempo passa
  useEffect(() => {
    if (!bloqueadoAte) return;
    const t = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(t);
  }, [bloqueadoAte]);

  const parado = travado(bloqueadoAte, agora);
  const modo: "definir" | "abrir" | "sem_senha" = situacao.podeDefinir && !(usarAtual && situacao.temSenha) ? "definir" : situacao.temSenha ? "abrir" : "sem_senha";

  async function abrir(ev: React.FormEvent) {
    ev.preventDefault();
    if (indo || parado) return;
    if (!senha) { setErro("Digite a senha do painel."); return; }
    setIndo(true); setErro(null);
    const r = await banco().rpc("admin_painel_abrir", { p_senha: senha });
    setIndo(false);
    setSenha("");
    const d = r.data as Resposta;
    if (r.error || !d) { setErro("Não consegui conferir a senha agora. Tente de novo."); return; }
    if (d.ok) { aoAbrir(); return; }
    if (d.motivo === "bloqueado" && d.bloqueado_ate) { setAgora(Date.now()); setBloqueadoAte(d.bloqueado_ate); return; }
    if (d.motivo === "sessao") { setErro("Sua entrada na conta venceu. Saia e entre de novo."); return; }
    setErro(textoDaSenhaErrada(d.restam));
  }

  async function mandarLink() {
    if (indo) return;
    setIndo(true); setErroEmail(null);
    const { error } = await banco().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/gestao/admin` } });
    setIndo(false);
    if (error) {
      setErroEmail(/rate|seconds|segundos|limit/i.test(error.message) ? "Já mandamos um e-mail há pouco. Espere um minuto e peça de novo." : "Não consegui mandar o e-mail agora. Tente de novo em instantes.");
      return;
    }
    setEnviado(true);
  }

  async function conferirCodigo(ev: React.FormEvent) {
    ev.preventDefault();
    if (indo) return;
    const c = codigo.replace(/\D/g, "");
    if (c.length < 6) { setErroEmail("Digite os números do código que chegou no e-mail."); return; }
    setIndo(true); setErroEmail(null);
    const v = await banco().auth.verifyOtp({ email, token: c, type: "email" });
    setIndo(false);
    if (v.error) { setErroEmail("Esse código não confere ou já venceu. Peça um e-mail novo."); return; }
    setCodigo(""); setEnviado(false);
    aoRever();
  }

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (indo) return;
    const problema = problemaDaSenhaNova(nova, repetida, email);
    if (problema) { setErro(problema); return; }
    setIndo(true); setErro(null);
    const r = await banco().rpc("admin_senha_definir", { p_nova: nova });
    setIndo(false);
    const d = r.data as Resposta;
    if (r.error || !d) { setErro("Não consegui guardar a senha agora. Tente de novo."); return; }
    setNova(""); setRepetida("");
    if (d.ok) { aoAbrir(); return; }
    setErro(motivoDaSenhaNova(d.motivo));
    if (d.motivo === "email") aoRever();
  }

  const pedirLink = (
    <div className="g-pilha p" data-teste="painel-email">
      {!enviado ? (
        <button type="button" className="g-btn sec" data-teste="painel-pedir-link" disabled={indo} onClick={() => void mandarLink()}>
          <Mail aria-hidden /> {indo ? "Mandando…" : situacao.temSenha ? "Esqueci ou quero trocar a senha: receber o link por e-mail" : "Receber o link por e-mail"}
        </button>
      ) : (
        <form className="g-pilha p" onSubmit={conferirCodigo} data-teste="painel-enviado">
          <p role="status"><b>Mandamos um link para {emailDisfarcado(email)}.</b> Abra o e-mail neste aparelho e toque no link: ele traz você de volta para cá, para escolher a senha. O link vale por 1 hora e só funciona uma vez.</p>
          <label className="g-campo"><span>O e-mail trouxe um código em vez do link? Digite aqui</span>
            <input className="g-input g-tab" data-teste="painel-codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={12}
              value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </label>
          <div className="g-fila">
            <button className="g-btn sec" type="submit" disabled={indo || !codigo.trim()}>Conferir o código</button>
            <button className="g-btn fantasma" type="button" disabled={indo} onClick={() => void mandarLink()}>Não chegou? Mandar de novo</button>
          </div>
          <p className="g-pp g-muted">Não achou o e-mail? Olhe também a caixa de spam.</p>
        </form>
      )}
      {erroEmail && <p className="g-erro" role="alert">{erroEmail}</p>}
    </div>
  );

  return (
    <main className="g-main" style={{ maxWidth: 560 }} data-teste="painel-porta" data-modo={modo} data-usuario={usuario}>
      <header className="g-topo">
        <div>
          <h1><KeyRound aria-hidden /> Senha do painel</h1>
          <p className="g-muted">O painel mostra dados de todos os pet shops. Para abrir, ele pede uma senha só dele, que só você sabe.</p>
        </div>
      </header>

      {modo === "definir" ? (
        <form className="g-card g-pilha" onSubmit={guardar} data-teste="painel-definir">
          <p><b>{situacao.temSenha ? "Escolha a senha nova do painel." : "Escolha a senha do painel."}</b> Você chegou pelo link do e-mail: tem 15 minutos para escolher.</p>
          <label className="g-campo"><span>Senha nova do painel</span>
            <input className="g-input" data-teste="painel-nova" type="password" autoComplete="new-password" maxLength={SENHA_MAX} autoFocus
              value={nova} onChange={(e) => setNova(e.target.value)} aria-invalid={erro ? true : undefined} />
            <small>Pelo menos 10 letras ou números. Use uma senha diferente da senha da sua conta.</small>
          </label>
          <label className="g-campo"><span>Repita a senha</span>
            <input className="g-input" data-teste="painel-repetida" type="password" autoComplete="new-password" maxLength={SENHA_MAX}
              value={repetida} onChange={(e) => setRepetida(e.target.value)} />
          </label>
          {erro && <p className="g-erro" role="alert">{erro}</p>}
          <button className="g-btn verde" type="submit" disabled={indo}>{indo ? "Guardando…" : "Guardar a senha e abrir o painel"}</button>
          {situacao.temSenha && <button className="g-btn fantasma" type="button" data-teste="painel-usar-atual" onClick={() => { setErro(null); setUsarAtual(true); }}>Não quero trocar: usar a senha que já tenho</button>}
        </form>
      ) : modo === "abrir" ? (
        <div className="g-pilha">
          <form className="g-card g-pilha" onSubmit={abrir} data-teste="painel-abrir">
            <label className="g-campo"><span>Senha do painel</span>
              <input className="g-input" data-teste="painel-senha" type="password" autoComplete="current-password" maxLength={SENHA_MAX} autoFocus
                value={senha} onChange={(e) => setSenha(e.target.value)} aria-invalid={erro ? true : undefined} disabled={parado} />
            </label>
            {parado && bloqueadoAte ? <p className="g-aviso vermelho" role="alert" data-teste="painel-travado">{textoDoBloqueio(bloqueadoAte, agora)}</p>
              : erro && <p className="g-erro" role="alert">{erro}</p>}
            <button className="g-btn verde" type="submit" disabled={indo || parado}>{indo ? "Conferindo…" : "Abrir o painel"}</button>
          </form>
          {pedirLink}
        </div>
      ) : (
        <div className="g-card g-pilha" data-teste="painel-sem-senha">
          {!enviado && <p><b>Você ainda não registrou a senha do painel.</b> Para registrar, mandamos um link para o e-mail da sua conta ({emailDisfarcado(email)}). Abrindo o link, você escolhe a senha.</p>}
          {pedirLink}
        </div>
      )}
      <button className="g-btn fantasma" style={{ marginTop: 16 }} onClick={aoSair}><LogOut /> Sair da conta</button>
    </main>
  );
}
