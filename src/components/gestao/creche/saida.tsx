"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import {
  faltaDaCobranca, isoMes, SELECT_COBRANCA, sugestaoDoMes, textoDasDatas, textoDasTaxas,
  type CobrancaCompleta, type PlanoCompleto,
} from "@/lib/gestao/creche";
import { calendarioGuardado, lerCalendario } from "@/lib/gestao/feriados";
import { brl, dataCompleta, dataCurta, deIsoDia, isoDia, nomeMes } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, avisarMudanca, Esqueleto, Folha, ok, useAvisos, useDados } from "../ui";
import "./creche.css";

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Dias extras e taxas de busca, até o fim do plano, que ainda não entraram em nenhuma cobrança. */
export type SobrasDaSaida = { plano: PlanoCompleto; extras: string[]; taxas: { dia: string; valor: number }[]; total: number };

/** Que planos que já acabaram têm dia extra ou taxa sem cobrança que nenhuma cobrança futura vai pegar. */
export async function lerSobrasDaSaida(sb: ReturnType<typeof useGestao>["sb"], petshopId: string, planos: PlanoCompleto[], diaria: number | null, hoje: string): Promise<SobrasDaSaida[]> {
  const acabaram = planos.filter((p) => p.fim && p.fim <= hoje);
  if (!acabaram.length) return [];
  const pets = [...new Set(acabaram.map((p) => p.pet_id))];
  const [ex, tx, cs] = await Promise.all([
    sb.from("estadias").select("pet_id, dia").eq("petshop_id", petshopId).eq("mensalista", "extra").in("status", ["em_casa", "encerrada"])
      .is("cobranca_id", null).in("pet_id", pets).order("dia").limit(1000),
    sb.from("creche_atrasos").select("pet_id, dia, valor").eq("petshop_id", petshopId).eq("estado", "mensalidade").is("cobranca_id", null).in("pet_id", pets).order("dia").limit(1000),
    sb.from("creche_cobrancas").select("plano_id, mes").eq("petshop_id", petshopId).in("plano_id", acabaram.map((p) => p.id)).limit(5000),
  ]);
  const lista: SobrasDaSaida[] = [];
  for (const p of acabaram) {
    // o último plano do pet é o que leva as sobras (um pet com dois planos seguidos só aparece uma vez)
    if (planos.some((o) => o.pet_id === p.pet_id && o.id !== p.id && o.inicio > p.inicio)) continue;
    const mesFim = isoMes(deIsoDia(p.fim!));
    // a cobrança do mês da saída ainda vai ser gerada: os dias de antes desse mês entram nela sozinhos
    const vaiGerar = !(cs.data ?? []).some((c) => c.plano_id === p.id && c.mes === mesFim) && (!p.primeira_cobranca || p.primeira_cobranca <= mesFim);
    const conta = (dia: string) => dia <= p.fim! && (!vaiGerar || dia >= mesFim);
    const extras = (ex.data ?? []).filter((e) => e.pet_id === p.pet_id && e.dia && conta(e.dia)).map((e) => e.dia!);
    const taxas = (tx.error ? [] : tx.data ?? []).filter((a) => a.pet_id === p.pet_id && conta(a.dia)).map((a) => ({ dia: a.dia, valor: Number(a.valor ?? 0) }));
    if (!extras.length && !taxas.length) continue;
    const unit = p.valor_extra ?? diaria ?? 0;
    lista.push({ plano: p, extras, taxas, total: centavos(extras.length * unit + taxas.reduce((s, x) => s + x.valor, 0)) });
  }
  return lista;
}

/** "1 dia extra (10/11)" e "1 taxa de busca fora do horário (12/11)" */
export function textoDasSobras(s: Pick<SobrasDaSaida, "extras" | "taxas">) {
  return [
    s.extras.length ? `${s.extras.length === 1 ? "1 dia extra" : `${s.extras.length} dias extras`} (${textoDasDatas(s.extras)})` : "",
    s.taxas.length ? `${textoDasTaxas(s.taxas.length)} (${textoDasDatas(s.taxas.map((x) => x.dia))})` : "",
  ].filter(Boolean).join(" e ");
}

