import type { Banco } from "@/lib/gestao/supabase";
import { isoDia, somaDias } from "@/lib/gestao/util";
import { buscarTudo } from "./comum";
import { cuidadosEmAlerta, DIAS_AVISO_SAUDE, estadoSaude, resumoSaude, type CuidadoResumido, type ResumoSaude } from "./saude";

const CAMPOS = "pet_id, tipo, nome, aplicado_em, vence_em, criado_em";
const LOTE = 100;

/**
 * Cuidados que vencem até hoje + `dias`, já junto com as doses mais novas dos mesmos pets
 * (para a dose antiga que foi renovada não contar como vencida). Só leitura.
 */
async function buscarCuidados(sb: Banco, petshopId: string, dias: number): Promise<CuidadoResumido[]> {
  const limite = isoDia(somaDias(new Date(), dias));
  const perto = await buscarTudo<CuidadoResumido>((de, ate) => sb.from("pets_saude").select(CAMPOS).eq("petshop_id", petshopId)
    .lte("vence_em", limite).order("vence_em").order("id").range(de, ate));
  if (!perto.length) return [];
  const ids = [...new Set(perto.map((c) => c.pet_id))];
  const depois: CuidadoResumido[] = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    depois.push(...await buscarTudo<CuidadoResumido>((de, ate) => sb.from("pets_saude").select(CAMPOS).eq("petshop_id", petshopId)
      .in("pet_id", ids.slice(i, i + LOTE)).or(`vence_em.gt.${limite},vence_em.is.null`).order("id").range(de, ate)));
  }
  return [...perto, ...depois];
}

/** Etiqueta de saúde de cada pet que tem cuidado vencido ou vencendo em até `dias` dias (lista de clientes). */
export async function buscarAlertasSaude(sb: Banco, petshopId: string, dias = DIAS_AVISO_SAUDE): Promise<Record<string, ResumoSaude>> {
  const porPet = new Map<string, CuidadoResumido[]>();
  for (const c of await buscarCuidados(sb, petshopId, dias)) porPet.set(c.pet_id, [...(porPet.get(c.pet_id) ?? []), c]);
  const hoje = new Date();
  const mapa: Record<string, ResumoSaude> = {};
  for (const [petId, itens] of porPet) {
    const r = resumoSaude(itens, hoje, dias);
    if (r) mapa[petId] = r;
  }
  return mapa;
}

const listar = (nomes: string[]) => `${nomes.slice(0, 3).join(", ")}${nomes.length > 3 ? ` e mais ${nomes.length - 3}` : ""}`;
/**
 * Frase pronta para o aviso, sem misturar o que já venceu com o que ainda vai vencer:
 * "Vencido (2): Rex, Mel. Vence nos próximos 15 dias (1): Thor."
 */
export function fraseSaude(vencidos: string[], vencendo: string[], dias: number) {
  return [
    vencidos.length ? `Vacina ou cuidado vencido (${vencidos.length}): ${listar(vencidos)}.` : "",
    vencendo.length ? `Vence nos próximos ${dias} dias (${vencendo.length}): ${listar(vencendo)}.` : "",
  ].filter(Boolean).join(" ");
}

/**
 * Para a tela Hoje: quantos pets (distintos, ativos) têm cuidado vencido e quantos têm cuidado
 * vencendo nos próximos 15 dias. O pet com as duas coisas conta só em `vencidos`.
 * `nomes` vem com os vencidos primeiro.
 */
export async function buscarSaudeVencendo(sb: Banco, petshopId: string): Promise<{ vencidos: number; vencendo: number; nomes: string[]; nomesVencidos: string[]; nomesVencendo: string[]; frase: string }> {
  const DIAS = 15;
  const hoje = new Date();
  const alerta = cuidadosEmAlerta(await buscarCuidados(sb, petshopId, DIAS), hoje, DIAS);
  const estadoDoPet = new Map<string, "vencido" | "vencendo">();
  for (const c of alerta) {
    if (estadoSaude(c.vence_em, hoje, DIAS) === "vencido") estadoDoPet.set(c.pet_id, "vencido");
    else if (!estadoDoPet.has(c.pet_id)) estadoDoPet.set(c.pet_id, "vencendo");
  }
  if (!estadoDoPet.size) return { vencidos: 0, vencendo: 0, nomes: [], nomesVencidos: [], nomesVencendo: [], frase: "" };

  // só os pets ativos entram na conta
  const ids = [...estadoDoPet.keys()];
  const nomeDe = new Map<string, string>();
  for (let i = 0; i < ids.length; i += LOTE) {
    const r = await sb.from("pets").select("id, nome").eq("petshop_id", petshopId).eq("ativo", true).in("id", ids.slice(i, i + LOTE));
    if (r.error) throw new Error(r.error.message);
    for (const p of r.data ?? []) nomeDe.set(p.id, p.nome);
  }
  const ativos = ids.filter((id) => nomeDe.has(id));
  const vencidos = ativos.filter((id) => estadoDoPet.get(id) === "vencido");
  const vencendo = ativos.filter((id) => estadoDoPet.get(id) === "vencendo");
  const porNome = (a: string, b: string) => nomeDe.get(a)!.localeCompare(nomeDe.get(b)!, "pt-BR");
  const nomesVencidos = vencidos.sort(porNome).map((id) => nomeDe.get(id)!);
  const nomesVencendo = vencendo.sort(porNome).map((id) => nomeDe.get(id)!);
  return {
    vencidos: vencidos.length,
    vencendo: vencendo.length,
    nomes: [...nomesVencidos, ...nomesVencendo],
    nomesVencidos, nomesVencendo,
    frase: fraseSaude(nomesVencidos, nomesVencendo, DIAS),
  };
}
