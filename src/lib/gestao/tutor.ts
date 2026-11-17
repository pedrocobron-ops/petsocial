import type { Banco } from "./supabase";
import { saudacaoZap } from "./agenda";
import { reduzirFoto } from "./foto";
import { opcao } from "./opcoes";

/**
 * Página do tutor (opção "casa.tutor", desligada por padrão): a equipe põe fotos no dia do pet na creche e no hotel, e cada
 * tutor tem um link particular (/gestao/tutor/<código>) com o diário, as fotos, o que está marcado e os avisos de vacina.
 * As fotos ficam no bucket privado "diario" (nunca endereço público). Banco: supabase/migrations/20261163000000_gestao_pagina_do_tutor.sql.
 */
type ComOpcoes = { opcoes?: unknown };
export const CHAVE_TUTOR = "casa.tutor";
export const BUCKET_DIARIO = "diario";
/** O banco aceita até 10 fotos por pet por dia e 1,5 MB por foto. */
export const MAX_FOTOS_DIA = 10;
const LIMITE_BYTES = 1_400_000;

export function paginaDoTutorLigada(p: ComOpcoes): boolean {
  const o = opcao<unknown>(p, CHAVE_TUTOR, {});
  return Boolean(o && typeof o === "object" && (o as Record<string, unknown>).ativo === true);
}

/** Por quantos dias as fotos ficam guardadas (o banco aceita só estes; o padrão é 90). Depois disso, a faxina apaga. */
export const DIAS_DAS_FOTOS = [30, 60, 90, 180] as const;
export type DiasDasFotos = (typeof DIAS_DAS_FOTOS)[number];
export function diasDasFotos(p: ComOpcoes): DiasDasFotos {
  const o = opcao<unknown>(p, CHAVE_TUTOR, {});
  const v = o && typeof o === "object" ? Number((o as Record<string, unknown>).dias_fotos) : NaN;
  return (DIAS_DAS_FOTOS as readonly number[]).includes(v) ? (v as DiasDasFotos) : 90;
}
/** A opção já foi ligada alguma vez (então pode haver fotos para a faxina, mesmo desligada agora). */
export const tutorJaUsado = (p: ComOpcoes) => opcao<unknown>(p, CHAVE_TUTOR, null) !== null;

export const enderecoDaPagina = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/gestao/tutor/${token}`;

/** O link que o tutor já tem, sem criar um novo (abrir uma tela não cria link: só Mandar ou Copiar). */
export async function linkExistente(sb: Banco, clienteId: string): Promise<{ url: string | null; visto: string | null }> {
  const r = await sb.from("tutor_links").select("token, visto_em").eq("cliente_id", clienteId).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return { url: r.data?.token ? enderecoDaPagina(r.data.token) : null, visto: r.data?.visto_em ?? null };
}

/** O link do tutor (o banco cria na primeira vez). Só chamar quando alguém toca em Mandar ou Copiar. */
export async function linkDoTutor(sb: Banco, clienteId: string): Promise<string> {
  const r = await sb.rpc("tutor_link", { p_cliente: clienteId });
  if (r.error || !r.data) throw new Error(r.error?.message ?? "Não consegui fazer o link do tutor.");
  return enderecoDaPagina(r.data);
}
/** Troca o código: o link antigo para de abrir na hora. Só o dono. */
export async function trocarLinkDoTutor(sb: Banco, clienteId: string): Promise<string> {
  const r = await sb.rpc("tutor_link_trocar", { p_cliente: clienteId });
  if (r.error || !r.data) throw new Error(r.error?.message ?? "Não consegui trocar o link.");
  return enderecoDaPagina(r.data);
}
export async function desligarLinkDoTutor(sb: Banco, clienteId: string): Promise<void> {
  const r = await sb.rpc("tutor_link_desligar", { p_cliente: clienteId });
  if (r.error) throw new Error(r.error.message);
}

const listaDeNomes = (nomes: string[]) => (nomes.length <= 1 ? nomes[0] ?? "seu pet" : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`);

/** Mensagem com o link da página. O sistema só prepara: quem manda é a pessoa. */
export function mensagemDaPagina(p: { tutor: string | null | undefined; petshop: string; pets: string[]; url: string }) {
  return `${saudacaoZap(p.tutor, p.petshop)} Esta é a página de ${listaDeNomes(p.pets)} aqui com a gente: o diário do dia, as fotos e o que está marcado. É só sua, não precisa de senha. Guarde o link: ${p.url}`;
}
export function mensagemDasFotos(p: { tutor: string | null | undefined; petshop: string; pet: string; fotos: number; url: string }) {
  // "Saiu uma foto" / "Saíram 3 fotos" (antes: "Saíram uma foto")
  const quantas = p.fotos === 1 ? "Saiu uma foto" : `Saíram ${p.fotos} fotos`;
  return `${saudacaoZap(p.tutor, p.petshop)} ${quantas} de ${p.pet} hoje. Veja aqui: ${p.url}`;
}

