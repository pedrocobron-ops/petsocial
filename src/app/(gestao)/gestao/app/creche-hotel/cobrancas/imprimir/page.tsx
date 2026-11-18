"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  estadoDaCobranca, extrasDaCobranca, faltaDaCobranca, isoMes, lerPlanos, partesDoDesconto, partesDosExtras, SELECT_COBRANCA, taxasDaCobranca, taxiDaCobranca, textoDasDatas, textoDasTaxas, textoDoTaxiDaCobranca, textoDosDias,
  type CobrancaCompleta, type PlanoCompleto,
} from "@/lib/gestao/creche";
import { opcoesDeCobranca } from "@/lib/gestao/dinheiro-opcoes";
import { pixDe } from "@/lib/gestao/hotel-opcoes";
import { textoDoPagamento } from "@/lib/gestao/dinheiro";
import { brl, dataCurta, deIsoDia, fmtTelefone, isoDia, nomeMes, centavos } from "@/lib/gestao/util";
import { nomeDaCasa } from "@/lib/gestao/modulos";
import { useGestao } from "@/components/gestao/contexto";
import { SemAcesso } from "@/components/gestao/financeiro/comum";
import { Esqueleto, ok, useDados } from "@/components/gestao/ui";
import { CabecalhoDoPapel, ControlesDoPapel, Pares, Papel, useTituloDoPapel } from "@/components/gestao/papel";

/**
 * Cobranças da creche no papel, para quem cuida do financeiro (mesma regra da aba Cobranças):
 * - a lista do mês, por família (tutor): pets, plano, dias extras, taxas, total, vencimento e se está pago ou em aberto;
 * - com `tutor=<id>`, o extrato do mês de um tutor, para imprimir ou salvar em PDF e mandar para ele.
 * Só lê; não gera cobrança nem mexe em nada.
 */
type Familia = { chave: string; tutor: string; telefone: string | null; doMes: CobrancaCompleta[]; antigas: CobrancaCompleta[] };

function familias(doMes: CobrancaCompleta[], antigas: CobrancaCompleta[]): Familia[] {
  const mapa = new Map<string, Familia>();
  const pegar = (c: CobrancaCompleta) => {
    const t = c.pets?.clientes, chave = t?.id ?? `pet-${c.pet_id}`;
    const f = mapa.get(chave) ?? { chave, tutor: t?.nome ?? "Sem tutor", telefone: t?.telefone ?? null, doMes: [], antigas: [] };
    mapa.set(chave, f);
    return f;
  };
  for (const c of doMes) pegar(c).doMes.push(c);
  for (const c of antigas) pegar(c).antigas.push(c);
  return [...mapa.values()].sort((a, b) => a.tutor.localeCompare(b.tutor, "pt-BR"));
}

/** Situação escrita (sai em preto e branco). */
function Situacao({ c, hoje }: { c: CobrancaCompleta; hoje: string }) {
  const e = estadoDaCobranca(c, hoje);
  if (e.estado === "paga") return e.semValor ? <span className="sit paga">Sem valor</span>
    : <><span className="sit paga">Pago</span><small>em {dataCurta(c.lancamentos!.data)} · {textoDoPagamento(c.lancamentos!)}</small></>;
  const parte = faltaDaCobranca(c) < Number(c.total) ? <small>pago {brl(centavos(Number(c.total) - faltaDaCobranca(c)))}, falta {brl(faltaDaCobranca(c))}</small> : null;
  if (e.estado === "atrasada") return <><span className="sit atrasada">Atrasado</span><small>{e.atraso === 1 ? "1 dia" : `${e.atraso} dias`}</small>{parte}</>;
  return <><span className="sit aberta">Em aberto</span>{e.estado === "hoje" && <small>vence hoje</small>}{parte}</>;
}

