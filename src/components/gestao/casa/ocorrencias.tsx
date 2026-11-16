"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldAlert, Trash2 } from "lucide-react";
import { diarioDe, ocorrenciasLigadas, portariaLigada, tipoDaOcorrencia, TIPOS_DE_OCORRENCIA, type Ocorrencia, type TipoDeOcorrencia } from "@/lib/gestao/casa-opcoes";
import { usaCasa } from "@/lib/gestao/modulos";
import { dataAmigavel, hora, inicioDoDia, isoDia, juntaDiaHora } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { AvatarPet, avisarMudanca, Campo, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { lerContatos, VeterinarioDoPet } from "./portaria";
import "./casa.css";

/**
 * Ocorrências da estadia (opção "casa.ocorrencias"): briga, machucado, fuga, vômito. Um registro curto, com a hora e o nome
 * de quem escreveu. O dono vê no Hoje e na ficha do pet; a equipe decide, uma a uma, se entra na mensagem do diário.
 */
type PetDaOcorrencia = { id: string; nome: string; foto?: string | null; especie?: string | null; clientes?: { id: string; nome: string; telefone?: string | null } | null };
const primeiroNome = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] ?? "";
const quandoFoi = (iso: string) => `${isoDia(new Date(iso)) === isoDia(new Date()) ? "hoje" : dataAmigavel(new Date(iso))}, ${hora(iso)}`;

