import type { Banco } from "./supabase";
import { reduzirFoto } from "./foto";
import { opcao } from "./opcoes";
import { chamar, deIsoDia } from "./util";

/**
 * Checklist de entrada com termo: como o pet chegou (temperamento, cuidados, o que já tinha no corpo, idoso ou doente, pertences
 * e observações) e o aceite do tutor (assinatura com o dedo no aparelho da loja, ou "Li e concordo" pelo link no WhatsApp).
 * Banco: supabase/migrations/20261202000000_gestao_checklist_entrada.sql.
 */
export const BUCKET_ENTRADA = "entrada";
export const MAX_FOTOS_ENTRADA = 4;
export const DIAS_DO_LINK = 7;
/** A assinatura das fotos para a página pública vale um dia a mais que o link. */
const SEGUNDOS_DA_ASSINATURA = (DIAS_DO_LINK + 1) * 86400;
const LIMITE_BYTES = 1_400_000;

export type Opcao = { id: string; rotulo: string };
export const TEMPERAMENTOS: Opcao[] = [
  { id: "calmo", rotulo: "Calmo" }, { id: "agitado", rotulo: "Agitado" }, { id: "morde", rotulo: "Morde" }, { id: "medo", rotulo: "Com medo" },
];
export const LESOES: Opcao[] = [
  { id: "ferida", rotulo: "Ferida" }, { id: "lesao", rotulo: "Lesão ou machucado" }, { id: "pulgas", rotulo: "Pulgas" },
  { id: "carrapatos", rotulo: "Carrapatos" }, { id: "nos", rotulo: "Nós no pelo" },
];
export const PERTENCES: Opcao[] = [
  { id: "coleira", rotulo: "Coleira" }, { id: "guia", rotulo: "Guia" }, { id: "caminha", rotulo: "Caminha" },
  { id: "brinquedo", rotulo: "Brinquedo" }, { id: "remedio", rotulo: "Remédio" }, { id: "racao", rotulo: "Ração" },
];
/**
 * Os atalhos "Como o pet chegou" do horário (pulgas, nós, pele, ouvido, unhas, agitado) viram o começo do Conferir a entrada:
 * uma lista só. O que o tosador tocou no atalho já vem marcado na conferência que o tutor assina.
 */
export function entradaPelosAtalhos(atalhos: Record<string, boolean> | null | undefined): { temperamento: string[]; lesoes: string[]; lesoesObs: string } {
  const a = atalhos ?? {};
  const lesoes = [a.pulgas ? "pulgas" : null, a.nos ? "nos" : null, a.pele ? "ferida" : null].filter((x): x is string => Boolean(x));
  const obs = [a.pele ? "Ferida ou irritação na pele" : null, a.ouvido ? "Ouvido sujo ou com cheiro" : null, a.unhas ? "Unhas compridas" : null].filter(Boolean).join(". ");
  return { temperamento: a.agitado ? ["agitado"] : [], lesoes, lesoesObs: obs ? `${obs}.` : "" };
}
const rotuloDe = (lista: Opcao[], id: string) => lista.find((o) => o.id === id)?.rotulo ?? id;
export const rotulos = (lista: Opcao[], ids: readonly string[]) => lista.filter((o) => ids.includes(o.id)).map((o) => o.rotulo);

/** "coleira, caminha e brinquedo" */
export function emLista(itens: string[]): string {
  const l = itens.map((x) => x.trim()).filter(Boolean);
  return l.length <= 1 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}

/* ---------- opções do pet shop ---------- */

/** Quando a folha abre sozinha no Chegou / check-in: só pet idoso (padrão), todos, ou nunca (só pelo botão). Sempre dá para pular. */
export const CHAVE_EXIGIR = "entrada.exigir";
export type Exigir = "idosos" | "todos" | "opcional";
/** O texto do aceite, do pet shop (vazio = TERMO_PADRAO). "{pet}" vira o nome do pet. */
export const CHAVE_TERMO = "entrada.termo";
export const IDADE_IDOSO = 8;

export const TERMO_PADRAO = `Conferi com a equipe como {pet} chegou hoje: o temperamento, as alergias e os cuidados, as feridas, pulgas, carrapatos ou nós que já existiam antes do atendimento e os pertences que deixei.
Contei tudo o que sei sobre a saúde de {pet}. Entendo que pets idosos, doentes, agitados ou com medo podem se cansar ou se estressar com o banho, a secagem, a tosa ou a estadia, mesmo com todo o cuidado. Se a equipe perceber que {pet} não está bem, ela pode parar o que estiver fazendo e vai me avisar.`;

