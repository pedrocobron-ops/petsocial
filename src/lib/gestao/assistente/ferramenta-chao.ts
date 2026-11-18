import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto, Resumo } from "./ferramentas";
import { horaFalada, lerCuidados, situacaoDaDose, textoDoCuidado, type Cuidado } from "../hotel";
import { colunaDe, NOME_DESTINO, proximaEtapa, temTosa, type Destino, type Etapa, type LinhaQuadro } from "../quadro";
import { semAcento } from "../util";
import { cuidadosLigados } from "../hotel-opcoes";
import { ocorrenciasLigadas } from "../casa-opcoes";

/**
 * Mozart para quem está com a mão molhada (tosador, banhista, monitor da creche e do hotel). Tudo por voz, com o cartão de sempre:
 * - ver_cuidados: a rotina de comida e remédio de quem está na casa, com o que já foi feito, o que está na hora e o que atrasou;
 * - marcar_cuidado: marca uma dose como feita ("dei a ração das 13h da Belinha");
 * - mover_no_quadro: passa o pet para a próxima etapa do Quadro do dia ("o Thor foi para a secagem", "entreguei a Mel");
 * - registrar_ocorrencia: anota uma ocorrência de verdade na estadia (briga, machucado, fuga, vômito), a mesma do botão Ocorrência:
 *   o dono vê no Hoje e ela entra na ficha do pet. Nunca nas Observações.
 * Cada ferramenta só existe para quem tem a área (AREAS_DA_FERRAMENTA, em ferramentas.ts); o banco confere de novo. Sem valores.
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };
type Entrada = Record<string, unknown>;
type Erro = (m: string) => Error;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuid = (v: unknown) => (typeof v === "string" && RE_UUID.test(v) ? v : null);
const S = { type: "string" };
const TIPOS = ["briga", "machucado", "fugiu", "vomitou", "outro"] as const;
const NOME_TIPO: Record<string, string> = { briga: "Briga", machucado: "Machucado", fugiu: "Fugiu", vomitou: "Vomitou", outro: "Outra coisa" };
const DESTINOS = ["banho", "secagem", "tosa", "pronto", "entregue"] as const;

export const FERRAMENTAS_CHAO: Def[] = [
  { grava: false, name: "ver_cuidados",
    description: "Creche e hotel: a rotina de comida e remédio combinada para quem está na casa agora, dose por dose, com o que já foi feito hoje (por quem e a que horas), o que está na hora e o que está atrasado. Use para \"o que falta dar?\", \"a Belinha já tomou o remédio?\", \"tem remédio atrasado?\". Responda sempre por esta lista, nunca pelas observações. Com pet_id, só aquele pet.",
    input_schema: { type: "object", properties: { pet_id: S }, required: [], additionalProperties: false } },
  { grava: true, name: "marcar_cuidado",
    description: "Creche e hotel: marca como feita uma dose de comida ou de remédio de um pet que está na casa (\"dei a ração das 13h da Belinha\", \"a Mel tomou o Gardenal\"). Passe o pet_id, o que foi dado (o nome como a pessoa disse: ração, Gardenal, remédio) e a hora combinada da dose (HH:mm) se a pessoa disse; sem a hora, vale a dose pendente mais perto de agora. Só marca dose que está na lista combinada (ver_cuidados).",
    input_schema: { type: "object", properties: { pet_id: S, cuidado: { ...S, description: "O que foi dado, como a pessoa falou: ração, sachê, remédio, Gardenal" }, hora: { ...S, description: "Hora combinada da dose, HH:mm" } }, required: ["pet_id"], additionalProperties: false } },
  { grava: true, name: "mover_no_quadro",
    description: "Banho e tosa: passa o pet de hoje para outra etapa do Quadro do dia (\"o Thor chegou\", \"a Mel foi para a secagem\", \"o Bob está pronto\", \"entreguei a Nina\"). Passe pet_id (ou agendamento_id) e, se a pessoa disse a etapa, para: banho (chegou, começou), secagem, tosa, pronto ou entregue. Sem para, vai para a próxima etapa. Entregue conclui o atendimento; sem conta fechada, ele fica como Falta cobrar para o caixa.",
    input_schema: { type: "object", properties: { pet_id: S, agendamento_id: S, para: { type: "string", enum: [...DESTINOS] } }, required: [], additionalProperties: false } },
  { grava: true, name: "registrar_ocorrencia",
    description: "Creche e hotel: registra uma ocorrência com um pet que está na casa (briga, machucado, fuga, vômito ou outra coisa), com a hora e quem anotou. É o mesmo registro do botão Ocorrência: o dono vê na tela Hoje e fica no histórico do pet. Use sempre que a pessoa contar algo que aconteceu com o pet (\"a Pandora vomitou no pátio, anota ocorrência\"); nunca anote isso nas observações da ficha com anotar_no_pet.",
    input_schema: { type: "object", properties: { pet_id: S, tipo: { type: "string", enum: [...TIPOS] }, texto: { ...S, description: "O que aconteceu, curto, como a pessoa contou" }, hora: { ...S, description: "Hora em que aconteceu (HH:mm), se a pessoa disse. Padrão: agora" } }, required: ["pet_id", "tipo"], additionalProperties: false } },
];

const paraUtc = (local: string, fusoMin: number) => new Date(Date.parse(`${local.slice(0, 16)}:00Z`) - fusoMin * 60000).toISOString();
const paraLocal = (iso: string, fusoMin: number) => new Date(new Date(iso).getTime() + fusoMin * 60000).toISOString().slice(0, 16);
const minutos = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

type Hospede = { id: string; pet_id: string; tipo: string; entrada: string; cuidados: unknown; obs: string | null; pets: { id: string; nome: string; alertas: string | null } | null };
type Feito = { id: string; estadia_id: string; item: string; dia: string; hora: string; feito_em: string; feito_nome: string | null };

async function hospedes(c: Contexto, petId: string | null): Promise<Hospede[]> {
  let q = c.sb.from("estadias").select("id, pet_id, tipo, entrada, cuidados, obs, pets(id, nome, alertas)").eq("petshop_id", c.petshop.id).eq("status", "em_casa");
  if (petId) q = q.eq("pet_id", petId);
  const r = await q.order("entrada").order("id").limit(300);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as unknown as Hospede[];
}
async function feitosDeHoje(c: Contexto, estadiaIds: string[]): Promise<Feito[]> {
  if (!estadiaIds.length) return [];
  const r = await c.sb.from("estadias_cuidados").select("id, estadia_id, item, dia, hora, feito_em, feito_nome").eq("petshop_id", c.petshop.id).eq("dia", c.agora.slice(0, 10)).in("estadia_id", estadiaIds).limit(2000);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as Feito[];
}
/** Minutos desde a meia-noite em que o pet chegou, se chegou hoje (dose de antes da chegada não conta como atrasada). */
const entrouHoje = (c: Contexto, h: Hospede) => { const l = paraLocal(h.entrada, c.fusoMin); return l.slice(0, 10) === c.agora.slice(0, 10) ? minutos(l.slice(11, 16)) : null; };

