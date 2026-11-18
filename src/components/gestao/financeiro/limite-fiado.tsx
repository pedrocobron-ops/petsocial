"use client";

import { useState } from "react";
import { Gauge, Pencil } from "lucide-react";
import { fraseDoDisponivel, fraseDoVencimento, limitePadrao, situacaoDoFiado } from "@/lib/gestao/fiado";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { CampoDinheiro } from "../loja/pecas";
import { Tile } from "../painel";
import { avisarMudanca, Campo, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "../loja/orcamento.css";

/** A barrinha do limite: quanto do limite já está devido. */
export function BarraDoLimite({ deve, limite }: { deve: number; limite: number }) {
  const parte = limite > 0 ? Math.min(1, deve / limite) : 1;
  return (
    <span className={`g-orc-barra${deve > limite + 0.005 ? " passou" : ""}`} role="img" aria-label={fraseDoDisponivel(deve, limite)}>
      <i style={{ width: `${Math.round(parte * 100)}%` }} />
    </span>
  );
}

/**
 * Limite de fiado na ficha do cliente (migração 20261200): o limite que vale (o dele ou o padrão da loja), quanto deve e
 * quanto ainda cabe. O dono e quem cuida do financeiro mudam o limite aqui. Só para quem mexe com dinheiro.
 */
export function LimiteDoFiado({ cliente, aoMudar }: { cliente: { id: string; nome: string; limite_fiado?: number | null }; aoMudar?: () => void }) {
  const { sb, petshop, souDono, cuidoDoFinanceiro, vejoFinanceiro } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState(false);
  const { dados: s, recarregar } = useDados(async () => (vejoFinanceiro ? situacaoDoFiado(sb, petshop.id, cliente.id).catch(() => null) : null), [petshop.id, cliente.id, vejoFinanceiro, cliente.limite_fiado ?? null]);
  if (!vejoFinanceiro || !s) return null;
  const pode = souDono || cuidoDoFinanceiro;
  const primeiro = cliente.nome.split(" ")[0];
  return (
    <div className="g-orc-limite" aria-label={`Limite de fiado de ${primeiro}`}>
      <Tile icone={Gauge} tom="manteiga" tamanho="p" />
      {s.limite == null
        ? <span>Sem limite de fiado{pode ? "" : "."}</span>
        : <>
          <span><b>{fraseDoDisponivel(s.deve, s.limite)}</b>{s.do_cliente ? "" : " (padrão da loja)"}
            {(s.fora_do_limite ?? 0) > 0 ? <small className="g-muted"> · {fraseDoVencimento({ vencido: s.vencido ?? 0, venceHoje: s.vence_hoje ?? 0, aVencer: s.a_vencer ?? 0 })}. Mensalidade e sinal que ainda não venceram ({brl(s.fora_do_limite!)}) não contam no limite.</small> : null}</span>
          <BarraDoLimite deve={s.deve} limite={s.limite} />
        </>}
      {pode && <button type="button" className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setEditando(true); }}><Pencil />{s.limite == null ? "Pôr limite" : "Mudar limite"}</button>}
      {editando && <FolhaLimite cliente={cliente} atual={s.do_cliente ? s.limite : null} aoFechar={() => setEditando(false)} aoSalvo={() => { setEditando(false); void recarregar(); aoMudar?.(); }} />}
    </div>
  );
}

function FolhaLimite({ cliente, atual, aoFechar, aoSalvo }: { cliente: { id: string; nome: string }; atual: number | null; aoFechar: () => void; aoSalvo: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [valor, setValor] = useState<number | null>(atual);
  const [salvando, setSalvando] = useState(false);
  const padrao = limitePadrao(petshop);
  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      ok(await sb.from("clientes").update({ limite_fiado: valor }).eq("id", cliente.id).eq("petshop_id", petshop.id).select("id"));
      avisar(valor == null ? (padrao ? `Vale o padrão da loja (${brl(padrao)}).` : "Sem limite de fiado.") : `Limite de ${brl(valor)} para ${cliente.nome.split(" ")[0]}.`);
      avisarMudanca();
      aoSalvo();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }
  return (
    <Folha titulo={`Limite de fiado de ${cliente.nome.split(" ")[0]}`} aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button><button type="button" className="g-btn pri" disabled={salvando} onClick={() => void salvar()}>{salvando ? "Salvando…" : "Salvar"}</button></>}>
      <div className="g-form">
        <Campo rotulo="Até quanto pode ficar devendo" dica={padrao ? `Em branco, vale o padrão da loja (${brl(padrao)}). Zero: não pode deixar nada para depois.` : "Em branco, sem limite. Zero: não pode deixar nada para depois."}>
          <CampoDinheiro valor={valor} aoMudar={setValor} rotulo="Limite de fiado" autoFocus />
        </Campo>
        <p className="g-muted g-pp">Passou do limite, o sistema avisa e só o dono ou quem cuida do financeiro libera (fica anotado quem liberou). Pagamento na hora nunca é barrado. Conta o que o cliente já deve: o atrasado, o que vence hoje e o fiado. Mensalidade da creche e sinal de reserva só contam quando vencem.</p>
      </div>
    </Folha>
  );
}
