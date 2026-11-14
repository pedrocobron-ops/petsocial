"use client";

import Link from "next/link";
import { CalendarCheck2, CalendarDays, HandCoins, Sun, TriangleAlert, UserX } from "lucide-react";
import {
  abreNoDia, DIAS_SEMANA, estadoDaCobranca, faltaDaCobranca, lerPlanos, lerPresencas, partesDosExtras, SELECT_COBRANCA, type CobrancaCompleta,
} from "@/lib/gestao/creche";
import { diaFechado } from "@/lib/gestao/feriados";
import { usaModulo } from "@/lib/gestao/modulos";
import { comValoresDeEstadia } from "@/lib/gestao/reservado";
import { brl, dataCurta, deIsoDia, isoDia, nomeMes, somaDias } from "@/lib/gestao/util";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import { Barras, Kpi, Tile } from "../painel";
import { AvatarPet, useDados } from "../ui";
import "./creche.css";

/**
 * A creche nos relatórios: presenças, faltas e dias extras do período (da chamada), quantos cães vieram por dia da semana,
 * de onde veio o que foi cobrado (mensalidades, dias extras, taxas de busca fora do horário e diárias avulsas) e como estão
 * as mensalidades dos meses do período (recebido, a vencer, atrasado), com quem está devendo.
 * Só número que está no banco: nada é estimado. Só aparece para quem usa creche.
 */
const real = (n: number) => Math.round(n * 100) / 100;
const um = (n: number, s: string, p: string) => (n === 1 ? `1 ${s}` : `${n.toLocaleString("pt-BR")} ${p}`);

