import type { Banco } from "../supabase";
import { definicao, ErroDeUso, type Contexto, type Resumo } from "./ferramentas";
import { responderCartoes, type Feito, type GravarNoAutomatico, type Msg } from "./conversa";
import { ferramentaLiberada } from "./permissao";
import { fraseDoDesfazer, lerEstado, type EstadoAutomatico } from "./automatico";

/**
 * O lado do servidor do modo automático do Mozart (veja automatico.ts): ler a escolha no banco, gravar sem cartão pelo mesmo
 * caminho do "Pode fazer" (com a ação aberta para o Desfazer) e desfazer.
 */

/** O que o banco diz do automático desta pessoa neste pet shop. Erro na leitura vale como desligado. */
export async function estadoDoAutomatico(sb: Banco, petshopId: string): Promise<EstadoAutomatico> {
  const r = await sb.rpc("mozart_automatico_estado", { p_petshop: petshopId }).then((x) => x, () => ({ data: null, error: { message: "sem resposta" } }));
  return r.error ? lerEstado(null) : lerEstado(r.data);
}

/**
 * Grava no automático: os cartões que seriam mostrados vão direto para `responderCartoes` (o mesmo caminho do "Pode fazer":
 * confere a permissão, a conta, grava uma vez só, em ordem, e para no primeiro erro). Cada ação abre antes uma linha em
 * mozart_acoes (o banco confere de novo se o automático vale: o aparelho nunca decide) e grava com o cabeçalho
 * x-mozart-acao, para o banco anotar o que ela mudou. `sbDaAcao` monta o cliente do banco com esse cabeçalho.
 */
export function gravarNoAutomatico(o: {
  c: Contexto; liberado: boolean;
  sbDaAcao: (acao: string) => Banco;
  anotar?: (acao: string, detalhes: unknown) => Promise<void>;
  reservar?: (usoId: string) => Promise<boolean>;
  liberar?: (usoId: string) => Promise<void>;
}): GravarNoAutomatico {
  const { c } = o;
  return async ({ pendentes, propostas, parciais }) => {
    const acoes = new Map<string, string>();
    const r = await responderCartoes({
      c, pendentes, liberado: o.liberado, parciais, decisoes: propostas.map((p) => ({ id: p.id, ok: true })),
      anotar: o.anotar, reservar: o.reservar, liberar: o.liberar,
      envolver: async (uso, gravarAgora) => {
        const resumo = propostas.find((p) => p.id === uso.id)?.resumo ?? null;
        const base = c.sb;
        const a = await base.rpc("mozart_acao_comecar", { p_petshop: c.petshop.id, p_uso: uso.id, p_ferramenta: uso.name, p_resumo: (resumo ?? undefined) as never });
        if (a.error || typeof a.data !== "string") throw new ErroDeUso("O modo automático não está ligado para esta pessoa. Nada foi gravado: mostre o que ia fazer e peça para ela confirmar pela tela ou ligar o automático de novo.");
        acoes.set(uso.id, a.data);
        c.sb = o.sbDaAcao(a.data);
        try {
          const feito = await gravarAgora();
          await base.rpc("mozart_acao_terminar", { p_acao: a.data, p_ok: true });
          return feito;
        } catch (err) {
          await base.rpc("mozart_acao_terminar", { p_acao: a.data, p_ok: false }).then(() => undefined, () => undefined);
          throw err;
        } finally {
          c.sb = base;
        }
      },
    });
    const semResumo = (f: { ferramenta: string }): Resumo => ({ titulo: f.ferramenta, linhas: [] });
    const feitos: Feito[] = r.feitos.map((f) => ({ ...f, resumo: propostas.find((p) => p.id === f.id)?.resumo ?? semResumo(f), acao: f.ok ? acoes.get(f.id) ?? null : null }));
    return { resultados: r.resultados, mudou: r.mudou, feitos };
  };
}

/**
 * Desfaz uma ação do automático. Confere aqui o que a tela confere (a pessoa ainda pode usar essa ferramenta, a conta grava)
 * e o banco faz o resto numa transação só, com as regras de quem pede (`mozart_desfazer`): só quem pediu ou o dono, 24 horas,
 * nada mudado depois, caixa fechado não reabre. Devolve a frase curta para a tela quando não deu.
 */
export async function desfazerAcao(c: Contexto, acaoId: string, liberado: boolean): Promise<{ ok: true; titulo: string } | { ok: false; motivo: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(acaoId)) return { ok: false, motivo: "Não achei essa ação." };
  const a = await c.sb.from("mozart_acoes").select("id, ferramenta, resumo, estado").eq("id", acaoId).eq("petshop_id", c.petshop.id).maybeSingle();
  if (a.error) return { ok: false, motivo: fraseDoDesfazer(a.error.message) };
  if (!a.data) return { ok: false, motivo: "Não achei essa ação (ou ela é de outra pessoa)." };
  const def = definicao(a.data.ferramenta);
  if (!def || !ferramentaLiberada(def, c)) return { ok: false, motivo: "Com o seu acesso não dá para desfazer isso." };
  if (!liberado) return { ok: false, motivo: "A conta está só para consulta." };
  const r = await c.sb.rpc("mozart_desfazer", { p_acao: acaoId });
  if (r.error) return { ok: false, motivo: fraseDoDesfazer(r.error.message) };
  const resumo = a.data.resumo as { titulo?: string } | null;
  return { ok: true, titulo: resumo?.titulo ?? a.data.ferramenta };
}

/** Os ids das ferramentas que o Mozart chamou nesta conversa (para saber o que a pessoa desfez depois). */
export function usosDaConversa(mensagens: Msg[]): string[] {
  const ids: string[] = [];
  for (const m of mensagens) {
    if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
    for (const b of m.content) if (b.type === "tool_use") ids.push(b.id);
  }
  return ids;
}

/**
 * O que a pessoa desfez pelo botão desde o último pedido (o Mozart precisa saber para não contar como feito). Lê do banco,
 * pelas ações desta conversa: o aparelho não tem como inventar.
 */
export async function desfeitosDaConversa(sb: Banco, petshopId: string, mensagens: Msg[]): Promise<string[]> {
  const ids = usosDaConversa(mensagens).slice(-60);
  if (!ids.length) return [];
  const r = await sb.from("mozart_acoes").select("resumo").eq("petshop_id", petshopId).eq("estado", "desfeita").in("uso_id", ids).limit(20);
  if (r.error) return [];
  return (r.data ?? []).map((x) => (x.resumo as { titulo?: string } | null)?.titulo).filter((t): t is string => Boolean(t));
}
