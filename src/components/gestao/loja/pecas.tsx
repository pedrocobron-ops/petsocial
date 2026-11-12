"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Lock, Plus, Split, Trash2 } from "lucide-react";
import { caixaAberto, formaPrincipal, VALOR_MAXIMO, type PartePagamento } from "@/lib/gestao/dinheiro";
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

/* ---------- pagamento dividido ---------- */

const centavos = (n: number) => Math.round(n * 100) / 100;
/** Máximo de formas num pagamento dividido. */
const MAX_PARTES = 3;

/** Uma parte enquanto a pessoa digita. */
export type ParteDigitada = { forma: Forma | null; valor: number | null };
/** O que a pessoa escolheu para receber: uma forma só, ou o pagamento dividido em partes. */
export type EstadoPagamento = { forma: Forma | null; dividido: boolean; partes: ParteDigitada[]; ultimaManual: boolean };

export const pagamentoInicial = (forma: Forma | null = null): EstadoPagamento => ({ forma, dividido: false, partes: [], ultimaManual: false });

/** Pagamento que começa na última forma usada neste aparelho. */
export function usePagamento() {
  const [estado, setEstado] = useState<EstadoPagamento>(() => pagamentoInicial());
  const mexeu = useRef(false);
  useEffect(() => { if (!mexeu.current) setEstado(pagamentoInicial(formaLembrada())); }, []);
  return [estado, (e: EstadoPagamento) => { mexeu.current = true; setEstado(e); }] as const;
}

/** As partes com a última completada sozinha (enquanto a pessoa não mexeu nela), e quanto falta ou passou do total. */
export function contasDoPagamento(e: EstadoPagamento, total: number) {
  const ultima = e.partes.length - 1;
  const outras = centavos(e.partes.slice(0, ultima).reduce((s, p) => s + (p.valor ?? 0), 0));
  const partes = e.partes.map((p, i) => (i === ultima && !e.ultimaManual ? { ...p, valor: Math.max(0, centavos(total - outras)) } : p));
  const soma = centavos(partes.reduce((s, p) => s + (p.valor ?? 0), 0));
  return { partes, soma, falta: Math.max(0, centavos(total - soma)), passou: Math.max(0, centavos(soma - total)) };
}

/**
 * Confere o pagamento escolhido contra o total. Devolve o erro em português, ou o que gravar:
 * `forma` (no dividido, a de maior valor) e `pagamentos` (as partes; null quando é uma forma só).
 */
export function fecharPagamento(e: EstadoPagamento, total: number): { erro: string } | { forma: Forma; pagamentos: PartePagamento[] | null } {
  if (!e.dividido) return e.forma ? { forma: e.forma, pagamentos: null } : { erro: "Escolha a forma de pagamento." };
  const c = contasDoPagamento(e, total);
  if (c.partes.some((p) => !p.forma)) return { erro: "Escolha a forma de cada parte do pagamento." };
  if (c.partes.some((p) => !(Number(p.valor) > 0))) return { erro: "Cada parte do pagamento precisa ter um valor. Se sobrou uma parte, tire." };
  if (new Set(c.partes.map((p) => p.forma)).size !== c.partes.length) return { erro: "Duas partes estão com a mesma forma. Escolha formas diferentes." };
  if (c.falta > 0) return { erro: `As partes não fecham com o total: falta ${brl(c.falta)}.` };
  if (c.passou > 0) return { erro: `As partes passam do total em ${brl(c.passou)}.` };
  const pagamentos = c.partes.map((p) => ({ forma: p.forma!, valor: centavos(p.valor!) }));
  return { forma: formaPrincipal(pagamentos), pagamentos };
}

/**
 * Forma de pagamento com a opção de dividir em duas ou três formas (parte no Pix, parte em dinheiro).
 * A última parte se completa sozinha com o que falta para o total.
 */
