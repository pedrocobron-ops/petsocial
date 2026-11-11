"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarCheck, DoorOpen, Home, LogIn, LogOut, MessageCircle, Moon, NotebookPen, Plus, Sun } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import FormPet from "@/components/gestao/form-pet";
import { Kpi } from "@/components/gestao/painel";
import { AvatarPet, avisarMudanca, Campo, CampoValor, EscolherPet, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { Chips, ChipsForma, ErroTela, type Forma } from "@/components/gestao/loja/pecas";
import { lancarPago } from "@/lib/gestao/dinheiro";
import type { Cliente, Estadia, Pet } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCurta, hora, inicioDoDia, isoDia, juntaDiaHora, linkWhatsApp } from "@/lib/gestao/util";
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

  /** Última diária cobrada em cada tipo, para já vir preenchida. */
  const ultimaDiaria = useMemo(() => {
    const todas = [...(dados?.abertas ?? [])].reverse().concat(dados?.passadas ?? []);
    const achar = (t: Tipo) => todas.find((e) => e.tipo === t && e.valor_diaria != null)?.valor_diaria ?? null;
    return { creche: achar("creche"), hotel: achar("hotel") };
  }, [dados]);

  const mudou = () => { void recarregar(); avisarMudanca(); };
  const abrirNova = () => { if (!somenteLeitura()) setNova(true); };

  async function checkIn(e: EstadiaCompleta) {
    if (somenteLeitura()) return;
    setOcupado(e.id);
    try {
      const r = ok(await sb.from("estadias").update({ status: "em_casa", entrada: new Date().toISOString() })
        .eq("id", e.id).eq("petshop_id", petshop.id).eq("status", "reservada").select("id"));
      if (!r.length) avisar("Essa reserva já tinha sido alterada. Atualizei a lista.");
      else avisar(`${e.pets?.nome ?? "O pet"} chegou.`);
      mudou();
    } catch (x) { avisarErro(x); } finally { setOcupado(null); }
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
  const atrasadas = naCasa.filter((e) => e.saida_prevista && new Date(e.saida_prevista) < agora).length;
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
              <Kpi icone={DoorOpen} tom={atrasadas ? "rosa" : "pessego"} rotulo="Saem hoje" valor={saemHoje.length}
                apoio={atrasadas ? `${atrasadas} com saída atrasada` : saemHoje.length ? "pela saída prevista" : "ninguém com saída hoje"} />
            </KpiAcao>
            <KpiAcao ativo={aba === "reservas"} aoTocar={() => setAba("reservas")}>
              <Kpi icone={CalendarCheck} tom="lilas" rotulo="Reservas" valor={reservas.length}
                apoio={proximaReserva ? `próxima: ${quando(proximaReserva.entrada)}` : reservas.length ? "com a data já passada" : "nenhuma marcada"} />
            </KpiAcao>
          </div>

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

                      {pet?.alertas && <div className="g-aviso vermelho" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>Atenção:</b> {pet.alertas}</span></div>}
                      {e.obs && <p className="g-ch-obs"><NotebookPen aria-hidden /><span>{e.obs}</span></p>}
                      <div className="g-fila g-ch-acoes">
                        <BotaoZap e={e} />
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

                      {pet?.alertas && <p className="g-p g-vermelho-t"><b>Atenção:</b> {pet.alertas}</p>}
                      {e.obs && <p className="g-ch-obs"><NotebookPen aria-hidden /><span>{e.obs}</span></p>}
                      <div className="g-fila g-ch-acoes">
                        <button className="g-btn verde p" disabled={ocupado === e.id} onClick={() => checkIn(e)}><LogIn /> Check-in</button>
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

      {nova && <NovaEstadia jaAquiInicial={aba !== "reservas"} tipoInicial={tipo === "todos" ? "creche" : tipo} ultimaDiaria={ultimaDiaria}
        aoFechar={() => setNova(false)} aoGravar={(emCasa) => { setNova(false); setAba(emCasa ? "casa" : "reservas"); mudou(); }} />}
      {saindo && <CheckOut estadia={saindo} aoFechar={() => setSaindo(null)} aoGravar={() => { setSaindo(null); mudou(); }} />}
    </>
  );
}

/* ---------- nova reserva ou check-in ---------- */

