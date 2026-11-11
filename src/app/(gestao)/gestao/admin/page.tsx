"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, Download, LogOut, Mail, MessageCircle, RefreshCw, Search } from "lucide-react";
import AbaUso, { type Uso, tempo, vistoHa } from "@/components/gestao/admin/uso";
import AbaConversas from "@/components/gestao/admin/conversas";
import { AvisosProvider, Campo, Esqueleto, Folha, Vazio, mensagemDeErro, ok, useAvisos } from "@/components/gestao/ui";
import { banco, configurado } from "@/lib/gestao/supabase";
import { brl, dataCompleta, dataCurta, fmtTelefone, haQuanto, hora, inicioDoDia, isoDia, linkWhatsApp, nomeDiaCurto, semAcento, somaDias } from "@/lib/gestao/util";

type Status = "teste" | "ativa" | "atrasada" | "cancelada" | "cortesia";

type Loja = {
  id: string; nome: string; cidade: string | null; uf: string | null; telefone: string | null;
  status: Status; plano: string; teste_ate: string; criado_em: string; assinatura_desde: string | null;
  cakto_email: string | null; dono_email: string | null; dono_nome: string | null;
  equipe: number; clientes: number; pets: number; agendamentos: number; agendamentos_7d: number;
  pedidos_assistente: number; ultimo_agendamento: string | null; nota: string | null;
};
type EventoCakto = { id: number; evento: string | null; email: string | null; petshop_id: string | null; recebido_em: string };

const DIA = 864e5;
import { PLANOS as CATALOGO, planoPorId } from "@/lib/gestao/planos";
const PLANOS: Record<string, string> = Object.fromEntries(CATALOGO.map((p) => [p.id, `${p.nome} (${p.acessos})`]));
const nomePlano = (p: string) => PLANOS[p] ?? p;

/* ---------- leitura de cada pet shop ---------- */

const emTeste = (l: Loja, agora: number) => l.status === "teste" && new Date(l.teste_ate).getTime() > agora;
const testeVencido = (l: Loja, agora: number) => l.status === "teste" && new Date(l.teste_ate).getTime() <= agora;
const diasDeTeste = (l: Loja, agora: number) => Math.max(0, Math.ceil((new Date(l.teste_ate).getTime() - agora) / DIA));
const venceEm2Dias = (l: Loja, agora: number) => emTeste(l, agora) && new Date(l.teste_ate).getTime() - agora <= 2 * DIA;
const assinou = (l: Loja) => l.status === "ativa" || l.status === "atrasada" || Boolean(l.assinatura_desde);

function etiqueta(l: Loja, agora: number): { cor: string; texto: string } {
  if (l.status === "teste") {
    if (testeVencido(l, agora)) return { cor: "vermelho", texto: "teste vencido" };
    const d = diasDeTeste(l, agora);
    return { cor: "azul", texto: d <= 1 ? "teste · falta 1 dia" : `teste · faltam ${d} dias` };
  }
  if (l.status === "ativa") return { cor: "verde", texto: "ativa" };
  if (l.status === "atrasada") return { cor: "amarelo", texto: "atrasada" };
  if (l.status === "cancelada") return { cor: "vermelho", texto: "cancelada" };
  return { cor: "laranja", texto: "cortesia" };
}

function engajamento(l: Loja): { cor: string; texto: string } {
  if (l.agendamentos_7d > 0) return { cor: "verde", texto: "ativo" };
  if (l.agendamentos > 0) return { cor: "amarelo", texto: "parado" };
  return { cor: "", texto: "nunca usou" };
}

const local = (l: Loja) => [l.cidade, l.uf].filter(Boolean).join("/") || "cidade não informada";
const dataHora = (d: string) => `${dataCompleta(new Date(d))} às ${hora(d)}`;

