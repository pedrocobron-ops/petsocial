"use client";

import { useState } from "react";
import { EyeOff } from "lucide-react";
import { SERVICOS_BANHO_TOSA, modulosDe, principalDe, principalPara, telasDoMenu, type Modulo, type Principal } from "@/lib/gestao/modulos";
import { useGestao } from "./contexto";
import EscolherModulos from "./modulos";
import { Folha, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "./ui";

/** "A, B e C". */
export const emLista = (l: string[]) => (l.length < 2 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);

/**
 * Grava o que o negócio faz (`petshops.modulos`) e a área principal. Usado pelo cartão O que você usa (Meu pet shop) e pela
 * folha Personalizar do menu. Ligar uma área depois faz o mesmo que as boas-vindas: creche ou hotel entram no link do cliente
 * (se o link já está ligado) e banho e tosa traz os serviços mais comuns quando a lista está vazia. Desligar só esconde.
 * Devolve as áreas da casa ligadas agora e se o link passou a receber pedido delas.
 */
export function useSalvarModulos() {
  const { sb, petshop, servicos, recarregarBase } = useGestao();
  return async function salvarModulos(valor: Modulo[], principal: Principal | null) {
    const salvo = modulosDe(petshop);
    // creche ou hotel ligados agora, com o link do cliente já ligado: o link passa a receber pedido de vaga também,
    // como nas boas-vindas (desliga em Link do cliente). A diária e as vagas ficam em branco até o dono colocar.
    const novas = (["creche", "hotel"] as const).filter((m) => valor.includes(m) && !salvo.includes(m));
    const link = petshop.link_ativo ? {
      ...(novas.includes("creche") && !petshop.link_creche ? { link_creche: true } : {}),
      ...(novas.includes("hotel") && !petshop.link_hotel ? { link_hotel: true } : {}),
    } : {};
    ok(await sb.from("petshops").update({ modulos: valor, principal, ...link }).eq("id", petshop.id).select("id"));
    // passou a fazer banho e tosa e a lista de serviços está vazia: entram os mais comuns, sem preço
    if (valor.includes("banho_tosa") && !servicos.some((s) => !["creche", "hotel"].includes(s.categoria))) {
      ok(await sb.from("servicos").insert(SERVICOS_BANHO_TOSA.map((s) => ({ ...s, petshop_id: petshop.id }))).select("id"));
    }
    await recarregarBase();
    avisarMudanca();
    return { novas, linkJunto: Object.keys(link).length > 0 };
  };
}

/** Folha "O que o seu negócio faz?": aberta pelo Personalizar ao lado de Dia a dia, no menu. Só o dono. */
export default function PersonalizarMenu({ aoFechar }: { aoFechar: () => void }) {
  const { petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const salvarModulos = useSalvarModulos();
  const salvo = modulosDe(petshop);
  const [valor, setValor] = useState<Modulo[]>(salvo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mudou = valor.length !== salvo.length || valor.some((m) => !salvo.includes(m));

  async function salvar() {
    if (somenteLeitura() || salvando) return;
    if (!valor.length) return setErro("Marque pelo menos uma coisa que o seu negócio faz.");
    if (!mudou) return aoFechar();
    setErro(null);
    setSalvando(true);
    try {
      // a área principal continua a mesma enquanto estiver ligada; com uma área só, é ela
      const principal = principalPara(valor, principalDe(petshop));
      const { novas } = await salvarModulos(valor, principal);
      const telas = telasDoMenu({ modulos: valor, principal });
      avisar(`Pronto: o menu agora mostra ${emLista(telas)}.${novas.length ? ` A diária e as vagas ${novas.length > 1 ? "da creche e do hotel" : novas[0] === "creche" ? "da creche" : "do hotel"} ficam em Meu pet shop.` : ""}`);
      aoFechar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  return (
    <Folha titulo="O que o seu negócio faz?" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-pilha">
        <p className="g-muted g-p">Toque para ligar ou desligar. O menu Dia a dia mostra só o que estiver ligado.</p>
        <EscolherModulos valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} comApoio />
        <p className="g-mod-nota"><EyeOff aria-hidden />Desligar só esconde; nada é apagado. A tela desligada fica em Outras áreas, no fim do menu, e volta quando você ligar de novo.</p>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
