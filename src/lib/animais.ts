/** Animais-alvo das matérias (slugs fixos — viram páginas-hub /animal/[slug]). */
export interface Animal {
  slug: string;
  nome: string;
  singular: string;
  emoji: string;
}

export const ANIMAIS: Animal[] = [
  { slug: "cachorro", nome: "Cachorros", singular: "cachorro", emoji: "🐶" },
  { slug: "gato", nome: "Gatos", singular: "gato", emoji: "🐱" },
  { slug: "ave", nome: "Aves", singular: "ave", emoji: "🦜" },
  { slug: "peixe", nome: "Peixes", singular: "peixe", emoji: "🐠" },
  { slug: "roedor", nome: "Roedores", singular: "roedor", emoji: "🐹" },
  { slug: "coelho", nome: "Coelhos", singular: "coelho", emoji: "🐰" },
  { slug: "reptil", nome: "Répteis", singular: "réptil", emoji: "🦎" },
  { slug: "cavalo", nome: "Cavalos", singular: "cavalo", emoji: "🐴" },
];

export function animalPorSlug(slug: string): Animal | undefined {
  return ANIMAIS.find((a) => a.slug === slug);
}
