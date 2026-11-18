"use client";

import { useState } from "react";
import Link from "@/components/gestao/link-depois";
import { CalendarCheck2, Pencil, Plus, Printer } from "lucide-react";
import { DIAS_SEMANA, diasEmOrdem, extratoDoPetLigado, fraseDoSaldo, linkDoExtratoDoPet, lerPlanos, lerSaldoDeReposicao, lerPresencas, planoAtivo, podeMudarPlano, resumoDoMes, textoDasDatas, type Falta, type PetDoPlano, type PlanoCompleto, type Presenca } from "@/lib/gestao/creche";
import { calendarioGuardado, lerCalendario } from "@/lib/gestao/feriados";
import { usaModulo } from "@/lib/gestao/modulos";
import { brl, dataCompleta, dataCurta, isoDia, nomeMes } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useDados, useSomenteLeitura } from "../ui";
import FormPlano from "./form-plano";
import "./creche.css";

/** Os dias da semana do plano em bolinhas pequenas: os que o pet vem ficam acesos. */
export function DiasDoPlano({ dias }: { dias: number[] }) {
  return (
    <span className="g-cm-semana" role="img" aria-label={`Vem ${diasEmOrdem(dias).map((d) => DIAS_SEMANA.find((x) => x.id === d)?.nome).join(", ")}`}>
      {DIAS_SEMANA.map((d) => <i key={d.id} className={dias.includes(d.id) ? "on" : undefined}>{d.curto}</i>)}
    </span>
  );
}

const anterior = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 1, 1);

/** Presenças, faltas e dias extras de um mensalista neste mês e no mês passado. */
export function ResumoDosMeses({ plano, presencas, faltas }: { plano: PlanoCompleto; presencas: Presenca[]; faltas: Falta[] }) {
  const { sb, petshop } = useGestao();
  const agora = new Date(), hoje = isoDia(agora);
  // saldo de reposição (só datas): quantas faltas ainda podem ser repostas, e qual falta cada reposição repôs
  const { dados: saldo } = useDados(async () => lerSaldoDeReposicao(sb, plano.id), [plano.id, presencas.length, faltas.length]);
  const repoe = new Map((saldo?.pares ?? []).map((p) => [p.reposicao, p.falta]));
  const semFalta = new Set(saldo?.sem_falta ?? []);
  const textoDaReposicao = (d: string) => `${dataCurta(d)}${repoe.has(d) ? ` (repôs ${dataCurta(repoe.get(d)!)})` : semFalta.has(d) ? " (liberada sem falta)" : ""}`;
  return (
    <>
    <div className="g-cm-meses">
      {/* o mês passado só aparece quando o plano já valia nele */}
      {[agora, anterior(agora)].filter((mes, i) => i === 0 || plano.inicio < isoDia(new Date(agora.getFullYear(), agora.getMonth(), 1))).map((mes, i) => {
        const r = resumoDoMes(plano, mes, presencas, faltas, petshop.horario, hoje);
        const nada = !r.esperados && !r.vieram && !r.extras.length && !r.reposicoes.length && !r.faltas.length && !r.vaiFaltar.length;
        return (
          <div key={i} className="g-cm-mes">
            <p className="g-rotulo">{nomeMes(mes)}{i === 0 ? " (até hoje)" : ""}</p>
            {nada ? <p className="g-muted g-p">Sem dias do plano neste mês.</p> : (
              <>
                <div className="g-cm-numeros">
                  <span><b className="g-num">{r.vieram}</b><small>{r.vieram === 1 ? "presença" : "presenças"}{r.esperados ? ` de ${r.esperados}` : ""}</small></span>
                  <span><b className="g-num">{r.faltas.length}</b><small>{r.faltas.length === 1 ? "falta" : "faltas"}</small></span>
                  <span><b className="g-num">{r.extras.length}</b><small>{r.extras.length === 1 ? "dia extra" : "dias extras"}</small></span>
                </div>
                <ul className="g-cm-detalhes">
                  {r.extras.length > 0 && <li><b>Extras:</b> {textoDasDatas(r.extras)}</li>}
                  {r.faltas.length > 0 && <li><b>Faltas:</b> {r.faltas.map((f) => `${textoDasDatas([f.dia])}${f.avisou ? " (avisou)" : ""}`).join(", ")}</li>}
                  {r.vaiFaltar.length > 0 && <li><b>Vai faltar (avisou):</b> {textoDasDatas(r.vaiFaltar)}</li>}
                  {r.reposicoes.length > 0 && <li><b>Reposições:</b> {saldo ? r.reposicoes.map(textoDaReposicao).join(", ") : textoDasDatas(r.reposicoes)}</li>}
                  {r.semChamada.length > 0 && <li className="g-muted"><b>Sem chamada:</b> {textoDasDatas(r.semChamada)}</li>}
                </ul>
              </>
            )}
          </div>
        );
      })}
    </div>
    {saldo && (saldo.livres.length > 0 || saldo.pares.length > 0 || saldo.sem_falta.length > 0 || saldo.vencidas.length > 0) && (
      <p className="g-muted g-p g-cm-saldo" role="status">{fraseDoSaldo(plano.pets?.nome ?? "O pet", saldo)}</p>
    )}
    </>
  );
}

