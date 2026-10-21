import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contato e suporte",
  description: "Fale com o Maestro Pet: dúvidas, acesso aos guias e reembolsos.",
  alternates: { canonical: "/contato" },
};

export default function ContatoPage() {
  return (
    <div className="container prose">
      <h1>Contato e suporte</h1>
      <p>Estamos aqui para ajudar. Escreva para <a href="mailto:contato@maestropet.com">contato@maestropet.com</a> — respondemos em até 2 dias úteis.</p>
      <h2>Não recebi meu acesso</h2>
      <p>
        O acesso é enviado para o e-mail informado na compra logo após a confirmação do pagamento. Confira a caixa de
        spam e a aba Promoções. Se não encontrar, escreva para nós informando o e-mail da compra.
      </p>
      <h2>Quero o reembolso</h2>
      <p>
        Todos os guias têm garantia de 7 dias a partir da compra. Você pode pedir o reembolso pelo e-mail de compra da
        Cakto ou escrevendo para nós com o e-mail usado na compra.
      </p>
    </div>
  );
}
