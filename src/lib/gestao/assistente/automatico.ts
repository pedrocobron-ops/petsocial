/**
 * Modo automático do Mozart: com ele ligado, tudo o que grava é feito na hora, sem o cartão de confirmação, pelo mesmo caminho
 * do "Pode fazer" (mesmas permissões e regras do banco, em ordem, parando no primeiro erro). Depois de cada ação aparece o
 * cartão "Feito" com o botão Desfazer (24 horas; só quem pediu ou o dono).
 *
 * A escolha é de cada pessoa e fica no banco (`profissionais.mozart_automatico`, migração 20261244000000): vale em todos os
 * aparelhos. O dono sempre pode; a equipe, só se o dono liga "Permitir modo automático para a equipe" (opção
 * `mozart.automatico_equipe`). Quem decide é sempre o banco (`mozart_automatico_estado`): o aparelho nunca liga sozinho.
 *
 * Sem importações: os testes de unidade leem este arquivo direto, e a tela também usa.
 */

/** A opção do pet shop (Meu pet shop, O negócio). */
export const CHAVE_AUTOMATICO_EQUIPE = "mozart.automatico_equipe";
/** Versão do aviso que a pessoa aceita ao ligar (vai para o registro do aceite). Mudou o texto do aviso? Suba. */
export const VERSAO_AVISO_AUTOMATICO = "1";
/** Por quanto tempo o Desfazer vale. */
export const HORAS_PARA_DESFAZER = 24;

export const AVISO_AUTOMATICO = {
  titulo: "Ligar o modo automático?",
  texto: "O Mozart vai fazer na hora tudo o que você pedir, sem mostrar o cartão de confirmação: agenda, pagamentos, cancelamentos, preços e cadastros. Ele pode entender diferente um nome, um horário ou um valor, principalmente por áudio. Confira o que aparece na conversa. Se algo sair diferente, toque em Desfazer.",
  depois: "Você pode desligar quando quiser.",
  entendi: "Entendi",
  ligar: "Ligar o automático",
  agoraNao: "Agora não",
};

/** O que o banco devolve em `mozart_automatico_estado`. */
export type EstadoAutomatico = { ligado: boolean; pode: boolean; efetivo: boolean; dono: boolean; equipe: boolean; aceito_em?: string | null };
export const ESTADO_DESLIGADO: EstadoAutomatico = { ligado: false, pode: false, efetivo: false, dono: false, equipe: false };

/** Lê com cuidado o que veio do banco: qualquer coisa estranha vale como desligado. */
export function lerEstado(bruto: unknown): EstadoAutomatico {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return ESTADO_DESLIGADO;
  const b = bruto as Record<string, unknown>;
  const sim = (k: string) => b[k] === true;
  return { ligado: sim("ligado"), pode: sim("pode"), efetivo: sim("efetivo") && sim("pode") && sim("ligado"), dono: sim("dono"), equipe: sim("equipe"), aceito_em: typeof b.aceito_em === "string" ? b.aceito_em : null };
}

/** Pode usar o automático? O dono sempre; a equipe só com a opção do dono ligada. */
export const podeUsarAutomatico = (o: { dono: boolean; equipePermitida: boolean }) => o.dono || o.equipePermitida;

/** O automático vale agora? A escolha da pessoa e a permissão juntas. */
export const automaticoVale = (o: { ligado: boolean; dono: boolean; equipePermitida: boolean }) => o.ligado && podeUsarAutomatico(o);

/** O Desfazer ainda vale? (prazo de 24 horas, só quem pediu ou o dono, e só ação feita) */
export function podeDesfazer(o: { autor: string | null; eu: string; souDono: boolean; criadoEm: string; estado: string; agora?: Date }): { ok: true } | { ok: false; motivo: string } {
  if (o.estado === "desfeita") return { ok: false, motivo: "Isso já foi desfeito." };
  if (o.estado !== "feita") return { ok: false, motivo: "Essa ação não chegou a ser gravada." };
  if (o.autor !== o.eu && !o.souDono) return { ok: false, motivo: "Só quem pediu ou o dono pode desfazer." };
  const quando = Date.parse(o.criadoEm);
  if (!Number.isFinite(quando) || (o.agora ?? new Date()).getTime() - quando > HORAS_PARA_DESFAZER * 3600_000) return { ok: false, motivo: "O Desfazer vale por 24 horas. Agora, mude pela tela." };
  return { ok: true };
}

/**
 * A frase curta que a pessoa lê quando o Desfazer não deu certo, a partir do erro do banco. As frases que o próprio
 * `mozart_desfazer` escreve passam como estão; as travas das outras regras (caixa fechado, permissão) viram uma frase só.
 */
export function fraseDoDesfazer(mensagem: string | null | undefined): string {
  const m = (mensagem ?? "").trim();
  if (!m) return "Não deu para desfazer agora. Tente de novo.";
  if (/caixa j[áa] (foi )?fechado|de um caixa j[áa] fechado/i.test(m)) return "O caixa desse dia já foi fechado: para acertar, lance um ajuste no Caixa.";
  if (/row-level security|permission denied|42501|sem permiss/i.test(m) && !/Só quem pediu|dono não liberou/.test(m)) return "Com o seu acesso não dá para desfazer isso.";
  if (/foreign key|violates/i.test(m)) return "Isso já está sendo usado em outro lugar. Nada foi desfeito.";
  if (/Failed to fetch|NetworkError|fetch failed|ECONNREFUSED|timeout/i.test(m)) return "Sem conexão agora. Tente de novo.";
  // frase já pronta (português, curta): passa como veio
  if (m.length <= 160 && !/[{}<>]|\b(error|null|undefined|function|column|relation)\b/i.test(m)) return m;
  return "Não deu para desfazer agora. Tente de novo.";
}

/**
 * O que o Mozart ouve quando o automático está ligado (vai no contexto do pet shop, depois das instruções fixas).
 * O automático pula o cartão, nunca as perguntas.
 */
export const INSTRUCOES_AUTOMATICO = `Modo automático LIGADO para esta pessoa: o que você chamar que grava é feito na hora, sem cartão de confirmação. Isto vale por cima do que foi dito sobre o cartão e o "Pode fazer":
- Ainda pergunte antes, em uma frase, quando faltar ou estiver dúbia uma informação (forma de pagamento, qual pet quando dois batem, hora, valor, dia). O automático pula o cartão, não as perguntas. Na dúvida, pergunte em vez de chamar a ferramenta.
- Depois que a ferramenta voltar, fale no passado e curto: "Marquei…", "Lancei…", "Cancelei…", "Mudei…", com o nome, o dia, a hora e o valor como ficaram. Se der errado, diga o que não foi feito.
- Lembre em poucas palavras que dá para desfazer no botão Desfazer, logo abaixo. Não diga que vai mostrar cartão nem peça para confirmar.
- Mensagens de WhatsApp continuam só prontas num botão: quem abre o WhatsApp é a pessoa.`;
