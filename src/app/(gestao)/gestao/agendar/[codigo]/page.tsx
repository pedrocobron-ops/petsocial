import type { Metadata } from "next";
import { cssDoTema, lerLinkInicial } from "@/lib/gestao/link-servidor";
import { origemDoPedido, previaDaLoja } from "@/lib/gestao/link-og";
import AgendarPeloLink from "./cliente";

/**
 * Link do cliente: o servidor lê o pet shop, os serviços e as opções do link pelas funções públicas de sempre e a página
 * já chega com o nome, a lista de serviços e as cores no HTML (no celular com internet fraca, o tutor não fica olhando
 * caixas vazias enquanto o JavaScript baixa). Os horários livres continuam sendo lidos na hora, pelo navegador.
 * A prévia do link no WhatsApp é a do pet shop (nome, cidade e logo), nunca a do site da Maestro Pet.
 */
export const dynamic = "force-dynamic";

/** O código é sempre em minúsculas: quem digitou do cartaz em maiúsculas chega no mesmo lugar. */
const codigoDe = (bruto: string) => {
  let c = "";
  try { c = decodeURIComponent(String(bruto ?? "")).trim(); } catch { c = ""; }
  return /^[0-9A-Fa-f]{6,40}$/.test(c) ? c.toLowerCase() : c;
};

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }): Promise<Metadata> {
  const codigo = codigoDe((await params).codigo);
  const ini = await lerLinkInicial(codigo);
  const info = ini?.info as { nome?: unknown; cidade?: unknown; uf?: unknown; logo?: unknown; creche?: unknown; hotel?: unknown; servicos?: unknown[] } | null | undefined;
  const nome = typeof info?.nome === "string" && info.nome ? info.nome : ini?.nome ?? null;
  // link desligado ou sem leitura: ainda assim, nada do site da Maestro Pet na prévia
  if (!nome) return { title: { absolute: "Pedido de horário" }, description: "Peça um horário pelo link do pet shop.", openGraph: { title: "Pedido de horário", description: "Peça um horário pelo link do pet shop.", siteName: "Pedido de horário", locale: "pt_BR", images: [] } };
  const origem = await origemDoPedido();
  const onde = [info?.cidade, info?.uf].filter((x): x is string => typeof x === "string" && !!x.trim()).join("/");
  const so = !(Array.isArray(info?.servicos) && info.servicos.length) && (info?.creche || info?.hotel);
  const descricao = `${so ? "Escolha as datas e peça a vaga" : "Escolha o serviço, o dia e a hora"}. ${nome} confirma pelo WhatsApp.${onde ? ` ${onde}.` : ""}`;
  return previaDaLoja({
    titulo: `Agendar: ${nome}`, descricao, loja: nome, logo: typeof info?.logo === "string" ? info.logo : null,
    url: `${origem}/gestao/agendar/${encodeURIComponent(codigo)}`, origem, imagemNeutra: `/gestao/agendar/${encodeURIComponent(codigo)}/previa`,
  });
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
