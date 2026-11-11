"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Lock, Wallet } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { avisarMudanca, Campo, CampoValor, Esqueleto, Folha, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import {
  ErroDeCarga, FolhaLancamento, hojeIso, LinhaResumo, paginar, resumoDoCaixa, rotuloForma, SemAcesso, type Tipo,
} from "@/components/gestao/financeiro/comum";
import type { Caixa, Lancamento } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCurta, dataLonga, hora, isoDia } from "@/lib/gestao/util";

export default function PaginaCaixa() {
  const { vejoFinanceiro } = useGestao();
  return vejoFinanceiro ? <CaixaDoDia /> : <SemAcesso />;
}

type FolhaAberta =
  | { tipo: "abrir" }
  | { tipo: "novo"; de: Tipo }
  | { tipo: "editar"; lancamento: Lancamento }
  | { tipo: "fechar" }
  | { tipo: "resumo"; caixaId: string };

function diferenca(contado: number | null, esperado: number) {
  if (contado == null) return null;
  const d = Math.round((contado - esperado) * 100) / 100;
  if (d === 0) return { tom: "certo", etiqueta: "verde", texto: "Bateu certinho.", curto: "bateu" } as const;
  if (d > 0) return { tom: "sobra", etiqueta: "azul", texto: `Sobra de ${brl(d)}.`, curto: `sobra ${brl(d)}` } as const;
  return { tom: "falta", etiqueta: "vermelho", texto: `Falta de ${brl(-d)}.`, curto: `falta ${brl(-d)}` } as const;
}

