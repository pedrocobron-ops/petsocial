"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { apagarTaxas, calcularTaxa, carregarTaxas, MAX_DIAS, MAX_FIXO, MAX_PCT, OPCAO_REPASSE_FERIADO, repassePulaFeriado, salvarTaxas, TAXAS_ZERADAS, type TaxasMaquininha } from "@/lib/gestao/maquininha";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { brl, centavos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "../financeiro/recebimentos.css";
import "./taxas-maquininha.css";

/** Texto do campo: "2,49" ↔ 2.49; vazio ↔ null. */
const texto = (n: number | null | undefined) => (n == null || n === 0 ? "" : String(n).replace(".", ","));
const textoReais = (n: number | null | undefined) => (n == null || n === 0 ? "" : n.toFixed(2).replace(".", ","));
const soNumero = (s: string) => s.replace(/[^\d,.]/g, "").slice(0, 6);
const soDias = (s: string) => s.replace(/\D/g, "").slice(0, 3);
function ler(t: string, max: number): number | null | "erro" {
  const v = t.trim().replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? centavos(n) : "erro";
}

type Linha = { pct: string; fixo: string; dias: string };
type Rascunho = { debito: Linha; credito: Linha; parcelado: Linha; pix: Linha; parcelas: Record<string, string> };

function rascunhoDe(t: TaxasMaquininha | null): Rascunho {
  const x = t ?? TAXAS_ZERADAS;
  return {
    debito: { pct: texto(x.debito_pct), fixo: textoReais(x.debito_fixo), dias: String(x.debito_dias) },
    credito: { pct: texto(x.credito_pct), fixo: textoReais(x.credito_fixo), dias: String(x.credito_dias) },
    parcelado: { pct: x.parcelado_pct == null ? "" : String(x.parcelado_pct).replace(".", ","), fixo: "", dias: x.parcelado_dias == null ? "" : String(x.parcelado_dias) },
    pix: { pct: texto(x.pix_pct), fixo: textoReais(x.pix_fixo), dias: String(x.pix_dias) },
    parcelas: Object.fromEntries(Object.entries(x.parcelas_pct).map(([k, v]) => [k, String(v).replace(".", ",")])),
  };
}

const FORMAS = [
  { id: "debito", nome: "Débito", apoio: "" },
  { id: "credito", nome: "Crédito à vista", apoio: "" },
  { id: "parcelado", nome: "Crédito parcelado", apoio: "Em branco, usa a do crédito à vista." },
  { id: "pix", nome: "Pix", apoio: "Na maioria das maquininhas é zero." },
] as const;
const PARCELAS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/**
 * Taxas da maquininha (Meu pet shop, Cobrança): o que a maquininha cobra em cada forma e em quantos dias o dinheiro cai.
 * Serve só para o dono ver quanto recebe de verdade (o preço do cliente não muda). Cada pagamento guarda a taxa do dia.
 */
