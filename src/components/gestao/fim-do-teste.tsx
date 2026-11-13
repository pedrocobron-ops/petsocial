"use client";

import Link from "next/link";
import { ChevronRight, Clock, Lock } from "lucide-react";
import type { Petshop } from "@/lib/gestao/tipos";
import { temCheckout } from "@/lib/gestao/planos";
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

/** O que acontece depois do teste: o mesmo que a tela Assinatura e os Termos dizem. */
const SE_NAO_ASSINAR = "Se você não assinar, a conta fica só para consulta: você continua vendo o que lançou, mas não consegue marcar, lançar nem alterar. Os dados continuam guardados e, para voltar a usar, é só assinar.";

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
    return <p className="g-ret-linha parada"><Clock aria-hidden /><span>O teste grátis do pet shop termina {teste.quando}. Para continuar usando depois, fale com o dono.</span></p>;
  }
  if (modo === "linha") {
    return (
      <Link className="g-ret-linha" href={ASSINATURA}>
        <Clock aria-hidden /><span>Seu teste grátis termina {teste.quando}. <b>{temCheckout() ? "Ver os planos" : "Ver a assinatura"}</b></span><ChevronRight aria-hidden />
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
  const abre = temCheckout();

  return (
    <section className={`g-card g-ret-teste${teste.vencido ? " vencido" : ""}`} aria-label="Teste grátis">
      <div className="g-ret-cab">
        <Tile icone={teste.vencido ? Lock : Clock} tom={teste.vencido ? "manteiga" : "pessego"} tamanho="g" />
        <div>
          <p className="g-rotulo">Teste grátis</p>
          <h2>{teste.vencido ? `Seu teste grátis terminou ${teste.quando}` : `Seu teste grátis termina ${teste.quando}`}</h2>
        </div>
      </div>

      {feito && (feito.length ? (
        <div className="g-pilha p">
          <p className="g-p">{teste.vencido ? "O que você colocou no sistema continua aqui:" : "O que você já colocou no sistema:"}</p>
          <ul className="g-ret-feito">{feito.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : (
        <p className="g-p">{teste.vencido
          ? "Você ainda não chegou a lançar nada por aqui. Quando voltar, a conta está do jeito que você deixou."
          : "Ainda dá tempo de experimentar: cadastre um pet e marque um horário para ver como o seu dia fica na tela."}</p>
      ))}

      <p className="g-p g-ret-explica">
        {abre
          ? (teste.vencido ? "A conta está só para consulta: você continua vendo o que lançou, mas não consegue marcar, lançar nem alterar. Os dados continuam guardados e, para voltar a usar, é só assinar." : SE_NAO_ASSINAR)
          : (teste.vencido
            ? "A assinatura ainda não abriu. Até ela abrir, você continua usando o sistema normalmente, sem pagar nada, e os seus dados ficam guardados."
            : "A assinatura ainda não abriu. Até ela abrir, você continua usando o sistema normalmente, sem pagar nada. Avisamos por aqui quando os planos estiverem disponíveis.")}
      </p>

      <div className="g-fila">
        <Link className="g-btn verde" href={ASSINATURA}>{abre ? "Ver os planos" : "Ver a assinatura"}</Link>
        {!teste.vencido && <button className="g-btn fantasma" onClick={aoDispensar}>Agora não</button>}
      </div>
    </section>
  );
}
