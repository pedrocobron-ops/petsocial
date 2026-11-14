"use client";

import { useState } from "react";
import { CalendarCheck2, Check, HandCoins } from "lucide-react";
import type { Cliente, Pet } from "@/lib/gestao/tipos";
import { dataLonga, deIsoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";

/**
 * Reposições para conferir (só para o dono e quem cuida do financeiro).
 * Quando alguém da equipe que não recebe marca um dia de mensalista como "reposição de falta (não cobrar)", o dia fica anotado
 * sem cobrança, mas entra nesta lista: quem recebe aceita, ou manda cobrar como dia extra na próxima mensalidade.
 * Nada é decidido sozinho. A regra mora no banco (`creche_chamada` e `creche_reposicao_decidir`).
 */
type Linha = {
  estadia_id: string; dia: string; marcado_por: string | null;
  pets: (Pick<Pet, "id" | "nome" | "foto" | "especie"> & { clientes: Pick<Cliente, "id" | "nome"> | null }) | null;
};

export default function ReposicoesParaConferir() {
  const { sb, petshop, souDono, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const pode = souDono || cuidoDoFinanceiro;

  const { dados, recarregar } = useDados(async () => {
    if (!pode) return null;
    const r = await sb.from("creche_reposicoes").select("estadia_id, dia, marcado_por, pets(id, nome, foto, especie, clientes(id, nome))")
      .eq("petshop_id", petshop.id).eq("estado", "pendente").order("dia").limit(200);
    if (r.error || !r.data?.length) return { linhas: [] as Linha[], nomes: new Map<string, string>() };
    const equipe = await sb.from("profissionais").select("user_id, nome").eq("petshop_id", petshop.id).limit(500);
    return { linhas: r.data as unknown as Linha[], nomes: new Map((equipe.data ?? []).filter((p) => p.user_id).map((p) => [p.user_id as string, p.nome])) };
  }, [petshop.id, pode]);

  async function decidir(l: Linha, decisao: "aceitar" | "extra") {
    if (somenteLeitura() || ocupado) return;
    setOcupado(l.estadia_id);
    try {
      ok(await sb.rpc("creche_reposicao_decidir", { p_estadia: l.estadia_id, p_decisao: decisao }));
      avisar(decisao === "aceitar" ? `Reposição de ${l.pets?.nome ?? "pet"} aceita: o dia fica sem cobrança.` : `${l.pets?.nome ?? "Pet"}: o dia virou dia extra e entra na próxima mensalidade.`);
      await recarregar(); avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setOcupado(null); }
  }

  if (!dados?.linhas.length) return null;
  const n = dados.linhas.length;
  return (
    <section className="g-card g-ht-cobrar" id="reposicoes" aria-label="Reposições para conferir" style={{ marginBottom: 16 }}>
      <div className="g-card-t">
        <h3><CalendarCheck2 aria-hidden style={{ width: 18, height: 18 }} />Reposições para conferir</h3>
        <span className="g-muted g-pp">{n === 1 ? "1 dia marcado pela equipe" : `${n} dias marcados pela equipe`}</span>
      </div>
      <p className="g-muted g-p">A equipe marcou {n === 1 ? "este dia" : "estes dias"} fora do plano como reposição de falta, sem cobrança. Você confere: aceita a reposição ou cobra como dia extra na próxima mensalidade.</p>
      <div className="g-lista">
        {dados.linhas.map((l) => (
          <div key={l.estadia_id} className="g-linha">
            <AvatarPet pet={l.pets ?? { nome: "?" }} />
            <span className="t">
              <b>{l.pets?.nome ?? "Pet removido"}</b>
              <span>{[dataLonga(deIsoDia(l.dia)), l.pets?.clientes?.nome, l.marcado_por && dados.nomes.get(l.marcado_por) ? `marcada por ${dados.nomes.get(l.marcado_por)}` : null].filter(Boolean).join(" · ")}</span>
            </span>
            <button type="button" className="g-btn sec p" disabled={ocupado === l.estadia_id} onClick={() => void decidir(l, "aceitar")} aria-label={`Aceitar a reposição de ${l.pets?.nome ?? "pet"}`}><Check />Aceitar</button>
            <button type="button" className="g-btn verde p" disabled={ocupado === l.estadia_id} onClick={() => void decidir(l, "extra")} aria-label={`Cobrar como dia extra o dia de ${l.pets?.nome ?? "pet"}`}><HandCoins />Cobrar como dia extra</button>
          </div>
        ))}
      </div>
    </section>
  );
}
