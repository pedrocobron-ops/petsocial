import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto, Resumo } from "./ferramentas";
import type { Horario, Servico } from "../tipos";
import { diariaSugerida } from "../hotel";
import { nomeDaCasa, usaCasa, usaModulo } from "../modulos";
import { brl, semAcento } from "../util";
import { horarioDaArea } from "../horario-loja";

/**
 * Mozart: reserva de creche e de hotel ("coloca a Pipoca na creche amanhã", "o Thor dorme aqui de sexta a domingo").
 * Creche e hotel não são horário da agenda: a reserva vai para Creche e hotel (a chamada, as vagas e a mensalidade
 * enxergam), igual ao botão Nova reserva da tela. Mensalista num dia do plano não precisa reservar; em outro dia,
 * vira dia extra do plano (a mesma função da tela, `creche_reservar_extra`).
 * Ferramenta à parte, registrada com poucas linhas em ferramentas.ts.
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };
type Entrada = Record<string, unknown>;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const dow = (dia: string) => new Date(`${dia}T00:00:00Z`).getUTCDay();
const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const dataCurta = (dia: string) => `${DIAS[dow(dia)]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const paraUtc = (local: string, fusoMin: number) => new Date(Date.parse(`${local}:00Z`) - fusoMin * 60000).toISOString();
const paraLocal = (iso: string, fusoMin: number) => new Date(new Date(iso).getTime() + fusoMin * 60000).toISOString().slice(0, 16);
const TIPO: Record<string, string> = { creche: "Creche", hotel: "Hotel" };

export const FERRAMENTA_RESERVAR_ESTADIA: Def = {
  grava: true,
  name: "reservar_estadia",
  description: "Creche e hotel: reserva para um dia que ainda vai chegar (\"coloca a Pipoca na creche amanhã\", \"o Thor dorme aqui de sexta a domingo\"). A reserva entra em Creche e hotel, com as vagas, a chamada e a mensalidade, nunca na agenda de horários. Creche: passe os dias (um ou mais, AAAA-MM-DD). Hotel: passe o dia da entrada e o dia da saída. Mensalista num dia do plano não precisa de reserva (a ferramenta avisa); em outro dia, vira dia extra do plano. Pet chegando agora é fazer_checkin.",
  input_schema: {
    type: "object", additionalProperties: false, required: ["pet_id", "tipo"],
    properties: {
      pet_id: { type: "string" },
      tipo: { type: "string", enum: ["creche", "hotel"] },
      dias: { type: "array", items: { type: "string" }, description: "Creche: os dias (AAAA-MM-DD), até 10. Hotel: só o dia da entrada." },
      saida: { type: "string", description: "Hotel: o dia da saída (AAAA-MM-DD)" },
      hora: { type: "string", description: "Hora da chegada (HH:mm), se a pessoa disse" },
      obs: { type: "string", description: "Ração, remédio, recado" },
    },
  },
};

/** Serviço da agenda que é, na verdade, creche ou hotel (categoria ou nome). */
export function servicoDeCasa(s: Pick<Servico, "nome" | "categoria">): "creche" | "hotel" | null {
  if (s.categoria === "creche") return "creche";
  if (s.categoria === "hotel") return "hotel";
  const n = semAcento(s.nome ?? "");
  if (/\bcreche\b|day ?care|\bdaycare\b/.test(n)) return "creche";
  if (/\bhotel\b|hotelzinho|hospedagem|pernoite|\bpousada\b/.test(n)) return "hotel";
  return null;
}

/**
 * Recusa marcar na agenda um serviço que é creche ou hotel quando o pet shop usa Creche e hotel (o serviço pode ter sido
 * cadastrado na lista por engano, ou vindo da foto da tabela de preços). Devolve a frase para o modelo, ou null.
 */
export function agendaNaoEhCasa(c: Pick<Contexto, "petshop">, s: Pick<Servico, "nome" | "categoria">): string | null {
  const casa = servicoDeCasa(s);
  if (!casa || !usaCasa(c.petshop)) return null;
  const tem = usaModulo(c.petshop, casa);
  return `"${s.nome}" é ${casa === "creche" ? "creche" : "hotel"}, e ${casa === "creche" ? "creche" : "hotel"} não vai para a agenda de horários (a chamada, as vagas e a mensalidade não enxergariam). Nada foi marcado. ${tem
    ? `Use reservar_estadia com tipo "${casa}" para um dia que vai chegar, ou fazer_checkin se o pet chegou agora.`
    : `Este pet shop não usa ${casa === "creche" ? "a Creche" : "o Hotel"} no sistema: diga que dá para ligar em Meu pet shop, O que você usa.`}`;
}

