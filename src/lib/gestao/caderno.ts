/**
 * "Trazer do caderno ou do outro sistema": o que a tela e o servidor dividem (tipos, limites, datas e a limpeza do que a IA
 * leu). As instruções da IA, o formato da resposta e a leitura de teste ficam só no servidor (`caderno-ia.ts`).
 *
 * Caminho: a pessoa tira foto do caderno (ou manda um print ou um PDF do sistema que usava) → a rota /api/gestao/caderno
 * lê e devolve a lista → a pessoa confere, corrige e escolhe → só então a tela salva, pelos caminhos de sempre.
 * Os arquivos não são guardados: PDF grande passa pela pasta temporária (caderno-tmp) e é apagado logo depois de ler.
 */

export type TipoDaPagina = "clientes" | "dividas" | "agenda" | "precos" | "vacinas" | "auto";
export const TIPOS_DA_PAGINA: { id: TipoDaPagina; rotulo: string; apoio: string }[] = [
  { id: "clientes", rotulo: "Clientes e pets", apoio: "Nome, telefone, pets." },
  { id: "dividas", rotulo: "Quem me deve", apoio: "Fiado, contas em aberto." },
  { id: "agenda", rotulo: "Agenda", apoio: "Horários marcados." },
  { id: "precos", rotulo: "Tabela de preços", apoio: "Serviços e quanto custam." },
  { id: "auto", rotulo: "Não sei, descubra", apoio: "A leitura descobre o que é." },
];

/** Por envio: até 5 fotos ou prints e até 2 PDFs; cada PDF com até 20 páginas e 10 MB. */
export const MAX_IMAGENS = 5;
export const MAX_PDFS = 2;
export const MAX_PAGINAS_PDF = 20;
export const MAX_BYTES_PDF = 10 * 1024 * 1024;
export const MAX_BYTES_IMAGEM = 5 * 1024 * 1024;
/**
 * A Vercel recusa pedidos acima de ~4,5 MB. Acima de 4 MB no envio, os PDFs (do maior para o menor) sobem antes para o bucket
 * privado caderno-tmp, e a rota recebe só o caminho: lê e apaga logo depois de ler (o que sobrar sai na faxina, depois de 1 hora).
 */
export const LIMITE_DO_ENVIO = 4 * 1024 * 1024;
export const BUCKET_CADERNO_TMP = "caderno-tmp";
/** <petshop>/<aleatório>.pdf, sempre na pasta do pet shop do pedido. */
export const caminhoTemporarioValido = (c: string, petshopId: string) =>
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/.test(c) && c.startsWith(`${petshopId.toLowerCase()}/`);
/** Lado maior da foto depois de diminuída no aparelho (a leitura não ganha nada acima disso). */
export const LADO_DA_FOTO = 1600;
/** Padrão do limite do dia por pet shop (o banco usa config_interna 'caderno_dia'). */
export const LIMITE_DIA_PADRAO = 30;

export type PetLido = { nome: string; especie: "cao" | "gato" | "outro"; raca: string; porte: "P" | "M" | "G" | "GG" | null };
export type ClienteLido = { nome: string; telefone: string; pets: PetLido[]; obs: string; duvida: boolean };
export type DividaLida = { cliente_nome: string; telefone: string; valor: number | null; desde: string | null; desde_texto: string; descricao: string; duvida: boolean };
export type HorarioLido = { dia: string | null; dia_texto: string; hora: string | null; pet_nome: string; tutor_nome: string; servico: string; duvida: boolean };
export type AreaLida = "banho_tosa" | "creche" | "hotel" | "loja";
export type ServicoLido = { nome: string; area: AreaLida; duracao_min: number | null; preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null; duvida: boolean };
export type TipoCuidado = "vacina" | "vermifugo" | "antipulgas" | "outro";
/** Da carteirinha: `vence` só quando a data está escrita (nunca calculada). */
export type CuidadoLido = { tipo: TipoCuidado; nome: string; aplicado: string | null; aplicado_texto: string; vence: string | null; vence_texto: string; veterinario: string; duvida: boolean };
export type Leitura = { pagina: string; clientes: ClienteLido[]; dividas: DividaLida[]; agenda: HorarioLido[]; servicos: ServicoLido[]; vacinas: CuidadoLido[]; duvidas: string[] };

