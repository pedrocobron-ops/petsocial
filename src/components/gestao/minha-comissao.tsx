"use client";

import { HandCoins } from "lucide-react";
import { opcoesDeComissao } from "@/lib/gestao/dinheiro-opcoes";
import { brl, dataCurta, deIsoDia, nomeMes } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { Tile } from "./painel";
import { useDados } from "./ui";
import "./financeiro/recebimentos.css";

type Pago = { de: string; ate: string; valor: number; pago_em: string };
type Mes = { de: string; ate: string; atendimentos: number; com_pacote: number; base: number; base_produtos: number; comissao_servicos: number; comissao_produtos: number; comissao: number; pagos: Pago[] };

/**
 * "Minha comissão": a comissão de quem está logado, do mês atual e do anterior.
 * O banco entrega só a linha da própria pessoa: nada do financeiro do pet shop nem da comissão dos colegas.
 * Não aparece para quem não tem comissão.
 */
export default function MinhaComissao() {
  const { sb, petshop, eu } = useGestao();
  const op = opcoesDeComissao(petshop);
  // só pergunta ao banco quando pode haver comissão: percentual da pessoa, por serviço ou sobre produtos
  const pode = Number(eu.comissao_pct) > 0 || op.porServico || op.produtos;
  const { dados } = useDados(async () => {
    if (!pode) return null;
    const r = await sb.rpc("minha_comissao", { p_petshop: petshop.id });
    if (r.error) return null;
    return r.data as { pct: number; meses: Mes[] } | null;
  }, [petshop.id, pode]);
  const meses = dados?.meses ?? [];
  if (!meses.length || !(Number(dados?.pct) > 0 || meses.some((m) => Number(m.comissao) > 0))) return null;
  const n = (q: number) => (q === 1 ? "1 atendimento" : `${q} atendimentos`);
  return (
    <section className="g-card gr-minha" aria-label="Minha comissão">
      <div className="g-card-t">
        <h3><Tile icone={HandCoins} tom="menta" tamanho="p" />Minha comissão</h3>
        <span className="g-muted g-pp">só você vê</span>
      </div>
      <div className="gr-minha-meses">
        {meses.map((m, i) => {
          const pago = m.pagos.reduce((s, p) => s + Number(p.valor), 0);
          return (
            <div key={m.de}>
              <small>{i === 0 ? `${nomeMes(deIsoDia(m.de))}, até agora` : nomeMes(deIsoDia(m.de))}</small>
              <b className="g-tab">{brl(m.comissao)}</b>
              <small>{n(m.atendimentos)} · base {brl(m.base)}{Number(m.comissao_produtos) > 0 ? ` · produtos ${brl(m.comissao_produtos)}` : ""}</small>
              {m.pagos.length > 0
                ? <small><span className="g-tag verde">{brl(pago)} pago</span> {m.pagos.map((p) => `${dataCurta(p.de)} a ${dataCurta(p.ate)}`).join(", ")}</small>
                : Number(m.comissao) > 0 ? <small><span className="g-tag">ainda não marcada como paga</span></small> : null}
            </div>
          );
        })}
      </div>
      <p className="g-muted g-pp">
        Conta sobre o valor cobrado pelo serviço nos atendimentos que você concluiu{op.extras ? ", com os extras" : ""}{op.produtos ? ", mais os produtos vendidos na conta" : ""}. Quem fecha o valor e paga é o dono.
      </p>
    </section>
  );
}
