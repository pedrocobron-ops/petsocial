import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Check, Share2 } from "lucide-react";
import LogoLoja from "@/components/gestao/logo-loja";
import { corPropria, TEMAS } from "@/lib/gestao/identidade";
import { lerAutorizacao } from "@/lib/gestao/boletim-servidor";
import NaoQueroMais from "./nao-quero-mais";
import "../../agendar/[codigo]/agendar.css";
import "../../boletim/[token]/boletim.css";

/**
 * "Não quero mais": o link que o tutor recebe ao autorizar a loja a postar as fotos do pet. Vale para sempre (mesmo depois que o
 * boletim some) e tira, num toque, todas as autorizações que estão valendo para o pet. Sem login; fora do Google.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fotos nas redes", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

const doPet = (p: { nome: string; sexo: string | null }) => `${p.sexo === "M" ? "do" : p.sexo === "F" ? "da" : "de"} ${p.nome}`;

export default async function Autorizacao({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const a = await lerAutorizacao(codigo);
  if (!a) notFound();
  if (a === "devagar") {
    return <div className="g-raiz g-bo"><main className="g-lk-miolo"><p className="g-bo-vazio" role="status">Muitos acessos a este link agora. Espere um minuto e abra de novo.</p></main></div>;
  }
  const propria = corPropria(a.petshop.tema);
  const tema = !propria && a.petshop.tema && a.petshop.tema !== "floresta" && TEMAS.some((t) => t.id === a.petshop.tema) ? a.petshop.tema : undefined;
  const estilo = propria ? ({ "--tema": propria.tema, "--destaque": propria.destaque } as React.CSSProperties) : undefined;
  const desde = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(a.desde));
  const valendo = a.ativas > 0;

  return (
    <div className="g-raiz g-bo" data-tema={tema} style={estilo}>
      <main className="g-lk-miolo">
        <header className="g-bo-cab">
          <div className="g-bo-loja">
            <LogoLoja nome={a.petshop.nome} logo={a.petshop.logo} tamanho={44} />
            <div><b>{a.petshop.nome}</b></div>
          </div>
          <p className="g-bo-sobre">Fotos {doPet(a.pet)} nas redes</p>
          <h1>{a.pet.nome}</h1>
        </header>
        <section className={`g-bo-redes ${valendo ? "aberto" : "ok"}`} aria-label="Autorização">
          <p className="g-bo-redes-t">{valendo ? <Share2 aria-hidden /> : <Check aria-hidden />}<b>{valendo ? "A autorização está valendo" : "Autorização retirada"}</b></p>
          <div className="g-bo-redes-texto previa">
            <small>O que você autorizou em {desde}:</small>
            <p>{a.texto}</p>
          </div>
          <NaoQueroMais codigo={codigo} valendo={valendo} dePet={doPet(a.pet)} loja={a.petshop.nome} />
        </section>
      </main>
      <footer className="g-lk-rodape">
        <span>Este link é seu: guarde para tirar a autorização quando quiser.</span>
        <a href="/gestao/privacidade">Privacidade</a>
      </footer>
    </div>
  );
}
