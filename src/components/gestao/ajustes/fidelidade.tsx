"use client";

import { useState } from "react";
import { Gift, Minus, Plus } from "lucide-react";
import { FIDELIDADE_MAX, FIDELIDADE_MIN, FIDELIDADE_PREMIO_MAX, programaDe } from "@/lib/gestao/fidelidade";
import { dataCompleta, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { Campo, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "../ui";

/** Fidelidade: a cada N atendimentos concluídos, o tutor ganha um prêmio. Conta do dia em que foi ligado em diante. */
export default function AjusteFidelidade() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const programa = programaDe(petshop);
  const [cada, setCada] = useState(petshop.fidelidade_cada ?? 10);
  const [premio, setPremio] = useState(petshop.fidelidade_premio ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const texto = premio.trim().replace(/\s+/g, " ");
  const mudou = !!programa && (cada !== programa.cada || texto !== programa.premio);

  async function gravar(campos: { fidelidade_cada?: number; fidelidade_premio?: string; fidelidade_desde?: string | null }, aviso: string) {
    setOcupado(true);
    try {
      const linhas = ok(await sb.from("petshops").update(campos).eq("id", petshop.id).select("id"));
      if (!linhas.length) throw new Error("Não consegui salvar. Só o dono muda a fidelidade.");
      await recarregarBase();
      avisarMudanca();
      avisar(aviso);
    } catch (x) { avisarErro(x); } finally { setOcupado(false); }
  }

  function conferir() {
    if (!texto) { setErro("Escreva o prêmio que o tutor ganha."); return false; }
    setErro(null);
    return true;
  }

  async function ligar() {
    if (somenteLeitura() || ocupado || !conferir()) return;
    await gravar({ fidelidade_cada: cada, fidelidade_premio: texto, fidelidade_desde: isoDia(new Date()) }, "Fidelidade ligada. A contagem começa hoje.");
  }

  async function desligar() {
    if (somenteLeitura() || ocupado) return;
    const sim = await confirmar({
      titulo: "Desligar a fidelidade?",
      texto: "A contagem some das fichas e da agenda. Se ligar de novo, ela recomeça do zero, a partir do dia em que ligar.",
      confirmar: "Desligar", perigo: true,
    });
    if (sim) await gravar({ fidelidade_desde: null }, "Fidelidade desligada.");
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!programa) return void ligar();
    if (somenteLeitura() || ocupado || !conferir()) return;
    await gravar({ fidelidade_cada: cada, fidelidade_premio: texto }, "Fidelidade salva.");
  }

  return (
    <section className="g-card g-pilha">
      <div className="g-mp-t">
        <Tile icone={Gift} tom="lilas" />
        <div><h2>Fidelidade</h2><p className="g-muted g-p">A cada tantos atendimentos concluídos, o tutor ganha um prêmio.</p></div>
        <button type="button" role="switch" aria-checked={!!programa} aria-label="Programa de fidelidade" className="g-mp-chave" disabled={ocupado} onClick={() => void (programa ? desligar() : ligar())}><i /></button>
      </div>
      <form className="g-form" onSubmit={salvar}>
        <div className="g-campo">
          <span>A cada quantos atendimentos</span>
          <div className="gj-conta-linha">
            <div className="gj-conta" role="group" aria-label="Atendimentos para ganhar o prêmio">
              <button type="button" className="g-ico" aria-label="Menos" disabled={cada <= FIDELIDADE_MIN} onClick={() => setCada(Math.max(FIDELIDADE_MIN, cada - 1))}><Minus /></button>
              <b className="g-num" aria-live="polite">{cada}</b>
              <button type="button" className="g-ico" aria-label="Mais" disabled={cada >= FIDELIDADE_MAX} onClick={() => setCada(Math.min(FIDELIDADE_MAX, cada + 1))}><Plus /></button>
            </div>
            <p className="g-muted g-p">A cada {cada} atendimentos concluídos, o tutor ganha {texto || "o prêmio que você escrever"}. Vale a soma de todos os pets dele.</p>
          </div>
        </div>
        <Campo rotulo="Prêmio" dica="Escreva do seu jeito. O sistema só conta e avisa na hora: quem entrega é você.">
          <input className="g-input" value={premio} maxLength={FIDELIDADE_PREMIO_MAX} placeholder="Ex.: um banho" onChange={(e) => { setPremio(e.target.value); setErro(null); }} />
        </Campo>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {programa
          ? <p className="g-muted g-pp">Contando desde {dataCompleta(programa.desde)}. Mudar o número ou o prêmio não mexe nos prêmios já entregues.</p>
          : <p className="g-mp-link-off">A fidelidade está desligada. Ao ligar, a contagem começa no mesmo dia: atendimentos de antes não entram.</p>}
        <div>
          {programa
            ? <button className="g-btn verde" disabled={ocupado || !mudou}>{ocupado ? "Salvando…" : "Salvar"}</button>
            : <button className="g-btn verde" disabled={ocupado}>{ocupado ? "Ligando…" : "Ligar a fidelidade"}</button>}
        </div>
      </form>
    </section>
  );
}
