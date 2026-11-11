"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, BedDouble, CalendarClock, CalendarPlus, History, MessageCircle, NotebookPen, PawPrint, Pencil, Scissors, Ticket, UserRound, Wallet } from "lucide-react";
import type { Agendamento, Cliente, Estadia, PacoteCliente, Pet } from "@/lib/gestao/tipos";
import { STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, haQuanto, hora, idade, inicioDoDia, linkWhatsApp, nomeDiaCurto } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { Anel, Tile, type Tom } from "../painel";
import { AvatarPet, avisarMudanca, Esqueleto, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { linkTutor, nomePorte, primeiroNome } from "./comum";
import { EtiquetaEspecie, tomDaVisita } from "./lista";

type PetDaFicha = Pet & { clientes: Cliente | null };
type Atendimento = Pick<Agendamento, "id" | "inicio" | "status" | "preco" | "servico_id">;

const mesDoAno = (d: string) => new Date(d).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const TOM_VISITA: Record<string, Tom> = { verde: "menta", amarelo: "manteiga", vermelho: "rosa" };

const STATUS_ESTADIA: Record<string, { rotulo: string; tom: string }> = {
  reservada: { rotulo: "Reservada", tom: "azul" },
  em_casa: { rotulo: "Está aqui", tom: "laranja" },
  encerrada: { rotulo: "Encerrada", tom: "verde" },
  cancelada: { rotulo: "Cancelada", tom: "vermelho" },
};

export default function FichaPet({ id, voltar }: { id: string; voltar: () => void }) {
  const { sb, petshop, servicos, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [pet, atendimentos, pacotes, estadias, concluidos] = await Promise.all([
      sb.from("pets").select("*, clientes(*)").eq("petshop_id", petshop.id).eq("id", id).maybeSingle(),
      sb.from("agendamentos").select("id, inicio, status, preco, servico_id").eq("petshop_id", petshop.id).eq("pet_id", id).order("inicio", { ascending: false }).limit(60),
      sb.from("pacotes_clientes").select("*").eq("petshop_id", petshop.id).eq("pet_id", id).eq("ativo", true).order("comprado_em", { ascending: false }),
      sb.from("estadias").select("*").eq("petshop_id", petshop.id).eq("pet_id", id).order("entrada", { ascending: false }).limit(8),
      // visitas concluídas: a conta exata, a mais recente e os valores para somar
      sb.from("agendamentos").select("inicio, preco", { count: "exact" }).eq("petshop_id", petshop.id).eq("pet_id", id).eq("status", "concluido").order("inicio", { ascending: false }).limit(1000),
    ]);
    for (const r of [pet, atendimentos, pacotes, estadias, concluidos]) if (r.error) throw new Error(r.error.message);
    const feitos = (concluidos.data ?? []) as { inicio: string; preco: number | null }[];
    return {
      pet: pet.data as unknown as PetDaFicha | null,
      atendimentos: (atendimentos.data ?? []) as Atendimento[],
      pacotes: (pacotes.data ?? []) as PacoteCliente[],
      estadias: (estadias.data ?? []) as Estadia[],
      visitas: concluidos.count ?? feitos.length,
      ultimaVisita: feitos[0]?.inicio ?? null,
      gasto: feitos.reduce((t, a) => t + Number(a.preco ?? 0), 0),
      gastoParcial: (concluidos.count ?? 0) > feitos.length,
    };
  }, [petshop.id, id]);

  const botaoVoltar = <button className="g-voltar" onClick={voltar}><ArrowLeft />Voltar</button>;

  if (erro && !dados) {
    return <>{botaoVoltar}<Vazio titulo="Não consegui abrir a ficha" texto={erro}><button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button></Vazio></>;
  }
  if (carregando && !dados) return <>{botaoVoltar}<Esqueleto linhas={5} /></>;
  if (!dados?.pet) {
    return <>{botaoVoltar}<Vazio titulo="Não achei esse pet" texto="Pode ser que a ficha tenha sido apagada."><button className="g-btn verde" onClick={voltar}>Ver a lista</button></Vazio></>;
  }

  const { pet, atendimentos, pacotes, estadias, visitas, ultimaVisita, gasto, gastoParcial } = dados;
  const tutor = pet.clientes;
  const zap = tutor ? linkWhatsApp(tutor.telefone, `Oi, ${primeiroNome(tutor.nome)}! Aqui é do ${petshop.nome}. `) : null;
  const etiquetas = [pet.raca, pet.porte ? `Porte ${nomePorte(pet.porte).toLowerCase()}` : null, pet.sexo === "M" ? "Macho" : pet.sexo === "F" ? "Fêmea" : null, idade(pet.nascimento)]
    .filter((x): x is string => !!x);
  const agora = new Date();
  const hoje = inicioDoDia(agora);
  const servicoDe = (sid: string | null) => servicos.find((s) => s.id === sid);
  // o histórico vem do mais novo para o mais antigo: o próximo horário é o último que ainda está por vir
  const porVir = atendimentos.filter((a) => new Date(a.inicio) > agora && !["cancelado", "faltou", "concluido"].includes(a.status));
  const proximo = porVir[porVir.length - 1] ?? null;
  const tomHeroi = pet.especie === "gato" ? "lilas" : pet.especie === "cao" ? "pessego" : "menta";
  const tomVisita = TOM_VISITA[tomDaVisita(ultimaVisita, agora.getTime())] ?? "ceu";

  async function mudarAtivo(ativo: boolean) {
    if (somenteLeitura() || ocupado) return;
    if (!ativo && !(await confirmar({
      titulo: `Desativar ${pet.nome}?`,
      texto: "Ele sai da lista e da busca da agenda. O histórico fica guardado e dá para reativar quando quiser.",
      confirmar: "Desativar", perigo: true,
    }))) return;
    setOcupado(true);
    try {
      ok(await sb.from("pets").update({ ativo }).eq("id", pet.id).eq("petshop_id", petshop.id).select("id").single());
      avisar(ativo ? `${pet.nome} voltou para a lista.` : `${pet.nome} foi desativado.`);
      avisarMudanca(); // recarrega esta ficha e a lista
    } catch (e) { avisarErro(e); }
    setOcupado(false);
  }

  return (
    <div className="gc-ficha">
      <div>
        {botaoVoltar}
        <section className={`g-cli-heroi ${tomHeroi}`}>
          <PawPrint className="fundo" aria-hidden />
          <div className="quem">
            <AvatarPet pet={pet} tamanho="gg" />
            <div>
              <h1>{pet.nome}</h1>
              {tutor && <p className="tutor"><UserRound aria-hidden />Tutor: <Link className="g-link" href={linkTutor(tutor.id)} scroll={false}>{tutor.nome}</Link></p>}
              <div className="g-cli-etqs">
                <EtiquetaEspecie especie={pet.especie} />
                {etiquetas.map((e) => <span key={e} className="g-cli-etq">{e}</span>)}
                {!pet.ativo && <span className="g-cli-etq rosa">Desativado</span>}
              </div>
            </div>
          </div>
          <div className="gc-botoes">
            {pet.ativo && <Link className="g-btn pri" href={`/gestao/app/agenda?novo=1&pet=${pet.id}`}><CalendarPlus />Agendar</Link>}
            {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
            <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setEditando(true); }}><Pencil />Editar</button>
          </div>
        </section>
      </div>

      {!pet.ativo && (
        <div className="g-aviso">
          <span className="g-cresce">Este pet está desativado. Ele não aparece na lista nem na agenda.</span>
          <button className="g-btn sec p" onClick={() => void mudarAtivo(true)} disabled={ocupado}>Reativar</button>
        </div>
      )}
      {pet.alertas?.trim() && (
        <div className="g-cli-alerta" role="note">
          <Tile icone={AlertTriangle} tom="rosa" />
          <div className="g-cresce">
            <b>Cuidados e alertas</b>
            <p className="gc-texto">{pet.alertas}</p>
          </div>
        </div>
      )}

      <div className="g-cli-nums">
        <div className="g-cli-num">
          <Tile icone={Scissors} tom="pessego" />
          <div><span className="g-rotulo">Visitas</span><b className="g-tab">{visitas}</b><small>{visitas === 1 ? "atendimento concluído" : "atendimentos concluídos"}</small></div>
        </div>
        <div className="g-cli-num">
          <Tile icone={History} tom={tomVisita} />
          <div><span className="g-rotulo">Última visita</span><b>{ultimaVisita ? haQuanto(ultimaVisita) : "ainda não veio"}</b>{ultimaVisita && <small>{dataCompleta(ultimaVisita)}</small>}</div>
        </div>
        <div className="g-cli-num">
          <Tile icone={CalendarClock} tom="ceu" />
          <div><span className="g-rotulo">Próximo horário</span><b>{proximo ? dataAmigavel(proximo.inicio) : "nada marcado"}</b>{proximo && <small>às {hora(proximo.inicio)} · {servicoDe(proximo.servico_id)?.nome ?? "Atendimento"}</small>}</div>
        </div>
        {vejoFinanceiro ? (
          <div className="g-cli-num">
            <Tile icone={Wallet} tom="menta" />
            <div><span className="g-rotulo">Gasto em atendimentos</span><b className="g-tab">{brl(gasto)}</b><small>{gastoParcial ? "nos 1.000 mais recentes" : "soma dos concluídos"}</small></div>
          </div>
        ) : (
          <div className="g-cli-num">
            <Tile icone={Ticket} tom="lilas" />
            <div><span className="g-rotulo">Pacotes ativos</span><b className="g-tab">{pacotes.length}</b><small>{pacotes.length === 1 ? "em uso" : "em uso agora"}</small></div>
          </div>
        )}
      </div>

      <div className="gc-colunas">
        <div>
          <section className="g-card">
            <div className="g-card-t"><h3><Tile icone={History} tom="pessego" tamanho="p" />Histórico de atendimentos</h3>{atendimentos.length > 0 && <span className="g-muted g-pp" style={{ whiteSpace: "nowrap" }}>{atendimentos.length === 60 ? "60 mais recentes" : atendimentos.length === 1 ? "1 horário" : `${atendimentos.length} horários`}</span>}</div>
            {!atendimentos.length ? <p className="g-muted g-p">{pet.nome} ainda não tem atendimento marcado.</p> : (
              <ol className="g-cli-tempo">
                {atendimentos.map((a, i) => {
                  const st = STATUS_AGENDAMENTO[a.status];
                  const mes = mesDoAno(a.inicio);
                  const fora = ["cancelado", "faltou"].includes(a.status);
                  const futuro = !fora && a.status !== "concluido" && new Date(a.inicio) > agora;
                  return (
                    <Fragment key={a.id}>
                      {(i === 0 || mes !== mesDoAno(atendimentos[i - 1].inicio)) && <li className="mes"><span className="g-rotulo">{mes}</span></li>}
                      <li className={fora ? "fora" : futuro ? "futuro" : undefined} style={{ "--cor": servicoDe(a.servico_id)?.cor ?? "#f97316" } as React.CSSProperties}>
                        <span className="ponto" aria-hidden />
                        <div className="c">
                          <div className="l">
                            <b>{servicoDe(a.servico_id)?.nome ?? "Atendimento"}</b>
                            <span className={`g-tag ${st.tom}`}>{st.rotulo}</span>
                          </div>
                          <span className="q">
                            {nomeDiaCurto(new Date(a.inicio))}, {dataCurta(a.inicio)} às {hora(a.inicio)}
                            {vejoFinanceiro && a.preco != null && <> · <b className="g-tab">{brl(a.preco)}</b></>}
                          </span>
                        </div>
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
            )}
            {atendimentos.length === 60 && <p className="g-pp g-muted" style={{ marginTop: 8 }}>Aqui aparecem os 60 mais recentes.</p>}
          </section>
        </div>

        <div>
          {pet.obs?.trim() && (
            <section className="g-card">
              <div className="g-card-t"><h3><Tile icone={NotebookPen} tom="manteiga" tamanho="p" />Observações</h3></div>
              <p className="gc-texto">{pet.obs}</p>
            </section>
          )}

          <section className="g-card">
            <div className="g-card-t"><h3><Tile icone={Ticket} tom="lilas" tamanho="p" />Pacotes ativos</h3></div>
            {!pacotes.length ? <p className="g-muted g-p">Nenhum pacote em uso.</p> : pacotes.map((p) => {
              const venceu = !!p.vence_em && deIsoDia(p.vence_em) < hoje;
              const acabou = p.usados >= p.total;
              return (
                <div key={p.id} className="gc-pacote g-cli-pacote">
                  <Anel parte={p.total ? p.usados / p.total : 0} tamanho={52} cor={venceu || acabou ? "var(--g-laranja)" : "#7c62c0"}>{p.usados}/{p.total}</Anel>
                  <div>
                    <b>{p.nome}</b>
                    <div className={`g-prog${venceu || acabou ? " laranja" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={Math.min(p.usados, p.total)}>
                      <i style={{ width: `${Math.min(100, (p.usados / p.total) * 100)}%` }} />
                    </div>
                    <span className="g-pp g-muted">
                      {acabou ? "Todos usados" : p.total - p.usados === 1 ? "Falta 1" : `Faltam ${p.total - p.usados}`}
                      {p.vence_em ? ` · ${venceu ? "venceu em" : "vale até"} ${dataCompleta(p.vence_em)}` : " · sem validade"}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="g-card">
            <div className="g-card-t"><h3><Tile icone={BedDouble} tom="ceu" tamanho="p" />Creche e hotel</h3></div>
            {!estadias.length ? <p className="g-muted g-p">Nenhuma estadia por enquanto.</p> : (
              <div className="g-lista">
                {estadias.map((e) => {
                  const st = STATUS_ESTADIA[e.status] ?? { rotulo: e.status, tom: "" };
                  const ate = e.saida ?? e.saida_prevista;
                  return (
                    <div key={e.id} className="g-linha">
                      <span className="t">
                        <b>{e.tipo === "hotel" ? "Hotel" : "Creche"}</b>
                        <span>{dataCompleta(e.entrada)}{ate && dataCompleta(ate) !== dataCompleta(e.entrada) ? ` a ${dataCurta(ate)}` : ""}</span>
                      </span>
                      <span className="d"><span className={`g-tag ${st.tom}`}>{st.rotulo}</span></span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {pet.ativo && (
            <div><button className="g-btn perigo p" onClick={() => void mudarAtivo(false)} disabled={ocupado}>Desativar pet</button></div>
          )}
        </div>
      </div>

      {editando && <FormPet pet={pet} aoFechar={() => setEditando(false)} aoSalvar={() => { setEditando(false); avisarMudanca(); }} />}
    </div>
  );
}
