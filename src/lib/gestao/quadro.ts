import { saudacaoZap } from "./agenda";
import { opcao } from "./opcoes";
import { semAcento } from "./util";

/**
 * Quadro de atendimento (banho e tosa) e leva e traz. Contas sem tela: em que coluna fica cada pet, qual é a próxima etapa,
 * as viagens do motorista, os links do Google Maps e a taxa de leva e traz sugerida na conta.
 *
 * O banco guarda a etapa à parte (tabela quadro_atendimento, migração 20261203): o status do horário continua com o sentido
 * de sempre. Quem não usa o quadro não vê nada mudar: concluído sem passar por ele aparece em Entregue.
 */

export type Etapa = "banho" | "secagem" | "tosa" | "pronto";
export type Coluna = "esperando" | "banho" | "secando" | "pronto" | "entregue";
/** Para onde o quadro manda o pet (quadro_mover). */
export type Destino = "esperando" | Etapa | "entregue";

export const COLUNAS: { id: Coluna; rotulo: string; curto: string }[] = [
  { id: "esperando", rotulo: "Esperando", curto: "Esperando" },
  { id: "banho", rotulo: "No banho", curto: "Banho" },
  { id: "secando", rotulo: "Secando / tosa", curto: "Secando" },
  { id: "pronto", rotulo: "Pronto para buscar", curto: "Pronto" },
  { id: "entregue", rotulo: "Entregue", curto: "Entregue" },
];

export const NOME_DESTINO: Record<Destino, string> = {
  esperando: "Esperando", banho: "No banho", secagem: "Secando", tosa: "Na tosa", pronto: "Pronto para buscar", entregue: "Entregue",
};

/** A linha do quadro de um horário (ou nada, para quem nunca passou por ele). */
export type LinhaQuadro = { etapa: Etapa | null; etapa_em: string | null; chegou_em: string | null; entregue_em: string | null };
type ComStatus = { status: string };

/** Em que coluna o pet aparece. null = não entra no quadro (cancelado ou falta). */
export function colunaDe(a: ComStatus, q: LinhaQuadro | null | undefined): Coluna | null {
  if (a.status === "cancelado" || a.status === "faltou") return null;
  if (a.status === "marcado" || a.status === "confirmado") return "esperando";
  if (q?.entregue_em) return "entregue";
  const e = q?.etapa ?? null;
  if (a.status === "concluido" && !e) return "entregue";
  if (e === "pronto") return "pronto";
  if (e === "secagem" || e === "tosa") return "secando";
  return "banho";
}

/** O próximo passo do botão "Próxima etapa" (null: já está entregue). Sem tosa no horário, pula a tosa. */
export function proximaEtapa(a: ComStatus, q: LinhaQuadro | null | undefined, comTosa: boolean): Destino | null {
  const c = colunaDe(a, q);
  if (c === "esperando") return "banho";
  if (c === "banho") return "secagem";
  if (c === "secando") return q?.etapa === "secagem" && comTosa ? "tosa" : "pronto";
  if (c === "pronto") return "entregue";
  return null;
}

/** Texto do botão "Próxima etapa". */
export function rotuloDoProximo(d: Destino | null): string {
  switch (d) {
    case "banho": return "Chegou: começar o banho";
    case "secagem": return "Foi para a secagem";
    case "tosa": return "Foi para a tosa";
    case "pronto": return "Está pronto";
    case "entregue": return "Entregue ao tutor";
    default: return "";
  }
}

/** Algum serviço do horário é tosa? (decide se a etapa Na tosa entra no "Próxima etapa") */
export const temTosa = (nomes: (string | null | undefined)[]) => nomes.some((n) => /tosa/i.test(n ?? ""));

/** "há 12 min", "há 1 h 05". Com menos de um minuto, "agora". */
export function tempoDesde(iso: string | null | undefined, agora = Date.now()): string | null {
  if (!iso) return null;
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `há ${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}`;
}

/** Alertas curtos do cartão: o que está na ficha do pet e o que a entrada anotou (morde, medo, alergia). */
export function alertasDoPet(alertas: string | null | undefined, entrada?: { temperamento?: string[] | null; cuidados?: string | null } | null): string[] {
  const out: string[] = [];
  const t = entrada?.temperamento ?? [];
  if (t.includes("morde")) out.push("Morde");
  if (t.includes("medo")) out.push("Tem medo");
  if (t.includes("agitado")) out.push("Agitado");
  const texto = [alertas, entrada?.cuidados].filter(Boolean).join(" · ").trim();
  if (texto) {
    const ja = new Set(out.map((x) => semAcento(x)));
    for (const parte of texto.split(/\s*[·;\n]\s*/).map((s) => s.trim()).filter(Boolean)) {
      if (!ja.has(semAcento(parte))) { out.push(parte); ja.add(semAcento(parte)); }
    }
  }
  return out.slice(0, 4);
}

