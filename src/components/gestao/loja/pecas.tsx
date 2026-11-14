"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Plus, Split, Trash2 } from "lucide-react";
import { caixaAberto, formaPrincipal, ultimoContado, VALOR_MAXIMO, type PartePagamento } from "@/lib/gestao/dinheiro";
import { FORMAS } from "@/lib/gestao/tipos";
import { brl, isoDia, lerValor, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AVISO_SEM_MENOS, avisarMudanca, useAvisos, useDados } from "../ui";
import "./loja.css";
import "../financeiro/recebimentos.css";

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

/* ---------- forma de pagamento: sempre escolhida na hora ---------- */

/**
 * Toda tela que recebe dinheiro começa sem forma de pagamento marcada: a pessoa escolhe a cada recebimento.
 * (Antes a última forma usada vinha marcada, e um Pix virava "Dinheiro" sem ninguém perceber.)
 */
export function useFormaLembrada() {
  return useState<Forma | null>(null);
}
/** Não guarda mais nada: as telas começam sem forma marcada. Fica para as telas que ainda chamam. */
export function lembrarForma(forma: Forma) { void forma; }

/* ---------- pagamento dividido ---------- */

const centavos = (n: number) => Math.round(n * 100) / 100;
/** Máximo de formas num pagamento dividido. */
const MAX_PARTES = 3;

/** Uma parte enquanto a pessoa digita. */
export type ParteDigitada = { forma: Forma | null; valor: number | null };
/** O que a pessoa escolheu para receber: uma forma só, ou o pagamento dividido em partes. */
export type EstadoPagamento = { forma: Forma | null; dividido: boolean; partes: ParteDigitada[]; ultimaManual: boolean };

export const pagamentoInicial = (forma: Forma | null = null): EstadoPagamento => ({ forma, dividido: false, partes: [], ultimaManual: false });

