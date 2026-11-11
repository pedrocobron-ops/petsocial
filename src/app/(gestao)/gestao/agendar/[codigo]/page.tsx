"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Cat, Check, Clock, Dog, MapPin, MessageCircle, PawPrint, Scissors } from "lucide-react";
import { Marca, Selo } from "@/components/gestao/marca";
import { banco, configurado } from "@/lib/gestao/supabase";
import { PORTES, type Porte } from "@/lib/gestao/tipos";
import { brlCurto, deIsoDia, fmtTelefone, horarioDoDia, iniciais, isoDia, linkWhatsApp, nomeDia, nomeDiaCurto, nomeMes, soDigitos, somaDias } from "@/lib/gestao/util";
import "./agendar.css";

type ServicoDoLink = {
  id: string; nome: string; duracao_min: number; cor: string | null;
  preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null;
};
type Info = {
  nome: string; telefone: string | null; cidade: string | null; uf: string | null; horario: unknown; aviso: string | null; hoje: string;
  servicos: ServicoDoLink[];
};
type Passo = "servico" | "quando" | "dados" | "enviado";
type Especie = "cao" | "gato" | "outro";

const DIAS_NA_FAIXA = 14;
const ESPECIES: { id: Especie; rotulo: string; icone: React.ComponentType<{ size?: number }> }[] = [
  { id: "cao", rotulo: "Cão", icone: Dog },
  { id: "gato", rotulo: "Gato", icone: Cat },
  { id: "outro", rotulo: "Outro", icone: PawPrint },
];
const PASSOS: { id: Passo; rotulo: string }[] = [
  { id: "servico", rotulo: "Serviço" },
  { id: "quando", rotulo: "Dia e hora" },
  { id: "dados", rotulo: "Seus dados" },
];

function duracao(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}
/** "R$ 60" quando o preço é um só; "a partir de R$ 50" quando muda com o porte; null sem preço. */
function precoDoCartao(s: ServicoDoLink) {
  const valores = [s.preco_p, s.preco_m, s.preco_g, s.preco_gg].filter((v): v is number => v != null).map(Number);
  if (!valores.length) return null;
  const menor = Math.min(...valores);
  return valores.every((v) => v === menor) ? brlCurto(menor) : `a partir de ${brlCurto(menor)}`;
}
/** "hoje", "amanhã" ou "sexta, 14 de novembro", contando a partir do dia do pet shop. */
function diaPorExtenso(dia: string, hoje: string) {
  const d = deIsoDia(dia);
  const dif = Math.round((d.getTime() - deIsoDia(hoje).getTime()) / 864e5);
  const texto = `${nomeDia(d)}, ${d.getDate()} de ${nomeMes(d)}`;
  return dif === 0 ? `hoje, ${d.getDate()} de ${nomeMes(d)}` : dif === 1 ? `amanhã, ${texto}` : texto;
}

