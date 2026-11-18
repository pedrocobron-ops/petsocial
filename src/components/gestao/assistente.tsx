"use client";

import { Selo } from "./marca";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CheckCheck, ChevronDown, MessageCircle, RotateCcw, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import { hora, isoDia } from "@/lib/gestao/util";
import Link from "@/components/gestao/link-depois";
import { useGestao } from "./contexto";
import { avisarMudanca, semInternet } from "./ui";
import { textoDeRede } from "@/lib/gestao/validacao";
import { BotaoMic, EscolherVoz, FaixaVoz, falar, falarAosPoucos, guardarEnviarSozinho, guardarLerRespostas, lerEnviarSozinho, lerLerRespostas, pararDeFalar, SEM_VOZ, temLeitura, useDitado, useVozes } from "./voz";
import { TextoMozart } from "./texto-mozart";
import { chaveDaConversa, guardarConversa, lerConversa } from "@/lib/gestao/assistente/guardada";
import { semNomesDeFerramenta } from "@/lib/gestao/assistente/sem-nomes";
import { usaModulo } from "@/lib/gestao/modulos";

type Resumo = { titulo: string; linhas: [string, string][] };
type Proposta = { id: string; ferramenta: string; resumo: Resumo; estado: "pendente" | "sim" | "nao" };
type LinkZap = { nome: string; texto: string; url: string };
type Item =
  | { tipo: "eu" | "ele" | "erro"; texto: string; quando?: string; saidas?: boolean; jaVisto?: boolean; interrompida?: boolean; repetir?: string }
  | { tipo: "propostas"; lista: Proposta[]; enviado: boolean }
  | { tipo: "links"; lista: LinkZap[] };
type Resposta = { mensagens: unknown[]; texto: string; propostas: Omit<Proposta, "estado">[]; parciais: unknown[]; links: LinkZap[]; mudou: boolean; erro?: string; mensagem?: string };
/** Um evento da resposta que chega aos poucos (uma linha JSON cada): texto, o que ele está fazendo, e o fim com tudo. */
type Evento = { t: "texto"; d: string } | { t: "progresso"; frase: string } | ({ t: "fim"; status: number } & Partial<Resposta>);

/** Lê a resposta aos poucos: chama `aoEvento` a cada linha e devolve o evento "fim" (null se a conexão caiu antes). */
async function lerAosPoucos(r: Response, aoEvento: (e: Evento) => void): Promise<Extract<Evento, { t: "fim" }> | null> {
  const leitor = r.body!.getReader();
  const dec = new TextDecoder();
  let resto = "";
  let fim: Extract<Evento, { t: "fim" }> | null = null;
  const linha = (l: string) => {
    if (!l.trim()) return;
    let e: Evento;
    try { e = JSON.parse(l) as Evento; } catch { return; }
    if (e.t === "fim") fim = e; else aoEvento(e);
  };
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    let i = resto.indexOf("\n");
    while (i >= 0) { linha(resto.slice(0, i)); resto = resto.slice(i + 1); i = resto.indexOf("\n"); }
  }
  linha(resto + dec.decode());
  return fim;
}

/**
 * A conversa continua enquanto o aplicativo está aberto, mesmo fechando e abrindo o painel, e volta depois de recarregar a
 * página (guardada na aba: `assistente/guardada.ts`). `decidindo`: um "Pode fazer" foi mandado e a resposta não chegou;
 * `esperando`: um pedido de texto foi mandado e a resposta não chegou.
 */
