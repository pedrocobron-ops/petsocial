"use client";

import { useRef } from "react";
import { BotaoMic, TEXTO_ERRO_VOZ, useDitado } from "./voz";

/**
 * Ditado em qualquer campo de texto livre (observações, alertas, diário, boletim…): um microfone pequeno no canto do campo.
 * Mesmo ditado do navegador que o Mozart usa (voz.tsx): pt-BR, o texto aparece enquanto a pessoa fala, para sozinho no
 * silêncio (pausa de 3 s) e depois de 60 s, nada vai para o nosso servidor. O que é falado entra DEPOIS do que já estava escrito, com um
 * espaço. Nunca envia nem salva sozinho. Navegador sem ditado: o campo fica igual, sem botão.
 *
 * Uso (o campo continua sendo do formulário; o componente só põe o botão e a linha "Ouvindo…"):
 *
 *   <CampoComVoz valor={nota} aoMudar={setNota} rotulo="Ditar a nota do boletim" maxLength={600}>
 *     <textarea className="g-textarea" value={nota} maxLength={600} onChange={(e) => setNota(e.target.value)} />
 *   </CampoComVoz>
 *
 * Props:
 * - `valor`: o texto atual do campo (o falado é somado a ele).
 * - `aoMudar(novo)`: recebe o texto inteiro (o de antes + o falado), a cada pedaço ouvido. Use o mesmo setter do onChange.
 * - `rotulo`: nome do botão para o leitor de tela. Padrão: "Ditar o texto".
 * - `maxLength`: corta o texto falado nesse tamanho (o mesmo do campo).
 * - `aoTerminar(texto)` (opcional): roda uma vez quando a pessoa para de falar e algo foi ouvido. Para campos que gravam
 *   ao sair (onBlur), como o diário: o foco não passa pelo campo quando a pessoa só fala.
 * - `children`: o <textarea> (ou <input>) do campo.
 *
 * Para pôr só o botão em outro lugar, use `BotaoDitado` com as mesmas props (sem `children`).
 */
export type PropsDitado = { valor: string; aoMudar: (novo: string) => void; rotulo?: string; maxLength?: number; aoTerminar?: (texto: string) => void };

function useDitadoDoCampo({ valor, aoMudar, maxLength, aoTerminar }: PropsDitado) {
  const atual = useRef(valor);
  atual.current = valor;
  const cortar = (t: string) => (maxLength ? t.slice(0, maxLength) : t);
  const ditado = useDitado((t) => aoMudar(cortar(t)), (t, falou) => { if (falou) { aoMudar(cortar(t)); aoTerminar?.(cortar(t)); } });
  return { ditado, jaEscrito: () => atual.current };
}

/** Linha embaixo do campo: "Ouvindo…" com a bolinha vermelha, ou o que deu errado. */
function Situacao({ ditado }: { ditado: ReturnType<typeof useDitado> }) {
  if (ditado.ouvindo) return <span className="g-ditado-faixa" role="status"><i className="g-voz-ponto" aria-hidden /><b>Ouvindo…</b> toque no microfone para parar</span>;
  if (ditado.erro) return <span className={`g-ditado-faixa${ditado.erro === "bloqueado" ? " erro" : ""}`} role="alert">{TEXTO_ERRO_VOZ[ditado.erro]}</span>;
  return null;
}

/** Só o botão do microfone (com a linha "Ouvindo…" logo depois). */
export function BotaoDitado(props: PropsDitado) {
  const { ditado, jaEscrito } = useDitadoDoCampo(props);
  if (!ditado.suportado) return null;
  return (
    <>
      <BotaoMic ditado={ditado} jaEscrito={jaEscrito} rotulo={props.rotulo ?? "Ditar o texto"} classe="g-ditado-mic" />
      <Situacao ditado={ditado} />
    </>
  );
}

/** O campo com o microfone no canto de baixo. */
export function CampoComVoz({ children, ...props }: PropsDitado & { children: React.ReactNode }) {
  const { ditado, jaEscrito } = useDitadoDoCampo(props);
  if (!ditado.suportado) return <>{children}</>;
  return (
    <div className={`g-ditado${ditado.ouvindo ? " ouvindo" : ""}`}>
      {children}
      <BotaoMic ditado={ditado} jaEscrito={jaEscrito} rotulo={props.rotulo ?? "Ditar o texto"} classe="g-ditado-mic" />
      <Situacao ditado={ditado} />
    </div>
  );
}
