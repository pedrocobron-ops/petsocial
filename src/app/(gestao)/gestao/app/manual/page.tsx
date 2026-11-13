"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LifeBuoy, Printer, Search, Sprout, X } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, Vazio } from "@/components/gestao/ui";
import { Tile } from "@/components/gestao/painel";
import { abrirAjuda } from "@/components/gestao/manual/ajuda-da-tela";
import { ItemTopico, QuemPode, useUmLoginSo } from "@/components/gestao/manual/topico";
import { buscarNoManual, comecandoPara, QUEM, secoesPara, topicoPorId, topicosPara, type Quem } from "@/lib/gestao/manual";
import "@/components/gestao/manual/manual.css";

function Manual() {
  const { petshop } = useGestao();
  const params = useSearchParams();
  const [busca, setBusca] = useState("");
  const [abertos, setAbertos] = useState<Set<string>>(() => new Set());
  // o manual deste pet shop: só as partes que ele usa, na ordem da área principal dele
  const topicos = useMemo(() => topicosPara(petshop), [petshop]);
  const secoes = useMemo(() => secoesPara(petshop), [petshop]);
  const comecando = useMemo(() => comecandoPara(petshop), [petshop]);
  const umLogin = useUmLoginSo();
  const nomeSecao = (id: string) => secoes.find((s) => s.id === id)?.titulo ?? "";
  const achados = useMemo(() => (busca.trim().length > 1 ? buscarNoManual(busca, topicos) : null), [busca, topicos]);

  const alternar = (id: string) => setAbertos((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  /** Abre o tópico na lista das seções e leva a tela até ele. */
  const mostrar = (id: string, guardar = true) => {
    setBusca("");
    setAbertos((a) => new Set(a).add(id));
    if (guardar) window.history.replaceState(null, "", `?t=${id}`);
    // espera a lista das seções voltar para a tela antes de rolar
    setTimeout(() => document.getElementById(`t-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
  };

  // endereço com ?t=<id>: já chega com o tópico aberto
  const pedido = params.get("t");
  useEffect(() => { if (pedido && topicoPorId(pedido, topicos)) mostrar(pedido, false); }, [pedido]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="g-man">
      <header className="g-topo">
        <div>
          <h1>Manual</h1>
          <p className="g-muted">O passo a passo de cada tela, na ordem em que você toca.</p>
        </div>
        <div className="g-acoes">
          <button type="button" className="g-btn sec" onClick={() => window.print()}><Printer />Imprimir</button>
        </div>
      </header>
      <p className="g-man-papel">Manual do Maestro Pet Gestão · {petshop.nome}</p>

      <div className="g-pilha g">
        <div className="g-man-busca">
          <div className="g-busca">
            <Search aria-hidden />
            <input className="g-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="O que você quer fazer? Ex.: receber, vacina, senha" aria-label="Buscar no manual" />
            {busca && <button type="button" className="g-ico g-man-limpar" onClick={() => setBusca("")} aria-label="Limpar a busca"><X /></button>}
          </div>
          {!umLogin && (
            <div className="g-man-legenda" aria-label="Quem consegue fazer">
              <span className="g-muted g-pp">Em cada tópico, a etiqueta diz quem consegue fazer:</span>
              {(Object.keys(QUEM) as Quem[]).map((q) => <QuemPode key={q} quem={q} />)}
            </div>
          )}
        </div>

        {achados && (
          <section className="g-card g-man-achados" aria-live="polite">
            {achados.length ? (
              <>
                <div className="g-card-t"><h2>{achados.length === 1 ? "1 tópico encontrado" : `${achados.length} tópicos encontrados`}</h2></div>
                <div className="g-man-lista">
                  {achados.map((t) => (
                    <ItemTopico key={t.id} prefixo="b" topico={t} apoio={nomeSecao(t.secao)} aberto={abertos.has(t.id) || achados.length === 1} aoAlternar={() => alternar(t.id)} semQuem={umLogin} />
                  ))}
                </div>
              </>
            ) : (
              <Vazio titulo="Não achei nada com essas palavras" texto="Tente com outra palavra, ou escreva a sua dúvida para a Ajuda.">
                <button type="button" className="g-btn verde" onClick={abrirAjuda}><LifeBuoy />Perguntar para a Ajuda</button>
              </Vazio>
            )}
          </section>
        )}

        <div className={`g-man-tudo g-pilha g${achados ? " escondido" : ""}`}>
          <section className="g-card g-man-zero" aria-labelledby="man-zero">
            <div className="g-card-t">
              <h2 id="man-zero"><Tile icone={Sprout} tom="menta" />Começando do zero</h2>
            </div>
            <p className="g-muted g-p">Acabou de chegar? Siga nesta ordem. Cada item abre o passo a passo.</p>
            <ol className="g-man-ordem">
              {comecando.map((t, i) => (
                <li key={t.id}>
                  <a href={`?t=${t.id}`} onClick={(e) => { e.preventDefault(); mostrar(t.id); }}>
                    <i aria-hidden>{i + 1}</i><span>{t.titulo}</span>
                  </a>
                </li>
              ))}
            </ol>
          </section>

          <nav className="g-man-indice" aria-label="Partes do manual">
            {secoes.map((s) => <a key={s.id} className="g-chip" href={`#s-${s.id}`}>{s.titulo}</a>)}
          </nav>

          {secoes.map((s) => {
            const lista = topicos.filter((t) => t.secao === s.id);
            return (
              <section key={s.id} className="g-card g-man-secao" id={`s-${s.id}`} aria-labelledby={`h-${s.id}`}>
                <div className="g-man-secao-t">
                  <h2 id={`h-${s.id}`}>{s.titulo}</h2>
                  <p className="g-muted g-p">{s.apoio}</p>
                </div>
                <div className="g-man-lista">
                  {lista.map((t) => <ItemTopico key={t.id} prefixo="t" topico={t} aberto={abertos.has(t.id)} aoAlternar={() => alternar(t.id)} semQuem={umLogin} />)}
                </div>
              </section>
            );
          })}

          <section className="g-card g-man-fim">
            <div>
              <h2>Não achou o que procurava?</h2>
              <p className="g-muted g-p">Escreva a sua dúvida para a Ajuda. Se ela não resolver, você fala com a nossa equipe pelo WhatsApp.</p>
            </div>
            <button type="button" className="g-btn verde" onClick={abrirAjuda}><LifeBuoy />Perguntar para a Ajuda</button>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><Manual /></Suspense>;
}
