"use client";

import LinkCrecheHotel from "@/components/gestao/creche/link-creche-hotel";

import { abrirGuia } from "@/components/gestao/guia-inicial";
import Identidade from "@/components/gestao/ajustes/identidade";
import CopiaSeguranca from "@/components/gestao/ajustes/copia-seguranca";
import { AjustesCrecheHotel, VagasBanho } from "@/components/gestao/ajustes/capacidade";
import AjusteFidelidade from "@/components/gestao/ajustes/fidelidade";
import OpcoesDeCobranca from "@/components/gestao/ajustes/opcoes-cobranca";
import OpcoesCasa from "@/components/gestao/ajustes/opcoes-casa";
import OpcoesHotel from "@/components/gestao/ajustes/opcoes-hotel";
import OpcoesDoLink from "@/components/gestao/ajustes/opcoes-link";
import Feriados from "@/components/gestao/ajustes/feriados";
import OQueUsa from "@/components/gestao/ajustes/o-que-usa";
import OpcoesDaLoja from "@/components/gestao/ajustes/opcoes-loja";
import { usaCasa, usaModulo } from "@/lib/gestao/modulos";
import { textoDoLink } from "@/lib/gestao/agenda";
import { useEffect, useRef, useState } from "react";
import { Archive, BedDouble, CalendarDays, Check, ChevronDown, Clock, Copy, ExternalLink, HandCoins, Link2, MessageCircle, Plus, Scissors, Store, Tag } from "lucide-react";
import { guardarLembrado, lerLembrado } from "@/components/gestao/lembrado";
import { Kpi, Tile } from "@/components/gestao/painel";
import { useGestao } from "@/components/gestao/contexto";
import { Campo, CampoValor, Folha, Vazio, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "@/components/gestao/ui";
import { EscolherCor, GradeHorario, NOME_DIAS, ORDEM_DIAS, erroDoHorario, lerHorario } from "@/components/gestao/ajustes/grade-horario";
import { PORTES, type Horario, type Porte, type Servico } from "@/lib/gestao/tipos";
import { brlCurto, fmtTelefone, soDigitos, mascaraTelefone } from "@/lib/gestao/util";
import "@/components/gestao/ajustes/ajustes.css";
import "./meu-petshop.css";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const CATEGORIAS = [
  { id: "banho", rotulo: "Banho" },
  { id: "tosa", rotulo: "Tosa" },
  { id: "banho_tosa", rotulo: "Banho e tosa" },
  { id: "creche", rotulo: "Creche" },
  { id: "hotel", rotulo: "Hotel" },
  { id: "outro", rotulo: "Outro" },
];
const DURACOES = [15, 30, 45, 60, 90, 120];
const CAMPO_PRECO = { P: "preco_p", M: "preco_m", G: "preco_g", GG: "preco_gg" } as const;

function duracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
const horaCurta = (h: string) => { const [a, m] = h.split(":"); return m === "00" ? `${Number(a)}h` : `${Number(a)}:${m}`; };
const precos = (s: Servico) => PORTES.map((p) => ({ porte: p.id, valor: s[CAMPO_PRECO[p.id]] })).filter((x) => x.valor != null);

export default function MeuPetshop() {
  const { souDono, servicos, petshop } = useGestao();
  if (!souDono) return <Vazio titulo="Só o dono do pet shop mexe aqui." />;
  const ativos = servicos.filter((s) => s.ativo);
  const faltaPreco = ativos.filter((s) => !precos(s).length).length;
  const semPreco = faltaPreco > 0;
  const salvo = lerHorario(petshop.horario);
  const abertos = ORDEM_DIAS.filter((d) => salvo[d]).length;
  const deHoje = salvo[String(new Date().getDay())];
  // os atalhos do alto: um por grupo que este pet shop vê
  const grupos = [
    { id: "servicos", titulo: "Serviços e preços" },
    { id: "agenda", titulo: "Agenda e link" },
    ...(usaCasa(petshop) ? [{ id: "casa", titulo: "Creche e hotel" }] : []),
    ...(usaModulo(petshop, "loja") ? [{ id: "loja", titulo: "Loja" }] : []),
    { id: "dinheiro", titulo: "Cobrança e fidelidade" },
    { id: "negocio", titulo: "O negócio" },
    { id: "copia", titulo: "Cópia de segurança" },
  ];
  return (
    <>
      <header className="g-topo">
        <div><h1>Meu pet shop</h1><p className="g-muted">Dados, horário e os serviços que você oferece.</p></div>
        <div className="g-acoes"><button className="g-btn sec" onClick={() => abrirGuia()}>Refazer o guia de configuração</button></div>
      </header>
      {semPreco && (
        <div className="g-aviso"><Tag /><span className="g-cresce">Coloque os preços dos serviços para o Mozart e a agenda já sugerirem o valor certo.</span></div>
      )}
      <div className="g-pilha g">
        <div className="g-grade kpis">
          <Kpi icone={Scissors} tom="pessego" rotulo="Serviços" valor={ativos.length} apoio={ativos.length === 1 ? "ativo na agenda" : "ativos na agenda"} />
          <Kpi icone={Tag} tom={semPreco ? "manteiga" : "menta"} rotulo="Sem preço" valor={faltaPreco} apoio={semPreco ? "faltam os valores" : "todos com valor"} />
          <Kpi icone={CalendarDays} tom="ceu" rotulo="Dias abertos" valor={abertos} apoio="por semana" />
          <Kpi icone={Clock} tom="lilas" rotulo="Hoje" valor={deHoje ? `${horaCurta(deHoje.abre)}–${horaCurta(deHoje.fecha)}` : "Fechado"} apoio={deHoje ? "horário de hoje" : "sem atendimento"} />
        </div>
        <nav className="g-mp-atalhos" aria-label="Ir direto para">
          <span className="g-muted g-pp">Ir direto para</span>
          {grupos.map((g) => <button key={g.id} type="button" className="g-chip" onClick={() => irParaGrupo(g.id)}>{g.titulo}</button>)}
        </nav>
        <Grupo id="servicos" titulo="Serviços e horário" icone={Scissors} tom="pessego" abertoDeInicio
          cartoes={[["Serviços e preços", <Servicos key="s" />], ["Horário de funcionamento", <HorarioDaLoja key="h" />], ["Feriados e dias fechados", <Feriados key="f" />]]} />
        <Grupo id="agenda" titulo="Agenda e link do cliente" icone={Link2} tom="ceu"
          cartoes={[usaModulo(petshop, "banho_tosa") && ["Banho e tosa: pets ao mesmo tempo", <VagasBanho key="v" />], ["Link de agendamento", <LinkAgendamento key="l" />], ["Regras e cancelamento pelo link", <OpcoesDoLink key="o" />]]} />
        {usaCasa(petshop) && (
          <Grupo id="casa" titulo="Creche e hotel" icone={BedDouble} tom="lilas"
            cartoes={[["Creche e hotel", <AjustesCrecheHotel key="a" />], ["Opções do hotel e da creche", <OpcoesHotel key="h" />], ["Cuidado com o tutor", <OpcoesCasa key="c" />]]} />
        )}
        {usaModulo(petshop, "loja") && <Grupo id="loja" titulo="Loja" icone={Store} tom="manteiga" cartoes={[["Opções da loja", <OpcoesDaLoja key="l" />]]} />}
        <Grupo id="dinheiro" titulo="Cobrança e fidelidade" icone={HandCoins} tom="menta"
          cartoes={[["Opções de cobrança", <OpcoesDeCobranca key="c" />], ["Fidelidade", <AjusteFidelidade key="f" />]]} />
        <Grupo id="negocio" titulo="O negócio" icone={Store} tom="rosa"
          cartoes={[["Dados", <Dados key="d" />], ["O que você usa", <OQueUsa key="o" />], ["Identidade do pet shop", <Identidade key="i" />]]} />
        <Grupo id="copia" titulo="Cópia de segurança" icone={Archive} tom="ceu" largo cartoes={[["Cópia de segurança", <CopiaSeguranca key="c" />]]} />
      </div>
    </>
  );
}

/* ---------- grupos de cartões ---------- */

const EVENTO_GRUPO = "gestao:mp-grupo";
/** Abre o grupo (se estiver fechado) e leva a tela até ele, ou até um cartão dele. */
const irParaGrupo = (id: string, cartao?: number) => window.dispatchEvent(new CustomEvent(EVENTO_GRUPO, { detail: { id, cartao } }));

/**
 * Um grupo de cartões de Meu pet shop, que abre e fecha. Só o primeiro começa aberto; o aparelho lembra o que a pessoa
 * deixou aberto. Fechado, o grupo mostra o nome de cada cartão: um toque no nome abre o grupo e desce até o cartão.
 * Os cartões continuam na página mesmo com o grupo fechado: um atalho de outra tela (#opcoes-cobranca, #opcoes-hotel…)
 * abre o grupo certo e desce até o cartão.
 */
function Grupo({ id, titulo, icone, tom, abertoDeInicio, largo, cartoes }: {
  id: string; titulo: string; icone: React.ComponentProps<typeof Tile>["icone"]; tom: React.ComponentProps<typeof Tile>["tom"];
  abertoDeInicio?: boolean; largo?: boolean; cartoes: (false | [string, React.ReactNode])[];
}) {
  const lista = cartoes.filter((c): c is [string, React.ReactNode] => Boolean(c));
  const chave = `maestro:mp-grupo:${id}`;
  const [aberto, setAberto] = useState(Boolean(abertoDeInicio));
  const raiz = useRef<HTMLElement>(null);
  const mudar = (v: boolean) => { setAberto(v); guardarLembrado(chave, v ? "1" : "0"); };
  useEffect(() => {
    const lembrado = lerLembrado(chave);
    if (lembrado) setAberto(lembrado === "1");
    // atalho de outra tela para um cartão daqui de dentro
    const alvo = window.location.hash.length > 1 ? raiz.current?.querySelector(`#${CSS.escape(decodeURIComponent(window.location.hash.slice(1)))}`) : null;
    if (alvo) { setAberto(true); setTimeout(() => alvo.scrollIntoView({ block: "start" }), 60); }
    const ir = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; cartao?: number }>).detail;
      if (d.id !== id) return;
      setAberto(true);
      setTimeout(() => (d.cartao == null ? raiz.current : raiz.current?.querySelector(`[data-cartao="${d.cartao}"]`) ?? raiz.current)?.scrollIntoView({ block: "start", behavior: "smooth" }), 30);
    };
    window.addEventListener(EVENTO_GRUPO, ir);
    return () => window.removeEventListener(EVENTO_GRUPO, ir);
  }, [id, chave]);
  return (
    <section className={`g-mp-grupo${aberto ? " aberto" : ""}`} id={`grupo-${id}`} ref={raiz} aria-label={titulo}>
      <div className="g-mp-grupo-t">
        <button type="button" className="g-mp-grupo-b" aria-expanded={aberto} aria-controls={`grupo-${id}-corpo`} onClick={() => mudar(!aberto)}>
          <Tile icone={icone} tom={tom} tamanho="p" />
          <span className="t"><b>{titulo}</b>{aberto && lista.length > 1 && <small>{lista.length} cartões</small>}</span>
          <span className="g-mp-grupo-acao">{aberto ? "Fechar" : "Abrir"}<ChevronDown aria-hidden /></span>
        </button>
        {!aberto && (
          <div className="g-mp-grupo-nomes">
            {lista.map(([nome], i) => <button key={nome} type="button" className="g-chip" onClick={() => irParaGrupo(id, i)}>{nome}</button>)}
          </div>
        )}
      </div>
      <div className={`g-mp-grupo-corpo${largo ? " largo" : ""}`} id={`grupo-${id}-corpo`} hidden={!aberto}>
        {lista.map(([nome, cartao], i) => <div key={nome} data-cartao={i} className="g-mp-cartao">{cartao}</div>)}
      </div>
    </section>
  );
}

