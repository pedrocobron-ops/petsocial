"use client";

import Link from "@/components/gestao/link-depois";
import { Selo } from "./marca";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Cat, Dog, PawPrint, Search, X } from "lucide-react";
import { fotoPet } from "@/lib/gestao/supabase";
import type { PetComTutor } from "@/lib/gestao/tipos";
import { corDoNome, iniciais, lerValorEstrito, semAcento, valor2 } from "@/lib/gestao/util";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { contaSoConsulta, useGestao } from "./contexto";
import { registrarErroMostrado } from "@/lib/gestao/erros-navegador";
import { textoAmigavel } from "@/lib/gestao/erros";
import { ehFalhaDeRede, textoDeRede } from "@/lib/gestao/validacao";

/** O aparelho diz que está sem internet agora. */
export const semInternet = () => typeof navigator !== "undefined" && navigator.onLine === false;

/* ---------- carregar dados ---------- */

export const EVENTO_MUDOU = "gestao:mudou";
/** Avisa todas as telas abertas que os dados mudaram (elas buscam de novo). */
export const avisarMudanca = () => window.dispatchEvent(new Event(EVENTO_MUDOU));
export const EVENTO_ASSISTENTE = "gestao:assistente";
/** Abre a assistente, opcionalmente já com um pedido escrito. */
export const abrirAssistente = (pedido?: string) => window.dispatchEvent(new CustomEvent(EVENTO_ASSISTENTE, { detail: pedido ?? "" }));
/** Evento para abrir o guia inicial de novo (botão em Meu pet shop). Fica aqui, e não no guia, para o guia carregar só quando abre. */
export const EVENTO_GUIA = "gestao:guia";
export const abrirGuia = () => window.dispatchEvent(new Event(EVENTO_GUIA));
/** Abre a folha "O que o seu negócio faz?" (Personalizar o menu Dia a dia), que fica na casca. */
export const EVENTO_PERSONALIZAR_MENU = "gestao:personalizar-menu";
export const abrirPersonalizarMenu = () => window.dispatchEvent(new Event(EVENTO_PERSONALIZAR_MENU));

/**
 * Chama `fazer` quando a tela terminou de abrir: sem nenhum "carregando" (`aria-busy`) na tela por um segundo e o aparelho
 * folgado. Serve para baixar em segundo plano o que não é da tela (manual, folhas), sem disputar a internet fraca com ela.
 * Devolve a função que cancela.
 */
export function quandoATelaAbrir(fazer: () => void, maximo = 15000): () => void {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  let quietas = 0, feito = false;
  const comeco = Date.now();
  const ir = () => { if (!feito) { feito = true; clearInterval(t); fazer(); } };
  const t = setInterval(() => {
    quietas = document.querySelector('[aria-busy="true"]') ? 0 : quietas + 1;
    if (quietas >= 2 || Date.now() - comeco > maximo) { clearInterval(t); if (w.requestIdleCallback) w.requestIdleCallback(ir, { timeout: 3000 }); else ir(); }
  }, 500);
  return () => { feito = true; clearInterval(t); };
}

/**
 * Folhas que só abrem com um toque (marcar horário, detalhe, conta) vêm à parte (`next/dynamic`), para a tela abrir antes
 * no celular com internet fraca. Depois que a tela abriu, elas baixam em segundo plano: no toque, já estão aqui.
 */
