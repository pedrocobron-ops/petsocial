import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { AdSenseLoader } from "@/components/ad-slot";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Maestro Pet — Jornal do Universo Pet",
    template: "%s | Maestro Pet",
  },
  description:
    "Notícias, guias e curiosidades sobre cães, gatos e o universo pet: saúde, comportamento, nutrição e adoção — no jornal do Maestro Pet.",
  applicationName: "Maestro Pet",
  alternates: { canonical: "/", types: { "application/rss+xml": "/rss.xml" } },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Maestro Pet",
    title: "Maestro Pet — Jornal do Universo Pet",
    description:
      "Notícias, guias e curiosidades sobre cães, gatos e o universo pet.",
    images: [{ url: "/mozart/rosto.png", width: 512, height: 512 }],
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Inter:wght@400;600;700;800&family=Fredoka:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AdSenseLoader />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
