"use client";

import { useMemo, useState } from "react";
import { Check, Lock, Repeat, Store, Trash2 } from "lucide-react";
import type { Bloqueio } from "@/lib/gestao/tipos";
import { MOTIVOS_BLOQUEIO, bloqueioPega, diasUteis } from "@/lib/gestao/agenda";
import { dataCurta, deIsoDia, hora, horarioDoDia, inicioDoDia, isoDia, juntaDiaHora, nomeDiaCurto, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Campo, Folha, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "@/app/(gestao)/gestao/app/agenda/agenda.css";

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

type Alcance = "este" | "proximos";

/**
 * Bloqueia um período da agenda (almoço, folga, feriado). Um registro por dia; os que nascem juntos (repetição)
 * levam o mesmo `serie_id`. Com `bloqueio`, edita ou remove: se ele faz parte de uma repetição, pergunta se a
 * mudança vale só para ele ou para ele e os próximos.
 */
export default function FormBloqueio({ bloqueio, diaInicial, profissionalInicial, aoFechar, aoSalvar }: {
  bloqueio?: Bloqueio; diaInicial?: string; profissionalInicial?: string | null; aoFechar: () => void; aoSalvar: () => void;
}) {
  const { sb, petshop, equipe, user } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const quemAtende = equipe.filter((p) => p.ativo && p.atende);

  // edição: o bloqueio é de um dia só; "dia inteiro" vai da meia-noite até a meia-noite seguinte
  const ini = bloqueio ? new Date(bloqueio.inicio) : null, fimB = bloqueio ? new Date(bloqueio.fim) : null;
  const eraInteiro = Boolean(ini && fimB && ini.getTime() === inicioDoDia(ini).getTime() && fimB.getTime() >= somaDias(inicioDoDia(ini), 1).getTime());

  const [dia, setDia] = useState(ini ? isoDia(ini) : diaInicial ?? isoDia(new Date()));
  const [inteiro, setInteiro] = useState(eraInteiro);
  const [de, setDe] = useState(ini && !eraInteiro ? hora(ini) : "12:00");
  const [ate, setAte] = useState(fimB && !eraInteiro ? hora(fimB) : "13:00");
  const [profId, setProfId] = useState<string | null>(bloqueio ? bloqueio.profissional_id : profissionalInicial ?? null);
  const [motivo, setMotivo] = useState(bloqueio ? bloqueio.motivo ?? "" : "Almoço");
  const [repete, setRepete] = useState(false);
  const [semanas, setSemanas] = useState(4);
  const [salvando, setSalvando] = useState(false);
  const [pergunta, setPergunta] = useState<"salvar" | "remover" | null>(null);

  // quantos bloqueios da mesma repetição vêm depois deste
  const serieId = bloqueio?.serie_id ?? null;
  const { dados: aFrente } = useDados(async () => {
    if (!bloqueio || !serieId) return 0;
    return ok(await sb.from("bloqueios").select("id").eq("petshop_id", petshop.id).eq("serie_id", serieId).gte("inicio", bloqueio.inicio).neq("id", bloqueio.id)).length;
  }, [bloqueio?.id]);
  const perguntar = Boolean(serieId) && aFrente !== 0;

  const diaOk = RE_DIA.test(dia);
  // repetição: só os dias em que o pet shop abre e, em cada um, só o trecho que cai dentro do expediente daquele dia.
  // O primeiro dia entra sempre do jeito que foi escrito (foi a pessoa que escolheu).
  const temHorario = useMemo(() => Array.from({ length: 7 }, (_, i) => horarioDoDia(petshop.horario, new Date(2024, 0, 7 + i))).some(Boolean), [petshop.horario]);
  const plano = useMemo(() => {
    const todos = repete && diaOk ? diasUteis(dia, semanas, petshop.horario) : [dia];
    const usados: { dia: string; de: string; ate: string }[] = [];
    let fora = 0;
    todos.forEach((d, i) => {
      const h = i > 0 && !inteiro ? horarioDoDia(petshop.horario, deIsoDia(d)) : null;
      if (!h) { usados.push({ dia: d, de, ate }); return; }
      const de2 = de > h.abre ? de : h.abre, ate2 = ate < h.fecha ? ate : h.fecha;
      if (ate2 <= de2) { fora++; return; }
      usados.push({ dia: d, de: de2, ate: ate2 });
    });
    return { usados, fora, cortados: usados.filter((u) => u.de !== de || u.ate !== ate).length };
  }, [repete, diaOk, dia, semanas, petshop.horario, inteiro, de, ate]);
  const dias = useMemo(() => plano.usados.map((u) => u.dia), [plano]);
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
    if (somenteLeitura()) return;
    if (bloqueio) { if (perguntar) setPergunta("salvar"); else void aplicar("este"); return; }
    setSalvando(true);
    try {
      const serie = dias.length > 1 ? crypto.randomUUID() : null;
      const linhas = plano.usados.map((u) => {
        const d = u.dia;
        const inicio = inteiro ? deIsoDia(d) : juntaDiaHora(d, u.de);
        const fim = inteiro ? somaDias(deIsoDia(d), 1) : juntaDiaHora(d, u.ate);
        return { petshop_id: petshop.id, profissional_id: profId, inicio: inicio.toISOString(), fim: fim.toISOString(), motivo: motivo.trim() || null, criado_por: user.id, serie_id: serie };
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

  const periodo = (d: string) => (inteiro
    ? { inicio: deIsoDia(d).toISOString(), fim: somaDias(deIsoDia(d), 1).toISOString() }
    : { inicio: juntaDiaHora(d, de).toISOString(), fim: juntaDiaHora(d, ate).toISOString() });

  /** Grava a edição neste bloqueio e, se pedido, leva horário, para quem e motivo aos próximos da repetição (cada um no seu dia). */
  async function aplicar(alcance: Alcance) {
    if (!bloqueio || somenteLeitura()) return;
    setSalvando(true);
    try {
      const comum = { profissional_id: profId, motivo: motivo.trim() || null };
      ok(await sb.from("bloqueios").update({ ...comum, ...periodo(dia) }).eq("id", bloqueio.id).eq("petshop_id", petshop.id).select("id").single());
      let outros = 0;
      if (alcance === "proximos" && serieId) {
        const lista = ok(await sb.from("bloqueios").select("id, inicio").eq("petshop_id", petshop.id).eq("serie_id", serieId).gte("inicio", bloqueio.inicio).neq("id", bloqueio.id));
        const feitos = await Promise.all(lista.map((o) =>
          sb.from("bloqueios").update({ ...comum, ...periodo(isoDia(new Date(o.inicio))) }).eq("id", o.id).eq("petshop_id", petshop.id).select("id").single()));
        feitos.forEach((r) => ok(r));
        outros = lista.length;
      }
      avisar(outros ? `Bloqueio alterado, este e mais ${outros === 1 ? "1" : outros} da repetição.` : "Bloqueio alterado.");
      avisarMudanca();
      aoSalvar();
    } catch (err) { avisarErro(err); avisarMudanca(); }
    setSalvando(false);
  }

  async function remover(alcance: Alcance) {
    if (!bloqueio || somenteLeitura()) return;
    setSalvando(true);
    try {
      if (alcance === "proximos" && serieId) {
        const fora = ok(await sb.from("bloqueios").delete().eq("petshop_id", petshop.id).eq("serie_id", serieId).gte("inicio", bloqueio.inicio).select("id"));
        avisar(fora.length > 1 ? `${fora.length} bloqueios removidos.` : "Bloqueio removido.");
      } else {
        ok(await sb.from("bloqueios").delete().eq("id", bloqueio.id).eq("petshop_id", petshop.id).select("id").single());
        avisar("Bloqueio removido.");
      }
      avisarMudanca();
      aoSalvar();
    } catch (err) { avisarErro(err); }
    setSalvando(false);
  }

  async function pedirRemocao() {
    if (!bloqueio || somenteLeitura()) return;
    if (perguntar) { setPergunta("remover"); return; }
    const quando = `${nomeDiaCurto(ini!)} ${dataCurta(ini!)}, ${eraInteiro ? "dia inteiro" : `${hora(ini!)} às ${hora(fimB!)}`}`;
    if (await confirmar({ titulo: "Remover este bloqueio?", texto: `${bloqueio.motivo ?? "Bloqueio"} · ${quando}. O horário volta a ficar livre.`, confirmar: "Remover bloqueio", perigo: true })) void remover("este");
  }

  if (bloqueio && pergunta) {
    const mudando = pergunta === "salvar";
    const agir = (alcance: Alcance) => void (mudando ? aplicar(alcance) : remover(alcance));
    return (
      <Folha titulo={mudando ? "Alterar um bloqueio que se repete" : "Remover um bloqueio que se repete"} aoFechar={() => setPergunta(null)}
        rodape={<button className="g-btn sec" disabled={salvando} onClick={() => setPergunta(null)}>Voltar</button>}>
        <div className="g-pilha">
          <p className="g-muted">
            {bloqueio.motivo ?? "Este bloqueio"} se repete em outros dias{aFrente ? ` (${aFrente === 1 ? "mais 1" : `mais ${aFrente}`} à frente)` : ""}.{" "}
            {mudando ? "Nos próximos mudam o horário, para quem e o motivo. Cada um continua no seu dia." : "Os horários removidos voltam a ficar livres."}
          </p>
          <div className="g-pilha p">
            <button className="g-btn sec cheio" disabled={salvando} onClick={() => agir("este")}>Só este</button>
            <button className={`g-btn ${mudando ? "pri" : "perigo"} cheio`} disabled={salvando} onClick={() => agir("proximos")}>Este e os próximos</button>
          </div>
        </div>
      </Folha>
    );
  }

  return (
    <Folha titulo={bloqueio ? "Bloqueio" : "Bloquear horário"} aoFechar={aoFechar}
      rodape={bloqueio
        ? <><button type="button" className="g-btn perigo" disabled={salvando} onClick={() => void pedirRemocao()}><Trash2 />Remover</button><button className="g-btn pri" form="form-bloqueio" disabled={salvando}><Check />{salvando ? "Salvando…" : "Salvar"}</button></>
        : <><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-bloqueio" disabled={salvando}><Lock />{salvando ? "Salvando…" : "Bloquear"}</button></>}>
      <form id="form-bloqueio" className="g-form" onSubmit={salvar}>
        {bloqueio
          ? serieId && <p className="g-agd-rep-t" style={{ margin: 0 }}><Repeat size={16} aria-hidden />Faz parte de uma repetição.</p>
          : <p className="g-muted g-p">Ninguém marca nesse período sem ser avisado. Serve para almoço, folga, feriado ou manutenção.</p>}

        <Campo rotulo="Dia"><input className="g-input" type="date" required value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
        <label className="g-check"><input type="checkbox" checked={inteiro} onChange={(e) => setInteiro(e.target.checked)} /> Dia inteiro</label>
        {!inteiro && (
          <div className="dupla">
            <Campo rotulo="De"><input className="g-input" type="time" required step={300} value={de} onChange={(e) => setDe(e.target.value)} /></Campo>
            <Campo rotulo="Até"><input className="g-input" type="time" required step={300} value={ate} onChange={(e) => setAte(e.target.value)} /></Campo>
          </div>
        )}

        {/* com uma pessoa só atendendo, bloquear para ela ou para o pet shop inteiro dá no mesmo: não pergunta */}
        {(quemAtende.length > 1 || Boolean(bloqueio?.profissional_id)) && (
          <div className="g-campo"><span>Para quem</span>
            <div className="g-chips">
              <button type="button" className="g-chip" aria-pressed={profId === null} onClick={() => setProfId(null)}><Store size={15} />Pet shop inteiro</button>
              {quemAtende.map((p) => <button key={p.id} type="button" className="g-chip" aria-pressed={profId === p.id} onClick={() => setProfId(p.id)}><i style={{ background: p.cor }} />{p.nome.split(" ")[0]}</button>)}
            </div>
          </div>
        )}

        <div className="g-campo"><span>Motivo</span>
          <div className="g-chips">
            {MOTIVOS_BLOQUEIO.map((m) => <button key={m} type="button" className="g-chip" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>)}
          </div>
          <input className="g-input" value={motivo} maxLength={80} onChange={(e) => setMotivo(e.target.value)} placeholder="Ou escreva o motivo" aria-label="Motivo" />
        </div>

        {!bloqueio && <div className="g-agd-rep">
          <label className="g-check"><input type="checkbox" checked={repete} onChange={(e) => setRepete(e.target.checked)} /> {temHorario ? "Repetir nos dias em que o pet shop abre" : "Repetir de segunda a sexta"}</label>
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
                  {!temHorario && " O horário de funcionamento ainda não foi preenchido em Meu pet shop."}
                  {plano.cortados > 0 && ` Em ${plano.cortados === 1 ? "1 dia" : `${plano.cortados} dias`} o bloqueio fica menor, para caber no horário em que o pet shop abre.`}
                  {plano.fora > 0 && ` ${plano.fora === 1 ? "1 dia ficou de fora" : `${plano.fora} dias ficaram de fora`}: nesse horário o pet shop já está fechado.`}
                </p>
              )}
            </>
          )}
        </div>}
      </form>
    </Folha>
  );
}