/** Folha para anotar uma ocorrência na estadia de um pet que está na casa. */
export function FolhaOcorrencia({ estadia, aoFechar, aoGravar }: { estadia: { id: string; pets: PetDaOcorrencia | null }; aoFechar: () => void; aoGravar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const pet = estadia.pets;
  const agora = new Date();
  const [tipo, setTipo] = useState<TipoDeOcorrencia | null>(null);
  const [texto, setTexto] = useState("");
  const [hhmm, setHhmm] = useState(`${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`);
  const [noDiario, setNoDiario] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const comDiario = diarioDe(petshop).ativo;
  // na hora do aperto, o telefone do veterinário já aparece aqui
  const { dados: contatos } = useDados(async () => (pet && portariaLigada(petshop) ? lerContatos(sb, petshop.id, pet).catch(() => []) : []), [petshop.id, pet?.id]);

  async function salvar() {
    if (salvando) return;
    if (!tipo) return setErro("Toque no que aconteceu.");
    if (tipo === "outro" && texto.trim().length < 3) return setErro("Conte em poucas palavras o que aconteceu.");
    if (!/^\d{2}:\d{2}$/.test(hhmm)) return setErro("Confira a hora.");
    const quando = juntaDiaHora(isoDia(new Date()), hhmm);
    if (quando.getTime() > Date.now() + 5 * 60000) return setErro("A hora está no futuro. Confira.");
    setErro(null); setSalvando(true);
    try {
      // pet_id e petshop_id são conferidos no banco pela estadia
      ok(await sb.from("estadias_ocorrencias").insert({ petshop_id: petshop.id, estadia_id: estadia.id, pet_id: pet?.id ?? estadia.id, tipo, texto: texto.trim(), quando: quando.toISOString(), no_diario: comDiario && noDiario }).select("id"));
      avisar(`Ocorrência de ${pet?.nome ?? "pet"} anotada.`);
      avisarMudanca();
      aoGravar();
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha titulo={`Ocorrência com ${pet?.nome ?? "o pet"}`} aoFechar={aoFechar}
      rodape={<><button className="g-btn sec" onClick={aoFechar}>Voltar</button><button className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Anotar"}</button></>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={pet ?? { nome: "?" }} />
          <div className="g-cresce"><b style={{ display: "block" }}>{pet?.nome ?? "Pet"}</b><span className="g-muted g-p">{pet?.clientes?.nome ?? "Sem tutor"}</span></div>
        </div>
        {contatos && <VeterinarioDoPet contatos={contatos} />}
        <div className="g-campo">
          <span>O que aconteceu</span>
          <div className="g-chips g-cs-chips" role="group" aria-label="O que aconteceu">
            {TIPOS_DE_OCORRENCIA.map((t) => <button key={t.id} type="button" className="g-chip" aria-pressed={tipo === t.id} onClick={() => { setTipo(t.id); setErro(null); }}>{t.rotulo}</button>)}
          </div>
        </div>
        <Campo rotulo="Conte em poucas palavras" dica={tipo && tipo !== "outro" ? "Opcional: com quem, onde, o que foi feito." : undefined}>
          <textarea className="g-textarea" rows={3} value={texto} maxLength={500} placeholder="Ex.: disputa por brinquedo com o Thor, sem ferimento. Separados na hora." onChange={(e) => { setTexto(e.target.value); setErro(null); }} />
        </Campo>
        <Campo rotulo="A que horas (hoje)"><input type="time" className="g-input" style={{ maxWidth: 160 }} value={hhmm} onChange={(e) => setHhmm(e.target.value)} /></Campo>
        {comDiario && <label className="g-check"><input type="checkbox" checked={noDiario} onChange={(e) => setNoDiario(e.target.checked)} /><span>Contar ao tutor na mensagem do diário de hoje</span></label>}
        <p className="g-muted g-pp">Fica guardado com o seu nome e a hora. O dono vê no Hoje e na ficha do pet.</p>
        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}

/** As ocorrências no cartão do hóspede: uma linha curta por ocorrência. */
export function OcorrenciasDoCartao({ lista }: { lista: Ocorrencia[] }) {
  if (!lista.length) return null;
  return (
    <ul className="g-cs-ocs">
      {lista.map((o) => (
        <li key={o.id}><ShieldAlert aria-hidden /><span><b>{tipoDaOcorrencia(o.tipo).rotulo}</b>, {quandoFoi(o.quando)}{o.texto ? `: ${o.texto}` : ""}{o.criado_nome ? <small> · anotou {primeiroNome(o.criado_nome)}</small> : null}</span></li>
      ))}
    </ul>
  );
}

type OcorrenciaComPet = Ocorrencia & { pets: Pick<PetDaOcorrencia, "id" | "nome" | "foto" | "especie"> | null };

/** No Hoje do dono: o que a equipe anotou hoje na creche e no hotel. Sem ocorrência, não aparece nada. */
export function OcorrenciasDeHoje() {
  const { sb, petshop, souDono } = useGestao();
  const ligado = souDono && usaCasa(petshop) && ocorrenciasLigadas(petshop);
  const { dados } = useDados(async () => {
    if (!ligado) return [];
    const r = await sb.from("estadias_ocorrencias").select("*, pets(id, nome, foto, especie)").eq("petshop_id", petshop.id).gte("quando", inicioDoDia(new Date()).toISOString()).order("quando", { ascending: false }).limit(50);
    return (r.data ?? []) as unknown as OcorrenciaComPet[];
  }, [petshop.id, ligado]);
  if (!ligado || !dados?.length) return null;
  return (
    <section className="g-card g-pilha p">
      <div className="g-card-t" style={{ marginBottom: 0 }}>
        <h3><Tile icone={ShieldAlert} tom="rosa" tamanho="p" />{dados.length === 1 ? "1 ocorrência hoje" : `${dados.length} ocorrências hoje`}</h3>
        <Link className="g-btn fantasma p" href="/gestao/app/creche-hotel?ver=casa">Ver a casa</Link>
      </div>
      <div className="g-lista">
        {dados.map((o) => (
          <Link key={o.id} className="g-linha g-cs-oc-linha" href={`/gestao/app/clientes?pet=${o.pet_id}`}>
            <AvatarPet pet={o.pets ?? { nome: "?" }} />
            <span className="t">
              <b>{o.pets?.nome ?? "Pet"}: {tipoDaOcorrencia(o.tipo).rotulo.toLowerCase()}, às {hora(o.quando)}</b>
              <span>{[o.texto, o.criado_nome ? `anotou ${primeiroNome(o.criado_nome)}` : null, o.no_diario ? "vai no diário" : null].filter(Boolean).join(" · ") || "sem detalhe"}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Na ficha do pet: o histórico de ocorrências dele. O dono pode apagar uma anotada por engano. */
export function OcorrenciasDoPet({ petId }: { petId: string }) {
  const { sb, petshop, souDono } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const ligado = usaCasa(petshop) && ocorrenciasLigadas(petshop);
  const { dados, recarregar } = useDados(async () => {
    if (!ligado) return [];
    const r = await sb.from("estadias_ocorrencias").select("*").eq("petshop_id", petshop.id).eq("pet_id", petId).order("quando", { ascending: false }).limit(30);
    return r.data ?? [];
  }, [petshop.id, petId, ligado]);
  if (!ligado || !dados?.length) return null;

  async function apagar(o: Ocorrencia) {
    if (somenteLeitura()) return;
    if (!(await confirmar({ titulo: "Apagar esta ocorrência?", texto: `${tipoDaOcorrencia(o.tipo).rotulo}, ${quandoFoi(o.quando)}. Ela some da ficha e do Hoje.`, confirmar: "Apagar", perigo: true }))) return;
    try { ok(await sb.from("estadias_ocorrencias").delete().eq("id", o.id).eq("petshop_id", petshop.id).select("id")); avisar("Ocorrência apagada."); await recarregar(); avisarMudanca(); } catch (e) { avisarErro(e); }
  }
  return (
    <section className="g-card">
      <div className="g-card-t"><h3><Tile icone={ShieldAlert} tom="rosa" tamanho="p" />Ocorrências na creche e no hotel</h3></div>
      <div className="g-lista">
        {dados.map((o) => (
          <div key={o.id} className="g-linha g-cs-oc-linha">
            <span className="t">
              <b>{tipoDaOcorrencia(o.tipo).rotulo}, {quandoFoi(o.quando)}</b>
              <span>{[o.texto, o.criado_nome ? `anotou ${primeiroNome(o.criado_nome)}` : null].filter(Boolean).join(" · ") || "sem detalhe"}</span>
            </span>
            {souDono && <button type="button" className="g-ico" onClick={() => void apagar(o)} aria-label="Apagar esta ocorrência"><Trash2 /></button>}
          </div>
        ))}
      </div>
    </section>
  );
}
