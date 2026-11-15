"use client";

import { useState } from "react";
import { History, Lock, Package, Scissors, Sparkles, Trash2 } from "lucide-react";
import { caixaAberto, conferirCaixa, conferirValorAlto, contaDosItens, creditoDaEntrada, desfazerVenda, ehDividido, gravarLancamento, itensDoLancamento, lancarPago, parteDaChave, nomeDoMovimento, partesPorForma, produtosDaVenda, receberComCredito, receberConta, separarMulta, textoDoPagamento } from "@/lib/gestao/dinheiro";
import { creditoDoTutor } from "@/lib/gestao/credito";
import { multaSugerida, regraDaMulta } from "@/lib/gestao/dinheiro-opcoes";
import { diaFechado, nomeDoDiaFechado } from "@/lib/gestao/feriados";
import { usaCasa } from "@/lib/gestao/modulos";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, FORMAS, type AlteracaoLancamento, type Lancamento } from "@/lib/gestao/tipos";
import { brl, dataCompleta, deIsoDia, hora, isoDia } from "@/lib/gestao/util";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvisoCaixaFechado, CampoDinheiro, EscolhaPagamento, fecharPagamento, pagamentoInicial, useCaixaAberto, type EstadoPagamento } from "../loja/pecas";
import { avisarMudanca, Campo, Folha, useAvisos, useDados, Vazio } from "../ui";
import "./financeiro.css";
import "@/app/(gestao)/gestao/app/agenda/agenda.css";

/* ---------- contas ---------- */

export type FormaId = (typeof FORMAS)[number]["id"];
export type Tipo = "entrada" | "saida";

export const hojeIso = () => isoDia(new Date());
export const rotuloForma = (f: string | null | undefined) => FORMAS.find((x) => x.id === f)?.rotulo ?? "Sem forma";
const centavos = (n: number) => Math.round(n * 100) / 100;
export const soma = (lista: { valor: number }[]) => centavos(lista.reduce((s, l) => s + Number(l.valor), 0));
/** Valor curto para rótulo de gráfico: "850", "1,2 mil". */
export const brlMini = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(Math.round(n)));
/** Cor de cada forma de pagamento nos gráficos. */
export const COR_FORMA: Record<string, string> = { pix: "#2f6b4c", dinheiro: "#c99a2e", debito: "#2f6f8a", credito: "#5b4590", outro: "#a39a90", credito_tutor: "#b3402e" };
/** Cores para fatias e barras quando o item não tem cor própria. */
export const PALETA = ["#2f6b4c", "#ea670c", "#2f6f8a", "#5b4590", "#c99a2e", "#b3402e", "#6a625a", "#a39a90"];

type Movimento = Pick<Lancamento, "tipo" | "valor" | "forma"> & { pagamentos?: unknown; movimento?: string | null; credito_usado?: number | null };

/** Tira sangrias e suprimentos: dinheiro que só entrou ou saiu da gaveta não é receita nem despesa. */
export const semMovimentos = <T extends { movimento?: string | null }>(lista: T[]) => lista.filter((l) => !l.movimento);

/** Soma por forma de pagamento, repartindo o pagamento dividido entre as formas dele. */
export function somaPorForma(lista: { valor: number; forma?: string | null; pagamentos?: unknown; credito_usado?: number | null }[]) {
  const mapa = new Map<string, number>();
  const somar = (k: string, v: number) => mapa.set(k, centavos((mapa.get(k) ?? 0) + v));
  for (const l of lista) {
    // a parte paga com o crédito do tutor fica à parte (FORMA_CREDITO): não é dinheiro que entrou no dia
    const credito = creditoDaEntrada(l);
    for (const p of partesPorForma(l)) somar(p.forma, p.forma === "outro" && credito > 0 ? p.valor - credito : p.valor);
    if (credito > 0) somar(FORMA_CREDITO, credito);
  }
  for (const [k, v] of mapa) if (Math.abs(v) < 0.005) mapa.delete(k);
  return mapa;
}
/** A chave, nas somas por forma, da parte paga com o crédito do tutor. */
export const FORMA_CREDITO = "credito_tutor";

/**
 * Quanto entrou e saiu por forma de pagamento, e quanto deve ter de dinheiro na gaveta:
 * troco inicial + dinheiro recebido + colocado na gaveta (suprimento) − saídas em dinheiro − tirado da gaveta (sangria).
 * `entrou` e `saiu` não contam sangria nem suprimento.
 */
export function resumoDoCaixa(valorInicial: number, lancamentos: Movimento[]) {
  const vendas = semMovimentos(lancamentos);
  const entradas = vendas.filter((l) => l.tipo === "entrada");
  const saidas = vendas.filter((l) => l.tipo === "saida");
  const entrouPor = somaPorForma(entradas), saiuPor = somaPorForma(saidas);
  const porForma = FORMAS.map((f) => ({ id: f.id, rotulo: f.rotulo, entrou: entrouPor.get(f.id) ?? 0, saiu: saiuPor.get(f.id) ?? 0 }));
  const dinheiro = porForma.find((f) => f.id === "dinheiro")!;
  const suprimentos = soma(lancamentos.filter((l) => l.movimento === "suprimento"));
  const sangrias = soma(lancamentos.filter((l) => l.movimento === "sangria"));
  // o que foi pago com o crédito do tutor não entrou no caixa (é dinheiro de antes)
  const credito = centavos(entradas.reduce((t, l) => t + creditoDaEntrada(l), 0));
  return {
    entrou: centavos(soma(entradas) - credito), saiu: soma(saidas), porForma, suprimentos, sangrias, credito,
    nEntradas: entradas.length, nSaidas: saidas.length,
    esperado: centavos(Number(valorInicial) + dinheiro.entrou + suprimentos - dinheiro.saiu - sangrias),
  };
}

/* ---------- planilha (CSV) ---------- */

/** Célula de planilha: texto (protegido) ou `{ bruto }` para número já formatado. */
export type Cel = string | { bruto: string };
/** Dinheiro para planilha: "1234,56" (sem R$, para o Excel somar). */
export const dinheiroCsv = (n: number): Cel => ({ bruto: Number(n).toFixed(2).replace(".", ",") });
/** Número inteiro ou quantidade para planilha. */
export const numeroCsv = (n: number): Cel => ({ bruto: String(n).replace(".", ",") });
/** Texto entre aspas; o que começa com = + - @ ganha um apóstrofo, para a planilha não ler como fórmula. */
function celulaCsv(c: Cel) {
  if (typeof c !== "string") return c.bruto;
  let t = c.replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
}
/** O texto de uma planilha CSV (separador ponto e vírgula, com BOM: abre direto no Excel e no Google Planilhas). */
export const textoCsv = (linhas: Cel[][]) => "\ufeff" + linhas.map((l) => l.map(celulaCsv).join(";")).join("\r\n") + "\r\n";
/** Baixa uma planilha CSV. */
export function baixarPlanilha(linhas: Cel[][], nomeDoArquivo: string) {
  baixarArquivo(new Blob([textoCsv(linhas)], { type: "text/csv;charset=utf-8" }), nomeDoArquivo);
}
/** Entrega um arquivo pronto para o navegador baixar. */
export function baixarArquivo(arquivo: Blob, nomeDoArquivo: string) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeDoArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Busca todas as linhas de uma consulta, de mil em mil. */
export async function paginar<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 20000,
): Promise<T[]> {
  const tudo: T[] = [];
  for (let de = 0; de < max; de += 1000) {
    const r = await pagina(de, de + 999);
    if (r.error) throw new Error(r.error.message);
    tudo.push(...(r.data ?? []));
    if ((r.data?.length ?? 0) < 1000) break;
  }
  return tudo;
}

