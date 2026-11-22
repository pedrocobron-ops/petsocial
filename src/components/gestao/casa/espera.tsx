"use client";

import { horarioDaCreche } from "@/lib/gestao/horario-loja";
import { useState } from "react";
import { BellRing, CalendarPlus, Check, Hourglass, MessageCircle, Plus, X } from "lucide-react";
import { diasDaEspera, esperaDe, esperaVale, mensagemDeVaga, periodoDaEspera, type Espera } from "@/lib/gestao/casa-opcoes";
import { ocupadasNoDia, vagasDoTipo, type Mens } from "@/lib/gestao/hotel";
import { usaModulo } from "@/lib/gestao/modulos";
import { dataCurta, deIsoDia, fmtTelefone, isoDia, linkWhatsApp, soDigitos, somaDias } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvatarPet, Campo, EscolherPet, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import FormPet from "../form-pet";
import type { EstadiaCompleta, PetDaEstadia, Tipo } from "../hotel/tipos";
import "./casa.css";

/**
 * Lista de espera por dia (opção "casa.espera"): em dia cheio, o pet fica na lista; quando abre vaga em todos os dias que ele
 * pediu (cancelaram uma reserva, um mensalista avisou que falta), a tela mostra quem estava esperando, com a mensagem pronta.
 * A conta de vagas é a mesma do aviso de casa cheia (`ocupadasNoDia`). Estar na lista não reserva nem ocupa vaga.
 */
export type EsperaComPet = Espera & { pets: PetDaEstadia | null };
/**
 * `posicao`: lugar na fila (1 = chegou primeiro na lista), contado dentro do tipo. `vez`: abriu vaga, mas a vaga já é de quem
 * chegou antes (o nome dele), então esta linha espera a vez.
 */
export type LinhaDaEspera = { e: EsperaComPet; temVaga: boolean; cheioEm: string | null; posicao: number; vez: string | null; /** tem vaga, mas o pet entrou na lista com os dias ainda livres: não "abriu" vaga (não vira aviso) */ semFila?: boolean };

/**
 * O pet entrou na lista com os dias ainda livres? (`cheio_ao_entrar` = false; migração 20261221). Esse não "abriu vaga": a
 * vaga já existia, então não vira aviso de "Abriu vaga" (antes o aviso aparecia na hora, num dia que nem estava cheio).
 * Pedido antigo (sem a anotação) e pedido do link (só entra com o dia cheio) seguem como antes.
 */
export const entrouComVaga = (e: Pick<Espera, "origem"> & { cheio_ao_entrar?: boolean | null }) => e.origem !== "link" && e.cheio_ao_entrar === false;

/** Todos os dias do pedido têm vaga agora? (a mesma conta da lista e do aviso de casa cheia) */
export function temVagaNosDias(petshop: Parameters<typeof vagasDoTipo>[0] & { horario?: unknown }, tipo: Tipo, entrada: string, saida: string, abertas: EstadiaCompleta[], mens: Mens | null): boolean {
  const vagas = vagasDoTipo(petshop, tipo);
  if (vagas == null) return true;
  const hoje = isoDia(new Date()), agora = new Date();
  return diasDaEspera({ tipo, entrada, saida }, hoje).every((d) => vagas - ocupadasNoDia(tipo, abertas, null, d, agora, mens, horarioDaCreche(petshop)) > 0);
}
export type ListaEspera = { ligada: boolean; linhas: LinhaDaEspera[]; comVaga: LinhaDaEspera[]; recarregar: () => Promise<void> };

