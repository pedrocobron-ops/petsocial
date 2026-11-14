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
      ok(await sb.from("petshops").update({ modulos: valor, principal }).eq("id", petshop.id).select("id"));
      // passou a fazer banho e tosa e a lista de serviços está vazia: entram os mais comuns, sem preço
      if (valor.includes("banho_tosa") && !servicos.some((s) => !["creche", "hotel"].includes(s.categoria))) {
        ok(await sb.from("servicos").insert(SERVICOS_BANHO_TOSA.map((s) => ({ ...s, petshop_id: petshop.id }))).select("id"));
      }
      await recarregarBase();
      avisarMudanca();
      avisar(principal ? "Salvo. O menu e a tela inicial já estão na nova ordem." : "Salvo. O menu já mostra na frente só o que você usa.");
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
