"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Vazio } from "@/components/gestao/ui";
import { haQuanto, hora, semAcento } from "@/lib/gestao/util";

export type Uso = {
  id: string; visto_em: string | null; online: number; min_7d: number; min_30d: number; dias_30d: number;
  areas: Record<string, number>; pessoas: { nome: string; visto_em: string; area: string | null }[]; mozart_30d: number; ajuda_30d: number;
};
export type LojaBasica = { id: string; nome: string; dono_nome: string | null };
/** O que `admin_uso_contas` devolve por pet shop: datas e quantidades dos últimos 14 dias, sem nome de cliente, pet ou valor. */
export type UsoConta = {
  id: string; nome: string; status: string; plano: string; teste_ate: string; criado_em: string; limite: number; pessoas: number;
  ultimo_login: string | null; visto_em: string | null; ultima_gravacao: string | null; dias_14: number;
  agendamentos_14: number; vendas_14: number; creche_14: number; hotel_14: number; clientes_14: number; areas_14: string[];
  /** perguntas no "Tirar dúvida" do link (banco antes da 20261176: ausente) */
  ia_link_14?: number;
};

const DIA = 864e5;
const tms = (d: string | null | undefined) => (d ? new Date(d).getTime() : 0);
/** Última vez que alguém da conta fez algo: entrou, abriu uma tela ou gravou. */
export const ultimaAtividade = (c: UsoConta) => Math.max(tms(c.ultimo_login), tms(c.visto_em), tms(c.ultima_gravacao)) || null;
export const acoes14 = (c: UsoConta) => c.agendamentos_14 + c.vendas_14 + c.creche_14 + c.hotel_14 + c.clientes_14;
const emTeste = (c: UsoConta, agora: number) => c.status === "teste" && tms(c.teste_ate) > agora;

export type Sinal = "risco" | "sumido" | "limite" | "fim_teste";
export const SINAIS: { id: Sinal; rotulo: string; cor: string }[] = [
  { id: "fim_teste", rotulo: "Teste acaba em 2 dias", cor: "azul" },
  { id: "risco", rotulo: "Em teste e quase sem uso", cor: "vermelho" },
  { id: "sumido", rotulo: "Não entra há 7 dias ou mais", cor: "amarelo" },
  { id: "limite", rotulo: "Perto do limite de pessoas", cor: "laranja" },
];
/** Os sinais de cada conta. Conta cancelada não recebe sinal. */
export function sinaisDe(c: UsoConta, agora: number): Sinal[] {
  if (c.status === "cancelada") return [];
  const s: Sinal[] = [];
  if (emTeste(c, agora) && tms(c.teste_ate) - agora <= 2 * DIA) s.push("fim_teste");
  // em teste há pelo menos um dia, com menos de 5 coisas lançadas em 14 dias e uso em no máximo 1 dia
  if (emTeste(c, agora) && agora - tms(c.criado_em) >= DIA && acoes14(c) < 5 && c.dias_14 <= 1) s.push("risco");
  const ult = ultimaAtividade(c);
  if (!ult || agora - ult >= 7 * DIA) s.push("sumido");
  if (c.limite > 1 ? c.pessoas >= c.limite - 1 : c.pessoas >= c.limite) s.push("limite");
  return s;
}

/** As partes do sistema, na ordem do menu. O Mozart e a Ajuda contam por conversa, não por tempo de tela. */
export const AREAS: { id: string; nome: string }[] = [
  { id: "hoje", nome: "Hoje" }, { id: "agenda", nome: "Agenda" }, { id: "clientes", nome: "Clientes e pets" }, { id: "creche-hotel", nome: "Creche e hotel" },
  { id: "pacotes", nome: "Pacotes" }, { id: "caixa", nome: "Caixa" }, { id: "financeiro", nome: "Financeiro" }, { id: "relatorios", nome: "Relatórios" },
  { id: "estoque", nome: "Estoque" }, { id: "equipe", nome: "Equipe" }, { id: "meu-petshop", nome: "Meu pet shop" }, { id: "assinatura", nome: "Assinatura" }, { id: "escola", nome: "Escola de Gestão" },
];
const nomeArea = (id: string | null) => AREAS.find((a) => a.id === id)?.nome ?? id ?? "";

