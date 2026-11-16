"use client";

import { useCallback, useEffect, useState } from "react";
import { Bug, CheckCircle2, Monitor, RotateCcw, Server } from "lucide-react";
import { Esqueleto, Vazio, mensagemDeErro, ok, useAvisos } from "@/components/gestao/ui";
import { banco } from "@/lib/gestao/supabase";
import { haQuanto } from "@/lib/gestao/util";
import { AREAS } from "@/lib/gestao/acessos";

/** Um erro agrupado pela assinatura (mensagem + primeira linha da pilha + rota). Só dados técnicos e quantidades. */
type Grupo = {
  assinatura: string; origem: "navegador" | "servidor"; tipo: string; nome: string | null; mensagem: string; pilha: string | null; rota: string | null;
  vezes: number; aparelhos: number; lojas: number; primeiro_em: string; ultimo_em: string;
  versoes: string[]; navegadores: string[]; telas: string[]; papeis: string[]; areas: string[];
  resolvido_em: string | null; voltou: boolean;
};
type Resposta = { grupos: Grupo[]; sem_internet: number; descartados: number };

const PERIODOS = [[24, "Últimas 24 horas"], [24 * 7, "7 dias"], [24 * 30, "30 dias"]] as const;
const TIPO: Record<string, string> = {
  erro: "erro no código", promessa: "erro no código (em segundo plano)", tela: "tela travou", banco: "o banco recusou", servidor: "erro no servidor",
};
const PAPEL: Record<string, string> = { dono: "dono", equipe: "equipe", anonimo: "sem login (link, tutor, entrada)", logado: "logado fora de um pet shop" };
const nomeArea = (a: string) => AREAS.find((x) => x.id === a)?.rotulo ?? a;
/** Há quanto tempo, em minutos e horas no mesmo dia. */
function ha(d: string) {
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  return haQuanto(d);
}
const lista = (v: string[], max = 4) => (v.length > max ? `${v.slice(0, max).join(", ")} e mais ${v.length - max}` : v.join(", "));

