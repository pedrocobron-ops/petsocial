import type { Metadata } from "next";
import { cssDoTema, lerPedidoInicial } from "@/lib/gestao/link-servidor";
import { origemDoPedido, previaDaLoja } from "@/lib/gestao/link-og";
import AcompanharPedido from "./cliente";

/**
 * Página do pedido do tutor: o servidor lê o pedido pelas funções públicas de sempre (só com o código do pedido) e a página
 * já chega com a situação no HTML. Enquanto espera a confirmação, o navegador continua atualizando sozinho.
 * A prévia do link é a do pet shop (sem nome de pet nem de tutor) e a página fica fora dos buscadores.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ codigo: string; id: string }> }): Promise<Metadata> {
  const { codigo, id } = await params;
  const base: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
  const ini = await lerPedidoInicial(id);
  const p = ini?.pedido as { petshop?: unknown; logo?: unknown; codigo?: unknown } | null | undefined;
  const loja = typeof p?.petshop === "string" && p.petshop ? p.petshop : null;
  if (!loja) return { ...base, title: { absolute: "Seu pedido" }, description: "Acompanhe o seu pedido.", openGraph: { title: "Seu pedido", description: "Acompanhe o seu pedido.", siteName: "Seu pedido", locale: "pt_BR", images: [] } };
  const origem = await origemDoPedido();
  const cod = encodeURIComponent(typeof p?.codigo === "string" && p.codigo ? p.codigo : codigo);
  return previaDaLoja({
    titulo: `Seu pedido em ${loja}`, descricao: `Veja se ${loja} já confirmou o seu pedido.`, loja, logo: typeof p?.logo === "string" ? p.logo : null,
    url: `${origem}/gestao/agendar/${cod}/pedido/${encodeURIComponent(id)}`, origem, imagemNeutra: `/gestao/agendar/${cod}/previa`, particular: true,
  });
}

export default async function Pagina({ params }: { params: Promise<{ codigo: string; id: string }> }) {
  const { codigo, id } = await params;
  const ini = await lerPedidoInicial(id);
  const css = ini ? cssDoTema((ini.pedido as { tema?: unknown } | null)?.tema) : null;
  return (
    <>
      {css && <style>{css}</style>}
      <AcompanharPedido codigo={codigo} id={id} inicial={ini} />
    </>
  );
}
