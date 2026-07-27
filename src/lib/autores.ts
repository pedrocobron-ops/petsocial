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
      "Jornalista e editor à frente do Maestro Pet. Trabalha com produção de conteúdo e comunicação há anos e criou o jornal para reunir, em linguagem clara, informação confiável sobre o universo pet. Revisa pessoalmente cada matéria publicada, checando dados e fontes antes de o texto ir ao ar.",
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
