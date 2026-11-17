"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Lock, Plus, Split, Trash2 } from "lucide-react";
import { caixaAberto, formaPrincipal, ultimoContado, VALOR_MAXIMO, type PartePagamento } from "@/lib/gestao/dinheiro";
import { aoMudarTaxas, calcularTaxa, carregarTaxas, lojaPerguntaParcelas, perguntaParcelas, temTaxa, type TaxasMaquininha } from "@/lib/gestao/maquininha";
import { FORMAS } from "@/lib/gestao/tipos";
import { brl, isoDia, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { avisarMudanca, useAvisos, useCampoDeValor, useDados } from "../ui";
import "./loja.css";
import "../financeiro/recebimentos.css";
import "../ajustes/taxas-maquininha.css";

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
/** `entregue`: o que a pessoa escreveu em "Recebeu quanto?" (dinheiro entregue pelo cliente), para o troco e para não lançar mais do que entrou. */
/** `parte`: com Pix, cartão ou outro, o cliente pagou só uma parte (o valor vai em `entregue`); `resto`: no dividido, o que falta fica para depois. */
/** `parcelas`: crédito em quantas vezes (só nas telas que anotam, `ParcelasNaTela`; a taxa do parcelado vem daí). */
export type EstadoPagamento = { forma: Forma | null; dividido: boolean; partes: ParteDigitada[]; ultimaManual: boolean; entregue?: number | null; parte?: boolean; resto?: boolean; parcelas?: number | null };

/* ---------- taxas da maquininha: "Você recebe" e em quantas vezes ---------- */

/**
 * A tela anota em quantas vezes foi o crédito depois de gravar (`anotarParcelas`, maquininha.ts)? Só nelas a pergunta
 * "Em quantas vezes?" aparece. Fechar a conta, venda no balcão e check-out.
 */
export const ParcelasNaTela = createContext(false);

const perguntaCache = new Map<string, boolean>();
/**
 * As taxas da loja para mostrar no pagamento: só para quem cuida do financeiro (os outros não veem valor de taxa).
 * `pergunta`: a loja quer saber em quantas vezes foi o crédito (vale para todo mundo que recebe).
 */
export function useMaquininha(): { taxas: TaxasMaquininha | null; pergunta: boolean } {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const [x, setX] = useState<{ taxas: TaxasMaquininha | null; pergunta: boolean }>({ taxas: null, pergunta: perguntaCache.get(petshop.id) ?? false });
  const [vez, setVez] = useState(0);
  useEffect(() => aoMudarTaxas(() => setVez((n) => n + 1)), []);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (cuidoDoFinanceiro) {
          const taxas = await carregarTaxas(sb, petshop.id, vez > 0);
          if (vivo) setX({ taxas, pergunta: perguntaParcelas(taxas) });
        } else {
          const pergunta = await lojaPerguntaParcelas(sb, petshop.id);
          perguntaCache.set(petshop.id, pergunta);
          if (vivo) setX({ taxas: null, pergunta });
        }
      } catch { /* sem taxas: o pagamento continua igual */ }
    })();
    return () => { vivo = false; };
  }, [sb, petshop.id, cuidoDoFinanceiro, vez]);
  return x;
}