export function tempo(min: number) {
  if (!min) return "0 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
export function vistoHa(d: string | null) {
  if (!d) return "nunca entrou";
  const min = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 3) return "online agora";
  if (min < 60) return `visto há ${min} min`;
  if (min < 24 * 60) return `visto há ${Math.floor(min / 60)} h`;
  const dias = Math.floor(min / 1440);
  return dias === 1 ? "visto ontem" : `visto há ${dias} dias`;
}

type Ordem = "recente" | "sumidos" | "dias" | "acoes" | "tempo";

export default function AbaUso({ lojas, uso, contas, aoAbrir }: { lojas: LojaBasica[]; uso: Uso[]; contas: UsoConta[]; aoAbrir: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recente");
  const [sinal, setSinal] = useState<Sinal | "todos">("todos");
  const [mostrar, setMostrar] = useState(50);
  const agora = useMemo(() => Date.now(), [contas]); // eslint-disable-line react-hooks/exhaustive-deps
  const porId = useMemo(() => new Map(uso.map((u) => [u.id, u])), [uso]);
  const contaDe = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);
  const sinais = useMemo(() => new Map(contas.map((c) => [c.id, sinaisDe(c, agora)])), [contas, agora]);
  const linhas = useMemo(() => {
    const alvo = semAcento(busca);
    const l = lojas.filter((x) => (!alvo || semAcento(`${x.nome} ${x.dono_nome ?? ""}`).includes(alvo)) && (sinal === "todos" || (sinais.get(x.id) ?? []).includes(sinal)))
      .map((loja) => ({ loja, u: porId.get(loja.id), c: contaDe.get(loja.id) }));
    const ult = (c?: UsoConta) => (c ? ultimaAtividade(c) ?? 0 : 0);
    if (ordem === "tempo") l.sort((a, b) => (b.u?.min_7d ?? 0) - (a.u?.min_7d ?? 0));
    else if (ordem === "sumidos") l.sort((a, b) => ult(a.c) - ult(b.c));
    else if (ordem === "dias") l.sort((a, b) => (b.c?.dias_14 ?? 0) - (a.c?.dias_14 ?? 0) || ult(b.c) - ult(a.c));
    else if (ordem === "acoes") l.sort((a, b) => (b.c ? acoes14(b.c) : 0) - (a.c ? acoes14(a.c) : 0));
    else l.sort((a, b) => ult(b.c) - ult(a.c));
    return l;
  }, [lojas, porId, contaDe, sinais, busca, ordem, sinal]);

  const online = uso.filter((u) => u.online > 0).length;
  const ativos7 = uso.filter((u) => u.min_7d > 0).length;
  const total7 = uso.reduce((s, u) => s + u.min_7d, 0);
  // quantos pet shops abriram cada parte do sistema em 30 dias
  const porArea = AREAS.map((a) => ({ ...a, lojas: uso.filter((u) => (u.areas[a.id] ?? 0) > 0).length, min: uso.reduce((s, u) => s + (u.areas[a.id] ?? 0), 0) }));
  const comMozart = uso.filter((u) => u.mozart_30d > 0).length, comAjuda = uso.filter((u) => u.ajuda_30d > 0).length;
  const base = Math.max(1, lojas.length);

  return (
    <div className="g-pilha g">
      <section className="g-grade c4" aria-label="Uso em números">
        <div className="g-card"><p className="g-rotulo">Online agora</p><p className="g-num" style={{ marginTop: 10 }}>{online}</p></div>
        <div className="g-card"><p className="g-rotulo">Usaram em 7 dias</p><p className="g-num" style={{ marginTop: 10 }}>{ativos7}</p><p className="g-pp g-muted" style={{ marginTop: 6 }}>de {lojas.length} cadastrados</p></div>
        <div className="g-card"><p className="g-rotulo">Tempo de uso em 7 dias</p><p className="g-num m" style={{ marginTop: 10 }}>{tempo(total7)}</p></div>
        <div className="g-card"><p className="g-rotulo">Média por pet shop ativo</p><p className="g-num m" style={{ marginTop: 10 }}>{tempo(ativos7 ? Math.round(total7 / ativos7) : 0)}</p><p className="g-pp g-muted" style={{ marginTop: 6 }}>em 7 dias</p></div>
      </section>

      <section className="g-pilha">
        <h2>Uso por pet shop</h2>
        <p className="g-pp g-muted">Últimos 14 dias. Conta só quantidades: agendamentos criados, vendas e recebimentos lançados no caixa, presenças na creche, hospedagens e clientes novos.</p>
        <div className="g-busca">
          <Search />
          <input className="g-input" type="search" placeholder="Nome do pet shop ou do dono" aria-label="Buscar pet shop" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="g-chips" role="group" aria-label="Sinais">
          <button className="g-chip" aria-pressed={sinal === "todos"} onClick={() => setSinal("todos")}>Todos <span className="g-tab" style={{ opacity: .65 }}>{lojas.length}</span></button>
          {SINAIS.map((x) => (
            <button key={x.id} className="g-chip" aria-pressed={sinal === x.id} onClick={() => setSinal(x.id)}>
              {x.rotulo} <span className="g-tab" style={{ opacity: .65 }}>{contas.filter((c) => (sinais.get(c.id) ?? []).includes(x.id)).length}</span>
            </button>
          ))}
        </div>
        <label className="g-fila" style={{ gap: 8 }}>
          <span className="g-pp g-muted">Ordem</span>
          <select className="g-select" style={{ maxWidth: 280 }} value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} aria-label="Ordem da lista">
            <option value="recente">Atividade mais recente</option>
            <option value="sumidos">Sumidos primeiro</option>
            <option value="dias">Mais dias de uso em 14</option>
            <option value="acoes">Mais coisas lançadas em 14 dias</option>
            <option value="tempo">Mais tempo de tela em 7 dias</option>
          </select>
        </label>
        {!linhas.length ? <Vazio titulo="Nenhum pet shop." texto="Tente outro nome ou outro sinal." /> : (
          <div className="g-pilha p">
            {linhas.slice(0, mostrar).map(({ loja, u, c }) => {
              const usadas = AREAS.filter((a) => (u?.areas[a.id] ?? 0) > 0).sort((a, b) => (u!.areas[b.id] ?? 0) - (u!.areas[a.id] ?? 0));
              const nunca = AREAS.filter((a) => !(u?.areas[a.id] ?? 0));
              const online = (u?.online ?? 0) > 0;
              const ult = c ? ultimaAtividade(c) : null;
              const meus = sinais.get(loja.id) ?? [];
              return (
                <button key={loja.id} className="g-card" style={{ textAlign: "left", color: "inherit", width: "100%", cursor: "pointer", display: "grid", gap: 8 }} onClick={() => aoAbrir(loja.id)}>
                  <span className="g-fila entre">
                    <b style={{ font: "500 1.125rem/1.2 var(--display)", minWidth: 0, overflowWrap: "anywhere" }}>{loja.nome}</b>
                    <span className={`g-tag ${online ? "verde" : ult ? "" : "vermelho"}`}>{online ? "online agora" : ult ? `ativo ${haQuanto(new Date(ult))}` : "nunca usou"}</span>
                  </span>
                  {meus.length > 0 && (
                    <span className="g-fila" style={{ gap: 6 }}>
                      {meus.map((m) => { const x = SINAIS.find((y) => y.id === m)!; return <span key={m} className={`g-tag ${x.cor}`}>{x.rotulo}</span>; })}
                    </span>
                  )}
                  {c && (
                    <span className="g-pp g-tab" style={{ overflowWrap: "anywhere" }}>
                      Usou em <b>{c.dias_14} de 14 dias</b> · {c.agendamentos_14} agendamentos · {c.vendas_14} vendas e recebimentos · {c.creche_14} presenças na creche · {c.hotel_14} hospedagens · {c.clientes_14} clientes novos{c.ia_link_14 ? ` · ${c.ia_link_14} dúvidas no link` : ""}
                    </span>
                  )}
                  {c && (
                    <span className="g-pp g-muted g-tab" style={{ overflowWrap: "anywhere" }}>
                      Último login: {haQuanto(c.ultimo_login)} · última gravação: {c.ultima_gravacao ? haQuanto(c.ultima_gravacao) : "nenhuma"} · equipe: {c.pessoas} de {c.limite} {c.limite === 1 ? "pessoa" : "pessoas"} do plano
                    </span>
                  )}
                  <span className="g-pp g-muted g-tab">
                    Tela aberta: {tempo(u?.min_7d ?? 0)} em 7 dias · {tempo(u?.min_30d ?? 0)} em 30 dias · {u?.mozart_30d ?? 0} conversas com o Mozart · {u?.ajuda_30d ?? 0} pedidos de ajuda
                  </span>
                  {usadas.length > 0 && <span className="g-pp" style={{ overflowWrap: "anywhere" }}><b>Usa:</b> {usadas.map((a) => `${a.nome} (${tempo(u!.areas[a.id])})`).join(" · ")}</span>}
                  {nunca.length > 0 && <span className="g-pp g-muted" style={{ overflowWrap: "anywhere" }}><b>Não abriu em 30 dias:</b> {nunca.map((a) => a.nome).join(" · ")}</span>}
                  {(u?.pessoas.length ?? 0) > 0 && <span className="g-pp g-muted" style={{ overflowWrap: "anywhere" }}>{u!.pessoas.slice(0, 4).map((p) => `${p.nome}: ${vistoHa(p.visto_em).replace("visto ", "")}${Date.now() - new Date(p.visto_em).getTime() < 180000 && p.area ? `, em ${nomeArea(p.area)}` : Date.now() - new Date(p.visto_em).getTime() < 864e5 ? ` (${hora(p.visto_em)})` : ""}`).join(" · ")}</span>}
                </button>
              );
            })}
            {linhas.length > mostrar && <button className="g-btn sec" onClick={() => setMostrar((m) => m + 50)}>Mostrar mais {Math.min(50, linhas.length - mostrar)} de {linhas.length - mostrar}</button>}
          </div>
        )}
      </section>

      <section className="g-card">
        <p className="g-rotulo">O que é usado · 30 dias</p>
        <p className="g-pp g-muted" style={{ marginTop: 4 }}>Quantos pet shops abriram cada parte do sistema, e por quanto tempo no total.</p>
        <div className="g-pilha p" style={{ marginTop: 14 }}>
          {[...porArea].sort((a, b) => b.lojas - a.lojas || b.min - a.min).map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) 2fr auto", gap: 12, alignItems: "center", opacity: a.lojas ? 1 : .55 }}>
              <span className="g-p">{a.nome}</span>
              <div className="g-prog"><i style={{ width: `${(a.lojas / base) * 100}%` }} /></div>
              <span className="g-pp g-muted g-tab" style={{ minWidth: 120, textAlign: "right" }}>{a.lojas ? `${a.lojas} · ${tempo(a.min)}` : "ninguém usou"}</span>
            </div>
          ))}
          {[{ nome: "Mozart (conversas)", n: comMozart }, { nome: "Ajuda (conversas)", n: comAjuda }].map((a) => (
            <div key={a.nome} style={{ display: "grid", gridTemplateColumns: "minmax(110px, 1fr) 2fr auto", gap: 12, alignItems: "center", opacity: a.n ? 1 : .55 }}>
              <span className="g-p">{a.nome}</span>
              <div className="g-prog"><i style={{ width: `${(a.n / base) * 100}%` }} /></div>
              <span className="g-pp g-muted g-tab" style={{ minWidth: 120, textAlign: "right" }}>{a.n ? `${a.n} ${a.n === 1 ? "pet shop" : "pet shops"}` : "ninguém usou"}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="g-pp g-muted">O tempo conta só com a tela do sistema aberta e visível. A contagem começou quando este painel foi publicado.</p>
    </div>
  );
}
