"use client";

import AceiteDoLink from "@/components/gestao/agenda/aceite-do-link";
import { useEffect, useState } from "react";
import { Check, Clock, MessageCircle, Plus, Printer, Truck } from "lucide-react";
import { conferirCaixa, conferirValorAlto, formaPrincipal, parteDaChave, type ItemLancamento, type PartePagamento } from "@/lib/gestao/dinheiro";
import { casoDoErro, fazerTudoOuNada, partesOuNada, passoDoEstoque, ref, type Passo, type ResultadoDaOperacao } from "@/lib/gestao/tudo-ou-nada";
import { useOperacao } from "@/lib/gestao/uma-vez";
import {
  contaDasDiarias, contarDiarias, diasDasNoites, fechoDaConta, noitesAntesDaEntrada, NOTA_PACOTE, lerConta, linhasDaConta, repartirPagamento, taxaNaConta, taxasGuardadas, textoComprovanteEstadia, textoDaSobra, textoDoPagamentoDaConta,
  type ContaDaEstadia, type DestinoDaSobra, type EstadiaDoTutor, type Noite, type TaxaDaConta, type ValoresDaEstadia,
} from "@/lib/gestao/hotel";
import { taxasDe } from "@/lib/gestao/hotel-opcoes";
import { atrasoSugerido, ID_TAXA_ATRASO, NOME_TAXA_ATRASO } from "@/lib/gestao/feriados";
import { usaModulo } from "@/lib/gestao/modulos";
import type { Banco } from "@/lib/gestao/supabase";
import type { Lancamento, PacoteCliente, Servico } from "@/lib/gestao/tipos";
import { comValoresDeEstadia } from "@/lib/gestao/reservado";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { creditoDoTutor } from "@/lib/gestao/credito";
import { imprimirComprovante } from "@/lib/gestao/comprovante";
import { brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, inicioDoDia, isoDia, linkWhatsApp, precoDoServico, soDigitos } from "@/lib/gestao/util";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvatarPet, Campo, Folha, mensagemDeErro, useAvisos, useDados } from "../ui";
import { BuscaProduto, comProduto, encurtar, erroDaConta, faltaNoEstoque, LEVA_E_TRAZ, LinhaDaConta, novaChave, produtosDaConta, useProdutosDaLoja, valorDaLinha, type ItemConta } from "../loja/conta";
import { AvisoCaixaFechado, CampoDinheiro, ChipsForma, erroDeValor, EscolhaPagamento, fecharRecebimento, lembrarForma, pagaDepoisInicial, ParcelasNaTela, QuandoPaga, useAnotarParcelas, useCaixaAberto, usePagamento, type Forma, type PagaDepois } from "../loja/pecas";
import { idsDaOperacao } from "@/lib/gestao/maquininha";
import { ehDemora, mensagemDe } from "@/lib/gestao/erros";
import { ehAdiantado } from "./sinal";
import { PertencesNaSaida } from "../entrada/entrada";
import { descontoDaPromoNaEstadia } from "@/lib/gestao/promocoes";
import { taxaDoLevaTraz, taxaSugerida, temTaxa } from "@/lib/gestao/quadro";
import { LinhaPromoDaEstadia, usePromoDaEstadia } from "./promo-da-estadia";
import { horaCurta, nomeTipo, type EstadiaCompleta } from "./tipos";
import "./hotel.css";

const centavos = (n: number) => Math.round(n * 100) / 100;
const quando = (d: string | Date) => `${dataAmigavel(new Date(d))}, ${horaCurta(d)}`;

/* ---------- pacote do pet que serve para a estadia ---------- */

export { NOTA_PACOTE };
export const comNota = (obs: string | null, nota: string) => (obs?.includes(nota) ? obs : [obs?.trim().slice(0, 590 - nota.length), nota].filter(Boolean).join(" "));
export type PacoteDaEstadia = Pick<PacoteCliente, "id" | "nome" | "total" | "usados" | "vence_em" | "servico_id" | "pet_id">;
/** Pacotes ativos com saldo que valem para creche ou hotel: os de "qualquer serviço" e os ligados a um serviço do mesmo tipo. */
export async function pacotesParaEstadia(sb: Banco, petshopId: string, petIds: string[]): Promise<PacoteDaEstadia[]> {
  if (!petIds.length) return [];
  const r = await sb.from("pacotes_clientes").select("id, nome, total, usados, vence_em, servico_id, pet_id").eq("petshop_id", petshopId).in("pet_id", petIds).eq("ativo", true).order("vence_em", { nullsFirst: false }).limit(500);
  if (r.error) throw new Error(r.error.message);
  return ((r.data ?? []) as PacoteDaEstadia[]).filter((p) => p.usados < p.total);
}
export const pacoteServe = (p: PacoteDaEstadia, tipo: string, servicos: Servico[]) => !p.servico_id || servicos.find((s) => s.id === p.servico_id)?.categoria === tipo;
export const venceu = (p: Pick<PacoteCliente, "vence_em">) => Boolean(p.vence_em) && deIsoDia(p.vence_em!) < inicioDoDia(new Date());

/**
 * Outras estadias de hotel dos pets do mesmo tutor (para o desconto do segundo pet), com a diária combinada de cada uma:
 * quem paga cheio é o pet de diária mais alta (só quem recebe chama isto).
 */
export async function estadiasDoTutor(sb: Banco, petshopId: string, clienteId: string | null | undefined, estrito = false): Promise<EstadiaDoTutor[]> {
  if (!clienteId) return [];
  const r = await sb.from("estadias").select("id, pet_id, tipo, status, entrada, saida_prevista, saida, diarias_cobradas, criado_em, pets!inner(cliente_id)")
    .eq("petshop_id", petshopId).eq("tipo", "hotel").neq("status", "cancelada").eq("pets.cliente_id", clienteId).order("entrada", { ascending: false }).limit(60);
  // estrito (a conta do check-out): sem as outras estadias o desconto do segundo pet some; melhor avisar do que cobrar a mais
  if (r.error) { if (estrito) throw new Error(r.error.message); return []; }
  return comValoresDeEstadia(sb, petshopId, (r.data ?? []) as unknown as (EstadiaDoTutor & { id: string })[]);
}

type Pendencia = Pick<Lancamento, "id" | "valor" | "descricao" | "categoria" | "data" | "vencimento">;
/** Categoria da saída quando o hotel devolve ao tutor o que ele pagou a mais (o pet saiu antes). */
export const CATEGORIA_DEVOLUCAO_SAIDA = "Devolução";
/** Outro pet do mesmo tutor que saiu há pouco (mesma busca) e já pagou a taxa de busca fora do horário. */
type AtrasoJaCobrado = { pet: string; saiu: string; valor: number };

/** Como o total das diárias foi montado, noite por noite (temporada, feriado, desconto do segundo pet). Só para quem recebe. */
export function NoitePorNoite({ noites, total }: { noites: Noite[]; total: number | null }) {
  return (
    <details className="g-ht-det">
      <summary>Diárias: {brl(total)} · ver noite por noite</summary>
      {noites.map((x) => (
        <div key={x.dia} className="noite">
          <span>{dataCurta(x.dia)} <small>{[x.temporada ?? `diária de ${brl(x.base)}`, x.temporada && x.desconto > 0 ? `${brl(x.cheia)}` : null, x.desconto > 0 ? `segundo pet: - ${brl(x.desconto)}` : null].filter(Boolean).join(" · ")}</small></span>
          <b className="g-tab">{brl(x.valor)}</b>
        </div>
      ))}
    </details>
  );
}

/* ---------- check-out ---------- */

/**
 * Check-out com a conta inteira: diárias (noite a noite quando há temporada ou desconto do segundo pet), taxas marcadas,
 * extras, produtos do estoque, o sinal descontado e as contas antigas do tutor recebidas junto.
 * Com todas as opções desligadas e nada a mais na conta, grava exatamente o que sempre gravou.
 *
 * `pendente`: a estadia já foi encerrada por quem não mexe com dinheiro e ficou sem cobrança. A mesma folha fecha a conta
 * dela (com as mesmas regras, taxas, sinal e a sugestão de taxa de busca fora do horário pela hora em que o pet saiu),
 * sem mexer na hora da saída.
 */