export function useAdiantar(...carregar: (() => Promise<unknown>)[]) {
  useEffect(() => quandoATelaAbrir(() => { for (const c of carregar) void c().catch(() => undefined); }), []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Busca dados e guarda o resultado. `recarregar()` busca de novo sem piscar a tela. */
export function useDados<T>(buscar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const vez = useRef(0);
  const fn = useRef(buscar);
  fn.current = buscar;
  const recarregar = useCallback(async () => {
    const minha = ++vez.current;
    try {
      const r = await fn.current();
      if (minha === vez.current) { setDados(r); setErro(null); }
    } catch (e) {
      if (minha === vez.current) { setErro(mensagemDeErro(e)); registrarErroMostrado(e); }
    } finally {
      if (minha === vez.current) setCarregando(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCarregando(true); void recarregar(); }, deps);
  // a assistente (ou outra tela) avisa que algo mudou: busca de novo
  useEffect(() => {
    const ouvir = () => { void recarregar(); };
    window.addEventListener(EVENTO_MUDOU, ouvir);
    return () => window.removeEventListener(EVENTO_MUDOU, ouvir);
  }, [recarregar]);
  return { dados, carregando, erro, recarregar };
}

/** Lança o erro do Supabase, se houver (com o código, para o registro de erros), e devolve os dados. */
export function ok<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: (r.error as { code?: string }).code ?? "" });
  return r.data as NonNullable<T>;
}

/** Recusa do banco que o aplicativo não sabe explicar: só fala em "só para consulta" quando a conta está mesmo assim. */
const semPermissao = () => (contaSoConsulta()
  ? "Sua conta está só para consulta. Para voltar a gravar, veja a tela Assinatura."
  : "Não deu para salvar: o seu acesso não permite isso, ou o item já não existe. Atualize a tela; se precisar, fale com o dono do pet shop.");

/** Texto de erro que uma pessoa entende. */
export function mensagemDeErro(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/row-level security|permission denied/i.test(m)) return semPermissao();
  // sem internet: o aparelho sabe (navigator.onLine) e diz; com internet, o pedido não chegou ao servidor
  if (ehFalhaDeRede(m) || /network/i.test(m)) return textoDeRede(!semInternet());
  if (/duplicate key/i.test(m)) return "Isso já está cadastrado.";
  if (/JSON object requested|Cannot coerce the result to a single JSON object|0 rows|PGRST116/i.test(m)) return semPermissao();
  if (/caixas_um_aberto/i.test(m)) return "Já existe um caixa aberto.";
  if (/numeric field overflow|out of range/i.test(m)) return "Esse valor é grande demais. Confira os números.";
  if (/violates check constraint/i.test(m)) return "Confira os valores: algum número está negativo ou fora do permitido.";
  // tempo esgotado e outros textos técnicos do banco ou do servidor: nunca em inglês na tela
  const amigavel = textoAmigavel(m);
  if (amigavel) return amigavel;
  return m || "Algo deu errado. Tente de novo.";
}

/* ---------- avisos rápidos e confirmação ---------- */

const EVENTO_AVISOU = "gestao:avisou";
/** Botão dentro do aviso rápido (ex.: "Desfazer"). O aviso com botão fica mais tempo na tela. */
export type AcaoDoAviso = { rotulo: string; fazer: () => void };
type Toast = { id: number; texto: string; erro?: boolean; acao?: AcaoDoAviso };
type Pergunta = { titulo: string; texto?: string; confirmar?: string; perigo?: boolean; /** nome do botão que responde não (padrão: Voltar) */ voltar?: string; resolver: (v: boolean) => void };
const AvisosCtx = createContext<{ avisar: (t: string, acao?: AcaoDoAviso) => void; avisarErro: (e: unknown, acao?: AcaoDoAviso) => void; confirmar: (p: Omit<Pergunta, "resolver">) => Promise<boolean> } | null>(null);

export function useAvisos() {
  const v = useContext(AvisosCtx);
  if (!v) throw new Error("useAvisos fora do AvisosProvider");
  return v;
}

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const por = useCallback((texto: string, erro?: boolean, acao?: AcaoDoAviso) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, texto, erro, acao }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), acao ? 8000 : erro ? 5000 : 2600);
    // aviso de que deu certo = algo foi gravado: a folha aberta deixa de contar como "mexida"
    if (!erro) window.dispatchEvent(new Event(EVENTO_AVISOU));
  }, []);
  const avisar = useCallback((t: string, acao?: AcaoDoAviso) => por(t, false, acao), [por]);
  const avisarErro = useCallback((e: unknown, acao?: AcaoDoAviso) => { por(mensagemDeErro(e), true, acao); registrarErroMostrado(e); }, [por]);
  const confirmar = useCallback((p: Omit<Pergunta, "resolver">) => new Promise<boolean>((resolver) => setPergunta({ ...p, resolver })), []);
  const responder = (v: boolean) => { pergunta?.resolver(v); setPergunta(null); };
  return (
    <AvisosCtx.Provider value={{ avisar, avisarErro, confirmar }}>
      {children}
      <div className="g-toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`g-toast${t.erro ? " erro" : ""}${t.acao ? " com-acao" : ""}`}>
            <span>{t.texto}</span>
            {t.acao && <button type="button" onClick={() => { setToasts((l) => l.filter((x) => x.id !== t.id)); t.acao!.fazer(); }}>{t.acao.rotulo}</button>}
          </div>
        ))}
      </div>
      {pergunta && (
        <Folha titulo={pergunta.titulo} aoFechar={() => responder(false)}
          rodape={<>
            <button className="g-btn sec" onClick={() => responder(false)}>{pergunta.voltar ?? "Voltar"}</button>
            <button className={`g-btn ${pergunta.perigo ? "perigo" : "pri"}`} onClick={() => responder(true)} autoFocus>{pergunta.confirmar ?? "Confirmar"}</button>
          </>}>
          {pergunta.texto && <p className="g-muted">{pergunta.texto}</p>}
        </Folha>
      )}
    </AvisosCtx.Provider>
  );
}

