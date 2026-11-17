import type { Metadata } from "next";
import Link from "next/link";
import Legal, { Email, EmailJuridico, Encarregado, Indice, Parte, Preencher, QuemResponde, Zap } from "@/components/gestao/legal";
import { EMPRESA } from "@/lib/empresa";
import { DIAS_DO_BOLETIM } from "@/lib/gestao/boletim";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como o Maestro Pet Gestão trata os dados da conta do assinante e os dados que o pet shop lança, de acordo com a LGPD.",
  alternates: { canonical: "/gestao/privacidade" },
};

const PARTES: [string, string][] = [
  ["quem-somos", "Quem somos e onde esta política vale"],
  ["papeis", "Quem decide sobre cada dado"],
  ["dados", "Quais dados tratamos"],
  ["para-que", "Para que usamos e com que base legal"],
  ["fornecedores", "Fornecedores que nos ajudam"],
  ["exterior", "Dados fora do Brasil"],
  ["publico", "Páginas públicas e links"],
  ["ia", "Inteligência artificial e voz"],
  ["erros", "Registro de erros e de uso"],
  ["aparelho", "Cookies e o que fica no seu aparelho"],
  ["guarda", "Por quanto tempo guardamos"],
  ["seguranca", "Segurança"],
  ["direitos", "Seus direitos e como pedir"],
  ["incidentes", "Se algo der errado"],
  ["menores", "Menores de idade"],
  ["mudancas", "Mudanças nesta política"],
  ["contato", "Encarregado e contato"],
];

