import { EMPRESA } from "@/lib/empresa";
import { lerVendedor, rotuloDoDocumento, temVendedor, type Vendedor } from "./vendedor";

/**
 * Quem oferece o Gestão, para os Termos de uso e a Política de privacidade.
 *
 * O nome, o documento (CPF ou CNPJ) e o endereço vêm do painel do administrador (`lerVendedor`, em `vendedor.ts`: função
 * `gestao_vendedor`, chaves `vendedor_*` de `config_interna`). Nenhum nome ou documento é escrito aqui. Os documentos são um
 * contrato e não podem ficar sem dizer quem responde: enquanto o painel estiver vazio (ou o banco não responder), vale a
 * identificação geral do site (`src/lib/empresa.ts`, a mesma do rodapé do site), e quando ela também faltar aparece o
 * marcador [entre colchetes] das páginas legais.
 */
export type QuemOferece = {
  nome: string;
  /** Como foi preenchido (com pontos e traço, se a equipe pôs). */
  documento: string;
  /** Pessoa física (CPF) ou empresa (CNPJ). */
  pessoaFisica: boolean;
  endereco: string;
  /** De onde veio: do painel do administrador ou da identificação geral do site. */
  origem: "painel" | "site";
};

/** A identificação geral do site, usada enquanto o painel não foi preenchido. */
export function quemOfereceDoSite(): QuemOferece {
  const pf = EMPRESA.pessoaFisica;
  return { nome: pf ? EMPRESA.nome : EMPRESA.razaoSocial, documento: pf ? EMPRESA.cpf : EMPRESA.cnpj, pessoaFisica: pf, endereco: EMPRESA.endereco, origem: "site" };
}

/** Monta quem oferece com o que o painel devolveu. Sem nome ou sem documento, vale o site (metade não identifica ninguém). */
export function montarQuemOferece(v: Vendedor | null | undefined): QuemOferece {
  const site = quemOfereceDoSite();
  if (!temVendedor(v)) return site;
  return { nome: v.nome, documento: v.documento, pessoaFisica: rotuloDoDocumento(v.documento) !== "CNPJ", endereco: v.endereco || site.endereco, origem: "painel" };
}

/** No servidor: lê do painel (guardado por 5 minutos) e nunca falha. */
export async function quemOferece(): Promise<QuemOferece> {
  return montarQuemOferece(await lerVendedor());
}
