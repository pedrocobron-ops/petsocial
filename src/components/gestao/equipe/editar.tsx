"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Hourglass, KeyRound, LayoutGrid, Lock, Send, UserRound } from "lucide-react";
import { Tile } from "@/components/gestao/painel";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPessoa, Folha, avisarMudanca, ok, useAvisos } from "@/components/gestao/ui";
import { erroDoHorario, lerHorario } from "@/components/gestao/ajustes/grade-horario";
import type { Database } from "@/lib/gestao/banco";
import type { Horario, Profissional } from "@/lib/gestao/tipos";
import { FRASE_TITULAR, acessoDe, camposDaEscolha, ehSocio, emailValido, erroDeLimite, erroDoTitular, escolhaDe, lerComissao, primeiroNome, titularDe, usoDoPlano, type Escolha } from "./modelo";
import { Areas, Chave, Convite, DetalhesAgenda, EscolherPerfil, PlanoCheio, Vagas } from "./pecas";

/** O convite de quem ainda não criou a conta, para mandar de novo. */
export function FolhaConvite({ pessoa, aoFechar }: { pessoa: Profissional; aoFechar: () => void }) {
  return (
    <Folha titulo={`Convite de ${primeiroNome(pessoa.nome)}`} aoFechar={aoFechar} rodape={<button className="g-btn sec" onClick={aoFechar}>Fechar</button>}>
      <div className="g-pilha">
        <p className="g-muted g-p">{primeiroNome(pessoa.nome)} ainda não criou a conta. Mande o convite de novo: ele continua valendo.</p>
        <Convite nome={pessoa.nome} email={pessoa.email_convite ?? ""} />
      </div>
    </Folha>
  );
}

