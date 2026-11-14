"use client";

import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { brl, dataAmigavel, hora } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Folha, useDados } from "../ui";
import "./financeiro.css";

/** Uma alteração em valor recebido ou em preço de venda, feita por outra pessoa (função `alteracoes_de_valores`). */
export type AlteracaoDeValor = {
  id: string; tipo: string; quando: string; quem_nome: string | null; descricao: string; de: number | null; para: number | null; abaixo_do_custo: boolean; nova: boolean;
};

/** "Bia mudou o preço de Ração 15 kg: de R$ 189,90 para R$ 1,00 (abaixo do custo)". */
export function fraseDaAlteracao(x: AlteracaoDeValor): string {
  const quem = x.quem_nome?.split(" ")[0] ?? "Alguém da equipe";
  const de = x.de == null ? "" : brl(x.de), para = x.para == null ? "" : brl(x.para);
  if (x.tipo === "apagou") return `${quem} apagou um valor recebido: ${x.descricao}${de ? ` (${de})` : ""}`;
  if (x.tipo === "preco") return `${quem} vendeu ${x.descricao} por ${para}${de ? `: o preço da lista é ${de}` : ""}${x.abaixo_do_custo ? " (abaixo do custo)" : ""}`;
  if (x.tipo === "desconto") return `${quem} deu desconto de ${brl(Math.max(0, Number(x.de ?? 0) - Number(x.para ?? 0)))} em ${x.descricao}: de ${de} para ${para}`;
  return x.de != null && x.para != null && Number(x.de) !== Number(x.para)
    ? `${quem} alterou um valor recebido: ${x.descricao}, de ${de} para ${para}`
    : `${quem} alterou um valor recebido (forma de pagamento ou dia): ${x.descricao}${para ? `, ${para}` : ""}`;
}

/**
 * Aviso discreto na tela Hoje do dono (e de quem cuida do financeiro): "3 alterações em valores recebidos".
 * Conta o que OUTRAS pessoas alteraram ou apagaram em dinheiro já recebido, e os preços mudados ou descontos dados na venda,
 * desde a última vez que esta pessoa abriu a lista. Abrir a lista marca como visto. Sem nada novo, não aparece.
 */
export default function AlteracoesDeValores() {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const [aberta, setAberta] = useState(false);
  const [todas, setTodas] = useState(false);
  const { dados, recarregar } = useDados(async () => {
    if (!cuidoDoFinanceiro) return [] as AlteracaoDeValor[];
    const r = await sb.rpc("alteracoes_de_valores", { p: petshop.id, p_todas: todas });
    // banco ainda sem a função (atualização a caminho): não mostra nada
    if (r.error) return [];
    return (r.data ?? []) as AlteracaoDeValor[];
  }, [petshop.id, cuidoDoFinanceiro, todas]);
  // o que estava novo quando a lista abriu continua marcado enquanto ela está aberta
  const [vistas, setVistas] = useState<AlteracaoDeValor[] | null>(null);
  const novas = (dados ?? []).filter((x) => x.nova);
  if (!cuidoDoFinanceiro || (!aberta && !novas.length)) return null;

  async function abrir() {
    setVistas(novas);
    setAberta(true);
    await sb.rpc("alteracoes_marcar_vistas", { p: petshop.id });
  }
  function fechar() { setAberta(false); setTodas(false); setVistas(null); void recarregar(); }

  const lista = todas ? dados ?? [] : vistas ?? novas;
  const idsNovos = new Set((vistas ?? novas).map((x) => x.id));
  const n = novas.length;
  return (
    <>
      {!aberta && (
        <button type="button" className="g-hoje-casa solta gf-alt-aviso" onClick={() => void abrir()}>
          <History aria-hidden />
          <span>{n === 1 ? "1 alteração em valores recebidos ou em preços" : `${n} alterações em valores recebidos ou em preços`} desde a última vez que você olhou. Toque para ver.</span>
          <ChevronRight aria-hidden />
        </button>
      )}
      {aberta && (
        <Folha titulo="Alterações em valores" aoFechar={fechar} rodape={<button type="button" className="g-btn sec" onClick={fechar}>Fechar</button>}>
          <div className="g-pilha">
            <p className="g-muted g-p">O que outras pessoas da equipe alteraram ou apagaram em dinheiro já recebido, e as vendas com preço diferente da lista ou com desconto. O que você mesmo fez não entra aqui.</p>
            {lista.length ? (
              <ul className="gf-alt-lista">
                {lista.map((x) => (
                  <li key={x.id} className={idsNovos.has(x.id) ? "nova" : undefined}>
                    <span>{fraseDaAlteracao(x)}.</span>
                    <small className="g-muted">{dataAmigavel(x.quando)} às {hora(x.quando)}{idsNovos.has(x.id) && todas ? " · nova" : ""}</small>
                  </li>
                ))}
              </ul>
            ) : <p className="g-muted g-p">Nenhuma alteração nos últimos 60 dias.</p>}
            {!todas && <div><button type="button" className="g-btn fantasma p" onClick={() => setTodas(true)}>Ver também as que já vi (últimos 60 dias)</button></div>}
            <p className="g-muted g-pp">O valor de antes e quem mudou também ficam no próprio lançamento, em Caixa e em Financeiro. Os valores apagados aparecem em Apagados deste caixa. Tudo isso vai junto na cópia de segurança.</p>
          </div>
        </Folha>
      )}
    </>
  );
}