/** O aviso em Cobranças (e em Gerar cobranças): quem saiu deixou dia extra ou taxa sem cobrança. */
export function AvisoSobras({ sobras, aoAcertar }: { sobras: SobrasDaSaida[]; aoAcertar?: (p: PlanoCompleto) => void }) {
  if (!sobras.length) return null;
  return (
    <div className="g-aviso" role="status" style={{ marginBottom: 0, flexDirection: "column", alignItems: "stretch" }}>
      {sobras.map((s) => (
        <div key={s.plano.id} className="g-fila" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
          <AlertTriangle />
          <span className="g-cresce">
            <b>{s.plano.pets?.nome ?? "Pet"}</b> saiu em {dataCurta(s.plano.fim!)} e tem {textoDasSobras(s)} sem cobrança: {brl(s.total)}.
            {aoAcertar ? "" : " Feche esta folha e toque em Acertar, em Cobranças."}
          </span>
          {aoAcertar && <button type="button" className="g-btn sec p" onClick={() => aoAcertar(s.plano)}>Acertar</button>}
        </div>
      ))}
    </div>
  );
}

type Decisao = { texto: string; ok: boolean };
type Item = {
  c: CobrancaCompleta; tipo: "mes" | "depois"; s: ReturnType<typeof sugestaoDoMes> | null;
  desconto: number; novoTotal: number; pago: boolean; recebido: number; aMais: number;
};

/**
 * Quando um cão sai: o plano ganhou data de fim. Mostra o que já foi cobrado do mês da saída em diante e oferece o acerto:
 * a mensalidade proporcional aos dias do plano até a saída (a mesma conta da primeira cobrança), cancelar a cobrança de um mês
 * em que ele já não vem, anotar o que ficou para devolver numa mensalidade já paga e cobrar os dias extras que sobraram.
 * Nada muda sem a escolha de quem cuida do financeiro. Sem nada para conferir, a folha nem abre.
 */
