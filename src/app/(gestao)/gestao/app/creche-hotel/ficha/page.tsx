"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { horaFalada, lerCuidados, nomeDaAcomodacao } from "@/lib/gestao/hotel";
import { contatosDoPet, nomeComRelacao, type Contato } from "@/lib/gestao/casa-opcoes";
import { nomeDaCasa, usaModulo } from "@/lib/gestao/modulos";
import { dataCurta, deIsoDia, fmtTelefone, idade, isoDia } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPet, Esqueleto, ok, useDados } from "@/components/gestao/ui";
import { horaCurta, nomeTipo, SELECT_ESTADIA, type EstadiaCompleta } from "@/components/gestao/hotel/tipos";
import { CabecalhoDoPapel, ControlesDoPapel, Papel, useTituloDoPapel } from "@/components/gestao/papel";

/**
 * Ficha de cuidados do hóspede, para imprimir e deixar junto do pet: comida e remédio com os horários (com caixinha para marcar),
 * atenção e observações, tutor e telefones, quem pode buscar, veterinário de emergência e vacinas.
 * `estadia=<id>`: a ficha de um pet. Sem estadia: todos os que estão na casa agora, uma ficha por folha ou compactas.
 * Não mostra valores.
 */
type Pet = { id: string; nome: string; foto: string | null; especie: string; sexo: string | null; alertas: string | null; porte: string | null; raca: string | null; nascimento: string | null; obs: string | null; clientes: { id: string; nome: string; telefone: string | null; email: string | null; endereco: string | null } | null };
type Estadia = Omit<EstadiaCompleta, "pets"> & { pets: Pet | null };
type Vacina = { pet_id: string; nome: string; aplicado_em: string | null; vence_em: string | null };
const SELECT_FICHA = SELECT_ESTADIA.replace("pets(id, nome, foto, especie, sexo, alertas, porte, clientes(id, nome, telefone))",
  "pets(id, nome, foto, especie, sexo, alertas, porte, raca, nascimento, obs, clientes(id, nome, telefone, email, endereco))");

