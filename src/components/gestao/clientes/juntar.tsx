"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Cliente, Pet } from "@/lib/gestao/tipos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { fimDoTelefone, fmtTelefone, semAcento, soDigitos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPessoa, Folha, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";

/** O mínimo de um tutor para reconhecer cadastro repetido. */
export type TutorCurto = Pick<Cliente, "id" | "nome" | "telefone">;

/**
 * Procura um tutor que já existe com o mesmo telefone (pelos oito últimos algarismos) ou o mesmo nome
 * (sem acento, sem maiúsculas). O telefone manda: nome igual com telefones diferentes são duas pessoas.
 */
export function acharTutorIgual(clientes: TutorCurto[], nome: string, telefone: string | null | undefined, ignorar?: string): { tutor: TutorCurto; por: "telefone" | "nome" } | null {
  const fone = fimDoTelefone(telefone), alvo = semAcento(nome);
  const outros = clientes.filter((c) => c.id !== ignorar);
  if (fone) {
    const t = outros.find((c) => fimDoTelefone(c.telefone) === fone);
    if (t) return { tutor: t, por: "telefone" };
  }
  if (!alvo) return null;
  const t = outros.find((c) => semAcento(c.nome) === alvo && !(fone && fimDoTelefone(c.telefone) && fimDoTelefone(c.telefone) !== fone));
  return t ? { tutor: t, por: "nome" } : null;
}

/** Todos os tutores do pet shop (só nome e telefone), para as conferências de cadastro repetido. */
export function useTutores(ligado = true) {
  const { sb, petshop } = useGestao();
  return useDados(async () => (ligado
    ? lerTudo<TutorCurto>((de, ate, contar) => sb.from("clientes").select("id, nome, telefone", contando(contar)).eq("petshop_id", petshop.id).order("nome").order("id").range(de, ate))
    : []), [petshop.id, ligado]);
}

/**
 * Pergunta "é a mesma pessoa?" quando o nome ou o telefone digitado já é de um tutor.
 * Fechar no X volta para o formulário sem decidir nada.
 */
export function FolhaMesmaPessoa({ igual, digitado, aoUsar, aoCriar, aoFechar, ocupado }: {
  igual: { tutor: TutorCurto; por: "telefone" | "nome" }; digitado: string;
  aoUsar: () => void; aoCriar: () => void; aoFechar: () => void; ocupado?: boolean;
}) {
  const { tutor, por } = igual;
  const mesmoNome = semAcento(tutor.nome) === semAcento(digitado);
  return (
    <Folha titulo={por === "telefone" ? `Já existe ${tutor.nome} com esse número` : `Já existe ${tutor.nome} no cadastro`} aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" disabled={ocupado} onClick={aoCriar}>Criar outro</button>
        <button type="button" className="g-btn pri" disabled={ocupado} onClick={aoUsar} autoFocus>Usar {tutor.nome}</button>
      </>}>
      <div className="g-pilha">
        <div className="g-card areia g-fila">
          <AvatarPessoa nome={tutor.nome} />
          <div className="g-cresce"><b>{tutor.nome}</b><div className="g-pp g-muted">{fmtTelefone(tutor.telefone) || "Sem telefone"}</div></div>
        </div>
        <p><b>É a mesma pessoa?</b></p>
        <p className="g-muted g-p">
          {por === "telefone" && !mesmoNome ? `Você escreveu “${digitado.trim()}”, mas esse número já está na ficha de ${tutor.nome}. ` : ""}
          Se for, toque em Usar {tutor.nome}: fica uma ficha só, com todos os pets juntos. Se for outra pessoa{por === "nome" ? " com o mesmo nome" : " que usa o mesmo número"}, toque em Criar outro.
        </p>
      </div>
    </Folha>
  );
}

