import type { PaginaVendas } from "./tipos";
import { album } from "./album";
import { calendario } from "./calendario";
import { filhote } from "./filhote";
import { gato } from "./gato";
import { influenciador } from "./influenciador";
import { normal } from "./normal";
import { papelaria } from "./papelaria";
import { petiscos } from "./petiscos";
import { rg } from "./rg";
import { saude } from "./saude";
import { sozinho } from "./sozinho";
import { tedio } from "./tedio";
import { xixi } from "./xixi";

/** Páginas de vendas publicadas, por slug. Para lançar um guia, adicione o arquivo e registre aqui. */
export const PAGINAS: Record<string, PaginaVendas> = { xixi, filhote, petiscos, tedio, sozinho, gato, normal, saude, rg, album, calendario, papelaria, influenciador };
