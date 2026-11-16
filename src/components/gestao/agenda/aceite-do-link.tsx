"use client";

import { useEffect, useState } from "react";
import { ScrollText, UserX } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import type { Banco } from "@/lib/gestao/supabase";
import { usouOpcoesDoLink } from "@/lib/gestao/link-opcoes";
import { dataCurta, hora } from "@/lib/gestao/util";
import "./pedidos-link.css";

type DoPedido = { agendamento_id: string | null; estadia_id: string | null; termos_aceitos_em: string | null; termos_texto: string | null; termos_vacinas: boolean | null; cliente_cancelou_em: string | null; cliente_recado: string | null };
type Campo = "agendamento_id" | "estadia_id";

// Vários cartões na mesma tela pedem ao mesmo tempo: junta tudo numa consulta só por campo.
const fila: Record<Campo, Map<string, ((p: DoPedido | null) => void)[]>> = { agendamento_id: new Map(), estadia_id: new Map() };
let marcado = false;
function buscar(sb: Banco, petshopId: string, campo: Campo, id: string): Promise<DoPedido | null> {
  return new Promise((resolver) => {
    fila[campo].set(id, [...(fila[campo].get(id) ?? []), resolver]);
    if (marcado) return;
    marcado = true;
    setTimeout(() => {
      marcado = false;
      for (const c of ["agendamento_id", "estadia_id"] as Campo[]) {
        const lote = new Map(fila[c]);
        fila[c].clear();
        if (!lote.size) continue;
        void sb.from("pedidos_agendamento").select("agendamento_id, estadia_id, termos_aceitos_em, termos_texto, termos_vacinas, cliente_cancelou_em, cliente_recado")
          .eq("petshop_id", petshopId).in(c, [...lote.keys()]).then(({ data }) => {
            const achados = new Map(((data ?? []) as DoPedido[]).map((p) => [String(p[c]), p]));
            for (const [chave, quem] of lote) for (const f of quem) f(achados.get(chave) ?? null);
          });
      }
    }, 0);
  });
}

const diaHora = (iso: string) => `${dataCurta(new Date(iso))} às ${hora(iso)}`;

/**
 * No horário da agenda e na reserva que nasceram de um pedido pelo link: quando o tutor aceitou as regras
 * (com o texto exato que ele leu) e se foi ele quem cancelou pela página do pedido.
 * Não aparece (nem consulta) em pet shop que nunca mexeu nas opções do link.
 */
export default function AceiteDoLink({ agendamentoId, estadiaId }: { agendamentoId?: string | null; estadiaId?: string | null }) {
  const { sb, petshop } = useGestao();
  const [p, setP] = useState<DoPedido | null>(null);
  const usa = usouOpcoesDoLink(petshop);
  const campo: Campo = agendamentoId ? "agendamento_id" : "estadia_id";
  const id = agendamentoId ?? estadiaId ?? null;
  useEffect(() => {
    if (!usa || !id) { setP(null); return; }
    let vale = true;
    void buscar(sb, petshop.id, campo, id).then((x) => { if (vale) setP(x); });
    return () => { vale = false; };
  }, [sb, petshop.id, usa, campo, id]);
  if (!p || (!p.termos_aceitos_em && !p.cliente_cancelou_em)) return null;
  return (
    <div className="g-pl-aceite">
      {p.termos_aceitos_em && (
        <>
          <p><ScrollText aria-hidden /><span>Pedido pelo link: o cliente aceitou {p.termos_texto ? "os termos" : "a declaração de vacinas"} em {diaHora(p.termos_aceitos_em)}{p.termos_texto && p.termos_vacinas ? " e marcou que as vacinas estão em dia" : ""}.</span></p>
          {p.termos_texto && <details><summary>Ver o texto que ele aceitou</summary><div>{p.termos_texto}</div></details>}
        </>
      )}
      {p.cliente_cancelou_em && <p><UserX aria-hidden /><span>Cancelado pelo cliente, pelo link, em {diaHora(p.cliente_cancelou_em)}.{p.cliente_recado ? ` Motivo: “${p.cliente_recado}”.` : ""}</span></p>}
    </div>
  );
}
