"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Pill, Utensils } from "lucide-react";
import Link from "@/components/gestao/link-depois";
import { dosesDeAgora, horaFalada, type CuidadoFeito, type DoseDeAgora } from "@/lib/gestao/hotel";
import { cuidadosLigados } from "@/lib/gestao/hotel-opcoes";
import { usaCasa } from "@/lib/gestao/modulos";
import { isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "./hotel.css";

type Hospede = { id: string; entrada: string; cuidados: unknown; pets: { nome: string } | null };

/**
 * "Cuidados de agora" (tela Hoje e Creche e hotel): as doses de comida e remédio que estão na hora ou atrasadas, de todos os
 * hóspedes, com um toque para marcar cada uma. Remédio vem antes; atrasada (mais de meia hora) vem em vermelho, com a palavra.
 * Só para quem abre Creche e hotel e com a ficha de cuidados ligada. Sem dose para agora, não aparece. Não mostra valores.
 */
export default function CuidadosDeAgora({ aoMudar, semLink }: { aoMudar?: () => void; semLink?: boolean }) {
  const { sb, petshop, posso } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const vale = usaCasa(petshop) && posso("creche_hotel") && cuidadosLigados(petshop);
  const [agora, setAgora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const hoje = isoDia(agora);
  const { dados, recarregar } = useDados(async () => {
    if (!vale) return null;
    const [e, f] = await Promise.all([
      sb.from("estadias").select("id, entrada, cuidados, pets(nome)").eq("petshop_id", petshop.id).eq("status", "em_casa").not("cuidados", "is", null).order("entrada").order("id").limit(300),
      sb.from("estadias_cuidados").select("estadia_id, item, dia, hora").eq("petshop_id", petshop.id).eq("dia", hoje).limit(2000),
    ]);
    if (e.error || f.error) return null;
    return { estadias: (e.data ?? []) as unknown as Hospede[], feitos: (f.data ?? []) as Pick<CuidadoFeito, "estadia_id" | "item" | "dia" | "hora">[] };
  }, [petshop.id, vale, hoje]);

  // o relógio anda sozinho: a dose passa de "na hora" para "atrasada" sem recarregar a tela
  const recarregarRef = useRef(recarregar);
  recarregarRef.current = recarregar;
  useEffect(() => {
    if (!vale) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") { setAgora(new Date()); void recarregarRef.current(); } }, 60000);
    return () => clearInterval(t);
  }, [vale]);

  if (!vale || !dados) return null;
  const doses = dosesDeAgora(dados.estadias, dados.feitos, hoje, agora.getHours() * 60 + agora.getMinutes());
  if (!doses.length) return null;
  const atrasadas = doses.filter((d) => d.situacao === "atrasada").length;
  const chave = (d: DoseDeAgora) => `${d.estadiaId}-${d.cuidado.id}-${d.hora}`;

  async function marcar(d: DoseDeAgora) {
    if (somenteLeitura() || ocupado) return;
    setOcupado(chave(d));
    try {
      const r = await sb.from("estadias_cuidados").insert({ petshop_id: petshop.id, estadia_id: d.estadiaId, item: d.cuidado.id, dia: hoje, hora: d.hora }).select("id");
      // outra pessoa marcou no mesmo instante: já está feito
      if (r.error && r.error.code !== "23505") throw new Error(r.error.message);
      avisar(`${d.pet}: ${d.cuidado.oque} das ${horaFalada(d.hora)} marcado como feito.`);
      avisarMudanca();
      await recarregar();
      aoMudar?.();
    } catch (x) { avisarErro(x); } finally { setOcupado(null); }
  }
  const tempo = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`);

  return (
    <section className="g-card g-ht-agora" aria-label="Cuidados de agora">
      <div className="g-card-t">
        <h3><Tile icone={Pill} tom={atrasadas ? "rosa" : "manteiga"} tamanho="p" />Cuidados de agora</h3>
        {atrasadas > 0 ? <span className="g-tag vermelho">{atrasadas === 1 ? "1 atrasado" : `${atrasadas} atrasados`}</span> : <span className="g-muted g-pp">comida e remédio</span>}
      </div>
      <ul>
        {doses.slice(0, 12).map((d) => (
          <li key={chave(d)} className={d.situacao}>
            <span aria-hidden>{d.cuidado.tipo === "remedio" ? <Pill size={20} /> : <Utensils size={20} />}</span>
            <span className="t">
              <b>{d.pet}</b>
              <span>{d.cuidado.tipo === "remedio" ? "Remédio: " : ""}{d.cuidado.oque}{d.cuidado.quanto ? `, ${d.cuidado.quanto}` : ""}</span>
              <span className="quando">{horaFalada(d.hora)} · {d.situacao === "atrasada" ? `atrasado há ${tempo(d.atrasoMin)}` : "na hora"}</span>
            </span>
            <button type="button" className="g-btn sec" disabled={ocupado === chave(d)} onClick={() => void marcar(d)} aria-label={`${d.pet}: marcar ${d.cuidado.oque} das ${horaFalada(d.hora)} como feito`}><Check />Feito</button>
          </li>
        ))}
      </ul>
      {doses.length > 12 && <p className="g-muted g-pp">E mais {doses.length - 12}.</p>}
      {!semLink && <Link className="g-btn fantasma p" href="/gestao/app/creche-hotel?ver=casa" style={{ justifySelf: "start" }}>Ver todos os hóspedes</Link>}
    </section>
  );
}
