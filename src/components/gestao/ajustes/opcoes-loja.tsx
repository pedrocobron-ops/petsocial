"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { OPCOES_DA_LOJA, type ChaveDaLoja } from "@/lib/gestao/loja-opcoes";
import { opcao, salvarOpcoes } from "@/lib/gestao/opcoes";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";
import "../loja/loja.css";

/**
 * Opções da loja: margem e custo médio, código de barras e fornecedores. Cada uma é uma chave que o dono liga se usar.
 * Tudo começa desligado. Aparece em Meu pet shop e no botão "Opções" do Estoque (`solto`: sem o cartão em volta).
 */
export default function OpcoesDaLoja({ solto }: { solto?: boolean }) {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [mudando, setMudando] = useState<ChaveDaLoja | null>(null);

  async function mudar(chave: ChaveDaLoja, rotulo: string, ligar: boolean) {
    if (mudando || somenteLeitura()) return;
    setMudando(chave);
    try {
      await salvarOpcoes(sb, petshop.id, { [chave]: ligar });
      await recarregarBase();
      avisarMudanca();
      avisar(`${rotulo}: ${ligar ? "ligado" : "desligado"}.`);
    } catch (e) { avisarErro(e); } finally { setMudando(null); }
  }

  const corpo = (
    <>
      <p className="g-muted g-p">Ligue só o que a sua loja usa. Tudo começa desligado e, desligado, o estoque funciona como sempre funcionou. Dá para ligar e desligar quando quiser: nada é apagado.</p>
      <div className="g-lj-opcoes">
        {OPCOES_DA_LOJA.map((o) => {
          const ligada = opcao(petshop, o.chave, false);
          return (
            <div key={o.chave} className="g-lj-opcao">
              <div>
                <b id={`op-${o.chave}`}>{o.rotulo}</b>
                <p className="g-muted g-p">{o.texto}</p>
              </div>
              <button type="button" role="switch" aria-checked={ligada} aria-labelledby={`op-${o.chave}`} className="g-lj-chave"
                disabled={!souDono || mudando !== null} onClick={() => void mudar(o.chave, o.rotulo, !ligada)}><i /></button>
            </div>
          );
        })}
      </div>
      {!souDono && <p className="g-muted g-pp">Só o dono liga ou desliga estas opções.</p>}
    </>
  );

  if (solto) return <div className="g-pilha">{corpo}</div>;
  return (
    <section className="g-card g-pilha">
      <div className="g-mp-t">
        <Tile icone={SlidersHorizontal} tom="rosa" />
        <div><h2>Opções da loja</h2></div>
      </div>
      {corpo}
    </section>
  );
}
