"use client";

import AceiteDoLink from "@/components/gestao/agenda/aceite-do-link";
import { COLS_PACOTE_CLIENTE } from "@/lib/gestao/reservado";
import { useState } from "react";
import Link from "next/link";
import { BellRing, CalendarClock, CalendarX, Check, HandCoins, MessageCircle, Play, Printer, Receipt, Repeat, Trash2, Truck, UserX } from "lucide-react";
import type { AgendamentoCompleto, Lancamento, PacoteCliente, StatusAgendamento } from "@/lib/gestao/tipos";
import { CHECKLIST_BANHO, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { textoCancelado, textoConfirmacao, textoLembrete, textoPronto, textoRemarcado } from "@/lib/gestao/agenda";
import { imprimirComprovante, textoComprovante, type AntigaNoComprovante } from "@/lib/gestao/comprovante";
import { conferirCaixa, desfazerVenda, itensDoLancamento, lancarAReceber, lancarPago, produtosDaVenda, textoDoPagamento, type ItemLancamento } from "@/lib/gestao/dinheiro";
import { taxaDeFalta, travaDePreco } from "@/lib/gestao/dinheiro-opcoes";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { conferirDiaDoHorario } from "@/lib/gestao/dia-do-horario";
import { fazerTudoOuNada } from "@/lib/gestao/tudo-ou-nada";
import { nomeDosServicos, servicosAMais, servicosPorExtenso, valorDoHorario } from "@/lib/gestao/servicos-do-horario";
import { brl, dataAmigavel, dataCompleta, dataCurta, dataLonga, fmtTelefone, hora, inicioDoDia, isoDia, linkWhatsApp, mesmoDia, soDigitos, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, Folha, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { FolhaBaixa, FolhaLancamento } from "../financeiro/comum";
import { AvisoCaixaFechado, EscolhaPagamento, fecharPagamento, ParcelasNaTela, useAnotarParcelas, useCaixaAberto, usePagamento } from "../loja/pecas";
import { FidelidadeNoHorario } from "../fidelidade";
import Comanda from "./comanda";
import { MarcaSemCobranca, semCobranca } from "./para-cobrar";
import AntesDepois from "./antes-depois";
import { BotaoBoletim } from "../boletim/boletim";
import { EntradaNaChegada, EntradaNaVisita, type VisitaDaEntrada } from "../entrada/entrada";
import { continuarSerie, encerrarSerie, textoContinuou, VEZES_POR_VEZ } from "./series-acabando";
import { LinhaPromo, usePromoDoHorario } from "./promo-do-horario";
import { AvisoPacoteAcabando } from "../pacote-acabando";
import { descontoDaPromo } from "@/lib/gestao/promocoes";
import "@/components/gestao/hotel/hotel.css";

/** Tudo sobre um horário: quem é o pet, o que fazer agora (confirmar, iniciar, concluir e fechar a conta) e o lembrete no WhatsApp. */
export default function DetalheAgendamento({ agendamento: a, aoFechar, aoMudar, aoEditar }: {
  agendamento: AgendamentoCompleto; aoFechar: () => void; aoMudar: () => void; aoEditar: () => void;
}) {
  const { sb, petshop, vejoFinanceiro, cuidoDoFinanceiro, souDono, posso, servicos } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  // a promoção do horário (o banco pôs ao marcar): a equipe tira ou põe de volta até a conta ser lançada
  const promoDoHorario = usePromoDoHorario(a.id, a.promo);
  // conta aberta: "sim", ou com o pacote que vai cobrir o serviço principal
  const [comanda, setComanda] = useState<false | "sim" | PacoteCliente>(false);
  const [cancelando, setCancelando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [baixando, setBaixando] = useState<Lancamento | null>(null);
  // falta sem taxa configurada: anotar o que o tutor deve daqui mesmo (sem ir à ficha)
  const [anotandoFalta, setAnotandoFalta] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>((a.checklist as Record<string, boolean>) ?? {});
  const [ocupado, setOcupado] = useState(false);
  const [avisadoEm, setAvisadoEm] = useState(a.pronto_avisado_em);
  // "Cobrar a diferença" aberto (atendimento pago que ficou mais caro depois)
  const [cobrandoDiferenca, setCobrandoDiferenca] = useState(false);
  // checklist de entrada: abre sozinha depois do "Chegou" quando o pet shop pede (todos ou pet idoso)
  const [chegou, setChegou] = useState(false);

  const pet = a.pets;
  const tutor = pet?.clientes;
  const st = STATUS_AGENDAMENTO[a.status];
  const visitaDaEntrada: VisitaDaEntrada | null = pet ? { tipo: "banho", agendamentoId: a.id, petId: pet.id, pet: pet.nome, tutor: tutor ? { nome: tutor.nome, telefone: tutor.telefone } : null } : null;
  const encerrado = ["concluido", "faltou", "cancelado"].includes(a.status);
  const deHoje = mesmoDia(new Date(a.inicio), new Date());
  // fotos: de hoje para trás, em horário que aconteceu (ou em qualquer um que já tenha foto)
  const comFotos = Boolean(a.foto_antes || a.foto_depois)
    || (!["cancelado", "faltou"].includes(a.status) && new Date(a.inicio) < somaDias(inicioDoDia(new Date()), 1));
  const podeAvisarPronto = deHoje && (a.status === "em_atendimento" || a.status === "concluido");

  // já foi pago? tem pacote que cobre este serviço?
  // Tudo junto, e só então os botões de dinheiro aparecem: sem saber se já foi pago, se tem pacote ou se o tutor deve de antes,
  // a folha mostraria só "Fechar a conta" e a cobrança em dobro ficaria a um toque. Se uma leitura falha, não mostra nada de cobrar.
  const { dados: extra, erro: erroExtra, recarregar } = useDados(async () => {
    const diaDoHorario = isoDia(new Date(a.inicio));
    const [pago, pacotes, semConta, mexidas, deve, diferencas] = await Promise.all([
      // o recebimento deste horário vem por uma função do banco: quem só opera o caixa não lê o histórico, mas vê se este foi pago
      vejoFinanceiro ? sb.rpc("recebimentos_do_agendamento", { p_agendamento: a.id }) : Promise.resolve({ data: [] as Lancamento[], error: null }),
      sb.from("pacotes_clientes").select(COLS_PACOTE_CLIENTE).eq("petshop_id", petshop.id).eq("pet_id", a.pet_id).eq("ativo", true),
      // concluído e sem conta fechada? O banco responde sem mostrar valor (serve também para quem não mexe com dinheiro)
      a.status === "concluido" ? sb.rpc("agendamentos_para_cobrar", { p: petshop.id, p_de: diaDoHorario, p_ate: diaDoHorario }) : Promise.resolve({ data: [] as { id: string }[], error: null }),
      // serviço tirado da conta e preço abaixo da lista ficam anotados: o dono vê no próprio horário (o que foi feito não some)
      cuidoDoFinanceiro ? sb.from("precos_alterados").select("id, tipo, item, de, para, quem_nome, quando").eq("petshop_id", petshop.id).eq("agendamento_id", a.id).in("tipo", ["servico_tirado", "preco_agenda", "atendimento_baixou", "atendimento_reaberto"]).order("quando").limit(20)
        : Promise.resolve({ data: [] as { id: string; tipo: string; item: string; de: number | null; para: number; quem_nome: string | null; quando: string }[], error: null }),
      // o que o tutor deve de antes (fiado, taxa de falta, resto): aparece aqui e em Fechar a conta, para receber junto
      vejoFinanceiro && a.pets?.clientes?.id
        ? sb.from("lancamentos").select("id, valor, descricao, categoria, vencimento, agendamento_id").eq("petshop_id", petshop.id).eq("cliente_id", a.pets.clientes.id).eq("tipo", "entrada").eq("pago", false).order("data").limit(20)
        : Promise.resolve({ data: [] as { id: string; valor: number; descricao: string | null; categoria: string; vencimento: string | null; agendamento_id: string | null }[], error: null }),
      // a diferença de um atendimento pago que ficou mais caro, já cobrada por "Cobrar a diferença"
      vejoFinanceiro && a.status === "concluido" ? sb.rpc("diferencas_do_agendamento", { p_agendamento: a.id }) : Promise.resolve({ data: 0, error: null }),
    ]);
    for (const r of [pago, pacotes, semConta, deve]) if (r.error) throw new Error(r.error.message);
    // horário que se repete: até quando vai a série (o último que ainda está de pé)
    let fimDaSerie: string | null = null;
    // repetição marcada como "até eu cancelar" (ainda valendo)?
    let semFim = false;
    if (a.serie_id) {
      const sf = await sb.from("series_agenda").select("serie_id").eq("serie_id", a.serie_id).eq("petshop_id", petshop.id).is("encerrada_em", null).maybeSingle();
      semFim = Boolean(sf.data);
      const u = await sb.from("agendamentos").select("inicio").eq("petshop_id", petshop.id).eq("serie_id", a.serie_id).not("status", "in", "(cancelado,faltou)").order("inicio", { ascending: false }).limit(1);
      fimDaSerie = u.data?.[0]?.inicio ?? null;
    }
    const validos = ((pacotes.data ?? []) as PacoteCliente[]).filter((p) => p.usados < p.total && (!p.vence_em || p.vence_em >= isoDia(new Date())) && (!p.servico_id || p.servico_id === a.servico_id));
    const lancados = (pago.data ?? []) as Lancamento[];
    // o pagamento já está num caixa fechado? (aí só o dono reabre ou apaga)
    const caixas = [...new Set(lancados.filter((l) => l.pago && l.caixa_id).map((l) => l.caixa_id!))];
    const fechados = caixas.length ? await sb.from("caixas").select("id").in("id", caixas).not("fechado_em", "is", null) : { data: [] };
    const antigas = ((deve.data ?? []) as { id: string; valor: number; descricao: string | null; categoria: string; vencimento: string | null; agendamento_id: string | null }[]).filter((l) => l.agendamento_id !== a.id);
    return {
      pago: lancados, pacote: validos[0] ?? null, fimDaSerie, semFim, emCaixaFechado: (fechados.data ?? []).length > 0, faltaCobrar: (semConta.data ?? []).some((x) => x.id === a.id), mexidas: mexidas.data ?? [],
      antigas, diferencaCobrada: Number(diferencas.error ? 0 : diferencas.data ?? 0),
    };
  }, [a.id, a.status, a.sem_cobranca]);
  // mais de um serviço no mesmo horário: o pacote cobre só o principal; os outros entram na conta
  const outros = servicosAMais(a);
  const valorOutros = Math.round(outros.reduce((t, o) => t + Number(o.preco ?? 0), 0) * 100) / 100;
  const total = valorDoHorario(a);
  const pago = (extra?.pago.length ?? 0) > 0 || (Boolean(a.pacote_cliente_id) && !outros.length);
  // pacote que ainda pode cobrir o serviço principal (se este horário já usou um, não oferece de novo)
  const pacote = a.pacote_cliente_id ? null : extra?.pacote ?? null;
  // o que falta cobrar na conta: tudo, ou só os outros serviços quando o principal foi pelo pacote
  const aCobrar = a.pacote_cliente_id ? valorOutros : total;
  // a promoção tira da conta (a mesma conta de Fechar a conta): o principal só quando não vai pelo pacote
  const categoriaDe = (id: string) => servicos.find((x) => x.id === id)?.categoria;
  const promoValor = descontoDaPromo(promoDoHorario.promo, [
    ...(a.pacote_cliente_id || a.preco == null ? [] : [{ tipo: "servico", valor: Number(a.preco), qtd: 1 }]),
    ...outros.map((o) => ({ tipo: "servico", valor: o.preco == null ? null : Number(o.preco), qtd: 1, servicoId: o.servico_id })),
  ], a.servico_id, categoriaDe);
  // conta fechada: já recebida, ou anotada para o cliente pagar depois (a receber)
  const recebidos = (extra?.pago ?? []).filter((l) => l.pago), devidos = (extra?.pago ?? []).filter((l) => !l.pago);
  const recebido = recebidos.reduce((t, l) => t + Number(l.valor), 0);
  const aReceber = devidos.reduce((t, l) => t + Number(l.valor), 0);
  const lancado = recebido + aReceber;
  // concluído sem conta fechada (nem recebida, nem "paga depois"): não é a mesma coisa que pago
  const faltaCobrar = a.status === "concluido" && Boolean(extra?.faltaCobrar);
  // o horário mudou depois de a conta ser fechada (reabriu, aumentou o valor, concluiu de novo): a conta ficou menor que o horário
  const daConta = (extra?.pago ?? []).reduce((t, l) => {
    const servicos = itensDoLancamento(l).filter((i) => i.tipo === "servico");
    return t + (servicos.length ? servicos.reduce((s, i) => s + i.qtd * i.valor, 0) : Number(l.valor_original ?? l.valor));
  }, 0);
  // o que já foi cobrado à parte por "Cobrar a diferença" conta como pago
  const diferenca = lancado > 0 && aCobrar != null ? Math.max(0, Math.round((aCobrar - daConta - (extra?.diferencaCobrada ?? 0)) * 100) / 100) : 0;
  const deveAntes = Math.round((extra?.antigas ?? []).reduce((t, l) => t + Number(l.valor), 0) * 100) / 100;
  const formasDoRecebido = [...new Set(recebidos.map((l) => textoDoPagamento(l)))].join(" e ");
  // como chamar o que está lançado neste horário, nas perguntas de apagar
  const oLancado = recebido > 0 && aReceber > 0 ? "o recebimento e a conta a receber" : aReceber > 0 ? "a conta a receber" : "o recebimento";
  // Quem pode reabrir, alterar ou apagar (o banco confere a mesma regra):
  // com pagamento num caixa fechado, só o dono; com pagamento, conta a receber ou pacote usado, o dono e quem cuida do financeiro;
  // concluído sem dinheiro lançado, quem recebe. Enquanto não sabe se foi pago, não oferece.
  const temConta = lancado > 0 || Boolean(a.pacote_cliente_id);
  const sabe = extra != null;
  // preço travado: quem só opera o caixa não volta para marcado nem apaga um concluído que ainda não foi cobrado (seria tirar o dinheiro dele)
  const travado = travaDePreco(petshop).ligada && !cuidoDoFinanceiro;
  const concluidoTravado = travado && a.status === "concluido" && !temConta && !a.sem_cobranca && (total ?? 0) > 0;
  const podeMexerNoPago = extra?.emCaixaFechado ? souDono : temConta ? cuidoDoFinanceiro : vejoFinanceiro && !concluidoTravado;
  const podeReabrir = a.status !== "concluido" || (sabe && podeMexerNoPago);
  const podeApagar = sabe && (a.status === "concluido" || temConta ? podeMexerNoPago : true);
  const porQueNao = extra?.emCaixaFechado ? "O pagamento deste atendimento está em um caixa já fechado: só o dono do pet shop pode reabrir, alterar ou apagar."
    : temConta ? "Atendimento com pagamento lançado: só o dono ou quem cuida do financeiro pode reabrir, alterar ou apagar."
    : concluidoTravado ? "Com o preço travado, só o dono ou quem vê o financeiro volta para marcado ou apaga um atendimento concluído. Falta cobrar? Feche a conta pelo valor do horário."
    : "Atendimento concluído: só quem cuida do caixa ou do financeiro pode reabrir, alterar ou apagar.";

  async function mudar(campos: Partial<{ status: StatusAgendamento; checklist: Record<string, boolean>; lembrete_em: string; pronto_avisado_em: string; pacote_cliente_id: string }>, aviso?: string) {
    if (somenteLeitura()) return false;
    setOcupado(true);
    try {
      ok(await sb.from("agendamentos").update(campos).eq("id", a.id).select("id").single());
      if (aviso) avisar(aviso);
      avisarMudanca();
      aoMudar();
      return true;
    } catch (e) { avisarErro(e); return false; } finally { setOcupado(false); }
  }

  /** Cancela este horário e os próximos da mesma série que ainda não aconteceram (marcados ou confirmados). */
  async function cancelarDaquiEmDiante() {
    if (somenteLeitura() || !a.serie_id) return;
    setOcupado(true);
    try {
      ok(await sb.from("agendamentos").update({ status: "cancelado" }).eq("id", a.id).select("id").single());
      const outros = ok(await sb.from("agendamentos").update({ status: "cancelado" }).eq("petshop_id", petshop.id).eq("serie_id", a.serie_id)
        .gte("inicio", a.inicio).in("status", ["marcado", "confirmado"]).neq("id", a.id).select("id"));
      // era "até eu cancelar": cancelou, então a Agenda para de avisar para continuar
      await encerrarSerie(sb, petshop.id, a.serie_id);
      avisar(outros.length ? `Cancelado este e mais ${outros.length === 1 ? "1 horário" : `${outros.length} horários`} da repetição.` : "Horário cancelado. Não havia outros à frente.");
      avisarMudanca();
      aoMudar();
      setCancelando(false);
    } catch (e) { avisarErro(e); avisarMudanca(); aoMudar(); } finally { setOcupado(false); }
  }

  /** Repetição "até eu cancelar": marca os próximos horários da série, a partir do último que existe. */
  async function continuarRepeticao(visto: string) {
    if (somenteLeitura() || !a.serie_id) return;
    setOcupado(true);
    try {
      // o último horário da série, de pé ou não: é dele que a repetição segue
      const u = await sb.from("agendamentos").select("inicio").eq("petshop_id", petshop.id).eq("serie_id", a.serie_id).order("inicio", { ascending: false }).limit(1);
      avisar(textoContinuou(await continuarSerie(sb, a.serie_id, u.data?.[0]?.inicio ?? visto)));
      avisarMudanca();
      aoMudar();
      void recarregar();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }

  // o uso do pacote soma no banco (nunca volta um número lido antes) e o horário conclui junto: tudo ou nada
  const opPacote = useOperacao();
  const usarPacote = (p: PacoteCliente) => opPacote.fazer(async (chave) => {
    if (somenteLeitura()) return false;
    if (!(await conferirDiaDoHorario(a.inicio, confirmar))) return false;
    setOcupado(true);
    try {
      const feito = await fazerTudoOuNada(sb, petshop.id, chave, { funcao: "agendamento_fechar_conta", agendamento: a.id },
        [{ t: "pacote", id: p.id, n: 1 }, { t: "agendamento", id: a.id, status: "concluido", pacote_cliente_id: p.id }]);
      const u = feito.passos.find((x) => x.t === "pacote");
      avisar(`Usado ${u?.usados ?? p.usados + 1} de ${u?.total ?? p.total} do pacote.`);
      avisarMudanca();
      aoMudar();
      aoFechar();
      return true;
    } catch (e) { avisarErro(e); return false; } finally { setOcupado(false); }
  });

  /** Volta um horário encerrado para "marcado". Se já tem dinheiro lançado, explica antes o que acontece com ele. */
  async function reabrir() {
    if (somenteLeitura()) return;
    if (a.status === "concluido" && temConta) {
      const dinheiro = recebido > 0 ? `O pagamento de ${brl(recebido)}${formasDoRecebido ? ` (${formasDoRecebido})` : ""} continua lançado${extra?.emCaixaFechado ? " no caixa que já foi fechado" : ""} e não muda sozinho. `
        : aReceber > 0 ? `A conta de ${brl(aReceber)} que o cliente ficou de pagar continua em A receber. `
        : "O uso do pacote continua contado. ";
      const sim = await confirmar({
        titulo: "Reabrir um atendimento que já foi pago?",
        texto: `${dinheiro}A conta fechada continua como está: a comissão e os relatórios seguem o que foi cobrado (a conta fechada e a diferença cobrada depois). Se o valor do horário subir, o horário mostra Cobrar a diferença. Para corrigir o dinheiro recebido, altere o lançamento em Financeiro: a alteração fica anotada.`,
        confirmar: "Reabrir",
      });
      if (!sim) return;
    }
    void mudar({ status: "marcado" }, "Voltou para marcado.");
  }

  const avisoPacote = a.pacote_cliente_id ? " Este atendimento foi pago com um pacote: apagar o horário não devolve o uso ao pacote (acerte em Pacotes, se for o caso)." : "";

  /** Toque na lixeira: sem recebimento, uma confirmação simples; com recebimento, abre a escolha (apagar junto ou manter). */
  async function pedirApagar() {
    if (somenteLeitura()) return;
    if (lancado > 0) { setApagando(true); return; }
    if (!(await confirmar({ titulo: "Apagar este horário?", texto: `Ele some da agenda. Se o cliente só desmarcou, prefira Desmarcar horário, que fica no histórico.${avisoPacote}`, confirmar: "Apagar", perigo: true }))) return;
    void apagar(false);
  }

  /** Apaga o horário. Com `comRecebimento`, apaga antes o pagamento lançado (e devolve ao estoque os produtos vendidos na conta). */
  async function apagar(comRecebimento: boolean) {
    if (somenteLeitura()) return;
    setOcupado(true);
    try {
      let extraAviso = "";
      if (comRecebimento) {
        let voltaram = 0, erroEstoque: string | null = null;
        for (const l of extra?.pago ?? []) {
          // se o lançamento é de um caixa já fechado, o banco recusa e o horário também fica como está
          const r = await desfazerVenda(sb, petshop.id, l);
          voltaram += r.devolvidos;
          erroEstoque = erroEstoque ?? r.erroEstoque;
        }
        extraAviso = ` ${oLancado.replace(/^./, (c) => c.toUpperCase())} de ${brl(lancado)} também ${recebido > 0 && aReceber > 0 ? "foram apagados" : aReceber > 0 ? "foi apagada" : "foi apagado"}${voltaram ? ` e ${voltaram === 1 ? "1 produto voltou" : `${voltaram} produtos voltaram`} para o estoque` : ""}.`;
        if (erroEstoque) avisarErro(`O recebimento foi apagado, mas os produtos não voltaram para o estoque. Acerte o saldo na tela de Estoque. (${erroEstoque})`);
      }
      ok(await sb.from("agendamentos").delete().eq("id", a.id).select("id"));
      const fotos = [a.foto_antes, a.foto_depois].filter((c): c is string => Boolean(c));
      if (fotos.length) void sb.storage.from("pets").remove(fotos);
      avisar(`Horário apagado.${extraAviso}${!comRecebimento && lancado > 0 ? ` ${oLancado.replace(/^./, (c) => c.toUpperCase())} de ${brl(lancado)} ${recebido > 0 && aReceber > 0 ? "continuam" : "continua"} no financeiro.` : ""}`);
      avisarMudanca(); aoMudar(); aoFechar();
    } catch (e) { avisarErro(e); avisarMudanca(); void recarregar(); } finally { setOcupado(false); }
  }

  /** Desmarcar (cancelar o atendimento): pede confirmação; se o horário se repete, pergunta se é só este ou este e os próximos. */
  async function pedirDesmarcar() {
    if (somenteLeitura()) return;
    if (a.serie_id) { setCancelando(true); return; }
    if (!(await confirmar({ titulo: "Desmarcar este horário?", texto: `${pet?.nome ?? "O pet"}, ${dataAmigavel(a.inicio)} às ${hora(a.inicio)}. O horário fica como cancelado no histórico e a vaga volta a ficar livre.`, confirmar: "Desmarcar horário", perigo: true }))) return;
    void mudar({ status: "cancelado" }, "Horário desmarcado.");
  }

  /** Falta: se o horário ainda não chegou, confirma antes (toque errado é comum). Depois de marcar, o aviso traz "Desfazer". */
  async function pedirFalta() {
    if (somenteLeitura()) return;
    if (new Date(a.inicio).getTime() > Date.now()
      && !(await confirmar({ titulo: "Marcar como falta?", texto: `O horário de ${pet?.nome ?? "este pet"} é ${dataAmigavel(a.inicio)} às ${hora(a.inicio)} e ainda não chegou. Se o cliente avisou que não vem, prefira Desmarcar horário.`, confirmar: "Marcar falta" }))) return;
    const antes = a.status;
    if (!(await mudar({ status: "faltou" }))) return;
    // taxa de falta ligada em Opções de cobrança: oferece anotar (quem decide é a pessoa)
    if (taxa > 0 && vejoFinanceiro && tutor?.id && (await confirmar({
      titulo: `Anotar a taxa de falta de ${brl(taxa)}?`,
      texto: `Fica na ficha de ${tutor.nome ?? "o tutor"} e em A receber. No próximo atendimento, aparece em Fechar a conta como "Deve de antes", para receber junto.`,
      confirmar: "Anotar a taxa", voltar: "Não cobrar",
    }))) void anotarTaxa();
    avisar(`${pet?.nome ?? "O pet"} ficou como falta.`, {
      rotulo: "Desfazer",
      fazer: () => {
        // só volta se ainda estiver como falta (ninguém mexeu de novo nesse meio-tempo)
        void sb.from("agendamentos").update({ status: antes }).eq("id", a.id).eq("petshop_id", petshop.id).eq("status", "faltou").select("id").then(({ data, error }) => {
          if (error || !data?.length) { avisarErro(error ?? new Error("Não deu para desfazer: o horário já mudou de novo.")); return; }
          avisar(`Desfeito: ${pet?.nome ?? "o pet"} voltou para ${STATUS_AGENDAMENTO[antes].rotulo.toLowerCase()}.`);
          avisarMudanca();
          aoMudar();
        });
      },
    });
  }

  /** Abre o "Recebi" de uma conta antiga do tutor (a linha inteira vem do banco, como na ficha). */
  async function abrirBaixa(id: string) {
    if (somenteLeitura()) return;
    const r = await sb.from("lancamentos").select("*").eq("id", id).eq("petshop_id", petshop.id).eq("pago", false).maybeSingle();
    if (r.error || !r.data) { avisarErro(r.error ?? new Error("Esta conta já foi recebida. Atualize a tela.")); void recarregar(); return; }
    setBaixando(r.data as Lancamento);
  }

  const taxa = taxaDeFalta(petshop);
  const opTaxa = useOperacao();
  /** Anota a taxa de falta para o tutor (uma vez só, mesmo com toque duplo). */
  const anotarTaxa = () => opTaxa.fazer(async (chave) => {
    if (!tutor?.id) return false;
    try {
      const vence = isoDia(somaDias(new Date(), 7));
      await lancarAReceber(sb, petshop.id, {
        valor: taxa, vencimento: vence, categoria: "Outros", clienteId: tutor.id, chave,
        descricao: `Taxa de falta ${dataCurta(new Date(a.inicio))}${pet?.nome ? ` (${pet.nome})` : ""}`,
      });
      avisar(`Taxa de falta de ${brl(taxa)} anotada para ${tutor.nome?.split(" ")[0] ?? "o tutor"}.`);
      avisarMudanca();
      return true;
    } catch (e) { avisarErro(e); return false; }
  });

  // horário que já começou (ou foi marcado depois, para anotar): lembrete e confirmação para o tutor não fazem sentido (achado da Neide)
  const jaPassou = new Date(a.inicio).getTime() < Date.now();
  const zap = linkWhatsApp(tutor?.telefone, textoLembrete({
    tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", sexo: pet?.sexo, servico: servicosPorExtenso(a), quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome,
  }));

  // remarcado de verdade? o banco anota quando o início muda (migração 20261166). Sem a função no banco, vale o de antes.
  const { dados: remarcadoEm } = useDados(async () => {
    const r = await sb.rpc("agendamento_remarcado_em", { p_id: a.id });
    return r.error ? "?" : (r.data as string | null);
  }, [a.id, a.inicio]);
  const foiRemarcado = remarcadoEm === "?" || Boolean(remarcadoEm);
  // marcado há pouco e ainda sem lembrete: a mensagem certa é a confirmação, não a remarcação
  const recemMarcado = !foiRemarcado && remarcadoEm !== undefined && !a.lembrete_em && Date.now() - new Date(a.criado_em).getTime() < 864e5;
  const zapConfirmacao = recemMarcado ? linkWhatsApp(tutor?.telefone, textoConfirmacao({
    tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", sexo: pet?.sexo, servico: servicosPorExtenso(a), quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome,
  })) : null;

  // remarcou ou cancelou: a mensagem para o tutor já vem pronta (quem manda é a pessoa, pelo WhatsApp)
  const zapRemarcado = linkWhatsApp(tutor?.telefone, textoRemarcado({
    tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", sexo: pet?.sexo, servico: servicosPorExtenso(a), quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome,
  }));
  const zapCancelado = linkWhatsApp(tutor?.telefone, textoCancelado({ tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", sexo: pet?.sexo, quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop: petshop.nome }));

  const zapPronto = linkWhatsApp(tutor?.telefone, textoPronto({ tutor: tutor?.nome, pet: pet?.nome ?? "seu pet", sexo: pet?.sexo, petshop: petshop.nome, servico: servicosPorExtenso(a) }));

  // comprovante: só para quem vê o financeiro, com o atendimento concluído, a conta toda recebida e telefone na ficha.
  // Com o que entrou junto para o fiado (e o troco), pelo banco: sem isso, o comprovante diria só a conta do horário.
  const comComprovante = vejoFinanceiro && a.status === "concluido" && recebidos.length > 0 && !devidos.length;
  const { dados: doComprovante } = useDados(async () => {
    if (!comComprovante) return null;
    const r = await sb.rpc("comprovante_do_agendamento", { p_agendamento: a.id });
    return r.error ? null : (r.data as { entregue: number | null; antigas: AntigaNoComprovante[] } | null);
  }, [a.id, comComprovante, recebidos.length]);
  const textoDoComprovante = () => textoComprovante({ petshop: petshop.nome, tutor: tutor?.nome, pet: pet?.nome, servico: nomeDosServicos(a), quando: a.inicio, recebidos,
    antigas: doComprovante?.antigas ?? null, entregue: doComprovante?.entregue ?? null });
  const zapComprovante = comComprovante && soDigitos(tutor?.telefone).length >= 8 ? linkWhatsApp(tutor?.telefone, textoDoComprovante()) : null;
  // o mesmo comprovante no papel (não precisa de telefone na ficha)
  const comprovanteNoPapel = comComprovante;

  if (comanda) {
    return <Comanda agendamento={a} pacote={comanda === "sim" ? null : comanda} aoFechar={() => setComanda(false)} aoPronto={() => { aoMudar(); aoFechar(); }} />;
  }

  if (cobrandoDiferenca && diferenca > 0.005) {
    return <CobrarDiferenca agendamento={a} valor={diferenca} aoFechar={() => setCobrandoDiferenca(false)} aoPronto={async () => { setCobrandoDiferenca(false); await recarregar(); aoMudar(); }} />;
  }

  if (anotandoFalta && tutor?.id) {
    return <FolhaLancamento modo="conta" tipo="entrada" tutor={{ id: tutor.id, nome: tutor.nome ?? "Tutor" }} aoFechar={() => setAnotandoFalta(false)} aoSalvo={async () => { setAnotandoFalta(false); await recarregar(); aoMudar(); }} />;
  }

  if (baixando) {
    return <FolhaBaixa conta={baixando} aoFechar={() => setBaixando(null)} aoSalvo={async () => { await recarregar(); aoMudar(); }} />;
  }

  if (apagando) {
    const comProdutos = (extra?.pago ?? []).reduce((n, l) => n + produtosDaVenda(l).length, 0);
    return (
      <Folha titulo={recebido > 0 ? "Apagar um horário que já foi pago" : "Apagar um horário com conta a receber"} aoFechar={() => setApagando(false)}
        rodape={<button className="g-btn sec" disabled={ocupado} onClick={() => setApagando(false)}>Voltar</button>}>
        <div className="g-pilha">
          <p className="g-aviso" style={{ margin: 0 }}>
            <span>
              {recebido > 0 && <>Este horário tem um pagamento de <b>{brl(recebido)}</b> lançado{formasDoRecebido ? ` (${formasDoRecebido})` : ""}. </>}
              {aReceber > 0 && <>{recebido > 0 ? "Também tem" : "Este horário tem"} uma conta de <b>{brl(aReceber)}</b> que o cliente ficou de pagar depois. </>}
              O que fazer?
            </span>
          </p>
          <p className="g-muted g-p">
            {pet?.nome ?? "O pet"}, {dataAmigavel(a.inicio)} às {hora(a.inicio)}. O horário some da agenda e não dá para desfazer.
            {comProdutos > 0 ? ` Se apagar ${oLancado}, ${comProdutos === 1 ? "o produto vendido nesta conta volta" : "os produtos vendidos nesta conta voltam"} para o estoque.` : ""}
            {avisoPacote}
          </p>
          <div className="g-pilha p">
            <button className="g-btn perigo cheio" disabled={ocupado} onClick={() => void apagar(true)}>Apagar o horário e {oLancado} de {brl(lancado)}</button>
            <button className="g-btn sec cheio" disabled={ocupado} onClick={() => void apagar(false)}>Apagar só o horário e manter {oLancado}</button>
          </div>
          <p className="g-muted g-pp">
            {recebido > 0 ? "Mantendo o recebimento, o dinheiro continua no caixa e no financeiro, sem ligação com a agenda." : ""}
            {aReceber > 0 ? " Mantendo a conta a receber, ela continua em Financeiro, A receber, e na ficha do tutor." : ""}
          </p>
        </div>
      </Folha>
    );
  }

  if (cancelando) {
    return (
      <Folha titulo="Desmarcar um horário que se repete" aoFechar={() => setCancelando(false)}
        rodape={<button className="g-btn sec" onClick={() => setCancelando(false)}>Voltar</button>}>
        <div className="g-pilha">
          <p className="g-muted">
            {pet?.nome ?? "Este pet"} tem este horário marcado para se repetir. Os que já foram atendidos continuam no histórico.
          </p>
          <div className="g-pilha p">
            <button className="g-btn sec cheio" disabled={ocupado} onClick={() => void mudar({ status: "cancelado" }, "Horário desmarcado.").then((deu) => deu && setCancelando(false))}>Desmarcar só este</button>
            <button className="g-btn perigo cheio" disabled={ocupado} onClick={() => void cancelarDaquiEmDiante()}>Desmarcar este e os próximos</button>
          </div>
        </div>
      </Folha>
    );
  }

  return (
    <Folha titulo={`${hora(a.inicio)} · ${dataLonga(a.inicio)}`} aoFechar={aoFechar}>
      <div className="g-pilha">
        <div className="g-fila">
          {pet && <AvatarPet pet={pet} tamanho="g" />}
          <div className="g-cresce">
            <h2>{pet?.nome ?? "Pet"}</h2>
            <p className="g-muted g-p">{[tutor?.nome, pet?.raca, pet?.porte ? `porte ${pet.porte}` : null].filter(Boolean).join(" · ")}</p>
            {tutor?.telefone && <p className="g-muted g-pp">{fmtTelefone(tutor.telefone)}</p>}
          </div>
          <div className="g-pilha p" style={{ justifyItems: "end" }}>
            {faltaCobrar ? <span className="g-tag laranja">Concluído, falta cobrar</span>
              : semCobranca(a) && !lancado ? <MarcaSemCobranca a={a} />
              : a.status === "concluido" && vejoFinanceiro && diferenca > 0.005 ? <span className="g-tag laranja">Concluído, falta a diferença</span>
              : <span className={`g-tag ${st.tom}`}>{st.rotulo}{a.status === "concluido" && vejoFinanceiro && sabe && recebido > 0 && !aReceber ? " e pago" : ""}</span>}
            {a.serie_id && <span className="g-tag azul"><Repeat size={12} aria-hidden />Repete</span>}
          </div>
        </div>

        {pet?.alertas && <p className="g-aviso" style={{ margin: 0 }}>{pet.alertas}</p>}
        {pet && a.status !== "cancelado" && <AvisoPacoteAcabando petId={pet.id} />}
        {vejoFinanceiro && deveAntes > 0.005 && a.status !== "cancelado" && (
          <p className="g-aviso g-agd-deve" style={{ margin: 0 }} role="status">
            <span>
              <b>{tutor?.nome?.split(" ")[0] ?? "O tutor"} deve {brl(deveAntes)} de antes</b>{" "}
              ({(extra?.antigas ?? []).map((l) => l.descricao?.trim() || l.categoria).join(", ")}).{" "}
              {pago ? "Para receber, use O cliente pagou ou a ficha do tutor." : pacote && !encerrado ? "Usando o pacote, a conta não abre: se ele for pagar agora, receba aqui." : "Em Fechar a conta dá para incluir e receber junto."}
            </span>
          </p>
        )}
        {/* concluir pelo pacote fecha sem tela de conta: o que ele devia de antes dá para receber aqui mesmo */}
        {vejoFinanceiro && deveAntes > 0.005 && pacote && !pago && !encerrado && (
          <div className="g-fila" style={{ flexWrap: "wrap", gap: 8 }} role="group" aria-label="Receber o que deve de antes">
            {(extra?.antigas ?? []).slice(0, 4).map((l) => (
              <button key={l.id} type="button" className="g-btn verde p" disabled={ocupado} onClick={() => void abrirBaixa(l.id)}>
                <HandCoins />{(extra?.antigas ?? []).length === 1 ? `Receber agora · ${brl(l.valor)}` : `Receber ${l.descricao?.trim() || l.categoria} · ${brl(l.valor)}`}
              </button>
            ))}
          </div>
        )}

        <div className="g-card liso g-pilha p">
          <div className="g-fila entre"><span className="g-muted">{outros.length ? "Serviços" : "Serviço"}</span><b style={{ textAlign: "right" }}>{nomeDosServicos(a) ?? "A definir"}</b></div>
          <div className="g-fila entre"><span className="g-muted">Horário</span><b className="g-tab">{hora(a.inicio)} às {hora(a.fim)}</b></div>
          {a.profissionais && <div className="g-fila entre"><span className="g-muted">Com</span><b>{a.profissionais.nome}</b></div>}
          {/* valores só para quem recebe: quem só atende vê o serviço, o horário e quem atende */}
          {vejoFinanceiro && <div className="g-fila entre"><span className="g-muted">{outros.length ? "Valor total" : "Valor"}</span><b className="g-tab">{total != null ? brl(total) : "A definir"}{pago && !lancado ? " · pago" : ""}</b></div>}
          {promoDoHorario.promo && (
            <LinhaPromo promo={promoDoHorario.promo} valor={vejoFinanceiro ? promoValor : null} ocupado={promoDoHorario.ocupado}
              podeMudar={!encerrado && !lancado && (posso("agenda") || vejoFinanceiro)} aoTirar={() => void promoDoHorario.tirar()} aoPorDeVolta={() => void promoDoHorario.porDeVolta()} />
          )}
          {vejoFinanceiro && outros.length > 0 && (
            <ul className="g-agd-servicos" aria-label="Valor de cada serviço">
              <li><span>{a.servicos?.nome ?? "Serviço"}</span><b className="g-tab">{a.pacote_cliente_id ? "pelo pacote" : a.preco != null ? brl(a.preco) : "a definir"}</b></li>
              {outros.map((o) => <li key={o.id}><span>{o.servicos?.nome ?? "Serviço"}</span><b className="g-tab">{o.preco != null ? brl(o.preco) : "a definir"}</b></li>)}
            </ul>
          )}
          {semCobranca(a) && !lancado && (
            <div className="g-fila entre"><span className="g-muted">Cobrança</span><b style={{ textAlign: "right" }}>Não cobrado{a.sem_cobranca_nome ? ` · por ${a.sem_cobranca_nome.split(" ")[0]}` : ""}{a.sem_cobranca_em ? ` em ${dataCurta(new Date(a.sem_cobranca_em))} às ${hora(a.sem_cobranca_em)}` : ""}</b></div>
          )}
          {semCobranca(a) && !lancado && a.profissionais && <p className="g-pp g-muted" style={{ margin: 0 }}>Não cobrar não muda a comissão de {a.profissionais.nome.split(" ")[0]}: ela conta o preço da agenda.</p>}
          {(extra?.mexidas ?? []).map((m) => (
            <p key={m.id} className="g-pp g-muted" style={{ margin: 0 }}>
              {m.tipo === "servico_tirado" ? `Tirado da conta: ${m.item}${m.de != null ? ` (${brl(m.de)})` : ""}`
                : m.tipo === "atendimento_baixou" ? `Mudou depois de concluído: ${m.item}, de ${brl(m.de ?? 0)} para ${brl(m.para)}`
                : m.tipo === "atendimento_reaberto" ? `Voltou para marcado depois de concluído (${brl(m.de ?? 0)})`
                : `Marcado abaixo da lista: ${m.item} por ${brl(m.para)}${m.de != null ? ` (lista ${brl(m.de)})` : ""}`}
              {m.quem_nome ? ` · por ${m.quem_nome.split(" ")[0]}` : ""} em {dataCurta(new Date(m.quando))} às {hora(m.quando)}.
            </p>
          ))}
          {vejoFinanceiro && recebido > 0 && <div className="g-fila entre"><span className="g-muted">Recebido</span><b className="g-tab g-verde-t">{brl(recebido)}{formasDoRecebido ? ` · ${formasDoRecebido}` : ""}</b></div>}
          {vejoFinanceiro && (extra?.diferencaCobrada ?? 0) > 0 && <div className="g-fila entre"><span className="g-muted">Diferença recebida</span><b className="g-tab g-verde-t">{brl(extra!.diferencaCobrada)}</b></div>}
          {vejoFinanceiro && (extra?.diferencaCobrada ?? 0) > 0 && lancado > 0 && <div className="g-fila entre"><span className="g-muted">Total cobrado</span><b className="g-tab">{brl(Math.round((lancado + extra!.diferencaCobrada) * 100) / 100)}</b></div>}
          {devidos.map((l) => (
            <div className="g-fila entre" key={l.id}>
              <span className="g-muted">A receber</span>
              <b className="g-tab g-agd-areceber">{brl(l.valor)}{l.vencimento ? ` · ${l.vencimento < isoDia(new Date()) ? "venceu" : "paga"} ${dataAmigavel(l.vencimento) === "hoje" || dataAmigavel(l.vencimento) === "amanhã" || dataAmigavel(l.vencimento) === "ontem" ? dataAmigavel(l.vencimento) : `em ${dataCompleta(l.vencimento)}`}` : ""}</b>
            </div>
          ))}
          {a.pacote_cliente_id && <div className="g-fila entre"><span className="g-muted">Pagamento</span><b>{outros.length ? `${a.servicos?.nome ?? "Serviço"} pelo pacote` : "Pelo pacote"}</b></div>}
          {a.leva_traz && <div className="g-fila"><Truck size={18} /><span>Leva e traz{a.endereco_leva_traz ? `: ${a.endereco_leva_traz}` : ""}</span></div>}
          {tutor && <FidelidadeNoHorario clienteId={tutor.id} />}
          {a.obs && <p className="g-p">{a.obs}</p>}
          <AceiteDoLink agendamentoId={a.id} />
        </div>
        {a.serie_id && extra?.fimDaSerie && !encerrado && (
          <p className="g-pp g-muted" style={{ margin: 0 }}>
            <Repeat size={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />
            {extra.semFim
              ? <>Repete até você cancelar. Os horários estão marcados até {dataCompleta(extra.fimDaSerie)}. <button type="button" className="g-link" disabled={ocupado} onClick={() => void continuarRepeticao(extra.fimDaSerie!)}>Marcar mais {VEZES_POR_VEZ}</button></>
              : mesmoDia(new Date(extra.fimDaSerie), new Date(a.inicio)) ? "Este é o último horário da repetição. Para continuar, marque de novo com Repetir." : `A repetição vai até ${dataCompleta(extra.fimDaSerie)}.`}
          </p>
        )}

        {(a.status === "em_atendimento" || Object.values(checklist).some(Boolean)) && (
          <div className="g-campo"><span>Como o pet chegou</span>
            <div className="g-chips">
              {CHECKLIST_BANHO.map((c) => (
                <button key={c.id} type="button" className="g-chip" aria-pressed={Boolean(checklist[c.id])} disabled={encerrado}
                  onClick={() => { const novo = { ...checklist, [c.id]: !checklist[c.id] }; setChecklist(novo); void mudar({ checklist: novo }); }}>{c.rotulo}</button>
              ))}
            </div>
          </div>
        )}

        {visitaDaEntrada && a.status !== "cancelado" && a.status !== "faltou" && (
          <EntradaNaVisita visita={visitaDaEntrada} saida={a.status === "em_atendimento" || a.status === "concluido"} mostrarSemEntrada={a.status === "em_atendimento"} />
        )}
        {chegou && visitaDaEntrada && <EntradaNaChegada visita={visitaDaEntrada} aoFechar={() => setChegou(false)} />}

        {comFotos && <AntesDepois agendamento={a} aoMudar={aoMudar} />}
        {(a.status === "em_atendimento" || a.status === "concluido") && pet && (
          <BotaoBoletim classe="g-btn sec cheio" visita={{ tipo: "banho", agendamentoId: a.id, petId: pet.id, pet: pet.nome, tutor: tutor ? { nome: tutor.nome, telefone: tutor.telefone } : null, servicos: servicosPorExtenso(a) }} />
        )}

        {!encerrado && (
          <div className="g-pilha p">
            {a.status === "marcado" && <button className="g-btn verde cheio" disabled={ocupado} onClick={() => void mudar({ status: "confirmado" }, "Horário confirmado.")}><Check />Cliente confirmou</button>}
            {(a.status === "marcado" || a.status === "confirmado") && <button className="g-btn sec cheio" disabled={ocupado} onClick={() => void mudar({ status: "em_atendimento" }, `${pet?.nome ?? "Pet"} em atendimento.`).then((deu) => deu && setChegou(true))}><Play />Chegou: iniciar atendimento</button>}
            {!sabe && <ContaCarregando erro={erroExtra} aoTentar={() => void recarregar()} vejoFinanceiro={vejoFinanceiro} />}
            {/* pet com pacote que cobre este serviço: usar o pacote vem primeiro, para ninguém cobrar duas vezes */}
            {sabe && pacote && !pago && (
              <>
                <p className="g-aviso" style={{ margin: 0 }} role="status">
                  <span><b>{pet?.nome ?? "Este pet"} tem pacote para {outros.length ? a.servicos?.nome ?? "o primeiro serviço" : "este serviço"}</b> ({pacote.nome}: {pacote.total - pacote.usados === 1 ? "sobra 1 uso" : `sobram ${pacote.total - pacote.usados} usos`} de {pacote.total}). Use o pacote para não cobrar de novo.{outros.length ? ` ${outros.length === 1 ? "O outro serviço entra" : "Os outros serviços entram"} na conta normalmente.` : ""}</span>
                </p>
                {outros.length > 0 && vejoFinanceiro
                  ? <button className="g-btn pri cheio" disabled={ocupado || !sabe} onClick={() => { if (!somenteLeitura()) setComanda(pacote); }}><Check />Usar o pacote e cobrar o resto{valorOutros ? ` · ${brl(valorOutros)}` : ""}</button>
                  : <button className="g-btn pri cheio" disabled={ocupado} onClick={() => void usarPacote(pacote)}><Check />{outros.length ? "Concluir usando o pacote (o resto fica para o caixa cobrar)" : "Concluir usando o pacote (sem cobrar)"}</button>}
              </>
            )}
            {sabe && vejoFinanceiro && !pago && (
              <button className={`g-btn ${pacote ? "sec" : "pri"} cheio`} disabled={ocupado || !sabe} onClick={() => { if (!somenteLeitura()) setComanda("sim"); }}>
                <Receipt />{pacote ? "Cobrar à parte, sem usar o pacote" : "Fechar a conta"}{aCobrar ? ` · ${brl(Math.max(0, Math.round((aCobrar - promoValor) * 100) / 100))}` : ""}
              </button>
            )}
            {sabe && (!vejoFinanceiro || pago) && <button className={`g-btn ${pacote && !pago ? "sec" : "pri"} cheio`} disabled={ocupado} onClick={() => void conferirDiaDoHorario(a.inicio, confirmar).then((sim) => sim && mudar({ status: "concluido" }, "Atendimento concluído.")).then((deu) => deu && aoFechar())}><Check />{pacote && !pago ? "Concluir sem usar o pacote" : "Concluir atendimento"}</button>}
          </div>
        )}
        {faltaCobrar && (
          <p className="g-aviso" style={{ margin: 0 }} role="status">
            <span>{vejoFinanceiro
              ? <><b>Este atendimento foi concluído, mas a conta não foi fechada.</b> Nada entrou no caixa nem ficou em A receber.</>
              : <><b>Concluído, falta cobrar.</b> Quem cuida do caixa fecha a conta deste atendimento.</>}</span>
          </p>
        )}
        {a.status === "concluido" && vejoFinanceiro && !sabe && <ContaCarregando erro={erroExtra} aoTentar={() => void recarregar()} vejoFinanceiro />}
        {a.status === "concluido" && vejoFinanceiro && sabe && !pago && (
          <button className="g-btn pri cheio" disabled={!sabe} onClick={() => { if (!somenteLeitura()) setComanda("sim"); }}><Receipt />Fechar a conta{aCobrar ? ` · ${brl(aCobrar)}` : ""}</button>
        )}
        {vejoFinanceiro && a.status === "concluido" && diferenca > 0.005 && (
          <p className="g-aviso" style={{ margin: 0 }} role="status">
            <span><b>Faltam {brl(diferenca)}.</b> O horário está em {brl(aCobrar ?? 0)} e a conta fechada foi de {brl(daConta + (extra?.diferencaCobrada ?? 0))}: o valor mudou depois de a conta ser fechada. A comissão e os relatórios seguem o que foi cobrado: quando você receber a diferença, ela entra neste atendimento.</span>
          </p>
        )}
        {vejoFinanceiro && a.status === "concluido" && diferenca > 0.005 && (
          <button type="button" className="g-btn pri cheio" disabled={ocupado} onClick={() => { if (!somenteLeitura()) setCobrandoDiferenca(true); }}><Receipt />Cobrar a diferença · {brl(diferenca)}</button>
        )}

        {devidos.length > 0 && (
          <button className="g-btn verde cheio" disabled={ocupado} onClick={() => { if (!somenteLeitura()) setBaixando(devidos[0]); }}>
            <Receipt />O cliente pagou: receber {brl(devidos[0].valor)}
          </button>
        )}

        {zapComprovante && (
          <a className="g-btn sec cheio" href={zapComprovante} target="_blank" rel="noopener noreferrer"><Receipt />Mandar comprovante</a>
        )}
        {comprovanteNoPapel && (
          <button type="button" className="g-btn fantasma cheio" onClick={() => imprimirComprovante(textoDoComprovante())}>
            <Printer />Imprimir comprovante
          </button>
        )}

        {podeAvisarPronto && (zapPronto ? (
          <a className="g-btn zap cheio" href={zapPronto} target="_blank" rel="noopener noreferrer"
            onClick={() => { const agora = new Date().toISOString(); void mudar({ pronto_avisado_em: agora }).then((deu) => deu && setAvisadoEm(agora)); }}>
            {avisadoEm ? <><BellRing />Avisado às {hora(avisadoEm)}</> : <><MessageCircle />Avisar que terminou</>}
          </a>
        ) : <p className="g-pp g-muted">Sem telefone do tutor para avisar que o atendimento de {pet?.nome ?? "o pet"} terminou.</p>)}

        <div className="g-fila">
          {a.status === "cancelado" || a.status === "faltou" || a.status === "concluido" ? null : jaPassou ? (
            a.status !== "em_atendimento" && <p className="g-pp g-muted g-cresce" data-teste="ja-passou">Este horário já passou: não precisa de lembrete nem de confirmação.</p>
          ) : zap ? (
            <a className={`g-btn ${podeAvisarPronto && zapPronto ? "sec" : "zap"} g-cresce`} href={zap} target="_blank" rel="noopener noreferrer" onClick={() => { void mudar({ lembrete_em: new Date().toISOString() }).then(recarregar); }}>
              <MessageCircle />{a.lembrete_em ? "Lembrar de novo" : "Lembrete no WhatsApp"}
            </a>
          ) : <p className="g-pp g-muted g-cresce">Sem telefone do tutor para mandar o lembrete.</p>}
          {pet && posso("clientes") && <Link className="g-btn sec" href={`/gestao/app/clientes?pet=${pet.id}`}>Ver ficha</Link>}
        </div>
        {a.lembrete_em && <p className="g-pp g-muted">Lembrete aberto {dataAmigavel(a.lembrete_em)} às {hora(a.lembrete_em)}.</p>}
        {(a.status === "marcado" || a.status === "confirmado") && !jaPassou && foiRemarcado && zapRemarcado && (
          <div className="g-fila">
            <a className="g-btn sec g-cresce" href={zapRemarcado} target="_blank" rel="noopener noreferrer"><MessageCircle />Avisar remarcação</a>
          </div>
        )}
        {(a.status === "marcado" || a.status === "confirmado") && !jaPassou && zapConfirmacao && (
          <div className="g-fila">
            <a className="g-btn sec g-cresce" href={zapConfirmacao} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar confirmação</a>
          </div>
        )}
        {/* faltou e não há taxa de falta definida: diz onde definir, e dá para anotar agora */}
        {a.status === "faltou" && vejoFinanceiro && !(taxa > 0) && (
          <div className="g-card liso g-pilha p" role="note">
            <p className="g-pp" style={{ margin: 0 }}>
              Quer cobrar taxa de falta?{" "}
              {souDono ? <>Defina o valor em <Link className="g-link" href="/gestao/app/meu-petshop#opcoes-cobranca">Opções de cobrança</Link>: da próxima vez, o Faltou já pergunta se quer anotar.</> : "O dono define o valor em Meu pet shop, Opções de cobrança."}
            </p>
            {tutor?.id && <div><button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setAnotandoFalta(true); }}><HandCoins />Anotar o que {tutor.nome?.split(" ")[0] ?? "o tutor"} deve</button></div>}
          </div>
        )}
        {a.status === "cancelado" && (zapCancelado
          ? <a className="g-btn zap cheio" href={zapCancelado} target="_blank" rel="noopener noreferrer"><MessageCircle />Avisar cancelamento</a>
          : <p className="g-pp g-muted">Sem telefone do tutor para avisar do cancelamento.</p>)}

        <hr className="g-sep" />
        <div className="g-fila">
          {!encerrado && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) aoEditar(); }}><CalendarClock />Remarcar ou alterar</button>}
          {!encerrado && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void pedirFalta()}><UserX />Faltou</button>}
          {!encerrado && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void pedirDesmarcar()}><CalendarX />Desmarcar horário</button>}
          {encerrado && podeReabrir && <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void reabrir()}>Voltar para marcado</button>}
        </div>
        {/* a lixeira fica sozinha, longe de Desmarcar, para não apagar por engano */}
        <div className="g-agd-apagar">
          {!sabe ? null : !podeApagar
            ? <p className="g-pp g-muted">{porQueNao}</p>
            : <button className="g-btn fantasma p" disabled={ocupado} onClick={() => void pedirApagar()}><Trash2 />Apagar da agenda</button>}
        </div>
      </div>
    </Folha>
  );
}

