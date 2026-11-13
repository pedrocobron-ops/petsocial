"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MessageCircle, ShieldAlert } from "lucide-react";
import { diarioDe, fraseDaOcorrencia, itensMarcados, mensagemDoDiario, ocorrenciasLigadas, tipoDaOcorrencia, type Diario as Registro, type Ocorrencia } from "@/lib/gestao/casa-opcoes";
import { usaModulo } from "@/lib/gestao/modulos";
import { dataLonga, hora, inicioDoDia, isoDia, linkWhatsApp } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, Esqueleto, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "../ui";
import { FolhaOcorrencia } from "./ocorrencias";
import "./casa.css";

/**
 * Diário do dia (opção "casa.diario"): cada pet que está ou esteve na casa hoje, com os itens que o dono escolheu para marcar
 * em um toque, um recado e a mensagem pronta para o WhatsApp do tutor. Nada de dinheiro nesta tela, e nada é mandado sozinho.
 * Cada toque já fica guardado, com o nome de quem marcou: outra pessoa da equipe abre e vê igual.
 */
type PetDoDiario = { id: string; nome: string; foto: string | null; especie: string | null; sexo: string | null; alertas: string | null; clientes: { id: string; nome: string; telefone: string | null } | null };
type EstadiaDoDiario = { id: string; pet_id: string; tipo: string; status: string; entrada: string; saida: string | null; pets: PetDoDiario | null };
const COLS = "id, pet_id, tipo, status, entrada, saida, pets(id, nome, foto, especie, sexo, alertas, clientes(id, nome, telefone))";
const FILTROS = [{ id: "todos", rotulo: "Todos" }, { id: "creche", rotulo: "Creche" }, { id: "hotel", rotulo: "Hotel" }] as const;

export default function Diario() {
  const { sb, petshop } = useGestao();
  const [tipo, setTipo] = useState<(typeof FILTROS)[number]["id"]>("todos");
  const [ocorrenciaDe, setOcorrenciaDe] = useState<EstadiaDoDiario | null>(null);
  const somenteLeitura = useSomenteLeitura();
  const hoje = isoDia(new Date());
  const opcoes = diarioDe(petshop);
  const comOcorrencias = ocorrenciasLigadas(petshop);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const comeco = inicioDoDia(new Date()).toISOString();
    const [naCasa, sairam, registros, ocorrencias] = await Promise.all([
      sb.from("estadias").select(COLS).eq("petshop_id", petshop.id).eq("status", "em_casa").order("entrada").limit(500),
      sb.from("estadias").select(COLS).eq("petshop_id", petshop.id).eq("status", "encerrada").gte("saida", comeco).order("saida").limit(500),
      sb.from("estadias_diario").select("*").eq("petshop_id", petshop.id).eq("dia", hoje).limit(1000),
      comOcorrencias ? sb.from("estadias_ocorrencias").select("*").eq("petshop_id", petshop.id).gte("quando", comeco).order("quando").limit(500) : Promise.resolve({ data: [] as Ocorrencia[], error: null }),
    ]);
    const estadias = [...(ok(naCasa) as unknown as EstadiaDoDiario[]), ...(ok(sairam) as unknown as EstadiaDoDiario[])].filter((e) => e.pets);
    return { estadias, registros: ok(registros), ocorrencias: (ocorrencias.data ?? []) as Ocorrencia[] };
  }, [petshop.id, hoje, comOcorrencias]);

  const lista = useMemo(() => (dados?.estadias ?? []).filter((e) => tipo === "todos" || e.tipo === tipo)
    .sort((a, b) => Number(a.status !== "em_casa") - Number(b.status !== "em_casa") || (a.pets?.nome ?? "").localeCompare(b.pets?.nome ?? "", "pt-BR")), [dados, tipo]);
  const enviados = (dados?.registros ?? []).filter((r) => r.enviado_em && lista.some((e) => e.id === r.estadia_id)).length;
  const doisTipos = usaModulo(petshop, "creche") && usaModulo(petshop, "hotel");

  return (
    <div className="g-pilha">
      <div className="g-cs-topo">
        <div>
          <p className="g-rotulo">Diário de hoje</p>
          <h2 className="g-cm-titulo">{dataLonga(new Date())}</h2>
        </div>
        {doisTipos && (
          <div className="g-chips" role="group" aria-label="Mostrar">
            {FILTROS.map((f) => <button key={f.id} type="button" className="g-chip" aria-pressed={tipo === f.id} onClick={() => setTipo(f.id)}>{f.rotulo}</button>)}
          </div>
        )}
      </div>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {carregando && !dados ? <Esqueleto linhas={4} /> : !dados ? null : !lista.length ? (
        <Vazio titulo="Nenhum pet na casa hoje" texto="Quando um pet fizer check-in ou chegar pela chamada, ele aparece aqui para você marcar como foi o dia dele." />
      ) : (
        <>
          <p className="g-muted g-p" role="status">
            {lista.length === 1 ? "1 pet" : `${lista.length} pets`} hoje · {enviados === 0 ? "nenhum diário enviado ainda" : enviados === lista.length ? "todos os diários enviados" : `${enviados} de ${lista.length} diários enviados`}.
            {" "}Toque no que o pet fez; depois, um toque abre o WhatsApp com a mensagem pronta.
          </p>
          <div className="g-cs-grade">
            {lista.map((e) => (
              <CartaoDiario key={e.id} estadia={e} dia={hoje} itens={opcoes.itens} registro={dados.registros.find((r) => r.estadia_id === e.id) ?? null}
                ocorrencias={dados.ocorrencias.filter((o) => o.estadia_id === e.id)} comOcorrencias={comOcorrencias}
                aoOcorrencia={() => { if (!somenteLeitura()) setOcorrenciaDe(e); }} aoMudar={() => void recarregar()} />
            ))}
          </div>
        </>
      )}
      {ocorrenciaDe && <FolhaOcorrencia estadia={ocorrenciaDe} aoFechar={() => setOcorrenciaDe(null)} aoGravar={() => { setOcorrenciaDe(null); void recarregar(); }} />}
    </div>
  );
}

