"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock, Link2, Mic, Minus, PawPrint, Plus, Scissors, Sparkles, Trash2, Users, X } from "lucide-react";
import type { Horario, Servico } from "@/lib/gestao/tipos";
import { vagasDe } from "@/lib/gestao/agenda";
import { GradeHorario, erroDoHorario, lerHorario } from "./ajustes/grade-horario";
import { useGestao } from "./contexto";
import { Selo } from "./marca";
import { Tile } from "./painel";
import { lerValor, valor2 } from "@/lib/gestao/util";
import { abrirAssistente, avisarMudanca, ok, useAvisos } from "./ui";
import "./guia-inicial.css";

/** Evento para abrir o guia de novo (botão em Meu pet shop). */
export const EVENTO_GUIA = "gestao:guia";
export const abrirGuia = () => window.dispatchEvent(new Event(EVENTO_GUIA));

const PASSOS = [
  { id: "horario", titulo: "Horário", icone: Clock },
  { id: "equipe", titulo: "Equipe e vagas", icone: Users },
  { id: "servicos", titulo: "Serviços e preços", icone: Scissors },
  { id: "link", titulo: "Link do cliente", icone: Link2 },
] as const;

const DIA = { abre: "08:00", fecha: "18:00" };
const MODELOS: { rotulo: string; horario: Horario }[] = [
  { rotulo: "Segunda a sexta", horario: { "1": DIA, "2": DIA, "3": DIA, "4": DIA, "5": DIA, "6": null, "0": null } },
  { rotulo: "Segunda a sábado", horario: { "1": DIA, "2": DIA, "3": DIA, "4": DIA, "5": DIA, "6": { abre: "08:00", fecha: "13:00" }, "0": null } },
  { rotulo: "Todos os dias", horario: { "1": DIA, "2": DIA, "3": DIA, "4": DIA, "5": DIA, "6": DIA, "0": DIA } },
];
const CORES = ["#4d8f6b", "#3b82a0", "#7c6fb0", "#b0563f", "#8a7a3a", "#a05a82", "#c9773f"];
const DURACOES = [15, 30, 45, 60, 90, 120, 150, 180];
const textoDuracao = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}`);
type Preco = Pick<Servico, "id" | "nome" | "cor" | "ativo" | "duracao_min" | "preco_p" | "preco_m" | "preco_g" | "preco_gg">;
const NOME_PORTE: Record<string, string> = { P: "pequeno", M: "médio", G: "grande", GG: "gigante" };

/** O que está errado no preço digitado (null = certo ou em branco). */
function erroDoPreco(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  if (!/^(R\$)?\s*-?[\d.,\s]+$/.test(t)) return "use só números";
  const n = lerValor(t);
  if (n == null) return "use só números";
  if (n < 0) return "não pode ser negativo";
  if (n > 99999) return "valor alto demais";
  return null;
}

/** Preço de um porte: guarda o texto, avisa o que está errado embaixo do campo e só passa adiante valor que vale. */
function CampoPreco({ porte, servico, valor, aoMudar }: { porte: string; servico: string; valor: number | null; aoMudar: (v: number | null, erro: string | null) => void }) {
  const [texto, setTexto] = useState(valor == null ? "" : valor2(valor));
  const erro = erroDoPreco(texto);
  return (
    <label>
      <span>{porte}</span>
      <input className={`g-input g-tab${erro ? " ruim" : ""}`} inputMode="decimal" placeholder="R$" value={texto} aria-invalid={!!erro}
        aria-label={`${servico}, porte ${NOME_PORTE[porte] ?? porte}`}
        onChange={(e) => { setTexto(e.target.value); const ruim = erroDoPreco(e.target.value); aoMudar(ruim ? null : lerValor(e.target.value), ruim); }}
        onBlur={() => { if (!erro && texto.trim()) { const n = lerValor(texto); if (n != null) setTexto(valor2(n)); } }} />
      {erro && <small className="erro" role="alert">{erro}</small>}
    </label>
  );
}

/**
 * Guia da primeira vez: horário, quem atende e quantas vagas, serviços com preço e o link do cliente.
 * Cada passo grava ao continuar. O que é definido aqui regula a agenda, o link de agendamento e o Mozart.
 * Aparece sozinho para o dono enquanto `petshops.guia_feito_em` está vazio; depois, só pelo botão em Meu pet shop.
 */
export default function GuiaInicial() {
  const { sb, petshop, eu, equipe, servicos, souDono, liberado, recarregarBase } = useGestao();
  const { avisarErro } = useAvisos();
  // aberto desde a primeira entrada (guia ainda não feito) ou pelo botão em Meu pet shop; fica aberto até a pessoa fechar
  const [forcado, setForcado] = useState(() => !petshop.guia_feito_em);
  const [passo, setPasso] = useState(-1); // -1 = boas-vindas; PASSOS.length = pronto
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [horario, setHorario] = useState<Horario>(() => lerHorario(petshop.horario));
  const [euAtendo, setEuAtendo] = useState(eu.atende);
  const [novos, setNovos] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [vagas, setVagas] = useState<number | null>(petshop.vagas ?? null);
  const [precos, setPrecos] = useState<Preco[]>(() => servicos.filter((s) => !["creche", "hotel"].includes(s.categoria)).map((s) => ({ ...s })));
  const [linkLigado, setLinkLigado] = useState(petshop.link_ativo);
  const [errosPreco, setErrosPreco] = useState<Record<string, string>>({});
  const corpo = useRef<HTMLDivElement>(null);
  // o erro aparece junto do botão; se o campo errado ficou fora da tela, rola até ele
  useEffect(() => {
    if (!erro) return;
    const ruim = corpo.current?.querySelector<HTMLElement>(".ruim, [aria-invalid='true']");
    ruim?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [erro]);

  useEffect(() => {
    const abrir = () => { setPasso(-1); setForcado(true); };
    window.addEventListener(EVENTO_GUIA, abrir);
    return () => window.removeEventListener(EVENTO_GUIA, abrir);
  }, []);

  const visivel = souDono && liberado && forcado;
  useEffect(() => {
    if (!visivel) return;
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => { document.documentElement.style.overflow = antes; };
  }, [visivel]);
  if (!visivel) return null;

  const outros = equipe.filter((p) => p.ativo && p.atende && p.id !== eu.id);
  const atendem = (euAtendo ? 1 : 0) + outros.length + novos.length;
  const vagasAgora = vagas ?? Math.max(1, atendem);
  const primeiro = eu.nome.split(" ")[0];

  async function concluir() {
    try { ok(await sb.from("petshops").update({ guia_feito_em: new Date().toISOString() }).eq("id", petshop.id).select("id")); await recarregarBase(); }
    catch (e) { avisarErro(e); }
  }
  async function fechar() {
    setForcado(false);
    if (!petshop.guia_feito_em) await concluir();
  }
  function juntarNome() {
    const n = nome.trim();
    if (n.length < 2) return;
    setNovos((l) => [...l, n.slice(0, 60)]);
    setNome("");
  }

  async function continuar() {
    setErro(null);
    setSalvando(true);
    try {
      const id = PASSOS[passo]?.id;
      if (id === "horario") {
        const ruim = erroDoHorario(horario);
        if (ruim) { setErro(ruim); return; }
        if (!Object.values(horario).some(Boolean)) { setErro("Marque pelo menos um dia em que o pet shop abre."); return; }
        ok(await sb.from("petshops").update({ horario }).eq("id", petshop.id).select("id"));
      }
      if (id === "equipe") {
        const pendente = nome.trim().length >= 2 ? [...novos, nome.trim().slice(0, 60)] : novos;
        if (!euAtendo && !outros.length && !pendente.length) { setErro("Diga quem atende os pets: você, alguém da equipe ou os dois."); return; }
        if (euAtendo !== eu.atende) ok(await sb.from("profissionais").update({ atende: euAtendo }).eq("id", eu.id).eq("petshop_id", petshop.id).select("id"));
        if (pendente.length) {
          ok(await sb.from("profissionais").insert(pendente.map((n, i) => ({ petshop_id: petshop.id, nome: n, papel: "funcionario" as const, funcao: "Banhista e tosador(a)", atende: true, cor: CORES[(outros.length + i) % CORES.length] }))).select("id"));
          setNovos([]); setNome("");
        }
        ok(await sb.from("petshops").update({ vagas: vagasAgora }).eq("id", petshop.id).select("id"));
        setVagas(vagasAgora);
      }
      if (id === "servicos") {
        if (!precos.some((s) => s.ativo)) { setErro("Deixe pelo menos um serviço ligado."); return; }
        const comErro = precos.find((s) => s.ativo && Object.keys(errosPreco).some((k) => k.startsWith(`${s.id}:`)));
        if (comErro) { setErro(`Confira o preço de ${comErro.nome}: use só números, sem valor negativo.`); return; }
        if (precos.some((s) => s.ativo && [s.preco_p, s.preco_m, s.preco_g, s.preco_gg].some((v) => v != null && v < 0))) { setErro("O preço não pode ser negativo."); return; }
        for (const s of precos) {
          const antes = servicos.find((x) => x.id === s.id);
          if (!antes) continue;
          const mudou = antes.ativo !== s.ativo || antes.duracao_min !== s.duracao_min || antes.preco_p !== s.preco_p || antes.preco_m !== s.preco_m || antes.preco_g !== s.preco_g || antes.preco_gg !== s.preco_gg;
          if (mudou) ok(await sb.from("servicos").update({ ativo: s.ativo, duracao_min: s.duracao_min, preco_p: s.preco_p, preco_m: s.preco_m, preco_g: s.preco_g, preco_gg: s.preco_gg }).eq("id", s.id).eq("petshop_id", petshop.id).select("id"));
        }
      }
      if (id === "link") {
        if (linkLigado !== petshop.link_ativo) ok(await sb.from("petshops").update({ link_ativo: linkLigado }).eq("id", petshop.id).select("id"));
        ok(await sb.from("petshops").update({ guia_feito_em: new Date().toISOString() }).eq("id", petshop.id).select("id"));
      }
      await recarregarBase();
      avisarMudanca();
      setPasso((p) => p + 1);
    } catch (e) { avisarErro(e); } finally { setSalvando(false); }
  }

  const mudarPreco = (id: string, campos: Partial<Preco>) => setPrecos((l) => l.map((s) => (s.id === id ? { ...s, ...campos } : s)));
  const fim = passo >= PASSOS.length;

  return (
    <div className="g-guia" role="dialog" aria-modal="true" aria-label="Guia de configuração">
      <div className="g-guia-caixa">
        <header className="g-guia-topo">
          <Selo tamanho={36} tom="verde" />
          <div className="g-guia-trilho" aria-hidden>
            {PASSOS.map((p, i) => <span key={p.id} className={i < passo ? "feito" : i === passo ? "agora" : ""}><i /></span>)}
          </div>
          <button className="g-ico" onClick={() => void fechar()} aria-label="Fechar o guia" title={petshop.guia_feito_em ? "Fechar" : "Fazer depois"}><X /></button>
        </header>

        <div className="g-guia-corpo" ref={corpo}>
          {passo === -1 && (
            <div className="g-guia-ola">
              <p className="g-rotulo">Guia rápido · 3 minutos</p>
              <h1>{primeiro}, vamos deixar o <em className="it">{petshop.nome}</em> pronto.</h1>
              <p className="g-muted">São quatro perguntas. O que você responder aqui regula a agenda, o link do cliente e o Mozart, o seu assistente de inteligência artificial. Dá para mudar tudo depois.</p>
              <ol className="g-guia-lista">
                {PASSOS.map((p, i) => <li key={p.id}><Tile icone={p.icone} tom={(["pessego", "lilas", "menta", "ceu"] as const)[i]} /><span><b>{p.titulo}</b><small>{["Os dias e horas em que vocês abrem.", "Quem atende e quantos pets ao mesmo tempo.", "O que vocês fazem, quanto dura e quanto custa.", "Para o cliente pedir horário pelo celular."][i]}</small></span></li>)}
              </ol>
            </div>
          )}

          {passo === 0 && (
            <div className="g-pilha">
              <div><p className="g-rotulo">Passo 1 de 4</p><h2 className="g-guia-h">Quando o pet shop abre?</h2><p className="g-muted g-p">A agenda só oferece horário dentro desses dias e horas.</p></div>
              <div className="g-chips">
                {MODELOS.map((m) => <button key={m.rotulo} type="button" className="g-chip" onClick={() => setHorario(lerHorario(m.horario))}>{m.rotulo}</button>)}
              </div>
              <GradeHorario valor={horario} aoMudar={setHorario} />
            </div>
          )}

          {passo === 1 && (
            <div className="g-pilha">
              <div><p className="g-rotulo">Passo 2 de 4</p><h2 className="g-guia-h">Quem atende os pets?</h2><p className="g-muted g-p">Quem aparece na agenda para receber os horários: banho, tosa e o que mais vocês fizerem. Só o nome basta; login e permissões ficam para depois, em Equipe.</p></div>
              <div className="g-guia-gente">
                <label className={`g-guia-pessoa${euAtendo ? " on" : ""}`}>
                  <input type="checkbox" checked={euAtendo} onChange={(e) => setEuAtendo(e.target.checked)} />
                  <span><b>{eu.nome}</b><small>Você {euAtendo ? "atende" : "não atende"} na agenda</small></span>
                </label>
                {outros.map((p) => <div key={p.id} className="g-guia-pessoa on fixa"><Check /><span><b>{p.nome}</b><small>Já está na equipe</small></span></div>)}
                {novos.map((n, i) => (
                  <div key={`${n}${i}`} className="g-guia-pessoa on fixa"><Check /><span><b>{n}</b><small>Entra na equipe ao continuar</small></span>
                    <button type="button" className="g-ico" aria-label={`Tirar ${n}`} onClick={() => setNovos((l) => l.filter((_, k) => k !== i))}><Trash2 /></button>
                  </div>
                ))}
              </div>
              <div className="g-guia-juntar">
                <input className="g-input" value={nome} placeholder="Nome de quem mais atende" onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); juntarNome(); } }} />
                <button type="button" className="g-btn sec" onClick={juntarNome} disabled={nome.trim().length < 2}><Plus />Adicionar</button>
              </div>

              <div className="g-guia-vagas">
                <div>
                  <h3>Quantos pets vocês atendem ao mesmo tempo?</h3>
                  <p className="g-muted g-p">{vagasAgora === 1 ? "Com 1, cada horário aceita um pet só." : `Com ${vagasAgora}, o mesmo horário aceita até ${vagasAgora} pets.`} Conte as mesas ou banheiras, não só as pessoas.</p>
                </div>
                <div className="g-guia-conta">
                  <button type="button" className="g-ico" aria-label="Menos" disabled={vagasAgora <= 1} onClick={() => setVagas(Math.max(1, vagasAgora - 1))}><Minus /></button>
                  <b className="g-num">{vagasAgora}</b>
                  <button type="button" className="g-ico" aria-label="Mais" disabled={vagasAgora >= 20} onClick={() => setVagas(Math.min(20, vagasAgora + 1))}><Plus /></button>
                </div>
              </div>
            </div>
          )}

          {passo === 2 && (
            <div className="g-pilha">
              <div><p className="g-rotulo">Passo 3 de 4</p><h2 className="g-guia-h">O que vocês fazem e quanto custa?</h2><p className="g-muted g-p">O preço por porte aparece sozinho ao marcar um horário. Pode deixar em branco e preencher depois; outros serviços você cria em Meu pet shop. Creche e hotel têm o preço da diária e as vagas em Meu pet shop.</p></div>
              <p className="g-guia-legenda"><b>P</b> = pequeno · <b>M</b> = médio · <b>G</b> = grande · <b>GG</b> = gigante</p>
              <div className="g-guia-servicos">
                {precos.map((s) => (
                  <section key={s.id} className={`g-guia-servico${s.ativo ? "" : " off"}`} style={{ "--cor": s.cor } as React.CSSProperties}>
                    <div className="cabeca">
                      <i aria-hidden />
                      <b>{s.nome}</b>
                      <select className="g-select" aria-label={`Duração de ${s.nome}`} value={s.duracao_min} disabled={!s.ativo} onChange={(e) => mudarPreco(s.id, { duracao_min: Number(e.target.value) })}>
                        {[...new Set([...DURACOES, s.duracao_min])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{textoDuracao(m)}</option>)}
                      </select>
                      <button type="button" role="switch" aria-checked={s.ativo} aria-label={`${s.nome} ligado`} className="g-guia-chave" onClick={() => mudarPreco(s.id, { ativo: !s.ativo })}><i /></button>
                    </div>
                    {s.ativo && (
                      <div className="precos">
                        {(["preco_p", "preco_m", "preco_g", "preco_gg"] as const).map((c) => (
                          <CampoPreco key={c} porte={c.replace("preco_", "").toUpperCase()} servico={s.nome} valor={s[c]}
                            aoMudar={(v, ruim) => {
                              mudarPreco(s.id, { [c]: v });
                              setErro(null);
                              setErrosPreco((m) => { const n = { ...m }; if (ruim) n[`${s.id}:${c}`] = ruim; else delete n[`${s.id}:${c}`]; return n; });
                            }} />
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </div>
          )}

          {passo === 3 && (
            <div className="g-pilha">
              <div><p className="g-rotulo">Passo 4 de 4</p><h2 className="g-guia-h">Quer que o cliente peça horário pelo celular?</h2><p className="g-muted g-p">Você manda um link. O cliente vê só os horários livres, conforme o que você acabou de configurar, e envia o pedido. Nada é marcado sem você aceitar.</p></div>
              <button type="button" className={`g-guia-opcao${linkLigado ? " on" : ""}`} onClick={() => setLinkLigado(true)}>
                <Tile icone={Link2} tom="pessego" /><span><b>Sim, ligar o link</b><small>Fica em "Mandar link de agendamento", na tela inicial.</small></span>{linkLigado && <Check />}
              </button>
              <button type="button" className={`g-guia-opcao${!linkLigado ? " on" : ""}`} onClick={() => setLinkLigado(false)}>
                <Tile icone={CalendarDays} tom="menta" /><span><b>Agora não</b><small>Só a equipe marca. Dá para ligar depois.</small></span>{!linkLigado && <Check />}
              </button>
            </div>
          )}

          {fim && (
            <div className="g-guia-ola">
              <span className="g-guia-ok"><Check /></span>
              <h1>Tudo pronto, <em className="it">{primeiro}</em>.</h1>
              <ul className="g-guia-resumo">
                <li><Clock /><span>Aberto em {Object.values(lerHorario(petshop.horario)).filter(Boolean).length} dias da semana</span></li>
                <li><Users /><span>{vagasDe(petshop, equipe) === 1 ? "1 pet por horário" : `Até ${vagasDe(petshop, equipe)} pets no mesmo horário`}</span></li>
                <li><Scissors /><span>{(() => { const n = servicos.filter((s) => s.ativo && !["creche", "hotel"].includes(s.categoria)).length; return n === 1 ? "1 serviço na agenda" : `${n} serviços na agenda`; })()}</span></li>
                <li><Link2 /><span>Link do cliente {petshop.link_ativo ? "ligado" : "desligado"}</span></li>
              </ul>
              <p className="g-muted">Agora é usar. Por onde quer começar?</p>
              <div className="g-guia-proximos">
                <Link className="g-btn pri" href="/gestao/app/clientes" onClick={() => setForcado(false)}><PawPrint />Cadastrar o primeiro pet</Link>
                <Link className="g-btn sec" href="/gestao/app/agenda?novo=1" onClick={() => setForcado(false)}><CalendarDays />Marcar um horário</Link>
                <button className="g-btn sec" onClick={() => { setForcado(false); abrirAssistente(); }}><Mic />Falar com o Mozart</button>
              </div>
            </div>
          )}

        </div>

        {erro && <p className="g-erro g-guia-erro" role="alert">{erro}</p>}
        <footer className="g-guia-pe">
          {passo === -1 ? (
            <>
              <button className="g-btn fantasma" onClick={() => void fechar()}>Fazer depois</button>
              <button className="g-btn pri" onClick={() => setPasso(0)}>Começar<ArrowRight /></button>
            </>
          ) : fim ? (
            <button className="g-btn verde" onClick={() => setForcado(false)}><Sparkles />Ir para a tela inicial</button>
          ) : (
            <>
              <button className="g-btn fantasma" onClick={() => { setErro(null); setPasso((p) => p - 1); }} disabled={salvando}><ArrowLeft />Voltar</button>
              <button className="g-btn pri" onClick={() => void continuar()} disabled={salvando}>{salvando ? "Salvando…" : passo === PASSOS.length - 1 ? "Concluir" : "Continuar"}<ArrowRight /></button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
