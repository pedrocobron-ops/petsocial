/**
 * Senha do painel do administrador (migração 20261247): o que a tela precisa saber para mostrar a porta do painel e os
 * textos dela. Quem confere a senha, conta os erros e guarda o hash é o banco (admin_painel_abrir, admin_senha_definir);
 * aqui só há leitura da resposta e as mesmas regras mínimas da senha, para avisar antes de mandar.
 */

export const SENHA_MIN = 10;
export const SENHA_MAX = 200;

export type SituacaoDoPainel = {
  /** É da equipe Maestro Pet. */
  admin: boolean;
  /** Já registrou a senha do painel. */
  temSenha: boolean;
  /** O painel está aberto nesta sessão de login. */
  aberto: boolean;
  /** Chegou agora pelo link do e-mail: pode registrar ou trocar a senha. */
  podeDefinir: boolean;
  /** As tentativas estão travadas até este instante (ISO), ou null. */
  bloqueadoAte: string | null;
};

/** A resposta de admin_situacao() lida com cuidado. `null` = o banco ainda não tem a senha do painel (antes de 20261247). */
export function lerSituacao(dado: unknown): SituacaoDoPainel | null {
  if (!dado || typeof dado !== "object") return null;
  const d = dado as Record<string, unknown>;
  if (d.admin !== true) return { admin: false, temSenha: false, aberto: false, podeDefinir: false, bloqueadoAte: null };
  if (typeof d.tem_senha !== "boolean" || typeof d.aberto !== "boolean") return null;
  return {
    admin: true, temSenha: d.tem_senha, aberto: d.aberto, podeDefinir: d.pode_definir === true,
    bloqueadoAte: typeof d.bloqueado_ate === "string" ? d.bloqueado_ate : null,
  };
}

/** O que falta na senha nova, em palavras simples; `null` quando pode mandar. As mesmas regras do banco. */
export function problemaDaSenhaNova(senha: string, repetida: string, email: string | null | undefined): string | null {
  if (senha.length < SENHA_MIN || senha.trim().length < SENHA_MIN) return `A senha do painel precisa de pelo menos ${SENHA_MIN} letras ou números.`;
  if (senha.length > SENHA_MAX) return `A senha do painel pode ter no máximo ${SENHA_MAX} letras ou números.`;
  if (email && senha.trim().toLowerCase() === email.trim().toLowerCase()) return "A senha não pode ser o seu e-mail. Escolha outra.";
  if (senha !== repetida) return "As duas senhas estão diferentes. Digite de novo.";
  return null;
}

/** O motivo que admin_senha_definir devolveu, para a pessoa ler. */
export function motivoDaSenhaNova(motivo: unknown): string {
  if (motivo === "curta") return `A senha do painel precisa de pelo menos ${SENHA_MIN} letras ou números.`;
  if (motivo === "longa") return `A senha do painel pode ter no máximo ${SENHA_MAX} letras ou números.`;
  if (motivo === "igual_email") return "A senha não pode ser o seu e-mail. Escolha outra.";
  if (motivo === "email_trocado") return "O e-mail da sua conta mudou depois que a senha do painel foi registrada. Abra o painel uma vez com a senha atual; depois disso, a troca por e-mail volta a valer. Esqueceu a senha? Fale com a equipe técnica.";
  if (motivo === "email") return "O tempo para escolher a senha acabou (15 minutos depois de abrir o link do e-mail). Peça um link novo.";
  return "Não consegui guardar a senha agora. Tente de novo.";
}

/** "14:35" no relógio de quem está vendo. */
const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** As tentativas ainda estão travadas? */
export const travado = (bloqueadoAte: string | null | undefined, agora: number) => !!bloqueadoAte && new Date(bloqueadoAte).getTime() > agora;

/** Aviso das tentativas travadas. */
export function textoDoBloqueio(bloqueadoAte: string, agora: number): string {
  const min = Math.max(1, Math.ceil((new Date(bloqueadoAte).getTime() - agora) / 60000));
  return `Muitas senhas erradas. Por segurança, espere ${min === 1 ? "1 minuto" : `${min} minutos`} (até as ${horaCurta(bloqueadoAte)}) para tentar de novo. Esqueceu a senha? Peça o link por e-mail.`;
}

/** Aviso da senha errada, com quantas tentativas sobram antes de travar. */
export function textoDaSenhaErrada(restam: unknown): string {
  const n = typeof restam === "number" && restam > 0 ? Math.floor(restam) : null;
  if (n === null) return "Senha errada. Confira e tente de novo.";
  return `Senha errada. Você ainda pode tentar ${n === 1 ? "1 vez" : `${n} vezes`} antes de uma pausa de 15 minutos.`;
}

/** "ma•••@gmail.com": o e-mail para onde o link foi, sem mostrar inteiro na tela. */
export function emailDisfarcado(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const arroba = e.lastIndexOf("@");
  if (arroba < 1) return "o e-mail da sua conta";
  return `${e.slice(0, Math.min(2, arroba))}•••${e.slice(arroba)}`;
}
