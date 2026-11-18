"use client";

import { useEffect, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { conferirCaixa, conferirValorAlto, pagamentoComCredito } from "@/lib/gestao/dinheiro";
import { creditoDoTutor } from "@/lib/gestao/credito";
import { conferirLimite } from "@/lib/gestao/fiado";
import { fazerTudoOuNada, lancamentoDe, partesOuNada, passoDoEstoque, ref, type Passo } from "@/lib/gestao/tudo-ou-nada";
import { FolhaVendaFeita, textoDaVenda } from "./comprovante-venda";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { useOperacao } from "@/lib/gestao/uma-vez";
import type { Cliente } from "@/lib/gestao/tipos";
import { brl, dataCompleta, fmtTelefone, isoDia, semAcento } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPessoa, Folha, avisarMudanca, mensagemDeErro, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { UsarCredito } from "../financeiro/comum";
import {
  BuscaProduto, comProduto, encurtar, erroDaConta, faltaNoEstoque, fecharContas, FechamentoDaConta, itensParaGravar, LinhaDaConta, produtosDaConta,
  resumoDosItens, useProdutosDaLoja, type ItemConta,
} from "./conta";
import { AvisoCaixaFechado, fecharRecebimento, pagaDepoisInicial, ParcelasNaTela, useAnotarParcelas, useCaixaAberto, usePagamento, type PagaDepois } from "./pecas";
import { idsDaOperacao } from "@/lib/gestao/maquininha";

export type Tutor = Pick<Cliente, "id" | "nome" | "telefone">;

/**
 * Venda de produtos sem agendamento: escolhe os produtos, recebe e dá baixa no estoque.
 * Com `orcamento`, a venda já vem com os produtos, o tutor e o desconto do orçamento, e o orçamento fica marcado como
 * convertido na mesma gravação (`orcamento_vender`).
 */
export default function VendaBalcao({ aoFechar, aoPronto, inicial, orcamento }: {
  aoFechar: () => void; aoPronto?: (vendaId?: string | null) => void;
  inicial?: { itens: ItemConta[]; tutor: Tutor | null; desconto: number | null }; orcamento?: { id: string; numero: number } | null;
}) {
  const { sb, petshop, user, vejoFinanceiro, souDono, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar: perguntar } = useAvisos();
  const anotarParcelas = useAnotarParcelas();
  const somenteLeitura = useSomenteLeitura();
  const { produtos, carregando, erro } = useProdutosDaLoja();
  const [itens, setItens] = useState<ItemConta[]>(inicial?.itens ?? []);
  const [tutor, setTutor] = useState<Tutor | null>(inicial?.tutor ?? null);
  const [desconto, setDesconto] = useState<number | null>(inicial?.desconto ?? null);
  const [pagamento, setPagamento] = usePagamento();
  // "Cliente paga depois": a venda fica em A receber, no nome do tutor, com o dia combinado
  const [depois, setDepois] = useState<PagaDepois>(pagaDepoisInicial);
  const [erroForma, setErroForma] = useState<string | null>(null);
  const [erroTutor, setErroTutor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // venda paga: antes de fechar, oferece o comprovante (WhatsApp do tutor ou impresso), como na conta do atendimento
  const [feita, setFeita] = useState<{ valor: number; texto: string; frase: string; vendaId: string | null } | null>(null);
  const caixa = useCaixaAberto();
  const op = useOperacao();

  const contas = fecharContas(itens, vejoFinanceiro ? desconto : null);
  const vendidos = produtosDaConta(itens);
  // crédito do tutor (pagou a mais antes, sinal que virou crédito): pode pagar a venda, como em Fechar a conta e na mensalidade.
  // Na venda "paga depois" o crédito não entra: fica para quando ele vier pagar.
  const { dados: saldoCredito } = useDados(async () => (vejoFinanceiro && tutor?.id ? (await creditoDoTutor(sb, petshop.id, tutor.id)).saldo : 0), [petshop.id, tutor?.id ?? "", vejoFinanceiro]);
  const [usarCredito, setUsarCredito] = useState(true);
  const credito = usarCredito && !depois.ativo && (saldoCredito ?? 0) > 0 && contas.total > 0 ? Math.round(Math.min(saldoCredito ?? 0, contas.total) * 100) / 100 : 0;
  const aPagar = Math.round((contas.total - credito) * 100) / 100;
  const soCredito = credito > 0 && aPagar <= 0.005;
  // venda começada: recarregar ou fechar a aba pede confirmação antes de perder o que já está na conta
  const temItens = itens.length > 0;
  useEffect(() => {
    if (!temItens) return;
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [temItens]);
  const mudar = (chave: string, m: Partial<ItemConta>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...m } : i)));

  const confirmar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean> {
    if (somenteLeitura()) return false;
    if (!vendidos.length) { avisarErro("Escolha pelo menos um produto."); return false; }
    const problema = erroDaConta(itens, vejoFinanceiro ? desconto : null, contas.total);
    if (problema) { avisarErro(problema); return false; }
    if (vejoFinanceiro && contas.total <= 0) { avisarErro("A venda está sem valor. Confira os preços e o desconto."); return false; }
    const pg = vejoFinanceiro ? (soCredito ? { fiado: false as const, forma: "outro" as const, pagamentos: null } : fecharRecebimento(pagamento, depois, credito > 0 ? aPagar : contas.total)) : null;
    if (pg && "erro" in pg) { setErroForma(pg.noCampo); avisarErro(pg.erro); return false; }
    const fiado = pg && !("erro" in pg) && pg.fiado ? pg : null;
    // fiado precisa de nome: sem o tutor a conta ficaria solta, sem ninguém para cobrar
    if (fiado && !tutor) { setErroTutor("Para o cliente pagar depois, diga quem comprou."); avisarErro("Diga quem comprou para anotar a conta no nome dele."); return false; }
    const falta = faltaNoEstoque(itens, produtos);
    if (falta.length && !(await perguntar({ titulo: falta.length === 1 ? "Esse produto passa do estoque" : "Esses produtos passam do estoque", texto: `${falta.join(" ")} Vender mesmo assim? O saldo fica negativo até você dar entrada no estoque.`, confirmar: "Vender mesmo assim" })))  return false;
    if (vejoFinanceiro && !(await conferirValorAlto(contas.total, perguntar)))  return false;
    // fiado: passa do limite do cliente? quem pode libera (fica anotado); quem não pode, recebe agora
    if (fiado && !(await conferirLimite(sb, petshop.id, tutor?.id, contas.total, { perguntar, podeLiberar: souDono || cuidoDoFinanceiro, avisarErro })))  return false;
    // o caixa fechou enquanto esta venda estava aberta: pergunta antes de receber fora dele
    if (pg && !("erro" in pg) && !pg.fiado && !(await conferirCaixa(sb, petshop.id, perguntar)))  return false;
    setSalvando(true);
    try {
      const linhas = itensParaGravar(vendidos);
      // o dinheiro e a saída do estoque numa chamada só: os dois entram, ou nenhum (tocar de novo não repete)
      const passos: Passo[] = [];
      let lanca = false;
      if (fiado) {
        passos.push({ t: "lancamento", nome: "venda", chave, linha: {
          tipo: "entrada", valor: contas.total, forma: null, categoria: "Venda de produtos", cliente_id: tutor?.id ?? null, pago: false, data: fiado.quando, vencimento: fiado.quando,
          descricao: encurtar(`Venda: ${resumoDosItens(linhas)}`), itens: linhas,
        } });
        lanca = true;
      } else if (pg && !("erro" in pg) && !pg.fiado) {
        // com o crédito: a venda vai pelo valor cheio e a parte do crédito entra na forma "outro" (o banco tira do saldo junto)
        const comCredito = credito > 0 ? pagamentoComCredito(credito, soCredito ? null : { forma: pg.forma, pagamentos: pg.pagamentos }, aPagar) : { forma: pg.forma, pagamentos: pg.pagamentos };
        passos.push({ t: "lancamento", nome: "venda", chave, linha: {
          tipo: "entrada", valor: contas.total, forma: comCredito.forma, pagamentos: partesOuNada(comCredito.pagamentos), categoria: "Venda de produtos", cliente_id: tutor?.id ?? null, pago: true, data: isoDia(new Date()),
          descricao: encurtar(`Venda: ${resumoDosItens(linhas)}`), itens: linhas, credito_usado: credito > 0 ? credito : null,
        } });
        lanca = true;
      }
      const estoque = passoDoEstoque(produtosDaConta(vendidos), chave, lanca ? ref("venda") : null);
      if (estoque) passos.push(estoque);
      let vendaId: string | null = null;
      let lancada: Record<string, unknown> | null = null;
      if (passos.length) {
        try {
          const r = await fazerTudoOuNada(sb, petshop.id, chave, orcamento && lanca ? { funcao: "orcamento_vender", orcamento: orcamento.id } : { funcao: "venda_registrar" }, passos);
          vendaId = r.ids?.venda ?? null;
          lancada = lanca && !fiado ? lancamentoDe(r, "venda") : null;
          if (pg && !("erro" in pg) && !pg.fiado && !soCredito) await anotarParcelas(idsDaOperacao(r, passos), pagamento.parcelas);
        } catch (e) { throw new Error(`A venda não foi anotada: nada ficou pela metade. Toque de novo para tentar. (${mensagemDeErro(e)})`); }
      }
      avisar(fiado ? `Anotado: ${brl(contas.total)} a receber de ${tutor?.nome ?? "cliente"} até ${dataCompleta(fiado.quando)}.` : vejoFinanceiro ? `Venda de ${brl(contas.total)} anotada.${credito > 0 ? ` ${brl(credito)} saíram do crédito de ${tutor?.nome?.split(" ")[0] ?? "o tutor"}.` : ""}` : "Venda anotada no estoque.");
      avisarMudanca();
      // venda paga (sem orçamento, que segue para o horário): mostra o comprovante antes de fechar
      if (lancada && !orcamento && vejoFinanceiro) {
        const l = { valor: contas.total, forma: (lancada.forma as string | null) ?? null, pagamentos: lancada.pagamentos ?? null, itens: linhas, credito_usado: credito > 0 ? credito : null, data: isoDia(new Date()), criado_em: new Date().toISOString(), categoria: "Venda de produtos" };
        setItens([]); // a venda já foi gravada: recarregar a aba não precisa mais perguntar
        setFeita({ valor: contas.total, vendaId, texto: textoDaVenda(petshop.nome, tutor?.nome, l),
          frase: `Venda anotada.${credito > 0 ? ` ${brl(credito)} saíram do crédito de ${tutor?.nome?.split(" ")[0] ?? "o tutor"}.` : ""} Os produtos saíram do estoque.` });
        setSalvando(false);
        return true;
      }
      aoPronto?.(vendaId);
      aoFechar();
      return true;
    } catch (e) { avisarErro(e); setSalvando(false); return false; }
  }

  if (feita) {
    const fim = () => { aoPronto?.(feita.vendaId); aoFechar(); };
    return <FolhaVendaFeita titulo="Venda anotada" valor={feita.valor} frase={feita.frase} texto={feita.texto} telefone={tutor?.telefone} tutor={tutor?.nome} aoFechar={fim} />;
  }

  return (
    <ParcelasNaTela.Provider value>
    <Folha larga titulo={orcamento ? `Venda do orçamento nº ${orcamento.numero}` : "Venda no balcão"} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void confirmar()} disabled={salvando || op.ocupado || !vendidos.length}>
          {salvando ? "Anotando…" : vejoFinanceiro ? (depois.ativo && contas.total > 0 ? `Anotar ${brl(contas.total)} a receber` : soCredito ? "Pagar com o crédito" : `Receber ${contas.total > 0 ? brl(credito > 0 ? aPagar : contas.total) : ""}`.trim()) : "Dar baixa no estoque"}
        </button>
      </>}>
      <div className="g-form">
        <BuscaProduto produtos={produtos} carregando={carregando} erro={erro} itens={itens} aoEscolher={(p) => setItens((l) => comProduto(l, p))} autoFocus />

        <div className="g-card liso g-vd-itens">
          {itens.length ? itens.map((i) => (
            <LinhaDaConta key={i.chave} item={i} produto={produtos.find((p) => p.id === i.produtoId)}
              aoMudar={(m) => mudar(i.chave, m)} aoTirar={() => setItens((l) => l.filter((x) => x.chave !== i.chave))} />
          )) : <p className="g-vd-nada">Busque um produto para começar a venda.</p>}
        </div>

        <EscolherTutor valor={tutor} aoMudar={(t) => { setTutor(t); setErroTutor(null); }} />
        {erroTutor && <small className="erro" role="alert">{erroTutor}</small>}

        {vejoFinanceiro && !depois.ativo && (saldoCredito ?? 0) > 0 && contas.total > 0 && (
          <UsarCredito saldo={saldoCredito!} usar={usarCredito} aoMudar={(v) => { setUsarCredito(v); setErroForma(null); }} usado={credito} resto={aPagar} />
        )}
        <FechamentoDaConta subtotal={contas.subtotal} desconto={contas.desconto} total={contas.total} descontoDigitado={desconto} aoDesconto={setDesconto}
          pagamento={pagamento} aoPagamento={(e) => { setPagamento(e); setErroForma(null); }} comPagamento={vejoFinanceiro} erroForma={erroForma}
          depois={depois} aoDepois={(d) => { setDepois(d); setErroForma(null); setErroTutor(null); }} credito={credito} receberAgora={credito > 0 ? aPagar : undefined} />
        {vejoFinanceiro && !(depois.ativo && contas.total > 0) && <AvisoCaixaFechado aberto={caixa} />}
        {vejoFinanceiro && depois.ativo && contas.total > 0 && <p className="g-muted g-pp">Nada entra no caixa agora. Os produtos saem do estoque e a conta fica no nome de {tutor?.nome ?? "quem comprou"}.</p>}
        {!vejoFinanceiro && <p className="g-muted g-pp">A venda sai do estoque. O dinheiro fica para quem cuida do financeiro lançar.</p>}
      </div>
    </Folha>
    </ParcelasNaTela.Provider>
  );
}

