import { fotoPet } from "@/lib/gestao/supabase";
import { Selo } from "./marca";

/** A logo que o pet shop subiu; sem logo, as iniciais do nome (ou o selo da Maestro Pet, com `padrao="selo"`). */
export default function LogoLoja({ nome, logo, tamanho = 40, padrao = "iniciais", tomSelo }: {
  nome: string; logo?: string | null; tamanho?: number; padrao?: "iniciais" | "selo"; tomSelo?: "claro" | "verde" | "suave";
}) {
  const url = fotoPet(logo);
  if (!url && padrao === "selo") return <Selo tamanho={tamanho} tom={tomSelo} />;
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return (
    <span className="g-logo" style={{ width: tamanho, height: tamanho, borderRadius: Math.round(tamanho * 0.26), fontSize: Math.round(tamanho * 0.4) }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" /> : iniciais}
    </span>
  );
}
