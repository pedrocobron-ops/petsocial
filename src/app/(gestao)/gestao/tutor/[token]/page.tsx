import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { BedDouble, CalendarDays, Camera, Check, MessageCircle, PawPrint, ShieldAlert, Sun, Syringe } from "lucide-react";
import LogoLoja from "@/components/gestao/logo-loja";
import type { Database } from "@/lib/gestao/banco";
import { corPropria, TEMAS } from "@/lib/gestao/identidade";
import { SUPABASE_CHAVE, SUPABASE_URL, fotoPet } from "@/lib/gestao/supabase";
import { BUCKET_DIARIO } from "@/lib/gestao/tutor";
import { linkWhatsApp } from "@/lib/gestao/util";
import "../../agendar/[codigo]/agendar.css";
import "./tutor.css";

/**
 * Página do tutor: o link particular de cada tutor (opção "Página do tutor", em Meu pet shop › Cuidado com o tutor).
 * Sem login. O servidor lê tudo pela função `tutor_pagina` (só com o código certo, a opção ligada e a conta liberada) e
 * pede ao bucket privado endereços das fotos que valem 15 minutos, com o código no cabeçalho x-tutor-token.
 * Código errado, trocado ou opção desligada: 404. Sem preços.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Página do tutor", robots: { index: false, follow: false }, referrer: "no-referrer" };

type Foto = { id: string; caminho: string; legenda: string | null; em: string };
type Dia = { dia: string; tipo: string | null; itens: string[]; nota: string | null; ocorrencias: { tipo: string; texto: string; quando: string }[]; fotos: Foto[] };
type PetDaPagina = {
  id: string; nome: string; especie: string | null; sexo: string | null; foto: string | null;
  na_casa: { tipo: string; entrada: string; saida_prevista: string | null } | null;
  dias: Dia[]; agenda: { inicio: string; servico: string | null }[]; reservas: { tipo: string; entrada: string; saida_prevista: string | null }[];
  saude: { tipo: string; nome: string; vence_em: string }[];
};
type Pagina = {
  petshop: { nome: string; logo: string | null; tema: string | null; telefone: string | null; cidade: string | null; uf: string | null; fuso: string };
  tutor: string | null; hoje: string; pets: PetDaPagina[];
};

const OCORRENCIAS: Record<string, string> = { briga: "Briga", machucado: "Machucado", fugiu: "Tentou fugir", vomitou: "Vomitou", outro: "Para você saber" };
const SAUDE: Record<string, string> = { vacina: "Vacina", vermifugo: "Vermífugo", antipulgas: "Antipulgas", outro: "Cuidado" };

async function ler(token: string) {
  if (!/^[0-9a-f]{40,100}$/.test(token)) return null;
  const sb = createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-tutor-token": token }, fetch: (u, i) => fetch(u, { ...i, cache: "no-store" }) },
  });
  const r = await sb.rpc("tutor_pagina", { p_token: token });
  if (r.error || !r.data) return null;
  const p = r.data as unknown as Pagina;
  const caminhos = p.pets.flatMap((x) => x.dias.flatMap((d) => d.fotos.map((f) => f.caminho)));
  const urls = new Map<string, string>();
  if (caminhos.length) {
    const s = await sb.storage.from(BUCKET_DIARIO).createSignedUrls(caminhos, 900);
    for (const x of s.data ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
  }
  return { p, urls };
}

export default async function PaginaDoTutor({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lido = await ler(token);
  if (!lido) notFound();
  const { p, urls } = lido;
  const fuso = p.petshop.fuso || "America/Sao_Paulo";
  const fmt = (o: Intl.DateTimeFormatOptions, tz = fuso) => new Intl.DateTimeFormat("pt-BR", { ...o, timeZone: tz });
  const diaDe = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const ontem = new Date(diaDe(p.hoje).getTime() - 864e5).toISOString().slice(0, 10);
  const nomeDoDia = (iso: string) => (iso === p.hoje ? "Hoje" : iso === ontem ? "Ontem" : fmt({ weekday: "long", day: "numeric", month: "long" }, "UTC").format(diaDe(iso)));
  const dataCurta = (iso: string) => fmt({ day: "2-digit", month: "2-digit" }).format(new Date(iso));
  const diaCurto = (iso: string) => fmt({ day: "2-digit", month: "2-digit" }, "UTC").format(diaDe(iso));
  const hora = (iso: string) => { const [h, m] = fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).split(":"); return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`; };
  const semana = (iso: string) => fmt({ weekday: "short" }).format(new Date(iso)).replace(".", "");

  const propria = corPropria(p.petshop.tema);
  const tema = !propria && p.petshop.tema && p.petshop.tema !== "floresta" && TEMAS.some((t) => t.id === p.petshop.tema) ? p.petshop.tema : undefined;
  const estilo = propria ? ({ "--tema": propria.tema, "--destaque": propria.destaque } as React.CSSProperties) : undefined;
  const zap = linkWhatsApp(p.petshop.telefone, `Oi! Sou ${p.tutor ? `${p.tutor}, ` : ""}tutor(a) de ${p.pets.map((x) => x.nome).join(" e ") || "um pet"}.`);
  const onde = [p.petshop.cidade, p.petshop.uf].filter(Boolean).join(" · ");

  return (
    <div className="g-raiz g-tt" data-tema={tema} style={estilo}>
      <main className="g-lk-miolo">
        <header className="g-lk-cab">
          <div className="g-lk-cab-quem">
            <LogoLoja nome={p.petshop.nome} logo={p.petshop.logo} tamanho={54} />
            <div>
              <h1>{p.petshop.nome}</h1>
              {onde && <p className="g-lk-onde">{onde}</p>}
            </div>
          </div>
          <p className="g-lk-cab-frase">{p.tutor ? `Oi, ${p.tutor}! ` : ""}Aqui está o dia {p.pets.length === 1 ? `de ${p.pets[0].nome}` : "dos seus pets"} com a gente.</p>
        </header>

        {!p.pets.length && <p className="g-tt-vazio">Nenhum pet ativo nesta página.</p>}

        {p.pets.map((pet) => {
          const temAlgo = pet.dias.length || pet.agenda.length || pet.reservas.length || pet.saude.length || pet.na_casa;
          return (
            <section key={pet.id} className="g-tt-pet" aria-label={pet.nome}>
              <div className="g-tt-pet-t">
                <span className="g-tt-avatar">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {fotoPet(pet.foto) ? <img src={fotoPet(pet.foto)!} alt="" /> : <PawPrint aria-hidden />}
                </span>
                <div>
                  <h2>{pet.nome}</h2>
                  {pet.na_casa
                    ? <p className="g-tt-agora">{pet.na_casa.tipo === "hotel" ? <BedDouble aria-hidden /> : <Sun aria-hidden />}{pet.na_casa.tipo === "hotel" ? `No hotel desde ${dataCurta(pet.na_casa.entrada)}${pet.na_casa.saida_prevista ? `, sai em ${dataCurta(pet.na_casa.saida_prevista)}` : ""}` : `Na creche hoje, desde ${hora(pet.na_casa.entrada)}`}</p>
                    : <p className="g-tt-apoio">Não está com a gente agora.</p>}
                </div>
              </div>

              {pet.saude.length > 0 && (
                <ul className="g-tt-avisos">
                  {pet.saude.map((s, i) => (
                    <li key={i} className={s.vence_em < p.hoje ? "vencido" : undefined}><Syringe aria-hidden />
                      <span>{SAUDE[s.tipo] ?? "Cuidado"} {s.nome}: {s.vence_em < p.hoje ? `venceu em ${diaCurto(s.vence_em)}` : s.vence_em === p.hoje ? "vence hoje" : `vence em ${diaCurto(s.vence_em)}`}</span>
                    </li>
                  ))}
                </ul>
              )}

              {(pet.agenda.length > 0 || pet.reservas.length > 0) && (
                <div className="g-tt-bloco">
                  <h3><CalendarDays aria-hidden />O que está marcado</h3>
                  <ul className="g-tt-marcados">
                    {pet.agenda.map((a, i) => <li key={`a${i}`}><b>{semana(a.inicio)}, {dataCurta(a.inicio)} às {hora(a.inicio)}</b><span>{a.servico ?? "Horário marcado"}</span></li>)}
                    {pet.reservas.map((r, i) => <li key={`r${i}`}><b>{r.saida_prevista && r.tipo === "hotel" ? `${dataCurta(r.entrada)} a ${dataCurta(r.saida_prevista)}` : `${semana(r.entrada)}, ${dataCurta(r.entrada)}`}</b><span>{r.tipo === "hotel" ? "Hotel" : "Creche"}</span></li>)}
                  </ul>
                </div>
              )}

              {pet.dias.map((d) => (
                <article key={d.dia} className="g-tt-dia">
                  <h3>{nomeDoDia(d.dia)}{d.tipo ? <small>{d.tipo === "hotel" ? "hotel" : "creche"}</small> : null}</h3>
                  {d.itens.length > 0 && <ul className="g-tt-itens">{d.itens.map((x) => <li key={x}><Check aria-hidden />{x}</li>)}</ul>}
                  {d.nota?.trim() && <p className="g-tt-nota">{d.nota}</p>}
                  {d.ocorrencias.length > 0 && (
                    <ul className="g-tt-ocs">{d.ocorrencias.map((o, i) => <li key={i}><ShieldAlert aria-hidden /><span><b>{OCORRENCIAS[o.tipo] ?? "Para você saber"}</b>, às {hora(o.quando)}{o.texto.trim() ? `. ${o.texto.trim()}` : ""}</span></li>)}</ul>
                  )}
                  {d.fotos.length > 0 && (
                    <ul className="g-tt-fotos" aria-label={`Fotos de ${pet.nome}, ${nomeDoDia(d.dia).toLowerCase()}`}>
                      {d.fotos.map((f) => {
                        const u = urls.get(f.caminho);
                        return (
                          <li key={f.id}>
                            {u ? (
                              <a href={u} target="_blank" rel="noopener noreferrer" aria-label={f.legenda ?? `Abrir a foto de ${pet.nome}`}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={u} alt={f.legenda ?? `${pet.nome}, às ${hora(f.em)}`} loading="lazy" decoding="async" />
                              </a>
                            ) : <span className="sem"><Camera aria-hidden /></span>}
                            {f.legenda && <small>{f.legenda}</small>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              ))}

              {!temAlgo && <p className="g-tt-vazio">Ainda não tem diário nem fotos de {pet.nome}. Quando {pet.sexo === "F" ? "ela" : pet.sexo === "M" ? "ele" : "o pet"} vier, o dia aparece aqui.</p>}
            </section>
          );
        })}

        {zap && <a className="g-btn zap cheio" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {p.petshop.nome}</a>}
      </main>
      <footer className="g-lk-rodape">
        <span>Esta página é só sua. Não repasse o link.</span>
        <a href="/gestao/privacidade">Privacidade</a>
      </footer>
    </div>
  );
}
