import type { Metadata } from "next";
import Link from "next/link";
import { Instagram, Mail, MessageCircle } from "lucide-react";
import AbreAncora from "@/components/abre-ancora";
import { EMPRESA, identificacao, linkInstagram, linkWhatsapp } from "@/lib/empresa";

export const metadata: Metadata = {
  title: "Contato e ajuda",
  description: "Fale com o Maestro Pet: dúvidas antes de comprar, acesso aos materiais, reembolso e nota fiscal. Respondemos em até 2 dias úteis.",
  alternates: { canonical: "/contato" },
};

/**
 * /contato (brief 20, 7.10): os 3 canais com filetes (WhatsApp com botão secundário, e-mail em Fraunces 24 px, Instagram),
 * "Respondemos em até 2 dias úteis", a identificação quando preenchida e os 4 tópicos de ajuda em acordeão.
 * O rodapé aponta para /contato#acesso e /contato#reembolso: o tópico abre sozinho.
 */
export default function ContatoPage() {
  const id = identificacao();
  const wa = linkWhatsapp();
  const ig = linkInstagram();
  return (
    <>
      <AbreAncora />
      <section className="hero hero-inst">
        <div className="container">
          <div className="hero-texto">
            <span className="rotulo">Ajuda</span>
            <h1>Estamos aqui, <em>antes e depois da compra.</em></h1>
            <p className="lead">Respondemos em até 2 dias úteis, por qualquer um dos canais.</p>
          </div>
        </div>
      </section>

      <section className="secao secao-cola" aria-label="Canais de atendimento">
        <div className="container">
          <ul className="canais canais-largo">
            {wa && (
              <li className="rv">
                <MessageCircle size={20} strokeWidth={1.75} aria-hidden />
                <div><b>WhatsApp</b><span>Para acesso, compra e dúvidas rápidas.</span></div>
                <a className="btn btn-secundario btn-pq" href={wa}>Chamar no WhatsApp</a>
              </li>
            )}
            <li className="rv">
              <Mail size={20} strokeWidth={1.75} aria-hidden />
              <div><b>E-mail</b><span>Para reembolso e nota fiscal, com o e-mail usado na compra.</span></div>
              <a className="canal-email" href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
            </li>
            {ig && (
              <li className="rv">
                <Instagram size={20} strokeWidth={1.75} aria-hidden />
                <div><b>Instagram</b><span>Dicas do Mozart e novidades.</span></div>
                <a className="canal-link" href={ig} rel="noopener noreferrer">@{EMPRESA.instagram}</a>
              </li>
            )}
          </ul>
          {id && <p className="inst-idlinha">{id}</p>}
        </div>
      </section>

      <section className="secao bloco-suave" aria-labelledby="ajuda-titulo">
        <div className="container">
          <div className="cab rv">
            <span className="rotulo">Perguntas de quem já comprou</span>
            <h2 id="ajuda-titulo">O que mais <em>nos perguntam.</em></h2>
          </div>
          <div className="faq faq2">
            <div>
              <details id="acesso">
                <summary>Não recebi o acesso</summary>
                <div>
                  <p>O acesso vai para o e-mail informado na compra, em geral poucos minutos depois da confirmação do pagamento. Olhe o spam e a aba Promoções e procure por &quot;Cakto&quot; ou &quot;Maestro Pet&quot;.</p>
                  <p>Não achou? Escreva para <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> com o e-mail da compra e reenviamos.</p>
                </div>
              </details>
              <details id="reembolso">
                <summary>Quero o reembolso</summary>
                <div>
                  <p>Em até 7 dias depois da compra, sem precisar explicar o motivo: peça em reembolso.cakto.com.br ou escreva para <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> com o e-mail da compra e o nome do produto.</p>
                  <p>A Cakto processa em até 24 horas. No Pix, o valor volta para a conta de origem; no cartão, o estorno segue o prazo do banco. Detalhes nos <Link href="/termos-de-uso">Termos de uso</Link>.</p>
                </div>
              </details>
            </div>
            <div>
              <details id="antes">
                <summary>Tenho uma dúvida antes de comprar</summary>
                <div><p>Pode perguntar pelo WhatsApp ou pelo e-mail. Se o material não for o certo para o seu caso, nós dizemos.</p></div>
              </details>
              <details id="nota">
                <summary>Preciso de nota fiscal</summary>
                <div><p>O comprovante da compra chega no e-mail da Cakto. Para pedir nota fiscal, escreva para <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> com o e-mail usado na compra.</p></div>
              </details>
            </div>
          </div>
          <p className="inst-privacidade">Para pedir acesso, correção ou exclusão dos seus dados, veja a <Link href="/politica-de-privacidade">Política de privacidade</Link>.</p>
        </div>
      </section>
    </>
  );
}
