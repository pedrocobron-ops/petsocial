"use client";

import { useState } from "react";
import { Building2, Plus, Repeat, Trash2 } from "lucide-react";
import {
  FORMAS_CONTA_FIXA, FREQUENCIAS, lerResumoContasFixas, MESES, MODELOS_CONTA_FIXA, quandoVence, valorPorMes, ANTECEDENCIA_CONTAS_FIXAS,
  type ContaFixa, type Frequencia, type ResumoContasFixas,
} from "@/lib/gestao/contas-fixas";
import { CATEGORIAS_SAIDA } from "@/lib/gestao/tipos";
import { brl, dataCompleta, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { CampoDinheiro } from "../loja/pecas";
import { avisarMudanca, Campo, Esqueleto, Folha, useAvisos, useDados, Vazio } from "../ui";
import { categoriaAtual, Chips, ErroDeCarga, Grupo } from "./comum";

/**
 * Financeiro, Contas fixas: as contas que se repetem (aluguel, luz, salários…), cadastradas uma vez. A conta de cada mês
 * entra sozinha em A pagar 10 dias antes do vencimento (banco: contas_fixas_gerar). Em cima, quanto custa manter o pet shop
 * por mês e quanto já entrou no mês. Só o dono e quem cuida do financeiro abrem (a tela Financeiro já confere; o banco também).
 */
export default function ContasFixas({ versao, aoEditar, aoCriar }: { versao: number; aoEditar: (c: ContaFixa) => void; aoCriar: () => void }) {
  const { sb, petshop } = useGestao();
  const { dados, erro, recarregar } = useDados(async () => {
    const [contas, resumo] = await Promise.all([
      sb.from("contas_fixas").select("*").eq("petshop_id", petshop.id).order("ativa", { ascending: false }).order("nome").limit(200),
      lerResumoContasFixas(sb, petshop.id),
    ]);
    if (contas.error) throw new Error(contas.error.message);
    return { contas: (contas.data ?? []) as unknown as ContaFixa[], resumo };
  }, [petshop.id, versao]);

  if (erro) return <ErroDeCarga erro={erro} tentar={recarregar} />;
  if (!dados) return <Esqueleto linhas={3} />;
  const hoje = isoDia(new Date());
  return (
    <div className="g-pilha" data-teste="contas-fixas">
      <QuantoCusta resumo={dados.resumo} contas={dados.contas} />
      {dados.contas.length ? (
        <section className="g-card">
          <div className="g-card-t">
            <h3><Tile icone={Repeat} tom="manteiga" tamanho="p" />Contas fixas</h3>
            <button className="g-btn sec p" onClick={aoCriar}><Plus />Nova conta fixa</button>
          </div>
          <p className="g-muted g-pp" style={{ marginTop: 0 }}>A conta de cada mês entra sozinha em A pagar {ANTECEDENCIA_CONTAS_FIXAS} dias antes do vencimento. Quando pagar, toque em Paguei lá.</p>
          <div className="g-lista">
            {dados.contas.map((c) => {
              const terminou = Boolean(c.termina_em && c.termina_em < hoje);
              const naoMensal = c.frequencia !== "mensal";
              return (
                <button key={c.id} className="g-linha" onClick={() => aoEditar(c)} aria-label={`Editar a conta fixa ${c.nome}`}>
                  <Tile icone={Repeat} tom={c.ativa && !terminou ? "manteiga" : "ceu"} />
                  <span className="t">
                    <b>{c.nome}</b>
                    <span>
                      {quandoVence(c)} · {categoriaAtual(c.categoria, petshop)}{c.forma ? ` · ${c.forma}` : ""}
                      {c.comeca_em > hoje ? ` · começa em ${dataCompleta(c.comeca_em)}` : ""}
                      {c.termina_em && !terminou ? ` · até ${dataCompleta(c.termina_em)}` : ""}
                    </span>
                  </span>
                  <span className="d">
                    <b>{brl(c.valor)}</b>
                    {terminou ? <span className="g-tag">terminou</span>
                      : !c.ativa ? <span className="g-tag amarelo">pausada</span>
                      : c.valor_varia ? <span className="g-tag">valor varia</span>
                      : naoMensal ? <span className="g-tag">{brl(Math.round(valorPorMes(c) * 100) / 100)} por mês</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <Vazio titulo="Nenhuma conta fixa ainda." texto={`Cadastre uma vez o aluguel, a luz, a internet e os salários. Todo mês a conta entra sozinha em A pagar, ${ANTECEDENCIA_CONTAS_FIXAS} dias antes de vencer.`}>
          <button className="g-btn pri" onClick={aoCriar}><Plus />Nova conta fixa</button>
        </Vazio>
      )}
    </div>
  );
}

const FREQ_FRASE: Record<string, string> = { trimestral: "a cada 3 meses", semestral: "a cada 6 meses", anual: "por ano" };

/** "Quanto custa manter o pet shop": o total por mês das contas fixas e quanto já entrou no mês. Só números de verdade. */
function QuantoCusta({ resumo: r, contas }: { resumo: ResumoContasFixas; contas: ContaFixa[] }) {
  const exemplo = contas.find((c) => c.ativa && c.frequencia !== "mensal");
  if (!(r.total_mensal > 0)) {
    return (
      <section className="g-card g-fin-meta vazia" aria-label="Quanto custa manter o pet shop">
        <Tile icone={Building2} tom="manteiga" tamanho="g" />
        <div className="g-fin-meta-txt">
          <h3>Quanto custa manter o pet shop?</h3>
          <p className="g-muted g-p">Cadastre as contas fixas e o sistema mostra quanto elas somam por mês e quanto você precisa faturar para pagá-las.</p>
        </div>
      </section>
    );
  }
  const pct = r.pct ?? 0;
  return (
    <section className="g-card g-fin-meta" aria-label="Quanto custa manter o pet shop" data-teste="quanto-custa">
      <div className="g-card-t"><h3><Tile icone={Building2} tom="manteiga" tamanho="p" />Quanto custa manter o pet shop</h3></div>
      <p className="g-p">Para pagar as contas fixas, você precisa faturar <b className="g-tab">{brl(r.total_mensal)}</b> por mês.</p>
      {r.nao_mensais > 0 && exemplo && (
        <p className="g-muted g-pp" style={{ margin: 0 }}>
          Contas que não vencem todo mês entram divididas pelos meses: {exemplo.nome} ({brl(exemplo.valor)} {FREQ_FRASE[exemplo.frequencia]}) conta {brl(Math.round(valorPorMes(exemplo) * 100) / 100)} por mês.
        </p>
      )}
      <div className="g-fin-meta-topo">
        <p className="g-fin-meta-num"><b className="g-num">{brl(r.faturamento_mes)}</b> <span className="g-muted">faturados neste mês</span></p>
        <span className={`g-tag g-tab${pct >= 100 ? " verde" : ""}`}>{pct}%</span>
      </div>
      <div className="g-fin-meta-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)} aria-label={`${pct}% das contas fixas do mês`}>
        <i style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <p className="g-muted g-pp" style={{ margin: 0 }}>
        {r.falta > 0 ? `Faltam ${brl(r.falta)} de faturamento para cobrir as contas fixas deste mês. ` : "O faturamento deste mês já cobre as contas fixas. "}
        Faturamento do dia 1 até hoje, a mesma conta de Relatórios. As contas fixas não incluem produtos, comissões e outras despesas: elas vêm por cima.
      </p>
    </section>
  );
}

/** Cadastrar ou mudar uma conta fixa (com modelos para preencher rápido). */
export function FolhaContaFixa({ conta, aoFechar, aoSalvo }: { conta?: ContaFixa | null; aoFechar: () => void; aoSalvo: () => void | Promise<void> }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const hoje = isoDia(new Date());
  // conta nova: o id sai daqui, uma vez só (o toque duplo grava a mesma conta)
  const [id] = useState(() => conta?.id ?? crypto.randomUUID());
  const [nome, setNome] = useState(conta?.nome ?? "");
  const [categoria, setCategoria] = useState(conta?.categoria ?? "Aluguel");
  const [valor, setValor] = useState<number | null>(conta ? Number(conta.valor) : null);
  const [varia, setVaria] = useState(conta?.valor_varia ?? false);
  const [dia, setDia] = useState(conta ? String(conta.dia) : "");
  const [frequencia, setFrequencia] = useState<Frequencia>(conta?.frequencia ?? "mensal");
  const [mesInicial, setMesInicial] = useState(conta?.mes_inicial ?? new Date().getMonth() + 1);
  const [comecaEm, setComecaEm] = useState(conta?.comeca_em ?? hoje);
  const [terminaEm, setTerminaEm] = useState(conta?.termina_em ?? "");
  const [forma, setForma] = useState(conta?.forma ?? "");
  const [ativa, setAtiva] = useState(conta?.ativa ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const categorias = CATEGORIAS_SAIDA.filter((c) => c !== "Devolução").map((c) => ({ id: c, rotulo: categoriaAtual(c, petshop) }));
  if (!categorias.some((c) => c.id === categoria)) categorias.unshift({ id: categoria, rotulo: categoria });

  function usarModelo(m: (typeof MODELOS_CONTA_FIXA)[number]) {
    setNome(m.nome); setCategoria(m.categoria); setVaria(m.varia); setFrequencia(m.frequencia ?? "mensal"); setErro(null);
  }

  async function salvar() {
    if (salvando) return;
    const d = Number(dia);
    if (!nome.trim()) { setErro("Escreva o nome da conta (ex.: Aluguel)."); return; }
    if (!valor || valor <= 0) { setErro(varia ? "Escreva um valor aproximado da conta." : "Escreva o valor da conta."); return; }
    if (!Number.isInteger(d) || d < 1 || d > 31) { setErro("Escreva o dia do vencimento, de 1 a 31."); return; }
    if (terminaEm && terminaEm < comecaEm) { setErro("O fim não pode ser antes do começo."); return; }
    setErro(null);
    setSalvando(true);
    try {
      const r = await sb.rpc("contas_fixas_salvar", {
        p: petshop.id,
        p_conta: { id, nome: nome.trim(), categoria, valor, valor_varia: varia, dia: d, frequencia, mes_inicial: frequencia === "mensal" ? null : mesInicial, comeca_em: comecaEm, termina_em: terminaEm || null, ativa, forma: forma.trim() || null },
      });
      if (r.error) throw new Error(r.error.message);
      const gerados = Number((r.data as { gerados?: number } | null)?.gerados ?? 0);
      avisar(`${conta ? "Conta fixa salva." : "Conta fixa cadastrada."}${gerados ? ` ${gerados === 1 ? "A conta deste mês já está" : `${gerados} contas já estão`} em A pagar.` : ""}`);
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!conta || salvando) return;
    const sim = await confirmar({
      titulo: `Apagar a conta fixa ${conta.nome}?`,
      texto: "As próximas contas deixam de entrar em A pagar. As que já estão lá (e as já pagas) continuam. Para parar só por um tempo, desligue “Gerar as próximas contas”.",
      confirmar: "Apagar", perigo: true,
    });
    if (!sim) return;
    setSalvando(true);
    try {
      const r = await sb.rpc("contas_fixas_apagar", { p: petshop.id, p_id: conta.id });
      if (r.error) throw new Error(r.error.message);
      avisar("Conta fixa apagada.");
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={conta ? "Editar conta fixa" : "Nova conta fixa"} aoFechar={aoFechar}
      rodape={<>
        {conta && <button type="button" className="g-btn perigo" onClick={() => void apagar()} disabled={salvando}><Trash2 />Apagar</button>}
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : conta ? "Salvar" : "Cadastrar"}</button>
      </>}>
      <form className="g-form" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        {!conta && (
          <Grupo rotulo="Comece por um modelo">
            <div className="g-chips" role="group" aria-label="Modelos de conta fixa">
              {MODELOS_CONTA_FIXA.map((m) => (
                <button key={m.nome} type="button" className="g-chip" aria-pressed={nome === m.nome} onClick={() => usarModelo(m)}>{m.nome}</button>
              ))}
            </div>
          </Grupo>
        )}
        <Campo rotulo="Nome da conta">
          <input className="g-input" value={nome} maxLength={60} onChange={(e) => { setNome(e.target.value); setErro(null); }} placeholder="Ex.: Aluguel, Luz, Contador" />
        </Campo>
        <Grupo rotulo="O valor">
          <div className="g-seg" role="group" aria-label="O valor é">
            <button type="button" aria-pressed={!varia} onClick={() => setVaria(false)}>É sempre o mesmo</button>
            <button type="button" aria-pressed={varia} onClick={() => setVaria(true)}>Muda todo mês</button>
          </div>
        </Grupo>
        <div className="dupla">
          <Campo rotulo={varia ? "Valor aproximado" : "Valor"} erro={erro}>
            <CampoDinheiro valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} maximo={99999999} rotulo={varia ? "Valor aproximado" : "Valor"} />
          </Campo>
          <Campo rotulo="Dia do vencimento" dica="Em mês mais curto, vence no último dia.">
            <input className="g-input g-tab" type="number" inputMode="numeric" min={1} max={31} value={dia} onChange={(e) => { setDia(e.target.value); setErro(null); }} aria-label="Dia do vencimento" placeholder="Ex.: 10" />
          </Campo>
        </div>
        {varia && <p className="g-muted g-pp" style={{ margin: 0 }}>A conta entra em A pagar com esse valor e o aviso “valor estimado: confira a conta”. Quando a conta chegar, abra em A pagar e escreva o valor certo.</p>}
        <Grupo rotulo="Vence">
          <Chips opcoes={FREQUENCIAS} valor={frequencia} aoMudar={setFrequencia} rotulo="De quanto em quanto tempo" />
        </Grupo>
        {frequencia !== "mensal" && (
          <Campo rotulo="Mês da primeira conta" dica={frequencia === "anual" ? "Vence uma vez por ano, neste mês." : `Depois, ${frequencia === "trimestral" ? "a cada 3 meses" : "a cada 6 meses"}.`}>
            <select className="g-input" value={mesInicial} onChange={(e) => setMesInicial(Number(e.target.value))} aria-label="Mês da primeira conta">
              {MESES.map((m, i) => <option key={m} value={i + 1}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </Campo>
        )}
        <Grupo rotulo="Categoria"><Chips opcoes={categorias} valor={categoria} aoMudar={setCategoria} rotulo="Categoria" /></Grupo>
        <div className="dupla">
          <Campo rotulo="Começa em" dica="Contas de antes do cadastro não são criadas.">
            <input type="date" className="g-input" value={comecaEm} onChange={(e) => { setComecaEm(e.target.value); setErro(null); }} aria-label="Começa em" />
          </Campo>
          <Campo rotulo="Termina em (se quiser)" dica="Contrato com fim? Ponha o último dia.">
            <input type="date" className="g-input" value={terminaEm} min={comecaEm} onChange={(e) => { setTerminaEm(e.target.value); setErro(null); }} aria-label="Termina em" />
          </Campo>
        </div>
        <Campo rotulo="Como paga (se quiser)" dica="Só uma anotação para lembrar.">
          <input className="g-input" value={forma} maxLength={60} list="formas-conta-fixa" onChange={(e) => setForma(e.target.value)} placeholder="Ex.: Pix, boleto, débito automático" />
          <datalist id="formas-conta-fixa">{FORMAS_CONTA_FIXA.map((f) => <option key={f} value={f} />)}</datalist>
        </Campo>
        {conta && (
          <label className="g-check">
            <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
            <span>Gerar as próximas contas <span className="g-muted">(desligue para pausar; o que já está em A pagar continua lá)</span></span>
          </label>
        )}
        <button type="submit" hidden />
      </form>
    </Folha>
  );
}
