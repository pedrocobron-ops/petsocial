"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Coins, Download, PiggyBank, Receipt, Scale, TrendingUp } from "lucide-react";
import { montarLucro, OPCAO_COMISSAO_CUSTO, porLucro, type LinhaLucro, type LucroDoBanco } from "@/lib/gestao/lucro";
import { nomeDaCategoria } from "@/lib/gestao/modulos";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { brl, dataCompleta, deIsoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { baixarPlanilha, Chips, dinheiroCsv, numeroCsv, type Cel } from "../financeiro/comum";
import { Kpi, Tile } from "../painel";
import { avisarMudanca, Esqueleto, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "./lucro.css";

const pct = (n: number | null) => (n == null ? "–" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const VISTAS = [{ id: "servicos", rotulo: "Serviços" }, { id: "produtos", rotulo: "Produtos" }] as const;
type Vista = (typeof VISTAS)[number]["id"];

/** O período é um mês inteiro (do dia 1 ao último dia)? Aí o resultado é o mesmo "Resultado do mês" do Financeiro. */
function mesInteiro(de: string, ate: string) {
  const d = deIsoDia(de), a = deIsoDia(ate);
  return d.getDate() === 1 && d.getMonth() === a.getMonth() && d.getFullYear() === a.getFullYear() && new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate() === a.getDate();
}

/**
 * Bloco "Quanto sobrou" dos Relatórios: por serviço e por produto, quantas vezes, o que entrou (com o desconto), o custo
 * e o que sobrou. Uma ida ao banco (`lucro_do_periodo`). Embaixo, como o total fecha com o Resultado do Financeiro.
 */
export default function QuantoSobrou({ de, ate }: { de: string; ate: string }) {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [vista, setVista] = useState<Vista>("servicos");
  const [salvando, setSalvando] = useState(false);
  const { dados, erro, recarregar } = useDados(async () => {
    const r = await sb.rpc("lucro_do_periodo", { p_petshop: petshop.id, p_de: de, p_ate: ate });
    if (r.error) throw new Error(r.error.message);
    return r.data as unknown as LucroDoBanco;
  }, [petshop.id, de, ate]);
  const x = useMemo(() => (dados ? montarLucro(dados) : null), [dados]);
  const categoria = (c: string) => nomeDaCategoria(c, petshop);

  async function trocarComissao(v: boolean) {
    if (somenteLeitura() || salvando) return;
    setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, { [OPCAO_COMISSAO_CUSTO]: v });
      await recarregarBase();
      avisarMudanca();
      await recarregar();
      avisar(v ? "A comissão agora conta como custo." : "A comissão não conta mais como custo.");
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  function exportar() {
    if (!x) return;
    const linha = (l: LinhaLucro): Cel[] => [
      l.tipo === "servico" ? "Serviço" : l.tipo === "produto" ? "Produto" : "Extra", l.nome, l.quantidade ? numeroCsv(l.quantidade) : "", l.receita ? dinheiroCsv(l.receita) : dinheiroCsv(0),
      l.material == null ? "não informado" : dinheiroCsv(l.material), dinheiroCsv(l.comissao), l.custo == null ? "custo não informado" : dinheiroCsv(l.custo),
      l.margem == null ? "" : dinheiroCsv(l.margem), l.pct == null ? "" : numeroCsv(Math.round(l.pct * 10) / 10),
      [l.devolvido > 0 ? `devolvido ${brl(l.devolvido)} (${fmtQtd(l.devolvidos)} ${l.unidade})` : "", l.falta ?? ""].filter(Boolean).join("; "),
    ];
    const p = x.ponte;
    const t: Cel[][] = [
      ["Quanto sobrou", petshop.nome],
      ["Período", `${dataCompleta(deIsoDia(de))} a ${dataCompleta(deIsoDia(ate))}`],
      ["Como é a conta", `Receita: o que entrou no período, com o desconto, repartido como na comissão. Custo: produto pelo custo guardado na venda (sem ele, o custo de hoje do cadastro); serviço pelo custo do material × vezes${x.comissaoComoCusto ? "; a comissão da linha entra no custo" : ""}. Sem custo informado, a linha fica sem margem.`],
      [],
      ["Tipo", "Nome", "Quantidade", "Receita", "Material ou custo dos produtos", "Comissão", "Custo", "Sobrou", "Sobrou %", "Observação"],
      ...x.servicos.map(linha), ...x.produtos.map(linha), ...(x.extras ? [linha(x.extras)] : []),
      ["Total das linhas", "", "", dinheiroCsv(x.totais.receita), "", dinheiroCsv(x.totais.comissao), dinheiroCsv(x.totais.custo), dinheiroCsv(x.totais.margem), x.totais.pct == null ? "" : numeroCsv(Math.round(x.totais.pct * 10) / 10), x.totais.linhasSemCusto ? `${x.totais.linhasSemCusto} linhas sem custo informado (${brl(x.totais.receitaSemCusto)} de receita fora da margem)` : ""],
      [],
      ["Como fecha com o Financeiro"],
      ["Serviços, produtos e extras", dinheiroCsv(p.linhas)],
      ...p.outros.map((o): Cel[] => [`Outros lançamentos: ${categoria(o.categoria)}`, dinheiroCsv(o.valor)]),
      ["Entrou (entradas recebidas)", dinheiroCsv(p.entradas)],
      ["Devolvido ao tutor", dinheiroCsv(-p.devolvido)],
      ["Ficou de crédito para o tutor", dinheiroCsv(-p.creditoDeixado)],
      ["Crédito usado no check-out", dinheiroCsv(p.creditoUsadoFora)],
      ["Faturamento", dinheiroCsv(p.faturamento)],
      ...p.saidas.map((s): Cel[] => [`Saída: ${categoria(s.categoria)}`, dinheiroCsv(-s.valor)]),
      ["Resultado do período (entrou − saiu)", dinheiroCsv(p.resultado)],
    ];
    baixarPlanilha(t, `quanto-sobrou-${de}-a-${ate}.csv`);
    avisar("Planilha baixada.");
  }

  const linhas = x ? porLucro(vista === "servicos" ? [...x.servicos, ...(x.extras ? [x.extras] : [])] : x.produtos) : [];
  const temProdutos = Boolean(x?.produtos.length);
  const semMaterial = x?.servicos.filter((s) => s.material == null && s.id) ?? [];
  const inteiro = mesInteiro(de, ate);

  return (
    <section className="g-card g-pilha" id="quanto-sobrou" aria-label="Quanto sobrou">
      <div className="g-card-t">
        <h3><Tile icone={PiggyBank} tom="menta" tamanho="p" />Quanto sobrou</h3>
        <button type="button" className="g-btn sec p" onClick={exportar} disabled={!x}><Download /> Exportar</button>
      </div>
      {erro ? <p className="g-erro" role="alert">{erro}</p> : !x ? <Esqueleto linhas={3} /> : (
        <>
          <div className="g-grade kpis">
            <Kpi icone={Receipt} tom="ceu" rotulo="Entrou de serviços e produtos" valor={brl(x.totais.receita)} apoio="com o desconto, já recebido" />
            <Kpi icone={Coins} tom="rosa" rotulo="Custo informado" valor={brl(x.totais.custo)}
              apoio={x.totais.linhasSemCusto ? `${x.totais.linhasSemCusto === 1 ? "1 linha" : `${x.totais.linhasSemCusto} linhas`} sem custo` : "de todas as linhas"} />
            <Kpi icone={TrendingUp} tom={x.totais.margem < 0 ? "manteiga" : "menta"} rotulo="Sobrou" valor={x.totais.receitaComCusto > 0 ? brl(x.totais.margem) : "–"}
              apoio={x.totais.pct != null ? `${pct(x.totais.pct)} do que tem custo` : "falta informar os custos"} />
            <Kpi icone={Scale} tom={x.ponte.resultado < 0 ? "rosa" : "lilas"} rotulo={inteiro ? "Resultado do mês" : "Resultado do período"} valor={brl(x.ponte.resultado)} apoio="entrou − saiu, como no Financeiro" />
          </div>

          <div className="g-lu-op">
            {souDono ? (
              <label className="g-check">
                <input type="checkbox" checked={x.comissaoComoCusto} disabled={salvando} onChange={(e) => void trocarComissao(e.target.checked)} />
                <span>Contar a comissão como custo <span className="g-muted">(o que cada serviço e produto rendeu de comissão sai do que sobrou)</span></span>
              </label>
            ) : <p className="g-muted g-pp">{x.comissaoComoCusto ? "A comissão conta como custo (o dono escolhe)." : "A comissão não conta como custo (o dono escolhe)."}</p>}
          </div>

          {temProdutos && <Chips opcoes={VISTAS} valor={vista} aoMudar={setVista} rotulo="Mostrar" />}
          {linhas.length ? (
            <div className="g-lu-tab" role="table" aria-label={vista === "servicos" ? "Quanto sobrou por serviço" : "Quanto sobrou por produto"}>
              <div className="g-lu-l cab" role="row">
                <span>{vista === "servicos" ? "Serviço" : "Produto"}</span><span>{vista === "servicos" ? "Vezes" : "Vendidos"}</span><span>Entrou</span><span>Custo</span><span>Sobrou</span><span>%</span>
              </div>
              {linhas.map((l) => <Linha key={l.chave} l={l} comComissao={x.comissaoComoCusto} />)}
            </div>
          ) : <p className="g-muted g-p">{vista === "servicos" ? "Nenhum serviço recebido neste período." : "Nenhum produto vendido neste período."}</p>}
          {vista === "servicos" && semMaterial.length > 0 && (
            <p className="g-muted g-pp">
              {semMaterial.length === 1 ? `${semMaterial[0].nome} está` : `${semMaterial.length} serviços estão`} sem custo do material: aparece “custo não informado” em vez de uma margem de 100%.
              {souDono ? <> Coloque quanto gasta de shampoo, condicionador e outros por atendimento em <Link className="g-link" href="/gestao/app/meu-petshop#servicos">Meu pet shop, Serviços e preços</Link>.</> : " O dono coloca em Meu pet shop."}
            </p>
          )}

          <Ponte x={x} categoria={categoria} inteiro={inteiro} />

          <p className="g-muted g-pp">
            Entrou: o dinheiro recebido no período, já com o desconto, repartido entre os serviços de cada conta como na comissão (conta paga em partes conta cada parte no dia em que entrou; as vezes contam uma vez, quando a conta fecha).
            {" "}Custo: produto pelo custo guardado na venda (sem ele, pelo custo de hoje do cadastro); serviço pelo custo do material × vezes{x.comissaoComoCusto ? "; a comissão do período entra no custo de cada linha" : "; a comissão aparece em cada linha, mas não entra no custo"}.
            {" "}Compra de mercadoria e comissão paga já estão nas saídas do Financeiro: o que sobrou aqui é por serviço e por produto, o resultado é o do caixa. Não some os dois.
          </p>
        </>
      )}
    </section>
  );
}

function Linha({ l, comComissao }: { l: LinhaLucro; comComissao: boolean }) {
  const detalhe = l.tipo === "servico"
    ? [l.material != null ? `material ${brl(l.material)}` : null, l.comissao ? `comissão ${brl(l.comissao)}${comComissao ? "" : " (fora do custo)"}` : null]
    : l.tipo === "produto"
      ? [l.material != null ? `produtos ${brl(l.material)}${l.custoDeHoje > 0 ? " (com custo de hoje)" : ""}` : null, l.comissao ? `comissão ${brl(l.comissao)}${comComissao ? "" : " (fora do custo)"}` : null]
      : [l.comissao ? `comissão ${brl(l.comissao)}` : null];
  // troca e devolução no período: o que voltou e quanto voltou para o cliente (a margem já desconta)
  const voltou = l.devolvidos > 0 || l.devolvido > 0 ? `${l.devolvidos ? `${fmtQtd(l.devolvidos)} ${l.unidade} ${l.devolvidos === 1 ? "voltou" : "voltaram"}` : "devolução"} (− ${brl(l.devolvido)})` : null;
  const sub = [...detalhe, voltou, l.falta].filter(Boolean).join(" · ");
  const ruim = l.margem != null && l.margem < 0;
  return (
    <div className="g-lu-l" role="row">
      <span className="n"><b>{l.nome}</b>{sub && <small>{sub}</small>}</span>
      <span><i>{l.tipo === "produto" ? "Vendidos " : "Vezes "}</i><em>{l.tipo === "extra" ? "–" : `${fmtQtd(l.quantidade)}${l.tipo === "produto" ? ` ${l.unidade}` : ""}`}</em></span>
      <span><i>Entrou </i><em>{brl(l.receita)}</em></span>
      <span>{l.custo == null ? <em className="sem">custo não informado</em> : <><i>Custo </i><em>{brl(l.custo)}</em></>}</span>
      <span><i>Sobrou </i><em className={ruim ? "ruim" : undefined}>{l.margem == null ? "–" : brl(l.margem)}</em></span>
      <span><i>Margem </i><em className={ruim ? "ruim" : undefined}>{pct(l.pct)}</em></span>
    </div>
  );
}

/** Como o total das linhas chega no Resultado do Financeiro (cada número é o mesmo da tela Financeiro). */
function Ponte({ x, categoria, inteiro }: { x: ReturnType<typeof montarLucro>; categoria: (c: string) => string; inteiro: boolean }) {
  const p = x.ponte;
  return (
    <div className="g-lu-ponte" role="group" aria-label="Como fecha com o Financeiro">
      <p className="g-rotulo" style={{ marginBottom: 4 }}>Como fecha com o Financeiro</p>
      <div><span>Serviços, produtos e extras</span><b>{brl(p.linhas)}</b></div>
      {p.outros.length > 0 && <div><span>Outros lançamentos (sem serviço ou produto)</span><b>+ {brl(p.somaOutros)}</b></div>}
      {p.outros.map((o) => <div key={o.categoria} className="sub"><span>{categoria(o.categoria)}{o.lancamentos > 1 ? ` · ${o.lancamentos} lançamentos` : ""}</span><b>{brl(o.valor)}</b></div>)}
      <div className="igual"><span>Entrou</span><b>{brl(p.entradas)}</b></div>
      {p.devolvido > 0 && <div><span>Devolvido ao tutor</span><b>− {brl(p.devolvido)}</b></div>}
      {p.creditoDeixado > 0 && <div><span>Ficou de crédito para o tutor</span><b>− {brl(p.creditoDeixado)}</b></div>}
      {p.creditoUsadoFora > 0 && <div><span>Crédito usado no check-out</span><b>+ {brl(p.creditoUsadoFora)}</b></div>}
      {(p.devolvido > 0 || p.creditoDeixado > 0 || p.creditoUsadoFora > 0) && <div className="igual"><span>Faturamento</span><b>{brl(p.faturamento)}</b></div>}
      <div><span>Saídas (despesas gerais, compras, comissão paga…)</span><b>− {brl(p.saiu)}</b></div>
      {p.saidas.map((s) => <div key={s.categoria} className="sub"><span>{categoria(s.categoria)}</span><b>{brl(s.valor)}</b></div>)}
      <div className="igual fim"><span>{inteiro ? "Resultado do mês (o mesmo do Financeiro)" : "Resultado do período"}</span><b className={p.resultado < 0 ? "g-vermelho-t" : undefined}>{brl(p.resultado)}</b></div>
    </div>
  );
}
