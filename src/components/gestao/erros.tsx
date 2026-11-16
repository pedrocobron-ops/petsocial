"use client";

import { useEffect, useState } from "react";
import { Selo } from "./marca";
import { instalarVigia, registrarErro } from "@/lib/gestao/erros-navegador";

/** Escuta erros soltos e promessas recusadas em todas as telas da Gestão (fica no layout de /gestao). */
export function VigiaDeErros() {
  useEffect(() => instalarVigia(), []);
  return null;
}

/**
 * Tela que aparece quando uma parte do aplicativo quebra (error.tsx). Registra o erro uma vez e oferece tentar de novo
 * ou voltar para Hoje. Sem detalhe técnico para a pessoa.
 */
export function TelaDeErro({ erro, tentar, inteira }: { erro: Error & { digest?: string }; tentar: () => void; inteira?: boolean }) {
  useEffect(() => { registrarErro(erro, "tela"); }, [erro]);
  return (
    <div className="g-vazio" role="alert" style={inteira ? { minHeight: "100dvh", alignContent: "center" } : { minHeight: "50vh", alignContent: "center" }}>
      <Selo tamanho={64} tom="suave" />
      <b>Opa, esta tela travou</b>
      <p>Nada do que você já salvou se perdeu. A equipe Maestro Pet já foi avisada. Tente de novo; se continuar, volte para Hoje.</p>
      <div className="g-fila" style={{ justifyContent: "center" }}>
        <button className="g-btn pri" onClick={() => tentar()}>Tentar de novo</button>
        {/* endereço inteiro (não Link): recarrega a página e sai de qualquer estado quebrado, mesmo quando a tela que quebrou é o Hoje */}
        <a className="g-btn sec" href="/gestao/app">Voltar para Hoje</a>
      </div>
    </div>
  );
}

/**
 * Só para os testes automáticos: com `?__erro_teste=tela|janela|promessa` na tela Hoje e o servidor com GESTAO_ERRO_TESTE=1,
 * provoca um erro de propósito. Sem a variável no servidor, não faz nada (a rota de conferência responde 404).
 */
export function ErroDeTeste() {
  const [quebrar, setQuebrar] = useState(false);
  useEffect(() => {
    const tipo = new URLSearchParams(location.search).get("__erro_teste");
    if (!tipo) return;
    let vivo = true;
    fetch("/api/gestao/erro-teste", { cache: "no-store" }).then((r) => {
      if (!vivo || !r.ok) return;
      if (tipo === "janela") setTimeout(() => { throw new Error("Erro de teste solto (pode ignorar)"); }, 0);
      else if (tipo === "promessa") void Promise.reject(new Error("Erro de teste em promessa (pode ignorar)"));
      else setQuebrar(true);
    }, () => undefined);
    return () => { vivo = false; };
  }, []);
  if (quebrar) throw new Error("Erro de teste da tela (pode ignorar)");
  return null;
}
