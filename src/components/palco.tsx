import Image from "next/image";

/**
 * Palco do objeto (brief 20, 6.8): a capa do guia sobre areia, inclinada, com sombra longa.
 * Na linha tutores leva a assinatura do Mozart (6.9). A imagem é o LCP: nunca entra com opacidade 0.
 */
export function Palco({ capa, alt, assinatura = true, prioridade = true }: { capa: string; alt: string; assinatura?: boolean; prioridade?: boolean }) {
  return (
    <div className={`palco${assinatura ? "" : " palco-so"}`}>
      <div className="palco-capa">
        <Image src={capa} alt={alt} width={420} height={594} priority={prioridade} sizes="(max-width: 899px) 45vw, 340px" />
      </div>
      {assinatura && <AssinaturaMozart />}
    </div>
  );
}

/** "Com o passo a passo do Mozart": rosto a 56 px, troca para o aceno quando o dedo toca o botão da dobra. */
export function AssinaturaMozart() {
  return (
    <span className="assinatura">
      <span className="assinatura-rosto" aria-hidden>
        <Image src="/mozart/sorrindo-112.webp" alt="" width={56} height={56} />
        <Image className="assinatura-aceno" src="/mozart/acenando-112.webp" alt="" width={56} height={56} />
      </span>
      <span>Com o passo a passo do Mozart</span>
    </span>
  );
}
