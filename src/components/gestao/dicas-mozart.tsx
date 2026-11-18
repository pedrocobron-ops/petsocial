"use client";

import { useEffect, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { Cake, CalendarPlus, MessageCircle, Ticket, UserX, X } from "lucide-react";
import { deIsoDia, horarioDoDia, inicioDoDia, isoDia, nomeDia, somaDias } from "@/lib/gestao/util";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { useGestao } from "./contexto";
import { usaModulo } from "@/lib/gestao/modulos";
import { Selo } from "./marca";
import { Tile, type Tom } from "./painel";
import { abrirAssistente, useDados } from "./ui";
import { nomesEMais, type DicasDoBanco } from "@/lib/gestao/hoje-extras";
import "./dicas-mozart.css";

type Dica = { id: string; icone: React.ComponentType<{ size?: number }>; tom: Tom; texto: string; acao: string; pedido?: string; href?: string };

const lista = (nomes: string[]) => nomesEMais(nomes, nomes.length);

/**
 * As dicas, a partir das contas prontas (do banco, `gestao_hoje_extras`, ou feitas aqui com o banco antigo): quem sumiu, quem
 * faltou, pacote acabando, aniversário e dia fraco na agenda. Cada dica leva a uma ação.
 */
export function montarDicas(d: DicasDoBanco, q: { hoje: Date; abreAmanha: boolean; comPacotes: boolean }): Dica[] {
  const dicas: Dica[] = [];
  // quem vinha e parou: última visita concluída entre 30 e 150 dias atrás e nada marcado
  if (d.sumidos.q) dicas.push({
    id: "sumidos", icone: MessageCircle, tom: "menta",
    texto: `${nomesEMais(d.sumidos.nomes, d.sumidos.q)} ${d.sumidos.q === 1 ? "não vem" : "não vêm"} há mais de um mês e não ${d.sumidos.q === 1 ? "tem" : "têm"} horário marcado.`,
    acao: "Preparar as mensagens", pedido: "Prepara uma mensagem de WhatsApp chamando de volta quem não vem há mais de um mês e não tem horário marcado.",
  });
  // faltou nos últimos 7 dias e não remarcou
  const nFaltas = Math.max(d.faltas_q, d.faltas.length);
  if (nFaltas) dicas.push({
    id: "faltas", icone: UserX, tom: "rosa",
    texto: `${nomesEMais(d.faltas, nFaltas)} ${nFaltas === 1 ? "faltou" : "faltaram"} nesta semana e ainda não ${nFaltas === 1 ? "remarcou" : "remarcaram"}.`,
    acao: "Chamar para remarcar", pedido: `Prepara uma mensagem de WhatsApp simpática para remarcar o horário de quem faltou nos últimos 7 dias: ${d.faltas.join(", ")}.`,
  });
  // pacote no último uso
  if (d.pacotes?.q && q.comPacotes) dicas.push({
    id: "pacotes", icone: Ticket, tom: "lilas",
    texto: `O pacote de ${nomesEMais(d.pacotes.nomes, d.pacotes.q)} acaba no próximo uso. Boa hora para oferecer a renovação.`,
    acao: "Ver os pacotes", href: "/gestao/app/pacotes",
  });
  // aniversário nos próximos 7 dias
  const nNiver = Math.max(d.niver_q, d.niver.length);
  if (nNiver) dicas.push({
    id: "niver", icone: Cake, tom: "manteiga",
    texto: nNiver === 1
      ? `${d.niver[0].nome} faz aniversário ${d.niver[0].em === 0 ? "hoje" : d.niver[0].em === 1 ? "amanhã" : `${nomeDia(somaDias(q.hoje, d.niver[0].em))}`}. Um parabéns no WhatsApp costuma ser bem recebido.`
      : `${nomesEMais(d.niver.map((x) => x.nome), nNiver)} fazem aniversário nos próximos dias.`,
    acao: "Preparar os parabéns", pedido: `Prepara uma mensagem curta de parabéns no WhatsApp para o aniversário de: ${d.niver.map((x) => x.nome).join(", ")}.`,
  });
  // amanhã aberto e com pouca coisa marcada
  if (q.abreAmanha && d.amanha <= 2 && d.vieram >= 3) dicas.push({
    id: "amanha", icone: CalendarPlus, tom: "pessego",
    texto: d.amanha === 0 ? "Amanhã ainda não tem nenhum horário marcado." : `Amanhã tem só ${d.amanha === 1 ? "1 horário marcado" : "2 horários marcados"}.`,
    acao: "Ver quem chamar", pedido: "Amanhã a agenda está fraca. Quem está há mais tempo sem vir e eu poderia chamar para amanhã?",
  });
  return dicas;
}
const CHAVE = "maestro-gestao-dicas";

/**
 * O que o Mozart reparou olhando os dados do pet shop: quem sumiu, quem faltou, pacote acabando,
 * aniversário e dia fraco na agenda. Tudo calculado no navegador com dados reais; cada dica leva a uma ação.
 */
export default function DicasMozart({ semDicas = [], doBanco }: {
  /** Dicas que a tela já mostra de outro jeito (ex.: a linha que abre direto a lista de quem chamar). */
  semDicas?: string[];
  /** As contas já feitas no banco (tela Hoje, `gestao_hoje_extras`): com elas, este cartão não busca nada. Sem elas (banco antes da atualização), lê e conta aqui. */
  doBanco?: DicasDoBanco | null;
}) {
  const { sb, petshop, posso } = useGestao();
  const vejoPacotes = posso("pacotes");
  const hoje = inicioDoDia(new Date());
  const hojeIso = isoDia(hoje);
  const [escondidas, setEscondidas] = useState<string[]>([]);

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(CHAVE) ?? "{}") as { dia?: string; ids?: string[] };
      if (g.dia === hojeIso && Array.isArray(g.ids)) setEscondidas(g.ids);
    } catch { /* sem memória, mostra tudo */ }
  }, [hojeIso]);

  const esconder = (id: string) => {
    const ids = [...escondidas, id];
    setEscondidas(ids);
    try { localStorage.setItem(CHAVE, JSON.stringify({ dia: hojeIso, ids })); } catch { /* tudo bem */ }
  };

  const { dados: lidas } = useDados(async (): Promise<Dica[] | null> => {
    // as contas vieram do banco: nada a buscar
    if (doBanco !== undefined) return null;
    const amanha = somaDias(hoje, 1);
    // dos últimos 150 dias só importam os concluídos (quem parou de vir) e as faltas (quem não remarcou): o resto nem desce
    const [passados, futuros, pacotes, pets] = await Promise.all([
      lerTudo((de, ate, contar) => sb.from("agendamentos").select("pet_id, inicio, status, pets(nome, ativo)", contando(contar)).eq("petshop_id", petshop.id).in("status", ["concluido", "faltou"]).gte("inicio", somaDias(hoje, -150).toISOString()).lt("inicio", amanha.toISOString()).order("inicio", { ascending: false }).order("id").range(de, ate)).then((data) => ({ data })),
      lerTudo((de, ate, contar) => sb.from("agendamentos").select("pet_id, inicio, status", contando(contar)).eq("petshop_id", petshop.id).gte("inicio", hoje.toISOString()).lt("inicio", somaDias(hoje, 60).toISOString()).order("inicio").order("id").range(de, ate)).then((data) => ({ data })),
      // pacote é assunto de quem cuida de pacotes
      vejoPacotes ? sb.from("pacotes_clientes").select("total, usados, pets(nome)").eq("petshop_id", petshop.id).eq("ativo", true).limit(500) : Promise.resolve({ data: [] }),
      lerTudo((de, ate, contar) => sb.from("pets").select("nome, nascimento", contando(contar)).eq("petshop_id", petshop.id).eq("ativo", true).not("nascimento", "is", null).order("id").range(de, ate)).then((data) => ({ data })),
    ]);
    type Ag = { pet_id: string; inicio: string; status: string; pets?: { nome: string; ativo: boolean } | null };
    const antes = (passados.data ?? []) as unknown as Ag[];
    const depois = ((futuros.data ?? []) as Ag[]).filter((a) => !["cancelado", "faltou"].includes(a.status));
    const comFuturo = new Set(depois.map((a) => a.pet_id));
    // quem vinha e parou: última visita concluída entre 30 e 150 dias atrás e nada marcado
    const ultima = new Map<string, Ag>();
    for (const a of antes) if (a.status === "concluido" && !ultima.has(a.pet_id)) ultima.set(a.pet_id, a);
    const limite = somaDias(hoje, -30).getTime();
    const sumidos = [...ultima.values()].filter((a) => a.pets?.ativo && new Date(a.inicio).getTime() < limite && !comFuturo.has(a.pet_id));
    // faltou nos últimos 7 dias e não remarcou
    const semana = somaDias(hoje, -7).getTime();
    const faltas = antes.filter((a) => a.status === "faltou" && new Date(a.inicio).getTime() >= semana && a.pets?.ativo && !comFuturo.has(a.pet_id));
    const nomesFalta = [...new Set(faltas.map((a) => a.pets!.nome))];
    // pacote no último uso
    const acabando = ((pacotes.data ?? []) as unknown as { total: number; usados: number; pets: { nome: string } | null }[]).filter((p) => p.total - p.usados === 1 && p.pets);
    // aniversário nos próximos 7 dias
    const niver = ((pets.data ?? []) as { nome: string; nascimento: string }[]).map((p) => {
      const n = deIsoDia(p.nascimento);
      let d = new Date(hoje.getFullYear(), n.getMonth(), n.getDate());
      if (d < hoje) d = new Date(hoje.getFullYear() + 1, n.getMonth(), n.getDate());
      return { nome: p.nome, em: Math.round((d.getTime() - hoje.getTime()) / 864e5) };
    }).filter((p) => p.em <= 7).sort((a, b) => a.em - b.em);
    const deAmanha = depois.filter((a) => isoDia(new Date(a.inicio)) === isoDia(amanha)).length;
    return montarDicas({
      sumidos: { q: sumidos.length, nomes: sumidos.map((a) => a.pets!.nome) },
      faltas: nomesFalta, faltas_q: nomesFalta.length,
      niver, niver_q: niver.length,
      amanha: deAmanha, vieram: ultima.size,
      pacotes: { q: acabando.length, nomes: acabando.map((p) => p.pets!.nome) },
    }, { hoje, abreAmanha: Boolean(horarioDoDia(petshop.horario, amanha)), comPacotes: usaModulo(petshop, "pacotes") });
  }, [petshop.id, hojeIso, vejoPacotes, doBanco === undefined]);
  const dados = doBanco ? montarDicas(doBanco, { hoje, abreAmanha: Boolean(horarioDoDia(petshop.horario, somaDias(hoje, 1))), comPacotes: usaModulo(petshop, "pacotes") }) : lidas;

  const visiveis = (dados ?? []).filter((d) => !escondidas.includes(d.id) && !semDicas.includes(d.id)).slice(0, 3);
  if (!visiveis.length) return null;

  return (
    <section className="g-dicas">
      <div className="g-card-t">
        <h2><Selo tamanho={30} tom="verde" />O Mozart reparou</h2>
        <span className="g-muted g-pp">{visiveis.length === 1 ? "1 dica" : `${visiveis.length} dicas`}</span>
      </div>
      <div className="g-dicas-lista">
        {visiveis.map((d) => (
          <div key={d.id} className="g-dica">
            <Tile icone={d.icone} tom={d.tom} />
            <div className="corpo">
              <p>{d.texto}</p>
              {d.href ? <Link className="g-btn p verde" href={d.href}>{d.acao}</Link>
                : <button className="g-btn p verde" onClick={() => abrirAssistente(d.pedido)}>{d.acao}</button>}
            </div>
            <button className="g-ico fechar" aria-label="Dispensar esta dica por hoje" title="Dispensar por hoje" onClick={() => esconder(d.id)}><X /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
