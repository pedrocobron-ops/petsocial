"use client";

import { useState } from "react";
import { Archive, Download } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AREAS, areasDe } from "@/lib/gestao/acessos";
import { Tile } from "@/components/gestao/painel";
import { mensagemDeErro, useAvisos } from "@/components/gestao/ui";
import { ESPECIES, nomePorte } from "@/components/gestao/clientes/comum";
import {
  baixarArquivo, categoriaAtual, textoDaAlteracao, dinheiroCsv, numeroCsv, paginar, resumoDoCaixa, rotuloForma, textoCsv, type Cel,
} from "@/components/gestao/financeiro/comum";
import { itensDoLancamento, nomeDoMovimento, partesPorForma, textoDoPagamento } from "@/lib/gestao/dinheiro";
import {
  COLS_MOVIMENTO, COLS_PACOTE, COLS_PACOTE_CLIENTE, COLS_PRODUTO, comCustos, custosDeTodosOsMovimentos, comPrecosDePacote, lerEquipe, COLS_ESTADIA, comValoresDeEstadia,
  comPrecosDeAgendamento, comPrecosDeProduto, COLS_SERVICO, comPrecosDeServico,
} from "@/lib/gestao/reservado";
import { FORMAS, STATUS_AGENDAMENTO, type AlteracaoLancamento, type Caixa, type Cliente, type Estadia, type Lancamento, type Pet, type Servico, type StatusAgendamento } from "@/lib/gestao/tipos";
import { brl, dataCompleta, fmtTelefone, hora, isoDia, semAcento } from "@/lib/gestao/util";
import { montarZip, type ArquivoZip } from "@/lib/gestao/zip";
import { acomodacoesDe } from "@/lib/gestao/hotel-opcoes";
import { cobradoPorItem } from "@/lib/gestao/loja-vendas";
import { CATEGORIAS_DEVOLUCAO } from "@/lib/gestao/faturamento";
import "./copia-seguranca.css";

/* ---------- o que vem do banco ---------- */

type Tutor = { nome: string; telefone?: string | null } | null;
type DoPet = { nome: string; clientes: Tutor } | null;
type PetLido = Pet & { clientes: Tutor };
type SaudeLida = { tipo: string; nome: string; aplicado_em: string | null; vence_em: string | null; obs: string | null; criado_em: string; pets: DoPet };
type AgendamentoLido = {
  id: string; inicio: string; fim: string; status: StatusAgendamento; preco: number | null; obs: string | null; origem: string; criado_por: string | null; leva_traz: boolean;
  endereco_leva_traz: string | null; pacote_cliente_id: string | null; pets: DoPet; servicos: { nome: string } | null; profissionais: { nome: string } | null;
  agendamento_servicos?: { id: string; preco: number | null; ordem: number; servicos: { nome: string } | null }[] | null;
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
  extras: unknown; taxas?: unknown; pets: DoPet;
};
type RetiradaLida = { estadia_id: string; quem: string; nome: string; relacao: string | null };
type DiarioLido = { dia: string; itens: unknown; nota: string | null; enviado_em: string | null; atualizado_nome: string | null; estadias: { tipo: string; pets: DoPet } | null };
type OcorrenciaLida = { tipo: string; texto: string; quando: string; criado_nome: string | null; estadias: { tipo: string } | null; pets: DoPet };
type EsperaLida = { tipo: string; entrada: string; saida: string; pet_nome: string; tutor_nome: string | null; telefone: string | null; obs: string | null; origem: string; status: string; chamado_em: string | null; criado_em: string; criado_nome: string | null; termos_aceitos_em: string | null };
type PedidoLido = { tutor_nome: string; telefone: string; pet_nome: string; tipo: string; inicio: string; fim: string | null; obs: string | null; status: string; criado_em: string; termos_aceitos_em: string | null; termos_texto: string | null; termos_vacinas: boolean | null; cliente_cancelou_em: string | null; cliente_pediu: string | null; cliente_pediu_em: string | null; cliente_recado: string | null; servicos: { nome: string } | null };
type DiaEspecialLido = { dia: string; nome: string; fechado: boolean; feriado: boolean };
type ComissaoPagaLida = { profissional_id: string; de: string; ate: string; valor: number; pago_em: string };
type BoletimLido = { criado_em: string; enviado_em: string | null; expira_em: string; fotos: string[] | null; agendamento_id: string | null; estadia_id: string | null; texto: string | null; pets: DoPet };
type AutorizacaoLida = { autorizado_em: string; escopo: string; marcar: string | null; texto: string; retirado_em: string | null; retirado_motivo: string | null; pets: DoPet };

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
const TIPO_SERVICO: Record<string, string> = { banho: "Banho", tosa: "Tosa", banho_tosa: "Banho e tosa", creche: "Creche", hotel: "Hotel", outro: "Outro", loja: "Loja" };
const PAPEL: Record<string, string> = { dono: "Dono ou sócio", gerente: "Gerente", funcionario: "Funcionário" };
const ORIGEM: Record<string, string> = { tela: "", assistente: "Pelo Mozart", link: "Link de agendamento" };
const SEXO: Record<string, string> = { M: "Macho", F: "Fêmea" };
const MENSALISTA: Record<string, string> = { plano: "Dia do plano", extra: "Dia extra", reposicao: "Reposição de falta" };
const SINAL: Record<string, string> = { a_receber: "A receber", pago: "Pago", devolvido: "Devolvido", mantido: "Não devolvido" };
const QUEM_BUSCOU: Record<string, string> = { tutor: "tutor", autorizado: "autorizado", outro: "outra pessoa" };
const TIPO_OCORRENCIA: Record<string, string> = { briga: "Briga", machucado: "Machucado", fugiu: "Fugiu", vomitou: "Vomitou", outro: "Outro" };
const STATUS_ESPERA: Record<string, string> = { esperando: "Esperando", chamado: "Avisado da vaga", atendido: "Virou reserva", desistiu: "Saiu da lista" };
const STATUS_PEDIDO: Record<string, string> = { pendente: "Esperando resposta", aceito: "Aceito", recusado: "Recusado ou cancelado" };
const TIPO_PEDIDO: Record<string, string> = { servico: "Banho e tosa", creche: "Creche", hotel: "Hotel" };
const PEDIU: Record<string, string> = { cancelar: "Pediu para cancelar", mudar: "Pediu outra data" };
/** Tabela ou coluna que ainda não existe (banco antes da atualização) vira lista vazia: a cópia não para por causa dela. */
async function seExistir<T>(ler: () => Promise<T[]>): Promise<T[]> { try { return await ler(); } catch { return []; } }
const DIAS_DA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const rotulo = (mapa: Record<string, string>, v: string | null | undefined) => (v == null ? "" : mapa[v] ?? v);

