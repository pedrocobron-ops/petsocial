"use client";

import { useState } from "react";
import { ScrollText } from "lucide-react";
import { EXEMPLO_DE_REGRAS, MAX_HORAS, MAX_TERMOS, OPCOES_LINK as K, opcoesDoLink, prazoPorExtenso } from "@/lib/gestao/link-opcoes";
import { salvarOpcoes } from "@/lib/gestao/opcoes";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, Campo, useAvisos, useSomenteLeitura } from "../ui";
import "../financeiro/recebimentos.css";

function Chave({ titulo, apoio, ligado, aoMudar, desligado }: { titulo: string; apoio: string; ligado: boolean; aoMudar: () => void; desligado?: boolean }) {
  return (
    <div className="gr-op-chave">
      <div><b>{titulo}</b><span>{apoio}</span></div>
      <button type="button" role="switch" aria-checked={ligado} aria-label={titulo} className="g-mp-chave" disabled={desligado} onClick={aoMudar}><i /></button>
    </div>
  );
}

/**
 * Opções do link do cliente (Meu pet shop): regras que o tutor aceita antes de pedir e o cancelamento pela página do pedido.
 * Tudo começa desligado: quem não mexer aqui continua com o link de sempre.
 */
export default function OpcoesDoLink() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const o = opcoesDoLink(petshop);
  const [texto, setTexto] = useState(o.termosTexto);
  const [horas, setHoras] = useState(String(o.cancelarHoras));
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function gravar(mudancas: Record<string, unknown>, aviso: string) {
    if (somenteLeitura() || ocupado) return;
    setOcupado(true);
    try {
      await salvarOpcoes(sb, petshop.id, mudancas);
      await recarregarBase();
      avisarMudanca();
      avisar(aviso);
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }

  const textoLimpo = texto.trim().slice(0, MAX_TERMOS);
  const mudouTexto = textoLimpo !== o.termosTexto;
  const nHoras = /^\d{1,3}$/.test(horas.trim()) ? Number(horas.trim()) : null;
  const mudouHoras = nHoras !== o.cancelarHoras;

  async function salvarHoras(e: React.FormEvent) {
    e.preventDefault();
    if (nHoras === null || nHoras > MAX_HORAS) { setErro(`O prazo fica entre 0 e ${MAX_HORAS} horas (30 dias).`); return; }
    setErro(null);
    await gravar({ [K.cancelarHoras]: nHoras }, "Prazo salvo.");
  }

  return (
    <section className="g-card g-pilha" id="opcoes-link">
      <div className="g-mp-t">
        <Tile icone={ScrollText} tom="pessego" />
        <div><h2>Regras e cancelamento pelo link</h2><p className="g-muted g-p">Para quem recebe pedidos pelo link do cliente. Ligue só o que você usa: desligado, nada muda.</p></div>
      </div>
      <div className="gr-op">
        <div className="gr-op-bloco">
          <Chave titulo="Pedir que o cliente aceite as suas regras" ligado={o.termos} desligado={ocupado}
            apoio="O cliente lê o texto que você escrever e marca que aceita antes de enviar o pedido. O pedido guarda o dia, a hora e o texto que ele aceitou."
            aoMudar={() => void gravar({ [K.termos]: !o.termos }, o.termos ? "O link não pede mais o aceite." : "Ligado. Escreva as suas regras e salve.")} />
          {o.termos && (
            <>
              <form className="g-form" onSubmit={(e) => { e.preventDefault(); void gravar({ [K.termosTexto]: textoLimpo }, textoLimpo ? "Regras salvas. Quem pedir daqui em diante aceita este texto." : "Texto apagado."); }}>
                <Campo rotulo="Suas regras" dica={`Escreva com as suas palavras. O sistema não escreve nem confere este texto. ${MAX_TERMOS - texto.length} letras sobrando.`}>
                  <textarea className="g-textarea" rows={5} value={texto} maxLength={MAX_TERMOS} placeholder={EXEMPLO_DE_REGRAS} onChange={(e) => setTexto(e.target.value)} />
                </Campo>
                <div><button className="g-btn sec" disabled={ocupado || !mudouTexto}>{ocupado ? "Salvando…" : "Salvar regras"}</button></div>
              </form>
              <label className="g-check">
                <input type="checkbox" checked={o.termosVacinas} disabled={ocupado}
                  onChange={() => void gravar({ [K.termosVacinas]: !o.termosVacinas }, o.termosVacinas ? "O link não pede mais a declaração de vacinas." : "O cliente vai marcar que as vacinas estão em dia.")} />
                Pedir que o cliente marque “As vacinas do meu pet estão em dia”
              </label>
              <p className="g-muted g-pp">
                {o.pedeAceite
                  ? "Mudou o texto? Os pedidos que já chegaram continuam com o texto que cada cliente aceitou."
                  : "Falta escrever as regras ou marcar a declaração de vacinas: sem isso, o link segue sem pedir aceite."}
              </p>
            </>
          )}
        </div>

        <div className="gr-op-bloco">
          <Chave titulo="O cliente pode cancelar ou pedir outra data pelo link" ligado={o.cancelar} desligado={ocupado}
            apoio="Na página de acompanhar o pedido aparecem Cancelar o pedido e Pedir outra data. Você fica sabendo em Pedidos pelo link, na tela Hoje e na Agenda."
            aoMudar={() => void gravar({ [K.cancelar]: !o.cancelar }, o.cancelar ? "O cliente não cancela mais pelo link." : "Ligado. Confira o prazo abaixo.")} />
          {o.cancelar && (
            <>
              <form className="g-form" onSubmit={salvarHoras}>
                <Campo rotulo="Até quantas horas antes" dica="Vale para o que você já aceitou. 0 deixa cancelar até a hora marcada. Pedido que ainda espera a sua resposta pode ser cancelado a qualquer hora.">
                  <input className="g-input g-tab" inputMode="numeric" style={{ maxWidth: 120 }} value={horas} aria-label="Horas de antecedência para cancelar" onChange={(e) => { setHoras(e.target.value.replace(/\D/g, "").slice(0, 3)); setErro(null); }} />
                </Campo>
                {erro && <p className="g-erro" role="alert">{erro}</p>}
                <div><button className="g-btn sec" disabled={ocupado || !mudouHoras}>{ocupado ? "Salvando…" : "Salvar prazo"}</button></div>
              </form>
              <p className="g-muted g-pp">
                Hoje o cliente cancela ou pede outra data {prazoPorExtenso(o.cancelarHoras)}. Ao cancelar, o horário ou a reserva sai da agenda e a vaga volta.
                Pedir outra data só manda um recado para você responder: nada é desmarcado.
                Dinheiro já recebido nunca é devolvido sozinho: reserva com sinal ou horário com pagamento vira um pedido de cancelamento, e é você quem cancela e decide.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
