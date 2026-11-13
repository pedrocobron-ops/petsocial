"use client";

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, ScrollText, X } from "lucide-react";
import { banco } from "@/lib/gestao/supabase";
import { esquecerPedido, pedidosLembrados, type OpcoesNoLink, type PedidoLembrado } from "@/lib/gestao/link-opcoes";

export type TermosDoLink = NonNullable<OpcoesNoLink["termos"]>;
export type Aceite = { regras: boolean; vacinas: boolean };
export const SEM_ACEITE: Aceite = { regras: false, vacinas: false };

/** As regras que quem recebe o pedido escreveu (null = não pede aceite). Vêm do banco; a página não guarda nada. */
export function useTermosDoLink(codigo: string) {
  const [termos, setTermos] = useState<TermosDoLink | null>(null);
  const buscar = useCallback(async () => {
    if (!codigo) return null;
    const { data, error } = await banco().rpc("link_opcoes", { p_codigo: codigo });
    if (error) return null;
    const t = (data as unknown as OpcoesNoLink | null)?.termos ?? null;
    const lido = t && typeof t === "object" ? { texto: String(t.texto ?? ""), vacinas: !!t.vacinas } : null;
    setTermos(lido);
    return lido;
  }, [codigo]);
  useEffect(() => { void buscar(); }, [buscar]);
  return { termos, recarregarTermos: buscar };
}

/** O que falta marcar, em uma frase; null quando está tudo aceito (ou não há o que aceitar). */
export function faltaAceitar(termos: TermosDoLink | null, aceite: Aceite, loja: string): string | null {
  if (!termos) return null;
  if (termos.texto && !aceite.regras) return `Para enviar, leia as regras de ${loja} e marque que você aceita.`;
  if (termos.vacinas && !aceite.vacinas) return "Para enviar, marque que as vacinas estão em dia.";
  return null;
}

/**
 * Envia o pedido. Sem regras para aceitar, chama a função de sempre. Com regras, o banco confere se o tutor aceitou
 * exatamente o texto que está valendo e guarda o aceite junto com o pedido.
 */
export function pedirPeloLink(funcao: "link_pedir" | "link_pedir_estadia", args: Record<string, unknown>, termos: TermosDoLink | null, aceite: Aceite) {
  const sb = banco();
  if (!termos) return sb.rpc(funcao, args as never);
  return sb.rpc("link_pedir_com_termos", { p_funcao: funcao, p_args: args as never, p_termos: termos.texto, p_vacinas: aceite.vacinas });
}

/** Regras escritas por quem recebe o pedido, com as caixas que o tutor marca antes de enviar. */
export function AceiteDosTermos({ termos, loja, pets, aceite, aoMudar }: {
  termos: TermosDoLink | null; loja: string; pets: number; aceite: Aceite; aoMudar: (a: Aceite) => void;
}) {
  if (!termos) return null;
  return (
    <div className="g-lk-bloco g-lk-termos">
      {termos.texto && (
        <>
          <h2><ScrollText aria-hidden />Regras de {loja}</h2>
          <div className="g-lk-termos-texto" tabIndex={0} role="region" aria-label={`Regras de ${loja}`}>{termos.texto}</div>
          <label className="g-check grande">
            <input type="checkbox" checked={aceite.regras} onChange={(e) => aoMudar({ ...aceite, regras: e.target.checked })} />
            <span>Li e aceito as regras de {loja}.</span>
          </label>
        </>
      )}
      {termos.vacinas && (
        <label className="g-check grande">
          <input type="checkbox" checked={aceite.vacinas} onChange={(e) => aoMudar({ ...aceite, vacinas: e.target.checked })} />
          <span>{pets > 1 ? "As vacinas dos meus pets estão em dia." : "As vacinas do meu pet estão em dia."}</span>
        </label>
      )}
    </div>
  );
}

/**
 * Pedidos já feitos neste aparelho por este link: o endereço de acompanhar não se perde ao recarregar a página.
 * Fica guardado só no aparelho do tutor.
 */
export function PedidosDesteAparelho({ codigo, versao = 0 }: { codigo: string; versao?: number }) {
  const [lista, setLista] = useState<PedidoLembrado[]>([]);
  useEffect(() => { setLista(pedidosLembrados(codigo)); }, [codigo, versao]);
  if (!lista.length) return null;
  const quando = (em: number) => new Date(em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return (
    <section className="g-lk-meus" aria-label="Seus pedidos neste aparelho">
      <h2><ClipboardCheck aria-hidden />{lista.length > 1 ? "Seus pedidos por aqui" : "Seu pedido por aqui"}</h2>
      <ul>
        {lista.map((x) => (
          <li key={x.id}>
            <a href={`/gestao/agendar/${codigo}/pedido/${x.id}`}>
              <span><b>{x.resumo || "Pedido"}</b><small>pedido em {quando(x.em)}</small></span>
              <u>Acompanhar</u>
            </a>
            <button type="button" aria-label={`Tirar da lista: ${x.resumo || "pedido"}`} onClick={() => { esquecerPedido(codigo, x.id); setLista(pedidosLembrados(codigo)); }}><X aria-hidden /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
