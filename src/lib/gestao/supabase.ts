import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./banco";

import { SUPABASE_CHAVE, SUPABASE_URL } from "./supabase-config";

// endereço, chave pública e a logo do pet shop moram em supabase-config.ts (sem a biblioteca do Supabase, para as páginas públicas)
export { SUPABASE_CHAVE, SUPABASE_URL, configurado, logoDaLoja } from "./supabase-config";

export type Banco = SupabaseClient<Database>;

let cliente: Banco | null = null;

/** Prazo de um pedido ao banco até a resposta começar a chegar. O banco corta uma consulta em 8 s: 30 s sem resposta é pedido preso. */
export const PRAZO_DO_PEDIDO_MS = 30_000;

/**
 * O pedido grava? Gravação direta na tabela (POST, PATCH, PUT, DELETE) e função cujo nome diz que grava (`…_salvar`,
 * `quadro_mover`, `receber_conta`…). Serve para a memória curta das telas: depois de uma gravação, o que está guardado é
 * buscado de novo. As rotinas de fundo (`marcar_uso`, `contas_fixas_gerar`, registros e contadores) não contam.
 */
export function pedidoGrava(url: string, metodo: string): boolean {
  const m = /\/rest\/v1\/(rpc\/)?([A-Za-z0-9_]+)/.exec(url);
  if (!m) return false;
  if (!m[1]) return !/^(GET|HEAD|OPTIONS)$/i.test(metodo);
  const nome = m[2];
  if (/^(marcar_uso|contas_fixas_gerar|creche_gerar_cobrancas|alteracoes_marcar_vistas|boletim_faxina|entrada_faxina|diario_faxina|escola_evento|caderno_reservar|caderno_devolver)$/.test(nome)) return false;
  if (/^(link_|admin_|gestao_|assistente_|servidor_|lgpd_|registrar_|erro_|mozart_)/.test(nome) || /_(contar|registrar|contar_v2)$/.test(nome)) return false;
  return /(^|_)(salvar|criar|mover|marcar|definir|aceitar|devolver|pagar|receber|apagar|desfazer|cancelar|anotar|decidir|editar|juntar|anonimizar|importar|entrada|iniciar|ajustar|usar|liberar|trocar|desligar|pedir|baixar|continuar|faltou|fechar|reservar|aplicar|corrigir|acertar|cobrada|retirar|autorizar|guardar|gerar|sair|tirar|vender|quitar)(_|$)/.test(nome);
}

const aoGravar = new Set<() => void>();
/** Chama `f` depois de cada gravação que deu certo (a memória curta das telas usa). Devolve como parar. */
export function ouvirGravacoes(f: () => void) { aoGravar.add(f); return () => { aoGravar.delete(f); }; }

/**
 * `fetch` do cliente do navegador: pedido ao banco ou ao login que não começa a responder em 30 s é cortado e vira erro
 * ("Demorou demais, tente de novo"), em vez de deixar a tela esperando para sempre. Envio de arquivo não tem prazo.
 */
export function buscarComPrazo(prazo = PRAZO_DO_PEDIDO_MS, buscar: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (entrada, opcoes) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const metodo = (opcoes?.method ?? (typeof entrada === "object" && "method" in entrada ? entrada.method : "GET")).toUpperCase();
    if (!/\/(rest|auth)\/v1\//.test(url)) return buscar(entrada, opcoes);
    const corte = new AbortController();
    const deFora = opcoes?.signal;
    if (deFora) { if (deFora.aborted) corte.abort(); else deFora.addEventListener("abort", () => corte.abort(), { once: true }); }
    let estourou = false;
    const t = setTimeout(() => { estourou = true; corte.abort(); }, prazo);
    return buscar(entrada, { ...opcoes, signal: corte.signal }).then((r) => {
      clearTimeout(t);
      if (r.ok && pedidoGrava(url, metodo)) for (const f of aoGravar) { try { f(); } catch { /* quem ouve não derruba o pedido */ } }
      return r;
    }, (e) => {
      clearTimeout(t);
      if (estourou) throw new Error("tempo esgotado: o servidor não respondeu a tempo");
      throw e;
    });
  };
}

/** Cliente do navegador: guarda a sessão e renova o login sozinho. */
export function banco(): Banco {
  if (!cliente) {
    cliente = createClient<Database>(SUPABASE_URL || "http://localhost", SUPABASE_CHAVE || "sem-chave", {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "maestro-gestao" },
      global: { fetch: buscarComPrazo() },
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
