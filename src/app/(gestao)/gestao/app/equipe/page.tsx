"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarDays, ChevronRight, Hourglass, KeyRound, Lock, Mail, Percent, Scissors, Send, Smartphone, UserPlus, Users } from "lucide-react";
import { Kpi, Tile } from "@/components/gestao/painel";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPessoa, Vazio, avisarMudanca, ok, useAvisos, useSomenteLeitura } from "@/components/gestao/ui";
import { NOME_DIAS, ORDEM_DIAS, lerHorario } from "@/components/gestao/ajustes/grade-horario";
import AdicionarPessoa from "@/components/gestao/equipe/adicionar";
import EditarPessoa, { FolhaConvite } from "@/components/gestao/equipe/editar";
import { Areas, Vagas } from "@/components/gestao/equipe/pecas";
import { acessoDe, erroDeLimite, fraseDoLimite, funcaoDe, nAcessos, pilulasDe, primeiroNome, titularDe, usoDoPlano, type Uso } from "@/components/gestao/equipe/modelo";
import { perfisPara } from "@/lib/gestao/acessos";
import type { Profissional } from "@/lib/gestao/tipos";
import "@/components/gestao/ajustes/ajustes.css";
import "./equipe.css";

const pct = (n: number) => `${String(Number(n)).replace(".", ",")}%`;

/** Quem aparece na escala e o horário da pessoa em cada dia (a escala própria ou, sem ela, o horário do pet shop). */
const naEscala = (p: Profissional) => p.atende || !!p.escala;
const horaCurta = (h: string) => { const [a, m] = h.split(":"); return m === "00" ? `${Number(a)}h` : `${Number(a)}:${m}`; };

type Aberto = { tipo: "novo" } | { tipo: "editar"; id: string; foco?: "acesso" } | { tipo: "convite"; id: string } | null;

