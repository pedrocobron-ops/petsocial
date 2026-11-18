/** Endereço e chave pública do Supabase (variáveis na Vercel). A chave pública só funciona junto com as regras do banco (RLS). */
// Padrão: o projeto do Supabase em uso hoje. Os dois valores são públicos por natureza (vão para o navegador de qualquer forma);
// as variáveis da Vercel trocam o projeto sem mexer no código, quando o Gestão ganhar um banco só dele.
// Fica separado de supabase.ts (que carrega a biblioteca do Supabase) para quem só precisa do endereço não baixar a biblioteca.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://pifuiczrytmizqxzygbi.supabase.co";
export const SUPABASE_CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_0WFj3aYhEER7N0yrDQ6Q1Q_Lk1I4XwY";
export const configurado = Boolean(SUPABASE_URL && SUPABASE_CHAVE);

/** Endereço público da foto de um pet (o nome do arquivo é aleatório). */
export function fotoPet(caminho: string | null | undefined): string | null {
  return caminho ? `${SUPABASE_URL}/storage/v1/object/public/pets/${caminho}` : null;
}
