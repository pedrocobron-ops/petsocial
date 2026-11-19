"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, MessageCircle } from "lucide-react";
import {
  COLS_PRESENCA, estadoDaCobranca, extratoDoPetLigado, faltaDaCobranca, isoMes, lerPlanos, lerSaldoDeReposicao, linhasDaCobrancaDoPet, planoVale, resumoDoMes,
  SELECT_COBRANCA, textoDasDatas, textoDoExtratoDoPet, textoDosDias, type CobrancaCompleta, type ExtratoDoPet, type Falta, type Presenca,
} from "@/lib/gestao/creche";
import { calendarioGuardado, lerCalendario } from "@/lib/gestao/feriados";
import { brl, dataCurta, deIsoDia, fmtTelefone, isoDia, linkWhatsApp, nomeMes, somaDias, centavos } from "@/lib/gestao/util";
import { nomeDaCasa } from "@/lib/gestao/modulos";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, ok, useAvisos, useDados } from "@/components/gestao/ui";
import { CabecalhoDoPapel, ControlesDoPapel, Pares, Papel, useTituloDoPapel } from "@/components/gestao/papel";

/**
 * Extrato do mês de um cão (opção da creche "Extrato do mês por cachorro"): presenças, faltas, reposições, dias extras, dias avulsos
 * e de experiência e, para quem cuida do financeiro, as saídas depois do horário com a taxa e a cobrança do mês (com a linha Desconto
 * irmão). Quem não vê o financeiro vê só os dias, sem nenhum valor (o banco também não entrega). Só lê; para imprimir, salvar em PDF
 * ou mandar em texto pelo WhatsApp do tutor.
 */
type Pet = { id: string; nome: string; sexo: string | null; clientes: { id: string; nome: string; telefone: string | null } | null };
type Atraso = { dia: string; valor: number | null; estado: string };
type PresencaDoExtrato = Presenca & { experiencia?: boolean };