/** Resposta da rota. */
export type RespostaCaderno = { leitura: Leitura; restam: number; limite: number; paginas: number } | { erro: string; mensagem: string; restam?: number; limite?: number };

const dois = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dois(m)}-${dois(d)}`;
const valida = (a: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 2000 || a > 2100) return false;
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
};
const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 864e5);

/**
 * Data escrita no caderno ("12/10", "12/10/25", "12-10-2025", "12.10") → AAAA-MM-DD, ou null se não for uma data.
 * Sem o ano: `passado` (desde quando deve) fica com a mais recente que não passa de hoje; `perto` (agenda) fica com
 * a mais perto de hoje (12/10 lido em novembro é outubro deste ano, não do ano que vem). Também aceita AAAA-MM-DD.
 */
export function lerDataDoCaderno(texto: string | null | undefined, hoje: string, modo: "passado" | "perto"): string | null {
  const s = (texto ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valida(+m[1], +m[2], +m[3]) ? iso(+m[1], +m[2], +m[3]) : null;
  m = s.match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?$/);
  if (!m) return null;
  const d = +m[1], mes = +m[2];
  if (m[3]) {
    const a = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valida(a, mes, d) ? iso(a, mes, d) : null;
  }
  const ano = +hoje.slice(0, 4);
  const opcoes = [ano - 1, ano, ano + 1].filter((a) => valida(a, mes, d)).map((a) => iso(a, mes, d));
  if (!opcoes.length) return null;
  if (modo === "passado") return opcoes.filter((o) => o <= hoje).pop() ?? null;
  return opcoes.reduce((a, b) => (Math.abs(dias(b, hoje)) < Math.abs(dias(a, hoje)) ? b : a));
}

/** "14h", "14:30", "9h30", "9 h", "14.30" → "HH:MM"; o resto, null. */
export function lerHoraDoCaderno(texto: string | null | undefined): string | null {
  const m = (texto ?? "").trim().toLowerCase().match(/^(\d{1,2})\s*(?:[:h.]\s*(\d{2})?\s*(?:min)?)?$/);
  if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0;
  return h <= 23 && mi <= 59 ? `${dois(h)}:${dois(mi)}` : null;
}

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const lista = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const sim = (v: unknown) => v === "baixa";
function especie(v: unknown): PetLido["especie"] {
  const s = texto(v, 20).toLowerCase();
  return s === "gato" ? "gato" : s === "outro" ? "outro" : "cao";
}
function porte(v: unknown): PetLido["porte"] {
  const s = texto(v, 4).toUpperCase();
  return s === "P" || s === "M" || s === "G" || s === "GG" ? s : null;
}
function valor(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 && n < 1e6 ? Math.round(n * 100) / 100 : null;
}

/**
 * Limpa o que a IA devolveu (ou a leitura de teste): só os campos conhecidos, com tamanho máximo, datas e horas
 * conferidas. Nada é inventado aqui: o que não dá para entender fica em branco e vai para `duvidas`.
 */
export function limparLeitura(bruto: unknown, hoje: string): Leitura {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const duvidas = lista(b.duvidas, 40).map((d) => texto(d, 200)).filter(Boolean);
  const clientes: ClienteLido[] = lista(b.clientes, 300).map((x) => {
    const c = (x ?? {}) as Record<string, unknown>;
    return {
      nome: texto(c.nome, 120), telefone: texto(c.telefone, 40), obs: texto(c.obs, 400), duvida: sim(c.certeza),
      pets: lista(c.pets, 8).map((y) => { const p = (y ?? {}) as Record<string, unknown>; return { nome: texto(p.nome, 80), especie: especie(p.especie), raca: texto(p.raca, 60), porte: porte(p.porte) }; }).filter((p) => p.nome),
    };
  }).filter((c) => c.nome || c.telefone || c.pets.length);
  const dividas: DividaLida[] = lista(b.dividas, 300).map((x) => {
    const d = (x ?? {}) as Record<string, unknown>;
    const desdeTexto = texto(d.desde, 20);
    const desde = lerDataDoCaderno(desdeTexto, hoje, "passado");
    const v = valor(d.valor);
    return {
      cliente_nome: texto(d.cliente_nome, 120), telefone: texto(d.telefone, 40), valor: v, desde, desde_texto: desdeTexto,
      descricao: texto(d.descricao, 120), duvida: sim(d.certeza) || v == null || (Boolean(desdeTexto) && !desde),
    };
  }).filter((d) => d.cliente_nome || d.valor != null);
  const agenda: HorarioLido[] = lista(b.agenda, 300).map((x) => {
    const a = (x ?? {}) as Record<string, unknown>;
    const diaTexto = texto(a.dia, 20);
    const dia = lerDataDoCaderno(diaTexto, hoje, "perto");
    const hora = lerHoraDoCaderno(texto(a.hora, 10));
    return { dia, dia_texto: diaTexto, hora, pet_nome: texto(a.pet_nome, 80), tutor_nome: texto(a.tutor_nome, 120), servico: texto(a.servico, 80), duvida: sim(a.certeza) || !dia || !hora };
  }).filter((a) => a.pet_nome || a.tutor_nome);
  const servicos: ServicoLido[] = lista(b.servicos, 100).map((x) => {
    const v = (x ?? {}) as Record<string, unknown>;
    const unico = valor(v.preco_unico);
    const porte = { preco_p: valor(v.preco_p), preco_m: valor(v.preco_m), preco_g: valor(v.preco_g), preco_gg: valor(v.preco_gg) };
    const temPorte = Object.values(porte).some((n) => n != null);
    const precos = temPorte ? porte : { preco_p: unico, preco_m: unico, preco_g: unico, preco_gg: unico };
    const area = texto(v.area, 12);
    const dur = typeof v.duracao_min === "number" && Number.isFinite(v.duracao_min) && v.duracao_min >= 5 && v.duracao_min <= 1440 ? Math.round(v.duracao_min) : null;
    return {
      nome: texto(v.nome, 80), area: (["creche", "hotel", "loja"].includes(area) ? area : "banho_tosa") as AreaLida, duracao_min: dur, ...precos,
      duvida: sim(v.certeza) || Object.values(precos).every((n) => n == null),
    };
  }).filter((x) => x.nome);
  const vacinas: CuidadoLido[] = lista(b.vacinas, 60).map((x) => {
    const v = (x ?? {}) as Record<string, unknown>;
    const t = texto(v.tipo, 12);
    const aplicadoTexto = texto(v.aplicada, 20), venceTexto = texto(v.proxima, 20);
    const aplicado = lerDataDoCaderno(aplicadoTexto, hoje, "passado");
    const vence = lerDataDoCaderno(venceTexto, hoje, "perto");
    return {
      tipo: (["vacina", "vermifugo", "antipulgas"].includes(t) ? t : "outro") as TipoCuidado, nome: texto(v.nome, 80),
      aplicado, aplicado_texto: aplicadoTexto, vence, vence_texto: venceTexto, veterinario: texto(v.veterinario, 120),
      duvida: sim(v.certeza) || (Boolean(aplicadoTexto) && !aplicado) || (Boolean(venceTexto) && !vence),
    };
  }).filter((x) => x.nome);
  return { pagina: texto(b.pagina, 20) || "nada", clientes, dividas, agenda, servicos, vacinas, duvidas };
}
