"use client";

import AceiteDoLink from "@/components/gestao/agenda/aceite-do-link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BedDouble, CalendarCheck, CalendarOff, DoorOpen, Home, HandCoins, Hourglass, LogIn, LogOut, MessageCircle, Moon, NotebookPen, Pencil, Plus, Printer, Settings2, ShieldAlert, ShieldCheck, Sun, Sunset, Syringe } from "lucide-react";
import { useCalendario } from "@/components/gestao/calendario";
import { useGestao } from "@/components/gestao/contexto";
import FormPet from "@/components/gestao/form-pet";
import { Kpi } from "@/components/gestao/painel";
import { AvatarPet, avisarMudanca, Campo, CampoValor, EscolherPet, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { AvisoCaixaFechado, Chips, ChipsForma, erroDeValor, ErroTela, lembrarForma, useCaixaAberto, useFormaLembrada } from "@/components/gestao/loja/pecas";
import { cuidadosVigentes, estadoSaude, type CuidadoResumido } from "@/components/gestao/clientes/saude";
import Diario from "@/components/gestao/casa/diario";
import { AvisoDeVaga, FolhaEspera, ListaDeEspera, useListaDeEspera } from "@/components/gestao/casa/espera";
import { FolhaOcorrencia, OcorrenciasDoCartao } from "@/components/gestao/casa/ocorrencias";
import { FolhaQuemPodeBuscar, lerRetiradas, QuemBuscou, textoDaRetirada } from "@/components/gestao/casa/portaria";
import { decidirAtraso, FolhaTaxaDeAtraso, fraseDoAtraso, lerAtraso, lerAtrasosPendentes, type AtrasoPendente } from "@/components/gestao/creche/atraso";
import Chamada from "@/components/gestao/creche/chamada";
import Cobrancas from "@/components/gestao/creche/cobrancas";
import LinkCrecheHotel from "@/components/gestao/creche/link-creche-hotel";
import Mensalistas from "@/components/gestao/creche/mensalistas";
import ReposicoesParaConferir from "@/components/gestao/creche/reposicoes";
import PedidosLink from "@/components/gestao/agenda/pedidos-link";
import CheckOut, { comNota, DetalheDaEstadia, estadiasDoTutor, NoitePorNoite, NOTA_PACOTE, pacoteServe, pacotesParaEstadia, venceu } from "@/components/gestao/hotel/checkout";
import { CuidadosDoDia, cuidadosParaGravar, EditorDeCuidados } from "@/components/gestao/hotel/cuidados";
import { AvisarChegadas, MensagensDaEstadia } from "@/components/gestao/hotel/mensagens";
import Ocupacao from "@/components/gestao/hotel/ocupacao";
import { CamposSinal, CancelarComSinal, conferirSinal, EtiquetaSinal, faltaDoSinal, FolhaSinal, lancarSinal, prepararSinal, sinalInicial, type EstadoSinal } from "@/components/gestao/hotel/sinal";
import { comValoresDeEstadia, idsParaCobrar } from "@/lib/gestao/reservado";
import { horaCurta, nomeTipo, SELECT_ESTADIA, type EstadiaCompleta, type PetDaEstadia, type Tipo } from "@/components/gestao/hotel/tipos";
import { diarioDe, esperaDe, ocorrenciasLigadas, portariaLigada, type Ocorrencia, type Retirada } from "@/lib/gestao/casa-opcoes";
import { esperadoNoDia, lerPlanos, lerPresencas, planoAtivo, planoVale, podeMudarPlano, type PlanoCompleto } from "@/lib/gestao/creche";
import { conferirCaixa, conferirValorAlto, lancarPago, type ItemLancamento } from "@/lib/gestao/dinheiro";
import { atrasoSugerido, diaFechado, fraseDoDiaFechado, ID_TAXA_ATRASO, NOME_TAXA_ATRASO } from "@/lib/gestao/feriados";
import {
  aceitaSinal, contaDasDiarias, contarDiarias, diariaFixa, diariaSugerida, estadiaSemCobranca, fatosDoDia, lerConta, lerCuidados, nivelDeOcupacao, nomeDaAcomodacao, ocupadasNoDia, ocupaNoDia, precoPorNoite, sinalSugerido,
  taxaNaConta, taxasGuardadas, temNoiteDiferente, textoDoCuidado, vagasDoTipo, type ContaDaEstadia, type Cuidado, type CuidadoFeito, type EstadiaDoTutor, type Mens, type ValoresDaEstadia,
} from "@/lib/gestao/hotel";
import { acomodacoesDe, cuidadosLigados, porteDe, taxasDe } from "@/lib/gestao/hotel-opcoes";
import { principalDe, usaModulo } from "@/lib/gestao/modulos";
import type { Banco } from "@/lib/gestao/supabase";
import type { Estadia, Petshop } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, inicioDoDia, isoDia, juntaDiaHora, nomeMes, somaDias } from "@/lib/gestao/util";
import "./creche-hotel.css";
import "@/components/gestao/hotel/hotel.css";

const TIPOS = [{ id: "creche", rotulo: "Creche" }, { id: "hotel", rotulo: "Hotel" }] as const;
const FILTRO_TIPO = [{ id: "todos", rotulo: "Todos" }, ...TIPOS] as const;
type Aba = "casa" | "reservas" | "historico";
/** As partes da tela: a chamada dos mensalistas, a casa (como sempre foi), a ocupação por dia, os planos e as cobranças. */
type Ver = "chamada" | "casa" | "ocupacao" | "diario" | "mensalistas" | "cobrancas";

/** "ontem, 8h" */
const quando = (d: string | Date) => `${dataAmigavel(new Date(d))}, ${horaCurta(d)}`;
const centavos = (n: number) => Math.round(n * 100) / 100;

type Periodo = Pick<Estadia, "tipo" | "entrada" | "saida_prevista" | "status">;

// A regra de ocupação de vaga (`estadiaOcupa`) mora em src/lib/gestao/creche.ts, junto da conta dos mensalistas;
// `ocupaNoDia` e `ocupadasNoDia` (src/lib/gestao/hotel.ts) são as mesmas que o calendário de Ocupação usa.

/** Quantos dias à frente a tela confere quando a estadia não tem saída prevista. */
const DIAS_A_CONFERIR = 30;
/** Dias (AAAA-MM-DD) em que a estadia ocupa uma vaga, pela regra acima. Na casa e sem saída prevista, confere os próximos 30 dias. */
function diasOcupados(e: Periodo, hoje: Date): string[] {
  const hojeIso = isoDia(hoje);
  const hoje0 = inicioDoDia(hoje);
  const ini = inicioDoDia(new Date(e.entrada));
  let fim = e.saida_prevista ? inicioDoDia(new Date(e.saida_prevista)) : somaDias(hoje0 > ini ? hoje0 : ini, DIAS_A_CONFERIR);
  if (e.status === "em_casa" && hoje0 > fim) fim = hoje0;
  const dias: string[] = [];
  for (let d = ini; d <= fim && dias.length < 400; d = somaDias(d, 1)) if (ocupaNoDia(e, isoDia(d), hojeIso)) dias.push(isoDia(d));
  return dias;
}

/** Primeiro e último dia do período no calendário (os dois contam). Quem está na casa sem saída prevista não tem fim. */
function pontas(e: Periodo, hoje: string): [string, string] {
  const ini = isoDia(new Date(e.entrada));
  let fim = e.saida_prevista ? isoDia(new Date(e.saida_prevista)) : e.status === "em_casa" ? "9999-12-31" : ini;
  if (e.status === "em_casa" && hoje > fim) fim = hoje;
  return [ini, fim < ini ? ini : fim];
}
/**
 * Outra reserva ou estadia aberta do mesmo pet que cruza o período novo. É a mesma conta do aceite de pedido no banco:
 * as datas se cruzam no calendário, com o dia da saída contando. Quem já está na casa não entra de novo.
 */
function conflitoDoPet(petId: string, novo: Periodo, abertas: EstadiaCompleta[], ignorar: string | null, hoje: Date): EstadiaCompleta | null {
  const hojeIso = isoDia(hoje);
  const [de, ate] = pontas(novo, hojeIso);
  for (const e of abertas) {
    if (e.pet_id !== petId || e.id === ignorar) continue;
    if (novo.status === "em_casa" && e.status === "em_casa") return e;
    const [a, b] = pontas(e, hojeIso);
    // passa o dia na creche e dorme no hotel: a reserva do hotel pode começar no dia em que a creche termina, depois da saída
    const fimDaCreche = e.tipo === "creche" && e.status === "em_casa" && !e.saida_prevista ? hojeIso : b;
    if (novo.tipo === "hotel" && novo.status === "reservada" && e.tipo === "creche" && de === fimDaCreche
      && new Date(novo.entrada) >= new Date(e.saida_prevista ?? e.entrada) && (e.status !== "em_casa" || new Date(novo.entrada) > hoje)) continue;
    if (a <= ate && b >= de) return e;
  }
  return null;
}
function fraseConflito(nome: string, e: EstadiaCompleta) {
  if (e.status === "em_casa") return `${nome} já está na casa desde ${quando(e.entrada)}.`;
  const ate = e.saida_prevista && isoDia(new Date(e.saida_prevista)) !== isoDia(new Date(e.entrada)) ? ` a ${dataCurta(e.saida_prevista)}` : "";
  return `${nome} já tem reserva de ${nomeTipo(e.tipo).toLowerCase()} em ${dataCurta(e.entrada)}${ate}. Mude as datas ou edite essa reserva.`;
}
const ehRepetido = (x: unknown) => /estadias_um_na_casa|duplicate key|23505/i.test(x instanceof Error ? x.message : String((x as { message?: unknown })?.message ?? x));

/** Vacinas vencidas do pet (só a dose que vale de cada uma), prontas para mostrar. */
async function vacinasVencidas(sb: Banco, petshopId: string, petId: string): Promise<string[]> {
  const r = await sb.from("pets_saude").select("pet_id, tipo, nome, aplicado_em, vence_em, criado_em").eq("petshop_id", petshopId).eq("pet_id", petId).eq("tipo", "vacina").limit(500);
  if (r.error) throw new Error(r.error.message);
  return cuidadosVigentes((r.data ?? []) as CuidadoResumido[]).filter((c) => estadoSaude(c.vence_em) === "vencido")
    .map((c) => `${c.nome} (venceu em ${dataCompleta(c.vence_em!)})`);
}

/** As outras estadias abertas dos pets do mesmo tutor (para o desconto do segundo pet nas prévias). */
const doMesmoTutor = (abertas: EstadiaCompleta[], clienteId: string | null | undefined): EstadiaDoTutor[] => (clienteId ? abertas.filter((x) => x.pets?.clientes?.id === clienteId) : []);

/**
 * Diárias e total previstos de uma reserva ou estadia (null se a diária não foi combinada).
 * Com as opções de preço desligadas é diárias × diária, como sempre; ligadas, é a conta noite a noite mais as taxas marcadas.
 */
function previsto(petshop: Petshop, e: { id: string | null; pet_id: string; tipo: string; entrada: string; saida_prevista: string | null; valor_diaria: number | null; criado_em?: string | null },
  outras: EstadiaDoTutor[], valores?: Pick<ValoresDaEstadia, "taxas"> | null) {
  if (e.valor_diaria == null) return null;
  const n = e.saida_prevista ? contarDiarias(e, new Date(e.saida_prevista)) : 1;
  const d = contaDasDiarias(petshop, e, n, Number(e.valor_diaria), outras, new Date());
  const taxas = centavos(taxasGuardadas(valores).reduce((t, x) => t + taxaNaConta(x, n).total, 0));
  const simples = centavos(n * Number(e.valor_diaria));
  return { n, total: centavos((d.total ?? 0) + taxas), aberto: !e.saida_prevista, comRegra: (d.total ?? 0) !== simples || temNoiteDiferente(d.noites), taxas, noites: d.noites, diarias: d.total ?? 0 };
}
function LinhaValor({ e, plano, abertas, valores }: { e: EstadiaCompleta; plano?: PlanoCompleto; abertas: EstadiaCompleta[]; valores?: ValoresDaEstadia | null }) {
  const { vejoFinanceiro, petshop } = useGestao();
  // mensalista: o dia é do plano (ou vai para a cobrança do mês); não tem diária na porta
  if (e.mensalista) {
    return (
      <p className="g-cm-marca">
        <span className="g-tag amarelo">Mensalista{plano ? ` · ${plano.dias.length}x por semana` : ""}</span>
        <span>{e.mensalista === "plano" ? "dia do plano" : e.mensalista === "extra" ? (e.status === "reservada" ? "dia extra reservado: quando vier, entra na próxima mensalidade" : "dia extra: entra na cobrança do mês") : "reposição de falta"}</span>
      </p>
    );
  }
  if (!vejoFinanceiro) return e.sinal_estado ? <p className="g-ht-sinal"><EtiquetaSinal e={e} /></p> : null;
  const p = previsto(petshop, { ...e, valor_diaria: e.valor_diaria == null ? null : Number(e.valor_diaria) }, doMesmoTutor(abertas, e.pets?.clientes?.id), valores);
  const sinal = <EtiquetaSinal e={e} valores={valores} />;
  if (!p) return <p className="g-ch-valor g-muted"><span>Diária não combinada</span>{sinal}</p>;
  return (
    <p className="g-ch-valor">
      <span>Diária <b className="g-tab">{brl(e.valor_diaria)}</b></span>
      {Number(e.valor_diaria) === 0 && !p.total ? <span className="g-tag">cortesia</span>
        : p.aberto ? <span className="g-muted">sem saída prevista</span>
        : <span>Total previsto <b className="g-tab">{brl(p.total)}</b> <span className="g-muted">({p.n} {p.n === 1 ? "diária" : "diárias"}{p.comRegra ? ", com temporada, feriado ou desconto" : ""}{p.taxas ? " e taxas" : ""})</span></span>}
      {sinal}
    </p>
  );
}

/** No Histórico: o que foi cobrado na saída. Estadia antiga, sem esse registro, mostra a conta pelas datas como estimativa. */
function Cobrado({ e }: { e: EstadiaCompleta }) {
  const { vejoFinanceiro } = useGestao();
  const plural = (n: number) => `${n} ${n === 1 ? "diária" : "diárias"}`;
  if (e.mensalista) return <span className="g-tag amarelo g-ch-cobrado">{e.mensalista === "plano" ? "dia do plano" : e.mensalista === "extra" ? "dia extra" : "reposição"}</span>;
  // quem não vê o financeiro vê as diárias, sem valor
  if (!vejoFinanceiro && !e.obs?.includes(NOTA_PACOTE)) return <span className="g-tag g-ch-cobrado">{plural(e.diarias_cobradas ?? contarDiarias(e, new Date(e.saida ?? e.entrada)))}</span>;
  if (e.diarias_cobradas == null) {
    const n = contarDiarias(e, new Date(e.saida ?? e.entrada));
    return <span className="g-tag g-ch-cobrado" title="Estadia antiga: o sistema ainda não guardava o que foi cobrado. Esta é a conta pelas datas.">{plural(n)} <small>(estimativa)</small></span>;
  }
  const n = e.diarias_cobradas;
  if (e.obs?.includes(NOTA_PACOTE)) return <span className="g-tag azul g-ch-cobrado">{n === 1 ? "1 uso do pacote" : `${n} usos do pacote`}</span>;
  if (e.valor_cobrado == null) return <span className="g-tag g-ch-cobrado">{plural(n)} · sem valor lançado</span>;
  if (Number(e.valor_cobrado) === 0) return <span className="g-tag g-ch-cobrado">{plural(n)} · cortesia</span>;
  return <span className="g-tag verde g-tab g-ch-cobrado">{plural(n)} · {brl(e.valor_cobrado)}</span>;
}