/** A lista de espera que ainda vale (de hoje em diante), na ordem de chegada, com a conta de quem já tem vaga. */
export function useListaDeEspera(abertas: EstadiaCompleta[], mens: Mens | null): ListaEspera {
  const { sb, petshop } = useGestao();
  const ligada = esperaDe(petshop).ativo;
  const hoje = isoDia(new Date());
  const { dados, recarregar } = useDados(async () => {
    if (!ligada) return [];
    // a ordem é a de chegada na lista: quem entrou primeiro é avisado primeiro
    const r = await sb.from("lista_espera").select("*, pets(id, nome, foto, especie, sexo, alertas, porte, clientes(id, nome, telefone))").eq("petshop_id", petshop.id)
      .in("status", ["esperando", "chamado"]).gte("saida", hoje).order("criado_em").order("id").limit(500);
    return ok(r) as unknown as EsperaComPet[];
  }, [petshop.id, ligada, hoje]);
  const agora = new Date();
  // As vagas livres de cada dia vão para a fila na ordem de chegada: cada pedido que cabe em todos os dias dele fica com
  // uma vaga em cada dia, e o próximo só vê o que sobrou. Uma vaga aberta é oferecida a um pet, não a todos.
  const usadas = new Map<string, number>();
  const dono = new Map<string, string>();
  const posicoes = new Map<string, number>();
  const linhas = (dados ?? []).filter((e) => esperaVale(e, hoje)).map((e): LinhaDaEspera => {
    const posicao = (posicoes.get(e.tipo) ?? 0) + 1;
    posicoes.set(e.tipo, posicao);
    const vagas = vagasDoTipo(petshop, e.tipo);
    if (vagas == null) return { e, temVaga: true, cheioEm: null, posicao, vez: null };
    const dias = diasDaEspera(e, hoje);
    const livres = (d: string) => vagas - ocupadasNoDia(e.tipo, abertas, null, d, agora, mens, horarioDaCreche(petshop)) - (usadas.get(`${e.tipo}:${d}`) ?? 0);
    const cheioEm = dias.find((d) => livres(d) <= 0) ?? null;
    if (cheioEm == null) {
      // entrou na lista com vaga: não ocupa a vaga de quem estava esperando um dia cheio, nem vira aviso
      if (entrouComVaga(e)) return { e, temVaga: true, cheioEm: null, posicao, vez: null, semFila: true };
      for (const d of dias) { usadas.set(`${e.tipo}:${d}`, (usadas.get(`${e.tipo}:${d}`) ?? 0) + 1); if (!dono.has(`${e.tipo}:${d}`)) dono.set(`${e.tipo}:${d}`, nomeDoPet(e)); }
      return { e, temVaga: true, cheioEm: null, posicao, vez: null };
    }
    // o dia está cheio só porque a vaga que abriu já foi oferecida a quem chegou antes
    const vez = (usadas.get(`${e.tipo}:${cheioEm}`) ?? 0) > 0 && livres(cheioEm) + (usadas.get(`${e.tipo}:${cheioEm}`) ?? 0) > 0 ? dono.get(`${e.tipo}:${cheioEm}`) ?? null : null;
    return { e, temVaga: false, cheioEm, posicao, vez };
  });
  return { ligada, linhas, comVaga: linhas.filter((l) => l.temVaga && !l.semFila), recarregar: async () => { await recarregar(); } };
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
      <span><b>{n === 1 ? "Abriu vaga para 1 pet da lista de espera" : `Abriu vaga para ${n} pets da lista de espera`}:</b> {espera.comVaga.slice(0, 3).map((l) => `${nomeDoPet(l.e)} (${periodoDaEspera(l.e)})`).join(", ")}{n > 3 ? ` e mais ${n - 3}` : ""}. Toque para avisar{n > 1 ? ", na ordem da lista" : ""}.</span>
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
  const linha = ({ e, temVaga, cheioEm, posicao, vez, semFila }: LinhaDaEspera) => {
    const zap = temVaga ? linkWhatsApp(foneDe(e), mensagemDeVaga({ tutor: tutorDe(e), petshop: petshop.nome, pet: nomeDoPet(e), tipo: e.tipo, entrada: e.entrada, saida: e.saida })) : null;
    return (
      <div key={e.id} className={`g-cs-espera${temVaga ? " vaga" : ""}`}>
        <AvatarPet pet={e.pets ?? { nome: e.pet_nome, especie: e.especie }} />
        <div className="t">
          <b><span className="g-tag" title="Lugar na fila, pela ordem de chegada na lista">{posicao}º da fila</span> {nomeDoPet(e)}</b>
          <span>{[tutorDe(e) ?? "Sem tutor", foneDe(e) ? fmtTelefone(foneDe(e)) : null].filter(Boolean).join(" · ")}</span>
          <span>{e.tipo === "hotel" ? "Hotel" : "Creche"} · {periodoDaEspera(e)}{` · na lista desde ${dataCurta(new Date(e.criado_em))}`}{e.origem === "link" ? ` · pediu pelo link${e.termos_aceitos_em ? " e aceitou as regras" : ""}` : ""}{e.obs ? ` · ${e.obs}` : ""}</span>
          <div className="selos">
            {temVaga && semFila ? <span className="g-tag verde"><Check size={12} aria-hidden />tem vaga nesses dias: dá para marcar a reserva</span>
              : temVaga ? <span className="g-tag verde"><Check size={12} aria-hidden />abriu vaga</span>
              : vez ? <span className="g-tag"><Hourglass size={12} aria-hidden />a vaga de {dataCurta(deIsoDia(cheioEm!))} é de {vez}, que chegou antes</span>
              : <span className="g-tag"><Hourglass size={12} aria-hidden />cheio em {dataCurta(deIsoDia(cheioEm!))}</span>}
            {e.status === "chamado" && e.chamado_em && <span className="g-tag azul">avisado {dataCurta(new Date(e.chamado_em))}</span>}
          </div>
        </div>
        <div className="a">
          {zap && <a className={`g-btn p ${e.status === "chamado" ? "sec" : "zap"}`} href={zap} target="_blank" rel="noopener noreferrer"
            onClick={() => { if (!somenteLeitura()) void mudar(e, { status: "chamado", chamado_em: new Date().toISOString() }); }}><MessageCircle />{e.status === "chamado" ? "Avisar de novo" : semFila ? "Avisar que tem vaga" : "Avisar que abriu vaga"}</a>}
          {temVaga && !zap && <span className="g-muted g-pp">Sem telefone para avisar.</span>}
          <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) aoReservar(e); }}><CalendarPlus />Marcar reserva</button>
          <button type="button" className="g-btn fantasma p" onClick={() => void tirar(e)} aria-label={`Tirar ${nomeDoPet(e)} da lista de espera`}><X />Tirar</button>
        </div>
      </div>
    );
  };
  return (
    <section className="g-card g-pilha p" id="lista-de-espera">
      <div className="g-card-t" style={{ marginBottom: 0 }}>
        <h3><Tile icone={Hourglass} tom="manteiga" tamanho="p" />Lista de espera</h3>
        <button type="button" className="g-btn sec p" onClick={() => { if (!somenteLeitura()) aoNova(); }}><Plus />Colocar na lista</button>
      </div>
      {!espera.linhas.length ? <p className="g-muted g-p">Ninguém esperando vaga. Quando um dia estiver cheio, coloque o pet aqui: se abrir lugar, ele aparece em destaque com a mensagem pronta.</p> : (
        <>
          {espera.comVaga.length > 0 && <p className="g-p"><b>{espera.comVaga.length === 1 ? "Abriu vaga para 1 pet." : `Abriu vaga para ${espera.comVaga.length} pets.`}</b> Cada vaga que abriu vai para quem chegou primeiro na lista. Avise o tutor e, se ele quiser, marque a reserva. Se ele não quiser, tire da lista: a vaga passa para o próximo.</p>}
          <div className="g-cs-esperas">{espera.linhas.map(linha)}</div>
          <p className="g-muted g-pp">Estar na lista não reserva nem ocupa vaga. Pedidos de dias que já passaram saem sozinhos.</p>
        </>
      )}
    </section>
  );
}

