"use client";

import { MaisAcoes } from "@/components/gestao/mais-acoes";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/gestao/link-depois";
import dynamic from "next/dynamic";
import { AlertTriangle, Cake, Cat, ChevronRight, Dog, Camera, Download, HandCoins, MessageCircle, PawPrint, Phone, PiggyBank, Plus, Search, Sparkles, Upload, UserPlus, UserSearch, Users } from "lucide-react";
import type { Cliente } from "@/lib/gestao/tipos";
import { brl, fmtTelefone, haQuanto, isoDia, semAcento, soDigitos, centavos } from "@/lib/gestao/util";
import { buscarVisitas, sumiu } from "@/lib/gestao/visitas";
import { useGestao } from "../contexto";
import { chaveDoRascunho, lerRascunho, RASCUNHO_PET_NOVO } from "../rascunho";
import { Anel, Kpi } from "../painel";
import { abrirAssistente, AvatarPessoa, AvatarPet, avisarMudanca, Esqueleto, useAdiantar, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { tutorLido } from "@/lib/gestao/reservado";
import { baixarCsv, buscarTudo, ESPECIES, linkPet, linkTutor, nomePorte, type PetDaLista } from "./comum";

// folhas que só abrem com um toque (caderno, planilha, pet novo, tutor novo, chamar de volta, aniversariantes) vêm à parte e baixam
// depois que a lista apareceu (useAdiantar): no celular com internet fraca, a lista não espera por elas
const carregarFormPet = () => import("../form-pet");
const carregarFormTutor = () => import("./form-tutor");
const carregarImportar = () => import("@/components/gestao/importar");
const FormPet = dynamic(carregarFormPet, { ssr: false });
const FormTutor = dynamic(carregarFormTutor, { ssr: false });
const Importar = dynamic(carregarImportar, { ssr: false });
const UltimaImportacao = dynamic(() => carregarImportar().then((m) => m.UltimaImportacao), { ssr: false });
const FotoCaderno = dynamic(() => import("@/components/gestao/caderno"), { ssr: false });
const ChamarDeVolta = dynamic(() => import("./chamar-de-volta"), { ssr: false });
const Aniversariantes = dynamic(() => import("./aniversariantes"), { ssr: false });
import { EtiquetaSaude } from "./saude";
import { buscarAlertasSaude } from "./saude-avisos";

type Filtro = "todos" | "sumidos30" | "sumidos60" | "semvisita" | "alerta" | "saude";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "sumidos30", rotulo: "Sumidos há 30 dias" },
  { id: "sumidos60", rotulo: "Sumidos há 60 dias" },
  { id: "semvisita", rotulo: "Ainda sem visita" },
  { id: "alerta", rotulo: "Com alerta" },
  { id: "saude", rotulo: "Saúde vencendo" },
];
const PASSO = 100;
/** Filtro da aba Tutores (o de dinheiro só aparece para quem mexe com dinheiro). */
type FiltroTutor = "todos" | "deve" | "credito";
/** O que cada tutor deve (contas a receber em aberto) e o crédito que tem, pela função `tutores_dinheiro`. */
type DinheiroDoTutor = { deve: number; vencido: number; contas: number; credito: number };

/** Cor da última visita: verde até 30 dias, amarelo até 60, vermelho depois. Sem visita fica cinza. */
export function tomDaVisita(quando: string | null | undefined, agora: number) {
  if (!quando) return "";
  const dias = Math.floor((agora - new Date(quando).getTime()) / 864e5);
  return dias <= 30 ? "verde" : dias <= 60 ? "amarelo" : "vermelho";
}

/** Etiqueta da espécie, com o bichinho desenhado. */
export function EtiquetaEspecie({ especie }: { especie: string }) {
  const Icone = especie === "gato" ? Cat : especie === "cao" ? Dog : PawPrint;
  return <span className={`g-cli-etq ${especie === "gato" ? "lilas" : especie === "cao" ? "pessego" : "ceu"}`}><Icone />{ESPECIES[especie] ?? "Outro"}</span>;
}

