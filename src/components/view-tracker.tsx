"use client";

import { useEffect } from "react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/supabase";

/** Registra +1 visualização da matéria (dispara do navegador do leitor). */
export default function ViewTracker({ articleId }: { articleId: string }) {
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/news_increment_view`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_id: articleId }),
    }).catch(() => {});
  }, [articleId]);
  return null;
}
