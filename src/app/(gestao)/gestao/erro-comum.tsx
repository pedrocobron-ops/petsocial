"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { TelaDeErro } from "@/components/gestao/erros";

/** Tentar de novo: busca a tela no servidor outra vez e refaz a parte que quebrou. */
export default function TelaDeErroDaGestao({ error, reset, inteira }: { error: Error & { digest?: string }; reset: () => void; inteira?: boolean }) {
  const router = useRouter();
  const tentar = () => startTransition(() => { router.refresh(); reset(); });
  return <TelaDeErro erro={error} tentar={tentar} inteira={inteira} />;
}