export default function CheckOut({ estadia, aoFechar, aoGravar, pendente = false }: { estadia: EstadiaCompleta; aoFechar: () => void; aoGravar: () => void; pendente?: boolean }) {
  const { sb, petshop, servicos, vejoFinanceiro, user } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const anotarParcelas = useAnotarParcelas();
  const [agora] = useState(() => (pendente && estadia.saida ? new Date(estadia.saida) : new Date()));
  const contadas = pendente && estadia.diarias_cobradas ? estadia.diarias_cobradas : contarDiarias(estadia, agora);
  // feriados (preço da noite) e a taxa de busca fora do horário: só chegam para quem recebe
  const { calendario, pronto: calendarioPronto } = useCalendario();
  const atraso = vejoFinanceiro && !estadia.mensalista ? atrasoSugerido(estadia.tipo, agora, calendario?.atraso) : null;
  // a taxa de atraso nunca entra sozinha: null = a pessoa ainda não disse se cobra ou não
  const [comAtraso, setComAtraso] = useState<boolean | null>(null);
  const [erroAtraso, setErroAtraso] = useState(false);
  const [diarias, setDiarias] = useState(String(contadas));
  const [valorEditado, setValorEditado] = useState<number | null | undefined>(undefined);
  // mesmo recebimento da comanda: uma forma, dividido em até três, ou "Cliente paga depois"
  const [pagamento, setPagamento] = usePagamento();
  const [depois, setDepois] = useState<PagaDepois>(pagaDepoisInicial);
  const [erroForma, setErroForma] = useState<string | null>(null);
  const caixa = useCaixaAberto();
  const [comPacote, setComPacote] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [marcadas, setMarcadas] = useState<string[] | null>(null);
  const [itens, setItens] = useState<ItemConta[]>([]);
  const [junto, setJunto] = useState<Record<string, boolean>>({});
  const [fechada, setFechada] = useState<{ conta: ContaDaEstadia; saida: string } | null>(null);
  const vendeProdutos = usaModulo(petshop, "loja");
  const { produtos, carregando: buscandoProdutos, erro: erroProdutos } = useProdutosDaLoja();

  const pet = estadia.pets, tutor = pet?.clientes;
  const n = Number(diarias);
  const nValido = Number.isInteger(n) && n >= 1;
  const palavra = estadia.tipo === "hotel" ? (n === 1 ? "noite" : "noites") : (n === 1 ? "dia" : "dias");

  const { dados: pacotes, erro: erroPacotes, recarregar: lerPacotes } = useDados(async () =>
    (await pacotesParaEstadia(sb, petshop.id, [estadia.pet_id])).filter((p) => pacoteServe(p, estadia.tipo, servicos)),
  [petshop.id, estadia.pet_id]);
  // o que só quem recebe lê: o sinal e as taxas da reserva, as outras estadias do tutor e o que ele ainda deve
  // Tudo junto, e só então a conta aparece: sem o sinal pago, o desconto do segundo pet ou o crédito, o valor sairia cheio
  // (e quem é rápido cobraria o sinal duas vezes). Se uma leitura falha, a folha avisa e não mostra valor nenhum.
  const { dados: mais, erro: erroMais, recarregar: lerMais } = useDados(async () => {
    if (!vejoFinanceiro) return { valores: null as ValoresDaEstadia | null, outras: [] as EstadiaDoTutor[], pendencias: [] as Pendencia[], credito: 0, atrasoJa: null as AtrasoJaCobrado | null };
    const [v, outras, pendencias, credito, atrasoJa] = await Promise.all([
      sb.from("estadias_valores").select("*").eq("estadia_id", estadia.id).maybeSingle().then((r) => { if (r.error) throw new Error(r.error.message); return r.data; }),
      estadia.tipo === "hotel" ? estadiasDoTutor(sb, petshop.id, tutor?.id, true) : Promise.resolve([]),
      // todas as contas abertas do tutor (em páginas: o banco entrega no máximo mil por vez)
      tutor?.id ? lerTudo<Pendencia>((de, ate, contar) => sb.from("lancamentos").select("id, valor, descricao, categoria, data, vencimento", contando(contar)).eq("petshop_id", petshop.id).eq("cliente_id", tutor.id).eq("tipo", "entrada").eq("pago", false).order("data").order("id").range(de, ate)) : Promise.resolve([] as Pendencia[]),
      creditoDoTutor(sb, petshop.id, tutor?.id).then((c) => c.saldo),
      atrasoJaCobrado(sb, petshop.id, tutor?.id, estadia, agora),
    ]);
    return { valores: (v ?? null) as ValoresDaEstadia | null, outras, pendencias: (pendencias ?? []) as Pendencia[], credito, atrasoJa };
  }, [petshop.id, estadia.id, vejoFinanceiro]);
  // a conta só vale com tudo lido: pacotes, sinal, taxas, outras estadias do tutor, contas antigas, crédito e o calendário (feriados)
  const contaPronta = pacotes != null && mais != null && (!vejoFinanceiro || calendarioPronto);
  const erroDaLeitura = contaPronta ? null : erroMais ?? erroPacotes;
  const valores = mais?.valores ?? null;

  // quem tem pacote com saldo sai usando o pacote, a não ser que a pessoa escolha cobrar a diária
  const [escolheu, setEscolheu] = useState(false);
  useEffect(() => {
    if (escolheu || comPacote || !pacotes?.length) return;
    const serve = pacotes.find((p) => p.total - p.usados >= contadas && !venceu(p));
    if (serve) setComPacote(serve.id);
  }, [pacotes, escolheu, comPacote, contadas]);
  const pacote = (pacotes ?? []).find((p) => p.id === comPacote) ?? null;

  // taxas: as que o dono definiu; vêm marcadas as que foram combinadas na reserva
  const opTaxas = taxasDe(petshop);
  const daReserva = taxasGuardadas(valores);
  const taxasPossiveis = vejoFinanceiro ? [...(opTaxas.ativo ? opTaxas.lista : []), ...daReserva.filter((t) => !opTaxas.ativo || !opTaxas.lista.some((x) => x.id === t.id))] : [];
  const idsMarcados = marcadas ?? daReserva.map((t) => t.id);
  const taxaDoAtraso: TaxaDaConta | null = atraso && comAtraso ? { id: ID_TAXA_ATRASO, nome: `${NOME_TAXA_ATRASO} (saída às ${atraso.saiu.replace(":", "h")})`, por: "fixa", valor: atraso.valor, qtd: 1, total: atraso.valor } : null;
  const taxas = [...taxasPossiveis.filter((t) => idsMarcados.includes(t.id)).map((t) => taxaNaConta(daReserva.find((x) => x.id === t.id) ?? t, nValido ? n : 1)), ...(taxaDoAtraso ? [taxaDoAtraso] : [])];

  // a conta
  const diaria = estadia.valor_diaria == null ? null : Number(estadia.valor_diaria);
  const dasDiarias = pacote || !nValido ? { total: pacote ? 0 : null, noites: null } : contaDasDiarias(petshop, estadia, n, diaria, mais?.outras ?? [], agora, agora);
  // mais noites do que as datas mostram (check-in anotado depois da chegada): as noites a mais contam antes da entrada, nunca em dia que ainda não chegou
  const noitesAntes = estadia.tipo === "hotel" && dasDiarias.noites ? noitesAntesDaEntrada(estadia.entrada, dasDiarias.noites.map((x) => x.dia)) : [];
  const passaDasDatas = estadia.tipo === "hotel" && !pendente && nValido && n > contadas;
  // promoção em dias fracos (a cópia que o banco pôs na reserva): desconto só nas noites (hotel) ou no dia (creche) que caem
  // nos dias dela. Uma linha à parte na conta, que a pessoa pode tirar antes de receber. Pacote: nada a descontar.
  const promoDaEstadia = usePromoDaEstadia(estadia.id, estadia.promo);
  const promoAtiva = vejoFinanceiro && !estadia.mensalista && !pacote && promoDaEstadia.promo && !promoDaEstadia.promo.tirada ? promoDaEstadia.promo : null;
  const noitesDaConta = dasDiarias.noites ? dasDiarias.noites.map((x) => ({ dia: x.dia, valor: x.valor }))
    : nValido && diaria != null ? diasDasNoites(estadia.entrada, n, agora).map((d) => ({ dia: d, valor: diaria })) : [];
  const daPromo = promoAtiva && dasDiarias.total != null ? descontoDaPromoNaEstadia(promoAtiva, noitesDaConta) : { valor: 0, dias: [] as string[] };
  const descontoPromo = Math.min(daPromo.valor, dasDiarias.total ?? 0);
  // leva e traz: a taxa de Meu pet shop é só uma sugestão (entra na conta com um toque)
  const comLevaTraz = estadia.leva_traz_buscar || estadia.leva_traz_levar;
  const taxaTaxi = taxaDoLevaTraz(petshop);
  const sugeridaTaxi = comLevaTraz && temTaxa(taxaTaxi) ? taxaSugerida(taxaTaxi, estadia.endereco_leva_traz) : null;
  const temLevaTrazNaConta = itens.some((i) => i.tipo === "extra" && i.nome === LEVA_E_TRAZ);
  const somaTaxas = centavos(taxas.reduce((t, x) => t + x.total, 0));
  const somaItens = centavos(itens.reduce((t, i) => t + valorDaLinha(i), 0));
  const temMais = taxas.length > 0 || itens.length > 0 || descontoPromo > 0;
  const soma = centavos((dasDiarias.total ?? 0) - descontoPromo + somaTaxas + somaItens);
  const sinalVale = valores?.sinal != null && (valores.sinal_estado === "pago" || valores.sinal_estado === "a_receber");
  const sinal = sinalVale ? Number(valores!.sinal) : 0;
  // sinal a receber que já teve uma parte paga: o desconto é o sinal cheio; o que falta dele segue na conta à parte (ou é recebido junto)
  const sinalRecebido = sinalVale && valores!.sinal_estado === "a_receber" ? Number(valores!.sinal_recebido ?? 0) : 0;
  // sinal ainda a receber maior do que a estadia (o pet saiu antes): a conta do sinal sai de A receber e vale só o que já entrou dele
  const cortaSinal = sinalVale && valores!.sinal_estado === "a_receber" && soma < sinal && valorEditado === undefined;
  const sinalNaConta = cortaSinal ? sinalRecebido : sinal;
  const calculado = dasDiarias.total == null && !temMais ? null : Math.max(0, centavos(soma - sinalNaConta));
  const valor = valorEditado === undefined ? calculado : valorEditado;
  // o que foi pago antes passou do total: a pessoa escolhe devolver, deixar de crédito ou não devolver (nunca vira acréscimo)
  const sobraDoSinal = sinalNaConta > 0 && valorEditado === undefined && soma < sinalNaConta ? centavos(sinalNaConta - soma) : 0;
  const [destino, setDestino] = useState<DestinoDaSobra | null>(null);
  const [formaDevolucao, setFormaDevolucao] = useState<Forma | null>(null);
  const [notaSobra, setNotaSobra] = useState("");
  const [erroSobra, setErroSobra] = useState<string | null>(null);
  const cobra = vejoFinanceiro && Boolean(valor);
  // crédito do tutor (de uma estadia anterior): entra na conta, se a pessoa quiser
  const saldoCredito = mais?.credito ?? 0;
  const [usarCredito, setUsarCredito] = useState(true);
  const creditoUsado = cobra && saldoCredito > 0 && usarCredito && tutor?.id ? centavos(Math.min(saldoCredito, valor ?? 0)) : 0;
  const daEstadia = cobra ? centavos((valor ?? 0) - creditoUsado) : 0;
  // a taxa de busca já entrou na conta de outro pet do mesmo tutor nesta mesma busca: vem marcada para não cobrar de novo
  const atrasoJa = atraso ? mais?.atrasoJa ?? null : null;
  useEffect(() => { if (atrasoJa && comAtraso === null) setComAtraso(false); }, [atrasoJa, comAtraso]);

  // o que o tutor ainda deve: o sinal desta reserva (se ficou para depois) vem marcado; o resto, a pessoa decide
  const pendencias = (mais?.pendencias ?? []).map((p) => ({ ...p, valor: Number(p.valor), ehSinal: p.id === valores?.sinal_lancamento_id })).filter((p) => !(cortaSinal && p.ehSinal));
  const marcada = (p: { id: string; ehSinal: boolean }) => junto[p.id] ?? p.ehSinal;
  const recebeJunto = depois.ativo && daEstadia > 0 ? [] : pendencias.filter(marcada);
  const somaJunto = centavos(recebeJunto.reduce((t, p) => t + p.valor, 0));
  const recebido = centavos(daEstadia + somaJunto);
  const fiado = daEstadia > 0 && depois.ativo;

  function montarConta(pg: ContaDaEstadia["pagamento"], lancamentoId: string | null, saida: string, sobra: ContaDaEstadia["sobra"] = null): ContaDaEstadia {
    // com sobra, a estadia custou a soma; o que foi pago a mais fica em `sobra`, nunca como acréscimo
    const total = sobraDoSinal > 0 ? soma : centavos((valor ?? 0) + sinalNaConta);
    return {
      v: 1, tipo: estadia.tipo, quando: saida, diarias: n, valor_diaria: diaria, noites: dasDiarias.noites, pacote: pacote?.nome ?? null,
      total_diarias: dasDiarias.total ?? 0, taxas,
      extras: itens.filter((i) => i.tipo === "extra" && (i.nome.trim() || i.valor)).map((i) => ({ nome: i.nome.trim() || "Extra", valor: i.valor ?? 0 })),
      produtos: produtosDaConta(itens).map((i) => ({ nome: i.nome, qtd: i.qtd, valor: i.valor ?? 0, total: valorDaLinha(i), ...(i.produtoId ? { produto_id: i.produtoId } : {}) })),
      soma, ajuste: centavos(total - soma), total, sinal: sinalNaConta, sinal_pago: valores?.sinal_estado === "pago" || cortaSinal || recebeJunto.some((p) => p.ehSinal),
      a_pagar: centavos((valor ?? 0) - creditoUsado), pendencias: recebeJunto.filter((p) => !p.ehSinal).map((p) => ({ descricao: p.descricao || p.categoria, valor: p.valor })),
      pagamento: pg, lancamento_id: lancamentoId,
      ...(sobraDoSinal > 0 ? { sobra: sobra ?? { valor: sobraDoSinal, destino: destino ?? "mantido" } } : {}),
      ...(creditoUsado > 0 ? { credito_usado: creditoUsado } : {}),
      ...(descontoPromo > 0 && promoAtiva ? { promo: { id: promoAtiva.id, nome: promoAtiva.nome, tipo: promoAtiva.tipo, valor: promoAtiva.valor, desconto: descontoPromo, dias: daPromo.dias } } : {}),
    };
  }

  /** As linhas do lançamento: só quando a conta tem mais do que as diárias (senão fica como sempre foi, sem itens). */
  function itensDoLancamento(conta: ContaDaEstadia): ItemLancamento[] | null {
    if (!temMais && !conta.sinal && !conta.credito_usado) return null;
    const linhas: ItemLancamento[] = [];
    if (conta.total_diarias > 0) linhas.push({ tipo: "servico", nome: `${nomeTipo(estadia.tipo)}: ${n} ${n === 1 ? "diária" : "diárias"}`, qtd: 1, valor: conta.total_diarias });
    if (conta.promo && conta.promo.desconto > 0) linhas.push({ tipo: "extra", nome: `Promoção ${conta.promo.nome}`, qtd: 1, valor: -conta.promo.desconto });
    for (const t of conta.taxas) linhas.push({ tipo: "extra", nome: t.nome, qtd: t.qtd, valor: t.valor });
    for (const e of conta.extras) linhas.push({ tipo: "extra", nome: e.nome, qtd: 1, valor: e.valor });
    for (const p of conta.produtos) linhas.push({ tipo: "produto", nome: p.nome, qtd: p.qtd, valor: p.valor, ...(p.produto_id ? { produto_id: p.produto_id } : {}) });
    if (conta.ajuste > 0) linhas.push({ tipo: "extra", nome: "Acréscimo", qtd: 1, valor: conta.ajuste });
    if (conta.sinal > 0) linhas.push({ tipo: "extra", nome: conta.sinal_pago ? (ehAdiantado(valores) ? "Pago adiantado" : "Sinal já pago") : "Sinal (conta à parte)", qtd: 1, valor: -conta.sinal });
    if (conta.credito_usado) linhas.push({ tipo: "extra", nome: "Crédito do tutor usado", qtd: 1, valor: -conta.credito_usado });
    return linhas;
  }

  // trava na hora do primeiro toque e chave da operação: toque duplo não lança a conta duas vezes
  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando) return;
    if (!contaPronta) { avisarErro("Espere a conta terminar de carregar."); return; }
    if (!nValido) { avisarErro("Confira o número de diárias."); return; }
    if (atraso && comAtraso === null) { setErroAtraso(true); document.getElementById("g-ht-atraso")?.scrollIntoView({ block: "center", behavior: "smooth" }); avisarErro("Diga se a taxa de busca fora do horário entra na conta ou não."); return; }
    const valorRuim = erroDeValor(valor) ?? (vejoFinanceiro ? erroDaConta(itens, null, soma) : null);
    if (valorRuim) { avisarErro(valorRuim); return; }
    if (sobraDoSinal > 0) {
      const e = !destino ? `Diga o que fazer com os ${brl(sobraDoSinal)} pagos a mais.`
        : destino === "devolvido" && !formaDevolucao ? "Escolha como o valor foi devolvido."
        : destino === "credito" && !tutor?.id ? "A estadia está sem tutor na ficha: não dá para deixar crédito. Escolha devolver ou não devolver."
        : null;
      if (e) { setErroSobra(e); document.getElementById("g-ht-sobra")?.scrollIntoView({ block: "center", behavior: "smooth" }); avisarErro(e); return; }
      if (destino === "devolvido" && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    }
    const rec = recebido > 0 ? (daEstadia > 0 ? fecharRecebimento(pagamento, depois, fiado ? daEstadia : recebido) : fecharRecebimento(pagamento, { ...depois, ativo: false }, recebido)) : null;
    if (rec && "erro" in rec) { setErroForma(rec.noCampo); avisarErro(rec.erro); return; }
    if (pacote) {
      if (pacote.total - pacote.usados < n) { avisarErro(`O pacote só tem ${pacote.total - pacote.usados} para usar e são ${n} diárias. Diminua as diárias ou cobre a diferença à parte.`); return; }
      if (venceu(pacote) && !(await confirmar({ titulo: "Pacote vencido", texto: `Este pacote venceu em ${dataCompleta(pacote.vence_em!)}. Usar mesmo assim?`, confirmar: "Usar mesmo assim" }))) return;
    }
    const falta = faltaNoEstoque(itens, produtos);
    if (falta.length && !(await confirmar({ titulo: falta.length === 1 ? "Esse produto passa do estoque" : "Esses produtos passam do estoque", texto: `${falta.join(" ")} Vender mesmo assim? O saldo fica negativo até você dar entrada no estoque.`, confirmar: "Vender mesmo assim" }))) return;
    if (rec && !("erro" in rec)) {
      if (!(await conferirValorAlto(rec.fiado ? daEstadia : recebido, confirmar))) return;
      // o caixa fechou enquanto esta folha estava aberta: pergunta antes de receber fora dele
      if (!rec.fiado && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    }
    // check-out que ficou para cobrar e vai fechar sem valor: vira cortesia (sai da lista), e a pessoa confirma antes
    if (pendente && !pacote && !valor && !(await confirmar({ titulo: "Fechar sem cobrar?", texto: `A estadia de ${pet?.nome ?? "pet"} fica como cortesia e sai da lista de check-outs para cobrar.`, confirmar: "Sim, não cobrar" }))) return;
    setSalvando(true);
    try {
      const saida = pendente && estadia.saida ? estadia.saida : new Date().toISOString();
      // guarda o que foi cobrado. Só com pacote não entra dinheiro (0, com a nota). Valor em branco fica em branco; cortesia fica 0.
      // com sobra do sinal: a estadia custou a soma (mais o que ficou com o hotel, quando a pessoa escolheu não devolver)
      const cobrado = !vejoFinanceiro ? (pacote ? 0 : calculado === 0 ? 0 : null) : sobraDoSinal > 0 ? centavos(soma + (destino === "mantido" ? sobraDoSinal : 0))
        : pacote && !temMais && !sinalNaConta ? 0 : valor == null && !sinalNaConta ? null : centavos((valor ?? 0) + sinalNaConta);
      const obs = pacote ? { obs: comNota(estadia.obs, NOTA_PACOTE) } : {};
      const nome = pet?.nome ?? "O pet";
      const foi = pendente ? `Estadia de ${nome} acertada.` : `${nome} foi para casa.`;
      const hoje = isoDia(new Date());
      // tudo numa chamada só (o banco grava tudo ou nada): encerrar, pacote, sinal, crédito, devolução, pagamento, contas antigas,
      // estoque e a conta guardada. Se a internet cair no meio, nada fica pela metade; tocar de novo (mesma chave) não repete.
      const passos: Passo[] = [pendente
        // o banco só grava se a estadia ainda está sem valor (a coluna do valor não é filtrada pela API)
        ? { t: "estadia_acertar", id: estadia.id, diarias: n, valor: cobrado ?? 0, ...obs }
        : { t: "estadia_fechar", id: estadia.id, saida, diarias: n, valor_cobrado: cobrado, ...obs }];
      // o pacote soma no banco (nunca passa do total, mesmo com duas telas ao mesmo tempo); não lança dinheiro
      if (pacote) passos.push({ t: "pacote", id: pacote.id, n });
      // sinal a receber maior do que a estadia: a conta do que faltava dele sai de A receber (o que já entrou dele fica)
      if (cortaSinal && valores?.sinal_lancamento_id) passos.push({ t: "apagar_aberto", id: valores.sinal_lancamento_id });
      // crédito do tutor usado nesta conta
      if (creditoUsado > 0 && tutor?.id) passos.push({ t: "credito", cliente: tutor.id, valor: -creditoUsado, estadia: estadia.id, motivo: `Usado na estadia de ${nome}, saída ${dataCurta(saida)}`, chave: parteDaChave(chave, "credito-usado") });
      // pago antes a mais: devolve (saída de hoje), deixa de crédito ou fica com o hotel (com a nota)
      let sobra: ContaDaEstadia["sobra"] = null;
      let recado = foi;
      if (sobraDoSinal > 0 && destino) {
        sobra = { valor: sobraDoSinal, destino, nota: notaSobra.trim() || null };
        if (destino === "devolvido") {
          passos.push({ t: "lancamento", nome: "devolucao", chave: parteDaChave(chave, "devolucao"), linha: {
            tipo: "saida", valor: sobraDoSinal, forma: formaDevolucao!, categoria: CATEGORIA_DEVOLUCAO_SAIDA, cliente_id: tutor?.id ?? null, pago: true, data: hoje,
            descricao: encurtar(`Devolução: ${nomeTipo(estadia.tipo).toLowerCase()} de ${nome}, ${dataCurta(estadia.entrada)} a ${dataCurta(saida)} (pago antes ${brl(sinalNaConta)}, estadia ${brl(soma)})`),
          } });
          sobra = { ...sobra, forma: formaDevolucao, lancamento_id: ref("devolucao") };
          recado = `${foi} ${brl(sobraDoSinal)} devolvidos, lançados como saída de hoje.`;
        } else if (destino === "credito") {
          passos.push({ t: "credito", cliente: tutor!.id, valor: sobraDoSinal, estadia: estadia.id, motivo: `Pago a mais na estadia de ${nome} (${dataCurta(estadia.entrada)} a ${dataCurta(saida)})`, chave: parteDaChave(chave, "credito") });
          recado = `${foi} ${brl(sobraDoSinal)} ficaram de crédito para ${tutor?.nome?.split(/\s+/)[0] ?? "o tutor"}.`;
        } else recado = `${foi} Os ${brl(sobraDoSinal)} pagos a mais ficaram com o hotel${notaSobra.trim() ? ` (${notaSobra.trim()})` : ""}.`;
      }
      let pg: ContaDaEstadia["pagamento"] = null;
      let lancamento: string | null = null;
      if (rec && !("erro" in rec)) {
        const previa = montarConta(null, null, saida, sobra);
        const linhas = itensDoLancamento(previa);
        const resumo = [...previa.taxas.map((t) => t.nome), ...previa.extras.map((e) => e.nome), ...previa.produtos.map((p) => `${p.qtd.toLocaleString("pt-BR")} ${p.nome}`)].join(" + ");
        const descricao = encurtar(`${nomeTipo(estadia.tipo)}: ${n} ${n === 1 ? "diária" : "diárias"} · ${nome}${resumo ? ` + ${resumo}` : ""}`);
        if (rec.fiado) {
          passos.push({ t: "lancamento", nome: "principal", chave, linha: { tipo: "entrada", valor: daEstadia, forma: null, categoria: "Creche e hotel", descricao, data: rec.quando, vencimento: rec.quando, pago: false, cliente_id: tutor?.id ?? null, itens: linhas } });
          lancamento = ref("principal"); pg = { fiado: true, quando: rec.quando };
          recado = `${foi} ${brl(daEstadia)} em A receber, para ${dataCurta(rec.quando)}.`;
        } else {
          lembrarForma(rec.forma);
          // um pagamento só para a conta da estadia e para as contas antigas: cada uma fica com a sua parte de cada forma
          const partes: PartePagamento[] = rec.pagamentos ?? [{ forma: rec.forma, valor: recebido }];
          const [partesDaEstadia, ...dasOutras] = repartirPagamento(partes, [daEstadia, ...recebeJunto.map((p) => p.valor)]);
          if (daEstadia > 0) {
            passos.push({ t: "lancamento", nome: "principal", chave, linha: {
              tipo: "entrada", valor: daEstadia, forma: formaPrincipal(partesDaEstadia), pagamentos: partesOuNada(partesDaEstadia), categoria: "Creche e hotel", descricao, cliente_id: tutor?.id ?? null, itens: linhas, pago: true, data: hoje,
            } });
            lancamento = ref("principal");
          }
          // as contas antigas recebidas junto: o banco confere que cada uma ainda falta o mesmo valor que a tela mostrou
          for (const [i, p] of recebeJunto.entries()) {
            passos.push({ t: "receber", conta: p.id, valor: p.valor, forma: formaPrincipal(dasOutras[i]), pagamentos: partesOuNada(dasOutras[i]), esperado: p.valor, chave: parteDaChave(chave, "conta", p.id) });
          }
          pg = { fiado: false, forma: rec.forma, pagamentos: rec.pagamentos };
          recado = `${foi} ${brl(recebido)} no financeiro.`;
        }
      }
      // ligada à conta (ou à estadia, quando nada foi lançado agora), o banco sabe que o produto saiu vendido
      const estoque = passoDoEstoque(produtosDaConta(itens), chave, lancamento, lancamento ? null : estadia.id);
      if (estoque) passos.push(estoque);
      // a conta como foi cobrada: o histórico e os relatórios leem daqui, sem refazer a conta
      const conta = montarConta(pg, lancamento, saida, sobra);
      if (vejoFinanceiro) passos.push({ t: "estadia_valores", estadia: estadia.id, modo: "upsert", campos: { conta } });
      let feito: ResultadoDaOperacao;
      try {
        feito = await fazerTudoOuNada(sb, petshop.id, chave, { funcao: "estadia_checkout", estadia: estadia.id }, passos);
        if (rec && !("erro" in rec) && !rec.fiado) await anotarParcelas(idsDaOperacao(feito, passos), pagamento.parcelas);
      } catch (e) {
        if (casoDoErro(e) === "maestro:estadia_ja") { avisar(pendente ? "Essa estadia já tinha sido acertada. Atualizei a lista." : "Esse check-out já tinha sido feito. Atualizei a lista."); aoGravar(); return; }
        // o banco conferiu com o que já foi pago (sinal, crédito) e o valor passava do que falta: lê tudo de novo e mostra a conta certa
        if (casoDoErro(e) === "maestro:passa_do_devido") { avisarErro(`Nada foi cobrado. ${mensagemDeErro(e)}`); setValorEditado(undefined); void lerMais(); return; }
        // nada ficou gravado (ou a resposta não chegou): a mesma chave na nova tentativa não lança nada duas vezes
        // demorou demais: sem o texto técnico; a nova tentativa usa a mesma chave, então não cobra duas vezes
        if (ehDemora(mensagemDe(e))) avisarErro(`${pendente ? "A estadia não foi acertada" : "O check-out não foi feito"}: demorou demais e nada ficou pela metade. Toque de novo para tentar (não cobra duas vezes).`);
        else avisarErro(`${pendente ? "A estadia não foi acertada" : "O check-out não foi feito"}: nada ficou pela metade. Toque de novo para tentar. (${mensagemDeErro(e)})`);
        return false;
      }
      if (pacote) {
        const u = feito.passos.find((p) => p.t === "pacote");
        const usados = u?.usados ?? pacote.usados + n, total = u?.total ?? pacote.total;
        if (recado === foi) recado = `${foi} ${n === 1 ? "1 uso" : `${n} usos`} do pacote, ${total - usados === 0 ? "que terminou" : `restam ${total - usados}`}.`;
      }
      const principal = feito.ids?.principal ?? null;
      const gravada: ContaDaEstadia = { ...conta, lancamento_id: principal, ...(conta.sobra ? { sobra: { ...conta.sobra, lancamento_id: conta.sobra.destino === "devolvido" ? feito.ids?.devolucao ?? null : conta.sobra.lancamento_id ?? null } } : {}) };
      avisar(recado);
      if (vejoFinanceiro && (gravada.total > 0 || gravada.pendencias.length > 0 || gravada.sobra)) setFechada({ conta: gravada, saida });
      else aoGravar();
    } catch (e) { avisarErro(e); return false; } finally { setSalvando(false); }
  }

  if (fechada) return <ContaFechada estadia={estadia} conta={fechada.conta} saida={fechada.saida} aoPronto={aoGravar} pendente={pendente} />;

  const mudar = (chave: string, m: Partial<ItemConta>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...m } : i)));
  const rotuloDoBotao = salvando ? "Salvando…" : !contaPronta ? (erroDaLeitura ? "Conta não carregou" : "Carregando a conta…") : fiado ? `Anotar ${brl(daEstadia)} a receber` : recebido > 0 ? `Receber ${brl(recebido)}` : pacote ? (pendente ? "Usar o pacote" : "Usar o pacote e encerrar") : pendente ? "Fechar sem cobrar" : "Fazer check-out";

  return (
    <ParcelasNaTela.Provider value>
    <Folha titulo={pendente ? `Receber a estadia${pet ? ` de ${pet.nome}` : ""}` : `Check-out${pet ? ` de ${pet.nome}` : ""}`} aoFechar={aoFechar} larga={vejoFinanceiro && temMais}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando || !contaPronta} aria-busy={!contaPronta && !erroDaLeitura}>{rotuloDoBotao}</button>
      </>}>
      <div className="g-form">
        <div className="g-card areia">
          <div className="g-fila" style={{ flexWrap: "nowrap" }}>
            <AvatarPet pet={pet ?? { nome: "?" }} />
            <div className="g-cresce">
              <b style={{ display: "block" }}>{nomeTipo(estadia.tipo)} · {tutor?.nome ?? "Sem tutor"}</b>
              <span className="g-muted g-p">chegou {quando(estadia.entrada)} · {pendente ? `saiu ${quando(agora)}, sem cobrança` : `sai agora, ${horaCurta(agora)}`}</span>
            </div>
          </div>
        </div>
        {!pendente && <PertencesNaSaida visita={{ tipo: estadia.tipo === "hotel" ? "hotel" : "creche", estadiaId: estadia.id }} />}
        <Campo rotulo="Diárias" dica={nValido ? `${n} ${palavra}${vejoFinanceiro && diaria != null && !dasDiarias.noites ? ` × ${brl(diaria)}` : ""}` : undefined}
          erro={nValido ? null : "Use um número inteiro, a partir de 1."}>
          <input className="g-input g-tab" inputMode="numeric" value={diarias} onChange={(e) => { setDiarias(e.target.value); setValorEditado(undefined); }} />
        </Campo>
        {!contaPronta ? (
          erroDaLeitura ? (
            <div className="g-card areia" role="alert">
              <p className="g-p"><b>Não consegui buscar a conta inteira</b> (sinal, descontos, crédito ou o que o tutor deve). Sem isso o valor pode sair errado, então nada é cobrado.</p>
              <button type="button" className="g-btn sec p" onClick={() => { void lerMais(); void lerPacotes(); }}>Tentar de novo</button>
            </div>
          ) : (
            <div className="g-card areia g-ht-carregando" role="status" aria-live="polite">
              <span className="g-spin" aria-hidden />
              <p className="g-p">{vejoFinanceiro ? "Buscando o sinal, os descontos, o crédito e o que o tutor deve antes de mostrar o valor…" : "Carregando…"}</p>
            </div>
          )
        ) : <>
        {Boolean(pacotes?.length) && (
          <div className="g-campo">
            <span>Como fica a conta</span>
            <div className="g-chips">
              <button type="button" className="g-chip" aria-pressed={!pacote} onClick={() => { setEscolheu(true); setComPacote(null); setValorEditado(undefined); }}>{vejoFinanceiro ? "Cobrar a diária" : "Não usar o pacote"}</button>
              {pacotes!.map((p) => (
                <button key={p.id} type="button" className="g-chip" aria-pressed={comPacote === p.id} onClick={() => { setEscolheu(true); setComPacote(p.id); setValorEditado(undefined); }}>
                  Usar {nValido ? n : 1} do pacote (restam {p.total - p.usados}){venceu(p) ? " · vencido" : ""}
                </button>
              ))}
            </div>
            <small>{pacote ? `${pacote.nome}: dá baixa no pacote e não lança dinheiro pelas diárias.` : "O pet tem pacote com saldo. Dá para usar o pacote em vez de cobrar."}</small>
          </div>
        )}
        {vejoFinanceiro ? (
          <>
            {dasDiarias.noites && <NoitePorNoite noites={dasDiarias.noites} total={dasDiarias.total} />}
            {passaDasDatas && (
              <p className="g-ht-fechado" role="status"><Clock aria-hidden /><span>
                <b>Pelas datas anotadas {contadas === 1 ? "é 1 noite" : `são ${contadas} noites`} (chegou {quando(estadia.entrada)}).</b>{" "}
                {noitesAntes.length ? `As ${n - contadas === 1 ? "noite a mais conta" : "noites a mais contam"} antes da entrada anotada (${noitesAntes.length === 1 ? dataCurta(noitesAntes[0]) : `${dataCurta(noitesAntes[0])} a ${dataCurta(noitesAntes[noitesAntes.length - 1])}`}), e não em dias que ainda não chegaram. ` : ""}
                Se o pet chegou em outro dia, volte e acerte a entrada em Editar antes do check-out: assim cada noite sai no dia certo.
              </span></p>
            )}
            {atraso && (
              <div id="g-ht-atraso" className={`g-ht-atraso${comAtraso === null ? "" : " ok"}`} role="group" aria-label="Taxa de busca fora do horário">
                <p><Clock aria-hidden style={{ width: 16, height: 16, verticalAlign: "-3px", marginRight: 6 }} /><b>Saída às {atraso.saiu.replace(":", "h")}, depois das {atraso.hora.replace(":", "h")}.</b>{" "}
                  {atrasoJa
                    ? <>A taxa de busca fora do horário ({brl(atrasoJa.valor)}) já entrou na conta de {atrasoJa.pet}, que saiu às {atrasoJa.saiu.replace(":", "h")} na mesma busca. Cobrar de novo para {pet?.nome ?? "este pet"}?</>
                    : <>A taxa de busca fora do horário é de {brl(atraso.valor)}. Ela entra na conta?</>}</p>
                <div className="g-seg g-ht-seg" role="group">
                  <button type="button" aria-pressed={comAtraso === true} onClick={() => { setComAtraso(true); setErroAtraso(false); setValorEditado(undefined); }}>{atrasoJa ? `Cobrar de novo ${brl(atraso.valor)}` : `Cobrar ${brl(atraso.valor)}`}</button>
                  <button type="button" aria-pressed={comAtraso === false} onClick={() => { setComAtraso(false); setErroAtraso(false); setValorEditado(undefined); }}>{atrasoJa ? "Não cobrar de novo" : "Não cobrar a taxa"}</button>
                </div>
                {erroAtraso && comAtraso === null && <p className="g-erro" role="alert">Escolha uma das duas para fechar a conta.</p>}
              </div>
            )}
            {taxasPossiveis.length > 0 && (
              <div className="g-campo">
                <span>Taxas desta estadia</span>
                <div className="g-ht-marcar">
                  {taxasPossiveis.map((t) => {
                    const on = idsMarcados.includes(t.id), x = taxaNaConta(daReserva.find((y) => y.id === t.id) ?? t, nValido ? n : 1);
                    return (
                      <label key={t.id} className={on ? "on" : ""}>
                        <input type="checkbox" checked={on} onChange={(ev) => { setMarcadas(ev.target.checked ? [...idsMarcados, t.id] : idsMarcados.filter((i) => i !== t.id)); setValorEditado(undefined); }} />
                        <span className="t"><b>{t.nome}</b><small>{t.por === "noite" ? `${brl(x.valor)} por ${estadia.tipo === "hotel" ? "noite" : "dia"} × ${x.qtd}` : "uma vez na conta"}</small></span>
                        <b className="v">{brl(x.total)}</b>
                      </label>
                    );
                  })}
                </div>
                <small>Só entra na conta a taxa que você marcar.</small>
              </div>
            )}
            {promoDaEstadia.promo && !estadia.mensalista && (
              <LinhaPromoDaEstadia promo={promoDaEstadia.promo} tipo={estadia.tipo} valor={pacote ? null : descontoPromo} dias={pacote ? null : daPromo.dias}
                ocupado={promoDaEstadia.ocupado || salvando} podeMudar aoTirar={() => { setValorEditado(undefined); void promoDaEstadia.tirar(); }} aoPorDeVolta={() => { setValorEditado(undefined); void promoDaEstadia.porDeVolta(); }} />
            )}
            {comLevaTraz && !temLevaTrazNaConta && (
              <div className="g-card liso g-pilha p g-vd-taxi" role="group" aria-label="Taxa de leva e traz">
                <p className="g-pp" style={{ margin: 0 }}>
                  <Truck size={15} aria-hidden style={{ verticalAlign: "-3px", marginRight: 4 }} />
                  {`Esta estadia tem leva e traz (${estadia.leva_traz_buscar && estadia.leva_traz_levar ? "buscar e levar" : estadia.leva_traz_buscar ? "só buscar" : "só levar"})`}
                  {sugeridaTaxi ? <>{sugeridaTaxi.bairro ? <> para <b>{sugeridaTaxi.bairro}</b></> : null}: taxa de <b className="g-tab">{brl(sugeridaTaxi.valor)}</b>.</> : temTaxa(taxaTaxi) ? ". De qual bairro?" : "."}
                </p>
                <div className="g-chips">
                  {sugeridaTaxi && <button type="button" className="g-chip" onClick={() => { setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome: LEVA_E_TRAZ, qtd: 1, valor: sugeridaTaxi.valor }]); setValorEditado(undefined); }}><Plus />Pôr na conta · {brl(sugeridaTaxi.valor)}</button>}
                  {taxaTaxi.modo === "bairro" && taxaTaxi.bairros.filter((b) => b.nome !== sugeridaTaxi?.bairro).slice(0, 24).map((b) => (
                    <button key={b.nome} type="button" className="g-chip" onClick={() => { setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome: LEVA_E_TRAZ, qtd: 1, valor: b.valor }]); setValorEditado(undefined); }}>{b.nome} · {brl(b.valor)}</button>
                  ))}
                  {!temTaxa(taxaTaxi) && <button type="button" className="g-chip" onClick={() => setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome: LEVA_E_TRAZ, qtd: 1, valor: null }])}><Plus />{LEVA_E_TRAZ}</button>}
                  {/* bairro fora da lista: a linha entra sem valor, para digitar */}
                  {taxaTaxi.modo === "bairro" && temTaxa(taxaTaxi) && <button type="button" className="g-chip" onClick={() => { setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome: LEVA_E_TRAZ, qtd: 1, valor: null }]); setValorEditado(undefined); }}><Plus />Outro bairro</button>}
                </div>
                {estadia.leva_traz_buscar !== estadia.leva_traz_levar && temTaxa(taxaTaxi) && <small className="g-muted">O preço da lista é o do leva e traz combinado. Foi só uma viagem ({estadia.leva_traz_buscar ? "só buscar" : "só levar"})? Dá para mudar o valor na linha, depois de pôr na conta.</small>}
              </div>
            )}
            {itens.length > 0 && (
              <div className="g-card liso g-vd-itens">
                {itens.map((i) => (
                  <LinhaDaConta key={i.chave} item={i} produto={produtos.find((p) => p.id === i.produtoId)}
                    aoMudar={(m) => { mudar(i.chave, m); setValorEditado(undefined); }} aoTirar={() => { setItens((l) => l.filter((x) => x.chave !== i.chave)); setValorEditado(undefined); }} />
                ))}
              </div>
            )}
            <div className="g-campo">
              <span>Tem mais alguma coisa na conta?</span>
              {vendeProdutos && <BuscaProduto produtos={produtos} carregando={buscandoProdutos} erro={erroProdutos} itens={itens} aoEscolher={(p) => { setItens((l) => comProduto(l, p)); setValorEditado(undefined); }} />}
              <div className="g-chips g-vd-chips">
                {/* serviços da área desta estadia (Meu pet shop, área Hotel ou Creche): um toque e entram como extra, com o preço do porte */}
                {servicos.filter((s) => s.ativo && s.categoria === estadia.tipo).map((s) => {
                  const v = precoDoServico(s, pet?.porte);
                  return <button key={s.id} type="button" className="g-chip" onClick={() => { setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome: s.nome, qtd: 1, valor: v }]); setValorEditado(undefined); }}><Plus />{s.nome}{v != null ? ` · ${brl(v)}` : ""}</button>;
                })}
                <button type="button" className="g-chip" onClick={() => setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome: "", qtd: 1, valor: null }])}><Plus />Outro extra</button>
              </div>
            </div>
            {(temMais || sinal > 0 || Boolean(dasDiarias.noites)) && (
              <div className="g-card areia g-ht-conta" role="status">
                <div className="l"><span>{pacote ? `Diárias pelo pacote (${n})` : `Diárias (${n})`}</span><span>{brl(dasDiarias.total ?? 0)}</span></div>
                {descontoPromo > 0 && promoAtiva && <div className="l"><span>Promoção {promoAtiva.nome}</span><span>- {brl(descontoPromo)}</span></div>}
                {taxas.map((t) => <div key={t.id} className="l"><span>{t.nome}{t.por === "noite" ? ` (${t.qtd} × ${brl(t.valor)})` : ""}</span><span>{brl(t.total)}</span></div>)}
                {itens.filter((i) => valorDaLinha(i) > 0 || i.nome.trim()).map((i) => <div key={i.chave} className="l"><span>{i.tipo === "produto" ? `${i.qtd.toLocaleString("pt-BR")} × ${i.nome}` : i.nome.trim() || "Extra"}</span><span>{brl(valorDaLinha(i))}</span></div>)}
                <div className="l forte"><span>Total da estadia</span><span>{brl(soma)}</span></div>
                {cortaSinal ? (
                  <div className="l"><span>{sinalRecebido > 0 ? `Sinal: ${brl(sinalRecebido)} já recebidos (a conta dos ${brl(centavos(sinal - sinalRecebido))} que faltavam sai de A receber)` : `Sinal de ${brl(sinal)} ainda a receber: a conta sai de A receber`}</span><span>- {brl(sinalRecebido)}</span></div>
                ) : sinal > 0 && <div className="l"><span>{valores?.sinal_estado === "pago" ? `${sobraDoSinal > 0 ? "Pago antes" : ehAdiantado(valores) ? "Pago adiantado" : "Sinal já pago"}${valores.sinal_pago_em ? ` em ${dataCurta(valores.sinal_pago_em)}` : ""}` : sinalRecebido > 0 ? `Sinal combinado (${brl(sinalRecebido)} já recebidos, ${brl(centavos(sinal - sinalRecebido))} ainda a receber)` : "Sinal combinado (ainda a receber)"}</span><span>- {brl(sinal)}</span></div>}
                {sobraDoSinal > 0 && <div className="l forte"><span>Pago a mais</span><span>{brl(sobraDoSinal)}</span></div>}
                {sinalNaConta > 0 && !sobraDoSinal && <div className="l forte"><span>Falta receber</span><span>{brl(Math.max(0, centavos(soma - sinalNaConta)))}</span></div>}
              </div>
            )}
            {sobraDoSinal > 0 && (
              <div id="g-ht-sobra" className={`g-ht-atraso${destino ? " ok" : ""}`} role="group" aria-label="O que fazer com o que foi pago a mais">
                <p><b>{tutor?.nome ? `${tutor.nome.split(/\s+/)[0]} pagou` : "O tutor pagou"} {brl(sinalNaConta)} antes, e a estadia ficou em {brl(soma)}.</b> O que fazer com os {brl(sobraDoSinal)} a mais?</p>
                <div className="g-ht-marcar">
                  {([
                    ["devolvido", `Devolver ${brl(sobraDoSinal)}`, "Lança uma saída de hoje (Devolução), ligada a este tutor. O recebimento de antes não é apagado."],
                    ["credito", "Deixar como crédito do tutor", tutor?.id ? `Fica na ficha de ${tutor.nome ?? "o tutor"} e é oferecido no próximo check-out.` : "A estadia está sem tutor na ficha."],
                    ["mantido", "Não devolver (multa ou combinado)", "O valor fica com o hotel. Anote o motivo, ele aparece no comprovante."],
                  ] as const).map(([id, titulo, apoio]) => (
                    <label key={id} className={destino === id ? "on" : ""}>
                      <input type="radio" name="g-ht-sobra" checked={destino === id} disabled={id === "credito" && !tutor?.id} onChange={() => { setDestino(id); setErroSobra(null); }} />
                      <span className="t"><b>{titulo}</b><small>{apoio}</small></span>
                    </label>
                  ))}
                </div>
                {destino === "devolvido" && <ChipsForma valor={formaDevolucao} aoMudar={(f) => { setFormaDevolucao(f); setErroSobra(null); }} />}
                {destino === "devolvido" && formaDevolucao === "dinheiro" && <AvisoCaixaFechado aberto={caixa} />}
                {destino === "mantido" && <Campo rotulo="Motivo" dica="Opcional. Ex.: multa por saída antes, como combinado."><input className="g-input" value={notaSobra} maxLength={80} onChange={(e) => setNotaSobra(e.target.value)} /></Campo>}
                {erroSobra && <p className="g-erro" role="alert">{erroSobra}</p>}
              </div>
            )}
            {(!pacote || temMais || sinal > 0) && <Campo rotulo="Valor a receber" erro={erroDeValor(valor)} dica={diaria == null && !temMais ? "A diária não foi combinada no check-in. Deixe em branco se não for cobrar." : valorEditado !== undefined && calculado != null && valor !== calculado ? `Pela conta seria ${brl(calculado)}. Você mudou o valor.` : "Deixe em branco se não for cobrar."}>
              <CampoDinheiro valor={valor} aoMudar={(v) => { setValorEditado(v); setErroForma(null); }} />
            </Campo>}
            {saldoCredito > 0 && cobra && (
              <div className="g-ht-marcar">
                <label className={usarCredito ? "on" : ""}>
                  <input type="checkbox" checked={usarCredito} onChange={(e) => { setUsarCredito(e.target.checked); setErroForma(null); }} />
                  <span className="t"><b>Usar o crédito de {tutor?.nome?.split(/\s+/)[0] ?? "o tutor"}</b><small>Tem {brl(saldoCredito)} de crédito.{usarCredito ? ` Usa ${brl(creditoUsado)}${saldoCredito > creditoUsado ? ` e ficam ${brl(centavos(saldoCredito - creditoUsado))}` : ""}; a receber agora: ${brl(daEstadia)}.` : " Marque para descontar desta conta."}</small></span>
                  <b className="v">- {brl(usarCredito ? creditoUsado : 0)}</b>
                </label>
              </div>
            )}
            {pendencias.length > 0 && (
              <div className="g-campo">
                <span>{tutor?.nome ? `${tutor.nome.split(/\s+/)[0]} ainda deve` : "O tutor ainda deve"}</span>
                <div className="g-ht-marcar">
                  {pendencias.map((p) => (
                    <label key={p.id} className={marcada(p) && !fiado ? "on" : ""}>
                      <input type="checkbox" checked={marcada(p) && !fiado} disabled={Boolean(fiado)} onChange={(ev) => { setJunto((j) => ({ ...j, [p.id]: ev.target.checked })); setErroForma(null); }} />
                      <span className="t"><b>{p.ehSinal ? "Sinal desta reserva" : p.descricao || p.categoria}</b><small>{p.ehSinal ? (sinalRecebido > 0 ? "o que falta do sinal" : "ficou para pagar depois") : `de ${dataCurta(p.data)}`} · receber junto?</small></span>
                      <b className="v">{brl(p.valor)}</b>
                    </label>
                  ))}
                </div>
                <small>{fiado ? "Com a conta para depois, estas continuam em A receber como estão." : "Marcando, a conta antiga recebe baixa neste mesmo pagamento. Nada é lançado duas vezes."}</small>
              </div>
            )}
            {recebido > 0 ? (
              <>
                {daEstadia > 0
                  ? <QuandoPaga total={fiado ? daEstadia : recebido} pagamento={pagamento} aoPagamento={(e) => { setPagamento(e); setErroForma(null); }}
                      depois={depois} aoDepois={(d) => { setDepois(d); setErroForma(null); }} erro={erroForma} />
                  : <EscolhaPagamento valor={pagamento} aoMudar={(e) => { setPagamento(e); setErroForma(null); }} total={recebido} erro={erroForma} />}
                {somaJunto > 0 && !fiado && <p className="g-pp g-muted">Recebendo {brl(recebido)}: {brl(daEstadia)} desta estadia e {brl(somaJunto)} de {recebeJunto.length === 1 ? "uma conta anterior" : "contas anteriores"}.</p>}
                {!fiado && <AvisoCaixaFechado aberto={caixa} />}
              </>
            ) : null}
          </>
        ) : pacote ? null : (
          <p className="g-muted g-p">O check-out encerra a estadia. A cobrança fica como pendência para quem cuida do financeiro acertar.</p>
        )}
        </>}
      </div>
    </Folha>
    </ParcelasNaTela.Provider>
  );
}

