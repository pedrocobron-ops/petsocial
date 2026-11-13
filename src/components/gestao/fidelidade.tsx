"use client";

import { useState } from "react";
import Link from "next/link";
import { Gift } from "lucide-react";
import { AREAS_FIDELIDADE, lerFidelidade, programaDe } from "@/lib/gestao/fidelidade";
import { chamar, dataCompleta } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { Anel, Tile } from "./painel";
import { avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "./ui";

function useFidelidade(clienteId: string) {
  const { sb, petshop } = useGestao();
  const programa = programaDe(petshop);
  const r = useDados(async () => (programa ? lerFidelidade(sb, petshop.id, programa, clienteId) : null),
    [petshop.id, clienteId, programa?.cada, programa?.desde, programa?.premio]);
  return { ...r, programa };
}

/** Ficha do tutor: quanto falta, o prêmio para entregar e as entregas já feitas. Não aparece com o programa desligado. */
export function CartaoFidelidade({ clienteId, nome }: { clienteId: string; nome: string }) {
  const { sb, petshop, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const { dados: f, erro, programa, recarregar } = useFidelidade(clienteId);
  const [ocupado, setOcupado] = useState(false);
  if (!programa) return null;
  const { cada, premio } = programa;
  const entrego = AREAS_FIDELIDADE.some((a) => posso(a));
  const quem = chamar(nome);

  async function entregar() {
    if (!f || !f.premios || ocupado || somenteLeitura()) return;
    if (!(await confirmar({ titulo: `Entregar o prêmio de ${quem}?`, texto: `Prêmio: ${premio}. A contagem recomeça para o próximo.`, confirmar: "Entregar prêmio" }))) return;
    setOcupado(true);
    try {
      ok(await sb.from("fidelidade_resgates").insert({ petshop_id: petshop.id, cliente_id: clienteId, premio, atendimentos: cada }).select("id"));
      avisar("Prêmio entregue.");
      await recarregar();
      avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }

  async function desfazer() {
    const ultimo = f?.resgates[0];
    if (!ultimo || ocupado || somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Desfazer a última entrega?", texto: `${ultimo.premio}, em ${dataCompleta(ultimo.criado_em)}. Os atendimentos voltam para a contagem de ${quem}.`, confirmar: "Desfazer", perigo: true }))) return;
    setOcupado(true);
    try {
      const apagados = ok(await sb.from("fidelidade_resgates").delete().eq("id", ultimo.id).eq("petshop_id", petshop.id).select("id"));
      if (!apagados.length) throw new Error("Não consegui desfazer. Confira se você tem acesso para isso.");
      avisar("Entrega desfeita.");
      await recarregar();
      avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }

  const falta = f ? cada - f.parte : 0;
  return (
    <section className="g-card">
      <div className="g-card-t">
        <h3><Tile icone={Gift} tom="lilas" tamanho="p" />Fidelidade</h3>
        <span className="g-muted g-pp">desde {dataCompleta(programa.desde)}</span>
      </div>
      {!f ? <p className="g-muted g-p">{erro ?? "Contando…"}</p> : (
        <div className="g-pilha">
          <div className="g-fid">
            <Anel parte={f.parte / cada} cor="var(--i-lilas)">{f.parte}/{cada}</Anel>
            <div>
              <b>Fidelidade: {f.parte} de {cada}</b>
              <p className="g-muted g-p">{falta === 1 ? "Falta 1 atendimento" : `Faltam ${falta} atendimentos`} para ganhar {f.premios ? "outro prêmio" : premio}.</p>
            </div>
          </div>
          {f.premios > 0 && (
            <div className="g-aviso verde g-fid-ganhou">
              <Gift aria-hidden />
              <span className="g-cresce">Ganhou: <b>{premio}</b>{f.premios > 1 ? ` (${f.premios} prêmios para entregar)` : ""}</span>
              {entrego && <button className="g-btn verde p" disabled={ocupado} onClick={() => void entregar()}>Entregar prêmio</button>}
            </div>
          )}
          {f.resgates.length > 0 && (
            <div>
              <span className="g-rotulo">Prêmios entregues</span>
              <div className="g-lista">
                {f.resgates.slice(0, 5).map((r, i) => (
                  <div key={r.id} className="g-linha">
                    <Tile icone={Gift} tom="lilas" tamanho="p" />
                    <span className="t"><b>{r.premio}</b><span>entregue em {dataCompleta(r.criado_em)}</span></span>
                    {i === 0 && entrego && <button className="g-btn p sec" disabled={ocupado} onClick={() => void desfazer()}>Desfazer</button>}
                  </div>
                ))}
              </div>
              {f.resgates.length > 5 && <p className="g-muted g-pp" style={{ marginTop: 6 }}>E mais {f.resgates.length - 5} antes {f.resgates.length - 5 === 1 ? "dessa" : "dessas"}.</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Janela do horário: uma linha discreta com a contagem, ou um destaque quando há prêmio para entregar. */
export function FidelidadeNoHorario({ clienteId }: { clienteId: string }) {
  const { posso } = useGestao();
  const { dados: f, programa } = useFidelidade(clienteId);
  if (!programa || !f) return null;
  if (f.premios > 0) {
    return (
      <p className="g-aviso verde g-fid-ganhou" style={{ margin: 0 }}>
        <Gift aria-hidden />
        <span className="g-cresce">Tem prêmio para entregar: <b>{programa.premio}</b></span>
        {posso("clientes") && <Link className="g-link" href={`/gestao/app/clientes?cliente=${clienteId}`}>Abrir a ficha</Link>}
      </p>
    );
  }
  return <div className="g-fila entre"><span className="g-muted">Fidelidade</span><b className="g-tab">{f.parte} de {programa.cada}</b></div>;
}