/** Os assuntos da cópia, na ordem em que são juntados. O texto também vai no LEIA-ME. */
const ASSUNTOS = [
  { arquivo: "clientes.csv", nome: "clientes", explica: "Os tutores: nome, telefone, e-mail, endereço e observações." },
  { arquivo: "pets.csv", nome: "pets", explica: "Os pets, cada um com o nome do tutor, espécie, raça, porte, alertas e observações." },
  { arquivo: "cuidados-de-saude.csv", nome: "cuidados de saúde", explica: "Vacinas, vermífugos, antipulgas e outros cuidados anotados na ficha de cada pet." },
  { arquivo: "agendamentos.csv", nome: "agendamentos", explica: "Todos os horários da agenda, com pet, tutor, serviço (e os outros serviços do mesmo horário), profissional, situação e preço." },
  { arquivo: "vendas.csv", nome: "vendas", explica: "Cada item vendido ou cobrado (produto, serviço, pacote): dia da venda, cliente, quantidade, preço da lista e, nas últimas colunas, o desconto do item e o que foi cobrado de verdade (a soma de Total cobrado é o que entrou), o vencimento de quem ficou de pagar e o que voltou em troca ou devolução. A forma mostra cada parte do pagamento dividido. Linha negativa (promoção, sinal, crédito) já está repartida nas outras: o cobrado dela é zero. Vem dos lançamentos que têm itens." },
  { arquivo: "lancamentos.csv", nome: "lançamentos", explica: "O financeiro: tudo o que entrou e saiu, as contas a pagar e a receber. Saídas aparecem com valor negativo. Sangria e suprimento aparecem com o tipo Gaveta: mexem só no dinheiro da gaveta e não entram no resultado (veja a coluna Entra no resultado). Conta recebida em partes: cada parte é uma linha, e a linha da conta traz o valor cheio na coluna Valor cheio." },
  { arquivo: "caixas.csv", nome: "caixas", explica: "Cada caixa aberto e fechado, com o troco, o que entrou e saiu, o dinheiro esperado e o contado." },
  { arquivo: "produtos.csv", nome: "produtos", explica: "Os produtos do estoque, com preço, custo, último custo, código de barras, último fornecedor, quantidade atual e mínima, e os lotes com saldo (lote, validade e quantidade)." },
  { arquivo: "movimentos-de-estoque.csv", nome: "movimentos de estoque", explica: "Cada entrada, saída e correção de saldo dos produtos, com o lote e a validade. Nas saídas, o custo é o do produto naquele momento." },
  { arquivo: "creditos-dos-tutores.csv", nome: "crédito dos tutores", explica: "Cada vez que um tutor ficou com crédito (pagou a mais, sinal de reserva cancelada, devolução de produto) ou usou o crédito, com o saldo depois." },
  { arquivo: "fornecedores.csv", nome: "fornecedores", explica: "Os fornecedores cadastrados, com WhatsApp e observações." },
  { arquivo: "pacotes.csv", nome: "pacotes", explica: "Os pacotes que o pet shop oferece." },
  { arquivo: "pacotes-vendidos.csv", nome: "pacotes vendidos", explica: "Os pacotes comprados por cada pet, com quanto já foi usado e a validade." },
  { arquivo: "estadias.csv", nome: "creche e hotel", explica: "As estadias de creche e hotel, com entrada, saída e valores. Mostra também o dia de mensalista, a acomodação, o sinal da reserva e quem veio buscar (quando foi anotado)." },
  { arquivo: "diario-e-ocorrencias.csv", nome: "diário e ocorrências", explica: "O diário de cada dia de estadia (o que foi marcado e o recado) e as ocorrências anotadas (briga, machucado, fuga, vômito), com quem anotou." },
  { arquivo: "lista-de-espera.csv", nome: "lista de espera", explica: "Quem pediu vaga em dia cheio, pela equipe ou pelo link, e o que aconteceu com o pedido." },
  { arquivo: "pedidos-pelo-link.csv", nome: "pedidos pelo link", explica: "Os pedidos que chegaram pelo link do cliente: para quando, a situação, se o cliente aceitou as regras (com o texto aceito) e se cancelou ou pediu outra data." },
  { arquivo: "dias-fechados.csv", nome: "feriados e dias fechados", explica: "As datas marcadas em Meu pet shop como dia fechado ou feriado." },
  { arquivo: "mensalistas.csv", nome: "mensalistas da creche", explica: "Os planos mensais da creche: pet, dias da semana, valor do mês, valor do dia extra, início e fim." },
  { arquivo: "mensalidades.csv", nome: "mensalidades da creche", explica: "As cobranças de cada mês: mensalidade, dias extras, taxas de busca fora do horário, desconto, total, vencimento, se foi paga e quanto falta." },
  { arquivo: "equipe.csv", nome: "equipe", explica: "As pessoas da equipe, com função, comissão e se têm acesso ao sistema." },
  { arquivo: "comissoes-pagas.csv", nome: "comissões pagas", explica: "Cada comissão marcada como paga: a pessoa, o período, o valor e o dia." },
  { arquivo: "alteracoes-de-valores.csv", nome: "alterações em valores", explica: "O histórico de quem mexeu em dinheiro: valor recebido que foi alterado ou apagado (com o valor de antes) e venda com preço diferente da lista ou com desconto. O lançamento apagado só aparece aqui." },
  { arquivo: "servicos.csv", nome: "serviços", explica: "Os serviços e os preços por porte." },
  { arquivo: "boletins.csv", nome: "boletins", explica: "Os boletins do pet mandados aos tutores: pet, tutor, quando foi feito e mandado, quantas fotos e até quando a página abre. As fotos não entram." },
  { arquivo: "autorizacoes-de-fotos.csv", nome: "autorizações de fotos", explica: "As autorizações dos tutores para postar as fotos dos pets nas redes da loja: o texto exato aceito, quando, quais fotos, o perfil para marcar e quando foi tirada." },
] as const;
type NomeArquivo = (typeof ASSUNTOS)[number]["arquivo"];

