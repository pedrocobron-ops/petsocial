"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { guardarLembrado, lerLembrado } from "./lembrado";

/**
 * Falar em vez de escrever (Mozart e Ajuda), com o ditado que já vem no navegador (Chrome, Edge, Safari):
 * nenhum áudio passa pelo nosso servidor e não há serviço pago. Sem ditado no navegador (alguns Firefox),
 * o botão não aparece e a pessoa usa o microfone do teclado.
 * - Segurar e soltar (celular) ou tocar para começar e tocar para parar.
 * - O texto aparece na caixa enquanto a pessoa fala; para sozinho no silêncio e depois de 30 s.
 */

type Resultado = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type Reconhecedor = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<Resultado> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
function classeDoDitado(): (new () => Reconhecedor) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Tempo máximo de uma fala. */
export const MAXIMO_MS = 30_000;
/** Sem ouvir nada por este tempo, para (o navegador às vezes não para sozinho). */
const SILENCIO_MS = 8_000;
/** Segurou o botão por mais que isso: ao soltar, para de ouvir (segurar para falar). Menos: foi um toque. */
const SEGURAR_MS = 450;

export type ErroVoz = "bloqueado" | "sem-fala" | "sem-microfone" | "sem-internet" | "falhou";
export const TEXTO_ERRO_VOZ: Record<ErroVoz, string> = {
  bloqueado: "O microfone está bloqueado. Libere o microfone nas configurações do navegador e toque nele de novo.",
  "sem-fala": "Não ouvi nada. Toque no microfone e fale de novo.",
  "sem-microfone": "Não achei um microfone neste aparelho.",
  "sem-internet": "O ditado do navegador precisa de internet. Confira a conexão ou escreva.",
  falhou: "O microfone parou. Tente de novo ou escreva.",
};
function erroDoNavegador(codigo: string): ErroVoz | null {
  if (codigo === "aborted") return null;
  if (codigo === "not-allowed" || codigo === "service-not-allowed") return "bloqueado";
  if (codigo === "no-speech") return "sem-fala";
  if (codigo === "audio-capture") return "sem-microfone";
  if (codigo === "network") return "sem-internet";
  return "falhou";
}

/**
 * O ditado. `aoOuvir` recebe o texto (o que já estava na caixa + o que está sendo falado) a cada pedaço;
 * `aoTerminar` recebe o texto final e se a pessoa falou alguma coisa.
 */
export function useDitado(aoOuvir: (texto: string) => void, aoTerminar: (texto: string, falou: boolean) => void) {
  const [suportado, setSuportado] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [erro, setErro] = useState<ErroVoz | null>(null);
  const rec = useRef<Reconhecedor | null>(null);
  const relogios = useRef<number[]>([]);
  const silencio = useRef<number | undefined>(undefined);
  const avisos = useRef({ aoOuvir, aoTerminar });
  avisos.current = { aoOuvir, aoTerminar };

  const limparRelogios = () => { relogios.current.forEach((t) => window.clearTimeout(t)); relogios.current = []; window.clearTimeout(silencio.current); };

  useEffect(() => {
    setSuportado(Boolean(classeDoDitado()));
    return () => {
      limparRelogios();
      const r = rec.current;
      rec.current = null;
      if (r) { r.onend = null; r.onresult = null; r.onerror = null; try { r.abort(); } catch { /* já parou */ } }
    };
  }, []);

  const parar = useCallback(() => { try { rec.current?.stop(); } catch { /* já parou */ } }, []);

  const comecar = useCallback((jaEscrito: string) => {
    if (rec.current) return;
    const Classe = classeDoDitado();
    if (!Classe) return;
    pararDeFalar(); // o Mozart lendo em voz alta não pode virar o pedido
    let r: Reconhecedor;
    try { r = new Classe(); } catch { setErro("falhou"); return; }
    const antes = jaEscrito.trim() ? `${jaEscrito.trim()} ` : "";
    let dito = "";
    let errou: ErroVoz | null = null;
    const vigiarSilencio = () => { window.clearTimeout(silencio.current); silencio.current = window.setTimeout(() => { try { r.stop(); } catch { /* já parou */ } }, SILENCIO_MS); };
    r.lang = "pt-BR"; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0]?.transcript ?? "";
      dito = t.replace(/\s+/g, " ").trim();
      avisos.current.aoOuvir(antes + dito);
      vigiarSilencio();
    };
    r.onerror = (e) => { const x = erroDoNavegador(e.error); if (x) { errou = x; setErro(x); } };
    r.onend = () => {
      limparRelogios();
      if (rec.current === r) rec.current = null;
      setOuvindo(false);
      if (!dito && !errou) setErro("sem-fala");
      avisos.current.aoTerminar(dito ? antes + dito : jaEscrito, Boolean(dito));
    };
    rec.current = r;
    setErro(null);
    try { r.start(); } catch { rec.current = null; setErro("falhou"); return; }
    setOuvindo(true);
    relogios.current.push(window.setTimeout(() => { try { r.stop(); } catch { /* já parou */ } }, MAXIMO_MS));
    vigiarSilencio();
  }, []);

  const estaOuvindo = useCallback(() => rec.current !== null, []);
  const limparErro = useCallback(() => setErro(null), []);
  return { suportado, ouvindo, erro, comecar, parar, estaOuvindo, limparErro };
}