type Decidindo = { decisoes: { id: string; ok: boolean }[]; parciais: unknown[] };
const memoria: { chave: string | null; itens: Item[]; mensagens: unknown[]; parciais: unknown[]; decidindo: Decidindo | null; esperando: boolean } = { chave: null, itens: [], mensagens: [], parciais: [], decidindo: null, esperando: false };
/** A página está saindo (recarregar, fechar a aba): o que estava no meio do caminho fica guardado como estava. */
let saindo = false;
/** O painel está aberto agora (volta aberto depois de recarregar). */
let painelAberto = false;
/** O texto da resposta que está chegando agora (vai junto quando a página sai no meio: volta marcada como interrompida). */
let textoAoVivo = "";
function persistir(aberta = painelAberto) {
  if (!memoria.chave || saindo) return;
  const noMeio = memoria.esperando || Boolean(memoria.decidindo);
  guardarConversa(memoria.chave, { itens: memoria.itens, mensagens: memoria.mensagens, parciais: memoria.parciais, decidindo: memoria.decidindo, esperando: memoria.esperando, aberta, interrompida: noMeio && textoAoVivo.trim() ? textoAoVivo : null });
}
if (typeof window !== "undefined") {
  // guarda uma última vez (com o texto que já tinha chegado) e para de guardar: o que estava no meio fica como estava
  const sair = () => { if (saindo) return; if (textoAoVivo) persistir(); saindo = true; };
  window.addEventListener("pagehide", sair); window.addEventListener("beforeunload", sair);
  // no celular, trocar de aplicativo dispara "pagehide" e a página pode voltar sem recarregar (cache do navegador): volta a
  // guardar, senão a conversa seguinte não ficava guardada e sumia no próximo recarregar
  window.addEventListener("pageshow", (e) => { if (e.persisted) saindo = false; });
}

/** Sugestões do começo da conversa, pelo que o pet shop faz (loja só de creche ou de hotel não lê "Marca banho"). */
function sugestoesPara(p: { modulos?: string[] | null }, dinheiro: boolean, posso: (a: "agenda" | "creche_hotel" | "clientes") => boolean = () => true) {
  // só o que a pessoa pode fazer: quem não tem a Agenda não lê "Marca banho" (o Mozart recusaria)
  const banho = usaModulo(p, "banho_tosa") && posso("agenda"), creche = usaModulo(p, "creche") && posso("creche_hotel"), hotel = usaModulo(p, "hotel") && posso("creche_hotel");
  const l: string[] = [];
  if (banho || (!creche && !hotel && posso("agenda"))) l.push("Marca banho da Mel sexta às 10h", "Que horários tenho livres amanhã?");
  if (creche) l.push(banho ? "Quem vem na creche amanhã?" : "Coloca a Mel na creche sexta", "Quem vem na creche amanhã?");
  if (hotel) l.push(creche || banho ? "Quem está no hotel hoje?" : "Reserva o hotel do Thor de sexta a domingo", "Quem está no hotel hoje?");
  const unicas = [...new Set(l)].slice(0, 2);
  if (dinheiro) unicas.push(hotel ? "Quanto recebi de sinal este mês?" : "Quanto entrou essa semana?");
  if (posso("clientes")) unicas.push("Quem não vem há mais de um mês?");
  return unicas;
}

