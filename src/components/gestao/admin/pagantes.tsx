"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, PartyPopper } from "lucide-react";
import { Esqueleto, mensagemDeErro, ok, useAvisos } from "@/components/gestao/ui";
import { banco } from "@/lib/gestao/supabase";
import { EMPRESA } from "@/lib/empresa";
import { dataCompleta } from "@/lib/gestao/util";

/** O que `admin_pagantes` devolve. Pagante = status ativa ou atrasada (teste, cortesia e cancelada ficam de fora). */
type Pagantes = {
  meta: number;
  hoje: number;
  lojas: { id: string; nome: string; status: "ativa" | "atrasada"; plano: string; periodo_meses: number; pago_ate: string | null; desde: string | null; status_desde: string | null }[];
  historico_desde: string | null;
  meses: { mes: string; fim: string; confiavel: boolean; n: number }[];
  passos: Record<string, string>;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const nomeMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); return `${MESES[m - 1]}/${String(a).slice(2)}`; };

export const PASSOS: { id: string; titulo: string; dica: string }[] = [
  { id: "contador", titulo: "Conversar com um contador e escolher o tipo de empresa",
    dica: "Na maioria dos casos, o MEI não permite atividade de software ou SaaS. Confirme com o contador qual tipo serve para você." },
  { id: "cnpj", titulo: "Abrir o CNPJ", dica: "Normalmente o contador cuida da abertura. Confirme com o contador o que ele precisa de você." },
  { id: "cakto", titulo: "Pedir ao suporte da Cakto para passar a conta de CPF para CNPJ",
    dica: "Pergunte ao suporte quais documentos eles pedem e se as assinaturas que já existem continuam cobrando normalmente." },
  { id: "dados", titulo: "Atualizar os dados da empresa no sistema",
    dica: "Os Termos e a Política de Privacidade mostram quem responde pelo Maestro Pet. Esses dados ficam no arquivo src/lib/empresa.ts. Peça ao Claude: \"atualize src/lib/empresa.ts com a empresa nova: pessoaFisica false, razão social, CNPJ e endereço\"." },
  { id: "advogado", titulo: "Pedir ao advogado para revisar os Termos com a empresa nova", dica: "Os Termos e a Política mudam de quem responde: vale uma revisão antes de publicar." },
  { id: "notas", titulo: "Começar a emitir notas fiscais (NFS-e) pela Cakto", dica: "Confirme com o contador quais dados a nota precisa e o código do serviço." },
];

