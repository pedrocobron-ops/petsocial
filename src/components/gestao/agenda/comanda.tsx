"use client";

import { useState } from "react";
import { Check, MessageCircle, Plus, Scissors, Ticket, Truck } from "lucide-react";
import type { AgendamentoCompleto, Lancamento, PacoteCliente } from "@/lib/gestao/tipos";
import { textoComprovante, textoComprovanteDaParte } from "@/lib/gestao/comprovante";
import { conferirCaixa, conferirValorAlto, formaPrincipal, pagamentoComCredito, parteDaChave, type PartePagamento } from "@/lib/gestao/dinheiro";
import { casoDoErro, fazerTudoOuNada, lancamentoDe, partesOuNada, passoDoEstoque, ref, type Passo } from "@/lib/gestao/tudo-ou-nada";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { creditoDoTutor } from "@/lib/gestao/credito";
import { UsarCredito } from "../financeiro/comum";
import { multaSugerida } from "@/lib/gestao/dinheiro-opcoes";
import { repartirPagamento } from "@/lib/gestao/hotel";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { servicosAMais } from "@/lib/gestao/servicos-do-horario";
import { brl, dataCompleta, hora, isoDia, linkWhatsApp, precoDoServico, soDigitos, somaDias } from "@/lib/gestao/util";
import { diaFechado, fraseDoDiaFechado } from "@/lib/gestao/feriados";
import { useGestao } from "../contexto";
import { usaModulo } from "@/lib/gestao/modulos";
import { travaDePreco } from "@/lib/gestao/dinheiro-opcoes";
import { Tile } from "../painel";
import { AvatarPet, Folha, avisarMudanca, mensagemDeErro, useAvisos, useDados, useSomenteLeitura } from "../ui";
import {
  BuscaProduto, comProduto, encurtar, erroDaConta, faltaNoEstoque, fecharContas, FechamentoDaConta, itensParaGravar, LEVA_E_TRAZ, LinhaDaConta, novaChave,
  produtosDaConta, resumoDosItens, useProdutosDaLoja, valorDaLinha, type ItemConta, type PagaDepois,
} from "../loja/conta";
import { AvisoCaixaFechado, fecharPagamento, pagoAMenos, useCaixaAberto, usePagamento } from "../loja/pecas";
import "@/app/(gestao)/gestao/app/agenda/agenda.css";

const centavos = (n: number) => Math.round(n * 100) / 100;
/** Uma conta que o tutor ficou devendo de antes (fiado, taxa de falta, resto de um pagamento). */
type Antiga = { id: string; valor: number; descricao: string | null; categoria: string; data: string; vencimento: string | null; agendamento_id: string | null; multa_recebida: number | null; multa_recebida_em: string | null };
/** Quanto do que entrou vai para cada conta antiga (das mais velhas para as mais novas). */
function alocarNasAntigas(antigas: Antiga[], sobra: number) {
  let resto = Math.round(sobra * 100);
  return antigas.map((c) => {
    const usa = Math.max(0, Math.min(resto, Math.round(c.valor * 100)));
    resto -= usa;
    return { conta: c, valor: usa / 100 };
  });
}

/**
 * Fechar a conta de um atendimento: serviço, produtos do estoque e extras numa conta só.
 * Lança a entrada (ou anota para receber depois), dá baixa nos produtos e deixa o atendimento como concluído.
 * Horário com mais de um serviço: cada serviço é uma linha, com o seu valor. Com `pacote`, o serviço principal
 * sai do pacote (um uso) e a conta cobra só o resto.
 */