/* ---------- leva e traz ---------- */

export type Perna = "buscar" | "levar";
export type ViagemFeita = { perna: Perna; feito_em: string; feito_por: string | null };

/** Uma viagem do motorista: buscar o pet na casa do tutor ou levar de volta. */
export type Viagem = {
  chave: string; agendamentoId: string; perna: Perna;
  /** Hora de referência da viagem (para a ordem): buscar = início do horário; levar = quando ficou pronto, ou o fim previsto. */
  quando: string;
  /** O pet já está pronto para levar (etapa pronto, entregue no quadro, conta fechada ou tutor avisado). */
  pronto: boolean;
  /** Quando ficou pronto (etapa pronto no quadro ou tutor avisado), se o sistema sabe. */
  prontoEm: string | null;
  feitoEm: string | null; feitoPor: string | null;
  endereco: string | null;
};

type HorarioLevaTraz = {
  id: string; inicio: string; fim: string; status: string; leva_traz: boolean; endereco_leva_traz: string | null; pronto_avisado_em: string | null;
  pets?: { clientes?: { endereco?: string | null } | null } | null;
};

/** As viagens do dia, na ordem do relógio. Cancelados e faltas ficam de fora; o endereço do horário vale mais que o da ficha. */
export function montarViagens(horarios: HorarioLevaTraz[], quadro: Map<string, LinhaQuadro>, feitas: Map<string, ViagemFeita>): Viagem[] {
  const out: Viagem[] = [];
  for (const a of horarios) {
    if (!a.leva_traz || a.status === "cancelado" || a.status === "faltou") continue;
    const q = quadro.get(a.id) ?? null;
    const endereco = (a.endereco_leva_traz ?? "").trim() || (a.pets?.clientes?.endereco ?? "").trim() || null;
    const b = feitas.get(`${a.id}:buscar`), l = feitas.get(`${a.id}:levar`);
    const col = colunaDe(a, q);
    const pronto = col === "pronto" || col === "entregue" || a.status === "concluido" || Boolean(a.pronto_avisado_em);
    const prontoEm = q?.etapa === "pronto" ? q.etapa_em : a.pronto_avisado_em;
    out.push({ chave: `${a.id}:buscar`, agendamentoId: a.id, perna: "buscar", quando: a.inicio, pronto: true, prontoEm: null, feitoEm: b?.feito_em ?? null, feitoPor: b?.feito_por ?? null, endereco });
    out.push({ chave: `${a.id}:levar`, agendamentoId: a.id, perna: "levar", quando: pronto && prontoEm ? prontoEm : a.fim, pronto, prontoEm: pronto ? prontoEm ?? null : null, feitoEm: l?.feito_em ?? null, feitoPor: l?.feito_por ?? null, endereco });
  }
  return out.sort((x, y) => new Date(x.quando).getTime() - new Date(y.quando).getTime() || (x.perna === "buscar" ? -1 : 1));
}

const BUSCA = "https://www.google.com/maps/search/?api=1&query=";
/** Abre o endereço no Google Maps (celular abre o aplicativo). */
export const linkDoMapa = (endereco: string, cidade?: string | null) => `${BUSCA}${encodeURIComponent(comCidade(endereco, cidade))}`;

/** Endereço sem a cidade ganha a cidade do pet shop, para o mapa não procurar em outro lugar. */
function comCidade(endereco: string, cidade?: string | null) {
  const e = endereco.trim();
  const c = (cidade ?? "").trim();
  return c && !semAcento(e).includes(semAcento(c)) ? `${e}, ${c}` : e;
}

/** O Google Maps aceita até 9 paradas no meio do caminho: a rota leva no máximo 10 endereços (9 + o destino). */
export const MAX_PARADAS = 10;
/**
 * Rota com vários endereços, na ordem dada, saindo de onde a pessoa está. Endereço repetido em seguida (dois pets da mesma
 * casa) entra uma vez só. Devolve null sem endereço.
 */