/** "seg, qua e sex · mensalidade R$ 600,00 (proporcional)" */
function textoDoPlano(c: CobrancaCompleta, plano: PlanoCompleto | undefined, modelo: string | null) {
  if (c.acerto_saida) return { linha: "Acerto da saída", apoio: plano?.dias.length ? `plano de ${textoDosDias(plano.dias)}` : "" };
  const dias = plano?.dias.length ? textoDosDias(plano.dias) : "";
  const valor = `mensalidade ${brl(c.valor_mensal)}${Number(c.valor_mensal) < Number(c.valor_cheio) ? " (proporcional)" : ""}`;
  return modelo ? { linha: modelo, apoio: [dias, valor].filter(Boolean).join(" · ") } : { linha: dias || "Mensalidade", apoio: valor };
}

function textoDosExtras(c: CobrancaCompleta) {
  const extras = extrasDaCobranca(c), taxas = taxasDaCobranca(c), partes = partesDosExtras(c);
  return [
    extras.length ? `${extras.length === 1 ? "1 dia extra" : `${extras.length} dias extras`} (${textoDasDatas(extras.map((x) => x.dia))})${partes.dias > 0 ? ` ${brl(partes.dias)}` : " sem valor"}` : null,
    taxas.length ? `${textoDasTaxas(taxas.length)} (${textoDasDatas(taxas.map((x) => x.dia))}) ${brl(partes.taxas)}` : null,
    partes.taxi > 0 ? `${textoDoTaxiDaCobranca(c)} ${brl(partes.taxi)}` : null,
    partesDoDesconto(c).irmao > 0 ? `Desconto irmão − ${brl(partesDoDesconto(c).irmao)}` : null,
    partesDoDesconto(c).outro > 0 ? `Desconto − ${brl(partesDoDesconto(c).outro)}` : null,
  ].filter(Boolean) as string[];
}

