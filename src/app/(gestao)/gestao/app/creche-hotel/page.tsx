"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarCheck, DoorOpen, Home, LogIn, LogOut, MessageCircle, Moon, NotebookPen, Pencil, Plus, Sun, Sunset, Syringe } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import FormPet from "@/components/gestao/form-pet";
import { Kpi } from "@/components/gestao/painel";
import { AvatarPet, avisarMudanca, Campo, CampoValor, EscolherPet, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { Chips, ChipsForma, ErroTela, type Forma } from "@/components/gestao/loja/pecas";
import { cuidadosVigentes, estadoSaude, type CuidadoResumido } from "@/components/gestao/clientes/saude";
import { lancarPago } from "@/lib/gestao/dinheiro";
import type { Banco } from "@/lib/gestao/supabase";
import type { Cliente, Estadia, PacoteCliente, Pet, Petshop, Servico } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, hora, inicioDoDia, isoDia, juntaDiaHora, linkWhatsApp, somaDias } from "@/lib/gestao/util";
import "./creche-hotel.css";

type PetDaEstadia = Pick<Pet, "id" | "nome" | "foto" | "especie" | "sexo" | "alertas"> & { clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null };
type EstadiaCompleta = Estadia & { pets: PetDaEstadia | null };
const SELECT = "*, pets(id, nome, foto, especie, sexo, alertas, clientes(id, nome, telefone))";

type Tipo = "creche" | "hotel";
const TIPOS = [{ id: "creche", rotulo: "Creche" }, { id: "hotel", rotulo: "Hotel" }] as const;
const FILTRO_TIPO = [{ id: "todos", rotulo: "Todos" }, ...TIPOS] as const;
type Aba = "casa" | "reservas" | "historico";

/** "8h" ou "8h30" */
const horaCurta = (d: string | Date) => { const x = new Date(d); return x.getMinutes() ? `${x.getHours()}h${String(x.getMinutes()).padStart(2, "0")}` : `${x.getHours()}h`; };
/** "ontem, 8h" */
const quando = (d: string | Date) => `${dataAmigavel(new Date(d))}, ${horaCurta(d)}`;
const nomeTipo = (t: string) => (t === "hotel" ? "Hotel" : "Creche");
const primeiroNome = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] ?? "";

/** Hotel cobra por noite; creche cobra por dia em que o pet esteve aqui. Sempre pelo menos 1. */
function contarDiarias(e: Pick<Estadia, "tipo" | "entrada">, fim: Date) {
  const dias = Math.round((inicioDoDia(fim).getTime() - inicioDoDia(new Date(e.entrada)).getTime()) / 864e5);
  return Math.max(1, e.tipo === "hotel" ? dias : dias + 1);
}

type Periodo = Pick<Estadia, "tipo" | "entrada" | "saida_prevista" | "status">;

/**
 * Dias (AAAA-MM-DD) que a estadia ocupa uma vaga. Creche: da entrada à saída prevista, os dois dias contam.
 * Hotel: as noites (o dia da saída não conta). Sem saída prevista, vale o dia da entrada; quem ainda está na casa ocupa até hoje.
 */
function diasOcupados(e: Periodo, hoje: Date): string[] {
  const ini = inicioDoDia(new Date(e.entrada));
  let fim = e.saida_prevista ? inicioDoDia(new Date(e.saida_prevista)) : ini;
  if (e.tipo === "hotel" && fim > ini) fim = somaDias(fim, -1);
  if (e.status === "em_casa" && inicioDoDia(hoje) > fim) fim = inicioDoDia(hoje);
  const dias: string[] = [];
  for (let d = ini; d <= fim && dias.length < 120; d = somaDias(d, 1)) dias.push(isoDia(d));
  return dias;
}

/** Outra reserva ou estadia aberta do mesmo pet que bate com o período novo. Quem já está na casa não entra de novo. */
function conflitoDoPet(petId: string, novo: Periodo, abertas: EstadiaCompleta[], ignorar: string | null, hoje: Date): EstadiaCompleta | null {
  const dias = new Set(diasOcupados(novo, hoje));
  for (const e of abertas) {
    if (e.pet_id !== petId || e.id === ignorar) continue;
    if (novo.status === "em_casa" && e.status === "em_casa") return e;
    if (diasOcupados(e, hoje).some((d) => dias.has(d))) return e;
  }
  return null;
}
function fraseConflito(nome: string, e: EstadiaCompleta) {
  if (e.status === "em_casa") return `${nome} já está na casa desde ${quando(e.entrada)}.`;
  const ate = e.saida_prevista && isoDia(new Date(e.saida_prevista)) !== isoDia(new Date(e.entrada)) ? ` a ${dataCurta(e.saida_prevista)}` : "";
  return `${nome} já tem reserva de ${nomeTipo(e.tipo).toLowerCase()} em ${dataCurta(e.entrada)}${ate}. Mude as datas ou edite essa reserva.`;
}
const ehRepetido = (x: unknown) => /estadias_um_na_casa|duplicate key|23505/i.test(x instanceof Error ? x.message : String((x as { message?: unknown })?.message ?? x));

