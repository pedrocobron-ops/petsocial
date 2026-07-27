/**
 * Artes do mascote Mozart.
 * As versões otimizadas para web estão hospedadas no projeto legado da
 * Vercel (o app antigo, que continua no ar como acervo). O rosto oficial
 * também existe localmente em /mozart/rosto.png (usado em favicon/logo).
 *
 * Poses disponíveis: rosto, oi, corpo, comemorando, coracao, curioso,
 * detetive, dormindo, espiando, ideia, maestro, megafone, placa, triste,
 * balao, logo.
 */
const BASE =
  process.env.NEXT_PUBLIC_MOZART_BASE ??
  "https://petsocial-tawny.vercel.app/mozart";

export function mozart(pose: string): string {
  if (pose === "rosto") return "/mozart/rosto.png"; // local, sempre disponível
  return `${BASE}/${pose}.png`;
}
