"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Plus, Search } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import {
  Chips, ErroDeCarga, FolhaBaixa, FolhaLancamento, hojeIso, paginar, rotuloForma, SemAcesso, soma, type Tipo,
} from "@/components/gestao/financeiro/comum";
import type { Lancamento } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCompleta, dataCurta, isoDia, nomeMes, semAcento } from "@/lib/gestao/util";

export default function PaginaFinanceiro() {
  const { vejoFinanceiro } = useGestao();
  return vejoFinanceiro ? <Financeiro /> : <SemAcesso />;
}

type Aba = "resumo" | "pagar" | "receber" | "lancamentos";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "pagar", rotulo: "A pagar" },
  { id: "receber", rotulo: "A receber" },
  { id: "lancamentos", rotulo: "Lançamentos" },
];
const FILTROS = [{ id: "tudo", rotulo: "Tudo" }, { id: "entrada", rotulo: "Entradas" }, { id: "saida", rotulo: "Saídas" }] as const;
type Filtro = (typeof FILTROS)[number]["id"];

type FolhaAberta =
  | { tipo: "novo" }
  | { tipo: "editar"; lancamento: Lancamento }
  | { tipo: "conta"; de: Tipo; conta?: Lancamento }
  | { tipo: "baixa"; conta: Lancamento };

type Movimento = Pick<Lancamento, "tipo" | "valor">;

function porCategoria(lista: Lancamento[]) {
  const mapa = new Map<string, number>();
  for (const l of lista) mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) + Number(l.valor));
  return [...mapa].map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
}

