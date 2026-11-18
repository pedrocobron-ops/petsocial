/**
 * Em que papel o comprovante impresso sai (rodada 9). Fica num arquivo leve, à parte de comprovante.ts, porque a casca do
 * aplicativo lê isto ao abrir e não precisa carregar as contas do dinheiro junto.
 */
import { opcao } from "./opcoes";

/** Papel em que o comprovante sai: folha comum (como sempre foi) ou bobina de impressora térmica de 80 ou 58 mm. */
export type PapelDoComprovante = "a4" | "80" | "58";
/** Opção do pet shop (Meu pet shop, Papel do comprovante). Ausente = folha comum. */
export const OPCAO_PAPEL_COMPROVANTE = "comprovante.papel";
export const PAPEIS_DO_COMPROVANTE: { id: PapelDoComprovante; nome: string; apoio: string }[] = [
  { id: "a4", nome: "Folha comum", apoio: "A4 ou salvar em PDF" },
  { id: "80", nome: "Bobina de 80 mm", apoio: "impressora térmica de balcão" },
  { id: "58", nome: "Bobina de 58 mm", apoio: "impressora térmica pequena" },
];
export function papelDoComprovante(petshop: { opcoes?: unknown }): PapelDoComprovante {
  const v: string = opcao<string>(petshop, OPCAO_PAPEL_COMPROVANTE, "a4");
  return v === "80" || v === "58" ? v : "a4";
}

/** Como o pet shop aberto imprime: o papel e a linha de contato (telefone e cidade) que vai embaixo do nome. O contexto preenche. */
let impressao: { papel: PapelDoComprovante; contato: string } = { papel: "a4", contato: "" };
export function definirImpressaoDoComprovante(p: { papel: PapelDoComprovante; contato?: string | null }) {
  impressao = { papel: p.papel, contato: (p.contato ?? "").trim() };
}
export const impressaoDoComprovante = () => impressao;

