"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, History, TriangleAlert, Undo2, Upload } from "lucide-react";
import { dataCurta, fimDoTelefone, hora, lerTelefone, semAcento } from "@/lib/gestao/util";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { limparCodigo, opcoesDaLoja } from "@/lib/gestao/loja-opcoes";
import { useGestao } from "./contexto";
import { guardarLembrado, lerLembrado } from "./lembrado";
import { Folha, avisarMudanca, mensagemDeErro, ok, useAvisos, useSomenteLeitura } from "./ui";

type Tipo = "clientes" | "produtos";
/**
 * Coluna aceita. `nomes` são títulos que valem exatamente (sem acento, em minúsculas);
 * `parece` pega títulos parecidos ("Raça do animal", "Nome do responsável", "Zap da dona").
 */
type Coluna = { id: string; rotulo: string; nomes: string[]; parece?: RegExp; obrigatoria?: boolean; exemplo: string };

const COLUNAS: Record<Tipo, Coluna[]> = {
  // a ordem importa para os títulos parecidos: "Raça do animal" é raça (não pet), "Telefone do tutor" é telefone (não tutor)
  clientes: [
    { id: "telefone", rotulo: "Telefone", nomes: ["telefone", "whatsapp", "celular", "fone", "contato", "zap", "whats", "tel", "numero"], parece: /zap|whats|celular|telefone|\bfone\b|\btel\b|contato/, exemplo: "(11) 91234-5678" },
    { id: "email", rotulo: "E-mail", nomes: ["email", "e-mail"], parece: /e-?mail/, exemplo: "" },
    { id: "endereco", rotulo: "Endereço", nomes: ["endereco"], parece: /endereco|\brua\b/, exemplo: "" },
    { id: "raca", rotulo: "Raça", nomes: ["raca"], parece: /raca/, exemplo: "Poodle" },
    { id: "especie", rotulo: "Espécie", nomes: ["especie", "tipo", "bicho"], parece: /especie|\btipo\b/, exemplo: "cão" },
    { id: "porte", rotulo: "Porte", nomes: ["porte", "tamanho"], parece: /porte|tamanho/, exemplo: "P" },
    { id: "obs", rotulo: "Observações", nomes: ["observacao", "observacoes", "obs", "anotacao", "anotacoes", "cuidados", "alertas", "notas"], parece: /observa|\bobs\b|anota|cuidado|alerta|\bnotas?\b/, exemplo: "Tem medo de secador" },
    { id: "tutor", rotulo: "Tutor", nomes: ["tutor", "cliente", "nome do tutor", "nome do cliente", "dono", "dona", "responsavel", "proprietario", "nome"], parece: /tutor|cliente|\bdon[oa]\b|responsavel|proprietari/, obrigatoria: true, exemplo: "Roberta Dias" },
    { id: "pet", rotulo: "Pet", nomes: ["pet", "nome do pet", "animal", "nome do animal", "bichinho", "cachorro", "mascote", "paciente"], parece: /\bpet\b|bichinho|animal|cachorro|mascote/, exemplo: "Mel" },
  ],
  produtos: [
    { id: "nome", rotulo: "Produto", nomes: ["produto", "nome", "nome do produto", "descricao", "item"], obrigatoria: true, exemplo: "Ração Golden 15kg" },
    // só entra quando o pet shop ligou o código de barras nas opções da loja
    { id: "codigo", rotulo: "Código de barras", nomes: ["codigo de barras", "codigo barras", "cod barras", "cod de barras", "barras", "ean", "gtin"], parece: /barras|\bean\b|gtin/, exemplo: "7891234567895" },
    { id: "categoria", rotulo: "Categoria", nomes: ["categoria", "grupo", "tipo"], exemplo: "Ração" },
    { id: "unidade", rotulo: "Unidade", nomes: ["unidade", "un", "medida"], exemplo: "saco" },
    { id: "preco", rotulo: "Preço de venda", nomes: ["preco", "preco de venda", "venda", "valor", "valor de venda"], exemplo: "189,90" },
    { id: "custo", rotulo: "Custo", nomes: ["custo", "preco de custo", "valor de custo", "compra"], exemplo: "140,00" },
    { id: "estoque", rotulo: "Quantidade em estoque", nomes: ["estoque", "quantidade", "qtd", "saldo", "quantidade em estoque"], exemplo: "10" },
    { id: "minimo", rotulo: "Estoque mínimo", nomes: ["minimo", "estoque minimo", "alerta"], exemplo: "3" },
  ],
};
/** Ordem em que as colunas aparecem para a pessoa (na lista do seletor e na planilha modelo). */
const ORDEM: Record<Tipo, string[]> = {
  clientes: ["tutor", "telefone", "pet", "especie", "raca", "porte", "obs", "email", "endereco"],
  produtos: ["nome", "codigo", "categoria", "unidade", "preco", "custo", "estoque", "minimo"],
};
/** As colunas aceitas; a de código de barras só para quem ligou a opção. */
const colunasDe = (tipo: Tipo, comCodigo: boolean) => COLUNAS[tipo].filter((c) => c.id !== "codigo" || comCodigo);
const emOrdem = (tipo: Tipo, comCodigo: boolean) => ORDEM[tipo].filter((id) => id !== "codigo" || comCodigo).map((id) => COLUNAS[tipo].find((c) => c.id === id)!);
const MAXIMO = 2000;

