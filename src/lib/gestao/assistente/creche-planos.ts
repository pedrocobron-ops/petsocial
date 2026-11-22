import { horarioDaCreche } from "../horario-loja";
import type Anthropic from "@anthropic-ai/sdk";
import type { Horario } from "../tipos";
import type { Contexto } from "./ferramentas";
import { centavos } from "../util";

/**
 * Mozart: os planos de mensalista da creche (só consulta). "A Luna vem quinta?", "O tutor da Luna avisou que ela não vem
 * na quinta": a creche não tem horário na agenda; quem vem é dado pelo plano (dias da semana), pelas faltas e pela chamada.
 * Valores só para quem recebe (vejoFinanceiro): o banco também não entrega `creche_planos_valores` para quem não recebe.
 * Ferramenta à parte, registrada com uma linha em ferramentas.ts.
 */
export const FERRAMENTA_PLANOS_CRECHE: Anthropic.Tool & { grava: false } = {
  grava: false,
  name: "ver_planos_creche",
  description: "Creche: planos de mensalista (cães que vêm em dias fixos da semana e pagam por mês). Mostra os dias da semana de cada plano, se o pet é esperado hoje e o que aconteceu na chamada, os próximos dias do plano (com as faltas já avisadas), presenças, faltas, reposições e dias extras do mês, o saldo de reposição e o táxi pet (leva e traz) do plano: taxi diz se o plano tem táxi (ida, volta ou ida e volta); para quem recebe, o preço do táxi (por dia que veio ou fixo por mês) e os dias de táxi já anotados que ainda vão entrar na cobrança. Use para perguntas sobre mensalistas (\"a Luna vem quinta?\", \"quem vem hoje na creche?\") e sempre que falarem de falta ou dia de um mensalista: a creche não usa a agenda de horários. Com pet_id, só os planos daquele pet.",
  input_schema: {
    type: "object", additionalProperties: false, required: [],
    properties: {
      pet_id: { type: "string", description: "id do pet (de buscar_pets). Sem ele, todos os mensalistas ativos." },
      dias: { type: "number", description: "Quantos dias à frente listar os próximos dias do plano. Padrão: 14, máximo 60." },
    },
  },
};

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const somaDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const dow = (dia: string) => new Date(`${dia}T00:00:00Z`).getUTCDay();
const dataCurta = (dia: string) => `${DIAS[dow(dia)]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const localDia = (iso: string, fusoMin: number) => new Date(new Date(iso).getTime() + fusoMin * 60000).toISOString().slice(0, 10);
const localHora = (iso: string, fusoMin: number) => new Date(new Date(iso).getTime() + fusoMin * 60000).toISOString().slice(11, 16);

type Plano = { id: string; pet_id: string; dias: number[]; taxi?: string | null; inicio: string; fim: string | null; pausa_de: string | null; pausa_ate: string | null; vence_dia: number;
  pets: { id: string; nome: string; ativo: boolean; clientes: { nome: string } | null } | null };

export async function consultarPlanosDaCreche(c: Contexto, e: Record<string, unknown>): Promise<{ resultado: unknown }> {
  const { sb, petshop } = c;
  const hoje = c.agora.slice(0, 10);
  const n = Math.max(1, Math.min(60, typeof e.dias === "number" && Number.isFinite(e.dias) ? Math.round(e.dias) : 14));
  const petId = typeof e.pet_id === "string" && RE_UUID.test(e.pet_id) ? e.pet_id : null;
  const mesDe = `${hoje.slice(0, 8)}01`, ate = somaDias(hoje, n);
  let q = sb.from("creche_planos").select("id, pet_id, dias, taxi, inicio, fim, pausa_de, pausa_ate, vence_dia, pets(id, nome, ativo, clientes(nome))").eq("petshop_id", petshop.id).order("inicio").limit(500);
  if (petId) q = q.eq("pet_id", petId);
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  // sem pet: só os planos que valem de hoje em diante; com pet, também o último encerrado (para dizer que acabou)
  const planos = ((r.data ?? []) as unknown as Plano[]).filter((p) => p.pets?.ativo !== false && (petId || !p.fim || p.fim >= hoje));
  if (!planos.length) return { resultado: { planos: [], aviso: petId ? "Esse pet não tem plano de mensalista na creche." : "A creche não tem mensalistas com plano ativo." } };
  const pets = [...new Set(planos.map((p) => p.pet_id))];
  const comTaxi = planos.filter((p) => p.taxi).map((p) => p.id);
  const [faltas, presencas, fechados, valores, taxis] = await Promise.all([
    sb.from("creche_faltas").select("pet_id, dia, avisou").eq("petshop_id", petshop.id).in("pet_id", pets).gte("dia", mesDe).lte("dia", ate).limit(2000),
    sb.from("estadias").select("pet_id, status, entrada, saida, mensalista, dia").eq("petshop_id", petshop.id).eq("tipo", "creche").neq("status", "cancelada")
      .in("pet_id", pets).gte("dia", mesDe).lte("dia", ate).limit(2000),
    sb.from("dias_especiais").select("dia").eq("petshop_id", petshop.id).eq("fechado", true).gte("dia", mesDe).lte("dia", ate).limit(500),
    c.vejoFinanceiro ? sb.from("creche_planos_valores").select("plano_id, valor_mensal, valor_extra, taxi_valor, taxi_modo").eq("petshop_id", petshop.id).in("plano_id", planos.map((p) => p.id)).limit(500) : null,
    // dias de táxi anotados (o pet chegou pela Chamada) que ainda não entraram numa cobrança
    c.vejoFinanceiro && comTaxi.length ? sb.from("creche_taxi").select("plano_id, valor").eq("petshop_id", petshop.id).in("plano_id", comTaxi).is("cobranca_id", null).limit(2000) : null,
  ]);
  const fechado = new Set((fechados.data ?? []).map((d) => d.dia));
  const horario = horarioDaCreche(petshop) as Horario | null;
  const abre = (dia: string) => { const h = horario?.[String(dow(dia))]; const algum = [0, 1, 2, 3, 4, 5, 6].some((i) => horario?.[String(i)]); return !algum || Boolean(h && h.abre && h.fecha); };
  const esperado = (p: Plano, dia: string) => p.inicio <= dia && (!p.fim || p.fim >= dia) && !(p.pausa_de && p.pausa_ate && dia >= p.pausa_de && dia <= p.pausa_ate)
    && p.dias.includes(dow(dia)) && abre(dia) && !fechado.has(dia);
  const faltasDe = (pet: string) => (faltas.data ?? []).filter((f) => f.pet_id === pet);
  const vindasDe = (pet: string) => (presencas.data ?? []).filter((x) => x.pet_id === pet);
  const valor = new Map((valores?.data ?? []).map((v) => [v.plano_id, v]));
  const taxiAnotado = new Map<string, { dias: number; valor: number }>();
  for (const t of taxis?.data ?? []) {
    if (!t.plano_id) continue;
    const x = taxiAnotado.get(t.plano_id) ?? { dias: 0, valor: 0 };
    taxiAnotado.set(t.plano_id, { dias: x.dias + 1, valor: centavos((x.valor + Number(t.valor))) });
  }
  const NOME_TAXI: Record<string, string> = { ida: "só a ida (buscar em casa)", volta: "só a volta (levar para casa)", ida_volta: "ida e volta (buscar e levar)" };

  const lista = planos.map((p) => {
    const fs = faltasDe(p.pet_id), vs = vindasDe(p.pet_id);
    const vindaHoje = vs.find((x) => x.dia === hoje);
    const faltaHoje = fs.find((f) => f.dia === hoje);
    const hojeEsperado = esperado(p, hoje);
    const estadoHoje = vindaHoje
      ? (vindaHoje.status === "reservada" ? "dia extra reservado, ainda não chegou" : vindaHoje.status === "em_casa" ? `na casa desde ${localHora(vindaHoje.entrada, c.fusoMin)}` : `veio e saiu${vindaHoje.saida ? ` às ${localHora(vindaHoje.saida, c.fusoMin)}` : ""}`)
      : faltaHoje ? `faltou${faltaHoje.avisou ? " (avisou)" : ""}` : hojeEsperado ? "esperado, ainda não chegou" : "hoje não é dia do plano";
    const proximos: { dia: string; estado: string }[] = [];
    for (let d = somaDias(hoje, 1); d <= ate; d = somaDias(d, 1)) {
      const f = fs.find((x) => x.dia === d), extra = vs.find((x) => x.dia === d);
      if (extra) proximos.push({ dia: dataCurta(d), estado: extra.mensalista === "reposicao" ? "reposição marcada" : "dia extra reservado" });
      else if (esperado(p, d)) proximos.push({ dia: dataCurta(d), estado: f ? "vai faltar (o tutor avisou)" : "esperado" });
    }
    const doMes = vs.filter((x) => x.dia && x.dia >= mesDe && x.dia <= hoje && x.status !== "reservada");
    const v = valor.get(p.id);
    return {
      plano_id: p.id, pet_id: p.pet_id, pet: p.pets?.nome ?? "pet removido", tutor: p.pets?.clientes?.nome ?? null,
      dias_da_semana: [...p.dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DIAS[d]),
      comeca: p.inicio > hoje ? dataCurta(p.inicio) : undefined, termina: p.fim ? dataCurta(p.fim) : undefined,
      ...(p.fim && p.fim < hoje ? { encerrado: true } : {}),
      ...(p.pausa_de && p.pausa_ate && p.pausa_ate >= hoje ? { pausa: `${dataCurta(p.pausa_de)} a ${dataCurta(p.pausa_ate)}` } : {}),
      hoje: estadoHoje, esperado_hoje: hojeEsperado && !faltaHoje,
      proximos_dias: proximos,
      mes_ate_hoje: {
        presencas_do_plano: doMes.filter((x) => x.mensalista === "plano").length,
        faltas: fs.filter((f) => f.dia <= hoje).map((f) => `${dataCurta(f.dia)}${f.avisou ? " (avisou)" : ""}`),
        reposicoes: doMes.filter((x) => x.mensalista === "reposicao").map((x) => dataCurta(x.dia!)),
        dias_extras: doMes.filter((x) => x.mensalista === "extra").map((x) => dataCurta(x.dia!)),
      },
      ...(c.vejoFinanceiro && v ? { mensalidade: Number(v.valor_mensal), vence_dia: p.vence_dia, ...(v.valor_extra != null ? { preco_dia_extra: Number(v.valor_extra) } : {}) } : {}),
      taxi: p.taxi ? NOME_TAXI[p.taxi] ?? p.taxi : "sem táxi",
      ...(p.taxi && c.vejoFinanceiro && v ? {
        taxi_preco: v.taxi_valor != null && Number(v.taxi_valor) > 0 ? (v.taxi_modo === "mes" ? `${Number(v.taxi_valor)} fixo por mês (entra na cobrança do próprio mês)` : `${Number(v.taxi_valor)} por dia que veio (os dias de um mês entram na cobrança do mês seguinte)`) : "sem preço (só aparece no Leva e traz)",
        ...(taxiAnotado.get(p.id) ? { taxi_dias_anotados_sem_cobranca: taxiAnotado.get(p.id)!.dias, taxi_valor_anotado_sem_cobranca: taxiAnotado.get(p.id)!.valor } : {}),
      } : {}),
    };
  });
  return {
    resultado: {
      hoje: dataCurta(hoje), planos: lista,
      taxi: "Táxi pet do mensalista fica no plano (Creche, Mensalistas). Nos dias do plano o pet entra sozinho na tela Leva e traz da Creche; o valor do mês aparece em Cobranças, Gerar cobranças (linha Táxi pet).",
      como_anotar_falta_avisada: "Falta de um dia que ainda vai chegar: em Creche, Mensalistas, toque no pet e em Vai faltar (ou na Chamada, escolha o dia). Falta de hoje: na Chamada, Faltou e Avisou. Você não grava falta: diga isso à pessoa.",
    },
  };
}
