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
import { confeitaria } from "./confeitaria";
import { passeador } from "./passeador";
import { petsitter } from "./petsitter";
import { fotografia } from "./fotografia";
import { aniversario } from "./aniversario";
import { natal } from "./natal";
import { placas } from "./placas";
import { diplomas } from "./diplomas";
import { painel } from "./painel";
import { baralho } from "./baralho";
import { comandos } from "./comandos";
import { chegou } from "./chegou";
import { colorir } from "./colorir";
import { planner } from "./planner";
import { moldes } from "./moldes";
import { moldesNatal } from "./moldes-natal";

/** Páginas de vendas publicadas, por slug. Para lançar um guia, adicione o arquivo e registre aqui. */
export const PAGINAS: Record<string, PaginaVendas> = { xixi, filhote, petiscos, tedio, sozinho, gato, normal, saude, rg, album, calendario, papelaria, influenciador,
  aniversario, natal, placas, diplomas, painel, baralho, comandos, chegou, colorir, planner,
  confeitaria, passeador, petsitter, fotografia, moldes, "moldes-natal": moldesNatal };
