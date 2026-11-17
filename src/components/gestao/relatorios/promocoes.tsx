"use client";

import { Tag } from "lucide-react";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useDados } from "../ui";

type LinhaPromo = { id: string; nome: string; marcados: number; concluidos: number; contas: number; desconto: number };

/**
 * Promoções no período (Relatórios): por promoção, quantos horários foram marcados com ela (sem cancelados, faltas e as tiradas),
 * quantos foram feitos e quanto de desconto ela deu nas contas fechadas. Os números vêm do banco (`relatorio_promocoes`).
 * Sem promoção no período, o bloco não aparece.
 */
export default function PromocoesNoRelatorio({ de, ate }: { de: string; ate: string }) {
  const { sb, petshop } = useGestao();
  const { dados } = useDados(async () => {
    const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> })
      .rpc("relatorio_promocoes", { p: petshop.id, p_de: de, p_ate: ate });
    return r.error || !Array.isArray(r.data) ? [] : (r.data as LinhaPromo[]).map((x) => ({ ...x, desconto: Number(x.desconto) }));
  }, [petshop.id, de, ate]);
  if (!dados?.length) return null;
  const total = Math.round(dados.reduce((t, x) => t + x.desconto, 0) * 100) / 100;
  return (
    <section className="g-card" aria-label="Promoções">
      <div className="g-card-t"><h3><Tile icone={Tag} tom="menta" tamanho="p" />Promoções</h3><span className="g-muted g-pp">desconto dado: {brl(total)}</span></div>
      <div className="g-lista">
        {dados.map((x) => (
          <div key={x.id} className="g-linha">
            <span className="t">
              <b>{x.nome}</b>
              <span>{x.marcados === 1 ? "1 horário marcado" : `${x.marcados} horários marcados`} · {x.concluidos === 1 ? "1 feito" : `${x.concluidos} feitos`} · {x.contas === 1 ? "1 conta com desconto" : `${x.contas} contas com desconto`}</span>
            </span>
            <span className="d"><b className="g-tab">{brl(x.desconto)}</b></span>
          </div>
        ))}
      </div>
      <p className="g-muted g-pp" style={{ marginTop: 10 }}>Horários pelo dia marcado; desconto pelo dia em que a conta foi fechada. Horário em que a equipe tirou a promoção não conta.</p>
    </section>
  );
}
