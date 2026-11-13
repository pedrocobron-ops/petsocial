"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import EstadiaPeloLink from "./estadia";
import { useParams } from "next/navigation";
import { ArrowLeft, ArrowRight, BedDouble, CalendarDays, Cat, Check, Clock, Dog, MapPin, MessageCircle, PawPrint, Plus, Scissors, Sun, X } from "lucide-react";
import { Marca, Selo } from "@/components/gestao/marca";
import { banco, configurado } from "@/lib/gestao/supabase";
import { PORTES, type Porte } from "@/lib/gestao/tipos";
import { brlCurto, deIsoDia, fmtTelefone, horarioDoDia, isoDia, linkWhatsApp, nomeDia, nomeDiaCurto, nomeMes, soDigitos, somaDias } from "@/lib/gestao/util";
import LogoLoja from "@/components/gestao/logo-loja";
import { aplicarTema } from "@/lib/gestao/identidade";
import "./agendar.css";

type ServicoDoLink = {
  id: string; nome: string; duracao_min: number; cor: string | null;
  preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null;
};
type Info = {
  logo?: string | null; tema?: string | null;
  nome: string; telefone: string | null; cidade: string | null; uf: string | null; horario: unknown; aviso: string | null; hoje: string;
  servicos: ServicoDoLink[];
  creche?: { diaria: number | null } | null; hotel?: { diaria: number | null } | null;
};
type Passo = "servico" | "quando" | "dados" | "enviado";
type Especie = "cao" | "gato" | "outro";
type PetDoPedido = { id: number; nome: string; especie: Especie; porte: Porte | null };
type Enviado = { id: string | null; servico: string; dia: string; pets: { nome: string; hora: string }[] };

/** Quantos pets cabem num pedido só (o banco aceita até 4). */
const MAX_PETS = 4;
let proximoPet = 0;
const novoPet = (): PetDoPedido => ({ id: ++proximoPet, nome: "", especie: "cao", porte: null });

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
/** "10:00" + 90 min = "11:30". */
function somaMin(h: string, min: number) {
  const total = Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) + min;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
/** "Nina", "Nina e Bob", "Nina, Bob e Mel". */
function listaDeNomes(nomes: string[]) {
  return nomes.length <= 1 ? nomes.join("") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}
/** "hoje", "amanhã" ou "sexta, 14 de novembro", contando a partir do dia do pet shop. */
function diaPorExtenso(dia: string, hoje: string) {
  const d = deIsoDia(dia);
  const dif = Math.round((d.getTime() - deIsoDia(hoje).getTime()) / 864e5);
  const texto = `${nomeDia(d)}, ${d.getDate()} de ${nomeMes(d)}`;
  return dif === 0 ? `hoje, ${d.getDate()} de ${nomeMes(d)}` : dif === 1 ? `amanhã, ${texto}` : texto;
}

/**
 * Já passou da hora de fechar hoje? Usa o relógio do aparelho e só responde sim quando o dia do aparelho
 * é o mesmo dia do pet shop (quem está em outro fuso cai na frase geral "não há mais horário hoje").
 */
function passouDoFechamento(horario: unknown, hoje: string) {
  const agora = new Date();
  if (isoDia(agora) !== hoje) return false;
  const h = horarioDoDia(horario, agora);
  if (!h) return false;
  return `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}` >= String(h.fecha).slice(0, 5);
}