/* ---------- folha (janela) ---------- */

/** Uma folha aberta. `voltar` é o botão Voltar do aparelho: fecha (ou pergunta "Sair sem salvar?") e diz se a folha continuou aberta. */
type FolhaAberta = { voltar: () => boolean };
const pilhaDeFolhas: FolhaAberta[] = [];

/* ---------- botão Voltar do celular fecha a folha de cima ----------
 *
 * Ao abrir a primeira folha, a tela ganha UMA entrada a mais no histórico (a "guarda"), com o mesmo endereço.
 * O Voltar do aparelho consome a guarda em vez de sair da tela, e a folha de cima fecha.
 * - Fechar a folha por código (X, salvar) NÃO mexe no histórico: a guarda fica e é reaproveitada pela próxima folha,
 *   então abrir e fechar várias vezes não acumula nada. Sem folha aberta, o Voltar passa pela guarda e segue direto
 *   para a tela anterior (um toque só).
 * - Navegar com a folha aberta (salvar e ir para outra tela, tocar num link) também não mexe no histórico:
 *   nunca chamamos history.back() fora de um Voltar que a própria pessoa deu, então nenhuma navegação é desfeita.
 * As duas entradas levam uma marca com o mesmo número, para o Voltar e o Avançar entre outras telas não serem confundidos.
 */
const MARCA_GUARDA = "__folhaGuarda", MARCA_BASE = "__folhaBase";
type Guarda = { id: string; href: string; len: number; chave: string | null };
/** A guarda em que estamos agora (ou null, se a entrada atual do histórico não é uma guarda). */
let guarda: Guarda | null = null;

const marcaDe = (estado: unknown, marca: string): string | null => {
  const v = estado && typeof estado === "object" ? (estado as Record<string, unknown>)[marca] : null;
  return typeof v === "string" && v ? v : null;
};
/** Identidade da entrada atual do histórico, nos navegadores que informam (não muda quando a tela troca o próprio endereço). */
function chaveDoHistorico(): string | null {
  try {
    const k = (window as unknown as { navigation?: { currentEntry?: { key?: unknown } | null } }).navigation?.currentEntry?.key;
    return typeof k === "string" ? k : null;
  } catch { return null; }
}
const retratoDaGuarda = (id: string): Guarda => ({ id, href: window.location.href, len: window.history.length, chave: chaveDoHistorico() });

/** Cria a guarda em cima da entrada atual. */
function porGuarda() {
  try {
    const estado = window.history.state as Record<string, unknown> | null;
    const id = marcaDe(estado, MARCA_BASE) ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (!marcaDe(estado, MARCA_BASE)) window.history.replaceState({ ...(estado ?? {}), [MARCA_BASE]: id }, "");
    // sem endereço: o Next só copia o estado dele para a entrada nova e não navega
    window.history.pushState({ [MARCA_GUARDA]: id }, "");
    guarda = retratoDaGuarda(id);
  } catch { guarda = null; }
}

