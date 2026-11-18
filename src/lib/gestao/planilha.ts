/**
 * Trazer clientes e pets de uma planilha: o que a tela e os testes dividem. A tela lê o arquivo (CSV, células coladas ou .xlsx),
 * a pessoa diz qual coluna é o quê, e `linhasParaOBanco` monta as linhas que a função `importar_clientes` grava numa
 * operação só (migração 20261217). O resumo volta do banco em números e vira frases em `frasesDoResumo`.
 */
import { lerTelefone, semAcento } from "./util";

/** Lê texto de planilha: CSV com ; ou , e também o que vem colado do Excel ou do Google Planilhas (separado por tabulação). */
export function lerTabela(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const primeira = limpo.split("\n")[0] ?? "";
  const sep = primeira.includes("\t") ? "\t" : (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let campo = "", linha: string[] = [], aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"' && campo === "") aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.map((l) => l.map((x) => x.trim())).filter((l) => l.some(Boolean));
}

/** As linhas de uma planilha como texto separado por tabulação (o mesmo que colar do Excel), para a tela mostrar e conferir. */
export function tabelaComoTexto(linhas: string[][]): string {
  const celula = (c: string) => {
    const s = c.replace(/\t/g, " ").replace(/\r\n?/g, "\n");
    return /[\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const largura = Math.max(2, ...linhas.map((l) => l.length));
  // a primeira linha sempre com tabulação: é por ela que a leitura sabe o separador
  return linhas.map((l, i) => (i === 0 ? [...l, ...Array(Math.max(0, largura - l.length)).fill("")] : l).map(celula).join("\t")).join("\n");
}

export function especieDe(v: string | undefined) {
  const s = semAcento(v ?? "");
  return /gat|felin/.test(s) ? "gato" : !s || /cao|cach|can|dog/.test(s) ? "cao" : "outro";
}
export function porteDe(v: string | undefined) {
  const s = semAcento(v ?? "").replace(/[^a-z]/g, "");
  if (["gg", "gigante", "extragrande"].includes(s)) return "GG";
  if (["g", "grande"].includes(s)) return "G";
  if (["m", "medio"].includes(s)) return "M";
  if (["p", "pequeno", "mini", "pp"].includes(s)) return "P";
  return null;
}

/**
 * "Luna, Bob", "Luna / Bob", "Luna e Bob" numa célula de pet: dois pets. Só separa quando cada parte parece um nome
 * (até duas palavras); "Thor filhote" ou uma frase ficam como estão.
 */
export function separarPets(celula: string | undefined): string[] {
  const s = (celula ?? "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const partes = s.split(/\s*(?:,|;|\/|\+|&|\s+e\s+)\s*/i).map((x) => x.trim()).filter(Boolean);
  if (partes.length < 2 || partes.some((p) => p.split(" ").length > 2)) return [s];
  // "Mel e Bob e Mel": o mesmo nome repetido conta uma vez
  return [...new Map(partes.map((p) => [semAcento(p), p])).values()];
}

/**
 * Observação que é um alerta (alergia, bravo, morde, medo, doença, remédio…): vai para os alertas do pet, que aparecem na agenda
 * e no filtro "Com alerta". O resto continua em observações.
 */
const ALERTA = /alerg|brav[oa]|mord|agressiv|ataca|medo|assust|nervos|ansios|estress|epile[pt]|convuls|cardi|coracao|diabet|renal|\brim\b|ceg[oa]|surd[oa]|idos[oa]|cirurgi|operad[oa]|displasi|artrose|artrite|remedio|medicament|nao pode|cuidado|sensivel|machuc|ferida|dermatit|otite|nao (?:gosta|deixa|aceita|mexer)|focinheira|\bfoge\b|fugitiv|vomit|tosse|doenca|\bdor(?:es)?\b|gravida/;
export const ehAlerta = (texto: string | undefined) => ALERTA.test(semAcento(texto ?? ""));

/** A linha que a função do banco recebe: uma por pet (ou uma só do tutor, sem pet). */
export type LinhaParaOBanco = {
  tutor: string; fone: string | null; email: string; endereco: string;
  pet: string; especie: string; especie_dada: boolean; raca: string; porte: string | null; obs: string; alertas: string;
};
export type ExtraDaImportacao = { fone_ruim: string[]; dois_fones: string[]; sem_pet: boolean; separados: number };

/**
 * As linhas da planilha (já com a coluna escolhida para cada campo) → o que vai para o banco. Telefone lido e limpo aqui
 * (o primeiro válido; incompleto fica em branco e entra na lista para conferir). Pet com dois nomes vira duas linhas.
 */
export function linhasParaOBanco(linhas: Record<string, string>[], temColunaDePet: boolean): { linhas: LinhaParaOBanco[]; extra: ExtraDaImportacao } {
  const extra: ExtraDaImportacao = { fone_ruim: [], dois_fones: [], sem_pet: !temColunaDePet, separados: 0 };
  const saida: LinhaParaOBanco[] = [];
  for (const l of linhas) {
    const tutor = (l.tutor ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (!tutor) continue;
    const lida = lerTelefone(l.telefone);
    if (lida.incompleto) extra.fone_ruim.push(tutor);
    if (lida.tinhaOutro) extra.dois_fones.push(tutor);
    const nota = (l.obs ?? "").trim().slice(0, 600);
    // a observação que fala de alergia, medo, doença… vira alerta do pet; com coluna própria de alertas, as duas se somam
    const alertas = [l.alertas?.trim(), ehAlerta(nota) ? nota : ""].filter(Boolean).join(". ").slice(0, 600);
    const base = {
      tutor, fone: lida.fone, email: (l.email ?? "").trim().slice(0, 160), endereco: (l.endereco ?? "").trim().slice(0, 200),
      especie: especieDe(l.especie), especie_dada: Boolean(l.especie?.trim()), raca: (l.raca ?? "").trim().slice(0, 60), porte: porteDe(l.porte),
      obs: ehAlerta(nota) ? "" : nota, alertas,
    };
    const pets = separarPets(l.pet);
    if (pets.length > 1) extra.separados++;
    if (!pets.length) saida.push({ ...base, pet: "", obs: "", alertas: "" });
    for (const pet of pets) saida.push({ ...base, pet: pet.slice(0, 80) });
  }
  return { linhas: saida, extra };
}

/** O resumo que o banco devolve (e guarda em `importacoes.resumo`). */
export type ResumoDaImportacao = {
  tutores_novos: number; pets_novos: number; tutores_completados: number; pets_completados: number; ja_estavam: number;
  linhas_repetidas: number; mesmo_nome: string[]; homonimos: number; com_alerta: number;
  fone_ruim?: string[]; dois_fones?: string[]; sem_pet?: boolean; separados?: number;
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** "Ana, Bia e mais 3". */
const alguns = (nomes: string[], max = 6) => (nomes.length <= max ? nomes.join(", ") : `${nomes.slice(0, max).join(", ")} e mais ${nomes.length - max}`);

/** O que "Desfazer esta importação" fez (o banco devolve quantos saíram e quantos ficaram). */
export function fraseDesfeita(r: { pets?: number; tutores?: number; pets_ficaram?: number; tutores_ficaram?: number }): string {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const ficaram = n(r.pets_ficaram) + n(r.tutores_ficaram);
  return `Importação desfeita: ${plural(n(r.tutores), "tutor saiu", "tutores saíram")} e ${plural(n(r.pets), "pet saiu", "pets saíram")} do cadastro.`
    + (ficaram ? ` ${plural(n(r.tutores_ficaram), "tutor", "tutores")} e ${plural(n(r.pets_ficaram), "pet", "pets")} ficaram, porque já têm horário, conta ou outra coisa ligada a eles (ou já tinham sido apagados).` : "");
}

/** As frases do resumo, na ordem em que aparecem. A primeira diz quantos tutores e pets entraram (os números do banco). */
export function frasesDoResumo(r: ResumoDaImportacao): string[] {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const tn = n(r.tutores_novos), pn = n(r.pets_novos), tc = n(r.tutores_completados), pc = n(r.pets_completados);
  const mesmoNome = Array.isArray(r.mesmo_nome) ? r.mesmo_nome : [];
  const foneRuim = Array.isArray(r.fone_ruim) ? r.fone_ruim : [], doisFones = Array.isArray(r.dois_fones) ? r.dois_fones : [];
  const nada = tn + pn + tc + pc === 0;
  return [
    nada ? "Nada novo: tudo o que estava na planilha já estava no cadastro." : `${plural(tn, "tutor novo", "tutores novos")} e ${plural(pn, "pet novo", "pets novos")} no cadastro.`,
    ...(n(r.separados) ? [`${plural(n(r.separados), "linha tinha", "linhas tinham")} mais de um pet na mesma célula (como “Luna, Bob”): cada pet entrou separado.`] : []),
    ...(n(r.com_alerta) ? [`${plural(n(r.com_alerta), "pet ficou", "pets ficaram")} com alerta (alergia, medo, doença ou cuidado), tirado das observações da planilha.`] : []),
    ...(tc ? [`${plural(tc, "tutor que já estava aqui ganhou", "tutores que já estavam aqui ganharam")} o que faltava (telefone, e-mail ou endereço).`] : []),
    ...(pc ? [`${plural(pc, "pet que já estava aqui ganhou", "pets que já estavam aqui ganharam")} o que faltava (raça, porte, observações ou alertas).`] : []),
    ...(n(r.ja_estavam) ? [`${plural(n(r.ja_estavam), "pet já estava no cadastro e ficou como estava", "pets já estavam no cadastro e ficaram como estavam")}.`] : []),
    ...(n(r.linhas_repetidas) ? [`${plural(n(r.linhas_repetidas), "linha repetia", "linhas repetiam")} um pet que já tinha aparecido na planilha e ${n(r.linhas_repetidas) === 1 ? "foi pulada" : "foram puladas"}.`] : []),
    ...(mesmoNome.length ? [`${plural(mesmoNome.length, "pet ficou de fora porque o tutor já tem outro pet com o mesmo nome nesta planilha", "pets ficaram de fora porque o tutor já tem outro pet com o mesmo nome nesta planilha")}: ${alguns(mesmoNome, 12)}. Se forem pets diferentes, cadastre na ficha do tutor com um nome que diferencie (Thor filhote, Thor 2).`] : []),
    ...(n(r.homonimos) ? [`${plural(n(r.homonimos), "tutor novo tem o mesmo nome de outro cliente, com telefone diferente, e entrou como pessoa separada", "tutores novos têm o mesmo nome de outro cliente, com telefone diferente, e entraram como pessoas separadas")}.`] : []),
    ...(doisFones.length ? [`${plural(doisFones.length, "linha tinha dois telefones: ficou o primeiro", "linhas tinham dois telefones: ficou o primeiro de cada")} (${alguns(doisFones)}).`] : []),
    ...(foneRuim.length ? [`${plural(foneRuim.length, "telefone estava incompleto e ficou em branco", "telefones estavam incompletos e ficaram em branco")}: ${alguns(foneRuim)}. Confira depois.`] : []),
    ...(r.sem_pet ? ["Nenhum pet entrou, porque a planilha veio sem coluna de pet."] : []),
  ];
}