/** Lista de tutores com busca por nome ou telefone. `sugeridos` aparecem primeiro (mesmo nome ou telefone). */
function EscolherTutor({ fora, sugeridos, aoEscolher }: { fora: string; sugeridos?: (c: TutorCurto) => boolean; aoEscolher: (c: TutorCurto) => void }) {
  const [q, setQ] = useState("");
  const { dados } = useTutores();
  const lista = useMemo(() => {
    const alvo = semAcento(q), fone = soDigitos(q).length >= 3 ? soDigitos(q) : "";
    const todos = (dados ?? []).filter((c) => c.id !== fora && (!alvo || semAcento(c.nome).includes(alvo) || (!!fone && soDigitos(c.telefone).includes(fone))));
    const antes = sugeridos ? todos.filter(sugeridos) : [];
    return [...antes.map((c) => ({ c, parecido: true })), ...todos.filter((c) => !antes.includes(c)).map((c) => ({ c, parecido: false }))].slice(0, 30);
  }, [dados, q, fora, sugeridos]);
  return (
    <div className="g-pilha p">
      <div className="g-busca">
        <Search />
        <input className="g-input" placeholder="Nome ou telefone do tutor" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Procurar tutor" />
      </div>
      <div className="g-lista">
        {lista.map(({ c, parecido }) => (
          <button key={c.id} type="button" className="g-linha" onClick={() => aoEscolher(c)}>
            <AvatarPessoa nome={c.nome} />
            <span className="t"><b>{c.nome}</b><span>{fmtTelefone(c.telefone) || "Sem telefone"}</span></span>
            {parecido && <span className="d"><span className="g-tag amarelo">Parecido</span></span>}
          </button>
        ))}
        {dados && !lista.length && <p className="g-muted g-p" style={{ padding: "12px 4px" }}>Nenhum outro tutor encontrado.</p>}
      </div>
    </div>
  );
}

