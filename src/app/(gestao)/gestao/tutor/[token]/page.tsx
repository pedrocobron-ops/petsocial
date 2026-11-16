import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BedDouble, CalendarDays, Check, MessageCircle, PawPrint, ShieldAlert, Sun, Syringe } from "lucide-react";
import LogoLoja from "@/components/gestao/logo-loja";
import { corPropria, TEMAS } from "@/lib/gestao/identidade";
import { fotoPet } from "@/lib/gestao/supabase";
import { bancoDoTutor, codigoValido } from "@/lib/gestao/tutor-servidor";
import { linkWhatsApp } from "@/lib/gestao/util";
import "../../agendar/[codigo]/agendar.css";
import { AvisoDasFotos, FotoDoTutor } from "./fotos";
import "./tutor.css";

/**
 * Página do tutor: o link particular de cada tutor (opção "Página do tutor", em Meu pet shop › Cuidado com o tutor).
 * Sem login. O servidor lê tudo pela função `tutor_pagina` (só com o código certo, a opção ligada e a conta liberada; no máximo
 * 30 aberturas por minuto por link). Cada foto vem de /gestao/tutor/<código>/foto/<id>, que confere o link de novo (tutor-servidor.ts).
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
  tutor: string | null; hoje: string; dias_fotos?: number; pets: PetDaPagina[];
};

const OCORRENCIAS: Record<string, string> = { briga: "Briga", machucado: "Machucado", fugiu: "Tentou fugir", vomitou: "Vomitou", outro: "Para você saber" };
const SAUDE: Record<string, string> = { vacina: "Vacina", vermifugo: "Vermífugo", antipulgas: "Antipulgas", outro: "Cuidado" };

async function ler(token: string): Promise<Pagina | "devagar" | null> {
  if (!codigoValido(token)) return null;
  const r = await bancoDoTutor(token).rpc("tutor_pagina", { p_token: token });
  if (r.error?.code === "PT429") return "devagar";
  if (r.error || !r.data) return null;
  return r.data as unknown as Pagina;
}

function Devagar() {
  return (
    <div className="g-raiz g-tt">
      <main className="g-lk-miolo"><p className="g-tt-vazio" role="status">Esta página foi aberta muitas vezes no último minuto. Espere um minuto e abra de novo.</p></main>
    </div>
  );
}

export default async function PaginaDoTutor({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await ler(token);
  if (!p) notFound();
  if (p === "devagar") return <Devagar />;
  const dias = p.dias_fotos ?? 90;
  const foto = (id: string) => `/gestao/tutor/${token}/foto/${id}`;
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

        <AvisoDasFotos />

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
                      {d.fotos.map((f, i) => {
                        const legenda = f.legenda && f.legenda !== d.fotos[i - 1]?.legenda ? f.legenda : null; // o mesmo recado em várias fotos aparece uma vez
                        return (
                          <li key={f.id}>
                            <FotoDoTutor src={foto(f.id)} alt={f.legenda ?? `${pet.nome}, às ${hora(f.em)}`} abrir={f.legenda ?? `Abrir a foto de ${pet.nome}`} />
                            {legenda && <small>{legenda}</small>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              ))}

              {pet.na_casa && !pet.dias.some((d) => d.dia === p.hoje) && <p className="g-tt-vazio">O diário e as fotos de hoje aparecem aqui assim que a equipe puser.</p>}
              {!temAlgo && <p className="g-tt-vazio">Ainda não tem diário nem fotos de {pet.nome}. Quando {pet.sexo === "F" ? "ela" : pet.sexo === "M" ? "ele" : "o pet"} vier, o dia aparece aqui.</p>}
            </section>
          );
        })}

        {zap && <a className="g-btn zap cheio" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {p.petshop.nome}</a>}
      </main>
      <footer className="g-lk-rodape">
        <span>Esta página é só sua. Não repasse o link. As fotos ficam guardadas por {dias} dias e depois são apagadas.</span>
        <a href="/gestao/privacidade">Privacidade</a>
      </footer>
    </div>
  );
}
