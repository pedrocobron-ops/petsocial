/** Primeiros passos (tela Hoje e fim do guia): a mesma contagem no guia e na tela Hoje: "Faltam 2 coisas para começar". */
export const textoFaltam = (n: number) => (n <= 0 ? "Tudo pronto para começar" : n === 1 ? "Falta 1 coisa para começar" : `Faltam ${n} coisas para começar`);
