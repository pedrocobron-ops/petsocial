/** Endereço e chave pública do Supabase (variáveis na Vercel). A chave pública só funciona junto com as regras do banco (RLS). */
// Os dois valores vêm das variáveis do build. Sem elas, só o build de PRODUÇÃO da Vercel usa o projeto de produção (a decisão
// fica em `banco-do-build.ts`, aplicada pelo `next.config.ts`); qualquer outro build fica sem banco e o aplicativo diz isso
// na abertura, em vez de falar com o banco de produção sem ninguém perceber.
// Fica separado de supabase.ts (que carrega a biblioteca do Supabase) para quem só precisa do endereço não baixar a biblioteca.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const configurado = Boolean(SUPABASE_URL && SUPABASE_CHAVE);

/**
 * Endereço da logo do pet shop (no bucket `pets`, privado desde a migração 20261245): a rota /gestao/marca/<caminho> deste
 * site busca o arquivo (só logo de pet shop: regra pets_logo_ler). As fotos dos pets vão por fotos-pets.ts (equipe) e pela
 * página do tutor (/gestao/tutor/<código>/pet/<id>). `origem`: endereço completo, para a prévia do link no WhatsApp.
 */
export function logoDaLoja(caminho: string | null | undefined, origem = ""): string | null {
  if (!caminho || !/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}$/.test(caminho)) return null;
  return `${origem}/gestao/marca/${caminho}`;
}
