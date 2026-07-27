/** Autores do jornal. A página /autor/[slug] usa estes dados (sinal de E-E-A-T
 *  para o Google: conteúdo com autoria identificada e verificável). */
export interface Autor {
  slug: string;
  nome: string;
  cargo: string;
  bio: string;
  foto?: string;
  email?: string;
}

export const AUTORES: Autor[] = [
  {
    slug: "pedro-amaral",
    nome: "Pedro Amaral",
    cargo: "Editor-chefe",
    bio:
      "Ator e produtor cultural de formação, tutor do Mozart e apaixonado por animais desde sempre. Não é veterinário, e faz questão de deixar isso claro: seu trabalho no Maestro Pet é o de editor. Apura cada tema junto a fontes especializadas, como publicações científicas, órgãos oficiais e profissionais da área, e traduz esse material em linguagem clara para quem vive com um animal em casa. Revisa pessoalmente todas as matérias antes da publicação e sinaliza, nos textos de saúde, que a informação não substitui a consulta com um médico-veterinário.",
    email: "contato@maestropet.com",
  },
];

export function autorPorNome(nome: string): Autor | undefined {
  const n = nome.trim().toLowerCase();
  return AUTORES.find((a) => a.nome.toLowerCase() === n);
}

export function autorPorSlug(slug: string): Autor | undefined {
  return AUTORES.find((a) => a.slug === slug);
}