/** Confere se ainda estamos na guarda (a tela pode ter navegado ou trocado o próprio endereço) e refaz a marca se ela se perdeu. */
function conferirGuarda() {
  if (!guarda) return;
  try {
    const estado = window.history.state as Record<string, unknown> | null;
    const chave = chaveDoHistorico();
    const marcada = marcaDe(estado, MARCA_GUARDA) === guarda.id;
    const naMesma = chave && guarda.chave ? chave === guarda.chave : marcada || (!marcaDe(estado, MARCA_GUARDA) && window.history.length === guarda.len);
    if (!naMesma) { guarda = null; return; }
    guarda.href = window.location.href;
    guarda.len = window.history.length;
    if (!marcada) window.history.replaceState({ ...(estado ?? {}), [MARCA_GUARDA]: guarda.id }, "");
  } catch { guarda = null; }
}

function aoVoltarNoHistorico(ev: PopStateEvent) {
  const vinha = guarda;
  const estado = window.history.state as Record<string, unknown> | null;
  const chegou = marcaDe(estado, MARCA_GUARDA);
  // chegou numa guarda (voltou de outra tela para esta): a tela aparece normalmente
  if (chegou) { guarda = retratoDaGuarda(chegou); return; }
  guarda = null;
  // só é nosso o passo da guarda para a entrada de baixo, da mesma tela
  if (!vinha || marcaDe(estado, MARCA_BASE) !== vinha.id) return;
  // o endereço e a tela são os mesmos: o roteador não precisa saber deste passo
  ev.stopImmediatePropagation();
  const topo = pilhaDeFolhas[pilhaDeFolhas.length - 1];
  // nenhuma folha aberta: a guarda era sobra de uma folha já fechada; o Voltar segue para a tela anterior
  if (!topo) { window.history.back(); return; }
  // a tela trocou o próprio endereço com a folha aberta (ex.: tirou o "?novo=1"): a entrada de baixo acompanha
  if (window.location.href !== vinha.href) { try { window.history.replaceState({ [MARCA_BASE]: vinha.id }, "", vinha.href); } catch { /* segue com o endereço antigo */ } }
  const ficou = topo.voltar();
  // ainda tem folha aberta (perguntou "Sair sem salvar?" ou havia outra por baixo): repõe a guarda para o próximo Voltar
  const repor = () => {
    if (pilhaDeFolhas.length && !guarda && marcaDe(window.history.state, MARCA_BASE) === vinha.id) porGuarda();
  };
  if (ficou) repor(); else { window.setTimeout(repor, 0); window.setTimeout(repor, 350); }
}

if (typeof window !== "undefined") {
  const w = window as unknown as { __folhaVoltar?: (ev: PopStateEvent) => void };
  // (em desenvolvimento o módulo recarrega: troca o ouvinte antigo pelo novo)
  if (w.__folhaVoltar) window.removeEventListener("popstate", w.__folhaVoltar, true);
  w.__folhaVoltar = aoVoltarNoHistorico;
  // na captura: roda antes do roteador
  window.addEventListener("popstate", aoVoltarNoHistorico, true);
  // página recarregada em cima de uma guarda: lembra dela
  const id = marcaDe(window.history.state, MARCA_GUARDA);
  if (id) guarda = retratoDaGuarda(id);
}

/**
 * A folha acabou de fechar: por um instante, nada embaixo dela recebe toque. Sem isso, o segundo toque de um toque duplo
 * no botão do rodapé caía no que estava atrás (o menu de baixo no celular, uma linha da lista) e a pessoa mudava de tela sem querer.
 */
function segurarSegundoToque() {
  if (typeof document === "undefined") return;
  const capa = document.createElement("div");
  capa.setAttribute("aria-hidden", "true");
  capa.style.cssText = "position:fixed;inset:0;z-index:2147483000;background:transparent;touch-action:none";
  document.body.appendChild(capa);
  window.setTimeout(() => capa.remove(), 350);
}

