import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { BedDouble, CalendarPlus, Check, HeartPulse, MessageCircle, PawPrint, Scissors, Sparkles, Star, Sun } from "lucide-react";
import LogoLoja from "@/components/gestao/logo-loja";
import { corPropria, TEMAS } from "@/lib/gestao/identidade";
import { lerAutorizacaoDoBoletim, lerBoletim, type BoletimPublico } from "@/lib/gestao/boletim-servidor";
import AutorizarFoto from "./autorizar";
import { artigoDe } from "@/lib/gestao/modulos";
import { brl, linkWhatsApp } from "@/lib/gestao/util";
import "../../agendar/[codigo]/agendar.css";
import "./boletim.css";

/**
 * Boletim do pet: a página que o tutor abre pelo link do WhatsApp (sem login, sem aplicativo). O servidor lê tudo pela função
 * `boletim_publico` (só com o código certo, dentro dos 60 dias e com a conta liberada; no máximo 60 aberturas por minuto).
 * Cada foto vem de /gestao/boletim/<código>/foto/<n>. Nada do tutor aparece aqui. Fora do Google; com prévia no WhatsApp.
 */
export const dynamic = "force-dynamic";

/** O endereço deste servidor, para a prévia do WhatsApp (precisa de endereço completo). */
async function origem() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const doPet = (p: BoletimPublico["pet"]) => `${p.sexo === "M" ? "do" : p.sexo === "F" ? "da" : "de"} ${p.nome}`;

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const b = await lerBoletim(token);
  const base: Metadata = { robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };
  if (!b || b === "devagar") return { ...base, title: "Boletim do pet" };
  const titulo = `Boletim ${doPet(b.pet)} · ${b.petshop.nome}`;
  const descricao = b.texto.length > 160 ? `${b.texto.slice(0, 157).replace(/\s+\S*$/, "")}…` : b.texto || `Como foi o dia ${doPet(b.pet)} com a gente.`;
  const url = `${await origem()}/gestao/boletim/${token}`;
  return {
    ...base, title: { absolute: titulo }, description: descricao,
    openGraph: { type: "article", title: titulo, description: descricao, url, siteName: b.petshop.nome, locale: "pt_BR",
      images: b.fotos > 0 ? [{ url: `${url}/foto/0`, width: 1200, height: 1200, alt: `Foto ${doPet(b.pet)}` }] : undefined },
    twitter: { card: b.fotos > 0 ? "summary_large_image" : "summary", title: titulo, description: descricao },
  };
}

function Devagar() {
  return (
    <div className="g-raiz g-bo">
      <main className="g-lk-miolo"><p className="g-bo-vazio" role="status">Este boletim foi aberto muitas vezes no último minuto. Espere um minuto e abra de novo.</p></main>
    </div>
  );
}