/** Enquanto a conta do horário não chegou inteira (pago? pacote? deve de antes?), nada de cobrar: só o aviso, ou o erro e tentar de novo. */
function ContaCarregando({ erro, aoTentar, vejoFinanceiro }: { erro: string | null; aoTentar: () => void; vejoFinanceiro: boolean }) {
  if (erro) {
    return (
      <div className="g-card areia g-pilha p" role="alert">
        <p className="g-p" style={{ margin: 0 }}><b>Não consegui buscar a conta deste horário</b> (se já foi pago, o pacote ou o que o tutor deve). Sem isso dava para cobrar errado, então os botões de cobrar ficam escondidos.</p>
        <div><button type="button" className="g-btn sec p" onClick={aoTentar}>Tentar de novo</button></div>
      </div>
    );
  }
  return (
    <div className="g-card areia g-ht-carregando g-agd-carregando" role="status" aria-live="polite">
      <span className="g-spin" aria-hidden />
      <p className="g-p">{vejoFinanceiro ? "Carregando a conta: vendo se já foi pago, se tem pacote e se o tutor deve de antes…" : "Carregando…"}</p>
    </div>
  );
}

/**
 * Atendimento já pago que ficou mais caro (reabriu e mudou o serviço ou o valor): recebe a diferença na hora, numa entrada à
 * parte com o nome do pet, ligada ao atendimento (`lancamentos.diferenca_de`, que o banco preenche pela marca do item e confere:
 * a diferença não entra duas vezes). A comissão, os relatórios e o horário somam a conta fechada e a diferença.
 */
