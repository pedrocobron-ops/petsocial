"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarOff, Check, Clock, Lock, Repeat, Truck } from "lucide-react";
import type { AgendamentoCompleto, PetComTutor } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO } from "@/lib/gestao/tipos";
import { REPETICOES, bloqueioPega, datasDaSerie, horariosLivres } from "@/lib/gestao/agenda";
import { brlCurto, dataAmigavel, dataCurta, deIsoDia, hora, horarioDoDia, isoDia, juntaDiaHora, nomeDiaCurto, precoDoServico, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { AvatarPet, Campo, CampoValor, EscolherPet, Folha, avisarMudanca, ok, useAvisos, useDados } from "../ui";
import "@/app/(gestao)/gestao/app/agenda/agenda.css";

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
type Problema = { tipo: "fechado" | "bloqueio" | "conflito"; texto: string };

/**
 * Marca um horário novo ou altera um existente. Avisa (sem impedir) quando bate com outro atendimento ou com um bloqueio.
 * Ao criar, o horário pode se repetir: todos os da série dividem o mesmo `serie_id`.
 */
export default function FormAgendamento({ agendamento, petInicial, diaInicial, horaInicial, profissionalInicial, aoFechar, aoSalvar }: {
  agendamento?: AgendamentoCompleto; petInicial?: PetComTutor | null; diaInicial?: string; horaInicial?: string; profissionalInicial?: string | null;
  aoFechar: () => void; aoSalvar: () => void;
}) {
  const { sb, petshop, equipe, servicos, user } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const quemAtende = equipe.filter((p) => p.ativo && p.atende);
  const ativos = servicos.filter((s) => s.ativo || s.id === agendamento?.servico_id);

  const [pet, setPet] = useState<PetComTutor | null>(petInicial ?? null);
  const [petNovo, setPetNovo] = useState<string | null>(null);
  const [servicoId, setServicoId] = useState<string | null>(agendamento?.servico_id ?? ativos[0]?.id ?? null);
  const [profId, setProfId] = useState<string | null>(agendamento ? agendamento.profissional_id : profissionalInicial ?? (quemAtende.length === 1 ? quemAtende[0].id : null));
  const [dia, setDia] = useState(agendamento ? isoDia(new Date(agendamento.inicio)) : diaInicial ?? isoDia(new Date()));
  const [hhmm, setHhmm] = useState(agendamento ? hora(agendamento.inicio) : horaInicial ?? "");
  const [duracao, setDuracao] = useState<number>(agendamento ? Math.round((new Date(agendamento.fim).getTime() - new Date(agendamento.inicio).getTime()) / 60000) : ativos[0]?.duracao_min ?? 60);
  const [preco, setPreco] = useState<number | null>(agendamento?.preco ?? null);
  const [precoMexido, setPrecoMexido] = useState(Boolean(agendamento));
  const [levaTraz, setLevaTraz] = useState(agendamento?.leva_traz ?? false);
  const [endereco, setEndereco] = useState(agendamento?.endereco_leva_traz ?? "");
  const [obs, setObs] = useState(agendamento?.obs ?? "");
  const [salvando, setSalvando] = useState(false);
  // repetição (só ao criar)
  const [repetir, setRepetir] = useState<number>(0);
  const [vezes, setVezes] = useState(4);
  const [comProblema, setComProblema] = useState<"pular" | "marcar" | null>(null);
  const [previa, setPrevia] = useState<Record<string, Problema[]> | null>(null);

  // em edição, carrega o pet completo (com tutor)
  useEffect(() => {
    if (agendamento && !pet) {
      void sb.from("pets").select("*, clientes(id, nome, telefone)").eq("id", agendamento.pet_id).single().then(({ data }) => { if (data) setPet(data as PetComTutor); });
    }
  }, [agendamento, pet, sb]);

  const servico = ativos.find((s) => s.id === servicoId) ?? null;
  // preço sugerido pelo serviço e porte, enquanto a pessoa não digitar outro
  useEffect(() => {
    if (!precoMexido) setPreco(precoDoServico(servico, pet?.porte));
  }, [servico, pet, precoMexido]);

  // o que já está marcado no dia, para sugerir horários livres
  const { dados: doDia } = useDados(async () => {
    const ini = deIsoDia(dia);
    return ok(await sb.from("agendamentos").select("id, inicio, fim, profissional_id, status").eq("petshop_id", petshop.id)
      .gte("inicio", ini.toISOString()).lt("inicio", somaDias(ini, 1).toISOString()));
  }, [dia, petshop.id]);

  // datas da série (uma só quando não repete) e os bloqueios do período
  const diaOk = RE_DIA.test(dia);
  const repetindo = !agendamento && repetir > 0;
  const datas = useMemo(() => (repetindo ? datasDaSerie(dia, repetir, vezes) : [dia]), [repetindo, dia, repetir, vezes]);
  const ultimoDia = datas[datas.length - 1];
  const { dados: bloqueios } = useDados(async () => {
    if (!diaOk) return [];
    return ok(await sb.from("bloqueios").select("id, inicio, fim, motivo, profissional_id").eq("petshop_id", petshop.id)
      .lt("inicio", somaDias(deIsoDia(ultimoDia), 1).toISOString()).gt("fim", deIsoDia(dia).toISOString()));
  }, [dia, ultimoDia, diaOk, petshop.id]);
  const nomeDe = (id: string | null) => (id ? quemAtende.find((p) => p.id === id)?.nome.split(" ")[0] ?? "profissional" : "pet shop inteiro");

  const funcionamento = horarioDoDia(petshop.horario, deIsoDia(dia));
  const livres = useMemo(() => {
    if (!funcionamento) return [];
    const base = deIsoDia(dia).getTime();
    const emMin = (x: { inicio: string; fim: string }) => ({ inicio: (new Date(x.inicio).getTime() - base) / 60000, fim: (new Date(x.fim).getTime() - base) / 60000 });
    const ocupados = (doDia ?? [])
      .filter((a) => a.id !== agendamento?.id && !["cancelado", "faltou"].includes(a.status) && (profId ? a.profissional_id === profId : true))
      .map(emMin);
    // tempo bloqueado (do pet shop inteiro ou de quem vai atender) não é oferecido
    const bloqueados = (bloqueios ?? []).filter((b) => !b.profissional_id || b.profissional_id === profId).map(emMin);
    const agora = new Date();
    const aPartirDe = dia === isoDia(agora) ? agora.getHours() * 60 + agora.getMinutes() : undefined;
    return horariosLivres({ abre: funcionamento.abre, fecha: funcionamento.fecha, duracaoMin: duracao, ocupados: [...(quemAtende.length > 1 && !profId ? [] : ocupados), ...bloqueados], aPartirDe });
  }, [funcionamento, dia, doDia, bloqueios, profId, duracao, agendamento, quemAtende.length]);

  const bloqueioEm = (d: string) => {
    const ini = juntaDiaHora(d, hhmm).getTime();
    return (bloqueios ?? []).find((b) => bloqueioPega(b, profId, ini, ini + duracao * 60000)) ?? null;
  };
  const bloqueioAqui = diaOk && hhmm ? bloqueioEm(dia) : null;

  /** Confere cada data: dia fechado, bloqueio e conflito com outro horário do mesmo profissional (a mesma conferência do salvar). */
  async function conferir(lista: string[]): Promise<Record<string, Problema[]>> {
    const bate = await Promise.all(lista.map(async (d) => {
      if (!profId) return 0;
      const ini = juntaDiaHora(d, hhmm);
      return ok(await sb.rpc("conflitos_agenda", { p_petshop: petshop.id, p_profissional: profId, p_inicio: ini.toISOString(), p_fim: new Date(ini.getTime() + duracao * 60000).toISOString(), p_ignorar: agendamento?.id })).length;
    }));
    const out: Record<string, Problema[]> = {};
    lista.forEach((d, i) => {
      const p: Problema[] = [];
      if (!horarioDoDia(petshop.horario, deIsoDia(d))) p.push({ tipo: "fechado", texto: "fechado" });
      const b = bloqueioEm(d);
      if (b) p.push({ tipo: "bloqueio", texto: b.motivo ? `bloqueado: ${b.motivo}` : "bloqueado" });
      if (bate[i]) p.push({ tipo: "conflito", texto: "já tem horário" });
      out[d] = p;
    });
    return out;
  }

  // prévia da série: refaz a conferência quando muda dia, hora, duração, profissional ou os bloqueios
  const chaveDatas = datas.join(",");
  useEffect(() => {
    if (!repetindo || !diaOk || !hhmm) { setPrevia(null); return; }
    let vale = true;
    conferir(datas).then((r) => { if (vale) setPrevia(r); }).catch(() => { if (vale) setPrevia(null); });
    return () => { vale = false; };
  }, [repetindo, diaOk, hhmm, chaveDatas, duracao, profId, bloqueios]); // eslint-disable-line react-hooks/exhaustive-deps
  const comAviso = previa ? datas.filter((d) => previa[d]?.length) : [];
  const vaoMarcar = datas.length - (comProblema === "pular" ? comAviso.length : 0);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!pet) { avisar("Escolha o pet."); return; }
    if (!hhmm) { avisar("Escolha o horário."); return; }
    const inicio = juntaDiaHora(dia, hhmm);
    const fim = new Date(inicio.getTime() + duracao * 60000);
    setSalvando(true);
    try {
      const campos = {
        pet_id: pet.id, servico_id: servicoId, profissional_id: profId, preco,
        leva_traz: levaTraz, endereco_leva_traz: levaTraz ? endereco.trim() || null : null, obs: obs.trim() || null,
      };
      if (repetindo) {
        const problemas = await conferir(datas);
        setPrevia(problemas);
        const ruins = datas.filter((d) => problemas[d]?.length);
        if (ruins.length && !comProblema) { avisar("Algumas datas têm aviso. Escolha entre pular ou marcar mesmo assim."); setSalvando(false); return; }
        const usar = comProblema === "pular" ? datas.filter((d) => !problemas[d]?.length) : datas;
        if (!usar.length) { avisar("Não sobrou nenhuma data para marcar."); setSalvando(false); return; }
        const serie = usar.length > 1 ? crypto.randomUUID() : null;
        ok(await sb.from("agendamentos").insert(usar.map((d) => {
          const ini = juntaDiaHora(d, hhmm);
          return { ...campos, inicio: ini.toISOString(), fim: new Date(ini.getTime() + duracao * 60000).toISOString(), serie_id: serie, petshop_id: petshop.id, criado_por: user.id };
        })).select("id"));
        avisar(usar.length === 1 ? "1 horário marcado" : `${usar.length} horários marcados`);
        avisarMudanca();
        aoSalvar();
        setSalvando(false);
        return;
      }
      const bloqueio = bloqueioEm(dia);
      if (bloqueio) {
        const segue = await confirmar({ titulo: "Esse horário está bloqueado", texto: `${bloqueio.motivo ?? "Bloqueio"} (${nomeDe(bloqueio.profissional_id)}), das ${hora(bloqueio.inicio)} às ${hora(bloqueio.fim)}. Quer marcar mesmo assim?`, confirmar: "Marcar mesmo assim" });
        if (!segue) { setSalvando(false); return; }
      }
      if (profId) {
        const bate = ok(await sb.rpc("conflitos_agenda", { p_petshop: petshop.id, p_profissional: profId, p_inicio: inicio.toISOString(), p_fim: fim.toISOString(), p_ignorar: agendamento?.id }));
        if (bate.length) {
          const quem = quemAtende.find((p) => p.id === profId)?.nome ?? "Esse profissional";
          const segue = await confirmar({ titulo: "Esse horário já tem atendimento", texto: `${quem} já tem ${bate.length === 1 ? "um atendimento" : `${bate.length} atendimentos`} nesse horário. Quer marcar mesmo assim?`, confirmar: "Marcar mesmo assim" });
          if (!segue) { setSalvando(false); return; }
        }
      }
      const quando = { inicio: inicio.toISOString(), fim: fim.toISOString() };
      if (agendamento) ok(await sb.from("agendamentos").update({ ...campos, ...quando }).eq("id", agendamento.id).select(SELECT_AGENDAMENTO).single());
      else ok(await sb.from("agendamentos").insert({ ...campos, ...quando, petshop_id: petshop.id, criado_por: user.id }).select("id").single());
      avisar(agendamento ? "Horário alterado." : `${pet.nome} marcado para ${dataAmigavel(inicio)} às ${hhmm}.`);
      avisarMudanca();
      aoSalvar();
    } catch (err) { avisarErro(err); }
    setSalvando(false);
  }

  if (petNovo !== null) {
    return <FormPet nomeInicial={petNovo} aoFechar={() => setPetNovo(null)} aoSalvar={(p) => { setPet(p); setPetNovo(null); }} />;
  }

  return (
    <Folha titulo={agendamento ? "Alterar horário" : "Marcar horário"} aoFechar={aoFechar}
      rodape={pet ? <><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-ag" disabled={salvando}>{salvando ? "Salvando…" : agendamento ? "Salvar" : repetindo && vaoMarcar > 1 ? `Marcar ${vaoMarcar} horários` : "Marcar"}</button></> : undefined}>
      {!pet ? (
        agendamento ? <p className="g-muted">Carregando…</p> : <EscolherPet aoEscolher={setPet} aoCriar={(n) => setPetNovo(n)} autoFocus />
      ) : (
        <form id="form-ag" className="g-form" onSubmit={salvar}>
          <div className="g-card areia g-fila">
            <AvatarPet pet={pet} />
            <div className="g-cresce"><b>{pet.nome}</b><div className="g-pp g-muted">{[pet.clientes?.nome, pet.raca, pet.porte ? `porte ${pet.porte}` : "sem porte"].filter(Boolean).join(" · ")}</div></div>
            {!agendamento && <button type="button" className="g-btn fantasma p" onClick={() => setPet(null)}>Trocar</button>}
          </div>
          {pet.alertas && <p className="g-aviso" style={{ margin: 0 }}>{pet.alertas}</p>}

          <div className="g-campo"><span>Serviço</span>
            <div className="g-chips">
              {ativos.map((s) => (
                <button key={s.id} type="button" className="g-chip" aria-pressed={servicoId === s.id}
                  onClick={() => { setServicoId(s.id); setDuracao(s.duracao_min); setPrecoMexido(false); }}><i style={{ background: s.cor }} />{s.nome}</button>
              ))}
            </div>
          </div>

          {quemAtende.length > 1 && (
            <div className="g-campo"><span>Quem atende</span>
              <div className="g-chips">
                <button type="button" className="g-chip" aria-pressed={profId === null} onClick={() => setProfId(null)}>A definir</button>
                {quemAtende.map((p) => <button key={p.id} type="button" className="g-chip" aria-pressed={profId === p.id} onClick={() => setProfId(p.id)}><i style={{ background: p.cor }} />{p.nome.split(" ")[0]}</button>)}
              </div>
            </div>
          )}

          <div className="dupla">
            <Campo rotulo="Dia"><input className="g-input" type="date" required value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
            <Campo rotulo="Horário"><input className="g-input" type="time" required step={300} value={hhmm} onChange={(e) => setHhmm(e.target.value)} /></Campo>
          </div>
          {!funcionamento ? <p className="g-pp g-muted">O pet shop não abre {dataAmigavel(dia)}. Você pode marcar mesmo assim.</p>
            : livres.length > 0 ? (
              <div className="g-campo"><span className="g-muted" style={{ fontWeight: 500 }}>Horários livres {dataAmigavel(dia)}</span>
                <div className="g-chips">
                  {livres.slice(0, 14).map((h) => <button key={h} type="button" className="g-chip" aria-pressed={hhmm === h} onClick={() => setHhmm(h)}>{h}</button>)}
                </div>
              </div>
            ) : <p className="g-pp g-muted">Sem horário livre {dataAmigavel(dia)} para este serviço. Você pode encaixar escolhendo o horário acima.</p>}
          {bloqueioAqui && !repetindo && (
            <p className="g-agd-alerta" role="status"><Lock />
              <span><b>Horário bloqueado: {bloqueioAqui.motivo ?? "sem motivo"}</b> ({nomeDe(bloqueioAqui.profissional_id)}), das {hora(bloqueioAqui.inicio)} às {hora(bloqueioAqui.fim)}. Dá para marcar mesmo assim: o sistema pede uma confirmação.</span>
            </p>
          )}

          {!agendamento && (
            <div className="g-agd-rep">
              <div className="dupla">
                <Campo rotulo="Repetir">
                  <select className="g-select" value={repetir} onChange={(e) => { setRepetir(Number(e.target.value)); setComProblema(null); }}>
                    {REPETICOES.map((r) => <option key={r.semanas} value={r.semanas}>{r.rotulo}</option>)}
                  </select>
                </Campo>
                {repetindo && (
                  <Campo rotulo="Por quantas vezes">
                    <select className="g-select" value={vezes} onChange={(e) => setVezes(Number(e.target.value))}>
                      {Array.from({ length: 11 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} vezes</option>)}
                    </select>
                  </Campo>
                )}
              </div>
              {repetindo && diaOk && (
                <>
                  <div className="g-agd-rep-t"><Repeat size={15} /><span>{hhmm ? `Sempre às ${hhmm}` : "Escolha o horário para conferir as datas"}</span></div>
                  <ul className="g-agd-datas">
                    {datas.map((d) => {
                      const p = previa?.[d] ?? [];
                      const Icone = !p.length ? Check : p[0].tipo === "fechado" ? CalendarOff : p[0].tipo === "bloqueio" ? Lock : Clock;
                      return (
                        <li key={d} className={`g-agd-data${p.length ? " aviso" : ""}${p.length && comProblema === "pular" ? " fora" : ""}`}>
                          {previa && <Icone size={14} aria-hidden />}
                          <b>{nomeDiaCurto(deIsoDia(d))} {dataCurta(d)}</b>
                          {p.length > 0 && <small>{p.map((x) => x.texto).join(", ")}</small>}
                        </li>
                      );
                    })}
                  </ul>
                  {comAviso.length > 0 && (
                    <div className="g-agd-escolha">
                      <p className="g-p"><b>{comAviso.length === 1 ? "1 data tem aviso." : `${comAviso.length} datas têm aviso.`}</b> O que fazer com {comAviso.length === 1 ? "ela" : "elas"}?</p>
                      <div className="g-seg" role="group" aria-label="Datas com aviso">
                        <button type="button" aria-pressed={comProblema === "pular"} onClick={() => setComProblema("pular")}>Pular {comAviso.length === 1 ? "essa data" : "essas datas"}</button>
                        <button type="button" aria-pressed={comProblema === "marcar"} onClick={() => setComProblema("marcar")}>Marcar mesmo assim</button>
                      </div>
                    </div>
                  )}
                  {previa && (comAviso.length === 0 || comProblema) && (
                    <p className="g-pp g-muted">{vaoMarcar === 0 ? "Nenhuma data sobra para marcar." : vaoMarcar === 1 ? "Vai marcar 1 horário." : `Vai marcar ${vaoMarcar} horários, com o mesmo serviço, valor e observação.`}</p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="dupla">
            <Campo rotulo="Duração">
              <select className="g-select" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
                {[15, 30, 45, 60, 90, 120, 150, 180, 240].concat([15, 30, 45, 60, 90, 120, 150, 180, 240].includes(duracao) ? [] : [duracao]).sort((a, b) => a - b)
                  .map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}`}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Valor" dica={servico && !pet.porte && !precoMexido ? "Pet sem porte: confira o valor." : undefined}>
              <CampoValor valor={preco} aoMudar={(v) => { setPreco(v); setPrecoMexido(true); }} placeholder={preco == null ? "definir" : brlCurto(preco)} />
            </Campo>
          </div>

          <label className="g-check"><input type="checkbox" checked={levaTraz} onChange={(e) => setLevaTraz(e.target.checked)} /><Truck size={18} /> Leva e traz</label>
          {levaTraz && <Campo rotulo="Endereço para buscar"><input className="g-input" value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Campo>}
          <Campo rotulo="Observação"><textarea className="g-textarea" value={obs} maxLength={400} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: tosa na máquina 4, laço rosa" /></Campo>
        </form>
      )}
    </Folha>
  );
}
