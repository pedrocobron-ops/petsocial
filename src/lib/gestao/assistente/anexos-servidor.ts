import type Anthropic from "@anthropic-ai/sdk";
import { MAX_BYTES_IMAGEM, MAX_BYTES_PDF } from "../caderno";
import { paginasDoPdf, tipoDoArquivo, type TipoArquivo } from "../caderno-ia";
import {
  MAX_IMAGENS_MOZART, MAX_PAGINAS_PDF_MOZART, TEXTO_FOTO_GRANDE, TEXTO_MISTURA, TEXTO_MUITOS, TEXTO_PDF_GRANDE, TEXTO_PLANILHA, TEXTO_TIPO,
  ehPlanilha, marcaDoAnexo, textoDePaginas,
} from "./anexos";
import type { Msg } from "./conversa";

/**
 * Só do servidor: confere os arquivos que vieram com o pedido ao Mozart (antes de gastar qualquer cota) e monta os blocos
 * que vão ao modelo. Reaproveita a conferência da Foto do caderno: o tipo pelos primeiros bytes (`tipoDoArquivo`), as páginas
 * do PDF (`paginasDoPdf`, com o número contado no aparelho; vale o maior) e os tamanhos de `caderno.ts`.
 * Os arquivos ficam só na memória deste pedido: não são gravados nem vão para o registro.
 */
export type Anexos = {
  /** Os blocos de imagem ou documento, na ordem em que vieram (vão antes do texto da pessoa). */
  blocos: Anthropic.Beta.BetaContentBlockParam[];
  imagens: number;
  /** Páginas do PDF (0 quando são imagens). */
  paginasDoPdf: number;
  /** Quanto gasta do saldo do dia: uma por imagem ou por página de PDF. */
  paginas: number;
  /** O que fica no histórico no lugar dos arquivos. */
  marca: string;
};
export type ErroDeAnexo = { status: number; codigo: string; mensagem: string };

type Entrada = { nome: string; tipo: string; bytes: Uint8Array };

/** Lê os arquivos do formulário (campo `arquivo`). Tamanho acima do teto nem é lido. */
export async function arquivosDoFormulario(form: FormData): Promise<Entrada[] | ErroDeAnexo> {
  const brutos = form.getAll("arquivo").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  const entradas: Entrada[] = [];
  for (const f of brutos.slice(0, MAX_IMAGENS_MOZART + 2)) {
    if (ehPlanilha(f.name, f.type)) return { status: 415, codigo: "planilha", mensagem: TEXTO_PLANILHA };
    if (f.size > MAX_BYTES_PDF) return { status: 413, codigo: "grande", mensagem: TEXTO_PDF_GRANDE };
    entradas.push({ nome: f.name, tipo: f.type, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  if (brutos.length > MAX_IMAGENS_MOZART) return { status: 400, codigo: "muitos", mensagem: TEXTO_MUITOS };
  return entradas;
}

/** Confere tipo, tamanho, quantidade e páginas. `paginasDoAparelho`: as páginas do PDF contadas na tela. */
export function conferirAnexos(entradas: Entrada[], paginasDoAparelho = 0): Anexos | ErroDeAnexo {
  const tipos: { t: TipoArquivo; e: Entrada }[] = [];
  for (const e of entradas) {
    if (ehPlanilha(e.nome, e.tipo)) return { status: 415, codigo: "planilha", mensagem: TEXTO_PLANILHA };
    const t = tipoDoArquivo(e.bytes);
    if (!t) return { status: 415, codigo: "tipo", mensagem: TEXTO_TIPO };
    tipos.push({ t, e });
  }
  const pdfs = tipos.filter((x) => x.t === "application/pdf"), imagens = tipos.length - pdfs.length;
  if (pdfs.length && imagens) return { status: 400, codigo: "muitos", mensagem: TEXTO_MISTURA };
  if (pdfs.length > 1 || imagens > MAX_IMAGENS_MOZART) return { status: 400, codigo: "muitos", mensagem: TEXTO_MUITOS };
  if (pdfs.length) {
    const { e } = pdfs[0];
    if (e.bytes.length > MAX_BYTES_PDF) return { status: 413, codigo: "grande", mensagem: TEXTO_PDF_GRANDE };
    const paginas = Math.max(paginasDoPdf(e.bytes), Math.max(0, Math.min(1000, Math.floor(Number(paginasDoAparelho) || 0))), 1);
    if (paginas > MAX_PAGINAS_PDF_MOZART) return { status: 413, codigo: "paginas", mensagem: textoDePaginas(paginas) };
    return {
      blocos: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(e.bytes).toString("base64") } }],
      imagens: 0, paginasDoPdf: paginas, paginas, marca: marcaDoAnexo(0, paginas),
    };
  }
  for (const { e } of tipos) if (e.bytes.length > MAX_BYTES_IMAGEM) return { status: 413, codigo: "grande", mensagem: TEXTO_FOTO_GRANDE };
  return {
    blocos: tipos.map(({ t, e }) => ({ type: "image" as const, source: { type: "base64" as const, media_type: t as Exclude<TipoArquivo, "application/pdf">, data: Buffer.from(e.bytes).toString("base64") } })),
    imagens, paginasDoPdf: 0, paginas: imagens, marca: marcaDoAnexo(imagens, 0),
  };
}

/** A mensagem tem um arquivo (imagem ou documento)? */
export const temArquivo = (m: Msg | undefined) => Boolean(m && Array.isArray(m.content) && m.content.some((b) => b.type === "image" || b.type === "document"));

/**
 * Tira os arquivos da conversa antes de ela voltar para o navegador: no lugar de cada mensagem com imagem ou PDF fica a
 * marca ("[foto enviada]") e o resto do texto. Como a conversa mudou, sai também o raciocínio guardado das respostas (o
 * modelo recusa raciocínio de uma conversa que mudou; é o que a rota já faz quando corta o histórico).
 * Muda as mensagens no lugar (a mesma lista que a rota devolve).
 */
export function tirarArquivos(mensagens: Msg[], marca: string): void {
  let tirou = false;
  for (const m of mensagens) {
    if (!Array.isArray(m.content)) continue;
    if (m.role === "user" && temArquivo(m)) {
      const resto = m.content.filter((b) => b.type !== "image" && b.type !== "document");
      (m as { content: unknown }).content = [{ type: "text", text: marca }, ...resto];
      tirou = true;
    } else if (tirou && m.role === "assistant") {
      const sem = m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking");
      if (sem.length && sem.length !== m.content.length) (m as { content: unknown }).content = sem;
    }
  }
}
