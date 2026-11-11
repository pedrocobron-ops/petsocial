/** Fotos que sobem para o bucket `pets` (limite de 1 MB por arquivo). */

/** Reduz a foto para no máximo `maximo` px (640 por padrão) e devolve um JPEG leve (celulares mandam fotos de vários MB). */
export async function reduzirFoto(arquivo: File, maximo = 640, qualidade = 0.82): Promise<Blob> {
  const img = await createImageBitmap(arquivo);
  const escala = Math.min(1, maximo / Math.max(img.width, img.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(img.width * escala);
  tela.height = Math.round(img.height * escala);
  tela.getContext("2d")!.drawImage(img, 0, 0, tela.width, tela.height);
  return new Promise((res, rej) => tela.toBlob((b) => (b ? res(b) : rej(new Error("Não consegui ler a foto."))), "image/jpeg", qualidade));
}
