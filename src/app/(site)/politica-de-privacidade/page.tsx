import type { Metadata } from "next";
import { EMPRESA, identificacao } from "@/lib/empresa";
import EscolhaDeCookies from "@/components/escolha-cookies";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como o Maestro Pet coleta, usa, guarda e protege os seus dados, de acordo com a LGPD.",
  alternates: { canonical: "/politica-de-privacidade" },
};

export default function PrivacidadePage() {
  const id = identificacao();
  const mail = <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>;
  return (
    <div className="container prose">
      <h1>Política de privacidade</h1>
      <p className="prose-data">Última atualização: {EMPRESA.atualizadoEm}.</p>
      <p>
        Esta política explica, em linguagem simples, quais dados o {EMPRESA.marca} coleta, para quê, com quem compartilha, por quanto tempo
        guarda e como você exerce os seus direitos, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018, a LGPD).
      </p>

      <h2>1. Quem é o responsável pelos seus dados</h2>
      <p>
        O controlador dos dados é {id ? <b>{id}</b> : <>o {EMPRESA.marca}</>}, responsável pelo site maestropet.com.
        Para qualquer assunto de privacidade, inclusive falar com o encarregado (DPO), escreva para {mail}.
      </p>

      <h2>2. Quais dados coletamos e para quê</h2>
      <table>
        <thead><tr><th>Quando</th><th>Dados</th><th>Para quê</th><th>Base legal (LGPD, art. 7º)</th></tr></thead>
        <tbody>
          <tr>
            <td>Na compra</td>
            <td>Nome, e-mail, CPF, telefone e dados de pagamento, digitados no checkout da Cakto</td>
            <td>Processar o pagamento, entregar o acesso, emitir comprovante, dar suporte e processar reembolsos</td>
            <td>Execução de contrato (V) e cumprimento de obrigação legal (II)</td>
          </tr>
          <tr>
            <td>Ao pedir um material gratuito</td>
            <td>Nome, e-mail e, se quiser, o nome do seu pet</td>
            <td>Enviar o material e novidades do {EMPRESA.marca}</td>
            <td>Consentimento (I), que você pode retirar quando quiser</td>
          </tr>
          <tr>
            <td>Ao falar conosco</td>
            <td>O que você escrever por e-mail ou WhatsApp</td>
            <td>Responder e resolver o seu pedido</td>
            <td>Execução de contrato (V) e legítimo interesse (IX)</td>
          </tr>
          <tr id="nina">
            <td>No chat da Nina (página do sistema para pet shop)</td>
            <td>O texto que você escreve e um código feito a partir do seu endereço de internet (IP), para contar as mensagens</td>
            <td>Responder a sua dúvida e evitar abuso. O texto vai à inteligência artificial só para responder e não fica guardado; fica só a contagem</td>
            <td>Legítimo interesse (IX)</td>
          </tr>
          <tr>
            <td>Na navegação</td>
            <td>Páginas vistas, aparelho, navegador, endereço IP e cookies do Pixel da Meta</td>
            <td>Medir visitas, entender o que funciona e mostrar anúncios do {EMPRESA.marca} a quem já visitou o site</td>
            <td>Consentimento (I), dado no aviso de cookies e que você pode retirar (item 5)</td>
          </tr>
        </tbody>
      </table>
      <p>
        <b>Não temos acesso ao número do seu cartão.</b> Ele é digitado e processado só no ambiente da Cakto.
        Não coletamos dados sensíveis e não vendemos dados a ninguém.
      </p>

      <h2>3. Com quem compartilhamos</h2>
      <ul>
        <li><b>Cakto</b>: plataforma de pagamento e entrega dos produtos.</li>
        <li><b>Vercel</b>: hospedagem do site.</li>
        <li><b>Google</b> (Planilhas, Drive e Gmail): guardar a lista de quem pediu materiais gratuitos, entregar arquivos e responder e-mails.</li>
        <li><b>Meta</b> (Facebook e Instagram): medir e direcionar anúncios, pelo Pixel, só depois que você aceita os cookies de medição.</li>
        <li><b>Anthropic</b>: inteligência artificial que responde no chat da Nina. Recebe o que você escreve ali.</li>
        <li><b>Supabase</b>: banco de dados onde fica a contagem de mensagens do chat da Nina.</li>
        <li><b>Autoridades</b>: só quando a lei ou uma ordem judicial exigir.</li>
      </ul>

      <h2>4. Transferência para fora do Brasil</h2>
      <p>
        Alguns desses serviços (Vercel, Google, Meta e Anthropic) guardam ou processam dados em servidores fora do Brasil, principalmente nos Estados Unidos.
        Essa transferência acontece para executar o contrato com você e com empresas que adotam cláusulas contratuais e padrões de
        segurança reconhecidos, como prevê o artigo 33 da LGPD.
      </p>

      <h2 id="cookies">5. Cookies</h2>
      <p>
        Usamos cookies necessários para o site funcionar e cookies de medição do Pixel da Meta. Na primeira visita, um aviso pergunta se
        você aceita ou recusa os cookies de medição. O Pixel só começa a funcionar depois que você toca em Aceitar: antes disso, ou se você
        recusar, ele não carrega, não grava o cookie dele e não manda nada do seu navegador (se já tinha gravado, o cookie é apagado ao
        recusar). A escolha fica guardada no próprio navegador. O aviso e o Pixel aparecem só nas páginas do site: o aplicativo Maestro Pet Gestão, as telas de
        cadastro e de entrada e as páginas que os pet shops mandam aos tutores não usam cookies de medição.
      </p>
      <EscolhaDeCookies />
      <p>
        Você também pode apagar ou bloquear os cookies nas configurações do seu navegador a qualquer momento, e ajustar os anúncios que vê em{" "}
        <a href="https://www.facebook.com/adpreferences" rel="noopener noreferrer">facebook.com/adpreferences</a>. Bloquear os cookies
        de medição não impede a compra nem o acesso aos produtos.
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li><b>Dados da compra:</b> pelo prazo exigido pelas leis fiscais e de defesa do consumidor (em geral, 5 anos).</li>
        <li><b>Lista de materiais gratuitos:</b> até você pedir para sair ou retirar o consentimento.</li>
        <li><b>Conversas de suporte:</b> até 2 anos depois do último contato.</li>
        <li><b>Chat da Nina:</b> o texto não fica guardado; a contagem de mensagens por visitante, por poucos dias.</li>
        <li><b>Dados de navegação:</b> pelo prazo definido pela Meta e pela Vercel (o cookie do Pixel, por exemplo, expira em 90 dias se você não voltar ao site).</li>
      </ul>

      <h2>7. Como protegemos</h2>
      <p>
        O site usa conexão segura (HTTPS), os pagamentos são feitos em ambiente certificado da Cakto e o acesso às nossas contas e planilhas
        é restrito a quem cuida da operação. Se acontecer um incidente que possa trazer risco a você,
        avisaremos você e a ANPD, como manda a lei.
      </p>

      <h2>8. Seus direitos (LGPD, art. 18)</h2>
      <p>Você pode, a qualquer momento e sem custo:</p>
      <ul>
        <li>confirmar se tratamos os seus dados e ter acesso a eles;</li>
        <li>corrigir dados incompletos ou errados;</li>
        <li>pedir anonimização, bloqueio ou exclusão de dados desnecessários;</li>
        <li>pedir a portabilidade dos dados para outro fornecedor;</li>
        <li>saber com quem compartilhamos os seus dados;</li>
        <li>retirar o consentimento e sair da lista de novidades (basta responder qualquer e-mail nosso pedindo para sair);</li>
        <li>se opor a um tratamento feito por legítimo interesse;</li>
        <li>reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em <a href="https://www.gov.br/anpd" rel="noopener noreferrer">gov.br/anpd</a>.</li>
      </ul>
      <p>
        Para exercer qualquer um deles, escreva para {mail} com o assunto &quot;Privacidade&quot;. Respondemos em até 15 dias.
        Podemos pedir uma confirmação de que o pedido é seu, para proteger os seus dados.
      </p>

      <h2>9. Crianças</h2>
      <p>As compras são feitas por adultos. Não coletamos de propósito dados de menores de 18 anos.</p>

      <h2>10. Mudanças nesta política</h2>
      <p>Quando esta política mudar, a data no topo será atualizada. Mudanças importantes serão avisadas no site.</p>
    </div>
  );
}
