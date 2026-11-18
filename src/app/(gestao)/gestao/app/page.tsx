"use client";

import { CATEGORIAS_DEVOLUCAO } from "@/lib/gestao/faturamento";
import { lerDadosDoHoje } from "@/components/gestao/hoje-dados";
import { BellRing, CalendarCheck2, CalendarX, UserX } from "lucide-react";
import { CATEGORIA_MENSALIDADE, experienciaDe, juntar, lerExperiencias, resumoDaCrecheHoje } from "@/lib/gestao/creche";
import ChamadaDeHoje from "@/components/gestao/creche/chamada-hoje";

import { Marca, Selo } from "@/components/gestao/marca";
import { Anel, Barras, Kpi, Ranking, Tendencia, Tile, type Tom } from "@/components/gestao/painel";
import { useState } from "react";
import FimDoTeste, { DIAS_DE_AVISO, ProgressoDoTeste, chaveAgoraNao, fimDoTeste } from "@/components/gestao/fim-do-teste";
import PrimeirosPassos, { usePrimeirosPassos } from "@/components/gestao/primeiros-passos";
import ResumoSemana, { temSemanaPassada } from "@/components/gestao/resumo-semana";
import { guardarLembrado, lerLembrado } from "@/components/gestao/lembrado";
import Link from "@/components/gestao/link-depois";
import { ShoppingBag, BedDouble, Camera, FileSpreadsheet, Cake, CalendarDays, Check, HandCoins, HeartPulse, ChevronRight, MessageCircle, Mic, Package, PawPrint, Plus, Receipt, Scissors, Sparkles, Ticket, UserSearch, Wallet } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { nomeDosServicos } from "@/lib/gestao/servicos-do-horario";
import { alertaCurto } from "@/lib/gestao/quadro";
import { nomeNaEquipe } from "@/lib/gestao/util";

import { brl, dataAmigavel, dataLonga, hora, inicioDaSemana, inicioDoDia, isoDia, nomeDiaCurto, saudacao, soDigitos, somaDias } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { fraseDoDiaFechado } from "@/lib/gestao/feriados";
import { useCalendario } from "@/components/gestao/calendario";
import { frenteDe, nomeDaCasa, principalDe, usaCasa, usaModulo } from "@/lib/gestao/modulos";
import { ChegamESaem, FrenteDaLoja, RecebidoNaSemana, ROTA_VENDER, pedidosDaFrente } from "@/components/gestao/hoje-frente";
import { AvatarPet, Esqueleto, LinkDeGravar, Vazio, abrirAssistente, useAdiantar, useDados } from "@/components/gestao/ui";
import dynamic from "next/dynamic";
import { ErroDeTeste } from "@/components/gestao/erros";
import LinkRapido from "@/components/gestao/agenda/link-rapido";
import BomDia from "@/components/gestao/bom-dia";
import { fraseDaContaFixa, lerAvisosContasFixas } from "@/lib/gestao/contas-fixas";
import ChamarDeVolta, { aniversariantes, buscarParaChamar, chamadoEm, lerChamados, quemSumiu, type AbaChamar, type GrupoChamar } from "@/components/gestao/clientes/chamar-de-volta";
import LembretesDoDia, { BotaoLembrete } from "@/components/gestao/agenda/lembretes";
import { AtendimentosParaCobrar, MarcaSemCobranca, semCobranca, useParaCobrar } from "@/components/gestao/agenda/para-cobrar";
import type { ResumoDaValidade, VagaNaEspera } from "@/components/gestao/hoje-sensores";

// folhas que só abrem com um toque: vêm à parte e baixam depois que a tela abriu (useAdiantar)
const carregarDetalhe = () => import("@/components/gestao/agenda/detalhe-agendamento");
const carregarForm = () => import("@/components/gestao/agenda/form-agendamento");
const DetalheAgendamento = dynamic(carregarDetalhe, { ssr: false });
const FormAgendamento = dynamic(carregarForm, { ssr: false });
const Importar = dynamic(() => import("@/components/gestao/importar"), { ssr: false });
const FotoCaderno = dynamic(() => import("@/components/gestao/caderno"), { ssr: false });
// pedidos pelo link: o cartão só aparece quando há pedido (até lá, nada na tela); vem à parte e não segura a tela
const PedidosLink = dynamic(() => import("@/components/gestao/agenda/pedidos-link"), { ssr: false });
// cartões de baixo da tela e de quem tem a área (meta, meu mês, comissão, alterações, ocorrências, dicas) e as leituras de
// fundo que moram em módulos grandes (lista de espera do hotel, validade): vêm à parte, para o primeiro pacote da Hoje ser
// menor no celular com internet fraca. Os cartões aparecem quando chegam; o que mostram não muda.
const EntradaModoEnvio = dynamic(() => import("@/components/gestao/modo-envio-entrada"), { ssr: false });
const MetaMes = dynamic(() => import("@/components/gestao/meta-mes"), { ssr: false });
const MeuMes = dynamic(() => import("@/components/gestao/meu-mes"), { ssr: false });
const MinhaComissao = dynamic(() => import("@/components/gestao/minha-comissao"), { ssr: false });
// o dia de quem atende (tosador, banhista) e as doses de agora de quem cuida da creche e do hotel
const MeuDia = dynamic(() => import("@/components/gestao/agenda/meu-dia"), { ssr: false });
const CuidadosDeAgora = dynamic(() => import("@/components/gestao/hotel/cuidados-de-agora"), { ssr: false });
const DicasMozart = dynamic(() => import("@/components/gestao/dicas-mozart"), { ssr: false });
const AlteracoesDeValores = dynamic(() => import("@/components/gestao/financeiro/alteracoes-de-valores"), { ssr: false });
const OcorrenciasDeHoje = dynamic(() => import("@/components/gestao/casa/ocorrencias").then((m) => m.OcorrenciasDeHoje), { ssr: false });
const SensorDaEspera = dynamic(() => import("@/components/gestao/hoje-sensores").then((m) => m.SensorDaEspera), { ssr: false });
const SensorDaValidade = dynamic(() => import("@/components/gestao/hoje-sensores").then((m) => m.SensorDaValidade), { ssr: false });
const SEM_VAGA: VagaNaEspera = { n: 0, nomes: [] };
const SEM_VALIDADE: ResumoDaValidade = { vencidos: [], em30: [], perto: new Map() };

const PEDIDOS = ["Que horários tenho livres amanhã?", "Quanto entrou essa semana?", "Quem não vem há mais de um mês?"];

