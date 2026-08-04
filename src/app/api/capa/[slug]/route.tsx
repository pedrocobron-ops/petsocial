import { ImageResponse } from "next/og";
import { supabase } from "@/lib/supabase";

/**
 * Capa tipográfica gerada pelo jornal, para matéria que ainda não tem foto.
 *
 * Regra editorial: capa é obrigatória. Quando não há fotografia disponível,
 * o certo não é publicar sem imagem nem inventar uma foto: é assumir a
 * ausência com uma capa do próprio jornal, feita de tipografia e da cor da
 * editoria. Ela cumpre o papel visual na home, no compartilhamento e no
 * feed, e some sozinha no dia em que uma foto real entrar no lugar.
 *
 * A imagem sai em 1200x630, medida que WhatsApp, Facebook, X e LinkedIn
 * esperam no card de link.
 */

export const runtime = "edge";
export const revalidate = 86400;

const LARANJA = "#f97316";

/** Título muito longo estoura o card: corta no limite de palavra. */
function encurtar(texto: string, limite: number) {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return (ultimoEspaco > limite * 0.6 ? corte.slice(0, ultimoEspaco) : corte).trimEnd() + "…";
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  const { data } = await supabase
    .from("news_articles")
    .select("title, dek, category:news_categories!category_id(name, color)")
    .eq("slug", slug)
    .maybeSingle();

  // Sem matéria (slug errado, rascunho removido), a capa ainda sai: melhor um
  // card do jornal do que um quadrado quebrado no compartilhamento.
  const categoria = (data?.category as { name?: string; color?: string } | null) ?? null;
  const cor = categoria?.color || LARANJA;
  const editoria = (categoria?.name || "Maestro Pet").toUpperCase();
  const titulo = encurtar(data?.title ?? "Maestro Pet", 110);
  const olho = data?.dek ? encurtar(data.dek, 150) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0b1120",
          padding: "64px 72px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* faixa da cor da editoria, para o card não sair genérico */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "1200px",
            height: "12px",
            background: cor,
            display: "flex",
          }}
        />
        {/* halo suave no canto, na mesma cor, para dar profundidade */}
        <div
          style={{
            position: "absolute",
            right: "-160px",
            bottom: "-200px",
            width: "620px",
            height: "620px",
            borderRadius: "9999px",
            background: cor,
            opacity: 0.16,
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: "40px",
              padding: "0 18px",
              borderRadius: "9999px",
              background: cor,
              color: "#0b1120",
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "1.4px",
            }}
          >
            {editoria}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "1000px" }}>
          <div
            style={{
              display: "flex",
              color: "#ffffff",
              fontSize: titulo.length > 70 ? "58px" : "70px",
              fontWeight: 800,
              lineHeight: 1.08,
              letterSpacing: "-1.5px",
            }}
          >
            {titulo}
          </div>
          {olho && (
            <div
              style={{
                display: "flex",
                color: "#cbd5e1",
                fontSize: "27px",
                lineHeight: 1.35,
              }}
            >
              {olho}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
            <div style={{ display: "flex", color: "#ffffff", fontSize: "30px", fontWeight: 800 }}>
              Maestro Pet
            </div>
            <div style={{ display: "flex", color: "#64748b", fontSize: "22px" }}>
              maestropet.com
            </div>
          </div>
          <div style={{ display: "flex", color: "#64748b", fontSize: "20px" }}>
            jornal do universo pet
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