/* ---------- conta fechada: mandar o comprovante ---------- */

type LojaDoComprovante = { nome: string; telefone?: string | null };
function zapDoComprovante(loja: LojaDoComprovante, e: EstadiaCompleta, conta: ContaDaEstadia, saida: string) {
  const tutor = e.pets?.clientes;
  if (soDigitos(tutor?.telefone).length < 8) return null;
  return linkWhatsApp(tutor?.telefone, textoComprovanteEstadia({ petshop: loja.nome, telefone: loja.telefone, tutor: tutor?.nome, pet: e.pets?.nome, entrada: e.entrada, saida, conta }));
}

/** O mesmo comprovante numa folha para imprimir ou salvar em PDF (não precisa de telefone na ficha). */
function imprimirDaEstadia(loja: LojaDoComprovante, e: EstadiaCompleta, conta: ContaDaEstadia, saida: string) {
  imprimirComprovante(textoComprovanteEstadia({ petshop: loja.nome, telefone: loja.telefone, tutor: e.pets?.clientes?.nome, pet: e.pets?.nome, entrada: e.entrada, saida, conta }), e.tipo === "hotel" ? "Comprovante de hospedagem" : "Comprovante da creche");
}

/**
 * Outro pet do mesmo tutor (não o mesmo pet) saiu há pouco (até 1 hora antes desta saída, no mesmo dia) com a taxa de busca fora do horário
 * na conta: é a mesma busca, e a taxa não precisa entrar de novo. Só quem recebe chama.
 */