function NovaEstadia({ jaAquiInicial, tipoInicial, ultimaDiaria, aoFechar, aoGravar }: {
  jaAquiInicial: boolean; tipoInicial: Tipo; ultimaDiaria: Record<Tipo, number | null>;
  aoFechar: () => void; aoGravar: (emCasa: boolean) => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [pet, setPet] = useState<PetDaEstadia | null>(null);
  const [criando, setCriando] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>(tipoInicial);
  const [jaAqui, setJaAqui] = useState(jaAquiInicial);
  const [dia, setDia] = useState(isoDia(new Date()));
  const [hhmm, setHhmm] = useState("08:00");
  const [saidaDia, setSaidaDia] = useState("");
  const [saidaHora, setSaidaHora] = useState("18:00");
  const [diaria, setDiaria] = useState<number | null>(ultimaDiaria[tipoInicial]);
  const [mexeuNaDiaria, setMexeuNaDiaria] = useState(false);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);

  function trocarTipo(t: Tipo) {
    setTipo(t);
    if (!mexeuNaDiaria) setDiaria(ultimaDiaria[t]);
  }

  async function salvar() {
    if (!pet) return;
    const entrada = jaAqui ? new Date() : dia && hhmm ? juntaDiaHora(dia, hhmm) : null;
    if (!entrada || Number.isNaN(entrada.getTime())) { avisarErro("Escolha o dia e a hora da entrada."); return; }
    const saida = saidaDia ? juntaDiaHora(saidaDia, saidaHora || "18:00") : null;
    if (saida && (Number.isNaN(saida.getTime()) || saida <= entrada)) { avisarErro("A saída prevista precisa ser depois da entrada."); return; }
    setSalvando(true);
    try {
      ok(await sb.from("estadias").insert({
        petshop_id: petshop.id, pet_id: pet.id, tipo, entrada: entrada.toISOString(), saida_prevista: saida?.toISOString() ?? null,
        valor_diaria: diaria, status: jaAqui ? "em_casa" : "reservada", obs: obs.trim() || null,
      }).select("id").single());
      avisar(jaAqui ? `${pet.nome} está na casa.` : `Reserva de ${pet.nome} marcada para ${dataAmigavel(entrada)}.`);
      aoGravar(jaAqui);
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
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

  return (
    <Folha titulo={jaAqui ? "Check-in" : "Nova reserva"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : jaAqui ? "Fazer check-in" : "Marcar reserva"}</button>
      </>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={pet} />
          <div className="g-cresce"><b style={{ display: "block" }}>{pet.nome}</b><span className="g-muted g-p">{pet.clientes?.nome ?? "Sem tutor"}</span></div>
          <button type="button" className="g-btn fantasma p" onClick={() => setPet(null)}>Trocar</button>
        </div>
        {pet.alertas && <div className="g-aviso vermelho" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>Atenção:</b> {pet.alertas}</span></div>}

        <div className="g-campo">
          <span>Tipo</span>
          <Chips opcoes={TIPOS} valor={tipo} aoMudar={trocarTipo} />
        </div>
        <label className="g-check">
          <input type="checkbox" checked={jaAqui} onChange={(e) => setJaAqui(e.target.checked)} />
          <span>Já está aqui (check-in agora)</span>
        </label>
        {!jaAqui && (
          <div className="dupla">
            <Campo rotulo="Entrada"><input type="date" className="g-input" value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
            <Campo rotulo="Hora"><input type="time" className="g-input" value={hhmm} onChange={(e) => setHhmm(e.target.value)} /></Campo>
          </div>
        )}
        <div className="dupla">
          <Campo rotulo="Saída prevista" dica="Opcional"><input type="date" className="g-input" value={saidaDia} min={jaAqui ? isoDia(new Date()) : dia} onChange={(e) => setSaidaDia(e.target.value)} /></Campo>
          <Campo rotulo="Hora"><input type="time" className="g-input" value={saidaHora} onChange={(e) => setSaidaHora(e.target.value)} disabled={!saidaDia} /></Campo>
        </div>
        <Campo rotulo="Valor da diária" dica={tipo === "hotel" ? "Por noite" : "Por dia"}>
          <CampoValor valor={diaria} aoMudar={(n) => { setMexeuNaDiaria(true); setDiaria(n); }} />
        </Campo>
        <Campo rotulo="Observações">
          <textarea className="g-textarea" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ração, remédio, horário de passeio, o que trouxe na mochila…" />
        </Campo>
      </div>
    </Folha>
  );
}

/* ---------- check-out ---------- */

function CheckOut({ estadia, aoFechar, aoGravar }: { estadia: EstadiaCompleta; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [agora] = useState(() => new Date());
  const contadas = contarDiarias(estadia, agora);
  const [diarias, setDiarias] = useState(String(contadas));
  const [valorEditado, setValorEditado] = useState<number | null | undefined>(undefined);
  const [forma, setForma] = useState<Forma>("pix");
  const [salvando, setSalvando] = useState(false);

  const pet = estadia.pets;
  const n = Number(diarias);
  const nValido = Number.isInteger(n) && n >= 1;
  const calculado = nValido && estadia.valor_diaria != null ? Math.round(n * Number(estadia.valor_diaria) * 100) / 100 : null;
  const valor = valorEditado === undefined ? calculado : valorEditado;
  const palavra = estadia.tipo === "hotel" ? (n === 1 ? "noite" : "noites") : (n === 1 ? "dia" : "dias");

  async function salvar() {
    if (!nValido) { avisarErro("Confira o número de diárias."); return; }
    setSalvando(true);
    try {
      const r = ok(await sb.from("estadias").update({ status: "encerrada", saida: new Date().toISOString() })
        .eq("id", estadia.id).eq("petshop_id", petshop.id).eq("status", "em_casa").select("id"));
      if (!r.length) { avisar("Esse check-out já tinha sido feito. Atualizei a lista."); aoGravar(); return; }
      const nome = pet?.nome ?? "O pet";
      if (vejoFinanceiro && valor) {
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
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : vejoFinanceiro && valor ? `Receber ${brl(valor)}` : "Fazer check-out"}</button>
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
        <Campo rotulo="Diárias" dica={nValido ? `${n} ${palavra}${vejoFinanceiro && estadia.valor_diaria != null ? ` × ${brl(estadia.valor_diaria)}` : ""}` : undefined}
          erro={nValido ? null : "Use um número inteiro, a partir de 1."}>
          <input className="g-input g-tab" inputMode="numeric" value={diarias} onChange={(e) => { setDiarias(e.target.value); setValorEditado(undefined); }} />
        </Campo>
        {vejoFinanceiro ? (
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
