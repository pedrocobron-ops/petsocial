"use client";

import { useMemo, useState } from "react";
import { Check, HandCoins, MessageCircle, TriangleAlert } from "lucide-react";
import { mensagemDeDivida, multaSugerida } from "@/lib/gestao/dinheiro-opcoes";
import type { Lancamento } from "@/lib/gestao/tipos";
import { brl, dataCompleta, dataCurta, hora, isoDia, linkWhatsApp, telefoneValido } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvatarPessoa, avisarMudanca, Campo, Folha, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { categoriaAtual, FolhaBaixa, textoJaRecebido } from "./comum";
import "./recebimentos.css";

/**
 * Contas que os clientes ficaram de pagar (fiado, pacote, mensalidade, hotel), para quem recebe:
 * o cartão "Contas de clientes" do Caixa e o "Deve R$ X" da ficha do tutor. O banco deixa quem opera o caixa
 * ler só as contas em aberto de clientes (não despesas, nem o histórico).
 */

type Tutor = { id: string; nome: string; telefone: string | null };
export type Devedor = { chave: string; tutor: Tutor | null; contas: Lancamento[]; total: number; atrasado: number; desde: string; cobradoEm: string | null };

const centavos = (n: number) => Math.round(n * 100) / 100;
const quandoFoi = (iso: string) => `${dataCurta(iso)} às ${hora(iso)}`;

/** As contas em aberto de clientes: de todos, ou de um tutor só. */
export function useContasDeClientes(clienteId?: string) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  return useDados(async () => {
    if (!vejoFinanceiro) return { contas: [] as Lancamento[], tutores: new Map<string, Tutor>() };
    let q = sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", false).eq("tipo", "entrada");
    q = clienteId ? q.eq("cliente_id", clienteId) : q.or("cliente_id.not.is.null,agendamento_id.not.is.null");
    const r = await q.order("vencimento", { ascending: true, nullsFirst: false }).order("id").limit(1000);
    if (r.error) throw new Error(r.error.message);
    const contas: Lancamento[] = r.data ?? [];
    const ids = [...new Set(contas.map((c) => c.cliente_id).filter((x): x is string => Boolean(x)))];
    const tutores = new Map<string, Tutor>();
    for (let i = 0; i < ids.length; i += 150) {
      const t = await sb.from("clientes").select("id, nome, telefone").eq("petshop_id", petshop.id).in("id", ids.slice(i, i + 150));
      for (const c of t.data ?? []) tutores.set(c.id, c);
    }
    return { contas, tutores };
  }, [petshop.id, vejoFinanceiro, clienteId ?? ""]);
}

/** Junta as contas por tutor: quanto deve, quanto está atrasado, desde quando e quando foi cobrado. */
export function porDevedor(contas: Lancamento[], tutores: Map<string, Tutor>, hoje: string): Devedor[] {
  const mapa = new Map<string, Devedor>();
  for (const c of contas) {
    const chave = c.cliente_id ?? "sem";
    const d = mapa.get(chave) ?? { chave, tutor: c.cliente_id ? tutores.get(c.cliente_id) ?? null : null, contas: [], total: 0, atrasado: 0, desde: c.criado_em, cobradoEm: null };
    d.contas.push(c);
    d.total = centavos(d.total + Number(c.valor));
    if (c.vencimento && c.vencimento < hoje) d.atrasado = centavos(d.atrasado + Number(c.valor));
    if (c.criado_em < d.desde) d.desde = c.criado_em;
    if (c.cobrado_em && (!d.cobradoEm || c.cobrado_em > d.cobradoEm)) d.cobradoEm = c.cobrado_em;
    mapa.set(chave, d);
  }
  return [...mapa.values()].sort((a, b) => b.atrasado - a.atrasado || b.total - a.total);
}

/** Uma conta em aberto, com o botão Recebi. */
function LinhaConta({ conta, hoje, aoReceber }: { conta: Lancamento; hoje: string; aoReceber: () => void }) {
  const { petshop } = useGestao();
  const v = conta.vencimento;
  const multa = multaSugerida(petshop, conta, hoje);
  const nome = conta.descricao?.trim() || categoriaAtual(conta.categoria);
  return (
    <div className="gr-conta">
      <span className="t">
        <b>{nome}</b>
        <span>
          {!v ? "sem data" : v < hoje ? <span className="g-vermelho-t">venceu em {dataCompleta(v)}</span> : v === hoje ? "vence hoje" : `vence em ${dataCompleta(v)}`}
          {textoJaRecebido(conta) ? ` · ${textoJaRecebido(conta)}` : ""}
          {multa ? ` · com multa e juros: ${brl(centavos(Number(conta.valor) + multa.total))}` : ""}
        </span>
      </span>
      <b className="g-tab v">{brl(conta.valor)}</b>
      <button type="button" className="g-btn p verde" onClick={aoReceber} aria-label={`Recebi: ${nome}`}><Check />Recebi</button>
    </div>
  );
}

