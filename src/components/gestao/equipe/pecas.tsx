"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, ConciergeBell, Copy, Handshake, MessageCircle, PenLine, Plus, Scissors, Wallet, X } from "lucide-react";
import { Tile, type Tom } from "@/components/gestao/painel";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPessoa, useAvisos } from "@/components/gestao/ui";
import { EscolherCor, GradeHorario, NOME_DIAS, ORDEM_DIAS } from "@/components/gestao/ajustes/grade-horario";
import type { Horario } from "@/lib/gestao/tipos";
import { AREAS, PERFIS, type Area } from "@/lib/gestao/acessos";
import { ROTULOS_ATENDE, SO_DONOS, TODAS_AREAS, comPerfil, fraseDoLimite, nAcessos, primeiroNome, textoDoConvite, type Escolha, type PerfilId, type Uso } from "./modelo";
import "@/components/gestao/ajustes/ajustes.css";
import "./equipe-form.css";

/* ---------- peças pequenas ---------- */

/** Trilho de progresso do passo a passo. */
export function Trilho({ passo, total }: { passo: number; total: number }) {
  return (
    <div className="g-eq-trilho" role="img" aria-label={passo < total ? `Passo ${passo + 1} de ${total}` : "Concluído"}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={`g-eq-trilho-p${i < passo ? " feito" : i === passo ? " agora" : ""}`}><i /></span>)}
    </div>
  );
}

/** Cartão grande de escolha: ícone, título, uma linha e o visto quando está escolhido. */
export function Opcao({ icone, tom, titulo, texto, marcado, aoEscolher, children, travado, selo }: {
  icone: React.ComponentType<{ size?: number }>; tom: Tom; titulo: string; texto: string; marcado: boolean; aoEscolher: () => void; children?: React.ReactNode;
  /** Opção que aparece, mas não dá para escolher agora. */
  travado?: boolean;
  /** Etiqueta pequena ao lado do título (ex.: "mais comum"). */
  selo?: string;
}) {
  return (
    <div className={`g-eq-opcao${marcado ? " on" : ""}${travado ? " travada" : ""}`}>
      <button type="button" className="g-eq-opcao-b" aria-pressed={marcado} disabled={travado} onClick={aoEscolher}>
        <Tile icone={icone} tom={tom} />
        <span className="g-eq-opcao-t"><b>{titulo}{selo && <em className="g-eq-opcao-s">{selo}</em>}</b><small>{texto}</small></span>
        <i className="g-eq-opcao-v" aria-hidden>{marcado && <Check />}</i>
      </button>
      {marcado && children && <div className="g-eq-opcao-mais">{children}</div>}
    </div>
  );
}

/** Chave de ligar e desligar com título e uma linha de apoio. */
export function Chave({ titulo, texto, ligada, aoMudar, travada }: { titulo: string; texto?: string; ligada: boolean; aoMudar: (v: boolean) => void; travada?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={ligada} disabled={travada} className="g-eq-liga" onClick={() => aoMudar(!ligada)}>
      <span className="g-eq-liga-t"><b>{titulo}</b>{texto && <small>{texto}</small>}</span>
      <i className="g-eq-chave" aria-hidden><i className="g-eq-chave-bola" /></i>
    </button>
  );
}

/* ---------- função e áreas ---------- */

type Icone = React.ComponentType<{ size?: number }>;
const VISUAL: Record<PerfilId, { icone: Icone; tom: Tom }> = {
  atendimento: { icone: Scissors, tom: "pessego" },
  recepcao: { icone: ConciergeBell, tom: "ceu" },
  financeiro: { icone: Wallet, tom: "menta" },
  gerente: { icone: BadgeCheck, tom: "lilas" },
  socio: { icone: Handshake, tom: "rosa" },
  outra: { icone: PenLine, tom: "manteiga" },
};
/** Na pergunta "o que faz", quem atende os pets vem primeiro e é apresentado pelo trabalho, não pelo que acessa. */
const CARTOES: { id: PerfilId; titulo: string; texto: string }[] = [
  { id: "atendimento", titulo: "Banhista ou tosador(a)", texto: "Atende os pets e aparece na agenda. Quase sempre sem login." },
  ...PERFIS.filter((p) => p.id !== "atendimento").map((p) => ({ id: p.id as PerfilId, titulo: p.titulo, texto: p.apoio })),
  { id: "outra", titulo: "Outra função", texto: "Você dá o nome e escolhe o que a pessoa abre." },
];

