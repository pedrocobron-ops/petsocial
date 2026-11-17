"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, MapPin, MessageCircle, Navigation, Phone, Printer, Truck, Undo2 } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO } from "@/lib/gestao/tipos";
import { nomeDosServicos } from "@/lib/gestao/servicos-do-horario";
import { dataAmigavel, dataLonga, deIsoDia, fmtTelefone, hora, isoDia, linkWhatsApp, mesmoDia, somaDias, telefoneLimpo } from "@/lib/gestao/util";
import { alertasDoPet, linkDaRota, linkDoMapa, montarViagens, textoChegando, MAX_PARADAS, type Etapa, type LinhaQuadro, type Viagem, type ViagemFeita } from "@/lib/gestao/quadro";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPet, DICA_SO_CONSULTA, Esqueleto, Vazio, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import LogoLoja from "@/components/gestao/logo-loja";
import "./leva-traz.css";

type Horario = AgendamentoCompleto & { pets: (NonNullable<AgendamentoCompleto["pets"]> & { clientes: { id: string; nome: string; telefone: string | null; endereco: string | null } | null }) | null };
const SELECT = SELECT_AGENDAMENTO.replace("clientes(id, nome, telefone)", "clientes(id, nome, telefone, endereco)");

/**
 * Leva e traz do dia, para quem dirige: buscar o pet na casa do tutor antes do banho e levar de volta depois, na ordem do relógio.
 * Endereço no Google Maps, ligar ou mandar "estou chegando" no WhatsApp, a rota com todos e "Buscado" / "Entregue" com a hora.
 * Imprime numa folha (o navegador salva em PDF).
 */
