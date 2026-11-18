import type { Metadata, Viewport } from "next";
import "../gestao.css";
import { VigiaDeErros } from "@/components/gestao/erros";
import { Robustez } from "@/components/gestao/robustez";

/** Maestro Pet Gestão: aplicativo e telas de entrada. Fora do Google enquanto o produto não é lançado. */
export const metadata: Metadata = {
  title: { default: "Maestro Pet Gestão", template: "%s | Maestro Pet Gestão" },
  description: "Banho e tosa, creche, hotel e loja num sistema só, com todas as funções em todos os planos e o Mozart, assistente por voz e texto, sem pagar à parte.",
  robots: { index: false, follow: false },
  manifest: "/gestao/manifest.webmanifest",
  icons: { icon: [{ url: "/gestao/marca.svg", type: "image/svg+xml" }, { url: "/gestao/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/gestao/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Maestro Gestão", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#1e3a2f", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="g g-raiz"><VigiaDeErros /><Robustez />{children}</div>;
}
