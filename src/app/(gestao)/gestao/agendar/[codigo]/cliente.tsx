"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { PrecoDoHotel } from "./estadia";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BedDouble, CalendarDays, Cat, Check, Clock, Dog, MapPin, MessageCircle, PawPrint, Plus, Scissors, Star, Sun, X } from "lucide-react";
import { Marca, Selo } from "@/components/gestao/marca";
import { configurado } from "@/lib/gestao/supabase-config";
import { adiantarBanco, bancoDepois as banco } from "@/lib/gestao/supabase-depois";
import { PORTES, type Porte } from "@/lib/gestao/tipos";
import { brlCurto, deIsoDia, fmtTelefone, horarioDoDia, isoDia, linkWhatsApp, nomeDia, nomeDiaCurto, nomeMes, soDigitos, somaDias } from "@/lib/gestao/util";
import LogoLoja from "@/components/gestao/logo-loja";
import { aplicarTema } from "@/lib/gestao/identidade";
import { MUITOS_PEDIDOS, lembrarPedido } from "@/lib/gestao/link-opcoes";
import { AceiteDosTermos, PedidosDesteAparelho, SEM_ACEITE, faltaAceitar, pedirPeloLink, useTermosDoLink } from "./termos";
import { lerLinkJunto, type LinkInicial } from "@/lib/gestao/link-inicial";
import { enderecoDaLoja, linkDoMapa } from "@/lib/gestao/endereco";
import { comDesconto, partesPorExtenso, portePorExtenso, real, totalPorExtenso, valorDosServicos, valorNaFrase, valorPorExtenso, type LinhaDeValor } from "@/lib/gestao/link-precos";
import type { Sugestao } from "@/lib/gestao/link-ia-comum";
import { diasCurtos, etiquetaPromo, horasPorExtenso, precoComPromo, promoDoHorario, validadePorExtenso, type Promocao } from "@/lib/gestao/promocoes";
import { precoDoServico } from "@/lib/gestao/util";
import "./agendar.css";

// creche e hotel (só abre com um toque) e o "Tirar dúvida" (só quando o dono ligou) vêm à parte: no celular com internet
// fraca, a página do link fica usável sem esperar baixar o que o tutor talvez nem abra
const carregarEstadia = () => import("./estadia");
const EstadiaPeloLink = dynamic(carregarEstadia, { loading: () => <div className="g-esq" style={{ minHeight: 220 }} aria-busy="true" /> });
const DuvidaNoLink = dynamic(() => import("./duvida"));

type ServicoDoLink = {
  id: string; nome: string; duracao_min: number; cor: string | null;
  preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null;
};
type Info = {
  logo?: string | null; tema?: string | null;
  nome: string; telefone: string | null; cidade: string | null; uf: string | null; horario: unknown; aviso: string | null; hoje: string;
  /** endereço do pet shop (migração 20261235; tudo opcional) */
  endereco?: string | null; bairro?: string | null; complemento?: string | null;
  servicos: ServicoDoLink[];
  creche?: { diaria: number | null } | null; hotel?: { diaria: number | null } | null;
};
type Passo = "servico" | "quando" | "dados" | "enviado";
/** Promoção do link (link_promocoes): os serviços já vêm abertos (os do link que entram nela). */
type PromoDoLink = Omit<Promocao, "id" | "ativa" | "criado_em">;
type Especie = "cao" | "gato" | "outro";
type PetDoPedido = { id: number; nome: string; especie: Especie; porte: Porte | null };
type Enviado = { id: string | null; servico: string; servicos: string[]; dia: string; pets: { nome: string; hora: string }[]; promo?: string | null; valores: LinhaDeValor[] };
/**
 * O que a pessoa já preencheu no pedido de horário, guardado só nesta aba (sessionStorage): recarregar a página ou voltar
 * de outro aplicativo não perde o pedido. Sai ao enviar e deixa de valer depois de 2 horas (não fica dado pessoal guardado).
 */
type Rascunho = { em: number; passo: "quando" | "dados"; servicoId: string; extras?: string[]; dia: string | null; hora: string | null; pets: { nome: string; especie: Especie; porte: Porte | null }[]; tutor: string; telefone: string; obs: string };
const VALE_RASCUNHO = 2 * 36e5;
function lerRascunho(chave: string): Rascunho | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(chave) ?? "null") as Partial<Rascunho> | null;
    if (!r || typeof r.em !== "number" || Date.now() - r.em > VALE_RASCUNHO || typeof r.servicoId !== "string" || !Array.isArray(r.pets) || !r.pets.length) { sessionStorage.removeItem(chave); return null; }
    const txt = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
    const pets = r.pets.slice(0, MAX_PETS).map((x) => ({
      nome: txt(x?.nome, 80), especie: (x?.especie === "gato" || x?.especie === "outro" ? x.especie : "cao") as Especie,
      porte: (x?.porte === "P" || x?.porte === "M" || x?.porte === "G" || x?.porte === "GG" ? x.porte : null) as Porte | null,
    }));
    const extras = Array.isArray(r.extras) ? r.extras.filter((x): x is string => typeof x === "string").slice(0, MAX_EXTRAS) : [];
    return { em: r.em, passo: r.passo === "dados" ? "dados" : "quando", servicoId: r.servicoId, extras, dia: /^\d{4}-\d{2}-\d{2}$/.test(String(r.dia)) ? String(r.dia) : null,
      hora: /^\d{2}:\d{2}$/.test(String(r.hora)) ? String(r.hora) : null, pets, tutor: txt(r.tutor, 120), telefone: txt(r.telefone, 20), obs: txt(r.obs, 300) };
  } catch { return null; }
}
/** O código do link é sempre em minúsculas: quem digitou do cartaz em maiúsculas chega no mesmo lugar. */
const codigoLimpo = (bruto: unknown) => { let c = ""; try { c = decodeURIComponent(String(bruto ?? "")).trim(); } catch { c = ""; } return /^[0-9A-Fa-f]{6,40}$/.test(c) ? c.toLowerCase() : c; };

/** Quantos pets cabem num pedido só (o banco aceita até 4). */
const MAX_PETS = 4;
/** Quantos serviços a mais, além do primeiro, cabem num pedido (o banco aceita até 6). */
const MAX_EXTRAS = 6;
let proximoPet = 0;
const novoPet = (): PetDoPedido => ({ id: ++proximoPet, nome: "", especie: "cao", porte: null });

const DIAS_NA_FAIXA = 14;
const ESPECIES: { id: Especie; rotulo: string; icone: React.ComponentType<{ size?: number }> }[] = [
  { id: "cao", rotulo: "Cão", icone: Dog },
  { id: "gato", rotulo: "Gato", icone: Cat },
  { id: "outro", rotulo: "Outro", icone: PawPrint },
];
const PASSOS: { id: Passo; rotulo: string }[] = [
  { id: "servico", rotulo: "Serviço" },
  { id: "quando", rotulo: "Quando" },
  { id: "dados", rotulo: "Você" },
];

function duracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
/** "R$ 60" quando o preço é um só; "a partir de R$ 50" quando muda com o porte; null sem preço. */
function precoDoCartao(s: ServicoDoLink) {
  const valores = [s.preco_p, s.preco_m, s.preco_g, s.preco_gg].filter((v): v is number => v != null).map(Number);
  if (!valores.length) return null;
  const menor = Math.min(...valores);
  return valores.every((v) => v === menor) ? brlCurto(menor) : `a partir de ${brlCurto(menor)}`;
}
/**
 * O preço dos serviços escolhidos, somados, para a barra de baixo do passo 1: "R$ 105", "a partir de R$ 95" (muda com o
 * porte) ou "valor a combinar" (algum serviço sem preço no link).
 */
function precoDaEscolha(lista: ServicoDoLink[]) {
  let menor = 0, todosIguais = true;
  for (const s of lista) {
    const valores = [s.preco_p, s.preco_m, s.preco_g, s.preco_gg].filter((v): v is number => v != null).map(Number);
    if (!valores.length) return "valor a combinar";
    const m = Math.min(...valores);
    menor += m;
    if (!valores.every((v) => v === m)) todosIguais = false;
  }
  return todosIguais ? brlCurto(menor) : `a partir de ${brlCurto(menor)}`;
}
/** Os argumentos de link_horarios: o primeiro serviço e, com mais de um, os outros (o tempo de cada pet é a soma). */
const argsHorarios = (codigo: string, ids: string[], dia: string, pets: number) =>
  ({ p_codigo: codigo, p_servico: ids[0], p_dia: dia, p_pets: pets, ...(ids.length > 1 ? { p_extras: ids.slice(1) } : {}) });
