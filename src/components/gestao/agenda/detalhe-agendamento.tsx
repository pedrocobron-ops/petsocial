"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, MessageCircle, Play, Trash2, Truck, UserX } from "lucide-react";
import type { AgendamentoCompleto, PacoteCliente, StatusAgendamento } from "@/lib/gestao/tipos";
import { CHECKLIST_BANHO, FORMAS, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { textoLembrete } from "@/lib/gestao/agenda";
import { lancarPago } from "@/lib/gestao/dinheiro";
import { brl, dataAmigavel, dataLonga, fmtTelefone, hora, isoDia, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, CampoValor, Folha, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";

/** Tudo sobre um horário: quem é o pet, o que fazer agora (confirmar, iniciar, concluir e receber) e o lembrete no WhatsApp. */
export default function DetalheAgendamento({ agendamento: a, aoFechar, aoMudar, aoEditar }: {
  agendamento: AgendamentoCompleto; aoFechar: () => void; aoMudar: () => void; aoEditar: () => void;
}) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [recebendo, setRecebendo] = useState(false);
  const [valor, setValor] = useState<number | null>(a.preco);
  const [forma, setForma] = useState<(typeof FORMAS)[number]["id"]>("pix");
  const [checklist, setChecklist] = useState<Record<string, boolean>>((a.checklist as Record<string, boolean>) ?? {});
  const [ocupado, setOcupado] = useState(false);

  const pet = a.pets;
  const tutor = pet?.clientes;
  const st = STATUS_AGENDAMENTO[a.status];
  const encerrado = ["concluido", "faltou", "cancelado"].includes(a.status);

  // já foi pago? tem pacote que cobre este serviço?
  const { dados: extra, recarregar } = useDados(async () => {
    const [pago, pacotes] = await Promise.all([
      vejoFinanceiro ? sb.from("lancamentos").select("id, valor, forma").eq("agendamento_id", a.id).eq("tipo", "entrada") : Promise.resolve({ data: [], error: null }),
      sb.from("pacotes_clientes").select("*").eq("petshop_id", petshop.id).eq("pet_id", a.pet_id).eq("ativo", true),
    ]);
    const validos = ((pacotes.data ?? []) as PacoteCliente[]).filter((p) => p.usados < p.total && (!p.vence_em || p.vence_em >= isoDia(new Date())) && (!p.servico_id || p.servico_id === a.servico_id));
    return { pago: pago.data ?? [], pacote: validos[0] ?? null };
  }, [a.id]);
  const pago = (extra?.pago.length ?? 0) > 0 || Boolean(a.pacote_cliente_id);

  async function mudar(campos: Partial<{ status: StatusAgendamento; checklist: Record<string, boolean>; lembrete_em: string; pacote_cliente_id: string }>, aviso?: string) {
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

  async function receber() {
    if (somenteLeitura() || !valor) return;
    setOcupado(true);
    try {
      await lancarPago(sb, petshop.id, {
        tipo: "entrada", valor, forma, categoria: "Banho e tosa", agendamentoId: a.id, clienteId: tutor?.id ?? null,
        descricao: `${a.servicos?.nome ?? "Atendimento"} · ${pet?.nome ?? ""}`.trim(),
      });
      if (a.status !== "concluido") ok(await sb.from("agendamentos").update({ status: "concluido" }).eq("id", a.id).select("id").single());
      avisar(`Recebido ${brl(valor)}.`);
      avisarMudanca();
      aoMudar();
      aoFechar();
    } catch (e) { avisarErro(e); }
    setOcupado(false);
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

  async function apagar() {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Apagar este horário?", texto: "Ele some da agenda. Se o cliente só desmarcou, prefira Cancelar, que fica no histórico.", confirmar: "Apagar", perigo: true }))) return;
    try {
      ok(await sb.from("agendamentos").delete().eq("id", a.id).select("id"));
      avisar("Horário apagado.");
      avisarMudanca(); aoMudar(); aoFechar();
    } catch (e) { avisarErro(e); }
  }

  const zap = linkWhatsApp(tutor?.telefone, textoLembrete({
    tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", servico: a.servicos?.nome, quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome,
  }));

  if (recebendo) {
    return (
      <Folha titulo={`Receber de ${pet?.nome ?? "cliente"}`} aoFechar={() => setRecebendo(false)}
        rodape={<><button className="g-btn sec" onClick={() => setRecebendo(false)}>Voltar</button><button className="g-btn pri" disabled={!valor || ocupado} onClick={() => void receber()}>Receber {valor ? brl(valor) : ""}</button></>}>
        <div className="g-form">
          <label className="g-campo"><span>Valor</span><CampoValor valor={valor} aoMudar={setValor} autoFocus /></label>
          <div className="g-campo"><span>Como pagou</span>
            <div className="g-chips">{FORMAS.map((f) => <button key={f.id} type="button" className="g-chip" aria-pressed={forma === f.id} onClick={() => setForma(f.id)}>{f.rotulo}</button>)}</div>
          </div>
          <p className="g-pp g-muted">O valor entra no caixa de hoje e o atendimento fica como concluído.</p>
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
          <span className={`g-tag ${st.tom}`}>{st.rotulo}</span>
        </div>

        {pet?.alertas && <p className="g-aviso" style={{ margin: 0 }}>{pet.alertas}</p>}

        <div className="g-card liso g-pilha p">
          <div className="g-fila entre"><span className="g-muted">Serviço</span><b>{a.servicos?.nome ?? "A definir"}</b></div>
          <div className="g-fila entre"><span className="g-muted">Horário</span><b className="g-tab">{hora(a.inicio)} às {hora(a.fim)}</b></div>
          {a.profissionais && <div className="g-fila entre"><span className="g-muted">Com</span><b>{a.profissionais.nome}</b></div>}
          <div className="g-fila entre"><span className="g-muted">Valor</span><b className="g-tab">{a.preco != null ? brl(a.preco) : "A definir"}{pago ? " · pago" : ""}</b></div>
          {a.leva_traz && <div className="g-fila"><Truck size={18} /><span>Leva e traz{a.endereco_leva_traz ? `: ${a.endereco_leva_traz}` : ""}</span></div>}
          {a.obs && <p className="g-p">{a.obs}</p>}
        </div>

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

        {!encerrado && (
          <div className="g-pilha p">
            {a.status === "marcado" && <button className="g-btn verde cheio" disabled={ocupado} onClick={() => void mudar({ status: "confirmado" }, "Horário confirmado.")}><Check />Cliente confirmou</button>}
            {(a.status === "marcado" || a.status === "confirmado") && <button className="g-btn sec cheio" disabled={ocupado} onClick={() => void mudar({ status: "em_atendimento" }, `${pet?.nome ?? "Pet"} em atendimento.`)}><Play />Chegou: iniciar atendimento</button>}
            {vejoFinanceiro && !pago && <button className="g-btn pri cheio" disabled={ocupado} onClick={() => { if (!somenteLeitura()) setRecebendo(true); }}>Concluir e receber{a.preco ? ` ${brl(a.preco)}` : ""}</button>}
            {extra?.pacote && !pago && <button className="g-btn sec cheio" disabled={ocupado} onClick={() => void usarPacote(extra.pacote!)}>Concluir usando o pacote ({extra.pacote.usados} de {extra.pacote.total} usados)</button>}
            {(!vejoFinanceiro || pago) && <button className="g-btn pri cheio" disabled={ocupado} onClick={() => void mudar({ status: "concluido" }, "Atendimento concluído.").then((deu) => deu && aoFechar())}><Check />Concluir atendimento</button>}
          </div>
        )}
        {a.status === "concluido" && vejoFinanceiro && !pago && (
          <button className="g-btn pri cheio" onClick={() => { if (!somenteLeitura()) setRecebendo(true); }}>Receber{a.preco ? ` ${brl(a.preco)}` : ""}</button>
        )}

        <div className="g-fila">
          {zap ? (
            <a className="g-btn zap g-cresce" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => { void mudar({ lembrete_em: new Date().toISOString() }).then(recarregar); }}>
              <MessageCircle />{a.lembrete_em ? "Lembrar de novo" : "Lembrete no WhatsApp"}
            </a>
          ) : <p className="g-pp g-muted g-cresce">Sem telefone do tutor para mandar o lembrete.</p>}
          {pet && <Link className="g-btn sec" href={`/gestao/app/clientes?pet=${pet.id}`}>Ver ficha</Link>}
        </div>
        {a.lembrete_em && <p className="g-pp g-muted">Lembrete aberto {dataAmigavel(a.lembrete_em)} às {hora(a.lembrete_em)}.</p>}

        <hr className="g-sep" />
        <div className="g-fila">
          {!encerrado && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) aoEditar(); }}><CalendarClock />Remarcar ou alterar</button>}
          {!encerrado && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void mudar({ status: "faltou" }, "Marcado como falta.")}><UserX />Faltou</button>}
          {!encerrado && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void mudar({ status: "cancelado" }, "Horário cancelado.")}>Cancelar</button>}
          {encerrado && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void mudar({ status: "marcado" }, "Voltou para marcado.")}>Voltar para marcado</button>}
          <button className="g-btn fantasma p" onClick={() => void apagar()} aria-label="Apagar horário"><Trash2 /></button>
        </div>
      </div>
    </Folha>
  );
}
