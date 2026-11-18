"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, ClipboardCheck, Copy, Eraser, ImagePlus, Loader2, MessageCircle, PenLine, Printer, RotateCcw, X } from "lucide-react";
import {
  abreSozinha, assinarParaOLink, COLS_ENTRADA, entradaPelosAtalhos, descartarArquivo, ehIdoso, enderecoDaEntrada, enderecosDosArquivos, enviarAssinatura,
  faxinaDaEntrada, prepararFotoDaEntrada, subirFotoDaEntrada, LESOES, linkValendo, MAX_FOTOS_ENTRADA, mensagemDaEntrada, PERTENCES, pertencesDe, resumoDaEntrada as resumo, TEMPERAMENTOS,
  termoComPet, termoDoPetshop, textoDevolver, type Entrada, type FotoDaEntrada,
} from "@/lib/gestao/entrada";
import type { Banco } from "@/lib/gestao/supabase";
import { dataCurta, hora, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { CampoComVoz } from "../ditado";
import { avisarMudanca, Esqueleto, Folha, mensagemDeErro, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "../boletim/boletim.css";
import "./entrada.css";

/**
 * Checklist de entrada com termo. Na chegada (banho e tosa "Chegou", check-in da creche e do hotel), a equipe confere como o pet
 * chegou e pede o aceite do tutor: assinatura com o dedo no aparelho da loja, ou o link pelo WhatsApp. Sempre dá para pular.
 * Na saída, os pertences voltam a aparecer ("Devolver: coleira, caminha") com a caixa de devolvido.
 */
export type VisitaDaEntrada = {
  tipo: "banho" | "creche" | "hotel";
  agendamentoId?: string; estadiaId?: string;
  petId: string; pet: string;
  tutor: { nome: string | null; telefone: string | null } | null;
  /** os atalhos "Como o pet chegou" do horário: entram marcados na conferência que ainda não foi salva */
  atalhos?: Record<string, boolean> | null;
};
const areaDe = (v: Pick<VisitaDaEntrada, "tipo">) => (v.tipo === "banho" ? "agenda" : "creche_hotel");

// Vários cartões na mesma tela pedem ao mesmo tempo: junta tudo numa consulta só por campo.
type Campo = "agendamento_id" | "estadia_id";
const fila: Record<Campo, Map<string, ((e: Entrada | null) => void)[]>> = { agendamento_id: new Map(), estadia_id: new Map() };
let marcado = false;
function buscar(sb: Banco, petshopId: string, campo: Campo, id: string): Promise<Entrada | null> {
  return new Promise((resolver) => {
    fila[campo].set(id, [...(fila[campo].get(id) ?? []), resolver]);
    if (marcado) return;
    marcado = true;
    setTimeout(() => {
      marcado = false;
      for (const c of ["agendamento_id", "estadia_id"] as Campo[]) {
        const lote = new Map(fila[c]);
        fila[c].clear();
        if (!lote.size) continue;
        void sb.from("entradas").select(COLS_ENTRADA).eq("petshop_id", petshopId).in(c, [...lote.keys()]).then(({ data }) => {
          const achadas = new Map(((data ?? []) as unknown as Entrada[]).map((e) => [String(e[c]), e]));
          for (const [chave, quem] of lote) for (const f of quem) f(achadas.get(chave) ?? null);
        });
      }
    }, 0);
  });
}

/** A entrada de uma visita (null: ainda não conferida; undefined: carregando). Busca de novo quando algo muda. */
export function useEntrada(v: Pick<VisitaDaEntrada, "agendamentoId" | "estadiaId" | "tipo">) {
  const { sb, petshop, posso } = useGestao();
  const id = v.agendamentoId ?? v.estadiaId ?? "";
  const campo: Campo = v.agendamentoId ? "agendamento_id" : "estadia_id";
  const pode = posso(areaDe(v));
  // dados null = carregando; { e: null } = ainda não conferida
  const { dados, recarregar } = useDados(async () => ({ e: pode && id ? await buscar(sb, petshop.id, campo, id) : null }), [petshop.id, campo, id, pode]);
  return { entrada: dados ? dados.e : undefined, recarregar };
}

/** A faxina dos arquivos da entrada, quando alguém da agenda ou da creche e do hotel abre a tela (no máximo a cada 12 horas). */
function useFaxinaDaEntrada() {
  const { sb, petshop, posso, liberado } = useGestao();
  const pode = posso("agenda") || posso("creche_hotel");
  useEffect(() => {
    if (!pode || !liberado) return;
    const chave = `g-faxina-entrada:${petshop.id}`;
    try { if (Date.now() - Number(localStorage.getItem(chave) ?? 0) < 12 * 3600e3) return; localStorage.setItem(chave, String(Date.now())); } catch { /* roda mesmo assim */ }
    void faxinaDaEntrada(sb, petshop.id).catch(() => { try { localStorage.removeItem(chave); } catch { /* nada */ } });
  }, [sb, petshop.id, pode, liberado]);
}

/**
 * No horário e no cartão da estadia: "Entrada conferida ✓ · aceite do tutor ✓/pendente" com o botão para abrir, ou
 * "Conferir a entrada". `saida`: mostra os pertences para devolver, com a caixa de devolvido.
 */
export function EntradaNaVisita({ visita, saida, mostrarSemEntrada = true }: { visita: VisitaDaEntrada; saida?: boolean; mostrarSemEntrada?: boolean }) {
  const { posso } = useGestao();
  const { entrada } = useEntrada(visita);
  const [aberta, setAberta] = useState(false);
  useFaxinaDaEntrada();
  if (!posso(areaDe(visita)) || entrada === undefined) return null;
  if (!entrada && !mostrarSemEntrada) return null;
  return (
    <div className="g-ent-linha" data-teste="entrada-na-visita">
      {entrada ? (
        <button type="button" className="g-ent-estado" onClick={() => setAberta(true)} aria-label={`Entrada de ${visita.pet}: abrir`}>
          <ClipboardCheck aria-hidden />
          <span>Entrada conferida <b className="ok">✓</b> · aceite do tutor {entrada.aceito_em ? <b className="ok">✓</b> : <b className="pend">pendente</b>}</span>
        </button>
      ) : (
        <button type="button" className="g-btn fantasma p" onClick={() => setAberta(true)}><ClipboardCheck />Conferir a entrada</button>
      )}
      {entrada && (saida || pertencesDe(entrada).length > 0) && <DevolverPertences entrada={entrada} destaque={saida} />}
      {aberta && <FolhaEntrada visita={visita} aoFechar={() => setAberta(false)} />}
    </div>
  );
}

/** "Devolver: coleira, caminha" com a caixa de devolvido (na saída e no fim do atendimento). */
export function DevolverPertences({ entrada, destaque }: { entrada: Entrada; destaque?: boolean }) {
  const { sb } = useGestao();
  const { avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [devolvido, setDevolvido] = useState(entrada.devolvido_em);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => setDevolvido(entrada.devolvido_em), [entrada.devolvido_em]);
  const texto = textoDevolver(entrada);
  if (!texto) return null;
  async function marcar(sim: boolean) {
    if (ocupado || somenteLeitura()) return;
    setOcupado(true);
    const antes = devolvido;
    // a caixa muda na hora; se o banco recusar, volta
    setDevolvido(sim ? new Date().toISOString() : null);
    try {
      const r = ok(await sb.rpc("entrada_devolver", { p_id: entrada.id, p_devolvido: sim })) as string | null;
      setDevolvido(r ?? null);
      avisarMudanca();
    } catch (e) { setDevolvido(antes); avisarErro(e); } finally { setOcupado(false); }
  }
  return (
    <label className={`g-ent-devolver${devolvido ? " ok" : ""}${destaque ? " destaque" : ""}`} data-teste="devolver-pertences">
      <input type="checkbox" checked={Boolean(devolvido)} disabled={ocupado} onChange={(e) => void marcar(e.target.checked)} />
      <span><b>{texto}</b>{devolvido ? <small>Devolvido às {hora(devolvido)}{dataCurta(new Date(devolvido)) !== dataCurta(new Date()) ? ` de ${dataCurta(new Date(devolvido))}` : ""}</small> : <small>Marque quando entregar ao tutor</small>}</span>
    </label>
  );
}

/** Na saída: os pertences de uma visita para devolver (nada aparece se não deixou nada). */
export function PertencesNaSaida({ visita }: { visita: Pick<VisitaDaEntrada, "agendamentoId" | "estadiaId" | "tipo"> }) {
  const { entrada } = useEntrada(visita);
  if (!entrada || !pertencesDe(entrada).length) return null;
  return <DevolverPertences entrada={entrada} destaque />;
}

/**
 * Abre a folha sozinha depois do "Chegou" / check-in, se o pet shop pede (todos, ou só pet idoso) e a visita ainda não tem
 * entrada. Sem pedir: não mostra nada e fecha.
 */
export function EntradaNaChegada({ visita, aoFechar }: { visita: VisitaDaEntrada; aoFechar: () => void }) {
  const { sb, petshop, posso } = useGestao();
  const [abrir, setAbrir] = useState<boolean | null>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    let vivo = true;
    if (!posso(areaDe(visita))) { fechar.current(); return; }
    void (async () => {
      const [p, e] = await Promise.all([
        sb.from("pets").select("nascimento").eq("id", visita.petId).maybeSingle(),
        sb.from("entradas").select("id").eq("petshop_id", petshop.id).eq(visita.agendamentoId ? "agendamento_id" : "estadia_id", visita.agendamentoId ?? visita.estadiaId ?? "").maybeSingle(),
      ]);
      if (!vivo) return;
      const sim = !e.data && abreSozinha(petshop, p.data?.nascimento ?? null);
      if (sim) setAbrir(true); else fechar.current();
    })().catch(() => { if (vivo) fechar.current(); });
    return () => { vivo = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, petshop.id, visita.petId, visita.agendamentoId, visita.estadiaId]);
  if (!abrir) return null;
  return <FolhaEntrada visita={visita} automatica aoFechar={aoFechar} />;
}

type Etapa = "conferir" | "aceite" | "assinar" | "link";

/** A folha: conferir como chegou → aceite do tutor (assinar aqui ou mandar o link). */
export function FolhaEntrada({ visita: v, aoFechar, automatica }: { visita: VisitaDaEntrada; aoFechar: () => void; automatica?: boolean }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  const { dados, carregando, erro } = useDados(async () => {
    const [e, p] = await Promise.all([
      sb.from("entradas").select(COLS_ENTRADA).eq("petshop_id", petshop.id).eq(v.agendamentoId ? "agendamento_id" : "estadia_id", v.agendamentoId ?? v.estadiaId ?? "").maybeSingle(),
      sb.from("pets").select("alertas, nascimento").eq("id", v.petId).maybeSingle(),
    ]);
    const g = ok(e) as unknown as Entrada | null;
    const urls = g ? await enderecosDosArquivos(sb, [...g.fotos, ...(g.aceite_assinatura ? [g.aceite_assinatura] : [])]) : new Map<string, string>();
    return { guardada: g, alertas: p.data?.alertas ?? null, nascimento: p.data?.nascimento ?? null, urls };
  }, [petshop.id, v.agendamentoId, v.estadiaId, v.petId]);

  const [pronto, setPronto] = useState(false);
  const [guardada, setGuardada] = useState<Entrada | null>(null);
  const [etapa, setEtapa] = useState<Etapa>("conferir");
  const [temperamento, setTemperamento] = useState<string[]>([]);
  const [cuidados, setCuidados] = useState("");
  const [lesoes, setLesoes] = useState<string[]>([]);
  const [lesoesObs, setLesoesObs] = useState("");
  const [idoso, setIdoso] = useState(false);
  const [pertences, setPertences] = useState<string[]>([]);
  const [outros, setOutros] = useState("");
  const [obs, setObs] = useState("");
  const [fotos, setFotosNaTela] = useState<FotoDaEntrada[]>([]);
  // a lista de fotos também num ref, atualizado na hora: o salvar espera as fotos que estão subindo e lê o que ficou
  const listaDeFotos = useRef<FotoDaEntrada[]>([]);
  const setFotos = (f: FotoDaEntrada[] | ((l: FotoDaEntrada[]) => FotoDaEntrada[])) => {
    listaDeFotos.current = typeof f === "function" ? f(listaDeFotos.current) : f;
    setFotosNaTela(listaDeFotos.current);
  };
  // as fotos que estão subindo agora (por caminho provisório): o salvar espera por elas em vez de mandar subir de novo
  const emVoo = useRef(new Map<string, Promise<boolean>>());
  // o que deu errado ao salvar ou ao subir uma foto fica escrito na folha (o aviso rápido some e pode passar despercebido)
  const [aviso, setAviso] = useState<string | null>(null);
  const [mudou, setMudou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const novas = useRef(new Set<string>());

  useEffect(() => {
    if (!dados || pronto) return;
    const g = dados.guardada;
    setGuardada(g);
    if (g) {
      setTemperamento(g.temperamento); setCuidados(g.cuidados ?? ""); setLesoes(g.lesoes); setLesoesObs(g.lesoes_obs ?? "");
      setIdoso(g.idoso_doente); setPertences(g.pertences); setOutros(g.pertences_outros ?? ""); setObs(g.obs ?? "");
      setFotos(g.fotos.map((c) => ({ caminho: c, url: dados.urls.get(c) ?? "" })));
      setAssinatura(g.aceite_assinatura ? dados.urls.get(g.aceite_assinatura) ?? null : null);
    } else {
      // pré-preenchido pela ficha do pet: os Cuidados e alertas e a idade
      setCuidados((dados.alertas ?? "").slice(0, 600));
      setIdoso(ehIdoso(dados.nascimento));
      // o que o tosador já tocou em "Como o pet chegou" entra marcado aqui (uma lista só)
      const dosAtalhos = entradaPelosAtalhos(v.atalhos);
      if (dosAtalhos.temperamento.length || dosAtalhos.lesoes.length || dosAtalhos.lesoesObs) {
        setTemperamento(dosAtalhos.temperamento); setLesoes(dosAtalhos.lesoes); setLesoesObs(dosAtalhos.lesoesObs); setMudou(true);
      }
    }
    setPronto(true);
  }, [dados, pronto]);

  // fotos que subiram e não foram salvas saem do bucket quando a folha fecha
  const fotosAgora = useRef(fotos);
  fotosAgora.current = fotos;
  useEffect(() => () => {
    for (const c of novas.current) descartarArquivo(sb, c);
    for (const f of fotosAgora.current) if (f.url.startsWith("blob:")) URL.revokeObjectURL(f.url);
  }, [sb]);

  const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  const mexer = <T,>(f: (x: T) => void) => (x: T) => { f(x); setMudou(true); };

  async function escolher(ev: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!arquivos.length || somenteLeitura()) return;
    const vao = arquivos.slice(0, Math.max(0, MAX_FOTOS_ENTRADA - listaDeFotos.current.length));
    if (!vao.length) return avisarErro(new Error(`Até ${MAX_FOTOS_ENTRADA} fotos na entrada. Tire uma para pôr outra.`));
    for (const f of vao) {
      let blob: Blob;
      try { blob = await prepararFotoDaEntrada(f); } catch (e) { avisarErro(e); continue; }
      // a foto aparece na hora (prévia do aparelho) e sobe em seguida; se não subir, continua na folha para tentar de novo
      const provisoria: FotoDaEntrada = { caminho: `pendente:${crypto.randomUUID()}`, url: URL.createObjectURL(blob), pendente: { arquivo: blob, estado: "falhou" } };
      setFotos((l) => [...l, provisoria]);
      setMudou(true);
      void subir(provisoria);
    }
  }
  /** Sobe (ou tenta de novo) uma foto que ainda não subiu. Devolve se subiu. */
  function subir(f: FotoDaEntrada): Promise<boolean> {
    const ja = emVoo.current.get(f.caminho);
    if (ja) return ja;
    if (!f.pendente) return Promise.resolve(true);
    const arquivo = f.pendente.arquivo;
    setFotos((l) => l.map((x) => (x.caminho === f.caminho ? { ...x, pendente: { arquivo, estado: "subindo" } } : x)));
    const p = (async () => {
      try {
        const caminho = await subirFotoDaEntrada(sb, petshop.id, arquivo);
        // tirada da folha enquanto subia: o arquivo sai do bucket
        if (!listaDeFotos.current.some((x) => x.caminho === f.caminho)) { descartarArquivo(sb, caminho); return false; }
        novas.current.add(caminho);
        setFotos((l) => l.map((x) => (x.caminho === f.caminho ? { caminho, url: x.url } : x)));
        setMudou(true);
        return true;
      } catch (e) {
        const erro = e instanceof Error ? e.message : "A foto não subiu.";
        setFotos((l) => l.map((x) => (x.caminho === f.caminho ? { ...x, pendente: { arquivo, estado: "falhou", erro } } : x)));
        return false;
      } finally { emVoo.current.delete(f.caminho); }
    })();
    emVoo.current.set(f.caminho, p);
    return p;
  }
  function tirarFoto(f: FotoDaEntrada) {
    setFotos((l) => l.filter((x) => x.caminho !== f.caminho));
    if (novas.current.has(f.caminho)) { novas.current.delete(f.caminho); descartarArquivo(sb, f.caminho); }
    if (f.pendente && f.url.startsWith("blob:")) URL.revokeObjectURL(f.url);
    setMudou(true);
  }

  const termo = guardada?.aceito_em ? guardada.termo : termoComPet(termoDoPetshop(petshop), v.pet);

  /**
   * Grava (sem mudança desde a última gravação, só devolve a guardada). A entrada não depende das fotos: grava com as que já
   * subiram, depois espera (ou tenta de novo) as que faltam e grava de novo com elas. Foto que não subiu fica na folha, com aviso.
   */
  async function salvar(): Promise<Entrada | null> {
    if (somenteLeitura()) return null;
    if (guardada && !mudou && guardada.termo === termo && !listaDeFotos.current.some((f) => f.pendente)) return guardada;
    setSalvando(true);
    setAviso(null);
    const gravar = async (id: string | null) => {
      const r = ok(await sb.rpc("entrada_salvar", {
        p_petshop: petshop.id, p_id: id ?? (null as unknown as string), p_pet: v.petId,
        p_agendamento: v.agendamentoId ?? (null as unknown as string), p_estadia: v.estadiaId ?? (null as unknown as string),
        p_dados: { temperamento, cuidados, lesoes, lesoes_obs: lesoesObs, idoso_doente: idoso, pertences, pertences_outros: outros, obs, termo },
        p_fotos: listaDeFotos.current.filter((f) => !f.pendente).map((f) => f.caminho),
      })) as { id: string; aceite_zerado: boolean };
      novas.current.clear();
      return r;
    };
    let salvou: { id: string; aceite_zerado: boolean } | null = null;
    try {
      salvou = await gravar(guardada?.id ?? null);
      // as fotos que ainda não subiram: espera as que estão subindo e tenta de novo as que falharam; as que subirem entram na entrada
      const faltam = listaDeFotos.current.filter((f) => f.pendente);
      if (faltam.length) {
        const subiram = (await Promise.all(faltam.map((f) => subir(f)))).some(Boolean);
        if (subiram) salvou = { ...(await gravar(salvou.id)), aceite_zerado: salvou.aceite_zerado };
      }
      const e = ok(await sb.from("entradas").select(COLS_ENTRADA).eq("id", salvou.id).single()) as unknown as Entrada;
      setGuardada(e);
      if (!e.aceite_assinatura) setAssinatura(null);
      const naoSubiram = listaDeFotos.current.filter((f) => f.pendente).length;
      setMudou(naoSubiram > 0);
      avisarMudanca();
      if (naoSubiram > 0) {
        // salvou sem a foto: a pessoa decide (tentar de novo ou tirar), nada some sozinho
        const t = `A entrada foi salva, mas ${naoSubiram === 1 ? "1 foto não subiu" : `${naoSubiram} fotos não subiram`} (internet fraca ou servidor lento). ${naoSubiram === 1 ? "Ela continua" : "Elas continuam"} na folha: toque em Tentar de novo, ou tire a foto para seguir sem ela.`;
        setAviso(t); avisarErro(new Error(t));
        return null;
      }
      avisar(salvou.aceite_zerado ? "Entrada atualizada. Como mudou, o tutor precisa aceitar de novo." : guardada ? "Entrada atualizada." : "Entrada conferida.");
      return e;
    } catch (e) {
      const t = `${salvou ? "A entrada foi salva, mas não terminou" : "A entrada não foi salva"}: ${mensagemDeErro(e)} Nada se perdeu: as marcações e as fotos continuam aqui. Toque de novo para tentar.`;
      setAviso(t); avisarErro(new Error(t));
      return null;
    } finally { setSalvando(false); }
  }

  async function seguirParaAceite() {
    const e = await salvar();
    if (e) setEtapa(e.aceito_em ? "conferir" : "aceite");
  }

  const titulo = `Entrada · ${v.pet}`;
  const aceito = guardada?.aceito_em && !mudou ? guardada : null;

  if (etapa === "assinar" && guardada) {
    return <FolhaAssinar entrada={guardada} termo={termo} pet={v.pet} tutor={v.tutor?.nome ?? ""} aoVoltar={() => setEtapa("aceite")} aoFechar={aoFechar}
      aoAssinar={(e, url) => { setGuardada(e); setAssinatura(url); setEtapa("conferir"); }} />;
  }
  if (etapa === "link" && guardada) {
    return <FolhaLink entrada={guardada} visita={v} aoVoltar={() => setEtapa("aceite")} aoFechar={aoFechar} aoMudar={setGuardada} />;
  }
  if (etapa === "aceite" && guardada) {
    return (
      <Folha titulo={`Aceite do tutor · ${v.pet}`} aoFechar={aoFechar} rodape={
        <>
          <button type="button" className="g-btn fantasma" onClick={() => setEtapa("conferir")}>Voltar</button>
          <button type="button" className="g-btn fantasma" onClick={aoFechar}>Depois</button>
        </>
      }>
        <div className="g-pilha g-ent">
          <p className="g-p">Como {v.tutor?.nome ? v.tutor.nome.split(" ")[0] : "o tutor"} vai dar o ok?</p>
          <div className="g-ent-escolha">
            <button type="button" className="g-ent-op" onClick={() => setEtapa("assinar")}>
              <PenLine aria-hidden /><b>Assinar aqui no aparelho</b><small>O tutor lê o texto e assina com o dedo.</small>
            </button>
            <button type="button" className="g-ent-op" onClick={() => setEtapa("link")}>
              <MessageCircle aria-hidden /><b>Mandar o link pelo WhatsApp</b><small>O tutor confere no celular e toca em &quot;Li e concordo&quot;. Vale 7 dias.</small>
            </button>
          </div>
          <details className="g-ent-termo"><summary>O texto que o tutor vai ler</summary><p>{termo}</p></details>
        </div>
      </Folha>
    );
  }

  return (
    <Folha titulo={titulo} aoFechar={aoFechar} rodape={!pronto ? undefined : (
      <>
        {aceito
          ? <Link className="g-btn pri" href={`/gestao/app/entrada?id=${aceito.id}`}><Printer />Comprovante</Link>
          : <button type="button" className="g-btn pri" data-teste="salvar-entrada" disabled={salvando} onClick={() => void seguirParaAceite()}>
              {salvando ? <><Loader2 className="g-gira" />Salvando…</> : guardada && !mudou ? "Pedir o aceite do tutor" : "Salvar e pedir o aceite"}
            </button>}
        {!aceito && guardada && mudou && <button type="button" className="g-btn sec" disabled={salvando} onClick={() => void salvar()}>Só salvar</button>}
        <button type="button" className="g-btn fantasma" onClick={aoFechar}>{automatica && !guardada ? "Pular agora" : "Fechar"}</button>
      </>
    )}>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {aviso && <p className="g-erro" role="alert" data-teste="aviso-entrada">{aviso}</p>}
      {!pronto ? (carregando ? <Esqueleto linhas={5} /> : null) : (
        <div className="g-pilha g-ent">
          {guardada && (
            <div className={`g-ent-situacao${guardada.aceito_em ? " ok" : ""}`} role="status">
              <ClipboardCheck aria-hidden />
              <span>
                {guardada.aceito_em
                  ? <><b>Aceito por {guardada.aceite_nome}</b> {guardada.aceite === "link" ? "pelo link" : "com assinatura"}, em {dataCurta(new Date(guardada.aceito_em))} às {hora(guardada.aceito_em)}.</>
                  : <><b>Entrada conferida.</b> Aceite do tutor pendente{linkValendo(guardada) ? " (link enviado)" : ""}.</>}
                {guardada.aceito_em && mudou ? " Se salvar a mudança, o tutor precisa aceitar de novo." : ""}
              </span>
              {guardada.aceito_em && assinatura && /* eslint-disable-next-line @next/next/no-img-element */ <img className="g-ent-assinatura-mini" src={assinatura} alt={`Assinatura de ${guardada.aceite_nome ?? "tutor"}`} />}
            </div>
          )}
          {automatica && !guardada && <p className="g-muted g-pp">Leva um minuto e protege a loja e o tutor. Se não der agora, toque em Pular agora: dá para fazer depois {v.tipo === "banho" ? "pelo horário" : "pelo cartão do pet, em Conferir a entrada"}.</p>}

          <section className="g-bol-parte" aria-label="Temperamento">
            <div className="g-bol-t"><b>Temperamento</b><small>como chegou hoje</small></div>
            <div className="g-chips">
              {TEMPERAMENTOS.map((c) => <button key={c.id} type="button" className="g-chip" aria-pressed={temperamento.includes(c.id)} onClick={() => mexer(setTemperamento)(alternar(temperamento, c.id))}>{c.rotulo}</button>)}
            </div>
          </section>

          <section className="g-bol-parte" aria-label="Alergias e cuidados">
            <div className="g-bol-t"><b>Alergias e cuidados</b><small>veio da ficha do pet; dá para mudar</small></div>
            <textarea className="g-textarea g-ent-curto" maxLength={600} value={cuidados} aria-label="Alergias e cuidados" placeholder="Ex.: alergia a shampoo, toma remédio do coração" onChange={(e) => mexer(setCuidados)(e.target.value)} />
          </section>

          <section className="g-bol-parte" aria-label="O que já tinha no corpo">
            <div className="g-bol-t"><b>Já chegou com</b><small>marque o que já existia antes</small></div>
            <div className="g-chips g-ent-atencao">
              {LESOES.map((c) => <button key={c.id} type="button" className="g-chip" aria-pressed={lesoes.includes(c.id)} onClick={() => mexer(setLesoes)(alternar(lesoes, c.id))}>{c.rotulo}</button>)}
            </div>
            <input className="g-input" maxLength={300} value={lesoesObs} aria-label="Onde e como" placeholder="Onde? Ex.: ferida na pata de trás" onChange={(e) => mexer(setLesoesObs)(e.target.value)} />
            <ul className="g-bol-fotos" aria-label="Fotos do que já existia">
              {fotos.map((f, i) => (
                <li key={f.caminho} className={f.pendente ? `pendente ${f.pendente.estado}` : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f.url ? <img src={f.url} alt={`Foto ${i + 1} da entrada de ${v.pet}`} /> : <span className="sem">foto</span>}
                  {f.pendente?.estado === "subindo" && <span className="g-ent-foto-estado" aria-label="Foto subindo"><Loader2 className="g-gira" aria-hidden /></span>}
                  {f.pendente?.estado === "falhou" && (
                    <button type="button" className="g-ent-foto-estado falhou" data-teste="foto-tentar-de-novo" title={f.pendente.erro} onClick={() => void subir(f)}>
                      <RotateCcw aria-hidden /><span>Não subiu. Tentar de novo</span>
                    </button>
                  )}
                  <button type="button" className="g-bol-foto-x" aria-label={`Remover a foto ${i + 1}`} title="Remover esta foto" onClick={() => tirarFoto(f)}><X aria-hidden /></button>
                </li>
              ))}
              {fotos.length < MAX_FOTOS_ENTRADA && (
                <li className="mais">
                  <button type="button" onClick={() => { if (!somenteLeitura()) camera.current?.click(); }}><Camera aria-hidden /><span>Tirar foto</span></button>
                  <button type="button" onClick={() => { if (!somenteLeitura()) galeria.current?.click(); }}><ImagePlus aria-hidden /><span>Galeria</span></button>
                </li>
              )}
            </ul>
            <small className="g-muted">Fotos opcionais, até {MAX_FOTOS_ENTRADA}. Ficam guardadas só para a loja e para o tutor ver no link.</small>
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(x) => void escolher(x)} />
            <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(x) => void escolher(x)} data-teste="fotos-da-entrada" />
          </section>

          <section className="g-bol-parte" aria-label="Idoso ou doente">
            <div className="g-chips"><button type="button" className="g-chip" aria-pressed={idoso} onClick={() => mexer(setIdoso)(!idoso)}>Pet idoso ou doente</button></div>
            {idoso && <p className="g-ent-nota" role="note">{v.tipo === "banho"
              ? "Manuseio com mais calma: pausas, menos tempo de secador e atenção à respiração. Se ele não estiver bem, pare e avise o tutor."
              : "Mais calma com ele: descanso, água por perto, menos correria com os outros cães e atenção à respiração. Se ele não estiver bem, avise o tutor."}</p>}
          </section>

          <section className="g-bol-parte" aria-label="Pertences deixados">
            <div className="g-bol-t"><b>Pertences deixados</b><small>aparecem de novo na saída, para devolver</small></div>
            <div className="g-chips">
              {PERTENCES.map((c) => <button key={c.id} type="button" className="g-chip" aria-pressed={pertences.includes(c.id)} onClick={() => mexer(setPertences)(alternar(pertences, c.id))}>{c.rotulo}</button>)}
            </div>
            <input className="g-input" maxLength={200} value={outros} aria-label="Outros pertences" placeholder="Outra coisa? Ex.: cobertor azul" onChange={(e) => mexer(setOutros)(e.target.value)} />
          </section>

          <section className="g-bol-parte" aria-label="Observações">
            <div className="g-bol-t"><b>Observações</b><small>(opcional)</small></div>
            <CampoComVoz valor={obs} aoMudar={mexer(setObs)} rotulo="Ditar as observações da entrada" maxLength={1000}>
              <textarea className="g-textarea g-ent-curto" maxLength={1000} value={obs} aria-label="Observações da entrada" placeholder="Ex.: chegou sem comer" onChange={(e) => mexer(setObs)(e.target.value)} />
            </CampoComVoz>
          </section>
        </div>
      )}
    </Folha>
  );
}

