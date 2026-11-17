"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { conferirCaixa } from "@/lib/gestao/dinheiro";
import { contaDaTroca, devolver, lerDevolvivel, resta, valorQueVolta, type LinhaDevolvivel, type ModoDevolucao } from "@/lib/gestao/devolucao";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { brl, dataCompleta } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { avisarMudanca, Esqueleto, Folha, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { BuscaProduto, novaChave, useProdutosDaLoja, type ItemConta } from "./conta";
import { AvisoCaixaFechado, CampoDinheiro, ChipsForma, fmtQtd, lerQtd, PerguntaParcelas, useAnotarParcelas, useCaixaAberto, type Forma } from "./pecas";
import { EscolherTutor, type Tutor } from "./venda";
import "./orcamento.css";

/**
 * Troca e devolução de uma venda paga (migração 20261200, `venda_devolver`): escolhe o que volta e quanto, marca o que voltou
 * avariado (vira perda) e escolhe: devolver o dinheiro, deixar de crédito para o tutor ou trocar por outro produto (a diferença
 * é cobrada ou volta). Tudo numa gravação só; dois toques fazem uma vez. Abre do Financeiro, do Caixa e da ficha do cliente.
 */
export type VendaParaDevolver = { id: string; data: string; valor: number; descricao?: string | null; cliente_id?: string | null };

const MODOS: { id: ModoDevolucao; rotulo: string }[] = [
  { id: "dinheiro", rotulo: "Devolver dinheiro" }, { id: "credito", rotulo: "Deixar de crédito" }, { id: "troca", rotulo: "Trocar por outro" },
];
const centavos = (n: number) => Math.round(n * 100) / 100;

function CampoNumero({ valor, aoMudar, max, rotulo }: { valor: number; aoMudar: (n: number) => void; max: number; rotulo: string }) {
  const [texto, setTexto] = useState(fmtQtd(valor));
  const por = (n: number) => { const v = Math.max(0, Math.min(max, Math.round(n * 1000) / 1000)); setTexto(fmtQtd(v)); aoMudar(v); };
  return (
    <span className="g-vd-qtd">
      <button type="button" onClick={() => por(valor - 1)} disabled={valor <= 0} aria-label={`Menos um: ${rotulo}`}>−</button>
      <input className="g-tab" inputMode="decimal" value={texto} aria-label={rotulo}
        onChange={(e) => { setTexto(e.target.value); const n = lerQtd(e.target.value); if (n != null) aoMudar(Math.max(0, Math.min(max, n))); }}
        onBlur={() => setTexto(fmtQtd(Math.max(0, Math.min(max, valor))))} />
      <button type="button" onClick={() => por(valor + 1)} disabled={valor >= max} aria-label={`Mais um: ${rotulo}`}>+</button>
    </span>
  );
}

export default function FolhaDevolucao({ venda, aoFechar, aoPronto }: { venda: VendaParaDevolver; aoFechar: () => void; aoPronto?: () => void }) {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const op = useOperacao();
  const caixa = useCaixaAberto();
  const { produtos, carregando, erro: erroProd } = useProdutosDaLoja();
  const { dados: linhas, erro } = useDados(() => lerDevolvivel(sb, petshop.id, venda.id), [petshop.id, venda.id]);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [avariados, setAvariados] = useState<Record<string, number>>({});
  const [modo, setModo] = useState<ModoDevolucao>("dinheiro");
  const [forma, setForma] = useState<Forma | null>(null);
  // troca em que o cliente paga a diferença no crédito: em quantas vezes (a taxa do parcelado)
  const [parcelas, setParcelas] = useState<number | null>(null);
  const anotarParcelas = useAnotarParcelas();
  const [resto, setResto] = useState<"dinheiro" | "credito">("dinheiro");
  const [novos, setNovos] = useState<ItemConta[]>([]);
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [erroForma, setErroForma] = useState<string | null>(null);

  const voltam = (linhas ?? []).filter((l) => (qtd[l.produto_id] ?? 0) > 0);
  const volta = centavos(voltam.reduce((t, l) => t + valorQueVolta(l, qtd[l.produto_id]), 0));
  const leva = centavos(novos.reduce((t, i) => t + centavos(i.qtd * (i.valor ?? 0)), 0));
  const troca = contaDaTroca(volta, leva);
  const temTutor = Boolean(venda.cliente_id || tutor);
  const precisaTutor = modo === "credito" || (modo === "troca" && troca.devolver > 0 && resto === "credito");
  const mexeNoDinheiro = modo === "dinheiro" || (modo === "troca" && (troca.cobrar > 0 || (troca.devolver > 0 && resto === "dinheiro")));

  const gravar = () => op.fazer(async (chave) => {
    if (somenteLeitura()) return false;
    if (!voltam.length) { avisarErro("Escolha o que volta e quantos."); return false; }
    if (modo === "troca" && !novos.some((i) => i.qtd > 0)) { avisarErro("Escolha o produto que o cliente leva."); return false; }
    if (precisaTutor && !temTutor) { avisarErro("Para deixar de crédito, diga de quem é a compra."); return false; }
    if (mexeNoDinheiro && !forma) { setErroForma(modo === "troca" && troca.cobrar > 0 ? "Escolha como o cliente paga a diferença." : "Escolha como o dinheiro volta."); return false; }
    if (mexeNoDinheiro && !(await conferirCaixa(sb, petshop.id, confirmar))) return false;
    try {
      const r = await devolver(sb, petshop.id, {
        venda: venda.id, chave, modo, forma: mexeNoDinheiro ? forma : null, resto: modo === "troca" ? resto : null, cliente: tutor?.id ?? null,
        itens: voltam.map((l) => ({ produto_id: l.produto_id, qtd: qtd[l.produto_id], avariados: Math.min(avariados[l.produto_id] ?? 0, qtd[l.produto_id]) })),
        novos: modo === "troca" ? novos.filter((i) => i.qtd > 0 && i.produtoId).map((i) => ({ produto_id: i.produtoId!, qtd: i.qtd, ...(cuidoDoFinanceiro ? { valor: i.valor } : {}) })) : null,
      });
      const d = Number(r.diferenca ?? 0);
      const parcelasDaTroca = modo === "troca" && d > 0 && forma === "credito" ? parcelas : null;
      avisar(modo === "dinheiro" ? `Devolução anotada: ${brl(r.valor)} voltaram para o cliente.`
        : modo === "credito" ? `Ficaram ${brl(r.valor)} de crédito para o tutor.`
        : d > 0 ? `Troca feita: o cliente pagou ${brl(d)} de diferença.` : d < 0 ? `Troca feita: ${brl(-d)} ${resto === "credito" ? "ficaram de crédito" : "voltaram para o cliente"}.` : "Troca feita, sem diferença.");
      // a venda nova da troca leva a diferença no crédito: anota em quantas vezes (tenta de novo e avisa se não der)
      if (parcelasDaTroca) await anotarParcelas([r.entrada_id], parcelasDaTroca);
      avisarMudanca();
      aoPronto?.();
      aoFechar();
      return true;
    } catch (e) { avisarErro(e); return false; }
  });

  const rotuloBotao = modo === "dinheiro" ? `Devolver ${brl(volta)}` : modo === "credito" ? `Deixar ${brl(volta)} de crédito`
    : troca.cobrar > 0 ? `Trocar e receber ${brl(troca.cobrar)}` : troca.devolver > 0 ? `Trocar e ${resto === "credito" ? "deixar" : "devolver"} ${brl(troca.devolver)}` : "Fazer a troca";

  return (
    <Folha larga titulo="Troca ou devolução" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" disabled={op.ocupado || !voltam.length || (modo === "troca" && !leva)} onClick={() => void gravar()}>{op.ocupado ? "Anotando…" : rotuloBotao}</button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-pp">Venda de {dataCompleta(venda.data)} · {brl(venda.valor)}{venda.descricao ? ` · ${venda.descricao}` : ""}</p>
        {erro ? <p className="g-vermelho-t">{erro}</p> : !linhas ? <Esqueleto linhas={2} /> : !linhas.length ? <p className="g-muted">Esta venda não tem produto para trocar ou devolver.</p> : (
          <div className="g-card liso g-vd-itens">
            {linhas.map((l: LinhaDevolvivel) => {
              const max = resta(l), q = qtd[l.produto_id] ?? 0;
              return (
                <div key={l.produto_id} className="g-orc-volta">
                  <span className="t">
                    <b>{l.nome}</b>
                    <span>{`vendeu ${fmtQtd(l.vendido)} por ${brl(l.pago)}`}{l.devolvido > 0 ? ` · já voltaram ${fmtQtd(l.devolvido)}` : ""}</span>
                  </span>
                  <b className="g-vd-soma g-tab">{q > 0 ? brl(valorQueVolta(l, q)) : "–"}</b>
                  <div className="ctrl">
                    {max > 0 ? <>
                      <span className="g-pp">Volta</span>
                      <CampoNumero valor={q} max={max} rotulo={`Quantos ${l.nome} voltam`} aoMudar={(n) => setQtd((x) => ({ ...x, [l.produto_id]: n }))} />
                      {q > 0 && <>
                        <span className="g-pp">Avariado</span>
                        <CampoNumero valor={Math.min(avariados[l.produto_id] ?? 0, q)} max={q} rotulo={`Quantos ${l.nome} voltaram avariados`} aoMudar={(n) => setAvariados((x) => ({ ...x, [l.produto_id]: n }))} />
                      </>}
                    </> : <span className="g-pp g-muted">Tudo deste produto já voltou.</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {voltam.some((l) => (avariados[l.produto_id] ?? 0) > 0) && <p className="g-muted g-pp">O avariado não volta para a prateleira: fica anotado como perda.</p>}

        <div className="g-seg gf-seg-cheio" role="group" aria-label="O que fazer">
          {MODOS.map((m) => <button key={m.id} type="button" aria-pressed={modo === m.id} onClick={() => { setModo(m.id); setErroForma(null); }}>{m.rotulo}</button>)}
        </div>

        {modo === "troca" && (
          <>
            <BuscaProduto produtos={produtos} carregando={carregando} erro={erroProd} itens={novos}
              aoEscolher={(p) => setNovos((l) => (l.some((i) => i.produtoId === p.id) ? l.map((i) => (i.produtoId === p.id ? { ...i, qtd: i.qtd + 1 } : i))
                : [...l, { chave: novaChave(), tipo: "produto", nome: p.nome, qtd: 1, valor: p.preco_venda == null ? null : Number(p.preco_venda), produtoId: p.id, unidade: p.unidade }]))} />
            {novos.length > 0 && (
              <div className="g-card liso g-vd-itens">
                {novos.map((i) => (
                  <div key={i.chave} className="g-orc-volta">
                    <span className="t"><b>{i.nome}</b><span>leva</span></span>
                    <b className="g-vd-soma g-tab">{brl(centavos(i.qtd * (i.valor ?? 0)))}</b>
                    <div className="ctrl">
                      <CampoNumero valor={i.qtd} max={9999} rotulo={`Quantos ${i.nome} leva`} aoMudar={(n) => setNovos((l) => l.map((x) => (x.chave === i.chave ? { ...x, qtd: n } : x)))} />
                      {cuidoDoFinanceiro
                        ? <label className="g-vd-preco"><span>cada</span><CampoDinheiro valor={i.valor} aoMudar={(v) => setNovos((l) => l.map((x) => (x.chave === i.chave ? { ...x, valor: v } : x)))} /></label>
                        : <span className="g-vd-preco"><span>cada</span><b className="g-tab">{i.valor == null ? "sem preço" : brl(i.valor)}</b></span>}
                      <button type="button" className="g-ico" onClick={() => setNovos((l) => l.filter((x) => x.chave !== i.chave))} aria-label={`Tirar ${i.nome} da troca`}><Trash2 /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {precisaTutor && !venda.cliente_id && <EscolherTutor valor={tutor} aoMudar={setTutor} />}

        {modo === "troca" && leva > 0 && troca.devolver > 0 && (
          <div className="g-seg" role="group" aria-label="A diferença">
            <button type="button" aria-pressed={resto === "dinheiro"} onClick={() => setResto("dinheiro")}>Devolver {brl(troca.devolver)}</button>
            <button type="button" aria-pressed={resto === "credito"} onClick={() => setResto("credito")}>Deixar de crédito</button>
          </div>
        )}
        {mexeNoDinheiro && (
          <div className="g-pilha p">
            <p className="g-pp"><b>{modo === "troca" && troca.cobrar > 0 ? "Como o cliente paga a diferença" : "Como o dinheiro volta"}</b></p>
            <ChipsForma valor={forma} aoMudar={(f) => { setForma(f); setErroForma(null); }} erro={erroForma} />
            {modo === "troca" && troca.cobrar > 0 && <PerguntaParcelas forma={forma} valor={parcelas} aoMudar={setParcelas} />}
          </div>
        )}
        {mexeNoDinheiro && <AvisoCaixaFechado aberto={caixa} />}

        <div className="g-vd-total" role="status">
          <div>
            <span className="g-rotulo">{modo === "troca" ? (troca.cobrar > 0 ? "Cliente paga" : troca.devolver > 0 ? (resto === "credito" ? "Fica de crédito" : "Volta para o cliente") : "Diferença") : modo === "credito" ? "Fica de crédito" : "Volta para o cliente"}</span>
            <p className="g-num">{brl(modo === "troca" ? (troca.cobrar || troca.devolver) : volta)}</p>
          </div>
          {modo === "troca" && <div className="g-vd-contas g-tab"><span>Volta {brl(volta)}</span><span>Leva {brl(leva)}</span></div>}
        </div>
        <p className="g-muted g-pp">O que volta entra no estoque na hora. Nos relatórios, a devolução sai do faturamento e a comissão sobre o produto acompanha.</p>
      </div>
    </Folha>
  );
}