/** "O que essa pessoa faz?": cartões dos perfis prontos. Escolher um só preenche a função e as áreas. */
export function EscolherPerfil({ valor, aoMudar }: { valor: Escolha; aoMudar: (e: Escolha) => void }) {
  return (
    <div className="g-eq-opcoes" role="group" aria-label="O que essa pessoa faz?">
      {CARTOES.map((c) => (
        <Opcao key={c.id} icone={VISUAL[c.id].icone} tom={VISUAL[c.id].tom} titulo={c.titulo} texto={c.texto} marcado={valor.perfil === c.id} aoEscolher={() => aoMudar(comPerfil(valor, c.id))}>
          {c.id === "atendimento" && (
            <div className="g-pilha p">
              <p className="g-eq-mini">Como aparece no cartão dela</p>
              <div className="g-chips">
                {ROTULOS_ATENDE.map((r) => <button key={r} type="button" className="g-chip" aria-pressed={valor.rotulo === r} onClick={() => aoMudar({ ...valor, rotulo: r })}>{r}</button>)}
              </div>
            </div>
          )}
          {c.id === "socio" && <p className="g-eq-nota">Sócio é outro dono: mexe na equipe, nos ajustes do pet shop e na assinatura, como você. Por isso precisa de login.</p>}
          {c.id === "outra" && (
            <label className="g-campo"><span>Nome da função</span>
              <input className="g-input" value={valor.nome} maxLength={40} placeholder="Ex.: Motorista, Auxiliar, Veterinária" onChange={(e) => aoMudar({ ...valor, nome: e.target.value })} />
            </label>
          )}
        </Opcao>
      ))}
    </div>
  );
}

/** Os perfis prontos em versão curta: um toque preenche as chaves das áreas. */
export function ModelosProntos({ valor, aoMudar }: { valor: Escolha; aoMudar: (e: Escolha) => void }) {
  return (
    <div className="g-pilha p">
      <p className="g-eq-mini">Perfis prontos (só preenchem as chaves abaixo)</p>
      <div className="g-chips">
        {PERFIS.map((p) => <button key={p.id} type="button" className="g-chip" aria-pressed={valor.perfil === p.id} onClick={() => aoMudar(comPerfil(valor, p.id, true))}>{p.titulo}</button>)}
      </div>
    </div>
  );
}

function LinhaPode({ pode, rotulo, apoio }: { pode: boolean; rotulo: string; apoio?: string }) {
  return (
    <li className={`g-eq-poder ${pode ? "sim" : "nao"}`}>
      <i className="g-eq-poder-i" aria-hidden>{pode ? <Check /> : <X />}</i>
      <span className="g-eq-poder-t"><span className="g-eq-so-leitor">{pode ? "Abre: " : "Não abre: "}</span>{rotulo}{apoio && <small> {apoio}</small>}</span>
    </li>
  );
}

/**
 * O que a pessoa abre: as oito áreas, separadas em dia a dia e dinheiro, mais as três telas que são só dos donos.
 * Com `aoMudar`, cada área vira uma chave. Sem ele (ou para sócio), é só leitura.
 */
