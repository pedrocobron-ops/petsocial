"use client";

import { useState } from "react";
import { Download, UserX } from "lucide-react";
import { banco } from "@/lib/gestao/supabase";
import { dataCompleta, hora, isoDia } from "@/lib/gestao/util";

/** O que o banco devolve em `meus_dados` (migração 20261236): cada planilha já com as colunas e as linhas. */
export type MeusDados = { email: string; gerado_em: string; arquivos: { arquivo: string; explica: string; colunas: string[]; linhas: unknown[][] }[] };

/** O README do .zip de "Baixar os meus dados". Também usado pelos testes. */
export function leiaMeDosMeusDados(d: MeusDados, agora = new Date()) {
  return [
    "LEIA-ME · Os seus dados no Maestro Pet Gestão",
    `Login: ${d.email}`,
    `Gerado em ${dataCompleta(agora)} às ${hora(agora)}.`,
    "",
    "Aqui está o que o Maestro Pet guarda sobre você como pessoa com login no sistema (LGPD, art. 18).",
    "Os dados de trabalho do pet shop (agenda, vendas, comissão) são do pet shop: peça a ele.",
    "Cada arquivo .csv é uma planilha (UTF-8, ponto e vírgula entre as colunas). Abre no Excel e no Google Planilhas.",
    "",
    ...d.arquivos.map((a) => `${a.arquivo} (${a.linhas.length === 1 ? "1 linha" : `${a.linhas.length} linhas`})\r\n  ${a.explica}`),
    "",
    "Para corrigir ou apagar algo, escreva para o e-mail de privacidade que está na Política de privacidade.",
    "",
  ].join("\r\n");
}

/**
 * "Baixar os meus dados": o que guardamos sobre a pessoa que está logada (login, pet shops, aceites, acessos e as conversas
 * dela com o Mozart e a Ajuda), em planilhas dentro de um .zip. Não precisa de pet shop aberto: serve também para quem saiu
 * da equipe. As peças de planilha e de zip só são baixadas no toque.
 */
export function BaixarMeusDados({ lateral, className = "g-btn fantasma" }: { lateral?: boolean; className?: string }) {
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function baixar() {
    if (indo) return;
    setIndo(true); setErro(null);
    try {
      const r = await banco().rpc("meus_dados");
      if (r.error) throw new Error(r.error.message);
      const d = r.data as unknown as MeusDados;
      const [{ textoCsv, baixarArquivo }, { montarZip }] = await Promise.all([import("@/components/gestao/financeiro/comum"), import("@/lib/gestao/zip")]);
      const agora = new Date();
      const celula = (v: unknown) => (v == null ? "" : String(v));
      const zip = montarZip([
        { nome: "README.txt", conteudo: "﻿" + leiaMeDosMeusDados(d, agora) },
        ...d.arquivos.map((a) => ({ nome: a.arquivo, conteudo: textoCsv([a.colunas, ...a.linhas.map((l) => l.map(celula))]) })),
      ], agora);
      baixarArquivo(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }), `meus-dados-maestro-pet-${isoDia(agora)}.zip`);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : "Não consegui juntar os seus dados. Tente de novo em instantes.");
    } finally { setIndo(false); }
  }

  if (lateral) return <button type="button" onClick={() => void baixar()} disabled={indo} title={erro ?? undefined}><Download />{indo ? "Juntando…" : "Baixar os meus dados"}</button>;
  return (
    <>
      <button type="button" className={className} onClick={() => void baixar()} disabled={indo}><Download />{indo ? "Juntando…" : "Baixar os meus dados"}</button>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
    </>
  );
}

/**
 * "Apagar o meu login": só aparece para quem não está em nenhum pet shop. Pede uma confirmação na própria tela (sem folha:
 * a tela de quem ficou sem pet shop não tem a casca do aplicativo). O servidor decide: apaga na hora, deixa para a faxina do
 * dia seguinte, ou não apaga quando o login também é usado em outro produto nosso (e explica).
 */
export function ApagarMeuLogin({ aoApagar }: { aoApagar: () => void }) {
  const [passo, setPasso] = useState<"fechado" | "confirmar" | "indo" | "feito">("fechado");
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);

  async function apagar() {
    setPasso("indo"); setAviso(null);
    try {
      const sb = banco();
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Entre de novo para apagar o login.");
      const r = await fetch("/api/gestao/minha-conta/apagar", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; mensagem?: string };
      if (!r.ok) throw new Error(d.mensagem || "Não consegui apagar agora. Tente de novo em instantes.");
      if (!d.ok) { setAviso({ texto: d.mensagem ?? "Este login não foi apagado.", erro: true }); setPasso("fechado"); return; }
      setAviso({ texto: d.mensagem ?? "Seu login foi apagado.", erro: false });
      setPasso("feito");
      await sb.auth.signOut().catch(() => undefined);
      setTimeout(aoApagar, 2200);
    } catch (e) {
      setAviso({ texto: e instanceof Error && e.message ? e.message : "Não consegui apagar agora. Tente de novo em instantes.", erro: true });
      setPasso("fechado");
    }
  }

  return (
    <div className="g-pilha p">
      {aviso && <p className={aviso.erro ? "g-erro" : "g-aviso verde"} role={aviso.erro ? "alert" : "status"}>{aviso.texto}</p>}
      {passo === "fechado" && <button type="button" className="g-btn fantasma cheio" onClick={() => setPasso("confirmar")}><UserX />Apagar o meu login</button>}
      {(passo === "confirmar" || passo === "indo") && (
        <div className="g-aviso amarelo" role="group" aria-label="Confirmar: apagar o meu login">
          <p><b>Apagar este login de vez?</b> Você não entra mais com este e-mail e esta senha. O seu nome continua no histórico do pet shop em que você trabalhou, porque faz parte do registro dele. O registro de que você aceitou os termos e o registro de acessos (6 meses) ficam pelo prazo da Política de privacidade. Não dá para desfazer.</p>
          <div className="g-fila" style={{ gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button type="button" className="g-btn perigo" onClick={() => void apagar()} disabled={passo === "indo"}>{passo === "indo" ? "Apagando…" : "Sim, apagar o meu login"}</button>
            <button type="button" className="g-btn sec" onClick={() => setPasso("fechado")} disabled={passo === "indo"}>Voltar</button>
          </div>
        </div>
      )}
    </div>
  );
}
