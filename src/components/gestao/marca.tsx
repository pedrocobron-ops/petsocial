/**
 * Marca do Maestro Pet Gestão: rosto de border collie em traço, com uma orelha em pé e a outra dobrada.
 * `Marca` é só o desenho (usa a cor do texto). `Selo` é o desenho dentro de um quadrado arredondado.
 */
export function Marca({ tamanho = 24, className }: { tamanho?: number; className?: string }) {
  return (
    <svg className={className} width={tamanho} height={tamanho} viewBox="4.5 -0.5 120 120" fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M89 60 C89 77 80 95 60 106 C40 95 31 76 31 56 C27 42 25 26 27 13 C38 17 47 24 52 32 C57 30 63 30 68 32 C73 23 80 17 89 15 C99 18 104 30 101 47 C97 42 93 40 88 40" />
      <path d="M55.5 30.8 C56.5 52 52 70 43 82" />
      <path d="M64.5 30.8 C63.5 52 68 70 77 82" />
      <path d="M53 90 Q60 86 67 90 Q65 97 60 98 Q55 97 53 90 Z" fill="currentColor" strokeWidth={2} />
    </svg>
  );
}

export function Selo({ tamanho = 40, tom = "claro" }: { tamanho?: number; tom?: "claro" | "verde" | "suave" }) {
  return (
    <span className={`g-selo ${tom}`} style={{ width: tamanho, height: tamanho, borderRadius: Math.round(tamanho * 0.26) }} aria-hidden>
      <Marca tamanho={Math.round(tamanho * 0.74)} />
    </span>
  );
}
