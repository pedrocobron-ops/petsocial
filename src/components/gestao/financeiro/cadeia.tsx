"use client";

import { useState } from "react";
import { Download, ListOrdered } from "lucide-react";
import { lerCadeia, passosDaCadeia, type Cadeia } from "@/lib/gestao/cadeia";
import { lerParaContador, lerSaldos, planilhaDeLancamentos, planilhaDeRepasses, planilhaDeSaldos, planilhaParaOContador, type LancamentoLido } from "@/lib/gestao/contador";
import { brl, dataCompleta, hojeDaLoja } from "@/lib/gestao/util";
import { feriadosDoRepasse } from "@/lib/gestao/maquininha";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useAvisos, useDados } from "../ui";
import { baixarPlanilha, categoriaAtual, paginar } from "./comum";
import "./financeiro.css";

/**
 * "Como os números se ligam": a cadeia do dinheiro do período, passo a passo, com os mesmos nomes em toda tela
 * (`src/lib/gestao/cadeia.ts`). Recebe a cadeia pronta ou lê pelo período. Só para quem cuida do financeiro.
 */
export function CadeiaDoDinheiro({ cadeia, de, ate, titulo = "Como os números se ligam", curta }: {
  cadeia?: Cadeia | null; de?: string; ate?: string; titulo?: string;
  /** Só até o Faturamento (Relatórios, onde as despesas ficam em outra aba). */
  curta?: boolean;
}) {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const { dados } = useDados(async () => (cadeia === undefined && de && ate && cuidoDoFinanceiro ? lerCadeia(sb, petshop.id, de, ate) : null), [petshop.id, de, ate, cadeia === undefined, cuidoDoFinanceiro]);
  const c = cadeia ?? dados;
  if (!cuidoDoFinanceiro || !c) return null;
  const passos = passosDaCadeia(c, brl).filter((p) => !curta || ["recebido", "devolvido", "credito_deixado", "credito_usado", "faturamento"].includes(p.id));
  return (
    <section className="g-card" aria-label={titulo}>
      <div className="g-card-t">
        <h3><Tile icone={ListOrdered} tom="ceu" tamanho="p" />{titulo}</h3>
        <span className="g-muted g-pp">cada nome é uma conta só</span>
      </div>
      <div className="gf-cadeia g-tab" role="list">
        {passos.map((p) => (
          <div key={p.id} role="listitem" className={p.total ? "t" : undefined} data-passo={p.id}>
            <i aria-hidden>{p.sinal}</i>
            <span>{p.nome}<small>{p.explica}</small></span>
            <b className={p.total && p.valor < 0 ? "g-vermelho-t" : undefined}>{brl(p.valor)}</b>
          </div>
        ))}
      </div>
      {(c.creditoNasContas > 0 || c.troca > 0) && (
        <p className="g-muted g-pp" style={{ marginTop: 10 }}>
          As entradas lançadas somam {brl(c.lancado)}: além do Recebido, têm
          {c.creditoNasContas > 0 ? ` ${brl(c.creditoNasContas)} de contas pagas com crédito do tutor` : ""}{c.creditoNasContas > 0 && c.troca > 0 ? " e" : ""}
          {c.troca > 0 ? ` ${brl(c.troca)} de produto trocado por outro` : ""}, que não são dinheiro novo.
        </p>
      )}
    </section>
  );
}

/**
 * "Para o contador": as planilhas do período (uma linha por recebimento, os lançamentos com taxa e datas, os repasses da
 * maquininha) e os saldos em aberto de hoje. As mesmas planilhas entram na cópia de todos os dados (Meu pet shop).
 */
