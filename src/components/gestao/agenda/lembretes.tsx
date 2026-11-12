"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, MessageCircle, PhoneOff } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO } from "@/lib/gestao/tipos";
import { textoLembrete } from "@/lib/gestao/agenda";
import { dataAmigavel, dataLonga, deIsoDia, fmtTelefone, hora, linkWhatsApp, soDigitos, somaDias, chamar } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPessoa, Esqueleto, Folha, Vazio, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";

/**
 * Lembrete de WhatsApp em um toque: o botão direto em cada horário (agenda do dia e tela Hoje)
 * e a folha "Mandar os lembretes", que passa pelos tutores do dia um por um.
 * A mensagem e o registro (`lembrete_em`) são os mesmos do detalhe do horário.
 */

type Ag = AgendamentoCompleto;

const temTelefone = (a: Ag) => soDigitos(a.pets?.clientes?.telefone).length >= 8;
/** Horário que ainda vai acontecer e pode receber lembrete (marcado ou confirmado). */
const esperaLembrete = (a: Ag) => a.status === "marcado" || a.status === "confirmado";

/** O horário ainda não teve lembrete, tem telefone e ainda não passou: cabe o botão direto de WhatsApp. */
export function precisaDeLembrete(a: Ag, agora = new Date()) {
  return esperaLembrete(a) && !a.lembrete_em && temTelefone(a) && new Date(a.inicio) > agora;
}

/** Quantos tutores com telefone ainda não receberam o lembrete dos horários desta lista (um por tutor). */
export function lembretesQueFaltam(ags: Ag[], agora = new Date()) {
  return new Set(ags.filter((a) => precisaDeLembrete(a, agora)).map((a) => a.pets?.clientes?.id ?? a.id)).size;
}

