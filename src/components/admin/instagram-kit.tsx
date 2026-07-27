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

interface ItemFila {
  id: string;
  formato: Formato;
  agendado_para: string;
  status: string;
  erro: string | null;
}

const ROTULO_STATUS: Record<string, string> = {
  agendado: "🕒 Agendado",
  publicando: "📤 Publicando…",
  publicado: "✅ Publicado",
  erro: "❌ Falhou",
  cancelado: "Cancelado",
};

/**
 * O Brasil não tem mais horário de verão, então o fuso de Brasília é sempre
 * -03:00. Isso permite converter sem depender do relógio de quem está usando:
 * o editor pensa em horário de Brasília, o banco guarda em UTC.
 */
function brasiliaParaISO(local: string): string | null {
  if (!local) return null;
  return new Date(`${local}:00-03:00`).toISOString();
}

function paraCampoBrasilia(d: Date): string {
  // "sv-SE" formata como "AAAA-MM-DD HH:MM", que é o formato do input trocando
  // o espaço por T.
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d).replace(" ", "T");
}

function quandoLegivel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
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
  const [fila, setFila] = useState<ItemFila[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [quando, setQuando] = useState(() => {
    // Padrão: próxima hora cheia. Evita agendar para daqui a dois minutos por
    // descuido e deixa espaço para revisar antes de sair.
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return paraCampoBrasilia(d);
  });

  const carregarFila = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("instagram_fila")
      .select("id, formato, agendado_para, status, erro")
      .eq("article_id", artigo.id)
      .order("agendado_para", { ascending: true });
    setFila((data ?? []) as ItemFila[]);
  }, [artigo.id]);

  useEffect(() => { carregarFila(); }, [carregarFila]);

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

  /**
   * Agenda a publicação: sobe a arte para o storage e põe na fila.
   *
   * A imagem precisa ir para uma URL pública porque quem baixa o arquivo é a
   * Meta, não o nosso servidor. Cada agendamento grava um arquivo novo, com
   * carimbo de tempo no nome: se a capa ou o título mudarem e você reagendar,
   * a publicação antiga não é sobrescrita nem serve imagem trocada.
   */
  async function agendar(formato: Formato, agora = false) {
    const canvas = (formato === "post" ? postRef : storyRef).current;
    if (!canvas) return;

    const iso = agora ? new Date().toISOString() : brasiliaParaISO(quando);
    if (!iso) {
      setMsg("❌ Escolha a data e a hora.");
      return;
    }

    setEnviando(true);
    setMsg("");

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92)
    );
    if (!blob) {
      setEnviando(false);
      setMsg("❌ Não consegui gerar a imagem.");
      return;
    }

    const sb = supabaseBrowser();
    const caminho = `instagram/${artigo.id}-${formato}-${Date.now()}.jpg`;
    const { error: erroUpload } = await sb.storage
      .from("sponsored")
      .upload(caminho, blob, { contentType: "image/jpeg", cacheControl: "3600" });

    if (erroUpload) {
      setEnviando(false);
      setMsg(`❌ Não consegui subir a imagem: ${erroUpload.message}`);
      return;
    }

    const { data: publico } = sb.storage.from("sponsored").getPublicUrl(caminho);
    const { error } = await sb.from("instagram_fila").insert({
      article_id: artigo.id,
      formato,
      imagem_url: publico.publicUrl,
      // Story não aceita legenda no Instagram; o texto vive na própria arte.
      legenda: formato === "post" ? legenda : null,
      agendado_para: iso,
    });

    setEnviando(false);
    if (error) {
      setMsg(`❌ ${error.message}`);
      return;
    }
    setMsg(
      agora
        ? "✅ Na fila. Sai no próximo minuto."
        : `✅ ${formato === "post" ? "Post" : "Story"} agendado para ${quando.replace("T", " às ")}.`
    );
    carregarFila();
  }

  async function cancelar(id: string) {
    await supabaseBrowser().from("instagram_fila").delete().eq("id", id);
    carregarFila();
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

        <h2 className="admin-secao">Publicar no Instagram</h2>

        <div className="ig-agenda">
          <label>
            Data e hora (horário de Brasília)
            <input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
          </label>

          <div className="ig-acoes">
            <button
              className="btn-primary" disabled={enviando || desenhando}
              onClick={() => agendar("post")}
            >
              🗓 Agendar post
            </button>
            <button
              className="btn-primary" disabled={enviando || desenhando}
              onClick={() => agendar("story")}
            >
              🗓 Agendar story
            </button>
            <button
              className="btn-ghost" disabled={enviando || desenhando}
              onClick={() => agendar("post", true)}
            >
              🚀 Postar agora
            </button>
          </div>

          <p className="editor-dica">
            Você publica 10 matérias por dia, mas postar 10 vezes por dia no
            Instagram derruba o alcance. Escolha de uma a três, e prefira
            horários em que o seu público está no celular: começo da manhã,
            hora do almoço e começo da noite.
          </p>
        </div>

        {fila && fila.length > 0 && (
          <ul className="ig-fila">
            {fila.map((f) => (
              <li key={f.id} className={`ig-fila-${f.status}`}>
                <span className="ig-fila-quando">
                  <strong>{f.formato === "post" ? "Post" : "Story"}</strong>
                  {" · "}{quandoLegivel(f.agendado_para)}
                </span>
                <span className="ig-fila-status">{ROTULO_STATUS[f.status] ?? f.status}</span>
                {f.erro && <span className="ig-fila-erro">{f.erro}</span>}
                {f.status !== "publicado" && (
                  <button className="btn-ghost" onClick={() => cancelar(f.id)}>
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {msg && <p className="admin-msg">{msg}</p>}
      </div>
    </div>
  );
}