export function linkDaRota(enderecos: string[], cidade?: string | null): { url: string; usados: number; sobraram: number } | null {
  const limpos: string[] = [];
  for (const e of enderecos.map((x) => x.trim()).filter(Boolean)) if (semAcento(limpos[limpos.length - 1] ?? "") !== semAcento(e)) limpos.push(e);
  if (!limpos.length) return null;
  const usados = limpos.slice(0, MAX_PARADAS).map((e) => comCidade(e, cidade));
  const destino = usados[usados.length - 1];
  const meio = usados.slice(0, -1);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}${meio.length ? `&waypoints=${encodeURIComponent(meio.join("|"))}` : ""}&travelmode=driving`;
  return { url, usados: usados.length, sobraram: limpos.length - usados.length };
}

/** "Oi, Ana! Aqui é do Pet X. Estou chegando para buscar o Thor." */
export function textoChegando(p: { tutor?: string | null; pet: string; petshop: string; perna: Perna }) {
  return `${saudacaoZap(p.tutor, p.petshop)} Estou chegando ${p.perna === "buscar" ? `para buscar ${p.pet}` : `com ${p.pet}`}.`;
}

/* ---------- taxa de leva e traz (Meu pet shop) ---------- */

export const CHAVE_TAXA = "taxi.taxa";
export type Bairro = { nome: string; valor: number };
export type TaxaLevaTraz = { modo: "fixo" | "bairro"; valor: number | null; bairros: Bairro[] };

const centavos = (n: number) => Math.round(n * 100) / 100;
const valorOk = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 9999.99 ? centavos(v) : null);

/** A taxa guardada (ou a de quem nunca mexeu: fixa e sem valor). Quem não recebe recebe sem valor (o banco não entrega). */
export function taxaDoLevaTraz(petshop: { opcoes?: unknown }): TaxaLevaTraz {
  const o = opcao<Record<string, unknown> | null>(petshop, CHAVE_TAXA, null);
  if (!o || typeof o !== "object" || Array.isArray(o)) return { modo: "fixo", valor: null, bairros: [] };
  const bairros = (Array.isArray(o.bairros) ? o.bairros : [])
    .map((b) => (b && typeof b === "object" ? { nome: String((b as Bairro).nome ?? "").trim().slice(0, 60), valor: valorOk((b as Bairro).valor) } : null))
    .filter((b): b is Bairro => Boolean(b && b.nome && b.valor != null))
    .slice(0, 60);
  return { modo: o.modo === "bairro" ? "bairro" : "fixo", valor: valorOk(o.valor), bairros };
}

/** Tem algum valor para sugerir? */
export const temTaxa = (t: TaxaLevaTraz) => (t.modo === "fixo" ? t.valor != null && t.valor > 0 : t.bairros.length > 0);

/** O bairro da lista que aparece no endereço (o nome mais comprido que couber, sem acento nem maiúscula). */
export function bairroDoEndereco(endereco: string | null | undefined, bairros: Bairro[]): Bairro | null {
  const e = ` ${semAcento(endereco ?? "").replace(/[^a-z0-9]+/g, " ")} `;
  if (!e.trim()) return null;
  const achados = bairros.filter((b) => {
    const n = semAcento(b.nome).replace(/[^a-z0-9]+/g, " ").trim();
    return n && e.includes(` ${n} `);
  });
  return achados.sort((a, b) => b.nome.length - a.nome.length)[0] ?? null;
}

/** O que a conta sugere para um horário com leva e traz: o valor fixo, o do bairro achado no endereço, ou nada (escolher). */
export function taxaSugerida(t: TaxaLevaTraz, endereco: string | null | undefined): { valor: number; bairro: string | null } | null {
  if (t.modo === "fixo") return t.valor != null && t.valor > 0 ? { valor: t.valor, bairro: null } : null;
  const b = bairroDoEndereco(endereco, t.bairros);
  return b ? { valor: b.valor, bairro: b.nome } : null;
}

/** Valida e arruma o que o dono digitou antes de gravar. */
export function taxaParaGravar(t: TaxaLevaTraz): { ok: TaxaLevaTraz } | { erro: string } {
  if (t.modo === "fixo") {
    if (t.valor != null && (!(t.valor >= 0) || t.valor > 9999.99)) return { erro: "Confira o valor da taxa." };
    return { ok: { modo: "fixo", valor: t.valor == null ? null : centavos(t.valor), bairros: t.bairros } };
  }
  const vistos = new Set<string>();
  const bairros: Bairro[] = [];
  for (const b of t.bairros) {
    const nome = b.nome.trim().replace(/\s+/g, " ");
    if (!nome) continue;
    if (nome.length > 60) return { erro: `O nome "${nome.slice(0, 20)}…" ficou grande demais.` };
    if (!(b.valor >= 0) || b.valor > 9999.99) return { erro: `Confira o valor de ${nome}.` };
    const k = semAcento(nome);
    if (vistos.has(k)) return { erro: `${nome} está duas vezes na lista.` };
    vistos.add(k);
    bairros.push({ nome, valor: centavos(b.valor) });
  }
  if (bairros.length > 60) return { erro: "Até 60 bairros." };
  return { ok: { modo: "bairro", valor: t.valor, bairros } };
}
