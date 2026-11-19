import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto, Resumo } from "./ferramentas";
import { COLS_PACOTE, comCustos, comPrecosDePacote, comPrecosDeProduto, lerPetshop, lerServicos } from "../reservado";
import { areaDoServico, categoriaDaArea, usaModulo, type AreaDoServico } from "../modulos";
import { corLivre } from "../cores";
import { veCusto } from "../acessos";
import { travaDePreco } from "../dinheiro-opcoes";
import { limparNome } from "../validacao";
import { montarNascimento, nascimentoPorExtenso } from "../aniversario";
import { ALMOCO_PADRAO, NOME_DIAS, ORDEM_DIAS, PADRAO, almocoDe, areaTemHorario, comAlmoco, erroDoHorario, erroDoHorarioProprio, horarioEmTexto, lerHorario, mesmoHorario, semAlmoco, type Almoco } from "../horario-loja";
import { brl, centavos, fmtTelefone, semAcento, telefoneLimpo, telefoneValido } from "../util";
import type { Horario } from "../tipos";
import { comPrecosPorte, resumoPorPorte, type PrecosPorte } from "../pacote-porte";

/**
 * Cadastros pelo Mozart ("cadastra a escovação a R$ 20", "o banho P e M fica 100", "muda o telefone da Joana"), cada um com o
 * cartão de sempre e as mesmas regras das telas:
 * - criar_servico / alterar_servico: Meu pet shop, Serviços e preços (nome, área, duração, preço por porte ou um só, custo do
 *   material, ativo). Só o dono (o banco confere: `servicos_criar`/`servicos_editar` pedem `sou_dono`).
 * - criar_produto / alterar_produto: Estoque, Produto novo e a ficha do produto. Quem tem a área Estoque. O custo só para quem vê
 *   o custo; com o preço travado, o preço de venda de um produto que já existe só muda com o dono ou quem cuida do financeiro
 *   (o banco confere de novo no gatilho `preco_do_produto_mudou`). Kit não muda unidade, custo, caixa nem validade por aqui.
 * - alterar_tutor: a ficha do tutor (Dados de …): nome, WhatsApp, e-mail, endereço, aniversário, observações e "não quer receber
 *   mensagens". E-mail e endereço só para quem tem a área Clientes e pets (igual à tela). Apagar e exportar (LGPD) ficam na tela.
 * - criar_pacote / alterar_pacote: Pacotes, Modelo de pacote (nome, serviço ou qualquer serviço, quantos usos, validade em dias,
 *   preço e preço por porte, à venda ou desativado). Quem tem a área Pacotes (o banco confere: `pacotes_criar`/`pacotes_editar`).
 * - alterar_funcionamento / alterar_diarias: Meu pet shop, Horário de funcionamento (do pet shop, da creche, do hotel ou o
 *   horário próprio de um serviço) e a diária da creche e do hotel. Só o dono (o banco confere: `petshops_editar`, `servicos_editar`).
 * Cada gravação lê de novo do banco (o cartão confirmado pode estar na mesma leva de outro que mudou a mesma coisa).
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean; soDono?: boolean };
type Entrada = Record<string, unknown>;
type Erro = (m: string) => Error;

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const uuid = (v: unknown) => (typeof v === "string" && RE_UUID.test(v) ? v : null);
const texto = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);
const tem = (e: Entrada, k: string) => e[k] !== undefined && e[k] !== null;
const S = { type: "string" }, N = { type: "number" }, B = { type: "boolean" };
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties, required, additionalProperties: false });

const PORTES = [["P", "preco_p"], ["M", "preco_m"], ["G", "preco_g"], ["GG", "preco_gg"]] as const;
type CampoPreco = (typeof PORTES)[number][1];
type Precos = Record<CampoPreco, number | null>;
const AREAS: AreaDoServico[] = ["banho_tosa", "creche", "hotel", "loja"];
const NOME_AREA: Record<AreaDoServico, string> = { banho_tosa: "Banho e tosa", creche: "Creche", hotel: "Hotel", loja: "Loja" };
export const UNIDADES = ["un", "kg", "g", "L", "ml", "pacote", "saco"];
const DIAS_PEDIDO: Record<string, string> = { domingo: "0", segunda: "1", terca: "2", quarta: "3", quinta: "4", sexta: "5", sabado: "6" };
const MAX_VALOR = 99999;

const PRECOS_DO_PEDIDO = {
  preco: { ...N, description: "Um preço só, para todos os portes. Não junte com os preços por porte." },
  preco_p: { ...N, description: "Preço do porte P (pequeno)" }, preco_m: { ...N, description: "Preço do porte M (médio)" },
  preco_g: { ...N, description: "Preço do porte G (grande)" }, preco_gg: { ...N, description: "Preço do porte GG (gigante)" },
};

export const FERRAMENTAS_CADASTROS: Def[] = [
  { grava: true, soDono: true, name: "criar_servico",
    description: "Cadastra um serviço novo na lista de Meu pet shop, Serviços e preços (banho, tosa, hidratação, corte de unha…), com a duração e o preço: um preço só (preco) ou por porte (preco_p, preco_m, preco_g, preco_gg; porte que não disserem fica sem preço). Antes, olhe a lista de serviços do contexto: se já existe um com esse nome, use alterar_servico. Creche e hotel não são serviço da agenda: a diária muda com alterar_diarias.",
    input_schema: obj({ nome: S, duracao_min: { ...N, description: "Quanto tempo leva, em minutos (5 a 1440). Se a pessoa não disse, pergunte." },
      area: { type: "string", enum: AREAS, description: "Padrão: banho_tosa. creche, hotel ou loja só para o que é cobrado à parte nessas áreas" },
      ...PRECOS_DO_PEDIDO, custo_material: { ...N, description: "Opcional: custo do material por atendimento (shampoo, perfume…)" } }, ["nome", "duracao_min"]) },
  { grava: true, soDono: true, name: "alterar_servico",
    description: "Muda um serviço que já existe (servico_id da lista de serviços do contexto): nome, área, duração, preço (um só para todos os portes em preco, ou só os portes que a pessoa disse em preco_p, preco_m, preco_g, preco_gg; os outros ficam como estão), custo do material, ou ativo (false tira da agenda sem apagar o histórico; true volta para a lista).",
    input_schema: obj({ servico_id: S, nome: S, duracao_min: N, area: { type: "string", enum: AREAS }, ...PRECOS_DO_PEDIDO, custo_material: N, ativo: B }, ["servico_id"]) },
  { grava: true, name: "criar_produto",
    description: "Cadastra um produto novo no Estoque (ração, shampoo, petisco…), sem mexer no saldo: para dizer quanto tem, depois use movimentar_estoque (entrada). Antes, use ver_estoque: se o produto já existe, use alterar_produto.",
    input_schema: obj({ nome: S, unidade: { type: "string", enum: UNIDADES, description: "Padrão: un" }, categoria: { ...S, description: "Ex.: Ração, Higiene, Petiscos" },
      preco_venda: N, custo: { ...N, description: "Quanto a loja paga por unidade" }, estoque_minimo: { ...N, description: "Abaixo disso aparece como acabando. Padrão: 0" },
      embalagem_qtd: { ...N, description: "Quantos vêm na caixa do fornecedor (opcional)" }, controla_validade: { ...B, description: "Cada entrada pede a validade" } }, ["nome"]) },
  { grava: true, name: "alterar_produto",
    description: "Muda um produto do Estoque (produto_id de ver_estoque): nome, categoria, unidade, preço de venda, custo, estoque mínimo, quantos vêm na caixa, se controla validade, ou tirar_da_lista (o produto some da lista e o histórico fica). Para mudar o saldo, é movimentar_estoque.",
    input_schema: obj({ produto_id: S, nome: S, unidade: { type: "string", enum: UNIDADES }, categoria: S, preco_venda: N, custo: N, estoque_minimo: N, embalagem_qtd: N, controla_validade: B,
      tirar_da_lista: { ...B, description: "true só quando a pessoa pediu para tirar o produto do estoque" } }, ["produto_id"]) },
  { grava: true, name: "alterar_tutor",
    description: "Muda os dados de um tutor (cliente_id de buscar_pets): nome, WhatsApp, e-mail, endereço, aniversário (DD/MM ou DD/MM/AAAA; \"\" tira), observações e se não quer receber mensagens. Nas observações, escreva só sobre o pet e o atendimento: nunca doença, religião ou outro dado íntimo de pessoas. Mudar o pet (nome, porte, raça) é na ficha do pet; apagar ou baixar os dados do tutor (LGPD) é com o dono, na ficha.",
    input_schema: obj({ cliente_id: S, nome: S, telefone: { ...S, description: "DDD e número; \"\" deixa em branco" }, email: S, endereco: S,
      aniversario: { ...S, description: "DD/MM ou DD/MM/AAAA; \"\" tira o aniversário" },
      obs: { ...S, description: "Texto das observações" }, obs_jeito: { type: "string", enum: ["acrescentar", "trocar"], description: "acrescentar (padrão): entra no fim do que já estava; trocar: o texto novo fica no lugar" },
      nao_quer_mensagens: B }, ["cliente_id"]) },
  { grava: true, name: "criar_pacote",
    description: "Cria um modelo de pacote para vender (\"4 banhos por R$ 180, vale 30 dias\"), igual a Pacotes, Modelo novo: nome, o serviço (servico_id da lista do contexto; sem ele, vale para qualquer serviço), quantos usos, validade em dias (padrão 30) e o preço. Preço por porte é opcional (preco_p, preco_m, preco_g, preco_gg): na venda vale o do porte do pet, e preco fica para pet sem porte na ficha. Antes, olhe ver_pacotes: se o modelo já existe, use alterar_pacote. Para vender a um pet, depois, é vender_pacote.",
    input_schema: obj({ nome: S, servico_id: { ...S, description: "Opcional: o serviço do pacote" }, quantidade: { ...N, description: "Quantos usos (1 ou mais)" }, validade_dias: { ...N, description: "Vale por quantos dias depois da venda. Padrão: 30" },
      preco: { ...N, description: "Preço do pacote (para pet sem porte, se houver preço por porte)" }, preco_p: N, preco_m: N, preco_g: N, preco_gg: N }, ["nome", "quantidade", "preco"]) },
  { grava: true, name: "alterar_pacote",
    description: "Muda um modelo de pacote (pacote_id de ver_pacotes): nome, serviço (servico_id; \"\" = qualquer serviço), quantidade de usos, validade em dias, preço, preço por porte (só os portes ditos; sem_preco_por_porte: true tira todos) ou ativo (false tira da venda; quem já comprou continua com o pacote; true volta para a venda).",
    input_schema: obj({ pacote_id: S, nome: S, servico_id: S, quantidade: N, validade_dias: N, preco: N, preco_p: N, preco_m: N, preco_g: N, preco_gg: N, sem_preco_por_porte: B, ativo: B }, ["pacote_id"]) },
  { grava: true, soDono: true, name: "alterar_funcionamento",
    description: "Muda um horário de Meu pet shop. alvo: pet_shop (o padrão: Horário de funcionamento), creche ou hotel (a janela de chegada e de busca de cada dia) ou servico (o horário próprio de um serviço da agenda, com servico_id). Cada um pode ter o seu horário (ex.: o pet shop fecha no domingo e a creche abre). Creche, hotel e serviço sem horário próprio seguem o do pet shop; igual_ao_pet_shop: true volta a seguir. Em dias, passe só os dias que mudam: abre e fecha (HH:mm) ou fechado: true. O almoço é só do pet shop e vale para todos os dias abertos: almoco_de e almoco_ate, ou sem_almoco: true. Creche e hotel juntos: duas chamadas na mesma resposta (um cartão para cada, confirmados juntos). Feriado ou folga de um dia só não é aqui: é bloquear_horario.",
    input_schema: obj({ alvo: { type: "string", enum: ["pet_shop", "creche", "hotel", "servico"], description: "De quem é o horário. Padrão: pet_shop" },
      servico_id: { ...S, description: "Com alvo servico: o id do serviço (da lista do contexto)" },
      igual_ao_pet_shop: { ...B, description: "Creche, hotel ou serviço: volta a seguir o horário do pet shop" },
      dias: { type: "array", items: obj({ dia: { type: "string", enum: Object.keys(DIAS_PEDIDO) }, abre: { type: "string", description: "HH:mm" }, fecha: { type: "string", description: "HH:mm" }, fechado: B }, ["dia"]) },
      almoco_de: { type: "string", description: "HH:mm" }, almoco_ate: { type: "string", description: "HH:mm" }, sem_almoco: B }) },
  { grava: true, soDono: true, name: "alterar_diarias",
    description: "Muda o valor da diária da creche (por dia) e/ou do hotel (por noite) em Meu pet shop. Preço do hotel por porte, por temporada ou de feriado fica na tela (Meu pet shop, Hotel).",
    input_schema: obj({ creche: { ...N, description: "Diária da creche, por dia" }, hotel: { ...N, description: "Diária do hotel, por noite" } }) },
];

/* ---------- serviços ---------- */