/** O texto padrão com as palavras do negócio: quem não tem banho e tosa não lê "banho, secagem e tosa" (só a estadia). */
export function termoPadraoPara(petshop: { modulos?: string[] | null }): string {
  const semBanho = Array.isArray(petshop.modulos) && petshop.modulos.length > 0 && !petshop.modulos.includes("banho_tosa");
  return semBanho ? TERMO_PADRAO.replace("com o banho, a secagem, a tosa ou a estadia", "com a estadia").replace("parar o que estiver fazendo", "parar a atividade") : TERMO_PADRAO;
}
export function exigirDo(petshop: { opcoes?: unknown }): Exigir {
  const v = opcao<string>(petshop, CHAVE_EXIGIR, "idosos");
  return v === "todos" || v === "opcional" ? v : "idosos";
}
export const termoDoPetshop = (petshop: { opcoes?: unknown; modulos?: string[] | null }) => opcao<string>(petshop, CHAVE_TERMO, "").trim() || termoPadraoPara(petshop);
/** O texto que o tutor lê, com o nome do pet. */
export const termoComPet = (modelo: string, pet: string) => modelo.replace(/\{pet\}/g, pet.trim() || "o pet").trim();

/** Anos completos pela data de nascimento (null sem data). */
export function anosDe(nascimento: string | null | undefined, hoje = new Date()): number | null {
  if (!nascimento || !/^\d{4}-\d{2}-\d{2}/.test(nascimento) || nascimento.startsWith("1904-")) return null;
  const n = deIsoDia(nascimento.slice(0, 10));
  let a = hoje.getFullYear() - n.getFullYear();
  if (hoje.getMonth() < n.getMonth() || (hoje.getMonth() === n.getMonth() && hoje.getDate() < n.getDate())) a--;
  return a;
}
export const ehIdoso = (nascimento: string | null | undefined, hoje = new Date()) => (anosDe(nascimento, hoje) ?? 0) >= IDADE_IDOSO;

/** A folha abre sozinha no Chegou / check-in? */
export function abreSozinha(petshop: { opcoes?: unknown }, nascimento: string | null | undefined, hoje = new Date()): boolean {
  const e = exigirDo(petshop);
  return e === "todos" || (e === "idosos" && ehIdoso(nascimento, hoje));
}

/* ---------- a entrada ---------- */

export type Entrada = {
  id: string; petshop_id: string; pet_id: string; agendamento_id: string | null; estadia_id: string | null;
  temperamento: string[]; cuidados: string | null; lesoes: string[]; lesoes_obs: string | null; idoso_doente: boolean;
  pertences: string[]; pertences_outros: string | null; obs: string | null; fotos: string[]; termo: string;
  aceite: "aparelho" | "link" | null; aceite_nome: string | null; aceite_assinatura: string | null; aceito_em: string | null;
  aceite_ip: string | null; aceite_navegador: string | null; token: string | null; token_expira: string | null; link_criado_em: string | null;
  devolvido_em: string | null; criado_em: string; atualizado_em: string;
};
export const COLS_ENTRADA = "id, petshop_id, pet_id, agendamento_id, estadia_id, temperamento, cuidados, lesoes, lesoes_obs, idoso_doente, pertences, pertences_outros, obs, fotos, termo, aceite, aceite_nome, aceite_assinatura, aceito_em, aceite_ip, aceite_navegador, token, token_expira, link_criado_em, devolvido_em, criado_em, atualizado_em";

/** Os pertences para devolver, por extenso: ["Coleira", "Caminha", "Casinha azul"]. */
export function pertencesDe(e: Pick<Entrada, "pertences" | "pertences_outros">): string[] {
  const outros = e.pertences_outros?.trim() ?? "";
  const minus = (x: string) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // "Remédio" marcado e "remédio da artrose" escrito: fica só "remédio da artrose" (não "remédio e remédio da artrose")
  const marcados = rotulos(PERTENCES, e.pertences).filter((r) => !outros || !minus(outros).includes(minus(r)));
  return [...marcados, ...(outros ? [outros] : [])];
}
/** "Devolver: coleira, caminha e casinha azul" (vazio: nada a devolver). */
export function textoDevolver(e: Pick<Entrada, "pertences" | "pertences_outros">): string {
  const l = pertencesDe(e);
  const marcados = l.length - (e.pertences_outros?.trim() ? 1 : 0);
  return l.length ? `Devolver: ${emLista(l.map((x, i) => (i < marcados ? x.toLowerCase() : x)))}` : "";
}
/** O link de aceite ainda vale? */
export const linkValendo = (e: Pick<Entrada, "token" | "token_expira">, agora = new Date()) => Boolean(e.token && e.token_expira && new Date(e.token_expira) > agora);

