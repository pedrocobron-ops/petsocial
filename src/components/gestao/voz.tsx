"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { criarJuntaFrases, dividirEmFrases, juntarFala, juntarPedacos, melhorVoz, nomeDaVoz, textoParaFalar, vozesEmPortugues } from "@/lib/gestao/fala";
import { guardarLembrado, lerLembrado } from "./lembrado";

/**
 * Falar em vez de escrever (Mozart e Ajuda), com o ditado que já vem no navegador (Chrome, Edge, Safari):
 * nenhum áudio passa pelo nosso servidor e não há serviço pago. Sem ditado no navegador (alguns Firefox),
 * o botão não aparece e a pessoa usa o microfone do teclado.
 * - Segurar e soltar (celular) ou tocar para começar e tocar para parar.
 * - O texto aparece na caixa enquanto a pessoa fala; para sozinho depois de uma pausa de 3 s (respirar ou pensar não
 *   corta a fala) e depois de 60 s. Se o navegador encerrar a escuta antes disso, ela recomeça sem perder o que já foi dito.
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
export const MAXIMO_MS = 60_000;
/** Depois de começar a falar, esta pausa encerra a fala (respirar ou pensar um pouco não corta). */
export const PAUSA_MS = 3_000;
/** Sem ouvir nada desde o toque no microfone, para por este tempo. */
const SEM_FALA_MS = 8_000;
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

  /** Encerra a fala de agora (toque no botão, soltar o botão, pausa longa ou tempo máximo). */
  const pararAgora = useRef<() => void>(() => {});
  const parar = useCallback(() => pararAgora.current(), []);

  const comecar = useCallback((jaEscrito: string) => {
    if (rec.current) return;
    const Classe = classeDoDitado();
    if (!Classe) return;
    pararDeFalar(); // o Mozart lendo em voz alta não pode virar o pedido
    const antes = jaEscrito.trim() ? `${jaEscrito.trim()} ` : "";
    const inicio = Date.now();
    // escuta contínua: o navegador não encerra na primeira pausa; quem decide o fim é a pausa de PAUSA_MS. Se ele encerrar
    // sozinho (o Android faz isso), uma escuta nova continua a mesma fala: `guardado` é o que veio das escutas anteriores.
    let guardado = "";
    let sessao = "";
    let falou = false;
    let errou: ErroVoz | null = null;
    let encerrando = false;
    let terminou = false;
    let atual: Reconhecedor | null = null;
    const texto = () => juntarFala(guardado, sessao);
    const terminar = () => {
      if (terminou) return;
      terminou = true;
      limparRelogios();
      rec.current = null;
      setOuvindo(false);
      const dito = texto();
      if (!dito && !errou) setErro("sem-fala");
      avisos.current.aoTerminar(dito ? antes + dito : jaEscrito, Boolean(dito));
    };
    const encerrar = () => {
      encerrando = true;
      try { atual?.stop(); } catch { terminar(); }
    };
    pararAgora.current = encerrar;
    const vigiar = () => { window.clearTimeout(silencio.current); silencio.current = window.setTimeout(encerrar, falou ? PAUSA_MS : SEM_FALA_MS); };
    const abrir = (): boolean => {
      let r: Reconhecedor;
      try { r = new Classe(); } catch { return false; }
      r.lang = "pt-BR"; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
      r.onresult = (e) => {
        const pedacos: string[] = [];
        for (let i = 0; i < e.results.length; i++) pedacos.push(e.results[i][0]?.transcript ?? "");
        sessao = juntarPedacos(pedacos);
        if (sessao) falou = true;
        avisos.current.aoOuvir(antes + texto());
        vigiar();
      };
      r.onerror = (e) => {
        const x = erroDoNavegador(e.error);
        // "não ouvi nada" depois que a pessoa já falou é só o fim da fala, não um erro
        if (x === "sem-fala" && falou) { encerrando = true; return; }
        if (x) { errou = x; setErro(x); }
      };
      r.onend = () => {
        guardado = texto();
        sessao = "";
        if (!encerrando && !errou && !terminou && Date.now() - inicio < MAXIMO_MS - 1_000 && abrir()) return;
        terminar();
      };
      try { r.start(); } catch { return false; }
      atual = r;
      rec.current = r;
      return true;
    };
    setErro(null);
    if (!abrir()) { setErro("falhou"); return; }
    setOuvindo(true);
    relogios.current.push(window.setTimeout(encerrar, MAXIMO_MS));
    vigiar();
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

/** Um pouco mais rápido que o normal: a voz padrão soa arrastada lendo frases curtas. */
const VELOCIDADE = 1.05;
const CHAVE_VOZ = "gestao:voz:voz";
/** A voz escolhida em "Voz" (voiceURI); vazio: a melhor do aparelho. */
export const lerVozEscolhida = () => lerLembrado(CHAVE_VOZ) || "";
export const guardarVozEscolhida = (id: string) => guardarLembrado(CHAVE_VOZ, id);

function vozesDoAparelho(): SpeechSynthesisVoice[] {
  try { return temLeitura() ? window.speechSynthesis.getVoices() ?? [] : []; } catch { return []; }
}

/**
 * As vozes em português do aparelho (melhor primeiro). Elas carregam depois da página em muitos navegadores (evento
 * voiceschanged; o Safari às vezes nem avisa, então confere de novo algumas vezes). `total`: quantas vozes o aparelho
 * tem em qualquer idioma (0 pode ser só que ainda não carregou).
 */
export function useVozes() {
  const [vozes, setVozes] = useState<{ pt: SpeechSynthesisVoice[]; total: number }>({ pt: [], total: 0 });
  useEffect(() => {
    if (!temLeitura()) return;
    const ler = () => { const todas = vozesDoAparelho(); setVozes({ pt: vozesEmPortugues(todas), total: todas.length }); };
    ler();
    const s = window.speechSynthesis;
    try { s.addEventListener?.("voiceschanged", ler); } catch { /* navegador antigo */ }
    const relogios = [250, 1000, 3000].map((ms) => window.setTimeout(ler, ms));
    return () => { relogios.forEach((t) => window.clearTimeout(t)); try { s.removeEventListener?.("voiceschanged", ler); } catch { /* segue */ } };
  }, []);
  return vozes;
}

/** Cada leitura tem um número: parar (ou começar outra) faz a de antes não falar mais nada. */
let leitura = 0;

export function pararDeFalar() {
  leitura++;
  try { if (temLeitura()) window.speechSynthesis.cancel(); } catch { /* sem leitura */ }
}

/** O aviso de quando o aparelho não tem voz para ler (o navegador fica mudo, sem erro). */
export const SEM_VOZ = "Este aparelho não tem voz instalada para ler em voz alta. Em Ajustes da voz (o botão no alto da conversa) tem o passo a passo para instalar uma voz em português.";

/** Uma leitura: fala frases em fila (o navegador enfileira), avisa uma vez quando acabou ou foi interrompida. */
function novaLeitura(aoAcabar?: () => void, voz?: string | null, aoComecar?: () => void) {
  pararDeFalar();
  const minha = leitura;
  let faltam = 0, fechou = false, avisou = false;
  const escolhida = melhorVoz(vozesDoAparelho(), voz ?? lerVozEscolhida());
  const avisar = () => { if (!avisou) { avisou = true; aoAcabar?.(); } };
  const conferir = () => { if (leitura !== minha || (fechou && faltam === 0)) avisar(); };
  return {
    falar(frases: string[]) {
      if (leitura !== minha || !temLeitura()) return;
      for (const f of frases) {
        try {
          const u = new SpeechSynthesisUtterance(f);
          u.lang = escolhida?.lang?.replace(/_/g, "-") || "pt-BR";
          if (escolhida) { try { u.voice = escolhida; } catch { /* voz que sumiu: fica a do idioma */ } }
          u.rate = VELOCIDADE;
          if (aoComecar) u.onstart = () => aoComecar();
          faltam++;
          const fim = () => { faltam--; conferir(); };
          u.onend = fim;
          u.onerror = fim;
          window.speechSynthesis.speak(u);
        } catch { /* segue com a próxima */ }
      }
    },
    terminar() { fechou = true; conferir(); },
  };
}

/**
 * Lê um texto em português, frase por frase. `aoAcabar` roda quando termina ou é interrompido; `aoComecar`, quando a voz
 * começa de verdade (sem ele chegar, o aparelho não tem voz: a tela avisa).
 */
export function falar(texto: string, aoAcabar?: () => void, voz?: string | null, aoComecar?: () => void) {
  const frases = dividirEmFrases(textoParaFalar(texto));
  if (!temLeitura() || !frases.length) { aoAcabar?.(); return; }
  const l = novaLeitura(aoAcabar, voz, aoComecar);
  l.falar(frases);
  l.terminar();
}

/**
 * Lê enquanto o texto chega: cada frase começa a ser falada assim que fecha, sem esperar a resposta inteira.
 * `acrescentar(pedaço)` a cada pedaço; `terminar()` no fim (fala o que sobrou).
 */
export function falarAosPoucos(aoAcabar?: () => void) {
  if (!temLeitura()) return { acrescentar: () => {}, terminar: () => aoAcabar?.() };
  const l = novaLeitura(aoAcabar);
  const junta = criarJuntaFrases();
  return {
    acrescentar(pedaco: string) { l.falar(junta.acrescentar(pedaco)); },
    terminar() { l.falar(junta.terminar()); l.terminar(); },
  };
}

/** Frase de exemplo de "Ouvir exemplo" (com valor, hora e data, que é o que mais aparece). */
export const EXEMPLO_DE_VOZ = "Oi! Eu sou o Mozart. Marquei o banho do Thor para sexta, 20/11, às 10h30, por R$ 60,00.";

/** "Voz": as vozes em português do aparelho, com "Ouvir exemplo". Sem nenhuma, a dica de como instalar. */
export function EscolherVoz({ vozes }: { vozes: ReturnType<typeof useVozes> }) {
  const [id, setId] = useState(lerVozEscolhida);
  if (!vozes.pt.length) {
    if (!vozes.total) return <p className="g-ass-voz-dica" role="note">Não achei nenhuma voz neste aparelho para ler as respostas. No celular, instale os dados de voz em português (Android: Configurações, Idioma, Saída de texto em voz; iPhone: Ajustes, Acessibilidade, Conteúdo falado, Vozes). No computador, o Edge já vem com vozes.</p>;
    return (
      <p className="g-ass-voz-dica" role="note">
        Este aparelho não tem voz em português para ler as respostas. Para instalar: no Windows, Configurações, Hora e idioma, Fala,
        Adicionar vozes, Português (Brasil); no Android, Configurações, Idioma, Saída de texto em voz (instale os dados de voz em português);
        no iPhone, Ajustes, Acessibilidade, Conteúdo falado, Vozes, Português (Brasil). Ou use o Edge, que já vem com vozes naturais.
      </p>
    );
  }
  return (
    <div className="g-ass-voz">
      <label>
        <span>Voz</span>
        <select className="g-input" value={id} onChange={(e) => { setId(e.target.value); guardarVozEscolhida(e.target.value); }} aria-label="Voz do Mozart">
          <option value="">Automática (a melhor deste aparelho)</option>
          {vozes.pt.map((v) => <option key={v.voiceURI || v.name} value={v.voiceURI || v.name}>{nomeDaVoz(v)}</option>)}
        </select>
      </label>
      <button type="button" className="g-btn sec p" onClick={() => falar(EXEMPLO_DE_VOZ, undefined, id)}><Volume2 />Ouvir exemplo</button>
    </div>
  );
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
