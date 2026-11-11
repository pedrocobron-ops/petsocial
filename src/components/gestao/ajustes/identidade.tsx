"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Link2, Palette, Trash2 } from "lucide-react";
import { TEMAS, aplicarTema, reduzirLogo, type Tema } from "@/lib/gestao/identidade";
import { useGestao } from "../contexto";
import LogoLoja from "../logo-loja";
import { Tile } from "../painel";
import { ok, useAvisos, useSomenteLeitura } from "../ui";
import "./identidade.css";

/**
 * Identidade do pet shop: a logo e uma entre seis combinações de cor.
 * Vale para o aplicativo, o link que o cliente recebe, a página do pedido e a agenda impressa.
 */
export default function Identidade() {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);
  const tema = (petshop.tema ?? "floresta") as Tema;

  async function escolherTema(id: Tema) {
    if (id === tema || trocando || somenteLeitura()) return;
    setTrocando(id);
    aplicarTema(id); // mostra na hora
    try {
      ok(await sb.from("petshops").update({ tema: id }).eq("id", petshop.id).select("id"));
      await recarregarBase();
      avisar("Cores trocadas.");
    } catch (e) { aplicarTema(tema); avisarErro(e); } finally { setTrocando(null); }
  }

  async function subir(arquivo: File | undefined) {
    if (!arquivo || somenteLeitura()) return;
    if (!arquivo.type.startsWith("image/")) { avisar("Escolha um arquivo de imagem (PNG, JPG ou WebP)."); return; }
    setEnviando(true);
    try {
      const blob = await reduzirLogo(arquivo);
      const caminho = `${petshop.id}/logo-${crypto.randomUUID()}.webp`;
      const up = await sb.storage.from("pets").upload(caminho, blob, { contentType: "image/webp" });
      if (up.error) throw new Error(up.error.message);
      const antiga = petshop.logo;
      ok(await sb.from("petshops").update({ logo: caminho }).eq("id", petshop.id).select("id"));
      if (antiga) await sb.storage.from("pets").remove([antiga]);
      await recarregarBase();
      avisar("Logo trocada.");
    } catch (e) { avisarErro(e); } finally { setEnviando(false); if (entrada.current) entrada.current.value = ""; }
  }

  async function tirar() {
    if (!petshop.logo || somenteLeitura()) return;
    setEnviando(true);
    try {
      const antiga = petshop.logo;
      ok(await sb.from("petshops").update({ logo: null }).eq("id", petshop.id).select("id"));
      await sb.storage.from("pets").remove([antiga]);
      await recarregarBase();
      avisar("Logo removida.");
    } catch (e) { avisarErro(e); } finally { setEnviando(false); }
  }

  return (
    <section className="g-card g-pilha g-idt">
      <div className="g-idt-t">
        <Tile icone={Palette} tom="lilas" />
        <div><h2>Identidade do pet shop</h2><p className="g-muted g-p">A sua logo e as suas cores no sistema, no link que o cliente recebe e na agenda impressa.</p></div>
      </div>

      <div className="g-idt-logo">
        <LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={72} />
        <div className="g-idt-logo-txt">
          <b>{petshop.logo ? "Sua logo" : "Sem logo ainda"}</b>
          <span className="g-muted g-pp">{petshop.logo ? "Aparece no menu, no link do cliente e na agenda impressa." : "Enquanto isso, aparecem as iniciais do nome. Imagem quadrada fica melhor."}</span>
          <div className="g-idt-logo-acoes">
            <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void subir(e.target.files?.[0])} />
            <button type="button" className="g-btn sec p" disabled={enviando} onClick={() => entrada.current?.click()}><ImagePlus />{enviando ? "Enviando…" : petshop.logo ? "Trocar a logo" : "Subir a logo"}</button>
            {petshop.logo && <button type="button" className="g-btn fantasma p" disabled={enviando} onClick={() => void tirar()}><Trash2 />Tirar</button>}
          </div>
        </div>
      </div>

      <div>
        <p className="g-rotulo" style={{ marginBottom: 8 }}>Cores</p>
        <div className="g-idt-temas" role="radiogroup" aria-label="Cores do pet shop">
          {TEMAS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={t.id === tema} className={`g-idt-tema${t.id === tema ? " on" : ""}`} disabled={!!trocando} onClick={() => void escolherTema(t.id)}>
              <span className="amostra" style={{ background: t.tema }} aria-hidden><i style={{ background: t.destaque }} />{t.id === tema && <Check />}</span>
              <span className="nome">{t.nome}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="g-idt-previa" aria-hidden>
        <div className="cabeca">
          <LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={40} />
          <div><b>{petshop.nome}</b><span>Peça um horário por aqui.</span></div>
        </div>
        <div className="passos"><span className="on"><i>1</i>Serviço</span><span><i>2</i>Dia e hora</span><span><i>3</i>Seus dados</span></div>
        <p className="legenda"><Link2 />Assim o cliente vê o seu link de agendamento.</p>
      </div>
    </section>
  );
}
