import { desenhoDoCodigo } from "@/lib/gestao/codigo-barras";

/**
 * Código de barras em SVG (EAN-13 quando o código tem 13 números válidos, senão Code 128), com os números embaixo.
 * As barras são retângulos em módulos (`data-x`, `data-w`): o SVG estica na largura da etiqueta e continua vetor no PDF.
 */
export function CodigoDeBarras({ codigo, className }: { codigo: string; className?: string }) {
  const d = desenhoDoCodigo(codigo);
  if (!d) return null;
  return (
    <div className={`g-et-barras${className ? ` ${className}` : ""}`} data-tipo={d.tipo} data-codigo={d.texto}>
      <svg viewBox={`0 0 ${d.largura} 40`} preserveAspectRatio="none" role="img" aria-label={`Código de barras ${d.texto}`} shapeRendering="crispEdges">
        <rect x={0} y={0} width={d.largura} height={40} fill="#fff" />
        {d.barras.map((b) => <rect key={b.x} x={b.x} y={0} width={b.w} height={40} fill="#000" />)}
      </svg>
      <span>{d.texto}</span>
    </div>
  );
}

/** Nome cortado na última palavra inteira que cabe, com reticências (a etiqueta pequena não tem espaço para o nome todo). */
export function nomeCurto(nome: string, max: number) {
  const t = nome.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco >= max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–-]+$/, "")}…`;
}
