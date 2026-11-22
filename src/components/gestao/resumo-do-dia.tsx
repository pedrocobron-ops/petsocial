"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Cake, CalendarX, HandCoins, HeartPulse, MessageCircle, Play, Receipt, Square, CalendarDays, Ticket } from "lucide-react";
import Link from "@/components/gestao/link-depois";
import {
  blocoDaData, chaveDoResumo, diaDoResumo, fraseSemIA, linhaDoTempo, linhasDoDinheiro, numerosDeHoje, origemDaDica, rotuloDaAcao,
  saudacaoDoResumo, semanaDoResumo, textoDaDicaSemIA, textoParaOuvir, valeLembrar, type DadosDoResumo,
} from "@/lib/gestao/resumo-do-dia";
import type { LinhaDoBomDia } from "@/lib/gestao/bom-dia";
import { gerarContasFixas } from "@/lib/gestao/contas-fixas";
import { useGestao } from "./contexto";
import { guardarLembrado, lerLembrado } from "./lembrado";
import { EVENTO_RESUMO, Esqueleto, Folha } from "./ui";
import { falar, lerVozEscolhida, pararDeFalar, temLeitura } from "./voz";
import "./resumo-do-dia.css";

const ChamarDeVolta = dynamic(() => import("./clientes/chamar-de-volta"), { ssr: false });


const ICONES: Record<LinhaDoBomDia["id"], React.ComponentType<{ "aria-hidden"?: boolean }>> = {
  dia: CalendarDays, devem: HandCoins, contas: Receipt, validade: CalendarX, vacinas: HeartPulse, pacotes: Ticket, niver: Cake,
};

/** Há outro diálogo na frente (guia inicial, Mozart, aviso do modo automático, outra folha)? */
const temDialogoNaFrente = () => typeof document !== "undefined" && document.querySelector('[role="dialog"], [role="alertdialog"]') != null;

type TextoDaIA = { frase: string; dica: string };

/**
 * Resumo do dia: a folha que abre sozinha na primeira entrada do dia de cada pessoa (a partir das 05:00 no fuso do pet shop)
 * e, depois, só pelo botão "Resumo do dia" da tela Hoje. Mora na casca do aplicativo, então vale em qualquer tela de entrada.
 *
 * - Uma leitura só (`gestao_resumo_do_dia`): o banco confere a pessoa e entrega só o que ela pode ver, com os números contados.
 * - "Já viu hoje" fica no banco (`gestao_resumo_visto`), por pessoa e pet shop: vale no celular e no computador. O aparelho
 *   guarda uma cópia só para não perguntar de novo na mesma data.
 * - Não abre por cima de outro diálogo de abertura (guia inicial, Mozart, modo automático): espera a frente ficar livre.
 * - A folha nunca espera a IA: abre com os números e o texto sem IA e troca a frase e a dica quando a rota responde.
 */
