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
  termos: { nome: "Termos de uso", caminho: "/gestao/termos", versao: "2.3", vigenteDesde: "2026-11-17" },
  privacidade: { nome: "Política de privacidade", caminho: "/gestao/privacidade", versao: "2.3", vigenteDesde: "2026-11-17" },
};

/** O que mudou nesta versão, em poucas linhas, para a tela de aceite de quem já tinha conta. */
export const MUDANCAS: string[] = [
  "Cópias de segurança: explicamos quais existem hoje (as do fornecedor do banco e uma cópia completa feita pela nossa equipe), para que servem e o que fazer se algo for apagado por engano. Não há prazo de guarda garantido.",
  "Mudar de plano ou de período: como fazer, quando o plano novo começa e o que acontece com os meses que sobraram de um plano de 3 ou 6 meses.",
  "Cookies: o aviso aparece só nas páginas do site que medem visitas, com Aceitar e Recusar. O aplicativo e o cadastro continuam sem pixel.",
  "Textos mais claros sobre quem oferece o serviço hoje, o banco de dados dividido com o Escala CEO e os avisos que aparecem na tela.",
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
