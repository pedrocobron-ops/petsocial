import { headers } from "next/headers";
import LayoutDoApp from "./layout-cliente";

/**
 * O aplicativo roda com a regra de conteúdo que vale (src/middleware.ts): cada página sai do servidor na hora, com o nonce
 * do pedido nos scripts (uma página guardada no build não teria o nonce e o navegador barraria os scripts).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <LayoutDoApp nonce={nonce}>{children}</LayoutDoApp>;
}
