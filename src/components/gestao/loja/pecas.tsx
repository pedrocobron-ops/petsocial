"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { caixaAberto, VALOR_MAXIMO } from "@/lib/gestao/dinheiro";
import { FORMAS } from "@/lib/gestao/tipos";
import { brl, lerValor } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { useDados } from "../ui";
import "./loja.css";

export type Forma = (typeof FORMAS)[number]["id"];

/** Forma de pagamento em chips. Sem nenhuma marcada (`null`), a pessoa precisa escolher. */
export function ChipsForma({ valor, aoMudar, erro }: { valor: Forma | null; aoMudar: (f: Forma) => void; erro?: string | null }) {
  return (
    <div className="g-campo">
      <span>Forma de pagamento</span>
      <div className="g-chips" role="group" aria-label="Forma de pagamento">
        {FORMAS.map((f) => (
          <button key={f.id} type="button" className="g-chip" aria-pressed={valor === f.id} onClick={() => aoMudar(f.id)}>{f.rotulo}</button>
        ))}
      </div>
      {erro && <small className="erro" role="alert">{erro}</small>}
    </div>
  );
}

/* ---------- forma de pagamento lembrada neste aparelho ---------- */

const CHAVE_FORMA = "maestro-gestao-forma";
const ehForma = (s: unknown): s is Forma => FORMAS.some((f) => f.id === s);

/** Última forma de pagamento usada neste aparelho (ou null). */
export function formaLembrada(): Forma | null {
  try {
    const s = window.localStorage.getItem(CHAVE_FORMA);
    return ehForma(s) ? s : null;
  } catch { return null; }
}
/** Guarda a forma usada num recebimento, para vir marcada na próxima vez. */
export function lembrarForma(f: Forma) {
  try { window.localStorage.setItem(CHAVE_FORMA, f); } catch { /* aparelho sem armazenamento: segue sem lembrar */ }
}
/** Forma de pagamento que começa na última usada neste aparelho; sem nenhuma, começa vazia. */
export function useFormaLembrada() {
  const [forma, setForma] = useState<Forma | null>(null);
  const mexeu = useRef(false);
  useEffect(() => { if (!mexeu.current) setForma(formaLembrada()); }, []);
  return [forma, (f: Forma) => { mexeu.current = true; setForma(f); }] as const;
}

/* ---------- dinheiro ---------- */

/** Mensagem quando o valor não serve (negativo ou grande demais); null quando está certo. */
export function erroDeValor(v: number | null | undefined, oQue = "O valor"): string | null {
  if (v == null) return null;
  if (v < 0) return `${oQue} não pode ser negativo.`;
  if (v > VALOR_MAXIMO) return `${oQue} passa do máximo de ${brl(VALOR_MAXIMO)}. Confira os números.`;
  return null;
}

const duasCasas = (n: number) => brl(n).replace("R$", "").trim();

/**
 * Campo de dinheiro das telas de agenda, venda e caixa: mostra sempre duas casas ("45,50"),
 * não aceita sinal de menos e marca em vermelho quando passa do valor máximo.
 */
export function CampoDinheiro({ valor, aoMudar, placeholder = "0,00", autoFocus, id, desligado, rotulo, maximo = VALOR_MAXIMO }: {
  valor: number | null; aoMudar: (v: number | null) => void; placeholder?: string; autoFocus?: boolean; id?: string; desligado?: boolean; rotulo?: string; maximo?: number;
}) {
  const [texto, setTexto] = useState(valor == null ? "" : duasCasas(valor));
  const ultimo = useRef(valor);
  useEffect(() => {
    if (valor !== ultimo.current) { ultimo.current = valor; setTexto(valor == null ? "" : duasCasas(valor)); }
  }, [valor]);
  return (
    <input id={id} className="g-input g-tab" inputMode="decimal" placeholder={placeholder} autoFocus={autoFocus} value={texto} disabled={desligado} aria-label={rotulo}
      aria-invalid={valor != null && valor > maximo ? true : undefined}
      onChange={(e) => {
        const limpo = e.target.value.replace(/-/g, "");
        setTexto(limpo);
        const n = lerValor(limpo);
        ultimo.current = n;
        aoMudar(n);
      }}
      onBlur={() => { if (ultimo.current != null) setTexto(duasCasas(ultimo.current)); }} />
  );
}

/* ---------- caixa fechado ---------- */

/** O caixa está aberto agora? `null` enquanto não sabe (ou para quem não vê o financeiro). */
export function useCaixaAberto() {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { dados } = useDados(async () => (vejoFinanceiro ? Boolean(await caixaAberto(sb, petshop.id)) : null), [petshop.id, vejoFinanceiro]);
  return dados ?? null;
}

/** Aviso curto ao receber com o caixa fechado, com atalho para abrir (só para quem tem acesso ao caixa). */
export function AvisoCaixaFechado({ aberto }: { aberto: boolean | null }) {
  const { posso } = useGestao();
  if (aberto !== false) return null;
  return (
    <p className="g-cx-fora" role="status">
      <Lock aria-hidden />
      <span>O caixa está fechado: este valor não entra na conferência da gaveta.{" "}
        {posso("caixa") && <Link href="/gestao/app/caixa">Abrir o caixa</Link>}
      </span>
    </p>
  );
}

/** Chips de escolha única. */
export function Chips<T extends string>({ opcoes, valor, aoMudar }: {
  opcoes: readonly { id: T; rotulo: string }[]; valor: T; aoMudar: (v: T) => void;
}) {
  return (
    <div className="g-chips">
      {opcoes.map((o) => (
        <button key={o.id} type="button" className="g-chip" aria-pressed={valor === o.id} onClick={() => aoMudar(o.id)}>{o.rotulo}</button>
      ))}
    </div>
  );
}

/** Lê uma quantidade digitada ("10", "2,5"). Devolve null se não for número positivo ou zero. */
export function lerQtd(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

/** "10", "2,5", "0,125" */
export const fmtQtd = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Erro de carregamento com botão de tentar de novo. */
export function ErroTela({ erro, aoTentar }: { erro: string; aoTentar: () => void }) {
  return (
    <div className="g-aviso vermelho" role="alert">
      <span>{erro}</span>
      <button type="button" className="g-btn sec p" onClick={aoTentar}>Tentar de novo</button>
    </div>
  );
}
