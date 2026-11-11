"use client";

import { useMemo, useState } from "react";
import { Lock, Store } from "lucide-react";
import { MOTIVOS_BLOQUEIO, bloqueioPega, diasUteis } from "@/lib/gestao/agenda";
import { dataCurta, deIsoDia, isoDia, juntaDiaHora, nomeDiaCurto, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Campo, Folha, avisarMudanca, ok, useAvisos } from "../ui";
import "@/app/(gestao)/gestao/app/agenda/agenda.css";

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Bloqueia um período da agenda (almoço, folga, feriado). Um registro por dia. */
export default function FormBloqueio({ diaInicial, profissionalInicial, aoFechar, aoSalvar }: {
  diaInicial?: string; profissionalInicial?: string | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { sb, petshop, equipe, user } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const quemAtende = equipe.filter((p) => p.ativo && p.atende);

  const [dia, setDia] = useState(diaInicial ?? isoDia(new Date()));
  const [inteiro, setInteiro] = useState(false);
  const [de, setDe] = useState("12:00");
  const [ate, setAte] = useState("13:00");
  const [profId, setProfId] = useState<string | null>(profissionalInicial ?? null);
  const [motivo, setMotivo] = useState("Almoço");
  const [repete, setRepete] = useState(false);
  const [semanas, setSemanas] = useState(4);
  const [salvando, setSalvando] = useState(false);

  const diaOk = RE_DIA.test(dia);
  const dias = useMemo(() => (repete && diaOk ? diasUteis(dia, semanas, petshop.horario) : [dia]), [repete, diaOk, dia, semanas, petshop.horario]);
  const diasDaSemana = useMemo(() => {
    const nomes: string[] = [];
    for (const d of dias.slice(0, 14)) { const n = nomeDiaCurto(deIsoDia(d)); if (!nomes.includes(n)) nomes.push(n); }
    const ordem = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
    return nomes.sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)).join(", ");
  }, [dias]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!diaOk) { avisar("Escolha o dia."); return; }
    if (!inteiro && (!de || !ate || ate <= de)) { avisar("O fim precisa ser depois do início."); return; }
    setSalvando(true);
    try {
      const linhas = dias.map((d) => {
        const inicio = inteiro ? deIsoDia(d) : juntaDiaHora(d, de);
        const fim = inteiro ? somaDias(deIsoDia(d), 1) : juntaDiaHora(d, ate);
        return { petshop_id: petshop.id, profissional_id: profId, inicio: inicio.toISOString(), fim: fim.toISOString(), motivo: motivo.trim() || null, criado_por: user.id };
      });
      ok(await sb.from("bloqueios").insert(linhas).select("id"));
      // quem já estava marcado nesse período continua marcado: só avisa
      let marcados = 0;
      const { data: ags } = await sb.from("agendamentos").select("inicio, fim, profissional_id, status").eq("petshop_id", petshop.id)
        .gte("inicio", somaDias(deIsoDia(dias[0]), -1).toISOString()).lt("inicio", somaDias(deIsoDia(dias[dias.length - 1]), 1).toISOString());
      for (const a of ags ?? []) {
        if (["cancelado", "faltou"].includes(a.status) || (profId && a.profissional_id !== profId)) continue;
        if (linhas.some((l) => bloqueioPega({ inicio: l.inicio, fim: l.fim, profissional_id: null }, null, new Date(a.inicio).getTime(), new Date(a.fim).getTime()))) marcados++;
      }
      const feito = linhas.length === 1 ? "Horário bloqueado." : `${linhas.length} bloqueios criados.`;
      avisar(marcados ? `${feito} ${marcados === 1 ? "Já havia 1 horário marcado" : `Já havia ${marcados} horários marcados`} nesse período.` : feito);
      avisarMudanca();
      aoSalvar();
    } catch (err) { avisarErro(err); }
    setSalvando(false);
  }

  return (
    <Folha titulo="Bloquear horário" aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-bloqueio" disabled={salvando}><Lock />{salvando ? "Salvando…" : "Bloquear"}</button></>}>
      <form id="form-bloqueio" className="g-form" onSubmit={salvar}>
        <p className="g-muted g-p">Ninguém marca nesse período sem ser avisado. Serve para almoço, folga, feriado ou manutenção.</p>

        <Campo rotulo="Dia"><input className="g-input" type="date" required value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
        <label className="g-check"><input type="checkbox" checked={inteiro} onChange={(e) => setInteiro(e.target.checked)} /> Dia inteiro</label>
        {!inteiro && (
          <div className="dupla">
            <Campo rotulo="De"><input className="g-input" type="time" required step={300} value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
            <Campo rotulo="Até"><input className="g-input" type="time" required step={300} value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
          </div>
        )}

        <div className="g-campo"><span>Para quem</span>
          <div className="g-chips">
            <button type="button" className="g-chip" aria-pressed={profId === null} onClick={() => setProfId(null)}><Store size={15} />Pet shop inteiro</button>
            {quemAtende.map((p) => <button key={p.id} type="button" className="g-chip" aria-pressed={profId === p.id} onClick={() => setProfId(p.id)}><i style={{ background: p.cor }} />{p.nome.split(" ")[0]}</button>)}
          </div>
        </div>

        <div className="g-campo"><span>Motivo</span>
          <div className="g-chips">
            {MOTIVOS_BLOQUEIO.map((m) => <button key={m} type="button" className="g-chip" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>)}
          </div>
          <input className="g-input" value={motivo} maxLength={80} onChange={(e) => setMotivo(e.target.value)} placeholder="Ou escreva o motivo" aria-label="Motivo" />
        </div>

        <div className="g-agd-rep">
          <label className="g-check"><input type="checkbox" checked={repete} onChange={(e) => setRepete(e.target.checked)} /> Repetir nos próximos dias úteis</label>
          {repete && (
            <>
              <Campo rotulo="Por quantas semanas">
                <select className="g-select" value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}>
                  {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n === 1 ? "1 semana" : `${n} semanas`}</option>)}
                </select>
              </Campo>
              {diaOk && (
                <p className="g-pp g-muted">
                  {dias.length} {dias.length === 1 ? "dia" : "dias"} ({diasDaSemana}), de {dataCurta(dias[0])} até {dataCurta(dias[dias.length - 1])}. Um bloqueio por dia.
                </p>
              )}
            </>
          )}
        </div>
      </form>
    </Folha>
  );
}