type Filtro = "todos" | Status | "vencido" | "ligar";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "ligar", rotulo: "Teste vence em 2 dias" },
  { id: "teste", rotulo: "Em teste" },
  { id: "vencido", rotulo: "Teste vencido" },
  { id: "ativa", rotulo: "Ativas" },
  { id: "atrasada", rotulo: "Atrasadas" },
  { id: "cancelada", rotulo: "Canceladas" },
  { id: "cortesia", rotulo: "Cortesia" },
];
function passa(l: Loja, f: Filtro, agora: number) {
  if (f === "todos") return true;
  if (f === "ligar") return venceEm2Dias(l, agora);
  if (f === "teste") return emTeste(l, agora);
  if (f === "vencido") return testeVencido(l, agora);
  return l.status === f;
}

/* ---------- página ---------- */

export default function Pagina() {
  return <AvisosProvider><Admin /></AvisosProvider>;
}

function Admin() {
  const router = useRouter();
  const { avisarErro } = useAvisos();
  const [acesso, setAcesso] = useState<"vendo" | "sim" | "nao">("vendo");
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [aba, setAba] = useState<"geral" | "uso" | "conversas">("geral");
  const [uso, setUso] = useState<Uso[]>([]);
  const [vez, setVez] = useState(0);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      const [l, u] = await Promise.all([banco().rpc("admin_painel"), banco().rpc("admin_uso")]);
      setLojas((ok(l) as unknown as Loja[]) ?? []);
      setUso((u.data as unknown as Uso[]) ?? []);
      setVez((v) => v + 1);
      setErro(null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!configurado) { setErro("O sistema ainda não está ligado neste endereço."); setAcesso("nao"); return; }
      const { data } = await banco().auth.getSession();
      if (!vivo) return;
      if (!data.session) { router.replace("/gestao/entrar"); return; }
      const r = await banco().rpc("sou_admin");
      if (!vivo) return;
      if (r.error) { setErro(mensagemDeErro(r.error)); setAcesso("nao"); return; }
      if (!r.data) { setAcesso("nao"); return; }
      setAcesso("sim");
      void carregar();
    })();
    return () => { vivo = false; };
  }, [router, carregar]);

  async function sair() {
    try { await banco().auth.signOut(); } catch (e) { avisarErro(e); }
    router.replace("/gestao/entrar");
  }

  // "agora" acompanha cada carga, para os prazos de teste não ficarem velhos na tela
  const agora = useMemo(() => Date.now(), [lojas]); // eslint-disable-line react-hooks/exhaustive-deps

  const receita = useMemo(() => (lojas ?? []).filter((l) => l.status === "ativa").reduce((t, l) => t + planoPorId(l.plano).preco, 0), [lojas]);
  const n = useMemo(() => {
    const l = lojas ?? [];
    const ativas = l.filter((x) => x.status === "ativa").length;
    // teste encerrado: tudo que não está em teste correndo nem é cortesia
    const encerrados = l.filter((x) => !emTeste(x, agora) && x.status !== "cortesia");
    return {
      total: l.length,
      teste: l.filter((x) => emTeste(x, agora)).length,
      ativas,
      atrasadas: l.filter((x) => x.status === "atrasada").length,
      vencidos: l.filter((x) => testeVencido(x, agora)).length,
      canceladas: l.filter((x) => x.status === "cancelada").length,
      cortesias: l.filter((x) => x.status === "cortesia").length,
      novos7: l.filter((x) => agora - new Date(x.criado_em).getTime() <= 7 * DIA).length,
      encerrados: encerrados.length,
      viraram: encerrados.filter(assinou).length,
    };
  }, [lojas, agora]);

  const porDia = useMemo(() => {
    const hoje = inicioDoDia(new Date(agora));
    const conta = new Map<string, number>();
    for (const l of lojas ?? []) { const k = isoDia(new Date(l.criado_em)); conta.set(k, (conta.get(k) ?? 0) + 1); }
    return Array.from({ length: 14 }, (_, i) => {
      const d = somaDias(hoje, i - 13);
      return { dia: d, qtd: conta.get(isoDia(d)) ?? 0 };
    });
  }, [lojas, agora]);
  const maiorDia = Math.max(1, ...porDia.map((d) => d.qtd));
  const total14 = porDia.reduce((s, d) => s + d.qtd, 0);

  const visiveis = useMemo(() => {
    const alvo = semAcento(busca);
    return (lojas ?? []).filter((l) => passa(l, filtro, agora) && (!alvo ||
      [l.nome, l.dono_nome, l.dono_email, l.cakto_email, l.cidade, l.uf].some((c) => semAcento(c ?? "").includes(alvo))));
  }, [lojas, busca, filtro, agora]);

  const aberta = abertaId ? (lojas ?? []).find((l) => l.id === abertaId) ?? null : null;

  function exportar() {
    const cab = ["Pet shop", "Cidade", "UF", "Telefone", "Dono", "E-mail do dono", "E-mail na Cakto", "Status", "Plano", "Teste até", "Criado em",
      "Assinante desde", "Equipe", "Clientes", "Pets", "Agendamentos", "Agendamentos 7 dias", "Pedidos ao assistente", "Último agendamento", "Engajamento", "Anotação"];
    const dia = (d: string | null) => (d ? dataCompleta(new Date(d)) : "");
    const linhas = visiveis.map((l) => [l.nome, l.cidade ?? "", l.uf ?? "", fmtTelefone(l.telefone), l.dono_nome ?? "", l.dono_email ?? "", l.cakto_email ?? "",
      etiqueta(l, agora).texto, nomePlano(l.plano), dia(l.teste_ate), dia(l.criado_em), dia(l.assinatura_desde), l.equipe, l.clientes, l.pets, l.agendamentos,
      l.agendamentos_7d, l.pedidos_assistente, dia(l.ultimo_agendamento), engajamento(l).texto, l.nota ?? ""]);
    // aspas em tudo; texto que começa com = + - @ ganha apóstrofo para a planilha não ler como fórmula
    const cel = (v: string | number) => { const s = String(v); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
    const csv = "﻿" + [cab, ...linhas].map((l) => l.map(cel).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `petshops-${isoDia(new Date())}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (acesso === "vendo") return <main className="g-main"><Esqueleto linhas={5} /></main>;
  if (acesso === "nao") {
    return (
      <main className="g-main">
        <Vazio titulo="Esta página é da equipe Maestro Pet." texto={erro ?? "Para cuidar do seu pet shop, abra o aplicativo."}>
          <Link className="g-btn verde" href="/gestao/app">Ir para o meu pet shop</Link>
        </Vazio>
      </main>
    );
  }

  return (
    <main className="g-main" style={{ paddingBottom: 96 }}>
      <header className="g-topo">
        <div>
          <h1>Administrador · Maestro Pet Gestão</h1>
          <p className="g-muted">Todos os pet shops: assinatura, uso do sistema e conversas.</p>
        </div>
        <div className="g-acoes">
          <Link className="g-btn sec" href="/gestao/app"><ArrowLeft /> Meu pet shop</Link>
          <button className="g-btn sec" onClick={() => void carregar()} disabled={atualizando}><RefreshCw /> {atualizando ? "Atualizando…" : "Atualizar"}</button>
          <button className="g-btn fantasma" onClick={() => void sair()}><LogOut /> Sair</button>
        </div>
      </header>

      {erro && <p className="g-aviso vermelho" role="alert">{erro}</p>}
      <div className="g-seg" role="group" aria-label="Partes do painel" style={{ marginBottom: 18 }}>
        {([["geral", "Clientes"], ["uso", "Uso"], ["conversas", "Conversas"]] as const).map(([id, r]) => (
          <button key={id} aria-pressed={aba === id} onClick={() => setAba(id)}>{r}</button>
        ))}
      </div>
      {!lojas ? (!erro && <Esqueleto linhas={6} />) : aba === "uso" ? <AbaUso lojas={lojas} uso={uso} aoAbrir={setAbertaId} />
        : aba === "conversas" ? <AbaConversas key={vez} /> : (
        <div className="g-pilha g">
          <section className="g-grade c4" aria-label="Números">
            <Numero rotulo="Pet shops cadastrados" valor={n.total} />
            <Numero rotulo="Em teste" valor={n.teste} />
            <Numero rotulo="Assinantes ativos" valor={n.ativas} />
            <Numero rotulo="Atrasados" valor={n.atrasadas} />
            <Numero rotulo="Testes vencidos sem assinar" valor={n.vencidos} />
            <Numero rotulo="Cancelados" valor={n.canceladas} />
            <Numero rotulo="Cadastros em 7 dias" valor={n.novos7} />
            <div className="g-card verde">
              <p className="g-rotulo">Receita mensal (estimativa)</p>
              <p className="g-num m" style={{ marginTop: 10 }}>{brl(receita)}</p>
              <p className="g-pp g-muted" style={{ marginTop: 6 }}>{n.ativas} {n.ativas === 1 ? "assinante" : "assinantes"}, pelo preço de cada plano, sem descontar taxas</p>
            </div>
          </section>

          <section className="g-grade c2">
            <div className="g-card">
              <p className="g-rotulo">Do teste à assinatura</p>
              {n.encerrados === 0 ? <p className="g-muted" style={{ marginTop: 10 }}>Ainda sem dados. Nenhum teste terminou.</p> : (
                <>
                  <p style={{ marginTop: 10 }}><span className="g-num">{Math.round((n.viraram / n.encerrados) * 100)}%</span></p>
                  <p className="g-muted g-p" style={{ marginTop: 8 }}>
                    De {n.encerrados} {n.encerrados === 1 ? "teste encerrado" : "testes encerrados"}, {n.viraram} {n.viraram === 1 ? "virou assinante" : "viraram assinantes"}.
                  </p>
                  <div className="g-prog" style={{ marginTop: 12 }}><i style={{ width: `${(n.viraram / n.encerrados) * 100}%` }} /></div>
                </>
              )}
              {n.cortesias > 0 && <p className="g-pp g-muted" style={{ marginTop: 10 }}>{n.cortesias} em cortesia, fora desta conta.</p>}
            </div>
            <div className="g-card">
              <div className="g-card-t">
                <p className="g-rotulo">Cadastros por dia · 14 dias</p>
                <span className="g-pp g-muted">{total14} no período</span>
              </div>
              <div className="g-barras" role="img" aria-label={`Cadastros por dia nos últimos 14 dias: ${total14} no total.`}>
                {porDia.map(({ dia, qtd }) => (
                  <div key={isoDia(dia)} title={`${nomeDiaCurto(dia)}, ${dataCurta(dia)}: ${qtd}`}>
                    <span className="g-tab">{qtd || ""}</span>
                    <i className={qtd ? undefined : "fraco"} style={{ height: `${(qtd / maiorDia) * 100}%` }} />
                    <span>{dia.getDate()}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="g-pilha">
            <div className="g-fila entre">
              <h2>Pet shops</h2>
              <button className="g-btn sec p" onClick={exportar} disabled={!visiveis.length}><Download /> Exportar CSV</button>
            </div>
            <div className="g-busca">
              <Search />
              <input className="g-input" type="search" placeholder="Nome, e-mail ou cidade" aria-label="Buscar pet shop" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <div className="g-chips">
              {FILTROS.map((f) => {
                const qtd = lojas.filter((l) => passa(l, f.id, agora)).length;
                return <button key={f.id} className="g-chip" aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>{f.rotulo} <span className="g-tab" style={{ opacity: .65 }}>{qtd}</span></button>;
              })}
            </div>

            {!lojas.length ? <Vazio titulo="Nenhum pet shop ainda." texto="Quando alguém criar uma conta, aparece aqui." />
              : !visiveis.length ? <Vazio titulo="Nada com esse filtro." texto="Tente outro nome ou outro filtro." />
              : (
                <div className="g-pilha p">
                  {visiveis.map((l) => {
                    const e = etiqueta(l, agora), u = engajamento(l);
                    return (
                      <button key={l.id} className="g-card" style={{ textAlign: "left", color: "inherit", width: "100%", cursor: "pointer", display: "grid", gap: 8 }} onClick={() => setAbertaId(l.id)}>
                        <span className="g-fila entre">
                          <b style={{ font: "500 1.125rem/1.2 var(--display)", minWidth: 0, overflowWrap: "anywhere" }}>{l.nome}</b>
                          <span className="g-fila" style={{ gap: 6 }}>
                            <span className={`g-tag ${e.cor}`}>{e.texto}</span>
                            <span className={`g-tag ${u.cor}`}>{u.texto}</span>
                          </span>
                        </span>
                        <span className="g-p g-muted" style={{ overflowWrap: "anywhere" }}>
                          {local(l)} · {l.dono_nome ?? "dono sem nome"}{l.dono_email ? ` · ${l.dono_email}` : ""}
                        </span>
                        <span className="g-pp g-muted g-tab">
                          {nomePlano(l.plano)} · criado em {dataCompleta(new Date(l.criado_em))} · {l.pets} pets · {l.agendamentos} agendamentos ({l.agendamentos_7d} em 7 dias) · {l.pedidos_assistente} pedidos ao assistente · último agendamento: {haQuanto(l.ultimo_agendamento)}
                        </span>
                        {l.nota && <span className="g-pp" style={{ overflowWrap: "anywhere" }}>Anotação: {l.nota}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
          </section>

          <AvisosCakto lojas={lojas} />
        </div>
      )}

      {aberta && <Detalhe key={aberta.id} loja={aberta} uso={uso.find((u) => u.id === aberta.id)} agora={agora} aoFechar={() => setAbertaId(null)} aoMudar={carregar} />}
    </main>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="g-card">
      <p className="g-rotulo">{rotulo}</p>
      <p className="g-num" style={{ marginTop: 10 }}>{valor}</p>
    </div>
  );
}

/* ---------- folha de um pet shop ---------- */

function Detalhe({ loja, uso, agora, aoFechar, aoMudar }: { loja: Loja; uso?: Uso; agora: number; aoFechar: () => void; aoMudar: () => Promise<void> }) {
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [nota, setNota] = useState(loja.nota ?? "");
  const [indo, setIndo] = useState(false);
  const e = etiqueta(loja, agora), u = engajamento(loja);
  const primeiroNome = (loja.dono_nome ?? "").trim().split(/\s+/)[0];
  const zap = linkWhatsApp(loja.telefone, `Oi${primeiroNome ? `, ${primeiroNome}` : ""}! Aqui é da Maestro Pet. Tudo certo com o Maestro Pet Gestão no ${loja.nome}?`);

  async function gravar(args: { p_status?: Status; p_teste_ate?: string; p_plano?: string; p_nota?: string }, feito: string) {
    setIndo(true);
    try {
      const r = await banco().rpc("admin_atualizar", { p_petshop: loja.id, ...args });
      if (r.error) throw new Error(r.error.message);
      avisar(feito);
      await aoMudar();
    } catch (err) {
      avisarErro(err);
    } finally {
      setIndo(false);
    }
  }

  async function maisSete() {
    const ate = new Date(Math.max(Date.now(), new Date(loja.teste_ate).getTime()) + 7 * DIA);
    if (!(await confirmar({ titulo: "Dar mais 7 dias de teste?", texto: `${loja.nome} volta para o teste, liberado até ${dataCompleta(ate)}.`, confirmar: "Dar 7 dias" }))) return;
    await gravar({ p_status: "teste", p_teste_ate: ate.toISOString() }, "Mais 7 dias de teste.");
  }
  async function mudarStatus(status: Status, titulo: string, texto: string, feito: string, perigo?: boolean) {
    if (!(await confirmar({ titulo, texto, perigo, confirmar: perigo ? "Cancelar a conta" : "Confirmar" }))) return;
    await gravar({ p_status: status }, feito);
  }
  async function trocarPlano(plano: string) {
    if (plano === loja.plano) return;
    await gravar({ p_plano: plano }, `Plano: ${nomePlano(plano)}.`);
  }

  const dados: [string, React.ReactNode][] = [
    ["Cidade", local(loja)],
    ["Telefone", loja.telefone ? fmtTelefone(loja.telefone) : "não informado"],
    ["Dono", loja.dono_nome ?? "sem nome"],
    ["E-mail do dono", loja.dono_email ?? "não encontrado"],
    ["E-mail na Cakto", loja.cakto_email ?? "ainda não pagou pela Cakto"],
    ["Plano", nomePlano(loja.plano)],
    ["Criado em", dataHora(loja.criado_em)],
    ["Teste até", dataHora(loja.teste_ate)],
    ["Assinante desde", loja.assinatura_desde ? dataCompleta(new Date(loja.assinatura_desde)) : "não assinou"],
    ["Equipe", `${loja.equipe} ${loja.equipe === 1 ? "pessoa" : "pessoas"}`],
    ["Clientes", loja.clientes],
    ["Pets", loja.pets],
    ["Agendamentos", `${loja.agendamentos} (${loja.agendamentos_7d} nos últimos 7 dias)`],
    ["Pedidos ao assistente", loja.pedidos_assistente],
    ["Último agendamento", loja.ultimo_agendamento ? `${haQuanto(loja.ultimo_agendamento)} (${dataCompleta(new Date(loja.ultimo_agendamento))})` : "nunca"],
    ["Última vez no sistema", vistoHa(uso?.visto_em ?? null)],
    ["Tempo de uso", `${tempo(uso?.min_7d ?? 0)} em 7 dias · ${tempo(uso?.min_30d ?? 0)} em 30 dias`],
  ];

  return (
    <Folha titulo={loja.nome} aoFechar={aoFechar} larga>
      <div className="g-pilha">
        <div className="g-fila">
          <span className={`g-tag ${e.cor}`}>{e.texto}</span>
          <span className={`g-tag ${u.cor}`}>{u.texto}</span>
        </div>

        <div className="g-fila">
          {zap
            ? <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp</a>
            : <span className="g-pp g-muted">Sem telefone para o WhatsApp.</span>}
          {loja.dono_email && <a className="g-btn sec" href={`mailto:${loja.dono_email}`}><Mail /> E-mail</a>}
        </div>

        <dl className="g-card liso" style={{ display: "grid", gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)", gap: "8px 16px", margin: 0, fontSize: ".9375rem" }}>
          {dados.map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt className="g-muted">{k}</dt>
              <dd style={{ margin: 0, fontWeight: 500, overflowWrap: "anywhere" }}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="g-pilha p">
          <h3>Assinatura</h3>
          <div className="g-fila">
            <button className="g-btn verde" disabled={indo} onClick={() => void maisSete()}>Dar mais 7 dias de teste</button>
            {loja.status !== "cortesia" && (
              <button className="g-btn sec" disabled={indo} onClick={() => void mudarStatus("cortesia", "Liberar como cortesia?", `${loja.nome} usa o sistema sem pagar, até você mudar.`, "Liberado como cortesia.")}>Liberar como cortesia</button>
            )}
            {loja.status !== "ativa" && (
              <button className="g-btn sec" disabled={indo} onClick={() => void mudarStatus("ativa", "Marcar como ativa?", "Use quando o pagamento entrou e a Cakto não avisou. O próximo aviso da Cakto pode mudar isso de novo.", "Marcada como ativa.")}>Marcar como ativa</button>
            )}
            {loja.status !== "cancelada" && (
              <button className="g-btn perigo" disabled={indo} onClick={() => void mudarStatus("cancelada", "Marcar como cancelada?", `${loja.nome} fica só para consulta. Isto não cancela a cobrança na Cakto.`, "Marcada como cancelada.", true)}>Marcar como cancelada</button>
            )}
          </div>
        </div>

        <div className="g-pilha p">
          <h3>Plano</h3>
          <div className="g-chips">
            {Object.entries(PLANOS).map(([id, rotulo]) => (
              <button key={id} className="g-chip" aria-pressed={loja.plano === id} disabled={indo} onClick={() => void trocarPlano(id)}>{rotulo}</button>
            ))}
          </div>
          {!(loja.plano in PLANOS) && <p className="g-pp g-muted">Plano atual fora da lista: {loja.plano}</p>}
        </div>

        <Campo rotulo="Anotação interna" dica="Só a equipe Maestro Pet vê.">
          <textarea className="g-textarea" value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Ex.: liguei dia 12, vai decidir na segunda." />
        </Campo>
        <div>
          <button className="g-btn sec" disabled={indo || nota.trim() === (loja.nota ?? "").trim()} onClick={() => void gravar({ p_nota: nota.trim() }, "Anotação salva.")}>Salvar anotação</button>
        </div>

        <div className="g-pilha p">
          <h3>Conversas com o Mozart e a Ajuda</h3>
          <AbaConversas petshopId={loja.id} enxuto />
        </div>
      </div>
    </Folha>
  );
}

/* ---------- avisos da Cakto ---------- */

function AvisosCakto({ lojas }: { lojas: Loja[] }) {
  const [aberto, setAberto] = useState(false);
  const [eventos, setEventos] = useState<EventoCakto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const nomes = useMemo(() => new Map(lojas.map((l) => [l.id, l.nome])), [lojas]);

  async function alternar() {
    const abrir = !aberto;
    setAberto(abrir);
    if (!abrir) return;
    try {
      setEventos(ok(await banco().rpc("admin_eventos_cakto")) as EventoCakto[]);
      setErro(null);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  }

  return (
    <section className="g-card">
      <button className="g-fila entre" style={{ width: "100%", background: "none", border: 0, padding: 0, color: "inherit", textAlign: "left" }} aria-expanded={aberto} onClick={() => void alternar()}>
        <span>
          <b style={{ font: "480 1.25rem/1.2 var(--display)", display: "block" }}>Avisos da Cakto</b>
          <span className="g-p g-muted">Os últimos 100 avisos de pagamento que chegaram.</span>
        </span>
        {aberto ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
      </button>
      {aberto && (
        <div style={{ marginTop: 12 }}>
          {erro ? <p className="g-erro" role="alert">{erro}</p>
            : !eventos ? <Esqueleto />
            : !eventos.length ? <p className="g-muted g-p">Nenhum aviso chegou ainda.</p>
            : (
              <div className="g-lista">
                {eventos.map((ev) => (
                  <div key={ev.id} className="g-linha">
                    <span className="t">
                      <b>{ev.evento ?? "evento sem nome"}</b>
                      <span>{ev.email ?? "sem e-mail"}</span>
                      <span className="g-tab">{dataHora(ev.recebido_em)}</span>
                    </span>
                    {ev.petshop_id
                      ? <span className="g-tag verde" style={{ maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis" }}>{nomes.get(ev.petshop_id) ?? "pet shop achado"}</span>
                      : <span className="g-tag vermelho">não achou o pet shop</span>}
                  </div>
                ))}
              </div>
            )}
        </div>
      )}
    </section>
  );
}
