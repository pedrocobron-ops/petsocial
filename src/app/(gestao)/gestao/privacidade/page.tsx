import type { Metadata } from "next";
import Link from "next/link";
import Legal, { Email, Preencher, QuemResponde, Zap } from "@/components/gestao/legal";
import { EMPRESA } from "@/lib/empresa";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como o Maestro Pet Gestão trata os dados da conta do assinante e os dados que o pet shop lança, de acordo com a LGPD.",
  alternates: { canonical: "/gestao/privacidade" },
};

export default function PrivacidadeDoGestao() {
  return (
    <Legal pagina="privacidade" titulo="Política de privacidade"
      resumo="Aqui explicamos quais dados o Maestro Pet Gestão trata, para quê, onde ficam e como você exerce os seus direitos, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018, a LGPD).">

      <div className="g-leg-quadro">
        <b>Em poucas linhas:</b> os dados que o pet shop lança são do pet shop. Nós só os usamos para o sistema funcionar. Não vendemos dados.
        O aplicativo não tem pixel de anúncio nem cookies de medição. Dá para exportar pela própria tela e pedir a exclusão da conta.
      </div>

      <h2>1. Quem somos</h2>
      <p>
        O Maestro Pet Gestão é oferecido por <QuemResponde />, sob a marca {EMPRESA.marca}. Neste texto, &quot;nós&quot; é a {EMPRESA.marca}.
        Esta política vale para o aplicativo do Gestão, as telas de cadastro e de entrada e a página pública de agendamento dos pet shops.
        O restante do site maestropet.com, incluindo a página de apresentação do Gestão, segue a{" "}
        <Link href="/politica-de-privacidade">política de privacidade do site</Link>.
      </p>

      <h2>2. Dois papéis diferentes</h2>
      <p>A LGPD separa quem decide sobre os dados (controlador) de quem os processa a mando de outro (operador). No Gestão existem as duas situações:</p>
      <dl className="g-leg-pares">
        <div>
          <dt>Dados da sua conta</dt>
          <dd>
            Nome, e-mail, senha, dados do pet shop e da assinatura. Aqui a <b>{EMPRESA.marca} é a controladora</b>: nós decidimos como esses dados são
            usados, dentro do que esta política descreve.
          </dd>
        </div>
        <div>
          <dt>Dados que o pet shop lança</dt>
          <dd>
            Tutores, pets, agenda, financeiro, estoque e equipe. Aqui o <b>pet shop é o controlador</b> e a <b>{EMPRESA.marca} é a operadora</b>:
            guardamos e processamos esses dados só para o sistema funcionar, seguindo as instruções do pet shop.
          </dd>
        </div>
      </dl>
      <p>
        Se você é tutor e o seu pet shop usa o Gestão, quem responde pelos seus dados é o pet shop. Fale primeiro com ele. Se escrever para nós,
        encaminhamos o pedido ao pet shop e ajudamos no que for preciso.
      </p>

      <h2>3. Quais dados tratamos</h2>

      <h3>Da conta do assinante e da equipe</h3>
      <ul>
        <li><b>Cadastro:</b> nome, e-mail e senha. A senha fica guardada de forma cifrada pelo serviço de login; nós não conseguimos lê-la.</li>
        <li><b>Pet shop:</b> nome, telefone, cidade e estado, horário de funcionamento, serviços, preços e ajustes.</li>
        <li><b>Equipe:</b> nome, e-mail de convite, função, escala, percentual de comissão e se a pessoa vê o financeiro.</li>
        <li><b>Assinatura:</b> plano, situação, datas e o e-mail usado na compra. A Cakto nos avisa de cada pagamento, cancelamento ou falha de cobrança, e guardamos esses avisos. Não recebemos o número do cartão.</li>
        <li><b>Uso do assistente:</b> o texto dos pedidos feitos ao Mozart e à Ajuda, a ação proposta, quem pediu e quando.</li>
        <li><b>Atendimento:</b> o que você escrever para nós por e-mail ou WhatsApp.</li>
        <li><b>Registros técnicos:</b> endereço IP, data, hora e tipo de navegador, gerados pelos servidores a cada acesso.</li>
      </ul>

      <h3>Que o pet shop lança (nós como operadora)</h3>
      <ul>
        <li><b>Tutores:</b> nome, telefone, e-mail, endereço e observações.</li>
        <li><b>Pets:</b> nome, espécie, raça, porte, sexo, nascimento, alertas, observações, foto, ficha de saúde (vacinas, vermífugo, antipulgas e vencimentos) e fotos de antes e depois do atendimento.</li>
        <li><b>Agenda, creche e hotel:</b> horários, serviços, profissional, situação e valores.</li>
        <li><b>Dinheiro:</b> caixa, entradas e saídas, pacotes vendidos, comissões e estoque.</li>
      </ul>
      <p>
        O conteúdo desses campos é escolha do pet shop. O sistema não pede CPF nem dados de cartão dos tutores. Pedimos que o pet shop não use os campos
        de observação para dados sensíveis de pessoas, como informações de saúde do tutor.
      </p>

      <h3>Do tutor, no link de agendamento</h3>
      <p>
        Quando o tutor pede um horário pela página pública de um pet shop, informa o próprio nome, o WhatsApp, o nome de cada pet, a espécie, o porte
        (se quiser) e um recado opcional, além do serviço, do dia e da hora escolhidos. Veja o item 7.
      </p>

      <h2>4. Para que usamos e com que base legal</h2>
      <dl className="g-leg-pares">
        <div>
          <dt>Criar e manter a conta</dt>
          <dd>Login, confirmação de e-mail, troca de senha, teste grátis e liberação do acesso. Base: execução do contrato com o assinante.</dd>
        </div>
        <div>
          <dt>Cobrança</dt>
          <dd>Reconhecer o pagamento, liberar ou bloquear a assinatura e guardar os comprovantes. Base: execução do contrato e obrigação legal.</dd>
        </div>
        <div>
          <dt>Suporte e avisos</dt>
          <dd>Responder dúvidas e avisar sobre o serviço, a assinatura e mudanças nos termos. Base: execução do contrato e legítimo interesse.</dd>
        </div>
        <div>
          <dt>Segurança e melhoria</dt>
          <dd>Evitar abuso (como o limite diário do assistente), investigar erros e entender, em números gerais, como o sistema é usado. Base: legítimo interesse.</dd>
        </div>
        <div>
          <dt>Dados lançados pelo pet shop</dt>
          <dd>Guardar, mostrar e processar para o sistema funcionar, a mando do pet shop. A base legal é definida pelo pet shop, que é o controlador.</dd>
        </div>
      </dl>
      <p>Não vendemos dados. Não usamos os dados de tutores e pets para fazer propaganda nem para montar listas para terceiros.</p>

      <h2>5. Onde os dados ficam e quem nos ajuda</h2>
      <p>Usamos fornecedores para manter o sistema no ar. Cada um recebe só o necessário para a sua parte:</p>
      <dl className="g-leg-pares">
        <div>
          <dt>Supabase</dt>
          <dd>Banco de dados, login e guarda das fotos. O banco fica na região de São Paulo, Brasil.</dd>
        </div>
        <div>
          <dt>Vercel</dt>
          <dd>Hospedagem do aplicativo. Os pedidos passam pelos servidores dela, que podem ficar fora do Brasil.</dd>
        </div>
        <div>
          <dt>Cakto</dt>
          <dd>Pagamento da assinatura. Os dados de pagamento do assinante são digitados no ambiente dela e seguem a política dela.</dd>
        </div>
        <div>
          <dt>Anthropic</dt>
          <dd>Processa os pedidos feitos ao assistente (item 8). Os servidores ficam fora do Brasil.</dd>
        </div>
        <div>
          <dt>Envio de e-mail</dt>
          <dd>E-mails de confirmação de conta e de troca de senha: <Preencher>provedor de envio de e-mail (SMTP) configurado no Supabase</Preencher>.</dd>
        </div>
      </dl>
      <p>
        Alguns desses fornecedores tratam dados em servidores fora do Brasil, principalmente nos Estados Unidos. Essa transferência acontece para
        prestar o serviço e com empresas que adotam cláusulas contratuais e padrões de segurança reconhecidos, como prevê o artigo 33 da LGPD.
      </p>
      <p>Também podemos entregar dados a autoridades, só quando a lei ou uma ordem judicial exigir.</p>

      <h2>6. Cookies, pixel e o que fica no seu aparelho</h2>
      <ul>
        <li>O aplicativo, as telas de cadastro e de entrada e a página pública de agendamento <b>não usam pixel de anúncio nem cookies de medição</b>.</li>
        <li>Para manter você conectado, o navegador guarda no próprio aparelho a sessão de login e algumas preferências, como o pet shop aberto por último. Isso serve só para o sistema funcionar. Ao sair da conta, a sessão é apagada.</li>
        <li>A página de apresentação do Gestão faz parte do site maestropet.com e pode usar o Pixel da Meta, como explica a <Link href="/politica-de-privacidade">política do site</Link>.</li>
      </ul>

      <h2>7. Link de agendamento: para onde vão os dados do tutor</h2>
      <p>
        Os dados que o tutor informa no link (nome, WhatsApp, nome do pet e os demais do pedido) vão para o <b>pet shop escolhido</b>, e só para ele.
        O pedido aparece para a equipe desse pet shop, que aceita ou recusa e fala com o tutor pelo WhatsApp do próprio pet shop.
      </p>
      <ul>
        <li>Usamos esses dados apenas para registrar o pedido e mostrá-lo ao pet shop. Não mandamos mensagens ao tutor e não usamos o contato dele para outra coisa.</li>
        <li>Quando o pedido é aceito, o horário entra na agenda e o tutor e o pet passam a constar no cadastro do pet shop, se ainda não estavam lá.</li>
        <li>Para corrigir ou apagar esses dados, o tutor fala com o pet shop, que é o controlador.</li>
      </ul>

      <h2>8. O assistente de inteligência artificial (Mozart)</h2>
      <ul>
        <li>Quando alguém faz um pedido ao Mozart ou à Ajuda, o texto do pedido e os dados do pet shop necessários para responder (por exemplo, nomes de pets e tutores, serviços e horários) são enviados à Anthropic, a empresa que fornece o modelo de inteligência artificial.</li>
        <li>Segundo os termos comerciais do fornecedor em vigor na data desta política, os dados enviados pela API não são usados para treinar os modelos dele por padrão. Essa é uma regra do fornecedor e pode mudar; se mudar de forma relevante, atualizamos esta política.</li>
        <li>O assistente só grava algo no sistema depois que a pessoa confirma. Guardamos o texto do pedido e a ação proposta para controle de uso e para investigar erros.</li>
        <li>Ao usar o microfone, a voz é transformada em texto pelo reconhecimento de voz do seu navegador, que pode usar um serviço do fabricante do navegador. Nós não recebemos nem guardamos o áudio.</li>
        <li>Quem não quiser enviar dados ao assistente pode usar o sistema inteiro pelas telas, sem ele.</li>
      </ul>

      <h2>9. Por quanto tempo guardamos e como apagar</h2>
      <ul>
        <li><b>Enquanto a conta existir,</b> os dados ficam guardados. Isso inclui o período em que a conta está só para consulta, depois do teste ou do cancelamento da assinatura.</li>
        <li><b>Exportação:</b> o pet shop baixa os dados em planilha pela própria tela, em Clientes e pets (Exportar) e em Financeiro (Exportar).</li>
        <li><b>Apagar um tutor ou um pet:</b> a equipe do pet shop apaga pela própria tela, na ficha do cliente.</li>
        <li><b>Exclusão da conta:</b> o dono da conta pede pelo nosso contato. Confirmamos que o pedido é dele e apagamos a conta e os dados do pet shop. Cópias de segurança são sobrescritas com o tempo, conforme o ciclo do fornecedor do banco de dados.</li>
        <li><b>O que pode ficar:</b> registros de pagamento e outros dados que a lei nos obriga a manter, pelo prazo legal, e o necessário para nos defendermos em processo.</li>
      </ul>

      <h2>10. Seus direitos (LGPD, art. 18)</h2>
      <p>Você pode, sem custo:</p>
      <ul>
        <li>confirmar se tratamos os seus dados e ter acesso a eles;</li>
        <li>corrigir dados incompletos ou errados;</li>
        <li>pedir anonimização, bloqueio ou exclusão de dados desnecessários;</li>
        <li>pedir a portabilidade;</li>
        <li>saber com quem os dados são compartilhados;</li>
        <li>se opor a um tratamento feito com base em legítimo interesse;</li>
        <li>reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em <a href="https://www.gov.br/anpd" rel="noopener noreferrer">gov.br/anpd</a>.</li>
      </ul>
      <p><b>Como exercer:</b></p>
      <ul>
        <li><b>Assinante ou pessoa da equipe:</b> boa parte se resolve na própria tela (corrigir, exportar). Para o resto, escreva para <Email /> com o assunto &quot;Privacidade&quot;. Respondemos em até 15 dias. Podemos pedir uma confirmação de que o pedido é seu.</li>
        <li><b>Tutor:</b> fale com o pet shop onde o seu pet é atendido. Se preferir escrever para nós, diga qual é o pet shop: encaminhamos o pedido e ajudamos o pet shop a atender.</li>
      </ul>

      <h2>11. Segurança</h2>
      <ul>
        <li>O acesso é por login com e-mail e senha, e a conexão é segura (HTTPS).</li>
        <li>O banco de dados separa os pet shops: as regras ficam no próprio banco e cada login só alcança os dados do pet shop a que pertence.</li>
        <li>Dentro do pet shop, o dono decide quem vê o financeiro.</li>
        <li>As fotos de pets ficam em endereços com nome aleatório. Quem tiver o endereço exato de uma foto consegue abrir a imagem, por isso não compartilhe esses endereços com quem não deve ver.</li>
        <li>Na {EMPRESA.marca}, o acesso aos dados dos pet shops é restrito a quem cuida da operação e só acontece para suporte, manutenção, segurança ou obrigação legal.</li>
      </ul>
      <p>
        Nenhum sistema é totalmente seguro. Se acontecer um incidente que possa trazer risco ou dano relevante, avisamos os assinantes afetados e a ANPD,
        como manda a lei. A sua parte é usar uma senha forte, não dividir o login e tirar o acesso de quem sair da equipe.
      </p>

      <h2>12. Menores de idade</h2>
      <p>O Gestão é uma ferramenta de trabalho para adultos. Não coletamos de propósito dados de menores de 18 anos.</p>

      <h2>13. Mudanças nesta política</h2>
      <p>Quando esta política mudar, a data no topo é atualizada. Mudanças importantes são avisadas pelo aplicativo ou por e-mail.</p>

      <h2>14. Contato e encarregado</h2>
      <p>
        Encarregado pelo tratamento de dados (DPO): <Preencher>nome do encarregado</Preencher>. Para falar com o encarregado ou tratar de qualquer
        assunto de privacidade, escreva para <Email />. Para outras dúvidas, também atendemos pelo <Zap />.
      </p>
      <p>Veja também os <Link href="/gestao/termos">Termos de uso</Link>.</p>
    </Legal>
  );
}
