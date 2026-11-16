"use client";

import { useState } from "react";
import { ExternalLink, Newspaper, Star } from "lucide-react";
import { CHAVE_GOOGLE, CHAVE_VALORES, lerLinkDoGoogle } from "@/lib/gestao/boletim";
import { opcao, salvarOpcoes } from "@/lib/gestao/opcoes";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";
import "../loja/loja.css";
import "../boletim/boletim.css";

/**
 * "Sua loja aparece no Google?": o link para o cliente avaliar a loja. Aparece no fim do boletim do pet, do álbum e do link de
 * agendamento, para todos os clientes (sem escolher quem, sem brinde: regra do Google). Sem link, nada aparece.
 * Fica em Meu pet shop (O negócio) e no fim do guia da primeira vez (`solto`). Só o dono grava.
 */
export function LojaNoGoogle({ solto }: { solto?: boolean }) {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const guardado = opcao<string>(petshop, CHAVE_GOOGLE, "");
  const [texto, setTexto] = useState(guardado);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(valor: string) {
    if (salvando || somenteLeitura()) return;
    const l = lerLinkDoGoogle(valor);
    if (l.erro) { setErro(l.erro); return; }
    setSalvando(true);
    try {
      await salvarOpcoes(sb, petshop.id, { [CHAVE_GOOGLE]: l.link ?? "" });
      await recarregarBase();
      avisarMudanca();
      setTexto(l.link ?? "");
      avisar(l.link ? "Link do Google guardado. O botão Avaliar no Google aparece no boletim e no link do cliente." : "Link do Google tirado.");
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  const corpo = (
    <>
      <p className="g-muted g-p">Cole o link para o cliente avaliar a loja no Google. O botão aparece no fim do boletim do pet e do link de agendamento, para todos os clientes. Opcional.</p>
      <details className="g-bol-como">
        <summary>Como pegar o link</summary>
        <ol>
          <li>No celular, abra o <b>Perfil da Empresa no Google</b> (pesquise o nome da loja no Google, ou abra o app Google Maps, em Você, Seu perfil da empresa).</li>
          <li>Toque em <b>Pedir avaliações</b> (às vezes aparece como Receber mais avaliações).</li>
          <li>Toque em <b>Copiar link</b>. Fica parecido com g.page/r/…/review ou search.google.com/local/writereview?placeid=…</li>
          <li>Cole aqui embaixo e toque em Salvar.</li>
        </ol>
        <p>Não acha o perfil? Cole o link da loja no Google Maps (Compartilhar, Copiar link): o cliente cai na página da loja e toca em Avaliar.</p>
      </details>
      <label className="g-campo">
        <span>Link do Google</span>
        <input className={`g-input${erro ? " ruim" : ""}`} inputMode="url" value={texto} disabled={!souDono} placeholder="g.page/r/…/review"
          aria-invalid={erro ? true : undefined} onChange={(e) => { setTexto(e.target.value); setErro(null); }} />
        {erro && <small className="erro" role="alert">{erro}</small>}
      </label>
      {souDono && (
        <div className="g-fila">
          <button type="button" className="g-btn pri p" disabled={salvando || texto.trim() === guardado} onClick={() => void salvar(texto)}>{salvando ? "Salvando…" : "Salvar"}</button>
          {guardado && <a className="g-btn fantasma p" href={guardado} target="_blank" rel="noopener noreferrer"><ExternalLink />Testar o link</a>}
          {guardado && <button type="button" className="g-btn fantasma p" disabled={salvando} onClick={() => void salvar("")}>Tirar</button>}
        </div>
      )}
      {!souDono && <p className="g-muted g-pp">Só o dono muda o link do Google.</p>}
    </>
  );
  if (solto) return <div className="g-pilha">{corpo}</div>;
  return (
    <section className="g-card g-pilha" id="loja-google">
      <div className="g-mp-t"><Tile icone={Star} tom="manteiga" /><div><h2>Sua loja aparece no Google?</h2></div></div>
      {corpo}
    </section>
  );
}

/** Opções do boletim do pet: mostrar o valor e o pagamento do banho e tosa (desligado por padrão; só o dono liga). */
export function OpcoesDoBoletim() {
  const { sb, petshop, souDono, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [mudando, setMudando] = useState(false);
  const ligada = opcao(petshop, CHAVE_VALORES, false);

  async function mudar() {
    if (mudando || somenteLeitura()) return;
    setMudando(true);
    try {
      await salvarOpcoes(sb, petshop.id, { [CHAVE_VALORES]: !ligada });
      await recarregarBase();
      avisarMudanca();
      avisar(`Mostrar valor e pagamento no boletim: ${!ligada ? "ligado" : "desligado"}.`);
    } catch (e) { avisarErro(e); } finally { setMudando(false); }
  }

  return (
    <section className="g-card g-pilha" id="opcoes-boletim">
      <div className="g-mp-t"><Tile icone={Newspaper} tom="pessego" /><div><h2>Boletim do pet</h2></div></div>
      <p className="g-muted g-p">O boletim mostra as fotos, o recado e os serviços feitos. Valores ficam de fora, a não ser que você ligue abaixo.</p>
      <div className="g-lj-opcoes">
        <div className="g-lj-opcao">
          <div>
            <b>Mostrar valor e pagamento no boletim</b>
            <p className="g-muted g-p">Só no banho e tosa: o valor do atendimento, o que já foi pago e quanto falta. Nunca mostra outras contas do cliente.</p>
          </div>
          <button type="button" role="switch" aria-checked={ligada} aria-label="Mostrar valor e pagamento no boletim" className="g-lj-chave"
            disabled={!souDono || mudando} onClick={() => void mudar()}><i /></button>
        </div>
      </div>
      {!souDono && <p className="g-muted g-pp">Só o dono liga ou desliga.</p>}
    </section>
  );
}