/** Lê texto de planilha: CSV com ; ou , e também o que vem colado do Excel ou do Google Planilhas (separado por tabulação). */
function lerTabela(texto: string): string[][] {
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

/** Palpite de qual coluna da planilha é o quê: primeiro os títulos exatos, depois os parecidos. Cada campo fica com uma coluna só. */
function adivinhar(titulos: string[], cols: Coluna[]): string[] {
  const limpos = titulos.map(semAcento);
  const mapa = limpos.map(() => "");
  const usados = new Set<string>();
  for (const c of cols) {
    const i = limpos.findIndex((t, n) => !mapa[n] && c.nomes.includes(t));
    if (i >= 0) { mapa[i] = c.id; usados.add(c.id); }
  }
  for (const c of cols) {
    if (usados.has(c.id) || !c.parece) continue;
    const i = limpos.findIndex((t, n) => !mapa[n] && c.parece!.test(t));
    if (i >= 0) { mapa[i] = c.id; usados.add(c.id); }
  }
  return mapa;
}

/** "1.234,50", "R$ 45", "45.5" → número; vazio ou inválido → null. */
function numero(v: string | undefined) {
  const s = (v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  // no Brasil "1.200" é mil e duzentos: ponto seguido de três algarismos é separador de milhar
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s);
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 1000) / 1000 : null;
}
function especieDe(v: string | undefined) {
  const s = semAcento(v ?? "");
  return /gat|felin/.test(s) ? "gato" : !s || /cao|cach|can|dog/.test(s) ? "cao" : "outro";
}
function porteDe(v: string | undefined) {
  const s = semAcento(v ?? "").replace(/[^a-z]/g, "");
  if (["gg", "gigante", "extragrande"].includes(s)) return "GG";
  if (["g", "grande"].includes(s)) return "G";
  if (["m", "medio"].includes(s)) return "M";
  if (["p", "pequeno", "mini", "pp"].includes(s)) return "P";
  return null;
}
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** "Ana, Bia e mais 3". */
const alguns = (nomes: string[], max = 6) => (nomes.length <= max ? nomes.join(", ") : `${nomes.slice(0, max).join(", ")} e mais ${nomes.length - max}`);

