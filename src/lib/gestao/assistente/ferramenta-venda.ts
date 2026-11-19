import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto, Resumo } from "./ferramentas";
import { comPrecosDeProduto } from "../reservado";
import { travaDePreco } from "../dinheiro-opcoes";
import { parteDaChave } from "../dinheiro";
import { limparNome } from "../validacao";
import { anotarParcelasComRetry, idsDaOperacao, lojaPerguntaParcelas } from "../maquininha";
import { fazerTudoOuNada, ref, type Passo } from "../tudo-ou-nada";
import { CATEGORIA_VENDA_DE_PRODUTOS } from "../venda-solta";
import { brl, centavos, semAcento } from "../util";

/**
 * Venda de produto pelo Mozart ("vendi 2 mordedores no Pix"): o mesmo caminho da Venda no balcão do Caixa
 * (`venda_registrar`): um lançamento só, em Venda de produtos, com os itens e o preço de cada um, e a saída de cada produto do
 * estoque com motivo Venda, ligada a esse lançamento. Os dois entram juntos ou nenhum entra; a mesma chave não vende duas vezes.
 * Assim a venda baixa o saldo e aparece nas vendas do Estoque e no relatório de produtos (antes o Mozart fazia uma saída de
 * estoque e um lançamento soltos, que o Estoque não contava como venda).
 * - Produto que não está no Estoque: com produto_nome (e o preço), o mesmo cartão cadastra o produto e vende (quem tem a área
 *   Estoque). O saldo fica negativo até alguém dar entrada, como na Venda no balcão.
 * - Produto sem preço no Estoque: o preço dito vale para a venda e fica como o preço do produto.
 * - Quem não recebe (só Estoque): dá baixa como venda, sem dinheiro, igual ao botão "Dar baixa no estoque" da tela.
 * - Pagar depois: a conta fica em A receber, no nome do tutor (precisa do cliente_id).
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean; soDono?: boolean };
type Entrada = Record<string, unknown>;
type Erro = (m: string) => Error;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const uuid = (v: unknown) => (typeof v === "string" && RE_UUID.test(v) ? v : null);
const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
const S = { type: "string" }, N = { type: "number" }, B = { type: "boolean" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false });
const FORMAS = ["pix", "dinheiro", "debito", "credito", "outro"];
const FORMA: Record<string, string> = { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", outro: "Outro" };
const UNIDADES = ["un", "kg", "g", "L", "ml", "pacote", "saco"];
const MAX_ITENS = 20;
const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const qtdTexto = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));
const mesmoNome = (a: string, b: string) => semAcento(a) === semAcento(b);

export const FERRAMENTA_VENDER_PRODUTO: Def[] = [
  { grava: true, name: "vender_produto",
    description: "Vende produtos do Estoque (ração, petisco, mordedor…), igual à Venda no balcão do Caixa: um lançamento só em Venda de produtos, com a quantidade e o preço de cada um, e o estoque baixa junto (a venda aparece nas vendas do Estoque). Use SEMPRE para venda de produto; nunca faça movimentar_estoque (saída) e lancar_dinheiro separados. Cada item: produto_id (de ver_estoque) ou produto_nome (a ferramenta acha pelo nome). Preço: o do Estoque; passe preco_unitario só se a pessoa disse outro, ou se o produto está sem preço. Produto que não está no Estoque: ofereça cadastrar e passe produto_nome, unidade e preco_unitario (o mesmo cartão cadastra e vende). Quem recebe passa a forma (pergunte se não disse); cliente que vai pagar depois: paga_depois com cliente_id (de buscar_pets).",
    input_schema: obj({
      itens: { type: "array", minItems: 1, maxItems: MAX_ITENS, description: "Os produtos vendidos", items: obj({
        produto_id: S, produto_nome: { ...S, description: "Nome do produto, quando não tem o produto_id" }, quantidade: N,
        preco_unitario: { ...N, description: "Preço de cada unidade, só se a pessoa disse (ou o produto está sem preço)" },
        unidade: { type: "string", enum: UNIDADES, description: "Só para produto novo (padrão un)" },
      }, ["quantidade"]) },
      forma: { type: "string", enum: FORMAS }, parcelas: { type: "integer", minimum: 1, maximum: 12, description: "Só no crédito: em quantas vezes (1 = à vista). Se a ferramenta pedir, pergunte." },
      cliente_id: { ...S, description: "Tutor que comprou (de buscar_pets), se a pessoa disse" },
      paga_depois: { ...B, description: "true quando o cliente leva agora e paga depois (fica em A receber, no nome dele)" },
      vencimento: { ...S, description: "Só com paga_depois: até quando paga (AAAA-MM-DD). Padrão: daqui a 7 dias" },
    }, ["itens"]) },
];

type ProdutoDaVenda = { id: string | null; nome: string; unidade: string; tipo: string; saldo: number; precoAntes: number | null };
type ItemDaVenda = { produto: ProdutoDaVenda; qtd: number; preco: number | null; novo: boolean; poePreco: boolean };
export type PlanoDaVenda = {
  itens: ItemDaVenda[]; total: number; recebe: boolean; forma: string | null; parcelas: number | null;
  cliente: { id: string; nome: string } | null; pagaDepois: boolean; vencimento: string | null;
};

/** As áreas da pessoa (sem a lista, como nos testes antigos, vale tudo). */
const temArea = (c: Contexto, a: string) => !Array.isArray(c.areas) || c.areas.includes(a);