function CobrancasNoPapel() {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const params = useSearchParams();
  const agora = new Date(), hoje = isoDia(agora);
  const [mesIso, setMesIso] = useState(() => (params.get("mes") ?? isoMes(agora)).slice(0, 7) + "-01");
  const [tutor, setTutor] = useState(() => params.get("tutor") ?? "");
  const mes = deIsoDia(mesIso);
  const mesTexto = `${nomeMes(mes)} de ${mes.getFullYear()}`;

  const { dados, carregando, erro } = useDados(async () => {
    if (!cuidoDoFinanceiro) return null;
    const fimDoMes = isoDia(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
    // tudo numa leva só (no celular, cada espera soma)
    const [doMes, antigas, planos, pendentes, m] = await Promise.all([
      sb.from("creche_cobrancas").select(SELECT_COBRANCA).eq("petshop_id", petshop.id).eq("mes", mesIso).eq("status", "aberta").order("vencimento").order("id").limit(1000),
      // o que ficou sem pagar de meses anteriores
      sb.from("creche_cobrancas").select(SELECT_COBRANCA.replace("lancamentos(", "lancamentos!inner(")).eq("petshop_id", petshop.id).eq("status", "aberta")
        .lt("mes", mesIso).eq("lancamentos.pago", false).order("vencimento").order("id").limit(1000),
      lerPlanos(sb, petshop.id, true),
      // dias extras do mês que ainda não estão em cobrança nenhuma: vão para a mensalidade seguinte (a lista diz, para ninguém achar que sumiram)
      sb.from("estadias").select("plano_id, dia").eq("petshop_id", petshop.id).eq("mensalista", "extra").in("status", ["em_casa", "encerrada"])
        .is("cobranca_id", null).gte("dia", mesIso).lte("dia", fimDoMes).order("dia").limit(1000),
      // nome do modelo de plano ("3x por semana"), quando o plano veio de um modelo (são poucos: lê todos junto)
      sb.from("creche_modelos").select("id, nome").eq("petshop_id", petshop.id).limit(500),
    ]);
    const modelos = new Map<string, string>();
    for (const x of m.data ?? []) modelos.set(x.id, x.nome);
    const extrasDepois = new Map<string, string[]>();
    for (const e of pendentes.data ?? []) if (e.plano_id && e.dia) extrasDepois.set(e.plano_id, [...(extrasDepois.get(e.plano_id) ?? []), e.dia]);
    return { doMes: ok(doMes) as unknown as CobrancaCompleta[], antigas: ok(antigas) as unknown as CobrancaCompleta[], planos, modelos, extrasDepois };
  }, [petshop.id, mesIso, cuidoDoFinanceiro]);

  const todas = useMemo(() => familias(dados?.doMes ?? [], dados?.antigas ?? []), [dados]);
  const familia = tutor ? todas.find((f) => f.chave === tutor) ?? null : null;
  const planoDe = (c: CobrancaCompleta) => dados?.planos.find((p) => p.id === c.plano_id);
  const modeloDe = (c: CobrancaCompleta) => { const id = planoDe(c)?.modelo_id; return id ? dados?.modelos.get(id) ?? null : null; };
  useTituloDoPapel(familia ? `Extrato ${nomeMes(mes)} ${mes.getFullYear()} · ${familia.tutor} · ${petshop.nome}` : `Cobranças da creche ${nomeMes(mes)} ${mes.getFullYear()} · ${petshop.nome}`);

  if (!cuidoDoFinanceiro) return <SemAcesso />;

  const soma = (l: CobrancaCompleta[]) => centavos(l.reduce((s, c) => s + Number(c.total), 0));
  const falta = (l: CobrancaCompleta[]) => centavos(l.filter((c) => !c.lancamentos?.pago).reduce((s, c) => s + faltaDaCobranca(c), 0));
  const doMes = dados?.doMes ?? [];
  const recebido = centavos(soma(doMes) - falta(doMes));
  const atrasadas = [...doMes, ...(dados?.antigas ?? [])].filter((c) => estadoDaCobranca(c, hoje).estado === "atrasada");
  const meses = Array.from({ length: 13 }, (_, i) => new Date(agora.getFullYear(), agora.getMonth() - i, 1));

  const controles = (
    <ControlesDoPapel voltar="/gestao/app/creche-hotel?ver=cobrancas" rotuloVoltar={`Voltar para ${nomeDaCasa(petshop)}`}
      dica={familia ? "O extrato em PDF pode ir para o tutor pelo WhatsApp, como arquivo. Não é nota fiscal." : "A folha mostra valores: guarde com cuidado."}>
      <div className="g-imp-linha">
        <select className="g-select" value={mesIso} aria-label="Mês" onChange={(e) => setMesIso(e.target.value)}>
          {meses.map((m) => <option key={isoMes(m)} value={isoMes(m)}>{nomeMes(m).replace(/^./, (x) => x.toUpperCase())} de {m.getFullYear()}</option>)}
        </select>
        <select className="g-select" value={tutor} aria-label="O que imprimir" onChange={(e) => setTutor(e.target.value)}>
          <option value="">Lista do mês (todas as famílias)</option>
          {todas.map((f) => <option key={f.chave} value={f.chave}>Extrato de {f.tutor}</option>)}
        </select>
      </div>
    </ControlesDoPapel>
  );

  if (familia) return <div className="g-imp">{controles}<Extrato f={familia} mes={mes} mesTexto={mesTexto} hoje={hoje} planoDe={planoDe} modeloDe={modeloDe} /></div>;

  return (
    <div className="g-imp">
      {controles}
      <Papel pe="Valores da creche">
        <CabecalhoDoPapel titulo={`Cobranças da creche · ${mesTexto}`} />
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={5} /> : (
          <>
            <div className="g-pa-kpis">
              <div><small>Cobrado no mês</small><b>{brl(soma(doMes))}</b><span>{doMes.length === 1 ? "1 cobrança" : `${doMes.length} cobranças`}</span></div>
              <div><small>Já recebido</small><b>{brl(recebido)}</b><span>{doMes.filter((c) => estadoDaCobranca(c, hoje).estado === "paga").length} pagas</span></div>
              <div><small>Falta receber</small><b>{brl(falta(doMes))}</b><span>deste mês</span></div>
              <div><small>Atrasadas</small><b>{atrasadas.length}</b><span>{atrasadas.length ? brl(falta(atrasadas)) : "nenhuma"}</span></div>
            </div>
            {!todas.length ? <p className="g-pa-vazio">Nenhuma cobrança em {nomeMes(mes)}. Gere as cobranças do mês em {nomeDaCasa(petshop)}, Cobranças.</p> : (
              <table className="g-pa-lista">
                <colgroup><col className="c-pet" /><col className="c-plano" /><col className="c-extras" /><col className="c-total" /><col className="c-vence" /><col className="c-sit" /></colgroup>
                <thead><tr><th>Pet</th><th>Plano</th><th>Extras e taxas</th><th className="pa-num">Total</th><th>Vence</th><th>Situação</th></tr></thead>
                {todas.map((f) => {
                  const linhas = [...f.antigas, ...f.doMes];
                  const deve = falta(linhas);
                  return (
                    <tbody key={f.chave}>
                      <tr className="fam"><td colSpan={6}><b>{f.tutor}</b><span>{fmtTelefone(f.telefone) || "sem telefone"} · {deve > 0 ? `falta ${brl(deve)}` : "tudo pago"}</span></td></tr>
                      {linhas.map((c) => {
                        const p = textoDoPlano(c, planoDe(c), modeloDe(c));
                        const depois = c.mes === mesIso && !c.acerto_saida ? dados?.extrasDepois.get(c.plano_id) ?? [] : [];
                        const x = [...textoDosExtras(c), ...(depois.length ? [`${depois.length === 1 ? "1 dia extra" : `${depois.length} dias extras`} (${textoDasDatas(depois)}) vai para a mensalidade de ${nomeMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}`] : [])];
                        return (
                          <tr key={c.id}>
                            <td><b>{c.pets?.nome ?? "Pet removido"}</b>{c.mes !== mesIso && <small>de {nomeMes(deIsoDia(c.mes))}</small>}</td>
                            <td>{p.linha}{p.apoio && <small>{p.apoio}</small>}</td>
                            <td>{x.length ? x.map((t, i) => <span key={i} style={{ display: "block" }}>{t}</span>) : "—"}</td>
                            <td className="pa-num"><span className="valor">{brl(c.total)}</span></td>
                            <td>{dataCurta(c.vencimento)}</td>
                            <td><Situacao c={c} hoje={hoje} /></td>
                          </tr>
                        );
                      })}
                      {linhas.length > 1 && <tr className="soma"><td colSpan={3}>Total da família</td><td className="pa-num">{brl(soma(linhas))}</td><td colSpan={2}>{deve > 0 ? `falta ${brl(deve)}` : "tudo pago"}</td></tr>}
                    </tbody>
                  );
                })}
              </table>
            )}
            <p className="g-pa-nota">Lista das mensalidades de {nomeMes(mes)} (canceladas e pagas por fora do sistema não entram) e do que ficou em aberto de meses anteriores. A situação é a de agora, na hora da impressão.</p>
          </>
        )}
      </Papel>
    </div>
  );
}

