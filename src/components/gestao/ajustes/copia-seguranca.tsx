"use client";

import { useState } from "react";
import { Archive, Download } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AREAS, areasDe } from "@/lib/gestao/acessos";
import { Tile } from "@/components/gestao/painel";
import { mensagemDeErro, useAvisos } from "@/components/gestao/ui";
import { ESPECIES, nomePorte } from "@/components/gestao/clientes/comum";
import {
  baixarArquivo, categoriaAtual, dinheiroCsv, numeroCsv, paginar, resumoDoCaixa, rotuloForma, textoCsv, type Cel,
} from "@/components/gestao/financeiro/comum";
import { itensDoLancamento, nomeDoMovimento, partesPorForma, textoDoPagamento } from "@/lib/gestao/dinheiro";
import {
  COLS_MOVIMENTO, COLS_PACOTE, COLS_PACOTE_CLIENTE, COLS_PRODUTO, comCustos, custosDeTodosOsMovimentos, comPrecosDePacote, lerEquipe, COLS_ESTADIA, comValoresDeEstadia,
} from "@/lib/gestao/reservado";
import { FORMAS, STATUS_AGENDAMENTO, type Caixa, type Cliente, type Estadia, type Lancamento, type Pet, type Servico, type StatusAgendamento } from "@/lib/gestao/tipos";
import { brl, dataCompleta, fmtTelefone, hora, isoDia, semAcento } from "@/lib/gestao/util";
import { montarZip, type ArquivoZip } from "@/lib/gestao/zip";
import { acomodacoesDe } from "@/lib/gestao/hotel-opcoes";
import "./copia-seguranca.css";

/* ---------- o que vem do banco ---------- */

type Tutor = { nome: string; telefone?: string | null } | null;
type DoPet = { nome: string; clientes: Tutor } | null;
type PetLido = Pet & { clientes: Tutor };
type SaudeLida = { tipo: string; nome: string; aplicado_em: string | null; vence_em: string | null; obs: string | null; criado_em: string; pets: DoPet };
type AgendamentoLido = {
  inicio: string; fim: string; status: StatusAgendamento; preco: number | null; obs: string | null; origem: string; criado_por: string | null; leva_traz: boolean;
  endereco_leva_traz: string | null; pacote_cliente_id: string | null; pets: DoPet; servicos: { nome: string } | null; profissionais: { nome: string } | null;
  agendamento_servicos?: { preco: number | null; ordem: number; servicos: { nome: string } | null }[] | null;
};
type ProdutoLido = { id: string; nome: string; categoria: string | null; unidade: string; preco_venda: number | null; estoque: number; estoque_minimo: number; ativo: boolean; criado_em: string; codigo_barras: string | null; fornecedor_id: string | null };
type MovimentoLido = { id: string; produto_id: string; tipo: string; quantidade: number; motivo: string | null; origem: string; criado_por: string | null; criado_em: string; fornecedor_id: string | null };
type FornecedorLido = { id: string; nome: string; telefone: string | null; observacoes: string | null; ativo: boolean; criado_em: string };
type PacoteLido = { id: string; nome: string; quantidade: number; validade_dias: number; ativo: boolean; criado_em: string; servicos: { nome: string } | null };
type PacoteVendidoLido = {
  id: string; nome: string; total: number; usados: number; comprado_em: string; vence_em: string | null; ativo: boolean; pets: DoPet; servicos: { nome: string } | null;
};
type EstadiaLida = Estadia & { pets: DoPet };
type SinalLido = { estadia_id: string; sinal: number | null; sinal_estado: string | null; sinal_recebido: number | null };
type PlanoLido = { id: string; dias: number[]; vence_dia: number; inicio: string; fim: string | null; pausa_de: string | null; pausa_ate: string | null; obs: string | null; pets: DoPet };
type PlanoValorLido = { plano_id: string; valor_mensal: number; valor_extra: number | null };
type CobrancaLida = {
  mes: string; valor_mensal: number; valor_extras: number; desconto: number; total: number; vencimento: string; status: string; lancamento_id: string | null; obs: string | null;
  extras: unknown; pets: DoPet;
};
type ComissaoPagaLida = { profissional_id: string; de: string; ate: string; valor: number; pago_em: string };

/* ---------- células ---------- */

