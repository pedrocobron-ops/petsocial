import type { Metadata } from "next";
import Link from "next/link";
import { quemOferece } from "@/lib/gestao/vendedor-documentos";
import Legal, { Email, EmailJuridico, Foro, Indice, Parte, QuemResponde, Zap } from "@/components/gestao/legal";
import { EMPRESA } from "@/lib/empresa";
import { DIAS_DO_BOLETIM } from "@/lib/gestao/boletim";
import { PERIODOS, PLANOS, ofertaDe, textoAcessos } from "@/lib/gestao/planos";
import { brlCurto } from "@/lib/gestao/util";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "As regras de uso do Maestro Pet Gestão: quem pode usar, teste grátis, planos, cobrança, cancelamento, inteligência artificial, dados dos clientes e responsabilidades.",
  alternates: { canonical: "/gestao/termos" },
};

/** Dias depois de a conta ficar só para consulta por falta de pagamento em que os dados podem ser apagados (sempre com aviso antes). */
const DIAS_ATE_APAGAR = 180;
const DIAS_DE_AVISO = 30;
/** "Encerrar e apagar a conta": dias só para consulta antes de apagar (o mesmo do banco, conta_exclusao_pedir). */
const DIAS_ATE_APAGAR_A_PEDIDO = 30;

const PARTES: [string, string][] = [
  ["quem-somos", "Quem somos e o que é este documento"],
  ["quem-pode", "Quem pode usar"],
  ["servico", "O que o sistema faz e o que não faz"],
  ["conta", "Conta, senha e equipe"],
  ["teste", "Teste grátis de 7 dias"],
  ["planos", "Planos, preços e cobrança"],
  ["cancelar", "Cancelamento e reembolso"],
  ["sem-pagamento", "Quando o pagamento não acontece"],
  ["uso", "O que pode e o que não pode"],
  ["dados", "Os dados dos seus clientes"],
  ["fotos", "Fotos, boletim e redes sociais"],
  ["publico", "Páginas públicas: link, página do tutor e boletim"],
  ["ia", "Inteligência artificial"],
  ["whatsapp", "WhatsApp e mensagens"],
  ["numeros", "Caixa, relatórios e impostos"],
  ["disponivel", "Funcionamento, manutenção e cópias"],
  ["responsabilidade", "Até onde vai a nossa responsabilidade"],
  ["reclamacoes", "Reclamações de terceiros"],
  ["marca", "Marca, sistema e licença de uso"],
  ["sugestoes", "Sugestões"],
  ["suspensao", "Suspensão e encerramento"],
  ["fim", "O que acontece com os dados quando a conta acaba"],
  ["mudancas", "Mudanças nestes termos"],
  ["avisos", "Como falamos com você"],
  ["lei", "Lei e foro"],
  ["geral", "Regras gerais"],
];

