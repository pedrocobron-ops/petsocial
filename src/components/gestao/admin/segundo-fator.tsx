"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { Esqueleto } from "@/components/gestao/ui";
import { banco } from "@/lib/gestao/supabase";

type Cadastro = { fator: string; qr: string; segredo: string };
type Etapa = { tipo: "vendo" } | { tipo: "cadastrar"; c: Cadastro } | { tipo: "codigo"; fator: string } | { tipo: "erro"; texto: string };

/** Só os 6 números do código (com espaço ou traço no meio, como alguns aplicativos mostram). */
export const codigoLimpo = (t: string) => t.replace(/\D/g, "").slice(0, 6);

/**
 * Segundo fator do painel do administrador (TOTP pelo Supabase Auth). O banco só entrega os dados do painel com a sessão
 * forte (aal2: sou_admin, migração 20261245). Sem fator cadastrado, mostra o QR code e o código para digitar no aplicativo
 * autenticador (Google Authenticator, Microsoft Authenticator, 1Password…) e confere o primeiro código; com o fator
 * cadastrado, pede o código de 6 números. O cadastro e a conferência são do Supabase Auth e funcionam com a sessão comum:
 * ninguém fica trancado do lado de fora por causa desta tela.
 */
export default function SegundoFator({ usuario, aoPassar, aoSair }: { usuario: string; aoPassar: () => void; aoSair: () => void }) {
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "vendo" });
  const [codigo, setCodigo] = useState("");
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const comecou = useRef(false);

  useEffect(() => {
    if (comecou.current) return;
    comecou.current = true;
    void (async () => {
      const mfa = banco().auth.mfa;
      const f = await mfa.listFactors();
      if (f.error) { setEtapa({ tipo: "erro", texto: "Não consegui conferir o segundo fator agora. Recarregue a página." }); return; }
      const pronto = f.data.totp.find((x) => x.status === "verified");
      if (pronto) { setEtapa({ tipo: "codigo", fator: pronto.id }); return; }
      // cadastro começado e não terminado (outra aba, página fechada): sai antes de começar outro
      for (const x of f.data.all) if (x.factor_type === "totp" && x.status !== "verified") await mfa.unenroll({ factorId: x.id });
      const e = await mfa.enroll({ factorType: "totp", friendlyName: `Maestro Pet ${new Date().toISOString().slice(0, 16)}`, issuer: "Maestro Pet Gestão" });
      if (e.error || !e.data) {
        setEtapa({ tipo: "erro", texto: /disabled|not enabled/i.test(e.error?.message ?? "")
          ? "O segundo fator (TOTP) está desligado no Supabase. Ligue em Authentication → Multi-Factor e recarregue."
          : "Não consegui começar o cadastro do segundo fator. Recarregue a página." });
        return;
      }
      setEtapa({ tipo: "cadastrar", c: { fator: e.data.id, qr: e.data.totp.qr_code, segredo: e.data.totp.secret } });
    })();
  }, []);

  async function conferir(ev: React.FormEvent) {
    ev.preventDefault();
    const fator = etapa.tipo === "cadastrar" ? etapa.c.fator : etapa.tipo === "codigo" ? etapa.fator : null;
    const c = codigoLimpo(codigo);
    if (!fator || indo) return;
    if (c.length !== 6) { setErro("O código tem 6 números. Confira no aplicativo autenticador."); return; }
    setIndo(true); setErro(null);
    const r = await banco().auth.mfa.challengeAndVerify({ factorId: fator, code: c });
    setIndo(false);
    if (r.error) {
      setCodigo("");
      setErro(/invalid|expired|code/i.test(r.error.message) ? "Esse código não confere. Espere o próximo aparecer no aplicativo e digite de novo." : "Não consegui conferir agora. Tente de novo.");
      return;
    }
    aoPassar();
  }

  if (etapa.tipo === "vendo") return <main className="g-main"><Esqueleto linhas={4} /></main>;
  return (
    <main className="g-main" style={{ maxWidth: 560 }} data-teste="mfa" data-usuario={usuario}>
      <header className="g-topo">
        <div>
          <h1><ShieldCheck aria-hidden /> Segundo fator do administrador</h1>
          <p className="g-muted">O painel mostra dados de todos os pet shops. Além da senha, ele pede um código do aplicativo autenticador do seu celular.</p>
        </div>
      </header>
      {etapa.tipo === "erro" ? <p className="g-aviso vermelho" role="alert">{etapa.texto}</p> : (
        <form className="g-card g-pilha" onSubmit={conferir} data-teste={etapa.tipo === "cadastrar" ? "mfa-cadastro" : "mfa-codigo-pedido"}>
          {etapa.tipo === "cadastrar" ? (
            <>
              <p>1. No celular, abra o aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password ou outro) e leia este QR code.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={etapa.c.qr} alt="QR code do segundo fator" width={200} height={200} style={{ background: "#fff", padding: 8, borderRadius: 12, justifySelf: "center" }} />
              <p className="g-pp g-muted">Sem câmera? Digite este código no aplicativo: <code data-teste="mfa-segredo" style={{ overflowWrap: "anywhere", userSelect: "all" }}>{etapa.c.segredo}</code></p>
              <p>2. Digite o código de 6 números que o aplicativo mostra.</p>
            </>
          ) : <p><KeyRound aria-hidden /> Digite o código de 6 números do aplicativo autenticador.</p>}
          <label className="g-campo"><span>Código</span>
            <input className="g-input g-tab" data-teste="mfa-codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={9} autoFocus
              value={codigo} onChange={(e) => setCodigo(e.target.value)} aria-invalid={erro ? true : undefined} />
          </label>
          {erro && <p className="g-erro" role="alert">{erro}</p>}
          <button className="g-btn verde" type="submit" disabled={indo}>{indo ? "Conferindo…" : etapa.tipo === "cadastrar" ? "Ligar o segundo fator" : "Entrar no painel"}</button>
          {etapa.tipo === "codigo" && <p className="g-pp g-muted">Perdeu o celular? A equipe técnica tira o fator antigo e você cadastra de novo aqui.</p>}
        </form>
      )}
      <button className="g-btn fantasma" style={{ marginTop: 16 }} onClick={aoSair}><LogOut /> Sair</button>
    </main>
  );
}
