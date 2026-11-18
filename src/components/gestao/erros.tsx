"use client";

import { useEffect, useState } from "react";
import { Selo } from "./marca";
import { WifiOff } from "lucide-react";
import { instalarVigia, registrarErro } from "@/lib/gestao/erros-navegador";
import { ehFaltaDeInternet } from "@/lib/gestao/desenho";

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
  // sem internet (ou a tela seguinte não baixou): a tela diz o que houve, em vez de "travou". O registro continua igual
  // (sem conexão ele só conta; com conexão, um pedaço que não baixa aparece no painel de erros).
  const [semRede] = useState(() => ehFaltaDeInternet(erro, typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => { registrarErro(erro, "tela"); }, [erro]);
  // a internet voltou: tenta de novo sozinho, uma vez
  useEffect(() => {
    if (!semRede) return;
    const voltou = () => window.location.reload();
    window.addEventListener("online", voltou);
    return () => window.removeEventListener("online", voltou);
  }, [semRede]);
  if (semRede) {
    return (
      <div className="g-vazio" role="alert" data-teste="sem-internet" style={inteira ? { minHeight: "100dvh", alignContent: "center" } : { minHeight: "50vh", alignContent: "center" }}>
        <span className="g-sem-rede-ico" aria-hidden><WifiOff /></span>
        <b>Sem internet agora</b>
        <p>Esta tela não chegou a abrir porque a conexão caiu ou está muito fraca. Nada do que você já salvou se perdeu. Quando a internet voltar, toque em Tentar de novo.</p>
        <div className="g-fila" style={{ justifyContent: "center" }}>
          {/* recarrega a página: baixa de novo o que faltou */}
          <button className="g-btn pri" onClick={() => window.location.reload()}>Tentar de novo</button>
        </div>
      </div>
    );
  }
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
  const [quebrar, setQuebrar] = useState<false | "tela" | "pedaco">(false);
  useEffect(() => {
    const tipo = new URLSearchParams(location.search).get("__erro_teste");
    if (!tipo) return;
    let vivo = true;
    fetch("/api/gestao/erro-teste", { cache: "no-store" }).then((r) => {
      if (!vivo || !r.ok) return;
      if (tipo === "janela") setTimeout(() => { throw new Error("Erro de teste solto (pode ignorar)"); }, 0);
      else if (tipo === "promessa") void Promise.reject(new Error("Erro de teste em promessa (pode ignorar)"));
      else if (tipo === "pedaco") setQuebrar("pedaco");
      else setQuebrar("tela");
    }, () => undefined);
    return () => { vivo = false; };
  }, []);
  // "pedaco": o mesmo erro que o navegador dá quando a tela seguinte não baixa (sem internet)
  if (quebrar === "pedaco") throw Object.assign(new Error("Loading chunk 123 failed. (teste, pode ignorar)"), { name: "ChunkLoadError" });
  if (quebrar) throw new Error("Erro de teste da tela (pode ignorar)");
  return null;
}
