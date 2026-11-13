import type { Horario, Porte, Servico } from "./tipos";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (n: number | null | undefined) => moeda.format(Number(n ?? 0));
/** "R$ 60" sem centavos quando redondo. */
export const brlCurto = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? `R$ ${v.toLocaleString("pt-BR")}` : moeda.format(v);
};

const dois = (n: number) => String(n).padStart(2, "0");
/** Data local como AAAA-MM-DD (sem passar por UTC). */
export const isoDia = (d: Date) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
export const deIsoDia = (s: string) => { const [a, m, d] = s.split("-").map(Number); return new Date(a, m - 1, d); };
export const hora = (d: Date | string) => { const x = new Date(d); return `${dois(x.getHours())}:${dois(x.getMinutes())}`; };
export const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const somaDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const inicioDaSemana = (d: Date) => somaDias(inicioDoDia(d), -((d.getDay() + 6) % 7)); // segunda
export const mesmoDia = (a: Date, b: Date) => isoDia(a) === isoDia(b);
export const juntaDiaHora = (dia: string, hhmm: string) => { const d = deIsoDia(dia); const [h, m] = hhmm.split(":").map(Number); d.setHours(h, m, 0, 0); return d; };

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const nomeDia = (d: Date) => DIAS[d.getDay()];
export const nomeDiaCurto = (d: Date) => DIAS_CURTOS[d.getDay()];
export const nomeMes = (d: Date) => MESES[d.getMonth()];
/** "sexta, 14 de novembro" */
export const dataLonga = (d: Date | string) => { const x = new Date(d); return `${DIAS[x.getDay()]}, ${x.getDate()} de ${MESES[x.getMonth()]}`; };
/** "14/11" */
export const dataCurta = (d: Date | string) => { const x = typeof d === "string" && d.length === 10 ? deIsoDia(d) : new Date(d); return `${dois(x.getDate())}/${dois(x.getMonth() + 1)}`; };
/** "14/11/2026" */
export const dataCompleta = (d: Date | string) => { const x = typeof d === "string" && d.length === 10 ? deIsoDia(d) : new Date(d); return `${dataCurta(x)}/${x.getFullYear()}`; };
/** "hoje", "amanhã", "ontem" ou "sexta, 14/11" */
export function dataAmigavel(d: Date | string) {
  const x = typeof d === "string" && d.length === 10 ? deIsoDia(d) : new Date(d);
  const hoje = inicioDoDia(new Date());
  const dif = Math.round((inicioDoDia(x).getTime() - hoje.getTime()) / 864e5);
  if (dif === 0) return "hoje";
  if (dif === 1) return "amanhã";
  if (dif === -1) return "ontem";
  return `${DIAS[x.getDay()]}, ${dataCurta(x)}`;
}
export function haQuanto(d: Date | string | null | undefined) {
  if (!d) return "nunca";
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 864e5);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "há 1 mês" : meses < 12 ? `há ${meses} meses` : "há mais de 1 ano";
}
export function idade(nascimento: string | null | undefined) {
  if (!nascimento) return null;
  const n = deIsoDia(nascimento), h = new Date();
  let meses = (h.getFullYear() - n.getFullYear()) * 12 + h.getMonth() - n.getMonth();
  if (h.getDate() < n.getDate()) meses--;
  if (meses < 12) return meses <= 1 ? "1 mês" : `${meses} meses`;
  const anos = Math.floor(meses / 12);
  return anos === 1 ? "1 ano" : `${anos} anos`;
}
export function saudacao(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * Telefone como o sistema guarda: só DDD + número (10 ou 11 algarismos).
 * Tira o código do país ("+55", "55") e o zero da frente ("021…"). A mesma regra vale no banco
 * (função `telefone_limpo`), na planilha, nos formulários e na hora de comparar dois números.
 * Número que continua fora do tamanho volta só com os algarismos, para a tela poder mostrar e pedir conserto.
 */
export function telefoneLimpo(s: string | null | undefined) {
  let d = soDigitos(s).replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2).replace(/^0+/, "");
  return d;
}
/** DDD + número de verdade: 10 ou 11 algarismos, DDD sem zero e, com 11, o nono dígito. */
const foneCerto = (d: string) => (d.length === 10 || (d.length === 11 && d[2] === "9")) && d[0] !== "0" && d[1] !== "0";
/**
 * Lê o que veio numa célula ou num campo: devolve o primeiro telefone válido (já limpo) e avisa se havia mais de um.
 * `incompleto` é quando havia algo escrito e nenhum número serviu.
 */
