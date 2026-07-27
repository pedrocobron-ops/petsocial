"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

/** Registra visitas de página (sem dados pessoais) para o painel de métricas. */
export default function PageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/redacao") || pathname.startsWith("/api")) return;
    try {
      let sid = sessionStorage.getItem("mp_sid");
      if (!sid) {
        sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem("mp_sid", sid);
      }
      supabaseBrowser()
        .from("jornal_pageviews")
        .insert({ path: pathname, session_id: sid })
        .then(() => {});
    } catch {}
  }, [pathname]);

  return null;
}
