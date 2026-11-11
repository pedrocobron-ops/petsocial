import type { Profissional } from "./tipos";

/**
 * Áreas do aplicativo que o dono libera para cada pessoa com login.
 * O dono (e os sócios, papel "dono") abre tudo, inclusive Equipe, Meu pet shop e Assinatura, que são só dele.
 * Caixa, financeiro e relatórios mexem com dinheiro: ao marcar qualquer um, a tela grava `ve_financeiro = true`,
 * e é essa chave que o banco confere. As outras áreas são organizadas pelo aplicativo (menu e telas).
 */
export const AREAS = [
  { id: "agenda", rotulo: "Agenda", apoio: "Ver, marcar e remarcar horários.", rota: "/gestao/app/agenda", dinheiro: false },
  { id: "clientes", rotulo: "Clientes e pets", apoio: "Cadastro, fichas, saúde e histórico.", rota: "/gestao/app/clientes", dinheiro: false },
  { id: "creche_hotel", rotulo: "Creche e hotel", apoio: "Reservas, check-in e check-out.", rota: "/gestao/app/creche-hotel", dinheiro: false },
  { id: "pacotes", rotulo: "Pacotes", apoio: "Vender pacote e dar baixa nos usos.", rota: "/gestao/app/pacotes", dinheiro: false },
  { id: "estoque", rotulo: "Estoque", apoio: "Produtos, entradas e saídas.", rota: "/gestao/app/estoque", dinheiro: false },
  { id: "caixa", rotulo: "Caixa", apoio: "Abrir, receber e fechar o caixa do dia.", rota: "/gestao/app/caixa", dinheiro: true },
  { id: "financeiro", rotulo: "Financeiro", apoio: "Contas a pagar e a receber, resultado do mês.", rota: "/gestao/app/financeiro", dinheiro: true },
  { id: "relatorios", rotulo: "Relatórios", apoio: "Faturamento, comissão e desempenho.", rota: "/gestao/app/relatorios", dinheiro: true },
] as const;

export type Area = (typeof AREAS)[number]["id"];
const TODAS = AREAS.map((a) => a.id) as Area[];
const DIA_A_DIA: Area[] = ["agenda", "clientes", "creche_hotel", "pacotes", "estoque"];
const DINHEIRO: Area[] = ["caixa", "financeiro", "relatorios"];

/** Combinações prontas para o dono escolher com um toque. "socio" vira papel dono. */
export const PERFIS = [
  { id: "recepcao", funcao: "Recepção", titulo: "Recepção e agendamento", apoio: "Marca horários, cadastra clientes e recebe no caixa.", areas: ["agenda", "clientes", "creche_hotel", "pacotes", "caixa"] as Area[], socio: false },
  { id: "financeiro", funcao: "Financeiro", titulo: "Financeiro", apoio: "Cuida do caixa, das contas e dos relatórios.", areas: ["caixa", "financeiro", "relatorios", "estoque"] as Area[], socio: false },
  { id: "gerente", funcao: "Gerente", titulo: "Gerente", apoio: "Abre todas as áreas. Só não mexe na equipe, nos ajustes do pet shop e na assinatura.", areas: TODAS, socio: false },
  { id: "socio", funcao: "Sócio", titulo: "Sócio (outro dono)", apoio: "Acesso a tudo, igual a você: equipe, ajustes e assinatura.", areas: TODAS, socio: true },
  { id: "atendimento", funcao: "Banhista e tosador(a)", titulo: "Banhista ou tosador(a)", apoio: "Vê a agenda e as fichas dos pets. Não vê dinheiro.", areas: ["agenda", "clientes"] as Area[], socio: false },
] as const;

/** As áreas que a pessoa abre, valendo o que foi marcado ou, se nada foi marcado, o padrão do papel. */
export function areasDe(p: Pick<Profissional, "papel" | "ve_financeiro" | "acessos">): Area[] {
  if (p.papel === "dono") return TODAS;
  if (Array.isArray(p.acessos)) {
    const marcadas = p.acessos.filter((a): a is Area => (TODAS as string[]).includes(a));
    // dinheiro só vale com a chave que o banco confere
    return p.ve_financeiro ? marcadas : marcadas.filter((a) => !DINHEIRO.includes(a));
  }
  if (p.papel === "gerente") return TODAS;
  return p.ve_financeiro ? [...DIA_A_DIA, ...DINHEIRO] : DIA_A_DIA;
}

export const podeArea = (p: Pick<Profissional, "papel" | "ve_financeiro" | "acessos">, area: Area) => areasDe(p).includes(area);
/** O que gravar em `ve_financeiro` para um conjunto de áreas. */
export const veDinheiro = (areas: Area[]) => areas.some((a) => DINHEIRO.includes(a));
/** Área de uma rota do aplicativo (null = tela inicial ou tela só do dono). */
export const areaDaRota = (caminho: string): Area | null => AREAS.find((a) => caminho.startsWith(a.rota))?.id ?? null;
