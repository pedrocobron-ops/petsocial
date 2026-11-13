"use client";

import { useEffect, useState } from "react";
import { Check, Clock, MessageCircle, Plus } from "lucide-react";
import { conferirCaixa, conferirValorAlto, formaPrincipal, lancarAReceber, lancarPago, quitarConta, type ItemLancamento, type PartePagamento } from "@/lib/gestao/dinheiro";
import {
  contaDasDiarias, contarDiarias, NOTA_PACOTE, lerConta, linhasDaConta, repartirPagamento, taxaNaConta, taxasGuardadas, textoComprovanteEstadia, textoDoPagamentoDaConta,
  type ContaDaEstadia, type EstadiaDoTutor, type Noite, type TaxaDaConta, type ValoresDaEstadia,
} from "@/lib/gestao/hotel";
import { taxasDe } from "@/lib/gestao/hotel-opcoes";
import { atrasoSugerido, ID_TAXA_ATRASO, NOME_TAXA_ATRASO } from "@/lib/gestao/feriados";
import { usaModulo } from "@/lib/gestao/modulos";
import type { Banco } from "@/lib/gestao/supabase";
import type { Lancamento, PacoteCliente, Servico } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, inicioDoDia, linkWhatsApp, soDigitos } from "@/lib/gestao/util";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvatarPet, Campo, Folha, mensagemDeErro, ok, useAvisos, useDados } from "../ui";
import { baixarEstoque, BuscaProduto, comProduto, encurtar, erroDaConta, faltaNoEstoque, LinhaDaConta, novaChave, produtosDaConta, useProdutosDaLoja, valorDaLinha, type ItemConta } from "../loja/conta";
import { AvisoCaixaFechado, CampoDinheiro, erroDeValor, EscolhaPagamento, fecharRecebimento, lembrarForma, pagaDepoisInicial, QuandoPaga, useCaixaAberto, usePagamento, type PagaDepois } from "../loja/pecas";
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

/** Outras estadias de hotel dos pets do mesmo tutor (para o desconto do segundo pet). */
export async function estadiasDoTutor(sb: Banco, petshopId: string, clienteId: string | null | undefined): Promise<EstadiaDoTutor[]> {
  if (!clienteId) return [];
  const r = await sb.from("estadias").select("id, pet_id, tipo, status, entrada, saida_prevista, saida, diarias_cobradas, pets!inner(cliente_id)")
    .eq("petshop_id", petshopId).eq("tipo", "hotel").neq("status", "cancelada").eq("pets.cliente_id", clienteId).order("entrada", { ascending: false }).limit(60);
  if (r.error) return [];
  return (r.data ?? []) as unknown as EstadiaDoTutor[];
}

type Pendencia = Pick<Lancamento, "id" | "valor" | "descricao" | "categoria" | "data" | "vencimento">;

