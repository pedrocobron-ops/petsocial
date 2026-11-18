/** Endereço e chave pública do Supabase (variáveis na Vercel). A chave pública só funciona junto com as regras do banco (RLS). */
// Os dois valores vêm das variáveis do build. Sem elas, só o build de PRODUÇÃO da Vercel usa o projeto de produção (a decisão
// fica em `banco-do-build.ts`, aplicada pelo `next.config.ts`); qualquer outro build fica sem banco e o aplicativo diz isso
// na abertura, em vez de falar com o banco de produção sem ninguém perceber.
// Fica separado de supabase.ts (que carrega a biblioteca do Supabase) para quem só precisa do endereço não baixar a biblioteca.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const configurado = Boolean(SUPABASE_URL && SUPABASE_CHAVE);

/** Endereço público da foto de um pet (o nome do arquivo é aleatório). */
export function fotoPet(caminho: string | null | undefined): string | null {
  return caminho ? `${SUPABASE_URL}/storage/v1/object/public/pets/${caminho}` : null;
}
