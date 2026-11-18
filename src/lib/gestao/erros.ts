/**
 * Erros que as pessoas encontram (navegador e servidor): limpeza e resumo, sem dado pessoal.
 *
 * Vai para o banco (função `erro_registrar`, migração 20261180): mensagem curta (500), nome do erro, até 6 linhas da pilha
 * com arquivo:linha (sem endereço do site e sem `?…`), rota sem ids nem fichas (`:id`), versão, tamanho da tela, navegador,
 * pet shop (id) e aparelho (número aleatório deste navegador). Papel e áreas o banco tira de quem está logado.
 * Nunca vai: nome, telefone, e-mail, valor, corpo de pedido, ficha (token), âncora (#) do endereço.
 * O banco limpa de novo (`erro_limpar`). Funções puras: testadas em testes/unidade/erros.js.
 */

export const LIMITES = { mensagem: 500, pilha: 1500, linhas: 6, rota: 200, nome: 80 } as const;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Tira de um texto livre o que pode identificar alguém ou dar acesso. */
export function limparTexto(s: unknown, max: number = LIMITES.mensagem): string {
  let v = String(s ?? "").slice(0, 4000);
  v = v.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ");
  v = v.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
  v = v.replace(UUID, ":id");
  // endereço com consulta ou âncora: fica só o caminho (mantém o :linha:coluna da pilha)
  v = v.replace(/(\S)[?#][^\s)'"]*?(?=:\d+:\d+|[\s)'"]|$)/g, "$1");
  v = v.replace(/eyJ[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*/g, ":token");
  v = v.replace(/\b(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{32,}/g, ":token"); // nomes de arquivo do site (até ~30) ficam
  v = v.replace(/\b(Bearer)\s+\S+/g, "$1 :token").replace(/\b(apikey|token|senha|password|secret)\s*[:=]\s*\S+/gi, "$1=:token");
  v = v.replace(/R\$\s?-?\d[\d.,]*/g, "R$ :valor");
  v = v.replace(/\d{8,}/g, ":n");
  v = v.replace(/\+?\(?\d{2,3}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g, ":n");
  v = v.replace(/\s+/g, " ").trim();
  return v.length > max ? v.slice(0, max - 1) + "…" : v;
}

/** Só o caminho, com ids, fichas e códigos trocados por `:id`. Ex.: /gestao/tutor/AbC123…/foto/9 → /gestao/tutor/:id/foto/:id */
export function limparRota(endereco: unknown): string {
  let c = String(endereco ?? "");
  try { if (/^https?:\/\//i.test(c)) c = new URL(c).pathname; } catch { /* segue com o texto */ }
  c = c.split(/[?#]/)[0] || "/";
  const partes = c.split("/");
  const fora = new Set(["tutor", "agendar", "pedido", "foto"]); // o que vem depois destes é ficha, código ou id
  const saida = partes.map((p, i) => {
    if (!p) return p;
    let d = p;
    try { d = decodeURIComponent(p); } catch { /* segue */ }
    if (i > 0 && fora.has(partes[i - 1])) return ":id";
    if (UUID.test(d)) { UUID.lastIndex = 0; return ":id"; }
    UUID.lastIndex = 0;
    if (/^\d+$/.test(d) || d.includes("@") || /\s/.test(d)) return ":id";
    if (d.length >= 16 && /\d/.test(d) && /[a-z]/i.test(d)) return ":id";
    if (d.length > 40) return ":id";
    return d;
  });
  const r = saida.join("/");
  return r.length > LIMITES.rota ? r.slice(0, LIMITES.rota) : r;
}

/**
 * Até 6 linhas da pilha, só as que apontam um arquivo, no formato "função (arquivo:linha:coluna)", sem o endereço do site
 * e sem consulta. Chrome ("    at f (https://x/_next/a.js:1:2)") e Firefox/Safari ("f@https://x/_next/a.js:1:2").
 */
export function limparPilha(pilha: unknown): string {
  const linhas = String(pilha ?? "").split("\n").slice(0, 60);
  const quadros: string[] = [];
  for (const bruta of linhas) {
    const l = bruta.trim();
    let fn = "", arq = "";
    let m = /^at (?:(.+?) \()?(.+?)\)?$/.exec(l);
    if (m) { fn = m[1] ?? ""; arq = m[2]; } else if ((m = /^(.*?)@(.+)$/.exec(l))) { fn = m[1]; arq = m[2]; } else continue;
    if (!/:\d+(:\d+)?$/.test(arq) && !/^(native|<anonymous>)$/.test(arq)) continue;
    if (/^(chrome|moz|safari(-web)?)-extension:/.test(arq)) continue;
    arq = arq.replace(/^(https?:\/\/[^/]+|webpack-internal:\/\/\/?|file:\/\/)/, "");
    arq = arq.replace(/[?#][^:]*(?=:\d+(:\d+)?$)/, "");
    fn = fn.replace(/[^\w$.<>\[\] -]/g, "").slice(0, 60);
    quadros.push(limparTexto(fn ? `${fn} (${arq})` : arq, 250));
    if (quadros.length >= LIMITES.linhas) break;
  }
  const r = quadros.join("\n");
  return r.length > LIMITES.pilha ? r.slice(0, LIMITES.pilha) : r;
}

/** Família e versão do navegador, mais o sistema: "Chrome 131 · Android". */
export function navegadorDe(ua: unknown): string {
  const u = String(ua ?? "");
  const so = /Android/.test(u) ? "Android" : /iPhone|iPad|iPod/.test(u) ? "iOS" : /Windows/.test(u) ? "Windows" : /Mac OS X|Macintosh/.test(u) ? "Mac" : /Linux|CrOS/.test(u) ? "Linux" : "";
  const tenta: [string, RegExp][] = [
    ["Edge", /Edg(?:e|A|iOS)?\/(\d+)/], ["Samsung", /SamsungBrowser\/(\d+)/], ["Opera", /(?:OPR|Opera)\/(\d+)/],
    ["Firefox", /(?:Firefox|FxiOS)\/(\d+)/], ["Chrome", /(?:Chrome|CriOS)\/(\d+)/], ["Safari", /Version\/(\d+)[\d.]* .*Safari/],
  ];
  let nav = "Outro";
  for (const [n, re] of tenta) { const m = re.exec(u); if (m) { nav = `${n} ${m[1]}`; break; } }
  if (/HeadlessChrome/.test(u)) nav = nav.replace("Chrome", "Chrome sem tela");
  return so ? `${nav} · ${so}` : nav;
}

/** O banco ou o servidor desistiu por demora (tempo esgotado da consulta, do gateway ou da função). */
export const ehDemora = (m: string) =>
  /statement timeout|canceling statement|\b57014\b|lock timeout|timed? ?out|Gateway Time-?out|\b50[4]\b|\b544\b|FUNCTION_INVOCATION_TIMEOUT/i.test(m);

/**
 * Erro técnico (do banco ou do servidor) trocado por uma frase que a pessoa entende; null quando o texto já é para a pessoa ler
 * (as recusas das regras do banco). Nunca mostra o texto em inglês do banco.
 */
export function textoAmigavel(m: string): string | null {
  if (ehDemora(m)) return "Demorou demais, tente de novo.";
  if (/\b50[0-3]\b|Internal Server Error|Bad Gateway|Service Unavailable|upstream/i.test(m)) return "O servidor falhou agora. Tente de novo em instantes.";
  // a gravação não achou a linha: quase sempre a pessoa não tem a área para mudar aquilo (o banco esconde a linha), ou alguém apagou
  if (/Cannot coerce the result to a single JSON object|JSON object requested, multiple \(or no\) rows returned|PGRST116/i.test(m)) {
    return "Não deu para mudar: o seu acesso não permite isso, ou o item já não existe. Atualize a tela; se precisar, fale com o dono.";
  }
  if (/row-level security|permission denied for/i.test(m)) return "O seu acesso não permite fazer isso. Fale com o dono do pet shop.";
  if (/does not exist|schema cache|Could not find the|syntax error|invalid input syntax|operator does not exist|is ambiguous|PGRST\d|null value in column|could not serialize|deadlock detected|too many connections|remaining connection slots/i.test(m)) {
    return "Algo deu errado do nosso lado. Tente de novo; se continuar, fale com o suporte.";
  }
  return null;
}

/** Texto de erro de rede: sem internet ou servidor que não respondeu. */
export const ehDeRede = (m: string) => /Failed to fetch|NetworkError|Load failed|network ?error|ERR_INTERNET_DISCONNECTED|fetch failed/i.test(m);

/** Erros que não valem registro: ruído do navegador, extensões, cancelamentos e o Mozart fora do ar (resposta 503 esperada). */
export function ignorar(mensagem: string, nome = "", pilha = ""): boolean {
  if (!mensagem && !pilha) return true;
  if (/^Script error\.?$/i.test(mensagem)) return true; // de outro site, sem detalhe
  if (/ResizeObserver loop/i.test(mensagem)) return true;
  if (nome === "AbortError" || /aborted|The operation was aborted|signal is aborted/i.test(mensagem)) return true;
  if (/(chrome|moz|safari(-web)?)-extension:/.test(pilha)) return true;
  if (/Mozart está fora do ar|Mozart fora do ar|sem_chave|\b503\b/i.test(mensagem)) return true;
  if (/NEXT_REDIRECT|NEXT_NOT_FOUND/.test(mensagem)) return true; // navegação do Next, não é erro
  return false;
}

/**
 * Erro mostrado num aviso (toast) ou na tela: vale registrar? Erros do banco com texto técnico e falhas do código sim;
 * frases escritas para a pessoa ("Escolha um horário.", recusas das regras do banco) não. Sem internet só conta.
 */
export function classificar(e: unknown, online: boolean): "banco" | "erro" | "sem_internet" | null {
  const msg = mensagemDe(e);
  const nome = e instanceof Error ? e.name : "";
  if (ehDeRede(msg)) return online ? "banco" : "sem_internet";
  if (ignorar(msg, nome, e instanceof Error ? e.stack ?? "" : "")) return null;
  if (e instanceof Error && /^(TypeError|ReferenceError|RangeError|SyntaxError|ChunkLoadError|URIError)$/.test(e.name)) return "erro";
  const codigo = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code ?? "") : "";
  if (codigo === "P0001" || codigo === "23505") return null; // frase de uma regra do banco, feita para a pessoa ler; "já cadastrado"
  if (codigo && /^(PGRST|42|22|23|25|40|53|54|57|XX)/.test(codigo)) return "banco";
  if (/row-level security|permission denied|violates|does not exist|Could not find|schema cache|invalid input syntax|PGRST\d|JSON object requested|null value in column|canceling statement|statement timeout|syntax error|could not|operator does not exist|is ambiguous|out of range|too many|JWT|Internal Server Error|Bad Gateway|upstream|\b50[0-4]\b/i.test(msg)) return "banco";
  return null;
}

export function mensagemDe(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message ?? "");
  return typeof e === "string" ? e : "";
}

export type TipoErro = "erro" | "promessa" | "tela" | "banco" | "servidor";

export type ErroApp = {
  p_origem: "navegador" | "servidor";
  p_tipo: TipoErro;
  p_mensagem: string;
  p_nome?: string;
  p_pilha?: string;
  p_rota?: string;
  p_versao?: string;
  p_navegador?: string;
  p_tela?: string;
  p_petshop?: string;
  p_aparelho?: string;
  p_sem_internet?: boolean;
};

/** Monta o que vai para o banco, já limpo. */
export function montarErro(a: {
  erro: unknown; tipo: TipoErro; origem?: "navegador" | "servidor"; rota?: string; versao?: string | null; ua?: string;
  largura?: number; altura?: number; petshop?: string | null; aparelho?: string | null; codigo?: string | null;
}): ErroApp {
  const e = a.erro;
  const nome = e instanceof Error ? e.name : typeof e === "object" && e && "name" in e ? String((e as { name: unknown }).name) : "";
  const codigo = a.codigo ?? (typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code ?? "") : "");
  const msg = mensagemDe(e) || (typeof e === "object" ? "" : String(e ?? ""));
  const pilha = e instanceof Error ? e.stack : typeof e === "object" && e && "stack" in e ? String((e as { stack: unknown }).stack) : "";
  const r: ErroApp = {
    p_origem: a.origem ?? "navegador",
    p_tipo: a.tipo,
    p_mensagem: limparTexto((codigo ? `[${codigo}] ` : "") + (msg || "(sem mensagem)")),
    p_nome: limparTexto(nome, LIMITES.nome).replace(/[^\w .:-]/g, "") || undefined,
    p_pilha: limparPilha(pilha) || undefined,
    p_rota: a.rota ? limparRota(a.rota) : undefined,
    p_versao: a.versao ? String(a.versao).replace(/[^\w.-]/g, "").slice(0, 40) : undefined,
    p_navegador: a.ua ? navegadorDe(a.ua) : undefined,
    p_tela: a.largura && a.altura ? `${Math.round(a.largura)}x${Math.round(a.altura)}` : undefined,
    p_aparelho: a.aparelho ? a.aparelho.replace(/[^\w-]/g, "").slice(0, 40) : undefined,
  };
  if (a.petshop && /^[0-9a-f-]{36}$/i.test(a.petshop)) r.p_petshop = a.petshop;
  return r;
}

/** Versão do aplicativo (commit da Vercel, cortado; ou a do build local). */
export const VERSAO_APP = (process.env.NEXT_PUBLIC_GESTAO_VERSAO || "").slice(0, 12) || "local";
