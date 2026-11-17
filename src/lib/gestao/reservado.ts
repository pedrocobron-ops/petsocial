import type { Banco } from "./supabase";
import type { Database } from "./banco";

/**
 * Colunas reservadas: custo de produto, preço de pacote, comissão e e-mail de convite.
 * O banco não entrega essas colunas direto da tabela; elas saem por funções que conferem a área de quem pede
 * (estoque, pacotes, relatórios, dono). Aqui ficam as listas de colunas livres e a junção com as reservadas.
 * Quem não tem a área recebe a linha com o valor reservado vazio (null), e as telas seguem funcionando.
 */
type T = Database["public"]["Tables"];
export type ProdutoLinha = T["produtos"]["Row"];
export type MovimentoLinha = T["movimentos_estoque"]["Row"];
export type PacoteLinha = T["pacotes"]["Row"];
export type PacoteClienteLinha = T["pacotes_clientes"]["Row"];
export type ProfissionalLinha = T["profissionais"]["Row"];
export type PetshopLinha = T["petshops"]["Row"];

/** O produto sem o preço de venda (`comPrecosDeProduto`) e sem o custo (`comCustos`). */
export const COLS_PRODUTO = "id, petshop_id, nome, categoria, unidade, estoque, estoque_minimo, ativo, criado_em, codigo_barras, fornecedor_id, embalagem_qtd";
export const COLS_MOVIMENTO = "id, petshop_id, produto_id, tipo, quantidade, motivo, origem, criado_por, criado_em, fornecedor_id, lancamento_id";
export const COLS_PACOTE = "id, petshop_id, nome, servico_id, quantidade, validade_dias, ativo, criado_em";
export const COLS_PACOTE_CLIENTE = "id, petshop_id, pet_id, pacote_id, nome, servico_id, total, usados, comprado_em, vence_em, ativo, criado_em";
/** O serviço sem os preços da lista (`comPrecosDeServico`). O banco não entrega `select("*")` em servicos. */
export const COLS_SERVICO = "id, petshop_id, nome, categoria, duracao_min, cor, ordem, ativo, criado_em";
/**
 * O horário sem o preço (`comPrecosDeAgendamento`). O banco não entrega `select("*")` em agendamentos nem o preço
 * dos serviços a mais (`agendamento_servicos.preco`): leia `id, servico_id, ordem` e junte o preço depois.
 */
export const COLS_AGENDAMENTO = "id, petshop_id, pet_id, servico_id, profissional_id, inicio, fim, status, obs, leva_traz, endereco_leva_traz, checklist, pacote_cliente_id, lembrete_em, origem, criado_por, criado_em, serie_id, foto_antes, foto_depois, pronto_avisado_em, sem_cobranca, sem_cobranca_em, sem_cobranca_nome";
export const COLS_PROFISSIONAL = "id, petshop_id, user_id, nome, papel, ve_financeiro, cor, escala, atende, ativo, criado_em, funcao, acessos";

/** A estadia sem a diária e o valor cobrado (reservados: `comValoresDeEstadia`). O banco não entrega `select("*")` em estadias. */
export const COLS_ESTADIA = "id, petshop_id, pet_id, tipo, entrada, saida_prevista, saida, status, obs, criado_em, diarias_cobradas, plano_id, mensalista, dia, cobranca_id, acomodacao, cuidados, avisos, sinal_estado, experiencia";

/** Tudo do pet shop menos a meta do mês, as diárias padrão, as opções (`petshop_opcoes`) e os dados da assinatura na Cakto. */
export const COLS_PETSHOP = "id, nome, telefone, cidade, uf, fuso, horario, status, plano, teste_ate, assinatura_desde, criado_por, criado_em, whatsapp, link_codigo, link_ativo, link_aviso, vagas, guia_feito_em, logo, tema, pago_ate, periodo_meses, vagas_creche, vagas_hotel, link_creche, link_hotel, fidelidade_cada, fidelidade_premio, fidelidade_desde, modulos, principal, creche_bloqueia_vacina";

type Linhas = Record<string, unknown>[];
/**
 * Chama a função do banco; se ela ainda não existe (banco antes da atualização), lê as colunas direto da tabela.
 * Qualquer outro erro vira lista vazia: o valor reservado fica em branco, sem derrubar a tela.
 */