/** "Em quantas vezes?" (crédito) e "Taxa da maquininha · Você recebe" (cartão e Pix), embaixo da forma de pagamento. */
function TaxaDoPagamento({ e, aoMudar, total }: { e: EstadoPagamento; aoMudar: (e: EstadoPagamento) => void; total: number }) {
  const { taxas, pergunta } = useMaquininha();
  const anota = useContext(ParcelasNaTela);
  if (!(total > 0)) return null;
  const partes = e.dividido ? contasDoPagamento(e, total).partes.filter((p) => p.forma && Number(p.valor) > 0).map((p) => ({ forma: p.forma!, valor: centavos(Number(p.valor)) })) : null;
  const temCredito = e.dividido ? Boolean(partes?.some((p) => p.forma === "credito")) : e.forma === "credito";
  const valor = !e.dividido && e.parte && e.entregue ? e.entregue : e.dividido && partes ? centavos(partes.reduce((t, p) => t + p.valor, 0)) : total;
  const conta = taxas && temTaxa(taxas) && (e.dividido ? partes?.length : e.forma) ? calcularTaxa(taxas, { valor, forma: e.dividido ? null : e.forma, pagamentos: partes && partes.length > 1 ? partes : null, parcelas: anota ? e.parcelas : 1 }) : null;
  return (
    <>
      {anota && pergunta && temCredito && (
        <label className="g-tx-vezes">
          <span>Crédito em quantas vezes?</span>
          <select className="g-select" value={String(e.parcelas ?? 1)} aria-label="Crédito em quantas vezes" onChange={(ev) => aoMudar({ ...e, parcelas: Number(ev.target.value) })}>
            <option value="1">À vista</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => <option key={n} value={n}>{n} vezes</option>)}
          </select>
        </label>
      )}
      {conta && conta.taxa > 0 && (
        <p className="g-tx-recebe" role="status">
          <span>Taxa da maquininha: <b>{brl(conta.taxa)}</b> · Você recebe <b>{brl(conta.recebe)}</b></span>
          <small>O cliente paga o mesmo valor. Só você e quem cuida do financeiro veem isso.</small>
        </p>
      )}
    </>
  );
}

export const pagamentoInicial = (forma: Forma | null = null): EstadoPagamento => ({ forma, dividido: false, partes: [], ultimaManual: false, entregue: null });

/**
 * O cliente entregou em dinheiro menos do que a parte em dinheiro da conta ("Recebeu quanto?" 50 numa conta de 70)?
 * Devolve quanto entrou e quanto falta; null quando não é o caso (sem valor escrito, troco, ou outra forma).
 */
export function dinheiroAMenos(e: EstadoPagamento, total: number): { devido: number; entregue: number; falta: number } | null {
  const entregue = e.entregue;
  if (entregue == null || !(entregue > 0)) return null;
  let devido: number | null = null;
  if (!e.dividido) devido = e.forma === "dinheiro" ? total : null;
  else {
    const p = contasDoPagamento(e, total).partes.find((x) => x.forma === "dinheiro" && Number(x.valor) > 0);
    devido = p ? Number(p.valor) : null;
  }
  if (devido == null || entregue >= devido - 0.005) return null;
  return { devido, entregue: centavos(entregue), falta: centavos(devido - entregue) };
}

/**
 * O cliente pagou menos do que a conta, em qualquer forma (só nas telas que deixam o resto anotado, `aceitaResto`):
 * dinheiro com "Recebeu quanto?" menor; Pix, cartão ou outro com "Pagou só uma parte"; ou o dividido com "O resto fica para depois".
 * Devolve o que entra agora (com a forma e as partes) e o que falta; null quando a conta fecha inteira.
 */
