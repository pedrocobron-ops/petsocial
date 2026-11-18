import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./banco";

import { SUPABASE_CHAVE, SUPABASE_URL } from "./supabase-config";

// endereço, chave pública e foto do pet moram em supabase-config.ts (sem a biblioteca do Supabase, para as páginas públicas)
export { SUPABASE_CHAVE, SUPABASE_URL, configurado, fotoPet } from "./supabase-config";

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
