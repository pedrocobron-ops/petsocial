"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  enderecoDaMateria,
  legendaPadrao,
  type MateriaSocial,
} from "@/lib/instagram";

/**
 * Kit de Instagram da matéria: gera a arte do post e a do story a partir da
 * capa e do título, e entrega a legenda pronta.
 *
 * As artes são desenhadas em canvas no próprio navegador, não no servidor.
 * Isso evita depender de serviço de imagem, sai de graça e usa as mesmas
 * fontes que o jornal já carrega, então o post nasce com a cara do site.
 */

const LARANJA = "#f97316";
const CREME = "#fff3e0";
const ESCURO = "#16130f";

type Formato = "post" | "story";

const MEDIDAS: Record<Formato, { w: number; h: number; rotulo: string }> = {
  post: { w: 1080, h: 1350, rotulo: "Post (feed)" },
  story: { w: 1080, h: 1920, rotulo: "Story" },
};

interface Props {
  artigo: MateriaSocial & { id: string; ig_legenda: string | null };
}

/** Carrega imagem já liberada para uso em canvas (sem "sujar" o contexto). */
function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Desenha a imagem preenchendo a área, cortando o excesso (como object-fit: cover). */
function cobrir(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number, y: number, w: number, h: number
) {
  const escala = Math.max(w / img.width, h / img.height);
  const dw = img.width * escala;
  const dh = img.height * escala;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    const teste = atual ? `${atual} ${palavra}` : palavra;
    if (atual && ctx.measureText(teste).width > largura) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * Escolhe o maior corpo de texto em que o título ainda cabe no número de
 * linhas disponível. Manchete longa encolhe em vez de ser cortada: perder
 * palavra muda o sentido, perder alguns pontos de tamanho não.
 */
function ajustarTitulo(
  ctx: CanvasRenderingContext2D,
  texto: string, largura: number, maxLinhas: number, tamanhos: number[]
): { linhas: string[]; tamanho: number } {
  for (const tamanho of tamanhos) {
    ctx.font = `800 ${tamanho}px Fraunces, Georgia, serif`;
    const linhas = quebrar(ctx, texto, largura);
    if (linhas.length <= maxLinhas) return { linhas, tamanho };
  }
  const menor = tamanhos[tamanhos.length - 1];
  ctx.font = `800 ${menor}px Fraunces, Georgia, serif`;
  return { linhas: quebrar(ctx, texto, largura).slice(0, maxLinhas), tamanho: menor };
}

function retanguloArredondado(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function chip(
  ctx: CanvasRenderingContext2D,
  texto: string, x: number, y: number, cor: string
): number {
  ctx.font = "700 27px Inter, system-ui, sans-serif";
  const rotulo = texto.toUpperCase();
  const largura = ctx.measureText(rotulo).width + 48;
  const altura = 58;
  ctx.fillStyle = cor;
  retanguloArredondado(ctx, x, y, largura, altura, altura / 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(rotulo, x + 24, y + altura / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return altura;
}

export default function InstagramKit({ artigo }: Props) {
  const postRef = useRef<HTMLCanvasElement>(null);
  const storyRef = useRef<HTMLCanvasElement>(null);
  const [legenda, setLegenda] = useState(artigo.ig_legenda ?? legendaPadrao(artigo));
  const [msg, setMsg] = useState("");
  const [desenhando, setDesenhando] = useState(true);

  const desenhar = useCallback(async () => {
    setDesenhando(true);

    // Sem esperar as fontes, o canvas mede o título com a fonte substituta e
    // a quebra de linha sai errada.
    try {
      await Promise.all([
        document.fonts.load("800 80px Fraunces"),
        document.fonts.load("700 27px Inter"),
        document.fonts.load("600 30px Inter"),
      ]);
    } catch {}

    const [capa, logoClaro, logoEscuro] = await Promise.all([
      artigo.cover_url ? carregarImagem(artigo.cover_url) : Promise.resolve(null),
      carregarImagem("/logos/logo-horizontal-fundo-escuro.png"),
      carregarImagem("/logos/logo-horizontal-1000x120.png"),
    ]);

    const cor = artigo.categoria?.color || LARANJA;
    const categoria = artigo.categoria?.name ?? "Maestro Pet";

    // ---------- POST (feed) ----------
    const post = postRef.current;
    if (post) {
      const { w, h } = MEDIDAS.post;
      post.width = w;
      post.height = h;
      const ctx = post.getContext("2d")!;

      if (capa) {
        cobrir(ctx, capa, 0, 0, w, h);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, cor);
        g.addColorStop(1, ESCURO);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // Véu escuro na metade de baixo para o título ter contraste sobre
      // qualquer foto, inclusive as claras.
      const veu = ctx.createLinearGradient(0, h * 0.34, 0, h);
      veu.addColorStop(0, "rgba(8,6,4,0)");
      veu.addColorStop(0.55, "rgba(8,6,4,0.72)");
      veu.addColorStop(1, "rgba(8,6,4,0.95)");
      ctx.fillStyle = veu;
      ctx.fillRect(0, h * 0.34, w, h * 0.66);

      const margem = 72;
      const util = w - margem * 2;
      const { linhas, tamanho } = ajustarTitulo(
        ctx, artigo.title, util, 5, [84, 76, 68, 60, 54]
      );
      const alturaLinha = tamanho * 1.14;

      const rodapeBase = h - 66;
      const logoAltura = 46;
      const tituloFim = rodapeBase - logoAltura - 54;
      const tituloInicio = tituloFim - alturaLinha * (linhas.length - 1);

      chip(ctx, categoria, margem, tituloInicio - alturaLinha - 44, cor);

      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${tamanho}px Fraunces, Georgia, serif`;
      linhas.forEach((linha, i) => {
        ctx.fillText(linha, margem, tituloInicio + alturaLinha * i);
      });

      if (logoClaro) {
        const escala = logoAltura / logoClaro.height;
        ctx.drawImage(
          logoClaro, margem, rodapeBase - logoAltura,
          logoClaro.width * escala, logoAltura
        );
      }
    }

    // ---------- STORY ----------
    const story = storyRef.current;
    if (story) {
      const { w, h } = MEDIDAS.story;
      story.width = w;
      story.height = h;
      const ctx = story.getContext("2d")!;
      const alturaFoto = 1120;

      ctx.fillStyle = CREME;
      ctx.fillRect(0, 0, w, h);

      if (capa) {
        cobrir(ctx, capa, 0, 0, w, alturaFoto);
      } else {
        ctx.fillStyle = cor;
        ctx.fillRect(0, 0, w, alturaFoto);
      }

      // Faixa da cor da editoria costurando a foto ao painel de texto.
      ctx.fillStyle = cor;
      ctx.fillRect(0, alturaFoto, w, 10);

      const margem = 80;
      const util = w - margem * 2;

      const alturaChip = chip(ctx, categoria, margem, alturaFoto + 78, cor);

      const { linhas, tamanho } = ajustarTitulo(
        ctx, artigo.title, util, 6, [80, 72, 64, 58, 52]
      );
      const alturaLinha = tamanho * 1.16;
      const tituloInicio = alturaFoto + 78 + alturaChip + 76;

      ctx.fillStyle = ESCURO;
      ctx.font = `800 ${tamanho}px Fraunces, Georgia, serif`;
      linhas.forEach((linha, i) => {
        ctx.fillText(linha, margem, tituloInicio + alturaLinha * i);
      });

      const rodapeBase = h - 96;
      ctx.fillStyle = "#6b5f52";
      ctx.font = "600 34px Inter, system-ui, sans-serif";
      ctx.fillText("Leia a matéria completa no link da bio", margem, rodapeBase - 74);

      if (logoEscuro) {
        const logoAltura = 48;
        const escala = logoAltura / logoEscuro.height;
        ctx.drawImage(
          logoEscuro, margem, rodapeBase - logoAltura,
          logoEscuro.width * escala, logoAltura
        );
      }
    }

    setDesenhando(false);
  }, [artigo]);

  useEffect(() => { desenhar(); }, [desenhar]);

  function baixar(formato: Formato) {
    const canvas = (formato === "post" ? postRef : storyRef).current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${artigo.slug}-${formato}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
      },
      "image/jpeg",
      0.92
    );
  }

  async function copiar(texto: string, oQue: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setMsg(`✅ ${oQue} copiado.`);
    } catch {
      setMsg("❌ Não consegui copiar. Selecione o texto e use Ctrl+C.");
    }
  }

  async function salvarLegenda() {
    const { error } = await supabaseBrowser()
      .from("news_articles")
      .update({ ig_legenda: legenda })
      .eq("id", artigo.id);
    setMsg(error ? `❌ ${error.message}` : "✅ Legenda salva.");
  }

  function restaurarLegenda() {
    setLegenda(legendaPadrao(artigo));
    setMsg("Legenda restaurada para o texto gerado.");
  }

  return (
    <div className="ig-kit">
      <div className="ig-artes">
        {(Object.keys(MEDIDAS) as Formato[]).map((formato) => (
          <figure key={formato} className={`ig-arte ig-arte-${formato}`}>
            <canvas ref={formato === "post" ? postRef : storyRef} />
            <figcaption>
              <strong>{MEDIDAS[formato].rotulo}</strong>
              <span>{MEDIDAS[formato].w} × {MEDIDAS[formato].h}</span>
              <button
                className="btn-primary"
                disabled={desenhando}
                onClick={() => baixar(formato)}
              >
                {desenhando ? "Gerando…" : "⬇️ Baixar"}
              </button>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="ig-legenda">
        <h2 className="admin-secao">Legenda do post</h2>
        <textarea
          value={legenda}
          rows={14}
          onChange={(e) => setLegenda(e.target.value)}
        />
        <div className="ig-acoes">
          <button className="btn-primary" onClick={() => copiar(legenda, "Legenda")}>
            📋 Copiar legenda
          </button>
          <button className="btn-ghost" onClick={salvarLegenda}>💾 Salvar</button>
          <button className="btn-ghost" onClick={restaurarLegenda}>↺ Gerar de novo</button>
        </div>

        <p className="editor-dica" style={{ marginTop: 14 }}>
          O story não leva link clicável em conta sem 10 mil seguidores, então a
          arte manda o leitor para o link da bio. Confira se a bio está apontando
          para <code>maestropet.com</code>.
        </p>

        <div className="ig-endereco">
          <span>{enderecoDaMateria(artigo.slug)}</span>
          <button
            className="btn-ghost"
            onClick={() => copiar(enderecoDaMateria(artigo.slug), "Endereço")}
          >
            📋 Copiar link
          </button>
        </div>

        {msg && <p className="admin-msg">{msg}</p>}
      </div>
    </div>
  );
}