/** Consulta; null quando o nome não é desta lista. */
export async function consultarChao(c: Contexto, nome: string, e: Entrada, erro: Erro) {
  if (nome !== "ver_cuidados") return null;
  const petId = e.pet_id ? uuid(e.pet_id) : null;
  if (e.pet_id && !petId) throw erro("pet_id inválido: use buscar_pets para pegar o id.");
  const lista = await hospedes(c, petId);
  const feitos = await feitosDeHoje(c, lista.map((h) => h.id));
  const agoraMin = minutos(c.agora.slice(11, 16));
  let atrasadas = 0, naHora = 0;
  const pets = lista.map((h) => {
    const cuidados = lerCuidados(h);
    const entrou = entrouHoje(c, h);
    return {
      pet: h.pets?.nome ?? "Pet", pet_id: h.pet_id, onde: h.tipo === "hotel" ? "hotel" : "creche",
      ...(h.pets?.alertas ? { alerta: String(h.pets.alertas).slice(0, 300) } : {}),
      cuidados: cuidados.map((x) => ({
        tipo: x.tipo === "remedio" ? "remédio" : "comida", oque: x.oque, quanto: x.quanto || undefined,
        doses: (x.horas.length ? x.horas : [""]).map((hr) => {
          const f = feitos.find((y) => y.estadia_id === h.id && y.item === x.id && y.hora === hr);
          const sit = hr ? situacaoDaDose(hr, agoraMin, Boolean(f), entrou) : f ? "feito" : "depois";
          if (sit === "atrasada") atrasadas++; else if (sit === "agora") naHora++;
          return {
            hora: hr || "sem hora combinada",
            situacao: sit === "feito" ? "feito" : sit === "atrasada" ? "ATRASADA" : sit === "agora" ? "na hora" : hr ? "mais tarde" : "não marcado hoje",
            ...(f ? { feito_por: f.feito_nome?.split(/\s+/)[0] ?? null, feito_as: paraLocal(f.feito_em, c.fusoMin).slice(11, 16) } : {}),
          };
        }),
      })),
      ...(cuidados.length ? {} : { sem_lista: `Nenhuma comida nem remédio em lista para ${h.pets?.nome ?? "este pet"}.${h.obs ? ` Observações da estadia: ${h.obs.slice(0, 300)}` : ""} Não diga que o pet não toma remédio: diga que não há doses em lista e leia as observações.` }),
    };
  });
  return {
    resultado: {
      agora: c.agora.slice(11, 16), na_casa: lista.length, doses_atrasadas: atrasadas, doses_na_hora: naHora, pets,
      como_marcar: "Para marcar uma dose como feita, use marcar_cuidado. Na tela: Creche e hotel, cartão do hóspede, Cuidados de hoje; as doses de agora também aparecem na tela Hoje.",
      ...(petId && !lista.length ? { aviso: "Este pet não está na casa agora." } : {}),
    },
  };
}