function leiaMe(petshop: string, agora: Date, linhas: Map<NomeArquivo, number>) {
  const partes = [
    `LEIA-ME · Todos os dados do pet shop no Maestro Pet Gestão`,
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
    "- Planilhas em UTF-8 com BOM e ponto e vírgula entre as colunas: abrem com acentos certos no Excel.",
    "- A equipe vem sem senhas nem códigos de convite.",
    "- É uma cópia para você guardar e consultar. Ainda não dá para trazer estes arquivos de volta para o Maestro automaticamente.",
    "- As fotos dos pets, do boletim e do diário e o logotipo não entram na cópia.",
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
          p.nascimento?.startsWith("1904-") ? `${p.nascimento.slice(8, 10)}/${p.nascimento.slice(5, 7)}` : quando(p.nascimento), p.alertas ?? "", p.obs ?? "", simNao(p.ativo), quando(isoDia(new Date(p.criado_em))),
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
      // o preço de cada horário (e dos serviços a mais) vem à parte, pela função do banco
      const agendamentos = await comPrecosDeAgendamento(sb, id, await todas<AgendamentoLido>((a, b) => sb.from("agendamentos")
        .select("id, inicio, fim, status, obs, origem, criado_por, leva_traz, endereco_leva_traz, pacote_cliente_id, pets(nome, clientes(nome, telefone)), servicos(nome), profissionais(nome), agendamento_servicos(id, ordem, servicos(nome))")
        .eq("petshop_id", id).order("inicio").order("id").range(a, b)));
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
      // o que entra no resultado do mês (Financeiro): sangria e suprimento só mexem na gaveta; conta em aberto ainda não entrou
      const noResultado = (l: Lancamento) => (l.movimento ? "Não (só mexe na gaveta)" : !l.pago ? "Não (ainda não foi pago)"
        : l.tipo === "saida" && CATEGORIAS_DEVOLUCAO.includes(l.categoria) ? "Sim (devolução: tira do faturamento)" : "Sim");
      tabelas.set("lancamentos.csv", [
        ["Data", "Hora do lançamento", "Tipo", "Categoria", "Descrição", "Cliente", "Itens", "Forma", "Partes do pagamento", "Valor", "Pago", "Vencimento", "Movimento de gaveta", "Caixa aberto em", "Quem lançou", "Valor cheio da conta (recebida em partes)", "Alterado depois de recebido em", "Entra no resultado", "Crédito do tutor usado"],
        ...lancamentos.map((l): Cel[] => [
          dataCompleta(l.data), hora(l.criado_em), l.movimento ? "Gaveta" : l.tipo === "entrada" ? "Entrada" : "Saída", categoriaAtual(l.categoria), l.descricao ?? "",
          l.cliente_id ? nomeCliente.get(l.cliente_id) ?? "" : "",
          itensDoLancamento(l).map((i) => `${qtd(i.qtd)} x ${i.nome} (${brl(i.valor)} cada)`).join(" | "),
          l.forma ? textoDoPagamento({ ...l, pagamentos: null }) : "",
          partesPorForma(l).length > 1 ? textoDoPagamento(l) : "",
          dinheiroCsv(l.tipo === "entrada" ? Number(l.valor) : -Number(l.valor)),
          simNao(l.pago), quando(l.vencimento), nomeDoMovimento(l.movimento),
          l.caixa_id ? quando(caixaPorId.get(l.caixa_id)?.aberto_em) : "", autor(l.criado_por, l.origem),
          l.valor_original != null ? dinheiroCsv(Number(l.valor_original)) : "", quando(l.alterado_em),
          noResultado(l), l.credito_usado ? dinheiroCsv(Number(l.credito_usado)) : "",
        ]),
      ]);
      const quemVendeu = new Map(equipe.map((x) => [x.id, x.nome]));
      // troca e devolução de cada venda, por produto: o que voltou e como (dinheiro, crédito, troca)
      type DevolucaoLida = { venda_id: string | null; modo: string; itens: unknown; criado_em: string; saida_id: string | null; credito_id: string | null };
      const devolucoes = await seExistir(() => todas<DevolucaoLida & { id: string }>((a, b) => sb.from("devolucoes").select("id, venda_id, modo, itens, criado_em, saida_id, credito_id").eq("petshop_id", id).order("criado_em").order("id").range(a, b)));
      const voltou = new Map<string, { qtd: number; valor: number; textos: string[] }>();
      const MODO: Record<string, string> = { dinheiro: "dinheiro devolvido", credito: "virou crédito", troca: "trocado" };
      for (const d of devolucoes) {
        if (!d.venda_id || !(d.saida_id || d.credito_id || d.modo === "troca")) continue;
        for (const i of (Array.isArray(d.itens) ? d.itens : []) as { produto_id?: string; qtd?: number; valor?: number }[]) {
          const k = `${d.venda_id}|${i.produto_id ?? ""}`, x = voltou.get(k) ?? { qtd: 0, valor: 0, textos: [] };
          x.qtd += Number(i.qtd ?? 0); x.valor = Math.round((x.valor + Number(i.valor ?? 0)) * 100) / 100;
          x.textos.push(`${Number(i.qtd ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} em ${dataCompleta(isoDia(new Date(d.criado_em)))} (${MODO[d.modo] ?? d.modo})`);
          voltou.set(k, x);
        }
      }
      tabelas.set("vendas.csv", [
        ["Data", "Item", "Quantidade", "Valor unitário", "Total do item", "Cliente", "Forma", "Pago", "Quem vendeu", "Descrição do lançamento",
          "Desconto no item", "Total cobrado", "Vencimento", "Devolvido (quantidade)", "Devolvido (valor)", "Devolução"],
        // conta recebida em partes: a parte não repete os itens (a conta, com o valor cheio, já traz)
        ...lancamentos.filter((l) => l.tipo === "entrada" && !l.movimento && !l.conta_id).flatMap((l) => cobradoPorItem(l).map((i): Cel[] => {
          const d = i.produto_id ? voltou.get(`${l.id}|${i.produto_id}`) : undefined;
          return [
            // o dia da venda: conta em aberto guarda o vencimento em "data"; vale o dia em que foi anotada
            dataCompleta(l.pago ? l.data : l.devido_desde ?? isoDia(new Date(l.criado_em))), i.nome, numero(i.qtd), dinheiro(i.valor), dinheiro(i.bruto),
            l.cliente_id ? nomeCliente.get(l.cliente_id) ?? "" : "", l.forma ? textoDoPagamento(l) : "", simNao(l.pago),
            (l.vendido_por && quemVendeu.get(l.vendido_por)) || autor(l.criado_por, l.origem), l.descricao ?? "",
            dinheiro(i.desconto), dinheiro(i.cobrado), l.pago ? "" : quando(l.vencimento),
            d ? numero(d.qtd) : "", d ? dinheiro(d.valor) : "", d ? d.textos.join(" | ") : "",
          ];
        })),
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
      const produtos = await comCustos(sb, id, await comPrecosDeProduto(sb, id, await todas<ProdutoLido>((a, b) => sb.from("produtos").select(COLS_PRODUTO).eq("petshop_id", id).order("nome").order("id").range(a, b))));
      const nomeProduto = new Map(produtos.map((p) => [p.id, p]));
      const fornecedores = await todas<FornecedorLido>((a, b) => sb.from("fornecedores").select("id, nome, telefone, observacoes, ativo, criado_em").eq("petshop_id", id).order("nome").order("id").range(a, b));
      const nomeFornecedor = new Map(fornecedores.map((f) => [f.id, f.nome]));
      // colunas novas sempre no fim, para quem já usa a planilha antiga
      // lotes e validade (estoque com Controlar validade, ou lote anotado na entrada)
      type LoteLido = { id: string; produto_id: string; lote: string | null; validade: string | null; quantidade: number };
      const lotes = await seExistir(() => todas<LoteLido>((a, b) => sb.from("produtos_lotes").select("id, produto_id, lote, validade, quantidade").eq("petshop_id", id).order("validade", { nullsFirst: false }).order("id").range(a, b)));
      const loteDe = new Map(lotes.map((l) => [l.id, l]));
      const nomeDoLote = (l: Pick<LoteLido, "lote" | "validade">) => [l.lote ? `lote ${l.lote}` : "", l.validade ? `validade ${dataCompleta(l.validade)}` : ""].filter(Boolean).join(", ");
      const lotesDoProduto = new Map<string, string[]>();
      for (const l of lotes) if (Number(l.quantidade) > 0) lotesDoProduto.set(l.produto_id, [...(lotesDoProduto.get(l.produto_id) ?? []), `${nomeDoLote(l)}: ${Number(l.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}`]);
      tabelas.set("produtos.csv", [
        ["Produto", "Categoria", "Unidade", "Preço de venda", "Custo", "Em estoque", "Estoque mínimo", "Ativo", "Criado em", "Código de barras", "Último custo", "Último fornecedor", "Lotes com saldo"],
        ...produtos.map((p): Cel[] => [p.nome, p.categoria ?? "", p.unidade, dinheiro(p.preco_venda), dinheiro(p.custo), numero(p.estoque), numero(p.estoque_minimo), simNao(p.ativo), quando(p.criado_em),
          p.codigo_barras ?? "", dinheiro(p.ultimo_custo), (p.fornecedor_id && nomeFornecedor.get(p.fornecedor_id)) || "", (lotesDoProduto.get(p.id) ?? []).join(" | ")]),
      ]);

      etapa("movimentos de estoque");
      const movimentosSemCusto = await todas<MovimentoLido>((a, b) => sb.from("movimentos_estoque").select(COLS_MOVIMENTO).eq("petshop_id", id).order("criado_em").order("id").range(a, b));
      const custoDoMovimento = await custosDeTodosOsMovimentos(sb, id, movimentosSemCusto);
      // em quais lotes cada movimento mexeu (a saída pode tirar de mais de um lote)
      const movLotes = await seExistir(() => todas<{ id: string; movimento_id: string; lote_id: string; quantidade: number }>((a, b) => sb.from("movimentos_lotes").select("id, movimento_id, lote_id, quantidade").eq("petshop_id", id).order("criado_em").order("id").range(a, b)));
      const lotesDoMov = new Map<string, string[]>();
      for (const x of movLotes) {
        const l = loteDe.get(x.lote_id);
        if (l) lotesDoMov.set(x.movimento_id, [...(lotesDoMov.get(x.movimento_id) ?? []), `${nomeDoLote(l)}: ${Math.abs(Number(x.quantidade)).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}`]);
      }
      tabelas.set("movimentos-de-estoque.csv", [
        ["Quando", "Produto", "Tipo", "Quantidade", "Unidade", "Custo por unidade", "Motivo", "Quem fez", "Fornecedor", "Lote e validade"],
        ...movimentosSemCusto.map((m): Cel[] => [
          quando(m.criado_em), nomeProduto.get(m.produto_id)?.nome ?? "", rotulo(TIPO_MOVIMENTO, m.tipo), numero(m.quantidade), nomeProduto.get(m.produto_id)?.unidade ?? "",
          dinheiro(custoDoMovimento.get(m.id)), m.motivo ?? "", autor(m.criado_por, m.origem), (m.fornecedor_id && nomeFornecedor.get(m.fornecedor_id)) || "",
          (lotesDoMov.get(m.id) ?? []).join(" | "),
        ]),
      ]);

      etapa("crédito dos tutores");
      type CreditoLido = { id: string; cliente_id: string; valor: number; motivo: string | null; criado_em: string; estadia_id: string | null; lancamento_id: string | null };
      const creditos = await seExistir(() => todas<CreditoLido>((a, b) => sb.from("clientes_creditos").select("id, cliente_id, valor, motivo, criado_em, estadia_id, lancamento_id").eq("petshop_id", id).order("criado_em").order("id").range(a, b)));
      const saldo = new Map<string, number>();
      tabelas.set("creditos-dos-tutores.csv", [
        ["Quando", "Tutor", "Movimento", "Valor", "Saldo do tutor depois", "Motivo"],
        ...creditos.map((c): Cel[] => {
          const s = Math.round(((saldo.get(c.cliente_id) ?? 0) + Number(c.valor)) * 100) / 100;
          saldo.set(c.cliente_id, s);
          return [quando(c.criado_em), nomeCliente.get(c.cliente_id) ?? "", Number(c.valor) >= 0 ? "Ficou de crédito" : "Usou o crédito", dinheiroCsv(Number(c.valor)), dinheiroCsv(s), c.motivo ?? ""];
        }),
      ]);
      const sinalVirouCredito = new Set(creditos.filter((c) => c.estadia_id && Number(c.valor) > 0).map((c) => c.estadia_id!));

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
      const retiradas = await seExistir(() => todas<RetiradaLida>((a, b) => sb.from("estadias_retiradas").select("estadia_id, quem, nome, relacao").eq("petshop_id", id).order("estadia_id").range(a, b)));
      const buscou = new Map(retiradas.map((r) => [r.estadia_id, `${r.nome} (${[rotulo(QUEM_BUSCOU, r.quem), r.relacao].filter(Boolean).join(", ")})`]));

      tabelas.set("estadias.csv", [
        ["Tipo", "Pet", "Tutor", "Telefone do tutor", "Entrada", "Saída prevista", "Saída", "Situação", "Valor da diária", "Diárias cobradas", "Valor cobrado", "Observações",
          "Mensalista", "Acomodação", "Sinal da reserva", "Situação do sinal", "Sinal já recebido", "Quem veio buscar"],
        ...estadias.map((e): Cel[] => {
          const v = sinalDe.get(e.id);
          return [
            rotulo(TIPO_ESTADIA, e.tipo), e.pets?.nome ?? "", tutorDe(e.pets), fmtTelefone(e.pets?.clientes?.telefone), quando(e.entrada), quando(e.saida_prevista), quando(e.saida),
            rotulo(STATUS_ESTADIA, e.status), dinheiro(e.valor_diaria), numero(e.diarias_cobradas), dinheiro(e.valor_cobrado), e.obs ?? "",
            rotulo(MENSALISTA, e.mensalista), e.acomodacao ? acomodacoes.get(e.acomodacao) ?? e.acomodacao : "",
            v?.sinal_estado ? dinheiro(v.sinal) : "",
            // sinal de reserva cancelada que ficou de crédito para o tutor
            (v?.sinal_estado ?? e.sinal_estado) === "mantido" && e.status === "cancelada" && sinalVirouCredito.has(e.id) ? "Virou crédito do tutor" : rotulo(SINAL, v?.sinal_estado ?? e.sinal_estado), v?.sinal_estado ? dinheiro(v.sinal_recebido) : "", buscou.get(e.id) ?? "",
          ];
        }),
      ]);

      etapa("diário e ocorrências");
      const diarios = await seExistir(() => todas<DiarioLido>((a, b) => sb.from("estadias_diario").select("dia, itens, nota, enviado_em, atualizado_nome, estadias(tipo, pets(nome, clientes(nome, telefone)))").eq("petshop_id", id).order("dia").order("id").range(a, b) as never));
      const ocorrencias = await seExistir(() => todas<OcorrenciaLida>((a, b) => sb.from("estadias_ocorrencias").select("tipo, texto, quando, criado_nome, estadias(tipo), pets(nome, clientes(nome, telefone))").eq("petshop_id", id).order("quando").order("id").range(a, b) as never));
      tabelas.set("diario-e-ocorrencias.csv", [
        ["O que é", "Dia", "Pet", "Tutor", "Creche ou hotel", "Tipo", "O que foi anotado", "Recado", "Mandado ao tutor em", "Quem anotou"],
        ...diarios.map((x): Cel[] => ["Diário", quando(x.dia), x.estadias?.pets?.nome ?? "", tutorDe(x.estadias?.pets ?? null), rotulo(TIPO_ESTADIA, x.estadias?.tipo), "",
          Array.isArray(x.itens) ? (x.itens as unknown[]).map(String).join(", ") : "", x.nota ?? "", quando(x.enviado_em), x.atualizado_nome ?? ""]),
        ...ocorrencias.map((x): Cel[] => ["Ocorrência", quando(x.quando), x.pets?.nome ?? "", tutorDe(x.pets), rotulo(TIPO_ESTADIA, x.estadias?.tipo), rotulo(TIPO_OCORRENCIA, x.tipo), x.texto, "", "", x.criado_nome ?? ""]),
      ]);

      etapa("lista de espera");
      const espera = await seExistir(() => todas<EsperaLida>((a, b) => sb.from("lista_espera").select("tipo, entrada, saida, pet_nome, tutor_nome, telefone, obs, origem, status, chamado_em, criado_em, criado_nome, termos_aceitos_em").eq("petshop_id", id).order("criado_em").order("id").range(a, b)));
      tabelas.set("lista-de-espera.csv", [
        ["Creche ou hotel", "Pet", "Tutor", "Telefone", "Entrada", "Saída", "Situação", "Avisado da vaga em", "Pedido em", "Como chegou", "Quem colocou", "Aceitou as regras em", "Observações"],
        ...espera.map((x): Cel[] => [rotulo(TIPO_ESTADIA, x.tipo), x.pet_nome, x.tutor_nome ?? "", fmtTelefone(x.telefone), quando(x.entrada), quando(x.saida), rotulo(STATUS_ESPERA, x.status), quando(x.chamado_em),
          quando(x.criado_em), x.origem === "link" ? "Link do cliente" : "Equipe", x.criado_nome ?? "", quando(x.termos_aceitos_em), x.obs ?? ""]),
      ]);

      etapa("pedidos pelo link");
      const pedidos = await seExistir(() => todas<PedidoLido>((a, b) => sb.from("pedidos_agendamento").select("tutor_nome, telefone, pet_nome, tipo, inicio, fim, obs, status, criado_em, termos_aceitos_em, termos_texto, termos_vacinas, cliente_cancelou_em, cliente_pediu, cliente_pediu_em, cliente_recado, servicos(nome)").eq("petshop_id", id).order("criado_em").order("id").range(a, b) as never));
      tabelas.set("pedidos-pelo-link.csv", [
        ["Pedido em", "Para", "Serviço", "Pet", "Tutor", "Telefone", "Para quando", "Até", "Situação", "Aceitou as regras em", "Declarou vacinas em dia", "Texto das regras aceito", "Cancelado pelo cliente em", "Pedido do cliente", "Pedido do cliente em", "Recado do cliente", "Observações"],
        ...pedidos.map((x): Cel[] => [quando(x.criado_em), rotulo(TIPO_PEDIDO, x.tipo), x.servicos?.nome ?? "", x.pet_nome, x.tutor_nome, fmtTelefone(x.telefone), quando(x.inicio), x.tipo === "servico" ? "" : quando(x.fim),
          x.cliente_cancelou_em ? "Cancelado pelo cliente" : rotulo(STATUS_PEDIDO, x.status), quando(x.termos_aceitos_em), x.termos_aceitos_em ? simNao(x.termos_vacinas) : "", x.termos_texto ?? "",
          quando(x.cliente_cancelou_em), rotulo(PEDIU, x.cliente_pediu), quando(x.cliente_pediu_em), x.cliente_recado ?? "", x.obs ?? ""]),
      ]);

      etapa("feriados e dias fechados");
      const especiais = await seExistir(() => todas<DiaEspecialLido>((a, b) => sb.from("dias_especiais").select("dia, nome, fechado, feriado").eq("petshop_id", id).order("dia").order("id").range(a, b)));
      tabelas.set("dias-fechados.csv", [
        ["Dia", "Nome", "Fechado", "Feriado (preço do hotel)"],
        ...especiais.map((x): Cel[] => [quando(x.dia), x.nome, simNao(x.fechado), simNao(x.feriado)]),
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
      const cobrancas = await todas<CobrancaLida>((a, b) => sb.from("creche_cobrancas").select("mes, valor_mensal, valor_extras, desconto, total, vencimento, status, lancamento_id, obs, extras, taxas, pets(nome, clientes(nome, telefone))").eq("petshop_id", id).order("mes").order("id").range(a, b));
      const contaPorId = new Map(lancamentos.map((l) => [l.id, l]));
      tabelas.set("mensalidades.csv", [
        ["Mês", "Pet", "Tutor", "Mensalidade", "Dias extras", "Valor dos dias extras e das taxas", "Desconto", "Total", "Vencimento", "Situação", "Falta receber", "Observações", "Taxas de busca fora do horário (já somadas na coluna dos dias extras)"],
        ...cobrancas.map((c): Cel[] => {
          const conta = c.lancamento_id ? contaPorId.get(c.lancamento_id) : undefined;
          const paga = Boolean(conta?.pago);
          return [
            dataCompleta(c.mes).slice(3), c.pets?.nome ?? "", tutorDe(c.pets), dinheiro(c.valor_mensal), numero(Array.isArray(c.extras) ? c.extras.length : 0), dinheiro(c.valor_extras), dinheiro(c.desconto), dinheiro(c.total),
            quando(c.vencimento), c.status === "cancelada" ? "Cancelada" : paga ? "Paga" : "Em aberto", c.status === "cancelada" || paga ? "" : dinheiro(conta ? Number(conta.valor) : Number(c.total)), c.obs ?? "",
            Array.isArray(c.taxas) && c.taxas.length ? dinheiro(Math.round((c.taxas as { valor?: number }[]).reduce((t, x) => t + Number(x?.valor ?? 0), 0) * 100) / 100) : "",
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

      etapa("alterações em valores");
      // o histórico de quem mexeu em dinheiro recebido e de preço mudado na venda (o lançamento apagado só existe aqui)
      const alteracoes = await todas<AlteracaoLancamento>((a, b) => sb.from("lancamentos_alteracoes").select("*").eq("petshop_id", id).order("quando").order("id").range(a, b));
      type PrecoLido = { id: string; lancamento_id: string | null; tipo: string; item: string; de: number | null; para: number; qtd: number | null; abaixo_do_custo: boolean; quem_nome: string | null; quando: string };
      const precos = await todas<PrecoLido>((a, b) => sb.from("precos_alterados").select("id, lancamento_id, tipo, item, de, para, qtd, abaixo_do_custo, quem_nome, quando").eq("petshop_id", id).order("quando").order("id").range(a, b));
      const lancPorId = new Map(lancamentos.map((l) => [l.id, l]));
      const doLancamento = (lid: string | null, antes?: unknown) => {
        const l = lid ? lancPorId.get(lid) : null;
        const era = antes && typeof antes === "object" ? (antes as Record<string, unknown>) : {};
        return (l?.descricao ?? (typeof era.descricao === "string" ? era.descricao : "")) || l?.categoria || (typeof era.categoria === "string" ? era.categoria : "");
      };
      const num = (v: unknown): Cel => (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) ? dinheiroCsv(Number(v)) : "");
      const linhasDeAlteracao: { quando: string; linha: Cel[] }[] = [
        ...alteracoes.map((a) => {
          const antes = (a.antes ?? {}) as Record<string, unknown>, depois = (a.depois ?? {}) as Record<string, unknown>;
          const apagou = a.acao === "apagou";
          return { quando: a.quando, linha: [quando(a.quando), a.quem_nome ?? "", apagou ? "Apagou um valor recebido" : "Alterou um valor recebido", doLancamento(a.lancamento_id, a.antes),
            num(antes.valor), apagou ? "" : num(depois.valor), apagou ? `era ${typeof antes.forma === "string" ? antes.forma : "sem forma"}, do dia ${typeof antes.data === "string" ? dataCompleta(antes.data) : ""}` : textoDaAlteracao(a)] as Cel[] };
        }),
        ...precos.map((x) => ({ quando: x.quando, linha: [quando(x.quando), x.quem_nome ?? "", ({ desconto: "Deu desconto na venda", sem_cobranca: "Marcou como não cobrado", servico_tirado: "Tirou um serviço feito da conta", preco_agenda: "Marcou o horário abaixo da lista", pacote: "Vendeu pacote fora do modelo",
          atendimento_baixou: "Baixou o valor de um atendimento concluído", atendimento_reaberto: "Tirou um atendimento de concluído", atendimento_apagado: "Apagou da agenda um atendimento feito",
          preco_produto: "Mudou o preço de um produto", estoque_venda: "Deu saída de estoque como venda sem o dinheiro", estoque_saida: "Deu baixa no estoque (perda ou saldo)", porte: "Trocou o porte do pet para menor" } as Record<string, string>)[x.tipo] ?? "Vendeu com preço diferente da lista",
          x.tipo === "desconto" ? x.item : `${x.item}${x.lancamento_id && doLancamento(x.lancamento_id) ? ` (${doLancamento(x.lancamento_id)})` : ""}`,
          dinheiro(x.de), dinheiro(x.para), x.abaixo_do_custo ? "abaixo do custo" : ""] as Cel[] })),
      ].sort((a, b) => a.quando.localeCompare(b.quando));
      tabelas.set("alteracoes-de-valores.csv", [
        ["Quando", "Quem", "O que fez", "Lançamento ou item", "Valor de antes", "Valor de depois", "Detalhe"],
        ...linhasDeAlteracao.map((x) => x.linha),
      ]);

      etapa("serviços");
      const servicos = await comPrecosDeServico(sb, id, await todas<Omit<Servico, "preco_p" | "preco_m" | "preco_g" | "preco_gg">>((a, b) => sb.from("servicos").select(COLS_SERVICO).eq("petshop_id", id).order("ordem").order("id").range(a, b)));
      tabelas.set("servicos.csv", [
        ["Serviço", "Tipo", "Duração (minutos)", "Preço P", "Preço M", "Preço G", "Preço GG", "Ativo"],
        ...servicos.map((s): Cel[] => [s.nome, rotulo(TIPO_SERVICO, s.categoria), numero(s.duracao_min), dinheiro(s.preco_p), dinheiro(s.preco_m), dinheiro(s.preco_g), dinheiro(s.preco_gg), simNao(s.ativo)]),
      ]);

      etapa("boletins");
      const boletins = await seExistir(() => todas<BoletimLido>((a, b) => sb.from("boletins").select("criado_em, enviado_em, expira_em, fotos, agendamento_id, estadia_id, texto, pets(nome, clientes(nome))")
        .eq("petshop_id", id).order("criado_em").order("id").range(a, b) as never));
      tabelas.set("boletins.csv", [
        ["Feito em", "Pet", "Tutor", "Visita", "Mandado ao tutor em", "Fotos", "Página abre até", "Texto"],
        ...boletins.map((x): Cel[] => [quando(x.criado_em), x.pets?.nome ?? "", tutorDe(x.pets), x.agendamento_id ? "Banho e tosa" : "Creche ou hotel", quando(x.enviado_em),
          numero(x.fotos?.length ?? 0), quando(x.expira_em), x.texto ?? ""]),
      ]);

      etapa("autorizações de fotos");
      const autorizacoes = await seExistir(() => todas<AutorizacaoLida>((a, b) => sb.from("fotos_autorizacoes").select("autorizado_em, escopo, marcar, texto, retirado_em, retirado_motivo, pets(nome, clientes(nome))")
        .eq("petshop_id", id).order("autorizado_em").order("id").range(a, b) as never));
      tabelas.set("autorizacoes-de-fotos.csv", [
        ["Pet", "Tutor", "Autorizado em", "Quais fotos", "Perfil para marcar", "Texto aceito", "Tirada em", "Por quê saiu"],
        ...autorizacoes.map((x): Cel[] => [x.pets?.nome ?? "", tutorDe(x.pets), quando(x.autorizado_em), x.escopo === "boletim" ? "Só as daquele boletim" : "Daquele boletim e das próximas visitas",
          x.marcar ?? "", x.texto, quando(x.retirado_em), x.retirado_motivo === "tutor" ? "O tutor tirou (Não quero mais)" : x.retirado_motivo === "trocada" ? "Trocada por uma nova" : ""]),
      ]);

      fazendo = "o arquivo";
      setPasso({ n: total, texto: "Fechando o arquivo…" });
      const agora = new Date();
      const linhas = new Map<NomeArquivo, number>(ASSUNTOS.map((a) => [a.arquivo, (tabelas.get(a.arquivo)?.length ?? 1) - 1]));
      const arquivos: ArquivoZip[] = [
        { nome: "README.txt", conteudo: "\ufeff" + leiaMe(petshop.nome, agora, linhas) },
        ...ASSUNTOS.map((a) => ({ nome: a.arquivo, conteudo: textoCsv(tabelas.get(a.arquivo) ?? []) })),
      ];
      const zip = montarZip(arquivos, agora);
      const apelido = semAcento(petshop.nome).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "pet-shop";
      const nomeDoArquivo = `maestro-${apelido}-${isoDia(agora)}.zip`;
      baixarArquivo(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }), nomeDoArquivo);
      setFeita(`Dados de ${dataCompleta(agora)} às ${hora(agora)} baixados: ${nomeDoArquivo}`);
      avisar("Dados baixados. Guarde em um lugar seguro.");
      // fica no registro de pedidos de dados (sem o conteúdo, só quantas linhas)
      void sb.rpc("lgpd_registrar_copia", { p_petshop: id, p_linhas: [...linhas.values()].reduce((t, n) => t + n, 0) }).then(() => undefined, () => undefined);
    } catch (e) {
      setErro(`Não deu para montar a cópia: parou ao juntar ${fazendo || "os dados"}. ${mensagemDeErro(e)} Nada foi baixado.`);
    } finally {
      setPasso(null);
    }
  }

  return (
    <section className="g-card gj-copia" id="baixar-todos-os-dados" aria-busy={Boolean(passo)}>
      <div className="g-card-t"><h3><Tile icone={Archive} tom="ceu" tamanho="p" />Baixar todos os dados</h3></div>
      <p className="g-muted g-p">
        Um arquivo .zip com tudo do seu pet shop, uma planilha para cada parte: clientes, pets, saúde, agenda, creche e hotel (com os mensalistas, as mensalidades, o diário, as ocorrências e a lista de espera), pacotes, vendas, financeiro, caixas, estoque, pedidos pelo link, boletins, autorizações de fotos, feriados, equipe, comissões pagas e serviços.
        As planilhas abrem no Excel e no Google Planilhas, e o README.txt explica cada uma.
      </p>
      <p className="g-muted g-pp">
        Serve como cópia de segurança e para levar os dados para outro sistema. Ainda não dá para trazer esses arquivos de volta para o Maestro automaticamente. As fotos não entram.
      </p>
      <div className="gj-copia-acao">
        <button type="button" className="g-btn sec" onClick={() => void baixar()} disabled={Boolean(passo)}><Download />{passo ? "Montando o arquivo…" : "Baixar todos os dados"}</button>
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
