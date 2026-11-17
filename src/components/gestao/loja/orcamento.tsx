"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, FileText, MessageCircle, Pencil, Plus, Search, Trash2, Wand2 } from "lucide-react";
import {
  contaDoOrcamento, fraseDaValidade, linkDoOrcamento, repartirDesconto, STATUS_ORCAMENTO, statusDoOrcamento, temProduto, temServico,
  textoDoOrcamento, validadePadrao, zapDoOrcamento, type ItemOrcamento, type StatusOrcamento,
} from "@/lib/gestao/orcamento";
import { useOperacao } from "@/lib/gestao/uma-vez";
import type { PetComTutor } from "@/lib/gestao/tipos";
import { brl, dataCompleta, fmtTelefone, isoDia, precoDoServico, semAcento } from "@/lib/gestao/util";
import FormAgendamento from "../agenda/form-agendamento";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, Campo, Folha, mensagemDeErro, ok, useAvisos, useDados, useSomenteLeitura, Vazio, Esqueleto } from "../ui";
import { BuscaProduto, LinhaDaConta, novaChave, useProdutosDaLoja, type ItemConta } from "./conta";
import { CampoDinheiro, fmtQtd } from "./pecas";
import VendaBalcao, { EscolherTutor, type Tutor } from "./venda";
import "./orcamento.css";

/**
 * Orçamento (migração 20261200): monta, manda no WhatsApp (texto arrumado e o link da página /gestao/orcamento/<código>),
 * marca como aceito e "Transformar em venda" (a venda normal já preenchida; serviço vira horário na agenda). Nada sai do
 * estoque até virar venda. Só para quem mexe com dinheiro (Caixa, Financeiro ou Relatórios): o orçamento tem preço.
 * Abre da tela Estoque (botão Orçamentos) e da ficha do cliente.
 */
export type Orcamento = {
  id: string; numero: number; cliente_id: string | null; nome: string | null; telefone: string | null; itens: ItemOrcamento[];
  subtotal: number; desconto: number; total: number; validade: string; obs: string | null; status: string; token: string;
  lancamento_id: string | null; agendamento_id: string | null; convertido_em: string | null; criado_em: string;
};
const COLS = "id, numero, cliente_id, nome, telefone, itens, subtotal, desconto, total, validade, obs, status, token, lancamento_id, agendamento_id, convertido_em, criado_em";

type Tela =
  | { t: "lista" }
  | { t: "editar"; o?: Orcamento | null }
  | { t: "ver"; id: string }
  | { t: "venda"; o: Orcamento; tutor: Tutor | null }
  | { t: "horario"; o: Orcamento; pet: PetComTutor | null };

const FILTROS: { id: "todos" | StatusOrcamento; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" }, { id: "aberto", rotulo: "Abertos" }, { id: "aceito", rotulo: "Aceitos" },
  { id: "vencido", rotulo: "Vencidos" }, { id: "convertido", rotulo: "Viraram venda" },
];

const origem = () => (typeof window === "undefined" ? "" : window.location.origin);

