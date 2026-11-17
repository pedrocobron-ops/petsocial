"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CalendarDays, FileText, HandCoins, ImagePlus, Lock, NotebookPen, Syringe, Tags, Trash2, TriangleAlert, Users, X } from "lucide-react";
import { brl, fimDoTelefone, isoDia, juntaDiaHora, lerTelefone, semAcento } from "@/lib/gestao/util";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { lancarAReceber, parteDaChave } from "@/lib/gestao/dinheiro";
import { useOperacao } from "@/lib/gestao/uma-vez";
import {
  BUCKET_CADERNO_TMP, LADO_DA_FOTO, LIMITE_DO_ENVIO, MAX_BYTES_PDF, MAX_IMAGENS, MAX_PAGINAS_PDF, MAX_PDFS, TIPOS_DA_PAGINA,
  type AreaLida, type Leitura, type RespostaCaderno, type TipoCuidado, type TipoDaPagina,
} from "@/lib/gestao/caderno";
import { AREAS_DE_SERVICO, areaDoServico, areasDeServicoPara, categoriaDaArea } from "@/lib/gestao/modulos";
import { CAMPOS_PRECO, corLivre, inserirServico, mudarServico, type Precos } from "./servico-campos";
import { TIPOS_SAUDE } from "./clientes/saude";
import { useGestao } from "./contexto";
import { CampoValor, Folha, avisarMudanca, mensagemDeErro, ok, useAvisos, useSomenteLeitura } from "./ui";
import "./caderno.css";

type Arq = { id: string; nome: string; pdf: boolean; blob: Blob; previa: string | null; paginas: number };
type Pet = { nome: string; especie: "cao" | "gato" | "outro"; raca: string; porte: string; marcado: boolean };
type LinhaCliente = { id: string; marcado: boolean; nome: string; telefone: string; obs: string; pets: Pet[]; duvida: boolean; juntar: boolean };
type LinhaDivida = { id: string; marcado: boolean; nome: string; telefone: string; valor: number | null; desde: string; descricao: string; duvida: boolean; juntar: boolean };
type LinhaHorario = { id: string; marcado: boolean; dia: string; hora: string; pet: string; tutor: string; servico: string; duvida: boolean };
type LinhaServico = { id: string; marcado: boolean; nome: string; area: AreaLida; duracao: number | null; precos: Precos; duvida: boolean };
type LinhaVacina = { id: string; marcado: boolean; tipo: TipoCuidado; nome: string; aplicado: string; vence: string; vet: string; duvida: boolean };
type SaudeJa = { tipo: string; nome: string; aplicado_em: string | null };
type ClienteJa = { id: string; nome: string; telefone: string | null; obs: string | null };
type PetJa = { id: string; cliente_id: string; nome: string; raca: string | null; porte: string | null };

const uid = () => Math.random().toString(36).slice(2, 10);
/** uuid v4 (o nome do arquivo na pasta temporária); randomUUID só existe em https */
const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID()
  : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b, i) => (i === 6 ? (b & 15) | 64 : i === 8 ? (b & 63) | 128 : b).toString(16).padStart(2, "0")).join("").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-"));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const PORTES = ["", "P", "M", "G", "GG"];
const NOME_PORTE: Record<string, string> = { preco_p: "P", preco_m: "M", preco_g: "G", preco_gg: "GG" };

/** Foto HEIC (o formato das fotos do iPhone): só abre onde o navegador sabe abrir (Safari). */
const ehHeic = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
/** Diminui a foto no aparelho (lado maior 1600 px, JPEG): a leitura fica igual e o envio fica leve. HEIC só abre onde o navegador sabe abrir. */
async function paraJpeg(f: File): Promise<Blob> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, LADO_DA_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("sem canvas");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    if (!b) throw new Error("sem jpeg");
    return b;
  } finally { URL.revokeObjectURL(url); }
}
/** Páginas do PDF contadas no aparelho (o servidor confere de novo). 0 = não deu para contar. */
async function paginasDoPdf(f: File): Promise<number> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const d = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
    const n = d.numPages;
    void d.destroy();
    return n;
  } catch { return 0; }
}

/**
 * Trazer do caderno ou do outro sistema: foto do caderno, print de tela ou PDF exportado. A IA lê no servidor, a pessoa confere
 * cada linha aqui (corrige, desmarca, junta com quem já existe) e nada é salvo antes de "Salvar N itens".
 * O que é salvo vai pelos caminhos de sempre: clientes e pets como na planilha, "Anotar o que X deve" (com o dia em que
 * começou) e horários da agenda (só os de hoje em diante). Os arquivos não são guardados (PDF grande passa pela pasta temporária
 * caderno-tmp e é apagado logo depois de ler).
 */