function CaixaDoDia() {
  const { sb, petshop } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  const [folha, setFolha] = useState<FolhaAberta | null>(null);
  const hoje = hojeIso();

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const a = await sb.from("caixas").select("*").eq("petshop_id", petshop.id).is("fechado_em", null).maybeSingle();
    if (a.error) throw new Error(a.error.message);
    const aberto: Caixa | null = a.data;
    const f = await sb.from("caixas").select("*").eq("petshop_id", petshop.id).not("fechado_em", "is", null)
      .order("fechado_em", { ascending: false }).limit(14);
    if (f.error) throw new Error(f.error.message);
    const fechados: Caixa[] = f.data ?? [];
    const ids = [...(aberto ? [aberto.id] : []), ...fechados.map((c) => c.id)];
    const dosCaixas = ids.length
      ? await paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", true)
        .in("caixa_id", ids).order("criado_em", { ascending: false }).order("id").range(de, ate))
      : [];
    // sem caixa aberto, o que foi lançado hoje fica solto (sem caixa)
    const soltos = aberto ? [] : await paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id)
      .eq("pago", true).eq("data", hoje).is("caixa_id", null).order("criado_em", { ascending: false }).order("id").range(de, ate));
    return { aberto, fechados, dosCaixas, soltos };
  }, [petshop.id, hoje]);

  const abrir = (f: FolhaAberta) => { if (f.tipo !== "resumo" && somenteLeitura()) return; setFolha(f); };
  const doCaixa = (id: string) => (dados?.dosCaixas ?? []).filter((l) => l.caixa_id === id);

  const topo = (
    <header className="g-topo">
      <div>
        <h1>Caixa</h1>
        <p className="g-muted">{dataLonga(new Date())}</p>
      </div>
      {dados?.aberto && (
        <div className="g-acoes">
          <button className="g-btn sec" onClick={() => abrir({ tipo: "fechar" })}><Lock />Fechar o caixa</button>
        </div>
      )}
    </header>
  );

  if (!dados) {
    return <>{topo}{erro ? <ErroDeCarga erro={erro} tentar={recarregar} /> : carregando ? <Esqueleto linhas={4} /> : null}</>;
  }

  const { aberto, fechados, soltos } = dados;
  const lancamentos = aberto ? doCaixa(aberto.id) : soltos;
  const resumo = aberto ? resumoDoCaixa(aberto.valor_inicial, lancamentos) : null;
  const abertoEmOutroDia = aberto && isoDia(new Date(aberto.aberto_em)) !== hoje;
  const ultimo = fechados[0];
  const caixaDoResumo = folha?.tipo === "resumo" ? fechados.find((c) => c.id === folha.caixaId) : null;

  return (
    <>
      {topo}
      {erro && <ErroDeCarga erro={erro} tentar={recarregar} />}
      <div className="g-grade c2">
        <div className="g-pilha">
          {aberto && resumo ? (
            <>
              {abertoEmOutroDia && (
                <div className="g-aviso" style={{ marginBottom: 0 }}>
                  <span>Este caixa está aberto desde {dataAmigavel(aberto.aberto_em)}. Feche e abra outro para o dia de hoje ficar separado.</span>
                </div>
              )}
              <section className="g-card verde" aria-label="Caixa aberto">
                <p className="g-rotulo">Dinheiro na gaveta agora</p>
                <p className="g-num" style={{ marginTop: 8 }}>{brl(resumo.esperado)}</p>
                <p className="g-muted g-pp" style={{ marginTop: 8 }}>
                  Aberto às {hora(aberto.aberto_em)} com {brl(aberto.valor_inicial)} de troco.
                </p>
                <div className="gf-formas">
                  {resumo.porForma.filter((f) => f.id !== "outro" || f.entrou > 0).map((f) => (
                    <div key={f.id}>
                      <span className="g-muted g-pp">{f.rotulo}</span>
                      <b>{brl(f.entrou)}</b>
                    </div>
                  ))}
                </div>
                <p className="g-muted g-pp" style={{ marginTop: 12 }}>
                  Entrou {brl(resumo.entrou)} neste caixa{resumo.saiu > 0 ? ` e saiu ${brl(resumo.saiu)}` : ""}.
                </p>
              </section>
              <div className="gf-dupla">
                <button className="g-btn pri" onClick={() => abrir({ tipo: "novo", de: "entrada" })}><ArrowDownLeft />Entrada</button>
                <button className="g-btn sec" onClick={() => abrir({ tipo: "novo", de: "saida" })}><ArrowUpRight />Saída</button>
              </div>
            </>
          ) : (
            <section className="g-card menta">
              <div className="g-pilha p">
                <h2>O caixa está fechado</h2>
                <p className="g-muted">Abra o caixa para começar o dia. Você conta o troco da gaveta e o resto a gente soma.</p>
                <div><button className="g-btn pri" onClick={() => abrir({ tipo: "abrir" })}><Wallet />Abrir o caixa</button></div>
              </div>
            </section>
          )}

          <section className="g-card">
            <div className="g-card-t">
              <h3>{aberto ? "Lançamentos deste caixa" : "Lançado hoje, sem caixa aberto"}</h3>
              {lancamentos.length > 0 && <span className="g-muted g-pp g-tab">{lancamentos.length}</span>}
            </div>
            {lancamentos.length ? (
              <div className="g-lista">
                {lancamentos.map((l) => <LinhaLancamento key={l.id} l={l} aoTocar={() => abrir({ tipo: "editar", lancamento: l })} />)}
              </div>
            ) : (
              <Vazio titulo="Nada lançado hoje ainda." texto={aberto ? "Quando alguém pagar, toque em Entrada." : "O que entrar e sair hoje aparece aqui."} />
            )}
          </section>
        </div>

        <div className="g-pilha">
          {!aberto && ultimo && (
            <section className="g-card">
              <div className="g-card-t">
                <h3>Último fechamento</h3>
                <span className="g-muted g-pp">{dataAmigavel(ultimo.fechado_em!)}, {hora(ultimo.fechado_em!)}</span>
              </div>
              <ResumoCaixa caixa={ultimo} lancamentos={doCaixa(ultimo.id)} />
            </section>
          )}
          <section className="g-card">
            <div className="g-card-t"><h3>Caixas fechados</h3></div>
            {fechados.length ? (
              <div className="g-lista">
                {fechados.map((c) => {
                  const r = resumoDoCaixa(c.valor_inicial, doCaixa(c.id));
                  const dif = diferenca(c.valor_contado, r.esperado);
                  return (
                    <button key={c.id} className="g-linha" onClick={() => setFolha({ tipo: "resumo", caixaId: c.id })}>
                      <span className="t">
                        <b>{dataLonga(c.fechado_em!)}</b>
                        <span>Entrou {brl(r.entrou)}</span>
                      </span>
                      {dif && <span className={`g-tag ${dif.etiqueta}`}>{dif.curto}</span>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="g-muted g-p">Os caixas que você fechar ficam guardados aqui.</p>
            )}
          </section>
        </div>
      </div>

      {folha?.tipo === "abrir" && <FolhaAbrir aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "novo" && <FolhaLancamento modo="pago" tipo={folha.de} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "editar" && (
        <FolhaLancamento modo="pago" tipo={folha.lancamento.tipo as Tipo} inicial={folha.lancamento} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />
      )}
      {folha?.tipo === "fechar" && aberto && (
        <FolhaFechar caixa={aberto} lancamentos={lancamentos} aoFechar={() => setFolha(null)}
          aoSalvo={async () => { await recarregar(); setFolha({ tipo: "resumo", caixaId: aberto.id }); }} />
      )}
      {caixaDoResumo && (
        <Folha titulo={`Caixa de ${dataCurta(caixaDoResumo.aberto_em)}`} aoFechar={() => setFolha(null)}
          rodape={<button className="g-btn sec" onClick={() => setFolha(null)}>Fechar</button>}>
          <div className="g-pilha">
            <p className="g-muted g-p">
              Aberto {dataAmigavel(caixaDoResumo.aberto_em)} às {hora(caixaDoResumo.aberto_em)}, fechado {dataAmigavel(caixaDoResumo.fechado_em!)} às {hora(caixaDoResumo.fechado_em!)}.
            </p>
            <ResumoCaixa caixa={caixaDoResumo} lancamentos={doCaixa(caixaDoResumo.id)} />
          </div>
        </Folha>
      )}
    </>
  );
}

function LinhaLancamento({ l, aoTocar }: { l: Lancamento; aoTocar: () => void }) {
  const entrada = l.tipo === "entrada";
  return (
    <button className="g-linha" onClick={aoTocar}>
      <span className="t">
        <b>{l.descricao || l.categoria}</b>
        <span>{hora(l.criado_em)}{l.descricao ? ` · ${l.categoria}` : ""}</span>
      </span>
      <span className="g-tag">{rotuloForma(l.forma)}</span>
      <span className={`d ${entrada ? "g-verde-t" : "g-vermelho-t"}`}><b>{entrada ? "+" : "−"} {brl(l.valor)}</b></span>
    </button>
  );
}

/** Contas de um caixa: troco, o que entrou e saiu por forma, o esperado e (se fechado) o contado. */
function ResumoCaixa({ caixa, lancamentos }: { caixa: Caixa; lancamentos: Lancamento[] }) {
  const r = resumoDoCaixa(caixa.valor_inicial, lancamentos);
  const dif = diferenca(caixa.valor_contado, r.esperado);
  const entradas = r.porForma.filter((f) => f.entrou > 0);
  const saidas = r.porForma.filter((f) => f.saiu > 0);
  return (
    <div className="g-pilha p">
      <div className="gf-pares">
        <LinhaResumo nome="Troco inicial" valor={brl(caixa.valor_inicial)} />
        <LinhaResumo nome="Entradas" valor={brl(r.entrou)} forte tom="verde" />
        {entradas.map((f) => <LinhaResumo key={f.id} nome={`· ${f.rotulo}`} valor={brl(f.entrou)} />)}
        <LinhaResumo nome="Saídas" valor={brl(r.saiu)} forte tom="vermelho" />
        {saidas.map((f) => <LinhaResumo key={f.id} nome={`· ${f.rotulo}`} valor={brl(f.saiu)} />)}
        <LinhaResumo nome="Dinheiro esperado na gaveta" valor={brl(r.esperado)} forte />
        {caixa.valor_contado != null && <LinhaResumo nome="Dinheiro contado" valor={brl(caixa.valor_contado)} forte />}
      </div>
      {dif && <p className={`gf-dif ${dif.tom}`}>{dif.texto}</p>}
      {caixa.obs && <p className="g-muted g-p">Observação: {caixa.obs}</p>}
    </div>
  );
}

function FolhaAbrir({ aoFechar, aoSalvo }: { aoFechar: () => void; aoSalvo: () => Promise<void> }) {
  const { sb, petshop, user } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [valor, setValor] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      const r = await sb.from("caixas").insert({ petshop_id: petshop.id, valor_inicial: Math.max(0, valor ?? 0), aberto_por: user.id });
      if (r.error) throw new Error(r.error.message);
      avisar("Caixa aberto. Bom trabalho!");
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      await aoSalvo();
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Abrir o caixa" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Abrindo…" : "Abrir o caixa"}</button>
      </>}>
      <form className="g-form" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <Campo rotulo="Troco inicial em dinheiro" dica="Quanto tem de dinheiro na gaveta agora. Se não tem nada, deixe em branco.">
          <CampoValor valor={valor} aoMudar={setValor} autoFocus />
        </Campo>
        <button type="submit" hidden />
      </form>
    </Folha>
  );
}

function FolhaFechar({ caixa, lancamentos, aoFechar, aoSalvo }: {
  caixa: Caixa; lancamentos: Lancamento[]; aoFechar: () => void; aoSalvo: () => Promise<void>;
}) {
  const { sb, petshop, user } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [contado, setContado] = useState<number | null>(null);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const r = resumoDoCaixa(caixa.valor_inicial, lancamentos);
  const dif = diferenca(contado, r.esperado);

  async function salvar() {
    if (salvando) return;
    if (contado == null || contado < 0) { setErro("Conte o dinheiro da gaveta e escreva aqui. Se está vazia, escreva 0."); return; }
    setSalvando(true);
    try {
      const u = await sb.from("caixas").update({ fechado_em: new Date().toISOString(), fechado_por: user.id, valor_contado: contado, obs: obs.trim() || null })
        .eq("id", caixa.id).eq("petshop_id", petshop.id).is("fechado_em", null).select("id");
      if (u.error) throw new Error(u.error.message);
      if (!u.data?.length) throw new Error("Este caixa já tinha sido fechado.");
      avisar("Caixa fechado.");
      avisarMudanca();
      await aoSalvo();
    } catch (e) {
      avisarErro(e);
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Fechar o caixa" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Fechando…" : "Fechar o caixa"}</button>
      </>}>
      <div className="g-form">
        <div className="g-card areia">
          <ResumoCaixa caixa={caixa} lancamentos={lancamentos} />
        </div>
        <Campo rotulo="Quanto tem na gaveta" erro={erro} dica="Conte só o dinheiro. Pix e cartão não entram nesta conta.">
          <CampoValor valor={contado} aoMudar={(v) => { setContado(v); setErro(null); }} autoFocus />
        </Campo>
        {dif && <p className={`gf-dif ${dif.tom}`} role="status">{dif.texto}</p>}
        <Campo rotulo="Observação (se quiser)">
          <textarea className="g-textarea" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: faltou troco, sangria para o banco" />
        </Campo>
      </div>
    </Folha>
  );
}
