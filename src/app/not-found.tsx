import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container prose" style={{ textAlign: "center" }}>
      <Image src="/mozart/sorrindo.webp" alt="Mozart" width={160} height={160} style={{ margin: "0 auto" }} />
      <h1>Au! Página não encontrada…</h1>
      <p>O Mozart procurou por toda parte e não achou esta página. <Link href="/">Voltar ao início</Link></p>
    </div>
  );
}