type ServicoLido = { id: string; nome: string; categoria: string; duracao_min: number; cor: string; ordem: number; ativo: boolean } & Precos;

async function servicosDoBanco(c: Contexto, erro: Erro): Promise<ServicoLido[]> {
  const r = await lerServicos(c.sb, c.petshop.id);
  if (r.error) throw erro("Não consegui ler a lista de serviços agora.");
  return (r.data ?? []) as unknown as ServicoLido[];
}
/** Um valor de dinheiro do pedido: null = não veio; erro se não é um valor que a tela aceitaria. */
function valorDoPedido(e: Entrada, k: string, rotulo: string, erro: Erro): number | null {
  if (!tem(e, k)) return null;
  const v = numero(e[k]);
  if (v == null || v < 0 || v > MAX_VALOR) throw erro(`${rotulo}: use um valor entre R$ 0 e R$ 99.999.`);
  return centavos(v);
}
/** Os preços que o pedido traz: todos iguais (preco) ou só os portes ditos. Erro se misturar os dois. */
export function precosDoPedido(e: Entrada, erro: Erro): Partial<Precos> {
  const um = valorDoPedido(e, "preco", "Preço", erro);
  const porPorte: Partial<Precos> = {};
  for (const [porte, campo] of PORTES) { const v = valorDoPedido(e, campo, `Preço do porte ${porte}`, erro); if (v != null) porPorte[campo] = v; }
  if (um != null && Object.keys(porPorte).length) throw erro("Passe um preço só (preco) ou os preços por porte, não os dois.");
  return um != null ? { preco_p: um, preco_m: um, preco_g: um, preco_gg: um } : porPorte;
}
/** "P R$ 100,00 · M R$ 100,00 · G R$ 130,00 · GG R$ 130,00", ou "R$ 30,00 (todos os portes)". */
export function precosEmTexto(p: Partial<Precos>): string {
  const v = PORTES.map(([, c]) => p[c] ?? null);
  if (v.every((x) => x == null)) return "sem preço";
  if (v.every((x) => x === v[0])) return `${brl(v[0])} (todos os portes)`;
  return PORTES.map(([porte, c]) => `${porte} ${p[c] == null ? "sem preço" : brl(p[c])}`).join(" · ");
}
const duracaoEmTexto = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}`);
function duracaoDoPedido(e: Entrada, erro: Erro): number | null {
  if (!tem(e, "duracao_min")) return null;
  const v = numero(e.duracao_min);
  if (v == null || !Number.isInteger(v) || v < 5 || v > 1440) throw erro("A duração fica entre 5 minutos e 24 horas, em minutos inteiros (ex.: 60).");
  return v;
}
function areaDoPedido(c: Contexto, e: Entrada, erro: Erro): AreaDoServico | null {
  if (!tem(e, "area")) return null;
  const a = String(e.area) as AreaDoServico;
  if (!AREAS.includes(a)) throw erro("area deve ser banho_tosa, creche, hotel ou loja.");
  if (!usaModulo(c.petshop, a)) throw erro(`Este pet shop não usa ${NOME_AREA[a]}. Diga isso; dá para ligar em Meu pet shop, O que vocês fazem.`);
  return a;
}
const mesmoNome = (a: string, b: string) => semAcento(a) === semAcento(b);

type PlanoServico = { resumo: Resumo; campos: Record<string, unknown>; servico?: ServicoLido };

async function planoDoServico(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<PlanoServico> {
  const lista = await servicosDoBanco(c, erro);
  const precos = precosDoPedido(e, erro);
  const duracao = duracaoDoPedido(e, erro);
  const area = areaDoPedido(c, e, erro);
  const custo = valorDoPedido(e, "custo_material", "Custo do material", erro);
  const novoNome = tem(e, "nome") ? limparNome(texto(e.nome, 200)) : "";
  if (tem(e, "nome") && (!novoNome || novoNome.length > 80)) throw erro("O nome do serviço precisa ter de 1 a 80 letras.");

  if (nome === "criar_servico") {
    if (!novoNome) throw erro("Falta o nome do serviço.");
    if (duracao == null) throw erro("Falta quanto tempo o serviço leva (em minutos). Pergunte.");
    const igual = lista.find((s) => mesmoNome(s.nome, novoNome));
    if (igual) throw erro(igual.ativo
      ? `Já existe o serviço ${igual.nome} (servico_id ${igual.id}). Para mudar o preço ou a duração dele, use alterar_servico.`
      : `Já existe o serviço ${igual.nome}, desativado (servico_id ${igual.id}). Para trazer de volta, use alterar_servico com ativo: true.`);
    const a = area ?? (usaModulo(c.petshop, "banho_tosa") ? "banho_tosa" : AREAS.find((x) => usaModulo(c.petshop, x)) ?? "banho_tosa");
    const todos: Precos = { preco_p: precos.preco_p ?? null, preco_m: precos.preco_m ?? null, preco_g: precos.preco_g ?? null, preco_gg: precos.preco_gg ?? null };
    const linhas: [string, string][] = [["Serviço", `${novoNome} (novo)`], ["Duração", duracaoEmTexto(duracao)], ["Preço", precosEmTexto(todos)]];
    if (a !== "banho_tosa" || AREAS.filter((x) => usaModulo(c.petshop, x)).length > 1) linhas.push(["Área", NOME_AREA[a]]);
    if (custo != null) linhas.push(["Custo do material", brl(custo)]);
    const ordem = lista.reduce((m, s) => Math.max(m, s.ordem ?? 0), 0) + 1;
    const cor = corLivre(lista.filter((s) => s.ativo).map((s) => s.cor));
    return { resumo: { titulo: "Cadastrar serviço", linhas }, campos: { nome: novoNome, categoria: categoriaDaArea(a), duracao_min: duracao, cor, ordem, ativo: true, ...todos, ...(custo != null ? { custo_material: custo } : {}) } };
  }

  const id = uuid(e.servico_id);
  const s = id ? lista.find((x) => x.id === id) : null;
  if (!s) throw erro("servico_id inválido: use o id da lista de serviços do contexto.");
  if (novoNome && novoNome !== s.nome) {
    const outro = lista.find((x) => x.id !== s.id && mesmoNome(x.nome, novoNome));
    if (outro) throw erro(`Já existe outro serviço chamado ${outro.nome}. Escolha outro nome.`);
  }
  const campos: Record<string, unknown> = {};
  const linhas: [string, string][] = [["Serviço", s.nome]];
  if (novoNome && novoNome !== s.nome) { campos.nome = novoNome; linhas.push(["Nome", `${s.nome} → ${novoNome}`]); }
  if (duracao != null && duracao !== s.duracao_min) { campos.duracao_min = duracao; linhas.push(["Duração", `${duracaoEmTexto(s.duracao_min)} → ${duracaoEmTexto(duracao)}`]); }
  if (area && area !== areaDoServico(s.categoria)) { campos.categoria = categoriaDaArea(area, s.categoria); linhas.push(["Área", `${NOME_AREA[areaDoServico(s.categoria)]} → ${NOME_AREA[area]}`]); }
  const antes: Precos = { preco_p: s.preco_p == null ? null : Number(s.preco_p), preco_m: s.preco_m == null ? null : Number(s.preco_m), preco_g: s.preco_g == null ? null : Number(s.preco_g), preco_gg: s.preco_gg == null ? null : Number(s.preco_gg) };
  const depois: Precos = { ...antes, ...precos };
  if (PORTES.some(([, k]) => depois[k] !== antes[k])) {
    for (const [, k] of PORTES) if (depois[k] !== antes[k]) campos[k] = depois[k];
    linhas.push(["Preço antes", precosEmTexto(antes)], ["Preço fica", precosEmTexto(depois)]);
  }
  if (custo != null) { campos.custo_material = custo; linhas.push(["Custo do material", brl(custo)]); }
  if (typeof e.ativo === "boolean" && e.ativo !== s.ativo) {
    campos.ativo = e.ativo;
    linhas.push(["Situação", e.ativo ? "volta para a lista e para a agenda" : "sai da lista e da agenda (o histórico fica)"]);
  }
  if (!Object.keys(campos).length) throw erro(`Nada para mudar: ${s.nome} já está assim. Diga isso à pessoa.`);
  return { resumo: { titulo: e.ativo === false ? "Desativar serviço" : "Mudar serviço", linhas }, campos, servico: s };
}

/** Antes da migração 20261179, o banco não conhece a categoria 'loja': entra como 'outro' (igual à tela). */
const semLoja = (m: string | undefined) => /servicos_categoria_check/.test(m ?? "");

/* ---------- produtos ---------- */

type ProdutoLido = { id: string; nome: string; categoria: string | null; unidade: string; estoque: number; estoque_minimo: number; embalagem_qtd: number | null; tipo: string; controla_validade: boolean; ativo: boolean; preco_venda: number | null; custo: number | null };
const qtd = (v: number | null | undefined) => String(Number(v ?? 0)).replace(".", ",");

function quantidadeDoPedido(e: Entrada, k: string, rotulo: string, erro: Erro, minimo = 0): number | null {
  if (!tem(e, k)) return null;
  const v = numero(e[k]);
  if (v == null || v < minimo || v > 100000 || (minimo > 0 && v === 0)) throw erro(`${rotulo}: use só números${minimo > 0 ? ", maior que zero" : ""}.`);
  return Math.round(v * 1000) / 1000;
}

async function planoDoProduto(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<{ resumo: Resumo; campos: Record<string, unknown>; produto?: ProdutoLido }> {
  const vejoCusto = veCusto(c.eu);
  if (tem(e, "custo") && !vejoCusto) throw erro("Com o acesso desta pessoa o custo dos produtos não aparece: deixe o custo de fora e diga que o custo é com o dono.");
  const preco = valorDoPedido(e, "preco_venda", "Preço de venda", erro);
  const custo = valorDoPedido(e, "custo", "Custo", erro);
  const minimo = quantidadeDoPedido(e, "estoque_minimo", "Estoque mínimo", erro);
  const caixa = quantidadeDoPedido(e, "embalagem_qtd", "Quantos vêm na caixa", erro, 1e-9);
  if (tem(e, "unidade") && !UNIDADES.includes(String(e.unidade))) throw erro(`unidade deve ser uma destas: ${UNIDADES.join(", ")}.`);
  const unidade = tem(e, "unidade") ? String(e.unidade) : null;
  const novoNome = tem(e, "nome") ? limparNome(texto(e.nome, 300)) : "";
  if (tem(e, "nome") && (!novoNome || novoNome.length > 120)) throw erro("O nome do produto precisa ter de 1 a 120 letras.");
  const categoria = tem(e, "categoria") ? texto(e.categoria, 60) : null;
  const ativos = async () => (await c.sb.from("produtos").select("id, nome").eq("petshop_id", c.petshop.id).eq("ativo", true).limit(5000)).data ?? [];

  if (nome === "criar_produto") {
    if (!novoNome) throw erro("Falta o nome do produto.");
    const igual = (await ativos()).find((p) => mesmoNome(p.nome, novoNome));
    if (igual) throw erro(`Já existe o produto ${igual.nome} (produto_id ${igual.id}). Para mudar preço ou mínimo, use alterar_produto; para dar entrada, movimentar_estoque.`);
    const u = unidade ?? "un";
    const linhas: [string, string][] = [["Produto", `${novoNome} (novo no estoque)`], ["Unidade", u]];
    if (categoria) linhas.push(["Categoria", categoria]);
    linhas.push(["Preço de venda", preco != null ? `${brl(preco)} por ${u}` : "sem preço"]);
    if (custo != null) linhas.push(["Custo", `${brl(custo)} por ${u}`]);
    if (minimo) linhas.push(["Estoque mínimo", `${qtd(minimo)} ${u}`]);
    if (caixa) linhas.push(["Vem em caixa de", `${qtd(caixa)} ${u}`]);
    if (e.controla_validade === true) linhas.push(["Validade", "cada entrada pede a validade"]);
    linhas.push(["Saldo", `0 ${u} (para dizer quanto tem, dê entrada depois)`]);
    return { resumo: { titulo: "Cadastrar produto", linhas }, campos: {
      nome: novoNome, categoria: categoria || null, unidade: u, preco_venda: preco, custo: vejoCusto ? custo : null, estoque_minimo: minimo ?? 0,
      embalagem_qtd: caixa, tipo: "produto", controla_validade: e.controla_validade === true } };
  }

  const id = uuid(e.produto_id);
  if (!id) throw erro("produto_id inválido: use ver_estoque.");
  const r = await c.sb.from("produtos").select("id, nome, categoria, unidade, estoque, estoque_minimo, embalagem_qtd, tipo, controla_validade, ativo").eq("petshop_id", c.petshop.id).eq("id", id).maybeSingle();
  if (!r.data || !r.data.ativo) throw erro("Produto não encontrado no estoque: use ver_estoque.");
  const comPreco = await comPrecosDeProduto(c.sb, c.petshop.id, [r.data]);
  const p = (vejoCusto ? (await comCustos(c.sb, c.petshop.id, comPreco))[0] : { ...comPreco[0], custo: null }) as unknown as ProdutoLido;
  const kit = p.tipo === "kit";
  if (kit && (unidade || custo != null || caixa != null || typeof e.controla_validade === "boolean")) throw erro("Kit não tem unidade, custo, caixa nem validade próprios (vêm dos produtos do kit). Isso muda na ficha do kit, no Estoque.");
  const campos: Record<string, unknown> = {};
  const linhas: [string, string][] = [["Produto", p.nome]];
  if (e.tirar_da_lista === true) {
    return { resumo: { titulo: "Tirar produto do estoque", linhas: [...linhas, ["O que acontece", "o produto some da lista; o histórico dele fica guardado"]] }, campos: { ativo: false }, produto: p };
  }
  if (novoNome && novoNome !== p.nome) {
    const outro = (await ativos()).find((x) => x.id !== p.id && mesmoNome(x.nome, novoNome));
    if (outro) throw erro(`Já existe outro produto chamado ${outro.nome}. Escolha outro nome.`);
    campos.nome = novoNome; linhas.push(["Nome", `${p.nome} → ${novoNome}`]);
  }
  if (categoria != null && categoria !== (p.categoria ?? "")) { campos.categoria = categoria || null; linhas.push(["Categoria", categoria || "sem categoria"]); }
  if (unidade && unidade !== p.unidade) { campos.unidade = unidade; linhas.push(["Unidade", `${p.unidade} → ${unidade}`]); }
  const u = unidade ?? p.unidade;
  if (preco != null && preco !== (p.preco_venda == null ? null : Number(p.preco_venda))) {
    // a mesma regra da ficha do produto: com o preço travado, só o dono ou quem cuida do financeiro muda o preço de venda
    if (travaDePreco(c.petshop).ligada && !c.cuidoDoFinanceiro) throw erro("Com o preço travado, só o dono ou quem cuida do financeiro muda o preço de venda. Diga isso. Nada foi mudado.");
    campos.preco_venda = preco;
    linhas.push(["Preço de venda", p.preco_venda == null ? `${brl(preco)} por ${u}` : `${brl(p.preco_venda)} → ${brl(preco)} por ${u}`]);
    if (p.preco_venda != null) linhas.push(["Fica anotado", "a mudança de preço fica anotada com o seu nome, para o dono ver"]);
  }
  if (custo != null && custo !== (p.custo == null ? null : Number(p.custo))) { campos.custo = custo; linhas.push(["Custo", p.custo == null ? brl(custo) : `${brl(p.custo)} → ${brl(custo)}`]); }
  if (minimo != null && minimo !== Number(p.estoque_minimo)) { campos.estoque_minimo = minimo; linhas.push(["Estoque mínimo", `${qtd(p.estoque_minimo)} → ${qtd(minimo)} ${u}`]); }
  if (caixa != null && caixa !== (p.embalagem_qtd == null ? null : Number(p.embalagem_qtd))) { campos.embalagem_qtd = caixa; linhas.push(["Vem em caixa de", `${qtd(caixa)} ${u}`]); }
  if (typeof e.controla_validade === "boolean" && e.controla_validade !== p.controla_validade) { campos.controla_validade = e.controla_validade; linhas.push(["Validade", e.controla_validade ? "passa a pedir a validade em cada entrada" : "deixa de pedir a validade"]); }
  if (!Object.keys(campos).length) throw erro(`Nada para mudar: ${p.nome} já está assim. Diga isso à pessoa.`);
  return { resumo: { titulo: "Mudar produto", linhas }, campos, produto: p };
}

/* ---------- tutor ---------- */

type TutorLido = { id: string; nome: string; telefone: string | null; email?: string | null; endereco?: string | null; obs: string | null; nascimento: string | null; nao_quer_mensagens: boolean };
const vejoContato = (c: Contexto) => !Array.isArray(c.areas) || c.areas.includes("clientes");
const LIMITE_OBS = 600;

/** Aniversário falado ("14/03", "14/03/1980"); "" tira. undefined = não veio. */
export function aniversarioDoPedido(v: unknown, erro: Erro, hoje = new Date()): string | null | undefined {
  if (v === undefined || v === null) return undefined;
  const t = String(v).trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(t);
  if (!m) throw erro("aniversario no formato DD/MM ou DD/MM/AAAA.");
  const r = montarNascimento(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : null, hoje);
  if (r.erro) throw erro(r.erro);
  return r.valor;
}

async function planoDoTutor(c: Contexto, e: Entrada, erro: Erro): Promise<{ resumo: Resumo; campos: Record<string, unknown>; antes: TutorLido }> {
  const id = uuid(e.cliente_id);
  if (!id) throw erro("cliente_id inválido: use buscar_pets para achar o tutor.");
  const contato = vejoContato(c);
  if ((tem(e, "email") || tem(e, "endereco")) && !contato) throw erro("Com o acesso desta pessoa o e-mail e o endereço do tutor não aparecem: é com quem tem a área Clientes e pets. Nada foi mudado.");
  const r = await c.sb.from("clientes").select(contato ? "id, nome, telefone, email, endereco, obs, nascimento, nao_quer_mensagens" : "id, nome, telefone, obs, nascimento, nao_quer_mensagens").eq("petshop_id", c.petshop.id).eq("id", id).maybeSingle();
  const t = r.data as unknown as TutorLido | null;
  if (!t) throw erro("Tutor não encontrado: use buscar_pets.");
  const campos: Record<string, unknown> = {};
  const linhas: [string, string][] = [["Tutor", t.nome]];
  if (tem(e, "nome")) {
    const n = limparNome(texto(e.nome, 300));
    if (!n || n.length > 120) throw erro("O nome do tutor precisa ter de 1 a 120 letras.");
    if (n !== t.nome) { campos.nome = n; linhas.push(["Nome", `${t.nome} → ${n}`]); }
  }
  if (tem(e, "telefone")) {
    const bruto = texto(e.telefone, 40);
    if (!telefoneValido(bruto)) throw erro("Confira o WhatsApp: DDD e número (10 ou 11 algarismos). Pergunte de novo.");
    const novo = telefoneLimpo(bruto) || null;
    if (novo !== (t.telefone ? telefoneLimpo(t.telefone) : null)) {
      campos.telefone = novo;
      linhas.push(["WhatsApp", novo ? `${t.telefone ? `${fmtTelefone(t.telefone)} → ` : ""}${fmtTelefone(novo)}` : "fica em branco"]);
      if (novo) {
        // igual à tela: o número já é de outro tutor? Pode ser a mesma pessoa (juntar na ficha) ou um número dividido
        const outros = (await c.sb.from("clientes").select("id, nome, telefone").eq("petshop_id", c.petshop.id).neq("id", t.id).ilike("telefone", `%${novo.slice(-8)}%`).limit(20)).data ?? [];
        const dono = outros.find((o) => telefoneLimpo(o.telefone) === novo);
        if (dono) linhas.push(["Atenção", `${dono.nome} já tem esse número. Se são a mesma pessoa, depois toque em Juntar com outro tutor, na ficha.`]);
      }
    }
  }
  if (tem(e, "email")) {
    const v = texto(e.email, 200);
    if (v && (v.length > 160 || !RE_EMAIL.test(v))) throw erro("Confira o e-mail.");
    if ((v || null) !== (t.email ?? null)) { campos.email = v || null; linhas.push(["E-mail", v || "fica em branco"]); }
  }
  if (tem(e, "endereco")) {
    const v = texto(e.endereco, 300).replace(/[<>]/g, "");
    if (v.length > 200) throw erro("O endereço passa de 200 letras: resuma.");
    if ((v || null) !== (t.endereco ?? null)) { campos.endereco = v || null; linhas.push(["Endereço", v || "fica em branco"]); }
  }
  const niver = aniversarioDoPedido(e.aniversario, erro, new Date(`${c.agora.slice(0, 10)}T12:00:00Z`));
  if (niver !== undefined && niver !== (t.nascimento ?? null)) { campos.nascimento = niver; linhas.push(["Aniversário", niver ? nascimentoPorExtenso(niver) ?? niver : "tira o aniversário"]); }
  if (tem(e, "obs")) {
    const novo = texto(e.obs, LIMITE_OBS + 1).replace(/\s+/g, " ");
    const trocar = e.obs_jeito === "trocar";
    const antes = (t.obs ?? "").trim();
    if (!trocar && !novo) throw erro("Falta o que anotar nas observações.");
    if (!trocar && semAcento(antes).includes(semAcento(novo))) throw erro("Isso já está nas observações do tutor. Nada para fazer.");
    const fica = trocar ? novo : antes ? `${antes}${/[.!?]$/.test(antes) ? "" : "."} ${novo}` : novo;
    if (fica.length > LIMITE_OBS) throw erro(`Não cabe nas observações (limite de ${LIMITE_OBS} letras). Diga para a pessoa resumir o que já está na ficha.`);
    if (fica !== antes) {
      campos.obs = fica || null;
      linhas.push([trocar ? "Observações" : "Anotar", trocar ? (fica || "ficam em branco") : novo]);
      if (!trocar && antes) linhas.push(["Fica assim", fica]);
    }
  }
  if (typeof e.nao_quer_mensagens === "boolean" && e.nao_quer_mensagens !== Boolean(t.nao_quer_mensagens)) {
    campos.nao_quer_mensagens = e.nao_quer_mensagens;
    linhas.push(["Mensagens", e.nao_quer_mensagens ? "não quer receber (o Mandar mensagens pula este tutor)" : "volta a receber"]);
  }
  if (!Object.keys(campos).length) throw erro(`Nada para mudar: os dados de ${t.nome} já estão assim. Diga isso à pessoa.`);
  return { resumo: { titulo: `Mudar dados de ${t.nome}`, linhas }, campos, antes: t };
}

/* ---------- modelos de pacote ---------- */

type PacoteLido = { id: string; nome: string; servico_id: string | null; quantidade: number; validade_dias: number; ativo: boolean; preco: number; precos_porte: PrecosPorte | null };
function inteiroDoPedido(e: Entrada, k: string, rotulo: string, erro: Erro, max: number): number | null {
  if (!tem(e, k)) return null;
  const v = numero(e[k]);
  if (v == null || !Number.isInteger(v) || v < 1 || v > max) throw erro(`${rotulo} precisa ser um número inteiro de 1 a ${max}.`);
  return v;
}
/** Os preços por porte do pedido ({ P: 160, G: 200 }); vazio quando não veio nenhum. */
function portesDoPedido(e: Entrada, erro: Erro): PrecosPorte {
  const out: PrecosPorte = {};
  for (const [porte, campo] of PORTES) { const v = valorDoPedido(e, campo, `Preço do porte ${porte}`, erro); if (v != null) out[porte] = v; }
  return out;
}
const precoDoPacoteEmTexto = (preco: number, porte: PrecosPorte | null) => (porte && Object.keys(porte).length ? `${resumoPorPorte(porte, brl)} · sem porte na ficha ${brl(preco)}` : brl(preco));

async function planoDoPacote(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<{ resumo: Resumo; campos: Record<string, unknown>; pacote?: PacoteLido }> {
  const quantidade = inteiroDoPedido(e, "quantidade", "A quantidade de usos", erro, 999);
  const validade = inteiroDoPedido(e, "validade_dias", "A validade (em dias)", erro, 3650);
  const preco = valorDoPedido(e, "preco", "Preço", erro);
  const portes = portesDoPedido(e, erro);
  const novoNome = tem(e, "nome") ? limparNome(texto(e.nome, 200)) : "";
  if (tem(e, "nome") && (!novoNome || novoNome.length > 80)) throw erro("O nome do pacote precisa ter de 1 a 80 letras.");
  let servico: { id: string; nome: string } | null | undefined;
  if (tem(e, "servico_id")) {
    const id = String(e.servico_id).trim();
    if (!id) servico = null;
    else {
      servico = c.servicos.find((s) => s.id === uuid(id)) ?? null;
      if (!servico) throw erro("servico_id inválido: use o id da lista de serviços do contexto (ou deixe sem, para qualquer serviço).");
    }
  }
  const modelos = (await c.sb.from("pacotes").select(COLS_PACOTE).eq("petshop_id", c.petshop.id).limit(500)).data ?? [];
  if (nome === "criar_pacote") {
    if (!novoNome) throw erro("Falta o nome do pacote.");
    if (quantidade == null) throw erro("Falta quantos usos o pacote tem. Pergunte.");
    if (preco == null) throw erro("Falta o preço do pacote. Pergunte.");
    const igual = modelos.find((m) => mesmoNome(m.nome, novoNome));
    if (igual) throw erro(`Já existe o modelo ${igual.nome} (pacote_id ${igual.id}). Para mudar, use alterar_pacote.`);
    const v = validade ?? 30;
    const porte = Object.keys(portes).length ? portes : null;
    const linhas: [string, string][] = [["Pacote", `${novoNome} (novo)`], ["Serviço", servico?.nome ?? "qualquer serviço"], ["Usos", String(quantidade)], ["Vale", `${v} dias depois da venda`], ["Preço", precoDoPacoteEmTexto(preco, porte)]];
    return { resumo: { titulo: "Criar modelo de pacote", linhas }, campos: { nome: novoNome, servico_id: servico?.id ?? null, quantidade, validade_dias: v, preco, precos_porte: porte } };
  }
  const id = uuid(e.pacote_id);
  const base = id ? modelos.find((m) => m.id === id) : null;
  if (!base) throw erro("pacote_id inválido: use ver_pacotes.");
  const [comPreco] = await comPrecosDePacote(c.sb, c.petshop.id, [base]);
  const [m] = (await comPrecosPorte(c.sb, c.petshop.id, [comPreco])) as unknown as PacoteLido[];
  const campos: Record<string, unknown> = {};
  const linhas: [string, string][] = [["Pacote", m.nome]];
  if (novoNome && novoNome !== m.nome) {
    if (modelos.some((x) => x.id !== m.id && mesmoNome(x.nome, novoNome))) throw erro("Já existe outro modelo com esse nome. Escolha outro.");
    campos.nome = novoNome; linhas.push(["Nome", `${m.nome} → ${novoNome}`]);
  }
  if (servico !== undefined && (servico?.id ?? null) !== m.servico_id) { campos.servico_id = servico?.id ?? null; linhas.push(["Serviço", servico?.nome ?? "qualquer serviço"]); }
  if (quantidade != null && quantidade !== m.quantidade) { campos.quantidade = quantidade; linhas.push(["Usos", `${m.quantidade} → ${quantidade}`]); }
  if (validade != null && validade !== m.validade_dias) { campos.validade_dias = validade; linhas.push(["Vale", `${m.validade_dias} → ${validade} dias depois da venda`]); }
  const precoNovo = preco ?? Number(m.preco);
  const porteNovo: PrecosPorte | null = e.sem_preco_por_porte === true ? null : Object.keys(portes).length ? { ...(m.precos_porte ?? {}), ...portes } : m.precos_porte;
  if (precoNovo !== Number(m.preco) || JSON.stringify(porteNovo ?? null) !== JSON.stringify(m.precos_porte ?? null)) {
    if (precoNovo !== Number(m.preco)) campos.preco = precoNovo;
    if (JSON.stringify(porteNovo ?? null) !== JSON.stringify(m.precos_porte ?? null)) campos.precos_porte = porteNovo && Object.keys(porteNovo).length ? porteNovo : null;
    linhas.push(["Preço antes", precoDoPacoteEmTexto(Number(m.preco), m.precos_porte)], ["Preço fica", precoDoPacoteEmTexto(precoNovo, porteNovo)]);
  }
  if (typeof e.ativo === "boolean" && e.ativo !== m.ativo) { campos.ativo = e.ativo; linhas.push(["Venda", e.ativo ? "volta para a venda" : "sai da venda (quem já comprou continua com o pacote)"]); }
  if (!Object.keys(campos).length) throw erro(`Nada para mudar: ${m.nome} já está assim. Diga isso à pessoa.`);
  if (Object.keys(campos).some((k) => k !== "ativo")) linhas.push(["Quem já comprou", "continua com o pacote como comprou"]);
  return { resumo: { titulo: e.ativo === false ? "Tirar pacote da venda" : "Mudar modelo de pacote", linhas }, campos, pacote: m };
}

/* ---------- horário de funcionamento e diárias ---------- */

const horaBonita = (h: string) => (h.endsWith(":00") ? `${Number(h.slice(0, 2))}h` : `${Number(h.slice(0, 2))}h${h.slice(3, 5)}`);
const diaEmTexto = (v: Horario[string]) => (v ? `${horaBonita(v.abre)} às ${horaBonita(v.fecha)}` : "fechado");

/** O horário novo a partir do de agora e do pedido. Erro se algum dia ou o almoço não fecha (a mesma conferência da tela). */
export function horarioDoPedido(atual: Horario, e: Entrada, erro: Erro): { novo: Horario; mudou: [string, string][] } {
  const h: Horario = { ...lerHorario(atual) };
  const dias = Array.isArray(e.dias) ? (e.dias as Entrada[]) : [];
  for (const d of dias) {
    const chave = DIAS_PEDIDO[semAcento(String(d?.dia ?? ""))];
    if (!chave) throw erro("dia deve ser segunda, terca, quarta, quinta, sexta, sabado ou domingo.");
    if (d.fechado === true) { h[chave] = null; continue; }
    for (const k of ["abre", "fecha"] as const) if (tem(d, k) && !RE_HORA.test(String(d[k]))) throw erro(`${k} no formato HH:mm (ex.: 08:00).`);
    const antes = h[chave];
    if (!antes && (!tem(d, "abre") || !tem(d, "fecha"))) throw erro(`Para abrir ${NOME_DIAS[chave]}, diga a hora de abrir e de fechar.`);
    h[chave] = { abre: tem(d, "abre") ? String(d.abre) : antes?.abre ?? PADRAO.abre, fecha: tem(d, "fecha") ? String(d.fecha) : antes?.fecha ?? PADRAO.fecha };
  }
  let almoco: Almoco | null = almocoDe(lerHorario(atual));
  if (e.sem_almoco === true) almoco = null;
  else if (tem(e, "almoco_de") || tem(e, "almoco_ate")) {
    const de = tem(e, "almoco_de") ? String(e.almoco_de) : almoco?.de ?? ALMOCO_PADRAO.de;
    const ate = tem(e, "almoco_ate") ? String(e.almoco_ate) : almoco?.ate ?? ALMOCO_PADRAO.ate;
    if (!RE_HORA.test(de) || !RE_HORA.test(ate)) throw erro("Almoço no formato HH:mm (ex.: 12:00).");
    almoco = { de, ate };
  }
  const novo = comAlmoco(h, almoco);
  const problema = erroDoHorario(novo);
  if (problema) throw erro(`${problema} Nada foi mudado.`);
  const velho = lerHorario(atual);
  const mudou: [string, string][] = [];
  for (const d of ORDEM_DIAS) if (diaEmTexto(velho[d]) !== diaEmTexto(novo[d])) mudou.push([NOME_DIAS[d], `${diaEmTexto(velho[d])} → ${diaEmTexto(novo[d])}`]);
  const a0 = almocoDe(velho), a1 = almocoDe(novo);
  if (JSON.stringify(a0) !== JSON.stringify(a1)) mudou.push(["Almoço", a1 ? `fechado das ${horaBonita(a1.de)} às ${horaBonita(a1.ate)}` : "sem parada para o almoço"]);
  return { novo, mudou };
}

type AlvoDoHorario = { alvo: "pet_shop" } | { alvo: "creche" | "hotel" } | { alvo: "servico"; servico: ServicoLido & { horario?: unknown } };
const NOME_DO_ALVO = { pet_shop: "do pet shop", creche: "da creche", hotel: "do hotel" } as const;

/** De quem é o horário do pedido (alvo), conferido: a área ligada, o serviço da lista e da agenda. */
async function alvoDoHorario(c: Contexto, e: Entrada, erro: Erro): Promise<AlvoDoHorario> {
  const alvo = semAcento(texto(e.alvo || "pet_shop", 20).toLowerCase()).replace(/\s+/g, "_");
  if (alvo === "pet_shop" || alvo === "petshop" || alvo === "loja") return { alvo: "pet_shop" };
  if (alvo === "creche" || alvo === "hotel") {
    if (!usaModulo(c.petshop, alvo)) throw erro(`Este pet shop não usa ${alvo === "creche" ? "a Creche" : "o Hotel"} no sistema. Nada foi mudado. Diga que dá para ligar em Meu pet shop, O que você usa.`);
    return { alvo };
  }
  if (alvo !== "servico") throw erro("alvo deve ser pet_shop, creche, hotel ou servico.");
  const id = uuid(e.servico_id);
  if (!id) throw erro("Com alvo servico, passe servico_id (o id do serviço na lista do contexto).");
  const servico = (await servicosDoBanco(c, erro)).find((x) => x.id === id);
  if (!servico) throw erro("Serviço não encontrado: use o id da lista de serviços do contexto.");
  if (servico.categoria === "creche" || servico.categoria === "hotel") throw erro(`"${servico.nome}" é creche/hotel: o horário é o da creche ou do hotel (alvo creche ou hotel).`);
  return { alvo: "servico", servico };
}

/**
 * O que muda num horário de creche, hotel ou serviço. Parte do horário próprio de agora ou, sem ele, do pet shop (sem o
 * almoço). novo null = igual ao pet shop.
 */
export function horarioProprioDoPedido(loja: unknown, atual: unknown, e: Entrada, erro: Erro, quem: string): { novo: Horario | null; mudou: [string, string][] } {
  if (tem(e, "almoco_de") || tem(e, "almoco_ate") || e.sem_almoco === true) throw erro(`O almoço é só do pet shop (alvo pet_shop): o horário ${quem} não tem almoço. Nada foi mudado.`);
  const proprio = atual && typeof atual === "object" ? semAlmoco(lerHorario(atual)) : null;
  if (e.igual_ao_pet_shop === true) {
    if (!proprio) throw erro(`Nada para mudar: o horário ${quem} já é igual ao do pet shop. Diga isso à pessoa.`);
    return { novo: null, mudou: [["Horário", `volta a ser igual ao do pet shop (${horarioEmTexto(loja)})`]] };
  }
  const { novo, mudou } = horarioDoPedido(proprio ?? semAlmoco(lerHorario(loja)), e, erro);
  const problema = erroDoHorarioProprio(novo);
  if (problema) throw erro(`${problema} Nada foi mudado.`);
  if (!mudou.length || (!proprio && mesmoHorario(novo, loja))) throw erro(`Nada para mudar: o horário ${quem} já está assim. Diga isso à pessoa.`);
  return { novo: semAlmoco(novo), mudou: proprio ? mudou : [["Antes", "igual ao pet shop"], ...mudou] };
}

/** O plano de alterar_funcionamento: o cartão e a gravação. */
async function planoDoFuncionamento(c: Contexto, e: Entrada, erro: Erro) {
  const p = await petshopDoBanco(c, erro);
  const a = await alvoDoHorario(c, e, erro);
  const semanaDe = (h: Horario) => ORDEM_DIAS.map((d) => `${NOME_DIAS[d].slice(0, 3)} ${diaEmTexto(h[d])}`).join(" · ");
  if (a.alvo === "pet_shop") {
    if (e.igual_ao_pet_shop === true) throw erro("igual_ao_pet_shop é para creche, hotel ou serviço.");
    const { novo, mudou } = horarioDoPedido(p.horario as Horario, e, erro);
    if (!mudou.length) throw erro("Nada para mudar: o horário já está assim. Diga isso à pessoa.");
    const seguem = (["creche", "hotel"] as const).filter((x) => usaModulo(c.petshop, x) && !areaTemHorario(p, x));
    const linhas: [string, string][] = [...mudou, ["Fica assim", semanaDe(novo)], ["Onde vale", `agenda, horários livres e link do cliente${seguem.length ? `; também ${seguem.join(" e ")}, que seguem o pet shop` : ""}`]];
    return { resumo: { titulo: "Mudar horário de funcionamento", linhas }, gravar: { tabela: "petshops" as const, id: c.petshop.id, campos: { horario: novo } as Record<string, unknown> } };
  }
  if (a.alvo === "servico") {
    const { novo, mudou } = horarioProprioDoPedido(p.horario, a.servico.horario, e, erro, `de ${a.servico.nome}`);
    const linhas: [string, string][] = [...mudou, ["Fica assim", novo ? semanaDe(novo) : "igual ao pet shop"], ["Onde vale", "agenda, horários livres e link do cliente, só para este serviço"]];
    return { resumo: { titulo: `Mudar horário de ${a.servico.nome}`, linhas }, gravar: { tabela: "servicos" as const, id: a.servico.id, campos: { horario: novo } as Record<string, unknown> } };
  }
  const coluna = a.alvo === "creche" ? "horario_creche" : "horario_hotel";
  const { novo, mudou } = horarioProprioDoPedido(p.horario, (p as Record<string, unknown>)[coluna], e, erro, NOME_DO_ALVO[a.alvo]);
  const linhas: [string, string][] = [...mudou, ["Fica assim", novo ? semanaDe(novo) : "igual ao pet shop"],
    ["Onde vale", a.alvo === "creche" ? "chegada e busca na creche, os dias da creche e o link do cliente" : "chegada e busca no hotel e o link do cliente"]];
  return { resumo: { titulo: `Mudar horário ${NOME_DO_ALVO[a.alvo]}`, linhas }, gravar: { tabela: "petshops" as const, id: c.petshop.id, campos: { [coluna]: novo } as Record<string, unknown> } };
}

async function petshopDoBanco(c: Contexto, erro: Erro) {
  const r = await lerPetshop(c.sb, c.petshop.id);
  if (!r.data) throw erro("Não consegui ler os dados do pet shop agora.");
  return r.data;
}

/* ---------- o que o Mozart chama ---------- */

/** Monta o cartão; devolve null quando o nome não é desta lista. */
export async function descreverCadastro(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<Resumo | null> {
  switch (nome) {
    case "criar_servico": case "alterar_servico": return (await planoDoServico(c, nome, e, erro)).resumo;
    case "criar_produto": case "alterar_produto": return (await planoDoProduto(c, nome, e, erro)).resumo;
    case "alterar_tutor": return (await planoDoTutor(c, e, erro)).resumo;
    case "criar_pacote": case "alterar_pacote": return (await planoDoPacote(c, nome, e, erro)).resumo;
    case "alterar_funcionamento": return (await planoDoFuncionamento(c, e, erro)).resumo;
    case "alterar_diarias": {
      const p = await petshopDoBanco(c, erro);
      const linhas: [string, string][] = [];
      for (const [k, modulo, rotulo, por] of [["creche", "creche", "Diária da creche", "por dia"], ["hotel", "hotel", "Diária do hotel", "por noite"]] as const) {
        const v = valorDoPedido(e, k, rotulo, erro);
        if (v == null) continue;
        if (!usaModulo(c.petshop, modulo)) throw erro(`Este pet shop não faz ${k}. Diga isso; dá para ligar em Meu pet shop, O que vocês fazem.`);
        const antes = k === "creche" ? p.diaria_creche : p.diaria_hotel;
        if (antes != null && Number(antes) === v) continue;
        linhas.push([rotulo, `${antes == null ? "" : `${brl(antes)} → `}${brl(v)} ${por}`]);
      }
      if (!linhas.length) throw erro(tem(e, "creche") || tem(e, "hotel") ? "Nada para mudar: a diária já está assim. Diga isso à pessoa." : "Diga o valor da diária da creche ou do hotel.");
      return { titulo: "Mudar diária", linhas };
    }
  }
  return null;
}

/** Grava o que a pessoa confirmou; devolve null quando o nome não é desta lista. */
export async function gravarCadastro(c: Contexto, nome: string, e: Entrada, erro: Erro): Promise<unknown> {
  const { sb, petshop } = c;
  switch (nome) {
    case "criar_servico": {
      const { campos } = await planoDoServico(c, nome, e, erro);
      let r = await sb.from("servicos").insert({ ...campos, petshop_id: petshop.id } as never).select("id").single();
      if (r.error && semLoja(r.error.message) && campos.categoria === "loja") r = await sb.from("servicos").insert({ ...campos, categoria: "outro", petshop_id: petshop.id } as never).select("id").single();
      if (r.error || !r.data) throw new Error(r.error?.message ?? "sem resposta");
      return { feito: true, servico_id: r.data.id };
    }
    case "alterar_servico": {
      const { campos, servico } = await planoDoServico(c, nome, e, erro);
      let r = await sb.from("servicos").update(campos as never).eq("id", servico!.id).eq("petshop_id", petshop.id).select("id");
      if (r.error && semLoja(r.error.message) && campos.categoria === "loja") r = await sb.from("servicos").update({ ...campos, categoria: "outro" } as never).eq("id", servico!.id).eq("petshop_id", petshop.id).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw erro("Sem permissão para mudar esse serviço (só o dono muda, em Meu pet shop). Nada foi mudado.");
      return { feito: true, servico_id: servico!.id };
    }
    case "criar_produto": {
      const { campos } = await planoDoProduto(c, nome, e, erro);
      const r = await sb.from("produtos").insert({ ...campos, petshop_id: petshop.id } as never).select("id").single();
      if (r.error || !r.data) throw new Error(r.error?.message ?? "sem resposta");
      return { feito: true, produto_id: r.data.id, saldo: 0 };
    }
    case "alterar_produto": {
      const { campos, produto } = await planoDoProduto(c, nome, e, erro);
      const r = await sb.from("produtos").update(campos as never).eq("id", produto!.id).eq("petshop_id", petshop.id).select("id");
      if (r.error) throw erro(/travado|baixou|preço/i.test(r.error.message) ? `Nada foi mudado: ${r.error.message}` : `Não consegui mudar o produto: ${r.error.message}`);
      if (!r.data?.length) throw erro("Sem permissão para mudar esse produto. Nada foi mudado.");
      return { feito: true, produto_id: produto!.id };
    }
    case "criar_pacote": {
      const { campos } = await planoDoPacote(c, nome, e, erro);
      const r = await sb.from("pacotes").insert({ ...campos, petshop_id: petshop.id } as never).select("id").single();
      if (r.error || !r.data) throw new Error(r.error?.message ?? "sem resposta");
      return { feito: true, pacote_id: r.data.id };
    }
    case "alterar_pacote": {
      const { campos, pacote } = await planoDoPacote(c, nome, e, erro);
      const r = await sb.from("pacotes").update(campos as never).eq("id", pacote!.id).eq("petshop_id", petshop.id).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw erro("Sem permissão para mudar esse pacote. Nada foi mudado.");
      return { feito: true, pacote_id: pacote!.id };
    }
    case "alterar_tutor": {
      const { campos, antes } = await planoDoTutor(c, e, erro);
      // grava só se ninguém mexeu nos mesmos campos desde o cartão (senão, o que outra pessoa escreveu se perderia)
      let q = sb.from("clientes").update(campos as never).eq("id", antes.id).eq("petshop_id", petshop.id);
      for (const k of Object.keys(campos)) {
        const v = (antes as Record<string, unknown>)[k];
        q = v == null ? q.is(k as never, null) : q.eq(k as never, v as never);
      }
      const r = await q.select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw erro("A ficha desse tutor mudou agora há pouco (ou o seu acesso não deixa editar). Nada foi feito. Busque o tutor de novo e confira.");
      return { feito: true, cliente_id: antes.id };
    }
    case "alterar_funcionamento": {
      const { gravar } = await planoDoFuncionamento(c, e, erro);
      const r = gravar.tabela === "servicos"
        ? await sb.from("servicos").update(gravar.campos as never).eq("id", gravar.id).eq("petshop_id", petshop.id).select("id")
        : await sb.from("petshops").update(gravar.campos as never).eq("id", petshop.id).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw erro("Sem permissão: o horário só o dono muda. Nada foi mudado.");
      return { feito: true };
    }
    case "alterar_diarias": {
      const campos: Record<string, number> = {};
      for (const [k, coluna] of [["creche", "diaria_creche"], ["hotel", "diaria_hotel"]] as const) {
        const v = valorDoPedido(e, k, k, erro);
        if (v != null) campos[coluna] = v;
      }
      const r = await sb.from("petshops").update(campos as never).eq("id", petshop.id).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw erro("Sem permissão: a diária só o dono muda. Nada foi mudado.");
      return { feito: true };
    }
  }
  return null;
}
