import type { Metadata } from "next";
import { cssDoTema, lerLinkInicial } from "@/lib/gestao/link-servidor";
import AgendarPeloLink from "./cliente";

/**
 * Link do cliente: o servidor lê o pet shop, os serviços e as opções do link pelas funções públicas de sempre e a página
 * já chega com o nome, a lista de serviços e as cores no HTML (no celular com internet fraca, o tutor não fica olhando
 * caixas vazias enquanto o JavaScript baixa). Os horários livres continuam sendo lidos na hora, pelo navegador.
 */
export const dynamic = "force-dynamic";

const codigoDe = (bruto: string) => { try { return decodeURIComponent(String(bruto ?? "")).trim(); } catch { return ""; } };

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }): Promise<Metadata> {
  const ini = await lerLinkInicial(codigoDe((await params).codigo));
  const nome = (ini?.info as { nome?: unknown } | null | undefined)?.nome;
  return typeof nome === "string" && nome ? { title: { absolute: `Agendar: ${nome}` } } : {};
}

export default async function Pagina({ params }: { params: Promise<{ codigo: string }> }) {
  const ini = await lerLinkInicial(codigoDe((await params).codigo));
  const css = ini ? cssDoTema((ini.info as { tema?: unknown } | null)?.tema) : null;
  return (
    <>
      {css && <style>{css}</style>}
      <AgendarPeloLink inicial={ini} />
    </>
  );
}
