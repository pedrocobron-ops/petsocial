"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Cat, Check, Dog, MessageCircle, PawPrint, Plus, Trash2 } from "lucide-react";
import { banco } from "@/lib/gestao/supabase";
import { PORTES, type Porte } from "@/lib/gestao/tipos";
import { brl, brlCurto, dataCurta, fmtTelefone } from "@/lib/gestao/util";
import { lembrarPedido } from "@/lib/gestao/link-opcoes";
import { AceiteDosTermos, SEM_ACEITE, faltaAceitar, pedirPeloLink, type TermosDoLink } from "./termos";

type Tipo = "creche" | "hotel";
type Especie = "cao" | "gato" | "outro";
const ESPECIES: { id: Especie; rotulo: string; icone: React.ComponentType<{ size?: number }> }[] = [
  { id: "cao", rotulo: "Cão", icone: Dog }, { id: "gato", rotulo: "Gato", icone: Cat }, { id: "outro", rotulo: "Outro", icone: PawPrint },
];
const soma = (iso: string, dias: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
const dia = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return `${["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][d.getDay()]}, ${dataCurta(d)}`; };
const entre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5);
type PetDoPedido = { nome: string; especie: Especie; porte: Porte | null };
const petVazio = (): PetDoPedido => ({ nome: "", especie: "cao", porte: null });
/** Até quantos pets do mesmo tutor cabem num pedido. */
const MAX_PETS = 4;
/** Sinal da reserva, como o dono definiu nas opções do hotel (o link só avisa: nada é pago por aqui). */
type SinalDoLink = { modo: string | null; valor: number | null; politica: string | null; creche: boolean };
const listaE = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);

/**
 * Pedido de creche (um ou mais dias) ou de hotel (entrada e saída) pelo link do cliente.
 * O cliente só fica sabendo se um dia está cheio; não vê quem está na casa nem quantas vagas existem.
 */
