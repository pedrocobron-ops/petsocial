import type Anthropic from "@anthropic-ai/sdk";
import type { Banco } from "../supabase";
import type { Horario, Petshop, Profissional, Servico } from "../tipos";
import { bloqueioPega, datasDaSerie, diasUteis, horariosLivres, vagasDe } from "../agenda";
import { brl, fmtTelefone, linkWhatsApp, precoDoServico, semAcento } from "../util";

/**
 * O que o Mozart sabe fazer no sistema.
 * Ferramentas de consulta rodam na hora. Ferramentas que gravam (agenda, dinheiro, estoque, cadastro)
 * viram uma proposta na tela e só rodam depois que a pessoa confirma.
 * Tudo roda com o login de quem pediu: as regras do banco (RLS) valem igual às das telas.
 */

export type Contexto = {
  sb: Banco;
  userId: string;
  petshop: Petshop;
  eu: Profissional;
  equipe: Profissional[];
  servicos: Servico[];
  vejoFinanceiro: boolean;
  /** Minutos a leste de UTC no aparelho de quem pediu (Brasília = -180). */
  fusoMin: number;
  /** Agora, no horário local: "AAAA-MM-DDTHH:mm". */
  agora: string;
};

export type Resumo = { titulo: string; linhas: [string, string][] };
export type LinkZap = { nome: string; texto: string; url: string };

/* ---------- datas: o modelo fala em horário local; o banco guarda em UTC ---------- */

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_DIA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export const localParaUtc = (local: string, fusoMin: number) => new Date(Date.parse(`${local.slice(0, 16)}:00Z`) - fusoMin * 60000);
export const utcParaLocal = (iso: string, fusoMin: number) => new Date(new Date(iso).getTime() + fusoMin * 60000).toISOString().slice(0, 16);
const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
/** "sexta, 13/11 às 10:00" a partir do horário local. */
export function quandoLocal(local: string) {
  const d = new Date(`${local.slice(0, 10)}T00:00:00Z`);
  return `${DIAS[d.getUTCDay()]}, ${local.slice(8, 10)}/${local.slice(5, 7)}${local.length > 10 ? ` às ${local.slice(11, 16)}` : ""}`;
}
const diaSemanaLocal = (dia: string) => new Date(`${dia}T00:00:00Z`).getUTCDay();
const somaDiasLocal = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

class ErroDeUso extends Error {}
function exigir(cond: unknown, msg: string): asserts cond { if (!cond) throw new ErroDeUso(msg); }
function ok<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (r.error) throw new Error(r.error.message);
  return r.data as NonNullable<T>;
}
const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (typeof v === "string" && RE_UUID.test(v) ? v : null);

/* ---------- definição das ferramentas (o que o modelo enxerga) ---------- */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false });
const S = { type: "string" }, N = { type: "number" }, B = { type: "boolean" };
const DIA = { type: "string", description: "Dia no formato AAAA-MM-DD" };
const DIA_HORA = { type: "string", description: "Dia e hora locais no formato AAAA-MM-DDTHH:mm" };
const HORA = { type: "string", description: "Hora local no formato HH:mm" };

export const FERRAMENTAS: Def[] = [
  { grava: false, name: "buscar_pets", description: "Procura pets e tutores pelo nome do pet, nome do tutor ou telefone. Use sempre antes de marcar horário ou lançar algo para um pet, para pegar o id certo. Devolve também o último atendimento e os pacotes ativos.",
    input_schema: obj({ termo: { ...S, description: "Nome do pet, do tutor ou parte do telefone" } }, ["termo"]) },
  { grava: false, name: "ver_agenda", description: "Lista os horários marcados entre dois dias (inclusive), com pet, tutor, serviço, profissional, status e valor, e os bloqueios de horário do período (almoço, folga, feriado), cada um com bloqueio_id e se faz parte de uma série.",
    input_schema: obj({ de: DIA, ate: DIA }, ["de", "ate"]) },
  { grava: false, name: "horarios_livres", description: "Mostra os horários livres de um dia, dentro do funcionamento do pet shop, para um serviço. Já desconta o tempo bloqueado e lista os bloqueios do dia. Use antes de sugerir horário ou quando o horário pedido estiver ocupado ou bloqueado.",
    input_schema: obj({ dia: DIA, servico_id: S, profissional_id: S }, ["dia"]) },
  { grava: false, name: "clientes_sumidos", description: "Lista pets cujo último atendimento concluído foi há mais de N dias (ou que nunca vieram), com tutor e telefone.",
    input_schema: obj({ dias: { ...N, description: "Quantidade de dias sem vir, ex.: 30 ou 60" } }, ["dias"]) },
  { grava: false, name: "ver_estoque", description: "Lista produtos do estoque com saldo, mínimo e preço. Sem termo, mostra os que estão acabando primeiro.",
    input_schema: obj({ termo: S }) },
  { grava: false, financeiro: true, name: "resumo_financeiro", description: "Soma o dinheiro que entrou e saiu entre dois dias (inclusive), por categoria e por forma de pagamento, e informa se há caixa aberto.",
    input_schema: obj({ de: DIA, ate: DIA }, ["de", "ate"]) },
  { grava: false, financeiro: true, name: "contas_em_aberto", description: "Lista contas a pagar e a receber ainda não pagas, com vencimento.",
    input_schema: obj({}) },
  { grava: false, name: "ver_hospedes", description: "Creche e hotel: mostra quem está na casa agora (desde quando, saída prevista, diárias até aqui) e as reservas dos próximos dias.",
    input_schema: obj({ dias: { ...N, description: "Até quantos dias à frente olhar as reservas. Padrão: 7" } }) },
  { grava: false, name: "ver_pacotes", description: "Lista os modelos de pacote à venda (com pacote_id e preço) e os pacotes ativos, com usados e restantes. Com pet_id, só os pacotes daquele pet.",
    input_schema: obj({ pet_id: S }) },
  { grava: false, financeiro: true, name: "ver_caixa", description: "Diz se o caixa está aberto ou fechado, desde quando, o troco inicial, quanto entrou e saiu por forma de pagamento e o dinheiro esperado na gaveta. Com o caixa fechado, mostra o que foi lançado hoje e o último fechamento.",
    input_schema: obj({}) },
  { grava: false, name: "ver_saude", description: "Cuidados de saúde anotados (vacina, vermífugo, antipulgas, outros). Com pet_id, lista os do pet. Sem pet_id, lista os que vencem nos próximos N dias no pet shop e os que venceram há pouco.",
    input_schema: obj({ pet_id: S, dias: { ...N, description: "Sem pet_id: quantos dias à frente. Padrão: 30" } }) },
  { grava: false, name: "preparar_mensagens", description: "Prepara mensagens de WhatsApp para tutores (lembrete de horário, convite para quem está sumido). Não envia nada: mostra botões para a pessoa abrir o WhatsApp e enviar. Escreva cada texto completo, simpático e curto, assinado com o nome do pet shop.",
    input_schema: obj({ mensagens: { type: "array", items: obj({ pet_id: S, texto: S }, ["pet_id", "texto"]) } }, ["mensagens"]) },

  { grava: true, name: "cadastrar_pet", description: "Cadastra um pet novo. Se o tutor já é cliente, passe cliente_id; senão, passe tutor_nome (e telefone, se a pessoa disse) e o tutor é criado junto.",
    input_schema: obj({ nome: S, cliente_id: S, tutor_nome: S, tutor_telefone: S, especie: { type: "string", enum: ["cao", "gato", "outro"] }, raca: S, porte: { type: "string", enum: ["P", "M", "G", "GG"] }, alertas: { ...S, description: "Cuidados: alergia, medo, comportamento" } }, ["nome"]) },
  { grava: true, name: "marcar_horario", description: "Marca um horário na agenda para um pet já cadastrado. O valor é sugerido pelo serviço e porte se você não passar. Para horário que se repete (toda semana, de 15 em 15 dias, uma vez por mês), passe repetir_a_cada_semanas e repetir_vezes: cria todos de uma vez, no mesmo dia da semana e hora. Dá erro se cair em bloqueio do pet shop inteiro ou do profissional escolhido.",
    input_schema: obj({ pet_id: S, servico_id: S, inicio: DIA_HORA, profissional_id: S, preco: N, obs: S, leva_traz: B,
      repetir_a_cada_semanas: { type: "number", enum: [1, 2, 4], description: "Intervalo da repetição, em semanas: 1, 2 ou 4" },
      repetir_vezes: { ...N, description: "Quantos horários no total, contando o primeiro: de 2 a 12" } }, ["pet_id", "servico_id", "inicio"]) },
  { grava: true, name: "bloquear_horario", description: "Bloqueia um período da agenda (almoço, folga, feriado, manutenção) para ninguém marcar nele. Sem profissional_id vale para o pet shop inteiro. Sem de e ate, bloqueia o dia inteiro. Com repetir_semanas, repete o mesmo bloqueio em todos os dias úteis (os dias em que o pet shop abre) pelas próximas N semanas.",
    input_schema: obj({ dia: DIA, de: HORA, ate: HORA, profissional_id: S, motivo: { ...S, description: "Ex.: Almoço, Folga, Feriado, Manutenção" }, repetir_semanas: { ...N, description: "Opcional, de 1 a 8" } }, ["dia"]) },
  { grava: true, name: "alterar_horario", description: "Altera um horário existente: remarca (inicio), troca serviço ou profissional, muda o valor ou o status (confirmado, concluido, faltou, cancelado, marcado). Ao remarcar ou trocar de profissional, dá erro se cair em bloqueio do pet shop inteiro ou do profissional.",
    input_schema: obj({ agendamento_id: S, inicio: DIA_HORA, servico_id: S, profissional_id: S, preco: N, status: { type: "string", enum: ["marcado", "confirmado", "em_atendimento", "concluido", "faltou", "cancelado"] } }, ["agendamento_id"]) },
  { grava: true, name: "remover_bloqueio", description: "Remove um bloqueio da agenda. Passe bloqueio_id (de ver_agenda) ou o dia; se houver mais de um bloqueio no dia, passe também hora, motivo ou profissional_id. Se o bloqueio faz parte de uma série e a pessoa quer tirar também os dias seguintes, passe e_os_proximos: true.",
    input_schema: obj({ bloqueio_id: S, dia: DIA, hora: { ...HORA, description: "Uma hora que cai dentro do bloqueio, HH:mm" }, motivo: S, profissional_id: S, e_os_proximos: { ...B, description: "Remove este e os próximos da mesma série" } }) },
  { grava: true, name: "fazer_checkin", description: "Creche e hotel: registra que o pet chegou agora. Se o pet tem reserva do mesmo tipo para hoje (ou atrasada, ou para amanhã), a reserva vira check-in; senão, cria a estadia. Sem valor_diaria, usa a da reserva ou a última cobrada nesse tipo.",
    input_schema: obj({ pet_id: S, tipo: { type: "string", enum: ["creche", "hotel"] }, saida_prevista: { ...S, description: "Opcional. AAAA-MM-DDTHH:mm (só o dia vale 18:00)" }, valor_diaria: N, obs: { ...S, description: "Ração, remédio, o que trouxe" } }, ["pet_id", "tipo"]) },
  { grava: true, name: "fazer_checkout", description: "Creche e hotel: encerra a estadia do pet que está na casa. Quem tem acesso ao financeiro recebe junto: o valor é diárias vezes o valor da diária, se você não passar, e precisa da forma de pagamento. Passe valor 0 para não cobrar agora.",
    input_schema: obj({ pet_id: S, diarias: { ...N, description: "Opcional. Padrão: contadas da entrada até hoje (hotel por noite, creche por dia)" }, valor: N, forma: { type: "string", enum: ["pix", "dinheiro", "debito", "credito", "outro"] } }, ["pet_id"]) },
  { grava: true, name: "vender_pacote", description: "Vende para um pet um modelo de pacote (pacote_id de ver_pacotes). Quem tem acesso ao financeiro lança o pagamento junto e precisa da forma; se o cliente ainda não pagou, passe ja_pagou: false e nada entra no financeiro.",
    input_schema: obj({ pet_id: S, pacote_id: S, forma: { type: "string", enum: ["pix", "dinheiro", "debito", "credito", "outro"] }, ja_pagou: { ...B, description: "Padrão: true" } }, ["pet_id", "pacote_id"]) },
  { grava: true, name: "usar_pacote", description: "Dá baixa de 1 uso no pacote ativo do pet. Se o pet tem mais de um pacote ativo, passe pacote_cliente_id (de ver_pacotes).",
    input_schema: obj({ pet_id: S, pacote_cliente_id: S }, ["pet_id"]) },
  { grava: true, name: "registrar_saude", description: "Anota um cuidado de saúde do pet (vacina, vermífugo, antipulgas ou outro) com a data em que foi aplicado e, se a pessoa disse, quando vence. Só anota: não calcule nem sugira a data de vencimento.",
    input_schema: obj({ pet_id: S, tipo: { type: "string", enum: ["vacina", "vermifugo", "antipulgas", "outro"] }, nome: { ...S, description: "Ex.: V10, Antirrábica, Bravecto" }, aplicado_em: { ...DIA, description: "AAAA-MM-DD. Padrão: hoje" }, vence_em: DIA, obs: S }, ["pet_id", "tipo", "nome"]) },
  { grava: true, financeiro: true, name: "abrir_caixa", description: "Abre o caixa do dia com o troco inicial em dinheiro (0 se a gaveta está vazia).",
    input_schema: obj({ troco_inicial: N }) },
  { grava: true, financeiro: true, name: "fechar_caixa", description: "Fecha o caixa aberto. Passe o dinheiro contado na gaveta (só dinheiro; Pix e cartão não entram). O cartão mostra o esperado, o contado e a diferença.",
    input_schema: obj({ valor_contado: N, obs: S }, ["valor_contado"]) },
  { grava: true, financeiro: true, name: "lancar_dinheiro", description: "Registra dinheiro que já entrou ou saiu hoje (entra no caixa aberto). Para receber um atendimento, passe agendamento_id: ele fica como concluído.",
    input_schema: obj({ tipo: { type: "string", enum: ["entrada", "saida"] }, valor: N, forma: { type: "string", enum: ["pix", "dinheiro", "debito", "credito", "outro"] }, categoria: { ...S, description: "Entradas: Banho e tosa, Creche e hotel, Pacotes, Venda de produtos, Outros. Saídas: Produtos e material, Salários e comissões, Aluguel, Água, luz e internet, Impostos e taxas, Manutenção, Marketing, Outros" }, descricao: S, agendamento_id: S }, ["tipo", "valor", "forma", "categoria"]) },
  { grava: true, financeiro: true, name: "criar_conta", description: "Cria uma conta a pagar (saida) ou a receber (entrada) com vencimento futuro.",
    input_schema: obj({ tipo: { type: "string", enum: ["entrada", "saida"] }, valor: N, vencimento: DIA, descricao: S, categoria: S }, ["tipo", "valor", "vencimento", "descricao"]) },
  { grava: true, name: "movimentar_estoque", description: "Dá entrada ou saída de um produto. Se o produto não existe, passe produto_nome (e unidade) para criar. Em entrada com custo, pode lançar a compra como despesa (lancar_despesa) informando a forma de pagamento.",
    input_schema: obj({ produto_id: S, produto_nome: S, unidade: { ...S, description: "un, kg, g, L, ml, pacote, saco" }, tipo: { type: "string", enum: ["entrada", "saida"] }, quantidade: N, custo_unitario: N, lancar_despesa: B, forma: { type: "string", enum: ["pix", "dinheiro", "debito", "credito", "outro"] }, motivo: S }, ["tipo", "quantidade"]) },
];

