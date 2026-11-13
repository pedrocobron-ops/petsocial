"use client";

import { BedDouble } from "lucide-react";
import { contarDiarias, diasDasNoites, lerConta, type ValoresDaEstadia } from "@/lib/gestao/hotel";
import { usaModulo } from "@/lib/gestao/modulos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import type { Estadia } from "@/lib/gestao/tipos";
import { brl, dataCurta, isoDia, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useDados } from "../ui";

/**
 * Hotel nos relatórios: taxa de ocupação do período (noites vendidas ÷ noites disponíveis), de onde veio o valor das contas
 * (diárias, taxas, extras e produtos), sinais recebidos e devolvidos, e as noites já reservadas daqui para a frente.
 * Os valores vêm da conta guardada no check-out (`estadias_valores.conta`): nada é recalculado.
 */
type E = Pick<Estadia, "id" | "tipo" | "status" | "entrada" | "saida" | "saida_prevista" | "diarias_cobradas">;
const real = (n: number) => Math.round(n * 100) / 100;

/** As noites de uma estadia de hotel: as que aconteceram (encerrada), as que já passaram e as reservadas (aberta). */
function noitesDe(e: E, hoje: string): string[] {
  if (e.status === "encerrada") return diasDasNoites(e.entrada, e.diarias_cobradas ?? contarDiarias(e, new Date(e.saida ?? e.entrada)));
  const ini = isoDia(new Date(e.entrada));
  const fim = e.saida_prevista ? isoDia(new Date(e.saida_prevista)) : null;
  // na casa: até a saída prevista (ou, sem ela, até ontem: a noite de hoje ainda não aconteceu); reserva sem saída vale uma noite
  const n = e.status === "em_casa"
    ? Math.max(1, Math.round((new Date(`${fim && fim > hoje ? fim : hoje}T12:00:00`).getTime() - new Date(`${ini}T12:00:00`).getTime()) / 864e5))
    : fim ? Math.max(1, Math.round((new Date(`${fim}T12:00:00`).getTime() - new Date(`${ini}T12:00:00`).getTime()) / 864e5)) : 1;
  return diasDasNoites(e.entrada, n);
}

