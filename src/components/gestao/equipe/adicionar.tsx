"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, KeyRound, UserRound } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Folha, avisarMudanca, ok, useAvisos } from "@/components/gestao/ui";
import { CORES, erroDoHorario, lerHorario } from "@/components/gestao/ajustes/grade-horario";
import type { Horario } from "@/lib/gestao/tipos";
import { ESCOLHA_VAZIA, camposDaEscolha, ehSocio, emailValido, erroDeLimite, lerComissao, nAcessos, perfilPorId, primeiroNome, sugereLogin, usoDoPlano, type Escolha } from "./modelo";
import { Areas, Chave, Convite, DetalhesAgenda, EscolherPerfil, ModelosProntos, Opcao, PlanoCheio, Trilho, Vagas } from "./pecas";

type Passo = "quem" | "login" | "areas" | "detalhes";

/**
 * Adicionar pessoa em passos curtos: quem é e o que faz, se entra no sistema, o que abre (só com login)
 * e os detalhes da agenda. Banhista e tosador seguem o caminho mais comum: sem login, só na agenda.
 */
export default function AdicionarPessoa({ aoFechar }: { aoFechar: () => void }) {
  const { sb, petshop, equipe, user, recarregarBase } = useGestao();
  const { avisarErro, confirmar } = useAvisos();
  const loja = lerHorario(petshop.horario);
  const uso = usoDoPlano(petshop, equipe);

  const [passo, setPasso] = useState<Passo>("quem");
  const [nome, setNome] = useState("");
  const [escolha, setEscolha] = useState<Escolha>(ESCOLHA_VAZIA);
  const [comLogin, setComLogin] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [cor, setCor] = useState(() => CORES[equipe.length % CORES.length]);
  const [comissao, setComissao] = useState("");
  const [segueLoja, setSegueLoja] = useState(true);
  const [escala, setEscala] = useState<Horario>(loja);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState<{ nome: string; email: string | null; atende: boolean } | null>(null);

  const topo = useRef<HTMLDivElement>(null);
  useEffect(() => { topo.current?.scrollIntoView({ block: "start" }); }, [passo, feito]);

  const n = nome.trim();
  const primeiro = primeiroNome(n);
  const socio = ehSocio(escolha);
  const e = email.trim().toLowerCase();
  const semVaga = uso.cheio;
  const sugerido = sugereLogin(escolha.perfil);
  const passos: Passo[] = ["quem", "login", ...(comLogin ? (["areas"] as Passo[]) : []), "detalhes"];
  const indice = passos.indexOf(passo);
  const ultimo = indice === passos.length - 1;
  const rotuloPasso = `Passo ${indice + 1} de ${passos.length}`;

  function recomecar() {
    setPasso("quem"); setNome(""); setEscolha(ESCOLHA_VAZIA); setComLogin(null); setEmail(""); setComissao(""); setSegueLoja(true); setEscala(loja);
    setCor(CORES[(equipe.length + 1) % CORES.length]); setErro(null); setFeito(null);
  }

  function conferir(): string | null {
    if (passo === "quem") {
      if (n.length < 2) return "Escreva o nome da pessoa.";
      if (!escolha.perfil) return "Escolha o que essa pessoa faz.";
      if (escolha.perfil === "outra" && !escolha.nome.trim()) return "Escreva o nome da função.";
    }
    if (passo === "login") {
      if (comLogin === null || (comLogin && semVaga)) return socio && semVaga ? "Sócio precisa de login, e o plano está sem acesso livre." : `Diga se ${primeiro} vai entrar no sistema.`;
      if (socio && !comLogin) return "Sócio precisa de login.";
      if (comLogin) {
        if (!e) return `Escreva o e-mail de ${primeiro}. É com ele que a conta vai ser criada.`;
        if (!emailValido(e)) return "Confira o e-mail: parece faltar alguma coisa.";
        if (e === user.email?.toLowerCase()) return "Esse é o seu próprio e-mail. Use o e-mail da pessoa.";
        if (equipe.some((p) => p.email_convite?.trim().toLowerCase() === e)) return "Esse e-mail já está em outra pessoa da equipe.";
      }
    }
    if (passo === "areas" && !socio && !escolha.areas.length) return "Ligue pelo menos uma área, ou volte e escolha sem login.";
    if (passo === "detalhes") {
      if (lerComissao(comissao) === null) return "A comissão fica entre 0 e 100%.";
      if (!segueLoja) return erroDoHorario(escala);
    }
    return null;
  }

  async function continuar() {
    const problema = conferir();
    setErro(problema);
    if (problema) return;
    if (passo === "quem" && comLogin === null && sugerido === false) setComLogin(false); // banhista e tosador: o comum é sem login
    if (passo === "quem" && socio) setComLogin(semVaga ? null : true);
    if (!ultimo) { setPasso(passos[indice + 1]); return; }

    if (socio && !(await confirmar({
      titulo: `${primeiro} vai ser sócio?`,
      texto: `${primeiro} vai poder mexer na equipe, nos ajustes do pet shop e na assinatura, como você.`,
      confirmar: "Sim, é sócio",
    }))) return;

    setSalvando(true);
    try {
      ok(await sb.from("profissionais").insert({
        petshop_id: petshop.id, nome: n.slice(0, 80), ...camposDaEscolha(escolha, !!comLogin), atende: escolha.atende, cor,
        comissao_pct: lerComissao(comissao) ?? 0, escala: segueLoja ? null : escala, email_convite: comLogin ? e : null,
      }).select("id"));
      await recarregarBase();
      avisarMudanca();
      setFeito({ nome: n, email: comLogin ? e : null, atende: escolha.atende });
    } catch (x) {
      if (erroDeLimite(x)) {
        // alguém ocupou a vaga enquanto o formulário estava aberto: volta ao passo do login com a conta atualizada
        await recarregarBase().catch(() => undefined);
        setComLogin(null);
        setPasso("login");
        setErro(socio ? "O plano não tem mais acesso livre, e sócio precisa de login." : "O plano não tem mais acesso livre. Você ainda pode adicionar sem login.");
      } else avisarErro(x);
    } finally { setSalvando(false); }
  }

  const rodape = feito ? (
    <>
      <button className="g-btn sec" onClick={recomecar}>Adicionar outra pessoa</button>
      <button className="g-btn pri" onClick={aoFechar}>Concluir</button>
    </>
  ) : (
    <>
      {indice === 0
        ? <button className="g-btn fantasma" onClick={aoFechar}>Cancelar</button>
        : <button className="g-btn fantasma" onClick={() => { setErro(null); setPasso(passos[indice - 1]); }} disabled={salvando}><ArrowLeft />Voltar</button>}
      <button className="g-btn pri" onClick={() => void continuar()} disabled={salvando}>
        {!ultimo ? <>Continuar<ArrowRight /></> : salvando ? "Adicionando…" : <><Check />Adicionar {primeiro}</>}
      </button>
    </>
  );

  return (
    <Folha larga titulo="Adicionar pessoa" aoFechar={aoFechar} rodape={rodape}>
      <div className="g-eq-passos" ref={topo}>
        <Trilho passo={feito ? passos.length : indice} total={passos.length} />

        {!feito && passo === "quem" && (
          <div className="g-pilha">
            <div><p className="g-rotulo">{rotuloPasso}</p><h3 className="g-eq-h">Quem é e o que faz?</h3></div>
            <label className="g-campo"><span>Nome</span>
              <input className="g-input" value={nome} maxLength={80} autoFocus placeholder="Como vocês chamam no dia a dia" onChange={(ev) => setNome(ev.target.value)} />
            </label>
            <div className="g-pilha p">
              <p className="g-eq-pergunta">O que essa pessoa faz?</p>
              <EscolherPerfil valor={escolha} aoMudar={(v) => { setEscolha(v); setErro(null); }} />
            </div>
            {escolha.perfil && (
              <div className="g-pilha p">
                <p className="g-eq-pergunta">Essa pessoa atende os pets?</p>
                <Chave titulo={escolha.atende ? "Sim, atende" : "Não atende"} texto={escolha.atende ? "Aparece na agenda para escolher em cada horário." : "Não aparece para escolher nos horários."}
                  ligada={escolha.atende} aoMudar={(v) => setEscolha({ ...escolha, atende: v })} />
              </div>
            )}
          </div>
        )}

        {!feito && passo === "login" && (
          <div className="g-pilha">
            <div>
              <p className="g-rotulo">{rotuloPasso}</p>
              <h3 className="g-eq-h">{primeiro} vai entrar no sistema?</h3>
              <p className="g-muted g-p">
                {sugerido === false
                  ? "Banhista e tosador quase nunca precisam: você marca os horários e eles aparecem na agenda. Login é para quem usa o sistema, como recepção, financeiro, gerente ou sócio."
                  : "Login é para quem usa o sistema no dia a dia: recepção, financeiro, gerente ou sócio. Cada pessoa com login ocupa 1 acesso do plano."}
              </p>
            </div>

            <div className="g-eq-opcoes">
              <Opcao icone={iconeDoNao(escolha.atende)} tom="pessego"
                titulo={escolha.atende ? "Não, só aparece na agenda" : "Não, por enquanto"}
                texto={socio ? "Sócio precisa de login para mexer no sistema." : escolha.atende ? "Você marca os horários por essa pessoa. Não ocupa acesso." : "Fica na equipe, sem entrar no sistema. Não ocupa acesso."}
                selo={sugerido === false ? "mais comum" : undefined} travado={socio}
                marcado={comLogin === false && !socio} aoEscolher={() => { setComLogin(false); setErro(null); }}>
                <p className="g-eq-nota">
                  {escolha.atende
                    ? `${primeiro} aparece para escolher em cada horário. Se um dia precisar, dá para dar login depois.`
                    : `Como ${primeiro} não atende os pets, sem login não aparece na agenda: fica só na lista da equipe. Dá para dar login depois.`}
                </p>
              </Opcao>
              <Opcao icone={KeyRound} tom="menta" titulo="Sim, com o próprio login"
                texto={semVaga ? "Agora não dá: o plano está sem acesso livre." : "Usa no próprio celular. Ocupa 1 acesso do plano."}
                selo={sugerido && !semVaga ? (socio ? "precisa" : "mais comum") : undefined}
                travado={semVaga} marcado={comLogin === true && !semVaga} aoEscolher={() => { setComLogin(true); setErro(null); }}>
                <label className="g-campo"><span>E-mail de {primeiro}</span>
                  <input className="g-input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="nome@email.com" value={email}
                    onChange={(ev) => { setEmail(ev.target.value); setErro(null); }} />
                  <small>É com esse e-mail que a pessoa vai criar a conta. Precisa ser exatamente o mesmo: é assim que o sistema sabe que ela é da sua equipe. A senha é a própria pessoa quem escolhe.</small>
                </label>
              </Opcao>
            </div>

            {(comLogin || semVaga) && (
              <div className="g-eq-uso">
                <p className="g-eq-uso-t">Acessos do plano {uso.plano.nome}: <b>{uso.usados + (comLogin && !semVaga ? 1 : 0)} de {uso.limite} em uso</b></p>
                <Vagas uso={uso} nova={comLogin && !semVaga ? { nome: n, cor } : null} />
                <p className="g-eq-uso-n">
                  {uso.emTeste ? "Durante o teste valem os 6 acessos do plano Pet shop. " : ""}Só conta quem tem login ou convite. Quem só aparece na agenda não ocupa acesso.
                </p>
                {semVaga && <PlanoCheio uso={uso} ainda={socio ? undefined : `${primeiro} ainda pode entrar na equipe sem login.`} />}
              </div>
            )}
          </div>
        )}

        {!feito && passo === "areas" && (
          <div className="g-pilha">
            <div>
              <p className="g-rotulo">{rotuloPasso}</p>
              <h3 className="g-eq-h">O que {primeiro} pode abrir?</h3>
              <p className="g-muted g-p">
                {socio
                  ? `${primeiro} é sócio: abre tudo, como você.`
                  : `Já veio marcado o comum para ${perfilPorId(escolha.perfil)?.titulo ?? "essa função"}. Ligue e desligue à vontade: ${primeiro} só vê no menu o que estiver ligado.`}
              </p>
            </div>
            <ModelosProntos valor={escolha} aoMudar={(v) => { setEscolha(v); setErro(null); }} />
            <Areas areas={escolha.areas} socio={socio} aoMudar={(a) => { setEscolha({ ...escolha, areas: a }); setErro(null); }} />
          </div>
        )}

        {!feito && passo === "detalhes" && (
          <div className="g-pilha">
            <div>
              <p className="g-rotulo">{rotuloPasso} · pode pular</p>
              <h3 className="g-eq-h">Detalhes de {primeiro}</h3>
              <p className="g-muted g-p">Se preferir, toque em Adicionar e ajuste depois. Dá para mudar tudo no cartão da pessoa.</p>
            </div>
            <DetalhesAgenda nome={n} cor={cor} aoCor={setCor} comissao={comissao} aoComissao={(c) => { setComissao(c); setErro(null); }}
              segueLoja={segueLoja} aoSegueLoja={setSegueLoja} escala={escala} aoEscala={(h) => { setEscala(h); setErro(null); }} loja={loja} />
          </div>
        )}

        {feito && (
          <div className="g-eq-fim">
            <span className="g-eq-fim-ok" aria-hidden><Check /></span>
            <h3 className="g-eq-h">Pronto, {primeiroNome(feito.nome)} está na equipe.</h3>
            {feito.email ? (
              <>
                <p className="g-muted">Falta só mandar o convite. O acesso já está guardado para {primeiroNome(feito.nome)}: {uso.usados} de {nAcessos(uso.limite)} em uso.</p>
                <Convite nome={feito.nome} email={feito.email} />
              </>
            ) : (
              <p className="g-muted">
                {feito.atende
                  ? `${primeiroNome(feito.nome)} já aparece na agenda para você marcar os horários. Não ocupa acesso do plano.`
                  : `${primeiroNome(feito.nome)} já está na lista da equipe. Se quiser dar login depois, é só tocar no cartão.`}
              </p>
            )}
          </div>
        )}

        {erro && <p className="g-erro" role="alert">{erro}</p>}
      </div>
    </Folha>
  );
}

const iconeDoNao = (atende: boolean) => (atende ? CalendarDays : UserRound);
