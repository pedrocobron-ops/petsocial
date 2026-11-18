import type { Metadata } from "next";
import LinkQueNaoAbre from "@/components/gestao/link-que-nao-abre";

/** Link errado, trocado ou vencido: uma página simples para o tutor, não o "página não encontrada" do site. */
export const metadata: Metadata = { title: { absolute: "Este link não abre mais" }, robots: { index: false, follow: false, nocache: true } };

export default function NaoAchei() {
  return <LinkQueNaoAbre />;
}
