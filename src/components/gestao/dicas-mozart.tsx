"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Cake, CalendarPlus, MessageCircle, Ticket, UserX, X } from "lucide-react";
import { deIsoDia, horarioDoDia, inicioDoDia, isoDia, nomeDia, somaDias } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { usaModulo } from "@/lib/gestao/modulos";
import { Selo } from "./marca";
import { Tile, type Tom } from "./painel";
import { abrirAssistente, useDados } from "./ui";
import "./dicas-mozart.css";

type Dica = { id: string; icone: React.ComponentType<{ size?: number }>; tom: Tom; texto: string; acao: string; pedido?: string; href?: string };

const lista = (nomes: string[]) => (nomes.length <= 2 ? nomes.join(" e ") : `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`);
const CHAVE = "maestro-gestao-dicas";

/**
 * O que o Mozart reparou olhando os dados do pet shop: quem sumiu, quem faltou, pacote acabando,
 * aniversário e dia fraco na agenda. Tudo calculado no navegador com dados reais; cada dica leva a uma ação.
 */
export default function DicasMozart({ semDicas = [] }: {
  /** Dicas que a tela já mostra de outro jeito (ex.: a linha que abre direto a lista de quem chamar). */
  semDicas?: string[];
}) {
  const { sb, petshop } = useGestao();
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

  const { dados } = useDados(async (): Promise<Dica[]> => {
    const amanha = somaDias(hoje, 1);
    const [passados, futuros, pacotes, pets] = await Promise.all([
      sb.from("agendamentos").select("pet_id, inicio, status, pets(nome, ativo)").eq("petshop_id", petshop.id).gte("inicio", somaDias(hoje, -150).toISOString()).lt("inicio", amanha.toISOString()).order("inicio", { ascending: false }).limit(3000),
      sb.from("agendamentos").select("pet_id, inicio, status").eq("petshop_id", petshop.id).gte("inicio", hoje.toISOString()).lt("inicio", somaDias(hoje, 60).toISOString()).limit(3000),
      sb.from("pacotes_clientes").select("total, usados, pets(nome)").eq("petshop_id", petshop.id).eq("ativo", true).limit(500),
      sb.from("pets").select("nome, nascimento").eq("petshop_id", petshop.id).eq("ativo", true).not("nascimento", "is", null).limit(2000),
    ]);
    type Ag = { pet_id: string; inicio: string; status: string; pets?: { nome: string; ativo: boolean } | null };
    const antes = (passados.data ?? []) as unknown as Ag[];
    const depois = ((futuros.data ?? []) as Ag[]).filter((a) => !["cancelado", "faltou"].includes(a.status));
    const comFuturo = new Set(depois.map((a) => a.pet_id));
    const dicas: Dica[] = [];

    // quem vinha e parou: última visita concluída entre 30 e 150 dias atrás e nada marcado
    const ultima = new Map<string, Ag>();
    for (const a of antes) if (a.status === "concluido" && !ultima.has(a.pet_id)) ultima.set(a.pet_id, a);
    const limite = somaDias(hoje, -30).getTime();
    const sumidos = [...ultima.values()].filter((a) => a.pets?.ativo && new Date(a.inicio).getTime() < limite && !comFuturo.has(a.pet_id));
    if (sumidos.length) dicas.push({
      id: "sumidos", icone: MessageCircle, tom: "menta",
      texto: `${lista(sumidos.map((a) => a.pets!.nome))} ${sumidos.length === 1 ? "não vem" : "não vêm"} há mais de um mês e não ${sumidos.length === 1 ? "tem" : "têm"} horário marcado.`,
      acao: "Preparar as mensagens", pedido: "Prepara uma mensagem de WhatsApp chamando de volta quem não vem há mais de um mês e não tem horário marcado.",
    });

    // faltou nos últimos 7 dias e não remarcou
    const semana = somaDias(hoje, -7).getTime();
    const faltas = antes.filter((a) => a.status === "faltou" && new Date(a.inicio).getTime() >= semana && a.pets?.ativo && !comFuturo.has(a.pet_id));
    const nomesFalta = [...new Set(faltas.map((a) => a.pets!.nome))];
    if (nomesFalta.length) dicas.push({
      id: "faltas", icone: UserX, tom: "rosa",
      texto: `${lista(nomesFalta)} ${nomesFalta.length === 1 ? "faltou" : "faltaram"} nesta semana e ainda não ${nomesFalta.length === 1 ? "remarcou" : "remarcaram"}.`,
      acao: "Chamar para remarcar", pedido: `Prepara uma mensagem de WhatsApp simpática para remarcar o horário de quem faltou nos últimos 7 dias: ${nomesFalta.join(", ")}.`,
    });

    // pacote no último uso
    const acabando = ((pacotes.data ?? []) as unknown as { total: number; usados: number; pets: { nome: string } | null }[]).filter((p) => p.total - p.usados === 1 && p.pets);
    if (acabando.length && usaModulo(petshop, "pacotes")) dicas.push({
      id: "pacotes", icone: Ticket, tom: "lilas",
      texto: `O pacote de ${lista(acabando.map((p) => p.pets!.nome))} acaba no próximo uso. Boa hora para oferecer a renovação.`,
      acao: "Ver os pacotes", href: "/gestao/app/pacotes",
    });

    // aniversário nos próximos 7 dias
    const niver = ((pets.data ?? []) as { nome: string; nascimento: string }[]).map((p) => {
      const n = deIsoDia(p.nascimento);
      let d = new Date(hoje.getFullYear(), n.getMonth(), n.getDate());
      if (d < hoje) d = new Date(hoje.getFullYear() + 1, n.getMonth(), n.getDate());
      return { nome: p.nome, em: Math.round((d.getTime() - hoje.getTime()) / 864e5), dia: d };
    }).filter((p) => p.em <= 7).sort((a, b) => a.em - b.em);
    if (niver.length) dicas.push({
      id: "niver", icone: Cake, tom: "manteiga",
      texto: niver.length === 1
        ? `${niver[0].nome} faz aniversário ${niver[0].em === 0 ? "hoje" : niver[0].em === 1 ? "amanhã" : `${nomeDia(niver[0].dia)}`}. Um parabéns no WhatsApp costuma ser bem recebido.`
        : `${lista(niver.map((p) => p.nome))} fazem aniversário nos próximos dias.`,
      acao: "Preparar os parabéns", pedido: `Prepara uma mensagem curta de parabéns no WhatsApp para o aniversário de: ${niver.map((p) => p.nome).join(", ")}.`,
    });

    // amanhã aberto e com pouca coisa marcada
    const abreAmanha = horarioDoDia(petshop.horario, amanha);
    const deAmanha = depois.filter((a) => isoDia(new Date(a.inicio)) === isoDia(amanha)).length;
    if (abreAmanha && deAmanha <= 2 && ultima.size >= 3) dicas.push({
      id: "amanha", icone: CalendarPlus, tom: "pessego",
      texto: deAmanha === 0 ? "Amanhã ainda não tem nenhum horário marcado." : `Amanhã tem só ${deAmanha === 1 ? "1 horário marcado" : "2 horários marcados"}.`,
      acao: "Ver quem chamar", pedido: "Amanhã a agenda está fraca. Quem está há mais tempo sem vir e eu poderia chamar para amanhã?",
    });

    return dicas;
  }, [petshop.id, hojeIso]);

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