/** Tutor da venda (opcional): busca pelo nome em clientes. */
export function EscolherTutor({ valor, aoMudar }: { valor: Tutor | null; aoMudar: (t: Tutor | null) => void }) {
  const [aberto, setAberto] = useState(false);
  if (valor) {
    return (
      <div className="g-campo">
        <span>Tutor</span>
        <div className="g-vd-tutor">
          <AvatarPessoa nome={valor.nome} />
          <span className="t"><b>{valor.nome}</b>{valor.telefone && <span>{fmtTelefone(valor.telefone)}</span>}</span>
          <button type="button" className="g-ico" onClick={() => aoMudar(null)} aria-label="Tirar o tutor da venda"><X /></button>
        </div>
      </div>
    );
  }
  if (!aberto) {
    return <div><button type="button" className="g-btn sec p" onClick={() => setAberto(true)}><UserPlus />Dizer quem comprou (se quiser)</button></div>;
  }
  return <BuscaTutor aoEscolher={(t) => { aoMudar(t); setAberto(false); }} aoDesistir={() => setAberto(false)} />;
}

function BuscaTutor({ aoEscolher, aoDesistir }: { aoEscolher: (t: Tutor) => void; aoDesistir: () => void }) {
  const { sb, petshop } = useGestao();
  const [q, setQ] = useState("");
  const { dados, erro } = useDados(async () =>
    lerTudo<Tutor>((de, ate, contar) => sb.from("clientes").select("id, nome, telefone", contando(contar)).eq("petshop_id", petshop.id).order("nome").order("id").range(de, ate)),
  [petshop.id]);
  const alvo = semAcento(q);
  const achados = alvo ? (dados ?? []).filter((c) => semAcento(c.nome).includes(alvo)).slice(0, 6) : [];
  return (
    <div className="g-campo">
      <span>Tutor</span>
      <div className="g-fila" style={{ flexWrap: "nowrap" }}>
        <div className="g-busca g-cresce">
          <Search />
          <input className="g-input" placeholder="Nome do tutor" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar tutor pelo nome" autoFocus />
        </div>
        <button type="button" className="g-ico" onClick={aoDesistir} aria-label="Vender sem dizer o tutor"><X /></button>
      </div>
      {erro ? <small className="erro">{erro}</small> : alvo && dados && !achados.length ? <small>Nenhum tutor com esse nome.</small> : null}
      {achados.length > 0 && (
        <div className="g-lista g-vd-achados">
          {achados.map((c) => (
            <button key={c.id} type="button" className="g-linha" onClick={() => aoEscolher(c)}>
              <AvatarPessoa nome={c.nome} tamanho="p" />
              <span className="t"><b>{c.nome}</b>{c.telefone && <span>{fmtTelefone(c.telefone)}</span>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
