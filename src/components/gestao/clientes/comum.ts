import type { Cliente, Pet } from "@/lib/gestao/tipos";
import { PORTES } from "@/lib/gestao/tipos";
import { fmtTelefone, chamar } from "@/lib/gestao/util";

export const BASE = "/gestao/app/clientes";
export const linkPet = (id: string) => `${BASE}?pet=${id}`;
export const linkTutor = (id: string) => `${BASE}?cliente=${id}`;

export type PetDaLista = Pet & { clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null };

export const ESPECIES: Record<string, string> = { cao: "Cachorro", gato: "Gato", outro: "Outro" };
export const nomePorte = (p: string | null | undefined) => PORTES.find((x) => x.id === p)?.rotulo ?? "";
export const primeiroNome = (nome: string) => chamar(nome);

type Resposta<T> = { data: T[] | null; error: { message: string } | null };

/**
 * O banco devolve no máximo 1000 linhas por consulta. Aqui buscamos página a página até acabar
 * (ou até `parar` dizer que já chega). Sem `parar`, depois da primeira página cheia as seguintes vão de quatro em quatro
 * ao mesmo tempo (no celular com internet fraca, uma página esperando a outra somava uma ida e volta por mil linhas);
 * a ordem e o resultado são os mesmos.
 */
export async function buscarTudo<T>(pagina: (de: number, ate: number) => PromiseLike<Resposta<T>>, parar?: (linhas: T[]) => boolean, maxPaginas = 30): Promise<T[]> {
  const TAM = 1000, JUNTAS = 4;
  const tudo: T[] = [];
  const ler = async (i: number) => {
    const r = await pagina(i * TAM, i * TAM + TAM - 1);
    if (r.error) throw new Error(r.error.message);
    return r.data ?? [];
  };
  if (parar) {
    for (let i = 0; i < maxPaginas; i++) {
      const linhas = await ler(i);
      tudo.push(...linhas);
      if (parar(linhas) || linhas.length < TAM) break;
    }
    return tudo;
  }
  const primeira = await ler(0);
  tudo.push(...primeira);
  if (primeira.length < TAM) return tudo;
  for (let i = 1; i < maxPaginas; i += JUNTAS) {
    const lote = await Promise.all(Array.from({ length: Math.min(JUNTAS, maxPaginas - i) }, (_, k) => ler(i + k)));
    for (const linhas of lote) {
      tudo.push(...linhas);
      if (linhas.length < TAM) return tudo;
    }
  }
  return tudo;
}

/** Uma célula de CSV: aspas quando precisa e nada de fórmula escondida para a planilha executar. */
function celula(v: string | null | undefined) {
  let s = (v ?? "").replace(/\r?\n/g, " ").trim();
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[;"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Baixa a lista de tutores e pets em CSV (abre direto no Excel e no Google Planilhas). */
export function baixarCsv(clientes: Cliente[], pets: Pet[], nomeDoArquivo: string) {
  const porTutor = new Map<string, Pet[]>();
  for (const p of pets) porTutor.set(p.cliente_id, [...(porTutor.get(p.cliente_id) ?? []), p]);
  const linhas = [["Tutor", "Telefone", "E-mail", "Pet", "Espécie", "Raça", "Porte"]];
  for (const c of clientes) {
    const base = [c.nome, fmtTelefone(c.telefone), c.email ?? ""];
    const dele = porTutor.get(c.id) ?? [];
    if (!dele.length) linhas.push([...base, "", "", "", ""]);
    for (const p of dele) linhas.push([...base, p.nome, ESPECIES[p.especie] ?? p.especie, p.raca ?? "", nomePorte(p.porte)]);
  }
  const texto = "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeDoArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
