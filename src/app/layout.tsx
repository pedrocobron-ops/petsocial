import type { Metadata } from "next";
import PageTracker from "@/components/page-tracker";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

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
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800;9..144,900&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=Inter:wght@400;500;600;700;800&family=Fredoka:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <PageTracker />
        {children}
      </body>
    </html>
  );
}
