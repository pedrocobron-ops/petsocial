"use client";

import { saudacaoZap } from "@/lib/gestao/agenda";
import { useEffect, useState } from "react";
import { Check, Clock, Link2, MessageCircle, X } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPessoa, AvatarPet, Folha, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import type { Database } from "@/lib/gestao/banco";
import { abreNoDia } from "@/lib/gestao/creche";
import { porteDe, sinalDe } from "@/lib/gestao/hotel-opcoes";
import { brl } from "@/lib/gestao/util";
import { dataCurta, fmtTelefone, hora, inicioDoDia, isoDia, linkWhatsApp, nomeDia, somaDias, chamar, semAcento } from "@/lib/gestao/util";
import "./pedidos-link.css";

type Pedido = Database["public"]["Tables"]["pedidos_agendamento"]["Row"];
/** `tutor` é o nome de quem ficou com o pedido (o tutor que já existia, quando a pessoa escolheu usar a ficha dele). */
type Respondido = { pedido: Pedido; servico: string | null; resposta: "aceito" | "recusado"; tutor?: string };
type TutorDoTelefone = { id: string; nome: string; telefone: string | null };
/** O telefone do pedido já é de outro nome: espera a pessoa dizer se é a mesma. */
type Duvida = { lista: Pedido[]; grupo: string; existente: TutorDoTelefone };

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
/** Dias do pedido de creche em que o pet shop não abre (pelo horário de Meu pet shop). O aceite continua possível: é só um aviso. */
function fechadosDe(p: Pedido, horario: unknown): string[] {
  const dias: string[] = [];
  for (let d = inicioDoDia(new Date(p.inicio)), i = 0; d <= new Date(p.fim) && i < 62; d = somaDias(d, 1), i++) if (!abreNoDia(horario, isoDia(d))) dias.push(isoDia(d));
  return dias;
}
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
 * Depois de aceitar ou recusar, fica um atalho para avisar o tutor no WhatsApp. O atalho não some ao recarregar:
 * o pedido respondido continua na lista até alguém avisar o tutor (ou marcar "Já avisei"), e isso fica gravado no pedido.
 */
