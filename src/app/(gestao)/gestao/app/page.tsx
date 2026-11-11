"use client";

import { Selo } from "@/components/gestao/marca";
import { useState } from "react";
import Link from "next/link";
import { BedDouble, CalendarDays, Check, ChevronRight, Mic, Package, Plus, Receipt, Ticket } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { brl, dataLonga, hora, inicioDoDia, isoDia, saudacao, somaDias } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPet, Esqueleto, Vazio, abrirAssistente, useDados } from "@/components/gestao/ui";
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
    const [ags, agsAmanha, emCasa, produtos, pets, totalAgs, entradas, contas, pacotes] = await Promise.all([
      sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id).gte("inicio", hoje.toISOString()).lt("inicio", amanha.toISOString()).order("inicio"),
      sb.from("agendamentos").select("id, lembrete_em, status").eq("petshop_id", petshop.id).gte("inicio", amanha.toISOString()).lt("inicio", depois.toISOString()),
      sb.from("estadias").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).eq("status", "em_casa"),
      sb.from("produtos").select("id, nome, estoque, estoque_minimo").eq("petshop_id", petshop.id).eq("ativo", true).gt("estoque_minimo", 0),
      sb.from("pets").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id),
      sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id),
      vejoFinanceiro ? sb.from("lancamentos").select("valor, tipo").eq("petshop_id", petshop.id).eq("pago", true).eq("data", hojeIso) : Promise.resolve({ data: [] }),
      vejoFinanceiro ? sb.from("lancamentos").select("id, valor, vencimento").eq("petshop_id", petshop.id).eq("pago", false).eq("tipo", "saida").lte("vencimento", hojeIso) : Promise.resolve({ data: [] }),
      sb.from("pacotes_clientes").select("id").eq("petshop_id", petshop.id).eq("ativo", true).gte("vence_em", hojeIso).lte("vence_em", isoDia(somaDias(hoje, 7))),
    ]);
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
    dados.amanhaSemLembrete > 0 && { icone: CalendarDays, texto: `Amanhã ${dados.amanha === 1 ? "tem 1 horário" : `tem ${dados.amanha} horários`}. ${dados.amanhaSemLembrete === 1 ? "Falta 1 lembrete" : `Faltam ${dados.amanhaSemLembrete} lembretes`}.`, href: `/gestao/app/agenda?dia=${isoDia(somaDias(hoje, 1))}` },
    dados.acabando.length > 0 && { icone: Package, texto: `${dados.acabando.length === 1 ? "1 produto está acabando" : `${dados.acabando.length} produtos estão acabando`}: ${dados.acabando.slice(0, 3).map((p) => p.nome).join(", ")}.`, href: "/gestao/app/estoque" },
    dados.contas.length > 0 && { icone: Receipt, texto: `${dados.contas.length === 1 ? "1 conta vence" : `${dados.contas.length} contas vencem`} até hoje: ${brl(dados.contas.reduce((s, c) => s + Number(c.valor), 0))}.`, href: "/gestao/app/financeiro" },
    dados.pacotesVencendo > 0 && { icone: Ticket, texto: `${dados.pacotesVencendo === 1 ? "1 pacote vence" : `${dados.pacotesVencendo} pacotes vencem`} nos próximos 7 dias.`, href: "/gestao/app/pacotes" },
  ].filter(Boolean) as { icone: React.ComponentType<{ size?: number }>; texto: string; href: string }[] : [];

  return (
    <>
      <header className="g-topo">
        <div>
          <p className="g-rotulo" style={{ marginBottom: 6 }}>{dataLonga(hoje)}</p>
          <h1>{saudacao()}, <em className="it">{eu.nome.split(" ")[0]}</em></h1>
        </div>
        <div className="g-acoes">
          <Link className="g-btn sec" href="/gestao/app/agenda?novo=1"><Plus />Marcar horário</Link>
        </div>
      </header>

      <div className="g-pilha g">
        <section className="g-card verde">
          <div className="g-fila" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
            <Selo tamanho={52} />
            <div className="g-cresce">
              <p className="g-rotulo">Mozart, seu assistente</p>
              <p style={{ fontFamily: "var(--display)", fontSize: "1.3125rem", lineHeight: 1.25, marginTop: 4 }}>{carregando && !dados ? "Olhando a agenda…" : frase}</p>
            </div>
          </div>
          <div className="g-fila" style={{ marginTop: 16 }}>
            <button className="g-btn pri" onClick={() => abrirAssistente()}><Mic />Falar com o Mozart</button>
          </div>
          <div className="g-sugestoes" style={{ padding: "12px 0 0" }}>
            {PEDIDOS.filter((p) => vejoFinanceiro || !p.startsWith("Quanto")).map((p) => <button key={p} onClick={() => abrirAssistente(p)} style={{ background: "rgba(246,241,232,.1)", color: "#f6f1e8", borderColor: "rgba(246,241,232,.25)" }}>{p}</button>)}
          </div>
        </section>

        {comecando && (
          <section className="g-card menta">
            <h2 style={{ marginBottom: 4 }}>Primeiros passos</h2>
            <p className="g-muted g-p" style={{ marginBottom: 8 }}>Três coisas rápidas e o {petshop.nome} está pronto para rodar.</p>
            <div className="g-lista">
              {passos.map((p) => (
                <Link key={p.texto} href={p.href} className="g-linha">
                  <span className="g-avatar p" style={{ background: p.feito ? "#2f6b4c" : "transparent", boxShadow: p.feito ? "none" : "inset 0 0 0 2px rgba(31,27,23,.25)" }}>{p.feito && <Check />}</span>
                  <span className="t"><b style={{ textDecoration: p.feito ? "line-through" : "none", opacity: p.feito ? .6 : 1 }}>{p.texto}</b></span>
                  {!p.feito && <ChevronRight size={18} />}
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="g-grade c3">
          <Link href="/gestao/app/agenda" className="g-card">
            <p className="g-rotulo">Atendimentos hoje</p>
            <p className="g-num" style={{ marginTop: 8 }}>{dados ? ativos.length : "–"}</p>
            <p className="g-muted g-p" style={{ marginTop: 4 }}>{dados ? (ativos.length ? `${feitos} ${feitos === 1 ? "concluído" : "concluídos"}` : "agenda livre") : " "}</p>
          </Link>
          <Link href="/gestao/app/creche-hotel" className="g-card">
            <p className="g-rotulo">Creche e hotel</p>
            <p className="g-num" style={{ marginTop: 8 }}>{dados ? dados.emCasa : "–"}</p>
            <p className="g-muted g-p g-fila" style={{ marginTop: 4, gap: 6 }}><BedDouble size={16} />{dados?.emCasa === 1 ? "pet na casa agora" : "pets na casa agora"}</p>
          </Link>
          {vejoFinanceiro && (
            <Link href="/gestao/app/caixa" className="g-card">
              <p className="g-rotulo">Entrou hoje</p>
              <p className="g-num" style={{ marginTop: 8 }}>{dados ? brl(dados.entrou) : "–"}</p>
              <p className="g-muted g-p" style={{ marginTop: 4 }}>{dados && dados.saiu > 0 ? `saiu ${brl(dados.saiu)}` : "ver o caixa"}</p>
            </Link>
          )}
        </div>

        {atencao.length > 0 && (
          <section className="g-card">
            <h2 style={{ marginBottom: 6 }}>Pede a sua atenção</h2>
            <div className="g-lista">
              {atencao.map((x) => (
                <Link key={x.texto} href={x.href} className="g-linha">
                  <span className="g-ico" aria-hidden style={{ background: "var(--g-amarelo-tint)" }}><x.icone size={18} /></span>
                  <span className="t" style={{ whiteSpace: "normal" }}>{x.texto}</span>
                  <ChevronRight size={18} />
                </Link>
              ))}
            </div>
          </section>
        )}

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
            <div className="g-pilha p">
              {dados.ags.map((a) => (
                <div className="g-hora-grupo" key={a.id}>
                  <time>{hora(a.inicio)}</time>
                  <button className={`g-ag${["cancelado", "faltou"].includes(a.status) ? " apagado" : ""}`} style={{ "--cor": a.servicos?.cor ?? "#f97316" } as React.CSSProperties} onClick={() => setAberto(a.id)}>
                    {a.pets && <AvatarPet pet={a.pets} />}
                    <span className="t"><b>{a.pets?.nome}</b><span>{[a.servicos?.nome, a.pets?.clientes?.nome].filter(Boolean).join(" · ")}</span></span>
                    {a.status !== "marcado" && <span className={`g-tag ${STATUS_AGENDAMENTO[a.status].tom}`}>{STATUS_AGENDAMENTO[a.status].rotulo}</span>}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {selecionado && !editando && <DetalheAgendamento agendamento={selecionado} aoFechar={() => setAberto(null)} aoMudar={() => void recarregar()} aoEditar={() => setEditando(selecionado)} />}
      {editando && <FormAgendamento agendamento={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); setAberto(null); void recarregar(); }} />}
    </>
  );
}