type Plano = { id: string; dias: number[]; inicio: string; fim: string | null; pausa_de: string | null; pausa_ate: string | null };
type Aberta = { id: string; tipo: string; entrada: string; saida_prevista: string | null; status: string };
type Dia = { dia: string; entrada: string; saida: string | null; extra: Plano | null };

/** O dia na creche ou no hotel: pelo horário próprio deles (Meu pet shop), ou pelo do pet shop. */
function horarioDoDia(c: Contexto, dia: string, tipo: string) {
  const h = horarioDaArea(c.petshop, tipo === "hotel" ? "hotel" : "creche") as Horario | null;
  const algum = [0, 1, 2, 3, 4, 5, 6].some((i) => h?.[String(i)]);
  const d = h?.[String(dow(dia))];
  return { aberto: !algum || Boolean(d && d.abre && d.fecha), abre: d?.abre ?? null, fecha: d?.fecha ?? null };
}
const doPlano = (p: Plano, dia: string) => p.inicio <= dia && (!p.fim || p.fim >= dia) && p.dias.includes(dow(dia))
  && !(p.pausa_de && p.pausa_ate && dia >= p.pausa_de && dia <= p.pausa_ate);
const planoValeNoDia = (p: Plano, dia: string) => p.inicio <= dia && (!p.fim || p.fim >= dia);

