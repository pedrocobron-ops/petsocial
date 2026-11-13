"use client";

import { useState } from "react";
import { Check, MessageCircle, Plus, Truck } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { textoComprovante } from "@/lib/gestao/comprovante";
import { conferirCaixa, conferirValorAlto, lancarAReceber, lancarPago } from "@/lib/gestao/dinheiro";
import { brl, dataCompleta, hora, isoDia, linkWhatsApp, soDigitos, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvatarPet, Folha, avisarMudanca, mensagemDeErro, ok, useAvisos, useSomenteLeitura } from "../ui";
import {
  baixarEstoque, BuscaProduto, comProduto, encurtar, erroDaConta, faltaNoEstoque, fecharContas, FechamentoDaConta, itensParaGravar, LEVA_E_TRAZ, LinhaDaConta, novaChave,
  produtosDaConta, resumoDosItens, useProdutosDaLoja, valorDaLinha, type ItemConta, type PagaDepois,
} from "../loja/conta";
import { AvisoCaixaFechado, fecharPagamento, useCaixaAberto, usePagamento } from "../loja/pecas";

/**
 * Fechar a conta de um atendimento: serviço, produtos do estoque e extras numa conta só.
 * Lança a entrada (ou anota para receber depois), dá baixa nos produtos e deixa o atendimento como concluído.
 */
