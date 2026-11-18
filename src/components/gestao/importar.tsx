"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Download, FileSpreadsheet, History, TriangleAlert, Undo2, Upload } from "lucide-react";
import { dataCurta, hora, isoDia, semAcento } from "@/lib/gestao/util";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { fraseDesfeita, frasesDoResumo, lerTabela, linhasParaOBanco, tabelaComoTexto, type ResumoDaImportacao } from "@/lib/gestao/planilha";
import { ehXlsx, inflarNoNavegador, lerXlsx, temInflarNoNavegador } from "@/lib/gestao/xlsx";
import { limparCodigo, opcoesDaLoja } from "@/lib/gestao/loja-opcoes";
import { gravarMovimentos, parteDaChave } from "@/lib/gestao/dinheiro";
import { unidadeDaPlanilha, validadeDaPlanilha } from "@/lib/gestao/planilha-produtos";
import { useOperacao } from "@/lib/gestao/uma-vez";
import type { Json } from "@/lib/gestao/banco";
import { useGestao } from "./contexto";
import { guardarLembrado, lerLembrado } from "./lembrado";
import { Folha, avisarMudanca, mensagemDeErro, ok, useAvisos, useSomenteLeitura } from "./ui";
import FotoCaderno from "./caderno";

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
    // alergia, medo, doença: vai para os alertas do pet (aparecem na agenda). Observação que fala disso também vira alerta.
    { id: "alertas", rotulo: "Alertas", nomes: ["alerta", "alertas", "cuidados", "cuidado", "atencao", "saude", "alergia", "alergias"], parece: /alerta|cuidado|atencao|alergi/, exemplo: "Alergia a shampoo comum" },
    { id: "obs", rotulo: "Observações", nomes: ["observacao", "observacoes", "obs", "anotacao", "anotacoes", "notas"], parece: /observa|\bobs\b|anota|\bnotas?\b/, exemplo: "Gosta de laço" },
    // antes de tutor e pet: "Nascimento do pet" e "Sexo do animal" são destas (o aniversário do pet e a promoção dependem delas)
    { id: "nascimento", rotulo: "Nascimento do pet", nomes: ["nascimento", "data de nascimento", "nascimento do pet", "aniversario", "aniversario do pet", "data nasc", "nasc"], parece: /nasc|aniversari/, exemplo: "20/11/2021" },
    { id: "sexo", rotulo: "Sexo do pet", nomes: ["sexo", "sexo do pet", "genero"], parece: /\bsexo\b|genero/, exemplo: "Fêmea" },
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
    // com a validade, o produto passa a "Controlar validade" e a quantidade entra como um lote (com o código do lote, se tiver)
    { id: "validade", rotulo: "Validade", nomes: ["validade", "data de validade", "vencimento", "vence", "vence em", "val"], parece: /validade|vencimento/, exemplo: "10/02/2027" },
    { id: "lote", rotulo: "Lote", nomes: ["lote", "numero do lote", "cod lote", "codigo do lote"], parece: /\blote\b/, exemplo: "L2311A" },
    // só entra quando o pet shop ligou os fornecedores nas opções da loja (o que não existe é cadastrado)
    { id: "fornecedor", rotulo: "Fornecedor", nomes: ["fornecedor", "distribuidor", "marca do fornecedor"], parece: /fornecedor|distribuidor/, exemplo: "Distribuidora Pet Sul" },
  ],
};
/** Ordem em que as colunas aparecem para a pessoa (na lista do seletor e na planilha modelo). */
const ORDEM: Record<Tipo, string[]> = {
  clientes: ["tutor", "telefone", "pet", "especie", "raca", "porte", "nascimento", "sexo", "alertas", "obs", "email", "endereco"],
  produtos: ["nome", "codigo", "categoria", "unidade", "preco", "custo", "estoque", "minimo", "validade", "lote", "fornecedor"],
};
/** Colunas que dependem de uma opção da loja: código de barras e fornecedor. */
type Extras = { codigo: boolean; fornecedor: boolean };
const vale = (id: string, x: Extras) => (id !== "codigo" || x.codigo) && (id !== "fornecedor" || x.fornecedor);
/** As colunas aceitas; a de código de barras e a de fornecedor só para quem ligou a opção. */
const colunasDe = (tipo: Tipo, x: Extras) => COLUNAS[tipo].filter((c) => vale(c.id, x));
const emOrdem = (tipo: Tipo, x: Extras) => ORDEM[tipo].filter((id) => vale(id, x)).map((id) => COLUNAS[tipo].find((c) => c.id === id)!);
const MAXIMO = 2000;

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
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function baixarModelo(tipo: Tipo, extras: Extras) {
  const cols = emOrdem(tipo, extras);
  const csv = "﻿" + [cols.map((c) => c.rotulo), cols.map((c) => c.exemplo)].map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `modelo-${tipo}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- última importação ---------- */

type Ultima = {
  /** A importação guardada no banco (clientes); sem id, a guardada neste aparelho (produtos, ou de antes da mudança). */
  id?: string;
  /** Quando terminou (ISO). */
  em: string;
  /** O resumo, como aparece na tela. */
  linhas: string[];
  /** O que esta importação criou (para poder desfazer). */
  clientes: string[]; pets: string[];
  desfeitaEm?: string;
};
type Banco = ReturnType<typeof useGestao>["sb"];
const chaveUltima = (petshopId: string, tipo: Tipo) => `maestro-gestao-importacao:${petshopId}:${tipo}`;
export function lerUltimaImportacao(petshopId: string, tipo: Tipo): Ultima | null {
  try {
    const v = JSON.parse(lerLembrado(chaveUltima(petshopId, tipo)) ?? "null") as Ultima | null;
    return v && typeof v.em === "string" && Array.isArray(v.linhas) ? { ...v, clientes: v.clientes ?? [], pets: v.pets ?? [] } : null;
  } catch { return null; }
}
/**
 * A última importação de clientes vem do banco (qualquer aparelho vê, e o resumo é o que o banco contou). Sem nada no banco
 * (ou banco antes da atualização), a guardada neste aparelho.
 */
async function lerUltima(sb: Banco, petshopId: string, tipo: Tipo): Promise<Ultima | null> {
  const local = lerUltimaImportacao(petshopId, tipo);
  if (tipo !== "clientes") return local;
  const r = await sb.from("importacoes").select("id, criado_em, resumo, clientes, pets, desfeita_em, desfeita")
    .eq("petshop_id", petshopId).order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (r.error || !r.data) return local;
  const d = r.data;
  const doBanco: Ultima = {
    id: d.id, em: d.criado_em, clientes: d.clientes ?? [], pets: d.pets ?? [], desfeitaEm: d.desfeita_em ?? undefined,
    linhas: d.desfeita_em && d.desfeita ? [fraseDesfeita(d.desfeita as Record<string, number>)] : frasesDoResumo(d.resumo as unknown as ResumoDaImportacao),
  };
  return local && Date.parse(local.em) > Date.parse(doBanco.em) ? local : doBanco;
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
  // a lista está no caderno ou noutro sistema (print, PDF): a mesma folha vira a leitura por foto
  const [caderno, setCaderno] = useState(false);
  const { codigoBarras: comCodigo, fornecedores: comFornecedor } = opcoesDaLoja(petshop);
  const extras = useMemo(() => ({ codigo: comCodigo, fornecedor: comFornecedor }), [comCodigo, comFornecedor]);
  const cols = useMemo(() => colunasDe(tipo, extras), [tipo, extras]);
  const principal = cols.find((c) => c.obrigatoria)!;

  useEffect(() => {
    let vale = true;
    void lerUltima(sb, petshop.id, tipo).then((u) => { if (vale) setUltima(u); }, () => {});
    return () => { vale = false; };
  }, [sb, petshop.id, tipo]);
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
    if (/\.(xls|ods|numbers)$/i.test(arquivo.name)) {
      setErro("Esse formato de planilha eu não abro. No Excel ou no Google Planilhas, use Arquivo → Salvar como (ou Fazer download) → Excel (.xlsx) ou CSV. Ou selecione as células, copie e cole no campo abaixo.");
      return;
    }
    if (arquivo.size > 8_000_000) { setErro("O arquivo é grande demais. Divida em partes de até 2.000 linhas."); return; }
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    // planilha do Excel ou do Google Planilhas (.xlsx): lida aqui mesmo, a primeira aba
    if (ehXlsx(bytes) || /\.xlsx$/i.test(arquivo.name)) {
      if (!temInflarNoNavegador()) { setErro("Este navegador não abre planilha do Excel. Salve como CSV, ou selecione as células, copie e cole no campo abaixo."); return; }
      try {
        const linhas = await lerXlsx(bytes, inflarNoNavegador);
        if (linhas.length < 2) { setErro("A primeira aba da planilha está vazia ou só tem os títulos. Confira se os clientes estão na primeira aba."); return; }
        setTexto(tabelaComoTexto(linhas));
      } catch { setErro("Não consegui abrir essa planilha. No Excel, use Arquivo → Salvar como → CSV, ou copie as células e cole no campo abaixo."); }
      return;
    }
    if (arquivo.size > 2_000_000) { setErro("O arquivo é grande demais. Divida em partes de até 2.000 linhas."); return; }
    // planilha salva pelo Excel antigo vem em outro alfabeto: se o UTF-8 der caractere quebrado, tenta o do Windows
    let t = new TextDecoder("utf-8").decode(bytes);
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(bytes);
    setTexto(t);
  }

  /**
   * Clientes e pets: uma operação só, no banco (função importar_clientes). Entra tudo ou nada; o resumo é contado lá, na mesma
   * gravação, e fica guardado. Sair da tela no meio não deixa metade: ao voltar, a última importação mostra o que entrou.
   */
  async function importarClientes(linhas: Record<string, string>[], chave: string): Promise<Ultima> {
    const { linhas: paraOBanco, extra } = linhasParaOBanco(linhas, Boolean(lido && "pet" in lido.onde), isoDia(new Date()));
    const r = ok(await sb.rpc("importar_clientes", { p_petshop: petshop.id, p_chave: chave, p_linhas: paraOBanco as unknown as Json, p_extra: extra as unknown as Json })) as unknown as {
      id: string; em: string; resumo: ResumoDaImportacao; clientes: string[]; pets: string[];
    };
    return { id: r.id, em: r.em, linhas: frasesDoResumo(r.resumo), clientes: r.clientes ?? [], pets: r.pets ?? [] };
  }

  async function importarProdutos(linhas: Record<string, string>[], chave: string) {
    const existentes = { data: await lerTudo<{ nome: string; codigo_barras: string | null; ativo: boolean }>((de, ate, contar) =>
      sb.from("produtos").select("nome, codigo_barras, ativo", contando(contar)).eq("petshop_id", petshop.id).order("id").range(de, ate)) };
    const tem = new Set((existentes.data ?? []).map((p) => semAcento(p.nome)));
    // código de barras é um por produto: o que vier repetido entra sem código
    const codigos = new Set((existentes.data ?? []).filter((p) => p.ativo && p.codigo_barras).map((p) => p.codigo_barras!));
    let repetidos = 0;
    const { data: u } = await sb.auth.getUser();
    let novos = 0, pulados = 0, ignorados = 0, semValidade = 0, comLote = 0, outroLote = 0, repetidoSemLote = 0;
    // produto criado por esta planilha: uma segunda linha com o mesmo nome (outro lote, outra validade) entra como mais um lote dele
    const criados = new Map<string, { id: string; controla: boolean }>();
    // fornecedores pelo nome (sem acento); o que a planilha traz e não existe é cadastrado uma vez
    const fornecedores = new Map<string, string>();
    if (comFornecedor && linhas.some((l) => l.fornecedor?.trim())) {
      const fs = ok(await sb.from("fornecedores").select("id, nome").eq("petshop_id", petshop.id).order("id").limit(1000));
      for (const f of fs) fornecedores.set(semAcento(f.nome), f.id);
    }
    const fornecedorDe = async (nome: string | undefined) => {
      const n = (nome ?? "").trim().slice(0, 120);
      if (!comFornecedor || !n) return null;
      const ja = fornecedores.get(semAcento(n));
      if (ja) return ja;
      const f = ok(await sb.from("fornecedores").insert({ petshop_id: petshop.id, nome: n }).select("id").single());
      fornecedores.set(semAcento(n), f.id);
      return f.id;
    };
    const ruim = (v: string | undefined) => Boolean((v ?? "").trim()) && numero(v) == null;
    for (const [i, l] of linhas.entries()) {
      const nome = l.nome.trim().slice(0, 120);
      const desta = criados.get(semAcento(nome));
      if (desta) {
        // a mesma planilha repete o produto (é assim que a nota do distribuidor vem): a quantidade entra como outro lote
        const q = numero(l.estoque), c = numero(l.custo), val = validadeDaPlanilha(l.validade), lt = (l.lote ?? "").trim().slice(0, 60) || null;
        if (!(q && q > 0)) { pulados++; continue; }
        if (desta.controla && !val && !lt) { repetidoSemLote++; continue; }
        await gravarMovimentos(sb, petshop.id, [{
          petshop_id: petshop.id, produto_id: desta.id, tipo: "entrada", quantidade: q, motivo: "Saldo trazido da planilha", criado_por: u.user?.id ?? null,
          custo_unitario: c != null ? Math.round(c * 100) / 100 : null, ...(desta.controla ? { lote: lt, validade: val || null } : {}), chave: parteDaChave(chave, "saldo", i),
        }]);
        outroLote++;
        continue;
      }
      if (tem.has(semAcento(nome))) { pulados++; continue; }
      const preco = numero(l.preco), custo = numero(l.custo), qtd = numero(l.estoque), minimo = numero(l.minimo);
      if (ruim(l.preco) || ruim(l.custo) || ruim(l.estoque) || ruim(l.minimo)) ignorados++;
      let codigo = comCodigo ? limparCodigo(l.codigo) : null;
      if (codigo && codigos.has(codigo)) { codigo = null; repetidos++; }
      const validade = validadeDaPlanilha(l.validade);
      if (validade === undefined) semValidade++;
      const lote = (l.lote ?? "").trim().slice(0, 60) || null;
      // com validade (ou lote) na planilha, o produto controla a validade e o saldo entra como um lote
      const controla = Boolean(validade || lote);
      const fornecedorId = await fornecedorDe(l.fornecedor);
      const r = await sb.from("produtos").insert({
        petshop_id: petshop.id, nome, categoria: l.categoria?.trim() || null, unidade: unidadeDaPlanilha(l.unidade),
        preco_venda: preco != null ? Math.round(preco * 100) / 100 : null, custo: custo != null ? Math.round(custo * 100) / 100 : null,
        estoque_minimo: minimo ?? 0, ...(codigo ? { codigo_barras: codigo } : {}), ...(controla ? { controla_validade: true } : {}),
        ...(fornecedorId ? { fornecedor_id: fornecedorId } : {}),
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      tem.add(semAcento(nome));
      criados.set(semAcento(nome), { id: r.data.id, controla });
      if (codigo) codigos.add(codigo);
      novos++;
      if (qtd && qtd > 0) {
        // o saldo de cada linha da planilha entra uma vez só por importação (a chave é da folha + o número da linha);
        // com validade ou lote, entra como o lote do que já está na prateleira (no Vencendo e no "vence antes sai antes")
        await gravarMovimentos(sb, petshop.id, [controla ? {
          petshop_id: petshop.id, produto_id: r.data.id, tipo: "entrada", quantidade: qtd, motivo: "Saldo trazido da planilha", criado_por: u.user?.id ?? null,
          custo_unitario: custo != null ? Math.round(custo * 100) / 100 : null, lote, validade: validade || null, chave: parteDaChave(chave, "saldo", i),
        } : {
          petshop_id: petshop.id, produto_id: r.data.id, tipo: "ajuste", quantidade: qtd, motivo: "Saldo trazido da planilha", criado_por: u.user?.id ?? null,
          chave: parteDaChave(chave, "saldo", i),
        }]);
        if (controla) comLote++;
      }
    }
    return [
      `${novos} ${novos === 1 ? "produto novo" : "produtos novos"} no estoque.`,
      ...(ignorados ? [`${ignorados} ${ignorados === 1 ? "produto tinha" : "produtos tinham"} preço, custo ou quantidade que não era número (ou era negativo) e ficou em branco. Confira no Estoque.`] : []),
      ...(outroLote ? [`${outroLote} ${outroLote === 1 ? "linha repetia" : "linhas repetiam"} um produto desta planilha e ${outroLote === 1 ? "entrou" : "entraram"} como mais um lote dele (a quantidade somou no saldo).`] : []),
      ...(repetidoSemLote ? [`${repetidoSemLote} ${repetidoSemLote === 1 ? "linha repetia" : "linhas repetiam"} um produto com validade, mas sem validade nem lote: ${repetidoSemLote === 1 ? "ficou" : "ficaram"} de fora. Dê entrada em Estoque, Entrada.`] : []),
      ...(pulados ? [`${pulados} já ${pulados === 1 ? "existia" : "existiam"} com o mesmo nome e ${pulados === 1 ? "foi pulado" : "foram pulados"}.`] : []),
      ...(repetidos ? [`${repetidos} ${repetidos === 1 ? "produto veio" : "produtos vieram"} com um código de barras que já estava em outro produto e ${repetidos === 1 ? "entrou" : "entraram"} sem código. Confira no Estoque.`] : []),
      ...(comLote ? [`${comLote} ${comLote === 1 ? "produto entrou" : "produtos entraram"} com a validade ou o lote: ${comLote === 1 ? "já aparece" : "já aparecem"} no Vencendo.`] : []),
      ...(semValidade ? [`${semValidade} ${semValidade === 1 ? "produto tinha" : "produtos tinham"} uma validade que não deu para ler (use 10/02/2027) e ${semValidade === 1 ? "entrou" : "entraram"} sem ela. Confira no Estoque.`] : []),
    ];
  }

  // trava na hora do primeiro toque: dois toques seguidos em Trazer não criam os produtos (nem o saldo) duas vezes
  const op = useOperacao();
  const importar = () => op.fazer(trazer);
  async function trazer(chave: string): Promise<boolean | void> {
    if (!lido || lido.faltou || !lido.linhas.length || indo || somenteLeitura()) return;
    if (semColuna.length && !mesmoAssim) return;
    if (lido.linhas.length > MAXIMO) { setErro(`São ${lido.linhas.length} linhas. Traga até ${MAXIMO} por vez.`); return; }
    setIndo(true); setErro(null);
    try {
      if (tipo === "clientes") {
        const u = await importarClientes(lido.linhas, chave);
        setResultado(u.linhas);
        setUltima(u);
      } else {
        const r = await importarProdutos(lido.linhas, chave);
        setResultado(r);
        guardarUltima({ em: new Date().toISOString(), linhas: r, clientes: [], pets: [] });
      }
      avisar("Planilha trazida para o sistema.");
      avisarMudanca();
      aoTerminar?.();
    } catch (e) {
      setErro(tipo === "clientes"
        ? `Não deu para trazer: ${mensagemDeErro(e)} Nada da planilha entrou. Confira a internet e toque em Trazer de novo.`
        : `Parou no meio: ${mensagemDeErro(e)} O que entrou antes do erro ficou salvo; pode trazer a planilha de novo, que os repetidos são pulados.`);
      aoTerminar?.();
      // a mesma chave na nova tentativa: o banco devolve o que já entrou (clientes) e não dá entrada duas vezes no mesmo estoque
      return false;
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
      const r = (ultima.id
        ? ok(await sb.rpc("importacao_desfazer_registro", { p_petshop: petshop.id, p_id: ultima.id }))
        : ok(await sb.rpc("importacao_desfazer", { p_petshop: petshop.id, p_clientes: ultima.clientes, p_pets: ultima.pets }))) as { pets: number; tutores: number; pets_ficaram: number; tutores_ficaram: number };
      const desfeita = { ...ultima, desfeitaEm: new Date().toISOString(), linhas: [fraseDesfeita(r)] };
      if (ultima.id) setUltima(desfeita); else guardarUltima(desfeita);
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

  if (caderno) return <FotoCaderno aoFechar={aoFechar} aoTerminar={aoTerminar} tipoInicial="clientes" />;
  return (
    <Folha titulo={`Trazer ${oQue} de uma planilha`} aoFechar={aoFechar} larga>
      {resultado ? (
        <div className="g-pilha">
          <div className="g-aviso verde g-imp-resumo" role="status">{resultado.map((r) => <p key={r}>{r}</p>)}</div>
          {botaoDesfazer}
          <p className="g-muted g-pp">{tipo === "clientes" ? "Este resumo fica guardado: é só abrir Trazer de planilha de novo para ver, de qualquer aparelho." : "Este resumo fica guardado neste aparelho: é só abrir Trazer de planilha de novo para ver."}</p>
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
          {tipo === "clientes" && (
            <div className="g-card liso g-fila entre g-imp-caderno">
              <span className="g-p"><b>A lista está num caderno, num print ou num PDF do outro sistema?</b> Tire uma foto: eu leio e você confere antes de salvar.</span>
              <button type="button" className="g-btn sec p" onClick={() => setCaderno(true)}><Camera />Tirar foto do caderno</button>
            </div>
          )}
          <p className="g-muted g-p">
            Serve para quem vem de outro sistema ou de uma planilha. Nada do que já está aqui é apagado: {tipo === "clientes" ? "tutor ou pet que já existe só ganha o que estava em branco (telefone, raça, porte, observações)" : "produto que já estava no estoque com o mesmo nome é pulado; o mesmo produto em duas linhas da planilha (dois lotes) entra uma vez, com os dois lotes"}.
          </p>
          <div className="g-card liso g-pilha p">
            <b className="g-p">1. A planilha precisa de uma linha de títulos</b>
            <p className="g-muted g-pp">
              Colunas aceitas: {emOrdem(tipo, extras).map((c) => c.rotulo).join(", ")}. Só <b>{principal.rotulo}</b> é obrigatória.
              {tipo === "clientes" && " Um tutor com dois pets ocupa duas linhas, repetindo o nome e o telefone. Se os títulos da sua planilha forem outros (Responsável, Zap, Bichinho), você escolhe o que é cada coluna antes de trazer."}
            </p>
            <div><button className="g-btn sec p" onClick={() => baixarModelo(tipo, extras)}><Download />Baixar planilha modelo</button></div>
          </div>
          <div className="g-card liso g-pilha p">
            <b className="g-p">2. Escolha o arquivo ou cole as células</b>
            <label className="g-btn sec" style={{ justifySelf: "start", cursor: "pointer" }}>
              <Upload />Escolher planilha (Excel ou CSV)
              <input type="file" accept=".csv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { void escolherArquivo(e.target.files?.[0]); e.target.value = ""; }} />
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
                            {emOrdem(tipo, extras).map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
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
              {indo ? "Trazendo…" : lido?.linhas.length ? `Trazer ${lido.linhas.length} ${lido.linhas.length === 1 ? "linha" : "linhas"}` : "Trazer"}
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
  const { sb, petshop } = useGestao();
  const [u, setU] = useState<Ultima | null>(null);
  useEffect(() => {
    let vale = true;
    void lerUltima(sb, petshop.id, tipo).then((x) => { if (vale) setU(x); }, () => {});
    return () => { vale = false; };
  }, [sb, petshop.id, tipo, versao]);
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