async function atrasoJaCobrado(sb: Banco, petshopId: string, clienteId: string | null | undefined, esta: Pick<EstadiaCompleta, "id" | "pet_id">, agora: Date): Promise<AtrasoJaCobrado | null> {
  if (!clienteId) return null;
  const desde = new Date(Math.max(inicioDoDia(agora).getTime(), agora.getTime() - 3600e3)).toISOString();
  const r = await sb.from("estadias").select("id, saida, pets!inner(nome, cliente_id)").eq("petshop_id", petshopId).eq("status", "encerrada").neq("id", esta.id).neq("pet_id", esta.pet_id)
    .eq("pets.cliente_id", clienteId).gte("saida", desde).lte("saida", new Date(agora.getTime() + 60e3).toISOString()).order("saida", { ascending: false }).limit(10);
  const saidas = (r.data ?? []) as unknown as { id: string; saida: string; pets: { nome: string } | null }[];
  if (r.error || !saidas.length) return null;
  const v = await sb.from("estadias_valores").select("estadia_id, conta").eq("petshop_id", petshopId).in("estadia_id", saidas.map((x) => x.id));
  for (const x of saidas) {
    const c = lerConta((v.data ?? []).find((y) => y.estadia_id === x.id));
    const t = c?.taxas.find((k) => k.id === ID_TAXA_ATRASO);
    if (t) return { pet: x.pets?.nome ?? "outro pet", saiu: horaCurta(x.saida), valor: t.total };
  }
  return null;
}