function FichaNoPapel() {
  const { sb, petshop } = useGestao();
  const params = useSearchParams();
  const estadiaId = params.get("estadia");
  const ambos = usaModulo(petshop, "creche") && usaModulo(petshop, "hotel");
  const [modo, setModo] = useState<"pagina" | "compacta">(params.get("modo") === "compacta" ? "compacta" : "pagina");
  const [tipo, setTipo] = useState<"todos" | "hotel" | "creche">(() => { const t = params.get("tipo"); return t === "hotel" || t === "creche" || t === "todos" ? t : ambos ? "hotel" : "todos"; });
  const hoje = isoDia(new Date());

  const { dados, carregando, erro } = useDados(async () => {
    const q = sb.from("estadias").select(SELECT_FICHA).eq("petshop_id", petshop.id);
    const estadias = ok(await (estadiaId ? q.eq("id", estadiaId) : q.eq("status", "em_casa").order("entrada").order("id")).limit(300)) as unknown as Estadia[];
    const pets = [...new Set(estadias.map((e) => e.pet_id))];
    const tutores = [...new Set(estadias.map((e) => e.pets?.clientes?.id).filter(Boolean))] as string[];
    const contatos: Contato[] = [], vacinas: Vacina[] = [];
    // quem não pode ler os contatos ou a saúde (área liberada pelo dono) recebe a ficha sem essa parte
    for (let i = 0; i < pets.length; i += 100) {
      const lote = pets.slice(i, i + 100);
      const [c, v] = await Promise.all([
        sb.from("pets_contatos").select("*").eq("petshop_id", petshop.id).or(`pet_id.in.(${lote.join(",")}),cliente_id.in.(${(tutores.length ? tutores : ["00000000-0000-0000-0000-000000000000"]).join(",")})`).order("criado_em").limit(1000),
        sb.from("pets_saude").select("pet_id, nome, aplicado_em, vence_em").eq("petshop_id", petshop.id).eq("tipo", "vacina").in("pet_id", lote).order("vence_em").limit(1000),
      ]);
      for (const x of c.data ?? []) if (!contatos.some((y) => y.id === x.id)) contatos.push(x);
      vacinas.push(...((v.data ?? []) as Vacina[]));
    }
    return { estadias, contatos, vacinas };
  }, [petshop.id, estadiaId]);

  const todas = dados?.estadias ?? [];
  const lista = estadiaId ? todas : todas.filter((e) => tipo === "todos" || e.tipo === tipo);
  const umSo = estadiaId && lista.length === 1 ? lista[0] : null;
  useTituloDoPapel(umSo ? `Ficha de cuidados ${umSo.pets?.nome ?? ""} · ${petshop.nome}` : `Fichas de cuidados ${hoje.split("-").reverse().join("-")} · ${petshop.nome}`);

  return (
    <div className="g-imp">
      <ControlesDoPapel voltar="/gestao/app/creche-hotel" rotuloVoltar={`Voltar para ${nomeDaCasa(petshop)}`} dica="A ficha não mostra valores.">
        {!estadiaId && (
          <div className="g-imp-linha">
            <div className="g-seg" role="group" aria-label="Como imprimir">
              <button aria-pressed={modo === "pagina"} onClick={() => setModo("pagina")}>Uma por folha</button>
              <button aria-pressed={modo === "compacta"} onClick={() => setModo("compacta")}>Compactas</button>
            </div>
            {ambos && (
              <div className="g-seg" role="group" aria-label="Quem">
                <button aria-pressed={tipo === "hotel"} onClick={() => setTipo("hotel")}>Hotel</button>
                <button aria-pressed={tipo === "creche"} onClick={() => setTipo("creche")}>Creche</button>
                <button aria-pressed={tipo === "todos"} onClick={() => setTipo("todos")}>Todos</button>
              </div>
            )}
          </div>
        )}
      </ControlesDoPapel>

      <Papel pe="Ficha de cuidados">
        {/* uma ficha por folha: cada folha leva o próprio cabeçalho */}
        {(umSo || modo !== "pagina" || !lista.length) && (
          <CabecalhoDoPapel titulo={umSo ? `Ficha de cuidados · ${nomeTipo(umSo.tipo)}` : `Fichas de cuidados · na casa agora${tipo !== "todos" ? ` (${nomeTipo(tipo).toLowerCase()})` : ""}`}
            apoio={!umSo && lista.length ? (lista.length === 1 ? "1 pet" : `${lista.length} pets`) : undefined} />
        )}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {carregando && !dados ? <Esqueleto linhas={5} /> : !lista.length ? (
          <p className="g-pa-vazio">{estadiaId ? "Não achei esta estadia." : "Ninguém na casa agora."}</p>
        ) : lista.map((e) => (
          <Ficha key={e.id} e={e} compacta={!umSo && modo === "compacta"} pagina={!umSo && modo === "pagina"} hoje={hoje}
            contatos={e.pets ? contatosDoPet(dados!.contatos, e.pets) : []} vacinas={dados!.vacinas.filter((v) => v.pet_id === e.pet_id)} />
        ))}
      </Papel>
    </div>
  );
}