/* ---------- dados ---------- */

function Dados() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [nome, setNome] = useState(petshop.nome);
  const [telefone, setTelefone] = useState(fmtTelefone(petshop.telefone));
  const [cidade, setCidade] = useState(petshop.cidade ?? "");
  const [uf, setUf] = useState(petshop.uf ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (somenteLeitura()) return;
    const n = nome.trim();
    const tel = soDigitos(telefone);
    if (n.length < 2) return setErro("Escreva o nome do pet shop.");
    if (tel && tel.length !== 10 && tel.length !== 11) return setErro("Confira o WhatsApp: DDD e número.");
    setErro(null);
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({ nome: n.slice(0, 80), telefone: tel || null, cidade: cidade.trim() || null, uf: uf || null }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      setTelefone(fmtTelefone(tel));
      avisar("Dados salvos.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <form className="g-card g-form" onSubmit={salvar}>
      <div className="g-mp-t"><Tile icone={Store} tom="menta" /><div><h2>Dados</h2><p className="g-muted g-p">Nome, contato e cidade.</p></div></div>
      <Campo rotulo="Nome do pet shop"><input className="g-input" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} /></Campo>
      <Campo rotulo="WhatsApp" dica="O número que os clientes usam para falar com vocês.">
        <input className="g-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={telefone}
          onChange={(e) => setTelefone(mascaraTelefone(e.target.value))} />
      </Campo>
      <div className="dupla" style={{ gridTemplateColumns: "1fr 6.5rem" }}>
        <Campo rotulo="Cidade"><input className="g-input" value={cidade} maxLength={80} onChange={(e) => setCidade(e.target.value)} /></Campo>
        <Campo rotulo="UF">
          <select className="g-select" value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">—</option>
            {uf && !UFS.includes(uf) && <option value={uf}>{uf}</option>}
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Campo>
      </div>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div><button className="g-btn verde" disabled={salvando}>{salvando ? "Salvando…" : "Salvar dados"}</button></div>
    </form>
  );
}

