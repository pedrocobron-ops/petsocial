import type { PaginaVendas } from "./tipos";
import { filhote } from "./filhote";
import { gato } from "./gato";
import { normal } from "./normal";
import { petiscos } from "./petiscos";
import { sozinho } from "./sozinho";
import { tedio } from "./tedio";
import { xixi } from "./xixi";

/** Páginas de vendas publicadas, por slug. Para lançar um guia, adicione o arquivo e registre aqui. */
export const PAGINAS: Record<string, PaginaVendas> = { xixi, filhote, petiscos, tedio, sozinho, gato, normal };