/** Lê o pedido e confere tudo, sem gravar: o mesmo plano monta o cartão e, depois do "Pode fazer", a gravação. */
export async function planoDaVendaDeProduto(c: Contexto, e: Entrada, erro: Erro): Promise<PlanoDaVenda> {
  const pedidos = Array.isArray(e.itens) ? (e.itens as Entrada[]) : [];
  if (!pedidos.length) throw erro("Diga qual produto foi vendido e quantos.");
  if (pedidos.length > MAX_ITENS) throw erro(`Uma venda vai até ${MAX_ITENS} produtos.`);
  const lidos = (await c.sb.from("produtos").select("id, nome, unidade, estoque, tipo").eq("petshop_id", c.petshop.id).eq("ativo", true).limit(5000)).data ?? [];
  const comPreco = await comPrecosDeProduto(c.sb, c.petshop.id, lidos);
  const recebe = c.vejoFinanceiro;
  const trava = travaDePreco(c.petshop).ligada && !c.cuidoDoFinanceiro;
  const itens: ItemDaVenda[] = [];
  for (const p of pedidos) {
    const qtd = numero(p.quantidade);
    if (qtd == null || qtd <= 0 || qtd > 9999) throw erro("Falta a quantidade de cada produto (de 1 a 9.999).");
    const precoDito = p.preco_unitario == null ? null : numero(p.preco_unitario);
    if (p.preco_unitario != null && (precoDito == null || precoDito < 0 || precoDito > 99999)) throw erro("preco_unitario: use um valor entre R$ 0 e R$ 99.999.");
    const id = uuid(p.produto_id);
    const nomeDito = limparNome(texto(p.produto_nome, 300));
    // pelo nome: o igual; senão, o único que contém o que foi dito ("mordedor" acha "Mordedor de plástico"); com mais de um, pergunta
    let achado = id ? comPreco.find((x) => x.id === id) : nomeDito ? comPreco.find((x) => mesmoNome(x.nome, nomeDito)) : undefined;
    if (!id && !achado && nomeDito) {
      const parecidos = comPreco.filter((x) => semAcento(x.nome).includes(semAcento(nomeDito)));
      if (parecidos.length > 1) throw erro(`Há mais de um produto com "${nomeDito}": ${parecidos.slice(0, 6).map((x) => `${x.nome} (produto_id ${x.id})`).join("; ")}. Pergunte qual foi vendido.`);
      achado = parecidos[0];
    }
    if (id && !achado) throw erro("produto_id inválido: use ver_estoque.");
    let item: ItemDaVenda;
    if (achado) {
      const precoAntes = achado.preco_venda == null ? null : Number(achado.preco_venda);
      const produto = { id: achado.id, nome: achado.nome, unidade: achado.unidade, tipo: achado.tipo, saldo: Number(achado.estoque), precoAntes };
      // a mesma regra da Venda no balcão: com o preço travado, quem só opera o caixa não muda o preço do produto na venda
      if (recebe && precoDito != null && precoAntes != null && centavos(precoDito) !== centavos(precoAntes) && trava)
        throw erro(`Com o preço travado, ${achado.nome} sai por ${brl(precoAntes)}. Só o dono ou quem cuida do financeiro vende por outro preço. Nada foi vendido.`);
      const preco = precoDito ?? precoAntes;
      if (recebe && preco == null) throw erro(`${achado.nome} está sem preço no Estoque: pergunte quanto custa cada um e passe preco_unitario.`);
      item = { produto, qtd, preco: preco == null ? null : centavos(preco), novo: false, poePreco: recebe && precoAntes == null && preco != null && temArea(c, "estoque") };
    } else {
      if (!nomeDito) throw erro("Diga qual é o produto (produto_id de ver_estoque, ou o nome em produto_nome).");
      if (nomeDito.length > 120) throw erro("O nome do produto passa de 120 letras.");
      if (!temArea(c, "estoque")) throw erro(`${nomeDito} não está no Estoque, e cadastrar produto é com quem tem a área Estoque. Diga isso. Nada foi vendido.`);
      if (recebe && precoDito == null) throw erro(`${nomeDito} não está no Estoque. Ofereça cadastrar e pergunte o preço de cada um (preco_unitario).`);
      const unidade = UNIDADES.includes(String(p.unidade)) ? String(p.unidade) : "un";
      item = { produto: { id: null, nome: nomeDito, unidade, tipo: "produto", saldo: 0, precoAntes: null }, qtd, preco: precoDito == null ? null : centavos(precoDito), novo: true, poePreco: false };
    }
    if (itens.some((x) => (x.produto.id ?? x.produto.nome) === (item.produto.id ?? item.produto.nome))) throw erro(`${item.produto.nome} apareceu duas vezes: some as quantidades num item só.`);
    itens.push(item);
  }
  const total = centavos(itens.reduce((t, i) => t + (i.preco ?? 0) * i.qtd, 0));
  let forma: string | null = null, parcelas: number | null = null, cliente: { id: string; nome: string } | null = null, vencimento: string | null = null;
  const pagaDepois = recebe && e.paga_depois === true;
  if (uuid(e.cliente_id)) {
    const r = await c.sb.from("clientes").select("id, nome").eq("petshop_id", c.petshop.id).eq("id", String(e.cliente_id)).maybeSingle();
    if (!r.data) throw erro("Tutor não encontrado: use buscar_pets.");
    cliente = r.data;
  } else if (e.cliente_id) throw erro("cliente_id inválido: use buscar_pets.");
  if (recebe) {
    if (total <= 0) throw erro("A venda está sem valor. Confira o preço de cada produto.");
    if (pagaDepois) {
      if (!cliente) throw erro("Para o cliente pagar depois, diga quem comprou: use buscar_pets e passe cliente_id.");
      vencimento = e.vencimento ? String(e.vencimento) : somaDias(c.agora.slice(0, 10), 7);
      if (!RE_DIA.test(vencimento) || vencimento < c.agora.slice(0, 10)) throw erro("vencimento no formato AAAA-MM-DD, de hoje em diante.");
    } else {
      forma = FORMAS.includes(String(e.forma)) ? String(e.forma) : null;
      if (!forma) throw erro("Falta a forma de pagamento: pergunte (Pix, dinheiro, débito ou crédito).");
      if (forma === "credito") {
        const n = numero(e.parcelas);
        if (n != null && !(Number.isInteger(n) && n >= 1 && n <= 12)) throw erro("parcelas vai de 1 (à vista) a 12.");
        if (n == null && (await lojaPerguntaParcelas(c.sb, c.petshop.id))) throw erro("Falta saber em quantas vezes foi o crédito: pergunte (à vista ou de 2 a 12 vezes) e passe parcelas.");
        parcelas = n;
      }
    }
  }
  return { itens, total, recebe, forma, parcelas, cliente, pagaDepois, vencimento };
}