function CobrarDiferenca({ agendamento: a, valor, aoFechar, aoPronto }: { agendamento: AgendamentoCompleto; valor: number; aoFechar: () => void; aoPronto: () => void | Promise<void> }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [pagamento, setPagamento] = usePagamento();
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useCaixaAberto();
  const op = useOperacao();
  const anotarParcelas = useAnotarParcelas();
  const servicos = nomeDosServicos(a) ?? "Atendimento";
  const receber = () => op.fazer(async (chave) => {
    const pg = fecharPagamento(pagamento, valor);
    if ("erro" in pg) { setErro(pg.erro); avisarErro(pg.erro); return false; }
    if (!(await conferirCaixa(sb, petshop.id, confirmar))) return false;
    try {
      const item = { tipo: "extra", nome: `Diferença de ${servicos}`, qtd: 1, valor, diferenca_de: a.id } as ItemLancamento;
      const lancado = await lancarPago(sb, petshop.id, {
        tipo: "entrada", valor, forma: pg.forma, pagamentos: pg.pagamentos, categoria: a.servicos?.categoria === "creche" || a.servicos?.categoria === "hotel" ? "Creche e hotel" : "Banho e tosa",
        clienteId: a.pets?.clientes?.id ?? null, descricao: `Diferença: ${servicos} · ${a.pets?.nome ?? "pet"} (${dataCurta(new Date(a.inicio))})`.slice(0, 200), itens: [item], chave,
      });
      // crédito parcelado: em quantas vezes (tenta de novo e avisa se não der; a diferença já entrou)
      await anotarParcelas([lancado.id], pagamento.parcelas);
      avisar(`Diferença de ${brl(valor)} recebida.`);
      avisarMudanca();
      await aoPronto();
      return true;
    } catch (e) { avisarErro(e); return false; }
  });
  return (
    <ParcelasNaTela.Provider value>
    <Folha titulo="Cobrar a diferença" aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button><button type="button" className="g-btn pri" disabled={op.ocupado} onClick={() => void receber()}>Receber {brl(valor)}</button></>}>
      <div className="g-form">
        <p className="g-p">{a.pets?.nome ?? "O pet"}, {servicos}, {dataAmigavel(a.inicio)}. O horário ficou mais caro depois de a conta ser fechada: faltam <b className="g-tab">{brl(valor)}</b>.</p>
        <EscolhaPagamento valor={pagamento} aoMudar={(e) => { setPagamento(e); setErro(null); }} total={valor} erro={erro} />
        <AvisoCaixaFechado aberto={caixa} />
        <p className="g-pp g-muted">Entra no caixa de hoje como uma entrada à parte, com o nome do pet, ligada a este atendimento: a comissão e os relatórios passam a contar a conta fechada mais a diferença.</p>
      </div>
    </Folha>
    </ParcelasNaTela.Provider>
  );
}
