"use client";

import { useState } from "react";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { feriadosNacionais, type DiaEspecial } from "@/lib/gestao/feriados";
import { usaModulo } from "@/lib/gestao/modulos";
import { dataCompleta, deIsoDia, isoDia, nomeDiaCurto } from "@/lib/gestao/util";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { Campo, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "../ui";
import "../hotel/hotel.css";

/**
 * Feriados e dias fechados: o dono lista as datas em que o negócio não abre ou que contam como feriado.
 * Dia fechado: o link do cliente não oferece banho nem creche, a agenda avisa ao marcar e a chamada da creche não espera ninguém.
 * Feriado no preço: a noite do hotel usa o preço de feriado (se ele estiver ligado nas opções do hotel).
 * Lista vazia = nada muda. Cada mudança é gravada na hora.
 */
export default function Feriados() {
  const { sb, petshop, souDono } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const { calendario, recarregar } = useCalendario();
  const temHotel = usaModulo(petshop, "hotel");
  const hoje = isoDia(new Date());
  const [dia, setDia] = useState("");
  const [nome, setNome] = useState("");
  const [fechado, setFechado] = useState(true);
  const [feriado, setFeriado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [verPassados, setVerPassados] = useState(false);
  if (!souDono) return null;

  const todos = calendario?.dias ?? [];
  const futuros = todos.filter((d) => d.dia >= hoje), passados = todos.filter((d) => d.dia < hoje);
  const mudou = async () => { await recarregar(); avisarMudanca(); };

  async function adicionar() {
    if (somenteLeitura() || ocupado) return;
    if (!dia) return setErro("Escolha a data.");
    if (!fechado && !feriado) return setErro("Marque se o dia é fechado, se conta como feriado no preço, ou os dois.");
    if (todos.some((d) => d.dia === dia)) return setErro(`${dataCompleta(dia)} já está na lista. Mude as marcações dela aqui embaixo.`);
    setErro(null); setOcupado(true);
    try {
      ok(await sb.from("dias_especiais").insert({ petshop_id: petshop.id, dia, nome: nome.trim(), fechado, feriado: temHotel && feriado }).select("id"));
      setDia(""); setNome("");
      await mudou();
      avisar(`${dataCompleta(dia)} entrou na lista.`);
    } catch (x) { avisarErro(x); } finally { setOcupado(false); }
  }

  /** Coloca na lista os feriados nacionais que ainda vão acontecer (deste ano e do próximo) e que ainda não estão nela. */
  async function nacionais() {
    if (somenteLeitura() || ocupado) return;
    const ano = new Date().getFullYear();
    const novos = [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)].filter((f) => f.dia >= hoje && !todos.some((d) => d.dia === f.dia));
    if (!novos.length) { avisar("Os feriados nacionais deste ano e do próximo já estão na lista."); return; }
    if (!fechado && !(temHotel && feriado)) return setErro("Marque acima se esses dias são fechados, se contam como feriado no preço, ou os dois.");
    if (!(await confirmar({
      titulo: `Colocar ${novos.length} feriados nacionais na lista?`,
      texto: `De ${dataCompleta(novos[0].dia)} a ${dataCompleta(novos[novos.length - 1].dia)}. Eles entram ${fechado ? "como dia fechado" : "sem fechar o dia"}${temHotel && feriado ? " e contando como feriado no preço do hotel" : ""}, do jeito que está marcado acima. Depois dá para mudar ou tirar um por um. Feriado da cidade e do estado você acrescenta pela data.`,
      confirmar: "Colocar na lista",
    }))) return;
    setErro(null); setOcupado(true);
    try {
      ok(await sb.from("dias_especiais").insert(novos.map((f) => ({ petshop_id: petshop.id, dia: f.dia, nome: f.nome, fechado, feriado: temHotel && feriado }))).select("id"));
      await mudou();
      avisar(`${novos.length} feriados nacionais na lista.`);
    } catch (x) { avisarErro(x); } finally { setOcupado(false); }
  }

  async function marcar(d: DiaEspecial, m: Partial<Pick<DiaEspecial, "fechado" | "feriado">>) {
    if (somenteLeitura() || ocupado) return;
    const novo = { fechado: d.fechado, feriado: d.feriado, ...m };
    if (!novo.fechado && !novo.feriado) { avisarErro("Um dia da lista precisa de pelo menos uma marcação. Para ele voltar a ser um dia comum, tire da lista."); return; }
    setOcupado(true);
    try {
      ok(await sb.from("dias_especiais").update(novo).eq("id", d.id).eq("petshop_id", petshop.id).select("id"));
      await mudou();
    } catch (x) { avisarErro(x); } finally { setOcupado(false); }
  }

  async function tirar(d: DiaEspecial) {
    if (somenteLeitura() || ocupado) return;
    setOcupado(true);
    try {
      ok(await sb.from("dias_especiais").delete().eq("id", d.id).eq("petshop_id", petshop.id).select("id"));
      await mudou();
      avisar(`${dataCompleta(d.dia)} saiu da lista.`);
    } catch (x) { avisarErro(x); } finally { setOcupado(false); }
  }

  const linha = (d: DiaEspecial) => (
    <div key={d.id} className="g-ht-fer">
      <div className="q">
        <b>{dataCompleta(d.dia)} <small>{nomeDiaCurto(deIsoDia(d.dia))}</small></b>
        <span>{d.nome || "Sem nome"}</span>
      </div>
      <label className="g-check"><input type="checkbox" checked={d.fechado} disabled={ocupado} onChange={(e) => void marcar(d, { fechado: e.target.checked })} /><span>Fechado</span></label>
      {(temHotel || d.feriado) && <label className="g-check"><input type="checkbox" checked={d.feriado} disabled={ocupado} onChange={(e) => void marcar(d, { feriado: e.target.checked })} /><span>Feriado no preço</span></label>}
      <button type="button" className="g-ico" aria-label={`Tirar ${dataCompleta(d.dia)} da lista`} disabled={ocupado} onClick={() => void tirar(d)}><Trash2 /></button>
    </div>
  );

  return (
    <section className="g-card g-pilha" id="feriados">
      <div className="g-mp-t">
        <Tile icone={CalendarOff} tom="manteiga" />
        <div><h2>Feriados e dias fechados</h2><p className="g-muted g-p">As datas em que vocês não abrem{temHotel ? ", ou que contam como feriado no preço do hotel" : ""}. Lista vazia, nada muda.</p></div>
      </div>
      <div className="g-ht-op-c">
        <div className="g-ht-fer-novo">
          <Campo rotulo="Data"><input type="date" className="g-input" value={dia} min={hoje} onChange={(e) => { setDia(e.target.value); setErro(null); }} /></Campo>
          <Campo rotulo="Nome (opcional)"><input className="g-input" value={nome} maxLength={60} placeholder="Ex.: Natal, folga da equipe" onChange={(e) => setNome(e.target.value)} /></Campo>
        </div>
        <label className="g-check"><input type="checkbox" checked={fechado} onChange={(e) => { setFechado(e.target.checked); setErro(null); }} /><span>Fechado: não atendemos nesse dia</span></label>
        {temHotel && <label className="g-check"><input type="checkbox" checked={feriado} onChange={(e) => { setFeriado(e.target.checked); setErro(null); }} /><span>Conta como feriado no preço do hotel</span></label>}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        <div className="g-fila">
          <button type="button" className="g-btn verde p" onClick={() => void adicionar()} disabled={ocupado}><Plus />Colocar na lista</button>
          <button type="button" className="g-btn sec p" onClick={() => void nacionais()} disabled={ocupado}>Colocar os feriados nacionais</button>
        </div>
      </div>
      {futuros.length === 0
        ? <p className="g-muted g-p">Nenhuma data marcada daqui para a frente.</p>
        : <div className="g-ht-fer-lista">{futuros.map(linha)}</div>}
      {passados.length > 0 && (
        <details className="g-ht-det" open={verPassados} onToggle={(e) => setVerPassados((e.target as HTMLDetailsElement).open)}>
          <summary>Datas que já passaram ({passados.length})</summary>
          {verPassados && <div className="g-ht-fer-lista">{[...passados].reverse().map(linha)}</div>}
        </details>
      )}
      <p className="g-muted g-pp">
        Dia fechado: o link do cliente não oferece horário de banho nem vaga de creche, a agenda avisa quando alguém marca nele e a chamada da creche não espera ninguém (não vira falta). Quem está hospedado no hotel continua hospedado.
        {temHotel ? " Feriado no preço: a noite que começa nesse dia usa o preço de feriado, que você liga em Opções do hotel e da creche." : ""}
      </p>
    </section>
  );
}