export default function PrivacidadeDoGestao() {
  let n = 0;
  const p = (id: string, resumo: string, children: React.ReactNode) => {
    n += 1;
    const titulo = PARTES.find(([i]) => i === id)?.[1] ?? id;
    return <Parte id={id} n={n} titulo={titulo} resumo={resumo}>{children}</Parte>;
  };

  return (
    <Legal pagina="privacidade" titulo="Política de privacidade"
      resumo="Aqui explicamos quais dados o Maestro Pet Gestão trata, para quê, com quem, por quanto tempo e como você exerce os seus direitos, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018, a LGPD). Cada parte começa com um resumo; o texto completo logo abaixo é o que vale.">

      <div className="g-leg-quadro">
        <b>O principal, em poucas linhas:</b> os dados que o pet shop lança são do pet shop, e nós só os usamos para o sistema funcionar.
        Não vendemos dados e não fazemos propaganda com eles. Alguns fornecedores ficam fora do Brasil, como a inteligência artificial e a hospedagem.
        O aplicativo não tem pixel de anúncio. Dá para baixar todos os dados e apagar a conta pela própria tela.
        Tutor: quem responde pelos seus dados é o pet shop; fale com ele, e nós ajudamos.
      </div>

      <Indice partes={PARTES} />

      {p("quem-somos", "Esta política é do Gestão: aplicativo, cadastro, entrada e as páginas públicas dos pet shops.", <>
        <p>
          O Maestro Pet Gestão é oferecido por <QuemResponde />, dona da marca {EMPRESA.marca} (&quot;nós&quot;).
          Esta política vale para o aplicativo do Gestão, as telas de cadastro e de entrada e as páginas públicas que os pet shops mandam aos tutores
          (link de agendamento, página do tutor, boletim e álbum). O restante do site maestropet.com, incluindo a página de apresentação do Gestão, segue a{" "}
          <Link href="/politica-de-privacidade">política de privacidade do site</Link>.
        </p>
        <p>Ela completa os <Link href="/gestao/termos">Termos de uso</Link>.</p>
      </>)}

      {p("papeis", "Nos dados da sua conta, nós decidimos (controladora). Nos dados que o pet shop lança sobre clientes e pets, o pet shop decide (controlador) e nós processamos a mando dele (operadora).", <>
        <p>A LGPD separa quem decide sobre os dados (controlador) de quem os processa a mando de outro (operador). No Gestão existem as duas situações:</p>
        <dl className="g-leg-pares">
          <div>
            <dt>Dados da conta</dt>
            <dd>Nome, e-mail e login do assinante e da equipe, dados do pet shop, da assinatura e do uso do sistema. Aqui a <b>{EMPRESA.marca} é a controladora</b>.</dd>
          </div>
          <div>
            <dt>Dados que o pet shop lança</dt>
            <dd>
              Tutores, pets, fotos, agenda, creche e hotel, financeiro, estoque e os pedidos que chegam pelo link. Aqui o <b>pet shop é o controlador</b> e a
              {" "}<b>{EMPRESA.marca} é a operadora</b>: guardamos e processamos esses dados só para o sistema funcionar, seguindo as instruções do pet shop e os Termos de uso.
            </dd>
          </div>
        </dl>
        <p>
          <b>Se você é tutor</b> e o seu pet shop usa o Gestão, quem responde pelos seus dados é o pet shop. Fale primeiro com ele. Se escrever para nós,
          encaminhamos o pedido ao pet shop e ajudamos no que for preciso (parte 13).
        </p>
      </>)}

      {p("dados", "Tratamos os dados da conta, os de uso e os técnicos, e guardamos o que o pet shop lança sobre clientes e pets. Não pedimos CPF nem cartão dos tutores.", <>
        <h3>Da conta do assinante e da equipe</h3>
        <ul>
          <li><b>Cadastro:</b> nome, e-mail e senha. A senha fica cifrada pelo serviço de login; nós não conseguimos lê-la.</li>
          <li><b>Pet shop:</b> nome, telefone, cidade e estado, logo, horário de funcionamento, serviços, preços e ajustes.</li>
          <li><b>Equipe:</b> nome, e-mail do convite, função, áreas que pode abrir, escala, comissão.</li>
          <li><b>Assinatura:</b> plano, situação, datas e o e-mail usado na compra. A Cakto nos avisa de cada pagamento, renovação, cancelamento, reembolso ou falha, e guardamos esses avisos. Não recebemos o número do cartão.</li>
          <li><b>Pedidos de dados:</b> quem baixou todos os dados, baixou ou apagou os dados de um tutor, pediu ou cancelou a exclusão da conta ou saiu de uma equipe, e quando. Esse registro não guarda os dados dos clientes.</li>
          <li><b>Aceite dos termos:</b> qual versão dos Termos e desta política cada pessoa aceitou, quando e, quando disponíveis, o endereço de rede (IP) e o navegador.</li>
          <li><b>Assistente:</b> o texto dos pedidos feitos ao Mozart e à Ajuda, a resposta, a ação proposta, se foi confirmada, se a dúvida foi resolvida, quem pediu e quando.</li>
          <li><b>Escola de Gestão:</b> quais materiais foram comprados com o e-mail da conta.</li>
          <li><b>Uso do sistema:</b> quando cada pessoa esteve com o sistema aberto, por quanto tempo e em quais áreas, e contagens de uso (quantos agendamentos, leituras de foto, perguntas no link).</li>
          <li><b>Erros:</b> quando uma tela dá erro, a mensagem técnica limpa, a tela, o tamanho da tela, o navegador e a versão do sistema (parte 9).</li>
          <li><b>Atendimento:</b> o que você escrever para nós por e-mail ou WhatsApp.</li>
          <li><b>Registros técnicos:</b> endereço IP, data, hora e navegador, gerados pelos servidores a cada acesso.</li>
        </ul>

        <h3>Que o pet shop lança (nós como operadora)</h3>
        <ul>
          <li><b>Tutores:</b> nome, telefone, e-mail, endereço, observações, quem pode buscar o pet, valores devidos e créditos.</li>
          <li><b>Pets:</b> nome, espécie, raça, porte, sexo, nascimento, alertas, observações, ficha de saúde (vacinas, vermífugo, antipulgas, remédios e vencimentos), fotos (perfil, antes e depois, boletim, fotos do dia da creche e do hotel), diário e ocorrências, e o checklist de entrada (temperamento, como o pet chegou, com fotos, e os pertences).</li>
          <li><b>Autorizações para postar fotos:</b> as que o tutor deu pelo boletim (parte 7), com o texto aceito, o dia e a hora, e quando foram tiradas.</li>
          <li><b>Atendimento e dinheiro:</b> agenda, estadias, pacotes, caixa, entradas e saídas, comissões, estoque e fornecedores.</li>
        </ul>
        <p>
          O conteúdo desses campos é escolha do pet shop. O sistema não pede CPF nem dados de cartão dos tutores. Os Termos pedem que o pet shop não use
          os campos livres para dados sensíveis de pessoas, como saúde do tutor, e que evite pessoas nas fotos.
        </p>

        <h3>Do tutor, nas páginas públicas</h3>
        <ul>
          <li><b>Pedido pelo link de agendamento:</b> nome, WhatsApp, nome, espécie e porte de cada pet, recado opcional, serviço, dia e hora, e o aceite das regras do pet shop, quando ele pede.</li>
          <li><b>Autorização para postar fotos:</b> se o tutor tocar em &quot;Pode postar a foto&quot; no boletim, guardamos a escolha (só as fotos daquele boletim ou também as das próximas visitas), o perfil para marcar, se ele informar, o texto exato que aceitou, o dia e a hora e, se ele tirar, quando tirou.</li>
          <li><b>Dúvidas pelo link:</b> o texto da pergunta vai à inteligência artificial para ser respondido, mas <b>não fica guardado</b>; guardamos só a contagem. O link pede para o tutor não escrever dados pessoais ali.</li>
          <li><b>Proteção contra abuso:</b> para limitar pedidos e acessos repetidos, usamos o endereço de rede (IP) de quem acessa, só para contar e frear excessos.</li>
        </ul>
      </>)}

      {p("para-que", "Usamos os dados para prestar o serviço, cobrar, dar suporte, manter a segurança, melhorar o sistema e cumprir a lei. Não vendemos dados.", <>
        <dl className="g-leg-pares">
          <div><dt>Criar e manter a conta</dt><dd>Login, confirmação de e-mail, troca de senha, teste, equipe e liberação do acesso. Base: execução do contrato (art. 7º, V).</dd></div>
          <div><dt>Cobrança</dt><dd>Reconhecer o pagamento, liberar ou bloquear a conta, reembolsar e guardar os comprovantes. Base: execução do contrato e cumprimento de obrigação legal (art. 7º, II e V).</dd></div>
          <div><dt>Prova do aceite</dt><dd>Guardar quem aceitou cada versão dos documentos. Base: exercício regular de direitos e legítimo interesse (art. 7º, VI e IX).</dd></div>
          <div><dt>Suporte e avisos</dt><dd>Responder dúvidas, ajudar quando você pede e avisar sobre o serviço, a cobrança e mudanças nos documentos. Base: execução do contrato e legítimo interesse.</dd></div>
          <div><dt>Segurança e melhoria</dt><dd>Evitar abuso (limites do assistente, das leituras e das páginas públicas), investigar erros, ler as conversas com o assistente para melhorar as respostas e entender, em números gerais, como o sistema é usado. Base: legítimo interesse (art. 7º, IX).</dd></div>
          <div><dt>Dados lançados pelo pet shop</dt><dd>Guardar, mostrar e processar para o sistema funcionar, a mando do pet shop. A base legal é definida pelo pet shop, que é o controlador.</dd></div>
          <div><dt>Obrigações legais</dt><dd>Guardar registros de acesso pelo prazo do Marco Civil da Internet e atender ordens de autoridades. Base: obrigação legal.</dd></div>
        </dl>
        <p>
          Não vendemos dados. Não usamos os dados de tutores e pets em propaganda, nem para montar listas para terceiros, nem para treinar modelos de inteligência artificial.
        </p>
      </>)}

      {p("fornecedores", "Contamos com fornecedores para banco de dados, hospedagem, pagamentos, inteligência artificial e e-mail. Cada um recebe só o necessário.", <>
        <dl className="g-leg-pares">
          <div><dt>Supabase</dt><dd>Banco de dados, login e guarda das fotos. O banco fica na região de São Paulo, Brasil; a empresa é dos Estados Unidos.</dd></div>
          <div><dt>Vercel</dt><dd>Hospedagem do aplicativo e das páginas públicas. Os pedidos passam pelos servidores dela, que podem ficar fora do Brasil.</dd></div>
          <div><dt>Anthropic</dt><dd>Fornece o modelo de inteligência artificial do Mozart, da Ajuda, da leitura do caderno, dos textos do boletim e das dúvidas do link (parte 8). Servidores fora do Brasil.</dd></div>
          <div><dt>Cakto</dt><dd>Pagamento da assinatura. Os dados de pagamento são digitados no ambiente dela e seguem a política dela.</dd></div>
          <div><dt>Envio de e-mail</dt><dd>E-mails de confirmação de conta e de troca de senha, enviados pelo serviço de login do Supabase.</dd></div>
        </dl>
        <p>
          Também passam por serviços de terceiros, mas por escolha e no aparelho de quem usa: o <b>WhatsApp</b>, quando o pet shop abre uma mensagem pronta
          (nós não enviamos nada ao WhatsApp), e o <b>reconhecimento de voz do navegador</b>, quando alguém usa o microfone (parte 8).
        </p>
        <p>Podemos entregar dados a autoridades só quando a lei ou uma ordem judicial exigir. Se o negócio for vendido ou reorganizado, os dados seguem com ele, sob esta política.</p>
      </>)}

      {p("exterior", "Hospedagem e inteligência artificial ficam, em parte, fora do Brasil, principalmente nos Estados Unidos. Essa transferência é feita para prestar o serviço, com as garantias que a LGPD pede.", <>
        <p>
          Parte do tratamento acontece fora do Brasil, principalmente nos Estados Unidos: a hospedagem da Vercel e o processamento da inteligência artificial
          da Anthropic, e eventualmente o suporte técnico dos fornecedores. Essa transferência internacional é necessária para prestar o serviço que você contratou
          e é feita com fornecedores que se comprometem por contrato com padrões de proteção de dados e segurança, conforme o artigo 33 da LGPD e as regras da ANPD
          sobre o tema. Usar o assistente e as funções de inteligência artificial é opcional.
        </p>
      </>)}

      {p("publico", `As páginas que o pet shop manda aos tutores abrem para quem tiver o link. O boletim e o álbum abrem por ${DIAS_DO_BOLETIM} dias. Nada aparece em buscadores.`, <>
        <ul>
          <li><b>Link de agendamento:</b> mostra dados do pet shop (nome, cidade, telefone, horário, serviços, horários livres e, se ele quiser, preços). Não mostra a agenda nem dados de outros clientes. O pedido do tutor vai só para o pet shop escolhido.</li>
          <li><b>Página do tutor:</b> link particular de cada tutor, sem senha, com os pets dele, o diário, as fotos do dia e o que está marcado. As fotos do dia passam pelo nosso servidor, que confere o link antes de entregar, e são apagadas no prazo que o pet shop escolhe (30, 60, 90 ou 180 dias; o normal é 90).</li>
          <li><b>Boletim e álbum:</b> página de cada visita ou do álbum do pet, com fotos, recados e, se o pet shop ligar, valores. O link abre por {DIAS_DO_BOLETIM} dias e depois para de abrir. As fotos continuam no álbum do pet, dentro do sistema, enquanto o pet estiver cadastrado ou até o pet shop apagá-las. A página não mostra telefone nem dados do tutor.</li>
          <li><b>Checklist de entrada:</b> quando o pet chega, o pet shop pode pedir que o tutor confira e aceite como o pet chegou, assinando no aparelho do pet shop ou por um link mandado no WhatsApp. Guardamos o nome digitado, a imagem da assinatura e a hora; pelo link, também o endereço de internet (IP) e o navegador. O link abre por 7 dias, mostra só o pet, o que foi anotado e as fotos, e não mostra telefone nem dados do tutor.</li>
          <li>Essas páginas pedem aos buscadores para não serem indexadas. Quem tiver o link consegue abrir; por isso o pet shop deve mandá-lo só ao tutor e pode trocar ou desligar o link da página do tutor.</li>
          <li><b>Autorização para postar fotos:</b> a página do boletim pode trazer &quot;Pode postar a foto&quot;. Nada vem marcado: o tutor escolhe se autoriza só as fotos daquele boletim ou também as das próximas visitas e, se quiser, o perfil dele para a loja marcar. O sistema monta o texto, guarda o que ele aceitou e mostra ao pet shop na ficha e no álbum do pet. Só o tutor autoriza; a equipe não consegue marcar por ele.</li>
          <li><b>Tirar a autorização:</b> o tutor recebe junto um link &quot;Não quero mais&quot;, que funciona para sempre (mesmo depois que o boletim para de abrir) e tira na hora todas as autorizações daquele pet. Para o pet shop, a ficha passa a mostrar &quot;Sem autorização&quot;.</li>
          <li><b>O sistema não posta nada</b> nas redes sociais. Quem escolhe e posta é o pet shop, que é o controlador desses dados e responde pela postagem e por respeitar quando o tutor tira a autorização.</li>
        </ul>
      </>)}

      {p("ia", "Pedidos ao Mozart, fotos do caderno e perguntas do link vão à Anthropic para serem processados. Os arquivos do caderno não ficam guardados. A voz vira texto no navegador.", <>
        <ul>
          <li><b>Mozart e Ajuda:</b> o texto do pedido e os dados do pet shop necessários para responder (por exemplo, nomes de pets e tutores, serviços, horários e valores, conforme o que a pessoa pode ver) vão à Anthropic. Guardamos a conversa e a ação proposta; nada é gravado no sistema antes de a pessoa confirmar o cartão.</li>
          <li><b>Trazer do caderno e ler a carteirinha:</b> as fotos e os PDFs vão à Anthropic para serem lidos e <b>não ficam guardados no sistema</b>. Fica só o que a pessoa confere e salva, e a contagem de leituras.</li>
          <li><b>Textos do boletim:</b> vão à Anthropic o nome e os dados do pet e da visita necessários para o texto, sem os dados do tutor.</li>
          <li><b>Dúvidas pelo link:</b> a pergunta do tutor e o que o link do pet shop já mostra vão à Anthropic. A pergunta não fica guardada.</li>
          <li>Segundo os termos comerciais do fornecedor em vigor nesta data, os dados enviados pela API não são usados para treinar os modelos dele, e ele pode guardá-los por um tempo limitado para segurança e prevenção de abuso. Essas regras são do fornecedor e podem mudar; se mudarem de forma relevante, atualizamos esta política.</li>
          <li><b>Voz:</b> ao usar o microfone, a fala é transformada em texto pelo reconhecimento de voz do próprio navegador (Chrome, Edge, Safari), que pode usar um serviço do fabricante do navegador, sob a política dele. Nós recebemos só o texto; não recebemos nem guardamos áudio.</li>
          <li>Quem não quiser enviar dados à inteligência artificial pode usar o sistema inteiro pelas telas, sem ela.</li>
        </ul>
      </>)}

      {p("erros", "Quando uma tela quebra, guardamos por 30 dias só o necessário para consertar, sem nomes, telefones, e-mails nem valores.", <>
        <ul>
          <li>Quando uma tela ou uma rota do servidor dá erro, o sistema registra a mensagem técnica, a tela, o papel de quem usava, o tamanho da tela, o navegador e a versão do sistema.</li>
          <li>Antes de guardar, o sistema tira e-mails, telefones, valores, códigos e endereços completos da mensagem. Os registros de erro são apagados depois de 30 dias.</li>
          <li>Também registramos quando cada pessoa usa o sistema e quanto, para entender o uso e ajudar quem está com dificuldade. O painel da nossa equipe mostra os dados da conta e quantidades, não os clientes, os pets nem o dinheiro do pet shop.</li>
        </ul>
      </>)}

      {p("aparelho", "Sem pixel de anúncio e sem cookie de medição no aplicativo. O navegador guarda só o login e algumas preferências.", <>
        <ul>
          <li>O aplicativo, as telas de cadastro e de entrada e as páginas públicas dos pet shops <b>não usam pixel de anúncio nem cookies de medição</b>.</li>
          <li>Para manter você conectado, o navegador guarda no próprio aparelho a sessão de login. Também guarda preferências e rascunhos, como o pet shop aberto por último, os ajustes da voz e um formulário ainda não salvo. Isso serve só para o sistema funcionar e fica no seu aparelho. Ao sair da conta, a sessão é apagada.</li>
          <li>A página de apresentação do Gestão faz parte do site maestropet.com e pode usar o Pixel da Meta, como explica a <Link href="/politica-de-privacidade">política do site</Link>.</li>
        </ul>
      </>)}

      {p("guarda", "Guardamos enquanto a conta existir, com prazos menores para fotos de links, erros e arquivos de leitura. Alguns registros ficam pelo prazo da lei.", <>
        <dl className="g-leg-pares">
          <div><dt>Conta e dados do pet shop</dt><dd>Enquanto a conta existir, inclusive só para consulta. Conta só para consulta por mais de 180 dias pode ser apagada, com aviso de 30 dias (Termos, parte 8).</dd></div>
          <div><dt>Cliente ou pet apagado</dt><dd>Sai na hora da tela. Os arquivos das fotos ligadas a ele são apagados logo depois, na faxina automática.</dd></div>
          <div><dt>Dados de tutor apagados a pedido</dt><dd>Em &quot;Apagar dados deste tutor&quot;, nome, telefone, e-mail, endereço, observações, pets, saúde, boletins e autorizações saem na hora; as fotos, na faxina diária. Os valores ficam no financeiro, sem o nome, para a contabilidade do pet shop.</dd></div>
          <div><dt>Autorizações para postar fotos</dt><dd>Enquanto o pet estiver cadastrado, inclusive as que o tutor tirou (com a data em que tirou), para mostrar quando valeram.</dd></div>
          <div><dt>Conta apagada a pedido</dt><dd>Em &quot;Encerrar e apagar a conta&quot;, 30 dias só para consulta (dá para cancelar); depois apagamos o pet shop, os dados, os arquivos e os logins da equipe que não estão em outro pet shop. Fica só o registro de que a conta foi apagada (nome do pet shop, quem pediu e quando).</dd></div>
          <div><dt>Registro de pedidos de dados</dt><dd>Enquanto a conta existir e, depois de apagada, pelo prazo em que puder ser necessário para provar que o pedido foi atendido.</dd></div>
          <div><dt>Fotos do álbum e do boletim</dt><dd>Enquanto o pet estiver cadastrado ou até o pet shop apagá-las. O link aberto ao tutor vale {DIAS_DO_BOLETIM} dias.</dd></div>
          <div><dt>Checklist de entrada</dt><dd>Fica junto com o atendimento ou a estadia e é apagado com ele, com o pet ou com a conta. O link para o tutor aceitar vale 7 dias.</dd></div>
          <div><dt>Fotos da página do tutor</dt><dd>30, 60, 90 ou 180 dias, como o pet shop escolher (o normal é 90).</dd></div>
          <div><dt>Fotos e PDFs do caderno</dt><dd>Não ficam guardados: são lidos e descartados.</dd></div>
          <div><dt>Perguntas do link</dt><dd>Não ficam guardadas; só a contagem.</dd></div>
          <div><dt>Conversas com o assistente</dt><dd>Enquanto a conta existir.</dd></div>
          <div><dt>Registros de erro</dt><dd>30 dias.</dd></div>
          <div><dt>Registros de acesso</dt><dd>Pelo prazo que a lei exigir (o Marco Civil da Internet pede 6 meses).</dd></div>
          <div><dt>Pagamentos e aceites</dt><dd>Pelo prazo que a lei exigir e enquanto puderem ser necessários para defesa em processo, mesmo depois de a conta ser apagada.</dd></div>
          <div><dt>Cópias de segurança</dt><dd>Substituídas com o tempo, no ciclo do fornecedor do banco de dados.</dd></div>
        </dl>
        <p>
          <b>Baixar e apagar:</b> o dono baixa todos os dados em Meu pet shop (um .zip com uma planilha por parte e um README) e as planilhas em Clientes e pets, Financeiro e Relatórios, inclusive com a conta só para consulta.
          Na ficha do tutor, baixa os dados daquele cliente ou apaga os dados pessoais dele. A conta inteira é apagada pelo titular em Meu pet shop, Encerrar e apagar a conta.
        </p>
      </>)}

      {p("seguranca", "Usamos conexão segura, separação entre pet shops no próprio banco e acesso restrito na nossa equipe. Nenhum sistema é totalmente seguro.", <>
        <ul>
          <li>A conexão é cifrada (HTTPS) e o acesso é por login com e-mail e senha.</li>
          <li>O banco de dados separa os pet shops com regras no próprio banco: cada login só alcança os dados do pet shop a que pertence, e dentro dele só as áreas que o dono liberou.</li>
          <li>Valores e preços só chegam a quem tem área de dinheiro. As gravações de dinheiro são conferidas no banco.</li>
          <li>As fotos do perfil e do antes e depois ficam em endereços com nome aleatório e difícil de adivinhar: quem tiver o endereço exato consegue abrir a imagem. As fotos da página do tutor, do boletim e do álbum passam pelo nosso servidor, que confere o link antes de entregar.</li>
          <li>Na nossa equipe, o acesso aos dados dos pet shops é restrito a quem cuida da operação e só acontece para suporte pedido por você, manutenção, segurança ou obrigação legal.</li>
          <li>A sua parte: senha forte, um login por pessoa, tirar o acesso de quem sair da equipe e mandar os links só a quem deve vê-los.</li>
        </ul>
      </>)}

      {p("direitos", "Você pode ver, corrigir, baixar e pedir a exclusão dos seus dados. O assinante resolve boa parte na própria tela. O tutor pede ao pet shop, e nós ajudamos.", <>
        <p>Pela LGPD (art. 18), você pode, sem custo:</p>
        <ul>
          <li>confirmar se tratamos os seus dados e ter acesso a eles;</li>
          <li>corrigir dados incompletos, errados ou desatualizados;</li>
          <li>pedir anonimização, bloqueio ou exclusão de dados desnecessários ou tratados em desacordo com a lei;</li>
          <li>pedir a portabilidade dos dados;</li>
          <li>saber com quem os dados são compartilhados;</li>
          <li>pedir a exclusão de dados tratados com o seu consentimento e revogar esse consentimento;</li>
          <li>se opor a um tratamento feito com base em legítimo interesse e pedir revisão de decisões tomadas só de forma automática;</li>
          <li>reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em <a href="https://www.gov.br/anpd" rel="noopener noreferrer">gov.br/anpd</a>.</li>
        </ul>
        <p><b>Como pedir:</b></p>
        <ul>
          <li><b>Assinante ou pessoa da equipe:</b> boa parte se resolve na própria tela: corrigir, baixar todos os dados, apagar clientes, apagar a conta (Meu pet shop, Encerrar e apagar a conta) e sair de uma equipe (&quot;Sair desta equipe&quot;). Para o resto, escreva para <EmailJuridico /> ou <Email /> com o assunto &quot;Privacidade&quot;. Podemos pedir uma confirmação de que o pedido é seu. Respondemos em até 15 dias.</li>
          <li><b>Tutor:</b> fale com o pet shop onde o seu pet é atendido: ele é o controlador e, pela ficha do tutor, consegue baixar os seus dados em planilhas, corrigi-los e apagá-los. Para tirar a autorização de postar fotos, use o link &quot;Não quero mais&quot; do boletim. Se preferir escrever para nós, diga qual é o pet shop: encaminhamos o pedido a ele e ajudamos a atender.</li>
        </ul>
      </>)}

      {p("incidentes", "Se acontecer um incidente com risco relevante, avisamos os pet shops afetados e a ANPD, como manda a lei.", <>
        <p>
          Se acontecer um incidente de segurança que possa trazer risco ou dano relevante, avisamos os assinantes afetados e a ANPD no prazo e da forma que a lei
          e a ANPD determinam, dizendo o que aconteceu, quais dados foram afetados, o que fizemos e o que você pode fazer. Quando o incidente envolver dados que o
          pet shop lança, avisamos o pet shop, que é o controlador, e ajudamos na comunicação aos tutores.
        </p>
      </>)}

      {p("menores", "O Gestão é para adultos. O pet shop não deve lançar dados de crianças.", <>
        <p>O Gestão é uma ferramenta de trabalho para maiores de 18 anos. Não coletamos de propósito dados de crianças e adolescentes, e os Termos pedem que o pet shop não os lance.</p>
      </>)}

      {p("mudancas", "Quando esta política mudar de forma importante, avisamos e pedimos o seu aceite de novo ao abrir o sistema.", <>
        <p>
          Quando esta política mudar, a versão e a data no topo são atualizadas. Em mudanças importantes, avisamos pelo aplicativo ou por e-mail e, ao abrir o sistema,
          cada pessoa vê um resumo do que mudou e aceita a nova versão para continuar.
        </p>
      </>)}

      {p("contato", "Fale com o encarregado pelo e-mail de privacidade.", <>
        <p>
          Encarregado pelo tratamento de dados pessoais (DPO): <Encarregado />. Para falar com o encarregado ou tratar de qualquer assunto de privacidade,
          escreva para <EmailJuridico />. Para outras dúvidas, também atendemos por <Email /> e pelo <Zap />.
        </p>
        <p>Veja também os <Link href="/gestao/termos">Termos de uso</Link>.</p>
      </>)}
    </Legal>
  );
}
