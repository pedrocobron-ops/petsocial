"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, MessageCircle, PhoneOff } from "lucide-react";
import { corpoDaMensagem, MENSAGENS, textoDaMensagem } from "@/lib/gestao/hotel";
import type { TipoDeMensagem } from "@/lib/gestao/hotel-opcoes";
import { saudacaoZap } from "@/lib/gestao/agenda";
import { dataAmigavel, fmtTelefone, hora, isoDia, linkWhatsApp, soDigitos, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPessoa, Folha, Vazio, ok, useAvisos, useSomenteLeitura } from "../ui";
import { horaCurta, nomeTipo, type EstadiaCompleta } from "./tipos";
import "./hotel.css";

/**
 * Mensagens do hotel e da creche para o tutor. O sistema só prepara o texto: um toque abre o WhatsApp e quem envia é a pessoa.
 * Dá para mudar o texto antes de mandar. Os textos padrão de cada pet shop ficam em Meu pet shop (opção "hotel.mensagens").
 * Cada envio fica anotado na estadia (`avisos`), para todo mundo da equipe ver o que já foi mandado.
 */
export function avisoDe(e: Pick<EstadiaCompleta, "avisos">, tipo: TipoDeMensagem): string | null {
  const a = e.avisos as Record<string, unknown> | null;
  const v = a && typeof a === "object" ? a[tipo] : null;
  return typeof v === "string" ? v : null;
}
const quandoFoi = (iso: string) => `${isoDia(new Date(iso)) === isoDia(new Date()) ? "" : `${dataAmigavel(new Date(iso))}, `}às ${hora(iso)}`;

/** Anota na estadia que a mensagem foi mandada agora. */
function useAnotarAviso() {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  return async (estadias: EstadiaCompleta[], tipo: TipoDeMensagem) => {
    if (somenteLeitura()) return null;
    const agora = new Date().toISOString();
    try {
      for (const e of estadias) {
        const atual = e.avisos && typeof e.avisos === "object" && !Array.isArray(e.avisos) ? (e.avisos as Record<string, unknown>) : {};
        ok(await sb.from("estadias").update({ avisos: { ...atual, [tipo]: agora } as never }).eq("id", e.id).eq("petshop_id", petshop.id).select("id"));
      }
      return agora;
    } catch (x) { avisarErro(x); return null; }
  };
}

