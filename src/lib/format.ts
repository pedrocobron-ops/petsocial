const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "25 de junho de 2026" */
export function dataLonga(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** "Domingo, 27 de julho de 2026" (data de hoje, para o cabeçalho) */
export function dataDeHoje(): string {
  const dias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const agora = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  return `${dias[agora.getDay()]}, ${agora.getDate()} de ${MESES[agora.getMonth()]} de ${agora.getFullYear()}`;
}

/** Tempo de leitura estimado (200 palavras/min), mínimo 1. */
export function tempoDeLeitura(body: string): number {
  const palavras = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(palavras / 200));
}

/** Divide o corpo em parágrafos (separados por linha em branco). */
export function paragrafos(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
