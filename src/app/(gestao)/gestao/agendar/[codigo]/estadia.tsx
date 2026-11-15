"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Cat, Check, Dog, MessageCircle, PawPrint, Plus, Trash2 } from "lucide-react";
import { banco } from "@/lib/gestao/supabase";
import { PORTES, type Porte } from "@/lib/gestao/tipos";
import { brl, brlCurto, dataCurta, deIsoDia, fmtTelefone, horarioDoDia, isoDia, somaDias } from "@/lib/gestao/util";
import { MUITOS_PEDIDOS, lembrarPedido } from "@/lib/gestao/link-opcoes";
import { AceiteDosTermos, SEM_ACEITE, faltaAceitar, pedirPeloLink, type TermosDoLink } from "./termos";

type Tipo = "creche" | "hotel";
type Especie = "cao" | "gato" | "outro";
const ESPECIES: { id: Especie; rotulo: string; icone: React.ComponentType<{ size?: number }> }[] = [
  { id: "cao", rotulo: "Cão", icone: Dog }, { id: "gato", rotulo: "Gato", icone: Cat }, { id: "outro", rotulo: "Outro", icone: PawPrint },
];
/** "Na sexta, 11/12," ou "No sábado, 12/12," (começo de frase). */
const naDia = (iso: string) => { const g = new Date(`${iso}T12:00:00`).getDay(); return `${g === 0 || g === 6 ? "No" : "Na"} ${dia(iso)},`; };
const soma = (iso: string, dias: number) => isoDia(somaDias(deIsoDia(iso), dias));
const dia = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return `${["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][d.getDay()]}, ${dataCurta(d)}`; };
/** O negócio abre nesse dia da semana? Sem horário preenchido, vale todo dia (a mesma regra de `creche_abre` no banco). */
function abreNoDia(horario: unknown, iso: string) {
  const algum = Array.from({ length: 7 }, (_, i) => horarioDoDia(horario, new Date(2024, 0, 7 + i))).some(Boolean);
  return !algum || Boolean(horarioDoDia(horario, new Date(`${iso}T12:00:00`)));
}
const entre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5);
type PetDoPedido = { nome: string; especie: Especie; porte: Porte | null };
const petVazio = (): PetDoPedido => ({ nome: "", especie: "cao", porte: null });
/** Até quantos pets do mesmo tutor cabem num pedido. */
const MAX_PETS = 4;
/** Sinal da reserva, como o dono definiu nas opções do hotel (o link só avisa: nada é pago por aqui). */
type SinalDoLink = { modo: string | null; valor: number | null; politica: string | null; creche: boolean };
/** O preço do hotel no link (`link_hotel_opcoes`): se o dono deixa mostrar, e a menor e a maior diária comum. */
export type PrecoDoHotel = { mostrar: boolean; de?: number | null; ate?: number | null; varia?: boolean };
/** A estimativa das datas e dos pets, calculada no banco pelas regras da conta (`link_hotel_estimativa`). */
type Estimativa = { noites: number; total: number; varia: boolean; desconto: boolean; sinal: number | null; pets: { porte: string | null; diaria: number; total: number; sinal: number | null }[] };
const PORTES_DA_FAIXA = [null, "P", "M", "G", "GG"];
/** A taxa de busca fora do horário do hotel, como o link recebe (`link_hotel_opcoes.atraso`). */
type AtrasoDoLink = { hora: string; valor: number; tolerancia: number };
/** O que a pessoa já preencheu, guardado nesta aba (sessionStorage): recarregar a página não perde o pedido. */
type Rascunho = { passo: "quando" | "dados"; entrada: string; saida: string; horaEntrada: string; horaSaida: string; pets: PetDoPedido[]; tutor: string; telefone: string; obs: string; naEspera: boolean };
const ehDia = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const ehHora = (v: unknown): v is string => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
function lerRascunho(chave: string, hoje: string): Rascunho | null {
  try {
    if (typeof window === "undefined") return null;
    const r = JSON.parse(sessionStorage.getItem(chave) ?? "null") as Partial<Rascunho> | null;
    if (!r || !ehDia(r.entrada) || !ehDia(r.saida) || r.entrada < hoje || !ehHora(r.horaEntrada) || !ehHora(r.horaSaida) || !Array.isArray(r.pets) || !r.pets.length) return null;
    const pets = r.pets.slice(0, MAX_PETS).map((x): PetDoPedido => ({
      nome: typeof x?.nome === "string" ? x.nome.slice(0, 80) : "",
      especie: x?.especie === "gato" || x?.especie === "outro" ? x.especie : "cao",
      porte: x?.porte === "P" || x?.porte === "M" || x?.porte === "G" || x?.porte === "GG" ? x.porte : null,
    }));
    const txt = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
    return { passo: r.passo === "dados" ? "dados" : "quando", entrada: r.entrada, saida: r.saida, horaEntrada: r.horaEntrada, horaSaida: r.horaSaida, pets,
      tutor: txt(r.tutor, 120), telefone: txt(r.telefone, 20), obs: txt(r.obs, 300), naEspera: r.naEspera === true };
  } catch { return null; }
}
const listaE = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);

/**
 * Pedido de creche (um ou mais dias) ou de hotel (entrada e saída) pelo link do cliente.
 * O cliente só fica sabendo se um dia está cheio; não vê quem está na casa nem quantas vagas existem.
 */
