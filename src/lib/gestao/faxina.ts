import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_URL, type Banco } from "./supabase";

/**
 * Só do servidor: a faxina agendada (rota /api/gestao/faxina, chamada pela Vercel Cron uma vez por dia).
 *
 * O banco (gestao_faxina_arquivos, migração 20261195) faz a faxina dele (álbuns vencidos, freios antigos, reservas velhas do
 * caderno), põe na fila as fotos do boletim que ficaram sem boletim em todos os pet shops e devolve o que apagar: as fotos da
 * fila e os PDFs do caderno-tmp com mais de uma hora. Aqui os arquivos saem pela API do Storage (o banco não apaga arquivo).
 * LGPD (migração 20261199): apaga as contas com o prazo de "Encerrar e apagar a conta" vencido (gestao_exclusoes_processar; os
 * logins do Maestro que ficaram sem pet shop saem pelo Auth) e os arquivos da fila `arquivos_lixo` (gestao_lgpd_arquivos).
 *
 * Variáveis (só no servidor, nunca no navegador):
 *   SUPABASE_SERVICE_ROLE_KEY  chave de serviço do Supabase (passa por cima das regras: só esta rota usa)
 *   CRON_SECRET                o segredo que a Vercel Cron manda sozinha ("Authorization: Bearer <CRON_SECRET>"), 16 caracteres ou mais
 *   GESTAO_FAXINA_SEGREDO      segredo próprio da rota (32 caracteres ou mais), para chamar à mão. Vale qualquer um dos dois:
 *                              basta um estar configurado (antes só valia este, e a chamada diária da Vercel era recusada
 *                              em silêncio quando só o CRON_SECRET existia).
 *
 * Exclusão de contas (migração 20261229): o banco apaga em lotes e cada chamada trabalha poucos segundos; a faxina chama
 * de novo até acabar ou até o tempo da rota (`ate`), e o que sobrar continua na próxima noite. A rota anota cada rodada em
 * `rotinas_execucoes` (rotina_anotar) para o painel do administrador mostrar a última vez que deu certo.
 */
export const BUCKETS_DA_FAXINA = { boletim: "boletim", caderno: "caderno-tmp" } as const;
const LOTE = 100;
const LIMITE = 500;
const VOLTAS = 4;

/** Os segredos que valem: o próprio da rota (32 ou mais) e o da Vercel Cron (CRON_SECRET, 16 ou mais). Curto demais não vale. */
export function segredosDaFaxina(): string[] {
  const proprio = (process.env.GESTAO_FAXINA_SEGREDO ?? "").trim(), cron = (process.env.CRON_SECRET ?? "").trim();
  return [...new Set([proprio.length >= 32 ? proprio : "", cron.length >= 16 ? cron : ""].filter(Boolean))];
}

/** O primeiro segredo configurado, ou null (sem nenhum, a rota não roda). */
export function segredoDaFaxina(): string | null {
  return segredosDaFaxina()[0] ?? null;
}