/** "Banho e tosa", "Banho e tosa + Hidratação". */
const nomesDosServicos = (lista: { nome: string }[]) => lista.map((s) => s.nome).join(" + ");

/** "10:00" + 90 min = "11:30". */
function somaMin(h: string, min: number) {
  const total = Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
/** "Nina", "Nina e Bob", "Nina, Bob e Mel". */
function listaDeNomes(nomes: string[]) {
  return nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}
/** "hoje", "amanhã" ou "sexta, 14 de novembro", contando a partir do dia do pet shop. */
function diaPorExtenso(dia: string, hoje: string) {
  const d = deIsoDia(dia);
  const dif = Math.round((d.getTime() - deIsoDia(hoje).getTime()) / 864e5);
  const texto = `${nomeDia(d)}, ${d.getDate()} de ${nomeMes(d)}`;
  return dif === 0 ? `hoje, ${d.getDate()} de ${nomeMes(d)}` : dif === 1 ? `amanhã, ${texto}` : texto;
}

/**
 * Já passou da hora de fechar hoje? Usa o relógio do aparelho e só responde sim quando o dia do aparelho
 * é o mesmo dia do pet shop (quem está em outro fuso cai na frase geral "não há mais horário hoje").
 */
function passouDoFechamento(horario: unknown, hoje: string) {
  const agora = new Date();
  if (isoDia(agora) !== hoje) return false;
  const h = horarioDoDia(horario, agora);
  if (!h) return false;
  return `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}` >= String(h.fecha).slice(0, 5);
}

/** O que link_info devolveu, como a página usa (null = link desligado ou inexistente). */
function lerInfo(lido: unknown): Info | null {
  const x = lido as Info | null;
  return x && typeof x === "object" && x.nome ? { ...x, servicos: Array.isArray(x.servicos) ? x.servicos : [] } : null;
}
/** Promoções do link (link_promocoes): as dos serviços e as da creche e do hotel. */
function lerPromos(dados: unknown): { servicos: Promocao[]; casa: PromoDoLink[] } {
  const l = Array.isArray(dados) ? (dados as PromoDoLink[]) : [];
  return {
    // só as que têm serviço no link (a lista já vem aberta: vazia = nenhum serviço do link entra)
    servicos: l.filter((x) => Array.isArray(x.servicos) && x.servicos.length).map((x, i) => ({ ...x, id: `promo-${i}`, ativa: true, valor: Number(x.valor), dias: (x.dias ?? []).map(Number) })),
    casa: l.filter((x) => Array.isArray(x.casa) && x.casa.length).map((x) => ({ ...x, valor: Number(x.valor), dias: (x.dias ?? []).map(Number) })),
  };
}

/**
 * A página do link do cliente. `inicial` é o que o servidor já leu (a página chega pronta no HTML); sem ele (o servidor não
 * conseguiu ler), a página lê pelo navegador, como antes.
 */
export default function AgendarPeloLink({ inicial }: { inicial?: LinkInicial }) {
  const { codigo: bruto } = useParams<{ codigo: string }>();
  const codigo = codigoLimpo(bruto);
  const promosIniciais = useMemo(() => lerPromos(inicial?.promocoes), [inicial]);

  // undefined = carregando; null = link desligado ou inexistente
  const [info, setInfo] = useState<Info | null | undefined>(() => (inicial ? lerInfo(inicial.info) : undefined));
  const [semRede, setSemRede] = useState(false);
  const [passo, setPasso] = useState<Passo>("servico");
  const [estadia, setEstadiaJa] = useState<"creche" | "hotel" | null>(null);
  // a escolha de creche ou hotel fica nesta aba: recarregar a página volta para o pedido que estava sendo feito
  const chaveEstadia = `maestro-link-estadia:${codigo}`;
  const setEstadia = (t: "creche" | "hotel" | null) => {
    setEstadiaJa(t);
    try { if (t) sessionStorage.setItem(chaveEstadia, t); else sessionStorage.removeItem(chaveEstadia); } catch { /* sem armazenamento: segue sem lembrar */ }
  };
  const voltouDaEstadia = useRef(false);
  // creche e hotel abrem com uma entrada no histórico: o voltar do celular fecha o pedido de vaga, em vez de sair da página
  const abrirEstadia = (t: "creche" | "hotel") => {
    try { window.history.pushState({ ...(window.history.state ?? {}), est: t }, ""); } catch { /* sem histórico: segue sem */ }
    setEstadia(t);
  };
  const fecharEstadia = () => {
    try { if ((window.history.state as { est?: string } | null)?.est === estadia) { window.history.back(); return; } } catch { /* segue */ }
    setEstadia(null);
  };

  // os serviços escolhidos, na ordem dos toques: o primeiro é o principal (o da promoção do horário); os outros vêm junto
  const [servicoIds, setServicoIds] = useState<string[]>([]);
  const servicoId = servicoIds[0] ?? null;
  const [dia, setDia] = useState<string | null>(null);
  const [horaEscolhida, setHoraEscolhida] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [erroHorarios, setErroHorarios] = useState(false);
  const [avisoQuando, setAvisoQuando] = useState<string | null>(null);

  // um item por pet: a quantidade escolhida no passo de dia e hora é o tamanho desta lista
  const [pets, setPets] = useState<PetDoPedido[]>(() => [novoPet()]);
  const [conferindo, setConferindo] = useState(false);
  const [naoCabe, setNaoCabe] = useState<number | null>(null);
  const [tutor, setTutor] = useState("");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [limite, setLimite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const qtd = pets.length;
  // regras que o tutor aceita antes de enviar (só quando quem recebe o pedido ligou isso)
  const { termos, recarregarTermos } = useTermosDoLink(codigo, inicial?.termos);
  const [aceite, setAceite] = useState(SEM_ACEITE);
  // nome de quem é o link, para a página dizer com quem falar quando o link está desligado
  const [nomeDoLink, setNomeDoLink] = useState<string | null>(inicial?.nome ?? null);
  // o WhatsApp de quem é o link, para a página do link desligado ter o botão (e o que a pessoa estava pedindo, se já tinha começado)
  const [foneDoLink, setFoneDoLink] = useState<string | null>(inicial?.telefone ?? null);
  const [pedia, setPedia] = useState<string | null>(null);
  const [lembrados, setLembrados] = useState(0);

  // dias que o negócio marcou como fechados (feriado, folga): o link não oferece horário neles
  const [fechados, setFechados] = useState<Set<string>>(() => new Set(inicial?.fechados ?? []));
  // o preço do hotel no link: undefined = ainda lendo (não mostra nada); null = banco antes da atualização (mostra a diária comum)
  const [precoHotel, setPrecoHotel] = useState<PrecoDoHotel | null | undefined>(inicial?.precoHotel as PrecoDoHotel | null | undefined);
  // promoções da creche e do hotel (só as que o link mostra: creche e hotel ligados no link)
  const [promosCasa, setPromosCasa] = useState<PromoDoLink[]>(promosIniciais.casa);
  // "Tirar dúvida" (opção do dono; banco antes da atualização ou erro = sem o botão)
  const [comDuvida, setComDuvida] = useState(inicial?.ia ?? false);
  // link do Google para avaliar a loja (opção do dono; sem link, nada aparece)
  const [google, setGoogle] = useState<string | null>(inicial?.google ?? null);
  // promoções em dias fracos (opção do dono): "10% off" nos horários. Banco antes da atualização ou erro: sem promoção.
  const [promos, setPromos] = useState<Promocao[]>(promosIniciais.servicos);
  const carregar = useCallback(async () => {
    setSemRede(false);
    setInfo(undefined);
    if (!configurado || !codigo) { setInfo(null); return; }
    // o servidor não conseguiu ler: o navegador lê a mesma coisa, também numa ida só (link_inicial), não em oito
    type Rpc = { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
    const ler = (f: string, a: Record<string, unknown>) => Promise.resolve((banco() as unknown as Rpc).rpc(f, a)).catch((e: unknown) => ({ data: null, error: e ?? "falhou" }));
    const lido = await lerLinkJunto(ler, codigo);
    if (!lido) { setSemRede(true); return; }
    const novo = lerInfo(lido.info);
    setInfo(novo);
    aplicarTema(novo?.tema ?? null); // as cores do pet shop, não as da Maestro Pet
    setNomeDoLink((n) => lido.nome ?? n);
    setFoneDoLink((t) => lido.telefone ?? t);
    setGoogle(lido.google);
    const l = lerPromos(lido.promocoes);
    setPromos(l.servicos);
    setPromosCasa(l.casa);
    setFechados(new Set(lido.fechados));
    setComDuvida(lido.ia);
    setPrecoHotel(lido.precoHotel as PrecoDoHotel | null | undefined);
  }, [codigo]);
  // o servidor já leu: só pinta com as cores do pet shop (o HTML já veio pintado) e baixa creche e hotel em segundo plano
  useEffect(() => {
    if (!inicial) { void carregar(); return; }
    adiantarBanco(); // horários e envio: a biblioteca do banco baixa agora, sem segurar a página
    const lido = lerInfo(inicial.info);
    aplicarTema(lido?.tema ?? null);
    if (lido?.creche || lido?.hotel) void carregarEstadia().catch(() => undefined);
  }, [carregar, inicial]);
  useEffect(() => { if (info?.nome) document.title = `Agendar: ${info.nome}`; }, [info?.nome]);
  useEffect(() => {
    if (!info || voltouDaEstadia.current) return;
    voltouDaEstadia.current = true;
    try {
      const t = sessionStorage.getItem(chaveEstadia);
      if ((t === "hotel" && info.hotel) || (t === "creche" && info.creche)) setEstadiaJa(t);
    } catch { /* sem armazenamento */ }
  }, [info, chaveEstadia]);
  useEffect(() => {
    if (info !== null || (nomeDoLink && foneDoLink) || !configurado || !codigo) return;
    let vale = true;
    // banco com a migração 20261235: nome e WhatsApp de quem é o link; antes dela, só o nome (como era)
    void (banco() as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }).rpc("link_contato", { p_codigo: codigo }).then(({ data, error }) => {
      if (!vale) return;
      const c = data as { nome?: unknown; telefone?: unknown } | null;
      if (!error && c && typeof c === "object") {
        if (typeof c.nome === "string" && c.nome.trim()) setNomeDoLink(c.nome.trim());
        if (typeof c.telefone === "string" && c.telefone.trim()) setFoneDoLink(c.telefone.trim());
      } else if (!nomeDoLink) void banco().rpc("link_nome", { p_codigo: codigo }).then(({ data: n }) => { if (vale && typeof n === "string" && n.trim()) setNomeDoLink(n.trim()); });
    }, () => undefined);
    return () => { vale = false; };
  }, [info, nomeDoLink, foneDoLink, codigo]);

  // ---------- rascunho do pedido de horário (só nesta aba) ----------
  const chaveRascunho = `maestro-link-rascunho:${codigo}:servico`;
  const rascunhoLido = useRef(false);
  useEffect(() => {
    if (!info || rascunhoLido.current) return;
    rascunhoLido.current = true;
    const r = lerRascunho(chaveRascunho);
    if (!r || !info.servicos.some((s) => s.id === r.servicoId)) return;
    const extras = (r.extras ?? []).filter((id) => id !== r.servicoId && info.servicos.some((s) => s.id === id));
    try { if (sessionStorage.getItem(chaveEstadia)) return; } catch { /* sem armazenamento */ }
    const diaBom = r.dia && r.dia >= info.hoje ? r.dia : null;
    setServicoIds([r.servicoId, ...extras]);
    setPets(r.pets.map((x) => ({ ...x, id: ++proximoPet })));
    setTutor(r.tutor); setTelefone(r.telefone); setObs(r.obs);
    diaSozinho.current = false;
    setDia(diaBom);
    setHoraEscolhida(diaBom ? r.hora : null);
    setPasso(r.passo === "dados" && diaBom && r.hora ? "dados" : "quando");
  }, [info, chaveRascunho, chaveEstadia]);
  useEffect(() => {
    if (!rascunhoLido.current) return;
    try {
      if (passo === "enviado") { sessionStorage.removeItem(chaveRascunho); return; }
      if ((passo !== "quando" && passo !== "dados") || !servicoId) return;
      const r: Rascunho = { em: Date.now(), passo, servicoId, extras: servicoIds.slice(1), dia, hora: horaEscolhida, pets: pets.map(({ nome, especie, porte }) => ({ nome, especie, porte })), tutor, telefone, obs };
      sessionStorage.setItem(chaveRascunho, JSON.stringify(r));
    } catch { /* sem armazenamento: segue sem guardar */ }
  }, [chaveRascunho, passo, servicoId, servicoIds, dia, horaEscolhida, pets, tutor, telefone, obs]);

  const escolhidos = useMemo(() => servicoIds.flatMap((id) => info?.servicos.filter((s) => s.id === id) ?? []), [servicoIds, info]);
  const servico = escolhidos[0] ?? null;
  const extras = escolhidos.slice(1);
  /** O tempo de um pet: todos os serviços, um depois do outro (como o banco conta). */
  const durPet = Math.min(1440, escolhidos.reduce((t, s) => t + s.duracao_min, 0));
  const nomeServicos = nomesDosServicos(escolhidos);
  // a chave da lista de serviços (para buscar os horários de novo quando ela muda)
  const chaveServicos = servicoIds.join(",");
  /** A promoção de um horário deste serviço (a mesma escolha do banco; o pedido leva a que vale). */
  const promoEm = (s: ServicoDoLink | null, d: string | null, h: string | null, porte?: Porte | null) =>
    s && d && h ? promoDoHorario(promos, { servicoId: s.id, dia: d, hora: h, preco: precoDoServico(s, porte ?? null), categoriaDe: () => "banho" }) : null;
  /** "de R$ 60 por R$ 54": só com o preço da lista de verdade (um preço só, ou o do porte escolhido). */
  const dePor = (s: ServicoDoLink, p: Promocao, porte?: Porte | null) => {
    const valores = [s.preco_p, s.preco_m, s.preco_g, s.preco_gg].filter((v): v is number => v != null).map(Number);
    const unico = valores.length && valores.every((v) => v === valores[0]) ? valores[0] : null;
    const base = porte ? precoDoServico(s, porte) : unico;
    return base != null && base > 0 ? { de: Number(base), por: precoComPromo(p, Number(base)) } : null;
  };
  const dias = useMemo(() => {
    if (!info) return [];
    const base = deIsoDia(info.hoje);
    return Array.from({ length: DIAS_NA_FAIXA }, (_, i) => {
      const d = somaDias(base, i);
      return { iso: isoDia(d), data: d, aberto: !!horarioDoDia(info.horario, d) && !fechados.has(isoDia(d)), hoje: i === 0 };
    });
  }, [info, fechados]);
  const meses = useMemo(() => [...new Set(dias.map((d) => nomeMes(d.data)))].join(" e "), [dias]);

  // horários livres do dia escolhido
  const vez = useRef(0);
  // o dia que a página escolheu sozinha (o primeiro aberto): se ele não tem mais horário (lotado, ou hoje já no fim do dia),
  // a página pula para o próximo dia aberto, até achar um com horário. Dia que a pessoa escolheu fica onde está.
  const diaSozinho = useRef(false);
  const pulos = useRef(0);
  const buscarHorarios = useCallback(async (ids: string[], d: string, n: number) => {
    const minha = ++vez.current;
    setHorarios(null);
    setErroHorarios(false);
    const { data, error } = await banco().rpc("link_horarios", argsHorarios(codigo, ids, d, n));
    if (minha !== vez.current) return;
    if (error) { setErroHorarios(true); setHorarios([]); return; }
    const lista = ((data ?? []) as string[]).map((h) => String(h).slice(0, 5));
    if (!lista.length && diaSozinho.current && pulos.current < 10) {
      const proximo = dias.find((x) => x.aberto && x.iso > d);
      if (proximo) { pulos.current++; setDia(proximo.iso); return; }
    }
    diaSozinho.current = false;
    setHorarios(lista);
    setHoraEscolhida((h) => (h && lista.includes(h) ? h : null));
  }, [codigo, dias]);
  useEffect(() => {
    if (passo === "quando" && chaveServicos && dia) void buscarHorarios(chaveServicos.split(","), dia, qtd);
  }, [passo, chaveServicos, dia, qtd, buscarHorarios]);

  // cada passo é uma entrada no histórico do navegador: o botão de voltar do celular volta um passo, em vez de sair da página
  const mostrar = (p: Passo) => { setPasso(p); setErro(null); setNaoCabe(null); window.scrollTo({ top: 0 }); };
  const ir = (p: Passo) => {
    try { if (p !== "servico" && p !== passo) window.history.pushState({ ...(window.history.state ?? {}), lk: p }, ""); } catch { /* sem histórico: segue sem */ }
    mostrar(p);
  };
  /** "Voltar" e "Trocar" da página: se o passo de agora veio do histórico, volta por ele (o botão do celular e o da página andam juntos). */
  const voltar = (p: Passo) => {
    try { if ((window.history.state as { lk?: string } | null)?.lk === passo && passo !== "servico") { window.history.back(); return; } } catch { /* segue */ }
    mostrar(p);
  };
  const noHistorico = useRef({ passo, estadia });
  noHistorico.current = { passo, estadia };
  useEffect(() => {
    const aoVoltar = (e: PopStateEvent) => {
      const s = (e.state ?? {}) as { lk?: string; est?: string };
      const agora = noHistorico.current;
      if (agora.passo === "enviado") return; // pedido enviado: o voltar não reabre o formulário
      if (agora.estadia) {
        if (s.est !== agora.estadia) { setEstadiaJa(null); try { sessionStorage.removeItem(`maestro-link-estadia:${codigo}`); } catch { /* sem armazenamento */ } }
        return;
      }
      const alvo: Passo = s.lk === "dados" ? "dados" : s.lk === "quando" ? "quando" : "servico";
      // só anda para trás (voltar nunca pula para um passo que ainda não foi preenchido)
      const ordem: Passo[] = ["servico", "quando", "dados"];
      if (ordem.indexOf(alvo) < ordem.indexOf(agora.passo)) { setPasso(alvo); setErro(null); setNaoCabe(null); window.scrollTo({ top: 0 }); }
    };
    window.addEventListener("popstate", aoVoltar);
    return () => window.removeEventListener("popstate", aoVoltar);
  }, [codigo]);

  /** Muda quantos pets vêm: completa a lista com pets em branco ou tira os últimos. */
  function mudarQtd(n: number) {
    const alvo = Math.min(MAX_PETS, Math.max(1, n));
    setAvisoQuando(null);
    setPets((l) => (alvo > l.length ? [...l, ...Array.from({ length: alvo - l.length }, novoPet)] : l.slice(0, alvo)));
  }
  const mudarPet = (id: number, novo: Partial<PetDoPedido>) => setPets((l) => l.map((x) => (x.id === id ? { ...x, ...novo } : x)));
  function removerPet(id: number) {
    setNaoCabe(null);
    setPets((l) => (l.length > 1 ? l.filter((x) => x.id !== id) : l));
  }
  /** No passo de dados: só entra mais um pet se o horário escolhido ainda couber todos, um depois do outro. */
  async function adicionarPet() {
    if (!servico || !dia || !horaEscolhida || conferindo || pets.length >= MAX_PETS) return;
    const n = pets.length + 1;
    setErro(null);
    setNaoCabe(null);
    setConferindo(true);
    const { data, error } = await banco().rpc("link_horarios", argsHorarios(codigo, servicoIds, dia, n));
    setConferindo(false);
    if (error) return setErro("Não consegui conferir o horário agora. Confira a internet e tente de novo.");
    if (((data ?? []) as string[]).some((h) => String(h).slice(0, 5) === horaEscolhida)) setPets((l) => (l.length < MAX_PETS ? [...l, novoPet()] : l));
    else setNaoCabe(n);
  }
  /** O horário escolhido não comporta mais um pet: leva para a escolha de horário já com a quantidade nova. */
  function verHorariosPara(n: number) {
    mudarQtd(n);
    setHoraEscolhida(null);
    ir("quando");
  }

  /** Um toque marca o serviço; outro toque tira. Dá para juntar vários (banho, hidratação, unhas…). */
  function alternarServico(id: string) {
    setServicoIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : l.length > MAX_EXTRAS ? l : [...l, id]));
    setHoraEscolhida(null);
    setAvisoQuando(null);
  }
  /** Com os serviços escolhidos: vai para o dia e a hora. */
  function continuarServicos() {
    if (!servicoIds.length) return;
    if (!dia) { diaSozinho.current = true; pulos.current = 0; setDia(dias.find((d) => d.aberto)?.iso ?? null); }
    ir("quando");
  }
  function escolherDia(iso: string) {
    diaSozinho.current = false;
    setDia(iso);
    setHoraEscolhida(null);
    setAvisoQuando(null);
  }

  /** O valor de cada pet deste pedido (preço da lista no porte, com a promoção do horário): a mesma conta que o banco guarda com o pedido. */
  const valoresDe = (lista: { nome: string; porte: Porte | null }[]): LinhaDeValor[] => {
    if (!servico || !dia || !horaEscolhida) return [];
    return lista.flatMap((x, i) => {
      // a promoção de cada pet vale para a hora dele (os pets são atendidos um depois do outro)
      const pr = promoEm(servico, dia, somaMin(horaEscolhida, durPet * i), x.porte);
      const v = valorDosServicos(escolhidos, x.porte, pr ? { nome: pr.nome, tipo: pr.tipo, valor: Number(pr.valor) } : null);
      return v ? [{ nome: x.nome.trim() || `Pet ${i + 1}`, v }] : [];
    });
  };
  // dois toques seguidos em "Enviar pedido" valem um (a trava é na hora do toque, antes de a tela redesenhar)
  const enviandoJa = useRef(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!info || !servico || !dia || !horaEscolhida || enviando || enviandoJa.current) return;
    const lista = pets.map((x) => ({ ...x, nome: x.nome.trim() }));
    const nomeTutor = tutor.trim(), fone = soDigitos(telefone);
    setLimite(false);
    setNaoCabe(null);
    if (lista.some((x) => !x.nome)) return setErro(lista.length > 1 ? "Escreva o nome de cada pet." : "Escreva o nome do pet.");
    if (nomeTutor.length < 2) return setErro("Escreva o seu nome.");
    if (fone.length !== 10 && fone.length !== 11) return setErro("Confira o WhatsApp: DDD e número.");
    const falta = faltaAceitar(termos, aceite, info.nome);
    if (falta) return setErro(falta);
    setErro(null);
    setEnviando(true);
    enviandoJa.current = true;
    let data: unknown, error: unknown;
    try {
      ({ data, error } = await pedirPeloLink("link_pedir", {
        p_codigo: codigo, p_servico: servico.id, ...(extras.length ? { p_extras: extras.map((x) => x.id) } : {}), p_dia: dia, p_hora: horaEscolhida, p_tutor: nomeTutor, p_telefone: fone, p_pet: lista[0].nome,
        p_especie: lista[0].especie, p_porte: lista[0].porte ?? undefined, p_obs: obs.trim() || undefined,
        p_outros: lista.length > 1 ? lista.slice(1).map((x) => ({ nome: x.nome, especie: x.especie, porte: x.porte })) : undefined,
      }, termos, aceite));
    } catch (x) { error = x; } finally { enviandoJa.current = false; setEnviando(false); }
    if (error) return setErro("Não consegui enviar agora. Confira a internet e tente de novo.");
    const r = data as unknown as { ok: boolean; erro?: string; motivo?: string; id?: string } | null;
    if (r?.ok) {
      const pr = promoEm(servico, dia, horaEscolhida, lista[0].porte);
      setEnviado({ id: r.id ?? null, servico: nomeServicos, servicos: escolhidos.map((x) => x.nome), dia, pets: lista.map((x, i) => ({ nome: x.nome, hora: somaMin(horaEscolhida, durPet * i) })), promo: pr ? `${pr.nome} (${etiquetaPromo(pr)})` : null, valores: valoresDe(lista) });
      // enviado: o rascunho sai (nome e telefone não ficam guardados na aba)
      try { sessionStorage.removeItem(chaveRascunho); } catch { /* sem armazenamento */ }
      // o endereço de acompanhar fica guardado neste aparelho: recarregar a página não perde o pedido
      if (r.id) { lembrarPedido(codigo, r.id, `${nomeServicos} de ${listaDeNomes(lista.map((x) => x.nome))}`); setLembrados((n) => n + 1); }
      setAceite(SEM_ACEITE);
      setPasso("enviado");
      window.scrollTo({ top: 0 });
      return;
    }
    if (r?.erro === "ocupado") {
      setHoraEscolhida(null);
      setAvisoQuando(lista.length > 1 ? `Esse horário não comporta mais os ${lista.length} pets seguidos. Escolha outro, por favor.` : "Esse horário acabou de ser ocupado. Escolha outro, por favor.");
      ir("quando");
    } else if (r?.erro === "limite") {
      setLimite(true);
      setErro(r.motivo === "muitos" ? MUITOS_PEDIDOS : `Não deu para enviar mais um pedido por aqui agora. Fale direto com ${info.nome}.`);
    } else if (r?.erro === "termos") {
      // as regras mudaram entre abrir a página e enviar: mostra o texto novo e pede o aceite de novo
      await recarregarTermos();
      setAceite(SEM_ACEITE);
      setErro(`As regras de ${info.nome} mudaram agora há pouco. Leia de novo e marque para enviar.`);
    } else if (r?.erro === "fechado") {
      // o link foi desligado enquanto a pessoa preenchia: a página diz isso e oferece o WhatsApp já com o pedido escrito.
      // O que foi preenchido continua guardado nesta aba: se o link voltar, "Tentar de novo" traz tudo de volta.
      setFoneDoLink((t) => info.telefone ?? t);
      setNomeDoLink((n) => info.nome ?? n);
      setPedia(`${listaDeNomes(escolhidos.map((x) => x.nome.toLowerCase()))} para ${listaDeNomes(lista.map((x) => x.nome))}, ${diaPorExtenso(dia, info.hoje)} às ${horaEscolhida}`);
      rascunhoLido.current = false;
      setInfo(null);
    } else if (r?.erro === "dados") {
      setErro("Confira o nome de cada pet, o seu nome e o WhatsApp com DDD.");
    } else {
      setErro("Algo deu errado. Tente de novo em instantes.");
    }
  }

  /** O "Tirar dúvida" ofereceu o pedido: abre o formulário já no serviço (e no dia), e o cliente continua dali. Nada é enviado. */
  function pedirPelaDuvida(s: Sugestao) {
    if (passo === "enviado") { setEnviado(null); setPets([novoPet()]); setObs(""); }
    if (s.tipo !== "servico") { if (s.tipo === "hotel" ? info?.hotel : info?.creche) { abrirEstadia(s.tipo); mostrar("servico"); } return; }
    if (!info?.servicos.some((x) => x.id === s.servicoId)) return;
    setEstadia(null);
    setServicoIds([s.servicoId]);
    setHoraEscolhida(null);
    setAvisoQuando(null);
    if (s.dia && dias.some((x) => x.iso === s.dia && x.aberto)) { diaSozinho.current = false; setDia(s.dia); }
    else if (!dia) { diaSozinho.current = true; pulos.current = 0; setDia(dias.find((x) => x.aberto)?.iso ?? null); }
    ir("quando");
  }

  function pedirOutro() {
    setEnviado(null);
    setHoraEscolhida(null);
    setPets([novoPet()]);
    setObs("");
    setServicoIds([]);
    ir("servico");
  }

  /* ---------- telas sem formulário ---------- */

  if (semRede) {
    return (
      <Moldura>
        <div className="g-lk-fim">
          <Selo tamanho={72} tom="suave" />
          <h1>Não consegui abrir a página</h1>
          <p className="g-muted">Confira a internet e tente de novo.</p>
          <button className="g-btn verde" onClick={() => void carregar()}>Tentar de novo</button>
        </div>
      </Moldura>
    );
  }
  if (info === undefined) {
    return (
      <Moldura>
        <div className="g-lk-espera" aria-busy="true" aria-label="Abrindo a página">
          <div className="g-esq" style={{ minHeight: 132, borderRadius: 24 }} />
          <div className="g-esq" style={{ minHeight: 84 }} />
          <div className="g-esq" style={{ minHeight: 84 }} />
        </div>
      </Moldura>
    );
  }
  if (info === null) {
    const zapFora = linkWhatsApp(foneDoLink, pedia ? `Oi! Tentei pedir ${pedia} pelo link, mas ele não está recebendo pedidos agora. Podemos combinar por aqui?` : "Oi! Abri o link de pedidos e ele não está disponível. Quero marcar um horário.");
    return (
      <Moldura>
        <div className="g-lk-fim">
          <Selo tamanho={72} tom="suave" />
          <h1>Este link não está disponível</h1>
          <p className="g-muted">{nomeDoLink ? `${nomeDoLink} não está recebendo pedidos por aqui agora. Fale direto com ${nomeDoLink} para combinar.` : "Quem mandou este link pode ter desligado os pedidos por aqui. Fale direto com quem mandou para combinar."}</p>
          {pedia && <p className="g-muted" data-teste="pedia">O que você preencheu não foi enviado, mas continua guardado nesta página: {pedia}.</p>}
          {zapFora && <a className="g-btn zap" href={zapFora} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {nomeDoLink ?? "o pet shop"} no WhatsApp</a>}
          {pedia && <button type="button" className="g-btn sec" onClick={() => void carregar()}>Tentar de novo</button>}
          <PedidosDesteAparelho codigo={codigo} />
        </div>
      </Moldura>
    );
  }

  const zapLoja = linkWhatsApp(info.telefone, `Oi! Quero marcar um horário.`);
  const onde = [info.cidade, info.uf].filter(Boolean).join(" · ");
  // o endereço (quando o pet shop escreveu a rua em Meu pet shop) e o link do mapa
  const endereco = enderecoDaLoja(info);
  const mapa = linkDoMapa(info, info.nome);
  const valores = passo === "dados" ? valoresDe(pets) : [];
  const manha = (horarios ?? []).filter((h) => h < "12:00");
  const tarde = (horarios ?? []).filter((h) => h >= "12:00");
  const indice = PASSOS.findIndex((p) => p.id === passo);
  // pedido para hoje depois da hora de fechar: o dia não está cheio, já fechou
  const hojeFechou = dia === info.hoje && passouDoFechamento(info.horario, info.hoje);
  const fimEstimado = servico && horaEscolhida ? somaMin(horaEscolhida, durPet * qtd) : null;

  return (
    <Moldura google={google ? { link: google, loja: info.nome } : null} duvida={comDuvida ? <DuvidaNoLink codigo={codigo} loja={info.nome} telefone={info.telefone} aoPedir={pedirPelaDuvida} /> : null}>
      <header className="g-lk-cab">
        <Marca tamanho={220} className="g-lk-cab-fundo" />
        <div className="g-lk-cab-quem">
          <LogoLoja nome={info.nome} logo={info.logo} tamanho={54} />
          <div>
            <h1>{info.nome}</h1>
            {endereco ? <p className="g-lk-onde" data-teste="endereco"><MapPin aria-hidden /><span>{endereco}{mapa && <> · <a href={mapa} target="_blank" rel="noopener noreferrer">Abrir no mapa</a></>}</span></p>
              : onde && <p className="g-lk-onde"><MapPin aria-hidden />{onde}</p>}
          </div>
        </div>
        {passo !== "enviado" && <p className="g-lk-cab-frase">{estadia || (!info.servicos.length && (info.creche || info.hotel)) ? "Peça uma vaga por aqui" : info.creche || info.hotel ? "Peça um horário ou uma vaga por aqui" : "Peça um horário por aqui"}. A confirmação chega pelo seu WhatsApp.</p>}
      </header>

      {info.aviso && passo !== "enviado" && (
        <p className="g-lk-recado"><MessageCircle aria-hidden /><span>{info.aviso}</span></p>
      )}

      {!estadia && passo === "servico" && <PedidosDesteAparelho codigo={codigo} versao={lembrados} />}

      {estadia && (
        <EstadiaPeloLink key={estadia} codigo={codigo} tipo={estadia} hoje={info.hoje} loja={info.nome} fechados={fechados} horario={info.horario} termos={termos} recarregarTermos={recarregarTermos}
          aoPedir={() => setLembrados((n) => n + 1)} endereco={endereco} mapa={mapa}
          zapLoja={linkWhatsApp(info.telefone, `Oi! Quero falar sobre uma vaga ${estadia === "hotel" ? "no hotel" : "na creche"}.`)} zapCom={(t) => linkWhatsApp(info.telefone, t)}
          preco={estadia === "hotel" ? precoHotel : undefined}
          diaria={(estadia === "creche" ? info.creche?.diaria : info.hotel?.diaria) ?? null} aoVoltar={fecharEstadia}
          promos={promosCasa.filter((x) => x.casa?.includes(estadia))} />
      )}

      {!estadia && passo !== "enviado" && (
        <ol className="g-lk-passos" aria-label="Passos do pedido">
          {PASSOS.map((p, i) => (
            <li key={p.id} className={i < indice ? "feito" : i === indice ? "atual" : undefined} aria-current={i === indice ? "step" : undefined}>
              <i>{i < indice ? <Check aria-hidden /> : i + 1}</i><span>{p.rotulo}</span>
            </li>
          ))}
        </ol>
      )}

      {/* ---------- 1. serviço ---------- */}
      {!estadia && passo === "servico" && (
        <section className="g-lk-secao">
          <h2>O que o seu pet vai fazer?</h2>
          {(info.creche || info.hotel) && (
            <div className="g-lk-servicos" style={{ marginBottom: 12 }}>
              {info.creche && (
                <button type="button" className="g-lk-serv" style={{ "--cor": "#3b9bd9" } as React.CSSProperties} onClick={() => abrirEstadia("creche")}>
                  <i className="g-lk-serv-cor" aria-hidden><Sun /></i>
                  <span className="g-lk-serv-t"><b>Creche</b><span>Passar o dia{info.creche.diaria != null && <em>{brlCurto(Number(info.creche.diaria))} a diária</em>}</span>
                    {promosCasa.filter((x) => x.casa?.includes("creche")).slice(0, 2).map((x, i) => (
                      <span key={i} className="g-lk-promo-serv">{etiquetaPromo(x)} na diária · {diasCurtos(x.dias)}{validadePorExtenso(x) ? ` · ${validadePorExtenso(x)}` : ""}</span>
                    ))}</span>
                  <ArrowRight className="g-lk-serv-seta" aria-hidden />
                </button>
              )}
              {info.hotel && (
                <button type="button" className="g-lk-serv" style={{ "--cor": "#7c6bd6" } as React.CSSProperties} onClick={() => abrirEstadia("hotel")}>
                  <i className="g-lk-serv-cor" aria-hidden><BedDouble /></i>
                  <span className="g-lk-serv-t"><b>Hotel</b><span>Dormir com a gente{precoHotel === undefined || precoHotel?.mostrar === false ? null
                    : precoHotel?.de != null ? <em>{precoHotel.ate != null && precoHotel.ate !== precoHotel.de ? "a partir de " : ""}{brlCurto(Number(precoHotel.de))} a diária</em>
                    : precoHotel === null && info.hotel.diaria != null ? <em>{brlCurto(Number(info.hotel.diaria))} a diária</em> : null}</span>
                    {promosCasa.filter((x) => x.casa?.includes("hotel")).slice(0, 2).map((x, i) => (
                      <span key={i} className="g-lk-promo-serv">{etiquetaPromo(x)} nas noites de {diasCurtos(x.dias)}{validadePorExtenso(x) ? ` · ${validadePorExtenso(x)}` : ""}</span>
                    ))}</span>
                  <ArrowRight className="g-lk-serv-seta" aria-hidden />
                </button>
              )}
            </div>
          )}
          {!info.servicos.length ? (info.creche || info.hotel) ? null : (
            <div className="g-lk-vazio">
              <Scissors aria-hidden />
              <b>Nenhum serviço por aqui ainda</b>
              <p>Fale direto com {info.nome} para marcar o horário.</p>
              {zapLoja && <a className="g-btn zap" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Chamar no WhatsApp</a>}
            </div>
          ) : (
            <>
            {info.servicos.length > 1 && <p className="g-muted g-p g-lk-dica" data-teste="dica-varios">Pode escolher mais de um serviço: banho, hidratação, unhas… Tudo no mesmo horário.</p>}
            <div className="g-lk-servicos" role="group" aria-label="Serviços">
              {info.servicos.map((s) => {
                const preco = precoDoCartao(s);
                const marcado = servicoIds.includes(s.id);
                return (
                  <button key={s.id} type="button" className="g-lk-serv g-lk-serv-marca" aria-pressed={marcado}
                    disabled={!marcado && servicoIds.length > MAX_EXTRAS}
                    style={{ "--cor": s.cor ?? "#f97316" } as React.CSSProperties} onClick={() => alternarServico(s.id)}>
                    <i className="g-lk-serv-cor" aria-hidden><Scissors /></i>
                    <span className="g-lk-serv-t">
                      <b>{s.nome}</b>
                      <span><Clock aria-hidden />{duracao(s.duracao_min)}<em>{preco ?? "valor a combinar"}</em></span>
                      {/* promoção só com preço à vista: "15% off" de um valor que o link não mostra não diz nada */}
                      {preco && promos.filter((x) => x.servicos.includes(s.id)).slice(0, 2).map((x) => (
                        <span key={x.id} className="g-lk-promo-serv">{etiquetaPromo(x)} · {diasCurtos(x.dias)}{horasPorExtenso(x) ? `, ${horasPorExtenso(x)}` : ""}{validadePorExtenso(x) ? ` · ${validadePorExtenso(x)}` : ""}</span>
                      ))}
                    </span>
                    <span className="g-lk-serv-caixa" aria-hidden>{marcado ? <Check /> : <Plus />}</span>
                  </button>
                );
              })}
            </div>
            </>
          )}
          {servicoIds.length > 0 && escolhidos.length > 0 && (
            <div className="g-lk-escolha" role="status" aria-live="polite" data-teste="escolha-servicos">
              <span className="g-lk-escolha-t">
                <b>{escolhidos.length === 1 ? escolhidos[0].nome : `${escolhidos.length} serviços`}</b>
                <span><Clock aria-hidden />{duracao(durPet)} · {precoDaEscolha(escolhidos)}</span>
              </span>
              <button type="button" className="g-btn pri" onClick={continuarServicos}>Continuar<ArrowRight /></button>
            </div>
          )}
        </section>
      )}

      {/* ---------- 2. dia e hora ---------- */}
      {!estadia && passo === "quando" && servico && (
        <section className="g-lk-secao">
          <button type="button" className="g-lk-escolhido" style={{ "--cor": servico.cor ?? "#f97316" } as React.CSSProperties} onClick={() => voltar("servico")}>
            <i aria-hidden />
            <span data-teste="servicos-escolhidos"><b>{nomeServicos}</b> · {duracao(durPet)}{qtd > 1 ? " por pet" : ""}</span>
            <u>Trocar</u>
          </button>

          <div className="g-lk-bloco">
            <div className="g-lk-bloco-t"><h2 id="g-lk-qtd-t">Quantos pets vêm?</h2><span className="g-muted g-pp">até {MAX_PETS}</span></div>
            <div className="g-lk-opcoes quatro" role="group" aria-labelledby="g-lk-qtd-t">
              {Array.from({ length: MAX_PETS }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" className="g-lk-opcao g-lk-qtd" aria-pressed={qtd === n} aria-label={n === 1 ? "1 pet" : `${n} pets`} onClick={() => mudarQtd(n)}>{n}</button>
              ))}
            </div>
            {qtd > 1 && <p className="g-muted g-p">Os pets são atendidos um depois do outro. Só aparecem os horários em que cabem os {qtd} seguidos.</p>}
          </div>

          <div className="g-lk-bloco">
            <div className="g-lk-bloco-t"><h2>Que dia fica bom?</h2><span className="g-muted g-pp">{meses}</span></div>
            <div className="g-lk-dias">
              {dias.map((d) => (
                <button key={d.iso} type="button" className={`g-lk-dia${d.hoje ? " hoje" : ""}`} disabled={!d.aberto} aria-pressed={d.iso === dia}
                  aria-label={`${nomeDia(d.data)}, ${d.data.getDate()} de ${nomeMes(d.data)}${d.aberto ? "" : ", fechado"}`} onClick={() => escolherDia(d.iso)}>
                  <span>{d.hoje ? "hoje" : nomeDiaCurto(d.data)}</span>
                  <b>{d.data.getDate()}</b>
                </button>
              ))}
            </div>
            {!dias.some((d) => d.aberto) && <p className="g-muted g-p">{info.nome} não abre nos próximos dias. Fale direto pelo WhatsApp.</p>}
          </div>

          {dia && (
            <div className="g-lk-bloco">
              <div className="g-lk-bloco-t"><h2>E a que horas?</h2><span className="g-muted g-pp">{diaPorExtenso(dia, info.hoje)}</span></div>
              {avisoQuando && <p className="g-lk-alerta" role="alert">{avisoQuando}</p>}
              {horarios === null ? (
                <div className="g-lk-horas" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <span key={i} className="g-esq g-lk-hora-esq" />)}</div>
              ) : erroHorarios ? (
                <div className="g-lk-vazio">
                  <b>Não consegui ver os horários</b>
                  <p>Confira a internet e tente de novo.</p>
                  <button type="button" className="g-btn sec" onClick={() => void buscarHorarios(servicoIds, dia, qtd)}>Tentar de novo</button>
                </div>
              ) : !horarios.length ? (
                <div className="g-lk-vazio">
                  <CalendarDays aria-hidden />
                  <b>{hojeFechou ? "Hoje já fechou" : dia === info.hoje ? (qtd > 1 ? `Não há mais horário hoje para ${qtd} pets seguidos` : "Não há mais horário hoje") : qtd > 1 ? `Não há horário para ${qtd} pets seguidos nesse dia` : "Esse dia já está cheio"}</b>
                  <p>{hojeFechou ? "O atendimento de hoje já terminou. Escolha outro dia aqui em cima." : qtd > 1 ? "Tente outro dia ou diminua a quantidade de pets aqui em cima." : "Tente outro dia aqui em cima."}</p>
                </div>
              ) : (
                <>
                  {[{ rotulo: "Manhã", lista: manha }, { rotulo: "Tarde", lista: tarde }].filter((g) => g.lista.length).map((g) => (
                    <div key={g.rotulo} className="g-lk-turno">
                      <span className="g-rotulo">{g.rotulo}</span>
                      <div className="g-lk-horas">
                        {g.lista.map((h) => {
                          const pr = promoEm(servico, dia, h);
                          return (
                            <button key={h} type="button" className={`g-lk-hora${pr ? " com-promo" : ""}`} aria-pressed={h === horaEscolhida} aria-label={pr ? `${h}, ${etiquetaPromo(pr)}` : undefined} onClick={() => { setHoraEscolhida(h); setAvisoQuando(null); }}>
                              {h}{pr && <small className="g-lk-hora-promo">{etiquetaPromo(pr)}</small>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {(() => {
                    const pr = promoEm(servico, dia, horaEscolhida);
                    if (!pr) return null;
                    const v = dePor(servico, pr);
                    return (
                      <p className="g-lk-promo" aria-live="polite">
                        <b>Promoção {pr.nome}: {etiquetaPromo(pr)}{extras.length ? ` em ${servico.nome}` : ""}.</b>{" "}
                        {v ? <>De <s>{brlCurto(v.de)}</s> por <b>{brlCurto(v.por)}</b>{qtd > 1 ? " cada pet" : ""}.</> : "O desconto é no preço do porte do pet."}
                      </p>
                    );
                  })()}
                  {horaEscolhida && fimEstimado && (
                    <p className="g-lk-termino" aria-live="polite">
                      <Clock aria-hidden />
                      <span>{qtd > 1 ? `${qtd} pets, um depois do outro: começa às ${horaEscolhida} e termina por volta das ${fimEstimado}.` : `Começa às ${horaEscolhida} e termina por volta das ${fimEstimado}.`}{extras.length ? " Os serviços são feitos um depois do outro." : ""}</span>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="g-lk-pe">
            <button type="button" className="g-btn sec" onClick={() => voltar("servico")}><ArrowLeft />Voltar</button>
            <button type="button" className="g-btn pri" disabled={!dia || !horaEscolhida} onClick={() => ir("dados")}>Continuar<ArrowRight /></button>
          </div>
        </section>
      )}

      {/* ---------- 3. dados ---------- */}
      {!estadia && passo === "dados" && servico && dia && horaEscolhida && (
        <form className="g-lk-secao" onSubmit={enviar} noValidate>
          <button type="button" className="g-lk-escolhido" style={{ "--cor": servico.cor ?? "#f97316" } as React.CSSProperties} onClick={() => voltar("quando")}>
            <i aria-hidden />
            <span><b>{nomeServicos}</b> · {diaPorExtenso(dia, info.hoje)}, {qtd > 1 || extras.length ? `das ${horaEscolhida} às ${fimEstimado}` : `às ${horaEscolhida}`}</span>
            <u>Trocar</u>
          </button>

          <div className="g-lk-bloco g-form">
            <div className="g-lk-bloco-t"><h2>Quem vem?</h2>{qtd > 1 && <span className="g-muted g-pp">{qtd} pets</span>}</div>
            {qtd > 1 && <p className="g-muted g-p">{extras.length ? `Os mesmos serviços valem para todos os pets deste pedido: ${nomeServicos}.` : `O mesmo serviço vale para todos os pets deste pedido: ${servico.nome}.`} Eles são atendidos um depois do outro, na ordem abaixo.</p>}
            {pets.map((x, i) => (
              <div key={x.id} className="g-lk-pet" role="group" aria-label={qtd > 1 ? `Pet ${i + 1}` : "Pet"}>
                {qtd > 1 && (
                  <div className="g-lk-pet-t">
                    <b>Pet {i + 1}</b>
                    <span>das {somaMin(horaEscolhida, durPet * i)} às {somaMin(horaEscolhida, durPet * (i + 1))}</span>
                    <button type="button" className="g-lk-pet-tira" onClick={() => removerPet(x.id)} aria-label={`Remover o pet ${i + 1}${x.nome.trim() ? `, ${x.nome.trim()}` : ""}`}><X aria-hidden />Remover</button>
                  </div>
                )}
                <label className="g-campo"><span>Nome do pet</span>
                  <input className="g-input" value={x.nome} maxLength={80} autoComplete="off" onChange={(e) => mudarPet(x.id, { nome: e.target.value })} />
                </label>
                <div className="g-campo">
                  <span>É um</span>
                  <div className="g-lk-opcoes tres">
                    {ESPECIES.map((e) => (
                      <button key={e.id} type="button" className="g-lk-opcao" aria-pressed={x.especie === e.id} onClick={() => mudarPet(x.id, { especie: e.id })}><e.icone />{e.rotulo}</button>
                    ))}
                  </div>
                </div>
                <div className="g-campo">
                  <span>Porte <small>(se souber)</small></span>
                  <div className="g-lk-opcoes quatro">
                    {PORTES.map((p) => (
                      <button key={p.id} type="button" className="g-lk-opcao porte" aria-pressed={x.porte === p.id} onClick={() => mudarPet(x.id, { porte: x.porte === p.id ? null : p.id })}>
                        <b>{p.id}</b><small>{p.rotulo}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {naoCabe && (
              <div className="g-lk-alerta" role="alert">
                <span>Às {horaEscolhida} não cabem {naoCabe} pets seguidos.</span>
                <button type="button" className="g-btn sec p" onClick={() => verHorariosPara(naoCabe)}>Ver horários para {naoCabe} pets</button>
              </div>
            )}
            {qtd < MAX_PETS ? (
              <button type="button" className="g-btn sec g-lk-pet-mais" disabled={conferindo} onClick={() => void adicionarPet()}><Plus />{conferindo ? "Conferindo o horário…" : "Adicionar outro pet"}</button>
            ) : (
              <p className="g-muted g-pp">Cabem até {MAX_PETS} pets por pedido.</p>
            )}
          </div>

          <div className="g-lk-bloco g-form">
            <h2>Com quem a gente fala?</h2>
            <p className="g-muted" data-teste="aviso-dados">Seus dados vão só para {info.nome}, para responder ao seu pedido.</p>
            <label className="g-campo"><span>Seu nome</span>
              <input className="g-input" value={tutor} maxLength={120} autoComplete="name" onChange={(e) => setTutor(e.target.value)} />
            </label>
            <label className="g-campo"><span>Seu WhatsApp</span>
              <input className="g-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={telefone} maxLength={20}
                onChange={(e) => setTelefone(e.target.value)} onBlur={() => setTelefone(fmtTelefone(telefone))} />
              <small>É por ele que a confirmação chega.</small>
            </label>
            <label className="g-campo"><span>Quer avisar alguma coisa? <small>(opcional)</small></span>
              <textarea className="g-textarea" value={obs} maxLength={300} placeholder="Tem medo de secador, toma remédio, primeira vez…" onChange={(e) => setObs(e.target.value)} />
            </label>
          </div>

          {/* o valor, pet por pet (cada um no seu porte, com a promoção do horário) e o total: o mesmo que o pet shop vê no pedido */}
          <div className="g-lk-conta" role="status" aria-live="polite" data-teste="valor-do-pedido">
            <b>Valor{valores.some((l) => l.v.promo) ? ` com a promoção ${valores.find((l) => l.v.promo)!.v.promo!.nome}` : ""}</b>
            {valores.map((l, i) => (
              <Fragment key={i}>
                <div className="l" data-teste="valor-do-pet">
                  <span>{l.nome} <small>{portePorExtenso(l.v)}{l.v.promo ? ` · ${etiquetaPromo(l.v.promo)}` : ""}</small></span>
                  <span>{comDesconto(l.v) && l.v.valor != null ? <><s>{real(l.v.base!)}</s> <b>{real(l.v.valor)}</b></> : valorPorExtenso(l.v)}</span>
                </div>
                {partesPorExtenso(l.v) && <small className="g-lk-conta-partes" data-teste="valor-partes">{partesPorExtenso(l.v)}</small>}
              </Fragment>
            ))}
            {valores.length > 1 && <div className="l forte" data-teste="valor-total"><span>Total</span><span>{totalPorExtenso(valores)}</span></div>}
            <small>
              {!valores.length ? (extras.length ? `Um dos serviços não tem valor por aqui: ${info.nome} passa o valor pelo WhatsApp. ` : `O valor de ${servico.nome} não aparece por aqui: ${info.nome} passa pelo WhatsApp. `) : ""}
              {valores.some((l) => l.v.valor == null) ? "O preço muda com o porte: escolha o porte de cada pet para ver o valor certo. " : ""}
              Quem confirma o valor é {info.nome}. Nada é pago por aqui.
            </small>
          </div>

          <AceiteDosTermos termos={termos} loja={info.nome} pets={qtd} aceite={aceite} aoMudar={(a) => { setAceite(a); setErro(null); }} />

          {erro && (
            <div className="g-lk-alerta" role="alert">
              <span>{erro}</span>
              {limite && zapLoja && <a className="g-btn zap p" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Chamar no WhatsApp</a>}
            </div>
          )}

          <div className="g-lk-pe">
            <button type="button" className="g-btn sec" onClick={() => voltar("quando")}><ArrowLeft />Voltar</button>
            <button className="g-btn pri" disabled={enviando}>{enviando ? "Enviando…" : "Enviar pedido"}</button>
          </div>
          <p className="g-lk-nota">Isto é um pedido. O horário só vale depois que {info.nome} confirmar.</p>
        </form>
      )}

      {/* ---------- 4. enviado ---------- */}
      {!estadia && passo === "enviado" && enviado && (
        <section className="g-lk-secao g-lk-ok" aria-live="polite">
          <span className="g-lk-ok-selo" aria-hidden><Check /></span>
          <h2>{enviado.pets.length > 1 ? `Pedido enviado para ${listaDeNomes(enviado.pets.map((x) => x.nome))}.` : "Pedido enviado."}</h2>
          <p>{info.nome} confirma com você pelo WhatsApp.</p>
          <dl className="g-lk-resumo">
            <div><dt>{enviado.servicos.length > 1 ? "Serviços" : "Serviço"}</dt><dd data-teste="servicos-enviados">{enviado.servico}{enviado.pets.length > 1 && <small> para cada pet</small>}</dd></div>
            <div><dt>Dia</dt><dd>{diaPorExtenso(enviado.dia, info.hoje)}</dd></div>
            {enviado.promo && <div><dt>Promoção</dt><dd>{enviado.promo}</dd></div>}
            {enviado.pets.length === 1 ? (
              <>
                <div><dt>Pet</dt><dd>{enviado.pets[0].nome}</dd></div>
                <div><dt>Hora</dt><dd>{enviado.pets[0].hora}</dd></div>
              </>
            ) : (
              <div>
                <dt>Pets</dt>
                <dd>
                  <ul className="g-lk-resumo-pets">
                    {enviado.pets.map((x, i) => <li key={i}><span>{x.nome}</span><b>{x.hora}</b></li>)}
                  </ul>
                </dd>
              </div>
            )}
            {enviado.valores.length > 0 && (
              <div data-teste="valor-enviado">
                <dt>Valor</dt>
                <dd>
                  {enviado.valores.length === 1
                    ? <>{comDesconto(enviado.valores[0].v) && enviado.valores[0].v.valor != null ? <>de <s>{real(enviado.valores[0].v.base!)}</s> por {real(enviado.valores[0].v.valor)}</> : `${valorPorExtenso(enviado.valores[0].v)}${enviado.valores[0].v.valor == null ? ", conforme o porte" : ""}`}{partesPorExtenso(enviado.valores[0].v) && <small> ({partesPorExtenso(enviado.valores[0].v)})</small>}</>
                    : (
                      <ul className="g-lk-resumo-pets">
                        {enviado.valores.map((l, i) => <li key={i}><span>{l.nome} <small>({portePorExtenso(l.v)})</small></span><b>{comDesconto(l.v) && l.v.valor != null ? <><s>{real(l.v.base!)}</s> {real(l.v.valor)}</> : valorPorExtenso(l.v)}</b></li>)}
                        <li><span>Total</span><b>{totalPorExtenso(enviado.valores)}</b></li>
                      </ul>
                    )}
                  <small> Quem confirma o valor é {info.nome}.</small>
                </dd>
              </div>
            )}
            {endereco && <div data-teste="endereco-enviado"><dt>Onde</dt><dd>{endereco}{mapa && <> · <a href={mapa} target="_blank" rel="noopener noreferrer">Abrir no mapa</a></>}</dd></div>}
          </dl>
          <p className="g-lk-nota">{enviado.pets.length > 1 ? "Os horários ainda não estão marcados. Espere a confirmação pelo WhatsApp." : "O horário ainda não está marcado. Espere a confirmação pelo WhatsApp."}</p>
          <div className="g-lk-ok-acoes">
            {enviado.id && <a className="g-btn verde" href={`/gestao/agendar/${codigo}/pedido/${enviado.id}`}>Acompanhar o pedido</a>}
            <button type="button" className="g-btn sec" onClick={pedirOutro}>Pedir outro horário</button>
            {zapLoja && <a className="g-btn fantasma" href={linkWhatsApp(info.telefone, `Oi! Acabei de pedir ${listaDeNomes(enviado.servicos.map((x) => x.toLowerCase()))} para ${listaDeNomes(enviado.pets.map((x) => x.nome))} pelo link, ${diaPorExtenso(enviado.dia, info.hoje)} às ${enviado.pets[0]?.hora ?? ""}.${valorNaFrase(enviado.valores) ? ` O link mostrou o valor de ${valorNaFrase(enviado.valores)}.` : ""}`) ?? zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {info.nome}</a>}
          </div>
        </section>
      )}
    </Moldura>
  );
}

function Moldura({ children, duvida, google }: { children: React.ReactNode; duvida?: React.ReactNode; google?: { link: string; loja: string } | null }) {
  return (
    <div className={duvida ? "g-lk com-duvida" : "g-lk"}>
      <main className="g-lk-miolo">{children}</main>
      {duvida}
      <footer className="g-lk-rodape">
        {google && <a className="g-lk-google" href={google.link} target="_blank" rel="noopener noreferrer"><Star aria-hidden />Avalie {google.loja} no Google</a>}
        <span><Marca tamanho={16} />Feito com Maestro Pet Gestão</span>
        <Link href="/gestao/privacidade" target="_blank">Privacidade</Link>
      </footer>
    </div>
  );
}