/** O que um tutor deve: total, contas e os dois botões (Recebi em cada conta, Cobrar no WhatsApp no total). */
function BlocoDevedor({ d, hoje, aoReceber, aoCobrar, semNome }: { d: Devedor; hoje: string; aoReceber: (c: Lancamento) => void; aoCobrar: () => void; semNome?: boolean }) {
  const temZap = telefoneValido(d.tutor?.telefone);
  return (
    <div className="gr-devedor">
      <div className="gr-devedor-t">
        {!semNome && <AvatarPessoa nome={d.tutor?.nome ?? "?"} />}
        <span className="t">
          <b>{semNome ? `Deve ${brl(d.total)}` : d.tutor?.nome ?? "Sem tutor na conta"}</b>
          <span>
            {semNome ? "" : `Deve ${brl(d.total)} · `}{d.contas.length === 1 ? "1 conta" : `${d.contas.length} contas`} · desde {dataCurta(d.desde)}
            {d.cobradoEm ? ` · cobrado em ${quandoFoi(d.cobradoEm)}` : ""}
          </span>
        </span>
        {d.atrasado > 0 && <span className="g-tag vermelho"><TriangleAlert size={12} aria-hidden />{brl(d.atrasado)} em atraso</span>}
      </div>
      <div className="gr-contas">
        {d.contas.map((c) => <LinhaConta key={c.id} conta={c} hoje={hoje} aoReceber={() => aoReceber(c)} />)}
      </div>
      {d.tutor && (
        <div className="gr-devedor-pe">
          {temZap
            ? <button type="button" className="g-btn zap p" onClick={aoCobrar}><MessageCircle />{d.cobradoEm ? "Cobrar de novo no WhatsApp" : "Cobrar no WhatsApp"}</button>
            : <span className="g-muted g-pp">Sem WhatsApp na ficha para mandar a cobrança.</span>}
        </div>
      )}
    </div>
  );
}

/** Cartão "Contas de clientes" da tela Caixa. */
export function ContasDeClientes({ aoMudar, largo }: { aoMudar?: () => void | Promise<void>; largo?: boolean }) {
  const { dados, erro, recarregar } = useContasDeClientes();
  const somenteLeitura = useSomenteLeitura();
  const hoje = isoDia(new Date());
  const [baixando, setBaixando] = useState<Lancamento | null>(null);
  const [cobrando, setCobrando] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const devedores = useMemo(() => porDevedor(dados?.contas ?? [], dados?.tutores ?? new Map(), hoje), [dados, hoje]);
  const total = centavos(devedores.reduce((s, d) => s + d.total, 0));
  const visiveis = todos ? devedores : devedores.slice(0, 5);
  const alvo = cobrando ? devedores.find((d) => d.chave === cobrando) : null;
  const mudou = async () => { await recarregar(); await aoMudar?.(); };

  return (
    <section className={`g-card gr-card${largo ? " largo" : ""}`} aria-label="Contas de clientes">
      <div className="g-card-t">
        <h3><Tile icone={HandCoins} tom="manteiga" tamanho="p" />Contas de clientes</h3>
        {devedores.length > 0 && <b className="g-tab">{brl(total)}</b>}
      </div>
      {erro ? <p className="g-muted g-p">{erro}</p>
        : !dados ? <p className="g-muted g-p">Carregando…</p>
        : !devedores.length ? <p className="g-muted g-p">Ninguém está devendo. Quando um cliente ficar de pagar depois, a conta aparece aqui.</p>
        : (
          <>
            <p className="g-muted g-pp" style={{ marginBottom: 4 }}>
              {devedores.length === 1 ? "1 cliente ficou de pagar depois." : `${devedores.length} clientes ficaram de pagar depois.`} Quando pagar, toque em Recebi: pode ser o valor todo ou só uma parte.
            </p>
            {visiveis.map((d) => (
              <BlocoDevedor key={d.chave} d={d} hoje={hoje} aoReceber={(c) => { if (!somenteLeitura()) setBaixando(c); }} aoCobrar={() => setCobrando(d.chave)} />
            ))}
            {devedores.length > 5 && (
              <div><button type="button" className="g-btn fantasma p" onClick={() => setTodos((v) => !v)}>{todos ? "Mostrar menos" : `Ver todos (${devedores.length})`}</button></div>
            )}
          </>
        )}
      {baixando && <FolhaBaixa conta={baixando} aoFechar={() => setBaixando(null)} aoSalvo={mudou} />}
      {alvo?.tutor && <FolhaCobrar tutor={alvo.tutor} contas={alvo.contas} aoFechar={() => setCobrando(null)} aoCobrado={mudou} />}
    </section>
  );
}

