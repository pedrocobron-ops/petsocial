import type { Database } from "./banco";

type T = Database["public"]["Tables"];
export type Petshop = T["petshops"]["Row"];
export type Profissional = T["profissionais"]["Row"];
export type Cliente = T["clientes"]["Row"];
export type Pet = T["pets"]["Row"];
export type Servico = T["servicos"]["Row"];
export type Pacote = T["pacotes"]["Row"];
export type PacoteCliente = T["pacotes_clientes"]["Row"];
export type Agendamento = T["agendamentos"]["Row"];
export type Bloqueio = T["bloqueios"]["Row"];
export type Estadia = T["estadias"]["Row"];
export type Caixa = T["caixas"]["Row"];
export type Lancamento = T["lancamentos"]["Row"];
export type Produto = T["produtos"]["Row"];
export type MovimentoEstoque = T["movimentos_estoque"]["Row"];
export type StatusAgendamento = Database["public"]["Enums"]["status_agendamento"];
export type StatusAssinatura = Database["public"]["Enums"]["status_assinatura"];
export type Papel = Database["public"]["Enums"]["papel_equipe"];
export type Porte = "P" | "M" | "G" | "GG";

/** Pet com o tutor junto, como as telas mostram. */
export type PetComTutor = Pet & { clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null };
/** Agendamento com pet, tutor, serviço e profissional. */
export type AgendamentoCompleto = Agendamento & {
  pets: (Pick<Pet, "id" | "nome" | "foto" | "porte" | "especie" | "raca" | "alertas"> & {
    clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null;
  }) | null;
  servicos: Pick<Servico, "id" | "nome" | "cor" | "categoria"> | null;
  profissionais: Pick<Profissional, "id" | "nome" | "cor"> | null;
};
export const SELECT_AGENDAMENTO =
  "*, pets(id, nome, foto, porte, especie, raca, alertas, clientes(id, nome, telefone)), servicos(id, nome, cor, categoria), profissionais(id, nome, cor)";

export type Horario = Record<string, { abre: string; fecha: string } | null>;

export const STATUS_AGENDAMENTO: Record<StatusAgendamento, { rotulo: string; tom: string }> = {
  marcado: { rotulo: "Marcado", tom: "cinza" },
  confirmado: { rotulo: "Confirmado", tom: "azul" },
  em_atendimento: { rotulo: "Em atendimento", tom: "laranja" },
  concluido: { rotulo: "Concluído", tom: "verde" },
  faltou: { rotulo: "Faltou", tom: "vermelho" },
  cancelado: { rotulo: "Cancelado", tom: "vermelho" },
};

export const FORMAS = [
  { id: "pix", rotulo: "Pix" },
  { id: "dinheiro", rotulo: "Dinheiro" },
  { id: "debito", rotulo: "Débito" },
  { id: "credito", rotulo: "Crédito" },
  { id: "outro", rotulo: "Outro" },
] as const;

export const CATEGORIAS_ENTRADA = ["Banho e tosa", "Creche e hotel", "Pacotes", "Venda de produtos", "Outros"];
export const CATEGORIAS_SAIDA = ["Produtos e material", "Salários e comissões", "Aluguel", "Água, luz e internet", "Impostos e taxas", "Manutenção", "Marketing", "Outros"];

export const PORTES: { id: Porte; rotulo: string }[] = [
  { id: "P", rotulo: "Pequeno" },
  { id: "M", rotulo: "Médio" },
  { id: "G", rotulo: "Grande" },
  { id: "GG", rotulo: "Gigante" },
];

export const CHECKLIST_BANHO = [
  { id: "pulgas", rotulo: "Pulgas ou carrapatos" },
  { id: "nos", rotulo: "Nós no pelo" },
  { id: "pele", rotulo: "Ferida ou irritação na pele" },
  { id: "ouvido", rotulo: "Ouvido sujo ou com cheiro" },
  { id: "unhas", rotulo: "Unhas compridas" },
  { id: "agitado", rotulo: "Chegou agitado ou com medo" },
] as const;
