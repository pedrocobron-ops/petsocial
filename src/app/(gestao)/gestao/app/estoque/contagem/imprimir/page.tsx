"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, ok, useDados, Vazio } from "@/components/gestao/ui";
import { CabecalhoDoPapel, ControlesDoPapel, Pares, Papel, useTituloDoPapel } from "@/components/gestao/papel";
import { fmtQtd } from "@/components/gestao/loja/pecas";
import { lerContagem, totaisDaContagem } from "@/lib/gestao/contagem";
import { brl, dataCurta, hora } from "@/lib/gestao/util";

/**
 * A contagem de estoque no papel: cada produto com o saldo do sistema, o contado e a diferença (com o valor para quem vê o
 * financeiro). Contagem em andamento sai com o "Contado" em branco para quem ainda não contou: serve de folha para contar à mão.
 */
const sinal = (n: number) => (n > 0 ? `+${fmtQtd(n)}` : n < 0 ? `−${fmtQtd(-n)}` : "0");
const sinalBrl = (n: number) => (n > 0 ? `+${brl(n)}` : n < 0 ? `−${brl(-n)}` : brl(0));

function Folha() {
  const { sb, petshop, posso } = useGestao();
  const id = useSearchParams().get("id") ?? "";
  const { dados: c, carregando, erro } = useDados(async () => (id && posso("estoque") ? lerContagem(ok(await sb.rpc("contagem_ler", { p_contagem: id }))) : null), [id]);
  useTituloDoPapel(c ? `${c.nome} · ${petshop.nome}` : `Contagem de estoque · ${petshop.nome}`);
  if (!posso("estoque")) return <Vazio titulo="A contagem de estoque é com quem cuida do estoque." />;
  const t = c ? totaisDaContagem(c.itens) : null;
  const fechada = c?.status === "concluida";
  return (
    <div className="g-imp">
      <ControlesDoPapel voltar={id ? `/gestao/app/estoque/contagem?id=${id}` : "/gestao/app/estoque/contagem"} rotuloVoltar="Voltar para a contagem"
        dica={c && !fechada ? "Em andamento: quem ainda não foi contado sai com o espaço em branco, para contar à mão." : undefined} />
      <Papel pe="Contagem de estoque">
        <CabecalhoDoPapel titulo={c?.nome ?? "Contagem de estoque"}
          apoio={c ? `Começou em ${dataCurta(c.criado_em)} às ${hora(c.criado_em)}${c.criado_por_nome ? ` por ${c.criado_por_nome}` : ""}${c.concluida_em ? ` · estoque ajustado em ${dataCurta(c.concluida_em)} às ${hora(c.concluida_em)}${c.concluida_por_nome ? ` por ${c.concluida_por_nome}` : ""}` : c.status === "cancelada" ? " · cancelada" : " · em andamento"}` : undefined} />
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {carregando && !c ? <Esqueleto linhas={6} /> : !c || !t ? <p className="g-pa-vazio">Contagem não encontrada.</p> : (
          <>
            <Pares linhas={[
              { nome: "Produtos contados", valor: `${t.contados} de ${t.total}` },
              { nome: "Com diferença", valor: String(t.comDiferenca) },
              (t.sobra > 0 || t.falta > 0) && { nome: "Sobra / falta (unidades)", valor: `${fmtQtd(t.sobra)} / ${fmtQtd(t.falta)}` },
              c.com_valor && { nome: "Diferença a preço de custo", valor: sinalBrl(fechada && c.diferenca_valor != null ? c.diferenca_valor : t.valor), forte: true },
            ]} />
            <table className="g-pa-tab">
              <thead><tr><th>Produto</th><th className="pa-num">Sistema</th><th className="pa-num">Contado</th><th className="pa-num">Diferença</th>{c.com_valor && <th className="pa-num">Valor</th>}</tr></thead>
              <tbody>
                {c.itens.map((i) => (
                  <tr key={i.produto_id}>
                    <td>{i.nome}<small>{[i.categoria, i.unidade].filter(Boolean).join(" · ")}</small></td>
                    <td className="pa-num">{fmtQtd(i.esperado ?? i.ajustado_de ?? i.saldo)}</td>
                    <td className="pa-num">{i.contado == null ? (fechada ? "não contado" : "______") : fmtQtd(i.contado)}</td>
                    <td className="pa-num">{i.diferenca == null ? "" : sinal(i.diferenca)}</td>
                    {c.com_valor && <td className="pa-num">{i.valor == null ? "" : sinalBrl(i.valor)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Papel>
    </div>
  );
}

export default function ImprimirContagem() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><Folha /></Suspense>;
}
