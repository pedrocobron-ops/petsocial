"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { CHAVE_MODO_SIMPLES, TEXTO_MODO_SIMPLES, modoSimples } from "@/lib/gestao/modo-simples";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";

/** Meu pet shop, O negócio: liga e desliga o modo simples (`geral.modo_simples`). Só o dono grava. */
export default function ModoSimples() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const ligado = modoSimples(petshop);
  const [salvando, setSalvando] = useState(false);

  async function trocar() {
    if (salvando || somenteLeitura()) return;
    setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, { [CHAVE_MODO_SIMPLES]: !ligado });
      await recarregarBase();
      avisarMudanca();
      avisar(ligado ? "Modo simples desligado: o menu e as telas mostram tudo de novo." : "Modo simples ligado. O que saiu do menu está em Outras áreas.");
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha" id="modo-simples">
      <div className="g-mp-t">
        <Tile icone={Sparkles} tom="manteiga" />
        <div><h2>Modo simples</h2><p className="g-muted g-p">Para quem está começando. {TEXTO_MODO_SIMPLES} Desligue quando quiser ver tudo.</p></div>
        <button type="button" role="switch" aria-checked={ligado} aria-label="Modo simples" className="g-mp-chave" disabled={salvando} onClick={() => void trocar()}><i /></button>
      </div>
    </section>
  );
}
