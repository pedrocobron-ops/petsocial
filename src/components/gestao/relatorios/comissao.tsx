"use client";

import { useEffect, useState } from "react";
import { Check, HandCoins } from "lucide-react";
import { opcoesDeComissao } from "@/lib/gestao/dinheiro-opcoes";
import { FORMAS } from "@/lib/gestao/tipos";
import { brl, dataCompleta, dataCurta, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Chips, Grupo, LinhaResumo } from "../financeiro/comum";
import { Tile } from "../painel";
import { AvatarPessoa, avisarMudanca, Folha, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "../financeiro/recebimentos.css";

/** A comissão de uma pessoa no período, como o banco calcula (a mesma conta de "Minha comissão"). */
export type LinhaComissao = {
  profissional_id: string; nome: string; cor: string | null; ativo: boolean; pct: number; atendimentos: number; com_pacote: number;
  base: number; base_produtos: number; comissao_servicos: number; comissao_produtos: number; comissao: number;
};
type Paga = { id: string; profissional_id: string; de: string; ate: string; valor: number; lancamento_id: string; pago_em: string };
type Forma = (typeof FORMAS)[number]["id"];

const atendimentos = (n: number) => (n === 1 ? "1 atendimento" : `${n} atendimentos`);

/**
 * Bloco "Comissão por profissional" dos Relatórios: a conta do período, pelas regras do pet shop,
 * e o botão de marcar a comissão de cada pessoa como paga (lança a despesa e guarda o período, para não pagar duas vezes).
 */
export default function BlocoComissao({ de, ate, aoCalcular }: { de: string; ate: string; aoCalcular?: (linhas: LinhaComissao[] | null) => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const op = opcoesDeComissao(petshop);
  const hoje = isoDia(new Date());
  const [pagando, setPagando] = useState<LinhaComissao | null>(null);
  const { dados, erro, recarregar } = useDados(async () => {
    const [c, p] = await Promise.all([
      sb.rpc("comissao_do_periodo", { p_petshop: petshop.id, p_de: de, p_ate: ate }),
      sb.from("comissoes_pagas").select("id, profissional_id, de, ate, valor, lancamento_id, pago_em").eq("petshop_id", petshop.id).lte("de", ate).gte("ate", de).order("de"),
    ]);
    if (c.error) throw new Error(c.error.message);
    if (p.error) throw new Error(p.error.message);
    const linhas: LinhaComissao[] = (c.data ?? []).map((x) => ({
      ...x, pct: Number(x.pct), base: Number(x.base), base_produtos: Number(x.base_produtos),
      comissao_servicos: Number(x.comissao_servicos), comissao_produtos: Number(x.comissao_produtos), comissao: Number(x.comissao),
    }));
    return { linhas, pagas: (p.data ?? []) as Paga[] };
  }, [petshop.id, de, ate, JSON.stringify(op)]);
  useEffect(() => { aoCalcular?.(dados?.linhas ?? null); }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhas = dados?.linhas ?? [];
  const total = Math.round(linhas.reduce((s, c) => s + c.comissao, 0) * 100) / 100;
  const maior = linhas[0]?.comissao ?? 0;

  async function desfazer(c: LinhaComissao, g: Paga) {
    if (somenteLeitura()) return;
    const sim = await confirmar({
      titulo: "Desfazer o pagamento desta comissão?",
      texto: `A saída de ${brl(g.valor)} (comissão de ${c.nome}, ${dataCurta(g.de)} a ${dataCurta(g.ate)}) é apagada do financeiro e o período volta a ficar sem pagamento. Fica anotado quem apagou.`,
      confirmar: "Desfazer pagamento", perigo: true,
    });
    if (!sim) return;
    try {
      const r = await sb.from("lancamentos").delete().eq("id", g.lancamento_id).eq("petshop_id", petshop.id).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw new Error("Não deu para desfazer. Atualize a tela.");
      avisar("Pagamento desfeito.");
      avisarMudanca();
    } catch (e) { avisarErro(e); }
    await recarregar();
  }

  return (
    <section className="g-card">
      <div className="g-card-t">
        <h3><Tile icone={HandCoins} tom="menta" tamanho="p" />Comissão por profissional</h3>
        {linhas.length > 0 && <b className="g-tab">{brl(total)}</b>}
      </div>
      {erro ? <p className="g-muted g-p">{erro}</p> : !dados ? <p className="g-muted g-p">Calculando…</p> : linhas.length ? (
        <div>
          {linhas.map((c) => {
            const dele = dados.pagas.filter((g) => g.profissional_id === c.profissional_id);
            const exata = dele.find((g) => g.de === de && g.ate === ate);
            return (
              <div key={c.profissional_id} className="gr-com-linha">
                <div className="gr-com-topo g-rel-com">
                  <AvatarPessoa nome={c.nome} cor={c.cor ?? undefined} />
                  <span className="t">
                    <b>{c.nome}</b>
                    <span>
                      {atendimentos(c.atendimentos)}{c.com_pacote > 0 ? ` (${c.com_pacote} com pacote)` : ""} · base {brl(c.base)}
                      {op.porServico ? ` · serviços ${brl(c.comissao_servicos)}` : ` · ${c.pct.toLocaleString("pt-BR")}%`}
                      {op.produtos && c.base_produtos > 0 ? ` · produtos ${brl(c.base_produtos)} = ${brl(c.comissao_produtos)}` : ""}
                    </span>
                    {total > 0 && maior > 0 && <span className="g-prog"><i style={{ width: `${(c.comissao / maior) * 100}%`, background: c.cor ?? undefined }} /></span>}
                  </span>
                  <span className="d"><b>{brl(c.comissao)}</b></span>
                </div>
                <div className="gr-com-pe">
                  {dele.map((g) => (
                    <span key={g.id} className="g-fila" style={{ gap: 8 }}>
                      <span className="g-tag verde"><Check size={12} aria-hidden /> paga {brl(g.valor)} em {dataCurta(g.pago_em)}</span>
                      {!exata && <span className="g-muted">período de {dataCurta(g.de)} a {dataCurta(g.ate)}</span>}
                      <button type="button" className="g-btn fantasma p" onClick={() => void desfazer(c, g)}>Desfazer</button>
                    </span>
                  ))}
                  {!dele.length && c.comissao > 0 && (ate <= hoje
                    ? <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setPagando(c); }}>Marcar como paga</button>
                    : <span className="g-muted">Dá para marcar como paga quando o período terminar.</span>)}
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="g-muted g-p">Ninguém da equipe tem comissão definida. A porcentagem de cada pessoa fica no cadastro da equipe.</p>}
      <p className="g-muted g-pp" style={{ marginTop: 10 }}>
        A base é o valor cobrado pelo serviço nos atendimentos concluídos de cada profissional, já com o desconto
        {op.extras ? " (os extras da conta entram; produto fica de fora da base)" : " (produto e extra ficam de fora)"}.
        {" "}Atendimento pago com pacote conta pelo preço do serviço na agenda; o que ainda está sem conta fechada, também.
        {" "}Conta que o cliente ficou de pagar depois entra pelo valor cobrado, mesmo antes de o dinheiro entrar, e mesmo recebida em partes.
        {op.porServico ? " O percentual é o do serviço, quando ele tem um; nos outros, o da pessoa." : ""}
        {op.produtos ? ` Produto vendido na conta de um atendimento rende ${op.produtosPct.toLocaleString("pt-BR")}% para quem atendeu.` : ""}
        {" "}Marcar como paga lança uma saída na categoria Comissão e guarda o período: o mesmo período não é pago duas vezes. As regras ficam em Meu pet shop, Opções de cobrança.
      </p>
      {pagando && <FolhaPagar linha={pagando} de={de} ate={ate} aoFechar={() => setPagando(null)} aoPago={recarregar} />}
    </section>
  );
}

function FolhaPagar({ linha, de, ate, aoFechar, aoPago }: { linha: LinhaComissao; de: string; ate: string; aoFechar: () => void; aoPago: () => Promise<void> }) {
  const { sb } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [forma, setForma] = useState<Forma | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function pagar() {
    if (salvando) return;
    if (!forma) { setErro("Escolha como pagou."); return; }
    setSalvando(true);
    try {
      const r = await sb.rpc("comissao_pagar", { p_profissional: linha.profissional_id, p_de: de, p_ate: ate, p_forma: forma, p_valor: linha.comissao });
      if (r.error) throw new Error(r.error.message);
      avisar(`Comissão de ${linha.nome} marcada como paga: ${brl(linha.comissao)}.`);
      avisarMudanca();
      await aoPago();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      await aoPago();
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={`Pagar a comissão de ${linha.nome}`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void pagar()} disabled={salvando}>{salvando ? "Anotando…" : `Marcar ${brl(linha.comissao)} como pago`}</button>
      </>}>
      <div className="g-form">
        <div className="g-card areia">
          <LinhaResumo nome={`Comissão de ${dataCompleta(de)} a ${dataCompleta(ate)}`} valor={brl(linha.comissao)} forte />
          <p className="g-muted g-pp">{atendimentos(linha.atendimentos)} · base {brl(linha.base)}{linha.comissao_produtos > 0 ? ` · produtos ${brl(linha.comissao_produtos)}` : ""}</p>
        </div>
        <Grupo rotulo="Como pagou">
          <Chips opcoes={FORMAS} valor={forma} aoMudar={(f) => { setForma(f); setErro(null); }} rotulo="Forma de pagamento" />
          {erro && <small className="erro" role="alert">{erro}</small>}
        </Grupo>
        <p className="g-muted g-pp">
          Entra uma saída de {brl(linha.comissao)} com a data de hoje, na categoria Comissão (no caixa aberto, se houver; em dinheiro, sai da conta da gaveta).
          O período fica guardado como pago, para ninguém pagar de novo.
        </p>
      </div>
    </Folha>
  );
}
