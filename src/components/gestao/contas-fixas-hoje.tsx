"use client";

import Link from "@/components/gestao/link-depois";
import { Building2, ChevronRight } from "lucide-react";
import { lerResumoContasFixas } from "@/lib/gestao/contas-fixas";
import { fraseDasContasFixas } from "@/lib/gestao/falta-cobrir";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { useDados } from "./ui";


/**
 * Tela Hoje, para o dono e quem cuida do financeiro: uma linha com quanto falta faturar para cobrir as contas fixas do mês.
 * É a mesma conta do quadro "Quanto custa manter o pet shop" (Financeiro → Contas fixas, função `contas_fixas_resumo`),
 * na versão simples: contas fixas do mês menos o que já faturou. Sem contas fixas cadastradas, não aparece.
 */
export default function ContasFixasHoje() {
  const { sb, petshop, cuidoDoFinanceiro, vejoFinanceiro } = useGestao();
  const pode = cuidoDoFinanceiro && vejoFinanceiro;
  const { dados } = useDados(async () => (pode ? lerResumoContasFixas(sb, petshop.id).catch(() => null) : null), [petshop.id, pode]);
  const frase = dados ? fraseDasContasFixas(dados) : null;
  if (!pode || !dados || !frase) return null;
  return (
    <Link className="g-ret-linha" href="/gestao/app/financeiro?aba=fixas" data-teste="contas-fixas-hoje">
      <Building2 aria-hidden />
      <span>
        <b>{frase.titulo}.</b>{" "}
        Contas fixas: {brl(dados.total_mensal)} por mês. Já faturou {brl(dados.faturamento_mes)} do dia 1 até hoje. A conta completa, com o custo do que você vende, está em Financeiro.
      </span>
      <ChevronRight aria-hidden />
    </Link>
  );
}