/** "Entrada conferida ✓ · aceite do tutor ✓" / "· aceite do tutor pendente". */
export function situacaoDaEntrada(e: Pick<Entrada, "aceito_em"> | null): string {
  if (!e) return "Entrada não conferida";
  return `Entrada conferida ✓ · aceite do tutor ${e.aceito_em ? "✓" : "pendente"}`;
}

/** As linhas do resumo (para o comprovante, a página do tutor e a mensagem). */
export function resumoDaEntrada(e: Pick<Entrada, "temperamento" | "cuidados" | "lesoes" | "lesoes_obs" | "idoso_doente" | "pertences" | "pertences_outros" | "obs">) {
  const linhas: { rotulo: string; texto: string }[] = [];
  const t = rotulos(TEMPERAMENTOS, e.temperamento);
  if (t.length) linhas.push({ rotulo: "Temperamento", texto: emLista(t) });
  if (e.cuidados?.trim()) linhas.push({ rotulo: "Alergias e cuidados", texto: e.cuidados.trim() });
  const l = rotulos(LESOES, e.lesoes);
  linhas.push({ rotulo: "Já chegou com", texto: [l.length ? emLista(l) : "", e.lesoes_obs?.trim() ?? ""].filter(Boolean).join(". ") || "Nada anotado" });
  if (e.idoso_doente) linhas.push({ rotulo: "Saúde", texto: "Pet idoso ou doente: manuseio com mais cuidado" });
  const p = pertencesDe(e);
  linhas.push({ rotulo: "Pertences deixados", texto: p.length ? emLista(p) : "Nenhum" });
  if (e.obs?.trim()) linhas.push({ rotulo: "Observações", texto: e.obs.trim() });
  return linhas;
}
export { rotuloDe };

/* ---------- link e mensagem ---------- */

