/** Ícones de linha desenhados à mão (seta e hambúrguer) e logos de pagamento em SVG inline. */

export function Seta({ tamanho = 18 }: { tamanho?: number }) {
  return (
    <svg className="seta" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Pix (marca do Banco Central): o losango de quatro pétalas em #32BCAD e o nome. Caixa recortada no desenho, para o símbolo ter ≈ 14 px como as outras bandeiras. */
export function LogoPix() {
  return (
    <svg viewBox="0 1.5 53 21" width="42" height="17" aria-hidden>
      <g fill="#32BCAD" transform="translate(11 12)">
        <path d="M-1.6-9.4a2.3 2.3 0 0 1 3.2 0l3.1 3.1-1.3 1.3a3.4 3.4 0 0 0-2.4 1L0-3a1.1 1.1 0 0 1-1.6 0l-1-1a3.4 3.4 0 0 0-2.4-1H-5l-1.7-1.7z" transform="translate(0.8 0)" />
        <path d="M-1.6 9.4a2.3 2.3 0 0 0 3.2 0l3.1-3.1-1.3-1.3a3.4 3.4 0 0 1-2.4-1L0 3a1.1 1.1 0 0 0-1.6 0l-1 1a3.4 3.4 0 0 1-2.4 1H-5l-1.7 1.7z" transform="translate(0.8 0)" />
        <path d="M-9.4-1.6a2.3 2.3 0 0 0 0 3.2l2.6 2.6h1.7a2.3 2.3 0 0 0 1.6-.7l1-1a2.2 2.2 0 0 1 1.6-.6V-1.9a2.2 2.2 0 0 1-1.6-.6l-1-1a2.3 2.3 0 0 0-1.6-.7h-1.7z" />
        <path d="M10.2-1.6a2.3 2.3 0 0 1 0 3.2L7.6 4.2H5.9a2.3 2.3 0 0 1-1.6-.7l-1-1a2.2 2.2 0 0 0-1.6-.6V-1.9a2.2 2.2 0 0 0 1.6-.6l1-1a2.3 2.3 0 0 1 1.6-.7h1.7z" />
      </g>
      <text x="25" y="17.5" fill="#32BCAD" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="16" letterSpacing="-.3">pix</text>
    </svg>
  );
}

export function LogoVisa() {
  return (
    <svg viewBox="0 0 48 16" width="38" height="13" aria-hidden>
      <text x="24" y="13.6" textAnchor="middle" fill="#1A1F71" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontStyle="italic" fontSize="16" letterSpacing="-.4">VISA</text>
    </svg>
  );
}

export function LogoMastercard() {
  return (
    <svg viewBox="0 0 32 20" width="30" height="19" aria-hidden>
      <circle cx="11" cy="10" r="8" fill="#EB001B" />
      <circle cx="21" cy="10" r="8" fill="#F79E1B" />
      <path d="M16 3.75a8 8 0 0 1 0 12.5 8 8 0 0 1 0-12.5z" fill="#FF5F00" />
    </svg>
  );
}

/** Elo: o nome em minúsculas, preto, como no selo da bandeira. */
export function LogoElo() {
  return (
    <svg viewBox="0 0 34 18" width="30" height="16" aria-hidden>
      <text x="17" y="14" textAnchor="middle" fill="#000" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="16" letterSpacing="-.3">elo</text>
    </svg>
  );
}
