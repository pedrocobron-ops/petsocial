import type { Metadata } from "next";
import Link from "next/link";
import Legal, { Email, Preencher, QuemResponde, Zap } from "@/components/gestao/legal";
import { EMPRESA } from "@/lib/empresa";
import { PLANOS, textoAcessos } from "@/lib/gestao/planos";
import { brlCurto } from "@/lib/gestao/util";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "As regras de uso do Maestro Pet Gestão: teste grátis, planos, cobrança, cancelamento, assistente e responsabilidades.",
  alternates: { canonical: "/gestao/termos" },
};

export default function TermosDoGestao() {
  return (
    <Legal pagina="termos" titulo="Termos de uso"
      resumo="Estas são as regras para usar o Maestro Pet Gestão, o sistema de gestão para pet shop, banho e tosa, creche e hotel. Ao criar a conta, você declara que leu e concorda com elas.">

      <div className="g-leg-quadro">
        <b>Em poucas linhas:</b> você testa 7 dias sem cartão. Se gostar, assina um plano mensal e cancela quando quiser. Os dados que você
        lança são do seu pet shop. O assistente ajuda, mas quem confere e confirma é você.
      </div>

      <h2>1. Quem oferece o serviço</h2>
      <p>
        O Maestro Pet Gestão é oferecido por <QuemResponde />, sob a marca {EMPRESA.marca}. Neste texto, &quot;nós&quot; é a {EMPRESA.marca}.
        &quot;Você&quot; ou &quot;assinante&quot; é a pessoa ou a empresa que cria a conta do pet shop. &quot;Equipe&quot; são as pessoas que você convida para entrar na conta.
      </p>
      <p>Contato: <Email /> ou <Zap />.</p>

      <h2>2. O que é o serviço</h2>
      <p>
        É um sistema que funciona pelo navegador, no celular e no computador. Com ele o pet shop organiza a agenda de banho e tosa, o cadastro de
        clientes e pets (com ficha de saúde e fotos), creche e hotel, pacotes, caixa, financeiro, relatórios, estoque e equipe.
      </p>
      <p>
        O sistema é uma ferramenta de organização. Ele não emite nota fiscal, não recebe pagamentos dos seus clientes e não substitui o contador,
        o veterinário nem o advogado. Os valores que aparecem nas telas são os que você lançou.
      </p>

      <h2>3. Conta, senha e equipe</h2>
      <ul>
        <li>Para criar a conta você informa nome, e-mail e uma senha. O e-mail precisa ser seu e estar funcionando: é por ele que confirmamos a conta e trocamos a senha.</li>
        <li>Cada pessoa da equipe entra com o próprio e-mail e senha. Não divida a mesma senha entre pessoas.</li>
        <li>Quem cria a conta do pet shop é o dono dela no sistema. É o dono que convida a equipe, decide quem vê o financeiro e muda os ajustes do pet shop.</li>
        <li>Guarde a sua senha. O que for feito com o seu login é considerado feito por você. Se desconfiar de acesso indevido, troque a senha e avise a gente.</li>
        <li>A conta é para maiores de 18 anos e para uso profissional.</li>
      </ul>

      <h2>4. Teste grátis de 7 dias</h2>
      <p>
        Toda conta nova começa com 7 dias de teste. Não pedimos cartão para testar e nenhuma cobrança é feita no fim do teste.
        Durante o teste, a conta funciona como o plano maior, para a equipe inteira experimentar.
      </p>
      <p>
        Quando o teste termina, se você não assinar, a conta fica <b>só para consulta</b>: você continua vendo o que lançou, mas não consegue marcar,
        lançar nem alterar. Os dados continuam guardados. Para voltar a usar, é só assinar.
      </p>

      <h2>5. Planos, preço e cobrança</h2>
      <p>Todos os planos têm as mesmas funções. O que muda é quantas pessoas podem entrar com login:</p>
      <ul>
        {PLANOS.map((p) => (
          <li key={p.id}><b>{p.nome}:</b> {textoAcessos(p.acessos)}, {brlCurto(p.preco)} por mês.</li>
        ))}
      </ul>
      <p>
        Estes são os preços na data desta versão. O preço que vale para você é o mostrado na tela Assinatura e no checkout no momento em que você assina.
      </p>
      <ul>
        <li>A cobrança é <b>mensal e recorrente</b>, feita pela Cakto, a plataforma de pagamentos. O valor é cobrado a cada mês até você cancelar.</li>
        <li>Os dados de pagamento são digitados no ambiente da Cakto. Nós não recebemos nem guardamos o número do seu cartão.</li>
        <li>Use no checkout o mesmo e-mail da sua conta. É por ele que o sistema reconhece o pagamento e libera o acesso.</li>
        <li>Se uma cobrança não passar, o acesso continua por um tempo enquanto o pagamento é tentado de novo. Se não for regularizado, a assinatura é encerrada e a conta fica só para consulta.</li>
        <li>Se o preço do seu plano mudar, avisamos antes, pelo aplicativo ou por e-mail. O valor novo só vale para as cobranças seguintes ao aviso, e você pode cancelar antes.</li>
      </ul>

      <h2>6. Sem fidelidade: cancelamento</h2>
      <p>
        Não há fidelidade nem multa. Você cancela quando quiser, pela página da Cakto (o botão fica na tela Assinatura) ou pedindo ajuda pelo nosso contato.
        O cancelamento encerra as cobranças seguintes.
      </p>
      <p>
        Quando a Cakto nos avisa do cancelamento, a conta fica só para consulta. Os dados continuam guardados e você pode assinar de novo quando quiser.
        Para mudar de plano, você cancela o atual e assina o novo: os dados do pet shop continuam os mesmos.
      </p>
      <p>Devolução de valores já pagos: <Preencher>regra de reembolso da mensalidade (por exemplo, se há devolução dentro de 7 dias da primeira cobrança e como pedir)</Preencher>.</p>

      <h2>7. Os dados são do seu pet shop</h2>
      <p>
        O que você e a sua equipe lançam (clientes, pets, agenda, financeiro, estoque) pertence ao seu pet shop. Nós guardamos e processamos esses dados
        para o sistema funcionar, seguindo as suas instruções e a <Link href="/gestao/privacidade">Política de privacidade</Link>.
      </p>
      <ul>
        <li>Você pode baixar os seus dados em planilha pela própria tela: em Clientes e pets (Exportar) e em Financeiro (Exportar). Isso vale também com a conta só para consulta.</li>
        <li>Para apagar a conta inteira e os dados do pet shop, peça pelo nosso contato. O pedido precisa vir do dono da conta.</li>
      </ul>

      <h2>8. O que cabe a você</h2>
      <ul>
        <li><b>Dados corretos.</b> Informar dados verdadeiros no cadastro e manter o e-mail atualizado.</li>
        <li><b>Uso dentro da lei.</b> Usar o sistema só para a gestão do seu negócio, sem fraude, sem conteúdo ilegal e sem tentar burlar a segurança, o limite de acessos ou o funcionamento do serviço.</li>
        <li><b>Os dados dos seus clientes.</b> Você decide quais dados de tutores e pets lança no sistema e para quê. Perante a lei de proteção de dados (LGPD), o responsável por esses dados é o seu pet shop. Cabe a você ter um motivo válido para usá-los, informar os seus clientes e, quando a lei pedir, obter o consentimento deles. Isso inclui as mensagens que você manda pelo WhatsApp e as fotos de pets que você guarda ou envia.</li>
        <li><b>A sua equipe.</b> Você responde pelo que as pessoas convidadas fazem na conta e por tirar o acesso de quem sair da equipe.</li>
        <li><b>Conferir o que foi lançado.</b> Horários, valores, comissões e relatórios dependem do que foi digitado. Confira antes de tomar decisões com base neles.</li>
        <li><b>Não revender.</b> A conta é para o seu pet shop. Não é permitido revender, sublicenciar ou copiar o sistema.</li>
      </ul>

      <h2>9. O assistente de inteligência artificial (Mozart)</h2>
      <p>O Mozart é um assistente que entende pedidos por texto ou por voz, como &quot;marca banho da Mel sexta às dez&quot;. Funciona assim:</p>
      <ul>
        <li>Ele consulta os dados do seu pet shop e <b>mostra o que pretende fazer</b>. Nada é gravado antes de a pessoa tocar para confirmar.</li>
        <li>Ele <b>pode errar</b>: entender outro nome, outro dia, outro valor, ou responder algo incorreto. A conferência antes de confirmar é sua, e o que for confirmado vale como lançado por você.</li>
        <li>As respostas dele são um apoio para o dia a dia. Não são orientação veterinária, contábil, jurídica ou financeira.</li>
        <li>Há um limite diário de pedidos por pet shop. Se o limite for atingido ou o assistente ficar fora do ar, as telas continuam funcionando normalmente.</li>
        <li>Os pedidos são processados por um fornecedor de inteligência artificial. Os detalhes estão na <Link href="/gestao/privacidade">Política de privacidade</Link>.</li>
      </ul>

      <h2>10. Mensagens de WhatsApp</h2>
      <p>
        O sistema <b>não envia mensagens sozinho</b>. Ele prepara o texto (confirmação de horário, lembrete, aviso de pet pronto) e abre o WhatsApp
        do seu aparelho, com o seu número. Quem revisa e aperta para enviar é você. O WhatsApp é um serviço de terceiro, com regras próprias, e o uso
        que você faz dele é responsabilidade sua.
      </p>

      <h2>11. Link de agendamento</h2>
      <p>
        Se você ligar o link de agendamento em Meu pet shop, o seu pet shop ganha uma página pública. Qualquer pessoa com o link vê o nome do pet shop,
        a cidade, o telefone, o horário de funcionamento, o recado que você escreveu, os serviços com duração e preço cadastrados e os horários livres.
      </p>
      <ul>
        <li>O tutor envia um <b>pedido</b> de horário, para até 4 pets de uma vez. O horário só fica marcado depois que alguém da sua equipe aceita.</li>
        <li>Aceitar, recusar e avisar o tutor é tarefa do pet shop. O sistema não confirma nada sozinho com o tutor.</li>
        <li>O combinado sobre o serviço, o preço e o atendimento é entre o pet shop e o tutor. Nós não participamos dessa relação.</li>
        <li>Você pode desligar o link quando quiser. Com a conta só para consulta, o link para de funcionar.</li>
      </ul>

      <h2>12. Disponibilidade e mudanças no sistema</h2>
      <p>
        Trabalhamos para o sistema ficar no ar e funcionar bem, mas <b>não garantimos funcionamento sem interrupção nem sem erros</b>. Pode haver
        paradas para manutenção, falhas nossas ou de fornecedores (hospedagem, banco de dados, pagamentos, inteligência artificial) e problemas de internet.
        O sistema precisa de conexão para funcionar.
      </p>
      <p>
        O sistema muda com o tempo: podemos incluir, alterar ou retirar funções. Quando uma mudança afetar de forma importante o seu uso, avisamos antes.
        Recomendamos baixar as planilhas de exportação de tempos em tempos e guardar uma cópia.
      </p>

      <h2>13. Marca e conteúdo</h2>
      <p>
        O sistema, o código, o desenho das telas, a marca {EMPRESA.marca} e o personagem Mozart são nossos e protegidos por lei. A assinatura dá a você
        o direito de usar o sistema enquanto a conta estiver ativa. Ela não transfere a propriedade de nada disso.
      </p>

      <h2>14. Suspensão e encerramento</h2>
      <p>
        Podemos suspender ou encerrar uma conta em caso de uso ilegal, fraude, tentativa de burlar a segurança ou descumprimento destes termos.
        Sempre que possível, avisamos antes e damos chance de corrigir. Mesmo nesse caso você pode pedir a exportação dos dados do seu pet shop,
        salvo quando a lei ou uma ordem de autoridade impedir.
      </p>

      <h2>15. Limites da nossa responsabilidade</h2>
      <p>Respondemos pelos danos diretos que causarmos por falha nossa na prestação do serviço. Dentro do que a lei permite:</p>
      <ul>
        <li>não respondemos por lucros que você deixou de ter, perda de clientela ou outros danos indiretos;</li>
        <li>não respondemos por erros nos dados lançados por você ou pela sua equipe, nem por ações confirmadas no assistente sem conferência;</li>
        <li>não respondemos por falhas de serviços de terceiros que não controlamos, como o WhatsApp, a sua internet ou o seu aparelho;</li>
        <li>não respondemos pela relação entre o pet shop e os seus clientes, nem pelo atendimento prestado aos pets;</li>
        <li>o total que podemos dever a você fica limitado ao valor que você pagou pela assinatura nos 12 meses anteriores ao fato.</li>
      </ul>
      <p>
        Esses limites não valem para casos de má-fé ou culpa grave da nossa parte, nem tiram direitos que a lei garante e que não podem ser reduzidos
        por contrato, como os do Código de Defesa do Consumidor, quando ele se aplicar a você.
      </p>

      <h2>16. Mudanças nestes termos</h2>
      <p>
        Podemos atualizar estes termos. A data no topo mostra a última revisão. Quando a mudança for importante, avisamos pelo aplicativo ou por e-mail
        antes de ela valer. Se você não concordar, pode cancelar a assinatura. Continuar usando depois da data de vigência significa que você aceitou a nova versão.
      </p>

      <h2>17. Lei e foro</h2>
      <p>
        Estes termos seguem as leis do Brasil. Para resolver qualquer questão, fica escolhido o foro de <Preencher>comarca (cidade e estado) da sede da empresa</Preencher>.
        Se a lei considerar você consumidor, vale o foro do seu domicílio.
      </p>

      <h2>18. Contato</h2>
      <p>Dúvidas, problemas ou pedidos sobre estes termos: <Email /> ou <Zap />.</p>
    </Legal>
  );
}
