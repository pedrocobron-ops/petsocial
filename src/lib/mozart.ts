/**
 * Artes do mascote Mozart.
 * As artes foram importadas do Drive para o Supabase Storage (bucket
 * público `sponsored`, pasta mozart/) com nomes numerados. O mapa POSES
 * traduz cada pose para o arquivo certo — preenchido conforme as artes
 * são identificadas na galeria /redacao/mozart.
 * Pose sem mapeamento cai no rosto oficial local (sempre disponível).
 */
const STORAGE_BASE =
  "https://aefrcwysifgniogumxwk.supabase.co/storage/v1/object/public/sponsored/mozart";

const POSES: Record<string, string> = {
  // exemplo, após identificar: oi: "3.jpg", dormindo: "7.jpg", ...
};

export function mozart(pose: string): string {
  const arquivo = POSES[pose];
  if (arquivo) return `${STORAGE_BASE}/${arquivo}`;
  return "/mozart/rosto.png";
}