/** Pagamento de uma tela que recebe: começa sem forma marcada. */
export function usePagamento() {
  return useState<EstadoPagamento>(() => pagamentoInicial());
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
        {e.forma === "dinheiro" && total > 0 && <Troco devido={total} />}
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
  // "Fecha certinho" só depois de a pessoa escolher as formas e os valores: antes disso a frase não quer dizer nada
  const preenchido = c.partes.every((p) => p.forma && Number(p.valor) > 0);
  const emDinheiro = c.partes.find((p) => p.forma === "dinheiro" && Number(p.valor) > 0);
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
      {(c.falta > 0 || c.passou > 0 || preenchido) && (
        <p className={`g-pg-conta${c.falta > 0 || c.passou > 0 ? " erro" : " certo"}`} role="status">
          {c.passou > 0 ? `Passou ${brl(c.passou)} do total de ${brl(total)}.`
            : c.falta > 0 ? `Falta ${brl(c.falta)} para fechar ${brl(total)}.`
            : `Fecha certinho com o total de ${brl(total)}.`}
          {(c.falta > 0 || (c.passou > 0 && e.ultimaManual)) && (
            <button type="button" className="g-pg-link" onClick={() => aoMudar({ ...e, ultimaManual: false })}>Completar a última parte</button>
          )}
        </p>
      )}
      {emDinheiro && <Troco devido={Number(emDinheiro.valor)} parte />}
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

/**
 * Calculadora de troco: aparece quando o pagamento (ou uma parte dele) é em dinheiro.
 * É só uma ajuda para quem está no balcão: o que fica anotado é sempre o valor da conta, nunca o que foi digitado aqui.
 */
export function Troco({ devido, parte }: { devido: number; parte?: boolean }) {
  const [recebeu, setRecebeu] = useState<number | null>(null);
  // o que está escrito no campo: texto que não é número ("cem") ganha um aviso em vez de ficar sem resposta
  const [escrito, setEscrito] = useState("");
  const naoENumero = escrito.trim() !== "" && recebeu == null;
  const troco = recebeu == null ? null : centavos(recebeu - devido);
  return (
    <div className="g-pg-troco">
      <label onInput={(e) => setEscrito((e.target as HTMLInputElement).value ?? "")}>
        <span>Recebeu quanto?</span>
        <CampoDinheiro valor={recebeu} aoMudar={setRecebeu} rotulo="Recebeu quanto em dinheiro" maximo={99999999} />
      </label>
      <p role="status" className={troco != null && troco < 0 ? "falta" : undefined}>
        {naoENumero ? <span className="g-erro">Escreva o valor só com números, como 100,00.</span>
          : troco == null ? <span className="g-muted">{parte ? "Se quiser, escreva quanto ele entregou em dinheiro para ver o troco." : "Se quiser, escreva quanto o cliente entregou para ver o troco."}</span>
          : troco > 0 ? <>Troco: <b className="g-tab">{brl(troco)}</b></>
          : troco === 0 ? "Sem troco." : <>Faltam <b className="g-tab">{brl(-troco)}</b> para {brl(devido)}.</>}
      </p>
    </div>
  );
}

/* ---------- paga agora (uma forma ou dividido) ou paga depois ---------- */

/** "Cliente paga depois": a conta fica em A receber, com o dia combinado. */
export type PagaDepois = { ativo: boolean; quando: string };
/** Começa em "Paga agora"; se mudar para depois, o dia combinado já vem daqui a 7 dias. */
export const pagaDepoisInicial = (): PagaDepois => ({ ativo: false, quando: isoDia(somaDias(new Date(), 7)) });

/**
 * Como a conta é recebida, igual em toda tela que recebe dinheiro (comanda, pacote, check-out):
 * "Paga agora" com a forma de pagamento (que pode ser dividida) ou "Cliente paga depois" com o dia combinado.
 */
export function QuandoPaga({ total, pagamento, aoPagamento, depois, aoDepois, erro }: {
  total: number; pagamento: EstadoPagamento; aoPagamento: (e: EstadoPagamento) => void;
  depois: PagaDepois; aoDepois: (d: PagaDepois) => void; erro?: string | null;
}) {
  return (
    <>
      {total > 0 && (
        <div className="g-seg g-pg-quando" role="group" aria-label="Quando o cliente paga">
          <button type="button" aria-pressed={!depois.ativo} onClick={() => aoDepois({ ...depois, ativo: false })}>Paga agora</button>
          <button type="button" aria-pressed={depois.ativo} onClick={() => aoDepois({ ...depois, ativo: true })}>Cliente paga depois</button>
        </div>
      )}
      {depois.ativo && total > 0 ? (
        <label className="g-campo">
          <span>Quando vai pagar</span>
          <input type="date" className="g-input" value={depois.quando} min={isoDia(new Date())} onChange={(e) => aoDepois({ ...depois, quando: e.target.value })} />
          <small>A conta fica anotada em Financeiro, A receber, e na ficha do tutor. Quando o cliente pagar, é só dar baixa.</small>
          {erro && <small className="erro" role="alert">{erro}</small>}
        </label>
      ) : <EscolhaPagamento valor={pagamento} aoMudar={aoPagamento} total={total} erro={erro} />}
    </>
  );
}

/**
 * Confere o recebimento escolhido em `QuandoPaga`. Devolve o erro em português (`noCampo` é o texto para mostrar junto do campo),
 * ou o que gravar: a conta a receber (`fiado`, com o dia) ou o pagamento de agora (`forma` e `pagamentos`).
 */
export function fecharRecebimento(pagamento: EstadoPagamento, depois: PagaDepois, total: number):
  { erro: string; noCampo: string } | { fiado: true; quando: string } | { fiado: false; forma: Forma; pagamentos: PartePagamento[] | null } {
  const ruim = erroDeValor(total);
  if (ruim) return { erro: ruim, noCampo: ruim };
  if (depois.ativo) {
    if (!depois.quando) return { erro: "Escolha quando o cliente vai pagar.", noCampo: "Escolha um dia de hoje em diante." };
    if (depois.quando < isoDia(new Date())) return { erro: "A data em que o cliente vai pagar já passou. Escolha um dia de hoje em diante.", noCampo: "Essa data já passou. Escolha um dia de hoje em diante." };
    return { fiado: true, quando: depois.quando };
  }
  const pg = fecharPagamento(pagamento, total);
  if ("erro" in pg) return { erro: pg.erro, noCampo: pagamento.dividido ? pg.erro : "Escolha como o cliente pagou." };
  return { fiado: false, ...pg };
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
  const { avisar } = useAvisos();
  useEffect(() => {
    if (valor !== ultimo.current) { ultimo.current = valor; setTexto(valor == null ? "" : duasCasas(valor)); }
  }, [valor]);
  return (
    <input id={id} className="g-input g-tab" inputMode="decimal" placeholder={placeholder} autoFocus={autoFocus} value={texto} disabled={desligado} aria-label={rotulo}
      aria-invalid={valor != null && valor > maximo ? true : undefined}
      onChange={(e) => {
        const limpo = e.target.value.replace(/-/g, "");
        if (limpo !== e.target.value) avisar(AVISO_SEM_MENOS);
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

/**
 * Aviso ao receber com o caixa fechado. Quem tem a área Caixa abre o caixa ali mesmo, sem sair do que estava fazendo:
 * o troco inicial já vem com o último valor contado.
 */
export function AvisoCaixaFechado({ aberto }: { aberto: boolean | null }) {
  const { sb, petshop, user, posso, liberado } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [abrindo, setAbrindo] = useState(false);
  const [abriu, setAbriu] = useState(false);
  const [troco, setTroco] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  // abriu o caixa daqui: a confirmação fica na tela até a pessoa terminar o recebimento
  if (abriu) {
    return <p className="g-cx-fora ok" role="status"><Lock aria-hidden /><span>Caixa aberto. Este valor entra na contagem da gaveta.</span></p>;
  }
  if (aberto !== false) return null;
  async function comecar() {
    setAbrindo(true);
    const ultimo = await ultimoContado(sb, petshop.id);
    if (ultimo != null) setTroco((t) => t ?? ultimo);
  }
  async function abrir() {
    if (salvando) return;
    if (troco != null && (troco < 0 || troco >= 1e8)) { avisarErro("Confira o troco inicial."); return; }
    setSalvando(true);
    try {
      const r = await sb.from("caixas").insert({ petshop_id: petshop.id, valor_inicial: troco ?? 0, aberto_por: user.id });
      // já havia um caixa aberto (alguém abriu em outro aparelho): vale o que está aberto
      if (r.error && r.error.code !== "23505") throw new Error(r.error.message);
      await caixaAberto(sb, petshop.id);
      setAbriu(true);
      avisar("Caixa aberto.");
      avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }
  return (
    <div className="g-cx-fora" role="status">
      <Lock aria-hidden />
      <div>
        <span>O caixa de hoje não está aberto. O valor fica anotado, mas não entra na contagem da gaveta.</span>
        {posso("caixa") && liberado && !abrindo && <div><button type="button" className="g-btn sec p" onClick={() => void comecar()}>Abrir o caixa agora</button></div>}
        {abrindo && (
          <div className="g-cx-abrir">
            <label>
              <span>Troco inicial em dinheiro</span>
              <CampoDinheiro valor={troco} aoMudar={setTroco} rotulo="Troco inicial em dinheiro" maximo={99999999} />
            </label>
            <button type="button" className="g-btn sec p" onClick={() => void abrir()} disabled={salvando}>{salvando ? "Abrindo…" : "Abrir o caixa"}</button>
          </div>
        )}
      </div>
    </div>
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
