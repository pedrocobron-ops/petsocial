"use client";

import Link from "@/components/gestao/link-depois";
import { ChevronRight, Send } from "lucide-react";
import { lerModoEnvio, montarFila, resumoDaFila } from "@/lib/gestao/modo-envio";
import { useGestao } from "./contexto";
import { Tile } from "./painel";
import { useDados } from "./ui";
import "./modo-envio.css";

/**
 * Entrada do Modo envio na tela Hoje: "Mandar N mensagens" com o que é cada uma. Só aparece quando há mensagem pronta.
 * Lê depois do primeiro olhar da tela (`pronto`), para não disputar a rede com ele.
 */
export default function EntradaModoEnvio({ pronto }: { pronto: boolean }) {
  const { sb, petshop } = useGestao();
  const { dados } = useDados(async () => {
    if (!pronto) return null;
    const d = await lerModoEnvio(sb, petshop.id);
    return d ? montarFila(d, petshop) : null;
  }, [petshop.id, pronto]);
  const n = dados?.mensagens.length ?? 0;
  if (!n) return null;
  const partes = resumoDaFila(dados!);
  return (
    <Link href="/gestao/app/mensagens" className="g-card g-me-entrada" aria-label={n === 1 ? "Mandar 1 mensagem pelo WhatsApp" : `Mandar ${n} mensagens pelo WhatsApp`}>
      <Tile icone={Send} tom="menta" />
      <span className="t">
        <b>{n === 1 ? "Mandar 1 mensagem" : `Mandar ${n} mensagens`}</b>
        <span>{partes.map((p) => `${p.rotulo.replace(/ \(.*\)$/, "")}: ${p.quantas}`).join(" · ")}. Uma por vez, pelo WhatsApp.</span>
      </span>
      <ChevronRight aria-hidden />
    </Link>
  );
}