/** Mensagem do lembrete. Um horário: a mesma do detalhe. Mais de um do mesmo tutor no dia: uma mensagem só, citando todos. */
export function mensagemDoLembrete(ags: Ag[], petshop: string) {
  const tutor = ags[0]?.pets?.clientes?.nome;
  if (ags.length === 1) {
    const a = ags[0];
    return textoLembrete({ tutor, pet: a.pets?.nome ?? "seu pet", servico: a.servicos?.nome, quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop });
  }
  const partes = ags.map((a) => `${a.servicos?.nome ? a.servicos.nome.toLowerCase() : "horário"} de ${a.pets?.nome ?? "seu pet"} às ${hora(a.inicio)}`);
  const lista = `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  return `${tutor ? `Oi, ${chamar(tutor)}!` : "Oi!"} Aqui é do ${petshop}. Passando para lembrar dos horários de ${dataAmigavel(ags[0].inicio)}: ${lista}. Posso confirmar?`;
}

/** Marca o lembrete como enviado nos horários (o mesmo campo que o detalhe do horário grava). */
function useRegistrarLembrete() {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  return async (ids: string[]) => {
    if (somenteLeitura()) return null;
    const agora = new Date().toISOString();
    try {
      ok(await sb.from("agendamentos").update({ lembrete_em: agora }).eq("petshop_id", petshop.id).in("id", ids).select("id"));
      avisarMudanca();
      return agora;
    } catch (e) { avisarErro(e); return null; }
  };
}

/**
 * Botão redondo de WhatsApp ao lado de um horário que ainda não teve lembrete. Abre a conversa com a mensagem pronta e marca como enviado.
 * Com `doDia` (os horários da tela), o tutor que tem mais de um pet no mesmo dia recebe uma mensagem só, citando todos.
 */
export function BotaoLembrete({ agendamento: a, doDia, aoMandar }: { agendamento: Ag; doDia?: Ag[]; aoMandar?: () => void }) {
  const { petshop } = useGestao();
  const registrar = useRegistrarLembrete();
  if (!precisaDeLembrete(a)) return null;
  const tutorId = a.pets?.clientes?.id;
  const dia = new Date(a.inicio).toDateString();
  const juntos = tutorId && doDia
    ? doDia.filter((x) => x.pets?.clientes?.id === tutorId && new Date(x.inicio).toDateString() === dia && precisaDeLembrete(x)).sort((x, y) => x.inicio.localeCompare(y.inicio))
    : [];
  const grupo = juntos.length > 1 ? juntos : [a];
  const zap = linkWhatsApp(a.pets?.clientes?.telefone, mensagemDoLembrete(grupo, petshop.nome));
  if (!zap) return null;
  const para = `${a.pets?.clientes?.nome ?? a.pets?.nome ?? "o tutor"}${grupo.length > 1 ? ` (${grupo.length} horários numa mensagem só)` : ""}`;
  return (
    <a className="g-lb-zap" href={zap} target="_blank" rel="noopener noreferrer" title={`Mandar lembrete no WhatsApp para ${para}`}
      aria-label={`Mandar lembrete no WhatsApp para ${para}`} onClick={() => { void registrar(grupo.map((x) => x.id)).then((deu) => { if (deu) aoMandar?.(); }); }}>
      <MessageCircle aria-hidden />
    </a>
  );
}

type Grupo = { chave: string; nome: string; telefone: string | null; ficha: string | null; ags: Ag[]; enviadoEm: string | null };

/**
 * Folha "Mandar os lembretes": os tutores com horário no dia, um por linha. Cada toque em Mandar abre o WhatsApp daquele tutor,
 * marca como enviado e destaca o próximo (um por vez: o navegador não deixa abrir várias conversas de uma vez).
 */
export default function LembretesDoDia({ dia, aoFechar, aoMudar }: { dia: string; aoFechar: () => void; aoMudar?: () => void }) {
  const { sb, petshop } = useGestao();
  const registrar = useRegistrarLembrete();
  const data = deIsoDia(dia);
  const [enviados, setEnviados] = useState<Record<string, string>>({});

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const ags = ok(await sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id)
      .gte("inicio", data.toISOString()).lt("inicio", somaDias(data, 1).toISOString()).order("inicio")) as unknown as Ag[];
    const grupos = new Map<string, Grupo>();
    for (const a of ags.filter(esperaLembrete)) {
      const c = a.pets?.clientes;
      const chave = c?.id ?? `pet-${a.pet_id}`;
      const g = grupos.get(chave) ?? { chave, nome: c?.nome ?? a.pets?.nome ?? "Sem tutor", telefone: temTelefone(a) ? c!.telefone : null, ficha: c?.id ? `/gestao/app/clientes?cliente=${c.id}` : a.pets?.id ? `/gestao/app/clientes?pet=${a.pets.id}` : null, ags: [], enviadoEm: null };
      g.ags.push(a);
      grupos.set(chave, g);
    }
    // enviado = todos os horários do tutor neste dia já tiveram lembrete
    return [...grupos.values()].map((g) => ({ ...g, enviadoEm: g.ags.every((a) => a.lembrete_em) ? g.ags.map((a) => a.lembrete_em!).sort().pop()! : null }));
  }, [petshop.id, dia]);

  const grupos = (dados ?? []).map((g) => ({ ...g, enviadoEm: enviados[g.chave] ?? g.enviadoEm }));
  const comTelefone = grupos.filter((g) => g.telefone);
  const semTelefone = grupos.filter((g) => !g.telefone);
  const faltam = comTelefone.filter((g) => !g.enviadoEm);
  const proximo = faltam[0]?.chave ?? null;
  const quando = dataAmigavel(data);
  const doDia = quando === "amanhã" || quando === "hoje" ? `de ${quando}` : `de ${dataLonga(data)}`;

  async function mandou(g: Grupo) {
    const em = await registrar(g.ags.map((a) => a.id));
    if (!em) return;
    setEnviados((m) => ({ ...m, [g.chave]: em }));
    aoMudar?.();
  }

  const resumo = (g: Grupo) => g.ags.map((a) => `${a.pets?.nome ?? "Pet"}, ${a.servicos?.nome?.toLowerCase() ?? "horário"} às ${hora(a.inicio)}`).join(" · ");

  return (
    <Folha titulo={`Lembretes ${doDia}`} aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
      {erro && !dados ? (
        <Vazio titulo="Não consegui buscar os horários" texto={erro}><button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button></Vazio>
      ) : carregando && !dados ? <Esqueleto linhas={3} /> : !grupos.length ? (
        <Vazio titulo={`Nenhum horário ${doDia} esperando lembrete`} texto="Só entram os horários marcados ou confirmados." />
      ) : (
        <div className="g-pilha">
          <p className="g-lb-topo" role="status">
            {!comTelefone.length ? "Nenhum tutor deste dia tem telefone na ficha."
              : faltam.length ? <><b>{faltam.length === 1 ? "Falta 1 lembrete" : `Faltam ${faltam.length} lembretes`}</b> de {comTelefone.length}. Toque em Mandar: o WhatsApp abre com a mensagem pronta e você só aperta enviar. Depois volte aqui para o próximo.</>
              : <><Check aria-hidden /><b>Todos os lembretes {doDia} foram mandados.</b></>}
          </p>
          {comTelefone.length > 0 && (
            <div className="g-lb-lista">
              {comTelefone.map((g) => {
                const zap = linkWhatsApp(g.telefone, mensagemDoLembrete(g.ags, petshop.nome))!;
                const vez = g.chave === proximo;
                return (
                  <div key={g.chave} className={`g-lb-linha${vez ? " vez" : ""}${g.enviadoEm ? " feito" : ""}`}>
                    <AvatarPessoa nome={g.nome} />
                    <span className="t">
                      <b>{g.nome}</b>
                      <span>{resumo(g)}</span>
                      <span className="g-tab">{fmtTelefone(g.telefone)}{g.ags.length > 1 ? ` · ${g.ags.length} horários numa mensagem só` : ""}</span>
                    </span>
                    {g.enviadoEm ? (
                      <span className="g-lb-feito">
                        <span className="g-tag verde"><Check size={12} aria-hidden />Enviado às {hora(g.enviadoEm)}</span>
                        <a href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void mandou(g)}>Mandar de novo</a>
                      </span>
                    ) : (
                      <a className={`g-btn ${vez ? "zap" : "sec"}`} href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void mandou(g)}
                        aria-label={`Mandar lembrete para ${g.nome}`}>
                        <MessageCircle />Mandar
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {semTelefone.length > 0 && (
            <section>
              <p className="g-rotulo" style={{ marginBottom: 6 }}>Sem telefone</p>
              <div className="g-lb-lista">
                {semTelefone.map((g) => (
                  <div key={g.chave} className="g-lb-linha sem">
                    <span className="g-lb-sem" aria-hidden><PhoneOff /></span>
                    <span className="t">
                      <b>{g.nome}</b>
                      <span>{resumo(g)}</span>
                    </span>
                    {g.ficha && <Link className="g-btn sec" href={g.ficha}>Ver ficha</Link>}
                  </div>
                ))}
              </div>
              <p className="g-muted g-pp" style={{ marginTop: 6 }}>Coloque o telefone na ficha do tutor para mandar o lembrete.</p>
            </section>
          )}
        </div>
      )}
    </Folha>
  );
}
