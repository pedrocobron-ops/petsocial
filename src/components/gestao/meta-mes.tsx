"use client";

import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { contasDaMeta } from "@/lib/gestao/dinheiro";
import { brl, isoDia, nomeMes } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { paginar } from "./financeiro/comum";
import { Anel, Tile } from "./painel";
import { useDados } from "./ui";
import "./meta-mes.css";

const FINANCEIRO = "/gestao/app/financeiro";

/**
 * Meta do mês na tela inicial: anel de progresso, quanto já entrou, quanto falta e o caminho para o Financeiro.
 * Só aparece para quem vê o financeiro. Sem meta definida, o dono vê uma linha discreta para definir.
 */
export default function MetaMes() {
  const { sb, petshop, vejoFinanceiro, souDono } = useGestao();
  const meta = Number(petshop.meta_mes ?? 0);
  const temMeta = vejoFinanceiro && meta > 0;
  const hoje = new Date();
  const inicio = isoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const fim = isoDia(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));

  const { dados: entrou, erro } = useDados(async () => {
    if (!temMeta) return null;
    const linhas = await paginar<{ valor: number }>((de, ate) => sb.from("lancamentos").select("valor").eq("petshop_id", petshop.id)
      .eq("tipo", "entrada").eq("pago", true).is("movimento", null).gte("data", inicio).lte("data", fim).order("id").range(de, ate));
    return Math.round(linhas.reduce((t, l) => t + Number(l.valor), 0) * 100) / 100;
  }, [petshop.id, temMeta, inicio]);

  if (!vejoFinanceiro) return null;
  if (!temMeta) {
    if (!souDono) return null;
    return (
      <Link href={FINANCEIRO} className="g-meta-convite">
        <Target aria-hidden /><span>Definir meta do mês</span><ChevronRight aria-hidden />
      </Link>
    );
  }

  const c = entrou == null ? null : contasDaMeta(meta, entrou, petshop.horario, hoje);
  return (
    <Link href={FINANCEIRO} className="g-card g-meta" aria-label="Meta do mês. Ver no Financeiro">
      <Anel parte={c?.parte ?? 0} tamanho={76} cor="#2f6b4c">{c ? `${c.pct}%` : "–"}</Anel>
      <div className="g-meta-txt">
        <p className="g-meta-cab"><Tile icone={Target} tom="menta" tamanho="p" /><span className="g-rotulo">Meta de {nomeMes(hoje)}</span></p>
        <p className="g-meta-num"><b className="g-tab">{entrou == null ? "–" : brl(entrou)}</b> <span className="g-tab">de {brl(meta)}</span></p>
        <p className="g-muted g-p g-tab">
          {erro && entrou == null ? "Não deu para buscar as entradas do mês."
            : !c ? "Somando as entradas do mês…"
            : c.falta > 0 ? `Falta ${brl(c.falta)}${c.porDia != null ? ` · ${brl(c.porDia)} por ${c.peloHorario ? "dia aberto" : "dia"}` : ""}`
            : c.passou > 0 ? `Meta alcançada · ${brl(c.passou)} acima` : "Meta alcançada"}
        </p>
      </div>
      <span className="g-meta-ir">Financeiro<ChevronRight aria-hidden /></span>
    </Link>
  );
}