export const ferramentasPara = (c: Pick<Contexto, "vejoFinanceiro">): Anthropic.Tool[] =>
  FERRAMENTAS.filter((f) => !f.financeiro || c.vejoFinanceiro).map(({ grava: _g, financeiro: _f, ...t }) => t);
export const definicao = (nome: string) => FERRAMENTAS.find((f) => f.name === nome);

/* ---------- consultas ---------- */

type Entrada = Record<string, unknown>;

async function petPorId(c: Contexto, id: unknown) {
  const pid = uuid(id);
  exigir(pid, "pet_id inválido: use buscar_pets para pegar o id.");
  const { data } = await c.sb.from("pets").select("*, clientes(id, nome, telefone)").eq("petshop_id", c.petshop.id).eq("id", pid).maybeSingle();
  exigir(data, "Pet não encontrado: use buscar_pets.");
  return data;
}
const servicoPorId = (c: Contexto, id: unknown) => c.servicos.find((s) => s.id === id) ?? null;
const profPorId = (c: Contexto, id: unknown) => c.equipe.find((p) => p.id === id) ?? null;

/* ---------- bloqueios e séries ---------- */

type Bloq = { id: string; inicio: string; fim: string; motivo: string | null; profissional_id: string | null; serie_id: string | null };
const RE_HORA = /^\d{2}:\d{2}$/;
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "sex 13/11" */
const diaCurtoLocal = (dia: string) => `${DIAS_CURTOS[diaSemanaLocal(dia)]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** Bloqueios que cruzam o intervalo (instantes em UTC). */
async function bloqueiosEntre(c: Contexto, ini: Date, fim: Date): Promise<Bloq[]> {
  return ok(await c.sb.from("bloqueios").select("id, inicio, fim, motivo, profissional_id, serie_id").eq("petshop_id", c.petshop.id)
    .lt("inicio", fim.toISOString()).gt("fim", ini.toISOString()).order("inicio").limit(1000));
}
const quemDoBloqueio = (c: Contexto, b: Pick<Bloq, "profissional_id">) => (b.profissional_id ? profPorId(c, b.profissional_id)?.nome ?? "profissional" : "pet shop inteiro");
const bloqueioParaModelo = (c: Contexto, b: Bloq) => ({ bloqueio_id: b.id, ...(b.serie_id ? { repete: true } : {}), inicio: utcParaLocal(b.inicio, c.fusoMin), fim: utcParaLocal(b.fim, c.fusoMin), motivo: b.motivo ?? "sem motivo", para: quemDoBloqueio(c, b) });
/** "Almoço, pet shop inteiro, das 12:00 às 13:00" */
const bloqueioEmTexto = (c: Contexto, b: Bloq) => `${b.motivo ?? "bloqueio"}, ${quemDoBloqueio(c, b)}, das ${utcParaLocal(b.inicio, c.fusoMin).slice(11)} às ${utcParaLocal(b.fim, c.fusoMin).slice(11)}`;

/** Inícios locais ("AAAA-MM-DDTHH:mm") de um pedido de marcar_horario: um só, ou a série inteira. */
function iniciosDoPedido(e: Entrada): { inicios: string[]; aCada: number | null } {
  exigir(RE_DIA_HORA.test(String(e.inicio)), "inicio no formato AAAA-MM-DDTHH:mm.");
  const inicio = String(e.inicio).slice(0, 16);
  const aCada = numero(e.repetir_a_cada_semanas), vezes = numero(e.repetir_vezes);
  if (aCada == null && vezes == null) return { inicios: [inicio], aCada: null };
  exigir(aCada == null || [1, 2, 4].includes(aCada), "repetir_a_cada_semanas deve ser 1, 2 ou 4.");
  exigir(vezes == null || (Number.isInteger(vezes) && vezes >= 2 && vezes <= 12), "repetir_vezes deve ser de 2 a 12.");
  return { inicios: datasDaSerie(inicio.slice(0, 10), aCada ?? 1, vezes ?? 4).map((d) => `${d}T${inicio.slice(11)}`), aCada: aCada ?? 1 };
}

/** Confere e monta os registros de um pedido de bloquear_horario (um por dia). */
function planoDoBloqueio(c: Contexto, e: Entrada) {
  const dia = String(e.dia);
  exigir(RE_DIA.test(dia), "dia no formato AAAA-MM-DD.");
  const de = texto(e.de, 5), ate = texto(e.ate, 5);
  exigir((!de && !ate) || (RE_HORA.test(de) && RE_HORA.test(ate)), "de e ate no formato HH:mm. Para o dia inteiro, não passe nenhum dos dois.");
  exigir(!de || ate > de, "O fim do bloqueio precisa ser depois do início.");
  const prof = e.profissional_id ? profPorId(c, e.profissional_id) : null;
  exigir(!e.profissional_id || prof, "profissional_id inválido.");
  const semanas = numero(e.repetir_semanas);
  exigir(semanas == null || (Number.isInteger(semanas) && semanas >= 1 && semanas <= 8), "repetir_semanas deve ser de 1 a 8.");
  const dias = semanas ? diasUteis(dia, semanas, c.petshop.horario) : [dia];
  const linhas = dias.map((d) => ({
    inicio: localParaUtc(`${d}T${de || "00:00"}`, c.fusoMin).toISOString(),
    fim: localParaUtc(de ? `${d}T${ate}` : `${somaDiasLocal(d, 1)}T00:00`, c.fusoMin).toISOString(),
  }));
  return { dias, de, ate, prof, semanas, motivo: texto(e.motivo, 80) || null, linhas };
}

/** Acha o bloqueio que a pessoa quer tirar (um só) e, se pedido, os próximos da mesma série. */
async function planoDeRemoverBloqueio(c: Contexto, e: Entrada) {
  const campos = "id, inicio, fim, motivo, profissional_id, serie_id";
  let alvo: Bloq;
  if (uuid(e.bloqueio_id)) {
    const { data } = await c.sb.from("bloqueios").select(campos).eq("petshop_id", c.petshop.id).eq("id", String(e.bloqueio_id)).maybeSingle();
    exigir(data, "Bloqueio não encontrado: use ver_agenda para pegar o bloqueio_id.");
    alvo = data;
  } else {
    const dia = String(e.dia);
    exigir(RE_DIA.test(dia), "Diga o dia do bloqueio (AAAA-MM-DD) ou passe bloqueio_id de ver_agenda.");
    const ini = localParaUtc(`${dia}T00:00`, c.fusoMin);
    let lista = await bloqueiosEntre(c, ini, localParaUtc(`${somaDiasLocal(dia, 1)}T00:00`, c.fusoMin));
    const hora = texto(e.hora, 5), motivo = semAcento(texto(e.motivo, 80));
    if (hora) {
      exigir(RE_HORA.test(hora), "hora no formato HH:mm.");
      const t = localParaUtc(`${dia}T${hora}`, c.fusoMin).getTime();
      lista = lista.filter((b) => new Date(b.inicio).getTime() <= t && new Date(b.fim).getTime() > t);
    }
    if (motivo) lista = lista.filter((b) => semAcento(b.motivo ?? "").includes(motivo));
    if (e.profissional_id) {
      exigir(profPorId(c, e.profissional_id), "profissional_id inválido.");
      lista = lista.filter((b) => b.profissional_id === e.profissional_id);
    }
    exigir(lista.length, `Não achei bloqueio ${quandoLocal(dia)} com esses dados. Nada foi removido. Use ver_agenda para conferir.`);
    exigir(lista.length === 1, `Há ${lista.length} bloqueios ${quandoLocal(dia)}: ${lista.map((b) => `${bloqueioEmTexto(c, b)} (bloqueio_id ${b.id})`).join("; ")}. Pergunte qual e passe o bloqueio_id.`);
    alvo = lista[0];
  }
  const todos: Bloq[] = e.e_os_proximos && alvo.serie_id
    ? ok(await c.sb.from("bloqueios").select(campos).eq("petshop_id", c.petshop.id).eq("serie_id", alvo.serie_id).gte("inicio", alvo.inicio).order("inicio").limit(1000))
    : [alvo];
  return { alvo, todos: todos.length ? todos : [alvo] };
}

/* ---------- creche e hotel ---------- */

const TIPO_ESTADIA: Record<string, string> = { creche: "Creche", hotel: "Hotel" };
const centavos = (n: number) => Math.round(n * 100) / 100;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate.slice(0, 10)}T00:00:00Z`) - Date.parse(`${de.slice(0, 10)}T00:00:00Z`)) / 864e5);
/** Hotel cobra por noite; creche cobra por dia em que o pet esteve aqui. Sempre pelo menos 1 (a mesma conta da tela). */
function contarDiarias(c: Contexto, e: { tipo: string; entrada: string }) {
  const dias = diasEntre(utcParaLocal(e.entrada, c.fusoMin), c.agora);
  return Math.max(1, e.tipo === "hotel" ? dias : dias + 1);
}

