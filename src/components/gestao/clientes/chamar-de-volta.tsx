"use client";

import { saudacaoZap } from "@/lib/gestao/agenda";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, MessageCircle, PhoneOff } from "lucide-react";
import type { Banco } from "@/lib/gestao/supabase";
import { chamar, dataAmigavel, deIsoDia, fmtTelefone, haQuanto, inicioDoDia, linkWhatsApp, soDigitos } from "@/lib/gestao/util";
import { buscarVisitas, diasSemVir, sumiu } from "@/lib/gestao/visitas";
import { useGestao } from "../contexto";
import { guardarLembrado, lerLembrado } from "../lembrado";
import { AvatarPet, Esqueleto, Folha, Vazio, useAvisos, useDados } from "../ui";
import { buscarTudo, linkTutor } from "./comum";
import "./chamar-de-volta.css";

/**
 * "Chamar de volta": quem já veio e parou de vir (sem horário marcado) e os aniversariantes da semana,
 * um tutor por linha, com a mensagem pronta para abrir no WhatsApp. O texto das mensagens é do pet shop
 * (tabela `modelos_mensagem`: o mesmo em qualquer aparelho); quem já foi chamado fica guardado no aparelho.
 */

export type AbaChamar = "volta" | "niver";

type PetChamar = {
  id: string; nome: string; foto: string | null; especie: string; nascimento: string | null; cliente_id: string;
  clientes: { id: string; nome: string; telefone: string | null } | null;
};
/** Um pet ativo com a última visita (atendimento concluído ou estadia) e se já tem algo marcado daqui para a frente. */
export type ParaChamar = { pet: PetChamar; ultima: string | null; servico: string | null; marcado: boolean };

type Resposta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Pets ativos com a última visita de cada um e se há horário ou estadia por vir. Só leitura, página a página. */
export async function buscarParaChamar(sb: Banco, petshopId: string): Promise<ParaChamar[]> {
  const [pets, visitas] = await Promise.all([
    buscarTudo<PetChamar>((de, ate) => sb.from("pets").select("id, nome, foto, especie, nascimento, cliente_id, clientes(id, nome, telefone)")
      .eq("petshop_id", petshopId).eq("ativo", true).order("nome").order("id").range(de, ate) as unknown as Resposta<PetChamar>),
    buscarVisitas(sb, petshopId),
  ]);
  return pets.map((pet) => {
    const v = visitas.get(pet.id);
    return { pet, ultima: v?.ultima ?? null, servico: v?.servico ?? null, marcado: v?.marcado ?? false };
  });
}

type PetDoGrupo = { pet: PetChamar; detalhe: string; ordem: number };
/** Um tutor e os pets dele que entram na lista (uma mensagem só por tutor). */
export type GrupoChamar = { chave: string; nome: string; telefone: string | null; pets: PetDoGrupo[]; ordem: number };

function agrupar(itens: PetDoGrupo[]): GrupoChamar[] {
  const grupos = new Map<string, GrupoChamar>();
  for (const i of itens) {
    const c = i.pet.clientes;
    const g = grupos.get(i.pet.cliente_id) ?? { chave: i.pet.cliente_id, nome: c?.nome ?? "Sem tutor", telefone: soDigitos(c?.telefone).length >= 8 ? c!.telefone : null, pets: [], ordem: i.ordem };
    g.pets.push(i);
    g.ordem = Math.min(g.ordem, i.ordem);
    grupos.set(g.chave, g);
  }
  return [...grupos.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
}

const diasEntre = (de: Date, ate: Date) => Math.round((inicioDoDia(ate).getTime() - inicioDoDia(de).getTime()) / 864e5);

/** Quem já veio, não vem há mais de `dias` dias e não tem nada marcado (a regra é `sumiu`, a mesma da lista de Clientes). Quem saiu há menos tempo vem primeiro. */
export function quemSumiu(lista: ParaChamar[], dias: number, hoje = new Date()): GrupoChamar[] {
  const itens: PetDoGrupo[] = [];
  for (const x of lista) {
    if (!x.ultima || !sumiu(x, dias, hoje)) continue;
    const faz = diasSemVir(x.ultima, hoje);
    itens.push({ pet: x.pet, ordem: faz, detalhe: `${faz < 90 ? `há ${faz} dias` : haQuanto(x.ultima)}${x.servico ? ` · ${x.servico}` : ""}` });
  }
  return agrupar(itens);
}

/** Pets que fazem aniversário de hoje até daqui a 7 dias. Sem data de nascimento na ficha, o pet não entra. */
export function aniversariantes(lista: ParaChamar[], hoje = new Date()): GrupoChamar[] {
  const h = inicioDoDia(hoje);
  const itens: PetDoGrupo[] = [];
  for (const x of lista) {
    if (!x.pet.nascimento) continue;
    const n = deIsoDia(x.pet.nascimento);
    if (Number.isNaN(n.getTime())) continue;
    let d = new Date(h.getFullYear(), n.getMonth(), n.getDate());
    if (d < h) d = new Date(h.getFullYear() + 1, n.getMonth(), n.getDate());
    const em = diasEntre(h, d);
    if (em > 7) continue;
    const anos = d.getFullYear() - n.getFullYear();
    itens.push({ pet: x.pet, ordem: em, detalhe: `aniversário ${dataAmigavel(d)}${anos >= 1 && anos <= 30 ? ` · faz ${anos === 1 ? "1 ano" : `${anos} anos`}` : ""}` });
  }
  return agrupar(itens);
}

/** "Thor", "Thor e Mel", "Thor, Mel e Luna". */
export const juntarNomes = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);