/** Tela inicial: o dia de relance, o que precisa de atenção e o atalho para pedir ao Mozart. */
export default function Hoje() {
  // vejoFinanceiro: recebe (Caixa, Financeiro ou Relatórios) e vê o que entrou hoje.
  // cuidoDoFinanceiro: vê também o que saiu, as contas, a meta e o caminho para o Financeiro.
  const { sb, petshop, eu, equipe, vejoFinanceiro, cuidoDoFinanceiro, souDono, posso, liberado } = useGestao();
  // a agenda de banho e tosa é de quem tem a área Agenda ou recebe (caixa): quem só cuida da creche e do hotel não vê os horários
  const vejoAgenda = posso("agenda") || vejoFinanceiro;
  // "Meu dia": quem atende e não mexe com dinheiro abre a tela pelos pets dela, não pelo dia do pet shop
  const meuDia = Boolean(eu.atende) && posso("agenda") && !vejoFinanceiro && !souDono && usaModulo(petshop, "banho_tosa");
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<AgendamentoCompleto | null>(null);
  useAdiantar(carregarDetalhe, carregarForm);
  const [lembretes, setLembretes] = useState(false);
  const [chamando, setChamando] = useState<AbaChamar | null>(null);
  const [importando, setImportando] = useState(false);
  const [caderno, setCaderno] = useState(false);
  const hoje = inicioDoDia(new Date());
  const hojeIso = isoDia(hoje);
  // data marcada como fechada em Meu pet shop (feriado, folga): a tela diz o motivo, hoje e no aviso dos lembretes de amanhã
  useCalendario();
  const fechadoHoje = fraseDoDiaFechado(hojeIso), fechadoAmanha = fraseDoDiaFechado(isoDia(somaDias(hoje, 1)));
  // o que o negócio faz decide o que a tela mostra: quem não tem creche, loja ou pacotes não vê cartão nem aviso disso
  const banho = usaModulo(petshop, "banho_tosa"), casa = usaCasa(petshop) && posso("creche_hotel");
  const loja = usaModulo(petshop, "loja"), comPacotes = usaModulo(petshop, "pacotes");
  // área principal (`petshops.principal`): decide o que vai na frente da tela, dentro do que a pessoa pode abrir.
  // Sem ela, vale a ordem de sempre.
  const principal = principalDe(petshop), frenteDoNegocio = frenteDe(petshop);
  const frente = frenteDoNegocio === "casa" ? (casa ? "casa" : null) : frenteDoNegocio === "loja" ? (posso("estoque") ? "loja" : null) : frenteDoNegocio === "banho" && posso("agenda") ? "banho" : null;
  const soCasa = frente ? frente === "casa" : casa && (!banho || !vejoAgenda);
  const rotuloCasa = nomeDaCasa(petshop);

  const vejoEstoque = posso("estoque"), vejoPacotes = posso("pacotes");
  const cobrar = vejoFinanceiro && posso("creche_hotel");
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const seg = inicioDaSemana(hoje), ha6 = somaDias(hoje, -6);
    // o primeiro olhar numa ida só ao banco (gestao_hoje; sem ela, uma consulta por parte, como antes), e a creche ao mesmo tempo:
    // no celular com internet fraca, cada consulta esperando a outra soma uma ida e volta
    const [h, creche, experiencias, contasFixas] = await Promise.all([
      lerDadosDoHoje(sb, petshop.id, hoje, { vejoEstoque, vejoFinanceiro, cuidoDoFinanceiro, vejoPacotes, cobrar, cobrarHoje: posso("agenda") || vejoFinanceiro }),
      casa && usaModulo(petshop, "creche") ? resumoDaCrecheHoje(sb, petshop, cuidoDoFinanceiro, liberado).catch(() => null) : Promise.resolve(null),
      // dia de experiência (opção da creche): quem vem hoje e quem já fez e espera a conversa com o tutor
      casa && usaModulo(petshop, "creche") && experienciaDe(petshop).ativo ? lerExperiencias(sb, petshop.id).catch(() => null) : Promise.resolve(null),
      // contas fixas vencidas, de hoje e de amanhã (gera antes a conta do mês, se já é hora): só quem cuida do financeiro
      cuidoDoFinanceiro && vejoFinanceiro ? lerAvisosContasFixas(sb, petshop.id, hojeIso).catch(() => []) : Promise.resolve([]),
    ]);
    const idsFixas = new Set(contasFixas.map((c) => c.id));
    const { lista, saude, aj } = h;
    const ajusteDe = (iso: string) => aj.porDia.get(iso) ?? 0;
    const valeAg = (st: string) => !["cancelado", "faltou"].includes(st);
    const amanhaAtivos = h.amanha
      .filter((a) => !["cancelado", "faltou"].includes(a.status));
    // um lembrete por tutor: quem tem dois pets amanhã recebe uma mensagem só
    const tutores = (lista: typeof amanhaAtivos) => new Set(lista.map((a) => a.pets?.clientes?.id ?? a.id)).size;
    // lembrete só dá para mandar a quem tem telefone: os outros não entram na conta do que falta
    const semTelefone = (a: (typeof amanhaAtivos)[number]) => soDigitos(a.pets?.clientes?.telefone).length < 8;
    const estadias = h.emCasa;
    const noDia = (iso: string | null) => Boolean(iso) && isoDia(new Date(iso!)) === hojeIso;
    return {
      ags: vejoAgenda ? lista : [],
      proximosDias: vejoAgenda ? h.proximos : [],
      semFechar: h.semFechar,
      amanha: amanhaAtivos.length,
      amanhaSemLembrete: tutores(amanhaAtivos.filter((a) => !a.lembrete_em && !semTelefone(a))),
      amanhaSemTelefone: tutores(amanhaAtivos.filter((a) => !a.lembrete_em && semTelefone(a))),
      emCasa: estadias.filter((e) => e.status === "em_casa").length,
      chegamHoje: estadias.filter((e) => e.status === "reservada" && noDia(e.entrada)).length,
      saemHoje: estadias.filter((e) => e.status === "em_casa" && noDia(e.saida_prevista)).length,
      acabando: h.acabando.filter((p) => Number(p.estoque) <= Number(p.estoque_minimo)),
      pets: h.contagens.pets,
      totalAgs: h.contagens.agendamentos,
      concluidos: h.contagens.concluidos,
      lembrados: h.contagens.lembrados,
      estadiasTotal: h.contagens.estadias,
      // o passo "primeiro check-in" só conta o pet que entrou (reserva aceita pelo link não é check-in)
      checkinsTotal: h.contagens.checkins ?? h.contagens.estadias,
      produtosTotal: h.contagens.produtos,
      entrou: Math.round((h.entradas.filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0) + ajusteDe(hojeIso)) * 100) / 100,
      ajusteHoje: ajusteDe(hojeIso),
      saiu: cuidoDoFinanceiro ? h.entradas.filter((l) => l.tipo === "saida" && !CATEGORIAS_DEVOLUCAO.includes(l.categoria ?? "")).reduce((s, l) => s + Number(l.valor), 0) : 0,
      vendasHoje: h.entradas.filter((l) => l.tipo === "entrada" && l.categoria === "Venda de produtos"),
      // as contas fixas têm a linha delas ("Aluguel vence amanhã (R$ 2.500,00)")
      contas: h.contas.filter((c) => c.tipo === "saida" && !idsFixas.has(c.id)),
      contasFixas,
      // as mensalidades da creche têm a linha delas (com o atalho para Cobranças)
      aReceberVencidas: h.contas.filter((c) => c.tipo === "entrada" && c.categoria !== CATEGORIA_MENSALIDADE),
      pacotesVencendo: h.pacotes,
      saude,
      creche,
      experiencias,
      semana: Array.from({ length: 7 }, (_, i) => {
        const d = somaDias(seg, i), iso = isoDia(d);
        return { rotulo: nomeDiaCurto(d), valor: vejoAgenda ? h.semana.filter((a) => valeAg(a.status) && isoDia(new Date(a.inicio)) === iso).length : 0 };
      }),
      servicosMes: vejoAgenda ? [...h.servicosMes].sort((a, b) => b.valor - a.valor).slice(0, 5) : [],
      // de segunda até hoje (a segunda desta semana está sempre dentro dos últimos 7 dias)
      recebidoSemana: Math.round((h.ultimos7.filter((l) => l.data >= isoDia(seg)).reduce((t, l) => t + Number(l.valor), 0)
        + [...aj.porDia].filter(([d]) => d >= isoDia(seg)).reduce((t, [, v]) => t + v, 0)) * 100) / 100,
      entradas7: Array.from({ length: 7 }, (_, i) => {
        const iso = isoDia(somaDias(ha6, i));
        return h.ultimos7.filter((l) => l.data === iso).reduce((t, l) => t + Number(l.valor), 0) + ajusteDe(iso);
      }),
      paraCobrar: h.paraCobrar,
      taxasPendentes: h.atrasos,
      cobrarHoje: h.cobrarHoje,
    };
  }, [petshop.id, hojeIso, vejoFinanceiro, cuidoDoFinanceiro, vejoEstoque, vejoPacotes, casa, cobrar, vejoAgenda]);

  // quem chamar de volta e aniversariantes: consulta à parte, para não segurar o resto da tela
  const vejoClientes = posso("clientes");
  // check-outs de creche e hotel que saíram sem cobrança (feitos por quem não mexe com dinheiro): quem recebe vê aqui
  // (vêm na mesma leitura do primeiro olhar)
  const paraCobrar = dados?.paraCobrar ?? 0;
  // lista de espera do hotel: abriu vaga para alguém (mesma conta da Ocupação)
  const [vagaNaEspera, setVagaNaEspera] = useState<VagaNaEspera>(SEM_VAGA);
  // mensalistas que saíram depois do horário e esperam a decisão da taxa (só quem recebe lê; na mesma leitura)
  const taxasPendentes = dados?.taxasPendentes ?? 0;
  // abaixo da dobra: só depois que o primeiro olhar chegou (não disputa a rede com ele)
  const primeiroOlhar = Boolean(dados);
  // validade dos produtos (lotes vencidos e vencendo em 30 dias): leitura à parte, só para quem cuida do estoque
  const [validade, setValidade] = useState<ResumoDaValidade>(SEM_VALIDADE);
  const { dados: paraChamar } = useDados(async () => (vejoClientes && primeiroOlhar ? buscarParaChamar(sb, petshop.id) : null), [petshop.id, hojeIso, vejoClientes, primeiroOlhar]);
  const chamados = paraChamar ? lerChamados(petshop.id) : {};
  const comFone = (grupos: GrupoChamar[]) => grupos.filter((g) => g.telefone);
  const sumidos = paraChamar ? comFone(quemSumiu(paraChamar, 30, hoje)) : [];
  const niver = paraChamar ? comFone(aniversariantes(paraChamar, hoje)) : [];
  const sumidosAChamar = sumidos.filter((g) => !chamadoEm(chamados, "volta", g.chave));
  const niverAChamar = niver.filter((g) => !chamadoEm(chamados, "niver", g.chave));
  const nomesDosPets = (grupos: GrupoChamar[]) => {
    const nomes = grupos.flatMap((g) => g.pets.map((p) => p.pet.nome));
    return { q: nomes.length, texto: nomes.length <= 2 ? nomes.join(" e ") : `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}` };
  };
  const petsSumidos = nomesDosPets(sumidosAChamar), petsNiver = nomesDosPets(niverAChamar);
  const niverHoje = niverAChamar.length > 0 && niverAChamar.every((g) => g.pets.every((p) => p.ordem === 0));

  const ativos = (dados?.ags ?? []).filter((a) => !["cancelado", "faltou"].includes(a.status));
  const feitos = ativos.filter((a) => a.status === "concluido").length;
  // concluídos de hoje que ninguém cobrou (o banco diz quais, sem valor): não são "tudo certo"
  // vêm na leitura do primeiro olhar; sem ela (banco antes da atualização), à parte, como antes
  const { ids: semContaAparte } = useParaCobrar(hoje, hoje, Boolean(dados && !dados.cobrarHoje));
  const semConta = dados?.cobrarHoje ? new Set(dados.cobrarHoje) : semContaAparte;
  const faltaCobrarHoje = ativos.filter((a) => semConta.has(a.id)).length;
  const semConcluir = ativos.length - feitos;
  // marcados como "não cobrar" hoje: o dia fecha, mas o dono vê quantos foram e quem marcou
  const naoCobradosHoje = ativos.filter((a) => semCobranca(a));
  // no "Meu dia", o próximo e o que está na mesa são os da pessoa (e os sem profissional), não os do pet shop
  const meusAtivos = meuDia ? ativos.filter((a) => a.profissional_id === eu.id || !a.profissional_id) : ativos;
  const proximo = meusAtivos.find((a) => a.status !== "concluido" && new Date(a.fim) > new Date());
  const selecionado = aberto ? dados?.ags.find((a) => a.id === aberto) ?? null : null;
  const quemAtende = equipe.filter((p) => p.ativo && p.atende);

  // retenção: no máximo um cartão em destaque, nesta ordem: fim de teste > primeiros passos > resumo da semana
  const teste = fimDoTeste(petshop);
  const testePerto = Boolean(teste && teste.dias <= DIAS_DE_AVISO);
  const [agoraNao, setAgoraNao] = useState(() => lerLembrado(chaveAgoraNao(petshop.id)) === hojeIso);
  const cartaoTeste = testePerto && souDono && (!liberado || !agoraNao);
  const pp = usePrimeirosPassos(
    dados ? { pets: dados.pets, horarios: dados.totalAgs, concluidos: dados.concluidos, lembretes: dados.lembrados, amanha: dados.amanha, estadias: dados.checkinsTotal, produtos: dados.produtosTotal } : null,
    () => setLembretes(true),
  );
  const cartaoPassos = !cartaoTeste && pp.estado !== "some";
  const temResumo = cuidoDoFinanceiro && temSemanaPassada(petshop.criado_em, hoje);
  const cartaoResumo = temResumo && hoje.getDay() === 1 && !cartaoTeste && !cartaoPassos;

  // creche e hotel: a casa pode estar cheia mesmo com a agenda de banho vazia
  const n = (q: number, um: string, varios: string) => (q === 1 ? `1 ${um}` : `${q} ${varios}`);
  const temCasa = Boolean(dados && casa && dados.emCasa + dados.chegamHoje + dados.saemHoje > 0);
  const linhaCasa = dados && temCasa
    ? `${rotuloCasa}: ${dados.emCasa} na casa, ${n(dados.chegamHoje, "chega", "chegam")} hoje, ${n(dados.saemHoje, "sai", "saem")} hoje`
    : "";

  // próximos horários depois de hoje e horários de dias anteriores que ficaram sem fechar
  const quandoFoi = (iso: string) => `${dataAmigavel(iso)} às ${hora(iso)}`;
  const proximoDia = posso("agenda") ? dados?.proximosDias[0] ?? null : null;
  const depoisDele = posso("agenda") ? dados?.proximosDias[1] ?? null : null;
  const semFechar = posso("agenda") && liberado && dados ? dados.semFechar : { total: 0, primeiros: [] };

  // conta que acabou de nascer: nada de zeros soltos, só o próximo passo
  const contaNova = Boolean(dados && dados.pets === 0 && dados.totalAgs === 0 && dados.estadiasTotal === 0 && (frente !== "loja" || dados.produtosTotal === 0));
  const vendas = dados && vejoFinanceiro ? { quantas: dados.vendasHoje.length, total: dados.vendasHoje.reduce((s, l) => s + Number(l.valor), 0) } : null;
  // sem banho e tosa e sem horário hoje: a agenda não ocupa lugar na tela de quem escolheu outra área principal
  const semAgenda = !vejoAgenda || Boolean(principal && !banho && dados && !dados.ags.length);
  // conta nova com primeiros passos na tela: o Mozart, o botão do topo e o cartão apontam o mesmo próximo passo
  const passoNovo = contaNova && pp.estado === "ativo" ? pp.proximo : null;
  const fraseDoPasso = passoNovo ? `Tudo pronto para começar. O próximo passo é ${passoNovo.texto.charAt(0).toLowerCase()}${passoNovo.texto.slice(1)}${passoNovo.id === "pet" && (souDono || eu.papel === "gerente") ? ", ou trazer os seus clientes de uma planilha" : ""}.` : null;
  const frase = !dados ? "" : fraseDoPasso ?? (contaNova && frente === "loja" ? "Tudo pronto para começar. O primeiro passo é cadastrar o que você vende."
    : contaNova ? (posso("clientes") ? (souDono || eu.papel === "gerente" ? "Tudo pronto para começar. O primeiro passo é cadastrar um pet, ou trazer os seus clientes de uma planilha." : "Tudo pronto para começar. O primeiro passo é cadastrar um pet.") : "Tudo pronto para começar.")
    : frente === "loja" ? `${dados.acabando.length === 0 ? "Nenhum produto acabando" : dados.acabando.length === 1 ? "1 produto está acabando" : `${dados.acabando.length} produtos estão acabando`}.${vendas ? (vendas.quantas ? ` Hoje ${vendas.quantas === 1 ? "saiu 1 venda" : `saíram ${vendas.quantas} vendas`} no balcão: ${brl(vendas.total)} (produtos vendidos na conta do atendimento entram em Relatórios).` : " Nenhuma venda no balcão hoje, por enquanto.") : ""}${ativos.length ? ` Na agenda, ${n(ativos.length, "atendimento", "atendimentos")} hoje.` : ""}`
    : meuDia ? (meusAtivos.length ? `Hoje você tem ${n(meusAtivos.length, "pet", "pets")}${proximo ? `. O próximo é ${proximo.pets?.nome ?? "um pet"}, às ${hora(proximo.inicio)}${proximo.pets?.alertas ? ` (atenção: ${alertaCurto(proximo.pets.alertas, 80)})` : ""}` : ", todos já atendidos"}.` : "Nenhum pet marcado com você hoje.")
    : !vejoAgenda ? (temCasa ? `${linhaCasa}.` : casa ? "Nenhum pet na casa agora." : "Bom trabalho hoje.")
    : frente === "casa" ? `${temCasa ? linhaCasa : "Nenhum pet na casa agora"}.${ativos.length ? ` No banho e tosa, ${n(ativos.length, "atendimento", "atendimentos")} hoje.` : ""}`
    : soCasa && !ativos.length ? (temCasa ? `${linhaCasa}.` : `Nenhum pet na casa agora.`)
    : !ativos.length ? `Nenhum horário marcado para hoje.${proximoDia ? ` O próximo é ${proximoDia.pets?.nome ?? "um pet"}, ${quandoFoi(proximoDia.inicio)}.` : ""}${linhaCasa ? ` ${linhaCasa}.` : ""}`
    : `Hoje ${ativos.length === 1 ? "é 1 atendimento" : `são ${ativos.length} atendimentos`}${proximo ? `. O próximo é ${proximo.pets?.nome ?? "um pet"}, às ${hora(proximo.inicio)}` : feitos === ativos.length ? (faltaCobrarHoje > 0 ? `, todos concluídos. ${faltaCobrarHoje === 1 ? "Falta cobrar 1" : `Falta cobrar ${faltaCobrarHoje}`}` : ", todos concluídos") : ""}.`);

  const cr = dados?.creche ?? null;
  const cartaoDaChamada = Boolean(cr && cr.esperados > 0);
  const atencao = dados ? [
    paraCobrar > 0 && { icone: HandCoins, tom: "menta" as Tom, texto: `${paraCobrar === 1 ? "1 check-out saiu" : `${paraCobrar} check-outs saíram`} sem cobrança ${rotuloCasa === "Hotel" ? "no hotel" : rotuloCasa === "Creche" ? "na creche" : "na creche e hotel"}. Toque para receber.`, href: "/gestao/app/creche-hotel?ver=cobrar" },
    vagaNaEspera.n > 0 && { icone: BellRing, tom: "manteiga" as Tom, texto: `${vagaNaEspera.n === 1 ? `Abriu vaga no hotel para 1 pet da lista de espera: ${vagaNaEspera.nomes[0]}` : `Abriu vaga no hotel para ${vagaNaEspera.n} pets da lista de espera: ${vagaNaEspera.nomes.slice(0, 3).join(", ")}${vagaNaEspera.n > 3 ? "…" : ""}`}. Toque para avisar o tutor.`, href: "/gestao/app/creche-hotel?ver=espera" },
    (taxasPendentes ?? 0) > 0 && { icone: HandCoins, tom: "menta" as Tom, texto: `${taxasPendentes === 1 ? "1 mensalista saiu" : `${taxasPendentes} mensalistas saíram`} da creche depois do horário. Toque para decidir a taxa.`, href: "/gestao/app/creche-hotel?ver=cobrar" },
    (dados.experiencias?.hoje.length ?? 0) > 0 && { icone: Sparkles, tom: "manteiga" as Tom, texto: `Hoje é dia de experiência de ${juntar(dados.experiencias!.hoje.map((e) => e.pets?.nome ?? "um cão novo"))} na creche.`, href: "/gestao/app/creche-hotel?ver=casa" },
    (dados.experiencias?.conversar.length ?? 0) > 0 && { icone: MessageCircle, tom: "manteiga" as Tom, texto: `${juntar(dados.experiencias!.conversar.map((e) => e.pets?.nome ?? "Um cão"))} ${dados.experiencias!.conversar.length === 1 ? "fez" : "fizeram"} o dia de experiência. Toque para perguntar ao tutor como foi e oferecer os planos.`, href: "/gestao/app/creche-hotel?ver=casa#experiencias" },
    cr && cr.reposicoes > 0 && { icone: CalendarCheck2, tom: "manteiga" as Tom, texto: `A equipe marcou ${cr.reposicoes === 1 ? "1 dia de mensalista como reposição" : `${cr.reposicoes} dias de mensalistas como reposição`} (sem cobrança). Toque para conferir: você aceita ou cobra como dia extra.`, href: "/gestao/app/creche-hotel?ver=chamada" },
    cr && cr.semValor.length > 0 && { icone: HandCoins, tom: "manteiga" as Tom, texto: `${cr.semValor.length === 1 ? "1 mensalista está" : `${cr.semValor.length} mensalistas estão`} sem valor de mensalidade (${cr.semValor.slice(0, 3).join(", ")}${cr.semValor.length > 3 ? "…" : ""}). Sem o valor, a cobrança do mês não é gerada. Toque para preencher.`, href: "/gestao/app/creche-hotel?ver=mensalistas" },
    // a chamada tem o cartão dela no alto da tela (ChamadaDeHoje): a linha não se repete aqui
    cr && cr.esperados > 0 && !cartaoDaChamada && { icone: CalendarCheck2, tom: "manteiga" as Tom, texto: `Chamada de hoje: ${cr.esperados === 1 ? "1 cão esperado" : `${cr.esperados} cães esperados`}${cr.aindaNao > 0 ? `, ${cr.aindaNao === 1 ? "1 ainda não chegou" : `${cr.aindaNao} ainda não chegaram`}` : ", chamada feita"}.`, href: "/gestao/app/creche-hotel?ver=chamada" },
    cr && cr.faltaram.length > 0 && { icone: UserX, tom: "rosa" as Tom, texto: cr.semAviso.length > 0
      ? `${cr.semAviso.length <= 2 ? cr.semAviso.join(" e ") : `${cr.semAviso.slice(0, 2).join(", ")} e mais ${cr.semAviso.length - 2}`} ${cr.semAviso.length === 1 ? "não veio" : "não vieram"} à creche hoje sem aviso do tutor. Toque para ver a chamada e mandar uma mensagem.${cr.faltaram.length > cr.semAviso.length ? ` ${cr.faltaram.length - cr.semAviso.length === 1 ? "Outro faltou" : `Outros ${cr.faltaram.length - cr.semAviso.length} faltaram`} com aviso.` : ""}`
      : `${cr.faltaram.length <= 2 ? cr.faltaram.join(" e ") : `${cr.faltaram.slice(0, 2).join(", ")} e mais ${cr.faltaram.length - 2}`} ${cr.faltaram.length === 1 ? "não vem" : "não vêm"} à creche hoje: o tutor avisou.`, href: "/gestao/app/creche-hotel?ver=chamada" },
    cr && cr.vencemHoje > 0 && { icone: HandCoins, tom: "menta" as Tom, texto: `Hoje ${cr.vencemHoje === 1 ? "vence 1 mensalidade" : `vencem ${cr.vencemHoje} mensalidades`} da creche. Toque para cobrar.`, href: "/gestao/app/creche-hotel?ver=cobrancas" },
    cr && cr.atrasadas > 0 && { icone: HandCoins, tom: "rosa" as Tom, texto: `${cr.atrasadas === 1 ? "1 mensalidade atrasada" : `${cr.atrasadas} mensalidades atrasadas`} na creche. Toque para ver e cobrar.`, href: "/gestao/app/creche-hotel?ver=cobrancas" },
    semFechar.total > 0 && { icone: HandCoins, tom: "manteiga" as Tom, texto: `${semFechar.total === 1 ? "1 atendimento de dias anteriores ficou" : `${semFechar.total} atendimentos de dias anteriores ficaram`} sem fechar (${semFechar.primeiros.map((a) => `${a.pets?.nome ?? "pet"}, ${dataAmigavel(a.inicio)}`).join("; ")}${semFechar.total > semFechar.primeiros.length ? "; …" : ""}). Toque para abrir a agenda do dia, dizer se foi atendido ou faltou e cobrar.`, href: `/gestao/app/agenda?dia=${isoDia(new Date(semFechar.primeiros[0].inicio))}` },
    posso("agenda") && dados.amanhaSemLembrete > 0 && { icone: MessageCircle, tom: "pessego" as Tom, texto: `Amanhã ${fechadoAmanha ? `é ${fechadoAmanha.replace(/^Dia /, "dia ")}, mas ` : ""}${dados.amanha === 1 ? "tem 1 horário" : `tem ${dados.amanha} horários`}. ${dados.amanhaSemLembrete === 1 ? "Falta 1 lembrete" : `Faltam ${dados.amanhaSemLembrete} lembretes`}: toque para mandar pelo WhatsApp.${dados.amanhaSemTelefone > 0 ? ` ${dados.amanhaSemTelefone} sem telefone (não ${dados.amanhaSemTelefone === 1 ? "entra" : "entram"} na conta).` : ""}`, aoTocar: () => setLembretes(true) },
    sumidosAChamar.length > 0 && { icone: UserSearch, tom: "menta" as Tom, texto: `${petsSumidos.texto} ${petsSumidos.q === 1 ? "não vem" : "não vêm"} há mais de 30 dias e não ${petsSumidos.q === 1 ? "tem" : "têm"} horário marcado. Toque para chamar de volta pelo WhatsApp.`, aoTocar: () => setChamando("volta") },
    niverAChamar.length > 0 && { icone: Cake, tom: "manteiga" as Tom, texto: `${petsNiver.texto} ${petsNiver.q === 1 ? "faz" : "fazem"} aniversário ${niverHoje ? "hoje" : "nos próximos dias"}. Toque para mandar os parabéns pelo WhatsApp.`, aoTocar: () => setChamando("niver") },
    vejoEstoque && validade.vencidos.length + validade.em30.length > 0 && { icone: CalendarX, tom: "rosa" as Tom, texto: `${[
      validade.vencidos.length ? (validade.vencidos.length === 1 ? "1 lote vencido" : `${validade.vencidos.length} lotes vencidos`) : "",
      validade.em30.length ? `${validade.em30.length === 1 ? "1 lote vence" : `${validade.em30.length} lotes vencem`} em até 30 dias` : "",
    ].filter(Boolean).join(" e ")} no estoque: ${[...new Set([...validade.vencidos, ...validade.em30].map((l) => l.nome))].slice(0, 3).join(", ")}. Toque para ver e dar baixa no que venceu.`, href: "/gestao/app/estoque?ver=vencendo" },
    loja && dados.acabando.length > 0 && { icone: Package, tom: "rosa" as Tom, texto: `${dados.acabando.length === 1 ? "1 produto está acabando" : `${dados.acabando.length} produtos estão acabando`}: ${dados.acabando.slice(0, 3).map((p) => p.nome).join(", ")}.`, href: "/gestao/app/estoque" },
    ...dados.contasFixas.slice(0, 3).map((c) => ({ icone: Receipt, tom: (c.vencimento < hojeIso ? "rosa" : "manteiga") as Tom,
      texto: `${fraseDaContaFixa(c, hojeIso)}.${c.vencimento < hojeIso ? " Ainda está em A pagar." : ""}${c.estimado ? " Confira a conta e escreva o valor certo." : ""}`, href: "/gestao/app/financeiro?aba=pagar" })),
    dados.contasFixas.length > 3 && { icone: Receipt, tom: "manteiga" as Tom, texto: `E mais ${dados.contasFixas.length - 3 === 1 ? "1 conta fixa" : `${dados.contasFixas.length - 3} contas fixas`} vencendo até amanhã.`, href: "/gestao/app/financeiro?aba=pagar" },
    dados.contas.length > 0 && { icone: Receipt, tom: "manteiga" as Tom, texto: `${dados.contas.length === 1 ? "1 conta vence" : `${dados.contas.length} contas vencem`} até hoje: ${brl(dados.contas.reduce((s, c) => s + Number(c.valor), 0))}.`, href: "/gestao/app/financeiro" },
    dados.aReceberVencidas.length > 0 && (() => {
      // a conta que vence hoje ainda não venceu: a frase separa as duas
      const lista = dados.aReceberVencidas, venceram = lista.filter((c) => (c.vencimento ?? "") < hojeIso), hojeVence = lista.length - venceram.length;
      const total = brl(lista.reduce((s, c) => s + Number(c.valor), 0));
      const texto = !venceram.length
        ? `${hojeVence === 1 ? "1 conta de cliente vence hoje" : `${hojeVence} contas de clientes vencem hoje`}: ${total} a receber.`
        : `${venceram.length === 1 ? "1 conta de cliente venceu" : `${venceram.length} contas de clientes venceram`} e ainda não ${venceram.length === 1 ? "foi paga" : "foram pagas"}${hojeVence ? ` e ${hojeVence === 1 ? "1 vence hoje" : `${hojeVence} vencem hoje`}` : ""}: ${total} a receber.`;
      return { icone: HandCoins, tom: "menta" as Tom, texto, href: "/gestao/app/financeiro" };
    })(),
    dados.saude && dados.saude.vencidos + dados.saude.vencendo > 0 && { icone: HeartPulse, tom: "ceu" as Tom, texto: dados.saude.frase, href: "/gestao/app/clientes" },
    comPacotes && dados.pacotesVencendo > 0 && { icone: Ticket, tom: "lilas" as Tom, texto: `${dados.pacotesVencendo === 1 ? "1 pacote vence" : `${dados.pacotesVencendo} pacotes vencem`} nos próximos 7 dias.`, href: "/gestao/app/pacotes" },
  ].filter(Boolean) as { icone: React.ComponentType<{ size?: number }>; tom: Tom; texto: string; href?: string; aoTocar?: () => void }[] : [];

  const agora = new Date();
  const emAndamento = meusAtivos.find((a) => a.status !== "concluido" && new Date(a.inicio) <= agora && new Date(a.fim) > agora);
  const destaque = emAndamento ?? proximo;
  const faltam = destaque ? Math.round((new Date(destaque.inicio).getTime() - agora.getTime()) / 60000) : 0;
  const quando = !destaque ? "" : faltam <= 0 ? "acontecendo agora" : faltam < 60 ? `em ${faltam} min` : `em ${Math.floor(faltam / 60)} h${faltam % 60 ? ` ${faltam % 60} min` : ""}`;
  const semana = dados?.semana ?? [];
  const kpiCasa = casa && <Kpi href="/gestao/app/creche-hotel" icone={BedDouble} tom="ceu" rotulo={rotuloCasa} valor={dados ? dados.emCasa : "–"} apoio={dados?.emCasa === 1 ? "pet na casa agora" : "pets na casa agora"} />;
  const totalSemana = semana.reduce((s, d) => s + d.valor, 0);

  return (
    <>
      <ErroDeTeste />
      <SensorDaEspera ligado={posso("creche_hotel")} aoMudar={setVagaNaEspera} />
      {vejoEstoque && primeiroOlhar && <SensorDaValidade ativo aoMudar={setValidade} />}
      <header className="g-topo">
        <div>
          <p className="g-rotulo" style={{ marginBottom: 6 }}>{dataLonga(hoje)}</p>
          <h1>{saudacao()}, <em className="it">{eu.nome.split(" ")[0]}</em></h1>
        </div>
        <div className="g-acoes">
          {posso("agenda") && banho && !contaNova && liberado && !meuDia && <LinkRapido rotulo="Mandar o link do cliente" />}
          {passoNovo ? (passoNovo.href
              ? <Link className="g-btn pri" href={passoNovo.href} onClick={passoNovo.aoTocar}><ChevronRight />{passoNovo.texto}</Link>
              : <button type="button" className="g-btn pri" onClick={passoNovo.aoTocar}><ChevronRight />{passoNovo.texto}</button>)
            : contaNova && frente === "loja" ? <LinkDeGravar className="g-btn pri" href="/gestao/app/estoque"><Plus />Cadastrar o primeiro produto</LinkDeGravar>
            : contaNova && posso("clientes") ? <LinkDeGravar className="g-btn pri" href="/gestao/app/clientes?novo=1"><Plus />Cadastrar o primeiro pet</LinkDeGravar>
            : frente === "loja" ? <LinkDeGravar className="g-btn pri" href={ROTA_VENDER}><ShoppingBag />Vender</LinkDeGravar>
            : soCasa ? <LinkDeGravar className="g-btn pri" href="/gestao/app/creche-hotel"><Plus />{principal === "hotel" ? "Nova reserva" : "Fazer check-in"}</LinkDeGravar>
            : posso("agenda") && <LinkDeGravar className="g-btn pri" href="/gestao/app/agenda?novo=1"><Plus />Marcar horário</LinkDeGravar>}
        </div>
      </header>

      <div className="g-pilha g">
        {/* a leitura do dia falhou (banco demorou, internet caiu): diz e deixa tentar de novo, sem fingir que a agenda está livre */}
        {erro && !dados && (
          <div className="g-aviso" role="alert" data-teste="hoje-erro">
            <span>{erro}</span>
            <button className="g-btn p sec" onClick={() => void recarregar()}>Tentar de novo</button>
          </div>
        )}
        {testePerto && souDono && (
          <FimDoTeste modo={cartaoTeste ? "cartao" : "linha"} numeros={dados ? { pets: dados.pets, horarios: dados.totalAgs, concluidos: dados.concluidos } : null}
            aoDispensar={() => { guardarLembrado(chaveAgoraNao(petshop.id), hojeIso); setAgoraNao(true); }} />
        )}
        {testePerto && !souDono && liberado && <FimDoTeste modo="equipe" numeros={null} aoDispensar={() => {}} />}
        {!testePerto && souDono && liberado && <ProgressoDoTeste numeros={dados ? { pets: dados.pets, horarios: dados.totalAgs } : null} proximo={pp.proximo} />}

        {/* dia fechado sem a agenda na tela (creche ou hotel): o aviso vem no alto, antes do botão de check-in */}
        {fechadoHoje && casa && !banho && <p className="g-aviso" role="status" style={{ margin: 0 }}><span className="g-cresce"><b>{fechadoHoje}.</b> {rotuloCasa === "Hotel" ? "O hotel não recebe chegadas hoje. Quem está hospedado continua hospedado." : rotuloCasa === "Creche" ? "A creche não abre hoje: ninguém é esperado na chamada e ninguém leva falta." : "A creche não abre hoje e ninguém leva falta. Quem está hospedado no hotel continua hospedado."}</span></p>}
        {/* quem atende: os pets dela primeiro, com o alerta, o próximo passo e as fotos */}
        {meuDia && dados && <MeuDia ags={dados.ags} semConta={semConta} aoAbrir={setAberto} aoMudar={() => void recarregar()} />}
        {/* creche e hotel: comida e remédio que estão na hora ou atrasados, um toque para marcar */}
        {casa && primeiroOlhar && <CuidadosDeAgora />}
        {cr && cartaoDaChamada && <ChamadaDeHoje esperados={cr.esperados} aindaNao={cr.aindaNao} naCasa={cr.naCasa} sairam={cr.sairam} faltaram={cr.faltaram.length} />}

        {/* "Bom dia" do Mozart: primeira abertura do dia, até 3 linhas; lê sozinho (gestao_bom_dia), não depende dos dados desta tela */}
        {!contaNova && <BomDia />}

        {/* Modo envio: "Mandar N mensagens" (lembretes, pet pronto, saúde, aniversário, pacote, cobrança, chamar de volta), depois do primeiro olhar */}
        {!contaNova && <EntradaModoEnvio pronto={primeiroOlhar} />}

        {/* pedidos que chegaram pelo link vêm no alto: no celular, abaixo dos primeiros passos e do Mozart ficavam longe da vista */}
        {posso("agenda") && <PedidosLink />}

        {contaNova && cartaoPassos && !meuDia && <PrimeirosPassos pp={pp} modo="cartao" curto />}

        <div className="g-heroi">
          <section className="g-mozart">
            <Marca tamanho={300} className="fundo" />
            <div className="g-fila" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
              <Selo tamanho={52} />
              <div className="g-cresce">
                <p className="g-rotulo"><span className="g-ondas" aria-hidden><i /><i /><i /><i /></span>Mozart, seu assistente de inteligência artificial</p>
                <p className="fala">{carregando && !dados ? "Olhando a agenda…" : frase}</p>
              </div>
            </div>
            <div className="g-pilha p">
              <div className="g-fila"><button className="g-btn pri" onClick={() => abrirAssistente()}><Mic />Falar com o Mozart</button></div>
              <div className="g-sugestoes">
                {pedidosDaFrente(frente, PEDIDOS).filter((p) => (cuidoDoFinanceiro || !p.startsWith("Quanto")) && (posso("agenda") || !p.includes("horários")) && (posso("clientes") || !p.startsWith("Quem não vem"))).map((p) => <button key={p} onClick={() => abrirAssistente(p)}>{p}</button>)}
              </div>
            </div>
          </section>

          {meuDia ? null : destaque?.pets && frente !== "casa" && frente !== "loja" ? (
            <button className="g-proximo" style={{ textAlign: "left", color: "inherit", "--cor": destaque.servicos?.cor ?? "#f97316" } as React.CSSProperties} onClick={() => setAberto(destaque.id)}>
              <div className="g-fila entre" style={{ flexWrap: "nowrap" }}>
                <span className="g-rotulo" style={{ color: "#8a4a17" }}>{emAndamento ? "Na mesa agora" : "Próximo atendimento"}</span>
                <span className="g-tag laranja">{quando}</span>
              </div>
              <div className="quem">
                <AvatarPet pet={destaque.pets} tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b>{destaque.pets.nome}</b>
                  <span>{[destaque.pets.raca, destaque.pets.clientes?.nome].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
              <div className="quando">
                <b>{hora(destaque.inicio)}</b>
                <span className="g-ag" style={{ width: "auto", padding: "6px 12px", boxShadow: "none", borderLeftWidth: 1, borderRadius: 999 }}><span className="serv"><i />{nomeDosServicos(destaque) ?? "Atendimento"}</span></span>
                {destaque.profissionais && <span className="g-p" style={{ color: "#6b4a2f" }}>com {destaque.profissionais.nome.split(" ")[0]}</span>}
              </div>
            </button>
          ) : (
            contaNova && posso("clientes") && frente !== "loja" && (souDono || eu.papel === "gerente") ? (
            <div className="g-proximo vazio">
              <span className="g-rotulo" style={{ color: "#24543b" }}>Já tem clientes?</span>
              <div className="quem">
                <Tile icone={FileSpreadsheet} tom="menta" tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b style={{ whiteSpace: "normal", fontSize: "1.375rem" }}>Traga a sua lista</b>
                  <span style={{ whiteSpace: "normal" }}>Da planilha, do caderno ou do outro sistema: tutores e pets entram de uma vez, sem digitar um por um.</span>
                </div>
              </div>
              <button type="button" className="g-btn verde" style={{ justifySelf: "start" }} disabled={!liberado} onClick={() => { if (liberado) setImportando(true); }}><FileSpreadsheet />Trazer de uma planilha</button>
              <button type="button" className="g-btn sec" style={{ justifySelf: "start" }} disabled={!liberado} onClick={() => { if (liberado) setCaderno(true); }}><Camera />Tirar foto do caderno</button>
            </div>
            ) : frente === "loja" ? (
            <FrenteDaLoja carregando={!dados} produtos={dados?.produtosTotal ?? 0} acabando={dados?.acabando ?? []} vendas={vendas} novo={dados?.produtosTotal === 0} />
            ) : soCasa && (frente === "casa" || !(dados && ativos.length)) ? (
            <div className="g-proximo vazio">
              <span className="g-rotulo" style={{ color: "#24543b" }}>{rotuloCasa}</span>
              <div className="quem">
                <Tile icone={BedDouble} tom="ceu" tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b style={{ whiteSpace: "normal", fontSize: "1.375rem" }}>{!dados ? "Olhando a casa…" : dados.emCasa === 0 ? "Nenhum pet na casa agora" : dados.emCasa === 1 ? "1 pet na casa agora" : `${dados.emCasa} pets na casa agora`}</b>
                </div>
              </div>
              {frente === "casa" ? dados && <ChegamESaem chegam={dados.chegamHoje} saem={dados.saemHoje} />
                : temCasa && <Link className="g-hoje-casa" href="/gestao/app/creche-hotel"><BedDouble aria-hidden /><span>{linhaCasa}</span><ChevronRight aria-hidden /></Link>}
              <LinkDeGravar className="g-btn verde" href="/gestao/app/creche-hotel" style={{ justifySelf: "start" }}><Plus />{principal === "hotel" ? "Nova reserva" : dados?.estadiasTotal === 0 ? "Fazer o primeiro check-in" : "Fazer check-in"}</LinkDeGravar>
            </div>
            ) : (
            <div className="g-proximo vazio">
              <span className="g-rotulo" style={{ color: "#24543b" }}>{erro && !dados ? "Agenda de hoje" : dados && ativos.length ? (semConcluir > 0 ? "Fim dos horários de hoje" : faltaCobrarHoje > 0 ? "Atendimentos concluídos" : "Dia concluído") : temCasa ? "Banho e tosa sem horários hoje" : "Agenda livre hoje"}</span>
              <div className="quem">
                <Tile icone={dados && ativos.length ? (semConcluir > 0 || faltaCobrarHoje > 0 ? HandCoins : Check) : Sparkles} tom={dados && ativos.length && (semConcluir > 0 || faltaCobrarHoje > 0) ? "manteiga" : "menta"} tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b style={{ whiteSpace: "normal", fontSize: "1.375rem" }}>{erro && !dados ? "Não deu para ler a agenda agora" : !(dados && ativos.length) ? (proximoDia ? `Próximo: ${proximoDia.pets?.nome ?? "um pet"}, ${quandoFoi(proximoDia.inicio)}` : "Nenhum horário marcado por vir")
                    : semConcluir > 0 ? `${semConcluir === 1 ? "1 horário ficou" : `${semConcluir} horários ficaram`} sem concluir`
                    : faltaCobrarHoje > 0 ? `${faltaCobrarHoje === 1 ? "Falta cobrar 1 atendimento" : `Falta cobrar ${faltaCobrarHoje} atendimentos`}`
                    : "Tudo atendido por hoje"}</b>
                  {!(dados && ativos.length) && depoisDele && <span style={{ whiteSpace: "normal" }}>Depois: {depoisDele.pets?.nome ?? "um pet"}, {quandoFoi(depoisDele.inicio)}.</span>}
                  {dados && ativos.length > 0 && semConcluir > 0 && <span style={{ whiteSpace: "normal" }}>Abra cada um na lista de hoje e diga se foi atendido ou se o cliente faltou.{faltaCobrarHoje > 0 ? ` E ${faltaCobrarHoje === 1 ? "1 concluído ainda está" : `${faltaCobrarHoje} concluídos ainda estão`} sem cobrança.` : ""}</span>}
                  {dados && ativos.length > 0 && semConcluir === 0 && faltaCobrarHoje === 0 && naoCobradosHoje.length > 0 && <span style={{ whiteSpace: "normal" }}>{naoCobradosHoje.length === 1 ? "1 atendimento foi marcado como não cobrado" : `${naoCobradosHoje.length} atendimentos foram marcados como não cobrados`}{(() => { const quem = [...new Set(naoCobradosHoje.map((a) => a.sem_cobranca_nome?.split(" ")[0]).filter(Boolean))]; return quem.length ? ` (por ${quem.join(" e ")})` : ""; })()}.</span>}
                  {dados && ativos.length > 0 && semConcluir === 0 && faltaCobrarHoje > 0 && <span style={{ whiteSpace: "normal" }}>{vejoFinanceiro ? "Todos foram atendidos, mas a conta ainda não foi fechada. Veja a lista Atendimentos para cobrar, logo abaixo." : "Todos foram atendidos. Quem cuida do caixa ainda precisa fechar a conta."}</span>}
                </div>
              </div>
              {temCasa && <Link className="g-hoje-casa" href="/gestao/app/creche-hotel"><BedDouble aria-hidden /><span>{linhaCasa}</span><ChevronRight aria-hidden /></Link>}
              {posso("agenda") && <LinkDeGravar className="g-btn verde" href="/gestao/app/agenda?novo=1" style={{ justifySelf: "start" }}><Plus />Marcar horário</LinkDeGravar>}
            </div>
            )
          )}
        </div>

        {temCasa && (destaque?.pets || frente === "loja") && frente !== "casa" && <Link className="g-hoje-casa solta" href="/gestao/app/creche-hotel"><BedDouble aria-hidden /><span>{linhaCasa}</span><ChevronRight aria-hidden /></Link>}
        {(frente === "casa" || frente === "loja") && destaque?.pets && posso("agenda") && (
          <Link className="g-hoje-casa solta" href="/gestao/app/agenda"><Scissors aria-hidden /><span>Banho e tosa: {n(ativos.length, "atendimento", "atendimentos")} hoje. {emAndamento ? `${destaque.pets.nome} está na mesa agora.` : `O próximo é ${destaque.pets.nome}, às ${hora(destaque.inicio)}.`}</span><ChevronRight aria-hidden /></Link>
        )}

        {vejoFinanceiro && <AtendimentosParaCobrar aoMudar={() => void recarregar()} />}
        {cuidoDoFinanceiro && <AlteracoesDeValores />}
        {casa && <OcorrenciasDeHoje />}

        {!(contaNova && cartaoPassos) && !meuDia && <PrimeirosPassos pp={pp} modo={cartaoPassos ? "cartao" : "linha"} />}
        {temResumo && <ResumoSemana modo={cartaoResumo ? "cartao" : "linha"} />}

        {!contaNova && <div className="g-grade kpis">
          {frente === "casa" && kpiCasa}
          {frente === "loja" && <Kpi href="/gestao/app/estoque" icone={Package} tom="rosa" rotulo="Produtos acabando" valor={dados ? dados.acabando.length : "–"} apoio={dados?.produtosTotal === 1 ? "de 1 na prateleira" : `de ${dados?.produtosTotal ?? 0} na prateleira`} />}
          {!semAgenda && <Kpi href="/gestao/app/agenda" icone={Scissors} tom="pessego" rotulo="Atendimentos hoje" valor={dados ? ativos.length : "–"}
            apoio={dados ? (ativos.length ? `${feitos} ${feitos === 1 ? "concluído" : "concluídos"}` : "agenda livre") : " "}
            lado={dados && ativos.length > 0 ? <Anel parte={feitos / ativos.length} cor="var(--g-laranja)">{Math.round((feitos / ativos.length) * 100)}%</Anel> : undefined} />}
          {frente !== "casa" && kpiCasa}
          {vejoFinanceiro ? (
            <Kpi href={posso("caixa") ? "/gestao/app/caixa" : "/gestao/app/financeiro"} icone={Wallet} tom="menta" rotulo="Entrou hoje" valor={dados ? brl(dados.entrou) : "–"}
              apoio={dados && cuidoDoFinanceiro && dados.ajusteHoje < 0 ? `já sem ${brl(-dados.ajusteHoje)} devolvidos ou de crédito` : dados && cuidoDoFinanceiro && dados.saiu > 0 ? `saiu ${brl(dados.saiu)}` : posso("caixa") ? "ver o caixa" : "ver o financeiro"}
              lado={dados && cuidoDoFinanceiro ? <Tendencia valores={dados.entradas7} /> : undefined} />
          ) : (
            <Kpi href="/gestao/app/clientes" icone={PawPrint} tom="menta" rotulo="Pets cadastrados" valor={dados ? dados.pets : "–"} apoio="ver todos" />
          )}
          {!semAgenda && <Kpi href="/gestao/app/agenda" icone={CalendarDays} tom="lilas" rotulo="Nesta semana" valor={dados ? totalSemana : "–"} apoio={totalSemana === 1 ? "horário marcado" : "horários marcados"} />}
        </div>}

        {!contaNova && cuidoDoFinanceiro && dados && <RecebidoNaSemana valor={dados.recebidoSemana} hoje={dados.entrou} />}
        <MinhaComissao />
        {!cuidoDoFinanceiro && <MeuMes />}

        <div className={semAgenda ? "g-pilha g" : "g-duas"}>
          {!semAgenda && <section>
            <div className="g-card-t">
              <h2>{meuDia ? "Agenda de hoje do pet shop" : "Agenda de hoje"}</h2>
              {posso("agenda") && <Link className="g-btn fantasma p" href="/gestao/app/agenda?visao=semana">Ver a semana<ChevronRight /></Link>}
            </div>
            {fechadoHoje && !(casa && !banho) && <p className="g-aviso" role="status" style={{ marginBottom: 12 }}><span className="g-cresce"><b>{fechadoHoje}.</b> O pet shop não abre hoje.{ativos.some((a) => a.status !== "concluido") ? " Os horários abaixo continuam marcados: confira com o tutor ou remarque." : ""}</span></p>}
            {(carregando || erro) && !dados ? <Esqueleto /> : !dados?.ags.length ? (
              <div className="g-card">
                {!banho ? (
                  <Vazio mozart="acenando" titulo="Nenhum horário marcado para hoje" texto={casa ? `Serviços com hora marcada aparecem aqui. As estadias ficam em ${rotuloCasa}.` : "Serviços com hora marcada aparecem aqui."} />
                ) : contaNova && posso("clientes") ? (
                  <Vazio mozart="acenando" titulo="Nenhum horário ainda" texto={posso("agenda") ? "Marque o primeiro: o pet entra na hora, só com o nome e o tutor. O horário aparece aqui." : "Os horários marcados aparecem aqui."}>
                    {/* o próximo passo já está no alto da tela (e nos primeiros passos): aqui só sem passo na tela, para não repetir */}
                    {!passoNovo && posso("agenda") && <LinkDeGravar className="g-btn verde" href="/gestao/app/agenda?novo=1">Marcar o primeiro horário</LinkDeGravar>}
                  </Vazio>
                ) : (
                  <Vazio mozart="acenando" titulo="Nenhum banho marcado para hoje" texto="Que tal chamar quem está com o banho atrasado? O Mozart monta a lista para você.">
                    <button className="g-btn verde" onClick={() => abrirAssistente("Quem não vem há mais de um mês?")}>Ver quem está sumido</button>
                  </Vazio>
                )}
              </div>
            ) : (
              <div className="g-tempo">
                {dados.ags.map((a) => {
                  const fora = ["cancelado", "faltou"].includes(a.status);
                  return (
                    <div className={`g-hora-grupo${a.status === "concluido" ? " feito" : ""}${a.id === destaque?.id ? " agora" : ""}`} key={a.id} style={{ "--cor": a.servicos?.cor ?? "#f97316" } as React.CSSProperties}>
                      <time>{hora(a.inicio)}</time>
                      <span className="ponto" aria-hidden />
                      <div className="g-lb-par">
                        <button className={`g-ag${fora ? " apagado" : ""}`} onClick={() => setAberto(a.id)}>
                          {a.pets && <AvatarPet pet={a.pets} />}
                          <span className="t">
                            <b>{a.pets?.nome}</b>
                            <span className="serv"><i />{[nomeDosServicos(a), quemAtende.length > 1 && a.profissionais ? `com ${nomeNaEquipe(a.profissionais.nome, quemAtende.map((p) => p.nome))}` : null].filter(Boolean).join(" · ") || "Atendimento"}</span>
                            {/* o alerta vem antes de tudo: quem vai pegar o pet precisa ler antes de tocar */}
                            {a.pets?.alertas && !fora && <span className="g-agd-alerta">{alertaCurto(a.pets.alertas)}</span>}
                            {a.pets?.clientes?.nome && <span className="g-agd-tutor">Tutor: {a.pets.clientes.nome}</span>}
                          </span>
                          {semConta.has(a.id) ? <span className="g-tag laranja">Falta cobrar</span>
                            : semCobranca(a) ? <MarcaSemCobranca a={a} />
                            : a.status !== "marcado" && <span className={`g-tag ${STATUS_AGENDAMENTO[a.status].tom}`}>{STATUS_AGENDAMENTO[a.status].rotulo}</span>}
                          <ChevronRight size={18} className="g-muted g-so-pc" />
                        </button>
                        {posso("agenda") && <BotaoLembrete agendamento={a} doDia={dados.ags} aoMandar={() => void recarregar()} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>}

          <div className="g-pilha g">
            {primeiroOlhar && posso("clientes") && posso("agenda") && <DicasMozart semDicas={[...(sumidos.length ? ["sumidos"] : []), ...(niver.length ? ["niver"] : [])]} />}
            {atencao.length > 0 && (
              <section>
                <div className="g-card-t"><h2>Pede a sua atenção</h2><span className="g-tag amarelo">{atencao.length}</span></div>
                <div className="g-atencao">
                  {atencao.map((x) => x.href ? (
                    <Link key={x.texto} href={x.href}>
                      <Tile icone={x.icone} tom={x.tom} />
                      <span>{x.texto}</span>
                      <ChevronRight size={18} />
                    </Link>
                  ) : (
                    <button key={x.texto} type="button" onClick={x.aoTocar}>
                      <Tile icone={x.icone} tom={x.tom} />
                      <span>{x.texto}</span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {primeiroOlhar && <MetaMes />}

            {!contaNova && !semAgenda && <section className="g-card">
              <div className="g-card-t"><h3>Movimento da semana</h3><span className="g-muted g-pp">horários por dia</span></div>
              {!dados ? <Esqueleto linhas={2} /> : totalSemana ? <Barras itens={semana} destaque={(hoje.getDay() + 6) % 7} /> : <p className="g-muted g-p">Nenhum horário marcado nesta semana ainda.</p>}
            </section>}

            {dados && dados.servicosMes.length > 0 && (
              <section className="g-card">
                <div className="g-card-t"><h3>Serviços mais pedidos</h3><span className="g-muted g-pp">últimos 30 dias</span></div>
                <Ranking itens={dados.servicosMes} />
              </section>
            )}
          </div>
        </div>
      </div>

      {selecionado && !editando && <DetalheAgendamento agendamento={selecionado} aoFechar={() => setAberto(null)} aoMudar={() => void recarregar()} aoEditar={() => setEditando(selecionado)} />}
      {importando && <Importar tipo="clientes" aoFechar={() => setImportando(false)} aoTerminar={() => void recarregar()} />}
      {caderno && <FotoCaderno tipoInicial="clientes" aoFechar={() => setCaderno(false)} aoTerminar={() => void recarregar()} />}
      {chamando && <ChamarDeVolta aba={chamando} aoFechar={() => setChamando(null)} />}
      {lembretes && <LembretesDoDia dia={isoDia(somaDias(hoje, 1))} aoFechar={() => setLembretes(false)} aoMudar={() => void recarregar()} />}
      {editando && <FormAgendamento agendamento={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); setAberto(null); void recarregar(); }} />}
    </>
  );
}