export function EscolhaPagamento({ valor: e, aoMudar, total, erro, rotulo = "Forma de pagamento" }: {
  valor: EstadoPagamento; aoMudar: (e: EstadoPagamento) => void; total: number; erro?: string | null; rotulo?: string;
}) {
  if (!e.dividido) {
    return (
      <div className="g-campo">
        <span>{rotulo}</span>
        <div className="g-chips" role="group" aria-label={rotulo}>
          {FORMAS.map((f) => (
            <button key={f.id} type="button" className="g-chip" aria-pressed={e.forma === f.id} onClick={() => aoMudar({ ...e, forma: f.id })}>{f.rotulo}</button>
          ))}
        </div>
        {erro && <small className="erro" role="alert">{erro}</small>}
        {total > 0.01 && (
          <div>
            <button type="button" className="g-btn fantasma p g-pg-dividir"
              onClick={() => aoMudar({ ...e, dividido: true, ultimaManual: false, partes: [{ forma: e.forma, valor: null }, { forma: null, valor: null }] })}>
              <Split />Dividir o pagamento
            </button>
          </div>
        )}
      </div>
    );
  }
  const c = contasDoPagamento(e, total);
  const ultima = e.partes.length - 1;
  const mudarParte = (i: number, m: Partial<ParteDigitada>) => aoMudar({
    ...e, partes: e.partes.map((p, n) => (n === i ? { ...p, ...m } : p)),
    ultimaManual: e.ultimaManual || (i === ultima && "valor" in m),
  });
  const usadas = (i: number) => new Set(e.partes.filter((_, n) => n !== i).map((p) => p.forma));
  return (
    <div className="g-campo g-pg">
      <span>Pagamento dividido</span>
      <div className="g-pg-partes">
        {c.partes.map((p, i) => (
          <div className="g-pg-parte" key={i}>
            <select className="g-select" value={p.forma ?? ""} aria-label={`Forma da ${i + 1}ª parte`} onChange={(ev) => mudarParte(i, { forma: (ev.target.value || null) as Forma | null })}>
              <option value="">Escolha a forma</option>
              {FORMAS.map((f) => <option key={f.id} value={f.id} disabled={usadas(i).has(f.id)}>{f.rotulo}</option>)}
            </select>
            <CampoDinheiro valor={p.valor} aoMudar={(v) => mudarParte(i, { valor: v })} rotulo={`Valor da ${i + 1}ª parte`} />
            {e.partes.length > 2 ? (
              <button type="button" className="g-ico" aria-label={`Tirar a ${i + 1}ª parte`}
                onClick={() => aoMudar({ ...e, partes: e.partes.filter((_, n) => n !== i), ultimaManual: false })}><Trash2 /></button>
            ) : null}
          </div>
        ))}
      </div>
      <p className={`g-pg-conta${c.falta > 0 || c.passou > 0 ? " erro" : " certo"}`} role="status">
        {c.passou > 0 ? `Passou ${brl(c.passou)} do total de ${brl(total)}.`
          : c.falta > 0 ? `Falta ${brl(c.falta)} para fechar ${brl(total)}.`
          : `Fecha certinho com o total de ${brl(total)}.`}
        {(c.falta > 0 || (c.passou > 0 && e.ultimaManual)) && (
          <button type="button" className="g-pg-link" onClick={() => aoMudar({ ...e, ultimaManual: false })}>Completar a última parte</button>
        )}
      </p>
      {!e.ultimaManual && c.passou === 0 && <small>A última parte se completa sozinha com o que falta.</small>}
      {erro && <small className="erro" role="alert">{erro}</small>}
      <div className="g-pg-acoes">
        {e.partes.length < MAX_PARTES && (
          <button type="button" className="g-btn fantasma p" onClick={() => aoMudar({ ...e, partes: [...e.partes, { forma: null, valor: null }], ultimaManual: false })}><Plus />Mais uma forma</button>
        )}
        <button type="button" className="g-btn fantasma p" onClick={() => aoMudar({ ...e, dividido: false, partes: [], ultimaManual: false, forma: e.partes[0]?.forma ?? e.forma })}>Pagar com uma forma só</button>
      </div>
    </div>
  );
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
