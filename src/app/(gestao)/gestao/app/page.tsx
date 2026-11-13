"use client";

import { Marca, Selo } from "@/components/gestao/marca";
import { Anel, Barras, Kpi, Ranking, Tendencia, Tile, type Tom } from "@/components/gestao/painel";
import { useState } from "react";
import FimDoTeste, { DIAS_DE_AVISO, chaveAgoraNao, fimDoTeste } from "@/components/gestao/fim-do-teste";
import PrimeirosPassos, { usePrimeirosPassos } from "@/components/gestao/primeiros-passos";
import ResumoSemana, { temSemanaPassada } from "@/components/gestao/resumo-semana";
import { guardarLembrado, lerLembrado } from "@/components/gestao/lembrado";
import Link from "next/link";
import { BedDouble, FileSpreadsheet, Cake, CalendarDays, Check, HandCoins, HeartPulse, ChevronRight, MessageCircle, Mic, Package, PawPrint, Plus, Receipt, Scissors, Sparkles, Ticket, UserSearch, Wallet } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { SELECT_AGENDAMENTO, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { brl, dataLonga, hora, inicioDaSemana, inicioDoDia, isoDia, nomeDiaCurto, saudacao, soDigitos, somaDias } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { nomeDaCasa, usaCasa, usaModulo } from "@/lib/gestao/modulos";
import { AvatarPet, Esqueleto, Vazio, abrirAssistente, useDados } from "@/components/gestao/ui";
import LinkRapido from "@/components/gestao/agenda/link-rapido";
import PedidosLink from "@/components/gestao/agenda/pedidos-link";
import { buscarSaudeVencendo } from "@/components/gestao/clientes/saude-avisos";
import MetaMes from "@/components/gestao/meta-mes";
import DicasMozart from "@/components/gestao/dicas-mozart";
import ChamarDeVolta, { aniversariantes, buscarParaChamar, chamadoEm, lerChamados, quemSumiu, type AbaChamar, type GrupoChamar } from "@/components/gestao/clientes/chamar-de-volta";
import DetalheAgendamento from "@/components/gestao/agenda/detalhe-agendamento";
import LembretesDoDia, { BotaoLembrete } from "@/components/gestao/agenda/lembretes";
import FormAgendamento from "@/components/gestao/agenda/form-agendamento";
import Importar from "@/components/gestao/importar";

const PEDIDOS = ["Que horários tenho livres amanhã?", "Quanto entrou essa semana?", "Quem não vem há mais de um mês?"];

/** Tela inicial: o dia de relance, o que precisa de atenção e o atalho para pedir ao Mozart. */
export default function Hoje() {
  const { sb, petshop, eu, vejoFinanceiro, souDono, posso, liberado } = useGestao();
  const [aberto, setAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<AgendamentoCompleto | null>(null);
  const [lembretes, setLembretes] = useState(false);
  const [chamando, setChamando] = useState<AbaChamar | null>(null);
  const [importando, setImportando] = useState(false);
  const hoje = inicioDoDia(new Date());
  const hojeIso = isoDia(hoje);
  // o que o negócio faz decide o que a tela mostra: quem não tem creche, loja ou pacotes não vê cartão nem aviso disso
  const banho = usaModulo(petshop, "banho_tosa"), casa = usaCasa(petshop) && posso("creche_hotel");
  const loja = usaModulo(petshop, "loja"), comPacotes = usaModulo(petshop, "pacotes");
  const soCasa = casa && !banho;
  const rotuloCasa = nomeDaCasa(petshop);

  const vejoEstoque = posso("estoque"), vejoPacotes = posso("pacotes");
  const { dados, carregando, recarregar } = useDados(async () => {
    const amanha = somaDias(hoje, 1), depois = somaDias(hoje, 2);
    const seg = inicioDaSemana(hoje), ha30 = somaDias(hoje, -30), ha6 = somaDias(hoje, -6);
    const [ags, agsAmanha, emCasa, produtos, pets, totalAgs, entradas, contas, pacotes, daSemana, doMes, ultimos7, concluidos, lembrados, estadiasTotal, produtosTotal] = await Promise.all([
      sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id).gte("inicio", hoje.toISOString()).lt("inicio", amanha.toISOString()).order("inicio"),
      sb.from("agendamentos").select("id, lembrete_em, status, pets(clientes(id, telefone))").eq("petshop_id", petshop.id).gte("inicio", amanha.toISOString()).lt("inicio", depois.toISOString()),
      sb.from("estadias").select("id, status, entrada, saida_prevista").eq("petshop_id", petshop.id).in("status", ["em_casa", "reservada"]).limit(1000),
      // estoque e pacotes só entram no aviso de quem tem a área
      vejoEstoque ? lerTudo<{ id: string; nome: string; estoque: number; estoque_minimo: number }>((de, ate, contar) => sb.from("produtos").select("id, nome, estoque, estoque_minimo", contando(contar)).eq("petshop_id", petshop.id).eq("ativo", true).gt("estoque_minimo", 0).order("nome").order("id").range(de, ate)).then((data) => ({ data })) : Promise.resolve({ data: [] }),
      sb.from("pets").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id),
      sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id),
      vejoFinanceiro ? sb.from("lancamentos").select("valor, tipo").eq("petshop_id", petshop.id).eq("pago", true).is("movimento", null).eq("data", hojeIso) : Promise.resolve({ data: [] }),
      vejoFinanceiro ? sb.from("lancamentos").select("id, valor, vencimento, tipo").eq("petshop_id", petshop.id).eq("pago", false).lte("vencimento", hojeIso) : Promise.resolve({ data: [] }),
      vejoPacotes ? sb.from("pacotes_clientes").select("id").eq("petshop_id", petshop.id).eq("ativo", true).gte("vence_em", hojeIso).lte("vence_em", isoDia(somaDias(hoje, 7))) : Promise.resolve({ data: [] }),
      sb.from("agendamentos").select("inicio, status").eq("petshop_id", petshop.id).gte("inicio", seg.toISOString()).lt("inicio", somaDias(seg, 7).toISOString()),
      lerTudo((de, ate, contar) => sb.from("agendamentos").select("status, servicos(nome, cor)", contando(contar)).eq("petshop_id", petshop.id).gte("inicio", ha30.toISOString()).lt("inicio", amanha.toISOString()).order("inicio").order("id").range(de, ate)).then((data) => ({ data })),
      vejoFinanceiro ? lerTudo((de, ate, contar) => sb.from("lancamentos").select("valor, data", contando(contar)).eq("petshop_id", petshop.id).eq("pago", true).eq("tipo", "entrada").is("movimento", null).gte("data", isoDia(ha6)).lte("data", hojeIso).order("data").order("id").range(de, ate)).then((data) => ({ data })) : Promise.resolve({ data: [] }),
      // primeiros passos e aviso de fim de teste: duas contagens, sem trazer linha nenhuma
      sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).eq("status", "concluido"),
      sb.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).not("lembrete_em", "is", null),
      sb.from("estadias").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id),
      sb.from("produtos").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id),
    ]);
    const saude = await buscarSaudeVencendo(sb, petshop.id).catch(() => null);
    const valeAg = (st: string) => !["cancelado", "faltou"].includes(st);
    const porServico = new Map<string, { rotulo: string; valor: number; cor: string | null }>();
    for (const a of (doMes.data ?? []) as unknown as { status: string; servicos: { nome: string; cor: string | null } | null }[]) {
      if (!valeAg(a.status) || !a.servicos) continue;
      const x = porServico.get(a.servicos.nome) ?? { rotulo: a.servicos.nome, valor: 0, cor: a.servicos.cor };
      x.valor++; porServico.set(a.servicos.nome, x);
    }
    const lista = (ags.data ?? []) as unknown as AgendamentoCompleto[];
    const amanhaAtivos = ((agsAmanha.data ?? []) as unknown as { id: string; lembrete_em: string | null; status: string; pets: { clientes: { id: string; telefone: string | null } | null } | null }[])
      .filter((a) => !["cancelado", "faltou"].includes(a.status));
    // um lembrete por tutor: quem tem dois pets amanhã recebe uma mensagem só
    const tutores = (lista: typeof amanhaAtivos) => new Set(lista.map((a) => a.pets?.clientes?.id ?? a.id)).size;
    // lembrete só dá para mandar a quem tem telefone: os outros não entram na conta do que falta
    const semTelefone = (a: (typeof amanhaAtivos)[number]) => soDigitos(a.pets?.clientes?.telefone).length < 8;
    const estadias = emCasa.data ?? [];
    const noDia = (iso: string | null) => Boolean(iso) && isoDia(new Date(iso!)) === hojeIso;
    return {
      ags: lista,
      amanha: amanhaAtivos.length,
      amanhaSemLembrete: tutores(amanhaAtivos.filter((a) => !a.lembrete_em && !semTelefone(a))),
      amanhaSemTelefone: tutores(amanhaAtivos.filter((a) => !a.lembrete_em && semTelefone(a))),
      emCasa: estadias.filter((e) => e.status === "em_casa").length,
      chegamHoje: estadias.filter((e) => e.status === "reservada" && noDia(e.entrada)).length,
      saemHoje: estadias.filter((e) => e.status === "em_casa" && noDia(e.saida_prevista)).length,
      acabando: (produtos.data ?? []).filter((p) => Number(p.estoque) <= Number(p.estoque_minimo)),
      pets: pets.count ?? 0,
      totalAgs: totalAgs.count ?? 0,
      concluidos: concluidos.count ?? 0,
      lembrados: lembrados.count ?? 0,
      estadiasTotal: estadiasTotal.count ?? 0,
      produtosTotal: produtosTotal.count ?? 0,
      entrou: (entradas.data ?? []).filter((l) => l.tipo === "entrada").reduce((s, l) => s + Number(l.valor), 0),
      saiu: (entradas.data ?? []).filter((l) => l.tipo === "saida").reduce((s, l) => s + Number(l.valor), 0),
      contas: ((contas.data ?? []) as { id: string; valor: number; vencimento: string | null; tipo?: string }[]).filter((c) => c.tipo === "saida"),
      aReceberVencidas: ((contas.data ?? []) as { id: string; valor: number; vencimento: string | null; tipo?: string }[]).filter((c) => c.tipo === "entrada"),
      pacotesVencendo: (pacotes.data ?? []).length,
      saude,
      semana: Array.from({ length: 7 }, (_, i) => {
        const d = somaDias(seg, i), iso = isoDia(d);
        return { rotulo: nomeDiaCurto(d), valor: (daSemana.data ?? []).filter((a) => valeAg(a.status) && isoDia(new Date(a.inicio)) === iso).length };
      }),
      servicosMes: [...porServico.values()].sort((a, b) => b.valor - a.valor).slice(0, 5),
      entradas7: Array.from({ length: 7 }, (_, i) => {
        const iso = isoDia(somaDias(ha6, i));
        return ((ultimos7.data ?? []) as { valor: number; data: string }[]).filter((l) => l.data === iso).reduce((t, l) => t + Number(l.valor), 0);
      }),
    };
  }, [petshop.id, hojeIso, vejoFinanceiro, vejoEstoque, vejoPacotes]);

  // quem chamar de volta e aniversariantes: consulta à parte, para não segurar o resto da tela
  const vejoClientes = posso("clientes");
  const { dados: paraChamar } = useDados(async () => (vejoClientes ? buscarParaChamar(sb, petshop.id) : null), [petshop.id, hojeIso, vejoClientes]);
  const chamados = paraChamar ? lerChamados(petshop.id) : {};
  const comFone = (grupos: GrupoChamar[]) => grupos.filter((g) => g.telefone);
  const sumidos = paraChamar ? comFone(quemSumiu(paraChamar, 30, hoje)) : [];
  const niver = paraChamar ? comFone(aniversariantes(paraChamar, hoje)) : [];
  const sumidosAChamar = sumidos.filter((g) => !chamadoEm(chamados, "volta", g.chave));
  const niverAChamar = niver.filter((g) => !chamadoEm(chamados, "niver", g.chave));
  const nomesDosPets = (grupos: GrupoChamar[]) => {
    const nomes = grupos.flatMap((g) => g.pets.map((p) => p.pet.nome));
    return { q: nomes.length, texto: nomes.length <= 2 ? nomes.join(" e ") : `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}` };
  };
  const petsSumidos = nomesDosPets(sumidosAChamar), petsNiver = nomesDosPets(niverAChamar);
  const niverHoje = niverAChamar.length > 0 && niverAChamar.every((g) => g.pets.every((p) => p.ordem === 0));

  const ativos = (dados?.ags ?? []).filter((a) => !["cancelado", "faltou"].includes(a.status));
  const feitos = ativos.filter((a) => a.status === "concluido").length;
  const proximo = ativos.find((a) => a.status !== "concluido" && new Date(a.fim) > new Date());
  const selecionado = aberto ? dados?.ags.find((a) => a.id === aberto) ?? null : null;

  // retenção: no máximo um cartão em destaque, nesta ordem: fim de teste > primeiros passos > resumo da semana
  const teste = fimDoTeste(petshop);
  const testePerto = Boolean(teste && teste.dias <= DIAS_DE_AVISO);
  const [agoraNao, setAgoraNao] = useState(() => lerLembrado(chaveAgoraNao(petshop.id)) === hojeIso);
  const cartaoTeste = testePerto && souDono && (!liberado || !agoraNao);
  const pp = usePrimeirosPassos(
    dados ? { pets: dados.pets, horarios: dados.totalAgs, concluidos: dados.concluidos, lembretes: dados.lembrados, amanha: dados.amanha, estadias: dados.estadiasTotal, produtos: dados.produtosTotal } : null,
    () => setLembretes(true),
  );
  const cartaoPassos = !cartaoTeste && pp.estado !== "some";
  const temResumo = vejoFinanceiro && temSemanaPassada(petshop.criado_em, hoje);
  const cartaoResumo = temResumo && hoje.getDay() === 1 && !cartaoTeste && !cartaoPassos;

  // creche e hotel: a casa pode estar cheia mesmo com a agenda de banho vazia
  const n = (q: number, um: string, varios: string) => (q === 1 ? `1 ${um}` : `${q} ${varios}`);
  const temCasa = Boolean(dados && casa && dados.emCasa + dados.chegamHoje + dados.saemHoje > 0);
  const linhaCasa = dados && temCasa
    ? `${rotuloCasa}: ${dados.emCasa} na casa, ${n(dados.chegamHoje, "chega", "chegam")} hoje, ${n(dados.saemHoje, "sai", "saem")} hoje`
    : "";

  // conta que acabou de nascer: nada de zeros soltos, só o próximo passo
  const contaNova = Boolean(dados && dados.pets === 0 && dados.totalAgs === 0 && dados.estadiasTotal === 0);
  const frase = !dados ? "" : contaNova ? (posso("clientes") ? "Tudo pronto para começar. O primeiro passo é cadastrar um pet, ou trazer os seus clientes de uma planilha." : "Tudo pronto para começar.")
    : soCasa && !ativos.length ? (temCasa ? `${linhaCasa}.` : `Nenhum pet na casa agora.`)
    : !ativos.length ? `Nenhum horário marcado para hoje.${linhaCasa ? ` ${linhaCasa}.` : ""}`
    : `Hoje ${ativos.length === 1 ? "é 1 atendimento" : `são ${ativos.length} atendimentos`}${proximo ? `. O próximo é ${proximo.pets?.nome ?? "um pet"}, às ${hora(proximo.inicio)}` : feitos === ativos.length ? ", todos concluídos" : ""}.`;

  const atencao = dados ? [
    posso("agenda") && dados.amanhaSemLembrete > 0 && { icone: MessageCircle, tom: "pessego" as Tom, texto: `Amanhã ${dados.amanha === 1 ? "tem 1 horário" : `tem ${dados.amanha} horários`}. ${dados.amanhaSemLembrete === 1 ? "Falta 1 lembrete" : `Faltam ${dados.amanhaSemLembrete} lembretes`}: toque para mandar pelo WhatsApp.${dados.amanhaSemTelefone > 0 ? ` ${dados.amanhaSemTelefone} sem telefone (não ${dados.amanhaSemTelefone === 1 ? "entra" : "entram"} na conta).` : ""}`, aoTocar: () => setLembretes(true) },
    sumidosAChamar.length > 0 && { icone: UserSearch, tom: "menta" as Tom, texto: `${petsSumidos.texto} ${petsSumidos.q === 1 ? "não vem" : "não vêm"} há mais de 30 dias e não ${petsSumidos.q === 1 ? "tem" : "têm"} horário marcado. Toque para chamar de volta pelo WhatsApp.`, aoTocar: () => setChamando("volta") },
    niverAChamar.length > 0 && { icone: Cake, tom: "manteiga" as Tom, texto: `${petsNiver.texto} ${petsNiver.q === 1 ? "faz" : "fazem"} aniversário ${niverHoje ? "hoje" : "nos próximos dias"}. Toque para mandar os parabéns pelo WhatsApp.`, aoTocar: () => setChamando("niver") },
    loja && dados.acabando.length > 0 && { icone: Package, tom: "rosa" as Tom, texto: `${dados.acabando.length === 1 ? "1 produto está acabando" : `${dados.acabando.length} produtos estão acabando`}: ${dados.acabando.slice(0, 3).map((p) => p.nome).join(", ")}.`, href: "/gestao/app/estoque" },
    dados.contas.length > 0 && { icone: Receipt, tom: "manteiga" as Tom, texto: `${dados.contas.length === 1 ? "1 conta vence" : `${dados.contas.length} contas vencem`} até hoje: ${brl(dados.contas.reduce((s, c) => s + Number(c.valor), 0))}.`, href: "/gestao/app/financeiro" },
    dados.aReceberVencidas.length > 0 && { icone: HandCoins, tom: "menta" as Tom, texto: `${dados.aReceberVencidas.length === 1 ? "1 cliente ficou de pagar" : `${dados.aReceberVencidas.length} contas de clientes venceram`} até hoje: ${brl(dados.aReceberVencidas.reduce((s, c) => s + Number(c.valor), 0))} a receber.`, href: "/gestao/app/financeiro" },
    dados.saude && dados.saude.vencidos + dados.saude.vencendo > 0 && { icone: HeartPulse, tom: "ceu" as Tom, texto: dados.saude.frase, href: "/gestao/app/clientes" },
    comPacotes && dados.pacotesVencendo > 0 && { icone: Ticket, tom: "lilas" as Tom, texto: `${dados.pacotesVencendo === 1 ? "1 pacote vence" : `${dados.pacotesVencendo} pacotes vencem`} nos próximos 7 dias.`, href: "/gestao/app/pacotes" },
  ].filter(Boolean) as { icone: React.ComponentType<{ size?: number }>; tom: Tom; texto: string; href?: string; aoTocar?: () => void }[] : [];

  const agora = new Date();
  const emAndamento = ativos.find((a) => a.status !== "concluido" && new Date(a.inicio) <= agora && new Date(a.fim) > agora);
  const destaque = emAndamento ?? proximo;
  const faltam = destaque ? Math.round((new Date(destaque.inicio).getTime() - agora.getTime()) / 60000) : 0;
  const quando = !destaque ? "" : faltam <= 0 ? "acontecendo agora" : faltam < 60 ? `em ${faltam} min` : `em ${Math.floor(faltam / 60)} h${faltam % 60 ? ` ${faltam % 60} min` : ""}`;
  const semana = dados?.semana ?? [];
  const totalSemana = semana.reduce((s, d) => s + d.valor, 0);

  return (
    <>
      <header className="g-topo">
        <div>
          <p className="g-rotulo" style={{ marginBottom: 6 }}>{dataLonga(hoje)}</p>
          <h1>{saudacao()}, <em className="it">{eu.nome.split(" ")[0]}</em></h1>
        </div>
        <div className="g-acoes">
          {posso("agenda") && banho && !contaNova && <LinkRapido rotulo="Mandar link de agendamento" />}
          {contaNova && posso("clientes") ? <Link className="g-btn pri" href="/gestao/app/clientes"><Plus />Cadastrar o primeiro pet</Link>
            : soCasa ? <Link className="g-btn pri" href="/gestao/app/creche-hotel"><Plus />Fazer check-in</Link>
            : posso("agenda") && <Link className="g-btn pri" href="/gestao/app/agenda?novo=1"><Plus />Marcar horário</Link>}
        </div>
      </header>

      <div className="g-pilha g">
        {testePerto && souDono && (
          <FimDoTeste modo={cartaoTeste ? "cartao" : "linha"} numeros={dados ? { pets: dados.pets, horarios: dados.totalAgs, concluidos: dados.concluidos } : null}
            aoDispensar={() => { guardarLembrado(chaveAgoraNao(petshop.id), hojeIso); setAgoraNao(true); }} />
        )}
        {testePerto && !souDono && liberado && <FimDoTeste modo="equipe" numeros={null} aoDispensar={() => {}} />}

        {contaNova && cartaoPassos && <PrimeirosPassos pp={pp} modo="cartao" curto />}

        <div className="g-heroi">
          <section className="g-mozart">
            <Marca tamanho={300} className="fundo" />
            <div className="g-fila" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
              <Selo tamanho={52} />
              <div className="g-cresce">
                <p className="g-rotulo"><span className="g-ondas" aria-hidden><i /><i /><i /><i /></span>Mozart, seu assistente de inteligência artificial</p>
                <p className="fala">{carregando && !dados ? "Olhando a agenda…" : frase}</p>
              </div>
            </div>
            <div className="g-pilha p">
              <div className="g-fila"><button className="g-btn pri" onClick={() => abrirAssistente()}><Mic />Falar com o Mozart</button></div>
              <div className="g-sugestoes">
                {PEDIDOS.filter((p) => vejoFinanceiro || !p.startsWith("Quanto")).map((p) => <button key={p} onClick={() => abrirAssistente(p)}>{p}</button>)}
              </div>
            </div>
          </section>

          {destaque?.pets ? (
            <button className="g-proximo" style={{ textAlign: "left", color: "inherit", "--cor": destaque.servicos?.cor ?? "#f97316" } as React.CSSProperties} onClick={() => setAberto(destaque.id)}>
              <div className="g-fila entre" style={{ flexWrap: "nowrap" }}>
                <span className="g-rotulo" style={{ color: "#8a4a17" }}>{emAndamento ? "Na mesa agora" : "Próximo atendimento"}</span>
                <span className="g-tag laranja">{quando}</span>
              </div>
              <div className="quem">
                <AvatarPet pet={destaque.pets} tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b>{destaque.pets.nome}</b>
                  <span>{[destaque.pets.raca, destaque.pets.clientes?.nome].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
              <div className="quando">
                <b>{hora(destaque.inicio)}</b>
                <span className="g-ag" style={{ width: "auto", padding: "6px 12px", boxShadow: "none", borderLeftWidth: 1, borderRadius: 999 }}><span className="serv"><i />{destaque.servicos?.nome ?? "Atendimento"}</span></span>
                {destaque.profissionais && <span className="g-p" style={{ color: "#6b4a2f" }}>com {destaque.profissionais.nome.split(" ")[0]}</span>}
              </div>
            </button>
          ) : (
            contaNova && posso("clientes") ? (
            <div className="g-proximo vazio">
              <span className="g-rotulo" style={{ color: "#24543b" }}>Já tem clientes?</span>
              <div className="quem">
                <Tile icone={FileSpreadsheet} tom="menta" tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b style={{ whiteSpace: "normal", fontSize: "1.375rem" }}>Traga a sua lista de uma planilha</b>
                  <span style={{ whiteSpace: "normal" }}>Tutores e pets entram de uma vez, sem digitar um por um.</span>
                </div>
              </div>
              <button type="button" className="g-btn verde" style={{ justifySelf: "start" }} onClick={() => { if (liberado) setImportando(true); }}><FileSpreadsheet />Trazer de uma planilha</button>
            </div>
            ) : soCasa && !(dados && ativos.length) ? (
            <div className="g-proximo vazio">
              <span className="g-rotulo" style={{ color: "#24543b" }}>{rotuloCasa}</span>
              <div className="quem">
                <Tile icone={BedDouble} tom="ceu" tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b style={{ whiteSpace: "normal", fontSize: "1.375rem" }}>{!dados ? "Olhando a casa…" : dados.emCasa === 0 ? "Nenhum pet na casa agora" : dados.emCasa === 1 ? "1 pet na casa agora" : `${dados.emCasa} pets na casa agora`}</b>
                </div>
              </div>
              {temCasa && <Link className="g-hoje-casa" href="/gestao/app/creche-hotel"><BedDouble aria-hidden /><span>{linhaCasa}</span><ChevronRight aria-hidden /></Link>}
              <Link className="g-btn verde" href="/gestao/app/creche-hotel" style={{ justifySelf: "start" }}><Plus />{dados?.estadiasTotal === 0 ? "Fazer o primeiro check-in" : "Fazer check-in"}</Link>
            </div>
            ) : (
            <div className="g-proximo vazio">
              <span className="g-rotulo" style={{ color: "#24543b" }}>{dados && ativos.length ? "Dia concluído" : temCasa ? "Banho e tosa sem horários" : "Agenda livre"}</span>
              <div className="quem">
                <Tile icone={dados && ativos.length ? Check : Sparkles} tom="menta" tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <b style={{ whiteSpace: "normal", fontSize: "1.375rem" }}>{dados && ativos.length ? "Tudo atendido por hoje" : "Nenhum horário por vir"}</b>
                </div>
              </div>
              {temCasa && <Link className="g-hoje-casa" href="/gestao/app/creche-hotel"><BedDouble aria-hidden /><span>{linhaCasa}</span><ChevronRight aria-hidden /></Link>}
              {posso("agenda") && <Link className="g-btn verde" href="/gestao/app/agenda?novo=1" style={{ justifySelf: "start" }}><Plus />Marcar horário</Link>}
            </div>
            )
          )}
        </div>

        {temCasa && destaque?.pets && <Link className="g-hoje-casa solta" href="/gestao/app/creche-hotel"><BedDouble aria-hidden /><span>{linhaCasa}</span><ChevronRight aria-hidden /></Link>}

        {posso("agenda") && <PedidosLink />}

        {!(contaNova && cartaoPassos) && <PrimeirosPassos pp={pp} modo={cartaoPassos ? "cartao" : "linha"} />}
        {temResumo && <ResumoSemana modo={cartaoResumo ? "cartao" : "linha"} />}

        {!contaNova && <div className="g-grade kpis">
          <Kpi href="/gestao/app/agenda" icone={Scissors} tom="pessego" rotulo="Atendimentos hoje" valor={dados ? ativos.length : "–"}
            apoio={dados ? (ativos.length ? `${feitos} ${feitos === 1 ? "concluído" : "concluídos"}` : "agenda livre") : " "}
            lado={dados && ativos.length > 0 ? <Anel parte={feitos / ativos.length} cor="var(--g-laranja)">{Math.round((feitos / ativos.length) * 100)}%</Anel> : undefined} />
          {casa && <Kpi href="/gestao/app/creche-hotel" icone={BedDouble} tom="ceu" rotulo={rotuloCasa} valor={dados ? dados.emCasa : "–"} apoio={dados?.emCasa === 1 ? "pet na casa agora" : "pets na casa agora"} />}
          {vejoFinanceiro ? (
            <Kpi href="/gestao/app/caixa" icone={Wallet} tom="menta" rotulo="Entrou hoje" valor={dados ? brl(dados.entrou) : "–"} apoio={dados && dados.saiu > 0 ? `saiu ${brl(dados.saiu)}` : "ver o caixa"}
              lado={dados ? <Tendencia valores={dados.entradas7} /> : undefined} />
          ) : (
            <Kpi href="/gestao/app/clientes" icone={PawPrint} tom="menta" rotulo="Pets cadastrados" valor={dados ? dados.pets : "–"} apoio="ver todos" />
          )}
          <Kpi href="/gestao/app/agenda" icone={CalendarDays} tom="lilas" rotulo="Nesta semana" valor={dados ? totalSemana : "–"} apoio={totalSemana === 1 ? "horário marcado" : "horários marcados"} />
        </div>}

        <div className="g-duas">
          <section>
            <div className="g-card-t">
              <h2>Agenda de hoje</h2>
              {posso("agenda") && <Link className="g-btn fantasma p" href="/gestao/app/agenda">Ver a semana<ChevronRight /></Link>}
            </div>
            {carregando && !dados ? <Esqueleto /> : !dados?.ags.length ? (
              <div className="g-card">
                {!banho ? (
                  <Vazio mozart="acenando" titulo="Nenhum horário marcado para hoje" texto={casa ? `Serviços com hora marcada aparecem aqui. As estadias ficam em ${rotuloCasa}.` : "Serviços com hora marcada aparecem aqui."} />
                ) : contaNova && posso("clientes") ? (
                  <Vazio mozart="acenando" titulo="A agenda começa pelo primeiro pet" texto="Cadastre um pet com o tutor. Depois é só marcar: o horário aparece aqui.">
                    <Link className="g-btn verde" href="/gestao/app/clientes">Cadastrar o primeiro pet</Link>
                  </Vazio>
                ) : (
                  <Vazio mozart="acenando" titulo="Nenhum banho marcado para hoje" texto="Que tal chamar quem está com o banho atrasado? O Mozart monta a lista para você.">
                    <button className="g-btn verde" onClick={() => abrirAssistente("Quem não vem há mais de um mês?")}>Ver quem está sumido</button>
                  </Vazio>
                )}
              </div>
            ) : (
              <div className="g-tempo">
                {dados.ags.map((a) => {
                  const fora = ["cancelado", "faltou"].includes(a.status);
                  return (
                    <div className={`g-hora-grupo${a.status === "concluido" ? " feito" : ""}${a.id === destaque?.id ? " agora" : ""}`} key={a.id} style={{ "--cor": a.servicos?.cor ?? "#f97316" } as React.CSSProperties}>
                      <time>{hora(a.inicio)}</time>
                      <span className="ponto" aria-hidden />
                      <div className="g-lb-par">
                        <button className={`g-ag${fora ? " apagado" : ""}`} onClick={() => setAberto(a.id)}>
                          {a.pets && <AvatarPet pet={a.pets} />}
                          <span className="t">
                            <b>{a.pets?.nome}</b>
                            <span className="serv"><i />{a.servicos?.nome ?? "Atendimento"}</span>
                            {a.pets?.clientes?.nome && <span className="g-agd-tutor">Tutor: {a.pets.clientes.nome}</span>}
                          </span>
                          {a.status !== "marcado" && <span className={`g-tag ${STATUS_AGENDAMENTO[a.status].tom}`}>{STATUS_AGENDAMENTO[a.status].rotulo}</span>}
                          <ChevronRight size={18} className="g-muted g-so-pc" />
                        </button>
                        {posso("agenda") && <BotaoLembrete agendamento={a} doDia={dados.ags} aoMandar={() => void recarregar()} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="g-pilha g">
            {posso("clientes") && posso("agenda") && <DicasMozart semDicas={[...(sumidos.length ? ["sumidos"] : []), ...(niver.length ? ["niver"] : [])]} />}
            {atencao.length > 0 && (
              <section>
                <div className="g-card-t"><h2>Pede a sua atenção</h2><span className="g-tag amarelo">{atencao.length}</span></div>
                <div className="g-atencao">
                  {atencao.map((x) => x.href ? (
                    <Link key={x.texto} href={x.href}>
                      <Tile icone={x.icone} tom={x.tom} />
                      <span>{x.texto}</span>
                      <ChevronRight size={18} />
                    </Link>
                  ) : (
                    <button key={x.texto} type="button" onClick={x.aoTocar}>
                      <Tile icone={x.icone} tom={x.tom} />
                      <span>{x.texto}</span>
                      <ChevronRight size={18} />
                    </button>
                  ))}
                </div>
              </section>
            )}

            <MetaMes />

            {!contaNova && <section className="g-card">
              <div className="g-card-t"><h3>Movimento da semana</h3><span className="g-muted g-pp">horários por dia</span></div>
              {!dados ? <Esqueleto linhas={2} /> : totalSemana ? <Barras itens={semana} destaque={(hoje.getDay() + 6) % 7} /> : <p className="g-muted g-p">Nenhum horário marcado nesta semana ainda.</p>}
            </section>}

            {dados && dados.servicosMes.length > 0 && (
              <section className="g-card">
                <div className="g-card-t"><h3>Serviços mais pedidos</h3><span className="g-muted g-pp">últimos 30 dias</span></div>
                <Ranking itens={dados.servicosMes} />
              </section>
            )}
          </div>
        </div>
      </div>

      {selecionado && !editando && <DetalheAgendamento agendamento={selecionado} aoFechar={() => setAberto(null)} aoMudar={() => void recarregar()} aoEditar={() => setEditando(selecionado)} />}
      {importando && <Importar tipo="clientes" aoFechar={() => setImportando(false)} aoTerminar={() => void recarregar()} />}
      {chamando && <ChamarDeVolta aba={chamando} aoFechar={() => setChamando(null)} />}
      {lembretes && <LembretesDoDia dia={isoDia(somaDias(hoje, 1))} aoFechar={() => setLembretes(false)} aoMudar={() => void recarregar()} />}
      {editando && <FormAgendamento agendamento={editando} aoFechar={() => setEditando(null)} aoSalvar={() => { setEditando(null); setAberto(null); void recarregar(); }} />}
    </>
  );
}