export default function HotelNoRelatorio({ de, ate, antes }: { de: Date; ate: Date; antes: { de: Date; ate: Date } }) {
  const { sb, petshop } = useGestao();
  const temHotel = usaModulo(petshop, "hotel");
  const deIso = isoDia(de), ateIso = isoDia(ate), antesDe = isoDia(antes.de), antesAte = isoDia(antes.ate);
  const hoje = isoDia(new Date());

  const { dados } = useDados(async () => {
    if (!temHotel) return null;
    const desde = (antesDe < deIso ? antes.de : de).toISOString();
    const [abertas, encerradas, contas, sinais] = await Promise.all([
      lerTudo<E>((a, b, contar) => sb.from("estadias").select("id, tipo, status, entrada, saida, saida_prevista, diarias_cobradas", contando(contar)).eq("petshop_id", petshop.id).eq("tipo", "hotel")
        .in("status", ["reservada", "em_casa"]).order("entrada").order("id").range(a, b)),
      lerTudo<E>((a, b, contar) => sb.from("estadias").select("id, tipo, status, entrada, saida, saida_prevista, diarias_cobradas", contando(contar)).eq("petshop_id", petshop.id).eq("tipo", "hotel")
        .eq("status", "encerrada").gte("saida", desde).order("entrada").order("id").range(a, b)),
      // contas fechadas (hotel e creche) dos dois períodos, pela data da saída guardada na conta
      lerTudo<Pick<ValoresDaEstadia, "estadia_id" | "conta">>((a, b, contar) => sb.from("estadias_valores").select("estadia_id, conta", contando(contar)).eq("petshop_id", petshop.id)
        .not("conta", "is", null).gte("conta->>quando", desde).lt("conta->>quando", somaDias(ate, 1).toISOString()).order("estadia_id").range(a, b)),
      lerTudo<Pick<ValoresDaEstadia, "estadia_id" | "sinal" | "sinal_estado" | "sinal_pago_em" | "sinal_devolvido_em" | "sinal_devolucao_id">>((a, b, contar) =>
        sb.from("estadias_valores").select("estadia_id, sinal, sinal_estado, sinal_pago_em, sinal_devolvido_em, sinal_devolucao_id", contando(contar)).eq("petshop_id", petshop.id)
          .not("sinal", "is", null).order("estadia_id").range(a, b)),
    ]);
    const devolucoes = sinais.filter((s) => s.sinal_devolucao_id && s.sinal_devolvido_em && s.sinal_devolvido_em >= deIso && s.sinal_devolvido_em <= ateIso).map((s) => s.sinal_devolucao_id!);
    const dev = devolucoes.length ? (await sb.from("lancamentos").select("id, valor").eq("petshop_id", petshop.id).in("id", devolucoes)).data ?? [] : [];
    return { estadias: [...abertas, ...encerradas], contas, sinais, devolvido: real(dev.reduce((t, l) => t + Number(l.valor), 0)), devolucoes: dev.length };
  }, [petshop.id, temHotel, deIso, ateIso, antesDe, antesAte]);

  if (!temHotel || !dados) return null;
  const vagas = petshop.vagas_hotel;
  const noites = dados.estadias.flatMap((e) => noitesDe(e, hoje));
  const noPeriodo = (a: string, b: string) => noites.filter((d) => d >= a && d <= b).length;
  const dias = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 864e5) + 1;
  const vendidas = noPeriodo(deIso, ateIso), vendidasAntes = noPeriodo(antesDe, antesAte);
  const disponiveis = vagas ? vagas * dias(de, ate) : null, disponiveisAntes = vagas ? vagas * dias(antes.de, antes.ate) : null;
  const taxa = disponiveis ? Math.round((vendidas / disponiveis) * 100) : null;
  const taxaAntes = disponiveisAntes ? Math.round((vendidasAntes / disponiveisAntes) * 100) : null;
  const futuras = noites.filter((d) => d >= hoje);
  const ultima = futuras.length ? futuras.reduce((m, d) => (d > m ? d : m)) : null;

  const somar = (a: string, b: string) => {
    const x = { n: 0, diarias: 0, taxas: 0, extras: 0, produtos: 0, total: 0 };
    for (const v of dados.contas) {
      const c = lerConta(v);
      if (!c || isoDia(new Date(c.quando)) < a || isoDia(new Date(c.quando)) > b) continue;
      const taxas = c.taxas.reduce((t, k) => t + k.total, 0), extras = c.extras.reduce((t, k) => t + k.valor, 0), produtos = c.produtos.reduce((t, k) => t + k.total, 0);
      x.n++; x.taxas = real(x.taxas + taxas); x.extras = real(x.extras + extras); x.produtos = real(x.produtos + produtos);
      // o que a pessoa mudou na mão (desconto ou acréscimo) fica nas diárias, para as partes somarem o total
      x.diarias = real(x.diarias + c.total - taxas - extras - produtos); x.total = real(x.total + c.total);
    }
    return x;
  };
  const contas = somar(deIso, ateIso), contasAntes = somar(antesDe, antesAte);
  const recebidos = dados.sinais.filter((s) => s.sinal_pago_em && s.sinal_pago_em >= deIso && s.sinal_pago_em <= ateIso);
  const sinalRecebido = real(recebidos.reduce((t, s) => t + Number(s.sinal), 0));
  const temAlgo = vendidas > 0 || futuras.length > 0 || contas.n > 0 || recebidos.length > 0 || dados.devolucoes > 0;
  if (!temAlgo) return null;

  return (
    <section className="g-card">
      <div className="g-card-t">
        <h3><Tile icone={BedDouble} tom="ceu" tamanho="p" />Hotel: ocupação e contas</h3>
        <span className="g-muted g-pp">noites do período e contas fechadas</span>
      </div>
      <div className="g-rel-ch">
        <div className="g-rel-ch-tipo">
          <p className="g-rel-ch-nome"><b>Ocupação do período</b></p>
          <div className="g-rel-ch-nums">
            <div><small>Taxa de ocupação</small><b>{taxa == null ? "—" : `${taxa}%`}</b></div>
            <div><small>Noites vendidas</small><b>{vendidas}</b></div>
            <div><small>Noites disponíveis</small><b>{disponiveis ?? "—"}</b></div>
          </div>
          <p className="g-muted g-pp">
            {vagas ? `Noites vendidas ÷ noites disponíveis (${vagas} vagas × ${dias(de, ate)} dias).` : "Preencha as vagas do hotel em Meu pet shop para ver a taxa de ocupação."}
            {ateIso >= hoje ? " Conta também as noites já reservadas até o fim do período." : ""}
            {" "}Período anterior: {taxaAntes == null ? `${vendidasAntes} noites` : `${taxaAntes}% (${vendidasAntes} de ${disponiveisAntes} noites)`}.
          </p>
          <p className="g-p"><b>{futuras.length}</b> {futuras.length === 1 ? "noite já reservada" : "noites já reservadas"} de hoje em diante{ultima ? `, a última em ${dataCurta(ultima)}` : ""}.</p>
        </div>
        <div className="g-rel-ch-tipo">
          <p className="g-rel-ch-nome"><b>De onde veio o valor das contas</b></p>
          {contas.n ? (
            <>
              <div className="g-rel-ch-nums">
                <div><small>Diárias</small><b>{brl(contas.diarias)}</b></div>
                <div><small>Taxas</small><b>{brl(contas.taxas)}</b></div>
                <div><small>Extras e produtos</small><b>{brl(real(contas.extras + contas.produtos))}</b></div>
              </div>
              <p className="g-muted g-pp">{contas.n === 1 ? "1 conta fechada" : `${contas.n} contas fechadas`} de creche e hotel no período, somando {brl(contas.total)} (com o sinal dentro). Período anterior: {contasAntes.n ? brl(contasAntes.total) : "sem conta fechada"}.</p>
            </>
          ) : <p className="g-muted g-p">Nenhuma conta de estadia fechada com o detalhe neste período.{contasAntes.n ? ` Período anterior: ${brl(contasAntes.total)}.` : ""}</p>}
          <p className="g-p">Sinais recebidos: <b className="g-tab">{brl(sinalRecebido)}</b>{recebidos.length ? ` (${recebidos.length})` : ""} · devolvidos: <b className="g-tab">{brl(dados.devolvido)}</b>{dados.devolucoes ? ` (${dados.devolucoes})` : ""}</p>
        </div>
      </div>
      <p className="g-muted g-pp g-rel-nota">
        Estes valores são o detalhe das contas e não somam de novo: o que foi recebido já está no faturamento lá em cima, no dia em que entrou (o sinal, no dia em que foi pago).
        A noite conta pelo dia em que começa.
      </p>
    </section>
  );
}
