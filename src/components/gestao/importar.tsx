"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { semAcento } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { Folha, avisarMudanca, mensagemDeErro, useAvisos, useSomenteLeitura } from "./ui";

type Tipo = "clientes" | "produtos";
type Coluna = { id: string; rotulo: string; nomes: string[]; obrigatoria?: boolean; exemplo: string };

/** Colunas aceitas. `nomes` são os títulos que a planilha pode usar (sem acento, em minúsculas). */
const COLUNAS: Record<Tipo, Coluna[]> = {
  clientes: [
    { id: "tutor", rotulo: "Tutor", nomes: ["tutor", "cliente", "nome do tutor", "nome do cliente", "dono", "responsavel", "nome"], obrigatoria: true, exemplo: "Roberta Dias" },
    { id: "telefone", rotulo: "Telefone", nomes: ["telefone", "whatsapp", "celular", "fone", "contato"], exemplo: "(11) 91234-5678" },
    { id: "pet", rotulo: "Pet", nomes: ["pet", "nome do pet", "animal", "nome do animal"], exemplo: "Mel" },
    { id: "especie", rotulo: "Espécie", nomes: ["especie", "tipo"], exemplo: "cão" },
    { id: "raca", rotulo: "Raça", nomes: ["raca"], exemplo: "Poodle" },
    { id: "porte", rotulo: "Porte", nomes: ["porte", "tamanho"], exemplo: "P" },
    { id: "email", rotulo: "E-mail", nomes: ["email", "e-mail"], exemplo: "" },
    { id: "endereco", rotulo: "Endereço", nomes: ["endereco"], exemplo: "" },
    { id: "obs", rotulo: "Observação", nomes: ["observacao", "observacoes", "obs", "cuidados", "alertas"], exemplo: "Tem medo de secador" },
  ],
  produtos: [
    { id: "nome", rotulo: "Produto", nomes: ["produto", "nome", "nome do produto", "descricao", "item"], obrigatoria: true, exemplo: "Ração Golden 15kg" },
    { id: "categoria", rotulo: "Categoria", nomes: ["categoria", "grupo", "tipo"], exemplo: "Ração" },
    { id: "unidade", rotulo: "Unidade", nomes: ["unidade", "un", "medida"], exemplo: "saco" },
    { id: "preco", rotulo: "Preço de venda", nomes: ["preco", "preco de venda", "venda", "valor", "valor de venda"], exemplo: "189,90" },
    { id: "custo", rotulo: "Custo", nomes: ["custo", "preco de custo", "valor de custo", "compra"], exemplo: "140,00" },
    { id: "estoque", rotulo: "Quantidade em estoque", nomes: ["estoque", "quantidade", "qtd", "saldo", "quantidade em estoque"], exemplo: "10" },
    { id: "minimo", rotulo: "Estoque mínimo", nomes: ["minimo", "estoque minimo", "alerta"], exemplo: "3" },
  ],
};
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

/** "1.234,50", "R$ 45", "45.5" → número; vazio ou inválido → null. */
function numero(v: string | undefined) {
  const s = (v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 1000) / 1000 : null;
}
const digitos = (v: string | undefined) => (v ?? "").replace(/\D/g, "");
const fimDoFone = (v: string | null | undefined) => digitos(v ?? "").slice(-8);
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