/* ---------- link de agendamento ---------- */

function LinkAgendamento() {
  const { sb, petshop, servicos, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [aviso, setAviso] = useState(petshop.link_aviso ?? "");
  const [ligando, setLigando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const ativo = petshop.link_ativo;
  const endereco = `${typeof window === "undefined" ? "" : window.location.origin}/gestao/agendar/${petshop.link_codigo}`;
  const semServico = !servicos.some((s) => s.ativo && !["creche", "hotel"].includes(s.categoria));
  const semDia = !ORDEM_DIAS.some((d) => lerHorario(petshop.horario)[d]);
  const mudouAviso = aviso.trim() !== (petshop.link_aviso ?? "");
  const zap = `https://wa.me/?text=${encodeURIComponent(textoDoLink(petshop, endereco))}`;

  async function ligar(valor: boolean) {
    if (somenteLeitura() || ligando) return;
    setLigando(true);
    try {
      ok(await sb.from("petshops").update({ link_ativo: valor }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisar(valor ? "Link ligado. Já pode mandar para os clientes." : "Link desligado.");
    } catch (x) { avisarErro(x); } finally { setLigando(false); }
  }

  async function salvarAviso(e: React.FormEvent) {
    e.preventDefault();
    if (somenteLeitura()) return;
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({ link_aviso: aviso.trim().slice(0, 240) || null }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      setAviso(aviso.trim());
      avisar("Recado salvo.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { avisar("Não consegui copiar. Segure o dedo no endereço para copiar."); }
  }

  return (
    <section className={`g-card g-pilha g-mp-link${ativo ? " on" : ""}`}>
      <div className="g-mp-t">
        <Tile icone={Link2} tom="pessego" />
        <div><h2>Link de agendamento</h2><p className="g-muted g-p">{usaCasa(petshop) ? "O cliente pede horário ou vaga pelo celular. Você aceita ou recusa." : "O cliente pede o horário pelo celular. Você aceita ou recusa."}</p></div>
        <button type="button" role="switch" aria-checked={ativo} aria-label="Link de agendamento" className="g-mp-chave" disabled={ligando} onClick={() => void ligar(!ativo)}><i /></button>
      </div>

      {ativo ? (
        <>
          <div className="g-mp-endereco">
            <span className="g-rotulo">Endereço do seu link</span>
            <a href={endereco} target="_blank" rel="noopener noreferrer">{endereco}<ExternalLink aria-hidden /></a>
          </div>
          <div className="g-mp-link-acoes">
            <button type="button" className="g-btn verde" onClick={() => void copiar()}>{copiado ? <Check /> : <Copy />}{copiado ? "Copiado" : "Copiar link"}</button>
            <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar no WhatsApp</a>
          </div>
          {(semServico || semDia) && (
            <p className="g-mp-link-falta">{semServico
              ? (usaCasa(petshop) && (petshop.link_creche || petshop.link_hotel)
                ? `Nenhum serviço da agenda está ativo: pelo link, o cliente pede só vaga ${[petshop.link_creche && "na creche", petshop.link_hotel && "no hotel"].filter(Boolean).join(" ou ")}.`
                : usaCasa(petshop) ? "Nenhum serviço da agenda está ativo e os pedidos de creche e hotel estão desligados, então o link abre sem opções. Marque abaixo o que o cliente pode pedir."
                : "Nenhum serviço da agenda está ativo, então o link abre sem opções.")
              : "Nenhum dia está aberto no horário de funcionamento, então o link não mostra horários."}</p>
          )}
          <LinkCrecheHotel />
        </>
      ) : (
        <p className="g-mp-link-off">O link está desligado. Ligue a chave para receber pedidos de horário. Nada é marcado sem você aceitar.</p>
      )}

      <form className="g-form" onSubmit={salvarAviso}>
        <Campo rotulo="Recado na página" dica={`Aparece no topo do link. ${240 - aviso.length} letras sobrando.`}>
          <textarea className="g-textarea" value={aviso} maxLength={240} placeholder="Ex.: Traga a carteirinha de vacina. Tosa só com horário confirmado." onChange={(e) => setAviso(e.target.value)} />
        </Campo>
        <div><button className="g-btn sec" disabled={salvando || !mudouAviso}>{salvando ? "Salvando…" : "Salvar recado"}</button></div>
      </form>
    </section>
  );
}

/* ---------- horário ---------- */

function HorarioDaLoja() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [horario, setHorario] = useState<Horario>(() => lerHorario(petshop.horario));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (somenteLeitura()) return;
    const problema = erroDoHorario(horario);
    setErro(problema);
    if (problema) return;
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({ horario }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar("Horário salvo.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha">
      <div className="g-mp-t"><Tile icone={Clock} tom="ceu" /><div><h2>Horário de funcionamento</h2><p className="g-muted g-p">A agenda mostra só as horas em que vocês estão abertos.</p></div></div>
      <div className="g-mp-semana" role="img" aria-label={`Abre em: ${ORDEM_DIAS.filter((d) => horario[d]).map((d) => NOME_DIAS[d]).join(", ") || "nenhum dia"}`}>
        {ORDEM_DIAS.map((d) => {
          const v = horario[d];
          return (
            <span key={d} className={`${v ? "on" : ""}${d === String(new Date().getDay()) ? " hoje" : ""}`}>
              <b>{NOME_DIAS[d].slice(0, 3)}</b>
              <small>{v && v.abre && v.fecha ? <>{horaCurta(v.abre)}<br />{horaCurta(v.fecha)}</> : "—"}</small>
            </span>
          );
        })}
      </div>
      <GradeHorario valor={horario} aoMudar={(h) => { setHorario(h); setErro(null); }} modelos />
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div><button className="g-btn verde" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar horário"}</button></div>
    </section>
  );
}

/* ---------- serviços e preços ---------- */

function Servicos() {
  const { sb, servicos, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState<Servico | "novo" | null>(null);
  const ativos = servicos.filter((s) => s.ativo);
  const inativos = servicos.filter((s) => !s.ativo);
  const abrir = (s: Servico | "novo") => { if (!somenteLeitura()) setEditando(s); };

  async function reativar(s: Servico) {
    if (somenteLeitura()) return;
    try {
      ok(await sb.from("servicos").update({ ativo: true }).eq("id", s.id).eq("petshop_id", s.petshop_id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(`${s.nome} voltou para a lista.`);
    } catch (x) { avisarErro(x); }
  }

  return (
    <section className="g-card">
      <div className="g-mp-t">
        <Tile icone={Scissors} tom="pessego" />
        <div className="g-cresce"><h2>Serviços e preços</h2><p className="g-muted g-p">{ativos.length ? `${ativos.length} ${ativos.length === 1 ? "serviço" : "serviços"}, com preço por porte.` : "O que vocês fazem e quanto custa."}</p></div>
        <button className="g-btn p pri" onClick={() => abrir("novo")}><Plus />Serviço novo</button>
      </div>
      {!ativos.length ? (
        <Vazio titulo="Nenhum serviço na lista" texto="Coloque o primeiro: banho, tosa, creche, o que vocês fazem." />
      ) : (
        <div className="g-mp-servicos">
          {ativos.map((s) => {
            const p = precos(s);
            return (
              <button key={s.id} type="button" className="g-mp-serv" style={{ "--cor": s.cor } as React.CSSProperties} onClick={() => abrir(s)}>
                <i className="g-mp-cor" aria-hidden><Scissors /></i>
                <span className="t">
                  <span className="g-mp-nome"><b>{s.nome}</b><span className="g-mp-tempo"><Clock aria-hidden />{duracao(s.duracao_min)}</span></span>
                  {p.length ? (
                    <span className="g-mp-precos">
                      {p.map((x) => <span key={x.porte} className="g-mp-preco"><i>{x.porte}</i>{brlCurto(x.valor)}</span>)}
                    </span>
                  ) : <span className="g-tag amarelo" style={{ justifySelf: "start" }}>sem preço</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {inativos.length > 0 && (
        <details className="gj-recolhe" style={{ marginTop: 14 }}>
          <summary>{inativos.length === 1 ? "1 serviço desativado" : `${inativos.length} serviços desativados`}</summary>
          <div className="g-lista">
            {inativos.map((s) => (
              <div key={s.id} className="g-linha">
                <i className="g-mp-cor p" style={{ "--cor": s.cor, opacity: .45 } as React.CSSProperties} aria-hidden />
                <span className="t"><b className="g-muted">{s.nome}</b><span>{duracao(s.duracao_min)}</span></span>
                <button className="g-btn p sec" onClick={() => reativar(s)}>Reativar</button>
              </div>
            ))}
          </div>
        </details>
      )}
      {editando && <FolhaServico servico={editando === "novo" ? null : editando} aoFechar={() => setEditando(null)} />}
    </section>
  );
}

function FolhaServico({ servico, aoFechar }: { servico: Servico | null; aoFechar: () => void }) {
  const { sb, petshop, servicos, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState(servico?.nome ?? "");
  const [categoria, setCategoria] = useState(servico?.categoria ?? "banho");
  const [minutos, setMinutos] = useState(String(servico?.duracao_min ?? 60));
  const [valores, setValores] = useState<Record<Porte, number | null>>({
    P: servico?.preco_p ?? null, M: servico?.preco_m ?? null, G: servico?.preco_g ?? null, GG: servico?.preco_gg ?? null,
  });
  const [cor, setCor] = useState(servico?.cor ?? "#f97316");
  const [ativo, setAtivo] = useState(servico?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const primeiro = valores.P ?? valores.M ?? valores.G ?? valores.GG;

  async function salvar() {
    const n = nome.trim();
    const min = Number(minutos);
    if (!n) return setErro("Dê um nome ao serviço.");
    if (!Number.isInteger(min) || min < 5 || min > 1440) return setErro("A duração fica entre 5 minutos e 24 horas.");
    if (PORTES.some((p) => (valores[p.id] ?? 0) < 0)) return setErro("O preço não pode ser negativo.");
    if (PORTES.some((p) => (valores[p.id] ?? 0) > 99999)) return setErro("Confira os preços.");
    setErro(null);
    setSalvando(true);
    const campos = {
      nome: n.slice(0, 80), categoria, duracao_min: min, cor, ativo,
      preco_p: valores.P, preco_m: valores.M, preco_g: valores.G, preco_gg: valores.GG,
    };
    try {
      if (servico) {
        ok(await sb.from("servicos").update(campos).eq("id", servico.id).eq("petshop_id", petshop.id).select("id"));
      } else {
        const ordem = servicos.reduce((m, s) => Math.max(m, s.ordem), 0) + 1;
        ok(await sb.from("servicos").insert({ ...campos, petshop_id: petshop.id, ordem }).select("id"));
      }
      await recarregarBase();
      avisarMudanca();
      avisar(servico ? (ativo ? "Serviço salvo." : "Serviço desativado.") : "Serviço criado.");
      aoFechar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  return (
    <Folha titulo={servico ? "Editar serviço" : "Serviço novo"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-form">
        <Campo rotulo="Nome"><input className="g-input" value={nome} maxLength={80} placeholder="Banho, Tosa higiênica…" autoFocus={!servico} onChange={(e) => setNome(e.target.value)} /></Campo>
        <Campo rotulo="Tipo">
          <select className="g-select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {CATEGORIAS.filter((c) => (c.id !== "creche" && c.id !== "hotel") || c.id === categoria || usaModulo(petshop, c.id)).map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
          </select>
        </Campo>
        <div className="g-campo">
          <span>Quanto tempo leva</span>
          <div className="g-chips">
            {DURACOES.map((d) => (
              <button key={d} type="button" className="g-chip" aria-pressed={Number(minutos) === d} onClick={() => setMinutos(String(d))}>{duracao(d)}</button>
            ))}
          </div>
          <div className="gj-min">
            <input className="g-input g-tab" inputMode="numeric" aria-label="Duração em minutos" value={minutos} onChange={(e) => setMinutos(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            <span className="g-muted g-p">minutos</span>
          </div>
        </div>
        <div className="g-campo">
          <span>Preço por porte</span>
          <div className="dupla">
            {PORTES.map((p) => (
              <Campo key={p.id} rotulo={`${p.id} · ${p.rotulo}`}>
                <CampoValor valor={valores[p.id]} aoMudar={(v) => setValores((a) => ({ ...a, [p.id]: v }))} />
              </Campo>
            ))}
          </div>
          <div>
            <button type="button" className="g-link g-p" disabled={primeiro == null}
              onClick={() => setValores({ P: primeiro, M: primeiro, G: primeiro, GG: primeiro })}>
              Usar o mesmo preço para todos
            </button>
          </div>
          <small>P = pequeno, M = médio, G = grande, GG = gigante. Pode deixar em branco o porte que vocês não atendem.</small>
        </div>
        <div className="g-campo"><span>Cor na agenda</span><EscolherCor valor={cor} aoMudar={setCor} /></div>
        {servico && (
          <label className="g-check">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            <span>Ativo <span className="g-muted">(desmarque para tirar da agenda sem apagar o histórico)</span></span>
          </label>
        )}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
