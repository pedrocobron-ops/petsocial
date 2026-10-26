import type { Metadata } from "next";
import Link from "next/link";
import { EMPRESA, identificacao, linkInstagram, linkWhatsapp } from "@/lib/empresa";

export const metadata: Metadata = {
  title: "Contato e suporte",
  description: "Fale com o Maestro Pet: dúvidas antes de comprar, acesso aos materiais e reembolsos.",
  alternates: { canonical: "/contato" },
};

export default function ContatoPage() {
  const id = identificacao();
  const wa = linkWhatsapp();
  const ig = linkInstagram();
  return (
    <div className="container prose">
      <h1>Contato e suporte</h1>
      <p>Estamos aqui para ajudar, antes e depois da compra.</p>
      <ul>
        <li><b>E-mail:</b> <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> (respondemos em até 2 dias úteis)</li>
        {wa && <li><b>WhatsApp:</b> <a href={wa}>fale com o suporte</a></li>}
        {ig && <li><b>Instagram:</b> <a href={ig}>@{EMPRESA.instagram}</a></li>}
      </ul>
      {id && <p><b>Empresa:</b> {id}</p>}

      <h2 id="acesso">Não recebi meu acesso</h2>
      <p>
        O acesso é enviado para o e-mail informado na compra, normalmente em poucos minutos depois da confirmação do pagamento.
        Confira a caixa de spam e a aba Promoções e procure por &quot;Cakto&quot; ou &quot;Maestro Pet&quot;. Se não encontrar,
        escreva para nós com o e-mail usado na compra e reenviamos.
      </p>

      <h2 id="reembolso">Quero o reembolso</h2>
      <p>Todos os produtos têm garantia de 7 dias corridos a partir da compra, no Pix ou no cartão, sem precisar justificar.</p>
      <ol>
        <li>Use a opção de reembolso no e-mail de confirmação da Cakto; <b>ou</b></li>
        <li>escreva para <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a> com o e-mail da compra e o nome do produto.</li>
      </ol>
      <p>No Pix, o dinheiro volta para a conta de origem; no cartão, o estorno sai na fatura atual ou na seguinte. Detalhes nos <Link href="/termos-de-uso">Termos de uso</Link>.</p>

      <h2>Tenho uma dúvida antes de comprar</h2>
      <p>Pode perguntar. Se o material não for o certo para o seu caso, nós dizemos.</p>

      <h2>Privacidade</h2>
      <p>Para pedir acesso, correção ou exclusão dos seus dados, veja a <Link href="/politica-de-privacidade">Política de privacidade</Link>.</p>
    </div>
  );
}
