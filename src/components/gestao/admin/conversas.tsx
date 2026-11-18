"use client";

import { useEffect, useMemo, useState } from "react";
import { LifeBuoy, LockKeyholeOpen, Mic, Search } from "lucide-react";
import { Esqueleto, Vazio, mensagemDeErro, ok } from "@/components/gestao/ui";
import { banco } from "@/lib/gestao/supabase";
import { dataCompleta, hora, semAcento } from "@/lib/gestao/util";

/** O que `admin_conversas` devolve (migração 20261236): metadados, sem o texto ("pergunta" vem vazia). */
type Conversa = {
  id: string; petshop_id: string; petshop: string; canal: "mozart" | "ajuda";
  resolveu: boolean | null; pediu_equipe: boolean; criado_em: string;
  letras_pergunta?: number; letras_resposta?: number; aberta_em?: string | null;
};
type Filtro = "tudo" | "mozart" | "ajuda" | "problema";
type Tempos = { pedidos: number; mediana_ms: number | null; p90_ms: number | null; primeiro_mediana_ms: number | null; primeiro_p90_ms: number | null; voltas_media: number | null };

const seg = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`);

/** "Tempo do Mozart": quanto os pedidos levaram nos últimos 7 dias (mediana e p90), e até a primeira palavra aparecer. */
function TempoDoMozart() {
  const [t, setT] = useState<Tempos | null>(null);
  useEffect(() => {
    let vale = true;
    (async () => { try { const r = ok(await banco().rpc("admin_mozart_tempos")) as unknown as Tempos; if (vale) setT(r); } catch { /* sem a migração: a linha não aparece */ } })();
    return () => { vale = false; };
  }, []);
  if (!t) return null;
  return (
    <p className="g-pp g-muted g-tab" style={{ overflowWrap: "anywhere" }}>
      <b style={{ color: "var(--g-tinta)" }}>Tempo do Mozart</b> (7 dias, {t.pedidos} {t.pedidos === 1 ? "pedido" : "pedidos"}):{" "}
      {t.pedidos ? <>resposta completa em {seg(t.mediana_ms)} (mediana), {seg(t.p90_ms)} (p90) · primeira palavra ou aviso em {seg(t.primeiro_mediana_ms)} (mediana), {seg(t.primeiro_p90_ms)} (p90) · {String(t.voltas_media ?? 0).replace(".", ",")} voltas em média</> : "nenhum pedido ainda."}
    </p>
  );
}

type Numeros = {
  dias: number; conversas: number; mozart: number; ajuda: number; nao_resolveu: number; resolveu: number; pediu_equipe: number; lojas: number;
  pedidos: number; erros: number; recusas: number; limites: number; ferramentas: number; tokens_entrada: number; tokens_saida: number; tokens_cache: number; aberturas: number;
};
type Aberta = { pergunta: string; resposta: string | null; pessoa: string | null };
const mil = (n: number) => Number(n ?? 0).toLocaleString("pt-BR");

/** Os números dos últimos 30 dias: conversas, problemas, pedidos ao Mozart, erros, ferramentas usadas e tokens. Sem texto nenhum. */
function NumerosDasConversas({ petshopId }: { petshopId?: string }) {
  const [n, setN] = useState<Numeros | null>(null);
  useEffect(() => {
    let vale = true;
    (async () => {
      try { const r = ok(await banco().rpc("admin_conversas_numeros", { p_petshop: petshopId, p_dias: 30 })) as unknown as Numeros; if (vale) setN(r); } catch { /* sem a migração: os números não aparecem */ }
    })();
    return () => { vale = false; };
  }, [petshopId]);
  if (!n) return null;
  const itens: [string, string][] = [
    ["Conversas", `${mil(n.conversas)} (${mil(n.mozart)} Mozart, ${mil(n.ajuda)} Ajuda)`],
    ["Não resolveu", mil(n.nao_resolveu)], ["Pediu a equipe", mil(n.pediu_equipe)],
    ["Pedidos ao Mozart", mil(n.pedidos)], ["Erros ou demora", mil(n.erros)], ["Ferramentas usadas", mil(n.ferramentas)],
    ["Tokens", `${mil(n.tokens_entrada)} de entrada, ${mil(n.tokens_saida)} de saída`], ["Conversas abertas para suporte", mil(n.aberturas)],
  ];
  return (
    <dl className="g-card g-tab" data-teste="numeros-conversas" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px 16px", margin: 0 }}>
      {itens.map(([r, v]) => <div key={r}><dt className="g-pp g-muted">{r} ({n.dias} dias)</dt><dd style={{ margin: 0, fontWeight: 600, overflowWrap: "anywhere" }}>{v}</dd></div>)}
    </dl>
  );
}

/**
 * Conversas com o Mozart e a Ajuda, para a equipe Maestro Pet ver onde o sistema precisa melhorar. Por padrão só números e
 * metadados (qual pet shop, canal, quando, tamanho, se resolveu): o texto NÃO vem do banco. Para ler uma conversa é preciso
 * "Abrir para suporte" e escrever o motivo; a abertura fica registrada (quem, quando e por quê) e o dono do pet shop vê a
 * lista em Meu pet shop. É o que a Política de privacidade (parte 9) e os Termos (parte 10) dizem.
 */
export default function AbaConversas({ petshopId, enxuto }: { petshopId?: string; enxuto?: boolean }) {
  const [itens, setItens] = useState<Conversa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [busca, setBusca] = useState("");
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erroAbrir, setErroAbrir] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const [abertas, setAbertas] = useState<Record<string, Aberta>>({});

  useEffect(() => {
    let vale = true;
    (async () => {
      try {
        const r = ok(await banco().rpc("admin_conversas", { p_petshop: petshopId, p_limite: enxuto ? 60 : 500 })) as unknown as Conversa[];
        if (vale) setItens(r ?? []);
      } catch (e) { if (vale) setErro(mensagemDeErro(e)); }
    })();
    return () => { vale = false; };
  }, [petshopId, enxuto]);

  const problema = (c: Conversa) => c.resolveu === false || c.pediu_equipe;
  const visiveis = useMemo(() => {
    const alvo = semAcento(busca);
    return (itens ?? []).filter((c) => (filtro === "tudo" || (filtro === "problema" ? problema(c) : c.canal === filtro))
      && (!alvo || semAcento(c.petshop).includes(alvo)));
  }, [itens, filtro, busca]);

  async function abrir(c: Conversa) {
    if (indo) return;
    if (motivo.trim().length < 10) { setErroAbrir("Escreva o motivo (pelo menos 10 letras). Ele fica registrado e o dono do pet shop vê."); return; }
    setIndo(true); setErroAbrir(null);
    try {
      const r = ok(await banco().rpc("admin_conversa_abrir", { p_conversa: c.id, p_motivo: motivo.trim() })) as unknown as Aberta;
      setAbertas((a) => ({ ...a, [c.id]: r }));
      setItens((l) => (l ?? []).map((x) => (x.id === c.id ? { ...x, aberta_em: new Date().toISOString() } : x)));
      setAbrindo(null); setMotivo("");
    } catch (e) { setErroAbrir(mensagemDeErro(e)); } finally { setIndo(false); }
  }

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!itens) return <Esqueleto linhas={4} />;
  const n = { mozart: itens.filter((c) => c.canal === "mozart").length, ajuda: itens.filter((c) => c.canal === "ajuda").length, problema: itens.filter(problema).length };

  return (
    <div className="g-pilha">
      {!enxuto && !petshopId && <TempoDoMozart />}
      {!enxuto && <NumerosDasConversas petshopId={petshopId} />}
      <p className="g-pp g-muted" data-teste="aviso-conversas" style={{ overflowWrap: "anywhere" }}>
        Aqui aparecem só números. O texto de uma conversa pode citar clientes e valores do pet shop: para ler, toque em Abrir para suporte e escreva o motivo.
        Cada abertura fica registrada e o dono do pet shop vê.
      </p>
      {!enxuto && !petshopId && (
        <div className="g-busca">
          <Search />
          <input className="g-input" type="search" placeholder="Filtrar pelo nome do pet shop" aria-label="Filtrar pelo nome do pet shop" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      )}
      <div className="g-chips">
        {([["tudo", "Tudo", itens.length], ["problema", "Não resolveu ou pediu a equipe", n.problema], ["ajuda", "Ajuda", n.ajuda], ["mozart", "Mozart", n.mozart]] as [Filtro, string, number][]).map(([id, r, q]) => (
          <button key={id} className="g-chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{r} <span className="g-tab" style={{ opacity: .65 }}>{q}</span></button>
        ))}
      </div>
      {!itens.length ? <Vazio titulo="Nenhuma conversa ainda." texto="Quando alguém falar com o Mozart ou abrir a Ajuda, aparece aqui." />
        : !visiveis.length ? <Vazio titulo="Nada com esse filtro." texto="Tente outro nome ou outro filtro." />
        : (
          <div className="g-pilha p">
            {visiveis.map((c) => {
              const lida = abertas[c.id];
              return (
                <article key={c.id} className="g-card" data-teste="conversa" style={{ display: "grid", gap: 8 }}>
                  <div className="g-fila entre">
                    <span className="g-fila" style={{ gap: 8, minWidth: 0 }}>
                      <span className={`g-tile p ${c.canal === "mozart" ? "pessego" : "ceu"}`} aria-hidden>{c.canal === "mozart" ? <Mic /> : <LifeBuoy />}</span>
                      <span className="g-pp g-muted" style={{ overflowWrap: "anywhere" }}>
                        <b style={{ color: "var(--g-tinta)" }}>{c.canal === "mozart" ? "Mozart" : "Ajuda"}</b>{petshopId ? "" : ` · ${c.petshop}`} · {dataCompleta(new Date(c.criado_em))} às {hora(c.criado_em)}
                      </span>
                    </span>
                    <span className="g-fila" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {c.resolveu === true && <span className="g-tag verde">resolveu</span>}
                      {c.resolveu === false && <span className="g-tag vermelho">não resolveu</span>}
                      {c.pediu_equipe && <span className="g-tag amarelo">foi para a equipe</span>}
                      {c.aberta_em && <span className="g-tag">aberta para suporte</span>}
                    </span>
                  </div>
                  <p className="g-pp g-muted g-tab">Pedido com {mil(c.letras_pergunta ?? 0)} letras · resposta com {mil(c.letras_resposta ?? 0)} letras</p>
                  {lida ? (
                    <>
                      <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}><b>Pediu{lida.pessoa ? ` (${lida.pessoa})` : ""}:</b> {lida.pergunta}</p>
                      {lida.resposta && <p className="g-p g-muted" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}><b>Resposta:</b> {lida.resposta}</p>}
                    </>
                  ) : abrindo === c.id ? (
                    <form className="g-pilha p" onSubmit={(e) => { e.preventDefault(); void abrir(c); }}>
                      <label className="g-campo"><span>Por que você precisa ler esta conversa?</span>
                        <textarea className="g-textarea" rows={2} maxLength={300} value={motivo} onChange={(e) => { setMotivo(e.target.value); setErroAbrir(null); }} placeholder="Ex.: a dona pediu ajuda pelo WhatsApp sobre esta resposta" autoFocus />
                        <small>Fica registrado com o seu nome e a hora. O dono do pet shop vê em Meu pet shop.</small>
                      </label>
                      {erroAbrir && <p className="g-erro" role="alert">{erroAbrir}</p>}
                      <div className="g-fila" style={{ gap: 8, flexWrap: "wrap" }}>
                        <button type="submit" className="g-btn pri" disabled={indo}>{indo ? "Abrindo…" : "Abrir e registrar"}</button>
                        <button type="button" className="g-btn sec" onClick={() => { setAbrindo(null); setMotivo(""); setErroAbrir(null); }} disabled={indo}>Voltar</button>
                      </div>
                    </form>
                  ) : (
                    <div><button type="button" className="g-btn sec" onClick={() => { setAbrindo(c.id); setMotivo(""); setErroAbrir(null); }}><LockKeyholeOpen />Abrir para suporte</button></div>
                  )}
                </article>
              );
            })}
          </div>
        )}
    </div>
  );
}