/** Indicador que também é botão: toca e a lista mostra aquele recorte. */
function KpiAcao({ ativo, aoTocar, children }: { ativo: boolean; aoTocar: () => void; children: React.ReactNode }) {
  return (
    <div className="g-cli-kpi-acao" role="button" tabIndex={0} aria-pressed={ativo} onClick={aoTocar}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoTocar(); } }}>
      {children}
    </div>
  );
}
const PEDIDO_EXEMPLO = "cadastra a Mel, shih-tzu pequena, da Dona Célia, telefone ";

export default function Lista({ aoAbrir, irPara }: {
  /** Chamado ao tocar numa linha (a tela guarda a rolagem antes de trocar). */
  aoAbrir: () => void;
  irPara: (url: string) => void;
}) {
  const { sb, petshop, posso, eu, vejoFinanceiro } = useGestao();
  useAdiantar(carregarFormPet, carregarFormTutor);
  // a lista inteira de clientes (baixar a planilha, trazer de planilha) é com o dono e o gerente; quem atende consulta um por um
  const listaInteira = eu.papel === "dono" || eu.papel === "gerente";
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [aba, setAba] = useState<"pets" | "tutores">("pets");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [filtroTutor, setFiltroTutor] = useState<FiltroTutor>("todos");
  // atalho vindo da tela Hoje: /gestao/app/clientes?filtro=sumidos30
  // e "quem me deve", por pessoa, vindo do Financeiro (A receber): /gestao/app/clientes?filtro=deve
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("filtro");
    if (f === "sumidos30") setFiltro("sumidos30");
    if (f === "deve") { setAba("tutores"); setFiltroTutor("deve"); }
  }, []);
  const [mostrar, setMostrar] = useState(PASSO);
  const [petNovo, setPetNovo] = useState(false);
  const [tutorNovo, setTutorNovo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [caderno, setCaderno] = useState(false);
  const [versaoImportacao, setVersaoImportacao] = useState(0);
  // atalho "Cadastrar o primeiro pet" (guia, tela Hoje, primeiros passos): /gestao/app/clientes?novo=1 já abre o formulário
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("novo") !== "1") return;
    p.delete("novo");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${p.size ? `?${p}` : ""}`);
    if (!somenteLeitura()) setPetNovo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // "Pet novo" que ficou pela metade (a página recarregou): reabre com o que estava escrito
  useEffect(() => {
    if (lerRascunho(chaveDoRascunho(petshop.id, eu.id, RASCUNHO_PET_NOVO)) && !somenteLeitura()) setPetNovo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petshop.id, eu.id]);
  const [chamando, setChamando] = useState(false);
  const [niverDoMes, setNiverDoMes] = useState(false);

  // e-mail e endereço do tutor são de quem tem a área Clientes
  const vejoContato = posso("clientes");
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [pets, clientes] = await Promise.all([
      // só o que a lista mostra (a ficha lê o resto quando abre); o tutor de cada pet vem da lista de tutores, não repetido em cada pet
      buscarTudo<PetDaLista>((de, ate) => sb.from("pets").select("id, cliente_id, nome, especie, raca, porte, alertas, foto").eq("petshop_id", petshop.id).eq("ativo", true)
        .order("nome").order("id").range(de, ate) as unknown as PromiseLike<{ data: PetDaLista[] | null; error: { message: string } | null }>),
      // só as colunas que a lista usa; o e-mail (busca e planilha) só para quem tem a área Clientes
      buscarTudo<Cliente>((de, ate) => sb.from("clientes").select(`id, nome, telefone${vejoContato ? ", email" : ""}`).eq("petshop_id", petshop.id).order("nome").order("id").range(de, ate) as unknown as PromiseLike<{ data: Cliente[] | null; error: { message: string } | null }>),
    ]);
    const tutores = clientes.map((c) => tutorLido(c));
    const porId = new Map(tutores.map((c) => [c.id, c]));
    return { pets: pets.map((p) => { const c = porId.get(p.cliente_id); return { ...p, clientes: c ? { id: c.id, nome: c.nome, telefone: c.telefone } : null }; }), clientes: tutores };
  // memória curta: voltar para Clientes pelo menu não baixa a lista inteira de novo (qualquer gravação faz buscar outra vez)
  }, [petshop.id, vejoContato], { guardar: "clientes-lista" });

  // Última visita de cada pet e se já tem algo marcado: a mesma conta da folha "Chamar de volta" (src/lib/gestao/visitas.ts).
  // Refaz quando a lista de pets muda.
  // As duas buscam junto com a lista (no celular com internet fraca, esperar a lista para pedir somava uma ida e volta)
  // e buscam de novo quando o número de pets muda depois disso.
  const totalPets = dados?.pets.length ?? null;
  const [versaoPets, setVersaoPets] = useState(0);
  const totalAntes = useRef<number | null>(null);
  useEffect(() => {
    if (totalPets === null) return;
    if (totalAntes.current !== null && totalAntes.current !== totalPets) setVersaoPets((v) => v + 1);
    totalAntes.current = totalPets;
  }, [totalPets]);
  const { dados: ultimos, erro: erroUltimos } = useDados(() => buscarVisitas(sb, petshop.id), [petshop.id, versaoPets], { guardar: "clientes-visitas" });

  // quem deve e quem tem crédito (só para quem mexe com dinheiro): uma linha por tutor, sem valores para a equipe
  const { dados: dinheiro } = useDados(async () => {
    if (!vejoFinanceiro) return null;
    const r = await sb.rpc("tutores_dinheiro", { p_petshop: petshop.id });
    if (r.error) return null;
    return new Map(((r.data ?? []) as ({ cliente_id: string } & DinheiroDoTutor)[]).map((x) => [x.cliente_id, { deve: Number(x.deve), vencido: Number(x.vencido), contas: x.contas, credito: Number(x.credito) }]));
  }, [petshop.id, vejoFinanceiro, versaoPets], { guardar: "clientes-dinheiro" });
  const totalDevido = useMemo(() => {
    let v = 0, n = 0, cred = 0, nc = 0;
    for (const x of dinheiro?.values() ?? []) { if (x.deve > 0) { v += x.deve; n++; } if (x.credito > 0) { cred += x.credito; nc++; } }
    return { valor: centavos(v), tutores: n, credito: centavos(cred), comCredito: nc };
  }, [dinheiro]);

  // Saúde: pets com cuidado vencido ou vencendo em 30 dias (consulta leve, só de leitura)
  const { dados: saude, erro: erroSaude } = useDados(() => buscarAlertasSaude(sb, petshop.id), [petshop.id]);

  const pets = useMemo(() => dados?.pets ?? [], [dados]);
  const clientes = useMemo(() => dados?.clientes ?? [], [dados]);
  const petsPorTutor = useMemo(() => {
    const m = new Map<string, PetDaLista[]>();
    for (const p of pets) m.set(p.cliente_id, [...(m.get(p.cliente_id) ?? []), p]);
    return m;
  }, [pets]);

  const alvo = semAcento(q);
  const alvoFone = soDigitos(q).length >= 3 ? soDigitos(q) : "";
  const bate = (...textos: (string | null | undefined)[]) => textos.some((t) => t && semAcento(t).includes(alvo));
  const bateFone = (fone: string | null | undefined) => !!alvoFone && soDigitos(fone).includes(alvoFone);

  const petsFiltrados = useMemo(() => {
    const agora = Date.now();
    // sumido é quem já veio e parou de vir; quem nunca veio fica em "Ainda sem visita"
    const sumido = (id: string, dias: number) => sumiu(ultimos?.get(id), dias, new Date(agora));
    return pets.filter((p) => {
      if (alvo && !bate(p.nome, p.clientes?.nome) && !bateFone(p.clientes?.telefone)) return false;
      if (filtro === "alerta") return !!p.alertas?.trim();
      if (filtro === "saude") return !!saude?.[p.id];
      if (filtro === "sumidos30") return sumido(p.id, 30);
      if (filtro === "sumidos60") return sumido(p.id, 60);
      if (filtro === "semvisita") return !!ultimos && !ultimos.get(p.id)?.ultima;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pets, ultimos, saude, alvo, alvoFone, filtro]);

  const tutoresFiltrados = useMemo(() => {
    const lista = clientes.filter((c) =>
      (!alvo || bate(c.nome, ...(petsPorTutor.get(c.id) ?? []).map((p) => p.nome)) || bateFone(c.telefone))
      && (filtroTutor === "todos" || (filtroTutor === "deve" ? (dinheiro?.get(c.id)?.deve ?? 0) > 0 : (dinheiro?.get(c.id)?.credito ?? 0) > 0)));
    // "Quem deve": quem deve mais (e em atraso) primeiro
    if (filtroTutor === "deve") lista.sort((a, b) => (dinheiro?.get(b.id)?.vencido ?? 0) - (dinheiro?.get(a.id)?.vencido ?? 0) || (dinheiro?.get(b.id)?.deve ?? 0) - (dinheiro?.get(a.id)?.deve ?? 0));
    return lista;
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [clientes, petsPorTutor, alvo, alvoFone, filtroTutor, dinheiro]);

  // números do topo: tudo sai do que a lista já carregou
  const resumo = useMemo(() => {
    const agora = Date.now();
    let caes = 0, gatos = 0, comAlerta = 0, sumidos = 0, semVisita = 0;
    for (const p of pets) {
      if (p.especie === "cao") caes++; else if (p.especie === "gato") gatos++;
      if (p.alertas?.trim()) comAlerta++;
      const v = ultimos?.get(p.id);
      if (!v?.ultima) semVisita++;
      else if (sumiu(v, 30, new Date(agora))) sumidos++;
    }
    let comVarios = 0;
    for (const dele of petsPorTutor.values()) if (dele.length > 1) comVarios++;
    return { caes, gatos, outros: pets.length - caes - gatos, comAlerta, sumidos, semVisita, comVarios, agora };
  }, [pets, ultimos, petsPorTutor]);
  const especies = [
    resumo.caes && (resumo.caes === 1 ? "1 cachorro" : `${resumo.caes} cachorros`),
    resumo.gatos && (resumo.gatos === 1 ? "1 gato" : `${resumo.gatos} gatos`),
    resumo.outros && (resumo.outros === 1 ? "1 outro" : `${resumo.outros} outros`),
  ].filter(Boolean).join(" · ");
  const verPets = (f: Filtro) => { setAba("pets"); setFiltro(f); setMostrar(PASSO); };

  function abrirPetNovo() { if (!somenteLeitura()) setPetNovo(true); }
  function exportar() {
    if (!clientes.length) { avisar("Ainda não há ninguém para exportar."); return; }
    try {
      baixarCsv(clientes, pets, `clientes-e-pets-${isoDia(new Date())}.csv`);
      avisar("Lista baixada.");
      // fica no Registro de pedidos de dados (quem exportou e quantas linhas, sem o conteúdo); banco antigo sem a função: segue
      void (sb.rpc as unknown as (f: string, a: Record<string, unknown>) => PromiseLike<unknown>)("lgpd_registrar_exportacao", { p_petshop: petshop.id, p_linhas: clientes.length }).then(() => undefined, () => undefined);
    } catch (e) { avisarErro(e); }
  }

  const esperandoUltimos = ((filtro === "sumidos30" || filtro === "sumidos60" || filtro === "semvisita") && !ultimos && !erroUltimos) || (filtro === "saude" && !saude && !erroSaude);
  const contagem = !dados ? " " : aba === "pets"
    ? (pets.length === 1 ? "1 pet" : `${pets.length} pets`) + (petsFiltrados.length !== pets.length ? ` · ${petsFiltrados.length} na lista` : "")
    : (clientes.length === 1 ? "1 tutor" : `${clientes.length} tutores`) + (tutoresFiltrados.length !== clientes.length ? ` · ${tutoresFiltrados.length} na lista` : "");

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Clientes e pets</h1>
          <p className="g-muted">{contagem}</p>
        </div>
        <div className="g-acoes">
          {posso("clientes") && <button className="g-btn sec" onClick={() => setChamando(true)} disabled={!dados}><MessageCircle />Chamar de volta</button>}
          {/* no celular: Chamar de volta, Pet novo e o resto dentro de "Mais" */}
          <MaisAcoes>
            {posso("clientes") && <button className="g-btn sec" onClick={() => setNiverDoMes(true)}><Cake />Aniversariantes do mês</button>}
            {listaInteira && <button className="g-btn sec" onClick={exportar} disabled={!dados}><Download />Exportar</button>}
            {listaInteira && <button className="g-btn sec" onClick={() => setImportando(true)}><Upload />Trazer de planilha</button>}
            {posso("clientes") && <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setCaderno(true); }}><Camera />Foto do caderno</button>}
          </MaisAcoes>
          <button className="g-btn pri" onClick={abrirPetNovo}><Plus />Pet novo</button>
        </div>
      </header>

      {listaInteira && <UltimaImportacao tipo="clientes" versao={versaoImportacao} aoAbrir={() => setImportando(true)} />}

      {dados && (pets.length > 0 || clientes.length > 0) && (
        <div className="g-grade kpis g-cli-kpis">
          <KpiAcao ativo={aba === "pets" && filtro === "todos"} aoTocar={() => verPets("todos")}>
            <Kpi icone={PawPrint} tom="pessego" rotulo="Pets" valor={pets.length} apoio={especies || "nenhum na lista"} />
          </KpiAcao>
          <KpiAcao ativo={aba === "tutores"} aoTocar={() => { setAba("tutores"); setMostrar(PASSO); }}>
            <Kpi icone={Users} tom="menta" rotulo="Tutores" valor={clientes.length}
              apoio={resumo.comVarios ? `${resumo.comVarios} com mais de um pet` : "um pet para cada"} />
          </KpiAcao>
          <KpiAcao ativo={aba === "pets" && filtro === "sumidos30"} aoTocar={() => verPets("sumidos30")}>
            <Kpi icone={UserSearch} tom="manteiga" rotulo="Sumidos há 30 dias" valor={ultimos ? resumo.sumidos : "–"}
              apoio={!ultimos ? (erroUltimos ? "não consegui calcular" : "calculando…") : resumo.sumidos === 1 ? "já veio e não tem nada marcado" : "já vieram e não têm nada marcado"}
              lado={ultimos && pets.length > 0 ? <Anel parte={resumo.sumidos / pets.length} tamanho={52} cor="#c2941a">{Math.round((resumo.sumidos / pets.length) * 100)}%</Anel> : undefined} />
          </KpiAcao>
          <KpiAcao ativo={aba === "pets" && filtro === "alerta"} aoTocar={() => verPets("alerta")}>
            <Kpi icone={AlertTriangle} tom="rosa" rotulo="Com alerta" valor={resumo.comAlerta} apoio="alergias, medos e cuidados" />
          </KpiAcao>
        </div>
      )}

      <div className="gc-filtros">
        <div className="g-fila entre">
          <div className="g-seg" role="group" aria-label="O que mostrar">
            <button aria-pressed={aba === "pets"} onClick={() => { setAba("pets"); setMostrar(PASSO); }}>Pets</button>
            <button aria-pressed={aba === "tutores"} onClick={() => { setAba("tutores"); setMostrar(PASSO); }}>Tutores</button>
          </div>
          {aba === "tutores" && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setTutorNovo(true); }}><UserPlus />Tutor novo</button>}
        </div>
        <div className="g-busca">
          <Search />
          <input className="g-input" type="search" placeholder="Nome do pet, do tutor ou telefone" aria-label="Buscar" value={q}
            onChange={(e) => { setQ(e.target.value); setMostrar(PASSO); }} />
        </div>
        {/* "quem me deve", como a página do caderno: um toque leva à lista por pessoa */}
        {aba === "pets" && dinheiro && totalDevido.tutores > 0 && (
          <div>
            <button type="button" className="g-btn fantasma p" onClick={() => { setAba("tutores"); setFiltroTutor("deve"); setMostrar(PASSO); }}>
              <HandCoins />Quem me deve: {totalDevido.tutores === 1 ? "1 pessoa" : `${totalDevido.tutores} pessoas`}, {brl(totalDevido.valor)}
            </button>
          </div>
        )}
        {aba === "tutores" && dinheiro && (totalDevido.tutores > 0 || totalDevido.comCredito > 0 || filtroTutor !== "todos") && (
          <div className="g-chips" role="group" aria-label="Filtro dos tutores">
            <button className="g-chip" aria-pressed={filtroTutor === "todos"} onClick={() => { setFiltroTutor("todos"); setMostrar(PASSO); }}>Todos</button>
            <button className="g-chip" aria-pressed={filtroTutor === "deve"} onClick={() => { setFiltroTutor("deve"); setMostrar(PASSO); }}><HandCoins />Quem deve{totalDevido.tutores ? ` (${totalDevido.tutores})` : ""}</button>
            {totalDevido.comCredito > 0 && <button className="g-chip" aria-pressed={filtroTutor === "credito"} onClick={() => { setFiltroTutor("credito"); setMostrar(PASSO); }}><PiggyBank />Com crédito ({totalDevido.comCredito})</button>}
          </div>
        )}
        {aba === "tutores" && filtroTutor === "deve" && dinheiro && (
          <p className="g-p" role="status"><b className="g-tab">{brl(totalDevido.valor)}</b> a receber de {totalDevido.tutores === 1 ? "1 tutor" : `${totalDevido.tutores} tutores`}, sem multa e juros. Para cobrar, abra a ficha de cada um ou {posso("caixa") ? <Link className="g-link" href="/gestao/app/caixa#contas-clientes">o Caixa, em Contas de clientes</Link> : "o Caixa, em Contas de clientes"}.</p>
        )}
        {aba === "tutores" && filtroTutor === "credito" && dinheiro && (
          <p className="g-p" role="status"><b className="g-tab">{brl(totalDevido.credito)}</b> de crédito com {totalDevido.comCredito === 1 ? "1 tutor" : `${totalDevido.comCredito} tutores`}: é dinheiro deles, que desconta da próxima conta.</p>
        )}
        {aba === "pets" && (
          <div className="g-chips" role="group" aria-label="Filtro">
            {FILTROS.map((f) => <button key={f.id} className="g-chip" aria-pressed={filtro === f.id} onClick={() => { setFiltro(f.id); setMostrar(PASSO); }}>{f.rotulo}{f.id === "semvisita" && ultimos && resumo.semVisita ? ` (${resumo.semVisita})` : ""}</button>)}
          </div>
        )}
      </div>

      {erro && !dados ? (
        <Vazio titulo="Não consegui carregar a lista" texto={erro}>
          <button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button>
        </Vazio>
      ) : carregando && !dados ? <Esqueleto linhas={6} />
      : aba === "pets" ? (
        !pets.length ? (
          <Vazio titulo="Nenhum pet por aqui ainda" texto="Cadastre o primeiro. Ou peça ao Mozart, do jeito que você fala." mozart="acenando">
            <button className="g-btn verde" onClick={abrirPetNovo}><Plus />Cadastrar o primeiro pet</button>
            <button className="g-btn sec" onClick={() => abrirAssistente(PEDIDO_EXEMPLO)}><Sparkles />Pedir ao Mozart</button>
          </Vazio>
        ) : esperandoUltimos ? <Esqueleto linhas={4} />
        : !petsFiltrados.length ? (
          <Vazio titulo={alvo ? "Não achei ninguém com esse nome" : filtro === "alerta" ? "Nenhum pet com alerta" : filtro === "saude" ? (erroSaude ? "Não consegui ver a saúde dos pets" : "Nenhum cuidado vencendo") : filtro === "semvisita" ? "Todo mundo já veio pelo menos uma vez" : "Ninguém sumido"}
            texto={alvo ? "Confira como está escrito ou cadastre um pet novo." : filtro === "alerta" ? "Alergias, medos e cuidados aparecem aqui quando estiverem na ficha."
              : filtro === "saude" ? (erroSaude ?? "Vacinas, vermífugo e antipulgas anotados na ficha aparecem aqui quando vencem ou faltam até 30 dias.") : filtro === "semvisita" ? "Aqui aparecem os pets cadastrados que ainda não tiveram atendimento nem estadia." : "Quem já veio continua vindo. Pet que nunca veio aparece em Ainda sem visita."}>
            {(alvo || filtro !== "todos") && <button className="g-btn sec" onClick={() => { setQ(""); setFiltro("todos"); }}>Ver todos</button>}
          </Vazio>
        ) : (
          <>
            {erroUltimos && <p className="g-erro" style={{ marginBottom: 10 }}>Não consegui ver quando cada pet veio pela última vez.</p>}
            <div className="g-cli-grade">
              {petsFiltrados.slice(0, mostrar).map((p) => {
                const ultima = ultimos?.get(p.id)?.ultima;
                return (
                  <Link key={p.id} href={linkPet(p.id)} scroll={false} className="g-cli-pet" onClick={aoAbrir}>
                    <span className="cab">
                      <AvatarPet pet={p} tamanho="g" />
                      <span className="t">
                        <b>{p.nome}</b>
                        <span>{[p.clientes?.nome ?? "Sem tutor", p.raca].filter(Boolean).join(" · ")}</span>
                      </span>
                      <ChevronRight className="seta" aria-hidden />
                    </span>
                    <span className="pe">
                      <span className="g-cli-etqs">
                        <EtiquetaEspecie especie={p.especie} />
                        {p.porte && <span className="g-cli-etq">{nomePorte(p.porte)}</span>}
                        {p.alertas?.trim() && <span className="g-cli-etq rosa"><AlertTriangle aria-hidden />Alerta</span>}
                        <EtiquetaSaude resumo={saude?.[p.id]} />
                      </span>
                      {ultimos && <span className={`g-cli-visita ${tomDaVisita(ultima, resumo.agora)}`}><i aria-hidden />{ultima ? haQuanto(ultima) : "ainda não veio"}</span>}
                    </span>
                  </Link>
                );
              })}
            </div>
            {petsFiltrados.length > mostrar && <div className="gc-fim"><button className="g-btn sec" onClick={() => setMostrar(mostrar + PASSO)}>Mostrar mais</button></div>}
          </>
        )
      ) : !clientes.length ? (
        <Vazio titulo="Nenhum tutor por aqui ainda" texto="O tutor entra junto quando você cadastra o primeiro pet." mozart="acenando">
          <button className="g-btn verde" onClick={abrirPetNovo}><Plus />Cadastrar o primeiro pet</button>
          <button className="g-btn sec" onClick={() => abrirAssistente(PEDIDO_EXEMPLO)}><Sparkles />Pedir ao Mozart</button>
        </Vazio>
      ) : !tutoresFiltrados.length ? (
        filtroTutor !== "todos" && !alvo ? (
          <Vazio titulo={filtroTutor === "deve" ? "Ninguém está devendo" : "Ninguém com crédito"} texto={filtroTutor === "deve" ? "Conta que o cliente ficou de pagar depois aparece aqui, com o nome dele." : "Crédito nasce quando o tutor paga a mais (por exemplo, o pet sai antes do fim de uma estadia paga adiantado)."}>
            <button className="g-btn sec" onClick={() => setFiltroTutor("todos")}>Ver todos</button>
          </Vazio>
        ) : (
        <Vazio titulo="Não achei ninguém com esse nome" texto="Confira como está escrito ou busque pelo telefone.">
          <button className="g-btn sec" onClick={() => { setQ(""); setFiltroTutor("todos"); }}>Ver todos</button>
        </Vazio>
        )
      ) : (
        <>
          <div className="g-cli-grade">
            {tutoresFiltrados.slice(0, mostrar).map((c) => {
              const dele = petsPorTutor.get(c.id) ?? [];
              const din = dinheiro?.get(c.id);
              return (
                <Link key={c.id} href={linkTutor(c.id)} scroll={false} className="g-cli-pet tutor" onClick={aoAbrir}>
                  <span className="cab">
                    <AvatarPessoa nome={c.nome} tamanho="g" />
                    <span className="t">
                      <b>{c.nome}</b>
                      <span>{fmtTelefone(c.telefone) ? <><Phone aria-hidden />{fmtTelefone(c.telefone)}</> : "Sem telefone"}</span>
                    </span>
                    <ChevronRight className="seta" aria-hidden />
                  </span>
                  <span className="pe">
                    {dele.length ? (
                      <span className="g-cli-turma">
                        <span className="fotos">{dele.slice(0, 4).map((p) => <AvatarPet key={p.id} pet={p} tamanho="p" />)}</span>
                        <span className="nomes">{dele.map((p) => p.nome).join(", ")}</span>
                      </span>
                    ) : <span className="g-pp g-muted">Sem pet na lista</span>}
                    <span className="g-cli-etqs">
                      {din && din.deve > 0 && <span className={`g-cli-etq ${din.vencido > 0 ? "rosa" : "manteiga"}`} title={din.vencido > 0 ? `${brl(din.vencido)} em atraso` : "a vencer"}><HandCoins aria-hidden />Deve {brl(din.deve)}{din.vencido > 0 ? " · atrasado" : ""}</span>}
                      {din && din.credito > 0 && <span className="g-cli-etq menta"><PiggyBank aria-hidden />Crédito {brl(din.credito)}</span>}
                      <span className="g-cli-etq">{dele.length === 1 ? "1 pet" : `${dele.length} pets`}</span>
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
          {tutoresFiltrados.length > mostrar && <div className="gc-fim"><button className="g-btn sec" onClick={() => setMostrar(mostrar + PASSO)}>Mostrar mais</button></div>}
        </>
      )}

      {chamando && <ChamarDeVolta aoFechar={() => setChamando(false)} />}
      {niverDoMes && <Aniversariantes aoFechar={() => setNiverDoMes(false)} />}
      {caderno && <FotoCaderno tipoInicial="clientes" aoFechar={() => setCaderno(false)} aoTerminar={() => void recarregar()} />}
      {importando && listaInteira && <Importar tipo="clientes" aoFechar={() => { setImportando(false); setVersaoImportacao((v) => v + 1); }} aoTerminar={() => void recarregar()} />}
      {petNovo && (
        <FormPet nomeInicial={aba === "pets" && petsFiltrados.length === 0 ? q.trim() : undefined} aoFechar={() => setPetNovo(false)}
          aoSalvar={(p) => { setPetNovo(false); avisarMudanca(); aoAbrir(); irPara(linkPet(p.id)); }} />
      )}
      {tutorNovo && (
        <FormTutor aoFechar={() => setTutorNovo(false)}
          aoSalvar={(c) => { setTutorNovo(false); avisarMudanca(); aoAbrir(); irPara(linkTutor(c.id)); }} />
      )}
    </>
  );
}
