"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Link2, MessageCircle, X } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPet, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import type { Database } from "@/lib/gestao/banco";
import { dataCurta, fmtTelefone, hora, inicioDoDia, linkWhatsApp, nomeDia, chamar } from "@/lib/gestao/util";
import "./pedidos-link.css";

type Pedido = Database["public"]["Tables"]["pedidos_agendamento"]["Row"];
type Respondido = { pedido: Pedido; servico: string | null; resposta: "aceito" | "recusado" };

const ESPECIE: Record<string, string> = { cao: "cão", gato: "gato", outro: "outro" };

/** "hoje", "amanhã" ou "sexta, 14/11" (para mostrar na tela). */
function quandoNaTela(inicio: string) {
  const d = new Date(inicio);
  const dif = Math.round((inicioDoDia(d).getTime() - inicioDoDia(new Date()).getTime()) / 864e5);
  return dif === 0 ? "hoje" : dif === 1 ? "amanhã" : `${nomeDia(d)}, ${dataCurta(d)}`;
}
/** "hoje", "amanhã" ou "na sexta, 14/11" (para caber numa frase). */
function quandoNaFrase(inicio: string) {
  const d = new Date(inicio);
  const dif = Math.round((inicioDoDia(d).getTime() - inicioDoDia(new Date()).getTime()) / 864e5);
  if (dif === 0) return "hoje";
  if (dif === 1) return "amanhã";
  const fimDeSemana = d.getDay() === 0 || d.getDay() === 6;
  return `${fimDeSemana ? "no" : "na"} ${nomeDia(d)}, ${dataCurta(d)}`;
}
/** Pedido de creche ou de hotel: vira reserva em Creche e hotel, não horário na agenda. */
const ehEstadia = (p: Pedido) => p.tipo === "creche" || p.tipo === "hotel";
/** "sexta, 14/11" ou "de 14/11 a 17/11". */
function periodoDe(p: Pedido) {
  const a = new Date(p.inicio), b = new Date(p.fim);
  return inicioDoDia(a).getTime() === inicioDoDia(b).getTime() ? `${nomeDia(a)}, ${dataCurta(a)}` : `de ${dataCurta(a)} a ${dataCurta(b)}`;
}
const primeiroNome = (nome: string) => chamar(nome);
const textoDoErro = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e ?? ""));
/** "Nina", "Nina e Bob", "Nina, Bob e Mel". */
const listaDe = (itens: string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);
/** Pedidos feitos juntos (vários pets do mesmo tutor) têm o mesmo `grupo_id`; pedido sozinho é o próprio grupo. */
const chaveDe = (p: Pedido) => p.grupo_id ?? p.id;
function agrupar<T>(itens: T[], chave: (x: T) => string) {
  const grupos = new Map<string, T[]>();
  for (const x of itens) grupos.set(chave(x), [...(grupos.get(chave(x)) ?? []), x]);
  return [...grupos.entries()].map(([id, lista]) => ({ id, lista }));
}
const porHora = (a: Pedido, b: Pedido) => a.inicio.localeCompare(b.inicio) || new Date(a.inicio).getTime() - new Date(b.inicio).getTime();

/**
 * Pedidos que chegaram pelo link de agendamento e esperam resposta.
 * Sem pedido, não aparece nada. Vários pets do mesmo tutor vêm num cartão só, com "Aceitar todos".
 * Depois de aceitar ou recusar, fica um atalho para avisar o tutor no WhatsApp.
 */
