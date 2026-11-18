"use client";

import { Scissors } from "lucide-react";
import { montarLucro, type LucroDoBanco } from "@/lib/gestao/lucro";
import { usaModulo } from "@/lib/gestao/modulos";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useDados } from "../ui";

/**
 * Resumo do Financeiro: o que entrou de serviços, por serviço, com a mesma divisão de Relatórios (`lucro_do_periodo`: a conta
 * com Banho e tosa e Hidratação é repartida entre os dois, como na comissão). "De onde veio" continua por categoria; este
 * cartão mostra a mesma conta aberta por serviço, para os dois lugares darem o mesmo número. Só aparece com dois serviços ou mais.
 */
export default function PorServico({ inicio, fim }: { inicio: string; fim: string }) {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const liga = cuidoDoFinanceiro && usaModulo(petshop, "banho_tosa");
  const { dados } = useDados(async () => {
    if (!liga) return null;
    const r = await sb.rpc("lucro_do_periodo", { p_petshop: petshop.id, p_de: inicio, p_ate: fim });
    return r.error ? null : montarLucro(r.data as unknown as LucroDoBanco);
  }, [petshop.id, inicio, fim, liga]);
  const linhas = (dados?.servicos ?? []).filter((s) => s.receita > 0.004).sort((a, b) => b.receita - a.receita);
  if (linhas.length < 2) return null;
  const total = linhas.reduce((t, l) => t + l.receita, 0);
  return (
    <section className="g-card" aria-label="Serviços do mês, por serviço">
      <div className="g-card-t"><h3><Tile icone={Scissors} tom="pessego" tamanho="p" />Por serviço</h3><b className="g-tab">{brl(total)}</b></div>
      <div className="g-lista">
        {linhas.slice(0, 8).map((l) => (
          <div key={l.chave} className="gf-par"><span>{l.nome}{l.quantidade ? <span className="g-muted"> · {l.quantidade.toLocaleString("pt-BR")}×</span> : null}</span><span className="g-tab">{brl(l.receita)}</span></div>
        ))}
      </div>
      <p className="g-muted g-pp" style={{ marginTop: 8 }}>A mesma divisão de Relatórios: a conta com mais de um serviço é repartida entre eles, com o desconto.</p>
    </section>
  );
}
