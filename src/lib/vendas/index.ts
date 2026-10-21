import type { PaginaVendas } from "./tipos";
import { filhote } from "./filhote";
import { xixi } from "./xixi";

/** Páginas de vendas publicadas, por slug. Para lançar um guia, adicione o arquivo e registre aqui. */
export const PAGINAS: Record<string, PaginaVendas> = { xixi, filhote };
