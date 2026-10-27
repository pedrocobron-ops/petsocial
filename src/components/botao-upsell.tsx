import Script from "next/script";

/**
 * Botões de upsell de 1 clique da Cakto (os mesmos do Gerador de Upsell do painel). O script da Cakto
 * registra os elementos <cakto-upsell-accept> e <cakto-upsell-reject> e cobra a oferta com os dados
 * da compra que acabou de ser feita.
 */
export default function BotaoUpsell({ oferta, aceitar, recusar }: { oferta: string; aceitar: string; recusar: string }) {
  const html = `<cakto-upsell-buttons>
<cakto-upsell-accept bg-color="#F97316" text-color="#1f1a17" upsell-accept-url="members_area" offer-id="${oferta}" app-base-url="https://app.cakto.com.br" offer-type="upsell" upsell-reject-url="members_area">${aceitar}</cakto-upsell-accept>
<cakto-upsell-reject upsell-reject-url="members_area">${recusar}</cakto-upsell-reject>
</cakto-upsell-buttons>`;
  return (
    <>
      <div className="pc-botao" dangerouslySetInnerHTML={{ __html: html }} />
      <Script src="https://caktoscripts.nyc3.cdn.digitaloceanspaces.com/upsell.js" strategy="afterInteractive" />
    </>
  );
}
