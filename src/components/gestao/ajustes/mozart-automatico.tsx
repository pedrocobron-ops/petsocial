"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { opcao, salvarOpcoes } from "@/lib/gestao/opcoes";
import { CHAVE_AUTOMATICO_EQUIPE } from "@/lib/gestao/assistente/automatico";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";

/**
 * Meu pet shop, O negócio: "Permitir modo automático para a equipe" (`mozart.automatico_equipe`, padrão desligado). Só o dono
 * grava. O dono sempre pode ligar o automático para si, nos ajustes do Mozart. Desligar aqui para na hora o automático de
 * quem é da equipe (o banco confere a cada pedido).
 */
export default function MozartAutomatico() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const ligado = opcao(petshop, CHAVE_AUTOMATICO_EQUIPE, false);
  const [salvando, setSalvando] = useState(false);

  async function trocar() {
    if (salvando || somenteLeitura()) return;
    setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, { [CHAVE_AUTOMATICO_EQUIPE]: !ligado });
      await recarregarBase();
      avisarMudanca();
      avisar(ligado ? "A equipe volta a confirmar cada ação no cartão." : "Quem é da equipe pode ligar o automático nos ajustes do Mozart.");
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha" id="mozart-automatico">
      <div className="g-mp-t">
        <Tile icone={Zap} tom="pessego" />
        <div>
          <h2>Permitir modo automático para a equipe</h2>
          <p className="g-muted g-p">No automático, o Mozart faz na hora, sem o cartão de confirmação, e cada ação tem Desfazer. Você liga o seu nos ajustes do Mozart. Com isto ligado, cada pessoa da equipe também pode ligar o dela.</p>
        </div>
        <button type="button" role="switch" aria-checked={ligado} aria-label="Permitir modo automático para a equipe" className="g-mp-chave" disabled={salvando} onClick={() => void trocar()}><i /></button>
      </div>
    </section>
  );
}
