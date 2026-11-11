/** Combinações de cor que o pet shop escolhe. As cores em si moram no CSS (`.g-raiz[data-tema=…]`); aqui ficam os nomes e a amostra. */
export const TEMAS = [
  { id: "floresta", nome: "Floresta", tema: "#1e3a2f", destaque: "#f97316" },
  { id: "oceano", nome: "Oceano", tema: "#1b3a57", destaque: "#f6a623" },
  { id: "uva", nome: "Uva", tema: "#3d2c63", destaque: "#f08bb4" },
  { id: "vinho", nome: "Vinho", tema: "#5a1e2c", destaque: "#f2a541" },
  { id: "grafite", nome: "Grafite", tema: "#2a2c31", destaque: "#46c08a" },
  { id: "turquesa", nome: "Turquesa", tema: "#0e4a4a", destaque: "#f7c948" },
] as const;
export type Tema = (typeof TEMAS)[number]["id"];

/** Pinta a página com a combinação do pet shop (aplicativo, link do cliente e agenda impressa). */
export function aplicarTema(tema: string | null | undefined) {
  if (typeof document === "undefined") return;
  const raiz = document.querySelector<HTMLElement>(".g-raiz");
  if (!raiz) return;
  if (tema && tema !== "floresta" && TEMAS.some((t) => t.id === tema)) raiz.dataset.tema = tema;
  else delete raiz.dataset.tema;
}

/** Reduz a logo para até 512 px mantendo o fundo transparente (WebP). */
export async function reduzirLogo(arquivo: File, maximo = 512): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, maximo / Math.max(img.width, img.height));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(img.width * escala));
  tela.height = Math.max(1, Math.round(img.height * escala));
  tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
  const blob = await new Promise<Blob | null>((ok) => tela.toBlob(ok, "image/webp", 0.9));
  if (!blob) throw new Error("Não consegui ler essa imagem. Tente outra.");
  return blob;
}
