"use client";

import ModoSimples from "@/components/gestao/ajustes/modo-simples";
import LinkCrecheHotel from "@/components/gestao/creche/link-creche-hotel";

import { abrirGuia } from "@/components/gestao/ui";
import Identidade from "@/components/gestao/ajustes/identidade";
import CopiaSeguranca from "@/components/gestao/ajustes/copia-seguranca";
import EncerrarConta, { RegistroDeDados } from "@/components/gestao/lgpd/encerrar-conta";
import { AcessosDaEquipeMaestro, AvisoParaOsClientes } from "@/components/gestao/lgpd/privacidade-da-loja";
import { AjustesCrecheHotel, VagasBanho } from "@/components/gestao/ajustes/capacidade";
import AjusteFidelidade from "@/components/gestao/ajustes/fidelidade";
import OpcoesDeCobranca from "@/components/gestao/ajustes/opcoes-cobranca";
import TaxasDaMaquininha from "@/components/gestao/ajustes/taxas-maquininha";
import PapelDoComprovante from "@/components/gestao/ajustes/papel-comprovante";
import OpcoesCasa from "@/components/gestao/ajustes/opcoes-casa";
import OpcoesCreche from "@/components/gestao/ajustes/opcoes-creche";
import OpcoesHotel from "@/components/gestao/ajustes/opcoes-hotel";
import { SalvarJunto } from "@/components/gestao/ajustes/salvar-junto";
import OpcoesDoLink from "@/components/gestao/ajustes/opcoes-link";
import Promocoes from "@/components/gestao/ajustes/promocoes";
import Feriados from "@/components/gestao/ajustes/feriados";
import OQueUsa from "@/components/gestao/ajustes/o-que-usa";
import OpcoesDaLoja from "@/components/gestao/ajustes/opcoes-loja";
import { LojaNoGoogle, OpcoesDoBoletim } from "@/components/gestao/ajustes/opcoes-boletim";
import { OpcoesDaEntrada } from "@/components/gestao/ajustes/opcoes-entrada";
import OpcoesDoLevaTraz from "@/components/gestao/ajustes/opcoes-taxi";
import { AREAS_DE_SERVICO, areaDoServico, areasDeServicoPara, categoriaDaArea, nomeDaCasa, usaCasa, usaModulo, type AreaDoServico } from "@/lib/gestao/modulos";
import { CAMPOS_PRECO, EscolherArea, PrecosDoServico, comecaPorPorte, corLivre, erroDoPreco, inserirServico, mudarServico, umPrecoSo, type Precos } from "@/components/gestao/servico-campos";
import { textoDoLink } from "@/lib/gestao/agenda";
import { trocasDeCor } from "@/lib/gestao/cores";
import { emLista } from "@/components/gestao/personalizar-menu";
import { useEffect, useRef, useState } from "react";
import { Archive, BedDouble, CalendarDays, Check, ChevronDown, Clock, Copy, ExternalLink, HandCoins, Link2, MessageCircle, Plus, Scissors, Store, Tag } from "lucide-react";
import { guardarLembrado, lerLembrado } from "@/components/gestao/lembrado";
import { Kpi, Tile } from "@/components/gestao/painel";
import { useGestao } from "@/components/gestao/contexto";
import { Campo, Folha, Vazio, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "@/components/gestao/ui";
import { EscolherCor, GradeHorario, NOME_DIAS, ORDEM_DIAS, erroDoHorario, lerHorario } from "@/components/gestao/ajustes/grade-horario";
import { HorarioProprio } from "@/components/gestao/ajustes/horario-proprio";
import { areaTemHorario, erroDoHorarioProprio, mesmoHorario, semAlmoco, servicoTemHorario, type Area } from "@/lib/gestao/horario-loja";
import { PORTES, type Horario, type Servico } from "@/lib/gestao/tipos";
import { brl, brlCurto, fmtTelefone, lerValor, soDigitos, mascaraTelefone, valor2 } from "@/lib/gestao/util";
import "@/components/gestao/ajustes/ajustes.css";
import "./meu-petshop.css";
import { limparNome } from "@/lib/gestao/validacao";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
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
  // sem banho e tosa, os serviços da agenda não são o assunto: o alto mostra a diária e as vagas da casa
  const comAgenda = usaModulo(petshop, "banho_tosa");
  const semPreco = comAgenda && faltaPreco > 0;
  const daCasa = usaModulo(petshop, "creche") ? "creche" : "hotel";
  const diaria = daCasa === "creche" ? petshop.diaria_creche : petshop.diaria_hotel;
  const vagas = daCasa === "creche" ? petshop.vagas_creche : petshop.vagas_hotel;
  const salvo = lerHorario(petshop.horario);
  const abertos = ORDEM_DIAS.filter((d) => salvo[d]).length;
  const deHoje = salvo[String(new Date().getDay())];
  // os atalhos do alto: um por grupo que este pet shop vê
  const grupos = [
    { id: "servicos", titulo: "Serviços e preços" },
    { id: "agenda", titulo: "Agenda e link" },
    ...(usaCasa(petshop) ? [{ id: "casa", titulo: nomeDaCasa(petshop) }] : []),
    ...(usaModulo(petshop, "loja") ? [{ id: "loja", titulo: "Loja" }] : []),
    { id: "dinheiro", titulo: "Cobrança e fidelidade" },
    { id: "negocio", titulo: "O negócio" },
    { id: "copia", titulo: "Seus dados e a conta" },
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
          {comAgenda || !usaCasa(petshop) ? <>
          <Kpi icone={Scissors} tom="pessego" rotulo="Serviços" valor={ativos.length} apoio={ativos.length === 1 ? "ativo na agenda" : "ativos na agenda"} />
          <Kpi icone={Tag} tom={semPreco ? "manteiga" : "menta"} rotulo="Sem preço" valor={faltaPreco} apoio={semPreco ? "faltam os valores" : "todos com valor"} />
          </> : <>
          <Kpi icone={Tag} tom={diaria == null ? "manteiga" : "menta"} rotulo={daCasa === "creche" ? "Diária da creche" : "Diária do hotel"} valor={diaria == null ? "–" : brl(diaria)} apoio={diaria == null ? "sem valor ainda" : daCasa === "creche" ? "por dia" : "por noite"} />
          <Kpi icone={BedDouble} tom="ceu" rotulo="Vagas" valor={vagas ?? "–"} apoio={vagas == null ? "sem limite" : daCasa === "creche" ? "pets por dia" : "pets por noite"} />
          </>}
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
          cartoes={[usaModulo(petshop, "banho_tosa") && ["Banho e tosa: pets ao mesmo tempo", <VagasBanho key="v" />], ["Link do cliente", <LinkAgendamento key="l" />], ["Regras, cancelamento e dúvidas pelo link", <OpcoesDoLink key="o" />], (usaModulo(petshop, "banho_tosa") || usaCasa(petshop)) && ["Taxa de leva e traz", <OpcoesDoLevaTraz key="t" />], usaModulo(petshop, "banho_tosa") && ["Promoções em dias fracos", <Promocoes key="p" so="dias" />], usaModulo(petshop, "banho_tosa") && ["Promoção de aniversário do pet", <Promocoes key="pa" so="aniversario" />]]} />
        {usaCasa(petshop) && (
          <Grupo id="casa" titulo={nomeDaCasa(petshop)} icone={BedDouble} tom="lilas" salvarJunto
            cartoes={[[nomeDaCasa(petshop), <AjustesCrecheHotel key="a" />], [!usaModulo(petshop, "creche") ? "Opções do hotel" : !usaModulo(petshop, "hotel") ? "Opções da creche" : "Opções do hotel e da creche", <OpcoesHotel key="h" />], ["Cuidado com o tutor", <OpcoesCasa key="c" />], usaModulo(petshop, "creche") && ["Mais opções da creche", <OpcoesCreche key="cr" />]]} />
        )}
        {usaModulo(petshop, "loja") && <Grupo id="loja" titulo="Loja" icone={Store} tom="manteiga" cartoes={[["Opções da loja", <OpcoesDaLoja key="l" />]]} />}
        <Grupo id="dinheiro" titulo="Cobrança e fidelidade" icone={HandCoins} tom="menta"
          cartoes={[["Opções de cobrança", <OpcoesDeCobranca key="c" />], ["Taxas da maquininha", <TaxasDaMaquininha key="t" />], ["Papel do comprovante", <PapelDoComprovante key="pc" />], ["Fidelidade", <AjusteFidelidade key="f" />]]} />
        <Grupo id="negocio" titulo="O negócio" icone={Store} tom="rosa"
          cartoes={[["Dados", <Dados key="d" />], ["O que você usa", <OQueUsa key="o" />], ["Modo simples", <ModoSimples key="ms" />], ["Identidade do pet shop", <Identidade key="i" />], ["Sua loja aparece no Google?", <LojaNoGoogle key="g" />], ["Boletim do pet", <OpcoesDoBoletim key="b" />], (usaModulo(petshop, "banho_tosa") || usaCasa(petshop)) && ["Checklist de entrada", <OpcoesDaEntrada key="e" />]]} />
        <Grupo id="copia" titulo="Seus dados e a conta" icone={Archive} tom="ceu" largo
          cartoes={[["Baixar todos os dados", <CopiaSeguranca key="c" />], ["Encerrar e apagar a conta", <EncerrarConta key="e" />], ["Registro de pedidos de dados", <RegistroDeDados key="r" />], ["Acessos da equipe Maestro Pet", <AcessosDaEquipeMaestro key="m" />], ["Aviso de privacidade para os seus clientes", <AvisoParaOsClientes key="av" />]]} />
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
function Grupo({ id, titulo, icone, tom, abertoDeInicio, largo, salvarJunto, cartoes }: {
  id: string; titulo: string; icone: React.ComponentProps<typeof Tile>["icone"]; tom: React.ComponentProps<typeof Tile>["tom"];
  /** os cartões de opções do grupo salvam juntos, num botão só no pé do grupo (ver ajustes/salvar-junto.tsx) */
  abertoDeInicio?: boolean; largo?: boolean; salvarJunto?: boolean; cartoes: (false | [string, React.ReactNode])[];
}) {
  const lista = cartoes.filter((c): c is [string, React.ReactNode] => Boolean(c));
  const chave = `maestro:mp-grupo:${id}`;
  const [aberto, setAberto] = useState(Boolean(abertoDeInicio));
  const raiz = useRef<HTMLElement>(null);
  const mudar = (v: boolean) => { setAberto(v); guardarLembrado(chave, v ? "1" : "0"); };
  useEffect(() => {
    const lembrado = lerLembrado(chave);
    if (lembrado) setAberto(lembrado === "1");
    // atalho de outra tela para um cartão daqui de dentro (#opcoes-cobranca…): o cartão pode demorar um instante para aparecer
    let procurar = 0;
    const pelaAncora = () => {
      const ancora = window.location.hash.length > 1 ? decodeURIComponent(window.location.hash.slice(1)) : "";
      if (!ancora) return;
      let tentativas = 0;
      window.clearInterval(procurar);
      procurar = window.setInterval(() => {
        const alvo = raiz.current?.querySelector(`#${CSS.escape(ancora)}`);
        if (alvo) { setAberto(true); window.setTimeout(() => alvo.scrollIntoView({ block: "start" }), 80); }
        if (alvo || ++tentativas > 25) window.clearInterval(procurar);
      }, 150);
    };
    pelaAncora();
    window.addEventListener("hashchange", pelaAncora);
    const ir = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; cartao?: number }>).detail;
      if (d.id !== id) return;
      setAberto(true);
      guardarLembrado(chave, "1");
      window.setTimeout(() => (d.cartao == null ? raiz.current : raiz.current?.querySelector(`[data-cartao="${d.cartao}"]`) ?? raiz.current)?.scrollIntoView({ block: "start" }), 60);
    };
    window.addEventListener(EVENTO_GRUPO, ir);
    return () => { window.removeEventListener(EVENTO_GRUPO, ir); window.removeEventListener("hashchange", pelaAncora); window.clearInterval(procurar); };
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
        {salvarJunto
          ? <SalvarJunto aoTerMudanca={() => setAberto(true)}>{lista.map(([nome, cartao], i) => <div key={nome} data-cartao={i} className="g-mp-cartao">{cartao}</div>)}</SalvarJunto>
          : lista.map(([nome, cartao], i) => <div key={nome} data-cartao={i} className="g-mp-cartao">{cartao}</div>)}
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
  // endereço (opcional): aparece no link do cliente, na confirmação e nos comprovantes
  const [endereco, setEndereco] = useState(petshop.endereco ?? "");
  const [bairro, setBairro] = useState(petshop.bairro ?? "");
  const [complemento, setComplemento] = useState(petshop.complemento ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (somenteLeitura()) return;
    const n = limparNome(nome);
    const tel = soDigitos(telefone);
    if (n.length < 2) return setErro("Escreva o nome do pet shop.");
    if (tel && tel.length !== 10 && tel.length !== 11) return setErro("Confira o WhatsApp: DDD e número.");
    setErro(null);
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({
        nome: n.slice(0, 80), telefone: tel || null, cidade: cidade.trim() || null, uf: uf || null,
        endereco: limparNome(endereco).slice(0, 120) || null, bairro: limparNome(bairro).slice(0, 80) || null, complemento: limparNome(complemento).slice(0, 80) || null,
      }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      setTelefone(fmtTelefone(tel));
      avisar("Dados salvos.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <form className="g-card g-form" onSubmit={salvar}>
      <div className="g-mp-t"><Tile icone={Store} tom="menta" /><div><h2>Dados</h2><p className="g-muted g-p">Nome, contato e endereço.</p></div></div>
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
      <Campo rotulo="Endereço (rua e número)" dica="Opcional. Aparece no Link do cliente com o botão Abrir no mapa, na confirmação do pedido e nos comprovantes.">
        <input className="g-input" value={endereco} maxLength={120} autoComplete="street-address" placeholder="Rua das Flores, 120" onChange={(e) => setEndereco(e.target.value)} />
      </Campo>
      <div className="dupla" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <Campo rotulo="Bairro"><input className="g-input" value={bairro} maxLength={80} onChange={(e) => setBairro(e.target.value)} /></Campo>
        <Campo rotulo="Complemento"><input className="g-input" value={complemento} maxLength={80} placeholder="Loja 2, fundos" onChange={(e) => setComplemento(e.target.value)} /></Campo>
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
      // quem só faz hotel (ou creche) e liga o link pela primeira vez: o link já sai pedindo vaga, para não abrir sem opções
      const casa = valor && semServico && !petshop.link_creche && !petshop.link_hotel
        ? { ...(usaModulo(petshop, "hotel") ? { link_hotel: true } : {}), ...(usaModulo(petshop, "creche") ? { link_creche: true } : {}) } : {};
      ok(await sb.from("petshops").update({ link_ativo: valor, ...casa }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      const vagas = [("link_creche" in casa) && "creche", ("link_hotel" in casa) && "hotel"].filter(Boolean).join(" e ");
      avisar(valor ? (vagas ? `Link ligado, recebendo pedido de vaga de ${vagas}. Já pode mandar para os clientes.` : "Link ligado. Já pode mandar para os clientes.") : "Link desligado.");
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
        <div><h2>Link do cliente</h2><p className="g-muted g-p">{usaCasa(petshop) ? "O cliente pede horário ou vaga pelo celular. Você aceita ou recusa." : "O cliente pede o horário pelo celular. Você aceita ou recusa."}</p></div>
        <button type="button" role="switch" aria-checked={ativo} aria-label="Link do cliente" className="g-mp-chave" disabled={ligando} onClick={() => void ligar(!ativo)}><i /></button>
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
      {(["creche", "hotel"] as const).filter((a) => usaModulo(petshop, a)).map((a) => <HorarioDaArea key={a} area={a} />)}
    </section>
  );
}

/**
 * O horário da creche ou do hotel: a janela de chegada e de busca de cada dia. Igual ao pet shop (o padrão) ou próprio
 * ("domingo o pet shop fecha, mas a creche e o hotel funcionam"). Vale na Chamada, nos dias da creche, nas reservas e no link.
 */
function HorarioDaArea({ area }: { area: Area }) {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const coluna = area === "creche" ? "horario_creche" : "horario_hotel";
  const salvo = areaTemHorario(petshop, area) ? semAlmoco(lerHorario(petshop[coluna])) : null;
  const [valor, setValor] = useState<Horario | null>(salvo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const nome = area === "creche" ? "da creche" : "do hotel";
  const mudou = JSON.stringify(valor) !== JSON.stringify(salvo);

  async function salvar() {
    if (somenteLeitura()) return;
    const problema = valor ? erroDoHorarioProprio(valor) : null;
    setErro(problema);
    if (problema) return;
    setSalvando(true);
    try {
      // igual ao do pet shop vira "igual ao pet shop" (null): muda junto quando o pet shop mudar
      const guardar = valor && !mesmoHorario(valor, petshop.horario) ? valor : null;
      ok(await sb.from("petshops").update(area === "creche" ? { horario_creche: guardar } : { horario_hotel: guardar }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisarMudanca();
      setValor(guardar);
      avisar(guardar ? `Horário ${nome} salvo.` : `Pronto: ${area === "creche" ? "a creche" : "o hotel"} segue o horário do pet shop.`);
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <div className="g-mp-area g-pilha p" data-teste={`horario-${area}`}>
      <div>
        <h3>{area === "creche" ? "Creche" : "Hotel"}</h3>
        <p className="g-muted g-pp">{valor ? "Chegada e busca dos pets em cada dia." : `Recebe e entrega os pets no mesmo horário do pet shop.`}</p>
      </div>
      <HorarioProprio valor={valor} loja={petshop.horario} rotulo={`Horário ${nome}`} aberto="Recebe" teste={`horario-${area}-escolha`}
        ajuda={`Ex.: o pet shop fecha no domingo e ${area === "creche" ? "a creche" : "o hotel"} recebe das 8h às 18h.`}
        aoMudar={(h) => { setValor(h); setErro(null); }} />
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {mudou && <div><button className="g-btn verde" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : `Salvar horário ${nome}`}</button></div>}
    </div>
  );
}

/* ---------- serviços e preços ---------- */

function Servicos() {
  const { sb, servicos, recarregarBase, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState<Servico | "novo" | null>(null);
  const exemplos = [usaModulo(petshop, "banho_tosa") ? "banho, tosa" : "", usaModulo(petshop, "creche") ? "creche" : "", usaModulo(petshop, "hotel") ? "hotel" : ""].filter(Boolean).join(", ");
  const ativos = servicos.filter((s) => s.ativo);
  const inativos = servicos.filter((s) => !s.ativo);
  // com mais de uma área, o serviço que não é do banho e tosa diz de qual área é
  const variasAreas = areasDeServicoPara(petshop).length > 1;
  const abrir = (s: Servico | "novo") => { if (!somenteLeitura()) setEditando(s); };

  // serviços com a mesma cor na agenda: o primeiro de cada cor fica, os outros ganham uma cor livre (com um toque)
  const trocas = trocasDeCor(ativos);
  const [trocando, setTrocando] = useState(false);
  async function trocarCores() {
    if (somenteLeitura() || trocando) return;
    setTrocando(true);
    try {
      for (const t of trocas) await mudarServico(sb, petshop.id, t.id, { cor: t.para });
      await recarregarBase();
      avisarMudanca();
      avisar(trocas.length === 1 ? `Pronto: ${trocas[0].nome} ganhou uma cor só dela.` : `Pronto: ${emLista(trocas.map((t) => t.nome))} ganharam cores só deles.`);
    } catch (x) { avisarErro(x); } finally { setTrocando(false); }
  }

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
        <Vazio titulo="Nenhum serviço na lista" texto={!usaModulo(petshop, "banho_tosa") && usaCasa(petshop)
          // só creche e/ou hotel: a diária fica no cartão da casa e os planos em Mensalistas; aqui é só o que é cobrado à parte
          ? `Não precisa colocar nada aqui para ${nomeDaCasa(petshop) === "Hotel" ? "o hotel" : nomeDaCasa(petshop) === "Creche" ? "a creche" : "a creche e o hotel funcionarem"}${nomeDaCasa(petshop) === "Creche e hotel" ? "" : " funcionar"}: a diária e as vagas ficam no cartão ${nomeDaCasa(petshop)} desta tela${usaModulo(petshop, "creche") ? " e os planos, em Mensalistas" : ""}. Use esta lista só para o que vocês cobram à parte (ex.: banho, transporte).`
          : `Coloque o primeiro: ${exemplos ? `${exemplos}, ` : ""}o que vocês fazem.`} />
      ) : (
        <div className="g-mp-servicos">
          {ativos.map((s) => {
            const p = precos(s);
            return (
              <button key={s.id} type="button" className="g-mp-serv" style={{ "--cor": s.cor } as React.CSSProperties} onClick={() => abrir(s)}>
                <i className="g-mp-cor" aria-hidden><Scissors /></i>
                <span className="t">
                  <span className="g-mp-nome"><b>{s.nome}</b><span className="g-mp-tempo"><Clock aria-hidden />{duracao(s.duracao_min)}{variasAreas && areaDoServico(s.categoria) !== "banho_tosa" && ` · ${AREAS_DE_SERVICO.find((x) => x.id === areaDoServico(s.categoria))?.rotulo}`}{servicoTemHorario(s) && " · horário próprio"}</span></span>
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
      {trocas.length > 0 && (
        <div className="g-aviso g-mp-cores" role="status" style={{ marginTop: 14 }}>
          <span className="g-cresce">
            <b>{trocas.length === 1 ? "Dois serviços estão com a mesma cor na agenda" : "Alguns serviços estão com a mesma cor na agenda"}:</b>{" "}
            {trocas.map((t) => `${t.igualA} e ${t.nome}`).join("; ")}. Na agenda eles ficam iguais.
          </span>
          <button type="button" className="g-btn p sec" onClick={() => void trocarCores()} disabled={trocando}>{trocando ? "Trocando…" : "Dar uma cor para cada"}</button>
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
  // área do serviço: as mesmas do guia da primeira vez (só as que o pet shop usa; com uma só, a escolha não aparece)
  const areas = areasDeServicoPara(petshop, servico ? areaDoServico(servico.categoria) : null);
  const [area, setArea] = useState<AreaDoServico>(servico ? areaDoServico(servico.categoria) : areas.includes("banho_tosa") ? "banho_tosa" : areas[0]);
  const [minutos, setMinutos] = useState(String(servico?.duracao_min ?? 60));
  const [valores, setValores] = useState<Precos>({
    preco_p: servico?.preco_p ?? null, preco_m: servico?.preco_m ?? null, preco_g: servico?.preco_g ?? null, preco_gg: servico?.preco_gg ?? null,
  });
  const [porPorte, setPorPorte] = useState(() => comecaPorPorte(valores));
  const [errosPreco, setErrosPreco] = useState<Record<string, string>>({});
  // serviço novo já vem com uma cor que nenhum outro usa
  const [cor, setCor] = useState(servico?.cor ?? corLivre(servicos.filter((s) => s.ativo).map((s) => s.cor)));
  const [ativo, setAtivo] = useState(servico?.ativo ?? true);
  // horário próprio do serviço (null = igual ao pet shop): só para serviço de agenda (creche e hotel têm o horário deles)
  const [horario, setHorario] = useState<Horario | null>(() => (servicoTemHorario(servico) ? semAlmoco(lerHorario(servico!.horario)) : null));
  const daAgenda = area !== "creche" && area !== "hotel";
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // custo do material (só o dono lê e grava; em branco = não informado): vem do banco quando a folha abre
  const [custo, setCusto] = useState<{ texto: string; lido: string | null; mexeu: boolean }>({ texto: "", lido: servico ? null : "", mexeu: false });
  useEffect(() => {
    if (!servico) return;
    let vivo = true;
    void Promise.resolve(sb.rpc("servicos_custos", { p: petshop.id })).then((r) => {
      if (!vivo || r.error) return;
      const v = (r.data ?? []).find((x) => x.id === servico.id)?.custo_material;
      const t = v == null ? "" : valor2(Number(v));
      setCusto((c) => (c.mexeu ? { ...c, lido: t } : { texto: t, lido: t, mexeu: false }));
    });
    return () => { vivo = false; };
  }, [sb, petshop.id, servico]);
  const erroCusto = erroDoPreco(custo.texto);

  async function salvar() {
    const n = limparNome(nome);
    const min = Number(minutos);
    if (!n) return setErro("Dê um nome ao serviço.");
    if (!Number.isInteger(min) || min < 5 || min > 1440) return setErro("A duração fica entre 5 minutos e 24 horas.");
    if (Object.keys(errosPreco).length) return setErro("Confira os preços: use só números, sem valor negativo.");
    const precosDele = porPorte ? valores : umPrecoSo(valores);
    if (CAMPOS_PRECO.some((c) => (precosDele[c] ?? 0) < 0)) return setErro("O preço não pode ser negativo.");
    if (CAMPOS_PRECO.some((c) => (precosDele[c] ?? 0) > 99999)) return setErro("Confira os preços.");
    if (erroCusto) return setErro(`Confira o custo do material: ${erroCusto}.`);
    const erroHorario = daAgenda && horario ? erroDoHorarioProprio(horario) : null;
    if (erroHorario) return setErro(`Horário do serviço: ${erroHorario}`);
    setErro(null);
    setSalvando(true);
    const custoMaterial = custo.mexeu && custo.texto.trim() !== (custo.lido ?? "") ? { custo_material: custo.texto.trim() ? lerValor(custo.texto) : null } : {};
    // horário igual ao do pet shop vira "igual ao pet shop" (null): muda junto quando o pet shop mudar
    const horarioDele = daAgenda && horario && !mesmoHorario(horario, petshop.horario) ? horario : null;
    const mexeuNoHorario = JSON.stringify(horarioDele) !== JSON.stringify(servicoTemHorario(servico) ? servico!.horario : null);
    const campos = { nome: n.slice(0, 80), categoria: categoriaDaArea(area, servico?.categoria), duracao_min: min, cor, ativo, ...precosDele, ...custoMaterial, ...(mexeuNoHorario ? { horario: horarioDele } : {}) };
    try {
      if (servico) {
        await mudarServico(sb, petshop.id, servico.id, campos);
      } else {
        const ordem = servicos.reduce((m, s) => Math.max(m, s.ordem), 0) + 1;
        await inserirServico(sb, petshop.id, { ...campos, ordem });
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
        <EscolherArea areas={areas} valor={area} aoMudar={setArea} servico={nome.trim() || "serviço"} />
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
          <span>Preço</span>
          <PrecosDoServico servico={nome.trim() || "serviço"} valores={valores} porPorte={porPorte}
            aoTrocarModo={(v) => { setPorPorte(v); setErrosPreco({}); if (!v) setValores(umPrecoSo(valores)); }}
            aoMudar={(c, chave, ruim) => { setValores((a) => ({ ...a, ...c })); setErrosPreco((m) => { const x = { ...m }; if (ruim) x[chave] = ruim; else delete x[chave]; return x; }); }} />
          <small>{porPorte ? "P = pequeno, M = médio, G = grande, GG = gigante. Pode deixar em branco o porte que vocês não atendem." : "Pode deixar em branco e pôr o preço depois."}</small>
        </div>
        <label className="g-campo">
          <span>Custo do material por atendimento <span className="g-muted">(opcional)</span></span>
          <input className={`g-input g-tab${erroCusto ? " ruim" : ""}`} style={{ maxWidth: 160 }} inputMode="decimal" placeholder="R$" value={custo.texto} aria-invalid={!!erroCusto}
            disabled={custo.lido === null} aria-label={`Custo do material de ${nome.trim() || "serviço"}`}
            onChange={(e) => setCusto((c) => ({ ...c, texto: e.target.value, mexeu: true }))}
            onBlur={() => { if (!erroCusto && custo.texto.trim()) { const v = lerValor(custo.texto); if (v != null) setCusto((c) => ({ ...c, texto: valor2(v) })); } }} />
          <small>{erroCusto ? <span className="erro" role="alert">{erroCusto}</span> : "Shampoo, condicionador, perfume e o que mais gasta em cada atendimento. Entra em Relatórios, Quanto sobrou. Em branco, aparece “custo não informado”. Só você vê."}</small>
        </label>
        {daAgenda && (
          <div className="g-campo" data-teste="horario-do-servico">
            <span>Horário do serviço</span>
            <HorarioProprio valor={horario} loja={petshop.horario} rotulo="Horário do serviço" teste="horario-servico-escolha"
              ajuda="A agenda e o link do cliente só oferecem este serviço nesses dias e horas. Com outros serviços no mesmo horário, vale a parte em que todos funcionam."
              aoMudar={(h) => { setHorario(h); setErro(null); }} />
          </div>
        )}
        <div className="g-campo"><span>Cor na agenda</span><EscolherCor valor={cor} aoMudar={setCor} usadas={servicos.filter((s) => s.ativo && s.id !== servico?.id).map((s) => ({ nome: s.nome, cor: s.cor }))} /></div>
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
