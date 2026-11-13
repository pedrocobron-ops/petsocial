"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, MessageCircle, Send, Trash2 } from "lucide-react";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { reduzirFoto } from "@/lib/gestao/foto";
import { fotoPet } from "@/lib/gestao/supabase";
import { linkWhatsApp, chamar } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { avisarMudanca, ok, useAvisos, useSomenteLeitura } from "../ui";
import "@/app/(gestao)/gestao/app/agenda/agenda.css";

type Lado = "antes" | "depois";
const LADOS: { id: Lado; rotulo: string }[] = [{ id: "antes", rotulo: "Antes" }, { id: "depois", rotulo: "Depois" }];
const LIMITE = 1_000_000; // o bucket `pets` aceita até 1 MB por arquivo

/**
 * Fotos de antes e depois do atendimento: dois quadros lado a lado, guardados no bucket `pets` (pasta do pet shop).
 * "Mandar para o tutor" abre o compartilhamento do celular com as fotos ou, sem isso, o WhatsApp do tutor com o
 * endereço da foto. Quem envia é a pessoa: o sistema não manda nada sozinho.
 */
export default function AntesDepois({ agendamento: a, aoMudar }: { agendamento: AgendamentoCompleto; aoMudar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [fotos, setFotos] = useState<Record<Lado, string | null>>({ antes: a.foto_antes, depois: a.foto_depois });
  const [ocupado, setOcupado] = useState<Lado | null>(null);
  const [arquivos, setArquivos] = useState<Record<string, File>>({}); // caminho no bucket -> arquivo pronto para compartilhar
  const [toque, setToque] = useState(false);
  const entradas = useRef<Record<Lado, HTMLInputElement | null>>({ antes: null, depois: null });

  const nomePet = a.pets?.nome ?? "seu pet";
  const tutor = a.pets?.clientes;
  const nomeDoArquivo = (lado: Lado) => `${nomePet.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "pet"}-${lado}.jpg`;

  // compartilhar com arquivo só faz sentido no celular
  useEffect(() => { setToque(typeof navigator.canShare === "function" && window.matchMedia("(pointer: coarse)").matches); }, []);

  // deixa os arquivos prontos antes do toque: o navegador só abre o compartilhamento logo depois de um toque
  useEffect(() => {
    if (!toque) return;
    let vivo = true;
    for (const { id } of LADOS) {
      const caminho = fotos[id], url = fotoPet(caminho);
      if (!caminho || !url || arquivos[caminho]) continue;
      void fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("sem foto")))).then((blob) => {
        if (vivo) setArquivos((x) => ({ ...x, [caminho]: new File([blob], nomeDoArquivo(id), { type: "image/jpeg" }) }));
      }).catch(() => { /* sem o arquivo, vale o WhatsApp com o endereço da foto */ });
    }
    return () => { vivo = false; };
  }, [toque, fotos.antes, fotos.depois]); // eslint-disable-line react-hooks/exhaustive-deps

  const gravar = async (lado: Lado, caminho: string | null) =>
    ok(await sb.from("agendamentos").update(lado === "antes" ? { foto_antes: caminho } : { foto_depois: caminho }).eq("id", a.id).select("id").single());
  const apagarDoBucket = (caminho: string) => void sb.storage.from("pets").remove([caminho]);

  async function escolher(lado: Lado, e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || somenteLeitura()) return;
    setOcupado(lado);
    try {
      let blob: Blob;
      try {
        if (f.type && !f.type.startsWith("image/")) throw new Error("não é imagem");
        blob = await reduzirFoto(f, 1080, 0.8);
        if (blob.size > LIMITE) blob = await reduzirFoto(f);
      } catch { throw new Error("Esse arquivo não é uma foto. Escolha uma imagem JPG ou PNG."); }
      const caminho = `${petshop.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from("pets").upload(caminho, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      const antiga = fotos[lado];
      try { await gravar(lado, caminho); } catch (err) { apagarDoBucket(caminho); throw err; }
      setArquivos((x) => ({ ...x, [caminho]: new File([blob], nomeDoArquivo(lado), { type: "image/jpeg" }) }));
      setFotos((x) => ({ ...x, [lado]: caminho }));
      if (antiga) apagarDoBucket(antiga);
      avisar(antiga ? `Foto de ${lado} trocada.` : `Foto de ${lado} guardada.`);
      avisarMudanca();
      aoMudar();
    } catch (err) { avisarErro(err); }
    setOcupado(null);
  }

  async function remover(lado: Lado) {
    const caminho = fotos[lado];
    if (!caminho || somenteLeitura()) return;
    if (!(await confirmar({ titulo: `Remover a foto de ${lado}?`, texto: "Ela sai deste atendimento e é apagada.", confirmar: "Remover foto", perigo: true }))) return;
    setOcupado(lado);
    try {
      await gravar(lado, null);
      setFotos((x) => ({ ...x, [lado]: null }));
      apagarDoBucket(caminho);
      avisar("Foto removida.");
      avisarMudanca();
      aoMudar();
    } catch (err) { avisarErro(err); }
    setOcupado(null);
  }

  // mandar para o tutor
  const caminhos = LADOS.map((l) => fotos[l.id]).filter((c): c is string => Boolean(c));
  const prontos = caminhos.map((c) => arquivos[c]).filter(Boolean);
  const texto = fotos.depois ? `Olha como ${nomePet} ficou!` : `Olha ${nomePet} aqui com a gente!`;
  const compartilha = toque && caminhos.length > 0 && prontos.length === caminhos.length && navigator.canShare({ files: prontos });
  const zap = linkWhatsApp(tutor?.telefone, `${tutor?.nome ? `Oi, ${chamar(tutor.nome)}! ` : ""}${texto} ${fotoPet(fotos.depois ?? fotos.antes) ?? ""}`.trim());

  async function compartilhar() {
    try { await navigator.share({ files: prontos, text: texto }); }
    catch (err) { if ((err as Error)?.name !== "AbortError") avisarErro(new Error("Não consegui abrir o compartilhamento. Tente de novo.")); }
  }

  return (
    <div className="g-campo g-agd-fotos"><span>Antes e depois</span>
      <div className="g-agd-quadros">
        {LADOS.map(({ id, rotulo }) => {
          const url = fotoPet(fotos[id]);
          return (
            <div key={id} className={`g-agd-quadro${url ? " cheio" : ""}`}>
              <button type="button" className="g-agd-quadro-toque" disabled={ocupado !== null}
                aria-label={url ? `Trocar a foto de ${id}` : `Tirar a foto de ${id}`}
                onClick={() => { if (!somenteLeitura()) entradas.current[id]?.click(); }}>
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={`${nomePet}, ${id}`} loading="lazy" />
                ) : (
                  <>
                    <span className="g-agd-quadro-ico"><Camera aria-hidden /></span>
                    <b>{rotulo}</b>
                    <small>Tirar foto</small>
                  </>
                )}
              </button>
              {url && <span className="g-agd-quadro-rot">{rotulo}</span>}
              {url && ocupado !== id && <button type="button" className="g-agd-quadro-x" disabled={ocupado !== null} aria-label={`Remover a foto de ${id}`} onClick={() => void remover(id)}><Trash2 aria-hidden /></button>}
              {ocupado === id && <span className="g-agd-quadro-env" role="status">Um instante…</span>}
              <input ref={(el) => { entradas.current[id] = el; }} type="file" accept="image/*" hidden onChange={(e) => void escolher(id, e)} />
            </div>
          );
        })}
      </div>
      {caminhos.length > 0 && (
        <>
          {compartilha ? <button type="button" className="g-btn sec cheio" onClick={() => void compartilhar()}><Send />Mandar para o tutor</button>
            : zap ? <a className="g-btn sec cheio" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar para o tutor</a>
            : <p className="g-pp g-muted">Sem telefone do tutor para mandar as fotos.</p>}
          <small>Toque na foto para trocar. Quem envia é você, pelo WhatsApp.</small>
        </>
      )}
    </div>
  );
}
