"use client";

import { Share2 } from "lucide-react";
import { useGestao } from "../contexto";
import { useDados } from "../ui";

/**
 * Autorização do tutor para postar as fotos do pet nas redes da loja (migração 20261196). O tutor autoriza pela página do
 * boletim; a equipe só vê: "Pode postar ✓ (desde dd/mm)" ou "Sem autorização", na ficha do pet, no álbum e no boletim.
 * Vale a mesma regra do banco (foto_autorizacao_do_boletim): a autorização dada num boletim cobre as fotos dele; a de "todas"
 * cobre também as das visitas depois dela. Retirada pelo tutor ("Não quero mais"): some na hora.
 */
export type AutorizacaoDaEquipe = { id: string; boletim_id: string | null; escopo: "boletim" | "todas"; marcar: string | null; autorizado_em: string };
export type EstadoDaFoto = { pode: true; desde: string; marcar: string | null } | { pode: false };

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** As autorizações que estão valendo para o pet (a mais nova primeiro). Sem área para ler, lista vazia. */
export function useAutorizacoesDoPet(petId: string | null) {
  const { sb, petshop, posso } = useGestao();
  const pode = posso("clientes") || posso("agenda") || posso("creche_hotel");
  const { dados } = useDados(async () => {
    if (!petId || !pode) return [] as AutorizacaoDaEquipe[];
    const r = await sb.from("fotos_autorizacoes").select("id, boletim_id, escopo, marcar, autorizado_em")
      .eq("petshop_id", petshop.id).eq("pet_id", petId).is("retirado_em", null).order("autorizado_em", { ascending: false }).limit(50);
    if (r.error) return [] as AutorizacaoDaEquipe[]; // sem a marca, o resto da ficha segue igual
    return (r.data ?? []) as AutorizacaoDaEquipe[];
  }, [petshop.id, petId, pode]);
  return dados ?? null;
}

/** A foto de uma visita pode ir para as redes? `boletimId`: o boletim da foto; `quando`: quando a foto foi tirada (o boletim nasceu). */
export function estadoDaFoto(lista: AutorizacaoDaEquipe[] | null, boletimId: string | null | undefined, quando: string): EstadoDaFoto {
  const f = (lista ?? []).find((a) => (boletimId && a.boletim_id === boletimId) || (a.escopo === "todas" && new Date(quando).getTime() >= new Date(a.autorizado_em).getTime()));
  return f ? { pode: true, desde: f.autorizado_em, marcar: f.marcar } : { pode: false };
}

/** A autorização geral do pet, para a ficha: a de "todas" valendo, ou a mais nova só de um boletim. */
export function resumoDoPet(lista: AutorizacaoDaEquipe[] | null) {
  const l = lista ?? [];
  const todas = l.find((a) => a.escopo === "todas");
  if (todas) return { tipo: "todas" as const, desde: todas.autorizado_em, marcar: todas.marcar };
  if (l.length) return { tipo: "boletim" as const, desde: l[0].autorizado_em, marcar: l[0].marcar, quantos: l.length };
  return null;
}

/** A etiqueta curta: "Pode postar ✓ (desde 12/11)" ou "Sem autorização". */
export function EtiquetaFoto({ estado, curta }: { estado: EstadoDaFoto; curta?: boolean }) {
  return estado.pode
    ? <span className="g-tag verde g-bol-redes" title={estado.marcar ? `Marcar ${estado.marcar}` : undefined}>Pode postar ✓{curta ? "" : ` (desde ${dataCurta(estado.desde)})`}</span>
    : <span className="g-tag g-bol-redes">Sem autorização</span>;
}

/** A linha da ficha do pet. */
export function FotosNasRedes({ petId }: { petId: string }) {
  const lista = useAutorizacoesDoPet(petId);
  if (lista === null) return null;
  const r = resumoDoPet(lista);
  return (
    <p className="g-bol-redes-linha" data-teste="fotos-nas-redes">
      <Share2 aria-hidden />
      <span className="g-cresce">Fotos nas redes</span>
      {!r ? <span className="g-tag">Sem autorização</span>
        : r.tipo === "todas" ? <span className="g-tag verde">Pode postar ✓ (desde {dataCurta(r.desde)})</span>
        : <span className="g-tag verde">Pode postar ✓ {r.quantos === 1 ? "só as fotos de 1 boletim" : `só as fotos de ${r.quantos} boletins`}</span>}
      {r?.marcar && <span className="g-muted g-pp">marcar {r.marcar}</span>}
    </p>
  );
}
