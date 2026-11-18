// Gera public/gestao/compartilhar.jpg (1200 x 630): a imagem que aparece quando alguém manda o link da página de venda
// ou do cadastro pelo WhatsApp, Instagram ou Facebook (og:image).
// Usa só o que já está no repositório: a marca (o mesmo traço de src/components/gestao/marca.tsx) e as duas fotos de
// exemplo do boletim (public/gestao/boletim). Sem preço na imagem: o preço mora em src/lib/gestao/planos.ts e pode mudar.
// Rodar: node scripts/gerar-imagem-de-compartilhar.mjs   (precisa das fontes Inter e DejaVu Serif na máquina)
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const L = 1200, A = 630;
const VERDE = "#1e3a2f", CREME = "#f6f1e8", LARANJA = "#f97316";

const marca = `
  <g fill="none" stroke="${CREME}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M89 60 C89 77 80 95 60 106 C40 95 31 76 31 56 C27 42 25 26 27 13 C38 17 47 24 52 32 C57 30 63 30 68 32 C73 23 80 17 89 15 C99 18 104 30 101 47 C97 42 93 40 88 40"/>
    <path d="M55.5 30.8 C56.5 52 52 70 43 82"/>
    <path d="M64.5 30.8 C63.5 52 68 70 77 82"/>
    <path d="M53 90 Q60 86 67 90 Q65 97 60 98 Q55 97 53 90 Z" fill="${CREME}" stroke-width="2"/>
  </g>`;

const fundo = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${A}" viewBox="0 0 ${L} ${A}">
  <rect width="${L}" height="${A}" fill="${VERDE}"/>
  <circle cx="1090" cy="-40" r="330" fill="#ffffff" opacity=".05"/>
  <circle cx="60" cy="660" r="240" fill="#ffffff" opacity=".04"/>
  <svg x="64" y="56" width="64" height="64" viewBox="4.5 -0.5 120 120">${marca}</svg>
  <text x="142" y="98" font-family="Inter, DejaVu Sans, sans-serif" font-size="30" font-weight="600" fill="${CREME}">Maestro Pet <tspan fill="${LARANJA}">Gestão</tspan></text>
  <text font-family="DejaVu Serif, serif" font-size="58" font-weight="700" fill="${CREME}">
    <tspan x="64" y="232">O seu pet shop</tspan>
    <tspan x="64" y="304">organizado,</tspan>
    <tspan x="64" y="376" fill="${LARANJA}">do banho ao caixa.</tspan>
  </text>
  <text font-family="Inter, DejaVu Sans, sans-serif" font-size="27" fill="${CREME}" opacity=".92">
    <tspan x="64" y="438">Agenda, creche, hotel, loja e caixa</tspan>
    <tspan x="64" y="474">num sistema só, no celular.</tspan>
  </text>
  <rect x="64" y="512" width="398" height="60" rx="30" fill="${LARANJA}"/>
  <text x="263" y="551" text-anchor="middle" font-family="Inter, DejaVu Sans, sans-serif" font-size="27" font-weight="700" fill="#1f1b17">7 dias grátis, sem cartão</text>
  <rect x="716" y="92" width="420" height="446" rx="30" fill="${CREME}"/>
  <text x="740" y="138" font-family="Inter, DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="${VERDE}">Boletim do pet</text>
  <text font-family="Inter, DejaVu Sans, sans-serif" font-size="19" fill="#5d564d">
    <tspan x="740" y="492">O tutor recebe as fotos pelo link.</tspan>
    <tspan x="740" y="518">Fotos de exemplo.</tspan>
  </text>
</svg>`);

const foto = async (arquivo, rotulo) => {
  const l = 180, a = 300;
  const img = await sharp(path.join(raiz, "public/gestao/boletim", arquivo)).resize(l, a, { fit: "cover" }).toBuffer();
  const mascara = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${a}"><rect width="${l}" height="${a}" rx="20" fill="#fff"/></svg>`);
  const selo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${a}">
    <rect x="12" y="${a - 48}" width="${rotulo.length * 13 + 26}" height="36" rx="18" fill="${VERDE}" opacity=".88"/>
    <text x="25" y="${a - 23}" font-family="Inter, DejaVu Sans, sans-serif" font-size="20" font-weight="600" fill="${CREME}">${rotulo}</text></svg>`);
  return sharp(img).composite([{ input: mascara, blend: "dest-in" }, { input: selo }]).png().toBuffer();
};

const saida = path.join(raiz, "public/gestao/compartilhar.jpg");
await sharp(fundo)
  .composite([
    { input: await foto("antes.webp", "Antes"), left: 740, top: 160 },
    { input: await foto("depois.webp", "Depois"), left: 932, top: 160 },
  ])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(saida);
const info = await sharp(saida).metadata();
console.log(`${path.relative(raiz, saida)}: ${info.width} x ${info.height}`);