/** Etiqueta colorida do tipo: creche é dia (manteiga), hotel é noite (céu). */
function EtiquetaTipo({ tipo, curta }: { tipo: string; curta?: boolean }) {
  const Icone = tipo === "hotel" ? Moon : Sun;
  return <span className={`g-ch-tipo ${tipo === "hotel" ? "hotel" : "creche"}${curta ? " curta" : ""}`} title={nomeTipo(tipo)}><Icone aria-hidden /><em>{nomeTipo(tipo)}</em></span>;
}

/** Indicador que também é botão: toca e a tela abre naquela aba. */
function KpiAcao({ ativo, aoTocar, children }: { ativo: boolean; aoTocar: () => void; children: React.ReactNode }) {
  return (
    <div className="g-ch-kpi-acao" role="button" tabIndex={0} aria-pressed={ativo} onClick={aoTocar}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoTocar(); } }}>
      {children}
    </div>
  );
}

const PERIODOS = [{ id: "todas", rotulo: "Todas" }, { id: "7", rotulo: "Próximos 7 dias" }, { id: "mes", rotulo: "Este mês" }, { id: "outro", rotulo: "Outro período" }] as const;

export default function CrecheHotel() {
  const { sb, petshop, vejoFinanceiro, cuidoDoFinanceiro, souDono, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const usaCreche = usaModulo(petshop, "creche");
  const usaHotel = usaModulo(petshop, "hotel");
  // plano de mensalista: só o dono e quem cuida do financeiro mexem (a equipe, se o dono liberou em Meu pet shop)
  const podePlano = podeMudarPlano({ petshop, souDono, cuidoDoFinanceiro });
  const [ver, setVerEstado] = useState<Ver>("casa");
  // a parte aberta fica no endereço (?ver=...): recarregar a página não volta para a Chamada
  const setVer = useCallback((v: Ver | ((atual: Ver) => Ver)) => setVerEstado((atual) => {
    const novo = typeof v === "function" ? v(atual) : v;
    try { window.history.replaceState(null, "", `?ver=${novo}`); } catch { /* sem histórico: segue sem guardar */ }
    return novo;
  }), []);
  /** O nome da tela para este negócio: quem só tem hotel lê "Hotel", não "Creche e hotel". */
  const nomeDaTela = usaCreche && usaHotel ? "Creche e hotel" : usaHotel ? "Hotel" : usaCreche ? "Creche" : "Creche e hotel";
  const [novoPlano, setNovoPlano] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [mesCobranca, setMesCobranca] = useState(() => new Date());
  const [acertando, setAcertando] = useState<EstadiaCompleta | null>(null);
  const [cobrando, setCobrando] = useState<EstadiaCompleta | null>(null);
  // mensalista que saiu depois do horário: a pergunta da taxa, só para quem recebe
  const [taxa, setTaxa] = useState<AtrasoPendente | null>(null);
  // feriados e dias fechados (e, para quem recebe, o preço de feriado e a taxa de busca fora do horário)
  const { calendario } = useCalendario();
  const valorDaTaxa = vejoFinanceiro && calendario?.atraso.ativo ? calendario.atraso.creche.valor : null;
  const [aba, setAba] = useState<Aba>("casa");
  const [tipo, setTipo] = useState<"todos" | Tipo>("todos");
  const [nova, setNova] = useState<{ dia?: string; saida?: string; tipo?: Tipo; pet?: PetDaEstadia | null; espera?: string } | null>(null);
  // check-in de reserva com a data já passada: a pessoa diz se o pet chegou agora ou no dia reservado
  const [chegando, setChegando] = useState<EstadiaCompleta | null>(null);
  const [editando, setEditando] = useState<EstadiaCompleta | null>(null);
  const [lote, setLote] = useState(false);
  const [saindo, setSaindo] = useState<EstadiaCompleta | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<EstadiaCompleta | null>(null);
  const [sinalDe, setSinalDe] = useState<EstadiaCompleta | null>(null);
  const [cancelando, setCancelando] = useState<EstadiaCompleta | null>(null);
  const [detalhe, setDetalhe] = useState<EstadiaCompleta | null>(null);
  const [avisando, setAvisando] = useState(false);
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("todas");
  const [de, setDe] = useState(() => isoDia(new Date()));
  const [ate, setAte] = useState(() => isoDia(somaDias(new Date(), 30)));
  const comCuidados = cuidadosLigados(petshop);
  // cuidado com o tutor (tudo opcional): diário, quem pode buscar, lista de espera e ocorrências
  const comDiario = diarioDe(petshop).ativo, comPortaria = portariaLigada(petshop), comEspera = esperaDe(petshop).ativo, comOcorrencias = ocorrenciasLigadas(petshop);
  const [buscando, setBuscando] = useState<EstadiaCompleta | null>(null);
  const [ocorrenciaDe, setOcorrenciaDe] = useState<EstadiaCompleta | null>(null);
  const [autorizadosDe, setAutorizadosDe] = useState<EstadiaCompleta | null>(null);
  const [esperaNova, setEsperaNova] = useState<{ pet?: PetDaEstadia | null; tipo?: Tipo; entrada?: string; saida?: string } | null>(null);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [abertas, passadas, pendentes] = await Promise.all([
      sb.from("estadias").select(SELECT_ESTADIA).eq("petshop_id", petshop.id).in("status", ["reservada", "em_casa"]).order("entrada").limit(500),
      sb.from("estadias").select(SELECT_ESTADIA).eq("petshop_id", petshop.id).in("status", ["encerrada", "cancelada"]).order("entrada", { ascending: false }).limit(100),
      // check-outs que fecharam sem cobrança (feitos por quem não mexe com dinheiro): todos, não só os últimos do histórico
      (async (): Promise<{ data: unknown[] | null }> => {
        const ids = vejoFinanceiro ? await idsParaCobrar(sb, petshop.id) : [];
        return ids.length ? await sb.from("estadias").select(SELECT_ESTADIA).eq("petshop_id", petshop.id).in("id", ids).order("saida", { ascending: false }) : { data: [] };
      })(),
    ]);
    // a diária e o valor cobrado vêm à parte, só para quem recebe (para os outros ficam em branco)
    const [lista, antigas, pend] = await Promise.all([
      comValoresDeEstadia(sb, petshop.id, ok(abertas) as unknown as EstadiaCompleta[], vejoFinanceiro),
      comValoresDeEstadia(sb, petshop.id, ok(passadas) as unknown as EstadiaCompleta[], vejoFinanceiro),
      comValoresDeEstadia(sb, petshop.id, (pendentes.data ?? []) as unknown as EstadiaCompleta[], vejoFinanceiro),
    ]);
    const semCobranca = pend.filter(estadiaSemCobranca);
    // sinal e taxas das reservas e estadias abertas: só quem recebe lê (o banco não entrega para os outros)
    const valores = new Map<string, ValoresDaEstadia>();
    if (vejoFinanceiro && lista.length + semCobranca.length) {
      const v = await sb.from("estadias_valores").select("*").eq("petshop_id", petshop.id).in("estadia_id", [...lista, ...semCobranca].map((e) => e.id));
      for (const x of v.data ?? []) valores.set(x.estadia_id, x);
    }
    let feitos: CuidadoFeito[] = [];
    if (comCuidados) feitos = (await sb.from("estadias_cuidados").select("*").eq("petshop_id", petshop.id).eq("dia", isoDia(new Date())).limit(1000)).data ?? [];
    const encerradas = antigas;
    // ocorrências das estadias abertas e quem levou cada pet das encerradas (só com as opções ligadas)
    let ocorrencias: Ocorrencia[] = [];
    const naCasaIds = lista.filter((e) => e.status === "em_casa").map((e) => e.id);
    if (comOcorrencias && naCasaIds.length) ocorrencias = (await sb.from("estadias_ocorrencias").select("*").eq("petshop_id", petshop.id).in("estadia_id", naCasaIds).order("quando").limit(1000)).data ?? [];
    const retiradas = comPortaria ? await lerRetiradas(sb, petshop.id, encerradas.filter((e) => e.status === "encerrada").map((e) => e.id)).catch(() => new Map<string, Retirada>()) : new Map<string, Retirada>();
    // saídas de mensalista fora do horário que esperam a decisão da taxa (só quem recebe lê)
    const atrasos = vejoFinanceiro && usaCreche ? await lerAtrasosPendentes(sb, petshop.id) : [];
    return { abertas: lista, passadas: encerradas, valores, feitos, ocorrencias, retiradas, semCobranca, atrasos };
  }, [petshop.id, vejoFinanceiro, comCuidados, comOcorrencias, comPortaria, usaCreche]);

  // mensalistas: os planos e o que já aconteceu hoje (para a chamada e para a conta de vagas)
  const { dados: mens } = useDados<Mens | null>(async () => {
    if (!usaCreche) return null;
    const planos = await lerPlanos(sb, petshop.id, cuidoDoFinanceiro);
    const dia = isoDia(new Date());
    const mov = planos.length ? await lerPresencas(sb, petshop.id, dia, dia) : { presencas: [], faltas: [] };
    return { planos, ...mov };
  }, [petshop.id, usaCreche, cuidoDoFinanceiro]);
  const temMensalista = Boolean(mens?.planos.some((p) => planoAtivo(p, isoDia(new Date()))));
  // a tela abre na chamada quando há mensalistas; o endereço pode pedir outra parte (?ver=cobrancas)
  const [abriu, setAbriu] = useState(false);
  useEffect(() => {
    if (abriu) return;
    const pedido = new URLSearchParams(window.location.search).get("ver");
    // ?ver=cobrar (vem da tela Hoje): a lista de check-outs para cobrar fica no alto de Casa agora
    if (pedido === "cobrar") { setVer("casa"); setAbriu(true); return; }
    const direto = pedido === "ocupacao" || (pedido === "diario" && comDiario) ? pedido : null;
    if (direto) { setVer(direto); if (!usaCreche) setAbriu(true); }
    if (!usaCreche || !mens) return;
    setAbriu(true);
    if (direto) return;
    if (pedido === "chamada" || pedido === "mensalistas" || pedido === "casa" || (pedido === "cobrancas" && cuidoDoFinanceiro)) setVer(pedido);
    else if (temMensalista) setVer("chamada");
  }, [abriu, usaCreche, mens, temMensalista, cuidoDoFinanceiro, comDiario, setVer]);
  const planoDe = (e: EstadiaCompleta) => (e.plano_id ? mens?.planos.find((p) => p.id === e.plano_id) : undefined);

  const doTipo = (e: EstadiaCompleta) => tipo === "todos" || e.tipo === tipo;
  const abertas = useMemo(() => dados?.abertas ?? [], [dados]);
  const naCasa = useMemo(() => abertas.filter((e) => e.status === "em_casa"), [abertas]);
  const reservas = useMemo(() => abertas.filter((e) => e.status === "reservada"), [abertas]);
  const historico = dados?.passadas ?? [];
  // para o desconto do segundo pet: as estadias abertas e as que já saíram (o pet que saiu primeiro continua contando nas noites dele)
  const doTutor = useMemo(() => [...abertas, ...(dados?.passadas ?? []).filter((e) => e.status === "encerrada" && e.tipo === "hotel")], [abertas, dados]);
  const tudoVazio = Boolean(dados) && !naCasa.length && !reservas.length && !historico.length && !dados?.semCobranca.length && !dados?.atrasos.length;
  const valoresDe = (e: EstadiaCompleta) => dados?.valores.get(e.id) ?? null;

  const mudou = () => { void recarregar(); avisarMudanca(); };
  const abrirNova = () => { if (!somenteLeitura()) setNova({}); };
  const espera = useListaDeEspera(abertas, mens ?? null);
  const verEspera = () => { setVer("ocupacao"); setTimeout(() => document.getElementById("lista-de-espera")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150); };

  /**
   * Check-in pela reserva. Reserva de dia que já passou: pergunta antes se o pet chegou agora ou no dia reservado
   * (`quando`), para a estadia não recomeçar em "agora" e as noites saírem nos dias certos.
   */
  async function checkIn(e: EstadiaCompleta, quando?: "agora" | "reservado") {
    if (somenteLeitura()) return;
    const nome = e.pets?.nome ?? "O pet";
    if (!quando && isoDia(new Date(e.entrada)) < isoDia(new Date())) { setChegando(e); return; }
    // o mesmo pet não entra duas vezes na casa
    const jaAqui = abertas.find((x) => x.pet_id === e.pet_id && x.id !== e.id && x.status === "em_casa");
    if (jaAqui) { avisarErro(fraseConflito(nome, jaAqui)); return; }
    // reserva de dia extra de mensalista: a chegada é pela regra da chamada (o dia vai para a mensalidade, sem diária na porta)
    if (e.mensalista && e.plano_id && e.dia) {
      if (e.dia !== isoDia(new Date())) { avisarErro(`A reserva de ${nome} é para ${dataAmigavel(deIsoDia(e.dia))}. Se o dia não vale mais, cancele a reserva e marque outra.`); return; }
      setOcupado(e.id);
      try {
        ok(await sb.rpc("creche_chamada", { p_plano: e.plano_id, p_dia: e.dia, p_acao: "chegou" }));
        avisar(`${nome} chegou. O dia extra entra na próxima mensalidade.`);
        mudou();
      } catch (x) {
        const m = x instanceof Error ? x.message : String(x);
        avisarErro(/VACINA_VENCIDA/.test(m) ? `Check-in bloqueado: ${nome} está com vacina vencida. Só o dono libera a entrada, pela Chamada.` : x);
      } finally { setOcupado(null); }
      return;
    }
    setOcupado(e.id);
    try {
      const vencidas = await vacinasVencidas(sb, petshop.id, e.pet_id).catch(() => []);
      if (vencidas.length && e.tipo === "creche" && petshop.creche_bloqueia_vacina && !souDono) {
        avisarErro(`Check-in bloqueado: ${nome} está com vacina vencida (${vencidas.join(", ")}). Só o dono pode liberar a entrada.`);
        return;
      }
      if (vencidas.length && !(await confirmar({
        titulo: `${nome} está com vacina vencida`,
        texto: `${vencidas.join(", ")}. Confira a carteirinha antes de receber o pet.`,
        confirmar: "Fazer check-in mesmo assim", perigo: true,
      }))) return;
      const r = ok(await sb.from("estadias").update(quando === "reservado" ? { status: "em_casa" } : { status: "em_casa", entrada: new Date().toISOString() })
        .eq("id", e.id).eq("petshop_id", petshop.id).eq("status", "reservada").select("id"));
      if (!r.length) avisar("Essa reserva já tinha sido alterada. Atualizei a lista.");
      else avisar(quando === "reservado" ? `${nome} está na casa desde ${dataCurta(e.entrada)}, como estava reservado.` : `${nome} chegou.`);
      mudou();
    } catch (x) {
      if (ehRepetido(x)) { avisarErro(`${nome} já está na casa. Atualizei a lista.`); mudou(); }
      else avisarErro(x);
    } finally { setOcupado(null); }
  }

  async function cancelar(e: EstadiaCompleta) {
    if (somenteLeitura()) return;
    // reserva com sinal: quem recebe decide o que fazer com ele antes de cancelar
    if (e.sinal_estado === "pago" || e.sinal_estado === "a_receber") {
      const v = valoresDe(e);
      if (!vejoFinanceiro || !v) { avisarErro("Esta reserva tem sinal. Quem cuida do caixa cancela e diz o que fazer com o sinal."); return; }
      setCancelando(e);
      return;
    }
    if (!(await confirmar({ titulo: "Cancelar esta reserva?", texto: `${e.pets?.nome ?? "O pet"}, ${nomeTipo(e.tipo).toLowerCase()} ${dataAmigavel(new Date(e.entrada))}.`, confirmar: "Cancelar reserva", perigo: true }))) return;
    try {
      ok(await sb.from("estadias").update({ status: "cancelada" }).eq("id", e.id).eq("petshop_id", petshop.id).eq("status", "reservada").select("id"));
      avisar("Reserva cancelada.");
      mudou();
    } catch (x) { avisarErro(x); }
  }

  /** Saída de um mensalista: um toque, sem folha de pagamento (o dia é do plano ou vai para a cobrança do mês). */
  async function saidaDoMensalista(e: EstadiaCompleta) {
    if (somenteLeitura()) return;
    setOcupado(e.id);
    try {
      // saiu depois do horário (com a taxa ligada em Meu pet shop): o banco anota, sem valor e sem cobrar
      let atrasada = false;
      if (e.plano_id && e.dia) atrasada = Boolean((ok(await sb.rpc("creche_chamada", { p_plano: e.plano_id, p_dia: e.dia, p_acao: "saiu" })) as { atraso?: boolean } | null)?.atraso);
      else {
        ok(await sb.from("estadias").update({ status: "encerrada", saida: new Date().toISOString(), diarias_cobradas: 1 }).eq("id", e.id).eq("petshop_id", petshop.id).eq("status", "em_casa").select("id"));
        atrasada = (await sb.rpc("creche_atraso_anotar", { p_estadia: e.id })).data === true;
      }
      const nome = e.pets?.nome ?? "O pet";
      // quem recebe decide a taxa agora; os outros só ficam sabendo que a saída ficou anotada
      const a = atrasada && valorDaTaxa ? await lerAtraso(sb, e.id) : null;
      if (a) setTaxa(a);
      avisar(atrasada && !a ? `${nome} foi para casa. A saída foi depois do horário: ficou anotada em Check-outs para cobrar, para quem cuida do caixa decidir a taxa.` : `${nome} foi para casa.`);
      mudou();
    } catch (x) { avisarErro(x); } finally { setOcupado(null); }
  }

  /** Taxa de busca fora do horário desligada depois que a saída foi anotada: não há valor para cobrar, só dá para tirar da lista. */
  async function semTaxa(a: AtrasoPendente) {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Tirar da lista sem cobrar?", texto: `${a.pets?.nome ?? "O pet"} ${fraseDoAtraso(a)}. A taxa de busca fora do horário está desligada (ou sem valor) em Meu pet shop, então não há valor para cobrar. Para cobrar, ligue a taxa de novo e volte aqui.`, confirmar: "Não cobrar" }))) return;
    try { await decidirAtraso(sb, a.estadia_id, "dispensada"); avisar("Sem taxa desta vez."); mudou(); } catch (x) { avisarErro(x); }
  }

  /** A saída de um hóspede: com "Quem pode buscar" ligado, primeiro a equipe marca quem levou. */
  const sair = (e: EstadiaCompleta) => {
    if (somenteLeitura()) return;
    if (comPortaria) setBuscando(e);
    else if (e.mensalista) void saidaDoMensalista(e);
    else setSaindo(e);
  };

  const agora = new Date();
  const hoje0 = inicioDoDia(agora).getTime();
  const hojeIso = isoDia(agora);
  const amanhaIso = isoDia(somaDias(agora, 1));

  // números do topo: saem das estadias abertas que a tela já carregou
  const chegamHoje = reservas.filter((e) => isoDia(new Date(e.entrada)) === hojeIso);
  const chegamAmanha = reservas.filter((e) => isoDia(new Date(e.entrada)) === amanhaIso);
  const saemHoje = naCasa.filter((e) => e.saida_prevista && isoDia(new Date(e.saida_prevista)) === hojeIso);
  const atrasadas = naCasa.filter((e) => e.saida_prevista && new Date(e.saida_prevista) < agora);
  const crecheNaCasa = naCasa.filter((e) => e.tipo === "creche");
  // vagas de hoje, por tipo, pela regra de estadiaOcupa (no hotel, quem sai hoje já não ocupa a noite de hoje)
  const vagasHoje = TIPOS.map((t) => ({ ...t, total: vagasDoTipo(petshop, t.id), ocupadas: ocupadasNoDia(t.id, abertas, null, hojeIso, agora, mens ?? null, petshop.horario) }))
    .filter((v) => v.total != null);
  const noHotel = naCasa.filter((e) => e.tipo === "hotel").length;
  const proximaReserva = reservas.find((e) => new Date(e.entrada).getTime() >= hoje0);
  // check-out que fechou sem cobrança, sem pacote e sem plano: o dono precisa ver e acertar
  const semCobranca = vejoFinanceiro ? dados?.semCobranca ?? [] : [];
  const atrasosPendentes = vejoFinanceiro ? dados?.atrasos ?? [] : [];
  /** Quanto dá a conta de um check-out que ficou para cobrar (diárias pelas regras, taxas combinadas, menos o sinal). Sem diária combinada, null. */
  const contaPendente = (e: EstadiaCompleta) => {
    if (e.valor_diaria == null) return null;
    // com desconto do segundo pet a conta depende das outras estadias do tutor: o valor certo aparece ao abrir
    if (precoPorNoite(petshop, e.tipo)?.segundoPct) return null;
    const n = e.diarias_cobradas ?? 1, v = valoresDe(e);
    const d = contaDasDiarias(petshop, e, n, Number(e.valor_diaria), [], new Date(e.saida ?? e.entrada), e.saida ?? e.entrada);
    const taxas = taxasGuardadas(v).reduce((t, x) => t + taxaNaConta(x, n).total, 0);
    const sinal = v?.sinal != null && (v.sinal_estado === "pago" || v.sinal_estado === "a_receber") ? Number(v.sinal) : 0;
    return Math.max(0, centavos((d.total ?? 0) + taxas - sinal));
  };
  const vagasCrecheHoje = vagasHoje.find((v) => v.id === "creche");
  const previstoDe = (e: EstadiaCompleta) => { const p = previsto(petshop, { ...e, valor_diaria: e.valor_diaria == null ? null : Number(e.valor_diaria) }, doMesmoTutor(doTutor, e.pets?.clientes?.id), valoresDe(e)); return p && !p.aberto ? p.total : null; };
  const sugeridoPara = (e: EstadiaCompleta) => sinalSugerido(petshop, previstoDe(e));

  /** Etiquetas do cartão que não são dinheiro: a acomodação. */
  const quarto = (e: EstadiaCompleta) => { const n = nomeDaAcomodacao(petshop, e.acomodacao); return n ? <p className="g-ch-obs"><BedDouble aria-hidden /><span>{n}</span></p> : null; };
  const botaoMensagens = (e: EstadiaCompleta) => e.pets ? <button className="g-btn zap p" onClick={() => setMensagens(e)}><MessageCircle /> Mensagens</button> : null;

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>{nomeDaTela}</h1>
          <p className="g-muted">
            {naCasa.length ? `${naCasa.length} ${naCasa.length === 1 ? "pet na casa agora" : "pets na casa agora"}` : "Quem está aqui, quem vem e quem já foi."}
          </p>
        </div>
        <div className="g-acoes">
          {ver === "mensalistas" ? (podePlano && <button className="g-btn pri" onClick={() => { if (!somenteLeitura()) setNovoPlano(true); }}><Plus /> Novo mensalista</button>)
            : ver === "cobrancas" ? <button className="g-btn pri" onClick={() => { if (!somenteLeitura()) setGerando(true); }}><HandCoins /> Gerar cobranças de {nomeMes(mesCobranca)}</button>
            : <button className="g-btn pri" onClick={abrirNova}><Plus /> Nova reserva / Check-in</button>}
        </div>
      </header>

      <div className="g-seg g-ht-ver" role="group" aria-label="Partes da tela" style={{ marginBottom: 16 }}>
        {usaCreche && <button aria-pressed={ver === "chamada"} onClick={() => setVer("chamada")}>Chamada</button>}
        <button aria-pressed={ver === "casa"} onClick={() => setVer("casa")}>Casa agora</button>
        <button aria-pressed={ver === "ocupacao"} onClick={() => setVer("ocupacao")}>Ocupação</button>
        {comDiario && <button aria-pressed={ver === "diario"} onClick={() => setVer("diario")}>Diário</button>}
        {usaCreche && <button aria-pressed={ver === "mensalistas"} onClick={() => setVer("mensalistas")}>Mensalistas</button>}
        {usaCreche && cuidoDoFinanceiro && <button aria-pressed={ver === "cobrancas"} onClick={() => setVer("cobrancas")}>Cobranças</button>}
      </div>

      {erro && <ErroTela erro={erro} aoTentar={() => void recarregar()} />}

      {usaCreche && (souDono || cuidoDoFinanceiro) && (ver === "chamada" || ver === "casa" || ver === "cobrancas") && <ReposicoesParaConferir />}
      {ver === "casa" && posso("agenda") && <div className="g-ht-acima"><PedidosLink /></div>}

      {usaCreche && !mens ? <Esqueleto linhas={4} />
        : ver === "diario" && comDiario ? <Diario />
        : ver === "chamada" && mens ? <Chamada aviso={<AvisoDeVaga espera={espera} aoVer={verEspera} />} planos={mens.planos} vagasHoje={vagasCrecheHoje ? { ocupadas: vagasCrecheHoje.ocupadas, total: vagasCrecheHoje.total! } : null}
            aoNovoMensalista={() => { if (!somenteLeitura()) { setVer("mensalistas"); setNovoPlano(true); } }} />
        : ver === "mensalistas" && mens ? <Mensalistas planos={mens.planos} novo={novoPlano} aoAbrirNovo={() => { if (!somenteLeitura()) setNovoPlano(true); }} aoFecharNovo={() => setNovoPlano(false)} aoMudar={mudou} />
        : ver === "cobrancas" && mens && cuidoDoFinanceiro ? <Cobrancas planos={mens.planos} gerar={gerando} aoFecharGerar={() => setGerando(false)} aoMes={setMesCobranca} />
        : carregando && !dados ? <Esqueleto linhas={4} /> : !dados ? null
        : ver === "ocupacao" ? (
          <div className="g-pilha">
            <Ocupacao abertas={abertas} mens={mens ?? null} aoNovaReserva={(dia, t) => { if (!somenteLeitura()) setNova({ dia, tipo: t }); }} />
            <ListaDeEspera espera={espera} aoNova={() => setEsperaNova({})}
              aoReservar={(x) => setNova({ dia: x.entrada, saida: x.saida, tipo: x.tipo === "hotel" ? "hotel" : "creche", pet: x.pets, espera: x.id })} />
          </div>
        )
        : tudoVazio ? (
        <Vazio titulo={usaHotel ? "Nenhum hóspede ainda" : "Nenhum pet na creche ainda"} texto={usaHotel ? "Quando um pet vier passar o dia ou dormir aqui, faça o check-in e acompanhe por esta tela." : "Quando um pet vier passar o dia, faça o check-in e acompanhe por esta tela. Quem vem em dias fixos entra em Mensalistas."} mozart="acenando">
          <button className="g-btn sec" onClick={abrirNova}>Fazer o primeiro check-in</button>
        </Vazio>
      ) : (
        <div className="g-pilha">
          <div className="g-grade kpis">
            <KpiAcao ativo={aba === "casa"} aoTocar={() => setAba("casa")}>
              <Kpi icone={Home} tom="ceu" rotulo="Na casa agora" valor={naCasa.length}
                apoio={naCasa.length ? [naCasa.length - noHotel && `${naCasa.length - noHotel} na creche`, noHotel && `${noHotel} no hotel`].filter(Boolean).join(" · ") : "a casa está vazia"} />
            </KpiAcao>
            <KpiAcao ativo={false} aoTocar={() => setAba("reservas")}>
              <Kpi icone={LogIn} tom="menta" rotulo="Chegam hoje" valor={chegamHoje.length}
                apoio={chegamHoje.length ? chegamHoje.slice(0, 2).map((e) => e.pets?.nome).filter(Boolean).join(", ") + (chegamHoje.length > 2 ? ` e mais ${chegamHoje.length - 2}` : "") : "nenhuma reserva para hoje"} />
            </KpiAcao>
            <KpiAcao ativo={false} aoTocar={() => setAba("casa")}>
              <Kpi icone={DoorOpen} tom="pessego" rotulo="Saem hoje" valor={saemHoje.length}
                apoio={saemHoje.length ? saemHoje.slice(0, 2).map((e) => e.pets?.nome).filter(Boolean).join(", ") + (saemHoje.length > 2 ? ` e mais ${saemHoje.length - 2}` : "") : "ninguém com saída marcada para hoje"} />
            </KpiAcao>
            <KpiAcao ativo={aba === "reservas"} aoTocar={() => setAba("reservas")}>
              <Kpi icone={CalendarCheck} tom="lilas" rotulo="Reservas" valor={reservas.length}
                apoio={proximaReserva ? `próxima: ${quando(proximaReserva.entrada)}` : reservas.length ? "com a data já passada" : "nenhuma marcada"} />
            </KpiAcao>
          </div>

          <AvisoDeVaga espera={espera} aoVer={verEspera} />
          {semCobranca.length + atrasosPendentes.length > 0 && (
            <section className="g-card g-ht-cobrar" id="para-cobrar" aria-label="Check-outs para cobrar">
              <div className="g-card-t"><h3><HandCoins aria-hidden style={{ width: 18, height: 18 }} />Check-outs para cobrar</h3><span className="g-muted g-pp">{[
                semCobranca.length ? (semCobranca.length === 1 ? "1 estadia saiu sem cobrança" : `${semCobranca.length} estadias saíram sem cobrança`) : "",
                atrasosPendentes.length ? (atrasosPendentes.length === 1 ? "1 mensalista saiu fora do horário" : `${atrasosPendentes.length} mensalistas saíram fora do horário`) : "",
              ].filter(Boolean).join(" · ")}</span></div>
              {semCobranca.length > 0 && <p className="g-muted g-p">O check-out foi feito por quem não mexe com dinheiro. Toque em Receber: a conta abre pronta, com as diárias, as taxas e o sinal.</p>}
              {atrasosPendentes.length > 0 && <p className="g-muted g-p">Mensalista que saiu depois do horário: a taxa de busca fora do horário não foi cobrada. Você decide se cobra (na próxima mensalidade ou agora) ou se não cobra.</p>}
              <div className="g-lista">
                {atrasosPendentes.map((a) => (
                  <div key={a.estadia_id} className="g-linha">
                    <AvatarPet pet={a.pets ?? { nome: "?" }} />
                    <span className="t">
                      <b>{a.pets?.nome ?? "Pet removido"}</b>
                      <span>{[fraseDoAtraso(a), a.pets?.clientes?.nome, "mensalista"].filter(Boolean).join(" · ")}</span>
                    </span>
                    {valorDaTaxa
                      ? <button type="button" className="g-btn verde p" onClick={() => { if (!somenteLeitura()) setTaxa(a); }} aria-label={`Decidir a taxa de busca fora do horário de ${a.pets?.nome ?? "pet"}`}><HandCoins />Taxa de {brl(valorDaTaxa)}</button>
                      : <button type="button" className="g-btn sec p" onClick={() => void semTaxa(a)} aria-label={`Não cobrar a taxa de ${a.pets?.nome ?? "pet"}`}>Não cobrar</button>}
                  </div>
                ))}
                {semCobranca.map((e) => {
                  const n = e.diarias_cobradas ?? 1, total = contaPendente(e);
                  const atraso = atrasoSugerido(e.tipo, e.saida ?? e.entrada, calendario?.atraso);
                  return (
                    <div key={e.id} className="g-linha">
                      <AvatarPet pet={e.pets ?? { nome: "?" }} />
                      <span className="t">
                        <b>{e.pets?.nome ?? "Pet removido"}</b>
                        <span>{[e.pets?.clientes?.nome, `${nomeTipo(e.tipo).toLowerCase()}, ${n} ${n === 1 ? "diária" : "diárias"}`, e.saida ? `saiu ${quando(e.saida)}` : null, atraso ? "saiu fora do horário" : null].filter(Boolean).join(" · ")}</span>
                      </span>
                      <button type="button" className="g-btn verde p" onClick={() => { if (!somenteLeitura()) setCobrando(e); }} aria-label={`Receber a estadia de ${e.pets?.nome ?? "pet"}`}>
                        <HandCoins />{total ? `Receber ${brl(total)}` : "Receber"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="g-ch-faixa">
            {atrasadas.length > 0 && (
              <button type="button" className="g-ch-atraso" onClick={() => setAba("casa")}>
                <AlertTriangle aria-hidden />
                <span><b>Saída atrasada: {atrasadas.length}</b> {atrasadas.slice(0, 3).map((e) => e.pets?.nome).filter(Boolean).join(", ")}{atrasadas.length > 3 ? ` e mais ${atrasadas.length - 3}` : ""}</span>
              </button>
            )}
            {vagasHoje.map((v) => (
              <span key={v.id} className={`g-ch-vagas${v.ocupadas >= v.total! ? " cheia" : ""}`}>
                {v.id === "hotel" ? <Moon aria-hidden /> : <Sun aria-hidden />}
                <span>{v.id === "hotel" ? "Hotel, noite de hoje" : `${v.rotulo} hoje`}: <b className="g-tab">{v.ocupadas} de {v.total} vagas</b>{v.ocupadas >= v.total! ? " · casa cheia" : ""}
                  {v.id === "hotel" && saemHoje.filter((e) => e.tipo === "hotel").length > 0 ? ` (sem contar ${saemHoje.filter((e) => e.tipo === "hotel").length === 1 ? "1 que sai" : `${saemHoje.filter((e) => e.tipo === "hotel").length} que saem`} hoje)` : ""}</span>
              </span>
            ))}
            {chegamAmanha.length > 0 && <button type="button" className="g-btn sec p" style={{ minHeight: 44 }} onClick={() => setAvisando(true)}><MessageCircle />Avisar quem chega amanhã ({chegamAmanha.length})</button>}
            <Link className="g-btn sec p" style={{ minHeight: 44 }} href={`/gestao/app/creche-hotel/folha?dia=${hojeIso}`} target="_blank"><Printer />Folha do dia</Link>
            {crecheNaCasa.length > 0 && (
              <button type="button" className="g-btn sec p g-ch-lote" onClick={() => { if (!somenteLeitura()) setLote(true); }}><Sunset />Encerrar o dia da creche</button>
            )}
          </div>

          <div className="g-fila entre">
            <div className="g-seg ge-abas">
              <button aria-pressed={aba === "casa"} onClick={() => setAba("casa")}>Na casa agora{naCasa.length ? ` (${naCasa.length})` : ""}</button>
              <button aria-pressed={aba === "reservas"} onClick={() => setAba("reservas")}>Reservas{reservas.length ? ` (${reservas.length})` : ""}</button>
              <button aria-pressed={aba === "historico"} onClick={() => setAba("historico")}>Histórico</button>
            </div>
            {usaModulo(petshop, "creche") && usaModulo(petshop, "hotel") && <Chips opcoes={FILTRO_TIPO} valor={tipo} aoMudar={setTipo} />}
          </div>

          {aba === "casa" && (() => {
            const lista = naCasa.filter(doTipo);
            if (!lista.length) return <p className="g-muted g-centro" style={{ padding: "32px 8px" }}>{naCasa.length ? "Ninguém desse tipo na casa agora." : "A casa está vazia agora."}</p>;
            return (
              <div className="g-ch-grade">
                {lista.map((e) => {
                  const pet = e.pets;
                  const entrou = new Date(e.entrada).getTime();
                  const sai = e.saida_prevista ? new Date(e.saida_prevista).getTime() : null;
                  const atrasada = sai != null && sai < agora.getTime();
                  const parte = sai == null ? null : sai <= entrou ? 1 : Math.max(0, Math.min(1, (agora.getTime() - entrou) / (sai - entrou)));
                  const diarias = contarDiarias(e, agora);
                  return (
                    <div key={e.id} className={`g-ch-cartao ${e.tipo === "hotel" ? "hotel" : "creche"}`}>
                      <div className="g-ch-topo">
                        <AvatarPet pet={pet ?? { nome: "?" }} tamanho="g" />
                        <div className="t">
                          <h2>{pet?.nome ?? "Pet removido"}</h2>
                          <span>{pet?.clientes?.nome ?? "Sem tutor"}</span>
                        </div>
                        <EtiquetaTipo tipo={e.tipo} />
                      </div>

                      <div className={`g-ch-periodo${atrasada ? " atrasada" : ""}${parte == null ? " aberta" : ""}`}>
                        <div className="g-fila entre g-pp">
                          <span className="g-muted">{diarias === 1 ? "1ª diária" : `${diarias}ª diária`}</span>
                          {atrasada ? <span className="g-tag vermelho">saída atrasada</span> : parte != null && <span className="g-muted g-tab">{Math.round(parte * 100)}% do período</span>}
                        </div>
                        <div className="g-ch-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={parte == null ? undefined : Math.round(parte * 100)} aria-label="Quanto do período já passou">
                          <i style={{ width: `${parte == null ? 100 : Math.max(4, parte * 100)}%` }} />
                        </div>
                        <div className="pontas">
                          <span><small>desde</small><b>{quando(e.entrada)}</b></span>
                          <span className={atrasada ? "g-vermelho-t" : undefined}><small>{e.saida_prevista ? "saída prevista" : "saída"}</small><b>{e.saida_prevista ? quando(e.saida_prevista) : "sem saída prevista"}</b></span>
                        </div>
                      </div>

                      <LinhaValor e={e} plano={planoDe(e)} abertas={doTutor} valores={valoresDe(e)} />
                      {pet?.alertas && <div className="g-aviso vermelho" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>Atenção:</b> {pet.alertas}</span></div>}
                      {quarto(e)}
                      {e.obs && <p className="g-ch-obs"><NotebookPen aria-hidden /><span>{e.obs}</span></p>}
                      <AceiteDoLink estadiaId={e.id} />
                      {comCuidados && <CuidadosDoDia estadia={e} feitos={dados.feitos} aoMudar={() => void recarregar()} />}
                      {comOcorrencias && <OcorrenciasDoCartao lista={dados.ocorrencias.filter((o) => o.estadia_id === e.id)} />}
                      <div className="g-fila g-ch-acoes">
                        {botaoMensagens(e)}
                        {!e.mensalista && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setEditando(e); }}><Pencil /> Editar</button>}
                        {comOcorrencias && pet && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setOcorrenciaDe(e); }}><ShieldAlert /> Ocorrência</button>}
                        {comPortaria && pet && <button className="g-btn fantasma p" onClick={() => setAutorizadosDe(e)}><ShieldCheck /> Quem busca</button>}
                        {e.mensalista
                          ? <button className="g-btn verde p" style={{ marginLeft: "auto" }} disabled={ocupado === e.id} onClick={() => sair(e)}><LogOut /> Saiu</button>
                          : <button className="g-btn verde p" style={{ marginLeft: "auto" }} onClick={() => sair(e)}><LogOut /> Check-out</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {aba === "reservas" && (() => {
            const fimDoMes = isoDia(new Date(agora.getFullYear(), agora.getMonth() + 1, 0));
            const [pDe, pAte] = periodo === "7" ? [hojeIso, isoDia(somaDias(agora, 7))] : periodo === "mes" ? [hojeIso.slice(0, 8) + "01", fimDoMes] : periodo === "outro" ? [de, ate] : ["", "9999-12-31"];
            const lista = reservas.filter(doTipo).filter((e) => { const d = isoDia(new Date(e.entrada)); return d >= pDe && d <= pAte; });
            return (
              <>
                {reservas.length > 0 && (
                  <div className="g-ht-filtro" role="group" aria-label="Período das reservas">
                    <Chips opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} />
                    {periodo === "outro" && <>
                      <input type="date" className="g-input" value={de} aria-label="Chegada de" onChange={(ev) => setDe(ev.target.value)} />
                      <span className="g-muted">a</span>
                      <input type="date" className="g-input" value={ate} min={de} aria-label="Chegada até" onChange={(ev) => setAte(ev.target.value)} />
                    </>}
                  </div>
                )}
                {!lista.length ? <p className="g-muted g-centro" style={{ padding: "32px 8px" }}>{reservas.length ? "Nenhuma reserva nesse período." : "Nenhuma reserva marcada."}</p> : (
              <div className="g-ch-grade">
                {lista.map((e) => {
                  const pet = e.pets;
                  const dias = Math.round((inicioDoDia(new Date(e.entrada)).getTime() - hoje0) / 864e5);
                  const passou = dias < 0;
                  const v = valoresDe(e);
                  return (
                    <div key={e.id} className={`g-ch-cartao reserva ${e.tipo === "hotel" ? "hotel" : "creche"}`}>
                      <div className="g-ch-topo">
                        <AvatarPet pet={pet ?? { nome: "?" }} tamanho="g" />
                        <div className="t">
                          <h2>{pet?.nome ?? "Pet removido"}</h2>
                          <span>{pet?.clientes?.nome ?? "Sem tutor"}</span>
                        </div>
                        <EtiquetaTipo tipo={e.tipo} />
                      </div>

                      <div className="g-ch-rota">
                        <span><small>chega</small><b>{quando(e.entrada)}</b></span>
                        {e.saida_prevista && <><ArrowRight aria-hidden /><span><small>sai</small><b>{quando(e.saida_prevista)}</b></span></>}
                        {passou ? <span className="g-tag amarelo">não veio</span>
                          : <span className={`g-tag ${dias === 0 ? "verde" : "azul"}`}>{dias === 0 ? "chega hoje" : dias === 1 ? "chega amanhã" : `em ${dias} dias`}</span>}
                      </div>

                      <LinhaValor e={e} abertas={doTutor} valores={v} />
                      {pet?.alertas && <p className="g-p g-vermelho-t"><b>Atenção:</b> {pet.alertas}</p>}
                      {quarto(e)}
                      {e.obs && <p className="g-ch-obs"><NotebookPen aria-hidden /><span>{e.obs}</span></p>}
                      <AceiteDoLink estadiaId={e.id} />
                      {comCuidados && lerCuidados(e).length > 0 && <p className="g-ch-obs"><NotebookPen aria-hidden /><span>{lerCuidados(e).map(textoDoCuidado).join(" · ")}</span></p>}
                      <div className="g-fila g-ch-acoes">
                        <button className="g-btn verde p" disabled={ocupado === e.id} onClick={() => checkIn(e)}><LogIn /> Check-in</button>
                        {!e.mensalista && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setEditando(e); }}><Pencil /> Editar</button>}
                        {vejoFinanceiro && v?.sinal_estado === "a_receber" && <button className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setSinalDe(e); }}><HandCoins /> Receber o sinal</button>}
                        {vejoFinanceiro && !e.sinal_estado && !e.mensalista && aceitaSinal(petshop, e.tipo) && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setSinalDe(e); }}><HandCoins /> Sinal</button>}
                        <button className="g-btn fantasma p" onClick={() => cancelar(e)}>Cancelar</button>
                        <span style={{ marginLeft: "auto" }}>{botaoMensagens(e)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
                )}
              </>
            );
          })()}

          {aba === "historico" && (() => {
            const lista = historico.filter(doTipo);
            if (!lista.length) return <p className="g-muted g-centro" style={{ padding: "32px 8px" }}>Nenhuma estadia encerrada ainda.</p>;
            return (
              <div className="g-card">
                <div className="g-lista">
                  {lista.map((e) => {
                    const fim = e.saida ?? e.saida_prevista;
                    const periodoDaLinha = fim && !dataCurta(fim).startsWith(dataCurta(e.entrada)) ? `${dataCurta(e.entrada)} a ${dataCurta(fim)}` : dataCurta(e.entrada);
                    return (
                      <div key={e.id} className="g-linha" role="button" tabIndex={0} style={{ cursor: "pointer" }} aria-label={`Ver a estadia de ${e.pets?.nome ?? "pet"}`}
                        onClick={() => setDetalhe(e)} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); setDetalhe(e); } }}>
                        <AvatarPet pet={e.pets ?? { nome: "?" }} />
                        <span className="t">
                          <b>{e.pets?.nome ?? "Pet removido"}</b>
                          <span>{[periodoDaLinha, e.pets?.clientes?.nome, dados.retiradas.get(e.id) ? `saiu ${textoDaRetirada(dados.retiradas.get(e.id)!)}` : null].filter(Boolean).join(" · ")}</span>
                        </span>
                        <EtiquetaTipo tipo={e.tipo} curta />
                        {e.status === "cancelada"
                          ? <span className="g-tag vermelho">cancelada</span>
                          : <Cobrado e={e} />}
                        {vejoFinanceiro && e.status === "encerrada" && !e.mensalista && (
                          <button className={`g-btn p ${estadiaSemCobranca(e) ? "sec" : "fantasma"}`} onClick={(ev) => { ev.stopPropagation(); if (somenteLeitura()) return; if (estadiaSemCobranca(e)) setCobrando(e); else setAcertando(e); }}
                            aria-label={`${estadiaSemCobranca(e) ? "Receber" : "Corrigir"} a estadia de ${e.pets?.nome ?? "pet"}`}>{estadiaSemCobranca(e) ? <><HandCoins />Receber</> : <Pencil />}</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {ver === "casa" && dados && !tudoVazio && souDono && <div style={{ marginTop: 20 }}><LinkCrecheHotel titulo="Pedidos pelo link do cliente" /></div>}
      {(ver === "casa" || ver === "ocupacao") && dados && souDono && <p style={{ marginTop: 16 }}><Link className="g-btn fantasma p" href="/gestao/app/meu-petshop#opcoes-hotel"><Settings2 />Opções do hotel e da creche</Link></p>}
      {acertando && <AcertarEstadia key={acertando.id} estadia={acertando} aoFechar={() => setAcertando(null)} aoGravar={() => { setAcertando(null); mudou(); }} />}
      {nova && <NovaEstadia mens={mens ?? null} petInicial={nova.pet ?? undefined} aoEspera={comEspera ? (x) => { setNova(null); setEsperaNova(x); } : undefined} jaAquiInicial={aba !== "reservas"} tipoInicial={nova.tipo ?? (tipo !== "todos" ? tipo : principalDe(petshop) === "hotel" ? "hotel" : "creche")} diaInicial={nova.dia} saidaInicial={nova.saida} abertas={abertas} doTutor={doTutor}
        aoFechar={() => setNova(null)} aoGravar={(emCasa) => {
          // a reserva veio da lista de espera: o pedido sai da fila
          const daEspera = nova.espera;
          if (daEspera) void sb.from("lista_espera").update({ status: "atendido" }).eq("id", daEspera).eq("petshop_id", petshop.id).select("id").then(() => espera.recarregar());
          setNova(null); setVer((v) => (v === "ocupacao" ? v : "casa")); setAba(emCasa ? "casa" : "reservas"); mudou();
        }} />}
      {editando && <NovaEstadia mens={mens ?? null} key={editando.id} editar={editando} valores={valoresDe(editando)} jaAquiInicial={editando.status === "em_casa"} tipoInicial={editando.tipo === "hotel" ? "hotel" : "creche"} abertas={abertas} doTutor={doTutor}
        aoFechar={() => setEditando(null)} aoGravar={() => { setEditando(null); mudou(); }} />}
      {lote && <EncerrarCreche estadias={crecheNaCasa} valores={dados?.valores ?? new Map()} aoFechar={() => setLote(false)} aoGravar={() => { setLote(false); mudou(); }}
        aoCheckOut={(e) => { setLote(false); setSaindo(e); }} />}
      {saindo && <CheckOut key={saindo.id} estadia={saindo} aoFechar={() => setSaindo(null)} aoGravar={() => { setSaindo(null); mudou(); }} />}
      {taxa && valorDaTaxa && <FolhaTaxaDeAtraso key={taxa.estadia_id} atraso={taxa} valor={valorDaTaxa} aoFechar={() => { setTaxa(null); mudou(); }} aoDecidir={() => { setTaxa(null); mudou(); }} />}
      {cobrando && <CheckOut key={cobrando.id} pendente estadia={cobrando} aoFechar={() => setCobrando(null)} aoGravar={() => { setCobrando(null); mudou(); }} />}
      {mensagens && <MensagensDaEstadia estadia={mensagens} aoFechar={() => setMensagens(null)} aoMudar={() => void recarregar()}
        sinal={(() => { const v = valoresDe(mensagens); return v?.sinal != null && (v.sinal_estado === "a_receber" || v.sinal_estado === "pago") ? { valor: Number(v.sinal), pago: v.sinal_estado === "pago", recebido: v.sinal_estado === "a_receber" ? Math.max(0, centavos(Number(v.sinal) - faltaDoSinal(v))) : 0 } : null; })()}
        fatos={comCuidados ? fatosDoDia(lerCuidados(mensagens), dados?.feitos.filter((f) => f.estadia_id === mensagens.id) ?? [], hojeIso) : undefined} />}
      {sinalDe && <FolhaSinal estadia={sinalDe} valores={valoresDe(sinalDe)} sugerido={sugeridoPara(sinalDe)} totalPrevisto={previstoDe(sinalDe)} aoFechar={() => setSinalDe(null)} aoGravar={() => { setSinalDe(null); mudou(); }} />}
      {cancelando && valoresDe(cancelando) && <CancelarComSinal estadia={cancelando} valores={valoresDe(cancelando)!} aoFechar={() => setCancelando(null)} aoGravar={() => { setCancelando(null); mudou(); }} />}
      {detalhe && <DetalheDaEstadia estadia={detalhe} aoFechar={() => setDetalhe(null)}
        aoCorrigir={vejoFinanceiro && detalhe.status === "encerrada" && !detalhe.mensalista ? () => { const e = detalhe; setDetalhe(null); if (!somenteLeitura()) setAcertando(e); } : undefined} />}
      {chegando && (
        <Folha titulo={`Quando ${chegando.pets?.nome ?? "o pet"} chegou?`} aoFechar={() => setChegando(null)}
          rodape={<>
            <button type="button" className="g-btn sec" onClick={() => { const e = chegando; setChegando(null); void checkIn(e, "agora"); }}>Chegou agora</button>
            <button type="button" className="g-btn pri" onClick={() => { const e = chegando; setChegando(null); void checkIn(e, "reservado"); }}>Chegou em {dataCurta(chegando.entrada)}</button>
          </>}>
          <div className="g-pilha">
            <p>A reserva era para <b>{dataCompleta(chegando.entrada)}, {horaCurta(chegando.entrada)}</b>{chegando.saida_prevista ? <>, com saída em <b>{dataCompleta(chegando.saida_prevista)}</b></> : null}, e esse dia já passou.</p>
            <p className="g-muted g-p">
              Se o pet veio no dia reservado e só faltou anotar, toque em <b>Chegou em {dataCurta(chegando.entrada)}</b>: a estadia fica com as datas da reserva e {chegando.tipo === "hotel" ? "cada noite é cobrada no dia certo" : "os dias contam desde lá"}.
              Se ele está chegando só agora, toque em <b>Chegou agora</b>: a estadia começa neste momento.
            </p>
            <p className="g-muted g-p">Chegou em outro dia? Escolha uma das duas e depois acerte a entrada em Editar, no cartão do hóspede.</p>
          </div>
        </Folha>
      )}
      {buscando && <QuemBuscou key={buscando.id} estadia={buscando} aoFechar={() => setBuscando(null)}
        aoSeguir={async () => { const e = buscando; setBuscando(null); if (e.mensalista) await saidaDoMensalista(e); else setSaindo(e); }} />}
      {ocorrenciaDe && <FolhaOcorrencia estadia={ocorrenciaDe} aoFechar={() => setOcorrenciaDe(null)} aoGravar={() => { setOcorrenciaDe(null); void recarregar(); }} />}
      {autorizadosDe?.pets && <FolhaQuemPodeBuscar pet={autorizadosDe.pets} aoFechar={() => setAutorizadosDe(null)} />}
      {esperaNova && <FolhaEspera inicial={esperaNova} aoFechar={() => setEsperaNova(null)} aoGravar={() => { setEsperaNova(null); void espera.recarregar(); verEspera(); }} />}
      {avisando && <AvisarChegadas reservas={reservas} aoFechar={() => setAvisando(false)} aoMudar={() => void recarregar()} />}
    </>
  );
}

/* ---------- nova reserva, check-in ou edição ---------- */

const horaDe = (d: string | Date) => { const x = new Date(d); return `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`; };

function NovaEstadia({ jaAquiInicial, tipoInicial, diaInicial, saidaInicial, abertas, doTutor, editar, valores, mens, petInicial, aoEspera, aoFechar, aoGravar }: {
  jaAquiInicial: boolean; tipoInicial: Tipo; diaInicial?: string; abertas: EstadiaCompleta[]; editar?: EstadiaCompleta; valores?: ValoresDaEstadia | null; mens: Mens | null;
  /** dia da saída já escolhido (reserva que vem da lista de espera) */
  saidaInicial?: string;
  /** as estadias abertas e as encerradas de hotel, para o desconto do segundo pet */
  doTutor: EstadiaCompleta[];
  /** pet já escolhido (reserva que vem da lista de espera) */
  petInicial?: PetDaEstadia;
  /** com a lista de espera ligada: em dia cheio, a pessoa pode pôr o pet na lista em vez de passar do limite */
  aoEspera?: (x: { pet: PetDaEstadia; tipo: Tipo; entrada: string; saida?: string }) => void;
  aoFechar: () => void; aoGravar: (emCasa: boolean) => void;
}) {
  const { sb, petshop, vejoFinanceiro, souDono } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  // só os tipos que o pet shop usa (na edição, o tipo da estadia aparece mesmo que tenha sido desligado depois)
  const tiposDaCasa = TIPOS.filter((t) => usaModulo(petshop, t.id) || editar?.tipo === t.id);
  const tipo0: Tipo = tiposDaCasa.some((t) => t.id === tipoInicial) ? tipoInicial : tiposDaCasa[0]?.id ?? tipoInicial;
  const hojeIso = isoDia(new Date());
  // hotel reserva para outro dia; creche recebe na hora. Sem área principal, vale a aba em que a pessoa estava.
  const principal = principalDe(petshop);
  const jaAqui0 = diaInicial ? false
    : principal === "hotel" ? false : principal === "creche" ? true : tiposDaCasa.length === 1 && tiposDaCasa[0].id === "hotel" ? false : jaAquiInicial;
  const [pet, setPet] = useState<PetDaEstadia | null>(editar?.pets ?? petInicial ?? null);
  const [criando, setCriando] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>(tipo0);
  const [jaAqui, setJaAqui] = useState(jaAqui0);
  const [dia, setDia] = useState(editar ? isoDia(new Date(editar.entrada)) : diaInicial ?? hojeIso);
  const [hhmm, setHhmm] = useState(editar ? horaDe(editar.entrada) : "08:00");
  const [saidaDia, setSaidaDia] = useState(editar?.saida_prevista ? isoDia(new Date(editar.saida_prevista)) : saidaInicial && saidaInicial >= (diaInicial ?? "") ? saidaInicial : "");
  const [saidaHora, setSaidaHora] = useState(editar?.saida_prevista ? horaDe(editar.saida_prevista) : "18:00");
  // a diária sugerida é sempre o preço de Meu pet shop (ou o do porte, se a opção estiver ligada), nunca a última digitada
  const [diaria, setDiaria] = useState<number | null>(editar ? (editar.valor_diaria == null ? null : Number(editar.valor_diaria)) : diariaSugerida(petshop, tipo0, petInicial?.porte ?? null));
  // na edição, a diária combinada fica como está até a pessoa trocar o tipo: aí vale o preço fixo do tipo novo
  const [mexeuNaDiaria, setMexeuNaDiaria] = useState(Boolean(editar));
  const [obs, setObs] = useState(editar?.obs ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // opções do hotel e da creche (todas desligadas = nada disto aparece)
  const opTaxas = taxasDe(petshop), opQuartos = acomodacoesDe(petshop), opPorte = porteDe(petshop), comCuidados = cuidadosLigados(petshop);
  const [taxasMarcadas, setTaxasMarcadas] = useState<string[]>(() => taxasGuardadas(valores).map((t) => t.id));
  const [quartoId, setQuartoId] = useState(editar?.acomodacao ?? "");
  const [cuidados, setCuidados] = useState<Cuidado[]>(() => lerCuidados(editar));
  const [sinal, setSinal] = useState<EstadoSinal>(() => sinalInicial(null));
  const [mexeuNoSinal, setMexeuNoSinal] = useState(false);
  const [erroSinal, setErroSinal] = useState<string | null>(null);

  const emCasa = editar ? editar.status === "em_casa" : jaAqui;
  // na edição a entrada sempre aparece; no check-in novo a entrada é agora
  const escolheEntrada = editar ? true : !jaAqui;
  const fixa = diariaSugerida(petshop, tipo, pet?.porte);
  const doPorte = tipo === "hotel" && opPorte.ativo && fixa != null && fixa !== diariaFixa(petshop, tipo);
  const { dados: vencidas } = useDados(async () => (pet ? vacinasVencidas(sb, petshop.id, pet.id).catch(() => []) : []), [petshop.id, pet?.id]);

  function escolherPet(p: PetDaEstadia) {
    setPet(p);
    if (!mexeuNaDiaria) setDiaria(diariaSugerida(petshop, tipo, p.porte));
  }
  function trocarTipo(t: Tipo) {
    if (t === tipo) return;
    setTipo(t);
    // trocou o tipo: a diária passa a ser o preço fixo do tipo novo, a não ser que a pessoa digite outro valor depois da troca
    if (!mexeuNaDiaria || editar) { setDiaria(diariaSugerida(petshop, t, pet?.porte)); setMexeuNaDiaria(false); }
  }

  // o que está no formulário agora (muda na hora quando troca o tipo, as datas ou a diária)
  const entradaForm = escolheEntrada ? (dia && hhmm ? juntaDiaHora(dia, hhmm) : null) : new Date();
  const saidaForm = saidaDia ? juntaDiaHora(saidaDia, saidaHora || "18:00") : null;
  const datasBoas = Boolean(entradaForm && !Number.isNaN(entradaForm.getTime()) && (!saidaForm || (!Number.isNaN(saidaForm.getTime()) && saidaForm > entradaForm)));
  const periodoForm: Periodo | null = datasBoas ? { tipo, entrada: entradaForm!.toISOString(), saida_prevista: saidaForm?.toISOString() ?? null, status: emCasa ? "em_casa" : "reservada" } : null;
  const taxasDaReserva = opTaxas.ativo ? opTaxas.lista.filter((t) => taxasMarcadas.includes(t.id)) : taxasGuardadas(valores).filter((t) => taxasMarcadas.includes(t.id));
  const prev = pet && periodoForm && diaria != null
    ? previsto(petshop, { id: editar?.id ?? null, pet_id: pet.id, tipo, entrada: periodoForm.entrada, saida_prevista: periodoForm.saida_prevista, valor_diaria: diaria, criado_em: editar?.criado_em },
      doMesmoTutor(doTutor, pet.clientes?.id), { taxas: taxasDaReserva as never }) : null;
  const trocouTipo = Boolean(editar) && tipo !== editar!.tipo;

  // vagas nas datas escolhidas, pela mesma conta do aviso de casa cheia
  const vagas = vagasDoTipo(petshop, tipo);
  const diasDoPeriodo = periodoForm ? diasOcupados(periodoForm, new Date()) : [];
  const maisCheio = vagas != null && diasDoPeriodo.length
    ? diasDoPeriodo.map((d) => ({ d, n: ocupadasNoDia(tipo, abertas, editar?.id ?? null, d, new Date(), mens, petshop.horario) })).reduce((m, x) => (x.n > m.n ? x : m)) : null;
  /** Quantos hóspedes a acomodação tem no dia mais cheio do período (sem contar esta estadia). */
  const noQuarto = (id: string) => Math.max(0, ...diasDoPeriodo.map((d) => abertas.filter((e) => e.id !== editar?.id && e.acomodacao === id && ocupaNoDia(e, d, hojeIso)).length));

  // mensalista da creche: reserva num dia fora do plano é dia extra (vai para a próxima mensalidade, nunca vira diária avulsa);
  // num dia que já é do plano, não há o que reservar
  const planoDoPet = !editar && tipo === "creche" && pet && dia ? mens?.planos.find((p) => p.pet_id === pet.id && planoVale(p, jaAqui ? hojeIso : dia)) : undefined;
  const umDiaSo = !saidaDia || saidaDia === dia;
  const diaDoPlano = Boolean(planoDoPet && !jaAqui && umDiaSo && esperadoNoDia(planoDoPet, dia, petshop.horario));
  const reservaExtra = Boolean(planoDoPet && !jaAqui && umDiaSo && dia >= hojeIso && !diaDoPlano);
  const valorDoExtra = planoDoPet ? planoDoPet.valor_extra ?? (petshop.diaria_creche == null ? null : Number(petshop.diaria_creche)) : null;

  // sinal: só em reserva nova, para quem recebe. O valor acompanha a regra até a pessoa mexer.
  const ofereceSinal = !editar && !jaAqui && vejoFinanceiro && aceitaSinal(petshop, tipo) && !reservaExtra;
  const sugerido = ofereceSinal ? sinalSugerido(petshop, prev && !prev.aberto ? prev.total : null) : null;
  useEffect(() => {
    if (!ofereceSinal || mexeuNoSinal) return;
    setSinal((s) => ({ ...sinalInicial(sugerido, entradaForm ?? undefined), pagamento: s.pagamento }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofereceSinal, sugerido, mexeuNoSinal, dia]);

  async function salvar() {
    if (!pet || salvando) return;
    setErro(null); setErroSinal(null);
    const falha = (m: string) => { setErro(m); avisarErro(m); };
    const agora = new Date();
    const entrada = escolheEntrada ? (dia && hhmm ? juntaDiaHora(dia, hhmm) : null) : agora;
    if (!entrada || Number.isNaN(entrada.getTime())) return falha("Escolha o dia e a hora da entrada.");
    if (diaDoPlano) return falha(`${pet.nome} já vem nesse dia pelo plano: não precisa reservar. No dia, marque a chegada na Chamada.`);
    if (emCasa && entrada.getTime() > agora.getTime() + 60000) return falha("O pet já está na casa: a entrada não pode ser no futuro.");
    const saida = saidaDia ? juntaDiaHora(saidaDia, saidaHora || "18:00") : null;
    if (saida && (Number.isNaN(saida.getTime()) || saida <= entrada)) return falha("A saída prevista precisa ser depois da entrada.");
    if (diaria != null && diaria < 0) return falha("A diária não pode ser negativa.");
    if (diaria != null && diaria > 99999) return falha("Confira o valor da diária.");
    const sinalPronto = ofereceSinal ? prepararSinal(sinal) : { modo: "sem" as const };
    if ("erro" in sinalPronto) { setErroSinal(sinalPronto.erro); avisarErro(sinalPronto.erro); return; }
    if (sinalPronto.modo === "depois" && !pet.clientes?.id) { setErroSinal("Este pet está sem tutor na ficha. Coloque o tutor, ou escolha outra forma para o sinal."); return; }

    if (!editar && emCasa && tipo === "creche" && petshop.creche_bloqueia_vacina && vencidas?.length && !souDono) {
      return falha(`Check-in bloqueado: ${pet.nome} está com vacina vencida. Só o dono pode liberar a entrada.`);
    }
    const status = emCasa ? "em_casa" : "reservada";
    const novo: Periodo = { tipo, entrada: entrada.toISOString(), saida_prevista: saida?.toISOString() ?? null, status };
    // o mesmo pet não fica duas vezes na casa nem com duas reservas no mesmo período (sem opção de forçar)
    const bate = conflitoDoPet(pet.id, novo, abertas, editar?.id ?? null, agora);
    if (bate) {
      return falha(!editar && jaAqui && bate.status === "reservada" && isoDia(new Date(bate.entrada)) === isoDia(agora)
        ? `${pet.nome} tem reserva para hoje. Faça o check-in pela reserva, na aba Reservas.` : fraseConflito(pet.nome, bate));
    }
    // reserva com a data que já passou
    if (!emCasa && isoDia(entrada) < isoDia(agora) && !(await confirmar({
      titulo: "Essa data já passou",
      texto: `A entrada está em ${dataCompleta(entrada)}, antes de hoje. Se o pet já veio, volte e escolha "Chegou agora". Marcar a reserva nessa data mesmo assim?`,
      confirmar: "Marcar mesmo assim",
    }))) return;
    // casa cheia em algum dia do período
    if (vagas != null) {
      const tomadas = new Map(diasOcupados(novo, agora).map((d) => [d, ocupadasNoDia(tipo, abertas, editar?.id ?? null, d, agora, mens, petshop.horario)]));
      const cheios = [...tomadas.keys()].filter((d) => (tomadas.get(d) ?? 0) >= vagas);
      if (cheios.length && !(await confirmar({
        titulo: `Casa cheia em ${dataCurta(cheios[0])} (${Math.max(vagas, tomadas.get(cheios[0]) ?? 0)} de ${vagas})`,
        texto: `${cheios.length === 1 ? `Em ${dataCurta(cheios[0])}` : !saida && cheios.length > 6 ? `De ${dataCurta(cheios[0])} em diante, sem data para acabar,` : `Em ${cheios.length} dias (${cheios.slice(0, 6).map((d) => dataCurta(d)).join(", ")}${cheios.length > 6 ? "…" : ""})`} ${tipo === "hotel" ? "o hotel" : "a creche"} já está com todas as ${vagas} vagas tomadas. ${editar ? "Salvar" : emCasa ? "Fazer o check-in" : "Marcar a reserva"} passando do limite?`,
        confirmar: "Passar do limite", perigo: true,
      }))) return;
    }
    // acomodação já com a lotação dela nessas datas: avisa, e a pessoa decide
    const quarto = opQuartos.ativo && tipo === "hotel" ? opQuartos.lista.find((a) => a.id === quartoId) : undefined;
    if (quarto && (!editar || quartoId !== (editar.acomodacao ?? ""))) {
      const la = noQuarto(quarto.id);
      if (la >= quarto.vagas && !(await confirmar({
        titulo: `${quarto.nome} já está com ${la} de ${quarto.vagas} nessas datas`,
        texto: `Colocar ${pet.nome} em ${quarto.nome} mesmo assim?`, confirmar: "Colocar mesmo assim",
      }))) return;
    }
    if (vejoFinanceiro && diaria === 0 && !reservaExtra && !(await confirmar({ titulo: "Cortesia, sem cobrar?", texto: `A diária está em R$ 0,00. ${pet.nome} fica sem cobrança nesta estadia.`, confirmar: "Sim, é cortesia" }))) return;
    // sinal maior do que a reserva inteira costuma ser erro de digitação (1080 no lugar de 108)
    if (sinalPronto.modo !== "sem" && prev && !prev.aberto && prev.total > 0 && sinalPronto.valor > prev.total && !(await confirmar({
      titulo: "O sinal é maior do que a reserva",
      texto: `O sinal está em ${brl(sinalPronto.valor)} e o total previsto da reserva é ${brl(prev.total)}. Confira se não sobrou um número a mais.`,
      confirmar: "Está certo, continuar",
    }))) return;
    if (!(await conferirSinal(sb, petshop.id, sinalPronto, confirmar))) return;

    setSalvando(true);
    try {
      if (reservaExtra && planoDoPet) {
        ok(await sb.rpc("creche_reservar_extra", { p_plano: planoDoPet.id, p_dia: dia, p_obs: obs.trim() || undefined }));
        avisar(`Dia extra de ${pet.nome} reservado para ${dataAmigavel(deIsoDia(dia))}. Quando ele vier, o dia entra na próxima mensalidade.`);
        aoGravar(false);
        return;
      }
      const campos = {
        tipo, entrada: entrada.toISOString(), saida_prevista: saida?.toISOString() ?? null, obs: obs.trim() || null,
        // quem não recebe não vê nem manda a diária: o banco coloca a sugerida (a do porte, ou a de Meu pet shop)
        ...(vejoFinanceiro ? { valor_diaria: diaria } : {}),
        ...(opQuartos.ativo || editar?.acomodacao ? { acomodacao: tipo === "hotel" && quarto ? quarto.id : null } : {}),
        ...(comCuidados || editar?.cuidados ? { cuidados: cuidadosParaGravar(cuidados) as never } : {}),
      };
      let id = editar?.id ?? null;
      if (editar) {
        const r = ok(await sb.from("estadias").update(campos).eq("id", editar.id).eq("petshop_id", petshop.id).eq("status", editar.status).select("id"));
        if (!r.length) avisar("Essa estadia já tinha sido alterada. Atualizei a lista."); else avisar("Alteração salva.");
      } else {
        id = ok(await sb.from("estadias").insert({ ...campos, petshop_id: petshop.id, pet_id: pet.id, status }).select("id").single()).id;
        avisar(emCasa ? `${pet.nome} está na casa.` : `Reserva de ${pet.nome} marcada para ${dataAmigavel(entrada)}.`);
      }
      // as taxas combinadas e o sinal ficam à parte, só para quem recebe
      if (id && vejoFinanceiro && (taxasDaReserva.length || taxasGuardadas(valores).length)) {
        const g = await sb.from("estadias_valores").upsert({ estadia_id: id, petshop_id: petshop.id, taxas: taxasDaReserva as never }, { onConflict: "estadia_id" }).select("estadia_id");
        if (g.error) avisarErro(`A reserva foi salva, mas as taxas marcadas não. Marque de novo em Editar. (${g.error.message})`);
      }
      if (id && sinalPronto.modo !== "sem") {
        try {
          await lancarSinal(sb, petshop.id, { id, tipo, entrada: entrada.toISOString(), pet: pet.nome, clienteId: pet.clientes?.id ?? null }, sinalPronto);
          avisar(sinalPronto.modo === "agora" ? `Sinal de ${brl(sinalPronto.valor)} recebido.` : `Sinal de ${brl(sinalPronto.valor)} em A receber, para ${dataCurta(sinalPronto.quando)}.`);
        } catch (e) {
          avisarErro(`A reserva foi marcada, mas o sinal não foi anotado. Toque em Sinal no cartão da reserva. (${e instanceof Error ? e.message : "erro"})`);
        }
      }
      aoGravar(emCasa);
    } catch (e) {
      if (ehRepetido(e)) {
        // outra pessoa fez o check-in deste pet no meio do caminho
        const { data: la } = await sb.from("estadias").select("entrada").eq("petshop_id", petshop.id).eq("pet_id", pet.id).eq("status", "em_casa").maybeSingle();
        falha(`${pet.nome} já está na casa${la ? ` desde ${quando(la.entrada)}` : ""}.`);
      } else avisarErro(e);
    } finally { setSalvando(false); }
  }

  if (criando !== null) {
    return <FormPet nomeInicial={criando} aoFechar={() => setCriando(null)} aoSalvar={(p) => { escolherPet(p); setCriando(null); avisarMudanca(); }} />;
  }
  if (!pet) {
    return (
      <Folha titulo="Qual pet vem?" aoFechar={aoFechar}>
        <EscolherPet aoEscolher={escolherPet} aoCriar={setCriando} autoFocus />
      </Folha>
    );
  }

  const jaNaCasa = !editar ? abertas.find((e) => e.pet_id === pet.id && e.status === "em_casa") : undefined;
  // dia que o dono marcou como fechado: a creche avisa por todos os dias do período; o hotel, pela chegada e pela saída
  const diaDaEntrada = entradaForm && !Number.isNaN(entradaForm.getTime()) ? isoDia(entradaForm) : null;
  const diaDaSaida = saidaForm && !Number.isNaN(saidaForm.getTime()) ? isoDia(saidaForm) : null;
  const diasFechados = (tipo === "creche" ? (diasDoPeriodo.length ? diasDoPeriodo : diaDaEntrada ? [diaDaEntrada] : []) : [diaDaEntrada, diaDaSaida].filter((d): d is string => Boolean(d)))
    .filter((d, i, l) => diaFechado(d) && l.indexOf(d) === i);
  const nivel = maisCheio && vagas != null ? nivelDeOcupacao(maisCheio.n, vagas) : null;

  return (
    <Folha titulo={editar ? (emCasa ? "Editar estadia" : "Editar reserva") : jaAqui ? "Check-in" : "Nova reserva"} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : editar ? "Salvar" : jaAqui ? "Fazer check-in" : "Marcar reserva"}</button>
      </>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={pet} />
          <div className="g-cresce"><b style={{ display: "block" }}>{pet.nome}</b><span className="g-muted g-p">{pet.clientes?.nome ?? "Sem tutor"}</span></div>
          {!editar && <button type="button" className="g-btn fantasma p" onClick={() => { setPet(null); setErro(null); }}>Trocar</button>}
        </div>
        {jaNaCasa && <div className="g-aviso vermelho" role="alert" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>{fraseConflito(pet.nome, jaNaCasa)}</b> Não dá para fazer outro check-in; uma reserva para depois, sim.</span></div>}
        {Boolean(vencidas?.length) && (
          <div className="g-aviso vermelho g-ch-vacina" role="alert" style={{ marginBottom: 0 }}>
            <Syringe /><span className="g-cresce"><b>Vacina vencida:</b> {vencidas!.join(", ")}. Confira a carteirinha antes de {emCasa ? "receber" : "confirmar a reserva"}.</span>
          </div>
        )}
        {pet.alertas && <div className="g-aviso vermelho" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>Atenção:</b> {pet.alertas}</span></div>}

        {tiposDaCasa.length > 1 && (
          <div className="g-campo">
            <span>Tipo</span>
            <Chips opcoes={tiposDaCasa} valor={tipo} aoMudar={trocarTipo} />
          </div>
        )}
        {!editar && (
          <div className="g-seg g-ht-seg" role="group" aria-label="Quando o pet vem">
            <button type="button" aria-pressed={!jaAqui} onClick={() => setJaAqui(false)}>Reservar para outro dia</button>
            <button type="button" aria-pressed={jaAqui} onClick={() => setJaAqui(true)}>Chegou agora</button>
          </div>
        )}
        {escolheEntrada && (
          <div className="dupla">
            <Campo rotulo={emCasa ? "Entrou em" : "Entrada"}><input type="date" className="g-input" value={dia} max={emCasa ? isoDia(new Date()) : undefined} onChange={(e) => setDia(e.target.value)} /></Campo>
            <Campo rotulo="Hora"><input type="time" className="g-input" value={hhmm} onChange={(e) => setHhmm(e.target.value)} /></Campo>
          </div>
        )}
        <div className="dupla">
          <Campo rotulo="Saída prevista" dica="Opcional"><input type="date" className="g-input" value={saidaDia} min={escolheEntrada ? dia : isoDia(new Date())} onChange={(e) => setSaidaDia(e.target.value)} /></Campo>
          <Campo rotulo="Hora"><input type="time" className="g-input" value={saidaHora} onChange={(e) => setSaidaHora(e.target.value)} disabled={!saidaDia} /></Campo>
        </div>
        {diasFechados.length > 0 && (
          <p className="g-ht-fechado" role="status">
            <CalendarOff aria-hidden />
            <span>{diasFechados.length === 1
              ? <><b>{fraseDoDiaFechado(diasFechados[0])} ({dataCurta(diasFechados[0])}).</b> {tipo === "creche" ? "A creche não abre nesse dia." : diasFechados[0] === diaDaEntrada ? "A chegada cai num dia em que vocês não abrem." : "A saída cai num dia em que vocês não abrem."}</>
              : <><b>{diasFechados.length} dias fechados no período</b> ({diasFechados.slice(0, 5).map((d) => dataCurta(d)).join(", ")}{diasFechados.length > 5 ? "…" : ""}).</>} Dá para salvar assim mesmo.</span>
          </p>
        )}
        {maisCheio && vagas != null && (
          <p className={`g-ht-vagas${nivel === "cheio" ? " cheio" : nivel === "quase" ? " quase" : ""}`} role="status">
            {tipo === "hotel" ? <Moon aria-hidden /> : <Sun aria-hidden />}
            <span>{diasDoPeriodo.length === 1 ? `Em ${dataCurta(maisCheio.d)}` : "Nessas datas"}: <b className="g-tab">{maisCheio.n} de {vagas} vagas</b>
              {diasDoPeriodo.length > 1 ? ` ${tipo === "hotel" ? "na noite mais cheia" : "no dia mais cheio"} (${dataCurta(maisCheio.d)})` : " tomadas"}{maisCheio.n >= vagas ? ". Sem vaga: dá para marcar, passando do limite." : "."}</span>
          </p>
        )}
        {aoEspera && !editar && !jaAqui && maisCheio && vagas != null && maisCheio.n >= vagas && dia >= hojeIso && (
          <div><button type="button" className="g-btn sec p" style={{ minHeight: 44 }} onClick={() => aoEspera({ pet, tipo, entrada: dia, saida: saidaDia || undefined })}><Hourglass />Colocar {pet.nome} na lista de espera</button></div>
        )}
        {opQuartos.ativo && tipo === "hotel" && opQuartos.lista.length > 0 && (
          <Campo rotulo="Acomodação" dica="Opcional. Mostra quantos hóspedes cada uma já tem nessas datas.">
            <select className="g-select" value={quartoId} onChange={(e) => setQuartoId(e.target.value)}>
              <option value="">Decidir depois</option>
              {opQuartos.lista.map((a) => <option key={a.id} value={a.id}>{a.nome} ({noQuarto(a.id)} de {a.vagas})</option>)}
            </select>
          </Campo>
        )}
        {diaDoPlano && (
          <div className="g-aviso vermelho" role="alert" style={{ marginBottom: 0 }}><AlertTriangle /><span className="g-cresce"><b>{pet.nome} é mensalista e já vem nesse dia pelo plano.</b> Não precisa reservar: no dia, marque a chegada na Chamada.</span></div>
        )}
        {reservaExtra && (
          <div className="g-aviso" role="status" style={{ marginBottom: 0 }}><CalendarCheck /><span className="g-cresce"><b>{pet.nome} é mensalista e esse dia não é do plano.</b> A reserva entra como dia extra: guarda a vaga, aparece na Chamada do dia e, quando ele vier, vai para a próxima mensalidade{vejoFinanceiro && valorDoExtra != null ? ` (${brl(valorDoExtra)})` : ""}. Nada é cobrado na porta. Se não vier, é só cancelar a reserva.</span></div>
        )}
        {planoDoPet && jaAqui && (
          <p className="g-muted g-pp" role="status">{pet.nome} é mensalista: a chegada dele se marca na Chamada (em dia fora do plano, por Veio fora do dia, e o dia vai para a mensalidade). Por aqui entra como diária avulsa, cobrada na saída.</p>
        )}
        {vejoFinanceiro && !reservaExtra && <Campo rotulo={`Valor da diária (${tipo === "hotel" ? "por noite" : "por dia"})`}
          dica={fixa == null ? "Defina o preço da diária em Meu pet shop para ele já vir preenchido."
            : doPorte ? (diaria === fixa ? `Diária do hotel para o porte ${pet.porte}, das opções do hotel.` : `A diária do hotel para o porte ${pet.porte} é ${brl(fixa)}.`)
            : diaria === fixa ? `Preço fixo ${tipo === "hotel" ? "do hotel" : "da creche"}, definido em Meu pet shop.`
            : `O preço fixo ${tipo === "hotel" ? "do hotel" : "da creche"} é ${brl(fixa)}.`}>
          <CampoValor valor={diaria} aoMudar={(n) => { setMexeuNaDiaria(true); setDiaria(n); }} placeholder={fixa == null ? "Sem preço fixo" : "0,00"} />
        </Campo>}
        {vejoFinanceiro && trocouTipo && (
          <p className="g-pp g-muted" role="status">
            Mudou de {nomeTipo(editar!.tipo).toLowerCase()} para {nomeTipo(tipo).toLowerCase()}: a diária {diaria == null ? "ficou em branco, porque esse tipo não tem preço fixo" : diaria === fixa ? `passou para ${brl(diaria)}, o preço fixo` : `está em ${brl(diaria)}`}
            {editar!.valor_diaria != null ? ` (antes era ${brl(editar!.valor_diaria)})` : ""}.
          </p>
        )}
        {vejoFinanceiro && !reservaExtra && opTaxas.ativo && opTaxas.lista.length > 0 && (
          <div className="g-campo">
            <span>Taxas combinadas</span>
            <div className="g-ht-marcar">
              {opTaxas.lista.map((t) => {
                const on = taxasMarcadas.includes(t.id);
                return (
                  <label key={t.id} className={on ? "on" : ""}>
                    <input type="checkbox" checked={on} onChange={(ev) => setTaxasMarcadas((l) => (ev.target.checked ? [...l, t.id] : l.filter((i) => i !== t.id)))} />
                    <span className="t"><b>{t.nome}</b><small>{t.por === "noite" ? `por ${tipo === "hotel" ? "noite" : "dia"}` : "uma vez na conta"}</small></span>
                    <b className="v">{brl(t.valor)}</b>
                  </label>
                );
              })}
            </div>
            <small>Só entra a taxa que você marcar. No check-out dá para marcar ou desmarcar de novo.</small>
          </div>
        )}
        {vejoFinanceiro && prev && !reservaExtra && (
          <p className="g-ch-valor g-ch-previsto" aria-live="polite">
            {prev.total === 0 ? <span className="g-tag">cortesia</span>
              : prev.aberto ? <span className="g-muted">Sem saída prevista: o total sai no check-out.</span>
              : <span>Total previsto <b className="g-tab">{brl(prev.total)}</b> <span className="g-muted">({prev.n} {prev.n === 1 ? "diária" : "diárias"}{prev.comRegra ? ", com temporada, feriado ou desconto" : ` de ${brl(diaria)}`}{prev.taxas ? ` e ${brl(prev.taxas)} de taxas` : ""})</span></span>}
          </p>
        )}
        {vejoFinanceiro && prev && !prev.aberto && prev.noites && temNoiteDiferente(prev.noites) && <NoitePorNoite noites={prev.noites} total={prev.diarias} />}
        {ofereceSinal && <CamposSinal estado={sinal} aoMudar={(s) => { setMexeuNoSinal(true); setSinal(s); setErroSinal(null); }} sugerido={sugerido} erro={erroSinal} semTutor={!pet.clientes?.id} />}
        {comCuidados && <EditorDeCuidados valor={cuidados} aoMudar={setCuidados} />}
        <Campo rotulo="Observações">
          <textarea className="g-textarea" value={obs} maxLength={600} onChange={(e) => setObs(e.target.value)} placeholder="Ração, remédio, horário de passeio, o que trouxe na mochila…" />
        </Campo>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}

/* ---------- encerrar o dia da creche (check-out de vários de uma vez) ---------- */

/**
 * Encerra de uma vez quem está na creche. Cada linha é só a diária (ou o pacote, ou o dia do plano).
 * - Reserva com sinal ou com taxas combinadas tem conta maior do que a diária: não entra aqui, sai pelo check-out do pet
 *   (o botão da linha abre). Assim o sinal é descontado e as taxas são cobradas, sem conta pela metade.
 * - Taxa de busca fora do horário: quando a regra está ligada e a hora passou, a linha mostra a taxa já marcada, o total
 *   diz quanto é de taxa e, antes de gravar, a pessoa confirma (ou desmarca). Ela nunca entra sem aparecer.
 * - Quem não mexe com dinheiro encerra sem valor nenhum: as saídas ficam em Check-outs para cobrar, para quem recebe.
 * - Mensalista que sai fora do horário: o banco anota a saída (`creche_atraso_anotar`). Quem recebe decide na linha (taxa marcada =
 *   recebida agora; desmarcada = não cobrar); para quem não mexe com dinheiro, fica em Check-outs para cobrar.
 */
function EncerrarCreche({ estadias, valores, aoFechar, aoGravar, aoCheckOut }: {
  estadias: EstadiaCompleta[]; valores: Map<string, ValoresDaEstadia>; aoFechar: () => void; aoGravar: () => void; aoCheckOut: (e: EstadiaCompleta) => void;
}) {
  const { sb, petshop, servicos, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const { calendario } = useCalendario();
  const [agora] = useState(() => new Date());
  const [sai, setSai] = useState<Record<string, boolean>>(() => Object.fromEntries(estadias.map((e) => [e.id, true])));
  const [cobrar, setCobrar] = useState<Record<string, boolean>>({});
  const [semPacote, setSemPacote] = useState<Record<string, boolean>>({});
  const [semTaxa, setSemTaxa] = useState<Record<string, boolean>>({});
  // no lote é uma forma só para todos (quem divide o pagamento sai pelo check-out do próprio pet)
  const [forma, setForma] = useFormaLembrada();
  const [erroForma, setErroForma] = useState<string | null>(null);
  const caixa = useCaixaAberto();
  const [salvando, setSalvando] = useState(false);

  const { dados: pacotes } = useDados(async () =>
    (await pacotesParaEstadia(sb, petshop.id, [...new Set(estadias.map((e) => e.pet_id))]).catch(() => [])).filter((p) => pacoteServe(p, "creche", servicos)),
  [petshop.id]);
  /** Pacote do pet que cobre as diárias (com saldo e dentro da validade). */
  const pacoteDe = (petId: string, n: number) => (pacotes ?? []).find((p) => p.pet_id === petId && p.total - p.usados >= n && !venceu(p)) ?? null;
  const atraso = vejoFinanceiro ? atrasoSugerido("creche", agora, calendario?.atraso) : null;
  const linhas = estadias.map((e) => {
    // mensalista: o dia é do plano (ou vai para a cobrança do mês); nada é cobrado na saída
    const mensal = Boolean(e.mensalista);
    // sinal ou taxas combinadas na reserva: a conta é maior do que a diária, então sai pelo check-out do pet
    const comSinal = e.sinal_estado === "pago" || e.sinal_estado === "a_receber";
    const sozinho = vejoFinanceiro && !mensal && (comSinal || taxasGuardadas(valores.get(e.id)).length > 0) ? (comSinal ? "tem sinal na reserva" : "tem taxas combinadas") : null;
    const n = mensal ? 1 : contarDiarias(e, agora);
    const valor = !mensal && e.valor_diaria != null ? centavos(n * Number(e.valor_diaria)) : 0;
    const pacote = mensal ? null : pacoteDe(e.pet_id, n);
    // quem tem pacote com saldo sai usando o pacote, a não ser que a pessoa desmarque
    const usaPacote = Boolean(pacote) && !semPacote[e.id];
    const cobra = !mensal && !usaPacote && vejoFinanceiro && valor > 0 && (cobrar[e.id] ?? true);
    const cortesia = !mensal && e.valor_diaria != null && Number(e.valor_diaria) === 0;
    // a taxa só entra na linha que fica com a conta fechada aqui; quem sai sem cobrar vai para Check-outs para cobrar, e a sugestão aparece lá
    const podeTaxa = Boolean(atraso) && !sozinho && (mensal || usaPacote || cobra || cortesia);
    const taxa = podeTaxa && !semTaxa[e.id] ? atraso!.valor : 0;
    return { e, n, valor, cobra, cortesia, mensal, pacote, usaPacote, sozinho, podeTaxa, taxa, recebe: centavos((cobra ? valor : 0) + taxa) };
  });
  const escolhidas = linhas.filter((l) => sai[l.e.id] && !l.sozinho);
  const total = centavos(escolhidas.reduce((t, l) => t + l.recebe, 0));
  const comTaxa = escolhidas.filter((l) => l.taxa > 0);
  const totalTaxas = centavos(comTaxa.reduce((t, l) => t + l.taxa, 0));
  const horaDaRegra = atraso ? atraso.hora.replace(":", "h") : "";

  async function salvar() {
    if (!escolhidas.length || salvando) return;
    const valorRuim = escolhidas.map((l) => (l.recebe > 0 ? erroDeValor(l.recebe, `O valor de ${l.e.pets?.nome ?? "um pet"}`) : null)).find(Boolean);
    if (valorRuim) { avisarErro(valorRuim); return; }
    if (total > 0 && !forma) { setErroForma("Escolha como os clientes pagaram."); avisarErro("Escolha a forma de pagamento."); return; }
    // a taxa de busca fora do horário nunca entra calada: a pessoa confirma antes de gravar
    if (comTaxa.length && !(await confirmar({
      titulo: comTaxa.length === 1 ? "Cobrar a taxa de busca fora do horário?" : `Cobrar a taxa de busca fora do horário de ${comTaxa.length} pets?`,
      texto: `Saída depois das ${horaDaRegra}: ${brl(atraso!.valor)} ${comTaxa.length === 1 ? "de" : "de cada um:"} ${comTaxa.slice(0, 8).map((l) => l.e.pets?.nome ?? "pet").join(", ")}${comTaxa.length > 8 ? ` e mais ${comTaxa.length - 8}` : ""}. No total, ${brl(totalTaxas)} de taxa. Para tirar a taxa de alguém, volte e desmarque na linha do pet.`,
      confirmar: comTaxa.length === 1 ? "Cobrar a taxa" : "Cobrar as taxas",
    }))) return;
    if (total > 0 && forma) lembrarForma(forma);
    if (total > 0 && forma) {
      if (!(await conferirValorAlto(total, confirmar))) return;
      if (!(await conferirCaixa(sb, petshop.id, confirmar))) return;
    }
    setSalvando(true);
    let feitos = 0, recebido = 0, comPacote = 0, anotadas = 0;
    const falhas: string[] = [];
    for (const l of escolhidas) {
      const nome = l.e.pets?.nome ?? "Pet";
      try {
        const saida = new Date().toISOString();
        // guarda o que foi cobrado: com pacote fica 0 (ou só a taxa) e a nota; quem saiu sem cobrar fica com o valor em branco (cortesia fica com 0)
        const r = ok(await sb.from("estadias").update({
          status: "encerrada", saida, diarias_cobradas: l.n,
          valor_cobrado: l.mensal ? null : l.usaPacote ? l.taxa : l.cobra && forma ? l.recebe : l.cortesia ? l.taxa : null,
          ...(l.usaPacote ? { obs: comNota(l.e.obs, NOTA_PACOTE) } : {}),
        }).eq("id", l.e.id).eq("petshop_id", petshop.id).eq("status", "em_casa").select("id"));
        if (!r.length) continue; // já tinha saído por outra tela
        feitos++;
        // mensalista: o banco confere a hora e anota a saída fora do horário (sem valor); a decisão vem logo abaixo ou fica para quem recebe
        const anotada = l.mensal && (await sb.rpc("creche_atraso_anotar", { p_estadia: l.e.id })).data === true;
        if (l.mensal && l.podeTaxa && l.taxa === 0) await decidirAtraso(sb, l.e.id, "dispensada").catch(() => undefined);
        else if (anotada && !(l.podeTaxa && l.taxa > 0 && forma)) anotadas++;
        if (l.usaPacote && l.pacote) {
          // mesma baixa do check-out do pet: só grava se ninguém mexeu no pacote no meio do caminho
          const usados = l.pacote.usados + l.n;
          const b = await sb.from("pacotes_clientes").update({ usados, ativo: usados < l.pacote.total })
            .eq("id", l.pacote.id).eq("petshop_id", petshop.id).eq("usados", l.pacote.usados).select("id");
          if (b.error || !b.data?.length) falhas.push(`${nome} (saiu, mas o pacote não teve baixa)`); else comPacote++;
        }
        if (l.recebe > 0 && forma) {
          const diarias = `Creche: ${l.n} ${l.n === 1 ? "diária" : "diárias"}`;
          const itens: ItemLancamento[] | null = l.taxa > 0 && l.cobra
            ? [{ tipo: "servico", nome: diarias, qtd: 1, valor: l.valor }, { tipo: "extra", nome: NOME_TAXA_ATRASO, qtd: 1, valor: l.taxa }] : null;
          try {
            const lanc = await lancarPago(sb, petshop.id, {
              tipo: "entrada", valor: l.recebe, forma, categoria: "Creche e hotel", itens,
              descricao: l.cobra ? `${diarias} · ${nome}${l.taxa > 0 ? ` + ${NOME_TAXA_ATRASO}` : ""}` : `Creche: ${NOME_TAXA_ATRASO.toLowerCase()} · ${nome}`, clienteId: l.e.pets?.clientes?.id ?? null,
            });
            recebido += l.recebe;
            // mensalista com a taxa recebida aqui: a anotação da saída fica ligada ao recebimento (não entra de novo na mensalidade)
            if (l.taxa > 0 && l.mensal) await decidirAtraso(sb, l.e.id, "recebida", l.taxa, lanc.id).catch(() => undefined);
            if (l.taxa > 0 && !l.mensal) {
              // conta com taxa: o histórico mostra como o total foi montado
              const dasDiarias = l.cobra ? l.valor : 0;
              const conta: ContaDaEstadia = {
                v: 1, tipo: "creche", quando: saida, diarias: l.n, valor_diaria: l.e.valor_diaria == null ? null : Number(l.e.valor_diaria), noites: null, pacote: l.usaPacote ? l.pacote?.nome ?? null : null,
                total_diarias: dasDiarias, taxas: [{ id: ID_TAXA_ATRASO, nome: NOME_TAXA_ATRASO, por: "fixa", valor: l.taxa, qtd: 1, total: l.taxa }], extras: [], produtos: [],
                soma: l.recebe, ajuste: 0, total: l.recebe, sinal: 0, sinal_pago: false, a_pagar: l.recebe, pendencias: [],
                pagamento: { fiado: false, forma, pagamentos: null }, lancamento_id: lanc.id,
              };
              await sb.from("estadias_valores").upsert({ estadia_id: l.e.id, petshop_id: petshop.id, conta: conta as never }, { onConflict: "estadia_id" }).select("estadia_id");
            }
          } catch { falhas.push(`${nome} (saiu, mas o pagamento não foi lançado)`); }
        }
      } catch { falhas.push(nome); }
    }
    setSalvando(false);
    if (falhas.length) avisarErro(`Não deu certo com: ${falhas.join(", ")}. Confira${vejoFinanceiro ? " e, se precisar, lance pelo Financeiro" : ""}.`);
    if (feitos) avisar(`${feitos === 1 ? "1 pet foi" : `${feitos} pets foram`} para casa.${comPacote ? ` ${comPacote === 1 ? "1 usou" : `${comPacote} usaram`} o pacote.` : ""}${recebido ? ` ${brl(recebido)} no financeiro.` : ""}${anotadas ? ` ${anotadas === 1 ? "1 mensalista saiu" : `${anotadas} mensalistas saíram`} depois do horário: a taxa fica em Check-outs para cobrar, para ${vejoFinanceiro ? "você decidir" : "quem cuida do caixa decidir"}.` : ""}`);
    aoGravar();
  }

  return (
    <Folha titulo="Encerrar o dia da creche" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando || !escolhidas.length}>
          {salvando ? "Salvando…" : `Encerrar ${escolhidas.length}${total ? ` e receber ${brl(total)}` : ""}`}
        </button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">Marque quem está indo embora agora. Mensalista sai sem cobrança e quem tem pacote usa o pacote. {vejoFinanceiro ? "Os outros são cobrados com a forma escolhida, ou ficam sem cobrar." : "A cobrança dos outros fica para quem cuida do financeiro, em Check-outs para cobrar."}</p>
        {atraso && linhas.some((l) => l.podeTaxa) && (
          <div className="g-ht-atraso" role="status">
            <p><b>Já passou das {horaDaRegra}.</b> A taxa de busca fora do horário ({brl(atraso.valor)}) aparece marcada em cada linha. Desmarque de quem não vai pagar: antes de gravar, o sistema ainda pergunta.</p>
          </div>
        )}
        <div className="g-ch-lote-lista">
          {linhas.map((l) => (
            <div key={l.e.id} className={`g-ch-lote-linha${sai[l.e.id] && !l.sozinho ? " on" : ""}`}>
              <label className="quem">
                <input type="checkbox" checked={Boolean(sai[l.e.id]) && !l.sozinho} disabled={Boolean(l.sozinho)} onChange={(ev) => setSai((x) => ({ ...x, [l.e.id]: ev.target.checked }))} />
                <AvatarPet pet={l.e.pets ?? { nome: "?" }} tamanho="p" />
                <span className="t"><b>{l.e.pets?.nome ?? "Pet removido"}</b><small>{l.e.pets?.clientes?.nome ?? "Sem tutor"} · {l.mensal
                  ? (l.e.mensalista === "extra" ? "mensalista, dia extra (vai na cobrança do mês)" : l.e.mensalista === "reposicao" ? "mensalista, reposição" : "mensalista, dia do plano")
                  : `${l.n} ${l.n === 1 ? "diária" : "diárias"}${!vejoFinanceiro ? "" : l.valor > 0 ? ` · ${brl(l.valor)}` : l.cortesia ? " · cortesia" : " · sem diária combinada"}`}</small></span>
              </label>
              {l.sozinho && (
                <div className="cobra" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span>Esta estadia {l.sozinho}: a conta dela é fechada no check-out do pet.</span>
                  <button type="button" className="g-btn sec p" onClick={() => aoCheckOut(l.e)}><LogOut />Abrir o check-out</button>
                </div>
              )}
              {l.pacote && sai[l.e.id] && !l.sozinho && (
                <label className="cobra">
                  <input type="checkbox" checked={l.usaPacote} onChange={(ev) => setSemPacote((x) => ({ ...x, [l.e.id]: !ev.target.checked }))} />
                  <span>Usar {l.n} do pacote (restam {l.pacote.total - l.pacote.usados})</span>
                </label>
              )}
              {vejoFinanceiro && !l.mensal && !l.usaPacote && l.valor > 0 && sai[l.e.id] && !l.sozinho && (
                <label className="cobra">
                  <input type="checkbox" checked={l.cobra} onChange={(ev) => setCobrar((x) => ({ ...x, [l.e.id]: ev.target.checked }))} />
                  <span>Cobrar {brl(l.valor)}</span>
                </label>
              )}
              {l.podeTaxa && sai[l.e.id] && (
                <label className="cobra">
                  <input type="checkbox" checked={l.taxa > 0} onChange={(ev) => setSemTaxa((x) => ({ ...x, [l.e.id]: !ev.target.checked }))} />
                  <span>Taxa de busca fora do horário: {brl(atraso!.valor)}</span>
                </label>
              )}
            </div>
          ))}
        </div>
        {vejoFinanceiro && total > 0 && (
          <>
            {totalTaxas > 0 && <p className="g-p" role="status">Dos {brl(total)}, <b>{brl(totalTaxas)}</b> {comTaxa.length === 1 ? "é a taxa de busca fora do horário de 1 pet" : `são taxas de busca fora do horário de ${comTaxa.length} pets`}.</p>}
            <ChipsForma valor={forma} aoMudar={(f) => { setForma(f); setErroForma(null); }} erro={erroForma} />
            <p className="g-pp g-muted">A mesma forma vale para todos. Se alguém dividir o pagamento ou for pagar depois, desmarque esse pet aqui e faça o check-out pelo cartão dele.</p>
            <AvisoCaixaFechado aberto={caixa} />
          </>
        )}
      </div>
    </Folha>
  );
}

/* ---------- estadia encerrada: corrigir as datas ---------- */

/**
 * Corrige o dia e a hora em que o pet entrou e saiu de uma estadia já encerrada, e o número de diárias.
 * A cobrança que ficou para trás (check-out de quem não mexe com dinheiro) não é feita aqui: é pela lista
 * Check-outs para cobrar, que abre a conta completa (regras de preço, taxas, sinal e taxa de busca fora do horário).
 */
function AcertarEstadia({ estadia, aoFechar, aoGravar }: { estadia: EstadiaCompleta; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  // a conta como foi cobrada (só quem recebe lê) e as outras estadias do tutor: para refazer as linhas com as datas certas
  const { dados: guardado } = useDados(async () => {
    if (!vejoFinanceiro) return null;
    const [v, outras] = await Promise.all([
      sb.from("estadias_valores").select("*").eq("estadia_id", estadia.id).maybeSingle(),
      estadia.tipo === "hotel" ? estadiasDoTutor(sb, petshop.id, estadia.pets?.clientes?.id) : Promise.resolve([] as EstadiaDoTutor[]),
    ]);
    return { conta: lerConta((v.data ?? null) as ValoresDaEstadia | null), outras };
  }, [petshop.id, estadia.id, vejoFinanceiro]);
  const pendente = estadiaSemCobranca(estadia);
  const fimInicial = estadia.saida ?? estadia.entrada;
  const [dia, setDia] = useState(isoDia(new Date(estadia.entrada)));
  const [hhmm, setHhmm] = useState(horaDe(estadia.entrada));
  const [saidaDia, setSaidaDia] = useState(isoDia(new Date(fimInicial)));
  const [saidaHora, setSaidaHora] = useState(horaDe(fimInicial));
  const [diarias, setDiarias] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const entrada = dia && hhmm ? juntaDiaHora(dia, hhmm) : null;
  const saida = saidaDia && saidaHora ? juntaDiaHora(saidaDia, saidaHora) : null;
  const datasBoas = Boolean(entrada && saida && !Number.isNaN(entrada.getTime()) && !Number.isNaN(saida.getTime()) && saida > entrada && saida.getTime() <= Date.now() + 60000);
  const mexeuNasDatas = entrada?.toISOString() !== new Date(estadia.entrada).toISOString() || saida?.toISOString() !== new Date(fimInicial).toISOString();
  // as diárias acompanham as datas enquanto a pessoa não digita outro número
  const contadas = datasBoas ? contarDiarias({ tipo: estadia.tipo, entrada: entrada!.toISOString() }, saida!) : estadia.diarias_cobradas ?? 1;
  const n = Number(diarias ?? (mexeuNasDatas ? contadas : estadia.diarias_cobradas ?? contadas));
  const nValido = Number.isInteger(n) && n >= 1;
  const nome = estadia.pets?.nome ?? "O pet";
  /**
   * A conta guardada com as linhas refeitas pelas datas e diárias corrigidas (as noites nos dias certos, com a temporada e o
   * feriado de cada uma). O total cobrado e o dinheiro recebido NÃO mudam: se as diárias dão outro valor, a diferença
   * aparece na conta como desconto ou acréscimo, e a tela diz quanto é.
   */
  const contaNova = (() => {
    const c = guardado?.conta;
    if (!c || c.pacote || !datasBoas || !nValido || c.valor_diaria == null) return null;
    const d = contaDasDiarias(petshop, { ...estadia, entrada: entrada!.toISOString() }, n, c.valor_diaria, guardado!.outras, saida!, saida!);
    if (d.total == null) return null;
    const soma = centavos(c.soma - c.total_diarias + d.total);
    const conta: ContaDaEstadia = { ...c, diarias: n, noites: d.noites, total_diarias: d.total, taxas: c.taxas.map((t) => (t.por === "noite" ? taxaNaConta(t, n) : t)), soma, ajuste: 0 };
    conta.soma = centavos(conta.total_diarias + conta.taxas.reduce((t, x) => t + x.total, 0) + conta.extras.reduce((t, x) => t + x.valor, 0) + conta.produtos.reduce((t, x) => t + x.total, 0));
    conta.ajuste = centavos(c.total - conta.soma);
    const mudou = JSON.stringify(conta.noites) !== JSON.stringify(c.noites) || conta.diarias !== c.diarias || conta.total_diarias !== c.total_diarias || conta.soma !== c.soma;
    return { conta, mudou, diferenca: centavos(conta.soma - c.total), cobrado: c.total, noites: d.noites };
  })();

  async function salvar() {
    if (salvando) return;
    if (!datasBoas) return setErro("Confira as datas: a saída vem depois da entrada e não pode ser no futuro.");
    if (!nValido) return setErro("Confira o número de diárias.");
    setErro(null); setSalvando(true);
    try {
      const r = ok(await sb.from("estadias").update({ entrada: entrada!.toISOString(), saida: saida!.toISOString(), diarias_cobradas: n })
        .eq("id", estadia.id).eq("petshop_id", petshop.id).eq("status", "encerrada").select("id"));
      if (r.length && contaNova?.mudou) {
        // as linhas da conta acompanham as datas corrigidas (o comprovante e o histórico passam a mostrar as noites certas)
        const g = await sb.from("estadias_valores").update({ conta: contaNova.conta as never }).eq("estadia_id", estadia.id).select("estadia_id");
        if (g.error) avisarErro(`As datas foram corrigidas, mas o detalhe da conta não. (${g.error.message})`);
      }
      if (!r.length) avisar("Essa estadia já tinha sido alterada. Atualizei a lista.");
      else avisar(contaNova?.mudou && contaNova.diferenca !== 0 ? `Estadia corrigida. A conta agora mostra as noites certas; o valor recebido (${brl(contaNova.cobrado)}) não mudou.` : "Estadia corrigida.");
      aoGravar();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha titulo={`Corrigir a estadia de ${nome}`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-form">
        <p className="g-muted g-p">{nomeTipo(estadia.tipo)} · {estadia.pets?.clientes?.nome ?? "Sem tutor"}. Acerte o dia e a hora em que o pet entrou e saiu de verdade.</p>
        <div className="dupla">
          <Campo rotulo="Entrou em"><input type="date" className="g-input" value={dia} max={isoDia(new Date())} onChange={(e) => { setDia(e.target.value); setErro(null); }} /></Campo>
          <Campo rotulo="Hora"><input type="time" className="g-input" value={hhmm} onChange={(e) => { setHhmm(e.target.value); setErro(null); }} /></Campo>
        </div>
        <div className="dupla">
          <Campo rotulo="Saiu em"><input type="date" className="g-input" value={saidaDia} min={dia} max={isoDia(new Date())} onChange={(e) => { setSaidaDia(e.target.value); setErro(null); }} /></Campo>
          <Campo rotulo="Hora"><input type="time" className="g-input" value={saidaHora} onChange={(e) => { setSaidaHora(e.target.value); setErro(null); }} /></Campo>
        </div>
        <Campo rotulo="Diárias" dica={datasBoas ? `Pelas datas: ${contadas}.` : undefined} erro={nValido ? null : "Use um número inteiro, a partir de 1."}>
          <input className="g-input g-tab" inputMode="numeric" value={String(diarias ?? (Number.isFinite(n) ? n : ""))} onChange={(e) => setDiarias(e.target.value)} />
        </Campo>
        {contaNova?.mudou && (
          <div className="g-card areia g-pilha p" role="status">
            <p className="g-p"><b>A conta acompanha a correção.</b> As linhas das diárias passam a mostrar {estadia.tipo === "hotel" ? "as noites" : "os dias"} das datas certas{contaNova.noites?.some((x) => x.temporada) ? ", com a temporada ou o feriado de cada uma" : ""}.</p>
            {contaNova.noites && <NoitePorNoite noites={contaNova.noites} total={contaNova.conta.total_diarias} />}
            {contaNova.diferenca !== 0
              ? <p className="g-p">Pelas datas corrigidas, a conta daria <b className="g-tab">{brl(contaNova.conta.soma)}</b>; foram cobrados <b className="g-tab">{brl(contaNova.cobrado)}</b> ({brl(Math.abs(contaNova.diferenca))} a {contaNova.diferenca < 0 ? "mais" : "menos"}). O que já foi recebido não muda sozinho: a diferença aparece na conta como {contaNova.diferenca < 0 ? "acréscimo" : "desconto"}. Se for devolver ou cobrar essa diferença do tutor, lance no Financeiro.</p>
              : <p className="g-muted g-p">O total cobrado continua o mesmo.</p>}
            {guardado?.conta?.taxas.some((t) => t.id === ID_TAXA_ATRASO) && <p className="g-muted g-p">A taxa de busca fora do horário cobrada no check-out continua na conta: ela foi recebida. Se não era devida, devolva pelo Financeiro.</p>}
          </div>
        )}
        {pendente && <p className="g-muted g-p" role="status">Esta estadia ainda está sem cobrança. Depois de corrigir as datas, receba pela lista Check-outs para cobrar, no alto de Casa agora.</p>}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
