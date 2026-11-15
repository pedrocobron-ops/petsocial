"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { faxinaDasFotos } from "@/lib/gestao/tutor";
import { useGestao } from "../contexto";

/**
 * Conferência das fotos da página do tutor (só o dono, em Meu pet shop): pega a foto mais nova de um pet cujo tutor já
 * tem link e pede ao servidor para buscá-la pelos dois caminhos (ver src/lib/gestao/tutor-servidor.ts). Serve para saber,
 * no servidor de verdade, se o tutor consegue ver as fotos. Não cria link e não marca a página como aberta.
 */
type Resposta = { principal: string; reserva: string };

export default function ConferirFotosDoTutor() {
  const { sb, petshop } = useGestao();
  const [estado, setEstado] = useState<{ tom: "ok" | "aviso" | "erro" | "info"; texto: string; detalhe?: string } | null>(null);
  const [conferindo, setConferindo] = useState(false);

  async function conferir() {
    setConferindo(true); setEstado(null);
    try {
      await faxinaDasFotos(sb, petshop.id).catch(() => undefined); // assina as fotos que ainda não têm assinatura
      const f = await sb.from("diario_fotos").select("id, pets(cliente_id)").eq("petshop_id", petshop.id).order("criado_em", { ascending: false }).limit(50);
      if (f.error) throw new Error(f.error.message);
      const fotos = (f.data ?? []).map((x) => ({ id: x.id, cliente: (x.pets as { cliente_id: string | null } | null)?.cliente_id ?? null })).filter((x) => x.cliente);
      if (!fotos.length) return setEstado({ tom: "info", texto: "Ainda não há fotos para conferir. Ponha uma foto de um pet na creche ou no hotel e confira de novo." });
      const l = await sb.from("tutor_links").select("cliente_id, token").in("cliente_id", [...new Set(fotos.map((x) => x.cliente!))]);
      if (l.error) throw new Error(l.error.message);
      const tokens = new Map((l.data ?? []).map((x) => [x.cliente_id, x.token]));
      const alvo = fotos.find((x) => tokens.has(x.cliente!));
      if (!alvo) return setEstado({ tom: "info", texto: "Nenhum tutor destas fotos recebeu a página ainda. Mande a página do tutor para um deles e confira de novo." });
      const r = await fetch(`/gestao/tutor/${tokens.get(alvo.cliente!)}/conferir?foto=${alvo.id}`, { cache: "no-store" });
      if (!r.ok) throw new Error("Não consegui conferir agora. Tente de novo em um minuto.");
      const d = (await r.json()) as Resposta;
      const palavra = (v: string) => (v === "ok" ? "funcionou" : v === "devagar" ? "muitos acessos agora" : "não funcionou");
      const detalhe = `Caminho principal: ${palavra(d.principal)}. Caminho reserva: ${palavra(d.reserva)}.`;
      if (d.principal === "devagar" || d.reserva === "devagar") setEstado({ tom: "info", texto: "Muitos acessos a este link agora. Confira de novo daqui a um minuto.", detalhe });
      else if (d.principal === "ok") setEstado({ tom: "ok", texto: "Tudo certo: as fotos abrem para o tutor.", detalhe });
      else if (d.reserva === "ok") setEstado({ tom: "aviso", texto: "As fotos abrem para o tutor pelo caminho reserva. Por agora está tudo bem; se repetir amanhã, avise o suporte.", detalhe });
      else setEstado({ tom: "erro", texto: "As fotos não abriram para o tutor. O resto da página funciona. Avise o suporte do Maestro Pet.", detalhe });
    } catch (x) {
      setEstado({ tom: "erro", texto: x instanceof Error ? x.message : String(x) });
    } finally { setConferindo(false); }
  }

  return (
    <div className="g-pilha" style={{ gap: 8 }}>
      <div className="g-fila">
        <button type="button" className="g-btn fantasma p" disabled={conferindo} onClick={() => void conferir()}><ShieldCheck />{conferindo ? "Conferindo…" : "Conferir se as fotos abrem para o tutor"}</button>
      </div>
      {estado && (
        <p className={estado.tom === "erro" ? "g-erro" : "g-muted g-pp"} role="status" data-teste="conferir-fotos">
          {estado.tom === "ok" ? <b>{estado.texto}</b> : estado.texto}{estado.detalhe ? <><br /><small>{estado.detalhe}</small></> : null}
        </p>
      )}
    </div>
  );
}
