"use client";

import { useMemo, useState } from "react";
import { Bug, HeartPulse, MessageCircle, Pill, Plus, RotateCw, ShieldPlus, Syringe, Trash2 } from "lucide-react";
import type { Database } from "@/lib/gestao/banco";
import { dataCompleta, deIsoDia, inicioDoDia, isoDia, linkWhatsApp, semAcento } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile, type Tom } from "../painel";
import { avisarMudanca, Campo, Folha, ok, useAvisos, useSomenteLeitura } from "../ui";
import { primeiroNome } from "./comum";

/* ============================================================
   Ajudantes de estado e cor (a ficha, a lista e a tela Hoje usam os mesmos)
   ============================================================ */

export type CuidadoSaude = Database["public"]["Tables"]["pets_saude"]["Row"];
export type TipoSaude = "vacina" | "vermifugo" | "antipulgas" | "outro";
/** O mínimo de um cuidado para saber o estado dele. */
export type CuidadoResumido = Pick<CuidadoSaude, "pet_id" | "tipo" | "nome" | "aplicado_em" | "vence_em"> & { criado_em?: string | null };

export const TIPOS_SAUDE: { id: TipoSaude; rotulo: string; grupo: string; icone: React.ComponentType<{ size?: number }>; tom: Tom; feminino?: boolean }[] = [
  { id: "vacina", rotulo: "Vacina", grupo: "Vacinas", icone: Syringe, tom: "ceu", feminino: true },
  { id: "vermifugo", rotulo: "Vermífugo", grupo: "Vermífugo", icone: Pill, tom: "menta" },
  { id: "antipulgas", rotulo: "Antipulgas", grupo: "Antipulgas", icone: Bug, tom: "manteiga" },
  { id: "outro", rotulo: "Outro", grupo: "Outros", icone: ShieldPlus, tom: "lilas" },
];
export const tipoSaude = (id: string | null | undefined) => TIPOS_SAUDE.find((t) => t.id === id) ?? TIPOS_SAUDE[3];

/** Vence em até quantos dias para já aparecer em amarelo. */
export const DIAS_AVISO_SAUDE = 30;

export type EstadoSaude = "em_dia" | "vencendo" | "vencido" | "sem";
/** Classe de cor do estado, igual às do `g-tag`: verde, amarelo, vermelho ou nada (cinza). */
export const COR_SAUDE: Record<EstadoSaude, "verde" | "amarelo" | "vermelho" | ""> = { em_dia: "verde", vencendo: "amarelo", vencido: "vermelho", sem: "" };

/** Dias até o vencimento (negativo = já venceu). Sem data devolve null. */
export function diasParaVencer(venceEm: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!venceEm) return null;
  return Math.round((deIsoDia(venceEm).getTime() - inicioDoDia(hoje).getTime()) / 864e5);
}

/** Em dia, vencendo (até `janela` dias), vencido ou sem vencimento. */
export function estadoSaude(venceEm: string | null | undefined, hoje: Date = new Date(), janela = DIAS_AVISO_SAUDE): EstadoSaude {
  const dias = diasParaVencer(venceEm, hoje);
  if (dias == null) return "sem";
  return dias < 0 ? "vencido" : dias <= janela ? "vencendo" : "em_dia";
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);
/** "há 12 dias", "há 3 meses", "há mais de 1 ano" */
function tempo(dias: number) {
  if (dias < 60) return plural(dias, "dia", "dias");
  const meses = Math.floor(dias / 30);
  return meses < 12 ? `${meses} meses` : "mais de 1 ano";
}

/** Texto curto do vencimento: "Venceu há 12 dias", "Vence em 12 dias", "Em dia", "Sem vencimento". */
export function textoVencimento(venceEm: string | null | undefined, hoje: Date = new Date(), janela = DIAS_AVISO_SAUDE): string {
  const dias = diasParaVencer(venceEm, hoje);
  if (dias == null) return "Sem vencimento";
  if (dias < -1) return `Venceu há ${tempo(-dias)}`;
  if (dias === -1) return "Venceu ontem";
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Vence amanhã";
  return dias <= janela ? `Vence em ${dias} dias` : "Em dia";
}

const chave = (c: Pick<CuidadoSaude, "pet_id" | "tipo" | "nome">) => `${c.pet_id}|${c.tipo}|${semAcento(c.nome)}`;
const maisNovo = (a: CuidadoResumido, b: CuidadoResumido) =>
  (b.aplicado_em ?? "").localeCompare(a.aplicado_em ?? "") || (b.vence_em ?? "").localeCompare(a.vence_em ?? "") || (b.criado_em ?? "").localeCompare(a.criado_em ?? "");