/** Folha para colocar um pet na lista de espera. Vem preenchida quando a pessoa tentou reservar um dia cheio. */
export function FolhaEspera({ inicial, aoFechar, aoGravar, temVaga }: {
  inicial?: { pet?: PetDaEstadia | null; tipo?: Tipo; entrada?: string; saida?: string; horaEntrada?: string; horaSaida?: string }; aoFechar: () => void; aoGravar: () => void;
  /** a conta de vagas da tela (sem ela, o pedido fica como antes: sem a anotação) */
  temVaga?: (tipo: Tipo, entrada: string, saida: string) => boolean;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const tipos = (["creche", "hotel"] as const).filter((t) => usaModulo(petshop, t));
  const hoje = isoDia(new Date());
  const [pet, setPet] = useState<PetDaEstadia | null>(inicial?.pet ?? null);
  const [criando, setCriando] = useState<string | null>(null);
  const somenteLeitura = useSomenteLeitura();
  const [tipo, setTipo] = useState<Tipo>(inicial?.tipo && tipos.includes(inicial.tipo) ? inicial.tipo : tipos[0] ?? "creche");
  const [entrada, setEntrada] = useState(inicial?.entrada ?? hoje);
  const [saida, setSaida] = useState(inicial?.saida ?? "");
  const [obs, setObs] = useState("");
  const [horaEntrada, setHoraEntrada] = useState(inicial?.horaEntrada ?? "");
  const [horaSaida, setHoraSaida] = useState(inicial?.horaSaida ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const hotel = tipo === "hotel";

  async function salvar() {
    if (!pet || salvando) return;
    if (!entrada || entrada < hoje) return setErro("Escolha o dia, de hoje em diante.");
    const fim = saida || (hotel ? isoDia(somaDias(deIsoDia(entrada), 1)) : entrada);
    if (fim < entrada || (hotel && fim === entrada)) return setErro(hotel ? "No hotel, a saída é pelo menos um dia depois da entrada." : "O último dia vem depois do primeiro.");
    if (fim > isoDia(somaDias(deIsoDia(entrada), 60))) return setErro("O período passa de 60 dias.");
    // os dias ainda têm vaga: fica anotado (não vira "Abriu vaga" depois) e a pessoa é avisada de que dá para reservar direto
    const livre = temVaga ? temVaga(tipo, entrada, fim) : null;
    setErro(null); setSalvando(true);
    try {
      ok(await sb.from("lista_espera").insert({
        ...(livre == null ? {} : { cheio_ao_entrar: !livre }),
        petshop_id: petshop.id, tipo, entrada, saida: fim, pet_id: pet.id, pet_nome: pet.nome, tutor_nome: pet.clientes?.nome ?? null,
        telefone: soDigitos(pet.clientes?.telefone) || null, especie: ["cao", "gato", "outro"].includes(pet.especie ?? "") ? pet.especie : null, obs: obs.trim() || null,
        ...(hotel && /^\d{2}:\d{2}$/.test(horaEntrada) ? { hora_entrada: horaEntrada } : {}), ...(hotel && /^\d{2}:\d{2}$/.test(horaSaida) ? { hora_saida: horaSaida } : {}),
      }).select("id"));
      avisar(`${pet.nome} está na lista de espera ${hotel ? "do hotel" : "da creche"}.${livre ? " Esses dias ainda têm vaga: dá para marcar a reserva direto." : ""}`);
      aoGravar();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  // quem liga pela primeira vez pode entrar na lista na hora: "Cadastrar pet novo" abre a ficha e volta para cá
  if (criando !== null) return <FormPet nomeInicial={criando} aoFechar={() => setCriando(null)} aoSalvar={(p) => { setPet(p as unknown as PetDaEstadia); setCriando(null); }} />;
  if (!pet) return <Folha titulo="Quem entra na lista de espera?" aoFechar={aoFechar}><EscolherPet aoEscolher={(p) => setPet(p as unknown as PetDaEstadia)} aoCriar={(nome) => { if (!somenteLeitura()) setCriando(nome); }} autoFocus /></Folha>;
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
        {hotel && (
          <div className="dupla">
            <Campo rotulo="Hora de chegada" dica="Opcional."><input type="time" className="g-input" value={horaEntrada} onChange={(e) => setHoraEntrada(e.target.value)} /></Campo>
            <Campo rotulo="Hora de buscar" dica="Opcional."><input type="time" className="g-input" value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} /></Campo>
          </div>
        )}
        <Campo rotulo="Observação" dica="Opcional."><input className="g-input" value={obs} maxLength={300} onChange={(e) => setObs(e.target.value)} /></Campo>
        <p className="g-muted g-pp">A lista não reserva a vaga. Se abrir lugar nesses dias, {pet.nome} aparece em destaque na Ocupação, com a mensagem pronta para o tutor.</p>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}

/**
 * Para a tela Hoje: quantos pets da lista de espera do hotel já têm vaga (mesma conta da Ocupação, na ordem de chegada).
 * Só o hotel: na creche a conta depende dos mensalistas, que a Ocupação carrega.
 */
export function useVagaNaEsperaDoHotel(ligado: boolean): { n: number; nomes: string[] } {
  const { sb, petshop } = useGestao();
  const { dados } = useDados(async () => {
    if (!ligado || !esperaDe(petshop).ativo || !usaModulo(petshop, "hotel")) return [];
    const r = await sb.from("estadias").select("id, pet_id, tipo, status, entrada, saida_prevista").eq("petshop_id", petshop.id).eq("tipo", "hotel").in("status", ["reservada", "em_casa"]).limit(1000);
    return (r.data ?? []) as unknown as EstadiaCompleta[];
  }, [petshop.id, ligado]);
  const espera = useListaDeEspera(dados ?? [], null);
  const comVaga = dados ? espera.comVaga.filter((l) => l.e.tipo === "hotel") : [];
  return { n: comVaga.length, nomes: comVaga.map((l) => nomeDoPet(l.e)) };
}