export default function CrecheNoRelatorio({ de, ate }: { de: Date; ate: Date }) {
  const { sb, petshop } = useGestao();
  const { calendario } = useCalendario();
  const temCreche = usaModulo(petshop, "creche");
  const deIso = isoDia(de), ateIso = isoDia(ate), hoje = isoDia(new Date());
  const mesDe = isoDia(new Date(de.getFullYear(), de.getMonth(), 1));

  const { dados } = useDados(async () => {
    if (!temCreche) return null;
    const [planos, mov, cobrancas, taxas] = await Promise.all([
      lerPlanos(sb, petshop.id, false),
      lerPresencas(sb, petshop.id, deIso, ateIso),
      sb.from("creche_cobrancas").select(SELECT_COBRANCA).eq("petshop_id", petshop.id).eq("status", "aberta").gte("mes", mesDe).lte("mes", ateIso).order("vencimento").order("id").limit(2000),
      // taxa de busca fora do horário recebida na hora (a que foi para a mensalidade já está dentro da cobrança)
      sb.from("creche_atrasos").select("valor, dia").eq("petshop_id", petshop.id).eq("estado", "recebida").gte("dia", deIso).lte("dia", ateIso).limit(2000),
    ]);
    // diárias avulsas (pet sem plano, ou check-in avulso): o valor cobrado no check-out
    const avulsas = mov.presencas.filter((e) => !e.mensalista && e.status === "encerrada");
    const comValor = avulsas.length ? await comValoresDeEstadia(sb, petshop.id, avulsas, true).catch(() => []) : [];
    return {
      planos, ...mov, cobrancas: (cobrancas.data ?? []) as unknown as CobrancaCompleta[],
      taxasNaHora: real((taxas.data ?? []).reduce((s, a) => s + Number(a.valor ?? 0), 0)),
      avulsasCobrado: real(comValor.reduce((s, e) => s + Number(e.valor_cobrado ?? 0), 0)),
    };
  }, [petshop.id, temCreche, deIso, ateIso, calendario ? 1 : 0]);

  if (!temCreche || !dados) return null;
  const vieram = dados.presencas.filter((e) => e.status !== "reservada");
  const doPlano = vieram.filter((e) => e.mensalista === "plano").length;
  const extras = vieram.filter((e) => e.mensalista === "extra").length;
  const reposicoes = vieram.filter((e) => e.mensalista === "reposicao").length;
  const avulsas = vieram.filter((e) => !e.mensalista).length;
  const faltas = dados.faltas.filter((f) => !diaFechado(f.dia));
  const comAviso = faltas.filter((f) => f.avisou).length;
  const esperados = doPlano + faltas.length;
  const presenca = esperados ? Math.round((doPlano / esperados) * 100) : null;
  const nada = !vieram.length && !faltas.length && !dados.cobrancas.length;
  if (nada && !dados.planos.length) return null;

  // cães por dia da semana: a média dos dias em que a creche abriu no período (até hoje)
  const diaDe = (e: (typeof vieram)[number]) => e.dia ?? isoDia(new Date(e.entrada));
  const porDia = DIAS_SEMANA.map((d) => {
    let abertos = 0;
    for (let x = new Date(de); isoDia(x) <= ateIso && isoDia(x) <= hoje; x = somaDias(x, 1)) {
      if (x.getDay() === d.id && abreNoDia(petshop.horario, isoDia(x)) && !diaFechado(isoDia(x))) abertos++;
    }
    const caes = vieram.filter((e) => deIsoDia(diaDe(e)).getDay() === d.id).length;
    return { ...d, abertos, caes, media: abertos ? Math.round((caes / abertos) * 10) / 10 : 0 };
  });
  const maisCheio = porDia.reduce((m, d, i) => (d.media > porDia[m].media ? i : m), 0);
  const vagas = petshop.vagas_creche;

  // o que foi cobrado nas mensalidades dos meses do período, por parte
  const abertas = dados.cobrancas;
  const mensalidades = real(abertas.reduce((s, c) => s + Number(c.valor_mensal) - Number(c.desconto), 0));
  const dosExtras = real(abertas.reduce((s, c) => s + partesDosExtras(c).dias, 0));
  const dasTaxas = real(abertas.reduce((s, c) => s + partesDosExtras(c).taxas, 0) + dados.taxasNaHora);
  const partes = [
    { nome: "Mensalidades", valor: mensalidades, apoio: um(abertas.length, "cobrança", "cobranças") },
    { nome: "Dias extras", valor: dosExtras, apoio: "na cobrança do mês seguinte" },
    { nome: "Taxa de busca fora do horário", valor: dasTaxas, apoio: "na mensalidade ou recebida na hora" },
    { nome: "Diárias avulsas", valor: dados.avulsasCobrado, apoio: `${um(avulsas, "dia", "dias")} de pet sem plano` },
  ];
  const totalCobrado = real(partes.reduce((s, x) => s + x.valor, 0));

  // mensalidades por mês: recebido, a vencer e atrasado
  const meses = [...new Set(abertas.map((c) => c.mes))].sort().map((mes) => {
    const doMes = abertas.filter((c) => c.mes === mes);
    const total = real(doMes.reduce((s, c) => s + Number(c.total), 0));
    const emAberto = doMes.filter((c) => estadoDaCobranca(c, hoje).estado !== "paga");
    const atrasadas = emAberto.filter((c) => estadoDaCobranca(c, hoje).estado === "atrasada");
    const falta = real(emAberto.reduce((s, c) => s + faltaDaCobranca(c), 0));
    const atrasado = real(atrasadas.reduce((s, c) => s + faltaDaCobranca(c), 0));
    return { mes, total, recebido: real(total - falta), aVencer: real(falta - atrasado), atrasado, nAtrasadas: atrasadas.length, n: doMes.length };
  });
  const devendo = abertas.filter((c) => estadoDaCobranca(c, hoje).estado === "atrasada")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return (
    <section className="g-card g-pilha" aria-label="Creche no período">
      <div className="g-card-t">
        <h3><Tile icone={Sun} tom="ceu" tamanho="p" />Creche</h3>
        <span className="g-muted g-pp">chamada, ocupação e mensalidades do período</span>
      </div>

      <div className="g-grade kpis">
        <Kpi icone={CalendarCheck2} tom="menta" rotulo="Presenças de mensalista" valor={doPlano}
          apoio={presenca == null ? "nenhum dia de plano no período" : `${presenca}% dos ${esperados} dias de plano com chamada`} />
        <Kpi icone={UserX} tom="rosa" rotulo="Faltas" valor={faltas.length} apoio={faltas.length ? `${comAviso} com aviso` : "nenhuma falta"} />
        <Kpi icone={CalendarDays} tom="manteiga" rotulo="Dias extras" valor={extras} apoio={reposicoes ? `e ${um(reposicoes, "reposição", "reposições")} sem cobrança` : "fora do dia do plano"} />
        <Kpi icone={Sun} tom="ceu" rotulo="Dias avulsos" valor={avulsas} apoio="pets sem plano" />
      </div>

      <div className="g-duas meio">
        <div>
          <p className="g-rotulo" style={{ marginBottom: 8 }}>Cães por dia da semana (média)</p>
          {vieram.length ? (
            <>
              <Barras itens={porDia.map((d) => ({ rotulo: d.curto, valor: d.media }))} destaque={maisCheio} altura={132} formato={(n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} />
              <p className="g-muted g-pp" style={{ marginTop: 10 }}>
                Média de cães por dia em que a creche abriu, contando mensalistas e avulsos.{vagas != null ? ` A creche tem ${vagas} vagas.` : ""}
                {porDia[maisCheio].media > 0 ? ` O dia mais cheio é ${porDia[maisCheio].nome}.` : ""}
              </p>
            </>
          ) : <p className="g-muted g-p">Nenhum cão passou pela creche neste período.</p>}
        </div>

        <div>
          <p className="g-rotulo" style={{ marginBottom: 8 }}>De onde vem o que foi cobrado</p>
          {totalCobrado > 0 ? (
            <div className="g-lista">
              {partes.filter((x) => x.valor > 0).map((x) => (
                <div key={x.nome} className="g-linha">
                  <span className="t"><b>{x.nome}</b><span>{x.apoio}</span></span>
                  <span className="d g-tab">{brl(x.valor)}{totalCobrado > 0 ? ` · ${Math.round((x.valor / totalCobrado) * 100)}%` : ""}</span>
                </div>
              ))}
              <div className="g-linha"><span className="t"><b>Total cobrado</b></span><b className="d g-tab">{brl(totalCobrado)}</b></div>
            </div>
          ) : <p className="g-muted g-p">Nenhuma cobrança da creche neste período.</p>}
          <p className="g-muted g-pp" style={{ marginTop: 10 }}>Mensalidades e extras: as cobranças dos meses do período (cobrado, não só o que já entrou). Diárias avulsas: os check-outs do período.</p>
        </div>
      </div>

      {meses.length > 0 && (
        <div>
          <p className="g-rotulo" style={{ marginBottom: 8 }}>Mensalidades: recebido, a vencer e atrasado</p>
          <div className="g-lista">
            {meses.map((m) => (
              <div key={m.mes} className="g-linha">
                <Tile icone={HandCoins} tom="menta" tamanho="p" />
                <span className="t">
                  <b style={{ textTransform: "capitalize" }}>{nomeMes(deIsoDia(m.mes))} · {brl(m.total)} cobrados</b>
                  <span>{[`recebido ${brl(m.recebido)}`, m.aVencer > 0 ? `a vencer ${brl(m.aVencer)}` : null, m.atrasado > 0 ? `atrasado ${brl(m.atrasado)} (${um(m.nAtrasadas, "mensalidade", "mensalidades")})` : null].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="d g-tab">{m.total > 0 ? `${Math.round((m.recebido / m.total) * 100)}% recebido` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {devendo.length > 0 && (
        <div>
          <p className="g-rotulo" style={{ marginBottom: 8 }}><TriangleAlert size={14} aria-hidden style={{ verticalAlign: "-2px" }} /> Quem está devendo</p>
          <div className="g-lista">
            {devendo.slice(0, 8).map((c) => (
              <div key={c.id} className="g-linha">
                <AvatarPet pet={c.pets ?? { nome: "?" }} tamanho="p" />
                <span className="t"><b>{c.pets?.nome ?? "Pet"}</b><span>{[c.pets?.clientes?.nome, `${nomeMes(deIsoDia(c.mes))}, venceu em ${dataCurta(c.vencimento)}`, `${um(estadoDaCobranca(c, hoje).atraso, "dia", "dias")} de atraso`].filter(Boolean).join(" · ")}</span></span>
                <span className="d g-tab">{brl(faltaDaCobranca(c))}</span>
              </div>
            ))}
          </div>
          <p className="g-pp" style={{ marginTop: 10 }}>{devendo.length > 8 ? `E mais ${devendo.length - 8}. ` : ""}<Link href="/gestao/app/creche-hotel?ver=cobrancas">Abrir as cobranças para cobrar pelo WhatsApp</Link></p>
        </div>
      )}
    </section>
  );
}
