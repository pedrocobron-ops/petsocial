"use client";

import { useState } from "react";
import { usaModulo } from "@/lib/gestao/modulos";
import { useGestao } from "../contexto";
import { avisarMudanca, ok, useAvisos, useSomenteLeitura } from "../ui";

/**
 * As chaves "o link recebe pedido de creche / de hotel". Só o dono muda. Ficam em Meu pet shop, em Creche e hotel
 * e na janela do link da Agenda: as três gravam o mesmo campo.
 */
export default function LinkCrecheHotel({ titulo = "Pelo link, o cliente também pode pedir" }: { titulo?: string }) {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [gravando, setGravando] = useState(false);
  const creche = usaModulo(petshop, "creche"), hotel = usaModulo(petshop, "hotel");
  if (!souDono || (!creche && !hotel)) return null;

  async function alternar(campo: "link_creche" | "link_hotel", valor: boolean) {
    if (somenteLeitura() || gravando) return;
    setGravando(true);
    try {
      ok(await sb.from("petshops").update(campo === "link_creche" ? { link_creche: valor } : { link_hotel: valor }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(valor ? `O link agora recebe pedido de ${campo === "link_creche" ? "creche" : "hotel"}.` : `O link não recebe mais pedido de ${campo === "link_creche" ? "creche" : "hotel"}.`);
    } catch (e) { avisarErro(e); } finally { setGravando(false); }
  }

  return (
    <div className="g-campo">
      <span>{titulo}</span>
      <div className="g-fila" style={{ gap: 16 }}>
        {creche && <label className="g-check"><input type="checkbox" checked={petshop.link_creche} disabled={gravando} onChange={(e) => void alternar("link_creche", e.target.checked)} /><span>Vaga na creche</span></label>}
        {hotel && <label className="g-check"><input type="checkbox" checked={petshop.link_hotel} disabled={gravando} onChange={(e) => void alternar("link_hotel", e.target.checked)} /><span>Vaga no hotel</span></label>}
      </div>
      <small>{petshop.link_ativo ? "O pedido chega para você aceitar ou recusar. Nada é marcado sozinho." : "O link está desligado: ligue a chave do link em Meu pet shop para receber pedidos."}</small>
    </div>
  );
}