/** Mesmo dia do mês, `n` meses depois (31 vira o último dia quando o mês é mais curto). */
export function somaMeses(iso: string, n: number) {
  const d = deIsoDia(iso);
  const alvo = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d.getDate(), ultimo));
  return isoDia(alvo);
}

/* ---------- peças ---------- */

export function SemAcesso() {
  return <Vazio titulo="Esta parte é só para quem cuida do financeiro." texto="Se você precisa ver, peça para o dono do pet shop liberar." />;
}

export function ErroDeCarga({ erro, tentar }: { erro: string; tentar: () => void }) {
  return (
    <div className="g-aviso vermelho" role="alert">
      <span>{erro}</span>
      <button className="g-btn p sec" onClick={tentar}>Tentar de novo</button>
    </div>
  );
}

export function Chips<T extends string>({ opcoes, valor, aoMudar, rotulo }: {
  opcoes: readonly { id: T; rotulo: string }[]; valor: T | null; aoMudar: (v: T) => void; rotulo: string;
}) {
  return (
    <div className="g-chips" role="group" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.id} type="button" className="g-chip" aria-pressed={valor === o.id} onClick={() => aoMudar(o.id)}>{o.rotulo}</button>
      ))}
    </div>
  );
}

/** Um campo com rótulo que não é <label> (para grupos de chips). */
export function Grupo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="g-campo"><span>{rotulo}</span>{children}</div>;
}

/** Linha "nome ........ valor" dos resumos. */
export function LinhaResumo({ nome, valor, forte, tom }: { nome: string; valor: string; forte?: boolean; tom?: "verde" | "vermelho" }) {
  return (
    <div className={`gf-par${forte ? " forte" : ""}`}>
      <span>{nome}</span>
      <span className={`g-tab${tom === "verde" ? " g-verde-t" : tom === "vermelho" ? " g-vermelho-t" : ""}`}>{valor}</span>
    </div>
  );
}

/* ---------- itens de uma venda ---------- */

const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const ICONE_ITEM = { servico: Scissors, produto: Package, extra: Sparkles } as const;
const TOM_ITEM = { servico: "pessego", produto: "rosa", extra: "ceu" } as const;

/**
 * Linha de um serviço ("Banho · Nina"): a descrição já diz o que foi, então a categoria ("Banho e tosa") não precisa aparecer ao lado.
 * Vale para a conta de um atendimento, a mensalidade e a estadia; despesas e vendas continuam com a categoria.
 */
export const ehDeServico = (l: { tipo: string; categoria: string; agendamento_id?: string | null; descricao?: string | null }) =>
  l.tipo === "entrada" && Boolean(l.descricao?.trim()) && (Boolean(l.agendamento_id) || ["Banho e tosa", "Creche e hotel", "Creche: mensalidade"].includes(l.categoria));

/** "3 itens" para o subtítulo das linhas de lista; vazio quando o lançamento não tem itens. */
export function resumoDeItens(l: { itens?: unknown }) {
  const n = itensDoLancamento(l).length;
  return n ? (n === 1 ? "1 item" : `${n} itens`) : "";
}

/** O que foi vendido neste lançamento: quantidade × nome, preço de cada um e total da linha. Só leitura. */
export function ItensDoLancamento({ lancamento }: { lancamento: Pick<Lancamento, "itens" | "valor"> & { valor_original?: number | null; pago?: boolean } }) {
  const itens = itensDoLancamento(lancamento);
  if (!itens.length) return null;
  // conta recebida em partes: os itens são da conta cheia; o que já entrou aparece numa linha própria, não como desconto
  const cheio = lancamento.valor_original != null && Number(lancamento.valor_original) > Number(lancamento.valor) ? Number(lancamento.valor_original) : Number(lancamento.valor);
  const emPartes = centavos(cheio - Number(lancamento.valor));
  const { soma: somaItens, desconto } = contaDosItens(itens, cheio);
  // "venda" só quando tem produto; mensalidade, diária e serviço são "o que está nesta conta"
  const titulo = itens.some((i) => i.tipo === "produto") ? "Itens desta venda" : "O que está nesta conta";
  return (
    <section className="gf-itens" aria-label={titulo}>
      <div className="gf-itens-t">
        <span className="g-rotulo">{titulo}</span>
        <span className="g-muted g-pp">{itens.length === 1 ? "1 item" : `${itens.length} itens`}</span>
      </div>
      <ul>
        {itens.map((i, n) => (
          <li key={n}>
            <Tile icone={ICONE_ITEM[i.tipo]} tom={TOM_ITEM[i.tipo]} tamanho="p" />
            <span className="n">
              <b>{i.qtd !== 1 && <span className="g-tab">{fmtQtd(i.qtd)} × </span>}{i.nome}</b>
              {i.qtd !== 1 && <small className="g-tab">{brl(i.valor)} cada</small>}
            </span>
            <b className="g-tab v">{brl(Math.round(i.qtd * i.valor * 100) / 100)}</b>
          </li>
        ))}
      </ul>
      {(desconto > 0 || emPartes > 0) && (
        <div className="gf-itens-pe">
          <div><span>Soma dos itens</span><span className="g-tab">{brl(somaItens)}</span></div>
          {desconto > 0 && <div><span>Desconto</span><span className="g-tab">− {brl(desconto)}</span></div>}
          {emPartes > 0 && <div><span>Recebido antes, em partes</span><span className="g-tab">− {brl(emPartes)}</span></div>}
          <div className="forte"><span>{emPartes > 0 ? (lancamento.pago ? "Última parte" : "Falta receber") : "Valor do lançamento"}</span><span className="g-tab">{brl(lancamento.valor)}</span></div>
        </div>
      )}
    </section>
  );
}

/* ---------- alterações e exclusões de valor já recebido ---------- */

type Campos = Record<string, unknown>;
const campos = (j: unknown): Campos => (j && typeof j === "object" && !Array.isArray(j) ? (j as Campos) : {});
const quandoFoi = (iso: string) => `${dataCompleta(iso)} às ${hora(iso)}`;

