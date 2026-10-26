import type { Metadata } from "next";
import MetaPixel from "@/components/meta-pixel";
import AvisoCookies from "@/components/aviso-cookies";
import Revela from "@/components/revela";
import localFont from "next/font/local";
import "./globals.css";

/* Brief 20, 4.1: três arquivos (90 KB). Fraunces com opsz 144 e SOFT 50 fixos, peso variável; itálico 400; Instrument Sans 400–700. */
const fraunces = localFont({
  src: "./fontes/fraunces-roman.woff2", weight: "100 900", style: "normal",
  variable: "--font-fraunces", display: "swap", preload: true, adjustFontFallback: "Times New Roman",
});
const frauncesItalico = localFont({
  src: "./fontes/fraunces-italico.woff2", weight: "400", style: "italic",
  variable: "--font-fraunces-italico", display: "swap", preload: false, adjustFontFallback: "Times New Roman",
});
const instrument = localFont({
  src: "./fontes/instrument-sans.woff2", weight: "400 700", style: "normal",
  variable: "--font-instrument", display: "swap", preload: true, adjustFontFallback: "Arial",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Maestro Pet — conhecimento prático para quem ama pets e para quem vive deles",
    template: "%s | Maestro Pet",
  },
  description:
    "Guias e kits práticos para tutores de cães e gatos, e manuais completos para quem quer empreender no mercado pet.",
  applicationName: "Maestro Pet",
  icons: {
    icon: [{ url: "/marca/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Maestro Pet",
    title: "Maestro Pet",
    description: "Guias para tutores e manuais para quem trabalha no mercado pet.",
    images: [{ url: "/og/home.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true, "max-image-preview": "large" },
  // Código de verificação do Google Search Console (variável na Vercel).
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${frauncesItalico.variable} ${instrument.variable}`}>
      <body>
        <MetaPixel />
        {children}
        <AvisoCookies />
        <Revela />
      </body>
    </html>
  );
}
