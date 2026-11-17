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
  termos: { nome: "Termos de uso", caminho: "/gestao/termos", versao: "2.1", vigenteDesde: "2026-11-17" },
  privacidade: { nome: "Política de privacidade", caminho: "/gestao/privacidade", versao: "2.1", vigenteDesde: "2026-11-17" },
};

/** O que mudou nesta versão, em poucas linhas, para a tela de aceite de quem já tinha conta. */
export const MUDANCAS: string[] = [
  "Autorização para postar fotos: explicamos como funciona. O tutor autoriza pelo boletim (só aquelas fotos ou também as próximas), o sistema guarda o texto aceito e ele tira quando quiser pelo link \"Não quero mais\".",
  "Baixar todos os dados: em Meu pet shop, um arquivo com uma planilha para cada parte e um README que explica cada uma.",
  "Dados de um tutor: na ficha do tutor, o dono baixa os dados daquele cliente ou apaga os dados pessoais dele. Os valores ficam no financeiro, sem o nome.",
  "Checklist de entrada: o pet shop pode registrar como o pet chegou (com fotos) e pedir o aceite do tutor, por assinatura no aparelho ou por link. O texto do termo é do pet shop; o sistema guarda o aceite.",
  "Aniversário do tutor (opcional) e horários das etapas do atendimento e do leva e traz: explicamos o que guardamos e para quê.",
  "Encerrar e apagar a conta: o titular pede em Meu pet shop. A conta fica 30 dias só para consulta, dá para cancelar nesse prazo e depois apagamos tudo. Quem é da equipe pode sair por \"Sair desta equipe\".",
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
