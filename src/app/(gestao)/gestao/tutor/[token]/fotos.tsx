"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";

/**
 * As fotos da página do tutor. Cada uma vem do servidor (/gestao/tutor/<código>/foto/<id>), que confere o link a cada foto.
 * Se alguma não carregar, a foto vira um ícone e o aviso do topo aparece (AvisoDasFotos).
 */
const EVENTO = "g-tt-foto-falhou";

export function FotoDoTutor({ src, alt, abrir }: { src: string; alt: string; abrir: string }) {
  const img = useRef<HTMLImageElement>(null);
  const [falhou, setFalhou] = useState(false);
  const marcar = () => { setFalhou(true); (window as unknown as Record<string, boolean>)[EVENTO] = true; window.dispatchEvent(new Event(EVENTO)); };
  // o erro pode ter acontecido antes de a página ficar pronta
  useEffect(() => { const i = img.current; if (i && i.complete && i.naturalWidth === 0) marcar(); }, []);
  if (falhou) return <span className="sem" role="img" aria-label="Foto que não carregou"><Camera aria-hidden /></span>;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" aria-label={abrir}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src={src} alt={alt} loading="lazy" decoding="async" onError={marcar} />
    </a>
  );
}

export function AvisoDasFotos() {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => {
    if ((window as unknown as Record<string, boolean>)[EVENTO]) setFalhou(true);
    const f = () => setFalhou(true);
    window.addEventListener(EVENTO, f);
    return () => window.removeEventListener(EVENTO, f);
  }, []);
  if (!falhou) return null;
  return (
    <p className="g-tt-aviso" role="status">
      As fotos não carregaram agora. Espere um pouco e abra a página de novo. Se continuar, avise o pet shop.
      <button type="button" onClick={() => window.location.reload()}>Abrir de novo</button>
    </p>
  );
}
