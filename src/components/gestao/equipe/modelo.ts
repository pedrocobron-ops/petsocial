import { AREAS, PERFIS, areasDe, veDinheiro, type Area } from "@/lib/gestao/acessos";
import { PLANOS, planoPorId } from "@/lib/gestao/planos";
import type { Petshop, Profissional } from "@/lib/gestao/tipos";

/**
 * Equipe: o que cada escolha grava no banco.
 * - Função (`funcao`): o nome do perfil escolhido ou o texto livre. Só para mostrar.
 * - Áreas (`acessos`): o que a pessoa COM LOGIN abre. `ve_financeiro` acompanha as áreas de dinheiro.
 * - Sócio: papel "dono". Abre tudo, inclusive Equipe, Meu pet shop e Assinatura.
 * - `atende` (aparece na agenda para atender) é uma pergunta à parte, que não depende do login.
 */

export type PerfilId = (typeof PERFIS)[number]["id"] | "outra";
export const ROTULOS_ATENDE = ["Banhista", "Tosador(a)", "Banhista e tosador(a)"] as const;
export const TODAS_AREAS = AREAS.map((a) => a.id) as Area[];
export const perfilPorId = (id: PerfilId | null) => PERFIS.find((p) => p.id === id) ?? null;

/** Telas que nenhuma chave libera: só donos. */
export const SO_DONOS = [
  { id: "equipe", rotulo: "Equipe" },
  { id: "ajustes", rotulo: "Meu pet shop" },
  { id: "assinatura", rotulo: "Assinatura" },
] as const;

/** O que a pessoa escolhe no formulário. */
export type Escolha = {
  perfil: PerfilId | null;
  /** Rótulo de quem atende os pets (banhista, tosador…). */
  rotulo: string;
  /** Nome da função em "Outra função". */
  nome: string;
  /** Aparece na agenda para atender. */
  atende: boolean;
  /** Áreas ligadas (só valem para quem tem login). */
  areas: Area[];
};

export const ESCOLHA_VAZIA: Escolha = { perfil: null, rotulo: ROTULOS_ATENDE[2], nome: "", atende: false, areas: [] };

/** Troca o perfil: preenche as áreas do perfil pronto. `manterAtende` não mexe na pergunta "atende os pets?". */
export function comPerfil(e: Escolha, id: PerfilId, manterAtende = false): Escolha {
  const p = perfilPorId(id);
  return {
    ...e, perfil: id,
    areas: p ? [...p.areas] : e.areas.length ? e.areas : ["agenda", "clientes"],
    atende: manterAtende || id === "outra" ? e.atende : id === "atendimento",
  };
}

export const ehSocio = (e: Escolha) => e.perfil === "socio";
/** Login é o caminho comum para este perfil? (null = tanto faz) */
export const sugereLogin = (id: PerfilId | null): boolean | null => (id === "atendimento" ? false : id === null || id === "outra" ? null : true);

export function nomeDaFuncao(e: Escolha): string | null {
  if (e.perfil === "atendimento") return e.rotulo;
  if (e.perfil === "outra" || !e.perfil) return e.nome.trim().slice(0, 40) || null;
  return perfilPorId(e.perfil)?.funcao ?? null;
}

const emOrdem = (areas: Area[]) => TODAS_AREAS.filter((a) => areas.includes(a));

/** O que vai para papel, funcao, acessos e ve_financeiro. Sem login não há áreas. */
export function camposDaEscolha(e: Escolha, comLogin: boolean) {
  const socio = ehSocio(e);
  const areas = socio ? TODAS_AREAS : emOrdem(e.areas);
  return {
    papel: socio ? ("dono" as const) : ("funcionario" as const),
    funcao: nomeDaFuncao(e),
    acessos: comLogin ? areas : null,
    ve_financeiro: socio || (comLogin && veDinheiro(areas)),
  };
}

/** Lê uma pessoa que já existe e devolve a escolha que mais se parece com ela. */
export function escolhaDe(p: Profissional): Escolha {
  const f = p.funcao?.trim() ?? "";
  const rotulo = ROTULOS_ATENDE.find((r) => r === f);
  const perfil: PerfilId =
    p.papel === "dono" ? "socio"
    : rotulo ? "atendimento"
    : PERFIS.find((x) => !x.socio && x.funcao === f)?.id
    ?? (p.papel === "gerente" ? "gerente" : !f && p.atende && !p.ve_financeiro ? "atendimento" : "outra");
  const pronto = perfilPorId(perfil);
  // quem ainda não tem login nunca teve áreas marcadas: começa pelo perfil pronto
  const areas = acessoDe(p) === "sem" && !Array.isArray(p.acessos) && pronto ? [...pronto.areas] : areasDe(p);
  return { perfil, rotulo: rotulo ?? ROTULOS_ATENDE[2], nome: perfil === "outra" ? f : "", atende: p.atende, areas };
}

