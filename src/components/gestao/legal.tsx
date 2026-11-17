import Link from "next/link";
import { Selo } from "./marca";
import { EMPRESA, identificacao } from "@/lib/empresa";
import { WHATSAPP_SUPORTE_TEXTO, linkSuporte } from "@/lib/gestao/contato";
import { textoVigencia, type Documento } from "@/lib/gestao/documentos";
import "./legal.css";

/** Dado que ainda não existe no repositório: fica à vista, entre colchetes, até alguém preencher (em `src/lib/empresa.ts`). */
export function Preencher({ children }: { children: React.ReactNode }) {
  return <mark className="g-leg-falta">[{children}]</mark>;
}

/** Razão social, CNPJ e endereço vêm de `src/lib/empresa.ts`. Cada um que estiver vazio aparece como marcador. */
export function QuemResponde() {
  if (EMPRESA.pessoaFisica) {
    return (
      <b>
        {EMPRESA.nome || <Preencher>NOME COMPLETO</Preencher>}, pessoa física, inscrito no CPF sob o nº {EMPRESA.cpf || <Preencher>CPF</Preencher>},
        com endereço em {EMPRESA.endereco || <Preencher>ENDEREÇO</Preencher>}
      </b>
    );
  }
  if (EMPRESA.razaoSocial && EMPRESA.cnpj && EMPRESA.endereco) return <b>{identificacao()}</b>;
  return (
    <b>
      {EMPRESA.razaoSocial || <Preencher>RAZÃO SOCIAL</Preencher>}, inscrita no CNPJ sob o nº {EMPRESA.cnpj || <Preencher>CNPJ</Preencher>},
      com sede em {EMPRESA.endereco || <Preencher>ENDEREÇO</Preencher>}
    </b>
  );
}

/** E-mail para assuntos de privacidade, do encarregado e jurídicos. */
export function EmailJuridico() {
  return EMPRESA.emailJuridico ? <a href={`mailto:${EMPRESA.emailJuridico}`}>{EMPRESA.emailJuridico}</a> : <Preencher>E-MAIL DE CONTATO</Preencher>;
}
export function Foro() {
  return EMPRESA.foro ? <>{EMPRESA.foro}</> : <Preencher>FORO</Preencher>;
}
export function Encarregado() {
  return EMPRESA.encarregado ? <>{EMPRESA.encarregado}</> : <Preencher>NOME DO ENCARREGADO</Preencher>;
}

/** Uma parte do documento: título, o resumo curto ("Em resumo") e o texto completo. */
export function Parte({ id, n, titulo, resumo, children }: { id: string; n: number; titulo: string; resumo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="g-leg-parte" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>{n}. {titulo}</h2>
      <p className="g-leg-sintese"><b>Em resumo:</b> {resumo}</p>
      {children}
    </section>
  );
}

/** Índice das partes, com âncoras. */
export function Indice({ partes }: { partes: [id: string, titulo: string][] }) {
  return (
    <details className="g-leg-indice">
      <summary>Ver todas as partes ({partes.length})</summary>
      <ol>{partes.map(([id, t]) => <li key={id}><a href={`#${id}`}>{t}</a></li>)}</ol>
    </details>
  );
}

export function Email() {
  return <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>;
}
export function Zap() {
  return <a href={linkSuporte()} target="_blank" rel="noopener noreferrer">WhatsApp {WHATSAPP_SUPORTE_TEXTO}</a>;
}

/** Moldura das páginas legais do Gestão (Termos de uso e Política de privacidade). A raiz `g g-raiz` vem do layout. */
export default function Legal({ pagina, titulo, resumo, children }: { pagina: Documento; titulo: string; resumo: string; children: React.ReactNode }) {
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
          <p className="g-leg-data">{textoVigencia(pagina)}</p>
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