/** Acha o cuidado pelo que a pessoa falou ("ração", "Gardenal", "remédio") e a dose (hora dita, ou a pendente mais perto de agora). */
async function planoDoCuidado(c: Contexto, e: Entrada, erro: Erro) {
  if (!cuidadosLigados(c.petshop)) throw erro("A ficha de cuidados está desligada neste pet shop (Meu pet shop, opções do hotel e da creche). Nada foi marcado. Diga que o dono liga lá.");
  const petId = uuid(e.pet_id);
  if (!petId) throw erro("pet_id inválido: use buscar_pets para pegar o id.");
  const [h] = await hospedes(c, petId);
  if (!h) throw erro("Este pet não está na casa agora (sem check-in aberto). Nada foi marcado. Use ver_hospedes para ver quem está.");
  const cuidados = lerCuidados(h);
  const nome = h.pets?.nome ?? "o pet";
  if (!cuidados.length) throw erro(`${nome} não tem comida nem remédio em lista nesta estadia. Nada foi marcado. A lista é feita na tela: Creche e hotel, abrir a estadia, Comida e remédio.`);
  const dito = semAcento(typeof e.cuidado === "string" ? e.cuidado : "").trim();
  const ehRemedio = /remedio|medic|comprimido|dose|gotas?/.test(dito), ehComida = /racao|comida|sache|refeic|almoco|janta|cafe|petisco/.test(dito);
  let candidatos: Cuidado[] = dito ? cuidados.filter((x) => semAcento(x.oque).includes(dito) || dito.includes(semAcento(x.oque))) : [];
  if (!candidatos.length && ehRemedio) candidatos = cuidados.filter((x) => x.tipo === "remedio");
  if (!candidatos.length && ehComida) candidatos = cuidados.filter((x) => x.tipo === "comida");
  if (!candidatos.length && !dito && cuidados.length === 1) candidatos = cuidados;
  if (!candidatos.length) throw erro(`Não achei "${String(e.cuidado ?? "")}" na lista de ${nome}. O que está combinado: ${cuidados.map(textoDoCuidado).join("; ")}. Pergunte qual deles.`);
  const hora = typeof e.hora === "string" && RE_HORA.test(e.hora) ? e.hora : null;
  if (e.hora && !hora) throw erro("hora no formato HH:mm.");
  const feitos = await feitosDeHoje(c, [h.id]);
  const agoraMin = minutos(c.agora.slice(11, 16));
  // todas as doses pendentes dos candidatos
  const pend = candidatos.flatMap((x) => (x.horas.length ? x.horas : [""]).filter((hr) => !feitos.some((f) => f.item === x.id && f.hora === hr)).map((hr) => ({ x, hr })));
  let escolhida: { x: Cuidado; hr: string } | null = null;
  if (hora) {
    const exatas = candidatos.flatMap((x) => x.horas.filter((hr) => hr === hora).map((hr) => ({ x, hr })));
    if (!exatas.length) throw erro(`${nome} não tem dose combinada às ${horaFalada(hora)} para isso. O que está combinado: ${candidatos.map(textoDoCuidado).join("; ")}. Pergunte qual é a dose.`);
    if (exatas.length > 1) throw erro(`Há mais de um cuidado às ${horaFalada(hora)}: ${exatas.map((p) => p.x.oque).join(" e ")}. Pergunte qual.`);
    escolhida = exatas[0];
    if (feitos.some((f) => f.item === escolhida!.x.id && f.hora === hora)) {
      const f = feitos.find((y) => y.item === escolhida!.x.id && y.hora === hora)!;
      throw erro(`${escolhida.x.oque} das ${horaFalada(hora)} de ${nome} já estava marcado como feito${f.feito_nome ? ` por ${f.feito_nome.split(/\s+/)[0]}` : ""}, às ${paraLocal(f.feito_em, c.fusoMin).slice(11, 16)}. Nada foi feito.`);
    }
  } else {
    if (!pend.length) throw erro(`Tudo de ${candidatos.map((x) => x.oque).join(" e ")} de ${nome} já está marcado como feito hoje. Nada foi feito.`);
    const itens = new Set(pend.map((p) => p.x.id));
    if (itens.size > 1) throw erro(`${nome} tem mais de um cuidado pendente que combina: ${[...itens].map((id) => textoDoCuidado(candidatos.find((x) => x.id === id)!)).join("; ")}. Pergunte qual foi dado.`);
    // a dose pendente mais perto de agora (a das 13h às 13h10, não a das 18h)
    escolhida = [...pend].sort((a, b) => Math.abs((a.hr ? minutos(a.hr) : agoraMin) - agoraMin) - Math.abs((b.hr ? minutos(b.hr) : agoraMin) - agoraMin))[0];
  }
  return { h, nome, ...escolhida, longe: escolhida.hr ? Math.abs(minutos(escolhida.hr) - agoraMin) > 120 : false };
}

