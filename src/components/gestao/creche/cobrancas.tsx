"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ban, CalendarClock, Check, ChevronLeft, ChevronRight, CircleCheck, HandCoins, MessageCircle, Pencil, RotateCcw, TriangleAlert, Undo2 } from "lucide-react";
import {
  cobraNoMes, estadoDaCobranca, extrasDaCobranca, faltaDaCobranca, isoMes, mensagemDeCobranca, partesDosExtras, proporcionalDesde, SELECT_COBRANCA, sugestaoDoMes, taxasDaCobranca, textoDasDatas, textoDasTaxas, vencimentoDoMes,
  type CobrancaCompleta, type EstadoCobranca, type PlanoCompleto, type PrimeiraCobranca,
} from "@/lib/gestao/creche";
import { conferirCaixa, parteDaChave, receberConta, textoDoPagamento, type FormaPagamento } from "@/lib/gestao/dinheiro";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { multaSugerida, regraDaMulta } from "@/lib/gestao/dinheiro-opcoes";
import { AvisoCaixaFechado, ChipsForma, useCaixaAberto } from "../loja/pecas";
import type { Lancamento } from "@/lib/gestao/tipos";
import { brl, dataCompleta, dataCurta, deIsoDia, fmtTelefone, isoDia, linkWhatsApp, nomeMes } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { FolhaBaixa } from "../financeiro/comum";
import { Kpi } from "../painel";
import { AvatarPessoa, AvatarPet, avisarMudanca, Campo, CampoValor, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import "./creche.css";
import "@/components/gestao/hotel/hotel.css";

const centavos = (n: number) => Math.round(n * 100) / 100;
const BLOCOS: { id: EstadoCobranca; titulo: string; vazio?: string }[] = [
  { id: "hoje", titulo: "Vencem hoje" },
  { id: "atrasada", titulo: "Atrasadas" },
  { id: "a_vencer", titulo: "A vencer" },
  { id: "paga", titulo: "Pagas" },
];
type Grupo = { chave: string; tutor: string | null; telefone: string | null; cobrancas: CobrancaCompleta[]; total: number };

/** "novembro de 2026" */
const mesComAno = (d: Date) => `${nomeMes(d)} de ${d.getFullYear()}`;

/** Junta as cobranças por tutor: irmãos numa mensagem só. */
function porTutor(lista: CobrancaCompleta[]): Grupo[] {
  const mapa = new Map<string, Grupo>();
  for (const c of lista) {
    const t = c.pets?.clientes;
    const chave = t?.id ?? `pet-${c.pet_id}`;
    const g = mapa.get(chave) ?? { chave, tutor: t?.nome ?? null, telefone: t?.telefone ?? null, cobrancas: [], total: 0 };
    g.cobrancas.push(c);
    // o total do tutor é o que ainda falta receber (mensalidade com parte já paga entra só com o resto)
    g.total = centavos(g.total + (c.lancamentos?.pago ? Number(c.total) : faltaDaCobranca(c)));
    mapa.set(chave, g);
  }
  return [...mapa.values()].sort((a, b) => (a.cobrancas[0].vencimento).localeCompare(b.cobrancas[0].vencimento) || (a.tutor ?? "").localeCompare(b.tutor ?? "", "pt-BR"));
}

/**
 * Cobranças das mensalidades (só para quem vê o financeiro): gera as cobranças do mês, mostra o que vence hoje, o que atrasou,
 * o que ainda vai vencer e o que já foi pago, e abre o WhatsApp com a mensagem pronta. Receber usa a baixa de sempre do Financeiro.
 */
export default function Cobrancas({ planos, gerar, aoFecharGerar, aoMes }: {
  planos: PlanoCompleto[]; gerar: boolean; aoFecharGerar: () => void; aoMes: (mes: Date) => void;
}) {
  const { sb, petshop, liberado } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const agora = new Date(), hoje = isoDia(agora);
  const [mes, setMes] = useState(() => new Date(agora.getFullYear(), agora.getMonth(), 1));
  const [baixando, setBaixando] = useState<Lancamento | null>(null);
  const [editando, setEditando] = useState<CobrancaCompleta | null>(null);
  const [mensagem, setMensagem] = useState<Grupo | null>(null);
  const [cobrados, setCobrados] = useState<Record<string, string>>({});
  // receber de uma vez todas as mensalidades de um tutor, e marcar de uma vez as que foram pagas por fora do sistema
  const [familia, setFamilia] = useState<Grupo | null>(null);
  const [porFora, setPorFora] = useState(false);
  const mesIso = isoMes(mes);
  useEffect(() => { aoMes(mes); }, [mesIso]); // eslint-disable-line react-hooks/exhaustive-deps

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    // quem vê o financeiro abriu o mês corrente: as cobranças de mensalidade cheia que faltam são criadas (nunca duplica)
    if (mesIso === isoMes(new Date()) && liberado) await sb.rpc("creche_gerar_cobrancas", { p_petshop: petshop.id });
    const [doMes, antigas, todasAsCobrancas] = await Promise.all([
      sb.from("creche_cobrancas").select(SELECT_COBRANCA).eq("petshop_id", petshop.id).eq("mes", mesIso).order("vencimento").order("id").limit(1000),
      // o que ficou sem pagar de outros meses continua aparecendo em Atrasadas
      sb.from("creche_cobrancas").select(SELECT_COBRANCA.replace("lancamentos(", "lancamentos!inner(")).eq("petshop_id", petshop.id).eq("status", "aberta")
        .lt("mes", mesIso).eq("lancamentos.pago", false).order("vencimento").order("id").limit(1000),
      // que planos já tiveram cobrança, e em que meses (para saber qual é a primeira cobrança de cada um)
      sb.from("creche_cobrancas").select("plano_id, mes").eq("petshop_id", petshop.id).order("mes").order("id").limit(5000),
    ]);
    const meses = (todasAsCobrancas.data ?? []) as { plano_id: string; mes: string }[];
    return {
      doMes: ok(doMes) as unknown as CobrancaCompleta[], antigas: ok(antigas) as unknown as CobrancaCompleta[],
      comCobranca: new Set(meses.map((x) => x.plano_id)), comAnterior: new Set(meses.filter((x) => x.mes < mesIso).map((x) => x.plano_id)),
    };
  }, [petshop.id, mesIso]);

  const mudou = async () => { await recarregar(); avisarMudanca(); };
  const abertas = (dados?.doMes ?? []).filter((c) => c.status === "aberta");
  const canceladas = (dados?.doMes ?? []).filter((c) => c.status === "cancelada" && !c.por_fora);
  const pagasPorFora = (dados?.doMes ?? []).filter((c) => c.status === "cancelada" && c.por_fora);
  // podem ser marcadas como pagas por fora: abertas, com valor e ainda sem nenhum recebimento
  const semRecebimento = abertas.filter((c) => !c.lancamentos?.pago && Number(c.total) > 0 && faltaDaCobranca(c) === Number(c.total));
  const primeiras = semRecebimento.filter((c) => !dados?.comAnterior.has(c.plano_id));
  const todas = [...(dados?.antigas ?? []), ...abertas];
  const doBloco = (b: EstadoCobranca) => todas.filter((c) => estadoDaCobranca(c, hoje).estado === b);
  /**
   * Os grupos de um bloco. O tutor aparece num bloco só, o da cobrança mais urgente dele (atrasada, hoje, a vencer),
   * com todas as cobranças abertas juntas: assim os irmãos vão numa mensagem só.
   */
  const gruposDoBloco = (b: EstadoCobranca) => {
    if (b === "paga") return porTutor(doBloco("paga"));
    const urgencia: EstadoCobranca[] = ["atrasada", "hoje", "a_vencer"];
    const emAberto = todas.filter((c) => urgencia.includes(estadoDaCobranca(c, hoje).estado));
    return porTutor(emAberto).filter((g) => urgencia.find((u) => g.cobrancas.some((c) => estadoDaCobranca(c, hoje).estado === u)) === b);
  };
  const soma = (l: CobrancaCompleta[]) => centavos(l.reduce((s, c) => s + Number(c.total), 0));
  const pagas = abertas.filter((c) => c.lancamentos?.pago);
  // mensalidade com parte recebida: o que falta fica no bloco dela; o que já entrou conta em "Já recebido"
  const falta = (l: CobrancaCompleta[]) => centavos(l.reduce((s, c) => s + faltaDaCobranca(c), 0));
  const emPartes = centavos(soma(abertas.filter((c) => !c.lancamentos?.pago)) - falta(abertas.filter((c) => !c.lancamentos?.pago)));
  const faltamGerar = planos.filter((p) => cobraNoMes(p, mes) && !(dados?.doMes ?? []).some((c) => c.plano_id === p.id));

  async function receber(c: CobrancaCompleta) {
    if (somenteLeitura() || !c.lancamento_id) return;
    try {
      const l = ok(await sb.from("lancamentos").select("*").eq("id", c.lancamento_id).eq("petshop_id", petshop.id).single());
      if (l.pago) { avisar("Esta mensalidade já foi recebida. Atualizei a lista."); void mudou(); return; }
      setBaixando(l);
    } catch (e) { avisarErro(e); }
  }
  async function desfazerBaixa(c: CobrancaCompleta) {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Desfazer o recebimento?", texto: `A mensalidade de ${c.pets?.nome ?? "um pet"} (${brl(c.total)}) volta para A receber, e o valor sai do que entrou.`, confirmar: "Desfazer recebimento", perigo: true }))) return;
    try { ok(await sb.rpc("creche_cobranca_desfazer_baixa", { p_id: c.id })); avisar("Recebimento desfeito."); await mudou(); } catch (e) { avisarErro(e); }
  }
  async function reabrir(c: CobrancaCompleta) {
    if (somenteLeitura()) return;
    try {
      ok(await sb.rpc("creche_cobranca_criar", { p_plano: c.plano_id, p_mes: c.mes, p_reabrir: true }));
      avisar(`Cobrança de ${c.pets?.nome ?? "um pet"} gerada de novo.`);
      await mudou();
    } catch (e) { avisarErro(e); }
  }
  /** Lembra que a mensagem foi mandada (igual aos lembretes da agenda). */
  async function cobrou(g: Grupo) {
    const ids = g.cobrancas.map((c) => c.id);
    const r = await sb.rpc("creche_cobranca_cobrada", { p_ids: ids });
    if (r.error) { avisarErro(r.error.message); return; }
    const em = (r.data as string | null) ?? new Date().toISOString();
    setCobrados((m) => ({ ...m, ...Object.fromEntries(ids.map((id) => [id, em])) }));
  }
  const textoDe = (g: Grupo) => mensagemDeCobranca({ tutor: g.tutor, petshop: petshop.nome, cobrancas: g.cobrancas, hoje, opcoes: petshop });
  const aReceberDe = (g: Grupo) => g.cobrancas.filter((c) => c.lancamento_id && !c.lancamentos?.pago && Number(c.total) > 0);

  return (
    <div className="g-pilha">
      <div className="g-cm-mes-nav">
        <button type="button" className="g-ico" aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft /></button>
        <h2 className="g-cm-titulo">{mesComAno(mes)}</h2>
        <button type="button" className="g-ico" aria-label="Mês seguinte" disabled={mesIso > isoMes(agora)} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight /></button>
      </div>

      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {carregando && !dados ? <Esqueleto linhas={4} /> : !dados ? null : (
        <>
          {todas.length > 0 && (
            <div className="g-grade kpis">
              <Kpi icone={HandCoins} tom="menta" rotulo={`Cobrado em ${nomeMes(mes)}`} valor={brl(soma(abertas))} apoio={abertas.length === 1 ? "1 cobrança" : `${abertas.length} cobranças`} />
              <Kpi icone={CircleCheck} tom="menta" rotulo="Já recebido" valor={brl(centavos(soma(pagas) + emPartes))} apoio={`${pagas.length === 1 ? "1 paga" : `${pagas.length} pagas`}${emPartes > 0 ? ` · ${brl(emPartes)} em partes` : ""}`} />
              <Kpi icone={CalendarClock} tom="manteiga" rotulo="Vencem hoje" valor={doBloco("hoje").length} apoio={doBloco("hoje").length ? brl(falta(doBloco("hoje"))) : "nenhuma"} />
              <Kpi icone={TriangleAlert} tom="rosa" rotulo="Atrasadas" valor={doBloco("atrasada").length} apoio={doBloco("atrasada").length ? brl(falta(doBloco("atrasada"))) : "nenhuma"} />
            </div>
          )}

          {faltamGerar.length > 0 && todas.length > 0 && (
            <p className="g-cm-falta-gerar" role="status">
              <AlertTriangle aria-hidden />
              <span>{faltamGerar.length === 1 ? "1 mensalista ainda está sem cobrança" : `${faltamGerar.length} mensalistas ainda estão sem cobrança`} em {nomeMes(mes)}: {faltamGerar.slice(0, 4).map((p) => p.pets?.nome).filter(Boolean).join(", ")}{faltamGerar.length > 4 ? ` e mais ${faltamGerar.length - 4}` : ""}. Toque em Gerar cobranças.</span>
            </p>
          )}

          {primeiras.length > 0 && (
            <div className="g-aviso g-cm-aviso-fora" role="status" style={{ marginBottom: 0 }}>
              <AlertTriangle />
              <span className="g-cresce">{primeiras.length === 1 ? "1 mensalidade" : `${primeiras.length} mensalidades`} de {nomeMes(mes)} {primeiras.length === 1 ? "é a primeira cobrança do mensalista" : "são a primeira cobrança de cada mensalista"} aqui. Se {primeiras.length === 1 ? "já foi paga" : "já foram pagas"} antes de você começar a usar o sistema, marque como {primeiras.length === 1 ? "paga" : "pagas"} por fora: {primeiras.length === 1 ? "ela sai" : "elas saem"} de A receber sem entrar no caixa.</span>
              <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setPorFora(true); }}>Já foram pagas por fora</button>
            </div>
          )}

          {!todas.length && !canceladas.length && !pagasPorFora.length ? (
            <Vazio titulo={`Nenhuma cobrança em ${nomeMes(mes)}`}
              texto={planos.length ? "Toque em Gerar cobranças para criar a mensalidade de cada mensalista. Cada cobrança vira uma conta em Financeiro, A receber." : "Cadastre os mensalistas primeiro. Depois, gere as cobranças do mês aqui."} />
          ) : BLOCOS.map((b) => {
            const grupos = gruposDoBloco(b.id);
            if (!grupos.length) return null;
            return (
              <section key={b.id} className={`g-cm-bloco ${b.id}`}>
                <div className="g-card-t">
                  <h3>{b.titulo}</h3>
                  <span className="g-muted g-pp g-tab">{doBloco(b.id).length} · {brl(b.id === "paga" ? soma(doBloco(b.id)) : falta(doBloco(b.id)))}</span>
                </div>
                <div className="g-cm-grupos">
                  {grupos.map((g) => {
                    const zap = b.id === "paga" ? null : linkWhatsApp(g.telefone, textoDe(g));
                    const cobradoEm = g.cobrancas.map((c) => cobrados[c.id] ?? c.cobrado_em).filter(Boolean).sort().pop() ?? null;
                    return (
                      <div key={g.chave} className="g-cm-grupo">
                        <div className="g-cm-grupo-topo">
                          <AvatarPessoa nome={g.tutor ?? "?"} />
                          <span className="t">
                            <b>{g.tutor ?? "Sem tutor"}</b>
                            <span className="g-tab">{g.telefone ? fmtTelefone(g.telefone) : "sem telefone na ficha"}{g.cobrancas.length > 1 ? ` · ${g.cobrancas.length} pets numa mensagem só` : ""}</span>
                          </span>
                          <b className="g-num total">{brl(g.total)}</b>
                        </div>
                        <div className="g-cm-itens">
                          {g.cobrancas.map((c) => {
                            const e = estadoDaCobranca(c, hoje), extras = extrasDaCobranca(c), taxas = taxasDaCobranca(c), partes = partesDosExtras(c);
                            return (
                              <div key={c.id} className="g-cm-item">
                                <AvatarPet pet={c.pets ?? { nome: "?" }} tamanho="p" />
                                <div className="t">
                                  <b>{c.pets?.nome ?? "Pet removido"} <span className="g-tab">{brl(c.total)}</span></b>
                                  <span>
                                    {c.mes !== mesIso ? `${nomeMes(deIsoDia(c.mes))} · ` : ""}Mensalidade {brl(c.valor_mensal)}{Number(c.valor_mensal) < Number(c.valor_cheio) ? " (proporcional)" : ""}
                                    {extras.length ? ` + ${extras.length === 1 ? "1 dia extra" : `${extras.length} dias extras`} (${textoDasDatas(extras.map((x) => x.dia))})${partes.dias > 0 ? ` ${brl(partes.dias)}` : " sem valor"}` : ""}
                                    {taxas.length ? ` + ${textoDasTaxas(taxas.length)} (${textoDasDatas(taxas.map((x) => x.dia))}) ${brl(partes.taxas)}` : ""}
                                    {Number(c.desconto) > 0 ? ` − desconto ${brl(c.desconto)}` : ""}
                                  </span>
                                  <span className="selos">
                                    {e.estado === "paga" ? (e.semValor ? <span className="g-tag">sem valor a cobrar</span>
                                      : <span className="g-tag verde"><Check size={12} aria-hidden />paga em {dataCurta(c.lancamentos!.data)} · {textoDoPagamento(c.lancamentos!)}</span>)
                                      : e.estado === "atrasada" ? <span className="g-tag vermelho">venceu em {dataCurta(c.vencimento)} · {e.atraso === 1 ? "1 dia de atraso" : `${e.atraso} dias de atraso`}</span>
                                      : e.estado === "hoje" ? <span className="g-tag amarelo">vence hoje</span>
                                      : <span className="g-tag">vence em {dataCurta(c.vencimento)}</span>}
                                    {e.estado !== "paga" && faltaDaCobranca(c) < Number(c.total) && (
                                      <span className="g-tag verde">pago {brl(centavos(Number(c.total) - faltaDaCobranca(c)))} de {brl(c.total)} · falta {brl(faltaDaCobranca(c))}</span>
                                    )}
                                    {c.obs && <span className="g-muted">{c.obs}</span>}
                                  </span>
                                </div>
                                <div className="acoes">
                                  {e.estado === "paga" ? (!e.semValor && <button className="g-btn fantasma p" onClick={() => void desfazerBaixa(c)}><Undo2 />Desfazer</button>) : (
                                    <>
                                      <button className="g-btn verde p" onClick={() => void receber(c)}><HandCoins />Receber</button>
                                      <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setEditando(c); }} aria-label={`Alterar a cobrança de ${c.pets?.nome ?? "pet"}`}><Pencil />Alterar</button>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {b.id !== "paga" && (
                          <div className="g-cm-grupo-pe">
                            {aReceberDe(g).length > 1 && <button type="button" className="g-btn verde p" onClick={() => { if (!somenteLeitura()) setFamilia(g); }} ><HandCoins />Receber tudo · {brl(g.total)}</button>}
                            {cobradoEm && <span className="g-tag verde"><Check size={12} aria-hidden />cobrado em {dataCurta(isoDia(new Date(cobradoEm)))}</span>}
                            {zap ? (
                              <>
                                <button type="button" className="g-btn fantasma p" onClick={() => setMensagem(g)}>Ver a mensagem</button>
                                <a className={`g-btn p ${cobradoEm ? "sec" : "zap"}`} href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void cobrou(g)}
                                  aria-label={`Cobrar ${g.tutor ?? "o tutor"} pelo WhatsApp`}><MessageCircle />{cobradoEm ? "Cobrar de novo" : "Cobrar"}</a>
                              </>
                            ) : <span className="g-muted g-pp">Coloque o telefone na ficha do tutor para cobrar pelo WhatsApp.</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {canceladas.length > 0 && (
            <section className="g-cm-bloco cancelada">
              <div className="g-card-t"><h3>Canceladas</h3><span className="g-muted g-pp">{canceladas.length}</span></div>
              <div className="g-lista">
                {canceladas.map((c) => (
                  <div key={c.id} className="g-linha">
                    <AvatarPet pet={c.pets ?? { nome: "?" }} />
                    <span className="t"><b>{c.pets?.nome ?? "Pet removido"}</b><span>{c.pets?.clientes?.nome ?? "Sem tutor"} · cobrança cancelada</span></span>
                    <button className="g-btn fantasma p" onClick={() => void reabrir(c)}><RotateCcw />Gerar de novo</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {pagasPorFora.length > 0 && (
            <section className="g-cm-bloco cancelada">
              <div className="g-card-t"><h3>Pagas por fora do sistema</h3><span className="g-muted g-pp">{pagasPorFora.length}</span></div>
              <div className="g-lista">
                {pagasPorFora.map((c) => (
                  <div key={c.id} className="g-linha">
                    <AvatarPet pet={c.pets ?? { nome: "?" }} />
                    <span className="t"><b>{c.pets?.nome ?? "Pet removido"}</b><span>{c.pets?.clientes?.nome ?? "Sem tutor"} · paga por fora: não está em A receber nem entrou no caixa</span></span>
                    <button className="g-btn fantasma p" onClick={() => void reabrir(c)} aria-label={`Cobrar por aqui a mensalidade de ${c.pets?.nome ?? "pet"}`}><RotateCcw />Cobrar por aqui</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {!primeiras.length && semRecebimento.length > 0 && (
            <div><button type="button" className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setPorFora(true); }}>Marcar mensalidades como pagas por fora do sistema</button></div>
          )}
          <p className="g-muted g-pp">Cada cobrança é uma conta em Financeiro, A receber, na categoria Creche: mensalidade. O sistema não manda mensagem nem cobra sozinho: você confere e envia.</p>
        </>
      )}

      {familia && <ReceberFamilia grupo={familia} contas={aReceberDe(familia)} aoFechar={() => setFamilia(null)} aoFeito={async () => { setFamilia(null); await mudou(); }} />}
      {porFora && <PagasPorFora mes={mes} cobrancas={semRecebimento} marcadas={primeiras.map((c) => c.id)} aoFechar={() => setPorFora(false)} aoFeito={async () => { setPorFora(false); await mudou(); }} />}
      {gerar && dados && <GerarCobrancas mes={mes} planos={faltamGerar} comCobranca={dados.comCobranca} aoFechar={aoFecharGerar} aoGerar={async () => { aoFecharGerar(); await mudou(); }} />}
      {editando && <EditarCobranca cobranca={editando} aoFechar={() => setEditando(null)} aoSalvo={async () => { setEditando(null); await mudou(); }} />}
      {baixando && <FolhaBaixa conta={baixando} aoFechar={() => setBaixando(null)} aoSalvo={async () => { await recarregar(); }} />}
      {mensagem && <MensagemDeCobranca grupo={mensagem} texto={textoDe(mensagem)} aoFechar={() => setMensagem(null)} aoMandar={() => { void cobrou(mensagem); setMensagem(null); }} />}
    </div>
  );
}

/* ---------- mensagem que dá para mudar antes de mandar ---------- */

function MensagemDeCobranca({ grupo, texto: inicial, aoFechar, aoMandar }: { grupo: Grupo; texto: string; aoFechar: () => void; aoMandar: () => void }) {
  const [texto, setTexto] = useState(inicial);
  const zap = linkWhatsApp(grupo.telefone, texto);
  return (
    <Folha titulo={`Mensagem para ${grupo.tutor ?? "o tutor"}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer" onClick={aoMandar}><MessageCircle />Abrir o WhatsApp</a>}
      </>}>
      <div className="g-form">
        <Campo rotulo="Mensagem" dica="Mude o que quiser. O WhatsApp abre com este texto e você aperta enviar.">
          <textarea className="g-textarea g-cm-msg" value={texto} rows={10} onChange={(e) => setTexto(e.target.value)} data-sem-aviso />
        </Campo>
      </div>
    </Folha>
  );
}

/* ---------- gerar as cobranças do mês ---------- */

type LinhaGerar = {
  plano: PlanoCompleto; valor: number | null; sugestao: ReturnType<typeof sugestaoDoMes> | null; extras: string[]; unit: number; taxas: { dia: string; valor: number }[]; vencimento: string;
  /** primeira cobrança do plano e o vencimento já passou: quem recebe escolhe como fica (nada vem marcado) */
  primeira: boolean; escolha: PrimeiraCobranca | null; daquiPraFrente: ReturnType<typeof sugestaoDoMes> | null;
};

function GerarCobrancas({ mes, planos, comCobranca, aoFechar, aoGerar }: { mes: Date; planos: PlanoCompleto[]; comCobranca: Set<string>; aoFechar: () => void; aoGerar: () => Promise<void> }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const mesIso = isoMes(mes);
  const hoje = isoDia(new Date()), mesDeHoje = isoMes(new Date());
  const proximoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
  const [escolhas, setEscolhas] = useState<Record<string, PrimeiraCobranca>>({});
  const [valores, setValores] = useState<Record<string, number | null>>({});
  const [salvando, setSalvando] = useState(false);

  // dias extras de meses anteriores que ainda não entraram em nenhuma cobrança
  const { dados: extras, carregando } = useDados(async () => {
    if (!planos.length) return new Map<string, string[]>();
    const r = ok(await sb.from("estadias").select("pet_id, dia").eq("petshop_id", petshop.id).eq("mensalista", "extra")
      .in("status", ["em_casa", "encerrada"]).is("cobranca_id", null).lt("dia", mesIso).order("dia").limit(1000));
    const mapa = new Map<string, string[]>();
    for (const e of r) mapa.set(e.pet_id, [...(mapa.get(e.pet_id) ?? []), e.dia!]);
    return mapa;
  }, [petshop.id, mesIso, planos.length]);
  // taxas de busca fora do horário de meses anteriores que foram mandadas para a mensalidade e ainda não entraram em nenhuma cobrança
  const { dados: taxas } = useDados(async () => {
    const mapa = new Map<string, { dia: string; valor: number }[]>();
    if (!planos.length) return mapa;
    const r = await sb.from("creche_atrasos").select("pet_id, dia, valor").eq("petshop_id", petshop.id).eq("estado", "mensalidade").is("cobranca_id", null).lt("dia", mesIso).order("dia").limit(1000);
    for (const a of r.data ?? []) mapa.set(a.pet_id, [...(mapa.get(a.pet_id) ?? []), { dia: a.dia, valor: Number(a.valor ?? 0) }]);
    return mapa;
  }, [petshop.id, mesIso, planos.length]);

  const diaria = petshop.diaria_creche == null ? 0 : Number(petshop.diaria_creche);
  const linhas: LinhaGerar[] = planos.map((plano) => {
    const sugestao = plano.valor_mensal == null ? null : sugestaoDoMes(plano, mes, plano.valor_mensal, petshop.horario);
    const vencimento = vencimentoDoMes(plano, mes);
    const primeira = !plano.primeira_cobranca && !comCobranca.has(plano.id) && vencimento < hoje;
    const escolha = primeira ? escolhas[plano.id] ?? null : null;
    // "de hoje em diante" só faz sentido no mês corrente
    const daquiPraFrente = primeira && mesIso === mesDeHoje && plano.valor_mensal != null ? proporcionalDesde(plano, mes, plano.valor_mensal, petshop.horario, hoje) : null;
    const digitado = plano.id in valores ? valores[plano.id] : sugestao?.valor ?? null;
    return {
      plano, sugestao, primeira, escolha, daquiPraFrente,
      valor: escolha === "proporcional" ? daquiPraFrente?.valor ?? null : digitado,
      extras: extras?.get(plano.pet_id) ?? [], unit: plano.valor_extra ?? diaria, taxas: taxas?.get(plano.pet_id) ?? [], vencimento: primeira ? hoje : vencimento,
    };
  }).sort((a, b) => (a.plano.pets?.nome ?? "").localeCompare(b.plano.pets?.nome ?? "", "pt-BR"));
  const comValor = linhas.filter((l) => l.plano.temValor && l.valor != null);
  // a primeira cobrança só entra depois da escolha; "paga por fora" não gera cobrança, só anota que a primeira é a do mês seguinte
  const prontas = comValor.filter((l) => !l.primeira || (l.escolha && l.escolha !== "fora"));
  const porFora = comValor.filter((l) => l.primeira && l.escolha === "fora");
  const semEscolha = comValor.filter((l) => l.primeira && !l.escolha);
  const semValor = linhas.filter((l) => !l.plano.temValor);
  const totalDe = (l: LinhaGerar) => centavos((l.valor ?? 0) + l.extras.length * l.unit + l.taxas.reduce((s, x) => s + x.valor, 0));
  const total = centavos(prontas.reduce((s, l) => s + totalDe(l), 0));

  // trava na hora do primeiro toque: dois toques seguidos não geram (nem tentam gerar) as cobranças duas vezes.
  // No banco, cada plano tem uma cobrança só por mês: a segunda chamada devolve a que já existe.
  const op = useOperacao();
  const gerar = () => op.fazer(gerarTudo);
  async function gerarTudo() {
    if (salvando || !(prontas.length + porFora.length)) return;
    setSalvando(true);
    let feitas = 0, fora = 0;
    const falhas: string[] = [];
    for (const l of porFora) {
      const r = await sb.from("creche_planos").update({ primeira_cobranca: isoMes(proximoMes) }).eq("id", l.plano.id).eq("petshop_id", petshop.id).select("id");
      if (r.error) falhas.push(`${l.plano.pets?.nome ?? "pet"} (${r.error.message})`); else fora++;
    }
    for (const l of prontas) {
      const r = await sb.rpc("creche_cobranca_criar", { p_plano: l.plano.id, p_mes: mesIso, p_valor: l.valor ?? undefined, ...(l.primeira ? { p_vencimento: l.vencimento } : {}) });
      if (r.error) { falhas.push(`${l.plano.pets?.nome ?? "pet"} (${r.error.message})`); continue; }
      feitas++;
      // a escolha fica guardada no plano (a pergunta não volta)
      if (l.primeira) await sb.from("creche_planos").update({ primeira_cobranca: mesIso }).eq("id", l.plano.id).eq("petshop_id", petshop.id).select("id");
    }
    setSalvando(false);
    if (falhas.length) avisarErro(`Não deu certo com: ${falhas.join("; ")}`);
    const partes = [
      feitas ? (feitas === 1 ? "1 cobrança gerada. Ela já está em A receber." : `${feitas} cobranças geradas. Elas já estão em A receber.`) : "",
      fora ? `${fora === 1 ? "1 mensalista fica" : `${fora} mensalistas ficam`} com a primeira cobrança em ${nomeMes(proximoMes)}.` : "",
    ].filter(Boolean);
    if (partes.length) avisar(partes.join(" "));
    await aoGerar();
  }

  return (
    <Folha larga titulo={`Gerar cobranças de ${nomeMes(mes)}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={gerar} disabled={salvando || !(prontas.length + porFora.length) || carregando || !taxas}>
          {salvando ? "Gerando…" : prontas.length ? `Gerar ${prontas.length === 1 ? "1 cobrança" : `${prontas.length} cobranças`} · ${brl(total)}` : porFora.length ? "Confirmar" : semEscolha.length ? "Escolha como cobrar" : "Nada para gerar"}
        </button>
      </>}>
      {!linhas.length ? (
        <Vazio titulo={`As cobranças de ${nomeMes(mes)} já foram geradas`} texto="Todo mensalista com plano neste mês já tem cobrança. Se entrar um mensalista novo, volte aqui: só a dele é criada." />
      ) : carregando && !extras ? <Esqueleto linhas={3} /> : (
        <div className="g-pilha">
          <p className="g-muted g-p">Uma cobrança por mensalista: a mensalidade, mais os dias extras e as taxas de busca fora do horário de meses anteriores que ainda não foram cobrados. Quem já tem cobrança em {nomeMes(mes)} não entra de novo. As de mensalidade cheia do mês corrente já são criadas quando você abre esta tela; aqui ficam as que pedem conferência.</p>
          {mesIso > mesDeHoje && <p className="g-aviso" role="status" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce">{nomeMes(new Date())[0].toUpperCase() + nomeMes(new Date()).slice(1)} ainda não acabou. Dia extra ou taxa de busca marcados depois de gerar não entram nesta cobrança: vão para a do mês seguinte.</span></p>}
          <div className="g-cm-gerar">
            {comValor.map((l) => (
              <div key={l.plano.id} className="g-cm-gerar-linha">
                <AvatarPet pet={l.plano.pets ?? { nome: "?" }} />
                <div className="t">
                  <b>{l.plano.pets?.nome}</b>
                  <span>{l.plano.pets?.clientes?.nome ?? "Sem tutor"} · {l.primeira ? (l.escolha === "fora" ? `primeira cobrança em ${nomeMes(proximoMes)}` : "vence hoje") : `vence em ${dataCurta(l.vencimento)}`}{!l.primeira && l.vencimento < hoje ? " (já vencida: nasce atrasada)" : ""}</span>
                  {l.primeira && (
                    <label className="g-campo g-cm-primeira">
                      <span>Primeira cobrança de {l.plano.pets?.nome ?? "pet"}: o vencimento do mês já passou. Como fica?</span>
                      <select className="g-select" value={l.escolha ?? ""} aria-label={`Primeira cobrança de ${l.plano.pets?.nome ?? "pet"}`}
                        onChange={(e) => setEscolhas((x) => { const n = { ...x }; if (e.target.value) n[l.plano.id] = e.target.value as PrimeiraCobranca; else delete n[l.plano.id]; return n; })}>
                        <option value="">Escolha…</option>
                        <option value="fora">Este mês já foi pago por fora (a primeira cobrança é a de {nomeMes(proximoMes)})</option>
                        {l.daquiPraFrente && l.daquiPraFrente.restam > 0 && <option value="proporcional">Cobrar este mês, proporcional a partir de hoje ({brl(l.daquiPraFrente.valor)})</option>}
                        <option value="inteiro">{l.sugestao?.proporcional ? `Cobrar desde o começo do plano (${brl(l.sugestao.valor)})` : `Cobrar o mês inteiro (${brl(l.plano.valor_mensal)})`}</option>
                      </select>
                    </label>
                  )}
                  {l.sugestao?.proporcional && l.escolha !== "proporcional" && l.escolha !== "fora" && (
                    <span className="g-cm-prorata">{l.plano.inicio > mesIso ? `Começou em ${dataCurta(l.plano.inicio)}` : "Plano com pausa no mês"}: {l.sugestao.restam} de {l.sugestao.todos} dias do plano no mês. Sugestão: {brl(l.sugestao.valor)} (a mensalidade cheia é {brl(l.plano.valor_mensal)}). Mude o valor se combinou outro.</span>
                  )}
                  {l.extras.length > 0 && <span>{l.extras.length === 1 ? "1 dia extra" : `${l.extras.length} dias extras`} ({textoDasDatas(l.extras)}){l.unit > 0 ? `: ${brl(l.extras.length * l.unit)}` : ": sem preço de dia extra definido"}</span>}
                  {l.taxas.length > 0 && <span>{textoDasTaxas(l.taxas.length)} ({textoDasDatas(l.taxas.map((x) => x.dia))}): {brl(centavos(l.taxas.reduce((s, x) => s + x.valor, 0)))}</span>}
                </div>
                <div className="valor">
                  {l.sugestao?.proporcional && l.escolha !== "proporcional" && l.escolha !== "fora"
                    ? <label className="g-campo"><span>Mensalidade</span><CampoValor valor={l.valor} aoMudar={(v) => setValores((x) => ({ ...x, [l.plano.id]: v }))} /></label>
                    : null}
                  <b className="g-num g-tab">{l.primeira && !l.escolha ? "–" : l.escolha === "fora" ? "sem cobrança" : brl(totalDe(l))}</b>
                </div>
              </div>
            ))}
          </div>
          {semValor.length > 0 && (
            <div className="g-aviso" role="status" style={{ marginBottom: 0 }}>
              <AlertTriangle /><span className="g-cresce"><b>Sem valor de mensalidade:</b> {semValor.map((l) => l.plano.pets?.nome).filter(Boolean).join(", ")}. Abra Mensalistas, toque em Alterar plano e preencha a mensalidade para gerar a cobrança.</span>
            </div>
          )}
        </div>
      )}
    </Folha>
  );
}

/* ---------- alterar ou cancelar uma cobrança ainda não paga ---------- */

function EditarCobranca({ cobranca: c, aoFechar, aoSalvo }: { cobranca: CobrancaCompleta; aoFechar: () => void; aoSalvo: () => Promise<void> }) {
  const { sb } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [valor, setValor] = useState<number | null>(Number(c.valor_mensal));
  const [desconto, setDesconto] = useState<number | null>(Number(c.desconto) || null);
  const [vencimento, setVencimento] = useState(c.vencimento);
  const [obs, setObs] = useState(c.obs ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const extras = extrasDaCobranca(c), taxas = taxasDaCobranca(c), partes = partesDosExtras(c);
  const total = centavos((valor ?? 0) + Number(c.valor_extras) - (desconto ?? 0));

  async function salvar() {
    if (salvando) return;
    if (valor == null || valor < 0) return setErro("Preencha o valor da mensalidade.");
    if (!vencimento) return setErro("Escolha o vencimento.");
    if (total < 0) return setErro("O desconto é maior que a cobrança.");
    setErro(null); setSalvando(true);
    try {
      ok(await sb.rpc("creche_cobranca_editar", { p_id: c.id, p_valor: valor, p_desconto: desconto ?? 0, p_vencimento: vencimento, p_obs: obs.trim() || undefined }));
      avisar("Cobrança alterada. A conta em A receber acompanhou.");
      await aoSalvo();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }
  async function cancelar() {
    if (salvando) return;
    if (!(await confirmar({
      titulo: `Cancelar a cobrança de ${c.pets?.nome ?? "pet"}?`,
      texto: `A conta de ${brl(c.total)} sai de A receber.${extras.length || taxas.length ? ` ${[extras.length ? "Os dias extras" : "", taxas.length ? (extras.length ? "as taxas de busca fora do horário" : "As taxas de busca fora do horário") : ""].filter(Boolean).join(" e ")} voltam a ficar sem cobrança e entram na próxima.` : ""} Gerar as cobranças de novo não recria esta: para trazer de volta, use Gerar de novo em Canceladas.`,
      confirmar: "Cancelar cobrança", perigo: true,
    }))) return;
    setSalvando(true);
    try { ok(await sb.rpc("creche_cobranca_cancelar", { p_id: c.id })); avisar("Cobrança cancelada."); await aoSalvo(); } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha titulo={`Cobrança de ${c.pets?.nome ?? "pet"}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar cobrança"}</button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">{nomeMes(deIsoDia(c.mes))} · {c.pets?.clientes?.nome ?? "Sem tutor"}{Number(c.valor_mensal) < Number(c.valor_cheio) ? ` · a mensalidade cheia é ${brl(c.valor_cheio)}` : ""}</p>
        <div className="dupla">
          <Campo rotulo="Mensalidade"><CampoValor valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} /></Campo>
          <Campo rotulo="Desconto" dica="Opcional"><CampoValor valor={desconto} aoMudar={(v) => { setDesconto(v); setErro(null); }} /></Campo>
        </div>
        {extras.length > 0 && (
          <p className="g-p"><b>{extras.length === 1 ? "1 dia extra" : `${extras.length} dias extras`}:</b> {textoDasDatas(extras.map((x) => x.dia))} · {partes.dias > 0 ? brl(partes.dias) : "sem valor"}</p>
        )}
        {taxas.length > 0 && (
          <p className="g-p"><b>{textoDasTaxas(taxas.length)}:</b> {textoDasDatas(taxas.map((x) => x.dia))} · {brl(partes.taxas)}</p>
        )}
        <Campo rotulo="Vencimento"><input type="date" className="g-input" value={vencimento} onChange={(e) => { setVencimento(e.target.value); setErro(null); }} /></Campo>
        <Campo rotulo="Observação" dica="Só para vocês. Não vai na mensagem.">
          <input className="g-input" value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: desconto combinado por indicação" />
        </Campo>
        <p className="g-cm-total">Total da cobrança <b className="g-num g-tab">{brl(Math.max(0, total))}</b></p>
        {total === 0 && <p className="g-muted g-pp">Com o total zerado, a conta sai de A receber e a cobrança fica como sem valor a cobrar.</p>}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <div><button type="button" className="g-btn fantasma p g-vermelho-t" onClick={cancelar} disabled={salvando}><Ban />Cancelar esta cobrança</button></div>
        <p className="g-muted g-pp">Vencimento original: {dataCompleta(c.vencimento)}.</p>
      </div>
    </Folha>
  );
}

/* ---------- receber de uma vez as mensalidades de um tutor ---------- */

/**
 * O tutor paga num Pix só as mensalidades dos irmãos: uma folha, uma forma de pagamento, e cada mensalidade é baixada
 * pelo mesmo caminho de sempre (`receberConta`), inteira. Para receber só uma parte, use o Receber de cada pet.
 */
function ReceberFamilia({ grupo, contas, aoFechar, aoFeito }: { grupo: Grupo; contas: CobrancaCompleta[]; aoFechar: () => void; aoFeito: () => Promise<void> }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const hoje = isoDia(new Date());
  const caixaAgora = useCaixaAberto();
  const [forma, setForma] = useState<FormaPagamento | null>(null);
  const [data, setData] = useState(hoje);
  const [comMulta, setComMulta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // multa e juros pela regra do dono, contados até o dia do recebimento; só entram se a pessoa somar
  const multas = contas.map((c) => multaSugerida(petshop, { valor: faltaDaCobranca(c), vencimento: c.vencimento }, data || hoje)?.total ?? 0);
  const totalMulta = centavos(multas.reduce((s, m) => s + m, 0));
  const devido = centavos(contas.reduce((s, c) => s + faltaDaCobranca(c), 0));
  const total = centavos(devido + (comMulta ? totalMulta : 0));

  // trava na hora do primeiro toque; cada mensalidade leva a sua parte da chave (o banco recebe cada uma uma vez só)
  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando) return;
    if (!forma) { setErro("Escolha como recebeu."); return; }
    if (!data || data > hoje) { setErro("Escolha um dia até hoje."); return; }
    if (data === hoje && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    setErro(null); setSalvando(true);
    let feitas = 0, recebido = 0;
    const falhas: string[] = [];
    for (let i = 0; i < contas.length; i++) {
      const c = contas[i], m = comMulta ? multas[i] : 0;
      try {
        await receberConta(sb, c.lancamento_id!, { valor: faltaDaCobranca(c), forma, data, multa: m > 0 ? { valor: m, forma } : null, chave: parteDaChave(chave, "mensalidade", c.lancamento_id!) });
        feitas++; recebido = centavos(recebido + faltaDaCobranca(c) + m);
      } catch (e) { falhas.push(`${c.pets?.nome ?? "pet"} (${e instanceof Error ? e.message : "erro"})`); }
    }
    if (falhas.length) avisarErro(`Não deu certo com: ${falhas.join("; ")}`);
    if (feitas) avisar(`Recebido de ${grupo.tutor ?? "tutor"}: ${brl(recebido)} (${feitas === 1 ? "1 mensalidade" : `${feitas} mensalidades`}).`);
    await aoFeito();
    // deu certo só com uma parte: uma nova tentativa com a mesma folha não recebe de novo as que já entraram
    if (falhas.length) return false;
  }

  return (
    <Folha titulo={`Receber de ${grupo.tutor ?? "tutor"}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Recebendo…" : `Receber ${brl(total)}`}</button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">{contas.length} mensalidades num recebimento só. Cada uma é baixada inteira; para receber só uma parte, use o Receber de cada pet.</p>
        <div className="g-lista">
          {contas.map((c, i) => (
            <div key={c.id} className="g-linha">
              <AvatarPet pet={c.pets ?? { nome: "?" }} tamanho="p" />
              <span className="t"><b>{c.pets?.nome ?? "Pet"}</b><span>{nomeMes(deIsoDia(c.mes))} · venc. {dataCurta(c.vencimento)}{comMulta && multas[i] > 0 ? ` · + ${brl(multas[i])} de multa e juros` : ""}</span></span>
              <b className="g-num g-tab">{brl(faltaDaCobranca(c))}</b>
            </div>
          ))}
        </div>
        {totalMulta > 0 && (
          <div className="g-campo">
            <label className="g-check"><input type="checkbox" checked={comMulta} onChange={(e) => setComMulta(e.target.checked)} /><span>Somar multa e juros por atraso: {brl(totalMulta)}</span></label>
            <small>Pela regra de Opções de cobrança ({regraDaMulta(petshop)}). Só entra se você marcar; entra separado, na categoria Multa e juros.</small>
          </div>
        )}
        <p className="g-cm-total">Total a receber <b className="g-num g-tab">{brl(total)}</b></p>
        <ChipsForma valor={forma} aoMudar={(f) => { setForma(f); setErro(null); }} />
        <Campo rotulo="Dia em que recebeu" erro={erro}>
          <input type="date" className="g-input" value={data} max={hoje} onChange={(e) => { setData(e.target.value); setErro(null); }} />
        </Campo>
        {data === hoje && <AvisoCaixaFechado aberto={caixaAgora} />}
      </div>
    </Folha>
  );
}

/* ---------- mensalidades pagas por fora do sistema, de uma vez ---------- */

/**
 * Para quem começou a usar o sistema no meio do mês: as mensalidades que o tutor já pagou antes saem de A receber de uma vez,
 * sem entrar no caixa nem no que entrou no mês. A cobrança fica guardada como "paga por fora" (dá para voltar atrás).
 */
function PagasPorFora({ mes, cobrancas, marcadas, aoFechar, aoFeito }: { mes: Date; cobrancas: CobrancaCompleta[]; marcadas: string[]; aoFechar: () => void; aoFeito: () => Promise<void> }) {
  const { sb } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [ids, setIds] = useState<string[]>(marcadas);
  const [salvando, setSalvando] = useState(false);
  const lista = [...cobrancas].sort((a, b) => (a.pets?.nome ?? "").localeCompare(b.pets?.nome ?? "", "pt-BR"));
  const total = centavos(lista.filter((c) => ids.includes(c.id)).reduce((s, c) => s + Number(c.total), 0));

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar() {
    if (salvando || !ids.length) return;
    setSalvando(true);
    try {
      const n = ok(await sb.rpc("creche_cobrancas_por_fora", { p_ids: ids })) as number;
      avisar(n === 1 ? "1 mensalidade marcada como paga por fora. Saiu de A receber." : `${n} mensalidades marcadas como pagas por fora. Saíram de A receber.`);
      await aoFeito();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha titulo={`Pagas por fora em ${nomeMes(mes)}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={() => void salvar()} disabled={salvando || !ids.length}>{salvando ? "Salvando…" : ids.length ? `Marcar ${ids.length === 1 ? "1 como paga" : `${ids.length} como pagas`} por fora` : "Marque as mensalidades"}</button>
      </>}>
      <div className="g-pilha p">
        <p className="g-muted g-p">Marque as mensalidades de {nomeMes(mes)} que o tutor já pagou antes de você começar a usar o sistema (ou por outro caminho). Elas saem de A receber e das atrasadas, e nada entra no caixa. A partir do mês que vem, a cobrança é gerada normalmente.</p>
        <div className="g-fila">
          <button type="button" className="g-btn fantasma p" onClick={() => setIds(lista.map((c) => c.id))}>Marcar todas</button>
          <button type="button" className="g-btn fantasma p" onClick={() => setIds([])}>Desmarcar todas</button>
        </div>
        <div className="g-ht-marcar">
          {lista.map((c) => {
            const on = ids.includes(c.id);
            return (
              <label key={c.id} className={on ? "on" : ""}>
                <input type="checkbox" checked={on} onChange={(e) => setIds((l) => (e.target.checked ? [...l, c.id] : l.filter((i) => i !== c.id)))} />
                <span className="t"><b>{c.pets?.nome ?? "Pet"}</b><small>{c.pets?.clientes?.nome ?? "Sem tutor"} · venceu ou vence em {dataCurta(c.vencimento)}</small></span>
                <b className="v">{brl(c.total)}</b>
              </label>
            );
          })}
        </div>
        {ids.length > 0 && <p className="g-cm-total">Sai de A receber <b className="g-num g-tab">{brl(total)}</b></p>}
      </div>
    </Folha>
  );
}
