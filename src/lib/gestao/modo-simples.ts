import { opcao } from "./opcoes";
import { usaModulo } from "./modulos";

/**
 * Modo simples (Meu pet shop, Opções; oferecido na segunda pergunta do primeiro acesso): para quem está começando.
 * Esconde do menu e das telas o que é avançado. Nada é apagado nem desligado: o que sai do menu vai para "Outras áreas"
 * e continua abrindo; o que sai de uma tela (Alterações, Quadro, aviso do caixa) volta ao desligar o modo.
 * Chave ausente = desligado: pet shop de antes continua como sempre foi.
 */
export const CHAVE_MODO_SIMPLES = "geral.modo_simples";

type ComOpcoes = { opcoes?: unknown; modulos?: string[] | null };

export const modoSimples = (petshop: ComOpcoes) => opcao<boolean>(petshop, CHAVE_MODO_SIMPLES, false) === true;

/**
 * Telas que, no modo simples, saem do menu e vão para "Outras áreas". O Caixa fica para quem vende produtos
 * (é onde a venda no balcão acontece); sem loja, o recebimento do atendimento já entra no Financeiro.
 */
export function foraNoModoSimples(petshop: ComOpcoes, href: string): boolean {
  if (!modoSimples(petshop)) return false;
  if (href.startsWith("/gestao/app/relatorios") || href.startsWith("/gestao/app/escola")) return true;
  if (href.startsWith("/gestao/app/caixa")) return !usaModulo(petshop, "loja");
  return false;
}

/** O que muda, em palavras, para a tela de Meu pet shop e a pergunta do primeiro acesso. */
export const TEXTO_MODO_SIMPLES =
  "Menos botões e menus: Relatórios, Escola e Caixa (sem venda de produtos) vão para Outras áreas, e o horário mostra só o principal, com o resto em Mais opções. Nada é apagado.";
