import type { Banco } from "./supabase";
import { ZipEmPartes } from "./zip";

/**
 * Só do servidor: a cópia completa do banco para o administrador (rota /api/gestao/admin/copia), com a chave de serviço.
 *
 * Cada tabela do schema public vira um arquivo JSON (uma lista de linhas), lida de mil em mil pela ordem da chave primária.
 * Ficam de fora: o schema auth inteiro (logins e senhas), os arquivos do Storage, as colunas com códigos de acesso de páginas
 * públicas e assinaturas de link (o banco diz quais em `gestao_copia_tabelas`) e, dentro de qualquer JSON, as chaves com nome
 * de segredo (segredo, senha, token, hash…). Da `config_interna` saem só as linhas que não são segredo.
 * No fim vão o `manifesto.json` (data, quem pediu, linhas por tabela, o que ficou de fora) e um LEIA-ME.
 */
const PAGINA = 1000;
/** Nome de chave ou de linha da configuração que nunca sai na cópia. */
export const NOME_DE_SEGREDO = /(segredo|secret|senha|password|sha256|hash|token)/i;

type Tabela = { tabela: string; colunas: string[]; fora: string[]; ordem: string[] };
export type Manifesto = {
  feito_em: string; feito_por: string | null; tabelas: { tabela: string; arquivo: string; linhas: number; colunas_fora: string[] }[];
  total_de_linhas: number; fora_da_copia: string[];
};

/** Tira de um valor (e de tudo dentro dele) as chaves com nome de segredo. */
export function semSegredos(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(semSegredos);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!NOME_DE_SEGREDO.test(k)) o[k] = semSegredos(x);
    return o;
  }
  return v;
}

/** Monta a cópia, mandando os pedaços do zip por `enviar` à medida que lê. */
export async function copiaCompleta(sb: Banco, enviar: (b: Uint8Array) => void, quem: { id: string; email: string | null }): Promise<Manifesto> {
  const agora = new Date();
  const lista = await sb.rpc("gestao_copia_tabelas");
  if (lista.error) throw new Error(lista.error.message);
  const tabelas = (lista.data ?? []) as unknown as Tabela[];
  const z = new ZipEmPartes(enviar, agora);
  const manifesto: Manifesto = {
    feito_em: agora.toISOString(), feito_por: quem.email, tabelas: [], total_de_linhas: 0,
    fora_da_copia: [
      "Logins, senhas e sessões (schema auth do Supabase).",
      "Arquivos do Storage (fotos dos pets, do boletim e do diário, logos, PDFs).",
      "Códigos de acesso das páginas públicas e assinaturas de link (colunas_fora de cada tabela).",
      "Chaves com nome de segredo dentro de campos JSON e as linhas de segredo da config_interna.",
    ],
  };
  const de = sb as unknown as { from: (t: string) => { select: (c: string) => { order: (c: string) => unknown } } };
  for (const t of tabelas) {
    const arquivo = `tabelas/${t.tabela}.json`;
    z.comecar(arquivo);
    z.escrever("[");
    let linhas = 0;
    const ordem = t.ordem.length ? t.ordem : t.colunas;
    for (let inicio = 0; ; inicio += PAGINA) {
      let q = de.from(t.tabela).select(t.colunas.join(",")) as unknown as { order: (c: string) => typeof q; range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
      for (const c of ordem) q = q.order(c);
      const r = await q.range(inicio, inicio + PAGINA - 1);
      if (r.error) throw new Error(`${t.tabela}: ${r.error.message}`);
      let dados = (r.data ?? []) as Record<string, unknown>[];
      const lidas = dados.length;
      if (t.tabela === "config_interna") dados = dados.filter((l) => !NOME_DE_SEGREDO.test(String(l.chave ?? "")));
      if (dados.length) z.escrever((linhas ? "," : "") + "\n" + dados.map((l) => JSON.stringify(semSegredos(l))).join(",\n"));
      linhas += dados.length;
      if (lidas < PAGINA) break;
    }
    z.escrever(linhas ? "\n]\n" : "]\n");
    z.terminar();
    manifesto.tabelas.push({ tabela: t.tabela, arquivo, linhas, colunas_fora: t.fora });
    manifesto.total_de_linhas += linhas;
  }
  z.arquivo("manifesto.json", JSON.stringify(manifesto, null, 2) + "\n");
  z.arquivo("LEIA-ME.txt", [
    "Cópia completa do banco do Maestro Pet Gestão",
    `Feita em ${agora.toISOString()} por ${quem.email ?? "administrador"}.`,
    "",
    "tabelas/<nome>.json: todas as linhas de cada tabela do schema public, uma lista em JSON (UTF-8).",
    "manifesto.json: a data, quantas linhas tem cada tabela e o que ficou de fora.",
    "",
    "Fora da cópia: logins e senhas, arquivos do Storage, códigos de acesso das páginas públicas e segredos.",
    "Aqui tem dados pessoais de clientes de todos os pet shops: guarde criptografado, em lugar seguro, e apague as cópias velhas.",
    "",
  ].join("\r\n"));
  z.fechar();
  const r = await sb.rpc("gestao_copia_registrar", { p_quem: quem.id, p_tabelas: manifesto.tabelas.length, p_linhas: manifesto.total_de_linhas });
  if (r.error) console.error("[copia] não anotei a cópia:", r.error.message);
  return manifesto;
}