function baixarModelo(tipo: Tipo) {
  const cols = COLUNAS[tipo];
  const csv = "﻿" + [cols.map((c) => c.rotulo), cols.map((c) => c.exemplo)].map((l) => l.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `modelo-${tipo}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Traz clientes e pets, ou produtos, de uma planilha (arquivo CSV ou células coladas).
 * Não apaga nem altera nada que já existe: quem já está no cadastro é pulado.
 */
export default function Importar({ tipo, aoFechar, aoTerminar }: { tipo: Tipo; aoFechar: () => void; aoTerminar?: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [texto, setTexto] = useState("");
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string[] | null>(null);
  const cols = COLUNAS[tipo];

  const lido = useMemo(() => {
    const tabela = lerTabela(texto);
    if (tabela.length < 2) return null;
    const titulos = tabela[0].map(semAcento);
    const onde: Record<string, number> = {};
    for (const c of cols) { const i = titulos.findIndex((t) => c.nomes.includes(t)); if (i >= 0) onde[c.id] = i; }
    const linhas = tabela.slice(1).map((l) => Object.fromEntries(Object.entries(onde).map(([id, i]) => [id, l[i] ?? ""])) as Record<string, string>);
    const principal = cols.find((c) => c.obrigatoria)!;
    return {
      achadas: cols.filter((c) => c.id in onde), faltou: !(principal.id in onde) ? principal : null,
      linhas: linhas.filter((l) => (l[principal.id] ?? "").trim()), total: tabela.length - 1,
      ignoradas: tabela[0].filter((_, i) => !Object.values(onde).includes(i)).filter(Boolean),
    };
  }, [texto, cols]);

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

  async function importarClientes(linhas: Record<string, string>[]) {
    const existentes = await sb.from("clientes").select("id, nome, telefone").eq("petshop_id", petshop.id).limit(10000);
    if (existentes.error) throw new Error(existentes.error.message);
    const porFone = new Map<string, string>(), porNome = new Map<string, string>();
    for (const c of existentes.data ?? []) { if (fimDoFone(c.telefone).length === 8) porFone.set(fimDoFone(c.telefone), c.id); porNome.set(semAcento(c.nome), c.id); }
    const petsJa = await sb.from("pets").select("cliente_id, nome").eq("petshop_id", petshop.id).limit(20000);
    if (petsJa.error) throw new Error(petsJa.error.message);
    const temPet = new Set((petsJa.data ?? []).map((p) => `${p.cliente_id}:${semAcento(p.nome)}`));

    let tutores = 0, pets = 0, pulados = 0, semFone = 0;
    for (const l of linhas) {
      const nome = l.tutor.trim().slice(0, 120);
      const fone = digitos(l.telefone);
      const foneOk = fone.length >= 10 && fone.length <= 13;
      if (l.telefone?.trim() && !foneOk) semFone++;
      const chaveFone = foneOk ? fone.slice(-8) : "";
      let clienteId = (chaveFone && porFone.get(chaveFone)) || porNome.get(semAcento(nome)) || null;
      if (!clienteId) {
        const novo = await sb.from("clientes").insert({
          petshop_id: petshop.id, nome, telefone: foneOk ? fone : null,
          email: l.email?.trim() || null, endereco: l.endereco?.trim() || null,
        }).select("id").single();
        if (novo.error) throw new Error(novo.error.message);
        clienteId = novo.data.id;
        tutores++;
        if (chaveFone) porFone.set(chaveFone, clienteId);
        porNome.set(semAcento(nome), clienteId);
      }
      const pet = (l.pet ?? "").trim().slice(0, 80);
      if (!pet) continue;
      if (temPet.has(`${clienteId}:${semAcento(pet)}`)) { pulados++; continue; }
      const r = await sb.from("pets").insert({
        petshop_id: petshop.id, cliente_id: clienteId, nome: pet, especie: especieDe(l.especie), raca: l.raca?.trim() || null,
        porte: porteDe(l.porte), alertas: l.obs?.trim().slice(0, 500) || null,
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      temPet.add(`${clienteId}:${semAcento(pet)}`);
      pets++;
    }
    return [
      `${tutores} ${tutores === 1 ? "tutor novo" : "tutores novos"} e ${pets} ${pets === 1 ? "pet novo" : "pets novos"} no cadastro.`,
      ...(pulados ? [`${pulados} ${pulados === 1 ? "pet já estava" : "pets já estavam"} no cadastro e ${pulados === 1 ? "foi pulado" : "foram pulados"}.`] : []),
      ...(semFone ? [`${semFone} ${semFone === 1 ? "telefone estava incompleto e ficou" : "telefones estavam incompletos e ficaram"} em branco. Confira depois.`] : []),
    ];
  }

  async function importarProdutos(linhas: Record<string, string>[]) {
    const existentes = await sb.from("produtos").select("nome").eq("petshop_id", petshop.id).limit(10000);
    if (existentes.error) throw new Error(existentes.error.message);
    const tem = new Set((existentes.data ?? []).map((p) => semAcento(p.nome)));
    const { data: u } = await sb.auth.getUser();
    let novos = 0, pulados = 0;
    for (const l of linhas) {
      const nome = l.nome.trim().slice(0, 120);
      if (tem.has(semAcento(nome))) { pulados++; continue; }
      const preco = numero(l.preco), custo = numero(l.custo), qtd = numero(l.estoque), minimo = numero(l.minimo);
      const r = await sb.from("produtos").insert({
        petshop_id: petshop.id, nome, categoria: l.categoria?.trim() || null, unidade: l.unidade?.trim().slice(0, 12) || "un",
        preco_venda: preco != null ? Math.round(preco * 100) / 100 : null, custo: custo != null ? Math.round(custo * 100) / 100 : null,
        estoque_minimo: minimo ?? 0,
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      tem.add(semAcento(nome));
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
      ...(pulados ? [`${pulados} já ${pulados === 1 ? "existia" : "existiam"} com o mesmo nome e ${pulados === 1 ? "foi pulado" : "foram pulados"}.`] : []),
    ];
  }

  async function importar() {
    if (!lido || lido.faltou || !lido.linhas.length || indo || somenteLeitura()) return;
    if (lido.linhas.length > MAXIMO) { setErro(`São ${lido.linhas.length} linhas. Traga até ${MAXIMO} por vez.`); return; }
    setIndo(true); setErro(null);
    try {
      const r = tipo === "clientes" ? await importarClientes(lido.linhas) : await importarProdutos(lido.linhas);
      setResultado(r);
      avisar("Planilha trazida para o sistema.");
      avisarMudanca();
      aoTerminar?.();
    } catch (e) {
      setErro(`Parou no meio: ${mensagemDeErro(e)} O que entrou antes do erro ficou salvo; pode trazer a planilha de novo, que os repetidos são pulados.`);
      aoTerminar?.();
    } finally { setIndo(false); }
  }

  const oQue = tipo === "clientes" ? "clientes e pets" : "produtos";
  return (
    <Folha titulo={`Trazer ${oQue} de uma planilha`} aoFechar={aoFechar} larga>
      {resultado ? (
        <div className="g-pilha">
          <div className="g-aviso verde" role="status">{resultado.map((r) => <p key={r}>{r}</p>)}</div>
          <button className="g-btn verde" onClick={aoFechar}>Pronto</button>
        </div>
      ) : (
        <div className="g-pilha">
          <p className="g-muted g-p">
            Serve para quem vem de outro sistema ou de uma planilha. Nada do que já está aqui é apagado ou alterado: {tipo === "clientes" ? "tutor ou pet que já existe é pulado" : "produto com o mesmo nome é pulado"}.
          </p>
          <div className="g-card liso g-pilha p">
            <b className="g-p">1. A planilha precisa de uma linha de títulos</b>
            <p className="g-muted g-pp">
              Colunas aceitas: {cols.map((c) => c.rotulo).join(", ")}. Só <b>{cols.find((c) => c.obrigatoria)!.rotulo}</b> é obrigatória.
              {tipo === "clientes" && " Um tutor com dois pets ocupa duas linhas, repetindo o nome e o telefone."}
            </p>
            <div><button className="g-btn sec p" onClick={() => baixarModelo(tipo)}><Download />Baixar planilha modelo</button></div>
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
              <b className="g-p"><FileSpreadsheet style={{ width: 18, height: 18, verticalAlign: "-3px", marginRight: 6 }} />3. Confira antes de trazer</b>
              {lido.faltou ? (
                <p className="g-aviso vermelho" role="alert">Não achei a coluna “{lido.faltou.rotulo}”. Confira se a primeira linha tem os títulos.</p>
              ) : (
                <>
                  <p className="g-p"><b>{lido.linhas.length}</b> {lido.linhas.length === 1 ? "linha" : "linhas"} para trazer{lido.total > lido.linhas.length ? ` (${lido.total - lido.linhas.length} sem ${cols.find((c) => c.obrigatoria)!.rotulo.toLowerCase()} ficam de fora)` : ""}. Colunas lidas: {lido.achadas.map((c) => c.rotulo).join(", ")}.</p>
                  {lido.ignoradas.length > 0 && <p className="g-muted g-pp">Colunas que não vou usar: {lido.ignoradas.slice(0, 8).join(", ")}.</p>}
                  <div style={{ overflowX: "auto" }}>
                    <table className="g-tabela" style={{ fontSize: ".8125rem", minWidth: 420 }}>
                      <thead><tr>{lido.achadas.map((c) => <th key={c.id} style={{ textAlign: "left", padding: "4px 10px 4px 0" }}>{c.rotulo}</th>)}</tr></thead>
                      <tbody>
                        {lido.linhas.slice(0, 5).map((l, i) => <tr key={i}>{lido.achadas.map((c) => <td key={c.id} style={{ padding: "4px 10px 4px 0", borderTop: "1px solid var(--g-linha)" }}>{l[c.id]}</td>)}</tr>)}
                      </tbody>
                    </table>
                  </div>
                  {lido.linhas.length > 5 && <p className="g-muted g-pp">Mostrando as 5 primeiras.</p>}
                </>
              )}
            </div>
          )}
          <div className="g-fila">
            <button className="g-btn pri" disabled={!lido || Boolean(lido.faltou) || !lido.linhas.length || indo} onClick={() => void importar()}>
              {indo ? "Trazendo… não feche" : lido?.linhas.length ? `Trazer ${lido.linhas.length} ${lido.linhas.length === 1 ? "linha" : "linhas"}` : "Trazer"}
            </button>
            <button className="g-btn sec" disabled={indo} onClick={aoFechar}>Cancelar</button>
          </div>
        </div>
      )}
    </Folha>
  );
}