export function Areas({ areas, aoMudar, socio, curto }: { areas: Area[]; aoMudar?: (a: Area[]) => void; socio?: boolean; curto?: boolean }) {
  const ligadas = socio ? TODAS_AREAS : areas;
  const editavel = !!aoMudar && !socio;
  const grupo = (dinheiro: boolean) => AREAS.filter((a) => a.dinheiro === dinheiro).map((a) => editavel ? (
    <li key={a.id}>
      <Chave titulo={a.rotulo} texto={a.apoio} ligada={ligadas.includes(a.id)}
        aoMudar={(v) => aoMudar!(v ? [...areas, a.id] : areas.filter((x) => x !== a.id))} />
    </li>
  ) : <LinhaPode key={a.id} pode={ligadas.includes(a.id)} rotulo={a.rotulo} apoio={curto ? undefined : a.apoio} />);
  return (
    <div className={`g-eq-areas${curto ? " curto" : ""}`}>
      <div className="g-eq-areas-g">
        <p className="g-eq-mini">Dia a dia</p>
        <ul className="g-eq-poderes">{grupo(false)}</ul>
      </div>
      <div className="g-eq-areas-g dinheiro">
        <p className="g-eq-mini">Dinheiro</p>
        {!curto && <p className="g-eq-areas-n">São as três áreas que mostram valores. Com elas desligadas, a pessoa não vê quanto entrou nem quanto saiu.</p>}
        <ul className="g-eq-poderes">{grupo(true)}</ul>
      </div>
      <div className="g-eq-areas-g fixas">
        <p className="g-eq-mini">Só donos</p>
        <ul className="g-eq-poderes">
          {SO_DONOS.map((t) => <LinhaPode key={t.id} pode={!!socio} rotulo={t.rotulo} />)}
        </ul>
        {!curto && <p className="g-eq-areas-n">{socio ? "Sócio abre tudo, como você. Não dá para desligar áreas de um dono." : "Equipe, Meu pet shop e Assinatura ficam só com os donos. Nenhuma chave libera."}</p>}
      </div>
    </div>
  );
}

/* ---------- plano ---------- */

/** As vagas de login do plano: avatar de quem ocupa e vaga livre tracejada. */
export function Vagas({ uso, nova, aoAdicionar }: {
  uso: Uso;
  /** Pessoa que está para ocupar uma vaga (no passo a passo). */
  nova?: { nome: string; cor: string } | null;
  /** Com isto, a vaga livre vira botão. */
  aoAdicionar?: () => void;
}) {
  const livres = Math.max(0, uso.livres - (nova ? 1 : 0));
  const usados = uso.usados + (nova ? 1 : 0);
  return (
    <div className="g-eq-vagas" role="group" aria-label={`${usados} de ${nAcessos(uso.limite)} em uso`}>
      {uso.ocupam.map((p) => (
        <span key={p.id} className="g-eq-vaga" title={`${p.nome}: ${p.user_id ? "com login" : "convite enviado"}`}>
          <AvatarPessoa nome={p.nome} cor={p.cor} />
          <small className="g-eq-vaga-n">{primeiroNome(p.nome)}</small>
        </span>
      ))}
      {nova && (
        <span className="g-eq-vaga nova">
          <AvatarPessoa nome={nova.nome || "?"} cor={nova.cor} />
          <small className="g-eq-vaga-n">{primeiroNome(nova.nome) || "nova"}</small>
        </span>
      )}
      {Array.from({ length: livres }, (_, i) => aoAdicionar ? (
        <button key={i} type="button" className="g-eq-vaga livre" onClick={aoAdicionar} aria-label="Vaga livre: adicionar pessoa com login">
          <i className="g-eq-vaga-mais" aria-hidden><Plus /></i><small className="g-eq-vaga-n">livre</small>
        </button>
      ) : (
        <span key={i} className="g-eq-vaga livre"><i className="g-eq-vaga-mais" aria-hidden><Plus /></i><small className="g-eq-vaga-n">livre</small></span>
      ))}
    </div>
  );
}

/** Plano sem vaga de login: a frase clara e o caminho para a Assinatura. */
export function PlanoCheio({ uso, ainda }: { uso: Uso; ainda?: string }) {
  return (
    <div className="g-eq-cheio" role="status">
      <p>{fraseDoLimite(uso)}</p>
      {ainda && <p className="g-eq-cheio-n">{ainda}</p>}
      <div><Link className="g-btn p sec" href="/gestao/app/assinatura">{uso.proximo ? "Ver os planos" : "Abrir Assinatura"}<ArrowRight /></Link></div>
    </div>
  );
}

/* ---------- agenda e comissão ---------- */

