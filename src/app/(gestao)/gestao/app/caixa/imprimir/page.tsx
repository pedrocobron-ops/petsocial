"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { creditoDaEntrada, nomeDoMovimento, textoDoPagamento } from "@/lib/gestao/dinheiro";
import type { Caixa, Lancamento } from "@/lib/gestao/tipos";
import { brl, dataCurta, dataLonga, hora } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { categoriaAtual, diferencaDoCaixa, esperadoDoCaixa, paginar, resumoDeItens, resumoDoCaixa, SemAcesso } from "@/components/gestao/financeiro/comum";
import { useParaCobrarComValor } from "@/components/gestao/agenda/para-cobrar";
import { Esqueleto, useDados } from "@/components/gestao/ui";
import { CabecalhoDoPapel, ControlesDoPapel, Pares, Papel, useTituloDoPapel } from "@/components/gestao/papel";

/**
 * Fechamento do caixa no papel: troco, entradas por forma, saídas, esperado e contado, diferença, o que ficou para cobrar,
 * alterações em valores, quem abriu e quem fechou. Sem `caixa=<id>`, o último caixa fechado.
 * Quem só opera o caixa (sem Financeiro) imprime a conferência da gaveta, como vê na tela; os lançamentos de um caixa fechado
 * ficam para o dono e para quem cuida do financeiro (o banco não entrega para os outros).
 */
const quandoPagou = (l: Lancamento) => l.pago_em ?? l.criado_em;