function LevaTraz() {
  const { sb, petshop, equipe, liberado } = useGestao();
  const params = useSearchParams();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [dia, setDia] = useState(() => params.get("dia") ?? isoDia(new Date()));
  const [todas, setTodas] = useState(false);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const data = deIsoDia(dia);
  const ehHoje = mesmoDia(data, new Date());
  useEffect(() => {
    const antes = document.title;
    document.title = `Leva e traz de ${dia.split("-").reverse().join("-")} · ${petshop.nome}`;
    return () => { document.title = antes; };
  }, [dia, petshop.nome]);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const ags = ok(await sb.from("agendamentos").select(SELECT).eq("petshop_id", petshop.id).eq("leva_traz", true)
      .gte("inicio", data.toISOString()).lt("inicio", somaDias(data, 1).toISOString()).order("inicio")) as unknown as Horario[];
    const ids = ags.map((a) => a.id);
    const [v, q] = ids.length ? await Promise.all([
      sb.from("leva_traz_viagens").select("agendamento_id, perna, feito_em, feito_por").eq("petshop_id", petshop.id).in("agendamento_id", ids),
      sb.from("quadro_atendimento").select("agendamento_id, etapa, etapa_em, chegou_em, entregue_em").eq("petshop_id", petshop.id).in("agendamento_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (v.error) throw new Error(v.error.message);
    const feitas = new Map(((v.data ?? []) as (ViagemFeita & { agendamento_id: string })[]).map((x) => [`${x.agendamento_id}:${x.perna}`, x]));
    const quadro = new Map(((q.error ? [] : q.data ?? []) as (LinhaQuadro & { agendamento_id: string })[]).map((x) => [x.agendamento_id, { ...x, etapa: x.etapa as Etapa | null }]));
    return { ags, viagens: montarViagens(ags, quadro, feitas) };
  }, [petshop.id, dia]);

  // de hoje: atualiza sozinho a cada minuto (o pet fica pronto no banho enquanto o motorista está na rua)
  useEffect(() => {
    if (!ehHoje) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void recarregar(); }, 60000);
    return () => clearInterval(t);
  }, [ehHoje, recarregar]);

  const porId = useMemo(() => new Map((dados?.ags ?? []).map((a) => [a.id, a])), [dados]);
  const viagens = dados?.viagens ?? [];
  const faltam = viagens.filter((v) => !v.feitoEm);
  const mostradas = todas ? viagens : faltam;
  const cidade = [petshop.cidade, petshop.uf].filter(Boolean).join(" - ");
  // a rota leva só o que falta fazer e já dá para fazer (levar de volta só depois de pronto), na ordem da lista
  const paraRota = faltam.filter((v) => v.endereco && (v.perna === "buscar" || v.pronto));
  const rota = linkDaRota(paraRota.map((v) => v.endereco!), cidade);
  const nomeDe = (userId: string | null) => (userId ? equipe.find((p) => p.user_id === userId)?.nome.split(" ")[0] ?? null : null);

  async function marcar(v: Viagem, feito: boolean) {
    if (somenteLeitura() || mexendo) return;
    setMexendo(v.chave);
    try {
      const r = await sb.rpc("leva_traz_marcar", { p_petshop: petshop.id, p_agendamento: v.agendamentoId, p_perna: v.perna, p_feito: feito });
      if (r.error) throw new Error(r.error.message);
      const pet = porId.get(v.agendamentoId)?.pets?.nome ?? "Pet";
      avisar(feito ? `${pet}: ${v.perna === "buscar" ? "buscado" : "entregue em casa"}.` : "Desfeito.");
      avisarMudanca();
      await recarregar();
    } catch (e) { avisarErro(e); } finally { setMexendo(null); }
  }

  return (
    <>
      <header className="g-topo g-lt-topo">
        <div>
          <h1>Leva e traz</h1>
          <p className="g-muted">{ehHoje ? "Hoje, " : ""}{dataLonga(data)}</p>
        </div>
        <div className="g-acoes">
          <Link className="g-btn sec" href={`/gestao/app/agenda?dia=${dia}`}><ArrowLeft />Agenda</Link>
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
            {rota && <p className="g-pp g-muted" style={{ margin: 0 }}>A rota sai de onde você está, na ordem da lista. Levar de volta só entra depois que o pet fica pronto.</p>}
            <div className="g-chips" role="group" aria-label="O que mostrar">
              <button type="button" className="g-chip" aria-pressed={!todas} onClick={() => setTodas(false)}>Falta fazer ({faltam.length})</button>
              <button type="button" className="g-chip" aria-pressed={todas} onClick={() => setTodas(true)}>Todas ({viagens.length})</button>
            </div>
          </div>
        )}

        {erro && <p className="g-erro">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={3} /> : !viagens.length ? (
          <div className="g-card">
            <Vazio titulo={ehHoje ? "Nenhum leva e traz hoje" : "Nenhum leva e traz neste dia"} texto="Para um horário entrar aqui, marque Leva e traz ao marcar ou alterar o horário na Agenda e escreva o endereço." />
          </div>
        ) : !mostradas.length ? (
          <div className="g-card"><Vazio titulo="Tudo feito" texto="Todas as viagens deste dia já foram marcadas. Toque em Todas para ver as horas." /></div>
        ) : (
          <ol className="g-lt-lista">
            {mostradas.map((v) => {
              const a = porId.get(v.agendamentoId);
              if (!a) return null;
              const tutor = a.pets?.clientes;
              const tel = telefoneLimpo(tutor?.telefone);
              const zap = linkWhatsApp(tutor?.telefone, textoChegando({ tutor: tutor?.nome, pet: a.pets?.nome ?? "o pet", petshop: petshop.nome, perna: v.perna }));
              const alertas = alertasDoPet(a.pets?.alertas);
              const quem = nomeDe(v.feitoPor);
              const espera = v.perna === "levar" && !v.pronto && !v.feitoEm;
              return (
                <li key={v.chave} className={`g-lt-item ${v.perna}${v.feitoEm ? " feito" : ""}`}>
                  <div className="g-lt-cab">
                    <span className={`g-lt-perna ${v.perna}`}>{v.perna === "buscar" ? "Buscar" : "Levar de volta"}</span>
                    <b className="g-tab">{v.perna === "buscar" ? `até ${hora(v.quando)}` : v.pronto ? (v.prontoEm ? `pronto às ${hora(v.prontoEm)}` : "pronto") : `previsto ${hora(v.quando)}`}</b>
                    <i className="g-lt-caixa" aria-hidden />
                  </div>
                  <div className="g-lt-quem">
                    {a.pets && <AvatarPet pet={a.pets} />}
                    <div className="t">
                      <b>{a.pets?.nome ?? "Pet"}</b>
                      <span>{[tutor?.nome, nomeDosServicos(a)].filter(Boolean).join(" · ")}</span>
                    </div>
                  </div>
                  <p className="g-lt-end"><MapPin aria-hidden />{v.endereco ?? <span className="g-muted">Sem endereço. Confira com o tutor ou na ficha.</span>}</p>
                  {tel && <p className="g-lt-tel g-tab">{fmtTelefone(tutor?.telefone)}</p>}
                  {(alertas.length > 0 || a.obs) && (
                    <div className="g-lt-obs">
                      {alertas.map((x) => <span key={x} className="g-tag vermelho">{x}</span>)}
                      {a.obs && <p className="g-pp">{a.obs}</p>}
                    </div>
                  )}
                  {espera && <p className="g-pp g-muted g-lt-espera">{a.status === "marcado" || a.status === "confirmado" ? "O pet ainda não chegou ao pet shop." : "Ainda não está pronto. Quando ficar, a lista mostra “pronto”."}</p>}
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
                    <button type="button" className="g-btn verde cheio g-lt-marcar" disabled={mexendo === v.chave || !liberado || (v.perna === "levar" && (a.status === "marcado" || a.status === "confirmado"))}
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
              const a = porId.get(v.agendamentoId);
              if (!a) return null;
              return (
                <tr key={v.chave}>
                  <td className="g-tab">{hora(v.quando)}</td>
                  <td>{v.perna === "buscar" ? "Buscar" : "Levar"}</td>
                  <td><b>{a.pets?.nome}</b><small>{a.pets?.clientes?.nome}{a.pets?.clientes?.telefone ? ` · ${fmtTelefone(a.pets.clientes.telefone)}` : ""}</small>{a.pets?.alertas && <small>Atenção: {a.pets.alertas}</small>}{a.obs && <small>{a.obs}</small>}</td>
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

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={3} />}><LevaTraz /></Suspense>;
}

