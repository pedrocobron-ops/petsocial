"use client";

import { PiggyBank } from "lucide-react";
import { creditoDoTutor } from "@/lib/gestao/credito";
import { brl, dataCurta } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useDados } from "../ui";

/**
 * Crédito do tutor na ficha (só para quem mexe com dinheiro): o saldo e de onde veio. Sem nenhum movimento, não aparece.
 * O crédito nasce no check-out do hotel (pagou adiantado mais do que a estadia) e é oferecido no próximo check-out.
 */
export function CreditoDoTutor({ clienteId, nome }: { clienteId: string; nome: string }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { dados } = useDados(async () => (vejoFinanceiro ? creditoDoTutor(sb, petshop.id, clienteId) : null), [petshop.id, clienteId, vejoFinanceiro]);
  if (!dados || !dados.movimentos.length) return null;
  const primeiro = nome.split(/\s+/)[0];
  return (
    <section className="g-card">
      <div className="g-card-t">
        <h3><Tile icone={PiggyBank} tom="menta" tamanho="p" />Crédito de {primeiro}</h3>
        <b className="g-tab">{brl(dados.saldo)}</b>
      </div>
      <p className="g-muted g-pp">{dados.saldo > 0 ? `${primeiro} tem ${brl(dados.saldo)} para usar. O próximo check-out do hotel oferece descontar da conta.` : "Nada para usar agora."}</p>
      <div className="g-ht-conta">
        {dados.movimentos.slice(0, 8).map((m) => (
          <div key={m.id} className="l"><span>{dataCurta(m.criado_em)} · {m.motivo ?? (Number(m.valor) > 0 ? "Crédito deixado" : "Crédito usado")}</span><span>{Number(m.valor) > 0 ? brl(Number(m.valor)) : `- ${brl(-Number(m.valor))}`}</span></div>
        ))}
      </div>
    </section>
  );
}