/** O cartão: cada produto com quantidade e valor, o total, como pagou e como fica o estoque. */
export function resumoDaVendaDeProduto(p: PlanoDaVenda): Resumo {
  const linhas: [string, string][] = [];
  for (const i of p.itens) {
    const oQue = `${qtdTexto(i.qtd)} ${i.produto.unidade} de ${i.produto.nome}`;
    linhas.push([i.novo ? `${oQue} (novo no Estoque)` : oQue, p.recebe && i.preco != null ? `${brl(centavos(i.preco * i.qtd))}${i.qtd !== 1 ? ` (${brl(i.preco)} cada)` : ""}` : "sai do estoque"]);
  }
  if (p.recebe) {
    linhas.push(["Total", brl(p.total)]);
    if (p.pagaDepois) linhas.push(["Paga depois", `até ${p.vencimento!.slice(8, 10)}/${p.vencimento!.slice(5, 7)}: fica em A receber, no nome de ${p.cliente?.nome ?? "quem comprou"}`]);
    else linhas.push(["Forma", `${FORMA[p.forma!]}${p.parcelas && p.parcelas > 1 ? ` em ${p.parcelas}x` : p.forma === "credito" && p.parcelas === 1 ? " à vista" : ""}`]);
  }
  if (p.cliente && !p.pagaDepois) linhas.push(["Cliente", p.cliente.nome]);
  for (const i of p.itens) {
    if (i.novo) linhas.push(["Cadastra no Estoque", `${i.produto.nome}${i.preco != null ? `, ${brl(i.preco)} por ${i.produto.unidade}` : ""}. O saldo fica em ${qtdTexto(-i.qtd)} ${i.produto.unidade} até você dar entrada`]);
    else if (i.produto.tipo !== "kit") {
      const fica = i.produto.saldo - i.qtd;
      linhas.push([`Estoque de ${i.produto.nome}`, `${qtdTexto(i.produto.saldo)} → ${qtdTexto(fica)} ${i.produto.unidade}${fica < 0 ? " (fica negativo até dar entrada)" : ""}`]);
    }
    if (i.poePreco) linhas.push(["Preço no Estoque", `${i.produto.nome} estava sem preço: fica ${brl(i.preco!)} por ${i.produto.unidade}`]);
  }
  if (!p.recebe) linhas.push(["Dinheiro", "fica para quem cuida do caixa lançar"]);
  return { titulo: p.itens.length === 1 ? "Vender produto" : `Vender ${p.itens.length} produtos`, linhas };
}