export default function EstadiaPeloLink({ codigo, tipo, hoje, loja, diaria, preco, zapLoja, zapCom, aoVoltar, termos = null, recarregarTermos, aoPedir, fechados, horario }: {
  codigo: string; tipo: Tipo; hoje: string; loja: string; diaria: number | null; zapLoja: string | null; aoVoltar: () => void;
  /** WhatsApp da loja com outro texto (depois do pedido, a conversa já começa falando dele) */ zapCom?: (texto: string) => string | null;
  /** hotel: o preço que o link pode mostrar. undefined = ainda lendo; null = banco antes da atualização (fica a diária comum, como era). */
  preco?: PrecoDoHotel | null;
  /** Regras que o tutor aceita antes de enviar (null = não pede aceite). */
  termos?: TermosDoLink | null; recarregarTermos?: () => Promise<unknown>; aoPedir?: () => void;
  /** dias que o negócio marcou como fechados (a creche não recebe neles) */
  fechados?: Set<string>;
  /** horário de funcionamento: a creche não recebe no dia da semana em que o negócio não abre */
  horario?: unknown;
}) {
  const hotel = tipo === "hotel";
  /** A creche não abre nesse dia (dia da semana fechado ou data marcada como fechada)? O hotel não depende disso. */
  const naoAbre = (d: string) => !hotel && (Boolean(fechados?.has(d)) || !abreNoDia(horario, d));
  // o hotel recebe e entrega só em dia que abre: a sugestão de entrada e de saída já cai num dia aberto
  const fechadoNoDia = (d: string) => Boolean(fechados?.has(d)) || !abreNoDia(horario, d);
  const proximoAberto = (de: string, i0: number) => { for (let i = i0; i <= i0 + 21; i++) { const d = soma(de, i); if (!fechadoNoDia(d)) return d; } return soma(de, i0); };
  // a creche já abre no próximo dia em que o negócio funciona (nunca num dia fechado)
  const primeiroDia = () => { for (let i = 1; i <= 21; i++) { const d = soma(hoje, i); if (!naoAbre(d)) return d; } return soma(hoje, 1); };
  const chaveRascunho = `maestro-link-rascunho:${codigo}:${tipo}`;
  const [rascunho] = useState(() => lerRascunho(chaveRascunho, hoje));
  const [passo, setPasso] = useState<"quando" | "dados" | "enviado">(rascunho?.passo ?? "quando");
  const [entrada, setEntrada] = useState(() => rascunho?.entrada ?? (hotel ? proximoAberto(hoje, 1) : primeiroDia()));
  const [saida, setSaida] = useState(() => rascunho?.saida ?? (hotel ? proximoAberto(proximoAberto(hoje, 1), 1) : primeiroDia()));
  const [cheios, setCheios] = useState<string[] | null>(null);
  const mexeuNasDatas = useRef(Boolean(rascunho));
  const pulos = useRef(0);
  // a hora sugerida cabe no horário do dia (abre às 9h: a chegada sugerida é 9h, não 8h)
  const dentroDoHorario = (d: string, hh: string) => {
    const h = horarioDoDia(horario, new Date(`${d}T12:00:00`));
    if (!h) return hh;
    const abre = h.abre.slice(0, 5), fecha = h.fecha.slice(0, 5);
    return hh < abre ? abre : hh > fecha ? fecha : hh;
  };
  const [horaEntrada, setHoraEntrada] = useState(() => rascunho?.horaEntrada ?? (hotel ? dentroDoHorario(entrada, "08:00") : "08:00"));
  const [horaSaida, setHoraSaida] = useState(() => rascunho?.horaSaida ?? (hotel ? dentroDoHorario(saida, "18:00") : "18:00"));
  const [pets, setPets] = useState<PetDoPedido[]>(() => rascunho?.pets ?? [petVazio()]);
  const mudarPet = (i: number, m: Partial<PetDoPedido>) => setPets((l) => l.map((x, j) => (j === i ? { ...x, ...m } : x)));
  const nomes = pets.map((x) => x.nome.trim()).filter(Boolean);
  const [sinal, setSinal] = useState<SinalDoLink | null>(null);
  const [tutor, setTutor] = useState(rascunho?.tutor ?? "");
  const [telefone, setTelefone] = useState(rascunho?.telefone ?? "");
  const [obs, setObs] = useState(rascunho?.obs ?? "");
  const [atraso, setAtraso] = useState<AtrasoDoLink | null>(null);
  // com a taxa de busca fora do horário ligada, dá para buscar depois do horário até esta hora ("21:00"); a hora da taxa vem junto
  const [buscaAte, setBuscaAte] = useState<{ ate: string; hora: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [aceite, setAceite] = useState(SEM_ACEITE);
  // lista de espera (só quando o pet shop ligou): em dia cheio, o tutor pode pedir para ser chamado se abrir vaga
  const [esperaAtiva, setEsperaAtiva] = useState(false);
  const [naEspera, setNaEspera] = useState(rascunho?.naEspera ?? false);
  useEffect(() => {
    let vale = true;
    void banco().rpc("link_espera_ativa", { p_codigo: codigo }).then(({ data }) => { if (vale) setEsperaAtiva(data === true); });
    return () => { vale = false; };
  }, [codigo]);
  // dia de experiência da creche (só quando o negócio ligou no link): o tutor marca no pedido de um dia só
  const [expLink, setExpLink] = useState<{ ativo: boolean; max: number; preco: number | null } | null>(null);
  const [experiencia, setExperiencia] = useState(false);
  useEffect(() => {
    if (hotel) return;
    let vale = true;
    void banco().rpc("link_creche_experiencia", { p_codigo: codigo }).then(({ data, error }) => {
      const x = data as { ativo?: boolean; max?: number; preco?: number | null } | null;
      if (vale && !error && x?.ativo) setExpLink({ ativo: true, max: Number(x.max) || 1, preco: x.preco == null ? null : Number(x.preco) });
    });
    return () => { vale = false; };
  }, [codigo, hotel]);
  const podeExperiencia = Boolean(expLink?.ativo) && !hotel && !naEspera && entrada === saida;

  const dias = hotel ? entre(entrada, saida) : entre(entrada, saida) + 1;
  // hotel: a chegada e a busca precisam cair num dia em que o negócio abre, dentro do horário daquele dia (o banco confere igual)
  const horasDoDia = (d: string) => horarioDoDia(horario, new Date(`${d}T12:00:00`));
  const fala = (hhmm: string) => { const [h, m] = hhmm.split(":"); return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`; };
  const erroDoDia = (d: string, hh: string, chegada: boolean): string | null => {
    if (!hotel || !d) return null;
    if (fechados?.has(d) || !abreNoDia(horario, d)) return `Não abrimos em ${dia(d)}. Escolha outro dia para ${chegada ? "a chegada" : "buscar o pet"}.`;
    const h = horasDoDia(d);
    if (!h || !/^\d{2}:\d{2}$/.test(hh)) return null;
    if (!chegada && buscaAte && hh > h.fecha.slice(0, 5) && hh <= buscaAte.ate) return null;
    if (!chegada && buscaAte && hh > h.fecha.slice(0, 5)) return `${naDia(d)} atendemos das ${fala(h.abre.slice(0, 5))} às ${fala(h.fecha.slice(0, 5))}. Buscar depois disso tem taxa e vai até as ${fala(buscaAte.ate)}. Escolha uma hora até as ${fala(buscaAte.ate)}.`;
    if (hh < h.abre.slice(0, 5) || hh > h.fecha.slice(0, 5)) return `${naDia(d)} atendemos das ${fala(h.abre.slice(0, 5))} às ${fala(h.fecha.slice(0, 5))}. Escolha uma hora de ${chegada ? "chegada" : "buscar"} nesse horário.`;
    return null;
  };
  // diz qual é o problema das datas (as mesmas regras do banco); null = datas boas
  const erroDatas = !entrada ? (hotel ? "Escolha o dia da entrada." : "Escolha o dia.")
    : !saida ? (hotel ? "Escolha o dia da saída." : "Escolha até que dia o pet vem.")
    : entrada < hoje ? `${hotel ? "A entrada" : "O dia"} não pode ser no passado. Escolha de hoje em diante.`
    : entrada > soma(hoje, 365) ? "Essa data está longe demais. Escolha uma entrada dentro de um ano."
    : hotel && saida === entrada ? "No hotel, a saída é pelo menos um dia depois da entrada."
    : saida < entrada ? (hotel ? "A saída está antes da entrada. Escolha uma saída depois da entrada." : "O último dia está antes do primeiro. Confira as datas.")
    : entre(entrada, saida) > 60 ? "O período passa de 60 dias. Escolha até 60 dias ou fale com a gente."
    : !/^\d{2}:\d{2}$/.test(horaEntrada) || !/^\d{2}:\d{2}$/.test(horaSaida) ? "Escolha a hora de chegada e a hora de buscar."
    : saida === entrada && horaSaida <= horaEntrada ? "No mesmo dia, a hora de buscar vem depois da hora de chegada."
    : erroDoDia(entrada, horaEntrada, true) ?? erroDoDia(saida, horaSaida, false);
  const datasOk = erroDatas === null;
  const [repetido, setRepetido] = useState(false);
  const total = diaria != null && datasOk ? diaria * dias : null;
  // hotel: a estimativa vem do banco, pelas mesmas regras da conta (porte, temporada, feriado, segundo pet), para as datas escolhidas
  const comEstimativa = hotel && Boolean(preco?.mostrar);
  const semPreco = hotel && (preco === undefined || preco?.mostrar === false);
  // antes de saber o porte: de quanto a quanto fica, conforme o porte
  const [faixa, setFaixa] = useState<{ chave: string; min: number; max: number; varia: boolean; sinalMin: number | null; sinalMax: number | null } | null>(null);
  const chaveDasDatas = `${entrada}|${saida}`;
  useEffect(() => {
    if (!comEstimativa || !datasOk) return;
    let vale = true;
    void banco().rpc("link_hotel_estimativa", { p_codigo: codigo, p_entrada: entrada, p_saida: saida, p_pets: PORTES_DA_FAIXA.map((porte) => ({ porte })), p_juntos: false }).then(({ data }) => {
      const e = data as unknown as Estimativa | null;
      if (!vale || !e || !Array.isArray(e.pets) || !e.pets.length) return;
      const totais = e.pets.map((x) => Number(x.total)), sinais = e.pets.map((x) => (x.sinal == null ? null : Number(x.sinal))).filter((x): x is number => x != null);
      setFaixa({ chave: `${entrada}|${saida}`, min: Math.min(...totais), max: Math.max(...totais), varia: Boolean(e.varia), sinalMin: sinais.length ? Math.min(...sinais) : null, sinalMax: sinais.length ? Math.max(...sinais) : null });
    });
    return () => { vale = false; };
  }, [codigo, comEstimativa, datasOk, entrada, saida]);
  const faixaBoa = faixa && faixa.chave === chaveDasDatas ? faixa : null;
  // com os pets (e o porte de cada um): a conta de cada pet, o total e o sinal
  const [estim, setEstim] = useState<{ chave: string; e: Estimativa } | null>(null);
  const chaveDosPets = `${chaveDasDatas}|${pets.map((x) => x.porte ?? "-").join(",")}`;
  useEffect(() => {
    if (!comEstimativa || !datasOk || passo === "quando" || passo === "enviado") return;
    let vale = true;
    const chave = chaveDosPets;
    void banco().rpc("link_hotel_estimativa", { p_codigo: codigo, p_entrada: entrada, p_saida: saida, p_pets: chave.split("|")[2].split(",").map((x) => ({ porte: x === "-" ? null : x })) }).then(({ data }) => {
      const e = data as unknown as Estimativa | null;
      if (vale) setEstim(e && Array.isArray(e.pets) ? { chave, e } : null);
    });
    return () => { vale = false; };
  }, [codigo, comEstimativa, datasOk, passo, entrada, saida, chaveDosPets]);
  const estimativa = estim && estim.chave === chaveDosPets ? estim.e : null;

  // dias cheios do período escolhido (no hotel, o dia da saída não ocupa vaga)
  useEffect(() => {
    if (!datasOk) { setCheios(null); return; }
    let vale = true;
    setCheios(null);
    void banco().rpc("link_estadia_cheios", { p_codigo: codigo, p_tipo: tipo, p_de: entrada, p_ate: hotel ? soma(saida, -1) : saida }).then(({ data }) => {
      if (!vale) return;
      const lista = Array.isArray(data) ? (data as unknown as string[]) : [];
      // as datas que a página sugeriu sozinha caíram em dia lotado: pula para o próximo dia (aberto), até achar vaga.
      // Depois que a pessoa mexe nas datas, nada muda sozinho.
      if (lista.length && !mexeuNasDatas.current && pulos.current < 14) {
        pulos.current++;
        let d = soma(entrada, 1);
        for (let i = 0; i < 21 && naoAbre(d); i++) d = soma(d, 1);
        setEntrada(d); setSaida(hotel ? soma(d, 1) : d);
        return;
      }
      setCheios(lista);
    });
    return () => { vale = false; };
  }, [codigo, tipo, entrada, saida, hotel, datasOk]);

  // as opções do hotel que o cliente precisa saber antes de pedir (hoje, só o sinal)
  useEffect(() => {
    let vale = true;
    void banco().rpc("link_hotel_opcoes", { p_codigo: codigo }).then(({ data }) => {
      const s = (data as { sinal?: SinalDoLink | null } | null)?.sinal;
      if (vale && s && (hotel || s.creche) && s.valor) setSinal(s);
      const a = (data as { atraso?: AtrasoDoLink | null } | null)?.atraso;
      if (vale && hotel && a && ehHora(a.hora) && Number(a.valor) > 0) setAtraso({ hora: a.hora, valor: Number(a.valor), tolerancia: Number(a.tolerancia) || 0 });
      const b = data as { busca_ate?: string | null; busca_hora?: string | null } | null;
      if (vale && hotel && b?.busca_ate && ehHora(b.busca_ate)) setBuscaAte({ ate: b.busca_ate, hora: ehHora(b.busca_hora ?? "") ? b.busca_hora! : b.busca_ate });
    });
    return () => { vale = false; };
  }, [codigo, hotel]);
  // o sinal em % é anunciado sobre a estimativa das datas (não sobre a diária comum)
  const sinalDaFaixa = sinal && sinal.modo !== "valor" && faixaBoa?.sinalMin != null && faixaBoa.sinalMax != null
    ? (faixaBoa.sinalMin === faixaBoa.sinalMax ? ` (cerca de ${brl(faixaBoa.sinalMin)})` : ` (de ${brl(faixaBoa.sinalMin)} a ${brl(faixaBoa.sinalMax)}, conforme o porte)`) : "";
  const fraseDoSinal = sinal ? `${loja} pede um sinal de ${sinal.modo === "valor" ? `${brl(sinal.valor)} por pet` : `${sinal.valor}% do valor da reserva`} para garantir a vaga${sinal.modo === "valor" ? "" : sinalDaFaixa}.` : null;
  const fraseDoSinalEnviado = sinal && estimativa?.sinal != null
    ? `${loja} pede um sinal de ${brl(estimativa.sinal)}${sinal.modo === "valor" ? (pets.length > 1 ? ` (${brl(sinal.valor)} por pet)` : "") : ` (${sinal.valor}% de ${brl(estimativa.total)})`} para garantir a vaga.` : fraseDoSinal;
  // busca depois da hora da taxa (com a tolerância): a estimativa avisa a taxa, que é cobrada na saída
  const minutos = (hh: string) => { const [h, m] = hh.split(":").map(Number); return h * 60 + (m || 0); };
  const comTaxaDeBusca = hotel && atraso && ehHora(horaSaida) && minutos(horaSaida) > minutos(atraso.hora) + atraso.tolerancia ? atraso : null;
  // a taxa é uma por busca: dois pets buscados juntos pagam uma vez (o check-out do hotel faz igual)
  const fraseDaTaxa = comTaxaDeBusca
    ? `Buscar às ${fala(horaSaida)} tem taxa de busca fora do horário (depois das ${fala(comTaxaDeBusca.hora)}${comTaxaDeBusca.tolerancia ? `, com ${comTaxaDeBusca.tolerancia} minutos de tolerância` : ""}): ${brl(comTaxaDeBusca.valor)}${pets.length > 1 ? " por busca" : ""}, cobrada na saída.${buscaAte ? ` Dá para buscar até as ${fala(buscaAte.ate)}.` : ""}`
    : hotel && !atraso && buscaAte && ehHora(horaSaida) && minutos(horaSaida) > minutos(buscaAte.hora) ? `Buscar depois das ${fala(buscaAte.hora)} tem taxa de busca fora do horário, cobrada na saída. Dá para buscar até as ${fala(buscaAte.ate)}.`
    : null;
  // guarda o que já foi preenchido nesta aba (o aceite das regras não: a pessoa marca de novo)
  useEffect(() => {
    try {
      // pedido enviado: o rascunho e a escolha de creche ou hotel saem (recarregar volta para o começo do link)
      if (passo === "enviado") { sessionStorage.removeItem(chaveRascunho); sessionStorage.removeItem(`maestro-link-estadia:${codigo}`); return; }
      const r: Rascunho = { passo, entrada, saida, horaEntrada, horaSaida, pets, tutor, telefone, obs, naEspera };
      sessionStorage.setItem(chaveRascunho, JSON.stringify(r));
    } catch { /* sem armazenamento: segue sem guardar */ }
  }, [chaveRascunho, codigo, passo, entrada, saida, horaEntrada, horaSaida, pets, tutor, telefone, obs, naEspera]);
  // telefone fixo no campo do WhatsApp: só um lembrete, não impede o pedido
  const foneDigitado = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  const pareceFixo = foneDigitado.length === 10 && /[2-5]/.test(foneDigitado[2]);

  function mudarEntrada(v: string) {
    mexeuNasDatas.current = true;
    setEntrada(v);
    if (v && (hotel ? saida <= v : saida < v)) setSaida(soma(v, hotel ? 1 : 0));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const fone = telefone.replace(/\D/g, "");
    if (pets.some((x) => x.nome.trim().length < 1)) { setErro(pets.length > 1 ? "Diga o nome de cada pet, ou tire o que ficou em branco." : "Diga o nome do pet."); return; }
    if (new Set(pets.map((x) => x.nome.trim().toLowerCase())).size < pets.length) { setErro("Dois pets estão com o mesmo nome. Mude um deles."); return; }
    if (tutor.trim().length < 2) { setErro("Diga o seu nome."); return; }
    if (fone.length < 10 || fone.length > 13) { setErro("Confira o WhatsApp: DDD e número."); return; }
    const falta = faltaAceitar(termos, aceite, loja);
    if (falta) { setErro(falta); return; }
    setErro(null);
    setRepetido(false);
    setEnviando(true);
    try {
      if (naEspera) {
        // um pedido de espera por pet; não reserva nada
        for (const x of pets) {
          // com as regras do link ligadas, a espera também só entra com o aceite (o banco confere e guarda a data)
          const { data, error } = await pedirPeloLink("link_espera_pedir", {
            p_codigo: codigo, p_tipo: tipo, p_entrada: entrada, p_saida: saida, p_tutor: tutor.trim(), p_telefone: fone, p_pet: x.nome.trim(),
            p_especie: x.especie, p_porte: x.porte ?? undefined, p_obs: obs.trim() || undefined,
            ...(hotel ? { p_hora_entrada: horaEntrada, p_hora_saida: horaSaida } : {}),
          }, termos, aceite);
          const r = data as { ok?: boolean; erro?: string; motivo?: string } | null;
          if (error || !r) { setErro("Não deu para enviar agora. Confira a internet e tente de novo."); return; }
          if (!r.ok && r.erro === "termos") {
            await recarregarTermos?.();
            setAceite(SEM_ACEITE);
            setErro(`As regras de ${loja} mudaram agora há pouco. Leia de novo e marque para enviar.`);
            return;
          }
          if (!r.ok) {
            setErro(r.erro === "tem_vaga" ? "Abriu vaga nessas datas. Volte e faça o pedido normal."
              : r.erro === "repetido" ? `${x.nome.trim()} já está na lista de espera para essas datas.`
              : r.erro === "nao_abre" ? "Um dos dias escolhidos não tem atendimento. Escolha outras datas."
              : r.erro === "limite" && r.motivo === "muitos" ? MUITOS_PEDIDOS
              : r.erro === "limite" ? "Você já tem pedidos esperando. Fale direto com a gente para combinar."
              : r.erro === "fechado" ? "A lista de espera não está aberta agora. Fale direto com a gente."
              : r.erro === "datas" ? "Confira as datas e tente de novo."
              : r.erro === "dados" ? "Confira o nome do pet, o seu nome e o WhatsApp com DDD."
              : "Algo deu errado. Tente de novo em instantes.");
            if (r.erro === "tem_vaga" || r.erro === "nao_abre" || r.erro === "datas") { setNaEspera(false); setPasso("quando"); }
            return;
          }
        }
        setPasso("enviado");
        return;
      }
      const { data, error } = await pedirPeloLink("link_pedir_estadia", {
        p_codigo: codigo, p_tipo: tipo, p_entrada: entrada, p_saida: saida, p_tutor: tutor.trim(), p_telefone: fone, p_pet: pets[0].nome.trim(),
        p_especie: pets[0].especie, p_porte: pets[0].porte ?? undefined, p_obs: obs.trim() || undefined,
        p_hora_entrada: horaEntrada, p_hora_saida: horaSaida,
        ...(pets.length > 1 ? { p_mais_pets: pets.slice(1).map((x) => ({ nome: x.nome.trim(), especie: x.especie, porte: x.porte })) } : {}),
        ...(podeExperiencia && experiencia ? { p_experiencia: true } : {}),
      }, termos, aceite);
      const r = data as { ok?: boolean; erro?: string; motivo?: string; id?: string; dia?: string; quando?: string; abre?: string; fecha?: string; ate?: string | null } | null;
      if (error || !r) { setErro("Não deu para enviar agora. Confira a internet e tente de novo."); return; }
      if (!r.ok) {
        if (r.erro === "termos") {
          // as regras mudaram entre abrir a página e enviar: mostra o texto novo e pede o aceite de novo
          await recarregarTermos?.();
          setAceite(SEM_ACEITE);
          setErro(`As regras de ${loja} mudaram agora há pouco. Leia de novo e marque para enviar.`);
          return;
        }
        setErro(r.erro === "lotado" && pets.length > 1 ? `Não há vaga para os ${pets.length} pets em ${r.dia ? dia(r.dia) : "um dos dias"}. Escolha outras datas ou peça para menos pets.`
          : r.erro === "lotado" ? `Não dá para receber em ${r.dia ? dia(r.dia) : "um dos dias"}: a casa está cheia ou não abre nesse dia. Escolha outras datas.`
          : r.erro === "limite" && r.motivo === "muitos" ? MUITOS_PEDIDOS
          : r.erro === "limite" ? "Você já tem pedidos esperando resposta. Fale direto com a gente para combinar."
          : r.erro === "fechado" ? "Este link não está recebendo pedidos agora."
          : r.erro === "datas" ? "Confira as datas: a entrada não pode ser no passado, a saída vem depois da entrada e o período vai até 60 dias."
          : r.erro === "repetido" ? `Você já pediu vaga para ${listaE(nomes)} nessas datas. Acompanhe o pedido ou fale com a gente.`
          : r.erro === "horas" ? "No mesmo dia, a hora de buscar vem depois da hora de chegada."
          : r.erro === "dia_fechado" ? `Não abrimos em ${r.dia ? dia(r.dia) : "um dos dias"}. Escolha outro dia para ${r.quando === "saida" ? "buscar o pet" : "a chegada"}.`
          : r.erro === "fora_do_horario" ? `${r.dia ? naDia(r.dia) : "Nesse dia"} atendemos das ${fala(r.abre ?? "")} às ${fala(r.fecha ?? "")}. ${r.quando === "saida" && r.ate ? `Buscar depois disso tem taxa e vai até as ${fala(r.ate)}. Escolha uma hora até as ${fala(r.ate)}.` : `Escolha uma hora de ${r.quando === "saida" ? "buscar" : "chegada"} nesse horário.`}`
          : r.erro === "dados" ? "Confira o nome do pet, o seu nome e o WhatsApp com DDD."
          : r.erro === "experiencia" ? "O dia de experiência é para um dia só na creche. Confira o dia ou tire a marca de dia de experiência."
          : "Algo deu errado. Tente de novo em instantes.");
        if (r.erro === "experiencia") setExperiencia(false);
        setRepetido(r.erro === "repetido");
        if (r.erro === "lotado" || r.erro === "datas" || r.erro === "horas" || r.erro === "dia_fechado" || r.erro === "fora_do_horario") setPasso("quando");
        return;
      }
      setPedidoId(r.id ?? null);
      // o endereço de acompanhar fica guardado neste aparelho: recarregar a página não perde o pedido
      if (r.id) { lembrarPedido(codigo, r.id, `${hotel ? "Hotel" : "Creche"} de ${listaE(nomes)}`); aoPedir?.(); }
      setPasso("enviado");
    } finally { setEnviando(false); }
  }

  const nome = hotel ? "Hotel" : "Creche";
  const periodo = hotel ? `de ${dia(entrada)} até ${dia(saida)}` : entrada === saida ? dia(entrada) : `de ${dia(entrada)} até ${dia(saida)}`;

  if (passo === "enviado" && naEspera) {
    return (
      <section className="g-lk-secao g-lk-ok" aria-live="polite">
        <span className="g-lk-ok-selo" aria-hidden><Check /></span>
        <h2>Você está na lista de espera.</h2>
        <p>Se abrir vaga, {loja} chama você pelo WhatsApp.</p>
        <dl className="g-lk-resumo">
          <div><dt>Lista de espera</dt><dd>{nome}</dd></div>
          <div><dt>{nomes.length > 1 ? "Pets" : "Pet"}</dt><dd>{listaE(nomes)}</dd></div>
          <div><dt>{hotel ? "Entrada" : "Dia"}</dt><dd>{dia(entrada)}{hotel ? `, às ${horaEntrada}` : ""}</dd></div>
          {(hotel || saida !== entrada) && <div><dt>{hotel ? "Saída" : "Até"}</dt><dd>{dia(saida)}{hotel ? `, às ${horaSaida}` : ""}</dd></div>}
        </dl>
        <p className="g-lk-nota">Isto não é uma reserva: a vaga só vale se {loja} chamar e confirmar com você.</p>
        <div className="g-lk-ok-acoes">
          <button type="button" className="g-btn sec" onClick={aoVoltar}>Fazer outro pedido</button>
          {zapLoja && <a className="g-btn fantasma" href={zapCom?.(`Oi! Entrei na lista de espera ${hotel ? "do hotel" : "da creche"} para ${listaE(nomes)} pelo link, ${periodo}.`) ?? zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com a gente</a>}
        </div>
      </section>
    );
  }

  if (passo === "enviado") {
    return (
      <section className="g-lk-secao g-lk-ok" aria-live="polite">
        <span className="g-lk-ok-selo" aria-hidden><Check /></span>
        <h2>Pedido enviado.</h2>
        <p>{loja} confirma com você pelo WhatsApp.</p>
        <dl className="g-lk-resumo">
          <div><dt>Pedido</dt><dd>{nome}{podeExperiencia && experiencia ? " · dia de experiência" : ""}</dd></div>
          <div><dt>{nomes.length > 1 ? "Pets" : "Pet"}</dt><dd>{listaE(nomes)}</dd></div>
          <div><dt>{hotel ? "Entrada" : "Dia"}</dt><dd>{dia(entrada)}, às {horaEntrada}</dd></div>
          {(hotel || saida !== entrada) ? <div><dt>{hotel ? "Saída" : "Até"}</dt><dd>{dia(saida)}, às {horaSaida}</dd></div> : <div><dt>Buscar</dt><dd>às {horaSaida}</dd></div>}
          {estimativa && <div><dt>Estimativa</dt><dd>cerca de {brl(estimativa.total)} <small>({dias} {dias === 1 ? "noite" : "noites"}{estimativa.pets.length > 1 ? `, ${estimativa.pets.length} pets` : ""})</small></dd></div>}
        </dl>
        <p className="g-lk-nota">A vaga ainda não está reservada. Espere a confirmação.</p>
        {fraseDoSinalEnviado && <p className="g-lk-nota">Depois da confirmação, {fraseDoSinalEnviado}{sinal?.politica ? ` ${sinal.politica}` : ""} O pagamento é combinado direto com {loja}: nada é pago por aqui.</p>}
        <div className="g-lk-ok-acoes">
          {pedidoId && <a className="g-btn verde" href={`/gestao/agendar/${codigo}/pedido/${pedidoId}`}>Acompanhar o pedido</a>}
          <button type="button" className="g-btn sec" onClick={aoVoltar}>Fazer outro pedido</button>
          {zapLoja && <a className="g-btn fantasma" href={zapCom?.(`Oi! Acabei de pedir uma vaga ${hotel ? "no hotel" : "na creche"} para ${listaE(nomes)} pelo link, ${periodo}.`) ?? zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {loja}</a>}
        </div>
      </section>
    );
  }

  if (passo === "quando") {
    const temCheio = (cheios?.length ?? 0) > 0;
    // dia fechado não é "sem vaga": diz que não abre, e não oferece lista de espera para ele
    const diasFechados = (cheios ?? []).filter(naoAbre), lotados = (cheios ?? []).filter((d) => !naoAbre(d));
    const lista = (l: string[]) => `${l.slice(0, 4).map(dia).join("; ")}${l.length > 4 ? " e outros dias" : ""}`;
    return (
      <section className="g-lk-secao">
        <h2>{hotel ? "Quando o seu pet fica com a gente?" : "Que dia o seu pet vem para a creche?"}</h2>
        <div className="g-lk-bloco g-form">
          <label className="g-campo"><span>{hotel ? "Dia da entrada" : "Dia"}</span>
            <input className="g-input" type="date" min={hoje} max={soma(hoje, 365)} value={entrada} onChange={(e) => { setErro(null); mudarEntrada(e.target.value); }} />
          </label>
          <label className="g-campo"><span>{hotel ? "Dia da saída" : "Até o dia"} {!hotel && <small>(igual, se for um dia só)</small>}</span>
            <input className="g-input" type="date" min={!entrada ? hoje : hotel ? soma(entrada, 1) : entrada} max={entrada ? soma(entrada, 60) : undefined} value={saida} onChange={(e) => { setErro(null); mexeuNasDatas.current = true; setSaida(e.target.value); }} />
          </label>
          <div className="dupla">
            <label className="g-campo"><span>Hora de chegada</span>
              <input className="g-input" type="time" value={horaEntrada} onChange={(e) => { setErro(null); setHoraEntrada(e.target.value); }} />
            </label>
            <label className="g-campo"><span>Hora de buscar</span>
              <input className="g-input" type="time" value={horaSaida} onChange={(e) => { setErro(null); setHoraSaida(e.target.value); }} />
            </label>
          </div>
          {datasOk && (
            <p className="g-p">
              <b>{dias} {hotel ? (dias === 1 ? "noite" : "noites") : (dias === 1 ? "dia" : "dias")}</b>
              {comEstimativa
                ? faixaBoa && <> · {faixaBoa.min === faixaBoa.max ? `cerca de ${brl(faixaBoa.min)} no total` : `de ${brl(faixaBoa.min)} a ${brl(faixaBoa.max)} no total, conforme o porte do pet`}{faixaBoa.varia ? ". Essas datas têm preço de temporada ou feriado." : "."}</>
                : !semPreco && diaria != null && <> · diária de {brlCurto(diaria)}{total != null && dias > 1 ? `, cerca de ${brlCurto(total)} no total` : ""}</>}
            </p>
          )}
          {fraseDoSinal && <p className="g-muted g-pp">{fraseDoSinal}{sinal?.politica ? ` ${sinal.politica}` : ""} Nada é pago por aqui.</p>}
          {datasOk && fraseDaTaxa && <p className="g-muted g-pp">{fraseDaTaxa}</p>}
          {erroDatas && <p className="g-lk-alerta" role="alert"><span>{erroDatas}</span></p>}
          {erro && !erroDatas && <p className="g-lk-alerta" role="alert"><span>{erro}</span></p>}
          {temCheio && (
            <p className="g-lk-alerta" role="alert"><span>{diasFechados.length ? `Não abrimos em ${lista(diasFechados)}. ` : ""}{lotados.length ? `Sem vaga em ${lista(lotados)}. ` : ""}{diasFechados.length ? (dias === 1 ? "Escolha outro dia." : "Escolha outras datas.") : `Escolha outras datas${esperaAtiva ? " ou entre na lista de espera" : ""}.`}</span></p>
          )}
          {temCheio && esperaAtiva && lotados.length > 0 && !diasFechados.length && (
            <div style={{ display: "grid", gap: 6, justifyItems: "start" }}>
              <button type="button" className="g-btn sec" onClick={() => { setErro(null); setNaEspera(true); setPasso("dados"); }}>Entrar na lista de espera</button>
              <small className="g-muted">Se abrir vaga nessas datas, {loja} chama você. Entrar na lista não reserva a vaga.</small>
            </div>
          )}
        </div>
        <div className="g-lk-pe">
          <button type="button" className="g-btn sec" onClick={aoVoltar}><ArrowLeft />Voltar</button>
          <button type="button" className="g-btn pri" disabled={!datasOk || cheios === null || temCheio} onClick={() => { setNaEspera(false); setPasso("dados"); }}>{cheios === null && datasOk ? "Conferindo as vagas…" : "Continuar"}</button>
        </div>
      </section>
    );
  }

  return (
    <form className="g-lk-secao" onSubmit={enviar} noValidate>
      <button type="button" className="g-lk-escolhido" style={{ "--cor": hotel ? "#7c6bd6" : "#3b9bd9" } as React.CSSProperties} onClick={() => setPasso("quando")}>
        <i aria-hidden />
        <span><b>{naEspera ? `Lista de espera · ${nome}` : nome}</b> · {periodo}{naEspera && !hotel ? "" : ` · chega às ${horaEntrada}, busca às ${horaSaida}`}</span>
        <u>Trocar</u>
      </button>
      <div className="g-lk-bloco g-form">
        <div className="g-lk-bloco-t"><h2>Quem vem?</h2></div>
        {pets.map((x, i) => (
          <div key={i} className="g-lk-pet" role="group" aria-label={pets.length > 1 ? `Pet ${i + 1}` : "Pet"}>
            <label className="g-campo"><span>Nome do pet{pets.length > 1 ? ` ${i + 1}` : ""}</span>
              <input className="g-input" value={x.nome} maxLength={80} autoComplete="off" onChange={(e) => mudarPet(i, { nome: e.target.value })} />
            </label>
            <div className="g-campo">
              <span>É um</span>
              <div className="g-lk-opcoes tres">
                {ESPECIES.map((e) => <button key={e.id} type="button" className="g-lk-opcao" aria-pressed={x.especie === e.id} onClick={() => mudarPet(i, { especie: e.id })}><e.icone />{e.rotulo}</button>)}
              </div>
            </div>
            <div className="g-campo">
              <span>Porte <small>(se souber)</small></span>
              <div className="g-lk-opcoes quatro">
                {PORTES.map((p) => (
                  <button key={p.id} type="button" className="g-lk-opcao porte" aria-pressed={x.porte === p.id} onClick={() => mudarPet(i, { porte: x.porte === p.id ? null : p.id })}><b>{p.id}</b><small>{p.rotulo}</small></button>
                ))}
              </div>
            </div>
            {pets.length > 1 && <button type="button" className="g-btn fantasma p" style={{ justifySelf: "start" }} onClick={() => setPets((l) => l.filter((_, j) => j !== i))}><Trash2 />Tirar este pet</button>}
          </div>
        ))}
        {pets.length < MAX_PETS
          ? <button type="button" className="g-btn sec p" style={{ justifySelf: "start" }} onClick={() => setPets((l) => [...l, petVazio()])}><Plus />Outro pet do mesmo tutor</button>
          : <p className="g-muted g-pp">Até {MAX_PETS} pets por pedido. Para mais, faça outro pedido.</p>}
        {podeExperiencia && (
          <label className="g-check">
            <input type="checkbox" checked={experiencia} onChange={(e) => { setExperiencia(e.target.checked); setErro(null); }} />
            <span><b>Quero o dia de experiência</b> · {pets.length > 1 ? "o primeiro dia dos pets" : "o primeiro dia do pet"} na creche, para conhecer{expLink!.preco == null ? "" : expLink!.preco > 0 ? ` (${brl(expLink!.preco)})` : " (gratuito)"}. {loja} confirma com você.</span>
          </label>
        )}
        {comEstimativa && !naEspera && estimativa && (
          <div className="g-lk-conta" role="status" aria-live="polite">
            <b>Estimativa para {dias} {dias === 1 ? "noite" : "noites"}</b>
            {estimativa.pets.map((x, i) => (
              <div key={i} className="l"><span>{pets[i]?.nome.trim() || `Pet ${i + 1}`} <small>{x.porte ? `porte ${x.porte}` : "sem porte"}</small></span><span>{brl(x.total)}</span></div>
            ))}
            {estimativa.pets.length > 1 && <div className="l forte"><span>Total</span><span>{brl(estimativa.total)}</span></div>}
            {estimativa.sinal != null && sinal && <div className="l"><span>Sinal para garantir a vaga{sinal.modo === "valor" ? "" : ` (${sinal.valor}%)`}</span><span>{brl(estimativa.sinal)}</span></div>}
            {comTaxaDeBusca && <div className="l"><span>Taxa de busca fora do horário <small>(busca às {fala(horaSaida)}, cobrada na saída{pets.length > 1 ? ", uma vez para os pets buscados juntos" : ""})</small></span><span>{brl(comTaxaDeBusca.valor)}</span></div>}
            <small>
              {estimativa.varia ? "Essas datas têm preço de temporada ou feriado. " : ""}
              {estimativa.desconto ? "Já com o desconto para mais de um pet. " : ""}
              {preco?.de != null && preco.ate != null && preco.de !== preco.ate && estimativa.pets.some((x) => !x.porte) ? "O preço muda com o porte: escolha o porte para a conta ficar certa. " : ""}
              É uma estimativa: quem confirma o valor é {loja}. Nada é pago por aqui.
            </small>
          </div>
        )}

      </div>
      <div className="g-lk-bloco g-form">
        <h2>Com quem a gente fala?</h2>
        <label className="g-campo"><span>Seu nome</span>
          <input className="g-input" value={tutor} maxLength={120} autoComplete="name" onChange={(e) => setTutor(e.target.value)} />
        </label>
        <label className="g-campo"><span>Seu WhatsApp</span>
          <input className="g-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={telefone} maxLength={20}
            onChange={(e) => setTelefone(e.target.value)} onBlur={() => setTelefone(fmtTelefone(telefone))} />
          <small>É por ele que a confirmação chega.</small>
          {pareceFixo && <small role="status">Esse número parece de telefone fixo. Confira se ele recebe WhatsApp, ou coloque o celular.</small>}
        </label>
        <label className="g-campo"><span>Quer avisar alguma coisa? <small>(opcional)</small></span>
          <textarea className="g-textarea" value={obs} maxLength={300} placeholder="Vacinas em dia, toma remédio, primeira vez, o que ele come…" onChange={(e) => setObs(e.target.value)} />
        </label>
      </div>
      <AceiteDosTermos termos={termos} loja={loja} pets={pets.length} aceite={aceite} aoMudar={(a) => { setAceite(a); setErro(null); }} />
      {erro && (
        <div className="g-lk-alerta" role="alert">
          <span>{erro}</span>
          {repetido && zapLoja && <a className="g-btn zap p" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com a gente</a>}
        </div>
      )}
      <div className="g-lk-pe">
        <button type="button" className="g-btn sec" onClick={() => { setErro(null); setRepetido(false); setPasso("quando"); }}><ArrowLeft />Voltar</button>
        <button className="g-btn pri" disabled={enviando}>{enviando ? "Enviando…" : naEspera ? "Entrar na lista de espera" : "Enviar pedido"}</button>
      </div>
      <p className="g-lk-nota">{naEspera ? `A lista de espera não reserva a vaga. Se abrir lugar, ${loja} chama você pelo WhatsApp.` : `Isto é um pedido. A vaga só vale depois que ${loja} confirmar.`}</p>
    </form>
  );
}