/** Lista, edição, envio e conversão dos orçamentos. Com `cliente`, só os dele e o novo já vem com ele. */
export default function Orcamentos({ cliente, aoFechar, comecarNovo }: { cliente?: Tutor | null; aoFechar: () => void; comecarNovo?: boolean }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [tela, setTela] = useState<Tela>(comecarNovo ? { t: "editar" } : { t: "lista" });
  const lista = useDados(async () => {
    let q = sb.from("orcamentos").select(COLS).eq("petshop_id", petshop.id);
    if (cliente) q = q.eq("cliente_id", cliente.id);
    const r = await q.order("criado_em", { ascending: false }).order("id").limit(500);
    if (r.error) throw new Error(r.error.message);
    const linhas = (r.data ?? []) as unknown as Orcamento[];
    const ids = [...new Set(linhas.map((o) => o.cliente_id).filter((x): x is string => Boolean(x)))];
    const tutores = new Map<string, Tutor>();
    for (let i = 0; i < ids.length; i += 150) {
      const t = await sb.from("clientes").select("id, nome, telefone").eq("petshop_id", petshop.id).in("id", ids.slice(i, i + 150));
      for (const c of t.data ?? []) tutores.set(c.id, c);
    }
    return { linhas, tutores };
  }, [petshop.id, cliente?.id ?? ""]);

  const tutorDe = (o: Orcamento): Tutor | null => (o.cliente_id ? lista.dados?.tutores.get(o.cliente_id) ?? (cliente?.id === o.cliente_id ? cliente : null) : null);
  const voltar = () => { setTela({ t: "lista" }); void lista.recarregar(); };

  // "Transformar em venda": produtos → a venda do balcão; serviços → o horário (depois da venda, se tiver os dois)
  async function converter(o: Orcamento) {
    if (temProduto(o.itens)) { setTela({ t: "venda", o, tutor: tutorDe(o) }); return; }
    await abrirHorario(o);
  }
  async function abrirHorario(o: Orcamento) {
    let pet: PetComTutor | null = null;
    if (o.cliente_id) {
      const r = await sb.from("pets").select("*, clientes(id, nome, telefone)").eq("petshop_id", petshop.id).eq("cliente_id", o.cliente_id).eq("ativo", true).limit(2);
      if (!r.error && r.data?.length === 1) pet = r.data[0] as unknown as PetComTutor;
    }
    setTela({ t: "horario", o, pet });
  }

  if (tela.t === "venda") {
    const o = tela.o;
    const rep = repartirDesconto(o.itens, Number(o.desconto));
    const itens: ItemConta[] = o.itens.filter((i) => i.tipo === "produto").map((i) => ({
      chave: novaChave(), tipo: "produto", nome: i.nome, qtd: Number(i.qtd), valor: Number(i.valor), produtoId: i.produto_id,
    }));
    return (
      <VendaBalcao orcamento={{ id: o.id, numero: o.numero }} inicial={{ itens, tutor: tela.tutor, desconto: rep.descontoProdutos > 0 ? rep.descontoProdutos : null }}
        aoFechar={() => { if (tela.t === "venda") voltar(); }}
        aoPronto={() => {
          avisarMudanca();
          if (temServico(o.itens)) { avisar("Venda anotada. Agora marque o horário dos serviços do orçamento."); void abrirHorario(o); }
          else { avisar(`O orçamento nº ${o.numero} virou venda.`); voltar(); }
        }} />
    );
  }
  if (tela.t === "horario") {
    const o = tela.o;
    const rep = repartirDesconto(o.itens, Number(o.desconto));
    const servicos = rep.servicos.filter((s) => s.servicoId).map((s) => ({ servicoId: s.servicoId!, preco: s.preco }));
    return (
      <FormAgendamento petInicial={tela.pet} servicosIniciais={servicos} obsInicial={`Orçamento nº ${o.numero}`}
        aoFechar={voltar}
        aoSalvar={async (marcado) => {
          if (marcado?.id) {
            try { ok(await sb.rpc("orcamento_marcar", { p_orcamento: o.id, p_agendamento: marcado.id })); avisar(`Horário marcado. O orçamento nº ${o.numero} virou ${temProduto(o.itens) ? "venda e horário" : "horário"}.`); }
            catch (e) { avisarErro(`O horário foi marcado, mas o orçamento não ficou ligado a ele. (${mensagemDeErro(e)})`); }
          }
          avisarMudanca();
          voltar();
        }} />
    );
  }
  if (tela.t === "editar") {
    return <EditarOrcamento inicial={tela.o ?? null} cliente={tela.o ? tutorDe(tela.o) : cliente ?? null} fixo={Boolean(cliente)}
      aoFechar={() => (tela.o ? setTela({ t: "ver", id: tela.o.id }) : comecarNovo && !lista.dados?.linhas.length ? aoFechar() : voltar())}
      aoSalvo={(id) => { void lista.recarregar(); setTela({ t: "ver", id }); }} />;
  }
  if (tela.t === "ver") {
    const o = lista.dados?.linhas.find((x) => x.id === tela.id);
    if (!o) return <Folha titulo="Orçamento" aoFechar={voltar}><Esqueleto linhas={4} /></Folha>;
    return <VerOrcamento o={o} tutor={tutorDe(o)} aoFechar={voltar} aoEditar={() => setTela({ t: "editar", o })} aoConverter={() => void converter(o)} aoMudou={() => void lista.recarregar()} />;
  }
  return <ListaDeOrcamentos titulo={cliente ? `Orçamentos de ${cliente.nome.split(" ")[0]}` : "Orçamentos"} linhas={lista.dados?.linhas ?? null} erro={lista.erro}
    tutorDe={tutorDe} aoFechar={aoFechar} aoNovo={() => setTela({ t: "editar" })} aoAbrir={(o) => setTela({ t: "ver", id: o.id })} />;
}

