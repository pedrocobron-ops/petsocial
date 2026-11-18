"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarX2, ChevronDown, History, ListChecks, Pencil, Plus, Search } from "lucide-react";
import { abreNoDia, DIAS_SEMANA, lerPresencas, planoAtivo, podeMudarPlano, resumoDoMes, taxiDe, type PlanoCompleto } from "@/lib/gestao/creche";
import { brl, dataCompleta, dataCurta, isoDia, nomeMes, semAcento, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, Esqueleto, useDados, useSomenteLeitura, Vazio } from "../ui";
import { Chips } from "../loja/pecas";
import { rascunhosQueComecam } from "../rascunho";
import FormPlano, { mensalistasPorDia } from "./form-plano";
import ModelosDePlano from "./modelos";
import FaltaAvisada from "./falta-avisada";
import AcertoDaSaida, { lerSaidasParaAcertar, type SaidaParaAcertar } from "./saida";
import { DiasDoPlano, ResumoDosMeses } from "./resumo-mes";
import "./creche.css";

const FILTROS = [{ id: "ativos", rotulo: "Ativos" }, { id: "encerrados", rotulo: "Encerrados" }] as const;

/** Um dia qualquer que caia nesse dia da semana (para conferir o horário do pet shop). */
const umDia = (dow: number) => isoDia(somaDias(new Date(2024, 0, 7), dow));

/**
 * Mensalistas: quem tem plano na creche, em que dias vem, quando vence e (para quem vê o financeiro) quanto paga.
 * No alto, quantos mensalistas vêm em cada dia da semana, contra as vagas da creche.
 */
