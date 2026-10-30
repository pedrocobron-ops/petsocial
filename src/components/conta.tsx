"use client";

import { useId, useState } from "react";
import type { ContaExemplo, DegrauConta } from "@/lib/vendas/tipos";

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const decimal = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2)).replace(".", ",");

/** Aceita "12,50" e "12.50"; vazio ou inválido vale 0. */
const numero = (s: string) => {
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v >= 0 ? v : 0;
};

function Campo({ rotulo, valor, muda, prefixo }: { rotulo: string; valor: string; muda: (v: string) => void; prefixo?: string }) {
  const id = useId();
  return (
    <div className="conta-campo">
      <label htmlFor={id}>{rotulo}</label>
      <div className="conta-input">
        {prefixo && <span aria-hidden>{prefixo}</span>}
        <input id={id} type="text" inputMode="decimal" autoComplete="off" value={valor} onChange={(e) => muda(e.target.value)} />
      </div>
    </div>
  );
}

type Valores = { qtd: string; preco: string; custoU: string; custoM: string };
const doDegrau = (d: DegrauConta): Valores => ({
  qtd: decimal(d.quantidade), preco: decimal(d.preco), custoU: decimal(d.custoUnidade ?? 0), custoM: decimal(d.custoMes ?? 0),
});

/**
 * "A conta": 4 degraus (abre no 3º, "Agenda cheia") que preenchem os campos; a pessoa pode trocar os números.
 * Mostra a sobra do mês em destaque, o ano e em quantas vendas o produto se paga. O aviso fica sempre junto.
 */
export default function Conta({ conta, precoProduto }: { conta: ContaExemplo; precoProduto: number }) {
  const [ativo, setAtivo] = useState(2);
  const [v, setV] = useState<Valores>(() => doDegrau(conta.degraus[2]));
  const muda = (k: keyof Valores) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  const escolhe = (i: number) => { setAtivo(i); setV(doDegrau(conta.degraus[i])); };

  const semanas = conta.periodo === "semana" ? 4 : 1;
  const noMes = numero(v.qtd) * semanas;
  const entra = noMes * numero(v.preco);
  const sai = noMes * (conta.rotulos.custoUnidade ? numero(v.custoU) : 0) + (conta.rotulos.custoMes ? numero(v.custoM) : 0);
  const sobra = entra - sai;
  const porUnidade = noMes > 0 ? sobra / noMes : 0;
  const paga = porUnidade > 0 ? Math.ceil(precoProduto / porUnidade) : 0;
  const [um, varios] = conta.unidade;

  return (
    <div className="conta">
      <div className="conta-lado">
        <div className="conta-degraus" role="group" aria-label="Escolha um degrau">
          {conta.degraus.map((d, i) => (
            <button key={d.nome} type="button" aria-pressed={ativo === i} onClick={() => escolhe(i)}>
              <small>{i + 1}</small>{d.nome}
            </button>
          ))}
        </div>
        <form className="conta-form folha" onSubmit={(e) => e.preventDefault()} aria-label="Os números da conta">
          <Campo rotulo={conta.rotulos.quantidade} valor={v.qtd} muda={muda("qtd")} />
          <Campo rotulo={conta.rotulos.preco} valor={v.preco} muda={muda("preco")} prefixo="R$" />
          {conta.rotulos.custoUnidade && <Campo rotulo={conta.rotulos.custoUnidade} valor={v.custoU} muda={muda("custoU")} prefixo="R$" />}
          {conta.rotulos.custoMes && <Campo rotulo={conta.rotulos.custoMes} valor={v.custoM} muda={muda("custoM")} prefixo="R$" />}
          <p className="conta-origem">
            <b>{conta.degraus[ativo].nome}:</b> {conta.degraus[ativo].origem}
            {conta.nota && <> {conta.nota}</>}
            {conta.fonte && <> <a href={conta.fonte[1]} target="_blank" rel="noopener noreferrer">{conta.fonte[0]}</a>.</>}
          </p>
        </form>
      </div>
      <div className="conta-resultado" aria-live="polite">
        <div className="conta-sobra">
          <span>Sobra estimada no mês</span>
          <strong className="num">{reais(sobra)}</strong>
          <span className="conta-ano">por ano: <b>{reais(sobra * 12)}</b></span>
        </div>
        {paga > 0 && (
          <p className="conta-paga"><span>{conta.paga ?? "O manual se paga"} com <b>{paga} {paga === 1 ? um : varios}</b>.</span><small>{reais(precoProduto)} ÷ a sobra de cada {um} nesta conta.</small></p>
        )}
        {sobra < 0 && <p className="conta-alerta">Com esses números, a conta não fecha. Reveja o preço ou os custos: o manual ensina a calcular.</p>}
        <dl>
          <div>
            <dt>Entra no mês</dt>
            <dd>{reais(entra)}<small>{noMes.toLocaleString("pt-BR")} {noMes === 1 ? um : varios}{semanas > 1 ? " (4 semanas)" : ""}</small></dd>
          </div>
          <div>
            <dt>Sai no mês</dt>
            <dd>− {reais(sai)}<small>custos do exemplo</small></dd>
          </div>
        </dl>
        <p className="conta-aviso"><b>Exemplo, não promessa.</b> O resultado depende do seu trabalho, preço e região. Imposto e meses fracos podem mudar a conta.</p>
        {conta.casos && conta.casos.length > 0 && (
          <div className="conta-casos">
            <h3>Na vida real</h3>
            <ul>
              {conta.casos.map(([frase, fonte, url]) => (
                <li key={url}>{frase} <a href={url} target="_blank" rel="noopener noreferrer">Fonte: {fonte}</a></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
