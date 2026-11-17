"use client";

import { useState } from "react";
import { Plus, Trash2, Truck } from "lucide-react";
import { CHAVE_TAXA, taxaDoLevaTraz, taxaParaGravar, type Bairro, type TaxaLevaTraz } from "@/lib/gestao/quadro";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { CampoValor, avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";

type Linha = { chave: number; nome: string; valor: number | null };
let proxima = 1;

/**
 * Taxa de leva e traz (Meu pet shop, Agenda e link do cliente): um valor fixo ou um valor por bairro. Só aparece como
 * sugestão em Fechar a conta dos horários com leva e traz: nada muda sozinho no preço de horário nenhum. Só o dono grava.
 */
export default function OpcoesDoLevaTraz() {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const salvo = taxaDoLevaTraz(petshop);
  const [modo, setModo] = useState<TaxaLevaTraz["modo"]>(salvo.modo);
  const [valor, setValor] = useState<number | null>(salvo.valor);
  const [linhas, setLinhas] = useState<Linha[]>(() => (salvo.bairros.length ? salvo.bairros : [{ nome: "", valor: 0 }]).map((b) => ({ chave: proxima++, nome: b.nome, valor: b.nome ? b.valor : null })));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (salvando || somenteLeitura()) return;
    const faltaValor = modo === "bairro" && linhas.some((l) => l.nome.trim() && l.valor == null);
    if (faltaValor) { setErro("Escreva o valor de cada bairro (ou tire a linha)."); return; }
    const r = taxaParaGravar({ modo, valor, bairros: linhas.filter((l) => l.nome.trim()).map((l) => ({ nome: l.nome, valor: l.valor ?? 0 })) as Bairro[] });
    if ("erro" in r) { setErro(r.erro); return; }
    setErro(null);
    setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, { [CHAVE_TAXA]: r.ok });
      await recarregarBase();
      avisarMudanca();
      avisar("Taxa de leva e traz salva.");
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha" id="opcoes-leva-traz">
      <div className="g-mp-t"><Tile icone={Truck} tom="ceu" /><div><h2>Taxa de leva e traz</h2></div></div>
      <p className="g-muted g-p">Quando o horário tem leva e traz, Fechar a conta sugere esta taxa. Ela só entra na conta se a pessoa tocar em Pôr na conta: nenhum preço muda sozinho.</p>
      <div className="g-seg" role="group" aria-label="Como cobrar">
        <button type="button" aria-pressed={modo === "fixo"} disabled={!souDono} onClick={() => setModo("fixo")}>Valor fixo</button>
        <button type="button" aria-pressed={modo === "bairro"} disabled={!souDono} onClick={() => setModo("bairro")}>Por bairro</button>
      </div>
      {modo === "fixo" ? (
        <label className="g-campo">
          <span>Valor da taxa (ida e volta)</span>
          <CampoValor valor={valor} aoMudar={setValor} rotulo="Valor da taxa de leva e traz" />
          <small className="g-muted">Deixe em branco para não sugerir nada.</small>
        </label>
      ) : (
        <div className="g-campo">
          <span>Valor por bairro (ida e volta)</span>
          <div className="g-pilha p" role="list" aria-label="Bairros">
            {linhas.map((l, i) => (
              <div key={l.chave} role="listitem" className="g-fila" style={{ flexWrap: "nowrap", gap: 8, alignItems: "center" }}>
                <input className="g-input g-cresce" style={{ minWidth: 0 }} placeholder="Bairro" aria-label={`Bairro ${i + 1}`} maxLength={60} value={l.nome} disabled={!souDono}
                  onChange={(e) => setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, nome: e.target.value } : x)))} />
                <div style={{ width: 110, flex: "none" }}>
                  <CampoValor valor={l.valor} aoMudar={(v) => setLinhas((ls) => ls.map((x) => (x.chave === l.chave ? { ...x, valor: v } : x)))} rotulo={`Valor de ${l.nome || `bairro ${i + 1}`}`} />
                </div>
                <button type="button" className="g-ico" aria-label={`Tirar ${l.nome || "esta linha"}`} disabled={!souDono} onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.chave !== l.chave) : [{ chave: proxima++, nome: "", valor: null }]))}><Trash2 /></button>
              </div>
            ))}
          </div>
          {souDono && linhas.length < 60 && <div><button type="button" className="g-btn fantasma p" onClick={() => setLinhas((ls) => [...ls, { chave: proxima++, nome: "", valor: null }])}><Plus />Mais um bairro</button></div>}
          <small className="g-muted">Escreva o nome do bairro como ele aparece no endereço: a conta acha o bairro no endereço do leva e traz. Se não achar, a pessoa escolhe na hora.</small>
        </div>
      )}
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {souDono ? (
        <div className="g-fila">
          <button type="button" className="g-btn pri p" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar a taxa"}</button>
          {modo === "fixo" && salvo.modo === "fixo" && salvo.valor != null && <span className="g-muted g-pp">Agora: {brl(salvo.valor)}</span>}
        </div>
      ) : <p className="g-muted g-pp">Só o dono muda a taxa.</p>}
    </section>
  );
}