export function Folha({ titulo, aoFechar, children, rodape, larga }: {
  titulo: React.ReactNode; aoFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode; larga?: boolean;
}) {
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const caixa = useRef<HTMLDivElement>(null);
  // a pessoa digitou algo nesta folha? (só vale para fechar por fora, Esc ou X; o próprio formulário fecha direto ao salvar)
  const mexeu = useRef(false);
  const [perguntando, setPerguntando] = useState(false);
  const perguntandoAgora = useRef(false);
  perguntandoAgora.current = perguntando;
  const tentar = useRef(() => {});
  tentar.current = () => { if (mexeu.current) setPerguntando(true); else fechar.current(); };
  // a tela pode trocar o próprio endereço com a folha aberta: a guarda do botão Voltar acompanha
  useEffect(() => { conferirGuarda(); });
  useEffect(() => {
    // botão Voltar do aparelho: igual ao Esc
    const eu: FolhaAberta = {
      voltar: () => {
        if (perguntandoAgora.current) { setPerguntando(false); return true; }
        if (mexeu.current) { setPerguntando(true); return true; }
        fechar.current();
        return false;
      },
    };
    pilhaDeFolhas.push(eu);
    conferirGuarda();
    if (!guarda) porGuarda();
    const relogio = window.setInterval(conferirGuarda, 700);
    // Esc fecha só a folha que está por cima
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || pilhaDeFolhas[pilhaDeFolhas.length - 1] !== eu) return;
      e.stopImmediatePropagation();
      if (perguntandoAgora.current) setPerguntando(false); else tentar.current();
    };
    document.addEventListener("keydown", tecla);
    // digitar ou marcar algo dentro desta folha (e não de outra aberta por cima) conta como formulário mexido; busca não conta
    const no = caixa.current;
    const digitou = (e: Event) => {
      const alvo = e.target as HTMLElement | null;
      if (!alvo || alvo.closest(".g-folha") !== no) return;
      if (alvo.closest(".g-busca, [data-sem-aviso]") || (alvo as HTMLInputElement).type === "search" || (alvo as HTMLInputElement).type === "file") return;
      mexeu.current = true;
    };
    no?.addEventListener("input", digitou);
    no?.addEventListener("change", digitou);
    const gravou = () => { mexeu.current = false; };
    window.addEventListener(EVENTO_AVISOU, gravou);
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      pilhaDeFolhas.splice(pilhaDeFolhas.indexOf(eu), 1); document.removeEventListener("keydown", tecla);
      window.clearInterval(relogio);
      conferirGuarda();
      no?.removeEventListener("input", digitou); no?.removeEventListener("change", digitou); window.removeEventListener(EVENTO_AVISOU, gravou);
      document.documentElement.style.overflow = antes;
      segurarSegundoToque();
    };
  }, []);
  return (
    <div className="g-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) tentar.current(); }}>
      <div ref={caixa} className={`g-folha${larga ? " larga" : ""}`} role="dialog" aria-modal="true">
        <div className="g-folha-topo">
          <h2>{titulo}</h2>
          <button className="g-ico" onClick={() => tentar.current()} aria-label="Fechar"><X /></button>
        </div>
        <div className="g-folha-corpo">{children}</div>
        {rodape && <div className="g-folha-pe">{rodape}</div>}
        {perguntando && (
          <div className="g-folha-sair" role="alertdialog" aria-modal="true" aria-label="Sair sem salvar?" onMouseDown={(e) => e.stopPropagation()}>
            <div>
              <b>Sair sem salvar?</b>
              <p>O que você preencheu aqui não foi salvo.</p>
              <div className="bts">
                <button type="button" className="g-btn pri" autoFocus onClick={() => setPerguntando(false)}>Continuar preenchendo</button>
                <button type="button" className="g-btn perigo" onClick={() => { setPerguntando(false); fechar.current(); }}>Sair sem salvar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- peças pequenas ---------- */

export function Campo({ rotulo, dica, erro, children }: { rotulo: string; dica?: string; erro?: string | null; children: React.ReactNode }) {
  return (
    <label className="g-campo">
      <span>{rotulo}</span>
      {children}
      {erro ? <small className="erro">{erro}</small> : dica ? <small>{dica}</small> : null}
    </label>
  );
}

/** Aviso antigo de quando alguém digitava o sinal de menos (hoje o campo mostra o erro e trava o salvar). */
export const AVISO_SEM_MENOS = "Valor não leva sinal de menos. Dinheiro que sai é lançado como saída.";

/**
 * Trava do salvar com dinheiro digitado errado, para o app inteiro: um toque num botão de gravar (laranja, verde ou
 * `data-gravar`) dentro da mesma folha, formulário ou cartão de um campo de valor com erro não chega ao formulário;
 * o campo ruim ganha o foco e o aviso continua embaixo dele. Assim nenhum formulário salva um valor que a pessoa não quis.
 */
let travaInstalada = false;
function instalarTravaDeValor() {
  if (travaInstalada || typeof document === "undefined") return;
  travaInstalada = true;
  const ruimPerto = (el: Element): HTMLElement | null => {
    const lugar = el.closest(".g-folha") ?? el.closest("form") ?? el.closest(".g-card");
    return (lugar?.querySelector('[data-valor-ruim="1"]') as HTMLElement | null) ?? null;
  };
  const segurar = (e: Event, ruim: HTMLElement) => {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    ruim.focus(); ruim.scrollIntoView?.({ block: "center", behavior: "smooth" });
    ruim.classList.remove("tremer"); void ruim.offsetWidth; ruim.classList.add("tremer");
  };
  document.addEventListener("click", (e) => {
    const bt = (e.target as Element | null)?.closest?.("button, [role=button]");
    if (!bt || !bt.matches(".g-btn.pri, .g-btn.verde, [data-gravar]") || bt.closest(".g-folha-sair")) return;
    const ruim = ruimPerto(bt);
    if (ruim) segurar(e, ruim);
  }, true);
  document.addEventListener("submit", (e) => {
    const f = e.target as HTMLFormElement | null;
    const ruim = f?.querySelector?.('[data-valor-ruim="1"]') as HTMLElement | null;
    if (ruim) segurar(e, ruim);
  }, true);
}

/**
 * O texto de um campo de dinheiro: guarda o que a pessoa digitou (sem tirar nada em silêncio), lê de forma estrita e diz o erro.
 * Com erro, o valor passado adiante é null e a trava acima segura o salvar.
 */
export function useCampoDeValor(valor: number | null, aoMudar: (v: number | null) => void, formatar: (n: number) => string, negativo?: boolean) {
  const [texto, setTexto] = useState(valor == null ? "" : formatar(valor));
  const [erro, setErro] = useState<string | null>(null);
  const ultimo = useRef(valor);
  useEffect(() => { instalarTravaDeValor(); }, []);
  useEffect(() => {
    if (valor !== ultimo.current) { ultimo.current = valor; setTexto(valor == null ? "" : formatar(valor)); setErro(null); }
  }, [valor, formatar]);
  return {
    texto, erro,
    mudar: (t: string) => {
      setTexto(t);
      const r = lerValorEstrito(t, { negativo });
      setErro(r.erro); ultimo.current = r.valor; aoMudar(r.valor);
    },
    sair: () => { if (!erro && ultimo.current != null) setTexto(formatar(ultimo.current)); },
  };
}

export function CampoValor({ valor, aoMudar, placeholder = "0,00", autoFocus, id, negativo, rotulo }: {
  valor: number | null; aoMudar: (v: number | null) => void; placeholder?: string; autoFocus?: boolean; id?: string; negativo?: boolean; rotulo?: string;
}) {
  const c = useCampoDeValor(valor, aoMudar, valor2, negativo);
  return (
    <>
      <input id={id} className={`g-input g-tab${c.erro ? " ruim" : ""}`} inputMode="decimal" placeholder={placeholder} autoFocus={autoFocus} value={c.texto}
        aria-label={rotulo} aria-invalid={c.erro ? true : undefined} data-valor-ruim={c.erro ? "1" : undefined}
        onChange={(e) => c.mudar(e.target.value)} onBlur={c.sair} />
      {c.erro && <small className="erro g-valor-erro" role="alert">{c.erro}</small>}
    </>
  );
}

export function AvatarPet({ pet, tamanho }: { pet: { nome: string; foto?: string | null; especie?: string | null }; tamanho?: "p" | "g" | "gg" }) {
  const url = fotoPet(pet.foto);
  const Icone = pet.especie === "gato" ? Cat : pet.especie === "cao" ? Dog : PawPrint;
  return (
    <span className={`g-avatar${tamanho ? ` tam-${tamanho}` : ""}`} style={{ background: corDoNome(pet.nome) }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" loading="lazy" /> : <Icone />}
    </span>
  );
}

export function AvatarPessoa({ nome, cor, tamanho }: { nome: string; cor?: string | null; tamanho?: "p" | "g" }) {
  return <span className={`g-avatar${tamanho ? ` tam-${tamanho}` : ""}`} style={{ background: cor ?? corDoNome(nome) }} aria-hidden>{iniciais(nome)}</span>;
}

/** Tela vazia com o Mozart. */
export function Vazio({ titulo, texto, children, mozart = "sorrindo" }: { titulo: string; texto?: string; children?: React.ReactNode; mozart?: "sorrindo" | "acenando" }) {
  return (
    <div className="g-vazio">
      <Selo tamanho={72} tom="suave" />
      <b>{titulo}</b>
      {texto && <p>{texto}</p>}
      {children}
    </div>
  );
}

export function Esqueleto({ linhas = 3 }: { linhas?: number }) {
  return <div className="g-pilha p" aria-busy="true">{Array.from({ length: linhas }, (_, i) => <div key={i} className="g-esq" />)}</div>;
}

/** Aviso que acompanha um botão de gravar apagado (conta só para consulta). */
export const DICA_SO_CONSULTA = "A conta está só para consulta. Veja a tela Assinatura para voltar a marcar e lançar.";

/**
 * Atalho para uma ação que grava (Marcar horário, Cadastrar pet): com a conta só para consulta, vira um botão apagado,
 * para a tela não oferecer o que o banco vai recusar.
 */
export function LinkDeGravar({ href, className, style, children }: { href: string; className?: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const { liberado } = useGestao();
  if (liberado) return <Link className={className} href={href} style={style}>{children}</Link>;
  return <button type="button" className={className} style={style} disabled title={DICA_SO_CONSULTA}>{children}</button>;
}

/** Aviso de conta só para consulta. Use antes de abrir formulários de gravação. */
export function useSomenteLeitura() {
  const { liberado, exclusao } = useGestao();
  const { avisar } = useAvisos();
  return useCallback(() => {
    if (liberado) return false;
    avisar(exclusao ? "A conta está marcada para ser apagada e fica só para consulta. Para voltar a lançar, o dono cancela em Meu pet shop."
      : "Sua conta está só para consulta. Assine para voltar a lançar.");
    return true;
  }, [liberado, exclusao, avisar]);
}

/* ---------- escolher um pet ---------- */

/** Busca de pet por nome do pet ou do tutor. Mostra foto, tutor e porte. */
export function EscolherPet({ aoEscolher, aoCriar, autoFocus }: {
  aoEscolher: (pet: PetComTutor) => void; aoCriar?: (nomeDigitado: string) => void; autoFocus?: boolean;
}) {
  const { sb, petshop } = useGestao();
  const [q, setQ] = useState("");
  const { dados } = useDados(async () =>
    lerTudo<PetComTutor>((de, ate, contar) => sb.from("pets").select("*, clientes(id, nome, telefone)", contando(contar)).eq("petshop_id", petshop.id).eq("ativo", true).order("nome").order("id").range(de, ate)),
  [petshop.id]);
  const alvo = semAcento(q);
  const lista = (dados ?? []).filter((p) => !alvo || semAcento(p.nome).includes(alvo) || semAcento(p.clientes?.nome ?? "").includes(alvo)).slice(0, 30);
  return (
    <div className="g-pilha p">
      <div className="g-busca">
        <Search />
        <input className="g-input" placeholder="Nome do pet ou do tutor" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} />
      </div>
      <div className="g-lista">
        {lista.map((p) => (
          <button key={p.id} type="button" className="g-linha" onClick={() => aoEscolher(p)}>
            <AvatarPet pet={p} />
            <span className="t"><b>{p.nome}</b><span>{[p.clientes?.nome, p.raca, p.porte ? `porte ${p.porte}` : null].filter(Boolean).join(" · ")}</span></span>
          </button>
        ))}
        {dados && !lista.length && <p className="g-muted g-p" style={{ padding: "12px 4px" }}>Nenhum pet encontrado.</p>}
      </div>
      {aoCriar && <button type="button" className="g-btn sec" onClick={() => aoCriar(q.trim())}>Cadastrar pet novo{q.trim() ? `: ${q.trim()}` : ""}</button>}
    </div>
  );
}
