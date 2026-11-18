"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, BellRing, ChevronRight, Maximize2, MessageCircle, MonitorPlay, MoveRight, Receipt, Truck, X } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO } from "@/lib/gestao/tipos";
import { nomeDosServicos, servicosAMais, servicosPorExtenso } from "@/lib/gestao/servicos-do-horario";
import { textoPronto } from "@/lib/gestao/agenda";
import { comPrecosDeAgendamento } from "@/lib/gestao/reservado";
import { dataLonga, hora, inicioDoDia, linkWhatsApp, somaDias } from "@/lib/gestao/util";
import {
  COLUNAS, NOME_DESTINO, alertasDoPet, colunaDe, proximaEtapa, rotuloDoProximo, temTosa, tempoDesde,
  type Coluna, type Destino, type Etapa, type LinhaQuadro,
} from "@/lib/gestao/quadro";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPet, DICA_SO_CONSULTA, Esqueleto, Folha, Vazio, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import "../agenda.css";
import "./quadro.css";

const DetalheAgendamento = dynamic(() => import("@/components/gestao/agenda/detalhe-agendamento"), { ssr: false });
const FormAgendamento = dynamic(() => import("@/components/gestao/agenda/form-agendamento"), { ssr: false });

type Entrada = { agendamento_id: string; temperamento: string[] | null; cuidados: string | null };
type Dados = { ags: AgendamentoCompleto[]; quadro: Map<string, LinhaQuadro>; entradas: Map<string, Entrada> };
/** Coluna do quadro → para onde o pet vai quando é solto nela (arrastar no computador). */
const DESTINO_DA_COLUNA: Record<Coluna, Destino> = { esperando: "esperando", banho: "banho", secando: "secagem", pronto: "pronto", entregue: "entregue" };
const DESTINOS: Destino[] = ["esperando", "banho", "secagem", "tosa", "pronto", "entregue"];

/**
 * Quadro de atendimento do dia (banho e tosa): Esperando, No banho, Secando / tosa, Pronto para buscar e Entregue.
 * Um toque leva para a próxima etapa; "Mudar etapa" escolhe qualquer uma; no computador dá para arrastar.
 * Com ?tv=1, o Modo TV: tela cheia, só para olhar, letras grandes, atualiza sozinho a cada 30 segundos.
 */
