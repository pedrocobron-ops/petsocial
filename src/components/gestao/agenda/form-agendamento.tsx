"use client";

import { useEffect, useMemo, useState } from "react";
import { Truck } from "lucide-react";
import type { AgendamentoCompleto, PetComTutor } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO } from "@/lib/gestao/tipos";
import { horariosLivres } from "@/lib/gestao/agenda";
import { brlCurto, dataAmigavel, deIsoDia, hora, horarioDoDia, isoDia, juntaDiaHora, precoDoServico, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { AvatarPet, Campo, CampoValor, EscolherPet, Folha, ok, useAvisos, useDados } from "../ui";

/** Marca um horário novo ou altera um existente. Avisa (sem bloquear) quando bate com outro atendimento. */
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

  const funcionamento = horarioDoDia(petshop.horario, deIsoDia(dia));
  const livres = useMemo(() => {
    if (!funcionamento) return [];
    const base = deIsoDia(dia).getTime();
    const ocupados = (doDia ?? [])
      .filter((a) => a.id !== agendamento?.id && !["cancelado", "faltou"].includes(a.status) && (profId ? a.profissional_id === profId : true))
      .map((a) => ({ inicio: (new Date(a.inicio).getTime() - base) / 60000, fim: (new Date(a.fim).getTime() - base) / 60000 }));
    const agora = new Date();
    const aPartirDe = dia === isoDia(agora) ? agora.getHours() * 60 + agora.getMinutes() : undefined;
    return horariosLivres({ abre: funcionamento.abre, fecha: funcionamento.fecha, duracaoMin: duracao, ocupados: quemAtende.length > 1 && !profId ? [] : ocupados, aPartirDe });
  }, [funcionamento, dia, doDia, profId, duracao, agendamento, quemAtende.length]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!pet) { avisar("Escolha o pet."); return; }
    if (!hhmm) { avisar("Escolha o horário."); return; }
    const inicio = juntaDiaHora(dia, hhmm);
    const fim = new Date(inicio.getTime() + duracao * 60000);
    setSalvando(true);
    try {
      if (profId) {
        const bate = ok(await sb.rpc("conflitos_agenda", { p_petshop: petshop.id, p_profissional: profId, p_inicio: inicio.toISOString(), p_fim: fim.toISOString(), p_ignorar: agendamento?.id }));
        if (bate.length) {
          const quem = quemAtende.find((p) => p.id === profId)?.nome ?? "Esse profissional";
          const segue = await confirmar({ titulo: "Esse horário já tem atendimento", texto: `${quem} já tem ${bate.length === 1 ? "um atendimento" : `${bate.length} atendimentos`} nesse horário. Quer marcar mesmo assim?`, confirmar: "Marcar mesmo assim" });
          if (!segue) { setSalvando(false); return; }
        }
      }
      const campos = {
        pet_id: pet.id, servico_id: servicoId, profissional_id: profId, inicio: inicio.toISOString(), fim: fim.toISOString(), preco,
        leva_traz: levaTraz, endereco_leva_traz: levaTraz ? endereco.trim() || null : null, obs: obs.trim() || null,
      };
      if (agendamento) ok(await sb.from("agendamentos").update(campos).eq("id", agendamento.id).select(SELECT_AGENDAMENTO).single());
      else ok(await sb.from("agendamentos").insert({ ...campos, petshop_id: petshop.id, criado_por: user.id }).select("id").single());
      avisar(agendamento ? "Horário alterado." : `${pet.nome} marcado para ${dataAmigavel(inicio)} às ${hhmm}.`);
      aoSalvar();
    } catch (err) { avisarErro(err); }
    setSalvando(false);
  }

  if (petNovo !== null) {
    return <FormPet nomeInicial={petNovo} aoFechar={() => setPetNovo(null)} aoSalvar={(p) => { setPet(p); setPetNovo(null); }} />;
  }

  return (
    <Folha titulo={agendamento ? "Alterar horário" : "Marcar horário"} aoFechar={aoFechar}
      rodape={pet ? <><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-ag" disabled={salvando}>{salvando ? "Salvando…" : agendamento ? "Salvar" : "Marcar"}</button></> : undefined}>
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