export default function CartaoPagantes() {
  const { avisarErro } = useAvisos();
  const [p, setP] = useState<Pagantes | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  const [gravando, setGravando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = ok(await banco().rpc("admin_pagantes")) as unknown as Pagantes;
        if (vivo) setP(r);
      } catch (e) {
        if (vivo) setErro(mensagemDeErro(e));
      }
    })();
    return () => { vivo = false; };
  }, []);

  async function marcar(passo: string, feito: boolean) {
    setGravando(passo);
    const antes = p?.passos ?? {};
    // marca na hora; se o banco recusar, volta como estava
    setP((x) => {
      if (!x) return x;
      const passos = { ...x.passos };
      if (feito) passos[passo] = new Date().toISOString(); else delete passos[passo];
      return { ...x, passos };
    });
    try {
      const passos = ok(await banco().rpc("admin_empresa_marcar", { p_passo: passo, p_feito: feito })) as unknown as Record<string, string>;
      setP((x) => (x ? { ...x, passos } : x));
    } catch (e) {
      setP((x) => (x ? { ...x, passos: antes } : x));
      avisarErro(e);
    } finally {
      setGravando(null);
    }
  }

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!p) return <section className="g-card"><Esqueleto linhas={3} /></section>;

  const chegou = p.hoje >= p.meta;
  const feitos = PASSOS.filter((x) => p.passos[x.id]).length;
  const confiaveis = p.meses.filter((m) => m.confiavel);
  const maior = Math.max(1, p.meta, ...confiaveis.map((m) => m.n));
  const faltam = Math.max(0, p.meta - p.hoje);

  const lista = (
    <div className="g-pilha p" data-teste="passos-empresa">
      {PASSOS.map((x, i) => {
        const quando = p.passos[x.id];
        return (
          <label key={x.id} className="g-check" style={{ alignItems: "flex-start", minWidth: 0 }}>
            <input type="checkbox" checked={!!quando} disabled={gravando === x.id} onChange={(e) => void marcar(x.id, e.target.checked)} style={{ marginTop: 2, flex: "none" }} />
            <span style={{ display: "grid", gap: 2, minWidth: 0, overflowWrap: "anywhere" }}>
              <b style={{ fontWeight: 600, textDecoration: quando ? "line-through" : undefined }}>{i + 1}. {x.titulo}</b>
              <span className="g-pp g-muted">{x.dica}</span>
              {quando && <span className="g-pp g-muted">Feito em {dataCompleta(new Date(quando))}.</span>}
            </span>
          </label>
        );
      })}
      <p className="g-pp g-muted">
        Esta lista é um roteiro prático, não orientação jurídica ou fiscal. Cada caso é diferente: confirme com o contador.
        {EMPRESA.pessoaFisica ? " Hoje os Termos e a Política mostram você como pessoa física (CPF)." : " Os Termos e a Política já mostram a empresa (CNPJ)."}
      </p>
    </div>
  );

  return (
    <section className="g-card" data-teste="pagantes" style={{ minWidth: 0 }}>
      <div className="g-card-t">
        <p className="g-rotulo">Clientes pagantes</p>
        <span className="g-pp g-muted">meta: {p.meta} para abrir a empresa</span>
      </div>
      <p className="g-num" style={{ marginTop: 10 }} data-teste="pagantes-hoje">{p.hoje}</p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "center", marginTop: 8 }}>
        <div className="g-prog" role="progressbar" aria-label="Clientes pagantes até a meta" aria-valuemin={0} aria-valuemax={p.meta} aria-valuenow={Math.min(p.hoje, p.meta)}>
          <i style={{ width: `${Math.min(100, (p.hoje / p.meta) * 100)}%` }} />
        </div>
        <span className="g-tab" style={{ fontWeight: 600 }}>{p.hoje} de {p.meta}</span>
      </div>
      <p className="g-pp g-muted" style={{ marginTop: 6 }}>
        {chegou ? "Meta alcançada." : `Faltam ${faltam} ${faltam === 1 ? "cliente pagante" : "clientes pagantes"}.`}{" "}
        Conta quem está <b>ativa</b> (pagamento em dia) ou <b>atrasada</b> (a assinatura continua, só a cobrança do mês não passou e a Cakto tenta de novo).
        Teste, cortesia e cancelada ficam de fora, mesmo cancelada com o mês já pago.
      </p>

      {chegou ? (
        <div className="g-card menta" style={{ marginTop: 14, display: "grid", gap: 12 }} data-teste="hora-da-empresa">
          <p style={{ display: "flex", gap: 10, alignItems: "center", font: "500 1.25rem/1.25 var(--display)", margin: 0 }}>
            <PartyPopper aria-hidden style={{ flex: "none" }} /> Chegou a hora de abrir a empresa
          </p>
          <p className="g-p" style={{ margin: 0 }}>Você tem {p.hoje} clientes pagantes. Siga os passos abaixo, na ordem. Feitos: {feitos} de {PASSOS.length}.</p>
          {lista}
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <button className="g-fila entre" style={{ width: "100%", background: "none", border: 0, padding: 0, color: "inherit", textAlign: "left" }} aria-expanded={aberto} onClick={() => setAberto((a) => !a)}>
            <span>
              <b>Quando chegar em {p.meta}</b>
              <span className="g-pp g-muted" style={{ display: "block" }}>O que fazer para abrir a empresa. Feitos: {feitos} de {PASSOS.length}.</span>
            </span>
            {aberto ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
          </button>
          {aberto && <div style={{ marginTop: 12 }}>{lista}</div>}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <p className="g-rotulo">No fim de cada mês</p>
        {confiaveis.length ? (
          <>
            <div className="g-barras" style={{ marginTop: 12, height: 120, gridAutoColumns: "minmax(0, 1fr)" }} role="img"
              aria-label={`Clientes pagantes no fim de cada mês: ${p.meses.map((m) => `${nomeMes(m.mes)} ${m.confiavel ? m.n : "sem registro"}`).join(", ")}.`}>
              {p.meses.map((m) => (
                <div key={m.mes} title={m.confiavel ? `${nomeMes(m.mes)}: ${m.n}` : `${nomeMes(m.mes)}: sem registro confiável`}>
                  <span className="g-tab">{m.confiavel ? m.n : "—"}</span>
                  {m.confiavel ? <i className={m.n ? undefined : "fraco"} style={{ height: `${Math.round((m.n / maior) * 80)}px` }} /> : <i className="fraco" style={{ height: 3, opacity: .4 }} />}
                  <span>{nomeMes(m.mes)}</span>
                </div>
              ))}
            </div>
            <p className="g-pp g-muted" style={{ marginTop: 8 }}>
              Calculado pelo registro de mudanças de status{p.historico_desde ? `, que começou em ${dataCompleta(new Date(p.historico_desde))}` : ""}.
              {confiaveis.length < p.meses.length && " Os meses com — são de antes desse registro: não dá para saber quantos pagavam."}
              {" "}Contas apagadas não entram.
            </p>
          </>
        ) : (
          <p className="g-pp g-muted" style={{ marginTop: 6 }} data-teste="sem-historico">
            Ainda não dá para mostrar a evolução mês a mês com segurança: {p.historico_desde
              ? `o registro de mudanças de status começou em ${dataCompleta(new Date(p.historico_desde))}, depois do fim do último mês fechado.`
              : "ainda não há registro de mudanças de status."} Por enquanto, vale só o número de hoje.
          </p>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <p className="g-rotulo">Quem paga hoje</p>
        {!p.lojas.length ? <p className="g-pp g-muted" style={{ marginTop: 6 }}>Nenhum pet shop pagando ainda.</p> : (
          <div className="g-lista" style={{ marginTop: 8 }} data-teste="pagantes-lista">
            {p.lojas.map((l) => (
              <div key={l.id} className="g-linha" style={{ minWidth: 0 }}>
                <span className="t" style={{ minWidth: 0 }}>
                  <b style={{ overflowWrap: "anywhere" }}>{l.nome}</b>
                  <span className="g-tab" style={{ whiteSpace: "normal" }}>
                    {l.desde ? `pagante desde ${dataCompleta(new Date(l.desde))}` : "sem data de início registrada"}
                    {l.status === "atrasada" && l.status_desde ? ` · atrasada desde ${dataCompleta(new Date(l.status_desde))}` : ""}
                    {l.pago_ate ? ` · pago até ${dataCompleta(new Date(l.pago_ate))}` : ""}
                  </span>
                </span>
                <span className={`g-tag ${l.status === "ativa" ? "verde" : "amarelo"}`}>{l.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
