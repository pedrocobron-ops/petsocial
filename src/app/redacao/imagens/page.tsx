"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAdmin, revalidarSite } from "@/components/admin/use-admin";

/**
 * Página que resolve a imagem das matérias pendentes assim que abre.
 *
 * O buscador individual e o botão da mesa já existem, mas os dois exigem que
 * alguém lembre de acionar. Esta tela existe para o caso em que o editor só
 * quer que o problema suma: ela começa sozinha, mostra o que está fazendo e
 * termina com um relatório do que entrou e do que não achou foto.
 *
 * A busca acontece no servidor do site, que tem saída para a internet. Só
 * entra imagem de domínio público, CC0 ou CC BY, com crédito do autor.
 */

interface Processada {
  slug: string;
  capa: string | null;
  fotos: number;
  aviso?: string;
}

export default function ImagensPendentesPage() {
  const { carregando, session, isAdmin } = useAdmin();
  const [rodando, setRodando] = useState(false);
  const [terminou, setTerminou] = useState(false);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [capas, setCapas] = useState(0);
  const [fotos, setFotos] = useState(0);
  const [semFoto, setSemFoto] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const jaComecou = useRef(false);

  const rodar = useCallback(async () => {
    setRodando(true);
    setErro("");
    const { data } = await supabaseBrowser().auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setErro("Sessão expirada. Entre de novo na Redação.");
      setRodando(false);
      return;
    }

    let nCapas = 0;
    let nFotos = 0;
    const falhas: string[] = [];

    try {
      // Teto de voltas para nunca girar sem fim: a fila drena mesmo quando
      // uma matéria não acha candidata, então isto é só uma trava de segurança.
      for (let volta = 0; volta < 60; volta++) {
        const r = await fetch("/api/imagens-pendentes", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ lote: 3 }),
        });
        const j = await r.json();
        if (!j.ok) {
          setErro(j.erro ?? "A busca falhou.");
          break;
        }

        for (const p of (j.processadas ?? []) as Processada[]) {
          if (p.capa) nCapas++;
          else falhas.push(p.slug);
          nFotos += p.fotos ?? 0;
        }
        setCapas(nCapas);
        setFotos(nFotos);
        setSemFoto([...falhas]);
        setRestantes(j.restantes ?? 0);

        if (!j.processadas?.length || j.restantes === 0) break;
      }
    } catch (e) {
      setErro(String(e));
    }

    setRodando(false);
    setTerminou(true);
    await revalidarSite();
  }, []);

  useEffect(() => {
    if (isAdmin && !jaComecou.current) {
      jaComecou.current = true;
      rodar();
    }
  }, [isAdmin, rodar]);

  if (carregando) return <p className="admin-carregando">Carregando…</p>;
  if (!session || !isAdmin) {
    return (
      <div className="admin-panel">
        <p className="admin-msg">
          Entre na <Link href="/redacao">Redação</Link> para usar esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <header className="admin-topo">
        <div className="admin-titulo">
          <div>
            <h1>Imagens das matérias</h1>
            <span>
              Busca no Wikimedia Commons, só domínio público, CC0 ou CC BY, com crédito do autor
            </span>
          </div>
        </div>
        <div className="admin-acoes">
          <Link href="/redacao" className="btn-ghost">← Voltar à mesa</Link>
        </div>
      </header>

      <div className="buscaimg" style={{ marginTop: 16 }}>
        {rodando && (
          <p>
            <b>Trabalhando…</b> {capas} capas e {fotos} fotos inseridas
            {restantes !== null && `, ${restantes} matérias na fila`}. Pode deixar a aba aberta.
          </p>
        )}

        {terminou && !erro && (
          <>
            <p>
              <b>✅ Pronto.</b> {capas} capas e {fotos} fotos de corpo entraram, com crédito e
              licença na legenda.
            </p>
            {semFoto.length > 0 && (
              <>
                <p className="buscaimg-dica" style={{ marginTop: 12 }}>
                  Estas não acharam candidata livre para o termo usado. Abra cada uma e use o
                  botão 🔎 Buscar imagem com outras palavras, em inglês:
                </p>
                <ul style={{ margin: "8px 0 0 18px", fontSize: 14, lineHeight: 1.7 }}>
                  {semFoto.map((slug) => (
                    <li key={slug}>{slug}</li>
                  ))}
                </ul>
              </>
            )}
            {restantes !== null && restantes > 0 && (
              <p className="buscaimg-msg">
                Ainda restam {restantes} na fila.{" "}
                <button type="button" className="btn-ghost" onClick={rodar}>
                  Continuar
                </button>
              </p>
            )}
          </>
        )}

        {erro && (
          <p className="buscaimg-msg">
            ❌ {erro}{" "}
            <button type="button" className="btn-ghost" onClick={rodar}>
              Tentar de novo
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
