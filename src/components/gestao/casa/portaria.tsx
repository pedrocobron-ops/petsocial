"use client";

import { useState } from "react";
import { Check, Phone, Plus, ShieldCheck, Stethoscope, Trash2, UserRound } from "lucide-react";
import { contatosDoPet, nomeComRelacao, type Contato, type Retirada } from "@/lib/gestao/casa-opcoes";
import type { Banco } from "@/lib/gestao/supabase";
import { fmtTelefone, soDigitos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvatarPet, Campo, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "./casa.css";

/**
 * Quem pode buscar o pet (opção "casa.portaria"): as pessoas autorizadas e o veterinário de emergência ficam na ficha,
 * por tutor (valem para todos os pets dele) ou por pet. Na saída, a equipe marca quem levou e isso fica na estadia.
 */
type PetDaPortaria = { id: string; nome: string; foto?: string | null; especie?: string | null; clientes?: { id: string; nome: string; telefone?: string | null } | null };

/** Os contatos (autorizados e veterinário) que valem para o pet. */
export async function lerContatos(sb: Banco, petshopId: string, pet: PetDaPortaria): Promise<Contato[]> {
  const tutor = pet.clientes?.id;
  const q = sb.from("pets_contatos").select("*").eq("petshop_id", petshopId);
  const r = await (tutor ? q.or(`pet_id.eq.${pet.id},cliente_id.eq.${tutor}`) : q.eq("pet_id", pet.id)).order("criado_em").limit(100);
  if (r.error) throw new Error(r.error.message);
  return contatosDoPet(r.data ?? [], pet);
}

/** Quem levou cada pet, das estadias pedidas. */
export async function lerRetiradas(sb: Banco, petshopId: string, estadiaIds: string[]): Promise<Map<string, Retirada>> {
  const mapa = new Map<string, Retirada>();
  for (let i = 0; i < estadiaIds.length; i += 100) {
    const r = await sb.from("estadias_retiradas").select("*").eq("petshop_id", petshopId).in("estadia_id", estadiaIds.slice(i, i + 100));
    for (const x of r.data ?? []) mapa.set(x.estadia_id, x);
  }
  return mapa;
}
/** "com Maria (avó)" */
export const textoDaRetirada = (r: Pick<Retirada, "quem" | "nome" | "relacao">) => `com ${r.quem === "tutor" ? `${r.nome} (tutor)` : nomeComRelacao(r)}`;

const telLink = (t: string | null | undefined) => (soDigitos(t).length >= 8 ? `tel:${soDigitos(t)}` : null);

/** Linha do veterinário de emergência, com o telefone para tocar e ligar. */
export function VeterinarioDoPet({ contatos }: { contatos: Contato[] }) {
  const vets = contatos.filter((c) => c.tipo === "veterinario");
  if (!vets.length) return null;
  return (
    <div className="g-cs-vet">
      <Stethoscope aria-hidden />
      <span>{vets.map((v, i) => (
        <span key={v.id}>{i > 0 ? " · " : ""}<b>Veterinário: {v.nome}</b>{v.telefone ? <> · {telLink(v.telefone) ? <a href={telLink(v.telefone)!}>{fmtTelefone(v.telefone)}</a> : v.telefone}</> : ""}{v.obs ? ` · ${v.obs}` : ""}</span>
      ))}</span>
    </div>
  );
}

/* ---------- a lista na ficha: quem pode buscar e o veterinário ---------- */

function NovoContato({ pet, tipo, aoFechar, aoGravar }: { pet: PetDaPortaria; tipo: "busca" | "veterinario"; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const [nome, setNome] = useState("");
  const [relacao, setRelacao] = useState("");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");
  const [todos, setTodos] = useState(Boolean(pet.clientes?.id));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const vet = tipo === "veterinario";

  async function salvar() {
    if (salvando) return;
    if (nome.trim().length < 2) return setErro(vet ? "Escreva o nome do veterinário ou da clínica." : "Escreva o nome da pessoa.");
    setErro(null); setSalvando(true);
    try {
      ok(await sb.from("pets_contatos").insert({
        petshop_id: petshop.id, tipo, nome: nome.trim(), relacao: vet ? null : relacao.trim() || null, telefone: soDigitos(telefone) || null, obs: obs.trim() || null,
        cliente_id: pet.clientes?.id ?? null, pet_id: todos && pet.clientes?.id ? null : pet.id,
      }).select("id"));
      avisar(vet ? "Veterinário de emergência guardado." : `${nome.trim()} pode buscar ${todos && pet.clientes?.id ? "os pets deste tutor" : pet.nome}.`);
      aoGravar();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha titulo={vet ? "Veterinário de emergência" : "Quem pode buscar"} aoFechar={aoFechar}
      rodape={<><button className="g-btn sec" onClick={aoFechar}>Voltar</button><button className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Guardar"}</button></>}>
      <div className="g-form">
        <Campo rotulo={vet ? "Nome do veterinário ou da clínica" : "Nome da pessoa"} erro={erro}><input className="g-input" value={nome} maxLength={80} autoFocus onChange={(e) => { setNome(e.target.value); setErro(null); }} /></Campo>
        {!vet && <Campo rotulo="O que é do tutor" dica="Opcional. Ex.: avó, marido, passeador."><input className="g-input" value={relacao} maxLength={40} onChange={(e) => setRelacao(e.target.value)} /></Campo>}
        <Campo rotulo="Telefone" dica="Opcional."><input className="g-input" type="tel" inputMode="tel" value={telefone} maxLength={20} onChange={(e) => setTelefone(e.target.value)} onBlur={() => setTelefone(fmtTelefone(telefone))} /></Campo>
        <Campo rotulo="Observação" dica={vet ? "Opcional. Ex.: atende 24 horas, endereço." : "Opcional. Ex.: só às sextas, mostrar documento."}><input className="g-input" value={obs} maxLength={200} onChange={(e) => setObs(e.target.value)} /></Campo>
        {pet.clientes?.id && <label className="g-check"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /><span>Vale para todos os pets de {pet.clientes.nome}</span></label>}
      </div>
    </Folha>
  );
}

/** Cartão da ficha do pet (e da folha aberta pela creche e hotel): autorizados a buscar e veterinário de emergência. */
export function QuemPodeBuscar({ pet, solto, aoMudar }: { pet: PetDaPortaria; solto?: boolean; aoMudar?: () => void }) {
  const { sb, petshop, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [novo, setNovo] = useState<"busca" | "veterinario" | null>(null);
  const { dados, erro, recarregar } = useDados(() => lerContatos(sb, petshop.id, pet), [petshop.id, pet.id, pet.clientes?.id]);
  const podeMudar = posso("creche_hotel") || posso("clientes");
  const busca = (dados ?? []).filter((c) => c.tipo === "busca"), vets = (dados ?? []).filter((c) => c.tipo === "veterinario");

  async function tirar(c: Contato) {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: `Tirar ${c.nome}?`, texto: c.tipo === "busca" ? `${c.nome} deixa de aparecer como autorizado a buscar${c.pet_id ? ` ${pet.nome}` : " os pets deste tutor"}.` : "O contato do veterinário sai da ficha.", confirmar: "Tirar", perigo: true }))) return;
    try {
      ok(await sb.from("pets_contatos").delete().eq("id", c.id).eq("petshop_id", petshop.id).select("id"));
      avisar("Contato tirado."); await recarregar(); aoMudar?.();
    } catch (e) { avisarErro(e); }
  }
  const linha = (c: Contato) => (
    <div key={c.id} className="g-linha">
      <span className="t">
        <b>{nomeComRelacao(c)}</b>
        <span>{[c.telefone ? fmtTelefone(c.telefone) : null, c.pet_id ? `só ${pet.nome}` : pet.clientes ? "todos os pets do tutor" : null, c.obs].filter(Boolean).join(" · ") || "sem telefone"}</span>
      </span>
      {telLink(c.telefone) && <a className="g-ico" href={telLink(c.telefone)!} aria-label={`Ligar para ${c.nome}`}><Phone /></a>}
      {podeMudar && <button type="button" className="g-ico" onClick={() => void tirar(c)} aria-label={`Tirar ${c.nome}`}><Trash2 /></button>}
    </div>
  );

  const corpo = (
    <>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <p className="g-muted g-p">{pet.clientes ? `${pet.clientes.nome} (tutor) sempre pode buscar. ` : ""}{!dados ? (erro ? "" : "Buscando os autorizados…") : busca.length ? "Além do tutor, estas pessoas estão autorizadas:" : "Ninguém mais foi autorizado ainda."}</p>
      {busca.length > 0 && <div className="g-lista">{busca.map(linha)}</div>}
      <p className="g-rotulo" style={{ marginTop: 6 }}>Veterinário de emergência</p>
      {vets.length ? <div className="g-lista">{vets.map(linha)}</div> : dados ? <p className="g-muted g-p">Nenhum contato de veterinário na ficha.</p> : null}
      {podeMudar && (
        <div className="g-fila">
          <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) setNovo("busca"); }}><Plus />Autorizar uma pessoa</button>
          <button type="button" className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setNovo("veterinario"); }}><Stethoscope />Veterinário</button>
        </div>
      )}
      {novo && <NovoContato pet={pet} tipo={novo} aoFechar={() => setNovo(null)} aoGravar={() => { setNovo(null); void recarregar(); aoMudar?.(); }} />}
    </>
  );
  if (solto) return <div className="g-pilha p">{corpo}</div>;
  return (
    <section className="g-card g-pilha p">
      <div className="g-card-t" style={{ marginBottom: 0 }}><h3><Tile icone={ShieldCheck} tom="ceu" tamanho="p" />Quem pode buscar</h3></div>
      {corpo}
    </section>
  );
}

