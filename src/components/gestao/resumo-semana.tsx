"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarRange, Check, ChevronRight, Copy, Lightbulb } from "lucide-react";
import type { Banco } from "@/lib/gestao/supabase";
import { brl, dataCurta, inicioDaSemana, inicioDoDia, isoDia, somaDias } from "@/lib/gestao/util";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { buscarVisitas, diasSemVir, sumiu } from "@/lib/gestao/visitas";
import { buscarTudo } from "./clientes/comum";
import { useGestao } from "./contexto";
import { Tile } from "./painel";
import { Esqueleto, Folha, useAvisos, useDados } from "./ui";
import { abrirLinkDeAgendamento } from "./lembrado";

/** Sumido é quem já veio, está há mais de 30 dias sem vir e não tem nada marcado: a mesma regra da lista de Clientes e do Chamar de volta. */
const DIAS_SUMIDO = 30;

type Semana = { entrou: number; concluidos: number; faltas: number; petsNovos: number };
export type Resumo = {
  de: Date; ate: Date;
  semana: Semana;
  /** A semana anterior, para comparar; `null` quando a conta ainda não existia. */
  antes: Semana | null;
  aReceber: number; contasAReceber: number;
  sumidos: string[];
};

/** A semana passada (segunda a domingo) em números, com a anterior ao lado. Só leitura. */
export async function buscarResumo(sb: Banco, petshop: { id: string; criado_em: string }, hoje = new Date()): Promise<Resumo> {
  const seg = inicioDaSemana(inicioDoDia(hoje));
  const de = somaDias(seg, -7), antesDe = somaDias(seg, -14);
  const [lancs, ags, pets, abertas, ativos] = await Promise.all([
    lerTudo<{ valor: number; data: string }>((a, b, contar) => sb.from("lancamentos").select("valor, data", contando(contar)).eq("petshop_id", petshop.id).eq("tipo", "entrada").eq("pago", true).is("movimento", null)
      .gte("data", isoDia(antesDe)).lt("data", isoDia(seg)).order("data").order("id").range(a, b)).then((data) => ({ data })),
    lerTudo<{ status: string; inicio: string }>((a, b, contar) => sb.from("agendamentos").select("status, inicio", contando(contar)).eq("petshop_id", petshop.id).in("status", ["concluido", "faltou"])
      .gte("inicio", antesDe.toISOString()).lt("inicio", seg.toISOString()).order("inicio").order("id").range(a, b)).then((data) => ({ data })),
    lerTudo<{ criado_em: string }>((a, b, contar) => sb.from("pets").select("criado_em", contando(contar)).eq("petshop_id", petshop.id).gte("criado_em", antesDe.toISOString()).lt("criado_em", seg.toISOString()).order("criado_em").order("id").range(a, b)).then((data) => ({ data })),
    lerTudo<{ valor: number }>((a, b, contar) => sb.from("lancamentos").select("valor", contando(contar)).eq("petshop_id", petshop.id).eq("tipo", "entrada").eq("pago", false).is("movimento", null).order("id").range(a, b)).then((data) => ({ data })),
    buscarTudo<{ id: string; nome: string }>((a, b) => sb.from("pets").select("id, nome").eq("petshop_id", petshop.id).eq("ativo", true).order("nome").order("id").range(a, b)),
  ]);

  const conta = (ini: Date): Semana => {
    const fim = somaDias(ini, 7), a = isoDia(ini), b = isoDia(fim);
    const dentro = (iso: string) => { const t = new Date(iso).getTime(); return t >= ini.getTime() && t < fim.getTime(); };
    const doPeriodo = (ags.data ?? []).filter((x) => dentro(x.inicio));
    return {
      entrou: Math.round((lancs.data ?? []).filter((l) => l.data >= a && l.data < b).reduce((s, l) => s + Number(l.valor), 0) * 100) / 100,
      concluidos: doPeriodo.filter((x) => x.status === "concluido").length,
      faltas: doPeriodo.filter((x) => x.status === "faltou").length,
      petsNovos: (pets.data ?? []).filter((p) => dentro(p.criado_em)).length,
    };
  };

  // sumidos: a mesma conta de Clientes e do Chamar de volta; quem saiu há menos tempo vem primeiro
  const visitas = ativos.length ? await buscarVisitas(sb, petshop.id, hoje) : new Map();
  const sumidos = ativos.filter((p) => sumiu(visitas.get(p.id), DIAS_SUMIDO, hoje))
    .sort((x, y) => diasSemVir(visitas.get(x.id)!.ultima!, hoje) - diasSemVir(visitas.get(y.id)!.ultima!, hoje)).map((p) => p.nome);

  return {
    de, ate: somaDias(seg, -1),
    semana: conta(de),
    antes: new Date(petshop.criado_em).getTime() < de.getTime() ? conta(antesDe) : null,
    aReceber: Math.round((abertas.data ?? []).reduce((s, l) => s + Number(l.valor), 0) * 100) / 100,
    contasAReceber: (abertas.data ?? []).length,
    sumidos,
  };
}