/* ---------- lista ---------- */

function ListaDeOrcamentos({ titulo, linhas, erro, tutorDe, aoFechar, aoNovo, aoAbrir }: {
  titulo: string; linhas: Orcamento[] | null; erro: string | null; tutorDe: (o: Orcamento) => Tutor | null;
  aoFechar: () => void; aoNovo: () => void; aoAbrir: (o: Orcamento) => void;
}) {
  const somenteLeitura = useSomenteLeitura();
  const [filtro, setFiltro] = useState<"todos" | StatusOrcamento>("todos");
  const [q, setQ] = useState("");
  const hoje = isoDia(new Date());
  const comStatus = useMemo(() => (linhas ?? []).map((o) => ({ o, s: statusDoOrcamento(o, hoje) })), [linhas, hoje]);
  const alvo = semAcento(q);
  const nomeDe = (o: Orcamento) => tutorDe(o)?.nome ?? o.nome ?? "";
  const vistos = comStatus.filter(({ o, s }) => (filtro === "todos" || s === filtro)
    && (!alvo || semAcento(nomeDe(o)).includes(alvo) || String(o.numero) === alvo.replace(/\D/g, "") || o.itens.some((i) => semAcento(i.nome).includes(alvo))));
  const conta = (s: StatusOrcamento) => comStatus.filter((x) => x.s === s).length;
  const abertos = comStatus.filter((x) => x.s === "aberto" || x.s === "aceito");
  const emAberto = abertos.reduce((t, x) => t + Number(x.o.total), 0);
  return (
    <Folha larga titulo={titulo} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => { if (!somenteLeitura()) aoNovo(); }}><Plus />Orçamento novo</button>
      </>}>
      {erro ? <p className="g-vermelho-t">{erro}</p> : !linhas ? <Esqueleto linhas={4} /> : !linhas.length ? (
        <Vazio titulo="Nenhum orçamento ainda" texto="Monte com produtos e serviços, mande no WhatsApp e, quando o cliente topar, transforme em venda num toque. Nada sai do estoque antes disso." />
      ) : (
        <div className="g-pilha">
          <p className="g-muted g-pp">{abertos.length ? `${abertos.length} ${abertos.length === 1 ? "orçamento valendo" : "orçamentos valendo"}, ${brl(emAberto)} no total.` : "Nenhum orçamento valendo agora."}</p>
          <div className="g-busca"><Search /><input className="g-input" placeholder="Buscar pelo cliente, número ou item" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar orçamento" /></div>
          <div className="g-chips" role="group" aria-label="Filtrar orçamentos">
            {FILTROS.map((f) => {
              const n = f.id === "todos" ? comStatus.length : conta(f.id);
              return <button key={f.id} type="button" className="g-chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.rotulo}{n ? ` (${n})` : ""}</button>;
            })}
          </div>
          {!vistos.length ? <p className="g-muted g-centro" style={{ padding: "20px 8px" }}>Nenhum orçamento com esse filtro.</p> : (
            <div className="g-lista">
              {vistos.map(({ o, s }) => (
                <button key={o.id} type="button" className="g-linha" onClick={() => aoAbrir(o)}>
                  <Tile icone={FileText} tom="manteiga" tamanho="p" />
                  <span className="t">
                    <b>Nº {o.numero}{nomeDe(o) ? ` · ${nomeDe(o)}` : ""}</b>
                    <span>{o.itens.length === 1 ? o.itens[0].nome : `${o.itens.length} itens`} · {s === "convertido" ? `virou venda${o.convertido_em ? ` em ${dataCompleta(o.convertido_em)}` : ""}` : fraseDaValidade(o.validade, hoje)}</span>
                  </span>
                  <span className="d g-orc-d"><b>{brl(o.total)}</b><span className={`g-tag ${STATUS_ORCAMENTO[s].tom}`}>{STATUS_ORCAMENTO[s].rotulo}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Folha>
  );
}

/* ---------- ver, mandar, converter ---------- */

function VerOrcamento({ o, tutor, aoFechar, aoEditar, aoConverter, aoMudou }: {
  o: Orcamento; tutor: Tutor | null; aoFechar: () => void; aoEditar: () => void; aoConverter: () => void; aoMudou: () => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [ocupado, setOcupado] = useState(false);
  const s = statusDoOrcamento(o);
  const link = linkDoOrcamento(origem(), o.token);
  const para = tutor?.nome ?? o.nome;
  const texto = textoDoOrcamento({ loja: petshop.nome, numero: o.numero, para, itens: o.itens, desconto: Number(o.desconto), validade: o.validade, link });
  const zap = zapDoOrcamento(tutor?.telefone ?? o.telefone, texto);
  const convertido = s === "convertido";

  async function mudarStatus(status: "aberto" | "aceito") {
    if (somenteLeitura() || ocupado) return;
    setOcupado(true);
    try { ok(await sb.from("orcamentos").update({ status }).eq("id", o.id).eq("petshop_id", petshop.id).select("id")); avisar(status === "aceito" ? "Marcado como aceito." : "Voltou para aberto."); aoMudou(); avisarMudanca(); }
    catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }
  async function apagar() {
    if (somenteLeitura() || ocupado) return;
    if (!(await confirmar({ titulo: `Apagar o orçamento nº ${o.numero}?`, texto: "O link que você mandou para o cliente para de abrir. Não dá para desfazer.", confirmar: "Apagar", perigo: true }))) return;
    setOcupado(true);
    try {
      const r = ok(await sb.from("orcamentos").delete().eq("id", o.id).eq("petshop_id", petshop.id).select("id"));
      if (!r.length) throw new Error("Não deu para apagar. Ele pode já ter virado venda.");
      avisar("Orçamento apagado."); avisarMudanca(); aoFechar();
    } catch (e) { avisarErro(e); setOcupado(false); }
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(link); avisar("Link copiado."); } catch { avisarErro("Não consegui copiar. Segure no link para copiar."); }
  }

  return (
    <Folha titulo={`Orçamento nº ${o.numero}`} aoFechar={aoFechar}
      rodape={convertido ? <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button> : <>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" disabled={ocupado} onClick={() => { if (!somenteLeitura()) aoConverter(); }}><Wand2 />Transformar em {temProduto(o.itens) ? "venda" : "horário"}</button>
      </>}>
      <div className="g-pilha">
        <div className="g-orc-cab">
          <div>
            <span className={`g-tag ${STATUS_ORCAMENTO[s].tom}`}>{STATUS_ORCAMENTO[s].rotulo}</span>
            <b>{para ?? "Sem cliente"}</b>
            <span className="g-muted g-pp">{convertido ? `Virou ${o.lancamento_id ? "venda" : "horário"}${o.convertido_em ? ` em ${dataCompleta(o.convertido_em)}` : ""}` : fraseDaValidade(o.validade)}{(tutor?.telefone ?? o.telefone) ? ` · ${fmtTelefone(tutor?.telefone ?? o.telefone)}` : ""}</span>
          </div>
          <p className="g-num">{brl(o.total)}</p>
        </div>
        <div className="g-card liso g-orc-itens">
          {o.itens.map((i, n) => (
            <div key={n} className="g-orc-item">
              <span className="t"><b>{i.nome}</b><span>{i.tipo === "servico" ? "Serviço" : "Produto"}{i.qtd !== 1 ? ` · ${fmtQtd(i.qtd)} × ${brl(i.valor)}` : ""}</span></span>
              <b className="g-tab">{brl(Math.round(i.qtd * i.valor * 100) / 100)}</b>
            </div>
          ))}
          {Number(o.desconto) > 0 && <div className="g-orc-item menos"><span className="t"><span>Soma {brl(o.subtotal)} · desconto</span></span><b className="g-tab">− {brl(o.desconto)}</b></div>}
        </div>
        {o.obs && <p className="g-pp g-muted" style={{ whiteSpace: "pre-line" }}>{o.obs}</p>}
        {!convertido && (
          <>
            <div className="g-orc-mandar">
              <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => { if (o.status === "aberto") avisar("Quando o cliente responder, marque como aceito ou transforme em venda."); }}><MessageCircle />Mandar no WhatsApp</a>
              <button type="button" className="g-btn sec" onClick={() => void copiar()}><Copy />Copiar link</button>
              <a className="g-btn fantasma" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink />Ver como o cliente vê</a>
            </div>
            <div className="g-fila">
              {o.status === "aceito"
                ? <button type="button" className="g-btn sec p" disabled={ocupado} onClick={() => void mudarStatus("aberto")}>Voltar para aberto</button>
                : <button type="button" className="g-btn verde p" disabled={ocupado} onClick={() => void mudarStatus("aceito")}><Check />Cliente aceitou</button>}
              <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) aoEditar(); }}><Pencil />Editar</button>
              <button type="button" className="g-btn perigo p" disabled={ocupado} onClick={() => void apagar()}><Trash2 />Apagar</button>
            </div>
            <p className="g-muted g-pp">Nada sai do estoque enquanto é orçamento. {temProduto(o.itens) && temServico(o.itens) ? "Transformar abre a venda dos produtos e depois o horário dos serviços, com o desconto repartido." : temServico(o.itens) ? "Transformar abre o horário na agenda com os serviços e os valores." : "Transformar abre a venda já preenchida: é só receber."}</p>
          </>
        )}
      </div>
    </Folha>
  );
}

/* ---------- montar ---------- */

const doOrcamento = (i: ItemOrcamento): ItemConta => ({ chave: novaChave(), tipo: i.tipo, nome: i.nome, qtd: Number(i.qtd), valor: Number(i.valor), produtoId: i.produto_id, servicoId: i.servico_id });

function EditarOrcamento({ inicial, cliente, fixo, aoFechar, aoSalvo }: {
  inicial: Orcamento | null; cliente: Tutor | null; fixo: boolean; aoFechar: () => void; aoSalvo: (id: string) => void;
}) {
  const { sb, petshop, servicos } = useGestao();
  const { avisarErro, avisar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const { produtos, carregando, erro } = useProdutosDaLoja();
  const op = useOperacao();
  const [itens, setItens] = useState<ItemConta[]>(() => (inicial?.itens ?? []).map(doOrcamento));
  const [tutor, setTutor] = useState<Tutor | null>(cliente);
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [telefone, setTelefone] = useState(inicial?.telefone ?? "");
  const [desconto, setDesconto] = useState<number | null>(inicial && Number(inicial.desconto) > 0 ? Number(inicial.desconto) : null);
  const [validade, setValidade] = useState(inicial?.validade ?? validadePadrao());
  const [obs, setObs] = useState(inicial?.obs ?? "");
  const [erroForm, setErroForm] = useState<string | null>(null);
  const ativos = servicos.filter((s) => s.ativo);
  const linhas = itens.filter((i) => i.qtd > 0);
  const c = contaDoOrcamento(linhas.map((i) => ({ qtd: i.qtd, valor: i.valor ?? 0 })), desconto);
  const mudar = (chave: string, m: Partial<ItemConta>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...m } : i)));

  function porServico(id: string) {
    const s = ativos.find((x) => x.id === id);
    if (!s) return;
    setItens((l) => [...l, { chave: novaChave(), tipo: "servico", nome: s.nome, qtd: 1, valor: precoDoServico(s, null), servicoId: s.id }]);
  }

  const salvar = () => op.fazer(async (chave) => {
    if (somenteLeitura()) return false;
    if (!linhas.length) { setErroForm("Ponha pelo menos um produto ou serviço."); return false; }
    if (linhas.some((i) => i.valor == null)) { setErroForm("Falta o valor de algum item."); return false; }
    if ((desconto ?? 0) > c.subtotal) { setErroForm("O desconto não passa da soma."); return false; }
    if (!validade || validade < isoDia(new Date())) { setErroForm("A validade é de hoje em diante."); return false; }
    setErroForm(null);
    const dados = {
      cliente_id: tutor?.id ?? null, nome: tutor ? null : nome.trim() || null, telefone: tutor ? null : telefone.trim() || null,
      itens: linhas.map((i) => ({ tipo: i.tipo === "servico" ? "servico" : "produto", nome: i.nome.trim(), qtd: i.qtd, valor: i.valor ?? 0,
        ...(i.produtoId ? { produto_id: i.produtoId } : {}), ...(i.servicoId ? { servico_id: i.servicoId } : {}) })),
      desconto: desconto ?? 0, validade, obs: obs.trim() || null,
    };
    try {
      if (inicial) {
        ok(await sb.from("orcamentos").update(dados as never).eq("id", inicial.id).eq("petshop_id", petshop.id).select("id"));
        avisar("Orçamento salvo."); avisarMudanca(); aoSalvo(inicial.id);
      } else {
        // a chave da folha: dois toques (ou a internet repetindo) não criam dois orçamentos
        const r = await sb.from("orcamentos").insert({ ...dados, petshop_id: petshop.id, chave } as never).select("id").single();
        let id = r.data?.id as string | undefined;
        if (r.error) {
          if (r.error.code !== "23505") throw new Error(r.error.message);
          id = ok(await sb.from("orcamentos").select("id").eq("petshop_id", petshop.id).eq("chave", chave).single()).id;
        }
        avisar("Orçamento pronto. Mande no WhatsApp."); avisarMudanca(); aoSalvo(id!);
      }
      return true;
    } catch (e) { avisarErro(e); return false; }
  });

  return (
    <Folha larga titulo={inicial ? `Editar orçamento nº ${inicial.numero}` : "Orçamento novo"} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" disabled={op.ocupado || !linhas.length} onClick={() => void salvar()}>{op.ocupado ? "Salvando…" : `Salvar orçamento${c.total > 0 ? ` de ${brl(c.total)}` : ""}`}</button>
      </>}>
      <div className="g-form">
        {fixo && tutor ? <Campo rotulo="Cliente"><p className="g-p">{tutor.nome}</p></Campo>
          : <EscolherTutor valor={tutor} aoMudar={setTutor} />}
        {!tutor && (
          <div className="dupla">
            <Campo rotulo="Nome de quem pediu (se quiser)"><input className="g-input" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Paula" /></Campo>
            <Campo rotulo="WhatsApp (se quiser)"><input className="g-input" value={telefone} maxLength={30} inputMode="tel" onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 98888-0000" /></Campo>
          </div>
        )}

        <BuscaProduto produtos={produtos} carregando={carregando} erro={erro} itens={itens}
          aoEscolher={(p) => setItens((l) => (l.some((i) => i.produtoId === p.id) ? l.map((i) => (i.produtoId === p.id ? { ...i, qtd: i.qtd + 1 } : i))
            : [...l, { chave: novaChave(), tipo: "produto", nome: p.nome, qtd: 1, valor: p.preco_venda == null ? null : Number(p.preco_venda), produtoId: p.id, unidade: p.unidade }]))} />
        {ativos.length > 0 && (
          <Campo rotulo="Pôr um serviço">
            <select className="g-select" value="" onChange={(e) => { porServico(e.target.value); e.target.value = ""; }} aria-label="Pôr um serviço no orçamento">
              <option value="">Escolha o serviço…</option>
              {ativos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </Campo>
        )}

        <div className="g-card liso g-vd-itens">
          {itens.length ? itens.map((i) => (
            <LinhaDaConta key={i.chave} item={i} produto={produtos.find((p) => p.id === i.produtoId)} apoio="Serviço (o valor muda com o porte: confira)"
              aoMudar={(m) => mudar(i.chave, m)} aoTirar={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} />
          )) : <p className="g-vd-nada">Busque um produto ou escolha um serviço.</p>}
        </div>

        <div className="dupla">
          <label className="g-campo">
            <span>Desconto em reais (se tiver)</span>
            <CampoDinheiro valor={desconto} aoMudar={setDesconto} rotulo="Desconto do orçamento" />
          </label>
          <Campo rotulo="Vale até">
            <input type="date" className="g-input" value={validade} min={isoDia(new Date())} onChange={(e) => setValidade(e.target.value)} aria-label="Validade do orçamento" />
          </Campo>
        </div>
        <Campo rotulo="Observação para o cliente (se quiser)">
          <textarea className="g-textarea" rows={2} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: preço à vista no Pix; entrega no sábado" />
        </Campo>
        {erroForm && <small className="erro" role="alert">{erroForm}</small>}

        <div className="g-vd-total" role="status">
          <div><span className="g-rotulo">Total</span><p className="g-num">{brl(c.total)}</p></div>
          {c.desconto > 0 && <div className="g-vd-contas g-tab"><span>Soma {brl(c.subtotal)}</span><span>Desconto − {brl(c.desconto)}</span></div>}
        </div>
        <p className="g-muted g-pp">O estoque não muda com o orçamento: só quando ele vira venda.</p>
      </div>
    </Folha>
  );
}