export default function TaxasDaMaquininha() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [mudandoFeriado, setMudandoFeriado] = useState(false);
  /** O repasse que cai num feriado da lista do pet shop passa para o próximo dia útil (só muda a data mostrada; nenhum valor muda). */
  async function trocarFeriado(v: boolean) {
    if (somenteLeitura() || mudandoFeriado) return;
    setMudandoFeriado(true);
    try {
      await salvarOpcoes(sb, petshop.id, { [OPCAO_REPASSE_FERIADO]: v });
      await recarregarBase();
      avisarMudanca();
      avisar(v ? "Os repasses agora pulam os feriados da sua lista." : "Os repasses não pulam mais os feriados.");
    } catch (e) { avisarErro(e); } finally { setMudandoFeriado(false); }
  }
  const [r, setR] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const { dados, recarregar } = useDados(async () => {
    const t = await carregarTaxas(sb, petshop.id, true);
    setR(rascunhoDe(t));
    return { t };
  }, [petshop.id]);

  const mudar = (forma: keyof Omit<Rascunho, "parcelas">, campo: keyof Linha, v: string) => {
    setErro(null);
    setR((x) => (x ? { ...x, [forma]: { ...x[forma], [campo]: campo === "dias" ? soDias(v) : soNumero(v) } } : x));
  };

  /** O rascunho em taxas (ou o erro em português). */
  function montar(x: Rascunho): TaxasMaquininha | string {
    const pct = (s: string, nome: string) => { const v = ler(s, MAX_PCT); if (v === "erro") throw new Error(`Confira a % do ${nome}: fica entre 0 e ${MAX_PCT}.`); return v; };
    const fixo = (s: string, nome: string) => { const v = ler(s, MAX_FIXO); if (v === "erro") throw new Error(`Confira o valor fixo do ${nome}: até ${brl(MAX_FIXO)}.`); return v ?? 0; };
    const dias = (s: string, nome: string, padrao: number | null) => {
      if (!s.trim()) return padrao;
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0 || n > MAX_DIAS) throw new Error(`Confira os dias do ${nome}: de 0 a ${MAX_DIAS}.`);
      return n;
    };
    try {
      const parcelas: Record<string, number> = {};
      for (const k of PARCELAS) {
        const v = ler(x.parcelas[k] ?? "", MAX_PCT);
        if (v === "erro") throw new Error(`Confira a % de ${k} vezes: fica entre 0 e ${MAX_PCT}.`);
        if (v != null) parcelas[k] = v;
      }
      return {
        debito_pct: pct(x.debito.pct, "débito") ?? 0, debito_fixo: fixo(x.debito.fixo, "débito"), debito_dias: dias(x.debito.dias, "débito", 1)!,
        credito_pct: pct(x.credito.pct, "crédito") ?? 0, credito_fixo: fixo(x.credito.fixo, "crédito"), credito_dias: dias(x.credito.dias, "crédito", 30)!,
        parcelado_pct: pct(x.parcelado.pct, "parcelado"), parcelado_dias: dias(x.parcelado.dias, "parcelado", null),
        parcelas_pct: parcelas,
        pix_pct: pct(x.pix.pct, "Pix") ?? 0, pix_fixo: fixo(x.pix.fixo, "Pix"), pix_dias: dias(x.pix.dias, "Pix", 0)!,
      };
    } catch (e) { return (e as Error).message; }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!r || ocupado || somenteLeitura()) return;
    const t = montar(r);
    if (typeof t === "string") { setErro(t); return; }
    setOcupado(true);
    try {
      await salvarTaxas(sb, petshop.id, t);
      avisarMudanca();
      await recarregar();
      avisar("Taxas salvas. Valem para os pagamentos de agora em diante.");
    } catch (e2) { avisarErro(e2); } finally { setOcupado(false); }
  }

  async function tirar() {
    if (ocupado || somenteLeitura()) return;
    setOcupado(true);
    try {
      await apagarTaxas(sb, petshop.id);
      avisarMudanca();
      await recarregar();
      avisar("Taxas tiradas. Os pagamentos de antes continuam com a taxa daquele dia.");
    } catch (e2) { avisarErro(e2); } finally { setOcupado(false); }
  }

  const previa = r ? montar(r) : null;
  const ex = previa && typeof previa !== "string" ? {
    debito: calcularTaxa(previa, { valor: 100, forma: "debito" }), credito: calcularTaxa(previa, { valor: 100, forma: "credito" }),
    tres: calcularTaxa(previa, { valor: 100, forma: "credito", parcelas: 3 }),
  } : null;

  return (
    <section className="g-card g-pilha" id="taxas-maquininha" aria-label="Taxas da maquininha">
      <div className="g-mp-t">
        <Tile icone={CreditCard} tom="ceu" />
        <div>
          <h2>Taxas da maquininha</h2>
          <p className="g-muted g-p">Quanto a maquininha cobra em cada venda. O preço do cliente não muda: serve para você ver quanto recebe de verdade.</p>
        </div>
      </div>
      {!r || !dados ? <p className="g-muted g-p">Carregando…</p> : (
        <form className="gr-op" onSubmit={salvar}>
          <div className="g-tx-formas">
            {FORMAS.map((f) => (
              <fieldset key={f.id} className="g-tx-forma">
                <legend>{f.nome}</legend>
                <div className="g-tx-campos">
                  <label><span>% da venda</span>
                    <input className="g-input g-tab" inputMode="decimal" placeholder={f.id === "parcelado" ? "igual" : "0"} value={r[f.id].pct} aria-label={`${f.nome}: porcentagem da venda`} onChange={(e) => mudar(f.id, "pct", e.target.value)} />
                  </label>
                  {f.id !== "parcelado" ? (
                    <label><span>R$ fixo</span>
                      <input className="g-input g-tab" inputMode="decimal" placeholder="0,00" value={r[f.id].fixo} aria-label={`${f.nome}: valor fixo por venda em reais`} onChange={(e) => mudar(f.id, "fixo", e.target.value)} />
                    </label>
                  ) : <span className="g-tx-vazio" aria-hidden />}
                  <label><span>Dias para cair</span>
                    <input className="g-input g-tab" inputMode="numeric" placeholder={f.id === "parcelado" ? "igual" : "0"} value={r[f.id].dias} aria-label={`${f.nome}: dias para o dinheiro cair`} onChange={(e) => mudar(f.id, "dias", e.target.value)} />
                  </label>
                </div>
                {f.apoio && <small className="g-muted">{f.apoio}{f.id === "parcelado" ? " O valor fixo é o do crédito à vista." : ""}</small>}
              </fieldset>
            ))}
          </div>

          <details className="g-tx-parcelas" open={Object.keys(r.parcelas).some((k) => r.parcelas[k])}>
            <summary>Uma taxa para cada número de parcelas (se a sua maquininha cobra assim)</summary>
            <div className="g-tx-grade">
              {PARCELAS.map((k) => (
                <label key={k}><span>{k}x</span>
                  <input className="g-input g-tab" inputMode="decimal" placeholder="—" value={r.parcelas[k] ?? ""} aria-label={`Porcentagem em ${k} vezes`}
                    onChange={(e) => { setErro(null); setR({ ...r, parcelas: { ...r.parcelas, [k]: soNumero(e.target.value) } }); }} />
                </label>
              ))}
            </div>
            <small className="g-muted">Em branco, vale a % do crédito parcelado.</small>
          </details>

          {ex && (
            <p className="g-tx-exemplo g-tab" role="status">
              Numa venda de {brl(100)}: no débito você recebe <b>{brl(ex.debito.recebe)}</b>; no crédito à vista, <b>{brl(ex.credito.recebe)}</b>; no crédito em 3 vezes, <b>{brl(ex.tres.recebe)}</b>.
            </p>
          )}
          <p className="g-muted g-pp">
            As taxas valem para os pagamentos de agora em diante. Cada pagamento guarda a taxa do dia: se você mudar aqui depois, o que já foi pago não muda.
            Se você já lança a taxa da maquininha como saída no Financeiro, não precisa mais: ela aparece sozinha em Relatórios.
          </p>
          <label className="g-check" data-teste="repasse-feriado">
            <input type="checkbox" checked={repassePulaFeriado(petshop)} disabled={mudandoFeriado} onChange={(e) => void trocarFeriado(e.target.checked)} />
            <span>A maquininha não paga em feriado <span className="g-muted">(o repasse que cai num feriado marcado em Feriados e dias fechados passa para o próximo dia útil; sábado e domingo já passam para a segunda)</span></span>
          </label>
          {erro && <p className="g-erro" role="alert">{erro}</p>}
          <div className="g-fila">
            <button className="g-btn verde" disabled={ocupado}>{ocupado ? "Salvando…" : "Salvar taxas"}</button>
            {dados.t && <button type="button" className="g-btn fantasma" disabled={ocupado} onClick={() => void tirar()}>Tirar as taxas</button>}
          </div>
        </form>
      )}
    </section>
  );
}
