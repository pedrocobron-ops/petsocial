"use client";

import { Check, MessageCircle, Sparkles } from "lucide-react";
import { experienciaDe, jaConversou, lerExperiencias, mensagemDaExperiencia, type Experiencia } from "@/lib/gestao/creche";
import { dataAmigavel, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { lerModelos } from "./modelos";
import "./creche.css";

/**
 * Dias de experiência (opção da creche): quem vem hoje e, depois do dia, a mensagem pronta para perguntar ao tutor como foi e
 * oferecer os planos. Some quando o cão vira mensalista, quando alguém manda a mensagem ou toca em Já conversei, ou 14 dias depois.
 * Os planos com preço entram na mensagem só para quem cuida do financeiro (os modelos de plano têm valor).
 */
export default function ExperienciasDaCreche() {
  const { sb, petshop, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const ligado = experienciaDe(petshop).ativo;
  const { dados, recarregar } = useDados(async () => {
    if (!ligado) return null;
    const [exp, modelos] = await Promise.all([
      lerExperiencias(sb, petshop.id),
      cuidoDoFinanceiro ? lerModelos(sb, petshop.id).catch(() => []) : Promise.resolve([]),
    ]);
    return { ...exp, planos: modelos.filter((m) => m.ativo).map((m) => ({ nome: m.nome, valor: Number(m.valor_mensal) })) };
  }, [petshop.id, ligado, cuidoDoFinanceiro]);
  if (!ligado || !dados || (!dados.hoje.length && !dados.conversar.length)) return null;

  async function conversou(e: Experiencia, toque: "zap" | "marcar") {
    if (toque === "marcar" && somenteLeitura()) return;
    try {
      const atual = e.avisos && typeof e.avisos === "object" ? (e.avisos as Record<string, unknown>) : {};
      ok(await sb.from("estadias").update({ avisos: { ...atual, experiencia: new Date().toISOString() } as never }).eq("id", e.id).eq("petshop_id", petshop.id).select("id"));
      if (toque === "marcar") avisar(`Pronto: ${e.pets?.nome ?? "o pet"} sai da lista.`);
      await recarregar(); avisarMudanca();
    } catch (x) { if (toque === "marcar") avisarErro(x); }
  }

  return (
    <section className="g-card g-cm-exp" id="experiencias" aria-label="Dias de experiência">
      <div className="g-card-t"><h3><Sparkles aria-hidden style={{ width: 18, height: 18 }} />Dias de experiência</h3>
        <span className="g-muted g-pp">{[dados.hoje.length ? `${dados.hoje.length} hoje` : "", dados.conversar.length ? `${dados.conversar.length} para conversar` : ""].filter(Boolean).join(" · ")}</span></div>
      <div className="g-lista">
        {dados.hoje.map((e) => (
          <div key={e.id} className="g-linha">
            <AvatarPet pet={e.pets ?? { nome: "?" }} />
            <span className="t"><b>{e.pets?.nome ?? "Pet"}</b><span>{e.pets?.clientes?.nome ?? "Sem tutor"} · dia de experiência hoje · {e.status === "reservada" ? "ainda não chegou" : e.status === "em_casa" ? "na casa" : "já foi para casa"}</span></span>
          </div>
        ))}
        {dados.conversar.map((e) => {
          const texto = mensagemDaExperiencia({ tutor: e.pets?.clientes?.nome, pet: e.pets?.nome ?? "o pet", sexo: e.pets?.sexo, petshop: petshop.nome, planos: dados.planos });
          const zap = linkWhatsApp(e.pets?.clientes?.telefone, texto);
          return (
            <div key={e.id} className="g-linha">
              <AvatarPet pet={e.pets ?? { nome: "?" }} />
              <span className="t"><b>{e.pets?.nome ?? "Pet"}</b><span>{e.pets?.clientes?.nome ?? "Sem tutor"} · fez o dia de experiência {dataAmigavel(new Date(e.entrada))}{jaConversou(e) ? " · conversado" : ""}</span></span>
              {zap ? <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer" onClick={() => void conversou(e, "zap")} aria-label={`Perguntar ao tutor de ${e.pets?.nome ?? "pet"} como foi o dia de experiência`}><MessageCircle />Como foi?</a>
                : <span className="g-muted g-pp">sem telefone na ficha</span>}
              <button type="button" className="g-btn fantasma p" onClick={() => void conversou(e, "marcar")} aria-label={`Já conversei com o tutor de ${e.pets?.nome ?? "pet"}`}><Check />Já conversei</button>
            </div>
          );
        })}
      </div>
      {dados.conversar.length > 0 && <p className="g-muted g-pp">A mensagem pergunta como foi e {dados.planos.length ? "lista os planos" : "oferece os planos"}. Você muda o texto no WhatsApp antes de mandar. Quando o cão vira mensalista, ele sai daqui.</p>}
    </section>
  );
}