/**
 * Só a dose que vale de cada cuidado: quando o mesmo cuidado (pet, tipo e nome) tem mais de uma dose,
 * fica a aplicada por último. Assim a dose antiga, já renovada, não aparece como vencida.
 */
export function cuidadosVigentes<T extends CuidadoResumido>(itens: T[]): T[] {
  const porChave = new Map<string, T>();
  for (const c of itens) {
    const atual = porChave.get(chave(c));
    if (!atual || maisNovo(c, atual) < 0) porChave.set(chave(c), c);
  }
  return [...porChave.values()];
}

/** Do mais urgente para o menos: vencido há mais tempo primeiro, sem vencimento por último. */
export const porUrgencia = (a: Pick<CuidadoSaude, "vence_em" | "nome">, b: Pick<CuidadoSaude, "vence_em" | "nome">) =>
  (a.vence_em ?? "9999").localeCompare(b.vence_em ?? "9999") || a.nome.localeCompare(b.nome, "pt-BR");

/** Os cuidados que pedem atenção: dose que vale, vencida ou vencendo em até `janela` dias. */
export function cuidadosEmAlerta<T extends CuidadoResumido>(itens: T[], hoje: Date = new Date(), janela = DIAS_AVISO_SAUDE): T[] {
  return cuidadosVigentes(itens).filter((c) => ["vencido", "vencendo"].includes(estadoSaude(c.vence_em, hoje, janela))).sort(porUrgencia);
}

export type ResumoSaude = { estado: "vencido" | "vencendo"; texto: string; quantos: number };

/** Etiqueta do pet: "Vacina vencida", "Vacina vence em 12 dias". Null quando está tudo em dia. */
export function resumoSaude(itens: CuidadoResumido[], hoje: Date = new Date(), janela = DIAS_AVISO_SAUDE): ResumoSaude | null {
  const alerta = cuidadosEmAlerta(itens, hoje, janela);
  if (!alerta.length) return null;
  const pior = alerta[0]; // o que vence primeiro: se há vencido, é ele
  const tipo = tipoSaude(pior.tipo);
  const nome = tipo.id === "outro" ? "Cuidado" : tipo.rotulo;
  const dias = diasParaVencer(pior.vence_em, hoje) ?? 0;
  const texto = dias < 0 ? `${nome} ${tipo.feminino ? "vencida" : "vencido"}`
    : dias === 0 ? `${nome} vence hoje` : dias === 1 ? `${nome} vence amanhã` : `${nome} vence em ${dias} dias`;
  return { estado: dias < 0 ? "vencido" : "vencendo", texto, quantos: alerta.length };
}

/** Etiqueta discreta para o perfil e para o cartão do pet. */
export function EtiquetaSaude({ resumo }: { resumo: ResumoSaude | null | undefined }) {
  if (!resumo) return null;
  return (
    <span className={`g-cli-etq ${resumo.estado === "vencido" ? "rosa" : "manteiga"}`} title={resumo.quantos > 1 ? `${resumo.quantos} cuidados pedem atenção` : undefined}>
      <Syringe aria-hidden />{resumo.texto}{resumo.quantos > 1 ? ` +${resumo.quantos - 1}` : ""}
    </span>
  );
}

/** Mensagem pronta para o tutor: só lembra o cuidado e a data. Quem orienta é o veterinário dele. */
export function mensagemSaude(tutorNome: string, petNome: string, petshopNome: string, alerta: Pick<CuidadoSaude, "tipo" | "nome" | "vence_em">[], hoje: Date = new Date()) {
  const linhas = alerta.map((c) => {
    const tipo = tipoSaude(c.tipo);
    const dias = diasParaVencer(c.vence_em, hoje) ?? 0;
    const nome = tipo.id === "outro" || semAcento(c.nome) === semAcento(tipo.rotulo) ? c.nome : `${tipo.rotulo} ${c.nome}`;
    const quando = dias < 0 ? `venceu em ${dataCompleta(c.vence_em!)}` : dias === 0 ? "vence hoje" : `vence em ${dataCompleta(c.vence_em!)}`;
    return `- ${nome}: ${quando}`;
  });
  return [
    `Oi, ${primeiroNome(tutorNome)}! Aqui é do ${petshopNome}. Tudo bem?`,
    "",
    `Passando para lembrar ${alerta.length === 1 ? "de um cuidado" : "dos cuidados"} de ${petNome} que ${alerta.length === 1 ? "está" : "estão"} na nossa ficha:`,
    ...linhas,
    "",
    "Quando puder, vale conversar com o veterinário de vocês para ver a próxima dose. Depois é só nos contar a data nova que a gente atualiza a ficha.",
  ].join("\n");
}