function Quadro() {
  const { sb, petshop, liberado, vejoFinanceiro } = useGestao();
  const params = useSearchParams();
  const tv = params.get("tv") === "1";
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [agora, setAgora] = useState(() => Date.now());
  const [atualizado, setAtualizado] = useState<number | null>(null);
  const [aba, setAba] = useState<Coluna | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState<AgendamentoCompleto | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<AgendamentoCompleto | null>(null);
  const [pronto, setPronto] = useState<AgendamentoCompleto | null>(null);
  const [entregar, setEntregar] = useState<AgendamentoCompleto | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<Coluna | null>(null);

  const hoje = inicioDoDia(new Date(agora));
  const { dados, carregando, erro, recarregar } = useDados<Dados>(async () => {
    // o preço vem à parte, só para quem recebe (o horário aberto daqui fecha a conta com ele)
    const ags = await comPrecosDeAgendamento(sb, petshop.id, ok(await sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id)
      .gte("inicio", hoje.toISOString()).lt("inicio", somaDias(hoje, 1).toISOString()).order("inicio")) as unknown as AgendamentoCompleto[], vejoFinanceiro) as unknown as AgendamentoCompleto[];
    const ids = ags.map((a) => a.id);
    const [q, e] = ids.length ? await Promise.all([
      sb.from("quadro_atendimento").select("agendamento_id, etapa, etapa_em, chegou_em, entregue_em").eq("petshop_id", petshop.id).in("agendamento_id", ids),
      sb.from("entradas").select("agendamento_id, temperamento, cuidados").eq("petshop_id", petshop.id).in("agendamento_id", ids),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (q.error) throw new Error(q.error.message);
    setAtualizado(Date.now());
    return {
      ags,
      quadro: new Map(((q.data ?? []) as (LinhaQuadro & { agendamento_id: string })[]).map((x) => [x.agendamento_id, { ...x, etapa: x.etapa as Etapa | null }])),
      // a entrada é um apoio (alertas): se não der para ler, o quadro abre do mesmo jeito
      entradas: new Map(((e.error ? [] : e.data ?? []) as Entrada[]).map((x) => [x.agendamento_id, x])),
    };
  }, [petshop.id, hoje.getTime(), vejoFinanceiro]);

  // relógio do "há 20 min" e a atualização sozinha (Modo TV a cada 30 s; no aparelho da equipe, a cada minuto)
  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;
  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 20000);
    const busca = setInterval(() => { if (document.visibilityState === "visible") void recarregarRef.current(); }, tv ? 30000 : 60000);
    const voltou = () => { if (document.visibilityState === "visible") { setAgora(Date.now()); void recarregarRef.current(); } };
    document.addEventListener("visibilitychange", voltou);
    return () => { clearInterval(relogio); clearInterval(busca); document.removeEventListener("visibilitychange", voltou); };
  }, [tv]);

  const porColuna = useMemo(() => {
    const m = new Map<Coluna, AgendamentoCompleto[]>(COLUNAS.map((c) => [c.id, []]));
    for (const a of dados?.ags ?? []) {
      const c = colunaDe(a, dados?.quadro.get(a.id));
      if (c) m.get(c)!.push(a);
    }
    // quem está há mais tempo em cada etapa vem primeiro; entregues, o mais recente primeiro
    const quando = (a: AgendamentoCompleto) => { const q = dados?.quadro.get(a.id); return new Date(q?.etapa_em ?? q?.chegou_em ?? a.inicio).getTime(); };
    for (const [c, l] of m) l.sort((x, y) => c === "entregue" ? new Date(dados?.quadro.get(y.id)?.entregue_em ?? y.fim).getTime() - new Date(dados?.quadro.get(x.id)?.entregue_em ?? x.fim).getTime()
      : c === "esperando" ? new Date(x.inicio).getTime() - new Date(y.inicio).getTime() : quando(x) - quando(y));
    return m;
  }, [dados]);
  const total = (dados?.ags ?? []).filter((a) => colunaDe(a, null) != null).length;
  // no celular, uma coluna por vez: começa na primeira em andamento que tem alguém
  const abaAtual: Coluna = aba ?? (["banho", "secando", "pronto", "esperando", "entregue"] as Coluna[]).find((c) => (porColuna.get(c)?.length ?? 0) > 0) ?? "esperando";

  async function mover(a: AgendamentoCompleto, para: Destino) {
    if (tv || somenteLeitura() || mexendo) return;
    if (para === "entregue" && a.status === "em_atendimento" && entregar?.id !== a.id) { setEntregar(a); return; }
    setMexendo(a.id);
    try {
      const r = await sb.rpc("quadro_mover", { p_petshop: petshop.id, p_agendamento: a.id, p_para: para });
      if (r.error) throw new Error(r.error.message);
      avisar(`${a.pets?.nome ?? "Pet"}: ${NOME_DESTINO[para].toLowerCase()}.`);
      avisarMudanca();
      await recarregar();
      if (para === "pronto" && !a.pronto_avisado_em) setPronto(a);
    } catch (e) { avisarErro(e); void recarregar(); } finally { setMexendo(null); setEntregar(null); }
  }

  const selecionado = aberto ? (dados?.ags ?? []).find((a) => a.id === aberto) ?? null : null;
  const relogio = new Date(agora);

  const corpo = carregando && !dados ? <Esqueleto linhas={4} /> : !total ? (
    <div className="g-card">
      <Vazio titulo="Nenhum banho marcado para hoje" texto="Quando houver horários hoje, eles aparecem aqui, na coluna Esperando." />
    </div>
  ) : (
    <>
      {!tv && (
        <div className="g-qd-abas g-so-cel" role="tablist" aria-label="Etapas">
          {COLUNAS.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={abaAtual === c.id} className={`g-qd-aba ${c.id}`} onClick={() => setAba(c.id)}>
              <span>{c.curto}</span><b>{porColuna.get(c.id)?.length ?? 0}</b>
            </button>
          ))}
        </div>
      )}
      <div className={`g-qd-colunas${tv ? " tv" : ""}`}>
        {COLUNAS.map((c) => {
          const lista = porColuna.get(c.id) ?? [];
          const mostrar = tv && c.id === "entregue" ? lista.slice(0, 6) : lista;
          return (
            <section key={c.id} className={`g-qd-col ${c.id}${abaAtual === c.id ? " atual" : ""}${sobre === c.id ? " sobre" : ""}`} aria-label={c.rotulo}
              onDragOver={(e) => { if (arrastando && !tv) { e.preventDefault(); setSobre(c.id); } }}
              onDragLeave={() => setSobre((s) => (s === c.id ? null : s))}
              onDrop={(e) => {
                e.preventDefault(); setSobre(null);
                const a = (dados?.ags ?? []).find((x) => x.id === arrastando);
                setArrastando(null);
                if (a && colunaDe(a, dados?.quadro.get(a.id)) !== c.id) void mover(a, DESTINO_DA_COLUNA[c.id]);
              }}>
              <h2 className="g-qd-col-t"><span>{c.rotulo}</span><b>{lista.length}</b></h2>
              <div className="g-qd-lista">
                {!lista.length && <p className="g-qd-nada">{c.id === "esperando" ? "Ninguém esperando." : c.id === "entregue" ? "Ninguém entregue ainda." : "Nenhum pet aqui."}</p>}
                {mostrar.map((a) => (
                  <Cartao key={a.id} a={a} q={dados?.quadro.get(a.id) ?? null} entrada={dados?.entradas.get(a.id) ?? null} agora={agora} tv={tv}
                    ocupado={mexendo === a.id} liberado={liberado} vejoFinanceiro={vejoFinanceiro}
                    aoProximo={(d) => void mover(a, d)} aoEscolher={() => { if (!somenteLeitura()) setEscolhendo(a); }} aoAbrir={() => setAberto(a.id)}
                    aoArrastar={(sim) => setArrastando(sim ? a.id : null)} />
                ))}
                {tv && lista.length > mostrar.length && <p className="g-qd-nada">E mais {lista.length - mostrar.length}.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );

  if (tv) {
    return (
      <div className="g-qd-tv" role="region" aria-label="Quadro do dia, modo TV">
        <header className="g-qd-tv-topo">
          <div>
            <h1>{petshop.nome}</h1>
            <p>{dataLonga(relogio)} · <b className="g-tab">{hora(relogio)}</b></p>
          </div>
          <div className="g-qd-tv-acoes">
            <span className="g-qd-tv-quando">{atualizado ? `Atualizado às ${hora(new Date(atualizado))}` : "Carregando…"}</span>
            <button type="button" className="g-btn sec p" onClick={() => { void document.documentElement.requestFullscreen?.().catch(() => undefined); }}><Maximize2 />Tela cheia</button>
            <Link className="g-btn sec p" href="/gestao/app/agenda/quadro" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); }}><X />Sair do modo TV</Link>
          </div>
        </header>
        {erro && <p className="g-erro">{erro}</p>}
        {corpo}
      </div>
    );
  }

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Quadro do dia</h1>
          <p className="g-muted">Hoje, {dataLonga(relogio)}</p>
        </div>
        <div className="g-acoes">
          <Link className="g-btn sec" href="/gestao/app/agenda"><ArrowLeft />Agenda</Link>
          <Link className="g-btn sec" href="/gestao/app/agenda/quadro?tv=1" title="Para deixar aberto numa TV ou num computador da loja: só mostra, atualiza sozinho"><MonitorPlay />Modo TV</Link>
        </div>
      </header>
      <div className="g-pilha">
        <p className="g-muted g-pp g-qd-dica">Toque no botão de baixo do cartão para passar o pet para a próxima etapa. Toque no pet para abrir o horário (conta, boletim, fotos).{" "}
          <span className="g-so-pc">No computador, dá para arrastar o cartão para outra coluna.</span></p>
        {erro && <p className="g-erro">{erro}</p>}
        {corpo}
      </div>

      {escolhendo && (
        <Folha titulo={`Mudar etapa: ${escolhendo.pets?.nome ?? "pet"}`} aoFechar={() => setEscolhendo(null)}>
          <div className="g-pilha p" role="group" aria-label="Escolha a etapa">
            {DESTINOS.map((d) => {
              const q = dados?.quadro.get(escolhendo.id) ?? null;
              const col = colunaDe(escolhendo, q);
              const aqui = d === "esperando" ? col === "esperando" : d === "entregue" ? col === "entregue" : col !== "entregue" && col !== "esperando" && (q?.etapa ?? (col === "banho" ? "banho" : null)) === d;
              const nao = d === "esperando" && escolhendo.status === "concluido";
              return (
                <button key={d} type="button" className={`g-btn ${aqui ? "pri" : "sec"} cheio`} disabled={aqui || nao || Boolean(mexendo)}
                  onClick={() => { const a = escolhendo; setEscolhendo(null); void mover(a, d); }}>
                  {NOME_DESTINO[d]}{aqui ? " (agora)" : ""}
                </button>
              );
            })}
            {escolhendo.status === "concluido" && <p className="g-pp g-muted">A conta deste atendimento já foi fechada: ele não volta para Esperando.</p>}
          </div>
        </Folha>
      )}

      {entregar && (
        <Folha titulo={`Entregar ${entregar.pets?.nome ?? "o pet"}?`} aoFechar={() => setEntregar(null)}
          rodape={<button type="button" className="g-btn sec" onClick={() => setEntregar(null)}>Voltar</button>}>
          <div className="g-pilha">
            <p className="g-aviso" style={{ margin: 0 }}><span><b>A conta ainda não foi fechada.</b> {vejoFinanceiro ? "Se o tutor vai pagar agora, feche a conta primeiro." : "Quem cuida do caixa fecha a conta depois: o horário mostra Falta cobrar."}</span></p>
            {vejoFinanceiro && <button type="button" className="g-btn pri cheio" onClick={() => { const a = entregar; setEntregar(null); setAberto(a.id); }}><Receipt />Abrir o horário para fechar a conta</button>}
            <button type="button" className={`g-btn ${vejoFinanceiro ? "sec" : "pri"} cheio`} disabled={Boolean(mexendo)} onClick={() => void mover(entregar, "entregue")}>Entregar mesmo assim</button>
          </div>
        </Folha>
      )}

      {pronto && <AvisarPronto a={pronto} aoFechar={() => setPronto(null)} aoAvisar={() => void recarregar()} />}

      {selecionado && !editando && <DetalheAgendamento agendamento={selecionado} aoFechar={() => setAberto(null)} aoMudar={() => void recarregar()} aoEditar={() => setEditando(selecionado)} />}
      {editando && <FormAgendamento agendamento={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); setAberto(null); void recarregar(); }} />}
    </>
  );
}

