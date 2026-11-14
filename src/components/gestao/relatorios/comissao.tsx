"use client";

import { useEffect, useState } from "react";
import { Check, HandCoins } from "lucide-react";
import { opcoesDeComissao } from "@/lib/gestao/dinheiro-opcoes";
import { FORMAS } from "@/lib/gestao/tipos";
import { useOperacao } from "@/lib/gestao/uma-vez";
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
/** Diferença que ficou sem pagar num período que já teve pagamento (ex.: pagou até hoje cedo e a pessoa atendeu mais à tarde). */
type Pendencia = { profissional_id: string; nome: string; de: string; ate: string; comissao: number; pago: number; falta: number };
/** O que a folha de pagar precisa saber: de quem, de que datas, quanto, e se é a diferença de um período já pago. */
type APagar = { profissional_id: string; nome: string; de: string; ate: string; valor: number; comissao: number; jaPago: number; apoio?: string };
const real = (n: number) => Math.round(n * 100) / 100;

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
  const [pagando, setPagando] = useState<APagar | null>(null);
  const { dados, erro, recarregar } = useDados(async () => {
    const [c, p, pend] = await Promise.all([
      sb.rpc("comissao_do_periodo", { p_petshop: petshop.id, p_de: de, p_ate: ate }),
      sb.from("comissoes_pagas").select("id, profissional_id, de, ate, valor, lancamento_id, pago_em").eq("petshop_id", petshop.id).lte("de", ate).gte("ate", de).order("de").order("pago_em"),
      sb.rpc("comissao_pendencias", { p_petshop: petshop.id }),
    ]);
    if (c.error) throw new Error(c.error.message);
    if (p.error) throw new Error(p.error.message);
    const linhas: LinhaComissao[] = (c.data ?? []).map((x) => ({
      ...x, pct: Number(x.pct), base: Number(x.base), base_produtos: Number(x.base_produtos),
      comissao_servicos: Number(x.comissao_servicos), comissao_produtos: Number(x.comissao_produtos), comissao: Number(x.comissao),
    }));
    const pendencias: Pendencia[] = (pend.data ?? []).map((x) => ({ ...x, comissao: Number(x.comissao), pago: Number(x.pago), falta: Number(x.falta) }));
    return { linhas, pagas: (p.data ?? []) as Paga[], pendencias };
  }, [petshop.id, de, ate, JSON.stringify(op)]);
  useEffect(() => { aoCalcular?.(dados?.linhas ?? null); }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps

  const linhas = dados?.linhas ?? [];
  const total = Math.round(linhas.reduce((s, c) => s + c.comissao, 0) * 100) / 100;
  const maior = linhas[0]?.comissao ?? 0;

  async function desfazer(c: LinhaComissao, g: Paga) {
    if (somenteLeitura()) return;
    const sim = await confirmar({
      titulo: "Desfazer o pagamento desta comissão?",
      texto: `A saída de ${brl(g.valor)} (comissão de ${c.nome}, ${dataCurta(g.de)} a ${dataCurta(g.ate)}) é apagada do financeiro e esse valor volta a ficar sem pagamento. Os outros pagamentos do período, se houver, continuam. Fica anotado quem apagou.`,
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
            const exata = dele.length === 1 && dele[0].de === de && dele[0].ate === ate;
            // pagamentos inteiros dentro das datas escolhidas descontam da comissão; um que passa da borda não dá para descontar
            const dentro = dele.filter((g) => g.de >= de && g.ate <= ate), passam = dele.filter((g) => !(g.de >= de && g.ate <= ate));
            const pago = real(dentro.reduce((t, g) => t + Number(g.valor), 0));
            const falta = real(c.comissao - pago);
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
                  {passam.length > 0 ? (
                    <span className="g-muted">Um pagamento passa das datas escolhidas. Para ver o que falta, escolha um período que inclua esse pagamento inteiro.</span>
                  ) : pago > 0 && falta > 0 ? (
                    <span className="g-fila" style={{ gap: 8 }}>
                      <span className="g-tag laranja">falta pagar {brl(falta)}</span>
                      <span className="g-muted">a comissão subiu para {brl(c.comissao)} depois do pagamento</span>
                      {ate <= hoje && <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setPagando({ profissional_id: c.profissional_id, nome: c.nome, de, ate, valor: falta, comissao: c.comissao, jaPago: pago }); }}>Pagar a diferença</button>}
                    </span>
                  ) : pago > 0 && falta < 0 ? (
                    <span className="g-muted">Foi pago {brl(-falta)} a mais do que a conta de agora ({brl(c.comissao)}): algum atendimento ou conta mudou depois do pagamento.</span>
                  ) : !dele.length && c.comissao > 0 ? (ate <= hoje
                    ? <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setPagando({ profissional_id: c.profissional_id, nome: c.nome, de, ate, valor: c.comissao, comissao: c.comissao, jaPago: 0, apoio: `${atendimentos(c.atendimentos)} · base ${brl(c.base)}${c.comissao_produtos > 0 ? ` · produtos ${brl(c.comissao_produtos)}` : ""}` }); }}>Marcar como paga</button>
                    : <span className="g-muted">Este período ainda não terminou. Para pagar o que já foi feito, escolha Personalizado com datas até hoje: o que a pessoa ganhar depois aparece como diferença a pagar.</span>) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className="g-muted g-p">Ninguém da equipe tem comissão definida. A porcentagem de cada pessoa fica no cadastro da equipe.</p>}
      {(() => {
        // diferenças de períodos já pagos que não aparecem nas linhas acima (o período escolhido não cobre aquele pagamento inteiro)
        // (com o período ainda aberto, a linha mostra o que falta mas não paga: o botão fica aqui, no período que foi pago)
        const outras = (dados?.pendencias ?? []).filter((x) => !(x.de >= de && x.ate <= ate && ate <= hoje));
        if (!outras.length) return null;
        return (
          <div className="g-aviso amarelo gr-com-pend" role="status">
            <b>Ficou diferença em período que já foi pago</b>
            {outras.map((x) => (
              <span key={`${x.profissional_id}-${x.de}`} className="g-fila" style={{ gap: 8 }}>
                <span>{x.nome}, de {dataCurta(x.de)} a {dataCurta(x.ate)}: a comissão ficou em {brl(x.comissao)}, foi pago {brl(x.pago)}. <b>Falta {brl(x.falta)}.</b></span>
                <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setPagando({ profissional_id: x.profissional_id, nome: x.nome, de: x.de, ate: x.ate, valor: x.falta, comissao: x.comissao, jaPago: x.pago }); }}>Pagar a diferença</button>
              </span>
            ))}
            <small className="g-muted">Acontece quando a comissão é paga e, depois, entra mais um atendimento (ou uma conta muda) dentro das mesmas datas.</small>
          </div>
        );
      })()}
      <p className="g-muted g-pp" style={{ marginTop: 10 }}>
        A base é o valor cobrado pelo serviço nos atendimentos concluídos de cada profissional, já com o desconto
        {op.extras ? " (os extras da conta entram; produto fica de fora da base)" : " (produto e extra ficam de fora)"}.
        {" "}Atendimento pago com pacote conta pelo preço do serviço na agenda; o que ainda está sem conta fechada, também.
        {" "}Conta que o cliente ficou de pagar depois entra pelo valor cobrado, mesmo antes de o dinheiro entrar, e mesmo recebida em partes.
        {op.porServico ? " O percentual é o do serviço, quando ele tem um; nos outros, o da pessoa." : ""}
        {op.produtos ? ` Produto vendido na conta de um atendimento rende ${op.produtosPct.toLocaleString("pt-BR")}% para quem atendeu.` : ""}
        {" "}Marcar como paga lança uma saída na categoria Comissão e guarda o período: o mesmo valor não é pago duas vezes. Se a pessoa ganhar mais dentro de um período já pago, aparece o que falta e dá para pagar só a diferença. As regras ficam em Meu pet shop, Opções de cobrança.
      </p>
      {pagando && <FolhaPagar pagar={pagando} aoFechar={() => setPagando(null)} aoPago={recarregar} />}
    </section>
  );
}

