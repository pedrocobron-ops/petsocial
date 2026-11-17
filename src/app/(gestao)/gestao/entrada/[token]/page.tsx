import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BedDouble, ClipboardCheck, HeartPulse, MessageCircle, PawPrint, Scissors, Sun } from "lucide-react";
import LogoLoja from "@/components/gestao/logo-loja";
import { corPropria, TEMAS } from "@/lib/gestao/identidade";
import { lerEntrada } from "@/lib/gestao/entrada-servidor";
import { resumoDaEntrada } from "@/lib/gestao/entrada";
import { linkWhatsApp } from "@/lib/gestao/util";
import AceitarEntrada from "./aceitar";
import "../../agendar/[codigo]/agendar.css";
import "../../boletim/[token]/boletim.css";
import "./entrada.css";

/**
 * Aceite da entrada: a página que o tutor abre pelo link do WhatsApp (sem login). Mostra como o pet chegou (com as fotos), o texto
 * do pet shop e o botão "Li e concordo". O servidor lê tudo por `entrada_publica` (código certo, 7 dias, conta liberada, freio
 * de 60 aberturas por minuto). Fora do Google.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const e = await lerEntrada(token);
  const base: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
  if (!e || e === "devagar") return { ...base, title: "Entrada do pet" };
  return { ...base, title: { absolute: `Entrada de ${e.pet.nome} · ${e.petshop.nome}` }, description: `Confira como ${e.pet.nome} chegou e dê o seu ok.` };
}

export default async function Entrada({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const e = await lerEntrada(token);
  if (!e) notFound();
  if (e === "devagar") {
    return <div className="g-raiz g-bo"><main className="g-lk-miolo"><p className="g-bo-vazio" role="status">Esta página foi aberta muitas vezes no último minuto. Espere um minuto e abra de novo.</p></main></div>;
  }
  const fuso = e.petshop.fuso || "America/Sao_Paulo";
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: fuso });
  const dia = fmt({ weekday: "long", day: "numeric", month: "long" }).format(new Date(e.criado_em));
  const ate = fmt({ day: "numeric", month: "long" }).format(new Date(e.expira_em));
  const tipo = e.tipo === "banho" ? { icone: Scissors, rotulo: "Banho e tosa" } : e.tipo === "creche" ? { icone: Sun, rotulo: "Creche" } : { icone: BedDouble, rotulo: "Hotel" };
  const Icone = tipo.icone;
  const propria = corPropria(e.petshop.tema);
  const tema = !propria && e.petshop.tema && e.petshop.tema !== "floresta" && TEMAS.some((t) => t.id === e.petshop.tema) ? e.petshop.tema : undefined;
  const estilo = propria ? ({ "--tema": propria.tema, "--destaque": propria.destaque } as React.CSSProperties) : undefined;
  const zap = linkWhatsApp(e.petshop.telefone, `Oi! Sobre a entrada de ${e.pet.nome} de hoje:`);
  const foto = (n: number) => `/gestao/entrada/${token}/foto/${n}`;
  const linhas = resumoDaEntrada(e);

  return (
    <div className="g-raiz g-bo g-en" data-tema={tema} style={estilo}>
      <main className="g-lk-miolo">
        <header className="g-bo-cab">
          <div className="g-bo-loja">
            <LogoLoja nome={e.petshop.nome} logo={e.petshop.logo} tamanho={44} />
            <div><b>{e.petshop.nome}</b></div>
          </div>
          <p className="g-bo-sobre">Entrada de {e.pet.nome}</p>
          <h1>Como {e.pet.nome} chegou</h1>
          <p className="g-bo-quando"><span className="g-bo-selo"><Icone aria-hidden />{tipo.rotulo}</span><span>{dia}</span></p>
          <PawPrint className="g-bo-pata" aria-hidden />
        </header>

        <section className="g-bo-bloco" aria-label="O que a equipe anotou">
          <h2><ClipboardCheck aria-hidden className="g-en-ico" />O que a equipe anotou</h2>
          <dl className="g-en-lista">
            {linhas.map((l) => <div key={l.rotulo}><dt>{l.rotulo}</dt><dd>{l.texto}</dd></div>)}
          </dl>
        </section>

        {e.idoso_doente && (
          <section className="g-bo-atencao" aria-label="Cuidado a mais">
            <HeartPulse aria-hidden />
            <div><b>Cuidado a mais</b><p>{e.pet.nome} vai ser tratado com mais calma, com pausas. Se não estiver bem, a equipe para e avisa você.</p></div>
          </section>
        )}

        {e.fotos > 0 && (
          <section className={`g-bo-fotos n${e.fotos}`} aria-label="Fotos do que já existia">
            {Array.from({ length: e.fotos }, (_, i) => (
              <a key={i} href={foto(i)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a foto ${i + 1}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto(i)} alt={`${e.pet.nome}, foto ${i + 1} da entrada`} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
              </a>
            ))}
          </section>
        )}

        <section className="g-bo-carta g-en-termo" aria-label="Texto para você aceitar">
          {e.termo.split("\n").filter((x) => x.trim()).map((p, i) => <p key={i}>{p}</p>)}
        </section>

        <AceitarEntrada token={token} fuso={fuso} aceitoEm={e.aceito_em} nome={e.aceite_nome} />

        {zap && <div className="g-bo-acoes"><a className="g-btn sec cheio" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Algo diferente? Falar com a loja</a></div>}
      </main>
      <footer className="g-lk-rodape">
        <span>Este link fica no ar até {ate}.</span>
        <a href="/gestao/privacidade">Privacidade</a>
      </footer>
    </div>
  );
}