export async function descreverVendaDeProduto(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<Resumo | null> {
  if (nome !== "vender_produto") return null;
  return resumoDaVendaDeProduto(await planoDaVendaDeProduto(c, e, erro));
}

export async function gravarVendaDeProduto(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<unknown> {
  if (nome !== "vender_produto") return null;
  const { sb, petshop } = c;
  const chave = c.chave && c.chave.length >= 8 ? c.chave : `mozart:${crypto.randomUUID()}`;
  // o mesmo "Pode fazer" chegou de novo: a venda já está gravada (não cadastra o produto nem vende outra vez)
  const ja = await sb.rpc("lote_ja_feito", { p_petshop: petshop.id, p_chave: chave });
  if (ja.data) return { feito: true, repetido: true, aviso: "Essa venda já tinha sido anotada. Nada foi vendido de novo." };
  const p = await planoDaVendaDeProduto(c, e, erro);
  // produto novo: cadastra antes (com o preço dito); se outra tentativa já cadastrou com o mesmo nome, usa o que está lá
  for (const i of p.itens.filter((x) => x.novo)) {
    const igual = await sb.from("produtos").select("id").eq("petshop_id", petshop.id).eq("nome", i.produto.nome).eq("ativo", true).limit(1);
    const id = igual.data?.[0]?.id ?? null;
    if (id) { i.produto.id = id; continue; }
    const r = await sb.from("produtos").insert({ petshop_id: petshop.id, nome: i.produto.nome, unidade: i.produto.unidade, ...(i.preco != null ? { preco_venda: i.preco } : {}) }).select("id").single();
    if (r.error || !r.data) throw erro(`Não consegui cadastrar ${i.produto.nome} no Estoque: ${r.error?.message ?? "sem resposta"}. Nada foi vendido.`);
    i.produto.id = r.data.id;
  }
  // produto que estava sem preço (o plano acabou de ler): o preço da venda fica como o preço dele. Não dá para filtrar por
  // preco_venda no update (a coluna não é lida direto: vem por `comPrecosDeProduto`); se falhar, a venda segue e o aviso vai junto
  let semPreco: string[] = [];
  for (const i of p.itens.filter((x) => x.poePreco)) {
    const r = await sb.from("produtos").update({ preco_venda: i.preco }).eq("petshop_id", petshop.id).eq("id", i.produto.id!).select("id");
    if (r.error || !r.data?.length) semPreco = [...semPreco, i.produto.nome];
  }
  const itens = p.itens.map((i) => ({ tipo: "produto" as const, nome: i.produto.nome, qtd: i.qtd, valor: i.preco ?? 0, produto_id: i.produto.id! }));
  const descricao = `Venda: ${itens.map((i) => `${qtdTexto(i.qtd)} ${i.nome}`).join(" + ")}`.slice(0, 200);
  const passos: Passo[] = [];
  if (p.recebe) {
    passos.push({ t: "lancamento", nome: "venda", chave, linha: {
      tipo: "entrada", valor: p.total, forma: p.pagaDepois ? null : p.forma, categoria: CATEGORIA_VENDA_DE_PRODUTOS, cliente_id: p.cliente?.id ?? null,
      pago: !p.pagaDepois, ...(p.pagaDepois ? { data: p.vencimento, vencimento: p.vencimento } : {}), descricao, itens, origem: "assistente",
    } });
  }
  passos.push({ t: "estoque", linhas: p.itens.map((i) => ({ produto_id: i.produto.id!, quantidade: i.qtd, chave: parteDaChave(chave, "estoque", i.produto.id!) ?? null,
    ...(p.recebe ? { lancamento_id: ref("venda") } : {}) })) });
  let r;
  try {
    r = await fazerTudoOuNada(sb, petshop.id, chave, { funcao: "venda_registrar" }, passos);
  } catch (x) {
    const novos = p.itens.filter((i) => i.novo).map((i) => i.produto.nome);
    throw erro(`A venda não foi anotada e nada saiu do estoque${novos.length ? ` (${novos.join(", ")} ficou cadastrado no Estoque)` : ""}: ${x instanceof Error ? x.message : String(x)}`);
  }
  const resultado: Record<string, unknown> = { feito: true, total: p.recebe ? p.total : null, lancamento_id: r.ids?.venda ?? null,
    produtos: p.itens.map((i) => ({ produto_id: i.produto.id, nome: i.produto.nome, saldo: i.produto.tipo === "kit" ? null : i.produto.saldo - i.qtd, novo: i.novo })) };
  if (semPreco.length) resultado.aviso = `A venda entrou, mas o preço de ${semPreco.join(", ")} não ficou salvo no Estoque. Diga isso: dá para pôr na ficha do produto.`;
  if (p.forma === "credito" && p.parcelas && p.parcelas > 1) {
    const a = await anotarParcelasComRetry(sb, petshop.id, idsDaOperacao(r, passos as { t: string }[]), p.parcelas);
    if (a.ok) resultado.credito_em_vezes = p.parcelas;
    else resultado.aviso = `${resultado.aviso ? `${resultado.aviso} ` : ""}A venda entrou, mas não consegui anotar o crédito em ${p.parcelas} vezes: a taxa da maquininha ficou a do crédito à vista. Diga isso.`;
  }
  return resultado;
}
