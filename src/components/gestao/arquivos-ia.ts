"use client";

import { LADO_DA_FOTO } from "@/lib/gestao/caderno";

/**
 * O preparo dos arquivos que vão para a leitura da IA, no aparelho: usado pela Foto do caderno e pelo anexo do Mozart.
 * A foto é diminuída (lado maior 1600 px, JPEG) e as páginas do PDF são contadas aqui (o servidor confere de novo).
 */

/** Foto HEIC (o formato das fotos do iPhone): só abre onde o navegador sabe abrir (Safari). */
export const ehHeic = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
/** Diminui a foto no aparelho (lado maior 1600 px, JPEG): a leitura fica igual e o envio fica leve. HEIC só abre onde o navegador sabe abrir. */
export async function paraJpeg(f: File): Promise<Blob> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, LADO_DA_FOTO / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("sem canvas");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    if (!b) throw new Error("sem jpeg");
    return b;
  } finally { URL.revokeObjectURL(url); }
}
/** Páginas do PDF contadas no aparelho (o servidor confere de novo). 0 = não deu para contar. */
export async function paginasDoPdf(f: File): Promise<number> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const d = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), isEvalSupported: false }).promise;
    const n = d.numPages;
    void d.destroy();
    return n;
  } catch { return 0; }
}