export default function Comanda({ agendamento: a, aoFechar, aoPronto }: {
  agendamento: AgendamentoCompleto; aoFechar: () => void; aoPronto: () => void;
}) {
  const { sb, petshop, user, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar: perguntar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const { produtos, carregando, erro } = useProdutosDaLoja();
  const pet = a.pets, tutor = pet?.clientes;
  const servico = a.servicos?.nome ?? "Atendimento";
  const [itens, setItens] = useState<ItemConta[]>([
    { chave: novaChave(), tipo: "servico", nome: servico, qtd: 1, valor: a.preco == null ? null : Number(a.preco) },
  ]);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [pagamento, setPagamento] = usePagamento();
  // "Cliente paga depois" (fiado): a conta fica em A receber, com o dia combinado (padrão: daqui a 7 dias)
  const [depois, setDepois] = useState<PagaDepois>(() => ({ ativo: false, quando: isoDia(somaDias(new Date(), 7)) }));
  const [erroForma, setErroForma] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // conta recebida: antes de fechar, oferece o comprovante no WhatsApp do tutor
  const [recebida, setRecebida] = useState<{ valor: number; zap: string } | null>(null);
  const caixa = useCaixaAberto();

  const contas = fecharContas(itens, desconto);
  const vendidos = produtosDaConta(itens);
  const temLevaTraz = itens.some((i) => i.tipo === "extra" && i.nome === LEVA_E_TRAZ);
  const nadaAFazer = contas.total <= 0 && a.status === "concluido" && !vendidos.length;
  const mudar = (chave: string, m: Partial<ItemConta>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...m } : i)));
  const extra = (nome: string) => setItens((l) => [...l, { chave: novaChave(), tipo: "extra", nome, qtd: 1, valor: null }]);

  /** Mesma categoria do recebimento simples; creche e hotel vão para a deles; conta só de produto vira venda. */
  function categoria() {
    const doServico = itens.filter((i) => i.tipo !== "produto").reduce((t, i) => t + valorDaLinha(i), 0);
    if (doServico <= 0 && vendidos.length) return "Venda de produtos";
    return a.servicos?.categoria === "creche" || a.servicos?.categoria === "hotel" ? "Creche e hotel" : "Banho e tosa";
  }

  async function confirmar() {
    if (salvando || nadaAFazer || somenteLeitura()) return;
    const problema = erroDaConta(itens, desconto, contas.total);
    if (problema) { avisarErro(problema); return; }
    const fiado = depois.ativo && contas.total > 0;
    if (fiado && (!depois.quando || depois.quando < isoDia(new Date()))) { setErroForma("Escolha um dia de hoje em diante."); avisarErro("Escolha quando o cliente vai pagar."); return; }
    const pg = contas.total > 0 && !fiado ? fecharPagamento(pagamento, contas.total) : null;
    if (pg && "erro" in pg) { setErroForma(pagamento.dividido ? pg.erro : "Escolha como o cliente pagou."); avisarErro(pg.erro); return; }
    const falta = faltaNoEstoque(itens, produtos);
    if (falta.length && !(await perguntar({ titulo: falta.length === 1 ? "Esse produto passa do estoque" : "Esses produtos passam do estoque", texto: `${falta.join(" ")} Vender mesmo assim? O saldo fica negativo até você dar entrada no estoque.`, confirmar: "Vender mesmo assim" }))) return;
    if (!(await conferirValorAlto(contas.total, perguntar))) return;
    // o caixa fechou enquanto esta conta estava aberta: pergunta antes de receber fora dele
    if (pg && !("erro" in pg) && !(await conferirCaixa(sb, petshop.id, perguntar))) return;
    setSalvando(true);
    let recebeu = false;
    let zapComprovante: string | null = null;
    try {
      // outra pessoa pode ter recebido enquanto esta conta estava aberta
      const ja = ok(await sb.rpc("recebimentos_do_agendamento", { p_agendamento: a.id }));
      if (ja.length) {
        avisarErro("Este atendimento já tem recebimento lançado.");
        avisarMudanca();
        aoPronto();
        return;
      }
      const gravar = itensParaGravar(itens);
      const mais = resumoDosItens(gravar);
      const descricao = encurtar(`${servico} · ${pet?.nome ?? ""}`.trim().replace(/ ·$/, "") + (mais ? ` + ${mais}` : ""));
      if (fiado) {
        await lancarAReceber(sb, petshop.id, {
          valor: contas.total, vencimento: depois.quando, categoria: categoria(), agendamentoId: a.id, clienteId: tutor?.id ?? null, descricao, itens: gravar,
        });
        recebeu = true;
      } else if (pg && !("erro" in pg)) {
        const lancado = await lancarPago(sb, petshop.id, {
          tipo: "entrada", valor: contas.total, forma: pg.forma, pagamentos: pg.pagamentos, categoria: categoria(), agendamentoId: a.id, clienteId: tutor?.id ?? null,
          descricao, itens: gravar,
        });
        recebeu = true;
        if (vejoFinanceiro && lancado && soDigitos(tutor?.telefone).length >= 8) {
          zapComprovante = linkWhatsApp(tutor?.telefone, textoComprovante({ petshop: petshop.nome, tutor: tutor?.nome, pet: pet?.nome, servico, quando: a.inicio, recebidos: [lancado] }));
        }
      }
      let estoqueOk = true;
      try { await baixarEstoque(sb, petshop.id, user.id, itens); } catch (e) {
        estoqueOk = false;
        avisarErro(`${recebeu ? (fiado ? "A conta foi anotada, mas o" : "O valor foi recebido, mas o") : "O"} estoque não baixou. Dê a saída pela tela de Estoque. (${mensagemDeErro(e)})`);
      }
      if (a.status !== "concluido") ok(await sb.from("agendamentos").update({ status: "concluido" }).eq("id", a.id).select("id").single());
      if (estoqueOk) avisar(fiado ? `Anotado: ${brl(contas.total)} a receber até ${dataCompleta(depois.quando)}.` : recebeu ? `Recebido ${brl(contas.total)}.` : "Atendimento concluído sem cobrança.");
      avisarMudanca();
      if (zapComprovante) setRecebida({ valor: contas.total, zap: zapComprovante });
      else aoPronto();
    } catch (e) {
      if (recebeu) {
        avisarErro(`${depois.ativo ? "A conta foi anotada" : "O valor foi recebido"}, mas o atendimento não ficou como concluído. Conclua pela agenda. (${mensagemDeErro(e)})`);
        avisarMudanca();
        aoPronto();
      } else if (e instanceof Error && /já tem recebimento/.test(e.message)) {
        // outra pessoa recebeu no mesmo instante: fecha a conta e mostra o horário atualizado
        avisarErro(e);
        avisarMudanca();
        aoPronto();
      } else { avisarErro(e); setSalvando(false); }
    }
  }

  if (recebida) {
    return (
      <Folha titulo="Conta fechada" aoFechar={aoPronto} rodape={<button type="button" className="g-btn sec" onClick={aoPronto}>Pronto</button>}>
        <div className="g-vd-recibo">
          <Tile icone={Check} tom="menta" tamanho="g" />
          <p className="g-num">{brl(recebida.valor)}</p>
          <p><b>Recebido.</b> O atendimento{pet?.nome ? ` de ${pet.nome}` : ""} ficou como concluído.</p>
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
        <button type="button" className="g-btn pri" onClick={() => void confirmar()} disabled={salvando || nadaAFazer}>
          {salvando ? "Anotando…" : contas.total <= 0 ? "Concluir sem cobrar" : depois.ativo ? `Anotar ${brl(contas.total)} a receber` : `Receber ${brl(contas.total)}`}
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
          {itens.map((i) => (
            <LinhaDaConta key={i.chave} item={i} produto={produtos.find((p) => p.id === i.produtoId)} apoio={a.profissionais ? `com ${a.profissionais.nome}` : undefined}
              aoMudar={(m) => mudar(i.chave, m)} aoTirar={i.tipo === "servico" ? undefined : () => setItens((l) => l.filter((x) => x.chave !== i.chave))} />
          ))}
        </div>

        <div className="g-campo">
          <span>Levou mais alguma coisa?</span>
          <BuscaProduto produtos={produtos} carregando={carregando} erro={erro} itens={itens} aoEscolher={(p) => setItens((l) => comProduto(l, p))} />
          <div className="g-chips g-vd-chips">
            {a.leva_traz && !temLevaTraz && <button type="button" className="g-chip" onClick={() => extra(LEVA_E_TRAZ)}><Truck />{LEVA_E_TRAZ}</button>}
            <button type="button" className="g-chip" onClick={() => extra("")}><Plus />Outro extra</button>
          </div>
        </div>

        <FechamentoDaConta subtotal={contas.subtotal} desconto={contas.desconto} total={contas.total} descontoDigitado={desconto} aoDesconto={setDesconto}
          pagamento={pagamento} aoPagamento={(e) => { setPagamento(e); setErroForma(null); }} erroForma={erroForma}
          depois={depois} aoDepois={(d) => { setDepois(d); setErroForma(null); }} />
        {contas.total > 0 && !depois.ativo && <AvisoCaixaFechado aberto={caixa} />}
        <p className="g-pp g-muted">
          {contas.total > 0 && depois.ativo ? "Nada entra no caixa agora: a conta fica em A receber" : contas.total > 0 ? (caixa === false ? "O valor entra no financeiro de hoje, fora do caixa" : "O valor entra no caixa de hoje") : "Nada entra no caixa"}
          {vendidos.length ? ", os produtos saem do estoque" : ""}
          {a.status !== "concluido" ? " e o atendimento fica como concluído." : "."}
        </p>
      </div>
    </Folha>
  );
}
