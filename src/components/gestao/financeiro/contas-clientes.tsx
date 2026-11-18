"use client";

import { useMemo, useState } from "react";
import { Check, HandCoins, MessageCircle, TriangleAlert } from "lucide-react";
import { mensagemDeDivida, multaSugerida } from "@/lib/gestao/dinheiro-opcoes";
import { dividaPorVencimento, fraseDoDisponivel, fraseDoVencimento, limiteDoCliente, type DividaPorVencimento } from "@/lib/gestao/fiado";
import { descricaoAtual } from "@/lib/gestao/dinheiro";
import type { Lancamento } from "@/lib/gestao/tipos";
import { brl, dataCompleta, dataCurta, dataCurtaOuAno, hora, isoDia, linkWhatsApp, telefoneValido } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { BarraDoLimite } from "./limite-fiado";
import { AvatarPessoa, avisarMudanca, Campo, Folha, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { categoriaAtual, FolhaBaixa, textoJaRecebido } from "./comum";
import "./recebimentos.css";

/**
 * Contas que os clientes ficaram de pagar (fiado, pacote, mensalidade, hotel), para quem recebe:
 * o cartão "Contas de clientes" do Caixa e o "Deve R$ X" da ficha do tutor. O banco deixa quem opera o caixa
 * ler só as contas em aberto de clientes (não despesas, nem o histórico).
 */

type Tutor = { id: string; nome: string; telefone: string | null; limite_fiado?: number | null };
export type Devedor = { chave: string; tutor: Tutor | null; contas: Lancamento[]; total: number; atrasado: number; desde: string; cobradoEm: string | null;
  /** O total separado por vencimento e o que conta no limite de fiado (sem a mensalidade e o sinal que ainda não venceram). */
  partes: DividaPorVencimento };

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
      const t = await sb.from("clientes").select("id, nome, telefone, limite_fiado").eq("petshop_id", petshop.id).in("id", ids.slice(i, i + 150));
      for (const c of t.data ?? []) tutores.set(c.id, c);
    }
    return { contas, tutores };
  }, [petshop.id, vejoFinanceiro, clienteId ?? ""]);
}

/** Desde quando o cliente deve esta conta: o dia anotado (dívida trazida do caderno) ou o dia em que foi anotada. */
export const desdeDaConta = (c: Pick<Lancamento, "devido_desde" | "criado_em">) => c.devido_desde ?? c.criado_em;
/** O dia (AAAA-MM-DD) de "desde": o dia anotado ou o dia em que foi anotada, no fuso do aparelho. */
const diaDe = (s: string) => (s.length === 10 ? s : isoDia(new Date(s)));

/** Junta as contas por tutor: quanto deve, quanto está atrasado, desde quando e quando foi cobrado. */
export function porDevedor(contas: Lancamento[], tutores: Map<string, Tutor>, hoje: string): Devedor[] {
  const mapa = new Map<string, Devedor>();
  for (const c of contas) {
    const chave = c.cliente_id ?? "sem";
    const d = mapa.get(chave) ?? { chave, tutor: c.cliente_id ? tutores.get(c.cliente_id) ?? null : null, contas: [], total: 0, atrasado: 0, desde: desdeDaConta(c), cobradoEm: null, partes: dividaPorVencimento([], hoje) };
    d.contas.push(c);
    d.total = centavos(d.total + Number(c.valor));
    if (c.vencimento && c.vencimento < hoje) d.atrasado = centavos(d.atrasado + Number(c.valor));
    // "2026-03-10" (dia anotado) e "2026-11-16T…" (quando foi anotada) se comparam pelo começo, que é o dia
    if (desdeDaConta(c) < d.desde) d.desde = desdeDaConta(c);
    if (c.cobrado_em && (!d.cobradoEm || c.cobrado_em > d.cobradoEm)) d.cobradoEm = c.cobrado_em;
    mapa.set(chave, d);
  }
  for (const d of mapa.values()) d.partes = dividaPorVencimento(d.contas, hoje);
  // quem deve agora (vencido ou vence hoje) primeiro; o que só tem conta a vencer vai para o fim
  return [...mapa.values()].sort((a, b) => b.atrasado - a.atrasado || (b.partes.venceHoje - a.partes.venceHoje) || b.total - a.total);
}

/**
 * Pelo vencimento (Sandra: "desde 18/11" numa conta que vence 05/12 parecia dívida velha): dívida do caderno, "deve desde 10/03";
 * conta vencida, "venceu em 15/11" (a mais antiga); "vence hoje"; senão "vence 05/12" (o vencimento mais perto).
 */
