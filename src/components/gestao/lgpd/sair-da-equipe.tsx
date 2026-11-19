"use client";

import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { ok, useAvisos } from "@/components/gestao/ui";

/**
 * "Sair desta equipe": quem trabalha no pet shop (menos o titular da conta) tira o próprio acesso. O nome continua na equipe e
 * na agenda (como em "Tirar acesso", em Equipe); o login deixa de abrir este pet shop. Fica anotado no registro da LGPD.
 */
export default function SairDaEquipe({ lateral }: { lateral?: boolean }) {
  const { sb, petshop } = useGestao();
  const { confirmar, avisarErro } = useAvisos();
  const [indo, setIndo] = useState(false);

  async function sair() {
    if (indo) return;
    const sim = await confirmar({
      titulo: `Sair da equipe de ${petshop.nome}?`,
      texto: "Você deixa de entrar neste pet shop com o seu login. O seu nome continua no histórico da agenda e do caixa, porque faz parte do registro do pet shop. Para voltar, o dono precisa convidar você de novo.",
      confirmar: "Sair desta equipe", perigo: true,
    });
    if (!sim) return;
    setIndo(true);
    try {
      ok(await sb.rpc("equipe_sair", { p_petshop: petshop.id }));
      try { sessionStorage.setItem("maestro-gestao-saiu", petshop.nome); } catch { /* sem armazenamento: a tela seguinte usa o texto geral */ }
      try { localStorage.removeItem("maestro-gestao-petshop"); localStorage.removeItem("maestro-gestao-ultima-loja"); localStorage.removeItem("maestro-gestao-nome-loja"); } catch { /* sem armazenamento: segue */ }
      location.href = "/gestao/app";
    } catch (e) {
      avisarErro(e);
      setIndo(false);
    }
  }

  return lateral
    ? <button type="button" onClick={() => void sair()} disabled={indo}><DoorOpen />Sair desta equipe</button>
    : <button type="button" className="g-btn fantasma" onClick={() => void sair()} disabled={indo}><DoorOpen />{indo ? "Saindo…" : "Sair desta equipe"}</button>;
}