export default function ResumoDoDia() {
  const { sb, petshop, eu, souDono, liberado, cuidoDoFinanceiro } = useGestao();
  const [dados, setDados] = useState<DadosDoResumo | null>(null);
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState(false);
  const [ia, setIa] = useState<TextoDaIA | null>(null);
  const [voto, setVoto] = useState<"util" | "nao_quero" | null>(null);
  const [falando, setFalando] = useState(false);
  const [chamando, setChamando] = useState<string[] | null>(null);
  const chave = chaveDoResumo(petshop.id, eu.id);
  // o guia inicial abre sozinho para o dono enquanto não foi feito (e carrega depois da tela): o resumo espera por ele
  const guiaNaFrente = souDono && liberado && !petshop.guia_feito_em;
  const guiaRef = useRef(guiaNaFrente);
  guiaRef.current = guiaNaFrente;

  const ler = useCallback(async (): Promise<DadosDoResumo | null> => {
    // contas fixas: a conta do mês entra em A pagar antes de o resumo ler (só quem cuida do financeiro)
    if (cuidoDoFinanceiro) await gerarContasFixas(sb, petshop.id).catch(() => {});
    const r = await sb.rpc("gestao_resumo_do_dia", { p: petshop.id });
    if (r.error || !r.data) return null;
    return r.data as unknown as DadosDoResumo;
  }, [sb, petshop.id, cuidoDoFinanceiro]);

  const receber = useCallback((d: DadosDoResumo) => {
    setDados(d);
    setVoto(d.dica?.voto ?? null);
    setIa(d.ia.estado === "feito" && d.ia.frase ? { frase: d.ia.frase, dica: d.ia.dica ?? "" } : null);
  }, []);

  const marcarVisto = useCallback((d: DadosDoResumo) => {
    guardarLembrado(chave, d.dia);
    if (!d.visto) void sb.rpc("gestao_resumo_visto", { p: petshop.id }).then(() => {}, () => {});
  }, [sb, petshop.id, chave]);

  // primeira entrada do dia: lê, e abre quando a frente estiver livre
  useEffect(() => {
    // este aparelho já mostrou o resumo de hoje: não pergunta ao banco de novo
    if (lerLembrado(chave) === diaDoResumo(new Date(), petshop.fuso)) return;
    let vivo = true;
    let relogio: number | undefined;
    void ler().then((d) => {
      if (!vivo || !d) return;
      if (d.visto) { guardarLembrado(chave, d.dia); return; }
      const tentar = () => {
        if (!vivo) return;
        if (guiaRef.current || temDialogoNaFrente()) { relogio = window.setTimeout(tentar, 800); return; }
        receber(d);
        setAberto(true);
        marcarVisto(d);
      };
      tentar();
    });
    return () => { vivo = false; if (relogio) window.clearTimeout(relogio); };
  }, [petshop.id, eu.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // o botão "Resumo do dia" da tela Hoje: abre na hora e lê de novo
  useEffect(() => {
    const abrir = () => {
      setErro(false);
      setAberto(true);
      void ler().then((d) => { if (d) { receber(d); marcarVisto(d); } else setErro(true); });
    };
    window.addEventListener(EVENTO_RESUMO, abrir);
    return () => window.removeEventListener(EVENTO_RESUMO, abrir);
  }, [ler, receber, marcarVisto]);

  // o texto do Mozart: pedido uma vez por dia; enquanto não chega (ou se não vier), fica o texto sem IA
  const pedido = useRef<string | null>(null);
  useEffect(() => {
    if (!aberto || !dados || dados.ia.estado || pedido.current === dados.dia) return;
    pedido.current = dados.dia;
    void (async () => {
      try {
        const { data } = await sb.auth.getSession();
        const r = await fetch("/api/gestao/resumo-do-dia", {
          method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
          body: JSON.stringify({ petshopId: petshop.id }),
        });
        const j = (await r.json().catch(() => null)) as { ia?: boolean; frase?: string; dica?: string } | null;
        if (r.ok && j?.ia && j.frase) setIa({ frase: j.frase, dica: j.dica ?? "" });
      } catch { /* sem IA: a folha segue com o texto que já tem */ }
    })();
  }, [aberto, dados, sb, petshop.id]);

  const fechar = useCallback(() => {
    if (falando) pararDeFalar();
    setFalando(false);
    setAberto(false);
  }, [falando]);
  // a folha saiu da tela com a voz lendo: para
  useEffect(() => () => { pararDeFalar(); }, []);

  if (!aberto) return null;
  if (chamando) return <ChamarDeVolta somente={chamando} aoFechar={() => setChamando(null)} />;

  const comecar = <button type="button" className="g-btn pri" data-teste="resumo-comecar" onClick={fechar}>Começar o dia</button>;
  if (!dados) {
    return (
      <Folha titulo="Resumo do dia" aoFechar={fechar} rodape={comecar}>
        <div className="g-rd" data-teste="resumo-dia" data-estado={erro ? "erro" : "lendo"}>
          <div className="g-rd-sec">{erro ? <p className="g-rd-nota" role="alert">Não consegui montar o resumo agora. Tente de novo daqui a pouco.</p> : <Esqueleto linhas={4} />}</div>
        </div>
      </Folha>
    );
  }

  const d = dados;
  const data = blocoDaData(d);
  const frase = ia?.frase || fraseSemIA(d);
  const numeros = numerosDeHoje(d);
  const tempo = linhaDoTempo(d);
  const lembrar = valeLembrar(d);
  const semana = semanaDoResumo(d);
  const dinheiro = linhasDoDinheiro(d);
  const dica = d.dica;
  const textoDaDica = dica ? ia?.dica || textoDaDicaSemIA(dica) : "";
  const acao = dica ? rotuloDaAcao(dica) : null;
  const chamarDoBuraco = d.areas.clientes && d.chamar?.length ? d.chamar : null;

  function ouvir() {
    if (falando) { pararDeFalar(); setFalando(false); return; }
    setFalando(true);
    falar(textoParaOuvir(d, frase, textoDaDica), () => setFalando(false), lerVozEscolhida());
  }
  async function votar(v: "util" | "nao_quero") {
    if (!dica) return;
    setVoto(v);
    const r = await sb.rpc("gestao_resumo_votar", { p: petshop.id, p_tipo: dica.tipo, p_voto: v });
    if (r.error || !(r.data as { ok?: boolean } | null)?.ok) setVoto(dica.voto ?? null);
  }

  return (
    <Folha titulo="Resumo do dia" aoFechar={fechar} rodape={comecar}>
      <div className="g-rd" data-teste="resumo-dia" data-estado="pronto" data-ia={ia ? "sim" : "nao"} data-dia={d.dia}>
        <header className="g-rd-cab">
          <div className="g-rd-data" aria-hidden><span className="mes">{data.mes}</span><span className="g-rd-n">{data.dia}</span><span className="sem">{data.semana}</span></div>
          <div className="g-rd-ola">
            <h3 data-teste="resumo-saudacao">{saudacaoDoResumo(d)}</h3>
            <p data-teste="resumo-frase">{frase}</p>
          </div>
          {temLeitura() && (
            <button type="button" className="g-rd-ouvir" data-teste="resumo-ouvir" aria-pressed={falando} onClick={ouvir}>
              {falando ? <Square aria-hidden /> : <Play aria-hidden />}{falando ? "Parar" : "Ouvir"}
            </button>
          )}
        </header>

        {d.conta_nova ? (
          <section className="g-rd-sec" aria-labelledby="g-rd-comeco" data-teste="resumo-conta-nova">
            <h4 className="g-rd-rot" id="g-rd-comeco">Para começar</h4>
            {d.falta.length ? (
              <ul className="g-rd-falta">
                {d.falta.map((f) => <li key={f.chave}><Link href={f.rota} onClick={fechar}>{f.rotulo}</Link></li>)}
              </ul>
            ) : <p className="g-rd-nota">Ainda não há horário nem estadia por aqui. Quando o primeiro for marcado, o seu dia aparece nesta folha.</p>}
          </section>
        ) : (numeros.length > 0 || tempo.length > 0 || lembrar.length > 0) && (
          <section className="g-rd-sec" aria-labelledby="g-rd-hoje" data-teste="resumo-hoje">
            <h4 className="g-rd-rot" id="g-rd-hoje">{d.so_meus ? "Hoje, na sua agenda" : "Hoje"}</h4>
            {numeros.length > 0 && (
              <div className="g-rd-numeros" data-colunas={numeros.length}>
                {numeros.map((n) => <div key={n.id} data-numero={n.id}><b>{n.valor}</b><span>{n.rotulo}</span></div>)}
              </div>
            )}
            {tempo.length > 0 && (
              <ol className="g-rd-tempo" data-teste="resumo-tempo">
                {tempo.map((l, i) => (
                  <li key={`${l.tipo}-${l.hora}-${i}`} data-tipo={l.tipo}>
                    <time>{l.hora}</time>
                    <span className="g-rd-i">
                      {l.texto}
                      {l.tipo === "buraco" && chamarDoBuraco && (
                        <button type="button" className="g-rd-mini" data-teste="resumo-chamar-buraco" onClick={() => setChamando(chamarDoBuraco)}>Chamar quem está no prazo</button>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {lembrar.length > 0 && (
              <ul className="g-rd-lembrar" data-teste="resumo-lembrar">
                {lembrar.map((l) => { const Icone = ICONES[l.id]; return <li key={l.id} data-linha={l.id}><Icone aria-hidden />{l.texto}</li>; })}
              </ul>
            )}
          </section>
        )}

        {semana && !d.conta_nova && (
          <section className="g-rd-sec" aria-labelledby="g-rd-semana" data-teste="resumo-semana">
            <h4 className="g-rd-rot" id="g-rd-semana">A semana</h4>
            <div className="g-rd-semana" data-dias={semana.dias.length} role="list">
              {semana.dias.map((x) => (
                <div key={x.dia} role="listitem" className={`g-rd-d${x.fraco ? " fraco" : ""}`} data-dia={x.dia} aria-label={`${x.rotulo}: ${x.aberto || x.n ? `${x.n} ${x.n === 1 ? "horário" : "horários"}` : "fechado"}`}>
                  <div className="g-rd-b" aria-hidden><i style={{ height: `${x.pct}%` }} /></div>
                  <b aria-hidden>{x.aberto || x.n ? x.n : "–"}</b><span aria-hidden>{x.hoje ? "hoje" : x.rotulo}</span>
                </div>
              ))}
            </div>
            <p className="g-rd-nota" data-teste="resumo-semana-nota">{semana.nota}</p>
          </section>
        )}

        {dinheiro.length > 0 && (
          <section className="g-rd-sec" aria-labelledby="g-rd-dinheiro" data-teste="resumo-dinheiro">
            <h4 className="g-rd-rot" id="g-rd-dinheiro">Dinheiro</h4>
            <ul className="g-rd-dinheiro">
              {dinheiro.map((l) => <li key={l.id} className={l.alerta ? "alerta" : undefined} data-linha={l.id}><span>{l.texto}{l.detalhe && <small data-teste="resumo-previsto-origens">{l.detalhe}</small>}</span><b>{l.valor}</b></li>)}
            </ul>
          </section>
        )}

        {dica && (
          <section className="g-rd-sec" aria-labelledby="g-rd-dica" data-teste="resumo-dica" data-tipo={dica.tipo} data-chave={dica.chave}>
            <h4 className="g-rd-rot" id="g-rd-dica">Dica do dia</h4>
            <div className="g-rd-dica">
              <p data-teste="resumo-dica-texto">{textoDaDica}</p>
              <small>{origemDaDica(dica)}</small>
              {voto === "nao_quero" ? <p className="g-rd-voto" role="status" data-teste="resumo-voto">Combinado: não mostro mais dicas desse tipo.</p> : (
                <div className="g-rd-acoes">
                  {acao && dica.acao?.tipo === "chamar" && d.areas.clientes && (
                    <button type="button" className="g-rd-mini" data-teste="resumo-dica-acao" onClick={() => setChamando((dica.acao as { clientes: string[] }).clientes)}><MessageCircle aria-hidden />{acao}</button>
                  )}
                  {acao && dica.acao?.tipo === "ir" && <Link className="g-rd-mini" data-teste="resumo-dica-acao" href={dica.acao.rota} onClick={fechar}>{acao}</Link>}
                  {voto === "util" ? <span className="g-rd-voto" role="status" data-teste="resumo-voto">Anotado: dicas assim vêm antes.</span> : (
                    <>
                      <button type="button" className="g-rd-claro" data-teste="resumo-util" onClick={() => void votar("util")}>Útil</button>
                      <button type="button" className="g-rd-claro" data-teste="resumo-nao-quero" onClick={() => void votar("nao_quero")}>Não quero esse tipo</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </Folha>
  );
}
