"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Gift, MessageCircle } from "lucide-react";
import { anosQueFaz, diaNoMes, MESES } from "@/lib/gestao/aniversario";
import { CHAVE_NO_BANCO, MODELOS_PADRAO, montarMensagem } from "@/lib/gestao/mensagens-prontas";
import { linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Esqueleto, Folha, Vazio, useAvisos, useDados } from "../ui";
import { buscarTudo, linkTutor } from "./comum";
import "./aniversario.css";
import "./chamar-de-volta.css";

type TutorNiver = { id: string; nome: string; telefone: string | null; nascimento: string; nao_quer_mensagens: boolean; pets: { nome: string; ativo: boolean }[] | null };
type Resposta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Aniversariantes do mês (Clientes): os tutores com o aniversário anotado na ficha, dia a dia.
 * Quem faz aniversário hoje tem o botão "Dar parabéns" (o WhatsApp abre com o texto do pet shop; nada vai sozinho).
 * Os parabéns do dia também entram no Mandar mensagens. Quem marcou "Não quer receber mensagens" fica sem o botão.
 */
export default function Aniversariantes({ aoFechar }: { aoFechar: () => void }) {
  const { sb, petshop, posso, souDono } = useGestao();
  const { avisarErro } = useAvisos();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [modelo, setModelo] = useState(MODELOS_PADRAO.niver_tutor);
  const [editando, setEditando] = useState(false);
  const podeMudarTexto = souDono || posso("clientes") || posso("agenda");
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    void sb.from("modelos_mensagem").select("texto").eq("petshop_id", petshop.id).eq("chave", CHAVE_NO_BANCO.niver_tutor).maybeSingle()
      .then(({ data }) => { if (vivo && data?.texto != null) setModelo(data.texto); });
    return () => { vivo = false; };
  }, [sb, petshop.id]);

  const { dados, carregando, erro, recarregar } = useDados(() => buscarTudo<TutorNiver>((de, ate) => sb.from("clientes")
    .select("id, nome, telefone, nascimento, nao_quer_mensagens, pets(nome, ativo)").eq("petshop_id", petshop.id).not("nascimento", "is", null)
    .order("nome").order("id").range(de, ate) as unknown as Resposta<TutorNiver>), [petshop.id]);

  function mudarModelo(texto: string) {
    setModelo(texto);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => {
      void sb.from("modelos_mensagem").upsert({ petshop_id: petshop.id, chave: CHAVE_NO_BANCO.niver_tutor, texto: texto.slice(0, 1000), atualizado_em: new Date().toISOString() }, { onConflict: "petshop_id,chave" }).select("chave")
        .then(({ error }) => { if (error) avisarErro("Não consegui guardar o texto. Tente de novo."); });
    }, 900);
  }

  const ano = hoje.getFullYear();
  const doMes = (dados ?? []).map((c) => ({ c, dia: diaNoMes(c.nascimento, mes, ano) })).filter((x): x is { c: TutorNiver; dia: number } => x.dia != null)
    .sort((a, b) => a.dia - b.dia || a.c.nome.localeCompare(b.c.nome));
  const ehHoje = (dia: number) => mes === hoje.getMonth() + 1 && dia === hoje.getDate();
  const pets = (c: TutorNiver) => (c.pets ?? []).filter((p) => p.ativo).map((p) => p.nome);
  const exemplo = montarMensagem("niver_tutor", modelo, { tutor: "Ana", pets: ["Thor"], petshop: petshop.nome });

  return (
    <Folha larga titulo="Aniversariantes do mês" aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
      <div className="g-pilha">
        <div className="g-niver-meses" role="group" aria-label="Mês">
          {MESES.map((m, i) => <button key={m} type="button" className="g-chip" aria-pressed={mes === i + 1} onClick={() => setMes(i + 1)}>{m.slice(0, 3)}</button>)}
        </div>
        <div className="g-cv-msg">
          <div className="g-cv-msg-t">
            <span className="g-rotulo">Parabéns do dia</span>
            {podeMudarTexto && <button type="button" className="g-btn fantasma p" aria-expanded={editando} onClick={() => setEditando(!editando)}>{editando ? "Pronto" : "Mudar o texto"}</button>}
          </div>
          {editando && (
            <label className="g-campo">
              <span>O que vai escrito depois do “Oi”</span>
              <textarea className="g-textarea" data-sem-aviso rows={3} maxLength={500} value={modelo} onChange={(e) => mudarModelo(e.target.value)} />
              <small>Onde estiver [pet] entra o nome do pet. O texto vale para o pet shop inteiro e também para o Mandar mensagens.</small>
              {modelo !== MODELOS_PADRAO.niver_tutor && <button type="button" className="g-btn fantasma p g-cv-padrao" onClick={() => mudarModelo(MODELOS_PADRAO.niver_tutor)}>Voltar ao texto padrão</button>}
            </label>
          )}
          <p className="g-cv-previa"><span className="g-pp g-muted">Vai assim:</span>{exemplo}</p>
        </div>

        {erro && !dados ? <Vazio titulo="Não consegui montar a lista" texto={erro}><button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button></Vazio>
          : carregando && !dados ? <Esqueleto linhas={4} />
          : !doMes.length ? <Vazio titulo={`Ninguém faz aniversário em ${MESES[mes - 1]}`} texto="Aparecem aqui os tutores com o aniversário anotado na ficha (Editar, Aniversário)." />
          : (
            <div>
              {doMes.map(({ c, dia }) => {
                const anos = anosQueFaz(c.nascimento, ano);
                const zap = ehHoje(dia) && !c.nao_quer_mensagens ? linkWhatsApp(c.telefone, montarMensagem("niver_tutor", modelo, { tutor: c.nome, pets: pets(c), petshop: petshop.nome })) : null;
                return (
                  <div key={c.id} className="g-niver-linha">
                    <span className={`g-niver-dia${ehHoje(dia) ? " hoje" : ""}`} aria-label={`dia ${dia}`}>{dia}</span>
                    <span className="t">
                      <b>{c.nome}{ehHoje(dia) && <> <span className="g-tag laranja"><Gift size={12} aria-hidden />hoje</span></>}</b>
                      <span>{[pets(c).join(", ") || null, anos && anos > 0 && anos < 120 ? `faz ${anos} anos` : null, c.nao_quer_mensagens ? "não quer receber mensagens" : null].filter(Boolean).join(" · ") || " "}</span>
                    </span>
                    <span className="acoes">
                      {zap && <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Dar parabéns</a>}
                      <Link className="g-btn sec p" href={linkTutor(c.id)} onClick={aoFechar}>Ver ficha</Link>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        <p className="g-pp g-muted">No dia, os parabéns também aparecem em Mandar mensagens. Nada é enviado sozinho.</p>
      </div>
    </Folha>
  );
}