/** "R$ 75,80 → R$ 45,80; Pix → Dinheiro": o que mudou numa alteração, em palavras. */
export function textoDaAlteracao(a: Pick<AlteracaoLancamento, "antes" | "depois">) {
  const de = campos(a.antes), para = campos(a.depois);
  const partes: string[] = [];
  if ("valor" in de) partes.push(`${brl(Number(de.valor))} → ${brl(Number(para.valor))}`);
  if ("forma" in de) partes.push(`${rotuloForma(de.forma as string | null)} → ${rotuloForma(para.forma as string | null)}`);
  else if ("pagamentos" in de) partes.push("divisão do pagamento");
  if ("data" in de) partes.push(`dia ${dataCompleta(String(de.data))} → ${dataCompleta(String(para.data))}`);
  if ("tipo" in de) partes.push(para.tipo === "entrada" ? "saída → entrada" : "entrada → saída");
  if ("categoria" in de) partes.push(`categoria ${String(de.categoria)} → ${String(para.categoria)}`);
  if ("descricao" in de) partes.push(`descrição ${de.descricao ? `"${String(de.descricao)}"` : "em branco"} → ${para.descricao ? `"${String(para.descricao)}"` : "em branco"}`);
  if ("itens" in de) partes.push("itens da venda");
  if ("pago" in de) partes.push("voltou a ser conta em aberto");
  if ("caixa_id" in de && !("pago" in de)) partes.push("caixa");
  return partes.join("; ") || "detalhes";
}

/** Dentro do lançamento: quem alterou, quando, e de quanto para quanto. Só busca quando o lançamento foi alterado. */
function HistoricoDeAlteracoes({ lancamento }: { lancamento: Pick<Lancamento, "id" | "alterado_em"> }) {
  const { sb, petshop } = useGestao();
  const { dados } = useDados(async () => {
    if (!lancamento.alterado_em) return [];
    const r = await sb.from("lancamentos_alteracoes").select("*").eq("petshop_id", petshop.id).eq("lancamento_id", lancamento.id).eq("acao", "alterou")
      .order("quando", { ascending: false }).limit(20);
    return r.data ?? [];
  }, [lancamento.id, lancamento.alterado_em]);
  if (!lancamento.alterado_em) return null;
  return (
    <section className="gf-alteracoes" aria-label="Alterações deste lançamento">
      <span className="g-rotulo"><History size={14} aria-hidden />Alterações</span>
      {dados?.length
        ? <ul>{dados.map((a) => <li key={a.id}>Alterado por <b>{a.quem_nome ?? "alguém da equipe"}</b> em {quandoFoi(a.quando)}: <span className="g-tab">{textoDaAlteracao(a)}</span></li>)}</ul>
        : <p className="g-muted g-pp">Alterado em {quandoFoi(lancamento.alterado_em)}.</p>}
    </section>
  );
}

/**
 * Dentro do lançamento, para o dono e quem cuida do financeiro: o que foi vendido com preço diferente da lista ou com desconto,
 * e quem vendeu. O banco anota sozinho na hora da venda (tabela `precos_alterados`); quem só opera o caixa não lê.
 */
