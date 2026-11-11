"use client";

import { GestaoProvider } from "@/components/gestao/contexto";
import { AvisosProvider } from "@/components/gestao/ui";
import Casca from "@/components/gestao/casca";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <GestaoProvider>
      <AvisosProvider>
        <Casca>{children}</Casca>
      </AvisosProvider>
    </GestaoProvider>
  );
}