/** Um pet no quadro: foto, nome, serviços, quem faz, há quanto tempo, alertas e os botões. */
function Cartao({ a, q, entrada, agora, tv, ocupado, liberado, vejoFinanceiro, aoProximo, aoEscolher, aoAbrir, aoArrastar }: {
  a: AgendamentoCompleto; q: LinhaQuadro | null; entrada: Entrada | null; agora: number; tv: boolean; ocupado: boolean; liberado: boolean; vejoFinanceiro: boolean;
  aoProximo: (d: Destino) => void; aoEscolher: () => void; aoAbrir: () => void; aoArrastar: (sim: boolean) => void;
}) {
  const col = colunaDe(a, q);
  const servicos = nomeDosServicos(a) ?? "Atendimento";
  const proximo = proximaEtapa(a, q, temTosa([a.servicos?.nome, ...servicosAMais(a).map((s) => s.servicos?.nome)]));
  const alertas = alertasDoPet(a.pets?.alertas, entrada);
  const quem = a.profissionais?.nome.split(" ")[0];
  const tempo = col === "esperando"
    ? `Marcado às ${hora(a.inicio)}`
    : col === "entregue" ? (q?.entregue_em ? `Entregue às ${hora(q.entregue_em)}` : "Conta fechada")
    : [q?.chegou_em ? `Chegou ${tempoDesde(q.chegou_em, agora)}` : `Desde as ${hora(a.inicio)}`, q?.etapa_em && q.etapa && col !== "banho" ? `${col === "pronto" ? "pronto" : "nesta etapa"} ${tempoDesde(q.etapa_em, agora)}` : null].filter(Boolean).join(" · ");
  return (
    <article className={`g-qd-card${ocupado ? " ocupado" : ""}`} style={{ "--cor": a.servicos?.cor ?? "#f97316" } as React.CSSProperties}
      draggable={!tv && liberado} onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.effectAllowed = "move"; aoArrastar(true); }} onDragEnd={() => aoArrastar(false)}>
      {tv ? (
        <div className="g-qd-quem">
          {a.pets && <AvatarPet pet={a.pets} tamanho="g" />}
          <div className="t"><b className="nome">{a.pets?.nome ?? "Pet"}</b><span>{servicos}</span></div>
        </div>
      ) : (
        <button type="button" className="g-qd-quem" onClick={aoAbrir} aria-label={`Abrir o horário de ${a.pets?.nome ?? "pet"}`}>
          {a.pets && <AvatarPet pet={a.pets} tamanho="g" />}
          <span className="t"><b className="nome">{a.pets?.nome ?? "Pet"}</b><span>{servicos}</span></span>
          <ChevronRight aria-hidden className="seta" />
        </button>
      )}
      <p className="g-qd-info">{[quem ? `com ${quem}` : null, tempo].filter(Boolean).join(" · ")}</p>
      {(alertas.length > 0 || a.leva_traz || a.pronto_avisado_em || (a.status === "concluido" && col === "pronto") || (col === "entregue" && a.status === "em_atendimento")) && (
        <div className="g-qd-tags">
          {alertas.map((x) => <span key={x} className="g-tag vermelho">{x}</span>)}
          {a.leva_traz && <span className="g-tag azul"><Truck size={13} aria-hidden />Leva e traz</span>}
          {a.pronto_avisado_em && <span className="g-tag verde"><BellRing size={13} aria-hidden />Avisado às {hora(a.pronto_avisado_em)}</span>}
          {a.status === "concluido" && col === "pronto" && <span className="g-tag verde">Conta fechada</span>}
          {col === "entregue" && a.status === "em_atendimento" && <span className="g-tag laranja">{vejoFinanceiro ? "Falta fechar a conta" : "Falta cobrar"}</span>}
        </div>
      )}
      {!tv && (
        <div className="g-qd-bts">
          {proximo && <button type="button" className="g-btn pri" disabled={ocupado || !liberado} title={liberado ? undefined : DICA_SO_CONSULTA} onClick={() => aoProximo(proximo)}><MoveRight />{rotuloDoProximo(proximo)}</button>}
          <button type="button" className="g-btn fantasma p" disabled={ocupado || !liberado} onClick={aoEscolher}>Mudar etapa</button>
        </div>
      )}
    </article>
  );
}

