"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { Esqueleto, mensagemDeErro, ok, useAvisos } from "@/components/gestao/ui";
import { DIAS_DE_ATRASO_PADRAO, PLANOS } from "@/lib/gestao/planos";
import { banco } from "@/lib/gestao/supabase";
import { brl, dataCompleta, fmtTelefone, linkWhatsApp } from "@/lib/gestao/util";
import { linhaDoVendedor, temVendedor, vendedorDe, type Vendedor } from "@/lib/gestao/vendedor";
import { resumoPorVendedor, type LojaVenda, type PagamentoVenda } from "@/lib/gestao/origem";

type Vendas = { lojas: LojaVenda[]; pagamentos: PagamentoVenda[] };
const STATUS: Record<string, string> = { teste: "em teste", ativa: "ativa", atrasada: "atrasada", cancelada: "cancelada", cortesia: "cortesia" };
const nomePlano = (valor: string | null) => {
  const [id, meses] = (valor ?? "").split(":");
  const p = PLANOS.find((x) => x.id === id);
  return p ? `${p.nome}${meses === "3" ? " · 3 meses" : meses === "6" ? " · 6 meses" : " · mensal"}` : "plano não identificado";
};

/**
 * Painel do administrador, aba Vendas: quem vende (nome e documento que aparecem na página de venda e na Assinatura),
 * o prazo da assinatura atrasada, os pet shops por vendedor (`?v=` do link) e os pagamentos com cupom.
 * Funções `admin_vendas`, `admin_vendedor_salvar`, `admin_atraso_dias` e `gestao_assinatura` (migração 20261237).
 */