function FolhaPagar({ pagar: x, aoFechar, aoPago }: { pagar: APagar; aoFechar: () => void; aoPago: () => Promise<void> }) {
  const { sb } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [forma, setForma] = useState<Forma | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const diferenca = x.jaPago > 0;

  // trava na hora do primeiro toque; o banco também recusa a mesma chave duas vezes
  const op = useOperacao();
  const pagar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando) return;
    if (!forma) { setErro("Escolha como pagou."); return; }
    setSalvando(true);
    try {
      const r = await sb.rpc("comissao_pagar", { p_profissional: x.profissional_id, p_de: x.de, p_ate: x.ate, p_forma: forma, p_valor: x.valor, p_chave: chave });
      if (r.error) throw new Error(r.error.message);
      avisar(diferenca ? `Diferença da comissão de ${x.nome} paga: ${brl(x.valor)}.` : `Comissão de ${x.nome} marcada como paga: ${brl(x.valor)}.`);
      avisarMudanca();
      await aoPago();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      await aoPago();
      setSalvando(false);
      return false;
    }
  }

  return (
    <Folha titulo={diferenca ? `Pagar a diferença de ${x.nome}` : `Pagar a comissão de ${x.nome}`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void pagar()} disabled={salvando || op.ocupado}>{salvando ? "Anotando…" : `Marcar ${brl(x.valor)} como pago`}</button>
      </>}>
      <div className="g-form">
        <div className="g-card areia">
          <LinhaResumo nome={`Comissão de ${dataCompleta(x.de)} a ${dataCompleta(x.ate)}`} valor={brl(x.comissao)} forte={!diferenca} />
          {diferenca && <LinhaResumo nome="Já pago deste período" valor={`− ${brl(x.jaPago)}`} />}
          {diferenca && <LinhaResumo nome="Falta pagar" valor={brl(x.valor)} forte />}
          {x.apoio && <p className="g-muted g-pp">{x.apoio}</p>}
        </div>
        <Grupo rotulo="Como pagou">
          <Chips opcoes={FORMAS} valor={forma} aoMudar={(f) => { setForma(f); setErro(null); }} rotulo="Forma de pagamento" />
          {erro && <small className="erro" role="alert">{erro}</small>}
        </Grupo>
        <p className="g-muted g-pp">
          Entra uma saída de {brl(x.valor)} com a data de hoje, na categoria Comissão (no caixa aberto, se houver; em dinheiro, sai da conta da gaveta).
          {diferenca ? " Cada pagamento fica guardado separado: dá para desfazer só este, sem mexer no anterior." : " O período fica guardado como pago, para ninguém pagar de novo."}
        </p>
      </div>
    </Folha>
  );
}
