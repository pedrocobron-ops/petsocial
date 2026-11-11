"use client";

import { Selo } from "./marca";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, BedDouble, CalendarDays, CalendarClock, CreditCard, Landmark, LifeBuoy, LogOut, Menu, Mic, ShieldCheck, Package, PawPrint, Store, Sun, Ticket, TriangleAlert, Users, Wallet,
} from "lucide-react";
import { useGestao } from "./contexto";
import { planoPorId } from "@/lib/gestao/planos";
import { dataLonga } from "@/lib/gestao/util";
import { AvatarPessoa, EVENTO_ASSISTENTE, EVENTO_MUDOU, Folha } from "./ui";
import BuscaGeral from "./busca-geral";
import { areaDaRota } from "@/lib/gestao/acessos";
import type { Tom } from "./painel";
import Assistente from "./assistente";
import Ajuda from "./ajuda";
import GuiaInicial from "./guia-inicial";
import LogoLoja from "./logo-loja";
import { aplicarTema } from "@/lib/gestao/identidade";

type Item = { href: string; rotulo: string; icone: React.ComponentType; tom: Tom; so?: "financeiro" | "dono" };
const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: "Dia a dia", itens: [
    { href: "/gestao/app", rotulo: "Hoje", icone: Sun, tom: "pessego" },
    { href: "/gestao/app/agenda", rotulo: "Agenda", icone: CalendarDays, tom: "pessego" },
    { href: "/gestao/app/clientes", rotulo: "Clientes e pets", icone: PawPrint, tom: "menta" },
    { href: "/gestao/app/creche-hotel", rotulo: "Creche e hotel", icone: BedDouble, tom: "ceu" },
    { href: "/gestao/app/pacotes", rotulo: "Pacotes", icone: Ticket, tom: "lilas" },
  ] },
  { titulo: "Dinheiro", itens: [
    { href: "/gestao/app/caixa", rotulo: "Caixa", icone: Wallet, tom: "manteiga", so: "financeiro" },
    { href: "/gestao/app/financeiro", rotulo: "Financeiro", icone: Landmark, tom: "menta", so: "financeiro" },
    { href: "/gestao/app/relatorios", rotulo: "Relatórios", icone: BarChart3, tom: "ceu", so: "financeiro" },
    { href: "/gestao/app/estoque", rotulo: "Estoque", icone: Package, tom: "rosa" },
  ] },
  { titulo: "Ajustes", itens: [
    { href: "/gestao/app/equipe", rotulo: "Equipe", icone: Users, tom: "lilas", so: "dono" },
    { href: "/gestao/app/meu-petshop", rotulo: "Meu pet shop", icone: Store, tom: "pessego", so: "dono" },
    { href: "/gestao/app/assinatura", rotulo: "Assinatura", icone: CreditCard, tom: "manteiga", so: "dono" },
  ] },
];