/* ============================================================
   Formulário
   ============================================================ */

const SUGESTOES_CAO = ["V8", "V10", "Antirrábica", "Gripe canina", "Giárdia"];
const SUGESTOES_GATO = ["V3", "V4", "V5", "Antirrábica"];
function sugestoesDe(tipo: TipoSaude, especie: string | null | undefined) {
  if (tipo !== "vacina") return [];
  return especie === "gato" ? SUGESTOES_GATO : especie === "cao" ? SUGESTOES_CAO : [...new Set([...SUGESTOES_CAO, ...SUGESTOES_GATO])];
}

const ATALHOS: { rotulo: string; dias?: number; meses?: number }[] = [
  { rotulo: "+21 dias", dias: 21 },
  { rotulo: "+1 mês", meses: 1 },
  { rotulo: "+3 meses", meses: 3 },
  { rotulo: "+6 meses", meses: 6 },
  { rotulo: "+1 ano", meses: 12 },
];
/** Soma dias ou meses a um dia AAAA-MM-DD. 31/01 + 1 mês cai no último dia de fevereiro. */
function somar(dia: string, { dias, meses }: { dias?: number; meses?: number }) {
  const d = deIsoDia(dia);
  if (dias) return isoDia(new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias));
  const alvo = new Date(d.getFullYear(), d.getMonth() + (meses ?? 0), 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  return isoDia(new Date(alvo.getFullYear(), alvo.getMonth(), Math.min(d.getDate(), ultimo)));
}

type PetDaSaude = { id: string; nome: string; especie?: string | null };

/**
 * Anota ou edita um cuidado de saúde do pet. `inicial` abre um cuidado novo já com tipo e nome
 * (é o "Registrar nova dose"). Depois de gravar ou remover chama `aoSalvar`.
 */
