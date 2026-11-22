"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, Download, LogOut, RefreshCw, Search } from "lucide-react";
import AbaUso, { type Uso, type UsoConta, SINAIS, sinaisDe, tempo, vistoHa } from "@/components/gestao/admin/uso";
import AbaVisao from "@/components/gestao/admin/visao";
import ContaAssinatura from "@/components/gestao/admin/conta";
import AbaConversas from "@/components/gestao/admin/conversas";
import AbaEscola from "@/components/gestao/admin/escola";
import AbaCakto from "@/components/gestao/admin/cakto";
import AbaErros from "@/components/gestao/admin/erros";
import AbaAceites from "@/components/gestao/admin/aceites";
import AbaVendas from "@/components/gestao/admin/vendas";
import AbaDados, { LembreteDaCopia, LembreteDasRotinas } from "@/components/gestao/admin/dados";
import SegundoFator from "@/components/gestao/admin/segundo-fator";
import { AvisosProvider, Campo, Esqueleto, Folha, Vazio, mensagemDeErro, ok, useAvisos } from "@/components/gestao/ui";
import { banco, configurado } from "@/lib/gestao/supabase";
import { dataCompleta, fmtTelefone, haQuanto, hora, isoDia, semAcento } from "@/lib/gestao/util";

type Status = "teste" | "ativa" | "atrasada" | "cancelada" | "cortesia";

type Loja = {
  id: string; nome: string; cidade: string | null; uf: string | null; telefone: string | null;
  status: Status; plano: string; teste_ate: string; criado_em: string; assinatura_desde: string | null;
  cakto_email: string | null; dono_email: string | null; dono_nome: string | null;
  equipe: number; clientes: number; pets: number; agendamentos: number; agendamentos_7d: number;
  pedidos_assistente: number; ultimo_agendamento: string | null; nota: string | null;
  /** Conta de teste (da equipe ou dos testes): fica fora de todos os números do painel. Só o administrador marca. */
  conta_teste?: boolean;
};
type EventoCakto = { id: number; evento: string | null; email: string | null; petshop_id: string | null; recebido_em: string };

const DIA = 864e5;
import { PLANOS as CATALOGO } from "@/lib/gestao/planos";
const PLANOS: Record<string, string> = Object.fromEntries(CATALOGO.map((p) => [p.id, `${p.nome} (${p.acessos})`]));
const nomePlano = (p: string) => PLANOS[p] ?? p;

/* ---------- leitura de cada pet shop ---------- */

const emTeste = (l: Loja, agora: number) => l.status === "teste" && new Date(l.teste_ate).getTime() > agora;
const testeVencido = (l: Loja, agora: number) => l.status === "teste" && new Date(l.teste_ate).getTime() <= agora;
const diasDeTeste = (l: Loja, agora: number) => Math.max(0, Math.ceil((new Date(l.teste_ate).getTime() - agora) / DIA));
const venceEm2Dias = (l: Loja, agora: number) => emTeste(l, agora) && new Date(l.teste_ate).getTime() - agora <= 2 * DIA;

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