export function ParaOContador({ de, ate, rotulo }: { de: string; ate: string; rotulo: string }) {
  const { sb, petshop, equipe, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [fazendo, setFazendo] = useState<string | null>(null);
  if (!cuidoDoFinanceiro) return null;

  async function dados() {
    const [pagos, abertos, extras, cadeia, feriados] = await Promise.all([
      paginar<LancamentoLido>((a, b) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", true).gte("data", de).lte("data", ate).order("data").order("criado_em").order("id").range(a, b)),
      paginar<LancamentoLido>((a, b) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", false).order("criado_em").order("id").range(a, b)),
      lerParaContador(sb, petshop.id, de, ate),
      lerCadeia(sb, petshop.id, de, ate),
      feriadosDoRepasse(sb, petshop),
    ]);
    const ids = [...new Set(pagos.map((l) => l.cliente_id).filter((x): x is string => Boolean(x)))];
    const nomes = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 150) {
      const r = await sb.from("clientes").select("id, nome").eq("petshop_id", petshop.id).in("id", ids.slice(i, i + 150));
      if (r.error) throw new Error(r.error.message);
      for (const c of r.data ?? []) nomes.set(c.id, c.nome);
    }
    const quem = new Map(equipe.filter((p) => p.user_id).map((p) => [p.user_id!, p.nome]));
    return {
      // as contas em aberto anotadas no período entram na planilha de lançamentos (fora do resultado)
      pagos, abertos: abertos.filter((l) => extras.linhas.has(l.id)), extras, cadeia,
      nomes: {
        cliente: (id: string) => nomes.get(id) ?? "",
        quem: (l: LancamentoLido) => (l.origem === "assistente" ? `${(l.criado_por && quem.get(l.criado_por)) || "Alguém"}, pelo Mozart` : (l.criado_por && quem.get(l.criado_por)) || ""),
        categoria: (c: string, d?: string | null) => categoriaAtual(c, petshop, d),
        feriados,
      },
    };
  }

  async function baixar(qual: "contador" | "lancamentos" | "repasses" | "saldos") {
    if (fazendo) return;
    setFazendo(qual);
    try {
      if (qual === "saldos") {
        const s = await lerSaldos(sb, petshop.id);
        baixarPlanilha(planilhaDeSaldos(s), `saldos-em-aberto-${s.hoje || hojeDaLoja()}.csv`);
        return;
      }
      const d = await dados();
      if (!d.pagos.length && !d.abertos.length) { avisar("Não há lançamentos neste período."); return; }
      if (qual === "contador") baixarPlanilha(planilhaParaOContador(d.pagos, d.extras, d.nomes, d.cadeia), `para-o-contador-${de}-a-${ate}.csv`);
      else if (qual === "lancamentos") baixarPlanilha(planilhaDeLancamentos([...d.pagos, ...d.abertos], d.extras, d.nomes), `lancamentos-${de}-a-${ate}.csv`);
      else {
        const t = planilhaDeRepasses(d.pagos, d.extras, d.extras.hoje || hojeDaLoja(), d.nomes);
        if (t.length <= 1) { avisar("Nenhum pagamento com cartão ou Pix com taxa guardada neste período."); return; }
        baixarPlanilha(t, `repasses-da-maquininha-${de}-a-${ate}.csv`);
      }
    } catch (e) { avisarErro(e); } finally { setFazendo(null); }
  }

  const botao = (qual: Parameters<typeof baixar>[0], nome: string, explica: string) => (
    <button type="button" className="g-linha" onClick={() => void baixar(qual)} disabled={Boolean(fazendo)} data-planilha={qual}>
      <Tile icone={Download} tom="ceu" />
      <span className="t"><b>{fazendo === qual ? "Montando…" : nome}</b><span>{explica}</span></span>
    </button>
  );
  return (
    <section className="g-card gf-contador" aria-label="Para o contador">
      <div className="g-card-t"><h3><Tile icone={Download} tom="ceu" tamanho="p" />Para o contador</h3><span className="g-muted g-pp">{rotulo}</span></div>
      <div className="g-lista">
        {botao("contador", "Planilha para o contador", "Uma linha por recebimento: datas, forma, parcelas, bruto, taxa, líquido, quando cai, desconto, devolução, crédito e custo dos produtos.")}
        {botao("lancamentos", "Lançamentos com taxa e datas", "Entradas e saídas do período. Somar a coluna Conta no resultado dá o Resultado desta tela.")}
        {botao("repasses", "Repasses da maquininha", "Cada parcela com a taxa, o valor que cai e o dia. O que está A receber soma o A receber da maquininha.")}
        {botao("saldos", "Saldos em aberto hoje", `Fiado, crédito de tutores, pacotes vendidos e ainda não usados e sinais de reservas, em ${dataCompleta(hojeDaLoja())}.`)}
      </div>
    </section>
  );
}
