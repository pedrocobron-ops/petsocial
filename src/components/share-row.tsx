"use client";

import { useState } from "react";

/** Botões de compartilhamento (WhatsApp em primeiro — Brasil ❤️). */
export default function ShareRow({ url, title }: { url: string; title: string }) {
  const [copiado, setCopiado] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  }

  return (
    <div className="share-row">
      <a
        href={`https://api.whatsapp.com/send?text=${t}%20${u}`}
        target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no WhatsApp"
      >
        💬 WhatsApp
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${u}`}
        target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no Facebook"
      >
        👍 Facebook
      </a>
      <a
        href={`https://twitter.com/intent/tweet?url=${u}&text=${t}`}
        target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no X"
      >
        🐦 X
      </a>
      <button onClick={copiar} aria-label="Copiar link">
        {copiado ? "✅ Copiado!" : "🔗 Copiar link"}
      </button>
    </div>
  );
}
