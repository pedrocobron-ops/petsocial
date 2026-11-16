"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, BedDouble, BookOpen, CalendarDays, Check, Clock, FileSpreadsheet, ImagePlus, LayoutGrid, Link2, Minus, PawPrint, Plus, Scissors, Sparkles, Trash2, Undo2, Users, X } from "lucide-react";
import type { Horario, Servico } from "@/lib/gestao/tipos";
import { vagasDe } from "@/lib/gestao/agenda";
import { areasDeServicoPara, artigoDe, categoriaDaArea, nomeDaCasa, usaModulo, type AreaDoServico } from "@/lib/gestao/modulos";
import { EscolherCor, GradeHorario, erroDoHorario, lerHorario } from "./ajustes/grade-horario";
import { CAMPOS_PRECO, EscolherArea, PrecosDoServico, comecaPorPorte, corLivre, inserirServico, umPrecoSo, type Precos } from "./servico-campos";
import { useGestao } from "./contexto";
import { Selo } from "./marca";
import { Tile } from "./painel";
import { brl } from "@/lib/gestao/util";
import { Campo, CampoValor, EVENTO_GUIA, abrirPersonalizarMenu, avisarMudanca, ok, useAvisos } from "./ui";
import Importar from "./importar";
import { TEMAS, aplicarTema, enviarLogo, tirarLogo } from "@/lib/gestao/identidade";
import { FalaMozart, PERGUNTAS, PreviaPainel, TrilhoBoasVindas, chaveBoasVindas, oQueDeixeiPronto } from "./boas-vindas";
import { guardarLembrado, lerLembrado } from "./lembrado";
import LogoLoja from "./logo-loja";
import { LojaNoGoogle } from "./ajustes/opcoes-boletim";
import OpcoesDaLoja from "./ajustes/opcoes-loja";
import "./ajustes/identidade.css";
import "./guia-inicial.css";

export { EVENTO_GUIA, abrirGuia } from "./ui";

type IdPasso = "cor" | "logo" | "horario" | "equipe" | "servicos" | "casa" | "link";
type PassoDoGuia = { id: IdPasso };

