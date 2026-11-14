"use client";

import { BedDouble, CalendarDays, Check, Package, PawPrint, Scissors, Sun } from "lucide-react";
import { MODULOS, NOME_DA_AREA, TELA_DA_AREA, areasParaPrincipal, principalDe, type Principal } from "@/lib/gestao/modulos";
import LogoLoja from "./logo-loja";
import { Selo } from "./marca";
import "./boas-vindas.css";

/**
 * Boas-vindas do primeiro acesso: o Mozart conhece o negócio, uma pergunta por tela.
 * Nome e o que o negócio faz ficam em /gestao/comecar (o pet shop ainda não existe); cor e logo, nos primeiros
 * passos do guia, já dentro do aplicativo. Aqui moram as peças que as duas metades dividem.
 */
export const PERGUNTAS = 4;
/** Em que ponto das boas-vindas este aparelho parou: "cor", "logo" ou "feito". Sem valor = pet shop de antes, sem boas-vindas. */
export const chaveBoasVindas = (petshopId: string) => `maestro-gestao-boas-vindas-${petshopId}`;

const ICONE: Record<Principal, React.ComponentType> = { banho_tosa: Scissors, creche: Sun, hotel: BedDouble, loja: Package };
const ICONE_MENU: Record<Principal, React.ComponentType> = { banho_tosa: CalendarDays, creche: BedDouble, hotel: BedDouble, loja: Package };

/** O Mozart falando, em primeira pessoa. */
export function FalaMozart({ children }: { children: React.ReactNode }) {
  return (
    <div className="g-bv-fala">
      <Selo tamanho={46} tom="verde" />
      <p><b>Mozart</b>{children}</p>
    </div>
  );
}

/** Trilho das quatro perguntas, com a de agora em destaque. */
export function TrilhoBoasVindas({ agora }: { agora: number }) {
  return (
    <div className="g-guia-trilho" role="img" aria-label={`Pergunta ${agora} de ${PERGUNTAS}`}>
      {Array.from({ length: PERGUNTAS }, (_, i) => <span key={i} className={i + 1 < agora ? "feito" : i + 1 === agora ? "agora" : ""}><i /></span>)}
    </div>
  );
}

/** "Qual é a atividade principal?": uma só, entre as áreas marcadas. Pacotes não entra: é um jeito de vender. */
export function EscolherPrincipal({ modulos, valor, aoMudar }: { modulos: readonly string[]; valor: Principal | null; aoMudar: (v: Principal) => void }) {
  return (
    <div className="g-bv-principal" role="radiogroup" aria-label="Atividade principal">
      {areasParaPrincipal(modulos).map((a) => {
        const Icone = ICONE[a];
        const on = a === valor;
        return (
          <button key={a} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} onClick={() => aoMudar(a)}>
            <span className="ic" aria-hidden><Icone /></span>
            <b>{MODULOS.find((m) => m.id === a)?.rotulo}</b>
            <span className="ok" aria-hidden>{on && <Check />}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Miniatura do painel: o menu com a logo e o nome, a área principal em primeiro e o botão da tela inicial. Muda junto com a cor. */
export function PreviaPainel({ petshop, primeiroNome }: { petshop: { nome: string; logo: string | null; modulos?: string[] | null; principal?: string | null }; primeiroNome: string }) {
  const principal = principalDe(petshop);
  const tela = TELA_DA_AREA[principal ?? "banho_tosa"];
  const Icone = ICONE_MENU[principal ?? "banho_tosa"];
  return (
    <div className="g-bv-previa" aria-hidden>
      <div className="lado">
        <div className="marca"><LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={30} /><b>{petshop.nome}</b></div>
        <span className="item"><Sun />Hoje</span>
        <span className="item on"><Icone />{tela.menu}</span>
        <span className="item"><PawPrint />Clientes e pets</span>
      </div>
      <div className="tela">
        <small>Tela inicial</small>
        <b>Olá, <em>{primeiroNome}</em></b>
        <span className="botao">{tela.acao}</span>
      </div>
    </div>
  );
}

/** O que o Mozart deixou pronto, em uma frase. Vazio quando não há o que contar. */
export function oQueDeixeiPronto(petshop: { modulos?: string[] | null; principal?: string | null; tema: string; logo: string | null }): string {
  const principal = principalDe(petshop);
  const partes = [
    principal ? `${NOME_DA_AREA[principal]} em primeiro lugar` : "",
    petshop.tema !== "floresta" ? "o painel com a sua cor" : "",
    petshop.logo ? "a sua logo no menu" : "",
  ].filter(Boolean);
  if (!partes.length) return "";
  if (partes.length === 1 && principal) return `Deixei ${partes[0]} no menu e na tela inicial.`;
  return `Deixei ${partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`}.`;
}
