"use client";

import Editor from "@/components/admin/editor";
import { useAdmin } from "@/components/admin/use-admin";
import Link from "next/link";

export default function NovaMateria() {
  const { carregando, session, isAdmin } = useAdmin();
  if (carregando) return <p className="admin-carregando">Carregando…</p>;
  if (!session || !isAdmin) {
    return (
      <p className="admin-carregando">
        Acesso restrito. <Link href="/redacao">Fazer login</Link>
      </p>
    );
  }
  return <Editor />;
}
