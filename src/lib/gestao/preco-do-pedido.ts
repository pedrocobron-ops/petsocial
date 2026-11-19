/**
 * O valor que aparece no cartão do pedido pelo link (tela do dono): o mesmo preço da lista que o link mostrou ao tutor,
 * já no porte do pedido. Sem importações: dá para testar sozinho com `node --experimental-strip-types`.
 * Só para quem vê o dinheiro (quem não vê recebe os preços em branco e o cartão fica sem valor).
 */
type Precos = { preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null };
type Pedido = { tipo?: string | null; porte?: string | null; experiencia?: boolean | null };
type Casa = { diaria_creche?: number | null; diaria_hotel?: number | null; diariaHotelDoPorte?: number | null };

const real = (v: number) => `R$ ${v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/**
 * `servico` pode ser a lista dos serviços do pedido (o principal e os que vêm junto, migração 20261239): o valor é a soma.
 * Algum deles sem preço: sem valor (fica a combinar).
 */
export function precoDoPedido(p: Pedido, servico: Precos | (Precos | null | undefined)[] | null | undefined, casa: Casa): string | null {
  if (Array.isArray(servico)) {
    if (servico.length <= 1) return precoDoPedido(p, servico[0], casa);
    if (p.tipo === "hotel" || p.tipo === "creche") return precoDoPedido(p, null, casa);
    let de = 0, ate = 0;
    for (const s of servico) {
      if (!s) return null;
      const mapa: Record<string, number | null> = { P: s.preco_p, M: s.preco_m, G: s.preco_g, GG: s.preco_gg };
      const doPorte = p.porte ? mapa[p.porte] : null;
      if (doPorte != null) { de += Number(doPorte); ate += Number(doPorte); continue; }
      const valores = Object.values(mapa).filter((v): v is number => v != null).map(Number);
      if (!valores.length) return null;
      de += Math.min(...valores); ate += Math.max(...valores);
    }
    de = Math.round(de * 100) / 100; ate = Math.round(ate * 100) / 100;
    return de === ate ? real(de) : `${real(de)} a ${real(ate)}, conforme o porte`;
  }
  if (p.tipo === "hotel") {
    const d = casa.diariaHotelDoPorte ?? casa.diaria_hotel;
    return d != null ? `${real(Number(d))} a diária` : null;
  }
  if (p.tipo === "creche") {
    if (p.experiencia) return null; // o dia de experiência tem a etiqueta e o preço dele
    return casa.diaria_creche != null ? `${real(Number(casa.diaria_creche))} a diária` : null;
  }
  if (!servico) return null;
  const mapa: Record<string, number | null> = { P: servico.preco_p, M: servico.preco_m, G: servico.preco_g, GG: servico.preco_gg };
  const doPorte = p.porte ? mapa[p.porte] : null;
  if (doPorte != null) return real(Number(doPorte));
  const valores = Object.values(mapa).filter((v): v is number => v != null).map(Number);
  if (!valores.length) return null;
  const menor = Math.min(...valores), maior = Math.max(...valores);
  if (menor === maior) return real(menor);
  return p.porte ? `${real(menor)} a ${real(maior)} (sem preço para o porte ${p.porte})` : `${real(menor)} a ${real(maior)}, conforme o porte`;
}
