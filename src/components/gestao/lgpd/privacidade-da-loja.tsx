"use client";

import { useState } from "react";
import { Copy, Eye, FileText } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Tile } from "@/components/gestao/painel";
import { ok, useAvisos, useDados } from "@/components/gestao/ui";
import { dataCompleta, hora } from "@/lib/gestao/util";
import { avisoDePrivacidadeDaLoja } from "./aviso-texto";
import "./lgpd.css";

type Acesso = { em: string; quem: string | null; motivo: string; canal: string | null; conversa_em: string | null };

/**
 * "Acessos da equipe Maestro Pet": cada vez que alguém da nossa equipe abriu uma conversa deste pet shop com o Mozart ou a
 * Ajuda para dar suporte, com quem abriu, quando e o motivo escrito (migração 20261236). Só o dono vê. Por padrão a equipe
 * vê só números; esta lista é o que a Política de privacidade (parte 9) promete mostrar.
 */
export function AcessosDaEquipeMaestro() {
  const { sb, petshop } = useGestao();
  const { dados, erro } = useDados(async () => (ok(await sb.rpc("equipe_maestro_acessos_ver", { p_petshop: petshop.id })) as unknown as Acesso[]) ?? [], [petshop.id]);
  return (
    <section className="g-card gl-cartao" data-teste="acessos-maestro">
      <div className="g-card-t"><h3><Tile icone={Eye} tom="ceu" tamanho="p" />Acessos da equipe Maestro Pet</h3></div>
      <p className="g-muted g-pp">
        A nossa equipe vê só números das conversas com o Mozart e a Ajuda. Para ler uma conversa e dar suporte, a pessoa precisa escrever o motivo, e cada abertura aparece aqui: quem abriu, quando e por quê.
      </p>
      {erro ? <p className="g-erro">{erro}</p> : !dados ? <p className="g-muted g-pp">Carregando…</p> : !dados.length ? <p className="g-muted g-pp">Ninguém da equipe Maestro Pet abriu conversas deste pet shop.</p> : (
        <ul className="gl-registro">
          {dados.slice(0, 20).map((a, i) => (
            <li key={i}>
              <b>Leu uma conversa com {a.canal === "ajuda" ? "a Ajuda" : "o Mozart"}{a.conversa_em ? ` de ${dataCompleta(a.conversa_em)}` : ""}</b>
              <span>{dataCompleta(a.em)} às {hora(a.em)}{a.quem ? ` · ${a.quem}` : ""}</span>
              <span className="gl-protocolo">Motivo: <b style={{ letterSpacing: 0, overflowWrap: "anywhere" }}>{a.motivo}</b></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Modelo de aviso de privacidade para o pet shop copiar (os Termos pedem que ele informe os clientes; aqui vai o texto
 * pronto) e o link da página "Para o tutor", que explica quem guarda os dados e como pedir cópia ou exclusão.
 */
export function AvisoParaOsClientes() {
  const { petshop } = useGestao();
  const { avisar } = useAvisos();
  const [copiou, setCopiou] = useState(false);
  const texto = avisoDePrivacidadeDaLoja(petshop.nome);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiou(true);
      avisar("Aviso copiado. Cole no WhatsApp, imprima para o balcão ou ponha na ficha de cadastro.");
    } catch {
      avisar("Não consegui copiar sozinho. Selecione o texto e copie.");
    }
  }

  return (
    <section className="g-card gl-cartao" data-teste="aviso-clientes">
      <div className="g-card-t"><h3><Tile icone={FileText} tom="menta" tamanho="p" />Aviso de privacidade para os seus clientes</h3></div>
      <p className="g-muted g-pp">
        A lei (LGPD) pede que o pet shop conte aos clientes o que guarda sobre eles e como pedir para ver ou apagar. Este texto já vem pronto com o nome do seu pet shop:
        copie e use no balcão, na ficha de cadastro ou numa mensagem. Pode ajustar as palavras; se guardar algo a mais, acrescente.
      </p>
      <textarea className="g-textarea" readOnly rows={9} value={texto} aria-label="Aviso de privacidade pronto" onFocus={(e) => e.currentTarget.select()} style={{ fontSize: ".9375rem", lineHeight: 1.45 }} />
      <div className="gl-tutor-acoes">
        <button type="button" className="g-btn sec" onClick={() => void copiar()}><Copy />{copiou ? "Copiado" : "Copiar o aviso"}</button>
        <a className="g-btn fantasma" href="/gestao/para-o-tutor" target="_blank" rel="noopener noreferrer">Abrir a página Para o tutor</a>
      </div>
      <p className="g-muted g-pp">
        A página Para o tutor explica, em poucas linhas, quem guarda os dados (o seu pet shop), o que o Maestro Pet faz e como pedir cópia ou exclusão. Pode mandar o endereço dela junto com o aviso.
        Este modelo é um ponto de partida técnico, não um parecer jurídico.
      </p>
    </section>
  );
}
