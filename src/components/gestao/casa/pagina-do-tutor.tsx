"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, MessageCircle, RefreshCw, Unlink } from "lucide-react";
import { desligarLinkDoTutor, linkDoTutor, mensagemDaPagina, paginaDoTutorLigada, trocarLinkDoTutor } from "@/lib/gestao/tutor";
import { haQuanto, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useAvisos, useSomenteLeitura } from "../ui";

/**
 * Cartão "Página do tutor" na ficha do tutor (opção "Página do tutor"): manda o link particular pelo WhatsApp.
 * O dono troca o link (o antigo para de abrir na hora) ou desliga o link deste tutor.
 */
export default function CartaoPaginaDoTutor({ cliente, pets }: { cliente: { id: string; nome: string; telefone: string | null }; pets: { nome: string; ativo: boolean }[] }) {
  const { sb, petshop, souDono, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [link, setLink] = useState<string | null>(null);
  const [visto, setVisto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [desligado, setDesligado] = useState(false);
  const pode = paginaDoTutorLigada(petshop) && (posso("clientes") || posso("creche_hotel"));

  useEffect(() => {
    if (!pode || desligado) return;
    let vivo = true;
    linkDoTutor(sb, cliente.id).then((u) => { if (vivo) setLink(u); }).catch((x) => { if (vivo) setErro(x instanceof Error ? x.message : String(x)); });
    void sb.from("tutor_links").select("visto_em").eq("cliente_id", cliente.id).maybeSingle().then(({ data }) => { if (vivo) setVisto(data?.visto_em ?? null); });
    return () => { vivo = false; };
  }, [sb, cliente.id, pode, desligado]);

  if (!pode) return null;
  const nomes = pets.filter((p) => p.ativo).map((p) => p.nome);
  const zap = link ? linkWhatsApp(cliente.telefone, mensagemDaPagina({ tutor: cliente.nome, petshop: petshop.nome, pets: nomes, url: link })) : null;

  async function trocar() {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Trocar o link deste tutor?", texto: "O link que você já mandou para de abrir na hora. Depois, mande o novo para o tutor.", confirmar: "Trocar o link", perigo: true }))) return;
    try { setLink(await trocarLinkDoTutor(sb, cliente.id)); setVisto(null); setDesligado(false); avisar("Link trocado. Mande o novo para o tutor."); } catch (x) { avisarErro(x); }
  }
  async function desligar() {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Desligar o link deste tutor?", texto: "A página para de abrir agora. Um link novo só sai quando alguém mandar a página de novo.", confirmar: "Desligar o link", perigo: true }))) return;
    try { await desligarLinkDoTutor(sb, cliente.id); setLink(null); setDesligado(true); avisar("Link desligado."); } catch (x) { avisarErro(x); }
  }
  async function copiar() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); avisar("Link copiado."); } catch { avisarErro(new Error("Não consegui copiar. Segure o dedo no link para copiar.")); }
  }

  return (
    <section className="g-card" aria-label="Página do tutor">
      <div className="g-card-t"><h3><Tile icone={Link2} tom="ceu" tamanho="p" />Página do tutor</h3>{visto && <span className="g-muted g-pp">aberta {haQuanto(visto)}</span>}</div>
      <p className="g-muted g-p">Um link só de {cliente.nome.split(" ")[0]}, sem senha: o diário, as fotos de hoje, o que está marcado e os avisos de vacina. Sem preços.</p>
      {desligado ? (
        <div className="g-fila"><button type="button" className="g-btn sec p" onClick={() => setDesligado(false)}><Link2 />Fazer um link novo</button></div>
      ) : (
        <div className="g-fila">
          {zap ? <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar a página do tutor</a>
            : link ? <span className="g-muted g-pp">Sem telefone na ficha para mandar pelo WhatsApp.</span> : null}
          {link && <button type="button" className="g-btn fantasma p" onClick={() => void copiar()}><Copy />Copiar o link</button>}
          {souDono && link && <button type="button" className="g-btn fantasma p" onClick={() => void trocar()}><RefreshCw />Trocar o link</button>}
          {souDono && link && <button type="button" className="g-btn fantasma p" onClick={() => void desligar()}><Unlink />Desligar</button>}
        </div>
      )}
      {erro && <p className="g-erro">{erro}</p>}
    </section>
  );
}