function FechamentoNoPapel() {
  const { sb, petshop, equipe, vejoFinanceiro, cuidoDoFinanceiro: fin } = useGestao();
  const params = useSearchParams();
  const [id, setId] = useState(params.get("caixa") ?? "");
  const paraCobrar = useParaCobrarComValor();

  const { dados, carregando, erro } = useDados(async () => {
    if (!vejoFinanceiro) return null;
    const f = await sb.from("caixas").select("*").eq("petshop_id", petshop.id).not("fechado_em", "is", null).order("fechado_em", { ascending: false }).limit(30);
    if (f.error) throw new Error(f.error.message);
    const fechados = (f.data ?? []) as Caixa[];
    let caixa = id ? fechados.find((c) => c.id === id) ?? null : fechados[0] ?? null;
    if (id && !caixa) {
      // caixa mais antigo que a lista, ou ainda aberto
      const r = await sb.from("caixas").select("*").eq("petshop_id", petshop.id).eq("id", id).maybeSingle();
      caixa = (r.data as Caixa | null) ?? null;
    }
    if (!caixa) return { fechados, caixa: null, lancamentos: [] as Lancamento[], alteracoes: 0 };
    const c = caixa;
    const [lancamentos, alt] = await Promise.all([
      fin || !c.fechado_em ? paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", true)
        .eq("caixa_id", c.id).order("criado_em").order("id").range(de, ate)) : Promise.resolve([] as Lancamento[]),
      sb.rpc("caixa_alteracoes", { p_caixa: c.id }),
    ]);
    lancamentos.sort((a, b) => quandoPagou(a).localeCompare(quandoPagou(b)) || a.id.localeCompare(b.id));
    return { fechados, caixa: c, lancamentos, alteracoes: alt.error ? 0 : Number(alt.data ?? 0) };
  }, [petshop.id, id, vejoFinanceiro, fin]);

  const caixa = dados?.caixa ?? null;
  useTituloDoPapel(caixa ? `Fechamento do caixa ${dataCurta(caixa.fechado_em ?? caixa.aberto_em).replace("/", "-")} · ${petshop.nome}` : `Fechamento do caixa · ${petshop.nome}`);
  if (!vejoFinanceiro) return <SemAcesso />;

  const nomeDe = (userId: string | null) => (userId ? equipe.find((p) => p.user_id === userId)?.nome ?? null : null);
  const lanc = dados?.lancamentos ?? [];
  const soGaveta = !fin;
  const comMovimentos = !(soGaveta && caixa?.fechado_em);
  const r = caixa ? resumoDoCaixa(caixa.valor_inicial, lanc) : null;
  const esperado = caixa ? esperadoDoCaixa(caixa, lanc) : 0;
  const dif = caixa ? diferencaDoCaixa(caixa.valor_contado == null ? null : Number(caixa.valor_contado), esperado) : null;
  const dinheiro = r?.porForma.find((f) => f.id === "dinheiro");
  const lancVisiveis = soGaveta ? lanc.filter((l) => l.tipo === "entrada" || l.movimento || l.forma === "dinheiro") : lanc;

  return (
    <div className="g-imp">
      <ControlesDoPapel voltar="/gestao/app/caixa" rotuloVoltar="Voltar para o caixa" dica="A folha mostra valores: guarde com cuidado.">
        {(dados?.fechados.length ?? 0) > 1 && (
          <div className="g-imp-linha">
            <select className="g-select" value={caixa?.id ?? ""} aria-label="Qual caixa" onChange={(e) => setId(e.target.value)}>
              {caixa && !dados!.fechados.some((c) => c.id === caixa.id) && <option value={caixa.id}>Caixa de {dataCurta(caixa.aberto_em)}</option>}
              {dados!.fechados.map((c) => <option key={c.id} value={c.id}>Fechado {dataLonga(c.fechado_em!)}, {hora(c.fechado_em!)}</option>)}
            </select>
          </div>
        )}
      </ControlesDoPapel>

      <Papel pe="Fechamento do caixa">
        <CabecalhoDoPapel titulo={caixa ? `${caixa.fechado_em ? "Fechamento do caixa" : "Caixa aberto (parcial)"} · ${dataLonga(caixa.fechado_em ?? caixa.aberto_em)}` : "Fechamento do caixa"}
          apoio={caixa ? `Aberto em ${dataCurta(caixa.aberto_em)} às ${hora(caixa.aberto_em)}${nomeDe(caixa.aberto_por) ? ` por ${nomeDe(caixa.aberto_por)}` : ""}${caixa.fechado_em ? ` · fechado em ${dataCurta(caixa.fechado_em)} às ${hora(caixa.fechado_em)}${nomeDe(caixa.fechado_por) ? ` por ${nomeDe(caixa.fechado_por)}` : ""}` : " · ainda aberto"}` : undefined} />
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={5} /> : !caixa || !r ? <p className="g-pa-vazio">Nenhum caixa fechado ainda. Depois de fechar o caixa, o fechamento sai aqui.</p> : (
          <>
            <div className="g-pa-duas">
              <section>
                <h2 className="g-pa-t">Conferência da gaveta</h2>
                <Pares linhas={[
                  { nome: "Troco inicial", valor: brl(caixa.valor_inicial) },
                  comMovimentos && dinheiro && { nome: "+ Entradas em dinheiro", valor: brl(dinheiro.entrou), recuo: true },
                  comMovimentos && dinheiro && dinheiro.saiu > 0 && { nome: "− Saídas em dinheiro", valor: brl(dinheiro.saiu), recuo: true },
                  comMovimentos && r.suprimentos > 0 && { nome: "+ Colocado na gaveta (suprimento)", valor: brl(r.suprimentos), recuo: true },
                  comMovimentos && r.sangrias > 0 && { nome: "− Tirado da gaveta (sangria)", valor: brl(r.sangrias), recuo: true },
                  { nome: "Dinheiro esperado na gaveta", valor: brl(esperado), forte: true },
                  { nome: "Dinheiro contado", valor: caixa.valor_contado == null ? "não contado" : brl(caixa.valor_contado), forte: true },
                  dif && { nome: "Diferença", valor: dif.tom === "certo" ? "bateu certinho" : dif.tom === "sobra" ? `sobra de ${brl(dif.valor)}` : `falta de ${brl(-dif.valor)}`, forte: true },
                ]} />
              </section>
              {comMovimentos ? (
                <section>
                  <h2 className="g-pa-t">Entradas por forma de pagamento</h2>
                  <Pares linhas={[
                    ...r.porForma.filter((f) => f.entrou > 0).map((f) => ({ nome: f.rotulo, valor: brl(f.entrou), recuo: true })),
                    r.credito > 0 && { nome: "Pago com crédito do tutor (não entrou agora)", valor: `− ${brl(r.credito)}`, recuo: true },
                    { nome: r.nEntradas === 1 ? "Entradas (1 lançamento)" : `Entradas (${r.nEntradas} lançamentos)`, valor: brl(r.entrou), forte: true },
                  ]} />
                  {!soGaveta && (
                    <>
                      <h2 className="g-pa-t" style={{ marginTop: 10 }}>Saídas</h2>
                      <Pares linhas={[
                        ...r.porForma.filter((f) => f.saiu > 0).map((f) => ({ nome: f.rotulo, valor: brl(f.saiu), recuo: true })),
                        { nome: r.nSaidas === 1 ? "Saídas (1 lançamento)" : `Saídas (${r.nSaidas} lançamentos)`, valor: brl(r.saiu), forte: true },
                      ]} />
                    </>
                  )}
                </section>
              ) : (
                <section>
                  <h2 className="g-pa-t">Entradas e saídas</h2>
                  <p className="g-pa-nota">As entradas e saídas de um caixa fechado saem para o dono e para quem cuida do financeiro.</p>
                </section>
              )}
            </div>

            <section>
              <h2 className="g-pa-t">Para conferir</h2>
              <Pares linhas={[
                { nome: "Atendimentos concluídos sem conta fechada (na hora da impressão)", valor: paraCobrar.n ? `${paraCobrar.n} · ${brl(paraCobrar.total)}` : "nenhum" },
                { nome: "Alterações em valores enquanto este caixa esteve aberto", valor: dados!.alteracoes ? String(dados!.alteracoes) : "nenhuma" },
              ]} />
              {(paraCobrar.n > 0 || dados!.alteracoes > 0) && <p className="g-pa-nota">{paraCobrar.n > 0 ? "Os atendimentos para cobrar não entraram no caixa: feche a conta deles em Caixa, Atendimentos para cobrar. " : ""}{dados!.alteracoes > 0 ? (fin ? "Cada alteração está em Alterações em valores, na tela Hoje." : "O dono vê cada alteração em Alterações em valores.") : ""}</p>}
              {caixa.obs && <p className="g-pa-nota" style={{ color: "#1f1b17" }}><b>Observação:</b> {caixa.obs}</p>}
            </section>

            {comMovimentos && lancVisiveis.length > 0 && (
              <section className="g-imp-dia">
                <h2 className="g-pa-t">Lançamentos deste caixa<small>{lancVisiveis.length}</small></h2>
                <table>
                  <thead><tr><th>Hora</th><th>Descrição</th><th>Forma</th><th className="num">Entrou</th><th className="num">Saiu</th></tr></thead>
                  <tbody>
                    {lancVisiveis.map((l) => {
                      const entrada = l.tipo === "entrada" ? l.movimento !== "sangria" : l.movimento === "suprimento";
                      const valor = Number(l.valor) - (l.tipo === "entrada" ? creditoDaEntrada(l) : 0);
                      return (
                        <tr key={l.id}>
                          <td className="hora" style={{ fontSize: ".8125rem" }}>{hora(quandoPagou(l))}</td>
                          <td>{l.movimento ? [nomeDoMovimento(l.movimento), l.descricao].filter(Boolean).join(": ") : [l.descricao, resumoDeItens(l)].filter(Boolean).join(" · ") || "Lançamento"}{!l.movimento && <small>{categoriaAtual(l.categoria, petshop)}</small>}</td>
                          <td>{l.movimento ? "Dinheiro" : textoDoPagamento(l)}</td>
                          <td className="num">{entrada ? brl(valor) : ""}</td>
                          <td className="num">{entrada ? "" : brl(valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            )}

            <div className="g-pa-assina"><span>Fechado por</span><span>Conferido por</span></div>
          </>
        )}
      </Papel>
    </div>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><FechamentoNoPapel /></Suspense>;
}
