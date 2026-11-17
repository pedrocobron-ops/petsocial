import type { Banco } from "./supabase";
import { formaPrincipal, parteDaChave, type FormaPagamento, type PartePagamento } from "./dinheiro";
import { fazerTudoOuNada, type Passo } from "./tudo-ou-nada";
import { centavos, isoDia } from "./util";

/**
 * Sinal de reservas ligadas recebido junto (Bia, item 9): um pedido do link com dois pets do mesmo tutor vira duas reservas,
 * cada uma com o seu sinal em A receber. O tutor manda um Pix só; aqui ele quita os dois sinais numa operação só
 * (estadia_sinal, migração 20261178): ou os dois ficam pagos, ou nenhum. A chave da operação faz o toque duplo receber uma vez.
 *
 * Reservas ligadas: do mesmo tutor, com a chegada no mesmo dia e o sinal ainda a receber (o pedido do link para dois pets
 * sempre chega assim; duas reservas feitas aqui dentro para os pets do mesmo tutor também).
 */

/** O que cada reserva precisa ter para entrar no grupo (a reserva e os valores dela, lidos por quem recebe). */
export type ReservaComSinal = {
  id: string; entrada: string; status: string; pet: string; /** quando a reserva foi feita (a ordem dos nomes: "Thor e Mel") */ criado?: string | null; tutorId: string | null; tutor: string | null;
  sinal: number | null; sinalEstado: string | null; contaId: string | null; sinalRecebido: number | null;
};
/** Um sinal a receber: a conta dele e quanto ainda falta (o sinal pode já ter uma parte paga). */
export type SinalAberto = { estadiaId: string; pet: string; contaId: string; sinal: number; falta: number };
export type GrupoDeSinal = { chave: string; tutor: string | null; itens: SinalAberto[]; total: number; nomes: string };

/** "Thor e Mel", "Thor, Mel e Bob" */
export const listaDeNomes = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);

/** Quanto falta do sinal a receber (o sinal menos as partes já recebidas da conta dele). */
export const faltaDoSinalAberto = (r: Pick<ReservaComSinal, "sinal" | "sinalEstado" | "sinalRecebido">) =>
  r.sinalEstado === "a_receber" ? Math.max(0, centavos(Number(r.sinal ?? 0) - Math.min(Number(r.sinal ?? 0), Number(r.sinalRecebido ?? 0)))) : 0;

/** As reservas com o sinal a receber, juntas por tutor e dia da chegada. Só os grupos com dois ou mais sinais. */
export function gruposDeSinal(reservas: ReservaComSinal[]): GrupoDeSinal[] {
  const grupos = new Map<string, { tutor: string | null; itens: SinalAberto[] }>();
  // na ordem em que as reservas foram feitas (a do pedido), e pelo nome no empate: a mesma ordem em toda tela
  const ordem = [...reservas].sort((a, b) => (a.criado ?? "").localeCompare(b.criado ?? "") || a.pet.localeCompare(b.pet, "pt-BR") || a.id.localeCompare(b.id));
  for (const r of ordem) {
    if (r.status !== "reservada" || !r.tutorId || !r.contaId) continue;
    const falta = faltaDoSinalAberto(r);
    if (!(falta > 0)) continue;
    const chave = `${r.tutorId}:${isoDia(new Date(r.entrada))}`;
    const g = grupos.get(chave) ?? { tutor: r.tutor, itens: [] };
    g.itens.push({ estadiaId: r.id, pet: r.pet, contaId: r.contaId, sinal: Number(r.sinal), falta });
    grupos.set(chave, g);
  }
  return [...grupos.entries()].filter(([, g]) => g.itens.length > 1).map(([chave, g]) => ({
    chave, tutor: g.tutor, itens: g.itens, total: centavos(g.itens.reduce((t, x) => t + x.falta, 0)), nomes: listaDeNomes(g.itens.map((x) => x.pet)),
  }));
}

/**
 * Reparte um pagamento (uma forma, ou dividido em partes) entre as contas, na ordem: cada conta recebe o valor dela, com as
 * formas que cobrem esse valor. A soma de cada conta fecha ao centavo, e a soma de tudo é o pagamento.
 */
export function repartirPagamento(pg: { forma: FormaPagamento; pagamentos?: PartePagamento[] | null }, valores: number[]):
  { forma: FormaPagamento; pagamentos: PartePagamento[] | null }[] {
  if (!pg.pagamentos || pg.pagamentos.length < 2) return valores.map(() => ({ forma: pg.forma, pagamentos: null }));
  const resto = pg.pagamentos.map((p) => ({ forma: p.forma, valor: centavos(p.valor) }));
  return valores.map((v) => {
    let falta = centavos(v);
    const partes: PartePagamento[] = [];
    for (const p of resto) {
      if (falta <= 0) break;
      if (p.valor <= 0) continue;
      const tira = Math.min(p.valor, falta);
      partes.push({ forma: p.forma, valor: centavos(tira) });
      p.valor = centavos(p.valor - tira);
      falta = centavos(falta - tira);
    }
    if (falta > 0.004) throw new Error("O pagamento não fecha com a soma dos sinais.");
    return partes.length > 1 ? { forma: formaPrincipal(partes), pagamentos: partes } : { forma: partes[0]?.forma ?? pg.forma, pagamentos: null };
  });
}

/** Os passos da operação: receber o que falta de cada sinal, conferindo antes que a conta não mudou (`esperado`). */
export function passosDoSinalJunto(itens: SinalAberto[], pg: { forma: FormaPagamento; pagamentos?: PartePagamento[] | null }, chave: string): Passo[] {
  const partes = repartirPagamento(pg, itens.map((x) => x.falta));
  return itens.map((x, i) => ({
    t: "receber" as const, conta: x.contaId, valor: centavos(x.falta), forma: partes[i].forma, pagamentos: partes[i].pagamentos,
    chave: parteDaChave(chave, "sinal", i) ?? null, esperado: centavos(x.falta),
  }));
}

/**
 * Recebe os sinais juntos, numa chamada só. Lança `ErroDaOperacao` (nada foi gravado; `maestro:conta_mudou` quando um dos sinais
 * foi recebido ou mudou em outra tela). A mesma chave de novo devolve o que já foi feito, sem receber outra vez.
 */
export async function receberSinaisJuntos(sb: Banco, petshopId: string, itens: SinalAberto[], pg: { forma: FormaPagamento; pagamentos?: PartePagamento[] | null }, chave: string) {
  if (itens.length < 1) throw new Error("Escolha ao menos um sinal.");
  return fazerTudoOuNada(sb, petshopId, parteDaChave(chave, "sinais")!, { funcao: "estadia_sinal", estadia: itens[0].estadiaId }, passosDoSinalJunto(itens, pg, chave));
}