/** Quantas vagas do tipo estão tomadas em cada dia (sem contar a estadia `ignorar`). */
function ocupacao(tipo: string, abertas: EstadiaCompleta[], ignorar: string | null, hoje: Date) {
  const porDia = new Map<string, number>();
  for (const e of abertas) {
    if (e.tipo !== tipo || e.id === ignorar) continue;
    for (const d of diasOcupados(e, hoje)) porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  return porDia;
}
const vagasDoTipo = (p: Petshop, tipo: string) => (tipo === "hotel" ? p.vagas_hotel : p.vagas_creche) ?? null;
const diariaFixa = (p: Petshop, tipo: string) => { const v = tipo === "hotel" ? p.diaria_hotel : p.diaria_creche; return v == null ? null : Number(v); };

/** Vacinas vencidas do pet (só a dose que vale de cada uma), prontas para mostrar. */
async function vacinasVencidas(sb: Banco, petshopId: string, petId: string): Promise<string[]> {
  const r = await sb.from("pets_saude").select("pet_id, tipo, nome, aplicado_em, vence_em, criado_em").eq("petshop_id", petshopId).eq("pet_id", petId).eq("tipo", "vacina").limit(500);
  if (r.error) throw new Error(r.error.message);
  return cuidadosVigentes((r.data ?? []) as CuidadoResumido[]).filter((c) => estadoSaude(c.vence_em) === "vencido")
    .map((c) => `${c.nome} (venceu em ${dataCompleta(c.vence_em!)})`);
}

/** Diárias e total previstos de uma reserva ou estadia (null se a diária não foi combinada). */
function previsto(e: Pick<Estadia, "tipo" | "entrada" | "saida_prevista" | "valor_diaria">) {
  if (e.valor_diaria == null) return null;
  const n = e.saida_prevista ? contarDiarias(e, new Date(e.saida_prevista)) : 1;
  return { n, total: Math.round(n * Number(e.valor_diaria) * 100) / 100, aberto: !e.saida_prevista };
}
function LinhaValor({ e }: { e: EstadiaCompleta }) {
  const p = previsto(e);
  if (!p) return <p className="g-ch-valor g-muted">Diária não combinada</p>;
  return (
    <p className="g-ch-valor">
      <span>Diária <b className="g-tab">{brl(e.valor_diaria)}</b></span>
      {Number(e.valor_diaria) === 0 ? <span className="g-tag">cortesia</span>
        : p.aberto ? <span className="g-muted">sem saída prevista</span>
        : <span>Total previsto <b className="g-tab">{brl(p.total)}</b> <span className="g-muted">({p.n} {p.n === 1 ? "diária" : "diárias"})</span></span>}
    </p>
  );
}

function mensagem(e: EstadiaCompleta, petshop: string, reserva: boolean) {
  const pet = e.pets;
  if (!pet) return "";
  const oi = `Oi${primeiroNome(pet.clientes?.nome) ? `, ${primeiroNome(pet.clientes?.nome)}` : ""}!`;
  const lugar = e.tipo === "hotel" ? "no hotel" : "na creche";
  if (reserva) {
    const art = pet.sexo === "M" ? "do " : pet.sexo === "F" ? "da " : "de ";
    return `${oi} Confirmando a reserva ${art}${pet.nome} ${lugar} do ${petshop}: ${dataAmigavel(new Date(e.entrada))}, às ${hora(e.entrada)}. Até lá!`;
  }
  const bem = pet.sexo === "M" ? `O ${pet.nome} está ótimo` : pet.sexo === "F" ? `A ${pet.nome} está ótima` : `${pet.nome} está muito bem`;
  return `${oi} ${bem} aqui ${lugar} do ${petshop}.`;
}

/** Etiqueta colorida do tipo: creche é dia (manteiga), hotel é noite (céu). */
function EtiquetaTipo({ tipo, curta }: { tipo: string; curta?: boolean }) {
  const Icone = tipo === "hotel" ? Moon : Sun;
  return <span className={`g-ch-tipo ${tipo === "hotel" ? "hotel" : "creche"}${curta ? " curta" : ""}`} title={nomeTipo(tipo)}><Icone aria-hidden /><em>{nomeTipo(tipo)}</em></span>;
}

/** Indicador que também é botão: toca e a tela abre naquela aba. */
function KpiAcao({ ativo, aoTocar, children }: { ativo: boolean; aoTocar: () => void; children: React.ReactNode }) {
  return (
    <div className="g-ch-kpi-acao" role="button" tabIndex={0} aria-pressed={ativo} onClick={aoTocar}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoTocar(); } }}>
      {children}
    </div>
  );
}

function BotaoZap({ e, reserva }: { e: EstadiaCompleta; reserva?: boolean }) {
  const { petshop } = useGestao();
  const link = linkWhatsApp(e.pets?.clientes?.telefone, mensagem(e, petshop.nome, Boolean(reserva)));
  if (!link) return null;
  return <a className="g-btn zap p" href={link} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp</a>;
}

