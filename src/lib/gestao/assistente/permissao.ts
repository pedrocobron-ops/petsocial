/**
 * Quem pode usar cada ferramenta do Mozart. Uma regra só, usada ao montar a lista de ferramentas do modelo, ao rodar o que
 * o modelo pediu e ao gravar o que a pessoa confirmou no cartão (a conversa vem do navegador e pode ter sido montada à mão).
 * - Ferramenta de dinheiro só para quem vê o financeiro (caixa, financeiro ou relatórios).
 * - Ferramenta de uma área (Agenda, Clientes e pets, Creche e hotel, Pacotes, Estoque) só para quem tem uma das áreas dela
 *   (as mesmas chaves de Equipe e do banco, `tenho_area`): quem só cuida do Caixa não ganha nem o cartão de marcar horário.
 * - Ferramenta só do dono (`soDono`: serviços e preços, horário de funcionamento, diárias) só para quem tem o papel dono
 *   (dono ou sócio): são as telas de Meu pet shop, que só o dono abre.
 * As regras do banco conferem de novo.
 * Sem importações: dá para testar sozinho com `node --experimental-strip-types`.
 */
export type RegraDaFerramenta = { financeiro?: boolean; areas?: readonly string[]; soDono?: boolean } | undefined | null;
/**
 * `areas`: as áreas que a pessoa abre (`areasDe`). Sem a lista (testes antigos, chamadas internas), a área não é conferida.
 * `dono`: a pessoa tem o papel dono. Sem ele, ferramenta só do dono nunca é liberada.
 */
export type QuemPede = { vejoFinanceiro: boolean; areas?: readonly string[] | null; dono?: boolean };

export function ferramentaLiberada(def: RegraDaFerramenta, c: QuemPede): boolean {
  if (!def) return false;
  if (def.financeiro && c.vejoFinanceiro !== true) return false;
  if (def.soDono && c.dono !== true) return false;
  if (def.areas?.length && Array.isArray(c.areas) && !def.areas.some((a) => c.areas!.includes(a))) return false;
  return true;
}

/** Nome de cada área como a pessoa vê no menu (para o Mozart explicar a recusa). */
const NOMES: Record<string, string> = {
  agenda: "Agenda", clientes: "Clientes e pets", creche_hotel: "Creche e hotel", pacotes: "Pacotes", estoque: "Estoque",
  caixa: "Caixa", financeiro: "Financeiro", relatorios: "Relatórios",
};

/** As áreas do dia a dia que a pessoa NÃO abre, com o nome do menu (para o contexto do modelo). Vazio para quem abre tudo. */
export function areasQueFaltam(c: QuemPede): string[] {
  if (!Array.isArray(c.areas)) return [];
  return ["agenda", "clientes", "creche_hotel", "pacotes", "estoque"].filter((a) => !c.areas!.includes(a)).map((a) => NOMES[a]);
}

/** O que o Mozart ouve quando pediu uma ferramenta fora do alcance da pessoa (para responder sem montar cartão). */
export function motivoDaRecusa(def: RegraDaFerramenta, c: QuemPede): string {
  if (def && def.financeiro && c.vejoFinanceiro !== true) return "Ferramenta indisponível: esta pessoa não tem acesso ao dinheiro (Caixa, Financeiro ou Relatórios). Diga que com o acesso dela você não consegue fazer isso e que é com quem cuida do caixa ou do financeiro. Nada foi gravado.";
  if (def && def.soDono && c.dono !== true) return "Ferramenta indisponível: isso fica em Meu pet shop, que só o dono abre. Diga que com o acesso dela você não consegue mudar isso e que é com o dono. Não ofereça cartão. Nada foi gravado.";
  const nomes = (def?.areas ?? []).map((a) => NOMES[a] ?? a);
  if (nomes.length) return `Ferramenta indisponível: esta pessoa não tem a área ${nomes.join(" ou ")} liberada. Diga que com o acesso dela você não consegue fazer isso, que é com quem tem essa área (ou com o dono, que libera em Equipe). Não ofereça cartão. Nada foi gravado.`;
  return "Ferramenta indisponível para esta pessoa. Nada foi gravado.";
}
