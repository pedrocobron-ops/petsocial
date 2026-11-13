"use client";

import { useState } from "react";
import { BellRing, CalendarPlus, Check, Hourglass, MessageCircle, Plus, X } from "lucide-react";
import { diasDaEspera, esperaDe, esperaVale, mensagemDeVaga, periodoDaEspera, type Espera } from "@/lib/gestao/casa-opcoes";
import { ocupadasNoDia, vagasDoTipo, type Mens } from "@/lib/gestao/hotel";
import { usaModulo } from "@/lib/gestao/modulos";
import { dataCurta, deIsoDia, fmtTelefone, isoDia, linkWhatsApp, soDigitos, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvatarPet, Campo, EscolherPet, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import type { EstadiaCompleta, PetDaEstadia, Tipo } from "../hotel/tipos";
import "./casa.css";

/**
 * Lista de espera por dia (opção "casa.espera"): em dia cheio, o pet fica na lista; quando abre vaga em todos os dias que ele
 * pediu (cancelaram uma reserva, um mensalista avisou que falta), a tela mostra quem estava esperando, com a mensagem pronta.
 * A conta de vagas é a mesma do aviso de casa cheia (`ocupadasNoDia`). Estar na lista não reserva nem ocupa vaga.
 */
export type EsperaComPet = Espera & { pets: PetDaEstadia | null };
export type LinhaDaEspera = { e: EsperaComPet; temVaga: boolean; cheioEm: string | null };
export type ListaEspera = { ligada: boolean; linhas: LinhaDaEspera[]; comVaga: LinhaDaEspera[]; recarregar: () => Promise<void> };

/** A lista de espera que ainda vale (de hoje em diante), na ordem de chegada, com a conta de quem já tem vaga. */
export function useListaDeEspera(abertas: EstadiaCompleta[], mens: Mens | null): ListaEspera {
  const { sb, petshop } = useGestao();
  const ligada = esperaDe(petshop).ativo;
  const hoje = isoDia(new Date());
  const { dados, recarregar } = useDados(async () => {
    if (!ligada) return [];
    const r = await sb.from("lista_espera").select("*, pets(id, nome, foto, especie, sexo, alertas, porte, clientes(id, nome, telefone))").eq("petshop_id", petshop.id)
      .in("status", ["esperando", "chamado"]).gte("saida", hoje).order("entrada").order("criado_em").order("id").limit(500);
    return ok(r) as unknown as EsperaComPet[];
  }, [petshop.id, ligada, hoje]);
  const agora = new Date();
  const linhas = (dados ?? []).filter((e) => esperaVale(e, hoje)).map((e): LinhaDaEspera => {
    const vagas = vagasDoTipo(petshop, e.tipo);
    const cheioEm = vagas == null ? null : diasDaEspera(e, hoje).find((d) => ocupadasNoDia(e.tipo, abertas, null, d, agora, mens, petshop.horario) >= vagas) ?? null;
    return { e, temVaga: cheioEm == null, cheioEm };
  });
  // quem está há mais tempo na fila do mesmo dia vem primeiro (a ordem da consulta já é a de chegada)
  return { ligada, linhas, comVaga: linhas.filter((l) => l.temVaga), recarregar: async () => { await recarregar(); } };
}

const nomeDoPet = (e: EsperaComPet) => e.pets?.nome ?? e.pet_nome;
const tutorDe = (e: EsperaComPet) => e.pets?.clientes?.nome ?? e.tutor_nome;
const foneDe = (e: EsperaComPet) => e.pets?.clientes?.telefone ?? e.telefone;

/** Faixa curta para a Casa agora e a Chamada: abriu vaga para alguém da lista. */
export function AvisoDeVaga({ espera, aoVer }: { espera: ListaEspera; aoVer: () => void }) {
  if (!espera.ligada || !espera.comVaga.length) return null;
  const n = espera.comVaga.length;
  return (
    <button type="button" className="g-cs-vaga" onClick={aoVer}>
      <BellRing aria-hidden />
      <span><b>{n === 1 ? "Abriu vaga para 1 pet da lista de espera" : `Abriu vaga para ${n} pets da lista de espera`}:</b> {espera.comVaga.slice(0, 3).map((l) => `${nomeDoPet(l.e)} (${periodoDaEspera(l.e)})`).join(", ")}{n > 3 ? ` e mais ${n - 3}` : ""}. Toque para avisar.</span>
    </button>
  );
}

/** O cartão da lista de espera (na parte Ocupação): quem espera, quem já tem vaga, e os botões de cada um. */
export function ListaDeEspera({ espera, aoReservar, aoNova }: { espera: ListaEspera; aoReservar: (e: EsperaComPet) => void; aoNova: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  if (!espera.ligada) return null;

  async function mudar(e: EsperaComPet, m: Partial<Pick<Espera, "status" | "chamado_em">>, recado?: string) {
    try {
      ok(await sb.from("lista_espera").update(m).eq("id", e.id).eq("petshop_id", petshop.id).select("id"));
      if (recado) avisar(recado);
      await espera.recarregar();
    } catch (x) { avisarErro(x); }
  }
  async function tirar(e: EsperaComPet) {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: `Tirar ${nomeDoPet(e)} da lista de espera?`, texto: `${e.tipo === "hotel" ? "Hotel" : "Creche"}, ${periodoDaEspera(e)}.`, confirmar: "Tirar da lista", perigo: true }))) return;
    await mudar(e, { status: "desistiu" }, `${nomeDoPet(e)} saiu da lista de espera.`);
  }
  const linha = ({ e, temVaga, cheioEm }: LinhaDaEspera) => {
    const zap = temVaga ? linkWhatsApp(foneDe(e), mensagemDeVaga({ tutor: tutorDe(e), petshop: petshop.nome, pet: nomeDoPet(e), tipo: e.tipo, entrada: e.entrada, saida: e.saida })) : null;
    return (
      <div key={e.id} className={`g-cs-espera${temVaga ? " vaga" : ""}`}>
        <AvatarPet pet={e.pets ?? { nome: e.pet_nome, especie: e.especie }} />
        <div className="t">
          <b>{nomeDoPet(e)}</b>
          <span>{[tutorDe(e) ?? "Sem tutor", foneDe(e) ? fmtTelefone(foneDe(e)) : null].filter(Boolean).join(" · ")}</span>
          <span>{e.tipo === "hotel" ? "Hotel" : "Creche"} · {periodoDaEspera(e)}{e.origem === "link" ? " · pediu pelo link" : ""}{e.obs ? ` · ${e.obs}` : ""}</span>
          <div className="selos">
            {temVaga ? <span className="g-tag verde"><Check size={12} aria-hidden />abriu vaga</span> : <span className="g-tag"><Hourglass size={12} aria-hidden />cheio em {dataCurta(deIsoDia(cheioEm!))}</span>}
            {e.status === "chamado" && e.chamado_em && <span className="g-tag azul">avisado {dataCurta(new Date(e.chamado_em))}</span>}
          </div>
        </div>
        <div className="a">
          {zap && <a className={`g-btn p ${e.status === "chamado" ? "sec" : "zap"}`} href={zap} target="_blank" rel="noopener noreferrer"
            onClick={() => { if (!somenteLeitura()) void mudar(e, { status: "chamado", chamado_em: new Date().toISOString() }); }}><MessageCircle />{e.status === "chamado" ? "Avisar de novo" : "Avisar que abriu vaga"}</a>}
          {temVaga && !zap && <span className="g-muted g-pp">Sem telefone para avisar.</span>}
          <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) aoReservar(e); }}><CalendarPlus />Marcar reserva</button>
          <button type="button" className="g-btn fantasma p" onClick={() => void tirar(e)} aria-label={`Tirar ${nomeDoPet(e)} da lista de espera`}><X />Tirar</button>
        </div>
      </div>
    );
  };
  const esperando = espera.linhas.filter((l) => !l.temVaga);
  return (
    <section className="g-card g-pilha p" id="lista-de-espera">
      <div className="g-card-t" style={{ marginBottom: 0 }}>
        <h3><Tile icone={Hourglass} tom="manteiga" tamanho="p" />Lista de espera</h3>
        <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) aoNova(); }}><Plus />Colocar na lista</button>
      </div>
      {!espera.linhas.length ? <p className="g-muted g-p">Ninguém esperando vaga. Quando um dia estiver cheio, coloque o pet aqui: se abrir lugar, ele aparece em destaque com a mensagem pronta.</p> : (
        <>
          {espera.comVaga.length > 0 && <p className="g-p"><b>{espera.comVaga.length === 1 ? "Abriu vaga para 1 pet." : `Abriu vaga para ${espera.comVaga.length} pets.`}</b> Avise o tutor e, se ele quiser, marque a reserva. A ordem é a de chegada na lista.</p>}
          <div className="g-cs-esperas">{espera.comVaga.map(linha)}{esperando.map(linha)}</div>
          <p className="g-muted g-pp">Estar na lista não reserva nem ocupa vaga. Pedidos de dias que já passaram saem sozinhos.</p>
        </>
      )}
    </section>
  );
}

