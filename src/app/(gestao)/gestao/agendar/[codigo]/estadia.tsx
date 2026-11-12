"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Cat, Check, Dog, MessageCircle, PawPrint } from "lucide-react";
import { banco } from "@/lib/gestao/supabase";
import { PORTES, type Porte } from "@/lib/gestao/tipos";
import { brlCurto, dataCurta, fmtTelefone } from "@/lib/gestao/util";

type Tipo = "creche" | "hotel";
type Especie = "cao" | "gato" | "outro";
const ESPECIES: { id: Especie; rotulo: string; icone: React.ComponentType<{ size?: number }> }[] = [
  { id: "cao", rotulo: "Cão", icone: Dog }, { id: "gato", rotulo: "Gato", icone: Cat }, { id: "outro", rotulo: "Outro", icone: PawPrint },
];
const soma = (iso: string, dias: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };
const dia = (iso: string) => { const d = new Date(`${iso}T12:00:00`); return `${["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][d.getDay()]}, ${dataCurta(d)}`; };
const entre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 864e5);

/**
 * Pedido de creche (um ou mais dias) ou de hotel (entrada e saída) pelo link do cliente.
 * O cliente só fica sabendo se um dia está cheio; não vê quem está na casa nem quantas vagas existem.
 */
export default function EstadiaPeloLink({ codigo, tipo, hoje, loja, diaria, zapLoja, aoVoltar }: {
  codigo: string; tipo: Tipo; hoje: string; loja: string; diaria: number | null; zapLoja: string | null; aoVoltar: () => void;
}) {
  const hotel = tipo === "hotel";
  const [passo, setPasso] = useState<"quando" | "dados" | "enviado">("quando");
  const [entrada, setEntrada] = useState(soma(hoje, 1));
  const [saida, setSaida] = useState(soma(hoje, hotel ? 2 : 1));
  const [cheios, setCheios] = useState<string[] | null>(null);
  const [pet, setPet] = useState("");
  const [especie, setEspecie] = useState<Especie>("cao");
  const [porte, setPorte] = useState<Porte | null>(null);
  const [tutor, setTutor] = useState("");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);

  const dias = hotel ? entre(entrada, saida) : entre(entrada, saida) + 1;
  // diz qual é o problema das datas (as mesmas regras do banco); null = datas boas
  const erroDatas = !entrada ? (hotel ? "Escolha o dia da entrada." : "Escolha o dia.")
    : !saida ? (hotel ? "Escolha o dia da saída." : "Escolha até que dia o pet vem.")
    : entrada < hoje ? `${hotel ? "A entrada" : "O dia"} não pode ser no passado. Escolha de hoje em diante.`
    : entrada > soma(hoje, 365) ? "Essa data está longe demais. Escolha uma entrada dentro de um ano."
    : hotel && saida === entrada ? "No hotel, a saída é pelo menos um dia depois da entrada."
    : saida < entrada ? (hotel ? "A saída está antes da entrada. Escolha uma saída depois da entrada." : "O último dia está antes do primeiro. Confira as datas.")
    : entre(entrada, saida) > 60 ? "O período passa de 60 dias. Escolha até 60 dias ou fale com a gente."
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

  function mudarEntrada(v: string) {
    setEntrada(v);
    if (v && (hotel ? saida <= v : saida < v)) setSaida(soma(v, hotel ? 1 : 0));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const fone = telefone.replace(/\D/g, "");
    if (pet.trim().length < 1) { setErro("Diga o nome do pet."); return; }
    if (tutor.trim().length < 2) { setErro("Diga o seu nome."); return; }
    if (fone.length < 10 || fone.length > 13) { setErro("Confira o WhatsApp: DDD e número."); return; }
    setErro(null);
    setRepetido(false);
    setEnviando(true);
    try {
      const { data, error } = await banco().rpc("link_pedir_estadia", {
        p_codigo: codigo, p_tipo: tipo, p_entrada: entrada, p_saida: saida, p_tutor: tutor.trim(), p_telefone: fone, p_pet: pet.trim(),
        p_especie: especie, p_porte: porte ?? undefined, p_obs: obs.trim() || undefined,
      });
      const r = data as { ok?: boolean; erro?: string; id?: string; dia?: string } | null;
      if (error || !r) { setErro("Não deu para enviar agora. Confira a internet e tente de novo."); return; }
      if (!r.ok) {
        setErro(r.erro === "lotado" ? `Não há vaga em ${r.dia ? dia(r.dia) : "um dos dias"}. Escolha outras datas.`
          : r.erro === "limite" ? "Você já tem pedidos esperando resposta. Fale direto com a gente para combinar."
          : r.erro === "fechado" ? "Este link não está recebendo pedidos agora."
          : r.erro === "datas" ? "Confira as datas: a entrada não pode ser no passado, a saída vem depois da entrada e o período vai até 60 dias."
          : r.erro === "repetido" ? `Você já pediu vaga para ${pet.trim()} nessas datas. Acompanhe o pedido ou fale com a gente.`
          : r.erro === "dados" ? "Confira o nome do pet, o seu nome e o WhatsApp com DDD."
          : "Algo deu errado. Tente de novo em instantes.");
        setRepetido(r.erro === "repetido");
        if (r.erro === "lotado" || r.erro === "datas") setPasso("quando");
        return;
      }
      setPedidoId(r.id ?? null);
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
        <p>O {loja} confirma com você pelo WhatsApp.</p>
        <dl className="g-lk-resumo">
          <div><dt>Pedido</dt><dd>{nome}</dd></div>
          <div><dt>Pet</dt><dd>{pet.trim()}</dd></div>
          <div><dt>{hotel ? "Entrada" : "Dia"}</dt><dd>{dia(entrada)}</dd></div>
          {(hotel || saida !== entrada) && <div><dt>{hotel ? "Saída" : "Até"}</dt><dd>{dia(saida)}</dd></div>}
        </dl>
        <p className="g-lk-nota">A vaga ainda não está reservada. Espere a confirmação.</p>
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
          {datasOk && (
            <p className="g-p">
              <b>{dias} {hotel ? (dias === 1 ? "noite" : "noites") : (dias === 1 ? "dia" : "dias")}</b>
              {diaria != null && <> · diária de {brlCurto(diaria)}{total != null && dias > 1 ? `, cerca de ${brlCurto(total)} no total` : ""}</>}
            </p>
          )}
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
        <span><b>{nome}</b> · {periodo}</span>
        <u>Trocar</u>
      </button>
      <div className="g-lk-bloco g-form">
        <div className="g-lk-bloco-t"><h2>Quem vem?</h2></div>
        <div className="g-lk-pet" role="group" aria-label="Pet">
          <label className="g-campo"><span>Nome do pet</span>
            <input className="g-input" value={pet} maxLength={80} autoComplete="off" onChange={(e) => setPet(e.target.value)} />
          </label>
          <div className="g-campo">
            <span>É um</span>
            <div className="g-lk-opcoes tres">
              {ESPECIES.map((e) => <button key={e.id} type="button" className="g-lk-opcao" aria-pressed={especie === e.id} onClick={() => setEspecie(e.id)}><e.icone />{e.rotulo}</button>)}
            </div>
          </div>
          <div className="g-campo">
            <span>Porte <small>(se souber)</small></span>
            <div className="g-lk-opcoes quatro">
              {PORTES.map((p) => (
                <button key={p.id} type="button" className="g-lk-opcao porte" aria-pressed={porte === p.id} onClick={() => setPorte(porte === p.id ? null : p.id)}><b>{p.id}</b><small>{p.rotulo}</small></button>
              ))}
            </div>
          </div>
        </div>
        <p className="g-muted g-pp">Para mais de um pet, faça um pedido para cada um.</p>
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
      <p className="g-lk-nota">Isto é um pedido. A vaga só vale depois que o {loja} confirmar.</p>
    </form>
  );
}
