import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";
import { avisarIndexNow } from "@/lib/indexnow";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

/**
 * Publicação instantânea: quando a Redação salva/publica uma matéria,
 * esta rota derruba o cache do site inteiro para o conteúdo novo aparecer
 * na hora. Só aceita chamadas de um usuário logado que seja admin (o banco
 * confere via is_admin()).
 *
 * Quando a chamada informa o slug de uma matéria que foi ao ar, o aviso do
 * IndexNow sai junto, para os buscadores não dependerem da próxima passagem
 * do robô.
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

  // O corpo é opcional: chamadas sem slug (troca de foto do perfil, por
  // exemplo) só limpam o cache.
  const { slug } = await req.json().catch(() => ({ slug: undefined }));
  if (typeof slug === "string" && slug) {
    await avisarIndexNow([SITE_URL, `${SITE_URL}/noticias/${slug}`]);
  }

  return Response.json({ ok: true });
}