/* ---------- textos das mensagens (do pet shop; o aparelho guarda uma cópia para abrir sem esperar) ---------- */

export const MODELOS_PADRAO: Record<AbaChamar, string> = {
  volta: "Faz um tempinho desde a última visita de [pet]. Quer que eu veja um horário?",
  niver: "A gente lembrou do aniversário de [pet] e passou para dar os parabéns! Muita saúde e muito carinho.",
};
const chaveModelos = (petshopId: string) => `maestro-gestao-chamar-modelos:${petshopId}`;
const chaveChamados = (petshopId: string) => `maestro-gestao-chamados:${petshopId}`;

function lerJson<T extends object>(chave: string): Partial<T> {
  try { const v: unknown = JSON.parse(lerLembrado(chave) ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<T>) : {}; } catch { return {}; }
}
function lerModelos(petshopId: string): Record<AbaChamar, string> {
  const g = lerJson<Record<AbaChamar, string>>(chaveModelos(petshopId));
  return { volta: typeof g.volta === "string" ? g.volta : MODELOS_PADRAO.volta, niver: typeof g.niver === "string" ? g.niver : MODELOS_PADRAO.niver };
}

/** Como cada texto se chama na tabela `modelos_mensagem`. */
const CHAVE_NO_BANCO: Record<AbaChamar, string> = { volta: "chamar.volta", niver: "chamar.niver" };

/**
 * Os textos do pet shop. Se o pet shop ainda não tem um texto guardado e este aparelho tinha um texto próprio
 * (de quando ele ficava só no aparelho), o texto do aparelho sobe para o pet shop uma vez.
 */
async function lerModelosDoPetshop(sb: Banco, petshopId: string, doAparelho: Record<AbaChamar, string>): Promise<Record<AbaChamar, string>> {
  const r = await sb.from("modelos_mensagem").select("chave, texto").eq("petshop_id", petshopId).in("chave", Object.values(CHAVE_NO_BANCO));
  if (r.error) return doAparelho; // banco antes da atualização, ou sem conexão: segue com o texto do aparelho
  const guardado = new Map((r.data ?? []).map((x) => [x.chave, x.texto]));
  const final = { ...doAparelho };
  for (const aba of ["volta", "niver"] as const) {
    const t = guardado.get(CHAVE_NO_BANCO[aba]);
    if (t != null) final[aba] = t;
    else if (doAparelho[aba].trim() && doAparelho[aba] !== MODELOS_PADRAO[aba]) {
      // `ignoreDuplicates`: se outro aparelho subiu o dele primeiro, vale o que já está lá
      await sb.from("modelos_mensagem").upsert({ petshop_id: petshopId, chave: CHAVE_NO_BANCO[aba], texto: doAparelho[aba].slice(0, 1000) }, { onConflict: "petshop_id,chave", ignoreDuplicates: true }).select("chave");
    }
  }
  return final;
}

