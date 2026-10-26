"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { Instagram, Mail, MessageCircle, X } from "lucide-react";
import Logo from "@/components/logo";
import { EMPRESA, linkInstagram, linkWhatsapp } from "@/lib/empresa";

const NAV_TUTOR: [string, string][] = [["/tutor", "Para tutores"], ["/negocios", "Para negócios pet"], ["/sobre", "Quem faz"], ["/contato", "Ajuda"]];
const NAV_NEGOCIOS: [string, string][] = [["/negocios#manuais", "Manuais"], ["/negocios#como-fazemos", "Como fazemos"], ["/tutor", "Para tutores"], ["/contato", "Ajuda"]];

/**
 * Topo das vitrines e institucionais (brief 20, 6.1): sticky de 60/72 px, logo à esquerda,
 * nav no desktop e hambúrguer com menu em tela cheia no celular (6.2). Nada encolhe.
 */
export default function SiteHeader() {
  const negocios = usePathname()?.startsWith("/negocios") ?? false;
  const nav = negocios ? NAV_NEGOCIOS : NAV_TUTOR;
  const menu = useRef<HTMLDialogElement>(null);
  const fechar = () => menu.current?.close();
  const wa = linkWhatsapp();
  const ig = linkInstagram();
  return (
    <header className="topo topo-fixo">
      <div className="container topo-in">
        <Link href={negocios ? "/negocios" : "/"} className="logo" aria-label={negocios ? "Maestro Pet Negócios, página inicial" : "Maestro Pet, página inicial"}>
          <Logo negocios={negocios} prioridade />
        </Link>
        <nav className="nav" aria-label="Principal">
          {nav.map(([href, t]) => <Link key={href} href={href}>{t}</Link>)}
        </nav>
        <button type="button" className="hamb" aria-label="Abrir menu" aria-haspopup="dialog" onClick={() => menu.current?.showModal()}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden><path d="M4 8h16M4 16h16" /></svg>
        </button>
      </div>
      <dialog ref={menu} className="menu" aria-label="Menu" onClick={(e) => { if (e.target === menu.current) fechar(); }}>
        <div className="menu-in">
          <div className="menu-cab">
            <Link href={negocios ? "/negocios" : "/"} className="logo" onClick={fechar} aria-label={negocios ? "Maestro Pet Negócios, página inicial" : "Maestro Pet, página inicial"}><Logo negocios={negocios} /></Link>
            <button type="button" className="hamb" aria-label="Fechar menu" onClick={fechar}><X size={20} strokeWidth={1.75} aria-hidden /></button>
          </div>
          <nav aria-label="Menu do celular">
            <ul className="menu-links">
              {nav.map(([href, t]) => <li key={href}><Link href={href} onClick={fechar}>{t}</Link></li>)}
            </ul>
          </nav>
          <ul className="menu-contato">
            <li><a href={`mailto:${EMPRESA.email}`}><Mail size={18} aria-hidden />{EMPRESA.email}</a></li>
            {wa && <li><a href={wa}><MessageCircle size={18} aria-hidden />WhatsApp</a></li>}
            {ig && <li><a href={ig} rel="noopener noreferrer"><Instagram size={18} aria-hidden />@{EMPRESA.instagram}</a></li>}
          </ul>
        </div>
      </dialog>
    </header>
  );
}