/** A etapa pedida para um pet de hoje. */
async function planoDoQuadro(c: Contexto, e: Entrada, erro: Erro) {
  const hoje = c.agora.slice(0, 10);
  const de = paraUtc(`${hoje}T00:00`, c.fusoMin), ate = paraUtc(`${hoje}T23:59`, c.fusoMin);
  const agId = e.agendamento_id ? uuid(e.agendamento_id) : null, petId = e.pet_id ? uuid(e.pet_id) : null;
  if (!agId && !petId) throw erro("Passe pet_id (de buscar_pets) ou agendamento_id (de ver_agenda).");
  let q = c.sb.from("agendamentos").select("id, status, inicio, profissional_id, pets(id, nome, alertas, sexo), servicos(nome), agendamento_servicos(servicos(nome))")
    .eq("petshop_id", c.petshop.id).gte("inicio", de).lte("inicio", ate).not("status", "in", "(cancelado,faltou)");
  q = agId ? q.eq("id", agId) : q.eq("pet_id", petId!);
  const r = await q.order("inicio").limit(10);
  if (r.error) throw new Error(r.error.message);
  type Ag = { id: string; status: string; inicio: string; profissional_id: string | null; pets: { id: string; nome: string; alertas: string | null; sexo: string | null } | null; servicos: { nome: string } | null; agendamento_servicos: { servicos: { nome: string } | null }[] | null };
  const lista = (r.data ?? []) as unknown as Ag[];
  if (!lista.length) throw erro("Este pet não tem horário hoje na agenda (o quadro é só dos horários de hoje). Nada foi feito. Use ver_agenda para conferir.");
  const linhas = await c.sb.from("quadro_atendimento").select("agendamento_id, etapa, etapa_em, chegou_em, entregue_em").eq("petshop_id", c.petshop.id).in("agendamento_id", lista.map((a) => a.id));
  const quadro = new Map(((linhas.data ?? []) as (LinhaQuadro & { agendamento_id: string })[]).map((x) => [x.agendamento_id, { ...x, etapa: x.etapa as Etapa | null }]));
  // mais de um horário hoje: o que ainda não foi entregue
  const abertos = lista.filter((a) => colunaDe(a, quadro.get(a.id)) !== "entregue");
  if (abertos.length > 1) throw erro(`${lista[0].pets?.nome ?? "O pet"} tem mais de um horário hoje. Passe o agendamento_id (de ver_agenda).`);
  const a = abertos[0] ?? lista[lista.length - 1];
  const linha = quadro.get(a.id) ?? null;
  const nomes = [a.servicos?.nome, ...(a.agendamento_servicos ?? []).map((s) => s.servicos?.nome)];
  const pedido = typeof e.para === "string" && (DESTINOS as readonly string[]).includes(e.para) ? (e.para as Destino) : null;
  if (e.para && !pedido) throw erro("para deve ser banho, secagem, tosa, pronto ou entregue.");
  const para = pedido ?? proximaEtapa(a, linha, temTosa(nomes));
  const nome = a.pets?.nome ?? "O pet";
  if (!para) throw erro(`${nome} já foi entregue hoje. Nada foi feito.`);
  const col = colunaDe(a, linha);
  if (para === "entregue" && col === "esperando") throw erro(`${nome} ainda não chegou (está em Esperando). Nada foi feito. Se chegou agora, a etapa é banho.`);
  const aqui = col === "entregue" ? para === "entregue" : col !== "esperando" && (linha?.etapa ?? (col === "banho" ? "banho" : null)) === para;
  if (aqui) throw erro(`${nome} já está em ${NOME_DESTINO[para]}. Nada foi feito.`);
  return { a, nome, para, de: col ? ({ esperando: "Esperando", banho: "No banho", secando: linha?.etapa === "tosa" ? "Na tosa" : "Secando", pronto: "Pronto para buscar", entregue: "Entregue" } as const)[col] : "", servicos: nomes.filter(Boolean).join(" + ") };
}

