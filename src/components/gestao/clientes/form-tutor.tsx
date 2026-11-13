"use client";

import { useState } from "react";
import type { Cliente } from "@/lib/gestao/tipos";
import { ERRO_TELEFONE, fmtTelefone, mascaraTelefone, telefoneLimpo, telefoneValido } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Campo, Folha, ok, useAvisos } from "../ui";
import { FolhaMesmaPessoa, acharTutorIgual, useTutores, type TutorCurto } from "./juntar";

/** Cadastro ou edição de um tutor (cliente). */
export default function FormTutor({ cliente, aoFechar, aoSalvar }: { cliente?: Cliente; aoFechar: () => void; aoSalvar: (c: Cliente) => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [nome, setNome] = useState(cliente?.nome ?? "");
  const [telefone, setTelefone] = useState(() => { const m = mascaraTelefone(cliente?.telefone); return telefoneValido(m) ? m : cliente?.telefone ?? ""; });
  const [erroFone, setErroFone] = useState<string | null>(null);
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [endereco, setEndereco] = useState(cliente?.endereco ?? "");
  const [obs, setObs] = useState(cliente?.obs ?? "");
  const [salvando, setSalvando] = useState(false);
  const { dados: tutores } = useTutores();
  const [igual, setIgual] = useState<{ tutor: TutorCurto; por: "telefone" | "nome" } | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    if (!telefoneValido(telefone)) { setErroFone(ERRO_TELEFONE); return; }
    const achado = acharTutorIgual(tutores ?? [], nome, telefone, cliente?.id);
    // tutor novo com nome ou telefone de quem já existe: pergunta antes de criar outro
    if (!cliente && achado) { setIgual(achado); return; }
    // editando: o telefone passou a ser igual ao de outra ficha
    const foneMudou = cliente && telefoneLimpo(telefone) !== telefoneLimpo(cliente.telefone);
    if (cliente && foneMudou && achado?.por === "telefone" && !(await confirmar({
      titulo: `${achado.tutor.nome} já tem esse número`,
      texto: `Se ${achado.tutor.nome} e ${nome.trim()} são a mesma pessoa, salve e depois toque em Juntar com outro tutor, na ficha: fica um cadastro só. Se são pessoas diferentes que usam o mesmo número, pode salvar.`,
      confirmar: "Salvar mesmo assim",
    }))) return;
    void gravar();
  }

  async function gravar() {
    setSalvando(true);
    try {
      if (cliente) {
        // outra pessoa mexeu neste cadastro depois que o formulário abriu? (a tabela não tem data de alteração: compara os campos)
        const agora = ok(await sb.from("clientes").select("nome, telefone, email, endereco, obs").eq("id", cliente.id).eq("petshop_id", petshop.id).maybeSingle()) as Pick<Cliente, "nome" | "telefone" | "email" | "endereco" | "obs"> | null;
        const igual = (a: string | null | undefined, b: string | null | undefined) => (a ?? "") === (b ?? "");
        const mudou = agora && !(igual(agora.nome, cliente.nome) && igual(agora.telefone, cliente.telefone) && igual(agora.email, cliente.email) && igual(agora.endereco, cliente.endereco) && igual(agora.obs, cliente.obs));
        if (mudou && !(await confirmar({
          titulo: "Este cadastro mudou enquanto você editava",
          texto: `Outra pessoa alterou os dados de ${agora.nome} há pouco${!igual(agora.telefone, cliente.telefone) ? ` (telefone agora: ${fmtTelefone(agora.telefone) || "em branco"})` : ""}. Se salvar, vale o que está neste formulário.`,
          confirmar: "Salvar mesmo assim",
        }))) { setSalvando(false); return; }
      }
      const campos = { nome: nome.trim(), telefone: telefoneLimpo(telefone) || null, email: email.trim() || null, endereco: endereco.trim() || null, obs: obs.trim() || null };
      const salvo = cliente
        ? ok(await sb.from("clientes").update(campos).eq("id", cliente.id).eq("petshop_id", petshop.id).select().single())
        : ok(await sb.from("clientes").insert({ ...campos, petshop_id: petshop.id }).select().single());
      avisar(cliente ? "Dados atualizados." : `${campos.nome} entrou na lista.`);
      aoSalvar(salvo);
    } catch (err) { avisarErro(err); }
    setSalvando(false);
  }

  if (igual) {
    return (
      <FolhaMesmaPessoa igual={igual} digitado={nome} ocupado={salvando} aoFechar={() => setIgual(null)}
        aoUsar={() => {
          // já existe: abre a ficha que já estava lá, sem criar outra
          void sb.from("clientes").select("*").eq("id", igual.tutor.id).eq("petshop_id", petshop.id).single().then(({ data, error }) => {
            if (error || !data) { avisarErro(error ?? new Error("Não achei esse tutor.")); return; }
            avisar(`Abri a ficha de ${data.nome}, que já existia.`);
            aoSalvar(data);
          });
        }}
        aoCriar={() => { setIgual(null); void gravar(); }} />
    );
  }

  return (
    <Folha titulo={cliente ? `Dados de ${cliente.nome}` : "Tutor novo"} aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-tutor" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></>}>
      <form id="form-tutor" className="g-form" onSubmit={salvar}>
        <Campo rotulo="Nome"><input className="g-input" required maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!nome} /></Campo>
        <Campo rotulo="WhatsApp" erro={erroFone} dica="DDD e número. Pode ficar em branco.">
          <input className="g-input" type="tel" inputMode="tel" autoComplete="off" placeholder="(11) 99999-9999" maxLength={24} value={telefone} aria-invalid={!!erroFone}
            onChange={(e) => { setTelefone(mascaraTelefone(e.target.value)); setErroFone(null); }}
            onBlur={() => setErroFone(telefoneValido(telefone) ? null : ERRO_TELEFONE)} />
        </Campo>
        <Campo rotulo="E-mail"><input className="g-input" type="email" inputMode="email" autoComplete="off" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <Campo rotulo="Endereço" dica="Ajuda no leva e traz."><input className="g-input" autoComplete="off" maxLength={200} value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Campo>
        <Campo rotulo="Observações"><textarea className="g-textarea" maxLength={600} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      </form>
    </Folha>
  );
}
