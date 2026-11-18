"use client";

import { alertaCurto } from "@/lib/gestao/quadro";
import { guardarLembrado, lerLembrado } from "@/components/gestao/lembrado";
import { modoSimples } from "@/lib/gestao/modo-simples";
import { useFaxinaDoBoletim } from "@/components/gestao/boletim/boletim";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { MarcaSemCobranca, semCobranca, useParaCobrar } from "@/components/gestao/agenda/para-cobrar";
import { useRouter, useSearchParams } from "next/navigation";
import { BellRing, CalendarCheck2, CalendarOff, ChevronLeft, ChevronRight, Lock, MessageCircle, Plus, SquareKanban, Truck, Printer, Users, Utensils, X } from "lucide-react";
import type { AgendamentoCompleto, Bloqueio, PetComTutor } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { nomeDosServicos, servicosPorExtenso } from "@/lib/gestao/servicos-do-horario";

import { deMin, marcadoPara, paraMin, textoConfirmacao, vagasDe } from "@/lib/gestao/agenda";

import { almocoDoDia, dataAmigavel, nomeNaEquipe, dataLonga, linkWhatsApp, deIsoDia, hora, horarioDoDia, inicioDaSemana, isoDia, mesmoDia, nomeDiaCurto, nomeMes, somaDias } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { Rosca } from "@/components/gestao/painel";
import { AvatarPet, DICA_SO_CONSULTA, Esqueleto, Vazio, abrirAssistente, ok, useAdiantar, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import PedidosLink from "@/components/gestao/agenda/pedidos-link";
import SeriesAcabando from "@/components/gestao/agenda/series-acabando";
import LinkRapido from "@/components/gestao/agenda/link-rapido";
import type { Marcado } from "@/components/gestao/agenda/form-agendamento";
import dynamic from "next/dynamic";
import LembretesDoDia, { BotaoLembrete, lembretesQueFaltam } from "@/components/gestao/agenda/lembretes";
import { fraseDoDiaFechado } from "@/lib/gestao/feriados";
import { useCalendario } from "@/components/gestao/calendario";
import { artigoDe } from "@/lib/gestao/modulos";
import "./agenda.css";
import { minutosDesde, textoProntoEm, useComecoDaConta } from "@/components/gestao/pronto-em";
import { comPrecosDeAgendamento } from "@/lib/gestao/reservado";

// folhas que só abrem com um toque: vêm à parte e baixam depois que a agenda abriu (useAdiantar)
const carregarForm = () => import("@/components/gestao/agenda/form-agendamento");
const carregarDetalhe = () => import("@/components/gestao/agenda/detalhe-agendamento");
const FormAgendamento = dynamic(carregarForm, { ssr: false });
const DetalheAgendamento = dynamic(carregarDetalhe, { ssr: false });
const FormBloqueio = dynamic(() => import("@/components/gestao/agenda/form-bloqueio"), { ssr: false });

type Novo = { dia: string; hora?: string; pet?: PetComTutor | null; profissional?: string | null };
const H_HORA = 64; // altura de uma hora na visão de semana, em px
/** Bloqueio recortado dentro de um dia, em minutos desde 00:00. */
type Trecho = { b: Bloqueio; de: number; ate: number; inteiro: boolean };

function Agenda() {
  const { sb, petshop, equipe, liberado, souDono, eu, vejoFinanceiro } = useGestao();
  const simples = modoSimples(petshop);
  useFaxinaDoBoletim(); // boletim do pet: apaga os arquivos da fila (nada aparece na tela)
  const router = useRouter();
  const params = useSearchParams();
  const somenteLeitura = useSomenteLeitura();
  useAdiantar(carregarForm, carregarDetalhe);
  const [dia, setDia] = useState(() => params.get("dia") ?? isoDia(new Date()));
  const [visao, setVisao] = useState<"dia" | "semana">(() => (params.get("visao") === "semana" ? "semana" : "dia"));
  // de quem é a agenda na tela: o aparelho lembra a última escolha de cada pessoa. Quem atende e não mexe com dinheiro
  // (tosador, banhista) começa vendo só os horários dela; o dono e a recepção começam em Todos.
  const chaveProf = `gestao:agenda:prof:${petshop.id}:${eu.id}`;
  const [prof, setProfSolto] = useState<string | null>(() => {
    const atendem = equipe.filter((p) => p.ativo && p.atende);
    if (atendem.length < 2) return null;
    const guardado = lerLembrado(chaveProf);
    if (guardado === "todos") return null;
    if (guardado && atendem.some((p) => p.id === guardado)) return guardado;
    return eu.atende && !vejoFinanceiro && !souDono && atendem.some((p) => p.id === eu.id) ? eu.id : null;
  });
  const setProf = (id: string | null) => { setProfSolto(id); guardarLembrado(chaveProf, id ?? "todos"); };
  const [novo, setNovo] = useState<Novo | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<AgendamentoCompleto | null>(null);
  const [bloqueando, setBloqueando] = useState(false);
  const [lembretes, setLembretes] = useState(false);
  const [bloqueioAberto, setBloqueioAberto] = useState<Bloqueio | null>(null);
  // horário que acabou de ser marcado: a agenda fica no dia dele, com ele em destaque e a confirmação para o tutor à mão
  const [recem, setRecem] = useState<Marcado | null>(null);
  // veio do fim do guia ("Marcar o primeiro horário"): o aviso do marcado diz em quanto tempo a conta ficou pronta
  const [primeiraVez, setPrimeiraVez] = useState(false);
  const comeco = useComecoDaConta();
  const [prontoEm, setProntoEm] = useState<number | null>(null);

  const quemAtende = equipe.filter((p) => p.ativo && p.atende);
  // dia marcado como fechado em Meu pet shop (feriado, folga, médico): vale como o dia em que o pet shop não abre na semana
  useCalendario();
  const fechadoEm = (d: Date) => fraseDoDiaFechado(isoDia(d));
  const abreEm = (d: Date) => (fechadoEm(d) ? null : horarioDoDia(petshop.horario, d));
  const data = deIsoDia(dia);
  const segunda = inicioDaSemana(data);
  const semana = useMemo(() => Array.from({ length: 7 }, (_, i) => somaDias(segunda, i)), [segunda.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  // o preço de cada horário vem à parte; o banco só entrega a quem recebe (sempre pergunta: o formulário de editar
  // regrava o preço que leu, e com o banco antes da atualização quem não recebe ainda lê o preço direto)
  const { dados, carregando, erro, recarregar } = useDados(async () =>
    await comPrecosDeAgendamento(sb, petshop.id, ok(await sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id)
      .gte("inicio", segunda.toISOString()).lt("inicio", somaDias(segunda, 7).toISOString()).order("inicio")) as unknown as AgendamentoCompleto[]) as unknown as AgendamentoCompleto[],
  [petshop.id, segunda.getTime()]);

  // concluídos da semana que ninguém cobrou (o banco diz quais, sem valor): a marca "Falta cobrar" no lugar de "Concluído"
  const { ids: semConta } = useParaCobrar(segunda, somaDias(segunda, 6));

  const { dados: bloqueios, recarregar: recarregarBloqueios } = useDados(async () =>
    ok(await sb.from("bloqueios").select("*").eq("petshop_id", petshop.id)
      .lt("inicio", somaDias(segunda, 7).toISOString()).gt("fim", segunda.toISOString()).order("inicio")),
  [petshop.id, segunda.getTime()]);

  // link "Agendar" vindo da ficha do pet: /gestao/app/agenda?novo=1&pet=<id>
  useEffect(() => {
    if (params.get("novo") !== "1") return;
    // conta só para consulta: o atalho não abre o formulário (o banco recusaria a gravação)
    if (somenteLeitura()) { router.replace("/gestao/app/agenda"); return; }
    const petId = params.get("pet");
    if (params.get("primeiro") === "1") setPrimeiraVez(true);
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
  // lembretes do dia escolhido: conta todos os profissionais (um por tutor), só de hoje em diante
  const faltamLembretes = lembretesQueFaltam((dados ?? []).filter((a) => mesmoDia(new Date(a.inicio), data)));
  const quandoDia = dataAmigavel(data);
  const selecionado = aberto ? (dados ?? []).find((a) => a.id === aberto) ?? null : null;
  const abrirNovo = (n: Novo) => { if (!somenteLeitura()) setNovo(n); };

  // bloqueios: com filtro de profissional, só os dele e os do pet shop inteiro
  const nomesDaEquipe = equipe.map((p) => p.nome);
  const nomeDe = (id: string | null) => (id ? nomeNaEquipe(equipe.find((p) => p.id === id)?.nome, nomesDaEquipe) || "Profissional" : "Pet shop inteiro");
  const bloqueiosVisiveis = (bloqueios ?? []).filter((b) => !prof || !b.profissional_id || b.profissional_id === prof);
  const trechosDe = (d: Date): Trecho[] => {
    const base = d.getTime(), fimDoDia = Math.round((somaDias(d, 1).getTime() - base) / 60000);
    return bloqueiosVisiveis.map((b) => ({ b, de: Math.max(0, Math.round((new Date(b.inicio).getTime() - base) / 60000)), ate: Math.min(fimDoDia, Math.round((new Date(b.fim).getTime() - base) / 60000)) }))
      .filter((t) => t.ate > t.de).map((t) => ({ ...t, inteiro: t.de === 0 && t.ate >= fimDoDia }));
  };
  const bloqueiosDoDia = trechosDe(data);
  /** O pet shop inteiro bloqueado o dia todo (ou todo o horário em que abre): na semana, o dia aparece como bloqueado, não "aberto". */
  const bloqueioDoDiaTodo = (d: Date) => {
    const h = horarioDoDia(petshop.horario, d);
    return trechosDe(d).find((t) => !t.b.profissional_id && (t.inteiro || (h && t.de <= paraMin(h.abre) && t.ate >= paraMin(h.fecha))))?.b ?? null;
  };
  const textoDoBloqueio = (b: Bloqueio) => `Bloqueado${b.motivo ? `: ${b.motivo}` : ""}`;
  const textoDoTrecho = (t: Trecho) => (t.inteiro ? "Dia inteiro" : `${deMin(t.de)} às ${deMin(t.ate)}`);
  const abrirBloqueio = (b: Bloqueio) => { if (!somenteLeitura()) setBloqueioAberto(b); };

  // janelas livres do dia (entre um atendimento e outro, dentro do funcionamento)
  const diaFechadoHoje = fechadoEm(data);
  const funcionamento = abreEm(data);
  // almoço do pet shop (Meu pet shop > Horário): intervalo fechado todo dia, sem bloqueio manual
  const almoco = diaFechadoHoje || bloqueioDoDiaTodo(data) ? null : almocoDoDia(petshop.horario, data);
  const linhas = useMemo(() => {
    type Linha = { tipo: "ag"; a: AgendamentoCompleto } | { tipo: "livre"; de: number; ate: number } | { tipo: "bloq"; t: Trecho } | { tipo: "almoco"; de: number; ate: number };
    const out: { de: number; linha: Linha }[] = [];
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
      ...(almoco ? [{ linha: { tipo: "almoco", de: almoco.inicio, ate: almoco.fim } as Linha, de: almoco.inicio, ate: almoco.fim, conta: true }] : []),
    ].sort((x, y) => x.de - y.de || Number(y.linha.tipo === "bloq") - Number(x.linha.tipo === "bloq"));
    for (const it of itens) {
      if (it.conta && cursor != null && fecha != null && it.de - cursor >= 30 && cursor < fecha) out.push({ de: cursor, linha: { tipo: "livre", de: cursor, ate: Math.min(it.de, fecha) } });
      out.push({ de: it.de, linha: it.linha });
      if (it.conta && cursor != null) cursor = Math.max(cursor, it.ate);
    }
    if (cursor != null && fecha != null && fecha - cursor >= 30) out.push({ de: cursor, linha: { tipo: "livre", de: cursor, ate: fecha } });
    // sempre na ordem do relógio: o tempo livre não fica depois de um horário cancelado ou marcado fora do expediente
    return out.map((x, i) => ({ ...x, i })).sort((x, y) => x.de - y.de || x.i - y.i).map((x) => x.linha);
  }, [doDia, bloqueiosDoDia, funcionamento, almoco?.inicio, almoco?.fim, data.getTime(), prof, quemAtende.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // horários que passam das vagas: mais pets ao mesmo tempo do que o pet shop atende (conta todos os profissionais e os "a definir")
  const vagas = vagasDe(petshop, equipe);
  const lotados = useMemo(() => {
    const ativos = (dados ?? []).filter((a) => !["cancelado", "faltou"].includes(a.status))
      .map((a) => ({ id: a.id, de: new Date(a.inicio).getTime(), ate: new Date(a.fim).getTime() }));
    const mapa = new Map<string, number>();
    for (const a of ativos) {
      const juntos = ativos.filter((b) => b.de <= a.de && b.ate > a.de);
      if (juntos.length > vagas) for (const b of juntos) mapa.set(b.id, Math.max(mapa.get(b.id) ?? 0, juntos.length));
    }
    return mapa;
  }, [dados, vagas]);

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
        <div className="g-acoes g-agd-acoes">
          <div className="g-seg" role="group" aria-label="Visão">
            <button aria-pressed={visao === "dia"} onClick={() => setVisao("dia")}>Dia</button>
            <button aria-pressed={visao === "semana"} onClick={() => setVisao("semana")}>Semana</button>
          </div>
          {!simples && <Link className="g-btn sec" href="/gestao/app/agenda/quadro" title="Quadro do dia: quem está esperando, no banho, secando, pronto e entregue"><SquareKanban />Quadro do dia</Link>}
          {resumo.levaTraz > 0 && <Link className="g-btn sec" href={`/gestao/app/agenda/leva-traz?dia=${dia}`} title="Buscar e levar os pets do dia, com endereço e rota"><Truck />Leva e traz</Link>}
          {!simples && <Link className="g-btn sec" href={`/gestao/app/agenda/imprimir?dia=${dia}&visao=${visao}${prof ? `&prof=${prof}` : ""}`} title="Imprimir ou salvar a agenda em PDF"><Printer />Imprimir</Link>}
          {liberado && <LinkRapido />}
          <button className="g-btn sec" disabled={!liberado} title={liberado ? undefined : DICA_SO_CONSULTA} onClick={() => { if (!somenteLeitura()) setBloqueando(true); }}><Lock />Bloquear horário</button>
          <button className="g-btn pri" disabled={!liberado} title={liberado ? undefined : DICA_SO_CONSULTA} onClick={() => abrirNovo({ dia })}><Plus />Marcar horário</button>
        </div>
      </header>

      <div className="g-pilha">
        {recem && <MarcadoAgora marcado={recem} lista={dados ?? []} prontoEm={prontoEm} aoAbrir={() => setAberto(recem.id)} aoFechar={() => { setRecem(null); setProntoEm(null); }} />}
        <PedidosLink />
        <SeriesAcabando aoMudar={() => void recarregar()} />
        <div className="g-fila g-card g-ag-faixa">
          <button className="g-ico" aria-label="Semana anterior" onClick={() => setDia(isoDia(somaDias(data, -7)))}><ChevronLeft /></button>
          <div className="g-dias g-cresce">
            {semana.map((d) => (
              <button key={d.getTime()} className={`g-dia${mesmoDia(d, new Date()) ? " hoje" : ""}${temNoDia(d) ? " tem" : ""}${abreEm(d) ? "" : " fech"}`} aria-pressed={mesmoDia(d, data)} title={abreEm(d) ? undefined : fechadoEm(d) ?? "O pet shop não abre neste dia"} onClick={() => setDia(isoDia(d))}>
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
        {faltamLembretes > 0 && (
          <button className="g-lb-chamada" onClick={() => setLembretes(true)}>
            <MessageCircle aria-hidden />
            <span><b>Mandar os lembretes {quandoDia === "hoje" || quandoDia === "amanhã" ? `de ${quandoDia}` : "deste dia"}</b> {faltamLembretes === 1 ? "Falta 1 tutor" : `Faltam ${faltamLembretes} tutores`}, um toque para cada.{!funcionamento ? ` Atenção: ${(diaFechadoHoje ?? "o pet shop não abre neste dia").replace(/^Dia /, "dia ")}.` : ""}</span>
            <ChevronRight aria-hidden />
          </button>
        )}

        {quemAtende.length > 1 && (
          <div className="g-chips">
            <button className="g-chip" aria-pressed={prof === null} onClick={() => setProf(null)}>Todos</button>
            {quemAtende.map((p) => <button key={p.id} className="g-chip" aria-pressed={prof === p.id} onClick={() => setProf(p.id)}><i style={{ background: p.cor }} />{p.id === eu.id ? "Só os meus" : nomeNaEquipe(p.nome, nomesDaEquipe)}</button>)}
          </div>
        )}

        {erro && <p className="g-erro">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={4} /> : visao === "semana" ? (
          <>
          <div className="g-agd-sem g-so-cel" role="list" aria-label="Dias da semana">
            {semana.map((d) => {
              const lista = todos.filter((a) => mesmoDia(new Date(a.inicio), d) && !["cancelado", "faltou"].includes(a.status));
              const fechado = fechadoEm(d), abre = abreEm(d);
              const quantos = lista.length === 0 ? null : lista.length === 1 ? "1 horário" : `${lista.length} horários`;
              const horas = lista.length === 0 ? null : lista.length === 1 ? `às ${hora(lista[0].inicio)}` : `primeiro às ${hora(lista[0].inicio)}, último às ${hora(lista[lista.length - 1].inicio)}`;
              const bloqueado = bloqueioDoDiaTodo(d);
              const situacao = fechado ?? (abre ? (bloqueado ? textoDoBloqueio(bloqueado) : null) : "Fechado");
              return (
                <div role="listitem" key={d.getTime()}>
                <button className={`g-agd-sem-dia${mesmoDia(d, new Date()) ? " hoje" : ""}${situacao ? " fech" : ""}`}
                  onClick={() => { setDia(isoDia(d)); setVisao("dia"); }}>
                  <span className="d">{nomeDiaCurto(d)}<b>{d.getDate()}</b></span>
                  <span className="t">
                    <b>{quantos ?? situacao ?? "Nenhum horário"}</b>
                    <span>{[horas, quantos && situacao ? situacao.replace(/^Dia /, "dia ") : null, !quantos && abre && !bloqueado ? `aberto das ${abre.abre} às ${abre.fecha}` : null, mesmoDia(d, new Date()) ? "hoje" : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  {quantos && <span className="n" aria-hidden>{lista.length}</span>}
                  <ChevronRight aria-hidden />
                </button>
                </div>
              );
            })}
          </div>
          <div className="g-semana g-so-pc" style={{ "--dias": diasDaSemana.length, "--h-hora": `${H_HORA}px` } as React.CSSProperties}>
            <div className="g-semana-cab">
              <div />
              {diasDaSemana.map((d) => <div key={d.getTime()} className={mesmoDia(d, new Date()) ? "hoje" : ""}>{nomeDiaCurto(d)}<b>{d.getDate()}</b>{!abreEm(d) ? <small className="g-agd-fech" title={fechadoEm(d) ?? "O pet shop não abre neste dia"}>{fechadoEm(d)?.replace(/^Dia fechado: /, "Fechado: ").replace(/^Dia marcado como fechado$/, "Fechado") ?? "Fechado"}</small>
                : bloqueioDoDiaTodo(d) ? <small className="g-agd-fech" title="O pet shop inteiro está bloqueado neste dia">{textoDoBloqueio(bloqueioDoDiaTodo(d)!)}</small> : null}</div>)}
            </div>
            <div className="g-semana-horas" style={{ height: ((faixa.fim - faixa.ini) / 60) * H_HORA }}>
              {Array.from({ length: (faixa.fim - faixa.ini) / 60 }, (_, i) => i).slice(1).map((i) => <span key={i} style={{ top: i * H_HORA }}>{deMin(faixa.ini + i * 60)}</span>)}
            </div>
            {diasDaSemana.map((d) => {
              const lista = todos.filter((a) => mesmoDia(new Date(a.inicio), d));
              // atendimentos que se cruzam formam um grupo e dividem a largura da coluna em até duas raias;
              // com mais do que isso, a primeira raia aparece e o resto vira um botão "+N" que abre o dia
              const grupos: { itens: AgendamentoCompleto[]; de: number; ate: number; raias: AgendamentoCompleto[][] }[] = [];
              for (const a of lista) {
                const i = new Date(a.inicio).getTime(), f = new Date(a.fim).getTime();
                const g = grupos[grupos.length - 1];
                if (g && i < g.ate) { g.itens.push(a); g.ate = Math.max(g.ate, f); } else grupos.push({ itens: [a], de: i, ate: f, raias: [] });
              }
              for (const g of grupos) {
                for (const a of g.itens) {
                  const r = g.raias.find((x) => new Date(x[x.length - 1].fim) <= new Date(a.inicio));
                  if (r) r.push(a); else g.raias.push([a]);
                }
              }
              const topoDe = (ms: number) => { const x = new Date(ms); return ((x.getHours() * 60 + x.getMinutes() - faixa.ini) / 60) * H_HORA; };
              const agora = new Date();
              return (
                <div key={d.getTime()} className={`g-semana-col${abreEm(d) && !bloqueioDoDiaTodo(d) ? "" : " fechado"}${mesmoDia(d, new Date()) ? " hoje" : ""}`}
                  style={{ height: ((faixa.fim - faixa.ini) / 60) * H_HORA }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                    abrirNovo({ dia: isoDia(d), hora: deMin(faixa.ini + Math.floor((y / H_HORA) * 2) * 30), profissional: prof });
                  }}>
                  {mesmoDia(d, agora) && agora.getHours() * 60 >= faixa.ini && agora.getHours() * 60 < faixa.fim && (
                    <div className="g-agora" style={{ top: ((agora.getHours() * 60 + agora.getMinutes() - faixa.ini) / 60) * H_HORA }} />
                  )}
                  {(() => {
                    const al = fechadoEm(d) || bloqueioDoDiaTodo(d) ? null : almocoDoDia(petshop.horario, d);
                    return al && <div className="g-agd-faixa almoco" title={`Almoço, das ${al.de} às ${al.ate}. Muda em Meu pet shop, no horário de funcionamento.`}
                      style={{ top: ((al.inicio - faixa.ini) / 60) * H_HORA, height: ((al.fim - al.inicio) / 60) * H_HORA }}><Utensils aria-hidden /><span>Almoço</span></div>;
                  })()}
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
                  {grupos.map((g) => {
                    const cheio = g.raias.length > 2;
                    const colunas = cheio ? 2 : g.raias.length;
                    const escondidos = cheio ? g.itens.length - g.raias[0].length : 0;
                    const algumLotado = g.itens.some((a) => lotados.has(a.id));
                    return [
                      ...(cheio ? [g.raias[0]] : g.raias).flatMap((r, ri) => r.map((a) => {
                        const i = new Date(a.inicio), f = new Date(a.fim);
                        const alt = Math.max(26, ((f.getTime() - i.getTime()) / 36e5) * H_HORA - 2);
                        const tutor = a.pets?.clientes?.nome;
                        return (
                          <button key={a.id} className={`g-bloco${["cancelado", "faltou"].includes(a.status) ? " apagado" : ""}${lotados.has(a.id) ? " lotado" : ""}${colunas > 1 ? " estreito" : ""}`} onClick={() => setAberto(a.id)}
                            title={`${hora(a.inicio)} · ${a.pets?.nome ?? "Pet"}${tutor ? ` (${tutor})` : ""} · ${nomeDosServicos(a) ?? "Atendimento"}${lotados.has(a.id) ? ` · passa das vagas: ${lotados.get(a.id)} ao mesmo tempo` : ""}`}
                            style={{ top: topoDe(i.getTime()), height: alt, left: `calc(${(ri / colunas) * 100}% + 3px)`, right: `calc(${((colunas - ri - 1) / colunas) * 100}% + 3px)`, "--cor": a.servicos?.cor ?? "#f97316" } as React.CSSProperties}>
                            <b>{a.pets?.nome}</b>
                            <span>{hora(a.inicio)}{alt > 40 ? ` · ${nomeDosServicos(a) ?? ""}` : ""}</span>
                            {alt > 56 && tutor && <span>{tutor}</span>}
                            {alt > 62 && a.pets && colunas === 1 && <span className="av"><AvatarPet pet={a.pets} tamanho="p" /></span>}
                          </button>
                        );
                      })),
                      cheio && (
                        <button key={`mais-${g.de}`} className={`g-bloco g-agd-mais${algumLotado ? " lotado" : ""}`} onClick={() => { setDia(isoDia(d)); setVisao("dia"); }}
                          title={`Mais ${escondidos} no mesmo horário: ${g.itens.filter((a) => !g.raias[0].includes(a)).map((a) => `${hora(a.inicio)} ${a.pets?.nome ?? "Pet"}`).join(", ")}. Toque para ver o dia.`}
                          style={{ top: topoDe(g.de), height: Math.max(26, ((g.ate - g.de) / 36e5) * H_HORA - 2), left: "calc(50% + 3px)", right: "3px" } as React.CSSProperties}>
                          <b>+{escondidos}</b>
                          <span>{algumLotado ? "acima das vagas" : "ver o dia"}</span>
                        </button>
                      ),
                    ];
                  })}
                </div>
              );
            })}
          </div>
          </>
        ) : !doDia.length && !bloqueiosDoDia.length && !almoco ? (
          <div className="g-card">
            <Vazio titulo={funcionamento ? "Dia livre por enquanto" : diaFechadoHoje ?? "O pet shop não abre neste dia"}
              texto={funcionamento ? `Nenhum horário marcado. Aberto das ${funcionamento.abre} às ${funcionamento.fecha}.` : diaFechadoHoje ? "O pet shop não abre neste dia (a lista fica em Meu pet shop, em Feriados e dias fechados). Se for atender mesmo assim, é só marcar." : "Se for atender mesmo assim, é só marcar."}>
              {!funcionamento && souDono && <p className="g-pp" style={{ textAlign: "center" }}><Link className="g-link" href="/gestao/app/meu-petshop#feriados">Feriados e dias fechados</Link>: lá o botão Colocar os feriados nacionais põe todos os do ano de uma vez.</p>}
              <div className="g-fila" style={{ justifyContent: "center" }}>
                <button className="g-btn pri" onClick={() => abrirNovo({ dia })}><Plus />Marcar horário</button>
                <button className="g-btn sec" onClick={() => abrirAssistente()}>Pedir ao Mozart</button>
              </div>
            </Vazio>
          </div>
        ) : (
          <div className="g-duas">
            <div className="g-tempo">
              {!funcionamento && (
                <div className="g-aviso g-agd-diafech" role="status"><CalendarOff aria-hidden /><span className="g-cresce"><b>{diaFechadoHoje ?? "O pet shop não abre neste dia"}.</b> {diaFechadoHoje ? "O pet shop não abre neste dia. " : ""}{doDia.some((a) => !["cancelado", "faltou"].includes(a.status)) ? "Os horários abaixo continuam marcados: confira com o tutor ou remarque." : "Se for atender mesmo assim, é só marcar."}{souDono && <> <Link className="g-link" href="/gestao/app/meu-petshop#feriados">Feriados e dias fechados</Link> (com o botão Colocar os feriados nacionais).</>}</span></div>
              )}
              {linhas.map((l, i) => l.tipo === "livre" ? (
                <div className="g-hora-grupo livre" key={`l${i}`}>
                  <time>{deMin(l.de)}</time>
                  <span className="ponto" aria-hidden />
                  <button className="g-livre" onClick={() => abrirNovo({ dia, hora: deMin(l.de), profissional: prof })}><Plus size={16} />Livre até {deMin(l.ate)}</button>
                </div>
              ) : l.tipo === "almoco" ? (
                <div className="g-hora-grupo g-agd-linha" key="almoco">
                  <time>{deMin(l.de)}</time>
                  <span className="ponto" aria-hidden />
                  <div className="g-agd-bloq almoco" role="note">
                    <span className="g-agd-cadeado"><Utensils aria-hidden /></span>
                    <span className="t">
                      <b>Almoço</b>
                      <span>Até {deMin(l.ate)}</span>
                    </span>
                    <span className="g-tag">Fechado</span>
                  </div>
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
                  <div className="g-lb-par">
                  <button className={`g-ag${["cancelado", "faltou"].includes(l.a.status) ? " apagado" : ""}${recem?.id === l.a.id ? " recem" : ""}`} onClick={() => setAberto(l.a.id)}>
                    {l.a.pets && <AvatarPet pet={l.a.pets} />}
                    <span className="t">
                      <b>{l.a.pets?.nome}</b>
                      <span className="serv"><i />{[nomeDosServicos(l.a), quemAtende.length > 1 && l.a.profissionais ? nomeNaEquipe(l.a.profissionais.nome, nomesDaEquipe) : null].filter(Boolean).join(" · ") || "Atendimento"}</span>
                      {/* o alerta do pet vem antes de qualquer outra marca: quem vai pegar o pet lê antes de tocar */}
                      {l.a.pets?.alertas && !["cancelado", "faltou"].includes(l.a.status) && <span className="g-agd-alerta">{alertaCurto(l.a.pets.alertas)}</span>}
                      {l.a.pets?.clientes?.nome && <span className="g-agd-tutor">Tutor: {l.a.pets.clientes.nome}</span>}
                      {lotados.has(l.a.id) && !["cancelado", "faltou"].includes(l.a.status) && <span className="g-agd-lotado"><Users size={13} aria-hidden /><span>Passa das vagas<span className="g-agd-lotado-n">: {lotados.get(l.a.id)} ao mesmo tempo</span></span></span>}
                    </span>
                    {l.a.leva_traz && <Truck size={18} aria-label="Leva e traz" />}
                    {l.a.pronto_avisado_em && <span className="g-agd-avisado" role="img" aria-label={`Tutor avisado às ${hora(l.a.pronto_avisado_em)}`} title={`Tutor avisado às ${hora(l.a.pronto_avisado_em)}`}><BellRing aria-hidden /></span>}
                    {semConta.has(l.a.id) ? <span className="g-tag laranja">Falta cobrar</span>
                      : semCobranca(l.a) ? <MarcaSemCobranca a={l.a} />
                      : l.a.status !== "marcado" && <span className={`g-tag ${STATUS_AGENDAMENTO[l.a.status].tom}`}>{STATUS_AGENDAMENTO[l.a.status].rotulo}</span>}
                  </button>
                  <BotaoLembrete agendamento={l.a} doDia={dados ?? []} aoMandar={() => void recarregar()} />
                  </div>
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
                {doDia.some((a) => semConta.has(a.id)) && <div><span className="g-muted">Concluídos sem cobrança</span><b>{doDia.filter((a) => semConta.has(a.id)).length}</b></div>}
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
        aoFechar={() => setNovo(null)} aoSalvar={(m) => {
          setNovo(null);
          if (m) { setDia(isoDia(new Date(m.inicio))); setVisao("dia"); setRecem(m); if (primeiraVez) { setProntoEm(minutosDesde(comeco)); setPrimeiraVez(false); } }
          void recarregar();
        }} />}
      {selecionado && !editando && <DetalheAgendamento agendamento={selecionado} aoFechar={() => setAberto(null)} aoMudar={() => void recarregar()} aoEditar={() => setEditando(selecionado)} />}
      {lembretes && <LembretesDoDia dia={dia} aoFechar={() => setLembretes(false)} aoMudar={() => void recarregar()} />}
      {bloqueando && <FormBloqueio diaInicial={dia} profissionalInicial={prof} aoFechar={() => setBloqueando(false)} aoSalvar={() => { setBloqueando(false); void recarregarBloqueios(); }} />}
      {bloqueioAberto && <FormBloqueio key={bloqueioAberto.id} bloqueio={bloqueioAberto} aoFechar={() => setBloqueioAberto(null)} aoSalvar={() => { setBloqueioAberto(null); void recarregarBloqueios(); }} />}
      {editando && <FormAgendamento agendamento={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); setAberto(null); void recarregar(); }} />}
    </>
  );
}

/**
 * Depois de "Marcar": fica no alto da agenda até a pessoa fechar, com o dia e a hora por extenso e a confirmação pronta
 * para o tutor no WhatsApp (quem manda é a pessoa). Assim ninguém fica na dúvida se gravou e marca de novo.
 */
function MarcadoAgora({ marcado, lista, prontoEm, aoAbrir, aoFechar }: { marcado: Marcado; lista: AgendamentoCompleto[]; prontoEm?: number | null; aoAbrir: () => void; aoFechar: () => void }) {
  const { petshop } = useGestao();
  const a = lista.find((x) => x.id === marcado.id);
  const tutor = a?.pets?.clientes;
  // horário que já passou (marcado depois, para anotar): confirmação para o tutor não faz sentido (achado da Neide)
  const passou = new Date(marcado.inicio).getTime() < Date.now();
  const zap = a && !passou ? linkWhatsApp(tutor?.telefone, textoConfirmacao({
    tutor: tutor?.nome, pet: a.pets?.nome ?? "seu pet", sexo: a.pets?.sexo ?? marcado.sexo, servico: servicosPorExtenso(a), quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome,
  })) : null;
  const nome = a?.pets?.nome ?? marcado.pet;
  return (
    <section className="g-card g-agd-recem" role="status" aria-live="polite">
      <div className="g-fila" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
        <CalendarCheck2 aria-hidden />
        <div className="g-cresce">
          <b>{nome ? marcadoPara(nome, a?.pets?.sexo ?? marcado.sexo) : "Horário marcado"}: {dataAmigavel(marcado.inicio)} às {hora(marcado.inicio)}.</b>
          {prontoEm != null && <p className="g-pp" data-teste="pronto-em" style={{ margin: "2px 0 0", fontWeight: 600, color: "#24543b" }}>O primeiro horário {petshop.nome.length <= 40 ? `${artigoDe(petshop.nome).do} ${petshop.nome} ` : ""}está marcado. {textoProntoEm(prontoEm)}</p>}
          <p className="g-muted g-pp">{marcado.quantos > 1 ? `E mais ${marcado.quantos - 1 === 1 ? "1 data" : `${marcado.quantos - 1} datas`} da repetição. ` : ""}O horário está em destaque logo abaixo.</p>
        </div>
        <button className="g-ico" aria-label="Fechar o aviso" onClick={aoFechar}><X /></button>
      </div>
      <div className="g-fila">
        {zap ? <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar confirmação no WhatsApp</a>
          : passou ? <span className="g-muted g-pp">Este horário já passou: não precisa mandar confirmação.</span>
          : a && <span className="g-muted g-pp">Sem telefone do tutor para mandar a confirmação.</span>}
        <button className="g-btn fantasma p" onClick={aoAbrir} disabled={!a}>Abrir o horário</button>
      </div>
    </section>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={4} />}><Agenda /></Suspense>;
}
