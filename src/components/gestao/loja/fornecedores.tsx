"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Copy, MessageCircle, Plus, Truck } from "lucide-react";
import type { Database } from "@/lib/gestao/banco";
import { custosDasCompras } from "@/lib/gestao/reservado";
import type { Produto } from "@/lib/gestao/tipos";
import { brl, dataCurta, ERRO_TELEFONE, fmtTelefone, linkWhatsApp, mascaraTelefone, telefoneLimpo, telefoneValido } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { Campo, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { fmtQtd, lerQtd } from "./pecas";
import "./loja.css";

export type Fornecedor = Database["public"]["Tables"]["fornecedores"]["Row"];

/** Fornecedores do pet shop (os que saíram da lista vêm junto, para o histórico mostrar o nome). */
export function useFornecedores(ligado: boolean) {
  const { sb, petshop } = useGestao();
  const { dados, recarregar, erro } = useDados(async () =>
    ligado ? ok(await sb.from("fornecedores").select("id, petshop_id, nome, telefone, observacoes, ativo, criado_em").eq("petshop_id", petshop.id).order("nome").order("id").limit(1000)) as Fornecedor[] : [],
  [petshop.id, ligado]);
  return { fornecedores: dados ?? [], recarregar, erro };
}

/** Produto que pede reposição: zerado, ou no mínimo ou abaixo dele. */
export const pedeReposicao = (p: Pick<Produto, "estoque" | "estoque_minimo">) =>
  Number(p.estoque) <= 0 || (Number(p.estoque_minimo) > 0 && Number(p.estoque) <= Number(p.estoque_minimo));

/** Texto do pedido de reposição. Só entra a quantidade que a pessoa digitou; sem quantidade, vai só o nome do produto. */
export function textoDoPedido(fornecedor: string, petshop: string, linhas: { nome: string; unidade: string; qtd: number | null }[]) {
  const medida = (l: { unidade: string; qtd: number | null }) => (l.unidade === "un" ? (l.qtd === 1 ? "unidade" : "unidades") : l.unidade);
  const itens = linhas.map((l) => (l.qtd ? `- ${fmtQtd(l.qtd)} ${medida(l)} de ${l.nome}` : `- ${l.nome}`)).join("\n");
  return `Olá, ${fornecedor}! Aqui é do ${petshop}.\nQuero fazer um pedido de reposição:\n${itens}\nPode me confirmar o valor e o prazo de entrega? Obrigado!`;
}

/** Escolha do fornecedor numa entrada de estoque, com atalho para cadastrar um novo sem sair da entrada. */
export function EscolherFornecedor({ valor, aoMudar, fornecedores, aoCriar }: {
  valor: string | null; aoMudar: (id: string | null) => void; fornecedores: Fornecedor[]; aoCriar: () => Promise<unknown> | void;
}) {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const [novo, setNovo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const lista = fornecedores.filter((f) => f.ativo || f.id === valor);

  async function criar() {
    const nome = (novo ?? "").trim();
    if (!nome) { avisarErro("Escreva o nome do fornecedor."); return; }
    setSalvando(true);
    try {
      const f = ok(await sb.from("fornecedores").insert({ petshop_id: petshop.id, nome }).select("id").single());
      await aoCriar();
      aoMudar(f.id);
      setNovo(null);
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  if (novo !== null) {
    return (
      <Campo rotulo="Nome do fornecedor novo" dica="O WhatsApp e as observações você completa depois, em Fornecedores.">
        <div className="g-lj-codigo">
          <input className="g-input" value={novo} maxLength={120} autoFocus onChange={(e) => setNovo(e.target.value)} placeholder="Ex.: Distribuidora Bom Pet" />
          <button type="button" className="g-btn verde p" onClick={() => void criar()} disabled={salvando}>{salvando ? "Salvando…" : "Guardar"}</button>
          <button type="button" className="g-btn fantasma p" onClick={() => setNovo(null)}>Desistir</button>
        </div>
      </Campo>
    );
  }
  return (
    <Campo rotulo="Fornecedor" dica="Opcional. Fica no histórico de compras e vira o último fornecedor do produto.">
      <div className="g-lj-codigo">
        <select className="g-select" style={{ flex: 1, minWidth: 160 }} value={valor ?? ""} onChange={(e) => aoMudar(e.target.value || null)} aria-label="Fornecedor">
          <option value="">Sem fornecedor</option>
          {lista.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
        </select>
        <button type="button" className="g-btn sec p" onClick={() => setNovo("")}><Plus /> Fornecedor novo</button>
      </div>
    </Campo>
  );
}

type Tela = { tipo: "lista" } | { tipo: "novo" } | { tipo: "ficha"; id: string };

/** Folha de fornecedores: lista, cadastro, histórico de compras e pedido de reposição pelo WhatsApp. */
export default function Fornecedores({ produtos, fornecedores, aoFechar, aoMudar }: {
  produtos: Produto[]; fornecedores: Fornecedor[]; aoFechar: () => void; aoMudar: () => Promise<unknown> | void;
}) {
  const somenteLeitura = useSomenteLeitura();
  const [tela, setTela] = useState<Tela>({ tipo: "lista" });
  const ativos = fornecedores.filter((f) => f.ativo);
  const aberto = tela.tipo === "ficha" ? fornecedores.find((f) => f.id === tela.id) : undefined;

  if (tela.tipo === "novo") return <FormFornecedor aoFechar={() => setTela({ tipo: "lista" })} aoGravar={async (id) => { await aoMudar(); setTela(id ? { tipo: "ficha", id } : { tipo: "lista" }); }} />;
  if (aberto) return <FichaFornecedor fornecedor={aberto} produtos={produtos} aoFechar={() => setTela({ tipo: "lista" })} aoMudar={aoMudar} />;

  return (
    <Folha titulo="Fornecedores" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => { if (!somenteLeitura()) setTela({ tipo: "novo" }); }}><Plus /> Fornecedor novo</button>
      </>}>
      {!ativos.length ? (
        <Vazio titulo="Nenhum fornecedor ainda" texto="Guarde aqui de quem você compra. Depois é só escolher o fornecedor em cada entrada do estoque." />
      ) : (
        <div className="g-lista">
          {ativos.map((f) => {
            const dele = produtos.filter((p) => p.fornecedor_id === f.id);
            const repor = dele.filter(pedeReposicao).length;
            return (
              <button key={f.id} type="button" className="g-linha" onClick={() => setTela({ tipo: "ficha", id: f.id })}>
                <Tile icone={Truck} tom="ceu" />
                <span className="t">
                  <b>{f.nome}</b>
                  <span>{[f.telefone ? fmtTelefone(f.telefone) : "sem WhatsApp", dele.length ? `${dele.length} ${dele.length === 1 ? "produto" : "produtos"}` : null].filter(Boolean).join(" · ")}</span>
                </span>
                {repor > 0 && <span className="g-tag laranja">{repor} para repor</span>}
                <ChevronRight aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </Folha>
  );
}

function FormFornecedor({ fornecedor, aoFechar, aoGravar }: { fornecedor?: Fornecedor; aoFechar: () => void; aoGravar: (id: string | null) => Promise<unknown> | void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState(fornecedor?.nome ?? "");
  const [telefone, setTelefone] = useState(() => { const m = mascaraTelefone(fornecedor?.telefone); return telefoneValido(m) ? m : fornecedor?.telefone ?? ""; });
  const [obs, setObs] = useState(fornecedor?.observacoes ?? "");
  const [erroFone, setErroFone] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const n = nome.trim();
    if (!n) { avisarErro("Escreva o nome do fornecedor."); return; }
    if (!telefoneValido(telefone)) { setErroFone(ERRO_TELEFONE); avisarErro(ERRO_TELEFONE); return; }
    setSalvando(true);
    try {
      const campos = { nome: n, telefone: telefoneLimpo(telefone) || null, observacoes: obs.trim() || null };
      const id = fornecedor
        ? ok(await sb.from("fornecedores").update(campos).eq("id", fornecedor.id).eq("petshop_id", petshop.id).select("id").single()).id
        : ok(await sb.from("fornecedores").insert({ ...campos, petshop_id: petshop.id }).select("id").single()).id;
      avisar(fornecedor ? "Fornecedor atualizado." : `${n} está na lista de fornecedores.`);
      await aoGravar(id);
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <Folha titulo={fornecedor ? `Editar ${fornecedor.nome}` : "Fornecedor novo"} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar fornecedor"}</button>
      </>}>
      <div className="g-form">
        <Campo rotulo="Nome"><input className="g-input" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Distribuidora Bom Pet" autoFocus={!fornecedor} /></Campo>
        <Campo rotulo="WhatsApp" dica="Com DDD. É para onde vai o pedido de reposição." erro={erroFone}>
          <input className="g-input g-tab" inputMode="tel" value={telefone} onChange={(e) => { setTelefone(mascaraTelefone(e.target.value)); setErroFone(null); }} placeholder="(11) 99999-1234" />
        </Campo>
        <Campo rotulo="Observações" dica="Dia de entrega, pedido mínimo, nome do vendedor… o que ajudar.">
          <textarea className="g-textarea" rows={3} value={obs} maxLength={1000} onChange={(e) => setObs(e.target.value)} />
        </Campo>
      </div>
    </Folha>
  );
}

type Compra = { id: string; criado_em: string; quantidade: number; produto_id: string; produtos: { nome: string; unidade: string } | null };

function FichaFornecedor({ fornecedor, produtos, aoFechar, aoMudar }: { fornecedor: Fornecedor; produtos: Produto[]; aoFechar: () => void; aoMudar: () => Promise<unknown> | void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState(false);
  const [pedindo, setPedindo] = useState(false);

  const { dados: compras, carregando, erro } = useDados(async () => {
    const linhas = ok(await sb.from("movimentos_estoque").select("id, criado_em, quantidade, produto_id, produtos(nome, unidade)")
      .eq("petshop_id", petshop.id).eq("fornecedor_id", fornecedor.id).eq("tipo", "entrada").order("criado_em", { ascending: false }).order("id").limit(60)) as unknown as Compra[];
    const custos = linhas.length ? await custosDasCompras(sb, petshop.id, fornecedor.id) : new Map<string, number | null>();
    return linhas.map((c) => ({ ...c, custo: custos.get(c.id) ?? null }));
  }, [petshop.id, fornecedor.id]);

  const repor = useMemo(() => produtos.filter((p) => p.fornecedor_id === fornecedor.id && pedeReposicao(p)), [produtos, fornecedor.id]);

  async function tirar() {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: `Tirar ${fornecedor.nome} da lista?`, texto: "Ele some da lista e da escolha nas entradas. As compras já anotadas continuam no histórico.", confirmar: "Tirar da lista", perigo: true }))) return;
    try {
      ok(await sb.from("fornecedores").update({ ativo: false }).eq("id", fornecedor.id).eq("petshop_id", petshop.id).select("id").single());
      avisar(`${fornecedor.nome} saiu da lista.`);
      await aoMudar();
      aoFechar();
    } catch (e) { avisarErro(e); }
  }

  if (editando) return <FormFornecedor fornecedor={fornecedor} aoFechar={() => setEditando(false)} aoGravar={async () => { await aoMudar(); setEditando(false); }} />;
  if (pedindo) return <PedidoDeReposicao fornecedor={fornecedor} produtos={repor} aoFechar={() => setPedindo(false)} />;

  return (
    <Folha larga titulo={fornecedor.nome} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => setPedindo(true)} disabled={!repor.length}><MessageCircle /> Pedido de reposição</button>
      </>}>
      <div className="g-pilha g">
        <div className="g-card liso g-pilha p">
          <div className="g-fila entre">
            <div>
              <span className="g-rotulo">WhatsApp</span>
              <div><b>{fornecedor.telefone ? fmtTelefone(fornecedor.telefone) : "Não informado"}</b></div>
            </div>
            <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setEditando(true); }}>Editar</button>
          </div>
          {fornecedor.observacoes && <p className="g-p" style={{ whiteSpace: "pre-wrap" }}>{fornecedor.observacoes}</p>}
        </div>

        <section>
          <h3 style={{ marginBottom: 6 }}>Para repor</h3>
          {repor.length ? (
            <p className="g-p">{repor.length === 1 ? "1 produto deste fornecedor está" : `${repor.length} produtos deste fornecedor estão`} no mínimo ou abaixo: {repor.slice(0, 6).map((p) => p.nome).join(", ")}{repor.length > 6 ? ` e mais ${repor.length - 6}` : ""}.</p>
          ) : <p className="g-muted g-p">Nenhum produto deste fornecedor está no mínimo ou abaixo. O pedido de reposição aparece quando tiver.</p>}
        </section>

        <section>
          <h3 style={{ marginBottom: 6 }}>Compras</h3>
          {erro ? <p className="g-erro">{erro}</p> : carregando && !compras ? <Esqueleto linhas={2} /> : !compras?.length ? (
            <p className="g-muted g-p">Nenhuma entrada com este fornecedor ainda. Escolha o fornecedor ao anotar uma entrada no estoque.</p>
          ) : (
            <div>
              {compras.map((c) => (
                <div key={c.id} className="g-lj-compra">
                  <time>{dataCurta(c.criado_em)}</time>
                  <span>{fmtQtd(c.quantidade)} {c.produtos?.unidade ?? "un"} de {c.produtos?.nome ?? "produto"}</span>
                  <b>{c.custo != null ? `${brl(c.custo)} cada` : ""}</b>
                </div>
              ))}
              {compras.length === 60 && <p className="g-muted g-pp" style={{ marginTop: 6 }}>Mostrando as 60 entradas mais recentes.</p>}
            </div>
          )}
        </section>

        <button type="button" className="g-btn perigo" onClick={() => void tirar()}>Tirar este fornecedor da lista</button>
      </div>
    </Folha>
  );
}

/** Pedido de reposição: o sistema monta a mensagem, a pessoa confere, muda o que quiser e manda pelo WhatsApp dela. */
function PedidoDeReposicao({ fornecedor, produtos, aoFechar }: { fornecedor: Fornecedor; produtos: Produto[]; aoFechar: () => void }) {
  const { petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [qtds, setQtds] = useState<Record<string, string>>({});
  // enquanto a pessoa não mexe no texto, ele acompanha as quantidades; depois de mexer, vale o que ela escreveu
  const [escrito, setEscrito] = useState<string | null>(null);
  const montado = textoDoPedido(fornecedor.nome, petshop.nome, produtos.map((p) => ({ nome: p.nome, unidade: p.unidade, qtd: lerQtd(qtds[p.id] ?? "") || null })));
  const texto = escrito ?? montado;
  const zap = linkWhatsApp(fornecedor.telefone, texto);

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); avisar("Mensagem copiada."); } catch { avisarErro("Não consegui copiar. Selecione o texto e copie."); }
  }

  return (
    <Folha larga titulo={`Pedido para ${fornecedor.nome}`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        {zap
          ? <a className="g-btn pri" href={zap} target="_blank" rel="noreferrer"><MessageCircle /> Abrir no WhatsApp</a>
          : <button type="button" className="g-btn pri" onClick={() => void copiar()}><Copy /> Copiar mensagem</button>}
      </>}>
      <div className="g-pilha">
        <p className="g-muted g-p">Produtos deste fornecedor que estão no mínimo ou abaixo. Diga quanto quer de cada um, confira a mensagem e mande: nada é enviado sozinho.</p>
        <div>
          {produtos.map((p) => (
            <label key={p.id} className="g-lj-pedido">
              <span className="t">
                <b>{p.nome}</b>
                <span>tem {fmtQtd(p.estoque)} {p.unidade}{Number(p.estoque_minimo) > 0 ? ` · mínimo ${fmtQtd(p.estoque_minimo)}` : ""}</span>
              </span>
              <input className="g-input g-tab" inputMode="decimal" placeholder={`Quantos ${p.unidade}`} aria-label={`Quantidade de ${p.nome} no pedido`} disabled={escrito !== null}
                value={qtds[p.id] ?? ""} onChange={(e) => setQtds((q) => ({ ...q, [p.id]: e.target.value }))} />
            </label>
          ))}
        </div>
        <Campo rotulo="Mensagem" dica={escrito !== null ? "Você mudou o texto: as quantidades acima não mexem mais nele." : "Pode mudar o texto antes de mandar."}>
          <textarea className="g-textarea" rows={Math.min(14, 5 + produtos.length)} value={texto} onChange={(e) => setEscrito(e.target.value)} aria-label="Mensagem do pedido" />
        </Campo>
        {escrito !== null && <div><button type="button" className="g-btn fantasma p" onClick={() => setEscrito(null)}>Montar a mensagem de novo</button></div>}
        {!zap && <p className="g-muted g-pp">Este fornecedor está sem WhatsApp. Copie a mensagem, ou coloque o número em Editar para abrir a conversa direto.</p>}
        {zap && <div><button type="button" className="g-btn sec p" onClick={() => void copiar()}><Copy /> Copiar mensagem</button></div>}
      </div>
    </Folha>
  );
}
