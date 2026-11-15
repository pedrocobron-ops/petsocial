import { createHash, createHmac } from "crypto";

/**
 * Só no servidor (rotas de /api). Segredo que prova ao banco que o pedido veio do servidor, e não de alguém chamando as
 * funções direto com a chave pública: contagem do "Tirar dúvida" do link (link_ia_contar/link_ia_registrar) e do chat
 * de venda (vendas_contar). O banco guarda só o sha256 (config_interna 'servidor_segredo_sha256'), gravado pelo
 * administrador no painel (aba Cakto, "Trava do servidor"), que chama /api/gestao/servidor.
 * Vem da variável GESTAO_SEGREDO_SERVIDOR; sem ela, é derivado da chave da Anthropic (que só o servidor tem).
 * Trocar a chave da Anthropic muda o segredo: depois disso, grave de novo no painel.
 * Enquanto o administrador não grava, o banco aceita sem segredo (como antes).
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