function baixarModelo(tipo: Tipo, comCodigo: boolean) {
  const cols = emOrdem(tipo, comCodigo);
  const csv = "﻿" + [cols.map((c) => c.rotulo), cols.map((c) => c.exemplo)].map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `modelo-${tipo}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- última importação (guardada neste aparelho, por pet shop) ---------- */

type Ultima = {
  /** Quando terminou (ISO). */
  em: string;
  /** O resumo, como apareceu na tela. */
  linhas: string[];
  /** O que esta importação criou (para poder desfazer). */
  clientes: string[]; pets: string[];
  desfeitaEm?: string;
};
const chaveUltima = (petshopId: string, tipo: Tipo) => `maestro-gestao-importacao:${petshopId}:${tipo}`;
export function lerUltimaImportacao(petshopId: string, tipo: Tipo): Ultima | null {
  try {
    const v = JSON.parse(lerLembrado(chaveUltima(petshopId, tipo)) ?? "null") as Ultima | null;
    return v && typeof v.em === "string" && Array.isArray(v.linhas) ? { ...v, clientes: v.clientes ?? [], pets: v.pets ?? [] } : null;
  } catch { return null; }
}
const quando = (iso: string) => `${dataCurta(iso)} às ${hora(iso)}`;
/** Dá para desfazer por 7 dias (o banco usa o mesmo prazo). */
const podeDesfazer = (u: Ultima) => !u.desfeitaEm && u.clientes.length + u.pets.length > 0 && Date.now() - Date.parse(u.em) < 7 * 864e5;

/**
 * Traz clientes e pets, ou produtos, de uma planilha (arquivo CSV ou células coladas).
 * Não apaga nada: quem já está no cadastro só ganha o que estava em branco (telefone, raça, porte, observações).
 * A pessoa confere e corrige qual coluna é o quê antes de trazer, e pode desfazer logo depois.
 */
export default function Importar({ tipo, aoFechar, aoTerminar }: { tipo: Tipo; aoFechar: () => void; aoTerminar?: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [texto, setTexto] = useState("");
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string[] | null>(null);
  const [ultima, setUltima] = useState<Ultima | null>(null);
  const [desfazendo, setDesfazendo] = useState(false);
  /** Escolhas da pessoa: coluna da planilha → campo ("" = não usar). Só o que ela mudou; o resto vem do palpite. */
  const [escolhas, setEscolhas] = useState<Record<number, string>>({});
  const [mesmoAssim, setMesmoAssim] = useState(false);
  const comCodigo = opcoesDaLoja(petshop).codigoBarras;
  const cols = useMemo(() => colunasDe(tipo, comCodigo), [tipo, comCodigo]);
  const principal = cols.find((c) => c.obrigatoria)!;

  useEffect(() => { setUltima(lerUltimaImportacao(petshop.id, tipo)); }, [petshop.id, tipo]);
  const guardarUltima = (u: Ultima) => { guardarLembrado(chaveUltima(petshop.id, tipo), JSON.stringify(u)); setUltima(u); };

  const tabela = useMemo(() => lerTabela(texto), [texto]);
  const titulos = tabela[0] ?? [];
  const chaveTitulos = titulos.join("\u0001");
  // planilha nova (outros títulos): as escolhas anteriores não valem mais
  useEffect(() => { setEscolhas({}); setMesmoAssim(false); }, [chaveTitulos]);

  const lido = useMemo(() => {
    if (tabela.length < 2) return null;
    const palpite = adivinhar(titulos, cols);
    const mapa = titulos.map((_, i) => escolhas[i] ?? palpite[i]);
    const onde: Record<string, number> = {};
    mapa.forEach((id, i) => { if (id && !(id in onde)) onde[id] = i; });
    const linhas = tabela.slice(1).map((l) => Object.fromEntries(Object.entries(onde).map(([id, i]) => [id, l[i] ?? ""])) as Record<string, string>);
    return {
      mapa, onde, palpite, amostra: tabela.slice(1, 6), total: tabela.length - 1,
      faltou: !(principal.id in onde) ? principal : null,
      linhas: principal.id in onde ? linhas.filter((l) => (l[principal.id] ?? "").trim()) : [],
    };
  }, [tabela, titulos, cols, escolhas, principal]);

  /** Coisas importantes que a planilha de clientes quase sempre tem e que ficaram sem coluna. */
  const semColuna = tipo === "clientes" && lido && !lido.faltou ? (["telefone", "pet"] as const).filter((id) => !(id in lido.onde)) : [];

  function escolher(i: number, id: string) {
    setMesmoAssim(false);
    setEscolhas((e) => {
      const novo = { ...e, [i]: id };
      // um campo fica com uma coluna só: quem tinha esse campo passa a "Não usar"
      if (id && lido) lido.mapa.forEach((outro, n) => { if (n !== i && outro === id) novo[n] = ""; });
      return novo;
    });
  }

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null); setResultado(null);
    if (/\.(xlsx?|ods|numbers)$/i.test(arquivo.name)) {
      setErro("Esse é um arquivo de planilha fechado. Abra no Excel ou no Google Planilhas, selecione as células, copie e cole no campo abaixo. Ou use Arquivo → Salvar como → CSV.");
      return;
    }
    if (arquivo.size > 2_000_000) { setErro("O arquivo é grande demais. Divida em partes de até 2.000 linhas."); return; }
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    // planilha salva pelo Excel antigo vem em outro alfabeto: se o UTF-8 der caractere quebrado, tenta o do Windows
    let t = new TextDecoder("utf-8").decode(bytes);
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(bytes);
    setTexto(t);
  }

  async function importarClientes(linhas: Record<string, string>[], criados: { clientes: string[]; pets: string[] }) {
    type Tutor = { id: string; nome: string; telefone: string | null; email: string | null; endereco: string | null };
    type PetJa = { id: string; cliente_id: string; nome: string; especie: string; raca: string | null; porte: string | null; obs: string | null };
    const existentes = await lerTudo<Tutor>((de, ate, contar) =>
      sb.from("clientes").select("id, nome, telefone, email, endereco", contando(contar)).eq("petshop_id", petshop.id).order("id").range(de, ate));
    const petsJa = await lerTudo<PetJa>((de, ate, contar) =>
      sb.from("pets").select("id, cliente_id, nome, especie, raca, porte, obs", contando(contar)).eq("petshop_id", petshop.id).order("id").range(de, ate));

    const tutores = new Map<string, Tutor>(existentes.map((c) => [c.id, c]));
    const porFone = new Map<string, string>(), porNome = new Map<string, string>();
    for (const c of existentes) { if (fimDoTelefone(c.telefone)) porFone.set(fimDoTelefone(c.telefone), c.id); porNome.set(semAcento(c.nome), c.id); }
    const chavePet = (clienteId: string, nome: string) => `${clienteId}:${semAcento(nome)}`;
    const pets = new Map<string, PetJa>(petsJa.map((p) => [chavePet(p.cliente_id, p.nome), p]));
    const novosAgora = new Set<string>(); // tutores e pets criados nesta importação
    const completados = { tutores: new Set<string>(), pets: new Set<string>() };

    let nTutores = 0, nPets = 0, jaEstavam = 0, homonimos = 0, linhasRepetidas = 0;
    const foneRuim: string[] = [], doisFones: string[] = [], mesmoNome: string[] = [];

    for (const l of linhas) {
      const nome = l.tutor.trim().slice(0, 120);
      const lida = lerTelefone(l.telefone);
      if (lida.incompleto) foneRuim.push(nome);
      if (lida.tinhaOutro) doisFones.push(nome);
      const fone = lida.fone;
      const chaveFone = fimDoTelefone(fone);
      const email = l.email?.trim().slice(0, 160) || null, endereco = l.endereco?.trim().slice(0, 200) || null;
      // mesmo telefone é a mesma pessoa. Mesmo nome com outro telefone é outra pessoa (duas "Maria Silva").
      const peloNome = porNome.get(semAcento(nome)) ?? null;
      const foneDoHomonimo = peloNome ? fimDoTelefone(tutores.get(peloNome)?.telefone) : "";
      const outroFone = Boolean(peloNome && chaveFone && foneDoHomonimo && foneDoHomonimo !== chaveFone);
      let clienteId = (chaveFone && porFone.get(chaveFone)) || (outroFone ? null : peloNome) || null;
      if (!clienteId) {
        const novo = ok(await sb.from("clientes").insert({ petshop_id: petshop.id, nome, telefone: fone, email, endereco }).select("id").single());
        clienteId = novo.id;
        criados.clientes.push(novo.id);
        novosAgora.add(novo.id);
        nTutores++;
        if (outroFone) homonimos++;
        tutores.set(novo.id, { id: novo.id, nome, telefone: fone, email, endereco });
        if (chaveFone) porFone.set(chaveFone, novo.id);
        porNome.set(semAcento(nome), novo.id);
      } else {
        // já existe: só preenche o que está em branco, nunca troca o que a pessoa já tinha
        const t = tutores.get(clienteId)!;
        const falta: Partial<Tutor> = {};
        if (!t.telefone?.trim() && fone) falta.telefone = fone;
        if (!t.email?.trim() && email) falta.email = email;
        if (!t.endereco?.trim() && endereco) falta.endereco = endereco;
        if (Object.keys(falta).length) {
          ok(await sb.from("clientes").update(falta).eq("id", clienteId).eq("petshop_id", petshop.id).select("id").single());
          tutores.set(clienteId, { ...t, ...falta });
          if (falta.telefone && chaveFone) porFone.set(chaveFone, clienteId);
          if (!novosAgora.has(clienteId)) completados.tutores.add(clienteId);
        }
      }

      const pet = (l.pet ?? "").trim().slice(0, 80);
      if (!pet) continue;
      const especie = especieDe(l.especie), raca = l.raca?.trim().slice(0, 60) || null, porte = porteDe(l.porte), obs = l.obs?.trim().slice(0, 600) || null;
      const chave = chavePet(clienteId, pet);
      const ja = pets.get(chave);
      if (!ja) {
        // as observações da planilha são anotações livres: vão para "Observações" da ficha, não para os alertas
        const r = ok(await sb.from("pets").insert({ petshop_id: petshop.id, cliente_id: clienteId, nome: pet, especie, raca, porte, obs }).select("id").single());
        criados.pets.push(r.id);
        novosAgora.add(r.id);
        pets.set(chave, { id: r.id, cliente_id: clienteId, nome: pet, especie, raca, porte, obs });
        nPets++;
        continue;
      }
      if (novosAgora.has(ja.id)) {
        // mesmo tutor, mesmo nome de pet, duas linhas na mesma planilha: linha repetida ou dois pets de verdade?
        const difere = (a: string | null, b: string | null) => !!a && !!b && semAcento(a) !== semAcento(b);
        const outroPet = (l.especie?.trim() && especie !== ja.especie) || difere(raca, ja.raca) || difere(porte, ja.porte);
        if (outroPet) { mesmoNome.push(`${pet} (de ${nome})`); continue; }
        linhasRepetidas++; // a mesma linha duas vezes: se esta trouxe algo que a outra não tinha, completa
      }
      const falta: Partial<PetJa> = {};
      if (!ja.raca?.trim() && raca) falta.raca = raca;
      if (!ja.porte && porte) falta.porte = porte;
      if (!ja.obs?.trim() && obs) falta.obs = obs;
      if (Object.keys(falta).length) {
        ok(await sb.from("pets").update(falta).eq("id", ja.id).eq("petshop_id", petshop.id).select("id").single());
        pets.set(chave, { ...ja, ...falta });
        if (!novosAgora.has(ja.id)) completados.pets.add(ja.id);
      } else if (!novosAgora.has(ja.id)) jaEstavam++;
    }

    const nada = nTutores + nPets + completados.tutores.size + completados.pets.size === 0;
    return [
      nada ? "Nada novo: tudo o que estava na planilha já estava no cadastro." : `${plural(nTutores, "tutor novo", "tutores novos")} e ${plural(nPets, "pet novo", "pets novos")} no cadastro.`,
      ...(completados.tutores.size ? [`${plural(completados.tutores.size, "tutor que já estava aqui ganhou", "tutores que já estavam aqui ganharam")} o que faltava (telefone, e-mail ou endereço).`] : []),
      ...(completados.pets.size ? [`${plural(completados.pets.size, "pet que já estava aqui ganhou", "pets que já estavam aqui ganharam")} o que faltava (raça, porte ou observações).`] : []),
      ...(jaEstavam ? [`${plural(jaEstavam, "pet já estava no cadastro e ficou como estava", "pets já estavam no cadastro e ficaram como estavam")}.`] : []),
      ...(linhasRepetidas ? [`${plural(linhasRepetidas, "linha repetia", "linhas repetiam")} um pet que já tinha aparecido na planilha e ${linhasRepetidas === 1 ? "foi pulada" : "foram puladas"}.`] : []),
      ...(mesmoNome.length ? [`${plural(mesmoNome.length, "pet ficou de fora porque o tutor já tem outro pet com o mesmo nome nesta planilha", "pets ficaram de fora porque o tutor já tem outro pet com o mesmo nome nesta planilha")}: ${alguns(mesmoNome, 12)}. Se forem pets diferentes, cadastre na ficha do tutor com um nome que diferencie (Thor filhote, Thor 2).`] : []),
      ...(homonimos ? [`${plural(homonimos, "tutor novo tem o mesmo nome de outro cliente, com telefone diferente, e entrou como pessoa separada", "tutores novos têm o mesmo nome de outro cliente, com telefone diferente, e entraram como pessoas separadas")}.`] : []),
      ...(doisFones.length ? [`${plural(doisFones.length, "linha tinha dois telefones: ficou o primeiro", "linhas tinham dois telefones: ficou o primeiro de cada")} (${alguns(doisFones)}).`] : []),
      ...(foneRuim.length ? [`${plural(foneRuim.length, "telefone estava incompleto e ficou em branco", "telefones estavam incompletos e ficaram em branco")}: ${alguns(foneRuim)}. Confira depois.`] : []),
      ...(!("pet" in (lido?.onde ?? {})) ? ["Nenhum pet entrou, porque a planilha veio sem coluna de pet."] : []),
    ];
  }

  async function importarProdutos(linhas: Record<string, string>[]) {
    const existentes = { data: await lerTudo<{ nome: string; codigo_barras: string | null; ativo: boolean }>((de, ate, contar) =>
      sb.from("produtos").select("nome, codigo_barras, ativo", contando(contar)).eq("petshop_id", petshop.id).order("id").range(de, ate)) };
    const tem = new Set((existentes.data ?? []).map((p) => semAcento(p.nome)));
    // código de barras é um por produto: o que vier repetido entra sem código
    const codigos = new Set((existentes.data ?? []).filter((p) => p.ativo && p.codigo_barras).map((p) => p.codigo_barras!));
    let repetidos = 0;
    const { data: u } = await sb.auth.getUser();
    let novos = 0, pulados = 0, ignorados = 0;
    const ruim = (v: string | undefined) => Boolean((v ?? "").trim()) && numero(v) == null;
    for (const l of linhas) {
      const nome = l.nome.trim().slice(0, 120);
      if (tem.has(semAcento(nome))) { pulados++; continue; }
      const preco = numero(l.preco), custo = numero(l.custo), qtd = numero(l.estoque), minimo = numero(l.minimo);
      if (ruim(l.preco) || ruim(l.custo) || ruim(l.estoque) || ruim(l.minimo)) ignorados++;
      let codigo = comCodigo ? limparCodigo(l.codigo) : null;
      if (codigo && codigos.has(codigo)) { codigo = null; repetidos++; }
      const r = await sb.from("produtos").insert({
        petshop_id: petshop.id, nome, categoria: l.categoria?.trim() || null, unidade: l.unidade?.trim().slice(0, 12) || "un",
        preco_venda: preco != null ? Math.round(preco * 100) / 100 : null, custo: custo != null ? Math.round(custo * 100) / 100 : null,
        estoque_minimo: minimo ?? 0, ...(codigo ? { codigo_barras: codigo } : {}),
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      tem.add(semAcento(nome));
      if (codigo) codigos.add(codigo);
      novos++;
      if (qtd && qtd > 0) {
        const m = await sb.from("movimentos_estoque").insert({
          petshop_id: petshop.id, produto_id: r.data.id, tipo: "ajuste", quantidade: qtd, motivo: "Saldo trazido da planilha", criado_por: u.user?.id ?? null,
        }).select("id");
        if (m.error) throw new Error(m.error.message);
      }
    }
    return [
      `${novos} ${novos === 1 ? "produto novo" : "produtos novos"} no estoque.`,
      ...(ignorados ? [`${ignorados} ${ignorados === 1 ? "produto tinha" : "produtos tinham"} preço, custo ou quantidade que não era número (ou era negativo) e ficou em branco. Confira no Estoque.`] : []),
      ...(pulados ? [`${pulados} já ${pulados === 1 ? "existia" : "existiam"} com o mesmo nome e ${pulados === 1 ? "foi pulado" : "foram pulados"}.`] : []),
      ...(repetidos ? [`${repetidos} ${repetidos === 1 ? "produto veio" : "produtos vieram"} com um código de barras que já estava em outro produto e ${repetidos === 1 ? "entrou" : "entraram"} sem código. Confira no Estoque.`] : []),
    ];
  }

  async function importar() {
    if (!lido || lido.faltou || !lido.linhas.length || indo || somenteLeitura()) return;
    if (semColuna.length && !mesmoAssim) return;
    if (lido.linhas.length > MAXIMO) { setErro(`São ${lido.linhas.length} linhas. Traga até ${MAXIMO} por vez.`); return; }
    setIndo(true); setErro(null);
    const criados = { clientes: [] as string[], pets: [] as string[] };
    try {
      const r = tipo === "clientes" ? await importarClientes(lido.linhas, criados) : await importarProdutos(lido.linhas);
      setResultado(r);
      guardarUltima({ em: new Date().toISOString(), linhas: r, ...criados });
      avisar("Planilha trazida para o sistema.");
      avisarMudanca();
      aoTerminar?.();
    } catch (e) {
      setErro(`Parou no meio: ${mensagemDeErro(e)} O que entrou antes do erro ficou salvo; pode trazer a planilha de novo, que os repetidos são pulados.`);
      if (criados.clientes.length + criados.pets.length) {
        guardarUltima({ em: new Date().toISOString(), linhas: [`A importação parou no meio. Entraram ${plural(criados.clientes.length, "tutor", "tutores")} e ${plural(criados.pets.length, "pet", "pets")} antes do erro.`], ...criados });
      }
      aoTerminar?.();
    } finally { setIndo(false); }
  }

  /** Tira do cadastro o que a última importação criou e que ninguém usou ainda. */
  async function desfazer() {
    if (!ultima || !podeDesfazer(ultima) || desfazendo || somenteLeitura()) return;
    const sim = await confirmar({
      titulo: "Desfazer esta importação?",
      texto: `Saem do cadastro ${plural(ultima.clientes.length, "tutor", "tutores")} e ${plural(ultima.pets.length, "pet", "pets")} que a importação de ${quando(ultima.em)} criou. `
        + "Quem já ganhou horário, estadia, pacote ou conta depois disso fica onde está. O que foi completado em fichas que já existiam (telefone, raça, porte) também fica.",
      confirmar: "Desfazer a importação", perigo: true,
    });
    if (!sim) return;
    setDesfazendo(true);
    try {
      const r = ok(await sb.rpc("importacao_desfazer", { p_petshop: petshop.id, p_clientes: ultima.clientes, p_pets: ultima.pets })) as { pets: number; tutores: number; pets_ficaram: number; tutores_ficaram: number };
      const ficaram = r.pets_ficaram + r.tutores_ficaram;
      const frase = `Importação desfeita: ${plural(r.tutores, "tutor saiu", "tutores saíram")} e ${plural(r.pets, "pet saiu", "pets saíram")} do cadastro.`
        + (ficaram ? ` ${plural(r.tutores_ficaram, "tutor", "tutores")} e ${plural(r.pets_ficaram, "pet", "pets")} ficaram, porque já têm horário, conta ou outra coisa ligada a eles (ou já tinham sido apagados).` : "");
      guardarUltima({ ...ultima, desfeitaEm: new Date().toISOString(), linhas: [frase] });
      setResultado(null);
      avisar("Importação desfeita.");
      avisarMudanca();
      aoTerminar?.();
    } catch (e) { avisarErro(e); } finally { setDesfazendo(false); }
  }

  const oQue = tipo === "clientes" ? "clientes e pets" : "produtos";
  const rotuloDe = (id: string) => cols.find((c) => c.id === id)?.rotulo ?? "";
  const nomesSemColuna = semColuna.map(rotuloDe);
  const foraPorFaltaDoPrincipal = lido && !lido.faltou ? lido.total - lido.linhas.length : 0;
  const botaoDesfazer = ultima && tipo === "clientes" && podeDesfazer(ultima) && (
    <div><button className="g-btn sec p" disabled={desfazendo} onClick={() => void desfazer()}><Undo2 />{desfazendo ? "Desfazendo…" : "Desfazer esta importação"}</button></div>
  );

  return (
    <Folha titulo={`Trazer ${oQue} de uma planilha`} aoFechar={aoFechar} larga>
      {resultado ? (
        <div className="g-pilha">
          <div className="g-aviso verde g-imp-resumo" role="status">{resultado.map((r) => <p key={r}>{r}</p>)}</div>
          {botaoDesfazer}
          <p className="g-muted g-pp">Este resumo fica guardado neste aparelho: é só abrir Trazer de planilha de novo para ver.</p>
          <button className="g-btn verde" onClick={aoFechar}>Pronto</button>
        </div>
      ) : (
        <div className="g-pilha">
          {ultima && (
            <div className="g-card liso g-pilha p g-imp-ultima">
              <b className="g-p"><History style={{ width: 18, height: 18, verticalAlign: "-3px", marginRight: 6 }} />Última importação: {quando(ultima.em)}{ultima.desfeitaEm ? " (desfeita)" : ""}</b>
              {ultima.linhas.map((r) => <p key={r} className="g-muted g-pp">{r}</p>)}
              {botaoDesfazer}
            </div>
          )}
          <p className="g-muted g-p">
            Serve para quem vem de outro sistema ou de uma planilha. Nada do que já está aqui é apagado: {tipo === "clientes" ? "tutor ou pet que já existe só ganha o que estava em branco (telefone, raça, porte, observações)" : "produto com o mesmo nome é pulado"}.
          </p>
          <div className="g-card liso g-pilha p">
            <b className="g-p">1. A planilha precisa de uma linha de títulos</b>
            <p className="g-muted g-pp">
              Colunas aceitas: {emOrdem(tipo, comCodigo).map((c) => c.rotulo).join(", ")}. Só <b>{principal.rotulo}</b> é obrigatória.
              {tipo === "clientes" && " Um tutor com dois pets ocupa duas linhas, repetindo o nome e o telefone. Se os títulos da sua planilha forem outros (Responsável, Zap, Bichinho), você escolhe o que é cada coluna antes de trazer."}
            </p>
            <div><button className="g-btn sec p" onClick={() => baixarModelo(tipo, comCodigo)}><Download />Baixar planilha modelo</button></div>
          </div>
          <div className="g-card liso g-pilha p">
            <b className="g-p">2. Escolha o arquivo ou cole as células</b>
            <label className="g-btn sec" style={{ justifySelf: "start", cursor: "pointer" }}>
              <Upload />Escolher arquivo CSV
              <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => { void escolherArquivo(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <textarea className="g-textarea" style={{ minHeight: 110, fontFamily: "ui-monospace, monospace", fontSize: ".8125rem" }} value={texto}
              placeholder="Ou selecione as células no Excel ou no Google Planilhas (com a linha de títulos), copie e cole aqui."
              onChange={(e) => { setTexto(e.target.value); setErro(null); }} aria-label="Células coladas da planilha" />
          </div>

          {erro && <p className="g-aviso vermelho" role="alert">{erro}</p>}
          {lido && (
            <div className="g-card liso g-pilha p">
              <b className="g-p"><FileSpreadsheet style={{ width: 18, height: 18, verticalAlign: "-3px", marginRight: 6 }} />3. Confira o que é cada coluna</b>
              <p className="g-muted g-pp">Em cima, o título da sua planilha. Embaixo, onde ele entra aqui. Se eu errei o palpite, é só trocar.</p>
              <div className="g-imp-rolagem">
                <table className="g-imp-tabela">
                  <thead>
                    <tr>{titulos.map((t, i) => <th key={i} scope="col">{t || `Coluna ${i + 1}`}</th>)}</tr>
                    <tr>
                      {titulos.map((t, i) => (
                        <td key={i}>
                          <select className={`g-select g-imp-sel${lido.mapa[i] ? " usa" : ""}`} value={lido.mapa[i]} aria-label={`A coluna “${t || i + 1}” é`} onChange={(e) => escolher(i, e.target.value)}>
                            <option value="">Não usar</option>
                            {emOrdem(tipo, comCodigo).map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
                          </select>
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lido.amostra.map((l, n) => <tr key={n}>{titulos.map((_, i) => <td key={i} className={lido.mapa[i] ? undefined : "fora"}>{l[i] ?? ""}</td>)}</tr>)}
                  </tbody>
                </table>
              </div>
              {lido.total > lido.amostra.length && <p className="g-muted g-pp">Mostrando as {lido.amostra.length} primeiras linhas de {lido.total}.</p>}

              {lido.faltou ? (
                <p className="g-aviso vermelho" role="alert">
                  <span><b>Falta dizer qual coluna tem o {lido.faltou.rotulo.toLowerCase()}.</b> Sem isso não dá para trazer. Escolha “{lido.faltou.rotulo}” na coluna certa, aqui em cima.</span>
                </p>
              ) : (
                <p className="g-p">
                  <b>{lido.linhas.length}</b> {lido.linhas.length === 1 ? "linha" : "linhas"} para trazer
                  {foraPorFaltaDoPrincipal > 0 ? ` (${foraPorFaltaDoPrincipal === 1 ? `1 linha sem ${principal.rotulo.toLowerCase()} fica de fora` : `${foraPorFaltaDoPrincipal} linhas sem ${principal.rotulo.toLowerCase()} ficam de fora`})` : ""}.
                </p>
              )}
              {nomesSemColuna.length > 0 && (
                <div className="g-aviso vermelho g-imp-falta" role="alert">
                  <TriangleAlert aria-hidden />
                  <div>
                    <b>{nomesSemColuna.length === 2 ? "Nenhuma coluna está marcada como Telefone nem como Pet." : `Nenhuma coluna está marcada como ${nomesSemColuna[0]}.`}</b>
                    <p>
                      {semColuna.includes("pet") && semColuna.includes("telefone") ? "Do jeito que está, entram só os nomes dos tutores: sem telefone e sem nenhum pet."
                        : semColuna.includes("pet") ? "Do jeito que está, entram só os tutores, sem nenhum pet."
                        : "Do jeito que está, os tutores entram sem telefone, e o sistema não tem como mandar lembrete nem reconhecer quem já é cliente."}
                      {" "}Se a planilha tem essa informação, escolha a coluna aqui em cima.
                    </p>
                    {!mesmoAssim
                      ? <button type="button" className="g-btn sec p" onClick={() => setMesmoAssim(true)}>Trazer mesmo assim</button>
                      : <p><b>Certo: vou trazer sem {nomesSemColuna.map((n) => n.toLowerCase()).join(" e sem ")}.</b></p>}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="g-fila">
            <button className="g-btn pri" disabled={!lido || Boolean(lido.faltou) || !lido.linhas.length || indo || (semColuna.length > 0 && !mesmoAssim)} onClick={() => void importar()}>
              {indo ? "Trazendo… não feche" : lido?.linhas.length ? `Trazer ${lido.linhas.length} ${lido.linhas.length === 1 ? "linha" : "linhas"}` : "Trazer"}
            </button>
            <button className="g-btn sec" disabled={indo} onClick={aoFechar}>Cancelar</button>
          </div>
        </div>
      )}
    </Folha>
  );
}

/** Linha discreta com a última importação (data e resumo), para a tela de clientes. Toca e abre a folha, onde dá para desfazer. */
export function UltimaImportacao({ tipo, aoAbrir, versao }: { tipo: Tipo; aoAbrir: () => void; versao?: unknown }) {
  const { petshop } = useGestao();
  const [u, setU] = useState<Ultima | null>(null);
  useEffect(() => { setU(lerUltimaImportacao(petshop.id, tipo)); }, [petshop.id, tipo, versao]);
  // some sozinha depois de uma semana
  if (!u || Date.now() - Date.parse(u.em) > 7 * 864e5) return null;
  return (
    <button type="button" className="g-imp-linha" onClick={aoAbrir}>
      <History aria-hidden />
      <span><b>Última importação: {quando(u.em)}{u.desfeitaEm ? " (desfeita)" : ""}.</b> {u.linhas[0]}</span>
      <i>Ver</i>
    </button>
  );
}