export default function AgendarPeloLink() {
  const { codigo: bruto } = useParams<{ codigo: string }>();
  const codigo = decodeURIComponent(String(bruto ?? "")).trim();

  // undefined = carregando; null = link desligado ou inexistente
  const [info, setInfo] = useState<Info | null | undefined>(undefined);
  const [semRede, setSemRede] = useState(false);
  const [passo, setPasso] = useState<Passo>("servico");
  const [estadia, setEstadia] = useState<"creche" | "hotel" | null>(null);

  const [servicoId, setServicoId] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  const [horaEscolhida, setHoraEscolhida] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [erroHorarios, setErroHorarios] = useState(false);
  const [avisoQuando, setAvisoQuando] = useState<string | null>(null);

  // um item por pet: a quantidade escolhida no passo de dia e hora é o tamanho desta lista
  const [pets, setPets] = useState<PetDoPedido[]>(() => [novoPet()]);
  const [conferindo, setConferindo] = useState(false);
  const [naoCabe, setNaoCabe] = useState<number | null>(null);
  const [tutor, setTutor] = useState("");
  const [telefone, setTelefone] = useState("");
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [limite, setLimite] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const qtd = pets.length;

  const carregar = useCallback(async () => {
    setSemRede(false);
    setInfo(undefined);
    if (!configurado || !codigo) { setInfo(null); return; }
    const { data, error } = await banco().rpc("link_info", { p_codigo: codigo });
    if (error) { setSemRede(true); return; }
    const lido = data as unknown as Info | null;
    setInfo(lido && typeof lido === "object" && lido.nome ? { ...lido, servicos: Array.isArray(lido.servicos) ? lido.servicos : [] } : null);
    aplicarTema(lido && typeof lido === "object" ? lido.tema : null); // as cores do pet shop, não as da Maestro Pet
  }, [codigo]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (info?.nome) document.title = `Agendar: ${info.nome}`; }, [info?.nome]);

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
  const buscarHorarios = useCallback(async (s: string, d: string, n: number) => {
    const minha = ++vez.current;
    setHorarios(null);
    setErroHorarios(false);
    const { data, error } = await banco().rpc("link_horarios", { p_codigo: codigo, p_servico: s, p_dia: d, p_pets: n });
    if (minha !== vez.current) return;
    if (error) { setErroHorarios(true); setHorarios([]); return; }
    const lista = ((data ?? []) as string[]).map((h) => String(h).slice(0, 5));
    setHorarios(lista);
    setHoraEscolhida((h) => (h && lista.includes(h) ? h : null));
  }, [codigo]);
  useEffect(() => {
    if (passo === "quando" && servicoId && dia) void buscarHorarios(servicoId, dia, qtd);
  }, [passo, servicoId, dia, qtd, buscarHorarios]);

  const ir = (p: Passo) => { setPasso(p); setErro(null); setNaoCabe(null); window.scrollTo({ top: 0 }); };

  /** Muda quantos pets vêm: completa a lista com pets em branco ou tira os últimos. */
  function mudarQtd(n: number) {
    const alvo = Math.min(MAX_PETS, Math.max(1, n));
    setAvisoQuando(null);
    setPets((l) => (alvo > l.length ? [...l, ...Array.from({ length: alvo - l.length }, novoPet)] : l.slice(0, alvo)));
  }
  const mudarPet = (id: number, novo: Partial<PetDoPedido>) => setPets((l) => l.map((x) => (x.id === id ? { ...x, ...novo } : x)));
  function removerPet(id: number) {
    setNaoCabe(null);
    setPets((l) => (l.length > 1 ? l.filter((x) => x.id !== id) : l));
  }
  /** No passo de dados: só entra mais um pet se o horário escolhido ainda couber todos, um depois do outro. */
  async function adicionarPet() {
    if (!servico || !dia || !horaEscolhida || conferindo || pets.length >= MAX_PETS) return;
    const n = pets.length + 1;
    setErro(null);
    setNaoCabe(null);
    setConferindo(true);
    const { data, error } = await banco().rpc("link_horarios", { p_codigo: codigo, p_servico: servico.id, p_dia: dia, p_pets: n });
    setConferindo(false);
    if (error) return setErro("Não consegui conferir o horário agora. Confira a internet e tente de novo.");
    if (((data ?? []) as string[]).some((h) => String(h).slice(0, 5) === horaEscolhida)) setPets((l) => (l.length < MAX_PETS ? [...l, novoPet()] : l));
    else setNaoCabe(n);
  }
  /** O horário escolhido não comporta mais um pet: leva para a escolha de horário já com a quantidade nova. */
  function verHorariosPara(n: number) {
    mudarQtd(n);
    setHoraEscolhida(null);
    ir("quando");
  }

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
    const lista = pets.map((x) => ({ ...x, nome: x.nome.trim() }));
    const nomeTutor = tutor.trim(), fone = soDigitos(telefone);
    setLimite(false);
    setNaoCabe(null);
    if (lista.some((x) => !x.nome)) return setErro(lista.length > 1 ? "Escreva o nome de cada pet." : "Escreva o nome do pet.");
    if (nomeTutor.length < 2) return setErro("Escreva o seu nome.");
    if (fone.length !== 10 && fone.length !== 11) return setErro("Confira o WhatsApp: DDD e número.");
    setErro(null);
    setEnviando(true);
    const { data, error } = await banco().rpc("link_pedir", {
      p_codigo: codigo, p_servico: servico.id, p_dia: dia, p_hora: horaEscolhida, p_tutor: nomeTutor, p_telefone: fone, p_pet: lista[0].nome,
      p_especie: lista[0].especie, p_porte: lista[0].porte ?? undefined, p_obs: obs.trim() || undefined,
      p_outros: lista.length > 1 ? lista.slice(1).map((x) => ({ nome: x.nome, especie: x.especie, porte: x.porte })) : undefined,
    });
    setEnviando(false);
    if (error) return setErro("Não consegui enviar agora. Confira a internet e tente de novo.");
    const r = data as unknown as { ok: boolean; erro?: string; id?: string } | null;
    if (r?.ok) {
      setEnviado({ id: r.id ?? null, servico: servico.nome, dia, pets: lista.map((x, i) => ({ nome: x.nome, hora: somaMin(horaEscolhida, servico.duracao_min * i) })) });
      setPasso("enviado");
      window.scrollTo({ top: 0 });
      return;
    }
    if (r?.erro === "ocupado") {
      setHoraEscolhida(null);
      setAvisoQuando(lista.length > 1 ? `Esse horário não comporta mais os ${lista.length} pets seguidos. Escolha outro, por favor.` : "Esse horário acabou de ser ocupado. Escolha outro, por favor.");
      ir("quando");
    } else if (r?.erro === "limite") {
      setLimite(true);
      setErro(`Não deu para enviar mais um pedido por aqui agora. Fale direto com o ${info.nome}.`);
    } else if (r?.erro === "fechado") {
      setInfo(null);
    } else if (r?.erro === "dados") {
      setErro("Confira o nome de cada pet, o seu nome e o WhatsApp com DDD.");
    } else {
      setErro("Algo deu errado. Tente de novo em instantes.");
    }
  }

  function pedirOutro() {
    setEnviado(null);
    setHoraEscolhida(null);
    setPets([novoPet()]);
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

  const zapLoja = linkWhatsApp(info.telefone, `Oi! Quero marcar um horário.`);
  const onde = [info.cidade, info.uf].filter(Boolean).join(" · ");
  const manha = (horarios ?? []).filter((h) => h < "12:00");
  const tarde = (horarios ?? []).filter((h) => h >= "12:00");
  const indice = PASSOS.findIndex((p) => p.id === passo);
  // pedido para hoje depois da hora de fechar: o dia não está cheio, já fechou
  const hojeFechou = dia === info.hoje && passouDoFechamento(info.horario, info.hoje);
  const fimEstimado = servico && horaEscolhida ? somaMin(horaEscolhida, servico.duracao_min * qtd) : null;

  return (
    <Moldura>
      <header className="g-lk-cab">
        <Marca tamanho={220} className="g-lk-cab-fundo" />
        <div className="g-lk-cab-quem">
          <LogoLoja nome={info.nome} logo={info.logo} tamanho={54} />
          <div>
            <h1>{info.nome}</h1>
            {onde && <p className="g-lk-onde"><MapPin aria-hidden />{onde}</p>}
          </div>
        </div>
        {passo !== "enviado" && <p className="g-lk-cab-frase">{estadia || (!info.servicos.length && (info.creche || info.hotel)) ? "Peça uma vaga por aqui" : info.creche || info.hotel ? "Peça um horário ou uma vaga por aqui" : "Peça um horário por aqui"}. A confirmação chega pelo seu WhatsApp.</p>}
      </header>

      {info.aviso && passo !== "enviado" && (
        <p className="g-lk-recado"><MessageCircle aria-hidden /><span>{info.aviso}</span></p>
      )}

      {estadia && (
        <EstadiaPeloLink key={estadia} codigo={codigo} tipo={estadia} hoje={info.hoje} loja={info.nome}
          zapLoja={linkWhatsApp(info.telefone, `Oi! Quero falar sobre uma vaga ${estadia === "hotel" ? "no hotel" : "na creche"}.`)}
          diaria={(estadia === "creche" ? info.creche?.diaria : info.hotel?.diaria) ?? null} aoVoltar={() => setEstadia(null)} />
      )}

      {!estadia && passo !== "enviado" && (
        <ol className="g-lk-passos" aria-label="Passos do pedido">
          {PASSOS.map((p, i) => (
            <li key={p.id} className={i < indice ? "feito" : i === indice ? "atual" : undefined} aria-current={i === indice ? "step" : undefined}>
              <i>{i < indice ? <Check aria-hidden /> : i + 1}</i><span>{p.rotulo}</span>
            </li>
          ))}
        </ol>
      )}

      {/* ---------- 1. serviço ---------- */}
      {!estadia && passo === "servico" && (
        <section className="g-lk-secao">
          <h2>O que o seu pet vai fazer?</h2>
          {(info.creche || info.hotel) && (
            <div className="g-lk-servicos" style={{ marginBottom: 12 }}>
              {info.creche && (
                <button type="button" className="g-lk-serv" style={{ "--cor": "#3b9bd9" } as React.CSSProperties} onClick={() => setEstadia("creche")}>
                  <i className="g-lk-serv-cor" aria-hidden><Sun /></i>
                  <span className="g-lk-serv-t"><b>Creche</b><span>Passar o dia{info.creche.diaria != null && <em>{brlCurto(Number(info.creche.diaria))} a diária</em>}</span></span>
                  <ArrowRight className="g-lk-serv-seta" aria-hidden />
                </button>
              )}
              {info.hotel && (
                <button type="button" className="g-lk-serv" style={{ "--cor": "#7c6bd6" } as React.CSSProperties} onClick={() => setEstadia("hotel")}>
                  <i className="g-lk-serv-cor" aria-hidden><BedDouble /></i>
                  <span className="g-lk-serv-t"><b>Hotel</b><span>Dormir com a gente{info.hotel.diaria != null && <em>{brlCurto(Number(info.hotel.diaria))} a diária</em>}</span></span>
                  <ArrowRight className="g-lk-serv-seta" aria-hidden />
                </button>
              )}
            </div>
          )}
          {!info.servicos.length ? (info.creche || info.hotel) ? null : (
            <div className="g-lk-vazio">
              <Scissors aria-hidden />
              <b>Nenhum serviço por aqui ainda</b>
              <p>Fale direto com {info.nome} para marcar o horário.</p>
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
      {!estadia && passo === "quando" && servico && (
        <section className="g-lk-secao">
          <button type="button" className="g-lk-escolhido" style={{ "--cor": servico.cor ?? "#f97316" } as React.CSSProperties} onClick={() => ir("servico")}>
            <i aria-hidden />
            <span><b>{servico.nome}</b> · {duracao(servico.duracao_min)}</span>
            <u>Trocar</u>
          </button>

          <div className="g-lk-bloco">
            <div className="g-lk-bloco-t"><h2 id="g-lk-qtd-t">Quantos pets vêm?</h2><span className="g-muted g-pp">até {MAX_PETS}</span></div>
            <div className="g-lk-opcoes quatro" role="group" aria-labelledby="g-lk-qtd-t">
              {Array.from({ length: MAX_PETS }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" className="g-lk-opcao g-lk-qtd" aria-pressed={qtd === n} aria-label={n === 1 ? "1 pet" : `${n} pets`} onClick={() => mudarQtd(n)}>{n}</button>
              ))}
            </div>
            {qtd > 1 && <p className="g-muted g-p">Os pets são atendidos um depois do outro. Só aparecem os horários em que cabem os {qtd} seguidos.</p>}
          </div>

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
            {!dias.some((d) => d.aberto) && <p className="g-muted g-p">{info.nome} não abre nos próximos dias. Fale direto pelo WhatsApp.</p>}
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
                  <button type="button" className="g-btn sec" onClick={() => void buscarHorarios(servico.id, dia, qtd)}>Tentar de novo</button>
                </div>
              ) : !horarios.length ? (
                <div className="g-lk-vazio">
                  <CalendarDays aria-hidden />
                  <b>{hojeFechou ? "Hoje já fechou" : dia === info.hoje ? (qtd > 1 ? `Não há mais horário hoje para ${qtd} pets seguidos` : "Não há mais horário hoje") : qtd > 1 ? `Não há horário para ${qtd} pets seguidos nesse dia` : "Esse dia já está cheio"}</b>
                  <p>{hojeFechou ? "O atendimento de hoje já terminou. Escolha outro dia aqui em cima." : qtd > 1 ? "Tente outro dia ou diminua a quantidade de pets aqui em cima." : "Tente outro dia aqui em cima."}</p>
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
                  {horaEscolhida && fimEstimado && (
                    <p className="g-lk-termino" aria-live="polite">
                      <Clock aria-hidden />
                      <span>{qtd > 1 ? `${qtd} pets, um depois do outro: começa às ${horaEscolhida} e termina por volta das ${fimEstimado}.` : `Começa às ${horaEscolhida} e termina por volta das ${fimEstimado}.`}</span>
                    </p>
                  )}
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
      {!estadia && passo === "dados" && servico && dia && horaEscolhida && (
        <form className="g-lk-secao" onSubmit={enviar} noValidate>
          <button type="button" className="g-lk-escolhido" style={{ "--cor": servico.cor ?? "#f97316" } as React.CSSProperties} onClick={() => ir("quando")}>
            <i aria-hidden />
            <span><b>{servico.nome}</b> · {diaPorExtenso(dia, info.hoje)}, {qtd > 1 ? `das ${horaEscolhida} às ${fimEstimado}` : `às ${horaEscolhida}`}</span>
            <u>Trocar</u>
          </button>

          <div className="g-lk-bloco g-form">
            <div className="g-lk-bloco-t"><h2>Quem vem?</h2>{qtd > 1 && <span className="g-muted g-pp">{qtd} pets</span>}</div>
            {qtd > 1 && <p className="g-muted g-p">O mesmo serviço vale para todos os pets deste pedido: {servico.nome}. Eles são atendidos um depois do outro, na ordem abaixo.</p>}
            {pets.map((x, i) => (
              <div key={x.id} className="g-lk-pet" role="group" aria-label={qtd > 1 ? `Pet ${i + 1}` : "Pet"}>
                {qtd > 1 && (
                  <div className="g-lk-pet-t">
                    <b>Pet {i + 1}</b>
                    <span>das {somaMin(horaEscolhida, servico.duracao_min * i)} às {somaMin(horaEscolhida, servico.duracao_min * (i + 1))}</span>
                    <button type="button" className="g-lk-pet-tira" onClick={() => removerPet(x.id)} aria-label={`Remover o pet ${i + 1}${x.nome.trim() ? `, ${x.nome.trim()}` : ""}`}><X aria-hidden />Remover</button>
                  </div>
                )}
                <label className="g-campo"><span>Nome do pet</span>
                  <input className="g-input" value={x.nome} maxLength={80} autoComplete="off" onChange={(e) => mudarPet(x.id, { nome: e.target.value })} />
                </label>
                <div className="g-campo">
                  <span>É um</span>
                  <div className="g-lk-opcoes tres">
                    {ESPECIES.map((e) => (
                      <button key={e.id} type="button" className="g-lk-opcao" aria-pressed={x.especie === e.id} onClick={() => mudarPet(x.id, { especie: e.id })}><e.icone />{e.rotulo}</button>
                    ))}
                  </div>
                </div>
                <div className="g-campo">
                  <span>Porte <small>(se souber)</small></span>
                  <div className="g-lk-opcoes quatro">
                    {PORTES.map((p) => (
                      <button key={p.id} type="button" className="g-lk-opcao porte" aria-pressed={x.porte === p.id} onClick={() => mudarPet(x.id, { porte: x.porte === p.id ? null : p.id })}>
                        <b>{p.id}</b><small>{p.rotulo}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {naoCabe && (
              <div className="g-lk-alerta" role="alert">
                <span>Às {horaEscolhida} não cabem {naoCabe} pets seguidos.</span>
                <button type="button" className="g-btn sec p" onClick={() => verHorariosPara(naoCabe)}>Ver horários para {naoCabe} pets</button>
              </div>
            )}
            {qtd < MAX_PETS ? (
              <button type="button" className="g-btn sec g-lk-pet-mais" disabled={conferindo} onClick={() => void adicionarPet()}><Plus />{conferindo ? "Conferindo o horário…" : "Adicionar outro pet"}</button>
            ) : (
              <p className="g-muted g-pp">Cabem até {MAX_PETS} pets por pedido.</p>
            )}
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
      {!estadia && passo === "enviado" && enviado && (
        <section className="g-lk-secao g-lk-ok" aria-live="polite">
          <span className="g-lk-ok-selo" aria-hidden><Check /></span>
          <h2>{enviado.pets.length > 1 ? `Pedido enviado para ${listaDeNomes(enviado.pets.map((x) => x.nome))}.` : "Pedido enviado."}</h2>
          <p>{info.nome} confirma com você pelo WhatsApp.</p>
          <dl className="g-lk-resumo">
            <div><dt>Serviço</dt><dd>{enviado.servico}{enviado.pets.length > 1 && <small> para cada pet</small>}</dd></div>
            <div><dt>Dia</dt><dd>{diaPorExtenso(enviado.dia, info.hoje)}</dd></div>
            {enviado.pets.length === 1 ? (
              <>
                <div><dt>Pet</dt><dd>{enviado.pets[0].nome}</dd></div>
                <div><dt>Hora</dt><dd>{enviado.pets[0].hora}</dd></div>
              </>
            ) : (
              <div>
                <dt>Pets</dt>
                <dd>
                  <ul className="g-lk-resumo-pets">
                    {enviado.pets.map((x, i) => <li key={i}><span>{x.nome}</span><b>{x.hora}</b></li>)}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
          <p className="g-lk-nota">{enviado.pets.length > 1 ? "Os horários ainda não estão marcados. Espere a confirmação pelo WhatsApp." : "O horário ainda não está marcado. Espere a confirmação pelo WhatsApp."}</p>
          <div className="g-lk-ok-acoes">
            {enviado.id && <a className="g-btn verde" href={`/gestao/agendar/${codigo}/pedido/${enviado.id}`}>Acompanhar o pedido</a>}
            <button type="button" className="g-btn sec" onClick={pedirOutro}>Pedir outro horário</button>
            {zapLoja && <a className="g-btn fantasma" href={zapLoja} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com {info.nome}</a>}
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
      <footer className="g-lk-rodape">
        <span><Marca tamanho={16} />Feito com Maestro Pet Gestão</span>
        <Link href="/gestao/privacidade" target="_blank">Privacidade</Link>
      </footer>
    </div>
  );
}