/** Erros que as pessoas encontraram no aplicativo, agrupados. Marcar como resolvido esconde até voltar numa versão nova. */
export default function AbaErros() {
  const { avisar, avisarErro } = useAvisos();
  const [horas, setHoras] = useState<number>(24);
  const [verResolvidos, setVerResolvidos] = useState(false);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [indo, setIndo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(ok(await banco().rpc("admin_erros", { p_horas: horas, p_resolvidos: verResolvidos })) as unknown as Resposta);
      setErro(null);
    } catch (e) { setErro(mensagemDeErro(e)); }
  }, [horas, verResolvidos]);
  useEffect(() => { setDados(null); void carregar(); }, [carregar]);

  async function marcar(g: Grupo, resolvido: boolean) {
    setIndo(g.assinatura);
    try {
      ok(await banco().rpc("admin_erro_resolver", { p_assinatura: g.assinatura, p_resolvido: resolvido }));
      avisar(resolvido ? "Marcado como resolvido. Volta a aparecer se acontecer numa versão nova." : "Voltou para a lista.");
      await carregar();
    } catch (e) { avisarErro(e); } finally { setIndo(null); }
  }

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  const grupos = dados?.grupos ?? [];
  const total = grupos.reduce((s, g) => s + Number(g.vezes), 0);

  return (
    <div className="g-pilha">
      <div className="g-chips" role="group" aria-label="Período">
        {PERIODOS.map(([h, r]) => <button key={h} className="g-chip" aria-pressed={horas === h} onClick={() => setHoras(h)}>{r}</button>)}
        <button className="g-chip" aria-pressed={verResolvidos} onClick={() => setVerResolvidos((v) => !v)}>Mostrar resolvidos</button>
      </div>
      {!dados ? <Esqueleto linhas={4} /> : (
        <>
          <p className="g-pp g-muted g-tab" data-teste="erros-resumo">
            {grupos.length} {grupos.length === 1 ? "erro diferente" : "erros diferentes"} · {total} {total === 1 ? "vez" : "vezes"} no período
            {dados.sem_internet > 0 && <> · {dados.sem_internet} {Number(dados.sem_internet) === 1 ? "falha" : "falhas"} sem internet (só contadas)</>}
            {dados.descartados > 0 && <> · {dados.descartados} envios descartados pelo limite</>}
          </p>
          {!grupos.length ? <Vazio titulo="Nenhum erro no período." texto="Quando alguém encontrar um erro no aplicativo, ele aparece aqui, sem dados de clientes." /> : (
            <div className="g-pilha p">
              {grupos.map((g) => {
                const aberta = aberto === g.assinatura;
                return (
                  <article key={g.assinatura} className="g-card" style={{ display: "grid", gap: 8 }} data-teste="erro-grupo">
                    <div className="g-fila entre" style={{ alignItems: "flex-start" }}>
                      <span className="g-fila" style={{ gap: 8, minWidth: 0, flex: "1 1 220px", alignItems: "flex-start" }}>
                        <span className={`g-tile p ${g.origem === "servidor" ? "lilas" : g.tipo === "banco" ? "manteiga" : "rosa"}`} aria-hidden>{g.origem === "servidor" ? <Server /> : g.tipo === "banco" ? <Bug /> : <Monitor />}</span>
                        <b style={{ overflowWrap: "anywhere", minWidth: 0 }}>{g.mensagem}</b>
                      </span>
                      <span className="g-fila" style={{ gap: 6 }}>
                        <span className="g-tag">{TIPO[g.tipo] ?? g.tipo}</span>
                        {g.voltou && <span className="g-tag vermelho">voltou</span>}
                        {g.resolvido_em && !g.voltou && <span className="g-tag verde">resolvido</span>}
                      </span>
                    </div>
                    <p className="g-pp g-muted g-tab" style={{ overflowWrap: "anywhere" }}>
                      <b style={{ color: "var(--g-tinta)" }}>{g.vezes} {Number(g.vezes) === 1 ? "vez" : "vezes"}</b> · {g.aparelhos} {g.aparelhos === 1 ? "aparelho" : "aparelhos"} · {g.lojas} {g.lojas === 1 ? "pet shop" : "pet shops"}
                      {" "}· primeira vez {ha(g.primeiro_em)} · última {ha(g.ultimo_em)}
                    </p>
                    <p className="g-pp g-muted" style={{ overflowWrap: "anywhere" }}>
                      Onde: <code>{g.rota ?? "sem rota"}</code>{g.versoes.length ? <> · versão {lista(g.versoes, 3)}</> : null}{g.navegadores.length ? <> · {lista(g.navegadores, 3)}</> : null}
                    </p>
                    {aberta && (
                      <div className="g-pilha p">
                        {g.pilha && <pre className="g-pp" style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "var(--g-fundo, #f6f3ee)", padding: 10, borderRadius: 10 }}>{g.pilha}</pre>}
                        <p className="g-pp g-muted" style={{ overflowWrap: "anywhere" }}>
                          {g.nome ? <>Tipo: {g.nome} · </> : null}
                          Quem: {g.papeis.map((p) => PAPEL[p] ?? p).join(", ") || "não informado"}
                          {g.areas.length ? <> · áreas: {g.areas.map(nomeArea).join(", ")}</> : null}
                          {g.telas.length ? <> · telas: {lista(g.telas, 5)}</> : null}
                        </p>
                      </div>
                    )}
                    <div className="g-fila">
                      <button className="g-btn fantasma p" onClick={() => setAberto(aberta ? null : g.assinatura)} aria-expanded={aberta}>{aberta ? "Esconder detalhes" : "Ver detalhes"}</button>
                      {g.resolvido_em && !g.voltou
                        ? <button className="g-btn sec p" disabled={indo === g.assinatura} onClick={() => void marcar(g, false)}><RotateCcw /> Voltar para a lista</button>
                        : <button className="g-btn verde p" disabled={indo === g.assinatura} onClick={() => void marcar(g, true)}><CheckCircle2 /> Marcar como resolvido</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
