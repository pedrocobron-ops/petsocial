"use client";

import { useState } from "react";
import { ClipboardCheck, RotateCcw } from "lucide-react";
import { CHAVE_EXIGIR, CHAVE_TERMO, exigirDo, IDADE_IDOSO, TERMO_PADRAO, type Exigir } from "@/lib/gestao/entrada";
import { opcao, salvarOpcoes } from "@/lib/gestao/opcoes";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";
import "../loja/loja.css";
import "../entrada/entrada.css";

const QUANDO: { id: Exigir; rotulo: string; apoio: string }[] = [
  { id: "idosos", rotulo: "Só pet idoso", apoio: `Abre sozinho na chegada de pet com ${IDADE_IDOSO} anos ou mais (pela data de nascimento da ficha).` },
  { id: "todos", rotulo: "Todos os pets", apoio: "Abre sozinho em todo Chegou do banho e em todo check-in." },
  { id: "opcional", rotulo: "Só quando eu quiser", apoio: "Nunca abre sozinho: fica o botão Conferir a entrada no horário e no cartão." },
];

/**
 * Checklist de entrada (Meu pet shop, O negócio): quando a folha abre sozinha na chegada e o texto que o tutor aceita.
 * Sempre dá para pular. Só o dono grava.
 */
export function OpcoesDaEntrada() {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const exigir = exigirDo(petshop);
  const guardado = opcao<string>(petshop, CHAVE_TERMO, "").trim();
  const [texto, setTexto] = useState(guardado || TERMO_PADRAO);
  const [salvando, setSalvando] = useState(false);

  async function gravar(mudancas: Record<string, unknown>, aviso: string) {
    if (salvando || somenteLeitura()) return;
    setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, mudancas);
      await recarregarBase();
      avisarMudanca();
      avisar(aviso);
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }
  const limpo = texto.trim();
  const mudouTexto = limpo !== (guardado || TERMO_PADRAO);

  return (
    <section className="g-card g-pilha" id="opcoes-entrada">
      <div className="g-mp-t"><Tile icone={ClipboardCheck} tom="menta" /><div><h2>Checklist de entrada</h2></div></div>
      <p className="g-muted g-p">Quando o pet chega, a equipe anota como ele está (temperamento, feridas, pulgas, pertences) e o tutor dá o ok, assinando no aparelho ou pelo link no WhatsApp. Sempre dá para pular.</p>
      <div className="g-campo">
        <span>Abrir sozinho na chegada</span>
        <div className="g-ent-escolha" role="radiogroup" aria-label="Quando o checklist abre sozinho">
          {QUANDO.map((q) => (
            <button key={q.id} type="button" role="radio" aria-checked={exigir === q.id} className="g-ent-op" disabled={!souDono || salvando}
              style={exigir === q.id ? { borderColor: "var(--g-verde)", background: "var(--g-verde-tint)" } : undefined}
              onClick={() => { if (exigir !== q.id) void gravar({ [CHAVE_EXIGIR]: q.id }, `Checklist de entrada: ${q.rotulo.toLowerCase()}.`); }}>
              <b>{q.rotulo}</b><small>{q.apoio}</small>
            </button>
          ))}
        </div>
      </div>
      <label className="g-campo">
        <span>Texto que o tutor aceita</span>
        <textarea className="g-textarea" style={{ minHeight: 170 }} maxLength={2500} value={texto} disabled={!souDono} onChange={(e) => setTexto(e.target.value)} />
        <small className="g-muted">Escreva {"{pet}"} onde entra o nome do pet. Fale do que já existia e dos riscos, sem prometer nada. O texto aceito fica guardado em cada entrada.</small>
      </label>
      {souDono && (
        <div className="g-fila">
          <button type="button" className="g-btn pri p" disabled={salvando || !mudouTexto || limpo.length < 20} onClick={() => void gravar({ [CHAVE_TERMO]: limpo === TERMO_PADRAO ? "" : limpo }, "Texto do aceite guardado.")}>{salvando ? "Salvando…" : "Salvar o texto"}</button>
          {(guardado || mudouTexto) && <button type="button" className="g-btn fantasma p" disabled={salvando} onClick={() => { setTexto(TERMO_PADRAO); if (guardado) void gravar({ [CHAVE_TERMO]: "" }, "Voltou o texto padrão."); }}><RotateCcw />Texto padrão</button>}
        </div>
      )}
      {!souDono && <p className="g-muted g-pp">Só o dono muda estas opções.</p>}
    </section>
  );
}
