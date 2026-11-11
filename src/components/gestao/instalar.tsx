"use client";

import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone } from "lucide-react";

type Aviso = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * Instalação direto pelo site (sem loja de aplicativos).
 * No Android e no computador (Chrome e Edge) o navegador oferece a instalação; no iPhone é pelo menu Compartilhar.
 */
export default function Instalar() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    const pronto = (e: Event) => { e.preventDefault(); setAviso(e as Aviso); };
    const feito = () => { setInstalado(true); setAviso(null); };
    window.addEventListener("beforeinstallprompt", pronto);
    window.addEventListener("appinstalled", feito);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalado(true);
    return () => { window.removeEventListener("beforeinstallprompt", pronto); window.removeEventListener("appinstalled", feito); };
  }, []);

  return (
    <div className="gp-instalar">
      {aviso && !instalado && (
        <button className="gp-btn pri" onClick={async () => { await aviso.prompt(); await aviso.userChoice; setAviso(null); }}>
          <Download />Instalar agora
        </button>
      )}
      {instalado && <p className="gp-instalado">Já está instalado neste aparelho.</p>}
      <ol>
        <li>
          <Smartphone />
          <div><b>No celular</b><span>Android: abra o site no Chrome, toque nos três pontinhos e em “Instalar aplicativo”. iPhone: abra no Safari, toque em Compartilhar e em “Adicionar à Tela de Início”.</span></div>
        </li>
        <li>
          <Monitor />
          <div><b>No computador</b><span>Abra o site no Chrome ou no Edge e clique no ícone de instalar, no canto direito da barra de endereço. O sistema abre em uma janela própria.</span></div>
        </li>
      </ol>
    </div>
  );
}