async function reservado(sb: Banco, funcao: string, args: Record<string, unknown>, direto: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<Linhas> {
  type Pagina = PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  const banco = sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => { order: (coluna: string) => { range: (de: number, ate: number) => Pagina } } };
  // o banco entrega no máximo 1000 linhas por vez, também nas funções: busca de mil em mil, sempre na mesma ordem
  const tudo: Linhas = [];
  for (let de = 0; de < 200000; de += 1000) {
    const r = await banco.rpc(funcao, args).order("id").range(de, de + 999);
    if (r.error) {
      if (de > 0) return tudo;
      if (r.error.code !== "PGRST202" && r.error.code !== "42883") return [];
      const d = await direto();
      return d.error ? [] : ((d.data as Linhas | null) ?? []);
    }
    const linhas = (r.data as Linhas | null) ?? [];
    tudo.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return tudo;
}
const porId = (linhas: Linhas) => new Map(linhas.map((l) => [String(l.id), l]));
const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * O pet shop. A meta do mês só vem para quem vê o financeiro; as diárias padrão da creche e do hotel, só para quem recebe
 * (Caixa, Financeiro ou Relatórios); os dados da assinatura na Cakto não vêm para ninguém (o painel do administrador lê por outra função).
 */
export async function lerPetshop(sb: Banco, petshopId: string): Promise<{ data: PetshopLinha | null; error: { message: string } | null }> {
  // tudo de uma vez: no celular com internet fraca, cada ida e volta ao banco pesa
  const [base, extra, diarias, opcoes] = await Promise.all([
    sb.from("petshops").select(COLS_PETSHOP).eq("id", petshopId).maybeSingle(),
    reservado(sb, "petshop_reservado", { p: petshopId }, () => sb.from("petshops").select("id, meta_mes").eq("id", petshopId)),
    reservado(sb, "petshop_diarias", { p: petshopId }, () => sb.from("petshops").select("id, diaria_creche, diaria_hotel").eq("id", petshopId)),
    lerOpcoes(sb, petshopId),
  ]);
  if (base.error || !base.data) return { data: null, error: base.error };
  return { data: montarPetshop(base.data, extra, diarias, opcoes), error: null };
}

function montarPetshop(base: unknown, extra: Linhas, diarias: Linhas, opcoes: Record<string, unknown>): PetshopLinha {
  return {
    ...(base as PetshopLinha), opcoes: opcoes as PetshopLinha["opcoes"], meta_mes: num(extra[0]?.meta_mes),
    diaria_creche: num(diarias[0]?.diaria_creche), diaria_hotel: num(diarias[0]?.diaria_hotel), cakto_email: null, cakto_assinatura: null,
  };
}

/**
 * As opções do negócio (`petshops.opcoes`). Vêm por uma função do banco: quem não recebe (sem Caixa, Financeiro nem Relatórios)
 * recebe as listas de preço em branco (só a chave ligada/desligada). Banco antes da atualização: lê a coluna direto.
 */
export async function lerOpcoes(sb: Banco, petshopId: string): Promise<Record<string, unknown>> {
  const objeto = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> }).rpc("petshop_opcoes", { p: petshopId });
  if (!r.error) return objeto(r.data);
  if (r.error.code !== "PGRST202" && r.error.code !== "42883") return {};
  const d = await sb.from("petshops").select("opcoes").eq("id", petshopId).maybeSingle();
  return objeto(d.data?.opcoes);
}

/**
 * Junta a diária e o valor cobrado às estadias. Só quem recebe (Caixa, Financeiro, Relatórios ou o dono) recebe os valores;
 * para os outros (e com `vejo` falso, sem nem perguntar ao banco) os dois campos vêm vazios.
 */
export async function comValoresDeEstadia<E extends { id: string }>(sb: Banco, petshopId: string, estadias: E[], vejo = true): Promise<(E & { valor_diaria: number | null; valor_cobrado: number | null })[]> {
  const extra = new Map<string, Record<string, unknown>>();
  if (vejo) {
    const ids = estadias.map((e) => e.id);
    const partes = await Promise.all(Array.from({ length: Math.ceil(ids.length / 400) }, (_, i) => ids.slice(i * 400, i * 400 + 400)).map((parte) =>
      reservado(sb, "estadias_reservado", { p: petshopId, p_ids: parte }, () => sb.from("estadias").select("id, valor_diaria, valor_cobrado").eq("petshop_id", petshopId).in("id", parte))));
    for (const l of partes.flat()) extra.set(String(l.id), l);
  }
  return estadias.map((e) => ({ ...e, valor_diaria: num(extra.get(e.id)?.valor_diaria), valor_cobrado: num(extra.get(e.id)?.valor_cobrado) }));
}

