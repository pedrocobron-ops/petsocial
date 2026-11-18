"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { Gift, MessageCircle, PawPrint } from "lucide-react";
import { anosQueFaz, diaNoMes, MESES } from "@/lib/gestao/aniversario";
import { CHAVE_NO_BANCO, MODELOS_PADRAO, montarMensagem } from "@/lib/gestao/mensagens-prontas";
import { linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Esqueleto, Folha, Vazio, useAvisos, useDados } from "../ui";
import { buscarTudo, linkPet, linkTutor } from "./comum";
import "./aniversario.css";
import "./chamar-de-volta.css";

type TutorNiver = { id: string; nome: string; telefone: string | null; nascimento: string; nao_quer_mensagens: boolean; pets: { nome: string; ativo: boolean }[] | null };
type PetNiver = { id: string; nome: string; nascimento: string; clientes: { id: string; nome: string; telefone: string | null; nao_quer_mensagens: boolean } | null };
type Resposta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Aniversariantes do mês (Clientes): os tutores e os pets com o aniversário anotado na ficha, dia a dia (os pets entraram na
 * 2ª rodada: a Neide via "Ninguém faz aniversário" com a Pipoca fazendo aniversário no dia 20).
 * Quem faz aniversário hoje tem o botão "Dar parabéns" (o WhatsApp abre com o texto do pet shop; nada vai sozinho).
 * Os parabéns do dia também entram no Mandar mensagens. Quem marcou "Não quer receber mensagens" fica sem o botão.
 */