export type FotoDoDia = { id: string; caminho: string; legenda: string | null; criado_em: string; criado_por: string | null; criado_nome: string | null; pet_id: string; url: string | null };

/** As fotos de hoje dos pets, com endereço assinado (vale 1 hora) para a equipe ver. */
export async function fotosDoDia(sb: Banco, petshopId: string, petIds: string[], dia: string): Promise<FotoDoDia[]> {
  if (!petIds.length) return [];
  const r = await sb.from("diario_fotos").select("id, caminho, legenda, criado_em, criado_por, criado_nome, pet_id")
    .eq("petshop_id", petshopId).eq("dia", dia).in("pet_id", petIds).order("criado_em").limit(500);
  if (r.error) throw new Error(r.error.message);
  const linhas = r.data ?? [];
  if (!linhas.length) return [];
  const s = await sb.storage.from(BUCKET_DIARIO).createSignedUrls(linhas.map((f) => f.caminho), 3600);
  const urls = new Map((s.data ?? []).map((x) => [x.path, x.signedUrl]));
  return linhas.map((f) => ({ ...f, url: urls.get(f.caminho) ?? null }));
}

/** Prazo de cada passo da foto (subir o arquivo, guardar no dia). */
const PRAZO_DA_FOTO = 25_000;
class Demorou extends Error {}
/** A promessa, ou um erro `Demorou` depois de `ms` (a promessa continua correndo; o resultado tardio é ignorado). */
export function comPrazo<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((ok, falha) => {
    const t = setTimeout(() => falha(new Demorou("demorou")), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); falha(e); });
  });
}

/** Reduz a foto para no máximo 1600 px, JPEG leve (o celular manda fotos de vários MB). */
async function prepararFoto(f: File): Promise<Blob> {
  if (f.type && !f.type.startsWith("image/")) throw new Error(`"${f.name}" não é uma foto.`);
  try {
    let b = await reduzirFoto(f, 1600, 0.8);
    if (b.size > LIMITE_BYTES) b = await reduzirFoto(f, 1280, 0.7);
    if (b.size > LIMITE_BYTES) b = await reduzirFoto(f, 1024, 0.6);
    return b;
  } catch { throw new Error(`Não consegui ler "${f.name}". Escolha uma foto JPG ou PNG.`); }
}

/**
 * Manda as fotos para o dia do pet: reduz no aparelho, sobe três de cada vez e anota no diário.
 * Devolve quantas entraram e os erros (uma foto com problema não segura as outras).
 */
export async function enviarFotos(sb: Banco, p: { petshopId: string; estadiaId: string; petId: string; dia: string; legenda?: string },
  arquivos: File[], aoAvancar?: (feitas: number) => void, aoDemorar?: (tentativa: number) => void): Promise<{ enviadas: number; erros: string[] }> {
  const erros: string[] = [];
  let enviadas = 0, feitas = 0, i = 0;
  const legenda = p.legenda?.trim().slice(0, 200) || null;
  /**
   * Sobe o arquivo com prazo: na primeira foto do dia o aparelho às vezes ficava 30 a 60 s parado em "Mandando 1 de 1…" (a sessão
   * sendo renovada, ou a conexão com o armazenamento presa, sem erro nenhum). Passou do prazo: confere a sessão e tenta de novo,
   * com outro nome de arquivo (o que ficou preso, se subir, vira sobra e a faxina apaga). Na segunda falha, diz o que aconteceu.
   */
  async function subir(blob: Blob): Promise<string> {
    for (let tentativa = 1; ; tentativa++) {
      const caminho = `${p.petshopId}/${p.petId}/${p.dia}/${crypto.randomUUID()}.jpg`;
      try {
        const up = await comPrazo(sb.storage.from(BUCKET_DIARIO).upload(caminho, blob, { contentType: "image/jpeg" }), PRAZO_DA_FOTO);
        if (up.error) throw new Error(up.error.message.includes("size") ? "A foto ficou grande demais." : up.error.message);
        return caminho;
      } catch (e) {
        if (!(e instanceof Demorou) || tentativa >= 2) throw e instanceof Demorou ? new Error("A foto não subiu: a internet está lenta. Toque em Escolher fotos para tentar de novo.") : e;
        aoDemorar?.(tentativa + 1);
        await comPrazo(sb.auth.getSession(), 10_000).catch(() => null);
      }
    }
  }
  async function uma(f: File) {
    try {
      const blob = await prepararFoto(f);
      const caminho = await subir(blob);
      const ins = await comPrazo(sb.from("diario_fotos").insert({ petshop_id: p.petshopId, estadia_id: p.estadiaId, pet_id: p.petId, dia: p.dia, caminho, legenda }).select("id"), PRAZO_DA_FOTO)
        .catch((e) => ({ data: null, error: { message: e instanceof Demorou ? "A foto subiu, mas não consegui guardar no dia: a internet está lenta. Tente de novo." : String(e) } }));
      if (ins.error) { void sb.storage.from(BUCKET_DIARIO).remove([caminho]); throw new Error(ins.error.message); }
      if (ins.data?.[0]?.id) novas.push({ id: ins.data[0].id, caminho });
      enviadas++;
    } catch (e) { erros.push(e instanceof Error ? e.message : String(e)); }
    aoAvancar?.(++feitas);
  }
  const novas: { id: string; caminho: string }[] = [];
  const fila = async () => { while (i < arquivos.length) await uma(arquivos[i++]); };
  await Promise.all([fila(), fila(), fila()]);
  // a assinatura deixa o tutor abrir a foto já (se falhar, a faxina assina depois)
  if (novas.length) await assinarFotos(sb, p.petshopId, novas).catch(() => 0);
  return { enviadas, erros: [...new Set(erros)] };
}