export const enderecoDaEntrada = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/gestao/entrada/${token}`;

/** "Oi, Ana! Antes do banho, confira como o Thor chegou e dê o seu ok: <link>". */
export function mensagemDaEntrada(p: { tutor: string | null | undefined; pet: string; url: string }) {
  const quem = chamar(p.tutor);
  return `${quem ? `Oi, ${quem}!` : "Oi!"} Anotamos como ${p.pet} chegou aqui hoje. Confira e dê o seu ok: ${p.url}`;
}

/* ---------- arquivos ---------- */

async function prepararFoto(f: File): Promise<Blob> {
  if (f.type && !f.type.startsWith("image/")) throw new Error(`"${f.name}" não é uma foto.`);
  try {
    let b = await reduzirFoto(f, 1600, 0.82);
    if (b.size > LIMITE_BYTES) b = await reduzirFoto(f, 1280, 0.72);
    if (b.size > LIMITE_BYTES) b = await reduzirFoto(f, 1024, 0.6);
    return b;
  } catch { throw new Error(`Não consegui ler "${f.name}". Escolha uma foto JPG ou PNG.`); }
}

/**
 * Uma foto da folha de entrada. `pendente`: escolhida, mas ainda não subiu (ou não conseguiu subir). Ela continua na folha
 * (com a prévia do aparelho) para tentar de novo, e a entrada pode ser salva sem ela: a foto nunca some sem aviso.
 */
export type FotoDaEntrada = { caminho: string; url: string; pendente?: { arquivo: Blob; estado: "subindo" | "falhou"; erro?: string } };

/** Reduz a foto no aparelho (o erro aqui é da foto, não da internet: não adianta tentar de novo). */
export const prepararFotoDaEntrada = prepararFoto;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Desiste de uma tentativa que passa disto (internet fraca): a próxima tentativa começa do zero. */
export const TEMPO_DA_FOTO_MS = 20000;

/**
 * Sobe a foto já reduzida, tentando de novo quando a internet ou o servidor falham (até 3 vezes, com uma pausa entre elas).
 * Cada tentativa vai para um arquivo novo: uma tentativa que demorou e chegou depois fica sem uso e sai na faxina.
 */
export async function subirFotoDaEntrada(sb: Banco, petshopId: string, blob: Blob, tentativas = 3, tempo = TEMPO_DA_FOTO_MS): Promise<string> {
  let ultimo: unknown = null;
  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await esperar(1000 * i);
    const caminho = `${petshopId}/${crypto.randomUUID()}.jpg`;
    try {
      const up = await Promise.race([
        sb.storage.from(BUCKET_ENTRADA).upload(caminho, blob, { contentType: "image/jpeg" }),
        esperar(tempo).then(() => ({ error: { message: "tempo esgotado" } })),
      ]);
      if (!up.error) return caminho;
      if (up.error.message.includes("size")) throw Object.assign(new Error("A foto ficou grande demais."), { final: true });
      ultimo = up.error;
    } catch (e) {
      if ((e as { final?: boolean }).final) throw e;
      ultimo = e;
    }
  }
  throw new Error(`A foto não subiu${ultimo ? " (a internet ou o servidor demoraram)" : ""}. Ela continua na folha: toque em Tentar de novo.`);
}

/** Reduz a foto no aparelho (até 1600 px, JPEG) e sobe para o bucket privado. */
export async function enviarFotoDaEntrada(sb: Banco, petshopId: string, f: File): Promise<FotoDaEntrada> {
  const blob = await prepararFoto(f);
  const caminho = `${petshopId}/${crypto.randomUUID()}.jpg`;
  const up = await sb.storage.from(BUCKET_ENTRADA).upload(caminho, blob, { contentType: "image/jpeg" });
  if (up.error) throw new Error(up.error.message.includes("size") ? "A foto ficou grande demais." : "A foto não subiu. Confira a internet e tente de novo.");
  return { caminho, url: URL.createObjectURL(blob) };
}

/** Sobe a assinatura (PNG do quadro) e devolve o caminho. */
export async function enviarAssinatura(sb: Banco, petshopId: string, png: Blob): Promise<string> {
  const caminho = `${petshopId}/${crypto.randomUUID()}.png`;
  const up = await sb.storage.from(BUCKET_ENTRADA).upload(caminho, png, { contentType: "image/png" });
  if (up.error) throw new Error("A assinatura não subiu. Confira a internet e tente de novo.");
  return caminho;
}

/** Endereços para a equipe ver (1 hora). */
export async function enderecosDosArquivos(sb: Banco, caminhos: string[]): Promise<Map<string, string>> {
  if (!caminhos.length) return new Map();
  const s = await sb.storage.from(BUCKET_ENTRADA).createSignedUrls(caminhos, 3600);
  return new Map((s.data ?? []).filter((x) => x.signedUrl).map((x) => [x.path ?? "", x.signedUrl as string]));
}

/** As assinaturas das fotos para a página do tutor (o link vale 7 dias; elas, 8). */
export async function assinarParaOLink(sb: Banco, fotos: string[]): Promise<{ caminho: string; assinatura: string }[]> {
  if (!fotos.length) return [];
  const s = await sb.storage.from(BUCKET_ENTRADA).createSignedUrls(fotos, SEGUNDOS_DA_ASSINATURA);
  if (s.error) throw new Error("Não consegui preparar as fotos para o link. Tente de novo.");
  return (s.data ?? []).map((x) => ({ caminho: x.path ?? "", assinatura: x.signedUrl ? new URL(x.signedUrl, "http://x").searchParams.get("token") ?? "" : "" }));
}

/** Apaga do bucket o arquivo que subiu e não entrou na entrada. */
export const descartarArquivo = (sb: Banco, caminho: string) => void sb.storage.from(BUCKET_ENTRADA).remove([caminho]);

/** A faxina: apaga os arquivos da fila. Silenciosa. */
export async function faxinaDaEntrada(sb: Banco, petshopId: string): Promise<number> {
  const r = await sb.rpc("entrada_faxina", { p_petshop: petshopId });
  if (r.error) throw new Error(r.error.message);
  const apagar = ((r.data ?? {}) as { apagar?: string[] }).apagar ?? [];
  let n = 0;
  for (let i = 0; i < apagar.length; i += 100) {
    const x = await sb.storage.from(BUCKET_ENTRADA).remove(apagar.slice(i, i + 100));
    if (!x.error) n += x.data?.length ?? 0;
  }
  return n;
}
