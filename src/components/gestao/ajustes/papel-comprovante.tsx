"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { OPCAO_PAPEL_COMPROVANTE, PAPEIS_DO_COMPROVANTE, papelDoComprovante, type PapelDoComprovante } from "@/lib/gestao/comprovante-papel";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";

/**
 * Meu pet shop, Cobrança: em que papel o comprovante impresso sai (`comprovante.papel`). Folha comum é o padrão de sempre;
 * bobina de 80 ou 58 mm é para a impressora térmica do balcão. Só o dono grava.
 */
export default function PapelDoComprovante() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const atual = papelDoComprovante(petshop);
  const [salvando, setSalvando] = useState(false);

  async function escolher(papel: PapelDoComprovante) {
    if (papel === atual || salvando || somenteLeitura()) return;
    setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, { [OPCAO_PAPEL_COMPROVANTE]: papel });
      await recarregarBase();
      avisarMudanca();
      avisar(papel === "a4" ? "O comprovante volta a sair em folha comum." : `O comprovante agora sai para bobina de ${papel} mm.`);
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha" id="papel-do-comprovante">
      <div className="g-mp-t">
        <Tile icone={Printer} tom="menta" />
        <div><h2>Papel do comprovante</h2><p className="g-muted g-p">Em que papel o comprovante sai quando você toca em Imprimir. Na bobina a letra é menor, os valores ficam alinhados à direita e tudo sai em preto.</p></div>
      </div>
      <div className="g-chips" role="group" aria-label="Papel do comprovante">
        {PAPEIS_DO_COMPROVANTE.map((p) => (
          <button key={p.id} type="button" className="g-chip" aria-pressed={atual === p.id} disabled={salvando} title={p.apoio} onClick={() => void escolher(p.id)}>{p.nome}</button>
        ))}
      </div>
      <p className="g-muted g-pp">Na janela de impressão do computador, escolha a impressora térmica e o papel do mesmo tamanho. O comprovante mandado pelo WhatsApp não muda.</p>
    </section>
  );
}