/** Tira a foto do diário e apaga o arquivo (o dono, ou quem mandou). */
export async function apagarFoto(sb: Banco, foto: Pick<FotoDoDia, "id" | "caminho">): Promise<void> {
  const r = await sb.from("diario_fotos").delete().eq("id", foto.id).select("id");
  if (r.error) throw new Error(r.error.message);
  if (!r.data?.length) throw new Error("Só o dono ou quem mandou a foto pode apagar.");
  await sb.storage.from(BUCKET_DIARIO).remove([foto.caminho]);
}

/** A assinatura vale 30 dias; a faxina renova as que vencem em menos de 7. */
const SEGUNDOS_DA_ASSINATURA = 30 * 86400;

/**
 * Assina o endereço de cada foto (o Storage só assina para quem pode ver o arquivo: a equipe) e guarda só o código da
 * assinatura no banco. O servidor da página do tutor usa esse código para entregar a foto, sem depender do cabeçalho x-tutor-token.
 */
export async function assinarFotos(sb: Banco, petshopId: string, fotos: { id: string; caminho: string }[]): Promise<number> {
  if (!fotos.length) return 0;
  const s = await sb.storage.from(BUCKET_DIARIO).createSignedUrls(fotos.map((f) => f.caminho), SEGUNDOS_DA_ASSINATURA);
  if (s.error) throw new Error(s.error.message);
  const porCaminho = new Map(fotos.map((f) => [f.caminho, f.id]));
  const lista: { id: string; assinatura: string; segundos: number }[] = [];
  for (const x of s.data ?? []) {
    const id = x.path ? porCaminho.get(x.path) : undefined;
    if (!id || !x.signedUrl) continue;
    const assinatura = new URL(x.signedUrl, "http://x").searchParams.get("token");
    if (assinatura) lista.push({ id, assinatura, segundos: SEGUNDOS_DA_ASSINATURA });
  }
  if (!lista.length) return 0;
  const r = await sb.rpc("diario_fotos_assinar", { p_petshop: petshopId, p_lista: lista });
  if (r.error) throw new Error(r.error.message);
  return r.data ?? 0;
}

/**
 * A faxina das fotos: o banco apaga as fotos fora do prazo e devolve os arquivos que ficaram sem foto (foto apagada, estadia,
 * pet ou tutor apagado, prazo vencido, envio que falhou no meio) para apagar pela API do Storage, e as fotos sem assinatura.
 * Repetir não estraga nada: o que já sumiu sai da fila na próxima vez.
 */
export async function faxinaDasFotos(sb: Banco, petshopId: string): Promise<{ apagados: number; assinadas: number; vencidas: number }> {
  const r = await sb.rpc("diario_faxina", { p_petshop: petshopId });
  if (r.error) throw new Error(r.error.message);
  const d = (r.data ?? {}) as { apagar?: string[]; assinar?: { id: string; caminho: string }[]; vencidas?: number };
  let apagados = 0;
  const apagar = d.apagar ?? [];
  for (let i = 0; i < apagar.length; i += 100) {
    const x = await sb.storage.from(BUCKET_DIARIO).remove(apagar.slice(i, i + 100));
    if (!x.error) apagados += x.data?.length ?? 0;
  }
  const assinadas = await assinarFotos(sb, petshopId, d.assinar ?? []).catch(() => 0);
  return { apagados, assinadas, vencidas: d.vencidas ?? 0 };
}
