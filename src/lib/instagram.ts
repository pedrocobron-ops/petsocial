import { animalPorSlug } from "@/lib/animais";

/** O mínimo que o kit de Instagram precisa saber sobre a matéria. */
export interface MateriaSocial {
  slug: string;
  title: string;
  dek: string | null;
  animals: string[] | null;
  cover_url: string | null;
  categoria: { name: string; color: string | null } | null;
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

/** Palavras que não viram hashtag por não carregarem sentido sozinhas. */
const LIGACAO = new Set(["e", "de", "da", "do", "das", "dos", "em", "para", "a", "o"]);

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function comoHashtag(palavra: string): string {
  return semAcento(palavra).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Hashtags derivadas das marcações que a matéria já tem.
 *
 * A categoria vira uma hashtag por palavra significativa ("Saúde e Prevenção"
 * dá #saude e #prevencao) em vez de virar um amontoado colado, que ninguém
 * busca. Os animais entram no singular e no plural porque as duas formas são
 * pesquisadas.
 */
export function hashtags(m: MateriaSocial): string[] {
  const tags: string[] = [];

  for (const slug of m.animals ?? []) {
    const animal = animalPorSlug(slug);
    if (!animal) continue;
    tags.push(comoHashtag(animal.singular), comoHashtag(animal.nome));
  }

  if (m.categoria) {
    for (const palavra of m.categoria.name.split(/\s+/)) {
      if (LIGACAO.has(palavra.toLowerCase())) continue;
      const tag = comoHashtag(palavra);
      if (tag.length > 2) tags.push(tag);
    }
  }

  tags.push("pets", "universopet", "maestropet");

  // Sem repetição e sem exagero: passar de uma dúzia parece spam e o próprio
  // Instagram desconta o alcance.
  return [...new Set(tags)].slice(0, 12);
}

/**
 * Legenda montada a partir da própria matéria. Serve de ponto de partida:
 * o editor ajusta na Redação e o texto ajustado passa a valer no lugar deste.
 */
export function legendaPadrao(m: MateriaSocial): string {
  const partes = [m.title.trim()];
  if (m.dek?.trim()) partes.push(m.dek.trim());
  partes.push("Matéria completa no link da bio 🐾");
  partes.push(hashtags(m).map((t) => `#${t}`).join(" "));
  return partes.join("\n\n");
}

/** Endereço público da matéria, para colar no story ou no compartilhamento. */
export function enderecoDaMateria(slug: string): string {
  return `${SITE}/noticias/${slug}`;
}