/** "14/11/2026" para dia; "14/11/2026 09:30" para dia e hora. */
const quando = (s: string | null | undefined) => (!s ? "" : s.length === 10 ? dataCompleta(s) : `${dataCompleta(s)} ${hora(s)}`);
const simNao = (v: boolean | null | undefined) => (v ? "Sim" : "Não");
const dinheiro = (n: number | null | undefined): Cel => (n == null ? "" : dinheiroCsv(Number(n)));
const numero = (n: number | null | undefined): Cel => (n == null ? "" : numeroCsv(Number(n)));
const tutorDe = (p: DoPet) => p?.clientes?.nome ?? "";

const TIPO_SAUDE: Record<string, string> = { vacina: "Vacina", vermifugo: "Vermífugo", antipulgas: "Antipulgas", outro: "Outro" };
const TIPO_MOVIMENTO: Record<string, string> = { entrada: "Entrada", saida: "Saída", ajuste: "Saldo corrigido" };
const TIPO_ESTADIA: Record<string, string> = { creche: "Creche", hotel: "Hotel" };
const STATUS_ESTADIA: Record<string, string> = { reservada: "Reservada", em_casa: "Está aqui", encerrada: "Encerrada", cancelada: "Cancelada" };
const TIPO_SERVICO: Record<string, string> = { banho: "Banho", tosa: "Tosa", banho_tosa: "Banho e tosa", creche: "Creche", hotel: "Hotel", outro: "Outro" };
const PAPEL: Record<string, string> = { dono: "Dono ou sócio", gerente: "Gerente", funcionario: "Funcionário" };
const ORIGEM: Record<string, string> = { tela: "", assistente: "Pelo Mozart", link: "Link de agendamento" };
const SEXO: Record<string, string> = { M: "Macho", F: "Fêmea" };
const MENSALISTA: Record<string, string> = { plano: "Dia do plano", extra: "Dia extra", reposicao: "Reposição de falta" };
const SINAL: Record<string, string> = { a_receber: "A receber", pago: "Pago", devolvido: "Devolvido", mantido: "Não devolvido" };
const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const rotulo = (mapa: Record<string, string>, v: string | null | undefined) => (v == null ? "" : mapa[v] ?? v);

/** Os assuntos da cópia, na ordem em que são juntados. O texto também vai no LEIA-ME. */
const ASSUNTOS = [
  { arquivo: "clientes.csv", nome: "clientes", explica: "Os tutores: nome, telefone, e-mail, endereço e observações." },
  { arquivo: "pets.csv", nome: "pets", explica: "Os pets, cada um com o nome do tutor, espécie, raça, porte, alertas e observações." },
  { arquivo: "cuidados-de-saude.csv", nome: "cuidados de saúde", explica: "Vacinas, vermífugos, antipulgas e outros cuidados anotados na ficha de cada pet." },
  { arquivo: "agendamentos.csv", nome: "agendamentos", explica: "Todos os horários da agenda, com pet, tutor, serviço (e os outros serviços do mesmo horário), profissional, situação e preço." },
  { arquivo: "lancamentos.csv", nome: "lançamentos", explica: "O financeiro: tudo o que entrou e saiu, as contas a pagar e a receber. Saídas aparecem com valor negativo. Conta recebida em partes: cada parte é uma linha, e a linha da conta traz o valor cheio na última coluna." },
  { arquivo: "caixas.csv", nome: "caixas", explica: "Cada caixa aberto e fechado, com o troco, o que entrou e saiu, o dinheiro esperado e o contado." },
  { arquivo: "produtos.csv", nome: "produtos", explica: "Os produtos do estoque, com preço, custo, último custo, código de barras, último fornecedor, quantidade atual e mínima." },
  { arquivo: "movimentos-de-estoque.csv", nome: "movimentos de estoque", explica: "Cada entrada, saída e correção de saldo dos produtos. Nas saídas, o custo é o do produto naquele momento." },
  { arquivo: "fornecedores.csv", nome: "fornecedores", explica: "Os fornecedores cadastrados, com WhatsApp e observações." },
  { arquivo: "pacotes.csv", nome: "pacotes", explica: "Os pacotes que o pet shop oferece." },
  { arquivo: "pacotes-vendidos.csv", nome: "pacotes vendidos", explica: "Os pacotes comprados por cada pet, com quanto já foi usado e a validade." },
  { arquivo: "estadias.csv", nome: "creche e hotel", explica: "As estadias de creche e hotel, com entrada, saída e valores. Mostra também o dia de mensalista, a acomodação e o sinal da reserva." },
  { arquivo: "mensalistas.csv", nome: "mensalistas da creche", explica: "Os planos mensais da creche: pet, dias da semana, valor do mês, valor do dia extra, início e fim." },
  { arquivo: "mensalidades.csv", nome: "mensalidades da creche", explica: "As cobranças de cada mês: mensalidade, dias extras, desconto, total, vencimento, se foi paga e quanto falta." },
  { arquivo: "equipe.csv", nome: "equipe", explica: "As pessoas da equipe, com função, comissão e se têm acesso ao sistema." },
  { arquivo: "comissoes-pagas.csv", nome: "comissões pagas", explica: "Cada comissão marcada como paga: a pessoa, o período, o valor e o dia." },
  { arquivo: "servicos.csv", nome: "serviços", explica: "Os serviços e os preços por porte." },
] as const;
type NomeArquivo = (typeof ASSUNTOS)[number]["arquivo"];

