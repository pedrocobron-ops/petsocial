/* eslint-disable @next/next/no-img-element */

/**
 * Logo oficial do Maestro Pet (brief 20, 5.1): rosto do Mozart + "MaestroPet".
 * SVG com o wordmark em curvas e o rosto recortado do PNG oficial. Nunca monograma, nunca recorte circular.
 * `clara` é a variante para fundo escuro; `negocios` acrescenta o sufixo da linha.
 */
export default function Logo({ clara = false, negocios = false, prioridade = false }: { clara?: boolean; negocios?: boolean; prioridade?: boolean }) {
  return (
    <span className="logo-marca">
      <img
        src={clara ? "/marca/logo-clara.svg" : "/marca/logo.svg"}
        alt="Maestro Pet"
        width={1020}
        height={188}
        fetchPriority={prioridade ? "high" : undefined}
        decoding="async"
      />
      {negocios && <span className="logo-sufixo">Negócios</span>}
    </span>
  );
}
