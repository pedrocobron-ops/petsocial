"use client";

import { useState } from "react";
import type { Banco } from "@/lib/gestao/supabase";
import { AREAS_DE_SERVICO, type AreaDoServico } from "@/lib/gestao/modulos";
import { lerValor, lerValorEstrito, valor2 } from "@/lib/gestao/util";
import { CORES } from "./ajustes/grade-horario";
import { ok } from "./ui";
import "./ajustes/ajustes.css";
import "./servico-campos.css";

/**
 * Peças do serviço usadas no guia da primeira vez (passo "O que vocês fazem e quanto custa?") e em Meu pet shop
 * (Serviços e preços): preço único ou por porte, área do serviço, cor livre e a gravação. Os dois lugares se comportam igual.
 */
export const CAMPOS_PRECO = ["preco_p", "preco_m", "preco_g", "preco_gg"] as const;
export type CampoDePreco = (typeof CAMPOS_PRECO)[number];
export type Precos = Record<CampoDePreco, number | null>;
const NOME_PORTE: Record<string, string> = { P: "pequeno", M: "médio", G: "grande", GG: "gigante" };

/** Banho e tosa costumam mudar de preço com o porte; os serviços rápidos (unha, hidratação) quase sempre têm um preço só. */
export function comecaPorPorte(s: Precos): boolean {
  const v = CAMPOS_PRECO.map((c) => s[c]);
  // sem preço ainda: começa com um campo só (menos para digitar no primeiro dia); "Por porte" é um toque
  if (v.every((x) => x == null)) return false;
  return !v.every((x) => x === v[0]);
}
/** Um preço só: o primeiro valor preenchido passa a valer para todos os portes. */
export function umPrecoSo(s: Precos): Precos {
  const v = CAMPOS_PRECO.map((c) => s[c]).find((x) => x != null) ?? null;
  return { preco_p: v, preco_m: v, preco_g: v, preco_gg: v };
}

/** O que está errado no preço digitado (null = certo ou em branco). */
export function erroDoPreco(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  const r = lerValorEstrito(t, { negativo: true });
  if (r.erro || r.valor == null) return "use só números, ex.: 50,00";
  if (r.valor < 0) return "não pode ser negativo";
  if (r.valor > 99999) return "valor alto demais";
  return null;
}

/** Preço de um porte: guarda o texto, avisa o que está errado embaixo do campo e só passa adiante valor que vale. */
function CampoPreco({ porte, servico, valor, aoMudar }: { porte: string; servico: string; valor: number | null; aoMudar: (v: number | null, erro: string | null) => void }) {
  const [texto, setTexto] = useState(valor == null ? "" : valor2(valor));
  const erro = erroDoPreco(texto);
  return (
    <label>
      <span>{porte === "todos" ? "Preço" : porte}</span>
      <input className={`g-input g-tab${erro ? " ruim" : ""}`} inputMode="decimal" placeholder="R$" value={texto} aria-invalid={!!erro}
        aria-label={porte === "todos" ? `${servico}, preço para todos os portes` : `${servico}, porte ${NOME_PORTE[porte] ?? porte}`}
        onChange={(e) => { setTexto(e.target.value); const ruim = erroDoPreco(e.target.value); aoMudar(ruim ? null : lerValor(e.target.value), ruim); }}
        onBlur={() => { if (!erro && texto.trim()) { const n = lerValor(texto); if (n != null) setTexto(valor2(n)); } }} />
      {erro && <small className="erro" role="alert">{erro}</small>}
    </label>
  );
}

/**
 * "Um preço só" ou "Por porte" e os campos de preço. `aoMudar` recebe os campos que mudaram, a chave do campo (para o erro) e o erro.
 * Trocar de modo é com quem usa: `umPrecoSo` ao voltar para um preço só.
 */
