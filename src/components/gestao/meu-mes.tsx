"use client";

import { Users } from "lucide-react";
import { montarEquipe, type EquipeDoBanco } from "@/lib/gestao/lucro";
import { brl, isoDia, nomeMes } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { Tile } from "./painel";
import { useDados } from "./ui";
import "./financeiro/recebimentos.css";

/**
 * "Meu mês", na tela Hoje de quem não cuida do financeiro: a própria linha de "Por pessoa" (Relatórios) no mês até hoje.
 * O banco (`equipe_do_periodo`) entrega só a linha da própria pessoa, como em "Minha comissão". Os valores em reais só para
 * quem recebe (como a base da comissão); os outros veem as contagens. Some quando não há nada no mês.
 */
export default function MeuMes() {
  const { sb, petshop, vejoFinanceiro, cuidoDoFinanceiro } = useGestao();
  const hoje = new Date();
  const de = isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate = isoDia(hoje);
  const { dados } = useDados(async () => {
    if (cuidoDoFinanceiro) return null;
    const r = await sb.rpc("equipe_do_periodo", { p_petshop: petshop.id, p_de: de, p_ate: ate });
    if (r.error) return null;
    return montarEquipe(r.data as unknown as EquipeDoBanco);
  }, [petshop.id, de, ate, cuidoDoFinanceiro]);
  const minha = dados?.pessoas[0];
  if (!minha || (!minha.atendimentos && !minha.vendas)) return null;
  return (
    <section className="g-card gr-minha" aria-label="Meu mês">
      <div className="g-card-t">
        <h3><Tile icone={Users} tom="lilas" tamanho="p" />Meu mês</h3>
        <span className="g-muted g-pp">só você vê</span>
      </div>
      <div className="gr-minha-meses">
        <div>
          <small>{nomeMes(hoje)}, até agora</small>
          <b className="g-tab">{minha.atendimentos === 1 ? "1 atendimento" : `${minha.atendimentos} atendimentos`}</b>
          <small>concluídos</small>
        </div>
        {minha.vendas > 0 && (
          <div>
            <small>Vendas de produtos</small>
            <b className="g-tab">{minha.vendas === 1 ? "1 venda" : `${minha.vendas} vendas`}</b>
            {vejoFinanceiro && <small>{brl(minha.vendasValor)}</small>}
          </div>
        )}
        {vejoFinanceiro && minha.receita > 0 && (
          <div>
            <small>Entrou pelas suas contas</small>
            <b className="g-tab">{brl(minha.receita)}</b>
            {minha.medio != null && <small>média de {brl(minha.medio)} por conta</small>}
          </div>
        )}
      </div>
    </section>
  );
}
