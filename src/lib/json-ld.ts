/** JSON para <script type="application/ld+json">: troca "<", ">" e "&" por escapes do JSON, assim nenhum texto fecha a tag. */
export const jsonLd = (dados: unknown) => JSON.stringify(dados).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