/** Folha com a lista de autorizados, aberta pelo cartão do hóspede. */
export function FolhaQuemPodeBuscar({ pet, aoFechar }: { pet: PetDaPortaria; aoFechar: () => void }) {
  return (
    <Folha titulo={`Quem pode buscar ${pet.nome}`} aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
      <QuemPodeBuscar pet={pet} solto />
    </Folha>
  );
}

/* ---------- na saída: quem veio buscar ---------- */

type Escolha = { quem: "tutor" | "autorizado" | "outro"; contato?: Contato };

/**
 * "Quem veio buscar?": aparece antes da saída (check-out ou Saiu da chamada). A equipe toca em quem levou o pet,
 * e a resposta fica guardada na estadia. Dá para seguir sem marcar: a saída nunca fica presa por causa disto.
 */
export function QuemBuscou({ estadia, aoFechar, aoSeguir }: {
  estadia: { id: string; pets: PetDaPortaria | null }; aoFechar: () => void; aoSeguir: () => void | Promise<void>;
}) {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const pet = estadia.pets;
  const { dados, carregando } = useDados(async () => (pet ? lerContatos(sb, petshop.id, pet).catch(() => []) : []), [petshop.id, pet?.id]);
  const [escolha, setEscolha] = useState<Escolha | null>(pet?.clientes ? { quem: "tutor" } : null);
  const [nome, setNome] = useState("");
  const [relacao, setRelacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const autorizados = (dados ?? []).filter((c) => c.tipo === "busca");

  async function seguir(marcar: boolean) {
    if (salvando) return;
    if (marcar) {
      if (!escolha) return setErro("Toque em quem veio buscar.");
      if (escolha.quem === "outro" && nome.trim().length < 2) return setErro("Escreva o nome de quem veio buscar.");
      setErro(null); setSalvando(true);
      try {
        const linha = escolha.quem === "tutor" ? { quem: "tutor", nome: pet?.clientes?.nome ?? "Tutor", relacao: null, contato_id: null }
          : escolha.quem === "autorizado" ? { quem: "autorizado", nome: escolha.contato!.nome, relacao: escolha.contato!.relacao, contato_id: escolha.contato!.id }
          : { quem: "outro", nome: nome.trim(), relacao: relacao.trim() || null, contato_id: null };
        ok(await sb.from("estadias_retiradas").upsert({ estadia_id: estadia.id, petshop_id: petshop.id, ...linha }, { onConflict: "estadia_id" }).select("estadia_id"));
      } catch (e) { avisarErro(e); setSalvando(false); return; }
    } else {
      // saída desfeita e refeita sem marcar: a anotação antiga de quem buscou não vale mais (se não der para apagar, a saída segue)
      await sb.from("estadias_retiradas").delete().eq("estadia_id", estadia.id).eq("petshop_id", petshop.id).select("estadia_id");
    }
    setSalvando(true);
    try { await aoSeguir(); } finally { setSalvando(false); }
  }
  const opcao = (chave: string, ativo: boolean, aoTocar: () => void, titulo: string, apoio: string, Icone: typeof UserRound) => (
    <button key={chave} type="button" className="g-cs-quem" aria-pressed={ativo} onClick={() => { aoTocar(); setErro(null); }}>
      <Icone aria-hidden /><span><b>{titulo}</b><small>{apoio}</small></span>{ativo && <Check aria-hidden className="ok" />}
    </button>
  );

  return (
    <Folha titulo={`Quem veio buscar ${pet?.nome ?? "o pet"}?`} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={() => void seguir(false)} disabled={salvando}>Seguir sem marcar</button>
        <button className="g-btn pri" onClick={() => void seguir(true)} disabled={salvando}>{salvando ? "Salvando…" : "Confirmar e seguir"}</button>
      </>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={pet ?? { nome: "?" }} />
          <div className="g-cresce"><b style={{ display: "block" }}>{pet?.nome ?? "Pet"}</b><span className="g-muted g-p">Confira quem está levando antes de entregar.</span></div>
        </div>
        <div className="g-cs-quens" role="group" aria-label="Quem veio buscar">
          {pet?.clientes && opcao("tutor", escolha?.quem === "tutor", () => setEscolha({ quem: "tutor" }), pet.clientes.nome, "tutor", UserRound)}
          {autorizados.map((c) => opcao(c.id, escolha?.contato?.id === c.id, () => setEscolha({ quem: "autorizado", contato: c }), nomeComRelacao(c),
            ["autorizado", c.telefone ? fmtTelefone(c.telefone) : null, c.obs].filter(Boolean).join(" · "), ShieldCheck))}
          {opcao("outro", escolha?.quem === "outro", () => setEscolha({ quem: "outro" }), "Outra pessoa", "não está na lista de autorizados", UserRound)}
        </div>
        {carregando && !dados && <p className="g-muted g-pp">Buscando os autorizados…</p>}
        {dados && !autorizados.length && <p className="g-muted g-pp">Nenhuma pessoa além do tutor foi autorizada na ficha de {pet?.nome ?? "este pet"}.</p>}
        {escolha?.quem === "outro" && (
          <>
            <div className="g-aviso" style={{ marginBottom: 0 }}><ShieldCheck /><span className="g-cresce">Essa pessoa não está na lista. Confirme com o tutor antes de entregar {pet?.nome ?? "o pet"}.</span></div>
            <div className="dupla">
              <Campo rotulo="Nome de quem veio"><input className="g-input" value={nome} maxLength={80} onChange={(e) => { setNome(e.target.value); setErro(null); }} /></Campo>
              <Campo rotulo="O que é do tutor" dica="Opcional"><input className="g-input" value={relacao} maxLength={40} onChange={(e) => setRelacao(e.target.value)} /></Campo>
            </div>
          </>
        )}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