/** "R$ 200,00 a mais", "igual", "2 a menos": a diferença para a semana anterior, sem enfeite. */
export function comparar(agora: number, antes: number | undefined, fmt: (n: number) => string = String) {
  if (antes === undefined) return null;
  const d = Math.round((agora - antes) * 100) / 100;
  return d === 0 ? "igual à semana anterior" : `${fmt(Math.abs(d))} a ${d > 0 ? "mais" : "menos"} que na semana anterior`;
}
const lista = (nomes: string[]) => nomes.length > 3 ? `${nomes.slice(0, 3).join(", ")} e mais ${nomes.length - 3}`
  : nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0] ?? "";
const semMovimento = (r: Resumo) => r.semana.entrou === 0 && r.semana.concluidos === 0 && r.semana.faltas === 0 && r.semana.petsNovos === 0;

/** Texto simples para colar no WhatsApp do sócio. */
export function textoDoResumo(r: Resumo, nome: string) {
  const c = (t: string | null) => (t ? ` (${t})` : "");
  const linhas = [`Resumo da semana no ${nome} (${dataCurta(r.de)} a ${dataCurta(r.ate)})`];
  if (semMovimento(r)) linhas.push("Nenhum movimento lançado na semana.");
  else linhas.push(
    `Entrou: ${brl(r.semana.entrou)}${c(comparar(r.semana.entrou, r.antes?.entrou, brl))}`,
    `Atendimentos concluídos: ${r.semana.concluidos}${c(comparar(r.semana.concluidos, r.antes?.concluidos))}`,
    `Faltas: ${r.semana.faltas}${c(comparar(r.semana.faltas, r.antes?.faltas))}`,
    `Pets novos: ${r.semana.petsNovos}${c(comparar(r.semana.petsNovos, r.antes?.petsNovos))}`,
  );
  if (!semMovimento(r) || r.aReceber > 0) linhas.push(`A receber em aberto: ${brl(r.aReceber)}`);
  if (!semMovimento(r) || r.sumidos.length) linhas.push(`Pets há mais de ${DIAS_SUMIDO} dias sem vir e sem nada marcado: ${r.sumidos.length}`);
  return linhas.join("\n");
}

type Dica = { texto: string; botao: string; href?: string; aoTocar?: () => void };

