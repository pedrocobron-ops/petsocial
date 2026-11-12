"use client";

import { useState } from "react";
import { BedDouble, Minus, Plus, Users } from "lucide-react";
import { vagasDe } from "@/lib/gestao/agenda";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { Campo, CampoValor, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "../ui";

/** Banho e tosa: quantos pets ao mesmo tempo (`petshops.vagas`). Antes só dava para mudar pelo guia inicial. */
export function VagasBanho() {
  const { sb, petshop, equipe, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const atual = vagasDe(petshop, equipe);
  const [vagas, setVagas] = useState(atual);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (somenteLeitura() || salvando) return;
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({ vagas }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(vagas === 1 ? "Salvo: 1 pet por horário." : `Salvo: até ${vagas} pets no mesmo horário.`);
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha">
      <div className="g-mp-t"><Tile icone={Users} tom="lilas" /><div><h2>Banho e tosa: pets ao mesmo tempo</h2><p className="g-muted g-p">Quantos pets vocês atendem no mesmo horário.</p></div></div>
      <div className="gj-conta-linha">
        <div className="gj-conta" role="group" aria-label="Pets ao mesmo tempo">
          <button type="button" className="g-ico" aria-label="Menos" disabled={vagas <= 1} onClick={() => setVagas(Math.max(1, vagas - 1))}><Minus /></button>
          <b className="g-num" aria-live="polite">{vagas}</b>
          <button type="button" className="g-ico" aria-label="Mais" disabled={vagas >= 20} onClick={() => setVagas(Math.min(20, vagas + 1))}><Plus /></button>
        </div>
        <p className="g-muted g-p">{vagas === 1 ? "Cada horário aceita um pet só." : `O mesmo horário aceita até ${vagas} pets.`} Conte as mesas ou banheiras, não só as pessoas. Vale para a agenda, o link do cliente e o Mozart.</p>
      </div>
      <div><button className="g-btn verde" onClick={() => void salvar()} disabled={salvando || (vagas === atual && petshop.vagas != null)}>{salvando ? "Salvando…" : "Salvar"}</button></div>
    </section>
  );
}

const lerVagas = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isInteger(n) ? n : NaN; };

/** Creche e hotel: preço fixo da diária e número de vagas de cada um. */
export function AjustesCrecheHotel() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [diariaCreche, setDiariaCreche] = useState<number | null>(petshop.diaria_creche == null ? null : Number(petshop.diaria_creche));
  const [diariaHotel, setDiariaHotel] = useState<number | null>(petshop.diaria_hotel == null ? null : Number(petshop.diaria_hotel));
  const [vagasCreche, setVagasCreche] = useState(petshop.vagas_creche == null ? "" : String(petshop.vagas_creche));
  const [vagasHotel, setVagasHotel] = useState(petshop.vagas_hotel == null ? "" : String(petshop.vagas_hotel));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (somenteLeitura() || salvando) return;
    const vc = lerVagas(vagasCreche), vh = lerVagas(vagasHotel);
    if ([diariaCreche, diariaHotel].some((v) => v != null && (v < 0 || v > 99999))) return setErro("Confira o preço da diária: não pode ser negativo.");
    if ([vc, vh].some((v) => v != null && (Number.isNaN(v) || v < 1 || v > 500))) return setErro("As vagas ficam entre 1 e 500. Deixe em branco se não quiser limite.");
    setErro(null);
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({ diaria_creche: diariaCreche, diaria_hotel: diariaHotel, vagas_creche: vc, vagas_hotel: vh }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar("Creche e hotel salvos.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <form className="g-card g-form" onSubmit={salvar}>
      <div className="g-mp-t"><Tile icone={BedDouble} tom="ceu" /><div><h2>Creche e hotel</h2><p className="g-muted g-p">O preço da diária já vem preenchido no check-in e na reserva. As vagas avisam quando a casa enche.</p></div></div>
      <div className="dupla">
        <Campo rotulo="Diária da creche" dica="Por dia."><CampoValor valor={diariaCreche} aoMudar={setDiariaCreche} /></Campo>
        <Campo rotulo="Diária do hotel" dica="Por noite."><CampoValor valor={diariaHotel} aoMudar={setDiariaHotel} /></Campo>
      </div>
      <div className="dupla">
        <Campo rotulo="Vagas da creche" dica="Pets por dia.">
          <input className="g-input g-tab" inputMode="numeric" placeholder="Sem limite" value={vagasCreche} onChange={(e) => setVagasCreche(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </Campo>
        <Campo rotulo="Vagas do hotel" dica="Pets por noite.">
          <input className="g-input g-tab" inputMode="numeric" placeholder="Sem limite" value={vagasHotel} onChange={(e) => setVagasHotel(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        </Campo>
      </div>
      <p className="g-muted g-pp">
        Em branco, a diária fica para digitar a cada estadia e a casa não tem limite de vagas.
        {petshop.diaria_creche != null || petshop.diaria_hotel != null ? ` Hoje: ${[petshop.diaria_creche != null && `creche ${brl(petshop.diaria_creche)}`, petshop.diaria_hotel != null && `hotel ${brl(petshop.diaria_hotel)}`].filter(Boolean).join(" e ")}.` : ""}
        {" "}Quando a casa enche, o sistema avisa e pede confirmação antes de passar do limite.
      </p>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div><button className="g-btn verde" disabled={salvando}>{salvando ? "Salvando…" : "Salvar creche e hotel"}</button></div>
    </form>
  );
}