/** Cartão da ficha do cliente: os orçamentos dele e o botão para fazer um. Só para quem mexe com dinheiro. */
export function OrcamentosDoCliente({ cliente }: { cliente: Tutor }) {
  const { sb, petshop } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  const [aberto, setAberto] = useState<null | "lista" | "novo">(null);
  const { dados } = useDados(async () => {
    const r = await sb.from("orcamentos").select("id, status, validade, total").eq("petshop_id", petshop.id).eq("cliente_id", cliente.id).limit(200);
    if (r.error) return [];
    return r.data ?? [];
  }, [petshop.id, cliente.id]);
  const valendo = (dados ?? []).filter((o) => { const s = statusDoOrcamento(o); return s === "aberto" || s === "aceito"; });
  return (
    <>
      <div className="g-fila" style={{ flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setAberto("novo"); }}><FileText />Fazer orçamento</button>
        {(dados?.length ?? 0) > 0 && (
          <button type="button" className="g-btn fantasma p" onClick={() => setAberto("lista")}>
            {valendo.length ? `${valendo.length} ${valendo.length === 1 ? "orçamento valendo" : "orçamentos valendo"} (${brl(valendo.reduce((t, o) => t + Number(o.total), 0))})` : `Ver orçamentos (${dados!.length})`}
          </button>
        )}
      </div>
      {aberto && <Orcamentos cliente={cliente} comecarNovo={aberto === "novo"} aoFechar={() => setAberto(null)} />}
    </>
  );
}
