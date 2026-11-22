"use client";

import { GestaoProvider } from "@/components/gestao/contexto";
import { AvisosProvider } from "@/components/gestao/ui";
import Casca from "@/components/gestao/casca";
import DocumentoProprio from "@/components/gestao/documento-proprio";

export default function LayoutDoApp({ children, nonce }: { children: React.ReactNode; nonce?: string }) {
  return (
    <>
      <DocumentoProprio />
      <GestaoProvider nonce={nonce}>
        <AvisosProvider>
          <Casca>{children}</Casca>
        </AvisosProvider>
      </GestaoProvider>
    </>
  );
}
