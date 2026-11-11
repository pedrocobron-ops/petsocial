"use client";

import { Marca, Selo } from "@/components/gestao/marca";
import { Anel, Barras, Kpi, Ranking, Tendencia, Tile, type Tom } from "@/components/gestao/painel";
import { useState } from "react";
import Link from "next/link";
import { BedDouble, CalendarDays, Check, ChevronRight, Mic, Package, PawPrint, Plus, Receipt, Scissors, Sparkles, Ticket, Wallet } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { brl, dataLonga, hora, inicioDaSemana, inicioDoDia, isoDia, nomeDiaCurto, saudacao, somaDias } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPet, Esqueleto, Vazio, abrirAssistente, useDados } from "@/components/gestao/ui";
import DicasMozart from "@/components/gestao/dicas-mozart";
import DetalheAgendamento from "@/components/gestao/agenda/detalhe-agendamento";
import FormAgendamento from "@/components/gestao/agenda/form-agendamento";

const PEDIDOS = ["Que horários tenho livres amanhã?", "Quanto entrou essa semana?", "Quem não vem há mais de um mês?"];

/** Tela inicial: o dia de relance, o que precisa de atenção e o atalho para pedir ao Mozart. */
export default function Hoje() {
  const { sb, petshop, eu, servicos, vejoFinanceiro, souDono } = useGestao();
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<AgendamentoCompleto | null>(null);
  const hoje = inicioDoDia(new Date());
  const hojeIso = isoDia(hoje);

  const { dados, carregando, recarregar } = useDados(async () => {
    const amanha = somaDias(hoje, 1), depois = somaDias(hoje, 2);
    const seg = inicioDaSemana(hoje), ha30 = somaDias(hoje, -30), ha6 = somaDias(hoje, -6);
    const [ags, agsAmanha, emCasa, produtos, pets, totalAgs, entradas, contas, pacotes, daSemana, doMes, ultimos7] = await Promise.all([
      sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id).gte("inicio", hoje.toISOString()).lt("inicio", amanha.toISOString()).order("inicio"),
      sb.from("agendamentos").select("id, lembrete_em, status").eq("petshop_id", petshop.id).gte("inicio", amanha.toISOString()).lt("inicio", depois.toISOString()),
      sb.from("estadias").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).eq("status", "em_casa"),
      sb.from("produtos").select("id, nome, estoque, estoque_minimo").eq("petshop_id", petshop.id).eq("ativo", true).gt("estoque_minimo", 0),
      sb.from("pets").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id),
      sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id),
      vejoFinanceiro ? sb.from("lancamentos").select("valor, tipo").eq("petshop_id", petshop.id).eq("pago", true).eq("data", hojeIso) : Promise.resolve({ data: [] }),
      vejoFinanceiro ? sb.from("lancamentos").select("id, valor, vencimento").eq("petshop_id", petshop.id).eq("pago", false).eq("tipo", "saida").lte("vencimento", hojeIso) : Promise.resolve({ data: [] }),
      sb.from("pacotes_clientes").select("id").eq("petshop_id", petshop.id).eq("ativo", true).gte("vence_em", hojeIso).lte("vence_em", isoDia(somaDias(hoje, 7))),
      sb.from("agendamentos").select("inicio, status").eq("petshop_id", petshop.id).gte("inicio", seg.toISOString()).lt("inicio", somaDias(seg, 7).toISOString()),
      sb.from("agendamentos").select("status, servicos(nome, cor)").eq("petshop_id", petshop.id).gte("inicio", ha30.toISOString()).lt("inicio", amanha.toISOString()).limit(2000),
      vejoFinanceiro ? sb.from("lancamentos").select("valor, data").eq("petshop_id", petshop.id).eq("pago", true).eq("tipo", "entrada").gte("data", isoDia(ha6)).lte("data", hojeIso) : Promise.resolve({ data: [] }),
    ]);
    const valeAg = (st: string) => !["cancelado", "faltou"].includes(st);
    const porServico = new Map<string, { rotulo: string; valor: number; cor: string | null }>();
    for (const a of (doMes.data ?? []) as unknown as { status: string; servicos: { nome: string; cor: string | null } | null }[]) {
      if (!valeAg(a.status) || !a.servicos) continue;
      const x = porServico.get(a.servicos.nome) ?? { rotulo: a.servicos.nome, valor: 0, cor: a.servicos.cor };
      x.valor++; porServico.set(a.servicos.nome, x);
    }
    const lista = (ags.data ?? []) as unknown as AgendamentoCompleto[];
    const amanhaAtivos = (agsAmanha.data ?? []).filter((a) => !["cancelado", "faltou"].includes(a.status));
    return {
      ags: lista,
      amanha: amanhaAtivos.length,
      amanhaSemLembrete: amanhaAtivos.filter((a) => !a.lembrete_em).length,
      emCasa: emCasa.count ?? 0,
      acabando: (produtos.data ?? []).filter((p) => Number(p.estoque) <= Number(p.estoque_minimo)),
      pets: pets.count ?? 0,
      totalAgs: totalAgs.count ?? 0,
      entrou: (entradas.data ?? []).filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0),
      saiu: (entradas.data ?? []).filter((l) => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0),
      contas: contas.data ?? [],
      pacotesVencendo: (pacotes.data ?? []).length,
      semana: Array.from({ length: 7 }, (_, i) => {
        const d = somaDias(seg, i), iso = isoDia(d);
        return { rotulo: nomeDiaCurto(d), valor: (daSemana.data ?? []).filter((a) => valeAg(a.status) && isoDia(new Date(a.inicio)) === iso).length };
      }),
      servicosMes: [...porServico.values()].sort((a, b) => b.valor - a.valor).slice(0, 5),
      entradas7: Array.from({ length: 7 }, (_, i) => {
        const iso = isoDia(somaDias(ha6, i));
        return ((ultimos7.data ?? []) as { valor: number; data: string }[]).filter((l) => l.data === iso).reduce((t, l) => t + Number(l.valor), 0);
      }),
    };
  }, [petshop.id, hojeIso, vejoFinanceiro]);

  const ativos = (dados?.ags ?? []).filter((a) => !["cancelado", "faltou"].includes(a.status));
  const feitos = ativos.filter((a) => a.status === "concluido").length;
  const proximo = ativos.find((a) => a.status !== "concluido" && new Date(a.fim) > new Date());
  const selecionado = aberto ? dados?.ags.find((a) => a.id === aberto) ?? null : null;

  const semPreco = servicos.filter((s) => s.ativo).every((s) => s.preco_p == null && s.preco_m == null && s.preco_g == null && s.preco_gg == null);
  const passos = dados ? [
    { feito: !semPreco, texto: "Colocar os preços dos serviços", href: "/gestao/app/meu-petshop", so: souDono },
    { feito: dados.pets > 0, texto: "Cadastrar o primeiro pet", href: "/gestao/app/clientes", so: true },
    { feito: dados.totalAgs > 0, texto: "Marcar o primeiro horário", href: "/gestao/app/agenda", so: true },
  ].filter((p) => p.so) : [];
  const comecando = passos.some((p) => !p.feito);

  const frase = !dados ? "" : !ativos.length ? "Nenhum horário marcado para hoje."
    : `Hoje ${ativos.length === 1 ? "é 1 atendimento" : `são ${ativos.length} atendimentos`}${proximo ? `. O próximo é ${proximo.pets?.nome ?? "um pet"}, às ${hora(proximo.inicio)}` : feitos === ativos.length ? ", todos concluídos" : ""}.`;

  const atencao = dados ? [
    dados.amanhaSemLembrete > 0 && { icone: CalendarDays, tom: "pessego" as Tom, texto: `Amanhã ${dados.amanha === 1 ? "tem 1 horário" : `tem ${dados.amanha} horários`}. ${dados.amanhaSemLembrete === 1 ? "Falta 1 lembrete" : `Faltam ${dados.amanhaSemLembrete} lembretes`}.`, href: `/gestao/app/agenda?dia=${isoDia(somaDias(hoje, 1))}` },
    dados.acabando.length > 0 && { icone: Package, tom: "rosa" as Tom, texto: `${dados.acabando.length === 1 ? "1 produto está acabando" : `${dados.acabando.length} produtos estão acabando`}: ${dados.acabando.slice(0, 3).map((p) => p.nome).join(", ")}.`, href: "/gestao/app/estoque" },
    dados.contas.length > 0 && { icone: Receipt, tom: "manteiga" as Tom, texto: `${dados.contas.length === 1 ? "1 conta vence" : `${dados.contas.length} contas vencem`} até hoje: ${brl(dados.contas.reduce((s, c) => s + Number(c.valor), 0))}.`, href: "/gestao/app/financeiro" },
    dados.pacotesVencendo > 0 && { icone: Ticket, tom: "lilas" as Tom, texto: `${dados.pacotesVencendo === 1 ? "1 pacote vence" : `${dados.pacotesVencendo} pacotes vencem`} nos próximos 7 dias.`, href: "/gestao/app/pacotes" },
  ].filter(Boolean) as { icone: React.ComponentType<{ size?: number }>; tom: Tom; texto: string; href: string }[] : [];

  const agora = new Date();
  const emAndamento = ativos.find((a) => a.status !== "concluido" && new Date(a.inicio) <= agora && new Date(a.fim) > agora);
  const destaque = emAndamento ?? proximo;
  const faltam = destaque ? Math.round((new Date(destaque.inicio).getTime() - agora.getTime()) / 60000) : 0;
  const quando = !destaque ? "" : faltam <= 0 ? "acontecendo agora" : faltam < 60 ? `em ${faltam} min` : `em ${Math.floor(faltam / 60)} h${faltam % 60 ? ` ${faltam % 60} min` : ""}`;
  const semana = dados?.semana ?? [];
  const totalSemana = semana.reduce((s, d) => s + d.valor, 0);

  return (
    <>
      <header className="g-topo">
        <div>
          <p className="g-rotulo" style={{ marginBottom: 6 }}>{dataLonga(hoje)}</p>
          <h1>{saudacao()}, <em className="it">{eu.nome.split(" ")[0]}</em></h1>
        </div>
        <div className="g-acoes">
          <Link className="g-btn pri" href="/gestao/app/agenda?novo=1"><Plus />Marcar horário</Link>
        </div>
      </header>

      <div className="g-pilha g">
        <div className="g-heroi">
          <section className="g-mozart">
            <Marca tamanho={300} className="fundo" />
            <div className="g-fila" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
              <Selo tamanho={52} />
              <div className="g-cresce">
                <p className="g-rotulo"><span className="g-ondas" aria-hidden><i /><i /><i /><i /></span>Mozart, seu assistente</p>
                <p className="fala">{carregando && !dados ? "Olhando a agenda…" : frase}</p>
              </div>
            </div>
            <div className="g-pilha p">
              <div className="g-fila"><button className="g-btn pri" onClick={() => abrirAssistente()}><Mic />Falar com o Mozart</button></div>
              <div className="g-sugestoes">
                {PEDIDOS.filter((p) => vejoFinanceiro || !p.startsWith("Quanto")).map((p) => <button key={p} onClick={() => abrirAssistente(p)}>{p}</button>)}
              </div>
            </div>
          </section>

          {destaque?.pets ? (
            <button className="g-proximo" style={{ textAlign: "left", color: "inherit", "--cor": destaque.servicos?.cor ?? "#f97316" } as React.CSSProperties} onClick={() => setAberto(destaque.id)}>
              <div className="g-fila entre" style={{ flexWrap: "nowrap" }}>
                <span className="g-rotulo" style={{ color: "#8a4a17" }}>{emAndamento ? "Na mesa agora" : "Próximo atendimento"}</span>
                <span className="g-tag laranja">{quando}</span>
              </div>
              <div className="quem">
                <AvatarPet pet={destaque.pets} tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b>{destaque.pets.nome}</b>
                  <span>{[destaque.pets.raca, destaque.pets.clientes?.nome].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
              <div className="quando">
                <b>{hora(destaque.inicio)}</b>
                <span className="g-ag" style={{ width: "auto", padding: "6px 12px", boxShadow: "none", borderLeftWidth: 1, borderRadius: 999 }}><span className="serv"><i />{destaque.servicos?.nome ?? "Atendimento"}</span></span>
                {destaque.profissionais && <span className="g-p" style={{ color: "#6b4a2f" }}>com {destaque.profissionais.nome.split(" ")[0]}</span>}
              </div>
            </button>
          ) : (
            <div className="g-proximo vazio">
              <span className="g-rotulo" style={{ color: "#24543b" }}>{dados && ativos.length ? "Dia concluído" : "Agenda livre"}</span>
              <div className="quem">
                <Tile icone={dados && ativos.length ? Check : Sparkles} tom="menta" tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b style={{ whiteSpace: "normal", fontSize: "1.375rem" }}>{dados && ativos.length ? "Tudo atendido por hoje" : "Nenhum horário por vir"}</b>
                </div>
              </div>
              <Link className="g-btn verde" href="/gestao/app/agenda?novo=1" style={{ justifySelf: "start" }}><Plus />Marcar horário</Link>
            </div>
          )}
        </div>

        {comecando && (
          <section>
            <div className="g-card-t"><h2>Primeiros passos</h2><span className="g-muted g-p">{passos.filter((p) => p.feito).length} de {passos.length}</span></div>
            <div className="g-passos">
              {passos.map((p, i) => (
                <Link key={p.texto} href={p.href} className={`g-passo${p.feito ? " feito" : ""}`}>
                  <span className="n">{p.feito ? <Check /> : i + 1}</span>
                  <span className="g-cresce">{p.texto}</span>
                  {!p.feito && <ChevronRight size={18} />}
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="g-grade kpis">
          <Kpi href="/gestao/app/agenda" icone={Scissors} tom="pessego" rotulo="Atendimentos hoje" valor={dados ? ativos.length : "–"}
            apoio={dados ? (ativos.length ? `${feitos} ${feitos === 1 ? "concluído" : "concluídos"}` : "agenda livre") : " "}
            lado={dados && ativos.length > 0 ? <Anel parte={feitos / ativos.length} cor="var(--g-laranja)">{Math.round((feitos / ativos.length) * 100)}%</Anel> : undefined} />
          <Kpi href="/gestao/app/creche-hotel" icone={BedDouble} tom="ceu" rotulo="Creche e hotel" valor={dados ? dados.emCasa : "–"} apoio={dados?.emCasa === 1 ? "pet na casa agora" : "pets na casa agora"} />
          {vejoFinanceiro ? (
            <Kpi href="/gestao/app/caixa" icone={Wallet} tom="menta" rotulo="Entrou hoje" valor={dados ? brl(dados.entrou) : "–"} apoio={dados && dados.saiu > 0 ? `saiu ${brl(dados.saiu)}` : "ver o caixa"}
              lado={dados ? <Tendencia valores={dados.entradas7} /> : undefined} />
          ) : (
            <Kpi href="/gestao/app/clientes" icone={PawPrint} tom="menta" rotulo="Pets cadastrados" valor={dados ? dados.pets : "–"} apoio="ver todos" />
          )}
          <Kpi href="/gestao/app/agenda" icone={CalendarDays} tom="lilas" rotulo="Nesta semana" valor={dados ? totalSemana : "–"} apoio={totalSemana === 1 ? "horário marcado" : "horários marcados"} />
        </div>

        <div className="g-duas">
          <section>
            <div className="g-card-t">
              <h2>Agenda de hoje</h2>
              <Link className="g-btn fantasma p" href="/gestao/app/agenda">Ver a semana<ChevronRight /></Link>
            </div>
            {carregando && !dados ? <Esqueleto /> : !dados?.ags.length ? (
              <div className="g-card"><Vazio mozart="acenando" titulo="Nenhum banho marcado para hoje" texto="Que tal chamar quem está com o banho atrasado? O Mozart monta a lista para você.">
                <button className="g-btn verde" onClick={() => abrirAssistente("Quem não vem há mais de um mês?")}>Ver quem está sumido</button>
              </Vazio></div>
            ) : (
              <div className="g-tempo">
                {dados.ags.map((a) => {
                  const fora = ["cancelado", "faltou"].includes(a.status);
                  return (
                    <div className={`g-hora-grupo${a.status === "concluido" ? " feito" : ""}${a.id === destaque?.id ? " agora" : ""}`} key={a.id} style={{ "--cor": a.servicos?.cor ?? "#f97316" } as React.CSSProperties}>
                      <time>{hora(a.inicio)}</time>
                      <span className="ponto" aria-hidden />
                      <button className={`g-ag${fora ? " apagado" : ""}`} onClick={() => setAberto(a.id)}>
                        {a.pets && <AvatarPet pet={a.pets} />}
                        <span className="t"><b>{a.pets?.nome}</b><span className="serv"><i />{[a.servicos?.nome, a.pets?.clientes?.nome].filter(Boolean).join(" · ")}</span></span>
                        {a.status !== "marcado" && <span className={`g-tag ${STATUS_AGENDAMENTO[a.status].tom}`}>{STATUS_AGENDAMENTO[a.status].rotulo}</span>}
                        <ChevronRight size={18} className="g-muted g-so-pc" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="g-pilha g">
            <DicasMozart />
            {atencao.length > 0 && (
              <section>
                <div className="g-card-t"><h2>Pede a sua atenção</h2><span className="g-tag amarelo">{atencao.length}</span></div>
                <div className="g-atencao">
                  {atencao.map((x) => (
                    <Link key={x.texto} href={x.href}>
                      <Tile icone={x.icone} tom={x.tom} />
                      <span>{x.texto}</span>
                      <ChevronRight size={18} />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="g-card">
              <div className="g-card-t"><h3>Movimento da semana</h3><span className="g-muted g-pp">horários por dia</span></div>
              {!dados ? <Esqueleto linhas={2} /> : totalSemana ? <Barras itens={semana} destaque={(hoje.getDay() + 6) % 7} /> : <p className="g-muted g-p">Nenhum horário marcado nesta semana ainda.</p>}
            </section>

            {dados && dados.servicosMes.length > 0 && (
              <section className="g-card">
                <div className="g-card-t"><h3>Serviços mais pedidos</h3><span className="g-muted g-pp">últimos 30 dias</span></div>
                <Ranking itens={dados.servicosMes} />
              </section>
            )}
          </div>
        </div>
      </div>

      {selecionado && !editando && <DetalheAgendamento agendamento={selecionado} aoFechar={() => setAberto(null)} aoMudar={() => void recarregar()} aoEditar={() => setEditando(selecionado)} />}
      {editando && <FormAgendamento agendamento={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); setAberto(null); void recarregar(); }} />}
    </>
  );
}