const CORES = ["#4d8f6b", "#3b82a0", "#7c6fb0", "#b0563f", "#8a7a3a", "#a05a82", "#c9773f"];
const DURACOES = [15, 30, 45, 60, 90, 120, 150, 180];
const textoDuracao = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}`);
type Preco = Pick<Servico, "id" | "nome" | "cor" | "ativo" | "categoria" | "duracao_min" | "preco_p" | "preco_m" | "preco_g" | "preco_gg">;
const lerVagas = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isInteger(n) ? n : NaN; };
/** Serviço que o dono acrescenta no guia ("Adicionar outro serviço"): só vai para o banco ao continuar. */
type ServicoNovo = { chave: string; nome: string; duracao_min: number; cor: string; area: AreaDoServico; porPorte: boolean } & Precos;
/** O que o guia guarda no aparelho enquanto não é gravado. */
type RascunhoGuia = {
  horario?: Horario; euAtendo?: boolean; novos?: string[]; vagas?: number | null; fora?: string[]; porPorte?: Record<string, boolean>;
  diariaCreche?: number | null; diariaHotel?: number | null; vagasCreche?: string; vagasHotel?: string; linkLigado?: boolean;
  precos?: Pick<Preco, "id" | "duracao_min" | "preco_p" | "preco_m" | "preco_g" | "preco_gg">[];
  servicosNovos?: ServicoNovo[];
};

/**
 * Guia da primeira vez. Os passos seguem o que o negócio faz (`petshops.modulos`): horário para todos; quem atende,
 * serviços com preço e link do cliente para quem faz banho e tosa; diária e vagas para creche e hotel.
 * Cada passo grava ao continuar e pode ficar para depois. O que é definido aqui regula a agenda, o link e o Mozart.
 * Quem acabou de criar o pet shop pelas boas-vindas (ver `boas-vindas.tsx`) passa antes por duas perguntas do Mozart:
 * a cor e a logo. O ponto em que parou fica no aparelho, então recarregar a página não repete a pergunta já respondida.
 * Aparece sozinho para o dono enquanto `petshops.guia_feito_em` está vazio; depois, só pelo botão em Meu pet shop.
 */
export default function GuiaInicial({ abrirAgora = false }: { /** a casca só carrega o guia quando ele vai abrir: veio pelo botão em Meu pet shop */ abrirAgora?: boolean }) {
  const { sb, petshop, souDono, liberado, recarregarBase } = useGestao();
  const { avisarErro } = useAvisos();
  // aberto desde a primeira entrada (guia ainda não feito) ou pelo botão em Meu pet shop; fica aberto até a pessoa fechar
  const [aberto, setAberto] = useState(() => abrirAgora || !petshop.guia_feito_em);
  const [vez, setVez] = useState(0); // cada abertura começa do primeiro passo, com os dados de agora
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    const abrir = () => { setVez((v) => v + 1); setAberto(true); };
    window.addEventListener(EVENTO_GUIA, abrir);
    return () => window.removeEventListener(EVENTO_GUIA, abrir);
  }, []);

  const visivel = souDono && liberado && aberto;
  useEffect(() => {
    if (!visivel) return;
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = antes; };
  }, [visivel]);

  async function fechar() {
    setAberto(false);
    if (petshop.guia_feito_em) return;
    try { ok(await sb.from("petshops").update({ guia_feito_em: new Date().toISOString() }).eq("id", petshop.id).select("id")); await recarregarBase(); }
    catch (e) { avisarErro(e); }
  }

  return (
    <>
      {visivel && <Guia key={vez} aoFechar={() => void fechar()} aoImportar={() => { void fechar(); setImportando(true); }} />}
      {importando && <Importar tipo="clientes" aoFechar={() => setImportando(false)} aoTerminar={avisarMudanca} />}
    </>
  );
}

function Guia({ aoFechar, aoImportar }: { aoFechar: () => void; aoImportar: () => void }) {
  const { sb, petshop, eu, equipe, servicos, recarregarBase } = useGestao();
  const { avisarErro } = useAvisos();
  const banho = usaModulo(petshop, "banho_tosa"), creche = usaModulo(petshop, "creche"), hotel = usaModulo(petshop, "hotel");
  const casa = nomeDaCasa(petshop);
  // os passos ficam fixos enquanto o guia está aberto
  // boas-vindas: só para quem acabou de criar o pet shop neste aparelho e ainda não passou pela cor e pela logo
  const chaveBV = chaveBoasVindas(petshop.id);
  const [passos] = useState<PassoDoGuia[]>(() => [
    ...(!petshop.guia_feito_em && ["cor", "logo"].includes(lerLembrado(chaveBV) ?? "") ? [{ id: "cor" as const }, { id: "logo" as const }] : []),
    { id: "horario" as const },
    ...(banho ? [{ id: "equipe" as const }, { id: "servicos" as const }] : []),
    ...(creche || hotel ? [{ id: "casa" as const }] : []),
    ...(banho ? [{ id: "link" as const }] : []),
  ]);
  // passos.length = pronto. Quem recarregou a página na pergunta da logo volta para ela (e ainda pode voltar para a cor).
  // Quem recarregou no meio dos passos (guia ainda não feito) volta para o passo em que estava; o que já gravou continua gravado.
  const chavePasso = `maestro-gestao-guia-passo-${petshop.id}`;
  const [passo, setPasso] = useState(() => {
    if (passos[1]?.id === "logo" && lerLembrado(chaveBV) === "logo") return 1;
    const guardado = petshop.guia_feito_em ? -1 : passos.findIndex((p) => p.id === lerLembrado(chavePasso));
    return guardado > 0 && passos[guardado].id !== "cor" && passos[guardado].id !== "logo" ? guardado : 0;
  });
  useEffect(() => { if (!petshop.guia_feito_em && passos[passo]) guardarLembrado(chavePasso, passos[passo].id); }, [passo]); // eslint-disable-line react-hooks/exhaustive-deps
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // o que foi digitado e ainda não gravado (preços, horas, diária) fica no aparelho, por pessoa: a aba que recarrega
  // ou fecha no meio do guia volta com tudo. Guia feito: o rascunho some.
  const chaveRascunho = `maestro-gestao-guia-rascunho-${petshop.id}-${eu.id}`;
  const [rascunho] = useState<RascunhoGuia | null>(() => {
    if (petshop.guia_feito_em) { try { localStorage.removeItem(chaveRascunho); } catch { /* tudo bem */ } return null; }
    try { return JSON.parse(lerLembrado(chaveRascunho) ?? "null") as RascunhoGuia | null; } catch { return null; }
  });
  const servicosDaLista = servicos.filter((s) => !["creche", "hotel"].includes(s.categoria));
  const [horario, setHorario] = useState<Horario>(() => (rascunho?.horario ? lerHorario(rascunho.horario) : lerHorario(petshop.horario)));
  const [euAtendo, setEuAtendo] = useState(rascunho?.euAtendo ?? eu.atende);
  const [novos, setNovos] = useState<string[]>(rascunho?.novos ?? []);
  const [nome, setNome] = useState("");
  const [vagas, setVagas] = useState<number | null>(rascunho && "vagas" in rascunho ? rascunho.vagas ?? null : petshop.vagas ?? null);
  const [precos, setPrecos] = useState<Preco[]>(() => servicosDaLista.map((s) => {
    const r = rascunho?.precos?.find((x) => x.id === s.id);
    return r ? { ...s, duracao_min: r.duracao_min, preco_p: r.preco_p, preco_m: r.preco_m, preco_g: r.preco_g, preco_gg: r.preco_gg } : { ...s };
  }));
  // serviços que o pet shop não oferece: saem da lista ao continuar
  const [fora, setFora] = useState<string[]>(() => rascunho?.fora?.filter((id) => servicos.some((s) => s.id === id)) ?? servicos.filter((s) => !s.ativo).map((s) => s.id));
  const [porPorte, setPorPorte] = useState<Record<string, boolean>>(() => ({ ...Object.fromEntries(servicos.map((s) => [s.id, comecaPorPorte(s)])), ...(rascunho?.porPorte ?? {}) }));
  const [errosPreco, setErrosPreco] = useState<Record<string, string>>({});
  // serviços que o dono acrescenta aqui: cartões em branco, gravados junto com os outros ao continuar
  const [servicosNovos, setServicosNovos] = useState<ServicoNovo[]>(() => rascunho?.servicosNovos ?? []);
  const [faltaNome, setFaltaNome] = useState(false);
  const areasDoServico = areasDeServicoPara(petshop);
  const [diariaCreche, setDiariaCreche] = useState<number | null>(rascunho && "diariaCreche" in rascunho ? rascunho.diariaCreche ?? null : petshop.diaria_creche == null ? null : Number(petshop.diaria_creche));
  const [diariaHotel, setDiariaHotel] = useState<number | null>(rascunho && "diariaHotel" in rascunho ? rascunho.diariaHotel ?? null : petshop.diaria_hotel == null ? null : Number(petshop.diaria_hotel));
  const [vagasCreche, setVagasCreche] = useState(rascunho?.vagasCreche ?? (petshop.vagas_creche == null ? "" : String(petshop.vagas_creche)));
  const [vagasHotel, setVagasHotel] = useState(rascunho?.vagasHotel ?? (petshop.vagas_hotel == null ? "" : String(petshop.vagas_hotel)));
  const [linkLigado, setLinkLigado] = useState(rascunho?.linkLigado ?? petshop.link_ativo);
  useEffect(() => {
    if (petshop.guia_feito_em) return;
    const r: RascunhoGuia = {
      horario, euAtendo, novos, vagas, fora, porPorte, diariaCreche, diariaHotel, vagasCreche, vagasHotel, linkLigado,
      precos: precos.map((x) => ({ id: x.id, duracao_min: x.duracao_min, preco_p: x.preco_p, preco_m: x.preco_m, preco_g: x.preco_g, preco_gg: x.preco_gg })),
      servicosNovos,
    };
    guardarLembrado(chaveRascunho, JSON.stringify(r));
  }, [horario, euAtendo, novos, vagas, fora, porPorte, diariaCreche, diariaHotel, vagasCreche, vagasHotel, linkLigado, precos, servicosNovos]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tema, setTema] = useState(petshop.tema);
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  // veio das boas-vindas: o Mozart conta o que deixou pronto antes de começar os passos
  const [veioDasBoasVindas] = useState(() => !petshop.guia_feito_em && lerLembrado(chaveBV) != null);
  const perguntas = passos.filter((p) => p.id === "cor" || p.id === "logo").length;
  // fechou o guia com uma cor só experimentada: o painel volta para a cor gravada
  const temaGravado = useRef(petshop.tema);
  useEffect(() => { temaGravado.current = petshop.tema; }, [petshop.tema]);
  useEffect(() => () => aplicarTema(temaGravado.current), []);
  const corpo = useRef<HTMLDivElement>(null);
  // o erro aparece junto do botão; se o campo errado ficou fora da tela, rola até ele
  useEffect(() => {
    if (!erro) return;
    const ruim = corpo.current?.querySelector<HTMLElement>(".ruim, [aria-invalid='true']");
    ruim?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [erro]);
  // cada passo abre do começo
  useEffect(() => { corpo.current?.scrollTo(0, 0); }, [passo]);

  const outros = equipe.filter((p) => p.ativo && p.atende && p.id !== eu.id);
  const atendem = (euAtendo ? 1 : 0) + outros.length + novos.length;
  const vagasAgora = vagas ?? Math.max(1, atendem);
  const primeiro = eu.nome.split(" ")[0];
  // os passos de configuração contam à parte das perguntas do Mozart
  const total = passos.length - perguntas;
  const atual = passos[passo]?.id;
  const fim = passo >= passos.length;
  const n = passo + 1 - perguntas;
  const pergunta = atual === "cor" || atual === "logo";
  const nPergunta = PERGUNTAS - perguntas + passo + 1;

  function juntarNome() {
    const t = nome.trim();
    if (t.length < 2) return;
    setNovos((l) => [...l, t.slice(0, 60)]);
    setNome("");
  }

  /** Vai para o passo seguinte; depois do último, o guia fica marcado como feito. */
  async function avancar() {
    if (pergunta) guardarLembrado(chaveBV, atual === "cor" && passos[passo + 1]?.id === "logo" ? "logo" : "feito");
    if (passo === passos.length - 1 && !petshop.guia_feito_em) {
      ok(await sb.from("petshops").update({ guia_feito_em: new Date().toISOString() }).eq("id", petshop.id).select("id"));
      try { localStorage.removeItem(chaveRascunho); } catch { /* tudo bem */ }
    }
    await recarregarBase();
    avisarMudanca();
    setPasso((p) => p + 1);
  }

  /** "Faço depois": segue sem gravar o que está neste passo. */
  async function pular() {
    setErro(null);
    setSalvando(true);
    // a cor que a pessoa só experimentou não fica
    if (atual === "cor") { aplicarTema(petshop.tema); setTema(petshop.tema); }
    try {
      // os preços ficam para depois, mas o serviço que o dono acrescentou e já tem nome não se perde (entra sem preço)
      if (atual === "servicos") await gravarServicosNovos(servicosNovos.filter((s) => s.nome.trim()).map((s) => ({ ...s, preco_p: null, preco_m: null, preco_g: null, preco_gg: null })));
      await avancar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  /** "Com pressa?": deixa a cor e a logo para depois, de uma vez. */
  function pularCorELogo() {
    setErro(null);
    aplicarTema(petshop.tema); setTema(petshop.tema);
    guardarLembrado(chaveBV, "feito");
    setPasso(perguntas);
  }

  function experimentarCor(id: string) {
    setTema(id);
    aplicarTema(id); // o painel muda na hora; só grava ao continuar
  }

  async function subirLogo(f: File | undefined) {
    if (!f) return;
    setErro(null);
    setEnviando(true);
    try { await enviarLogo(sb, petshop, f); await recarregarBase(); }
    catch (e) { avisarErro(e); } finally { setEnviando(false); if (arquivo.current) arquivo.current.value = ""; }
  }
  async function semLogo() {
    setEnviando(true);
    try { await tirarLogo(sb, petshop); await recarregarBase(); }
    catch (e) { avisarErro(e); } finally { setEnviando(false); }
  }

  async function continuar() {
    setErro(null);
    setSalvando(true);
    try {
      if (atual === "cor" && tema !== petshop.tema) {
        ok(await sb.from("petshops").update({ tema }).eq("id", petshop.id).select("id"));
      }
      if (atual === "horario") {
        const ruim = erroDoHorario(horario);
        if (ruim) { setErro(ruim); return; }
        if (!Object.values(horario).some(Boolean)) { setErro("Marque pelo menos um dia em que o pet shop abre."); return; }
        ok(await sb.from("petshops").update({ horario }).eq("id", petshop.id).select("id"));
      }
      if (atual === "equipe") {
        const pendente = nome.trim().length >= 2 ? [...novos, nome.trim().slice(0, 60)] : novos;
        if (!euAtendo && !outros.length && !pendente.length) { setErro("Diga quem atende os pets: você, alguém da equipe ou os dois."); return; }
        if (euAtendo !== eu.atende) ok(await sb.from("profissionais").update({ atende: euAtendo }).eq("id", eu.id).eq("petshop_id", petshop.id).select("id"));
        if (pendente.length) {
          ok(await sb.from("profissionais").insert(pendente.map((t, i) => ({ petshop_id: petshop.id, nome: t, papel: "funcionario" as const, funcao: "Banhista e tosador(a)", atende: true, cor: CORES[(outros.length + i) % CORES.length] }))).select("id"));
          setNovos([]); setNome("");
        }
        ok(await sb.from("petshops").update({ vagas: vagasAgora }).eq("id", petshop.id).select("id"));
        setVagas(vagasAgora);
      }
      if (atual === "servicos") {
        const ficam = precos.filter((s) => !fora.includes(s.id));
        if (precos.length && !ficam.length && !servicosNovos.length) { setErro("Deixe pelo menos um serviço na lista, ou toque em Faço depois."); return; }
        if (servicosNovos.some((s) => !s.nome.trim())) { setFaltaNome(true); setErro("Dê um nome ao serviço novo, ou tire pela lixeira."); return; }
        const comErro = [...ficam, ...servicosNovos.map((s) => ({ id: s.chave, nome: s.nome.trim() }))].find((s) => Object.keys(errosPreco).some((k) => k.startsWith(`${s.id}:`)));
        if (comErro) { setErro(`Confira o preço de ${comErro.nome}: use só números, sem valor negativo.`); return; }
        if (ficam.some((s) => CAMPOS_PRECO.some((c) => s[c] != null && s[c]! < 0))) { setErro("O preço não pode ser negativo."); return; }
        const apagados: string[] = [];
        for (const s of precos) {
          const antes = servicos.find((x) => x.id === s.id);
          if (!antes) continue;
          if (fora.includes(s.id)) {
            if (!antes.ativo) continue;
            // nunca usado: sai da lista de vez. Já usado em algum horário ou pacote: o banco não deixa apagar, então fica só desligado.
            const r = await sb.from("servicos").delete().eq("id", s.id).eq("petshop_id", petshop.id).select("id");
            if (r.error || !r.data?.length) ok(await sb.from("servicos").update({ ativo: false }).eq("id", s.id).eq("petshop_id", petshop.id).select("id"));
            else apagados.push(s.id);
            continue;
          }
          const mudou = !antes.ativo || antes.duracao_min !== s.duracao_min || CAMPOS_PRECO.some((c) => antes[c] !== s[c]);
          if (mudou) ok(await sb.from("servicos").update({ ativo: true, duracao_min: s.duracao_min, preco_p: s.preco_p, preco_m: s.preco_m, preco_g: s.preco_g, preco_gg: s.preco_gg }).eq("id", s.id).eq("petshop_id", petshop.id).select("id"));
        }
        if (apagados.length) { setPrecos((l) => l.filter((s) => !apagados.includes(s.id))); setFora((l) => l.filter((id) => !apagados.includes(id))); }
        await gravarServicosNovos(servicosNovos);
      }
      if (atual === "casa") {
        const vc = lerVagas(vagasCreche), vh = lerVagas(vagasHotel);
        if ([creche ? diariaCreche : null, hotel ? diariaHotel : null].some((v) => v != null && (v < 0 || v > 99999))) { setErro("Confira o preço da diária: use um valor entre 0 e R$ 99.999."); return; }
        if ([creche ? vc : null, hotel ? vh : null].some((v) => v != null && (Number.isNaN(v) || v < 1 || v > 500))) { setErro("As vagas ficam entre 1 e 500. Deixe em branco se não quiser limite."); return; }
        ok(await sb.from("petshops").update({
          ...(creche ? { diaria_creche: diariaCreche, vagas_creche: vc } : {}),
          ...(hotel ? { diaria_hotel: diariaHotel, vagas_hotel: vh } : {}),
        }).eq("id", petshop.id).select("id"));
      }
      if (atual === "link") {
        // ligou o link e faz creche ou hotel: o cliente já pode pedir vaga também (desliga em Link do cliente)
        const junto = linkLigado && !petshop.guia_feito_em ? {
          ...(creche && !petshop.link_creche ? { link_creche: true } : {}),
          ...(hotel && !petshop.link_hotel ? { link_hotel: true } : {}),
        } : {};
        if (linkLigado !== petshop.link_ativo || Object.keys(junto).length) {
          ok(await sb.from("petshops").update({ link_ativo: linkLigado, ...junto }).eq("id", petshop.id).select("id"));
        }
      }
      await avancar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  /** Grava os serviços acrescentados aqui e passa cada um para a lista de cima (voltar a este passo mostra como os outros). */
  async function gravarServicosNovos(lista: ServicoNovo[]) {
    let ordem = servicos.reduce((m, s) => Math.max(m, s.ordem), 0);
    for (const s of lista) {
      const precosDele = s.porPorte ? { preco_p: s.preco_p, preco_m: s.preco_m, preco_g: s.preco_g, preco_gg: s.preco_gg } : umPrecoSo(s);
      const linha = { nome: s.nome.trim().slice(0, 80), categoria: categoriaDaArea(s.area), duracao_min: s.duracao_min, cor: s.cor, ordem: ++ordem, ...precosDele };
      const id = await inserirServico(sb, petshop.id, linha);
      setServicosNovos((l) => l.filter((x) => x.chave !== s.chave));
      setPrecos((l) => [...l, { id, ativo: true, ...linha }]);
      setPorPorte((m) => ({ ...m, [id]: s.porPorte }));
      semErros(s.chave);
    }
  }
  function adicionarServico() {
    setErro(null); setFaltaNome(false);
    const usadas = [...precos.filter((s) => !fora.includes(s.id)).map((s) => s.cor), ...servicosNovos.map((s) => s.cor)];
    setServicosNovos((l) => [...l, {
      chave: `novo-${Date.now()}`, nome: "", duracao_min: 60, cor: corLivre(usadas), area: areasDoServico.includes("banho_tosa") ? "banho_tosa" : areasDoServico[0],
      porPorte: false, preco_p: null, preco_m: null, preco_g: null, preco_gg: null,
    }]);
  }
  const mudarNovo = (chave: string, campos: Partial<ServicoNovo>) => setServicosNovos((l) => l.map((s) => (s.chave === chave ? { ...s, ...campos } : s)));
  const mudarPreco = (id: string, campos: Partial<Preco>) => setPrecos((l) => l.map((s) => (s.id === id ? { ...s, ...campos } : s)));
  const semErros = (id: string) => setErrosPreco((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith(`${id}:`))));
  const anotarErro = (chave: string, ruim: string | null) => setErrosPreco((m) => { const x = { ...m }; if (ruim) x[chave] = ruim; else delete x[chave]; return x; });
  function trocarModo(s: Preco, comPorte: boolean) {
    setPorPorte((m) => ({ ...m, [s.id]: comPorte }));
    semErros(s.id);
    setErro(null);
    // um preço só: o primeiro valor preenchido passa a valer para todos os portes
    if (!comPorte) mudarPreco(s.id, umPrecoSo(s));
  }
  const cabeca = (titulo: string, texto: string) => (
    <div>
      <p className="g-rotulo">Passo {n} de {total}</p>
      <h2 className="g-guia-h">{titulo}</h2>
      <p className="g-muted g-p">{texto}</p>
    </div>
  );
  const naLista = precos.filter((s) => !fora.includes(s.id)), tirados = precos.filter((s) => fora.includes(s.id));
  const salvoH = lerHorario(petshop.horario);
  const servicosAtivos = servicos.filter((s) => s.ativo && !["creche", "hotel"].includes(s.categoria)).length;
  const resumoCasa = (rotulo: string, diaria: number | null, v: number | null) =>
    `${rotulo}: ${diaria != null ? `diária de ${brl(Number(diaria))}` : "diária para definir depois"}${v ? `, ${v === 1 ? "1 vaga" : `${v} vagas`}` : ""}`;

  return (
    <div className="g-guia" role="dialog" aria-modal="true" aria-label="Guia de configuração">
      <div className="g-guia-caixa">
        <header className="g-guia-topo">
          {!pergunta && <Selo tamanho={36} tom="verde" />}
          {pergunta ? <TrilhoBoasVindas agora={nPergunta} /> : (
            <div className="g-guia-trilho" role="img" aria-label={fim ? "Guia concluído" : `Passo ${n} de ${total}`}>
              {passos.slice(perguntas).map((p, i) => <span key={p.id} className={i < n - 1 ? "feito" : i === n - 1 ? "agora" : ""}><i /></span>)}
            </div>
          )}
          <button className="g-ico" onClick={aoFechar} aria-label="Fechar o guia" title={petshop.guia_feito_em ? "Fechar" : "Fechar e fazer depois"}><X /></button>
        </header>

        <div className="g-guia-corpo" ref={corpo}>
          {atual === "cor" && (
            <div className="g-pilha">
              <FalaMozart>Pronto, o seu espaço já existe. Agora a cor: toque em uma e veja o painel mudar.</FalaMozart>
              <div>
                <p className="g-rotulo">Pergunta {nPergunta} de {PERGUNTAS}</p>
                <h2 className="g-guia-h">Qual cor combina com o seu negócio?</h2>
                <button type="button" className="g-link g-bv-pressa" onClick={pularCorELogo} disabled={salvando}>Com pressa? Pular a cor e a logo</button>
              </div>
              <div className="g-idt-temas" role="radiogroup" aria-label="Cores do pet shop">
                {TEMAS.map((t) => (
                  <button key={t.id} type="button" role="radio" aria-checked={t.id === tema} className={`g-idt-tema${t.id === tema ? " on" : ""}`} onClick={() => experimentarCor(t.id)}>
                    <span className="amostra" style={{ background: t.tema }} aria-hidden><i style={{ background: t.destaque }} />{t.id === tema && <Check />}</span>
                    <span className="nome">{t.nome}</span>
                  </button>
                ))}
              </div>
              <PreviaPainel petshop={petshop} primeiroNome={primeiro} />
              <p className="g-bv-nota">Tem as cores da sua marca? Depois dá para usar exatamente elas, em Meu pet shop.</p>
            </div>
          )}

          {atual === "logo" && (
            <div className="g-pilha">
              <FalaMozart>{petshop.logo ? "Ficou com a sua cara. Olha onde ela aparece." : "Tem logo? Eu coloco no menu, no link que o cliente recebe e na agenda impressa."}</FalaMozart>
              <div>
                <p className="g-rotulo">Pergunta {nPergunta} de {PERGUNTAS}</p>
                <h2 className="g-guia-h">Quer colocar a sua logo?</h2>
              </div>
              <div className="g-bv-logo">
                <LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={64} />
                <div>
                  <span className="g-muted g-p">{petshop.logo ? "Sua logo está no lugar." : "Se não tiver agora, ficam as iniciais do nome. Imagem quadrada fica melhor."}</span>
                  <div className="acoes">
                    <input ref={arquivo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void subirLogo(e.target.files?.[0])} />
                    <button type="button" className="g-btn sec p" disabled={enviando} onClick={() => arquivo.current?.click()}><ImagePlus />{enviando ? "Enviando…" : petshop.logo ? "Trocar a logo" : "Escolher a imagem"}</button>
                    {petshop.logo && <button type="button" className="g-btn fantasma p" disabled={enviando} onClick={() => void semLogo()}><Trash2 />Tirar</button>}
                  </div>
                </div>
              </div>
              <div className="g-bv-onde">
                <p className="g-rotulo">Onde ela aparece</p>
                <PreviaPainel petshop={petshop} primeiroNome={primeiro} />
                <div className="g-bv-cliente" aria-hidden>
                  <LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={38} />
                  <span><b>{petshop.nome}</b><span>Assim o cliente vê o seu link.</span></span>
                </div>
              </div>
            </div>
          )}

          {!pergunta && !fim && n === 1 && (
            <p className="g-guia-intro">{veioDasBoasVindas && oQueDeixeiPronto(petshop) ? <>{oQueDeixeiPronto(petshop)}{" "}</> : null}
              <b>{veioDasBoasVindas && oQueDeixeiPronto(petshop) ? "Agora" : `${primeiro},`} {total === 1 ? "é um passo só" : `são ${total} passos curtos`} para deixar {artigoDe(petshop.nome).o} {petshop.nome} {artigoDe(petshop.nome).o === "a" ? "pronta" : "pronto"}.</b>{" "}
              O que não souber agora, toque em Faço depois: dá para mudar tudo em Meu pet shop.
            </p>
          )}

          {atual === "horario" && (
            <div className="g-pilha">
              {cabeca("Quando vocês abrem?", banho ? "A agenda só oferece horário dentro desses dias e horas. Já deixei o mais comum marcado: confira e siga." : "Já deixei o mais comum marcado: confira e siga.")}
              <GradeHorario valor={horario} aoMudar={(h) => { setHorario(h); setErro(null); }} modelos />
            </div>
          )}

          {atual === "equipe" && (
            <div className="g-pilha">
              {cabeca("Quem atende os pets?", "Quem aparece na agenda para receber os horários. Só o nome basta. Se você trabalha sozinho, é só continuar.")}
              <div className="g-guia-gente">
                <label className={`g-guia-pessoa${euAtendo ? " on" : ""}`}>
                  <input type="checkbox" checked={euAtendo} onChange={(e) => setEuAtendo(e.target.checked)} />
                  <span><b>{eu.nome}</b><small>Você {euAtendo ? "atende" : "não atende"} na agenda</small></span>
                </label>
                {outros.map((p) => <div key={p.id} className="g-guia-pessoa on fixa"><Check /><span><b>{p.nome}</b><small>Já está na equipe</small></span></div>)}
                {novos.map((t, i) => (
                  <div key={`${t}${i}`} className="g-guia-pessoa on fixa"><Check /><span><b>{t}</b><small>Entra na equipe ao continuar</small></span>
                    <button type="button" className="g-ico" aria-label={`Tirar ${t}`} onClick={() => setNovos((l) => l.filter((_, k) => k !== i))}><Trash2 /></button>
                  </div>
                ))}
              </div>
              <div className="g-guia-juntar">
                <input className="g-input" value={nome} placeholder="Nome de quem mais atende" onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); juntarNome(); } }} />
                <button type="button" className="g-btn sec" onClick={juntarNome} disabled={nome.trim().length < 2}><Plus />Adicionar</button>
              </div>

              <div className="g-guia-vagas">
                <div>
                  <h3>Quantos pets vocês atendem ao mesmo tempo?</h3>
                  <p className="g-muted g-p">{vagasAgora === 1 ? "Com 1, cada horário aceita um pet só." : `Com ${vagasAgora}, o mesmo horário aceita até ${vagasAgora} pets.`} Conte as mesas ou banheiras, não só as pessoas.</p>
                </div>
                <div className="g-guia-conta">
                  <button type="button" className="g-ico" aria-label="Menos" disabled={vagasAgora <= 1} onClick={() => setVagas(Math.max(1, vagasAgora - 1))}><Minus /></button>
                  <b className="g-num">{vagasAgora}</b>
                  <button type="button" className="g-ico" aria-label="Mais" disabled={vagasAgora >= 20} onClick={() => setVagas(Math.min(20, vagasAgora + 1))}><Plus /></button>
                </div>
              </div>
            </div>
          )}

          {atual === "servicos" && (
            <div className="g-pilha">
              {cabeca("O que vocês fazem e quanto custa?", "Já deixei os serviços mais comuns, sem preço: o valor é você quem coloca. Tire pela lixeira o que vocês não oferecem. Pode pôr só o preço do que mais sai (um banho, por exemplo) e deixar o resto em branco: você ajusta depois em Meu pet shop.")}
              <div><button type="button" className="g-btn sec p" onClick={() => void pular()} disabled={salvando}>Pôr os preços depois</button></div>
              {!precos.length && <p className="g-guia-legenda">Nenhum serviço na lista ainda. Você cria os seus em Meu pet shop, em Serviços e preços.</p>}
              <div className="g-guia-servicos">
                {naLista.map((s) => {
                  const comPorte = porPorte[s.id] ?? true;
                  return (
                    <section key={s.id} className="g-guia-servico" style={{ "--cor": s.cor } as React.CSSProperties}>
                      <div className="cabeca">
                        <b>{s.nome}</b>
                        <select className="g-select" aria-label={`Duração de ${s.nome}`} value={s.duracao_min} onChange={(e) => mudarPreco(s.id, { duracao_min: Number(e.target.value) })}>
                          {[...new Set([...DURACOES, s.duracao_min])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{textoDuracao(m)}</option>)}
                        </select>
                        <button type="button" className="g-ico" title="Não ofereço: tirar da lista" aria-label={`Não ofereço ${s.nome}: tirar da lista`} onClick={() => { setFora((l) => [...l, s.id]); semErros(s.id); setErro(null); }}><Trash2 /></button>
                      </div>
                      <PrecosDoServico servico={s.nome} valores={s} porPorte={comPorte} aoTrocarModo={(v) => trocarModo(s, v)}
                        aoMudar={(campos, c, ruim) => { mudarPreco(s.id, campos); setErro(null); anotarErro(`${s.id}:${c}`, ruim); }} />
                    </section>
                  );
                })}
                {servicosNovos.map((s) => {
                  const nomeDele = s.nome.trim() || "serviço novo";
                  return (
                    <section key={s.chave} className="g-guia-servico novo" style={{ "--cor": s.cor } as React.CSSProperties} aria-label={s.nome.trim() ? `Serviço novo: ${s.nome.trim()}` : "Serviço novo"}>
                      <div className="cabeca">
                        <input className={`g-input nome${faltaNome && !s.nome.trim() ? " ruim" : ""}`} value={s.nome} maxLength={80} placeholder="Nome do serviço" aria-label="Nome do serviço novo"
                          aria-invalid={faltaNome && !s.nome.trim()} autoFocus={!s.nome}
                          onChange={(e) => { mudarNovo(s.chave, { nome: e.target.value }); setErro(null); }} />
                        <select className="g-select" aria-label={`Duração de ${nomeDele}`} value={s.duracao_min} onChange={(e) => mudarNovo(s.chave, { duracao_min: Number(e.target.value) })}>
                          {DURACOES.map((m) => <option key={m} value={m}>{textoDuracao(m)}</option>)}
                        </select>
                        <button type="button" className="g-ico" title="Tirar este serviço" aria-label={`Tirar ${nomeDele} da lista`}
                          onClick={() => { setServicosNovos((l) => l.filter((x) => x.chave !== s.chave)); semErros(s.chave); setErro(null); }}><Trash2 /></button>
                      </div>
                      <EscolherArea areas={areasDoServico} valor={s.area} servico={nomeDele} aoMudar={(area) => mudarNovo(s.chave, { area })} />
                      <PrecosDoServico servico={nomeDele} valores={s} porPorte={s.porPorte}
                        aoTrocarModo={(v) => { semErros(s.chave); setErro(null); mudarNovo(s.chave, v ? { porPorte: true } : { porPorte: false, ...umPrecoSo(s) }); }}
                        aoMudar={(campos, c, ruim) => { mudarNovo(s.chave, campos); setErro(null); anotarErro(`${s.chave}:${c}`, ruim); }} />
                      <div className="g-sv-cor"><span className="g-rotulo">Cor na agenda</span><EscolherCor valor={s.cor} aoMudar={(cor) => mudarNovo(s.chave, { cor })} rotulo={`Cor de ${nomeDele}`} /></div>
                    </section>
                  );
                })}
                <button type="button" className="g-btn sec g-guia-mais" onClick={adicionarServico}><Plus />Adicionar outro serviço</button>
              </div>
              {[...naLista.map((s) => porPorte[s.id] ?? true), ...servicosNovos.map((s) => s.porPorte)].some(Boolean) && <p className="g-guia-legenda"><b>P</b> = pequeno · <b>M</b> = médio · <b>G</b> = grande · <b>GG</b> = gigante</p>}
              {tirados.length > 0 && (
                <div className="g-guia-fora">
                  <p className="g-rotulo">Fora da lista</p>
                  {tirados.map((s) => (
                    <div key={s.id}><span>{s.nome}</span><button type="button" className="g-btn fantasma p" onClick={() => { setFora((l) => l.filter((id) => id !== s.id)); setErro(null); }}><Undo2 />Voltar a oferecer</button></div>
                  ))}
                </div>
              )}
            </div>
          )}

          {atual === "casa" && (
            <div className="g-pilha">
              {cabeca(`${casa}: quanto custa e quantos pets cabem?`, "A diária já vem preenchida no check-in e na reserva. As vagas avisam quando a casa enche. Em branco, você digita o valor a cada estadia e a casa fica sem limite.")}
              {creche && (
                <div className="g-guia-bloco">
                  <h3>Creche</h3>
                  <div className="g-guia-dupla">
                    <Campo rotulo="Diária" dica="Por dia."><CampoValor valor={diariaCreche} aoMudar={(v) => { setDiariaCreche(v); setErro(null); }} placeholder="R$" /></Campo>
                    <Campo rotulo="Vagas" dica="Pets por dia.">
                      <input className="g-input g-tab" inputMode="numeric" placeholder="Sem limite" value={vagasCreche} onChange={(e) => { setVagasCreche(e.target.value.replace(/\D/g, "").slice(0, 3)); setErro(null); }} />
                    </Campo>
                  </div>
                </div>
              )}
              {hotel && (
                <div className="g-guia-bloco">
                  <h3>Hotel</h3>
                  <div className="g-guia-dupla">
                    <Campo rotulo="Diária" dica="Por noite."><CampoValor valor={diariaHotel} aoMudar={(v) => { setDiariaHotel(v); setErro(null); }} placeholder="R$" /></Campo>
                    <Campo rotulo="Vagas" dica="Pets por noite.">
                      <input className="g-input g-tab" inputMode="numeric" placeholder="Sem limite" value={vagasHotel} onChange={(e) => { setVagasHotel(e.target.value.replace(/\D/g, "").slice(0, 3)); setErro(null); }} />
                    </Campo>
                  </div>
                </div>
              )}
            </div>
          )}

          {atual === "link" && (
            <div className="g-pilha">
              {cabeca(banho ? "Quer que o cliente peça horário pelo celular?" : "Quer que o cliente peça vaga pelo celular?", banho ? "Você manda um link. O cliente vê só os horários livres, conforme o que você acabou de configurar, e envia o pedido. Nada é marcado sem você aceitar." : "Você manda um link. O cliente escolhe o dia e envia o pedido. Nada é marcado sem você aceitar.")}
              <button type="button" className={`g-guia-opcao${linkLigado ? " on" : ""}`} onClick={() => setLinkLigado(true)}>
                <Tile icone={Link2} tom="pessego" /><span><b>Sim, ligar o link</b><small>{banho ? 'Fica em "Mandar link de agendamento", na tela inicial.' : "Fica em Meu pet shop, em Link de agendamento."}</small></span>{linkLigado && <Check />}
              </button>
              <button type="button" className={`g-guia-opcao${!linkLigado ? " on" : ""}`} onClick={() => setLinkLigado(false)}>
                <Tile icone={CalendarDays} tom="menta" /><span><b>Agora não</b><small>Só a equipe marca. Dá para ligar depois.</small></span>{!linkLigado && <Check />}
              </button>
            </div>
          )}

          {fim && (
            <div className="g-guia-ola">
              <span className="g-guia-ok"><Check /></span>
              <h1>Pronto para usar, <em className="it">{primeiro}</em>.</h1>
              <ul className="g-guia-resumo">
                <li><Clock /><span>Aberto em {Object.values(salvoH).filter(Boolean).length} dias da semana</span></li>
                {banho && <li><Users /><span>{vagasDe(petshop, equipe) === 1 ? "1 pet por horário" : `Até ${vagasDe(petshop, equipe)} pets no mesmo horário`}</span></li>}
                {banho && <li><Scissors /><span>{servicosAtivos === 1 ? "1 serviço na agenda" : `${servicosAtivos} serviços na agenda`}</span></li>}
                {creche && <li><BedDouble /><span>{resumoCasa("Creche", petshop.diaria_creche, petshop.vagas_creche)}</span></li>}
                {hotel && <li><BedDouble /><span>{resumoCasa("Hotel", petshop.diaria_hotel, petshop.vagas_hotel)}</span></li>}
                {banho && <li><Link2 /><span>Link do cliente {petshop.link_ativo ? "ligado" : "desligado"}</span></li>}
              </ul>
              {usaModulo(petshop, "loja") && (
                <section className="g-guia-bloco g-guia-loja" aria-label="Opções da loja">
                  <h3>Para a venda de produtos</h3>
                  <p className="g-muted g-pp">Usa leitor de código de barras ou quer ver a margem de cada produto? Ligue aqui. Também ficam em Meu pet shop, Loja, e no Estoque, em Opções.</p>
                  <OpcoesDaLoja solto />
                </section>
              )}
              <section className="g-guia-bloco" aria-label="Sua loja aparece no Google?">
                <h3>Sua loja aparece no Google?</h3>
                <LojaNoGoogle solto />
              </section>
              <p className="g-muted">O que ficou para depois está em Meu pet shop. Agora, por onde quer começar?</p>
              <div className="g-guia-proximos">
                <Link className="g-btn pri" href="/gestao/app/clientes?novo=1" onClick={aoFechar}><PawPrint />Cadastrar o primeiro pet</Link>
                <button type="button" className="g-btn sec" onClick={aoImportar}><FileSpreadsheet />Trazer meus clientes de uma planilha</button>
                <Link className="g-btn fantasma" href="/gestao/app/manual" onClick={aoFechar}><BookOpen />Ver o manual</Link>
                <button type="button" className="g-btn fantasma" onClick={() => { aoFechar(); abrirPersonalizarMenu(); }}><LayoutGrid />Escolher o que aparece no menu</button>
              </div>
            </div>
          )}
        </div>

        {erro && <p className="g-erro g-guia-erro" role="alert">{erro}</p>}
        <footer className="g-guia-pe">
          {fim ? (
            <button className="g-btn verde" onClick={aoFechar}><Sparkles />Ir para a tela inicial</button>
          ) : (
            <>
              {passo > 0 && <button className="g-btn fantasma g-guia-volta" onClick={() => { setErro(null); setPasso((p) => p - 1); }} disabled={salvando} aria-label="Voltar ao passo anterior"><ArrowLeft /></button>}
              <button className="g-btn fantasma g-guia-depois" onClick={() => void pular()} disabled={salvando}>Faço depois</button>
              <button className="g-btn pri" onClick={() => void continuar()} disabled={salvando || enviando}>{salvando ? "Salvando…" : passo === passos.length - 1 ? "Concluir" : "Continuar"}<ArrowRight /></button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
