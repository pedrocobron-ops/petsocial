import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container empty-state">
      <div className="face">
        <Image src="/mozart/rosto.png" alt="" width={90} height={90} />
      </div>
      <h2>Au! Página não encontrada…</h2>
      <p>
        O Mozart farejou por toda parte e não achou esta página.{" "}
        <Link href="/" style={{ textDecoration: "underline" }}>Voltar à capa do jornal</Link>
      </p>
    </div>
  );
}
