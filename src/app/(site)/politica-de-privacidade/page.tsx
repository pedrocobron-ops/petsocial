import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidade",
  alternates: { canonical: "/politica-de-privacidade" },
};

export default function PrivacidadePage() {
  return (
    <div className="container prose">
      <h1>Política de privacidade</h1>
      <p>Esta política explica como o Maestro Pet trata os seus dados, de acordo com a Lei Geral de Proteção de Dados (LGPD).</p>
      <h2>Dados que coletamos</h2>
      <ul>
        <li><b>Na compra:</b> nome, e-mail, telefone e dados de pagamento são coletados e processados pela Cakto, nossa plataforma de pagamentos, para concluir a compra e entregar o acesso.</li>
        <li><b>No cadastro de materiais gratuitos:</b> nome, e-mail e, se você quiser, o nome do seu cão, guardados em uma planilha privada do Google, usados só para enviar novidades da Maestro Pet. Você pode pedir a exclusão a qualquer momento.</li>
        <li><b>Na navegação:</b> podemos usar cookies e o Pixel da Meta para medir visitas e o desempenho de anúncios.</li>
      </ul>
      <h2>Para que usamos</h2>
      <ul>
        <li>Entregar o produto comprado e prestar suporte.</li>
        <li>Enviar comunicações sobre a sua compra e, se você permitir, novidades do Maestro Pet.</li>
        <li>Medir e melhorar nossos anúncios e o site.</li>
      </ul>
      <h2>Compartilhamento</h2>
      <p>Não vendemos seus dados. Eles são compartilhados apenas com os serviços necessários para a operação (plataforma de pagamento, hospedagem e ferramentas de medição de anúncios).</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento pelo e-mail <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>.</p>
    </div>
  );
}