export default function CrecheHotel() {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [aba, setAba] = useState<Aba>("casa");
  const [tipo, setTipo] = useState<"todos" | Tipo>("todos");
  const [nova, setNova] = useState(false);
  const [editando, setEditando] = useState<EstadiaCompleta | null>(null);
  const [lote, setLote] = useState(false);
  const [saindo, setSaindo] = useState<EstadiaCompleta | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [abertas, passadas] = await Promise.all([
      sb.from("estadias").select(SELECT).eq("petshop_id", petshop.id).in("status", ["reservada", "em_casa"]).order("entrada").limit(500),
      sb.from("estadias").select(SELECT).eq("petshop_id", petshop.id).in("status", ["encerrada", "cancelada"]).order("entrada", { ascending: false }).limit(100),
    ]);
    return { abertas: ok(abertas) as unknown as EstadiaCompleta[], passadas: ok(passadas) as unknown as EstadiaCompleta[] };
  }, [petshop.id]);

  const doTipo = (e: EstadiaCompleta) => tipo === "todos" || e.tipo === tipo;
  const naCasa = useMemo(() => (dados?.abertas ?? []).filter((e) => e.status === "em_casa"), [dados]);
  const reservas = useMemo(() => (dados?.abertas ?? []).filter((e) => e.status === "reservada"), [dados]);
  const historico = dados?.passadas ?? [];
  const tudoVazio = Boolean(dados) && !naCasa.length && !reservas.length && !historico.length;

  const mudou = () => { void recarregar(); avisarMudanca(); };
  const abrirNova = () => { if (!somenteLeitura()) setNova(true); };

  async function checkIn(e: EstadiaCompleta) {
    if (somenteLeitura()) return;
    const nome = e.pets?.nome ?? "O pet";
    // o mesmo pet não entra duas vezes na casa
    const jaAqui = (dados?.abertas ?? []).find((x) => x.pet_id === e.pet_id && x.id !== e.id && x.status === "em_casa");
    if (jaAqui) { avisarErro(fraseConflito(nome, jaAqui)); return; }
    setOcupado(e.id);
    try {
      const vencidas = await vacinasVencidas(sb, petshop.id, e.pet_id).catch(() => []);
      if (vencidas.length && !(await confirmar({
        titulo: `${nome} está com vacina vencida`,
        texto: `${vencidas.join(", ")}. Confira a carteirinha antes de receber o pet.`,
        confirmar: "Fazer check-in mesmo assim", perigo: true,
      }))) return;
      const r = ok(await sb.from("estadias").update({ status: "em_casa", entrada: new Date().toISOString() })
        .eq("id", e.id).eq("petshop_id", petshop.id).eq("status", "reservada").select("id"));
      if (!r.length) avisar("Essa reserva já tinha sido alterada. Atualizei a lista.");
      else avisar(`${nome} chegou.`);
      mudou();
    } catch (x) {
      if (ehRepetido(x)) { avisarErro(`${nome} já está na casa. Atualizei a lista.`); mudou(); }
      else avisarErro(x);
    } finally { setOcupado(null); }
  }

  async function cancelar(e: EstadiaCompleta) {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Cancelar esta reserva?", texto: `${e.pets?.nome ?? "O pet"}, ${nomeTipo(e.tipo).toLowerCase()} ${dataAmigavel(new Date(e.entrada))}.`, confirmar: "Cancelar reserva", perigo: true }))) return;
    try {
      ok(await sb.from("estadias").update({ status: "cancelada" }).eq("id", e.id).eq("petshop_id", petshop.id).eq("status", "reservada").select("id"));
      avisar("Reserva cancelada.");
      mudou();
    } catch (x) { avisarErro(x); }
  }

  const agora = new Date();
  const hoje0 = inicioDoDia(agora).getTime();
  const hojeIso = isoDia(agora);

  // números do topo: saem das estadias abertas que a tela já carregou
  const chegamHoje = reservas.filter((e) => isoDia(new Date(e.entrada)) === hojeIso);
  const saemHoje = naCasa.filter((e) => e.saida_prevista && isoDia(new Date(e.saida_prevista)) === hojeIso);
  const atrasadas = naCasa.filter((e) => e.saida_prevista && new Date(e.saida_prevista) < agora);
  const crecheNaCasa = naCasa.filter((e) => e.tipo === "creche");
  // vagas de hoje, por tipo: conta quem está na casa e quem tem reserva para hoje
  const vagasHoje = TIPOS.map((t) => ({ ...t, total: vagasDoTipo(petshop, t.id), ocupadas: ocupacao(t.id, dados?.abertas ?? [], null, agora).get(hojeIso) ?? 0 }))
    .filter((v) => v.total != null);
  const noHotel = naCasa.filter((e) => e.tipo === "hotel").length;
  const proximaReserva = reservas.find((e) => new Date(e.entrada).getTime() >= hoje0);

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Creche e hotel</h1>
          <p className="g-muted">
            {naCasa.length ? `${naCasa.length} ${naCasa.length === 1 ? "pet na casa agora" : "pets na casa agora"}` : "Quem está aqui, quem vem e quem já foi."}
          </p>
        </div>
        <div className="g-acoes">
          <button className="g-btn pri" onClick={abrirNova}><Plus /> Nova reserva / Check-in</button>
        </div>
      </header>

      {erro && <ErroTela erro={erro} aoTentar={() => void recarregar()} />}

      {carregando && !dados ? <Esqueleto linhas={4} /> : !dados ? null : tudoVazio ? (
        <Vazio titulo="Nenhum hóspede ainda" texto="Quando um pet vier passar o dia ou dormir aqui, faça o check-in e acompanhe por esta tela." mozart="acenando">
          <button className="g-btn sec" onClick={abrirNova}>Fazer o primeiro check-in</button>
        </Vazio>
      ) : (
        <div className="g-pilha">
          <div className="g-grade kpis">
            <KpiAcao ativo={aba === "casa"} aoTocar={() => setAba("casa")}>
              <Kpi icone={Home} tom="ceu" rotulo="Na casa agora" valor={naCasa.length}
                apoio={naCasa.length ? [naCasa.length - noHotel && `${naCasa.length - noHotel} na creche`, noHotel && `${noHotel} no hotel`].filter(Boolean).join(" · ") : "a casa está vazia"} />
            </KpiAcao>
            <KpiAcao ativo={false} aoTocar={() => setAba("reservas")}>
              <Kpi icone={LogIn} tom="menta" rotulo="Chegam hoje" valor={chegamHoje.length}
                apoio={chegamHoje.length ? chegamHoje.slice(0, 2).map((e) => e.pets?.nome).filter(Boolean).join(", ") + (chegamHoje.length > 2 ? ` e mais ${chegamHoje.length - 2}` : "") : "nenhuma reserva para hoje"} />
            </KpiAcao>
            <KpiAcao ativo={false} aoTocar={() => setAba("casa")}>
              <Kpi icone={DoorOpen} tom="pessego" rotulo="Saem hoje" valor={saemHoje.length}
                apoio={saemHoje.length ? saemHoje.slice(0, 2).map((e) => e.pets?.nome).filter(Boolean).join(", ") + (saemHoje.length > 2 ? ` e mais ${saemHoje.length - 2}` : "") : "ninguém com saída marcada para hoje"} />
            </KpiAcao>
            <KpiAcao ativo={aba === "reservas"} aoTocar={() => setAba("reservas")}>
              <Kpi icone={CalendarCheck} tom="lilas" rotulo="Reservas" valor={reservas.length}
                apoio={proximaReserva ? `próxima: ${quando(proximaReserva.entrada)}` : reservas.length ? "com a data já passada" : "nenhuma marcada"} />
            </KpiAcao>
          </div>

          {(atrasadas.length > 0 || vagasHoje.length > 0 || crecheNaCasa.length > 0) && (
            <div className="g-ch-faixa">
              {atrasadas.length > 0 && (
                <button type="button" className="g-ch-atraso" onClick={() => setAba("casa")}>
                  <AlertTriangle aria-hidden />
                  <span><b>Saída atrasada: {atrasadas.length}</b> {atrasadas.slice(0, 3).map((e) => e.pets?.nome).filter(Boolean).join(", ")}{atrasadas.length > 3 ? ` e mais ${atrasadas.length - 3}` : ""}</span>
                </button>
              )}
              {vagasHoje.map((v) => (
                <span key={v.id} className={`g-ch-vagas${v.ocupadas >= v.total! ? " cheia" : ""}`}>
                  {v.id === "hotel" ? <Moon aria-hidden /> : <Sun aria-hidden />}
                  <span>{v.rotulo} hoje: <b className="g-tab">{v.ocupadas} de {v.total} vagas</b>{v.ocupadas >= v.total! ? " · casa cheia" : ""}</span>
                </span>
              ))}
              {crecheNaCasa.length > 0 && (
                <button type="button" className="g-btn sec p g-ch-lote" onClick={() => { if (!somenteLeitura()) setLote(true); }}><Sunset />Encerrar o dia da creche</button>
              )}
            </div>
          )}

          <div className="g-fila entre">
            <div className="g-seg ge-abas">
              <button aria-pressed={aba === "casa"} onClick={() => setAba("casa")}>Na casa agora{naCasa.length ? ` (${naCasa.length})` : ""}</button>
              <button aria-pressed={aba === "reservas"} onClick={() => setAba("reservas")}>Reservas{reservas.length ? ` (${reservas.length})` : ""}</button>
              <button aria-pressed={aba === "historico"} onClick={() => setAba("historico")}>Histórico</button>
            </div>
            <Chips opcoes={FILTRO_TIPO} valor={tipo} aoMudar={setTipo} />
          </div>

          {aba === "casa" && (() => {
            const lista = naCasa.filter(doTipo);
            if (!lista.length) return <p className="g-muted g-centro" style={{ padding: "32px 8px" }}>{naCasa.length ? "Ninguém desse tipo na casa agora." : "A casa está vazia agora."}</p>;
            return (
              <div className="g-ch-grade">
                {lista.map((e) => {
                  const pet = e.pets;
                  const entrou = new Date(e.entrada).getTime();
                  const sai = e.saida_prevista ? new Date(e.saida_prevista).getTime() : null;
                  const atrasada = sai != null && sai < agora.getTime();
                  const parte = sai == null ? null : sai <= entrou ? 1 : Math.max(0, Math.min(1, (agora.getTime() - entrou) / (sai - entrou)));
                  const diarias = contarDiarias(e, agora);
                  return (
                    <div key={e.id} className={`g-ch-cartao ${e.tipo === "hotel" ? "hotel" : "creche"}`}>
                      <div className="g-ch-topo">
                        <AvatarPet pet={pet ?? { nome: "?" }} tamanho="g" />
                        <div className="t">
                          <h2>{pet?.nome ?? "Pet removido"}</h2>
                          <span>{pet?.clientes?.nome ?? "Sem tutor"}</span>
                        </div>
                        <EtiquetaTipo tipo={e.tipo} />
                      </div>

                      <div className={`g-ch-periodo${atrasada ? " atrasada" : ""}${parte == null ? " aberta" : ""}`}>
                        <div className="g-fila entre g-pp">
                          <span className="g-muted">{diarias === 1 ? "1ª diária" : `${diarias}ª diária`}</span>
                          {atrasada ? <span className="g-tag vermelho">saída atrasada</span> : parte != null && <span className="g-muted g-tab">{Math.round(parte * 100)}% do período</span>}
                        </div>
                        <div className="g-ch-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parte == null ? undefined : Math.round(parte * 100)} aria-label="Quanto do período já passou">
                          <i style={{ width: `${parte == null ? 100 : Math.max(4, parte * 100)}%` }} />
                        </div>
                        <div className="pontas">
                          <span><small>desde</small><b>{quando(e.entrada)}</b></span>
                          <span className={atrasada ? "g-vermelho-t" : undefined}><small>{e.saida_prevista ? "saída prevista" : "saída"}</small><b>{e.saida_prevista ? quando(e.saida_prevista) : "sem saída prevista"}</b></span>
                        </div>
                      </div>

                      <LinhaValor e={e} />
                      {pet?.alertas && <div className="g-aviso vermelho" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>Atenção:</b> {pet.alertas}</span></div>}
                      {e.obs && <p className="g-ch-obs"><NotebookPen aria-hidden /><span>{e.obs}</span></p>}
                      <div className="g-fila g-ch-acoes">
                        <BotaoZap e={e} />
                        <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setEditando(e); }}><Pencil /> Editar</button>
                        <button className="g-btn verde p" style={{ marginLeft: "auto" }} onClick={() => { if (!somenteLeitura()) setSaindo(e); }}><LogOut /> Check-out</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {aba === "reservas" && (() => {
            const lista = reservas.filter(doTipo);
            if (!lista.length) return <p className="g-muted g-centro" style={{ padding: "32px 8px" }}>Nenhuma reserva marcada.</p>;
            return (
              <div className="g-ch-grade">
                {lista.map((e) => {
                  const pet = e.pets;
                  const dias = Math.round((inicioDoDia(new Date(e.entrada)).getTime() - hoje0) / 864e5);
                  const passou = dias < 0;
                  return (
                    <div key={e.id} className={`g-ch-cartao reserva ${e.tipo === "hotel" ? "hotel" : "creche"}`}>
                      <div className="g-ch-topo">
                        <AvatarPet pet={pet ?? { nome: "?" }} tamanho="g" />
                        <div className="t">
                          <h2>{pet?.nome ?? "Pet removido"}</h2>
                          <span>{pet?.clientes?.nome ?? "Sem tutor"}</span>
                        </div>
                        <EtiquetaTipo tipo={e.tipo} />
                      </div>

                      <div className="g-ch-rota">
                        <span><small>chega</small><b>{quando(e.entrada)}</b></span>
                        {e.saida_prevista && <><ArrowRight aria-hidden /><span><small>sai</small><b>{quando(e.saida_prevista)}</b></span></>}
                        {passou ? <span className="g-tag amarelo">não veio</span>
                          : <span className={`g-tag ${dias === 0 ? "verde" : "azul"}`}>{dias === 0 ? "chega hoje" : dias === 1 ? "chega amanhã" : `em ${dias} dias`}</span>}
                      </div>

                      <LinhaValor e={e} />
                      {pet?.alertas && <p className="g-p g-vermelho-t"><b>Atenção:</b> {pet.alertas}</p>}
                      {e.obs && <p className="g-ch-obs"><NotebookPen aria-hidden /><span>{e.obs}</span></p>}
                      <div className="g-fila g-ch-acoes">
                        <button className="g-btn verde p" disabled={ocupado === e.id} onClick={() => checkIn(e)}><LogIn /> Check-in</button>
                        <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setEditando(e); }}><Pencil /> Editar</button>
                        <button className="g-btn fantasma p" onClick={() => cancelar(e)}>Cancelar</button>
                        <span style={{ marginLeft: "auto" }}><BotaoZap e={e} reserva /></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {aba === "historico" && (() => {
            const lista = historico.filter(doTipo);
            if (!lista.length) return <p className="g-muted g-centro" style={{ padding: "32px 8px" }}>Nenhuma estadia encerrada ainda.</p>;
            return (
              <div className="g-card">
                <div className="g-lista">
                  {lista.map((e) => {
                    const fim = e.saida ?? e.saida_prevista;
                    const periodo = fim && !dataCurta(fim).startsWith(dataCurta(e.entrada)) ? `${dataCurta(e.entrada)} a ${dataCurta(fim)}` : dataCurta(e.entrada);
                    return (
                      <div key={e.id} className="g-linha">
                        <AvatarPet pet={e.pets ?? { nome: "?" }} />
                        <span className="t">
                          <b>{e.pets?.nome ?? "Pet removido"}</b>
                          <span>{[periodo, e.pets?.clientes?.nome].filter(Boolean).join(" · ")}</span>
                        </span>
                        <EtiquetaTipo tipo={e.tipo} curta />
                        {e.status === "cancelada"
                          ? <span className="g-tag vermelho">cancelada</span>
                          : <span className="g-tag">{(() => { const n = contarDiarias(e, new Date(e.saida ?? e.entrada)); return `${n} ${n === 1 ? "diária" : "diárias"}`; })()}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {nova && <NovaEstadia jaAquiInicial={aba !== "reservas"} tipoInicial={tipo === "todos" ? "creche" : tipo} abertas={dados?.abertas ?? []}
        aoFechar={() => setNova(false)} aoGravar={(emCasa) => { setNova(false); setAba(emCasa ? "casa" : "reservas"); mudou(); }} />}
      {editando && <NovaEstadia key={editando.id} editar={editando} jaAquiInicial={editando.status === "em_casa"} tipoInicial={editando.tipo === "hotel" ? "hotel" : "creche"} abertas={dados?.abertas ?? []}
        aoFechar={() => setEditando(null)} aoGravar={() => { setEditando(null); mudou(); }} />}
      {lote && <EncerrarCreche estadias={crecheNaCasa} aoFechar={() => setLote(false)} aoGravar={() => { setLote(false); mudou(); }} />}
      {saindo && <CheckOut estadia={saindo} aoFechar={() => setSaindo(null)} aoGravar={() => { setSaindo(null); mudou(); }} />}
    </>
  );
}

/* ---------- nova reserva, check-in ou edição ---------- */

const horaDe = (d: string | Date) => { const x = new Date(d); return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };

function NovaEstadia({ jaAquiInicial, tipoInicial, abertas, editar, aoFechar, aoGravar }: {
  jaAquiInicial: boolean; tipoInicial: Tipo; abertas: EstadiaCompleta[]; editar?: EstadiaCompleta;
  aoFechar: () => void; aoGravar: (emCasa: boolean) => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [pet, setPet] = useState<PetDaEstadia | null>(editar?.pets ?? null);
  const [criando, setCriando] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>(tipoInicial);
  const [jaAqui, setJaAqui] = useState(jaAquiInicial);
  const [dia, setDia] = useState(isoDia(editar ? new Date(editar.entrada) : new Date()));
  const [hhmm, setHhmm] = useState(editar ? horaDe(editar.entrada) : "08:00");
  const [saidaDia, setSaidaDia] = useState(editar?.saida_prevista ? isoDia(new Date(editar.saida_prevista)) : "");
  const [saidaHora, setSaidaHora] = useState(editar?.saida_prevista ? horaDe(editar.saida_prevista) : "18:00");
  // a diária sugerida é sempre o preço fixo de Meu pet shop, nunca a última digitada
  const [diaria, setDiaria] = useState<number | null>(editar ? (editar.valor_diaria == null ? null : Number(editar.valor_diaria)) : diariaFixa(petshop, tipoInicial));
  const [mexeuNaDiaria, setMexeuNaDiaria] = useState(Boolean(editar));
  const [obs, setObs] = useState(editar?.obs ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const emCasa = editar ? editar.status === "em_casa" : jaAqui;
  // na edição a entrada sempre aparece; no check-in novo a entrada é agora
  const escolheEntrada = editar ? true : !jaAqui;
  const fixa = diariaFixa(petshop, tipo);
  const { dados: vencidas } = useDados(async () => (pet ? vacinasVencidas(sb, petshop.id, pet.id).catch(() => []) : []), [petshop.id, pet?.id]);

  function trocarTipo(t: Tipo) {
    setTipo(t);
    if (!mexeuNaDiaria) setDiaria(diariaFixa(petshop, t));
  }

  async function salvar() {
    if (!pet || salvando) return;
    setErro(null);
    const falha = (m: string) => { setErro(m); avisarErro(m); };
    const agora = new Date();
    const entrada = escolheEntrada ? (dia && hhmm ? juntaDiaHora(dia, hhmm) : null) : agora;
    if (!entrada || Number.isNaN(entrada.getTime())) return falha("Escolha o dia e a hora da entrada.");
    if (emCasa && entrada.getTime() > agora.getTime() + 60000) return falha("O pet já está na casa: a entrada não pode ser no futuro.");
    const saida = saidaDia ? juntaDiaHora(saidaDia, saidaHora || "18:00") : null;
    if (saida && (Number.isNaN(saida.getTime()) || saida <= entrada)) return falha("A saída prevista precisa ser depois da entrada.");
    if (diaria != null && diaria < 0) return falha("A diária não pode ser negativa.");
    if (diaria != null && diaria > 99999) return falha("Confira o valor da diária.");

    const status = emCasa ? "em_casa" : "reservada";
    const novo: Periodo = { tipo, entrada: entrada.toISOString(), saida_prevista: saida?.toISOString() ?? null, status };
    // o mesmo pet não fica duas vezes na casa nem com duas reservas no mesmo período (sem opção de forçar)
    const bate = conflitoDoPet(pet.id, novo, abertas, editar?.id ?? null, agora);
    if (bate) {
      return falha(!editar && jaAqui && bate.status === "reservada" && isoDia(new Date(bate.entrada)) === isoDia(agora)
        ? `${pet.nome} tem reserva para hoje. Faça o check-in pela reserva, na aba Reservas.` : fraseConflito(pet.nome, bate));
    }
    // reserva com a data que já passou
    if (!emCasa && isoDia(entrada) < isoDia(agora) && !(await confirmar({
      titulo: "Essa data já passou",
      texto: `A entrada está em ${dataCompleta(entrada)}, antes de hoje. Se o pet já veio, volte e marque "Já está aqui". Marcar a reserva nessa data mesmo assim?`,
      confirmar: "Marcar mesmo assim",
    }))) return;
    // casa cheia em algum dia do período
    const vagas = vagasDoTipo(petshop, tipo);
    if (vagas != null) {
      const tomadas = ocupacao(tipo, abertas, editar?.id ?? null, agora);
      const cheios = diasOcupados(novo, agora).filter((d) => (tomadas.get(d) ?? 0) >= vagas);
      if (cheios.length && !(await confirmar({
        titulo: `Casa cheia em ${dataCurta(cheios[0])} (${Math.max(vagas, tomadas.get(cheios[0]) ?? 0)} de ${vagas})`,
        texto: `${cheios.length === 1 ? `Em ${dataCurta(cheios[0])}` : `Em ${cheios.length} dias (${cheios.slice(0, 6).map((d) => dataCurta(d)).join(", ")}${cheios.length > 6 ? "…" : ""})`} ${tipo === "hotel" ? "o hotel" : "a creche"} já está com todas as ${vagas} vagas tomadas. ${editar ? "Salvar" : emCasa ? "Fazer o check-in" : "Marcar a reserva"} passando do limite?`,
        confirmar: "Passar do limite", perigo: true,
      }))) return;
    }
    if (diaria === 0 && !(await confirmar({ titulo: "Cortesia, sem cobrar?", texto: `A diária está em R$ 0,00. ${pet.nome} fica sem cobrança nesta estadia.`, confirmar: "Sim, é cortesia" }))) return;

    setSalvando(true);
    try {
      const campos = { tipo, entrada: entrada.toISOString(), saida_prevista: saida?.toISOString() ?? null, valor_diaria: diaria, obs: obs.trim() || null };
      if (editar) {
        const r = ok(await sb.from("estadias").update(campos).eq("id", editar.id).eq("petshop_id", petshop.id).eq("status", editar.status).select("id"));
        if (!r.length) avisar("Essa estadia já tinha sido alterada. Atualizei a lista."); else avisar("Alteração salva.");
      } else {
        ok(await sb.from("estadias").insert({ ...campos, petshop_id: petshop.id, pet_id: pet.id, status }).select("id").single());
        avisar(emCasa ? `${pet.nome} está na casa.` : `Reserva de ${pet.nome} marcada para ${dataAmigavel(entrada)}.`);
      }
      aoGravar(emCasa);
    } catch (e) {
      if (ehRepetido(e)) {
        // outra pessoa fez o check-in deste pet no meio do caminho
        const { data: la } = await sb.from("estadias").select("entrada").eq("petshop_id", petshop.id).eq("pet_id", pet.id).eq("status", "em_casa").maybeSingle();
        falha(`${pet.nome} já está na casa${la ? ` desde ${quando(la.entrada)}` : ""}.`);
      } else avisarErro(e);
    } finally { setSalvando(false); }
  }

  if (criando !== null) {
    return <FormPet nomeInicial={criando} aoFechar={() => setCriando(null)} aoSalvar={(p) => { setPet(p); setCriando(null); avisarMudanca(); }} />;
  }
  if (!pet) {
    return (
      <Folha titulo="Qual pet vem?" aoFechar={aoFechar}>
        <EscolherPet aoEscolher={setPet} aoCriar={setCriando} autoFocus />
      </Folha>
    );
  }

  const jaNaCasa = !editar ? abertas.find((e) => e.pet_id === pet.id && e.status === "em_casa") : undefined;

  return (
    <Folha titulo={editar ? (emCasa ? "Editar estadia" : "Editar reserva") : jaAqui ? "Check-in" : "Nova reserva"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : editar ? "Salvar" : jaAqui ? "Fazer check-in" : "Marcar reserva"}</button>
      </>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={pet} />
          <div className="g-cresce"><b style={{ display: "block" }}>{pet.nome}</b><span className="g-muted g-p">{pet.clientes?.nome ?? "Sem tutor"}</span></div>
          {!editar && <button type="button" className="g-btn fantasma p" onClick={() => { setPet(null); setErro(null); }}>Trocar</button>}
        </div>
        {jaNaCasa && <div className="g-aviso vermelho" role="alert" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>{fraseConflito(pet.nome, jaNaCasa)}</b> Não dá para fazer outro check-in; uma reserva para depois, sim.</span></div>}
        {Boolean(vencidas?.length) && (
          <div className="g-aviso vermelho g-ch-vacina" role="alert" style={{ marginBottom: 0 }}>
            <Syringe /><span className="g-cresce"><b>Vacina vencida:</b> {vencidas!.join(", ")}. Confira a carteirinha antes de {emCasa ? "receber" : "confirmar a reserva"}.</span>
          </div>
        )}
        {pet.alertas && <div className="g-aviso vermelho" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>Atenção:</b> {pet.alertas}</span></div>}

        <div className="g-campo">
          <span>Tipo</span>
          <Chips opcoes={TIPOS} valor={tipo} aoMudar={trocarTipo} />
        </div>
        {!editar && (
          <label className="g-check">
            <input type="checkbox" checked={jaAqui} onChange={(e) => setJaAqui(e.target.checked)} />
            <span>Já está aqui (check-in agora)</span>
          </label>
        )}
        {escolheEntrada && (
          <div className="dupla">
            <Campo rotulo={emCasa ? "Entrou em" : "Entrada"}><input type="date" className="g-input" value={dia} max={emCasa ? isoDia(new Date()) : undefined} onChange={(e) => setDia(e.target.value)} /></Campo>
            <Campo rotulo="Hora"><input type="time" className="g-input" value={hhmm} onChange={(e) => setHhmm(e.target.value)} /></Campo>
          </div>
        )}
        <div className="dupla">
          <Campo rotulo="Saída prevista" dica="Opcional"><input type="date" className="g-input" value={saidaDia} min={escolheEntrada ? dia : isoDia(new Date())} onChange={(e) => setSaidaDia(e.target.value)} /></Campo>
          <Campo rotulo="Hora"><input type="time" className="g-input" value={saidaHora} onChange={(e) => setSaidaHora(e.target.value)} disabled={!saidaDia} /></Campo>
        </div>
        <Campo rotulo={`Valor da diária (${tipo === "hotel" ? "por noite" : "por dia"})`}
          dica={fixa == null ? "Defina o preço da diária em Meu pet shop para ele já vir preenchido."
            : diaria === fixa ? `Preço fixo ${tipo === "hotel" ? "do hotel" : "da creche"}, definido em Meu pet shop.`
            : `O preço fixo ${tipo === "hotel" ? "do hotel" : "da creche"} é ${brl(fixa)}.`}>
          <CampoValor valor={diaria} aoMudar={(n) => { setMexeuNaDiaria(true); setDiaria(n); }} placeholder={fixa == null ? "Sem preço fixo" : "0,00"} />
        </Campo>
        <Campo rotulo="Observações">
          <textarea className="g-textarea" value={obs} maxLength={600} onChange={(e) => setObs(e.target.value)} placeholder="Ração, remédio, horário de passeio, o que trouxe na mochila…" />
        </Campo>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}

/* ---------- pacote do pet que serve para a estadia ---------- */

type PacoteDaEstadia = Pick<PacoteCliente, "id" | "nome" | "total" | "usados" | "vence_em" | "servico_id" | "pet_id">;
/** Pacotes ativos com saldo que valem para creche ou hotel: os de "qualquer serviço" e os ligados a um serviço do mesmo tipo. */
async function pacotesParaEstadia(sb: Banco, petshopId: string, petIds: string[]): Promise<PacoteDaEstadia[]> {
  if (!petIds.length) return [];
  const r = await sb.from("pacotes_clientes").select("id, nome, total, usados, vence_em, servico_id, pet_id").eq("petshop_id", petshopId).in("pet_id", petIds).eq("ativo", true).order("vence_em", { nullsFirst: false }).limit(500);
  if (r.error) throw new Error(r.error.message);
  return ((r.data ?? []) as PacoteDaEstadia[]).filter((p) => p.usados < p.total);
}
const pacoteServe = (p: PacoteDaEstadia, tipo: string, servicos: Servico[]) => !p.servico_id || servicos.find((s) => s.id === p.servico_id)?.categoria === tipo;
const venceu = (p: Pick<PacoteCliente, "vence_em">) => Boolean(p.vence_em) && deIsoDia(p.vence_em!) < inicioDoDia(new Date());

/* ---------- check-out ---------- */

function CheckOut({ estadia, aoFechar, aoGravar }: { estadia: EstadiaCompleta; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, servicos, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [agora] = useState(() => new Date());
  const contadas = contarDiarias(estadia, agora);
  const [diarias, setDiarias] = useState(String(contadas));
  const [valorEditado, setValorEditado] = useState<number | null | undefined>(undefined);
  const [forma, setForma] = useState<Forma>("pix");
  const [comPacote, setComPacote] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const pet = estadia.pets;
  const n = Number(diarias);
  const nValido = Number.isInteger(n) && n >= 1;
  const calculado = nValido && estadia.valor_diaria != null ? Math.round(n * Number(estadia.valor_diaria) * 100) / 100 : null;
  const valor = valorEditado === undefined ? calculado : valorEditado;
  const palavra = estadia.tipo === "hotel" ? (n === 1 ? "noite" : "noites") : (n === 1 ? "dia" : "dias");

  const { dados: pacotes } = useDados(async () =>
    (await pacotesParaEstadia(sb, petshop.id, [estadia.pet_id]).catch(() => [])).filter((p) => pacoteServe(p, estadia.tipo, servicos)),
  [petshop.id, estadia.pet_id]);
  const pacote = (pacotes ?? []).find((p) => p.id === comPacote) ?? null;
  const cobra = !pacote && vejoFinanceiro && Boolean(valor);

  async function salvar() {
    if (!nValido) { avisarErro("Confira o número de diárias."); return; }
    if (valor != null && valor < 0) { avisarErro("O valor não pode ser negativo."); return; }
    if (pacote) {
      if (pacote.total - pacote.usados < n) { avisarErro(`O pacote só tem ${pacote.total - pacote.usados} para usar e são ${n} diárias. Diminua as diárias ou cobre a diferença à parte.`); return; }
      if (venceu(pacote) && !(await confirmar({ titulo: "Pacote vencido", texto: `Este pacote venceu em ${dataCompleta(pacote.vence_em!)}. Usar mesmo assim?`, confirmar: "Usar mesmo assim" }))) return;
    }
    setSalvando(true);
    try {
      const r = ok(await sb.from("estadias").update({ status: "encerrada", saida: new Date().toISOString() })
        .eq("id", estadia.id).eq("petshop_id", petshop.id).eq("status", "em_casa").select("id"));
      if (!r.length) { avisar("Esse check-out já tinha sido feito. Atualizei a lista."); aoGravar(); return; }
      const nome = pet?.nome ?? "O pet";
      if (pacote) {
        // mesma baixa da tela Pacotes: só grava se ninguém mexeu no meio do caminho; não lança dinheiro
        const usados = pacote.usados + n;
        const b = await sb.from("pacotes_clientes").update({ usados, ativo: usados < pacote.total })
          .eq("id", pacote.id).eq("petshop_id", petshop.id).eq("usados", pacote.usados).select("id");
        if (b.error || !b.data?.length) avisarErro("O check-out foi feito, mas não consegui dar baixa no pacote. Dê baixa pela tela Pacotes.");
        else avisar(`${nome} foi para casa. ${n === 1 ? "1 uso" : `${n} usos`} do pacote, ${pacote.total - usados === 0 ? "que terminou" : `restam ${pacote.total - usados}`}.`);
      } else if (cobra && valor) {
        try {
          await lancarPago(sb, petshop.id, {
            tipo: "entrada", valor, forma, categoria: "Creche e hotel",
            descricao: `${nomeTipo(estadia.tipo)}: ${n} ${n === 1 ? "diária" : "diárias"} · ${nome}`, clienteId: pet?.clientes?.id ?? null,
          });
          avisar(`${nome} foi para casa. ${brl(valor)} no financeiro.`);
        } catch (e) {
          avisarErro(`O check-out foi feito, mas o pagamento não foi lançado. Lance pelo Financeiro. (${e instanceof Error ? e.message : "erro"})`);
        }
      } else avisar(`${nome} foi para casa.`);
      aoGravar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <Folha titulo={`Check-out${pet ? ` de ${pet.nome}` : ""}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : pacote ? "Usar o pacote e encerrar" : cobra ? `Receber ${brl(valor)}` : "Fazer check-out"}</button>
      </>}>
      <div className="g-form">
        <div className="g-card areia">
          <div className="g-fila" style={{ flexWrap: "nowrap" }}>
            <AvatarPet pet={pet ?? { nome: "?" }} />
            <div className="g-cresce">
              <b style={{ display: "block" }}>{nomeTipo(estadia.tipo)} · {pet?.clientes?.nome ?? "Sem tutor"}</b>
              <span className="g-muted g-p">chegou {quando(estadia.entrada)} · sai agora, {horaCurta(agora)}</span>
            </div>
          </div>
        </div>
        <Campo rotulo="Diárias" dica={nValido ? `${n} ${palavra}${estadia.valor_diaria != null ? ` × ${brl(estadia.valor_diaria)}` : ""}` : undefined}
          erro={nValido ? null : "Use um número inteiro, a partir de 1."}>
          <input className="g-input g-tab" inputMode="numeric" value={diarias} onChange={(e) => { setDiarias(e.target.value); setValorEditado(undefined); }} />
        </Campo>
        {Boolean(pacotes?.length) && (
          <div className="g-campo">
            <span>Como fica a conta</span>
            <div className="g-chips">
              <button type="button" className="g-chip" aria-pressed={!pacote} onClick={() => setComPacote(null)}>Cobrar a diária</button>
              {pacotes!.map((p) => (
                <button key={p.id} type="button" className="g-chip" aria-pressed={comPacote === p.id} onClick={() => setComPacote(p.id)}>
                  Usar {nValido ? n : 1} do pacote (restam {p.total - p.usados}){venceu(p) ? " · vencido" : ""}
                </button>
              ))}
            </div>
            <small>{pacote ? `${pacote.nome}: dá baixa no pacote e não lança dinheiro.` : "O pet tem pacote com saldo. Dá para usar o pacote em vez de cobrar."}</small>
          </div>
        )}
        {pacote ? null : vejoFinanceiro ? (
          <>
            <Campo rotulo="Valor a receber" dica={estadia.valor_diaria == null ? "A diária não foi combinada no check-in. Deixe em branco se não for cobrar agora." : "Deixe em branco se não for cobrar agora."}>
              <CampoValor valor={valor} aoMudar={setValorEditado} />
            </Campo>
            {Boolean(valor) && <ChipsForma valor={forma} aoMudar={setForma} />}
          </>
        ) : (
          <p className="g-muted g-p">O check-out encerra a estadia. O pagamento fica para quem cuida do financeiro lançar.</p>
        )}
      </div>
    </Folha>
  );
}

/* ---------- encerrar o dia da creche (check-out de vários de uma vez) ---------- */

function EncerrarCreche({ estadias, aoFechar, aoGravar }: { estadias: EstadiaCompleta[]; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, servicos, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [agora] = useState(() => new Date());
  const [sai, setSai] = useState<Record<string, boolean>>(() => Object.fromEntries(estadias.map((e) => [e.id, true])));
  const [cobrar, setCobrar] = useState<Record<string, boolean>>({});
  const [forma, setForma] = useState<Forma>("pix");
  const [salvando, setSalvando] = useState(false);

  const { dados: pacotes } = useDados(async () =>
    (await pacotesParaEstadia(sb, petshop.id, [...new Set(estadias.map((e) => e.pet_id))]).catch(() => [])).filter((p) => pacoteServe(p, "creche", servicos)),
  [petshop.id]);
  const temPacote = (petId: string) => (pacotes ?? []).some((p) => p.pet_id === petId);
  const linhas = estadias.map((e) => {
    const n = contarDiarias(e, agora);
    const valor = e.valor_diaria != null ? Math.round(n * Number(e.valor_diaria) * 100) / 100 : 0;
    // quem tem pacote fica sem cobrança aqui: a baixa do pacote é pelo check-out do próprio pet
    const cobra = vejoFinanceiro && valor > 0 && (cobrar[e.id] ?? !temPacote(e.pet_id));
    return { e, n, valor, cobra };
  });
  const escolhidas = linhas.filter((l) => sai[l.e.id]);
  const total = escolhidas.reduce((t, l) => t + (l.cobra ? l.valor : 0), 0);

  async function salvar() {
    if (!escolhidas.length || salvando) return;
    setSalvando(true);
    let feitos = 0, recebido = 0;
    const falhas: string[] = [];
    for (const l of escolhidas) {
      const nome = l.e.pets?.nome ?? "Pet";
      try {
        const r = ok(await sb.from("estadias").update({ status: "encerrada", saida: new Date().toISOString() })
          .eq("id", l.e.id).eq("petshop_id", petshop.id).eq("status", "em_casa").select("id"));
        if (!r.length) continue; // já tinha saído por outra tela
        feitos++;
        if (l.cobra) {
          try {
            await lancarPago(sb, petshop.id, {
              tipo: "entrada", valor: l.valor, forma, categoria: "Creche e hotel",
              descricao: `Creche: ${l.n} ${l.n === 1 ? "diária" : "diárias"} · ${nome}`, clienteId: l.e.pets?.clientes?.id ?? null,
            });
            recebido += l.valor;
          } catch { falhas.push(`${nome} (saiu, mas o pagamento não foi lançado)`); }
        }
      } catch { falhas.push(nome); }
    }
    setSalvando(false);
    if (falhas.length) avisarErro(`Não deu certo com: ${falhas.join(", ")}. Confira e, se precisar, lance pelo Financeiro.`);
    if (feitos) avisar(`${feitos === 1 ? "1 pet foi" : `${feitos} pets foram`} para casa.${recebido ? ` ${brl(recebido)} no financeiro.` : ""}`);
    aoGravar();
  }

  return (
    <Folha titulo="Encerrar o dia da creche" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando || !escolhidas.length}>
          {salvando ? "Salvando…" : `Encerrar ${escolhidas.length}${total ? ` e receber ${brl(total)}` : ""}`}
        </button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">Marque quem está indo embora agora. {vejoFinanceiro ? "Cada um é cobrado com a forma escolhida, ou fica sem cobrar." : "O pagamento fica para quem cuida do financeiro lançar."}</p>
        <div className="g-ch-lote-lista">
          {linhas.map((l) => (
            <div key={l.e.id} className={`g-ch-lote-linha${sai[l.e.id] ? " on" : ""}`}>
              <label className="quem">
                <input type="checkbox" checked={Boolean(sai[l.e.id])} onChange={(ev) => setSai((x) => ({ ...x, [l.e.id]: ev.target.checked }))} />
                <AvatarPet pet={l.e.pets ?? { nome: "?" }} tamanho="p" />
                <span className="t"><b>{l.e.pets?.nome ?? "Pet removido"}</b><small>{l.e.pets?.clientes?.nome ?? "Sem tutor"} · {l.n} {l.n === 1 ? "diária" : "diárias"}{l.valor > 0 ? ` · ${brl(l.valor)}` : " · sem diária combinada"}</small></span>
              </label>
              {vejoFinanceiro && l.valor > 0 && sai[l.e.id] && (
                <label className="cobra">
                  <input type="checkbox" checked={l.cobra} onChange={(ev) => setCobrar((x) => ({ ...x, [l.e.id]: ev.target.checked }))} />
                  <span>Cobrar {brl(l.valor)}</span>
                </label>
              )}
              {temPacote(l.e.pet_id) && sai[l.e.id] && <small className="g-muted">Tem pacote com saldo. Para usar o pacote, faça o check-out pelo cartão do pet.</small>}
            </div>
          ))}
        </div>
        {vejoFinanceiro && total > 0 && <ChipsForma valor={forma} aoMudar={setForma} />}
      </div>
    </Folha>
  );
}