/** Como o total das diárias foi montado, noite por noite (temporada, feriado, desconto do segundo pet). Só para quem recebe. */
export function NoitePorNoite({ noites, total }: { noites: Noite[]; total: number | null }) {
  return (
    <details className="g-ht-det">
      <summary>Diárias: {brl(total)} · ver noite por noite</summary>
      {noites.map((x) => (
        <div key={x.dia} className="noite">
          <span>{dataCurta(x.dia)} <small>{[x.temporada ?? `diária de ${brl(x.base)}`, x.temporada ? `${brl(x.cheia)}` : null, x.desconto > 0 ? `segundo pet: - ${brl(x.desconto)}` : null].filter(Boolean).join(" · ")}</small></span>
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
  const [agora] = useState(() => (pendente && estadia.saida ? new Date(estadia.saida) : new Date()));
  const contadas = pendente && estadia.diarias_cobradas ? estadia.diarias_cobradas : contarDiarias(estadia, agora);
  // feriados (preço da noite) e a taxa de busca fora do horário: só chegam para quem recebe
  const { calendario } = useCalendario();
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

  const { dados: pacotes } = useDados(async () =>
    (await pacotesParaEstadia(sb, petshop.id, [estadia.pet_id]).catch(() => [])).filter((p) => pacoteServe(p, estadia.tipo, servicos)),
  [petshop.id, estadia.pet_id]);
  // o que só quem recebe lê: o sinal e as taxas da reserva, as outras estadias do tutor e o que ele ainda deve
  const { dados: mais } = useDados(async () => {
    if (!vejoFinanceiro) return { valores: null as ValoresDaEstadia | null, outras: [] as EstadiaDoTutor[], pendencias: [] as Pendencia[] };
    const [v, outras, p] = await Promise.all([
      sb.from("estadias_valores").select("*").eq("estadia_id", estadia.id).maybeSingle(),
      estadia.tipo === "hotel" ? estadiasDoTutor(sb, petshop.id, tutor?.id) : Promise.resolve([]),
      tutor?.id ? sb.from("lancamentos").select("id, valor, descricao, categoria, data, vencimento").eq("petshop_id", petshop.id).eq("cliente_id", tutor.id).eq("tipo", "entrada").eq("pago", false).order("data").limit(20) : Promise.resolve({ data: [] }),
    ]);
    return { valores: (v.data ?? null) as ValoresDaEstadia | null, outras, pendencias: ((p as { data: Pendencia[] | null }).data ?? []) as Pendencia[] };
  }, [petshop.id, estadia.id, vejoFinanceiro]);
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
  const dasDiarias = pacote || !nValido ? { total: pacote ? 0 : null, noites: null } : contaDasDiarias(petshop, estadia, n, diaria, mais?.outras ?? [], agora);
  const somaTaxas = centavos(taxas.reduce((t, x) => t + x.total, 0));
  const somaItens = centavos(itens.reduce((t, i) => t + valorDaLinha(i), 0));
  const temMais = taxas.length > 0 || itens.length > 0;
  const soma = centavos((dasDiarias.total ?? 0) + somaTaxas + somaItens);
  const sinalVale = valores?.sinal != null && (valores.sinal_estado === "pago" || valores.sinal_estado === "a_receber");
  const sinal = sinalVale ? Number(valores!.sinal) : 0;
  // sinal a receber que já teve uma parte paga: o desconto é o sinal cheio; o que falta dele segue na conta à parte (ou é recebido junto)
  const sinalRecebido = sinalVale && valores!.sinal_estado === "a_receber" ? Number(valores!.sinal_recebido ?? 0) : 0;
  const calculado = dasDiarias.total == null && !temMais ? null : Math.max(0, centavos(soma - sinal));
  const valor = valorEditado === undefined ? calculado : valorEditado;
  const sobraDoSinal = sinal > 0 && valorEditado === undefined && soma < sinal ? centavos(sinal - soma) : 0;
  const cobra = vejoFinanceiro && Boolean(valor);

  // o que o tutor ainda deve: o sinal desta reserva (se ficou para depois) vem marcado; o resto, a pessoa decide
  const pendencias = (mais?.pendencias ?? []).map((p) => ({ ...p, valor: Number(p.valor), ehSinal: p.id === valores?.sinal_lancamento_id }));
  const marcada = (p: { id: string; ehSinal: boolean }) => junto[p.id] ?? p.ehSinal;
  const recebeJunto = depois.ativo && cobra ? [] : pendencias.filter(marcada);
  const somaJunto = centavos(recebeJunto.reduce((t, p) => t + p.valor, 0));
  const recebido = centavos((cobra ? valor ?? 0 : 0) + somaJunto);
  const fiado = cobra && depois.ativo;

  function montarConta(pg: ContaDaEstadia["pagamento"], lancamentoId: string | null, saida: string): ContaDaEstadia {
    const total = centavos((valor ?? 0) + sinal);
    return {
      v: 1, tipo: estadia.tipo, quando: saida, diarias: n, valor_diaria: diaria, noites: dasDiarias.noites, pacote: pacote?.nome ?? null,
      total_diarias: dasDiarias.total ?? 0, taxas,
      extras: itens.filter((i) => i.tipo === "extra" && (i.nome.trim() || i.valor)).map((i) => ({ nome: i.nome.trim() || "Extra", valor: i.valor ?? 0 })),
      produtos: produtosDaConta(itens).map((i) => ({ nome: i.nome, qtd: i.qtd, valor: i.valor ?? 0, total: valorDaLinha(i), ...(i.produtoId ? { produto_id: i.produtoId } : {}) })),
      soma, ajuste: centavos(total - soma), total, sinal, sinal_pago: valores?.sinal_estado === "pago" || recebeJunto.some((p) => p.ehSinal),
      a_pagar: valor ?? 0, pendencias: recebeJunto.filter((p) => !p.ehSinal).map((p) => ({ descricao: p.descricao || p.categoria, valor: p.valor })),
      pagamento: pg, lancamento_id: lancamentoId,
    };
  }

  /** As linhas do lançamento: só quando a conta tem mais do que as diárias (senão fica como sempre foi, sem itens). */
  function itensDoLancamento(conta: ContaDaEstadia): ItemLancamento[] | null {
    if (!temMais && !conta.sinal) return null;
    const linhas: ItemLancamento[] = [];
    if (conta.total_diarias > 0) linhas.push({ tipo: "servico", nome: `${nomeTipo(estadia.tipo)}: ${n} ${n === 1 ? "diária" : "diárias"}`, qtd: 1, valor: conta.total_diarias });
    for (const t of conta.taxas) linhas.push({ tipo: "extra", nome: t.nome, qtd: t.qtd, valor: t.valor });
    for (const e of conta.extras) linhas.push({ tipo: "extra", nome: e.nome, qtd: 1, valor: e.valor });
    for (const p of conta.produtos) linhas.push({ tipo: "produto", nome: p.nome, qtd: p.qtd, valor: p.valor, ...(p.produto_id ? { produto_id: p.produto_id } : {}) });
    if (conta.ajuste > 0) linhas.push({ tipo: "extra", nome: "Acréscimo", qtd: 1, valor: conta.ajuste });
    if (conta.sinal > 0) linhas.push({ tipo: "extra", nome: conta.sinal_pago ? "Sinal já pago" : "Sinal (conta à parte)", qtd: 1, valor: -conta.sinal });
    return linhas;
  }

  async function salvar() {
    if (salvando) return;
    if (!nValido) { avisarErro("Confira o número de diárias."); return; }
    if (atraso && comAtraso === null) { setErroAtraso(true); document.getElementById("g-ht-atraso")?.scrollIntoView({ block: "center", behavior: "smooth" }); avisarErro("Diga se a taxa de busca fora do horário entra na conta ou não."); return; }
    const valorRuim = erroDeValor(valor) ?? (vejoFinanceiro ? erroDaConta(itens, null, soma) : null);
    if (valorRuim) { avisarErro(valorRuim); return; }
    const rec = recebido > 0 ? (cobra ? fecharRecebimento(pagamento, depois, fiado ? valor! : recebido) : fecharRecebimento(pagamento, { ...depois, ativo: false }, recebido)) : null;
    if (rec && "erro" in rec) { setErroForma(rec.noCampo); avisarErro(rec.erro); return; }
    if (pacote) {
      if (pacote.total - pacote.usados < n) { avisarErro(`O pacote só tem ${pacote.total - pacote.usados} para usar e são ${n} diárias. Diminua as diárias ou cobre a diferença à parte.`); return; }
      if (venceu(pacote) && !(await confirmar({ titulo: "Pacote vencido", texto: `Este pacote venceu em ${dataCompleta(pacote.vence_em!)}. Usar mesmo assim?`, confirmar: "Usar mesmo assim" }))) return;
    }
    const falta = faltaNoEstoque(itens, produtos);
    if (falta.length && !(await confirmar({ titulo: falta.length === 1 ? "Esse produto passa do estoque" : "Esses produtos passam do estoque", texto: `${falta.join(" ")} Vender mesmo assim? O saldo fica negativo até você dar entrada no estoque.`, confirmar: "Vender mesmo assim" }))) return;
    if (rec && !("erro" in rec)) {
      if (!(await conferirValorAlto(rec.fiado ? valor : recebido, confirmar))) return;
      // o caixa fechou enquanto esta folha estava aberta: pergunta antes de receber fora dele
      if (!rec.fiado && !(await conferirCaixa(sb, petshop.id, confirmar))) return;
    }
    // check-out que ficou para cobrar e vai fechar sem valor: vira cortesia (sai da lista), e a pessoa confirma antes
    if (pendente && !pacote && !valor && !(await confirmar({ titulo: "Fechar sem cobrar?", texto: `A estadia de ${pet?.nome ?? "pet"} fica como cortesia e sai da lista de check-outs para cobrar.`, confirmar: "Sim, não cobrar" }))) return;
    setSalvando(true);
    try {
      const saida = pendente && estadia.saida ? estadia.saida : new Date().toISOString();
      // guarda o que foi cobrado. Só com pacote não entra dinheiro (0, com a nota). Valor em branco fica em branco; cortesia fica 0.
      const cobrado = !vejoFinanceiro ? (pacote ? 0 : calculado === 0 ? 0 : null) : pacote && !temMais && !sinal ? 0 : valor == null && !sinal ? null : centavos((valor ?? 0) + sinal);
      const comObs = pacote ? { obs: comNota(estadia.obs, NOTA_PACOTE) } : {};
      const r = pendente
        ? ok(await sb.from("estadias").update({ diarias_cobradas: n, valor_cobrado: cobrado ?? 0, ...comObs })
          .eq("id", estadia.id).eq("petshop_id", petshop.id).eq("status", "encerrada").is("valor_cobrado", null).select("id"))
        : ok(await sb.from("estadias").update({ status: "encerrada", saida, diarias_cobradas: n, valor_cobrado: cobrado, ...comObs })
          .eq("id", estadia.id).eq("petshop_id", petshop.id).eq("status", "em_casa").select("id"));
      if (!r.length) { avisar(pendente ? "Essa estadia já tinha sido acertada. Atualizei a lista." : "Esse check-out já tinha sido feito. Atualizei a lista."); aoGravar(); return; }
      const nome = pet?.nome ?? "O pet";
      const foi = pendente ? `Estadia de ${nome} acertada.` : `${nome} foi para casa.`;
      let recado = foi;
      if (pacote) {
        // mesma baixa da tela Pacotes: só grava se ninguém mexeu no meio do caminho; não lança dinheiro
        const usados = pacote.usados + n;
        const b = await sb.from("pacotes_clientes").update({ usados, ativo: usados < pacote.total })
          .eq("id", pacote.id).eq("petshop_id", petshop.id).eq("usados", pacote.usados).select("id");
        if (b.error || !b.data?.length) avisarErro("O check-out foi feito, mas não consegui dar baixa no pacote. Dê baixa pela tela Pacotes.");
        else recado = `${foi} ${n === 1 ? "1 uso" : `${n} usos`} do pacote, ${pacote.total - usados === 0 ? "que terminou" : `restam ${pacote.total - usados}`}.`;
      }
      let lancamentoId: string | null = null;
      let pg: ContaDaEstadia["pagamento"] = null;
      let dinheiroOk = true;
      if (rec && !("erro" in rec)) {
        const previa = montarConta(null, null, saida);
        const linhas = itensDoLancamento(previa);
        const resumo = [...previa.taxas.map((t) => t.nome), ...previa.extras.map((e) => e.nome), ...previa.produtos.map((p) => `${p.qtd.toLocaleString("pt-BR")} ${p.nome}`)].join(" + ");
        const descricao = encurtar(`${nomeTipo(estadia.tipo)}: ${n} ${n === 1 ? "diária" : "diárias"} · ${nome}${resumo ? ` + ${resumo}` : ""}`);
        try {
          if (rec.fiado) {
            const l = await lancarAReceber(sb, petshop.id, { valor: valor!, vencimento: rec.quando, categoria: "Creche e hotel", descricao, clienteId: tutor?.id ?? null, itens: linhas });
            lancamentoId = l.id; pg = { fiado: true, quando: rec.quando };
            recado = `${foi} ${brl(valor)} em A receber, para ${dataCurta(rec.quando)}.`;
          } else {
            lembrarForma(rec.forma);
            // um pagamento só para a conta da estadia e para as contas antigas: cada uma fica com a sua parte de cada forma
            const partes: PartePagamento[] = rec.pagamentos ?? [{ forma: rec.forma, valor: recebido }];
            const [daEstadia, ...dasOutras] = repartirPagamento(partes, [cobra ? valor! : 0, ...recebeJunto.map((p) => p.valor)]);
            if (cobra && valor) {
              const l = await lancarPago(sb, petshop.id, {
                tipo: "entrada", valor, forma: formaPrincipal(daEstadia), pagamentos: daEstadia.length > 1 ? daEstadia : null, categoria: "Creche e hotel", descricao, clienteId: tutor?.id ?? null, itens: linhas,
              });
              lancamentoId = l.id;
            }
            const falhas: string[] = [];
            for (const [i, p] of recebeJunto.entries()) {
              try { await quitarConta(sb, petshop.id, p.id, { forma: formaPrincipal(dasOutras[i]), pagamentos: dasOutras[i] }, p.valor); }
              catch (e) { falhas.push(`${p.descricao || p.categoria} (${mensagemDeErro(e)})`); }
            }
            if (falhas.length) { dinheiroOk = false; avisarErro(`${pendente ? "A estadia foi acertada" : "O check-out foi feito"}, mas não consegui dar baixa em: ${falhas.join("; ")}. Dê baixa pelo Financeiro, em A receber.`); }
            pg = { fiado: false, forma: rec.forma, pagamentos: rec.pagamentos };
            recado = `${foi} ${brl(recebido)} no financeiro.`;
          }
        } catch (e) {
          dinheiroOk = false;
          avisarErro(`${pendente ? "A estadia foi acertada" : "O check-out foi feito"}, mas ${rec.fiado ? "a conta a receber não foi anotada. Anote" : "o pagamento não foi lançado. Lance"} pelo Financeiro. (${e instanceof Error ? e.message : "erro"})`);
        }
      }
      try { await baixarEstoque(sb, petshop.id, user.id, itens); } catch (e) {
        avisarErro(`O estoque não baixou. Dê a saída pela tela de Estoque. (${mensagemDeErro(e)})`);
      }
      const conta = montarConta(pg, lancamentoId, saida);
      if (vejoFinanceiro && dinheiroOk) {
        // a conta como foi cobrada: o histórico e os relatórios leem daqui, sem refazer a conta
        const g = await sb.from("estadias_valores").upsert({ estadia_id: estadia.id, petshop_id: petshop.id, conta: conta as never }, { onConflict: "estadia_id" }).select("estadia_id");
        if (g.error) avisarErro(`O check-out foi feito, mas o detalhe da conta não foi guardado. (${g.error.message})`);
      }
      avisar(recado);
      if (vejoFinanceiro && dinheiroOk && (conta.total > 0 || conta.pendencias.length > 0)) setFechada({ conta, saida });
      else aoGravar();
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  if (fechada) return <ContaFechada estadia={estadia} conta={fechada.conta} saida={fechada.saida} aoPronto={aoGravar} pendente={pendente} />;

  const mudar = (chave: string, m: Partial<ItemConta>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...m } : i)));
  const rotuloDoBotao = salvando ? "Salvando…" : fiado ? `Anotar ${brl(valor)} a receber` : recebido > 0 ? `Receber ${brl(recebido)}` : pacote ? (pendente ? "Usar o pacote" : "Usar o pacote e encerrar") : pendente ? "Fechar sem cobrar" : "Fazer check-out";

  return (
    <Folha titulo={pendente ? `Receber a estadia${pet ? ` de ${pet.nome}` : ""}` : `Check-out${pet ? ` de ${pet.nome}` : ""}`} aoFechar={aoFechar} larga={vejoFinanceiro && temMais}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={salvar} disabled={salvando}>{rotuloDoBotao}</button>
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
        <Campo rotulo="Diárias" dica={nValido ? `${n} ${palavra}${vejoFinanceiro && diaria != null && !dasDiarias.noites ? ` × ${brl(diaria)}` : ""}` : undefined}
          erro={nValido ? null : "Use um número inteiro, a partir de 1."}>
          <input className="g-input g-tab" inputMode="numeric" value={diarias} onChange={(e) => { setDiarias(e.target.value); setValorEditado(undefined); }} />
        </Campo>
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
            {atraso && (
              <div id="g-ht-atraso" className={`g-ht-atraso${comAtraso === null ? "" : " ok"}`} role="group" aria-label="Taxa de busca fora do horário">
                <p><Clock aria-hidden style={{ width: 16, height: 16, verticalAlign: "-3px", marginRight: 6 }} /><b>Saída às {atraso.saiu.replace(":", "h")}, depois das {atraso.hora.replace(":", "h")}.</b> A taxa de busca fora do horário é de {brl(atraso.valor)}. Ela entra na conta?</p>
                <div className="g-seg g-ht-seg" role="group">
                  <button type="button" aria-pressed={comAtraso === true} onClick={() => { setComAtraso(true); setErroAtraso(false); setValorEditado(undefined); }}>Cobrar {brl(atraso.valor)}</button>
                  <button type="button" aria-pressed={comAtraso === false} onClick={() => { setComAtraso(false); setErroAtraso(false); setValorEditado(undefined); }}>Não cobrar a taxa</button>
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
                <button type="button" className="g-chip" onClick={() => setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome: "", qtd: 1, valor: null }])}><Plus />Outro extra</button>
              </div>
            </div>
            {(temMais || sinal > 0 || Boolean(dasDiarias.noites)) && (
              <div className="g-card areia g-ht-conta" role="status">
                <div className="l"><span>{pacote ? `Diárias pelo pacote (${n})` : `Diárias (${n})`}</span><span>{brl(dasDiarias.total ?? 0)}</span></div>
                {taxas.map((t) => <div key={t.id} className="l"><span>{t.nome}{t.por === "noite" ? ` (${t.qtd} × ${brl(t.valor)})` : ""}</span><span>{brl(t.total)}</span></div>)}
                {itens.filter((i) => valorDaLinha(i) > 0 || i.nome.trim()).map((i) => <div key={i.chave} className="l"><span>{i.tipo === "produto" ? `${i.qtd.toLocaleString("pt-BR")} × ${i.nome}` : i.nome.trim() || "Extra"}</span><span>{brl(valorDaLinha(i))}</span></div>)}
                <div className="l forte"><span>Total da estadia</span><span>{brl(soma)}</span></div>
                {sinal > 0 && <div className="l"><span>{valores?.sinal_estado === "pago" ? `Sinal já pago${valores.sinal_pago_em ? ` em ${dataCurta(valores.sinal_pago_em)}` : ""}` : sinalRecebido > 0 ? `Sinal combinado (${brl(sinalRecebido)} já recebidos, ${brl(centavos(sinal - sinalRecebido))} ainda a receber)` : "Sinal combinado (ainda a receber)"}</span><span>- {brl(sinal)}</span></div>}
                {sinal > 0 && <div className="l forte"><span>Falta receber</span><span>{brl(Math.max(0, centavos(soma - sinal)))}</span></div>}
                {sobraDoSinal > 0 && <div className="l fraca"><span>O sinal passa da conta em {brl(sobraDoSinal)}. Combine com o tutor o que fazer com a diferença.</span><span /></div>}
              </div>
            )}
            {(!pacote || temMais || sinal > 0) && <Campo rotulo="Valor a receber" erro={erroDeValor(valor)} dica={diaria == null && !temMais ? "A diária não foi combinada no check-in. Deixe em branco se não for cobrar." : valorEditado !== undefined && calculado != null && valor !== calculado ? `Pela conta seria ${brl(calculado)}. Você mudou o valor.` : "Deixe em branco se não for cobrar."}>
              <CampoDinheiro valor={valor} aoMudar={(v) => { setValorEditado(v); setErroForma(null); }} />
            </Campo>}
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
                {cobra
                  ? <QuandoPaga total={fiado ? valor! : recebido} pagamento={pagamento} aoPagamento={(e) => { setPagamento(e); setErroForma(null); }}
                      depois={depois} aoDepois={(d) => { setDepois(d); setErroForma(null); }} erro={erroForma} />
                  : <EscolhaPagamento valor={pagamento} aoMudar={(e) => { setPagamento(e); setErroForma(null); }} total={recebido} erro={erroForma} />}
                {somaJunto > 0 && !fiado && <p className="g-pp g-muted">Recebendo {brl(recebido)}: {brl(cobra ? valor ?? 0 : 0)} desta estadia e {brl(somaJunto)} de {recebeJunto.length === 1 ? "uma conta anterior" : "contas anteriores"}.</p>}
                {!fiado && <AvisoCaixaFechado aberto={caixa} />}
              </>
            ) : null}
          </>
        ) : pacote ? null : (
          <p className="g-muted g-p">O check-out encerra a estadia. A cobrança fica como pendência para quem cuida do financeiro acertar.</p>
        )}
      </div>
    </Folha>
  );
}

