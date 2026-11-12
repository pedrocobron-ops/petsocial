"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Check, Clock, Database, ExternalLink, Gift, Lock, Sparkles, Store, User, Users } from "lucide-react";
import { Tile, type Tom } from "@/components/gestao/painel";
import { useGestao } from "@/components/gestao/contexto";
import { Vazio } from "@/components/gestao/ui";
import { linkSuporte } from "@/lib/gestao/contato";
import { PERIODOS, PLANOS, ofertaDe, planoPorId, temCheckout, textoAcessos, type PeriodoId, type PlanoId } from "@/lib/gestao/planos";
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

function linkDoCheckout(CHECKOUT: string, email: string | undefined) {
  if (!email) return CHECKOUT;
  try {
    const u = new URL(CHECKOUT);
    u.searchParams.set("email", email);
    return u.toString();
  } catch {
    return `${CHECKOUT}${CHECKOUT.includes("?") ? "&" : "?"}email=${encodeURIComponent(email)}`;
  }
}

export default function Assinatura() {
  const { souDono, petshop, user, liberado, diasDeTeste } = useGestao();
  if (!souDono) return <Vazio titulo="Só o dono do pet shop mexe aqui." />;
  const status = petshop.status;
  const podeAssinar = status === "teste" || status === "cancelada";
  const temAssinatura = status === "ativa" || status === "atrasada";
  const atual = planoPorId(petshop.plano);
  const [periodo, setPeriodo] = useState<PeriodoId>("mensal");

  return (
    <div>
      <header className="g-topo">
        <div><h1>Assinatura</h1><p className="g-muted">O plano do {petshop.nome}.</p></div>
      </header>
      <div className="g-pilha g">
        {estado()}

        {temAssinatura && (
          <section className="g-pilha">
            <div className="g-card-t" style={{ marginBottom: 0 }}><h2>Seu plano</h2><span className="g-muted g-p">{textoAcessos(atual.acessos)} ao sistema</span></div>
            <div className="g-as-planos">
              {PLANOS.map((p) => {
                const meu = p.id === atual.id, v = VISUAL[p.id];
                return (
                  <div key={p.id} className={`g-card g-as-plano tom-${v.tom}${meu ? " atual" : " outro"}`}>
                    {meu && <span className="g-as-marca"><BadgeCheck aria-hidden />Seu plano</span>}
                    <div className="g-as-plano-t"><Tile icone={v.icone} tom={v.tom} tamanho="g" /><div><h2>{p.nome}</h2><p className="g-muted g-pp">{p.para}</p></div></div>
                    <p className="g-as-preco"><span className="g-num">{brlCurto(p.preco)}</span><span className="g-muted g-p"> por mês</span></p>
                    <div className="g-as-quantos"><Acessos n={p.acessos} /><p className="g-p"><b>{textoAcessos(p.acessos)}</b> ao sistema</p></div>
                  </div>
                );
              })}
            </div>
            <div className="g-card g-pilha">
              <div><a className={`g-btn ${status === "atrasada" ? "verde" : "sec"}`} href={PORTAL} target="_blank" rel="noopener noreferrer">Trocar cartão ou cancelar<ExternalLink aria-hidden /></a></div>
              <p className="g-muted g-pp">Abre a página da Cakto, que cuida da cobrança. Lá você entra com o e-mail usado na compra{petshop.cakto_email ? ` (${petshop.cakto_email})` : ""}. Para mudar de plano, cancele por lá e assine o plano novo aqui: os seus dados continuam.</p>
            </div>
          </section>
        )}

        {podeAssinar && (
          <section className="g-pilha">
            <div>
              <h2>Escolha o plano</h2>
              <p className="g-muted g-p">Todos têm as mesmas funções e o Mozart. Muda quantas pessoas têm acesso ao sistema. Pagando por 3 ou 6 meses, sai mais barato.</p>
            </div>
            <div className="g-seg" role="group" aria-label="De quanto em quanto tempo pagar" style={{ justifySelf: "start" }}>
              {PERIODOS.map((pe) => <button key={pe.id} aria-pressed={periodo === pe.id} onClick={() => setPeriodo(pe.id)}>{pe.nome}</button>)}
            </div>
            <div className="g-as-planos">
              {PLANOS.map((p) => {
                const v = VISUAL[p.id], o = ofertaDe(p.id, periodo);
                return (
                  <div key={p.id} className={`g-card g-as-plano tom-${v.tom}${p.id === "equipe" ? " realce" : ""}`}>
                    <div className="g-as-plano-t"><Tile icone={v.icone} tom={v.tom} tamanho="g" /><div><h2>{p.nome}</h2><p className="g-muted g-pp">{p.para}</p></div></div>
                    <p className="g-as-preco"><span className="g-num">{brlCurto(o.preco)}</span><span className="g-muted g-p"> {o.periodo.cada}</span></p>
                    <p className="g-muted g-pp" style={{ minHeight: "2.6em" }}>{o.periodo.meses > 1 ? `Equivale a ${brlCurto(Math.round(o.porMes))} por mês: ${brlCurto(o.economia)} a menos do que no mensal.` : "Cobrado todo mês."}</p>
                    <div className="g-as-quantos"><Acessos n={p.acessos} /><p className="g-p"><b>{textoAcessos(p.acessos)}</b> ao sistema</p></div>
                    {o.checkout
                      ? <a className={`g-btn cheio ${p.id === "equipe" ? "pri" : "verde"}`} href={linkDoCheckout(o.checkout, user.email)} target="_blank" rel="noopener noreferrer">Assinar<ExternalLink aria-hidden /></a>
                      : <button className="g-btn cheio" disabled>Disponível em breve</button>}
                  </div>
                );
              })}
            </div>
            <div className="g-card g-pilha">
              <div className="g-card-t" style={{ marginBottom: 0 }}><h3><Tile icone={Sparkles} tom="lilas" tamanho="p" />Todos os planos incluem</h3></div>
              <ul className="g-as-inclui">
                {INCLUI.map((i) => <li key={i}><Check aria-hidden />{i}</li>)}
              </ul>
            </div>
            {!temCheckout() && <p className="g-muted g-p">{liberado ? "A assinatura ainda não abriu. Enquanto isso, o seu acesso continua pelo teste." : "A assinatura ainda não abriu. Os seus dados continuam guardados."}</p>}
            <p className="g-muted g-pp">Cobrança pela Cakto, que se renova sozinha ao fim de cada período até você cancelar. Você cancela quando quiser e usa até o fim do período já pago. Use na página de pagamento o mesmo e-mail da sua conta{user.email ? ` (${user.email})` : ""} para o acesso ser liberado sozinho.</p>
          </section>
        )}

        <section className="g-card areia g-pilha p">
          <h2 className="g-as-dados-t"><Tile icone={Database} tom="ceu" tamanho="p" />Seus dados</h2>
          <p className="g-p">
            Tudo o que você lança aqui é do seu pet shop. Dá para levar quando quiser: em{" "}
            <Link className="g-link" href="/gestao/app/clientes">Clientes → Exportar</Link> e em{" "}
            <Link className="g-link" href="/gestao/app/financeiro">Financeiro → Exportar</Link>.
          </p>
          <p className="g-p g-muted">
            <Link className="g-link" href="/gestao/privacidade" target="_blank">Política de privacidade</Link>{" · "}
            <Link className="g-link" href="/gestao/termos" target="_blank">Termos de uso</Link>{" · "}
            <a className="g-link" href={linkSuporte("Oi! Preciso de ajuda com o Maestro Pet Gestão.")} target="_blank" rel="noopener noreferrer">Fale com a gente no WhatsApp</a>
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
          <section className="g-as-estado neutro">
            <div className="g-as-estado-t"><Tile icone={Lock} tom="manteiga" tamanho="g" /><div><p className="g-rotulo">Teste grátis</p><h2>Teste grátis: terminou em {dataCurta(fim)}</h2></div></div>
            <p className="g-p">Seus dados continuam guardados e a conta fica só para consulta até você assinar.</p>
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
          <p className="g-p">Vai até {dataCurta(fim)}. Durante o teste, tudo funciona e até 6 pessoas podem entrar.</p>
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
          <div className="g-as-estado-t"><Tile icone={AlertTriangle} tom="rosa" tamanho="g" /><div><p className="g-rotulo">Pagamento pendente</p><h2>O último pagamento não foi aprovado</h2></div></div>
          <p className="g-p">Seu acesso continua por enquanto. Para não perder, confira o cartão na página da Cakto, no botão logo abaixo.</p>
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