export default function AcertoDaSaida({ plano, aoFechar }: { plano: PlanoCompleto; aoFechar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const hoje = isoDia(new Date());
  const fim = plano.fim!;
  const mesFim = isoMes(deIsoDia(fim));
  const nome = plano.pets?.nome ?? "O pet";
  const [feitas, setFeitas] = useState<Record<string, Decisao>>({});
  // o que já foi decidido continua na folha (com o que foi feito), mesmo que a conta nova não peça mais nada
  const [guardados, setGuardados] = useState<{ itens: Record<string, Item>; sobras: SobrasDaSaida | null }>({ itens: {}, sobras: null });
  const [ocupado, setOcupado] = useState(false);
  const diaria = petshop.diaria_creche == null ? null : Number(petshop.diaria_creche);

  const { dados, recarregar } = useDados(async () => {
    // dia fechado não é dia do plano: a conta precisa do calendário
    if (!calendarioGuardado(petshop.id, false)) await lerCalendario(sb, petshop.id, false).catch(() => null);
    const [cs, sobras] = await Promise.all([
      sb.from("creche_cobrancas").select(SELECT_COBRANCA).eq("petshop_id", petshop.id).eq("plano_id", plano.id).gte("mes", mesFim).order("mes").order("id"),
      fim <= hoje ? lerSobrasDaSaida(sb, petshop.id, [plano], diaria, hoje) : Promise.resolve([] as SobrasDaSaida[]),
    ]);
    return { cobrancas: ok(cs) as unknown as CobrancaCompleta[], sobras: sobras[0] ?? null };
  }, [petshop.id, plano.id, fim]);

  const atuais: Item[] = (dados?.cobrancas ?? []).filter((c) => c.status === "aberta" && !c.acerto_saida).flatMap((c): Item[] => {
    const recebido = centavos(Number(c.total) - (c.lancamentos?.pago ? 0 : faltaDaCobranca(c)));
    if (c.mes === mesFim) {
      const s = sugestaoDoMes(plano, deIsoDia(c.mes), Number(c.valor_cheio), petshop.horario);
      if (!(s.valor < Number(c.valor_mensal))) return [];
      const desconto = Math.min(Number(c.desconto), s.valor + Number(c.valor_extras));
      const novoTotal = centavos(s.valor + Number(c.valor_extras) - desconto);
      const pago = Boolean(c.lancamentos?.pago) || recebido >= novoTotal;
      return [{ c, tipo: "mes", s, desconto, novoTotal, pago, recebido, aMais: centavos(recebido - novoTotal) }];
    }
    if (Number(c.total) <= 0) return [];
    return [{ c, tipo: "depois", s: null, desconto: 0, novoTotal: 0, pago: recebido > 0, recebido, aMais: recebido }];
  });
  const itens = [...atuais, ...Object.values(guardados.itens).filter((g) => !atuais.some((a) => a.c.id === g.c.id))];
  const sobras = dados?.sobras ?? guardados.sobras;
  const nada = Boolean(dados) && !atuais.length && !dados?.sobras;
  // nada para conferir: fecha sem mostrar nada
  useEffect(() => { if (nada && !Object.keys(feitas).length) aoFechar(); }, [nada]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fazer(chave: string, acao: () => Promise<void>, texto: string) {
    if (ocupado) return;
    setOcupado(true);
    const it = itens.find((x) => x.c.id === chave);
    setGuardados((g) => ({ itens: it ? { ...g.itens, [chave]: it } : g.itens, sobras: chave === "sobras" ? sobras : g.sobras }));
    try { await acao(); setFeitas((f) => ({ ...f, [chave]: { texto, ok: true } })); avisar(texto); avisarMudanca(); await recarregar(); }
    catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }
  const deixar = (chave: string, texto: string) => setFeitas((f) => ({ ...f, [chave]: { texto, ok: false } }));
  const mesDe = (c: CobrancaCompleta) => nomeMes(deIsoDia(c.mes));
  const anotar = async (c: CobrancaCompleta, nota: string) => { ok(await sb.rpc("creche_cobranca_anotar", { p_id: c.id, p_obs: [c.obs, nota].filter(Boolean).join(" · ").slice(0, 300) })); };

  // a cobrança do mês da saída, para dizer onde as sobras entram
  const doMesFim = (dados?.cobrancas ?? []).find((c) => c.mes === mesFim && !c.acerto_saida);
  const sobrasNoMes = Boolean(doMesFim && doMesFim.status === "aberta" && !doMesFim.lancamentos?.pago);

  return (
    <Folha titulo={`Saída de ${nome}: as cobranças`} aoFechar={aoFechar}
      rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Pronto</button>}>
      {!dados ? <Esqueleto linhas={3} /> : (
        <div className="g-pilha p">
          <div className="g-fila" style={{ flexWrap: "nowrap" }}>
            <AvatarPet pet={plano.pets ?? { nome: "?" }} />
            <p className="g-p g-cresce">O plano de {nome} {fim < hoje ? `terminou em ${dataCompleta(fim)}` : fim === hoje ? `termina hoje, ${dataCompleta(fim)}` : `termina em ${dataCompleta(fim)}`}. Confira o que já foi cobrado. Nada muda sem a sua escolha.</p>
          </div>
          {itens.map((it) => {
            const c = it.c, feita = feitas[c.id];
            const chave = c.id;
            return (
              <div key={c.id} className={`g-ht-atraso${feita ? " ok" : ""}`}>
                {it.tipo === "mes" && it.s && (
                  <>
                    <p><b>Mensalidade de {mesDe(c)}: {brl(c.valor_mensal)}.</b> Com a saída em {dataCurta(fim)}, {nome} tem {it.s.restam} dos {it.s.todos} dias do plano em {mesDe(c)} (dia fechado não conta).</p>
                    <p className="g-cm-conta g-tab">{brl(c.valor_cheio)} × {it.s.restam}/{it.s.todos} = <b>{brl(it.s.valor)}</b></p>
                    {it.pago ? (
                      <p className="g-p">{c.lancamentos?.pago ? `Esta mensalidade já foi paga (${brl(it.recebido)}).` : `Já entraram ${brl(it.recebido)} desta mensalidade.`} Pelos dias até a saída, {nome} pagou <b>{brl(it.aMais)}</b> a mais. O sistema não devolve nem muda o que foi pago.</p>
                    ) : (
                      <p className="g-p">A cobrança fica em <b>{brl(it.novoTotal)}</b>{Number(c.valor_extras) > 0 ? " (com os extras que já estão nela)" : ""}{it.recebido > 0 ? `, e já entraram ${brl(it.recebido)}` : ""}. A conta em A receber acompanha.</p>
                    )}
                  </>
                )}
                {it.tipo === "depois" && (
                  <>
                    <p><b>Cobrança de {mesDe(c)}: {brl(c.total)}.</b> O plano termina em {dataCurta(fim)}, antes de {mesDe(c)}: {nome} não vem nesse mês.</p>
                    {it.pago && <p className="g-p">{c.lancamentos?.pago ? "Ela já foi paga" : `Já entraram ${brl(it.recebido)} dela`}. O sistema não devolve nem muda o que foi pago.</p>}
                  </>
                )}
                {feita ? <p className="g-pp"><Check size={14} aria-hidden /> {feita.texto}</p> : (
                  <div className="g-fila">
                    {it.tipo === "mes" && !it.pago && (
                      <button type="button" className="g-btn verde p" disabled={ocupado} onClick={() => void fazer(chave, async () => {
                        ok(await sb.rpc("creche_cobranca_editar", { p_id: c.id, p_valor: it.s!.valor, p_desconto: it.desconto, p_vencimento: c.vencimento, p_obs: c.obs ?? undefined }));
                      }, `Mensalidade de ${mesDe(c)} de ${nome} acertada: ${brl(it.s!.valor)}.`)}>Acertar a mensalidade</button>
                    )}
                    {it.tipo === "depois" && !it.pago && (
                      <button type="button" className="g-btn verde p" disabled={ocupado} onClick={() => void fazer(chave, async () => {
                        ok(await sb.rpc("creche_cobranca_cancelar", { p_id: c.id }));
                      }, `Cobrança de ${mesDe(c)} de ${nome} cancelada. Saiu de A receber.`)}>Cancelar a cobrança de {mesDe(c)}</button>
                    )}
                    {it.pago && it.aMais > 0 && (
                      <button type="button" className="g-btn verde p" disabled={ocupado} onClick={() => void fazer(chave, () => anotar(c, `Saída em ${dataCurta(fim)}: ${brl(it.aMais)} pagos a mais, para devolver ou abater`),
                        `Anotado na cobrança de ${mesDe(c)}: ${brl(it.aMais)} para devolver ou abater.`)}>Anotar {brl(it.aMais)} para devolver</button>
                    )}
                    <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={() => deixar(chave, it.pago
                      ? `Fica como está: a cobrança de ${mesDe(c)} continua paga, sem anotação.`
                      : `Fica como está: a cobrança de ${mesDe(c)} continua em ${brl(c.total)}.`)}>Deixar como está</button>
                  </div>
                )}
              </div>
            );
          })}
          {sobras && (
            <div className={`g-ht-atraso${feitas.sobras ? " ok" : ""}`}>
              <p><b>{textoDasSobras(sobras)} sem cobrança: {brl(sobras.total)}.</b> {nome} não tem cobrança do mês seguinte para levar {sobras.extras.length + sobras.taxas.length === 1 ? "esse valor" : "esses valores"}.</p>
              <p className="g-p">{sobrasNoMes ? `Entra na cobrança de ${nomeMes(deIsoDia(mesFim))}, que ainda não foi paga.` : `Vira uma cobrança à parte (acerto da saída), em Cobranças e em A receber, vencendo hoje.`}</p>
              {feitas.sobras ? <p className="g-pp"><Check size={14} aria-hidden /> {feitas.sobras.texto}</p> : (
                <div className="g-fila">
                  <button type="button" className="g-btn verde p" disabled={ocupado} onClick={() => void fazer("sobras", async () => { ok(await sb.rpc("creche_saida_extras", { p_plano: plano.id })); },
                    sobrasNoMes ? `${textoDasSobras(sobras)} de ${nome} entrou na cobrança de ${nomeMes(deIsoDia(mesFim))}.` : `Acerto da saída de ${nome} criado: ${brl(sobras.total)} em A receber.`)}>
                    {sobrasNoMes ? `Cobrar na mensalidade de ${nomeMes(deIsoDia(mesFim))}` : `Cobrar ${brl(sobras.total)} à parte`}
                  </button>
                  <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={() => deixar("sobras", "Fica sem cobrar por enquanto. O aviso continua em Cobranças até você decidir.")}>Deixar como está</button>
                </div>
              )}
            </div>
          )}
          {!itens.length && !sobras && <p className="g-p">Tudo certo: nada mais para acertar.</p>}
        </div>
      )}
    </Folha>
  );
}