/** O pedido traz um dos segredos? (Authorization: Bearer … ou x-gestao-faxina: …), comparado sem vazar tempo. */
export function pedidoAutorizado(req: Request, segredo: string | string[]): boolean {
  const veio = (req.headers.get("x-gestao-faxina") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  if (!veio) return false;
  const a = createHash("sha256").update(veio).digest();
  let vale = false;
  for (const s of Array.isArray(segredo) ? segredo : [segredo]) {
    if (s && timingSafeEqual(a, createHash("sha256").update(s).digest())) vale = true;
  }
  return vale;
}

/** A chamada veio da Vercel Cron (ela se apresenta assim) ou trouxe algum segredo: vale registrar quando é recusada. */
export function pareceAgendada(req: Request): boolean {
  return /vercel-cron/i.test(req.headers.get("user-agent") ?? "") || !!req.headers.get("authorization") || !!req.headers.get("x-gestao-faxina");
}

/** Cliente com a chave de serviço, ou null sem a variável. Nunca use fora das rotas do servidor. */
export function bancoDeServico(): Banco | null {
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!chave || !SUPABASE_URL) return null;
  return createClient<Database>(SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** `contas`: pet shops apagados (prazo de 30 dias do "Encerrar e apagar a conta" vencido); `logins`: logins apagados junto;
 *  `arquivos`: arquivos da fila da LGPD (tutor apagado, conta apagada). */
export type ResultadoDaFaxina = {
  albuns: number; reservas: number; fotos: number; pdfs: number; falhas: number; contas: number; logins: number; arquivos: number;
  /** contas com o prazo vencido que ainda não terminaram de sair (continua na próxima rodada) */
  contasPendentes: number;
  /** linhas apagadas das contas nesta rodada */
  linhas: number;
};

async function apagar(sb: Banco, bucket: string, caminhos: string[]): Promise<{ ok: number; falhas: number }> {
  let ok = 0, falhas = 0;
  for (let i = 0; i < caminhos.length; i += LOTE) {
    const parte = caminhos.slice(i, i + LOTE);
    const r = await sb.storage.from(bucket).remove(parte);
    if (r.error) falhas += parte.length; else ok += r.data?.length ?? 0;
  }
  return { ok, falhas };
}

/** Uma faxina completa: algumas voltas de até 500 arquivos por bucket, até a fila esvaziar. `petshop`: só os arquivos dele (testes). */
export async function faxinaGeral(sb: Banco, petshop?: string, o: { segundosDasContas?: number } = {}): Promise<ResultadoDaFaxina> {
  const x: ResultadoDaFaxina = { albuns: 0, reservas: 0, fotos: 0, pdfs: 0, falhas: 0, contas: 0, logins: 0, arquivos: 0, contasPendentes: 0, linhas: 0 };
  await apagarContasVencidas(sb, x, petshop, o.segundosDasContas ?? SEGUNDOS_DAS_CONTAS);
  await apagarLoginsDaFila(sb, x, petshop);
  for (let volta = 0; volta < VOLTAS; volta++) {
    const r = await sb.rpc("gestao_faxina_arquivos", { p_limite: LIMITE, ...(petshop ? { p_petshop: petshop } : {}) });
    if (r.error) throw Object.assign(new Error(r.error.message), { name: "ErroDaFaxina" });
    const d = (r.data ?? {}) as { banco?: { albuns?: number; reservas?: number }; boletim?: string[]; caderno_tmp?: string[] };
    x.albuns += Number(d.banco?.albuns ?? 0); x.reservas += Number(d.banco?.reservas ?? 0);
    const fotos = await apagar(sb, BUCKETS_DA_FAXINA.boletim, d.boletim ?? []);
    const pdfs = await apagar(sb, BUCKETS_DA_FAXINA.caderno, d.caderno_tmp ?? []);
    x.fotos += fotos.ok; x.pdfs += pdfs.ok; x.falhas += fotos.falhas + pdfs.falhas;
    if ((d.boletim?.length ?? 0) < LIMITE && (d.caderno_tmp?.length ?? 0) < LIMITE) break;
  }
  for (let volta = 0; volta < VOLTAS; volta++) {
    const r = await sb.rpc("gestao_lgpd_arquivos", { p_limite: LIMITE, ...(petshop ? { p_petshop: petshop } : {}) });
    if (r.error) throw Object.assign(new Error(r.error.message), { name: "ErroDaFaxina" });
    const porBucket = (r.data ?? {}) as Record<string, string[]>;
    let n = 0;
    for (const [bucket, caminhos] of Object.entries(porBucket)) {
      const a = await apagar(sb, bucket, caminhos);
      x.arquivos += a.ok; x.falhas += a.falhas; n += caminhos.length;
    }
    if (n < LIMITE) break;
  }
  return x;
}

/** Quanto tempo de uma rodada vai para apagar contas (a rota tem 60 s; sobra para os arquivos). */
export const SEGUNDOS_DAS_CONTAS = 35;
const VOLTAS_DAS_CONTAS = 200;

/**
 * Contas com o prazo de "Encerrar e apagar a conta" vencido: o banco põe os arquivos do pet shop na fila, apaga o pet shop
 * (e tudo dele, em lotes) e devolve os logins do Maestro que ficaram sem nenhum pet shop; aqui eles saem do Auth.
 * Cada chamada ao banco trabalha poucos segundos; repete até não sobrar conta, o banco parar de andar ou o tempo acabar.
 */
async function apagarContasVencidas(sb: Banco, x: ResultadoDaFaxina, petshop: string | undefined, segundos: number) {
  const ate = Date.now() + segundos * 1000;
  for (let volta = 0; volta < VOLTAS_DAS_CONTAS; volta++) {
    const r = await (sb.rpc.bind(sb) as unknown as RpcSolto)("gestao_exclusoes_processar", { p_limite: 5, ...(petshop ? { p_petshop: petshop } : {}) });
    if (r.error) throw Object.assign(new Error(r.error.message), { name: "ErroDaFaxina" });
    const d = (r.data ?? {}) as { lojas?: number; usuarios?: string[]; pendentes?: number; linhas?: number; falhas?: number };
    const lojas = Number(d.lojas ?? 0), linhas = Number(d.linhas ?? 0);
    x.contas += lojas; x.linhas += linhas; x.falhas += Number(d.falhas ?? 0);
    // banco de antes da 20261229 (sem "pendentes"): os logins saem aqui e a regra antiga vale (mais uma volta só quando vieram
    // as 5 do limite). No banco novo eles ficam na fila logins_lixo, que apagarLoginsDaFila esvazia (e tenta de novo se falhar).
    if (d.pendentes === undefined) {
      for (const id of d.usuarios ?? []) {
        const u = await sb.auth.admin.deleteUser(id);
        if (u.error) x.falhas += 1; else x.logins += 1;
      }
    }
    x.contasPendentes = d.pendentes === undefined ? (lojas >= 5 ? 1 : 0) : Number(d.pendentes);
    if (!x.contasPendentes) break;
    // nada andou nesta volta (só falhas, já anotadas no banco): não insiste
    if (!lojas && !linhas) break;
    if (Date.now() >= ate) break;
  }
}

type RpcSolto = (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

/**
 * Logins que sobraram de contas apagadas (fila `logins_lixo`, migração 20261229): cada um sai do Auth e, saindo, sai da fila.
 * O que falhar fica na fila com o motivo e é tentado de novo na próxima faxina (antes, a lista se perdia). O banco só devolve
 * login que continua solto: quem entrou em outro pet shop nesse meio tempo não é apagado.
 */
async function apagarLoginsDaFila(sb: Banco, x: ResultadoDaFaxina, petshop?: string) {
  const rpc = sb.rpc.bind(sb) as unknown as RpcSolto;
  const r = await rpc("gestao_logins_lixo", { p_limite: 100, ...(petshop ? { p_petshop: petshop } : {}) });
  if (r.error) {
    if (/PGRST202|42883/.test(r.error.code ?? "") || /Could not find the function/i.test(r.error.message)) return; // banco de antes da 20261229
    throw Object.assign(new Error(r.error.message), { name: "ErroDaFaxina" });
  }
  for (const id of (Array.isArray(r.data) ? r.data : []) as string[]) {
    const u = await sb.auth.admin.deleteUser(id);
    // "não encontrado": já saiu (a versão anterior do servidor apagou direto): conta como feito
    const ok = !u.error || /not found/i.test(u.error.message) || (u.error as { status?: number }).status === 404;
    if (ok) x.logins += u.error ? 0 : 1; else x.falhas += 1;
    await rpc("gestao_login_lixo_feito", { p_user: id, p_ok: ok, p_erro: ok ? null : u.error?.message ?? "falhou" });
  }
}