export function FormSaude({ pet, cuidado, inicial, aoFechar, aoSalvar }: {
  pet: PetDaSaude; cuidado?: CuidadoSaude; inicial?: { tipo: string; nome: string };
  aoFechar: () => void; aoSalvar: () => void;
}) {
  const { sb, petshop, user } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const hoje = isoDia(new Date());
  const [tipo, setTipo] = useState<TipoSaude>(tipoSaude(cuidado?.tipo ?? inicial?.tipo ?? "vacina").id);
  const [nome, setNome] = useState(cuidado?.nome ?? inicial?.nome ?? "");
  const [aplicado, setAplicado] = useState(cuidado ? cuidado.aplicado_em ?? "" : hoje);
  const [vence, setVence] = useState(cuidado?.vence_em ?? "");
  const [obs, setObs] = useState(cuidado?.obs ?? "");
  const [ocupado, setOcupado] = useState(false);

  const info = tipoSaude(tipo);
  const sugestoes = sugestoesDe(tipo, pet.especie);
  const base = aplicado || hoje;
  const erroData = aplicado && vence && vence < aplicado ? "O vencimento ficou antes da aplicação." : null;
  const exemplo = tipo === "vacina" ? "Ex.: V10" : tipo === "vermifugo" ? "Nome do vermífugo" : tipo === "antipulgas" ? "Nome do antipulgas" : "Ex.: coleira, exame, retorno";

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || erroData || ocupado) return;
    setOcupado(true);
    try {
      const campos = { tipo, nome: nome.trim(), aplicado_em: aplicado || null, vence_em: vence || null, obs: obs.trim() || null };
      if (cuidado) ok(await sb.from("pets_saude").update(campos).eq("id", cuidado.id).eq("petshop_id", petshop.id).select("id").single());
      else ok(await sb.from("pets_saude").insert({ ...campos, petshop_id: petshop.id, pet_id: pet.id, criado_por: user.id }).select("id").single());
      avisar(cuidado ? "Cuidado atualizado." : `${campos.nome} anotado na ficha de ${pet.nome}.`);
      aoSalvar();
    } catch (err) { avisarErro(err); setOcupado(false); }
  }

  async function remover() {
    if (!cuidado || ocupado) return;
    if (!(await confirmar({ titulo: `Remover ${cuidado.nome}?`, texto: `Esse cuidado sai da ficha de ${pet.nome}. Não dá para desfazer.`, confirmar: "Remover", perigo: true }))) return;
    setOcupado(true);
    try {
      ok(await sb.from("pets_saude").delete().eq("id", cuidado.id).eq("petshop_id", petshop.id).select("id").single());
      avisar("Cuidado removido.");
      aoSalvar();
    } catch (err) { avisarErro(err); setOcupado(false); }
  }

  return (
    <Folha titulo={cuidado ? "Editar cuidado" : inicial ? `Nova dose de ${inicial.nome}` : `Saúde de ${pet.nome}`} aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-saude" disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar"}</button></>}>
      <form id="form-saude" className="g-form" onSubmit={salvar}>
        <div className="g-campo"><span>Tipo</span>
          <div className="g-chips" role="group" aria-label="Tipo">
            {TIPOS_SAUDE.map((t) => (
              <button key={t.id} type="button" className="g-chip g-cli-saude-chip" aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}><t.icone />{t.rotulo}</button>
            ))}
          </div>
        </div>

        <Campo rotulo={tipo === "outro" ? "Qual cuidado" : `Qual ${info.rotulo.toLowerCase()}`}>
          <input className="g-input" required maxLength={80} placeholder={exemplo} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!nome} />
        </Campo>
        {sugestoes.length > 0 && (
          <div className="g-chips g-cli-saude-sug" role="group" aria-label="Sugestões">
            {sugestoes.map((s) => <button key={s} type="button" className="g-chip" aria-pressed={semAcento(nome) === semAcento(s)} onClick={() => setNome(s)}>{s}</button>)}
          </div>
        )}

        <Campo rotulo={info.feminino ? "Aplicada em" : "Aplicado em"}>
          <input className="g-input" type="date" max={hoje} value={aplicado} onChange={(e) => setAplicado(e.target.value)} />
        </Campo>

        <Campo rotulo="Próxima dose ou vencimento" erro={erroData} dica="Em branco fica sem vencimento. A data é a que o veterinário passou.">
          <input className="g-input" type="date" value={vence} onChange={(e) => setVence(e.target.value)} />
        </Campo>
        <div className="g-chips g-cli-saude-sug" role="group" aria-label="Atalhos de data">
          {ATALHOS.map((a) => {
            const dia = somar(base, a);
            return <button key={a.rotulo} type="button" className="g-chip" aria-pressed={vence === dia} onClick={() => setVence(vence === dia ? "" : dia)}>{a.rotulo}</button>;
          })}
        </div>

        <Campo rotulo="Observação">
          <textarea className="g-textarea" maxLength={300} placeholder="Ex.: clínica, lote, reação" value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>

        {cuidado && <div><button type="button" className="g-btn perigo p" onClick={() => void remover()} disabled={ocupado}><Trash2 />Remover da ficha</button></div>}
      </form>
    </Folha>
  );
}

/* ============================================================
   Cartão "Saúde" da ficha do pet
   ============================================================ */

type Aberto = { cuidado?: CuidadoSaude; inicial?: { tipo: string; nome: string } };

