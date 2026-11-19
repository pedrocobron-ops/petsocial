"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarCheck2, CalendarOff, Check, Clock, Lock, MessageCircle, Repeat, TriangleAlert, Truck, Users, Utensils, X } from "lucide-react";
import type { AgendamentoCompleto, PetComTutor, StatusAgendamento } from "@/lib/gestao/tipos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { PORTES } from "@/lib/gestao/tipos";
import { REPETICOES, bloqueioPega, datasDaSerie, deMin, horariosLivres, marcadoPara, paraMin, textoRemarcado, vagasDe } from "@/lib/gestao/agenda";
import { definirServicosAMais, juntarServicosAMais, servicosAMais } from "@/lib/gestao/servicos-do-horario";
import { almocoDoDia, brl, nomeNaEquipe, dataAmigavel, dataCompleta, dataCurta, deIsoDia, hora, horarioDoDia, isoDia, juntaDiaHora, lerValor, linkWhatsApp, nomeDiaCurto, NOTA_PORTE, precoDoServico, precoMudaComPorte, somaDias, centavos } from "@/lib/gestao/util";
import { diaFechado, fraseDoDiaFechado } from "@/lib/gestao/feriados";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { CampoDinheiro, erroDeValor } from "../loja/pecas";
import { travaDePreco } from "@/lib/gestao/dinheiro-opcoes";
import { COLS_PACOTE_CLIENTE } from "@/lib/gestao/reservado";
import { AvatarPet, Campo, EscolherPet, Folha, avisarMudanca, ok, useAvisos, useDados } from "../ui";
import "@/app/(gestao)/gestao/app/agenda/agenda.css";
import { VEZES_POR_VEZ } from "./series-acabando";
import { CampoComVoz } from "../ditado";
import { COLS_PROMOCAO, descontoDaPromo, descontoCurto, lerPromocao, promoDoHorario } from "@/lib/gestao/promocoes";
import { Tag } from "lucide-react";
import "./promo.css";
import { DICA_OBS } from "@/lib/gestao/privacidade-textos";

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
type Problema = { tipo: "fechado" | "bloqueio" | "conflito" | "vagas" | "fora" | "almoco"; texto: string };
/** Até quantas vezes um horário pode se repetir de uma vez (toda semana, dá meio ano). */
const MAX_VEZES = 26;
const OPCOES_VEZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 20, 26];
/**
 * Um serviço escolhido para o horário, enquanto o formulário está aberto. O primeiro da lista é o principal
 * (`agendamentos.servico_id`); os outros vão para `agendamento_servicos`, na ordem em que foram escolhidos.
 * `mexido`: a pessoa escreveu o valor. `texto`: o que está escrito no campo do valor (para avisar quando não é número).
 */
type Escolhido = { servicoId: string; preco: number | null; mexido: boolean; texto?: string };
/** Até quantos serviços a mais (além do principal) cabem num horário. */
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
/** "1h30", "2h" (a duração do atendimento no aviso de fora do horário). */
const textoDuracao = (min: number) => `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : ""}`;

/** O horário que acabou de ser marcado: a Agenda vai para o dia dele e oferece a confirmação no WhatsApp. */
export type Marcado = { id: string; inicio: string; quantos: number; pet?: string; sexo?: string | null };