type Filtro = "todos" | Status | "vencido" | "ligar" | "conta_teste";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "ligar", rotulo: "Teste vence em 2 dias" },
  { id: "teste", rotulo: "Em teste" },
  { id: "vencido", rotulo: "Teste vencido" },
  { id: "ativa", rotulo: "Ativas" },
  { id: "atrasada", rotulo: "Atrasadas" },
  { id: "cancelada", rotulo: "Canceladas" },
  { id: "cortesia", rotulo: "Cortesia" },
  { id: "conta_teste", rotulo: "Contas de teste" },
];
/** As contas de teste só aparecem no filtro delas: nenhum outro filtro (nem "Todos") as conta. */
function passa(l: Loja, f: Filtro, agora: number) {
  if (f === "conta_teste") return Boolean(l.conta_teste);
  if (l.conta_teste) return false;
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
  const [acesso, setAcesso] = useState<"vendo" | "fator" | "sim" | "nao">("vendo");
  const [usuario, setUsuario] = useState("");
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [aba, setAba] = useState<"visao" | "geral" | "uso" | "conversas" | "escola" | "cakto" | "vendas" | "erros" | "aceites" | "dados">("visao");
  const [uso, setUso] = useState<Uso[]>([]);
  const [contas, setContas] = useState<UsoConta[]>([]);
  const [vez, setVez] = useState(0);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      const [l, u, c] = await Promise.all([banco().rpc("admin_painel"), banco().rpc("admin_uso"), banco().rpc("admin_uso_contas")]);
      setLojas((ok(l) as unknown as Loja[]) ?? []);
      setUso((u.data as unknown as Uso[]) ?? []);
      setContas((c.data as unknown as UsoConta[]) ?? []);
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
      setUsuario(data.session.user.id);
      // é da equipe? a sessão já passou pelo segundo fator? (os dados do painel só saem com ele: sou_admin, migração 20261245)
      const r = await banco().rpc("admin_situacao");
      if (!vivo) return;
      if (r.error && (r.error.code === "PGRST202" || r.error.code === "42883")) {
        // banco sem a função nova: como antes
        const v = await banco().rpc("sou_admin");
        if (!vivo) return;
        if (v.error) { setErro(mensagemDeErro(v.error)); setAcesso("nao"); return; }
        if (!v.data) { setAcesso("nao"); return; }
        setAcesso("sim"); void carregar(); return;
      }
      if (r.error) { setErro(mensagemDeErro(r.error)); setAcesso("nao"); return; }
      const s = r.data as { admin?: boolean; forte?: boolean } | null;
      if (!s?.admin) { setAcesso("nao"); return; }
      if (!s.forte) { setAcesso("fator"); return; }
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

  const visiveis = useMemo(() => {
    const alvo = semAcento(busca);
    return (lojas ?? []).filter((l) => passa(l, filtro, agora) && (!alvo ||
      [l.nome, l.dono_nome, l.dono_email, l.cakto_email, l.cidade, l.uf].some((c) => semAcento(c ?? "").includes(alvo))));
  }, [lojas, busca, filtro, agora]);

  const aberta = abertaId ? (lojas ?? []).find((l) => l.id === abertaId) ?? null : null;
  // contas de teste: fora dos números (Uso); a lista Contas mostra no filtro "Contas de teste"
  const testes = useMemo(() => new Set((lojas ?? []).filter((l) => l.conta_teste).map((l) => l.id)), [lojas]);
  const reais = useMemo(() => (lojas ?? []).filter((l) => !l.conta_teste), [lojas]);

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
  if (acesso === "fator") return <SegundoFator usuario={usuario} aoPassar={() => { setAcesso("sim"); void carregar(); }} aoSair={() => void sair()} />;
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
          <p className="g-muted">Todos os pet shops: assinatura, uso do sistema, conversas e erros.</p>
        </div>
        <div className="g-acoes">
          <Link className="g-btn sec" href="/gestao/app"><ArrowLeft /> Meu pet shop</Link>
          <button className="g-btn sec" onClick={() => void carregar()} disabled={atualizando}><RefreshCw /> {atualizando ? "Atualizando…" : "Atualizar"}</button>
          <button className="g-btn fantasma" onClick={() => void sair()}><LogOut /> Sair</button>
        </div>
      </header>

      {erro && <p className="g-aviso vermelho" role="alert">{erro}</p>}
      {aba !== "dados" && <LembreteDaCopia aoAbrir={() => setAba("dados")} />}
      {aba !== "dados" && <LembreteDasRotinas aoAbrir={() => setAba("dados")} />}
      <div className="g-seg g-adm-abas" role="group" aria-label="Partes do painel" style={{ marginBottom: 18 }}>
        {([["visao", "Visão geral"], ["uso", "Uso"], ["geral", "Contas"], ["conversas", "Conversas"], ["escola", "Escola"], ["cakto", "Cakto"], ["vendas", "Vendas"], ["erros", "Erros"], ["aceites", "Aceites"], ["dados", "Dados"]] as const).map(([id, r]) => (
          <button key={id} aria-pressed={aba === id} onClick={() => setAba(id)}>{r}</button>
        ))}
      </div>
      {!lojas ? (!erro && <Esqueleto linhas={6} />) : <NaAba aba={aba}>{aba === "visao" ? <AbaVisao key={vez} /> : aba === "uso" ? <AbaUso lojas={reais} uso={uso.filter((u) => !testes.has(u.id))} contas={contas.filter((c) => !testes.has(c.id))} contasDeTeste={testes.size} aoAbrir={setAbertaId} />
        : aba === "conversas" ? <AbaConversas key={vez} /> : aba === "escola" ? <AbaEscola /> : aba === "cakto" ? <AbaCakto lojas={lojas} aoMudar={carregar} /> : aba === "vendas" ? <AbaVendas key={vez} /> : aba === "erros" ? <AbaErros key={vez} /> : aba === "aceites" ? <AbaAceites key={vez} /> : aba === "dados" ? <AbaDados key={vez} /> : (
        <div className="g-pilha g">
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

            {testes.size > 0 && filtro !== "conta_teste" && <p className="g-pp g-muted" data-teste="contas-teste-fora">{testes.size === 1 ? "1 conta de teste fica fora desta lista e dos números." : `${testes.size} contas de teste ficam fora desta lista e dos números.`} Veja em Contas de teste.</p>}
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
                            {l.conta_teste && <span className="g-tag">conta de teste</span>}
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
      )}</NaAba>}

      {aberta && <Detalhe key={aberta.id} loja={aberta} uso={uso.find((u) => u.id === aberta.id)} conta={contas.find((c) => c.id === aberta.id)} agora={agora} aoFechar={() => setAbertaId(null)} aoMudar={carregar} />}
    </main>
  );
}

