"use client";

import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { MODULOS, SERVICOS_BANHO_TOSA, areasParaPrincipal, modulosDe, principalDe, principalPara, type Modulo, type Principal } from "@/lib/gestao/modulos";
import { EscolherPrincipal } from "../boas-vindas";
import { useGestao } from "../contexto";
import EscolherModulos from "../modulos";
import { Tile } from "../painel";
import { avisarMudanca, ok, useAvisos, useSomenteLeitura } from "../ui";

/** O que o negócio faz: mostra ou esconde telas do menu, passos e avisos. Não apaga nada. */
export default function OQueUsa() {
  const { sb, petshop, servicos, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const salvo = modulosDe(petshop);
  const [valor, setValor] = useState<Modulo[]>(salvo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // área principal: a única área marcada vale sozinha; com mais de uma, é a que o dono apontar (ou nenhuma)
  const principalSalva = principalDe(petshop);
  const [escolhida, setEscolhida] = useState<Principal | null>(principalSalva);
  const areas = areasParaPrincipal(valor);
  const principal = areas.length > 1 ? (areas.find((a) => a === escolhida) ?? null) : principalPara(valor, escolhida);
  const mudou = valor.length !== salvo.length || valor.some((m) => !salvo.includes(m)) || (areas.length > 1 && principal !== principalSalva);
  const saem = MODULOS.filter((m) => salvo.includes(m.id) && !valor.includes(m.id)).map((m) => m.rotulo.toLowerCase());

  async function salvar() {
    if (somenteLeitura() || salvando) return;
    if (!valor.length) return setErro("Marque pelo menos uma coisa que o seu negócio faz.");
    setErro(null);
    setSalvando(true);
    try {
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
      const nomeNovas = novas.map((m) => (m === "creche" ? "creche" : "hotel")).join(" e ");
      avisar(`${principal ? "Salvo. O menu e a tela inicial já estão na nova ordem." : "Salvo. O menu já mostra na frente só o que você usa."}${novas.length
        ? ` Coloque a diária e as vagas ${novas.length > 1 ? "da creche e do hotel" : novas[0] === "creche" ? "da creche" : "do hotel"} no grupo ${novas.length > 1 || (valor.includes("creche") && valor.includes("hotel")) ? "Creche e hotel" : novas[0] === "creche" ? "Creche" : "Hotel"}, aqui em Meu pet shop.${Object.keys(link).length ? ` O link do cliente também passa a receber pedido de ${nomeNovas}.` : ""}`
        : ""}`);
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha">
      <div className="g-mp-t">
        <Tile icone={LayoutGrid} tom="menta" />
        <div><h2>O que você usa</h2><p className="g-muted g-p">Marque o que o seu negócio faz. O que você não marcar sai da frente e fica em Outras áreas, no fim do menu: nada é apagado, e dá para ligar de novo quando quiser.</p></div>
      </div>
      <EscolherModulos valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} comApoio />
      {areas.length > 1 && (
        <div className="g-pilha p">
          <p className="g-rotulo">Área principal</p>
          <EscolherPrincipal modulos={valor} valor={principal} aoMudar={(v) => { setEscolhida(v); setErro(null); }} />
        </div>
      )}
      {areas.length > 0 && <p className="g-muted g-pp">A área principal aparece primeiro no menu e na tela inicial.{areas.length === 1 && principal && principal === principalSalva ? ` Hoje é ${MODULOS.find((m) => m.id === principal)?.rotulo.toLowerCase()}, a única área marcada.` : areas.length > 1 && !principal ? " Toque em uma para escolher." : ""}</p>}
      {mudou && saem.length > 0 && <p className="g-muted g-pp">Ao salvar, o que é de {saem.join(", ")} sai da frente do menu e dos avisos e passa para Outras áreas. O que já está lançado continua guardado.</p>}
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div><button className="g-btn verde" onClick={() => void salvar()} disabled={salvando || !mudou}>{salvando ? "Salvando…" : "Salvar"}</button></div>
    </section>
  );
}
