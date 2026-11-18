"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, KeyRound, Link2, Search } from "lucide-react";
import { Esqueleto, Folha, mensagemDeErro, ok, useAvisos } from "@/components/gestao/ui";
import { PERIODOS, PLANOS, precoDe, type PeriodoId, type PlanoId } from "@/lib/gestao/planos";
import { banco } from "@/lib/gestao/supabase";
import { brl, dataCompleta, hora, semAcento } from "@/lib/gestao/util";

/** O mínimo de cada pet shop que esta aba usa (vem da lista do painel). */
export type LojaCakto = { id: string; nome: string; status: string; teste_ate: string; dono_email: string | null; dono_nome: string | null; cakto_email: string | null; cidade: string | null; uf: string | null };

type Config = {
  segredo_gestao: boolean; segredo_gestao_em: string | null;
  segredo_escola: boolean; segredo_escola_em: string | null;
  produto: string | null; aberta: boolean;
  ofertas: Record<string, string>; links: Record<string, string>; antigas: Record<string, string>;
};
type SemConta = { id: number; evento: string; email: string | null; recebido_em: string; oferta: string | null; assinatura: string | null; valor: number | null; plano: string | null; sem_prova?: string | null; sem_prova_nome?: string | null };

const MESES: Record<PeriodoId, number> = { mensal: 1, trimestral: 3, semestral: 6 };
const NOME_EVENTO: Record<string, string> = {
  purchase_approved: "Compra aprovada", subscription_created: "Assinatura criada", subscription_renewed: "Assinatura renovada",
  subscription_late_recovered: "Pagamento em dia de novo", subscription_resumed: "Assinatura reativada", subscription_late: "Pagamento atrasado",
  subscription_renewal_refused: "Renovação recusada", subscription_canceled: "Assinatura cancelada", subscription_paused: "Assinatura pausada",
  refund: "Reembolso", chargeback: "Contestação no cartão",
};
const quando = (d: string) => `${dataCompleta(new Date(d))} às ${hora(d)}`;
const nomePlanoMeses = (v: string | null) => {
  if (!v) return null;
  const [pl, m] = v.split(":");
  const p = PLANOS.find((x) => x.id === pl);
  const pe = PERIODOS.find((x) => x.meses === Number(m || 1));
  return p ? `${p.nome} ${pe?.nome.toLowerCase() ?? "mensal"}` : v;
};
/** Código da oferta que vem no fim do link (https://pay.cakto.com.br/a8BcHrY → a8BcHrY). */
const codigoDoLink = (link: string) => link.trim().match(/^https:\/\/pay\.cakto\.com\.br\/([A-Za-z0-9_-]{3,64})(?:[/?#]|$)/)?.[1] ?? "";

/**
 * Cakto no painel do administrador: a chave secreta de cada webhook (fica só o hash no banco), qual oferta é qual plano,
 * os links de pagamento da tela Assinatura, quando a assinatura abre e os pagamentos que chegaram com outro e-mail.
 */
export default function AbaCakto({ lojas, aoMudar }: { lojas: LojaCakto[]; aoMudar: () => Promise<void> }) {
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [soltos, setSoltos] = useState<SemConta[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ligando, setLigando] = useState<SemConta | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([banco().rpc("admin_cakto"), banco().rpc("admin_cakto_sem_conta")]);
      setCfg(ok(c) as unknown as Config);
      setSoltos((ok(s) as unknown as SemConta[]) ?? []);
      setErro(null);
    } catch (e) { setErro(mensagemDeErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const vencidos = useMemo(() => lojas.filter((l) => l.status === "teste" && new Date(l.teste_ate).getTime() <= Date.now()).length, [lojas]);

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!cfg) return <Esqueleto linhas={5} />;
  const comLink = Object.keys(cfg.links).length;

  async function abrir(sim: boolean) {
    const texto = sim
      ? `${comLink ? "" : "Ainda não há nenhum link de pagamento: ninguém vai conseguir assinar. "}A partir de agora, teste vencido deixa a conta só para consulta até a pessoa assinar.${vencidos ? ` Hoje ${vencidos === 1 ? "1 pet shop está" : `${vencidos} pet shops estão`} com o teste vencido e ${vencidos === 1 ? "fica" : "ficam"} só para consulta na hora (dá para dar mais 7 dias na ficha de cada um).` : ""}`
      : "O teste volta a não bloquear ninguém, mesmo vencido. Os botões de assinar continuam aparecendo se houver link.";
    if (!(await confirmar({ titulo: sim ? "Abrir a assinatura?" : "Fechar a assinatura?", texto, confirmar: sim ? "Abrir" : "Fechar" }))) return;
    try {
      ok(await banco().rpc("admin_cakto_abrir", { p_aberta: sim }));
      avisar(sim ? "Assinatura aberta." : "Assinatura fechada.");
      await carregar();
    } catch (e) { avisarErro(e); }
  }

  async function descartar(s: SemConta) {
    if (!(await confirmar({ titulo: "Tirar da lista?", texto: "Use para aviso de teste ou de outra compra. O aviso continua guardado em Avisos da Cakto.", confirmar: "Tirar" }))) return;
    try { ok(await banco().rpc("admin_cakto_descartar", { p_evento: s.id })); await carregar(); } catch (e) { avisarErro(e); }
  }

  return (
    <div className="g-pilha g">
      <section className="g-card g-pilha">
        <div>
          <h2>Chave secreta dos webhooks</h2>
          <p className="g-muted g-p">A Cakto manda essa chave em cada aviso de pagamento, e o sistema só aceita o aviso que traz a chave certa. Copie na Cakto (Integrações → Webhooks → o webhook → chave secreta) e cole aqui. O sistema guarda só uma impressão da chave: ninguém consegue ler de volta, nem a equipe Maestro Pet. Nunca mande essa chave por chat ou e-mail.</p>
        </div>
        <Segredo qual="gestao" titulo="Chave secreta do webhook da Cakto · Maestro Pet Gestão" feito={cfg.segredo_gestao} em={cfg.segredo_gestao_em} aoGravar={carregar} />
        <Segredo qual="escola" titulo="Chave secreta do webhook da Cakto · Escola e outros produtos" feito={cfg.segredo_escola} em={cfg.segredo_escola_em} aoGravar={carregar} />
        <p className="g-pp g-muted">O sistema aceita o aviso que chegar com qualquer uma das duas. Se a Cakto trocar a chave, cole a nova por cima.</p>
      </section>

      <TravaDoServidor />

      <section className="g-card g-pilha">
        <div className="g-fila entre">
          <div>
            <h2>Assinatura</h2>
            <p className="g-muted g-p">{cfg.aberta
              ? "Aberta: quem tem o teste vencido fica só para consulta até assinar."
              : "Fechada: o teste não bloqueia ninguém, mesmo vencido. Abra depois de colar os links e testar uma compra."}</p>
          </div>
          <span className={`g-tag ${cfg.aberta ? "verde" : "amarelo"}`}>{cfg.aberta ? "aberta" : "fechada"}</span>
        </div>
        <div><button className={`g-btn ${cfg.aberta ? "sec" : "verde"}`} onClick={() => void abrir(!cfg.aberta)}>{cfg.aberta ? "Fechar a assinatura" : "Abrir a assinatura"}</button></div>
      </section>

      <section className="g-pilha">
        <div>
          <h2>Planos e links de pagamento</h2>
          <p className="g-muted g-p">Cole o link de cada oferta (na Cakto: Produto → Ofertas → copiar link). O código da oferta sai sozinho do link. O botão Assinar da tela Assinatura passa a usar o link na hora, sem publicar o site de novo. {comLink} de 9 com link.</p>
        </div>
        <div className="g-grade c3">
          {PLANOS.flatMap((p) => PERIODOS.map((pe) => (
            <Oferta key={`${p.id}:${pe.id}`} plano={p.id} periodo={pe.id} nome={`${p.nome} ${pe.nome.toLowerCase()}`}
              oferta={cfg.ofertas[`${p.id}:${MESES[pe.id]}`] ?? ""} link={cfg.links[`${p.id}:${MESES[pe.id]}`] ?? ""} aoGravar={carregar} />
          )))}
        </div>
        {Object.keys(cfg.antigas).length > 0 && (
          <p className="g-pp g-muted">Ligações gravadas antes desta tela (continuam valendo para quem já assina): {Object.entries(cfg.antigas).map(([o, v]) => `${o} → ${nomePlanoMeses(v.includes(":") ? v : `${v}:1`)}`).join(" · ")}</p>
        )}
        <Produto atual={cfg.produto} aoGravar={carregar} />
      </section>

      <section className="g-pilha">
        <div>
          <h2>Pagamentos sem conta</h2>
          <p className="g-muted g-p">Pagamento que chegou com um e-mail que não é de nenhuma conta, ou para uma conta que já tem outra assinatura em dia (o sistema não troca a assinatura de ninguém sozinho). Confira com a pessoa qual é o pet shop e ligue: a assinatura passa a valer para ele e as próximas cobranças caem lá sozinhas.</p>
        </div>
        {!soltos.length ? <p className="g-muted g-p">Nenhum pagamento solto.</p> : (
          <div className="g-card g-lista" style={{ paddingBlock: 6 }}>
            {soltos.map((s) => (
              <div key={s.id} className="g-linha" style={{ flexWrap: "wrap" }}>
                <span className="t" style={{ minWidth: 0 }}>
                  <b style={{ overflowWrap: "anywhere" }}>{s.email ?? "sem e-mail"}</b>
                  <span>{NOME_EVENTO[s.evento] ?? s.evento}{nomePlanoMeses(s.plano) ? ` · ${nomePlanoMeses(s.plano)}` : s.oferta ? ` · oferta ${s.oferta}` : ""}{typeof s.valor === "number" ? ` · ${brl(s.valor)}` : ""}</span>
                  <span className="g-tab">{quando(s.recebido_em)}</span>
                  {s.sem_prova && <span className="g-pp">Este é o e-mail do dono de <b>{s.sem_prova_nome ?? "um pet shop"}</b>, mas ele ainda não provou que a caixa de entrada é dele (o cadastro não confirma e-mail). Confirme com o cliente antes de ligar. Se ele entrar pelo link do “Esqueci minha senha”, o pagamento liga sozinho.</span>}
                </span>
                <span className="g-fila" style={{ gap: 6 }}>
                  <button className="g-btn p verde" onClick={() => setLigando(s)}><Link2 />Ligar a um pet shop</button>
                  <button className="g-btn p fantasma" onClick={() => void descartar(s)}>Tirar da lista</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {ligando && <Ligar pagamento={ligando} lojas={lojas} aoFechar={() => setLigando(null)} aoLigar={async () => { setLigando(null); await carregar(); await aoMudar(); }} />}
    </div>
  );
}

function Segredo({ qual, titulo, feito, em, aoGravar }: { qual: "gestao" | "escola"; titulo: string; feito: boolean; em: string | null; aoGravar: () => Promise<void> }) {
  const { avisar, avisarErro } = useAvisos();
  const [valor, setValor] = useState("");
  const [indo, setIndo] = useState(false);
  async function gravar() {
    const v = valor.trim();
    if (v.length < 8) { avisar("Cole a chave inteira, como aparece na Cakto."); return; }
    setIndo(true);
    try {
      ok(await banco().rpc("admin_cakto_segredo", { p_qual: qual, p_segredo: v }));
      setValor("");
      avisar("Chave gravada.");
      await aoGravar();
    } catch (e) { avisarErro(e); } finally { setIndo(false); }
  }
  return (
    <div className="g-pilha p">
      <div className="g-fila entre">
        <b className="g-p" style={{ minWidth: 0 }}><KeyRound aria-hidden style={{ width: 16, height: 16, verticalAlign: "-3px", marginRight: 6 }} />{titulo}</b>
        <span className={`g-tag ${feito ? "verde" : "amarelo"}`}>{feito ? (em ? `configurada em ${dataCompleta(new Date(em))} às ${hora(em)}` : "configurada") : "não configurada"}</span>
      </div>
      <form className="g-fila" style={{ alignItems: "end", flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); void gravar(); }}>
        <label className="g-campo" style={{ flex: "1 1 240px" }}><span>{feito ? "Trocar a chave" : "Colar a chave"}</span>
          <input className="g-input" type="password" autoComplete="off" spellCheck={false} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="cole aqui a chave secreta" aria-label={titulo} />
        </label>
        <button className="g-btn sec" type="submit" disabled={indo || !valor.trim()}>{indo ? "Gravando…" : "Gravar chave"}</button>
      </form>
    </div>
  );
}

function Oferta({ plano, periodo, nome, oferta, link, aoGravar }: { plano: PlanoId; periodo: PeriodoId; nome: string; oferta: string; link: string; aoGravar: () => Promise<void> }) {
  const { avisar, avisarErro } = useAvisos();
  const [l, setL] = useState(link);
  const [o, setO] = useState(oferta);
  const [indo, setIndo] = useState(false);
  useEffect(() => { setL(link); setO(oferta); }, [link, oferta]);
  const mudou = l.trim() !== link || o.trim() !== oferta;
  const doLink = codigoDoLink(l);
  const naoBate = Boolean(doLink && o.trim() && doLink !== o.trim());
  const foraDaCakto = Boolean(l.trim() && !doLink);

  async function gravar() {
    setIndo(true);
    try {
      ok(await banco().rpc("admin_cakto_oferta", { p_plano: plano, p_meses: MESES[periodo], p_oferta: o.trim(), p_link: l.trim() }));
      avisar(l.trim() ? `${nome}: salvo.` : `${nome}: link tirado.`);
      await aoGravar();
    } catch (e) { avisarErro(e); } finally { setIndo(false); }
  }

  return (
    <div className="g-card g-pilha p">
      <div className="g-fila entre">
        <b>{nome}</b>
        <span className={`g-tag ${link ? "verde" : ""}`}>{link ? "com link" : "sem link"}</span>
      </div>
      <p className="g-pp g-muted">{brl(precoDe(plano, periodo))} {PERIODOS.find((x) => x.id === periodo)?.cada}. Confira se a oferta na Cakto tem o mesmo preço.</p>
      <label className="g-campo"><span>Link de pagamento</span>
        <input className="g-input" type="url" inputMode="url" spellCheck={false} value={l} placeholder="https://pay.cakto.com.br/…"
          onChange={(e) => { const v = e.target.value; setL(v); const c = codigoDoLink(v); if (c && (!o.trim() || o.trim() === codigoDoLink(l))) setO(c); }} />
      </label>
      <label className="g-campo"><span>Código da oferta</span>
        <input className="g-input" spellCheck={false} value={o} onChange={(e) => setO(e.target.value)} placeholder="sai do link" />
      </label>
      {naoBate && <p className="g-pp" style={{ color: "var(--vermelho, #b42318)" }}>O código não é o mesmo do fim do link ({doLink}). Confira qual é o certo.</p>}
      {foraDaCakto && <p className="g-pp g-muted">Esse link não é do checkout da Cakto (pay.cakto.com.br). Confira antes de salvar.</p>}
      <div className="g-fila">
        <button className="g-btn sec p" disabled={indo || !mudou} onClick={() => void gravar()}>{indo ? "Salvando…" : "Salvar"}</button>
        {link && <a className="g-btn fantasma p" href={link} target="_blank" rel="noopener noreferrer">Abrir<ExternalLink aria-hidden /></a>}
      </div>
    </div>
  );
}

function Produto({ atual, aoGravar }: { atual: string | null; aoGravar: () => Promise<void> }) {
  const { avisar, avisarErro } = useAvisos();
  const [v, setV] = useState(atual ?? "");
  useEffect(() => { setV(atual ?? ""); }, [atual]);
  async function gravar() {
    try {
      ok(await banco().rpc("admin_cakto_produto", { p_produto: v.trim() }));
      avisar(v.trim() ? "Produto gravado." : "Produto tirado.");
      await aoGravar();
    } catch (e) { avisarErro(e); }
  }
  return (
    <div className="g-card g-pilha p">
      <b>Produto Maestro Pet Gestão na Cakto</b>
      <p className="g-pp g-muted">Com o código do produto aqui, aviso de outro produto da conta (um guia, um material) nunca mexe na assinatura de um pet shop, mesmo que o e-mail seja de um dono. Na Cakto, é o código curto do produto ou o identificador longo.</p>
      <div className="g-fila" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <label className="g-campo" style={{ flex: "1 1 220px" }}><span>Código do produto</span>
          <input className="g-input" spellCheck={false} value={v} onChange={(e) => setV(e.target.value)} placeholder="ex.: 42bruPi" />
        </label>
        <button className="g-btn sec" disabled={v.trim() === (atual ?? "")} onClick={() => void gravar()}>Salvar</button>
      </div>
    </div>
  );
}

function Ligar({ pagamento, lojas, aoFechar, aoLigar }: { pagamento: SemConta; lojas: LojaCakto[]; aoFechar: () => void; aoLigar: () => Promise<void> }) {
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [busca, setBusca] = useState(pagamento.email?.split("@")[0] ?? "");
  const [indo, setIndo] = useState(false);
  const lista = useMemo(() => {
    const alvo = semAcento(busca.trim());
    return lojas.filter((l) => !alvo || [l.nome, l.dono_nome, l.dono_email, l.cakto_email, l.cidade].some((c) => semAcento(c ?? "").includes(alvo))).slice(0, 30);
  }, [lojas, busca]);

  async function ligar(l: LojaCakto) {
    if (!(await confirmar({ titulo: `Ligar a ${l.nome}?`, texto: `O pagamento de ${pagamento.email ?? "sem e-mail"} passa a valer para ${l.nome}${l.dono_email ? ` (${l.dono_email})` : ""}. As próximas cobranças dessa assinatura caem lá sozinhas.`, confirmar: "Ligar" }))) return;
    setIndo(true);
    try {
      const n = ok(await banco().rpc("admin_cakto_ligar", { p_evento: pagamento.id, p_petshop: l.id })) as number;
      avisar(n > 1 ? `Ligado. ${n} avisos aplicados a ${l.nome}.` : `Ligado a ${l.nome}.`);
      await aoLigar();
    } catch (e) { avisarErro(e); } finally { setIndo(false); }
  }

  return (
    <Folha titulo="Ligar a um pet shop" aoFechar={aoFechar}>
      <div className="g-pilha">
        <p className="g-p">{NOME_EVENTO[pagamento.evento] ?? pagamento.evento} de <b style={{ overflowWrap: "anywhere" }}>{pagamento.email ?? "sem e-mail"}</b>, em {quando(pagamento.recebido_em)}.</p>
        <div className="g-busca">
          <Search />
          <input className="g-input" type="search" placeholder="Nome do pet shop, do dono ou e-mail" aria-label="Buscar pet shop" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {!lista.length ? <p className="g-muted g-p">Nenhum pet shop com essa busca.</p> : (
          <div className="g-lista">
            {lista.map((l) => (
              <div key={l.id} className="g-linha">
                <span className="t" style={{ minWidth: 0 }}><b style={{ overflowWrap: "anywhere" }}>{l.nome}</b><span style={{ overflowWrap: "anywhere" }}>{l.dono_nome ?? "dono sem nome"}{l.dono_email ? ` · ${l.dono_email}` : ""}</span></span>
                <button className="g-btn p sec" disabled={indo} onClick={() => void ligar(l)}>Ligar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Folha>
  );
}

/**
 * Trava do servidor: o "Tirar dúvida" do link e o chat de venda contam o uso no banco por funções que qualquer pessoa
 * alcança com a chave pública. Com a trava ligada, o banco só aceita a contagem que vem do servidor (que manda um
 * segredo que só ele conhece). O botão pede ao servidor para gravar o segredo dele; o banco guarda só uma impressão.
 */
type EstadoDoServidor = { ligada: boolean; em: string | null; origem?: string | null; carencia_ate?: string | null; ia?: { canal: string; usado: number; teto: number }[] };
const NOME_CANAL: Record<string, string> = { mozart: "Mozart (chamadas à IA)", ajuda: "Ajuda (perguntas)", boletim: "Texto do boletim", link_ia: "Tirar dúvida do link", vendas: "Chat da página de vendas (24 h)", caderno: "Trazer do caderno (páginas)" };

function TravaDoServidor() {
  const { avisar, avisarErro } = useAvisos();
  const [estado, setEstado] = useState<EstadoDoServidor | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    const r = await banco().rpc("admin_servidor_estado");
    setEstado(r.error ? null : (r.data as unknown as EstadoDoServidor));
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  async function ligar() {
    setOcupado(true);
    try {
      const { data } = await banco().auth.getSession();
      const r = await fetch("/api/gestao/servidor", { method: "POST", headers: { authorization: `Bearer ${data.session?.access_token ?? ""}` } });
      const j = (await r.json().catch(() => null)) as { mensagem?: string } | null;
      if (!r.ok) throw new Error(j?.mensagem ?? "Não deu para gravar agora.");
      avisar("Trava do servidor ligada.");
      await carregar();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }
  if (!estado) return null;
  const carenciaVale = !!estado.carencia_ate && new Date(estado.carencia_ate) > new Date();
  return (
    <>
    <section className="g-card g-pilha">
      <div className="g-fila entre">
        <div>
          <h2>Trava do servidor</h2>
          <p className="g-muted g-p">{estado.ligada
            ? `Ligada${estado.em ? ` em ${quando(estado.em)}` : ""}. Só o sistema conta as perguntas do Tirar dúvida do link e as mensagens do chat de venda: ninguém gasta a cota de fora.`
            : carenciaVale
              ? `Desligada. Até ${quando(estado.carencia_ate as string)} o Tirar dúvida do link e o chat de venda seguem funcionando sem ela; depois dessa data eles param de responder com a inteligência artificial até a trava ser ligada. Ligue agora neste endereço.`
              : "Desligada, e o prazo acabou: o Tirar dúvida do link e o chat de venda não estão respondendo com a inteligência artificial. Ligue agora neste endereço."}</p>
          <p className="g-pp g-muted">{estado.ligada && estado.origem === "servidor" ? "O próprio sistema ligou a trava sozinho. " : ""}Se a chave da inteligência artificial for trocada no servidor, o sistema grava a trava nova sozinho quando tem a chave de serviço; se o Tirar dúvida parar de responder, toque aqui para gravar de novo.</p>
        </div>
        <span className={`g-tag ${estado.ligada ? "verde" : "amarelo"}`}>{estado.ligada ? "ligada" : "desligada"}</span>
      </div>
      <div><button className={`g-btn ${estado.ligada ? "sec" : "verde"}`} disabled={ocupado} onClick={() => void ligar()}>{ocupado ? "Um instante…" : estado.ligada ? "Gravar de novo" : "Ligar a trava"}</button></div>
    </section>
    {estado.ia && estado.ia.length > 0 && (
      <section className="g-card g-pilha" data-teste="teto-ia">
        <div>
          <h2>Teto de uso da inteligência artificial hoje</h2>
          <p className="g-muted g-p">Soma de todos os pet shops. Quando um canal chega ao teto, ele para até o dia seguinte e as pessoas leem um aviso simples; as telas seguem funcionando.</p>
        </div>
        <div className="g-pilha" style={{ gap: 6 }}>
          {estado.ia.map((c) => {
            const pct = c.teto > 0 ? Math.round((c.usado / c.teto) * 100) : 100;
            return (
              <div key={c.canal} className="g-linha" style={{ flexWrap: "wrap" }}>
                <span className="t" style={{ minWidth: 0 }}><b>{NOME_CANAL[c.canal] ?? c.canal}</b><span className="g-tab">{c.usado} de {c.teto}</span></span>
                <span className={`g-tag ${pct >= 100 ? "vermelho" : pct >= 50 ? "amarelo" : "verde"}`}>{pct >= 100 ? "no teto" : pct >= 50 ? `${pct}%: passou da metade` : `${pct}%`}</span>
              </div>
            );
          })}
        </div>
        <p className="g-pp g-muted">Os tetos ficam na configuração interna do banco (mozart_dia_geral, ajuda_dia_geral, boletim_dia_geral, link_ia_dia_geral, vendas_limite_dia, caderno_dia_geral). Peça à equipe técnica para mudar.</p>
      </section>
    )}
    </>
  );
}
