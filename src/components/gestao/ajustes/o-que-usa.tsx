"use client";

import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import { MODULOS, SERVICOS_BANHO_TOSA, modulosDe, type Modulo } from "@/lib/gestao/modulos";
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
  const mudou = valor.length !== salvo.length || valor.some((m) => !salvo.includes(m));
  const saem = MODULOS.filter((m) => salvo.includes(m.id) && !valor.includes(m.id)).map((m) => m.rotulo.toLowerCase());

  async function salvar() {
    if (somenteLeitura() || salvando) return;
    if (!valor.length) return setErro("Marque pelo menos uma coisa que o seu negócio faz.");
    setErro(null);
    setSalvando(true);
    try {
      ok(await sb.from("petshops").update({ modulos: valor }).eq("id", petshop.id).select("id"));
      // passou a fazer banho e tosa e a lista de serviços está vazia: entram os mais comuns, sem preço
      if (valor.includes("banho_tosa") && !servicos.some((s) => !["creche", "hotel"].includes(s.categoria))) {
        ok(await sb.from("servicos").insert(SERVICOS_BANHO_TOSA.map((s) => ({ ...s, petshop_id: petshop.id }))).select("id"));
      }
      await recarregarBase();
      avisarMudanca();
      avisar("Salvo. O menu já mostra só o que você usa.");
    } catch (x) { avisarErro(x); } finally { setSalvando(false); }
  }

  return (
    <section className="g-card g-pilha">
      <div className="g-mp-t">
        <Tile icone={LayoutGrid} tom="menta" />
        <div><h2>O que você usa</h2><p className="g-muted g-p">Marque o que o seu negócio faz. Isso só mostra ou esconde telas do menu e avisos: nada é apagado, e dá para ligar de novo quando quiser.</p></div>
      </div>
      <EscolherModulos valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} comApoio />
      {mudou && saem.length > 0 && <p className="g-muted g-pp">Ao salvar, o que é de {saem.join(", ")} deixa de aparecer no menu e nos avisos. O que já está lançado continua guardado.</p>}
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div><button className="g-btn verde" onClick={() => void salvar()} disabled={salvando || !mudou}>{salvando ? "Salvando…" : "Salvar"}</button></div>
    </section>
  );
}
