"use client";

import Link from "next/link";
import { ChevronRight, Package, ShoppingBag } from "lucide-react";
import { Tile } from "./painel";
import { brl } from "@/lib/gestao/util";
import "./boas-vindas.css";

/**
 * A frente da tela Hoje quando o pet shop escolheu a área principal (`petshops.principal`).
 * Creche e hotel: os números da casa. Loja: vender, o que está acabando e as vendas do dia.
 * Banho e tosa segue com o próximo atendimento, que já é a frente de sempre.
 */
export const ROTA_VENDER = "/gestao/app/estoque?vender=1";

/** Perguntas prontas para o Mozart, começando pelo assunto da área principal. */
export function pedidosDaFrente(frente: "banho" | "casa" | "loja" | null, base: string[]): string[] {
  if (frente === "casa") return ["Quem está na casa hoje?", ...base.slice(1)];
  if (frente === "loja") return ["Que produtos estão acabando?", ...base.slice(1)];
  return base;
}

/** Quem chega e quem sai hoje, ao lado de quantos pets estão na casa. Cada número leva à tela de creche e hotel. */
export function ChegamESaem({ chegam, saem }: { chegam: number; saem: number }) {
  const itens = [
    { valor: chegam, rotulo: chegam === 1 ? "chega hoje (reserva)" : "chegam hoje (reservas)" },
    { valor: saem, rotulo: saem === 1 ? "sai hoje" : "saem hoje" },
  ];
  return (
    <div className="g-hoje-trio">
      {itens.map((i) => <Link key={i.rotulo} href="/gestao/app/creche-hotel"><b>{i.valor}</b><span>{i.rotulo}</span></Link>)}
    </div>
  );
}

type Baixo = { id: string; nome: string; estoque: number; estoque_minimo: number };

/** A frente da loja: vender, os produtos acabando e, para quem vê o financeiro, as vendas de hoje. */
export function FrenteDaLoja({ carregando, produtos, acabando, vendas, novo }: {
  carregando: boolean; produtos: number; acabando: Baixo[];
  /** Vendas de produtos de hoje; null para quem não vê o financeiro. */
  vendas: { quantas: number; total: number } | null;
  /** Ainda não há produto: o primeiro passo é cadastrar. */
  novo: boolean;
}) {
  return (
    <div className="g-proximo vazio">
      <span className="g-rotulo" style={{ color: "#24543b" }}>Loja</span>
      <div className="quem">
        <Tile icone={Package} tom="rosa" tamanho="g" />
        <div style={{ minWidth: 0 }}>
          <b style={{ whiteSpace: "normal", fontSize: "1.375rem" }}>
            {carregando ? "Olhando a prateleira…" : novo ? "A loja começa pelo primeiro produto" : acabando.length === 0 ? "Nenhum produto acabando" : acabando.length === 1 ? "1 produto acabando" : `${acabando.length} produtos acabando`}
          </b>
          {!carregando && !novo && <span style={{ whiteSpace: "normal" }}>{produtos === 1 ? "1 produto na prateleira" : `${produtos} produtos na prateleira`}{vendas ? ` · ${vendas.quantas === 0 ? "nenhuma venda hoje" : `${vendas.quantas === 1 ? "1 venda" : `${vendas.quantas} vendas`} hoje, ${brl(vendas.total)}`}` : ""}</span>}
          {!carregando && novo && <span style={{ whiteSpace: "normal" }}>Cadastre o que você vende. Depois, cada venda dá baixa no estoque sozinha.</span>}
        </div>
      </div>
      {acabando.length > 0 && (
        <ul className="g-hoje-baixos">
          {acabando.slice(0, 3).map((p) => <li key={p.id}><span>{p.nome}</span><span className="g-tag vermelho">{Number(p.estoque) <= 0 ? "zerado" : `restam ${String(Number(p.estoque)).replace(".", ",")}`}</span></li>)}
        </ul>
      )}
      <div className="g-fila">
        {novo ? <Link className="g-btn verde" href="/gestao/app/estoque">Cadastrar o primeiro produto</Link>
          : <Link className="g-btn verde" href={ROTA_VENDER}><ShoppingBag />Vender</Link>}
        {!novo && <Link className="g-btn fantasma p" href="/gestao/app/estoque">Ver o estoque<ChevronRight /></Link>}
      </div>
    </div>
  );
}