/** Confere o pedido e monta o que vai ser gravado. `erro` cria a mensagem de uso (vai para o modelo). */
async function plano(c: Contexto, e: Entrada, erro: (m: string) => Error) {
  const tipo = String(e.tipo);
  if (!TIPO[tipo]) throw erro("tipo deve ser creche ou hotel. Pergunte se o pet vem passar o dia (creche) ou dormir (hotel).");
  if (!usaModulo(c.petshop, tipo as "creche" | "hotel")) throw erro(`Este pet shop não usa ${tipo === "creche" ? "a Creche" : "o Hotel"} no sistema. Diga que dá para ligar em Meu pet shop, O que você usa.`);
  const pid = typeof e.pet_id === "string" && RE_UUID.test(e.pet_id) ? e.pet_id : null;
  if (!pid) throw erro("pet_id inválido: use buscar_pets para pegar o id.");
  const { data: pet } = await c.sb.from("pets").select("id, nome, porte, alertas, clientes(id, nome)").eq("petshop_id", c.petshop.id).eq("id", pid).maybeSingle();
  if (!pet) throw erro("Pet não encontrado: use buscar_pets.");
  const hoje = c.agora.slice(0, 10);
  const lista = (Array.isArray(e.dias) ? e.dias : typeof e.dias === "string" ? [e.dias] : []).map((x) => String(x).slice(0, 10));
  const dias = [...new Set(lista)].sort();
  if (!dias.length || dias.some((d) => !RE_DIA.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`)))) throw erro("Passe os dias no formato AAAA-MM-DD.");
  if (dias.length > 10) throw erro("No máximo 10 dias de creche por vez.");
  if (dias[0] < hoje) throw erro(`${dataCurta(dias[0])} já passou. Para um dia que já passou, a reserva é feita na tela Creche e hotel.`);
  if (dias[dias.length - 1] > somaDias(hoje, 365)) throw erro("Essa data está longe demais (até um ano).");
  const hora = typeof e.hora === "string" && RE_HORA.test(e.hora) ? e.hora : null;
  if (e.hora && !hora) throw erro("hora no formato HH:mm.");
  let saidaHotel: string | null = null;
  if (tipo === "hotel") {
    if (dias.length > 1) throw erro("Hotel: passe só o dia da entrada em dias e o dia da saída em saida.");
    saidaHotel = typeof e.saida === "string" ? e.saida.slice(0, 10) : null;
    if (!saidaHotel || !RE_DIA.test(saidaHotel)) throw erro("Falta o dia da saída do hotel: pergunte até quando o pet fica.");
    if (saidaHotel <= dias[0]) throw erro("A saída do hotel precisa ser depois do dia da entrada.");
    if (saidaHotel > somaDias(dias[0], 60)) throw erro("No máximo 60 noites por reserva.");
  }
  const ultimo = tipo === "hotel" ? saidaHotel! : dias[dias.length - 1];
  const [fechadosR, abertasR, planosR] = await Promise.all([
    c.sb.from("dias_especiais").select("dia").eq("petshop_id", c.petshop.id).eq("fechado", true).gte("dia", dias[0]).lte("dia", ultimo).limit(400),
    c.sb.from("estadias").select("id, tipo, entrada, saida_prevista, status").eq("petshop_id", c.petshop.id).eq("pet_id", pet.id).in("status", ["reservada", "em_casa"]).limit(200),
    tipo === "creche" ? c.sb.from("creche_planos").select("id, dias, inicio, fim, pausa_de, pausa_ate").eq("petshop_id", c.petshop.id).eq("pet_id", pet.id).limit(20) : Promise.resolve({ data: [] as Plano[] }),
  ]);
  const fechados = new Set((fechadosR.data ?? []).map((x) => x.dia));
  const abertas = (abertasR.data ?? []) as Aberta[];
  const planos = (planosR.data ?? []) as Plano[];
  // os dias que cada estadia aberta ocupa (no horário local; quem está na casa sem saída ocupa até hoje)
  const ocupa = (x: Aberta, de: string, ate: string) => {
    const a = paraLocal(x.entrada, c.fusoMin).slice(0, 10);
    let b = x.saida_prevista ? paraLocal(x.saida_prevista, c.fusoMin).slice(0, 10) : x.status === "em_casa" ? (x.tipo === "creche" ? hoje : "9999-12-31") : a;
    if (b < a) b = a;
    return a <= ate && b >= de;
  };

  const pedidos: Dia[] = [];
  if (tipo === "creche") {
    const nosDoPlano = dias.filter((d) => planos.some((p) => doPlano(p, d)) && horarioDoDia(c, d, tipo).aberto && !fechados.has(d));
    if (nosDoPlano.length) throw erro(`${pet.nome} é mensalista e ${nosDoPlano.map(dataCurta).join(", ")} ${nosDoPlano.length === 1 ? "já é dia" : "já são dias"} do plano: não precisa reservar. Nada foi feito. No dia, a chegada é marcada na Chamada da creche. Se o tutor avisou que ele não vem, isso é em Creche, Mensalistas, Vai faltar.`);
    const fechadas = dias.filter((d) => !horarioDoDia(c, d, tipo).aberto || fechados.has(d));
    if (fechadas.length) throw erro(`A creche não abre ${fechadas.map(dataCurta).join(", ")} (horário da creche em Meu pet shop ou dia marcado como fechado). Nada foi feito. Avise a pessoa.`);
    for (const d of dias) {
      const h = horarioDoDia(c, d, tipo);
      const bate = abertas.find((x) => ocupa(x, d, d));
      if (bate) throw erro(`${pet.nome} já tem ${bate.status === "em_casa" ? "estadia aberta" : `reserva de ${TIPO[bate.tipo]?.toLowerCase() ?? "estadia"}`} em ${dataCurta(d)}. Nada foi feito. Use ver_hospedes para conferir.`);
      const entrada = `${d}T${hora ?? h.abre?.slice(0, 5) ?? "08:00"}`;
      const saida = h.fecha ? `${d}T${h.fecha.slice(0, 5)}` : `${d}T18:00`;
      pedidos.push({ dia: d, entrada, saida: saida > entrada ? saida : null, extra: planos.find((p) => planoValeNoDia(p, d)) ?? null });
    }
  } else {
    const ent = dias[0];
    const bate = abertas.find((x) => ocupa(x, ent, saidaHotel!));
    if (bate) throw erro(`${pet.nome} já tem ${bate.status === "em_casa" ? "estadia aberta" : `reserva de ${TIPO[bate.tipo]?.toLowerCase() ?? "estadia"}`} nessas datas. Nada foi feito. Use ver_hospedes para conferir.`);
    const h = horarioDoDia(c, ent, tipo), hs = horarioDoDia(c, saidaHotel!, tipo);
    pedidos.push({ dia: ent, entrada: `${ent}T${hora ?? h.abre?.slice(0, 5) ?? "08:00"}`, saida: `${saidaHotel}T${hs.fecha?.slice(0, 5) ?? "18:00"}`, extra: null });
  }
  if (pedidos[0].entrada.slice(0, 10) === hoje && pedidos[0].entrada < c.agora) pedidos[0].entrada = c.agora;
  // dia fechado no hotel: o hotel recebe, mas a entrada ou a saída num dia fechado (ou em que o hotel não recebe, pelo
  // horário do hotel em Meu pet shop) merece aviso
  const avisoHotel = tipo === "hotel" ? [dias[0], saidaHotel!].filter((d) => fechados.has(d) || !horarioDoDia(c, d, "hotel").aberto) : [];
  const diaria = c.vejoFinanceiro ? diariaSugerida(c.petshop, tipo, pet.porte) : null;
  return { pet, tipo, pedidos, diaria, avisoHotel, obs: typeof e.obs === "string" ? e.obs.trim().slice(0, 400) || null : null };
}

/** O cartão; null quando o nome não é desta ferramenta. */
export async function descreverEstadia(c: Contexto, nome: string, e: Entrada, erro: (m: string) => Error): Promise<Resumo | null> {
  if (nome !== "reservar_estadia") return null;
  const p = await plano(c, e, erro);
  const tutor = (p.pet.clientes as { nome?: string } | null)?.nome;
  const linhas: [string, string][] = [["Pet", `${p.pet.nome}${tutor ? ` (${tutor})` : ""}`], ["Onde", p.tipo === "creche" ? "Creche (não entra na agenda)" : "Hotel (não entra na agenda)"]];
  if (p.tipo === "creche") {
    linhas.push([p.pedidos.length > 1 ? "Dias" : "Dia", p.pedidos.map((d) => `${dataCurta(d.dia)}${d.entrada.slice(11) !== "08:00" || p.pedidos.length === 1 ? `, chega ${d.entrada.slice(11)}` : ""}`).join("; ")]);
    if (p.pedidos.some((d) => d.extra)) linhas.push(["Plano", "dia extra do plano de mensalista (entra na próxima mensalidade)"]);
  } else {
    const noites = Math.round((Date.parse(`${p.pedidos[0].saida!.slice(0, 10)}T00:00:00Z`) - Date.parse(`${p.pedidos[0].dia}T00:00:00Z`)) / 864e5);
    linhas.push(["Entrada", `${dataCurta(p.pedidos[0].dia)} às ${p.pedidos[0].entrada.slice(11)}`], ["Saída", `${dataCurta(p.pedidos[0].saida!.slice(0, 10))}, ${noites} ${noites === 1 ? "noite" : "noites"}`]);
  }
  if (c.vejoFinanceiro && !p.pedidos.every((d) => d.extra)) linhas.push(["Diária", p.diaria != null ? `${brl(p.diaria)} por ${p.tipo === "hotel" ? "noite" : "dia"} (a de Meu pet shop${p.pet.porte ? `, porte ${p.pet.porte}` : ""})` : "a combinar"]);
  if (p.obs) linhas.push(["Obs.", p.obs]);
  if (p.pet.alertas) linhas.push(["Cuidados", String(p.pet.alertas).slice(0, 300)]);
  if (p.avisoHotel.length) linhas.push(["Atenção", `${p.avisoHotel.map(dataCurta).join(" e ")} ${p.avisoHotel.length > 1 ? "são dias" : "é dia"} em que o hotel não recebe nem entrega pets (dia fechado ou horário do hotel em Meu pet shop)`]);
  return { titulo: p.tipo === "creche" ? "Reservar creche" : "Reservar hotel", linhas };
}

/** Grava (depois do "Pode fazer"); null quando o nome não é desta ferramenta. */
export async function gravarEstadia(c: Contexto, nome: string, e: Entrada, erro: (m: string) => Error): Promise<unknown> {
  if (nome !== "reservar_estadia") return null;
  const p = await plano(c, e, erro);
  const ids: string[] = [];
  for (let i = 0; i < p.pedidos.length; i++) {
    const d = p.pedidos[i];
    if (d.extra) {
      const r = await c.sb.rpc("creche_reservar_extra", { p_plano: d.extra.id, p_dia: d.dia, ...(p.obs ? { p_obs: p.obs } : {}) });
      if (r.error) throw erro(r.error.message);
      ids.push(String(r.data));
      continue;
    }
    // a chave da ação (uma por dia): a mesma confirmação de novo devolve a reserva que já foi marcada
    const chave = c.chave ? `${c.chave}:${i}`.slice(0, 120) : null;
    const campos = {
      petshop_id: c.petshop.id, pet_id: p.pet.id, tipo: p.tipo, status: "reservada",
      entrada: paraUtc(d.entrada, c.fusoMin), saida_prevista: d.saida ? paraUtc(d.saida, c.fusoMin) : null, obs: p.obs,
      // quem não recebe não manda a diária: o banco coloca a sugerida (a do porte, ou a de Meu pet shop)
      ...(c.vejoFinanceiro && p.diaria != null ? { valor_diaria: p.diaria } : {}),
      ...(chave ? { chave } : {}),
    };
    const r = chave
      ? await c.sb.from("estadias").upsert(campos, { onConflict: "petshop_id,chave", ignoreDuplicates: true }).select("id")
      : await c.sb.from("estadias").insert(campos).select("id");
    if (r.error) throw new Error(r.error.message);
    let id: string | null = r.data?.[0]?.id ?? null;
    if (!id && chave) id = (await c.sb.from("estadias").select("id").eq("petshop_id", c.petshop.id).eq("chave", chave).maybeSingle()).data?.id ?? null;
    if (!id) throw erro("Não deu para marcar a reserva. Tente de novo.");
    ids.push(id);
  }
  return { feito: true, reservas: ids.length, estadia_ids: ids, onde: `${nomeDaCasa(c.petshop)}, aba Reservas${p.tipo === "creche" ? " (no dia, aparece na Chamada)" : ""}` };
}
