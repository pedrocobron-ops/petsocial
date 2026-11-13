"use client";

import { useState } from "react";
import { History, Lock, Package, Scissors, Sparkles, Trash2 } from "lucide-react";
import { caixaAberto, conferirCaixa, conferirValorAlto, contaDosItens, desfazerVenda, ehDividido, itensDoLancamento, lancarPago, nomeDoMovimento, partesPorForma, produtosDaVenda, receberConta, separarMulta, textoDoPagamento } from "@/lib/gestao/dinheiro";
import { multaSugerida, regraDaMulta } from "@/lib/gestao/dinheiro-opcoes";
import { CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, FORMAS, type AlteracaoLancamento, type Lancamento } from "@/lib/gestao/tipos";
import { brl, dataCompleta, deIsoDia, hora, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvisoCaixaFechado, CampoDinheiro, EscolhaPagamento, fecharPagamento, pagamentoInicial, useCaixaAberto, type EstadoPagamento } from "../loja/pecas";
import { avisarMudanca, Campo, Folha, useAvisos, useDados, Vazio } from "../ui";
import "./financeiro.css";

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
export const COR_FORMA: Record<string, string> = { pix: "#2f6b4c", dinheiro: "#c99a2e", debito: "#2f6f8a", credito: "#5b4590", outro: "#a39a90" };
/** Cores para fatias e barras quando o item não tem cor própria. */
export const PALETA = ["#2f6b4c", "#ea670c", "#2f6f8a", "#5b4590", "#c99a2e", "#b3402e", "#6a625a", "#a39a90"];

type Movimento = Pick<Lancamento, "tipo" | "valor" | "forma"> & { pagamentos?: unknown; movimento?: string | null };

/** Tira sangrias e suprimentos: dinheiro que só entrou ou saiu da gaveta não é receita nem despesa. */
export const semMovimentos = <T extends { movimento?: string | null }>(lista: T[]) => lista.filter((l) => !l.movimento);

