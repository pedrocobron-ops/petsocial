"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Minus, Plus, Search, Sparkles } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { abrirAssistente, avisarMudanca, Campo, CampoValor, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { Chips, ChipsForma, ErroTela, fmtQtd, lerQtd, type Forma } from "@/components/gestao/loja/pecas";
import { lancarPago } from "@/lib/gestao/dinheiro";
import type { MovimentoEstoque, Produto } from "@/lib/gestao/tipos";
import { brl, dataCurta, semAcento } from "@/lib/gestao/util";
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

type Aberta = { tipo: "novo" } | { tipo: "entrada" | "saida" | "ficha"; produto: Produto };

export default function Estoque() {
  const { sb, petshop } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberta, setAberta] = useState<Aberta | null>(null);

  const { dados, carregando, erro, recarregar } = useDados(async () =>
    ok(await sb.from("produtos").select("*").eq("petshop_id", petshop.id).eq("ativo", true).order("nome").limit(2000)) as Produto[],
  [petshop.id]);

  const produtos = useMemo(() => dados ?? [], [dados]);
  const baixos = produtos.filter(acabando);
  const semSaldo = produtos.filter(zerado);
  const alvo = semAcento(q);
  const lista = produtos.filter((p) =>
    (filtro === "todos" || (filtro === "acabando" ? acabando(p) : zerado(p))) &&
    (!alvo || semAcento(p.nome).includes(alvo) || semAcento(p.categoria ?? "").includes(alvo)));

  const abrir = (a: Aberta) => { if (a.tipo !== "ficha" && somenteLeitura()) return; setAberta(a); };
  const fechar = () => setAberta(null);
  const gravou = () => { fechar(); void recarregar(); avisarMudanca(); };

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Estoque</h1>
          <p className="g-muted">{produtos.length ? `${produtos.length} ${produtos.length === 1 ? "produto" : "produtos"} na prateleira` : "Ração, shampoo, petiscos e o que mais você vende ou usa."}</p>
        </div>
        <div className="g-acoes">
          <button className="g-btn pri" onClick={() => abrir({ tipo: "novo" })}><Plus /> Produto novo</button>
        </div>
      </header>

      {erro && <ErroTela erro={erro} aoTentar={() => void recarregar()} />}

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
            <div className="g-grade c2">
              {lista.map((p) => (
                <div key={p.id} className="g-card ge-prod">
                  <button type="button" className="ge-prod-t" onClick={() => abrir({ tipo: "ficha", produto: p })} aria-label={`Abrir ${p.nome}`}>
                    <b>{p.nome}</b>
                    <span>{[p.categoria, p.preco_venda != null ? `vende a ${brl(p.preco_venda)}` : null].filter(Boolean).join(" · ") || "Sem categoria"}</span>
                  </button>
                  <div className="ge-saldo">
                    <span className={`g-num m${zerado(p) ? " ge-zero" : acabando(p) ? " ge-baixo" : ""}`}>{fmtQtd(p.estoque)}</span>
                    <small>{p.unidade}</small>
                  </div>
                  <div className="ge-prod-pe">
                    {zerado(p) ? <span className="g-tag vermelho">zerado</span> : acabando(p) ? <span className="g-tag laranja">acabando</span> : null}
                    <button className="g-btn sec p" onClick={() => abrir({ tipo: "entrada", produto: p })}><Plus /> Entrada</button>
                    <button className="g-btn sec p" onClick={() => abrir({ tipo: "saida", produto: p })} disabled={zerado(p)}><Minus /> Saída</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
        <Campo rotulo="Preço de venda"><CampoValor valor={v.preco} aoMudar={(n) => mudar({ preco: n })} /></Campo>
        <Campo rotulo="Custo"><CampoValor valor={v.custo} aoMudar={(n) => mudar({ custo: n })} /></Campo>
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
  const [forma, setForma] = useState<Forma>("pix");
  const [salvando, setSalvando] = useState(false);

  const n = lerQtd(qtd);
  const total = n && custo ? centavos(n * custo) : 0;
  const lanca = vejoFinanceiro && despesa && total > 0;

  async function salvar() {
    if (!n) { avisarErro("Diga quantas unidades entraram."); return; }
    setSalvando(true);
    try {
      ok(await sb.from("movimentos_estoque").insert({
        petshop_id: petshop.id, produto_id: produto.id, tipo: "entrada", quantidade: n, custo_unitario: custo || null,
        motivo: "Compra", criado_por: user.id,
      }).select("id").single());
      if (lanca) {
        try {
          await lancarPago(sb, petshop.id, {
            tipo: "saida", valor: total, forma, categoria: "Produtos e insumos",
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
          <Campo rotulo={`Custo por ${produto.unidade}`} dica="Opcional"><CampoValor valor={custo} aoMudar={setCusto} /></Campo>
        </div>
        {vejoFinanceiro && (
          <>
            <label className="g-check">
              <input type="checkbox" checked={despesa && total > 0} disabled={total <= 0} onChange={(e) => setDespesa(e.target.checked)} />
              <span>Lançar a compra como despesa{total > 0 ? ` (${brl(total)})` : ""}</span>
            </label>
            {lanca && <ChipsForma valor={forma} aoMudar={setForma} />}
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
  const [forma, setForma] = useState<Forma>("pix");
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
    setSalvando(true);
    try {
      ok(await sb.from("movimentos_estoque").insert({
        petshop_id: petshop.id, produto_id: produto.id, tipo: "saida", quantidade: n, motivo, criado_por: user.id,
      }).select("id").single());
      if (venda && vejoFinanceiro && valor) {
        try {
          await lancarPago(sb, petshop.id, {
            tipo: "entrada", valor, forma, categoria: "Venda de produtos",
            descricao: `Venda: ${fmtQtd(n)} ${produto.unidade} de ${produto.nome}`,
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
            <Campo rotulo="Valor da venda" dica={produto.preco_venda != null ? `${brl(produto.preco_venda)} por ${produto.unidade}` : "Este produto ainda não tem preço de venda."}>
              <CampoValor valor={valor} aoMudar={setValorEditado} />
            </Campo>
            <ChipsForma valor={forma} aoMudar={setForma} />
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
    ok(await sb.from("movimentos_estoque").select("*").eq("petshop_id", petshop.id).eq("produto_id", produto.id)
      .order("criado_em", { ascending: false }).limit(20)) as MovimentoEstoque[],
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
        <div className="g-card areia">
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
