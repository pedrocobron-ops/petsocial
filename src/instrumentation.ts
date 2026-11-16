/**
 * Erros do servidor que escapam de uma tela ou rota da Gestão (renderização, rota sem `comRegistro`): vão para o registro
 * de erros (aba Erros do painel do administrador). Só a Gestão; o resto do site fica de fora. A rota vai como o modelo do
 * Next (ex.: /gestao/tutor/[token]), sem ids.
 */
export async function register() { /* nada a preparar */ }

export async function onRequestError(
  erro: unknown,
  pedido: { path: string; method: string },
  contexto: { routerKind: string; routePath: string; routeType: string },
) {
  try {
    const caminho = (pedido.path || "").split("?")[0];
    if (!/^\/(gestao|api\/gestao)(\/|$)/.test(caminho)) return;
    const { registrarErroServidor } = await import("@/lib/gestao/erros-servidor");
    await registrarErroServidor(contexto.routePath || "/gestao", erro);
  } catch { /* nunca derruba o pedido */ }
}
