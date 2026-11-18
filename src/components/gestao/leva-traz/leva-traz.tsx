"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, MapPin, MessageCircle, Navigation, Phone, Printer, Truck, Undo2 } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO } from "@/lib/gestao/tipos";
import { nomeDosServicos } from "@/lib/gestao/servicos-do-horario";
import { dataAmigavel, dataLonga, deIsoDia, fmtTelefone, hora, horarioDoDia, isoDia, linkWhatsApp, mesmoDia, somaDias, telefoneLimpo } from "@/lib/gestao/util";
import { lerPresencas, montarChamada, taxiDe, type PlanoCompleto } from "@/lib/gestao/creche";
import { lerCalendarioUmaVez } from "@/lib/gestao/feriados";
import { nomeDaCasa, usaModulo } from "@/lib/gestao/modulos";
import {
  alertasDoPet, juntarViagens, linkDaRota, linkDoMapa, montarViagens, textoChegando, viagensDaEstadia, MAX_PARADAS,
  type EstadiaLevaTraz, type Etapa, type LinhaQuadro, type Viagem, type ViagemFeita,
} from "@/lib/gestao/quadro";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPet, DICA_SO_CONSULTA, Esqueleto, Vazio, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import LogoLoja from "@/components/gestao/logo-loja";
import "./leva-traz.css";

type Tutor = { id: string; nome: string; telefone: string | null; endereco: string | null };
type Horario = AgendamentoCompleto & { pets: (NonNullable<AgendamentoCompleto["pets"]> & { clientes: Tutor | null }) | null };
const SELECT = SELECT_AGENDAMENTO.replace("clientes(id, nome, telefone)", "clientes(id, nome, telefone, endereco)");
type PetDaEstadiaLT = { id: string; nome: string; foto: string | null; especie: string | null; alertas: string | null; clientes: Tutor | null };
type EstadiaLT = EstadiaLevaTraz & { obs: string | null; pets: PetDaEstadiaLT | null };
const SELECT_ESTADIA_LT = "id, tipo, entrada, saida_prevista, saida, status, mensalista, obs, leva_traz_buscar, leva_traz_levar, endereco_leva_traz, pets(id, nome, foto, especie, alertas, clientes(id, nome, telefone, endereco))";

/** O que a linha precisa saber do pet, venha de um horário ou de uma estadia. */
type Item = { pet: PetDaEstadiaLT | Horario["pets"]; tutor: Tutor | null; detalhe: string; obs: string | null; status: string; estadia: boolean };
/** Táxi do mensalista: a viagem é do plano e do dia (não precisa de reserva). */
type ViagemMensalista = Viagem & { planoId: string; dia: string };
const SELECT_PLANO_TAXI = "*, pets(id, nome, foto, especie, sexo, alertas, ativo, clientes(id, nome, telefone, endereco))";

/**
 * As viagens do táxi dos mensalistas num dia: quem tem táxi no plano e é esperado (ou já veio) na chamada. Buscar fica na hora
 * em que a creche abre; levar, na hora em que fecha, e só fica pronto depois que o pet chegou. Quem faltou sai da lista.
 */
