/**
 * Perguntas que valem para todos os produtos (brief 20, 6.18), cada uma com até 3 linhas no celular (≈ 180 caracteres).
 * Usadas no FAQ das páginas de venda e das vitrines.
 * `fora`: perguntas do arquivo do produto que esta resposta substitui (a do arquivo sai, para não repetir).
 * `pula`: se o arquivo já tem uma pergunta assim, a fixa não entra (a do produto é mais específica).
 */
export type Fixa = { q: [string, string]; peso: number; fora?: RegExp; pula?: RegExp };
export const FIXAS: Fixa[] = [
  { peso: 1, q: ["Pix ou cartão? Parcela?", "Pix ou cartão de crédito, no checkout da Cakto. Se escolher parcelar, o checkout mostra as parcelas e os juros antes de você confirmar."], pula: /pix|parcel|formas? de pagamento/i },
  { peso: 2, q: ["Como peço o reembolso e em quanto tempo volta?", "Em até 7 dias, em reembolso.cakto.com.br ou pelo nosso e-mail. A Cakto processa em até 24 h; no Pix costuma voltar em minutos, no cartão segue o prazo do banco."], fora: /reembolso|não gostar|não for para mim|devolu/i },
  { peso: 3, q: ["Precisa de cadastro ou aplicativo?", "Não precisa de aplicativo. O acesso chega no e-mail da compra, e o PDF abre no celular ou no computador."], pula: /aplicativo|cadastro/i },
  { peso: 6, q: ["Preciso imprimir?", "Não. Dá para usar tudo no celular ou no computador. As páginas para imprimir são opcionais e saem em A4, numa impressora comum."], pula: /imprimir|impress/i },
  { peso: 7, q: ["Recebo nota fiscal?", "O comprovante da compra chega no e-mail da Cakto. Para pedir nota fiscal, escreva para contato@maestropet.com com o e-mail usado na compra."], pula: /nota fiscal/i },
  { peso: 8, q: ["Por que não tem depoimentos?", "Porque não inventamos. Preferimos mostrar as páginas de verdade, que você vê nesta página antes de decidir."], pula: /depoimento/i },
  { peso: 9, q: ["O pagamento é seguro?", "Sim. Você paga no checkout da Cakto, com Pix ou cartão. Nós não vemos os dados do seu cartão, e o valor final aparece antes de você confirmar."], pula: /seguro\?/i },
];


/** Uma pergunta fixa pelo começo do texto, ex. `fixa("Pix ou cartão")`. */
export const fixa = (inicio: string) => FIXAS.find((f) => f.q[0].startsWith(inicio))!.q;
