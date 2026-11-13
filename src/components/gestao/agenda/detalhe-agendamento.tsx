"use client";

import { COLS_PACOTE_CLIENTE } from "@/lib/gestao/reservado";
import { useState } from "react";
import Link from "next/link";
import { BellRing, CalendarClock, CalendarX, Check, MessageCircle, Play, Receipt, Repeat, Trash2, Truck, UserX } from "lucide-react";
import type { AgendamentoCompleto, Lancamento, PacoteCliente, StatusAgendamento } from "@/lib/gestao/tipos";
import { CHECKLIST_BANHO, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { textoCancelado, textoLembrete, textoPronto, textoRemarcado } from "@/lib/gestao/agenda";
import { textoComprovante } from "@/lib/gestao/comprovante";
import { desfazerVenda, produtosDaVenda, textoDoPagamento } from "@/lib/gestao/dinheiro";
import { brl, dataAmigavel, dataCompleta, dataLonga, fmtTelefone, hora, inicioDoDia, isoDia, linkWhatsApp, mesmoDia, soDigitos, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, Folha, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { FolhaBaixa } from "../financeiro/comum";
import { FidelidadeNoHorario } from "../fidelidade";
import Comanda from "./comanda";
import AntesDepois from "./antes-depois";
import { continuarSerie, encerrarSerie, textoContinuou, VEZES_POR_VEZ } from "./series-acabando";

/** Tudo sobre um horário: quem é o pet, o que fazer agora (confirmar, iniciar, concluir e fechar a conta) e o lembrete no WhatsApp. */
export default function DetalheAgendamento({ agendamento: a, aoFechar, aoMudar, aoEditar }: {
  agendamento: AgendamentoCompleto; aoFechar: () => void; aoMudar: () => void; aoEditar: () => void;
}) {
  const { sb, petshop, vejoFinanceiro, cuidoDoFinanceiro, souDono, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [comanda, setComanda] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [baixando, setBaixando] = useState<Lancamento | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>((a.checklist as Record<string, boolean>) ?? {});
  const [ocupado, setOcupado] = useState(false);
  const [avisadoEm, setAvisadoEm] = useState(a.pronto_avisado_em);

  const pet = a.pets;
  const tutor = pet?.clientes;
  const st = STATUS_AGENDAMENTO[a.status];
  const encerrado = ["concluido", "faltou", "cancelado"].includes(a.status);
  const deHoje = mesmoDia(new Date(a.inicio), new Date());
  // fotos: de hoje para trás, em horário que aconteceu (ou em qualquer um que já tenha foto)
  const comFotos = Boolean(a.foto_antes || a.foto_depois)
    || (!["cancelado", "faltou"].includes(a.status) && new Date(a.inicio) < somaDias(inicioDoDia(new Date()), 1));
  const podeAvisarPronto = deHoje && (a.status === "em_atendimento" || a.status === "concluido");

  // já foi pago? tem pacote que cobre este serviço?
  const { dados: extra, recarregar } = useDados(async () => {
    const [pago, pacotes] = await Promise.all([
      // o recebimento deste horário vem por uma função do banco: quem só opera o caixa não lê o histórico, mas vê se este foi pago
      vejoFinanceiro ? sb.rpc("recebimentos_do_agendamento", { p_agendamento: a.id }) : Promise.resolve({ data: [] as Lancamento[], error: null }),
      sb.from("pacotes_clientes").select(COLS_PACOTE_CLIENTE).eq("petshop_id", petshop.id).eq("pet_id", a.pet_id).eq("ativo", true),
    ]);
    // horário que se repete: até quando vai a série (o último que ainda está de pé)
    let fimDaSerie: string | null = null;
    // repetição marcada como "até eu cancelar" (ainda valendo)?
    let semFim = false;
    if (a.serie_id) {
      const sf = await sb.from("series_agenda").select("serie_id").eq("serie_id", a.serie_id).eq("petshop_id", petshop.id).is("encerrada_em", null).maybeSingle();
      semFim = Boolean(sf.data);
      const u = await sb.from("agendamentos").select("inicio").eq("petshop_id", petshop.id).eq("serie_id", a.serie_id).not("status", "in", "(cancelado,faltou)").order("inicio", { ascending: false }).limit(1);
      fimDaSerie = u.data?.[0]?.inicio ?? null;
    }
    const validos = ((pacotes.data ?? []) as PacoteCliente[]).filter((p) => p.usados < p.total && (!p.vence_em || p.vence_em >= isoDia(new Date())) && (!p.servico_id || p.servico_id === a.servico_id));
    const lancados = (pago.data ?? []) as Lancamento[];
    // o pagamento já está num caixa fechado? (aí só o dono reabre ou apaga)
    const caixas = [...new Set(lancados.filter((l) => l.pago && l.caixa_id).map((l) => l.caixa_id!))];
    const fechados = caixas.length ? await sb.from("caixas").select("id").in("id", caixas).not("fechado_em", "is", null) : { data: [] };
    return { pago: lancados, pacote: validos[0] ?? null, fimDaSerie, semFim, emCaixaFechado: (fechados.data ?? []).length > 0 };
  }, [a.id]);
  const pago = (extra?.pago.length ?? 0) > 0 || Boolean(a.pacote_cliente_id);
  // conta fechada: já recebida, ou anotada para o cliente pagar depois (a receber)
  const recebidos = (extra?.pago ?? []).filter((l) => l.pago), devidos = (extra?.pago ?? []).filter((l) => !l.pago);
  const recebido = recebidos.reduce((t, l) => t + Number(l.valor), 0);
  const aReceber = devidos.reduce((t, l) => t + Number(l.valor), 0);
  const lancado = recebido + aReceber;
  const formasDoRecebido = [...new Set(recebidos.map((l) => textoDoPagamento(l)))].join(" e ");
  // como chamar o que está lançado neste horário, nas perguntas de apagar
  const oLancado = recebido > 0 && aReceber > 0 ? "o recebimento e a conta a receber" : aReceber > 0 ? "a conta a receber" : "o recebimento";
  // Quem pode reabrir, alterar ou apagar (o banco confere a mesma regra):
  // com pagamento num caixa fechado, só o dono; com pagamento, conta a receber ou pacote usado, o dono e quem cuida do financeiro;
  // concluído sem dinheiro lançado, quem recebe. Enquanto não sabe se foi pago, não oferece.
  const temConta = lancado > 0 || Boolean(a.pacote_cliente_id);
  const sabe = extra != null;
  const podeMexerNoPago = extra?.emCaixaFechado ? souDono : temConta ? cuidoDoFinanceiro : vejoFinanceiro;
  const podeReabrir = a.status !== "concluido" || (sabe && podeMexerNoPago);
  const podeApagar = sabe && (a.status === "concluido" || temConta ? podeMexerNoPago : true);
  const porQueNao = extra?.emCaixaFechado ? "O pagamento deste atendimento está em um caixa já fechado: só o dono do pet shop pode reabrir, alterar ou apagar."
    : temConta ? "Atendimento com pagamento lançado: só o dono ou quem cuida do financeiro pode reabrir, alterar ou apagar."
    : "Atendimento concluído: só quem cuida do caixa ou do financeiro pode reabrir, alterar ou apagar.";

  async function mudar(campos: Partial<{ status: StatusAgendamento; checklist: Record<string, boolean>; lembrete_em: string; pronto_avisado_em: string; pacote_cliente_id: string }>, aviso?: string) {
    if (somenteLeitura()) return false;
    setOcupado(true);
    try {
      ok(await sb.from("agendamentos").update(campos).eq("id", a.id).select("id").single());
      if (aviso) avisar(aviso);
      avisarMudanca();
      aoMudar();
      return true;
    } catch (e) { avisarErro(e); return false; } finally { setOcupado(false); }
  }

  /** Cancela este horário e os próximos da mesma série que ainda não aconteceram (marcados ou confirmados). */
  async function cancelarDaquiEmDiante() {
    if (somenteLeitura() || !a.serie_id) return;
    setOcupado(true);
    try {
      ok(await sb.from("agendamentos").update({ status: "cancelado" }).eq("id", a.id).select("id").single());
      const outros = ok(await sb.from("agendamentos").update({ status: "cancelado" }).eq("petshop_id", petshop.id).eq("serie_id", a.serie_id)
        .gte("inicio", a.inicio).in("status", ["marcado", "confirmado"]).neq("id", a.id).select("id"));
      // era "até eu cancelar": cancelou, então a Agenda para de avisar para continuar
      await encerrarSerie(sb, petshop.id, a.serie_id);
      avisar(outros.length ? `Cancelado este e mais ${outros.length === 1 ? "1 horário" : `${outros.length} horários`} da repetição.` : "Horário cancelado. Não havia outros à frente.");
      avisarMudanca();
      aoMudar();
      setCancelando(false);
    } catch (e) { avisarErro(e); avisarMudanca(); aoMudar(); } finally { setOcupado(false); }
  }

  /** Repetição "até eu cancelar": marca os próximos horários da série, a partir do último que existe. */
  async function continuarRepeticao(visto: string) {
    if (somenteLeitura() || !a.serie_id) return;
    setOcupado(true);
    try {
      // o último horário da série, de pé ou não: é dele que a repetição segue
      const u = await sb.from("agendamentos").select("inicio").eq("petshop_id", petshop.id).eq("serie_id", a.serie_id).order("inicio", { ascending: false }).limit(1);
      avisar(textoContinuou(await continuarSerie(sb, a.serie_id, u.data?.[0]?.inicio ?? visto)));
      avisarMudanca();
      aoMudar();
      void recarregar();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }

  async function usarPacote(p: PacoteCliente) {
    if (somenteLeitura()) return;
    setOcupado(true);
    try {
      const usados = p.usados + 1;
      ok(await sb.from("pacotes_clientes").update({ usados, ativo: usados < p.total }).eq("id", p.id).select("id").single());
      ok(await sb.from("agendamentos").update({ status: "concluido", pacote_cliente_id: p.id }).eq("id", a.id).select("id").single());
      avisar(`Usado ${usados} de ${p.total} do pacote.`);
      avisarMudanca();
      aoMudar();
      aoFechar();
    } catch (e) { avisarErro(e); }
    setOcupado(false);
  }

  /** Volta um horário encerrado para "marcado". Se já tem dinheiro lançado, explica antes o que acontece com ele. */
  async function reabrir() {
    if (somenteLeitura()) return;
    if (a.status === "concluido" && temConta) {
      const dinheiro = recebido > 0 ? `O pagamento de ${brl(recebido)}${formasDoRecebido ? ` (${formasDoRecebido})` : ""} continua lançado${extra?.emCaixaFechado ? " no caixa que já foi fechado" : ""} e não muda sozinho. `
        : aReceber > 0 ? `A conta de ${brl(aReceber)} que o cliente ficou de pagar continua em A receber. `
        : "O uso do pacote continua contado. ";
      const sim = await confirmar({
        titulo: "Reabrir um atendimento que já foi pago?",
        texto: `${dinheiro}Se você mudar o valor ou quem atendeu, a comissão e os relatórios passam a seguir o que ficar no horário. Para corrigir o dinheiro recebido, altere o lançamento em Financeiro: a alteração fica anotada.`,
        confirmar: "Reabrir",
      });
      if (!sim) return;
    }
    void mudar({ status: "marcado" }, "Voltou para marcado.");
  }

  const avisoPacote = a.pacote_cliente_id ? " Este atendimento foi pago com um pacote: apagar o horário não devolve o uso ao pacote (acerte em Pacotes, se for o caso)." : "";

  /** Toque na lixeira: sem recebimento, uma confirmação simples; com recebimento, abre a escolha (apagar junto ou manter). */
  async function pedirApagar() {
    if (somenteLeitura()) return;
    if (lancado > 0) { setApagando(true); return; }
    if (!(await confirmar({ titulo: "Apagar este horário?", texto: `Ele some da agenda. Se o cliente só desmarcou, prefira Desmarcar horário, que fica no histórico.${avisoPacote}`, confirmar: "Apagar", perigo: true }))) return;
    void apagar(false);
  }

  /** Apaga o horário. Com `comRecebimento`, apaga antes o pagamento lançado (e devolve ao estoque os produtos vendidos na conta). */
  async function apagar(comRecebimento: boolean) {
    if (somenteLeitura()) return;
    setOcupado(true);
    try {
      let extraAviso = "";
      if (comRecebimento) {
        let voltaram = 0, erroEstoque: string | null = null;
        for (const l of extra?.pago ?? []) {
          // se o lançamento é de um caixa já fechado, o banco recusa e o horário também fica como está
          const r = await desfazerVenda(sb, petshop.id, l);
          voltaram += r.devolvidos;
          erroEstoque = erroEstoque ?? r.erroEstoque;
        }
        extraAviso = ` ${oLancado.replace(/^./, (c) => c.toUpperCase())} de ${brl(lancado)} também ${recebido > 0 && aReceber > 0 ? "foram apagados" : aReceber > 0 ? "foi apagada" : "foi apagado"}${voltaram ? ` e ${voltaram === 1 ? "1 produto voltou" : `${voltaram} produtos voltaram`} para o estoque` : ""}.`;
        if (erroEstoque) avisarErro(`O recebimento foi apagado, mas os produtos não voltaram para o estoque. Acerte o saldo na tela de Estoque. (${erroEstoque})`);
      }
      ok(await sb.from("agendamentos").delete().eq("id", a.id).select("id"));
      const fotos = [a.foto_antes, a.foto_depois].filter((c): c is string => Boolean(c));
      if (fotos.length) void sb.storage.from("pets").remove(fotos);
      avisar(`Horário apagado.${extraAviso}${!comRecebimento && lancado > 0 ? ` ${oLancado.replace(/^./, (c) => c.toUpperCase())} de ${brl(lancado)} ${recebido > 0 && aReceber > 0 ? "continuam" : "continua"} no financeiro.` : ""}`);
      avisarMudanca(); aoMudar(); aoFechar();
    } catch (e) { avisarErro(e); avisarMudanca(); void recarregar(); } finally { setOcupado(false); }
  }

  /** Desmarcar (cancelar o atendimento): pede confirmação; se o horário se repete, pergunta se é só este ou este e os próximos. */
  async function pedirDesmarcar() {
    if (somenteLeitura()) return;
    if (a.serie_id) { setCancelando(true); return; }
    if (!(await confirmar({ titulo: "Desmarcar este horário?", texto: `${pet?.nome ?? "O pet"}, ${dataAmigavel(a.inicio)} às ${hora(a.inicio)}. O horário fica como cancelado no histórico e a vaga volta a ficar livre.`, confirmar: "Desmarcar horário", perigo: true }))) return;
    void mudar({ status: "cancelado" }, "Horário desmarcado.");
  }

  /** Falta: se o horário ainda não chegou, confirma antes (toque errado é comum). Depois de marcar, o aviso traz "Desfazer". */
  async function pedirFalta() {
    if (somenteLeitura()) return;
    if (new Date(a.inicio).getTime() > Date.now()
      && !(await confirmar({ titulo: "Marcar como falta?", texto: `O horário de ${pet?.nome ?? "este pet"} é ${dataAmigavel(a.inicio)} às ${hora(a.inicio)} e ainda não chegou. Se o cliente avisou que não vem, prefira Desmarcar horário.`, confirmar: "Marcar falta" }))) return;
    const antes = a.status;
    if (!(await mudar({ status: "faltou" }))) return;
    avisar(`${pet?.nome ?? "O pet"} ficou como falta.`, {
      rotulo: "Desfazer",
      fazer: () => {
        // só volta se ainda estiver como falta (ninguém mexeu de novo nesse meio-tempo)
        void sb.from("agendamentos").update({ status: antes }).eq("id", a.id).eq("petshop_id", petshop.id).eq("status", "faltou").select("id").then(({ data, error }) => {
          if (error || !data?.length) { avisarErro(error ?? new Error("Não deu para desfazer: o horário já mudou de novo.")); return; }
          avisar(`Desfeito: ${pet?.nome ?? "o pet"} voltou para ${STATUS_AGENDAMENTO[antes].rotulo.toLowerCase()}.`);
          avisarMudanca();
          aoMudar();
        });
      },
    });
  }

  const zap = linkWhatsApp(tutor?.telefone, textoLembrete({
    tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", servico: a.servicos?.nome, quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome,
  }));

  // remarcou ou cancelou: a mensagem para o tutor já vem pronta (quem manda é a pessoa, pelo WhatsApp)
  const zapRemarcado = linkWhatsApp(tutor?.telefone, textoRemarcado({
    tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", servico: a.servicos?.nome, quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome,
  }));
  const zapCancelado = linkWhatsApp(tutor?.telefone, textoCancelado({ tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome }));

  const zapPronto = linkWhatsApp(tutor?.telefone, textoPronto({ tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", petshop: petshop.nome, servico: a.servicos?.nome }));

  // comprovante: só para quem vê o financeiro, com o atendimento concluído, a conta toda recebida e telefone na ficha
  const zapComprovante = vejoFinanceiro && a.status === "concluido" && recebidos.length > 0 && !devidos.length && soDigitos(tutor?.telefone).length >= 8
    ? linkWhatsApp(tutor?.telefone, textoComprovante({ petshop: petshop.nome, tutor: tutor?.nome, pet: pet?.nome, servico: a.servicos?.nome, quando: a.inicio, recebidos }))
    : null;

  if (comanda) {
    return <Comanda agendamento={a} aoFechar={() => setComanda(false)} aoPronto={() => { aoMudar(); aoFechar(); }} />;
  }

  if (baixando) {
    return <FolhaBaixa conta={baixando} aoFechar={() => setBaixando(null)} aoSalvo={async () => { await recarregar(); aoMudar(); }} />;
  }

  if (apagando) {
    const comProdutos = (extra?.pago ?? []).reduce((n, l) => n + produtosDaVenda(l).length, 0);
    return (
      <Folha titulo={recebido > 0 ? "Apagar um horário que já foi pago" : "Apagar um horário com conta a receber"} aoFechar={() => setApagando(false)}
        rodape={<button className="g-btn sec" disabled={ocupado} onClick={() => setApagando(false)}>Voltar</button>}>
        <div className="g-pilha">
          <p className="g-aviso" style={{ margin: 0 }}>
            <span>
              {recebido > 0 && <>Este horário tem um pagamento de <b>{brl(recebido)}</b> lançado{formasDoRecebido ? ` (${formasDoRecebido})` : ""}. </>}
              {aReceber > 0 && <>{recebido > 0 ? "Também tem" : "Este horário tem"} uma conta de <b>{brl(aReceber)}</b> que o cliente ficou de pagar depois. </>}
              O que fazer?
            </span>
          </p>
          <p className="g-muted g-p">
            {pet?.nome ?? "O pet"}, {dataAmigavel(a.inicio)} às {hora(a.inicio)}. O horário some da agenda e não dá para desfazer.
            {comProdutos > 0 ? ` Se apagar ${oLancado}, ${comProdutos === 1 ? "o produto vendido nesta conta volta" : "os produtos vendidos nesta conta voltam"} para o estoque.` : ""}
            {avisoPacote}
          </p>
          <div className="g-pilha p">
            <button className="g-btn perigo cheio" disabled={ocupado} onClick={() => void apagar(true)}>Apagar o horário e {oLancado} de {brl(lancado)}</button>
            <button className="g-btn sec cheio" disabled={ocupado} onClick={() => void apagar(false)}>Apagar só o horário e manter {oLancado}</button>
          </div>
          <p className="g-muted g-pp">
            {recebido > 0 ? "Mantendo o recebimento, o dinheiro continua no caixa e no financeiro, sem ligação com a agenda." : ""}
            {aReceber > 0 ? " Mantendo a conta a receber, ela continua em Financeiro, A receber, e na ficha do tutor." : ""}
          </p>
        </div>
      </Folha>
    );
  }

  if (cancelando) {
    return (
      <Folha titulo="Desmarcar um horário que se repete" aoFechar={() => setCancelando(false)}
        rodape={<button className="g-btn sec" onClick={() => setCancelando(false)}>Voltar</button>}>
        <div className="g-pilha">
          <p className="g-muted">
            {pet?.nome ?? "Este pet"} tem este horário marcado para se repetir. Os que já foram atendidos continuam no histórico.
          </p>
          <div className="g-pilha p">
            <button className="g-btn sec cheio" disabled={ocupado} onClick={() => void mudar({ status: "cancelado" }, "Horário desmarcado.").then((deu) => deu && setCancelando(false))}>Desmarcar só este</button>
            <button className="g-btn perigo cheio" disabled={ocupado} onClick={() => void cancelarDaquiEmDiante()}>Desmarcar este e os próximos</button>
          </div>
        </div>
      </Folha>
    );
  }

  return (
    <Folha titulo={`${hora(a.inicio)} · ${dataLonga(a.inicio)}`} aoFechar={aoFechar}>
      <div className="g-pilha">
        <div className="g-fila">
          {pet && <AvatarPet pet={pet} tamanho="g" />}
          <div className="g-cresce">
            <h2>{pet?.nome ?? "Pet"}</h2>
            <p className="g-muted g-p">{[tutor?.nome, pet?.raca, pet?.porte ? `porte ${pet.porte}` : null].filter(Boolean).join(" · ")}</p>
            {tutor?.telefone && <p className="g-muted g-pp">{fmtTelefone(tutor.telefone)}</p>}
          </div>
          <div className="g-pilha p" style={{ justifyItems: "end" }}>
            <span className={`g-tag ${st.tom}`}>{st.rotulo}</span>
            {a.serie_id && <span className="g-tag azul"><Repeat size={12} aria-hidden />Repete</span>}
          </div>
        </div>

        {pet?.alertas && <p className="g-aviso" style={{ margin: 0 }}>{pet.alertas}</p>}

        <div className="g-card liso g-pilha p">
          <div className="g-fila entre"><span className="g-muted">Serviço</span><b>{a.servicos?.nome ?? "A definir"}</b></div>
          <div className="g-fila entre"><span className="g-muted">Horário</span><b className="g-tab">{hora(a.inicio)} às {hora(a.fim)}</b></div>
          {a.profissionais && <div className="g-fila entre"><span className="g-muted">Com</span><b>{a.profissionais.nome}</b></div>}
          <div className="g-fila entre"><span className="g-muted">Valor</span><b className="g-tab">{a.preco != null ? brl(a.preco) : "A definir"}{pago && !lancado ? " · pago" : ""}</b></div>
          {recebido > 0 && <div className="g-fila entre"><span className="g-muted">Recebido</span><b className="g-tab g-verde-t">{brl(recebido)}{formasDoRecebido ? ` · ${formasDoRecebido}` : ""}</b></div>}
          {devidos.map((l) => (
            <div className="g-fila entre" key={l.id}>
              <span className="g-muted">A receber</span>
              <b className="g-tab g-agd-areceber">{brl(l.valor)}{l.vencimento ? ` · ${l.vencimento < isoDia(new Date()) ? "venceu" : "paga"} ${dataAmigavel(l.vencimento) === "hoje" || dataAmigavel(l.vencimento) === "amanhã" || dataAmigavel(l.vencimento) === "ontem" ? dataAmigavel(l.vencimento) : `em ${dataCompleta(l.vencimento)}`}` : ""}</b>
            </div>
          ))}
          {a.pacote_cliente_id && <div className="g-fila entre"><span className="g-muted">Pagamento</span><b>Pelo pacote</b></div>}
          {a.leva_traz && <div className="g-fila"><Truck size={18} /><span>Leva e traz{a.endereco_leva_traz ? `: ${a.endereco_leva_traz}` : ""}</span></div>}
          {tutor && <FidelidadeNoHorario clienteId={tutor.id} />}
          {a.obs && <p className="g-p">{a.obs}</p>}
        </div>
        {a.serie_id && extra?.fimDaSerie && !encerrado && (
          <p className="g-pp g-muted" style={{ margin: 0 }}>
            <Repeat size={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {extra.semFim
              ? <>Repete até você cancelar. Os horários estão marcados até {dataCompleta(extra.fimDaSerie)}. <button type="button" className="g-link" disabled={ocupado} onClick={() => void continuarRepeticao(extra.fimDaSerie!)}>Marcar mais {VEZES_POR_VEZ}</button></>
              : mesmoDia(new Date(extra.fimDaSerie), new Date(a.inicio)) ? "Este é o último horário da repetição. Para continuar, marque de novo com Repetir." : `A repetição vai até ${dataCompleta(extra.fimDaSerie)}.`}
          </p>
        )}

        {(a.status === "em_atendimento" || Object.values(checklist).some(Boolean)) && (
          <div className="g-campo"><span>Como o pet chegou</span>
            <div className="g-chips">
              {CHECKLIST_BANHO.map((c) => (
                <button key={c.id} type="button" className="g-chip" aria-pressed={Boolean(checklist[c.id])} disabled={encerrado}
                  onClick={() => { const novo = { ...checklist, [c.id]: !checklist[c.id] }; setChecklist(novo); void mudar({ checklist: novo }); }}>{c.rotulo}</button>
              ))}
            </div>
          </div>
        )}

        {comFotos && <AntesDepois agendamento={a} aoMudar={aoMudar} />}

        {!encerrado && (
          <div className="g-pilha p">
            {a.status === "marcado" && <button className="g-btn verde cheio" disabled={ocupado} onClick={() => void mudar({ status: "confirmado" }, "Horário confirmado.")}><Check />Cliente confirmou</button>}
            {(a.status === "marcado" || a.status === "confirmado") && <button className="g-btn sec cheio" disabled={ocupado} onClick={() => void mudar({ status: "em_atendimento" }, `${pet?.nome ?? "Pet"} em atendimento.`)}><Play />Chegou: iniciar atendimento</button>}
            {/* pet com pacote que cobre este serviço: usar o pacote vem primeiro, para ninguém cobrar duas vezes */}
            {extra?.pacote && !pago && (
              <>
                <p className="g-aviso" style={{ margin: 0 }} role="status">
                  <span><b>{pet?.nome ?? "Este pet"} tem pacote para este serviço</b> ({extra.pacote.nome}: {extra.pacote.total - extra.pacote.usados === 1 ? "sobra 1 uso" : `sobram ${extra.pacote.total - extra.pacote.usados} usos`} de {extra.pacote.total}). Use o pacote para não cobrar de novo.</span>
                </p>
                <button className="g-btn pri cheio" disabled={ocupado} onClick={() => void usarPacote(extra.pacote!)}><Check />Concluir usando o pacote (sem cobrar)</button>
              </>
            )}
            {vejoFinanceiro && !pago && (
              <button className={`g-btn ${extra?.pacote ? "sec" : "pri"} cheio`} disabled={ocupado || !sabe} onClick={() => { if (!somenteLeitura()) setComanda(true); }}>
                <Receipt />{extra?.pacote ? "Cobrar à parte, sem usar o pacote" : "Fechar a conta"}{a.preco ? ` · ${brl(a.preco)}` : ""}
              </button>
            )}
            {(!vejoFinanceiro || pago) && <button className={`g-btn ${extra?.pacote && !pago ? "sec" : "pri"} cheio`} disabled={ocupado} onClick={() => void mudar({ status: "concluido" }, "Atendimento concluído.").then((deu) => deu && aoFechar())}><Check />{extra?.pacote && !pago ? "Concluir sem usar o pacote" : "Concluir atendimento"}</button>}
          </div>
        )}
        {a.status === "concluido" && vejoFinanceiro && !pago && (
          <button className="g-btn pri cheio" onClick={() => { if (!somenteLeitura()) setComanda(true); }}><Receipt />Fechar a conta{a.preco ? ` · ${brl(a.preco)}` : ""}</button>
        )}

        {devidos.length > 0 && (
          <button className="g-btn verde cheio" disabled={ocupado} onClick={() => { if (!somenteLeitura()) setBaixando(devidos[0]); }}>
            <Receipt />O cliente pagou: receber {brl(devidos[0].valor)}
          </button>
        )}

        {zapComprovante && (
          <a className="g-btn sec cheio" href={zapComprovante} target="_blank" rel="noopener noreferrer"><Receipt />Mandar comprovante</a>
        )}

        {podeAvisarPronto && (zapPronto ? (
          <a className="g-btn zap cheio" href={zapPronto} target="_blank" rel="noopener noreferrer"
            onClick={() => { const agora = new Date().toISOString(); void mudar({ pronto_avisado_em: agora }).then((deu) => deu && setAvisadoEm(agora)); }}>
            {avisadoEm ? <><BellRing />Avisado às {hora(avisadoEm)}</> : <><MessageCircle />Avisar que terminou</>}
          </a>
        ) : <p className="g-pp g-muted">Sem telefone do tutor para avisar que o atendimento de {pet?.nome ?? "o pet"} terminou.</p>)}

        <div className="g-fila">
          {a.status === "cancelado" || a.status === "faltou" || a.status === "concluido" ? null : zap ? (
            <a className={`g-btn ${podeAvisarPronto && zapPronto ? "sec" : "zap"} g-cresce`} href={zap} target="_blank" rel="noopener noreferrer" onClick={() => { void mudar({ lembrete_em: new Date().toISOString() }).then(recarregar); }}>
              <MessageCircle />{a.lembrete_em ? "Lembrar de novo" : "Lembrete no WhatsApp"}
            </a>
          ) : <p className="g-pp g-muted g-cresce">Sem telefone do tutor para mandar o lembrete.</p>}
          {pet && posso("clientes") && <Link className="g-btn sec" href={`/gestao/app/clientes?pet=${pet.id}`}>Ver ficha</Link>}
        </div>
        {a.lembrete_em && <p className="g-pp g-muted">Lembrete aberto {dataAmigavel(a.lembrete_em)} às {hora(a.lembrete_em)}.</p>}
        {(a.status === "marcado" || a.status === "confirmado") && zapRemarcado && (
          <div className="g-fila">
            <a className="g-btn sec g-cresce" href={zapRemarcado} target="_blank" rel="noopener noreferrer"><MessageCircle />Avisar remarcação</a>
          </div>
        )}
        {a.status === "cancelado" && (zapCancelado
          ? <a className="g-btn zap cheio" href={zapCancelado} target="_blank" rel="noopener noreferrer"><MessageCircle />Avisar cancelamento</a>
          : <p className="g-pp g-muted">Sem telefone do tutor para avisar do cancelamento.</p>)}

        <hr className="g-sep" />
        <div className="g-fila">
          {!encerrado && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) aoEditar(); }}><CalendarClock />Remarcar ou alterar</button>}
          {!encerrado && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void pedirFalta()}><UserX />Faltou</button>}
          {!encerrado && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void pedirDesmarcar()}><CalendarX />Desmarcar horário</button>}
          {encerrado && podeReabrir && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void reabrir()}>Voltar para marcado</button>}
        </div>
        {/* a lixeira fica sozinha, longe de Desmarcar, para não apagar por engano */}
        <div className="g-agd-apagar">
          {!sabe ? null : !podeApagar
            ? <p className="g-pp g-muted">{porQueNao}</p>
            : <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void pedirApagar()}><Trash2 />Apagar da agenda</button>}
        </div>
      </div>
    </Folha>
  );
}