export function CartaoSaude({ pet, tutor, itens, erro, aoMudar }: {
  pet: PetDaSaude; tutor: { nome: string; telefone: string | null } | null;
  /** null = não deu para carregar (o texto vem em `erro`). */
  itens: CuidadoSaude[] | null; erro?: string | null;
  /** Depois de gravar ou remover: a ficha busca de novo. */
  aoMudar: () => void;
}) {
  const { petshop } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [verAntigas, setVerAntigas] = useState(false);

  const { grupos, alerta, antigas } = useMemo(() => {
    const hoje = new Date();
    const todos = itens ?? [];
    const valem = new Set(cuidadosVigentes(todos).map((c) => c.id));
    const grupos = TIPOS_SAUDE.map((t) => {
      const doTipo = todos.filter((c) => tipoSaude(c.tipo).id === t.id);
      return {
        tipo: t,
        vigentes: doTipo.filter((c) => valem.has(c.id)).sort(porUrgencia),
        antigas: doTipo.filter((c) => !valem.has(c.id)).sort((a, b) => (b.aplicado_em ?? "").localeCompare(a.aplicado_em ?? "")),
      };
    }).filter((g) => g.vigentes.length || g.antigas.length);
    return { grupos, alerta: cuidadosEmAlerta(todos, hoje), antigas: todos.length - valem.size };
  }, [itens]);

  const abrir = (a: Aberto) => { if (!somenteLeitura()) setAberto(a); };
  const hoje = new Date();
  const vencidos = alerta.filter((c) => estadoSaude(c.vence_em, hoje) === "vencido").length;
  const zap = tutor && alerta.length ? linkWhatsApp(tutor.telefone, mensagemSaude(tutor.nome, pet.nome, petshop.nome, alerta, hoje)) : null;

  function linha(c: CuidadoSaude, antiga: boolean) {
    const estado = antiga ? "sem" : estadoSaude(c.vence_em, hoje);
    const fem = tipoSaude(c.tipo).feminino;
    const datas = [
      c.aplicado_em ? `${fem ? "Aplicada" : "Aplicado"} em ${dataCompleta(c.aplicado_em)}` : null,
      c.vence_em ? `${antiga || estado === "vencido" ? "venceu" : "vence"} em ${dataCompleta(c.vence_em)}` : null,
    ].filter(Boolean).join(" · ") || "Sem data anotada";
    return (
      <li key={c.id} className={`g-cli-saude-linha${antiga ? " antiga" : ""}`}>
        <button type="button" className="g-cli-saude-item" onClick={() => abrir({ cuidado: c })} aria-label={`Editar ${c.nome}`}>
          <span className="g-cli-saude-t">
            <b>{c.nome}</b>
            <span>{datas}</span>
            {c.obs?.trim() && <span className="g-cli-saude-obs">{c.obs}</span>}
          </span>
          <span className={`g-tag ${COR_SAUDE[estado]}`}>{antiga ? "Dose anterior" : textoVencimento(c.vence_em, hoje)}</span>
        </button>
        {!antiga && (
          <button type="button" className="g-btn fantasma p g-cli-saude-dose" title="Registrar nova dose" aria-label={`Registrar nova dose de ${c.nome}`}
            onClick={() => abrir({ inicial: { tipo: c.tipo, nome: c.nome } })}><RotateCw /><span>Nova dose</span></button>
        )}
      </li>
    );
  }

  return (
    <section className="g-card g-cli-saude">
      <div className="g-card-t">
        <h3><Tile icone={HeartPulse} tom="ceu" tamanho="p" />Saúde</h3>
        <button type="button" className="g-btn sec p" onClick={() => abrir({})}><Plus />Adicionar</button>
      </div>

      {itens == null ? <p className="g-erro">{erro ? `Não consegui carregar os cuidados. ${erro}` : "Não consegui carregar os cuidados."}</p>
      : !itens.length ? <p className="g-muted g-p">Nada anotado ainda. Guarde aqui as vacinas, o vermífugo e o antipulgas de {pet.nome} para lembrar o tutor na hora certa.</p>
      : (
        <>
          {alerta.length > 0 && (
            <div className={`g-cli-saude-aviso${vencidos ? " vencido" : ""}`} role="note">
              <span className="g-cresce">
                <b>{vencidos ? (vencidos === 1 ? "1 cuidado vencido" : `${vencidos} cuidados vencidos`) : alerta.length === 1 ? "1 cuidado vencendo" : `${alerta.length} cuidados vencendo`}</b>
                <span>{vencidos && alerta.length > vencidos ? `e ${alerta.length - vencidos} vencendo nos próximos ${DIAS_AVISO_SAUDE} dias. ` : ""}
                  {zap ? "Um lembrete ajuda o tutor a falar com o veterinário dele." : tutor ? "O tutor está sem telefone na ficha." : "Este pet está sem tutor na ficha."}</span>
              </span>
              {zap && <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Avisar o tutor</a>}
            </div>
          )}

          <div className="g-cli-saude-grupos">
            {grupos.map((g) => (
              <div key={g.tipo.id} className="g-cli-saude-grupo">
                <div className="g-cli-saude-g"><Tile icone={g.tipo.icone} tom={g.tipo.tom} tamanho="p" /><span className="g-rotulo">{g.tipo.grupo}</span></div>
                <ul>
                  {g.vigentes.map((c) => linha(c, false))}
                  {verAntigas && g.antigas.map((c) => linha(c, true))}
                </ul>
              </div>
            ))}
          </div>
          {antigas > 0 && (
            <button type="button" className="g-btn fantasma p g-cli-saude-mais" aria-expanded={verAntigas} onClick={() => setVerAntigas(!verAntigas)}>
              {verAntigas ? "Esconder doses anteriores" : antigas === 1 ? "Ver 1 dose anterior" : `Ver ${antigas} doses anteriores`}
            </button>
          )}
        </>
      )}

      {aberto && (
        <FormSaude pet={pet} cuidado={aberto.cuidado} inicial={aberto.inicial} aoFechar={() => setAberto(null)}
          aoSalvar={() => { setAberto(null); aoMudar(); avisarMudanca(); }} />
      )}
    </section>
  );
}