export default function EstadiaPeloLink({ codigo, tipo, hoje, loja, diaria, zapLoja, aoVoltar, termos = null, recarregarTermos, aoPedir }: {
  codigo: string; tipo: Tipo; hoje: string; loja: string; diaria: number | null; zapLoja: string | null; aoVoltar: () => void;
  /** Regras que o tutor aceita antes de enviar (null = não pede aceite). */
  termos?: TermosDoLink | null; recarregarTermos?: () => Promise<unknown>; aoPedir?: () => void;
}) {
  const hotel = tipo === "hotel";
  const [passo, setPasso] = useState<"quando" | "dados" | "enviado">("quando");
  const [entrada, setEntrada] = useState(soma(hoje, 1));
  const [saida, setSaida] = useState(soma(hoje, hotel ? 2 : 1));
  const [cheios, setCheios] = useState<string[] | null>(null);
  const [horaEntrada, setHoraEntrada] = useState("08:00");
  const [horaSaida, setHoraSaida] = useState("18:00");
  const [pets, setPets] = useState<PetDoPedido[]>([petVazio()]);
  const mudarPet = (i: number, m: Partial<PetDoPedido>) => setPets((l) => l.map((x, j) => (j === i ? { ...x, ...m } : x)));
  const nomes = pets.map((x) => x.nome.trim()).filter(Boolean);
  const [sinal, setSinal] = useState<SinalDoLink | null>(null);
  const [tutor, setTutor] = useState("");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [aceite, setAceite] = useState(SEM_ACEITE);

  const dias = hotel ? entre(entrada, saida) : entre(entrada, saida) + 1;
  // diz qual é o problema das datas (as mesmas regras do banco); null = datas boas
  const erroDatas = !entrada ? (hotel ? "Escolha o dia da entrada." : "Escolha o dia.")
    : !saida ? (hotel ? "Escolha o dia da saída." : "Escolha até que dia o pet vem.")
    : entrada < hoje ? `${hotel ? "A entrada" : "O dia"} não pode ser no passado. Escolha de hoje em diante.`
    : entrada > soma(hoje, 365) ? "Essa data está longe demais. Escolha uma entrada dentro de um ano."
    : hotel && saida === entrada ? "No hotel, a saída é pelo menos um dia depois da entrada."
    : saida < entrada ? (hotel ? "A saída está antes da entrada. Escolha uma saída depois da entrada." : "O último dia está antes do primeiro. Confira as datas.")
    : entre(entrada, saida) > 60 ? "O período passa de 60 dias. Escolha até 60 dias ou fale com a gente."
    : !/^\d{2}:\d{2}$/.test(horaEntrada) || !/^\d{2}:\d{2}$/.test(horaSaida) ? "Escolha a hora de chegada e a hora de buscar."
    : saida === entrada && horaSaida <= horaEntrada ? "No mesmo dia, a hora de buscar vem depois da hora de chegada."
    : null;
  const datasOk = erroDatas === null;
  const [repetido, setRepetido] = useState(false);
  const total = diaria != null && datasOk ? diaria * dias : null;

  // dias cheios do período escolhido (no hotel, o dia da saída não ocupa vaga)
  useEffect(() => {
    if (!datasOk) { setCheios(null); return; }
    let vale = true;
    setCheios(null);
    void banco().rpc("link_estadia_cheios", { p_codigo: codigo, p_tipo: tipo, p_de: entrada, p_ate: hotel ? soma(saida, -1) : saida }).then(({ data }) => {
      if (vale) setCheios(Array.isArray(data) ? (data as unknown as string[]) : []);
    });
    return () => { vale = false; };
  }, [codigo, tipo, entrada, saida, hotel, datasOk]);

  // as opções do hotel que o cliente precisa saber antes de pedir (hoje, só o sinal)
  useEffect(() => {
    let vale = true;
    void banco().rpc("link_hotel_opcoes", { p_codigo: codigo }).then(({ data }) => {
      const s = (data as { sinal?: SinalDoLink | null } | null)?.sinal;
      if (vale && s && (hotel || s.creche) && s.valor) setSinal(s);
    });
    return () => { vale = false; };
  }, [codigo, hotel]);
  const fraseDoSinal = sinal ? `${loja} pede um sinal de ${sinal.modo === "valor" ? `${brl(sinal.valor)} por pet` : `${sinal.valor}% do valor da reserva`} para garantir a vaga.` : null;

  function mudarEntrada(v: string) {
    setEntrada(v);
    if (v && (hotel ? saida <= v : saida < v)) setSaida(soma(v, hotel ? 1 : 0));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const fone = telefone.replace(/\D/g, "");
    if (pets.some((x) => x.nome.trim().length < 1)) { setErro(pets.length > 1 ? "Diga o nome de cada pet, ou tire o que ficou em branco." : "Diga o nome do pet."); return; }
    if (new Set(pets.map((x) => x.nome.trim().toLowerCase())).size < pets.length) { setErro("Dois pets estão com o mesmo nome. Mude um deles."); return; }
    if (tutor.trim().length < 2) { setErro("Diga o seu nome."); return; }
    if (fone.length < 10 || fone.length > 13) { setErro("Confira o WhatsApp: DDD e número."); return; }
    const falta = faltaAceitar(termos, aceite, loja);
    if (falta) { setErro(falta); return; }
    setErro(null);
    setRepetido(false);
    setEnviando(true);
    try {
      const { data, error } = await pedirPeloLink("link_pedir_estadia", {
        p_codigo: codigo, p_tipo: tipo, p_entrada: entrada, p_saida: saida, p_tutor: tutor.trim(), p_telefone: fone, p_pet: pets[0].nome.trim(),
        p_especie: pets[0].especie, p_porte: pets[0].porte ?? undefined, p_obs: obs.trim() || undefined,
        p_hora_entrada: horaEntrada, p_hora_saida: horaSaida,
        ...(pets.length > 1 ? { p_mais_pets: pets.slice(1).map((x) => ({ nome: x.nome.trim(), especie: x.especie, porte: x.porte })) } : {}),
      }, termos, aceite);
      const r = data as { ok?: boolean; erro?: string; id?: string; dia?: string } | null;
      if (error || !r) { setErro("Não deu para enviar agora. Confira a internet e tente de novo."); return; }
      if (!r.ok) {
        if (r.erro === "termos") {
          // as regras mudaram entre abrir a página e enviar: mostra o texto novo e pede o aceite de novo
          await recarregarTermos?.();
          setAceite(SEM_ACEITE);
          setErro(`As regras de ${loja} mudaram agora há pouco. Leia de novo e marque para enviar.`);
          return;
        }
        setErro(r.erro === "lotado" && pets.length > 1 ? `Não há vaga para os ${pets.length} pets em ${r.dia ? dia(r.dia) : "um dos dias"}. Escolha outras datas ou peça para menos pets.`
          : r.erro === "lotado" ? `Não dá para receber em ${r.dia ? dia(r.dia) : "um dos dias"}: a casa está cheia ou não abre nesse dia. Escolha outras datas.`
          : r.erro === "limite" ? "Você já tem pedidos esperando resposta. Fale direto com a gente para combinar."
          : r.erro === "fechado" ? "Este link não está recebendo pedidos agora."
          : r.erro === "datas" ? "Confira as datas: a entrada não pode ser no passado, a saída vem depois da entrada e o período vai até 60 dias."
          : r.erro === "repetido" ? `Você já pediu vaga para ${listaE(nomes)} nessas datas. Acompanhe o pedido ou fale com a gente.`
          : r.erro === "horas" ? "No mesmo dia, a hora de buscar vem depois da hora de chegada."
          : r.erro === "dados" ? "Confira o nome do pet, o seu nome e o WhatsApp com DDD."
          : "Algo deu errado. Tente de novo em instantes.");
        setRepetido(r.erro === "repetido");
        if (r.erro === "lotado" || r.erro === "datas" || r.erro === "horas") setPasso("quando");
        return;
      }
      setPedidoId(r.id ?? null);
      // o endereço de acompanhar fica guardado neste aparelho: recarregar a página não perde o pedido
      if (r.id) { lembrarPedido(codigo, r.id, `${hotel ? "Hotel" : "Creche"} de ${listaE(nomes)}`); aoPedir?.(); }
      setPasso("enviado");
    } finally { setEnviando(false); }
  }

  const nome = hotel ? "Hotel" : "Creche";
  const periodo = hotel ? `de ${dia(entrada)} até ${dia(saida)}` : entrada === saida ? dia(entrada) : `de ${dia(entrada)} até ${dia(saida)}`;

  if (passo === "enviado") {
    return (
      <section className="g-lk-secao g-lk-ok" aria-live="polite">
        <span className="g-lk-ok-selo" aria-hidden><Check /></span>
        <h2>Pedido enviado.</h2>
        <p>{loja} confirma com você pelo WhatsApp.</p>
        <dl className="g-lk-resumo">
          <div><dt>Pedido</dt><dd>{nome}</dd></div>
          <div><dt>{nomes.length > 1 ? "Pets" : "Pet"}</dt><dd>{listaE(nomes)}</dd></div>
          <div><dt>{hotel ? "Entrada" : "Dia"}</dt><dd>{dia(entrada)}, às {horaEntrada}</dd></div>
          {(hotel || saida !== entrada) ? <div><dt>{hotel ? "Saída" : "Até"}</dt><dd>{dia(saida)}, às {horaSaida}</dd></div> : <div><dt>Buscar</dt><dd>às {horaSaida}</dd></div>}
        </dl>
        <p className="g-lk-nota">A vaga ainda não está reservada. Espere a confirmação.</p>
        {fraseDoSinal && <p className="g-lk-nota">Depois da confirmação, {fraseDoSinal}{sinal?.politica ? ` ${sinal.politica}` : ""} O pagamento é combinado direto com {loja}: nada é pago por aqui.</p>}
        <div className="g-lk-ok-acoes">
          {pedidoId && <a className="g-btn verde" href={`/gestao/agendar/${codigo}/pedido/${pedidoId}`}>Acompanhar o pedido</a>}
          <button type="button" className="g-btn sec" onClick={aoVoltar}>Fazer outro pedido</button>
          {zapLoja && <a className="g-btn fantasma" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com a gente</a>}
        </div>
      </section>
    );
  }

  if (passo === "quando") {
    const temCheio = (cheios?.length ?? 0) > 0;
    return (
      <section className="g-lk-secao">
        <h2>{hotel ? "Quando o seu pet fica com a gente?" : "Que dia o seu pet vem para a creche?"}</h2>
        <div className="g-lk-bloco g-form">
          <label className="g-campo"><span>{hotel ? "Dia da entrada" : "Dia"}</span>
            <input className="g-input" type="date" min={hoje} max={soma(hoje, 365)} value={entrada} onChange={(e) => { setErro(null); mudarEntrada(e.target.value); }} />
          </label>
          <label className="g-campo"><span>{hotel ? "Dia da saída" : "Até o dia"} {!hotel && <small>(igual, se for um dia só)</small>}</span>
            <input className="g-input" type="date" min={!entrada ? hoje : hotel ? soma(entrada, 1) : entrada} max={entrada ? soma(entrada, 60) : undefined} value={saida} onChange={(e) => { setErro(null); setSaida(e.target.value); }} />
          </label>
          <div className="dupla">
            <label className="g-campo"><span>Hora de chegada</span>
              <input className="g-input" type="time" value={horaEntrada} onChange={(e) => { setErro(null); setHoraEntrada(e.target.value); }} />
            </label>
            <label className="g-campo"><span>Hora de buscar</span>
              <input className="g-input" type="time" value={horaSaida} onChange={(e) => { setErro(null); setHoraSaida(e.target.value); }} />
            </label>
          </div>
          {datasOk && (
            <p className="g-p">
              <b>{dias} {hotel ? (dias === 1 ? "noite" : "noites") : (dias === 1 ? "dia" : "dias")}</b>
              {diaria != null && <> · diária de {brlCurto(diaria)}{total != null && dias > 1 ? `, cerca de ${brlCurto(total)} no total` : ""}</>}
            </p>
          )}
          {fraseDoSinal && <p className="g-muted g-pp">{fraseDoSinal}{sinal?.politica ? ` ${sinal.politica}` : ""} Nada é pago por aqui.</p>}
          {erroDatas && <p className="g-lk-alerta" role="alert"><span>{erroDatas}</span></p>}
          {erro && !erroDatas && <p className="g-lk-alerta" role="alert"><span>{erro}</span></p>}
          {temCheio && (
            <p className="g-lk-alerta" role="alert"><span>Sem vaga em {cheios!.slice(0, 4).map(dia).join("; ")}{cheios!.length > 4 ? " e outros dias" : ""}. Escolha outras datas.</span></p>
          )}
        </div>
        <div className="g-lk-pe">
          <button type="button" className="g-btn sec" onClick={aoVoltar}><ArrowLeft />Voltar</button>
          <button type="button" className="g-btn pri" disabled={!datasOk || cheios === null || temCheio} onClick={() => setPasso("dados")}>{cheios === null && datasOk ? "Conferindo as vagas…" : "Continuar"}</button>
        </div>
      </section>
    );
  }

  return (
    <form className="g-lk-secao" onSubmit={enviar} noValidate>
      <button type="button" className="g-lk-escolhido" style={{ "--cor": hotel ? "#7c6bd6" : "#3b9bd9" } as React.CSSProperties} onClick={() => setPasso("quando")}>
        <i aria-hidden />
        <span><b>{nome}</b> · {periodo} · chega às {horaEntrada}, busca às {horaSaida}</span>
        <u>Trocar</u>
      </button>
      <div className="g-lk-bloco g-form">
        <div className="g-lk-bloco-t"><h2>Quem vem?</h2></div>
        {pets.map((x, i) => (
          <div key={i} className="g-lk-pet" role="group" aria-label={pets.length > 1 ? `Pet ${i + 1}` : "Pet"}>
            <label className="g-campo"><span>Nome do pet{pets.length > 1 ? ` ${i + 1}` : ""}</span>
              <input className="g-input" value={x.nome} maxLength={80} autoComplete="off" onChange={(e) => mudarPet(i, { nome: e.target.value })} />
            </label>
            <div className="g-campo">
              <span>É um</span>
              <div className="g-lk-opcoes tres">
                {ESPECIES.map((e) => <button key={e.id} type="button" className="g-lk-opcao" aria-pressed={x.especie === e.id} onClick={() => mudarPet(i, { especie: e.id })}><e.icone />{e.rotulo}</button>)}
              </div>
            </div>
            <div className="g-campo">
              <span>Porte <small>(se souber)</small></span>
              <div className="g-lk-opcoes quatro">
                {PORTES.map((p) => (
                  <button key={p.id} type="button" className="g-lk-opcao porte" aria-pressed={x.porte === p.id} onClick={() => mudarPet(i, { porte: x.porte === p.id ? null : p.id })}><b>{p.id}</b><small>{p.rotulo}</small></button>
                ))}
              </div>
            </div>
            {pets.length > 1 && <button type="button" className="g-btn fantasma p" style={{ justifySelf: "start" }} onClick={() => setPets((l) => l.filter((_, j) => j !== i))}><Trash2 />Tirar este pet</button>}
          </div>
        ))}
        {pets.length < MAX_PETS
          ? <button type="button" className="g-btn sec p" style={{ justifySelf: "start" }} onClick={() => setPets((l) => [...l, petVazio()])}><Plus />Outro pet do mesmo tutor</button>
          : <p className="g-muted g-pp">Até {MAX_PETS} pets por pedido. Para mais, faça outro pedido.</p>}

      </div>
      <div className="g-lk-bloco g-form">
        <h2>Com quem a gente fala?</h2>
        <label className="g-campo"><span>Seu nome</span>
          <input className="g-input" value={tutor} maxLength={120} autoComplete="name" onChange={(e) => setTutor(e.target.value)} />
        </label>
        <label className="g-campo"><span>Seu WhatsApp</span>
          <input className="g-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={telefone} maxLength={20}
            onChange={(e) => setTelefone(e.target.value)} onBlur={() => setTelefone(fmtTelefone(telefone))} />
          <small>É por ele que a confirmação chega.</small>
        </label>
        <label className="g-campo"><span>Quer avisar alguma coisa? <small>(opcional)</small></span>
          <textarea className="g-textarea" value={obs} maxLength={300} placeholder="Vacinas em dia, toma remédio, primeira vez, o que ele come…" onChange={(e) => setObs(e.target.value)} />
        </label>
      </div>
      <AceiteDosTermos termos={termos} loja={loja} pets={pets.length} aceite={aceite} aoMudar={(a) => { setAceite(a); setErro(null); }} />
      {erro && (
        <div className="g-lk-alerta" role="alert">
          <span>{erro}</span>
          {repetido && zapLoja && <a className="g-btn zap p" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com a gente</a>}
        </div>
      )}
      <div className="g-lk-pe">
        <button type="button" className="g-btn sec" onClick={() => { setErro(null); setRepetido(false); setPasso("quando"); }}><ArrowLeft />Voltar</button>
        <button className="g-btn pri" disabled={enviando}>{enviando ? "Enviando…" : "Enviar pedido"}</button>
      </div>
      <p className="g-lk-nota">Isto é um pedido. A vaga só vale depois que {loja} confirmar.</p>
    </form>
  );
}
