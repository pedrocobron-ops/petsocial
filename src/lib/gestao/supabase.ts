import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./banco";

/** Endereço e chave pública do Supabase (variáveis na Vercel). A chave pública só funciona junto com as regras do banco (RLS). */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_CHAVE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const configurado = Boolean(SUPABASE_URL && SUPABASE_CHAVE);

export type Banco = SupabaseClient<Database>;

let cliente: Banco | null = null;

/** Cliente do navegador: guarda a sessão e renova o login sozinho. */
export function banco(): Banco {
  if (!cliente) {
    cliente = createClient<Database>(SUPABASE_URL || "http://localhost", SUPABASE_CHAVE || "sem-chave", {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "maestro-gestao" },
    });
  }
  return cliente;
}

/** Cliente do servidor que age em nome de quem está logado: as regras do banco valem igual. */
export function bancoDoUsuario(token: string): Banco {
  return createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** Endereço público da foto de um pet (o nome do arquivo é aleatório). */
export function fotoPet(caminho: string | null | undefined): string | null {
  return caminho ? `${SUPABASE_URL}/storage/v1/object/public/pets/${caminho}` : null;
}
