"use client";

import Link from "@/components/gestao/link-depois";
import { ChevronRight, Clock, Lock } from "lucide-react";
import type { Petshop } from "@/lib/gestao/tipos";
import { brl, dataCurta, hora, inicioDoDia, nomeDia } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { Tile } from "./painel";
import { useDados } from "./ui";

const ASSINATURA = "/gestao/app/assinatura";
/** O cartão aparece nos 2 últimos dias do teste e no dia em que ele acaba. */
export const DIAS_DE_AVISO = 2;

/** Quando o teste termina, em dias de calendário (0 = hoje, 1 = amanhã). `null` fora do teste. */
export function fimDoTeste(petshop: Pick<Petshop, "status" | "teste_ate">, agora = new Date()) {
  if (petshop.status !== "teste") return null;
  const fim = new Date(petshop.teste_ate);
  const dias = Math.round((inicioDoDia(fim).getTime() - inicioDoDia(agora).getTime()) / 864e5);
  const vencido = fim.getTime() <= agora.getTime();
  const quando = vencido ? `em ${dataCurta(fim)}`
    : dias === 0 ? `hoje, às ${hora(fim)}`
      : dias === 1 ? `amanhã, ${dataCurta(fim)}, às ${hora(fim)}`
        : `${nomeDia(fim)}, ${dataCurta(fim)}`;
  return { fim, dias, vencido, quando };
}
export const chaveAgoraNao = (petshopId: string) => `maestro-gestao-teste-agora-nao-${petshopId}`;

/**
 * O que acontece depois do teste: o mesmo que a tela Assinatura, o Manual e o banco (`acesso_liberado`) dizem.
 * Acabou o teste, a conta fica só para consulta (com ou sem link de pagamento cadastrado: sem link, assina-se pelo WhatsApp).
 */
export const TEXTO_TESTE = {
  seNaoAssinar: "Se você não assinar, a conta fica só para consulta: você continua vendo o que lançou, mas não consegue marcar, lançar nem alterar. Os dados continuam guardados e, para voltar a usar, é só assinar.",
  soConsulta: "A conta está só para consulta: você continua vendo o que lançou, mas não consegue marcar, lançar nem alterar. Os dados continuam guardados e, para voltar a usar, é só assinar.",
  nadaCobrado: "Nada é cobrado sozinho no fim do teste: o teste não pede cartão.",
};

/**
 * Aviso de fim de teste na tela Hoje.
 * `cartao`: destaque, para o dono (dispensável por dia enquanto o teste vale; fixo depois que venceu).
 * `linha`: o dono dispensou hoje; fica só o atalho. `equipe`: uma linha para quem não é dono.
 */
