"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdmin } from "@/components/admin/use-admin";

const LINKS = [
  { href: "/redacao", rotulo: "📰 Mesa de matérias" },
  { href: "/redacao/nova", rotulo: "✍️ Nova matéria" },
  { href: "/redacao/metricas", rotulo: "📊 Métricas" },
  { href: "/redacao/mozart", rotulo: "🐶 Galeria Mozart" },
  { href: "/redacao/perfil", rotulo: "👤 Meu perfil" },
];

/** Barra do sistema da Redação — identidade própria, independente do jornal. */
export default function AdminShell() {
  const pathname = usePathname();
  const { session } = useAdmin();

  return (
    <div className="adminbar">
      <div className="adminbar-inner">
        <Link href="/redacao" className="adminbar-brand" aria-label="Início da Redação">
          <Image src="/mozart/rosto.png" alt="" width={34} height={34} />
          <span>
            Redação <em>MaestroPet</em>
          </span>
        </Link>

        <nav className="adminbar-nav" aria-label="Menu da Redação">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={
                pathname === l.href || (l.href !== "/redacao" && pathname?.startsWith(l.href))
                  ? "ativo"
                  : ""
              }
            >
              {l.rotulo}
            </Link>
          ))}
          <a href="/" target="_blank" rel="noreferrer">🌐 Ver o jornal ↗</a>
        </nav>

        {session && (
          <div className="adminbar-user">
            <span>{session.user.email?.split("@")[0]}</span>
            <button onClick={() => supabaseBrowser().auth.signOut()}>Sair</button>
          </div>
        )}
      </div>
    </div>
  );
}