/** Cartão da ficha do pet: o plano de mensalista (ou o atalho para criar) e o resumo deste mês e do mês passado. */
export function CartaoMensalista({ pet }: { pet: PetDoPlano }) {
  const { sb, petshop, cuidoDoFinanceiro: vejoFinanceiro, posso, souDono } = useGestao();
  const somenteLeitura = useSomenteLeitura();
  const [form, setForm] = useState<"novo" | "editar" | null>(null);
  const hoje = isoDia(new Date());
  const usa = usaModulo(petshop, "creche");
  const { dados, recarregar } = useDados(async () => {
    if (!usa) return null;
    // dia marcado como fechado (feriado, folga) não é dia do plano: a conta da ficha é a mesma da tela Mensalistas
    const [planos] = await Promise.all([
      lerPlanos(sb, petshop.id, vejoFinanceiro),
      calendarioGuardado(petshop.id, false) ? null : lerCalendario(sb, petshop.id, false).catch(() => null),
    ]);
    const meu = planos.filter((p) => p.pet_id === pet.id).sort((a, b) => b.inicio.localeCompare(a.inicio));
    const plano = meu.find((p) => planoAtivo(p, hoje)) ?? meu[0] ?? null;
    if (!plano) return { planos, plano, presencas: [] as Presenca[], faltas: [] as Falta[] };
    const agora = new Date();
    const r = await lerPresencas(sb, petshop.id, isoDia(anterior(agora)), isoDia(new Date(agora.getFullYear(), agora.getMonth() + 1, 0)));
    return { planos, plano, presencas: r.presencas.filter((e) => e.pet_id === pet.id), faltas: r.faltas.filter((f) => f.pet_id === pet.id) };
  }, [petshop.id, pet.id, usa, vejoFinanceiro]);
  if (!usa || !dados) return null;
  const { plano } = dados;
  // mexer no plano: o dono e quem cuida do financeiro (a equipe, se o dono liberou em Meu pet shop)
  const ve = posso("creche_hotel");
  const pode = ve && podeMudarPlano({ petshop, souDono, cuidoDoFinanceiro: vejoFinanceiro });
  const ativo = Boolean(plano && planoAtivo(plano, hoje));
  // extrato do mês por cachorro (opção da creche): para quem trabalha na creche, com ou sem plano
  const extrato = ve && extratoDoPetLigado(petshop);
  if (!plano && !pode && !extrato) return null;
  return (
    <section className="g-card">
      <div className="g-card-t">
        <h3><Tile icone={CalendarCheck2} tom="manteiga" tamanho="p" />Creche: mensalista</h3>
        {pode && (ativo
          ? <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setForm("editar"); }}><Pencil />Alterar plano</button>
          : <button className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setForm("novo"); }}><Plus />Tornar mensalista</button>)}
      </div>
      {!plano ? <p className="g-muted g-p">{pet.nome} não tem plano mensal na creche.</p> : (
        <div className="g-pilha p">
          <div className="g-fila" style={{ gap: 10 }}>
            <DiasDoPlano dias={plano.dias} />
            {ativo ? <span className="g-tag">vence dia {plano.vence_dia}</span> : <span className="g-tag vermelho">plano encerrado em {dataCompleta(plano.fim!)}</span>}
            {plano.inicio > hoje && <span className="g-tag azul">começa em {dataCompleta(plano.inicio)}</span>}
            {vejoFinanceiro && plano.valor_mensal != null && <span className="g-tag verde g-tab">{brl(plano.valor_mensal)} por mês</span>}
          </div>
          {plano.obs && <p className="g-muted g-p">{plano.obs}</p>}
          <ResumoDosMeses plano={plano} presencas={dados.presencas} faltas={dados.faltas} />
        </div>
      )}
      {extrato && <div style={{ marginTop: 12 }}><Link className="g-btn sec p" href={linkDoExtratoDoPet(pet.id, undefined, plano?.id)} aria-label={`Extrato do mês de ${pet.nome} na creche`}><Printer />Extrato do mês</Link></div>}
      {form && <FormPlano plano={form === "editar" && plano ? plano : undefined} pet={pet} planos={dados.planos}
        aoFechar={() => setForm(null)} aoSalvo={() => { setForm(null); void recarregar(); }} />}
    </section>
  );
}
