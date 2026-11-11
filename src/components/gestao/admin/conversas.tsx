"use client";

import { useEffect, useMemo, useState } from "react";
import { LifeBuoy, Mic, Search } from "lucide-react";
import { Esqueleto, Vazio, mensagemDeErro, ok } from "@/components/gestao/ui";
import { banco } from "@/lib/gestao/supabase";
import { dataCompleta, hora, semAcento } from "@/lib/gestao/util";

type Conversa = {
  id: string; petshop_id: string; petshop: string; canal: "mozart" | "ajuda"; pergunta: string; resposta: string | null;
  resolveu: boolean | null; pediu_equipe: boolean; criado_em: string; pessoa: string | null;
};
type Filtro = "tudo" | "mozart" | "ajuda" | "problema";

/** O que as pessoas pedem ao Mozart e perguntam na Ajuda, para a equipe Maestro Pet ver onde o sistema precisa melhorar. */
export default function AbaConversas({ petshopId, enxuto }: { petshopId?: string; enxuto?: boolean }) {
  const [itens, setItens] = useState<Conversa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vale = true;
    (async () => {
      try {
        const r = ok(await banco().rpc("admin_conversas", { p_petshop: petshopId, p_limite: enxuto ? 60 : 500 })) as unknown as Conversa[];
        if (vale) setItens(r ?? []);
      } catch (e) { if (vale) setErro(mensagemDeErro(e)); }
    })();
    return () => { vale = false; };
  }, [petshopId, enxuto]);

  const problema = (c: Conversa) => c.resolveu === false || c.pediu_equipe;
  const visiveis = useMemo(() => {
    const alvo = semAcento(busca);
    return (itens ?? []).filter((c) => (filtro === "tudo" || (filtro === "problema" ? problema(c) : c.canal === filtro))
      && (!alvo || semAcento(`${c.petshop} ${c.pessoa ?? ""} ${c.pergunta} ${c.resposta ?? ""}`).includes(alvo)));
  }, [itens, filtro, busca]);

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!itens) return <Esqueleto linhas={4} />;
  const n = { mozart: itens.filter((c) => c.canal === "mozart").length, ajuda: itens.filter((c) => c.canal === "ajuda").length, problema: itens.filter(problema).length };

  return (
    <div className="g-pilha">
      {!enxuto && (
        <div className="g-busca">
          <Search />
          <input className="g-input" type="search" placeholder="Buscar nas conversas: palavra, pet shop ou pessoa" aria-label="Buscar nas conversas" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      )}
      <div className="g-chips">
        {([["tudo", "Tudo", itens.length], ["problema", "Não resolveu ou pediu a equipe", n.problema], ["ajuda", "Ajuda", n.ajuda], ["mozart", "Mozart", n.mozart]] as [Filtro, string, number][]).map(([id, r, q]) => (
          <button key={id} className="g-chip" aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{r} <span className="g-tab" style={{ opacity: .65 }}>{q}</span></button>
        ))}
      </div>
      {!itens.length ? <Vazio titulo="Nenhuma conversa ainda." texto="Quando alguém falar com o Mozart ou abrir a Ajuda, aparece aqui." />
        : !visiveis.length ? <Vazio titulo="Nada com esse filtro." texto="Tente outra palavra ou outro filtro." />
        : (
          <div className="g-pilha p">
            {visiveis.map((c) => (
              <article key={c.id} className="g-card" style={{ display: "grid", gap: 8 }}>
                <div className="g-fila entre">
                  <span className="g-fila" style={{ gap: 8, minWidth: 0 }}>
                    <span className={`g-tile p ${c.canal === "mozart" ? "pessego" : "ceu"}`} aria-hidden>{c.canal === "mozart" ? <Mic /> : <LifeBuoy />}</span>
                    <span className="g-pp g-muted" style={{ overflowWrap: "anywhere" }}>
                      <b style={{ color: "var(--g-tinta)" }}>{c.canal === "mozart" ? "Mozart" : "Ajuda"}</b>{petshopId ? "" : ` · ${c.petshop}`}{c.pessoa ? ` · ${c.pessoa}` : ""} · {dataCompleta(new Date(c.criado_em))} às {hora(c.criado_em)}
                    </span>
                  </span>
                  <span className="g-fila" style={{ gap: 6 }}>
                    {c.resolveu === true && <span className="g-tag verde">resolveu</span>}
                    {c.resolveu === false && <span className="g-tag vermelho">não resolveu</span>}
                    {c.pediu_equipe && <span className="g-tag amarelo">foi para a equipe</span>}
                  </span>
                </div>
                <p style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}><b>Pediu:</b> {c.pergunta}</p>
                {c.resposta && <p className="g-p g-muted" style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}><b>Resposta:</b> {c.resposta}</p>}
              </article>
            ))}
          </div>
        )}
    </div>
  );
}
