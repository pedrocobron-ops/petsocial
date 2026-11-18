/**
 * "Adicionar à agenda": o arquivo .ics que a página do pedido confirmado entrega (abre na agenda do celular ou do computador).
 * Horas em UTC (o aparelho mostra no fuso dele). Sem importações: dá para testar sozinho.
 */
export type EventoDaAgenda = { id: string; titulo: string; inicio: string; fim: string; onde?: string | null; descricao?: string | null };

const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
/** Texto de um campo: vírgula, ponto e vírgula, barra e quebra de linha com escape (RFC 5545). */
const texto = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
/** Linha com no máximo 75 octetos (as seguintes começam com um espaço). */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = "", tamanho = 0;
  for (const letra of linha) {
    const n = new TextEncoder().encode(letra).length;
    if (tamanho + n > (partes.length ? 74 : 75)) { partes.push(atual); atual = ""; tamanho = 0; }
    atual += letra; tamanho += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

/** O arquivo .ics com um evento por item. Evento com data inválida (ou fim antes do começo) fica de fora. */
export function icsDaAgenda(eventos: EventoDaAgenda[], agora: Date = new Date()): string | null {
  const bons = eventos.filter((e) => !Number.isNaN(Date.parse(e.inicio)) && !Number.isNaN(Date.parse(e.fim)) && Date.parse(e.fim) > Date.parse(e.inicio));
  if (!bons.length) return null;
  const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Maestro Pet Gestao//Pedido pelo link//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of bons) {
    linhas.push("BEGIN:VEVENT", `UID:${e.id.replace(/[^A-Za-z0-9-]/g, "")}@maestropet`, `DTSTAMP:${utc(agora.toISOString())}`,
      `DTSTART:${utc(e.inicio)}`, `DTEND:${utc(e.fim)}`, `SUMMARY:${texto(e.titulo)}`);
    if (e.onde?.trim()) linhas.push(`LOCATION:${texto(e.onde.trim())}`);
    if (e.descricao?.trim()) linhas.push(`DESCRIPTION:${texto(e.descricao.trim())}`);
    linhas.push("END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return `${linhas.map(dobrar).join("\r\n")}\r\n`;
}
