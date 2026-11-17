"use client";

import { COLS_MOVIMENTO, COLS_PRODUTO, comCustos, comCustosDeMovimento, comPrecosDeProduto } from "@/lib/gestao/reservado";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Importar from "@/components/gestao/importar";
import { AlertTriangle, ArrowUpFromLine, BarChart3, Barcode, Boxes, CalendarX, ClipboardCheck, ClipboardList, Minus, Package, PackageX, Plus, Search, ShoppingBag, SlidersHorizontal, Sparkles, Tag, Truck, Wallet, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useGestao } from "@/components/gestao/contexto";
import { abrirAssistente, avisarMudanca, Campo, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { Kpi, Tile } from "@/components/gestao/painel";
import { AvisoCaixaFechado, CampoDinheiro, ChipsForma, erroDeValor, ErroTela, EscolhaPagamento, fecharPagamento, fmtQtd, lembrarForma, lerQtd, ParcelasNaTela, useAnotarParcelas, useCaixaAberto, usePagamento, type Forma } from "@/components/gestao/loja/pecas";
import VendaBalcao from "@/components/gestao/loja/venda";
import nextDynamic from "next/dynamic";
import { FileText } from "lucide-react";
import Fornecedores, { EscolherFornecedor, pedeReposicao, useFornecedores, type Fornecedor } from "@/components/gestao/loja/fornecedores";
import { LerComCamera } from "@/components/gestao/loja/leitor";
import OQueComprar from "@/components/gestao/loja/o-que-comprar";
import { contaDoKit, lerItensDoKit, LotesDoProduto, nomeDoLote, ProdutosDoKit, quandoVence, resumoDaValidade, useItensDoKit, useLotesDoProduto, useVencimentos, Vencendo, type ItemDoKit } from "@/components/gestao/loja/validade";
import OpcoesDaLoja from "@/components/gestao/ajustes/opcoes-loja";
import { limparCodigo, margemDe, opcoesDaLoja, pct } from "@/lib/gestao/loja-opcoes";
import { conferirCaixa, conferirValorAlto, gravarMovimentos, lancarPago, parteDaChave } from "@/lib/gestao/dinheiro";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { travaDePreco } from "@/lib/gestao/dinheiro-opcoes";
import { FORMAS, type MovimentoEstoque, type Produto } from "@/lib/gestao/tipos";
import { brl, brlCurto, dataCompleta, dataCurta, isoDia, semAcento } from "@/lib/gestao/util";
import "./estoque.css";

// orçamentos: abre só com um toque
const Orcamentos = nextDynamic(() => import("@/components/gestao/loja/orcamento"), { ssr: false });

const UNIDADES = ["un", "kg", "g", "L", "ml", "pacote", "saco"];
const FILTROS = [
  { id: "todos", rotulo: "Todos" },
  { id: "acabando", rotulo: "Acabando" },
  { id: "zerados", rotulo: "Zerados" },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];
/** Quantos produtos aparecem por vez na lista. */
const PASSO = 60;
const MOTIVOS = [
  { id: "Venda", rotulo: "Venda" },
  { id: "Uso no banho", rotulo: "Uso no banho" },
  { id: "Perda ou vencido", rotulo: "Perda ou vencido" },
] as const;
type Motivo = (typeof MOTIVOS)[number]["id"];

const zerado = (p: Produto) => Number(p.estoque) <= 0;
const acabando = (p: Produto) => !zerado(p) && Number(p.estoque_minimo) > 0 && Number(p.estoque) <= Number(p.estoque_minimo);
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Nível do estoque em relação ao mínimo: vermelho abaixo, amarelo perto, verde com folga. */
function nivel(p: Produto): { tom: "ok" | "perto" | "baixo"; parte: number | null } {
  const tem = Number(p.estoque), min = Number(p.estoque_minimo);
  if (tem <= 0) return { tom: "baixo", parte: 0 };
  if (!(min > 0)) return { tom: "ok", parte: null };
  // a barra cheia vale o dobro do mínimo; a marca do mínimo fica no meio
  return { tom: tem < min ? "baixo" : tem <= min * 1.5 ? "perto" : "ok", parte: Math.min(1, tem / (min * 2)) };
}

type Aberta = { tipo: "novo" | "venda" | "fornecedores" | "opcoes" | "comprar" | "vencendo" } | { tipo: "entrada" | "saida" | "ficha"; produto: Produto };

/** O que as folhas de produto precisam saber das opções da loja. */
type Loja = { margem: boolean; codigoBarras: boolean; fornecedores: boolean; lista: Fornecedor[]; recarregarFornecedores: () => Promise<unknown>; produtos: Produto[];
  /** Vê o custo e a margem (dono, financeiro ou a chave "Ver custo e margem"): sem isso, nenhum custo aparece nem é regravado. */
  vejoCusto: boolean };

/** Outro produto da lista que já usa este código de barras (o banco também recusa; aqui é para avisar com o nome). */
function donoDoCodigo(produtos: Produto[], codigo: string | null, menosId?: string) {
  return codigo ? produtos.find((p) => p.codigo_barras === codigo && p.id !== menosId) ?? null : null;
}
const erroDeCodigo = (e: unknown) => (e instanceof Error && /produtos_codigo_barras_idx/.test(e.message) ? "Já existe um produto com esse código de barras." : e);

export default function Estoque() {
  const { sb, petshop, vejoFinanceiro, souDono, cuidoDoFinanceiro, vejoCusto, posso } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  const op = opcoesDaLoja(petshop);
  const { fornecedores, recarregar: recarregarFornecedores } = useFornecedores(op.fornecedores);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [importando, setImportando] = useState(false);
  const [orcamentos, setOrcamentos] = useState(false);

  const { dados, carregando, erro, recarregar } = useDados(async () =>
    (await comCustos(sb, petshop.id, await comPrecosDeProduto(sb, petshop.id, await lerTudo<{ id: string }>((de, ate, contar) => sb.from("produtos").select(COLS_PRODUTO, contando(contar)).eq("petshop_id", petshop.id).eq("ativo", true).order("nome").order("id").range(de, ate))))) as unknown as Produto[],
  [petshop.id]);

  // saídas dos últimos 30 dias: só para o resumo do topo (se a busca falhar, o cartão fica de fora)
  const { dados: saidas, recarregar: recarregarSaidas } = useDados(async () => {
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    // as saídas dos produtos de um kit vendido não contam de novo (a do kit já conta)
    return lerTudo<{ motivo: string | null; quantidade: number; lancamento_id: string | null }>((de, ate, contar) => sb.from("movimentos_estoque").select("motivo, quantidade, lancamento_id", contando(contar)).eq("petshop_id", petshop.id).eq("tipo", "saida").is("kit_movimento_id", null).gte("criado_em", desde).order("criado_em").order("id").range(de, ate));
  }, [petshop.id]);

  const produtos = useMemo(() => dados ?? [], [dados]);
  const baixos = produtos.filter(acabando);
  const semSaldo = produtos.filter(zerado);
  const alvo = semAcento(q);
  const codigoBuscado = op.codigoBarras ? limparCodigo(q) : null;
  const lista = produtos.filter((p) =>
    (filtro === "todos" || (filtro === "acabando" ? acabando(p) : zerado(p))) &&
    (!alvo || semAcento(p.nome).includes(alvo) || semAcento(p.categoria ?? "").includes(alvo)
      || (codigoBuscado != null && (p.codigo_barras ?? "").includes(codigoBuscado))));
  // custo e margem só para quem vê o custo (dono, financeiro ou "Ver custo e margem"; para os outros o banco nem entrega o custo)
  const loja: Loja = { ...op, lista: fornecedores, recarregarFornecedores, produtos, vejoCusto };
  const paraRepor = op.fornecedores ? produtos.filter((p) => p.fornecedor_id && pedeReposicao(p)).length : 0;

  // lista comprida aparece aos poucos (a busca e os filtros olham todos os produtos)
  const [mostrar, setMostrar] = useState(PASSO);
  useEffect(() => { setMostrar(PASSO); }, [q, filtro]);

  // validade: lotes vencidos e vencendo (quem cuida do estoque ou do financeiro)
  const vejoValidade = posso("estoque") || cuidoDoFinanceiro;
  const { dados: venc, carregando: carregandoVenc, recarregar: recarregarVenc } = useVencimentos(vejoValidade);
  const validade = resumoDaValidade(venc);
  const comValidade = produtos.some((p) => p.controla_validade) || (venc?.lotes.length ?? 0) > 0;

  const abrir = (a: Aberta) => { if (a.tipo !== "ficha" && a.tipo !== "fornecedores" && a.tipo !== "opcoes" && a.tipo !== "comprar" && a.tipo !== "vencendo" && somenteLeitura()) return; setAberta(a); };
  const fechar = () => setAberta(null);
  // atalho "Vender" da tela inicial (/gestao/app/estoque?vender=1): já abre a venda, uma vez só
  const temProdutos = produtos.length > 0;
  useEffect(() => {
    const busca = new URLSearchParams(window.location.search);
    // atalho do aviso de validade da tela Hoje (/gestao/app/estoque?ver=vencendo)
    if (busca.get("ver") === "vencendo") { window.history.replaceState(null, "", window.location.pathname); setAberta({ tipo: "vencendo" }); return; }
    if (!temProdutos || !busca.has("vender")) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (!somenteLeitura()) setAberta({ tipo: "venda" });
  }, [temProdutos, somenteLeitura]);
  const gravou = () => { fechar(); void recarregar(); void recarregarSaidas(); void recarregarVenc(); avisarMudanca(); };

  const categorias = new Set(produtos.map((p) => p.categoria?.trim()).filter(Boolean)).size;
  // kit fica de fora do valor: o saldo dele é o dos produtos do kit (não conta duas vezes)
  const comCusto = produtos.filter((p) => p.tipo !== "kit" && p.custo != null && Number(p.estoque) > 0);
  const valorParado = comCusto.reduce((t, p) => t + Number(p.estoque) * Number(p.custo), 0);
  const semCusto = produtos.filter((p) => p.tipo !== "kit" && p.custo == null && Number(p.estoque) > 0).length;
  // vendas = contas (uma venda com 3 produtos é uma venda); a quantidade soma as unidades que saíram
  const vendas = contarVendas(saidas ?? []);
  const unidades = (saidas ?? []).reduce((t, m) => t + Number(m.quantidade || 0), 0);

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Estoque</h1>
          <p className="g-muted">{produtos.length ? `${produtos.length} ${produtos.length === 1 ? "produto" : "produtos"} na prateleira` : "Ração, shampoo, petiscos e o que mais você vende ou usa."}</p>
        </div>
        <div className="g-acoes">
          {produtos.length > 0 && <button className="g-btn sec" onClick={() => abrir({ tipo: "venda" })}><ShoppingBag /> Vender</button>}
          {vejoFinanceiro && <button className="g-btn sec" onClick={() => setOrcamentos(true)}><FileText /> Orçamentos</button>}
          <button className="g-btn sec" onClick={() => setImportando(true)}><Upload /> Trazer de planilha</button>
          {produtos.length > 0 && posso("estoque") && <button className="g-btn sec" onClick={() => abrir({ tipo: "comprar" })}><ClipboardList /> O que comprar</button>}
          {produtos.length > 0 && posso("estoque") && <Link className="g-btn sec" href="/gestao/app/estoque/etiquetas"><Tag /> Etiquetas</Link>}
          {vejoValidade && comValidade && <button className="g-btn sec" onClick={() => abrir({ tipo: "vencendo" })}><CalendarX /> Vencendo</button>}
          {produtos.length > 0 && posso("estoque") && <Link className="g-btn sec" href="/gestao/app/estoque/contagem"><ClipboardCheck /> Contagem</Link>}
          {op.fornecedores && <button className="g-btn sec" onClick={() => abrir({ tipo: "fornecedores" })}><Truck /> Fornecedores</button>}
          {souDono && <button className="g-btn sec" onClick={() => abrir({ tipo: "opcoes" })}><SlidersHorizontal /> Opções</button>}
          <button className="g-btn pri" onClick={() => abrir({ tipo: "novo" })}><Plus /> Produto novo</button>
        </div>
      </header>
      {importando && <Importar tipo="produtos" aoFechar={() => setImportando(false)} aoTerminar={() => void recarregar()} />}

      {erro && <ErroTela erro={erro} aoTentar={() => void recarregar()} />}

      {produtos.length > 0 && (
        <div className="g-grade kpis g-est-kpis">
          <Kpi icone={Package} tom="rosa" rotulo="Produtos" valor={produtos.length}
            apoio={categorias ? `${categorias} ${categorias === 1 ? "categoria" : "categorias"}` : "na prateleira"} />
          <Kpi icone={AlertTriangle} tom="manteiga" rotulo="Acabando" valor={baixos.length}
            apoio={baixos.length ? "no mínimo ou abaixo" : "nada perto do mínimo"} />
          {vejoCusto ? (
            <Kpi icone={Wallet} tom="menta" rotulo="Valor em estoque" valor={brl(valorParado)}
              apoio={semCusto ? `a preço de custo · ${semCusto} sem custo` : "a preço de custo"} />
          ) : (
            <Kpi icone={PackageX} tom="lilas" rotulo="Zerados" valor={semSaldo.length} apoio={semSaldo.length ? "sem nada na prateleira" : "nenhum em falta"} />
          )}
          <Kpi icone={ArrowUpFromLine} tom="ceu" rotulo="Saídas em 30 dias" valor={saidas ? fmtQtd(unidades) : "–"}
            apoio={!saidas ? " " : !saidas.length ? "nada saiu ainda" : `${unidades === 1 ? "unidade" : "unidades"} · ${vendas ? `${vendas} ${vendas === 1 ? "venda" : "vendas"}` : "nenhuma venda"}`} />
        </div>
      )}

      {baixos.length > 0 && (
        <div className="g-aviso">
          <AlertTriangle />
          <span className="g-cresce">
            <b>{baixos.length === 1 ? "1 produto está acabando" : `${baixos.length} produtos estão acabando`}</b>
            {": "}{baixos.slice(0, 5).map((p) => p.nome).join(", ")}{baixos.length > 5 ? ` e mais ${baixos.length - 5}` : ""}
          </span>
          {filtro !== "acabando" && <button className="g-btn sec p" onClick={() => setFiltro("acabando")}>Ver</button>}
        </div>
      )}

      {validade.vencidos.length + validade.em30.length > 0 && (
        <div className={`g-aviso${validade.vencidos.length ? " vermelho" : ""}`} data-teste="aviso-validade">
          <CalendarX />
          <span className="g-cresce">
            <b>{[validade.vencidos.length ? (validade.vencidos.length === 1 ? "1 lote vencido" : `${validade.vencidos.length} lotes vencidos`) : "",
              validade.em30.length ? `${validade.em30.length === 1 ? "1 lote vence" : `${validade.em30.length} lotes vencem`} em até 30 dias` : ""].filter(Boolean).join(" e ")}</b>
            {": "}{[...new Set([...validade.vencidos, ...validade.em30].map((l) => l.nome))].slice(0, 4).join(", ")}
          </span>
          <button className="g-btn sec p" onClick={() => abrir({ tipo: "vencendo" })}>Ver</button>
        </div>
      )}

      {paraRepor > 0 && (
        <div className="g-aviso">
          <Truck />
          <span className="g-cresce">{paraRepor === 1 ? "1 produto para repor já tem fornecedor" : `${paraRepor} produtos para repor já têm fornecedor`}: o pedido sai pronto para o WhatsApp.</span>
          <button className="g-btn sec p" onClick={() => abrir({ tipo: "fornecedores" })}>Ver fornecedores</button>
        </div>
      )}

      {carregando && !dados ? <Esqueleto linhas={5} /> : !produtos.length ? (
        !erro && (
          <Vazio titulo="Nenhum produto ainda" texto="Cadastre o que você vende ou usa no banho. Se preferir, é só contar para o Mozart o que chegou.">
            <button className="g-btn sec" onClick={() => abrirAssistente("entrou 10 sacos de ração Golden a 140 cada")}><Sparkles /> Pedir ao Mozart</button>
          </Vazio>
        )
      ) : (
        <div className="g-pilha">
          <div className="g-busca">
            <Search />
            <input className="g-input" placeholder={op.codigoBarras ? "Buscar pelo nome ou passar o leitor" : "Buscar produto"} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar produto" />
          </div>
          {op.codigoBarras && <div><LerComCamera aoLer={setQ} /></div>}
          <div className="g-chips">
            {FILTROS.map((f) => {
              const n = f.id === "acabando" ? baixos.length : f.id === "zerados" ? semSaldo.length : 0;
              return <button key={f.id} className="g-chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.rotulo}{n ? ` (${n})` : ""}</button>;
            })}
            {op.margem && cuidoDoFinanceiro && <Link className="g-chip" href="/gestao/app/relatorios#produtos"><BarChart3 style={{ width: 15, height: 15 }} /> Vendas por produto</Link>}
          </div>

          {!lista.length ? (
            <p className="g-muted g-centro" style={{ padding: "28px 8px" }}>
              {alvo ? (op.codigoBarras ? "Nenhum produto com esse nome ou código." : "Nenhum produto com esse nome.") : filtro === "acabando" ? "Nada acabando por aqui." : "Nenhum produto zerado."}
            </p>
          ) : (
            <div className="g-est-grade">
              {lista.slice(0, mostrar).map((p) => {
                const n = nivel(p), min = Number(p.estoque_minimo);
                const mg = op.margem && vejoCusto ? margemDe(p.preco_venda, p.custo) : null;
                const kit = p.tipo === "kit", perto = validade.perto.get(p.id);
                return (
                  <div key={p.id} className={`g-card g-est-prod ${n.tom}`}>
                    <button type="button" className="g-est-cab" onClick={() => abrir({ tipo: "ficha", produto: p })} aria-label={`Abrir ${p.nome}`}>
                      <Tile icone={kit ? Boxes : zerado(p) ? PackageX : Package} tom={kit ? "lilas" : "rosa"} />
                      <span className="t">
                        <b>{p.nome}</b>
                        <span>{[kit ? "Kit" : null, p.categoria, p.preco_venda != null ? `vende a ${brl(p.preco_venda)}` : null].filter(Boolean).join(" · ") || "Sem categoria"}</span>
                      </span>
                      <span className="g-est-saldo">
                        <span className="g-num m">{fmtQtd(p.estoque)}</span>
                        {" "}<small>{p.unidade}</small>
                      </span>
                    </button>
                    <div className="g-est-nivel">
                      {n.parte != null ? (
                        <div className="g-est-barra" role="img" aria-label={min > 0 ? `${fmtQtd(p.estoque)} ${p.unidade}, mínimo ${fmtQtd(min)}` : `${fmtQtd(p.estoque)} ${p.unidade}`}>
                          {n.parte > 0 && <i style={{ width: `${Math.round(n.parte * 100)}%` }} />}
                          {min > 0 && <u aria-hidden />}
                        </div>
                      ) : <div className="g-est-barra sem" aria-hidden />}
                      <div className="g-est-leg">
                        {mg?.prejuizo && <span className="g-tag vermelho">vende abaixo do custo</span>}
                        {perto && <span className={`g-tag ${perto.dias < 0 ? "vermelho" : perto.dias <= 30 ? "laranja" : "amarelo"}`}>{quandoVence(perto.dias)}</span>}
                        {zerado(p) ? <span className="g-tag vermelho">zerado</span> : acabando(p) ? <span className="g-tag laranja">acabando</span> : n.tom === "perto" ? <span className="g-tag amarelo">perto do mínimo</span> : null}
                        <span className="g-muted g-pp g-tab">{kit ? "dá para montar" : min > 0 ? `mínimo ${fmtQtd(min)} ${p.unidade}` : "sem mínimo definido"}{mg && !mg.prejuizo && mg.pct != null ? ` · margem ${pct(mg.pct)}` : ""}</span>
                      </div>
                    </div>
                    <div className="g-est-pe">
                      {kit
                        ? <button className="g-btn sec p" onClick={() => abrir({ tipo: "ficha", produto: p })}><Boxes /> Produtos do kit</button>
                        : <button className="g-btn sec p" onClick={() => abrir({ tipo: "entrada", produto: p })}><Plus /> Entrada</button>}
                      <button className="g-btn sec p" onClick={() => abrir({ tipo: "saida", produto: p })} disabled={zerado(p)}><Minus /> Saída</button>
                    </div>
                  </div>
                );
              })}
              {lista.length > mostrar && (
                <button type="button" className="g-btn sec" style={{ gridColumn: "1 / -1", justifySelf: "center" }} onClick={() => setMostrar(mostrar + PASSO)}>
                  Mostrar mais ({lista.length - mostrar} {lista.length - mostrar === 1 ? "produto" : "produtos"})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {aberta?.tipo === "venda" && <VendaBalcao aoFechar={fechar} aoPronto={gravou} />}
      {orcamentos && <Orcamentos aoFechar={() => { setOrcamentos(false); void recarregar(); }} />}
      {aberta?.tipo === "novo" && <ProdutoNovo loja={loja} aoFechar={fechar} aoGravar={gravou} />}
      {aberta?.tipo === "entrada" && <Entrada produto={aberta.produto} loja={loja} aoFechar={fechar} aoGravar={gravou} />}
      {aberta?.tipo === "vencendo" && <Vencendo dados={venc} carregando={carregandoVenc} aoFechar={fechar} aoMudar={() => { void recarregar(); void recarregarVenc(); void recarregarSaidas(); avisarMudanca(); }} />}
      {aberta?.tipo === "comprar" && <OQueComprar produtos={produtos} fornecedores={fornecedores} comFornecedores={op.fornecedores} aoFechar={fechar} />}
      {aberta?.tipo === "fornecedores" && <Fornecedores produtos={produtos} fornecedores={fornecedores} aoFechar={fechar} aoMudar={recarregarFornecedores} />}
      {aberta?.tipo === "opcoes" && (
        <Folha titulo="Opções da loja" aoFechar={fechar} rodape={<button className="g-btn sec" onClick={fechar}>Voltar</button>}>
          <OpcoesDaLoja solto />
        </Folha>
      )}
      {aberta?.tipo === "saida" && <Saida produto={aberta.produto} aoFechar={fechar} aoGravar={gravou} />}
      {aberta?.tipo === "ficha" && (
        <Ficha produto={produtos.find((p) => p.id === aberta.produto.id) ?? aberta.produto} loja={loja} aoFechar={fechar}
          aoMudar={() => { void recarregar(); avisarMudanca(); }} aoGravar={gravou} />
      )}
    </>
  );
}

/** Quantas vendas há nas saídas: cada venda (lançamento) conta uma vez; saída de venda sem lançamento conta sozinha. */
function contarVendas(saidas: { motivo: string | null; lancamento_id?: string | null }[]) {
  const ligadas = new Set<string>();
  let soltas = 0;
  for (const m of saidas) {
    if (m.motivo !== "Venda") continue;
    if (m.lancamento_id) ligadas.add(m.lancamento_id); else soltas++;
  }
  return ligadas.size + soltas;
}

/* ---------- campos do produto (novo e ficha) ---------- */

type CamposProduto = { nome: string; categoria: string; unidade: string; preco: number | null; custo: number | null; minimo: string; caixa: string; codigo: string; fornecedorId: string | null; controla: boolean };

function CamposDoProduto({ v, mudar, categorias, loja, produto, precoFixo, aoGerarCodigo, gerandoCodigo, kit, custoDoKit }: {
  v: CamposProduto; mudar: (p: Partial<CamposProduto>) => void; categorias?: string[]; loja: Loja; /** Na ficha: o produto como está gravado. */ produto?: Produto;
  /** Kit: sem unidade, custo, caixa e fornecedor próprios (vêm dos produtos do kit). */
  kit?: boolean;
  /** Kit novo: o custo somado dos produtos escolhidos (a margem aparece antes de salvar). */
  custoDoKit?: number | null;
  /** Preço travado e a pessoa não é o dono nem cuida do financeiro: o preço de venda não muda por aqui. */
  precoFixo?: boolean;
  /** Na ficha, produto sem código: gera o código interno (Code 128) e guarda. */
  aoGerarCodigo?: () => void; gerandoCodigo?: boolean;
}) {
  const custoDoKitAgora = kit ? (custoDoKit !== undefined ? custoDoKit : produto?.custo ?? null) : null;
  const mg = loja.margem && loja.vejoCusto ? margemDe(v.preco, kit ? custoDoKitAgora : v.custo) : null;
  const repetido = loja.codigoBarras ? donoDoCodigo(loja.produtos, limparCodigo(v.codigo), produto?.id) : null;
  return (
    <>
      <Campo rotulo="Nome">
        <input className="g-input" value={v.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: Ração Golden 15 kg" maxLength={120} />
      </Campo>
      {loja.codigoBarras && (
        <Campo rotulo="Código de barras" dica={aoGerarCodigo ? "Opcional. Passe o leitor, digite os números da embalagem ou, sem código na embalagem, gere um código interno para a etiqueta." : "Opcional. Clique no campo e passe o leitor, ou digite os números da embalagem."} erro={repetido ? `Este código já está em ${repetido.nome}.` : null}>
          <div className="g-lj-codigo">
            <input className="g-input g-tab" inputMode="numeric" value={v.codigo} maxLength={64} onChange={(e) => mudar({ codigo: e.target.value })} placeholder="Ex.: 7891234567895"
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
            <LerComCamera aoLer={(codigo) => mudar({ codigo })} />
            {aoGerarCodigo && !v.codigo.trim() && !produto?.codigo_barras && (
              <button type="button" className="g-btn sec p" onClick={aoGerarCodigo} disabled={gerandoCodigo}><Barcode /> {gerandoCodigo ? "Gerando…" : "Gerar código interno"}</button>
            )}
          </div>
        </Campo>
      )}
      <div className="dupla">
        <Campo rotulo="Categoria">
          <input className="g-input" value={v.categoria} onChange={(e) => mudar({ categoria: e.target.value })} placeholder="Ex.: Ração" list="ge-categorias" />
        </Campo>
        {!kit && (
          <Campo rotulo="Unidade">
            <select className="g-select" value={v.unidade} onChange={(e) => mudar({ unidade: e.target.value })}>
              {(UNIDADES.includes(v.unidade) ? UNIDADES : [v.unidade, ...UNIDADES]).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </Campo>
        )}
      </div>
      {categorias && <datalist id="ge-categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>}
      <div className="dupla">
        <Campo rotulo="Preço de venda" dica={precoFixo ? "Com o preço travado, só o dono ou quem vê o financeiro muda o preço de venda." : produto ? "Mudar o preço fica anotado, com o seu nome, para o dono ver." : undefined}>
          <CampoDinheiro valor={v.preco} aoMudar={(n) => mudar({ preco: n })} desligado={precoFixo} />
        </Campo>
        {!loja.vejoCusto ? null : kit
          ? <Campo rotulo="Custo do kit" dica="A soma do custo dos produtos do kit."><input className="g-input g-tab" readOnly value={custoDoKitAgora != null ? brl(custoDoKitAgora) : "–"} aria-label="Custo do kit" /></Campo>
          : <Campo rotulo={loja.margem && produto ? "Custo médio" : "Custo"}><CampoDinheiro valor={v.custo} aoMudar={(n) => mudar({ custo: n })} /></Campo>}
      </div>
      {loja.margem && loja.vejoCusto && (
        <div className="g-lj-margem">
          <div><span className="g-rotulo">Margem</span><b className={mg?.prejuizo ? "g-lj-ruim" : undefined}>{mg ? brl(mg.reais) : "–"}</b></div>
          <div><span className="g-rotulo">Margem em %</span><b className={mg?.prejuizo ? "g-lj-ruim" : undefined}>{mg?.pct != null ? pct(mg.pct) : "–"}</b></div>
          {produto && <div><span className="g-rotulo">Último custo</span><b>{produto.ultimo_custo != null ? brl(produto.ultimo_custo) : "–"}</b></div>}
          {mg?.prejuizo ? (
            <p className="g-lj-alerta" role="alert"><AlertTriangle /><span>O preço de venda está abaixo do custo: {v.unidade === "un" ? "cada unidade vendida" : `cada ${v.unidade} vendido`} dá {brl(-mg.reais)} de prejuízo.</span></p>
          ) : (
            <p className="g-muted g-pp">{mg ? "Margem = preço de venda menos custo. A % é sobre o preço de venda." : kit ? "Preencha o preço de venda e escolha os produtos do kit (todos com custo) para ver a margem." : "Preencha o preço de venda e o custo para ver a margem."}{produto && !kit ? " O custo médio é recalculado a cada entrada com custo." : ""}</p>
          )}
        </div>
      )}
      {loja.fornecedores && !kit && (
        <Campo rotulo="Último fornecedor" dica="Muda sozinho quando você escolhe o fornecedor numa entrada.">
          <select className="g-select" value={v.fornecedorId ?? ""} onChange={(e) => mudar({ fornecedorId: e.target.value || null })}>
            <option value="">Nenhum</option>
            {loja.lista.filter((f) => f.ativo || f.id === v.fornecedorId).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Campo>
      )}
      <div className="dupla">
        <Campo rotulo="Estoque mínimo" dica="Abaixo disso, o produto aparece como acabando. Deixe 0 para não avisar.">
          <input className="g-input g-tab" inputMode="decimal" value={v.minimo} onChange={(e) => mudar({ minimo: e.target.value })} placeholder="0" />
        </Campo>
        {!kit && (
          <Campo rotulo="Vem em caixa de" dica={`Opcional. Quantos ${v.unidade} vêm na caixa do fornecedor: O que comprar sugere caixas inteiras.`}>
            <input className="g-input g-tab" inputMode="decimal" value={v.caixa} onChange={(e) => mudar({ caixa: e.target.value })} placeholder="Ex.: 12" aria-label="Vem em caixa de" />
          </Campo>
        )}
      </div>
      {!kit && (
        <label className="g-check">
          <input type="checkbox" checked={v.controla} onChange={(e) => mudar({ controla: e.target.checked })} />
          <span>Controlar validade <small className="g-muted">(cada entrada pede o lote e a validade; a venda tira primeiro o que vence antes)</small></span>
        </label>
      )}
    </>
  );
}

/** "Vem em caixa de": vazio = null; número maior que zero; undefined = digitado errado. */
function lerCaixa(s: string): number | null | undefined {
  if (!s.trim()) return null;
  const n = lerQtd(s);
  return n != null && n > 0 && n <= 100000 ? n : undefined;
}

/** Campos das opções ligadas, prontos para gravar no produto (opção desligada não toca na coluna). */
function camposDaLoja(loja: Loja, v: CamposProduto) {
  return {
    ...(loja.codigoBarras ? { codigo_barras: limparCodigo(v.codigo) } : {}),
    ...(loja.fornecedores ? { fornecedor_id: v.fornecedorId } : {}),
  };
}

function ProdutoNovo({ loja, aoFechar, aoGravar }: { loja: Loja; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, user } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [v, setV] = useState<CamposProduto>({ nome: "", categoria: "", unidade: "un", preco: null, custo: null, minimo: "", caixa: "", codigo: "", fornecedorId: null, controla: false });
  const [inicial, setInicial] = useState("");
  // estoque de hoje de um produto com validade: o lote e a validade do que já está na prateleira
  const [loteInicial, setLoteInicial] = useState("");
  const [validadeInicial, setValidadeInicial] = useState("");
  const [tipo, setTipo] = useState<"produto" | "kit">("produto");
  const [itensKit, setItensKit] = useState<ItemDoKit[]>([]);
  const kit = tipo === "kit";
  const [salvando, setSalvando] = useState(false);
  // kit novo: o custo somado dos produtos escolhidos, para a margem aparecer antes de salvar (a mesma conta do banco)
  const itensLidos = kit ? lerItensDoKit(itensKit) : [];
  const custoDoKitNovo = kit && typeof itensLidos !== "string" && itensLidos.length ? contaDoKit(itensLidos, loja.produtos).custo : null;

  const op = useOperacao();
  const criado = useRef<{ chave: string; id: string } | null>(null);
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    const nome = v.nome.trim();
    if (!nome) { avisarErro("Escreva o nome do produto."); return; }
    const minimo = v.minimo.trim() ? lerQtd(v.minimo) : 0;
    const qtd = inicial.trim() ? lerQtd(inicial) : 0;
    const caixa = lerCaixa(v.caixa);
    if (minimo == null || qtd == null || caixa === undefined) { avisarErro("Confira as quantidades: use só números."); return; }
    const comLoteInicial = !kit && v.controla && qtd > 0;
    if (comLoteInicial && !loteInicial.trim() && !validadeInicial) { avisarErro("Diga o lote ou a validade do que já está na prateleira (ou deixe Quanto tem hoje em branco)."); return; }
    if (comLoteInicial && validadeInicial && !/^(20\d\d|2100)-\d\d-\d\d$/.test(validadeInicial)) { avisarErro("Confira a validade."); return; }
    const repetido = loja.codigoBarras ? donoDoCodigo(loja.produtos, limparCodigo(v.codigo)) : null;
    if (repetido) { avisarErro(`Este código de barras já está em ${repetido.nome}. Cada produto tem o seu.`); return; }
    const itens = kit ? lerItensDoKit(itensKit) : [];
    if (typeof itens === "string") { avisarErro(itens); return; }
    setSalvando(true);
    try {
      // o produto já foi criado nesta operação e só o estoque inicial (ou a lista do kit) falhou: a nova tentativa não cria outro
      const novo = criado.current?.chave === chave ? { id: criado.current.id } : ok(await sb.from("produtos").insert({
        petshop_id: petshop.id, nome, categoria: v.categoria.trim() || null, unidade: kit ? "un" : v.unidade,
        preco_venda: v.preco, custo: kit ? null : v.custo, estoque_minimo: minimo, embalagem_qtd: kit ? null : caixa,
        ...camposDaLoja(loja, kit ? { ...v, fornecedorId: null } : v), tipo, controla_validade: !kit && v.controla,
      }).select("id").single());
      criado.current = { chave, id: novo.id };
      if (kit) {
        ok(await sb.rpc("kit_definir_itens", { p_kit: novo.id, p_itens: itens }));
        avisar(`${nome} está no estoque.`);
        aoGravar();
        return;
      }
      if (qtd > 0) {
        await gravarMovimentos(sb, petshop.id, [{
          petshop_id: petshop.id, produto_id: novo.id, tipo: "entrada", quantidade: qtd, custo_unitario: v.custo,
          motivo: "Estoque inicial", criado_por: user.id, ...(loja.fornecedores && v.fornecedorId ? { fornecedor_id: v.fornecedorId } : {}),
          ...(v.controla && (loteInicial.trim() || validadeInicial) ? { lote: loteInicial.trim().slice(0, 60) || null, validade: validadeInicial || null } : {}),
          chave: parteDaChave(chave, "inicial"),
        }]);
      }
      avisar(`${nome} está no estoque.`);
      aoGravar();
    } catch (e) { avisarErro(erroDeCodigo(e)); return false; } finally { setSalvando(false); }
  }

  return (
    <Folha titulo="Produto novo" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar produto"}</button>
      </>}>
      <div className="g-form">
        <div className="g-campo">
          <span>Tipo</span>
          <div className="g-chips" role="group" aria-label="Tipo do produto">
            <button type="button" className="g-chip" aria-pressed={!kit} onClick={() => setTipo("produto")}>Produto</button>
            <button type="button" className="g-chip" aria-pressed={kit} onClick={() => setTipo("kit")}><Boxes style={{ width: 15, height: 15 }} /> Kit ou combo</button>
          </div>
          {kit && <small className="g-muted">Um kit junta outros produtos (ex.: shampoo + condicionador). Vender o kit tira cada produto do estoque.</small>}
        </div>
        <CamposDoProduto v={v} mudar={(p) => setV((a) => ({ ...a, ...p }))} loja={loja} kit={kit} custoDoKit={kit ? custoDoKitNovo : undefined} />
        {kit ? (
          <ProdutosDoKit itens={itensKit} mudar={setItensKit} produtos={loja.produtos} vejoCusto={loja.vejoCusto} />
        ) : (
          <>
            <Campo rotulo={`Quanto tem hoje (${v.unidade})`} dica="O que já está na prateleira. Pode deixar em branco.">
              <input className="g-input g-tab" inputMode="decimal" value={inicial} onChange={(e) => setInicial(e.target.value)} placeholder="0" aria-label={`Quanto tem hoje (${v.unidade})`} />
            </Campo>
            {v.controla && (lerQtd(inicial) ?? 0) > 0 && (
              <div className="dupla" data-teste="lote-inicial">
                <Campo rotulo="Lote do que já tem" dica="O código do lote na embalagem.">
                  <input className="g-input" value={loteInicial} maxLength={60} onChange={(e) => setLoteInicial(e.target.value)} placeholder="Ex.: L2311A" aria-label="Lote do que já tem" />
                </Campo>
                <Campo rotulo="Validade do que já tem" dica="Com a validade, o produto entra no Vencendo e a venda tira primeiro o que vence antes.">
                  <input className="g-input g-tab" type="date" value={validadeInicial} min="2000-01-01" max="2100-12-31" onChange={(e) => setValidadeInicial(e.target.value)} aria-label="Validade do que já tem" />
                </Campo>
              </div>
            )}
          </>
        )}
      </div>
    </Folha>
  );
}

/* ---------- entrada ---------- */

/** Custo médio depois de uma entrada: a mesma conta que o banco faz (arredonda em centavos). */
function custoMedioDepois(produto: Pick<Produto, "estoque" | "custo">, qtd: number, custo: number) {
  const saldo = Number(produto.estoque);
  if (produto.custo == null || saldo <= 0 || saldo + qtd <= 0) return custo;
  return centavos((saldo * Number(produto.custo) + qtd * custo) / (saldo + qtd));
}

function Entrada({ produto, loja, aoFechar, aoGravar }: { produto: Produto; loja: Loja; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, vejoFinanceiro, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [qtd, setQtd] = useState("");
  // com a margem ligada, `custo` do produto é a média: o campo começa no que foi pago da última vez (só para quem vê o custo)
  const [custo, setCusto] = useState<number | null>(!loja.vejoCusto ? null : loja.margem ? produto.ultimo_custo ?? produto.custo : produto.custo);
  const [fornecedorId, setFornecedorId] = useState<string | null>(loja.fornecedores && loja.lista.some((f) => f.id === produto.fornecedor_id && f.ativo) ? produto.fornecedor_id : null);
  // "Lançar a compra como despesa" começa sempre desmarcado: a pessoa marca quando quer (e diz como pagou)
  const [despesa, setDespesa] = useState(false);
  const [etiquetas, setEtiquetas] = useState(false);
  // validade e lote: só com "Controlar validade" no produto (os dois opcionais)
  const [loteTxt, setLoteTxt] = useState("");
  const [validade, setValidade] = useState("");
  const router = useRouter();
  // despesa é uma forma só, e nada vem marcado: a pessoa diz como pagou o fornecedor (ou, quem cuida do financeiro, "Vou pagar depois")
  const [forma, setForma] = useState<Forma | "depois" | null>(null);
  const [vencimento, setVencimento] = useState(() => isoDia(new Date(Date.now() + 7 * 864e5)));
  const [erroForma, setErroForma] = useState<string | null>(null);
  const caixa = useCaixaAberto();
  const [salvando, setSalvando] = useState(false);

  const n = lerQtd(qtd);
  const total = n && custo ? centavos(n * custo) : 0;
  const lanca = vejoFinanceiro && despesa;
  const depois = forma === "depois";

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (!n) { avisarErro("Diga quantas unidades entraram."); return; }
    const custoRuim = erroDeValor(custo, "O custo") ?? (lanca ? erroDeValor(total, "O total da compra") : null);
    if (custoRuim) { avisarErro(custoRuim); return; }
    if (lanca && !(total > 0)) { avisarErro("Para lançar a compra como despesa, preencha o custo por unidade."); return; }
    if (lanca && !forma) { setErroForma("Escolha como você pagou a compra."); avisarErro("Escolha como você pagou a compra."); return; }
    if (lanca && depois && !/^(20\d\d|2100)-\d\d-\d\d$/.test(vencimento)) { setErroForma("Escolha o dia de pagar."); avisarErro("Escolha o dia de pagar a compra."); return; }
    if (validade && !/^(20\d\d|2100)-\d\d-\d\d$/.test(validade)) { avisarErro("Confira a validade."); return; }
    if (lanca && !(await conferirValorAlto(total, confirmar))) return;
    if (lanca && !depois && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    setSalvando(true);
    try {
      const nomeFornecedor = loja.fornecedores && fornecedorId ? loja.lista.find((f) => f.id === fornecedorId)?.nome ?? "fornecedor" : null;
      // a entrada e a despesa numa gravação só: as duas entram, ou nenhuma (tocar de novo não repete)
      const r = await sb.rpc("estoque_entrada", {
        p_petshop: petshop.id, p_chave: chave,
        p_movimento: {
          produto_id: produto.id, quantidade: n, custo_unitario: custo || null, motivo: "Compra",
          ...(loja.fornecedores && fornecedorId ? { fornecedor_id: fornecedorId } : {}),
          ...(produto.controla_validade && (loteTxt.trim() || validade) ? { lote: loteTxt.trim().slice(0, 60) || null, validade: validade || null } : {}),
        },
        ...(lanca && forma ? { p_despesa: {
          valor: total, categoria: "Produtos e material", descricao: `Compra: ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}${nomeFornecedor ? ` (${nomeFornecedor})` : ""}`,
          ...(depois ? { pago: false, vencimento } : { pago: true, forma }),
        } } : {}),
      });
      if (r.error) {
        avisarErro(`Nada foi anotado: nem a entrada no estoque${lanca ? " nem a despesa" : ""}. Toque de novo para tentar. (${r.error.message})`);
        return false;
      }
      if (lanca) avisar(depois ? `Entrada anotada e ${brl(total)} em Contas a pagar, para ${dataCompleta(vencimento)}.` : `Entrada anotada e ${brl(total)} lançados como despesa.`);
      else avisar(`Entraram ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}.`);
      aoGravar();
      // etiquetas do que entrou: uma por unidade (kg, litro e afins: uma só), na folha de etiquetas
      if (etiquetas) router.push(`/gestao/app/estoque/etiquetas?p=${produto.id}:${["un", "pacote", "saco"].includes(produto.unidade) ? Math.max(1, Math.min(500, Math.ceil(n))) : 1}`);
    } catch (e) { avisarErro(e); return false; } finally { setSalvando(false); }
  }

  return (
    <Folha titulo={`Entrada de ${produto.nome}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Anotar entrada"}</button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">Hoje tem {fmtQtd(produto.estoque)} {produto.unidade}.</p>
        <div className="dupla">
          <Campo rotulo={`Quantidade (${produto.unidade})`}>
            <input className="g-input g-tab" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" autoFocus aria-label={`Quantidade (${produto.unidade})`} />
          </Campo>
          <Campo rotulo={`Custo por ${produto.unidade}`} dica={lanca ? "O que você pagou por unidade." : "Opcional"} erro={erroDeValor(custo, "O custo")}><CampoDinheiro valor={custo} aoMudar={setCusto} /></Campo>
        </div>
        {produto.controla_validade && (
          <div className="dupla">
            <Campo rotulo="Lote" dica="Opcional. O código do lote na embalagem.">
              <input className="g-input" value={loteTxt} maxLength={60} onChange={(e) => setLoteTxt(e.target.value)} placeholder="Ex.: L2311A" />
            </Campo>
            <Campo rotulo="Validade" dica="Opcional. A venda tira primeiro o que vence antes.">
              <input className="g-input g-tab" type="date" value={validade} min="2000-01-01" max="2100-12-31" onChange={(e) => setValidade(e.target.value)} aria-label="Validade" />
            </Campo>
          </div>
        )}
        {loja.margem && loja.vejoCusto && (
          <p className="g-muted g-pp" role="status">
            {n && custo
              ? produto.custo != null && Number(produto.estoque) > 0
                ? `Custo médio: de ${brl(produto.custo)} para ${brl(custoMedioDepois(produto, n, custo))} (média do que já tem com o que está entrando).`
                : `Custo médio passa a ser ${brl(custo)}.`
              : "Com o custo preenchido, o custo médio do produto é recalculado nesta entrada."}
          </p>
        )}
        <label className="g-check">
          <input type="checkbox" checked={etiquetas} onChange={(e) => setEtiquetas(e.target.checked)} />
          <span>Imprimir etiquetas do que entrou</span>
        </label>
        {loja.fornecedores && <EscolherFornecedor valor={fornecedorId} aoMudar={setFornecedorId} fornecedores={loja.lista} aoCriar={loja.recarregarFornecedores} />}
        {vejoFinanceiro && (
          <>
            <label className="g-check">
              <input type="checkbox" checked={despesa} onChange={(e) => { setDespesa(e.target.checked); setErroForma(null); }} />
              <span>Lançar a compra como despesa{total > 0 ? ` (${brl(total)})` : ""}</span>
            </label>
            {lanca && (
              <>
                {!(total > 0) && <p className="g-muted g-pp" role="status">Preencha a quantidade e o custo por unidade: a despesa é o total da compra.</p>}
                <div className="g-campo">
                  <span>Como você pagou a compra?</span>
                  <div className="g-chips" role="group" aria-label="Como você pagou a compra">
                    {FORMAS.map((f) => (
                      <button key={f.id} type="button" className="g-chip" aria-pressed={forma === f.id} onClick={() => { setForma(f.id); setErroForma(null); }}>{f.rotulo}</button>
                    ))}
                    {cuidoDoFinanceiro && <button type="button" className="g-chip" aria-pressed={depois} onClick={() => { setForma("depois"); setErroForma(null); }}>Vou pagar depois</button>}
                  </div>
                  {erroForma && <small className="erro" role="alert">{erroForma}</small>}
                </div>
                {depois && (
                  <Campo rotulo="Pagar até" dica="A compra fica em Financeiro, Contas a pagar, até você dar baixa.">
                    <input className="g-input g-tab" type="date" value={vencimento} min="2000-01-01" max="2100-12-31" onChange={(e) => { setVencimento(e.target.value); setErroForma(null); }} aria-label="Pagar até" />
                  </Campo>
                )}
                {!depois && <AvisoCaixaFechado aberto={caixa} />}
              </>
            )}
          </>
        )}
      </div>
    </Folha>
  );
}

/* ---------- saída ---------- */

function Saida({ produto, aoFechar, aoGravar }: { produto: Produto; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, user, vejoFinanceiro, cuidoDoFinanceiro, souDono } = useGestao();
  // preço travado: quem só opera o caixa vende pelo preço da lista; quem não recebe não vende por aqui
  const travado = travaDePreco(petshop).ligada && !cuidoDoFinanceiro;
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [qtd, setQtd] = useState("1");
  // nada vem marcado: a pessoa diz por que saiu (venda, uso no banho ou perda)
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [valorEditado, setValorEditado] = useState<number | null | undefined>(undefined);
  // mesmo recebimento da venda no balcão: uma forma ou dividido em até três
  const [pagamento, setPagamento] = usePagamento();
  const anotarParcelas = useAnotarParcelas();
  const [erroForma, setErroForma] = useState<string | null>(null);
  const [erroMotivo, setErroMotivo] = useState(false);
  const caixa = useCaixaAberto();
  const [salvando, setSalvando] = useState(false);
  // lotes com saldo: a saída tira do que vence antes, ou do lote escolhido
  const { dados: lotes } = useLotesDoProduto(produto.id, produto.tipo !== "kit");
  const [loteId, setLoteId] = useState("");

  const n = lerQtd(qtd);
  const saldo = Number(produto.estoque);
  const calculado = n && produto.preco_venda != null ? centavos(n * Number(produto.preco_venda)) : null;
  const valor = travado ? calculado : valorEditado === undefined ? calculado : valorEditado;
  const venda = motivo === "Venda";
  // com a trava, venda sem o dinheiro entrar junto não sai (o banco também recusa)
  const vendaSemDinheiro = venda && !vejoFinanceiro && travaDePreco(petshop).ligada;
  const passou = n != null && n > saldo;

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (!n) { avisarErro("Diga quantas unidades saíram."); return; }
    if (passou) { avisarErro(`Só tem ${fmtQtd(saldo)} ${produto.unidade}. Se o saldo estiver errado, corrija na ficha do produto.`); return; }
    if (!motivo) { setErroMotivo(true); avisarErro("Escolha o motivo da saída."); return; }
    if (vendaSemDinheiro) { avisarErro("Com o preço travado, a venda de um produto é com quem cuida do caixa, pelo Vender."); return; }
    if (venda && vejoFinanceiro && !valor) { avisarErro("Diga o valor da venda."); return; }
    const valorRuim = venda && vejoFinanceiro ? erroDeValor(valor, "O valor da venda") : null;
    if (valorRuim) { avisarErro(valorRuim); return; }
    const pg = venda && vejoFinanceiro && valor ? fecharPagamento(pagamento, valor) : null;
    if (pg && "erro" in pg) { setErroForma(pagamento.dividido ? pg.erro : "Escolha como o cliente pagou."); avisarErro(pg.erro); return; }
    if (pg && !(await conferirValorAlto(valor, confirmar))) return;
    if (pg && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    setSalvando(true);
    try {
      if (pg && !("erro" in pg) && valor) {
        // primeiro o dinheiro, depois o estoque: se a venda for recusada (preço, caixa), nada sai do estoque
        lembrarForma(pg.forma);
        const lancado = await lancarPago(sb, petshop.id, {
          tipo: "entrada", valor, forma: pg.forma, pagamentos: pg.pagamentos, categoria: "Venda de produtos",
          descricao: `Venda: ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}`,
          // com os itens, apagar esta venda depois devolve o produto ao estoque
          itens: [{ tipo: "produto", nome: produto.nome, qtd: n, valor: Math.round((valor / n) * 100) / 100, produto_id: produto.id }],
          chave,
        });
        // crédito parcelado: em quantas vezes (tenta de novo e avisa se não der; a venda já entrou)
        await anotarParcelas([lancado?.id], pagamento.parcelas);
        try {
          // a saída já nasce ligada à venda: é assim que o relatório de produtos acha o custo desta venda
          await gravarMovimentos(sb, petshop.id, [{
            petshop_id: petshop.id, produto_id: produto.id, tipo: "saida", quantidade: n, motivo, criado_por: user.id, chave: parteDaChave(chave, "saida"),
            ...(lancado?.id ? { lancamento_id: lancado.id } : {}), ...(loteId ? { lote_id: loteId } : {}),
          }]);
          avisar(`Venda de ${brl(valor)} anotada.`);
        } catch (e) {
          avisarErro(`A venda de ${brl(valor)} entrou, mas o estoque não baixou. Toque de novo em Anotar venda (não lança duas vezes) ou corrija o saldo na ficha. (${e instanceof Error ? e.message : "erro"})`);
          return false;
        }
      } else {
        await gravarMovimentos(sb, petshop.id, [{
          petshop_id: petshop.id, produto_id: produto.id, tipo: "saida", quantidade: n, motivo, criado_por: user.id, chave: parteDaChave(chave, "saida"),
          ...(loteId ? { lote_id: loteId } : {}),
        }]);
        avisar(`Saíram ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}.`);
      }
      aoGravar();
    } catch (e) { avisarErro(e); return false; } finally { setSalvando(false); }
  }

  return (
    <Folha titulo={`Saída de ${produto.nome}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando || vendaSemDinheiro}>{salvando ? "Salvando…" : venda ? "Anotar venda" : "Anotar saída"}</button>
      </>}>
      <div className="g-form">
        <Campo rotulo={`Quantidade (${produto.unidade})`} erro={passou ? `Só tem ${fmtQtd(saldo)} ${produto.unidade}.` : null} dica={`Tem ${fmtQtd(saldo)} ${produto.unidade}.`}>
          <input className="g-input g-tab" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" autoFocus />
        </Campo>
        <div className="g-campo">
          <span>Motivo</span>
          <div className="g-chips" role="group" aria-label="Motivo da saída">
            {MOTIVOS.map((o) => (
              <button key={o.id} type="button" className="g-chip" aria-pressed={motivo === o.id} onClick={() => { setMotivo(o.id); setErroMotivo(false); }}>{o.rotulo}</button>
            ))}
          </div>
          {erroMotivo && <small className="erro" role="alert">Escolha o motivo da saída.</small>}
        </div>
        {(lotes?.length ?? 0) > 0 && (
          <Campo rotulo="De qual lote?" dica="Sem escolher, sai primeiro o que vence antes.">
            <select className="g-select" value={loteId} onChange={(e) => setLoteId(e.target.value)} aria-label="De qual lote">
              <option value="">O que vence antes (automático)</option>
              {lotes!.map((l) => <option key={l.id} value={l.id}>{nomeDoLote(l)} · tem {fmtQtd(l.quantidade)} {produto.unidade}</option>)}
            </select>
          </Campo>
        )}
        {produto.tipo === "kit" && <p className="g-muted g-pp">Kit: cada produto do kit sai do estoque.</p>}
        {venda && (vejoFinanceiro ? (
          <>
            <Campo rotulo="Valor da venda" erro={erroDeValor(valor, "O valor da venda")}
              dica={travado ? `Preço da lista: ${produto.preco_venda != null ? `${brl(produto.preco_venda)} por ${produto.unidade}` : "sem preço"}. Com o preço travado, outro valor só com o dono ou com quem vê o financeiro.`
                : produto.preco_venda != null ? `${brl(produto.preco_venda)} por ${produto.unidade}. Vender por outro valor fica anotado.` : "Este produto ainda não tem preço de venda."}>
              <CampoDinheiro valor={valor} aoMudar={(v) => { setValorEditado(v); setErroForma(null); }} desligado={travado} />
            </Campo>
            <ParcelasNaTela.Provider value>
              <EscolhaPagamento valor={pagamento} aoMudar={(e) => { setPagamento(e); setErroForma(null); }} total={valor ?? 0} erro={erroForma} />
            </ParcelasNaTela.Provider>
            <AvisoCaixaFechado aberto={caixa} />
          </>
        ) : (
          vendaSemDinheiro
            ? <p className="g-aviso" style={{ margin: 0 }} role="status"><span>Com o preço travado, a venda de um produto é com quem cuida do caixa, pelo Vender: assim o dinheiro entra junto com a saída do estoque.</span></p>
            : <p className="g-muted g-p">A venda sai do estoque. O dinheiro fica para quem cuida do financeiro lançar. A saída fica anotada para o dono ver, com o seu nome.</p>
        ))}
        {motivo && motivo !== "Venda" && motivo !== "Uso no banho" && !souDono && <p className="g-muted g-pp">A saída fica anotada com o seu nome, e o dono vê em Alterações em valores.</p>}
      </div>
    </Folha>
  );
}

/* ---------- ficha ---------- */

const TIPO_MOV: Record<string, string> = { entrada: "Entrada", saida: "Saída", ajuste: "Saldo corrigido" };

function Ficha({ produto, loja, aoFechar, aoMudar, aoGravar }: { produto: Produto; loja: Loja; aoFechar: () => void; aoMudar: () => void; aoGravar: () => void }) {
  const { sb, petshop, user, equipe, cuidoDoFinanceiro, posso } = useGestao();
  const precoFixo = travaDePreco(petshop).ligada && !cuidoDoFinanceiro;
  // quem deu cada saída ou corrigiu o saldo (nome de quem está na equipe)
  const nomeDe = (id: string | null | undefined) => (id ? equipe.find((x) => x.user_id === id)?.nome?.split(" ")[0] ?? null : null);
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [v, setV] = useState<CamposProduto>({
    nome: produto.nome, categoria: produto.categoria ?? "", unidade: produto.unidade, preco: produto.preco_venda, custo: produto.custo,
    minimo: Number(produto.estoque_minimo) ? fmtQtd(produto.estoque_minimo) : "", caixa: produto.embalagem_qtd ? fmtQtd(produto.embalagem_qtd) : "",
    codigo: produto.codigo_barras ?? "", fornecedorId: produto.fornecedor_id, controla: Boolean(produto.controla_validade),
  });
  const kit = produto.tipo === "kit";
  // kit: a lista de produtos (só grava quando muda); produto com validade: os lotes
  const { dados: itensGravados } = useItensDoKit(kit ? produto.id : null);
  const [itensKit, setItensKit] = useState<ItemDoKit[] | null>(null);
  useEffect(() => { if (itensGravados && itensKit === null) setItensKit(itensGravados.map((i) => ({ componente_id: i.componente_id, qtd: fmtQtd(i.quantidade) }))); }, [itensGravados, itensKit]);
  const mudouKit = kit && itensKit != null && itensGravados != null
    && JSON.stringify(itensKit.map((i) => [i.componente_id, lerQtd(i.qtd)])) !== JSON.stringify(itensGravados.map((i) => [i.componente_id, i.quantidade]));
  const { dados: lotes } = useLotesDoProduto(produto.id, !kit && (Boolean(produto.controla_validade) || v.controla));
  const [gerandoCodigo, setGerandoCodigo] = useState(false);
  async function gerarCodigo() {
    if (somenteLeitura()) return;
    setGerandoCodigo(true);
    try {
      const r = ok(await sb.rpc("produtos_gerar_codigos", { p_petshop: petshop.id, p_produtos: [produto.id] }));
      const codigo = r[0]?.codigo_barras ?? null;
      if (codigo) { setV((a) => ({ ...a, codigo })); avisar(`Código interno ${codigo} guardado. Ele sai na etiqueta e o leitor acha o produto na venda.`); }
      aoMudar();
    } catch (e) { avisarErro(e); } finally { setGerandoCodigo(false); }
  }
  const [contado, setContado] = useState<string | null>(null);
  const [razao, setRazao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const { dados: movs, carregando, erro, recarregar } = useDados(async () =>
    (await comCustosDeMovimento(sb, produto.id, ok(await sb.from("movimentos_estoque").select(COLS_MOVIMENTO).eq("petshop_id", petshop.id).eq("produto_id", produto.id)
      .order("criado_em", { ascending: false }).limit(20)) as unknown as { id: string }[])) as unknown as MovimentoEstoque[],
  [petshop.id, produto.id]);

  async function salvar() {
    if (somenteLeitura()) return;
    const nome = v.nome.trim();
    if (!nome) { avisarErro("Escreva o nome do produto."); return; }
    const minimo = v.minimo.trim() ? lerQtd(v.minimo) : 0;
    if (minimo == null) { avisarErro("Confira o estoque mínimo: use só números."); return; }
    const caixa = lerCaixa(v.caixa);
    if (caixa === undefined) { avisarErro("Confira o Vem em caixa de: use só números, maior que zero."); return; }
    const repetido = loja.codigoBarras ? donoDoCodigo(loja.produtos, limparCodigo(v.codigo), produto.id) : null;
    if (repetido) { avisarErro(`Este código de barras já está em ${repetido.nome}. Cada produto tem o seu.`); return; }
    const itens = mudouKit && itensKit ? lerItensDoKit(itensKit) : null;
    if (typeof itens === "string") { avisarErro(itens); return; }
    setSalvando(true);
    try {
      if (itens) ok(await sb.rpc("kit_definir_itens", { p_kit: produto.id, p_itens: itens }));
      // o preço só vai quando mudou: mudar o preço fica anotado (e, com a trava, só o dono ou quem vê o financeiro muda)
      const mudouPreco = (v.preco ?? null) !== (produto.preco_venda == null ? null : Number(produto.preco_venda));
      ok(await sb.from("produtos").update({
        nome, categoria: v.categoria.trim() || null, ...(mudouPreco && !precoFixo ? { preco_venda: v.preco } : {}), estoque_minimo: minimo,
        // kit: unidade, custo, caixa e fornecedor vêm dos produtos do kit
        // quem não vê o custo recebe o custo vazio: não regrava (senão apagaria o custo do produto)
        ...(kit ? {} : { unidade: v.unidade, ...(loja.vejoCusto ? { custo: v.custo } : {}), embalagem_qtd: caixa, controla_validade: v.controla, ...camposDaLoja(loja, v) }),
        ...(kit && loja.codigoBarras ? { codigo_barras: limparCodigo(v.codigo) } : {}),
      }).eq("id", produto.id).eq("petshop_id", petshop.id).select("id").single());
      avisar("Produto atualizado.");
      aoGravar();
    } catch (e) { avisarErro(erroDeCodigo(e)); } finally { setSalvando(false); }
  }

  const op = useOperacao();
  const corrigir = () => op.fazer(gravarContagem);
  async function gravarContagem(chave: string): Promise<boolean | void> {
    const n = lerQtd(contado ?? "");
    if (n == null) { avisarErro("Diga quanto você contou."); return; }
    setSalvando(true);
    try {
      await gravarMovimentos(sb, petshop.id, [{
        petshop_id: petshop.id, produto_id: produto.id, tipo: "ajuste", quantidade: n, motivo: razao.trim().slice(0, 120) || "Contagem", criado_por: user.id,
        chave: parteDaChave(chave, "ajuste"),
      }]);
      avisar(`Saldo corrigido para ${fmtQtd(n)} ${produto.unidade}.`);
      setContado(null);
      setRazao("");
      void recarregar();
      aoMudar();
    } catch (e) { avisarErro(e); return false; } finally { setSalvando(false); }
  }

  async function desativar() {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: `Tirar ${produto.nome} do estoque?`, texto: "O produto some da lista. O histórico dele fica guardado.", confirmar: "Tirar da lista", perigo: true }))) return;
    try {
      ok(await sb.from("produtos").update({ ativo: false }).eq("id", produto.id).eq("petshop_id", petshop.id).select("id").single());
      avisar(`${produto.nome} saiu da lista.`);
      aoGravar();
    } catch (e) { avisarErro(e); }
  }

  return (
    <Folha larga titulo={produto.nome} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-pilha g">
        <div className={`g-card g-est-ficha ${nivel(produto).tom}`}>
          <div className="g-fila entre">
            <div>
              <span className="g-rotulo">{kit ? "Dá para montar" : "Saldo"}</span>
              <div><span className="g-num">{fmtQtd(produto.estoque)}</span> <span className="g-muted">{kit ? (Number(produto.estoque) === 1 ? "kit" : "kits") : produto.unidade}</span></div>
            </div>
            {contado === null && !kit && <button className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setContado(""); }}>Corrigir saldo</button>}
          </div>
          {contado !== null && (
            <div className="g-form" style={{ marginTop: 14 }}>
              <Campo rotulo={`Quanto você contou (${produto.unidade})`} dica="O saldo passa a ser este número. Saldo corrigido para menos fica anotado, com o seu nome, para o dono ver.">
                <input className="g-input g-tab" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="0" autoFocus />
              </Campo>
              <Campo rotulo="Motivo (se quiser)" dica="Fica anotado no histórico do produto.">
                <input className="g-input" value={razao} maxLength={120} onChange={(e) => setRazao(e.target.value)} placeholder="Ex.: contagem do mês, embalagem rasgada" />
              </Campo>
              <div className="g-fila">
                <button className="g-btn verde p" onClick={corrigir} disabled={salvando}>Corrigir</button>
                <button className="g-btn fantasma p" onClick={() => setContado(null)}>Deixar como está</button>
              </div>
            </div>
          )}
        </div>

        <div className="g-form">
          <CamposDoProduto v={v} mudar={(p) => setV((a) => ({ ...a, ...p }))} loja={loja} produto={produto} precoFixo={precoFixo} kit={kit}
            aoGerarCodigo={loja.codigoBarras && posso("estoque") ? () => void gerarCodigo() : undefined} gerandoCodigo={gerandoCodigo} />
          {kit && (itensKit == null ? <Esqueleto linhas={2} /> : (
            <ProdutosDoKit itens={itensKit} mudar={setItensKit} produtos={loja.produtos} vejoCusto={loja.vejoCusto} kitId={produto.id} />
          ))}
        </div>
        {!kit && (Boolean(produto.controla_validade) || (lotes?.length ?? 0) > 0) && (
          <section>
            <h3 style={{ marginBottom: 6 }}>Lotes e validade</h3>
            <LotesDoProduto produto={produto} lotes={lotes ?? []} />
          </section>
        )}
        {posso("estoque") && (
          <div><Link className="g-btn sec p" href={`/gestao/app/estoque/etiquetas?p=${produto.id}:1`}><Tag /> Imprimir etiquetas</Link></div>
        )}

        <section>
          <h3 style={{ marginBottom: 6 }}>Últimos movimentos</h3>
          {erro ? <p className="g-erro">{erro}</p> : carregando && !movs ? <Esqueleto linhas={2} /> : !movs?.length ? (
            <p className="g-muted g-p">Nada entrou nem saiu ainda.</p>
          ) : (
            <div>
              {movs.map((m) => (
                <div key={m.id} className="ge-mov">
                  <time>{dataCurta(m.criado_em)}</time>
                  <span>
                    {TIPO_MOV[m.tipo] ?? m.tipo}{m.motivo && (m.tipo !== "ajuste" || m.motivo !== "Contagem") ? ` · ${m.motivo}` : ""}{m.origem === "assistente" ? " · pelo Mozart" : ""}
                    {nomeDe(m.criado_por) ? ` · ${nomeDe(m.criado_por)}` : ""}
                    {(loja.margem || loja.fornecedores) && m.tipo === "entrada" && m.custo_unitario != null ? ` · ${brl(m.custo_unitario)} cada` : ""}
                    {loja.fornecedores && m.fornecedor_id ? ` · ${loja.lista.find((f) => f.id === m.fornecedor_id)?.nome ?? "fornecedor"}` : ""}
                  </span>
                  <b className={m.tipo === "saida" ? "g-vermelho-t" : m.tipo === "entrada" ? "g-verde-t" : ""}>
                    {m.tipo === "entrada" ? "+" : m.tipo === "saida" ? "−" : "="}{fmtQtd(m.quantidade)}
                  </b>
                </div>
              ))}
            </div>
          )}
        </section>

        <button className="g-btn perigo" onClick={desativar}>Tirar este produto da lista</button>
      </div>
    </Folha>
  );
}