/** Extrato do mês de uma família: o que cada pet usou e quanto deu, o que já foi pago e o que falta. Para mandar ao tutor. */
function Extrato({ f, mes, mesTexto, hoje, planoDe, modeloDe }: {
  f: Familia; mes: Date; mesTexto: string; hoje: string; planoDe: (c: CobrancaCompleta) => PlanoCompleto | undefined; modeloDe: (c: CobrancaCompleta) => string | null;
}) {
  const { petshop } = useGestao();
  const pix = opcoesDeCobranca(petshop).pix || pixDe(petshop);
  const todas = [...f.antigas, ...f.doMes];
  const aberto = todas.filter((c) => estadoDaCobranca(c, hoje).estado !== "paga");
  const deve = centavos(aberto.reduce((s, c) => s + faltaDaCobranca(c), 0));
  const vence = aberto.map((c) => c.vencimento).sort()[0];
  const linhasDe = (c: CobrancaCompleta) => {
    const plano = planoDe(c), extras = extrasDaCobranca(c), taxas = taxasDaCobranca(c), partes = partesDosExtras(c);
    const modelo = modeloDe(c);
    return [
      !c.acerto_saida && { nome: `Mensalidade de ${nomeMes(deIsoDia(c.mes))}${plano?.dias.length ? ` (${[modelo, textoDosDias(plano.dias)].filter(Boolean).join(", ")})` : ""}${Number(c.valor_mensal) < Number(c.valor_cheio) ? ", proporcional" : ""}`, valor: brl(c.valor_mensal) },
      // dia extra: um por linha, com a data; sem valor por dia guardado, a soma vai numa linha só
      ...(extras.some((x) => x.valor > 0) ? extras.map((x) => ({ nome: `Dia extra em ${dataCurta(x.dia)}`, valor: brl(x.valor), recuo: true }))
        : extras.length ? [{ nome: `${extras.length === 1 ? "Dia extra" : `${extras.length} dias extras`} (${textoDasDatas(extras.map((x) => x.dia))})`, valor: partes.dias > 0 ? brl(partes.dias) : "sem valor", recuo: true }] : []),
      ...taxas.map((x) => ({ nome: `Busca fora do horário em ${dataCurta(x.dia)}`, valor: brl(x.valor), recuo: true })),
      ...taxiDaCobranca(c).dias.map((x) => ({ nome: `Táxi pet em ${dataCurta(x.dia)}`, valor: brl(x.valor), recuo: true })),
      taxiDaCobranca(c).mes > 0 && { nome: "Táxi pet do mês", valor: brl(taxiDaCobranca(c).mes), recuo: true },
      partesDoDesconto(c).irmao > 0 && { nome: "Desconto irmão", valor: `− ${brl(partesDoDesconto(c).irmao)}`, recuo: true },
      partesDoDesconto(c).outro > 0 && { nome: "Desconto", valor: `− ${brl(partesDoDesconto(c).outro)}`, recuo: true },
      { nome: "Total", valor: brl(c.total), forte: true },
    ];
  };
  const bloco = (c: CobrancaCompleta) => {
    const e = estadoDaCobranca(c, hoje);
    return (
      <section key={c.id} className="g-pa-ext-pet">
        <h2 className="g-pa-t">{c.pets?.nome ?? "Pet"}{c.acerto_saida ? " · acerto da saída" : ""}<small>{e.estado === "paga" ? (e.semValor ? "sem valor a pagar" : `pago em ${dataCurta(c.lancamentos!.data)}`) : `${e.estado === "atrasada" ? "venceu" : "vence"} em ${dataCurta(c.vencimento)}`}</small></h2>
        <Pares linhas={linhasDe(c)} />
        {e.estado !== "paga" && faltaDaCobranca(c) < Number(c.total) && <p className="g-pa-nota">Já pago {brl(centavos(Number(c.total) - faltaDaCobranca(c)))}. Falta {brl(faltaDaCobranca(c))}.</p>}
      </section>
    );
  };
  return (
    <Papel pe={petshop.telefone ? `${petshop.nome} · ${fmtTelefone(petshop.telefone)}` : petshop.nome}>
      <CabecalhoDoPapel titulo={`Extrato da creche · ${mesTexto}`} apoio={`${f.tutor}${f.telefone ? ` · ${fmtTelefone(f.telefone)}` : ""}`} />
      {f.doMes.length ? f.doMes.map(bloco) : <p className="g-pa-vazio">Nenhuma mensalidade em {nomeMes(mes)}.</p>}
      {f.antigas.length > 0 && (
        <>
          <h2 className="g-pa-t">Em aberto de meses anteriores<small>{f.antigas.length === 1 ? "1 cobrança" : `${f.antigas.length} cobranças`}</small></h2>
          {f.antigas.map(bloco)}
        </>
      )}
      <div className={`g-pa-total${deve > 0 ? "" : " pago"}`}>
        <span>{deve > 0 ? <>Total a pagar{vence ? <>, {vence < hoje ? "venceu" : "vence"} em {dataCurta(vence)}</> : null}</> : "Tudo pago. Obrigado!"}</span>
        <b>{brl(deve)}</b>
      </div>
      {deve > 0 && pix && <p className="g-pa-pagar">Pagamento pelo Pix: <b>{pix}</b></p>}
      <p className="g-pa-nota">Extrato para conferência. Não é nota fiscal.</p>
    </Papel>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><CobrancasNoPapel /></Suspense>;
}
