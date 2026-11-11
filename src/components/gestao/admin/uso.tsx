"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Vazio } from "@/components/gestao/ui";
import { hora, semAcento } from "@/lib/gestao/util";

export type Uso = {
  id: string; visto_em: string | null; online: number; min_7d: number; min_30d: number; dias_30d: number;
  areas: Record<string, number>; pessoas: { nome: string; visto_em: string; area: string | null }[]; mozart_30d: number; ajuda_30d: number;
};
export type LojaBasica = { id: string; nome: string; dono_nome: string | null };

/** As partes do sistema, na ordem do menu. O Mozart e a Ajuda contam por conversa, não por tempo de tela. */
export const AREAS: { id: string; nome: string }[] = [
  { id: "hoje", nome: "Hoje" }, { id: "agenda", nome: "Agenda" }, { id: "clientes", nome: "Clientes e pets" }, { id: "creche-hotel", nome: "Creche e hotel" },
  { id: "pacotes", nome: "Pacotes" }, { id: "caixa", nome: "Caixa" }, { id: "financeiro", nome: "Financeiro" }, { id: "relatorios", nome: "Relatórios" },
  { id: "estoque", nome: "Estoque" }, { id: "equipe", nome: "Equipe" }, { id: "meu-petshop", nome: "Meu pet shop" }, { id: "assinatura", nome: "Assinatura" },
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

type Ordem = "recente" | "tempo" | "sumidos";

export default function AbaUso({ lojas, uso, aoAbrir }: { lojas: LojaBasica[]; uso: Uso[]; aoAbrir: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("recente");
  const porId = useMemo(() => new Map(uso.map((u) => [u.id, u])), [uso]);
  const linhas = useMemo(() => {
    const alvo = semAcento(busca);
    const l = lojas.filter((x) => !alvo || semAcento(`${x.nome} ${x.dono_nome ?? ""}`).includes(alvo)).map((loja) => ({ loja, u: porId.get(loja.id) }));
    const t = (d?: string | null) => (d ? new Date(d).getTime() : 0);
    if (ordem === "tempo") l.sort((a, b) => (b.u?.min_7d ?? 0) - (a.u?.min_7d ?? 0));
    else if (ordem === "sumidos") l.sort((a, b) => t(a.u?.visto_em) - t(b.u?.visto_em));
    else l.sort((a, b) => t(b.u?.visto_em) - t(a.u?.visto_em));
    return l;
  }, [lojas, porId, busca, ordem]);

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

      <section className="g-pilha">
        <h2>Uso por pet shop</h2>
        <div className="g-busca">
          <Search />
          <input className="g-input" type="search" placeholder="Nome do pet shop ou do dono" aria-label="Buscar pet shop" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="g-chips">
          {([["recente", "Vistos por último"], ["tempo", "Mais tempo em 7 dias"], ["sumidos", "Sumidos primeiro"]] as [Ordem, string][]).map(([id, r]) => (
            <button key={id} className="g-chip" aria-pressed={ordem === id} onClick={() => setOrdem(id)}>{r}</button>
          ))}
        </div>
        {!linhas.length ? <Vazio titulo="Nenhum pet shop." texto="Tente outro nome." /> : (
          <div className="g-pilha p">
            {linhas.map(({ loja, u }) => {
              const usadas = AREAS.filter((a) => (u?.areas[a.id] ?? 0) > 0).sort((a, b) => (u!.areas[b.id] ?? 0) - (u!.areas[a.id] ?? 0));
              const nunca = AREAS.filter((a) => !(u?.areas[a.id] ?? 0));
              const agora = (u?.online ?? 0) > 0;
              return (
                <button key={loja.id} className="g-card" style={{ textAlign: "left", color: "inherit", width: "100%", cursor: "pointer", display: "grid", gap: 8 }} onClick={() => aoAbrir(loja.id)}>
                  <span className="g-fila entre">
                    <b style={{ font: "500 1.125rem/1.2 var(--display)", minWidth: 0, overflowWrap: "anywhere" }}>{loja.nome}</b>
                    <span className={`g-tag ${agora ? "verde" : u?.visto_em ? "" : "vermelho"}`}>{vistoHa(u?.visto_em ?? null)}</span>
                  </span>
                  <span className="g-pp g-muted g-tab">
                    {tempo(u?.min_7d ?? 0)} em 7 dias · {tempo(u?.min_30d ?? 0)} em 30 dias · entrou em {u?.dias_30d ?? 0} {u?.dias_30d === 1 ? "dia" : "dias"} dos últimos 30 · {u?.mozart_30d ?? 0} conversas com o Mozart · {u?.ajuda_30d ?? 0} pedidos de ajuda
                  </span>
                  {usadas.length > 0 && <span className="g-pp" style={{ overflowWrap: "anywhere" }}><b>Usa:</b> {usadas.map((a) => `${a.nome} (${tempo(u!.areas[a.id])})`).join(" · ")}</span>}
                  {nunca.length > 0 && <span className="g-pp g-muted" style={{ overflowWrap: "anywhere" }}><b>Não abriu em 30 dias:</b> {nunca.map((a) => a.nome).join(" · ")}</span>}
                  {(u?.pessoas.length ?? 0) > 0 && <span className="g-pp g-muted" style={{ overflowWrap: "anywhere" }}>{u!.pessoas.slice(0, 4).map((p) => `${p.nome}: ${vistoHa(p.visto_em).replace("visto ", "")}${Date.now() - new Date(p.visto_em).getTime() < 180000 && p.area ? `, em ${nomeArea(p.area)}` : Date.now() - new Date(p.visto_em).getTime() < 864e5 ? ` (${hora(p.visto_em)})` : ""}`).join(" · ")}</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>
      <p className="g-pp g-muted">O tempo conta só com a tela do sistema aberta e visível. A contagem começou quando este painel foi publicado.</p>
    </div>
  );
}
