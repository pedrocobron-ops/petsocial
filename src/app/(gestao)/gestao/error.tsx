"use client";

import TelaDeErroDaGestao from "./erro-comum";

/** Quebrou fora das telas do aplicativo (casca, entrada, link do cliente, página do tutor, painel). */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <TelaDeErroDaGestao error={error} reset={reset} inteira />;
}