/** O nome da função para mostrar no cartão da pessoa. */
export function funcaoDe(p: Pick<Profissional, "papel" | "funcao" | "atende">): string {
  const f = p.funcao?.trim();
  if (f) return f;
  if (p.papel === "dono") return "Dono";
  if (p.papel === "gerente") return "Gerente";
  return p.atende ? "Atende os pets" : "Equipe";
}

/** Áreas em pílulas: "Tudo" quando abre as oito. */
export function pilulasDe(p: Pick<Profissional, "papel" | "ve_financeiro" | "acessos">): string[] {
  const areas = areasDe(p);
  return areas.length === TODAS_AREAS.length ? ["Tudo"] : AREAS.filter((a) => areas.includes(a.id)).map((a) => a.rotulo);
}

/* ---------- donos ---------- */

/** O titular é o dono mais antigo. Não pode ser rebaixado nem desativado (o banco também recusa). */
export function titularDe(equipe: Profissional[]): string | null {
  const donos = equipe.filter((p) => p.papel === "dono").sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id));
  return donos[0]?.id ?? null;
}
export const erroDoTitular = (e: unknown) => /titular da conta/i.test(e instanceof Error ? e.message : String(e));
export const FRASE_TITULAR = "O titular da conta continua como dono e não pode ser desativado. Para trocar o titular, fale com a nossa equipe.";

/* ---------- acesso e plano ---------- */

export type Acesso = "login" | "convite" | "sem";
export const acessoDe = (p: Pick<Profissional, "user_id" | "email_convite">): Acesso => (p.user_id ? "login" : p.email_convite?.trim() ? "convite" : "sem");
/** Ocupa um acesso do plano: pessoa ativa com login ou com convite. */
export const ocupaAcesso = (p: Profissional) => p.ativo && acessoDe(p) !== "sem";

export function usoDoPlano(petshop: Pick<Petshop, "plano" | "status">, equipe: Profissional[]) {
  const plano = planoPorId(petshop.plano);
  const ocupam = equipe.filter(ocupaAcesso);
  const livres = Math.max(0, plano.acessos - ocupam.length);
  const proximo = PLANOS[PLANOS.findIndex((p) => p.id === plano.id) + 1] ?? null;
  return { plano, ocupam, usados: ocupam.length, limite: plano.acessos, livres, cheio: livres === 0, proximo, emTeste: petshop.status === "teste" };
}
export type Uso = ReturnType<typeof usoDoPlano>;

export const nAcessos = (n: number) => (n === 1 ? "1 acesso" : `${n} acessos`);

/** Frase para quando o plano não tem mais vaga de login. */
export function fraseDoLimite(u: Uso): string {
  const tem = `O plano ${u.plano.nome} tem ${nAcessos(u.limite)} e ${u.limite === 1 ? "ele já está" : "todos estão"} em uso.`;
  return u.proximo
    ? `${tem} Para dar login a mais gente, mude para ${u.proximo.nome} (${nAcessos(u.proximo.acessos)}).`
    : `${tem} É o maior plano. Para dar login a outra pessoa, tire o acesso de alguém que não usa.`;
}

/** O banco recusou por causa do limite de acessos do plano (gatilho conferir_acessos). */
export const erroDeLimite = (e: unknown) => /plano atual permite/i.test(e instanceof Error ? e.message : String(e));

/* ---------- convite ---------- */

export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
export const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? "";

export function linkDoConvite(origem: string, email: string) {
  return `${origem}/gestao/criar-conta?email=${encodeURIComponent(email.trim().toLowerCase())}`;
}

export function textoDoConvite({ nome, petshop, email, origem }: { nome: string; petshop: string; email: string; origem: string }) {
  const e = email.trim().toLowerCase();
  return [
    `Oi${primeiroNome(nome) ? `, ${primeiroNome(nome)}` : ""}! Você agora faz parte da equipe do ${petshop} no Maestro Pet Gestão.`,
    "",
    "Para entrar:",
    `1. Abra este link: ${linkDoConvite(origem, e)}`,
    `2. Crie a sua conta com ESTE e-mail: ${e}`,
    "3. Se chegar um e-mail de confirmação, abra o link dele. Pronto, você já entra na equipe.",
  ].join("\n");
}

/** Comissão digitada ("7,5") em número; null se não é um valor entre 0 e 100. */
export function lerComissao(texto: string): number | null {
  const c = texto.trim() ? Number(texto.replace(",", ".")) : 0;
  return Number.isFinite(c) && c >= 0 && c <= 100 ? Math.round(c * 100) / 100 : null;
}