export default function FimDoTeste({ modo, numeros, aoDispensar }: {
  modo: "cartao" | "linha" | "equipe";
  /** O que a tela Hoje já contou. */
  numeros: { pets: number; horarios: number; concluidos: number } | null;
  aoDispensar: () => void;
}) {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const teste = fimDoTeste(petshop);
  const cartao = modo === "cartao";
  // dinheiro lançado: só entradas recebidas, sem contar movimentos internos do caixa
  const { dados: dinheiro } = useDados(async () => {
    if (!cartao || !cuidoDoFinanceiro) return 0;
    const { data } = await sb.from("lancamentos").select("valor").eq("petshop_id", petshop.id).eq("tipo", "entrada").eq("pago", true).is("movimento", null).limit(5000);
    return (data ?? []).reduce((s, l) => s + Number(l.valor), 0);
  }, [petshop.id, cartao, cuidoDoFinanceiro]);
  if (!teste) return null;

  if (modo === "equipe") {
    if (teste.vencido) return null;
    return <p className="g-ret-linha parada"><Clock aria-hidden /><span>O teste grátis do pet shop termina {teste.quando}. Para continuar usando depois, fale com o dono.</span></p>;
  }
  if (modo === "linha") {
    return (
      <Link className="g-ret-linha" href={ASSINATURA}>
        <Clock aria-hidden /><span>{teste.vencido ? `Seu teste grátis terminou ${teste.quando}. A conta está só para consulta.` : `Seu teste grátis termina ${teste.quando}.`} <b>Ver assinatura</b></span><ChevronRight aria-hidden />
      </Link>
    );
  }

  const n = (q: number, um: string, varios: string) => (q === 1 ? `1 ${um}` : `${q.toLocaleString("pt-BR")} ${varios}`);
  const feito = numeros ? [
    numeros.pets > 0 && n(numeros.pets, "pet cadastrado", "pets cadastrados"),
    numeros.horarios > 0 && n(numeros.horarios, "horário marcado", "horários marcados"),
    numeros.concluidos > 0 && n(numeros.concluidos, "atendimento concluído", "atendimentos concluídos"),
    (dinheiro ?? 0) > 0 && `${brl(dinheiro)} em entradas lançadas`,
  ].filter(Boolean) as string[] : null;
  // vencido: o banco já recusa gravar
  const bloqueado = teste.vencido;

  return (
    <section className={`g-card g-ret-teste${bloqueado ? " vencido bloqueado" : ""}`} aria-label="Teste grátis" role={bloqueado ? "alert" : undefined}>
      <div className="g-ret-cab">
        <Tile icone={bloqueado ? Lock : Clock} tom={bloqueado ? "rosa" : "pessego"} tamanho="g" />
        <div>
          <p className="g-rotulo">Teste grátis</p>
          <h2>{teste.vencido ? `Seu teste grátis terminou ${teste.quando}` : `Seu teste grátis termina ${teste.quando}`}</h2>
        </div>
      </div>

      {feito && (feito.length ? (
        <div className="g-pilha p">
          <p className="g-p">{bloqueado ? "O que você colocou no sistema continua aqui:" : "O que você já colocou no sistema:"}</p>
          <ul className="g-ret-feito">{feito.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : (
        <p className="g-p">{bloqueado
          ? "Você ainda não chegou a lançar nada por aqui. Quando voltar, a conta está do jeito que você deixou."
          : "Ainda dá tempo de experimentar: cadastre um pet e marque um horário para ver como o seu dia fica na tela."}</p>
      ))}

      <p className="g-p g-ret-explica">
        {teste.vencido ? TEXTO_TESTE.soConsulta : `${TEXTO_TESTE.seNaoAssinar} ${TEXTO_TESTE.nadaCobrado}`}
      </p>

      <div className="g-fila">
        <Link className="g-btn verde" href={ASSINATURA}>Ver assinatura</Link>
        {!bloqueado && <button className="g-btn fantasma" onClick={aoDispensar}>Agora não</button>}
      </div>
    </section>
  );
}

/**
 * Teste grátis no meio do caminho (antes dos 2 últimos dias): uma linha calma na tela Hoje, para o dono, com os dias que
 * faltam, o que já está pronto e o próximo passo. Some quando o cartão de fim de teste aparece.
 */
export function ProgressoDoTeste({ numeros, proximo }: {
  numeros: { pets: number; horarios: number } | null;
  /** O próximo dos Primeiros passos, quando há. */
  proximo: { texto: string; href?: string; aoTocar?: () => void } | null;
}) {
  const { petshop, servicos } = useGestao();
  const teste = fimDoTeste(petshop);
  if (!teste || teste.vencido || teste.dias <= DIAS_DE_AVISO || !numeros) return null;
  const n = (q: number, um: string, varios: string) => (q === 1 ? `1 ${um}` : `${q} ${varios}`);
  const comPreco = servicos.some((s) => s.ativo && [s.preco_p, s.preco_m, s.preco_g, s.preco_gg].some((v) => v != null));
  const pronto = [
    comPreco && "preços dos serviços",
    numeros.pets > 0 && n(numeros.pets, "pet", "pets"),
    numeros.horarios > 0 && n(numeros.horarios, "horário marcado", "horários marcados"),
    petshop.link_ativo && "link do cliente ligado",
  ].filter(Boolean) as string[];
  const passo = proximo && (proximo.href
    ? <Link className="g-link alvo" href={proximo.href} onClick={proximo.aoTocar}>{proximo.texto}</Link>
    : <button type="button" className="g-link alvo" onClick={proximo.aoTocar}>{proximo.texto}</button>);
  return (
    <section className="g-ret-linha g-ret-progresso" aria-label="Teste grátis">
      <Clock aria-hidden />
      <span>
        <b>Teste grátis: faltam {teste.dias} dias</b> (até {teste.quando}).{" "}
        {pronto.length ? `Já está pronto: ${pronto.join(", ")}.` : "Ainda não tem nada lançado."}
        {passo && <> Próximo passo: {passo}.</>}
      </span>
      <Link className="g-ico" href={ASSINATURA} aria-label="Ver assinatura" title="Ver assinatura"><ChevronRight aria-hidden /></Link>
    </section>
  );
}
