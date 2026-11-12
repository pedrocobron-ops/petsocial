"use client";

import { COLS_MOVIMENTO, COLS_PRODUTO, comCustos, comCustosDeMovimento } from "@/lib/gestao/reservado";
import { useMemo, useState } from "react";
import Importar from "@/components/gestao/importar";
import { AlertTriangle, ArrowUpFromLine, Minus, Package, PackageX, Plus, Search, ShoppingBag, Sparkles, Wallet, Upload } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { abrirAssistente, avisarMudanca, Campo, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { Kpi, Tile } from "@/components/gestao/painel";
import { AvisoCaixaFechado, CampoDinheiro, Chips, ChipsForma, erroDeValor, ErroTela, EscolhaPagamento, fecharPagamento, fmtQtd, lembrarForma, lerQtd, useCaixaAberto, usePagamento, type Forma } from "@/components/gestao/loja/pecas";
import VendaBalcao from "@/components/gestao/loja/venda";
import { lancarPago } from "@/lib/gestao/dinheiro";
import type { MovimentoEstoque, Produto } from "@/lib/gestao/tipos";
import { brl, brlCurto, dataCurta, semAcento } from "@/lib/gestao/util";
import "./estoque.css";

const UNIDADES = ["un", "kg", "g", "L", "ml", "pacote", "saco"];
const FILTROS = [
  { id: "todos", rotulo: "Todos" },
  { id: "acabando", rotulo: "Acabando" },
  { id: "zerados", rotulo: "Zerados" },
] as const;
type Filtro = (typeof FILTROS)[number]["id"];
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

type Aberta = { tipo: "novo" | "venda" } | { tipo: "entrada" | "saida" | "ficha"; produto: Produto };

export default function Estoque() {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [importando, setImportando] = useState(false);

  const { dados, carregando, erro, recarregar } = useDados(async () =>
    (await comCustos(sb, petshop.id, ok(await sb.from("produtos").select(COLS_PRODUTO).eq("petshop_id", petshop.id).eq("ativo", true).order("nome").limit(2000)) as unknown as { id: string }[])) as unknown as Produto[],
  [petshop.id]);

  // saídas dos últimos 30 dias: só para o resumo do topo (se a busca falhar, o cartão fica de fora)
  const { dados: saidas, recarregar: recarregarSaidas } = useDados(async () => {
    const desde = new Date(Date.now() - 30 * 864e5).toISOString();
    return ok(await sb.from("movimentos_estoque").select("motivo").eq("petshop_id", petshop.id).eq("tipo", "saida").gte("criado_em", desde).limit(2000)) as { motivo: string | null }[];
  }, [petshop.id]);

  const produtos = useMemo(() => dados ?? [], [dados]);
  const baixos = produtos.filter(acabando);
  const semSaldo = produtos.filter(zerado);
  const alvo = semAcento(q);
  const lista = produtos.filter((p) =>
    (filtro === "todos" || (filtro === "acabando" ? acabando(p) : zerado(p))) &&
    (!alvo || semAcento(p.nome).includes(alvo) || semAcento(p.categoria ?? "").includes(alvo)));

  const abrir = (a: Aberta) => { if (a.tipo !== "ficha" && somenteLeitura()) return; setAberta(a); };
  const fechar = () => setAberta(null);
  const gravou = () => { fechar(); void recarregar(); void recarregarSaidas(); avisarMudanca(); };

  const categorias = new Set(produtos.map((p) => p.categoria?.trim()).filter(Boolean)).size;
  const comCusto = produtos.filter((p) => p.custo != null && Number(p.estoque) > 0);
  const valorParado = comCusto.reduce((t, p) => t + Number(p.estoque) * Number(p.custo), 0);
  const semCusto = produtos.filter((p) => p.custo == null && Number(p.estoque) > 0).length;
  const vendas = (saidas ?? []).filter((m) => m.motivo === "Venda").length;

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Estoque</h1>
          <p className="g-muted">{produtos.length ? `${produtos.length} ${produtos.length === 1 ? "produto" : "produtos"} na prateleira` : "Ração, shampoo, petiscos e o que mais você vende ou usa."}</p>
        </div>
        <div className="g-acoes">
          {produtos.length > 0 && <button className="g-btn sec" onClick={() => abrir({ tipo: "venda" })}><ShoppingBag /> Vender</button>}
          <button className="g-btn sec" onClick={() => setImportando(true)}><Upload /> Trazer de planilha</button>
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
          {vejoFinanceiro ? (
            <Kpi icone={Wallet} tom="menta" rotulo="Valor em estoque" valor={brlCurto(Math.round(valorParado))}
              apoio={semCusto ? `a preço de custo · ${semCusto} sem custo` : "a preço de custo"} />
          ) : (
            <Kpi icone={PackageX} tom="lilas" rotulo="Zerados" valor={semSaldo.length} apoio={semSaldo.length ? "sem nada na prateleira" : "nenhum em falta"} />
          )}
          <Kpi icone={ArrowUpFromLine} tom="ceu" rotulo="Saídas em 30 dias" valor={saidas ? saidas.length : "–"}
            apoio={!saidas ? " " : vendas ? `${vendas} ${vendas === 1 ? "venda" : "vendas"}` : saidas.length ? "nenhuma venda" : "nada saiu ainda"} />
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
            <input className="g-input" placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar produto" />
          </div>
          <div className="g-chips">
            {FILTROS.map((f) => {
              const n = f.id === "acabando" ? baixos.length : f.id === "zerados" ? semSaldo.length : 0;
              return <button key={f.id} className="g-chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.rotulo}{n ? ` (${n})` : ""}</button>;
            })}
          </div>

          {!lista.length ? (
            <p className="g-muted g-centro" style={{ padding: "28px 8px" }}>
              {alvo ? "Nenhum produto com esse nome." : filtro === "acabando" ? "Nada acabando por aqui." : "Nenhum produto zerado."}
            </p>
          ) : (
            <div className="g-est-grade">
              {lista.map((p) => {
                const n = nivel(p), min = Number(p.estoque_minimo);
                return (
                  <div key={p.id} className={`g-card g-est-prod ${n.tom}`}>
                    <button type="button" className="g-est-cab" onClick={() => abrir({ tipo: "ficha", produto: p })} aria-label={`Abrir ${p.nome}`}>
                      <Tile icone={zerado(p) ? PackageX : Package} tom="rosa" />
                      <span className="t">
                        <b>{p.nome}</b>
                        <span>{[p.categoria, p.preco_venda != null ? `vende a ${brl(p.preco_venda)}` : null].filter(Boolean).join(" · ") || "Sem categoria"}</span>
                      </span>
                      <span className="g-est-saldo">
                        <span className="g-num m">{fmtQtd(p.estoque)}</span>
                        <small>{p.unidade}</small>
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
                        {zerado(p) ? <span className="g-tag vermelho">zerado</span> : acabando(p) ? <span className="g-tag laranja">acabando</span> : n.tom === "perto" ? <span className="g-tag amarelo">perto do mínimo</span> : null}
                        <span className="g-muted g-pp g-tab">{min > 0 ? `mínimo ${fmtQtd(min)} ${p.unidade}` : "sem mínimo definido"}</span>
                      </div>
                    </div>
                    <div className="g-est-pe">
                      <button className="g-btn sec p" onClick={() => abrir({ tipo: "entrada", produto: p })}><Plus /> Entrada</button>
                      <button className="g-btn sec p" onClick={() => abrir({ tipo: "saida", produto: p })} disabled={zerado(p)}><Minus /> Saída</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {aberta?.tipo === "venda" && <VendaBalcao aoFechar={fechar} aoPronto={gravou} />}
      {aberta?.tipo === "novo" && <ProdutoNovo aoFechar={fechar} aoGravar={gravou} />}
      {aberta?.tipo === "entrada" && <Entrada produto={aberta.produto} aoFechar={fechar} aoGravar={gravou} />}
      {aberta?.tipo === "saida" && <Saida produto={aberta.produto} aoFechar={fechar} aoGravar={gravou} />}
      {aberta?.tipo === "ficha" && (
        <Ficha produto={produtos.find((p) => p.id === aberta.produto.id) ?? aberta.produto} aoFechar={fechar}
          aoMudar={() => { void recarregar(); avisarMudanca(); }} aoGravar={gravou} />
      )}
    </>
  );
}

/* ---------- campos do produto (novo e ficha) ---------- */

type CamposProduto = { nome: string; categoria: string; unidade: string; preco: number | null; custo: number | null; minimo: string };

function CamposDoProduto({ v, mudar, categorias }: { v: CamposProduto; mudar: (p: Partial<CamposProduto>) => void; categorias?: string[] }) {
  return (
    <>
      <Campo rotulo="Nome">
        <input className="g-input" value={v.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: Ração Golden 15 kg" maxLength={120} />
      </Campo>
      <div className="dupla">
        <Campo rotulo="Categoria">
          <input className="g-input" value={v.categoria} onChange={(e) => mudar({ categoria: e.target.value })} placeholder="Ex.: Ração" list="ge-categorias" />
        </Campo>
        <Campo rotulo="Unidade">
          <select className="g-select" value={v.unidade} onChange={(e) => mudar({ unidade: e.target.value })}>
            {(UNIDADES.includes(v.unidade) ? UNIDADES : [v.unidade, ...UNIDADES]).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
      </div>
      {categorias && <datalist id="ge-categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>}
      <div className="dupla">
        <Campo rotulo="Preço de venda"><CampoDinheiro valor={v.preco} aoMudar={(n) => mudar({ preco: n })} /></Campo>
        <Campo rotulo="Custo"><CampoDinheiro valor={v.custo} aoMudar={(n) => mudar({ custo: n })} /></Campo>
      </div>
      <Campo rotulo="Estoque mínimo" dica="Abaixo disso, o produto aparece como acabando. Deixe 0 para não avisar.">
        <input className="g-input g-tab" inputMode="decimal" value={v.minimo} onChange={(e) => mudar({ minimo: e.target.value })} placeholder="0" />
      </Campo>
    </>
  );
}

function ProdutoNovo({ aoFechar, aoGravar }: { aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, user } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [v, setV] = useState<CamposProduto>({ nome: "", categoria: "", unidade: "un", preco: null, custo: null, minimo: "" });
  const [inicial, setInicial] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const nome = v.nome.trim();
    if (!nome) { avisarErro("Escreva o nome do produto."); return; }
    const minimo = v.minimo.trim() ? lerQtd(v.minimo) : 0;
    const qtd = inicial.trim() ? lerQtd(inicial) : 0;
    if (minimo == null || qtd == null) { avisarErro("Confira as quantidades: use só números."); return; }
    setSalvando(true);
    try {
      const novo = ok(await sb.from("produtos").insert({
        petshop_id: petshop.id, nome, categoria: v.categoria.trim() || null, unidade: v.unidade,
        preco_venda: v.preco, custo: v.custo, estoque_minimo: minimo,
      }).select().single());
      if (qtd > 0) {
        ok(await sb.from("movimentos_estoque").insert({
          petshop_id: petshop.id, produto_id: novo.id, tipo: "entrada", quantidade: qtd, custo_unitario: v.custo,
          motivo: "Estoque inicial", criado_por: user.id,
        }).select("id").single());
      }
      avisar(`${nome} está no estoque.`);
      aoGravar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <Folha titulo="Produto novo" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar produto"}</button>
      </>}>
      <div className="g-form">
        <CamposDoProduto v={v} mudar={(p) => setV((a) => ({ ...a, ...p }))} />
        <Campo rotulo={`Quanto tem hoje (${v.unidade})`} dica="O que já está na prateleira. Pode deixar em branco.">
          <input className="g-input g-tab" inputMode="decimal" value={inicial} onChange={(e) => setInicial(e.target.value)} placeholder="0" />
        </Campo>
      </div>
    </Folha>
  );
}

/* ---------- entrada ---------- */

function Entrada({ produto, aoFechar, aoGravar }: { produto: Produto; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, user, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [qtd, setQtd] = useState("");
  const [custo, setCusto] = useState<number | null>(produto.custo);
  const [despesa, setDespesa] = useState(true);
  // despesa é uma forma só, e nada vem marcado: a pessoa diz como pagou o fornecedor
  const [forma, setForma] = useState<Forma | null>(null);
  const [erroForma, setErroForma] = useState<string | null>(null);
  const caixa = useCaixaAberto();
  const [salvando, setSalvando] = useState(false);

  const n = lerQtd(qtd);
  const total = n && custo ? centavos(n * custo) : 0;
  const lanca = vejoFinanceiro && despesa && total > 0;

  async function salvar() {
    if (!n) { avisarErro("Diga quantas unidades entraram."); return; }
    const custoRuim = erroDeValor(custo, "O custo") ?? (lanca ? erroDeValor(total, "O total da compra") : null);
    if (custoRuim) { avisarErro(custoRuim); return; }
    if (lanca && !forma) { setErroForma("Escolha como você pagou a compra."); avisarErro("Escolha a forma de pagamento."); return; }
    setSalvando(true);
    try {
      ok(await sb.from("movimentos_estoque").insert({
        petshop_id: petshop.id, produto_id: produto.id, tipo: "entrada", quantidade: n, custo_unitario: custo || null,
        motivo: "Compra", criado_por: user.id,
      }).select("id").single());
      if (lanca && forma) {
        try {
          await lancarPago(sb, petshop.id, {
            tipo: "saida", valor: total, forma, categoria: "Produtos e material",
            descricao: `Compra: ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}`,
          });
          avisar(`Entrada anotada e ${brl(total)} lançados como despesa.`);
        } catch (e) {
          avisarErro(`O estoque foi atualizado, mas a despesa não foi lançada. Lance pelo Financeiro. (${e instanceof Error ? e.message : "erro"})`);
        }
      } else avisar(`Entraram ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}.`);
      aoGravar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
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
            <input className="g-input g-tab" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" autoFocus />
          </Campo>
          <Campo rotulo={`Custo por ${produto.unidade}`} dica="Opcional" erro={erroDeValor(custo, "O custo")}><CampoDinheiro valor={custo} aoMudar={setCusto} /></Campo>
        </div>
        {vejoFinanceiro && (
          <>
            <label className="g-check">
              <input type="checkbox" checked={despesa && total > 0} disabled={total <= 0} onChange={(e) => setDespesa(e.target.checked)} />
              <span>Lançar a compra como despesa{total > 0 ? ` (${brl(total)})` : ""}</span>
            </label>
            {lanca && <ChipsForma valor={forma} aoMudar={(f) => { setForma(f); setErroForma(null); }} erro={erroForma} />}
            {lanca && <AvisoCaixaFechado aberto={caixa} />}
          </>
        )}
      </div>
    </Folha>
  );
}

/* ---------- saída ---------- */

function Saida({ produto, aoFechar, aoGravar }: { produto: Produto; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, user, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [qtd, setQtd] = useState("1");
  const [motivo, setMotivo] = useState<Motivo>("Venda");
  const [valorEditado, setValorEditado] = useState<number | null | undefined>(undefined);
  // mesmo recebimento da venda no balcão: uma forma ou dividido em até três
  const [pagamento, setPagamento] = usePagamento();
  const [erroForma, setErroForma] = useState<string | null>(null);
  const caixa = useCaixaAberto();
  const [salvando, setSalvando] = useState(false);

  const n = lerQtd(qtd);
  const saldo = Number(produto.estoque);
  const calculado = n && produto.preco_venda != null ? centavos(n * Number(produto.preco_venda)) : null;
  const valor = valorEditado === undefined ? calculado : valorEditado;
  const venda = motivo === "Venda";
  const passou = n != null && n > saldo;

  async function salvar() {
    if (!n) { avisarErro("Diga quantas unidades saíram."); return; }
    if (passou) { avisarErro(`Só tem ${fmtQtd(saldo)} ${produto.unidade}. Se o saldo estiver errado, corrija na ficha do produto.`); return; }
    if (venda && vejoFinanceiro && !valor) { avisarErro("Diga o valor da venda."); return; }
    const valorRuim = venda && vejoFinanceiro ? erroDeValor(valor, "O valor da venda") : null;
    if (valorRuim) { avisarErro(valorRuim); return; }
    const pg = venda && vejoFinanceiro && valor ? fecharPagamento(pagamento, valor) : null;
    if (pg && "erro" in pg) { setErroForma(pagamento.dividido ? pg.erro : "Escolha como o cliente pagou."); avisarErro(pg.erro); return; }
    setSalvando(true);
    try {
      ok(await sb.from("movimentos_estoque").insert({
        petshop_id: petshop.id, produto_id: produto.id, tipo: "saida", quantidade: n, motivo, criado_por: user.id,
      }).select("id").single());
      if (pg && !("erro" in pg) && valor) {
        try {
          lembrarForma(pg.forma);
          await lancarPago(sb, petshop.id, {
            tipo: "entrada", valor, forma: pg.forma, pagamentos: pg.pagamentos, categoria: "Venda de produtos",
            descricao: `Venda: ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}`,
            // com os itens, apagar esta venda depois devolve o produto ao estoque
            itens: [{ tipo: "produto", nome: produto.nome, qtd: n, valor: Math.round((valor / n) * 100) / 100, produto_id: produto.id }],
          });
          avisar(`Venda de ${brl(valor)} anotada.`);
        } catch (e) {
          avisarErro(`O estoque foi atualizado, mas a venda não entrou no financeiro. Lance pelo Financeiro. (${e instanceof Error ? e.message : "erro"})`);
        }
      } else avisar(`Saíram ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}.`);
      aoGravar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <Folha titulo={`Saída de ${produto.nome}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : venda ? "Anotar venda" : "Anotar saída"}</button>
      </>}>
      <div className="g-form">
        <Campo rotulo={`Quantidade (${produto.unidade})`} erro={passou ? `Só tem ${fmtQtd(saldo)} ${produto.unidade}.` : null} dica={`Tem ${fmtQtd(saldo)} ${produto.unidade}.`}>
          <input className="g-input g-tab" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} placeholder="0" autoFocus />
        </Campo>
        <div className="g-campo">
          <span>Motivo</span>
          <Chips opcoes={MOTIVOS} valor={motivo} aoMudar={setMotivo} />
        </div>
        {venda && (vejoFinanceiro ? (
          <>
            <Campo rotulo="Valor da venda" erro={erroDeValor(valor, "O valor da venda")} dica={produto.preco_venda != null ? `${brl(produto.preco_venda)} por ${produto.unidade}` : "Este produto ainda não tem preço de venda."}>
              <CampoDinheiro valor={valor} aoMudar={(v) => { setValorEditado(v); setErroForma(null); }} />
            </Campo>
            <EscolhaPagamento valor={pagamento} aoMudar={(e) => { setPagamento(e); setErroForma(null); }} total={valor ?? 0} erro={erroForma} />
            <AvisoCaixaFechado aberto={caixa} />
          </>
        ) : (
          <p className="g-muted g-p">A venda sai do estoque. O dinheiro fica para quem cuida do financeiro lançar.</p>
        ))}
      </div>
    </Folha>
  );
}

/* ---------- ficha ---------- */

const TIPO_MOV: Record<string, string> = { entrada: "Entrada", saida: "Saída", ajuste: "Saldo corrigido" };

function Ficha({ produto, aoFechar, aoMudar, aoGravar }: { produto: Produto; aoFechar: () => void; aoMudar: () => void; aoGravar: () => void }) {
  const { sb, petshop, user } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [v, setV] = useState<CamposProduto>({
    nome: produto.nome, categoria: produto.categoria ?? "", unidade: produto.unidade, preco: produto.preco_venda, custo: produto.custo,
    minimo: Number(produto.estoque_minimo) ? fmtQtd(produto.estoque_minimo) : "",
  });
  const [contado, setContado] = useState<string | null>(null);
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
    setSalvando(true);
    try {
      ok(await sb.from("produtos").update({
        nome, categoria: v.categoria.trim() || null, unidade: v.unidade, preco_venda: v.preco, custo: v.custo, estoque_minimo: minimo,
      }).eq("id", produto.id).eq("petshop_id", petshop.id).select("id").single());
      avisar("Produto atualizado.");
      aoGravar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  async function corrigir() {
    const n = lerQtd(contado ?? "");
    if (n == null) { avisarErro("Diga quanto você contou."); return; }
    setSalvando(true);
    try {
      ok(await sb.from("movimentos_estoque").insert({
        petshop_id: petshop.id, produto_id: produto.id, tipo: "ajuste", quantidade: n, motivo: "Contagem", criado_por: user.id,
      }).select("id").single());
      avisar(`Saldo corrigido para ${fmtQtd(n)} ${produto.unidade}.`);
      setContado(null);
      void recarregar();
      aoMudar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
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
              <span className="g-rotulo">Saldo</span>
              <div><span className="g-num">{fmtQtd(produto.estoque)}</span> <span className="g-muted">{produto.unidade}</span></div>
            </div>
            {contado === null && <button className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setContado(""); }}>Corrigir saldo</button>}
          </div>
          {contado !== null && (
            <div className="g-form" style={{ marginTop: 14 }}>
              <Campo rotulo={`Quanto você contou (${produto.unidade})`} dica="O saldo passa a ser este número.">
                <input className="g-input g-tab" inputMode="decimal" value={contado} onChange={(e) => setContado(e.target.value)} placeholder="0" autoFocus />
              </Campo>
              <div className="g-fila">
                <button className="g-btn verde p" onClick={corrigir} disabled={salvando}>Corrigir</button>
                <button className="g-btn fantasma p" onClick={() => setContado(null)}>Deixar como está</button>
              </div>
            </div>
          )}
        </div>

        <div className="g-form">
          <CamposDoProduto v={v} mudar={(p) => setV((a) => ({ ...a, ...p }))} />
        </div>

        <section>
          <h3 style={{ marginBottom: 6 }}>Últimos movimentos</h3>
          {erro ? <p className="g-erro">{erro}</p> : carregando && !movs ? <Esqueleto linhas={2} /> : !movs?.length ? (
            <p className="g-muted g-p">Nada entrou nem saiu ainda.</p>
          ) : (
            <div>
              {movs.map((m) => (
                <div key={m.id} className="ge-mov">
                  <time>{dataCurta(m.criado_em)}</time>
                  <span>{TIPO_MOV[m.tipo] ?? m.tipo}{m.motivo && m.tipo !== "ajuste" ? ` · ${m.motivo}` : ""}{m.origem === "assistente" ? " · pelo Mozart" : ""}</span>
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