/* ---------- conta fechada: mandar o comprovante ---------- */

function zapDoComprovante(petshop: string, e: EstadiaCompleta, conta: ContaDaEstadia, saida: string) {
  const tutor = e.pets?.clientes;
  if (soDigitos(tutor?.telefone).length < 8) return null;
  return linkWhatsApp(tutor?.telefone, textoComprovanteEstadia({ petshop, tutor: tutor?.nome, pet: e.pets?.nome, entrada: e.entrada, saida, conta }));
}

function ContaFechada({ estadia, conta, saida, aoPronto, pendente }: { estadia: EstadiaCompleta; conta: ContaDaEstadia; saida: string; aoPronto: () => void; pendente?: boolean }) {
  const { petshop } = useGestao();
  const zap = zapDoComprovante(petshop.nome, estadia, conta, saida);
  const junto = centavos(conta.pendencias.reduce((t, p) => t + p.valor, 0));
  const fiado = conta.pagamento?.fiado;
  return (
    <Folha titulo="Conta fechada" aoFechar={aoPronto} rodape={<button type="button" className="g-btn sec" onClick={aoPronto}>Pronto</button>}>
      <div className="g-vd-recibo">
        <Tile icone={Check} tom="menta" tamanho="g" />
        <p className="g-num">{brl(centavos(conta.a_pagar + junto))}</p>
        <p><b>{fiado ? "Anotado em A receber." : conta.a_pagar + junto > 0 ? "Recebido." : "Check-out feito."}</b> {pendente ? `Estadia de ${estadia.pets?.nome ?? "pet"} acertada.` : `${estadia.pets?.nome ?? "O pet"} foi para casa.`}</p>
        {zap ? <a className="g-btn zap cheio" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar comprovante</a> : <p className="g-pp g-muted">O tutor está sem telefone na ficha: não dá para mandar o comprovante pelo WhatsApp.</p>}
        {zap && <p className="g-pp g-muted">O WhatsApp de {estadia.pets?.clientes?.nome ?? "quem trouxe o pet"} abre com o comprovante pronto e você só aperta enviar. Não é nota fiscal.</p>}
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
  const zap = conta ? zapDoComprovante(petshop.nome, e, conta, fim) : null;
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
        {e.status !== "cancelada" && <p className="g-p"><b>{n} {e.tipo === "hotel" ? (n === 1 ? "noite" : "noites") : n === 1 ? "diária" : "diárias"}</b>{e.mensalista ? " · mensalista" : e.obs?.includes(NOTA_PACOTE) ? " · saiu usando o pacote" : ""}</p>}
        {!vejoFinanceiro ? null : carregando && !dados ? <p className="g-muted g-p">Buscando a conta…</p> : conta ? (
          <div className="g-ht-conta">
            {linhasDaConta(conta).map((l, i) => <div key={i} className="l"><span>{l.texto}</span><span>{l.valor}</span></div>)}
            <div className="l forte"><span>Total da estadia</span><span>{brl(conta.total)}</span></div>
            {conta.sinal > 0 && <div className="l"><span>Sinal {conta.sinal_pago ? "já pago" : "combinado"}</span><span>- {brl(conta.sinal)}</span></div>}
            {conta.sinal > 0 && <div className="l"><span>Valor na saída</span><span>{brl(conta.a_pagar)}</span></div>}
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
      </div>
    </Folha>
  );
}
