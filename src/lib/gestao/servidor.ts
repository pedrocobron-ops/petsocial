import { createHash, createHmac } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CHAVE, SUPABASE_URL } from "./supabase";

/**
 * Só no servidor (rotas de /api). Segredo que prova ao banco que o pedido veio do servidor, e não de alguém chamando as
 * funções direto com a chave pública: contagem do "Tirar dúvida" do link (link_ia_contar/link_ia_registrar) e do chat
 * de venda (vendas_contar). O banco guarda só o sha256 (config_interna 'servidor_segredo_sha256'), gravado pelo
 * administrador no painel (aba Cakto, "Trava do servidor"), que chama /api/gestao/servidor.
 * Vem da variável GESTAO_SEGREDO_SERVIDOR; sem ela, é derivado da chave da Anthropic (que só o servidor tem).
 * Trocar a chave da Anthropic muda o segredo: depois disso, grave de novo no painel.
 *
 * A trava fecha sozinha (migração 20261228): sem a impressão gravada, o banco só aceita a contagem até a data de carência
 * (config_interna 'servidor_trava_carencia_ate'); depois recusa tudo. Para ninguém precisar lembrar do botão, o servidor
 * grava a própria impressão sozinho no primeiro pedido (`garantirTrava`), quando tem SUPABASE_SERVICE_ROLE_KEY (a mesma
 * chave da faxina e da cópia completa). Sem essa chave, só o botão do painel liga a trava.
 */
export function segredoDoServidor(): string | null {
  const proprio = (process.env.GESTAO_SEGREDO_SERVIDOR ?? "").trim();
  if (proprio.length >= 32) return proprio;
  const chave = (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, "");
  if (!chave) return null;
  return createHmac("sha256", chave).update("maestro-pet:servidor:v1").digest("hex");
}

/** O endereço de quem chama, agrupado (IPv6 por /64: cada aparelho tem muitos endereços), como hash. */
export function visitante(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return "sem-ip";
  const grupo = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
  return createHash("sha256").update(`maestro-visitante:${grupo}`).digest("hex").slice(0, 32);
}

/** Clientes do banco só para a trava (sem tipos: as funções podem ainda não existir num banco sem a migração). */
const bancoSolto = (chave: string) => createClient(SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
let travaConferida = 0; // quando a trava foi vista ligada com o segredo deste servidor (por instância)
let travaTentada = 0;

/**
 * Confere se o banco conhece o segredo deste servidor e, se não conhece, grava (precisa da chave de serviço).
 * Uma consulta por instância do servidor; depois de ver a trava certa, não pergunta mais. `deNovo`: o banco acabou de
 * recusar o segredo (a chave da IA foi trocada, por exemplo): confere outra vez agora.
 * Nunca derruba o pedido: sem conseguir, segue (e o banco decide: carência ou recusa). "gravou" = acabou de gravar agora
 * (vale tentar a contagem de novo). Dois endereços com segredos diferentes no mesmo banco (produção e prévia, por exemplo)
 * ficariam regravando um por cima do outro: use a mesma GESTAO_SEGREDO_SERVIDOR em todos.
 */
export async function garantirTrava(deNovo = false): Promise<"ok" | "gravou" | "sem_chave" | "falhou"> {
  const agora = Date.now();
  if (!deNovo && travaConferida) return "ok";
  // sem a chave de serviço não adianta insistir a cada pedido: uma tentativa a cada 5 minutos
  if (!deNovo && agora - travaTentada < 5 * 60_000) return "falhou";
  travaTentada = agora;
  const segredo = segredoDoServidor();
  if (!segredo || !SUPABASE_URL) return "falhou";
  try {
    const estado = await bancoSolto(SUPABASE_CHAVE).rpc("servidor_segredo_estado", { p_segredo: segredo });
    if (estado.error) return "falhou"; // banco sem a migração: como antes
    if (estado.data === "ok") { travaConferida = agora; return "ok"; }
    const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
    if (!chave) {
      console.error(`[servidor] trava do servidor ${estado.data === "errado" ? "com outro segredo" : "desligada"} e sem SUPABASE_SERVICE_ROLE_KEY: ligue no painel do administrador (aba Cakto)`);
      return "sem_chave";
    }
    const gravou = await bancoSolto(chave).rpc("servidor_segredo_registrar", { p_segredo: segredo });
    if (gravou.error) { console.error("[servidor] não deu para gravar a trava do servidor", gravou.error.code); return "falhou"; }
    console.info("[servidor] trava do servidor gravada pelo próprio servidor");
    travaConferida = agora;
    return "gravou";
  } catch { return "falhou"; }
}