/** Folha para colocar um pet na lista de espera. Vem preenchida quando a pessoa tentou reservar um dia cheio. */
export function FolhaEspera({ inicial, aoFechar, aoGravar }: {
  inicial?: { pet?: PetDaEstadia | null; tipo?: Tipo; entrada?: string; saida?: string }; aoFechar: () => void; aoGravar: () => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const tipos = (["creche", "hotel"] as const).filter((t) => usaModulo(petshop, t));
  const hoje = isoDia(new Date());
  const [pet, setPet] = useState<PetDaEstadia | null>(inicial?.pet ?? null);
  const [tipo, setTipo] = useState<Tipo>(inicial?.tipo && tipos.includes(inicial.tipo) ? inicial.tipo : tipos[0] ?? "creche");
  const [entrada, setEntrada] = useState(inicial?.entrada ?? hoje);
  const [saida, setSaida] = useState(inicial?.saida ?? "");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const hotel = tipo === "hotel";

  async function salvar() {
    if (!pet || salvando) return;
    if (!entrada || entrada < hoje) return setErro("Escolha o dia, de hoje em diante.");
    const fim = saida || (hotel ? isoDia(somaDias(deIsoDia(entrada), 1)) : entrada);
    if (fim < entrada || (hotel && fim === entrada)) return setErro(hotel ? "No hotel, a saída é pelo menos um dia depois da entrada." : "O último dia vem depois do primeiro.");
    if (fim > isoDia(somaDias(deIsoDia(entrada), 60))) return setErro("O período passa de 60 dias.");
    setErro(null); setSalvando(true);
    try {
      ok(await sb.from("lista_espera").insert({
        petshop_id: petshop.id, tipo, entrada, saida: fim, pet_id: pet.id, pet_nome: pet.nome, tutor_nome: pet.clientes?.nome ?? null,
        telefone: soDigitos(pet.clientes?.telefone) || null, especie: ["cao", "gato", "outro"].includes(pet.especie ?? "") ? pet.especie : null, obs: obs.trim() || null,
      }).select("id"));
      avisar(`${pet.nome} está na lista de espera ${hotel ? "do hotel" : "da creche"}.`);
      aoGravar();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  if (!pet) return <Folha titulo="Quem entra na lista de espera?" aoFechar={aoFechar}><EscolherPet aoEscolher={(p) => setPet(p as unknown as PetDaEstadia)} autoFocus /></Folha>;
  return (
    <Folha titulo="Lista de espera" aoFechar={aoFechar}
      rodape={<><button className="g-btn sec" onClick={aoFechar}>Voltar</button><button className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Colocar na lista"}</button></>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={pet} />
          <div className="g-cresce"><b style={{ display: "block" }}>{pet.nome}</b><span className="g-muted g-p">{pet.clientes?.nome ?? "Sem tutor"}</span></div>
          <button type="button" className="g-btn fantasma p" onClick={() => setPet(null)}>Trocar</button>
        </div>
        {tipos.length > 1 && (
          <div className="g-campo"><span>Tipo</span>
            <div className="g-chips" role="group" aria-label="Tipo">{tipos.map((t) => <button key={t} type="button" className="g-chip" aria-pressed={tipo === t} onClick={() => setTipo(t)}>{t === "hotel" ? "Hotel" : "Creche"}</button>)}</div>
          </div>
        )}
        <div className="dupla">
          <Campo rotulo={hotel ? "Entrada" : "Dia"}><input type="date" className="g-input" value={entrada} min={hoje} onChange={(e) => { setEntrada(e.target.value); setErro(null); }} /></Campo>
          <Campo rotulo={hotel ? "Saída" : "Até o dia"} dica={hotel ? undefined : "Em branco, é um dia só."}><input type="date" className="g-input" value={saida} min={entrada} onChange={(e) => { setSaida(e.target.value); setErro(null); }} /></Campo>
        </div>
        <Campo rotulo="Observação" dica="Opcional."><input className="g-input" value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} /></Campo>
        <p className="g-muted g-pp">A lista não reserva a vaga. Se abrir lugar nesses dias, {pet.nome} aparece em destaque na Ocupação, com a mensagem pronta para o tutor.</p>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}