function ContaFechada({ estadia, conta, saida, aoPronto, pendente }: { estadia: EstadiaCompleta; conta: ContaDaEstadia; saida: string; aoPronto: () => void; pendente?: boolean }) {
  const { petshop } = useGestao();
  const zap = zapDoComprovante(petshop, estadia, conta, saida);
  const junto = centavos(conta.pendencias.reduce((t, p) => t + p.valor, 0));
  const fiado = conta.pagamento?.fiado;
  const agora = centavos(conta.a_pagar + junto);
  const sobra = conta.sobra;
  return (
    <Folha titulo="Conta fechada" aoFechar={aoPronto} rodape={<button type="button" className="g-btn sec" onClick={aoPronto}>Pronto</button>}>
      <div className="g-vd-recibo">
        <Tile icone={Check} tom="menta" tamanho="g" />
        {/* o número grande é sempre o dinheiro desta saída (pode ser R$ 0,00); crédito, devolução e o pago a mais ficam numa linha à parte */}
        <p className="g-pp g-muted" style={{ margin: 0 }}>{fiado ? "Anotado em A receber" : "Recebido agora"}</p>
        <p className="g-num">{brl(agora)}</p>
        <p><b>{fiado ? "Anotado em A receber." : agora > 0 ? "Recebido." : conta.sinal > 0 || conta.credito_usado ? "Nada a receber na saída." : "Check-out feito."}</b> {pendente ? `Estadia de ${estadia.pets?.nome ?? "pet"} acertada.` : `${estadia.pets?.nome ?? "O pet"} foi para casa.`}</p>
        {(sobra || conta.credito_usado) && (
          <div className="g-ht-conta-fora">
            {sobra && <p><b>{sobra.destino === "credito" ? "Ficou de crédito para o tutor" : sobra.destino === "devolvido" ? textoDaSobra(sobra) : "Pago a mais, ficou com o hotel"}: {brl(sobra.valor)}</b></p>}
            {conta.credito_usado ? <p><b>Pago com o crédito do tutor: {brl(conta.credito_usado)}</b></p> : null}
          </div>
        )}
        <div className="g-ht-conta" style={{ width: "100%", textAlign: "left" }}>
          <div className="l forte"><span>Total da estadia</span><span>{brl(conta.total)}</span></div>
          {fechoDaConta(conta).map((l, i) => <div key={i} className="l"><span>{l.texto}</span><span>{l.valor}</span></div>)}
        </div>
        {zap ? <a className="g-btn zap cheio" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar comprovante</a> : <p className="g-pp g-muted">O tutor está sem telefone na ficha: não dá para mandar o comprovante pelo WhatsApp.</p>}
        <button type="button" className="g-btn fantasma cheio" onClick={() => imprimirDaEstadia(petshop, estadia, conta, saida)}><Printer />Imprimir comprovante</button>
        <p className="g-pp g-muted">{zap ? `O WhatsApp de ${estadia.pets?.clientes?.nome ?? "quem trouxe o pet"} abre com o comprovante pronto e você só aperta enviar. ` : ""}Imprimir abre a folha para imprimir ou salvar em PDF. Não é nota fiscal.</p>
      </div>
    </Folha>
  );
}