export default function FotoCaderno({ aoFechar, aoTerminar, tipoInicial, pet }: {
  aoFechar: () => void; aoTerminar?: () => void; tipoInicial?: TipoDaPagina;
  /** Carteirinha de vacinação: a folha lê só os cuidados de saúde deste pet. */
  pet?: { id: string; nome: string };
}) {
  const { sb, petshop, user, servicos, posso, vejoFinanceiro, souDono, recarregarBase } = useGestao();
  const { avisar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const podeDivida = vejoFinanceiro;
  const podeAgenda = posso("agenda");
  const tipos = TIPOS_DA_PAGINA.filter((t) => t.id !== "vacinas" && (t.id !== "dividas" || podeDivida) && (t.id !== "agenda" || podeAgenda) && (t.id !== "precos" || souDono));
  const [tipo, setTipo] = useState<TipoDaPagina | null>(pet ? "vacinas" : tipoInicial && tipos.some((t) => t.id === tipoInicial) ? tipoInicial : null);
  const [arqs, setArqs] = useState<Arq[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<"escolher" | "lendo" | "conferir" | "pronto">("escolher");
  const [cota, setCota] = useState<{ restam: number; limite: number } | null>(null);
  const [clientes, setClientes] = useState<LinhaCliente[]>([]);
  const [dividas, setDividas] = useState<LinhaDivida[]>([]);
  const [horarios, setHorarios] = useState<LinhaHorario[]>([]);
  const [linhasS, setLinhasS] = useState<LinhaServico[]>([]);
  const [linhasV, setLinhasV] = useState<LinhaVacina[]>([]);
  const [saudeJa, setSaudeJa] = useState<SaudeJa[]>([]);
  const [duvidas, setDuvidas] = useState<string[]>([]);
  const [ja, setJa] = useState<{ clientes: ClienteJa[]; pets: PetJa[] } | null>(null);
  const [resumo, setResumo] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const hoje = isoDia(new Date());

  // quanto ainda dá para ler hoje (sem gastar nada)
  useEffect(() => {
    let vale = true;
    void sb.rpc("caderno_contar", { p_petshop: petshop.id, p_paginas: 0 }).then((r) => {
      const c = r.data as { ok?: boolean; restam?: number; limite?: number } | null;
      if (vale && c?.ok) setCota({ restam: c.restam ?? 0, limite: c.limite ?? 0 });
    }, () => {});
    return () => { vale = false; };
  }, [sb, petshop.id]);
  // as prévias das fotos saem da memória ao fechar
  const arqsRef = useRef(arqs);
  arqsRef.current = arqs;
  useEffect(() => () => { arqsRef.current.forEach((a) => a.previa && URL.revokeObjectURL(a.previa)); }, []);

  const paginas = arqs.reduce((s, a) => s + a.paginas, 0);
  const imagens = arqs.filter((a) => !a.pdf).length, pdfs = arqs.length - imagens;

  async function acrescentar(lista: FileList | null) {
    if (!lista?.length) return;
    setErro(null); setPreparando(true);
    const novos: Arq[] = [];
    const problemas: string[] = [];
    let nImg = imagens, nPdf = pdfs;
    for (const f of Array.from(lista)) {
      const pdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
      if (pdf) {
        if (nPdf >= MAX_PDFS) { problemas.push(`Dá para mandar até ${MAX_PDFS} PDFs de cada vez.`); continue; }
        if (f.size > MAX_BYTES_PDF) { problemas.push(`“${f.name}” passa de 10 MB: divida o PDF em partes menores.`); continue; }
        const n = await paginasDoPdf(f);
        if (n > MAX_PAGINAS_PDF) { problemas.push(`“${f.name}” tem ${n} páginas: mande até ${MAX_PAGINAS_PDF} por PDF (divida em partes).`); continue; }
        nPdf++;
        novos.push({ id: uid(), nome: f.name, pdf: true, blob: f, previa: null, paginas: Math.max(n, 1) });
      } else {
        if (nImg >= MAX_IMAGENS) { problemas.push(`Dá para mandar até ${MAX_IMAGENS} fotos ou prints de cada vez.`); continue; }
        if (f.type && !f.type.startsWith("image/")) { problemas.push(`“${f.name}” não é foto nem PDF.`); continue; }
        try {
          const b = await paraJpeg(f);
          nImg++;
          novos.push({ id: uid(), nome: f.name || "Foto", pdf: false, blob: b, previa: URL.createObjectURL(b), paginas: 1 });
        } catch {
          problemas.push(ehHeic(f)
            ? `“${f.name || "A foto"}” está em HEIC, o formato das fotos do iPhone, e este navegador não abre esse formato. Abra o Maestro no Safari do iPhone e mande de lá, ou tire um print da foto e mande o print.`
            : `Não consegui abrir “${f.name || "a foto"}”. Tire a foto de novo pela câmera ou mande um print.`);
        }
      }
    }
    setArqs((a) => [...a, ...novos]);
    if (problemas.length) setErro([...new Set(problemas)].join(" "));
    setPreparando(false);
  }
  function tirar(id: string) {
    setArqs((a) => { const x = a.find((y) => y.id === id); if (x?.previa) URL.revokeObjectURL(x.previa); return a.filter((y) => y.id !== id); });
  }

  /* ---------- leitura ---------- */

  async function ler() {
    if (!tipo || !arqs.length || somenteLeitura()) return;
    if (cota && paginas > cota.restam) { setErro(cota.restam ? `Hoje ainda dá para ler ${plural(cota.restam, "página", "páginas")}. Tire alguma foto ou página da lista, ou continue amanhã.` : `Hoje já foram lidas as ${cota.limite} páginas do dia. Amanhã dá para ler mais.`); return; }
    setErro(null); setEtapa("lendo");
    const temporarios: string[] = [];
    try {
      const { data } = await sb.auth.getSession();
      // envio grande demais para mandar de uma vez (a Vercel recusa acima de ~4,5 MB): os PDFs maiores sobem antes para a
      // pasta temporária e vão só pelo caminho; o servidor lê e apaga logo depois de ler
      const subir = new Set<string>();
      let total = arqs.reduce((t, a) => t + a.blob.size, 0);
      for (const a of [...arqs].filter((x) => x.pdf).sort((x, y) => y.blob.size - x.blob.size)) {
        if (total <= LIMITE_DO_ENVIO) break;
        const caminho = `${petshop.id}/${uuid()}.pdf`;
        const up = await sb.storage.from(BUCKET_CADERNO_TMP).upload(caminho, a.blob, { contentType: "application/pdf", upsert: false });
        if (up.error) break; // sem a pasta (banco antes da atualização): vai junto, como antes
        temporarios.push(caminho); subir.add(a.id); total -= a.blob.size;
      }
      const form = new FormData();
      form.set("petshopId", petshop.id);
      form.set("tipo", tipo);
      form.set("paginas", arqs.filter((a) => a.pdf && !subir.has(a.id)).map((a) => a.paginas).join(","));
      arqs.forEach((a) => { if (!subir.has(a.id)) form.append("arquivo", a.blob, a.pdf ? a.nome : `${a.id}.jpg`); });
      const subidos = arqs.filter((a) => subir.has(a.id));
      subidos.forEach((a, i) => form.append("caminho", temporarios[i]));
      if (subidos.length) form.set("paginas_caminho", subidos.map((a) => a.paginas).join(","));
      const [r, existentes] = await Promise.all([
        fetch("/api/gestao/caderno", { method: "POST", headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: form }),
        lerExistentes(),
      ]);
      const j = (await r.json().catch(() => null)) as RespostaCaderno | null;
      if (!r.ok || !j || "erro" in j) {
        const e = j && "erro" in j ? j : null;
        if (e?.limite != null) setCota({ restam: e.restam ?? 0, limite: e.limite });
        setErro(r.status === 413 && !e ? "Os arquivos são grandes demais para mandar de uma vez. Mande menos páginas por vez." : e?.mensagem ?? "Não deu para ler agora. Confira a internet e tente de novo.");
        setEtapa("escolher");
        return;
      }
      setCota({ restam: j.restam, limite: j.limite });
      setJa(existentes);
      if (pet) setSaudeJa(ok(await sb.from("pets_saude").select("tipo, nome, aplicado_em").eq("petshop_id", petshop.id).eq("pet_id", pet.id).limit(500)));
      montarConferencia(j.leitura);
      setEtapa("conferir");
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEtapa("escolher");
    } finally {
      // o servidor já apagou; se o pedido caiu antes, apaga daqui (o que sobrar sai na faxina, depois de uma hora)
      if (temporarios.length) void sb.storage.from(BUCKET_CADERNO_TMP).remove(temporarios).then(() => null, () => null);
    }
  }

  async function lerExistentes() {
    const [c, p] = await Promise.all([
      lerTudo<ClienteJa>((de, ate, contar) => sb.from("clientes").select("id, nome, telefone, obs", contando(contar)).eq("petshop_id", petshop.id).order("id").range(de, ate)),
      lerTudo<PetJa>((de, ate, contar) => sb.from("pets").select("id, cliente_id, nome, raca, porte", contando(contar)).eq("petshop_id", petshop.id).order("id").range(de, ate)),
    ]);
    return { clientes: c, pets: p };
  }

  function montarConferencia(l: Leitura) {
    setClientes(l.clientes.map((c) => ({ id: uid(), marcado: Boolean(c.nome), nome: c.nome, telefone: c.telefone, obs: c.obs, duvida: c.duvida, juntar: true,
      pets: c.pets.map((p) => ({ nome: p.nome, especie: p.especie, raca: p.raca, porte: p.porte ?? "", marcado: true })) })));
    setDividas(l.dividas.map((d) => ({ id: uid(), marcado: Boolean(d.cliente_nome) && d.valor != null, nome: d.cliente_nome, telefone: d.telefone, valor: d.valor, desde: d.desde ?? "", descricao: d.descricao, duvida: d.duvida, juntar: true })));
    setHorarios(l.agenda.map((a) => ({ id: uid(), marcado: Boolean(a.dia && a.hora && a.dia >= hoje && a.pet_nome), dia: a.dia ?? "", hora: a.hora ?? "", pet: a.pet_nome, tutor: a.tutor_nome, servico: a.servico, duvida: a.duvida })));
    setLinhasS(l.servicos.map((x) => ({ id: uid(), marcado: true, nome: x.nome, area: x.area, duracao: x.duracao_min, duvida: x.duvida,
      precos: { preco_p: x.preco_p, preco_m: x.preco_m, preco_g: x.preco_g, preco_gg: x.preco_gg } })));
    setLinhasV(l.vacinas.map((x) => ({ id: uid(), marcado: true, tipo: x.tipo, nome: x.nome, aplicado: x.aplicado ?? "", vence: x.vence ?? "", vet: x.veterinario, duvida: x.duvida })));
    setDuvidas(l.duvidas);
  }

  /* ---------- quem já existe ---------- */

  /** Mesmo telefone = mesma pessoa; mesmo nome sem telefone diferente = mesma pessoa (como na planilha). */
  function acharCliente(lista: ClienteJa[], nome: string, telefone: string): ClienteJa | null {
    const fim = fimDoTelefone(lerTelefone(telefone).fone);
    if (fim) { const x = lista.find((c) => fimDoTelefone(c.telefone) === fim); if (x) return x; }
    const n = semAcento(nome);
    if (!n) return null;
    const x = lista.find((c) => semAcento(c.nome) === n);
    if (!x) return null;
    const outro = fim && fimDoTelefone(x.telefone) && fimDoTelefone(x.telefone) !== fim;
    return outro ? null : x;
  }
  const existeCliente = (nome: string, telefone: string) => (ja ? acharCliente(ja.clientes, nome, telefone) : null);
  const petJaExiste = (clienteId: string, nome: string) => Boolean(ja?.pets.some((p) => p.cliente_id === clienteId && semAcento(p.nome) === semAcento(nome)));

  const servicoDe = (nome: string) => servicos.find((x) => semAcento(x.nome) === semAcento(nome));
  /** Os preços (e o tempo) que mudariam num serviço que já existe. */
  function mudancasDe(x: LinhaServico) {
    const ja = servicoDe(x.nome);
    if (!ja) return null;
    const precos = CAMPOS_PRECO.filter((c) => x.precos[c] != null && Number(ja[c] ?? -1) !== x.precos[c]).map((c) => ({ campo: c, de: ja[c] == null ? null : Number(ja[c]), para: x.precos[c]! }));
    const duracao = x.duracao != null && x.duracao !== ja.duracao_min ? { de: ja.duracao_min, para: x.duracao } : null;
    return { ja, precos, duracao };
  }
  const servicoIgual = (x: LinhaServico) => { const m = mudancasDe(x); return Boolean(m && !m.precos.length && !m.duracao); };
  const vacinaJa = (x: LinhaVacina) => saudeJa.some((c) => c.tipo === x.tipo && semAcento(c.nome) === semAcento(x.nome) && (c.aplicado_em ?? "") === x.aplicado);

  const passou = (h: LinhaHorario) => Boolean(h.dia) && h.dia < hoje;
  const horarioOk = (h: LinhaHorario) => Boolean(h.dia && /^\d{2}:\d{2}$/.test(h.hora) && h.pet.trim()) && !passou(h);
  const marcadosC = clientes.filter((c) => c.marcado && c.nome.trim());
  const marcadosD = dividas.filter((d) => d.marcado && d.nome.trim() && d.valor != null && d.valor > 0);
  const marcadosH = horarios.filter((h) => h.marcado && horarioOk(h));
  const marcadosS = linhasS.filter((x) => x.marcado && x.nome.trim() && !servicoIgual(x) && CAMPOS_PRECO.some((c) => x.precos[c] != null));
  const marcadosV = linhasV.filter((x) => x.marcado && x.nome.trim() && !vacinaJa(x));
  const total = marcadosC.length + marcadosD.length + marcadosH.length + marcadosS.length + marcadosV.length;
  const totalDividas = marcadosD.reduce((s, d) => s + (d.valor ?? 0), 0);
  const passados = horarios.filter(passou).length;

  /* ---------- salvar ---------- */

  // o que já foi criado nesta folha (linha → id): tentar de novo depois de um erro no meio não cria de novo
  const criados = useRef(new Map<string, string>());
  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (!total || salvando || somenteLeitura()) return;
    setSalvando(true); setErro(null);
    const r = { novos: 0, juntados: 0, pets: 0, dividas: 0, horarios: 0, horariosJa: 0, semPet: [] as string[], servicosNovos: 0, servicosMudados: 0, cuidados: 0 };
    try {
      const e = await lerExistentes();
      const lista = [...e.clientes];
      const pets = [...e.pets];
      const doLote = new Map<string, string>(); // nome sem acento → cliente desta leitura

      async function cliente(linha: string, nome: string, telefone: string, juntar: boolean, obs?: string) {
        const ja = criados.current.get(linha);
        if (ja) return ja;
        const fone = lerTelefone(telefone).fone;
        const achado = juntar ? acharCliente(lista, nome, telefone) : null;
        if (achado) {
          // já existe: só preenche o que estava em branco
          const falta: { telefone?: string; obs?: string } = {};
          if (!achado.telefone?.trim() && fone) falta.telefone = fone;
          if (!achado.obs?.trim() && obs?.trim()) falta.obs = obs.trim().slice(0, 600);
          if (Object.keys(falta).length) { ok(await sb.from("clientes").update(falta).eq("id", achado.id).eq("petshop_id", petshop.id).select("id").single()); Object.assign(achado, falta); }
          criados.current.set(linha, achado.id);
          r.juntados++;
          return achado.id;
        }
        const novo = ok(await sb.from("clientes").insert({ petshop_id: petshop.id, nome: nome.trim().slice(0, 120), telefone: fone, obs: obs?.trim().slice(0, 600) || null }).select("id").single());
        criados.current.set(linha, novo.id);
        lista.push({ id: novo.id, nome: nome.trim(), telefone: fone, obs: obs?.trim() || null });
        r.novos++;
        return novo.id;
      }
      async function gravarPet(linha: string, clienteId: string, p: { nome: string; especie: string; raca: string; porte: string }) {
        const ja = criados.current.get(linha);
        if (ja) return ja;
        const existe = pets.find((x) => x.cliente_id === clienteId && semAcento(x.nome) === semAcento(p.nome));
        if (existe) {
          const falta: { raca?: string; porte?: string } = {};
          if (!existe.raca?.trim() && p.raca.trim()) falta.raca = p.raca.trim().slice(0, 60);
          if (!existe.porte && p.porte) falta.porte = p.porte;
          if (Object.keys(falta).length) ok(await sb.from("pets").update(falta).eq("id", existe.id).eq("petshop_id", petshop.id).select("id").single());
          criados.current.set(linha, existe.id);
          return existe.id;
        }
        const novo = ok(await sb.from("pets").insert({ petshop_id: petshop.id, cliente_id: clienteId, nome: p.nome.trim().slice(0, 80), especie: p.especie, raca: p.raca.trim().slice(0, 60) || null, porte: p.porte || null }).select("id").single());
        pets.push({ id: novo.id, cliente_id: clienteId, nome: p.nome.trim(), raca: p.raca || null, porte: p.porte || null });
        criados.current.set(linha, novo.id);
        r.pets++;
        return novo.id;
      }

      for (const c of marcadosC) {
        const id = await cliente(`c:${c.id}`, c.nome, c.telefone, c.juntar, c.obs);
        doLote.set(semAcento(c.nome), id);
        for (const [i, p] of c.pets.entries()) if (p.marcado && p.nome.trim()) await gravarPet(`c:${c.id}:p${i}`, id, p);
      }

      for (const d of marcadosD) {
        const id = (d.juntar ? doLote.get(semAcento(d.nome)) : undefined) ?? await cliente(`d:${d.id}`, d.nome, d.telefone, d.juntar);
        if (criados.current.has(`d:${d.id}:conta`)) continue;
        await lancarAReceber(sb, petshop.id, {
          valor: d.valor!, vencimento: isoDia(new Date(Date.now() + 7 * 864e5)), categoria: "Outros",
          descricao: (d.descricao.trim() || "Trazido do caderno").slice(0, 120), clienteId: id,
          devidoDesde: d.desde && d.desde <= hoje ? d.desde : null, chave: parteDaChave(chave, "divida", d.id),
        });
        criados.current.set(`d:${d.id}:conta`, id);
        r.dividas++;
      }

      for (const h of marcadosH) {
        if (criados.current.has(`h:${h.id}:feito`)) continue;
        // o pet: pelo tutor (desta leitura ou do cadastro) e o nome; senão, um pet só com esse nome no pet shop
        const tutorId = h.tutor.trim() ? doLote.get(semAcento(h.tutor)) ?? acharCliente(lista, h.tutor, "")?.id : undefined;
        let petId = tutorId ? pets.find((p) => p.cliente_id === tutorId && semAcento(p.nome) === semAcento(h.pet))?.id : undefined;
        if (!petId && !tutorId) { const so = pets.filter((p) => semAcento(p.nome) === semAcento(h.pet)); if (so.length === 1) petId = so[0].id; }
        if (!petId) {
          if (!h.tutor.trim()) { r.semPet.push(h.pet); continue; }
          const id = tutorId ?? await cliente(`h:${h.id}`, h.tutor, "", true);
          petId = await gravarPet(`h:${h.id}:pet`, id, { nome: h.pet, especie: "cao", raca: "", porte: "" });
        }
        const s = servicos.find((x) => x.ativo && semAcento(x.nome) === semAcento(h.servico))
          ?? (h.servico.trim() ? servicos.find((x) => x.ativo && semAcento(x.nome).includes(semAcento(h.servico))) : undefined);
        const inicio = juntaDiaHora(h.dia, h.hora);
        const fim = new Date(inicio.getTime() + (s?.duracao_min ?? 60) * 60000);
        // o mesmo pet no mesmo horário já marcado: não marca de novo
        const repetido = ok(await sb.from("agendamentos").select("id").eq("petshop_id", petshop.id).eq("pet_id", petId).eq("inicio", inicio.toISOString()).neq("status", "cancelado").limit(1));
        if (repetido.length) { r.horariosJa++; criados.current.set(`h:${h.id}:feito`, repetido[0].id); continue; }
        const preco = s && vejoFinanceiro ? (await sb.rpc("preco_de_tabela", { p_petshop: petshop.id, p_servico: s.id, p_pet: petId })).data ?? null : undefined;
        const novo = ok(await sb.from("agendamentos").insert({
          petshop_id: petshop.id, pet_id: petId, servico_id: s?.id ?? null, inicio: inicio.toISOString(), fim: fim.toISOString(), criado_por: user.id,
          obs: s ? "Trazido do caderno" : `Trazido do caderno: ${h.servico.trim() || "serviço não escrito"}`.slice(0, 400),
          ...(preco !== undefined ? { preco: preco as number | null } : {}),
        }).select("id").single());
        criados.current.set(`h:${h.id}:feito`, novo.id);
        r.horarios++;
      }

      // tabela de preços: serviço que já existe muda só o que a pessoa conferiu; o novo entra pelo mesmo caminho do guia
      if (marcadosS.length) {
        const agora = ok(await sb.from("servicos").select("id, nome, cor, ativo").eq("petshop_id", petshop.id));
        const cores = agora.filter((x) => x.ativo).map((x) => x.cor);
        for (const x of marcadosS) {
          if (criados.current.has(`s:${x.id}`)) continue;
          const m = mudancasDe(x);
          const ja = agora.find((y) => semAcento(y.nome) === semAcento(x.nome));
          if (ja && m) {
            const campos: Partial<Precos & { duracao_min: number }> = Object.fromEntries(m.precos.map((p) => [p.campo, p.para]));
            if (m.duracao) campos.duracao_min = m.duracao.para;
            if (Object.keys(campos).length) await mudarServico(sb, petshop.id, ja.id, campos);
            r.servicosMudados++;
          } else if (!ja) {
            const cor = corLivre(cores);
            cores.push(cor);
            await inserirServico(sb, petshop.id, { nome: x.nome.trim().slice(0, 80), categoria: categoriaDaArea(x.area), duracao_min: x.duracao ?? 60, cor, ativo: true, ...x.precos });
            r.servicosNovos++;
          }
          criados.current.set(`s:${x.id}`, "1");
        }
        await recarregarBase();
      }

      // carteirinha: cada cuidado entra na saúde do pet, como em "Adicionar"; o que já está anotado não repete
      if (pet && marcadosV.length) {
        const agora = ok(await sb.from("pets_saude").select("tipo, nome, aplicado_em").eq("petshop_id", petshop.id).eq("pet_id", pet.id).limit(500));
        for (const x of marcadosV) {
          if (criados.current.has(`v:${x.id}`)) continue;
          const repetido = agora.some((c) => c.tipo === x.tipo && semAcento(c.nome) === semAcento(x.nome) && (c.aplicado_em ?? "") === x.aplicado);
          if (!repetido) {
            ok(await sb.from("pets_saude").insert({
              petshop_id: petshop.id, pet_id: pet.id, tipo: x.tipo, nome: x.nome.trim().slice(0, 80), aplicado_em: x.aplicado || null, vence_em: x.vence || null,
              obs: x.vet.trim() ? `Veterinário: ${x.vet.trim()}`.slice(0, 300) : null, criado_por: user.id,
            }).select("id").single());
            r.cuidados++;
          }
          criados.current.set(`v:${x.id}`, "1");
        }
      }

      setResumo([
        r.servicosNovos ? `${plural(r.servicosNovos, "serviço novo", "serviços novos")} na lista de preços.` : "",
        r.servicosMudados ? `${plural(r.servicosMudados, "serviço teve", "serviços tiveram")} o preço atualizado.` : "",
        r.cuidados ? `${plural(r.cuidados, "cuidado anotado", "cuidados anotados")} na saúde de ${pet?.nome ?? "pet"}.` : "",
        r.novos || r.juntados ? `${plural(r.novos, "cliente novo", "clientes novos")}${r.juntados ? ` e ${plural(r.juntados, "junto com a ficha que já existia", "juntos com fichas que já existiam")}` : ""}.` : "",
        r.pets ? `${plural(r.pets, "pet novo", "pets novos")} no cadastro.` : "",
        r.dividas ? `${plural(r.dividas, "conta anotada", "contas anotadas")} em Quem me deve: ${brl(totalDividas)} ao todo. O dinheiro só entra no caixa no dia em que o cliente pagar.` : "",
        r.horarios ? `${plural(r.horarios, "horário marcado", "horários marcados")} na agenda.` : "",
        r.horariosJa ? `${plural(r.horariosJa, "horário já estava", "horários já estavam")} na agenda e não ${r.horariosJa === 1 ? "foi marcado" : "foram marcados"} de novo.` : "",
        passados ? `${plural(passados, "horário de dia que já passou ficou", "horários de dias que já passaram ficaram")} de fora.` : "",
        r.semPet.length ? `Sem o nome do tutor, ${r.semPet.join(", ")} ${r.semPet.length === 1 ? "ficou" : "ficaram"} fora da agenda: marque pela Agenda.` : "",
      ].filter(Boolean));
      setEtapa("pronto");
      avisar("Pronto: o que você conferiu foi salvo.");
      avisarMudanca();
      aoTerminar?.();
    } catch (err) {
      setErro(`Parou no meio: ${mensagemDeErro(err)} O que entrou antes do erro ficou salvo; toque em Salvar de novo, que nada se repete.`);
      aoTerminar?.();
      return false;
    } finally { setSalvando(false); }
  }

  /* ---------- tela ---------- */

  const mudarC = (id: string, m: Partial<LinhaCliente>) => setClientes((l) => l.map((x) => (x.id === id ? { ...x, ...m } : x)));
  const mudarD = (id: string, m: Partial<LinhaDivida>) => setDividas((l) => l.map((x) => (x.id === id ? { ...x, ...m } : x)));
  const mudarH = (id: string, m: Partial<LinhaHorario>) => setHorarios((l) => l.map((x) => (x.id === id ? { ...x, ...m } : x)));
  const nada = etapa === "conferir" && !clientes.length && !dividas.length && !horarios.length && !linhasS.length && !linhasV.length;

  const rodape = etapa === "conferir" && !nada ? (
    <div className="g-cad-rodape">
      {marcadosD.length > 0 && <span className="g-muted g-pp">Dívidas marcadas: <b>{brl(totalDividas)}</b></span>}
      <div className="g-fila">
        <button type="button" className="g-btn sec" disabled={salvando} onClick={() => { setEtapa("escolher"); setErro(null); }}>Ler outras páginas</button>
        <button type="button" className="g-btn verde" disabled={!total || salvando || op.ocupado} onClick={() => void salvar()}>
          {salvando ? "Salvando… não feche" : total ? `Salvar ${plural(total, "item", "itens")}` : "Marque o que quer salvar"}
        </button>
      </div>
    </div>
  ) : undefined;

  return (
    <Folha titulo={pet ? `Ler a carteirinha de ${pet.nome}` : "Trazer do caderno ou do outro sistema"} aoFechar={aoFechar} larga rodape={rodape}>
      {etapa === "pronto" ? (
        <div className="g-pilha">
          <div className="g-aviso verde g-imp-resumo" role="status">{resumo.length ? resumo.map((t) => <p key={t}>{t}</p>) : <p>Nada novo: tudo já estava no sistema.</p>}</div>
          <p className="g-muted g-pp">Confira as fichas novas quando puder: o que a leitura marcou com “Verificar” vale uma olhada.</p>
          <div className="g-fila">
            <button type="button" className="g-btn sec" onClick={() => { setArqs([]); setEtapa("escolher"); setResumo([]); criados.current.clear(); }}>Trazer mais páginas</button>
            <button type="button" className="g-btn verde" onClick={aoFechar}>Pronto</button>
          </div>
        </div>
      ) : etapa === "lendo" ? (
        <div className="g-cad-lendo" role="status" aria-live="polite">
          <NotebookPen aria-hidden />
          <b>Lendo {plural(paginas, "página", "páginas")}…</b>
          <p className="g-muted">Pode levar até um minuto. Não feche esta janela.</p>
        </div>
      ) : etapa === "conferir" ? (
        <div className="g-pilha">
          {nada ? (
            <div className="g-aviso amarelo" role="status">
              <p><b>Não achei nada para trazer nestas páginas.</b> Tente uma foto mais de perto, com boa luz, com a página inteira aparecendo.</p>
            </div>
          ) : (
            <p className="g-muted g-p">Confira o que eu li. <b>Nada foi salvo ainda.</b> Corrija o que estiver errado e desmarque o que não quer trazer.</p>
          )}
          {duvidas.length > 0 && (
            <div className="g-aviso amarelo g-cad-duvidas" role="note">
              <TriangleAlert aria-hidden />
              <div><b>O que não deu para ler com certeza</b><ul>{duvidas.map((d) => <li key={d}>{d}</li>)}</ul></div>
            </div>
          )}

          {clientes.length > 0 && (
            <section className="g-cad-secao" aria-label="Clientes e pets">
              <h3><Users aria-hidden />Clientes e pets <span className="g-muted">({clientes.length})</span></h3>
              {clientes.map((c) => {
                const existe = existeCliente(c.nome, c.telefone);
                const fone = lerTelefone(c.telefone);
                const verificar = c.duvida || !fone.fone;
                return (
                  <div key={c.id} className={`g-cad-linha${c.marcado ? "" : " fora"}`} data-linha="cliente">
                    <div className="g-cad-cab">
                      <input type="checkbox" checked={c.marcado} onChange={(e) => mudarC(c.id, { marcado: e.target.checked })} aria-label={`Trazer ${c.nome || "este cliente"}`} />
                      <input className="g-input" value={c.nome} onChange={(e) => mudarC(c.id, { nome: e.target.value })} placeholder="Nome do tutor" aria-label="Nome do tutor" />
                    </div>
                    <div className="g-cad-tags">
                      {existe && c.juntar && <span className="g-tag azul">Já existe</span>}
                      {verificar && <span className="g-tag amarelo">Verificar{!fone.fone ? (c.telefone ? ": telefone incompleto" : ": sem telefone") : ""}</span>}
                    </div>
                    {existe && (
                      <label className="g-check g-cad-juntar">
                        <input type="checkbox" checked={c.juntar} onChange={(e) => mudarC(c.id, { juntar: e.target.checked })} />
                        <span>{c.juntar ? <>Juntar com a ficha de <b>{existe.nome}</b> (não cria outra)</> : <>Cadastrar como outra pessoa, separada de {existe.nome}</>}</span>
                      </label>
                    )}
                    <div className="g-cad-campos">
                      <label className="g-campo"><span>Telefone</span><input className="g-input" inputMode="tel" value={c.telefone} onChange={(e) => mudarC(c.id, { telefone: e.target.value })} /></label>
                      <label className="g-campo"><span>Observações</span><input className="g-input" value={c.obs} onChange={(e) => mudarC(c.id, { obs: e.target.value })} /></label>
                    </div>
                    {c.pets.map((p, i) => {
                      const jaTem = existe && c.juntar && petJaExiste(existe.id, p.nome);
                      const mudarP = (m: Partial<Pet>) => mudarC(c.id, { pets: c.pets.map((x, n) => (n === i ? { ...x, ...m } : x)) });
                      return (
                        <div key={i} className={`g-cad-pet${p.marcado ? "" : " fora"}`}>
                          <input type="checkbox" checked={p.marcado} onChange={(e) => mudarP({ marcado: e.target.checked })} aria-label={`Trazer o pet ${p.nome}`} />
                          <input className="g-input" value={p.nome} onChange={(e) => mudarP({ nome: e.target.value })} aria-label="Nome do pet" placeholder="Pet" />
                          <select className="g-select" value={p.especie} onChange={(e) => mudarP({ especie: e.target.value as Pet["especie"] })} aria-label="Espécie">
                            <option value="cao">Cão</option><option value="gato">Gato</option><option value="outro">Outro</option>
                          </select>
                          <input className="g-input" value={p.raca} onChange={(e) => mudarP({ raca: e.target.value })} aria-label="Raça" placeholder="Raça" />
                          <select className="g-select" value={p.porte} onChange={(e) => mudarP({ porte: e.target.value })} aria-label="Porte">
                            {PORTES.map((x) => <option key={x} value={x}>{x || "Porte?"}</option>)}
                          </select>
                          {jaTem && <span className="g-tag">Já cadastrado: só completa</span>}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          )}

          {dividas.length > 0 && (
            <section className="g-cad-secao" aria-label="Quem me deve">
              <h3><HandCoins aria-hidden />Quem me deve <span className="g-muted">({dividas.length})</span></h3>
              {dividas.map((d) => {
                const existe = existeCliente(d.nome, d.telefone) ?? (clientes.some((c) => c.marcado && semAcento(c.nome) === semAcento(d.nome)) ? { id: "", nome: d.nome } : null);
                const verificar = d.duvida || d.valor == null;
                return (
                  <div key={d.id} className={`g-cad-linha${d.marcado ? "" : " fora"}`} data-linha="divida">
                    <div className="g-cad-cab">
                      <input type="checkbox" checked={d.marcado} onChange={(e) => mudarD(d.id, { marcado: e.target.checked })} aria-label={`Trazer a dívida de ${d.nome || "este cliente"}`} />
                      <input className="g-input" value={d.nome} onChange={(e) => mudarD(d.id, { nome: e.target.value })} placeholder="Nome do cliente" aria-label="Nome do cliente" />
                    </div>
                    <div className="g-cad-tags">
                      {existe && d.juntar && <span className="g-tag azul">Já existe</span>}
                      {!existe && <span className="g-tag">Cliente novo</span>}
                      {verificar && <span className="g-tag amarelo">Verificar{d.valor == null ? ": valor" : ""}</span>}
                    </div>
                    {existe && existe.id && (
                      <label className="g-check g-cad-juntar">
                        <input type="checkbox" checked={d.juntar} onChange={(e) => mudarD(d.id, { juntar: e.target.checked })} />
                        <span>{d.juntar ? <>Anotar na ficha de <b>{existe.nome}</b></> : <>Cadastrar como outra pessoa</>}</span>
                      </label>
                    )}
                    <div className="g-cad-campos">
                      <label className="g-campo"><span>Valor</span><CampoValor valor={d.valor} aoMudar={(v) => mudarD(d.id, { valor: v })} rotulo="Valor que deve" /></label>
                      <label className="g-campo"><span>Deve desde</span><input className="g-input" type="date" max={hoje} value={d.desde} onChange={(e) => mudarD(d.id, { desde: e.target.value })} /></label>
                      <label className="g-campo"><span>Do quê</span><input className="g-input" value={d.descricao} onChange={(e) => mudarD(d.id, { descricao: e.target.value })} placeholder="Banho, tosa…" /></label>
                      {!existe && <label className="g-campo"><span>Telefone</span><input className="g-input" inputMode="tel" value={d.telefone} onChange={(e) => mudarD(d.id, { telefone: e.target.value })} /></label>}
                    </div>
                  </div>
                );
              })}
              <p className="g-cad-total">Total marcado: <b>{brl(totalDividas)}</b> <span className="g-muted g-pp">· entra em A receber, na ficha de cada cliente. O caixa só recebe quando o cliente pagar.</span></p>
            </section>
          )}

          {horarios.length > 0 && (
            <section className="g-cad-secao" aria-label="Agenda">
              <h3><CalendarDays aria-hidden />Agenda <span className="g-muted">({horarios.length})</span></h3>
              {passados > 0 && <p className="g-muted g-pp">Horários de dias que já passaram não entram na agenda.</p>}
              {horarios.map((h) => {
                const ja = passou(h);
                const verificar = !ja && (h.duvida || !horarioOk(h));
                return (
                  <div key={h.id} className={`g-cad-linha${h.marcado && !ja ? "" : " fora"}`} data-linha="horario">
                    <div className="g-cad-cab">
                      <input type="checkbox" checked={h.marcado && !ja} disabled={ja} onChange={(e) => mudarH(h.id, { marcado: e.target.checked })} aria-label={`Marcar ${h.pet || "este horário"}`} />
                      <input className="g-input" value={h.pet} onChange={(e) => mudarH(h.id, { pet: e.target.value })} placeholder="Pet" aria-label="Nome do pet" />
                    </div>
                    <div className="g-cad-tags">
                      {ja && <span className="g-tag">Já passou: não entra</span>}
                      {verificar && <span className="g-tag amarelo">Verificar</span>}
                    </div>
                    <div className="g-cad-campos">
                      <label className="g-campo"><span>Dia</span><input className="g-input" type="date" value={h.dia} onChange={(e) => mudarH(h.id, { dia: e.target.value })} /></label>
                      <label className="g-campo"><span>Hora</span><input className="g-input" type="time" value={h.hora} onChange={(e) => mudarH(h.id, { hora: e.target.value })} /></label>
                      <label className="g-campo"><span>Tutor</span><input className="g-input" value={h.tutor} onChange={(e) => mudarH(h.id, { tutor: e.target.value })} /></label>
                      <label className="g-campo"><span>Serviço</span><input className="g-input" value={h.servico} onChange={(e) => mudarH(h.id, { servico: e.target.value })} /></label>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
          {linhasS.length > 0 && (
            <section className="g-cad-secao" aria-label="Tabela de preços">
              <h3><Tags aria-hidden />Tabela de preços <span className="g-muted">({linhasS.length})</span></h3>
              {linhasS.map((x) => {
                const m = mudancasDe(x);
                const igual = servicoIgual(x);
                const semPreco = CAMPOS_PRECO.every((c) => x.precos[c] == null);
                const mudarS = (n: Partial<LinhaServico>) => setLinhasS((l) => l.map((y) => (y.id === x.id ? { ...y, ...n } : y)));
                return (
                  <div key={x.id} className={`g-cad-linha${x.marcado && !igual ? "" : " fora"}`} data-linha="servico">
                    <div className="g-cad-cab">
                      <input type="checkbox" checked={x.marcado && !igual} disabled={igual} onChange={(e) => mudarS({ marcado: e.target.checked })} aria-label={`Trazer ${x.nome || "este serviço"}`} />
                      <input className="g-input" value={x.nome} onChange={(e) => mudarS({ nome: e.target.value })} placeholder="Serviço" aria-label="Nome do serviço" />
                    </div>
                    <div className="g-cad-tags">
                      {!m && <span className="g-tag verde">Serviço novo</span>}
                      {igual && <span className="g-tag">Igual ao que já está</span>}
                      {(x.duvida || semPreco) && <span className="g-tag amarelo">Verificar{semPreco ? ": sem preço" : ""}</span>}
                    </div>
                    {m && !igual && (
                      <ul className="g-cad-mudancas">
                        {m.precos.map((p) => <li key={p.campo}>Atualizar o preço de <b>{m.ja.nome} {NOME_PORTE[p.campo]}</b> de {p.de == null ? "sem preço" : brl(p.de)} para <b>{brl(p.para)}</b>?</li>)}
                        {m.duracao && <li>Tempo de {m.duracao.de} para <b>{m.duracao.para} min</b>?</li>}
                      </ul>
                    )}
                    <div className="g-cad-campos precos">
                      {CAMPOS_PRECO.map((c) => (
                        <label key={c} className="g-campo"><span>{NOME_PORTE[c]}</span>
                          <CampoValor valor={x.precos[c]} aoMudar={(v) => mudarS({ precos: { ...x.precos, [c]: v } })} rotulo={`Preço ${NOME_PORTE[c]} de ${x.nome}`} />
                        </label>
                      ))}
                      {!m && (
                        <label className="g-campo"><span>Área</span>
                          <select className="g-select" value={x.area} onChange={(e) => mudarS({ area: e.target.value as AreaLida })}>
                            {AREAS_DE_SERVICO.filter((a) => areasDeServicoPara(petshop, areaDoServico(x.area)).includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.rotulo}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="g-muted g-pp">Os horários já marcados continuam com o preço de quando foram marcados.</p>
            </section>
          )}

          {linhasV.length > 0 && (
            <section className="g-cad-secao" aria-label="Carteirinha">
              <h3><Syringe aria-hidden />Carteirinha de {pet?.nome} <span className="g-muted">({linhasV.length})</span></h3>
              {linhasV.map((x) => {
                const ja = vacinaJa(x);
                const mudarV = (n: Partial<LinhaVacina>) => setLinhasV((l) => l.map((y) => (y.id === x.id ? { ...y, ...n } : y)));
                return (
                  <div key={x.id} className={`g-cad-linha${x.marcado && !ja ? "" : " fora"}`} data-linha="vacina">
                    <div className="g-cad-cab">
                      <input type="checkbox" checked={x.marcado && !ja} disabled={ja} onChange={(e) => mudarV({ marcado: e.target.checked })} aria-label={`Anotar ${x.nome || "este cuidado"}`} />
                      <input className="g-input" value={x.nome} onChange={(e) => mudarV({ nome: e.target.value })} placeholder="Vacina ou remédio" aria-label="Nome" />
                    </div>
                    <div className="g-cad-tags">
                      {ja && <span className="g-tag">Já anotada</span>}
                      {!ja && !x.vence && <span className="g-tag laranja">Definir vencimento</span>}
                      {x.duvida && <span className="g-tag amarelo">Verificar</span>}
                    </div>
                    <div className="g-cad-campos">
                      <label className="g-campo"><span>Tipo</span>
                        <select className="g-select" value={x.tipo} onChange={(e) => mudarV({ tipo: e.target.value as TipoCuidado })}>
                          {TIPOS_SAUDE.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                        </select>
                      </label>
                      <label className="g-campo"><span>Aplicada em</span><input className="g-input" type="date" max={hoje} value={x.aplicado} onChange={(e) => mudarV({ aplicado: e.target.value })} /></label>
                      <label className="g-campo"><span>Próxima dose</span><input className="g-input" type="date" value={x.vence} onChange={(e) => mudarV({ vence: e.target.value })} /></label>
                      <label className="g-campo"><span>Veterinário</span><input className="g-input" value={x.vet} onChange={(e) => mudarV({ vet: e.target.value })} /></label>
                    </div>
                  </div>
                );
              })}
              <p className="g-muted g-pp">A próxima dose só vem preenchida quando está escrita na carteirinha. Sem ela, defina com o tutor ou deixe em branco.</p>
            </section>
          )}

          {erro && <p className="g-aviso vermelho" role="alert">{erro}</p>}
          {nada && <div className="g-fila"><button type="button" className="g-btn sec" onClick={() => setEtapa("escolher")}>Tentar com outras fotos</button></div>}
        </div>
      ) : (
        <div className="g-pilha">
          <p className="g-muted g-p">
            {pet ? `Tire foto das páginas da carteirinha de vacinação de ${pet.nome}. Eu leio, você confere, e só então salva na saúde dele.`
              : "Tire foto do caderno, mande um print da tela ou o PDF da lista do sistema que você usava. Eu leio, você confere, e só então salva."}
          </p>
          {!pet && <div className="g-card liso g-pilha p">
            <b className="g-p">1. O que tem nessas páginas?</b>
            <div className="g-cad-tipos" role="radiogroup" aria-label="O que tem nessas páginas">
              {tipos.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={tipo === t.id} className={`g-cad-tipo${tipo === t.id ? " sim" : ""}`} onClick={() => setTipo(t.id)}>
                  <b>{t.rotulo}</b><span>{t.apoio}</span>
                </button>
              ))}
            </div>
          </div>}
          <div className="g-card liso g-pilha p">
            <b className="g-p">{pet ? "As fotos da carteirinha" : "2. As fotos, prints ou PDF"}</b>
            <div className="g-fila">
              <label className="g-btn pri" style={{ cursor: "pointer" }}>
                <Camera />{pet ? "Tirar foto da carteirinha" : tipo === "precos" ? "Tirar foto da tabela" : "Tirar foto do caderno"}
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void acrescentar(e.target.files); e.target.value = ""; }} />
              </label>
              <label className="g-btn sec" style={{ cursor: "pointer" }}>
                <ImagePlus />Escolher fotos, prints ou PDF
                <input type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={(e) => { void acrescentar(e.target.files); e.target.value = ""; }} />
              </label>
            </div>
            <p className="g-muted g-pp">Até {MAX_IMAGENS} fotos ou prints e até {MAX_PDFS} PDFs (de até {MAX_PAGINAS_PDF} páginas) por vez. Uma página por foto, de perto e com boa luz.</p>
            {preparando && <p className="g-muted g-pp" role="status">Preparando as fotos…</p>}
            {arqs.length > 0 && (
              <ul className="g-cad-arqs" aria-label="Arquivos escolhidos">
                {arqs.map((a) => (
                  <li key={a.id}>
                    {a.previa ? <img src={a.previa} alt="" /> : <span className="g-cad-pdf"><FileText aria-hidden /></span>}
                    <span>{a.pdf ? `${a.nome} · ${plural(a.paginas, "página", "páginas")}` : "Foto"}</span>
                    <button type="button" className="g-cad-tirar" onClick={() => tirar(a.id)} aria-label={`Tirar ${a.pdf ? a.nome : "esta foto"}`}><X /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="g-cad-privado"><Lock aria-hidden />As fotos e arquivos servem só para a leitura: não ficam guardados. PDF grande passa por uma pasta reservada e é apagado logo depois de ler.</p>
          {cota && (
            <p className="g-muted g-pp" data-cota>
              {cota.restam > 0 ? `Hoje ainda dá para ler ${plural(cota.restam, "página", "páginas")} (cada foto, print ou página de PDF conta uma).` : `Hoje já foram lidas as ${cota.limite} páginas do dia. Amanhã dá para ler mais.`}
            </p>
          )}
          {erro && <p className="g-aviso vermelho" role="alert">{erro}</p>}
          <div className="g-fila">
            <button type="button" className="g-btn verde" disabled={!tipo || !arqs.length || preparando} onClick={() => void ler()}>
              <NotebookPen />{arqs.length ? `Ler ${plural(paginas, "página", "páginas")}` : "Ler"}
            </button>
            <button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button>
            {arqs.length > 0 && <button type="button" className="g-btn fantasma" onClick={() => { arqs.forEach((a) => a.previa && URL.revokeObjectURL(a.previa)); setArqs([]); }}><Trash2 />Tirar todos</button>}
          </div>
          {!tipo && arqs.length > 0 && <p className="g-muted g-pp">Escolha no passo 1 o que tem nas páginas.</p>}
        </div>
      )}
    </Folha>
  );
}
