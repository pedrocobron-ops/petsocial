"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, ChevronLeft, ChevronRight, Lock, Plus, Truck } from "lucide-react";
import type { AgendamentoCompleto, Bloqueio, PetComTutor } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { deMin, paraMin } from "@/lib/gestao/agenda";
import { dataLonga, deIsoDia, hora, horarioDoDia, inicioDaSemana, isoDia, mesmoDia, nomeDiaCurto, nomeMes, somaDias } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { Rosca } from "@/components/gestao/painel";
import { AvatarPet, Esqueleto, Vazio, abrirAssistente, ok, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import PedidosLink from "@/components/gestao/agenda/pedidos-link";
import LinkRapido from "@/components/gestao/agenda/link-rapido";
import FormAgendamento from "@/components/gestao/agenda/form-agendamento";
import DetalheAgendamento from "@/components/gestao/agenda/detalhe-agendamento";
import FormBloqueio from "@/components/gestao/agenda/form-bloqueio";
import "./agenda.css";

type Novo = { dia: string; hora?: string; pet?: PetComTutor | null; profissional?: string | null };
const H_HORA = 64; // altura de uma hora na visão de semana, em px
/** Bloqueio recortado dentro de um dia, em minutos desde 00:00. */
type Trecho = { b: Bloqueio; de: number; ate: number; inteiro: boolean };

function Agenda() {
  const { sb, petshop, equipe } = useGestao();
  const router = useRouter();
  const params = useSearchParams();
  const somenteLeitura = useSomenteLeitura();
  const [dia, setDia] = useState(() => params.get("dia") ?? isoDia(new Date()));
  const [visao, setVisao] = useState<"dia" | "semana">("dia");
  const [prof, setProf] = useState<string | null>(null);
  const [novo, setNovo] = useState<Novo | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<AgendamentoCompleto | null>(null);
  const [bloqueando, setBloqueando] = useState(false);
  const [bloqueioAberto, setBloqueioAberto] = useState<Bloqueio | null>(null);

  const quemAtende = equipe.filter((p) => p.ativo && p.atende);
  const data = deIsoDia(dia);
  const segunda = inicioDaSemana(data);
  const semana = useMemo(() => Array.from({ length: 7 }, (_, i) => somaDias(segunda, i)), [segunda.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const { dados, carregando, erro, recarregar } = useDados(async () =>
    ok(await sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id)
      .gte("inicio", segunda.toISOString()).lt("inicio", somaDias(segunda, 7).toISOString()).order("inicio")) as unknown as AgendamentoCompleto[],
  [petshop.id, segunda.getTime()]);

  const { dados: bloqueios, recarregar: recarregarBloqueios } = useDados(async () =>
    ok(await sb.from("bloqueios").select("*").eq("petshop_id", petshop.id)
      .lt("inicio", somaDias(segunda, 7).toISOString()).gt("fim", segunda.toISOString()).order("inicio")),
  [petshop.id, segunda.getTime()]);

  // link "Agendar" vindo da ficha do pet: /gestao/app/agenda?novo=1&pet=<id>
  useEffect(() => {
    if (params.get("novo") !== "1") return;
    const petId = params.get("pet");
    void (async () => {
      let pet: PetComTutor | null = null;
      if (petId) pet = (await sb.from("pets").select("*, clientes(id, nome, telefone)").eq("id", petId).maybeSingle()).data as PetComTutor | null;
      setNovo({ dia, pet });
      router.replace("/gestao/app/agenda");
    })();
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const todos = (dados ?? []).filter((a) => !prof || a.profissional_id === prof);
  const doDia = todos.filter((a) => mesmoDia(new Date(a.inicio), data));
  const temNoDia = (d: Date) => (dados ?? []).some((a) => mesmoDia(new Date(a.inicio), d) && !["cancelado"].includes(a.status));
  const selecionado = aberto ? (dados ?? []).find((a) => a.id === aberto) ?? null : null;
  const abrirNovo = (n: Novo) => { if (!somenteLeitura()) setNovo(n); };

  // bloqueios: com filtro de profissional, só os dele e os do pet shop inteiro
  const nomeDe = (id: string | null) => (id ? equipe.find((p) => p.id === id)?.nome.split(" ")[0] ?? "Profissional" : "Pet shop inteiro");
  const bloqueiosVisiveis = (bloqueios ?? []).filter((b) => !prof || !b.profissional_id || b.profissional_id === prof);
  const trechosDe = (d: Date): Trecho[] => {
    const base = d.getTime(), fimDoDia = Math.round((somaDias(d, 1).getTime() - base) / 60000);
    return bloqueiosVisiveis.map((b) => ({ b, de: Math.max(0, Math.round((new Date(b.inicio).getTime() - base) / 60000)), ate: Math.min(fimDoDia, Math.round((new Date(b.fim).getTime() - base) / 60000)) }))
      .filter((t) => t.ate > t.de).map((t) => ({ ...t, inteiro: t.de === 0 && t.ate >= fimDoDia }));
  };
  const bloqueiosDoDia = trechosDe(data);
  const textoDoTrecho = (t: Trecho) => (t.inteiro ? "Dia inteiro" : `${deMin(t.de)} às ${deMin(t.ate)}`);
  const abrirBloqueio = (b: Bloqueio) => { if (!somenteLeitura()) setBloqueioAberto(b); };

  // janelas livres do dia (entre um atendimento e outro, dentro do funcionamento)
  const funcionamento = horarioDoDia(petshop.horario, data);
  const linhas = useMemo(() => {
    type Linha = { tipo: "ag"; a: AgendamentoCompleto } | { tipo: "livre"; de: number; ate: number } | { tipo: "bloq"; t: Trecho };
    const out: Linha[] = [];
    const ativos = doDia.filter((a) => !["cancelado", "faltou"].includes(a.status));
    const base = data.getTime();
    const min = (iso: string) => Math.round((new Date(iso).getTime() - base) / 60000);
    let cursor = funcionamento ? paraMin(funcionamento.abre) : null;
    const agora = new Date();
    if (cursor != null && mesmoDia(agora, data)) cursor = Math.max(cursor, Math.ceil((agora.getHours() * 60 + agora.getMinutes()) / 30) * 30);
    const fecha = funcionamento ? paraMin(funcionamento.fecha) : null;
    // atendimentos e bloqueios na ordem do relógio; o tempo bloqueado não é oferecido como livre.
    // Bloqueio de uma pessoa só tira o tempo livre quando a agenda é dela (filtro) ou só ela atende.
    const itens = [
      ...doDia.map((a) => ({ linha: { tipo: "ag", a } as Linha, de: min(a.inicio), ate: min(a.fim), conta: ativos.includes(a) })),
      ...bloqueiosDoDia.map((t) => ({ linha: { tipo: "bloq", t } as Linha, de: t.de, ate: t.ate, conta: !t.b.profissional_id || t.b.profissional_id === prof || quemAtende.length <= 1 })),
    ].sort((x, y) => x.de - y.de || Number(y.linha.tipo === "bloq") - Number(x.linha.tipo === "bloq"));
    for (const it of itens) {
      if (it.conta && cursor != null && fecha != null && it.de - cursor >= 30 && cursor < fecha) out.push({ tipo: "livre", de: cursor, ate: Math.min(it.de, fecha) });
      out.push(it.linha);
      if (it.conta && cursor != null) cursor = Math.max(cursor, it.ate);
    }
    if (cursor != null && fecha != null && fecha - cursor >= 30) out.push({ tipo: "livre", de: cursor, ate: fecha });
    return out;
  }, [doDia, bloqueiosDoDia, funcionamento, data.getTime(), prof, quemAtende.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const resumo = useMemo(() => {
    const ativos = doDia.filter((a) => !["cancelado", "faltou"].includes(a.status));
    const porServico = new Map<string, { rotulo: string; valor: number; cor: string }>();
    for (const a of ativos) {
      const nome = a.servicos?.nome ?? "Outros";
      const x = porServico.get(nome) ?? { rotulo: nome, valor: 0, cor: a.servicos?.cor ?? "#f97316" };
      x.valor++; porServico.set(nome, x);
    }
    return { total: ativos.length, feitos: ativos.filter((a) => a.status === "concluido").length, fora: doDia.length - ativos.length, levaTraz: ativos.filter((a) => a.leva_traz).length, servicos: [...porServico.values()].sort((a, b) => b.valor - a.valor) };
  }, [doDia]);

  // semana: faixa de horas mostrada
  const faixa = useMemo(() => {
    let ini = 8 * 60, fim = 18 * 60;
    const abertos = semana.map((d) => horarioDoDia(petshop.horario, d)).filter(Boolean) as { abre: string; fecha: string }[];
    if (abertos.length) { ini = Math.min(...abertos.map((h) => paraMin(h.abre))); fim = Math.max(...abertos.map((h) => paraMin(h.fecha))); }
    for (const a of todos) {
      const i = new Date(a.inicio), f = new Date(a.fim);
      ini = Math.min(ini, i.getHours() * 60); fim = Math.max(fim, f.getHours() * 60 + (f.getMinutes() ? 60 : 0));
    }
    return { ini: Math.floor(ini / 60) * 60, fim: Math.ceil(fim / 60) * 60 };
  }, [semana, petshop.horario, todos]);
  const diasDaSemana = semana.filter((d) => horarioDoDia(petshop.horario, d) || temNoDia(d));

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Agenda</h1>
          <p className="g-muted">{mesmoDia(data, new Date()) ? "Hoje, " : ""}{dataLonga(data)}</p>
        </div>
        <div className="g-acoes">
          <div className="g-seg g-so-pc" role="group" aria-label="Visão">
            <button aria-pressed={visao === "dia"} onClick={() => setVisao("dia")}>Dia</button>
            <button aria-pressed={visao === "semana"} onClick={() => setVisao("semana")}>Semana</button>
          </div>
          <LinkRapido />
          <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setBloqueando(true); }}><Lock />Bloquear<span className="g-agd-curto">&nbsp;horário</span></button>
          <button className="g-btn pri" onClick={() => abrirNovo({ dia })}><Plus />Marcar horário</button>
        </div>
      </header>

      <div className="g-pilha">
        <PedidosLink />
        <div className="g-fila g-card g-ag-faixa">
          <button className="g-ico" aria-label="Semana anterior" onClick={() => setDia(isoDia(somaDias(data, -7)))}><ChevronLeft /></button>
          <div className="g-dias g-cresce">
            {semana.map((d) => (
              <button key={d.getTime()} className={`g-dia${mesmoDia(d, new Date()) ? " hoje" : ""}${temNoDia(d) ? " tem" : ""}`} aria-pressed={mesmoDia(d, data)} onClick={() => setDia(isoDia(d))}>
                {nomeDiaCurto(d)}<b>{d.getDate()}</b><i />
              </button>
            ))}
          </div>
          <button className="g-ico" aria-label="Próxima semana" onClick={() => setDia(isoDia(somaDias(data, 7)))}><ChevronRight /></button>
        </div>
        <div className="g-fila entre">
          <span className="g-muted g-p">{nomeMes(data).replace(/^./, (c) => c.toUpperCase())} de {data.getFullYear()}</span>
          {!mesmoDia(data, new Date()) && <button className="g-btn fantasma p" onClick={() => setDia(isoDia(new Date()))}>Voltar para hoje</button>}
        </div>

        {quemAtende.length > 1 && (
          <div className="g-chips">
            <button className="g-chip" aria-pressed={prof === null} onClick={() => setProf(null)}>Todos</button>
            {quemAtende.map((p) => <button key={p.id} className="g-chip" aria-pressed={prof === p.id} onClick={() => setProf(p.id)}><i style={{ background: p.cor }} />{p.nome.split(" ")[0]}</button>)}
          </div>
        )}

        {erro && <p className="g-erro">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={4} /> : visao === "semana" ? (
          <div className="g-semana g-so-pc" style={{ "--dias": diasDaSemana.length, "--h-hora": `${H_HORA}px` } as React.CSSProperties}>
            <div className="g-semana-cab">
              <div />
              {diasDaSemana.map((d) => <div key={d.getTime()} className={mesmoDia(d, new Date()) ? "hoje" : ""}>{nomeDiaCurto(d)}<b>{d.getDate()}</b></div>)}
            </div>
            <div className="g-semana-horas" style={{ height: ((faixa.fim - faixa.ini) / 60) * H_HORA }}>
              {Array.from({ length: (faixa.fim - faixa.ini) / 60 }, (_, i) => i).slice(1).map((i) => <span key={i} style={{ top: i * H_HORA }}>{deMin(faixa.ini + i * 60)}</span>)}
            </div>
            {diasDaSemana.map((d) => {
              const lista = todos.filter((a) => mesmoDia(new Date(a.inicio), d));
              // atendimentos que se sobrepõem dividem a largura da coluna
              const raias: AgendamentoCompleto[][] = [];
              for (const a of lista) {
                const r = raias.find((x) => new Date(x[x.length - 1].fim) <= new Date(a.inicio));
                if (r) r.push(a); else raias.push([a]);
              }
              const agora = new Date();
              return (
                <div key={d.getTime()} className={`g-semana-col${horarioDoDia(petshop.horario, d) ? "" : " fechado"}${mesmoDia(d, new Date()) ? " hoje" : ""}`}
                  style={{ height: ((faixa.fim - faixa.ini) / 60) * H_HORA }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    abrirNovo({ dia: isoDia(d), hora: deMin(faixa.ini + Math.floor((y / H_HORA) * 2) * 30), profissional: prof });
                  }}>
                  {mesmoDia(d, agora) && agora.getHours() * 60 >= faixa.ini && agora.getHours() * 60 < faixa.fim && (
                    <div className="g-agora" style={{ top: ((agora.getHours() * 60 + agora.getMinutes() - faixa.ini) / 60) * H_HORA }} />
                  )}
                  {trechosDe(d).map((t) => {
                    const de = Math.max(t.de, faixa.ini), ate = Math.min(t.ate, faixa.fim);
                    if (ate <= de) return null;
                    const rotulo = `${t.b.motivo ?? "Bloqueado"}${t.b.profissional_id ? ` · ${nomeDe(t.b.profissional_id)}` : ""}`;
                    return (
                      <button key={t.b.id} className="g-agd-faixa" title={`${rotulo}, ${textoDoTrecho(t).toLowerCase()}. Toque para alterar ou remover.`} onClick={() => abrirBloqueio(t.b)}
                        style={{ top: ((de - faixa.ini) / 60) * H_HORA, height: ((ate - de) / 60) * H_HORA }}>
                        <Lock aria-hidden /><span>{rotulo}</span>
                      </button>
                    );
                  })}
                  {raias.map((r, ri) => r.map((a) => {
                    const i = new Date(a.inicio), f = new Date(a.fim);
                    const topo = ((i.getHours() * 60 + i.getMinutes() - faixa.ini) / 60) * H_HORA;
                    const alt = Math.max(26, ((f.getTime() - i.getTime()) / 36e5) * H_HORA - 2);
                    return (
                      <button key={a.id} className={`g-bloco${["cancelado", "faltou"].includes(a.status) ? " apagado" : ""}`} onClick={() => setAberto(a.id)}
                        style={{ top: topo, height: alt, left: `calc(${(ri / raias.length) * 100}% + 3px)`, right: `calc(${((raias.length - ri - 1) / raias.length) * 100}% + 3px)`, "--cor": a.servicos?.cor ?? "#f97316" } as React.CSSProperties}>
                        <b>{a.pets?.nome}</b>
                        <span>{hora(a.inicio)}{alt > 40 ? ` · ${a.servicos?.nome ?? ""}` : ""}</span>
                        {alt > 62 && a.pets && raias.length === 1 && <span className="av"><AvatarPet pet={a.pets} tamanho="p" /></span>}
                      </button>
                    );
                  }))}
                </div>
              );
            })}
          </div>
        ) : !doDia.length && !bloqueiosDoDia.length ? (
          <div className="g-card">
            <Vazio titulo={funcionamento ? "Dia livre por enquanto" : "O pet shop não abre neste dia"}
              texto={funcionamento ? `Nenhum horário marcado. Aberto das ${funcionamento.abre} às ${funcionamento.fecha}.` : "Se for atender mesmo assim, é só marcar."}>
              <div className="g-fila" style={{ justifyContent: "center" }}>
                <button className="g-btn pri" onClick={() => abrirNovo({ dia })}><Plus />Marcar horário</button>
                <button className="g-btn sec" onClick={() => abrirAssistente()}>Pedir ao Mozart</button>
              </div>
            </Vazio>
          </div>
        ) : (
          <div className="g-duas">
            <div className="g-tempo">
              {linhas.map((l, i) => l.tipo === "livre" ? (
                <div className="g-hora-grupo livre" key={`l${i}`}>
                  <time>{deMin(l.de)}</time>
                  <span className="ponto" aria-hidden />
                  <button className="g-livre" onClick={() => abrirNovo({ dia, hora: deMin(l.de), profissional: prof })}><Plus size={16} />Livre até {deMin(l.ate)}</button>
                </div>
              ) : l.tipo === "bloq" ? (
                <div className="g-hora-grupo g-agd-linha" key={`b${l.t.b.id}`}>
                  {l.t.inteiro ? <time className="txt">Dia</time> : <time>{deMin(l.t.de)}</time>}
                  <span className="ponto" aria-hidden />
                  <button className="g-agd-bloq" onClick={() => abrirBloqueio(l.t.b)} aria-label={`Bloqueio: ${l.t.b.motivo ?? "sem motivo"}, ${textoDoTrecho(l.t)}. Toque para alterar ou remover.`}>
                    <span className="g-agd-cadeado"><Lock aria-hidden /></span>
                    <span className="t">
                      <b>{l.t.b.motivo ?? "Bloqueado"}</b>
                      <span>{l.t.inteiro ? "Dia inteiro" : `Até ${deMin(l.t.ate)}`} · {nomeDe(l.t.b.profissional_id)}</span>
                    </span>
                    <span className="g-tag">Bloqueado</span>
                  </button>
                </div>
              ) : (
                <div className={`g-hora-grupo${l.a.status === "concluido" ? " feito" : ""}`} key={l.a.id} style={{ "--cor": l.a.servicos?.cor ?? "#f97316" } as React.CSSProperties}>
                  <time>{hora(l.a.inicio)}</time>
                  <span className="ponto" aria-hidden />
                  <button className={`g-ag${["cancelado", "faltou"].includes(l.a.status) ? " apagado" : ""}`} onClick={() => setAberto(l.a.id)}>
                    {l.a.pets && <AvatarPet pet={l.a.pets} />}
                    <span className="t">
                      <b>{l.a.pets?.nome}</b>
                      <span className="serv"><i />{[l.a.servicos?.nome, l.a.pets?.clientes?.nome, quemAtende.length > 1 ? l.a.profissionais?.nome.split(" ")[0] : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    {l.a.leva_traz && <Truck size={18} aria-label="Leva e traz" />}
                    {l.a.pronto_avisado_em && <span className="g-agd-avisado" role="img" aria-label={`Tutor avisado às ${hora(l.a.pronto_avisado_em)}`} title={`Tutor avisado às ${hora(l.a.pronto_avisado_em)}`}><BellRing aria-hidden /></span>}
                    {l.a.status !== "marcado" && <span className={`g-tag ${STATUS_AGENDAMENTO[l.a.status].tom}`}>{STATUS_AGENDAMENTO[l.a.status].rotulo}</span>}
                  </button>
                </div>
              ))}
            </div>
            <aside className="g-card g-so-pc" style={{ position: "sticky", top: 24 }}>
              <div className="g-card-t"><h3>Resumo do dia</h3><span className="g-muted g-pp">{resumo.total} {resumo.total === 1 ? "horário" : "horários"}</span></div>
              <div className="g-fila" style={{ gap: 18, flexWrap: "nowrap", alignItems: "center" }}>
                <Rosca fatias={resumo.servicos.map((x) => ({ valor: x.valor, cor: x.cor }))}><span style={{ font: "460 1.5rem/1 var(--display)" }}>{resumo.feitos}/{resumo.total}</span></Rosca>
                <div className="g-legenda g-cresce">
                  {resumo.servicos.map((x) => <div key={x.rotulo}><i style={{ background: x.cor }} /><span>{x.rotulo}</span><b>{x.valor}</b></div>)}
                </div>
              </div>
              <hr className="g-sep" style={{ margin: "16px 0 12px" }} />
              <div className="g-legenda">
                <div><span className="g-muted">Concluídos</span><b>{resumo.feitos}</b></div>
                <div><span className="g-muted">Ainda por atender</span><b>{resumo.total - resumo.feitos}</b></div>
                {resumo.levaTraz > 0 && <div><span className="g-muted">Com leva e traz</span><b>{resumo.levaTraz}</b></div>}
                {resumo.fora > 0 && <div><span className="g-muted">Cancelados ou faltas</span><b>{resumo.fora}</b></div>}
                {bloqueiosDoDia.length > 0 && <div><span className="g-muted">Bloqueios</span><b>{bloqueiosDoDia.length}</b></div>}
              </div>
            </aside>
          </div>
        )}
      </div>

      {novo && <FormAgendamento diaInicial={novo.dia} horaInicial={novo.hora} petInicial={novo.pet} profissionalInicial={novo.profissional}
        aoFechar={() => setNovo(null)} aoSalvar={() => { setNovo(null); void recarregar(); }} />}
      {selecionado && !editando && <DetalheAgendamento agendamento={selecionado} aoFechar={() => setAberto(null)} aoMudar={() => void recarregar()} aoEditar={() => setEditando(selecionado)} />}
      {bloqueando && <FormBloqueio diaInicial={dia} profissionalInicial={prof} aoFechar={() => setBloqueando(false)} aoSalvar={() => { setBloqueando(false); void recarregarBloqueios(); }} />}
      {bloqueioAberto && <FormBloqueio key={bloqueioAberto.id} bloqueio={bloqueioAberto} aoFechar={() => setBloqueioAberto(null)} aoSalvar={() => { setBloqueioAberto(null); void recarregarBloqueios(); }} />}
      {editando && <FormAgendamento agendamento={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); setAberto(null); void recarregar(); }} />}
    </>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={4} />}><Agenda /></Suspense>;
}