function CartaoDiario({ estadia: e, dia, itens, registro, ocorrencias, comOcorrencias, aoOcorrencia, aoMudar }: {
  estadia: EstadiaDoDiario; dia: string; itens: string[]; registro: Registro | null; ocorrencias: Ocorrencia[]; comOcorrencias: boolean; aoOcorrencia: () => void; aoMudar: () => void;
}) {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const pet = e.pets!;
  const [marcados, setMarcados] = useState<string[]>(() => itensMarcados(registro));
  const [nota, setNota] = useState(registro?.nota ?? "");
  const [enviadoEm, setEnviadoEm] = useState<string | null>(registro?.enviado_em ?? null);
  const [verTexto, setVerTexto] = useState(false);
  const [meuTexto, setMeuTexto] = useState<string | null>(null);
  const [noDiario, setNoDiario] = useState<Record<string, boolean>>({});
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const mexi = useRef(false);

  // outra pessoa marcou em outro aparelho: a tela acompanha, a não ser que eu esteja mexendo agora
  useEffect(() => {
    if (mexi.current) return;
    setMarcados(itensMarcados(registro)); setNota(registro?.nota ?? ""); setEnviadoEm(registro?.enviado_em ?? null);
  }, [registro]);

  /** Guarda o estado do diário deste pet; um pedido de cada vez, para o último toque sempre ganhar. */
  function gravar(novo: { itens: string[]; nota: string; enviado_em?: string | null }) {
    mexi.current = true;
    fila.current = fila.current.then(async () => {
      const r = await sb.from("estadias_diario").upsert({ petshop_id: petshop.id, estadia_id: e.id, dia, itens: novo.itens as never, nota: novo.nota.trim() || null, ...(novo.enviado_em !== undefined ? { enviado_em: novo.enviado_em } : {}) }, { onConflict: "estadia_id,dia" }).select("id");
      if (r.error) avisarErro(r.error.message);
    }).finally(() => { mexi.current = false; });
    return fila.current;
  }
  function alternar(item: string) {
    if (somenteLeitura()) return;
    const novo = marcados.includes(item) ? marcados.filter((x) => x !== item) : [...marcados, item];
    setMarcados(novo); setMeuTexto(null);
    void gravar({ itens: novo, nota });
  }

  // os itens da lista de hoje, mais algum que foi marcado antes de o dono mudar a lista
  const todos = [...itens, ...marcados.filter((m) => !itens.includes(m))];
  const vaiNoDiario = (o: Ocorrencia) => noDiario[o.id] ?? o.no_diario;
  const texto = mensagemDoDiario({
    tutor: pet.clientes?.nome, petshop: petshop.nome, pet: pet.nome, dia, hoje: isoDia(new Date()),
    itens: todos.filter((i) => marcados.includes(i)), nota, ocorrencias: ocorrencias.filter(vaiNoDiario),
  });
  const final = meuTexto ?? texto;
  const zap = linkWhatsApp(pet.clientes?.telefone, final);
  const vazio = !marcados.length && !nota.trim() && !ocorrencias.some(vaiNoDiario);

  async function mudarNoDiario(o: Ocorrencia, v: boolean) {
    if (somenteLeitura()) return;
    setNoDiario((x) => ({ ...x, [o.id]: v })); setMeuTexto(null);
    const r = await sb.from("estadias_ocorrencias").update({ no_diario: v }).eq("id", o.id).eq("petshop_id", petshop.id).select("id");
    if (r.error) { avisarErro(r.error.message); setNoDiario((x) => ({ ...x, [o.id]: !v })); }
  }

  return (
    <article className={`g-cs-cartao${enviadoEm ? " enviado" : ""}`}>
      <header>
        <AvatarPet pet={pet} tamanho="g" />
        <div className="t">
          <h3>{pet.nome}</h3>
          <span>{pet.clientes?.nome ?? "Sem tutor"} · {e.tipo === "hotel" ? "hotel" : "creche"}{e.status !== "em_casa" && e.saida ? ` · saiu às ${hora(e.saida)}` : ""}</span>
        </div>
        {enviadoEm && <span className="g-tag verde"><Check size={12} aria-hidden />enviado às {hora(enviadoEm)}</span>}
      </header>

      <div className="g-cs-itens" role="group" aria-label={`O que ${pet.nome} fez hoje`}>
        {todos.map((item) => (
          <button key={item} type="button" className="g-cs-item" aria-pressed={marcados.includes(item)} onClick={() => alternar(item)}>
            <i aria-hidden>{marcados.includes(item) && <Check />}</i>{item}
          </button>
        ))}
      </div>

      <label className="g-campo">
        <span>Recado para o tutor <small>(opcional)</small></span>
        <textarea className="g-textarea" rows={2} maxLength={600} value={nota} placeholder="Ex.: fez amizade com a Mel e dormiu a tarde toda."
          onChange={(ev) => { mexi.current = true; setNota(ev.target.value); setMeuTexto(null); }} onBlur={() => { if (!somenteLeitura() && (nota.trim() || registro?.nota)) void gravar({ itens: marcados, nota }); else mexi.current = false; }} />
      </label>

      {ocorrencias.length > 0 && (
        <ul className="g-cs-ocs">
          {ocorrencias.map((o) => (
            <li key={o.id}>
              <ShieldAlert aria-hidden />
              <span><b>{tipoDaOcorrencia(o.tipo).rotulo}</b>, {fraseDaOcorrencia({ ...o, tipo: "outro" }) /* a hora e o texto, sem repetir o tipo */}
                <label className="g-check g-cs-conta"><input type="checkbox" checked={vaiNoDiario(o)} onChange={(ev) => void mudarNoDiario(o, ev.target.checked)} /><span>contar ao tutor no diário</span></label>
              </span>
            </li>
          ))}
        </ul>
      )}

      {verTexto && (
        <textarea className="g-textarea g-cs-previa" rows={7} maxLength={1500} value={final} aria-label={`Mensagem do diário de ${pet.nome}`} onChange={(ev) => setMeuTexto(ev.target.value)} />
      )}

      <footer>
        {zap ? (
          <a className={`g-btn ${enviadoEm ? "sec" : "zap"}`} href={vazio ? undefined : zap} target="_blank" rel="noopener noreferrer" aria-disabled={vazio}
            onClick={(ev) => {
              if (vazio || somenteLeitura()) { ev.preventDefault(); return; }
              const agora = new Date().toISOString(); setEnviadoEm(agora);
              void gravar({ itens: marcados, nota, enviado_em: agora }).then(aoMudar);
            }}><MessageCircle />{enviadoEm ? "Mandar de novo" : "Mandar o diário"}</a>
        ) : <span className="g-muted g-pp">Sem telefone na ficha do tutor.</span>}
        <button type="button" className="g-btn fantasma p" onClick={() => setVerTexto((v) => !v)}>{verTexto ? "Esconder a mensagem" : "Ver a mensagem"}</button>
        {comOcorrencias && e.status === "em_casa" && <button type="button" className="g-btn fantasma p" onClick={aoOcorrencia}><ShieldAlert />Ocorrência</button>}
      </footer>
      {zap && vazio && <p className="g-muted g-pp">Marque pelo menos um item ou escreva um recado para mandar.</p>}
    </article>
  );
}