/** Passa um pet para outro tutor (ficha do pet). O histórico do pet vai junto; o que já foi pago continua na ficha de quem pagou. */
export function FolhaTrocarTutor({ pet, tutorAtual, aoFechar, aoTrocar }: { pet: Pick<Pet, "id" | "nome">; tutorAtual: TutorCurto | null; aoFechar: () => void; aoTrocar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [novo, setNovo] = useState<TutorCurto | null>(null);
  const [indo, setIndo] = useState(false);

  async function trocar() {
    if (!novo || indo || somenteLeitura()) return;
    setIndo(true);
    try {
      ok(await sb.from("pets").update({ cliente_id: novo.id }).eq("id", pet.id).eq("petshop_id", petshop.id).select("id").single());
      avisar(`${pet.nome} agora está na ficha de ${novo.nome}.`);
      avisarMudanca();
      aoTrocar();
    } catch (e) { avisarErro(e); setIndo(false); }
  }

  return (
    <Folha titulo={`Trocar o tutor de ${pet.nome}`} aoFechar={aoFechar}
      rodape={novo ? <><button type="button" className="g-btn sec" disabled={indo} onClick={() => setNovo(null)}>Voltar</button><button type="button" className="g-btn pri" disabled={indo} onClick={() => void trocar()}>{indo ? "Trocando…" : `Passar para ${novo.nome}`}</button></> : undefined}>
      {!novo ? (
        <div className="g-pilha">
          <p className="g-muted g-p">Hoje {pet.nome} está na ficha de {tutorAtual?.nome ?? "um tutor"}. Escolha o tutor certo.</p>
          <EscolherTutor fora={tutorAtual?.id ?? ""} aoEscolher={setNovo} />
        </div>
      ) : (
        <div className="g-pilha">
          <p><b>{pet.nome}</b> sai da ficha de {tutorAtual?.nome ?? "quem está hoje"} e vai para a ficha de <b>{novo.nome}</b>{novo.telefone ? ` (${fmtTelefone(novo.telefone)})` : ""}.</p>
          <p className="g-muted g-p">
            Vão junto os horários marcados e já atendidos, os pacotes, as estadias e a saúde de {pet.nome}. Os lembretes passam a ir para {novo.nome}.
            O que já foi pago ou ficou a receber continua na ficha de {tutorAtual?.nome ?? "quem pagou"}. Se as duas fichas são da mesma pessoa, prefira Juntar com outro tutor, na ficha do tutor.
          </p>
        </div>
      )}
    </Folha>
  );
}

/**
 * Junta um cadastro repetido nesta ficha: os pets, as contas e os prêmios do outro tutor vêm para cá e a ficha dele deixa de existir.
 * A troca é feita de uma vez no banco (função `clientes_juntar`): ou vai tudo, ou não muda nada.
 */
export function FolhaJuntarTutor({ cliente, aoFechar, aoJuntar }: { cliente: Cliente; aoFechar: () => void; aoJuntar: () => void }) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [outro, setOutro] = useState<TutorCurto | null>(null);
  const [indo, setIndo] = useState(false);

  // o que vai mudar de ficha, para a confirmação dizer com números
  const { dados: leva, carregando } = useDados(async () => {
    if (!outro) return null;
    const [pets, contas, premios] = await Promise.all([
      sb.from("pets").select("nome").eq("petshop_id", petshop.id).eq("cliente_id", outro.id).order("nome"),
      vejoFinanceiro ? sb.from("lancamentos").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).eq("cliente_id", outro.id) : Promise.resolve({ count: null, error: null }),
      sb.from("fidelidade_resgates").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).eq("cliente_id", outro.id),
    ]);
    if (pets.error) throw new Error(pets.error.message);
    return { pets: (pets.data ?? []).map((p) => p.nome), contas: contas.count ?? null, premios: premios.error ? 0 : premios.count ?? 0 };
  }, [outro?.id, petshop.id, vejoFinanceiro]);

  const parecido = useMemo(() => {
    const fone = fimDoTelefone(cliente.telefone), nome = semAcento(cliente.nome), primeiro = nome.split(" ")[0];
    return (c: TutorCurto) => (!!fone && fimDoTelefone(c.telefone) === fone) || semAcento(c.nome) === nome || (primeiro.length >= 3 && semAcento(c.nome).split(" ")[0] === primeiro);
  }, [cliente.nome, cliente.telefone]);

  async function juntar() {
    if (!outro || indo || somenteLeitura()) return;
    setIndo(true);
    try {
      ok(await sb.rpc("clientes_juntar", { p_de: outro.id, p_para: cliente.id }));
      avisar(`Pronto: a ficha de ${outro.nome} foi juntada a esta.`);
      avisarMudanca();
      aoJuntar();
    } catch (e) { avisarErro(e); setIndo(false); }
  }

  const lista = (itens: string[]) => (itens.length <= 1 ? itens.join("") : `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`);
  const oQueVem = leva ? [
    leva.pets.length ? `${leva.pets.length === 1 ? "o pet" : `os ${leva.pets.length} pets`} (${lista(leva.pets)}), com os horários, pacotes e estadias` : null,
    leva.contas == null ? "as contas e os recebimentos" : leva.contas > 0 ? (leva.contas === 1 ? "1 conta ou recebimento" : `${leva.contas} contas e recebimentos`) : null,
    leva.premios > 0 ? (leva.premios === 1 ? "1 prêmio de fidelidade já entregue" : `${leva.premios} prêmios de fidelidade já entregues`) : null,
  ].filter((x): x is string => !!x) : [];

  return (
    <Folha titulo="Juntar com outro tutor" aoFechar={aoFechar}
      rodape={outro ? <><button type="button" className="g-btn sec" disabled={indo} onClick={() => setOutro(null)}>Voltar</button><button type="button" className="g-btn pri" disabled={indo || carregando || !leva} onClick={() => void juntar()}>{indo ? "Juntando…" : "Juntar as duas fichas"}</button></> : undefined}>
      {!outro ? (
        <div className="g-pilha">
          <p className="g-muted g-p">Para quando a mesma pessoa foi cadastrada duas vezes. Escolha a ficha repetida: tudo o que está nela vem para a ficha de <b>{cliente.nome}</b>.</p>
          <EscolherTutor fora={cliente.id} sugeridos={parecido} aoEscolher={setOutro} />
        </div>
      ) : (
        <div className="g-pilha">
          <div className="g-card areia g-pilha p">
            <div className="g-fila"><AvatarPessoa nome={outro.nome} /><div className="g-cresce"><b>{outro.nome}</b><div className="g-pp g-muted">{fmtTelefone(outro.telefone) || "Sem telefone"} · esta ficha deixa de existir</div></div></div>
            <div className="g-fila"><AvatarPessoa nome={cliente.nome} /><div className="g-cresce"><b>{cliente.nome}</b><div className="g-pp g-muted">{fmtTelefone(cliente.telefone) || "Sem telefone"} · fica com tudo</div></div></div>
          </div>
          {!leva ? <p className="g-muted g-p">Conferindo o que tem na ficha de {outro.nome}…</p> : (
            <>
              <p>{oQueVem.length ? <>Vêm para a ficha de <b>{cliente.nome}</b>: {lista(oQueVem)}.</> : <>A ficha de {outro.nome} está vazia: ela só deixa de existir.</>}</p>
              <p className="g-muted g-p">
                O nome que fica é {cliente.nome}. Telefone, e-mail e endereço que estiverem em branco aqui são completados com os de {outro.nome}.
                Não dá para desfazer depois.
              </p>
            </>
          )}
        </div>
      )}
    </Folha>
  );
}