/** Editar pessoa: função, acesso, áreas, agenda e comissão numa folha só. */
export default function EditarPessoa({ pessoa, foco, aoFechar }: { pessoa: Profissional; foco?: "acesso"; aoFechar: () => void }) {
  const { sb, petshop, equipe, eu, user, recarregarBase } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const loja = lerHorario(petshop.horario);
  const uso = usoDoPlano(petshop, equipe);
  const acesso = acessoDe(pessoa);
  const primeiro = primeiroNome(pessoa.nome);
  const titular = pessoa.id === titularDe(equipe);
  const souEu = pessoa.id === eu.id;
  // o titular continua dono, e ninguém rebaixa nem desativa a si mesmo
  const travada = titular || souEu;

  const [nome, setNome] = useState(pessoa.nome);
  const [escolha, setEscolha] = useState<Escolha>(() => escolhaDe(pessoa));
  const [mexeu, setMexeu] = useState(false);
  const [cor, setCor] = useState(pessoa.cor);
  const [comissao, setComissao] = useState(Number(pessoa.comissao_pct) > 0 ? String(Number(pessoa.comissao_pct)).replace(".", ",") : "");
  const [segueLoja, setSegueLoja] = useState(!pessoa.escala);
  const [escala, setEscala] = useState<Horario>(() => (pessoa.escala ? lerHorario(pessoa.escala) : loja));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const avisoErro = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (erro) avisoErro.current?.scrollIntoView({ block: "nearest" }); }, [erro]);

  // acesso: cada ação grava na hora, sem esperar o Salvar
  const [dando, setDando] = useState(foco === "acesso" && acesso === "sem");
  const [email, setEmail] = useState(pessoa.email_convite ?? "");
  const [erroAcesso, setErroAcesso] = useState<string | null>(null);
  const [verConvite, setVerConvite] = useState(false);
  const [mexendo, setMexendo] = useState(false);
  const secaoAcesso = useRef<HTMLElement>(null);
  useEffect(() => { if (foco === "acesso") secaoAcesso.current?.scrollIntoView({ block: "start" }); }, [foco]);

  const socio = pessoa.papel === "dono" ? (travada || !mexeu || ehSocio(escolha)) : ehSocio(escolha);
  const viraSocio = !travada && ehSocio(escolha) && pessoa.papel !== "dono";
  const mudar = (v: Escolha) => { setEscolha(v); setMexeu(true); setErro(null); };

  async function gravar(campos: Database["public"]["Tables"]["profissionais"]["Update"]) {
    ok(await sb.from("profissionais").update(campos).eq("id", pessoa.id).eq("petshop_id", petshop.id).select("id"));
    await recarregarBase();
    avisarMudanca();
  }
  const confirmarSocio = () => confirmar({
    titulo: `${primeiro} vai ser sócio?`,
    texto: `${primeiro} vai poder mexer na equipe, nos ajustes do pet shop e na assinatura, como você.`,
    confirmar: "Sim, é sócio",
  });
  const tratar = (x: unknown) => avisarErro(erroDoTitular(x) ? new Error(FRASE_TITULAR) : x);

  async function salvar() {
    const n = nome.trim();
    const c = lerComissao(comissao);
    const mudaFuncao = mexeu && !travada;
    if (!n) return setErro("Escreva o nome da pessoa.");
    if (mudaFuncao && escolha.perfil === "outra" && !escolha.nome.trim()) return setErro("Escreva o nome da função.");
    if (mudaFuncao && ehSocio(escolha) && acesso === "sem") return setErro(`Sócio precisa de login. Dê login a ${primeiro} na parte Acesso e depois salve.`);
    if (mudaFuncao && !ehSocio(escolha) && acesso !== "sem" && !escolha.areas.length) return setErro("Ligue pelo menos uma área, ou tire o acesso da pessoa.");
    if (c === null) return setErro("A comissão fica entre 0 e 100%.");
    const problema = segueLoja ? null : erroDoHorario(escala);
    if (problema) return setErro(problema);
    setErro(null);
    if (mudaFuncao && viraSocio && !(await confirmarSocio())) return;
    setSalvando(true);
    try {
      await gravar({
        nome: n.slice(0, 80), cor, comissao_pct: c, escala: segueLoja ? null : escala, atende: escolha.atende,
        // só troca função e áreas se a pessoa mexeu nelas; assim quem veio do modelo antigo continua como estava
        ...(mudaFuncao ? camposDaEscolha(escolha, acesso !== "sem") : {}),
      });
      avisar("Salvo.");
      aoFechar();
    } catch (x) { tratar(x); setSalvando(false); }
  }

  async function darLogin() {
    const e = email.trim().toLowerCase();
    if (!e) return setErroAcesso(`Escreva o e-mail de ${primeiro}. É com ele que a conta vai ser criada.`);
    if (!emailValido(e)) return setErroAcesso("Confira o e-mail: parece faltar alguma coisa.");
    if (e === user.email?.toLowerCase()) return setErroAcesso("Esse é o seu próprio e-mail. Use o e-mail da pessoa.");
    if (equipe.some((p) => p.id !== pessoa.id && p.email_convite?.trim().toLowerCase() === e)) return setErroAcesso("Esse e-mail já está em outra pessoa da equipe.");
    if (acesso === "sem" && !ehSocio(escolha) && !escolha.areas.length) return setErroAcesso("Ligue pelo menos uma área para a pessoa abrir.");
    if (acesso === "sem" && escolha.perfil === "outra" && !escolha.nome.trim()) return setErroAcesso("Escreva o nome da função, lá em cima.");
    setErroAcesso(null);
    if (acesso === "sem" && viraSocio && !(await confirmarSocio())) return;
    setMexendo(true);
    try {
      // ao dar login, as áreas escolhidas entram junto; ao só trocar o e-mail, nada mais muda
      await gravar(acesso === "sem" ? { email_convite: e, ...camposDaEscolha(escolha, true) } : { email_convite: e });
      if (acesso === "sem") setMexeu(false);
      setDando(false);
      setVerConvite(true);
      avisar(acesso === "convite" ? "E-mail trocado. Mande o convite novo." : `${primeiro} já tem um acesso guardado. Agora é só mandar o convite.`);
    } catch (x) {
      if (erroDeLimite(x)) { await recarregarBase().catch(() => undefined); setErroAcesso("O plano não tem mais acesso livre."); }
      else tratar(x);
    } finally { setMexendo(false); }
  }

  async function tirarAcesso() {
    const eraSocio = pessoa.papel === "dono";
    const sim = await confirmar({
      titulo: `Tirar o acesso de ${primeiro}?`,
      texto: `${acesso === "login" ? `${primeiro} deixa de entrar no sistema` : "O convite deixa de valer"} e a vaga do plano fica livre. ${primeiro} continua na equipe${pessoa.atende ? " e na agenda" : ""}${eraSocio ? ", mas deixa de ser sócio" : ""}.`,
      confirmar: "Tirar o acesso", perigo: true,
    });
    if (!sim) return;
    setMexendo(true);
    try {
      // sem login não há áreas; e sócio sem login não existe
      if (acesso === "login") {
        // quem já criou a conta: o vínculo com o login só sai pela função do banco
        const r = await sb.rpc("tirar_acesso", { p_id: pessoa.id });
        if (r.error) throw new Error(r.error.message);
        await recarregarBase();
        avisarMudanca();
      } else await gravar({ email_convite: null, acessos: null, ve_financeiro: false, ...(eraSocio ? { papel: "funcionario" as const } : {}) });
      setVerConvite(false); setDando(false); setEmail("");
      avisar(`${primeiro} ficou sem login. A vaga do plano está livre.`);
    } catch (x) { tratar(x); } finally { setMexendo(false); }
  }

  async function desativar() {
    if (travada) return;
    const sim = await confirmar({
      titulo: `Desativar ${pessoa.nome}?`,
      texto: `${primeiro} some da agenda${acesso === "sem" ? "" : ", deixa de entrar no sistema e libera a vaga do plano"}. O histórico fica guardado e você pode reativar quando quiser.`,
      confirmar: "Desativar", perigo: true,
    });
    if (!sim) return;
    setSalvando(true);
    try {
      ok(await sb.from("profissionais").update({ ativo: false }).eq("id", pessoa.id).eq("petshop_id", petshop.id).select("id"));
      await recarregarBase();
      avisarMudanca();
      avisar(`${pessoa.nome} não aparece mais na agenda.`);
      aoFechar();
    } catch (x) { tratar(x); setSalvando(false); }
  }

  const campoEmail = (
    <div className="g-eq-dar">
      <label className="g-campo"><span>E-mail de {primeiro}</span>
        <input className="g-input" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="nome@email.com" value={email}
          onChange={(ev) => { setEmail(ev.target.value); setErroAcesso(null); }} />
        <small>É com esse e-mail que ela vai criar a conta. Precisa ser exatamente o mesmo: é assim que o sistema sabe que ela é da sua equipe.</small>
      </label>
      {acesso === "sem" && <p className="g-muted g-pp">As áreas que {primeiro} vai abrir estão logo abaixo. Confira antes de dar o login.</p>}
      {erroAcesso && <p className="g-erro" role="alert">{erroAcesso}</p>}
      <div className="g-fila">
        <button type="button" className="g-btn p verde" onClick={() => void darLogin()} disabled={mexendo}>{mexendo ? "Gravando…" : acesso === "convite" ? "Trocar e gerar convite" : "Dar login e gerar convite"}</button>
        <button type="button" className="g-btn p fantasma" onClick={() => { setDando(false); setErroAcesso(null); setEmail(pessoa.email_convite ?? ""); }} disabled={mexendo}>Agora não</button>
      </div>
    </div>
  );

  const mostraAreas = acesso !== "sem" || dando;

  return (
    <Folha larga titulo={pessoa.nome} aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <div className="g-eq-editar">
        <div className="g-eq-quem">
          <AvatarPessoa nome={nome || pessoa.nome} cor={cor} tamanho="g" />
          <label className="g-campo"><span>Nome</span>
            <input className="g-input" value={nome} maxLength={80} onChange={(ev) => { setNome(ev.target.value); setErro(null); }} />
          </label>
        </div>

        <section className="g-eq-secao">
          <h3 className="g-eq-secao-t"><Tile icone={UserRound} tom="lilas" tamanho="p" />Função</h3>
          {travada ? (
            <p className="g-muted g-p">
              {titular
                ? `${souEu ? "Você é o titular da conta" : `${primeiro} é titular da conta`}: abre tudo e continua como dono. Para trocar o titular, fale com a nossa equipe.`
                : "Você é sócio: abre tudo. Só outro dono pode mudar a sua função."}
            </p>
          ) : (
            <EscolherPerfil valor={escolha} aoMudar={mudar} />
          )}
          <div className="g-pilha p">
            <p className="g-eq-pergunta">{souEu ? "Você atende os pets?" : "Essa pessoa atende os pets?"}</p>
            <Chave titulo={escolha.atende ? "Sim, atende" : "Não atende"} texto={escolha.atende ? "Aparece na agenda para escolher em cada horário." : "Não aparece para escolher nos horários."}
              ligada={escolha.atende} aoMudar={(v) => setEscolha({ ...escolha, atende: v })} />
          </div>
        </section>

        <section className="g-eq-secao" ref={secaoAcesso}>
          <h3 className="g-eq-secao-t"><Tile icone={KeyRound} tom="menta" tamanho="p" />Acesso</h3>

          {acesso === "login" && (
            <div className="g-eq-estado ok">
              <i className="g-eq-estado-i" aria-hidden><KeyRound /></i>
              <p className="g-eq-estado-t">
                <b>Com login</b>
                <small>{titular ? "Esta é a conta que criou o pet shop." : `${souEu ? "Você entra" : `${primeiro} entra`} com a própria conta${pessoa.email_convite ? ` (${pessoa.email_convite})` : ""} e ocupa 1 acesso do plano.`}</small>
              </p>
            </div>
          )}
          {acesso === "login" && !travada && (
            <>
              <div className="g-fila"><button type="button" className="g-btn p perigo" onClick={() => void tirarAcesso()} disabled={mexendo}>Tirar o acesso</button></div>
              <p className="g-muted g-pp">Tirar o acesso libera a vaga do plano. {primeiro} continua na equipe{pessoa.atende ? " e na agenda" : ""}, mas não entra mais no sistema.</p>
            </>
          )}

          {acesso === "convite" && (
            <>
              <div className="g-eq-estado espera">
                <i className="g-eq-estado-i" aria-hidden><Hourglass /></i>
                <p className="g-eq-estado-t">
                  <b>Convite enviado, esperando criar a conta</b>
                  <small>{pessoa.email_convite} · já ocupa 1 acesso do plano</small>
                </p>
              </div>
              {verConvite && <Convite nome={pessoa.nome} email={pessoa.email_convite ?? ""} />}
              {dando ? campoEmail : (
                <div className="g-fila">
                  {!verConvite && <button type="button" className="g-btn p verde" onClick={() => setVerConvite(true)}><Send />Reenviar convite</button>}
                  <button type="button" className="g-btn p sec" onClick={() => { setDando(true); setVerConvite(false); }} disabled={mexendo}>Trocar o e-mail</button>
                  <button type="button" className="g-btn p perigo" onClick={() => void tirarAcesso()} disabled={mexendo}>Tirar o acesso</button>
                </div>
              )}
              <p className="g-muted g-pp">Tirar o acesso libera a vaga do plano. {primeiro} continua na equipe{pessoa.atende ? " e na agenda" : ""}.</p>
            </>
          )}

          {acesso === "sem" && (
            <>
              <div className="g-eq-estado">
                <i className="g-eq-estado-i" aria-hidden>{pessoa.atende ? <CalendarDays /> : <Lock />}</i>
                <p className="g-eq-estado-t">
                  <b>{pessoa.atende ? "Sem login, só na agenda" : "Sem login"}</b>
                  <small>{pessoa.atende ? "Você marca os horários por ela. Não ocupa acesso do plano." : "Não entra no sistema e não ocupa acesso do plano."}</small>
                </p>
              </div>
              {dando ? (
                <>
                  <div className="g-eq-uso">
                    <p className="g-eq-uso-t">Acessos do plano {uso.plano.nome}: <b>{uso.usados + (uso.cheio ? 0 : 1)} de {uso.limite} em uso</b></p>
                    <Vagas uso={uso} nova={uso.cheio ? null : { nome: pessoa.nome, cor }} />
                    {uso.emTeste && !uso.cheio && <p className="g-eq-uso-n">Durante o teste valem os 6 acessos do plano Pet shop.</p>}
                    {uso.cheio && <PlanoCheio uso={uso} ainda={`${primeiro} continua na equipe sem login.`} />}
                  </div>
                  {uso.cheio
                    ? <div><button type="button" className="g-btn p fantasma" onClick={() => setDando(false)}>Agora não</button></div>
                    : campoEmail}
                </>
              ) : (
                <div className="g-fila">
                  <button type="button" className="g-btn p sec" onClick={() => setDando(true)}><KeyRound />Dar login</button>
                  <span className="g-muted g-pp">Só para quem vai usar o sistema. Ocupa 1 acesso do plano.</span>
                </div>
              )}
            </>
          )}
        </section>

        {mostraAreas && (
          <section className="g-eq-secao">
            <h3 className="g-eq-secao-t"><Tile icone={LayoutGrid} tom="ceu" tamanho="p" />O que {souEu ? "você abre" : `${primeiro} abre`}</h3>
            {!socio && <p className="g-muted g-p">{primeiro} só vê no menu o que estiver ligado. Trocar a função lá em cima preenche estas chaves de novo.</p>}
            <Areas areas={escolha.areas} socio={socio} aoMudar={travada ? undefined : (a) => mudar({ ...escolha, areas: a })} />
          </section>
        )}

        <section className="g-eq-secao">
          <h3 className="g-eq-secao-t"><Tile icone={CalendarDays} tom="pessego" tamanho="p" />Agenda e comissão</h3>
          <DetalhesAgenda nome={nome} cor={cor} aoCor={setCor} comissao={comissao} aoComissao={(c) => { setComissao(c); setErro(null); }}
            segueLoja={segueLoja} aoSegueLoja={setSegueLoja} escala={escala} aoEscala={(h) => { setEscala(h); setErro(null); }} loja={loja} />
        </section>

        {!travada && (
          <section className="g-eq-secao g-eq-sair">
            <div className="g-eq-sair-t">
              <b>Desativar {primeiro}</b>
              <small>Some da agenda{acesso === "sem" ? "" : " e perde o acesso"}. O histórico fica guardado e dá para reativar.</small>
            </div>
            <button type="button" className="g-btn p perigo" onClick={() => void desativar()} disabled={salvando}>Desativar pessoa</button>
          </section>
        )}

        {erro && <p className="g-erro" role="alert" ref={avisoErro}>{erro}</p>}
      </div>
    </Folha>
  );
}