async function viagensDosMensalistas(sb: ReturnType<typeof useGestao>["sb"], petshopId: string, horario: unknown, dia: string) {
  const r = await sb.from("creche_planos").select(SELECT_PLANO_TAXI).eq("petshop_id", petshopId).not("taxi", "is", null).lte("inicio", dia).limit(1000);
  if (r.error) return { viagens: [] as ViagemMensalista[], planos: [] as PlanoCompleto[] };
  const planos = ((r.data ?? []) as unknown as PlanoCompleto[]).filter((p) => !p.fim || p.fim >= dia).map((p) => ({ ...p, valor_mensal: null, valor_extra: null, temValor: false }));
  if (!planos.length) return { viagens: [] as ViagemMensalista[], planos };
  const [mov, feitas] = await Promise.all([
    lerPresencas(sb, petshopId, dia, dia),
    sb.from("creche_taxi_viagens").select("plano_id, perna, feito_em, feito_por").eq("petshop_id", petshopId).eq("dia", dia),
    lerCalendarioUmaVez(sb, petshopId, false).catch(() => null),
  ]);
  const feita = new Map(((feitas.data ?? []) as { plano_id: string; perna: string; feito_em: string; feito_por: string | null }[]).map((x) => [`${x.plano_id}:${x.perna}`, x]));
  const h = horarioDoDia(horario, deIsoDia(dia));
  const naHora = (hh: string) => { const d = deIsoDia(dia); const [a, m] = hh.split(":").map(Number); d.setHours(a, m || 0, 0, 0); return d.toISOString(); };
  const viagens: ViagemMensalista[] = [];
  for (const l of montarChamada(planos, dia, mov.presencas, mov.faltas, horario)) {
    const taxi = taxiDe(l.plano);
    if (!taxi || l.estado === "faltou") continue;
    const endereco = (l.plano.pets?.clientes as Tutor | null | undefined)?.endereco?.trim() || null;
    const chegou = l.estado === "na_casa" || l.estado === "saiu";
    for (const perna of (taxi === "ida" ? ["buscar"] : taxi === "volta" ? ["levar"] : ["buscar", "levar"]) as ("buscar" | "levar")[]) {
      const f = feita.get(`${l.plano.id}:${perna}`);
      const quando = perna === "buscar" ? (l.presenca?.entrada && chegou ? l.presenca.entrada : naHora(h?.abre.slice(0, 5) ?? "08:00"))
        : (l.presenca?.saida ?? naHora(h?.fecha.slice(0, 5) ?? "18:00"));
      viagens.push({ chave: `m${l.plano.id}:${perna}`, agendamentoId: null, estadiaId: null, perna, quando, pronto: perna === "buscar" || chegou, prontoEm: null,
        feitoEm: f?.feito_em ?? null, feitoPor: f?.feito_por ?? null, endereco, planoId: l.plano.id, dia });
    }
  }
  return { viagens, planos };
}

/**
 * Leva e traz do dia, para quem dirige: buscar o pet na casa do tutor e levar de volta, na ordem do relógio. Junta os horários do
 * banho e tosa (quem tem Agenda) e as estadias da creche e do hotel (quem tem Creche e hotel).
 * Endereço no Google Maps, ligar ou mandar "estou chegando" no WhatsApp, a rota com todos e "Buscado" / "Entregue" com a hora.
 * Imprime numa folha (o navegador salva em PDF). `origem`: de onde a pessoa veio (o botão de voltar).
 */