/**
 * Ids das estadias encerradas que saíram sem valor lançado (a lista Check-outs para cobrar), da saída mais nova para a mais antiga.
 * Vem por função do banco, só para quem recebe: a coluna do valor cobrado não pode ser filtrada pela API. No máximo 150 por vez.
 */
export async function idsParaCobrar(sb: Banco, petshopId: string): Promise<string[]> {
  const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }).rpc("estadias_para_cobrar", { p: petshopId });
  if (r.error) return [];
  const linhas = ((r.data as { id: string; saida: string | null }[] | null) ?? []).slice();
  linhas.sort((a, b) => (b.saida ?? "").localeCompare(a.saida ?? ""));
  return linhas.slice(0, 150).map((l) => l.id);
}

/** A equipe do pet shop, com comissão e e-mail de convite para quem pode ver (dono, relatórios, a própria pessoa). */
export async function lerEquipe(sb: Banco, petshopId: string): Promise<{ data: ProfissionalLinha[] | null; error: { message: string } | null }> {
  const [base, reservadas] = await Promise.all([
    sb.from("profissionais").select(COLS_PROFISSIONAL).eq("petshop_id", petshopId).order("criado_em"),
    reservado(sb, "equipe_reservado", { p: petshopId }, () => sb.from("profissionais").select("id, comissao_pct, email_convite").eq("petshop_id", petshopId)),
  ]);
  if (base.error) return { data: null, error: base.error };
  return { data: montarEquipe(base.data as unknown as ProfissionalLinha[], reservadas), error: null };
}

function montarEquipe(base: ProfissionalLinha[], reservadas: Linhas): ProfissionalLinha[] {
  const extra = porId(reservadas);
  return base.map((p) => {
    const x = extra.get(p.id);
    return { ...p, comissao_pct: num(x?.comissao_pct) ?? 0, email_convite: (x?.email_convite as string | null | undefined) ?? null };
  });
}

/**
 * Junta o custo e o último custo aos produtos (null para quem não cuida do estoque nem vê o financeiro).
 * Com a margem ligada, `custo` é o custo médio; desligada, é o da última entrada.
 */
export async function comCustos<P extends { id: string }>(sb: Banco, petshopId: string, produtos: P[]): Promise<(P & { custo: number | null; ultimo_custo: number | null })[]> {
  const extra = produtos.length ? porId(await reservado(sb, "produtos_reservado", { p: petshopId },
    () => sb.rpc("custos_dos_produtos", { p: petshopId }))) : new Map<string, Record<string, unknown>>();
  return produtos.map((p) => ({ ...p, custo: num(extra.get(p.id)?.custo), ultimo_custo: num(extra.get(p.id)?.ultimo_custo) }));
}

/** Custo unitário de cada compra feita de um fornecedor, por id do movimento. */
export async function custosDasCompras(sb: Banco, petshopId: string, fornecedorId: string): Promise<Map<string, number | null>> {
  const linhas = await reservado(sb, "custos_das_compras", { p: petshopId, p_fornecedor: fornecedorId }, async () => ({ data: [], error: null }));
  return new Map(linhas.map((l) => [String(l.id), num(l.custo_unitario)]));
}

/** Junta o custo unitário aos movimentos de um produto. */
export async function comCustosDeMovimento<M extends { id: string }>(sb: Banco, produtoId: string, movimentos: M[]): Promise<(M & { custo_unitario: number | null })[]> {
  const extra = movimentos.length ? porId(await reservado(sb, "custos_dos_movimentos", { p_produto: produtoId },
    () => sb.from("movimentos_estoque").select("id, custo_unitario").eq("produto_id", produtoId))) : new Map<string, Record<string, unknown>>();
  return movimentos.map((m) => ({ ...m, custo_unitario: num(extra.get(m.id)?.custo_unitario) }));
}

/**
 * Custo unitário de todos os movimentos do pet shop, por id do movimento (cópia de segurança).
 * Uma função só no banco; se ela ainda não existe (banco antes da atualização), pede produto por produto, seis de cada vez.
 */
