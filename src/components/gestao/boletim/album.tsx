"use client";

import { useState } from "react";
import { BedDouble, Copy, Images, Link2, MessageCircle, Scissors, Sun, Trash2 } from "lucide-react";
import { BUCKET_BOLETIM, doPet, type Sexo } from "@/lib/gestao/boletim";
import { fotoPet } from "@/lib/gestao/supabase";
import { chamar, dataLonga, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, Esqueleto, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { EtiquetaFoto, estadoDaFoto, useAutorizacoesDoPet } from "./autorizacao";
import "./boletim.css";

/**
 * Álbum do pet, na ficha: as fotos dos boletins e o antes e depois do banho, por visita, do mais novo para o mais velho.
 * As fotos do boletim ficam guardadas enquanto o pet existir (o link do boletim vale 60 dias; as fotos, não). Só o dono apaga
 * uma foto. "Mandar o álbum" cria um link novo (60 dias) com as fotos de agora, para o tutor ver sem instalar nada.
 */
type Foto = { url: string; rotulo?: string; caminho?: string; boletim?: string };
type VisitaDoAlbum = { chave: string; quando: string; tipo: "banho" | "creche" | "hotel"; fotos: Foto[]; /** o boletim da visita e quando ele nasceu (para a autorização das redes) */ boletim?: string; boletimEm?: string };
const ICONE = { banho: Scissors, creche: Sun, hotel: BedDouble } as const;
const ROTULO = { banho: "Banho e tosa", creche: "Creche", hotel: "Hotel" } as const;
const SEGUNDOS = 61 * 86400;
const POR_VEZ = 8;

export default function AlbumDoPet({ pet, tutor }: { pet: { id: string; nome: string; sexo: Sexo }; tutor: { nome: string | null; telefone: string | null } | null }) {
  const { sb, petshop, posso, souDono } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [mostrar, setMostrar] = useState(POR_VEZ);
  const [link, setLink] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const pode = posso("agenda") || posso("creche_hotel");
  const autorizacoes = useAutorizacoesDoPet(pode ? pet.id : null);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    if (!pode) return { visitas: [] as VisitaDoAlbum[], caminhos: [] as string[] };
    const [b, a] = await Promise.all([
      sb.from("boletins").select("id, fotos, criado_em, agendamento_id, estadia_id, estadias(tipo), agendamentos(inicio)")
        .eq("petshop_id", petshop.id).eq("pet_id", pet.id).order("criado_em", { ascending: false }).limit(300),
      posso("agenda")
        ? sb.from("agendamentos").select("id, inicio, foto_antes, foto_depois").eq("petshop_id", petshop.id).eq("pet_id", pet.id)
          .or("foto_antes.not.is.null,foto_depois.not.is.null").order("inicio", { ascending: false }).limit(100)
        : Promise.resolve({ data: [] as { id: string; inicio: string; foto_antes: string | null; foto_depois: string | null }[], error: null }),
    ]);
    const boletins = ok(b) as unknown as { id: string; fotos: string[]; criado_em: string; agendamento_id: string | null; estadia_id: string | null; estadias: { tipo: string } | null; agendamentos: { inicio: string } | null }[];
    const caminhos = boletins.flatMap((x) => x.fotos);
    const urls = new Map<string, string>();
    for (let i = 0; i < caminhos.length; i += 100) {
      const s = await sb.storage.from(BUCKET_BOLETIM).createSignedUrls(caminhos.slice(i, i + 100), 3600);
      for (const x of s.data ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
    }
    const mapa = new Map<string, VisitaDoAlbum>();
    // antes e depois do banho (bucket de fotos do pet)
    for (const x of ok(a) ?? []) {
      const v: VisitaDoAlbum = { chave: `a:${x.id}`, quando: x.inicio, tipo: "banho", fotos: [] };
      if (x.foto_antes) v.fotos.push({ url: fotoPet(x.foto_antes)!, rotulo: "Antes" });
      if (x.foto_depois) v.fotos.push({ url: fotoPet(x.foto_depois)!, rotulo: "Depois" });
      mapa.set(v.chave, v);
    }
    for (const x of boletins) {
      if (!x.fotos.length) continue;
      const tipo = x.agendamento_id ? "banho" : x.estadias?.tipo === "hotel" ? "hotel" : "creche";
      const chave = x.agendamento_id ? `a:${x.agendamento_id}` : `e:${x.estadia_id}:${x.criado_em.slice(0, 10)}`;
      const v = mapa.get(chave) ?? { chave, quando: x.agendamentos?.inicio ?? x.criado_em, tipo, fotos: [] };
      if (!v.boletim) { v.boletim = x.id; v.boletimEm = x.criado_em; }
      for (const c of x.fotos) if (urls.get(c)) v.fotos.push({ url: urls.get(c)!, caminho: c, boletim: x.id });
      mapa.set(chave, v);
    }
    const visitas = [...mapa.values()].filter((v) => v.fotos.length).sort((x, y) => (x.quando < y.quando ? 1 : -1));
    return { visitas, caminhos };
  }, [petshop.id, pet.id, pode]);

  if (!pode) return null;
  const visitas = dados?.visitas ?? [];
  const total = visitas.reduce((t, v) => t + v.fotos.length, 0);

  async function apagar(f: Foto) {
    if (!f.boletim || !f.caminho || somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Apagar esta foto?", texto: `Ela sai do álbum ${doPet(pet.nome, pet.sexo)}, do boletim e de qualquer link já mandado. Não dá para desfazer.`, confirmar: "Apagar foto", perigo: true }))) return;
    try {
      const c = ok(await sb.rpc("boletim_apagar_foto", { p_boletim: f.boletim, p_caminho: f.caminho })) as string;
      await sb.storage.from(BUCKET_BOLETIM).remove([c]);
      avisar("Foto apagada.");
      avisarMudanca();
      void recarregar();
    } catch (e) { avisarErro(e); }
  }

  async function criarLink() {
    if (criando || somenteLeitura() || !dados?.caminhos.length) return;
    setCriando(true);
    try {
      const caminhos = dados.caminhos.slice(0, 200);
      const lista: { caminho: string; assinatura: string }[] = [];
      for (let i = 0; i < caminhos.length; i += 100) {
        const s = await sb.storage.from(BUCKET_BOLETIM).createSignedUrls(caminhos.slice(i, i + 100), SEGUNDOS);
        if (s.error) throw new Error("Não consegui preparar as fotos. Tente de novo.");
        for (const x of s.data ?? []) {
          const t = x.signedUrl ? new URL(x.signedUrl).searchParams.get("token") : null;
          if (x.path && t) lista.push({ caminho: x.path, assinatura: t });
        }
      }
      const r = ok(await sb.rpc("album_criar", { p_petshop: petshop.id, p_pet: pet.id, p_fotos: lista })) as { token: string };
      setLink(`${window.location.origin}/gestao/album/${r.token}`);
      avisar("Link do álbum pronto. Vale 60 dias.");
    } catch (e) { avisarErro(e); } finally { setCriando(false); }
  }

  const quem = chamar(tutor?.nome);
  const zap = link ? linkWhatsApp(tutor?.telefone, `${quem ? `Oi, ${quem}!` : "Oi!"} O álbum ${doPet(pet.nome, pet.sexo)} com a gente: ${link}`) : null;

  return (
    <section className="g-card g-bol-album" aria-label={`Álbum ${doPet(pet.nome, pet.sexo)}`}>
      <div className="g-card-t"><h3><Tile icone={Images} tom="pessego" tamanho="p" />Álbum</h3>{total > 0 && <span className="g-muted g-pp" style={{ whiteSpace: "nowrap" }}>{total === 1 ? "1 foto" : `${total} fotos`}</span>}</div>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {carregando && !dados ? <Esqueleto linhas={2} /> : !visitas.length ? (
        <p className="g-muted g-p">Ainda sem fotos. As fotos dos boletins e do antes e depois do banho aparecem aqui, por visita.</p>
      ) : (
        <>
          {visitas.slice(0, mostrar).map((v) => {
            const Icone = ICONE[v.tipo];
            return (
              <div key={v.chave} className="g-bol-album-visita">
                <p><b>{dataLonga(v.quando)}</b><span className="g-tag"><Icone size={12} aria-hidden />{ROTULO[v.tipo]}</span>
                  {autorizacoes && <EtiquetaFoto estado={estadoDaFoto(autorizacoes, v.boletim, v.boletimEm ?? v.quando)} />}</p>
                <ul>
                  {v.fotos.map((f, i) => (
                    <li key={f.caminho ?? `${v.chave}${i}`}>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir a foto de ${dataLonga(v.quando)}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.url} alt={`${pet.nome}${f.rotulo ? `, ${f.rotulo.toLowerCase()}` : ""}`} loading="lazy" />
                      </a>
                      {f.rotulo && <small>{f.rotulo}</small>}
                      {souDono && f.boletim && <button type="button" className="g-bol-foto-x" aria-label="Apagar esta foto" onClick={() => void apagar(f)}><Trash2 aria-hidden /></button>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {visitas.length > mostrar && <button type="button" className="g-btn fantasma p" onClick={() => setMostrar((n) => n + POR_VEZ)}>Ver mais visitas</button>}
          {dados && dados.caminhos.length > 0 && (
            <div className="g-fila">
              {!link ? (
                <button type="button" className="g-btn sec p" disabled={criando} onClick={() => void criarLink()}><Link2 />{criando ? "Preparando…" : "Mandar o álbum para o tutor"}</button>
              ) : (
                <>
                  {zap && <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar no WhatsApp</a>}
                  <button type="button" className="g-btn fantasma p" onClick={() => void navigator.clipboard.writeText(link).then(() => avisar("Link copiado."), () => avisarErro(new Error("Não consegui copiar.")))}><Copy />Copiar o link</button>
                </>
              )}
            </div>
          )}
          <p className="g-muted g-pp">As fotos ficam guardadas enquanto o pet estiver cadastrado.{souDono ? " Só você, como dono, apaga uma foto (a lixeira em cima dela)." : ""} O link do álbum vale 60 dias e mostra só as fotos do boletim.</p>
        </>
      )}
    </section>
  );
}
