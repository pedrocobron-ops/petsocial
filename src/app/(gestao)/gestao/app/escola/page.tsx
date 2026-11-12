"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Clock, ExternalLink, GraduationCap, Library, Mail, Store } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import Leitor from "@/components/gestao/escola/leitor";
import { Tile } from "@/components/gestao/painel";
import { Folha, Vazio, ok, useDados } from "@/components/gestao/ui";
import { AULAS, MATERIAIS, linkDeCompra, type Aula, type Material } from "@/lib/gestao/escola";
import { brlCurto } from "@/lib/gestao/util";

const TOM: Record<Aula["tema"], "pessego" | "menta" | "ceu" | "lilas" | "manteiga"> = { Preço: "manteiga", Agenda: "pessego", Clientes: "menta", Dinheiro: "ceu", Equipe: "lilas" };

/**
 * Escola de Gestão: aulas curtas e gratuitas sobre a rotina do pet shop, a estante de materiais da Maestro Pet
 * e os materiais que a pessoa já comprou, para ler aqui mesmo.
 */
export default function Escola() {
  const { sb, souDono, user } = useGestao();
  const [aulaAberta, setAulaAberta] = useState<Aula | null>(null);
  const [materialAberto, setMaterialAberto] = useState<Material | null>(null);
  const [lendo, setLendo] = useState<Material | null>(null);

  const { dados } = useDados(async () => {
    const [compras, arquivos] = await Promise.all([
      sb.from("escola_compras").select("slug").eq("email", (user.email ?? "").toLowerCase()),
      sb.from("escola_materiais").select("slug"),
    ]);
    return { meus: new Set(ok(compras).map((c) => c.slug)), comArquivo: new Set(ok(arquivos).map((a) => a.slug)) };
  }, [user.email]);

  const meus = useMemo(() => MATERIAIS.filter((m) => dados?.meus.has(m.slug)), [dados]);
  const estante = useMemo(() => MATERIAIS.filter((m) => !dados?.meus.has(m.slug)), [dados]);
  const podeLer = (m: Material) => Boolean(dados?.comArquivo.has(m.slug));

  if (!souDono) return <Vazio titulo="A Escola de Gestão é do dono do pet shop." texto="Peça a quem é dono ou sócio para abrir por aqui." />;

  return (
    <div>
      <header className="g-topo">
        <div><h1>Escola de Gestão</h1><p className="g-muted">Para aprender a cuidar do negócio, um assunto de cada vez.</p></div>
      </header>

      <div className="g-pilha g">
        <section className="g-esc-capa">
          <Tile icone={GraduationCap} tom="manteiga" tamanho="g" />
          <h2>Cuidar bem dos pets você já sabe. Aqui é a parte do negócio.</h2>
          <p>Aulas curtas e gratuitas sobre preço, agenda, caixa e equipe, sempre mostrando onde fazer no sistema. E materiais completos da Maestro Pet para quem quer oferecer um serviço novo.</p>
        </section>

        {meus.length > 0 && (
          <section className="g-pilha">
            <div className="g-card-t" style={{ marginBottom: 0 }}><h2><Library style={{ width: 20, height: 20, verticalAlign: "-3px", marginRight: 8 }} />Meus materiais</h2></div>
            <div className="g-esc-estante">
              {meus.map((m) => (
                <div key={m.slug} className="g-card g-esc-item" style={{ cursor: "default" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.capa} alt="" loading="lazy" />
                  <div>
                    <b>{m.nome}</b>
                    <div className="g-esc-preco">
                      {podeLer(m)
                        ? <button className="g-btn verde p" onClick={() => setLendo(m)}><BookOpen />Ler aqui</button>
                        : <span className="g-pp g-muted" style={{ fontWeight: 400 }}><Mail style={{ width: 15, height: 15, verticalAlign: "-2px", marginRight: 4 }} />O arquivo chegou no seu e-mail. A leitura por aqui entra em breve.</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="g-pilha">
          <div>
            <h2>Aulas gratuitas</h2>
            <p className="g-muted g-p">Leitura de três a quatro minutos. No fim de cada uma, o atalho para fazer no sistema.</p>
          </div>
          <div className="g-esc-aulas">
            {AULAS.map((a) => (
              <button key={a.id} className="g-card g-esc-aula" onClick={() => setAulaAberta(a)}>
                <span className="g-esc-meta"><span className={`g-tile p ${TOM[a.tema]}`} aria-hidden><BookOpen /></span>{a.tema}<span aria-hidden>·</span><Clock style={{ width: 14, height: 14 }} aria-hidden />{a.minutos} min</span>
                <b>{a.titulo}</b>
                <span className="g-p g-muted">{a.resumo}</span>
              </button>
            ))}
          </div>
        </section>

        {estante.length > 0 && (
          <section className="g-pilha">
            <div>
              <h2><Store style={{ width: 20, height: 20, verticalAlign: "-3px", marginRight: 8 }} />Um serviço novo para o seu pet shop</h2>
              <p className="g-muted g-p">Materiais completos da Maestro Pet, cada um sobre um serviço que dá para somar ao que você já faz. Toque para ver o que ensina e para quem serve.</p>
            </div>
            <div className="g-esc-estante">
              {estante.map((m) => (
                <button key={m.slug} className="g-card g-esc-item" onClick={() => setMaterialAberto(m)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.capa} alt="" loading="lazy" />
                  <span>
                    <b>{m.nome}</b>
                    <span className="g-p g-muted" style={{ display: "block" }}>{m.ideia}</span>
                    <span className="g-esc-preco">{brlCurto(m.preco)}<span className="g-pp g-muted" style={{ fontWeight: 400 }}>pagamento único</span></span>
                  </span>
                </button>
              ))}
            </div>
            <p className="g-muted g-pp">Os materiais são vendidos à parte, pela Cakto, e não fazem parte da assinatura do sistema. Ninguém é obrigado a comprar nada para usar o Maestro Pet Gestão.</p>
          </section>
        )}
      </div>

      {aulaAberta && (
        <Folha titulo={aulaAberta.titulo} aoFechar={() => setAulaAberta(null)} larga>
          <article className="g-esc-texto">
            <p className="g-esc-meta">{aulaAberta.tema}<span aria-hidden>·</span><Clock style={{ width: 14, height: 14 }} aria-hidden />leitura de {aulaAberta.minutos} min</p>
            {aulaAberta.corpo.map((b, i) => "p" in b ? <p key={i}>{b.p}</p> : "t" in b ? <h3 key={i}>{b.t}</h3> : <ul key={i}>{b.lista.map((l) => <li key={l}>{l}</li>)}</ul>)}
            <div className="g-esc-pratica">
              <b>No sistema</b>
              <p className="g-p">{aulaAberta.naPratica.texto}</p>
              <div><Link className="g-btn verde p" href={aulaAberta.naPratica.href}>{aulaAberta.naPratica.rotulo}<ArrowRight /></Link></div>
            </div>
          </article>
        </Folha>
      )}

      {materialAberto && (
        <Folha titulo={materialAberto.nome} aoFechar={() => setMaterialAberto(null)} larga>
          <div className="g-esc-det">
            <div className="g-esc-det-topo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={materialAberto.capa} alt={`Capa de ${materialAberto.nome}`} />
              <div className="g-pilha p">
                <p>{materialAberto.ideia}</p>
                <p className="g-muted g-p">{materialAberto.paraQuem}</p>
              </div>
            </div>
            <div>
              <p className="g-rotulo" style={{ marginBottom: 8 }}>O que você aprende</p>
              <ul className="g-esc-lista">{materialAberto.aprende.map((x) => <li key={x}><Check aria-hidden />{x}</li>)}</ul>
            </div>
            <div className="g-card liso g-pilha p">
              <p><b style={{ font: "500 1.5rem/1 var(--display)" }}>{brlCurto(materialAberto.preco)}</b> <span className="g-muted g-p">pagamento único, pela Cakto</span></p>
              <ul className="g-esc-lista">
                <li><Mail aria-hidden />Você recebe o material no e-mail logo depois do pagamento.</li>
                <li><BookOpen aria-hidden />Comprando com o e-mail desta conta{user.email ? ` (${user.email})` : ""}, ele também aparece aqui em Meus materiais para ler no celular ou no computador.</li>
              </ul>
              <div className="g-fila">
                <a className="g-btn pri" href={linkDeCompra(materialAberto, user.email)} target="_blank" rel="noopener noreferrer">Comprar por {brlCurto(materialAberto.preco)}<ExternalLink aria-hidden /></a>
                <a className="g-btn sec" href={`/negocios/${materialAberto.slug}`} target="_blank" rel="noopener noreferrer">Ver a página completa</a>
              </div>
              <p className="g-muted g-pp">É um material de estudo. O resultado depende de como você aplica no seu negócio.</p>
            </div>
          </div>
        </Folha>
      )}

      {lendo && <Leitor slug={lendo.slug} titulo={lendo.nome} aoFechar={() => setLendo(null)} />}
    </div>
  );
}