/** Uma mensagem pronta: prévia, "Mudar o texto" e o botão que abre o WhatsApp. */
function MensagemPronta({ titulo, apoio, texto, telefone, enviadaEm, destaque, aoMandar }: {
  titulo: string; apoio?: string; texto: string; telefone: string | null | undefined; enviadaEm: string | null; destaque?: boolean; aoMandar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [meu, setMeu] = useState<string | null>(null);
  const final = meu ?? texto;
  const zap = linkWhatsApp(telefone, final);
  return (
    <div className="g-ht-msg">
      <div className="c">
        <div><b>{titulo}</b>{apoio && <small>{apoio}</small>}</div>
        {enviadaEm && <span className="g-tag verde"><Check size={12} aria-hidden />Enviada {quandoFoi(enviadaEm)}</span>}
      </div>
      {editando
        ? <textarea className="g-textarea" rows={5} value={final} maxLength={1200} aria-label={`Texto da mensagem: ${titulo}`} onChange={(e) => setMeu(e.target.value)} />
        : <p className="previa">{final}</p>}
      <div className="a">
        {zap
          ? <a className={`g-btn p ${destaque && !enviadaEm ? "zap" : "sec"}`} href={zap} target="_blank" rel="noopener noreferrer" onClick={aoMandar} aria-label={`${titulo}: abrir o WhatsApp`}><MessageCircle />{enviadaEm ? "Mandar de novo" : "Abrir o WhatsApp"}</a>
          : <span className="g-muted g-pp">Sem telefone na ficha do tutor.</span>}
        <button type="button" className="g-btn fantasma p" onClick={() => setEditando((v) => !v)}>{editando ? "Pronto" : "Mudar o texto"}</button>
        {meu != null && meu !== texto && <button type="button" className="g-btn fantasma p" onClick={() => setMeu(null)}>Voltar ao texto padrão</button>}
      </div>
    </div>
  );
}

/** Folha "Mensagens" do cartão da estadia: todas as mensagens que cabem agora, cada uma a um toque do WhatsApp. */
export function MensagensDaEstadia({ estadia: e, sinal, fatos, aoFechar, aoMudar }: {
  estadia: EstadiaCompleta; sinal: { valor: number; pago: boolean; /** quanto do sinal já entrou, quando ele é pago em partes */ recebido?: number } | null; fatos?: string; aoFechar: () => void; aoMudar: () => void;
}) {
  const { petshop } = useGestao();
  const anotar = useAnotarAviso();
  const [enviadas, setEnviadas] = useState<Record<string, string>>({});
  const pet = e.pets;
  if (!pet) return null;
  const reserva = e.status === "reservada";
  const tipos = MENSAGENS.filter((m) => (reserva ? m.id === "confirmar" || m.id === "chegada" || (m.id === "sinal" && sinal != null && !sinal.pago) : m.id === "como_esta" || (m.id === "saida" && Boolean(e.saida_prevista))));
  return (
    <Folha titulo={`Mensagens para ${pet.clientes?.nome ?? "o tutor"}`} aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
      <div className="g-pilha">
        <p className="g-muted g-p">O WhatsApp abre com a mensagem pronta e você só aperta enviar. Nada é mandado sozinho.</p>
        {tipos.map((m) => (
          <MensagemPronta key={m.id} titulo={m.rotulo} apoio={m.apoio} telefone={pet.clientes?.telefone}
            texto={textoDaMensagem(m.id, { petshop, pet, estadia: e, sinal: sinal?.valor, sinalRecebido: sinal?.recebido, fatos })} enviadaEm={enviadas[m.id] ?? avisoDe(e, m.id)}
            aoMandar={() => { void anotar([e], m.id).then((em) => { if (em) { setEnviadas((x) => ({ ...x, [m.id]: em })); aoMudar(); } }); }} />
        ))}
      </div>
    </Folha>
  );
}

/**
 * "Avisar quem chega amanhã": as reservas de amanhã, um tutor por linha. Cada toque abre o WhatsApp daquele tutor
 * e marca como enviado (um por vez: o navegador não deixa abrir várias conversas de uma vez).
 */
export function AvisarChegadas({ reservas, aoFechar, aoMudar }: { reservas: EstadiaCompleta[]; aoFechar: () => void; aoMudar: () => void }) {
  const { petshop } = useGestao();
  const anotar = useAnotarAviso();
  const [enviadas, setEnviadas] = useState<Record<string, string>>({});
  const amanha = isoDia(somaDias(new Date(), 1));
  const doDia = reservas.filter((e) => e.status === "reservada" && e.pets && isoDia(new Date(e.entrada)) === amanha).sort((a, b) => a.entrada.localeCompare(b.entrada));
  // um tutor com dois pets recebe uma mensagem só
  const grupos = new Map<string, EstadiaCompleta[]>();
  for (const e of doDia) { const k = e.pets!.clientes?.id ?? `pet-${e.pet_id}`; grupos.set(k, [...(grupos.get(k) ?? []), e]); }
  const linhas = [...grupos.entries()].map(([chave, lista]) => {
    const tutor = lista[0].pets!.clientes;
    // dois pets do mesmo tutor que chegam juntos (mesmo lugar, mesma hora): uma frase só, com os dois nomes
    const juntos = lista.length > 1 && lista.every((e) => e.tipo === lista[0].tipo && e.entrada === lista[0].entrada);
    const nomes = lista.map((e) => e.pets!.nome);
    const corpo = juntos
      ? corpoDaMensagem("chegada", { petshop, pet: { nome: `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`, sexo: null }, estadia: lista[0] })
      : lista.map((e) => corpoDaMensagem("chegada", { petshop, pet: e.pets!, estadia: e })).join(" ");
    const texto = `${saudacaoZap(tutor?.nome, petshop.nome)} ${corpo}`;
    const ja = lista.every((e) => avisoDe(e, "chegada")) ? lista.map((e) => avisoDe(e, "chegada")!).sort().pop()! : null;
    return { chave, lista, tutor, texto, enviadaEm: enviadas[chave] ?? ja, temFone: soDigitos(tutor?.telefone).length >= 8 };
  });
  const com = linhas.filter((l) => l.temFone), sem = linhas.filter((l) => !l.temFone);
  const faltam = com.filter((l) => !l.enviadaEm);
  const resumo = (lista: EstadiaCompleta[]) => lista.map((e) => `${e.pets?.nome ?? "Pet"}, ${nomeTipo(e.tipo).toLowerCase()} às ${horaCurta(e.entrada)}`).join(" · ");
  return (
    <Folha titulo="Avisar quem chega amanhã" aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
      {!linhas.length ? <Vazio titulo="Ninguém chega amanhã" texto="Quando houver reserva para amanhã, os tutores aparecem aqui." /> : (
        <div className="g-pilha">
          <p className="g-lb-topo" role="status">
            {!com.length ? "Nenhum tutor de amanhã tem telefone na ficha."
              : faltam.length ? <><b>{faltam.length === 1 ? "Falta 1 aviso" : `Faltam ${faltam.length} avisos`}</b> de {com.length}. Toque em Abrir o WhatsApp: a mensagem vai pronta e você só aperta enviar. Depois volte aqui para o próximo.</>
              : <><Check aria-hidden /><b>Todos os avisos de amanhã foram mandados.</b></>}
          </p>
          {com.map((l) => (
            <MensagemPronta key={l.chave} titulo={l.tutor?.nome ?? "Tutor"} apoio={`${resumo(l.lista)} · ${fmtTelefone(l.tutor?.telefone)}`} telefone={l.tutor?.telefone} texto={l.texto}
              enviadaEm={l.enviadaEm} destaque={l.chave === faltam[0]?.chave}
              aoMandar={() => { void anotar(l.lista, "chegada").then((em) => { if (em) { setEnviadas((x) => ({ ...x, [l.chave]: em })); aoMudar(); } }); }} />
          ))}
          {sem.length > 0 && (
            <section>
              <p className="g-rotulo" style={{ marginBottom: 6 }}>Sem telefone</p>
              <div className="g-lb-lista">
                {sem.map((l) => (
                  <div key={l.chave} className="g-lb-linha sem">
                    <span className="g-lb-sem" aria-hidden><PhoneOff /></span>
                    <span className="t"><b>{l.tutor?.nome ?? l.lista[0].pets?.nome ?? "Sem tutor"}</b><span>{resumo(l.lista)}</span></span>
                    {l.tutor?.id ? <Link className="g-btn sec" href={`/gestao/app/clientes?cliente=${l.tutor.id}`}>Ver ficha</Link> : <AvatarPessoa nome="?" tamanho="p" />}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Folha>
  );
}