export default async function TermosDoGestao() {
  const v = await quemOferece();
  let n = 0;
  const p = (id: string, resumo: string, children: React.ReactNode) => {
    n += 1;
    const titulo = PARTES.find(([i]) => i === id)?.[1] ?? id;
    return <Parte id={id} n={n} titulo={titulo} resumo={resumo}>{children}</Parte>;
  };

  return (
    <Legal pagina="termos" titulo="Termos de uso"
      resumo="Estas são as regras para usar o Maestro Pet Gestão, o sistema de gestão para pet shop, banho e tosa, creche e hotel. Ao criar a conta, você declara que leu e concorda com elas. Cada parte começa com um resumo; o texto completo logo abaixo é o que vale.">

      <div className="g-leg-quadro">
        <b>O principal, em poucas linhas:</b> o Gestão é uma ferramenta de trabalho para o seu negócio. Você testa 7 dias sem cartão e, se gostar,
        assina e cancela quando quiser. Os dados que você lança são do seu pet shop, e cabe a você cuidar deles perante os seus clientes.
        A inteligência artificial ajuda, mas pode errar: confira antes de usar. O sistema não emite nota fiscal e não substitui contador,
        veterinário nem advogado. A nossa responsabilidade tem limites, explicados na parte 17.
      </div>

      <Indice partes={PARTES} />

      {p("quem-somos", v.pessoaFisica ? `O Gestão é oferecido por ${v.nome}, pessoa física responsável pela marca ${EMPRESA.marca}. Ao criar a conta, você faz um contrato com ele.` : `O Gestão é oferecido pela empresa responsável pela marca ${EMPRESA.marca}. Ao criar a conta, você faz um contrato com ela.`, <>
        <p>
          O Maestro Pet Gestão (o &quot;Gestão&quot; ou o &quot;sistema&quot;) é oferecido por <QuemResponde v={v} />, {v.pessoaFisica ? "responsável" : "dona"} pela marca {EMPRESA.marca}.
          Neste texto, &quot;nós&quot; é quem oferece o Gestão: hoje, {v.pessoaFisica ? "a pessoa física indicada acima" : "a empresa indicada acima"}; depois, a empresa que assumir o serviço (parte 26). &quot;Você&quot; ou &quot;assinante&quot; é a pessoa ou a empresa que cria a conta do pet shop.
          &quot;Equipe&quot; são as pessoas que você convida para entrar na conta. &quot;Clientes&quot; ou &quot;tutores&quot; são os clientes do seu pet shop.
        </p>
        <p>
          Estes Termos de uso e a <Link href="/gestao/privacidade">Política de privacidade</Link> formam o contrato entre você e nós.
          Se algo combinado por escrito com você for diferente, vale o combinado.
        </p>
        <p>
          {v.pessoaFisica ? <>Hoje quem responde pelo Gestão é uma pessoa física, e não uma empresa. Isso não muda os seus direitos: os dados continuam do seu pet shop (parte 10), você baixa tudo quando quiser (parte 22) e, se um dia o serviço deixar de ser oferecido, avisamos com pelo menos 60 dias de antecedência e devolvemos o que foi pago e não usado (parte 21). Quando abrirmos a empresa, ela assume este contrato com as mesmas condições (parte 26). </> : null}
          Contato: <Email /> ou <Zap />.{EMPRESA.emailJuridico && EMPRESA.emailJuridico !== EMPRESA.email ? <> Assuntos jurídicos e de privacidade: <EmailJuridico />.</> : " O mesmo e-mail atende assuntos jurídicos e de privacidade."}
        </p>
      </>)}

      {p("quem-pode", "É um serviço para empresas e profissionais do ramo pet, usado no trabalho. Precisa ter 18 anos ou mais.", <>
        <ul>
          <li>O Gestão é feito para <b>uso profissional</b>: pet shops, banho e tosa, creches, hotéis e profissionais autônomos do ramo. Não é um produto para uso pessoal ou doméstico.</li>
          <li>Quem cria a conta precisa ter <b>18 anos ou mais</b> e poder fazer contratos. Se cria a conta em nome de uma empresa, declara que tem autorização para isso; a empresa fica obrigada por estes termos.</li>
          <li>Como o serviço é contratado para a atividade do seu negócio, a relação entre nós é, em regra, uma relação entre empresas, regida pelo Código Civil. Se em algum caso a lei considerar você consumidor, os direitos que o Código de Defesa do Consumidor garante continuam valendo, e nada nestes termos os reduz.</li>
        </ul>
      </>)}

      {p("servico", "É uma ferramenta de organização pelo navegador. Não emite nota fiscal, não recebe dinheiro dos seus clientes e não dá orientação profissional.", <>
        <p>
          O Gestão funciona pelo navegador, no celular e no computador, e precisa de internet. Com ele o pet shop organiza agenda, clientes e pets
          (com ficha de saúde e fotos), creche e hotel, pacotes, caixa, financeiro, relatórios, estoque e equipe, e conta com o assistente Mozart.
        </p>
        <p>O sistema <b>não</b>:</p>
        <ul>
          <li>emite nota fiscal (NF-e, NFC-e ou NFS-e) nem cupom fiscal: o comprovante que ele prepara não vale como documento fiscal;</li>
          <li>recebe, guarda ou repassa dinheiro dos seus clientes: o que aparece no caixa é o que a sua equipe anotou;</li>
          <li>envia WhatsApp, SMS ou e-mail aos seus clientes sozinho;</li>
          <li>substitui contador, veterinário, advogado ou consultor. Nenhuma tela, texto ou resposta do sistema é orientação veterinária, contábil, fiscal, trabalhista ou jurídica.</li>
        </ul>
        <p>As funções podem mudar com o tempo (parte 16). O que vale é o que o sistema oferece no momento do uso.</p>
      </>)}

      {p("conta", "Cada pessoa entra com o próprio login. Você cuida das senhas, decide o que cada pessoa da equipe pode abrir e responde pelo que fazem na conta.", <>
        <ul>
          <li>Para criar a conta você informa nome, e-mail e senha. Digite com cuidado um e-mail que é seu e que você usa: hoje o sistema não manda link para confirmar o e-mail no cadastro. É por esse e-mail que você troca a senha, recebe os avisos da conta e da cobrança e é reconhecido no pagamento. Se ele estiver errado, os avisos podem não chegar ou chegar a outra pessoa. Podemos pedir a confirmação do e-mail a qualquer momento e limitar a conta até ela ser feita.</li>
          <li>Quem cria o pet shop é o <b>dono</b> da conta no sistema. O dono convida a equipe por um link com código, que vale só para o e-mail convidado, escolhe as áreas que cada pessoa abre (agenda, caixa, financeiro, estoque e outras) e muda os ajustes. O número de logins depende do plano.</li>
          <li>Cada pessoa entra com o <b>próprio e-mail e senha</b>. Não divida o mesmo login entre pessoas e não passe a senha a ninguém.</li>
          <li>O que for feito com um login da sua conta é considerado feito pelo seu pet shop. Você responde pelos atos das pessoas que convidou, como responde pelos atos da sua equipe no balcão.</li>
          <li>Quando alguém sair da equipe, tire o acesso dessa pessoa em Equipe no mesmo dia.</li>
          <li>Desconfiou de acesso indevido? Troque a senha e nos avise na hora pelo contato. Não temos como saber de um acesso feito com a senha certa.</li>
          <li>Se o dono não puder mais cuidar da conta (por exemplo, venda do negócio), podemos pedir documentos antes de passar a conta para outra pessoa.</li>
        </ul>
      </>)}

      {p("teste", "Toda conta nova tem 7 dias grátis, sem cartão e sem cobrança automática no fim. Depois, sem assinatura, a conta fica só para consulta.", <>
        <p>
          Toda conta nova começa com <b>7 dias de teste grátis</b>. Não pedimos cartão para testar e nada é cobrado quando o teste termina.
          Durante o teste, a conta funciona como o plano maior, para a equipe inteira experimentar.
        </p>
        <p>
          Terminado o teste sem assinatura, a conta fica <b>só para consulta</b>: dá para ver e baixar o que foi lançado, mas não para marcar, lançar ou alterar,
          e o link de agendamento para de receber pedidos. Para voltar a usar, é só assinar. Podemos mudar ou encerrar a oferta de teste para contas novas a qualquer momento.
        </p>
      </>)}

      {p("planos", "Os planos têm as mesmas funções; muda quantas pessoas entram. A cobrança é recorrente, pela Cakto. Preço novo só com aviso antes.", <>
        <p>Todos os planos têm as mesmas funções. O que muda é quantas pessoas podem entrar com login. Preços na data desta versão:</p>
        <ul>
          {PLANOS.map((pl) => (
            <li key={pl.id}><b>{pl.nome}:</b> {textoAcessos(pl.acessos)}. {PERIODOS.map((pe) => `${brlCurto(ofertaDe(pl.id, pe.id).preco)} ${pe.cada}`).join(", ")}.</li>
          ))}
        </ul>
        <ul>
          <li>O preço que vale para você é o mostrado na tela Assinatura e no checkout no momento em que você assina. É o valor final, sem acréscimos. O comprovante do pagamento é enviado pela Cakto.</li>
          <li><b>Quem vende e nota fiscal:</b> quem vende a assinatura é quem oferece o Gestão (parte 1){v.pessoaFisica ? ", hoje uma pessoa física" : ""}. <b>Por enquanto a assinatura não tem nota fiscal</b>: você recebe o comprovante de pagamento da Cakto. Se precisar de nota fiscal para o seu negócio, fale com a gente antes de assinar.</li>
          <li>O pagamento é feito na <b>Cakto</b>, a plataforma de pagamentos que usamos. Os dados do cartão ou do Pix são digitados no ambiente dela, sob as regras dela. Nós não recebemos nem guardamos o número do seu cartão.</li>
          <li>A cobrança é <b>recorrente</b>: conforme o período escolhido, todo mês, a cada 3 ou a cada 6 meses, e a assinatura se renova sozinha pelo mesmo período até você cancelar.</li>
          <li>Use no checkout o mesmo e-mail da sua conta: é por ele que o sistema reconhece o pagamento e libera o acesso. Pagamento com outro e-mail pode demorar a ser reconhecido.</li>
          <li><b>Mudança de preço:</b> podemos reajustar os preços. Avisamos pelo aplicativo ou por e-mail com pelo menos 30 dias de antecedência. O valor novo só vale a partir da cobrança seguinte ao fim do aviso, e você pode cancelar antes dela sem custo.</li>
          <li>Promoções e cupons valem só nas condições e no prazo em que foram oferecidos.</li>
        </ul>
      </>)}

      {p("cancelar", "Sem fidelidade e sem multa. Pediu em até 7 dias do primeiro pagamento, devolvemos tudo. Depois disso, usa até o fim do período pago. Para mudar de plano, cancele e assine o novo; os meses que sobraram não viram crédito.", <>
        <ul>
          <li><b>Sem fidelidade e sem multa.</b> Você cancela quando quiser, pela página da Cakto (o botão fica na tela Assinatura) ou pedindo pelo nosso contato.</li>
          <li>O cancelamento encerra as renovações seguintes. Você continua usando até o fim do período que já pagou; depois a conta fica só para consulta.</li>
          <li><b>Arrependimento em 7 dias:</b> se pedir o cancelamento em até 7 dias depois do primeiro pagamento de uma assinatura, devolvemos o valor integral desse pagamento, mesmo nos planos de 3 e 6 meses.</li>
          <li>Fora desse prazo, não devolvemos o valor de períodos já começados, inclusive se você deixar de usar o sistema, salvo quando a lei mandar ou quando o serviço não puder ser usado por falha nossa.</li>
          <li>A devolução é feita pela Cakto, pelo mesmo meio de pagamento, nos prazos dela e da operadora do cartão. Se as regras da Cakto derem a você mais prazo ou mais direitos, valem as dela.</li>
          <li>
            <b>Mudar de plano ou de período</b> (por exemplo, do Equipe para o Pet shop, ou do mensal para o de 6 meses): hoje a troca não é automática.
            Cancele a assinatura atual pela página da Cakto e, depois, assine o plano novo pela tela Assinatura. Não deixe as duas assinaturas ativas ao mesmo tempo:
            as duas seriam cobradas, e o pagamento novo pode não ser reconhecido sozinho. Os dados do pet shop continuam os mesmos.
          </li>
          <li>
            O plano novo vale a partir do pagamento dele, pelo período escolhido, com o preço e o número de logins dele. O período que você já tinha pago
            não se perde: o acesso continua, no mínimo, até o fim dele. Mas os meses que sobraram de um plano de 3 ou 6 meses <b>não viram crédito nem desconto</b>{" "}
            no plano novo e não são devolvidos, salvo dentro dos 7 dias do arrependimento ou nos casos do item acima. Por isso, se puder esperar, troque perto do fim do período pago.
          </li>
        </ul>
      </>)}

      {p("sem-pagamento", `Pagamento que não passa: tentamos de novo por um tempo. Sem acerto, a conta fica só para consulta e, depois de ${DIAS_ATE_APAGAR} dias, pode ser apagada, sempre com aviso antes.`, <>
        <ul>
          <li>Se uma cobrança não passar, o acesso continua por um tempo enquanto a Cakto tenta de novo. Sem acerto, a assinatura é encerrada e a conta fica só para consulta.</li>
          <li>Com a conta só para consulta, os dados continuam guardados e você ainda consegue baixar as planilhas e todos os dados (Meu pet shop, Baixar todos os dados).</li>
          <li>Se a conta ficar só para consulta por mais de <b>{DIAS_ATE_APAGAR} dias</b> seguidos (depois do teste ou por falta de pagamento), podemos apagar a conta e os dados do pet shop. Antes, avisamos o dono por e-mail e na tela do aplicativo com pelo menos <b>{DIAS_DE_AVISO} dias</b> de antecedência, para dar tempo de assinar ou baixar os dados.</li>
          <li>Contestação de pagamento já feito (chargeback) sem motivo pode levar à suspensão da conta até o acerto.</li>
        </ul>
      </>)}

      {p("uso", "Use o sistema para o seu negócio e dentro da lei. Nada de spam, fraude, cópia do sistema, robôs ou abuso das funções e limites.", <>
        <p>Você e a sua equipe se comprometem a usar o Gestão só para a gestão do seu negócio, de boa-fé e dentro da lei. <b>Não é permitido:</b></p>
        <ul>
          <li>lançar, guardar ou divulgar conteúdo ilegal, ofensivo, discriminatório, que viole direitos de outras pessoas ou que exponha alguém sem autorização;</li>
          <li>usar o sistema ou os textos que ele prepara para mandar mensagens em massa, propaganda não pedida (spam) ou golpes;</li>
          <li>se passar por outra pessoa ou empresa, criar contas com dados falsos ou usar a conta de outro pet shop;</li>
          <li>criar conta ou aceitar convite com um e-mail que não é seu;</li>
          <li>copiar, revender, alugar ou sublicenciar o sistema, ou oferecer o acesso a terceiros fora da sua equipe;</li>
          <li>tentar descobrir o código, desmontar o sistema (engenharia reversa), contornar a segurança, ler dados de outro pet shop ou testar falhas sem a nossa autorização por escrito;</li>
          <li>usar robôs, raspadores (scraping) ou outros meios automáticos para tirar dados do sistema ou das páginas públicas, fora das exportações que o próprio sistema oferece;</li>
          <li>burlar o número de logins do plano, os limites de uso do assistente, das leituras de foto e do link, ou sobrecarregar o serviço de propósito;</li>
          <li>usar a inteligência artificial para produzir conteúdo enganoso, ilegal ou que fira as regras de uso do fornecedor dela.</li>
        </ul>
        <p>
          O cuidado com os animais é seu. Cumprir as normas sanitárias, de bem-estar animal, do conselho de medicina veterinária, de vigilância sanitária
          e da prefeitura que valem para o seu negócio, e as regras do seu próprio atendimento, é responsabilidade do pet shop. O sistema só ajuda a organizar.
        </p>
      </>)}

      {p("dados", "Pela LGPD, o seu pet shop é o controlador dos dados dos seus clientes e nós somos o operador. Cabe a você ter motivo legal para usar esses dados e informar os seus clientes.", <>
        <p>
          O que você e a sua equipe lançam (clientes, pets, agenda, financeiro, estoque, fotos) <b>pertence ao seu pet shop</b>.
          Pela Lei Geral de Proteção de Dados (LGPD), quanto aos dados dos seus clientes e da sua equipe, o seu pet shop é o <b>controlador</b>{" "}
          (decide o que lançar e para quê) e nós somos o <b>operador</b> (guardamos e processamos esses dados para o sistema funcionar, seguindo as suas instruções
          e a <Link href="/gestao/privacidade">Política de privacidade</Link>).
        </p>
        <p>Por isso, cabe ao seu pet shop:</p>
        <ul>
          <li>lançar só os dados necessários e ter uma base legal para tratá-los (por exemplo, a prestação do serviço ao tutor);</li>
          <li>informar os seus clientes de como usa os dados deles, inclusive que usa um sistema como o nosso;</li>
          <li>obter a autorização do tutor quando a lei pedir, como para fotos usadas em divulgação e mensagens que não sejam do atendimento. Para as fotos, o sistema oferece a autorização pelo boletim (parte 11);</li>
          <li>não usar os campos de observação para dados sensíveis de pessoas (saúde, religião, origem racial e outros). Se o tutor tiver menos de 18 anos, cadastre como tutor o pai, a mãe ou o responsável;</li>
          <li>atender os pedidos dos seus clientes sobre os dados deles (ver, corrigir, receber uma cópia, apagar). Na ficha do tutor, o dono tem &quot;Baixar os dados deste tutor&quot; e &quot;Apagar dados deste tutor&quot; (parte 22). Nós ajudamos no que estiver ao nosso alcance (Política de privacidade, parte 13);</li>
          <li>manter a sua equipe informada sobre o cuidado com esses dados.</li>
        </ul>
        <p>
          Nós usamos esses dados só para prestar o serviço, dar suporte, manter a segurança e cumprir a lei. Não vendemos os dados dos seus clientes,
          não os usamos em propaganda e não os passamos a terceiros fora dos fornecedores listados na Política de privacidade.
        </p>
        <p><b>O que nós, como operador, nos comprometemos a fazer:</b></p>
        <ul>
          <li>tratar os dados dos seus clientes e da sua equipe só para prestar o serviço. Estes termos e o que você faz no sistema (lançar, apagar, baixar, ligar ou desligar funções) são as suas instruções para nós;</li>
          <li>limitar o acesso da nossa equipe ao necessário para suporte que você pediu, manutenção, segurança ou obrigação legal, sempre com sigilo;</li>
          <li>usar só os fornecedores listados na Política de privacidade (parte 5), inclusive os que ficam fora do Brasil (parte 6). Ao aceitar estes termos, você autoriza esse uso. Se incluirmos um fornecedor novo que receba dados dos seus clientes, avisamos com pelo menos 15 dias de antecedência; se não concordar, você pode cancelar e receber de volta a parte não usada do período pago;</li>
          <li>avisar você sem demora, em até 48 horas depois de tomarmos conhecimento de um incidente de segurança que possa ter atingido dados do seu pet shop, mesmo que a investigação não tenha terminado, dizendo o que já sabemos; depois, completamos as informações, para você decidir sobre a comunicação à ANPD e aos tutores;</li>
          <li>ajudar você a atender os pedidos dos tutores e da ANPD;</li>
          <li>não usar os dados dos seus clientes para fins nossos (propaganda, venda, treino de inteligência artificial). Para melhorar o sistema, usamos números gerais, que não identificam tutor nem pet. Das conversas com o Mozart e a Ajuda, a nossa equipe vê só números; a única exceção é abrir uma conversa para dar suporte, uma de cada vez, com o motivo escrito. Cada abertura fica registrada e você vê a lista em Meu pet shop, em &quot;Acessos da equipe Maestro Pet&quot;. Essas conversas não são usadas em propaganda nem para treinar inteligência artificial;</li>
          <li>apagar os dados quando a conta acabar, como explica a parte 22, salvo o que a lei mandar guardar;</li>
          <li>dar, quando você pedir por escrito, as informações de que precisar para mostrar que cumpre a LGPD.</li>
        </ul>
      </>)}

      {p("fotos", "As fotos que você guarda e envia são responsabilidade sua. Foque no pet e evite pessoas. Para postar nas redes, use a autorização do tutor pelo boletim: ele escolhe, você vê na ficha e ele pode tirar quando quiser.", <>
        <ul>
          <li>Você só deve enviar ao sistema fotos que tem o direito de usar. <b>Fotografe o pet, não as pessoas.</b> Evite rostos de tutores, funcionários e principalmente crianças; se alguém aparecer, a autorização dessa pessoa é sua responsabilidade.</li>
          <li>As fotos do boletim e do antes e depois ficam no <b>álbum do pet</b> enquanto o pet estiver cadastrado. O dono pode apagar uma foto a qualquer momento: ela sai do álbum, do boletim e dos links já enviados.</li>
          <li>Antes de postar foto ou vídeo de um pet de cliente nas redes sociais do pet shop ou em qualquer divulgação, tenha a <b>autorização do tutor</b>.</li>
          <li><b>Autorização pelo boletim:</b> na página do boletim, o tutor pode responder à pergunta &quot;Pode postar a foto?&quot; tocando em &quot;Quero autorizar&quot; e escolher, sem nada marcado de início, se autoriza só as fotos daquele boletim ou também as das próximas visitas e, se quiser, o perfil dele para a loja marcar. O sistema guarda o texto exato que ele aceitou, o dia e a hora, e mostra na ficha e no álbum do pet (&quot;Pode postar&quot;, com a data). A autorização só pode ser dada pela página do boletim, não pelas telas do sistema. Quem abre o link é tratado como o tutor: mande o boletim só a ele, e ninguém da equipe deve autorizar no lugar dele. O sistema guarda também o endereço de internet e o navegador de quem autorizou.</li>
          <li><b>O tutor tira quando quiser,</b> pelo link &quot;Não quero mais&quot;, que continua funcionando mesmo depois que a página do boletim para de abrir. A partir daí a ficha mostra &quot;Sem autorização&quot;. Não poste fotos novas desse pet e avalie retirar das suas redes o que já foi postado.</li>
          <li>O sistema <b>não posta nada</b> nas redes sociais. Quem escolhe a foto, posta e responde pela postagem é o pet shop. Para autorizações pedidas fora do sistema (papel, mensagem), guardá-las é com você.</li>
          <li><b>Checklist de entrada:</b> as fotos de como o pet chegou (ferida, pulgas, nós) e a assinatura ou o aceite do tutor ficam guardados com o atendimento ou a estadia. O texto do termo é seu: o sistema traz um modelo, que você pode mudar, e você responde pelo que ele diz. O Maestro Pet só guarda o registro do aceite (nome, hora, endereço de internet, navegador e um código de conferência do texto e das fotos aceitos); ele não garante que o termo tenha valor em uma disputa.</li>
          <li>O texto do boletim (escrito por você ou pelo Mozart) deve ser conferido antes de mandar. O que for mandado ao tutor é mensagem do seu pet shop.</li>
          <li>Você nos dá permissão para guardar, reduzir e mostrar essas fotos só para o sistema funcionar (no aplicativo e nas páginas que você manda ao tutor). Não usamos as fotos dos seus clientes em propaganda nossa sem a sua autorização por escrito.</li>
        </ul>
      </>)}

      {p("publico", `Se você ligar o link de agendamento, a página do tutor ou mandar um boletim, partes dos seus dados ficam visíveis para quem tiver o link. O boletim vale ${DIAS_DO_BOLETIM} dias.`, <>
        <ul>
          <li><b>Link de agendamento:</b> ligado em Meu pet shop, o pet shop ganha uma página pública com nome, cidade, telefone, horário de funcionamento, recado, serviços (com duração e, se você quiser, preço) e horários livres. O tutor manda um <b>pedido</b>; o horário só fica marcado quando a sua equipe aceita. O combinado sobre serviço, preço e atendimento é entre o pet shop e o tutor: nós não participamos dessa relação.</li>
          <li><b>Regras do link:</b> as regras, as condições de cancelamento e os avisos que você escreve no link são suas, e você responde por elas perante o tutor.</li>
          <li><b>Página do tutor:</b> opcional. Cada tutor recebe um link particular, sem senha, que mostra os pets dele, o diário, as fotos do dia e o que está marcado. Quem tiver o link consegue abrir. Se um link for parar com quem não devia, troque-o na ficha do tutor.</li>
          <li><b>Boletim e álbum:</b> o link do boletim e o do álbum abrem por {DIAS_DO_BOLETIM} dias para quem os tiver e depois param de abrir. As fotos continuam no álbum do pet, dentro do sistema. As páginas não aparecem em buscadores.</li>
          <li><b>Orçamento:</b> o link do orçamento mostra os itens, o total, a validade e o primeiro nome de quem recebeu. Os preços e as promoções que você mostra no link, no orçamento e nas mensagens são ofertas do seu pet shop e podem obrigá-lo perante o cliente: mantenha-os corretos.</li>
          <li><b>Modo TV do quadro:</b> mostra nomes dos pets, serviços e alertas. Deixe a tela onde clientes não leiam alertas de outros pets.</li>
          <li>Você decide para quem manda cada link. Mande só ao tutor do pet.</li>
          <li>Podemos limitar a quantidade de pedidos, aberturas e perguntas que as páginas públicas recebem, para evitar abuso. Com a conta só para consulta, o link de agendamento para de receber pedidos.</li>
        </ul>
      </>)}

      {p("ia", "O Mozart, a leitura de fotos e os textos automáticos usam inteligência artificial. Eles podem errar. Confira sempre: o que você confirma vale como feito por você.", <>
        <p>O Gestão usa inteligência artificial (IA) de um fornecedor (veja a Política de privacidade) em várias funções:</p>
        <ul>
          <li><b>Mozart, o assistente:</b> entende pedidos por texto ou voz, consulta os dados do seu pet shop e mostra um <b>cartão com o que pretende fazer</b>. Nada é gravado antes de alguém tocar para confirmar, a não ser no modo automático.</li>
          <li><b>Modo automático (opcional):</b> quem liga, depois de aceitar o aviso, faz o Mozart gravar na hora, sem o cartão. Cada pessoa liga o seu (a equipe, só se o dono permitir) e pode desligar quando quiser. O que ele fizer no automático vale como feito por quem pediu: confira na conversa e, se algo sair diferente, use o Desfazer (vale por 24 horas).</li>
          <li><b>Trazer do caderno:</b> lê fotos e PDFs do caderno ou de outro sistema, tabelas de preço e carteirinhas de vacina e mostra o que leu para você conferir antes de salvar. As fotos e os PDFs enviados para essa leitura não ficam guardados no sistema.</li>
          <li><b>Textos prontos:</b> o Mozart pode escrever o texto do boletim e outras mensagens. São sugestões para você revisar.</li>
          <li><b>Dúvidas pelo link:</b> se você ligar, o link responde perguntas dos tutores usando só o que o link já mostra. Quando não sabe, manda o tutor para o seu WhatsApp.</li>
        </ul>
        <p>Ao usar essas funções, você concorda que:</p>
        <ul>
          <li>a IA <b>pode errar</b>: entender outro nome, outro dia ou outro valor, ler errado uma letra, uma dose de vacina ou um preço, ou dar uma resposta incorreta ao tutor;</li>
          <li>a <b>conferência é sua</b>: revise o cartão, a leitura e o texto antes de confirmar, salvar ou mandar. O que for confirmado vale como lançado pelo seu pet shop;</li>
          <li>a IA <b>não dá orientação veterinária, jurídica, contábil ou financeira</b>. Datas de vacina, remédios e cuidados de saúde devem ser conferidos com o documento original e com o veterinário;</li>
          <li>as respostas do link ao tutor são informações do seu pet shop. Mantenha os preços, horários e regras do link corretos;</li>
          <li>há limites diários de uso por pet shop. Se o limite acabar ou o fornecedor ficar fora do ar, as telas continuam funcionando sem a IA;</li>
          <li>você pode usar o sistema inteiro pelas telas, sem a IA.</li>
        </ul>
        <p>
          <b>Voz:</b> o microfone usa o reconhecimento de voz do seu navegador (Chrome, Edge, Safari), que pode enviar o áudio ao fabricante do navegador, sob as regras dele.
          Nós recebemos só o texto. Confira o texto antes de enviar.
        </p>
      </>)}

      {p("whatsapp", "O sistema não manda mensagens sozinho: ele abre o WhatsApp do seu aparelho com o texto pronto. Quem envia, e responde pelo envio, é você.", <>
        <ul>
          <li>Lembretes, avisos, cobranças, boletins e parabéns são preparados pelo sistema e abertos no <b>WhatsApp do seu aparelho</b>, com o seu número. Quem revisa e aperta enviar é você.</li>
          <li>Você responde por quem recebe as suas mensagens: mande só para clientes que deram o número para isso, respeite quem pedir para não receber (marque &quot;Não quer receber mensagens&quot; na ficha: ele sai dos parabéns e do Mandar mensagens) e não use os textos para spam.</li>
          <li>O WhatsApp é um serviço de outra empresa, com regras próprias. Bloqueio ou limitação do seu número pelo WhatsApp não é responsabilidade nossa.</li>
        </ul>
      </>)}

      {p("numeros", "Caixa, financeiro, comissões e relatórios mostram o que foi lançado. São ferramentas de organização, não contabilidade. Impostos e notas são com você.", <>
        <ul>
          <li>Os valores, comissões, saldos e relatórios são calculados a partir do que a sua equipe lançou. Confira antes de pagar alguém, cobrar um cliente ou tomar decisões.</li>
          <li>Eles <b>não são escrituração contábil</b> nem substituem o seu contador. Emitir notas fiscais, pagar impostos e cumprir obrigações fiscais e trabalhistas do seu negócio é responsabilidade do pet shop.</li>
          <li>Comissões e regras de pagamento da equipe são combinadas entre você e cada pessoa. O sistema só faz a conta com as regras que você colocou.</li>
          <li>Multa, juros, taxa de falta e limite de fiado que você liga no sistema são regras suas com os seus clientes. Eles são consumidores: a lei limita a multa por atraso e pede que taxas e regras sejam informadas antes (por exemplo, nas regras do link). O sistema só faz a conta com o que você colocou.</li>
          <li>Taxas da maquininha, lucro, &quot;quanto sobrou&quot; e indicadores são estimativas feitas com as taxas e os custos que você digitou. Confira com o extrato da maquininha e com o seu contador.</li>
        </ul>
      </>)}

      {p("disponivel", "Trabalhamos para o sistema ficar no ar, mas não garantimos funcionamento sem parada. Existem cópias de segurança do banco, mas sem prazo de guarda garantido; a sua própria cópia você baixa quando quiser.", <>
        <ul>
          <li>Fazemos o possível para o Gestão funcionar bem e sem interrupção, mas <b>não garantimos um tempo mínimo no ar</b> nem ausência de erros. Pode haver paradas para manutenção (de preferência fora do horário comercial), falhas nossas ou dos fornecedores (hospedagem, banco de dados, pagamentos, IA) e problemas de internet ou do seu aparelho.</li>
          <li>
            <b>Cópias de segurança que existem hoje:</b> (1) as cópias automáticas do banco de dados feitas pelo fornecedor (Supabase), na frequência e pelo tempo do plano contratado com ele;
            (2) uma cópia completa do banco que a nossa equipe baixa de tempos em tempos (o nosso painel lembra de fazer uma a cada 7 dias) e guarda fora do fornecedor, em local protegido por senha a que só o responsável tem acesso, mantendo no máximo as 4 mais recentes (cerca de 1 mês).
            Nenhuma das duas inclui as fotos. Elas existem para recuperar o sistema em caso de problema grave; não prometemos frequência, prazo de guarda nem que uma cópia vá existir para o dia de que você precisa.
          </li>
          <li>
            <b>Apagou algo por engano?</b> Fale com a gente o quanto antes. Se o que sumiu estiver numa dessas cópias, podemos tentar recuperar a parte do seu pet shop, sem garantia de resultado nem de prazo.
            Valores recebidos que alguém mudou ou apagou continuam registrados no próprio sistema, com quem fez e quando (Financeiro, Alterações em valores, e Caixa, Apagados deste caixa).
          </li>
          <li><b>A sua cópia é sua:</b> baixe de tempos em tempos todos os dados (Meu pet shop, Baixar todos os dados) e as planilhas (Clientes, Financeiro, Relatórios) e guarde os registros que a lei exige de você (fiscais, trabalhistas, sanitários) fora do sistema.</li>
          <li>Podemos incluir, mudar ou retirar funções. Quando uma mudança tirar algo importante do seu uso, avisamos antes.</li>
        </ul>
      </>)}

      {p("responsabilidade", "Respondemos pelos danos diretos que causarmos, até o valor pago nos últimos 12 meses. Não respondemos por lucros perdidos, danos indiretos ou pelo que depende de você ou de terceiros.", <>
        <p>Respondemos pelos danos diretos que causarmos por falha nossa na prestação do serviço. Na máxima medida que a lei brasileira permite:</p>
        <ul>
          <li>não respondemos por <b>lucros cessantes</b>, perda de faturamento, de clientes ou de oportunidades, danos à imagem ou outros danos indiretos;</li>
          <li>não respondemos por erros nos dados lançados por você ou pela sua equipe, por ações confirmadas sem conferência (inclusive as sugeridas pela IA), nem por decisões tomadas com base nos números do sistema;</li>
          <li>não respondemos por falhas de serviços que não controlamos, como o WhatsApp, a Cakto, a sua internet, o seu aparelho ou o navegador;</li>
          <li>não respondemos pela relação entre o pet shop e os seus clientes, nem pelo atendimento, a saúde e a segurança dos animais;</li>
          <li>não respondemos por acesso feito com o login e a senha da sua conta, salvo quando ele acontecer por falha de segurança nossa;</li>
          <li>o total que podemos dever a você, somando todos os pedidos, fica <b>limitado ao valor que você nos pagou pela assinatura nos 12 meses anteriores ao fato</b>.</li>
        </ul>
        <p>
          Esses limites não valem para dano causado por dolo ou culpa grave nossa, nem tiram direitos que a lei garante e que não podem ser afastados por contrato.
        </p>
      </>)}

      {p("reclamacoes", "Se alguém nos cobrar por algo que é responsabilidade do seu pet shop, você assume essa defesa e os custos.", <>
        <p>
          Se um cliente seu, alguém da sua equipe, uma autoridade ou outra pessoa fizer uma reclamação ou um processo contra nós por causa do conteúdo que o seu pet shop
          lançou ou enviou, das mensagens que mandou, das fotos que usou, do atendimento aos animais ou do descumprimento destes termos ou da lei pelo seu pet shop,
          você se compromete a nos ajudar na defesa e a nos ressarcir dos valores que formos obrigados a pagar por isso, incluindo custos razoáveis de advogado,
          desde que avisemos você e permitamos que participe da defesa.
        </p>
      </>)}

      {p("marca", `O sistema, o código, as telas, a marca ${EMPRESA.marca} e o Mozart são nossos. A assinatura dá o direito de usar enquanto a conta estiver ativa.`, <>
        <p>
          O Gestão, o código, o desenho das telas, os textos, o manual, os materiais da Escola de Gestão (a área do sistema com aulas e os guias vendidos à parte pela {EMPRESA.marca}), a marca {EMPRESA.marca} e o personagem Mozart são nossos
          ou licenciados para nós, e protegidos por lei. Enquanto a conta estiver em dia, damos a você e à sua equipe uma licença pessoal, não exclusiva e
          intransferível para usar o sistema na gestão do seu negócio. A licença não transfere a propriedade de nada disso e termina quando a conta acaba.
        </p>
        <p>Os dados que você lança continuam seus (parte 10). Os materiais da Escola são para leitura de quem comprou e não podem ser repassados.</p>
      </>)}

      {p("sugestoes", "Se você nos der uma ideia, podemos usá-la para melhorar o sistema, sem custo e sem obrigação.", <>
        <p>
          Sugestões, ideias e comentários que você ou a sua equipe mandarem (pelo Mozart, pela Ajuda, por e-mail ou WhatsApp) podem ser usados por nós para melhorar
          o sistema, sem pagamento e sem obrigação de usar. Não incluímos dados dos seus clientes em nada que seja mostrado a outros assinantes.
        </p>
      </>)}

      {p("suspensao", "Podemos suspender ou encerrar a conta em caso de uso ilegal, fraude, abuso ou risco à segurança. Sempre que possível, avisamos antes.", <>
        <ul>
          <li>Podemos <b>suspender</b> o acesso, todo ou em parte, se houver uso ilegal, fraude, abuso das funções ou dos limites, risco à segurança do sistema ou de outros assinantes, pedido de autoridade ou descumprimento destes termos.</li>
          <li>Sempre que possível e seguro, avisamos antes e damos um prazo para corrigir. Em caso grave ou urgente, a suspensão pode ser imediata.</li>
          <li>Se o problema não for resolvido, podemos <b>encerrar</b> a conta. Nesse caso, devolvemos a parte proporcional do período já pago que não poderá ser usada, salvo em caso de fraude ou uso ilegal.</li>
          <li>Você pode encerrar a relação a qualquer momento, cancelando a assinatura (parte 7) e, se quiser, apagando a conta em Meu pet shop, Encerrar e apagar a conta (parte 22).</li>
          <li>Podemos também deixar de oferecer o Gestão. Nesse caso, avisamos com pelo menos 60 dias de antecedência e devolvemos o valor de períodos pagos e não usados.</li>
        </ul>
      </>)}

      {p("fim", `Você baixa todos os dados quando quiser. Para apagar a conta, o titular pede no próprio sistema: ela fica ${DIAS_ATE_APAGAR_A_PEDIDO} dias só para consulta (dá para cancelar) e depois é apagada. Alguns registros ficam pelo prazo da lei.`, <>
        <ul>
          <li><b>Baixar todos os dados:</b> a qualquer momento, inclusive com a conta só para consulta, o dono baixa em Meu pet shop um arquivo .zip com uma planilha para cada parte (clientes, pets, saúde, agenda, creche e hotel, pacotes, vendas, financeiro, caixa, estoque, boletins, autorizações de fotos, equipe e outras) e um README que explica cada uma. As planilhas abrem no Excel e servem para levar os dados a outro sistema. As fotos não entram, e a equipe vem sem senhas.</li>
          <li><b>Dados de um tutor:</b> na ficha do tutor, o dono baixa num toque os dados daquele cliente, para responder a um pedido dele. Em &quot;Apagar dados deste tutor&quot;, depois de digitar o nome dele, o nome vira &quot;Cliente removido&quot;, telefone, e-mail, endereço e observações são apagados (inclusive o endereço do leva e traz e os cuidados anotados nos horários e nas estadias), os pets ficam sem nome, foto, saúde, boletins e autorizações, a lista de espera e os orçamentos ficam sem nome e telefone, os pedidos pelo link e as conversas com o Mozart que citam o tutor são apagados, e os valores continuam no financeiro sem o nome, para a contabilidade. &quot;Excluir de vez&quot; faz a mesma limpeza e ainda apaga a ficha, os pets e o histórico de atendimentos. As fotos saem do armazenamento em até 1 dia. Não dá para desfazer.</li>
          <li><b>Encerrar e apagar a conta:</b> o titular da conta pede em Meu pet shop, digitando o nome do pet shop. A conta fica <b>{DIAS_ATE_APAGAR_A_PEDIDO} dias só para consulta</b> (ninguém lança e o link para de receber pedidos), com o aviso na tela, e qualquer dono pode cancelar nesse prazo. Passados os {DIAS_ATE_APAGAR_A_PEDIDO} dias, apagamos o pet shop, todos os dados lançados, os arquivos (fotos e documentos) e os logins da equipe que não estão em outro pet shop. Isso não cancela a assinatura: cancele também pela tela Assinatura (parte 7).</li>
          <li><b>Sair de uma equipe:</b> quem trabalha num pet shop e não é o titular pode tocar em &quot;Sair desta equipe&quot;. O login deixa de abrir aquele pet shop; o nome continua no histórico dele. Quem não está em nenhum pet shop pode apagar o próprio login em &quot;Apagar o meu login&quot;. Cada pessoa baixa os próprios dados em &quot;Baixar os meus dados&quot;.</li>
          <li>Os pedidos de dados (baixar todos os dados, baixar, apagar ou excluir os dados de um tutor, pedir ou cancelar a exclusão, sair da equipe) ficam registrados com quem pediu e quando, sem os dados dos clientes, para o pet shop mostrar que atendeu o pedido.</li>
          <li>Também atendemos esses pedidos pelo nosso contato; confirmamos que o pedido é de quem pode fazê-lo.</li>
          <li>Conta encerrada por falta de pagamento segue a parte 8.</li>
          <li>As cópias de segurança (parte 16) são substituídas com o tempo: o que foi apagado pode continuar nelas até serem trocadas, e elas só servem para recuperar o sistema. Registros de pagamento, de aceite destes termos e outros que a lei nos obrigue a guardar, ou que sejam necessários para nos defendermos, ficam pelo prazo legal.</li>
        </ul>
      </>)}

      {p("mudancas", "Quando estes termos mudarem de forma importante, avisamos antes e pedimos o seu aceite de novo ao abrir o sistema.", <>
        <ul>
          <li>Podemos atualizar estes termos para acompanhar mudanças no sistema, na lei ou no negócio. A versão e a data em que passa a valer ficam no topo.</li>
          <li>Em mudanças importantes, avisamos pelo aplicativo ou por e-mail e, ao abrir o sistema, cada pessoa vê um resumo do que mudou e precisa aceitar a nova versão para continuar.</li>
          <li>Se não concordar, você pode cancelar a assinatura e pedir os seus dados. Mudanças de preço seguem a parte 6.</li>
          <li>Guardamos o registro de cada aceite: quem aceitou, qual versão e quando e, quando disponíveis, o endereço de rede e o navegador usados.</li>
        </ul>
      </>)}

      {p("avisos", "Falamos com você pelo e-mail da conta, pelo aplicativo e pelo telefone do pet shop. Mantenha esses dados atualizados.", <>
        <ul>
          <li>Os avisos sobre a conta, a cobrança e estes termos vão para o e-mail do dono, aparecem no aplicativo ou chegam pelo WhatsApp do pet shop. Consideramos o aviso recebido quando enviado para esses contatos. Os avisos que pedem uma ação sua, como o de apagar uma conta só para consulta (parte 8), também aparecem na tela do aplicativo sempre que alguém do pet shop entra.</li>
          <li>Você fala com a gente por <Email />, pelo <Zap /> ou pela Ajuda do aplicativo.{EMPRESA.emailJuridico && EMPRESA.emailJuridico !== EMPRESA.email ? <> Assuntos jurídicos e de privacidade: <EmailJuridico />.</> : null}</li>
        </ul>
      </>)}

      {p("lei", "Valem as leis do Brasil e o foro da nossa sede, salvo quando a lei garantir a você o foro do seu domicílio.", <>
        <p>
          Estes termos seguem as leis da República Federativa do Brasil. Antes de ir à Justiça, as partes procuram resolver a questão conversando.
          Fica escolhido o foro da comarca de <Foro />, salvo quando a lei garantir a você o foro do seu domicílio.
        </p>
      </>)}

      {p("geral", "Se uma regra for considerada inválida, as outras continuam valendo. Deixar de cobrar algo uma vez não é abrir mão.", <>
        <ul>
          <li>Se uma parte destes termos for considerada inválida, as demais continuam valendo.</li>
          <li>Se deixarmos de exigir uma regra em algum momento, isso não quer dizer que abrimos mão dela.</li>
          <li>Você não pode passar este contrato a outra pessoa sem a nossa concordância. Nós podemos passá-lo, com os dados e o histórico da conta, a uma empresa (com CNPJ) aberta para oferecer o Maestro Pet, a uma empresa do mesmo grupo ou a quem adquirir o negócio. As condições destes termos continuam as mesmas, e avisamos antes pelo e-mail da conta e no aplicativo. Se não concordar, você pode cancelar e receber de volta a parte não usada do período pago.</li>
          <li>Os registros eletrônicos do sistema (aceites, lançamentos, avisos da Cakto) servem como prova do que foi feito na conta.</li>
        </ul>
      </>)}
    </Legal>
  );
}