export default function Mensalistas({ planos: lidos, novo, aoAbrirNovo, aoFecharNovo, aoMudar }: {
  planos: PlanoCompleto[]; novo: boolean; aoAbrirNovo: () => void; aoFecharNovo: () => void; aoMudar: () => void;
}) {
  // o plano que acabou de ser salvo aparece na hora (com internet lenta, a tela inteira demora a buscar de novo e o
  // primeiro mensalista parecia não ter entrado). Quando a lista nova chega do banco, ela vale.
  const [recente, setRecente] = useState<{ plano: PlanoCompleto; de: PlanoCompleto[] } | null>(null);
  const planos = useMemo(() => {
    if (!recente || recente.de !== lidos) return lidos;
    return [...lidos.filter((p) => p.id !== recente.plano.id), recente.plano];
  }, [lidos, recente]);
  const lembrar = (salvo?: PlanoCompleto) => setRecente(salvo ? { plano: salvo, de: lidos } : null);
  const { sb, petshop, eu, cuidoDoFinanceiro: vejoFinanceiro, souDono } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  // só o dono e quem cuida do financeiro mexem no plano (a equipe, se o dono liberou em Meu pet shop)
  const pode = podeMudarPlano({ petshop, souDono, cuidoDoFinanceiro: vejoFinanceiro });
  const [modelos, setModelos] = useState(false);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"ativos" | "encerrados">("ativos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<PlanoCompleto | null>(null);
  const [faltando, setFaltando] = useState<PlanoCompleto | null>(null);
  const [acertando, setAcertando] = useState<PlanoCompleto | null>(null);
  const agora = new Date(), hoje = isoDia(agora);
  // cadastro ou alteração de plano começado e não salvo (a tela recarregou, ou fechou no meio): "Continuar" abre de novo com o que foi escrito
  const [rascunhos, setRascunhos] = useState<{ nome: string; v: { pet?: { nome?: string } | null } }[]>([]);
  const formAberto = novo || Boolean(editando);
  useEffect(() => { if (!formAberto) setRascunhos(rascunhosQueComecam(petshop.id, eu.id, "plano:")); }, [formAberto, petshop.id, eu.id]);
  const pendentes = !pode ? [] : rascunhos.flatMap((r) => {
    if (r.nome === "plano:novo") return r.v.pet?.nome ? [{ chave: r.nome, texto: `cadastro de ${r.v.pet.nome} como mensalista`, abrir: aoAbrirNovo }] : [];
    const p = planos.find((x) => `plano:${x.id}` === r.nome);
    return p ? [{ chave: r.nome, texto: `alteração do plano de ${p.pets?.nome ?? "pet"}`, abrir: () => setEditando(p) }] : [];
  });
  const avisoRascunhos = pendentes.length > 0 && (
    <div className="g-rascunho" role="status">
      <History aria-hidden /><span className="g-cresce">Ficou sem salvar: {pendentes.map((x) => x.texto).join("; ")}.</span>
      {pendentes.map((x) => <button key={x.chave} type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) x.abrir(); }}>Continuar{pendentes.length > 1 ? ` (${x.texto.split(" de ").pop()})` : ""}</button>)}
    </div>
  );

  const { dados: mov, carregando } = useDados(async () => {
    if (!planos.length) return { presencas: [], faltas: [] };
    return lerPresencas(sb, petshop.id, isoDia(new Date(agora.getFullYear(), agora.getMonth() - 1, 1)), isoDia(new Date(agora.getFullYear(), agora.getMonth() + 1, 0)));
  }, [petshop.id, planos.length, hoje]);

  // plano que terminou com a mensalidade do mês da saída ainda cheia (ou cobrança de mês em que ele já não vem): o acerto volta aqui
  const { dados: saidas, recarregar: recarregarSaidas } = useDados(async () => (vejoFinanceiro ? lerSaidasParaAcertar(sb, petshop.id, planos, petshop.horario) : [] as SaidaParaAcertar[]),
    [petshop.id, vejoFinanceiro, planos.map((p) => `${p.id}:${p.fim ?? ""}`).join(",")]);
  const ativos = useMemo(() => planos.filter((p) => planoAtivo(p, hoje)), [planos, hoje]);
  const encerrados = planos.length - ativos.length;
  const porDia = mensalistasPorDia(planos, hoje);
  const vagas = petshop.vagas_creche;
  const alvo = semAcento(q);
  const lista = (filtro === "ativos" ? ativos : planos.filter((p) => !planoAtivo(p, hoje)))
    .filter((p) => !alvo || semAcento(p.pets?.nome ?? "").includes(alvo) || semAcento(p.pets?.clientes?.nome ?? "").includes(alvo))
    .sort((a, b) => (a.pets?.nome ?? "").localeCompare(b.pets?.nome ?? "", "pt-BR"));
  const maior = Math.max(1, vagas ?? 0, ...porDia);

  return (
    <>
      {!planos.length ? (<>
        {avisoRascunhos}
        <Vazio titulo="Nenhum mensalista ainda" texto={pode ? "Mensalista é o pet que vem em dias fixos da semana e paga por mês. Cadastre o plano e a chamada do dia já sabe quem esperar." : "Mensalista é o pet que vem em dias fixos da semana e paga por mês. Quem cadastra o plano é o dono ou quem cuida do financeiro."}>
          {pode && <button className="g-btn sec" onClick={aoAbrirNovo}><Plus />Cadastrar o primeiro mensalista</button>}
          {vejoFinanceiro && <button className="g-btn fantasma" onClick={() => setModelos(true)}><ListChecks />Modelos de plano</button>}
        </Vazio>
      </>) : (
        <div className="g-pilha">
          {avisoRascunhos}
          <section className="g-card">
            <div className="g-card-t">
              <h3>Mensalistas por dia da semana</h3>
              <span className="g-muted g-pp">{vagas == null ? "sem limite de vagas definido" : `a creche tem ${vagas} vagas`}</span>
            </div>
            <div className="g-cm-ocupacao" role="list">
              {DIAS_SEMANA.map((d) => {
                const n = porDia[d.id], fechado = !abreNoDia(petshop.horario, umDia(d.id));
                const cheio = vagas != null && n >= vagas;
                return (
                  <div key={d.id} role="listitem" className={`g-cm-col${cheio ? " cheio" : ""}${fechado ? " fechado" : ""}`}>
                    <b className="g-tab">{n}{vagas != null && !fechado ? <small>/{vagas}</small> : null}</b>
                    <span className="g-cm-barra" aria-hidden><i style={{ height: `${Math.round((n / maior) * 100)}%` }} /></span>
                    <span className="dia">{d.curto}</span>
                    {fechado ? <small>fechado</small> : cheio ? <small>cheio</small> : vagas != null ? <small>{vagas - n === 1 ? "1 vaga" : `${vagas - n} vagas`}</small> : null}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="g-fila entre">
            <div className="g-busca g-cm-busca">
              <Search />
              <input className="g-input" type="search" placeholder="Nome do pet ou do tutor" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar mensalista" />
            </div>
            {encerrados > 0 && <Chips opcoes={FILTROS} valor={filtro} aoMudar={setFiltro} />}
            {vejoFinanceiro && <button className="g-btn sec p" onClick={() => setModelos(true)}><ListChecks />Modelos de plano</button>}
          </div>
          <p className="g-muted g-p">{ativos.length === 1 ? "1 mensalista ativo" : `${ativos.length} mensalistas ativos`}{encerrados ? ` · ${encerrados === 1 ? "1 plano encerrado" : `${encerrados} planos encerrados`}` : ""}</p>

          {!lista.length ? <p className="g-muted g-centro" style={{ padding: "24px 8px" }}>Nenhum mensalista com esse nome.</p> : (
            <div className="g-cm-lista">
              {lista.map((p) => {
                const r = mov ? resumoDoMes(p, agora, mov.presencas, mov.faltas, petshop.horario, hoje) : null;
                const aberta = aberto === p.id;
                return (
                  <div key={p.id} className={`g-cm-plano${aberta ? " aberto" : ""}`}>
                    <button type="button" className="g-cm-plano-topo" aria-expanded={aberta} onClick={() => setAberto(aberta ? null : p.id)}>
                      <AvatarPet pet={p.pets ?? { nome: "?" }} />
                      <span className="t">
                        <b>{p.pets?.nome ?? "Pet removido"}</b>
                        <span>{p.pets?.clientes?.nome ?? "Sem tutor"}</span>
                      </span>
                      <ChevronDown className="seta" aria-hidden />
                    </button>
                    <div className="g-cm-plano-info">
                      <DiasDoPlano dias={p.dias} />
                      {p.fim && p.fim < hoje ? <span className="g-tag vermelho">encerrado em {dataCompleta(p.fim)}</span>
                        : <span className="g-tag">vence dia {p.vence_dia}</span>}
                      {p.inicio > hoje && <span className="g-tag azul">começa em {dataCompleta(p.inicio)}</span>}
                      {p.fim && p.fim >= hoje && <span className="g-tag amarelo">até {dataCompleta(p.fim)}</span>}
                      {vejoFinanceiro && (p.temValor ? <span className="g-tag verde g-tab">{brl(p.valor_mensal)}</span> : <span className="g-tag amarelo">sem valor</span>)}
                      {/* o táxi pet entra na cobrança do mês: a lista mostra junto, para bater com Gerar cobranças */}
                      {vejoFinanceiro && p.temValor && taxiDe(p) && Number(p.taxi_valor ?? 0) > 0 && (
                        <span className="g-tag g-tab">{p.taxi_modo === "mes" ? `+ táxi ${brl(Number(p.taxi_valor))} por mês = ${brl(Math.round((Number(p.valor_mensal) + Number(p.taxi_valor)) * 100) / 100)}` : `+ táxi ${brl(Number(p.taxi_valor))} por dia que veio`}</span>
                      )}
                    </div>
                    {r && (r.esperados > 0 || r.vieram > 0 || r.extras.length > 0 || r.reposicoes.length > 0) && (
                      <p className="g-cm-plano-mes g-muted g-pp">
                        {nomeMes(agora)}: {r.vieram} {r.vieram === 1 ? "presença" : "presenças"}{r.esperados ? ` de ${r.esperados}` : ""}
                        {r.faltas.length ? ` · ${r.faltas.length === 1 ? "1 falta" : `${r.faltas.length} faltas`}` : ""}
                        {r.reposicoes.length ? ` · ${r.reposicoes.length === 1 ? "1 reposição" : `${r.reposicoes.length} reposições`}` : ""}
                        {r.extras.length ? ` · ${r.extras.length === 1 ? "1 dia extra" : `${r.extras.length} dias extras`}` : ""}
                      </p>
                    )}
                    {r && r.vaiFaltar.length > 0 && <p className="g-cm-plano-mes g-pp"><span className="g-tag amarelo">vai faltar {r.vaiFaltar.map(dataCurta).join(", ")} · avisou</span></p>}
                    {(saidas ?? []).filter((x) => x.plano.id === p.id).map((x) => (
                      <div key={x.cobranca.id} className="g-aviso g-cm-saida-aviso" role="status" style={{ marginBottom: 0 }}>
                        <AlertTriangle />
                        <span className="g-cresce">{x.frase}</span>
                        <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setAcertando(p); }}>Acertar</button>
                      </div>
                    ))}
                    {aberta && (
                      <div className="g-cm-plano-corpo">
                        {carregando && !mov ? <Esqueleto linhas={1} /> : mov && <ResumoDosMeses plano={p} presencas={mov.presencas} faltas={mov.faltas} />}
                        {p.obs && <p className="g-muted g-p">{p.obs}</p>}
                        <div className="g-fila">
                          {planoAtivo(p, hoje) && <button className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setFaltando(p); }}><CalendarX2 />Vai faltar</button>}
                          {pode && <button className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setEditando(p); }}><Pencil />Alterar plano</button>}
                        </div>
                        {!pode && <p className="g-muted g-pp">Para mudar os dias, pausar ou encerrar o plano, fale com o dono ou com quem cuida do financeiro.</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {faltando && <FaltaAvisada key={faltando.id} plano={faltando} aoFechar={() => { setFaltando(null); aoMudar(); }} />}
      {acertando && <AcertoDaSaida plano={acertando} aoFechar={() => { setAcertando(null); void recarregarSaidas(); aoMudar(); }} />}
      {modelos && <ModelosDePlano aoFechar={() => setModelos(false)} aoMudar={aoMudar} />}
      {novo && <FormPlano planos={planos} aoFechar={aoFecharNovo} aoSalvo={(salvo) => { lembrar(salvo); aoFecharNovo(); aoMudar(); }} />}
      {editando && <FormPlano key={editando.id} plano={editando} planos={planos} aoFechar={() => setEditando(null)} aoSalvo={(salvo) => { lembrar(salvo); setEditando(null); aoMudar(); }} />}
    </>
  );
}