/** Soma por forma de pagamento, repartindo o pagamento dividido entre as formas dele. */
export function somaPorForma(lista: { valor: number; forma?: string | null; pagamentos?: unknown }[]) {
  const mapa = new Map<string, number>();
  for (const l of lista) for (const p of partesPorForma(l)) mapa.set(p.forma, centavos((mapa.get(p.forma) ?? 0) + p.valor));
  return mapa;
}

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
  return {
    entrou: soma(entradas), saiu: soma(saidas), porForma, suprimentos, sangrias,
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
  return (
    <section className="gf-itens" aria-label="Itens desta venda">
      <div className="gf-itens-t">
        <span className="g-rotulo">Itens desta venda</span>
        <span className="g-muted g-pp">{itens.length === 1 ? "1 item" : `${itens.length} itens`}</span>
      </div>
      <ul>
        {itens.map((i, n) => (
          <li key={n}>
            <Tile icone={ICONE_ITEM[i.tipo]} tom={TOM_ITEM[i.tipo]} tamanho="p" />
            <span className="n">
              <b><span className="g-tab">{fmtQtd(i.qtd)} ×</span> {i.nome}</b>
              <small className="g-tab">{brl(i.valor)} cada</small>
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
export function FolhaLancamento({ modo, tipo: tipoInicial, inicial, escolheData, escolheTipo, aoFechar, aoSalvo }: {
  modo: "pago" | "conta"; tipo: Tipo; inicial?: Lancamento | null; escolheData?: boolean; escolheTipo?: boolean;
  aoFechar: () => void; aoSalvo: () => void | Promise<void>;
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
  const [categoria, setCategoria] = useState(inicial ? categoriaAtual(inicial.categoria) : categoriasDe(tipoInicial)[0]);
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
  const [vencimento, setVencimento] = useState(inicial?.vencimento ?? hoje);
  const [repetir, setRepetir] = useState(false);
  const [meses, setMeses] = useState(6);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const conta = modo === "conta";
  const entrada = tipo === "entrada";
  const voltam = produtosDaVenda(inicial).length;
  const lista = categoriasDe(tipo);
  const categorias = (lista.includes(categoria) ? lista : [categoria, ...lista]).map((c) => ({ id: c, rotulo: c }));
  const titulo = conta
    ? `${inicial ? "Editar conta" : "Nova conta"} ${entrada ? "a receber" : "a pagar"}`
    : inicial ? `Editar ${entrada ? "entrada" : "saída"}` : escolheTipo ? "Novo lançamento" : entrada ? "Nova entrada" : "Nova saída";

  function trocarTipo(t: Tipo) {
    setTipo(t);
    if (t === "saida" && pagamento.dividido) setPagamento(pagamentoInicial(pagamento.partes[0]?.forma ?? pagamento.forma));
    if (!categoriasDe(t).includes(categoria)) setCategoria(categoriasDe(t)[0]);
  }

  async function salvar() {
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
        avisar("Alteração salva.");
      } else if (conta) {
        const linhas = Array.from({ length: vezes }, (_, i) => {
          const dia = somaMeses(vencimento, i);
          return {
            petshop_id: petshop.id, tipo, valor, categoria, pago: false, forma: null, vencimento: dia, data: dia,
            descricao: vezes > 1 ? `${texto} (${i + 1}/${vezes})` : texto, origem: "tela", criado_por: user.id,
          };
        });
        const r = await sb.from("lancamentos").insert(linhas);
        if (r.error) throw new Error(r.error.message);
        avisar(vezes > 1 ? `${vezes} contas anotadas, uma por mês.` : "Conta anotada.");
      } else if (!forma) {
        setSalvando(false);
        return;
      } else if (!escolheData || data === hoje) {
        await lancarPago(sb, petshop.id, { tipo, valor, forma, pagamentos, categoria, descricao: texto });
        avisar(entrada ? `Entrada de ${brl(valor)} anotada.` : `Saída de ${brl(valor)} anotada.`);
      } else {
        // dia que já passou: não entra no caixa de hoje
        const r = await sb.from("lancamentos").insert({
          petshop_id: petshop.id, tipo, valor, forma, categoria, descricao: texto, data, pago: true, origem: "tela", criado_por: user.id,
          ...(pagamentos ? { pagamentos } : {}),
        });
        if (r.error) throw new Error(r.error.message);
        avisar(`${entrada ? "Entrada" : "Saída"} de ${brl(valor)} anotada em ${dataCompleta(data)}.`);
      }
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      setSalvando(false);
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
    }
  }

  return (
    <Folha titulo={titulo} aoFechar={aoFechar}
      rodape={soVer ? <button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button> : <>
        {inicial && !travado && <button type="button" className="g-btn perigo" onClick={excluir} disabled={salvando}><Trash2 />Excluir</button>}
        <button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : inicial ? "Salvar" : conta ? "Anotar conta" : "Lançar"}</button>
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
        {conta && (
          <Campo rotulo="Do que é">
            <input className="g-input" value={descricao} maxLength={120} autoFocus={!inicial} onChange={(e) => setDescricao(e.target.value)}
              placeholder={entrada ? "Ex.: pacote da Mel, fiado da Dona Lúcia" : "Ex.: aluguel, conta de luz"} />
          </Campo>
        )}
        <div className={conta || escolheData ? "dupla" : undefined}>
          <Campo rotulo="Valor" erro={erro}>
            <CampoDinheiro valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} autoFocus={!conta && !inicial} desligado={travado || manterDividido || soVer} maximo={99999999} />
          </Campo>
          {conta && (
            <Campo rotulo="Vencimento">
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
        {recebido && !soVer && !travado && (
          <p className="g-muted g-pp">Este valor já foi recebido. Se você alterar ou excluir, fica anotado quem mudou, quando e o valor de antes.</p>
        )}
        {!inicial && !conta && (!escolheData || data === hoje) && <AvisoCaixaFechado aberto={caixa} />}
        {conta && !inicial && (
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
export function FolhaBaixa({ conta, aoFechar, aoSalvo }: { conta: Lancamento; aoFechar: () => void; aoSalvo: () => void | Promise<void> }) {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const hoje = hojeIso();
  const entrada = conta.tipo === "entrada";
  const devido = Number(conta.valor);
  // nenhuma forma vem marcada: a pessoa escolhe como o dinheiro entrou
  const [pagamento, setPagamento] = useState<EstadoPagamento>(() => pagamentoInicial());
  const caixaAgora = useCaixaAberto();
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState<number | null>(devido);
  const [novoVencimento, setNovoVencimento] = useState(conta.vencimento && conta.vencimento >= hoje ? conta.vencimento : "");
  const sugerida = entrada ? multaSugerida(petshop, conta, hoje) : null;
  const [multa, setMulta] = useState<number | null>(null);
  const [comMulta, setComMulta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroValor, setErroValor] = useState<string | null>(null);

  const recebendo = entrada ? centavos(valor ?? 0) : devido;
  const parcial = entrada && recebendo > 0 && recebendo < devido;
  const falta = centavos(devido - recebendo);
  const daMulta = comMulta ? centavos(multa ?? 0) : 0;
  const total = centavos(recebendo + daMulta);

  async function salvar() {
    if (salvando) return;
    if (entrada && !(recebendo > 0)) { setErroValor("Escreva quanto o cliente pagou."); return; }
    if (entrada && recebendo > devido) { setErroValor(`O cliente deve ${brl(devido)} nesta conta. Se pagou a mais, lance a diferença como outra entrada.`); return; }
    const pg = fecharPagamento(pagamento, total);
    if ("erro" in pg) { setErro(pagamento.dividido ? pg.erro : entrada ? "Escolha como recebeu." : "Escolha como pagou."); return; }
    if (!data || data > hoje) { setErro("Escolha um dia até hoje."); return; }
    if (data === hoje && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    setSalvando(true);
    try {
      if (entrada) {
        const partes = separarMulta(pg.forma, pg.pagamentos, daMulta);
        const r = await receberConta(sb, conta.id, {
          valor: recebendo, forma: partes.conta.forma, pagamentos: partes.conta.pagamentos, data: cuidoDoFinanceiro ? data : null,
          novoVencimento: parcial && novoVencimento && novoVencimento !== conta.vencimento ? novoVencimento : null,
          multa: daMulta > 0 ? { valor: daMulta, forma: partes.multa.forma, pagamentos: partes.multa.pagamentos } : null,
        });
        avisar(r.quitada ? `Recebido: ${brl(total)}.` : `Recebido: ${brl(total)}. Fica faltando ${brl(r.falta)}.`);
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
        <button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : parcial || daMulta > 0 ? `Receber ${brl(total)}` : "Dar baixa"}</button>
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
            <p>Fica faltando <b className="g-tab">{brl(falta)}</b>. Continua em A receber e na ficha do tutor.</p>
            <Campo rotulo="Quando ele paga o resto (se combinou outro dia)">
              <input type="date" className="g-input" value={novoVencimento} min={hoje} onChange={(e) => setNovoVencimento(e.target.value)} />
            </Campo>
          </div>
        )}
        {sugerida && (
          <div className="gf-multa">
            <p>
              Venceu há {sugerida.dias === 1 ? "1 dia" : `${sugerida.dias} dias`}. Pela regra do pet shop ({regraDaMulta(petshop)}), o valor atualizado seria{" "}
              <b className="g-tab">{brl(centavos(devido + sugerida.total))}</b>: {brl(devido)} + {brl(sugerida.total)} de multa e juros.
            </p>
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
        {entrada
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
