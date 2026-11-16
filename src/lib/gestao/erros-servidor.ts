/**
 * Erros das rotas do servidor (Mozart, Ajuda, link, Cakto, fotos do tutor, venda) para a mesma tabela dos erros do navegador
 * (`erro_registrar`, origem "servidor"). Só importar em código de servidor. Nunca lança e espera no máximo 2 s.
 * A rota vai como o modelo do Next (ex.: /gestao/tutor/[token]/foto/[id]), sem ids. O corpo do pedido nunca vai.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "./supabase";
import { ignorar, mensagemDe, montarErro } from "./erros";

const versao = () => (process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_GESTAO_VERSAO || "local").slice(0, 12);

export async function registrarErroServidor(rota: string, erro: unknown, extra?: { petshop?: string | null; codigo?: string | null }) {
  try {
    if (!configurado) return;
    if (ignorar(mensagemDe(erro), erro instanceof Error ? erro.name : "")) return;
    const p = montarErro({ erro, tipo: "servidor", origem: "servidor", rota, versao: versao(), petshop: extra?.petshop ?? null, aparelho: "servidor", codigo: extra?.codigo ?? null });
    const sb = createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
    await Promise.race([sb.rpc("erro_registrar", p as never).then(() => undefined, () => undefined), new Promise((r) => setTimeout(r, 2000))]);
  } catch { /* o registro nunca derruba a rota */ }
}

/** Erro de uma resposta do Supabase, com o código (sem o texto da consulta). */
export const erroDoBanco = (e: { message?: string; code?: string } | null | undefined, onde: string) =>
  Object.assign(new Error(`${onde}: ${e?.message ?? "falhou"}`), { name: "ErroDoBanco", code: e?.code ?? "" });

/** Envolve uma rota: erro que escapa vira registro + resposta 500 com frase simples. */
export function comRegistro<A extends unknown[]>(rota: string, rodar: (...a: A) => Promise<Response>): (...a: A) => Promise<Response> {
  return async (...a: A) => {
    try {
      return await rodar(...a);
    } catch (e) {
      console.error(`[${rota}] falha`, e instanceof Error ? e.name : typeof e);
      await registrarErroServidor(rota, e);
      return Response.json({ erro: "falha", mensagem: "Algo deu errado do nosso lado. Tente de novo em instantes." }, { status: 500 });
    }
  };
}
