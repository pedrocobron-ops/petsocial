"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarPlus, Check, DoorOpen, LogIn, MessageCircle, Search, Sunset, Syringe, Undo2, UserX } from "lucide-react";
import { lerRetiradas, QuemBuscou, textoDaRetirada } from "@/components/gestao/casa/portaria";
import { cuidadosVigentes, estadoSaude, tipoSaude, type CuidadoResumido } from "@/components/gestao/clientes/saude";
import { portariaLigada, type Retirada } from "@/lib/gestao/casa-opcoes";
import { abreNoDia, emPausa, erroDaChamada, esperadoNoDia, lerPresencas, mensagemDeFalta, montarChamada, planoVale, type LinhaChamada, type PlanoCompleto } from "@/lib/gestao/creche";
import { dataAmigavel, dataLonga, deIsoDia, isoDia, linkWhatsApp, semAcento, somaDias } from "@/lib/gestao/util";
import { diaFechado, fraseDoDiaFechado } from "@/lib/gestao/feriados";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import { AvatarPet, avisarMudanca, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { DiasDoPlano } from "./resumo-mes";
import "./creche.css";

type Acao = "chegou" | "extra" | "reposicao" | "saiu" | "faltou" | "desfazer";
type Saude = { vacinas: string[]; outros: string[] };

const horaCurta = (d: string | Date) => { const x = new Date(d); return x.getMinutes() ? `${x.getHours()}h${String(x.getMinutes()).padStart(2, "0")}` : `${x.getHours()}h`; };
/** Primeiro dia que a chamada deixa corrigir: o começo do mês (ou a última semana, na virada do mês). Mesma regra do banco. */
function primeiroDia(hoje: Date) {
  const mes = new Date(hoje.getFullYear(), hoje.getMonth(), 1), semana = somaDias(hoje, -7);
  return isoDia(mes < semana ? mes : semana);
}

/** Itens de saúde vencidos de cada pet (só a dose que vale), como a carteirinha mostra. */
async function saudeVencida(sb: ReturnType<typeof useGestao>["sb"], petshopId: string, petIds: string[]): Promise<Map<string, Saude>> {
  const mapa = new Map<string, Saude>();
  for (let i = 0; i < petIds.length; i += 100) {
    const r = await sb.from("pets_saude").select("pet_id, tipo, nome, aplicado_em, vence_em, criado_em").eq("petshop_id", petshopId).in("pet_id", petIds.slice(i, i + 100)).limit(1000);
    if (r.error) throw new Error(r.error.message);
    for (const c of cuidadosVigentes((r.data ?? []) as CuidadoResumido[])) {
      if (estadoSaude(c.vence_em) !== "vencido") continue;
      const s = mapa.get(c.pet_id) ?? { vacinas: [], outros: [] };
      if (c.tipo === "vacina") s.vacinas.push(c.nome); else s.outros.push(`${tipoSaude(c.tipo).rotulo}: ${c.nome}`);
      mapa.set(c.pet_id, s);
    }
  }
  return mapa;
}

/**
 * Chamada do dia: os mensalistas esperados pelo plano, com um toque para Chegou, Saiu ou Faltou, e Desfazer em cada um.
 * Quem vem fora do dia entra como dia extra (vai para a cobrança do mês) ou como reposição de falta (não cobra).
 * Nada de dinheiro aqui: a chegada de um mensalista não cobra diária.
 */
export default function Chamada({ planos, vagasHoje, aoNovoMensalista, aviso }: {
  planos: PlanoCompleto[]; vagasHoje: { ocupadas: number; total: number } | null; aoNovoMensalista: () => void;
  /** faixa opcional acima da lista (abriu vaga para quem está na lista de espera) */
  aviso?: React.ReactNode;
}) {
  const { sb, petshop, souDono } = useGestao();
  const { calendario } = useCalendario(); // dia marcado como fechado: ninguém é esperado e ninguém leva falta
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const agora = new Date(), hoje = isoDia(agora);
  const [dia, setDia] = useState(hoje);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [fora, setFora] = useState(false);
  // com "Quem pode buscar" ligado, o Saiu pergunta antes quem levou o pet
  const comPortaria = portariaLigada(petshop);
  const [buscando, setBuscando] = useState<LinhaChamada | null>(null);
  const ehHoje = dia === hoje;
  const minimo = primeiroDia(agora);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [mov, saude] = await Promise.all([
      lerPresencas(sb, petshop.id, dia, dia),
      saudeVencida(sb, petshop.id, [...new Set(planos.filter((p) => planoVale(p, dia)).map((p) => p.pet_id))]).catch(() => new Map<string, Saude>()),
    ]);
    const retiradas = comPortaria ? await lerRetiradas(sb, petshop.id, mov.presencas.filter((e) => e.status === "encerrada").map((e) => e.id)).catch(() => new Map<string, Retirada>()) : new Map<string, Retirada>();
    return { ...mov, saude, retiradas };
  }, [petshop.id, dia, planos.length, comPortaria]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const linhas = useMemo(() => (dados ? montarChamada(planos, dia, dados.presencas, dados.faltas, petshop.horario) : []), [dados, planos, dia, petshop.horario, calendario]);
  const conta = (e: LinhaChamada["estado"]) => linhas.filter((l) => l.estado === e).length;
  const naCasa = linhas.filter((l) => l.estado === "na_casa" && l.presenca?.mensalista);
  const abre = abreNoDia(petshop.horario, dia);
  const emPausaHoje = planos.filter((p) => p.pets?.ativo && planoVale(p, dia) && emPausa(p, dia) && p.dias.includes(deIsoDia(dia).getDay()));
  const ocupadas = ehHoje && vagasHoje ? vagasHoje.ocupadas : null;
  const vagas = vagasHoje?.total ?? null;

  async function marcar(plano: PlanoCompleto, acao: Acao, opcoes: { avisou?: boolean; forcar?: boolean } = {}): Promise<boolean> {
    if (somenteLeitura()) return false;
    const nome = plano.pets?.nome ?? "O pet";
    setOcupado(plano.id);
    try {
      const r = ok(await sb.rpc("creche_chamada", { p_plano: plano.id, p_dia: dia, p_acao: acao, p_avisou: opcoes.avisou ?? false, p_forcar: opcoes.forcar ?? false })) as { repetido?: boolean };
      if (r.repetido) avisar("Outra pessoa já tinha marcado. Atualizei a chamada.");
      else if (acao === "chegou") avisar(ehHoje ? `${nome} chegou.` : `${nome}: presença marcada em ${dataAmigavel(dia)}.`);
      else if (acao === "extra") avisar(`${nome}: dia extra anotado. Entra na cobrança do mês.`);
      else if (acao === "reposicao") avisar(`${nome}: reposição anotada, sem cobrança.`);
      else if (acao === "saiu") avisar(`${nome} foi para casa.`);
      else if (acao === "faltou") avisar(opcoes.avisou ? `${nome}: falta com aviso.` : `${nome}: falta marcada.`);
      else avisar("Desfeito.");
      await recarregar();
      avisarMudanca();
      return true;
    } catch (e) {
      const { vacina, texto } = erroDaChamada(e);
      if (vacina && !opcoes.forcar) {
        if (!souDono) { avisarErro(`Check-in bloqueado: ${nome} está com vacina vencida (${vacina}). Só o dono pode liberar a entrada.`); return false; }
        setOcupado(null);
        if (await confirmar({
          titulo: `${nome} está com vacina vencida`,
          texto: `${vacina}. O bloqueio de vacina vencida está ligado em Meu pet shop. Como dono, você pode liberar esta entrada.`,
          confirmar: "Liberar a entrada", perigo: true,
        })) return marcar(plano, acao, { ...opcoes, forcar: true });
        return false;
      }
      avisarErro(texto);
      void recarregar();
      return false;
    } finally { setOcupado(null); }
  }

  /** Fecha a chamada do dia: quem está na casa sai e quem ainda era esperado fica com falta. */
  async function encerrarChamada() {
    if (somenteLeitura()) return;
    const faltam = linhas.filter((l) => l.estado === "esperado");
    if (!naCasa.length && !faltam.length) return;
    const partes = [
      naCasa.length ? `marca a saída de ${naCasa.length === 1 ? "1 mensalista" : `${naCasa.length} mensalistas`}` : "",
      faltam.length ? `marca falta para ${faltam.length === 1 ? "1 que não veio" : `${faltam.length} que não vieram`} (${faltam.slice(0, 4).map((l) => l.plano.pets?.nome).join(", ")}${faltam.length > 4 ? "…" : ""})` : "",
    ].filter(Boolean).join(" e ");
    if (!(await confirmar({ titulo: ehHoje ? "Encerrar a chamada de hoje?" : "Encerrar a chamada deste dia?", texto: `Isto ${partes}. Nada é cobrado. Dá para desfazer um por um depois.`, confirmar: "Encerrar a chamada" }))) return;
    let saidas = 0, faltas = 0;
    for (const l of naCasa) { const r = await sb.rpc("creche_chamada", { p_plano: l.plano.id, p_dia: dia, p_acao: "saiu" }); if (!r.error) saidas++; }
    for (const l of faltam) { const r = await sb.rpc("creche_chamada", { p_plano: l.plano.id, p_dia: dia, p_acao: "faltou" }); if (!r.error) faltas++; }
    avisar([saidas ? `${saidas === 1 ? "1 saída" : `${saidas} saídas`}` : "", faltas ? `${faltas === 1 ? "1 falta" : `${faltas} faltas`}` : ""].filter(Boolean).join(" e ") + " na chamada.");
    await recarregar(); avisarMudanca();
  }

  if (!planos.length) {
    return (
      <Vazio titulo="A chamada começa com os mensalistas" texto="Cadastre os pets que vêm em dias fixos da semana. A cada dia, a chamada mostra quem deve vir, e um toque marca quem chegou, quem saiu e quem faltou.">
        <button className="g-btn sec" onClick={aoNovoMensalista}>Cadastrar o primeiro mensalista</button>
      </Vazio>
    );
  }

  return (
    <div className="g-pilha">
      <div className="g-cm-dia">
        <div>
          <p className="g-rotulo">{ehHoje ? "Chamada de hoje" : "Chamada de um dia que passou"}</p>
          <h2 className="g-cm-titulo">{dataLonga(deIsoDia(dia))}</h2>
        </div>
        <div className="g-fila g-cm-dia-acoes">
          <div className="g-seg" role="group" aria-label="Dia da chamada">
            <button type="button" aria-pressed={ehHoje} onClick={() => setDia(hoje)}>Hoje</button>
            {isoDia(somaDias(agora, -1)) >= minimo && <button type="button" aria-pressed={dia === isoDia(somaDias(agora, -1))} onClick={() => setDia(isoDia(somaDias(agora, -1)))}>Ontem</button>}
          </div>
          <input type="date" className="g-input g-cm-data" aria-label="Outro dia deste mês" value={dia} min={minimo} max={hoje}
            onChange={(e) => { const v = e.target.value; if (v && v >= minimo && v <= hoje) setDia(v); }} />
        </div>
      </div>

      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {carregando && !dados ? <Esqueleto linhas={4} /> : !dados ? null : (
        <>
          <div className="g-cm-placar" role="status">
            <span className="esperado"><b className="g-num">{conta("esperado")}</b>{ehHoje ? "ainda não chegaram" : "sem chamada"}</span>
            <span className="casa"><b className="g-num">{ehHoje ? conta("na_casa") : conta("na_casa") + conta("saiu")}</b>{ehHoje ? "na casa" : "vieram"}</span>
            {ehHoje && <span className="saiu"><b className="g-num">{conta("saiu")}</b>já saíram</span>}
            <span className="faltou"><b className="g-num">{conta("faltou")}</b>{conta("faltou") === 1 ? "faltou" : "faltaram"}</span>
          </div>
          {ehHoje && aviso}
          {emPausaHoje.length > 0 && <p className="g-muted g-p">Em pausa neste dia (não é falta): {emPausaHoje.map((p) => p.pets?.nome).join(", ")}.</p>}
          {ehHoje && vagas != null && ocupadas != null && (
            <p className={`g-cm-vagas${ocupadas >= vagas ? " cheia" : ""}`}>Creche hoje: <b className="g-tab">{ocupadas} de {vagas} vagas</b>, contando quem ainda vai chegar{ocupadas >= vagas ? " · casa cheia" : ""}</p>
          )}

          {!linhas.length ? (
            <p className="g-muted g-centro" style={{ padding: "28px 8px" }}>
              {diaFechado(dia) ? `${fraseDoDiaFechado(dia)}. Ninguém é esperado e ninguém leva falta (a lista fica em Meu pet shop, em Feriados e dias fechados).` : !abre ? "Pelo horário de Meu pet shop, a creche não abre neste dia." : "Nenhum mensalista tem plano para este dia da semana."}
            </p>
          ) : (
            <div className="g-cm-chamada">
              {linhas.map((l) => {
                const pet = l.plano.pets!;
                const s = dados.saude.get(pet.id);
                const trava = ocupado === l.plano.id;
                const fazer = (a: Acao, o?: { avisou?: boolean }) => void marcar(l.plano, a, o);
                return (
                  <div key={l.plano.id} className={`g-cm-linha ${l.estado}`}>
                    <AvatarPet pet={pet} tamanho="g" />
                    <div className="quem">
                      <b>{pet.nome}</b>
                      <span>{pet.clientes?.nome ?? "Sem tutor"}</span>
                      <div className="selos">
                        {l.conta === "extra" && <span className="g-tag amarelo">dia extra</span>}
                        {l.conta === "reposicao" && <span className="g-tag azul">reposição</span>}
                        {l.conta === "avulsa" && <span className="g-tag">check-in avulso</span>}
                        {s?.vacinas.length ? <span className="g-tag vermelho" title={s.vacinas.join(", ")}><Syringe size={12} aria-hidden />vacina vencida: {s.vacinas.join(", ")}</span> : null}
                        {s?.outros.length ? <span className="g-tag amarelo" title={s.outros.join(", ")}>vencido: {s.outros.join(", ")}</span> : null}
                        {pet.alertas && <span className="g-tag vermelho"><AlertTriangle size={12} aria-hidden />{pet.alertas}</span>}
                      </div>
                    </div>
                    <div className="acoes">
                      {l.estado === "esperado" && (
                        <>
                          <button className="g-btn verde" disabled={trava} onClick={() => fazer("chegou")}><LogIn />{ehHoje ? "Chegou" : "Veio"}</button>
                          <button className="g-btn fantasma" disabled={trava} onClick={() => fazer("faltou")}><UserX />Faltou</button>
                        </>
                      )}
                      {l.estado === "na_casa" && (
                        <>
                          <span className="g-tag verde"><Check size={12} aria-hidden />na casa desde {isoDia(new Date(l.presenca!.entrada)) === hoje ? horaCurta(l.presenca!.entrada) : dataAmigavel(l.presenca!.entrada)}</span>
                          {l.presenca?.mensalista ? (
                            <>
                              <button className="g-btn sec" disabled={trava} onClick={() => { if (comPortaria && ehHoje && l.presenca) { if (!somenteLeitura()) setBuscando(l); } else fazer("saiu"); }}><DoorOpen />Saiu</button>
                              <button className="g-btn fantasma p" disabled={trava} onClick={() => fazer("desfazer")} aria-label={`Desfazer a chegada de ${pet.nome}`}><Undo2 />Desfazer</button>
                            </>
                          ) : <span className="g-muted g-pp">saída pelo cartão, em Casa agora</span>}
                        </>
                      )}
                      {l.estado === "saiu" && (
                        <>
                          <span className="g-tag">{ehHoje && l.presenca?.saida ? `saiu às ${horaCurta(l.presenca.saida)}` : "veio"}{l.presenca && dados.retiradas.get(l.presenca.id) ? ` ${textoDaRetirada(dados.retiradas.get(l.presenca.id)!)}` : ""}</span>
                          {l.presenca?.mensalista && <button className="g-btn fantasma p" disabled={trava} onClick={() => fazer("desfazer")} aria-label={`Desfazer a ${ehHoje ? "saída" : "presença"} de ${pet.nome}`}><Undo2 />Desfazer</button>}
                        </>
                      )}
                      {l.estado === "faltou" && (
                        <>
                          <span className="g-tag vermelho">faltou{l.falta?.avisou ? " · avisou" : ""}</span>
                          <label className="g-check g-cm-avisou">
                            <input type="checkbox" checked={Boolean(l.falta?.avisou)} disabled={trava} onChange={(e) => fazer("faltou", { avisou: e.target.checked })} />
                            <span>Avisou</span>
                          </label>
                          {ehHoje && linkWhatsApp(pet.clientes?.telefone, "x") && (
                            <a className="g-btn zap p" href={linkWhatsApp(pet.clientes?.telefone, mensagemDeFalta(pet.clientes?.nome, pet.nome, pet.sexo, petshop.nome))!} target="_blank" rel="noopener noreferrer"
                              aria-label={`Perguntar por ${pet.nome} no WhatsApp`}><MessageCircle />Perguntar</a>
                          )}
                          <button className="g-btn fantasma p" disabled={trava} onClick={() => fazer("desfazer")} aria-label={`Desfazer a falta de ${pet.nome}`}><Undo2 />Desfazer</button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="g-fila g-cm-rodape">
            <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setFora(true); }}><CalendarPlus />Veio fora do dia</button>
            {(naCasa.length > 0 || conta("esperado") > 0) && <button className="g-btn sec" onClick={() => void encerrarChamada()}><Sunset />Encerrar a chamada</button>}
          </div>
          <p className="g-muted g-pp">A chegada de um mensalista não cobra diária: o dia já está no plano. Pet sem plano entra pelo botão Nova reserva / Check-in, como sempre.</p>
        </>
      )}

      {buscando?.presenca && <QuemBuscou key={buscando.presenca.id} estadia={{ id: buscando.presenca.id, pets: buscando.plano.pets }} aoFechar={() => setBuscando(null)}
        aoSeguir={async () => { const l = buscando; setBuscando(null); await marcar(l.plano, "saiu"); }} />}
      {fora && dados && <ForaDoDia planos={planos} dia={dia} jaVieram={new Set(linhas.map((l) => l.plano.id))} saude={dados.saude}
        cheia={ehHoje && vagas != null && ocupadas != null && ocupadas >= vagas ? { ocupadas: ocupadas!, vagas } : null}
        aoFechar={() => setFora(false)} aoMarcar={async (p, reposicao) => { if (await marcar(p, reposicao ? "reposicao" : "extra")) setFora(false); }} />}
    </div>
  );
}

/** Mensalista que veio num dia que não é do plano: vira dia extra (entra na cobrança) ou reposição de falta (não cobra). */
function ForaDoDia({ planos, dia, jaVieram, saude, cheia, aoFechar, aoMarcar }: {
  planos: PlanoCompleto[]; dia: string; jaVieram: Set<string>; saude: Map<string, Saude>; cheia: { ocupadas: number; vagas: number } | null;
  aoFechar: () => void; aoMarcar: (p: PlanoCompleto, reposicao: boolean) => Promise<void>;
}) {
  const { petshop } = useGestao();
  const { confirmar } = useAvisos();
  const [q, setQ] = useState("");
  const [escolhido, setEscolhido] = useState<PlanoCompleto | null>(null);
  const [reposicao, setReposicao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const alvo = semAcento(q);
  // só os mensalistas que não são esperados neste dia e ainda não foram marcados
  const lista = planos.filter((p) => p.pets?.ativo && planoVale(p, dia) && !jaVieram.has(p.id) && !esperadoNoDia(p, dia, petshop.horario))
    .filter((p) => !alvo || semAcento(p.pets?.nome ?? "").includes(alvo) || semAcento(p.pets?.clientes?.nome ?? "").includes(alvo))
    .sort((a, b) => (a.pets?.nome ?? "").localeCompare(b.pets?.nome ?? "", "pt-BR"));
  const s = escolhido ? saude.get(escolhido.pet_id) : undefined;

  async function salvar() {
    if (!escolhido || salvando) return;
    if (cheia && !(await confirmar({
      titulo: `Casa cheia (${cheia.ocupadas} de ${cheia.vagas})`,
      texto: `A creche já está com todas as vagas de hoje tomadas, contando os mensalistas que ainda vão chegar. Receber ${escolhido.pets?.nome ?? "o pet"} passando do limite?`,
      confirmar: "Passar do limite", perigo: true,
    }))) return;
    setSalvando(true);
    await aoMarcar(escolhido, reposicao);
    setSalvando(false);
  }

  return (
    <Folha titulo="Veio fora do dia" aoFechar={aoFechar}
      rodape={escolhido ? <>
        <button className="g-btn sec" onClick={() => setEscolhido(null)}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : reposicao ? "Marcar reposição" : "Marcar dia extra"}</button>
      </> : <button className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
      {!escolhido ? (
        <div className="g-pilha p">
          <p className="g-muted g-p">Mensalistas que não têm {dataAmigavel(dia) === "hoje" ? "hoje" : `${dataAmigavel(dia)}`} no plano. Toque em quem veio.</p>
          <div className="g-busca"><Search /><input className="g-input" type="search" placeholder="Nome do pet ou do tutor" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="g-lista">
            {lista.map((p) => (
              <button key={p.id} type="button" className="g-linha" onClick={() => setEscolhido(p)}>
                <AvatarPet pet={p.pets ?? { nome: "?" }} />
                <span className="t"><b>{p.pets?.nome}</b><span>{p.pets?.clientes?.nome ?? "Sem tutor"}</span></span>
                <DiasDoPlano dias={p.dias} />
              </button>
            ))}
            {!lista.length && <p className="g-muted g-p" style={{ padding: "12px 4px" }}>Nenhum mensalista para marcar. Pet sem plano entra pelo botão Nova reserva / Check-in.</p>}
          </div>
        </div>
      ) : (
        <div className="g-form">
          <div className="g-fila" style={{ flexWrap: "nowrap" }}>
            <AvatarPet pet={escolhido.pets ?? { nome: "?" }} />
            <div className="g-cresce"><b style={{ display: "block" }}>{escolhido.pets?.nome}</b><span className="g-muted g-p">{escolhido.pets?.clientes?.nome ?? "Sem tutor"}</span></div>
            <DiasDoPlano dias={escolhido.dias} />
          </div>
          {s?.vacinas.length ? <div className="g-aviso vermelho" role="alert" style={{ marginBottom: 0 }}><Syringe /><span className="g-cresce"><b>Vacina vencida:</b> {s.vacinas.join(", ")}.{petshop.creche_bloqueia_vacina ? " O bloqueio está ligado: só o dono libera a entrada." : " Confira a carteirinha."}</span></div> : null}
          {escolhido.pets?.alertas && <div className="g-aviso vermelho" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>Atenção:</b> {escolhido.pets.alertas}</span></div>}
          <label className="g-check">
            <input type="checkbox" checked={reposicao} onChange={(e) => setReposicao(e.target.checked)} />
            <span>É reposição de falta (não cobrar)</span>
          </label>
          <p className="g-muted g-p">
            {reposicao ? "O dia fica anotado como reposição e não entra na cobrança."
              : "O dia fica anotado como dia extra e entra na cobrança do mês que vem. Nada é cobrado na porta."}
          </p>
        </div>
      )}
    </Folha>
  );
}
