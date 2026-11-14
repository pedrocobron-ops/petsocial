"use client";

import { Package } from "lucide-react";
import { opcoesDaLoja, pct } from "@/lib/gestao/loja-opcoes";
import { vendasPorProduto, type SaidaLida, type VendaLida } from "@/lib/gestao/loja-vendas";
import { usaModulo } from "@/lib/gestao/modulos";
import type { Lancamento } from "@/lib/gestao/tipos";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useDados } from "../ui";
import { paginar } from "./comum";

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Resumo do Financeiro, só para quem ligou "Margem e custo médio" nas opções da loja: o custo dos produtos vendidos no mês
 * e o resultado depois dele. O custo é o que o estoque guardou na saída de cada venda (`custos_das_vendas`); venda sem custo
 * registrado fica de fora do custo e é contada à parte: nada é estimado. Sem venda de produto no mês, o cartão não aparece.
 * As contas são as do relatório de vendas por produto (`vendasPorProduto`), para os dois darem o mesmo número.
 */
export default function CustoDasVendas(p: { inicio: string; fim: string; doMes: Lancamento[]; resultado: number; mesAtual: boolean; entrouDeProdutos?: number }) {
  const { petshop } = useGestao();
  if (!usaModulo(petshop, "loja") || !opcoesDaLoja(petshop).margem) return null;
  return <Cartao {...p} />;
}

function Cartao({ inicio, fim, doMes, resultado, mesAtual, entrouDeProdutos }: { inicio: string; fim: string; doMes: Lancamento[]; resultado: number; mesAtual: boolean; entrouDeProdutos?: number }) {
  const { sb, petshop } = useGestao();
  // conta recebida em partes: depois de quitada, `valor` guarda só a última parte e `valor_original` o valor cheio
  const vendas: VendaLida[] = doMes.filter((l) => l.tipo === "entrada" && l.itens != null).map((l) => ({ id: l.id, itens: l.itens, valor: Number(l.valor_original ?? l.valor) }));
  const chave = vendas.map((v) => v.id).join(",");
  const { dados: saidas } = useDados(async () => {
    if (!chave) return [] as SaidaLida[];
    return paginar<SaidaLida & { id: string }>((a, b) => sb.rpc("custos_das_vendas", { p: petshop.id, p_de: inicio, p_ate: fim }).order("id").range(a, b));
  }, [petshop.id, inicio, fim, chave]);
  if (!saidas) return null;
  const { total } = vendasPorProduto(vendas, saidas, new Map());
  if (!total.vendas) return null;
  const temCusto = total.unidadesComCusto > 0;
  const sobra = centavos(total.receitaComCusto - total.custo);
  const depois = centavos(resultado - total.custo);
  // "De onde veio" soma o dinheiro que ENTROU no mês na categoria Venda de produtos; este cartão soma as vendas com conta
  // fechada (é delas que o estoque guardou o custo). A diferença é o que entrou em parte de venda ainda em aberto, ou venda
  // lançada sem os produtos: aparece numa linha própria, para os dois números fecharem na mesma tela.
  const foraDaqui = entrouDeProdutos == null ? 0 : centavos(entrouDeProdutos - total.receita);
  const linha = (rotulo: string, valor: string, classe = "") => <div className="g-fila entre"><span className="g-muted">{rotulo}</span><b className={`g-tab ${classe}`}>{valor}</b></div>;

  return (
    <section className="g-card" aria-label="Custo dos produtos vendidos no mês">
      <div className="g-card-t"><h3><Tile icone={Package} tom="rosa" tamanho="p" />Produtos vendidos no mês</h3><span className="g-muted g-pp">quanto custou o que saiu</span></div>
      <div className="g-pilha p">
        {linha(Math.abs(foraDaqui) > 0.005 ? "Vendas de produtos com a conta fechada" : "Venda de produtos", brl(total.receita))}
        {linha("Custo dos produtos vendidos", temCusto ? `− ${brl(total.custo)}` : "sem custo registrado")}
        {temCusto && linha("Sobra dos produtos", `${brl(sobra)}${total.receitaComCusto > 0 ? ` · ${pct((sobra / total.receitaComCusto) * 100)}` : ""}`, sobra < 0 ? "g-vermelho-t" : "")}
      </div>
      {temCusto && (
        <div className="g-fin-nota g-pilha p">
          {linha(mesAtual ? "Resultado do mês até agora" : "Resultado do mês", brl(resultado), resultado < 0 ? "g-vermelho-t" : "")}
          {linha("Depois do custo dos produtos", brl(depois), depois < 0 ? "g-vermelho-t" : "")}
        </div>
      )}
      <p className="g-muted g-pp" style={{ marginTop: 10 }}>
        {temCusto && <>O resultado do mês é o que entrou menos o que saiu. O de baixo tira também o custo do que foi vendido. Se você já lança a compra de mercadoria como saída, esse custo está contado ali: fique com o resultado do mês. </>}
        {total.semCusto > 0 && <>{total.semCusto === 1 ? "1 venda de produto ficou" : `${total.semCusto} vendas de produto ficaram`} sem custo registrado e não {total.semCusto === 1 ? "entrou" : "entraram"} no custo nem na sobra. </>}
        {Math.abs(foraDaqui) > 0.005 && <>Em De onde veio, Venda de produtos mostra {brl(entrouDeProdutos ?? 0)}: {foraDaqui > 0
          ? <>os {brl(foraDaqui)} a mais são dinheiro que entrou neste mês de venda que o cliente ainda não terminou de pagar, ou de venda lançada sem dizer os produtos. Essa parte só entra aqui, com o custo, quando a conta é quitada. </>
          : <>os {brl(-foraDaqui)} a menos são de venda fechada neste mês cujo dinheiro entrou, em parte, em outro mês. </>}</>}
        O detalhe por produto está em Relatórios.
      </p>
    </section>
  );
}
