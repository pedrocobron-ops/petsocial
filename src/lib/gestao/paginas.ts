/**
 * Leitura de listas grandes. O banco entrega no máximo 1000 linhas por consulta (um `.limit(5000)` não muda isso):
 * toda lista que pode passar de mil linhas precisa ser lida em páginas.
 */

/** Segundo argumento do `select` na primeira página: pede a contagem total junto. */
export const contando = (contar: boolean) => (contar ? { count: "exact" as const } : undefined);

/** Uma página de consulta do Supabase. */
type Pagina = PromiseLike<{ data: unknown[] | null; error: { message: string } | null; count?: number | null }>;
const TAM = 1000;

/**
 * Lê todas as linhas de uma consulta. O banco entrega no máximo 1000 por vez: a primeira página pede também
 * a contagem (`contar`: passe `contando(contar)` no `select`), e as outras são buscadas juntas, seis de cada vez, em vez de uma depois da outra.
 * A consulta precisa ter ordem fixa (termine com `.order("id")`).
 */
export async function lerTudo<T>(pagina: (de: number, ate: number, contar: boolean) => Pagina, maxLinhas = 100_000): Promise<T[]> {
  const primeira = await pagina(0, TAM - 1, true);
  if (primeira.error) throw new Error(primeira.error.message);
  const tudo = [...((primeira.data ?? []) as T[])];
  if (tudo.length < TAM) return tudo;
  if (typeof primeira.count !== "number") {
    // sem contagem: uma página depois da outra
    for (let de = TAM; de < maxLinhas; de += TAM) {
      const r = await pagina(de, de + TAM - 1, false);
      if (r.error) throw new Error(r.error.message);
      tudo.push(...((r.data ?? []) as T[]));
      if ((r.data?.length ?? 0) < TAM) break;
    }
    return tudo;
  }
  const inicios: number[] = [];
  for (let de = TAM; de < Math.min(primeira.count, maxLinhas); de += TAM) inicios.push(de);
  for (let i = 0; i < inicios.length; i += 6) {
    const lote = await Promise.all(inicios.slice(i, i + 6).map((de) => pagina(de, de + TAM - 1, false)));
    for (const r of lote) {
      if (r.error) throw new Error(r.error.message);
      tudo.push(...((r.data ?? []) as T[]));
    }
  }
  return tudo;
}
