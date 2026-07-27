import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

/**
 * Publicação instantânea: quando a Redação salva/publica uma matéria,
 * esta rota derruba o cache do site inteiro para o conteúdo novo aparecer
 * na hora. Só aceita chamadas de um usuário logado que seja admin (o banco
 * confere via is_admin()).
 */
export async function POST(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ ok: false }, { status: 401 });

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: isAdmin } = await sb.rpc("is_admin");
  if (!isAdmin) return Response.json({ ok: false }, { status: 403 });

  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