/* ---------- assinar no aparelho ---------- */

/** O quadro para assinar com o dedo (ou o mouse). Devolve o PNG pelo `aoMudar` (null quando está em branco). */
export function QuadroDeAssinatura({ aoMudar }: { aoMudar: (temAlgo: boolean, tela: HTMLCanvasElement) => void }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const [vazio, setVazio] = useState(true);
  const temDesenho = useRef(false);
  const avisarRef = useRef(aoMudar);
  avisarRef.current = aoMudar;

  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    const ajustar = () => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width === Math.round(r.width * dpr) && c.height === Math.round(r.height * dpr)) return;
      // virar o celular (ou a tela mudar de tamanho) não apaga o que o tutor já assinou: o desenho é copiado para o quadro novo
      let copia: HTMLCanvasElement | null = null;
      if (c.width > 0 && c.height > 0 && temDesenho.current) {
        copia = document.createElement("canvas");
        copia.width = c.width; copia.height = c.height;
        copia.getContext("2d")!.drawImage(c, 0, 0);
      }
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const x = c.getContext("2d")!;
      if (copia) { x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(copia, 0, 0); }
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.lineCap = "round"; x.lineJoin = "round"; x.lineWidth = 2.6; x.strokeStyle = "#1f1b17";
      if (!copia) { setVazio(true); avisarRef.current(false, c); }
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function comecar(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    desenhando.current = true;
    ultimo.current = ponto(e);
    const x = e.currentTarget.getContext("2d")!;
    x.beginPath(); x.arc(ultimo.current.x, ultimo.current.y, 1.2, 0, Math.PI * 2); x.fillStyle = "#1f1b17"; x.fill();
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current || !ultimo.current) return;
    const p = ponto(e);
    const x = e.currentTarget.getContext("2d")!;
    x.beginPath(); x.moveTo(ultimo.current.x, ultimo.current.y); x.lineTo(p.x, p.y); x.stroke();
    ultimo.current = p;
    temDesenho.current = true;
    if (vazio) { setVazio(false); avisarRef.current(true, e.currentTarget); }
  }
  function parar(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!desenhando.current) return;
    desenhando.current = false; ultimo.current = null;
    avisarRef.current(!vazio, e.currentTarget);
  }
  function limpar() {
    const c = tela.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    temDesenho.current = false;
    setVazio(true); avisarRef.current(false, c);
  }
  return (
    <div className="g-ent-quadro">
      <canvas ref={tela} aria-label="Quadro para assinar com o dedo" data-teste="quadro-assinatura" role="img"
        onPointerDown={comecar} onPointerMove={mover} onPointerUp={parar} onPointerCancel={parar} onPointerLeave={parar} />
      <span className="g-ent-quadro-linha" aria-hidden>Assine aqui</span>
      {!vazio && <button type="button" className="g-btn fantasma p g-ent-limpar" onClick={limpar}><Eraser />Limpar</button>}
    </div>
  );
}

