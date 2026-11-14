"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Link2, MessageCircle, Trash2 } from "lucide-react";
import { apagarFoto, enviarFotos, fotosDoDia, linkDoTutor, MAX_FOTOS_DIA, mensagemDaPagina, mensagemDasFotos, paginaDoTutorLigada, type FotoDoDia } from "@/lib/gestao/tutor";
import { isoDia, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { avisarMudanca, Esqueleto, Folha, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "./casa.css";

/**
 * Fotos de hoje de um pet na creche ou no hotel (opção "Página do tutor"). A equipe tira ou escolhe várias fotos de uma vez;
 * o aparelho reduz cada uma antes de mandar. As fotos ficam no bucket privado e só aparecem para a equipe e na página do tutor.
 * Os botões de WhatsApp só preparam a mensagem com o link: quem envia é a pessoa.
 */
export type EstadiaComTutor = {
  id: string; pet_id: string;
  pets: { nome: string; clientes?: { id: string; nome: string; telefone: string | null } | null } | null;
};

/** O botão "Fotos" dos cartões: só aparece com a opção ligada. */
export function BotaoFotos({ estadia, rotulo = "Fotos", classe = "g-btn fantasma p" }: { estadia: EstadiaComTutor; rotulo?: string; classe?: string }) {
  const { petshop } = useGestao();
  const [aberta, setAberta] = useState(false);
  if (!paginaDoTutorLigada(petshop) || !estadia.pets) return null;
  return (
    <>
      <button type="button" className={classe} onClick={() => setAberta(true)} aria-label={`Fotos de hoje de ${estadia.pets.nome}`}><Camera />{rotulo}</button>
      {aberta && <FolhaFotos estadia={estadia} aoFechar={() => setAberta(false)} />}
    </>
  );
}

export function FolhaFotos({ estadia: e, aoFechar }: { estadia: EstadiaComTutor; aoFechar: () => void }) {
  const { sb, petshop, user, souDono } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const hoje = isoDia(new Date());
  const pet = e.pets!;
  const tutor = pet.clientes ?? null;
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [legenda, setLegenda] = useState("");
  const [enviando, setEnviando] = useState<{ feitas: number; total: number } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [erroLink, setErroLink] = useState<string | null>(null);

  const { dados, carregando, erro, recarregar } = useDados(() => fotosDoDia(sb, petshop.id, [e.pet_id], hoje), [petshop.id, e.pet_id, hoje]);
  const fotos = dados ?? [];
  const cabem = Math.max(0, MAX_FOTOS_DIA - fotos.length);

  // o link do tutor fica pronto ao abrir: o WhatsApp só abre direto de um toque
  useEffect(() => {
    if (!tutor) return;
    let vivo = true;
    linkDoTutor(sb, tutor.id).then((u) => { if (vivo) setLink(u); }).catch((x) => { if (vivo) setErroLink(x instanceof Error ? x.message : String(x)); });
    return () => { vivo = false; };
  }, [sb, tutor?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function escolher(ev: React.ChangeEvent<HTMLInputElement>) {
    const lista = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (!lista.length || somenteLeitura() || enviando) return;
    const vao = lista.slice(0, cabem);
    if (!vao.length) return avisarErro(new Error(`${pet.nome} já tem ${MAX_FOTOS_DIA} fotos hoje. Apague uma para pôr outra.`));
    setEnviando({ feitas: 0, total: vao.length });
    const r = await enviarFotos(sb, { petshopId: petshop.id, estadiaId: e.id, petId: e.pet_id, dia: hoje, legenda }, vao, (feitas) => setEnviando({ feitas, total: vao.length }));
    setEnviando(null);
    if (r.enviadas) { avisar(r.enviadas === 1 ? "Foto guardada." : `${r.enviadas} fotos guardadas.`); setLegenda(""); avisarMudanca(); }
    if (r.erros.length) avisarErro(new Error(r.erros.join(" ")));
    else if (lista.length > vao.length) avisarErro(new Error(`Entraram ${vao.length}: o limite é de ${MAX_FOTOS_DIA} fotos por pet por dia.`));
    void recarregar();
  }

  async function apagar(f: FotoDoDia) {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Apagar esta foto?", texto: "Ela sai do dia de hoje e da página do tutor.", confirmar: "Apagar foto", perigo: true }))) return;
    try { await apagarFoto(sb, f); avisar("Foto apagada."); avisarMudanca(); void recarregar(); } catch (x) { avisarErro(x); }
  }

  const zapFotos = link && fotos.length ? linkWhatsApp(tutor?.telefone, mensagemDasFotos({ tutor: tutor?.nome, petshop: petshop.nome, pet: pet.nome, fotos: fotos.length, url: link })) : null;
  const zapPagina = link ? linkWhatsApp(tutor?.telefone, mensagemDaPagina({ tutor: tutor?.nome, petshop: petshop.nome, pets: [pet.nome], url: link })) : null;

  return (
    <Folha titulo={`Fotos de hoje · ${pet.nome}`} aoFechar={aoFechar} rodape={
      <>
        {zapFotos ? <a className="g-btn zap" href={zapFotos} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar as fotos de hoje</a>
          : zapPagina ? <a className="g-btn sec" href={zapPagina} target="_blank" rel="noopener noreferrer"><Link2 />Mandar a página do tutor</a> : null}
        <button type="button" className="g-btn fantasma" onClick={aoFechar}>Fechar</button>
      </>
    }>
      <div className="g-pilha">
        <p className="g-muted g-p">As fotos ficam guardadas só para a equipe e para {tutor ? tutor.nome.split(" ")[0] : "o tutor"}, na página do tutor. Até {MAX_FOTOS_DIA} por dia.</p>
        <div className="g-fila">
          <button type="button" className="g-btn pri" disabled={Boolean(enviando) || !cabem} onClick={() => { if (!somenteLeitura()) camera.current?.click(); }}><Camera />Tirar foto</button>
          <button type="button" className="g-btn sec" disabled={Boolean(enviando) || !cabem} onClick={() => { if (!somenteLeitura()) galeria.current?.click(); }}><ImagePlus />Escolher fotos</button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(x) => void escolher(x)} />
          <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(x) => void escolher(x)} data-teste="fotos-do-dia" />
        </div>
        <label className="g-campo">
          <span>Recado para as próximas fotos <small>(opcional)</small></span>
          <input className="g-input" maxLength={200} value={legenda} placeholder="Ex.: brincando com a Mel no quintal" onChange={(x) => setLegenda(x.target.value)} />
        </label>
        {enviando && <p className="g-muted g-p" role="status">Mandando {enviando.feitas < enviando.total ? `${enviando.feitas + 1} de ${enviando.total}` : "as fotos"}…</p>}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={2} /> : fotos.length ? (
          <ul className="g-cs-fotos" aria-label={`Fotos de hoje de ${pet.nome}`}>
            {fotos.map((f) => (
              <li key={f.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f.url ? <img src={f.url} alt={f.legenda ?? `${pet.nome} hoje`} loading="lazy" /> : <span className="sem">foto</span>}
                {f.legenda && <small>{f.legenda}</small>}
                {(souDono || f.criado_por === user.id) && (
                  <button type="button" className="g-cs-foto-x" aria-label="Apagar esta foto" onClick={() => void apagar(f)}><Trash2 aria-hidden /></button>
                )}
              </li>
            ))}
          </ul>
        ) : !enviando ? <p className="g-muted g-pp">Nenhuma foto de {pet.nome} hoje ainda.</p> : null}
        {!tutor ? <p className="g-muted g-pp">Este pet não tem tutor na ficha: as fotos ficam guardadas, mas não há link para mandar.</p>
          : !tutor.telefone ? <p className="g-muted g-pp">Sem telefone na ficha do tutor para mandar pelo WhatsApp.</p>
          : erroLink ? <p className="g-erro">{erroLink}</p> : null}
      </div>
    </Folha>
  );
}
