"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Copy, ExternalLink, ImagePlus, Loader2, MessageCircle, Newspaper, RotateCcw, Sparkles, X } from "lucide-react";
import {
  AMIZADE, CHIPS_ATENCAO, chipsDo, chipsDosRotulos, descartarFoto, enderecoDoBoletim, enviarFotoDoBoletim, faxinaDoBoletim, fotosGuardadas,
  MAX_FOTOS_BOLETIM, mensagemDoBoletim, recadoNoSexo, rotulosDosChips, textoModelo, type FotoDoBoletim, type TipoDoBoletim,
} from "@/lib/gestao/boletim";
import { hora, isoDia, linkWhatsApp } from "@/lib/gestao/util";
import { diarioDe, itensMarcados } from "@/lib/gestao/casa-opcoes";
import { fotosDoDia, paginaDoTutorLigada } from "@/lib/gestao/tutor";
import { useGestao } from "../contexto";
import { avisarMudanca, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { EtiquetaFoto, estadoDaFoto, useAutorizacoesDoPet } from "./autorizacao";
import "./boletim.css";

/**
 * "Mandar boletim": no fim do banho e tosa (folha do horário na Agenda), quando o cão sai da creche (Chamada e Casa agora) e
 * durante ou no fim do hotel (um por dia). A equipe põe fotos, toca nos recados e manda o link pelo WhatsApp; o tutor abre a
 * página sem instalar nada. O sistema só prepara a mensagem: quem envia é a pessoa.
 */
export type Visita = {
  tipo: TipoDoBoletim;
  agendamentoId?: string; estadiaId?: string;
  petId: string; pet: string;
  tutor: { nome: string | null; telefone: string | null } | null;
  /** "Banho e Hidratação" (só no banho e tosa) */
  servicos?: string | null;
};
export type EstadoDoBoletim = { enviado_em: string | null; criado_em: string };

/** O boletim mais novo de cada estadia, criado hoje (para o "Boletim enviado" dos cartões e da chamada). */
export function useBoletinsDeHoje(estadiaIds: string[]) {
  const { sb, petshop, posso } = useGestao();
  const chave = [...new Set(estadiaIds)].sort().join(",");
  const { dados } = useDados(async () => {
    const mapa = new Map<string, EstadoDoBoletim>();
    if (!chave || !posso("creche_hotel")) return mapa;
    const desde = new Date(); desde.setHours(0, 0, 0, 0);
    const r = await sb.from("boletins").select("estadia_id, enviado_em, criado_em").eq("petshop_id", petshop.id)
      .in("estadia_id", chave.split(",")).gte("criado_em", desde.toISOString()).order("criado_em").limit(500);
    if (r.error) return mapa; // sem a marca, o botão continua funcionando
    for (const b of r.data ?? []) if (b.estadia_id) mapa.set(b.estadia_id, { enviado_em: b.enviado_em, criado_em: b.criado_em });
    return mapa;
  }, [petshop.id, chave]);
  return dados ?? new Map<string, EstadoDoBoletim>();
}

/** A faxina dos boletins vencidos, quando alguém da agenda ou da creche e do hotel abre a tela (no máximo a cada 12 horas). */
export function useFaxinaDoBoletim() {
  const { sb, petshop, posso, liberado } = useGestao();
  const pode = posso("agenda") || posso("creche_hotel");
  useEffect(() => {
    if (!pode || !liberado) return;
    const chave = `g-faxina-boletim:${petshop.id}`;
    try { if (Date.now() - Number(localStorage.getItem(chave) ?? 0) < 12 * 3600e3) return; localStorage.setItem(chave, String(Date.now())); } catch { /* roda mesmo assim */ }
    void faxinaDoBoletim(sb, petshop.id).catch(() => { try { localStorage.removeItem(chave); } catch { /* nada */ } });
  }, [sb, petshop.id, pode, liberado]);
}

/** O botão: "Mandar boletim", ou "Boletim enviado às 17h" depois de mandar (tocar abre de novo para ver, corrigir ou reenviar). */
export function BotaoBoletim({ visita, estado, classe = "g-btn sec p" }: { visita: Visita; estado?: EstadoDoBoletim | null; classe?: string }) {
  const { sb, petshop, posso } = useGestao();
  const [aberta, setAberta] = useState(false);
  const [enviado, setEnviado] = useState<string | null>(estado?.enviado_em ?? null);
  useEffect(() => { if (estado?.enviado_em) setEnviado(estado.enviado_em); }, [estado?.enviado_em]);
  // no horário da agenda (um botão só na tela), o próprio botão pergunta se o boletim já foi mandado
  useEffect(() => {
    if (estado !== undefined || !visita.agendamentoId || !posso("agenda")) return;
    let vivo = true;
    void sb.from("boletins").select("enviado_em").eq("petshop_id", petshop.id).eq("agendamento_id", visita.agendamentoId).not("enviado_em", "is", null)
      .order("enviado_em", { ascending: false }).limit(1).then((r) => { if (vivo && r.data?.[0]?.enviado_em) setEnviado(r.data[0].enviado_em); });
    return () => { vivo = false; };
  }, [sb, petshop.id, visita.agendamentoId, estado, posso]);
  if (!posso(visita.tipo === "banho" ? "agenda" : "creche_hotel")) return null;
  return (
    <>
      <button type="button" className={`${classe}${enviado ? " g-bol-enviado" : ""}`} onClick={() => setAberta(true)} aria-label={enviado ? `Boletim de ${visita.pet} enviado às ${hora(enviado)}: abrir` : `Mandar boletim de ${visita.pet}`}>
        {enviado ? <><Check />Boletim enviado {hora(enviado)}</> : <><Newspaper />Mandar boletim</>}
      </button>
      {aberta && <FolhaBoletim visita={visita} aoFechar={() => setAberta(false)} aoEnviar={setEnviado} />}
    </>
  );
}

type Guardado = { id: string; token: string; texto: string; chips: unknown; nota: string | null; atencao: string | null; fotos: string[]; assinaturas: string[]; enviado_em: string | null; expira_em: string; criado_em?: string };

/** Separa o texto de atenção guardado nos toques rápidos e no resto escrito à mão. */
function lerAtencao(t: string | null) {
  let resto = t ?? "";
  const marcados: string[] = [];
  for (const c of CHIPS_ATENCAO) if (resto.includes(c)) { marcados.push(c); resto = resto.replace(c, ""); }
  return { marcados, resto: resto.replace(/^[\s.;,]+|[\s.;,]+$/g, "").replace(/\s*\.\s*\./g, ".") };
}
const juntarAtencao = (marcados: string[], resto: string) => [...marcados, resto.trim()].filter(Boolean).map((x) => x.replace(/[.\s]+$/, "")).join(". ").concat(marcados.length || resto.trim() ? "." : "");

export function FolhaBoletim({ visita: v, aoFechar, aoEnviar }: { visita: Visita; aoFechar: () => void; aoEnviar?: (quando: string) => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  // o boletim que já existe desta visita (o do banho, ou o de hoje da estadia) e o sexo do pet, para o "do/da"
  const { dados, carregando, erro } = useDados(async () => {
    let q = sb.from("boletins").select("id, token, texto, chips, nota, atencao, fotos, assinaturas, enviado_em, expira_em, criado_em").eq("petshop_id", petshop.id);
    if (v.agendamentoId) q = q.eq("agendamento_id", v.agendamentoId);
    else { const desde = new Date(); desde.setHours(0, 0, 0, 0); q = q.eq("estadia_id", v.estadiaId!).gte("criado_em", desde.toISOString()); }
    const [b, p] = await Promise.all([
      q.gt("expira_em", new Date().toISOString()).order("criado_em", { ascending: false }).limit(1).maybeSingle(),
      sb.from("pets").select("sexo").eq("id", v.petId).maybeSingle(),
    ]);
    const g = ok(b) as Guardado | null;
    return { guardado: g, sexo: p.data?.sexo ?? null, fotos: g ? await fotosGuardadas(sb, g.fotos, g.assinaturas) : [] };
  }, [petshop.id, v.agendamentoId, v.estadiaId, v.petId]);

  // creche e hotel: o diário de hoje e as Fotos de hoje do pet, para o boletim levar tudo num link só (Diário + Boletim + Fotos)
  const comDiario = v.tipo !== "banho" && Boolean(v.estadiaId) && diarioDe(petshop).ativo;
  const comFotosDoDia = v.tipo !== "banho" && Boolean(v.estadiaId) && paginaDoTutorLigada(petshop);
  const { dados: doDia } = useDados(async () => {
    if (!comDiario && !comFotosDoDia) return null;
    const hoje = isoDia(new Date());
    const [d, f] = await Promise.all([
      comDiario ? sb.from("estadias_diario").select("itens, nota").eq("petshop_id", petshop.id).eq("estadia_id", v.estadiaId!).eq("dia", hoje).maybeSingle() : null,
      comFotosDoDia ? fotosDoDia(sb, petshop.id, [v.petId], hoje).catch(() => []) : [],
    ]);
    return { itens: itensMarcados(d?.data ?? null), nota: (d?.data?.nota ?? "").trim(), fotos: (f ?? []).filter((x) => x.url) };
  }, [petshop.id, v.estadiaId, v.petId, comDiario, comFotosDoDia]);
  const [trouxe, setTrouxe] = useState(false);
  const [trazendo, setTrazendo] = useState(false);

  const [pronto, setPronto] = useState(false);
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  // o tutor autorizou postar as fotos? (ele autoriza na página do boletim; aqui só aparece)
  const autorizacoes = useAutorizacoesDoPet(v.petId);
  const [fotos, setFotos] = useState<FotoDoBoletim[]>([]);
  const [subindo, setSubindo] = useState(0);
  const [chips, setChips] = useState<string[]>([]);
  const [amigo, setAmigo] = useState("");
  const [nota, setNota] = useState("");
  const [atencaoChips, setAtencaoChips] = useState<string[]>([]);
  const [atencaoTexto, setAtencaoTexto] = useState("");
  const [texto, setTexto] = useState("");
  // enquanto ninguém mexeu no texto, ele acompanha os recados (texto pronto)
  const [textoProprio, setTextoProprio] = useState(false);
  const [escrevendo, setEscrevendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mudou, setMudou] = useState(false);
  const novas = useRef(new Set<string>());

  useEffect(() => {
    if (!dados || pronto) return;
    const g = dados.guardado;
    setGuardado(g);
    setFotos(dados.fotos);
    if (g) {
      const c = chipsDosRotulos(v.tipo, g.chips);
      setChips(c.ids); setAmigo(c.amigo); setNota(g.nota ?? "");
      const a = lerAtencao(g.atencao);
      setAtencaoChips(a.marcados); setAtencaoTexto(a.resto);
      setTexto(g.texto); setTextoProprio(true);
    }
    setPronto(true);
  }, [dados, pronto, v.tipo]);

  const sexo = dados?.sexo ?? null;
  const modelo = useMemo(() => textoModelo({ tipo: v.tipo, pet: v.pet, sexo, petshop: petshop.nome, servicos: v.servicos, chips, amigo, nota }),
    [v.tipo, v.pet, sexo, petshop.nome, v.servicos, chips, amigo, nota]);
  useEffect(() => { if (pronto && !textoProprio) setTexto(modelo); }, [modelo, pronto, textoProprio]);

  // fotos que subiram e não foram salvas saem do bucket quando a folha fecha
  const fotosAgora = useRef(fotos);
  fotosAgora.current = fotos;
  useEffect(() => () => {
    for (const c of novas.current) descartarFoto(sb, c);
    for (const f of fotosAgora.current) if (f.url.startsWith("blob:")) URL.revokeObjectURL(f.url);
  }, [sb]);

  const lista = chipsDo(v.tipo);
  function tocar(id: string) {
    const c = lista.find((x) => x.id === id);
    setChips((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual.filter((x) => x !== c?.contra), id]));
    setMudou(true);
  }

  async function escolher(ev: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!arquivos.length || somenteLeitura()) return;
    const cabem = MAX_FOTOS_BOLETIM - fotos.length - subindo;
    const vao = arquivos.slice(0, Math.max(0, cabem));
    if (!vao.length) return avisarErro(new Error(`Até ${MAX_FOTOS_BOLETIM} fotos por boletim. Tire uma para pôr outra.`));
    setSubindo((n) => n + vao.length);
    for (const f of vao) {
      try {
        const x = await enviarFotoDoBoletim(sb, petshop.id, f);
        novas.current.add(x.caminho);
        setFotos((l) => [...l, x]);
        setMudou(true);
      } catch (e) { avisarErro(e); }
      setSubindo((n) => n - 1);
    }
    if (arquivos.length > vao.length) avisarErro(new Error(`Entraram ${vao.length}: o limite é de ${MAX_FOTOS_BOLETIM} fotos por boletim.`));
  }
  /** Põe no boletim as Fotos de hoje (cópia no boletim, que vale 60 dias) e o que foi marcado no diário (no recado). */
  async function trazerODia() {
    if (!doDia || trazendo || somenteLeitura()) return;
    setTrazendo(true);
    const vagas = Math.max(0, MAX_FOTOS_BOLETIM - fotos.length - subindo);
    let vieram = 0;
    for (const f of doDia.fotos.slice(0, vagas)) {
      try {
        const r = await fetch(f.url!);
        if (!r.ok) throw new Error("foto");
        const arquivo = new File([await r.blob()], "foto-do-dia.jpg", { type: "image/jpeg" });
        const x = await enviarFotoDoBoletim(sb, petshop.id, arquivo);
        novas.current.add(x.caminho);
        setFotos((l) => [...l, x]);
        vieram++;
      } catch { /* a foto que falhar fica de fora; as outras entram */ }
    }
    const doDiario = [doDia.itens.join(", "), doDia.nota].filter(Boolean).join(". ");
    if (doDiario && !nota.includes(doDiario)) setNota((n) => [n.trim(), doDiario].filter(Boolean).join(". ").slice(0, 400));
    setTrouxe(true); setMudou(true); setTrazendo(false);
    if (doDia.fotos.length && vieram < Math.min(doDia.fotos.length, vagas)) avisarErro(new Error("Alguma foto de hoje não veio. Dá para escolher de novo pelo botão de fotos."));
    else avisar(`${vieram ? `${vieram === 1 ? "1 foto" : `${vieram} fotos`} de hoje` : ""}${vieram && doDiario ? " e " : ""}${doDiario ? "o diário" : ""} no boletim. Confira e salve.`);
  }

  function tirarFoto(f: FotoDoBoletim) {
    setFotos((l) => l.filter((x) => x.caminho !== f.caminho));
    if (novas.current.has(f.caminho)) { novas.current.delete(f.caminho); descartarFoto(sb, f.caminho); }
    setMudou(true);
  }

  async function escreverComMozart() {
    if (escrevendo) return;
    setEscrevendo(true);
    try {
      const { data } = await sb.auth.getSession();
      const r = await fetch("/api/gestao/boletim", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ petshopId: petshop.id, petId: v.petId, tipo: v.tipo, servicos: v.servicos ?? null, chips, amigo, nota }),
      });
      const j = (await r.json().catch(() => null)) as { texto?: string; ia?: boolean; motivo?: string; mensagem?: string } | null;
      if (!r.ok || !j?.texto) throw new Error(j?.mensagem ?? "O Mozart não respondeu agora. O texto pronto continua aqui.");
      setTexto(j.texto); setTextoProprio(true); setMudou(true);
      if (!j.ia) avisar(j.motivo === "limite" ? "O Mozart já escreveu muitos boletins hoje. Pus o texto pronto: dá para mudar à vontade." : "O Mozart está fora do ar agora. Pus o texto pronto: dá para mudar à vontade.");
    } catch (e) { avisarErro(e); }
    setEscrevendo(false);
  }

  const atencao = juntarAtencao(atencaoChips, atencaoTexto);
  const rotulos = rotulosDosChips(v.tipo, chips, amigo);
  const vazio = !fotos.length && !rotulos.length && !texto.trim() && !atencao;

  /** Grava e devolve o código do link (sem mudança desde a última gravação, só devolve). */
  async function salvar(): Promise<Guardado | null> {
    if (somenteLeitura()) return null;
    if (guardado && !mudou) return guardado;
    if (subindo) { avisarErro(new Error("Espere as fotos terminarem de subir.")); return null; }
    if (vazio) { avisarErro(new Error("Ponha uma foto, um recado ou o texto antes de salvar.")); return null; }
    setSalvando(true);
    try {
      const r = ok(await sb.rpc("boletim_salvar", {
        p_petshop: petshop.id, p_id: guardado?.id ?? (null as unknown as string), p_pet: v.petId,
        p_agendamento: v.agendamentoId ?? (null as unknown as string), p_estadia: v.estadiaId ?? (null as unknown as string),
        p_texto: texto.trim(), p_chips: rotulos, p_nota: nota.trim(), p_atencao: atencao,
        p_fotos: fotos.map((f) => ({ caminho: f.caminho, assinatura: f.assinatura })),
      })) as { id: string; token: string; expira_em: string; enviado_em: string | null };
      novas.current.clear();
      const g: Guardado = { id: r.id, token: r.token, texto, chips: rotulos, nota, atencao, fotos: fotos.map((f) => f.caminho), assinaturas: fotos.map((f) => f.assinatura), enviado_em: r.enviado_em, expira_em: r.expira_em };
      setGuardado(g); setMudou(false);
      avisar(guardado ? "Boletim atualizado. O link é o mesmo." : "Boletim salvo. Agora é só mandar.");
      avisarMudanca();
      return g;
    } catch (e) { avisarErro(e); return null; } finally { setSalvando(false); }
  }

  async function marcarEnviado(g: Guardado) {
    try {
      const quando = ok(await sb.rpc("boletim_enviado", { p_id: g.id })) as string;
      setGuardado({ ...g, enviado_em: quando });
      aoEnviar?.(quando);
      avisarMudanca();
    } catch (e) { avisarErro(e); }
  }

  async function copiar(g: Guardado) {
    try { await navigator.clipboard.writeText(enderecoDoBoletim(g.token)); avisar("Link copiado."); }
    catch { avisarErro(new Error("Não consegui copiar. Segure no link para copiar.")); }
  }

  const url = guardado ? enderecoDoBoletim(guardado.token) : null;
  const zap = guardado && !mudou ? linkWhatsApp(v.tutor?.telefone, mensagemDoBoletim({ tutor: v.tutor?.nome, pet: v.pet, sexo, url: url! })) : null;
  const semFone = !linkWhatsApp(v.tutor?.telefone, "x");
  const titulo = v.tipo === "banho" ? "Boletim do banho" : v.tipo === "creche" ? "Boletim da creche" : "Boletim do hotel";

  return (
    <Folha titulo={`${titulo} · ${v.pet}`} aoFechar={aoFechar} rodape={
      !pronto ? undefined : guardado && !mudou ? (
        <>
          {zap
            ? <a className="g-btn zap" data-teste="mandar-boletim" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void marcarEnviado(guardado)}><MessageCircle />{guardado.enviado_em ? "Mandar de novo" : "Mandar no WhatsApp"}</a>
            : <button type="button" className="g-btn pri" onClick={() => void copiar(guardado)}><Copy />Copiar o link</button>}
          <button type="button" className="g-btn fantasma" onClick={aoFechar}>Fechar</button>
        </>
      ) : (
        <>
          <button type="button" className="g-btn pri" disabled={salvando || subindo > 0} onClick={() => void salvar()}>
            {salvando ? <><Loader2 className="g-gira" />Salvando…</> : guardado ? "Salvar as mudanças" : "Salvar boletim"}
          </button>
          <button type="button" className="g-btn fantasma" onClick={aoFechar}>Fechar</button>
        </>
      )
    }>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {!pronto ? (carregando ? <Esqueleto linhas={4} /> : null) : (
        <div className="g-pilha g-bol">
          {guardado && (
            <div className={`g-bol-estado${guardado.enviado_em ? " ok" : ""}`} role="status">
              {guardado.enviado_em ? <Check aria-hidden /> : <Newspaper aria-hidden />}
              <span>{guardado.enviado_em ? <><b>Boletim enviado</b> às {hora(guardado.enviado_em)}{isoDia(new Date(guardado.enviado_em)) !== isoDia(new Date()) ? ` de ${new Date(guardado.enviado_em).toLocaleDateString("pt-BR")}` : ""}.</> : <><b>Boletim salvo</b>, ainda não mandado.</>} {mudou ? "Salve as mudanças para mandar." : "O link vale 60 dias."}</span>
              {url && !mudou && <a className="g-link" href={url} target="_blank" rel="noopener noreferrer">Ver como o tutor vê<ExternalLink aria-hidden /></a>}
            </div>
          )}
          {autorizacoes && (guardado || autorizacoes.length > 0) && (
            <p className="g-bol-redes-linha" data-teste="redes-do-boletim">
              <span className="g-cresce">Fotos nas redes</span>
              <EtiquetaFoto estado={estadoDaFoto(autorizacoes, guardado?.id, guardado?.criado_em ?? new Date().toISOString())} />
              {!estadoDaFoto(autorizacoes, guardado?.id, guardado?.criado_em ?? new Date().toISOString()).pode && <small className="g-muted">O tutor autoriza na página do boletim, se quiser.</small>}
            </p>
          )}

          {doDia && !trouxe && (doDia.fotos.length > 0 || doDia.itens.length > 0 || doDia.nota) && (
            <div className="g-aviso" role="status" data-teste="boletim-do-dia" style={{ marginBottom: 0 }}>
              <Sparkles aria-hidden />
              <span className="g-cresce">
                <b>Um link só para o tutor:</b> {[doDia.fotos.length ? `${doDia.fotos.length === 1 ? "1 foto" : `${doDia.fotos.length} fotos`} de Fotos de hoje` : "", doDia.itens.length || doDia.nota ? "o diário de hoje" : ""].filter(Boolean).join(" e ")} {doDia.fotos.length > 1 || (doDia.fotos.length > 0 && (doDia.itens.length > 0 || Boolean(doDia.nota))) ? "podem" : "pode"} entrar neste boletim.
                <br /><button type="button" className="g-btn sec p" style={{ marginTop: 6 }} disabled={trazendo} onClick={() => void trazerODia()}>{trazendo ? <><Loader2 className="g-gira" aria-hidden />Trazendo…</> : "Pôr no boletim"}</button>
              </span>
            </div>
          )}

          <section className="g-bol-parte" aria-label="Fotos">
            <div className="g-bol-t"><b>Fotos</b><small>até {MAX_FOTOS_BOLETIM}</small></div>
            <ul className="g-bol-fotos">
              {fotos.map((f, i) => (
                <li key={f.caminho}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {f.url ? <img src={f.url} alt={`Foto ${i + 1} de ${v.pet}`} /> : <span className="sem">foto</span>}
                  <button type="button" className="g-bol-foto-x" aria-label={`Tirar a foto ${i + 1}`} onClick={() => tirarFoto(f)}><X aria-hidden /></button>
                </li>
              ))}
              {Array.from({ length: subindo }, (_, i) => <li key={`s${i}`} className="subindo" aria-label="Foto subindo"><Loader2 className="g-gira" aria-hidden /></li>)}
              {fotos.length + subindo < MAX_FOTOS_BOLETIM && (
                <li className="mais">
                  <button type="button" onClick={() => { if (!somenteLeitura()) camera.current?.click(); }}><Camera aria-hidden /><span>Tirar foto</span></button>
                  <button type="button" onClick={() => { if (!somenteLeitura()) galeria.current?.click(); }}><ImagePlus aria-hidden /><span>Galeria</span></button>
                </li>
              )}
            </ul>
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(x) => void escolher(x)} />
            <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(x) => void escolher(x)} data-teste="fotos-do-boletim" />
          </section>

          <section className="g-bol-parte" aria-label="Como foi">
            <div className="g-bol-t"><b>{v.tipo === "banho" ? "Como foi" : "Como foi o dia"}</b><small>toque no que aconteceu</small></div>
            <div className="g-chips">
              {lista.map((c) => <button key={c.id} type="button" className="g-chip" aria-pressed={chips.includes(c.id)} onClick={() => tocar(c.id)}>{recadoNoSexo(c.rotulo, sexo)}</button>)}
            </div>
            {v.tipo !== "banho" && (
              <label className="g-campo g-bol-amigo">
                <span>{AMIZADE.trim()} <small>(opcional)</small></span>
                <input className="g-input" maxLength={40} value={amigo} placeholder="Nome do amigo, ex.: Mel" onChange={(e) => { setAmigo(e.target.value); setMudou(true); }} />
              </label>
            )}
            <label className="g-campo">
              <span>Recado a mais <small>(opcional)</small></span>
              <input className="g-input" maxLength={400} value={nota} placeholder={v.tipo === "banho" ? "Ex.: adorou o banho de ofurô" : "Ex.: dormiu abraçado no cobertor"} onChange={(e) => { setNota(e.target.value); setMudou(true); }} />
            </label>
          </section>

          <section className="g-bol-parte g-bol-atencao" aria-label="Atenção à saúde">
            <div className="g-bol-t"><b>Atenção à saúde</b><small>aparece num quadro à parte, para o tutor ficar de olho</small></div>
            <div className="g-chips">
              {CHIPS_ATENCAO.map((c) => (
                <button key={c} type="button" className="g-chip" aria-pressed={atencaoChips.includes(c)}
                  onClick={() => { setAtencaoChips((l) => (l.includes(c) ? l.filter((x) => x !== c) : [...l, c])); setMudou(true); }}>{c}</button>
              ))}
            </div>
            <input className="g-input" maxLength={300} value={atencaoTexto} aria-label="Outra coisa para o tutor ficar de olho" placeholder="Outra coisa? Ex.: um pouco de tártaro" onChange={(e) => { setAtencaoTexto(e.target.value); setMudou(true); }} />
          </section>

          <section className="g-bol-parte" aria-label="Texto">
            <div className="g-bol-t"><b>Texto para o tutor</b><small>{textoProprio ? "você pode mudar à vontade" : "pronto, a partir dos recados"}</small></div>
            <textarea className="g-textarea g-bol-texto" maxLength={1500} value={texto} aria-label="Texto do boletim" onChange={(e) => { setTexto(e.target.value); setTextoProprio(true); setMudou(true); }} />
            <div className="g-fila">
              <button type="button" className="g-btn sec p" disabled={escrevendo} onClick={() => void escreverComMozart()}>
                {escrevendo ? <><Loader2 className="g-gira" />Escrevendo…</> : <><Sparkles />Escrever com o Mozart</>}
              </button>
              {textoProprio && texto !== modelo && <button type="button" className="g-btn fantasma p" onClick={() => { setTextoProprio(false); setMudou(true); }}><RotateCcw />Usar o texto pronto</button>}
            </div>
          </section>

          {guardado && !mudou && semFone && <p className="g-muted g-pp">{v.tutor ? "Sem telefone na ficha do tutor: copie o link e mande como preferir." : "Este pet não tem tutor na ficha: copie o link e mande como preferir."}</p>}
          {guardado && !mudou && !semFone && <button type="button" className="g-btn fantasma p" style={{ justifySelf: "start" }} onClick={() => void copiar(guardado)}><Copy />Copiar o link</button>}
          <p className="g-muted g-pp">O tutor abre pelo link, sem instalar nada. Não aparece telefone nem valor. O link vale 60 dias; as fotos continuam no Álbum, na ficha do pet.</p>
        </div>
      )}
    </Folha>
  );
}
