import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BedDouble, CalendarPlus, Images, MessageCircle, PawPrint, Scissors, Star, Sun } from "lucide-react";
import LogoLoja from "@/components/gestao/logo-loja";
import { corPropria, TEMAS } from "@/lib/gestao/identidade";
import { lerAlbum, type AlbumPublico } from "@/lib/gestao/boletim-servidor";
import { artigoDe } from "@/lib/gestao/modulos";
import { linkWhatsApp } from "@/lib/gestao/util";
import "../../agendar/[codigo]/agendar.css";
import "../../boletim/[token]/boletim.css";

/**
 * Álbum do pet: as fotos dos boletins, por dia, num link que a equipe manda ao tutor (vale 60 dias; sem login).
 * O servidor lê pela função `album_publico`; cada foto vem de /gestao/album/<código>/foto/<n>. Nada do tutor aparece aqui.
 */
export const dynamic = "force-dynamic";

const doPet = (p: AlbumPublico["pet"]) => `${p.sexo === "M" ? "do" : p.sexo === "F" ? "da" : "de"} ${p.nome}`;

async function origem() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const a = await lerAlbum(token);
  const base: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
  if (!a || a === "devagar") return { ...base, title: "Álbum do pet" };
  const titulo = `Álbum ${doPet(a.pet)} · ${a.petshop.nome}`;
  const url = `${await origem()}/gestao/album/${token}`;
  const descricao = `${a.fotos.length === 1 ? "1 foto" : `${a.fotos.length} fotos`} ${doPet(a.pet)} com a gente.`;
  return {
    ...base, title: { absolute: titulo }, description: descricao,
    openGraph: { type: "article", title: titulo, description: descricao, url, siteName: a.petshop.nome, locale: "pt_BR",
      images: a.fotos.length ? [{ url: `${url}/foto/0`, width: 1200, height: 1200, alt: `Foto ${doPet(a.pet)}` }] : undefined },
  };
}

const TIPO = { banho: { icone: Scissors, rotulo: "Banho e tosa" }, creche: { icone: Sun, rotulo: "Creche" }, hotel: { icone: BedDouble, rotulo: "Hotel" } } as const;

export default async function Album({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await lerAlbum(token);
  if (!a) notFound();
  if (a === "devagar") {
    return <div className="g-raiz g-bo"><main className="g-lk-miolo"><p className="g-bo-vazio" role="status">Este álbum foi aberto muitas vezes no último minuto. Espere um minuto e abra de novo.</p></main></div>;
  }
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: "UTC" });
  const nomeDoDia = (iso: string) => fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00Z`));
  const ate = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", timeZone: a.petshop.fuso || "America/Sao_Paulo" }).format(new Date(a.expira_em));
  // um bloco por visita (dia + tipo), na ordem em que vieram (do mais novo para o mais velho)
  const visitas: { chave: string; dia: string; tipo: AlbumPublico["fotos"][number]["tipo"]; fotos: number[] }[] = [];
  a.fotos.forEach((f, n) => {
    const chave = `${f.dia}:${f.tipo ?? ""}`;
    const v = visitas.find((x) => x.chave === chave);
    if (v) v.fotos.push(n); else visitas.push({ chave, dia: f.dia, tipo: f.tipo, fotos: [n] });
  });
  const propria = corPropria(a.petshop.tema);
  const tema = !propria && a.petshop.tema && a.petshop.tema !== "floresta" && TEMAS.some((t) => t.id === a.petshop.tema) ? a.petshop.tema : undefined;
  const estilo = propria ? ({ "--tema": propria.tema, "--destaque": propria.destaque } as React.CSSProperties) : undefined;
  const zap = linkWhatsApp(a.petshop.telefone, `Oi! Vi o álbum ${doPet(a.pet)}.`);
  const foto = (n: number) => `/gestao/album/${token}/foto/${n}`;

  return (
    <div className="g-raiz g-bo" data-tema={tema} style={estilo}>
      <main className="g-lk-miolo">
        <header className="g-bo-cab">
          <div className="g-bo-loja">
            <LogoLoja nome={a.petshop.nome} logo={a.petshop.logo} tamanho={44} />
            <div><b>{a.petshop.nome}</b>{[a.petshop.cidade, a.petshop.uf].filter(Boolean).length > 0 && <span>{[a.petshop.cidade, a.petshop.uf].filter(Boolean).join(" · ")}</span>}</div>
          </div>
          <p className="g-bo-sobre">Álbum {doPet(a.pet)}</p>
          <h1>{a.pet.nome}</h1>
          <p className="g-bo-quando"><span className="g-bo-selo"><Images aria-hidden />{a.fotos.length === 1 ? "1 foto" : `${a.fotos.length} fotos`}</span><span>{visitas.length === 1 ? "1 visita" : `${visitas.length} visitas`}</span></p>
          <PawPrint className="g-bo-pata" aria-hidden />
        </header>

        {visitas.map((v) => {
          const t = v.tipo ? TIPO[v.tipo] : null;
          const Icone = t?.icone ?? PawPrint;
          return (
            <section key={v.chave} className="g-al-visita" aria-label={nomeDoDia(v.dia)}>
              <h2><span>{nomeDoDia(v.dia)}</span>{t && <small><Icone aria-hidden />{t.rotulo}</small>}</h2>
              <div className={`g-al-fotos n${Math.min(v.fotos.length, 3)}`}>
                {v.fotos.map((n) => (
                  <a key={n} href={foto(n)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a foto de ${nomeDoDia(v.dia)}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto(n)} alt={`${a.pet.nome}, ${nomeDoDia(v.dia)}`} loading={n < 3 ? "eager" : "lazy"} decoding="async" />
                  </a>
                ))}
              </div>
            </section>
          );
        })}

        {a.petshop.google && (
          <section className="g-bo-google" aria-label="Avaliar no Google">
            <span className="estrelas" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}</span>
            <b>Gostou do cuidado com {a.pet.sexo === "F" ? `a ${a.pet.nome}` : a.pet.sexo === "M" ? `o ${a.pet.nome}` : a.pet.nome}?</b>
            <p>Avalie {artigoDe(a.petshop.nome).o} {a.petshop.nome} no Google. Leva um minutinho e ajuda outros tutores a encontrar a gente.</p>
            <a className="g-btn sec cheio" href={a.petshop.google} target="_blank" rel="noopener noreferrer"><Star />Avaliar no Google</a>
          </section>
        )}
        <div className="g-bo-acoes">
          {a.petshop.agendar && <a className="g-btn pri cheio" href={`/gestao/agendar/${a.petshop.agendar}`}><CalendarPlus />Marcar o próximo</a>}
          {zap && <a className={`g-btn ${a.petshop.agendar ? "sec" : "zap"} cheio`} href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {a.petshop.nome}</a>}
        </div>
      </main>
      <footer className="g-lk-rodape">
        <span>Este link fica no ar até {ate}.</span>
        <a href="/gestao/privacidade">Privacidade</a>
      </footer>
    </div>
  );
}
