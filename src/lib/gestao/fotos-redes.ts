/**
 * Autorização do tutor para postar as fotos do pet nas redes da loja (migração 20261196). O banco monta o texto exato
 * (foto_autorizacao_texto) e guarda o @ já arrumado (foto_autorizacao_marcar); aqui ficam as mesmas regras para a prévia da
 * página do boletim mostrar exatamente o que vai ser guardado.
 */
export const SEM_MARCAR = "Sem marcar o meu perfil.";

/** O @ do jeito que o banco guarda ("@ana.pets"), ou "" se vazio. Inválido, o banco recusa com a mensagem certa. */
export function arrumarArroba(v: string) {
  const s = v.trim().replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@+/, "");
  return s ? `@${s}` : "";
}

/** O texto do banco (sem o @) com a frase do @ trocada, igual ao que o banco monta com o @. */
export const textoComArroba = (texto: string, arroba: string) => (arroba ? texto.replace(SEM_MARCAR, `Pode marcar o meu perfil ${arroba}.`) : texto);
