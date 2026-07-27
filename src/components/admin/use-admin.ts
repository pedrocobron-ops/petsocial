"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface AdminState {
  carregando: boolean;
  session: Session | null;
  isAdmin: boolean;
}

/** Sessão da Redação: login + verificação de administrador (RLS no banco). */
export function useAdmin() {
  const [state, setState] = useState<AdminState>({
    carregando: true,
    session: null,
    isAdmin: false,
  });

  const verificar = useCallback(async (session: Session | null) => {
    if (!session) {
      setState({ carregando: false, session: null, isAdmin: false });
      return;
    }
    const { data } = await supabaseBrowser().rpc("is_admin");
    setState({ carregando: false, session, isAdmin: Boolean(data) });
  }, []);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => verificar(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      verificar(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [verificar]);

  return state;
}

/** Avisa o site que houve mudança — as páginas atualizam na hora. */
export async function revalidarSite() {
  try {
    const { data } = await supabaseBrowser().auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch("/api/revalidar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {}
}