async function planoDoCheckin(c: Contexto, e: Entrada) {
  const pet = await petPorId(c, e.pet_id);
  const tipo = String(e.tipo);
  exigir(TIPO_ESTADIA[tipo], "tipo deve ser creche ou hotel. Pergunte se o pet vem passar o dia (creche) ou dormir (hotel).");
  const abertas = ok(await c.sb.from("estadias").select("id, tipo, entrada, saida_prevista, valor_diaria, status").eq("petshop_id", c.petshop.id).eq("pet_id", pet.id).in("status", ["reservada", "em_casa"]).order("entrada"));
  const emCasa = abertas.find((x) => x.status === "em_casa");
  exigir(!emCasa, `${pet.nome} já está na casa (${TIPO_ESTADIA[emCasa?.tipo ?? ""] ?? "estadia"} desde ${quandoLocal(utcParaLocal(emCasa?.entrada ?? new Date().toISOString(), c.fusoMin))}). Nada foi feito.`);
  // reserva do mesmo tipo para hoje, atrasada ou para amanhã: vira check-in, como o botão da tela
  const limite = somaDiasLocal(c.agora.slice(0, 10), 1);
  const reservas = abertas.filter((x) => x.status === "reservada");
  const reserva = reservas.find((x) => x.tipo === tipo && utcParaLocal(x.entrada, c.fusoMin).slice(0, 10) <= limite) ?? null;
  const outra = reserva ? null : reservas[0] ?? null;
  let saida: string | null = null;
  if (e.saida_prevista) {
    const v = String(e.saida_prevista);
    exigir(RE_DIA_HORA.test(v) || RE_DIA.test(v), "saida_prevista no formato AAAA-MM-DDTHH:mm.");
    saida = RE_DIA.test(v) ? `${v}T18:00` : v.slice(0, 16);
    exigir(saida > c.agora, "A saída prevista precisa ser depois de agora.");
  }
  let diaria = numero(e.valor_diaria);
  exigir(diaria == null || diaria >= 0, "valor_diaria inválido.");
  let origemDiaria = "";
  if (diaria == null && reserva) { diaria = reserva.valor_diaria; origemDiaria = " (da reserva)"; }
  else if (diaria == null) {
    const { data: ultima } = await c.sb.from("estadias").select("valor_diaria").eq("petshop_id", c.petshop.id).eq("tipo", tipo).not("valor_diaria", "is", null).order("entrada", { ascending: false }).limit(1).maybeSingle();
    diaria = ultima?.valor_diaria ?? null;
    if (diaria != null) origemDiaria = " (a última cobrada)";
  }
  return { pet, tipo, reserva, outra, saida, diaria, origemDiaria, obs: texto(e.obs, 400) || null };
}

async function planoDoCheckout(c: Contexto, e: Entrada) {
  const pet = await petPorId(c, e.pet_id);
  const { data: estadia } = await c.sb.from("estadias").select("id, tipo, entrada, valor_diaria").eq("petshop_id", c.petshop.id).eq("pet_id", pet.id).eq("status", "em_casa").order("entrada", { ascending: false }).limit(1).maybeSingle();
  exigir(estadia, `${pet.nome} não está na casa agora. Use ver_hospedes para ver quem está.`);
  const n = numero(e.diarias) ?? contarDiarias(c, estadia);
  exigir(Number.isInteger(n) && n >= 1, "diarias deve ser um número inteiro, a partir de 1.");
  // dinheiro só para quem vê o financeiro: sem acesso, o check-out só encerra a estadia (igual à tela)
  let valor: number | null = null;
  if (c.vejoFinanceiro) {
    valor = numero(e.valor) ?? (estadia.valor_diaria != null ? centavos(n * Number(estadia.valor_diaria)) : null);
    exigir(valor == null || valor >= 0, "valor inválido.");
    exigir(!valor || FORMA[String(e.forma)], `Falta a forma de pagamento dos ${brl(valor)}: pergunte (Pix, dinheiro, débito ou crédito). Se não for cobrar agora, passe valor 0.`);
  }
  return { pet, estadia, n, valor: valor || null };
}

/* ---------- pacotes ---------- */

async function planoDaVenda(c: Contexto, e: Entrada) {
  const pet = await petPorId(c, e.pet_id);
  exigir(uuid(e.pacote_id), "pacote_id inválido: use ver_pacotes para ver os modelos à venda.");
  const { data: modelo } = await c.sb.from("pacotes").select("*").eq("petshop_id", c.petshop.id).eq("id", String(e.pacote_id)).maybeSingle();
  exigir(modelo, "Modelo de pacote não encontrado: use ver_pacotes.");
  exigir(modelo.ativo, `O modelo "${modelo.nome}" está desativado. Use ver_pacotes para ver os que estão à venda.`);
  const hoje = c.agora.slice(0, 10);
  const preco = Number(modelo.preco);
  const lanca = c.vejoFinanceiro && preco > 0 && e.ja_pagou !== false;
  exigir(!lanca || FORMA[String(e.forma)], "Falta a forma de pagamento: pergunte (Pix, dinheiro, débito ou crédito). Se o cliente ainda não pagou, passe ja_pagou: false.");
  return { pet, modelo, hoje, preco, lanca, venceEm: modelo.validade_dias > 0 ? somaDiasLocal(hoje, modelo.validade_dias) : null };
}

async function pacoteParaUsar(c: Contexto, e: Entrada) {
  const pet = await petPorId(c, e.pet_id);
  const ativos = ok(await c.sb.from("pacotes_clientes").select("id, nome, total, usados, vence_em").eq("petshop_id", c.petshop.id).eq("pet_id", pet.id).eq("ativo", true).order("comprado_em"));
  exigir(ativos.length, `${pet.nome} não tem pacote ativo. Nada foi feito. Se a pessoa quiser, ofereça vender um (ver_pacotes).`);
  const pacote = e.pacote_cliente_id ? ativos.find((p) => p.id === e.pacote_cliente_id) : ativos.length === 1 ? ativos[0] : null;
  exigir(!e.pacote_cliente_id || pacote, "pacote_cliente_id inválido: use ver_pacotes com o pet_id.");
  exigir(pacote, `${pet.nome} tem ${ativos.length} pacotes ativos: ${ativos.map((p) => `${p.nome}, ${p.usados} de ${p.total} usados (pacote_cliente_id ${p.id})`).join("; ")}. Pergunte qual e passe o pacote_cliente_id.`);
  exigir(pacote.usados < pacote.total, "Esse pacote já foi todo usado.");
  return { pet, pacote };
}

/* ---------- caixa ---------- */

