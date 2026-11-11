import Link from "next/link";
import { Selo } from "./marca";
import { EMPRESA, identificacao } from "@/lib/empresa";
import { WHATSAPP_SUPORTE_TEXTO, linkSuporte } from "@/lib/gestao/contato";
import "./legal.css";

/** Data da última revisão dos Termos e da Política do Gestão (os dois mudam juntos). */
export const LEGAL_ATUALIZADO_EM = "11 de novembro de 2026";

/** Dado que ainda não existe no repositório: fica à vista até alguém preencher. */
export function Preencher({ children }: { children: React.ReactNode }) {
  return <mark className="g-leg-falta">[PREENCHER: {children}]</mark>;
}

/** Razão social, CNPJ e endereço vêm de `src/lib/empresa.ts`. Enquanto estiverem vazios, aparece o marcador. */
export function QuemResponde() {
  const id = identificacao();
  return id ? <b>{id}</b> : <Preencher>razão social, CNPJ e endereço da empresa dona da marca {EMPRESA.marca}, em src/lib/empresa.ts</Preencher>;
}

export function Email() {
  return <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>;
}
export function Zap() {
  return <a href={linkSuporte()} target="_blank" rel="noopener noreferrer">WhatsApp {WHATSAPP_SUPORTE_TEXTO}</a>;
}

/** Moldura das páginas legais do Gestão (Termos de uso e Política de privacidade). A raiz `g g-raiz` vem do layout. */
export default function Legal({ pagina, titulo, resumo, children }: { pagina: "termos" | "privacidade"; titulo: string; resumo: string; children: React.ReactNode }) {
  return (
    <div className="g-leg">
      <header className="g-leg-topo">
        <Link href="/gestao" className="g-leg-marca"><Selo tamanho={36} tom="verde" /><span>Maestro Pet Gestão</span></Link>
        <nav className="g-leg-nav" aria-label="Documentos">
          <Link href="/gestao/termos" aria-current={pagina === "termos" ? "page" : undefined}>Termos de uso</Link>
          <Link href="/gestao/privacidade" aria-current={pagina === "privacidade" ? "page" : undefined}>Privacidade</Link>
        </nav>
      </header>
      <main className="g-leg-folha">
        <div className="g-leg-abre">
          <h1>{titulo}</h1>
          <p className="g-leg-data">Última atualização: {LEGAL_ATUALIZADO_EM}</p>
          <p className="g-leg-resumo">{resumo}</p>
        </div>
        <div className="g-leg-texto">{children}</div>
      </main>
      <footer className="g-leg-pe">
        <Link href="/gestao/termos">Termos de uso</Link>
        <Link href="/gestao/privacidade">Política de privacidade</Link>
        <Link href="/gestao">Conhecer o Gestão</Link>
        <Link href="/gestao/entrar">Entrar</Link>
      </footer>
    </div>
  );
}