type Ditado = ReturnType<typeof useDitado>;

/**
 * Botão grande do microfone. Toque: começa; outro toque: para. Segurar: ouve enquanto o dedo está no botão.
 * Pelo teclado (Enter ou espaço) funciona como toque.
 */
export function BotaoMic({ ditado, jaEscrito, antesDeComecar, rotulo, classe }: {
  ditado: Ditado; jaEscrito: () => string; antesDeComecar?: () => void;
  /** Nome para o leitor de tela, ex.: "Ditar a observação". Sem ele: "Falar: toque para começar ou segure enquanto fala". */
  rotulo?: string;
  /** Classe a mais no botão (ex.: "g-ditado-mic", o botão pequeno dos campos). */
  classe?: string;
}) {
  const inicio = useRef(0);
  const acao = useRef<"comecou" | "parou" | null>(null);
  const comecar = () => { antesDeComecar?.(); ditado.comecar(jaEscrito()); };
  return (
    <button type="button" className={`${classe ?? "g-mic voz"}${ditado.ouvindo ? " ouvindo" : ""}`}
      aria-label={ditado.ouvindo ? "Parar de ouvir" : rotulo ?? "Falar: toque para começar ou segure enquanto fala"}
      aria-pressed={ditado.ouvindo}
      title={ditado.ouvindo ? "Parar" : "Falar (toque ou segure)"}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault(); // não tira o foco nem seleciona texto no toque longo
        if (ditado.estaOuvindo()) { acao.current = "parou"; ditado.parar(); return; }
        acao.current = "comecou";
        inicio.current = Date.now();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sem captura: segue */ }
        comecar();
      }}
      onPointerUp={() => {
        const segurou = acao.current === "comecou" && Date.now() - inicio.current >= SEGURAR_MS;
        acao.current = null;
        if (segurou) ditado.parar();
      }}
      onPointerCancel={() => { if (acao.current === "comecou" && Date.now() - inicio.current >= SEGURAR_MS) ditado.parar(); acao.current = null; }}
      onClick={(e) => {
        // o toque já foi tratado no pointerdown; só o teclado chega aqui com detail 0
        if (e.detail !== 0) return;
        if (ditado.estaOuvindo()) ditado.parar(); else comecar();
      }}
      onContextMenu={(e) => e.preventDefault()}>
      {ditado.ouvindo ? <Square /> : <Mic />}
    </button>
  );
}

/** Linha acima da caixa: "Ouvindo…" com a bolinha vermelha, ou a ajuda quando o microfone falhou. */
export function FaixaVoz({ ditado, children }: { ditado: Ditado; children?: React.ReactNode }) {
  if (ditado.ouvindo) {
    return (
      <div className="g-voz-faixa ouvindo" role="status">
        <i className="g-voz-ponto" aria-hidden />
        <b>Ouvindo…</b>
        <span>Fale do seu jeito. Para sozinho quando você parar de falar.</span>
      </div>
    );
  }
  if (children) return <div className="g-voz-faixa" role="status">{children}</div>;
  if (ditado.erro) {
    return (
      <div className={`g-voz-faixa${ditado.erro === "bloqueado" ? " erro" : ""}`} role="alert">
        <span>{TEXTO_ERRO_VOZ[ditado.erro]}</span>
        <button type="button" className="g-link" onClick={ditado.limparErro}>Fechar</button>
      </div>
    );
  }
  return null;
}

/* ---------- ler em voz alta ---------- */

export const temLeitura = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";

export function pararDeFalar() {
  try { if (temLeitura()) window.speechSynthesis.cancel(); } catch { /* sem leitura */ }
}

/** Lê um texto em português. `aoAcabar` roda quando termina ou é interrompido. */
export function falar(texto: string, aoAcabar?: () => void) {
  if (!temLeitura() || !texto.trim()) { aoAcabar?.(); return; }
  try {
    const s = window.speechSynthesis;
    s.cancel();
    const u = new SpeechSynthesisUtterance(texto.replace(/R\$\s?/g, "R$ "));
    u.lang = "pt-BR";
    const voz = s.getVoices().find((v) => v.lang === "pt-BR") ?? s.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
    if (voz) u.voice = voz;
    u.onend = () => aoAcabar?.();
    u.onerror = () => aoAcabar?.();
    s.speak(u);
  } catch { aoAcabar?.(); }
}

/* ---------- preferências (no aparelho) ---------- */

const CHAVE_AUTO = "gestao:voz:enviar-sozinho";
const CHAVE_LER = "gestao:voz:ler-respostas";
/** "Enviar sozinho depois de falar": ligado se nunca mexeu. */
export const lerEnviarSozinho = () => lerLembrado(CHAVE_AUTO) !== "0";
export const guardarEnviarSozinho = (sim: boolean) => guardarLembrado(CHAVE_AUTO, sim ? "1" : "0");
/** "Ler as respostas em voz alta": desligado se nunca mexeu. */
export const lerLerRespostas = () => lerLembrado(CHAVE_LER) === "1";
export const guardarLerRespostas = (sim: boolean) => guardarLembrado(CHAVE_LER, sim ? "1" : "0");
