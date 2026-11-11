import type Anthropic from "@anthropic-ai/sdk";
import type { Banco } from "../supabase";
import type { Horario, Petshop, Profissional, Servico } from "../tipos";
import { horariosLivres } from "../agenda";
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

export const FERRAMENTAS: Def[] = [
  { grava: false, name: "buscar_pets", description: "Procura pets e tutores pelo nome do pet, nome do tutor ou telefone. Use sempre antes de marcar horário ou lançar algo para um pet, para pegar o id certo. Devolve também o último atendimento e os pacotes ativos.",
    input_schema: obj({ termo: { ...S, description: "Nome do pet, do tutor ou parte do telefone" } }, ["termo"]) },
  { grava: false, name: "ver_agenda", description: "Lista os horários marcados entre dois dias (inclusive), com pet, tutor, serviço, profissional, status e valor.",
    input_schema: obj({ de: DIA, ate: DIA }, ["de", "ate"]) },
  { grava: false, name: "horarios_livres", description: "Mostra os horários livres de um dia, dentro do funcionamento do pet shop, para um serviço. Use antes de sugerir horário ou quando o horário pedido estiver ocupado.",
    input_schema: obj({ dia: DIA, servico_id: S, profissional_id: S }, ["dia"]) },
  { grava: false, name: "clientes_sumidos", description: "Lista pets cujo último atendimento concluído foi há mais de N dias (ou que nunca vieram), com tutor e telefone.",
    input_schema: obj({ dias: { ...N, description: "Quantidade de dias sem vir, ex.: 30 ou 60" } }, ["dias"]) },
  { grava: false, name: "ver_estoque", description: "Lista produtos do estoque com saldo, mínimo e preço. Sem termo, mostra os que estão acabando primeiro.",
    input_schema: obj({ termo: S }) },
  { grava: false, financeiro: true, name: "resumo_financeiro", description: "Soma o dinheiro que entrou e saiu entre dois dias (inclusive), por categoria e por forma de pagamento, e informa se há caixa aberto.",
    input_schema: obj({ de: DIA, ate: DIA }, ["de", "ate"]) },
  { grava: false, financeiro: true, name: "contas_em_aberto", description: "Lista contas a pagar e a receber ainda não pagas, com vencimento.",
    input_schema: obj({}) },
  { grava: false, name: "preparar_mensagens", description: "Prepara mensagens de WhatsApp para tutores (lembrete de horário, convite para quem está sumido). Não envia nada: mostra botões para a pessoa abrir o WhatsApp e enviar. Escreva cada texto completo, simpático e curto, assinado com o nome do pet shop.",
    input_schema: obj({ mensagens: { type: "array", items: obj({ pet_id: S, texto: S }, ["pet_id", "texto"]) } }, ["mensagens"]) },

  { grava: true, name: "cadastrar_pet", description: "Cadastra um pet novo. Se o tutor já é cliente, passe cliente_id; senão, passe tutor_nome (e telefone, se a pessoa disse) e o tutor é criado junto.",
    input_schema: obj({ nome: S, cliente_id: S, tutor_nome: S, tutor_telefone: S, especie: { type: "string", enum: ["cao", "gato", "outro"] }, raca: S, porte: { type: "string", enum: ["P", "M", "G", "GG"] }, alertas: { ...S, description: "Cuidados: alergia, medo, comportamento" } }, ["nome"]) },
  { grava: true, name: "marcar_horario", description: "Marca um horário na agenda para um pet já cadastrado. O valor é sugerido pelo serviço e porte se você não passar.",
    input_schema: obj({ pet_id: S, servico_id: S, inicio: DIA_HORA, profissional_id: S, preco: N, obs: S, leva_traz: B }, ["pet_id", "servico_id", "inicio"]) },
  { grava: true, name: "alterar_horario", description: "Altera um horário existente: remarca (inicio), troca serviço ou profissional, muda o valor ou o status (confirmado, concluido, faltou, cancelado, marcado).",
    input_schema: obj({ agendamento_id: S, inicio: DIA_HORA, servico_id: S, profissional_id: S, preco: N, status: { type: "string", enum: ["marcado", "confirmado", "em_atendimento", "concluido", "faltou", "cancelado"] } }, ["agendamento_id"]) },
  { grava: true, financeiro: true, name: "lancar_dinheiro", description: "Registra dinheiro que já entrou ou saiu hoje (entra no caixa aberto). Para receber um atendimento, passe agendamento_id: ele fica como concluído.",
    input_schema: obj({ tipo: { type: "string", enum: ["entrada", "saida"] }, valor: N, forma: { type: "string", enum: ["pix", "dinheiro", "debito", "credito", "outro"] }, categoria: { ...S, description: "Entradas: Banho e tosa, Creche e hotel, Pacotes, Venda de produtos, Outros. Saídas: Produtos e insumos, Salários e comissões, Aluguel, Água, luz e internet, Impostos e taxas, Manutenção, Marketing, Outros" }, descricao: S, agendamento_id: S }, ["tipo", "valor", "forma", "categoria"]) },
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
      return { resultado: { horarios: ags.map((a) => ({
        agendamento_id: a.id, inicio: utcParaLocal(a.inicio, c.fusoMin), fim: utcParaLocal(a.fim, c.fusoMin).slice(11), status: a.status,
        pet: a.pets?.nome, tutor: a.pets?.clientes?.nome, servico: a.servicos?.nome, com: a.profissionais?.nome,
        ...(c.vejoFinanceiro ? { valor: a.preco } : {}), obs: a.obs, lembrete_enviado: Boolean(a.lembrete_em),
      })), total: ags.length } };
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
      const ocupados = ags.filter((a) => !["cancelado", "faltou"].includes(a.status) && (prof ? a.profissional_id === prof.id : quemAtende.length <= 1))
        .map((a) => ({ inicio: (new Date(a.inicio).getTime() - ini.getTime()) / 60000, fim: (new Date(a.fim).getTime() - ini.getTime()) / 60000 }));
      const aPartirDe = dia === hoje ? Number(c.agora.slice(11, 13)) * 60 + Number(c.agora.slice(14, 16)) : undefined;
      const livres = horariosLivres({ abre: func.abre, fecha: func.fecha, duracaoMin: servico?.duracao_min ?? 60, ocupados, aPartirDe });
      return { resultado: { dia, funcionamento: `${func.abre} às ${func.fecha}`, duracao_min: servico?.duracao_min ?? 60, livres, marcados: ags.filter((a) => !["cancelado", "faltou"].includes(a.status)).length } };
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
      exigir(RE_DIA_HORA.test(String(e.inicio)), "inicio no formato AAAA-MM-DDTHH:mm.");
      const inicio = String(e.inicio).slice(0, 16);
      const prof = e.profissional_id ? profPorId(c, e.profissional_id) : null;
      exigir(!e.profissional_id || prof, "profissional_id inválido.");
      const preco = numero(e.preco) ?? precoDoServico(servico, pet.porte);
      const linhas: [string, string][] = [["Pet", `${pet.nome}${pet.clientes?.nome ? ` (${pet.clientes.nome})` : ""}`], ["Serviço", servico.nome], ["Quando", quandoLocal(inicio)]];
      if (prof) linhas.push(["Com", prof.nome]);
      linhas.push(["Valor", preco != null ? brl(preco) : "a definir"]);
      if (e.leva_traz) linhas.push(["Leva e traz", "sim"]);
      if (texto(e.obs)) linhas.push(["Obs.", texto(e.obs, 300)]);
      const func = (c.petshop.horario as Horario | null)?.[String(diaSemanaLocal(inicio.slice(0, 10)))];
      if (!func) linhas.push(["Atenção", "o pet shop não abre nesse dia"]);
      else if (inicio.slice(11) < func.abre || inicio.slice(11) >= func.fecha) linhas.push(["Atenção", `fora do horário (${func.abre} às ${func.fecha})`]);
      if (prof) {
        const ini = localParaUtc(inicio, c.fusoMin), fim = new Date(ini.getTime() + servico.duracao_min * 60000);
        const { data: bate } = await c.sb.rpc("conflitos_agenda", { p_petshop: c.petshop.id, p_profissional: prof.id, p_inicio: ini.toISOString(), p_fim: fim.toISOString() });
        if (bate?.length) linhas.push(["Atenção", `${prof.nome.split(" ")[0]} já tem atendimento nesse horário`]);
      }
      return { titulo: "Marcar horário", linhas };
    }
    case "alterar_horario": {
      const id = uuid(e.agendamento_id);
      exigir(id, "agendamento_id inválido: use ver_agenda.");
      const { data: a } = await c.sb.from("agendamentos").select("inicio, status, pets(nome, clientes(nome)), servicos(nome)").eq("petshop_id", c.petshop.id).eq("id", id).maybeSingle();
      exigir(a, "Horário não encontrado: use ver_agenda.");
      const linhas: [string, string][] = [["Pet", `${a.pets?.nome ?? ""}${a.pets?.clientes?.nome ? ` (${a.pets.clientes.nome})` : ""}`], ["Hoje está", `${a.servicos?.nome ?? "atendimento"}, ${quandoLocal(utcParaLocal(a.inicio, c.fusoMin))}`]];
      if (e.inicio) { exigir(RE_DIA_HORA.test(String(e.inicio)), "inicio no formato AAAA-MM-DDTHH:mm."); linhas.push(["Novo horário", quandoLocal(String(e.inicio).slice(0, 16))]); }
      if (e.servico_id) { const s = servicoPorId(c, e.servico_id); exigir(s, "servico_id inválido."); linhas.push(["Novo serviço", s.nome]); }
      if (e.profissional_id) { const p = profPorId(c, e.profissional_id); exigir(p, "profissional_id inválido."); linhas.push(["Com", p.nome]); }
      if (numero(e.preco) != null) linhas.push(["Novo valor", brl(numero(e.preco))]);
      if (e.status) { exigir(STATUS[String(e.status)], "status inválido."); linhas.push(["Fica como", STATUS[String(e.status)]]); }
      exigir(linhas.length > 2, "Diga o que muda no horário.");
      return { titulo: e.status === "cancelado" ? "Cancelar horário" : e.inicio ? "Remarcar horário" : "Alterar horário", linhas };
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
      const ini = localParaUtc(String(e.inicio), c.fusoMin);
      const a = ok(await sb.from("agendamentos").insert({ petshop_id: petshop.id, pet_id: pet.id, servico_id: servico.id, profissional_id: uuid(e.profissional_id),
        inicio: ini.toISOString(), fim: new Date(ini.getTime() + servico.duracao_min * 60000).toISOString(), preco: numero(e.preco) ?? precoDoServico(servico, pet.porte),
        obs: texto(e.obs, 400) || null, leva_traz: Boolean(e.leva_traz), origem: "assistente", criado_por: c.userId }).select("id").single());
      return { feito: true, agendamento_id: a.id };
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
        ok(await sb.from("lancamentos").insert({ petshop_id: petshop.id, tipo: "saida", valor: Math.round(custo * qtd * 100) / 100, forma: String(e.forma), categoria: "Produtos e insumos",
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