export function PrecosDoServico({ servico, valores, porPorte, aoTrocarModo, aoMudar }: {
  servico: string; valores: Precos; porPorte: boolean; aoTrocarModo: (porPorte: boolean) => void;
  aoMudar: (campos: Partial<Precos>, chave: string, erro: string | null) => void;
}) {
  return (
    <div className="g-sv-precos">
      <div className="g-seg" role="group" aria-label={`Como é o preço de ${servico}`}>
        <button type="button" aria-pressed={!porPorte} onClick={() => aoTrocarModo(false)}>Um preço só</button>
        <button type="button" aria-pressed={porPorte} onClick={() => aoTrocarModo(true)}>Por porte</button>
      </div>
      {porPorte ? (
        <div className="precos">
          {CAMPOS_PRECO.map((c) => (
            <CampoPreco key={c} porte={c.replace("preco_", "").toUpperCase()} servico={servico} valor={valores[c]}
              aoMudar={(v, ruim) => aoMudar({ [c]: v }, c, ruim)} />
          ))}
        </div>
      ) : (
        <div className="precos um">
          <CampoPreco key="todos" porte="todos" servico={servico} valor={valores.preco_p}
            aoMudar={(v, ruim) => aoMudar({ preco_p: v, preco_m: v, preco_g: v, preco_gg: v }, "todos", ruim)} />
          <small>Vale para todos os portes.</small>
        </div>
      )}
    </div>
  );
}

/** Banho e tosa, Creche, Hotel ou Loja: só as áreas que o pet shop usa. Com uma área só, não aparece (quem usa decide). */
export function EscolherArea({ areas, valor, aoMudar, servico }: { areas: AreaDoServico[]; valor: AreaDoServico; aoMudar: (a: AreaDoServico) => void; servico: string }) {
  if (areas.length < 2) return null;
  return (
    <div className="g-sv-area">
      <span className="g-rotulo">Área</span>
      <div className="g-chips" role="group" aria-label={`Área de ${servico}`}>
        {AREAS_DE_SERVICO.filter((a) => areas.includes(a.id)).map((a) => (
          <button key={a.id} type="button" className="g-chip" aria-pressed={valor === a.id} onClick={() => aoMudar(a.id)}>{a.rotulo}</button>
        ))}
      </div>
    </div>
  );
}

/** Uma cor da agenda que nenhum serviço ativo usa ainda (a primeira da lista); com todas usadas, roda a lista. */
export function corLivre(usadas: (string | null | undefined)[]): string {
  const em = new Set(usadas.filter(Boolean).map((c) => c!.toLowerCase()));
  return CORES.find((c) => !em.has(c)) ?? CORES[em.size % CORES.length];
}

type LinhaServico = {
  nome: string; categoria: string; duracao_min: number; cor: string; ordem?: number; ativo?: boolean;
} & Precos;
/** Antes da migração 20261179, o banco não conhece a categoria 'loja': o serviço da loja entra como 'outro'. */
const semLoja = (e: { message?: string } | null) => !!e && /servicos_categoria_check/.test(e.message ?? "");

/** Grava um serviço novo e devolve o id. */
export async function inserirServico(sb: Banco, petshopId: string, linha: LinhaServico): Promise<string> {
  let r = await sb.from("servicos").insert({ ...linha, petshop_id: petshopId }).select("id").single();
  if (semLoja(r.error) && linha.categoria === "loja") r = await sb.from("servicos").insert({ ...linha, categoria: "outro", petshop_id: petshopId }).select("id").single();
  return ok(r).id;
}
/** Muda um serviço que já existe. */
export async function mudarServico(sb: Banco, petshopId: string, id: string, campos: Partial<LinhaServico>): Promise<void> {
  let r = await sb.from("servicos").update(campos).eq("id", id).eq("petshop_id", petshopId).select("id");
  if (semLoja(r.error) && campos.categoria === "loja") r = await sb.from("servicos").update({ ...campos, categoria: "outro" }).eq("id", id).eq("petshop_id", petshopId).select("id");
  ok(r);
}
