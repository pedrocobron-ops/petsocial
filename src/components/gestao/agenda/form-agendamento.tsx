"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarOff, Check, Clock, Lock, Plus, Repeat, TriangleAlert, Truck, Users, Utensils, X } from "lucide-react";
import type { AgendamentoCompleto, PetComTutor, StatusAgendamento } from "@/lib/gestao/tipos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { PORTES } from "@/lib/gestao/tipos";
import { REPETICOES, bloqueioPega, datasDaSerie, horariosLivres, paraMin, vagasDe } from "@/lib/gestao/agenda";
import { definirServicosAMais, juntarServicosAMais, servicosAMais } from "@/lib/gestao/servicos-do-horario";
import { almocoDoDia, brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, hora, horarioDoDia, isoDia, juntaDiaHora, lerValor, nomeDiaCurto, precoDoServico, somaDias } from "@/lib/gestao/util";
import { diaFechado, fraseDoDiaFechado } from "@/lib/gestao/feriados";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { CampoDinheiro, erroDeValor } from "../loja/pecas";
import { AvatarPet, Campo, EscolherPet, Folha, avisarMudanca, ok, useAvisos, useDados } from "../ui";
import "@/app/(gestao)/gestao/app/agenda/agenda.css";
import { VEZES_POR_VEZ } from "./series-acabando";

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
type Problema = { tipo: "fechado" | "bloqueio" | "conflito" | "vagas" | "fora" | "almoco"; texto: string };
/** Até quantas vezes um horário pode se repetir de uma vez (toda semana, dá meio ano). */
const MAX_VEZES = 26;
const OPCOES_VEZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 20, 26];
/** Um serviço a mais no mesmo horário, enquanto o formulário está aberto. `mexido`: a pessoa escreveu o valor. */
type OutroServico = { servicoId: string; preco: number | null; mexido: boolean };
/** Até quantos serviços a mais cabem num horário. */
const MAX_OUTROS = 10;
const tempo = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}`);
/** "Até eu cancelar" no seletor de vezes: marca os primeiros horários e a Agenda avisa para continuar (series-acabando.tsx). */
const SEM_FIM = 0;
/** Horários livres separados por parte do dia. */
const PARTES = [
  { rotulo: "Manhã", de: 0, ate: 12 * 60 },
  { rotulo: "Tarde", de: 12 * 60, ate: 18 * 60 },
  { rotulo: "Noite", de: 18 * 60, ate: 24 * 60 },
];
/** O ano da data faz sentido? (do ano passado até daqui a dois anos) */
function anoFazSentido(dia: string) {
  const ano = Number(dia.slice(0, 4)), atual = new Date().getFullYear();
  return RE_DIA.test(dia) && !Number.isNaN(deIsoDia(dia).getTime()) && ano >= atual - 1 && ano <= atual + 2;
}

/**
 * Marca um horário novo ou altera um existente. Avisa (sem impedir) quando bate com outro atendimento ou com um bloqueio.
 * Ao criar, o horário pode se repetir: todos os da série dividem o mesmo `serie_id`.
 */
export default function FormAgendamento({ agendamento, petInicial, diaInicial, horaInicial, profissionalInicial, aoFechar, aoSalvar }: {
  agendamento?: AgendamentoCompleto; petInicial?: PetComTutor | null; diaInicial?: string; horaInicial?: string; profissionalInicial?: string | null;
  aoFechar: () => void; aoSalvar: () => void;
}) {
  const { sb, petshop, equipe, servicos, user } = useGestao();
  useCalendario(); // feriados e dias fechados: a tela avisa quando o dia escolhido é um deles
  const { avisar, avisarErro, confirmar } = useAvisos();
  const quemAtende = equipe.filter((p) => p.ativo && p.atende);
  const outrosDoHorario = useMemo(() => servicosAMais(agendamento), [agendamento]);
  const ativos = servicos.filter((s) => s.ativo || s.id === agendamento?.servico_id || outrosDoHorario.some((o) => o.servico_id === s.id));

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
  // outros serviços no mesmo horário (Banho + Hidratação): cada um com o seu valor; a duração soma
  const [outros, setOutros] = useState<OutroServico[]>(() => outrosDoHorario.map((o) => ({ servicoId: o.servico_id, preco: o.preco == null ? null : Number(o.preco), mexido: true })));
  const [juntando, setJuntando] = useState(outrosDoHorario.length > 0);
  const [salvando, setSalvando] = useState(false);
  // o que está escrito no campo Valor (para avisar quando não é número) e o porte escolhido aqui mesmo
  const [textoValor, setTextoValor] = useState("");
  const [salvandoPorte, setSalvandoPorte] = useState(false);
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
  // o mesmo para os outros serviços: o valor acompanha o porte até a pessoa escrever outro
  const porte = pet?.porte ?? null;
  useEffect(() => {
    setOutros((l) => (l.some((o) => !o.mexido) ? l.map((o) => (o.mexido ? o : { ...o, preco: precoDoServico(servicos.find((s) => s.id === o.servicoId), porte) })) : l));
  }, [porte, servicos]);
  const duracaoDe = (id: string) => servicos.find((s) => s.id === id)?.duracao_min ?? 0;
  /** Junta ou tira um serviço a mais: a duração do horário acompanha. */
  function alternarOutro(id: string) {
    const tem = outros.some((o) => o.servicoId === id);
    if (!tem && outros.length >= MAX_OUTROS) { avisar(`Um horário aceita até ${MAX_OUTROS} serviços a mais.`); return; }
    setOutros((l) => (tem ? l.filter((o) => o.servicoId !== id) : [...l, { servicoId: id, preco: precoDoServico(servicos.find((s) => s.id === id), porte), mexido: false }]));
    setDuracao((d) => {
      const nova = tem ? d - duracaoDe(id) : d + duracaoDe(id);
      return nova >= 5 ? Math.min(nova, 1440) : servico?.duracao_min ?? 60;
    });
  }
  /** Troca o serviço principal: se ele estava entre os outros, sai de lá; a duração é a soma de todos. */
  function escolherPrincipal(id: string, duracaoMin: number) {
    const ficam = outros.filter((o) => o.servicoId !== id);
    setServicoId(id);
    setOutros(ficam);
    setDuracao(Math.min(1440, duracaoMin + ficam.reduce((t, o) => t + duracaoDe(o.servicoId), 0)));
    setPrecoMexido(false);
    setTextoValor("");
  }
  const totalDoHorario = Math.round(((preco ?? 0) + outros.reduce((t, o) => t + (o.preco ?? 0), 0)) * 100) / 100;

  // o que já está marcado no dia, para sugerir horários livres
  const { dados: doDia } = useDados(async () => {
    const ini = deIsoDia(dia);
    return ok(await sb.from("agendamentos").select("id, inicio, fim, profissional_id, status").eq("petshop_id", petshop.id)
      .gte("inicio", ini.toISOString()).lt("inicio", somaDias(ini, 1).toISOString()));
  }, [dia, petshop.id]);

  // datas da série (uma só quando não repete) e os bloqueios do período
  const diaOk = RE_DIA.test(dia);
  const repetindo = !agendamento && repetir > 0;
  const semFim = repetindo && vezes === SEM_FIM;
  const datas = useMemo(() => (repetindo ? datasDaSerie(dia, repetir, vezes === SEM_FIM ? VEZES_POR_VEZ : vezes, MAX_VEZES) : [dia]), [repetindo, dia, repetir, vezes]);
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
    // o almoço do pet shop (Meu pet shop > Horário) fica fechado todos os dias
    const almoco = almocoDoDia(petshop.horario, deIsoDia(dia));
    if (almoco) bloqueados.push({ inicio: almoco.inicio, fim: almoco.fim });
    const agora = new Date();
    const aPartirDe = dia === isoDia(agora) ? agora.getHours() * 60 + agora.getMinutes() : undefined;
    return horariosLivres({ abre: funcionamento.abre, fecha: funcionamento.fecha, duracaoMin: duracao, ocupados, bloqueados, vagas: profId ? 1 : vagasDe(petshop, equipe), aPartirDe });
  }, [funcionamento, dia, doDia, bloqueios, profId, duracao, agendamento, petshop, equipe]);

  const bloqueioEm = (d: string) => {
    const ini = juntaDiaHora(d, hhmm).getTime();
    return (bloqueios ?? []).find((b) => bloqueioPega(b, profId, ini, ini + duracao * 60000)) ?? null;
  };
  const bloqueioAqui = diaOk && hhmm ? bloqueioEm(dia) : null;
  /** O horário escolhido cruza o almoço do pet shop no dia `d`? */
  const almocoEm = (d: string) => {
    const al = hhmm ? almocoDoDia(petshop.horario, deIsoDia(d)) : null;
    if (!al) return null;
    const ini = paraMin(hhmm);
    return ini < al.fim && ini + duracao > al.inicio ? al : null;
  };
  const almocoAqui = diaOk && hhmm ? almocoEm(dia) : null;

  // vagas: quantos pets o pet shop atende ao mesmo tempo, somando todos os profissionais e os "a definir"
  const vagas = vagasDe(petshop, equipe);
  type Marcado = { id: string; inicio: string; fim: string; status: string };
  /** O máximo de outros pets ao mesmo tempo dentro do horário escolhido, no dia `d`. */
  const juntosEm = (lista: Marcado[], d: string) => {
    const ini = juntaDiaHora(d, hhmm).getTime(), fim = ini + duracao * 60000;
    const outros = lista.filter((a) => a.id !== agendamento?.id && !["cancelado", "faltou"].includes(a.status))
      .map((a) => ({ de: new Date(a.inicio).getTime(), ate: new Date(a.fim).getTime() })).filter((a) => a.de < fim && a.ate > ini);
    return Math.max(0, ...[ini, ...outros.map((a) => a.de)].filter((t) => t >= ini && t < fim).map((t) => outros.filter((a) => a.de <= t && a.ate > t).length));
  };
  /** O horário escolhido cabe no expediente do dia `d`? (dia fechado é outro aviso) */
  const foraDoExpediente = (d: string) => {
    const f = horarioDoDia(petshop.horario, deIsoDia(d));
    if (!f || !hhmm) return null;
    const ini = paraMin(hhmm);
    return ini < paraMin(f.abre) || ini + duracao > paraMin(f.fecha) ? f : null;
  };
  const juntosAqui = diaOk && hhmm && doDia ? juntosEm(doDia, dia) : 0;
  const lotadoAqui = juntosAqui >= vagas;
  const foraAqui = diaOk ? foraDoExpediente(dia) : null;
  const anoOk = anoFazSentido(dia);
  // data ou hora que já passou (em edição, só avisa se a pessoa mexeu no dia ou na hora)
  const mexeuNoQuando = !agendamento || dia !== isoDia(new Date(agendamento.inicio)) || hhmm !== hora(agendamento.inicio);
  const jaPassou = diaOk && anoOk && mexeuNoQuando && (dia < isoDia(new Date()) ? "dia" : dia === isoDia(new Date()) && hhmm && juntaDiaHora(dia, hhmm).getTime() < Date.now() - 5 * 60000 ? "hora" : null);

  /** Confere cada data: dia fechado, fora do expediente, bloqueio, conflito com o mesmo profissional e vagas (a mesma conferência do salvar). */
  async function conferir(lista: string[]): Promise<Record<string, Problema[]>> {
    const bate = await Promise.all(lista.map(async (d) => {
      if (!profId) return 0;
      const ini = juntaDiaHora(d, hhmm);
      return ok(await sb.rpc("conflitos_agenda", { p_petshop: petshop.id, p_profissional: profId, p_inicio: ini.toISOString(), p_fim: new Date(ini.getTime() + duracao * 60000).toISOString(), p_ignorar: agendamento?.id })).length;
    }));
    const marcados = await lerTudo<{ id: string; inicio: string; fim: string; status: StatusAgendamento }>((de, ate, contar) => sb.from("agendamentos").select("id, inicio, fim, status", contando(contar)).eq("petshop_id", petshop.id)
      .gte("inicio", somaDias(deIsoDia(lista[0]), -1).toISOString()).lt("inicio", somaDias(deIsoDia(lista[lista.length - 1]), 1).toISOString()).order("inicio").order("id").range(de, ate));
    const out: Record<string, Problema[]> = {};
    lista.forEach((d, i) => {
      const p: Problema[] = [];
      if (!horarioDoDia(petshop.horario, deIsoDia(d)) || diaFechado(d)) p.push({ tipo: "fechado", texto: diaFechado(d) ? "dia fechado" : "fechado" });
      else if (foraDoExpediente(d)) p.push({ tipo: "fora", texto: "fora do expediente" });
      if (almocoEm(d)) p.push({ tipo: "almoco", texto: "hora do almoço" });
      const b = bloqueioEm(d);
      if (b) p.push({ tipo: "bloqueio", texto: b.motivo ? `bloqueado: ${b.motivo}` : "bloqueado" });
      if (bate[i]) p.push({ tipo: "conflito", texto: "já tem horário" });
      else if (juntosEm(marcados, d) >= vagas) p.push({ tipo: "vagas", texto: "sem vaga" });
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

  // texto que não é número no campo Valor: mostra o erro em vez de salvar em branco
  const valorRuim = precoMexido && textoValor.trim() !== "" && lerValor(textoValor) == null;
  const semPorte = Boolean(pet && !pet.porte);
  const ultimaData = datas[datas.length - 1];

  /** Escolhe o porte do pet aqui mesmo, na hora de marcar: grava na ficha e o valor sugerido se ajusta. */
  async function definirPorte(porte: string) {
    if (!pet || salvandoPorte) return;
    setSalvandoPorte(true);
    try {
      ok(await sb.from("pets").update({ porte }).eq("id", pet.id).eq("petshop_id", petshop.id).select("id").single());
      setPet({ ...pet, porte });
      avisar(`Porte de ${pet.nome} guardado na ficha.`);
    } catch (err) { avisarErro(err); }
    setSalvandoPorte(false);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!pet) { avisar("Escolha o pet."); return; }
    if (!hhmm) { avisar("Escolha o horário."); return; }
    if (!anoOk) { avisarErro("Confira o ano da data: ele parece errado."); return; }
    if (valorRuim) { avisarErro("Confira o valor: escreva só números, como 45,00."); return; }
    const erroPreco = erroDeValor(preco);
    if (erroPreco) { avisarErro(erroPreco); return; }
    for (const o of outros) {
      const erroOutro = erroDeValor(o.preco, `O valor de ${servicos.find((x) => x.id === o.servicoId)?.nome ?? "um serviço"}`);
      if (erroOutro) { avisarErro(erroOutro); return; }
    }
    const aMais = outros.filter((o) => o.servicoId !== servicoId).map((o) => ({ servico_id: o.servicoId, preco: o.preco }));
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
        const serie = usar.length > 1 || semFim ? crypto.randomUUID() : null;
        const marcados = ok(await sb.from("agendamentos").insert(usar.map((d) => {
          const ini = juntaDiaHora(d, hhmm);
          return { ...campos, inicio: ini.toISOString(), fim: new Date(ini.getTime() + duracao * 60000).toISOString(), serie_id: serie, petshop_id: petshop.id, criado_por: user.id };
        })).select("id"));
        if (aMais.length) await juntarAosMarcados(marcados.map((m) => m.id), aMais);
        // "até eu cancelar": a série fica marcada para a Agenda avisar quando estiver acabando
        const guardou = semFim && serie ? await sb.from("series_agenda").insert({ serie_id: serie, petshop_id: petshop.id, cada_semanas: repetir }).select("serie_id") : null;
        avisar(`${usar.length === 1 ? "1 horário marcado" : `${usar.length} horários marcados`}${!semFim ? "" : guardou?.error ? ". Não consegui guardar o Até eu cancelar: a repetição termina no último horário." : ". Perto do fim, a Agenda avisa para marcar os próximos."}`);
        avisarMudanca();
        aoSalvar();
        setSalvando(false);
        return;
      }
      const noAlmoco = almocoEm(dia);
      if (noAlmoco) {
        const segue = await confirmar({ titulo: "Esse horário cai no almoço", texto: `O pet shop fecha para o almoço das ${noAlmoco.de} às ${noAlmoco.ate}. Quer marcar mesmo assim?`, confirmar: "Marcar mesmo assim" });
        if (!segue) { setSalvando(false); return; }
      }
      const bloqueio = bloqueioEm(dia);
      if (bloqueio) {
        const segue = await confirmar({ titulo: "Esse horário está bloqueado", texto: `${bloqueio.motivo ?? "Bloqueio"} (${nomeDe(bloqueio.profissional_id)}), das ${hora(bloqueio.inicio)} às ${hora(bloqueio.fim)}. Quer marcar mesmo assim?`, confirmar: "Marcar mesmo assim" });
        if (!segue) { setSalvando(false); return; }
      }
      let jaPerguntou = false;
      if (profId) {
        const bate = ok(await sb.rpc("conflitos_agenda", { p_petshop: petshop.id, p_profissional: profId, p_inicio: inicio.toISOString(), p_fim: fim.toISOString(), p_ignorar: agendamento?.id }));
        if (bate.length) {
          const quem = quemAtende.find((p) => p.id === profId)?.nome ?? "Esse profissional";
          const segue = await confirmar({ titulo: "Esse horário já tem atendimento", texto: `${quem} já tem ${bate.length === 1 ? "um atendimento" : `${bate.length} atendimentos`} nesse horário. Quer marcar mesmo assim?`, confirmar: "Marcar mesmo assim" });
          if (!segue) { setSalvando(false); return; }
          jaPerguntou = true;
        }
      }
      if (!jaPerguntou) {
        // confere as vagas com o que está marcado agora (outra pessoa pode ter marcado nesse meio-tempo)
        const marcados = ok(await sb.from("agendamentos").select("id, inicio, fim, status").eq("petshop_id", petshop.id)
          .gte("inicio", somaDias(deIsoDia(dia), -1).toISOString()).lt("inicio", somaDias(deIsoDia(dia), 1).toISOString()));
        const juntos = juntosEm(marcados, dia);
        if (juntos >= vagas) {
          const segue = await confirmar({ titulo: "Esse horário passa das vagas", texto: `Já ${juntos === 1 ? "tem 1 pet marcado" : `tem ${juntos} pets marcados`} nesse horário e o pet shop atende ${vagas === 1 ? "1 pet" : `${vagas} pets`} ao mesmo tempo. Quer marcar mesmo assim?`, confirmar: "Marcar mesmo assim" });
          if (!segue) { setSalvando(false); return; }
        }
      }
      const quando = { inicio: inicio.toISOString(), fim: fim.toISOString() };
      if (agendamento) {
        ok(await sb.from("agendamentos").update({ ...campos, ...quando }).eq("id", agendamento.id).select("id").single());
        // só mexe nos outros serviços quando o horário tem (ou tinha) algum
        if (aMais.length || outrosDoHorario.length) {
          try { await definirServicosAMais(sb, agendamento.id, aMais); } catch (err) {
            avisarErro(`O horário foi alterado, mas os outros serviços não. Abra o horário e confira. (${err instanceof Error ? err.message : "erro"})`);
            avisarMudanca(); aoSalvar(); setSalvando(false);
            return;
          }
        }
      } else {
        const novo = ok(await sb.from("agendamentos").insert({ ...campos, ...quando, petshop_id: petshop.id, criado_por: user.id }).select("id").single());
        if (aMais.length) await juntarAosMarcados([novo.id], aMais);
      }
      avisar(agendamento ? "Horário alterado." : `${pet.nome} marcado para ${dataAmigavel(inicio)} às ${hhmm}.`);
      avisarMudanca();
      aoSalvar();
    } catch (err) { avisarErro(err); }
    setSalvando(false);
  }

  /** Junta os outros serviços aos horários recém-marcados. Se falhar, o horário já existe: avisa para a pessoa conferir. */
  async function juntarAosMarcados(ids: string[], aMais: { servico_id: string; preco: number | null }[]) {
    try { await juntarServicosAMais(sb, petshop.id, ids, aMais); } catch (err) {
      avisarErro(`O horário foi marcado só com o primeiro serviço. Abra o horário e junte os outros de novo. (${err instanceof Error ? err.message : "erro"})`);
    }
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
                  onClick={() => escolherPrincipal(s.id, s.duracao_min)}><i style={{ background: s.cor }} />{s.nome}</button>
              ))}
            </div>
            {servico && ativos.length > 1 && !juntando && (
              <button type="button" className="g-agd-juntar" onClick={() => setJuntando(true)}><Plus size={15} aria-hidden />Juntar outro serviço no mesmo horário</button>
            )}
          </div>
          {servico && juntando && (
            <div className="g-campo g-agd-outros"><span>Outros serviços no mesmo horário</span>
              <div className="g-chips" role="group" aria-label="Outros serviços no mesmo horário">
                {ativos.filter((s) => s.id !== servicoId).map((s) => (
                  <button key={s.id} type="button" className="g-chip" aria-pressed={outros.some((o) => o.servicoId === s.id)} onClick={() => alternarOutro(s.id)}><i style={{ background: s.cor }} />{s.nome}</button>
                ))}
              </div>
              {outros.length === 0 ? <p className="g-pp g-muted" style={{ margin: 0 }}>Toque nos serviços que o pet vai fazer junto com {servico.nome}. Cada um entra com o seu valor e o tempo soma.</p> : (
                <ul className="g-agd-outros-l">
                  {outros.map((o) => {
                    const s = servicos.find((x) => x.id === o.servicoId);
                    return (
                      <li key={o.servicoId}>
                        <div className="t"><b>{s?.nome ?? "Serviço"}</b><small>mais {tempo(s?.duracao_min ?? 0)}</small></div>
                        <label className="g-agd-valor" aria-label={`Valor de ${s?.nome ?? "serviço"}`}>
                          <CampoDinheiro valor={o.preco} aoMudar={(v) => setOutros((l) => l.map((x) => (x.servicoId === o.servicoId ? { ...x, preco: v, mexido: true } : x)))} placeholder="definir" />
                        </label>
                        <button type="button" className="g-ico" aria-label={`Tirar ${s?.nome ?? "serviço"} deste horário`} onClick={() => alternarOutro(o.servicoId)}><X /></button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {quemAtende.length > 1 && (
            <div className="g-campo"><span>Quem atende</span>
              <div className="g-chips">
                <button type="button" className="g-chip" aria-pressed={profId === null} onClick={() => setProfId(null)}>A definir</button>
                {quemAtende.map((p) => <button key={p.id} type="button" className="g-chip" aria-pressed={profId === p.id} onClick={() => setProfId(p.id)}><i style={{ background: p.cor }} />{p.nome.split(" ")[0]}</button>)}
              </div>
            </div>
          )}

          <div className="dupla">
            <Campo rotulo="Dia" erro={diaOk && !anoOk ? "Confira o ano." : null}>
              <input className="g-input" type="date" required value={dia} onChange={(e) => setDia(e.target.value)} />
            </Campo>
            <Campo rotulo="Horário"><input className="g-input" type="time" required step={300} value={hhmm} onChange={(e) => setHhmm(e.target.value)} /></Campo>
          </div>
          {diaOk && anoOk && diaFechado(dia) && (
            <div className="g-aviso" role="status" style={{ marginBottom: 0 }}><CalendarOff /><span className="g-cresce"><b>{fraseDoDiaFechado(dia)}.</b> Vocês marcaram {dataAmigavel(dia)} como dia fechado em Meu pet shop. Dá para marcar mesmo assim.</span></div>
          )}
          {!diaOk || !anoOk ? null : !funcionamento ? <p className="g-pp g-muted">O pet shop não abre {dataAmigavel(dia)}. Você pode marcar mesmo assim.</p>
            : livres.length > 0 ? (
              <div className="g-campo g-agd-livres"><span className="g-muted" style={{ fontWeight: 500 }}>Horários livres {dataAmigavel(dia)}</span>
                {PARTES.map((parte) => {
                  const daParte = livres.filter((h) => paraMin(h) >= parte.de && paraMin(h) < parte.ate);
                  if (!daParte.length) return null;
                  return (
                    <div key={parte.rotulo} className="g-agd-parte" role="group" aria-label={`Horários livres: ${parte.rotulo.toLowerCase()}`}>
                      <small>{parte.rotulo}</small>
                      <div className="g-chips">
                        {daParte.map((h) => <button key={h} type="button" className="g-chip" aria-pressed={hhmm === h} onClick={() => setHhmm(h)}>{h}</button>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="g-pp g-muted">Sem horário livre {dataAmigavel(dia)} para este serviço. Você pode encaixar escolhendo o horário acima.</p>}
          {jaPassou && (
            <p className="g-agd-alerta" role="status"><TriangleAlert />
              <span><b>{jaPassou === "dia" ? `Esse dia já passou (${dataCurta(dia)}/${dia.slice(0, 4)}).` : "Esse horário de hoje já passou."}</b> Se é isso mesmo, pode marcar: fica anotado no histórico.</span>
            </p>
          )}
          {foraAqui && !repetindo && (
            <p className="g-agd-alerta" role="status"><Clock />
              <span><b>Fora do horário de funcionamento.</b> {dataAmigavel(dia).replace(/^./, (c) => c.toUpperCase())} o pet shop abre das {foraAqui.abre} às {foraAqui.fecha}. Você pode marcar mesmo assim.</span>
            </p>
          )}
          {lotadoAqui && !repetindo && (
            <p className="g-agd-alerta" role="status"><Users />
              <span><b>Esse horário passa das vagas.</b> Já {juntosAqui === 1 ? "tem 1 pet marcado" : `tem ${juntosAqui} pets marcados`} nesse horário e o pet shop atende {vagas === 1 ? "1 pet" : `${vagas} pets`} ao mesmo tempo. Dá para marcar mesmo assim: o sistema pede uma confirmação.</span>
            </p>
          )}
          {almocoAqui && !repetindo && (
            <p className="g-agd-alerta" role="status"><Utensils />
              <span><b>Esse horário cai no almoço.</b> O pet shop fecha das {almocoAqui.de} às {almocoAqui.ate}. Dá para marcar mesmo assim: o sistema pede uma confirmação.</span>
            </p>
          )}
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
                      {OPCOES_VEZES.map((n) => <option key={n} value={n}>{n} vezes</option>)}
                      <option value={SEM_FIM}>Até eu cancelar</option>
                    </select>
                  </Campo>
                )}
              </div>
              {repetindo && diaOk && (
                <>
                  <div className="g-agd-rep-t"><Repeat size={15} /><span>{hhmm ? `Sempre às ${hhmm}` : "Escolha o horário para conferir as datas"}</span></div>
                  {semFim
                    ? <p className="g-pp g-muted" style={{ margin: 0 }}>Marca agora os {datas.length} primeiros horários, até <b>{dataCompleta(ultimaData)}</b>. Quando estiverem acabando, a Agenda avisa e um toque marca os próximos. Para parar, desmarque um horário e escolha Desmarcar este e os próximos.</p>
                    : <p className="g-pp g-muted" style={{ margin: 0 }}>A repetição vai até <b>{dataCompleta(ultimaData)}</b>. Para ela não ter data para acabar, escolha Até eu cancelar em Por quantas vezes.</p>}
                  <ul className="g-agd-datas">
                    {datas.map((d) => {
                      const p = previa?.[d] ?? [];
                      const Icone = !p.length ? Check : p[0].tipo === "fechado" ? CalendarOff : p[0].tipo === "bloqueio" ? Lock : p[0].tipo === "vagas" ? Users : Clock;
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
                  .map((m) => <option key={m} value={m}>{tempo(m)}</option>)}
              </select>
            </Campo>
            <Campo rotulo={outros.length && servico ? `Valor de ${servico.nome}` : "Valor"} erro={valorRuim ? "Isso não é um valor. Escreva só números, como 45,00." : null}
              dica={semPorte && servico && !precoMexido ? "Pet sem porte: confira o valor." : undefined}>
              <span className={`g-agd-valor${valorRuim ? " ruim" : semPorte && servico && !precoMexido ? " atencao" : ""}`} onInput={(e) => setTextoValor((e.target as HTMLInputElement).value)}>
                <CampoDinheiro valor={preco} aoMudar={(v) => { setPreco(v); setPrecoMexido(true); }} placeholder="definir" />
              </span>
            </Campo>
          </div>
          {outros.length > 0 && (
            <p className="g-agd-total" role="status">
              <span>Total do horário, com {outros.length === 1 ? "o outro serviço" : `os outros ${outros.length} serviços`}</span>
              <b className="g-tab">{brl(totalDoHorario)}</b>
            </p>
          )}
          {semPorte && servico && (
            <div className="g-agd-alerta g-agd-porte" role="status"><TriangleAlert />
              <div>
                <span><b>{pet.nome} está sem porte na ficha.</b> {precoMexido ? "O valor é o que você escreveu." : preco != null ? "O valor acima é o primeiro preço do serviço." : "O valor ficou em branco."} Qual é o porte?</span>
                <div className="g-chips" role="group" aria-label={`Porte de ${pet.nome}`}>
                  {PORTES.map((x) => <button key={x.id} type="button" className="g-chip" disabled={salvandoPorte} onClick={() => void definirPorte(x.id)}>{x.rotulo}</button>)}
                </div>
              </div>
            </div>
          )}

          <label className="g-check"><input type="checkbox" checked={levaTraz} onChange={(e) => setLevaTraz(e.target.checked)} /><Truck size={18} /> Leva e traz</label>
          {levaTraz && <Campo rotulo="Endereço para buscar"><input className="g-input" value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Campo>}
          <Campo rotulo="Observação"><textarea className="g-textarea" value={obs} maxLength={400} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: tosa na máquina 4, laço rosa" /></Campo>
        </form>
      )}
    </Folha>
  );
}
