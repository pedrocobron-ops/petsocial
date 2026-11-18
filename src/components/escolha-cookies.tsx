"use client";

import { useEffect, useState } from "react";
import { EVENTO_COOKIES, escolherCookies, lerEscolhaCookies, type EscolhaCookies } from "@/components/meta-pixel";

/** Na política do site (parte 5): mostra a escolha deste navegador e deixa mudar a qualquer momento. */
export default function EscolhaDeCookies() {
  const [escolha, setEscolha] = useState<EscolhaCookies | "carregando">("carregando");
  useEffect(() => {
    setEscolha(lerEscolhaCookies());
    const mudou = (e: Event) => setEscolha((e as CustomEvent<EscolhaCookies>).detail);
    window.addEventListener(EVENTO_COOKIES, mudou);
    return () => window.removeEventListener(EVENTO_COOKIES, mudou);
  }, []);
  if (escolha === "carregando") return null;
  return (
    <p className="escolha-cookies" role="status">
      <span>
        {escolha === "recusado" ? "Neste navegador, você recusou os cookies de medição: o Pixel não manda nada daqui."
          : escolha === "aceito" ? "Neste navegador, você aceitou os cookies de medição."
          : "Neste navegador, você ainda não escolheu. Sem escolha, o Pixel funciona e você pode recusar quando quiser."}
      </span>{" "}
      {escolha === "recusado"
        ? <button type="button" onClick={() => escolherCookies("aceito")}>Aceitar os cookies de medição</button>
        : <button type="button" onClick={() => escolherCookies("recusado")}>Recusar os cookies de medição</button>}
    </p>
  );
}
