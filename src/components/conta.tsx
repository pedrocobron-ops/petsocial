"use client";

import { useId, useState } from "react";
import type { CampoConta, ContaExemplo } from "@/lib/vendas/tipos";

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Aceita "12,50" e "12.50"; vazio ou inválido vale 0. */
const numero = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

function Campo({ c, valor, muda, prefixo }: { c: CampoConta; valor: string; muda: (v: string) => void; prefixo?: string }) {
  const id = useId();
  return (
    <div className="conta-campo">
      <label htmlFor={id}>{c.rotulo}</label>
      <div className="conta-input">
        {prefixo && <span aria-hidden>{prefixo}</span>}
        <input id={id} type="number" inputMode="decimal" min={0} step={c.passo ?? 1} value={valor} onChange={(e) => muda(e.target.value)} />
      </div>
    </div>
  );
}

/**
 * "A conta": um simulador simples, com os valores de exemplo do manual.
 * Mostra quanto entra, quanto sai e quanto sobra no mês. Não é promessa: o aviso fica sempre junto do resultado.
 */
export default function Conta({ conta }: { conta: ContaExemplo }) {
  const [qtd, setQtd] = useState(String(conta.quantidade.valor));
  const [preco, setPreco] = useState(String(conta.preco.valor));
  const [custoU, setCustoU] = useState(String(conta.custoUnidade?.valor ?? 0));
  const [custoM, setCustoM] = useState(String(conta.custoMes?.valor ?? 0));

  const semanas = conta.periodo === "semana" ? 4 : 1;
  const noMes = numero(qtd) * semanas;
  const entra = noMes * numero(preco);
  const sai = noMes * (conta.custoUnidade ? numero(custoU) : 0) + (conta.custoMes ? numero(custoM) : 0);
  const sobra = entra - sai;

  return (
    <div className="conta">
      <form className="conta-form folha" onSubmit={(e) => e.preventDefault()} aria-label="Simulador: mude os números">
        <Campo c={conta.quantidade} valor={qtd} muda={setQtd} />
        <Campo c={conta.preco} valor={preco} muda={setPreco} prefixo="R$" />
        {conta.custoUnidade && <Campo c={conta.custoUnidade} valor={custoU} muda={setCustoU} prefixo="R$" />}
        {conta.custoMes && <Campo c={conta.custoMes} valor={custoM} muda={setCustoM} prefixo="R$" />}
        <p className="conta-origem">{conta.origem}</p>
      </form>
      <div className="conta-resultado" aria-live="polite">
        <dl>
          <div>
            <dt>Entra no mês</dt>
            <dd>{reais(entra)}<small>{noMes.toLocaleString("pt-BR")} {conta.unidade}{semanas > 1 ? " (4 semanas)" : ""}</small></dd>
          </div>
          <div>
            <dt>Sai no mês</dt>
            <dd>− {reais(sai)}<small>custos do exemplo</small></dd>
          </div>
          <div className="conta-sobra">
            <dt>Sobra estimada no mês</dt>
            <dd>{reais(sobra)}</dd>
          </div>
        </dl>
        {sobra < 0 && <p className="conta-alerta">Com esses números, a conta não fecha. Reveja o preço ou os custos: o manual ensina a calcular.</p>}
        <p className="conta-aviso"><b>Exemplo, não promessa.</b> O resultado depende do seu trabalho, preço e região. Imposto e meses fracos podem mudar a conta.</p>
      </div>
    </div>
  );
}