/** Na ficha do tutor: "Deve R$ X", a lista, Recebi e Cobrar no WhatsApp. Não aparece quando ele não deve nada. */
export function DividaDoTutor({ tutor, aoMudar }: { tutor: Tutor; aoMudar?: () => void | Promise<void> }) {
  const { dados, recarregar } = useContasDeClientes(tutor.id);
  const somenteLeitura = useSomenteLeitura();
  const hoje = isoDia(new Date());
  const [baixando, setBaixando] = useState<Lancamento | null>(null);
  const [cobrando, setCobrando] = useState(false);
  const d = useMemo(() => porDevedor(dados?.contas ?? [], new Map([[tutor.id, tutor]]), hoje)[0], [dados, hoje, tutor]);
  if (!d) return null;
  const mudou = async () => { await recarregar(); await aoMudar?.(); };
  return (
    <section className="g-card gr-card gr-ficha" aria-label={`O que ${tutor.nome} deve`}>
      <div className="g-card-t"><h3><Tile icone={HandCoins} tom="manteiga" tamanho="p" />Ficou de pagar</h3></div>
      <BlocoDevedor d={d} hoje={hoje} semNome aoReceber={(c) => { if (!somenteLeitura()) setBaixando(c); }} aoCobrar={() => setCobrando(true)} />
      {baixando && <FolhaBaixa conta={baixando} aoFechar={() => setBaixando(null)} aoSalvo={mudou} />}
      {cobrando && <FolhaCobrar tutor={tutor} contas={d.contas} aoFechar={() => setCobrando(false)} aoCobrado={mudou} />}
    </section>
  );
}

/**
 * Cobrar no WhatsApp: a mensagem vem pronta (o que está em aberto, as datas e o total), a pessoa muda o que quiser
 * e um toque abre o WhatsApp do tutor. Quem manda é ela: nada sai sozinho. Fica anotado quando foi cobrado.
 */
export function FolhaCobrar({ tutor, contas, aoFechar, aoCobrado }: { tutor: Tutor; contas: Lancamento[]; aoFechar: () => void; aoCobrado?: () => void | Promise<void> }) {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const hoje = isoDia(new Date());
  const [texto, setTexto] = useState(() => mensagemDeDivida(petshop, tutor.nome, contas, hoje));
  const ultima = contas.map((c) => c.cobrado_em).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const link = linkWhatsApp(tutor.telefone, texto);

  async function anotar() {
    // anota depois de abrir o WhatsApp: a mensagem não espera o banco
    const r = await sb.from("lancamentos").update({ cobrado_em: new Date().toISOString() }).eq("petshop_id", petshop.id).eq("pago", false).in("id", contas.map((c) => c.id)).select("id");
    if (r.error) avisarErro("A mensagem abriu, mas não consegui anotar que a cobrança foi mandada.");
    await aoCobrado?.();
    avisarMudanca();
    aoFechar();
  }

  return (
    <Folha titulo={`Cobrar ${tutor.nome}`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        {link
          ? <a className="g-btn zap" href={link} target="_blank" rel="noopener noreferrer" onClick={() => void anotar()}><MessageCircle />Abrir o WhatsApp</a>
          : <button type="button" className="g-btn zap" disabled><MessageCircle />Abrir o WhatsApp</button>}
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">A mensagem já vem pronta. Mude o que quiser: o WhatsApp abre com este texto e você aperta enviar.</p>
        <Campo rotulo="Mensagem">
          <textarea className="g-textarea gr-msg" value={texto} rows={11} maxLength={1500} onChange={(e) => setTexto(e.target.value)} aria-label="Mensagem de cobrança" />
        </Campo>
        <p className="g-muted g-pp">
          {ultima ? `Última cobrança: ${quandoFoi(ultima)}. ` : ""}O modelo desta mensagem e a chave Pix ficam em Meu pet shop, Opções de cobrança.
        </p>
      </div>
    </Folha>
  );
}