export async function custosDeTodosOsMovimentos(sb: Banco, petshopId: string, movimentos: { id: string; produto_id: string }[]): Promise<Map<string, number | null>> {
  const custos = new Map<string, number | null>();
  if (!movimentos.length) return custos;
  let semFuncao = false;
  const linhas = await reservado(sb, "custos_dos_movimentos_do_petshop", { p: petshopId }, async () => { semFuncao = true; return { data: [], error: null }; });
  if (!semFuncao) {
    for (const l of linhas) custos.set(String(l.id), num(l.custo_unitario));
    return custos;
  }
  const porProduto = new Map<string, { id: string }[]>();
  for (const m of movimentos) porProduto.set(m.produto_id, [...(porProduto.get(m.produto_id) ?? []), m]);
  const grupos = [...porProduto];
  for (let i = 0; i < grupos.length; i += 6) {
    const lidos = await Promise.all(grupos.slice(i, i + 6).map(([produtoId, lista]) => comCustosDeMovimento(sb, produtoId, lista)));
    for (const m of lidos.flat()) custos.set(m.id, m.custo_unitario);
  }
  return custos;
}

/** Junta o preço aos pacotes (modelos e vendidos). Sem a área de pacotes, o preço vem 0. */
export async function comPrecosDePacote<P extends { id: string }>(sb: Banco, petshopId: string, pacotes: P[]): Promise<(P & { preco: number })[]> {
  const extra = pacotes.length ? porId(await reservado(sb, "precos_dos_pacotes", { p: petshopId }, async () => {
    const [a, b] = await Promise.all([
      sb.from("pacotes").select("id, preco").eq("petshop_id", petshopId),
      sb.from("pacotes_clientes").select("id, preco").eq("petshop_id", petshopId),
    ]);
    return { data: [...(a.data ?? []), ...(b.data ?? [])], error: a.error ?? b.error };
  })) : new Map<string, Record<string, unknown>>();
  return pacotes.map((p) => ({ ...p, preco: num(extra.get(p.id)?.preco) ?? 0 }));
}


/**
 * Junta os preços da lista aos serviços (null para quem não recebe). Quem não recebe e marca um horário não manda preço:
 * o banco coloca o da lista para o porte do pet.
 */
export async function comPrecosDeServico<S extends { id: string }>(sb: Banco, petshopId: string, servicos: S[]): Promise<(S & { preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null; preco_varia: boolean })[]> {
  return juntarPrecosDeServico(servicos, servicos.length ? await precosDeServico(sb, petshopId) : []);
}

const precosDeServico = (sb: Banco, petshopId: string) => reservado(sb, "servicos_precos", { p: petshopId },
  () => sb.from("servicos").select("id, preco_p, preco_m, preco_g, preco_gg").eq("petshop_id", petshopId));

function juntarPrecosDeServico<S extends { id: string }>(servicos: S[], linhas: Linhas) {
  const extra = porId(linhas);
  return servicos.map((s) => {
    const x = extra.get(s.id);
    const precos = { preco_p: num(x?.preco_p), preco_m: num(x?.preco_m), preco_g: num(x?.preco_g), preco_gg: num(x?.preco_gg) };
    // o preço muda com o porte? O banco diz até para quem não vê os valores (assim a tela pergunta o porte do mesmo jeito)
    const varia = typeof x?.varia === "boolean" ? x.varia : new Set(Object.values(precos).filter((v) => v != null)).size > 1;
    return { ...s, ...precos, preco_varia: varia };
  });
}

/** Os serviços do pet shop, com os preços para quem pode ver, na ordem da tela. */
export async function lerServicos(sb: Banco, petshopId: string): Promise<{ data: (T["servicos"]["Row"] & { preco_varia: boolean })[] | null; error: { message: string } | null }> {
  // a lista e os preços ao mesmo tempo (uma ida ao banco a menos ao abrir o aplicativo)
  const [base, precos] = await Promise.all([
    sb.from("servicos").select(COLS_SERVICO).eq("petshop_id", petshopId).order("ordem").order("nome").order("id"),
    precosDeServico(sb, petshopId),
  ]);
  if (base.error) return { data: null, error: base.error };
  return { data: juntarPrecosDeServico(base.data as unknown as T["servicos"]["Row"][], precos), error: null };
}

