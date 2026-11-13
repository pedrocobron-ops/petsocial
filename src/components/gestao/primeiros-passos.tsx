"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, ListChecks, PartyPopper } from "lucide-react";
import { useGestao } from "./contexto";
import { Tile } from "./painel";
import { Folha } from "./ui";
import { abrirLinkDeAgendamento, guardarLembrado, lerLembrado } from "./lembrado";
import { nomeDaCasa, usaCasa, usaModulo } from "@/lib/gestao/modulos";

export type DadosDosPassos = { pets: number; horarios: number; concluidos: number; lembretes: number; amanha: number; estadias: number; produtos: number };
type Passo = {
  id: string; texto: string; dica: string; feito: boolean; opcional?: boolean;
  href?: string; aoTocar?: () => void;
};

/**
 * Primeiros passos: o que falta fazer, tirado dos dados reais da conta, só com o que a pessoa pode fazer.
 * O estado fica no aparelho: "visto" (já apareceu faltando algo), "dispensado" (Já sei usar) ou "feito".
 */
export function usePrimeirosPassos(dados: DadosDosPassos | null, aoLembretes: () => void) {
  const { petshop, servicos, souDono, posso, liberado } = useGestao();
  const chave = `maestro-gestao-passos-${petshop.id}`;
  const chaveEscola = `${chave}-escola`;
  const [mem, setMem] = useState(() => lerLembrado(chave));
  const [escola, setEscola] = useState(() => lerLembrado(chaveEscola) === "1");

  const ativos = servicos.filter((s) => s.ativo);
  const temPreco = ativos.some((s) => s.preco_p != null || s.preco_m != null || s.preco_g != null || s.preco_gg != null);
  // os passos seguem o que o negócio faz: banho e tosa passa pela agenda; creche e hotel, pelo check-in; loja, pelo estoque
  const banho = usaModulo(petshop, "banho_tosa"), casa = usaCasa(petshop), loja = usaModulo(petshop, "loja");
  const agenda = posso("agenda") && banho;
  const soCasa = casa && !banho, soLoja = loja && !banho && !casa;
  const temDiaria = (!usaModulo(petshop, "creche") || petshop.diaria_creche != null) && (!usaModulo(petshop, "hotel") || petshop.diaria_hotel != null);
  const todos: (Passo & { so: boolean })[] = dados ? [
    { id: "precos", so: souDono && banho && ativos.length > 0, feito: temPreco, texto: "Colocar os preços dos serviços", dica: "Em Meu pet shop, na parte Serviços e preços.", href: "/gestao/app/meu-petshop" },
    { id: "diaria", so: souDono && soCasa, feito: temDiaria, texto: "Colocar o preço da diária", dica: `Em Meu pet shop, na parte ${nomeDaCasa(petshop)}.`, href: "/gestao/app/meu-petshop" },
    { id: "pet", so: posso("clientes"), feito: dados.pets > 0, texto: "Cadastrar o primeiro pet", dica: "Em Clientes e pets, no botão de novo pet.", href: "/gestao/app/clientes" },
    { id: "checkin", so: soCasa && posso("creche_hotel"), feito: dados.estadias > 0, texto: "Fazer o primeiro check-in", dica: `Em ${nomeDaCasa(petshop)}, no botão Nova reserva / Check-in.`, href: "/gestao/app/creche-hotel" },
    { id: "produto", so: soLoja && posso("estoque"), feito: dados.produtos > 0, texto: "Cadastrar o primeiro produto", dica: "Em Estoque, no botão de produto novo.", href: "/gestao/app/estoque" },
    { id: "horario", so: agenda, feito: dados.horarios > 0, texto: "Marcar o primeiro horário", dica: "Já abre a janela para marcar.", href: "/gestao/app/agenda?novo=1" },
    { id: "concluir", so: agenda, feito: dados.concluidos > 0, texto: "Concluir e receber um atendimento", dica: "Na Agenda, toque no horário e em Concluir.", href: "/gestao/app/agenda" },
    { id: "link", so: souDono && agenda, feito: petshop.link_ativo, texto: "Ligar o link de agendamento", dica: "O cliente pede o horário pelo celular e você aceita.", aoTocar: abrirLinkDeAgendamento },
    dados.amanha > 0
      ? { id: "lembrete", so: agenda, feito: dados.lembretes > 0, texto: "Mandar um lembrete de WhatsApp", dica: "Abre os lembretes dos horários de amanhã.", aoTocar: aoLembretes }
      : { id: "lembrete", so: agenda, feito: dados.lembretes > 0, texto: "Mandar um lembrete de WhatsApp", dica: "Na Agenda, pelo botão do WhatsApp ao lado do horário.", href: "/gestao/app/agenda" },
    { id: "marca", so: souDono, opcional: true, feito: Boolean(petshop.logo) || petshop.tema !== "floresta", texto: "Colocar a sua logo e as suas cores", dica: "Em Meu pet shop.", href: "/gestao/app/meu-petshop" },
    { id: "escola", so: souDono, opcional: true, feito: escola, texto: "Conhecer a Escola de Gestão", dica: "Aulas gratuitas para o dia a dia do pet shop.", href: "/gestao/app/escola", aoTocar: () => { guardarLembrado(chaveEscola, "1"); setEscola(true); } },
  ] : [];
  const passos: Passo[] = todos.filter((p) => p.so);
  const principais = passos.filter((p) => !p.opcional);
  const feitos = principais.filter((p) => p.feito).length;
  const completo = principais.length > 0 && feitos === principais.length;
  const pronto = Boolean(dados);

  useEffect(() => {
    if (!pronto || !liberado || mem === "dispensado" || mem === "feito") return;
    if (!completo) { if (mem !== "visto") { guardarLembrado(chave, "visto"); setMem("visto"); } return; }
    // tudo feito: quem acompanhou os passos vê a comemoração uma vez (fica na tela até sair dela); conta antiga não vê nada
    guardarLembrado(chave, "feito");
    if (mem !== "visto") setMem("feito");
  }, [pronto, liberado, completo, mem, chave]);

  const estado: "ativo" | "comemora" | "some" =
    !pronto || !liberado || !principais.length || mem === "dispensado" || mem === "feito" ? "some"
      : completo ? (mem === "visto" ? "comemora" : "some") : "ativo";
  return {
    estado, passos, principais, feitos, total: principais.length,
    proximo: principais.find((p) => !p.feito) ?? null,
    dispensar: () => { guardarLembrado(chave, "dispensado"); setMem("dispensado"); },
    fechar: () => setMem("feito"),
  };
}
type Passos = ReturnType<typeof usePrimeirosPassos>;

