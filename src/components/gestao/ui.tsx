"use client";

import { Selo } from "./marca";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Cat, Dog, PawPrint, Search, X } from "lucide-react";
import { fotoPet } from "@/lib/gestao/supabase";
import type { PetComTutor } from "@/lib/gestao/tipos";
import { brl, corDoNome, iniciais, lerValor, semAcento } from "@/lib/gestao/util";
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
  return m || "Algo deu errado. Tente de novo.";
}

/* ---------- avisos rápidos e confirmação ---------- */

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

const pilhaDeFolhas: object[] = [];

export function Folha({ titulo, aoFechar, children, rodape, larga }: {
  titulo: React.ReactNode; aoFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode; larga?: boolean;
}) {
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  useEffect(() => {
    const eu = {};
    pilhaDeFolhas.push(eu);
    // Esc fecha só a folha que está por cima
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && pilhaDeFolhas[pilhaDeFolhas.length - 1] === eu) { e.stopImmediatePropagation(); fechar.current(); } };
    document.addEventListener("keydown", tecla);
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { pilhaDeFolhas.splice(pilhaDeFolhas.indexOf(eu), 1); document.removeEventListener("keydown", tecla); document.documentElement.style.overflow = antes; };
  }, []);
  return (
    <div className="g-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className={`g-folha${larga ? " larga" : ""}`} role="dialog" aria-modal="true">
        <div className="g-folha-topo">
          <h2>{titulo}</h2>
          <button className="g-ico" onClick={aoFechar} aria-label="Fechar"><X /></button>
        </div>
        <div className="g-folha-corpo">{children}</div>
        {rodape && <div className="g-folha-pe">{rodape}</div>}
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

/** Campo de dinheiro: aceita "60", "60,50" ou "1.200,00" e devolve número (ou null). */
export function CampoValor({ valor, aoMudar, placeholder = "0,00", autoFocus, id }: {
  valor: number | null; aoMudar: (v: number | null) => void; placeholder?: string; autoFocus?: boolean; id?: string;
}) {
  const [texto, setTexto] = useState(valor == null ? "" : String(valor).replace(".", ","));
  const ultimo = useRef(valor);
  useEffect(() => {
    if (valor !== ultimo.current) { ultimo.current = valor; setTexto(valor == null ? "" : String(valor).replace(".", ",")); }
  }, [valor]);
  return (
    <input id={id} className="g-input g-tab" inputMode="decimal" placeholder={placeholder} autoFocus={autoFocus} value={texto}
      onChange={(e) => { setTexto(e.target.value); const n = lerValor(e.target.value); ultimo.current = n; aoMudar(n); }}
      onBlur={() => { if (ultimo.current != null) setTexto(brl(ultimo.current).replace("R$", "").trim()); }} />
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
    ok(await sb.from("pets").select("*, clientes(id, nome, telefone)").eq("petshop_id", petshop.id).eq("ativo", true).order("nome").limit(1000)) as PetComTutor[],
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