export default function Aniversariantes({ aoFechar }: { aoFechar: () => void }) {
  const { sb, petshop, posso, souDono } = useGestao();
  const { avisarErro } = useAvisos();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [modelo, setModelo] = useState(MODELOS_PADRAO.niver_tutor);
  const [modeloPet, setModeloPet] = useState(MODELOS_PADRAO.niver);
  const [editando, setEditando] = useState(false);
  const podeMudarTexto = souDono || posso("clientes") || posso("agenda");
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let vivo = true;
    void sb.from("modelos_mensagem").select("chave, texto").eq("petshop_id", petshop.id).in("chave", [CHAVE_NO_BANCO.niver_tutor, CHAVE_NO_BANCO.niver])
      .then(({ data }) => {
        if (!vivo) return;
        for (const m of data ?? []) {
          if (m.texto == null) continue;
          if (m.chave === CHAVE_NO_BANCO.niver_tutor) setModelo(m.texto); else setModeloPet(m.texto);
        }
      });
    return () => { vivo = false; };
  }, [sb, petshop.id]);

  const { dados, carregando, erro, recarregar } = useDados(() => buscarTudo<TutorNiver>((de, ate) => sb.from("clientes")
    .select("id, nome, telefone, nascimento, nao_quer_mensagens, pets(nome, ativo)").eq("petshop_id", petshop.id).not("nascimento", "is", null)
    .order("nome").order("id").range(de, ate) as unknown as Resposta<TutorNiver>), [petshop.id]);
  const { dados: petsDoMes } = useDados(() => buscarTudo<PetNiver>((de, ate) => sb.from("pets")
    .select("id, nome, nascimento, clientes(id, nome, telefone, nao_quer_mensagens)").eq("petshop_id", petshop.id).eq("ativo", true).not("nascimento", "is", null)
    .order("nome").order("id").range(de, ate) as unknown as Resposta<PetNiver>), [petshop.id]);

  function mudarModelo(texto: string) {
    setModelo(texto);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => {
      void sb.from("modelos_mensagem").upsert({ petshop_id: petshop.id, chave: CHAVE_NO_BANCO.niver_tutor, texto: texto.slice(0, 1000), atualizado_em: new Date().toISOString() }, { onConflict: "petshop_id,chave" }).select("chave")
        .then(({ error }) => { if (error) avisarErro("Não consegui guardar o texto. Tente de novo."); });
    }, 900);
  }

  const ano = hoje.getFullYear();
  const ehHoje = (dia: number) => mes === hoje.getMonth() + 1 && dia === hoje.getDate();
  const pets = (c: TutorNiver) => (c.pets ?? []).filter((p) => p.ativo).map((p) => p.nome);
  // tutores e pets juntos, dia a dia
  type Linha = { chave: string; pet: boolean; nome: string; dia: number; apoio: string; zap: string | null; href: string };
  const doMes: Linha[] = [
    ...(dados ?? []).map((c) => ({ c, dia: diaNoMes(c.nascimento, mes, ano) })).filter((x): x is { c: TutorNiver; dia: number } => x.dia != null).map(({ c, dia }) => {
      const anos = anosQueFaz(c.nascimento, ano);
      return {
        chave: `t:${c.id}`, pet: false, nome: c.nome, dia, href: linkTutor(c.id),
        apoio: [pets(c).join(", ") || null, anos && anos > 0 && anos < 120 ? `faz ${anos} anos` : null, c.nao_quer_mensagens ? "não quer receber mensagens" : null].filter(Boolean).join(" · "),
        zap: ehHoje(dia) && !c.nao_quer_mensagens ? linkWhatsApp(c.telefone, montarMensagem("niver_tutor", modelo, { tutor: c.nome, pets: pets(c), petshop: petshop.nome })) : null,
      };
    }),
    ...(petsDoMes ?? []).map((p) => ({ p, dia: diaNoMes(p.nascimento, mes, ano) })).filter((x): x is { p: PetNiver; dia: number } => x.dia != null).map(({ p, dia }) => {
      const anos = anosQueFaz(p.nascimento, ano);
      const t = p.clientes;
      return {
        chave: `p:${p.id}`, pet: true, nome: p.nome, dia, href: linkPet(p.id),
        apoio: [t?.nome ? `pet de ${t.nome}` : "pet", anos && anos > 0 && anos < 40 ? `faz ${anos === 1 ? "1 ano" : `${anos} anos`}` : null, t?.nao_quer_mensagens ? "não quer receber mensagens" : null].filter(Boolean).join(" · "),
        zap: ehHoje(dia) && t && !t.nao_quer_mensagens ? linkWhatsApp(t.telefone, montarMensagem("niver", modeloPet, { tutor: t.nome, pets: [p.nome], petshop: petshop.nome })) : null,
      };
    }),
  ].sort((a, b) => a.dia - b.dia || Number(a.pet) - Number(b.pet) || a.nome.localeCompare(b.nome));
  // o exemplo usa o primeiro tutor do mês (com os pets dele), e não nomes que não existem na loja (estreante L6)
  const primeiroTutor = (dados ?? []).find((c) => diaNoMes(c.nascimento, mes, ano) != null);
  const primeiroPet = (petsDoMes ?? []).find((p) => diaNoMes(p.nascimento, mes, ano) != null);
  const exemplo = montarMensagem("niver_tutor", modelo, primeiroTutor ? { tutor: primeiroTutor.nome, pets: pets(primeiroTutor), petshop: petshop.nome }
    : { tutor: primeiroPet?.clientes?.nome ?? "Tutor", pets: primeiroPet ? [primeiroPet.nome] : [], petshop: petshop.nome });

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
          : !doMes.length ? <Vazio titulo={`Ninguém faz aniversário em ${MESES[mes - 1]}`} texto="Aparecem aqui os tutores e os pets com o aniversário anotado na ficha (Editar, Aniversário)." />
          : (
            <div>
              {doMes.map((l) => (
                <div key={l.chave} className="g-niver-linha" data-pet={l.pet || undefined}>
                  <span className={`g-niver-dia${ehHoje(l.dia) ? " hoje" : ""}`} aria-label={`dia ${l.dia}`}>{l.dia}</span>
                  <span className="t">
                    <b>{l.pet && <PawPrint size={13} aria-label="pet" style={{ marginRight: 4, verticalAlign: "-1px" }} />}{l.nome}{ehHoje(l.dia) && <> <span className="g-tag laranja"><Gift size={12} aria-hidden />hoje</span></>}</b>
                    <span>{l.apoio || " "}</span>
                  </span>
                  <span className="acoes">
                    {l.zap && <a className="g-btn zap p" href={l.zap} target="_blank" rel="noopener noreferrer"><MessageCircle />Dar parabéns</a>}
                    <Link className="g-btn sec p" href={l.href} onClick={aoFechar}>Ver ficha</Link>
                  </span>
                </div>
              ))}
            </div>
          )}
        <p className="g-pp g-muted">No dia, os parabéns também aparecem em Mandar mensagens. Nada é enviado sozinho. Para os pets, vai o texto do aniversário do pet (o mesmo de Chamar de volta, Aniversário).</p>
      </div>
    </Folha>
  );
}