export default function AbaVendas() {
  const { avisar, avisarErro } = useAvisos();
  const [dados, setDados] = useState<Vendas | null>(null);
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [dias, setDias] = useState(String(DIAS_DE_ATRASO_PADRAO));
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [v, a] = await Promise.all([banco().rpc("admin_vendas"), banco().rpc("gestao_assinatura")]);
      setDados(ok(v) as unknown as Vendas);
      const cfg = (a.data ?? {}) as { vendedor?: unknown; atraso_dias?: number };
      setVendedor(vendedorDe(cfg.vendedor));
      setDias(String(cfg.atraso_dias ?? DIAS_DE_ATRASO_PADRAO));
      setErro(null);
    } catch (e) { setErro(mensagemDeErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const resumo = useMemo(() => (dados ? resumoPorVendedor(dados.lojas, dados.pagamentos) : []), [dados]);
  const comCupom = useMemo(() => (dados?.pagamentos ?? []).filter((p) => p.cupom), [dados]);

  async function salvarVendedor(e: React.FormEvent) {
    e.preventDefault();
    if (!vendedor) return;
    setGravando(true);
    try {
      const r = ok(await banco().rpc("admin_vendedor_salvar", { p_nome: vendedor.nome, p_documento: vendedor.documento, p_endereco: vendedor.endereco, p_contato: vendedor.contato }));
      setVendedor(vendedorDe(r));
      avisar("Dados de quem vende gravados. A página de venda mostra em até 5 minutos.");
    } catch (er) { avisarErro(er); }
    setGravando(false);
  }
  async function salvarDias() {
    const n = Number(dias);
    if (!Number.isInteger(n) || n < 0 || n > 60) { avisar("Escolha de 0 a 60 dias."); return; }
    try { ok(await banco().rpc("admin_atraso_dias", { p_dias: n })); avisar(`Assinatura atrasada fica só para consulta depois de ${n} dias.`); } catch (er) { avisarErro(er); }
  }

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!dados || !vendedor) return <Esqueleto linhas={5} />;
  const campo = (chave: keyof Vendedor, rotulo: string, dica: string, maximo: number) => (
    <label className="g-campo"><span>{rotulo}</span>
      <input className="g-input" name={`vendedor_${chave}`} maxLength={maximo} value={vendedor[chave]} onChange={(e) => setVendedor({ ...vendedor, [chave]: e.target.value })} />
      <small>{dica}</small>
    </label>
  );

  return (
    <div className="g-pilha g">
      <form className="g-card g-pilha" onSubmit={salvarVendedor}>
        <div>
          <h2>Quem vende</h2>
          <p className="g-muted g-p">A lei do consumidor pede o nome e o documento de quem vende, à vista antes da compra. O que você escrever aqui aparece no rodapé da página de venda, na tela Assinatura e nos documentos. Sem nome e documento, nada aparece.</p>
        </div>
        {campo("nome", "Nome ou razão social", "Como está no documento.", 120)}
        {campo("documento", "CPF ou CNPJ", "Com os pontos e o traço, do jeito que vai aparecer.", 40)}
        {campo("endereco", "Endereço (se quiser)", "Cidade e estado já ajudam.", 200)}
        {campo("contato", "Contato (se quiser)", "E-mail ou telefone de atendimento.", 120)}
        <p className="g-pp g-muted" data-teste="previa-vendedor">{temVendedor(vendedor) ? `Vai aparecer assim: ${linhaDoVendedor(vendedor)}` : "Preencha o nome e o documento para a linha aparecer."}</p>
        <div><button className="g-btn pri" disabled={gravando}>{gravando ? "Gravando…" : "Gravar"}</button></div>
      </form>

      <section className="g-card g-pilha">
        <div>
          <h2>Assinatura atrasada</h2>
          <p className="g-muted g-p">Quando a Cakto avisa que a cobrança não passou, a conta continua funcionando por este número de dias, com aviso na tela. Depois fica só para consulta, até o pagamento entrar.</p>
        </div>
        <div className="g-fila">
          <label className="g-campo" style={{ maxWidth: 140 }}><span>Dias de prazo</span>
            <input className="g-input" name="atraso_dias" inputMode="numeric" maxLength={2} value={dias} onChange={(e) => setDias(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button type="button" className="g-btn sec" onClick={() => void salvarDias()}>Gravar prazo</button>
        </div>
      </section>

      <section className="g-pilha">
        <div>
          <h2>Por vendedor</h2>
          <p className="g-muted g-p">O vendedor manda o link com o código dele no fim (por exemplo, <b>/gestao?v=ana</b>). O pet shop que criar a conta por esse link fica marcado com o código. O cupom usado no pagamento vem da Cakto.</p>
        </div>
        <div className="g-card g-lista" style={{ paddingBlock: 6 }} data-teste="por-vendedor">
          {!resumo.length ? <p className="g-muted g-p">Nenhum pet shop chegou por link de vendedor ainda.</p> : resumo.map((r) => (
            <div key={r.vendedor} className="g-linha">
              <span className="t"><b>{r.vendedor}</b>
                <span>{r.cadastros} {r.cadastros === 1 ? "cadastro" : "cadastros"} · {r.testando} em teste · {r.pagantes} {r.pagantes === 1 ? "pagante" : "pagantes"}{r.pagamentos ? ` · ${r.pagamentos} ${r.pagamentos === 1 ? "pagamento" : "pagamentos"}, ${brl(r.valor)}` : ""}{r.cupons.length ? ` · cupons: ${r.cupons.join(", ")}` : ""}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="g-pilha">
        <div>
          <h2>Pet shops com origem</h2>
          <p className="g-muted g-p">Quem veio por link de vendedor ou de campanha, quem usou cupom e quem pediu ajuda da equipe no teste. O telefone só aparece para quem pediu a ajuda.</p>
        </div>
        <div className="g-card g-lista" style={{ paddingBlock: 6 }} data-teste="lojas-com-origem">
          {!dados.lojas.length ? <p className="g-muted g-p">Nada por aqui ainda.</p> : dados.lojas.map((l) => (
            <div key={l.id} className="g-linha">
              <span className="t"><b>{l.nome}</b>
                <span>
                  {dataCompleta(new Date(l.criado_em))} · {STATUS[l.status] ?? l.status}
                  {l.vendedor ? ` · vendedor ${l.vendedor}` : ""}
                  {l.utm?.utm_source ? ` · veio de ${l.utm.utm_source}${l.utm.utm_campaign ? ` (${l.utm.utm_campaign})` : ""}` : ""}
                  {l.cupom ? ` · cupom ${l.cupom}` : ""}
                  {l.quer_ajuda ? " · pediu ajuda da equipe" : ""}
                </span>
              </span>
              {l.quer_ajuda && l.telefone && (
                <a className="g-btn p sec" href={linkWhatsApp(l.telefone, `Oi! Aqui é da equipe do Maestro Pet Gestão. Vi que você começou o teste do ${l.nome}. Posso ajudar em alguma coisa?`) ?? undefined} target="_blank" rel="noopener noreferrer">
                  <MessageCircle aria-hidden />{fmtTelefone(l.telefone)}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="g-pilha">
        <div>
          <h2>Pagamentos com cupom</h2>
          <p className="g-muted g-p">Últimos 400 dias. De {dados.pagamentos.length} {dados.pagamentos.length === 1 ? "pagamento" : "pagamentos"}, {comCupom.length} {comCupom.length === 1 ? "usou" : "usaram"} cupom.</p>
        </div>
        <div className="g-card g-lista" style={{ paddingBlock: 6 }} data-teste="pagamentos-com-cupom">
          {!comCupom.length ? <p className="g-muted g-p">Nenhum pagamento com cupom ainda.</p> : comCupom.map((p) => (
            <div key={p.id} className="g-linha">
              <span className="t"><b>{p.cupom} · {p.nome ?? "pet shop apagado"}</b>
                <span>{dataCompleta(new Date(p.recebido_em))} · {nomePlano(p.plano)}{typeof p.valor === "number" ? ` · pagou ${brl(p.valor)}` : ""}{Number(p.desconto) > 0 ? ` · desconto de ${brl(Number(p.desconto))}` : ""}{p.vendedor ? ` · vendedor ${p.vendedor}` : ""}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
