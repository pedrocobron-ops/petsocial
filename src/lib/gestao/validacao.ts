/**
 * Conferências que valem no aplicativo inteiro: nomes sem marcação (HTML), datas de estadia sem exagero,
 * mensagens de campo obrigatório em português e o aviso de sem internet. Funções puras (testes/unidade/robustez.js).
 */

/**
 * Nome sem marcação: tira o que parece etiqueta de HTML ("<b>", "</b>", "<script …>") e os sinais < e > que sobrarem,
 * junta espaços e corta as pontas. A mesma regra do banco (função `limpar_nome`, migração 20261226), que limpa de novo
 * nome de pet shop, tutor, pet, equipe, serviço e produto: o que a tela mostra é o que fica gravado.
 * "Quebrador 🐶 <b>"V3"</b> & Cia" → "Quebrador 🐶 "V3" & Cia"; "Rex <3" → "Rex 3".
 */
export function limparNome(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/<\/?[A-Za-z!?][^<>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/** O nome tinha marcação (para avisar "tiramos os sinais < e >"). */
export const tinhaMarcacao = (s: string | null | undefined) => /[<>]/.test(String(s ?? ""));

/* ---------- estadias: saída prevista longe demais (data velha no formulário, ano trocado) ---------- */

/** Até quantos dias depois da entrada a tela aceita a saída prevista. O banco recusa acima de 366 (qualquer tipo). */
export const DIAS_MAXIMOS_ESTADIA = { creche: 31, hotel: 180 } as const;
export const DIAS_MAXIMOS_NO_BANCO = 366;

const dois = (n: number) => String(n).padStart(2, "0");
const dataComAno = (d: Date) => `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;

/**
 * A saída prevista está longe demais da entrada? Devolve a frase para a pessoa corrigir (ou null quando está tudo bem).
 * Conta em dias de calendário (a hora não pesa).
 */
export function saidaLongeDemais(tipo: string, entrada: Date, saida: Date | null | undefined): string | null {
  if (!saida || Number.isNaN(saida.getTime()) || Number.isNaN(entrada.getTime())) return null;
  const limite = tipo === "creche" ? DIAS_MAXIMOS_ESTADIA.creche : DIAS_MAXIMOS_ESTADIA.hotel;
  const ini = new Date(entrada.getFullYear(), entrada.getMonth(), entrada.getDate());
  const fim = new Date(saida.getFullYear(), saida.getMonth(), saida.getDate());
  const dias = Math.round((fim.getTime() - ini.getTime()) / 864e5);
  if (dias <= limite) return null;
  return `A saída prevista ficou em ${dataComAno(saida)}, ${dias} dias depois da entrada. Confira o dia e o ano. `
    + (tipo === "creche"
      ? `Na creche, a saída prevista vai até ${limite} dias; quem vem todo mês fica melhor num plano de mensalista.`
      : `No hotel, a saída prevista vai até ${limite} dias. Se for mais que isso, deixe sem saída prevista.`);
}

/* ---------- campo obrigatório e formato: o balão do navegador em português ---------- */

/** O que o navegador conta de um campo inválido (`input.validity`). */
export type Validade = {
  valueMissing?: boolean; typeMismatch?: boolean; patternMismatch?: boolean; tooShort?: boolean; tooLong?: boolean;
  rangeUnderflow?: boolean; rangeOverflow?: boolean; stepMismatch?: boolean; badInput?: boolean;
};
type Campo = { type?: string; min?: string; max?: string; minLength?: number; maxLength?: number; tagName?: string };

/** A frase em português para o balão do navegador (no lugar de "Please fill out this field."). */
export function mensagemDeValidacao(v: Validade, c: Campo = {}): string {
  const tipo = (c.type ?? "").toLowerCase();
  if (v.valueMissing) {
    if (tipo === "checkbox") return "Marque esta opção para continuar.";
    if (tipo === "radio") return "Escolha uma das opções.";
    if (tipo === "file") return "Escolha um arquivo.";
    if ((c.tagName ?? "").toUpperCase() === "SELECT") return "Escolha uma opção da lista.";
    if (tipo === "date") return "Escolha o dia.";
    if (tipo === "time") return "Escolha a hora.";
    return "Preencha este campo.";
  }
  if (v.badInput) return tipo === "number" ? "Escreva só números." : tipo === "date" ? "Confira a data: esse dia não existe." : "Confira o que foi escrito.";
  if (v.typeMismatch) return tipo === "email" ? "Confira o e-mail: precisa ter @ e o endereço (ex.: nome@gmail.com)." : tipo === "url" ? "Confira o endereço (ex.: https://…)." : "Confira o que foi escrito.";
  if (v.tooShort) return `Escreva pelo menos ${c.minLength} caracteres.`;
  if (v.tooLong) return `Use no máximo ${c.maxLength} caracteres.`;
  if (v.rangeUnderflow) return tipo === "date" ? "Essa data é antes do permitido. Confira o dia." : `O menor valor aceito é ${String(c.min ?? "").replace(".", ",")}.`;
  if (v.rangeOverflow) return tipo === "date" ? "Essa data é depois do permitido. Confira o dia e o ano." : `O maior valor aceito é ${String(c.max ?? "").replace(".", ",")}.`;
  if (v.stepMismatch) return tipo === "time" ? "Confira a hora." : "Confira o número (use no máximo os centavos).";
  if (v.patternMismatch) return "Confira o formato do que foi escrito.";
  return "Confira este campo.";
}

/* ---------- sem internet ---------- */

/** Texto de quando a internet caiu (o aparelho diz que está sem conexão). */
export const TEXTO_SEM_INTERNET = "Sem internet agora. Confira o Wi-Fi ou os dados do celular e tente de novo quando voltar.";
/** Texto de quando o aparelho tem internet, mas o pedido não chegou ao servidor. */
export const TEXTO_SEM_RESPOSTA = "Não deu para falar com o servidor: a internet pode estar fraca. Tente de novo em instantes.";
/** A mensagem do erro é de rede (o pedido nem saiu ou não voltou). */
export const ehFalhaDeRede = (m: string) => /Failed to fetch|NetworkError|Load failed|network ?error|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|fetch failed|ERR_CONNECTION/i.test(m);
/** A frase certa para um erro de rede: sem internet (o aparelho sabe) ou sem resposta do servidor. */
export const textoDeRede = (online: boolean) => (online ? TEXTO_SEM_RESPOSTA : TEXTO_SEM_INTERNET);