function Ficha({ e, compacta, pagina, hoje, contatos, vacinas }: { e: Estadia; compacta: boolean; pagina: boolean; hoje: string; contatos: Contato[]; vacinas: Vacina[] }) {
  const { petshop } = useGestao();
  const pet = e.pets;
  const cuidados = lerCuidados(e);
  const comida = cuidados.filter((c) => c.tipo === "comida"), remedio = cuidados.filter((c) => c.tipo === "remedio");
  const busca = contatos.filter((c) => c.tipo === "busca"), vets = contatos.filter((c) => c.tipo === "veterinario");
  const fim = e.status === "encerrada" ? e.saida : e.saida_prevista;
  const atrasada = e.status === "em_casa" && Boolean(e.saida_prevista) && new Date(e.saida_prevista!).getTime() < Date.now();
  const sobre = [pet?.raca, pet?.porte ? `porte ${pet.porte}` : null, pet?.sexo === "M" ? "macho" : pet?.sexo === "F" ? "fêmea" : null, pet?.nascimento ? idade(pet.nascimento) : null].filter(Boolean).join(" · ");
  // a última de cada vacina (pelo nome), vencida ou não
  const porNome = new Map<string, Vacina>();
  for (const v of vacinas) { const k = v.nome.trim().toLowerCase(), x = porNome.get(k); if (!x || (v.aplicado_em ?? "") > (x.aplicado_em ?? "")) porNome.set(k, v); }
  const vacs = [...porNome.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const horas = (lista: string[]) => lista.length ? <span className="g-pa-horas">{lista.map((h) => <span key={h}><i />{horaFalada(h)}</span>)}</span> : null;
  const cuidado = (c: (typeof cuidados)[number]) => (
    <li key={c.id}><b>{c.oque}</b>{c.quanto ? `, ${c.quanto}` : ""}{c.horas.length ? <> {horas(c.horas)}</> : null}</li>
  );
  return (
    <section className={`g-pa-ficha${compacta ? " compacta" : ""}${pagina ? " pagina" : ""}`}>
      {pagina && <CabecalhoDoPapel titulo={`Ficha de cuidados · ${nomeTipo(e.tipo)}`} />}
      <div className="g-pa-ficha-t">
        <AvatarPet pet={pet ?? { nome: "?" }} tamanho={compacta ? undefined : "g"} />
        <div>
          <h2>{pet?.nome ?? "Pet removido"}</h2>
          <p>{[nomeTipo(e.tipo), sobre].filter(Boolean).join(" · ")}</p>
          <p>Entrou {dataCurta(e.entrada)} às {horaCurta(e.entrada)} · {fim ? `${e.status === "encerrada" ? "saiu" : "sai"} ${dataCurta(fim)} às ${horaCurta(fim)}` : "sem saída prevista"}
            {atrasada && <b> (saída atrasada)</b>}{nomeDaAcomodacao(petshop, e.acomodacao) ? ` · ${nomeDaAcomodacao(petshop, e.acomodacao)}` : ""}</p>
        </div>
      </div>
      {(pet?.alertas || pet?.obs || e.obs) && (
        <div className={`g-pa-caixa larga${pet?.alertas ? " alerta" : ""}`}>
          <h3>Atenção e observações</h3>
          {pet?.alertas && <p><b>{pet.alertas}</b></p>}
          {pet?.obs && <p>{pet.obs}</p>}
          {e.obs && <p>{e.obs}</p>}
        </div>
      )}
      <div className="g-pa-caixas">
        <div className="g-pa-caixa">
          <h3>Comida</h3>
          {comida.length ? <ul>{comida.map(cuidado)}</ul> : <p className="vazio">Nada anotado na reserva.</p>}
        </div>
        <div className="g-pa-caixa">
          <h3>Remédio</h3>
          {remedio.length ? <ul>{remedio.map(cuidado)}</ul> : <p className="vazio">Nenhum remédio anotado.</p>}
        </div>
        {!compacta && (
          <div className="g-pa-caixa">
            <h3>Tutor</h3>
            <p><b>{pet?.clientes?.nome ?? "Sem tutor na ficha"}</b>{pet?.clientes?.telefone ? ` · ${fmtTelefone(pet.clientes.telefone)}` : ""}</p>
            {pet?.clientes?.email && <p>{pet.clientes.email}</p>}
            {pet?.clientes?.endereco && <p>{pet.clientes.endereco}</p>}
          </div>
        )}
        <div className="g-pa-caixa">
          <h3>{compacta ? "Tutor e quem pode buscar" : "Quem pode buscar"}</h3>
          <ul>
            <li>{pet?.clientes?.nome ? `${pet.clientes.nome} (tutor)` : "O tutor"}{compacta && pet?.clientes?.telefone ? ` · ${fmtTelefone(pet.clientes.telefone)}` : ""}</li>
            {busca.map((c) => <li key={c.id}>{nomeComRelacao(c)}{c.telefone ? ` · ${fmtTelefone(c.telefone)}` : ""}{c.obs ? ` · ${c.obs}` : ""}</li>)}
          </ul>
          {vets.map((v) => <p key={v.id}><b>Veterinário:</b> {v.nome}{v.telefone ? ` · ${fmtTelefone(v.telefone)}` : ""}{v.obs ? ` · ${v.obs}` : ""}</p>)}
        </div>
        <div className="g-pa-caixa larga">
          <h3>Vacinas</h3>
          {vacs.length ? (
            <ul>{vacs.map((v) => {
              const vencida = v.vence_em != null && v.vence_em < hoje;
              return <li key={v.nome}><b>{v.nome}</b>{v.aplicado_em ? ` · aplicada em ${dataCurta(deIsoDia(v.aplicado_em))}/${v.aplicado_em.slice(0, 4)}` : ""}{v.vence_em ? <> · {vencida ? <b>VENCIDA em {dataCurta(deIsoDia(v.vence_em))}/{v.vence_em.slice(0, 4)}</b> : `vale até ${dataCurta(deIsoDia(v.vence_em))}/${v.vence_em.slice(0, 4)}`}</> : ""}</li>;
            })}</ul>
          ) : <p className="vazio">Nenhuma vacina anotada na ficha do pet.</p>}
        </div>
        {!compacta && (
          <div className="g-pa-caixa larga g-pa-anota">
            <h3>Anotações da equipe</h3>
            {Array.from({ length: 6 }, (_, i) => <i key={i} />)}
          </div>
        )}
      </div>
    </section>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><FichaNoPapel /></Suspense>;
}