export default function PedidosLink() {
  const { sb, petshop, equipe, servicos } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [quem, setQuem] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  // nome de quem ficou com o pedido, quando a pessoa escolheu usar a ficha de um tutor que já existia (vale até recarregar)
  const [tutores, setTutores] = useState<Record<string, string>>({});
  const [duvida, setDuvida] = useState<Duvida | null>(null);

  const { dados: tudo, recarregar } = useDados(async () => {
    const [pendentes, semAviso] = await Promise.all([
      sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).eq("status", "pendente").order("inicio").limit(100),
      // respondidos em que o tutor ainda não foi avisado
      sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).in("status", ["aceito", "recusado"]).is("avisado_em", null).order("inicio").limit(60),
    ]);
    return { pendentes: ok(pendentes) as Pedido[], semAviso: (semAviso.data ?? []) as Pedido[] };
  }, [petshop.id]);
  const dados = tudo?.pendentes;

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
  const respondidos: Respondido[] = (tudo?.semAviso ?? []).map((p) => ({ pedido: p, servico: rotulo(p), resposta: p.status === "aceito" ? "aceito" : "recusado", tutor: tutores[p.id] }));
  const pendentes = dados ?? [];

  /** O tutor foi avisado (ou a pessoa disse que já avisou): o pedido sai da lista, em todos os aparelhos. */
  async function avisado(lista: Respondido[]) {
    try {
      ok(await sb.from("pedidos_agendamento").update({ avisado_em: new Date().toISOString() }).in("id", lista.map((r) => r.pedido.id)).eq("petshop_id", petshop.id).select("id"));
      void recarregar();
    } catch (e) { avisarErro(e); }
  }
  const gruposPendentes = agrupar(pendentes, chaveDe).map((g) => ({ ...g, lista: [...g.lista].sort(porHora) }));
  // um cartão por tutor e por resposta: quem aceitou dois pets avisa os dois numa mensagem só
  const gruposRespondidos = agrupar(respondidos, (r) => `${chaveDe(r.pedido)}:${r.resposta}`)
    .map((g) => ({ ...g, lista: [...g.lista].sort((a, b) => porHora(a.pedido, b.pedido)) }));

  /**
   * Marca os pedidos na agenda, um por um. Se algum falhar, os outros seguem e o erro aparece no fim.
   * Antes, confere se o telefone do pedido já é de um tutor com outro nome: aí pergunta se é a mesma pessoa
   * (`decisao`: "existente" usa a ficha que já existe; "novo" cria ou usa um tutor com o nome do pedido).
   */
  async function aceitar(lista: Pedido[], grupo: string, decisao?: { como: "existente" | "novo"; tutor?: string }) {
    if (somenteLeitura() || ocupado) return;
    const profissional = atendem.length > 1 ? quem[grupo] || undefined : atendem[0]?.id;
    setOcupado(lista.length > 1 ? grupo : lista[0].id);
    if (!decisao) {
      // sem resposta do banco, segue como sempre foi (o pedido entra no tutor que tem o telefone)
      const r = await sb.rpc("pedido_tutores_do_telefone", { p_id: lista[0].id });
      const donos = (r.error ? [] : r.data ?? []) as TutorDoTelefone[];
      const igual = donos.findIndex((c) => semAcento(c.nome) === semAcento(lista[0].tutor_nome));
      if (donos.length && igual < 0) { setDuvida({ lista, grupo, existente: donos[0] }); setOcupado(null); return; }
      // já existe um tutor com esse telefone e esse nome: é ele (mesmo que não seja o mais antigo com o número)
      decisao = { como: igual > 0 ? "novo" : "existente" };
    }
    const feitos: Pedido[] = [];
    let falha: unknown = null;
    for (const p of lista) {
      const args = { p_id: p.id, p_profissional: ehEstadia(p) ? undefined : profissional, p_tutor_novo: decisao.como === "novo" };
      try {
        acertarDiaria(p, ok(await sb.rpc("pedido_aceitar_como", args)));
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
          acertarDiaria(p, ok(await sb.rpc("pedido_aceitar_como", { ...args, p_forcar: true })));
          feitos.push(p);
        } catch (e2) { falha ??= e2; }
      }
    }
    if (feitos.length) {
      const tutor = decisao.tutor;
      if (tutor) setTutores((t) => ({ ...t, ...Object.fromEntries(feitos.map((p) => [p.id, tutor])) }));
      void recarregar();
      avisar(feitos.length === 1 ? (ehEstadia(feitos[0]) ? `Reserva de ${feitos[0].pet_nome} feita. Ela está em Creche e hotel.` : `Horário de ${feitos[0].pet_nome} marcado.`)
        : feitos.every(ehEstadia) ? `Reservas de ${listaDe(feitos.map((p) => p.pet_nome))} feitas. Elas estão em Creche e hotel.` : `Horários de ${listaDe(feitos.map((p) => p.pet_nome))} marcados.`);
      avisarMudanca();
    }
    if (falha) { avisarErro(falha); void recarregar(); }
    setOcupado(null);
  }

  /** Reserva de hotel aceita pelo link com a opção de diária por porte ligada: a diária da reserva passa a ser a do porte do pedido. */
  function acertarDiaria(p: Pedido, estadiaId: unknown) {
    if (p.tipo !== "hotel" || typeof estadiaId !== "string") return;
    // a conta é do banco: quem aceita o pedido pode não ver a lista de preços
    if (!porteDe(petshop).ativo || !p.porte) return;
    void sb.rpc("pedido_acertar_diaria", { p_id: p.id }).then(() => {}, () => {});
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
      avisar(feitos.length > 1 ? "Pedidos recusados." : "Pedido recusado.");
      void recarregar();
    } catch (e) {
      avisarErro(e);
      void recarregar();
    } finally { setOcupado(null); }
  }

  /** Com o sinal ligado nas opções do hotel, a confirmação já avisa que ele vai ser pedido (valor e o texto que o dono escreveu). */
  function fraseDoSinal(p: Pedido) {
    const s = sinalDe(petshop);
    if (!s.ativo || !s.valor || (p.tipo !== "hotel" && !s.creche)) return "";
    return ` Para garantir a reserva, pedimos um sinal de ${s.modo === "valor" ? brl(s.valor) : `${s.valor}% do valor da reserva`}.${s.politica.trim() ? ` ${s.politica.trim()}` : ""}`;
  }

  /** Mensagem pronta para o tutor: cita todos os pets da mesma resposta e o horário de cada um. */
  function mensagem(lista: Respondido[]) {
    const p = lista[0].pedido;
    const oi = saudacaoZap(lista[0].tutor ?? p.tutor_nome, petshop.nome);
    const nomes = listaDe(lista.map((r) => r.pedido.pet_nome));
    // endereços para o tutor: a página do pedido (confirmação) e o link para escolher outro horário (recusa)
    const base = `${window.location.origin}/gestao/agendar/${petshop.link_codigo}`;
    const acompanhar = `\n\nVeja a confirmação aqui: ${base}/pedido/${p.id}`;
    if (ehEstadia(p)) {
      const oQue = `${p.tipo === "hotel" ? "o hotel" : "a creche"} de ${nomes}, ${periodoDe(p)}`;
      return lista[0].resposta === "recusado"
        ? `${oi} Recebemos o seu pedido para ${oQue}, mas não temos vaga nessas datas. Você pode escolher outras datas aqui: ${base}\n\nSe preferir, me diga o período que fica bom para você.`
        : `${oi} Está confirmado: ${oQue}, com chegada às ${hora(p.inicio)}${p.tipo === "hotel" ? ` e saída às ${hora(p.fim)}` : ""}.${fraseDoSinal(p)} Esperamos vocês!${acompanhar}`;
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
                      : varios && ehEstadia(p) ? `Reservas de ${p.tipo === "hotel" ? "hotel" : "creche"} feitas: ${periodoDe(p)}.`
                      : varios ? `Marcados para ${quandoNaTela(p.inicio)}: ${listaDe(g.lista.map((r) => `${r.pedido.pet_nome} às ${hora(r.pedido.inicio)}`))}.`
                      : ehEstadia(p) ? `Reserva de ${p.tipo === "hotel" ? "hotel" : "creche"} feita: ${periodoDe(p)}.`
                      : `Marcado para ${quandoNaTela(p.inicio)}, às ${hora(p.inicio)}.`} Avise {primeiroNome(g.lista[0].tutor ?? p.tutor_nome)}.
                  </span>
                </div>
              </div>
              <div className="g-pl-acoes">
                {zap && (
                  <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void avisado(g.lista)}>
                    <MessageCircle />{aceito ? "Confirmar no WhatsApp" : ehEstadia(p) ? "Sugerir outras datas" : "Sugerir outro horário"}
                  </a>
                )}
                <button type="button" className="g-btn fantasma p" onClick={() => void avisado(g.lista)}>Já avisei</button>
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
                  {p.tipo === "creche" && fechadosDe(p, petshop.horario).length > 0 && <span className="g-tag amarelo">pelo seu horário, a creche não abre em {fechadosDe(p, petshop.horario).map((d) => dataCurta(d)).join(", ")}</span>}
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
            <article key={g.id} className="g-pl-item" style={{ "--cor": p.tipo === "creche" ? "#3b9bd9" : p.tipo === "hotel" ? "#7c6bd6" : corServico(p.servico_id) } as React.CSSProperties}>
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
                <span className="g-pl-hora"><Clock aria-hidden />{ehEstadia(p) ? `${periodoDe(p)}, chega às ${hora(p.inicio)} e sai às ${hora(p.fim)}` : `${quandoNaTela(p.inicio)}, das ${hora(p.inicio)} às ${hora(fim)}`}</span>
                <span className="g-tag azul">{ehEstadia(p) ? `${g.lista.length} pets do mesmo tutor` : `${g.lista.length} pets, um depois do outro`}</span>
                {passou && <span className="g-tag vermelho">{ehEstadia(p) ? "a data já passou" : "horário já passou"}</span>}
              </div>
              <ul className="g-pl-pets">
                {g.lista.map((x) => {
                  const detalhes = detalhesDe(x);
                  return (
                    <li key={x.id}>
                      {!ehEstadia(x) && <span className="g-pl-pet-h">{hora(x.inicio)}</span>}
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

      {duvida && (
        <Folha titulo={`Este telefone já é de ${duvida.existente.nome}`} aoFechar={() => setDuvida(null)}
          rodape={<>
            <button type="button" className="g-btn sec" onClick={() => { const d = duvida; setDuvida(null); void aceitar(d.lista, d.grupo, { como: "novo" }); }}>Criar outro tutor</button>
            <button type="button" className="g-btn pri" autoFocus onClick={() => { const d = duvida; setDuvida(null); void aceitar(d.lista, d.grupo, { como: "existente", tutor: d.existente.nome }); }}>Usar {duvida.existente.nome}</button>
          </>}>
          <div className="g-pilha">
            <div className="g-card areia g-pilha p">
              <div className="g-fila"><AvatarPessoa nome={duvida.lista[0].tutor_nome} /><div className="g-cresce"><b>{duvida.lista[0].tutor_nome}</b><div className="g-pp g-muted">quem pediu pelo link · {fmtTelefone(duvida.lista[0].telefone)}</div></div></div>
              <div className="g-fila"><AvatarPessoa nome={duvida.existente.nome} /><div className="g-cresce"><b>{duvida.existente.nome}</b><div className="g-pp g-muted">já é cliente · {fmtTelefone(duvida.existente.telefone)}</div></div></div>
            </div>
            <p><b>É a mesma pessoa?</b></p>
            <p className="g-muted g-p">
              Se for, toque em Usar {duvida.existente.nome}: {listaDe(duvida.lista.map((x) => x.pet_nome))} {duvida.lista.length > 1 ? "entram" : "entra"} na ficha que já existe.
              Se for outra pessoa que usa o mesmo número, toque em Criar outro tutor: {duvida.lista[0].tutor_nome} ganha uma ficha própria.
              Fechando esta janela, o pedido continua esperando.
            </p>
          </div>
        </Folha>
      )}
    </section>
  );
}
