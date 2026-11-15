"use client";

import { Copy, Link2, MessageCircle, RefreshCw, Unlink } from "lucide-react";
import { desligarLinkDoTutor, mensagemDaPagina, paginaDoTutorLigada, trocarLinkDoTutor } from "@/lib/gestao/tutor";
import { haQuanto, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { useAvisos, useSomenteLeitura } from "../ui";
import { abrirZapComLink, copiarComLink, useLinkDoTutor } from "./link-do-tutor";

/**
 * Cartão "Página do tutor" na ficha do tutor (opção "Página do tutor"): manda o link particular pelo WhatsApp.
 * Abrir a ficha não cria link: ele nasce no primeiro Mandar ou Copiar.
 * O dono troca o link (o antigo para de abrir na hora) ou desliga o link deste tutor.
 */
export default function CartaoPaginaDoTutor({ cliente, pets }: { cliente: { id: string; nome: string; telefone: string | null }; pets: { nome: string; ativo: boolean }[] }) {
  const { sb, petshop, souDono, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const pode = paginaDoTutorLigada(petshop) && (posso("clientes") || posso("creche_hotel"));
  const { link, setLink, visto, setVisto, erro, garantir } = useLinkDoTutor(cliente.id, pode);

  if (!pode) return null;
  const nomes = pets.filter((p) => p.ativo).map((p) => p.nome);
  const montarZap = (url: string) => linkWhatsApp(cliente.telefone, mensagemDaPagina({ tutor: cliente.nome, petshop: petshop.nome, pets: nomes, url }));
  const temZap = Boolean(linkWhatsApp(cliente.telefone, "x"));

  async function trocar() {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Trocar o link deste tutor?", texto: "O link que você já mandou para de abrir na hora. Depois, mande o novo para o tutor.", confirmar: "Trocar o link", perigo: true }))) return;
    try { setLink(await trocarLinkDoTutor(sb, cliente.id)); setVisto(null); avisar("Link trocado. Mande o novo para o tutor."); } catch (x) { avisarErro(x); }
  }
  async function desligar() {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Desligar o link deste tutor?", texto: "A página para de abrir agora. Um link novo só sai quando alguém mandar a página de novo.", confirmar: "Desligar o link", perigo: true }))) return;
    try { await desligarLinkDoTutor(sb, cliente.id); setLink(null); setVisto(null); avisar("Link desligado."); } catch (x) { avisarErro(x); }
  }
  async function copiar() {
    try { await copiarComLink(garantir); avisar("Link copiado."); }
    catch (x) { avisarErro(x instanceof DOMException || !(x instanceof Error) ? new Error("Não consegui copiar. Toque de novo ou segure o dedo no link para copiar.") : x); }
  }
  async function mandar() {
    if (!link && somenteLeitura()) return;
    try { await abrirZapComLink(garantir, montarZap); } catch (x) { avisarErro(x); }
  }

  return (
    <section className="g-card" aria-label="Página do tutor">
      <div className="g-card-t"><h3><Tile icone={Link2} tom="ceu" tamanho="p" />Página do tutor</h3>{visto && <span className="g-muted g-pp">aberta {haQuanto(visto)}</span>}</div>
      <p className="g-muted g-p">Um link só de {cliente.nome.split(" ")[0]}, sem senha: o diário, as fotos de hoje, o que está marcado e os avisos de vacina. Sem preços.</p>
      <div className="g-fila">
        {temZap ? (link
          ? <a className="g-btn zap p" href={montarZap(link)!} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar a página do tutor</a>
          : <button type="button" className="g-btn zap p" onClick={() => void mandar()}><MessageCircle />Mandar a página do tutor</button>)
          : <span className="g-muted g-pp">Sem telefone na ficha para mandar pelo WhatsApp.</span>}
        <button type="button" className="g-btn fantasma p" onClick={() => void copiar()}><Copy />Copiar o link</button>
        {souDono && link && <button type="button" className="g-btn fantasma p" onClick={() => void trocar()}><RefreshCw />Trocar o link</button>}
        {souDono && link && <button type="button" className="g-btn fantasma p" onClick={() => void desligar()}><Unlink />Desligar</button>}
      </div>
      {erro && <p className="g-erro">{erro}</p>}
    </section>
  );
}