function PrecosMudados({ lancamento }: { lancamento: Pick<Lancamento, "id"> }) {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const { dados } = useDados(async () => {
    if (!cuidoDoFinanceiro) return [];
    const r = await sb.from("precos_alterados").select("id, tipo, item, de, para, qtd, abaixo_do_custo, quem_nome, quando").eq("petshop_id", petshop.id).eq("lancamento_id", lancamento.id).order("quando");
    return r.data ?? [];
  }, [lancamento.id, cuidoDoFinanceiro]);
  if (!dados?.length) return null;
  return (
    <section className="gf-alteracoes" aria-label="Preço mudado ou desconto nesta venda">
      <span className="g-rotulo"><History size={14} aria-hidden />Preço e desconto</span>
      <ul>
        {dados.map((x) => (
          <li key={x.id}>
            {x.tipo === "desconto"
              ? <>Desconto de <b className="g-tab">{brl(Math.max(0, Number(x.de ?? 0) - Number(x.para)))}</b> dado por <b>{x.quem_nome ?? "alguém da equipe"}</b>: de {brl(Number(x.de ?? 0))} para {brl(Number(x.para))}</>
              : <>{x.item}: preço mudado de <b className="g-tab">{x.de == null ? "sem preço" : brl(Number(x.de))}</b> para <b className="g-tab">{brl(Number(x.para))}</b> por <b>{x.quem_nome ?? "alguém da equipe"}</b>{x.abaixo_do_custo ? " (abaixo do custo)" : ""}</>}
            {" "}em {quandoFoi(x.quando)}.
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Etiqueta discreta das listas para o lançamento recebido que foi alterado depois. */
export function TagAlterado({ lancamento }: { lancamento: Pick<Lancamento, "alterado_em"> }) {
  return lancamento.alterado_em ? <span className="g-tag amarelo gf-alterado" title={`Alterado em ${quandoFoi(lancamento.alterado_em)}`}>alterado</span> : null;
}

/** Lançamentos recebidos que foram apagados (só chega para o dono e para quem cuida do financeiro). */
export function Apagados({ linhas, titulo = "Apagados" }: { linhas: AlteracaoLancamento[]; titulo?: string }) {
  if (!linhas.length) return null;
  return (
    <section className="g-card gf-apagados">
      <div className="g-card-t"><h3><Tile icone={Trash2} tom="manteiga" tamanho="p" />{titulo}</h3><span className="g-tag g-tab">{linhas.length}</span></div>
      <p className="g-muted g-pp" style={{ marginBottom: 6 }}>Valores já recebidos que alguém excluiu. Não entram mais em nenhuma soma; ficam aqui para você conferir.</p>
      <div className="g-lista">
        {linhas.map((a) => {
          const l = campos(a.antes);
          const entrada = l.tipo === "entrada";
          const nome = l.movimento ? nomeDoMovimento(String(l.movimento)) : String(l.descricao || categoriaAtual(String(l.categoria ?? "Outros")));
          return (
            <div key={a.id} className="g-linha">
              <Tile icone={Trash2} tom="manteiga" />
              <span className="t">
                <b>{nome}</b>
                <span>Apagado por {a.quem_nome ?? "alguém da equipe"} em {quandoFoi(a.quando)} · era {textoDoPagamento({ valor: Number(l.valor), forma: l.forma as string | null, pagamentos: l.pagamentos })}{l.data ? `, de ${dataCompleta(String(l.data))}` : ""}</span>
              </span>
              <span className="d g-muted"><b><s>{entrada ? "+" : "−"} {brl(Number(l.valor))}</s></b></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- folha de lançamento ---------- */

const categoriasDe = (tipo: Tipo) => (tipo === "entrada" ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA);
/** Nome de hoje para uma categoria gravada com o nome antigo. */
export const categoriaAtual = (c: string) => (c === "Produtos e insumos" ? "Produtos e material" : c);

/**
 * Cria ou edita um lançamento.
 * `modo = "pago"`: dinheiro que já entrou ou saiu. `modo = "conta"`: conta a pagar ou a receber, com vencimento.
 */
export function FolhaLancamento({ modo, tipo: tipoInicial, inicial, escolheData, escolheTipo, aoFechar, aoSalvo, tutor: tutorFixo }: {
  modo: "pago" | "conta"; tipo: Tipo; inicial?: Lancamento | null; escolheData?: boolean; escolheTipo?: boolean;
  aoFechar: () => void; aoSalvo: () => void | Promise<void>;
  /** Conta a receber anotada na ficha de um tutor (taxa de falta, diferença esquecida): já vem com ele. */
  tutor?: { id: string; nome: string } | null;
}) {
  const { sb, petshop, user, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const hoje = hojeIso();
  const [tipo, setTipo] = useState<Tipo>(inicial ? (inicial.tipo as Tipo) : tipoInicial);
  const [valor, setValor] = useState<number | null>(inicial ? Number(inicial.valor) : null);
  // forma: a do lançamento; num novo, nenhuma vem marcada: a pessoa escolhe
  const [pagamento, setPagamento] = useState<EstadoPagamento>(() => pagamentoInicial(inicial ? (inicial.forma as FormaId | null) ?? "pix" : null));
  // lançamento já dividido: as partes aparecem só para leitura até a pessoa trocar para uma forma só
  const [manterDividido, setManterDividido] = useState(() => Boolean(inicial && inicial.pago && ehDividido(inicial)));
  // conta anotada na ficha do tutor (taxa de falta, diferença esquecida): começa em Outros, não em Banho e tosa
  const [categoria, setCategoria] = useState(inicial ? categoriaAtual(inicial.categoria) : tutorFixo && categoriasDe(tipoInicial).includes("Outros") ? "Outros" : categoriasDe(tipoInicial)[0]);
  // lançamento de um caixa que já foi fechado: valor, forma e dia não mudam mais, e ele não pode ser excluído (o banco também recusa)
  const { dados: caixaFechadoEm } = useDados(async () => {
    if (!inicial?.caixa_id) return null;
    const r = await sb.from("caixas").select("fechado_em").eq("id", inicial.caixa_id).maybeSingle();
    return r.data?.fechado_em ?? null;
  }, [inicial?.caixa_id]);
  const travado = Boolean(caixaFechadoEm);
  // valor já recebido: o dono e quem cuida do financeiro alteram; quem só opera o caixa corrige o que ela mesma lançou no caixa aberto
  const soVer = Boolean(inicial?.pago && !cuidoDoFinanceiro && !(inicial.criado_por === user.id && inicial.caixa_id && !travado));
  const recebido = Boolean(inicial?.pago);
  const caixa = useCaixaAberto();
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [data, setData] = useState(inicial?.data ?? hoje);
  // na ficha do tutor, a dívida solta costuma ser paga no próximo atendimento: o vencimento começa daqui a 7 dias
  const [vencimento, setVencimento] = useState(inicial?.vencimento ?? (tutorFixo ? isoDia(new Date(Date.now() + 7 * 864e5)) : hoje));
  const [repetir, setRepetir] = useState(false);
  const [meses, setMeses] = useState(6);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // conta a receber nova: de qual tutor (aparece na ficha dele e na cobrança)
  const [tutorConta, setTutorConta] = useState<{ id: string; nome: string } | null>(tutorFixo ?? null);
  // valor recebido corrigido para menos, de um cliente: a diferença ainda é devida? (null: a pessoa ainda não disse)
  const [restoDevido, setRestoDevido] = useState<boolean | null>(null);
  const [restoQuando, setRestoQuando] = useState(() => isoDia(new Date(Date.now() + 7 * 864e5)));

  const conta = modo === "conta";
  const entrada = tipo === "entrada";
  const voltam = produtosDaVenda(inicial).length;
  // entrada recebida de um cliente corrigida para menos: a diferença pode continuar devida (não some calada)
  const baixou = inicial && inicial.pago && inicial.tipo === "entrada" && inicial.cliente_id && !inicial.conta_id && !inicial.movimento && !travado && !soVer && valor != null && valor > 0
    ? Math.max(0, Math.round((Number(inicial.valor) - valor) * 100) / 100) : 0;
  const { dados: nomeDoClienteLido } = useDados(async () => {
    if (!inicial?.cliente_id) return null;
    const r = await sb.from("clientes").select("nome").eq("id", inicial.cliente_id).maybeSingle();
    return r.data?.nome ?? null;
  }, [inicial?.cliente_id]);
  const nomeDoCliente = nomeDoClienteLido?.split(" ")[0] ?? "O cliente";
  // quem não tem creche nem hotel não vê essa categoria (lançamento antigo com ela continua mostrando)
  const lista = categoriasDe(tipo).filter((c) => c !== "Creche e hotel" || usaCasa(petshop));
  const categorias = (lista.includes(categoria) ? lista : [categoria, ...lista]).map((c) => ({ id: c, rotulo: c }));
  const titulo = conta
    ? `${inicial ? "Editar conta" : "Nova conta"} ${entrada ? "a receber" : "a pagar"}`
    : inicial ? `Editar ${entrada ? "entrada" : "saída"}` : escolheTipo ? "Novo lançamento" : entrada ? "Nova entrada" : "Nova saída";

  function trocarTipo(t: Tipo) {
    setTipo(t);
    if (t === "saida" && pagamento.dividido) setPagamento(pagamentoInicial(pagamento.partes[0]?.forma ?? pagamento.forma));
    if (!categoriasDe(t).includes(categoria)) setCategoria(categoriasDe(t)[0]);
  }

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando || soVer) return;
    if (!valor || valor <= 0) { setErro("Escreva o valor."); return; }
    if (valor >= 1e8) { setErro("Esse valor é grande demais."); return; }
    const texto = descricao.trim() || null;
    if (conta && !texto) { setErro("Escreva do que é esta conta."); return; }
    if (conta && !vencimento) { setErro("Escolha o dia do vencimento."); return; }
    if (!conta && escolheData && (!data || data > hoje)) { setErro("Escolha um dia até hoje."); return; }
    const pg = conta || travado || manterDividido ? null : fecharPagamento(pagamento, valor);
    if (pg && "erro" in pg) { setErro(pagamento.dividido ? pg.erro : entrada ? "Escolha como recebeu." : "Escolha como pagou."); return; }
    const forma = pg && !("erro" in pg) ? pg.forma : null;
    const pagamentos = pg && !("erro" in pg) ? pg.pagamentos : null;
    const vezes = conta && !inicial && repetir ? Math.min(36, Math.max(2, Math.round(meses) || 2)) : 1;
    if (baixou && restoDevido == null) { setErro(`Diga se ${nomeDoCliente} ainda deve os ${brl(baixou)} da diferença.`); return; }
    if (baixou && restoDevido && (!restoQuando || restoQuando < hoje)) { setErro("Escolha um dia de hoje em diante para o cliente pagar a diferença."); return; }
    setErro(null);
    // um zero a mais é fácil de digitar: valor alto pede uma conferência (na edição, só se o valor mudou)
    if ((!inicial || Number(inicial.valor) !== valor) && !(await conferirValorAlto(valor, confirmar))) return;
    // dinheiro de hoje: se o caixa fechou enquanto esta folha estava aberta, pergunta antes de lançar fora dele
    if (!inicial && !conta && (!escolheData || data === hoje) && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    setSalvando(true);
    try {
      if (inicial) {
        const mudancas = conta
          ? { valor, categoria, descricao: texto, vencimento, data: vencimento }
          : travado ? { descricao: texto }
          : manterDividido ? { categoria, descricao: texto, ...(escolheData ? { data } : {}) }
          : { valor, forma, pagamentos, categoria, descricao: texto, ...(escolheData ? { data } : {}) };
        const r = await sb.from("lancamentos").update(mudancas).eq("id", inicial.id).eq("petshop_id", petshop.id).select("id");
        if (r.error) throw new Error(r.error.message);
        if (!r.data?.length) throw new Error("Não deu para salvar. Este lançamento pode ter sido apagado, ou só o dono e quem cuida do financeiro podem alterar.");
        if (baixou && restoDevido && inicial.cliente_id) {
          // a diferença vira uma conta a receber do mesmo cliente: não some do que ele deve
          const resto = await gravarLancamento(sb, petshop.id, {
            petshop_id: petshop.id, tipo: "entrada", valor: baixou, categoria, pago: false, forma: null, vencimento: restoQuando, data: restoQuando,
            descricao: `Resto de ${texto || inicial.categoria}`.slice(0, 120), cliente_id: inicial.cliente_id, origem: "tela", criado_por: user.id,
          }, parteDaChave(chave, "resto"));
          if (resto.error) throw new Error(`A alteração foi salva, mas a diferença não ficou anotada. Anote ${brl(baixou)} na ficha do cliente. (${resto.error.message})`);
          avisar(`Alteração salva. ${brl(baixou)} ficaram anotados para ${nomeDoCliente} pagar até ${dataCompleta(restoQuando)}.`);
        } else avisar("Alteração salva.");
      } else if (conta) {
        const linhas = Array.from({ length: vezes }, (_, i) => {
          const dia = somaMeses(vencimento, i);
          return {
            petshop_id: petshop.id, tipo, valor, categoria, pago: false, forma: null, vencimento: dia, data: dia,
            descricao: vezes > 1 ? `${texto} (${i + 1}/${vezes})` : texto, origem: "tela", criado_por: user.id,
            ...(entrada && tutorConta ? { cliente_id: tutorConta.id } : {}),
            chave: parteDaChave(chave, "conta", i + 1),
          };
        });
        // a chave de cada conta é única: um toque duplo (ou o pedido repetido) não anota as contas duas vezes
        const r = await sb.from("lancamentos").upsert(linhas, { onConflict: "petshop_id,chave", ignoreDuplicates: true });
        if (r.error) throw new Error(r.error.message);
        avisar(vezes > 1 ? `${vezes} contas anotadas, uma por mês.` : entrada && tutorConta ? `Conta anotada: ${tutorConta.nome.split(" ")[0]} deve ${brl(valor)}. Aparece na ficha e em A receber.` : "Conta anotada.");
      } else if (!forma) {
        setSalvando(false);
        return;
      } else if (!escolheData || data === hoje) {
        await lancarPago(sb, petshop.id, { tipo, valor, forma, pagamentos, categoria, descricao: texto, chave });
        avisar(entrada ? `Entrada de ${brl(valor)} anotada.` : `Saída de ${brl(valor)} anotada.`);
      } else {
        // dia que já passou: não entra no caixa de hoje
        const r = await gravarLancamento(sb, petshop.id, {
          petshop_id: petshop.id, tipo, valor, forma, categoria, descricao: texto, data, pago: true, origem: "tela", criado_por: user.id,
          ...(pagamentos ? { pagamentos } : {}),
        }, chave);
        if (r.error) throw new Error(r.error.message);
        avisar(`${entrada ? "Entrada" : "Saída"} de ${brl(valor)} anotada em ${dataCompleta(data)}.`);
      }
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      setSalvando(false);
      return false;
    }
  }

  async function excluir() {
    if (!inicial || salvando) return;
    const sim = await confirmar({
      titulo: conta ? "Excluir esta conta?" : "Excluir este lançamento?",
      texto: `${inicial.descricao || inicial.categoria} · ${brl(inicial.valor)}. ${voltam === 1 ? "Esta venda tinha 1 produto. Ele volta para o estoque. " : voltam > 1 ? `Esta venda tinha ${voltam} produtos. Eles voltam para o estoque. ` : ""}Não dá para desfazer.`,
      confirmar: "Excluir", perigo: true,
    });
    if (!sim) return;
    setSalvando(true);
    try {
      const r = await desfazerVenda(sb, petshop.id, inicial);
      const nome = conta ? "Conta excluída." : "Lançamento excluído.";
      if (r.erroEstoque) avisarErro(`${nome} Mas os produtos não voltaram para o estoque. Acerte o saldo na tela de Estoque. (${r.erroEstoque})`);
      else if (!r.produtos) avisar(nome);
      else if (!r.devolvidos) avisar(`${nome} ${r.produtos === 1 ? "O produto não existe mais" : "Os produtos não existem mais"} no estoque, então nada voltou.`);
      else avisar(`${nome} ${r.devolvidos === 1 ? "1 produto voltou" : `${r.devolvidos} produtos voltaram`} para o estoque.${r.devolvidos < r.produtos ? ` ${r.produtos - r.devolvidos === 1 ? "1 não existe mais" : `${r.produtos - r.devolvidos} não existem mais`} e ficou de fora.` : ""}`);
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      await aoSalvo();
      setSalvando(false);
      return false;
    }
  }

  return (
    <Folha titulo={titulo} aoFechar={aoFechar}
      rodape={soVer ? <button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button> : <>
        {inicial && !travado && <button type="button" className="g-btn perigo" onClick={excluir} disabled={salvando}><Trash2 />Excluir</button>}
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando || op.ocupado}>{salvando ? "Salvando…" : inicial ? "Salvar" : conta ? "Anotar conta" : "Lançar"}</button>
      </>}>
      <form className="g-form" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        {soVer && !travado && (
          <p className="g-cx-fora" role="status">
            <Lock aria-hidden />
            <span>Valor já recebido: só o dono ou quem cuida do financeiro pode alterar ou excluir. Quem opera o caixa corrige só o que lançou, enquanto o caixa está aberto.</span>
          </p>
        )}
        {travado && (
          <p className="g-cx-fora" role="status">
            <Lock aria-hidden />
            <span>Este lançamento é de um caixa já fechado ({dataCompleta(caixaFechadoEm!)}). O valor, a forma de pagamento, a categoria e o dia não mudam mais, e ele não pode ser excluído. Só a descrição pode ser corrigida. Se precisar corrigir, lance um ajuste: uma entrada ou uma saída com a diferença.</span>
          </p>
        )}
        {inicial && <ItensDoLancamento lancamento={inicial} />}
        {inicial && <HistoricoDeAlteracoes lancamento={inicial} />}
        {inicial && <PrecosMudados lancamento={inicial} />}
        {inicial && <PartesRecebidas conta={inicial} />}
        {inicial?.conta_id && !soVer && !travado && (
          <p className="g-muted g-pp">Este valor é uma parte recebida de uma conta. Se você excluir ou diminuir, a diferença volta a ficar em aberto na conta do cliente.</p>
        )}
        {escolheTipo && !inicial && (
          <div className="g-seg gf-seg-cheio" role="group" aria-label="Tipo">
            <button type="button" aria-pressed={entrada} onClick={() => trocarTipo("entrada")}>Entrada</button>
            <button type="button" aria-pressed={!entrada} onClick={() => trocarTipo("saida")}>Saída</button>
          </div>
        )}
        {conta && entrada && !inicial && (
          tutorFixo ? <Grupo rotulo="Cliente"><p className="g-p">{tutorFixo.nome}</p></Grupo>
            : <EscolhaTutor valor={tutorConta} aoMudar={setTutorConta} />
        )}
        {conta && (
          <Campo rotulo="Do que é">
            <input className="g-input" value={descricao} maxLength={120} autoFocus={!inicial} onChange={(e) => setDescricao(e.target.value)}
              placeholder={entrada ? (tutorFixo || tutorConta ? "Ex.: taxa de falta do dia 14/11" : "Ex.: pacote da Mel, fiado da Dona Lúcia") : "Ex.: aluguel, conta de luz"} />
          </Campo>
        )}
        <div className={conta || escolheData ? "dupla" : undefined}>
          <Campo rotulo="Valor" erro={erro}>
            <CampoDinheiro valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} autoFocus={!conta && !inicial} desligado={travado || manterDividido || soVer} maximo={99999999} />
          </Campo>
          {conta && (
            <Campo rotulo="Vencimento" dica={tutorFixo && !inicial ? "Quando ele paga. Vai pagar no próximo banho? Ponha o dia do horário." : undefined}>
              <input type="date" className="g-input" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Campo>
          )}
          {!conta && escolheData && (
            <Campo rotulo="Dia">
              <input type="date" className="g-input" value={data} max={hoje} disabled={travado || soVer} onChange={(e) => setData(e.target.value)} />
            </Campo>
          )}
        </div>
        {!conta && (travado || manterDividido || soVer ? (
          <Grupo rotulo={entrada ? "Como recebeu" : "Como pagou"}>
            <p className="g-p g-tab">{inicial ? textoDoPagamento(inicial) : ""}</p>
            {manterDividido && !travado && !soVer && (
              <>
                <small>Pagamento dividido. Para mudar o valor ou a forma, troque para uma forma só.</small>
                <div><button type="button" className="g-btn sec p" onClick={() => setManterDividido(false)}>Trocar a forma de pagamento</button></div>
              </>
            )}
          </Grupo>
        ) : entrada
          ? <EscolhaPagamento valor={pagamento} aoMudar={(e) => { setPagamento(e); setErro(null); }} total={valor ?? 0} rotulo="Como recebeu" />
          : <Grupo rotulo="Como pagou"><Chips opcoes={FORMAS} valor={pagamento.forma} aoMudar={(f) => { setPagamento(pagamentoInicial(f)); setErro(null); }} rotulo="Forma de pagamento" /></Grupo>)}
        {soVer
          ? <Grupo rotulo="Categoria"><p className="g-p">{categoria}{descricao ? ` · ${descricao}` : ""}</p></Grupo>
          : <Grupo rotulo="Categoria"><Chips opcoes={categorias} valor={categoria} aoMudar={setCategoria} rotulo="Categoria" /></Grupo>}
        {!conta && !soVer && (
          <Campo rotulo="Descrição (se quiser)">
            <input className="g-input" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)}
              placeholder={entrada ? "Ex.: banho da Mel" : "Ex.: shampoo, troco do motoboy"} />
          </Campo>
        )}
        {baixou > 0 && (
          <div className="g-card liso g-pilha p" role="group" aria-label="A diferença ainda é devida?">
            <p className="g-p">O valor baixou {brl(baixou)}. {nomeDoCliente} ainda deve essa diferença?</p>
            <div className="g-seg" role="group" aria-label="A diferença">
              <button type="button" aria-pressed={restoDevido === true} onClick={() => { setRestoDevido(true); setErro(null); }}>Ainda deve</button>
              <button type="button" aria-pressed={restoDevido === false} onClick={() => { setRestoDevido(false); setErro(null); }}>Não deve, foi engano</button>
            </div>
            {restoDevido && (
              <Campo rotulo="Quando paga a diferença" dica="Fica em Financeiro, A receber, e na ficha do cliente.">
                <input type="date" className="g-input" value={restoQuando} min={hoje} onChange={(e) => setRestoQuando(e.target.value)} />
              </Campo>
            )}
          </div>
        )}
        {recebido && !soVer && !travado && (
          <p className="g-muted g-pp">Este valor já foi recebido. Se você alterar ou excluir, fica anotado quem mudou, quando e o valor de antes.</p>
        )}
        {!inicial && !conta && (!escolheData || data === hoje) && <AvisoCaixaFechado aberto={caixa} />}
        {conta && !inicial && !tutorFixo && (
          <>
            <label className="g-check">
              <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
              Repetir todo mês
            </label>
            {repetir && (
              <Campo rotulo="Por quantos meses" dica="Cria uma conta por mês, no mesmo dia do vencimento.">
                <input type="number" className="g-input g-tab" inputMode="numeric" min={2} max={36} value={meses}
                  onChange={(e) => setMeses(Number(e.target.value))} />
              </Campo>
            )}
          </>
        )}
        <button type="submit" hidden />
      </form>
    </Folha>
  );
}

/* ---------- dar baixa em uma conta ---------- */

/** "pago R$ 50,00 de R$ 120,00" para a conta que já teve parte recebida; vazio para as outras. */
export function textoJaRecebido(c: Pick<Lancamento, "valor" | "valor_original">) {
  const cheio = c.valor_original == null ? 0 : Number(c.valor_original);
  return cheio > Number(c.valor) ? `pago ${brl(centavos(cheio - Number(c.valor)))} de ${brl(cheio)}` : "";
}

/** As partes já recebidas de uma conta: quando, quanto, como e quem recebeu. */
export function PartesRecebidas({ conta }: { conta: Pick<Lancamento, "id" | "valor" | "valor_original"> }) {
  const { sb } = useGestao();
  const tem = conta.valor_original != null;
  const { dados } = useDados(async () => {
    if (!tem) return [];
    const r = await sb.rpc("partes_da_conta", { p_conta: conta.id });
    return r.data ?? [];
  }, [conta.id, tem, conta.valor]);
  if (!tem) return null;
  return (
    <section className="gf-alteracoes" aria-label="Partes já recebidas desta conta">
      <span className="g-rotulo"><History size={14} aria-hidden />Já recebido desta conta</span>
      {dados?.length
        ? <ul>{dados.map((x) => <li key={x.id}><b className="g-tab">{brl(x.valor)}</b> em {dataCompleta(x.data)} · {textoDoPagamento(x)}{x.quem ? ` · recebido por ${x.quem}` : ""}</li>)}</ul>
        : <p className="g-muted g-pp">{textoJaRecebido(conta) || "Nada recebido ainda."}</p>}
    </section>
  );
}

/**
 * "Recebi" (ou "Paguei") uma conta. Conta a receber: dá para receber o valor inteiro ou só uma parte; a parte recebida
 * entra como dinheiro de verdade (no caixa aberto, se foi hoje) e o resto continua na mesma conta, no mesmo vencimento ou num novo.
 * Com a opção de multa ligada, a conta atrasada mostra o valor atualizado sugerido; a multa só entra se a pessoa somar.
 */
const fechadoNoResto = (dia: string) => `${dataCompleta(dia)} é dia fechado${nomeDoDiaFechado(dia) ? ` (${nomeDoDiaFechado(dia)})` : ""}. Escolha um dia em que vocês abrem.`;

/**
 * "Usar o crédito": o tutor tem crédito (pagou a mais antes) e ele paga esta conta, ou uma parte. A mesma peça na conta do
 * atendimento, no Recebi, na creche. `usado`: quanto do crédito entra; `resto`: o que falta pagar de outro jeito.
 */
export function UsarCredito({ saldo, usar, aoMudar, usado, resto }: { saldo: number; usar: boolean; aoMudar: (v: boolean) => void; usado: number; resto: number }) {
  return (
    <div className="g-campo" role="group" aria-label="Crédito do tutor">
      <span>Crédito do tutor: {brl(saldo)}</span>
      <label className={`g-agd-junto${usar ? " on" : ""}`}>
        <input type="checkbox" checked={usar} onChange={(e) => aoMudar(e.target.checked)} />
        <span className="t">
          <b>Usar o crédito</b>
          <small>{usar ? (resto > 0 ? `${brl(usado)} saem do crédito. Falta ${brl(resto)}, pela forma que você escolher.` : `${brl(usado)} saem do crédito e pagam tudo.${saldo - usado > 0.005 ? ` Sobram ${brl(centavos(saldo - usado))} de crédito.` : ""}`) : "O tutor pagou a mais antes. Marque para descontar daqui."}</small>
        </span>
        <b className="v g-tab">{usar ? `- ${brl(usado)}` : brl(saldo)}</b>
      </label>
    </div>
  );
}

export function FolhaBaixa({ conta, aoFechar, aoSalvo }: { conta: Lancamento; aoFechar: () => void; aoSalvo: () => void | Promise<void> }) {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  useCalendario(); // dia fechado: o resto não vence nele
  const hoje = hojeIso();
  const entrada = conta.tipo === "entrada";
  const devido = Number(conta.valor);
  // nenhuma forma vem marcada: a pessoa escolhe como o dinheiro entrou
  const [pagamento, setPagamento] = useState<EstadoPagamento>(() => pagamentoInicial());
  const caixaAgora = useCaixaAberto();
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState<number | null>(devido);
  const [novoVencimento, setNovoVencimento] = useState(conta.vencimento && conta.vencimento >= hoje ? conta.vencimento : "");
  // a multa sugerida conta os dias de atraso até o dia em que o cliente pagou (não até hoje)
  const sugerida = entrada ? multaSugerida(petshop, conta, data && data <= hoje ? data : hoje) : null;
  const jaMulta = Number(conta.multa_recebida ?? 0);
  const [multa, setMulta] = useState<number | null>(null);
  const [comMulta, setComMulta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroValor, setErroValor] = useState<string | null>(null);

  const recebendo = entrada ? centavos(valor ?? 0) : devido;
  const parcial = entrada && recebendo > 0 && recebendo < devido;
  const falta = centavos(devido - recebendo);
  const daMulta = comMulta ? centavos(multa ?? 0) : 0;
  // crédito do tutor (pagou a mais antes): paga esta conta, ou uma parte dela, se a pessoa quiser
  const { dados: saldoCredito } = useDados(async () => (entrada && conta.cliente_id && !conta.pago ? (await creditoDoTutor(sb, petshop.id, conta.cliente_id)).saldo : 0), [petshop.id, conta.id, conta.cliente_id ?? ""]);
  const [usarCredito, setUsarCredito] = useState(true);
  const credito = usarCredito && (saldoCredito ?? 0) > 0 ? centavos(Math.min(saldoCredito ?? 0, recebendo)) : 0;
  const total = centavos(recebendo + daMulta - credito);

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando) return;
    if (entrada && !(recebendo > 0)) { setErroValor("Escreva quanto o cliente pagou."); return; }
    if (entrada && recebendo > devido) { setErroValor(`O cliente deve ${brl(devido)} nesta conta. Se pagou a mais, lance a diferença como outra entrada.`); return; }
    if (credito > 0 && credito >= recebendo - 0.005 && daMulta > 0) { setErro("Com o crédito pagando a conta toda, a multa fica de fora: tire a multa ou use menos crédito."); return; }
    const pg = total > 0 ? fecharPagamento(pagamento, total) : { forma: "outro" as const, pagamentos: null };
    if ("erro" in pg) { setErro(pagamento.dividido ? pg.erro : entrada ? "Escolha como recebeu." : "Escolha como pagou."); return; }
    if (!data || data > hoje) { setErro("Escolha um dia até hoje."); return; }
    // o resto não vence num dia em que o negócio está fechado (feriado, folga marcada em Meu pet shop)
    if (parcial && novoVencimento && diaFechado(novoVencimento)) { setErro(fechadoNoResto(novoVencimento)); return; }
    if (data === hoje && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    setSalvando(true);
    try {
      if (entrada) {
        // primeiro o crédito (o banco tira do crédito do tutor na mesma gravação), depois o resto pela forma escolhida
        const vencimento = parcial && novoVencimento && novoVencimento !== conta.vencimento ? novoVencimento : null;
        let r = credito > 0 ? await receberComCredito(sb, conta.id, credito, parteDaChave(chave, "credito")) : null;
        const resto = centavos(recebendo - credito);
        if (resto > 0) {
          const partes = separarMulta(pg.forma, pg.pagamentos, daMulta);
          r = await receberConta(sb, conta.id, {
            valor: resto, forma: partes.conta.forma, pagamentos: partes.conta.pagamentos, data: cuidoDoFinanceiro ? data : null,
            novoVencimento: vencimento,
            multa: daMulta > 0 ? { valor: daMulta, forma: partes.multa.forma, pagamentos: partes.multa.pagamentos } : null,
            chave,
          });
        }
        const comCredito = credito > 0 ? ` ${brl(credito)} saíram do crédito do tutor.` : "";
        avisar(r!.quitada ? `Recebido: ${brl(centavos(total + credito))}.${comCredito}` : `Recebido: ${brl(centavos(total + credito))}.${comCredito} Fica faltando ${brl(r!.falta)}.`);
      } else {
        // só entra no caixa aberto quando o dinheiro andou hoje
        const caixa = data === hoje ? await caixaAberto(sb, petshop.id) : null;
        const r = await sb.from("lancamentos").update({ pago: true, data, forma: pg.forma, pagamentos: pg.pagamentos, caixa_id: caixa?.id ?? null })
          .eq("id", conta.id).eq("petshop_id", petshop.id).eq("pago", false).select("id");
        if (r.error) throw new Error(r.error.message);
        if (!r.data?.length) throw new Error("Esta conta já tinha sido baixada.");
        avisar(`Pago: ${brl(conta.valor)}.`);
      }
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      await aoSalvo();
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={entrada ? "Recebi esta conta" : "Paguei esta conta"} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando || op.ocupado}>{salvando ? "Salvando…" : credito > 0 ? (total > 0 ? `Receber ${brl(total)} e usar o crédito` : "Pagar com o crédito") : parcial || daMulta > 0 ? `Receber ${brl(total)}` : "Dar baixa"}</button>
      </>}>
      <div className="g-form">
        <div className="g-card areia">
          <LinhaResumo nome={conta.descricao || conta.categoria} valor={brl(conta.valor)} forte />
          <p className="g-muted g-pp">{conta.categoria}{conta.vencimento ? ` · vencimento em ${dataCompleta(conta.vencimento)}` : ""}{textoJaRecebido(conta) ? ` · ${textoJaRecebido(conta)}` : ""}</p>
        </div>
        {entrada && <PartesRecebidas conta={conta} />}
        {entrada && (
          <Campo rotulo="Quanto o cliente está pagando" erro={erroValor} dica={parcial ? undefined : "Se ele pagou só uma parte, escreva quanto. O resto continua anotado."}>
            <CampoDinheiro valor={valor} aoMudar={(v) => { setValor(v); setErroValor(null); setErro(null); }} maximo={99999999} rotulo="Quanto o cliente está pagando" />
          </Campo>
        )}
        {parcial && (
          <div className="gf-parcial" role="status">
            <p>Fica faltando <b className="g-tab">{brl(falta)}</b>. Continua em A receber{conta.cliente_id ? " e na ficha do tutor" : ""}.</p>
            <Campo rotulo="Quando ele paga o resto (se combinou outro dia)">
              <input type="date" className="g-input" value={novoVencimento} min={hoje} onChange={(e) => { setNovoVencimento(e.target.value); setErro(null); }} />
            </Campo>
            {novoVencimento && diaFechado(novoVencimento) && <p className="g-erro" role="alert">{fechadoNoResto(novoVencimento)}</p>}
          </div>
        )}
        {!sugerida && jaMulta > 0 && entrada && (
          <p className="g-muted g-pp">Multa e juros desta conta já cobrados: {brl(jaMulta)}{conta.multa_recebida_em ? ` em ${dataCompleta(conta.multa_recebida_em)}` : ""}. Não há mais nada a somar hoje.</p>
        )}
        {sugerida && (
          <div className="gf-multa">
            {jaMulta > 0 ? (
              <p>
                Venceu há {sugerida.dias === 1 ? "1 dia" : `${sugerida.dias} dias`}. A multa e os juros desta conta já foram cobrados ({brl(jaMulta)}{conta.multa_recebida_em ? ` em ${dataCompleta(conta.multa_recebida_em)}` : ""}).
                {" "}Do que falta, só os juros dos dias depois disso: <b className="g-tab">{brl(sugerida.total)}</b>, o que daria <b className="g-tab">{brl(centavos(devido + sugerida.total))}</b>.
              </p>
            ) : (
              <p>
                Venceu há {sugerida.dias === 1 ? "1 dia" : `${sugerida.dias} dias`}. Pela regra do pet shop ({regraDaMulta(petshop)}), o valor atualizado seria{" "}
                <b className="g-tab">{brl(centavos(devido + sugerida.total))}</b>: {brl(devido)} + {brl(sugerida.total)} de multa e juros.
              </p>
            )}
            {comMulta ? (
              <div className="gf-multa-linha">
                <label>
                  <span>Multa e juros</span>
                  <CampoDinheiro valor={multa} aoMudar={(v) => { setMulta(v); setErro(null); }} rotulo="Multa e juros" />
                </label>
                <button type="button" className="g-btn fantasma p" onClick={() => { setComMulta(false); setErro(null); }}><Trash2 />Tirar</button>
              </div>
            ) : (
              <div><button type="button" className="g-btn sec p" onClick={() => { setComMulta(true); setMulta(sugerida.total); setErro(null); }}>Somar multa e juros</button></div>
            )}
            <small>{comMulta ? "Entra separado, na categoria Multa e juros. Você pode mudar o valor ou tirar." : "Só entra se você somar. Sem tocar aqui, a conta é recebida pelo valor normal."}</small>
          </div>
        )}
        {entrada && (saldoCredito ?? 0) > 0 && (
          <UsarCredito saldo={saldoCredito!} usar={usarCredito} aoMudar={(v) => { setUsarCredito(v); setErro(null); }} usado={credito} resto={total} />
        )}
        {entrada && total <= 0 && credito > 0 ? null : entrada
          ? <EscolhaPagamento valor={pagamento} aoMudar={(e) => { setPagamento(e); setErro(null); }} total={total} rotulo="Como recebeu" />
          : <Grupo rotulo="Como pagou"><Chips opcoes={FORMAS} valor={pagamento.forma} aoMudar={(f) => { setPagamento(pagamentoInicial(f)); setErro(null); }} rotulo="Forma de pagamento" /></Grupo>}
        {conta.itens != null && <ItensDoLancamento lancamento={conta} />}
        {cuidoDoFinanceiro ? (
          <Campo rotulo={entrada ? "Dia em que recebeu" : "Dia em que pagou"} erro={erro}>
            <input type="date" className="g-input" value={data} max={hoje} onChange={(e) => { setData(e.target.value); setErro(null); }} />
          </Campo>
        ) : <p className="g-muted g-pp">{erro ? <span className="erro" role="alert">{erro} </span> : null}Entra com a data de hoje.</p>}
        {data === hoje && <AvisoCaixaFechado aberto={caixaAgora} />}
      </div>
    </Folha>
  );
}

/** Escolher o tutor de uma conta a receber: busca pelo nome ou telefone. Sem tutor, a conta fica solta (só em A receber). */
export function EscolhaTutor({ valor, aoMudar }: { valor: { id: string; nome: string } | null; aoMudar: (t: { id: string; nome: string } | null) => void }) {
  const { sb, petshop } = useGestao();
  const [busca, setBusca] = useState("");
  const termo = busca.trim();
  const { dados: achados } = useDados(async () => {
    if (termo.length < 2) return [] as { id: string; nome: string; telefone: string | null }[];
    const digitos = termo.replace(/\D/g, "");
    const q = sb.from("clientes").select("id, nome, telefone").eq("petshop_id", petshop.id).order("nome").limit(6);
    const r = digitos.length >= 4 && digitos.length === termo.replace(/[\s()+-]/g, "").length ? await q.ilike("telefone", `%${digitos}%`) : await q.ilike("nome", `%${termo.replace(/[%_]/g, "")}%`);
    return r.data ?? [];
  }, [petshop.id, termo]);
  if (valor) {
    return (
      <Grupo rotulo="Cliente">
        <div className="g-fila entre"><p className="g-p">{valor.nome}</p><button type="button" className="g-btn fantasma p" onClick={() => aoMudar(null)}>Trocar</button></div>
      </Grupo>
    );
  }
  return (
    <Campo rotulo="Cliente (se tiver)" dica="Com o cliente, a conta aparece na ficha dele e entra na cobrança pelo WhatsApp.">
      <input className="g-input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou telefone do tutor" aria-label="Buscar o tutor da conta" />
      {(achados ?? []).length > 0 && (
        <div className="g-chips" style={{ marginTop: 8 }} role="group" aria-label="Tutores encontrados">
          {(achados ?? []).map((t) => <button key={t.id} type="button" className="g-chip" onClick={() => { aoMudar({ id: t.id, nome: t.nome }); setBusca(""); }}>{t.nome}</button>)}
        </div>
      )}
    </Campo>
  );
}