function Conteudo({ aoIr }: { aoIr?: () => void }) {
  const { sb, petshop, posso } = useGestao();
  const { avisar } = useAvisos();
  const [copiado, setCopiado] = useState(false);
  const hojeIso = isoDia(new Date());
  const { dados: r, erro } = useDados(() => buscarResumo(sb, petshop), [petshop.id, hojeIso]);

  if (erro) return <p className="g-muted g-p">Não consegui montar o resumo agora. Tente de novo em instantes.</p>;
  if (!r) return <Esqueleto linhas={3} />;

  const vazia = semMovimento(r);
  const s = r.semana, a = r.antes;
  const total = s.concluidos + s.faltas;
  const dicaLink: Dica | null = posso("agenda") ? { texto: "Mande o link de agendamento: o cliente escolhe um horário livre pelo celular e você só aceita.", botao: "Abrir o link de agendamento", aoTocar: abrirLinkDeAgendamento } : null;
  // uma sugestão só, ligada ao número que mais pede atenção
  const dica: Dica | null =
    vazia ? dicaLink
      : posso("agenda") && (s.faltas >= 2 || (s.faltas >= 1 && s.faltas / total >= 0.2))
        ? { texto: `${s.faltas === 1 ? "Teve 1 falta" : `Foram ${s.faltas} faltas`} na semana. Um lembrete na véspera ajuda o cliente a não esquecer do horário.`, botao: "Ver os lembretes de amanhã", href: `/gestao/app/agenda?dia=${isoDia(somaDias(inicioDoDia(new Date()), 1))}` }
        : r.aReceber > 0 && posso("financeiro")
          ? { texto: `${r.contasAReceber === 1 ? "Tem 1 conta de cliente" : `Tem ${r.contasAReceber} contas de clientes`} em aberto, somando ${brl(r.aReceber)}. Vale conferir quem ficou de pagar.`, botao: "Ver o que há a receber", href: "/gestao/app/financeiro?aba=receber" }
          : r.sumidos.length > 0 && posso("clientes")
            ? { texto: `${lista(r.sumidos)} ${r.sumidos.length === 1 ? "está" : "estão"} há mais de ${DIAS_SUMIDO} dias sem vir. Que tal mandar um oi?`, botao: "Ver quem sumiu", href: "/gestao/app/clientes?filtro=sumidos30" }
            : dicaLink;

  const celulas = [
    !vazia && { rotulo: "Entrou", valor: brl(s.entrou), apoio: comparar(s.entrou, a?.entrou, brl) },
    !vazia && { rotulo: "Atendimentos concluídos", valor: String(s.concluidos), apoio: comparar(s.concluidos, a?.concluidos) },
    !vazia && { rotulo: "Faltas", valor: String(s.faltas), apoio: comparar(s.faltas, a?.faltas) },
    !vazia && { rotulo: "Pets novos", valor: String(s.petsNovos), apoio: comparar(s.petsNovos, a?.petsNovos) },
    (!vazia || r.aReceber > 0) && { rotulo: "A receber", valor: brl(r.aReceber), apoio: r.aReceber > 0 ? "em aberto hoje" : "ninguém devendo" },
    (!vazia || r.sumidos.length > 0) && { rotulo: "Sumidos", valor: String(r.sumidos.length), apoio: `há mais de ${DIAS_SUMIDO} dias sem vir e sem nada marcado` },
  ].filter(Boolean) as { rotulo: string; valor: string; apoio: string | null }[];

  async function copiar() {
    try { await navigator.clipboard.writeText(textoDoResumo(r!, petshop.nome)); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { avisar("Não consegui copiar o resumo neste aparelho."); }
  }

  return (
    <div className="g-pilha">
      <p className="g-muted g-p">De segunda, {dataCurta(r.de)}, a domingo, {dataCurta(r.ate)}.{!vazia && !a ? " Foi a sua primeira semana por aqui: a comparação começa na próxima." : ""}</p>
      {vazia && <p className="g-p">A semana passada ficou sem movimento lançado aqui, e tudo bem. Conforme você marca os horários e recebe pelo sistema, este resumo se monta sozinho toda segunda.</p>}
      {celulas.length > 0 && (
        <dl className="g-rs-grade">
          {celulas.map((c) => (
            <div key={c.rotulo}>
              <dt className="g-rotulo">{c.rotulo}</dt>
              <dd className="g-num m">{c.valor}</dd>
              {c.apoio && <dd className="g-muted g-pp">{c.apoio}</dd>}
            </div>
          ))}
        </dl>
      )}
      {dica && (
        <div className="g-rs-dica">
          <Tile icone={Lightbulb} tom="manteiga" />
          <p className="g-p">{dica.texto}</p>
          {dica.href
            ? <Link className="g-btn verde" href={dica.href} onClick={aoIr}>{dica.botao}<ChevronRight aria-hidden /></Link>
            : <button type="button" className="g-btn verde" onClick={() => { aoIr?.(); dica.aoTocar?.(); }}>{dica.botao}<ChevronRight aria-hidden /></button>}
        </div>
      )}
      {!vazia && <div><button type="button" className="g-btn sec" onClick={() => void copiar()}>{copiado ? <Check /> : <Copy />}{copiado ? "Copiado" : "Copiar resumo"}</button></div>}
    </div>
  );
}

/** A conta já existia na semana passada? Sem isso não há o que resumir. */
export const temSemanaPassada = (criadoEm: string, hoje = new Date()) => new Date(criadoEm).getTime() < inicioDaSemana(inicioDoDia(hoje)).getTime();

/** `cartao`: na segunda-feira, em destaque. `linha`: nos outros dias (ou com outro cartão em destaque), um atalho discreto. */
export default function ResumoSemana({ modo }: { modo: "cartao" | "linha" }) {
  const [aberto, setAberto] = useState(false);
  if (modo === "linha") {
    return (
      <>
        <button type="button" className="g-ret-linha" onClick={() => setAberto(true)}>
          <CalendarRange aria-hidden /><span>Ver o resumo da semana passada</span><ChevronRight aria-hidden />
        </button>
        {aberto && <Folha titulo="Sua semana" aoFechar={() => setAberto(false)}><Conteudo aoIr={() => setAberto(false)} /></Folha>}
      </>
    );
  }
  return (
    <section className="g-card g-rs" aria-label="Sua semana">
      <div className="g-ret-cab">
        <Tile icone={CalendarRange} tom="ceu" tamanho="g" />
        <div><p className="g-rotulo">Resumo da semana passada</p><h2>Sua semana</h2></div>
      </div>
      <Conteudo />
    </section>
  );
}