async function planoDaOcorrencia(c: Contexto, e: Entrada, erro: Erro) {
  if (!ocorrenciasLigadas(c.petshop)) throw erro("As ocorrências estão desligadas neste pet shop (Meu pet shop, opções da creche e do hotel). Nada foi registrado. Diga que o dono liga lá.");
  const petId = uuid(e.pet_id);
  if (!petId) throw erro("pet_id inválido: use buscar_pets para pegar o id.");
  const tipo = typeof e.tipo === "string" && (TIPOS as readonly string[]).includes(e.tipo) ? e.tipo : null;
  if (!tipo) throw erro("tipo deve ser briga, machucado, fugiu, vomitou ou outro.");
  const texto = typeof e.texto === "string" ? e.texto.trim().slice(0, 500) : "";
  if (tipo === "outro" && !texto) throw erro("Para outra coisa, escreva em texto o que aconteceu.");
  const [h] = await hospedes(c, petId);
  if (!h) {
    const { data: pet } = await c.sb.from("pets").select("nome").eq("petshop_id", c.petshop.id).eq("id", petId).maybeSingle();
    throw erro(`${pet?.nome ?? "Este pet"} não está na creche nem no hotel agora, e a ocorrência fica na estadia. Nada foi registrado. Diga isso à pessoa: se foi no banho e tosa, ofereça anotar na ficha do pet (anotar_no_pet) e avise que o dono vê na ficha, não na tela Hoje.`);
  }
  const hora = typeof e.hora === "string" && RE_HORA.test(e.hora) ? e.hora : null;
  if (e.hora && !hora) throw erro("hora no formato HH:mm.");
  const agora = c.agora.slice(11, 16);
  if (hora && hora > agora) throw erro(`${hora} ainda não chegou (agora são ${agora}). Pergunte a hora certa.`);
  return { h, nome: h.pets?.nome ?? "o pet", tipo, texto, hora: hora ?? agora, quando: paraUtc(`${c.agora.slice(0, 10)}T${hora ?? agora}`, c.fusoMin) };
}

