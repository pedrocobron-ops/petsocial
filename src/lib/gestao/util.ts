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
export function fmtTelefone(s: string | null | undefined) {
  const d = soDigitos(s);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return s ?? "";
}
/** Abre o WhatsApp do aparelho com a mensagem pronta (a pessoa só aperta enviar). */
export function linkWhatsApp(telefone: string | null | undefined, texto: string) {
  let d = soDigitos(telefone);
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
export const telefoneValido = (s: string | null | undefined) => { const d = soDigitos(s); return d.length === 0 || d.length === 10 || d.length === 11; };
/** Formata enquanto a pessoa digita: "(35) 99999-1234". Letras e sobras são descartadas. */
export function mascaraTelefone(s: string | null | undefined) {
  let d = soDigitos(s);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2); // colou com o código do país
  d = d.slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
/** "135,50" (sempre com duas casas, sem o R$). */
export const valor2 = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
