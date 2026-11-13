"use client";

import { Selo } from "./marca";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Cat, Dog, PawPrint, Search, X } from "lucide-react";
import { fotoPet } from "@/lib/gestao/supabase";
import type { PetComTutor } from "@/lib/gestao/tipos";
import { corDoNome, iniciais, lerValor, semAcento, valor2 } from "@/lib/gestao/util";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { useGestao } from "./contexto";

/* ---------- carregar dados ---------- */

export const EVENTO_MUDOU = "gestao:mudou";
/** Avisa todas as telas abertas que os dados mudaram (elas buscam de novo). */
export const avisarMudanca = () => window.dispatchEvent(new Event(EVENTO_MUDOU));
export const EVENTO_ASSISTENTE = "gestao:assistente";
/** Abre a assistente, opcionalmente já com um pedido escrito. */
export const abrirAssistente = (pedido?: string) => window.dispatchEvent(new CustomEvent(EVENTO_ASSISTENTE, { detail: pedido ?? "" }));

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
      if (minha === vez.current) setErro(mensagemDeErro(e));
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

/** Lança o erro do Supabase, se houver, e devolve os dados. */
export function ok<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
}

/** Texto de erro que uma pessoa entende. */
export function mensagemDeErro(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/row-level security|permission denied/i.test(m)) return "Sua conta está só para consulta ou você não tem permissão para isso.";
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Sem conexão. Confira a internet e tente de novo.";
  if (/duplicate key/i.test(m)) return "Isso já está cadastrado.";
  if (/JSON object requested|0 rows|PGRST116/i.test(m)) return "Não deu para gravar: sua conta está só para consulta ou você não tem permissão para isso.";
  if (/caixas_um_aberto/i.test(m)) return "Já existe um caixa aberto.";
  if (/numeric field overflow|out of range/i.test(m)) return "Esse valor é grande demais. Confira os números.";
  if (/violates check constraint/i.test(m)) return "Confira os valores: algum número está negativo ou fora do permitido.";
  return m || "Algo deu errado. Tente de novo.";
}

/* ---------- avisos rápidos e confirmação ---------- */

const EVENTO_AVISOU = "gestao:avisou";
type Toast = { id: number; texto: string; erro?: boolean };
type Pergunta = { titulo: string; texto?: string; confirmar?: string; perigo?: boolean; resolver: (v: boolean) => void };
const AvisosCtx = createContext<{ avisar: (t: string) => void; avisarErro: (e: unknown) => void; confirmar: (p: Omit<Pergunta, "resolver">) => Promise<boolean> } | null>(null);

export function useAvisos() {
  const v = useContext(AvisosCtx);
  if (!v) throw new Error("useAvisos fora do AvisosProvider");
  return v;
}

export function AvisosProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const por = useCallback((texto: string, erro?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, texto, erro }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), erro ? 5000 : 2600);
    // aviso de que deu certo = algo foi gravado: a folha aberta deixa de contar como "mexida"
    if (!erro) window.dispatchEvent(new Event(EVENTO_AVISOU));
  }, []);
  const avisar = useCallback((t: string) => por(t), [por]);
  const avisarErro = useCallback((e: unknown) => por(mensagemDeErro(e), true), [por]);
  const confirmar = useCallback((p: Omit<Pergunta, "resolver">) => new Promise<boolean>((resolver) => setPergunta({ ...p, resolver })), []);
  const responder = (v: boolean) => { pergunta?.resolver(v); setPergunta(null); };
  return (
    <AvisosCtx.Provider value={{ avisar, avisarErro, confirmar }}>
      {children}
      <div className="g-toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`g-toast${t.erro ? " erro" : ""}`}>{t.texto}</div>)}
      </div>
      {pergunta && (
        <Folha titulo={pergunta.titulo} aoFechar={() => responder(false)}
          rodape={<>
            <button className="g-btn sec" onClick={() => responder(false)}>Voltar</button>
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

/** Aviso de quando alguém digita o sinal de menos num campo de valor (o sinal é tirado). */
export const AVISO_SEM_MENOS = "Valor não leva sinal de menos: tirei o sinal. Dinheiro que sai é lançado como saída.";

/** Campo de dinheiro: aceita "60", "60,50" ou "1.200,00" e devolve número (ou null). Não aceita sinal de menos. */
export function CampoValor({ valor, aoMudar, placeholder = "0,00", autoFocus, id }: {
  valor: number | null; aoMudar: (v: number | null) => void; placeholder?: string; autoFocus?: boolean; id?: string;
}) {
  const [texto, setTexto] = useState(valor == null ? "" : valor2(valor));
  const ultimo = useRef(valor);
  const { avisar } = useAvisos();
  useEffect(() => {
    if (valor !== ultimo.current) { ultimo.current = valor; setTexto(valor == null ? "" : valor2(valor)); }
  }, [valor]);
  return (
    <input id={id} className="g-input g-tab" inputMode="decimal" placeholder={placeholder} autoFocus={autoFocus} value={texto}
      onChange={(e) => {
        const limpo = e.target.value.replace(/-/g, "");
        if (limpo !== e.target.value) avisar(AVISO_SEM_MENOS);
        setTexto(limpo); const n = lerValor(limpo); ultimo.current = n; aoMudar(n);
      }}
      onBlur={() => { if (ultimo.current != null) setTexto(valor2(ultimo.current)); }} />
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

/** Aviso de conta só para consulta. Use antes de abrir formulários de gravação. */
export function useSomenteLeitura() {
  const { liberado } = useGestao();
  const { avisar } = useAvisos();
  return useCallback(() => {
    if (liberado) return false;
    avisar("Sua conta está só para consulta. Assine para voltar a lançar.");
    return true;
  }, [liberado, avisar]);
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
