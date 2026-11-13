"use client";

import { useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { lancarPago } from "@/lib/gestao/dinheiro";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import type { Cliente } from "@/lib/gestao/tipos";
import { brl, fmtTelefone, semAcento } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPessoa, Folha, avisarMudanca, mensagemDeErro, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import {
  baixarEstoque, BuscaProduto, comProduto, encurtar, erroDaConta, faltaNoEstoque, fecharContas, FechamentoDaConta, itensParaGravar, LinhaDaConta, produtosDaConta,
  resumoDosItens, useProdutosDaLoja, type ItemConta,
} from "./conta";
import { AvisoCaixaFechado, fecharPagamento, lembrarForma, useCaixaAberto, usePagamento } from "./pecas";

type Tutor = Pick<Cliente, "id" | "nome" | "telefone">;

/** Venda de produtos sem agendamento: escolhe os produtos, recebe e dá baixa no estoque. */
export default function VendaBalcao({ aoFechar, aoPronto }: { aoFechar: () => void; aoPronto?: () => void }) {
  const { sb, petshop, user, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar: perguntar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const { produtos, carregando, erro } = useProdutosDaLoja();
  const [itens, setItens] = useState<ItemConta[]>([]);
  const [tutor, setTutor] = useState<Tutor | null>(null);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [pagamento, setPagamento] = usePagamento();
  const [erroForma, setErroForma] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const caixa = useCaixaAberto();

  const contas = fecharContas(itens, vejoFinanceiro ? desconto : null);
  const vendidos = produtosDaConta(itens);
  const mudar = (chave: string, m: Partial<ItemConta>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...m } : i)));

  async function confirmar() {
    if (salvando || somenteLeitura()) return;
    if (!vendidos.length) { avisarErro("Escolha pelo menos um produto."); return; }
    const problema = erroDaConta(itens, vejoFinanceiro ? desconto : null, contas.total);
    if (problema) { avisarErro(problema); return; }
    if (vejoFinanceiro && contas.total <= 0) { avisarErro("A venda está sem valor. Confira os preços e o desconto."); return; }
    const pg = vejoFinanceiro ? fecharPagamento(pagamento, contas.total) : null;
    if (pg && "erro" in pg) { setErroForma(pagamento.dividido ? pg.erro : "Escolha como o cliente pagou."); avisarErro(pg.erro); return; }
    const falta = faltaNoEstoque(itens, produtos);
    if (falta.length && !(await perguntar({ titulo: falta.length === 1 ? "Esse produto passa do estoque" : "Esses produtos passam do estoque", texto: `${falta.join(" ")} Vender mesmo assim? O saldo fica negativo até você dar entrada no estoque.`, confirmar: "Vender mesmo assim" }))) return;
    setSalvando(true);
    try {
      const gravar = itensParaGravar(vendidos);
      if (pg && !("erro" in pg)) {
        lembrarForma(pg.forma);
        await lancarPago(sb, petshop.id, {
          tipo: "entrada", valor: contas.total, forma: pg.forma, pagamentos: pg.pagamentos, categoria: "Venda de produtos", clienteId: tutor?.id ?? null,
          descricao: encurtar(`Venda: ${resumoDosItens(gravar)}`), itens: gravar,
        });
      }
      try {
        await baixarEstoque(sb, petshop.id, user.id, vendidos);
        avisar(vejoFinanceiro ? `Venda de ${brl(contas.total)} anotada.` : "Venda anotada no estoque.");
      } catch (e) {
        if (!vejoFinanceiro) throw e;
        avisarErro(`O dinheiro foi lançado, mas o estoque não baixou. Dê a saída pela tela de Estoque. (${mensagemDeErro(e)})`);
      }
      avisarMudanca();
      aoPronto?.();
      aoFechar();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha larga titulo="Venda no balcão" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={() => void confirmar()} disabled={salvando || !vendidos.length}>
          {salvando ? "Anotando…" : vejoFinanceiro ? `Receber ${contas.total > 0 ? brl(contas.total) : ""}`.trim() : "Dar baixa no estoque"}
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

        <EscolherTutor valor={tutor} aoMudar={setTutor} />

        <FechamentoDaConta subtotal={contas.subtotal} desconto={contas.desconto} total={contas.total} descontoDigitado={desconto} aoDesconto={setDesconto}
          pagamento={pagamento} aoPagamento={(e) => { setPagamento(e); setErroForma(null); }} comPagamento={vejoFinanceiro} erroForma={erroForma} />
        {vejoFinanceiro && <AvisoCaixaFechado aberto={caixa} />}
        {!vejoFinanceiro && <p className="g-muted g-pp">A venda sai do estoque. O dinheiro fica para quem cuida do financeiro lançar.</p>}
      </div>
    </Folha>
  );
}

/** Tutor da venda (opcional): busca pelo nome em clientes. */
function EscolherTutor({ valor, aoMudar }: { valor: Tutor | null; aoMudar: (t: Tutor | null) => void }) {
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
