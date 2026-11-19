import type { Metadata } from "next";
import Link from "next/link";
import Legal, { Email, EmailPrivacidade, Encarregado, Indice, Parte, Preencher, QuemResponde, Zap } from "@/components/gestao/legal";
import { EMPRESA } from "@/lib/empresa";
import { DIAS_DO_BOLETIM } from "@/lib/gestao/boletim";
import { DOCUMENTOS, dataBr } from "@/lib/gestao/documentos";
import { quemOferece } from "@/lib/gestao/vendedor-documentos";

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

export default async function PrivacidadeDoGestao() {
  const v = await quemOferece();
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
        A nossa equipe vê números; para ler uma conversa com o Mozart e dar suporte, precisa escrever o motivo, e o dono do pet shop vê cada abertura.
        O aplicativo não tem pixel de anúncio. Dá para baixar todos os dados e apagar a conta pela própria tela.
        Tutor: quem responde pelos seus dados é o pet shop; fale com ele, e nós ajudamos.
      </div>

      <Indice partes={PARTES} />

      {p("quem-somos", "Esta política é do Gestão: aplicativo, cadastro, entrada e as páginas públicas dos pet shops.", <>
        <p>
          O Maestro Pet Gestão é oferecido por <QuemResponde v={v} />, {v.pessoaFisica ? "responsável pela" : "dona da"} marca {EMPRESA.marca} (&quot;nós&quot;).
          Esta política vale para o aplicativo do Gestão, as telas de cadastro e de entrada e as páginas públicas que os pet shops mandam aos tutores
          (link de agendamento, página do tutor, boletim e álbum). O restante do site maestropet.com, incluindo a página de apresentação do Gestão, segue a{" "}
          <Link href="/politica-de-privacidade">política de privacidade do site</Link>.
        </p>
        <p>Ela completa os <Link href="/gestao/termos">Termos de uso</Link>. Se você é tutor e quer saber só o que importa para você, veja a página <Link href="/gestao/para-o-tutor">Para o tutor</Link>.</p>
      </>)}

      {p("papeis", "Nos dados da sua conta, nós decidimos (controladora). Nos dados que o pet shop lança sobre clientes e pets, o pet shop decide (controlador) e nós processamos a mando dele (operadora).", <>
        <p>A LGPD separa quem decide sobre os dados (controlador) de quem os processa a mando de outro (operador). No Gestão existem as duas situações:</p>
        <dl className="g-leg-pares">
          <div>
            <dt>Dados da conta</dt>
            <dd>Nome, e-mail e login do assinante e da equipe, dados do pet shop, da assinatura e do uso do sistema (não os dados de trabalho da equipe, como escala, comissão e vendas, que são do pet shop). Aqui a <b>{EMPRESA.marca} é a controladora</b>.</dd>
          </div>
          <div>
            <dt>Dados que o pet shop lança</dt>
            <dd>
              Tutores, pets, fotos, agenda, creche e hotel, financeiro, estoque, os pedidos que chegam pelo link e os dados de trabalho da equipe (escala, comissão, vendas). Aqui o <b>pet shop é o controlador</b> e a
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
          <li><b>Equipe:</b> nome, e-mail do convite, função e áreas que pode abrir. Escala, comissão e vendas de cada pessoa são dados que o pet shop lança.</li>
          <li><b>Assinatura:</b> plano, situação, datas e o e-mail usado na compra. A Cakto nos avisa de cada pagamento, renovação, cancelamento, reembolso ou falha, e guardamos esses avisos. Não recebemos o número do cartão.</li>
          <li><b>Pedidos de dados:</b> quem baixou todos os dados, baixou, apagou ou excluiu os dados de um tutor, pediu ou cancelou a exclusão da conta ou saiu de uma equipe, e quando. Esse registro não guarda os dados dos clientes.</li>
          <li><b>Acessos da nossa equipe:</b> cada vez que alguém da equipe Maestro Pet abre uma conversa do pet shop com o Mozart ou a Ajuda para dar suporte: quem abriu, quando e o motivo (parte 9).</li>
          <li><b>Aceite dos termos:</b> qual versão dos Termos e desta política cada pessoa aceitou, quando e, quando disponíveis, o endereço de rede (IP) e o navegador. No aceite feito na hora do cadastro, o IP e o navegador não são guardados.</li>
          <li><b>Assistente:</b> o texto dos pedidos feitos ao Mozart e à Ajuda, a resposta, a ação proposta, se foi confirmada, se a dúvida foi resolvida, quem pediu e quando.</li>
          <li><b>Escola de Gestão:</b> quais materiais foram comprados com o e-mail da conta.</li>
          <li><b>Registros de acesso:</b> data, hora, endereço de internet (IP) e navegador de cada entrada no sistema.</li>
          <li><b>Uso do sistema:</b> quando cada pessoa esteve com o sistema aberto, por quanto tempo e em quais áreas, e contagens de uso (quantos agendamentos, leituras de foto, perguntas no link).</li>
          <li><b>Erros:</b> quando uma tela dá erro, a mensagem técnica limpa, a tela, o tamanho da tela, o navegador e a versão do sistema (parte 9).</li>
          <li><b>Atendimento:</b> o que você escrever para nós por e-mail ou WhatsApp.</li>
          <li><b>Registros técnicos:</b> endereço IP, data, hora e navegador, gerados pelos servidores a cada acesso.</li>
        </ul>

        <h3>Que o pet shop lança (nós como operadora)</h3>
        <ul>
          <li><b>Tutores:</b> nome, telefone, e-mail, endereço, data de aniversário (opcional: dia e mês, e o ano se o tutor quiser, só para o pet shop mandar os parabéns), observações, quem pode buscar o pet, valores devidos e créditos.</li>
          <li><b>Pets:</b> nome, espécie, raça, porte, sexo, nascimento, alertas, observações, ficha de saúde (vacinas, vermífugo, antipulgas, remédios e vencimentos), fotos (perfil, antes e depois, boletim, fotos do dia da creche e do hotel), diário e ocorrências, e o checklist de entrada (temperamento, como o pet chegou, com fotos, e os pertences).</li>
          <li><b>Autorizações para postar fotos:</b> as que o tutor deu pelo boletim (parte 7), com o texto aceito, o dia e a hora, e quando foram tiradas.</li>
          <li><b>Atendimento e dinheiro:</b> agenda (com a hora de cada etapa do atendimento e das viagens de leva e traz, e quem da equipe marcou), estadias, pacotes, caixa, entradas e saídas, comissões, estoque e fornecedores.</li>
        </ul>
        <p>
          O conteúdo desses campos é escolha do pet shop. O sistema não pede CPF nem dados de cartão dos tutores. Os Termos pedem que o pet shop não use
          os campos livres para dados sensíveis de pessoas, como saúde do tutor, e que evite pessoas nas fotos.
        </p>

        <h3>Do tutor, nas páginas públicas</h3>
        <ul>
          <li><b>Pedido pelo link de agendamento:</b> nome, WhatsApp, nome, espécie e porte de cada pet, recado opcional, serviço, dia e hora, e o aceite das regras do pet shop, quando ele pede.</li>
          <li><b>Autorização para postar fotos:</b> se o tutor tocar em &quot;Quero autorizar&quot;, abaixo da pergunta &quot;Pode postar a foto?&quot; no boletim, guardamos a escolha (só as fotos daquele boletim ou também as das próximas visitas), o perfil para marcar, se ele informar, o texto exato que aceitou, o dia e a hora e, se ele tirar, quando tirou.</li>
          <li><b>Dúvidas pelo link:</b> o texto da pergunta vai à inteligência artificial para ser respondido, mas <b>não fica guardado</b>; guardamos só a contagem. O link pede para o tutor não escrever dados pessoais ali.</li>
          <li><b>Proteção contra abuso:</b> para limitar pedidos e acessos repetidos, guardamos por 2 dias os 8 últimos números do WhatsApp informado e um código feito a partir do endereço de rede (IP) de quem acessa, só para contar e frear excessos.</li>
        </ul>
      </>)}

      {p("para-que", "Usamos os dados para prestar o serviço, cobrar, dar suporte, manter a segurança, melhorar o sistema e cumprir a lei. Não vendemos dados.", <>
        <dl className="g-leg-pares">
          <div><dt>Criar e manter a conta</dt><dd>Login, troca de senha, teste, equipe e liberação do acesso. Base: execução do contrato (art. 7º, V).</dd></div>
          <div><dt>Cobrança</dt><dd>Reconhecer o pagamento, liberar ou bloquear a conta, reembolsar e guardar os comprovantes. Base: execução do contrato e cumprimento de obrigação legal (art. 7º, II e V).</dd></div>
          <div><dt>Prova do aceite</dt><dd>Guardar quem aceitou cada versão dos documentos. Base: exercício regular de direitos e legítimo interesse (art. 7º, VI e IX).</dd></div>
          <div><dt>Suporte e avisos</dt><dd>Responder dúvidas, ajudar quando você pede e avisar sobre o serviço, a cobrança e mudanças nos documentos. Base: execução do contrato e legítimo interesse.</dd></div>
          <div><dt>Segurança e melhoria</dt><dd>Evitar abuso (limites do assistente, das leituras e das páginas públicas), investigar erros e entender, em números gerais, como o sistema é usado. Das conversas com o assistente, a nossa equipe vê só números (quantas foram, se resolveram, erros, tamanho); o texto de uma conversa só é aberto para dar suporte, uma de cada vez, com o motivo escrito e registrado (parte 9). Não usamos essas conversas para propaganda nem para treinar inteligência artificial. Base: legítimo interesse (art. 7º, IX).</dd></div>
          <div><dt>Dados lançados pelo pet shop</dt><dd>Guardar, mostrar e processar para o sistema funcionar, a mando do pet shop. A base legal é definida pelo pet shop, que é o controlador.</dd></div>
          <div><dt>Registros de acesso e ordens de autoridades</dt><dd>Guardar os registros de acesso por 6 meses, o prazo do Marco Civil da Internet, e atender ordens de autoridades. Base: legítimo interesse, exercício regular de direitos e, quando a lei exigir, obrigação legal.</dd></div>
        </dl>
        <p>
          Não vendemos dados. Não usamos os dados de tutores e pets em propaganda, nem para montar listas para terceiros, nem para treinar modelos de inteligência artificial.
        </p>
      </>)}

      {p("fornecedores", "Contamos com fornecedores para banco de dados, hospedagem, pagamentos, inteligência artificial e e-mail. Cada um recebe só o necessário.", <>
        <dl className="g-leg-pares">
          <div><dt>Supabase</dt><dd>Banco de dados, login e guarda das fotos. O banco fica na região de São Paulo, Brasil; a empresa é dos Estados Unidos. O mesmo projeto do Supabase também atende outro produto do mesmo responsável (Escala CEO). Cada produto tem as suas tabelas e regras de acesso, e os dados de um não são usados no outro. Quem usa só o Escala CEO não enxerga nada do Gestão: as regras do próprio banco só deixam cada login ver o pet shop em que está na equipe. Se você usar o mesmo e-mail nos dois, o login pode ser o mesmo.</dd></div>
          <div><dt>Vercel</dt><dd>Hospedagem do aplicativo e das páginas públicas. Os pedidos passam pelos servidores dela, que podem ficar fora do Brasil.</dd></div>
          <div><dt>Anthropic</dt><dd>Fornece o modelo de inteligência artificial do Mozart, da Ajuda, da leitura do caderno, dos textos do boletim, das dúvidas do link e da Nina, o chat da página de apresentação (parte 8). Empresa dos Estados Unidos, com servidores fora do Brasil.</dd></div>
          <div><dt>Cakto</dt><dd>Pagamento da assinatura. Os dados de pagamento são digitados no ambiente dela e seguem a política dela. Ela nos avisa de cada pagamento com o e-mail da compra, o plano e o valor.</dd></div>
          <div><dt>Meta</dt><dd>Só na página de apresentação do Gestão, e só depois de você tocar em &quot;Aceitar&quot; no aviso de cookies: o Pixel da Meta mede as visitas vindas de anúncios (parte 10). No aplicativo, no cadastro e nas páginas dos pet shops ele não existe, e nenhum dado de tutor, pet ou financeiro vai à Meta.</dd></div>
          <div><dt>Envio de e-mail</dt><dd>E-mails de troca de senha e avisos de login, enviados pelo serviço de login do Supabase.</dd></div>
        </dl>
        <p>
          Também passam por serviços de terceiros, mas por escolha e no aparelho de quem usa: o <b>WhatsApp</b>, quando o pet shop abre uma mensagem pronta
          (nós não enviamos nada ao WhatsApp), o <b>reconhecimento de voz do navegador</b>, quando alguém usa o microfone (parte 8), o <b>Google Maps</b>, quando alguém da equipe abre o endereço do leva e traz (o endereço vai ao Google), e o <b>Google</b>, se o pet shop puser nas páginas o link para ser avaliado.
        </p>
        <p>Esta lista vale desde {dataBr(DOCUMENTOS.privacidade.vigenteDesde)}. Se incluirmos um fornecedor novo que receba dados dos clientes do pet shop, avisamos com pelo menos 15 dias de antecedência (Termos, parte 10) e atualizamos esta parte.</p>
        <p>Podemos entregar dados a autoridades só quando a lei ou uma ordem judicial exigir. Se o negócio for vendido ou reorganizado, os dados seguem com ele, sob esta política. Quando o Maestro Pet passar a ser oferecido por uma empresa (CNPJ), ela assume o nosso lugar nesta política, com os mesmos compromissos, e avisamos antes.</p>
      </>)}

      {p("exterior", "Hospedagem e inteligência artificial ficam fora do Brasil, principalmente nos Estados Unidos. O banco de dados fica em São Paulo. A transferência segue o artigo 33 da LGPD, com contratos que obrigam cada fornecedor a proteger os dados.", <>
        <p>Parte do tratamento acontece fora do Brasil, principalmente nos Estados Unidos:</p>
        <ul>
          <li><b>Hospedagem (Vercel):</b> os pedidos de quem usa o aplicativo e as páginas públicas passam pelos servidores dela.</li>
          <li><b>Inteligência artificial (Anthropic):</b> recebe o texto dos pedidos e os dados necessários para responder (parte 8).</li>
          <li><b>Banco de dados (Supabase):</b> o banco, o login e as fotos ficam na região de São Paulo; a empresa é dos Estados Unidos e a equipe técnica dela pode precisar acessar o serviço para dar suporte.</li>
        </ul>
        <p>
          Essa transferência é necessária para prestar o serviço que você contratou e é feita com base no artigo 33 da LGPD: usamos os contratos de tratamento de dados
          que cada um desses fornecedores mantém com os seus clientes, com cláusulas que os obrigam a proteger os dados e a usá-los só para prestar o serviço.
          Se quiser saber quais são essas cláusulas, peça por <EmailPrivacidade />. Nos dados dos tutores, quem decide é o pet shop (controlador): ao aceitar os Termos,
          ele autoriza o uso desses fornecedores. Quem não quiser mandar dados à inteligência artificial pode usar o sistema inteiro sem ela.
        </p>
      </>)}

      {p("publico", `As páginas que o pet shop manda aos tutores abrem para quem tiver o link. O boletim e o álbum abrem por ${DIAS_DO_BOLETIM} dias. Nada aparece em buscadores.`, <>
        <ul>
          <li><b>Link de agendamento:</b> mostra dados do pet shop (nome, cidade, telefone, horário, serviços, horários livres e, se ele quiser, preços). Não mostra a agenda nem dados de outros clientes. O pedido do tutor vai só para o pet shop escolhido.</li>
          <li><b>Página do tutor:</b> link particular de cada tutor, sem senha, com os pets dele, o diário, as fotos do dia e o que está marcado. As fotos do dia passam pelo nosso servidor, que confere o link antes de entregar, e são apagadas no prazo que o pet shop escolhe (30, 60, 90 ou 180 dias; o normal é 90).</li>
          <li><b>Boletim e álbum:</b> página de cada visita ou do álbum do pet, com fotos, recados e, se o pet shop ligar, valores. O link abre por {DIAS_DO_BOLETIM} dias e depois para de abrir. As fotos continuam no álbum do pet, dentro do sistema, enquanto o pet estiver cadastrado ou até o pet shop apagá-las. A página não mostra telefone nem dados do tutor.</li>
          <li><b>Checklist de entrada:</b> quando o pet chega, o pet shop pode pedir que o tutor confira e aceite como o pet chegou, assinando no aparelho do pet shop ou por um link mandado no WhatsApp. Guardamos o nome digitado, a imagem da assinatura, a hora, o endereço de internet (IP) e o navegador (na assinatura no aparelho do pet shop, os do aparelho da loja) e um código de conferência do texto e das fotos aceitos. O link abre por 7 dias, mostra só o pet, o que foi anotado e as fotos, e não mostra telefone nem dados do tutor.</li>
          <li>Essas páginas pedem aos buscadores para não serem indexadas. Quem tiver o link consegue abrir; por isso o pet shop deve mandá-lo só ao tutor e pode trocar ou desligar o link da página do tutor.</li>
          <li><b>Orçamento:</b> página de cada orçamento, com o nome do pet shop, os itens, o total, a validade e o primeiro nome para quem foi feito. Abre para quem tiver o link, não aparece em buscadores, e &quot;Quero fechar&quot; abre o WhatsApp do pet shop.</li>
          <li><b>Acompanhar o pedido:</b> depois de pedir pelo link, o tutor acompanha o pedido por uma página própria. O navegador dele guarda só a lista dos pedidos feitos naquele aparelho; dá para tirar da lista.</li>
          <li><b>Autorização para postar fotos:</b> a página do boletim pode trazer a pergunta &quot;Pode postar a foto?&quot;, com o botão &quot;Quero autorizar&quot;. Nada vem marcado: o tutor escolhe se autoriza só as fotos daquele boletim ou também as das próximas visitas e, se quiser, o perfil dele para a loja marcar. O sistema monta o texto, guarda o que foi aceito, com a hora, o endereço de internet e o navegador, e mostra ao pet shop na ficha e no álbum do pet. A autorização só é dada pela página do boletim, não pelas telas do sistema; quem abre o link é tratado como o tutor, por isso o pet shop deve mandá-lo só a ele.</li>
          <li><b>Tirar a autorização:</b> o tutor recebe junto um link &quot;Não quero mais&quot;, que funciona para sempre (mesmo depois que o boletim para de abrir) e tira na hora todas as autorizações daquele pet. Para o pet shop, a ficha passa a mostrar &quot;Sem autorização&quot;.</li>
          <li><b>O sistema não posta nada</b> nas redes sociais. Quem escolhe e posta é o pet shop, que é o controlador desses dados e responde pela postagem e por respeitar quando o tutor tira a autorização.</li>
        </ul>
      </>)}

      {p("ia", "Pedidos ao Mozart, fotos do caderno e perguntas do link vão à Anthropic para serem processados. Os arquivos do caderno não ficam guardados. A voz vira texto no navegador.", <>
        <ul>
          <li><b>Mozart e Ajuda:</b> o texto do pedido e os dados do pet shop necessários para responder vão à Anthropic. Isso inclui nomes e telefones de tutores, nomes, alertas, observações e ficha de saúde dos pets, serviços, horários e valores, conforme o que a pessoa pode ver. Observação é texto livre: o que o pet shop escrever ali pode ir junto, e por isso as telas pedem para anotar só o que é do pet e do atendimento. Guardamos a conversa e a ação proposta; nada é gravado no sistema antes de a pessoa confirmar o cartão.</li>
          <li><b>Trazer do caderno e ler a carteirinha:</b> as fotos e os PDFs vão à Anthropic para serem lidos e <b>não ficam guardados no sistema</b>. PDF grande passa por uma pasta temporária e é apagado logo depois de lido; se sobrar, sai na limpeza do dia seguinte. Fica só o que a pessoa confere e salva, e a contagem de leituras.</li>
          <li><b>Textos do boletim:</b> vão à Anthropic o nome e os dados do pet e da visita necessários para o texto, sem os dados do tutor.</li>
          <li><b>Dúvidas pelo link:</b> a pergunta do tutor e o que o link do pet shop já mostra vão à Anthropic. A pergunta não fica guardada.</li>
          <li><b>Nina, o chat da página de apresentação:</b> o que o visitante escreve vai à Anthropic para ser respondido. O texto não fica guardado; guardamos só a contagem de mensagens por visitante, com um código feito do endereço de internet (IP), para evitar abuso. O chat avisa disso e pede para não escrever dados pessoais. Vale a <Link href="/politica-de-privacidade">política do site</Link>.</li>
          <li>Segundo os termos comerciais do fornecedor em vigor nesta data, os dados enviados pela API não são usados para treinar os modelos dele, e ele pode guardá-los por um tempo limitado para segurança e prevenção de abuso. Essas regras são do fornecedor e podem mudar; se mudarem de forma relevante, atualizamos esta política.</li>
          <li><b>Voz:</b> ao usar o microfone, a fala é transformada em texto pelo reconhecimento de voz do próprio navegador (Chrome, Edge, Safari), que pode usar um serviço do fabricante do navegador, sob a política dele. Nós recebemos só o texto; não recebemos nem guardamos áudio.</li>
          <li>Quem não quiser enviar dados à inteligência artificial pode usar o sistema inteiro pelas telas, sem ela.</li>
        </ul>
      </>)}

      {p("erros", "Quando uma tela quebra, guardamos por 30 dias só o necessário para consertar, sem nomes, telefones, e-mails nem valores. A nossa equipe vê números; ler uma conversa exige motivo e fica registrado.", <>
        <ul>
          <li>Quando uma tela ou uma rota do servidor dá erro, o sistema registra a mensagem técnica, a tela, o papel de quem usava, o tamanho da tela, o navegador e a versão do sistema.</li>
          <li>Antes de guardar, o sistema tira e-mails, telefones, valores, códigos e endereços completos da mensagem. Os registros de erro são apagados depois de 30 dias.</li>
          <li>Também registramos quando cada pessoa usa o sistema e quanto, para entender o uso e ajudar quem está com dificuldade.</li>
          <li><b>O que a nossa equipe vê:</b> o painel da nossa equipe mostra os dados da conta e quantidades. Ele não lista os clientes, os pets nem o dinheiro do pet shop. Das conversas com o Mozart e a Ajuda, mostra só números: quantas foram, de qual pet shop, se a pessoa marcou que resolveu, o tamanho do texto, quantas ferramentas o Mozart usou, erros e consumo.</li>
          <li><b>A exceção, para dar suporte:</b> uma pessoa da nossa equipe pode abrir o texto de uma conversa, uma de cada vez, e só depois de escrever o motivo. Essa conversa pode citar nomes de tutores, telefones e valores. Cada abertura fica registrada (quem abriu, quando e por quê) e o dono do pet shop vê a lista em Meu pet shop, em &quot;Acessos da equipe Maestro Pet&quot;.</li>
        </ul>
      </>)}

      {p("aparelho", "Sem pixel de anúncio e sem cookie de medição no aplicativo. O navegador guarda só o login e algumas preferências.", <>
        <ul>
          <li>O aplicativo, as telas de cadastro e de entrada e as páginas públicas dos pet shops <b>não usam pixel de anúncio nem cookies de medição</b>, e nelas não aparece o aviso de cookies.</li>
          <li>Quem chega ao cadastro pela página de apresentação continua na mesma aba. Assim que o cadastro abre, o pixel daquela página para de mandar qualquer coisa. O cookie de medição que a página de apresentação já tenha deixado no navegador (o &quot;_fbp&quot;, da Meta) fica guardado nele até vencer ou ser apagado, mas o Gestão não o lê nem o usa.</li>
          <li>Para manter você conectado, o navegador guarda no próprio aparelho a sessão de login. Também guarda preferências e rascunhos, como o pet shop aberto por último, os ajustes da voz e um formulário ainda não salvo. Isso serve só para o sistema funcionar e fica no seu aparelho. Ao sair da conta, a sessão é apagada.</li>
          <li>A página de apresentação do Gestão faz parte do site maestropet.com e usa o Pixel da Meta, como explica a <Link href="/politica-de-privacidade">política do site</Link>. Lá, o aviso de cookies tem &quot;Aceitar&quot; e &quot;Recusar&quot;: o pixel só carrega depois do &quot;Aceitar&quot;; antes da escolha, ou recusando, ele não manda nada daquele navegador. Dá para mudar a escolha na política do site, parte 5.</li>
        </ul>
      </>)}

      {p("guarda", "Guardamos enquanto a conta existir, com prazos menores para fotos de links, erros e arquivos de leitura. Alguns registros ficam pelo prazo da lei.", <>
        <dl className="g-leg-pares">
          <div><dt>Conta e dados do pet shop</dt><dd>Enquanto a conta existir, inclusive só para consulta. Conta só para consulta por mais de 180 dias pode ser apagada, com aviso de 30 dias (Termos, parte 8).</dd></div>
          <div><dt>Cliente excluído de vez</dt><dd>Em &quot;Excluir de vez&quot;, a ficha, os pets e o histórico saem na hora, junto com o nome e o telefone na lista de espera e nos orçamentos, os pedidos pelo link e as conversas com o assistente que citam o cliente. Os valores ficam no financeiro, sem o nome. Os arquivos das fotos (perfil, antes e depois, diário, boletim e checklist) são apagados na faxina automática, em até 1 dia.</dd></div>
          <div><dt>Foto trocada, tirada ou de formulário não salvo</dt><dd>A foto antiga é apagada na faxina automática, em até 1 dia. A foto escolhida num formulário que não foi salvo, em até 2 dias.</dd></div>
          <div><dt>Dados de tutor apagados a pedido</dt><dd>Em &quot;Apagar dados deste tutor&quot;, nome, telefone, e-mail, endereço, observações, pets, saúde, boletins e autorizações saem na hora, assim como o endereço do leva e traz e os cuidados anotados nos horários e nas estadias, o nome e o telefone na lista de espera e nos orçamentos, os pedidos pelo link e as conversas com o assistente que citam o tutor; as fotos, na faxina diária. Os valores ficam no financeiro, sem o nome, para a contabilidade do pet shop.</dd></div>
          <div><dt>Autorizações para postar fotos</dt><dd>Enquanto o pet estiver cadastrado, inclusive as que o tutor tirou (com a data em que tirou), para mostrar quando valeram.</dd></div>
          <div><dt>Conta apagada a pedido</dt><dd>Em &quot;Encerrar e apagar a conta&quot;, 30 dias só para consulta (dá para cancelar); depois apagamos o pet shop, os dados, os arquivos e os logins da equipe que não estão em outro pet shop. Um login que também é usado em outro produto do mesmo responsável (Escala CEO) não é apagado junto: a nossa equipe confere e fala com a pessoa. Fica só o registro de que a conta foi apagada (nome do pet shop, quem pediu e quando).</dd></div>
          <div><dt>Login de quem saiu da equipe</dt><dd>Fica até a pessoa apagar. Quem não está em nenhum pet shop apaga o próprio login em &quot;Apagar o meu login&quot;; ele sai em até 1 dia.</dd></div>
          <div><dt>Registro de pedidos de dados e de acessos da nossa equipe</dt><dd>Enquanto a conta existir e, o de pedidos de dados, depois de apagada, pelo prazo em que puder ser necessário para provar que o pedido foi atendido.</dd></div>
          <div><dt>Fotos do álbum e do boletim</dt><dd>Enquanto o pet estiver cadastrado ou até o pet shop apagá-las. O link aberto ao tutor vale {DIAS_DO_BOLETIM} dias.</dd></div>
          <div><dt>Checklist de entrada</dt><dd>Fica junto com o atendimento ou a estadia e é apagado com ele, com o pet ou com a conta. O link para o tutor aceitar vale 7 dias.</dd></div>
          <div><dt>Fotos da página do tutor</dt><dd>30, 60, 90 ou 180 dias, como o pet shop escolher (o normal é 90).</dd></div>
          <div><dt>Fotos e PDFs do caderno</dt><dd>Não ficam guardados: são lidos e descartados. PDF grande passa por uma pasta temporária e sai, no máximo, na limpeza do dia seguinte.</dd></div>
          <div><dt>Perguntas do link e mensagens à Nina</dt><dd>Não ficam guardadas; só a contagem.</dd></div>
          <div><dt>Pedidos pelo link que não viraram horário</dt><dd>90 dias depois da data pedida (recusados ou sem resposta); depois são apagados.</dd></div>
          <div><dt>Proteção contra abuso das páginas públicas</dt><dd>Parte do telefone e um código feito do IP: 2 dias.</dd></div>
          <div><dt>Conversas com o assistente</dt><dd>12 meses; depois são apagadas.</dd></div>
          <div><dt>Registros de erro</dt><dd>30 dias.</dd></div>
          <div><dt>Registros de acesso</dt><dd>6 meses, em ambiente seguro, o prazo do Marco Civil da Internet; depois são apagados. Só entregamos por ordem judicial. O serviço de login (Supabase) também guarda um registro técnico de entradas com o e-mail, pelo prazo dele.</dd></div>
          <div><dt>Pagamentos e aceites</dt><dd>Pelo prazo que a lei exigir e enquanto puderem ser necessários para defesa em processo, mesmo depois de a conta ser apagada.</dd></div>
          <div><dt>Cópias de segurança</dt><dd>As automáticas do fornecedor do banco (Supabase), pelo tempo do plano contratado com ele, e a cópia completa que a nossa equipe baixa de tempos em tempos (sem as fotos e sem senhas). Essa cópia completa tem os dados de todos os pet shops; fica fora do fornecedor, em local protegido por senha a que só o responsável tem acesso, e guardamos no máximo as 4 mais recentes (cerca de 1 mês), apagando as mais antigas. Servem só para recuperar o sistema; não há garantia de que exista uma cópia para o dia de que você precisa (Termos, parte 16).</dd></div>
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
          <li>Na nossa equipe, o acesso aos dados dos pet shops é restrito a quem cuida da operação e só acontece para suporte pedido por você, manutenção, segurança ou obrigação legal. A leitura de uma conversa com o assistente fica registrada e aparece para o dono (parte 9).</li>
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
          <li><b>Assinante ou pessoa da equipe:</b> boa parte se resolve na própria tela: corrigir, baixar todos os dados, apagar clientes, apagar a conta (Meu pet shop, Encerrar e apagar a conta), baixar os seus próprios dados (&quot;Baixar os meus dados&quot;, no menu Mais: login, aceites, acessos e as suas conversas com o assistente), sair de uma equipe (&quot;Sair desta equipe&quot;) e, depois de sair, apagar o próprio login (&quot;Apagar o meu login&quot;). Para o resto, escreva para <EmailPrivacidade /> com o assunto &quot;Privacidade&quot;. Podemos pedir uma confirmação de que o pedido é seu. Respondemos em até 15 dias.</li>
          <li><b>Tutor:</b> fale com o pet shop onde o seu pet é atendido: ele é o controlador e, pela ficha do tutor, consegue baixar os seus dados em planilhas, corrigi-los e apagá-los. Para tirar a autorização de postar fotos, use o link &quot;Não quero mais&quot; do boletim. Se preferir escrever para nós, diga qual é o pet shop: encaminhamos o pedido a ele e ajudamos a atender. A página <Link href="/gestao/para-o-tutor">Para o tutor</Link> explica isso em poucas linhas.</li>
        </ul>
      </>)}

      {p("incidentes", "Se acontecer um incidente de segurança que possa ter atingido dados do seu pet shop, avisamos em até 48 horas depois de sabermos e, nos dados da conta, também a ANPD.", <>
        <p>
          Se acontecer um incidente de segurança que possa trazer risco ou dano relevante: nos dados da conta, em que somos controladores, avisamos os assinantes
          afetados e a ANPD no prazo e na forma que a ANPD determina. Nos dados que o pet shop lança, avisamos o pet shop, que é o controlador, sem demora, em até
          48 horas depois de tomarmos conhecimento de um incidente que possa ter atingido dados dele, mesmo que a investigação não tenha terminado: dizemos o que já
          sabemos (o que aconteceu, quais dados podem ter sido atingidos, o que fizemos e o que ele pode fazer) e depois completamos as informações. A comunicação à
          ANPD e aos tutores é do pet shop, e nós ajudamos.
        </p>
      </>)}

      {p("menores", "O Gestão é para adultos. O pet shop não deve lançar dados de crianças.", <>
        <p>O Gestão é uma ferramenta de trabalho para maiores de 18 anos, inclusive para quem entra na equipe por convite: se a pessoa for menor, o pet shop a cadastra na equipe sem login. Os pedidos pelo link de agendamento são para maiores de 18 anos. Não coletamos de propósito dados de crianças e adolescentes, e os Termos pedem que o pet shop não os lance.</p>
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
          escreva para <EmailPrivacidade />. Para outras dúvidas, também atendemos {EMPRESA.emailJuridico && EMPRESA.emailJuridico !== EMPRESA.email ? <>por <Email /> e </> : null}pelo <Zap />.
        </p>
        <p>Veja também os <Link href="/gestao/termos">Termos de uso</Link>.</p>
      </>)}
    </Legal>
  );
}