/** Navegação, avisos de assinatura e o botão da assistente em volta de todas as telas do aplicativo. */
export default function Casca({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const { sb, petshop, eu, souDono, posso, liberado, diasDeTeste, sair } = useGestao();
  const [pedidos, setPedidos] = useState(0);
  const [assistente, setAssistente] = useState<{ aberta: boolean; pedido: string }>({ aberta: false, pedido: "" });
  const [mais, setMais] = useState(false);
  const [ajuda, setAjuda] = useState(false);
  const [admin, setAdmin] = useState(false);

  // só a equipe Maestro Pet vê o item "Administrador" no menu
  useEffect(() => { let vale = true; void sb.rpc("sou_admin").then((r) => { if (vale) setAdmin(r.data === true); }); return () => { vale = false; }; }, [sb]);

  // marca de uso: a cada minuto com a tela aberta, diz em que parte do sistema a pessoa está
  useEffect(() => {
    const area = caminho.replace(/^\/gestao\/app\/?/, "").split("/")[0] || "hoje";
    const marcar = () => { if (document.visibilityState === "visible") void sb.rpc("marcar_uso", { p_petshop: petshop.id, p_area: area }).then(() => {}, () => {}); };
    marcar();
    const t = setInterval(marcar, 60000);
    document.addEventListener("visibilitychange", marcar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", marcar); };
  }, [sb, petshop.id, caminho]);

  useEffect(() => {
    const abrir = (e: Event) => { setAjuda(false); setAssistente({ aberta: true, pedido: String((e as CustomEvent).detail ?? "") }); };
    window.addEventListener(EVENTO_ASSISTENTE, abrir);
    return () => window.removeEventListener(EVENTO_ASSISTENTE, abrir);
  }, []);
  useEffect(() => { setMais(false); }, [caminho]);
  // as cores do pet shop valem no aplicativo inteiro; ao sair do aplicativo, volta o padrão
  useEffect(() => { aplicarTema(petshop.tema); return () => aplicarTema(null); }, [petshop.tema]);

  // pedidos pelo link esperando resposta: bolinha com o número no menu, atualizada a cada minuto
  useEffect(() => {
    if (!petshop.link_ativo) { setPedidos(0); return; }
    let vale = true;
    const contar = async () => {
      if (document.visibilityState !== "visible") return;
      const { count } = await sb.from("pedidos_agendamento").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).eq("status", "pendente");
      if (vale) setPedidos(count ?? 0);
    };
    void contar();
    const t = setInterval(() => void contar(), 60000);
    const ouvir = () => void contar();
    window.addEventListener(EVENTO_MUDOU, ouvir);
    document.addEventListener("visibilitychange", ouvir);
    return () => { vale = false; clearInterval(t); window.removeEventListener(EVENTO_MUDOU, ouvir); document.removeEventListener("visibilitychange", ouvir); };
  }, [sb, petshop.id, petshop.link_ativo]);

  const podeRota = (href: string) => { const area = areaDaRota(href); return area ? posso(area) : true; };
  const pode = (i: Item) => (i.so === "dono" ? souDono : podeRota(i.href));
  // tela aberta pelo endereço sem ter acesso: mostra o aviso no lugar da tela
  const soDeDono = ["/gestao/app/equipe", "/gestao/app/meu-petshop", "/gestao/app/assinatura"].some((r) => caminho.startsWith(r));
  const semAcesso = (soDeDono && !souDono) || !podeRota(caminho);
  const atual = (href: string) => (href === "/gestao/app" ? caminho === href : caminho.startsWith(href));
  const grupos = GRUPOS.map((g) => ({ ...g, itens: g.itens.filter(pode) })).filter((g) => g.itens.length);

  const aqui = GRUPOS.flatMap((g) => g.itens.map((item) => ({ grupo: g.titulo, item }))).find((x) => atual(x.item.href));

  const nav = (
    <nav className="g-nav" aria-label="Menu">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <div className="g-nav-t">{g.titulo}</div>
          {g.itens.map((i) => (
            <Link key={i.href} href={i.href} aria-current={atual(i.href) ? "page" : undefined}><i.icone />{i.rotulo}{i.href.endsWith("/agenda") && pedidos > 0 && <span className="g-nav-n" aria-label={`${pedidos} pedidos pelo link esperando resposta`}>{pedidos}</span>}</Link>
          ))}
        </div>
      ))}
      {admin && (
        <div>
          <div className="g-nav-t">Maestro Pet</div>
          <Link href="/gestao/admin"><ShieldCheck />Administrador</Link>
        </div>
      )}
    </nav>
  );

  return (
    <div className="g-app">
      <aside className="g-lado">
        <div className="g-marca">
          <LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={38} padrao="selo" />
          <div><b>{petshop.nome}</b><span>Maestro Pet Gestão</span></div>
        </div>
        {nav}
        <div className="g-lado-pe">
          {souDono && diasDeTeste !== null && (
            <div className="g-lado-plano">
              <b>Teste grátis</b>
              <span>{diasDeTeste <= 0 ? "Terminou." : diasDeTeste === 1 ? "Termina hoje." : `Faltam ${diasDeTeste} dias.`}</span>
              <div className="g-prog"><i style={{ width: `${Math.max(4, Math.min(100, ((7 - diasDeTeste) / 7) * 100))}%` }} /></div>
              <Link href="/gestao/app/assinatura">Ver os planos</Link>
            </div>
          )}
          <div className="g-nav" style={{ marginTop: 10 }}>
            <button onClick={() => { setAssistente({ aberta: false, pedido: "" }); setAjuda(true); }}><LifeBuoy />Ajuda</button>
          </div>
          <div className="g-lado-eu">
            <AvatarPessoa nome={eu.nome} cor={eu.cor} tamanho="p" />
            <div className="t"><b>{eu.nome}</b><span>{souDono ? "Dono" : "Equipe"}{petshop.status === "ativa" ? ` · plano ${planoPorId(petshop.plano)?.nome ?? ""}` : ""}</span></div>
            <button className="g-ico" onClick={() => void sair()} aria-label="Sair" title="Sair"><LogOut /></button>
          </div>
        </div>
      </aside>

      <main className="g-main">
        <div className="g-barra">
          <div className="g-barra-marca"><LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={34} padrao="selo" tomSelo="verde" /><span>{petshop.nome}</span></div>
          {aqui && <div className="g-barra-onde"><span className={`g-tile p ${aqui.item.tom}`} aria-hidden><aqui.item.icone /></span><span>{aqui.grupo} / <b>{aqui.item.rotulo}</b></span></div>}
          {posso("clientes") ? <BuscaGeral /> : <span style={{ flex: 1 }} />}
          <div className="g-barra-data"><CalendarClock />{dataLonga(new Date())}</div>
        </div>
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
        {semAcesso ? (
          <div className="g-card"><div className="g-vazio">
            <Selo tamanho={72} tom="suave" />
            <b>Esta área não está liberada para você</b>
            <p>Quem libera é o dono do pet shop, em Equipe. Se precisar dela para trabalhar, peça para ele ligar o seu acesso.</p>
            <Link className="g-btn verde" href="/gestao/app">Voltar para o início</Link>
          </div></div>
        ) : children}
      </main>

      <nav className="g-abas" aria-label="Menu">
        <Link href="/gestao/app" aria-current={atual("/gestao/app") ? "page" : undefined}><Sun />Hoje</Link>
        <Link href={posso("agenda") ? "/gestao/app/agenda" : "/gestao/app"} aria-current={atual("/gestao/app/agenda") ? "page" : undefined} style={{ position: "relative", opacity: posso("agenda") ? 1 : .35 }}><CalendarDays />Agenda{pedidos > 0 && <span className="g-nav-n aba">{pedidos}</span>}</Link>
        <button className="g-aba-mic" onClick={() => setAssistente({ aberta: true, pedido: "" })} aria-label="Falar com o Mozart, o assistente">
          <span className="b"><Mic /></span>
        </button>
        <Link href={posso("clientes") ? "/gestao/app/clientes" : "/gestao/app"} aria-current={atual("/gestao/app/clientes") ? "page" : undefined} style={{ opacity: posso("clientes") ? 1 : .35 }}><PawPrint />Clientes</Link>
        <button onClick={() => setMais(true)}><Menu />Mais</button>
      </nav>

      <button className={`g-fab${assistente.aberta ? " aberta" : ""}`} onClick={() => { setAjuda(false); setAssistente((a) => ({ aberta: !a.aberta, pedido: "" })); }} aria-expanded={assistente.aberta}>
        <span className="foto"><Selo tamanho={40} /><i aria-hidden /></span>
        <span className="txt"><b>Mozart</b><span>{assistente.aberta ? "fechar a conversa" : "fala comigo"}</span></span>
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
            {admin && (
              <div>
                <div className="g-rotulo" style={{ marginBottom: 4 }}>Maestro Pet</div>
                <div className="g-lista"><Link href="/gestao/admin" className="g-linha"><span className="g-ico" aria-hidden><ShieldCheck /></span><span className="t"><b>Administrador</b></span></Link></div>
              </div>
            )}
            <button className="g-btn verde" onClick={() => { setMais(false); setAjuda(true); }}><LifeBuoy />Ajuda</button>
            <button className="g-btn sec" onClick={() => void sair()}><LogOut />Sair</button>
          </div>
        </Folha>
      )}

      <GuiaInicial />
      {ajuda && <Ajuda aoFechar={() => setAjuda(false)} />}
      {assistente.aberta && <Assistente pedidoInicial={assistente.pedido} aoFechar={() => setAssistente({ aberta: false, pedido: "" })} />}
    </div>
  );
}
