"use client";

import Link from "@/components/gestao/link-depois";
import { CreditCard } from "lucide-react";
import { feriadosDoRepasse, NOME_FORMA_TAXA, repassePulaFeriado, taxasDoPeriodo } from "@/lib/gestao/maquininha";
import { brl, dataAmigavel, centavos as real } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useDados } from "../ui";
import "../ajustes/taxas-maquininha.css";


/**
 * Taxas da maquininha no período (Financeiro e Relatórios): quanto a maquininha ficou, o faturamento depois das taxas e o
 * que ela ainda vai pagar, por dia. A taxa de cada pagamento é a do dia em que foi pago (guardada no banco).
 * Só para quem cuida do financeiro; loja sem taxas cadastradas vê só o convite (o dono).
 */
export default function CartaoMaquininha({ de, ate, faturamento, rotuloPeriodo = "no período" }: { de: string; ate: string; faturamento: number; rotuloPeriodo?: string }) {
  const { sb, petshop, cuidoDoFinanceiro, souDono } = useGestao();
  const pulaFeriado = repassePulaFeriado(petshop);
  const { dados } = useDados(async () => (cuidoDoFinanceiro ? taxasDoPeriodo(sb, petshop.id, de, ate, await feriadosDoRepasse(sb, petshop)) : null), [petshop.id, de, ate, cuidoDoFinanceiro, pulaFeriado]);
  if (!cuidoDoFinanceiro || !dados) return null;
  if (!dados.configurada && dados.taxa === 0) {
    return souDono ? (
      <p className="g-muted g-pp g-tx-convite">
        <CreditCard size={14} aria-hidden /> Quer ver quanto a maquininha fica de cada venda? Coloque as taxas em{" "}
        <Link className="g-link" href="/gestao/app/meu-petshop#taxas-maquininha">Meu pet shop, Taxas da maquininha</Link>.
      </p>
    ) : null;
  }
  const liquido = real(faturamento - dados.taxa);
  const proximos = dados.a_receber.slice(0, 6);
  const aReceber = real(dados.a_receber.reduce((t, x) => t + x.valor, 0));
  return (
    <section className="g-card g-pilha" aria-label="Taxas da maquininha">
      <div className="g-card-t">
        <h3><Tile icone={CreditCard} tom="ceu" tamanho="p" />Taxas da maquininha</h3>
        <span className="g-muted g-pp">cartão e Pix</span>
      </div>
      <div className="g-tx-nums">
        <div><small>Taxas da maquininha {rotuloPeriodo}</small><b className="g-tab">{dados.taxa > 0 ? `− ${brl(dados.taxa)}` : brl(0)}</b>
          <small>{dados.lancamentos === 1 ? "de 1 pagamento" : `de ${dados.lancamentos} pagamentos`}</small></div>
        <div><small>Faturamento líquido (depois das taxas)</small><b className="g-tab">{brl(liquido)}</b><small>{brl(faturamento)} − {brl(dados.taxa)}</small></div>
      </div>
      {dados.por_forma.some((f) => f.taxa > 0) && (
        <div className="g-legenda">
          {dados.por_forma.filter((f) => f.valor > 0).map((f) => (
            <div key={f.forma}><span>{NOME_FORMA_TAXA[f.forma] ?? f.forma} <span className="g-muted g-pp">{brl(f.valor)}</span></span><b>{f.taxa > 0 ? `− ${brl(f.taxa)}` : "sem taxa"}</b></div>
          ))}
        </div>
      )}
      {proximos.length > 0 && (
        <div>
          <p className="g-rotulo" style={{ margin: "4px 0 6px" }}>A receber da maquininha: {brl(aReceber)}</p>
          <div className="g-legenda">
            {proximos.map((x) => <div key={x.dia}><span>{dataAmigavel(x.dia)}</span><b>{brl(x.valor)}</b></div>)}
          </div>
          {dados.a_receber.length > proximos.length && <small className="g-muted">E mais {dados.a_receber.length - proximos.length} dias depois.</small>}
          {dados.parcelado && <small className="g-muted" style={{ display: "block" }}>Crédito parcelado: uma parcela por mês, a 1ª no prazo do parcelado e as outras a cada 30 dias.</small>}
        </div>
      )}
      <p className="g-muted g-pp">
        A taxa de cada venda é a do dia em que foi paga. O que a maquininha ainda vai pagar sai dos dias para cair que você colocou em Meu pet shop, já sem a taxa: dias corridos, e o que cai no sábado ou no domingo passa para a segunda.
        {pulaFeriado ? " O que cai num feriado da sua lista passa para o próximo dia útil." : " Feriado não é pulado (dá para ligar em Meu pet shop, Taxas da maquininha)."}{" "}
        O Resultado do Financeiro é faturamento − despesas; a taxa aparece aqui à parte e na última linha de Como os números se ligam.
      </p>
    </section>
  );
}
