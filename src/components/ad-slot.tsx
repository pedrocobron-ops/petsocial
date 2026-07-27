/*
 * Espaço de publicidade Google AdSense.
 * Fica DORMENTE (não renderiza nada) até NEXT_PUBLIC_ADSENSE_CLIENT ser
 * configurada — assim o site já nasce com os espaços reservados e, quando a
 * conta for aprovada, basta definir a variável na Vercel e fazer redeploy.
 */
import Script from "next/script";

const CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

export function AdSenseLoader() {
  if (!CLIENT) return null;
  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
}

export default function AdSlot({ slot }: { slot?: string }) {
  if (!CLIENT) return null;
  return (
    <div className="ad-slot">
      <div className="ad-label">Publicidade</div>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      <Script id={`ads-init-${slot ?? "auto"}`} strategy="afterInteractive">
        {`(adsbygoogle = window.adsbygoogle || []).push({});`}
      </Script>
    </div>
  );
}
