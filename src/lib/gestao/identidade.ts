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
  raiz.style.removeProperty("--tema");
  raiz.style.removeProperty("--destaque");
  delete raiz.dataset.tema;
  const propria = corPropria(tema);
  if (propria) {
    raiz.style.setProperty("--tema", propria.tema);
    raiz.style.setProperty("--destaque", propria.destaque);
  } else if (tema && tema !== "floresta" && TEMAS.some((t) => t.id === tema)) raiz.dataset.tema = tema;
}

/** Cor própria do pet shop, guardada como "#rrggbb/#rrggbb" (principal / destaque). */
export function corPropria(tema: string | null | undefined) {
  const m = /^(#[0-9a-f]{6})\/(#[0-9a-f]{6})$/.exec(tema ?? "");
  return m ? { tema: m[1], destaque: m[2] } : null;
}

/** Escurece a cor principal até o texto claro ficar legível por cima dela (fundo do menu e dos botões). */
export function corSegura(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#1e3a2f";
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  const luz = () => { const c = [r, g, b].map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (let i = 0; i < 40 && luz() > 0.16; i++) { r = Math.round(r * 0.93); g = Math.round(g * 0.93); b = Math.round(b * 0.93); }
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
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