/** A mensagem inteira: a saudação entra sozinha e `[pet]` vira o nome do pet (ou dos pets) do tutor. Texto em branco usa o padrão. */
export function montarMensagem(aba: AbaChamar, modelo: string, p: { tutor: string | null; pets: string[]; petshop: string }) {
  const corpo = (modelo.trim() || MODELOS_PADRAO[aba]).replace(/\[pet\]/gi, juntarNomes(p.pets) || "seu pet");
  return `${saudacaoZap(p.tutor, p.petshop)} ${corpo}`;
}

/* ---------- quem já foi chamado (fica marcado por alguns dias, neste aparelho) ---------- */

/** Por quantos dias a linha continua marcada como chamada. */
const DIAS_CHAMADO: Record<AbaChamar, number> = { volta: 7, niver: 20 };
type Chamados = Record<string, string>;

export function lerChamados(petshopId: string): Chamados {
  const g = lerJson<Chamados>(chaveChamados(petshopId));
  const vale: Chamados = {};
  for (const [k, v] of Object.entries(g)) if (typeof v === "string" && !Number.isNaN(Date.parse(v))) vale[k] = v;
  return vale;
}
/** Quando este tutor foi chamado (se ainda está dentro do prazo), ou null. */
export function chamadoEm(chamados: Chamados, aba: AbaChamar, chave: string, agora = Date.now()): string | null {
  const em = chamados[`${aba}:${chave}`];
  return em && agora - Date.parse(em) < DIAS_CHAMADO[aba] * 864e5 ? em : null;
}

const DIAS = [30, 45, 60, 90];
const PASSO = 40;