function Linha({ p, n, destaque, aoIr }: { p: Passo; n: number | null; destaque: boolean; aoIr?: () => void }) {
  const dentro = (
    <>
      <span className="n">{p.feito ? <Check aria-label="Feito" /> : n}</span>
      <span className="t"><b>{p.texto}</b>{!p.feito && <small>{p.dica}</small>}</span>
      {!p.feito && <ChevronRight size={18} aria-hidden />}
    </>
  );
  const classe = `g-pps-passo${p.feito ? " feito" : ""}${destaque ? " agora" : ""}`;
  const tocar = () => { p.aoTocar?.(); aoIr?.(); };
  return p.href ? <Link className={classe} href={p.href} onClick={tocar}>{dentro}</Link>
    : <button type="button" className={classe} onClick={tocar}>{dentro}</button>;
}

/** `curto`: só os próximos três passos; o resto aparece como uma linha de "depois", para a tela não assustar. */
function Lista({ pp, aoIr, curto = false }: { pp: Passos; aoIr?: () => void; curto?: boolean }) {
  const [tudo, setTudo] = useState(false);
  const faltam = pp.principais.filter((p) => !p.feito);
  const resumido = curto && !tudo && faltam.length > 3;
  const visiveis = resumido ? faltam.slice(0, 3) : pp.principais;
  const opcionais = resumido ? [] : pp.passos.filter((p) => p.opcional);
  return (
    <>
      <div className="g-prog" role="img" aria-label={`${pp.feitos} de ${pp.total} passos feitos`}><i style={{ width: `${(pp.feitos / pp.total) * 100}%` }} /></div>
      <div className="g-pps-lista">
        {visiveis.map((p) => <Linha key={p.id} p={p} n={pp.principais.indexOf(p) + 1} destaque={p.id === pp.proximo?.id} aoIr={aoIr} />)}
      </div>
      {resumido && <div><button type="button" className="g-link g-p" onClick={() => setTudo(true)}>Ver os {pp.total} passos</button></div>}
      {opcionais.length > 0 && (
        <div className="g-pilha p">
          <p className="g-rotulo">Se quiser, depois</p>
          <div className="g-pps-lista">
            {opcionais.map((p) => <Linha key={p.id} p={p} n={null} destaque={false} aoIr={aoIr} />)}
          </div>
        </div>
      )}
    </>
  );
}

/** `cartao`: em destaque na tela Hoje. `linha`: outro cartão está em destaque; fica um atalho que abre a lista. */
export default function PrimeirosPassos({ pp, modo, curto = false }: { pp: Passos; modo: "cartao" | "linha"; curto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  if (pp.estado === "some") return null;

  if (pp.estado === "comemora") {
    return (
      <section className="g-card menta g-pps-festa" role="status">
        <Tile icone={PartyPopper} tom="menta" tamanho="g" />
        <div className="g-cresce">
          <h2>Primeiros passos concluídos</h2>
          <p className="g-p">Você já passou por cada parte do dia a dia do sistema. Se quiser rever alguma coisa, a Ajuda fica no menu.</p>
        </div>
        <button className="g-btn sec" onClick={pp.fechar}>Fechar</button>
      </section>
    );
  }

  if (modo === "linha") {
    return (
      <>
        <button type="button" className="g-ret-linha" onClick={() => setAberto(true)}>
          <ListChecks aria-hidden />
          <span><b>Primeiros passos: {pp.feitos} de {pp.total}.</b>{pp.proximo ? ` Falta: ${pp.proximo.texto.toLowerCase()}.` : ""}</span>
          <ChevronRight aria-hidden />
        </button>
        {aberto && (
          <Folha titulo={`Primeiros passos: ${pp.feitos} de ${pp.total}`} aoFechar={() => setAberto(false)}>
            <div className="g-pilha g-pps na-folha"><Lista pp={pp} aoIr={() => setAberto(false)} /></div>
          </Folha>
        )}
      </>
    );
  }

  return (
    <section className="g-card g-pps" aria-label="Primeiros passos">
      <div className="g-ret-cab">
        <Tile icone={ListChecks} tom="menta" tamanho="g" />
        <div className="g-cresce">
          <h2>Primeiros passos</h2>
          <p className="g-muted g-p">Um toque leva direto ao lugar. Cada passo se marca sozinho quando você faz.</p>
        </div>
        <p className="g-pps-conta" aria-hidden><b>{pp.feitos}</b> de {pp.total}</p>
      </div>
      <Lista pp={pp} curto={curto} />
      <div><button type="button" className="g-btn fantasma g-pps-sei" onClick={pp.dispensar}>Já sei usar</button></div>
    </section>
  );
}