function ExtratoDoCao() {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const params = useSearchParams();
  const petId = params.get("pet") ?? "";
  // veio da ficha do pet com o plano: o saldo de reposição sai junto com o resto
  const planoDaFicha = params.get("plano") ?? "";
  const agora = new Date(), hoje = isoDia(agora);
  const [mesIso, setMesIso] = useState(() => (params.get("mes") ?? isoMes(agora)).slice(0, 7) + "-01");
  const mes = deIsoDia(mesIso);
  const ligado = extratoDoPetLigado(petshop);

  const { dados, carregando, erro } = useDados(async (): Promise<{ pet: Pet; extrato: ExtratoDoPet } | null> => {
    if (!petId || !ligado) return null;
    const ate = isoDia(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
    const inicio = deIsoDia(mesIso).toISOString(), fim = somaDias(deIsoDia(ate), 1).toISOString();
    // tudo numa leva só (no celular, cada espera soma)
    const [petLido, planos, comDia, avulsas, faltas, cobrancas, atrasos, saldoAdiantado] = await Promise.all([
      sb.from("pets").select("id, nome, sexo, clientes(id, nome, telefone)").eq("petshop_id", petshop.id).eq("id", petId).maybeSingle(),
      lerPlanos(sb, petshop.id, false),
      sb.from("estadias").select(`${COLS_PRESENCA}, experiencia`).eq("petshop_id", petshop.id).eq("pet_id", petId).eq("tipo", "creche").in("status", ["em_casa", "encerrada"])
        .gte("dia", mesIso).lte("dia", ate).order("dia").order("id").limit(200),
      sb.from("estadias").select(`${COLS_PRESENCA}, experiencia`).eq("petshop_id", petshop.id).eq("pet_id", petId).eq("tipo", "creche").in("status", ["em_casa", "encerrada"])
        .is("dia", null).gte("entrada", inicio).lt("entrada", fim).order("entrada").order("id").limit(200),
      sb.from("creche_faltas").select("*").eq("petshop_id", petshop.id).eq("pet_id", petId).gte("dia", mesIso).lte("dia", ate).order("dia").limit(200),
      // dinheiro só para quem cuida do financeiro (o banco também não entrega para os outros)
      cuidoDoFinanceiro ? sb.from("creche_cobrancas").select(SELECT_COBRANCA).eq("petshop_id", petshop.id).eq("pet_id", petId).eq("mes", mesIso).eq("status", "aberta").order("id").limit(5) : null,
      cuidoDoFinanceiro ? sb.from("creche_atrasos").select("dia, valor, estado").eq("petshop_id", petshop.id).eq("pet_id", petId).gte("dia", mesIso).lte("dia", ate).order("dia").limit(100) : null,
      planoDaFicha ? lerSaldoDeReposicao(sb, planoDaFicha) : null,
      // dia marcado como fechado não é dia do plano: a conta é a mesma da ficha e da chamada
      calendarioGuardado(petshop.id, false) ? null : lerCalendario(sb, petshop.id, false).catch(() => null),
    ]);
    const pet = ok(petLido) as unknown as Pet | null;
    if (!pet) throw new Error("Pet não encontrado.");
    const presencas = [...ok(comDia), ...ok(avulsas)] as unknown as PresencaDoExtrato[];
    const diaDe = (e: PresencaDoExtrato) => e.dia ?? isoDia(new Date(e.entrada));
    // o plano que vale no mês (o mais recente, se teve mais de um)
    const plano = planos.filter((p) => p.pet_id === petId && (planoVale(p, mesIso) || planoVale(p, ate) || (p.inicio >= mesIso && p.inicio <= ate)))
      .sort((a, b) => b.inicio.localeCompare(a.inicio))[0] ?? null;
    const r = plano ? resumoDoMes(plano, mes, presencas, ok(faltas) as Falta[], petshop.horario, hoje) : null;
    const saldo = !plano ? null : plano.id === planoDaFicha ? saldoAdiantado : await lerSaldoDeReposicao(sb, plano.id);
    const repoe = new Map((saldo?.pares ?? []).map((p) => [p.reposicao, p.falta]));
    const doMes = ((cobrancas?.data ?? []) as unknown as CobrancaCompleta[]);
    const extrato: ExtratoDoPet = {
      mes, pet: pet.nome, sexo: pet.sexo, tutor: pet.clientes?.nome ?? null,
      plano: plano ? { dias: plano.dias } : null, esperados: r?.esperados ?? 0,
      presencas: presencas.filter((e) => e.mensalista === "plano").map(diaDe).sort(),
      faltas: r?.faltas ?? [],
      reposicoes: presencas.filter((e) => e.mensalista === "reposicao").map(diaDe).sort().map((dia) => ({ dia, repoe: repoe.get(dia) ?? null })),
      extras: presencas.filter((e) => e.mensalista === "extra").map(diaDe).sort(),
      avulsos: presencas.filter((e) => !e.mensalista && !e.experiencia).map(diaDe).sort(),
      experiencias: presencas.filter((e) => !e.mensalista && e.experiencia).map(diaDe).sort(),
      taxas: ((atrasos?.data ?? []) as Atraso[]).map((a) => ({ dia: a.dia, valor: a.valor == null ? null : Number(a.valor), estado: a.estado })),
      cobranca: doMes.find((c) => !c.acerto_saida) ?? doMes[0] ?? null,
    };
    return { pet, extrato };
  }, [petshop.id, petId, planoDaFicha, mesIso, cuidoDoFinanceiro, ligado]);

  useTituloDoPapel(dados ? `Extrato ${nomeMes(mes)} ${mes.getFullYear()} · ${dados.pet.nome} · ${petshop.nome}` : `Extrato da creche · ${petshop.nome}`);
  const meses = Array.from({ length: 13 }, (_, i) => new Date(agora.getFullYear(), agora.getMonth() - i, 1));
  const texto = dados ? textoDoExtratoDoPet(dados.extrato, petshop.nome, cuidoDoFinanceiro) : "";
  const zap = dados ? linkWhatsApp(dados.pet.clientes?.telefone, texto) : null;
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); avisar("Texto do extrato copiado."); } catch (e) { avisarErro(e); }
  }

  const controles = (
    <ControlesDoPapel voltar={petId ? `/gestao/app/clientes?pet=${petId}` : "/gestao/app/creche-hotel"} rotuloVoltar={petId ? "Voltar para a ficha do pet" : `Voltar para ${nomeDaCasa(petshop)}`}
      dica={cuidoDoFinanceiro ? "O extrato mostra valores: confira antes de mandar. Não é nota fiscal." : "Este extrato mostra só os dias, sem valores."}>
      <div className="g-imp-linha">
        <select className="g-select" value={mesIso} aria-label="Mês" onChange={(e) => setMesIso(e.target.value)}>
          {meses.map((m) => <option key={isoMes(m)} value={isoMes(m)}>{nomeMes(m).replace(/^./, (x) => x.toUpperCase())} de {m.getFullYear()}</option>)}
        </select>
        {dados && (zap
          ? <a className="g-btn zap" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar pelo WhatsApp</a>
          : <span className="g-muted g-pp">O tutor está sem telefone na ficha.</span>)}
        {dados && <button type="button" className="g-btn sec" onClick={() => void copiar()}><Copy />Copiar o texto</button>}
      </div>
    </ControlesDoPapel>
  );

  if (!ligado) return <div className="g-imp">{controles}<p className="g-pa-vazio">O extrato do mês por cachorro está desligado. O dono liga em Meu pet shop, Mais opções da creche.</p></div>;
  if (!petId) return <div className="g-imp">{controles}<p className="g-pa-vazio">Abra o extrato pela ficha do pet.</p></div>;
  if (erro) return <div className="g-imp">{controles}<p className="g-erro" role="alert">{erro}</p></div>;
  if (carregando || !dados) return <div className="g-imp">{controles}<Esqueleto linhas={5} /></div>;

  const x = dados.extrato, c = x.cobranca;
  const dias = (l: string[]) => (l.length ? textoDasDatas(l) : "—");
  return (
    <div className="g-imp">
      {controles}
      <Papel pe={petshop.telefone ? `${petshop.nome} · ${fmtTelefone(petshop.telefone)}` : petshop.nome}>
        <CabecalhoDoPapel titulo={`Extrato da creche · ${nomeMes(mes)} de ${mes.getFullYear()}`} apoio={`${x.pet}${x.tutor ? ` · ${x.tutor}` : ""}${dados.pet.clientes?.telefone ? ` · ${fmtTelefone(dados.pet.clientes.telefone)}` : ""}`} />
        <section className="g-pa-ext-pet">
          <h2 className="g-pa-t">Dias na creche<small>{x.plano ? `plano: ${textoDosDias(x.plano.dias)}` : "sem plano de mensalista"}</small></h2>
          <Pares linhas={[
            x.plano && { nome: `Presenças${x.esperados ? ` (de ${x.esperados} dias do plano${mesIso === isoMes(agora) ? " até hoje" : ""})` : ""}`, valor: x.presencas.length },
            x.plano && x.presencas.length > 0 && { nome: dias(x.presencas), valor: "", recuo: true },
            (x.plano || x.faltas.length > 0) && { nome: "Faltas", valor: x.faltas.length },
            x.faltas.length > 0 && { nome: x.faltas.map((f) => `${dataCurta(f.dia)}${f.avisou ? " (avisou)" : ""}`).join(", "), valor: "", recuo: true },
            (x.plano || x.reposicoes.length > 0) && { nome: "Reposições", valor: x.reposicoes.length },
            x.reposicoes.length > 0 && { nome: x.reposicoes.map((r) => `${dataCurta(r.dia)}${r.repoe ? ` (repôs ${dataCurta(r.repoe)})` : ""}`).join(", "), valor: "", recuo: true },
            (x.plano || x.extras.length > 0) && { nome: "Dias extras", valor: x.extras.length },
            x.extras.length > 0 && { nome: `${dias(x.extras)} · entram na mensalidade seguinte`, valor: "", recuo: true },
            x.experiencias.length > 0 && { nome: "Dia de experiência", valor: x.experiencias.length },
            x.experiencias.length > 0 && { nome: dias(x.experiencias), valor: "", recuo: true },
            x.avulsos.length > 0 && { nome: "Dias avulsos", valor: x.avulsos.length },
            x.avulsos.length > 0 && { nome: dias(x.avulsos), valor: "", recuo: true },
          ]} />
          {!x.plano && !x.avulsos.length && !x.experiencias.length && !x.faltas.length && <p className="g-pa-vazio">Nenhum dia na creche em {nomeMes(mes)}.</p>}
        </section>
        {cuidoDoFinanceiro && x.taxas.length > 0 && (
          <section className="g-pa-ext-pet">
            <h2 className="g-pa-t">Saídas depois do horário</h2>
            <Pares linhas={x.taxas.map((t) => ({ nome: `${dataCurta(t.dia)} · ${t.estado === "dispensada" ? "sem taxa" : t.estado === "mensalidade" ? "na mensalidade seguinte" : t.estado === "recebida" ? "recebida na hora" : "a decidir"}`, valor: t.valor != null && t.estado !== "dispensada" ? brl(t.valor) : "—" }))} />
          </section>
        )}
        {cuidoDoFinanceiro && (
          <section className="g-pa-ext-pet">
            <h2 className="g-pa-t">Cobrança de {nomeMes(mes)}{c && <small>{(() => { const e = estadoDaCobranca(c, hoje); return e.estado === "paga" ? (e.semValor ? "sem valor a pagar" : `pago em ${dataCurta(c.lancamentos!.data)}`) : `${e.estado === "atrasada" ? "venceu" : "vence"} em ${dataCurta(c.vencimento)}`; })()}</small>}</h2>
            {c ? (
              <>
                <Pares linhas={[...linhasDaCobrancaDoPet(c).map((l) => ({ nome: l.nome, valor: l.valor < 0 ? `− ${brl(-l.valor)}` : brl(l.valor), recuo: l.valor < 0 })), { nome: "Total", valor: brl(c.total), forte: true }]} />
                {!c.lancamentos?.pago && faltaDaCobranca(c) < Number(c.total) && <p className="g-pa-nota">Já pago {brl(centavos((Number(c.total) - faltaDaCobranca(c))))}. Falta {brl(faltaDaCobranca(c))}.</p>}
              </>
            ) : <p className="g-pa-vazio">Nenhuma mensalidade de {nomeMes(mes)} para {x.pet}.</p>}
          </section>
        )}
        <p className="g-pa-nota">{cuidoDoFinanceiro ? "Extrato para conferência. Não é nota fiscal." : "Extrato dos dias na creche."} A situação é a de agora, na hora da impressão.</p>
      </Papel>
    </div>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><ExtratoDoCao /></Suspense>;
}
