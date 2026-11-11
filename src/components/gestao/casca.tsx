"use client";

import { Selo } from "./marca";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BedDouble, CalendarDays, CreditCard, Landmark, LifeBuoy, LogOut, Menu, Mic, Package, PawPrint, Store, Sun, Ticket, TriangleAlert, Users, Wallet,
} from "lucide-react";
import { linkSuporte } from "@/lib/gestao/contato";
import { useGestao } from "./contexto";
import { EVENTO_ASSISTENTE, Folha } from "./ui";
import Assistente from "./assistente";

type Item = { href: string; rotulo: string; icone: React.ComponentType; so?: "financeiro" | "dono" };
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: "Dia a dia", itens: [
    { href: "/gestao/app", rotulo: "Hoje", icone: Sun },
    { href: "/gestao/app/agenda", rotulo: "Agenda", icone: CalendarDays },
    { href: "/gestao/app/clientes", rotulo: "Clientes e pets", icone: PawPrint },
    { href: "/gestao/app/creche-hotel", rotulo: "Creche e hotel", icone: BedDouble },
    { href: "/gestao/app/pacotes", rotulo: "Pacotes", icone: Ticket },
  ] },
  { titulo: "Dinheiro", itens: [
    { href: "/gestao/app/caixa", rotulo: "Caixa", icone: Wallet, so: "financeiro" },
    { href: "/gestao/app/financeiro", rotulo: "Financeiro", icone: Landmark, so: "financeiro" },
    { href: "/gestao/app/relatorios", rotulo: "Relatórios", icone: BarChart3, so: "financeiro" },
    { href: "/gestao/app/estoque", rotulo: "Estoque", icone: Package },
  ] },
  { titulo: "Ajustes", itens: [
    { href: "/gestao/app/equipe", rotulo: "Equipe", icone: Users, so: "dono" },
    { href: "/gestao/app/meu-petshop", rotulo: "Meu pet shop", icone: Store, so: "dono" },
    { href: "/gestao/app/assinatura", rotulo: "Assinatura", icone: CreditCard, so: "dono" },
  ] },
];

/** Navegação, avisos de assinatura e o botão da assistente em volta de todas as telas do aplicativo. */
export default function Casca({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const { petshop, eu, souDono, vejoFinanceiro, liberado, diasDeTeste, sair } = useGestao();
  const [assistente, setAssistente] = useState<{ aberta: boolean; pedido: string }>({ aberta: false, pedido: "" });
  const [mais, setMais] = useState(false);

  useEffect(() => {
    const abrir = (e: Event) => setAssistente({ aberta: true, pedido: String((e as CustomEvent).detail ?? "") });
    window.addEventListener(EVENTO_ASSISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ASSISTENTE, abrir);
  }, []);
  useEffect(() => { setMais(false); }, [caminho]);

  const pode = (i: Item) => (i.so === "financeiro" ? vejoFinanceiro : i.so === "dono" ? souDono : true);
  const atual = (href: string) => (href === "/gestao/app" ? caminho === href : caminho.startsWith(href));
  const grupos = GRUPOS.map((g) => ({ ...g, itens: g.itens.filter(pode) })).filter((g) => g.itens.length);

  const nav = (
    <nav className="g-nav" aria-label="Menu">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <div className="g-nav-t">{g.titulo}</div>
          {g.itens.map((i) => (
            <Link key={i.href} href={i.href} aria-current={atual(i.href) ? "page" : undefined}><i.icone />{i.rotulo}</Link>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="g-app">
      <aside className="g-lado">
        <div className="g-marca">
          <Selo tamanho={38} />
          <div><b>{petshop.nome}</b><span>Maestro Pet Gestão</span></div>
        </div>
        {nav}
        <div className="g-lado-pe g-nav">
          <a href={linkSuporte("Oi! Preciso de ajuda com o Maestro Pet Gestão.")} target="_blank" rel="noopener noreferrer"><LifeBuoy />Ajuda no WhatsApp</a>
          <button onClick={() => void sair()}><LogOut />Sair ({eu.nome.split(" ")[0]})</button>
        </div>
      </aside>

      <main className="g-main">
        {!liberado && (
          <div className="g-aviso vermelho" role="alert">
            <TriangleAlert />
            <span>{petshop.status === "teste" ? "Seu teste grátis terminou." : "Sua assinatura está inativa."} Seus dados estão guardados e a conta fica só para consulta até você assinar.</span>
            {souDono && <Link className="g-btn p verde" href="/gestao/app/assinatura">Ver assinatura</Link>}
          </div>
        )}
        {liberado && petshop.status === "atrasada" && (
          <div className="g-aviso" role="alert">
            <TriangleAlert />
            <span>O pagamento da assinatura não foi aprovado. Regularize para não perder o acesso.</span>
            {souDono && <Link className="g-btn p verde" href="/gestao/app/assinatura">Resolver</Link>}
          </div>
        )}
        {liberado && diasDeTeste !== null && diasDeTeste <= 3 && souDono && !caminho.endsWith("/assinatura") && (
          <div className="g-aviso">
            <span>{diasDeTeste <= 1 ? "Seu teste grátis termina hoje." : `Faltam ${diasDeTeste} dias do seu teste grátis.`}</span>
            <Link className="g-btn p verde" href="/gestao/app/assinatura">Assinar</Link>
          </div>
        )}
        {children}
      </main>

      <nav className="g-abas" aria-label="Menu">
        <Link href="/gestao/app" aria-current={atual("/gestao/app") ? "page" : undefined}><Sun />Hoje</Link>
        <Link href="/gestao/app/agenda" aria-current={atual("/gestao/app/agenda") ? "page" : undefined}><CalendarDays />Agenda</Link>
        <button className="g-aba-mic" onClick={() => setAssistente({ aberta: true, pedido: "" })} aria-label="Falar com o Mozart, o assistente">
          <span className="b"><Mic /></span>
        </button>
        <Link href="/gestao/app/clientes" aria-current={atual("/gestao/app/clientes") ? "page" : undefined}><PawPrint />Clientes</Link>
        <button onClick={() => setMais(true)}><Menu />Mais</button>
      </nav>

      <button className="g-fab" onClick={() => setAssistente({ aberta: true, pedido: "" })}>
          <Selo tamanho={38} />
        Pedir ao Mozart
      </button>

      {mais && (
        <Folha titulo={petshop.nome} aoFechar={() => setMais(false)}>
          <div className="g-pilha">
            {grupos.map((g) => (
              <div key={g.titulo}>
                <div className="g-rotulo" style={{ marginBottom: 4 }}>{g.titulo}</div>
                <div className="g-lista">
                  {g.itens.map((i) => (
                    <Link key={i.href} href={i.href} className="g-linha"><span className="g-ico" aria-hidden><i.icone /></span><span className="t"><b>{i.rotulo}</b></span></Link>
                  ))}
                </div>
              </div>
            ))}
            <a className="g-btn zap" href={linkSuporte("Oi! Preciso de ajuda com o Maestro Pet Gestão.")} target="_blank" rel="noopener noreferrer"><LifeBuoy />Ajuda no WhatsApp</a>
            <button className="g-btn sec" onClick={() => void sair()}><LogOut />Sair</button>
          </div>
        </Folha>
      )}

      {assistente.aberta && <Assistente pedidoInicial={assistente.pedido} aoFechar={() => setAssistente({ aberta: false, pedido: "" })} />}
    </div>
  );
}