function Financeiro() {
  const { sb, petshop } = useGestao();
  const { avisar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const agora = new Date();
  const [mes, setMes] = useState(() => new Date(agora.getFullYear(), agora.getMonth(), 1));
  const [aba, setAba] = useState<Aba>("resumo");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [folha, setFolha] = useState<FolhaAberta | null>(null);

  const inicio = isoDia(mes);
  const fim = isoDia(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
  const mesAnterior = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
  const mesAtual = mes.getFullYear() === agora.getFullYear() && mes.getMonth() === agora.getMonth();
  const hoje = hojeIso();

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [doMes, anterior, contas] = await Promise.all([
      paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", true)
        .gte("data", inicio).lte("data", fim).order("data", { ascending: false }).order("criado_em", { ascending: false }).order("id").range(de, ate)),
      paginar<Movimento>((de, ate) => sb.from("lancamentos").select("tipo, valor").eq("petshop_id", petshop.id).eq("pago", true)
        .gte("data", isoDia(mesAnterior)).lt("data", inicio).order("id").range(de, ate)),
      paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", false)
        .order("vencimento", { ascending: true, nullsFirst: false }).order("id").range(de, ate)),
    ]);
    return { doMes, anterior, contas };
  }, [petshop.id, inicio]);

  const contas = useMemo(() => {
    const doMes = dados?.doMes ?? [];
    const entradas = doMes.filter((l) => l.tipo === "entrada");
    const saidas = doMes.filter((l) => l.tipo === "saida");
    const anterior = dados?.anterior ?? [];
    return {
      entrou: soma(entradas), saiu: soma(saidas),
      entradasPorCategoria: porCategoria(entradas), saidasPorCategoria: porCategoria(saidas),
      entrouAntes: soma(anterior.filter((l) => l.tipo === "entrada")), saiuAntes: soma(anterior.filter((l) => l.tipo === "saida")),
      temAnterior: anterior.length > 0,
      aPagar: (dados?.contas ?? []).filter((l) => l.tipo === "saida"),
      aReceber: (dados?.contas ?? []).filter((l) => l.tipo === "entrada"),
    };
  }, [dados]);
  const resultado = Math.round((contas.entrou - contas.saiu) * 100) / 100;

  const abrir = (f: FolhaAberta) => { if (somenteLeitura()) return; setFolha(f); };

  function exportar() {
    const linhas = dados?.doMes ?? [];
    if (!linhas.length) { avisar("Não há lançamentos neste mês para exportar."); return; }
    const campo = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const numero = (n: number) => Number(n).toFixed(2).replace(".", ",");
    const csv = [
      ["Data", "Tipo", "Categoria", "Descrição", "Forma", "Valor"].join(";"),
      ...[...linhas].reverse().map((l) => [
        dataCompleta(l.data), l.tipo === "entrada" ? "Entrada" : "Saída", campo(l.categoria), campo(l.descricao ?? ""),
        l.forma ? rotuloForma(l.forma) : "", numero(l.tipo === "entrada" ? l.valor : -l.valor),
      ].join(";")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro-${inicio.slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const alvo = semAcento(busca);
  const filtrados = (dados?.doMes ?? []).filter((l) =>
    (filtro === "tudo" || l.tipo === filtro) &&
    (!alvo || semAcento(`${l.descricao ?? ""} ${l.categoria} ${rotuloForma(l.forma)}`).includes(alvo)));

  const tituloMes = `${nomeMes(mes)} de ${mes.getFullYear()}`;
  const acao = aba === "pagar" ? { rotulo: "Nova conta", abre: (): FolhaAberta => ({ tipo: "conta", de: "saida" }) }
    : aba === "receber" ? { rotulo: "Nova conta", abre: (): FolhaAberta => ({ tipo: "conta", de: "entrada" }) }
    : { rotulo: "Novo lançamento", abre: (): FolhaAberta => ({ tipo: "novo" }) };

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Financeiro</h1>
          <p className="g-muted">O que entrou, o que saiu e o que ainda vence.</p>
        </div>
        <div className="g-acoes">
          <button className="g-btn sec" onClick={exportar} disabled={!dados} title={`Baixar os lançamentos de ${tituloMes} em planilha`}><Download />Exportar</button>
          <button className="g-btn pri" onClick={() => abrir(acao.abre())}><Plus />{acao.rotulo}</button>
        </div>
      </header>

      <div className="g-pilha">
        <div className="gf-mes">
          <button className="g-ico" aria-label="Mês anterior" onClick={() => setMes(mesAnterior)}><ChevronLeft /></button>
          <b aria-live="polite">{tituloMes}</b>
          <button className="g-ico" aria-label="Próximo mês" disabled={mesAtual}
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight /></button>
        </div>

        {erro && <ErroDeCarga erro={erro} tentar={recarregar} />}
        {!dados ? (carregando ? <Esqueleto linhas={4} /> : null) : (
          <>
            <section className="g-card gf-tres" aria-label={`Números de ${tituloMes}`}>
              <div><span className="g-rotulo">Entrou</span><span className="gf-num g-verde-t">{brl(contas.entrou)}</span></div>
              <div><span className="g-rotulo">Saiu</span><span className="gf-num g-vermelho-t">{brl(contas.saiu)}</span></div>
              <div><span className="g-rotulo">Resultado do mês</span><span className={`gf-num${resultado < 0 ? " g-vermelho-t" : ""}`}>{brl(resultado)}</span></div>
            </section>

            <div className="gf-rola">
              <div className="g-seg" role="group" aria-label="Parte do financeiro">
                {ABAS.map((a) => (
                  <button key={a.id} aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>
                    {a.rotulo}
                    {a.id === "pagar" && contas.aPagar.length > 0 ? ` (${contas.aPagar.length})` : ""}
                    {a.id === "receber" && contas.aReceber.length > 0 ? ` (${contas.aReceber.length})` : ""}
                  </button>
                ))}
              </div>
            </div>

            {aba === "resumo" && (
              dados.doMes.length ? (
                <div className="g-pilha">
                  <Comparacao contas={contas} mesAtual={mesAtual} nomeAnterior={nomeMes(mesAnterior)} />
                  <div className="g-grade c2">
                    <Categorias titulo="De onde veio" total={contas.entrou} linhas={contas.entradasPorCategoria} vazio="Nenhuma entrada neste mês." />
                    <Categorias titulo="Para onde foi" total={contas.saiu} linhas={contas.saidasPorCategoria} vazio="Nenhuma saída neste mês." laranja />
                  </div>
                </div>
              ) : (
                <Vazio titulo={`Nada lançado em ${nomeMes(mes)}.`} texto="Quando você receber ou pagar alguma coisa, o resumo do mês aparece aqui." />
              )
            )}

            {(aba === "pagar" || aba === "receber") && (
              <Contas lista={aba === "pagar" ? contas.aPagar : contas.aReceber} receber={aba === "receber"} hoje={hoje}
                aoEditar={(c) => abrir({ tipo: "conta", de: c.tipo as Tipo, conta: c })}
                aoBaixar={(c) => abrir({ tipo: "baixa", conta: c })}
                aoCriar={() => abrir({ tipo: "conta", de: aba === "pagar" ? "saida" : "entrada" })} />
            )}

            {aba === "lancamentos" && (
              <section className="g-card">
                <div className="g-pilha p">
                  <div className="g-busca">
                    <Search />
                    <input className="g-input" type="search" placeholder="Buscar por descrição ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  </div>
                  <Chips opcoes={FILTROS} valor={filtro} aoMudar={setFiltro} rotulo="Mostrar" />
                </div>
                {filtrados.length ? (
                  <div className="g-lista" style={{ marginTop: 8 }}>
                    {filtrados.map((l) => {
                      const entrada = l.tipo === "entrada";
                      return (
                        <button key={l.id} className="g-linha" onClick={() => abrir({ tipo: "editar", lancamento: l })}>
                          <span className="t">
                            <b>{l.descricao || l.categoria}</b>
                            <span>{dataCurta(l.data)}{l.descricao ? ` · ${l.categoria}` : ""}</span>
                          </span>
                          <span className="g-tag">{rotuloForma(l.forma)}</span>
                          <span className={`d ${entrada ? "g-verde-t" : "g-vermelho-t"}`}><b>{entrada ? "+" : "−"} {brl(l.valor)}</b></span>
                        </button>
                      );
                    })}
                  </div>
                ) : dados.doMes.length ? (
                  <p className="g-muted g-p" style={{ padding: "16px 4px 4px" }}>Nada encontrado com esse filtro.</p>
                ) : (
                  <Vazio titulo={`Nada lançado em ${nomeMes(mes)}.`} texto="Toque em Novo lançamento para anotar uma entrada ou uma saída." />
                )}
              </section>
            )}
          </>
        )}
      </div>

      {folha?.tipo === "novo" && <FolhaLancamento modo="pago" tipo="entrada" escolheTipo escolheData aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "editar" && (
        <FolhaLancamento modo="pago" tipo={folha.lancamento.tipo as Tipo} inicial={folha.lancamento} escolheData aoFechar={() => setFolha(null)} aoSalvo={recarregar} />
      )}
      {folha?.tipo === "conta" && <FolhaLancamento modo="conta" tipo={folha.de} inicial={folha.conta} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "baixa" && <FolhaBaixa conta={folha.conta} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
    </>
  );
}

function Comparacao({ contas, mesAtual, nomeAnterior }: {
  contas: { entrou: number; saiu: number; entrouAntes: number; saiuAntes: number; temAnterior: boolean }; mesAtual: boolean; nomeAnterior: string;
}) {
  if (!contas.temAnterior) return <p className="g-muted g-p">Não há lançamentos em {nomeAnterior} para comparar.</p>;
  const frase = (agora: number, antes: number) => {
    const d = Math.round((agora - antes) * 100) / 100;
    if (d === 0) return `o mesmo que em ${nomeAnterior}`;
    return `${brl(Math.abs(d))} a ${d > 0 ? "mais" : "menos"} que em ${nomeAnterior}`;
  };
  return (
    <p className="g-p">
      {mesAtual ? "Até agora, entrou " : "Entrou "}<b>{frase(contas.entrou, contas.entrouAntes)}</b> e saiu <b>{frase(contas.saiu, contas.saiuAntes)}</b>.
      {mesAtual && <span className="g-muted"> O mês ainda não acabou.</span>}
    </p>
  );
}

function Categorias({ titulo, total, linhas, vazio, laranja }: {
  titulo: string; total: number; linhas: { nome: string; valor: number }[]; vazio: string; laranja?: boolean;
}) {
  const maior = linhas[0]?.valor ?? 0;
  return (
    <section className="g-card">
      <div className="g-card-t"><h3>{titulo}</h3><b className="g-tab">{brl(total)}</b></div>
      {linhas.length ? linhas.map((c) => (
        <div key={c.nome} className="gf-cat">
          <div className="g-fila entre g-p">
            <span>{c.nome}</span>
            <span className="g-tab">{brl(c.valor)} <span className="g-muted g-pp">{Math.round((c.valor / total) * 100)}%</span></span>
          </div>
          <div className={`g-prog${laranja ? " laranja" : ""}`}><i style={{ width: `${Math.max(2, (c.valor / maior) * 100)}%` }} /></div>
        </div>
      )) : <p className="g-muted g-p">{vazio}</p>}
    </section>
  );
}

function Contas({ lista, receber, hoje, aoEditar, aoBaixar, aoCriar }: {
  lista: Lancamento[]; receber: boolean; hoje: string;
  aoEditar: (c: Lancamento) => void; aoBaixar: (c: Lancamento) => void; aoCriar: () => void;
}) {
  if (!lista.length) {
    return (
      <Vazio titulo={receber ? "Ninguém está devendo." : "Nenhuma conta para pagar."}
        texto={receber ? "Quando alguém ficar de pagar depois, anote aqui para não esquecer." : "Anote aluguel, luz e fornecedores para ver o que vence."}>
        <button className="g-btn sec" onClick={aoCriar}><Plus />Anotar uma conta</button>
      </Vazio>
    );
  }
  const atrasadas = lista.filter((c) => c.vencimento && c.vencimento < hoje);
  return (
    <section className="g-card">
      <div className="g-card-t">
        <div>
          <p className="g-rotulo">{receber ? "Total a receber" : "Total a pagar"}</p>
          <p className="g-num m" style={{ marginTop: 6 }}>{brl(soma(lista))}</p>
        </div>
        {atrasadas.length > 0 && <span className="g-tag vermelho">{brl(soma(atrasadas))} em atraso</span>}
      </div>
      <div className="g-lista">
        {lista.map((c) => {
          const v = c.vencimento;
          const etiqueta = !v ? { texto: "sem data", tom: "" }
            : v < hoje ? { texto: "atrasada", tom: " vermelho" }
            : v === hoje ? { texto: "vence hoje", tom: " amarelo" }
            : { texto: dataCurta(v), tom: "" };
          return (
            <div key={c.id} className="g-linha gf-conta">
              <button className="gf-toque" onClick={() => aoEditar(c)} aria-label={`Editar ${c.descricao || c.categoria}`}>
                <span className="t">
                  <b>{c.descricao || c.categoria}</b>
                  <span>{c.categoria}{v && v !== hoje ? ` · ${v < hoje ? "venceu" : "vence"} ${dataAmigavel(v)}` : ""}</span>
                </span>
                <span className="d">
                  <b>{brl(c.valor)}</b>
                  <span className={`g-tag${etiqueta.tom}`}>{etiqueta.texto}</span>
                </span>
              </button>
              <button className="g-btn p verde" onClick={() => aoBaixar(c)} aria-label={`Dar baixa em ${c.descricao || c.categoria}`}>
                <Check /><span className="gf-so-largo">Dar baixa</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