function leiaMe(petshop: string, agora: Date, linhas: Map<NomeArquivo, number>) {
  const partes = [
    `Cópia de segurança do Maestro Pet Gestão`,
    `Pet shop: ${petshop}`,
    `Cópia feita em ${dataCompleta(agora)} às ${hora(agora)}.`,
    "",
    "O que tem aqui",
    "Cada arquivo .csv é uma planilha. Abre no Excel, no Google Planilhas e no LibreOffice.",
    "",
    ...ASSUNTOS.map((a) => {
      const n = linhas.get(a.arquivo) ?? 0;
      return `${a.arquivo} (${n === 1 ? "1 linha" : `${n} linhas`})\r\n  ${a.explica}`;
    }),
    "",
    "Para saber",
    "- Esta cópia mostra os dados como estavam na data e na hora acima. O que mudou depois não está aqui.",
    "- É uma cópia para você guardar e consultar. Ainda não dá para trazer estes arquivos de volta para o Maestro automaticamente.",
    "- As fotos dos pets e o logotipo não entram na cópia.",
    "- Valores em reais, com vírgula nos centavos e sem o R$, para a planilha conseguir somar.",
    "- Datas no formato dia/mês/ano.",
    "- Aqui tem dados dos seus clientes. Guarde em um lugar seguro.",
    "",
  ];
  return partes.join("\r\n");
}

