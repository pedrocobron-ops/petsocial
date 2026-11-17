"use client";

import { useMemo } from "react";
import { Download, Users } from "lucide-react";
import { montarEquipe, type EquipeDoBanco, type LinhaPessoa } from "@/lib/gestao/lucro";
import { brl, dataCompleta, deIsoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { baixarPlanilha, dinheiroCsv, numeroCsv, type Cel } from "../financeiro/comum";
import { Tile } from "../painel";
import { AvatarPessoa, Esqueleto, useAvisos, useDados } from "../ui";
import "./lucro.css";

const n = (q: number, um: string, varios: string) => (q === 1 ? `1 ${um}` : `${q} ${varios}`);

/**
 * Bloco "Por pessoa" dos Relatórios: atendimentos concluídos, vendas de produtos, o que entrou por cada pessoa, valor médio
 * e comissão. Uma ida ao banco (`equipe_do_periodo`). A comissão é a mesma de "Comissão por profissional".
 */
export default function PorPessoa({ de, ate }: { de: string; ate: string }) {
  const { sb, petshop } = useGestao();
  const { avisar } = useAvisos();
  const { dados, erro } = useDados(async () => {
    const r = await sb.rpc("equipe_do_periodo", { p_petshop: petshop.id, p_de: de, p_ate: ate });
    if (r.error) throw new Error(r.error.message);
    return r.data as unknown as EquipeDoBanco;
  }, [petshop.id, de, ate]);
  const x = useMemo(() => (dados ? montarEquipe(dados) : null), [dados]);
  // quem vendeu é guardado desde a atualização: período que começa antes disso avisa
  const antes = x?.desde && de < x.desde ? x.desde : null;

  function exportar() {
    if (!x) return;
    const linha = (p: LinhaPessoa): Cel[] => [p.nome, numeroCsv(p.atendimentos), numeroCsv(p.vendas), dinheiroCsv(p.vendasValor), dinheiroCsv(p.servicosValor), dinheiroCsv(p.receita), numeroCsv(p.contas), p.medio == null ? "" : dinheiroCsv(p.medio), dinheiroCsv(p.comissao)];
    const t: Cel[][] = [
      ["Por pessoa", petshop.nome],
      ["Período", `${dataCompleta(deIsoDia(de))} a ${dataCompleta(deIsoDia(ate))}`],
      ...(antes ? [["Quem vendeu", `guardado desde ${dataCompleta(deIsoDia(antes))}; vendas de balcão de antes ficam em "Sem pessoa registrada"`]] as Cel[][] : []),
      [],
      ["Pessoa", "Atendimentos concluídos", "Vendas de produtos", "Produtos (R$)", "Serviços e extras (R$)", "Entrou por ela (R$)", "Contas recebidas", "Valor médio por conta", "Comissão"],
      ...x.pessoas.map(linha), ...(x.semPessoa ? [linha(x.semPessoa)] : []),
      ["Total", numeroCsv(x.total.atendimentos), "", "", "", dinheiroCsv(x.total.receita), "", "", dinheiroCsv(x.total.comissao)],
    ];
    baixarPlanilha(t, `por-pessoa-${de}-a-${ate}.csv`);
    avisar("Planilha baixada.");
  }

  return (
    <section className="g-card g-pilha" id="por-pessoa" aria-label="Por pessoa">
      <div className="g-card-t">
        <h3><Tile icone={Users} tom="lilas" tamanho="p" />Por pessoa</h3>
        <button type="button" className="g-btn sec p" onClick={exportar} disabled={!x?.pessoas.length}><Download /> Exportar</button>
      </div>
      {erro ? <p className="g-erro" role="alert">{erro}</p> : !x ? <Esqueleto linhas={3} /> : x.pessoas.length ? (
        <>
          <div className="g-lu-tab" role="table" aria-label="Produtividade por pessoa">
            <div className="g-lu-l cab" role="row"><span>Pessoa</span><span>Atendimentos</span><span>Vendas</span><span>Entrou por ela</span><span>Valor médio</span><span>Comissão</span></div>
            {[...x.pessoas, ...(x.semPessoa ? [x.semPessoa] : [])].map((p) => (
              <div key={p.id ?? "sem"} className="g-lu-l" role="row">
                <span className="n">
                  <span className="g-fila" style={{ gap: 8, flexWrap: "nowrap" }}>
                    {p.id && <AvatarPessoa nome={p.nome} cor={p.cor ?? undefined} />}
                    <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <b>{p.nome}</b>
                      <small className="g-muted">{p.id
                        ? [p.servicosValor ? `serviços ${brl(p.servicosValor)}` : "", p.vendasValor ? `produtos ${brl(p.vendasValor)}` : "", p.contas ? n(p.contas, "conta", "contas") : ""].filter(Boolean).join(" · ") || "nada recebido no período"
                        : "atendimento sem profissional ou venda sem vendedor guardado"}</small>
                    </span>
                  </span>
                </span>
                <span><i>Atendimentos </i><em>{p.id ? p.atendimentos : "–"}</em></span>
                <span><i>Vendas </i><em>{p.vendas ? `${p.vendas} · ${brl(p.vendasValor)}` : "–"}</em></span>
                <span><i>Entrou por ela </i><em>{brl(p.receita)}</em></span>
                <span><i>Valor médio </i><em>{p.medio == null ? "–" : brl(p.medio)}</em></span>
                <span><i>Comissão </i><em>{p.id ? brl(p.comissao) : "–"}</em></span>
              </div>
            ))}
            {!x.soEu && (
              <div className="g-lu-l total" role="row">
                <span className="n"><b>Total</b></span>
                <span><i>Atendimentos </i><em>{x.total.atendimentos}</em></span>
                <span />
                <span><i>Entrou </i><em>{brl(x.total.receita)}</em></span>
                <span />
                <span><i>Comissão </i><em>{brl(x.total.comissao)}</em></span>
              </div>
            )}
          </div>
          <p className="g-muted g-pp">
            Atendimentos: os horários concluídos da pessoa no período. Entrou por ela: o que foi recebido no período das contas dos atendimentos dela (serviços, extras e os produtos vendidos na conta)
            e das vendas de balcão que ela lançou, com o desconto; a soma das pessoas é o “Serviços, produtos e extras” de Quanto sobrou. Valor médio: o que entrou ÷ contas recebidas.
            A comissão é a de Comissão por profissional.
            {antes ? ` Quem vendeu no balcão é guardado desde ${dataCompleta(deIsoDia(antes))}: as vendas de antes ficam em “Sem pessoa registrada”.` : ""}
          </p>
        </>
      ) : <p className="g-muted g-p">Ninguém da equipe atendeu ou vendeu neste período.</p>}
    </section>
  );
}