/** Junta o preço de venda aos produtos. Vem para quem vende (Caixa), cuida do estoque ou vê o dinheiro; para os outros, null. */
export async function comPrecosDeProduto<P extends { id: string }>(sb: Banco, petshopId: string, produtos: P[]): Promise<(P & { preco_venda: number | null })[]> {
  const extra = produtos.length ? porId(await reservado(sb, "produtos_precos", { p: petshopId },
    () => sb.from("produtos").select("id, preco_venda").eq("petshop_id", petshopId))) : new Map<string, Record<string, unknown>>();
  return produtos.map((p) => ({ ...p, preco_venda: num(extra.get(p.id)?.preco_venda) }));
}

type ComServicosAMais = { id: string; agendamento_servicos?: { id?: string }[] | null };
type ComPreco<A> = A & { preco: number | null };
/**
 * Junta o preço de cada horário e de cada serviço a mais dele (os serviços a mais precisam vir com `id`).
 * Só quem recebe (Caixa, Financeiro, Relatórios ou o dono) recebe os valores; para os outros (e com `vejo` falso,
 * sem nem perguntar ao banco) os preços vêm vazios.
 */
export async function comPrecosDeAgendamento<A extends ComServicosAMais>(sb: Banco, petshopId: string, ags: A[], vejo = true): Promise<(Omit<ComPreco<A>, "agendamento_servicos"> & { agendamento_servicos: ComPreco<NonNullable<A["agendamento_servicos"]>[number]>[] | null })[]> {
  const precos = new Map<string, number | null>();
  if (vejo && ags.length) {
    const ids = ags.map((a) => a.id);
    const partes = Array.from({ length: Math.ceil(ids.length / 400) }, (_, i) => ids.slice(i * 400, i * 400 + 400));
    const lidas = await Promise.all(partes.map((parte) => reservado(sb, "agendamentos_precos", { p: petshopId, p_ids: parte }, async () => {
      const r = await sb.from("agendamentos").select("id, preco, agendamento_servicos(id, preco)").eq("petshop_id", petshopId).in("id", parte);
      const linhas = ((r.data ?? []) as unknown as { id: string; preco: number | null; agendamento_servicos: { id: string; preco: number | null }[] | null }[])
        .flatMap((a) => [{ id: a.id, preco: a.preco }, ...(a.agendamento_servicos ?? [])]);
      return { data: linhas, error: r.error };
    })));
    for (const l of lidas.flat()) precos.set(String(l.id), num(l.preco));
  }
  const preco = (id: string | undefined) => (id ? precos.get(id) ?? null : null);
  return ags.map((a) => ({
    ...a,
    preco: preco(a.id),
    agendamento_servicos: a.agendamento_servicos == null ? null : a.agendamento_servicos.map((o) => ({ ...o, preco: preco(o.id) })),
  })) as never;
}

type ServicoLido = T["servicos"]["Row"] & { preco_varia: boolean };
/**
 * O que o aplicativo lê ao abrir: o pet shop, a equipe e os serviços, com as partes reservadas (as mesmas regras de
 * `lerPetshop`, `lerEquipe` e `lerServicos`). Vem numa ida só ao banco (`gestao_base`); se a função ainda não existe
 * (banco antes da atualização) ou falhar, lê do jeito de antes, com um pedido por parte.
 */
export async function lerBase(sb: Banco, petshopId: string): Promise<{ petshop: PetshopLinha | null; erro: { message: string } | null; equipe: ProfissionalLinha[]; servicos: ServicoLido[] }> {
  const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }).rpc("gestao_base", { p: petshopId });
  const b = (r.error ? null : r.data) as Record<string, unknown> | null;
  if (!b) {
    const [p, e, s] = await Promise.all([lerPetshop(sb, petshopId), lerEquipe(sb, petshopId), lerServicos(sb, petshopId)]);
    return { petshop: p.data, erro: p.error, equipe: e.data ?? [], servicos: s.data ?? [] };
  }
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Linhas) : []);
  const objeto = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  return {
    petshop: b.petshop ? montarPetshop(b.petshop, lista(b.reservado), lista(b.diarias), objeto(b.opcoes)) : null,
    erro: null,
    equipe: montarEquipe(lista(b.equipe) as unknown as ProfissionalLinha[], lista(b.equipe_reservado)),
    servicos: juntarPrecosDeServico(lista(b.servicos) as unknown as T["servicos"]["Row"][], lista(b.servicos_precos)),
  };
}