export default function CopiaSeguranca() {
  const { sb, petshop } = useGestao();
  const { avisar } = useAvisos();
  const [passo, setPasso] = useState<{ n: number; texto: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feita, setFeita] = useState<string | null>(null);
  const total = ASSUNTOS.length + 1;

  async function baixar() {
    if (passo) return;
    setErro(null);
    setFeita(null);
    let n = 0, fazendo = "";
    const etapa = (nome: string) => { fazendo = nome; n += 1; setPasso({ n, texto: `Juntando ${nome}…` }); };
    /** Todas as linhas de uma tabela, de mil em mil. A consulta precisa ter ordem fixa. */
    const todas = <T,>(consulta: (de: number, ate: number) => unknown) =>
      paginar<T>(consulta as (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, 1_000_000);
    const id = petshop.id;
    const tabelas = new Map<NomeArquivo, Cel[][]>();

    try {
      etapa("clientes");
      const clientes = await todas<Cliente>((a, b) => sb.from("clientes").select("*").eq("petshop_id", id).order("nome").order("id").range(a, b));
      const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]));
      tabelas.set("clientes.csv", [
        ["Nome", "Telefone", "E-mail", "Endereço", "Observações", "Cliente desde"],
        ...clientes.map((c): Cel[] => [c.nome, fmtTelefone(c.telefone), c.email ?? "", c.endereco ?? "", c.obs ?? "", quando(isoDia(new Date(c.criado_em)))]),
      ]);

      etapa("pets");
      const pets = await todas<PetLido>((a, b) => sb.from("pets").select("*, clientes(nome, telefone)").eq("petshop_id", id).order("nome").order("id").range(a, b));
      tabelas.set("pets.csv", [
        ["Pet", "Tutor", "Telefone do tutor", "Espécie", "Raça", "Porte", "Sexo", "Nascimento", "Alertas", "Observações", "Ativo", "Adicionado em"],
        ...pets.map((p): Cel[] => [
          p.nome, p.clientes?.nome ?? "", fmtTelefone(p.clientes?.telefone), ESPECIES[p.especie] ?? p.especie, p.raca ?? "", nomePorte(p.porte), rotulo(SEXO, p.sexo),
          quando(p.nascimento), p.alertas ?? "", p.obs ?? "", simNao(p.ativo), quando(isoDia(new Date(p.criado_em))),
        ]),
      ]);

      etapa("cuidados de saúde");
      const saude = await todas<SaudeLida>((a, b) => sb.from("pets_saude").select("tipo, nome, aplicado_em, vence_em, obs, criado_em, pets(nome, clientes(nome))")
        .eq("petshop_id", id).order("criado_em").order("id").range(a, b));
      tabelas.set("cuidados-de-saude.csv", [
        ["Pet", "Tutor", "Tipo", "Nome", "Aplicado em", "Vence em", "Observações"],
        ...saude.map((s): Cel[] => [s.pets?.nome ?? "", tutorDe(s.pets), rotulo(TIPO_SAUDE, s.tipo), s.nome, quando(s.aplicado_em), quando(s.vence_em), s.obs ?? ""]),
      ]);

      // a equipe vem antes para dar nome a quem marcou e a quem lançou; o arquivo dela sai na ordem dos assuntos
      const equipeLida = await lerEquipe(sb, id);
      if (equipeLida.error) throw new Error(equipeLida.error.message);
      const equipe = equipeLida.data ?? [];
      const quem = new Map(equipe.filter((p) => p.user_id).map((p) => [p.user_id!, p.nome]));
      const autor = (userId: string | null, origem: string) =>
        origem === "assistente" ? `${(userId && quem.get(userId)) || "Alguém"}, pelo Mozart` : (userId && quem.get(userId)) || "";

      etapa("agendamentos");
      const agendamentos = await todas<AgendamentoLido>((a, b) => sb.from("agendamentos")
        .select("inicio, fim, status, preco, obs, origem, criado_por, leva_traz, endereco_leva_traz, pacote_cliente_id, pets(nome, clientes(nome, telefone)), servicos(nome), profissionais(nome), agendamento_servicos(preco, ordem, servicos(nome))")
        .eq("petshop_id", id).order("inicio").order("id").range(a, b));
      tabelas.set("agendamentos.csv", [
        ["Dia", "Começa", "Termina", "Pet", "Tutor", "Telefone do tutor", "Serviço", "Profissional", "Situação", "Preço", "Usou pacote", "Leva e traz", "Endereço do leva e traz", "Observações", "Marcado por", "Outros serviços no mesmo horário", "Preço dos outros serviços"],
        ...agendamentos.map((g): Cel[] => [
          dataCompleta(g.inicio), hora(g.inicio), hora(g.fim), g.pets?.nome ?? "", tutorDe(g.pets), fmtTelefone(g.pets?.clientes?.telefone), g.servicos?.nome ?? "", g.profissionais?.nome ?? "",
          STATUS_AGENDAMENTO[g.status]?.rotulo ?? g.status, dinheiro(g.preco), simNao(Boolean(g.pacote_cliente_id)), simNao(g.leva_traz), g.endereco_leva_traz ?? "", g.obs ?? "",
          // quem marcou: o nome de quem estava logado; pelo link, foi o próprio cliente
          g.origem === "link" ? rotulo(ORIGEM, g.origem) : autor(g.criado_por, g.origem),
          // horário com mais de um serviço: os outros, na ordem, e a soma dos preços deles
          [...(g.agendamento_servicos ?? [])].sort((x, y) => x.ordem - y.ordem).map((o) => o.servicos?.nome ?? "Serviço").join(" + "),
          g.agendamento_servicos?.length ? dinheiro(Math.round(g.agendamento_servicos.reduce((t, o) => t + Number(o.preco ?? 0), 0) * 100) / 100) : "",
        ]),
      ]);

      etapa("lançamentos");
      const lancamentos = await todas<Lancamento>((a, b) => sb.from("lancamentos").select("*").eq("petshop_id", id).order("data").order("criado_em").order("id").range(a, b));
      etapa("caixas");
      const caixas = await todas<Caixa>((a, b) => sb.from("caixas").select("*").eq("petshop_id", id).order("aberto_em").order("id").range(a, b));
      const caixaPorId = new Map(caixas.map((c) => [c.id, c]));
      const qtd = (x: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
      tabelas.set("lancamentos.csv", [
        ["Data", "Hora do lançamento", "Tipo", "Categoria", "Descrição", "Cliente", "Itens", "Forma", "Partes do pagamento", "Valor", "Pago", "Vencimento", "Movimento de gaveta", "Caixa aberto em", "Quem lançou", "Valor cheio da conta (recebida em partes)"],
        ...lancamentos.map((l): Cel[] => [
          dataCompleta(l.data), hora(l.criado_em), l.tipo === "entrada" ? "Entrada" : "Saída", categoriaAtual(l.categoria), l.descricao ?? "",
          l.cliente_id ? nomeCliente.get(l.cliente_id) ?? "" : "",
          itensDoLancamento(l).map((i) => `${qtd(i.qtd)} x ${i.nome} (${brl(i.valor)} cada)`).join(" | "),
          l.forma ? textoDoPagamento({ ...l, pagamentos: null }) : "",
          partesPorForma(l).length > 1 ? textoDoPagamento(l) : "",
          dinheiroCsv(l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)),
          simNao(l.pago), quando(l.vencimento), nomeDoMovimento(l.movimento),
          l.caixa_id ? quando(caixaPorId.get(l.caixa_id)?.aberto_em) : "", autor(l.criado_por, l.origem),
          l.valor_original != null ? dinheiroCsv(Number(l.valor_original)) : "",
        ]),
      ]);
      const doCaixa = new Map<string, Lancamento[]>();
      for (const l of lancamentos) if (l.caixa_id && l.pago) doCaixa.set(l.caixa_id, [...(doCaixa.get(l.caixa_id) ?? []), l]);
      tabelas.set("caixas.csv", [
        ["Aberto em", "Fechado em", "Troco inicial", "Entradas", ...FORMAS.map((f) => `Entradas em ${f.rotulo.toLowerCase()}`), "Saídas", "Saídas em dinheiro",
          "Colocado na gaveta (suprimento)", "Tirado da gaveta (sangria)", "Dinheiro esperado na gaveta", "Dinheiro contado", "Diferença", "Observação"],
        ...caixas.map((c): Cel[] => {
          const r = resumoDoCaixa(c.valor_inicial, doCaixa.get(c.id) ?? []);
          // caixa fechado: vale o dinheiro esperado que o banco anotou na hora de fechar
          const esperado = c.fechado_em && c.valor_esperado != null ? Number(c.valor_esperado) : r.esperado;
          return [
            quando(c.aberto_em), c.fechado_em ? quando(c.fechado_em) : "Ainda aberto", dinheiro(c.valor_inicial), dinheiro(r.entrou), ...r.porForma.map((f) => dinheiro(f.entrou)),
            dinheiro(r.saiu), dinheiro(r.porForma.find((f) => f.id === "dinheiro")?.saiu ?? 0), dinheiro(r.suprimentos), dinheiro(r.sangrias), dinheiro(esperado),
            dinheiro(c.valor_contado), c.valor_contado == null ? "" : dinheiro(Math.round((Number(c.valor_contado) - esperado) * 100) / 100), c.obs ?? "",
          ];
        }),
      ]);

      etapa("produtos");
      const produtos = await comCustos(sb, id, await todas<ProdutoLido>((a, b) => sb.from("produtos").select(COLS_PRODUTO).eq("petshop_id", id).order("nome").order("id").range(a, b)));
      const nomeProduto = new Map(produtos.map((p) => [p.id, p]));
      const fornecedores = await todas<FornecedorLido>((a, b) => sb.from("fornecedores").select("id, nome, telefone, observacoes, ativo, criado_em").eq("petshop_id", id).order("nome").order("id").range(a, b));
      const nomeFornecedor = new Map(fornecedores.map((f) => [f.id, f.nome]));
      // colunas novas sempre no fim, para quem já usa a planilha antiga
      tabelas.set("produtos.csv", [
        ["Produto", "Categoria", "Unidade", "Preço de venda", "Custo", "Em estoque", "Estoque mínimo", "Ativo", "Criado em", "Código de barras", "Último custo", "Último fornecedor"],
        ...produtos.map((p): Cel[] => [p.nome, p.categoria ?? "", p.unidade, dinheiro(p.preco_venda), dinheiro(p.custo), numero(p.estoque), numero(p.estoque_minimo), simNao(p.ativo), quando(p.criado_em),
          p.codigo_barras ?? "", dinheiro(p.ultimo_custo), (p.fornecedor_id && nomeFornecedor.get(p.fornecedor_id)) || ""]),
      ]);

      etapa("movimentos de estoque");
      const movimentosSemCusto = await todas<MovimentoLido>((a, b) => sb.from("movimentos_estoque").select(COLS_MOVIMENTO).eq("petshop_id", id).order("criado_em").order("id").range(a, b));
      const custoDoMovimento = await custosDeTodosOsMovimentos(sb, id, movimentosSemCusto);
      tabelas.set("movimentos-de-estoque.csv", [
        ["Quando", "Produto", "Tipo", "Quantidade", "Unidade", "Custo por unidade", "Motivo", "Quem fez", "Fornecedor"],
        ...movimentosSemCusto.map((m): Cel[] => [
          quando(m.criado_em), nomeProduto.get(m.produto_id)?.nome ?? "", rotulo(TIPO_MOVIMENTO, m.tipo), numero(m.quantidade), nomeProduto.get(m.produto_id)?.unidade ?? "",
          dinheiro(custoDoMovimento.get(m.id)), m.motivo ?? "", autor(m.criado_por, m.origem), (m.fornecedor_id && nomeFornecedor.get(m.fornecedor_id)) || "",
        ]),
      ]);

      etapa("fornecedores");
      tabelas.set("fornecedores.csv", [
        ["Fornecedor", "WhatsApp", "Observações", "Na lista", "Criado em"],
        ...fornecedores.map((f): Cel[] => [f.nome, fmtTelefone(f.telefone), f.observacoes ?? "", simNao(f.ativo), quando(f.criado_em)]),
      ]);

      etapa("pacotes");
      const modelos = await todas<PacoteLido>((a, b) => sb.from("pacotes").select(`${COLS_PACOTE}, servicos(nome)`).eq("petshop_id", id).order("nome").order("id").range(a, b));
      etapa("pacotes vendidos");
      const vendidos = await todas<PacoteVendidoLido>((a, b) => sb.from("pacotes_clientes").select(`${COLS_PACOTE_CLIENTE}, pets(nome, clientes(nome)), servicos(nome)`)
        .eq("petshop_id", id).order("comprado_em").order("id").range(a, b));
      const preco = new Map((await comPrecosDePacote(sb, id, [...modelos.map((p) => ({ id: p.id })), ...vendidos.map((p) => ({ id: p.id }))])).map((p) => [p.id, p.preco]));
      tabelas.set("pacotes.csv", [
        ["Pacote", "Serviço", "Quantidade", "Preço", "Validade (dias)", "Ativo", "Criado em"],
        ...modelos.map((p): Cel[] => [p.nome, p.servicos?.nome ?? "", numero(p.quantidade), dinheiro(preco.get(p.id)), numero(p.validade_dias), simNao(p.ativo), quando(p.criado_em)]),
      ]);
      tabelas.set("pacotes-vendidos.csv", [
        ["Pacote", "Pet", "Tutor", "Serviço", "Total", "Usados", "Restam", "Preço", "Comprado em", "Vence em", "Ativo"],
        ...vendidos.map((p): Cel[] => [
          p.nome, p.pets?.nome ?? "", tutorDe(p.pets), p.servicos?.nome ?? "", numero(p.total), numero(p.usados), numero(Math.max(0, p.total - p.usados)), dinheiro(preco.get(p.id)),
          quando(p.comprado_em), quando(p.vence_em), simNao(p.ativo),
        ]),
      ]);

      etapa("creche e hotel");
      const estadias = await comValoresDeEstadia(sb, id, await todas<EstadiaLida>((a, b) => sb.from("estadias").select(`${COLS_ESTADIA}, pets(nome, clientes(nome, telefone))`).eq("petshop_id", id).order("entrada").order("id").range(a, b) as never));
      // o sinal da reserva fica à parte da estadia (só quem recebe lê): a cópia é do dono, que lê tudo
      const sinais = await todas<SinalLido>((a, b) => sb.from("estadias_valores").select("estadia_id, sinal, sinal_estado, sinal_recebido").eq("petshop_id", id).order("estadia_id").range(a, b));
      const sinalDe = new Map(sinais.map((v) => [v.estadia_id, v]));
      const acomodacoes = new Map(acomodacoesDe(petshop).lista.map((a) => [a.id, a.nome]));
      tabelas.set("estadias.csv", [
        ["Tipo", "Pet", "Tutor", "Telefone do tutor", "Entrada", "Saída prevista", "Saída", "Situação", "Valor da diária", "Diárias cobradas", "Valor cobrado", "Observações",
          "Mensalista", "Acomodação", "Sinal da reserva", "Situação do sinal", "Sinal já recebido"],
        ...estadias.map((e): Cel[] => {
          const v = sinalDe.get(e.id);
          return [
            rotulo(TIPO_ESTADIA, e.tipo), e.pets?.nome ?? "", tutorDe(e.pets), fmtTelefone(e.pets?.clientes?.telefone), quando(e.entrada), quando(e.saida_prevista), quando(e.saida),
            rotulo(STATUS_ESTADIA, e.status), dinheiro(e.valor_diaria), numero(e.diarias_cobradas), dinheiro(e.valor_cobrado), e.obs ?? "",
            rotulo(MENSALISTA, e.mensalista), e.acomodacao ? acomodacoes.get(e.acomodacao) ?? e.acomodacao : "",
            v?.sinal_estado ? dinheiro(v.sinal) : "", rotulo(SINAL, v?.sinal_estado ?? e.sinal_estado), v?.sinal_estado ? dinheiro(v.sinal_recebido) : "",
          ];
        }),
      ]);

      etapa("mensalistas da creche");
      const planos = await todas<PlanoLido>((a, b) => sb.from("creche_planos").select("id, dias, vence_dia, inicio, fim, pausa_de, pausa_ate, obs, pets(nome, clientes(nome, telefone))").eq("petshop_id", id).order("inicio").order("id").range(a, b));
      const valores = await todas<PlanoValorLido>((a, b) => sb.from("creche_planos_valores").select("plano_id, valor_mensal, valor_extra").eq("petshop_id", id).order("plano_id").range(a, b));
      const valorDoPlano = new Map(valores.map((v) => [v.plano_id, v]));
      tabelas.set("mensalistas.csv", [
        ["Pet", "Tutor", "Telefone do tutor", "Dias da semana", "Valor do mês", "Valor do dia extra", "Vence todo dia", "Começou em", "Terminou em", "Pausa de", "Pausa até", "Observações"],
        ...planos.map((pl): Cel[] => [
          pl.pets?.nome ?? "", tutorDe(pl.pets), fmtTelefone(pl.pets?.clientes?.telefone), [...pl.dias].sort((x, y) => x - y).map((n) => DIAS_DA_SEMANA[n] ?? String(n)).join(", "),
          dinheiro(valorDoPlano.get(pl.id)?.valor_mensal), dinheiro(valorDoPlano.get(pl.id)?.valor_extra), numero(pl.vence_dia), quando(pl.inicio), quando(pl.fim), quando(pl.pausa_de), quando(pl.pausa_ate), pl.obs ?? "",
        ]),
      ]);

      etapa("mensalidades da creche");
      const cobrancas = await todas<CobrancaLida>((a, b) => sb.from("creche_cobrancas").select("mes, valor_mensal, valor_extras, desconto, total, vencimento, status, lancamento_id, obs, extras, pets(nome, clientes(nome, telefone))").eq("petshop_id", id).order("mes").order("id").range(a, b));
      const contaPorId = new Map(lancamentos.map((l) => [l.id, l]));
      tabelas.set("mensalidades.csv", [
        ["Mês", "Pet", "Tutor", "Mensalidade", "Dias extras", "Valor dos dias extras", "Desconto", "Total", "Vencimento", "Situação", "Falta receber", "Observações"],
        ...cobrancas.map((c): Cel[] => {
          const conta = c.lancamento_id ? contaPorId.get(c.lancamento_id) : undefined;
          const paga = Boolean(conta?.pago);
          return [
            dataCompleta(c.mes).slice(3), c.pets?.nome ?? "", tutorDe(c.pets), dinheiro(c.valor_mensal), numero(Array.isArray(c.extras) ? c.extras.length : 0), dinheiro(c.valor_extras), dinheiro(c.desconto), dinheiro(c.total),
            quando(c.vencimento), c.status === "cancelada" ? "Cancelada" : paga ? "Paga" : "Em aberto", c.status === "cancelada" || paga ? "" : dinheiro(conta ? Number(conta.valor) : Number(c.total)), c.obs ?? "",
          ];
        }),
      ]);

      etapa("equipe");
      tabelas.set("equipe.csv", [
        ["Nome", "Função", "Papel", "Atende na agenda", "Áreas que abre", "Recebe no caixa", "Vê o financeiro", "Comissão (%)", "Tem acesso ao sistema", "E-mail do convite", "Ativo", "Na equipe desde"],
        ...equipe.map((p): Cel[] => {
          // o acesso que vale de verdade: "Vê o financeiro" é só para quem abre Financeiro ou Relatórios (quem só recebe no caixa fica como Não)
          const areas = areasDe(p);
          return [
            p.nome, p.funcao ?? "", rotulo(PAPEL, p.papel), simNao(p.atende), AREAS.filter((a) => areas.includes(a.id)).map((a) => a.rotulo).join(", "),
            simNao(areas.includes("caixa")), simNao(areas.includes("financeiro") || areas.includes("relatorios")), numero(p.comissao_pct), simNao(Boolean(p.user_id)),
            p.email_convite ?? "", simNao(p.ativo), quando(p.criado_em),
          ];
        }),
      ]);

      etapa("comissões pagas");
      const pagas = await todas<ComissaoPagaLida>((a, b) => sb.from("comissoes_pagas").select("profissional_id, de, ate, valor, pago_em").eq("petshop_id", id).order("de").order("id").range(a, b));
      const nomeDaPessoa = new Map(equipe.map((x) => [x.id, x.nome]));
      tabelas.set("comissoes-pagas.csv", [
        ["Pessoa", "Período de", "Período até", "Valor pago", "Marcada como paga em"],
        ...pagas.map((g): Cel[] => [nomeDaPessoa.get(g.profissional_id) ?? "", quando(g.de), quando(g.ate), dinheiro(g.valor), quando(g.pago_em)]),
      ]);

      etapa("serviços");
      const servicos = await todas<Servico>((a, b) => sb.from("servicos").select("*").eq("petshop_id", id).order("ordem").order("id").range(a, b));
      tabelas.set("servicos.csv", [
        ["Serviço", "Tipo", "Duração (minutos)", "Preço P", "Preço M", "Preço G", "Preço GG", "Ativo"],
        ...servicos.map((s): Cel[] => [s.nome, rotulo(TIPO_SERVICO, s.categoria), numero(s.duracao_min), dinheiro(s.preco_p), dinheiro(s.preco_m), dinheiro(s.preco_g), dinheiro(s.preco_gg), simNao(s.ativo)]),
      ]);

      fazendo = "o arquivo";
      setPasso({ n: total, texto: "Fechando o arquivo…" });
      const agora = new Date();
      const linhas = new Map<NomeArquivo, number>(ASSUNTOS.map((a) => [a.arquivo, (tabelas.get(a.arquivo)?.length ?? 1) - 1]));
      const arquivos: ArquivoZip[] = [
        { nome: "LEIA-ME.txt", conteudo: leiaMe(petshop.nome, agora, linhas) },
        ...ASSUNTOS.map((a) => ({ nome: a.arquivo, conteudo: textoCsv(tabelas.get(a.arquivo) ?? []) })),
      ];
      const zip = montarZip(arquivos, agora);
      const apelido = semAcento(petshop.nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "pet-shop";
      const nomeDoArquivo = `maestro-${apelido}-${isoDia(agora)}.zip`;
      baixarArquivo(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }), nomeDoArquivo);
      setFeita(`Cópia de ${dataCompleta(agora)} às ${hora(agora)} baixada: ${nomeDoArquivo}`);
      avisar("Cópia baixada. Guarde em um lugar seguro.");
    } catch (e) {
      setErro(`Não deu para montar a cópia: parou ao juntar ${fazendo || "os dados"}. ${mensagemDeErro(e)} Nada foi baixado.`);
    } finally {
      setPasso(null);
    }
  }

  return (
    <section className="g-card gj-copia" aria-busy={Boolean(passo)}>
      <div className="g-card-t"><h3><Tile icone={Archive} tom="ceu" tamanho="p" />Cópia de segurança</h3></div>
      <p className="g-muted g-p">
        Baixe um arquivo com os dados do seu pet shop para guardar com você: clientes, pets, agenda, financeiro, caixas, estoque, pacotes, creche e hotel (com os mensalistas e as mensalidades), equipe, comissões pagas e serviços.
        Vem tudo em planilhas, que abrem no Excel e no Google Planilhas.
      </p>
      <p className="g-muted g-pp">
        É uma cópia para guardar e consultar. Ainda não dá para trazer esses dados de volta para o Maestro automaticamente. As fotos não entram.
      </p>
      <div className="gj-copia-acao">
        <button type="button" className="g-btn sec" onClick={() => void baixar()} disabled={Boolean(passo)}><Download />{passo ? "Montando a cópia…" : "Baixar cópia"}</button>
        {passo && (
          <div className="gj-copia-anda" role="status" aria-live="polite">
            <span>{passo.texto}</span>
            <div className="gj-copia-barra" aria-hidden><i style={{ width: `${Math.round((passo.n / total) * 100)}%` }} /></div>
          </div>
        )}
      </div>
      {feita && !passo && <p className="g-muted g-pp gj-copia-feita" role="status">{feita}</p>}
      {erro && <p className="g-erro" role="alert">{erro}</p>}
    </section>
  );
}