type Movimento = { tipo: string; valor: number; forma: string | null };
/** Lançamentos pagos de um caixa; sem caixa, os de hoje que ficaram soltos. De mil em mil, para a soma não sair cortada. */
async function movimentosDoCaixa(c: Contexto, caixaId: string | null) {
  const tudo: Movimento[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const q = c.sb.from("lancamentos").select("tipo, valor, forma").eq("petshop_id", c.petshop.id).eq("pago", true);
    const r = ok(await (caixaId ? q.eq("caixa_id", caixaId) : q.is("caixa_id", null).eq("data", c.agora.slice(0, 10))).order("criado_em").order("id").range(de, de + 999));
    tudo.push(...r);
    if (r.length < 1000) break;
  }
  return tudo;
}
/** As contas de um caixa, iguais às da tela: na gaveta só conta o dinheiro. */
function resumoDoCaixa(valorInicial: number, ls: Movimento[]) {
  const soma = (tipo: string, forma?: string) => centavos(ls.filter((l) => l.tipo === tipo && (!forma || (l.forma ?? "outro") === forma)).reduce((t, l) => t + Number(l.valor), 0));
  const porForma = Object.keys(FORMA).map((id) => ({ id, rotulo: FORMA[id], entrou: soma("entrada", id), saiu: soma("saida", id) }));
  return { entrou: soma("entrada"), saiu: soma("saida"), porForma, esperado: centavos(Number(valorInicial) + soma("entrada", "dinheiro") - soma("saida", "dinheiro")), lancamentos: ls.length };
}
function diferencaDoCaixa(contado: number, esperado: number) {
  const d = centavos(contado - esperado);
  return { valor: d, texto: d === 0 ? "Bateu certinho." : d > 0 ? `Sobra de ${brl(d)}.` : `Falta de ${brl(-d)}.` };
}
async function caixaAbertoAgora(c: Contexto) {
  const r = await c.sb.from("caixas").select("*").eq("petshop_id", c.petshop.id).is("fechado_em", null).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

/* ---------- saúde ---------- */

const TIPO_SAUDE: Record<string, string> = { vacina: "Vacina", vermifugo: "Vermífugo", antipulgas: "Antipulgas", outro: "Outro" };
function situacaoDoVencimento(vence: string | null, hoje: string) {
  if (!vence) return "sem data de vencimento";
  const d = diasEntre(hoje, vence);
  return d < 0 ? `venceu há ${-d} ${d === -1 ? "dia" : "dias"}` : d === 0 ? "vence hoje" : d === 1 ? "vence amanhã" : `vence em ${d} dias`;
}

async function consultar(c: Contexto, nome: string, e: Entrada): Promise<{ resultado: unknown; links?: LinkZap[] }> {
  const { sb, petshop } = c;
  const hoje = c.agora.slice(0, 10);
  switch (nome) {
    case "buscar_pets": {
      const alvo = semAcento(texto(e.termo, 80));
      const digitos = alvo.replace(/\D/g, "");
      const todos = ok(await sb.from("pets").select("id, nome, especie, raca, porte, alertas, ativo, clientes(id, nome, telefone)").eq("petshop_id", petshop.id).eq("ativo", true).limit(3000));
      const achados = todos.filter((p) => semAcento(p.nome).includes(alvo) || semAcento(p.clientes?.nome ?? "").includes(alvo) || (digitos.length >= 4 && (p.clientes?.telefone ?? "").replace(/\D/g, "").includes(digitos))).slice(0, 12);
      if (!achados.length) return { resultado: { pets: [], aviso: "Nenhum pet encontrado com esse nome. Pergunte se quer cadastrar." } };
      const ids = achados.map((p) => p.id);
      const [ags, pacotes] = await Promise.all([
        sb.from("agendamentos").select("pet_id, inicio, status, servicos(nome)").eq("petshop_id", petshop.id).in("pet_id", ids).order("inicio", { ascending: false }).limit(200),
        sb.from("pacotes_clientes").select("pet_id, nome, total, usados, vence_em").eq("petshop_id", petshop.id).in("pet_id", ids).eq("ativo", true),
      ]);
      return { resultado: { pets: achados.map((p) => {
        const meus = (ags.data ?? []).filter((a) => a.pet_id === p.id);
        const ultimo = meus.find((a) => a.status === "concluido");
        const proximo = meus.filter((a) => new Date(a.inicio) > new Date() && !["cancelado", "faltou"].includes(a.status)).pop();
        return {
          pet_id: p.id, nome: p.nome, especie: p.especie, raca: p.raca, porte: p.porte, alertas: p.alertas,
          tutor: p.clientes?.nome, cliente_id: p.clientes?.id, telefone: p.clientes?.telefone ? fmtTelefone(p.clientes.telefone) : null,
          ultimo_atendimento: ultimo ? `${utcParaLocal(ultimo.inicio, c.fusoMin).slice(0, 10)} (${ultimo.servicos?.nome ?? "atendimento"})` : "nunca",
          proximo_horario: proximo ? utcParaLocal(proximo.inicio, c.fusoMin) : null,
          pacotes: (pacotes.data ?? []).filter((x) => x.pet_id === p.id).map((x) => `${x.nome}: ${x.usados}/${x.total}`),
        };
      }) } };
    }
    case "ver_agenda": {
      exigir(RE_DIA.test(String(e.de)) && RE_DIA.test(String(e.ate)), "Datas no formato AAAA-MM-DD.");
      const ini = localParaUtc(`${e.de}T00:00`, c.fusoMin), fim = localParaUtc(`${somaDiasLocal(String(e.ate), 1)}T00:00`, c.fusoMin);
      const ags = ok(await sb.from("agendamentos").select("id, inicio, fim, status, preco, obs, lembrete_em, pets(nome, clientes(nome)), servicos(nome), profissionais(nome)").eq("petshop_id", petshop.id).gte("inicio", ini.toISOString()).lt("inicio", fim.toISOString()).order("inicio").limit(200));
      const bloqueios = await bloqueiosEntre(c, ini, fim);
      return { resultado: { horarios: ags.map((a) => ({
        agendamento_id: a.id, inicio: utcParaLocal(a.inicio, c.fusoMin), fim: utcParaLocal(a.fim, c.fusoMin).slice(11), status: a.status,
        pet: a.pets?.nome, tutor: a.pets?.clientes?.nome, servico: a.servicos?.nome, com: a.profissionais?.nome,
        ...(c.vejoFinanceiro ? { valor: a.preco } : {}), obs: a.obs, lembrete_enviado: Boolean(a.lembrete_em),
      })), total: ags.length, bloqueios: bloqueios.map((b) => bloqueioParaModelo(c, b)) } };
    }
    case "horarios_livres": {
      const dia = String(e.dia);
      exigir(RE_DIA.test(dia), "Dia no formato AAAA-MM-DD.");
      const func = (petshop.horario as Horario | null)?.[String(diaSemanaLocal(dia))];
      if (!func) return { resultado: { fechado: true, aviso: `O pet shop não abre ${quandoLocal(dia)}.` } };
      const servico = servicoPorId(c, e.servico_id);
      const prof = profPorId(c, e.profissional_id);
      const ini = localParaUtc(`${dia}T00:00`, c.fusoMin);
      const ags = ok(await sb.from("agendamentos").select("inicio, fim, profissional_id, status").eq("petshop_id", petshop.id).gte("inicio", ini.toISOString()).lt("inicio", new Date(ini.getTime() + 864e5).toISOString()));
      const quemAtende = c.equipe.filter((p) => p.ativo && p.atende);
      const emMin = (x: { inicio: string; fim: string }) => ({ inicio: (new Date(x.inicio).getTime() - ini.getTime()) / 60000, fim: (new Date(x.fim).getTime() - ini.getTime()) / 60000 });
      // bloqueio do pet shop inteiro vale sempre; o de uma pessoa, quando o horário é com ela (ou só ela atende)
      const bloqueios = await bloqueiosEntre(c, ini, new Date(ini.getTime() + 864e5));
      // sem profissional escolhido, vale o número de vagas do pet shop; com profissional, a agenda dele
      const ocupados = ags.filter((a) => !["cancelado", "faltou"].includes(a.status) && (prof ? a.profissional_id === prof.id : true)).map(emMin);
      const bloqueados = bloqueios.filter((b) => !b.profissional_id || b.profissional_id === prof?.id || quemAtende.length <= 1).map(emMin);
      const aPartirDe = dia === hoje ? Number(c.agora.slice(11, 13)) * 60 + Number(c.agora.slice(14, 16)) : undefined;
      const livres = horariosLivres({ abre: func.abre, fecha: func.fecha, duracaoMin: servico?.duracao_min ?? 60, ocupados, bloqueados, vagas: prof ? 1 : vagasDe(petshop, c.equipe), aPartirDe });
      return { resultado: { dia, funcionamento: `${func.abre} às ${func.fecha}`, duracao_min: servico?.duracao_min ?? 60, livres, marcados: ags.filter((a) => !["cancelado", "faltou"].includes(a.status)).length,
        bloqueios: bloqueios.map((b) => bloqueioParaModelo(c, b)),
        ...(bloqueios.length ? { aviso: "Os horários livres já descontam os bloqueios. Não ofereça horário dentro de um bloqueio." } : {}) } };
    }
    case "clientes_sumidos": {
      const dias = Math.max(1, Math.min(720, numero(e.dias) ?? 30));
      const [pets, ags] = await Promise.all([
        sb.from("pets").select("id, nome, clientes(nome, telefone)").eq("petshop_id", petshop.id).eq("ativo", true).limit(3000),
        sb.from("agendamentos").select("pet_id, inicio, status").eq("petshop_id", petshop.id).order("inicio", { ascending: false }).limit(5000),
      ]);
      const ultimo = new Map<string, string>(), futuro = new Set<string>();
      for (const a of ags.data ?? []) {
        if (new Date(a.inicio) > new Date() && !["cancelado", "faltou"].includes(a.status)) futuro.add(a.pet_id);
        if (a.status === "concluido" && !ultimo.has(a.pet_id)) ultimo.set(a.pet_id, a.inicio);
      }
      const corte = Date.now() - dias * 864e5;
      const lista = (pets.data ?? []).filter((p) => !futuro.has(p.id) && (!ultimo.has(p.id) || new Date(ultimo.get(p.id)!).getTime() < corte))
        .map((p) => ({ pet_id: p.id, pet: p.nome, tutor: p.clientes?.nome, telefone: p.clientes?.telefone ? fmtTelefone(p.clientes.telefone) : null,
          ultimo: ultimo.has(p.id) ? utcParaLocal(ultimo.get(p.id)!, c.fusoMin).slice(0, 10) : "nunca veio" }))
        .sort((a, b) => a.ultimo.localeCompare(b.ultimo));
      return { resultado: { dias, total: lista.length, pets: lista.slice(0, 40), observacao: "Não inclui pets que já têm horário marcado para frente." } };
    }
    case "ver_estoque": {
      const alvo = semAcento(texto(e.termo, 80));
      const prods = ok(await sb.from("produtos").select("id, nome, categoria, unidade, estoque, estoque_minimo, preco_venda, custo").eq("petshop_id", petshop.id).eq("ativo", true).order("nome").limit(1000));
      const lista = prods.filter((p) => !alvo || semAcento(p.nome).includes(alvo))
        .map((p) => ({ produto_id: p.id, nome: p.nome, unidade: p.unidade, saldo: Number(p.estoque), minimo: Number(p.estoque_minimo), acabando: Number(p.estoque_minimo) > 0 && Number(p.estoque) <= Number(p.estoque_minimo), preco_venda: p.preco_venda, ...(c.vejoFinanceiro ? { custo: p.custo } : {}) }))
        .sort((a, b) => Number(b.acabando) - Number(a.acabando));
      return { resultado: { total: lista.length, produtos: lista.slice(0, 40) } };
    }
    case "resumo_financeiro": {
      exigir(c.vejoFinanceiro, "Esta pessoa não tem acesso ao financeiro.");
      exigir(RE_DIA.test(String(e.de)) && RE_DIA.test(String(e.ate)), "Datas no formato AAAA-MM-DD.");
      const [ls, caixa] = await Promise.all([
        sb.from("lancamentos").select("tipo, valor, forma, categoria").eq("petshop_id", petshop.id).eq("pago", true).gte("data", String(e.de)).lte("data", String(e.ate)).limit(5000),
        sb.from("caixas").select("aberto_em, valor_inicial").eq("petshop_id", petshop.id).is("fechado_em", null).maybeSingle(),
      ]);
      const soma = (tipo: string, chave: "categoria" | "forma") => {
        const m: Record<string, number> = {};
        for (const l of ls.data ?? []) if (l.tipo === tipo) m[l[chave] ?? "outro"] = Math.round(((m[l[chave] ?? "outro"] ?? 0) + Number(l.valor)) * 100) / 100;
        return m;
      };
      const total = (tipo: string) => Math.round((ls.data ?? []).filter((l) => l.tipo === tipo).reduce((s, l) => s + Number(l.valor), 0) * 100) / 100;
      return { resultado: { de: e.de, ate: e.ate, entrou: total("entrada"), saiu: total("saida"), resultado: Math.round((total("entrada") - total("saida")) * 100) / 100,
        entradas_por_categoria: soma("entrada", "categoria"), entradas_por_forma: soma("entrada", "forma"), saidas_por_categoria: soma("saida", "categoria"),
        lancamentos: (ls.data ?? []).length, caixa_aberto: caixa.data ? { desde: utcParaLocal(caixa.data.aberto_em, c.fusoMin), troco_inicial: caixa.data.valor_inicial } : null } };
    }
    case "contas_em_aberto": {
      exigir(c.vejoFinanceiro, "Esta pessoa não tem acesso ao financeiro.");
      const ls = ok(await sb.from("lancamentos").select("id, tipo, valor, descricao, categoria, vencimento").eq("petshop_id", petshop.id).eq("pago", false).order("vencimento").limit(200));
      return { resultado: { hoje, a_pagar: ls.filter((l) => l.tipo === "saida").map((l) => ({ descricao: l.descricao ?? l.categoria, valor: l.valor, vencimento: l.vencimento, atrasada: (l.vencimento ?? hoje) < hoje })),
        a_receber: ls.filter((l) => l.tipo === "entrada").map((l) => ({ descricao: l.descricao ?? l.categoria, valor: l.valor, vencimento: l.vencimento })) } };
    }
    case "ver_hospedes": {
      const dias = Math.max(0, Math.min(60, numero(e.dias) ?? 7));
      const abertas = ok(await sb.from("estadias").select("id, tipo, entrada, saida_prevista, valor_diaria, status, obs, pets(id, nome, alertas, clientes(nome))").eq("petshop_id", petshop.id).in("status", ["reservada", "em_casa"]).order("entrada").limit(500));
      const ate = somaDiasLocal(hoje, dias);
      const comum = (x: (typeof abertas)[number]) => ({ estadia_id: x.id, pet_id: x.pets?.id, pet: x.pets?.nome ?? "pet removido", tutor: x.pets?.clientes?.nome, tipo: x.tipo,
        ...(x.pets?.alertas ? { cuidados: x.pets.alertas } : {}), ...(x.obs ? { obs: x.obs } : {}), valor_diaria: x.valor_diaria });
      const naCasa = abertas.filter((x) => x.status === "em_casa").map((x) => {
        const sai = x.saida_prevista ? utcParaLocal(x.saida_prevista, c.fusoMin) : null;
        return { ...comum(x), desde: utcParaLocal(x.entrada, c.fusoMin), saida_prevista: sai, ...(sai && sai < c.agora ? { saida_atrasada: true } : {}), diarias_ate_agora: contarDiarias(c, x) };
      });
      const reservadas = abertas.filter((x) => x.status === "reservada");
      const reservas = reservadas.filter((x) => utcParaLocal(x.entrada, c.fusoMin).slice(0, 10) <= ate).map((x) => {
        const chega = utcParaLocal(x.entrada, c.fusoMin), d = diasEntre(hoje, chega);
        return { ...comum(x), chega, sai: x.saida_prevista ? utcParaLocal(x.saida_prevista, c.fusoMin) : null, situacao: d < 0 ? "não veio (data já passou)" : d === 0 ? "chega hoje" : d === 1 ? "chega amanhã" : `em ${d} dias` };
      });
      return { resultado: { agora: c.agora, na_casa: naCasa, total_na_casa: naCasa.length, reservas, reservas_ate: ate, reservas_mais_para_frente: reservadas.length - reservas.length } };
    }
    case "ver_pacotes": {
      const pet = e.pet_id ? await petPorId(c, e.pet_id) : null;
      const [modelos, ativos] = await Promise.all([
        sb.from("pacotes").select("id, nome, quantidade, validade_dias, preco, servicos(nome)").eq("petshop_id", petshop.id).eq("ativo", true).order("nome"),
        (pet ? sb.from("pacotes_clientes").select("id, pet_id, nome, total, usados, vence_em, preco, pets(nome, clientes(nome))").eq("pet_id", pet.id) : sb.from("pacotes_clientes").select("id, pet_id, nome, total, usados, vence_em, preco, pets(nome, clientes(nome))"))
          .eq("petshop_id", petshop.id).eq("ativo", true).order("criado_em", { ascending: false }).limit(1000),
      ]);
      const lista = ok(ativos).map((p) => ({ pacote_cliente_id: p.id, pet_id: p.pet_id, pet: p.pets?.nome ?? "pet removido", tutor: p.pets?.clientes?.nome, pacote: p.nome, usados: p.usados, total: p.total, restam: Math.max(0, p.total - p.usados),
        vence_em: p.vence_em, ...(p.vence_em ? { validade: situacaoDoVencimento(p.vence_em, hoje) } : {}), ...(c.vejoFinanceiro ? { valor: p.preco } : {}) }));
      return { resultado: { modelos_a_venda: ok(modelos).map((m) => ({ pacote_id: m.id, nome: m.nome, quantidade: m.quantidade, validade_dias: m.validade_dias, preco: m.preco, servico: m.servicos?.nome ?? "qualquer serviço" })),
        ...(pet ? { pet: pet.nome } : {}), pacotes_ativos: lista.slice(0, 60), total_ativos: lista.length,
        ...(pet && !lista.length ? { aviso: `${pet.nome} não tem pacote ativo.` } : {}) } };
    }
    case "ver_caixa": {
      exigir(c.vejoFinanceiro, "Esta pessoa não tem acesso ao financeiro.");
      const aberto = await caixaAbertoAgora(c);
      if (aberto) {
        const r = resumoDoCaixa(aberto.valor_inicial, await movimentosDoCaixa(c, aberto.id));
        const desde = utcParaLocal(aberto.aberto_em, c.fusoMin);
        return { resultado: { caixa: "aberto", desde, ...(desde.slice(0, 10) !== hoje ? { aviso: "Este caixa foi aberto em outro dia. Vale fechar e abrir outro para o dia de hoje ficar separado." } : {}),
          troco_inicial: aberto.valor_inicial, entrou: r.entrou, saiu: r.saiu, lancamentos: r.lancamentos,
          por_forma: Object.fromEntries(r.porForma.filter((f) => f.entrou || f.saiu).map((f) => [f.rotulo, { entrou: f.entrou, saiu: f.saiu }])),
          dinheiro_esperado_na_gaveta: r.esperado, observacao: "Os totais são deste caixa, desde a abertura. Na gaveta só conta o dinheiro." } };
      }
      const r = resumoDoCaixa(0, await movimentosDoCaixa(c, null));
      const { data: ultimo } = await sb.from("caixas").select("*").eq("petshop_id", petshop.id).not("fechado_em", "is", null).order("fechado_em", { ascending: false }).limit(1).maybeSingle();
      const ru = ultimo ? resumoDoCaixa(ultimo.valor_inicial, await movimentosDoCaixa(c, ultimo.id)) : null;
      return { resultado: { caixa: "fechado", lancado_hoje_sem_caixa: { entrou: r.entrou, saiu: r.saiu, por_forma: Object.fromEntries(r.porForma.filter((f) => f.entrou || f.saiu).map((f) => [f.rotulo, { entrou: f.entrou, saiu: f.saiu }])) },
        ultimo_fechamento: ultimo && ru ? { aberto_em: utcParaLocal(ultimo.aberto_em, c.fusoMin), fechado_em: utcParaLocal(ultimo.fechado_em!, c.fusoMin), entrou: ru.entrou, saiu: ru.saiu, esperado_na_gaveta: ru.esperado, contado: ultimo.valor_contado,
          ...(ultimo.valor_contado != null ? { diferenca: diferencaDoCaixa(ultimo.valor_contado, ru.esperado).texto } : {}), ...(ultimo.obs ? { obs: ultimo.obs } : {}) } : null } };
    }
    case "ver_saude": {
      const aviso = "Você só informa o que está anotado e as datas. Não dê orientação veterinária.";
      if (e.pet_id) {
        const pet = await petPorId(c, e.pet_id);
        const ls = ok(await sb.from("pets_saude").select("id, tipo, nome, aplicado_em, vence_em, obs").eq("petshop_id", petshop.id).eq("pet_id", pet.id).order("vence_em", { ascending: false, nullsFirst: false }).limit(200));
        return { resultado: { hoje, pet: pet.nome, tutor: pet.clientes?.nome, total: ls.length,
          cuidados: ls.map((x) => ({ saude_id: x.id, tipo: x.tipo, nome: x.nome, aplicado_em: x.aplicado_em, vence_em: x.vence_em, situacao: situacaoDoVencimento(x.vence_em, hoje), ...(x.obs ? { obs: x.obs } : {}) })),
          ...(ls.length ? {} : { aviso_vazio: `Nada anotado para ${pet.nome} ainda.` }), aviso } };
      }
      const dias = Math.max(1, Math.min(365, numero(e.dias) ?? 30));
      const ls = ok(await sb.from("pets_saude").select("id, pet_id, tipo, nome, aplicado_em, vence_em, pets(nome, ativo, clientes(nome, telefone))").eq("petshop_id", petshop.id).gte("vence_em", somaDiasLocal(hoje, -30)).order("vence_em").limit(3000));
      const chave = (x: { pet_id: string; tipo: string; nome: string }) => `${x.pet_id}|${x.tipo}|${semAcento(x.nome)}`;
      // se o mesmo cuidado já foi refeito (tem um com vencimento mais para frente), o antigo não entra
      const maisNovo = new Map<string, string>();
      for (const x of ls) if (x.vence_em && x.vence_em > (maisNovo.get(chave(x)) ?? "")) maisNovo.set(chave(x), x.vence_em);
      const ate = somaDiasLocal(hoje, dias);
      const emDia = ls.filter((x) => x.pets?.ativo !== false && x.vence_em && x.vence_em <= ate && maisNovo.get(chave(x)) === x.vence_em);
      const linha = (x: (typeof ls)[number]) => ({ pet_id: x.pet_id, pet: x.pets?.nome ?? "pet removido", tutor: x.pets?.clientes?.nome, telefone: x.pets?.clientes?.telefone ? fmtTelefone(x.pets.clientes.telefone) : null,
        tipo: x.tipo, nome: x.nome, vence_em: x.vence_em, situacao: situacaoDoVencimento(x.vence_em, hoje) });
      const vencem = emDia.filter((x) => x.vence_em! >= hoje), vencidos = emDia.filter((x) => x.vence_em! < hoje);
      return { resultado: { hoje, dias, vencem_nos_proximos_dias: vencem.slice(0, 40).map(linha), total_vencendo: vencem.length, venceram_nos_ultimos_30_dias: vencidos.slice(0, 40).map(linha), total_vencidos: vencidos.length, aviso } };
    }
    case "preparar_mensagens": {
      const itens = Array.isArray(e.mensagens) ? (e.mensagens as Entrada[]).slice(0, 30) : [];
      exigir(itens.length, "Passe ao menos uma mensagem.");
      const ids = itens.map((m) => uuid(m.pet_id)).filter(Boolean) as string[];
      const pets = ok(await sb.from("pets").select("id, nome, clientes(nome, telefone)").eq("petshop_id", petshop.id).in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]));
      const links: LinkZap[] = [], semTelefone: string[] = [];
      for (const m of itens) {
        const p = pets.find((x) => x.id === m.pet_id);
        if (!p) continue;
        const url = linkWhatsApp(p.clientes?.telefone, texto(m.texto, 900));
        if (url) links.push({ nome: `${p.nome}${p.clientes?.nome ? ` · ${p.clientes.nome}` : ""}`, texto: texto(m.texto, 900), url });
        else semTelefone.push(p.nome);
      }
      return { resultado: { preparadas: links.length, sem_telefone: semTelefone, aviso: "As mensagens aparecem como botões na tela. Nada foi enviado: a pessoa toca para abrir o WhatsApp." }, links };
    }
  }
  throw new ErroDeUso(`Ferramenta desconhecida: ${nome}`);
}

