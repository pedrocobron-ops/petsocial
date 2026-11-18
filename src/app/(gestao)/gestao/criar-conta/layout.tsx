import type { Metadata } from "next";
import GuardarOrigem from "@/components/gestao/guardar-origem";

// Título e descrição curtos para o link mandado pelo WhatsApp (o cadastro continua fora do Google, como o resto do aplicativo).
const TITULO = "Teste o Maestro Pet Gestão por 7 dias, sem cartão";
const DESCRICAO = "Agenda, clientes, creche, hotel, loja e caixa do pet shop num sistema só, no celular. Crie a conta em um minuto. Nada é cobrado no fim do teste.";
const IMAGEM = { url: "/gestao/compartilhar.jpg", width: 1200, height: 630, alt: "Maestro Pet Gestão: o seu pet shop organizado, do banho ao caixa." };

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRICAO,
  openGraph: { title: TITULO, description: DESCRICAO, url: "/gestao/criar-conta", type: "website", siteName: "Maestro Pet Gestão", locale: "pt_BR", images: [IMAGEM] },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRICAO, images: [IMAGEM.url] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><GuardarOrigem />{children}</>;
}
