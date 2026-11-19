import { distancia, pelaFala } from "./assistente/parecido";

/**
 * Pedido pelo link: o pet do pedido já está na ficha do tutor?
 * - nome igual (sem contar acento, maiúsculas e espaços: "Pérola" = "Perola"): é ele, sem perguntar (o banco faz o mesmo);
 * - nome parecido com um pet ativo do tutor (Thor e Tor, Mel e Melzinha, Bob e Bobby, Luna e Lua): a tela pergunta;
 * - nome bem diferente: nasce um pet novo, sem perguntar (e a tela deixa corrigir depois).
 */

export type PetDaFicha = { id: string; nome: string; especie?: string | null; sexo?: string | null; porte?: string | null; ativo?: boolean | null };
export type Achado<T extends PetDaFicha> = { tipo: "igual"; pet: T } | { tipo: "parecido"; pets: T[] } | { tipo: "novo" };

/** O nome do jeito de comparar: minúsculas, sem acento, um espaço só (a mesma conta de public.nome_de_pet no banco). */
export function nomeDePet(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const soLetras = (s: string) => nomeDePet(s).replace(/[^a-z0-9]/g, "");

/**
 * Quão perto dois nomes de pet estão: 0 = iguais; 1 ou 2 = parecidos; null = diferentes.
 * `solto`: o tutor tem um pet só da mesma espécie, então vale uma régua um pouco mais larga.
 */
export function parecenca(a: string, b: string, solto = false): number | null {
  if (nomeDePet(a) === nomeDePet(b)) return 0;
  const x = soLetras(a), y = soLetras(b);
  if (!x || !y) return null;
  if (x === y) return 0;
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  // um é o começo do outro: Mel e Melzinha, Bob e Bobby, Pipo e Pipoca
  if (curto.length >= 3 && longo.startsWith(curto)) return 1;
  // soam igual: Thor e Tor, Lunna e Luna, Kiara e Quiara
  if (pelaFala(x) === pelaFala(y)) return 1;
  const d = distancia(x, y, 3);
  const mesmaInicial = x[0] === y[0];
  // nome curto: uma letra de diferença; com 3 letras ou menos, a inicial precisa ser a mesma (Mel e Bel são dois pets)
  if (longo.length <= 5 && d <= 1 && (curto.length > 3 || mesmaInicial)) return 1;
  if (longo.length >= 6 && d <= 2) return 2;
  // um pet só da mesma espécie: aceita um pouco mais (Luna e Lulu), sempre com a mesma inicial
  if (solto && mesmaInicial && d <= Math.max(2, Math.floor(longo.length / 2))) return 2;
  return null;
}

/**
 * O que fazer com o nome do pedido diante dos pets do tutor. O igual vale para qualquer pet da ficha (como no banco);
 * os parecidos, só os ativos, do mais perto para o mais longe (até 3).
 */
export function acharPet<T extends PetDaFicha>(nome: string, especie: string | null | undefined, pets: T[]): Achado<T> {
  const alvo = nomeDePet(nome);
  const igual = pets.find((p) => nomeDePet(p.nome) === alvo);
  if (igual) return { tipo: "igual", pet: igual };
  const ativos = pets.filter((p) => p.ativo !== false);
  const mesmaEspecie = especie ? ativos.filter((p) => p.especie === especie) : [];
  const solto = mesmaEspecie.length === 1;
  const achados = ativos
    .map((p) => ({ p, d: parecenca(nome, p.nome, solto && p === mesmaEspecie[0]) }))
    .filter((x): x is { p: T; d: number } => x.d !== null)
    // mesma espécie primeiro, depois o mais perto
    .sort((a, b) => a.d - b.d || Number(b.p.especie === especie) - Number(a.p.especie === especie) || a.p.nome.localeCompare(b.p.nome))
    .slice(0, 3)
    .map((x) => x.p);
  return achados.length ? { tipo: "parecido", pets: achados } : { tipo: "novo" };
}

/** "ele", "ela" ou null (sexo em branco). */
export const eleOuEla = (sexo: string | null | undefined) => (sexo === "M" ? "ele" : sexo === "F" ? "ela" : null);

/** "É o Thor que já está cadastrado?", "É a Mel que já está cadastrada?" ou, sem o sexo, "É Thor, que já tem cadastro?". */
export function perguntaDoPet(pet: Pick<PetDaFicha, "nome" | "sexo">): string {
  const e = eleOuEla(pet.sexo);
  return e === "ele" ? `É o ${pet.nome} que já está cadastrado?` : e === "ela" ? `É a ${pet.nome} que já está cadastrada?` : `É ${pet.nome}, que já tem cadastro?`;
}

/** O botão do "sim": "Sim, é ele", "Sim, é ela" ou "Sim, é esse pet". Com mais de um parecido, leva o nome: "Sim, é o Thor". */
export function simDoPet(pet: Pick<PetDaFicha, "nome" | "sexo">, comNome = false): string {
  const e = eleOuEla(pet.sexo);
  if (comNome) return e === "ele" ? `Sim, é o ${pet.nome}` : e === "ela" ? `Sim, é a ${pet.nome}` : `Sim, é ${pet.nome}`;
  return e === "ele" ? "Sim, é ele" : e === "ela" ? "Sim, é ela" : "Sim, é esse pet";
}