export function textoDoDesde(d: Pick<Devedor, "contas" | "desde" | "partes">, hoje: string) {
  const caderno = d.contas.map((c) => c.devido_desde).filter((v): v is string => Boolean(v)).sort()[0];
  const venceu = d.contas.map((c) => c.vencimento).filter((v): v is string => Boolean(v && v < hoje)).sort()[0];
  if (caderno && (!venceu || caderno <= venceu)) return `deve desde ${dataCurtaOuAno(caderno)}`;
  if (venceu) return `venceu em ${dataCurtaOuAno(venceu)}`;
  if (d.partes.venceHoje > 0) return "vence hoje";
  const proximo = d.contas.map((c) => c.vencimento).filter((v): v is string => Boolean(v && v > hoje)).sort()[0];
  return proximo ? `vence ${dataCurtaOuAno(proximo)}` : `desde ${dataCurtaOuAno(diaDe(d.desde))}`;
}

/** Uma conta em aberto, com o botão Recebi. */
function LinhaConta({ conta, hoje, aoReceber }: { conta: Lancamento; hoje: string; aoReceber: () => void }) {
  const { petshop } = useGestao();
  const v = conta.vencimento;
  const multa = multaSugerida(petshop, conta, hoje);
  const nome = descricaoAtual(conta.descricao) || categoriaAtual(conta.categoria, petshop);
  // dívida de antes (do caderno), sem prazo combinado depois: o que importa é desde quando deve
  const deAntes = Boolean(conta.devido_desde && (!v || v <= conta.devido_desde));
  return (
    <div className="gr-conta">
      <span className="t">
        <b>{nome}</b>
        <span>
          {deAntes ? <span className={v && v < hoje ? "g-vermelho-t" : undefined}>deve desde {dataCurtaOuAno(conta.devido_desde!)}</span>
            : !v ? "sem data" : v < hoje ? <span className="g-vermelho-t">venceu em {dataCompleta(v)}</span> : v === hoje ? "vence hoje" : `vence em ${dataCompleta(v)}`}
          {textoJaRecebido(conta) ? ` · ${textoJaRecebido(conta)}` : ""}
          {conta.devido_desde && !deAntes ? ` · deve desde ${dataCurtaOuAno(conta.devido_desde)}` : ""}
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
  const { petshop } = useGestao();
  const temZap = telefoneValido(d.tutor?.telefone);
  // limite de fiado (o do cliente ou o padrão da loja): quanto ainda cabe
  const limite = !semNome && d.tutor ? limiteDoCliente(d.tutor, petshop) : null;
  return (
    <div className="gr-devedor">
      <div className="gr-devedor-t">
        {!semNome && <AvatarPessoa nome={d.tutor?.nome ?? "?"} />}
        <span className="t">
          <b>{semNome ? `Deve ${brl(d.total)}` : d.tutor?.nome ?? "Sem tutor na conta"}</b>
          <span>
            {semNome ? "" : `Deve ${brl(d.total)} · `}{d.contas.length === 1 ? "1 conta" : `${d.contas.length} contas`} · {textoDoDesde(d, hoje)}
            {d.cobradoEm ? ` · cobrado em ${quandoFoi(d.cobradoEm)}` : ""}
          </span>
          {/* separado pelo vencimento: o que já venceu, o que vence hoje e o que ainda vai vencer */}
          {(d.partes.aVencer > 0 || d.partes.vencido > 0) && d.partes.total > 0 && <span className="g-pp g-muted">{fraseDoVencimento(d.partes)}</span>}
        </span>
        {d.atrasado > 0 && <span className="g-tag vermelho"><TriangleAlert size={12} aria-hidden />{brl(d.atrasado)} em atraso</span>}
      </div>
      {limite != null && (
        <div className="g-orc-limite">
          <span>{fraseDoDisponivel(d.partes.noLimite, limite)}{d.partes.foraDoLimite > 0 ? ` (sem ${brl(d.partes.foraDoLimite)} de mensalidade ou sinal que ainda não venceram)` : ""}</span>
          <BarraDoLimite deve={d.partes.noLimite} limite={limite} />
        </div>
      )}
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
  const partesDoTotal = useMemo(() => dividaPorVencimento(dados?.contas.filter((c) => c.cliente_id || c.agendamento_id) ?? [], hoje), [dados, hoje]);
  const visiveis = todos ? devedores : devedores.slice(0, 5);
  const alvo = cobrando ? devedores.find((d) => d.chave === cobrando) : null;
  const mudou = async () => { await recarregar(); await aoMudar?.(); };

  return (
    <section id="contas-clientes" className={`g-card gr-card${largo ? " largo" : ""}`} aria-label="Contas de clientes">
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
            {partesDoTotal.aVencer > 0 && <p className="g-pp" style={{ margin: 0 }}><b>{fraseDoVencimento(partesDoTotal)}</b>. Mensalidade da creche e sinal de reserva que ainda vão vencer não contam no limite de fiado até vencer; fiado e taxa de falta contam, mesmo com prazo.</p>}
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
