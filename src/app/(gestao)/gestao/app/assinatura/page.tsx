"use client";

import { useEffect, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { AlertTriangle, BadgeCheck, Check, Clock, Database, ExternalLink, Gift, Lock, MessageCircle, Sparkles, Store, Ticket, User, Users } from "lucide-react";
import { Tile, type Tom } from "@/components/gestao/painel";
import { useGestao } from "@/components/gestao/contexto";
import { Vazio, useDados } from "@/components/gestao/ui";
import { linkSuporte } from "@/lib/gestao/contato";
import { artigoDe } from "@/lib/gestao/modulos";
import { DIAS_DE_ATRASO_PADRAO, PERIODOS, PLANOS, TEXTOS_ASSINAR, TEXTO_TAXA, conselhoDoPlano, limparCupom, linkDoCheckout, ofertaDe, planoPorId, textoParaAssinar, textoPessoas, type PeriodoId, type PlanoId } from "@/lib/gestao/planos";
import { linhaDoVendedor, temVendedor, vendedorDe } from "@/lib/gestao/vendedor";
import { ocupaAcesso } from "@/components/gestao/equipe/modelo";
import { TEXTO_TESTE } from "@/components/gestao/fim-do-teste";
import { brlCurto, dataCompleta, dataCurta } from "@/lib/gestao/util";
import "@/components/gestao/ajustes/ajustes.css";
import "./assinatura.css";

const PORTAL = "https://assinatura.cakto.com.br/";
const DIAS_DE_TESTE = 7;
const INCLUI = [
  "Agenda de banho e tosa",
  "Clientes e pets",
  "Caixa e financeiro",
  "Estoque",
  "Pacotes",
  "Creche e hotel",
  "Equipe",
  "Mozart, o assistente de inteligência artificial, por áudio e texto",
];

const VISUAL: Record<PlanoId, { icone: React.ComponentType<{ size?: number }>; tom: Tom }> = {
  solo: { icone: User, tom: "ceu" },
  equipe: { icone: Users, tom: "menta" },
  petshop: { icone: Store, tom: "pessego" },
};
const MAIOR = Math.max(...PLANOS.map((p) => p.acessos));

/** Bolinhas de pessoas: quantas entram com login neste plano, de quantas cabem no maior. */
function Acessos({ n }: { n: number }) {
  return <span className="g-as-acessos" aria-hidden>{Array.from({ length: MAIOR }, (_, i) => <i key={i} className={i < n ? "on" : undefined}><User /></i>)}</span>;
}

export default function Assinatura() {
  const { sb, souDono, petshop, user, equipe, liberado, diasDeTeste, assinaturaAberta, atraso, recarregarAssinatura } = useGestao();
  // o administrador pode ter ligado o pagamento (ou trocado um link) com o aplicativo já aberto: confere de novo ao abrir a tela
  useEffect(() => { void recarregarAssinatura(); }, [recarregarAssinatura]);
  const [periodo, setPeriodo] = useState<PeriodoId>("mensal");
  // "Tenho um cupom": o código vai junto no link de pagamento (ou na mensagem do WhatsApp); quem confere é a Cakto
  const [comCupom, setComCupom] = useState(false);
  const [cupomDigitado, setCupomDigitado] = useState("");
  const cupom = comCupom ? limparCupom(cupomDigitado) : "";
  // quem vende (nome e documento gravados no painel do administrador): só aparece quando está preenchido
  const { dados: vendedor } = useDados(async () => {
    const r = await sb.rpc("gestao_vendedor");
    const v = vendedorDe(r.error ? null : r.data);
    return temVendedor(v) ? v : null;
  }, []);
  // sem a marca assinada (banco antes da atualização ou sem internet), o link segue só com o e-mail
  const { dados: callback } = useDados(async () => {
    if (!souDono) return null;
    const r = await sb.rpc("assinatura_callback", { p: petshop.id });
    return r.error || typeof r.data !== "string" ? null : r.data;
  }, [petshop.id, souDono]);
  if (!souDono) return <Vazio titulo="Só o dono do pet shop mexe aqui." />;
  const status = petshop.status;
  const podeAssinar = status === "teste" || status === "cancelada";
  const temAssinatura = status === "ativa" || status === "atrasada";
  const atual = planoPorId(petshop.plano);
  // quantas pessoas entram no sistema hoje (login ou convite): o plano que serve sai daqui
  const conselho = conselhoDoPlano(equipe.filter(ocupaAcesso).length);

  return (
    <div>
      <header className="g-topo">
        <div><h1>Assinatura</h1><p className="g-muted">O plano {artigoDe(petshop.nome).do} {petshop.nome}.</p></div>
      </header>
      <div className="g-pilha g">
        {estado()}

        {temAssinatura && (
          <section className="g-pilha">
            <div className="g-card-t" style={{ marginBottom: 0 }}><h2>Seu plano</h2><span className="g-muted g-p">{textoPessoas(atual.acessos)}</span></div>
            <div className="g-as-planos">
              {PLANOS.map((p) => {
                const meu = p.id === atual.id, v = VISUAL[p.id];
                return (
                  <div key={p.id} className={`g-card g-as-plano tom-${v.tom}${meu ? " atual" : " outro"}`}>
                    {meu && <span className="g-as-marca"><BadgeCheck aria-hidden />Seu plano</span>}
                    <div className="g-as-plano-t"><Tile icone={v.icone} tom={v.tom} tamanho="g" /><div><h2>{p.nome}</h2><p className="g-muted g-pp">{p.para}</p></div></div>
                    <p className="g-as-preco"><span className="g-num">{brlCurto(p.preco)}</span><span className="g-muted g-p"> por mês</span></p>
                    <div className="g-as-quantos"><Acessos n={p.acessos} /><p className="g-p"><b>{textoPessoas(p.acessos)}</b> com login próprio</p></div>
                  </div>
                );
              })}
            </div>
            <div className="g-card g-pilha">
              <div><a className={`g-btn ${status === "atrasada" ? "verde" : "sec"}`} href={PORTAL} target="_blank" rel="noopener noreferrer">Trocar cartão ou cancelar<ExternalLink aria-hidden /></a></div>
              <p className="g-muted g-pp">Abre a página de pagamento, que cuida da cobrança. Lá você entra com o e-mail usado na compra{petshop.cakto_email ? ` (${petshop.cakto_email})` : ""}. Para mudar de plano ou de período, cancele por lá e depois assine o novo aqui: os seus dados continuam. O plano novo começa a contar do dia em que você pagar, e os meses que sobraram do atual não viram crédito nem desconto (<Link className="g-link" href="/gestao/termos#cancelar" target="_blank">Termos, parte 7</Link>).</p>
            </div>
          </section>
        )}

        {podeAssinar && (
          <section className="g-pilha">
            <div>
              <h2>Escolha o plano</h2>
              <p className="g-muted g-p">Todos têm as mesmas funções e o Mozart. Muda quantas pessoas entram no sistema, cada uma com o seu login. Pagando por 3 ou 6 meses, sai mais barato.</p>
            </div>
            <p className="g-aviso g-as-conselho" data-teste="conselho-do-plano"><Users aria-hidden /><span>{conselho.texto}</span></p>
            <div className="g-seg" role="group" aria-label="De quanto em quanto tempo pagar" style={{ justifySelf: "start" }}>
              {PERIODOS.map((pe) => <button key={pe.id} aria-pressed={periodo === pe.id} onClick={() => setPeriodo(pe.id)}>{pe.nome}</button>)}
            </div>
            <div className="g-as-planos">
              {PLANOS.map((p) => {
                const v = VISUAL[p.id], o = ofertaDe(p.id, periodo);
                return (
                  <div key={p.id} className={`g-card g-as-plano tom-${v.tom}${conselho.cabe && p.id === conselho.plano.id ? " realce" : ""}`}>
                    {conselho.cabe && p.id === conselho.plano.id && <span className="g-as-marca"><Check aria-hidden />Serve para a sua equipe de hoje</span>}
                    <div className="g-as-plano-t"><Tile icone={v.icone} tom={v.tom} tamanho="g" /><div><h2>{p.nome}</h2><p className="g-muted g-pp">{p.para}</p></div></div>
                    <p className="g-as-preco"><span className="g-num">{brlCurto(o.preco)}</span><span className="g-muted g-p"> {o.periodo.cada}</span></p>
                    <p className="g-muted g-pp" style={{ minHeight: "2.6em" }}>{o.periodo.meses > 1 ? `Equivale a ${brlCurto(Math.round(o.porMes * 100) / 100)} por mês: ${brlCurto(o.economia)} a menos do que no mensal.` : "Cobrado todo mês."}</p>
                    <div className="g-as-quantos"><Acessos n={p.acessos} /><p className="g-p"><b>{textoPessoas(p.acessos)}</b> com login próprio</p></div>
                    {/* com o link de pagamento cadastrado e ligado, vai para a Cakto; sem ele, a pessoa assina com a equipe, pelo WhatsApp */}
                    {o.checkout && assinaturaAberta
                      ? <a className={`g-btn cheio ${conselho.cabe && p.id === conselho.plano.id ? "pri" : "verde"}`} data-teste={`assinar-${p.id}`} href={linkDoCheckout(o.checkout, user.email, callback, cupom)} target="_blank" rel="noopener noreferrer">Assinar<ExternalLink aria-hidden /></a>
                      : <a className="g-btn cheio verde" data-teste={`assinar-${p.id}`} href={linkSuporte(textoParaAssinar(p.id, periodo, petshop.nome, user.email, cupom))} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />Assinar pelo WhatsApp</a>}
                  </div>
                );
              })}
            </div>
            <p className="g-muted g-pp g-as-taxa">{TEXTO_TAXA}</p>
            <div className="g-card g-pilha">
              <div className="g-card-t" style={{ marginBottom: 0 }}><h3><Tile icone={Sparkles} tom="lilas" tamanho="p" />Todos os planos incluem</h3></div>
              <ul className="g-as-inclui">
                {INCLUI.map((i) => <li key={i}><Check aria-hidden />{i}</li>)}
              </ul>
            </div>
            <div className="g-card g-pilha p g-as-cupom">
              {comCupom ? (
                <>
                  <label className="g-campo"><span>Código do cupom</span>
                    <input className="g-input" name="cupom" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={40} placeholder="Ex.: ANA10" value={cupomDigitado} onChange={(e) => setCupomDigitado(e.target.value.toUpperCase())} autoFocus />
                  </label>
                  <p className="g-muted g-pp" role="status">{cupom
                    ? `O cupom ${cupom} vai junto quando você tocar em Assinar. O desconto aparece na página de pagamento, antes de você pagar. Se o código estiver errado ou vencido, a página segue com o preço normal: confira o valor antes de concluir.`
                    : "Escreva o código do jeito que a nossa equipe passou. Ele vai junto quando você tocar em Assinar."}</p>
                  <div><button type="button" className="g-btn fantasma p" onClick={() => { setComCupom(false); setCupomDigitado(""); }}>Não tenho cupom</button></div>
                </>
              ) : (
                <div className="g-fila">
                  <button type="button" className="g-btn sec p" onClick={() => setComCupom(true)}><Ticket aria-hidden />Tenho um cupom</button>
                  <span className="g-muted g-pp">Cupom é dado pela nossa equipe de atendimento, com data de validade.</span>
                </div>
              )}
            </div>
            <ul className="g-as-regras" data-teste="regras-da-assinatura">
              <li><Check aria-hidden />{TEXTOS_ASSINAR.nadaCobrado}</li>
              <li><Check aria-hidden /><span>{TEXTOS_ASSINAR.arrependimento} (<Link className="g-link" href="/gestao/termos#cancelar" target="_blank">Termos, parte 7</Link>)</span></li>
              <li><Check aria-hidden />{TEXTOS_ASSINAR.semFidelidade}</li>
              <li><Check aria-hidden />{TEXTOS_ASSINAR.pagamento}</li>
            </ul>
            <p className="g-muted g-pp">{assinaturaAberta
              ? <>A assinatura se renova sozinha ao fim de cada período até você cancelar. Use na página de pagamento o mesmo e-mail da sua conta{user.email ? ` (${user.email})` : ""} para o acesso ser liberado sozinho.</>
              : <>Ao tocar em Assinar pelo WhatsApp, a mensagem já sai escrita com o plano escolhido. A nossa equipe manda o link de pagamento e libera a sua conta. A assinatura se renova sozinha ao fim de cada período até você cancelar.</>}</p>
            {vendedor && <p className="g-muted g-pp" data-teste="vendedor">{linhaDoVendedor(vendedor)}</p>}
          </section>
        )}

        <section className="g-card areia g-pilha p">
          <h2 className="g-as-dados-t"><Tile icone={Database} tom="ceu" tamanho="p" />Seus dados</h2>
          <p className="g-p">
            Tudo o que você lança aqui é do seu pet shop. Dá para levar quando quiser: tudo de uma vez em{" "}
            <Link className="g-link alvo" href="/gestao/app/meu-petshop#baixar-todos-os-dados">Meu pet shop → Baixar todos os dados</Link>, ou só uma parte em{" "}
            <Link className="g-link alvo" href="/gestao/app/clientes">Clientes → Exportar</Link> e em{" "}
            <Link className="g-link alvo" href="/gestao/app/financeiro">Financeiro → Exportar</Link>.
          </p>
          <p className="g-p g-muted">
            <Link className="g-link alvo" href="/gestao/privacidade" target="_blank">Política de privacidade</Link>{" · "}
            <Link className="g-link alvo" href="/gestao/termos" target="_blank">Termos de uso</Link>{" · "}
            <a className="g-link alvo" href={linkSuporte("Oi! Preciso de ajuda com o Maestro Pet Gestão.")} target="_blank" rel="noopener noreferrer">Fale com a gente no WhatsApp</a>
          </p>
        </section>
      </div>
    </div>
  );

  function estado() {
    if (status === "teste") {
      const fim = new Date(petshop.teste_ate);
      const dias = diasDeTeste ?? 0;
      if (!liberado) {
        return (
          <section className="g-as-estado alerta" role="alert">
            <div className="g-as-estado-t"><Tile icone={Lock} tom="rosa" tamanho="g" /><div><p className="g-rotulo">Teste grátis</p><h2>Teste grátis: terminou em {dataCurta(fim)}</h2></div></div>
            <p className="g-p">{TEXTO_TESTE.soConsulta} Escolha um plano logo abaixo.</p>
          </section>
        );
      }
      const restam = Math.min(dias, DIAS_DE_TESTE);
      return (
        <section className="g-as-estado teste">
          <div className="g-as-estado-t">
            <Tile icone={Clock} tom="pessego" tamanho="g" />
            <div><p className="g-rotulo">Teste grátis</p><h2>Teste grátis: {dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}</h2></div>
            <p className="g-as-dias" aria-hidden><b>{dias}</b><span>{dias === 1 ? "dia" : "dias"}</span></p>
          </div>
          <div className="g-as-barra" role="img" aria-label={`${restam} de ${DIAS_DE_TESTE} dias restantes`}>
            {Array.from({ length: DIAS_DE_TESTE }, (_, i) => <i key={i} className={i < restam ? "on" : undefined} />)}
          </div>
          <p className="g-p">Vai até {dataCurta(fim)}. Durante o teste, tudo funciona e até 6 pessoas podem entrar. {TEXTO_TESTE.nadaCobrado} {TEXTO_TESTE.seNaoAssinar}</p>
        </section>
      );
    }
    if (status === "ativa") {
      return (
        <section className="g-as-estado ok">
          <div className="g-as-estado-t">
            <Tile icone={BadgeCheck} tom="menta" tamanho="g" />
            <div><p className="g-rotulo">Tudo certo</p><h2>{petshop.assinatura_desde ? `Assinatura ativa desde ${dataCompleta(petshop.assinatura_desde)}` : "Assinatura ativa"}</h2></div>
          </div>
        </section>
      );
    }
    if (status === "atrasada") {
      return (
        <section className="g-as-estado alerta">
          <div className="g-as-estado-t"><Tile icone={liberado ? AlertTriangle : Lock} tom="rosa" tamanho="g" /><div><p className="g-rotulo">Pagamento pendente</p><h2>{liberado ? "O último pagamento não foi aprovado" : "Assinatura atrasada: a conta está só para consulta"}</h2></div></div>
          <p className="g-p" data-teste="aviso-de-atraso">{!liberado
            ? "O pagamento não foi aprovado e o prazo para acertar passou. Você continua vendo o que lançou, mas não consegue marcar, lançar nem alterar. Os dados continuam guardados: assim que o pagamento entrar, tudo volta a funcionar. Confira o cartão na página de pagamento, no botão logo abaixo."
            : atraso
              ? `Seu acesso continua até ${dataCompleta(atraso.travaEm)} (${atraso.dias} dias depois da cobrança que não passou). Se o pagamento não entrar até lá, a conta fica só para consulta. Os dados continuam guardados. Confira o cartão na página de pagamento, no botão logo abaixo.`
              : `Seu acesso continua por enquanto: são ${DIAS_DE_ATRASO_PADRAO} dias para acertar, a contar da cobrança que não passou. Depois disso a conta fica só para consulta. Confira o cartão na página de pagamento, no botão logo abaixo.`}</p>
        </section>
      );
    }
    if (status === "cancelada") {
      return (
        <section className="g-as-estado neutro">
          <div className="g-as-estado-t"><Tile icone={Lock} tom="manteiga" tamanho="g" /><div><p className="g-rotulo">Assinatura</p><h2>Assinatura cancelada. Seus dados continuam guardados.</h2></div></div>
          <p className="g-p">{liberado && petshop.pago_ate ? `Você continua usando normalmente até ${dataCompleta(new Date(petshop.pago_ate))}, fim do período já pago. Depois disso a conta fica só para consulta.` : "A conta fica só para consulta. Se quiser voltar, é só assinar de novo."}</p>
        </section>
      );
    }
    return (
      <section className="g-as-estado ok">
        <div className="g-as-estado-t"><Tile icone={Gift} tom="menta" tamanho="g" /><div><p className="g-rotulo">Cortesia</p><h2>Acesso liberado pela Maestro Pet.</h2></div></div>
        <p className="g-p">Você não precisa assinar nem pagar nada por enquanto.</p>
      </section>
    );
  }
}
