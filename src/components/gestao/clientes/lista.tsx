"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Download, Plus, Search, Sparkles, UserPlus } from "lucide-react";
import type { Cliente } from "@/lib/gestao/tipos";
import { fmtTelefone, haQuanto, isoDia, semAcento, soDigitos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import FormPet from "../form-pet";
import { abrirAssistente, AvatarPessoa, AvatarPet, avisarMudanca, Esqueleto, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { baixarCsv, buscarTudo, linkPet, linkTutor, nomePorte, type PetDaLista } from "./comum";
import FormTutor from "./form-tutor";

type Filtro = "todos" | "sumidos30" | "sumidos60" | "alerta";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "sumidos30", rotulo: "Sumidos há 30 dias" },
  { id: "sumidos60", rotulo: "Sumidos há 60 dias" },
  { id: "alerta", rotulo: "Com alerta" },
];
const PASSO = 100;
const PEDIDO_EXEMPLO = "cadastra a Mel, shih-tzu pequena, da Dona Célia, telefone ";

export default function Lista({ aoAbrir, irPara }: {
  /** Chamado ao tocar numa linha (a tela guarda a rolagem antes de trocar). */
  aoAbrir: () => void;
  irPara: (url: string) => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [aba, setAba] = useState<"pets" | "tutores">("pets");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [mostrar, setMostrar] = useState(PASSO);
  const [petNovo, setPetNovo] = useState(false);
  const [tutorNovo, setTutorNovo] = useState(false);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [pets, clientes] = await Promise.all([
      buscarTudo<PetDaLista>((de, ate) => sb.from("pets").select("*, clientes(id, nome, telefone)").eq("petshop_id", petshop.id).eq("ativo", true)
        .order("nome").order("id").range(de, ate) as unknown as PromiseLike<{ data: PetDaLista[] | null; error: { message: string } | null }>),
      buscarTudo<Cliente>((de, ate) => sb.from("clientes").select("*").eq("petshop_id", petshop.id).order("nome").order("id").range(de, ate)),
    ]);
    return { pets, clientes };
  }, [petshop.id]);

  // Último atendimento concluído de cada pet: uma consulta do mais novo para o mais antigo, reduzida aqui.
  // Para de buscar quando todos os pets da lista já apareceram.
  const totalPets = dados?.pets.length ?? null;
  const { dados: ultimos, erro: erroUltimos } = useDados(async () => {
    if (!dados) return null; // a lista ainda não chegou
    const mapa: Record<string, string> = {};
    if (!dados.pets.length) return mapa;
    const faltam = new Set(dados.pets.map((p) => p.id));
    await buscarTudo<{ pet_id: string; inicio: string }>(
      (de, ate) => sb.from("agendamentos").select("pet_id, inicio").eq("petshop_id", petshop.id).eq("status", "concluido")
        .order("inicio", { ascending: false }).order("id").range(de, ate),
      (linhas) => {
        for (const l of linhas) if (!mapa[l.pet_id]) { mapa[l.pet_id] = l.inicio; faltam.delete(l.pet_id); }
        return faltam.size === 0;
      });
    return mapa;
  }, [petshop.id, totalPets]);

  const pets = useMemo(() => dados?.pets ?? [], [dados]);
  const clientes = useMemo(() => dados?.clientes ?? [], [dados]);
  const petsPorTutor = useMemo(() => {
    const m = new Map<string, PetDaLista[]>();
    for (const p of pets) m.set(p.cliente_id, [...(m.get(p.cliente_id) ?? []), p]);
    return m;
  }, [pets]);

  const alvo = semAcento(q);
  const alvoFone = soDigitos(q).length >= 3 ? soDigitos(q) : "";
  const bate = (...textos: (string | null | undefined)[]) => textos.some((t) => t && semAcento(t).includes(alvo));
  const bateFone = (fone: string | null | undefined) => !!alvoFone && soDigitos(fone).includes(alvoFone);

  const petsFiltrados = useMemo(() => {
    const agora = Date.now();
    const sumido = (id: string, dias: number) => { const u = ultimos?.[id]; return !u || agora - new Date(u).getTime() > dias * 864e5; };
    return pets.filter((p) => {
      if (alvo && !bate(p.nome, p.clientes?.nome) && !bateFone(p.clientes?.telefone)) return false;
      if (filtro === "alerta") return !!p.alertas?.trim();
      if (filtro === "sumidos30") return sumido(p.id, 30);
      if (filtro === "sumidos60") return sumido(p.id, 60);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pets, ultimos, alvo, alvoFone, filtro]);

  const tutoresFiltrados = useMemo(() => clientes.filter((c) =>
    !alvo || bate(c.nome, ...(petsPorTutor.get(c.id) ?? []).map((p) => p.nome)) || bateFone(c.telefone)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [clientes, petsPorTutor, alvo, alvoFone]);

  function abrirPetNovo() { if (!somenteLeitura()) setPetNovo(true); }
  function exportar() {
    if (!clientes.length) { avisar("Ainda não há ninguém para exportar."); return; }
    try {
      baixarCsv(clientes, pets, `clientes-e-pets-${isoDia(new Date())}.csv`);
      avisar("Lista baixada.");
    } catch (e) { avisarErro(e); }
  }

  const esperandoUltimos = (filtro === "sumidos30" || filtro === "sumidos60") && !ultimos && !erroUltimos;
  const contagem = !dados ? " " : aba === "pets"
    ? (pets.length === 1 ? "1 pet" : `${pets.length} pets`) + (petsFiltrados.length !== pets.length ? ` · ${petsFiltrados.length} na lista` : "")
    : (clientes.length === 1 ? "1 tutor" : `${clientes.length} tutores`) + (tutoresFiltrados.length !== clientes.length ? ` · ${tutoresFiltrados.length} na lista` : "");

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Clientes e pets</h1>
          <p className="g-muted">{contagem}</p>
        </div>
        <div className="g-acoes">
          <button className="g-btn sec" onClick={exportar} disabled={!dados}><Download />Exportar</button>
          <button className="g-btn pri" onClick={abrirPetNovo}><Plus />Pet novo</button>
        </div>
      </header>

      <div className="gc-filtros">
        <div className="g-fila entre">
          <div className="g-seg" role="group" aria-label="O que mostrar">
            <button aria-pressed={aba === "pets"} onClick={() => { setAba("pets"); setMostrar(PASSO); }}>Pets</button>
            <button aria-pressed={aba === "tutores"} onClick={() => { setAba("tutores"); setMostrar(PASSO); }}>Tutores</button>
          </div>
          {aba === "tutores" && <button className="g-btn fantasma p" onClick={() => { if (!somenteLeitura()) setTutorNovo(true); }}><UserPlus />Tutor novo</button>}
        </div>
        <div className="g-busca">
          <Search />
          <input className="g-input" type="search" placeholder="Nome do pet, do tutor ou telefone" aria-label="Buscar" value={q}
            onChange={(e) => { setQ(e.target.value); setMostrar(PASSO); }} />
        </div>
        {aba === "pets" && (
          <div className="g-chips" role="group" aria-label="Filtro">
            {FILTROS.map((f) => <button key={f.id} className="g-chip" aria-pressed={filtro === f.id} onClick={() => { setFiltro(f.id); setMostrar(PASSO); }}>{f.rotulo}</button>)}
          </div>
        )}
      </div>

      {erro && !dados ? (
        <Vazio titulo="Não consegui carregar a lista" texto={erro}>
          <button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button>
        </Vazio>
      ) : carregando && !dados ? <Esqueleto linhas={6} />
      : aba === "pets" ? (
        !pets.length ? (
          <Vazio titulo="Nenhum pet por aqui ainda" texto="Cadastre o primeiro. Ou peça ao Mozart, do jeito que você fala." mozart="acenando">
            <button className="g-btn verde" onClick={abrirPetNovo}><Plus />Cadastrar o primeiro pet</button>
            <button className="g-btn sec" onClick={() => abrirAssistente(PEDIDO_EXEMPLO)}><Sparkles />Pedir ao Mozart</button>
          </Vazio>
        ) : esperandoUltimos ? <Esqueleto linhas={4} />
        : !petsFiltrados.length ? (
          <Vazio titulo={alvo ? "Não achei ninguém com esse nome" : filtro === "alerta" ? "Nenhum pet com alerta" : "Ninguém sumido"}
            texto={alvo ? "Confira como está escrito ou cadastre um pet novo." : filtro === "alerta" ? "Alergias, medos e cuidados aparecem aqui quando estiverem na ficha." : "Todo mundo passou por aqui nesse período."}>
            {(alvo || filtro !== "todos") && <button className="g-btn sec" onClick={() => { setQ(""); setFiltro("todos"); }}>Ver todos</button>}
          </Vazio>
        ) : (
          <>
            {erroUltimos && <p className="g-erro" style={{ marginBottom: 10 }}>Não consegui ver quando cada pet veio pela última vez.</p>}
            <div className="g-lista gc-lista">
              {petsFiltrados.slice(0, mostrar).map((p) => (
                <Link key={p.id} href={linkPet(p.id)} scroll={false} className="g-linha" onClick={aoAbrir}>
                  <AvatarPet pet={p} />
                  <span className="t">
                    <b>{p.nome}{p.alertas?.trim() && <AlertTriangle className="gc-alerta" aria-label="Tem alerta" />}</b>
                    <span>{[p.clientes?.nome, p.raca, p.porte ? nomePorte(p.porte) : null].filter(Boolean).join(" · ")}</span>
                  </span>
                  {ultimos && <span className="d g-pp g-muted">{ultimos[p.id] ? haQuanto(ultimos[p.id]) : "ainda não veio"}</span>}
                </Link>
              ))}
            </div>
            {petsFiltrados.length > mostrar && <div className="gc-fim"><button className="g-btn sec" onClick={() => setMostrar(mostrar + PASSO)}>Mostrar mais</button></div>}
          </>
        )
      ) : !clientes.length ? (
        <Vazio titulo="Nenhum tutor por aqui ainda" texto="O tutor entra junto quando você cadastra o primeiro pet." mozart="acenando">
          <button className="g-btn verde" onClick={abrirPetNovo}><Plus />Cadastrar o primeiro pet</button>
          <button className="g-btn sec" onClick={() => abrirAssistente(PEDIDO_EXEMPLO)}><Sparkles />Pedir ao Mozart</button>
        </Vazio>
      ) : !tutoresFiltrados.length ? (
        <Vazio titulo="Não achei ninguém com esse nome" texto="Confira como está escrito ou busque pelo telefone.">
          <button className="g-btn sec" onClick={() => setQ("")}>Ver todos</button>
        </Vazio>
      ) : (
        <>
          <div className="g-lista gc-lista">
            {tutoresFiltrados.slice(0, mostrar).map((c) => {
              const dele = petsPorTutor.get(c.id) ?? [];
              return (
                <Link key={c.id} href={linkTutor(c.id)} scroll={false} className="g-linha" onClick={aoAbrir}>
                  <AvatarPessoa nome={c.nome} />
                  <span className="t">
                    <b>{c.nome}</b>
                    <span>{[dele.map((p) => p.nome).join(", ") || "Sem pet na lista", fmtTelefone(c.telefone)].filter(Boolean).join(" · ")}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          {tutoresFiltrados.length > mostrar && <div className="gc-fim"><button className="g-btn sec" onClick={() => setMostrar(mostrar + PASSO)}>Mostrar mais</button></div>}
        </>
      )}

      {petNovo && (
        <FormPet nomeInicial={aba === "pets" && petsFiltrados.length === 0 ? q.trim() : undefined} aoFechar={() => setPetNovo(false)}
          aoSalvar={(p) => { setPetNovo(false); avisarMudanca(); aoAbrir(); irPara(linkPet(p.id)); }} />
      )}
      {tutorNovo && (
        <FormTutor aoFechar={() => setTutorNovo(false)}
          aoSalvar={(c) => { setTutorNovo(false); avisarMudanca(); aoAbrir(); irPara(linkTutor(c.id)); }} />
      )}
    </>
  );
}