export default function Equipe() {
  const { souDono, equipe, eu, sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [aberto, setAberto] = useState<Aberto>(null);
  if (!souDono) return <Vazio titulo="Só o dono do pet shop mexe aqui." />;

  const ativos = equipe.filter((p) => p.ativo);
  const inativos = equipe.filter((p) => !p.ativo);
  const uso = usoDoPlano(petshop, equipe);
  const abrir = (a: Aberto) => { if (!somenteLeitura()) setAberto(a); };
  // a pessoa aberta vem sempre da equipe carregada, para a folha acompanhar o que acabou de ser gravado
  const pessoaAberta = aberto && aberto.tipo !== "novo" ? equipe.find((p) => p.id === aberto.id) ?? null : null;

  const loja = lerHorario(petshop.horario);
  const diaDe = (p: Profissional, d: string) => (p.escala ? lerHorario(p.escala)[d] : loja[d]);
  const hoje = String(new Date().getDay());
  const atendem = ativos.filter((p) => p.atende).length;
  const trabalhamHoje = ativos.filter((p) => naEscala(p) && diaDe(p, hoje)).length;
  const convites = ativos.filter((p) => acessoDe(p) === "convite").length;
  const soEu = ativos.length <= 1;
  const titular = titularDe(equipe);

  async function reativar(p: Profissional) {
    if (somenteLeitura()) return;
    try {
      ok(await sb.from("profissionais").update({ ativo: true }).eq("id", p.id).eq("petshop_id", p.petshop_id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(`${p.nome} voltou para a equipe.`);
    } catch (x) {
      // quem tinha login volta ocupando um acesso; se o plano está cheio, o banco recusa
      if (erroDeLimite(x)) avisarErro(new Error(`${primeiroNome(p.nome)} tinha login e ${fraseDoLimite(uso).replace(/^O plano/, "o plano")} A mudança de plano fica na tela Assinatura.`));
      else avisarErro(x);
    }
  }

  return (
    <>
      <header className="g-topo">
        <div><h1>Equipe</h1><p className="g-muted">Quem trabalha com você, quem entra no sistema e o que cada um abre.</p></div>
        {!soEu && <div className="g-acoes"><button className="g-btn pri" onClick={() => abrir({ tipo: "novo" })}><UserPlus />Adicionar pessoa</button></div>}
      </header>

      <div className="g-pilha g">
        {!soEu && <div className="g-eq-resumo">
          <BlocoDoPlano uso={uso} aoAdicionar={() => abrir({ tipo: "novo" })} />
          <div className="g-grade kpis g-eq-kpis">
            <Kpi icone={Users} tom="ceu" rotulo="Na equipe" valor={ativos.length} apoio={ativos.length === 1 ? "pessoa ativa" : "pessoas ativas"} />
            <Kpi icone={Scissors} tom="pessego" rotulo="Atendem" valor={atendem} apoio="aparecem na agenda" />
            <Kpi icone={CalendarCheck} tom="menta" rotulo="Trabalham hoje" valor={trabalhamHoje} apoio={loja[hoje] ? `${NOME_DIAS[hoje]}, pela escala` : "pet shop fechado hoje"} />
            <Kpi icone={Mail} tom="manteiga" rotulo="Convites" valor={convites} apoio={convites ? "esperando criar a conta" : "nenhum pendente"} />
          </div>
        </div>}

        {soEu && (
          <section className="g-eq-convida">
            <div className="g-eq-convida-t">
              <p className="g-rotulo">Sua equipe</p>
              <h2>Trabalha sozinha ou sozinho? Então está tudo pronto.</h2>
              <p>A agenda, o caixa e o resto já estão no seu nome. Você não precisa mexer nesta tela.</p>
              <p>Se um dia tiver ajuda, é aqui que você coloca a pessoa: quem dá banho e tosa aparece na agenda sem precisar de senha, e quem usa o sistema (recepção, financeiro, sócio) ganha um acesso próprio.</p>
              <div><button className="g-btn verde" onClick={() => abrir({ tipo: "novo" })}><UserPlus />Tenho ajuda: adicionar pessoa</button></div>
            </div>
            <ul className="g-eq-convida-l">
              <li><Tile icone={CalendarDays} tom="pessego" /><p className="g-eq-convida-i"><b>Agenda por pessoa</b><small>Cada um com a sua cor e o seu filtro na agenda.</small></p></li>
              <li><Tile icone={Percent} tom="menta" /><p className="g-eq-convida-i"><b>Comissão calculada</b><small>A conta de cada um sai pronta em Relatórios.</small></p></li>
              <li><Tile icone={Smartphone} tom="ceu" /><p className="g-eq-convida-i"><b>Login só para quem precisa</b><small>Você escolhe, área por área, o que a pessoa abre.</small></p></li>
            </ul>
          </section>
        )}

        <div className="g-duas">
          <section>
            <div className="g-card-t"><h2>Pessoas</h2><span className="g-muted g-p">{ativos.length} {ativos.length === 1 ? "ativa" : "ativas"}</span></div>
            <div className="g-eq-grade">
              {ativos.map((p) => {
                const acesso = acessoDe(p);
                const dono = p.papel === "dono";
                const dias = ORDEM_DIAS.filter((d) => diaDe(p, d));
                return (
                  <article key={p.id} className="g-card g-eq-pessoa" style={{ "--cor": p.cor } as React.CSSProperties}>
                    <button type="button" className="g-eq-abrir" onClick={() => abrir({ tipo: "editar", id: p.id })} aria-label={`Abrir ${p.nome}`} />
                    <div className="g-eq-topo">
                      <AvatarPessoa nome={p.nome} cor={p.cor} tamanho="g" />
                      <div className="g-eq-topo-t">
                        <b className="g-eq-nome">{p.nome}{p.id === eu.id ? " (você)" : ""}</b>
                        <span className="g-eq-funcao">{funcaoDe(p)}{dono && <span className={`g-tag ${p.id === titular ? "laranja" : "azul"}`}>{p.id === titular ? "Titular" : "Sócio"}</span>}</span>
                      </div>
                      <ChevronRight className="g-eq-seta" size={18} aria-hidden />
                    </div>

                    <div className={`g-eq-acesso ${acesso}`}>
                      <i className="g-eq-acesso-i" aria-hidden>{acesso === "login" ? <KeyRound /> : acesso === "convite" ? <Hourglass /> : p.atende ? <CalendarDays /> : <Lock />}</i>
                      <p className="g-eq-acesso-t">
                        <b>{acesso === "login" ? "Com login" : acesso === "convite" ? "Convite criado: falta a pessoa criar a conta" : p.atende ? "Sem login, só na agenda" : "Sem login"}</b>
                        {acesso === "convite" && <small>{p.email_convite}</small>}
                      </p>
                      {acesso === "convite" && <button type="button" className="g-btn p sec g-eq-acao" onClick={() => abrir({ tipo: "convite", id: p.id })}><Send />Reenviar</button>}
                      {acesso === "sem" && <button type="button" className="g-btn p sec g-eq-acao" onClick={() => abrir({ tipo: "editar", id: p.id, foco: "acesso" })}><KeyRound />Dar login</button>}
                    </div>

                    {acesso !== "sem" && (
                      <div className="g-eq-abre">
                        <span className="g-eq-abre-r">Abre</span>
                        {pilulasDe(p).map((a) => <span key={a} className={`g-eq-pilula${a === "Tudo" ? " tudo" : ""}`}>{a}</span>)}
                        {dono && <span className="g-eq-pilula tudo">Equipe e assinatura</span>}
                      </div>
                    )}

                    {(p.atende || Number(p.comissao_pct) > 0) && (
                      <div className="g-eq-tags">
                        {p.atende && <span className="g-tag verde"><Scissors aria-hidden />atende na agenda</span>}
                        {Number(p.comissao_pct) > 0 && <span className="g-tag">comissão de {pct(p.comissao_pct)}</span>}
                      </div>
                    )}

                    <div className="g-eq-trabalha">
                      <span className="g-eq-trabalha-r">{p.escala ? "Dias próprios" : "Horário do pet shop"}</span>
                      <div className="g-eq-dias" role="img" aria-label={`Trabalha: ${dias.map((d) => NOME_DIAS[d]).join(", ") || "nenhum dia"}`}>
                        {ORDEM_DIAS.map((d) => <i key={d} className={`${diaDe(p, d) ? "on" : ""}${d === hoje ? " hoje" : ""}`}>{NOME_DIAS[d][0]}</i>)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {inativos.length > 0 && (
              <details className="gj-recolhe" style={{ marginTop: 12 }}>
                <summary>{inativos.length === 1 ? "1 pessoa desativada" : `${inativos.length} pessoas desativadas`}</summary>
                <div className="g-card g-lista" style={{ paddingBlock: 6 }}>
                  {inativos.map((p) => (
                    <div key={p.id} className="g-linha">
                      <AvatarPessoa nome={p.nome} cor="#a39a90" tamanho="p" />
                      <span className="t"><b className="g-muted">{p.nome}</b><span>{funcaoDe(p)}</span></span>
                      <button className="g-btn p sec" onClick={() => reativar(p)}>Reativar</button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
          {!soEu && <EscalaDaSemana />}
        </div>

        {!soEu && <details className="g-card g-eq-pode">
          <summary className="g-eq-pode-s">
            <Tile icone={KeyRound} tom="lilas" />
            <span className="g-eq-pode-st"><b>Quem pode o quê</b><small>O que cada perfil pronto abre. Você pode ligar e desligar área por área em cada pessoa.</small></span>
            <ChevronRight className="g-eq-pode-seta" size={18} aria-hidden />
          </summary>
          <div className="g-eq-compara">
            {perfisPara(petshop).map((c) => (
              <div key={c.id} className="g-eq-quadro">
                <p className="g-eq-quadro-t">{c.titulo}</p>
                <Areas areas={c.areas} socio={c.socio} curto />
              </div>
            ))}
          </div>
          <p className="g-muted g-pp g-eq-pode-n">Vale para quem entra com o próprio login. Quem só aparece na agenda não abre nada. Caixa, Financeiro e Relatórios são as áreas que mostram valores.</p>
        </details>}
      </div>

      {aberto?.tipo === "novo" && <AdicionarPessoa aoFechar={() => setAberto(null)} />}
      {aberto?.tipo === "editar" && pessoaAberta && <EditarPessoa key={pessoaAberta.id} pessoa={pessoaAberta} foco={aberto.foco} aoFechar={() => setAberto(null)} />}
      {aberto?.tipo === "convite" && pessoaAberta && <FolhaConvite pessoa={pessoaAberta} aoFechar={() => setAberto(null)} />}
    </>
  );
}

/* ---------- acessos do plano ---------- */

function BlocoDoPlano({ uso, aoAdicionar }: { uso: Uso; aoAdicionar: () => void }) {
  const { plano, proximo, livres, cheio, emTeste } = uso;
  const linha = emTeste
    ? "Durante o teste valem os 6 acessos do plano Pet shop. Na hora de assinar, você escolhe pelo número de pessoas com login."
    : cheio
      ? proximo ? `Todos em uso. Para dar login a mais gente, o plano ${proximo.nome} tem ${nAcessos(proximo.acessos)}.` : "Todos em uso. Este é o maior plano."
      : livres === 1 && proximo
        ? `Sobra 1 acesso. Se mais gente precisar de login, o plano ${proximo.nome} tem ${nAcessos(proximo.acessos)}.`
        : `${livres === 1 ? "Sobra 1 acesso" : `Sobram ${livres} acessos`}.`;
  const mostraPlanos = !emTeste && !!proximo && livres <= 1;
  return (
    <section className={`g-eq-plano${cheio && !emTeste ? " cheio" : ""}`}>
      <div className="g-eq-plano-t">
        <p className="g-rotulo">{emTeste ? "Pessoas com login · período de teste" : "Pessoas com login"}</p>
        <h2>Acessos do plano {plano.nome}: <em>{uso.usados} de {uso.limite} em uso</em></h2>
      </div>
      <Vagas uso={uso} aoAdicionar={aoAdicionar} />
      <p className="g-eq-plano-n">{linha} <span className="g-eq-plano-c">Conta quem entra no sistema: você, recepção, financeiro, gerente, sócio. Quem só aparece na agenda, como banhista e tosador, não ocupa acesso.</span></p>
      <div><Link className="g-eq-plano-l" href="/gestao/app/assinatura">{mostraPlanos ? "Ver os planos" : "Ver a assinatura"}<ArrowRight size={16} aria-hidden /></Link></div>
    </section>
  );
}

/* ---------- escala da semana ---------- */

function EscalaDaSemana() {
  const { petshop, equipe } = useGestao();
  const loja = lerHorario(petshop.horario);
  const quem = equipe.filter((p) => p.ativo && naEscala(p));
  const hoje = String(new Date().getDay());
  return (
    <section className="g-card">
      <div className="g-card-t"><h3><Tile icone={CalendarDays} tom="ceu" tamanho="p" />Escala da semana</h3><span className="g-muted g-pp">entrada e saída</span></div>
      <div className="g-eq-escala">
        <span />
        {ORDEM_DIAS.map((d) => (
          <span key={d} className={`g-eq-esc-dia${d === hoje ? " hoje" : ""}${loja[d] ? "" : " fechado"}`} title={loja[d] ? NOME_DIAS[d] : `${NOME_DIAS[d]}: fechado`}>
            <abbr title={NOME_DIAS[d]}>{NOME_DIAS[d].slice(0, 3)}</abbr>
          </span>
        ))}
        {quem.map((p) => (
          <Fragment key={p.id}>
            <span className="g-eq-esc-nome"><i style={{ background: p.cor }} aria-hidden />{p.nome.split(" ")[0]}</span>
            {ORDEM_DIAS.map((d) => {
              const h = p.escala ? lerHorario(p.escala)[d] : loja[d];
              return h ? (
                <span key={d} className={`g-eq-esc-cel on${d === hoje ? " hoje" : ""}`} style={{ "--cor": p.cor } as React.CSSProperties} title={`${p.nome}, ${NOME_DIAS[d]}: ${h.abre}–${h.fecha}`}>
                  <b>{horaCurta(h.abre)}</b><b>{horaCurta(h.fecha)}</b>
                  <span className="g-eq-so-leitor">{NOME_DIAS[d]}, das {h.abre} às {h.fecha}</span>
                </span>
              ) : <span key={d} className={`g-eq-esc-cel${loja[d] ? "" : " fechado"}`}><span className="g-eq-so-leitor">{NOME_DIAS[d]}: {loja[d] ? "folga" : "fechado"}</span></span>;
            })}
          </Fragment>
        ))}
      </div>
      {!quem.length && <p className="g-muted g-p" style={{ marginTop: 10 }}>Ninguém escalado. A escala mostra quem atende os pets ou tem dias próprios.</p>}
      <div className="g-eq-leg">
        <span><i className="on" aria-hidden />trabalha</span>
        <span><i aria-hidden />folga</span>
        {ORDEM_DIAS.some((d) => !loja[d]) && <span><i className="fechado" aria-hidden />pet shop fechado</span>}
      </div>
      <p className="g-muted g-pp" style={{ marginTop: 10 }}>Para mudar os dias de alguém, toque no cartão da pessoa.</p>
    </section>
  );
}
