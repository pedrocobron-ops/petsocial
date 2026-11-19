/**
 * Versões dos Termos de uso e da Política de privacidade do Gestão.
 *
 * Mudou o texto de um documento de forma que a pessoa precise saber? Suba a `versao` dele, ponha a data em `vigenteDesde`
 * e troque `MUDANCAS` pelo resumo do que mudou. Na próxima vez que cada pessoa abrir o aplicativo, aparece a tela
 * "Atualizamos as regras" (com esse resumo) e ela só segue depois de aceitar. O aceite fica na tabela `aceites`
 * (migração 20261197000000_gestao_aceites.sql), com a versão, a hora, o IP e o navegador.
 * Correção pequena (vírgula, link) não precisa de versão nova.
 *
 * Sem importações: os testes (testes/lib/app.js) leem este arquivo direto.
 */
export type Documento = "termos" | "privacidade";

export const DOCUMENTOS: Record<Documento, { nome: string; caminho: string; versao: string; vigenteDesde: string }> = {
  termos: { nome: "Termos de uso", caminho: "/gestao/termos", versao: "2.4", vigenteDesde: "2026-11-18" },
  privacidade: { nome: "Política de privacidade", caminho: "/gestao/privacidade", versao: "2.4", vigenteDesde: "2026-11-18" },
};

/** O que mudou nesta versão, em poucas linhas, para a tela de aceite de quem já tinha conta. */
export const MUDANCAS: string[] = [
  "Conversas com o Mozart e a Ajuda: a nossa equipe passa a ver só números. Para ler uma conversa e dar suporte, a pessoa da equipe precisa escrever o motivo, e cada abertura aparece para o dono em Meu pet shop, em \"Acessos da equipe Maestro Pet\".",
  "Inteligência artificial: dizemos com todas as letras o que vai ao fornecedor (Anthropic, fora do Brasil): além de nomes, serviços, horários e valores, também telefones de tutores, alertas, observações e ficha de saúde dos pets, conforme o que cada pessoa pode ver.",
  "Apagar e excluir: \"Excluir de vez\" e \"Apagar dados deste tutor\" agora limpam as mesmas coisas, e as fotos trocadas ou de fichas apagadas saem em até 1 dia. Prazos novos: pedido pelo link que não virou horário, 90 dias; proteção contra abuso do link, 2 dias.",
  "Pagamento: quem vende, o reembolso integral em 7 dias e que a assinatura, por enquanto, não tem nota fiscal (você recebe o comprovante da Cakto).",
  "Incidente de segurança: avisamos em até 48 horas depois de sabermos. Também explicamos melhor os dados fora do Brasil, a cópia completa do banco e a lista de fornecedores.",
  "Cada pessoa com login pode baixar os próprios dados e, depois de sair de uma equipe, apagar o próprio login.",
];

/** "17/11/2026" a partir de "2026-11-17" (sem fuso: é uma data de calendário). */
export const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/** "Versão 2.0 — vigente desde 17/11/2026" */
export const textoVigencia = (d: Documento) => `Versão ${DOCUMENTOS[d].versao} — vigente desde ${dataBr(DOCUMENTOS[d].vigenteDesde)}`;

/** O que vai nos dados do cadastro (`options.data.aceite`): o gatilho do banco grava o aceite quando o login é criado. */
export const aceiteDoCadastro = () => ({ termos: DOCUMENTOS.termos.versao, privacidade: DOCUMENTOS.privacidade.versao });

/** Documentos cuja versão em vigor a pessoa ainda não aceitou. */
export function pendentes(aceites: { documento: string; versao: string }[]): Documento[] {
  return (Object.keys(DOCUMENTOS) as Documento[]).filter((d) => !aceites.some((a) => a.documento === d && a.versao === DOCUMENTOS[d].versao));
}