export default function Comanda({ agendamento: a, pacote, aoFechar, aoPronto }: {
  agendamento: AgendamentoCompleto; pacote?: PacoteCliente | null; aoFechar: () => void; aoPronto: () => void;
}) {
  const { sb, petshop, user, vejoFinanceiro, cuidoDoFinanceiro, servicos } = useGestao();
  // quem não vende produtos não vê a busca do estoque: fica só o "Outro extra"
  const vendeProdutos = usaModulo(petshop, "loja");
  const { avisar, avisarErro, confirmar: perguntar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const { produtos, carregando, erro } = useProdutosDaLoja();
  const pet = a.pets, tutor = pet?.clientes;
  const servico = a.servicos?.nome ?? "Atendimento";
  // o serviço principal foi (ou vai ser agora) pelo pacote: não entra na conta
  const peloPacote = Boolean(pacote) || Boolean(a.pacote_cliente_id);
  const outrosDoHorario = servicosAMais(a);
  // horário que já usou o pacote: o banco só deixa quem cuida do financeiro juntar ou tirar serviços (a mesma trava de atendimento pago)
  const mexeNosServicos = !a.pacote_cliente_id || cuidoDoFinanceiro;
  // preço travado: quem só opera o caixa não tira da conta um serviço que já foi feito (seria um desconto); o banco também recusa
  const jaFeito = a.status === "concluido" || new Date(a.inicio) <= new Date();
  const naoTiraFeito = travaDePreco(petshop).ligada && !cuidoDoFinanceiro && jaFeito;
  const doHorario = new Set(outrosDoHorario.map((o) => o.servico_id));
  const [itens, setItens] = useState<ItemConta[]>(() => [
    ...(peloPacote ? [] : [{ chave: novaChave(), tipo: "servico" as const, nome: servico, qtd: 1, valor: a.preco == null ? null : Number(a.preco) }]),
    ...outrosDoHorario.map((o) => ({ chave: novaChave(), tipo: "servico" as const, nome: o.servicos?.nome ?? "Serviço", qtd: 1, valor: o.preco == null ? null : Number(o.preco), servicoId: o.servico_id })),
  ]);
  const [escolhendoServico, setEscolhendoServico] = useState(false);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [pagamento, setPagamento] = usePagamento();
  // "Cliente paga depois" (fiado): a conta fica em A receber, com o dia combinado (padrão: daqui a 7 dias)
  const [depois, setDepois] = useState<PagaDepois>(() => ({ ativo: false, quando: isoDia(somaDias(new Date(), 7)) }));
  const [erroForma, setErroForma] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // conta recebida: antes de fechar, oferece o comprovante no WhatsApp do tutor
  const [recebida, setRecebida] = useState<{ valor: number; zap: string; nota?: string } | null>(null);
  const caixa = useCaixaAberto();
  const op = useOperacao();

  const contas = fecharContas(itens, desconto);
  // o que o tutor deve de antes (só para quem recebe): pode entrar nesta conta e ter baixa no mesmo pagamento
  const { dados: antigasLidas } = useDados(async () => {
    if (!vejoFinanceiro || !tutor?.id) return [] as Antiga[];
    // todas as contas abertas do tutor (em páginas: o banco entrega no máximo mil por vez)
    const lidas = await lerTudo<Antiga>((de, ate, contar) => sb.from("lancamentos").select("id, valor, descricao, categoria, data, vencimento, agendamento_id, multa_recebida, multa_recebida_em", contando(contar))
      .eq("petshop_id", petshop.id).eq("cliente_id", tutor.id).eq("tipo", "entrada").eq("pago", false).order("data").order("id").range(de, ate)).catch(() => null);
    if (!lidas) return [] as Antiga[];
    return lidas.filter((l) => l.agendamento_id !== a.id).map((l) => ({ ...l, valor: Number(l.valor) }));
  }, [petshop.id, tutor?.id ?? "", vejoFinanceiro, a.id]);
  const antigas = antigasLidas ?? [];
  const devido = centavos(antigas.reduce((t, l) => t + l.valor, 0));
  const hojeIso = isoDia(new Date());
  const comMulta = antigas.reduce((t, l) => t + (multaSugerida(petshop, l, hojeIso)?.total ?? 0), 0);
  const [comDivida, setComDivida] = useState(false);
  // o que entra junto do que ele devia (nada quando a conta toda fica para depois)
  const junto = comDivida && !depois.ativo && devido > 0 ? devido : 0;
  // crédito do tutor (pagou a mais antes, por exemplo no hotel): paga a conta de hoje, ou uma parte dela
  const { dados: saldoCredito } = useDados(async () => (vejoFinanceiro && tutor?.id ? (await creditoDoTutor(sb, petshop.id, tutor.id)).saldo : 0), [petshop.id, tutor?.id ?? "", vejoFinanceiro]);
  const [usarCredito, setUsarCredito] = useState(true);
  const credito = usarCredito && (saldoCredito ?? 0) > 0 && contas.total > 0 ? centavos(Math.min(saldoCredito ?? 0, contas.total)) : 0;
  // o que sai do bolso agora: a conta de hoje sem o crédito, mais o que devia (se entrou junto)
  const daConta = centavos(contas.total - credito);
  const aPagar = centavos(daConta + junto);
  // pagou menos do que a conta (em qualquer forma): recebe o que entrou e o resto fica anotado para o tutor pagar depois
  const aMenos = aPagar > 0 && !depois.ativo ? pagoAMenos(pagamento, aPagar) : null;
  // com o que devia junto e o que entrou cobre a conta de hoje: a conta fecha e o resto vai para as contas antigas
  const parteDasAntigas = Boolean(aMenos && junto > 0 && aMenos.entregue >= daConta - 0.005);
  // dinheiro entregue a mais que a conta, com dívida de antes fora da conta: o "troco" pode pagar a dívida
  const entregue = !pagamento.dividido && pagamento.forma === "dinheiro" ? pagamento.entregue ?? 0 : 0;
  const trocoQuePaga = !comDivida && devido > 0 && !depois.ativo && entregue > daConta + 0.005 ? centavos(Math.min(devido, entregue - daConta)) : 0;
  const primeiroNome = tutor?.nome?.split(" ")[0] ?? "O tutor";
  const vendidos = produtosDaConta(itens);
  const temLevaTraz = itens.some((i) => i.tipo === "extra" && i.nome === LEVA_E_TRAZ);
  // atendimento já concluído e conta zerada: quem recebe ainda pode dizer "não vou cobrar" (uma vez)
  const nadaAFazer = contas.total <= 0 && junto <= 0 && a.status === "concluido" && !vendidos.length && !pacote && (a.sem_cobranca || !vejoFinanceiro);
  // serviços da lista do pet shop que ainda não estão nesta conta (para juntar mais um na hora de fechar)
  const servicosNaConta = itens.filter((i) => i.tipo === "servico" && i.servicoId).map((i) => i.servicoId!);
  const servicosParaJuntar = servicos.filter((x) => x.ativo && x.id !== a.servico_id && !servicosNaConta.includes(x.id));
  const outroServico = (id: string) => {
    const x = servicos.find((y) => y.id === id);
    if (!x) return;
    setItens((l) => {
      // os serviços ficam juntos, antes dos produtos e dos extras
      const depois = l.findIndex((i) => i.tipo !== "servico");
      const linha: ItemConta = { chave: novaChave(), tipo: "servico", nome: x.nome, qtd: 1, valor: precoDoServico(x, pet?.porte), servicoId: x.id };
      return depois < 0 ? [...l, linha] : [...l.slice(0, depois), linha, ...l.slice(depois)];
    });
    setEscolhendoServico(false);
  };
  const mudar = (chave: string, m: Partial<ItemConta>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...m } : i)));
  const extra = (nome: string) => setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome, qtd: 1, valor: null }]);

  /** Mesma categoria do recebimento simples; creche e hotel vão para a deles; conta só de produto vira venda. */
  function categoria() {
    const doServico = itens.filter((i) => i.tipo !== "produto").reduce((t, i) => t + valorDaLinha(i), 0);
    if (doServico <= 0 && vendidos.length) return "Venda de produtos";
    return a.servicos?.categoria === "creche" || a.servicos?.categoria === "hotel" ? "Creche e hotel" : "Banho e tosa";
  }

  // o crédito do tutor e o que ele deve de antes chegam depois da folha abrir: até lá, nada de valor no botão (sem o crédito, sairia cheio)
  const lendoConta = vejoFinanceiro && (antigasLidas == null || saldoCredito == null);
  const confirmar = () => (lendoConta ? undefined : op.fazer(gravarConta));
  async function gravarConta(chave: string): Promise<boolean> {
    if (nadaAFazer || somenteLeitura()) return false;
    const problema = erroDaConta(itens, desconto, contas.total);
    if (problema) { avisarErro(problema); return false; }
    const fiado = depois.ativo && contas.total > 0;
    if (fiado && (!depois.quando || depois.quando < isoDia(new Date()))) { setErroForma(depois.quando ? "Essa data já passou. Escolha um dia de hoje em diante." : "Escolha um dia de hoje em diante."); avisarErro(depois.quando ? "A data em que o cliente vai pagar já passou. Escolha um dia de hoje em diante." : "Escolha quando o cliente vai pagar."); return false; }
    if (aMenos && !parteDasAntigas) return receberParte(chave, aMenos);
    // o que entra agora: a conta (e o que devia, se entrou junto); pago em parte, o que o cliente deu
    const recebendo = aMenos ? aMenos.entregue : aPagar;
    const pg = aPagar > 0 && !fiado ? (aMenos ? { forma: aMenos.forma, pagamentos: aMenos.pagamentos } : fecharPagamento(pagamento, aPagar)) : null;
    // o crédito paga a conta inteira: entra sem forma escolhida
    const soCredito = !fiado && credito > 0 && aPagar <= 0;
    if (pg && "erro" in pg) { setErroForma(pagamento.dividido ? pg.erro : "Escolha como o cliente pagou."); avisarErro(pg.erro); return false; }
    const falta = faltaNoEstoque(itens, produtos);
    if (falta.length && !(await perguntar({ titulo: falta.length === 1 ? "Esse produto passa do estoque" : "Esses produtos passam do estoque", texto: `${falta.join(" ")} Vender mesmo assim? O saldo fica negativo até você dar entrada no estoque.`, confirmar: "Vender mesmo assim" }))) return false;
    if (!(await conferirValorAlto(aPagar, perguntar))) return false;
    // o caixa fechou enquanto esta conta estava aberta: pergunta antes de receber fora dele
    if (pg && !("erro" in pg) && !(await conferirCaixa(sb, petshop.id, perguntar))) return false;
    // cada forma do pagamento vai primeiro para a conta de hoje (sem o crédito) e depois para as antigas
    const paraAntigas = junto > 0 ? alocarNasAntigas(antigas, centavos(recebendo - daConta)) : [];
    const repartido = pg && !("erro" in pg) && junto > 0
      ? repartirPagamento(pg.pagamentos ?? [{ forma: pg.forma, valor: recebendo }], [daConta, ...paraAntigas.map((x) => x.valor)])
      : null;
    let pagouAntigas = 0;
    setSalvando(true);
    let zapComprovante: string | null = null;
    try {
      // tudo numa chamada só (o banco grava tudo ou nada): serviços do horário, pacote, a conta, o crédito, as contas antigas,
      // o estoque e o atendimento concluído. Se a internet cair no meio, nada fica pela metade; tocar de novo não repete.
      const passos = passosDoComeco();
      const gravar = itensParaGravar(itens);
      const descricao = descricaoDaConta(gravar);
      let lanca = false;
      if (fiado) {
        passos.push({ t: "lancamento", nome: "principal", chave, linha: {
          tipo: "entrada", valor: contas.total, forma: null, categoria: categoria(), descricao, data: depois.quando, vencimento: depois.quando, pago: false,
          agendamento_id: a.id, cliente_id: tutor?.id ?? null, itens: gravar,
        } });
        lanca = true;
        // o crédito do tutor paga uma parte agora; o resto fica a receber
        if (credito > 0) passos.push({ t: "receber_credito", conta: ref("principal"), valor: credito, chave: parteDaChave(chave, "credito") });
      } else if ((pg && !("erro" in pg)) || soCredito) {
        const cash = pg && !("erro" in pg) ? pg : null;
        const dinheiroDaConta: PartePagamento[] | null = repartido ? repartido[0] : null;
        const pgDaConta = dinheiroDaConta?.length ? { forma: formaPrincipal(dinheiroDaConta), pagamentos: dinheiroDaConta.length > 1 ? dinheiroDaConta : null } : cash;
        const comCredito = credito > 0 ? pagamentoComCredito(credito, pgDaConta && daConta > 0 ? pgDaConta : null, daConta) : { forma: pgDaConta!.forma, pagamentos: pgDaConta!.pagamentos ?? null };
        if (contas.total > 0) {
          passos.push({ t: "lancamento", nome: "principal", chave, linha: {
            tipo: "entrada", valor: contas.total, forma: comCredito.forma, pagamentos: partesOuNada(comCredito.pagamentos), pago: true, data: isoDia(new Date()),
            categoria: categoria(), agendamento_id: a.id, cliente_id: tutor?.id ?? null, descricao, itens: gravar, credito_usado: credito > 0 ? credito : null,
          } });
          lanca = true;
        }
        // o que devia de antes: baixa nas contas antigas, no mesmo pagamento (nada de "Troco" para dinheiro que paga dívida)
        for (const [i, x] of paraAntigas.entries()) {
          const partes = repartido?.[i + 1] ?? [];
          if (!(x.valor > 0) || !partes.length) continue;
          passos.push({ t: "receber", conta: x.conta.id, valor: x.valor, forma: formaPrincipal(partes), pagamentos: partesOuNada(partes), chave: parteDaChave(chave, "antiga", x.conta.id) });
          pagouAntigas = centavos(pagouAntigas + x.valor);
        }
      }
      const estoque = passoDoEstoque(produtosDaConta(itens), chave, lanca ? ref("principal") : null);
      if (estoque) passos.push(estoque);
      // conta zerada por quem recebe: fica anotado que este atendimento não vai ser cobrado (sai da lista "para cobrar")
      const naoCobra = !lanca && vejoFinanceiro && !a.sem_cobranca;
      if (a.status !== "concluido" || naoCobra) passos.push({ t: "agendamento", id: a.id, status: "concluido", ...(naoCobra ? { sem_cobranca: true } : {}) });
      const feito = await fecharNoBanco(chave, passos);
      if (!feito) return true;
      const usos = feito.passos.find((p) => p.t === "pacote");
      const lancado = lanca && !fiado ? (lancamentoDe(feito, "principal") as unknown as Lancamento | null) : null;
      if (vejoFinanceiro && pg && !("erro" in pg) && soDigitos(tutor?.telefone).length >= 8 && (lancado || pagouAntigas > 0)) {
        const formas = pg.pagamentos ?? [{ forma: pg.forma, valor: recebendo }];
        zapComprovante = junto > 0
          ? linkWhatsApp(tutor?.telefone, textoComprovanteDaParte({
              petshop: petshop.nome, tutor: tutor?.nome, pet: pet?.nome, quando: a.inicio, itens: gravar, total: contas.total, desconto: contas.desconto,
              pago: centavos(contas.total + pagouAntigas), formas, falta: centavos(devido - pagouAntigas), antigo: pagouAntigas, antigoDevia: devido,
            }))
          : lancado ? linkWhatsApp(tutor?.telefone, textoComprovante({ petshop: petshop.nome, tutor: tutor?.nome, pet: pet?.nome, servico, quando: a.inicio, recebidos: [lancado] })) : null;
      } else if (vejoFinanceiro && lancado && soDigitos(tutor?.telefone).length >= 8) {
        zapComprovante = linkWhatsApp(tutor?.telefone, textoComprovante({ petshop: petshop.nome, tutor: tutor?.nome, pet: pet?.nome, servico, quando: a.inicio, recebidos: [lancado] }));
      }
      const recebeu = lanca;
      const notaAntigas = pagouAntigas > 0
        ? ` Recebido também ${brl(pagouAntigas)} do que ${primeiroNome} devia${devido - pagouAntigas > 0.005 ? `: ainda deve ${brl(devido - pagouAntigas)}` : ", que ficou quitado"}.`
        : "";
      const notaCredito = credito > 0 ? ` ${brl(credito)} saíram do crédito de ${primeiroNome}.` : "";
      const usados = usos?.usados ?? (pacote ? pacote.usados + 1 : 0), total = usos?.total ?? pacote?.total ?? 0;
      avisar(fiado ? `Anotado: ${brl(daConta)} a receber até ${dataCompleta(depois.quando)}.${notaCredito}` : recebeu ? `Recebido ${brl(contas.total)}.${notaCredito}${pacote ? ` ${servico} saiu do pacote.` : ""}${notaAntigas}` : pagouAntigas > 0 ? `Atendimento concluído.${notaAntigas}` : pacote ? `Usado ${usados} de ${total} do pacote.` : "Atendimento concluído sem cobrança.");
      avisarMudanca();
      if (zapComprovante) setRecebida({ valor: centavos(contas.total + pagouAntigas), zap: zapComprovante, nota: `${notaCredito}${notaAntigas}`.trim() || undefined });
      else aoPronto();
      return true;
    } catch (e) { avisarErro(e); setSalvando(false); return false; }
  }

  /** Os primeiros passos de toda conta: ninguém recebeu antes, os serviços do horário, e o pacote (um uso, somado no banco). */
  function passosDoComeco(): Passo[] {
    const passos: Passo[] = [{ t: "sem_recebimento", agendamento: a.id }];
    // os serviços desta conta ficam no horário (juntou ou tirou um na hora de fechar): antes de lançar o dinheiro
    const antes = outrosDoHorario.map((o) => o.servico_id);
    if (antes.length !== servicosNaConta.length || servicosNaConta.some((id) => !antes.includes(id))) {
      passos.push({ t: "servicos", agendamento: a.id, servicos: servicosNaConta.map((id) => {
        const tinha = outrosDoHorario.find((o) => o.servico_id === id);
        return { servico_id: id, preco: tinha ? tinha.preco : itens.find((i) => i.servicoId === id)?.valor ?? null };
      }) });
    }
    // o serviço principal sai do pacote: um uso a menos, antes de cobrar o resto
    if (pacote) passos.push({ t: "pacote", id: pacote.id, n: 1 }, { t: "agendamento", id: a.id, pacote_cliente_id: pacote.id });
    return passos;
  }

  function descricaoDaConta(gravar: ReturnType<typeof itensParaGravar>) {
    const mais = resumoDosItens(gravar);
    const nomes = gravar.filter((i) => i.tipo === "servico").map((i) => i.nome).join(" + ") || (peloPacote ? `${servico} (pacote)` : servico);
    return encurtar(`${nomes} · ${pet?.nome ?? ""}`.trim().replace(/ ·$/, "") + (mais ? ` + ${mais}` : ""));
  }

  /** Manda a conta para o banco. Devolve null quando outra pessoa já tinha recebido (a folha fecha); erro: nada foi gravado. */
  async function fecharNoBanco(chave: string, passos: Passo[]) {
    try {
      return await fazerTudoOuNada(sb, petshop.id, chave, { funcao: "agendamento_fechar_conta", agendamento: a.id }, passos);
    } catch (e) {
      if (casoDoErro(e) === "maestro:ja_recebido") {
        // outra pessoa recebeu enquanto esta conta estava aberta: fecha a conta e mostra o horário atualizado
        avisarErro("Este atendimento já tem recebimento lançado.");
        avisarMudanca();
        aoPronto();
        return null;
      }
      throw new Error(`A conta não foi fechada: nada ficou pela metade. Toque de novo para tentar. (${mensagemDeErro(e)})`);
    }
  }

  /**
   * O cliente pagou só uma parte: a conta inteira fica anotada para o tutor (como "Cliente paga depois") e a parte
   * que entrou é recebida na hora (entra no caixa). Em A receber e na ficha fica só o que falta. Mesmo caminho do "Recebi" da ficha.
   * Tudo numa chamada só: a conta, o pacote, o estoque, o atendimento concluído, o crédito e a parte paga entram juntos ou nada entra.
   */
  async function receberParte(chave: string, m: { entregue: number; forma: PartePagamento["forma"]; pagamentos: PartePagamento[] | null }): Promise<boolean> {
    const entregue = m.entregue, falta = centavos(daConta - m.entregue);
    if (!tutor?.id) { avisarErro("Para deixar o resto anotado, o pet precisa ter um tutor na ficha. Sem tutor, corrija o valor recebido."); return false; }
    if (!depois.quando || depois.quando < isoDia(new Date())) { setErroForma("Escolha um dia de hoje em diante para o resto."); avisarErro("Escolha quando o cliente paga o resto (de hoje em diante)."); return false; }
    if (diaFechado(depois.quando)) { const n = fraseDoDiaFechado(depois.quando); setErroForma(`${dataCompleta(depois.quando)} é dia fechado${n ? ` (${n.replace(/^Dia fechado: /, "")})` : ""}. Escolha um dia em que vocês abrem.`); return false; }
    const problema = erroDaConta(itens, desconto, contas.total);
    if (problema) { avisarErro(problema); return false; }
    const naoTem = faltaNoEstoque(itens, produtos);
    if (naoTem.length && !(await perguntar({ titulo: naoTem.length === 1 ? "Esse produto passa do estoque" : "Esses produtos passam do estoque", texto: `${naoTem.join(" ")} Vender mesmo assim? O saldo fica negativo até você dar entrada no estoque.`, confirmar: "Vender mesmo assim" }))) return false;
    if (!(await conferirValorAlto(contas.total, perguntar))) return false;
    if (!(await conferirCaixa(sb, petshop.id, perguntar))) return false;
    setSalvando(true);
    try {
      const passos = passosDoComeco();
      const gravar = itensParaGravar(itens);
      passos.push({ t: "lancamento", nome: "conta", chave: parteDaChave(chave, "conta"), linha: {
        tipo: "entrada", valor: contas.total, forma: null, categoria: categoria(), descricao: descricaoDaConta(gravar), data: depois.quando, vencimento: depois.quando, pago: false,
        agendamento_id: a.id, cliente_id: tutor.id, itens: gravar,
      } });
      const estoque = passoDoEstoque(produtosDaConta(itens), chave, ref("conta"));
      if (estoque) passos.push(estoque);
      if (a.status !== "concluido") passos.push({ t: "agendamento", id: a.id, status: "concluido" });
      // o crédito do tutor entra primeiro, depois a parte que ele deu
      if (credito > 0) passos.push({ t: "receber_credito", conta: ref("conta"), valor: credito, chave: parteDaChave(chave, "credito") });
      passos.push({ t: "receber", conta: ref("conta"), valor: entregue, forma: m.forma, pagamentos: partesOuNada(m.pagamentos), chave: parteDaChave(chave, "parte") });
      const feito = await fecharNoBanco(chave, passos);
      if (!feito) return true;
      const nota = `${credito > 0 ? `${brl(credito)} saíram do crédito de ${primeiroNome}. ` : ""}Ficou ${brl(falta)} para ${primeiroNome} pagar até ${dataCompleta(depois.quando)}, em A receber e na ficha.${junto > 0 ? ` O que ${primeiroNome} devia de antes (${brl(devido)}) continua anotado.` : ""}`;
      avisar(`Recebido ${brl(entregue)}. ${nota}`);
      avisarMudanca();
      // quem fica devendo é quem mais precisa do comprovante do que já pagou
      const zap = vejoFinanceiro ? linkWhatsApp(tutor.telefone, textoComprovanteDaParte({
        petshop: petshop.nome, tutor: tutor.nome, pet: pet?.nome, quando: a.inicio, itens: gravar, total: contas.total, desconto: contas.desconto,
        pago: entregue, formas: m.pagamentos ?? [{ forma: m.forma, valor: entregue }], falta, pagaAte: depois.quando,
      })) : null;
      if (zap && soDigitos(tutor.telefone).length >= 8) setRecebida({ valor: entregue, nota, zap });
      else aoPronto();
      return true;
    } catch (e) {
      // nada ficou gravado (ou a resposta não chegou): a nova tentativa usa a mesma chave e não repete nada
      avisarErro(e);
      setSalvando(false);
      return false;
    }
  }
  if (recebida) {
    return (
      <Folha titulo="Conta fechada" aoFechar={aoPronto} rodape={<button type="button" className="g-btn sec" onClick={aoPronto}>Pronto</button>}>
        <div className="g-vd-recibo">
          <Tile icone={Check} tom="menta" tamanho="g" />
          <p className="g-num">{brl(recebida.valor)}</p>
          <p><b>Recebido.</b> O atendimento{pet?.nome ? ` de ${pet.nome}` : ""} ficou como concluído.</p>
          {recebida.nota && <p className="g-p">{recebida.nota}</p>}
          <a className="g-btn zap cheio" href={recebida.zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar comprovante</a>
          <p className="g-pp g-muted">O WhatsApp de {tutor?.nome ?? "quem trouxe o pet"} abre com o comprovante pronto e você só aperta enviar. Não é nota fiscal.</p>
        </div>
      </Folha>
    );
  }

  return (
    <Folha larga titulo="Fechar a conta" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void confirmar()} disabled={salvando || op.ocupado || nadaAFazer || lendoConta} aria-busy={lendoConta}>
          {salvando ? "Anotando…" : lendoConta ? "Carregando a conta…" : aPagar <= 0 && credito > 0 ? "Pagar com o crédito" : aPagar <= 0 ? (pacote ? "Concluir usando o pacote" : a.status === "concluido" ? "Não cobrar este atendimento" : "Concluir sem cobrar") : depois.ativo ? `Anotar ${brl(daConta)} a receber` : aMenos ? `Receber ${brl(aMenos.entregue)}` : `Receber ${brl(aPagar)}`}
        </button>
      </>}>
      <div className="g-form">
        <div className="g-vd-quem">
          {pet && <AvatarPet pet={pet} tamanho="g" />}
          <div>
            <b>{pet?.nome ?? "Pet"}</b>
            <span>{[tutor?.nome, `${hora(a.inicio)} às ${hora(a.fim)}`].filter(Boolean).join(" · ")}</span>
          </div>
        </div>

        <div className="g-card liso g-vd-itens">
          {peloPacote && (
            <div className="g-vd-item">
              <Tile icone={Ticket} tom="lilas" />
              <div className="t">
                <b>{servico}</b>
                <span>{pacote ? `pelo pacote ${pacote.nome}: ${pacote.total - pacote.usados === 1 ? "é o último uso" : `sobram ${pacote.total - pacote.usados} usos`}` : "pelo pacote"}</span>
              </div>
              <b className="g-vd-soma g-tab">sem cobrar</b>
            </div>
          )}
          {itens.map((i) => (
            <LinhaDaConta key={i.chave} item={i} produto={produtos.find((p) => p.id === i.produtoId)} apoio={a.profissionais ? `com ${a.profissionais.nome}` : undefined}
              aoMudar={(m) => mudar(i.chave, m)} aoTirar={i.tipo === "servico" && (!i.servicoId || !mexeNosServicos || (naoTiraFeito && doHorario.has(i.servicoId))) ? undefined : () => setItens((l) => l.filter((x) => x.chave !== i.chave))} />
          ))}
        </div>

        <div className="g-campo">
          <span>{vendeProdutos ? "Levou mais alguma coisa?" : "Tem mais alguma coisa na conta?"}</span>
          {vendeProdutos && <BuscaProduto produtos={produtos} carregando={carregando} erro={erro} itens={itens} aoEscolher={(p) => setItens((l) => comProduto(l, p))} />}
          <div className="g-chips g-vd-chips">
            {a.leva_traz && !temLevaTraz && <button type="button" className="g-chip" onClick={() => extra(LEVA_E_TRAZ)}><Truck />{LEVA_E_TRAZ}</button>}
            {mexeNosServicos && servicosParaJuntar.length > 0 && <button type="button" className="g-chip" aria-expanded={escolhendoServico} onClick={() => setEscolhendoServico((v) => !v)}><Scissors />Outro serviço</button>}
            <button type="button" className="g-chip" onClick={() => extra("")}><Plus />Outro extra</button>
          </div>
          {escolhendoServico && servicosParaJuntar.length > 0 && (
            <div className="g-vd-servicos" role="group" aria-label="Qual serviço juntar na conta">
              <small className="g-muted">Qual serviço o pet fez a mais? Ele entra na conta com o valor dele{a.profissionais ? " e conta para a comissão" : ""}.</small>
              <div className="g-chips">
                {servicosParaJuntar.map((x) => <button key={x.id} type="button" className="g-chip" onClick={() => outroServico(x.id)}><i style={{ background: x.cor }} />{x.nome}</button>)}
              </div>
            </div>
          )}
        </div>

        {devido > 0 && !depois.ativo && (
          <div className="g-campo" role="group" aria-label="O que o tutor deve de antes">
            <span>Deve de antes: {brl(devido)}</span>
            <label className={`g-agd-junto${comDivida ? " on" : ""}`}>
              <input type="checkbox" checked={comDivida} onChange={(ev) => { setComDivida(ev.target.checked); setErroForma(null); }} />
              <span className="t">
                <b>Incluir nesta conta?</b>
                <small>{antigas.map((l) => `${l.descricao?.trim() || l.categoria} (${brl(l.valor)}${l.vencimento && l.vencimento < hojeIso ? ", em atraso" : ""})`).join(" · ")}</small>
              </span>
              <b className="v g-tab">{brl(devido)}</b>
            </label>
            <small>{comDivida
              ? `Recebendo junto, ${antigas.length === 1 ? "a conta antiga recebe baixa" : "as contas antigas recebem baixa"} neste mesmo pagamento. Nada fica cobrado duas vezes.`
              : `${primeiroNome} vai pagar junto? Marque aqui. Não use Outro extra para isso: a conta antiga continuaria aberta e seria cobrada de novo.`}
              {comMulta > 0.005 ? ` Com multa e juros, ficaria ${brl(devido + comMulta)}: a multa não entra aqui (para cobrar a multa, use Recebi na ficha do tutor).` : ""}</small>
          </div>
        )}
        {devido > 0 && depois.ativo && <p className="g-pp g-muted">{primeiroNome} também deve {brl(devido)} de antes. Continua anotado como está.</p>}

        {(saldoCredito ?? 0) > 0 && contas.total > 0 && (
          <UsarCredito saldo={saldoCredito!} usar={usarCredito} aoMudar={(v) => { setUsarCredito(v); setErroForma(null); }} usado={credito} resto={depois.ativo ? daConta : aPagar} />
        )}
        <FechamentoDaConta subtotal={contas.subtotal} desconto={contas.desconto} total={contas.total} descontoDigitado={desconto} aoDesconto={setDesconto}
          pagamento={pagamento} aoPagamento={(e) => { setPagamento(e); setErroForma(null); }} erroForma={erroForma}
          depois={depois} aoDepois={(d) => { setDepois(d); setErroForma(null); }} aceitaResto receberAgora={aPagar} junto={junto} credito={credito} />
        {trocoQuePaga > 0 && (
          <p className="g-aviso" style={{ margin: 0 }} role="status">
            <span>
              <b>{primeiroNome} deve {brl(devido)} de antes.</b> Em vez de dar {brl(entregue - daConta)} de troco, o dinheiro pode pagar {trocoQuePaga >= devido - 0.005 ? "essa conta inteira" : `${brl(trocoQuePaga)} dela`}.{" "}
              <button type="button" className="g-link" onClick={() => { setComDivida(true); setErroForma(null); }}>Usar para pagar o que deve</button>
            </span>
          </p>
        )}
        {aMenos && parteDasAntigas && (
          <div className="g-card liso g-pilha" role="group" aria-label="O que entra agora">
            <p className="g-p"><b className="g-tab">{brl(aMenos.entregue)}</b> entram agora: a conta de hoje inteira ({brl(daConta)}) e <b className="g-tab">{brl(centavos(aMenos.entregue - daConta))}</b> do que {primeiroNome} devia. Ainda fica devendo <b className="g-tab">{brl(aMenos.falta)}</b>, com a data que já estava combinada.</p>
          </div>
        )}
        {aMenos && !parteDasAntigas && (
          <div className="g-card liso g-pilha" role="group" aria-label="O que faltou fica anotado">
            <p className="g-p"><b className="g-tab">{brl(aMenos.entregue)}</b> entram agora{aMenos.forma === "dinheiro" && !aMenos.pagamentos ? " no caixa" : ""}. Os <b className="g-tab">{brl(centavos(daConta - aMenos.entregue))}</b> que faltaram ficam anotados para {tutor?.nome ?? "o tutor"} pagar depois, em Financeiro, A receber, e na ficha.{junto > 0 ? ` O que devia de antes (${brl(devido)}) continua anotado.` : ""}</p>
            {tutor?.id ? (
              <label className="g-campo">
                <span>Quando paga o resto</span>
                <input type="date" className="g-input" value={depois.quando} min={isoDia(new Date())} onChange={(e) => { setDepois({ ...depois, quando: e.target.value }); setErroForma(null); }} />
                <small>Se o cliente pagou tudo, corrija o valor que entrou.</small>
                {!erroForma && depois.quando && diaFechado(depois.quando) && <small className="erro" role="alert">{dataCompleta(depois.quando)} é dia fechado. Escolha um dia em que vocês abrem.</small>}
                {erroForma && <small className="erro" role="alert">{erroForma}</small>}
              </label>
            ) : <p className="g-pp g-erro">Este pet está sem tutor na ficha: não dá para deixar o resto anotado. Corrija o valor recebido.</p>}
          </div>
        )}
        {aPagar > 0 && !depois.ativo && <AvisoCaixaFechado aberto={caixa} />}
        <p className="g-pp g-muted">
          {contas.total > 0 && depois.ativo ? "Nada entra no caixa agora: a conta fica em A receber" : contas.total > 0 && credito > 0 && aPagar <= 0 ? "O crédito do tutor paga a conta: nada entra no caixa agora" : contas.total > 0 ? (caixa === false ? "O valor entra no financeiro de hoje, fora do caixa" : "O valor entra no caixa de hoje") : "Nada entra no caixa"}
          {pacote ? `, ${servico} sai do pacote` : ""}
          {vendidos.length ? ", os produtos saem do estoque" : ""}
          {a.status !== "concluido" ? " e o atendimento fica como concluído." : "."}
        </p>
      </div>
    </Folha>
  );
}
