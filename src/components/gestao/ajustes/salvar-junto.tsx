"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useAvisos } from "../ui";

/**
 * Um botão só para os cartões de opções de um grupo (ex.: Opções da creche, Cuidado com o tutor e Mais opções da creche).
 * Cada cartão diz se mudou e como se salva; a barra no pé do grupo mostra o que mudou e salva tudo de uma vez, na ordem dos cartões.
 * Com algo mudado e sem salvar, sair da tela (recarregar, fechar, tocar num link do aplicativo) pede confirmação.
 * Fora do grupo, o cartão continua com o próprio botão.
 */
export type BlocoDeOpcoes = {
  nome: string;
  mexeu: boolean;
  /** Salva o cartão. Devolve o texto do aviso, ou `false` se não salvou (o cartão mostra o porquê). */
  salvar: () => Promise<string | false>;
};
type Ctx = { registrar: (id: string, b: BlocoDeOpcoes | null) => void };
const SalvarJuntoCtx = createContext<Ctx | null>(null);

/** O cartão entra no botão único do grupo (quando há um). Devolve se está dentro de um grupo (então não mostra o próprio botão). */
export function useSalvarJunto(id: string, bloco: BlocoDeOpcoes): boolean {
  const ctx = useContext(SalvarJuntoCtx);
  const ref = useRef(bloco);
  ref.current = bloco;
  useEffect(() => {
    if (!ctx) return;
    ctx.registrar(id, { nome: bloco.nome, mexeu: bloco.mexeu, salvar: () => ref.current.salvar() });
  }, [ctx, id, bloco.nome, bloco.mexeu]);
  useEffect(() => () => ctx?.registrar(id, null), [ctx, id]);
  return Boolean(ctx);
}

const juntar = (l: string[]) => (l.length <= 1 ? l[0] ?? "" : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);

/** Segura a saída da tela com mudança sem salvar: recarregar/fechar (aviso do navegador) e links do aplicativo (pergunta). */
export function useSegurarSaida(mexeu: boolean, texto: string) {
  const { confirmar } = useAvisos();
  const router = useRouter();
  const textoRef = useRef(texto);
  textoRef.current = texto;
  useEffect(() => {
    if (!mexeu) return;
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const clique = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // âncora na mesma tela (#opcoes-cobranca): não sai daqui
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault(); e.stopPropagation();
      void confirmar({ titulo: "Sair sem salvar?", texto: textoRef.current, confirmar: "Sair sem salvar", voltar: "Ficar aqui", perigo: true })
        .then((sim) => { if (sim) { window.removeEventListener("beforeunload", segurar); router.push(url.pathname + url.search + url.hash); } });
    };
    window.addEventListener("beforeunload", segurar);
    document.addEventListener("click", clique, true);
    return () => { window.removeEventListener("beforeunload", segurar); document.removeEventListener("click", clique, true); };
  }, [mexeu, confirmar, router]);
}

export function SalvarJunto({ children, aoTerMudanca }: { children: ReactNode; /** algo mudou (ou voltou de um rascunho): o grupo fechado abre */ aoTerMudanca?: () => void }) {
  const { avisar } = useAvisos();
  const [blocos, setBlocos] = useState<Record<string, BlocoDeOpcoes>>({});
  const ordem = useRef<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const registrar = useCallback((id: string, b: BlocoDeOpcoes | null) => {
    if (b && !ordem.current.includes(id)) ordem.current.push(id);
    setBlocos((x) => {
      if (!b) { const { [id]: _, ...resto } = x; return resto; }
      const antes = x[id];
      if (antes && antes.mexeu === b.mexeu && antes.nome === b.nome) return { ...x, [id]: { ...antes, salvar: b.salvar } };
      return { ...x, [id]: b };
    });
  }, []);
  const ctx = useMemo(() => ({ registrar }), [registrar]);
  const mudados = ordem.current.filter((id) => blocos[id]?.mexeu);
  const nomes = mudados.map((id) => blocos[id].nome);
  const algum = mudados.length > 0;
  const aoTer = useRef(aoTerMudanca);
  aoTer.current = aoTerMudanca;
  useEffect(() => { if (algum) aoTer.current?.(); }, [algum]);
  useSegurarSaida(mudados.length > 0, `Você mudou ${juntar(nomes)} e não salvou. Se sair agora, a mudança não vale (o que você escreveu fica guardado neste aparelho como rascunho).`);

  async function salvarTudo() {
    if (salvando) return;
    setSalvando(true);
    const feitos: string[] = [];
    try {
      for (const id of mudados) {
        const r = await blocos[id].salvar();
        if (r === false) {
          // parou no cartão com problema: a tela desce até ele (o cartão mostra o que falta)
          document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
          break;
        }
        feitos.push(r);
      }
    } finally { setSalvando(false); }
    if (feitos.length) avisar(feitos.join(" "));
  }

  return (
    <SalvarJuntoCtx.Provider value={ctx}>
      {children}
      {mudados.length > 0 && (
        <div className="g-salvar-junto" role="region" aria-label="Salvar as opções">
          <p><b>Falta salvar:</b> {juntar(nomes)}.</p>
          <button type="button" className="g-btn pri" onClick={() => void salvarTudo()} disabled={salvando}><Save />{salvando ? "Salvando…" : "Salvar opções"}</button>
        </div>
      )}
    </SalvarJuntoCtx.Provider>
  );
}