/* ---------- o que vai aparecer no cartão de confirmação ---------- */

const FORMA: Record<string, string> = { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", outro: "Outro" };
const STATUS: Record<string, string> = { marcado: "Marcado", confirmado: "Confirmado", em_atendimento: "Em atendimento", concluido: "Concluído", faltou: "Faltou", cancelado: "Cancelado" };

/** Confere a proposta (ids existem, datas válidas, permissão) e monta o resumo em português. Lança erro se algo não fecha. */
export async function descrever(c: Contexto, nome: string, e: Entrada): Promise<Resumo> {
  switch (nome) {
    case "cadastrar_pet": {
      exigir(texto(e.nome), "Falta o nome do pet.");
      let tutor = texto(e.tutor_nome, 120);
      if (uuid(e.cliente_id)) {
        const { data } = await c.sb.from("clientes").select("nome").eq("petshop_id", c.petshop.id).eq("id", String(e.cliente_id)).maybeSingle();
        exigir(data, "Cliente não encontrado.");
        tutor = data.nome;
      }
      exigir(tutor, "Falta o nome do tutor. Pergunte de quem é o pet.");
      const linhas: [string, string][] = [["Pet", texto(e.nome, 80)], ["Tutor", uuid(e.cliente_id) ? `${tutor} (já é cliente)` : `${tutor} (novo)`]];
      if (texto(e.tutor_telefone)) linhas.push(["WhatsApp", fmtTelefone(texto(e.tutor_telefone))]);
      const det = [e.especie === "gato" ? "Gato" : e.especie === "outro" ? "Outro" : "Cachorro", texto(e.raca), e.porte ? `porte ${e.porte}` : ""].filter(Boolean).join(" · ");
      linhas.push(["Detalhes", det]);
      if (texto(e.alertas)) linhas.push(["Cuidados", texto(e.alertas, 300)]);
      return { titulo: "Cadastrar pet", linhas };
    }
    case "marcar_horario": {
      const pet = await petPorId(c, e.pet_id);
      const servico = servicoPorId(c, e.servico_id);
      exigir(servico, "servico_id inválido: use um dos serviços do pet shop.");
      const { inicios, aCada } = iniciosDoPedido(e);
      const inicio = inicios[0];
      const prof = e.profissional_id ? profPorId(c, e.profissional_id) : null;
      exigir(!e.profissional_id || prof, "profissional_id inválido.");
      const intervalos = inicios.map((i) => { const ini = localParaUtc(i, c.fusoMin); return { local: i, ini, fim: new Date(ini.getTime() + servico.duracao_min * 60000) }; });
      // bloqueio do pet shop inteiro ou do profissional escolhido: não marca
      const bloqueios = await bloqueiosEntre(c, intervalos[0].ini, intervalos[intervalos.length - 1].fim);
      const barrados = intervalos.map((x) => ({ x, b: bloqueios.find((b) => bloqueioPega(b, prof?.id, x.ini.getTime(), x.fim.getTime())) })).filter((r) => r.b);
      if (barrados.length) {
        exigir(inicios.length > 1, `Esse horário está bloqueado (${bloqueioEmTexto(c, barrados[0].b!)}). Nada foi marcado. Avise a pessoa e use horarios_livres para sugerir outro horário.`);
        throw new ErroDeUso(`A série cai em horário bloqueado nestas datas: ${barrados.map((r) => `${quandoLocal(r.x.local.slice(0, 10))} (${bloqueioEmTexto(c, r.b!)})`).join("; ")}. Nada foi marcado. Avise a pessoa e combine outro horário ou outra repetição.`);
      }
      const preco = numero(e.preco) ?? precoDoServico(servico, pet.porte);
      const linhas: [string, string][] = [["Pet", `${pet.nome}${pet.clientes?.nome ? ` (${pet.clientes.nome})` : ""}`], ["Serviço", servico.nome]];
      if (inicios.length > 1) {
        linhas.push(["Começa", quandoLocal(inicio)], ["Repete", `${aCada === 1 ? "toda semana" : `a cada ${aCada} semanas`}, ${inicios.length} horários`], ["Datas", inicios.map((i) => diaCurtoLocal(i.slice(0, 10))).join(", ")]);
      } else linhas.push(["Quando", quandoLocal(inicio)]);
      if (prof) linhas.push(["Com", prof.nome]);
      linhas.push(["Valor", preco != null ? `${brl(preco)}${inicios.length > 1 ? " cada" : ""}` : "a definir"]);
      if (e.leva_traz) linhas.push(["Leva e traz", "sim"]);
      if (texto(e.obs)) linhas.push(["Obs.", texto(e.obs, 300)]);
      const func = (c.petshop.horario as Horario | null)?.[String(diaSemanaLocal(inicio.slice(0, 10)))];
      if (!func) linhas.push(["Atenção", "o pet shop não abre nesse dia"]);
      else if (inicio.slice(11) < func.abre || inicio.slice(11) >= func.fecha) linhas.push(["Atenção", `fora do horário (${func.abre} às ${func.fecha})`]);
      if (prof) {
        const batem: string[] = [];
        for (const x of intervalos) {
          const { data: bate } = await c.sb.rpc("conflitos_agenda", { p_petshop: c.petshop.id, p_profissional: prof.id, p_inicio: x.ini.toISOString(), p_fim: x.fim.toISOString() });
          if (bate?.length) batem.push(diaCurtoLocal(x.local.slice(0, 10)));
        }
        if (batem.length) linhas.push(["Atenção", `${prof.nome.split(" ")[0]} já tem atendimento ${inicios.length > 1 ? `em ${batem.join(", ")}` : "nesse horário"}`]);
      }
      return { titulo: inicios.length > 1 ? `Marcar ${inicios.length} horários` : "Marcar horário", linhas };
    }
    case "bloquear_horario": {
      const p = planoDoBloqueio(c, e);
      const linhas: [string, string][] = [
        ["Quando", p.dias.length > 1 ? `${quandoLocal(p.dias[0])} até ${quandoLocal(p.dias[p.dias.length - 1])}` : quandoLocal(p.dias[0])],
        ["Horário", p.de ? `${p.de} às ${p.ate}` : "dia inteiro"],
        ["Para", p.prof ? p.prof.nome : "pet shop inteiro"],
      ];
      if (p.motivo) linhas.push(["Motivo", p.motivo]);
      if (p.dias.length > 1) linhas.push(["Repete", `nos dias úteis, ${p.dias.length} dias (${[...new Set(p.dias.slice(0, 14).map((d) => DIAS_CURTOS[diaSemanaLocal(d)]))].join(", ")})`]);
      // quem já está marcado nesse período continua marcado: só avisa
      const ags = ok(await c.sb.from("agendamentos").select("inicio, fim, profissional_id, status").eq("petshop_id", c.petshop.id)
        .gte("inicio", new Date(Date.parse(p.linhas[0].inicio) - 864e5).toISOString()).lt("inicio", p.linhas[p.linhas.length - 1].fim).limit(2000));
      const marcados = ags.filter((a) => !["cancelado", "faltou"].includes(a.status) && (!p.prof || a.profissional_id === p.prof.id)
        && p.linhas.some((l) => new Date(a.inicio).getTime() < Date.parse(l.fim) && new Date(a.fim).getTime() > Date.parse(l.inicio))).length;
      if (marcados) linhas.push(["Atenção", `${marcados === 1 ? "já há 1 horário marcado" : `já há ${marcados} horários marcados`} nesse período (${marcados === 1 ? "continua marcado" : "continuam marcados"})`]);
      return { titulo: "Bloquear horário", linhas };
    }
    case "alterar_horario": {
      const id = uuid(e.agendamento_id);
      exigir(id, "agendamento_id inválido: use ver_agenda.");
      const { data: a } = await c.sb.from("agendamentos").select("inicio, fim, profissional_id, status, pets(nome, clientes(nome)), servicos(nome)").eq("petshop_id", c.petshop.id).eq("id", id).maybeSingle();
      exigir(a, "Horário não encontrado: use ver_agenda.");
      const linhas: [string, string][] = [["Pet", `${a.pets?.nome ?? ""}${a.pets?.clientes?.nome ? ` (${a.pets.clientes.nome})` : ""}`], ["Hoje está", `${a.servicos?.nome ?? "atendimento"}, ${quandoLocal(utcParaLocal(a.inicio, c.fusoMin))}`]];
      if (e.inicio) { exigir(RE_DIA_HORA.test(String(e.inicio)), "inicio no formato AAAA-MM-DDTHH:mm."); linhas.push(["Novo horário", quandoLocal(String(e.inicio).slice(0, 16))]); }
      if (e.servico_id) { const s = servicoPorId(c, e.servico_id); exigir(s, "servico_id inválido."); linhas.push(["Novo serviço", s.nome]); }
      if (e.profissional_id) { const p = profPorId(c, e.profissional_id); exigir(p, "profissional_id inválido."); linhas.push(["Com", p.nome]); }
      if (numero(e.preco) != null) linhas.push(["Novo valor", brl(numero(e.preco))]);
      if (e.status) { exigir(STATUS[String(e.status)], "status inválido."); linhas.push(["Fica como", STATUS[String(e.status)]]); }
      exigir(linhas.length > 2, "Diga o que muda no horário.");
      // mesma regra de marcar_horario: não cai em bloqueio do pet shop inteiro nem do profissional
      if ((e.inicio || e.servico_id || e.profissional_id) && !["cancelado", "faltou"].includes(String(e.status ?? ""))) {
        const ini = e.inicio ? localParaUtc(String(e.inicio), c.fusoMin) : new Date(a.inicio);
        const servico = e.servico_id ? servicoPorId(c, e.servico_id) : null;
        const fim = new Date(ini.getTime() + (servico ? servico.duracao_min * 60000 : new Date(a.fim).getTime() - new Date(a.inicio).getTime()));
        const profId = uuid(e.profissional_id) ?? a.profissional_id;
        const antes = new Date(a.inicio).getTime(), antesFim = new Date(a.fim).getTime();
        const bloqueios = await bloqueiosEntre(c, new Date(Math.min(ini.getTime(), antes)), new Date(Math.max(fim.getTime(), antesFim)));
        const barra = bloqueios.find((b) => bloqueioPega(b, profId, ini.getTime(), fim.getTime()));
        // quem já estava dentro de um bloqueio (criado depois) e só troca o serviço continua onde está
        const jaEstava = !e.inicio && !e.profissional_id && bloqueios.some((b) => bloqueioPega(b, a.profissional_id, antes, antesFim));
        exigir(!barra || jaEstava, `Esse horário está bloqueado (${barra ? bloqueioEmTexto(c, barra) : ""}). Nada foi alterado. Avise a pessoa e use horarios_livres para sugerir outro horário.`);
      }
      return { titulo: e.status === "cancelado" ? "Cancelar horário" : e.inicio ? "Remarcar horário" : "Alterar horário", linhas };
    }
    case "remover_bloqueio": {
      const { alvo, todos } = await planoDeRemoverBloqueio(c, e);
      const ini = utcParaLocal(alvo.inicio, c.fusoMin), fim = utcParaLocal(alvo.fim, c.fusoMin);
      const linhas: [string, string][] = [
        ["Quando", quandoLocal(ini.slice(0, 10))],
        ["Horário", ini.slice(11) === "00:00" && fim.slice(11) === "00:00" ? "dia inteiro" : `${ini.slice(11)} às ${fim.slice(11)}`],
        ["Para", quemDoBloqueio(c, alvo)],
      ];
      if (alvo.motivo) linhas.push(["Motivo", alvo.motivo]);
      if (todos.length > 1) linhas.push(["Remove", `este e os próximos da série: ${todos.length} bloqueios, até ${diaCurtoLocal(utcParaLocal(todos[todos.length - 1].inicio, c.fusoMin).slice(0, 10))}`]);
      else if (e.e_os_proximos && !alvo.serie_id) linhas.push(["Atenção", "esse bloqueio não faz parte de uma série: só ele sai"]);
      else if (alvo.serie_id && !e.e_os_proximos) linhas.push(["Repete", "faz parte de uma série: só este dia sai"]);
      return { titulo: todos.length > 1 ? `Remover ${todos.length} bloqueios` : "Remover bloqueio", linhas };
    }
    case "fazer_checkin": {
      const p = await planoDoCheckin(c, e);
      const linhas: [string, string][] = [["Pet", `${p.pet.nome}${p.pet.clientes?.nome ? ` (${p.pet.clientes.nome})` : ""}`], ["Tipo", TIPO_ESTADIA[p.tipo]], ["Entrada", `agora, ${quandoLocal(c.agora)}`]];
      if (p.reserva) linhas.push(["Reserva", `usa a reserva de ${quandoLocal(utcParaLocal(p.reserva.entrada, c.fusoMin))}`]);
      const sai = p.saida ?? (p.reserva?.saida_prevista ? utcParaLocal(p.reserva.saida_prevista, c.fusoMin) : null);
      linhas.push(["Saída prevista", sai ? quandoLocal(sai) : "sem saída prevista"]);
      linhas.push(["Diária", p.diaria != null ? `${brl(p.diaria)} por ${p.tipo === "hotel" ? "noite" : "dia"}${p.origemDiaria}` : "a combinar"]);
      if (p.obs) linhas.push(["Obs.", p.obs]);
      if (p.pet.alertas) linhas.push(["Cuidados", texto(p.pet.alertas, 300)]);
      if (p.outra) linhas.push(["Atenção", `a reserva de ${TIPO_ESTADIA[p.outra.tipo]?.toLowerCase() ?? "estadia"} de ${quandoLocal(utcParaLocal(p.outra.entrada, c.fusoMin))} continua marcada`]);
      return { titulo: "Fazer check-in", linhas };
    }
    case "fazer_checkout": {
      const p = await planoDoCheckout(c, e);
      const palavra = p.estadia.tipo === "hotel" ? (p.n === 1 ? "noite" : "noites") : (p.n === 1 ? "dia" : "dias");
      const linhas: [string, string][] = [["Pet", `${p.pet.nome}${p.pet.clientes?.nome ? ` (${p.pet.clientes.nome})` : ""}`], ["Tipo", TIPO_ESTADIA[p.estadia.tipo] ?? p.estadia.tipo],
        ["Chegou", quandoLocal(utcParaLocal(p.estadia.entrada, c.fusoMin))], ["Sai", `agora, ${quandoLocal(c.agora)}`],
        ["Diárias", `${p.n} ${palavra}${c.vejoFinanceiro && p.estadia.valor_diaria != null ? ` × ${brl(p.estadia.valor_diaria)}` : ""}`]];
      if (!c.vejoFinanceiro) linhas.push(["Pagamento", "fica para quem cuida do financeiro lançar"]);
      else if (p.valor) linhas.push(["Recebe", `${brl(p.valor)} no ${FORMA[String(e.forma)]}`]);
      else linhas.push(["Pagamento", numero(e.valor) === 0 ? "nada é cobrado agora" : "a diária não foi combinada: nada é cobrado agora"]);
      return { titulo: "Fazer check-out", linhas };
    }
    case "vender_pacote": {
      const p = await planoDaVenda(c, e);
      const linhas: [string, string][] = [["Pet", `${p.pet.nome}${p.pet.clientes?.nome ? ` (${p.pet.clientes.nome})` : ""}`], ["Pacote", p.modelo.nome], ["Quantidade", `${p.modelo.quantidade}x`],
        ["Vence", p.venceEm ? quandoLocal(p.venceEm) : "sem data para vencer"], ["Valor", brl(p.preco)]];
      if (p.lanca) linhas.push(["Pagamento", `${brl(p.preco)} no ${FORMA[String(e.forma)]}`]);
      else if (p.preco > 0) linhas.push(["Pagamento", c.vejoFinanceiro ? "ainda não pagou: nada entra no financeiro agora" : "fica para quem cuida do financeiro lançar"]);
      const { data: jaTem } = await c.sb.from("pacotes_clientes").select("nome, total, usados").eq("petshop_id", c.petshop.id).eq("pet_id", p.pet.id).eq("ativo", true).limit(3);
      if (jaTem?.length) linhas.push(["Atenção", `já tem pacote ativo: ${jaTem.map((x) => `${x.nome} (${x.usados} de ${x.total} usados)`).join(", ")}`]);
      return { titulo: "Vender pacote", linhas };
    }
    case "usar_pacote": {
      const { pet, pacote } = await pacoteParaUsar(c, e);
      const usados = pacote.usados + 1, resta = pacote.total - usados;
      const linhas: [string, string][] = [["Pet", `${pet.nome}${pet.clientes?.nome ? ` (${pet.clientes.nome})` : ""}`], ["Pacote", pacote.nome], ["Fica", `${usados} de ${pacote.total} usados`],
        ["Depois", resta === 0 ? "pacote concluído" : resta === 1 ? "falta 1" : `faltam ${resta}`]];
      if (pacote.vence_em && pacote.vence_em < c.agora.slice(0, 10)) linhas.push(["Atenção", `o pacote venceu em ${quandoLocal(pacote.vence_em)}`]);
      return { titulo: "Usar 1 do pacote", linhas };
    }
    case "registrar_saude": {
      const pet = await petPorId(c, e.pet_id);
      const hoje = c.agora.slice(0, 10);
      exigir(TIPO_SAUDE[String(e.tipo)], "tipo deve ser vacina, vermifugo, antipulgas ou outro.");
      exigir(texto(e.nome, 80), "Falta o nome do cuidado (ex.: V10, Antirrábica, o nome do remédio). Pergunte.");
      const aplicado = e.aplicado_em ? String(e.aplicado_em) : hoje;
      exigir(RE_DIA.test(aplicado), "aplicado_em no formato AAAA-MM-DD.");
      exigir(aplicado <= hoje, "aplicado_em não pode ser no futuro. Se ainda vai ser aplicado, não registre agora.");
      exigir(!e.vence_em || RE_DIA.test(String(e.vence_em)), "vence_em no formato AAAA-MM-DD.");
      exigir(!e.vence_em || String(e.vence_em) >= aplicado, "O vencimento precisa ser depois da aplicação.");
      const linhas: [string, string][] = [["Pet", `${pet.nome}${pet.clientes?.nome ? ` (${pet.clientes.nome})` : ""}`], ["Cuidado", `${TIPO_SAUDE[String(e.tipo)]} · ${texto(e.nome, 80)}`],
        ["Aplicado", aplicado === hoje ? `hoje, ${quandoLocal(aplicado)}` : quandoLocal(aplicado)], ["Vence", e.vence_em ? `${quandoLocal(String(e.vence_em))}/${String(e.vence_em).slice(0, 4)}` : "sem data de vencimento"]];
      if (texto(e.obs)) linhas.push(["Obs.", texto(e.obs, 300)]);
      return { titulo: "Anotar na saúde do pet", linhas };
    }
    case "abrir_caixa": {
      exigir(c.vejoFinanceiro, "Esta pessoa não tem acesso ao financeiro.");
      const aberto = await caixaAbertoAgora(c);
      exigir(!aberto, `O caixa já está aberto desde ${quandoLocal(utcParaLocal(aberto?.aberto_em ?? new Date().toISOString(), c.fusoMin))}. Nada foi feito.`);
      const troco = numero(e.troco_inicial) ?? 0;
      exigir(troco >= 0, "troco_inicial inválido.");
      return { titulo: "Abrir o caixa", linhas: [["Quando", `agora, ${quandoLocal(c.agora)}`], ["Troco inicial", troco ? brl(troco) : "R$ 0,00 (gaveta vazia)"]] };
    }
    case "fechar_caixa": {
      exigir(c.vejoFinanceiro, "Esta pessoa não tem acesso ao financeiro.");
      const aberto = await caixaAbertoAgora(c);
      exigir(aberto, "Não há caixa aberto para fechar.");
      const contado = numero(e.valor_contado);
      exigir(contado != null && contado >= 0, "Falta o valor contado: peça para a pessoa contar o dinheiro da gaveta. Se está vazia, é 0.");
      const r = resumoDoCaixa(aberto.valor_inicial, await movimentosDoCaixa(c, aberto.id));
      const linhas: [string, string][] = [["Aberto desde", quandoLocal(utcParaLocal(aberto.aberto_em, c.fusoMin))], ["Troco inicial", brl(aberto.valor_inicial)], ["Entradas", brl(r.entrou)]];
      for (const f of r.porForma) if (f.entrou > 0) linhas.push([`· ${f.rotulo}`, brl(f.entrou)]);
      linhas.push(["Saídas", brl(r.saiu)]);
      for (const f of r.porForma) if (f.saiu > 0) linhas.push([`· ${f.rotulo} (saiu)`, brl(f.saiu)]);
      linhas.push(["Esperado na gaveta", brl(r.esperado)], ["Contado", brl(contado)], ["Diferença", diferencaDoCaixa(contado, r.esperado).texto]);
      if (texto(e.obs)) linhas.push(["Obs.", texto(e.obs, 500)]);
      return { titulo: "Fechar o caixa", linhas };
    }
    case "lancar_dinheiro": {
      exigir(c.vejoFinanceiro, "Esta pessoa não tem acesso ao financeiro.");
      const valor = numero(e.valor);
      exigir(valor && valor > 0, "Falta o valor.");
      exigir(FORMA[String(e.forma)], "Falta a forma de pagamento: pergunte (Pix, dinheiro, débito ou crédito).");
      const linhas: [string, string][] = [[e.tipo === "saida" ? "Saiu" : "Entrou", brl(valor)], ["Forma", FORMA[String(e.forma)]], ["Categoria", texto(e.categoria, 60) || "Outros"]];
      if (texto(e.descricao)) linhas.push(["Descrição", texto(e.descricao)]);
      if (e.agendamento_id) {
        const { data: a } = await c.sb.from("agendamentos").select("pets(nome), servicos(nome)").eq("petshop_id", c.petshop.id).eq("id", uuid(e.agendamento_id) ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
        exigir(a, "agendamento_id inválido.");
        linhas.push(["Atendimento", `${a.servicos?.nome ?? "atendimento"} · ${a.pets?.nome ?? ""} (fica concluído)`]);
      }
      return { titulo: e.tipo === "saida" ? "Lançar saída" : "Lançar entrada", linhas };
    }
    case "criar_conta": {
      exigir(c.vejoFinanceiro, "Esta pessoa não tem acesso ao financeiro.");
      const valor = numero(e.valor);
      exigir(valor && valor > 0, "Falta o valor.");
      exigir(RE_DIA.test(String(e.vencimento)), "vencimento no formato AAAA-MM-DD.");
      return { titulo: e.tipo === "entrada" ? "Conta a receber" : "Conta a pagar", linhas: [["O quê", texto(e.descricao) || "Conta"], ["Valor", brl(valor)], ["Vence", quandoLocal(String(e.vencimento))], ["Categoria", texto(e.categoria, 60) || "Outros"]] };
    }
    case "movimentar_estoque": {
      const qtd = numero(e.quantidade);
      exigir(qtd && qtd > 0, "Falta a quantidade.");
      let nomeProd = texto(e.produto_nome, 120), unidade = texto(e.unidade, 12) || "un", novo = true, saldo = 0;
      if (uuid(e.produto_id)) {
        const { data: p } = await c.sb.from("produtos").select("nome, unidade, estoque").eq("petshop_id", c.petshop.id).eq("id", String(e.produto_id)).maybeSingle();
        exigir(p, "produto_id inválido: use ver_estoque.");
        nomeProd = p.nome; unidade = p.unidade; novo = false; saldo = Number(p.estoque);
      }
      exigir(nomeProd, "Diga qual é o produto.");
      exigir(!(novo && e.tipo === "saida"), "Esse produto não está no estoque: use ver_estoque para achar o nome certo.");
      const custo = numero(e.custo_unitario);
      const linhas: [string, string][] = [["Produto", novo ? `${nomeProd} (novo no estoque)` : nomeProd], [e.tipo === "saida" ? "Sai" : "Entra", `${qtd} ${unidade}`], ["Saldo fica", `${e.tipo === "saida" ? saldo - qtd : saldo + qtd} ${unidade}`]];
      if (custo != null && e.tipo === "entrada") linhas.push(["Custo", `${brl(custo)} cada · total ${brl(custo * qtd)}`]);
      if (e.lancar_despesa && custo != null && e.tipo === "entrada" && c.vejoFinanceiro) {
        exigir(FORMA[String(e.forma)], "Para lançar a despesa, pergunte como foi pago (Pix, dinheiro, débito ou crédito).");
        linhas.push(["Despesa", `${brl(custo * qtd)} no ${FORMA[String(e.forma)]}`]);
      }
      if (texto(e.motivo)) linhas.push(["Motivo", texto(e.motivo, 80)]);
      return { titulo: e.tipo === "saida" ? "Saída de estoque" : "Entrada de estoque", linhas };
    }
  }
  throw new ErroDeUso(`Ferramenta desconhecida: ${nome}`);
}

/* ---------- gravações (só depois do "Confirmar") ---------- */

async function caixaAbertoId(c: Contexto) {
  const { data } = await c.sb.from("caixas").select("id").eq("petshop_id", c.petshop.id).is("fechado_em", null).maybeSingle();
  return data?.id ?? null;
}

export async function gravar(c: Contexto, nome: string, e: Entrada): Promise<unknown> {
  const { sb, petshop } = c;
  const hoje = c.agora.slice(0, 10);
  await descrever(c, nome, e); // confere de novo na hora de gravar
  switch (nome) {
    case "cadastrar_pet": {
      let clienteId = uuid(e.cliente_id);
      if (!clienteId) clienteId = ok(await sb.from("clientes").insert({ petshop_id: petshop.id, nome: texto(e.tutor_nome, 120), telefone: texto(e.tutor_telefone, 30) || null }).select("id").single()).id;
      const pet = ok(await sb.from("pets").insert({ petshop_id: petshop.id, cliente_id: clienteId, nome: texto(e.nome, 80), especie: ["cao", "gato", "outro"].includes(String(e.especie)) ? String(e.especie) : "cao",
        raca: texto(e.raca, 60) || null, porte: ["P", "M", "G", "GG"].includes(String(e.porte)) ? String(e.porte) : null, alertas: texto(e.alertas, 400) || null }).select("id, nome").single());
      return { feito: true, pet_id: pet.id, cliente_id: clienteId };
    }
    case "marcar_horario": {
      const pet = await petPorId(c, e.pet_id);
      const servico = servicoPorId(c, e.servico_id)!;
      const { inicios } = iniciosDoPedido(e);
      const serie = inicios.length > 1 ? crypto.randomUUID() : null;
      const criados = ok(await sb.from("agendamentos").insert(inicios.map((i) => {
        const ini = localParaUtc(i, c.fusoMin);
        return { petshop_id: petshop.id, pet_id: pet.id, servico_id: servico.id, profissional_id: uuid(e.profissional_id), serie_id: serie,
          inicio: ini.toISOString(), fim: new Date(ini.getTime() + servico.duracao_min * 60000).toISOString(), preco: numero(e.preco) ?? precoDoServico(servico, pet.porte),
          obs: texto(e.obs, 400) || null, leva_traz: Boolean(e.leva_traz), origem: "assistente", criado_por: c.userId };
      })).select("id, inicio"));
      const emOrdem = [...criados].sort((x, y) => x.inicio.localeCompare(y.inicio));
      if (inicios.length === 1) return { feito: true, agendamento_id: emOrdem[0]?.id };
      return { feito: true, horarios_marcados: emOrdem.length, serie_id: serie, agendamento_id: emOrdem[0]?.id, datas: emOrdem.map((a) => utcParaLocal(a.inicio, c.fusoMin)) };
    }
    case "bloquear_horario": {
      const p = planoDoBloqueio(c, e);
      // os dias de um bloqueio que se repete dividem a mesma série, para dar para tirar "este e os próximos"
      const serie = p.linhas.length > 1 ? crypto.randomUUID() : null;
      const criados = ok(await sb.from("bloqueios").insert(p.linhas.map((l) => ({ petshop_id: petshop.id, profissional_id: p.prof?.id ?? null, inicio: l.inicio, fim: l.fim, motivo: p.motivo, serie_id: serie, criado_por: c.userId }))).select("id"));
      return { feito: true, bloqueios_criados: criados.length };
    }
    case "remover_bloqueio": {
      const { todos } = await planoDeRemoverBloqueio(c, e);
      const r = ok(await sb.from("bloqueios").delete().eq("petshop_id", petshop.id).in("id", todos.map((b) => b.id)).select("id"));
      exigir(r.length, "Esse bloqueio já tinha sido removido, ou esta pessoa não pode remover.");
      return { feito: true, bloqueios_removidos: r.length };
    }
    case "fazer_checkin": {
      const p = await planoDoCheckin(c, e);
      const saida = p.saida ? localParaUtc(p.saida, c.fusoMin).toISOString() : null;
      if (p.reserva) {
        const r = ok(await sb.from("estadias").update({ status: "em_casa", entrada: new Date().toISOString(), ...(saida ? { saida_prevista: saida } : {}),
          ...(numero(e.valor_diaria) != null ? { valor_diaria: numero(e.valor_diaria) } : {}), ...(p.obs ? { obs: p.obs } : {}) })
          .eq("id", p.reserva.id).eq("petshop_id", petshop.id).eq("status", "reservada").select("id"));
        exigir(r.length, "Essa reserva já tinha sido alterada. Use ver_hospedes para conferir.");
        return { feito: true, estadia_id: p.reserva.id, usou_reserva: true };
      }
      const nova = ok(await sb.from("estadias").insert({ petshop_id: petshop.id, pet_id: p.pet.id, tipo: p.tipo, entrada: new Date().toISOString(), saida_prevista: saida,
        valor_diaria: p.diaria, status: "em_casa", obs: p.obs }).select("id").single());
      return { feito: true, estadia_id: nova.id, usou_reserva: false };
    }
    case "fazer_checkout": {
      const p = await planoDoCheckout(c, e);
      const r = ok(await sb.from("estadias").update({ status: "encerrada", saida: new Date().toISOString() }).eq("id", p.estadia.id).eq("petshop_id", petshop.id).eq("status", "em_casa").select("id"));
      exigir(r.length, "Esse check-out já tinha sido feito.");
      if (!p.valor) return { feito: true, diarias: p.n, pagamento_lancado: false };
      // a estadia já está encerrada: se o dinheiro falhar, avisa em vez de dar tudo como perdido (igual à tela)
      const pago = await sb.from("lancamentos").insert({ petshop_id: petshop.id, tipo: "entrada", valor: p.valor, forma: String(e.forma), categoria: "Creche e hotel",
        descricao: `${TIPO_ESTADIA[p.estadia.tipo] ?? "Estadia"}: ${p.n} ${p.n === 1 ? "diária" : "diárias"} · ${p.pet.nome}`, data: hoje, pago: true, caixa_id: await caixaAbertoId(c),
        cliente_id: p.pet.clientes?.id ?? null, origem: "assistente", criado_por: c.userId }).select("id").single();
      if (pago.error) return { feito: true, diarias: p.n, pagamento_lancado: false, aviso: "O check-out foi feito, mas o pagamento não foi lançado. Diga isso e peça para lançar pelo Financeiro." };
      return { feito: true, diarias: p.n, pagamento_lancado: true, valor: p.valor };
    }
    case "vender_pacote": {
      const p = await planoDaVenda(c, e);
      const vendido = ok(await sb.from("pacotes_clientes").insert({ petshop_id: petshop.id, pet_id: p.pet.id, pacote_id: p.modelo.id, nome: p.modelo.nome, servico_id: p.modelo.servico_id,
        total: p.modelo.quantidade, comprado_em: p.hoje, vence_em: p.venceEm, preco: p.preco }).select("id").single());
      if (!p.lanca) return { feito: true, pacote_cliente_id: vendido.id, pagamento_lancado: false };
      const pago = await sb.from("lancamentos").insert({ petshop_id: petshop.id, tipo: "entrada", valor: p.preco, forma: String(e.forma), categoria: "Pacotes", descricao: `Pacote ${p.modelo.nome} · ${p.pet.nome}`,
        data: p.hoje, pago: true, caixa_id: await caixaAbertoId(c), cliente_id: p.pet.clientes?.id ?? null, origem: "assistente", criado_por: c.userId }).select("id").single();
      if (pago.error) return { feito: true, pacote_cliente_id: vendido.id, pagamento_lancado: false, aviso: "O pacote foi criado, mas o pagamento não foi lançado. Diga isso e peça para lançar pelo Financeiro." };
      return { feito: true, pacote_cliente_id: vendido.id, pagamento_lancado: true, valor: p.preco };
    }
    case "usar_pacote": {
      const { pacote } = await pacoteParaUsar(c, e);
      const usados = pacote.usados + 1;
      // só grava se ninguém mexeu no meio do caminho
      const r = ok(await sb.from("pacotes_clientes").update({ usados, ativo: usados < pacote.total }).eq("id", pacote.id).eq("petshop_id", petshop.id).eq("usados", pacote.usados).select("id"));
      exigir(r.length, "Esse pacote acabou de ser alterado por outra pessoa. Nada foi feito. Use ver_pacotes para conferir.");
      return { feito: true, usados, total: pacote.total, restam: pacote.total - usados, pacote_concluido: usados >= pacote.total };
    }
    case "registrar_saude": {
      const pet = await petPorId(c, e.pet_id);
      const novo = ok(await sb.from("pets_saude").insert({ petshop_id: petshop.id, pet_id: pet.id, tipo: String(e.tipo), nome: texto(e.nome, 80), aplicado_em: e.aplicado_em ? String(e.aplicado_em) : hoje,
        vence_em: e.vence_em ? String(e.vence_em) : null, obs: texto(e.obs, 300) || null, criado_por: c.userId }).select("id").single());
      return { feito: true, saude_id: novo.id };
    }
    case "abrir_caixa": {
      const r = await sb.from("caixas").insert({ petshop_id: petshop.id, valor_inicial: Math.max(0, numero(e.troco_inicial) ?? 0), aberto_por: c.userId }).select("id").single();
      exigir(!r.error || !/caixas_um_aberto|duplicate/i.test(r.error.message), "O caixa já tinha sido aberto. Nada foi feito.");
      return { feito: true, caixa_id: ok(r).id };
    }
    case "fechar_caixa": {
      const aberto = await caixaAbertoAgora(c);
      exigir(aberto, "Não há caixa aberto para fechar.");
      const contado = numero(e.valor_contado)!;
      const esperado = resumoDoCaixa(aberto.valor_inicial, await movimentosDoCaixa(c, aberto.id)).esperado;
      const r = ok(await sb.from("caixas").update({ fechado_em: new Date().toISOString(), fechado_por: c.userId, valor_contado: contado, obs: texto(e.obs, 500) || null })
        .eq("id", aberto.id).eq("petshop_id", petshop.id).is("fechado_em", null).select("id"));
      exigir(r.length, "Este caixa já tinha sido fechado.");
      return { feito: true, esperado_na_gaveta: esperado, contado, diferenca: diferencaDoCaixa(contado, esperado).texto };
    }
    case "alterar_horario": {
      const id = String(e.agendamento_id);
      const atual = ok(await sb.from("agendamentos").select("inicio, fim, servico_id").eq("petshop_id", petshop.id).eq("id", id).single());
      const campos: Record<string, unknown> = {};
      const servico = e.servico_id ? servicoPorId(c, e.servico_id) : null;
      const duracao = servico ? servico.duracao_min * 60000 : new Date(atual.fim).getTime() - new Date(atual.inicio).getTime();
      if (e.inicio || servico) {
        const ini = e.inicio ? localParaUtc(String(e.inicio), c.fusoMin) : new Date(atual.inicio);
        campos.inicio = ini.toISOString(); campos.fim = new Date(ini.getTime() + duracao).toISOString();
      }
      if (servico) campos.servico_id = servico.id;
      if (e.profissional_id) campos.profissional_id = uuid(e.profissional_id);
      if (numero(e.preco) != null) campos.preco = numero(e.preco);
      if (e.status) campos.status = String(e.status);
      ok(await sb.from("agendamentos").update(campos as never).eq("petshop_id", petshop.id).eq("id", id).select("id").single());
      return { feito: true };
    }
    case "lancar_dinheiro": {
      const agId = uuid(e.agendamento_id);
      let clienteId: string | null = null;
      if (agId) clienteId = (await sb.from("agendamentos").select("pets(cliente_id)").eq("id", agId).maybeSingle()).data?.pets?.cliente_id ?? null;
      ok(await sb.from("lancamentos").insert({ petshop_id: petshop.id, tipo: String(e.tipo), valor: numero(e.valor)!, forma: String(e.forma), categoria: texto(e.categoria, 60) || "Outros",
        descricao: texto(e.descricao) || null, data: hoje, pago: true, caixa_id: await caixaAbertoId(c), agendamento_id: agId, cliente_id: clienteId, origem: "assistente", criado_por: c.userId }).select("id").single());
      if (agId && e.tipo === "entrada") await sb.from("agendamentos").update({ status: "concluido" }).eq("petshop_id", petshop.id).eq("id", agId);
      return { feito: true };
    }
    case "criar_conta": {
      ok(await sb.from("lancamentos").insert({ petshop_id: petshop.id, tipo: e.tipo === "entrada" ? "entrada" : "saida", valor: numero(e.valor)!, categoria: texto(e.categoria, 60) || "Outros",
        descricao: texto(e.descricao) || null, data: String(e.vencimento), vencimento: String(e.vencimento), pago: false, origem: "assistente", criado_por: c.userId }).select("id").single());
      return { feito: true };
    }
    case "movimentar_estoque": {
      let produtoId = uuid(e.produto_id);
      const qtd = numero(e.quantidade)!, custo = numero(e.custo_unitario);
      let nomeProd = texto(e.produto_nome, 120), unidade = texto(e.unidade, 12) || "un";
      if (!produtoId) produtoId = ok(await sb.from("produtos").insert({ petshop_id: petshop.id, nome: nomeProd, unidade, custo }).select("id").single()).id;
      else { const p = ok(await sb.from("produtos").select("nome, unidade").eq("id", produtoId).single()); nomeProd = p.nome; unidade = p.unidade; }
      ok(await sb.from("movimentos_estoque").insert({ petshop_id: petshop.id, produto_id: produtoId, tipo: e.tipo === "saida" ? "saida" : "entrada", quantidade: qtd,
        custo_unitario: e.tipo === "entrada" ? custo : null, motivo: texto(e.motivo, 80) || null, origem: "assistente", criado_por: c.userId }).select("id").single());
      let despesa = false;
      if (e.lancar_despesa && custo != null && e.tipo === "entrada" && c.vejoFinanceiro) {
        ok(await sb.from("lancamentos").insert({ petshop_id: petshop.id, tipo: "saida", valor: Math.round(custo * qtd * 100) / 100, forma: String(e.forma), categoria: "Produtos e material",
          descricao: `Compra: ${qtd} ${unidade} de ${nomeProd}`, data: hoje, pago: true, caixa_id: await caixaAbertoId(c), origem: "assistente", criado_por: c.userId }).select("id").single());
        despesa = true;
      }
      return { feito: true, produto_id: produtoId, despesa_lancada: despesa };
    }
  }
  throw new ErroDeUso(`Ferramenta desconhecida: ${nome}`);
}

/** Roda uma consulta e devolve o resultado (ou o erro, em texto que o modelo entende). */
export async function rodarConsulta(c: Contexto, nome: string, entrada: unknown) {
  try {
    const r = await consultar(c, nome, (entrada ?? {}) as Entrada);
    return { conteudo: JSON.stringify(r.resultado), erro: false, links: r.links };
  } catch (err) {
    return { conteudo: err instanceof ErroDeUso ? err.message : "Não consegui consultar agora.", erro: true };
  }
}

export const ehErroDeUso = (e: unknown): e is Error => e instanceof ErroDeUso;
