import Image from "next/image";
import Link from "next/link";
import { mozart } from "@/lib/mozart";

export default function NotFound() {
  return (
    <div className="container empty-state">
      <div className="face">
        <Image src={mozart("dormindo")} alt="Mozart dormindo" width={90} height={90} style={{ objectFit: "cover" }} unoptimized />
      </div>
      <h2>Au! Página não encontrada…</h2>
      <p>
        O Mozart cochilou e esta página fugiu.{" "}
        <Link href="/" style={{ textDecoration: "underline" }}>Voltar à capa do jornal</Link>
      </p>
    </div>
  );
}