/** Depois de "Está pronto": a mensagem de sempre ("Já pode vir buscar") pronta no WhatsApp; quem manda é a pessoa. */
function AvisarPronto({ a, aoFechar, aoAvisar }: { a: AgendamentoCompleto; aoFechar: () => void; aoAvisar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const tutor = a.pets?.clientes;
  const zap = linkWhatsApp(tutor?.telefone, textoPronto({ tutor: tutor?.nome, pet: a.pets?.nome ?? "seu pet", sexo: a.pets?.sexo, petshop: petshop.nome, servico: servicosPorExtenso(a) }));
  const marcar = () => {
    void sb.from("agendamentos").update({ pronto_avisado_em: new Date().toISOString() }).eq("id", a.id).select("id").single()
      .then(({ error }) => { if (error) avisarErro(error); else { avisarMudanca(); aoAvisar(); } });
    aoFechar();
  };
  return (
    <Folha titulo={`${a.pets?.nome ?? "O pet"} está pronto`} aoFechar={aoFechar}
      rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Agora não</button>}>
      <div className="g-pilha">
        {zap ? (
          <>
            <p className="g-p">Avisar {tutor?.nome?.split(" ")[0] ?? "o tutor"} que já pode vir buscar? O WhatsApp abre com a mensagem pronta e você só aperta enviar.</p>
            <a className="g-btn zap cheio" href={zap} target="_blank" rel="noopener noreferrer" onClick={marcar}><MessageCircle />Avisar que está pronto</a>
          </>
        ) : <p className="g-p">Sem telefone do tutor na ficha para avisar pelo WhatsApp.</p>}
        {a.leva_traz && <p className="g-pp g-muted"><Truck size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> Este pet volta pelo leva e traz: a viagem de volta aparece em <Link className="g-link" href="/gestao/app/agenda/leva-traz">Leva e traz</Link>.</p>}
      </div>
    </Folha>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={4} />}><Quadro /></Suspense>;
}