/** Reduz o quadro a um PNG leve (fundo branco, até 900 px de largura). */
function pngDoQuadro(c: HTMLCanvasElement): Promise<Blob> {
  const escala = Math.min(1, 900 / c.width);
  const t = document.createElement("canvas");
  t.width = Math.round(c.width * escala); t.height = Math.round(c.height * escala);
  const x = t.getContext("2d")!;
  x.fillStyle = "#fff"; x.fillRect(0, 0, t.width, t.height);
  x.drawImage(c, 0, 0, t.width, t.height);
  return new Promise((res, rej) => t.toBlob((b) => (b ? res(b) : rej(new Error("Não consegui guardar a assinatura."))), "image/png"));
}

function FolhaAssinar({ entrada, termo, pet, tutor, aoVoltar, aoFechar, aoAssinar }: {
  entrada: Entrada; termo: string; pet: string; tutor: string; aoVoltar: () => void; aoFechar: () => void; aoAssinar: (e: Entrada, url: string | null) => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [nome, setNome] = useState(tutor);
  const [assinou, setAssinou] = useState(false);
  const [leu, setLeu] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const quadro = useRef<HTMLCanvasElement | null>(null);

  async function confirmar() {
    if (enviando || somenteLeitura()) return;
    if (nome.trim().length < 2) return avisarErro(new Error("Escreva o nome de quem assina."));
    if (!assinou || !quadro.current) return avisarErro(new Error("Falta a assinatura no quadro."));
    setEnviando(true);
    let caminho: string | null = null;
    try {
      const png = await pngDoQuadro(quadro.current);
      caminho = await enviarAssinatura(sb, petshop.id, png);
      ok(await sb.rpc("entrada_assinar", { p_id: entrada.id, p_nome: nome.trim(), p_assinatura: caminho }));
      const e = ok(await sb.from("entradas").select(COLS_ENTRADA).eq("id", entrada.id).single()) as unknown as Entrada;
      if (e.aceite_assinatura !== caminho) descartarArquivo(sb, caminho);
      const urls = e.aceite_assinatura ? await enderecosDosArquivos(sb, [e.aceite_assinatura]) : new Map<string, string>();
      avisar("Aceite do tutor guardado.");
      avisarMudanca();
      aoAssinar(e, e.aceite_assinatura ? urls.get(e.aceite_assinatura) ?? null : null);
    } catch (e) {
      if (caminho) descartarArquivo(sb, caminho);
      avisarErro(e);
    } finally { setEnviando(false); }
  }

  return (
    <Folha titulo={`Aceite do tutor · ${pet}`} aoFechar={aoFechar} rodape={
      <>
        <button type="button" className="g-btn verde" data-teste="confirmar-assinatura" disabled={enviando || !assinou || !leu || nome.trim().length < 2} onClick={() => void confirmar()}>
          {enviando ? <><Loader2 className="g-gira" />Guardando…</> : <><Check />Confirmar o aceite</>}
        </button>
        <button type="button" className="g-btn fantasma" onClick={aoVoltar}>Voltar</button>
      </>
    }>
      <div className="g-pilha g-ent">
        <p className="g-muted g-pp">Passe o aparelho para o tutor ler e assinar.</p>
        <ResumoCurto entrada={entrada} />
        <div className="g-ent-texto" data-teste="termo-da-entrada">{termo.split("\n").map((l, i) => <p key={i}>{l}</p>)}</div>
        <label className="g-ent-li"><input type="checkbox" checked={leu} onChange={(e) => setLeu(e.target.checked)} /><span>Li e concordo</span></label>
        <label className="g-campo"><span>Nome de quem assina</span>
          <input className="g-input" value={nome} maxLength={120} autoComplete="off" onChange={(e) => setNome(e.target.value)} />
        </label>
        <QuadroDeAssinatura aoMudar={(tem, c) => { setAssinou(tem); quadro.current = c; }} />
      </div>
    </Folha>
  );
}

/** O resumo da entrada em poucas linhas (para o tutor conferir antes de assinar). */
function ResumoCurto({ entrada }: { entrada: Entrada }) {
  const linhas = resumo(entrada);
  return <dl className="g-ent-resumo">{linhas.map((l) => <div key={l.rotulo}><dt>{l.rotulo}</dt><dd>{l.texto}</dd></div>)}</dl>;
}

/* ---------- mandar o link ---------- */

function FolhaLink({ entrada, visita: v, aoVoltar, aoFechar, aoMudar }: {
  entrada: Entrada; visita: VisitaDaEntrada; aoVoltar: () => void; aoFechar: () => void; aoMudar: (e: Entrada) => void;
}) {
  const { sb } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [token, setToken] = useState<string | null>(null);
  const [expira, setExpira] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const feito = useRef(false);

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    if (somenteLeitura()) { aoVoltar(); return; }
    void (async () => {
      try {
        const fotos = await assinarParaOLink(sb, entrada.fotos);
        const r = ok(await sb.rpc("entrada_link", { p_id: entrada.id, p_fotos: fotos })) as { token: string; expira: string };
        setToken(r.token); setExpira(r.expira);
        aoMudar({ ...entrada, token: r.token, token_expira: r.expira });
        avisarMudanca();
      } catch (e) { setErro(e instanceof Error ? e.message : String(e)); avisarErro(e); }
    })();
  }, [sb, entrada, aoMudar, aoVoltar, avisarErro, somenteLeitura]);

  const url = token ? enderecoDaEntrada(token) : null;
  const zap = url ? linkWhatsApp(v.tutor?.telefone, mensagemDaEntrada({ tutor: v.tutor?.nome, pet: v.pet, url })) : null;
  async function copiar() {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); avisar("Link copiado."); }
    catch { avisarErro(new Error("Não consegui copiar. Segure no link para copiar.")); }
  }
  return (
    <Folha titulo={`Aceite pelo link · ${v.pet}`} aoFechar={aoFechar} rodape={
      <>
        {zap ? <a className="g-btn zap" data-teste="mandar-entrada" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => avisar("Pronto. Quando o tutor aceitar, aparece aqui.")}><MessageCircle />Mandar no WhatsApp</a>
          : url ? <button type="button" className="g-btn pri" onClick={() => void copiar()}><Copy />Copiar o link</button> : null}
        <button type="button" className="g-btn fantasma" onClick={aoVoltar}>Voltar</button>
      </>
    }>
      <div className="g-pilha g-ent">
        {erro ? <p className="g-erro" role="alert">{erro}</p> : !url ? <Esqueleto linhas={2} /> : (
          <>
            <p className="g-p">O tutor abre o link, confere como {v.pet} chegou (com as fotos) e toca em <b>Li e concordo</b>. Guardamos a hora, o aparelho e a internet de onde ele aceitou.</p>
            <p className="g-ent-url"><a className="g-link" href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>
            {expira && <p className="g-muted g-pp">O link vale até {dataCurta(new Date(expira))} às {hora(expira)}.</p>}
            {!zap && <p className="g-muted g-pp">{v.tutor ? "Sem telefone na ficha do tutor: copie o link e mande como preferir." : "Este pet não tem tutor na ficha: copie o link e mande como preferir."}</p>}
            {zap && <div><button type="button" className="g-btn fantasma p" onClick={() => void copiar()}><Copy />Copiar o link</button></div>}
          </>
        )}
      </div>
    </Folha>
  );
}
