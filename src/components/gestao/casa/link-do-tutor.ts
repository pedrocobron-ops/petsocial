"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { linkDoTutor, linkExistente } from "@/lib/gestao/tutor";
import { useGestao } from "../contexto";

/**
 * O link da página do tutor nas telas da equipe. Abrir a ficha ou as fotos só LÊ o link que o tutor já tem;
 * um link novo só é criado quando alguém toca em Mandar ou Copiar (`garantir`).
 */
export function useLinkDoTutor(clienteId: string | null | undefined, ativo: boolean) {
  const { sb } = useGestao();
  const [link, setLink] = useState<string | null>(null);
  const [visto, setVisto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const atual = useRef<string | null>(null);
  atual.current = link;

  useEffect(() => {
    setLink(null); setVisto(null); setErro(null);
    if (!clienteId || !ativo) return;
    let vivo = true;
    linkExistente(sb, clienteId)
      .then((r) => { if (vivo) { setLink(r.url); setVisto(r.visto); } })
      .catch((x) => { if (vivo) setErro(x instanceof Error ? x.message : String(x)); });
    return () => { vivo = false; };
  }, [sb, clienteId, ativo]);

  const garantir = useCallback(async () => {
    if (atual.current) return atual.current;
    if (!clienteId) throw new Error("Este pet não tem tutor na ficha.");
    const u = await linkDoTutor(sb, clienteId);
    atual.current = u;
    setLink(u); setErro(null);
    return u;
  }, [sb, clienteId]);

  return { link, setLink, visto, setVisto, erro, garantir };
}

/**
 * Abre o WhatsApp com a mensagem, criando o link na hora se ainda não existe. A janela abre já no toque
 * (depois de esperar o banco o navegador bloquearia) e recebe o endereço do WhatsApp quando o link fica pronto.
 */
export async function abrirZapComLink(garantir: () => Promise<string>, montar: (url: string) => string | null): Promise<void> {
  const w = window.open("", "_blank");
  try {
    const zap = montar(await garantir());
    if (!zap) { w?.close(); return; }
    if (w) { try { w.opener = null; } catch { /* sem acesso */ } w.location.href = zap; } else window.location.href = zap;
  } catch (x) { w?.close(); throw x; }
}

/** Copia o link, criando na hora se preciso (no Safari a cópia precisa começar no toque: ClipboardItem aceita a espera). */
export async function copiarComLink(garantir: () => Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": garantir().then((u) => new Blob([u], { type: "text/plain" })) })]);
      return;
    } catch { /* tenta do jeito simples */ }
  }
  const u = await garantir();
  await navigator.clipboard.writeText(u);
}