export function pagoAMenos(e: EstadoPagamento, total: number): { entregue: number; falta: number; forma: Forma; pagamentos: PartePagamento[] | null } | null {
  if (!(total > 0)) return null;
  if (!e.dividido) {
    if (!e.forma) return null;
    if (e.forma === "dinheiro") {
      const m = dinheiroAMenos(e, total);
      return m ? { entregue: m.entregue, falta: m.falta, forma: "dinheiro", pagamentos: null } : null;
    }
    const v = e.parte ? e.entregue : null;
    if (v == null || !(v > 0) || v >= total - 0.005) return null;
    return { entregue: centavos(v), falta: centavos(total - v), forma: e.forma, pagamentos: null };
  }
  if (!e.resto) return null;
  const c = contasDoPagamento(e, total);
  // a parte que ficou vazia (sem valor) é o resto: não entra agora
  const usadas = c.partes.filter((p) => Number(p.valor) > 0);
  if (!(c.falta > 0) || c.passou > 0 || !usadas.length || usadas.some((p) => !p.forma)) return null;
  if (new Set(usadas.map((p) => p.forma)).size !== usadas.length) return null;
  // a parte em dinheiro entra pelo que o cliente entregou de verdade ("Recebeu quanto?" menor que a parte): o que faltou nela
  // também fica para depois, em vez de entrar no caixa um dinheiro que não veio
  const naMao = dinheiroAMenos(e, total);
  const pagamentos = usadas.map((p) => ({ forma: p.forma!, valor: centavos(p.forma === "dinheiro" && naMao ? naMao.entregue : p.valor!) }));
  const soma = centavos(pagamentos.reduce((t, p) => t + p.valor, 0));
  return { entregue: soma, falta: centavos(total - soma), forma: formaPrincipal(pagamentos), pagamentos: pagamentos.length > 1 ? pagamentos : null };
}

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
  // nunca lança mais do que entrou: "Recebeu quanto?" menor que a conta pede uma decisão
  const menos = dinheiroAMenos(e, total);
  if (menos) return { erro: `O cliente entregou ${brl(menos.entregue)} em dinheiro e ${e.dividido ? "a parte em dinheiro" : "a conta"} é de ${brl(menos.devido)}. Corrija o valor em "Recebeu quanto?", divida o pagamento ou mude a forma.` };
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
export function EscolhaPagamento({ valor: e, aoMudar, total, erro, rotulo = "Forma de pagamento", aceitaResto }: {
  valor: EstadoPagamento; aoMudar: (e: EstadoPagamento) => void; total: number; erro?: string | null; rotulo?: string;
  /** A tela deixa o que faltou anotado para o cliente pagar depois (conta do atendimento): o "Faltam" diz isso. */
  aceitaResto?: boolean;
}) {
  const entregue = { valor: e.entregue ?? null, aoMudar: (v: number | null) => aoMudar({ ...e, entregue: v }) };
  if (!e.dividido) {
    return (
      <div className="g-campo">
        <span>{rotulo}</span>
        <div className="g-chips" role="group" aria-label={rotulo}>
          {FORMAS.map((f) => (
            <button key={f.id} type="button" className="g-chip" aria-pressed={e.forma === f.id} onClick={() => aoMudar({ ...e, forma: f.id, parte: false, entregue: f.id === "dinheiro" ? (e.forma === "dinheiro" ? e.entregue ?? null : null) : null })}>{f.rotulo}</button>
          ))}
        </div>
        {erro && <small className="erro" role="alert">{erro}</small>}
        {e.forma === "dinheiro" && total > 0 && <Troco devido={total} {...entregue} aceitaResto={aceitaResto} />}
        <TaxaDoPagamento e={e} aoMudar={aoMudar} total={total} />
        {/* Pix, cartão ou outro: o cliente pagou só uma parte (só onde o resto fica anotado para depois) */}
        {aceitaResto && e.forma && e.forma !== "dinheiro" && total > 0.01 && (e.parte ? (
          <div className="g-pg-troco">
            <label>
              <span>Pagou quanto no {FORMAS.find((f) => f.id === e.forma)?.rotulo ?? "pagamento"}?</span>
              <CampoDinheiro valor={e.entregue ?? null} aoMudar={(v) => aoMudar({ ...e, entregue: v })} rotulo="Quanto pagou agora" />
            </label>
            <p role="status" className={e.entregue != null && e.entregue < total - 0.005 ? "falta" : undefined}>
              {e.entregue == null ? <span className="g-muted">Escreva quanto entrou agora.</span>
                : e.entregue >= total - 0.005 ? <span className="g-erro">Isso já é a conta inteira. Para pagar tudo, toque em Pagou tudo.</span>
                : <>Faltam <b className="g-tab">{brl(total - e.entregue)}</b>: ficam anotados para depois.</>}
            </p>
            <button type="button" className="g-pg-link" onClick={() => aoMudar({ ...e, parte: false, entregue: null })}>Pagou tudo</button>
          </div>
        ) : (
          <div><button type="button" className="g-btn fantasma p" onClick={() => aoMudar({ ...e, parte: true, entregue: null })}>Pagou só uma parte?</button></div>
        ))}
        {total > 0.01 && (
          <div>
            <button type="button" className="g-btn fantasma p g-pg-dividir"
              onClick={() => aoMudar({ ...e, dividido: true, ultimaManual: false, parte: false, resto: false, partes: [{ forma: e.forma, valor: null }, { forma: null, valor: null }] })}>
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
  // "o resto fica para depois" com menos dinheiro entregue do que a parte em dinheiro: entra só o que veio
  const naMao = aceitaResto && e.resto ? dinheiroAMenos(e, total) : null;
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
        <p className={`g-pg-conta${(c.falta > 0 && !(e.resto && aceitaResto)) || c.passou > 0 ? " erro" : " certo"}`} role="status">
          {c.passou > 0 ? `Passou ${brl(c.passou)} do total de ${brl(total)}.`
            : c.falta > 0 && e.resto && aceitaResto ? (naMao
              ? `Entram ${brl(centavos(c.soma - naMao.falta))} agora (em dinheiro, só os ${brl(naMao.entregue)} entregues). Faltam ${brl(centavos(c.falta + naMao.falta))}, que ficam anotados para depois.`
              : `Entram ${brl(c.soma)} agora. Faltam ${brl(c.falta)}, que ficam anotados para depois.`)
            : c.falta > 0 ? `Falta ${brl(c.falta)} para fechar ${brl(total)}.`
            : `Fecha certinho com o total de ${brl(total)}.`}
          {(c.falta > 0 || (c.passou > 0 && e.ultimaManual)) && (
            <button type="button" className="g-pg-link" onClick={() => aoMudar({ ...e, ultimaManual: false, resto: false })}>Completar a última parte</button>
          )}
        </p>
      )}
      {/* conta do atendimento: pagou uma parte agora (em uma ou mais formas) e o resto fica anotado */}
      {aceitaResto && !e.resto && c.passou === 0 && (c.falta > 0 || !e.partes[ultima]?.forma) && (
        <div>
          <button type="button" className="g-btn fantasma p" onClick={() => aoMudar({
            ...e, resto: true, ultimaManual: true,
            // a última parte sem forma é o resto: fica vazia (o que ela mostrava sozinha não entra agora)
            partes: e.partes.map((p, n) => (n === ultima && !p.forma && !e.ultimaManual ? { ...p, valor: null } : p)),
          })}>Pagou só isso, o resto fica para depois</button>
        </div>
      )}
      {aceitaResto && e.resto && <small>O que faltar fica anotado para o cliente pagar depois. <button type="button" className="g-pg-link" onClick={() => aoMudar({ ...e, resto: false, ultimaManual: false })}>Pagou tudo</button></small>}
      {emDinheiro && <Troco devido={Number(emDinheiro.valor)} parte {...entregue} />}
      {!e.ultimaManual && c.passou === 0 && <small>A última parte se completa sozinha com o que falta.</small>}
      <TaxaDoPagamento e={e} aoMudar={aoMudar} total={total} />
      {erro && <small className="erro" role="alert">{erro}</small>}
      <div className="g-pg-acoes">
        {e.partes.length < MAX_PARTES && (
          <button type="button" className="g-btn fantasma p" onClick={() => aoMudar({ ...e, partes: [...e.partes, { forma: null, valor: null }], ultimaManual: false })}><Plus />Mais uma forma</button>
        )}
        <button type="button" className="g-btn fantasma p" onClick={() => aoMudar({ ...e, dividido: false, partes: [], ultimaManual: false, resto: false, forma: e.partes[0]?.forma ?? e.forma })}>Pagar com uma forma só</button>
      </div>
    </div>
  );
}

/**
 * Calculadora de troco: aparece quando o pagamento (ou uma parte dele) é em dinheiro.
 * Com troco, o que fica anotado é o valor da conta. Com menos do que a conta, a tela não lança o valor cheio:
 * a conta do atendimento (`aceitaResto`) recebe o que entrou e deixa o resto anotado; as outras telas pedem para corrigir.
 */
export function Troco({ devido, parte, valor, aoMudar, aceitaResto }: {
  devido: number; parte?: boolean; valor?: number | null; aoMudar?: (v: number | null) => void; aceitaResto?: boolean;
}) {
  const [proprio, setProprio] = useState<number | null>(null);
  const recebeu = aoMudar ? valor ?? null : proprio;
  const setRecebeu = aoMudar ?? setProprio;
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
      {troco != null && troco < 0 && !aceitaResto && <small className="g-erro" style={{ gridColumn: "1 / -1" }}>Assim a conta não fecha: corrija o valor, divida o pagamento ou mude a forma.</small>}
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
export function QuandoPaga({ total, pagamento, aoPagamento, depois, aoDepois, erro, aceitaResto }: {
  total: number; pagamento: EstadoPagamento; aoPagamento: (e: EstadoPagamento) => void;
  depois: PagaDepois; aoDepois: (d: PagaDepois) => void; erro?: string | null; aceitaResto?: boolean;
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
      ) : <EscolhaPagamento valor={pagamento} aoMudar={aoPagamento} total={total} erro={erro} aceitaResto={aceitaResto} />}
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
  const c = useCampoDeValor(valor, aoMudar, duasCasas);
  return (
    <>
      <input id={id} className={`g-input g-tab${c.erro ? " ruim" : ""}`} inputMode="decimal" placeholder={placeholder} autoFocus={autoFocus} value={c.texto} disabled={desligado} aria-label={rotulo}
        aria-invalid={c.erro || (valor != null && valor > maximo) ? true : undefined} data-valor-ruim={c.erro ? "1" : undefined}
        onChange={(e) => c.mudar(e.target.value)} onBlur={c.sair} />
      {c.erro && <small className="erro g-valor-erro" role="alert">{c.erro}</small>}
    </>
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
 * o campo do troco já aparece aberto, com o último valor contado (ou vazio, que é zero). Linguagem simples: na primeira
 * cobrança a pessoa ainda não sabe o que é "abrir o caixa".
 */
export function AvisoCaixaFechado({ aberto }: { aberto: boolean | null }) {
  const { sb, petshop, user, posso, liberado } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [abriu, setAbriu] = useState(false);
  const [troco, setTroco] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const podeAbrir = posso("caixa") && liberado;
  // o troco inicial começa com o que foi contado no último fechamento (a pessoa confere e muda se quiser)
  useEffect(() => {
    if (aberto !== false || !podeAbrir) return;
    let vale = true;
    void ultimoContado(sb, petshop.id).then((u) => { if (vale && u != null) setTroco((t) => t ?? u); }).catch(() => {});
    return () => { vale = false; };
  }, [aberto, podeAbrir, sb, petshop.id]);
  // abriu o caixa daqui: a confirmação fica na tela até a pessoa terminar o recebimento
  if (abriu) {
    return <p className="g-cx-fora ok" role="status"><Lock aria-hidden /><span>Caixa do dia aberto. Este valor já entra nele; o que for pago em dinheiro entra também na conta da gaveta.</span></p>;
  }
  if (aberto !== false) return null;
  async function abrir() {
    if (salvando) return;
    if (troco != null && (troco < 0 || troco >= 1e8)) { avisarErro("Confira o troco."); return; }
    setSalvando(true);
    try {
      const r = await sb.from("caixas").insert({ petshop_id: petshop.id, valor_inicial: troco ?? 0, aberto_por: user.id });
      // já havia um caixa aberto (alguém abriu em outro aparelho): vale o que está aberto
      if (r.error && r.error.code !== "23505") throw new Error(r.error.message);
      await caixaAberto(sb, petshop.id);
      setAbriu(true);
      avisar("Caixa do dia aberto.");
      avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }
  return (
    <div className="g-cx-fora" role="status">
      <Lock aria-hidden />
      <div>
        {podeAbrir ? (
          <>
            <span><b>Falta abrir o caixa do dia.</b> É onde o sistema soma o que você recebe hoje e quanto dinheiro deve ter na gaveta. Abre uma vez por dia: diga quanto tem de troco na gaveta agora (se não tiver, deixe vazio).</span>
            <div className="g-cx-abrir">
              <label>
                <span>Troco na gaveta agora</span>
                <CampoDinheiro valor={troco} aoMudar={setTroco} rotulo="Troco na gaveta agora" placeholder="0,00" maximo={99999999} />
              </label>
              <button type="button" className="g-btn sec p" onClick={() => void abrir()} disabled={salvando}>{salvando ? "Abrindo…" : "Abrir o caixa"}</button>
            </div>
            <small className="g-muted">Prefere não abrir agora? Pode receber assim mesmo: o valor fica guardado nas contas de hoje. Só não entra na conta do dinheiro da gaveta.</small>
          </>
        ) : (
          <span>O caixa do dia ainda não foi aberto. Pode receber assim mesmo: o valor fica guardado nas contas de hoje. Só não entra na conta do dinheiro da gaveta até alguém abrir o caixa.</span>
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
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
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
