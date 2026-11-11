"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CalendarPlus, MessageCircle, Pencil } from "lucide-react";
import type { Agendamento, Cliente, Estadia, PacoteCliente, Pet } from "@/lib/gestao/tipos";
import { STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { brl, dataCompleta, dataCurta, deIsoDia, hora, idade, inicioDoDia, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { AvatarPet, avisarMudanca, Esqueleto, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { ESPECIES, linkTutor, nomePorte, primeiroNome } from "./comum";

type PetDaFicha = Pet & { clientes: Cliente | null };
type Atendimento = Pick<Agendamento, "id" | "inicio" | "status" | "preco" | "servico_id">;

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
    const [pet, atendimentos, pacotes, estadias] = await Promise.all([
      sb.from("pets").select("*, clientes(*)").eq("petshop_id", petshop.id).eq("id", id).maybeSingle(),
      sb.from("agendamentos").select("id, inicio, status, preco, servico_id").eq("petshop_id", petshop.id).eq("pet_id", id).order("inicio", { ascending: false }).limit(60),
      sb.from("pacotes_clientes").select("*").eq("petshop_id", petshop.id).eq("pet_id", id).eq("ativo", true).order("comprado_em", { ascending: false }),
      sb.from("estadias").select("*").eq("petshop_id", petshop.id).eq("pet_id", id).order("entrada", { ascending: false }).limit(8),
    ]);
    for (const r of [pet, atendimentos, pacotes, estadias]) if (r.error) throw new Error(r.error.message);
    return {
      pet: pet.data as unknown as PetDaFicha | null,
      atendimentos: (atendimentos.data ?? []) as Atendimento[],
      pacotes: (pacotes.data ?? []) as PacoteCliente[],
      estadias: (estadias.data ?? []) as Estadia[],
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

  const { pet, atendimentos, pacotes, estadias } = dados;
  const tutor = pet.clientes;
  const zap = tutor ? linkWhatsApp(tutor.telefone, `Oi, ${primeiroNome(tutor.nome)}! Aqui é do ${petshop.nome}. `) : null;
  const resumo = [ESPECIES[pet.especie], pet.raca, pet.porte ? `porte ${nomePorte(pet.porte).toLowerCase()}` : null, pet.sexo === "M" ? "macho" : pet.sexo === "F" ? "fêmea" : null, idade(pet.nascimento)]
    .filter(Boolean).join(" · ");
  const hoje = inicioDoDia(new Date());
  const nomeServico = (sid: string | null) => servicos.find((s) => s.id === sid)?.nome ?? "Atendimento";

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
        <div className="gc-cab">
          <AvatarPet pet={pet} tamanho="gg" />
          <div>
            <h1>{pet.nome}</h1>
            {tutor && <p>Tutor: <Link className="g-link" href={linkTutor(tutor.id)} scroll={false}>{tutor.nome}</Link></p>}
            {resumo && <p className="g-muted g-p">{resumo}</p>}
          </div>
        </div>
      </div>

      {!pet.ativo && (
        <div className="g-aviso">
          <span className="g-cresce">Este pet está desativado. Ele não aparece na lista nem na agenda.</span>
          <button className="g-btn sec p" onClick={() => void mudarAtivo(true)} disabled={ocupado}>Reativar</button>
        </div>
      )}
      {pet.alertas?.trim() && (
        <div className="g-aviso vermelho" role="note">
          <AlertTriangle />
          <span className="g-cresce gc-texto"><b>Cuidados e alertas</b><br />{pet.alertas}</span>
        </div>
      )}

      <div className="gc-botoes">
        {pet.ativo && <Link className="g-btn pri" href={`/gestao/app/agenda?novo=1&pet=${pet.id}`}><CalendarPlus />Agendar</Link>}
        {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />WhatsApp</a>}
        <button className="g-btn sec" onClick={() => { if (!somenteLeitura()) setEditando(true); }}><Pencil />Editar</button>
      </div>

      <div className="gc-colunas">
        <div>
          <section className="g-card">
            <div className="g-card-t"><h3>Histórico de atendimentos</h3></div>
            {!atendimentos.length ? <p className="g-muted g-p">{pet.nome} ainda não tem atendimento marcado.</p> : (
              <div className="g-lista">
                {atendimentos.map((a) => {
                  const st = STATUS_AGENDAMENTO[a.status];
                  return (
                    <div key={a.id} className="g-linha">
                      <span className="t">
                        <b>{nomeServico(a.servico_id)}</b>
                        <span>{dataCompleta(a.inicio)} às {hora(a.inicio)}</span>
                      </span>
                      <span className="d gc-linha-tags">
                        <span className={`g-tag ${st.tom}`}>{st.rotulo}</span>
                        {vejoFinanceiro && a.preco != null && <span className="g-pp g-muted">{brl(a.preco)}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {atendimentos.length === 60 && <p className="g-pp g-muted" style={{ marginTop: 8 }}>Aqui aparecem os 60 mais recentes.</p>}
          </section>
        </div>

        <div>
          {pet.obs?.trim() && (
            <section className="g-card">
              <div className="g-card-t"><h3>Observações</h3></div>
              <p className="gc-texto">{pet.obs}</p>
            </section>
          )}

          <section className="g-card">
            <div className="g-card-t"><h3>Pacotes ativos</h3></div>
            {!pacotes.length ? <p className="g-muted g-p">Nenhum pacote em uso.</p> : pacotes.map((p) => {
              const venceu = !!p.vence_em && deIsoDia(p.vence_em) < hoje;
              const acabou = p.usados >= p.total;
              return (
                <div key={p.id} className="gc-pacote">
                  <div className="g-fila entre">
                    <b>{p.nome}</b>
                    <span className="g-tab g-p">{p.usados} de {p.total}</span>
                  </div>
                  <div className={`g-prog${venceu || acabou ? " laranja" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={Math.min(p.usados, p.total)}>
                    <i style={{ width: `${Math.min(100, (p.usados / p.total) * 100)}%` }} />
                  </div>
                  <span className="g-pp g-muted">
                    {acabou ? "Todos usados" : p.total - p.usados === 1 ? "Falta 1" : `Faltam ${p.total - p.usados}`}
                    {p.vence_em ? ` · ${venceu ? "venceu em" : "vale até"} ${dataCompleta(p.vence_em)}` : " · sem validade"}
                  </span>
                </div>
              );
            })}
          </section>

          <section className="g-card">
            <div className="g-card-t"><h3>Creche e hotel</h3></div>
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