export default function FormAgendamento({ agendamento, petInicial, diaInicial, horaInicial, profissionalInicial, servicosIniciais, obsInicial, aoFechar, aoSalvar }: {
  agendamento?: AgendamentoCompleto; petInicial?: PetComTutor | null; diaInicial?: string; horaInicial?: string; profissionalInicial?: string | null;
  /** Horário novo já com os serviços e os valores (o orçamento que virou horário). */
  servicosIniciais?: { servicoId: string; preco: number | null }[]; obsInicial?: string;
  /** `marcado`: horário novo que acabou de ser marcado (o primeiro, numa série), para a Agenda abrir o dia dele. */
  aoFechar: () => void; aoSalvar: (marcado?: Marcado) => void;
}) {
  // quem não mexe com dinheiro (sem Caixa, Financeiro nem Relatórios) marca o horário sem ver valor: o preço da lista vai junto, calado
  const { sb, petshop, equipe, servicos, user, vejoFinanceiro, cuidoDoFinanceiro } = useGestao();
  // preço travado (opção do dono): quem só opera o caixa marca pelo preço da lista. Serviço sem preço na lista continua livre.
  const travado = travaDePreco(petshop).ligada && !cuidoDoFinanceiro;
  useCalendario(); // feriados e dias fechados: a tela avisa quando o dia escolhido é um deles
  const { avisar, avisarErro, confirmar } = useAvisos();
  const quemAtende = equipe.filter((p) => p.ativo && p.atende);
  const outrosDoHorario = useMemo(() => servicosAMais(agendamento), [agendamento]);
  const ativos = servicos.filter((s) => s.ativo || s.id === agendamento?.servico_id || outrosDoHorario.some((o) => o.servico_id === s.id));

  const [pet, setPet] = useState<PetComTutor | null>(petInicial ?? null);
  const [petNovo, setPetNovo] = useState<string | null>(null);
  const [profId, setProfId] = useState<string | null>(agendamento ? agendamento.profissional_id : profissionalInicial ?? (quemAtende.length === 1 ? quemAtende[0].id : null));
  const [dia, setDia] = useState(agendamento ? isoDia(new Date(agendamento.inicio)) : diaInicial ?? isoDia(new Date()));
  const [hhmm, setHhmm] = useState(agendamento ? hora(agendamento.inicio) : horaInicial ?? "");
  // os serviços do horário, na ordem em que a pessoa tocou: o primeiro é o principal. Ao marcar, com um serviço só ele já vem escolhido.
  const [escolhidos, setEscolhidos] = useState<Escolhido[]>(() => {
    if (!agendamento && servicosIniciais?.length) {
      return servicosIniciais.filter((x, i, l) => servicos.some((s) => s.id === x.servicoId) && l.findIndex((y) => y.servicoId === x.servicoId) === i)
        .map((x) => ({ servicoId: x.servicoId, preco: x.preco, mexido: x.preco != null }));
    }
    if (!agendamento) return ativos.length === 1 ? [{ servicoId: ativos[0].id, preco: null, mexido: false }] : [];
    const l: Escolhido[] = agendamento.servico_id ? [{ servicoId: agendamento.servico_id, preco: agendamento.preco ?? null, mexido: true }] : [];
    for (const o of outrosDoHorario) if (!l.some((x) => x.servicoId === o.servico_id)) l.push({ servicoId: o.servico_id, preco: o.preco == null ? null : Number(o.preco), mexido: true });
    return l;
  });
  const [duracao, setDuracao] = useState<number>(agendamento ? Math.round((new Date(agendamento.fim).getTime() - new Date(agendamento.inicio).getTime()) / 60000)
    : servicosIniciais?.length ? servicosIniciais.reduce((t, x) => t + (servicos.find((s) => s.id === x.servicoId)?.duracao_min ?? 0), 0) || 60
    : ativos.length === 1 ? ativos[0].duracao_min : 60);
  // horário sem serviço nenhum (pet shop sem serviço cadastrado): o valor é escrito à mão
  const [precoSolto, setPrecoSolto] = useState<number | null>(agendamento && !agendamento.servico_id ? agendamento.preco ?? null : null);
  const [levaTraz, setLevaTraz] = useState(agendamento?.leva_traz ?? false);
  const [endereco, setEndereco] = useState(agendamento?.endereco_leva_traz ?? "");
  const [obs, setObs] = useState(agendamento?.obs ?? obsInicial ?? "");
  const [salvando, setSalvando] = useState(false);
  // remarcou (mudou o dia ou a hora): antes de fechar, oferece o aviso pronto para o tutor, com a data nova
  const [remarcado, setRemarcado] = useState<{ quando: string; hora: string; zap: string | null } | null>(null);
  // o porte escolhido aqui mesmo
  const [salvandoPorte, setSalvandoPorte] = useState(false);
  // "Não sei ainda": a pessoa marcou sem saber o porte, de propósito (o valor fica para conferir na hora)
  const [porteDepois, setPorteDepois] = useState(false);
  const perguntaPorte = useRef<HTMLDivElement>(null);
  // repetição (só ao criar)
  const [repetir, setRepetir] = useState<number>(0);
  const [vezes, setVezes] = useState(4);
  const [comProblema, setComProblema] = useState<"pular" | "marcar" | null>(null);
  const [previa, setPrevia] = useState<Record<string, Problema[]> | null>(null);

  // em edição, carrega o pet completo (com tutor)
  useEffect(() => {
    if (agendamento && !pet) {
      void sb.from("pets").select("*, clientes(id, nome, telefone)").eq("id", agendamento.pet_id).maybeSingle().then(({ data }) => { if (data) setPet(data as PetComTutor); });
    }
  }, [agendamento, pet, sb]);

  const porte = pet?.porte ?? null;
  const servicoDe = (id: string) => servicos.find((s) => s.id === id) ?? null;
  // pacotes do pet que ainda valem (com usos, no prazo, de um serviço certo): o pacote só cobre o serviço principal do horário
  const { dados: servicosDePacote } = useDados(async () => {
    if (!pet?.id) return [] as string[];
    const r = await sb.from("pacotes_clientes").select(COLS_PACOTE_CLIENTE).eq("petshop_id", petshop.id).eq("pet_id", pet.id).eq("ativo", true);
    if (r.error) return [] as string[]; // quem não lê pacotes marca como sempre (o primeiro escolhido é o principal)
    const hoje = isoDia(new Date());
    return (r.data ?? []).filter((x) => x.servico_id && x.usados < x.total && (!x.vence_em || x.vence_em >= hoje)).map((x) => x.servico_id as string);
  }, [pet?.id, petshop.id]);
  // o principal é o primeiro escolhido, menos quando um dos escolhidos é o serviço de um pacote do pet: aí ele é o principal,
  // para o pacote valer. A lista na tela continua na ordem do toque; os outros vão para os serviços a mais nessa ordem.
  const principal = escolhidos.find((o) => servicosDePacote?.includes(o.servicoId)) ?? escolhidos[0] ?? null;
  const servicoId = principal?.servicoId ?? null;
  const servico = servicoId ? servicoDe(servicoId) : null;
  const preco = servico && principal ? principal.preco : precoSolto;
  const outros = escolhidos.filter((o) => o !== principal);
  // valor sugerido pelo serviço e pelo porte, até a pessoa escrever outro
  useEffect(() => {
    setEscolhidos((l) => {
      let mudou = false;
      const nova = l.map((o) => {
        if (o.mexido) return o;
        const v = precoDoServico(servicos.find((s) => s.id === o.servicoId), porte);
        if (v === o.preco) return o;
        mudou = true;
        return { ...o, preco: v };
      });
      return mudou ? nova : l;
    });
  }, [porte, servicos, escolhidos.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const duracaoDe = (id: string) => servicoDe(id)?.duracao_min ?? 0;
  /**
   * Escolhe ou tira um serviço. O primeiro escolhido é o principal; tirando o principal, o seguinte assume.
   * A duração acompanha: soma o tempo do serviço que entra e tira o do que sai (a pessoa ainda pode mudar à mão).
   */
  function alternarServico(id: string) {
    const tem = escolhidos.some((o) => o.servicoId === id);
    if (!tem && escolhidos.length > MAX_OUTROS) { avisar(`Um horário aceita até ${MAX_OUTROS} serviços a mais.`); return; }
    const nova = tem ? escolhidos.filter((o) => o.servicoId !== id) : [...escolhidos, { servicoId: id, preco: precoDoServico(servicoDe(id), porte), mexido: false }];
    setEscolhidos(nova);
    const soma = nova.reduce((t, o) => t + duracaoDe(o.servicoId), 0);
    setDuracao((d) => {
      if (!escolhidos.length) return Math.min(1440, soma || 60); // o primeiro serviço: a duração é a dele
      const n = tem ? d - duracaoDe(id) : d + duracaoDe(id);
      return n >= 5 ? Math.min(n, 1440) : Math.min(1440, soma || 60);
    });
  }
  const mudarValor = (id: string, v: number | null) => setEscolhidos((l) => l.map((x) => (x.servicoId === id ? { ...x, preco: v, mexido: true } : x)));
  const mudarTexto = (id: string, t: string) => setEscolhidos((l) => l.map((x) => (x.servicoId === id ? { ...x, texto: t } : x)));
  const totalDoHorario = centavos(escolhidos.reduce((t, o) => t + (o.preco ?? 0), 0));
  // promoção em dias fracos: ao marcar, o banco põe a promoção que vale no dia, na hora e no serviço. Aqui a tela mostra antes
  // (com a mesma conta) e deixa tirar. Alterando um horário, a promoção fica no detalhe do horário.
  const { dados: promos } = useDados(async () => {
    if (agendamento) return [];
    const r = await sb.from("promocoes").select(COLS_PROMOCAO).eq("petshop_id", petshop.id).eq("ativa", true);
    return r.error ? [] : (r.data ?? []).map((x) => lerPromocao(x as unknown as Record<string, unknown>));
  }, [petshop.id, Boolean(agendamento)]);
  const [semPromo, setSemPromo] = useState(false);
  const categoriaDe = (id: string) => servicoDe(id)?.categoria;
  const promoAqui = !agendamento && servicoId && RE_DIA.test(dia) && /^\d{2}:\d{2}/.test(hhmm)
    ? promoDoHorario(promos ?? [], { servicoId, dia, hora: hhmm.slice(0, 5), preco: precoDoServico(servico, porte), categoriaDe, nascimento: pet?.nascimento ?? null }) : null;
  const promoValor = promoAqui ? descontoDaPromo({ ...promoAqui, tirada: false }, escolhidos.map((o) => ({ tipo: "servico", valor: o.preco, qtd: 1, servicoId: o.servicoId })), servicoId, categoriaDe) : 0;
  /** No horário novo: pede ao banco para marcar sem a promoção (a pessoa tirou). */
  const semAPromo = promoAqui && semPromo ? { promo: { tirada: true } } : {};
  const tempoDosServicos = escolhidos.reduce((t, o) => t + duracaoDe(o.servicoId), 0);
  /** O valor deste serviço fica no preço da lista (trava ligada e o serviço tem preço). */
  const valorFixo = (id: string) => travado && precoDoServico(servicoDe(id), porte) != null;
  /** O que está escrito no valor deste serviço não é número. */
  const textoRuim = (o: Escolhido) => o.mexido && (o.texto ?? "").trim() !== "" && lerValor(o.texto ?? "") == null;

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
  const nomesDaEquipe = quemAtende.map((p) => p.nome);
  const nomeDe = (id: string | null) => (id ? nomeNaEquipe(quemAtende.find((p) => p.id === id)?.nome, nomesDaEquipe) || "profissional" : "pet shop inteiro");

  const funcionamento = horarioDoDia(petshop.horario, deIsoDia(dia));
  // a folha aberta por muito tempo: a cada minuto a lista de hoje tira o horário que já passou (09:30 some às 09:31)
  const [minuto, setMinuto] = useState(0);
  useEffect(() => { const id = setInterval(() => setMinuto((m) => m + 1), 60000); return () => clearInterval(id); }, []);
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
  }, [funcionamento, dia, doDia, bloqueios, profId, duracao, agendamento, petshop, equipe, minuto]);

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
  type JaMarcado = { id: string; inicio: string; fim: string; status: string };
  /** O máximo de outros pets ao mesmo tempo dentro do horário escolhido, no dia `d`. */
  const juntosEm = (lista: JaMarcado[], d: string) => {
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
  const valorRuim = vejoFinanceiro && escolhidos.some((o) => textoRuim(o) && !valorFixo(o.servicoId));
  const semPorte = Boolean(pet && !pet.porte);
  // o valor sugerido depende do porte (um dos serviços tem preço diferente por porte) e a pessoa não escreveu outro
  const valorPedePorte = semPorte && escolhidos.some((o) => !o.mexido && precoMudaComPorte(servicoDe(o.servicoId)));
  const faltaPorte = valorPedePorte && !porteDepois && !agendamento;
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
    if (!escolhidos.length && ativos.length) { avisar("Escolha o que o pet vai fazer."); return; }
    if (!hhmm) { avisar("Escolha o horário."); return; }
    if (!anoOk) { avisarErro("Confira o ano da data: ele parece errado."); return; }
    if (valorRuim) { avisarErro("Confira o valor: escreva só números, como 45,00."); return; }
    if (faltaPorte) {
      avisarErro(`Antes de marcar, diga o porte de ${pet.nome}: o valor muda com ele. Se não souber, toque em "Não sei ainda".`);
      perguntaPorte.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const erroPreco = erroDeValor(preco, escolhidos.length > 1 && servico ? `O valor de ${servico.nome}` : "O valor");
    if (erroPreco) { avisarErro(erroPreco); return; }
    for (const o of outros) {
      const erroOutro = erroDeValor(o.preco, `O valor de ${servicoDe(o.servicoId)?.nome ?? "um serviço"}`);
      if (erroOutro) { avisarErro(erroOutro); return; }
    }
    const aMais = outros.map((o) => ({ servico_id: o.servicoId, preco: o.preco }));
    const inicio = juntaDiaHora(dia, hhmm);
    const fim = new Date(inicio.getTime() + duracao * 60000);
    setSalvando(true);
    try {
      const campos = {
        pet_id: pet.id, servico_id: servicoId, profissional_id: profId, preco,
        leva_traz: levaTraz, endereco_leva_traz: levaTraz ? endereco.trim() || null : null,
        // marcou sem saber o porte: o horário leva o lembrete para quem atender conferir
        obs: (valorPedePorte && porteDepois && !obs.includes(NOTA_PORTE) ? [obs.trim(), NOTA_PORTE].filter(Boolean).join(" ").slice(0, 400) : obs.trim()) || null,
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
          return { ...campos, ...semAPromo, inicio: ini.toISOString(), fim: new Date(ini.getTime() + duracao * 60000).toISOString(), serie_id: serie, petshop_id: petshop.id, criado_por: user.id };
        })).select("id"));
        if (aMais.length) await juntarAosMarcados(marcados.map((m) => m.id), aMais);
        // "até eu cancelar": a série fica marcada para a Agenda avisar quando estiver acabando
        const guardou = semFim && serie ? await sb.from("series_agenda").insert({ serie_id: serie, petshop_id: petshop.id, cada_semanas: repetir }).select("serie_id") : null;
        avisar(`${usar.length === 1 ? "1 horário marcado" : `${usar.length} horários marcados`}${!semFim ? "" : guardou?.error ? ". Não consegui guardar o Até eu cancelar: a repetição termina no último horário." : ". Perto do fim, a Agenda avisa para marcar os próximos."}`);
        avisarMudanca();
        aoSalvar(marcados[0] ? { id: marcados[0].id, inicio: juntaDiaHora(usar[0], hhmm).toISOString(), quantos: usar.length, pet: pet?.nome, sexo: pet?.sexo } : undefined);
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
      }
      let marcado: Marcado | undefined;
      if (!agendamento) {
        const novo = ok(await sb.from("agendamentos").insert({ ...campos, ...semAPromo, ...quando, petshop_id: petshop.id, criado_por: user.id }).select("id").single());
        if (aMais.length) await juntarAosMarcados([novo.id], aMais);
        marcado = { id: novo.id, inicio: inicio.toISOString(), quantos: 1, pet: pet?.nome, sexo: pet?.sexo };
      }
      avisar(agendamento ? "Horário alterado." : `${marcadoPara(pet.nome, pet.sexo)} para ${dataAmigavel(inicio)} às ${hhmm}.`);
      avisarMudanca();
      if (agendamento && new Date(agendamento.inicio).getTime() !== inicio.getTime()) {
        const nomes = [servicos.find((x) => x.id === servicoId)?.nome, ...aMais.map((o) => servicos.find((x) => x.id === o.servico_id)?.nome)].filter((n): n is string => Boolean(n));
        const oQue = nomes.length < 2 ? nomes[0] ?? null : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
        const quandoTexto = dataAmigavel(inicio);
        setRemarcado({
          quando: quandoTexto, hora: hhmm,
          zap: linkWhatsApp(pet.clientes?.telefone, textoRemarcado({ tutor: pet.clientes?.nome, pet: pet.nome, sexo: pet.sexo, servico: oQue, quando: quandoTexto, hora: hhmm, petshop: petshop.nome })),
        });
        setSalvando(false);
        return;
      }
      aoSalvar(marcado);
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

  if (remarcado && pet) {
    const tutor = pet.clientes?.nome?.split(" ")[0];
    return (
      <Folha titulo="Horário remarcado" aoFechar={() => aoSalvar()}
        rodape={<><button type="button" className="g-btn sec" onClick={() => aoSalvar()}>Fechar</button>
          {remarcado.zap && <a className="g-btn zap" href={remarcado.zap} target="_blank" rel="noopener noreferrer" onClick={() => aoSalvar()}><MessageCircle />Avisar {tutor ?? "o tutor"} no WhatsApp</a>}</>}>
        <div className="g-pilha" role="status">
          <div className="g-card areia g-fila">
            <CalendarCheck2 aria-hidden />
            <div className="g-cresce"><b>{pet.nome}: {remarcado.quando} às {remarcado.hora}.</b><div className="g-pp g-muted">O horário já mudou na agenda.</div></div>
          </div>
          <p className="g-muted g-p">{remarcado.zap
            ? `Quer avisar ${tutor ?? "o tutor"}? A mensagem sai pronta com o dia e a hora novos. Você só aperta enviar no WhatsApp.`
            : "O tutor não tem telefone na ficha, então não dá para mandar o aviso pelo WhatsApp."}</p>
        </div>
      </Folha>
    );
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
          {semPorte && servico && (
            <div className={`g-agd-alerta g-agd-porte${faltaPorte ? " falta" : ""}`} role="status" ref={perguntaPorte}><TriangleAlert />
              <div>
                {porteDepois ? (
                  <span><b>Porte de {pet.nome}: a conferir na hora.</b> {vejoFinanceiro ? "O valor abaixo é o primeiro preço do serviço e o" : "O"} horário vai com a anotação "{NOTA_PORTE}" Se já souber, escolha:</span>
                ) : (
                  <span><b>Qual é o porte de {pet.nome}?</b> {valorPedePorte ? `A ficha está sem porte e o valor ${escolhidos.length > 1 ? "dos serviços" : "deste serviço"} muda com ele.` : escolhidos.some((o) => o.mexido) && vejoFinanceiro ? "A ficha está sem porte. O valor é o que você escreveu." : "A ficha está sem porte."}</span>
                )}
                <div className="g-chips" role="group" aria-label={`Porte de ${pet.nome}`}>
                  {PORTES.map((x) => <button key={x.id} type="button" className="g-chip" disabled={salvandoPorte} onClick={() => void definirPorte(x.id)}>{x.rotulo}</button>)}
                </div>
                {valorPedePorte && !porteDepois && <div><button type="button" className="g-chip" aria-pressed={false} onClick={() => setPorteDepois(true)}>Não sei ainda — conferir o valor na hora</button></div>}
              </div>
            </div>
          )}

          <div className="g-campo g-agd-oque"><span id="oque-rotulo">O que o pet vai fazer?</span>
            {ativos.length === 0 ? <p className="g-pp g-muted" style={{ margin: 0 }}>Nenhum serviço cadastrado. O dono cadastra os serviços em Meu pet shop.</p> : (
              <div className="g-chips" role="group" aria-labelledby="oque-rotulo">
                {ativos.map((s) => (
                  <button key={s.id} type="button" className="g-chip" aria-pressed={escolhidos.some((o) => o.servicoId === s.id)}
                    onClick={() => alternarServico(s.id)}><i style={{ background: s.cor }} />{s.nome}</button>
                ))}
              </div>
            )}
            {ativos.length > 1 && escolhidos.length === 0 && (
              <p className="g-pp g-muted" style={{ margin: 0 }}>Toque em todos os serviços deste horário. {vejoFinanceiro ? "Cada um entra com o seu valor e o tempo soma." : "O tempo de cada um soma."}</p>
            )}
            {escolhidos.length > 0 && (
              <div className="g-agd-escolhidos">
                <ul className={`g-agd-outros-l${vejoFinanceiro ? "" : " sem-valor"}`} aria-label="Serviços deste horário">
                  {escolhidos.map((o, i) => {
                    const s = servicoDe(o.servicoId);
                    const nome = s?.nome ?? "Serviço";
                    const ruim = textoRuim(o);
                    const atencao = semPorte && !o.mexido && precoMudaComPorte(s);
                    return (
                      <li key={o.servicoId}>
                        <div className="t"><b>{nome}</b><small>{i === 0 ? tempo(s?.duracao_min ?? 0) : `+ ${tempo(s?.duracao_min ?? 0)}`}</small></div>
                        {vejoFinanceiro && valorFixo(o.servicoId) ? (
                          <span className="g-agd-valor fixo" title="Preço da lista. Só o dono ou quem cuida do financeiro muda."><b className="g-tab">{brl(o.preco ?? 0)}</b></span>
                        ) : vejoFinanceiro && (
                          <label className={`g-agd-valor${ruim ? " ruim" : atencao ? " atencao" : ""}`} aria-label={`Valor de ${nome}`} onInput={(e) => mudarTexto(o.servicoId, (e.target as HTMLInputElement).value)}>
                            <CampoDinheiro valor={o.preco} aoMudar={(v) => mudarValor(o.servicoId, v)} placeholder="definir" rotulo={`Valor de ${nome}`} />
                          </label>
                        )}
                        <button type="button" className="g-ico" aria-label={`Tirar ${nome} deste horário`} onClick={() => alternarServico(o.servicoId)}><X /></button>
                      </li>
                    );
                  })}
                </ul>
                {valorRuim && <p className="g-erro g-pp" role="alert" style={{ margin: 0 }}>Algum valor não é número. Escreva só números, como 45,00.</p>}
                {vejoFinanceiro && travado && escolhidos.some((o) => valorFixo(o.servicoId)) && <p className="g-pp g-muted" style={{ margin: 0 }}>Preço da lista. Só o dono ou quem cuida do financeiro marca com outro valor.</p>}
                {promoAqui && (
                  <div className={`g-fila entre g-promo-linha${semPromo ? " tirada" : ""}`} role="status">
                    {semPromo
                      ? <><span className="g-muted">Promoção {promoAqui.nome} tirada</span><button type="button" className="g-link" onClick={() => setSemPromo(false)}>Pôr de volta</button></>
                      : <><span><Tag size={14} aria-hidden /> Promoção {promoAqui.nome}</span>
                        <span className="g-fila" style={{ gap: 8 }}>
                          <b className="g-tab g-verde-t">{vejoFinanceiro && promoValor > 0 ? `− ${brl(promoValor)}` : descontoCurto(promoAqui)}</b>
                          <button type="button" className="g-btn fantasma p" onClick={() => setSemPromo(true)} aria-label={`Tirar a promoção ${promoAqui.nome}`}><X />Tirar</button>
                        </span></>}
                  </div>
                )}
                {promoAqui && !semPromo && <p className="g-pp g-muted" style={{ margin: 0 }}>O preço do horário fica o da lista. A promoção entra como desconto na hora de fechar a conta.</p>}
                {escolhidos.length > 1 && (
                  <div className="g-agd-total" role="status">
                    <span>Tempo total</span><b className="g-tab">{tempo(tempoDosServicos)}</b>
                    {vejoFinanceiro && <><span>Total</span><b className="g-tab">{brl(totalDoHorario)}</b></>}
                  </div>
                )}
              </div>
            )}
          </div>

          {quemAtende.length > 1 && (
            <div className="g-campo"><span>Quem atende</span>
              <div className="g-chips">
                <button type="button" className="g-chip" aria-pressed={profId === null} onClick={() => setProfId(null)}>A definir</button>
                {quemAtende.map((p) => <button key={p.id} type="button" className="g-chip" aria-pressed={profId === p.id} onClick={() => setProfId(p.id)}><i style={{ background: p.cor }} />{nomeNaEquipe(p.nome, nomesDaEquipe)}</button>)}
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
              <span><b>Fora do horário de funcionamento.</b> {dataAmigavel(dia).replace(/^./, (c) => c.toUpperCase())} o pet shop abre das {foraAqui.abre} às {foraAqui.fecha}.{" "}
                {paraMin(hhmm) >= paraMin(foraAqui.abre) && paraMin(hhmm) < paraMin(foraAqui.fecha)
                  ? `O atendimento leva ${duracao >= 60 ? textoDuracao(duracao) : `${duracao} min`}: começando às ${hhmm}, termina às ${deMin(paraMin(hhmm) + duracao)}, depois do horário de fechar. `
                  : ""}Você pode marcar mesmo assim.</span>
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
            <Campo rotulo="Duração" dica={escolhidos.length > 1 ? "Já vem com o tempo dos serviços somado." : undefined}>
              <select className="g-select" value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
                {[15, 30, 45, 60, 90, 120, 150, 180, 240].concat([15, 30, 45, 60, 90, 120, 150, 180, 240].includes(duracao) ? [] : [duracao]).sort((a, b) => a - b)
                  .map((m) => <option key={m} value={m}>{tempo(m)}</option>)}
              </select>
            </Campo>
            {vejoFinanceiro && !servico && ativos.length === 0 && (
              <Campo rotulo="Valor"><span className="g-agd-valor"><CampoDinheiro valor={precoSolto} aoMudar={setPrecoSolto} placeholder="definir" /></span></Campo>
            )}
          </div>

          <label className="g-check"><input type="checkbox" checked={levaTraz} onChange={(e) => setLevaTraz(e.target.checked)} /><Truck size={18} /> Leva e traz</label>
          {levaTraz && <Campo rotulo="Endereço para buscar"><input className="g-input" value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Campo>}
          <Campo rotulo="Observação" dica={DICA_OBS}><CampoComVoz valor={obs} aoMudar={setObs} maxLength={400} rotulo="Ditar a observação"><textarea className="g-textarea" value={obs} maxLength={400} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: tosa na máquina 4, laço rosa" /></CampoComVoz></Campo>
        </form>
      )}
    </Folha>
  );
}
