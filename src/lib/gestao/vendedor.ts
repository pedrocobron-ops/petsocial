import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "./supabase-config";

/**
 * Quem vende o Maestro Pet Gestão (direito do consumidor: nome e documento de quem vende, à vista antes da compra).
 * Os dados ficam no banco (config_interna: `vendedor_nome`, `vendedor_documento`, `vendedor_endereco`, `vendedor_contato`),
 * gravados no painel do administrador (aba Vendas). Nada disso fica escrito no código: sem preencher, nada aparece.
 * Usam: rodapé da página de venda, tela Assinatura e os documentos (Termos e Política).
 */
export type Vendedor = { nome: string; documento: string; endereco: string; contato: string };

const texto = (v: unknown, maximo: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, maximo) : "");

/** Arruma o que veio do banco (função `gestao_vendedor`, ou a chave `vendedor` de `gestao_assinatura`). */
export function vendedorDe(bruto: unknown): Vendedor {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  return { nome: texto(b.nome, 120), documento: texto(b.documento, 40), endereco: texto(b.endereco, 200), contato: texto(b.contato, 120) };
}

/** Só aparece quando o nome e o documento estão preenchidos: metade da identificação não identifica ninguém. */
export const temVendedor = (v: Vendedor | null | undefined): v is Vendedor => Boolean(v && v.nome && v.documento);

/** "CPF" ou "CNPJ" pelo número de dígitos; outro formato fica como "Documento". */
export function rotuloDoDocumento(documento: string) {
  const n = documento.replace(/\D/g, "").length;
  return n === 11 ? "CPF" : n === 14 ? "CNPJ" : "Documento";
}

const semPonto = (t: string) => t.replace(/[.\s]+$/, "");

/** Uma linha: "Vendido por Fulana de Tal, CPF 000.000.000-00." (com endereço e contato, se houver). */
export function linhaDoVendedor(v: Vendedor) {
  const partes = [`Vendido por ${semPonto(v.nome)}, ${rotuloDoDocumento(v.documento)} ${semPonto(v.documento)}`];
  if (v.endereco) partes.push(semPonto(v.endereco));
  if (v.contato) partes.push(`Contato: ${semPonto(v.contato)}`);
  return `${partes.join(". ")}.`;
}

/**
 * No servidor (página de venda, Termos, Política): lê do banco pela função pública e guarda por 5 minutos.
 * Banco sem a função, sem rede ou sem preencher: devolve `null` e a página segue sem a linha.
 */
export async function lerVendedor(): Promise<Vendedor | null> {
  if (!configurado) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gestao_vendedor`, {
      method: "POST", headers: { apikey: SUPABASE_CHAVE, Authorization: `Bearer ${SUPABASE_CHAVE}`, "Content-Type": "application/json" },
      body: "{}", next: { revalidate: 300 }, signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return null;
    const v = vendedorDe(await r.json());
    return temVendedor(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * No servidor, para a página de venda: quem vende e os dias de tolerância da assinatura atrasada, numa leitura só
 * (função pública `gestao_assinatura`), guardada por 5 minutos. Sem resposta: tudo vazio, e a página usa os padrões.
 */
export async function lerVendaPublica(): Promise<{ vendedor: Vendedor | null; atrasoDias: number | null }> {
  const vazio = { vendedor: null, atrasoDias: null };
  if (!configurado) return vazio;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/gestao_assinatura`, {
      method: "POST", headers: { apikey: SUPABASE_CHAVE, Authorization: `Bearer ${SUPABASE_CHAVE}`, "Content-Type": "application/json" },
      body: "{}", next: { revalidate: 300 }, signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) return vazio;
    const b = (await r.json()) as { vendedor?: unknown; atraso_dias?: unknown } | null;
    const v = vendedorDe(b?.vendedor);
    const dias = Number(b?.atraso_dias);
    return { vendedor: temVendedor(v) ? v : null, atrasoDias: Number.isInteger(dias) && dias >= 0 && dias <= 60 ? dias : null };
  } catch {
    return vazio;
  }
}