/** Painel do Mozart: a pessoa fala ou escreve, ele mostra o que vai fazer e só grava depois do Confirmar. */
export default function Assistente({ pedidoInicial, aoFechar }: { pedidoInicial?: string; aoFechar: () => void }) {
  const { sb, petshop, eu, user, posso, cuidoDoFinanceiro: vejoFinanceiro } = useGestao();
  const chaveGuardada = chaveDaConversa(petshop.id, user.id);
  if (memoria.chave !== chaveGuardada) {
    // outro pet shop ou outra pessoa: a conversa desta aba (a de antes de recarregar, se houver)
    const g = lerConversa<Item>(chaveGuardada);
    Object.assign(memoria, { chave: chaveGuardada, itens: g?.itens ?? [], mensagens: g?.mensagens ?? [], parciais: g?.parciais ?? [], decidindo: g?.decidindo ?? null, esperando: false });
    // o pedido tinha ido e a página recarregou antes da resposta: mostra o que já tinha chegado, marcado como interrompido,
    // e oferece perguntar de novo (não manda sozinho: cada pedido conta). Um "Pode fazer" no meio termina sozinho (abaixo).
    if (g?.esperando && !g.decidindo) {
      const pedido = [...memoria.itens].reverse().find((i) => i.tipo === "eu");
      const repetir = pedido && pedido.tipo === "eu" ? pedido.texto : undefined;
      if (g.interrompida) memoria.itens = [...memoria.itens, { tipo: "ele", texto: g.interrompida, interrompida: true }];
      memoria.itens = [...memoria.itens, { tipo: "erro", texto: g.interrompida
        ? "A página recarregou antes de o Mozart terminar: a resposta acima ficou pela metade."
        : "A página recarregou antes da resposta do Mozart.", repetir }];
    }
  }
  const [itens, setItens] = useState<Item[]>(memoria.itens);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  // a resposta que está chegando: o texto até aqui e a frase do que o Mozart está fazendo ("Procurando Thor…")
  const [aoVivo, setAoVivo] = useState<{ texto: string; frase: string | null } | null>(null);
  // os pedaços chegam muito rápido: a tela junta e desenha uma vez por quadro
  // quando o texto chega em pedaços grandes, a bolha mostra de pouco em pouco (palavra por palavra), sem atrasar mais que ~1 s
  const vivo = useRef({ texto: "", mostrado: 0, frase: null as string | null, ativo: false, marcado: false });
  const mostrarVivo = () => {
    if (vivo.current.marcado) return;
    vivo.current.marcado = true;
    const desenhar = () => {
      const v = vivo.current;
      v.marcado = false;
      if (!v.ativo) return;
      const falta = v.texto.length - v.mostrado;
      if (falta > 0) {
        // um pouco por quadro, até o fim da palavra; quanto mais falta, mais rápido (alcança em uns 15 quadros)
        let ate = Math.min(v.texto.length, v.mostrado + Math.max(3, Math.ceil(falta / 15)));
        const espaco = v.texto.slice(ate).search(/\s/);
        if (espaco >= 0 && espaco < 12) ate += espaco;
        v.mostrado = Math.min(v.texto.length, ate);
      }
      setAoVivo({ texto: v.texto.slice(0, v.mostrado), frase: v.frase });
      if (v.mostrado < v.texto.length) mostrarVivo();
    };
    if (typeof requestAnimationFrame === "function" && document.visibilityState === "visible") requestAnimationFrame(desenhar); else window.setTimeout(desenhar, 50);
  };
  /** Espera a bolha ao vivo terminar de mostrar o texto (no máximo 1,2 s) antes de trocar pela resposta final. */
  const esperarMostrar = async () => {
    const ate = Date.now() + 1200;
    while (vivo.current.ativo && vivo.current.mostrado < vivo.current.texto.length && Date.now() < ate && document.visibilityState === "visible") await new Promise((ok) => setTimeout(ok, 30));
  };
  // escrito enquanto o Mozart ainda respondia: espera na fila (visível) e vai sozinho quando ele terminar
  const [fila, setFila] = useState<string | null>(null);
  const [avisoFila, setAvisoFila] = useState<string | null>(null);
  const respondidos = useRef(new Set<string>());
  // voz: depois de falar, o texto fica 2 s na caixa ("Enviando… · Editar") para corrigir uma palavra mal ouvida
  const caixa = useRef<HTMLTextAreaElement>(null);
  const [contagem, setContagem] = useState<number | null>(null);
  const relogioEnvio = useRef<number | undefined>(undefined);
  const [enviarSozinho, setEnviarSozinho] = useState(lerEnviarSozinho);
  const [lerRespostas, setLerRespostas] = useState(lerLerRespostas);
  const lerAgora = useRef(lerRespostas);
  lerAgora.current = lerRespostas;
  const [ajustesVoz, setAjustesVoz] = useState(false);
  const [lendo, setLendo] = useState<number | null>(null);
  const [temLeituraAqui, setTemLeituraAqui] = useState(false);
  const vozes = useVozes();
  // o aparelho tem vozes, mas nenhuma em português: o alto-falante some e "Voz" mostra como instalar
  const semVozPt = vozes.total > 0 && vozes.pt.length === 0;
  const podeLer = temLeituraAqui && !semVozPt;
  const fim = useRef<HTMLDivElement>(null);
  const jaPediu = useRef(false);

  const guardar = (novos: Item[]) => { memoria.itens = novos; setItens(novos); persistir(); };
  const acrescentar = (...novos: Item[]) => guardar([...memoria.itens, ...novos]);

  useEffect(() => {
    setTemLeituraAqui(temLeitura());
    painelAberto = true;
    persistir();
    return () => { window.clearInterval(relogioEnvio.current); pararDeFalar(); painelAberto = false; persistir(); };
  }, []);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [itens, pensando, aoVivo]);
  useEffect(() => {
    // no celular a conversa cobre a tela e trava a rolagem de trás; no computador é uma janelinha e a tela segue livre
    const antes = document.documentElement.style.overflow;
    if (window.matchMedia("(max-width: 719px)").matches) document.documentElement.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", tecla);
    return () => { document.documentElement.style.overflow = antes; document.removeEventListener("keydown", tecla); };
  }, [aoFechar]);

  const chamar = useCallback(async (corpo: Record<string, unknown>) => {
    setPensando(true);
    // a linha do que ele está fazendo aparece na hora, antes de qualquer resposta do servidor
    const primeiraFrase = corpo.decisoes ? (corpo.retomando ? "Terminando a resposta que foi interrompida…" : "Fazendo o que você confirmou…") : "Pensando…";
    vivo.current = { texto: "", mostrado: 0, frase: primeiraFrase, ativo: false, marcado: false };
    textoAoVivo = "";
    setAoVivo({ texto: "", frase: primeiraFrase });
    delete corpo.retomando;
    // fica anotado (na aba) o que foi mandado e ainda não teve resposta: se a página recarregar, dá para terminar
    if (corpo.decisoes) memoria.decidindo = { decisoes: corpo.decisoes as Decidindo["decisoes"], parciais: (corpo.parciais as unknown[]) ?? [] };
    else memoria.esperando = true;
    persistir();
    // lendo em voz alta: cada frase começa assim que chega (o número é a posição da bolha que a resposta vai ocupar)
    const voz: { atual: ReturnType<typeof falarAosPoucos> | null } = { atual: null };
    const n = memoria.itens.length;
    try {
      const { data } = await sb.auth.getSession();
      const agora = new Date();
      // pede a resposta aos poucos (pelo Accept); o servidor pode responder de uma vez (JSON), e as duas formas funcionam
      const aosPoucos = typeof ReadableStream === "function" && typeof TextDecoder === "function";
      const r = await fetch("/api/gestao/assistente", {
        method: "POST",
        headers: { "content-type": "application/json", accept: aosPoucos ? "application/x-ndjson, application/json" : "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({
          petshopId: petshop.id, mensagens: memoria.mensagens,
          agora: `${isoDia(agora)}T${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`,
          fusoMin: -agora.getTimezoneOffset(), ...corpo,
        }),
      });
      let j: Resposta | null;
      let status = r.status;
      if (r.ok && r.body && /ndjson/.test(r.headers.get("content-type") ?? "")) {
        vivo.current.ativo = true;
        const fim = await lerAosPoucos(r, (e) => {
          if (e.t === "progresso") { vivo.current.frase = e.frase; mostrarVivo(); }
          else if (e.t === "texto") {
            vivo.current.texto += e.d;
            textoAoVivo = vivo.current.texto;
            vivo.current.frase = null;
            mostrarVivo();
            if (lerAgora.current) {
              if (!voz.atual) { setLendo(n); voz.atual = falarAosPoucos(() => setLendo((x) => (x === n ? null : x))); }
              voz.atual.acrescentar(e.d);
            }
          }
        });
        status = fim?.status ?? 500;
        j = fim ? (fim as unknown as Resposta) : null;
        if (fim && status < 400) await esperarMostrar();
        if (!fim) j = { erro: "falha", mensagem: "A conexão caiu no meio da resposta. Tente de novo." } as Resposta;
      } else {
        j = (await r.json().catch(() => null)) as Resposta | null;
      }
      // o Mozart não respondeu: a frase do servidor (sem detalhe técnico) e o caminho para seguir sem ele
      if (saindo) return;
      memoria.decidindo = null; memoria.esperando = false;
      if (status >= 400 || !j || j.erro) {
        if (status === 499) { persistir(); return; }
        acrescentar({ tipo: "erro", texto: j?.mensagem || "Não consegui falar com o Mozart agora. Tente de novo em instantes.", saidas: status >= 500 });
        return;
      }
      memoria.mensagens = j.mensagens;
      memoria.parciais = j.parciais ?? [];
      persistir();
      const novos: Item[] = [];
      if (j.texto && !(j.propostas.length && j.texto === "Pronto.")) {
        novos.push({ tipo: "ele", texto: j.texto, quando: hora(new Date()), jaVisto: Boolean(vivo.current.texto) });
        // leu aos poucos: fala o que sobrou; respondeu de uma vez: lê agora, frase por frase
        if (voz.atual) { voz.atual.terminar(); voz.atual = null; }
        else if (lerAgora.current) { setLendo(n); falar(j.texto, () => setLendo((x) => (x === n ? null : x))); }
      }
      if (j.links?.length) novos.push({ tipo: "links", lista: j.links });
      if (j.propostas.length) novos.push({ tipo: "propostas", enviado: false, lista: j.propostas.map((p) => ({ ...p, estado: "pendente" as const })) });
      acrescentar(...novos);
      if (j.mudou) avisarMudanca();
    } catch {
      // a página está recarregando: o pedido fica anotado para terminar depois
      if (saindo) return;
      memoria.decidindo = null; memoria.esperando = false;
      acrescentar({ tipo: "erro", texto: textoDeRede(!semInternet()) });
    } finally {
      // o texto falado até aqui termina (resposta com erro ou só cartão)
      if (voz.atual) voz.atual.terminar();
      if (!saindo) textoAoVivo = "";
      vivo.current.ativo = false;
      setAoVivo(null);
      setPensando(false);
    }
  }, [sb, petshop.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const temPendente = itens.some((i) => i.tipo === "propostas" && !i.enviado);

  const cancelarEnvio = useCallback(() => { window.clearInterval(relogioEnvio.current); relogioEnvio.current = undefined; setContagem(null); }, []);

  const enviar = useCallback((t: string) => {
    const limpo = t.trim();
    cancelarEnvio();
    if (!limpo) return;
    setTexto("");
    setAvisoFila(null);
    // o Mozart ainda está respondendo (por exemplo, fazendo um "Pode fazer"): a mensagem não se perde, entra na fila
    if (pensando) { setFila((f) => (f ? `${f}\n${limpo}` : limpo)); return; }
    // um pedido novo com cartões em aberto descarta os cartões
    const abertos = memoria.itens.find((i) => i.tipo === "propostas" && !i.enviado);
    if (abertos && abertos.tipo === "propostas") {
      guardar(memoria.itens.map((i) => (i === abertos ? { ...abertos, enviado: true, lista: abertos.lista.map((p) => ({ ...p, estado: p.estado === "pendente" ? ("nao" as const) : p.estado })) } : i)));
      acrescentar({ tipo: "eu", texto: limpo, quando: hora(new Date()) });
      void (async () => {
        await chamar({ decisoes: abertos.lista.map((p) => ({ id: p.id, ok: false })), parciais: memoria.parciais });
        await chamar({ texto: limpo });
      })();
      return;
    }
    acrescentar({ tipo: "eu", texto: limpo, quando: hora(new Date()) });
    void chamar({ texto: limpo });
  }, [pensando, chamar, cancelarEnvio]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviarAgora = useRef(enviar);
  enviarAgora.current = enviar;
  const textoAgora = useRef(texto);
  textoAgora.current = texto;

  const ditado = useDitado(
    (t) => setTexto(t),
    (t, falou) => {
      if (!falou) return;
      setTexto(t);
      if (!enviarSozinho) { caixa.current?.focus(); return; }
      // conta 2 s na tela; tocar na caixa, escrever ou Editar cancela
      let falta = 2;
      setContagem(falta);
      window.clearInterval(relogioEnvio.current);
      relogioEnvio.current = window.setInterval(() => {
        falta -= 1;
        if (falta > 0) { setContagem(falta); return; }
        window.clearInterval(relogioEnvio.current);
        relogioEnvio.current = undefined;
        setContagem(null);
        enviarAgora.current(textoAgora.current);
      }, 1000);
    },
  );
  const editar = () => { cancelarEnvio(); const c = caixa.current; if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } };

  // "Ouvir esta resposta" num aparelho sem nenhuma voz: o navegador não fala e não avisa. Se a voz não começar em 2,5 s,
  // a tela avisa (algumas vozes só aparecem na lista depois da primeira fala, então tenta sempre)
  const [semVoz, setSemVoz] = useState<number | null>(null);
  function ouvirResposta(n: number, t: string) {
    if (lendo === n) { pararDeFalar(); setLendo(null); return; }
    setSemVoz(null);
    setLendo(n);
    let comecou = false;
    falar(t, () => setLendo((x) => (x === n ? null : x)), undefined, () => { comecou = true; });
    window.setTimeout(() => { if (!comecou) { pararDeFalar(); setLendo((x) => (x === n ? null : x)); setSemVoz(n); } }, 2500);
  }

  // o Mozart terminou: manda o que ficou na fila. Se ele trouxe cartões novos para confirmar, não descarta os cartões
  // sem a pessoa ver: a mensagem volta para a caixa, com o aviso
  useEffect(() => {
    if (pensando || !fila) return;
    const t = fila;
    setFila(null);
    if (memoria.itens.some((i) => i.tipo === "propostas" && !i.enviado)) {
      setTexto((atual) => (atual.trim() ? `${t}\n${atual}` : t));
      setAvisoFila("O Mozart trouxe algo para confirmar. Sua mensagem voltou para a caixa: confirme acima ou toque em enviar.");
      return;
    }
    enviar(t);
  }, [pensando, fila, enviar]);

  useEffect(() => {
    if (pedidoInicial && !jaPediu.current) { jaPediu.current = true; enviar(pedidoInicial); }
  }, [pedidoInicial, enviar]);

  // a página recarregou no meio de um "Pode fazer": manda a mesma confirmação de novo (o servidor grava cada cartão uma
  // vez só; se já tinha gravado, o Mozart só confirma)
  const terminou = useRef(false);
  useEffect(() => {
    const d = memoria.decidindo;
    if (!d || terminou.current) return;
    terminou.current = true;
    const ids = new Set(d.decisoes.map((x) => x.id));
    memoria.itens.forEach((i) => { if (i.tipo === "propostas" && i.lista.some((p) => ids.has(p.id))) respondidos.current.add(i.lista.map((p) => p.id).join(",")); });
    void chamar({ decisoes: d.decisoes, parciais: d.parciais, retomando: true });
  }, [chamar]);

  function decidir(grupo: Extract<Item, { tipo: "propostas" }>, id: string, sim: boolean) {
    // toque duplo em "Pode fazer": o segundo toque chega antes de a tela desligar o botão; a resposta só vai uma vez
    const grupoId = grupo.lista.map((p) => p.id).join(",");
    if (respondidos.current.has(grupoId)) return;
    const lista = grupo.lista.map((p) => (p.id === id ? { ...p, estado: sim ? ("sim" as const) : ("nao" as const) } : p));
    const completo = lista.every((p) => p.estado !== "pendente");
    if (completo) respondidos.current.add(grupoId);
    guardar(memoria.itens.map((i) => (i === grupo ? { ...grupo, lista, enviado: completo } : i)));
    if (completo) void chamar({ decisoes: lista.map((p) => ({ id: p.id, ok: p.estado === "sim" })), parciais: memoria.parciais });
  }

  function novaConversa() {
    cancelarEnvio(); pararDeFalar(); setLendo(null); setSemVoz(null);
    memoria.itens = []; memoria.mensagens = []; memoria.parciais = []; memoria.decidindo = null; memoria.esperando = false;
    setItens([]);
    persistir();
  }

  const sugestoes = sugestoesPara(petshop, vejoFinanceiro, posso);

  const primeiro = eu.nome.split(" ")[0];
  // a última resposta foi o servidor dizendo que o Mozart está fora do ar: o topo não diz "online"
  const ultimo = itens[itens.length - 1];
  const foraDoAr = Boolean(ultimo && ultimo.tipo === "erro" && ultimo.saidas);

  return (
    <div className="g-ass" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <section className="g-ass-painel" role="dialog" aria-label="Conversa com o Mozart">
        <header className="g-ass-topo">
          <span className={`foto${foraDoAr ? " fora" : ""}`}><Selo tamanho={42} /><i aria-hidden /></span>
          <div><b>Mozart</b><span>{ditado.ouvindo ? "ouvindo você…" : pensando ? "digitando…" : foraDoAr ? `fora do ar agora · ${petshop.nome}` : `online · ${petshop.nome}`}</span></div>
          {(ditado.suportado || temLeituraAqui) && <button className="g-ico" onClick={() => setAjustesVoz((a) => !a)} aria-label="Ajustes da voz" aria-expanded={ajustesVoz} title="Ajustes da voz"><SlidersHorizontal /></button>}
          {itens.length > 0 && <button className="g-ico" style={ditado.suportado || temLeituraAqui ? { marginLeft: 0 } : undefined} onClick={novaConversa} aria-label="Começar conversa nova" title="Conversa nova"><RotateCcw /></button>}
          <button className="g-ico" style={itens.length || ditado.suportado || temLeituraAqui ? { marginLeft: 0 } : undefined} onClick={aoFechar} aria-label="Fechar a conversa" title="Fechar"><ChevronDown /></button>
        </header>
        {ajustesVoz && (
          <div className="g-ass-ajustes">
            {ditado.suportado && (
              <label className="g-check">
                <input type="checkbox" checked={enviarSozinho} onChange={(e) => { setEnviarSozinho(e.target.checked); guardarEnviarSozinho(e.target.checked); }} />
                <span>Enviar sozinho depois de falar<small>O texto fica 2 segundos na caixa para você corrigir.</small></span>
              </label>
            )}
            {podeLer && (
              <label className="g-check">
                <input type="checkbox" checked={lerRespostas} onChange={(e) => { setLerRespostas(e.target.checked); guardarLerRespostas(e.target.checked); if (!e.target.checked) { pararDeFalar(); setLendo(null); } }} />
                <span>Ler as respostas do Mozart em voz alta<small>Fica guardado neste aparelho.</small></span>
              </label>
            )}
            {temLeituraAqui && <EscolherVoz vozes={vozes} />}
          </div>
        )}

        <div className="g-ass-conversa" aria-live="polite">
          <span className="g-ass-dia">Hoje</span>
          <div className="g-bolha ela rabo">Oi, {primeiro}! Sou o Mozart, cuido da agenda, dos clientes e das contas com você. {ditado.suportado ? "Pode falar no microfone ou escrever" : "Pode escrever, ou ditar pelo microfone do teclado"}, do seu jeito.</div>
          <div className="g-bolha ela">Antes de gravar qualquer coisa eu te mostro e você confirma. O que vai ser?</div>
          {!itens.length && (
            <div className="g-ass-rapidas">
              {sugestoes.map((s) => <button key={s} onClick={() => enviar(s)}>{s}</button>)}
            </div>
          )}
          {itens.map((item, i) => item.tipo === "propostas" ? (
            item.lista.map((p) => (
              <div key={p.id} className={`g-proposta${p.estado === "sim" ? " feita" : p.estado === "nao" ? " descartada" : ""}`}>
                <div className="cab"><b>{p.resumo.titulo}</b>{p.estado === "sim" && <span className="g-tag verde"><Check size={13} />confirmado</span>}{p.estado === "nao" && <span className="g-tag">descartado</span>}</div>
                <dl>{p.resumo.linhas.map(([k, v], n) => <div key={n} style={{ display: "contents" }}><dt>{k}</dt><dd style={k === "Atenção" ? { color: "var(--g-vermelho)" } : undefined}>{v}</dd></div>)}</dl>
                {p.estado === "pendente" && (
                  <div className="bts">
                    <button className="g-btn sec" disabled={pensando} onClick={() => decidir(item, p.id, false)}>Agora não</button>
                    <button className="g-btn pri" disabled={pensando} onClick={() => decidir(item, p.id, true)}><Check />Pode fazer</button>
                  </div>
                )}
              </div>
            ))
          ) : item.tipo === "links" ? (
            <div key={i} className="g-proposta">
              <div className="cab"><b>Mensagens prontas</b><span className="g-tag">toque para abrir o WhatsApp</span></div>
              <div className="g-pilha p">
                {item.lista.map((l, n) => (
                  <a key={n} className="g-btn zap" href={l.url} target="_blank" rel="noopener noreferrer" title={l.texto} style={{ justifyContent: "flex-start" }}><MessageCircle />{l.nome}</a>
                ))}
              </div>
            </div>
          ) : (
            <div key={i} className={`g-bolha ${item.tipo === "eu" ? "eu" : "ela"}${item.tipo === "erro" ? " erro" : ""}${item.jaVisto ? " ja" : ""}${itens[i - 1]?.tipo !== item.tipo ? " rabo" : ""}`}>
              {item.tipo === "ele" ? <TextoMozart texto={item.texto} /> : item.texto}
              {item.tipo === "ele" && item.interrompida && <span className="g-ass-sem-voz">Resposta interrompida</span>}
              {item.tipo === "erro" && item.repetir && i === itens.length - 1 && !pensando && (
                <span className="g-ass-saidas">
                  <button type="button" className="g-link alvo" onClick={() => { const t = item.repetir!; guardar(memoria.itens.map((x) => (x === item ? { ...item, repetir: undefined } : x))); enviar(t); }}>Perguntar de novo</button>
                </span>
              )}
              {semVoz === i && <span className="g-ass-sem-voz" role="status">{SEM_VOZ}</span>}
              {item.tipo === "erro" && item.saidas && (
                <span className="g-ass-saidas">
                  Enquanto isso:{" "}
                  {posso("agenda") && <><Link className="g-link alvo" href="/gestao/app/agenda?novo=1" onClick={aoFechar}>Marcar horário</Link>{" · "}</>}
                  <Link className="g-link alvo" href="/gestao/app/manual" onClick={aoFechar}>Ver o manual</Link>
                </span>
              )}
              {item.quando && <span className="h">
                {item.tipo === "ele" && podeLer && (
                  <button type="button" className="g-ass-ouvir" onClick={() => ouvirResposta(i, item.texto)} aria-label={lendo === i ? "Parar de ler" : "Ouvir esta resposta"} aria-pressed={lendo === i} title={lendo === i ? "Parar" : "Ouvir"}>
                    {lendo === i ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                )}
                {item.quando}{item.tipo === "eu" && <CheckCheck size={14} />}</span>}
            </div>
          ))}
          {aoVivo?.texto && <div className="g-bolha ela rabo g-ass-aovivo"><TextoMozart texto={semNomesDeFerramenta(aoVivo.texto)} /></div>}
          {pensando && <div className={`g-bolha ela pensa${aoVivo?.texto ? "" : " rabo"}`} aria-label="Mozart está digitando"><i /><i /><i /></div>}
          {pensando && aoVivo?.frase && <p className="g-ass-progresso" role="status">{aoVivo.frase}</p>}
          {fila && (
            <div className="g-bolha eu rabo g-ass-fila" role="status">
              {fila}
              <span className="g-ass-fila-nota">Na fila: vai assim que o Mozart terminar.{" "}
                <button type="button" className="g-link" onClick={() => { setTexto((atual) => (atual.trim() ? `${fila}\n${atual}` : fila)); setFila(null); }}>Editar</button>
              </span>
            </div>
          )}
          {avisoFila && <p className="g-ass-fila-aviso" role="status">{avisoFila}</p>}
          <div ref={fim} />
        </div>

        <FaixaVoz ditado={ditado}>
          {contagem !== null && (
            <>
              <i className="g-voz-barra" aria-hidden />
              <b>Enviando… {contagem}</b>
              <button type="button" className="g-link" onClick={editar}>Editar</button>
            </>
          )}
        </FaixaVoz>
        <form className="g-ass-entrada" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <textarea ref={caixa} rows={1} value={texto} placeholder={ditado.ouvindo ? "Estou ouvindo…" : pensando ? "Escreva: vai na fila" : temPendente ? "Confirme ou peça ajuste" : "Mensagem"} aria-label="Seu pedido"
            readOnly={ditado.ouvindo}
            onPointerDown={() => { if (contagem !== null) cancelarEnvio(); }}
            onFocus={() => { if (contagem !== null) cancelarEnvio(); }}
            onChange={(e) => { cancelarEnvio(); setTexto(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
          {ditado.suportado && (ditado.ouvindo || !texto.trim()) && (
            <BotaoMic ditado={ditado} jaEscrito={() => textoAgora.current} antesDeComecar={() => { cancelarEnvio(); setLendo(null); }} />
          )}
          {(!ditado.suportado || (texto.trim() && !ditado.ouvindo)) && (
            <button className="g-mic enviar" disabled={!texto.trim()} aria-label={pensando ? "Enviar quando o Mozart terminar" : "Enviar"}><ArrowUp /></button>
          )}
        </form>
      </section>
    </div>
  );
}