/* ---------- troca de aba ---------- */

/**
 * A aba nova aparece já com o "carregando" dela, no mesmo toque: o conteúdo de verdade só monta depois que a tela pintou.
 * Antes, a aba tocada ficava marcada mas a tela continuava mostrando a aba anterior até a nova terminar de montar (Uso e
 * Contas desenham centenas de linhas de uma vez), e por um instante parecia que a aba nova tinha o conteúdo da outra.
 */
function NaAba({ aba, children }: { aba: string; children: React.ReactNode }) {
  const [mostrada, setMostrada] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const q = requestAnimationFrame(() => { t = setTimeout(() => setMostrada(aba), 0); });
    return () => { cancelAnimationFrame(q); if (t) clearTimeout(t); };
  }, [aba]);
  if (mostrada !== aba) return <div key={`c-${aba}`} data-aba={aba} data-aba-carregando aria-busy="true"><Esqueleto linhas={6} /></div>;
  return <div key={aba} data-aba={aba}>{children}</div>;
}

/* ---------- folha de um pet shop ---------- */

function Detalhe({ loja, uso, conta, agora, aoFechar, aoMudar }: { loja: Loja; uso?: Uso; conta?: UsoConta; agora: number; aoFechar: () => void; aoMudar: () => Promise<void> }) {
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [nota, setNota] = useState(loja.nota ?? "");
  const [indo, setIndo] = useState(false);
  const [teste, setTeste] = useState(Boolean(loja.conta_teste));
  const e = etiqueta(loja, agora), u = engajamento(loja);
  const sinais = conta ? sinaisDe(conta, agora) : [];

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
  async function marcarTeste(teste: boolean) {
    setIndo(true);
    setTeste(teste); // a caixa muda na hora; volta se o banco recusar
    try {
      const r = await banco().rpc("admin_conta_teste", { p_petshop: loja.id, p_teste: teste });
      if (r.error) throw new Error(r.error.message);
      avisar(teste ? "Marcada como conta de teste. Saiu dos números." : "Desmarcada. Voltou para os números.");
      await aoMudar();
    } catch (err) {
      setTeste(!teste);
      avisarErro(err);
    } finally {
      setIndo(false);
    }
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
    ["Equipe", conta ? `${conta.pessoas} de ${conta.limite} ${conta.limite === 1 ? "pessoa" : "pessoas"} do plano` : `${loja.equipe} ${loja.equipe === 1 ? "pessoa" : "pessoas"}`],
    ["Clientes", loja.clientes],
    ["Pets", loja.pets],
    ["Agendamentos", `${loja.agendamentos} (${loja.agendamentos_7d} nos últimos 7 dias)`],
    ["Pedidos ao assistente", loja.pedidos_assistente],
    ["Último agendamento", loja.ultimo_agendamento ? `${haQuanto(loja.ultimo_agendamento)} (${dataCompleta(new Date(loja.ultimo_agendamento))})` : "nunca"],
    ["Última vez no sistema", vistoHa(uso?.visto_em ?? null)],
    ["Último login", conta?.ultimo_login ? haQuanto(conta.ultimo_login) : "nunca"],
    ["Dias de uso em 14", conta ? `${conta.dias_14} de 14` : "sem dados"],
    ["Tempo de uso", `${tempo(uso?.min_7d ?? 0)} em 7 dias · ${tempo(uso?.min_30d ?? 0)} em 30 dias`],
  ];

  return (
    <Folha titulo={loja.nome} aoFechar={aoFechar} larga>
      <div className="g-pilha">
        <div className="g-fila">
          {loja.conta_teste && <span className="g-tag">conta de teste</span>}
          <span className={`g-tag ${e.cor}`}>{e.texto}</span>
          <span className={`g-tag ${u.cor}`}>{u.texto}</span>
        </div>

        {sinais.length > 0 && (
          <div className="g-fila" style={{ gap: 6 }}>
            {sinais.map((m) => { const x = SINAIS.find((y) => y.id === m)!; return <span key={m} className={`g-tag ${x.cor}`}>{x.rotulo}</span>; })}
          </div>
        )}

        <ContaAssinatura loja={loja} sumido={sinais.includes("sumido")} />

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

        <div className="g-pilha p" data-teste="conta-teste">
          <h3>Conta de teste</h3>
          <label className="g-check" style={{ alignItems: "flex-start", cursor: "pointer" }}>
            <input type="checkbox" checked={teste} disabled={indo} onChange={(ev) => void marcarTeste(ev.target.checked)} style={{ flex: "none", marginTop: 2 }} />
            <span>
              <b>É uma conta de teste</b>
              <span className="g-pp g-muted" style={{ display: "block" }}>Fica fora da Visão geral, do Uso, das Vendas e da contagem de pagantes. O pet shop continua funcionando igual.</span>
            </span>
          </label>
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
