"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";
import { conferirCaixa } from "@/lib/gestao/dinheiro";
import { receberSinaisJuntos, listaDeNomes, type GrupoDeSinal } from "@/lib/gestao/sinal-junto";
import { casoDoErro } from "@/lib/gestao/tudo-ou-nada";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { brl, centavos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Folha, useAvisos } from "../ui";
import { AvisoCaixaFechado, EscolhaPagamento, fecharPagamento, pagamentoInicial, ParcelasNaTela, useAnotarParcelas, useCaixaAberto, type EstadoPagamento } from "../loja/pecas";

/** A linha do grupo na aba Reservas: "Thor e Mel · sinal R$ 69,65" e o botão para receber junto. */
export function LinhaSinalJunto({ grupo, aoReceber }: { grupo: GrupoDeSinal; aoReceber: () => void }) {
  return (
    <div className="g-ht-junto" role="group" aria-label={`Sinal de ${grupo.nomes}`}>
      <span className="t"><b>{grupo.nomes} · sinal {brl(grupo.total)}</b><small>{grupo.tutor ? `${grupo.tutor} · ` : ""}reservas do mesmo tutor, chegada no mesmo dia</small></span>
      <button type="button" className="g-btn sec p" onClick={aoReceber}><HandCoins /> Receber junto</button>
    </div>
  );
}

/**
 * Receber o sinal de reservas ligadas com um pagamento só (um Pix para os dois pets). Cada sinal fica pago na reserva dele,
 * tudo numa operação: se um dos sinais mudou em outra tela, nada é lançado.
 */
export function FolhaSinalJunto({ grupo, aoFechar, aoGravar }: { grupo: GrupoDeSinal; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [marcados, setMarcados] = useState<string[]>(() => grupo.itens.map((x) => x.estadiaId));
  const [pagamento, setPagamento] = useState<EstadoPagamento>(() => pagamentoInicial());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const caixa = useCaixaAberto();
  const itens = grupo.itens.filter((x) => marcados.includes(x.estadiaId));
  const total = centavos(itens.reduce((t, x) => t + x.falta, 0));
  const nomes = listaDeNomes(itens.map((x) => x.pet));

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  const anotarParcelas = useAnotarParcelas();
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando) return;
    setErro(null);
    if (!itens.length) return setErro("Marque ao menos um sinal.");
    const pg = fecharPagamento(pagamento, total);
    if ("erro" in pg) return setErro(pagamento.dividido ? pg.erro : "Escolha como o tutor pagou o sinal.");
    if (!(await conferirCaixa(sb, petshop.id, confirmar))) return;
    setSalvando(true);
    try {
      await receberSinaisJuntos(sb, petshop.id, itens, pg, chave);
      avisar(`Sinal de ${nomes} recebido: ${brl(total)}.`);
      // cada sinal é recebido inteiro: a conta de cada um virou paga (crédito parcelado: em quantas vezes)
      await anotarParcelas(itens.map((x) => x.contaId), pagamento.parcelas);
      aoGravar();
    } catch (x) {
      setSalvando(false);
      if (casoDoErro(x) === "maestro:conta_mudou") { avisar("Um destes sinais foi recebido ou mudou em outra tela. Nada foi lançado: atualizei a lista."); aoGravar(); return; }
      // nada ficou pela metade; a mesma chave na nova tentativa não recebe duas vezes
      avisarErro(x); return false;
    }
  }

  return (
    <Folha titulo={`Receber o sinal de ${grupo.nomes}`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando || !itens.length}>{salvando ? "Salvando…" : `Receber ${brl(total)}`}</button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">Um pagamento só para as reservas {grupo.tutor ? `de ${grupo.tutor}` : "do mesmo tutor"}. Cada reserva fica com o sinal dela pago, e tudo entra no caixa de hoje.</p>
        <div className="g-campo">
          <span>Sinais a receber</span>
          <div className="g-ht-marcar">
            {grupo.itens.map((x) => {
              const on = marcados.includes(x.estadiaId);
              return (
                <label key={x.estadiaId} className={on ? "on" : ""}>
                  <input type="checkbox" checked={on} onChange={(ev) => { setErro(null); setMarcados((l) => (ev.target.checked ? [...l, x.estadiaId] : l.filter((i) => i !== x.estadiaId))); }} />
                  <span className="t"><b>{x.pet}</b><small>{x.falta < x.sinal ? `sinal de ${brl(x.sinal)}, falta ${brl(x.falta)}` : "sinal da reserva"}</small></span>
                  <b className="v">{brl(x.falta)}</b>
                </label>
              );
            })}
          </div>
        </div>
        <div className="g-card areia"><b className="g-tab">Total: {brl(total)}</b>{itens.length > 0 && itens.length < grupo.itens.length && <p className="g-muted g-p">Só {nomes}. O outro sinal continua em A receber.</p>}</div>
        <ParcelasNaTela.Provider value>
          <EscolhaPagamento valor={pagamento} aoMudar={(p) => { setPagamento(p); setErro(null); }} total={total} rotulo="Como o tutor pagou" erro={erro} />
        </ParcelasNaTela.Provider>
        <AvisoCaixaFechado aberto={caixa} />
      </div>
    </Folha>
  );
}