export default function PedidosLink() {
  const { sb, petshop, equipe, servicos } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [quem, setQuem] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [respondidos, setRespondidos] = useState<Respondido[]>([]);

  const { dados, recarregar } = useDados(async () =>
    ok(await sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).eq("status", "pendente").order("inicio").limit(100)) as Pedido[],
  [petshop.id]);

  // o pedido chega de fora: olha de novo a cada minuto e quando a pessoa volta para a aba
  useEffect(() => {
    const olhar = () => { if (document.visibilityState === "visible") void recarregar(); };
    const relogio = setInterval(olhar, 60_000);
    document.addEventListener("visibilitychange", olhar);
    return () => { clearInterval(relogio); document.removeEventListener("visibilitychange", olhar); };
  }, [recarregar]);

  const atendem = equipe.filter((p) => p.ativo && p.atende);
  const nomeServico = (id: string | null) => servicos.find((s) => s.id === id)?.nome ?? null;
  const rotulo = (p: Pedido) => (p.tipo === "creche" ? "Creche" : p.tipo === "hotel" ? "Hotel" : nomeServico(p.servico_id));
  const corServico = (id: string | null) => servicos.find((s) => s.id === id)?.cor ?? "#f97316";
  const pendentes = (dados ?? []).filter((p) => !respondidos.some((r) => r.pedido.id === p.id));
  const gruposPendentes = agrupar(pendentes, chaveDe).map((g) => ({ ...g, lista: [...g.lista].sort(porHora) }));
  // um cartão por tutor e por resposta: quem aceitou dois pets avisa os dois numa mensagem só
  const gruposRespondidos = agrupar(respondidos, (r) => `${chaveDe(r.pedido)}:${r.resposta}`)
    .map((g) => ({ ...g, lista: [...g.lista].sort((a, b) => porHora(a.pedido, b.pedido)) }));

  /** Marca os pedidos na agenda, um por um. Se algum falhar, os outros seguem e o erro aparece no fim. */
  async function aceitar(lista: Pedido[], grupo: string) {
    if (somenteLeitura() || ocupado) return;
    const profissional = atendem.length > 1 ? quem[grupo] || undefined : atendem[0]?.id;
    setOcupado(lista.length > 1 ? grupo : lista[0].id);
    const feitos: Pedido[] = [];
    let falha: unknown = null;
    for (const p of lista) {
      const args = { p_id: p.id, p_profissional: ehEstadia(p) ? undefined : profissional };
      try {
        ok(await sb.rpc("pedido_aceitar", args));
        feitos.push(p);
      } catch (e) {
        // creche ou hotel sem vaga em algum dia: o banco recusa e explica; a pessoa decide se aceita assim mesmo
        const cheia = /CASA_CHEIA:\s*(.+)/.exec(textoDoErro(e))?.[1]?.trim();
        if (!cheia) { falha ??= e; continue; }
        const forcar = await confirmar({
          titulo: "Casa cheia",
          texto: `${cheia.charAt(0).toUpperCase()}${cheia.slice(1)} Aceitar o pedido de ${p.pet_nome} mesmo assim? Se não, o pedido continua esperando a sua resposta.`,
          confirmar: "Aceitar mesmo assim", perigo: true,
        });
        if (!forcar) continue; // desistiu: o pedido segue pendente
        try {
          ok(await sb.rpc("pedido_aceitar", { ...args, p_forcar: true }));
          feitos.push(p);
        } catch (e2) { falha ??= e2; }
      }
    }
    if (feitos.length) {
      setRespondidos((r) => [...r, ...feitos.map((p) => ({ pedido: p, servico: rotulo(p), resposta: "aceito" as const }))]);
      avisar(feitos.length === 1 ? (ehEstadia(feitos[0]) ? `Reserva de ${feitos[0].pet_nome} feita. Ela está em Creche e hotel.` : `Horário de ${feitos[0].pet_nome} marcado.`) : `Horários de ${listaDe(feitos.map((p) => p.pet_nome))} marcados.`);
      avisarMudanca();
    }
    if (falha) { avisarErro(falha); void recarregar(); }
    setOcupado(null);
  }

  async function recusar(lista: Pedido[], grupo: string) {
    if (somenteLeitura() || ocupado) return;
    const nomes = listaDe(lista.map((p) => p.pet_nome));
    const sim = await confirmar({
      titulo: lista.length > 1 ? `Recusar os pedidos de ${nomes}?` : `Recusar o pedido de ${nomes}?`,
      texto: `${lista.every(ehEstadia) ? (lista.length > 1 ? "As vagas voltam a ficar livres" : "A vaga volta a ficar livre") : lista.length > 1 ? "Os horários voltam a ficar livres" : "O horário volta a ficar livre"} no link. Depois é só avisar o tutor pelo WhatsApp.`,
      confirmar: lista.length > 1 ? "Recusar todos" : "Recusar", perigo: true,
    });
    if (!sim) return;
    setOcupado(lista.length > 1 ? grupo : lista[0].id);
    try {
      const linhas = ok(await sb.from("pedidos_agendamento").update({ status: "recusado" }).in("id", lista.map((p) => p.id)).eq("petshop_id", petshop.id).eq("status", "pendente").select("id"));
      const feitos = lista.filter((p) => linhas.some((l) => l.id === p.id));
      if (!feitos.length) throw new Error(lista.length > 1 ? "Esses pedidos já foram respondidos." : "Esse pedido já foi respondido.");
      setRespondidos((r) => [...r, ...feitos.map((p) => ({ pedido: p, servico: rotulo(p), resposta: "recusado" as const }))]);
      avisar(feitos.length > 1 ? "Pedidos recusados." : "Pedido recusado.");
      void recarregar();
    } catch (e) {
      avisarErro(e);
      void recarregar();
    } finally { setOcupado(null); }
  }

  /** Mensagem pronta para o tutor: cita todos os pets da mesma resposta e o horário de cada um. */
  function mensagem(lista: Respondido[]) {
    const p = lista[0].pedido;
    const oi = `Oi, ${primeiroNome(p.tutor_nome)}! Aqui é do ${petshop.nome}.`;
    const nomes = listaDe(lista.map((r) => r.pedido.pet_nome));
    // endereços para o tutor: a página do pedido (confirmação) e o link para escolher outro horário (recusa)
    const base = `${window.location.origin}/gestao/agendar/${petshop.link_codigo}`;
    const acompanhar = `\n\nVeja a confirmação aqui: ${base}/pedido/${p.id}`;
    if (ehEstadia(p)) {
      const oQue = `${p.tipo === "hotel" ? "o hotel" : "a creche"} de ${p.pet_nome}, ${periodoDe(p)}`;
      return lista[0].resposta === "recusado"
        ? `${oi} Recebemos o seu pedido para ${oQue}, mas não temos vaga nessas datas. Você pode escolher outras datas aqui: ${base}\n\nSe preferir, me diga o período que fica bom para você.`
        : `${oi} Está confirmado: ${oQue}. Esperamos vocês!${acompanhar}`;
    }
    if (lista[0].resposta === "recusado") {
      return `${oi} Recebemos o seu pedido para ${nomes}, mas ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}, não vamos conseguir atender. Você pode escolher outro horário livre aqui: ${base}\n\nSe preferir, me diga os dias e períodos que ficam bons para você.`;
    }
    if (lista.length === 1) {
      const oQue = lista[0].servico ? `${lista[0].servico} de ${p.pet_nome}` : `horário de ${p.pet_nome}`;
      return `${oi} Está confirmado: ${oQue} ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}. Esperamos vocês!${acompanhar}`;
    }
    // cada pet com o seu serviço, o seu dia e a sua hora (o dia só se repete quando muda)
    const linhas = lista.map((r, i) => {
      const dia = quandoNaFrase(r.pedido.inicio);
      const mesmoDia = i > 0 && dia === quandoNaFrase(lista[i - 1].pedido.inicio);
      return `${r.servico ? `${r.servico} de ${r.pedido.pet_nome}` : r.pedido.pet_nome} ${mesmoDia ? "" : `${dia}, `}às ${hora(r.pedido.inicio)}`;
    });
    return `${oi} Está confirmado: ${listaDe(linhas)}. Esperamos vocês!${acompanhar}`;
  }

  if (!pendentes.length && !respondidos.length) return null;
  // conta gente, não pedido: o mesmo tutor (telefone) com vários pedidos é um só
  const esperam = new Set(pendentes.map((p) => p.telefone.replace(/\D/g, "").slice(-8) || p.id)).size;

  return (
    <section className="g-pl" aria-label="Pedidos pelo link">
      <div className="g-pl-t">
        <span className="g-pl-ico" aria-hidden><Link2 /></span>
        <div>
          <h2>Pedidos pelo link</h2>
          <p className="g-p">{esperam === 0 ? "Tudo respondido. Falta só avisar o tutor." : esperam === 1 ? "1 tutor espera a sua resposta." : `${esperam} tutores esperam a sua resposta.`}</p>
        </div>
        {pendentes.length > 0 && <span className="g-tag laranja">{pendentes.length}</span>}
      </div>

      <div className="g-pl-lista">
        {gruposRespondidos.map((g) => {
          const p = g.lista[0].pedido;
          const aceito = g.lista[0].resposta === "aceito";
          const zap = linkWhatsApp(p.telefone, mensagem(g.lista));
          const varios = g.lista.length > 1;
          return (
            <article key={g.id} className={`g-pl-item respondido ${g.lista[0].resposta}`}>
              <div className="g-pl-quem">
                <span className="g-pl-feito" aria-hidden>{aceito ? <Check /> : <X />}</span>
                <div className="g-pl-nome">
                  <b>{listaDe(g.lista.map((r) => r.pedido.pet_nome))}</b>
                  <span>
                    {!aceito ? (varios ? "Pedidos recusados." : "Pedido recusado.")
                      : varios ? `Marcados para ${quandoNaTela(p.inicio)}: ${listaDe(g.lista.map((r) => `${r.pedido.pet_nome} às ${hora(r.pedido.inicio)}`))}.`
                      : ehEstadia(p) ? `Reserva de ${p.tipo === "hotel" ? "hotel" : "creche"} feita: ${periodoDe(p)}.`
                      : `Marcado para ${quandoNaTela(p.inicio)}, às ${hora(p.inicio)}.`} Avise {primeiroNome(p.tutor_nome)}.
                  </span>
                </div>
              </div>
              <div className="g-pl-acoes">
                {zap && (
                  <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer">
                    <MessageCircle />{aceito ? "Confirmar no WhatsApp" : ehEstadia(p) ? "Sugerir outras datas" : "Sugerir outro horário"}
                  </a>
                )}
                <button type="button" className="g-btn fantasma p" onClick={() => setRespondidos((l) => l.filter((x) => !g.lista.includes(x)))}>Fechar</button>
              </div>
            </article>
          );
        })}

        {gruposPendentes.map((g) => {
          const p = g.lista[0];
          const varios = g.lista.length > 1;
          const servico = rotulo(p);
          const fim = g.lista[g.lista.length - 1].fim;
          const passou = new Date(p.inicio).getTime() < Date.now();
          const detalhesDe = (x: Pedido) => [ESPECIE[x.especie] ?? null, x.porte ? `porte ${x.porte}` : null].filter(Boolean).join(", ");
          const nomes = listaDe(g.lista.map((x) => x.pet_nome));
          const seletor = atendem.length > 1 && !ehEstadia(p) && (
            <select className="g-select g-pl-com" aria-label={`Quem atende ${nomes}`} value={quem[g.id] ?? ""} onChange={(e) => setQuem((q) => ({ ...q, [g.id]: e.target.value }))}>
              <option value="">Quem atende? Decidir depois</option>
              {atendem.map((x) => <option key={x.id} value={x.id}>Com {x.nome}</option>)}
            </select>
          );

          if (!varios) {
            const detalhes = detalhesDe(p);
            return (
              <article key={g.id} className="g-pl-item" style={{ "--cor": p.tipo === "creche" ? "#3b9bd9" : p.tipo === "hotel" ? "#7c6bd6" : corServico(p.servico_id) } as React.CSSProperties}>
                <div className="g-pl-quem">
                  <AvatarPet pet={{ nome: p.pet_nome, especie: p.especie }} />
                  <div className="g-pl-nome">
                    <b>{p.pet_nome}{detalhes && <small> · {detalhes}</small>}</b>
                    <span>{p.tutor_nome} · {fmtTelefone(p.telefone)}</span>
                  </div>
                </div>
                <div className="g-pl-quando">
                  <span className="g-pl-serv"><i aria-hidden />{servico ?? "Serviço"}</span>
                  <span className="g-pl-hora"><Clock aria-hidden />{ehEstadia(p) ? periodoDe(p) : `${quandoNaTela(p.inicio)}, ${hora(p.inicio)}`}</span>
                  {passou && <span className="g-tag vermelho">{ehEstadia(p) ? "a data já passou" : "horário já passou"}</span>}
                </div>
                {p.obs && <p className="g-pl-obs">{p.obs}</p>}
                <div className="g-pl-acoes">
                  {seletor}
                  <button type="button" className="g-btn verde p" disabled={ocupado !== null} onClick={() => void aceitar([p], g.id)}><Check />{ocupado === p.id ? "Um instante…" : "Aceitar"}</button>
                  <button type="button" className="g-btn sec p" disabled={ocupado !== null} onClick={() => void recusar([p], g.id)}>Recusar</button>
                </div>
              </article>
            );
          }

          return (
            <article key={g.id} className="g-pl-item" style={{ "--cor": corServico(p.servico_id) } as React.CSSProperties}>
              <div className="g-pl-quem">
                <span className="g-pl-varios" aria-hidden>
                  {g.lista.slice(0, 3).map((x) => <AvatarPet key={x.id} pet={{ nome: x.pet_nome, especie: x.especie }} />)}
                </span>
                <div className="g-pl-nome">
                  <b>{nomes} <small>· {primeiroNome(p.tutor_nome)}</small></b>
                  <span>{p.tutor_nome} · {fmtTelefone(p.telefone)}</span>
                </div>
              </div>
              <div className="g-pl-quando">
                <span className="g-pl-serv"><i aria-hidden />{servico ?? "Serviço"}</span>
                <span className="g-pl-hora"><Clock aria-hidden />{quandoNaTela(p.inicio)}, das {hora(p.inicio)} às {hora(fim)}</span>
                <span className="g-tag azul">{g.lista.length} pets, um depois do outro</span>
                {passou && <span className="g-tag vermelho">horário já passou</span>}
              </div>
              <ul className="g-pl-pets">
                {g.lista.map((x) => {
                  const detalhes = detalhesDe(x);
                  return (
                    <li key={x.id}>
                      <span className="g-pl-pet-h">{hora(x.inicio)}</span>
                      <span className="g-pl-pet-n"><b>{x.pet_nome}</b>{detalhes && <small>{detalhes}</small>}</span>
                      <span className="g-pl-pet-b">
                        <button type="button" className="g-btn sec p" disabled={ocupado !== null} aria-label={`Aceitar só ${x.pet_nome}`} onClick={() => void aceitar([x], g.id)}>{ocupado === x.id ? "…" : "Aceitar"}</button>
                        <button type="button" className="g-btn fantasma p" disabled={ocupado !== null} aria-label={`Recusar só ${x.pet_nome}`} onClick={() => void recusar([x], g.id)}>Recusar</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {p.obs && <p className="g-pl-obs">{p.obs}</p>}
              <div className="g-pl-acoes">
                {seletor}
                <button type="button" className="g-btn verde p" disabled={ocupado !== null} onClick={() => void aceitar(g.lista, g.id)}><Check />{ocupado === g.id ? "Um instante…" : "Aceitar todos"}</button>
                <button type="button" className="g-btn sec p" disabled={ocupado !== null} onClick={() => void recusar(g.lista, g.id)}>Recusar todos</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
