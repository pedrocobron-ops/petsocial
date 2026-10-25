import type { Metadata } from "next";
import MetaPixel from "@/components/meta-pixel";
import "./globals.css";

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
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
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
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700;9..144,800;9..144,900&family=Inter:wght@400;500;600;700;800&family=Fredoka:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <MetaPixel />
        {children}
      </body>
    </html>
  );
}
