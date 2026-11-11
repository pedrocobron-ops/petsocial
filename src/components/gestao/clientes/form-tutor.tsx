"use client";

import { useState } from "react";
import type { Cliente } from "@/lib/gestao/tipos";
import { useGestao } from "../contexto";
import { Campo, Folha, ok, useAvisos } from "../ui";

/** Cadastro ou edição de um tutor (cliente). */
export default function FormTutor({ cliente, aoFechar, aoSalvar }: { cliente?: Cliente; aoFechar: () => void; aoSalvar: (c: Cliente) => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState(cliente?.nome ?? "");
  const [telefone, setTelefone] = useState(cliente?.telefone ?? "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [endereco, setEndereco] = useState(cliente?.endereco ?? "");
  const [obs, setObs] = useState(cliente?.obs ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || salvando) return;
    setSalvando(true);
    try {
      const campos = { nome: nome.trim(), telefone: telefone.trim() || null, email: email.trim() || null, endereco: endereco.trim() || null, obs: obs.trim() || null };
      const salvo = cliente
        ? ok(await sb.from("clientes").update(campos).eq("id", cliente.id).eq("petshop_id", petshop.id).select().single())
        : ok(await sb.from("clientes").insert({ ...campos, petshop_id: petshop.id }).select().single());
      avisar(cliente ? "Dados atualizados." : `${campos.nome} entrou na lista.`);
      aoSalvar(salvo);
    } catch (err) { avisarErro(err); }
    setSalvando(false);
  }

  return (
    <Folha titulo={cliente ? `Dados de ${cliente.nome}` : "Tutor novo"} aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Cancelar</button><button className="g-btn pri" form="form-tutor" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button></>}>
      <form id="form-tutor" className="g-form" onSubmit={salvar}>
        <Campo rotulo="Nome"><input className="g-input" required maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!nome} /></Campo>
        <Campo rotulo="WhatsApp"><input className="g-input" type="tel" inputMode="tel" autoComplete="off" placeholder="(11) 99999-9999" maxLength={30} value={telefone} onChange={(e) => setTelefone(e.target.value)} /></Campo>
        <Campo rotulo="E-mail"><input className="g-input" type="email" inputMode="email" autoComplete="off" maxLength={160} value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        <Campo rotulo="Endereço" dica="Ajuda no leva e traz."><input className="g-input" autoComplete="off" maxLength={200} value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Campo>
        <Campo rotulo="Observações"><textarea className="g-textarea" maxLength={600} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
      </form>
    </Folha>
  );
}
