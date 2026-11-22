import { headers } from "next/headers";
import DocumentoProprio from "@/components/gestao/documento-proprio";

/** O painel roda com a regra de conteúdo que vale (src/middleware.ts): a página sai do servidor na hora, com o nonce do pedido. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await headers();
  return <><DocumentoProprio />{children}</>;
}