/* ---------- histórico: o detalhe de uma estadia encerrada (só leitura) ---------- */

export function DetalheDaEstadia({ estadia: e, aoFechar, aoCorrigir }: { estadia: EstadiaCompleta; aoFechar: () => void; aoCorrigir?: () => void }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { dados, carregando } = useDados(async () => {
    if (!vejoFinanceiro) return null;
    const r = await sb.from("estadias_valores").select("*").eq("estadia_id", e.id).maybeSingle();
    return (r.data ?? null) as ValoresDaEstadia | null;
  }, [e.id, vejoFinanceiro]);
  const conta = lerConta(dados);
  const fim = e.saida ?? e.saida_prevista ?? e.entrada;
  const n = e.diarias_cobradas ?? contarDiarias(e, new Date(fim));
  const zap = conta ? zapDoComprovante(petshop, e, conta, fim) : null;
  const junto = conta ? centavos(conta.pendencias.reduce((t, p) => t + p.valor, 0)) : 0;
  return (
    <Folha titulo={`Estadia de ${e.pets?.nome ?? "pet"}`} aoFechar={aoFechar}
      rodape={<>
        {aoCorrigir && <button type="button" className="g-btn sec" onClick={aoCorrigir}>Corrigir</button>}
        <button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button>
      </>}>
      <div className="g-pilha">
        <div className="g-card areia">
          <div className="g-fila" style={{ flexWrap: "nowrap" }}>
            <AvatarPet pet={e.pets ?? { nome: "?" }} />
            <div className="g-cresce">
              <b style={{ display: "block" }}>{nomeTipo(e.tipo)} · {e.pets?.clientes?.nome ?? "Sem tutor"}</b>
              <span className="g-muted g-p">{e.status === "cancelada" ? `reserva cancelada · era para ${dataCompleta(e.entrada)}` : `de ${dataCompleta(e.entrada)}, ${horaCurta(e.entrada)}, a ${dataCompleta(fim)}, ${horaCurta(fim)}`}</span>
            </div>
          </div>
        </div>
        {e.obs && <p className="g-muted g-p">{e.obs}</p>}
        <AceiteDoLink estadiaId={e.id} />
        {e.status !== "cancelada" && <p className="g-p"><b>{n} {e.tipo === "hotel" ? (n === 1 ? "noite" : "noites") : n === 1 ? "diária" : "diárias"}</b>{e.mensalista ? " · mensalista" : e.obs?.includes(NOTA_PACOTE) ? " · saiu usando o pacote" : ""}</p>}
        {!vejoFinanceiro ? null : carregando && !dados ? <p className="g-muted g-p">Buscando a conta…</p> : conta ? (
          <div className="g-ht-conta">
            {linhasDaConta(conta).map((l, i) => <div key={i} className="l"><span>{l.texto}</span><span>{l.valor}</span></div>)}
            <div className="l forte"><span>Total da estadia</span><span>{brl(conta.total)}</span></div>
            {fechoDaConta(conta).map((l, i) => <div key={i} className="l"><span>{l.texto}</span><span>{l.valor}</span></div>)}
            {conta.pendencias.map((p, i) => <div key={i} className="l fraca"><span>Recebido junto: {p.descricao}</span><span>{brl(p.valor)}</span></div>)}
            {conta.pagamento && <div className="l fraca"><span>Pagamento{junto > 0 ? ` (${brl(centavos(conta.a_pagar + junto))})` : ""}</span><span>{textoDoPagamentoDaConta(conta.pagamento)}</span></div>}
          </div>
        ) : e.status === "cancelada" ? (
          dados?.sinal_estado ? <p className="g-p">Sinal de {brl(dados.sinal)}: {dados.sinal_estado === "devolvido" ? `devolvido${dados.sinal_devolvido_em ? ` em ${dataCompleta(dados.sinal_devolvido_em)}` : ""}` : dados.sinal_estado === "mantido" ? "não foi devolvido" : dados.sinal_estado === "pago" ? "pago" : "a receber"}.</p> : null
        ) : (
          <div className="g-ht-conta">
            <div className="l"><span>Cobrado na saída</span><span>{e.mensalista ? "dia do plano" : e.obs?.includes(NOTA_PACOTE) ? "pacote" : e.valor_cobrado == null ? "sem valor lançado" : Number(e.valor_cobrado) === 0 ? "cortesia" : brl(e.valor_cobrado)}</span></div>
            {dados?.sinal_estado && <div className="l"><span>Sinal</span><span>{brl(dados.sinal)} · {dados.sinal_estado === "pago" ? "pago" : dados.sinal_estado === "a_receber" ? "a receber" : dados.sinal_estado}</span></div>}
            <div className="l fraca"><span>Esta estadia foi fechada sem o detalhe da conta (versão anterior, ou check-out de quem não vê valores).</span><span /></div>
          </div>
        )}
        {zap && <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar comprovante</a>}
        {conta && <button type="button" className="g-btn fantasma" onClick={() => imprimirDaEstadia(petshop, e, conta, fim)}><Printer />Imprimir comprovante</button>}
      </div>
    </Folha>
  );
}