function LevaTraz({ origem }: { origem: "agenda" | "casa" }) {
  const { sb, petshop, equipe, liberado, posso } = useGestao();
  const params = useSearchParams();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [dia, setDia] = useState(() => params.get("dia") ?? isoDia(new Date()));
  const [todas, setTodas] = useState(false);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const data = deIsoDia(dia);
  const ehHoje = mesmoDia(data, new Date());
  const veHorarios = posso("agenda"), veEstadias = posso("creche_hotel");
  useEffect(() => {
    const antes = document.title;
    document.title = `Leva e traz de ${dia.split("-").reverse().join("-")} · ${petshop.nome}`;
    return () => { document.title = antes; };
  }, [dia, petshop.nome]);

  const comCreche = veEstadias && usaModulo(petshop, "creche");
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    // o táxi dos mensalistas (plano com táxi) corre junto das outras leituras
    const mensP = comCreche ? viagensDosMensalistas(sb, petshop.id, petshop.horario, dia).catch(() => ({ viagens: [] as ViagemMensalista[], planos: [] as PlanoCompleto[] }))
      : Promise.resolve({ viagens: [] as ViagemMensalista[], planos: [] as PlanoCompleto[] });
    const [ags, ests] = await Promise.all([
      veHorarios ? sb.from("agendamentos").select(SELECT).eq("petshop_id", petshop.id).eq("leva_traz", true)
        .gte("inicio", data.toISOString()).lt("inicio", somaDias(data, 1).toISOString()).order("inicio").then((r) => ok(r) as unknown as Horario[]) : Promise.resolve([] as Horario[]),
      // estadias que podem ter viagem no dia: entraram até o fim do dia (nos últimos 120 dias) e ainda não foram canceladas
      veEstadias ? sb.from("estadias").select(SELECT_ESTADIA_LT).eq("petshop_id", petshop.id).neq("status", "cancelada").is("mensalista", null)
        .or("leva_traz_buscar.eq.true,leva_traz_levar.eq.true").lt("entrada", somaDias(data, 1).toISOString()).gte("entrada", somaDias(data, -120).toISOString())
        .order("entrada").limit(500).then((r) => ok(r) as unknown as EstadiaLT[]) : Promise.resolve([] as EstadiaLT[]),
    ]);
    const ids = ags.map((a) => a.id);
    const [v, q] = ids.length ? await Promise.all([
      sb.from("leva_traz_viagens").select("agendamento_id, perna, feito_em, feito_por").eq("petshop_id", petshop.id).in("agendamento_id", ids),
      sb.from("quadro_atendimento").select("agendamento_id, etapa, etapa_em, chegou_em, entregue_em").eq("petshop_id", petshop.id).in("agendamento_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (v.error) throw new Error(v.error.message);
    const feitas = new Map(((v.data ?? []) as (ViagemFeita & { agendamento_id: string })[]).map((x) => [`${x.agendamento_id}:${x.perna}`, x]));
    const quadro = new Map(((q.error ? [] : q.data ?? []) as (LinhaQuadro & { agendamento_id: string })[]).map((x) => [x.agendamento_id, { ...x, etapa: x.etapa as Etapa | null }]));
    // as estadias com viagem neste dia, e as viagens já feitas delas
    const doDia = ests.filter((e) => viagensDaEstadia(e, dia, new Map()).length > 0);
    const eIds = doDia.map((e) => e.id);
    const ve = eIds.length ? await sb.from("leva_traz_estadias").select("estadia_id, perna, feito_em, feito_por").eq("petshop_id", petshop.id).in("estadia_id", eIds) : { data: [], error: null };
    if (ve.error) throw new Error(ve.error.message);
    const feitasE = new Map(((ve.data ?? []) as (ViagemFeita & { estadia_id: string })[]).map((x) => [`${x.estadia_id}:${x.perna}`, x]));
    const mens = await mensP;
    return { ags, ests: doDia, mens: mens.planos, viagens: juntarViagens(montarViagens(ags, quadro, feitas), ...doDia.map((e) => viagensDaEstadia(e, dia, feitasE)), mens.viagens) };
  }, [petshop.id, dia, veHorarios, veEstadias, comCreche]);

  // de hoje: atualiza sozinho a cada minuto (o pet fica pronto no banho enquanto o motorista está na rua)
  useEffect(() => {
    if (!ehHoje) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void recarregar(); }, 60000);
    return () => clearInterval(t);
  }, [ehHoje, recarregar]);

  const itens = useMemo(() => {
    const m = new Map<string, Item>();
    for (const a of dados?.ags ?? []) m.set(a.id, { pet: a.pets, tutor: a.pets?.clientes ?? null, detalhe: nomeDosServicos(a) ?? "", obs: a.obs, status: a.status, estadia: false });
    for (const e of dados?.ests ?? []) {
      m.set(`e${e.id}`, { pet: e.pets, tutor: e.pets?.clientes ?? null, detalhe: e.tipo === "hotel" ? "Hotel" : "Creche", obs: e.obs, status: e.status, estadia: true });
    }
    for (const p of dados?.mens ?? []) {
      const pet = p.pets as unknown as PetDaEstadiaLT | null;
      const chegou = (dados?.viagens ?? []).some((v) => (v as ViagemMensalista).planoId === p.id && v.perna === "levar" && v.pronto);
      m.set(`m${p.id}`, { pet, tutor: pet?.clientes ?? null, detalhe: "Creche · mensalista", obs: null, status: chegou ? "em_casa" : "reservada", estadia: true });
    }
    return m;
  }, [dados]);
  const planoDa = (v: Viagem) => (v as Partial<ViagemMensalista>).planoId ?? null;
  const itemDe = (v: Viagem) => itens.get(planoDa(v) ? `m${planoDa(v)}` : v.estadiaId ? `e${v.estadiaId}` : v.agendamentoId ?? "");
  const viagens = dados?.viagens ?? [];
  const faltam = viagens.filter((v) => !v.feitoEm);
  const mostradas = todas ? viagens : faltam;
  const cidade = [petshop.cidade, petshop.uf].filter(Boolean).join(" - ");
  // a rota leva só o que falta fazer e já dá para fazer (levar de volta só depois de pronto), na ordem da lista
  const paraRota = faltam.filter((v) => v.endereco && (v.perna === "buscar" || v.pronto));
  const rota = linkDaRota(paraRota.map((v) => v.endereco!), cidade);
  const nomeDe = (userId: string | null) => (userId ? equipe.find((p) => p.user_id === userId)?.nome.split(" ")[0] ?? null : null);
  const ainda = (status: string) => status === "marcado" || status === "confirmado" || status === "reservada";

  async function marcar(v: Viagem, feito: boolean) {
    if (somenteLeitura() || mexendo) return;
    setMexendo(v.chave);
    try {
      const m = v as Partial<ViagemMensalista>;
      const r = m.planoId && m.dia
        ? await sb.rpc("creche_taxi_viagem_marcar", { p_petshop: petshop.id, p_plano: m.planoId, p_dia: m.dia, p_perna: v.perna, p_feito: feito })
        : v.estadiaId
        ? await sb.rpc("leva_traz_estadia_marcar", { p_petshop: petshop.id, p_estadia: v.estadiaId, p_perna: v.perna, p_feito: feito })
        : await sb.rpc("leva_traz_marcar", { p_petshop: petshop.id, p_agendamento: v.agendamentoId!, p_perna: v.perna, p_feito: feito });
      if (r.error) throw new Error(r.error.message);
      const pet = itemDe(v)?.pet?.nome ?? "Pet";
      avisar(feito ? `${pet}: ${v.perna === "buscar" ? "buscado" : "entregue em casa"}.` : "Desfeito.");
      avisarMudanca();
      await recarregar();
    } catch (e) { avisarErro(e); } finally { setMexendo(null); }
  }

  const casa = nomeDaCasa(petshop);
  const voltar = origem === "casa" ? { href: "/gestao/app/creche-hotel", rotulo: casa } : { href: `/gestao/app/agenda?dia=${dia}`, rotulo: "Agenda" };
  const textoVazio = veHorarios && veEstadias
    ? `Para entrar aqui, marque Leva e traz no horário da Agenda ou na reserva (${casa}), com o endereço.${comCreche ? " Mensalista com táxi no plano aparece sozinho nos dias do plano." : ""}`
    : veEstadias ? `Para uma estadia entrar aqui, marque Leva e traz na reserva ou no check-in (${casa}), com o endereço.${comCreche ? " Mensalista com táxi no plano aparece sozinho nos dias do plano." : ""}`
    : "Para um horário entrar aqui, marque Leva e traz ao marcar ou alterar o horário na Agenda e escreva o endereço.";

  return (
    <>
      <header className="g-topo g-lt-topo">
        <div>
          <h1>Leva e traz</h1>
          <p className="g-muted">{ehHoje ? "Hoje, " : ""}{dataLonga(data)}</p>
        </div>
        <div className="g-acoes">
          <Link className="g-btn sec" href={voltar.href}><ArrowLeft />{voltar.rotulo}</Link>
          <button type="button" className="g-btn sec" onClick={() => window.print()}><Printer />Imprimir</button>
        </div>
      </header>

      <div className="g-pilha">
        <div className="g-fila g-card g-lt-dia">
          <button className="g-ico" aria-label="Dia anterior" onClick={() => setDia(isoDia(somaDias(data, -1)))}><ChevronLeft /></button>
          <b className="g-cresce" style={{ textAlign: "center" }}>{dataAmigavel(data).replace(/^./, (c) => c.toUpperCase())}</b>
          <button className="g-ico" aria-label="Próximo dia" onClick={() => setDia(isoDia(somaDias(data, 1)))}><ChevronRight /></button>
        </div>

        {viagens.length > 0 && (
          <div className="g-pilha p g-lt-rota">
            {rota ? (
              <a className="g-btn pri cheio" href={rota.url} target="_blank" rel="noopener noreferrer"><Navigation />Abrir rota com todos ({rota.usados} {rota.usados === 1 ? "parada" : "paradas"})</a>
            ) : <p className="g-pp g-muted" style={{ margin: 0 }}>{faltam.length ? "Nenhuma viagem com endereço para montar a rota agora." : "Todas as viagens do dia estão feitas."}</p>}
            {rota && rota.sobraram > 0 && <p className="g-pp g-muted" style={{ margin: 0 }}>O Google Maps abre até {MAX_PARADAS} paradas de uma vez: a rota leva as {MAX_PARADAS} primeiras. Depois de fazer essas, toque de novo.</p>}
            {rota && <p className="g-pp g-muted" style={{ margin: 0 }}>A rota sai de onde você está, na ordem da lista. Levar de volta só entra depois que o pet fica pronto (ou, na creche e no hotel, depois que ele chegou).</p>}
            <div className="g-chips" role="group" aria-label="O que mostrar">
              <button type="button" className="g-chip" aria-pressed={!todas} onClick={() => setTodas(false)}>Falta fazer ({faltam.length})</button>
              <button type="button" className="g-chip" aria-pressed={todas} onClick={() => setTodas(true)}>Todas ({viagens.length})</button>
            </div>
          </div>
        )}

        {erro && <p className="g-erro">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={3} /> : !viagens.length ? (
          <div className="g-card">
            <Vazio titulo={ehHoje ? "Nenhum leva e traz hoje" : "Nenhum leva e traz neste dia"} texto={textoVazio} />
          </div>
        ) : !mostradas.length ? (
          <div className="g-card"><Vazio titulo="Tudo feito" texto="Todas as viagens deste dia já foram marcadas. Toque em Todas para ver as horas." /></div>
        ) : (
          <ol className="g-lt-lista">
            {mostradas.map((v) => {
              const it = itemDe(v);
              if (!it) return null;
              const tutor = it.tutor;
              const tel = telefoneLimpo(tutor?.telefone);
              const zap = linkWhatsApp(tutor?.telefone, textoChegando({ tutor: tutor?.nome, pet: it.pet?.nome ?? "o pet", petshop: petshop.nome, perna: v.perna }));
              const alertas = alertasDoPet(it.pet?.alertas);
              const quem = nomeDe(v.feitoPor);
              const espera = v.perna === "levar" && !v.pronto && !v.feitoEm;
              const naoChegou = v.perna === "levar" && ainda(it.status);
              return (
                <li key={v.chave} className={`g-lt-item ${v.perna}${v.feitoEm ? " feito" : ""}`}>
                  <div className="g-lt-cab">
                    <span className={`g-lt-perna ${v.perna}`}>{v.perna === "buscar" ? "Buscar" : "Levar de volta"}</span>
                    <b className="g-tab">{v.perna === "buscar" ? `até ${hora(v.quando)}` : it.estadia ? `saída ${hora(v.quando)}` : v.pronto ? (v.prontoEm ? `pronto às ${hora(v.prontoEm)}` : "pronto") : `previsto ${hora(v.quando)}`}</b>
                    <i className="g-lt-caixa" aria-hidden />
                  </div>
                  <div className="g-lt-quem">
                    {it.pet && <AvatarPet pet={it.pet} />}
                    <div className="t">
                      <b>{it.pet?.nome ?? "Pet"}</b>
                      <span>{[tutor?.nome, it.detalhe].filter(Boolean).join(" · ")}</span>
                    </div>
                  </div>
                  <p className="g-lt-end"><MapPin aria-hidden />{v.endereco ?? <span className="g-muted">Sem endereço. Confira com o tutor ou na ficha.</span>}</p>
                  {tel && <p className="g-lt-tel g-tab">{fmtTelefone(tutor?.telefone)}</p>}
                  {(alertas.length > 0 || it.obs) && (
                    <div className="g-lt-obs">
                      {alertas.map((x) => <span key={x} className="g-tag vermelho">{x}</span>)}
                      {it.obs && <p className="g-pp">{it.obs}</p>}
                    </div>
                  )}
                  {espera && <p className="g-pp g-muted g-lt-espera">{naoChegou ? (it.estadia ? "O pet ainda não fez o check-in." : "O pet ainda não chegou ao pet shop.") : "Ainda não está pronto. Quando ficar, a lista mostra “pronto”."}</p>}
                  <div className="g-lt-bts">
                    {v.endereco && <a className="g-btn sec" href={linkDoMapa(v.endereco, cidade)} target="_blank" rel="noopener noreferrer"><MapPin />Mapa</a>}
                    {tel && <a className="g-btn sec" href={`tel:${tel.length <= 11 ? `+55${tel}` : `+${tel}`}`}><Phone />Ligar</a>}
                    {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Estou chegando</a>}
                  </div>
                  {v.feitoEm ? (
                    <div className="g-lt-feito">
                      <span><Check aria-hidden />{v.perna === "buscar" ? "Buscado" : "Entregue"} às {hora(v.feitoEm)}{quem ? ` por ${quem}` : ""}</span>
                      <button type="button" className="g-btn fantasma p" disabled={mexendo === v.chave || !liberado} onClick={() => void marcar(v, false)}><Undo2 />Desfazer</button>
                    </div>
                  ) : (
                    <button type="button" className="g-btn verde cheio g-lt-marcar" disabled={mexendo === v.chave || !liberado || naoChegou}
                      title={liberado ? undefined : DICA_SO_CONSULTA} onClick={() => void marcar(v, true)}>
                      <Truck />{v.perna === "buscar" ? "Buscado" : "Entregue em casa"}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* folha para imprimir: todas as viagens, com caixa para marcar à mão */}
      <section className="g-lt-papel">
        <div className="g-lt-papel-cab">
          <LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={36} padrao="selo" />
          <div><h2>Leva e traz · {petshop.nome}</h2><p>{dataLonga(data)} · {viagens.length} {viagens.length === 1 ? "viagem" : "viagens"}</p></div>
        </div>
        <table>
          <thead><tr><th>Hora</th><th>O quê</th><th>Pet e tutor</th><th>Endereço</th><th>Feito</th></tr></thead>
          <tbody>
            {viagens.map((v) => {
              const it = itemDe(v);
              if (!it) return null;
              return (
                <tr key={v.chave}>
                  <td className="g-tab">{hora(v.quando)}</td>
                  <td>{v.perna === "buscar" ? "Buscar" : "Levar"}{it.estadia ? ` (${it.detalhe.toLowerCase()})` : ""}</td>
                  <td><b>{it.pet?.nome}</b><small>{it.tutor?.nome}{it.tutor?.telefone ? ` · ${fmtTelefone(it.tutor.telefone)}` : ""}</small>{it.pet?.alertas && <small>Atenção: {it.pet.alertas}</small>}{it.obs && <small>{it.obs}</small>}</td>
                  <td>{v.endereco ?? "—"}</td>
                  <td className="feito">{v.feitoEm ? hora(v.feitoEm) : <i />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

export default function PaginaLevaTraz({ origem }: { origem: "agenda" | "casa" }) {
  return <Suspense fallback={<Esqueleto linhas={3} />}><LevaTraz origem={origem} /></Suspense>;
}
