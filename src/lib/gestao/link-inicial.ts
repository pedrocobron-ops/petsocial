/**
 * A abertura do link do cliente: o que a página lê ao abrir, numa ida só ao banco (`link_inicial`, migração 20261229, que
 * junta as funções públicas de sempre). Serve ao servidor (`link-servidor.ts`) e ao navegador (quando o servidor não
 * conseguiu ler, a página lê sozinha: também numa ida só, não em oito). Só em banco de antes da migração valem as oito
 * leituras ao mesmo tempo. Sem importações: dá para testar sozinho.
 */

/** O que a página do link lê ao abrir, cru como o banco devolve (a página faz as mesmas contas de antes). */
export type LinkInicial = {
  /** resposta de link_info (null = link desligado ou inexistente) */
  info: unknown;
  /** link_nome, para a página do link desligado dizer com quem falar */
  nome: string | null;
  /** link_contato (migração 20261235): o WhatsApp de quem é o link, para a página do link desligado ter o botão */
  telefone?: string | null;
  google: string | null;
  promocoes: unknown[];
  fechados: string[];
  ia: boolean;
  /** link_hotel_opcoes.preco: undefined quando o link não oferece hotel */
  precoHotel?: unknown;
  /** link_opcoes.termos (regras que o tutor aceita) */
  termos: unknown;
};

export type RespostaDoBanco = { data: unknown; error: unknown };
export type LeitorDoLink = (f: string, a: Record<string, unknown>) => Promise<RespostaDoBanco>;

/** Monta o que a página recebe a partir das partes (as mesmas contas de sempre). `opcoesFalhou`: termos fica indefinido. */
export function montarLinkInicial(x: { info: unknown; nome: unknown; contato?: unknown; google: unknown; promocoes: unknown; fechados: unknown; ia: unknown; hotel: unknown; opcoes: unknown }, opcoesFalhou = false): LinkInicial {
  const lido = x.info as { nome?: unknown; hotel?: unknown } | null;
  const valido = !!lido && typeof lido === "object" && !!lido.nome;
  const preco = (x.hotel as { preco?: unknown } | null)?.preco;
  const termos = opcoesFalhou ? undefined : ((x.opcoes as { termos?: unknown } | null)?.termos ?? null);
  const contato = x.contato && typeof x.contato === "object" ? (x.contato as { nome?: unknown; telefone?: unknown }) : null;
  const nome = typeof x.nome === "string" && x.nome.trim() ? x.nome.trim() : typeof contato?.nome === "string" && contato.nome.trim() ? contato.nome.trim() : null;
  return {
    info: x.info ?? null,
    nome,
    ...(typeof contato?.telefone === "string" && contato.telefone.trim() ? { telefone: contato.telefone.trim() } : {}),
    google: typeof x.google === "string" ? x.google : null,
    promocoes: Array.isArray(x.promocoes) ? x.promocoes : [],
    fechados: Array.isArray(x.fechados) ? (x.fechados as string[]) : [],
    ia: valido && x.ia === true,
    ...(valido && lido.hotel ? { precoHotel: preco && typeof preco === "object" ? preco : null } : {}),
    termos,
  };
}

/** A função não existe neste banco (antes da migração 20261229): aí, e só aí, vale ler as oito partes uma a uma. */
export const funcaoNaoExiste = (e: unknown) => {
  const x = (e ?? {}) as { code?: unknown; message?: unknown };
  return /^(PGRST202|42883)$/.test(String(x.code ?? "")) || /Could not find the function/i.test(String(x.message ?? ""));
};

/**
 * Lê a abertura do link: `link_inicial` numa ida só; em banco de antes da migração, as oito leituras ao mesmo tempo.
 * Se o banco demorou ou falhou, devolve undefined, sem repetir em oito.
 */
export async function lerLinkJunto(ler: LeitorDoLink, codigo: string): Promise<LinkInicial | undefined> {
  const p = { p_codigo: codigo };
  const junto = await ler("link_inicial", p);
  if (!junto.error && junto.data && typeof junto.data === "object" && !Array.isArray(junto.data)) {
    return montarLinkInicial(junto.data as Parameters<typeof montarLinkInicial>[0]);
  }
  if (junto.error && !funcaoNaoExiste(junto.error)) return undefined;
  const [info, nome, google, promocoes, fechados, ia, hotel, opcoes] = await Promise.all([
    ler("link_info", p), ler("link_nome", p), ler("link_google", p), ler("link_promocoes", p),
    ler("link_fechados", p), ler("link_ia_ligada", p), ler("link_hotel_opcoes", p), ler("link_opcoes", p),
  ]);
  if (info.error) return undefined;
  return montarLinkInicial({ info: info.data, nome: nome.data, google: google.data, promocoes: promocoes.data, fechados: fechados.data, ia: ia.data, hotel: hotel.data, opcoes: opcoes.data }, !!opcoes.error);
}
