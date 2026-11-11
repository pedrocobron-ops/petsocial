"use client";

import Link from "next/link";

/**
 * Peças de painel: indicadores com ícone colorido, anel de progresso, linha de tendência e barras.
 * Tudo em SVG simples, sem biblioteca. Cores: pessego | menta | ceu | lilas | manteiga | rosa.
 */
export type Tom = "pessego" | "menta" | "ceu" | "lilas" | "manteiga" | "rosa";

/** Quadradinho colorido com um ícone dentro. */
export function Tile({ icone: Icone, tom = "menta", tamanho }: { icone: React.ComponentType<{ size?: number }>; tom?: Tom; tamanho?: "p" | "g" }) {
  return <span className={`g-tile ${tom}${tamanho ? ` ${tamanho}` : ""}`} aria-hidden><Icone /></span>;
}

/** Cartão de indicador: rótulo, número grande, linha de apoio e um desenho opcional à direita. */
export function Kpi({ rotulo, valor, apoio, icone, tom = "menta", href, lado }: {
  rotulo: string; valor: React.ReactNode; apoio?: React.ReactNode; icone: React.ComponentType<{ size?: number }>; tom?: Tom; href?: string; lado?: React.ReactNode;
}) {
  const dentro = (
    <>
      <div className="g-kpi-cab"><Tile icone={icone} tom={tom} /><span className="g-rotulo">{rotulo}</span></div>
      <div className="g-kpi-meio">
        <div style={{ minWidth: 0 }}>
          <p className="g-num">{valor}</p>
          {apoio != null && <p className="g-muted g-p g-kpi-apoio">{apoio}</p>}
        </div>
        {lado && <div className="g-kpi-lado">{lado}</div>}
      </div>
    </>
  );
  return href ? <Link href={href} className={`g-card g-kpi tom-${tom}`}>{dentro}</Link> : <div className={`g-card g-kpi tom-${tom}`}>{dentro}</div>;
}

/** Anel de progresso (0 a 1) com um texto no meio. */
export function Anel({ parte, tamanho = 64, cor = "var(--g-verde)", children }: { parte: number; tamanho?: number; cor?: string; children?: React.ReactNode }) {
  const r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, Number.isFinite(parte) ? parte : 0));
  return (
    <span className="g-anel" style={{ width: tamanho, height: tamanho }}>
      <svg viewBox="0 0 64 64" width={tamanho} height={tamanho} aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(31,27,23,.09)" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={cor} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform="rotate(-90 32 32)" style={{ transition: "stroke-dasharray .6s cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      {children != null && <b>{children}</b>}
    </span>
  );
}

/** Linha de tendência com área preenchida. */
export function Tendencia({ valores, cor = "#2f6b4c", largura = 104, altura = 44 }: { valores: number[]; cor?: string; largura?: number; altura?: number }) {
  if (valores.length < 2) return null;
  const max = Math.max(...valores, 1), passo = largura / (valores.length - 1);
  const pts = valores.map((v, i) => [i * passo, altura - 5 - (v / max) * (altura - 10)] as const);
  const linha = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [ux, uy] = pts[pts.length - 1];
  return (
    <svg className="g-tend" width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden>
      <path d={`${linha} L${largura} ${altura} L0 ${altura} Z`} fill={cor} opacity=".13" />
      <path d={linha} fill="none" stroke={cor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ux} cy={uy} r="3.4" fill={cor} stroke="#fffbf5" strokeWidth="1.6" />
    </svg>
  );
}

/** Barras verticais com rótulo embaixo e o valor em cima. `destaque` pinta uma delas de laranja. */
export function Barras({ itens, destaque, altura = 132, formato }: { itens: { rotulo: string; valor: number }[]; destaque?: number; altura?: number; formato?: (n: number) => string }) {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="g-colunas" style={{ height: altura }} role="img" aria-label={itens.map((i) => `${i.rotulo}: ${formato ? formato(i.valor) : i.valor}`).join(", ")}>
      {itens.map((i, n) => (
        <div key={n} className={n === destaque ? "hoje" : undefined}>
          <span className="v">{i.valor ? (formato ? formato(i.valor) : i.valor) : ""}</span>
          <i style={{ height: `${Math.max(i.valor ? 8 : 3, (i.valor / max) * 100)}%` }} />
          <span className="r">{i.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

/** Lista de barras deitadas (ranking), cada uma com a sua cor. */
export function Ranking({ itens, formato }: { itens: { rotulo: string; valor: number; cor?: string | null }[]; formato?: (n: number) => string }) {
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="g-ranking">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="g-fila entre" style={{ flexWrap: "nowrap" }}>
            <span className="n"><i style={{ background: i.cor ?? "var(--g-verde)" }} />{i.rotulo}</span>
            <b className="g-tab">{formato ? formato(i.valor) : i.valor}</b>
          </div>
          <div className="g-prog"><i style={{ width: `${(i.valor / max) * 100}%`, background: i.cor ?? "var(--g-verde)" }} /></div>
        </div>
      ))}
    </div>
  );
}

/** Rosca com fatias coloridas e um texto no meio. */
export function Rosca({ fatias, tamanho = 132, children }: { fatias: { valor: number; cor: string }[]; tamanho?: number; children?: React.ReactNode }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const r = 40, c = 2 * Math.PI * r;
  let andado = 0;
  return (
    <span className="g-anel" style={{ width: tamanho, height: tamanho }}>
      <svg viewBox="0 0 100 100" width={tamanho} height={tamanho} aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(31,27,23,.08)" strokeWidth="14" />
        {total > 0 && fatias.filter((f) => f.valor > 0).map((f, i) => {
          const parte = (f.valor / total) * c, inicio = andado;
          andado += parte;
          return <circle key={i} cx="50" cy="50" r={r} fill="none" stroke={f.cor} strokeWidth="14" strokeDasharray={`${Math.max(0, parte - 1.5)} ${c}`} strokeDashoffset={-inicio} transform="rotate(-90 50 50)" />;
        })}
      </svg>
      {children != null && <b>{children}</b>}
    </span>
  );
}