export default async function Boletim({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [b, aut] = await Promise.all([lerBoletim(token), lerAutorizacaoDoBoletim(token)]);
  if (!b) notFound();
  if (b === "devagar") return <Devagar />;

  const fuso = b.petshop.fuso || "America/Sao_Paulo";
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: fuso });
  const dia = fmt({ weekday: "long", day: "numeric", month: "long" }).format(new Date(b.tipo === "banho" ? b.quando : b.criado_em));
  const ate = fmt({ day: "numeric", month: "long" }).format(new Date(b.expira_em));
  const tipo = b.tipo === "banho" ? { icone: Scissors, rotulo: "Banho e tosa" }
    : b.tipo === "creche" ? { icone: Sun, rotulo: "Dia de creche" }
    : { icone: BedDouble, rotulo: b.dia_hotel && b.dia_hotel > 0 ? `Hotel · ${b.dia_hotel}º dia` : "Hotel" };
  const Icone = tipo.icone;

  const propria = corPropria(b.petshop.tema);
  const tema = !propria && b.petshop.tema && b.petshop.tema !== "floresta" && TEMAS.some((t) => t.id === b.petshop.tema) ? b.petshop.tema : undefined;
  const estilo = propria ? ({ "--tema": propria.tema, "--destaque": propria.destaque } as React.CSSProperties) : undefined;
  const zap = linkWhatsApp(b.petshop.telefone, `Oi! Vi o boletim ${doPet(b.pet)} de hoje.`);
  const onde = [b.petshop.cidade, b.petshop.uf].filter(Boolean).join(" · ");
  const foto = (n: number) => `/gestao/boletim/${token}/foto/${n}`;
  const servicos = b.tipo === "banho" ? b.servicos : [];

  return (
    <div className="g-raiz g-bo" data-tema={tema} style={estilo}>
      <main className="g-lk-miolo">
        <header className="g-bo-cab">
          <div className="g-bo-loja">
            <LogoLoja nome={b.petshop.nome} logo={b.petshop.logo} tamanho={44} />
            <div>
              <b>{b.petshop.nome}</b>
              {onde && <span>{onde}</span>}
            </div>
          </div>
          <p className="g-bo-sobre">Boletim {doPet(b.pet)}</p>
          <h1>{b.pet.nome}</h1>
          <p className="g-bo-quando"><span className="g-bo-selo"><Icone aria-hidden />{tipo.rotulo}</span><span>{dia}</span></p>
          <PawPrint className="g-bo-pata" aria-hidden />
        </header>

        {b.fotos > 0 && (
          <section className={`g-bo-fotos n${b.fotos}`} aria-label={`Fotos ${doPet(b.pet)}`}>
            {Array.from({ length: b.fotos }, (_, i) => (
              <a key={i} href={foto(i)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a foto ${i + 1} ${doPet(b.pet)}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto(i)} alt={`${b.pet.nome}, foto ${i + 1}`} loading={i === 0 ? "eager" : "lazy"} decoding="async" />
              </a>
            ))}
          </section>
        )}

        {b.texto.trim() && (
          <section className="g-bo-carta" aria-label="Recado da equipe">
            <Sparkles className="g-bo-carta-ico" aria-hidden />
            <p>{b.texto}</p>
            <small>Equipe {b.petshop.nome}</small>
          </section>
        )}

        {b.atencao?.trim() && (
          <section className="g-bo-atencao" aria-label="Para você ficar de olho">
            <HeartPulse aria-hidden />
            <div>
              <b>Para você ficar de olho</b>
              <p>{b.atencao}</p>
              <small>Contamos para você saber. Se continuar, vale mostrar ao veterinário.</small>
            </div>
          </section>
        )}

        {(b.chips.length > 0 || servicos.length > 0 || b.valores) && (
          <section className="g-bo-bloco">
            {servicos.length > 0 && (
              <>
                <h2>O que foi feito</h2>
                <ul className="g-bo-servicos">{servicos.map((s) => <li key={s}><Check aria-hidden />{s}</li>)}</ul>
              </>
            )}
            {b.chips.length > 0 && (
              <>
                <h2>{b.tipo === "banho" ? "Como foi" : "Como foi o dia"}</h2>
                <ul className="g-bo-chips">{b.chips.map((c) => <li key={c}>{c}</li>)}</ul>
              </>
            )}
            {b.valores && (
              <dl className="g-bo-valores">
                <div><dt>Valor do atendimento</dt><dd>{brl(b.valores.total)}</dd></div>
                {b.valores.pago > 0 && <div><dt>Já pago</dt><dd>{brl(b.valores.pago)}</dd></div>}
                {b.valores.falta > 0.004 ? <div className="falta"><dt>Falta pagar</dt><dd>{brl(b.valores.falta)}</dd></div> : <div className="pago"><dt>Pagamento</dt><dd><Check aria-hidden />Tudo pago</dd></div>}
              </dl>
            )}
          </section>
        )}

        {b.fotos > 0 && aut && (
          <AutorizarFoto token={token} fuso={fuso} textos={aut.textos} atual={aut.atual}
            rotulo={`Pode postar a foto ${doPet(b.pet)} nas redes ${artigoDe(b.petshop.nome).do} ${b.petshop.nome}`}
            opcoes={{
              boletim: { titulo: "Só as fotos deste boletim", apoio: b.fotos === 1 ? "A foto de hoje." : `As ${b.fotos} fotos de hoje.` },
              todas: { titulo: "Também as das próximas visitas", apoio: `As de hoje e as que a gente tirar ${doPet(b.pet)} daqui para frente.` },
            }} />
        )}

        <div className="g-bo-acoes">
          {b.petshop.agendar && <a className="g-btn pri cheio" href={`/gestao/agendar/${b.petshop.agendar}`}><CalendarPlus />Marcar o próximo</a>}
          {zap && <a className={`g-btn ${b.petshop.agendar ? "sec" : "zap"} cheio`} href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {b.petshop.nome}</a>}
        </div>
        {b.petshop.google && (
          <section className="g-bo-google" aria-label="Avaliar no Google">
            <span className="estrelas" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}</span>
            <b>Gostou do cuidado com {b.pet.sexo === "F" ? `a ${b.pet.nome}` : b.pet.sexo === "M" ? `o ${b.pet.nome}` : b.pet.nome}?</b>
            <p>Avalie {artigoDe(b.petshop.nome).o} {b.petshop.nome} no Google. Leva um minutinho e ajuda outros tutores a encontrar a gente.</p>
            <a className="g-btn sec cheio" href={b.petshop.google} target="_blank" rel="noopener noreferrer"><Star />Avaliar no Google</a>
          </section>
        )}
      </main>
      <footer className="g-lk-rodape">
        <span>Este link fica no ar até {ate}.</span>
        <a href="/gestao/privacidade">Privacidade</a>
      </footer>
    </div>
  );
}
