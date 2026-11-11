"use client";

import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Vazio } from "@/components/gestao/ui";
import { linkSuporte } from "@/lib/gestao/contato";
import { PLANOS, planoPorId, textoAcessos } from "@/lib/gestao/planos";
import { brlCurto, dataCompleta, dataCurta } from "@/lib/gestao/util";
import "@/components/gestao/ajustes/ajustes.css";

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
  "O Mozart, por áudio e por texto",
];

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

  return (
    <div>
      <header className="g-topo">
        <div><h1>Assinatura</h1><p className="g-muted">O plano do {petshop.nome}.</p></div>
      </header>
      <div className="g-pilha">
        {estado()}

        {temAssinatura && (
          <section className="g-card g-pilha">
            <div className="g-fila entre">
              <div><p className="g-rotulo">Seu plano</p><h2>{atual.nome}</h2><p className="g-muted g-p">{textoAcessos(atual.acessos)} com login</p></div>
              <p><span className="g-num m">{brlCurto(atual.preco)}</span><span className="g-muted g-p"> por mês</span></p>
            </div>
            <div><a className={`g-btn ${status === "atrasada" ? "verde" : "sec"}`} href={PORTAL} target="_blank" rel="noopener noreferrer">Trocar cartão ou cancelar<ExternalLink aria-hidden /></a></div>
            <p className="g-muted g-pp">Abre a página da Cakto, que cuida da cobrança. Lá você entra com o e-mail usado na compra{petshop.cakto_email ? ` (${petshop.cakto_email})` : ""}. Para mudar de plano, cancele por lá e assine o plano novo aqui: os seus dados continuam.</p>
          </section>
        )}

        {podeAssinar && (
          <section className="g-pilha">
            <div>
              <h2>Escolha o plano</h2>
              <p className="g-muted g-p">Todos têm as mesmas funções e o Mozart. Muda quantas pessoas entram com login.</p>
            </div>
            <div className="g-grade c3">
              {PLANOS.map((p) => (
                <div key={p.id} className={`g-card g-pilha p${p.id === "equipe" ? " menta" : ""}`}>
                  <div><p className="g-rotulo">{p.para}</p><h2>{p.nome}</h2></div>
                  <p><span className="g-num m">{brlCurto(p.preco)}</span><span className="g-muted g-p"> por mês</span></p>
                  <p className="g-p"><b>{textoAcessos(p.acessos)}</b> com login</p>
                  {p.checkout
                    ? <a className={`g-btn cheio ${p.id === "equipe" ? "pri" : "verde"}`} href={linkDoCheckout(p.checkout, user.email)} target="_blank" rel="noopener noreferrer">Assinar<ExternalLink aria-hidden /></a>
                    : <button className="g-btn cheio" disabled>Disponível em breve</button>}
                </div>
              ))}
            </div>
            <ul className="gj-inclui">
              {INCLUI.map((i) => <li key={i}><Check aria-hidden />{i}</li>)}
            </ul>
            {!PLANOS.some((p) => p.checkout) && <p className="g-muted g-p">{liberado ? "A assinatura ainda não abriu. Enquanto isso, o seu acesso continua pelo teste." : "A assinatura ainda não abriu. Os seus dados continuam guardados."}</p>}
            <p className="g-muted g-pp">Cobrança mensal pela Cakto. Sem fidelidade: você cancela quando quiser. Use no checkout o mesmo e-mail da sua conta{user.email ? ` (${user.email})` : ""} para o acesso ser liberado sozinho.</p>
          </section>
        )}

        <section className="g-card areia g-pilha p">
          <h2>Seus dados</h2>
          <p className="g-p">
            Tudo o que você lança aqui é do seu pet shop. Dá para levar quando quiser: em{" "}
            <Link className="g-link" href="/gestao/app/clientes">Clientes → Exportar</Link> e em{" "}
            <Link className="g-link" href="/gestao/app/financeiro">Financeiro → Exportar</Link>.
          </p>
          <p className="g-p g-muted">
            <Link className="g-link" href="/politica-de-privacidade" target="_blank">Política de privacidade</Link>{" · "}
            <Link className="g-link" href="/termos-de-uso" target="_blank">Termos de uso</Link>{" · "}
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
          <section className="g-card g-pilha p">
            <p className="g-rotulo">Teste grátis</p>
            <h2>Teste grátis: terminou em {dataCurta(fim)}</h2>
            <p className="g-muted g-p">Seus dados continuam guardados e a conta fica só para consulta até você assinar.</p>
          </section>
        );
      }
      return (
        <section className="g-card g-pilha p">
          <p className="g-rotulo">Teste grátis</p>
          <h2>Teste grátis: {dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}</h2>
          <div className="g-prog" role="img" aria-label={`${Math.min(dias, DIAS_DE_TESTE)} de ${DIAS_DE_TESTE} dias restantes`}>
            <i style={{ width: `${Math.min(100, Math.round((dias / DIAS_DE_TESTE) * 100))}%` }} />
          </div>
          <p className="g-muted g-p">Vai até {dataCurta(fim)}. Durante o teste, tudo funciona e até 6 pessoas podem entrar.</p>
        </section>
      );
    }
    if (status === "ativa") {
      return (
        <section className="g-card menta g-pilha p">
          <p className="g-rotulo">Tudo certo</p>
          <h2>{petshop.assinatura_desde ? `Assinatura ativa desde ${dataCompleta(petshop.assinatura_desde)}` : "Assinatura ativa"}</h2>
        </section>
      );
    }
    if (status === "atrasada") {
      return (
        <section className="g-card g-pilha p">
          <p className="g-rotulo g-vermelho-t">Pagamento pendente</p>
          <h2>O último pagamento não foi aprovado</h2>
          <p className="g-muted g-p">Seu acesso continua por enquanto. Para não perder, confira o cartão na página da Cakto, no botão logo abaixo.</p>
        </section>
      );
    }
    if (status === "cancelada") {
      return (
        <section className="g-card g-pilha p">
          <p className="g-rotulo">Assinatura</p>
          <h2>Assinatura cancelada. Seus dados continuam guardados.</h2>
          <p className="g-muted g-p">A conta fica só para consulta. Se quiser voltar, é só assinar de novo.</p>
        </section>
      );
    }
    return (
      <section className="g-card menta g-pilha p">
        <p className="g-rotulo">Cortesia</p>
        <h2>Acesso liberado pela Maestro Pet.</h2>
        <p className="g-muted g-p">Você não precisa assinar nem pagar nada por enquanto.</p>
      </section>
    );
  }
}