/** O cartão; null quando o nome não é desta lista. */
export async function descreverChao(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<Resumo | null> {
  if (nome === "marcar_cuidado") {
    const p = await planoDoCuidado(c, e, erro);
    const linhas: [string, string][] = [["Pet", p.nome], [p.x.tipo === "remedio" ? "Remédio" : "Comida", [p.x.oque, p.x.quanto].filter(Boolean).join(", ")], ["Dose", p.hr ? `a das ${horaFalada(p.hr)}` : "sem hora combinada"], ["Fica", `feito agora (${c.agora.slice(11, 16)}), em seu nome`]];
    if (p.longe) linhas.push(["Atenção", `agora são ${c.agora.slice(11, 16)}, longe da hora combinada. Confira se é esta dose.`]);
    if (p.h.pets?.alertas) linhas.push(["Cuidados", String(p.h.pets.alertas).slice(0, 300)]);
    return { titulo: "Marcar dose como feita", linhas };
  }
  if (nome === "mover_no_quadro") {
    const p = await planoDoQuadro(c, e, erro);
    const linhas: [string, string][] = [["Pet", p.nome], ["Serviço", p.servicos || "Atendimento"], ["De", p.de], ["Para", NOME_DESTINO[p.para]]];
    if (p.para === "entregue" && p.a.status === "em_atendimento") linhas.push(["Conta", "o atendimento fica concluído; sem conta fechada, aparece como Falta cobrar para o caixa"]);
    if (p.a.pets?.alertas) linhas.push(["Cuidados", String(p.a.pets.alertas).slice(0, 300)]);
    return { titulo: "Mudar a etapa no Quadro do dia", linhas };
  }
  if (nome === "registrar_ocorrencia") {
    const p = await planoDaOcorrencia(c, e, erro);
    const linhas: [string, string][] = [["Pet", p.nome], ["O que foi", NOME_TIPO[p.tipo]], ["Quando", `hoje às ${p.hora}`]];
    if (p.texto) linhas.push(["Detalhe", p.texto]);
    linhas.push(["Fica", "em Ocorrências da estadia: o dono vê na tela Hoje e no histórico do pet"]);
    return { titulo: "Registrar ocorrência", linhas };
  }
  return null;
}

/** Grava (depois do "Pode fazer"); null quando o nome não é desta lista. */
export async function gravarChao(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<unknown> {
  if (nome === "marcar_cuidado") {
    const p = await planoDoCuidado(c, e, erro);
    const r = await c.sb.from("estadias_cuidados").insert({ petshop_id: c.petshop.id, estadia_id: p.h.id, item: p.x.id, dia: c.agora.slice(0, 10), hora: p.hr }).select("id");
    // outra pessoa marcou no mesmo instante: já está feito
    if (r.error && r.error.code !== "23505") throw erro(r.error.message);
    return { feito: true, pet: p.nome, cuidado: p.x.oque, dose: p.hr || null, onde: "Creche e hotel, cartão do hóspede, Cuidados de hoje" };
  }
  if (nome === "mover_no_quadro") {
    const p = await planoDoQuadro(c, e, erro);
    const r = await c.sb.rpc("quadro_mover", { p_petshop: c.petshop.id, p_agendamento: p.a.id, p_para: p.para });
    if (r.error) throw erro(r.error.message);
    const st = (r.data as { status?: string } | null)?.status ?? null;
    return { feito: true, pet: p.nome, etapa: NOME_DESTINO[p.para], status_do_horario: st, ...(p.para === "entregue" ? { aviso: "O atendimento ficou concluído. Se a conta não foi fechada, ele aparece como Falta cobrar para quem cuida do caixa." } : {}), onde: "Agenda, Quadro do dia" };
  }
  if (nome === "registrar_ocorrencia") {
    const p = await planoDaOcorrencia(c, e, erro);
    // a mesma confirmação de novo não registra duas vezes: mesma estadia, tipo, texto e hora
    const ja = await c.sb.from("estadias_ocorrencias").select("id").eq("petshop_id", c.petshop.id).eq("estadia_id", p.h.id).eq("tipo", p.tipo).eq("texto", p.texto).eq("quando", p.quando).limit(1);
    if (ja.data?.length) return { feito: true, ocorrencia_id: ja.data[0].id, ja_estava: true };
    const r = await c.sb.from("estadias_ocorrencias").insert({ petshop_id: c.petshop.id, estadia_id: p.h.id, pet_id: p.h.pet_id, tipo: p.tipo, texto: p.texto, quando: p.quando }).select("id").single();
    if (r.error) throw erro(r.error.message);
    return { feito: true, ocorrencia_id: r.data.id, pet: p.nome, onde: "Creche e hotel, cartão do hóspede (Ocorrências); o dono vê na tela Hoje", proximo_passo: "Se for o caso, ofereça avisar o tutor: a mensagem pronta fica no cartão do hóspede." };
  }
  return null;
}
