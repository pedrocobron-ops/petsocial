"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import "./loja.css";

/**
 * Leitor de código de barras pela câmera do aparelho, com o BarcodeDetector do próprio navegador (sem biblioteca).
 * Onde o navegador não tem essa função, o botão simplesmente não aparece: leitor USB ou Bluetooth e digitação seguem valendo.
 */
type Detector = { detect: (fonte: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type ClasseDetector = { new (o?: { formats?: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };
const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

function classeDoDetector(): ClasseDetector | null {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  return (window as unknown as { BarcodeDetector?: ClasseDetector }).BarcodeDetector ?? null;
}

/** Botão "Ler com a câmera". `continuo`: segue lendo um produto atrás do outro até a pessoa fechar. */
export function LerComCamera({ aoLer, continuo, className = "g-btn sec p" }: { aoLer: (codigo: string) => void; continuo?: boolean; className?: string }) {
  const [tem, setTem] = useState(false);
  const [aberta, setAberta] = useState(false);
  useEffect(() => { setTem(Boolean(classeDoDetector())); }, []);
  if (!tem) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setAberta(true)} aria-expanded={aberta}><Camera /> Ler com a câmera</button>
      {aberta && <Visor aoLer={(c) => { aoLer(c); if (!continuo) setAberta(false); }} aoFechar={() => setAberta(false)} continuo={continuo} />}
    </>
  );
}

function Visor({ aoLer, aoFechar, continuo }: { aoLer: (codigo: string) => void; aoFechar: () => void; continuo?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lido, setLido] = useState<string | null>(null);
  const ler = useRef(aoLer);
  ler.current = aoLer;

  useEffect(() => {
    let vivo = true;
    let fluxo: MediaStream | null = null;
    let relogio: ReturnType<typeof setInterval> | null = null;
    let ultimo = "", quando = 0, ocupado = false;
    (async () => {
      try {
        const Classe = classeDoDetector();
        if (!Classe) throw new Error("sem leitor");
        const aceitos = (await Classe.getSupportedFormats?.().catch(() => null)) ?? FORMATOS;
        const formatos = FORMATOS.filter((f) => aceitos.includes(f));
        const detector = new Classe(formatos.length ? { formats: formatos } : undefined);
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!vivo || !video.current) { fluxo.getTracks().forEach((t) => t.stop()); return; }
        video.current.srcObject = fluxo;
        await video.current.play().catch(() => undefined);
        relogio = setInterval(async () => {
          if (ocupado || !video.current || video.current.readyState < 2) return;
          ocupado = true;
          try {
            const codigo = (await detector.detect(video.current))[0]?.rawValue?.trim();
            // o mesmo código parado na frente da câmera só conta de novo depois de dois segundos
            if (codigo && vivo && (codigo !== ultimo || Date.now() - quando > 2000)) {
              ultimo = codigo; quando = Date.now();
              setLido(codigo);
              ler.current(codigo);
            }
          } catch { /* quadro que não deu para ler: tenta no próximo */ } finally { ocupado = false; }
        }, 300);
      } catch (e) {
        if (!vivo) return;
        const nome = e instanceof Error ? e.name : "";
        setErro(nome === "NotAllowedError" ? "A câmera está bloqueada para este site. Libere nas permissões do navegador ou digite o código."
          : "Não consegui abrir a câmera deste aparelho. Digite o código ou use um leitor.");
      }
    })();
    return () => {
      vivo = false;
      if (relogio) clearInterval(relogio);
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="g-lj-visor" role="group" aria-label="Leitor pela câmera">
      {erro ? <p className="g-pp g-vermelho-t" role="alert">{erro}</p> : (
        <>
          <video ref={video} playsInline muted />
          <p className="g-pp g-muted" role="status">{lido ? `Li ${lido}.${continuo ? " Pode passar o próximo." : ""}` : "Aponte a câmera para o código de barras."}</p>
        </>
      )}
      <button type="button" className="g-btn fantasma p" onClick={aoFechar}><X /> Fechar a câmera</button>
    </div>
  );
}
