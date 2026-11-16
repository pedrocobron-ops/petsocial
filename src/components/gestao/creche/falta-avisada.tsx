"use client";

import { useState } from "react";
import { CalendarX2, Check } from "lucide-react";
import { esperadoNoDia, type Falta, type PlanoCompleto } from "@/lib/gestao/creche";
import { dataLonga, deIsoDia, isoDia, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, avisarMudanca, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "./creche.css";

/** Quantos dias à frente a folha mostra (o banco aceita até 3 meses). */
const SEMANAS = 6;

/** Marca (ou desmarca) a falta avisada de um dia que ainda vai chegar. */
export async function anotarFaltaAvisada(sb: ReturnType<typeof useGestao>["sb"], planoId: string, dia: string, marcar: boolean) {
  ok(await sb.rpc("creche_falta_futura", { p_plano: planoId, p_dia: dia, p_marcar: marcar }));
}

/**
 * "Vai faltar": o tutor avisou antes que o cão não vem num dia do plano. A falta fica anotada já com aviso (vale para a
 * regra de reposição depois do dia) e a vaga do dia fica livre. Não é pausa: o plano e a mensalidade não mudam.
 */
export default function FaltaAvisada({ plano, aoFechar }: { plano: PlanoCompleto; aoFechar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const nome = plano.pets?.nome ?? "O pet";
  const amanha = isoDia(somaDias(new Date(), 1)), ate = isoDia(somaDias(new Date(), SEMANAS * 7));
  const [ocupado, setOcupado] = useState<string | null>(null);
  const { dados, recarregar } = useDados(async () => {
    const r = ok(await sb.from("creche_faltas").select("*").eq("petshop_id", petshop.id).eq("pet_id", plano.pet_id).gte("dia", amanha).lte("dia", ate).order("dia").limit(200));
    return new Map((r as Falta[]).map((f) => [f.dia, f]));
  }, [petshop.id, plano.pet_id, amanha]);

  const dias: string[] = [];
  for (let d = deIsoDia(amanha); isoDia(d) <= ate; d = somaDias(d, 1)) if (esperadoNoDia(plano, isoDia(d), petshop.horario)) dias.push(isoDia(d));

  async function trocar(dia: string, marcar: boolean) {
    if (somenteLeitura() || ocupado) return;
    setOcupado(dia);
    try {
      await anotarFaltaAvisada(sb, plano.id, dia, marcar);
      avisar(marcar ? `${nome} vai faltar em ${dataLonga(deIsoDia(dia))}: falta com aviso anotada.` : `Tirei a falta de ${dataLonga(deIsoDia(dia))}. O dia volta a ser do plano de ${nome}.`);
      await recarregar(); avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setOcupado(null); }
  }

  return (
    <Folha titulo={`${nome} vai faltar`} aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Pronto</button>}>
      <div className="g-pilha p">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={plano.pets ?? { nome: "?" }} />
          <p className="g-p g-cresce">O tutor avisou antes? Toque no dia em que {nome} não vem. Fica como falta com aviso: conta para a reposição depois desse dia e a vaga fica livre. O plano e a mensalidade não mudam.</p>
        </div>
        {!dados ? <Esqueleto linhas={3} /> : !dias.length ? <p className="g-muted g-p">Nenhum dia do plano nas próximas {SEMANAS} semanas.</p> : (
          <div className="g-lista g-cm-faltar">
            {dias.map((d) => {
              const f = dados.get(d);
              return (
                <div key={d} className="g-linha">
                  <span className="t"><b>{dataLonga(deIsoDia(d))}</b><span>{f ? "vai faltar · avisou" : "dia do plano"}</span></span>
                  {f
                    ? <button type="button" className="g-btn fantasma p" disabled={ocupado === d} onClick={() => void trocar(d, false)} aria-label={`Tirar a falta de ${dataLonga(deIsoDia(d))}`}><Check />Vai faltar · desfazer</button>
                    : <button type="button" className="g-btn sec p" disabled={ocupado === d} onClick={() => void trocar(d, true)} aria-label={`${nome} vai faltar em ${dataLonga(deIsoDia(d))}`}><CalendarX2 />Vai faltar</button>}
                </div>
              );
            })}
          </div>
        )}
        <p className="g-muted g-pp">Falta de hoje ou de um dia que passou é marcada na Chamada, com Faltou e Avisou.</p>
      </div>
    </Folha>
  );
}