export default function AgendarPeloLink() {
  const { codigo: bruto } = useParams<{ codigo: string }>();
  const codigo = decodeURIComponent(String(bruto ?? "")).trim();

  // undefined = carregando; null = link desligado ou inexistente
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [semRede, setSemRede] = useState(false);
  const [passo, setPasso] = useState<Passo>("servico");

  const [servicoId, setServicoId] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horaEscolhida, setHoraEscolhida] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [erroHorarios, setErroHorarios] = useState(false);
  const [avisoQuando, setAvisoQuando] = useState<string | null>(null);

  const [pet, setPet] = useState("");
  const [especie, setEspecie] = useState<Especie>("cao");
  const [porte, setPorte] = useState<Porte | null>(null);
  const [tutor, setTutor] = useState("");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [limite, setLimite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<{ pet: string; servico: string; dia: string; hora: string } | null>(null);

  const carregar = useCallback(async () => {
    setSemRede(false);
    setInfo(undefined);
    if (!configurado || !codigo) { setInfo(null); return; }
    const { data, error } = await banco().rpc("link_info", { p_codigo: codigo });
    if (error) { setSemRede(true); return; }
    const lido = data as unknown as Info | null;
    setInfo(lido && typeof lido === "object" && lido.nome ? { ...lido, servicos: Array.isArray(lido.servicos) ? lido.servicos : [] } : null);
  }, [codigo]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (info?.nome) document.title = `Agendar no ${info.nome}`; }, [info?.nome]);

  const servico = info?.servicos.find((s) => s.id === servicoId) ?? null;
  const dias = useMemo(() => {
    if (!info) return [];
    const base = deIsoDia(info.hoje);
    return Array.from({ length: DIAS_NA_FAIXA }, (_, i) => {
      const d = somaDias(base, i);
      return { iso: isoDia(d), data: d, aberto: !!horarioDoDia(info.horario, d), hoje: i === 0 };
    });
  }, [info]);
  const meses = useMemo(() => [...new Set(dias.map((d) => nomeMes(d.data)))].join(" e "), [dias]);

  // horários livres do dia escolhido
  const vez = useRef(0);
  const buscarHorarios = useCallback(async (s: string, d: string) => {
    const minha = ++vez.current;
    setHorarios(null);
    setErroHorarios(false);
    const { data, error } = await banco().rpc("link_horarios", { p_codigo: codigo, p_servico: s, p_dia: d });
    if (minha !== vez.current) return;
    if (error) { setErroHorarios(true); setHorarios([]); return; }
    const lista = ((data ?? []) as string[]).map((h) => String(h).slice(0, 5));
    setHorarios(lista);
    setHoraEscolhida((h) => (h && lista.includes(h) ? h : null));
  }, [codigo]);
  useEffect(() => {
    if (passo === "quando" && servicoId && dia) void buscarHorarios(servicoId, dia);
  }, [passo, servicoId, dia, buscarHorarios]);

  const ir = (p: Passo) => { setPasso(p); setErro(null); window.scrollTo({ top: 0 }); };

  function escolherServico(id: string) {
    setServicoId(id);
    setHoraEscolhida(null);
    setAvisoQuando(null);
    if (!dia) setDia(dias.find((d) => d.aberto)?.iso ?? null);
    ir("quando");
  }
  function escolherDia(iso: string) {
    setDia(iso);
    setHoraEscolhida(null);
    setAvisoQuando(null);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!info || !servico || !dia || !horaEscolhida || enviando) return;
    const nomePet = pet.trim(), nomeTutor = tutor.trim(), fone = soDigitos(telefone);
    setLimite(false);
    if (!nomePet) return setErro("Escreva o nome do pet.");
    if (nomeTutor.length < 2) return setErro("Escreva o seu nome.");
    if (fone.length !== 10 && fone.length !== 11) return setErro("Confira o WhatsApp: DDD e número.");
    setErro(null);
    setEnviando(true);
    const { data, error } = await banco().rpc("link_pedir", {
      p_codigo: codigo, p_servico: servico.id, p_dia: dia, p_hora: horaEscolhida, p_tutor: nomeTutor, p_telefone: fone, p_pet: nomePet,
      p_especie: especie, p_porte: porte ?? undefined, p_obs: obs.trim() || undefined,
    });
    setEnviando(false);
    if (error) return setErro("Não consegui enviar agora. Confira a internet e tente de novo.");
    const r = data as unknown as { ok: boolean; erro?: string } | null;
    if (r?.ok) {
      setEnviado({ pet: nomePet, servico: servico.nome, dia, hora: horaEscolhida });
      setPasso("enviado");
      window.scrollTo({ top: 0 });
      return;
    }
    if (r?.erro === "ocupado") {
      setHoraEscolhida(null);
      setAvisoQuando("Esse horário acabou de ser ocupado. Escolha outro, por favor.");
      ir("quando");
    } else if (r?.erro === "limite") {
      setLimite(true);
      setErro(`Não deu para enviar mais um pedido por aqui agora. Fale direto com o ${info.nome}.`);
    } else if (r?.erro === "fechado") {
      setInfo(null);
    } else if (r?.erro === "dados") {
      setErro("Confira o nome do pet, o seu nome e o WhatsApp com DDD.");
    } else {
      setErro("Algo deu errado. Tente de novo em instantes.");
    }
  }

  function pedirOutro() {
    setEnviado(null);
    setHoraEscolhida(null);
    setPet("");
    setPorte(null);
    setObs("");
    setServicoId(null);
    ir("servico");
  }

  /* ---------- telas sem formulário ---------- */

  if (semRede) {
    return (
      <Moldura>
        <div className="g-lk-fim">
          <Selo tamanho={72} tom="suave" />
          <h1>Não consegui abrir a página</h1>
          <p className="g-muted">Confira a internet e tente de novo.</p>
          <button className="g-btn verde" onClick={() => void carregar()}>Tentar de novo</button>
        </div>
      </Moldura>
    );
  }
  if (info === undefined) {
    return (
      <Moldura>
        <div className="g-lk-espera" aria-busy="true" aria-label="Abrindo a página">
          <div className="g-esq" style={{ minHeight: 132, borderRadius: 24 }} />
          <div className="g-esq" style={{ minHeight: 84 }} />
          <div className="g-esq" style={{ minHeight: 84 }} />
        </div>
      </Moldura>
    );
  }
  if (info === null) {
    return (
      <Moldura>
        <div className="g-lk-fim">
          <Selo tamanho={72} tom="suave" />
          <h1>Este link não está disponível</h1>
          <p className="g-muted">O pet shop pode ter desligado o agendamento por aqui. Fale direto com ele para marcar o horário.</p>
        </div>
      </Moldura>
    );
  }

  const zapLoja = linkWhatsApp(info.telefone, `Oi! Quero marcar um horário no ${info.nome}.`);
  const onde = [info.cidade, info.uf].filter(Boolean).join(" · ");
  const manha = (horarios ?? []).filter((h) => h < "12:00");
  const tarde = (horarios ?? []).filter((h) => h >= "12:00");
  const indice = PASSOS.findIndex((p) => p.id === passo);

  return (
    <Moldura>
      <header className="g-lk-cab">
        <Marca tamanho={220} className="g-lk-cab-fundo" />
        <div className="g-lk-cab-quem">
          <span className="g-lk-sigla" aria-hidden>{iniciais(info.nome)}</span>
          <div>
            <h1>{info.nome}</h1>
            {onde && <p className="g-lk-onde"><MapPin aria-hidden />{onde}</p>}
          </div>
        </div>
        {passo !== "enviado" && <p className="g-lk-cab-frase">Peça um horário por aqui. O pet shop confirma com você pelo WhatsApp.</p>}
      </header>

      {info.aviso && passo !== "enviado" && (
        <p className="g-lk-recado"><MessageCircle aria-hidden /><span>{info.aviso}</span></p>
      )}

      {passo !== "enviado" && (
        <ol className="g-lk-passos" aria-label="Passos do pedido">
          {PASSOS.map((p, i) => (
            <li key={p.id} className={i < indice ? "feito" : i === indice ? "atual" : undefined} aria-current={i === indice ? "step" : undefined}>
              <i>{i < indice ? <Check aria-hidden /> : i + 1}</i><span>{p.rotulo}</span>
            </li>
          ))}
        </ol>
      )}

      {/* ---------- 1. serviço ---------- */}
      {passo === "servico" && (
        <section className="g-lk-secao">
          <h2>O que o seu pet vai fazer?</h2>
          {!info.servicos.length ? (
            <div className="g-lk-vazio">
              <Scissors aria-hidden />
              <b>Nenhum serviço por aqui ainda</b>
              <p>Fale direto com o pet shop para marcar o horário.</p>
              {zapLoja && <a className="g-btn zap" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Chamar no WhatsApp</a>}
            </div>
          ) : (
            <div className="g-lk-servicos">
              {info.servicos.map((s) => {
                const preco = precoDoCartao(s);
                return (
                  <button key={s.id} type="button" className="g-lk-serv" aria-pressed={s.id === servicoId}
                    style={{ "--cor": s.cor ?? "#f97316" } as React.CSSProperties} onClick={() => escolherServico(s.id)}>
                    <i className="g-lk-serv-cor" aria-hidden><Scissors /></i>
                    <span className="g-lk-serv-t">
                      <b>{s.nome}</b>
                      <span><Clock aria-hidden />{duracao(s.duracao_min)}{preco && <em>{preco}</em>}</span>
                    </span>
                    <ArrowRight className="g-lk-serv-seta" aria-hidden />
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ---------- 2. dia e hora ---------- */}
      {passo === "quando" && servico && (
        <section className="g-lk-secao">
          <button type="button" className="g-lk-escolhido" style={{ "--cor": servico.cor ?? "#f97316" } as React.CSSProperties} onClick={() => ir("servico")}>
            <i aria-hidden />
            <span><b>{servico.nome}</b> · {duracao(servico.duracao_min)}</span>
            <u>Trocar</u>
          </button>

          <div className="g-lk-bloco">
            <div className="g-lk-bloco-t"><h2>Que dia fica bom?</h2><span className="g-muted g-pp">{meses}</span></div>
            <div className="g-lk-dias">
              {dias.map((d) => (
                <button key={d.iso} type="button" className={`g-lk-dia${d.hoje ? " hoje" : ""}`} disabled={!d.aberto} aria-pressed={d.iso === dia}
                  aria-label={`${nomeDia(d.data)}, ${d.data.getDate()} de ${nomeMes(d.data)}${d.aberto ? "" : ", fechado"}`} onClick={() => escolherDia(d.iso)}>
                  <span>{d.hoje ? "hoje" : nomeDiaCurto(d.data)}</span>
                  <b>{d.data.getDate()}</b>
                </button>
              ))}
            </div>
            {!dias.some((d) => d.aberto) && <p className="g-muted g-p">O pet shop não abre nos próximos dias. Fale direto com ele.</p>}
          </div>

          {dia && (
            <div className="g-lk-bloco">
              <div className="g-lk-bloco-t"><h2>E a que horas?</h2><span className="g-muted g-pp">{diaPorExtenso(dia, info.hoje)}</span></div>
              {avisoQuando && <p className="g-lk-alerta" role="alert">{avisoQuando}</p>}
              {horarios === null ? (
                <div className="g-lk-horas" aria-busy="true">{Array.from({ length: 8 }, (_, i) => <span key={i} className="g-esq g-lk-hora-esq" />)}</div>
              ) : erroHorarios ? (
                <div className="g-lk-vazio">
                  <b>Não consegui ver os horários</b>
                  <p>Confira a internet e tente de novo.</p>
                  <button type="button" className="g-btn sec" onClick={() => void buscarHorarios(servico.id, dia)}>Tentar de novo</button>
                </div>
              ) : !horarios.length ? (
                <div className="g-lk-vazio">
                  <CalendarDays aria-hidden />
                  <b>Esse dia já está cheio</b>
                  <p>Tente outro dia aqui em cima.</p>
                </div>
              ) : (
                <>
                  {[{ rotulo: "Manhã", lista: manha }, { rotulo: "Tarde", lista: tarde }].filter((g) => g.lista.length).map((g) => (
                    <div key={g.rotulo} className="g-lk-turno">
                      <span className="g-rotulo">{g.rotulo}</span>
                      <div className="g-lk-horas">
                        {g.lista.map((h) => (
                          <button key={h} type="button" className="g-lk-hora" aria-pressed={h === horaEscolhida} onClick={() => { setHoraEscolhida(h); setAvisoQuando(null); }}>{h}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          <div className="g-lk-pe">
            <button type="button" className="g-btn sec" onClick={() => ir("servico")}><ArrowLeft />Voltar</button>
            <button type="button" className="g-btn pri" disabled={!dia || !horaEscolhida} onClick={() => ir("dados")}>Continuar<ArrowRight /></button>
          </div>
        </section>
      )}

      {/* ---------- 3. dados ---------- */}
      {passo === "dados" && servico && dia && horaEscolhida && (
        <form className="g-lk-secao" onSubmit={enviar} noValidate>
          <button type="button" className="g-lk-escolhido" style={{ "--cor": servico.cor ?? "#f97316" } as React.CSSProperties} onClick={() => ir("quando")}>
            <i aria-hidden />
            <span><b>{servico.nome}</b> · {diaPorExtenso(dia, info.hoje)}, às {horaEscolhida}</span>
            <u>Trocar</u>
          </button>

          <div className="g-lk-bloco g-form">
            <h2>Quem vem?</h2>
            <label className="g-campo"><span>Nome do pet</span>
              <input className="g-input" value={pet} maxLength={80} autoComplete="off" onChange={(e) => setPet(e.target.value)} />
            </label>
            <div className="g-campo">
              <span>É um</span>
              <div className="g-lk-opcoes tres">
                {ESPECIES.map((x) => (
                  <button key={x.id} type="button" className="g-lk-opcao" aria-pressed={especie === x.id} onClick={() => setEspecie(x.id)}><x.icone />{x.rotulo}</button>
                ))}
              </div>
            </div>
            <div className="g-campo">
              <span>Porte <small>(se souber)</small></span>
              <div className="g-lk-opcoes quatro">
                {PORTES.map((p) => (
                  <button key={p.id} type="button" className="g-lk-opcao porte" aria-pressed={porte === p.id} onClick={() => setPorte(porte === p.id ? null : p.id)}>
                    <b>{p.id}</b><small>{p.rotulo}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="g-lk-bloco g-form">
            <h2>Com quem o pet shop fala?</h2>
            <label className="g-campo"><span>Seu nome</span>
              <input className="g-input" value={tutor} maxLength={120} autoComplete="name" onChange={(e) => setTutor(e.target.value)} />
            </label>
            <label className="g-campo"><span>Seu WhatsApp</span>
              <input className="g-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={telefone} maxLength={20}
                onChange={(e) => setTelefone(e.target.value)} onBlur={() => setTelefone(fmtTelefone(telefone))} />
              <small>É por ele que o pet shop confirma o horário.</small>
            </label>
            <label className="g-campo"><span>Quer avisar alguma coisa? <small>(opcional)</small></span>
              <textarea className="g-textarea" value={obs} maxLength={300} placeholder="Tem medo de secador, toma remédio, primeira vez…" onChange={(e) => setObs(e.target.value)} />
            </label>
          </div>

          {erro && (
            <div className="g-lk-alerta" role="alert">
              <span>{erro}</span>
              {limite && zapLoja && <a className="g-btn zap p" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Chamar no WhatsApp</a>}
            </div>
          )}

          <div className="g-lk-pe">
            <button type="button" className="g-btn sec" onClick={() => ir("quando")}><ArrowLeft />Voltar</button>
            <button className="g-btn pri" disabled={enviando}>{enviando ? "Enviando…" : "Enviar pedido"}</button>
          </div>
          <p className="g-lk-nota">Isto é um pedido. O horário só vale depois que o {info.nome} confirmar.</p>
        </form>
      )}

      {/* ---------- 4. enviado ---------- */}
      {passo === "enviado" && enviado && (
        <section className="g-lk-secao g-lk-ok" aria-live="polite">
          <span className="g-lk-ok-selo" aria-hidden><Check /></span>
          <h2>Pedido enviado.</h2>
          <p>O {info.nome} confirma com você pelo WhatsApp.</p>
          <dl className="g-lk-resumo">
            <div><dt>Pet</dt><dd>{enviado.pet}</dd></div>
            <div><dt>Serviço</dt><dd>{enviado.servico}</dd></div>
            <div><dt>Dia</dt><dd>{diaPorExtenso(enviado.dia, info.hoje)}</dd></div>
            <div><dt>Hora</dt><dd>{enviado.hora}</dd></div>
          </dl>
          <p className="g-lk-nota">O horário ainda não está marcado. Espere a confirmação do pet shop.</p>
          <div className="g-lk-ok-acoes">
            <button type="button" className="g-btn sec" onClick={pedirOutro}>Pedir outro horário</button>
            {zapLoja && <a className="g-btn fantasma" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com o pet shop</a>}
          </div>
        </section>
      )}
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="g-lk">
      <main className="g-lk-miolo">{children}</main>
      <footer className="g-lk-rodape"><Marca tamanho={16} />Feito com Maestro Pet Gestão</footer>
    </div>
  );
}