export function lerTelefone(s: string | null | undefined): { fone: string | null; tinhaOutro: boolean; incompleto: boolean } {
  const bruto = (s ?? "").trim();
  if (!soDigitos(bruto)) return { fone: null, tinhaOutro: false, incompleto: false };
  const inteiro = telefoneLimpo(bruto);
  if (foneCerto(inteiro)) return { fone: inteiro, tinhaOutro: false, incompleto: false };
  const partes = bruto.split(/[\/;,|]|\s+(?:ou|e)\s+|\s{2,}/i).map(telefoneLimpo).filter(Boolean);
  const bons = partes.filter(foneCerto);
  if (bons.length) return { fone: bons[0], tinhaOutro: partes.length > 1, incompleto: false };
  return { fone: null, tinhaOutro: false, incompleto: true };
}
/** Os oito últimos algarismos: é por eles que dois cadastros são "o mesmo telefone" (com ou sem o nono dígito). */
export const fimDoTelefone = (s: string | null | undefined) => { const d = telefoneLimpo(s); return d.length >= 10 ? d.slice(-8) : ""; };

export function fmtTelefone(s: string | null | undefined) {
  const d = telefoneLimpo(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s ?? "";
}
/** Abre o WhatsApp do aparelho com a mensagem pronta (a pessoa só aperta enviar). */
export function linkWhatsApp(telefone: string | null | undefined, texto: string) {
  let d = telefoneLimpo(telefone);
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

/** Preço do serviço para o porte do pet; sem porte, usa o primeiro preço preenchido. */
export function precoDoServico(s: Pick<Servico, "preco_p" | "preco_m" | "preco_g" | "preco_gg"> | null | undefined, porte: string | null | undefined): number | null {
  if (!s) return null;
  const mapa: Record<Porte, number | null> = { P: s.preco_p, M: s.preco_m, G: s.preco_g, GG: s.preco_gg };
  const doPorte = porte ? mapa[porte as Porte] : null;
  return doPorte ?? s.preco_p ?? s.preco_m ?? s.preco_g ?? s.preco_gg ?? null;
}

/** Lê "1.234,56", "60", "60,5" ou "R$ 60" como número. */
export function lerValor(s: string): number | null {
  const limpo = s.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function horarioDoDia(horario: unknown, d: Date) {
  const h = (horario as Horario | null)?.[String(d.getDay())];
  return h && h.abre && h.fecha ? h : null;
}

/**
 * Almoço do pet shop num dia: vem dentro do dia, em `almoco: { de, ate }` (Meu pet shop > Horário de funcionamento).
 * Só vale no dia em que o pet shop abre antes e continua aberto depois dele (sábado até as 13h não tem almoço).
 * Devolve o intervalo em minutos desde 00:00, ou null.
 */
export function almocoDoDia(horario: unknown, d: Date) { return almocoNoDiaDaSemana(horario, d.getDay()); }
/** O mesmo, pelo número do dia da semana (0 = domingo), para quem faz a conta fora do fuso do navegador. */
export function almocoNoDiaDaSemana(horario: unknown, diaDaSemana: number): { inicio: number; fim: number; de: string; ate: string } | null {
  const dia = (horario as Horario | null)?.[String(diaDaSemana)];
  const a = dia?.almoco;
  if (!dia || !dia.abre || !dia.fecha || !a || typeof a.de !== "string" || typeof a.ate !== "string") return null;
  const min = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
  const inicio = min(a.de), fim = min(a.ate);
  if (!(fim > inicio) || min(dia.abre) >= inicio || min(dia.fecha) <= fim) return null;
  return { inicio, fim, de: a.de.slice(0, 5), ate: a.ate.slice(0, 5) };
}

export const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

/** Cor estável a partir de um texto (avatar sem foto). */
export function corDoNome(nome: string) {
  const cores = ["#c9773f", "#4d8f6b", "#3b82a0", "#7c6fb0", "#b0563f", "#8a7a3a", "#a05a82"];
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return cores[h % cores.length];
}

/** Compara textos sem acento e sem maiúsculas (busca). */
export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/* ---------- telefone (cadastro de tutor) e valores com centavos ---------- */

export const ERRO_TELEFONE = "Confira o WhatsApp: DDD e número.";
/** Vazio vale; preenchido precisa ter DDD + número (10 ou 11 dígitos). */
export const telefoneValido = (s: string | null | undefined) => { const d = telefoneLimpo(s); return d.length === 0 || d.length === 10 || d.length === 11; };
/** Formata enquanto a pessoa digita: "(35) 99999-1234". Letras e sobras são descartadas. */
export function mascaraTelefone(s: string | null | undefined) {
  const d = telefoneLimpo(s).slice(0, 11); // colou com +55 ou com o zero na frente: fica só DDD + número
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
/** "135,50" (sempre com duas casas, sem o R$). */
export const valor2 = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Como chamar a pessoa numa mensagem: o primeiro nome, mantendo o tratamento quando houver
 * ("Dona Zefa", "Seu João", "Dr. Paulo"), para não sair "Oi, Dona!".
 */
export function chamar(nome: string | null | undefined) {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  const tratamento = /^(dona|d\.|seu|sr\.?|sra\.?|srta\.?|dr\.?|dra\.?|tio|tia|professor|professora|prof\.?)$/i;
  return tratamento.test(partes[0]) && partes[1] ? `${partes[0]} ${partes[1]}` : partes[0];
}
