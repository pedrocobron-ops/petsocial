"use client";

import TelaDeErroDaGestao from "../erro-comum";

/** Uma tela do aplicativo quebrou: o menu continua e a pessoa pode tentar de novo ou voltar para Hoje. */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <TelaDeErroDaGestao error={error} reset={reset} />;
}