/** Cor, comissão e escala. A prévia mostra onde a cor aparece de verdade: no filtro da agenda e na escala. */
export function DetalhesAgenda({ nome, cor, aoCor, comissao, aoComissao, segueLoja, aoSegueLoja, escala, aoEscala, loja }: {
  nome: string; cor: string; aoCor: (c: string) => void; comissao: string; aoComissao: (c: string) => void;
  segueLoja: boolean; aoSegueLoja: (v: boolean) => void; escala: Horario; aoEscala: (h: Horario) => void; loja: Horario;
}) {
  const primeiro = primeiroNome(nome) || "Nome";
  const dias = segueLoja ? loja : escala;
  return (
    <div className="g-eq-detalhes">
      <section className="g-eq-bloco">
        <h4 className="g-eq-bloco-t">Cor</h4>
        <p className="g-muted g-p">Ajuda a bater o olho e saber de quem é o dia. Aparece no filtro da agenda e na escala.</p>
        <EscolherCor valor={cor} aoMudar={aoCor} />
        <div className="g-eq-previa" style={{ "--cor": cor } as React.CSSProperties} aria-hidden>
          <span className="g-eq-previa-r">Prévia</span>
          <div className="g-eq-previa-chips">
            <span className="g-eq-previa-chip">Todos</span>
            <span className="g-eq-previa-chip on"><i className="g-eq-previa-bola" />{primeiro}</span>
          </div>
          <div className="g-eq-dias">
            {ORDEM_DIAS.map((d) => <i key={d} className={dias[d] ? "on" : ""}>{NOME_DIAS[d][0]}</i>)}
          </div>
        </div>
      </section>

      <section className="g-eq-bloco">
        <h4 className="g-eq-bloco-t">Comissão</h4>
        <p className="g-muted g-p">Uma parte do valor de cada atendimento que a pessoa conclui. A conta aparece pronta em Relatórios. Em branco, não tem comissão.</p>
        <label className="g-eq-pct">
          <input className="g-input g-tab" inputMode="decimal" placeholder="0" aria-label="Comissão em por cento" value={comissao}
            onChange={(e) => aoComissao(e.target.value.replace(/[^\d,.]/g, "").slice(0, 6))} />
          <span className="g-eq-pct-s">% de cada atendimento</span>
        </label>
      </section>

      <section className="g-eq-bloco">
        <h4 className="g-eq-bloco-t">Dias de trabalho</h4>
        <div className="g-eq-opcoes dupla">
          <button type="button" className={`g-eq-curta${segueLoja ? " on" : ""}`} aria-pressed={segueLoja} onClick={() => aoSegueLoja(true)}>
            <b>Segue o horário do pet shop</b><small>Trabalha em todos os dias em que vocês abrem.</small>
          </button>
          <button type="button" className={`g-eq-curta${!segueLoja ? " on" : ""}`} aria-pressed={!segueLoja} onClick={() => aoSegueLoja(false)}>
            <b>Tem dias próprios</b><small>Você marca os dias e as horas dela.</small>
          </button>
        </div>
        {!segueLoja && <GradeHorario valor={escala} aoMudar={aoEscala} aberto="Trabalha" fechado="Folga" base={loja} />}
      </section>
    </div>
  );
}

/* ---------- convite ---------- */

/** O convite pronto para mandar: WhatsApp, copiar e o texto que a pessoa vai receber. */
export function Convite({ nome, email }: { nome: string; email: string }) {
  const { petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [copiado, setCopiado] = useState(false);
  const origem = typeof window === "undefined" ? "" : window.location.origin;
  const texto = textoDoConvite({ nome, petshop: petshop.nome, email, origem });

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      avisar("Convite copiado. Agora é só colar na conversa.");
    } catch { avisarErro(new Error("Não consegui copiar. Segure o dedo sobre o texto do convite e copie por lá.")); }
  }

  return (
    <div className="g-eq-convite">
      <ol className="g-eq-convite-passos">
        <li><b>1</b><span className="g-eq-convite-p">{primeiroNome(nome) || "A pessoa"} abre o link que você mandar.</span></li>
        <li><b>2</b><span className="g-eq-convite-p">Cria a conta com o e-mail <strong>{email}</strong>. É esse e-mail que liga a conta à sua equipe.</span></li>
        <li><b>3</b><span className="g-eq-convite-p">Pronto: ao entrar, já cai no {petshop.nome}.</span></li>
      </ol>
      <div className="g-eq-convite-acoes">
        <a className="g-btn verde" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar pelo WhatsApp</a>
        <button type="button" className="g-btn sec" onClick={() => void copiar()}>{copiado ? <Check /> : <Copy />}{copiado ? "Copiado" : "Copiar convite"}</button>
      </div>
      <details className="g-eq-convite-ver">
        <summary>Ver a mensagem que vai ser enviada</summary>
        <p className="g-eq-convite-txt">{texto}</p>
      </details>
    </div>
  );
}