export default function ChamarDeVolta({ aoFechar, aba: abaInicial = "volta" }: { aoFechar: () => void; aba?: AbaChamar }) {
  const { sb, petshop, posso } = useGestao();
  const { avisarErro } = useAvisos();
  const podeMudarTexto = posso("clientes") || posso("agenda");
  const [aba, setAba] = useState<AbaChamar>(abaInicial);
  const [dias, setDias] = useState(30);
  const [modelos, setModelos] = useState(() => lerModelos(petshop.id));
  const [editando, setEditando] = useState(false);
  const [chamados, setChamados] = useState(() => lerChamados(petshop.id));
  const [mostrar, setMostrar] = useState(PASSO);
  // o texto guardado no pet shop chega logo depois de abrir e vale sobre a cópia do aparelho (menos se a pessoa já está escrevendo)
  const mexeu = useRef(false);
  const aGravar = useRef<Partial<Record<AbaChamar, string>>>({});
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let vivo = true;
    void lerModelosDoPetshop(sb, petshop.id, lerModelos(petshop.id)).then((m) => {
      if (!vivo || mexeu.current) return;
      setModelos(m);
      guardarLembrado(chaveModelos(petshop.id), JSON.stringify(m));
    });
    return () => { vivo = false; };
  }, [sb, petshop.id]);

  /** Grava no pet shop o que foi escrito (um instante depois de parar de digitar, ao tocar em Pronto e ao fechar). */
  async function gravar() {
    if (relogio.current) { clearTimeout(relogio.current); relogio.current = null; }
    const pendentes = Object.entries(aGravar.current) as [AbaChamar, string][];
    aGravar.current = {};
    for (const [qual, texto] of pendentes) {
      const g = await sb.from("modelos_mensagem").upsert({ petshop_id: petshop.id, chave: CHAVE_NO_BANCO[qual], texto: texto.slice(0, 1000), atualizado_em: new Date().toISOString() }, { onConflict: "petshop_id,chave" }).select("chave");
      if (g.error || !g.data?.length) { avisarErro("Não consegui guardar o texto para o pet shop. Ele vale só neste aparelho por enquanto."); return; }
    }
  }
  const gravarRef = useRef(gravar);
  gravarRef.current = gravar;
  useEffect(() => () => { void gravarRef.current(); }, []);

  const { dados, carregando, erro, recarregar } = useDados(() => buscarParaChamar(sb, petshop.id), [petshop.id]);

  const sumidos = dados ? quemSumiu(dados, dias) : [];
  const petsSumidos = sumidos.reduce((n, g) => n + g.pets.length, 0);
  const niver = dados ? aniversariantes(dados) : [];
  const grupos = aba === "volta" ? sumidos : niver;
  const comTelefone = grupos.filter((g) => g.telefone);
  const semTelefone = grupos.filter((g) => !g.telefone);
  const feito = (g: GrupoChamar) => chamadoEm(chamados, aba, g.chave);
  const faltam = comTelefone.filter((g) => !feito(g));
  const proximo = faltam[0]?.chave ?? null;
  const modelo = modelos[aba];
  const mensagem = (g: GrupoChamar) => montarMensagem(aba, modelo, { tutor: g.nome, pets: g.pets.map((p) => p.pet.nome), petshop: petshop.nome });
  const exemplo = faltam[0] ?? comTelefone[0] ?? null;

  function mudarModelo(texto: string) {
    const novo = { ...modelos, [aba]: texto };
    setModelos(novo);
    guardarLembrado(chaveModelos(petshop.id), JSON.stringify(novo));
    mexeu.current = true;
    aGravar.current[aba] = texto;
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => void gravar(), 900);
  }

  function chamou(g: GrupoChamar) {
    const agora = Date.now();
    // relê o que está guardado (outra aba pode ter marcado alguém) e descarta o que já é antigo
    const novo: Chamados = {};
    for (const [k, v] of Object.entries(lerChamados(petshop.id))) if (agora - Date.parse(v) < 40 * 864e5) novo[k] = v;
    novo[`${aba}:${g.chave}`] = new Date(agora).toISOString();
    guardarLembrado(chaveChamados(petshop.id), JSON.stringify(novo));
    setChamados(novo);
  }

  const trocarAba = (a: AbaChamar) => { setAba(a); setEditando(false); setMostrar(PASSO); };
  const fotos = (g: GrupoChamar) => (
    <span className="g-cv-fotos">{g.pets.slice(0, 3).map((p) => <AvatarPet key={p.pet.id} pet={p.pet} tamanho={g.pets.length > 1 ? "p" : undefined} />)}</span>
  );
  const detalhe = (g: GrupoChamar) => (g.pets.length === 1 ? g.pets[0].detalhe : g.pets.map((p) => `${p.pet.nome}: ${p.detalhe}`).join(" · "));
  const nomesDe = (g: GrupoChamar) => juntarNomes(g.pets.map((p) => p.pet.nome));

  return (
    <Folha larga titulo="Chamar de volta" aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
      <div className="g-pilha">
        <div className="g-seg g-cv-abas" role="group" aria-label="Quem chamar">
          <button type="button" aria-pressed={aba === "volta"} onClick={() => trocarAba("volta")}>Faz tempo que não vêm{dados ? ` (${sumidos.length})` : ""}</button>
          <button type="button" aria-pressed={aba === "niver"} onClick={() => trocarAba("niver")}>Aniversário{dados ? ` (${niver.length})` : ""}</button>
        </div>

        {aba === "volta" && (
          <div className="g-campo">
            <span>Sem vir há mais de</span>
            <div className="g-chips" role="group" aria-label="Dias sem vir">
              {DIAS.map((d) => <button key={d} type="button" className="g-chip" aria-pressed={dias === d} onClick={() => { setDias(d); setMostrar(PASSO); }}>{d} dias</button>)}
            </div>
          </div>
        )}

        {erro && !dados ? (
          <Vazio titulo="Não consegui montar a lista" texto={erro}><button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button></Vazio>
        ) : carregando && !dados ? <Esqueleto linhas={4} /> : !grupos.length ? (
          aba === "volta"
            ? <Vazio titulo="Ninguém sumido por aqui" texto={`Quem já veio voltou nos últimos ${dias} dias ou já tem horário marcado.`} />
            : <Vazio titulo="Nenhum aniversário nos próximos 7 dias" texto="Aparecem aqui os pets com a data de nascimento anotada na ficha." />
        ) : (
          <>
            <div className="g-cv-msg">
              <div className="g-cv-msg-t">
                <span className="g-rotulo">Mensagem</span>
                {podeMudarTexto && <button type="button" className="g-btn fantasma p" aria-expanded={editando} onClick={() => { if (editando) void gravar(); setEditando(!editando); }}>{editando ? "Pronto" : "Mudar o texto"}</button>}
              </div>
              {editando && (
                <label className="g-campo">
                  <span>O que vai escrito depois do “Oi”</span>
                  <textarea className="g-textarea" data-sem-aviso rows={3} maxLength={500} value={modelo} onChange={(e) => mudarModelo(e.target.value)} />
                  <small>Onde estiver [pet] entra o nome do pet. O começo, com o nome do tutor e do pet shop, entra sozinho. O texto vale para o pet shop inteiro, em qualquer aparelho.</small>
                  {modelo !== MODELOS_PADRAO[aba] && <button type="button" className="g-btn fantasma p g-cv-padrao" onClick={() => mudarModelo(MODELOS_PADRAO[aba])}>Voltar ao texto padrão</button>}
                </label>
              )}
              {exemplo && <p className="g-cv-previa"><span className="g-pp g-muted">Para {chamar(exemplo.nome) || "o tutor"}, vai assim:</span>{mensagem(exemplo)}</p>}
            </div>

            {aba === "volta" && (
              <p className="g-pp g-muted">
                {petsSumidos === 1 ? "1 pet" : `${petsSumidos} pets`} de {sumidos.length === 1 ? "1 tutor" : `${sumidos.length} tutores`}: já vieram, estão há mais de {dias} dias sem vir e não têm nada marcado.
              </p>
            )}
            <p className="g-lb-topo" role="status">
              {!comTelefone.length ? "Nenhum tutor desta lista tem telefone na ficha."
                : faltam.length ? <><b>{faltam.length === 1 ? "1 tutor para chamar" : `${faltam.length} tutores para chamar`}</b>. Toque em Chamar: o WhatsApp abre com a mensagem pronta e você só aperta enviar.</>
                : <span className="g-cv-ok"><Check aria-hidden /><b>Todo mundo desta lista já foi chamado.</b></span>}
            </p>

            {comTelefone.length > 0 && (
              <div className="g-lb-lista">
                {comTelefone.slice(0, mostrar).map((g) => {
                  const zap = linkWhatsApp(g.telefone, mensagem(g))!;
                  const em = feito(g), vez = g.chave === proximo;
                  return (
                    <div key={g.chave} className={`g-lb-linha${vez ? " vez" : ""}${em ? " feito" : ""}`}>
                      {fotos(g)}
                      <span className="t">
                        <b>{nomesDe(g)}</b>
                        <span>{detalhe(g)}</span>
                        <span className="g-tab">Tutor: {g.nome} · {fmtTelefone(g.telefone)}</span>
                      </span>
                      {em ? (
                        <span className="g-lb-feito">
                          <span className="g-tag verde"><Check size={12} aria-hidden />Chamado {dataAmigavel(em)}</span>
                          <a href={zap} target="_blank" rel="noopener noreferrer" onClick={() => chamou(g)}>Chamar de novo</a>
                        </span>
                      ) : (
                        <a className={`g-btn ${vez ? "zap" : "sec"}`} href={zap} target="_blank" rel="noopener noreferrer" onClick={() => chamou(g)}
                          aria-label={`Chamar ${g.nome} no WhatsApp`}>
                          <MessageCircle />Chamar
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {comTelefone.length > mostrar && <button type="button" className="g-btn sec" onClick={() => setMostrar(mostrar + PASSO)}>Mostrar mais</button>}

            {semTelefone.length > 0 && (
              <section className="g-cv-sem">
                <p className="g-rotulo" style={{ marginBottom: 6 }}>Sem telefone</p>
                <div className="g-lb-lista">
                  {semTelefone.slice(0, PASSO).map((g) => (
                    <div key={g.chave} className="g-lb-linha sem">
                      <span className="g-lb-sem" aria-hidden><PhoneOff /></span>
                      <span className="t">
                        <b>{nomesDe(g)}</b>
                        <span>{detalhe(g)}</span>
                        <span>Tutor: {g.nome} · sem telefone</span>
                      </span>
                      <Link className="g-btn sec" href={linkTutor(g.chave)} onClick={aoFechar}>Ver ficha</Link>
                    </div>
                  ))}
                </div>
                <p className="g-muted g-pp" style={{ marginTop: 6 }}>
                  {semTelefone.length > PASSO ? `E mais ${semTelefone.length - PASSO} sem telefone. ` : ""}Coloque o telefone na ficha do tutor para chamar pelo WhatsApp.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </Folha>
  );
}
