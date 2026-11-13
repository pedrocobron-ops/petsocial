"use client";

import { lerEquipe } from "@/lib/gestao/reservado";
import { temCheckout } from "@/lib/gestao/planos";
import { Selo } from "./marca";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { banco, configurado, type Banco } from "@/lib/gestao/supabase";
import type { Petshop, Profissional, Servico } from "@/lib/gestao/tipos";
import { podeArea, type Area } from "@/lib/gestao/acessos";

export type Gestao = {
  sb: Banco;
  user: User;
  petshop: Petshop;
  /** Quem está logado, dentro da equipe deste pet shop. */
  eu: Profissional;
  equipe: Profissional[];
  servicos: Servico[];
  souDono: boolean;
  vejoFinanceiro: boolean;
  /** A pessoa abre esta área do aplicativo? (o dono libera área por área em Equipe) */
  posso: (area: Area) => boolean;
  /** false = teste vencido ou assinatura cancelada: a conta fica só para consulta. */
  liberado: boolean;
  /** Dias que faltam de teste (null quando não está em teste). */
  diasDeTeste: number | null;
  /** Recarrega pet shop, equipe e serviços depois de uma alteração. */
  recarregarBase: () => Promise<void>;
  sair: () => Promise<void>;
};

const Ctx = createContext<Gestao | null>(null);

export function useGestao(): Gestao {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGestao fora do GestaoProvider");
  return v;
}

const CHAVE_LOJA = "maestro-gestao-petshop";

export function GestaoProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sb = banco();
  const [user, setUser] = useState<User | null>(null);
  const [eu, setEu] = useState<Profissional | null>(null);
  const [petshop, setPetshop] = useState<Petshop | null>(null);
  const [equipe, setEquipe] = useState<Profissional[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregarBase = useCallback(async (petshopId: string) => {
    const [p, e, s] = await Promise.all([
      sb.from("petshops").select("*").eq("id", petshopId).single(),
      lerEquipe(sb, petshopId),
      sb.from("servicos").select("*").eq("petshop_id", petshopId).order("ordem").order("nome"),
    ]);
    if (p.error) throw p.error;
    setPetshop(p.data);
    setEquipe(e.data ?? []);
    setServicos(s.data ?? []);
    return e.data ?? [];
  }, [sb]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (!configurado) { setErro("O banco de dados ainda não foi configurado neste endereço."); return; }
      const { data } = await sb.auth.getSession();
      if (!vivo) return;
      if (!data.session) { router.replace("/gestao/entrar"); return; }
      const u = data.session.user;
      const { data: vinculos, error } = await sb.rpc("entrar");
      if (!vivo) return;
      if (error) { setErro("Não consegui carregar a sua conta. Tente de novo em instantes."); return; }
      if (!vinculos?.length) { router.replace("/gestao/comecar"); return; }
      const preferido = typeof localStorage !== "undefined" ? localStorage.getItem(CHAVE_LOJA) : null;
      const meu = vinculos.find((v) => v.petshop_id === preferido) ?? vinculos[0];
      try {
        const todos = await carregarBase(meu.petshop_id);
        if (!vivo) return;
        setEu(todos.find((x) => x.id === meu.id) ?? meu);
        setUser(u);
      } catch {
        setErro("Não consegui carregar o pet shop. Tente de novo em instantes.");
      }
    })();
    const { data: sub } = sb.auth.onAuthStateChange((evento) => {
      if (evento === "SIGNED_OUT") router.replace("/gestao/entrar");
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [sb, router, carregarBase]);

  const valor = useMemo<Gestao | null>(() => {
    if (!user || !eu || !petshop) return null;
    const emTeste = petshop.status === "teste";
    const resta = new Date(petshop.teste_ate).getTime() - Date.now();
    // quem cancelou continua usando até o fim do período que já pagou
    const pagoAinda = petshop.status === "cancelada" && petshop.pago_ate != null && new Date(petshop.pago_ate).getTime() > Date.now();
    // enquanto a assinatura não abriu (sem link de pagamento), o teste não bloqueia ninguém: a pessoa não teria como pagar
    const liberado = ["ativa", "atrasada", "cortesia"].includes(petshop.status) || (emTeste && (resta > 0 || !temCheckout())) || pagoAinda;
    return {
      sb, user, petshop, eu, equipe, servicos,
      souDono: eu.papel === "dono",
      vejoFinanceiro: eu.papel === "dono" || eu.papel === "gerente" || eu.ve_financeiro,
      posso: (area: Area) => podeArea(eu, area),
      liberado,
      diasDeTeste: emTeste ? Math.max(0, Math.ceil(resta / 864e5)) : null,
      recarregarBase: async () => {
        const todos = await carregarBase(petshop.id);
        const novo = todos.find((x) => x.id === eu.id);
        if (novo) setEu(novo);
      },
      sair: async () => { await sb.auth.signOut(); router.replace("/gestao/entrar"); },
    };
  }, [sb, user, eu, petshop, equipe, servicos, carregarBase, router]);

  if (erro) {
    return (
      <div className="g g-raiz"><div className="g-vazio" style={{ minHeight: "100dvh", alignContent: "center" }}>
        <Selo tamanho={72} tom="suave" />
        <b>Opa, algo não carregou</b>
        <p>{erro}</p>
        <button className="g-btn verde" onClick={() => location.reload()}>Tentar de novo</button>
      </div></div>
    );
  }
  if (!valor) {
    return (
      <div className="g g-raiz"><div className="g-vazio" style={{ minHeight: "100dvh", alignContent: "center" }}>
        <Selo tamanho={72} tom="suave" />
        <p>Abrindo o seu pet shop…</p>
      </div></div>
    );
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
