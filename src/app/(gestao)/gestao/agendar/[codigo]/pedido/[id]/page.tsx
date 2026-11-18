import { cssDoTema, lerPedidoInicial } from "@/lib/gestao/link-servidor";
import AcompanharPedido from "./cliente";

/**
 * Página do pedido do tutor: o servidor lê o pedido pelas funções públicas de sempre (só com o código do pedido) e a página
 * já chega com a situação no HTML. Enquanto espera a confirmação, o navegador continua atualizando sozinho.
 */
export const dynamic = "force-dynamic";

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
