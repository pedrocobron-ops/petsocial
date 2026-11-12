"use client";

import { useState } from "react";
import { Lock, Package, Scissors, Sparkles, Trash2 } from "lucide-react";
import { caixaAberto, contaDosItens, desfazerVenda, itensDoLancamento, lancarPago, produtosDaVenda } from "@/lib/gestao/dinheiro";
import { CATEGORIAS_ENTRADA, CATEGORIAS_SAIDA, FORMAS, type Lancamento } from "@/lib/gestao/tipos";
import { brl, dataCompleta, deIsoDia, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { CampoDinheiro, formaLembrada, lembrarForma } from "../loja/pecas";
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

type Movimento = Pick<Lancamento, "tipo" | "valor" | "forma">;

/** Quanto entrou e saiu por forma de pagamento, e quanto deve ter de dinheiro na gaveta. */
export function resumoDoCaixa(valorInicial: number, lancamentos: Movimento[]) {
  const entradas = lancamentos.filter((l) => l.tipo === "entrada");
  const saidas = lancamentos.filter((l) => l.tipo === "saida");
  const daForma = (lista: Movimento[], id: string) => soma(lista.filter((l) => (l.forma ?? "outro") === id));
  const porForma = FORMAS.map((f) => ({ id: f.id, rotulo: f.rotulo, entrou: daForma(entradas, f.id), saiu: daForma(saidas, f.id) }));
  const dinheiro = porForma.find((f) => f.id === "dinheiro")!;
  return {
    entrou: soma(entradas), saiu: soma(saidas), porForma,
    esperado: centavos(Number(valorInicial) + dinheiro.entrou - dinheiro.saiu),
  };
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

/** "3 itens" para o subtítulo das linhas de lista; vazio quando o lançamento não tem itens. */
export function resumoDeItens(l: { itens?: unknown }) {
  const n = itensDoLancamento(l).length;
  return n ? (n === 1 ? "1 item" : `${n} itens`) : "";
}

/** O que foi vendido neste lançamento: quantidade × nome, preço de cada um e total da linha. Só leitura. */
export function ItensDoLancamento({ lancamento }: { lancamento: Pick<Lancamento, "itens" | "valor"> }) {
  const itens = itensDoLancamento(lancamento);
  if (!itens.length) return null;
  const { soma: somaItens, desconto } = contaDosItens(itens, Number(lancamento.valor));
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
      {desconto > 0 && (
        <div className="gf-itens-pe">
          <div><span>Soma dos itens</span><span className="g-tab">{brl(somaItens)}</span></div>
          <div><span>Desconto</span><span className="g-tab">− {brl(desconto)}</span></div>
          <div className="forte"><span>Valor do lançamento</span><span className="g-tab">{brl(lancamento.valor)}</span></div>
        </div>
      )}
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
  const { sb, petshop, user } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const hoje = hojeIso();
  const [tipo, setTipo] = useState<Tipo>(inicial ? (inicial.tipo as Tipo) : tipoInicial);
  const [valor, setValor] = useState<number | null>(inicial ? Number(inicial.valor) : null);
  // forma: a do lançamento; num novo, a última usada neste aparelho; sem nenhuma, a pessoa escolhe
  const [forma, setForma] = useState<FormaId | null>(() => (inicial ? (inicial.forma as FormaId | null) ?? "pix" : formaLembrada()));
  const [categoria, setCategoria] = useState(inicial ? categoriaAtual(inicial.categoria) : categoriasDe(tipoInicial)[0]);
  // lançamento de um caixa que já foi fechado: valor, forma e dia não mudam mais, e ele não pode ser excluído (o banco também recusa)
  const { dados: caixaFechadoEm } = useDados(async () => {
    if (!inicial?.caixa_id) return null;
    const r = await sb.from("caixas").select("fechado_em").eq("id", inicial.caixa_id).maybeSingle();
    return r.data?.fechado_em ?? null;
  }, [inicial?.caixa_id]);
  const travado = Boolean(caixaFechadoEm);
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
    if (!categoriasDe(t).includes(categoria)) setCategoria(categoriasDe(t)[0]);
  }

  async function salvar() {
    if (salvando) return;
    if (!valor || valor <= 0) { setErro("Escreva o valor."); return; }
    if (valor >= 1e8) { setErro("Esse valor é grande demais."); return; }
    const texto = descricao.trim() || null;
    if (conta && !texto) { setErro("Escreva do que é esta conta."); return; }
    if (conta && !vencimento) { setErro("Escolha o dia do vencimento."); return; }
    if (!conta && escolheData && (!data || data > hoje)) { setErro("Escolha um dia até hoje."); return; }
    if (!conta && !forma) { setErro(entrada ? "Escolha como recebeu." : "Escolha como pagou."); return; }
    const vezes = conta && !inicial && repetir ? Math.min(36, Math.max(2, Math.round(meses) || 2)) : 1;
    setErro(null);
    setSalvando(true);
    try {
      if (inicial) {
        const mudancas = conta
          ? { valor, categoria, descricao: texto, vencimento, data: vencimento }
          : travado ? { categoria, descricao: texto }
          : { valor, forma, categoria, descricao: texto, ...(escolheData ? { data } : {}) };
        const r = await sb.from("lancamentos").update(mudancas).eq("id", inicial.id).eq("petshop_id", petshop.id);
        if (r.error) throw new Error(r.error.message);
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
        lembrarForma(forma);
        await lancarPago(sb, petshop.id, { tipo, valor, forma, categoria, descricao: texto });
        avisar(entrada ? `Entrada de ${brl(valor)} anotada.` : `Saída de ${brl(valor)} anotada.`);
      } else {
        // dia que já passou: não entra no caixa de hoje
        const r = await sb.from("lancamentos").insert({
          petshop_id: petshop.id, tipo, valor, forma, categoria, descricao: texto, data, pago: true, origem: "tela", criado_por: user.id,
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
      rodape={<>
        {inicial && !travado && <button type="button" className="g-btn perigo" onClick={excluir} disabled={salvando}><Trash2 />Excluir</button>}
        <button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : inicial ? "Salvar" : conta ? "Anotar conta" : "Lançar"}</button>
      </>}>
      <form className="g-form" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        {travado && (
          <p className="g-cx-fora" role="status">
            <Lock aria-hidden />
            <span>Este lançamento é de um caixa já fechado ({dataCompleta(caixaFechadoEm!)}). O valor, a forma de pagamento e o dia não mudam mais, e ele não pode ser excluído. Se precisar corrigir, lance um ajuste: uma entrada ou uma saída com a diferença.</span>
          </p>
        )}
        {inicial && <ItensDoLancamento lancamento={inicial} />}
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
            <CampoDinheiro valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} autoFocus={!conta && !inicial} desligado={travado} maximo={99999999} />
          </Campo>
          {conta && (
            <Campo rotulo="Vencimento">
              <input type="date" className="g-input" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
            </Campo>
          )}
          {!conta && escolheData && (
            <Campo rotulo="Dia">
              <input type="date" className="g-input" value={data} max={hoje} disabled={travado} onChange={(e) => setData(e.target.value)} />
            </Campo>
          )}
        </div>
        {!conta && (travado
          ? <Grupo rotulo={entrada ? "Como recebeu" : "Como pagou"}><p className="g-p">{rotuloForma(forma)}</p></Grupo>
          : <Grupo rotulo={entrada ? "Como recebeu" : "Como pagou"}><Chips opcoes={FORMAS} valor={forma} aoMudar={(f) => { setForma(f); setErro(null); }} rotulo="Forma de pagamento" /></Grupo>)}
        <Grupo rotulo="Categoria"><Chips opcoes={categorias} valor={categoria} aoMudar={setCategoria} rotulo="Categoria" /></Grupo>
        {!conta && (
          <Campo rotulo="Descrição (se quiser)">
            <input className="g-input" value={descricao} maxLength={120} onChange={(e) => setDescricao(e.target.value)}
              placeholder={entrada ? "Ex.: banho da Mel" : "Ex.: shampoo, troco do motoboy"} />
          </Campo>
        )}
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

export function FolhaBaixa({ conta, aoFechar, aoSalvo }: { conta: Lancamento; aoFechar: () => void; aoSalvo: () => void | Promise<void> }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const hoje = hojeIso();
  const entrada = conta.tipo === "entrada";
  const [forma, setForma] = useState<FormaId | null>(() => formaLembrada());
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (salvando) return;
    if (!forma) { setErro(entrada ? "Escolha como recebeu." : "Escolha como pagou."); return; }
    if (!data || data > hoje) { setErro("Escolha um dia até hoje."); return; }
    setSalvando(true);
    try {
      lembrarForma(forma);
      // só entra no caixa aberto quando o dinheiro andou hoje
      const caixa = data === hoje ? await caixaAberto(sb, petshop.id) : null;
      const r = await sb.from("lancamentos").update({ pago: true, data, forma, caixa_id: caixa?.id ?? null })
        .eq("id", conta.id).eq("petshop_id", petshop.id).eq("pago", false).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw new Error("Esta conta já tinha sido baixada.");
      avisar(entrada ? `Recebido: ${brl(conta.valor)}.` : `Pago: ${brl(conta.valor)}.`);
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
        <button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Dar baixa"}</button>
      </>}>
      <div className="g-form">
        <div className="g-card areia">
          <LinhaResumo nome={conta.descricao || conta.categoria} valor={brl(conta.valor)} forte />
          <p className="g-muted g-pp">{conta.categoria}{conta.vencimento ? ` · vencimento em ${dataCompleta(conta.vencimento)}` : ""}</p>
        </div>
        <Grupo rotulo={entrada ? "Como recebeu" : "Como pagou"}><Chips opcoes={FORMAS} valor={forma} aoMudar={(f) => { setForma(f); setErro(null); }} rotulo="Forma de pagamento" /></Grupo>
        <Campo rotulo={entrada ? "Dia em que recebeu" : "Dia em que pagou"} erro={erro}>
          <input type="date" className="g-input" value={data} max={hoje} onChange={(e) => { setData(e.target.value); setErro(null); }} />
        </Campo>
      </div>
    </Folha>
  );
}
