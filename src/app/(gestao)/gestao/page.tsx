import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, MessageCircle, Monitor, Palette, Smartphone, Sparkles, ToggleRight } from "lucide-react";
import Instalar from "@/components/gestao/instalar";
import Vitrine, { Areas } from "@/components/gestao/vitrine";
import ChatVendas from "@/components/gestao/chat-vendas";
import { Marca } from "@/components/gestao/marca";
import { linkSuporte } from "@/lib/gestao/contato";
import PlanosVenda from "@/components/gestao/planos-venda";
import "./produto.css";

export const metadata: Metadata = {
  title: { absolute: "Maestro Pet Gestão: sistema para banho e tosa, creche, hotel e pet shop" },
  description: "Agenda de banho e tosa, creche com mensalistas, hotel com reservas, loja com estoque e o caixa num lugar só, com link para o cliente pedir horário e assistente de inteligência artificial. 7 dias grátis, sem cartão.",
  // A página de venda aparece no Google; o aplicativo e as telas de entrada continuam fora (layout do grupo).
  robots: { index: true, follow: true },
  alternates: { canonical: "/gestao" },
  openGraph: { title: "Maestro Pet Gestão: sistema para banho e tosa, creche, hotel e pet shop", description: "Agenda, creche, hotel, loja e caixa num lugar só. Você liga só o que usa. Com assistente de inteligência artificial. 7 dias grátis, sem cartão.", url: "/gestao" },
};

const CRIAR = "/gestao/criar-conta";

/** O que a pessoa diz e o que o assistente faz com isso. */
const PEDIDOS: [string, string][] = [
  ["“Marca banho da Mel sexta às dez.”", "Ele acha a Mel, confere o horário e deixa o agendamento pronto para você confirmar."],
  ["“Faz o check-in do Thor no hotel.”", "Mostra a entrada que vai anotar e espera você confirmar."],
  ["“Entrou dez sacos de ração a cento e quarenta.”", "Dá entrada no estoque e lança a compra como despesa."],
  ["“Quanto entrou essa semana?”", "Responde com os números do seu caixa, por forma de pagamento."],
  ["“Quem não aparece há dois meses?”", "Lista os pets e prepara a mensagem de WhatsApp para cada tutor. Quem envia é você."],
];

const INCLUI: [string, string][] = [
  ["Assistente de inteligência artificial", "Diga o que precisa, por áudio ou texto. Ele prepara e você confirma."],
  ["Começo guiado", "Você marca o que o seu negócio faz e qual é a área principal. O menu mostra só o que você usa."],
  ["Você liga só o que usa", "Sinal, multa, comissão por serviço, código de barras, diário: cada opção começa desligada. Quem não liga nada não vê nada a mais."],
  ["Agenda de banho e tosa", "Por dia e por semana, por profissional, com os horários livres à vista e vários serviços no mesmo horário."],
  ["Horários que se repetem", "Marque o banho de toda semana ou quinzena de uma vez, até você cancelar. Almoço, folgas e feriados ficam bloqueados."],
  ["Link de agendamento", "O cliente pede horário de banho, dia de creche ou reserva de hotel. Você aceita ou recusa com um toque."],
  ["Sua marca no sistema", "Sua logo e as suas cores no link do cliente, nas telas e na agenda impressa."],
  ["Clientes e pets", "Porte, cuidados, alertas e o histórico de cada atendimento. Cadastro repetido? Dá para juntar as duas fichas."],
  ["Saúde do pet", "Vacinas, vermífugo e antipulgas com a data de vencer e aviso quando está chegando."],
  ["Fotos de antes e depois", "Guarde o resultado do banho e mande para o tutor."],
  ["Lembrete e aviso de pet pronto", "O sistema monta a mensagem e abre o seu WhatsApp. Você só envia."],
  ["Chamar de volta", "A lista de quem não vem há 30, 45, 60 ou 90 dias e dos aniversariantes da semana, com a mensagem pronta. Você só envia."],
  ["Fidelidade do seu jeito", "Você define: a cada tantos atendimentos, um prêmio à sua escolha. O sistema faz a conta de cada tutor."],
  ["Pacotes", "Quantos banhos o cliente comprou, quantos usou e quando vence."],
  ["Creche com mensalistas", "Plano pelos dias da semana, chamada do dia, dia extra, reposição e as cobranças do mês juntas por tutor."],
  ["Hotel", "Reserva com sinal, diária por porte, temporada e feriado, calendário de ocupação e check-out com taxas."],
  ["Cuidado com o tutor", "Diário do dia, quem pode buscar o pet, lista de espera e ocorrências. O diário sai pronto para você enviar."],
  ["Comanda e venda no balcão", "Serviço, produto e extra numa conta só, com baixa no estoque."],
  ["Comprovante no WhatsApp", "Recebeu a conta? O sistema monta o comprovante e abre o seu WhatsApp. Não é nota fiscal."],
  ["Caixa do dia", "Abertura, entradas, saídas e fechamento conferido com a gaveta, com planilha para baixar."],
  ["Paga depois e em partes", "Anote quem ficou devendo, receba só uma parte e, se quiser, cobre multa e juros da conta atrasada."],
  ["Financeiro e meta do mês", "Contas a pagar e a receber, o resultado do mês e quanto falta para a meta."],
  ["Estoque e loja", "Entradas, saídas, aviso de produto acabando, código de barras, fornecedores, margem e custo médio."],
  ["Equipe com acesso por área", "Você escolhe o que cada pessoa abre. Quem não cuida do dinheiro não vê valores."],
  ["Comissão", "Por pessoa, por serviço e sobre produtos. Cada um vê a própria no cartão Minha comissão."],
  ["Quem mudou o quê", "Alguém alterou ou apagou um valor recebido, ou vendeu fora do preço da lista? Fica anotado quem foi, quando e de quanto para quanto."],
  ["Preço travado no caixa", "Se quiser, só você e quem vê o financeiro mudam preço ou dão desconto na venda."],
  ["Agenda em PDF", "Baixe ou imprima a agenda do dia para deixar na bancada."],
  ["Relatórios", "Atendimentos, faltas, serviços mais feitos, faturamento, comissão, creche, hotel e vendas por produto, ao lado do período anterior."],
  ["Leva e traz", "Marque quem precisa ser buscado, com o endereço no próprio horário."],
  ["Clientes da sua planilha", "Traga clientes, pets e produtos de uma planilha. Na de clientes, você confere o que é cada coluna e, se trouxe a planilha errada, desfaz."],
  ["Manual dentro do sistema", "Mais de 150 tópicos de passo a passo, com busca e para imprimir. E o botão “Como usar esta tela” no alto das telas."],
  ["Cópia dos seus dados", "Baixe tudo em planilhas para guardar com você. É uma cópia para consulta: não volta para o sistema automaticamente."],
];

const PERGUNTAS: [string, React.ReactNode][] = [
  ["Precisa instalar alguma coisa?", "Não. O sistema abre no navegador. Se quiser, você coloca na tela inicial do celular e ele fica como um aplicativo."],
  ["Atendo sozinho, só banho e tosa. Não é coisa demais para mim?", "Não. Ao criar a conta você marca só banho e tosa, e o menu não mostra creche, hotel nem estoque. Se um dia você precisar, é só ligar em Meu pet shop."],
  ["Preciso configurar muita coisa para começar?", "Não. Ao criar a conta, você marca o que o seu negócio faz (banho e tosa, creche, hotel, venda de produtos, pacotes) e qual é a área principal. O menu e a tela inicial se arrumam para ela. Em seguida, um guia curto acerta o horário, a equipe, os preços e o link do cliente. Cada passo pode ficar para depois, e tudo pode ser mudado mais tarde."],
  ["Serve para creche ou escolinha?", "Sim. Cada mensalista tem um plano pelos dias da semana. Todo dia você faz a chamada com um toque. Dia extra entra na cobrança do mês seguinte, e as cobranças saem juntas por tutor. Se quiser, você liga a taxa de busca fora do horário, o diário do dia para o tutor, a lista de quem pode buscar o pet e a lista de espera."],
  ["Serve para hotel de pets?", "Sim. Tem reserva com sinal, diária por porte, por temporada e em feriado, desconto para o segundo pet, calendário de ocupação com aviso de casa cheia, folha do dia para imprimir, ficha de cuidados com comida e remédio e check-out com taxas. O sistema guarda a ficha de cuidados e mostra a lista do dia, mas não avisa a hora do remédio."],
  ["Tenho só loja. Serve?", "Serve para controlar o estoque, vender no balcão com leitor de código de barras, guardar fornecedores, ver a margem de cada produto e anotar o fiado. O sistema não emite nota fiscal nem cupom fiscal."],
  ["Funciona no celular?", "Sim. Ele foi feito primeiro para o celular. No computador funciona igual, com a tela maior."],
  ["O assistente faz as coisas sozinho?", "Não. Ele entende o pedido, mostra o que vai fazer e espera o seu “confirmar”. Nada entra na agenda, no caixa ou no estoque sem você ver."],
  ["O sistema manda mensagem no WhatsApp sozinho?", "Não. Ele deixa a mensagem pronta: lembrete, aviso de pet pronto, confirmação, cobrança, diário. Você toca no botão, o seu WhatsApp abre com o texto escrito e você aperta enviar. A mensagem sai do seu número."],
  ["Como o meu cliente agenda pelo link?", "Você manda o link pelo WhatsApp ou deixa no Instagram. O cliente escolhe banho, creche ou hotel, o dia e a hora, e você recebe o pedido para aceitar ou recusar. No hotel, ele já vê uma estimativa do valor. Ele não vê a sua agenda nem os dados de outros clientes, só os horários que estão livres."],
  ["O cliente paga pelo link?", "Não. Pelo link o cliente só pede. O sistema não recebe pagamento pela internet: o tutor paga direto para você, e você anota no sistema. Se você usa sinal na reserva, o link avisa que o sinal vai ser pedido e a mensagem de confirmação leva o valor e a sua chave Pix."],
  ["O cliente pode cancelar pelo link?", "Só se você deixar. É uma opção: você liga e escolhe até quantas horas antes ele pode cancelar ou pedir outra data. Você fica sabendo na tela inicial e na agenda."],
  ["O que o cliente vê tem a minha marca?", "Sim. Você coloca a sua logo e escolhe as suas cores. Elas aparecem no link de agendamento, nas telas do sistema e na agenda impressa."],
  ["E os dados dos meus clientes?", <>Os dados são do seu negócio. Você pode exportar e apagar quando quiser, como pede a LGPD. Os detalhes estão na <Link href="/gestao/privacidade">política de privacidade</Link>.</>],
  ["Emite nota fiscal?", "Não. Hoje o sistema não emite nota fiscal. O comprovante que ele monta para você mandar pelo WhatsApp não é documento fiscal."],
  ["Tem manual?", "Sim, dentro do sistema. São mais de 150 tópicos com o passo a passo de cada tarefa, com busca e opção de imprimir. No alto das telas, o botão “Como usar esta tela” abre a explicação daquela tela. Se ainda ficar dúvida, o suporte atende pelo WhatsApp."],
  ["Meus dados ficam presos no sistema?", "Não. Clientes, caixa, financeiro e relatórios saem em planilha. Em Meu pet shop, você também baixa uma cópia de segurança com tudo em planilhas, que abrem no Excel e no Google Planilhas. Essa cópia é para guardar e consultar: ainda não dá para trazê-la de volta para o sistema automaticamente, e as fotos não entram."],
  ["Estou em outro sistema. Consigo trazer meus clientes?", "Sim. Você traz clientes, pets e produtos de uma planilha, colando as células ou enviando o arquivo. Na planilha de clientes, o sistema mostra o que entendeu de cada coluna e você corrige antes de trazer. O que já está no sistema não é apagado. Trouxe a planilha errada? Dá para desfazer a importação."],
  ["Serve para clínica veterinária?", "O sistema é feito para banho e tosa, creche, hotel e loja de pet shop. Ele não tem prontuário, receituário nem internação. Uma clínica que também faz banho e tosa pode usá-lo para essa parte."],
  ["Posso colocar a minha equipe?", "Sim. Cada pessoa entra com o próprio acesso, e você escolhe o que ela abre: agenda, clientes, creche e hotel, pacotes, estoque, caixa, financeiro, relatórios. Quem não cuida do dinheiro não vê valores. Dá para ter mais de um dono. O número de acessos depende do plano: 1, 3 ou 6."],
  ["Tem contrato de fidelidade?", "Não. No plano mensal a cobrança é todo mês. Nos planos de 3 e 6 meses você paga o período de uma vez, por um valor menor. Em qualquer um, você cancela quando quiser e usa até o fim do período já pago."],
  ["Posso trocar de plano depois?", "Pode. Hoje a troca é feita cancelando o plano atual e assinando o novo; os dados continuam os mesmos."],
  ["O que acontece quando os 7 dias acabam?", "A conta fica só para consulta e os dados continuam guardados. Para voltar a usar, é só escolher um plano. Nada é cobrado sozinho, porque o teste não pede cartão."],
];

function Tela({ arquivo, alt, celular, prioridade }: { arquivo: string; alt: string; celular?: boolean; prioridade?: boolean }) {
  return (
    <span className={celular ? "gp-fone" : "gp-tela"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/gestao/telas/${arquivo}.webp`} alt={alt} width={celular ? 780 : 1760} height={celular ? 1328 : 1093}
        loading={prioridade ? "eager" : "lazy"} fetchPriority={prioridade ? "high" : undefined} decoding="async" />
    </span>
  );
}

export default function Pagina() {
  return (
    <div className="gp">
      <section className="gp-capa">
        <header className="gp-topo gp-c">
          <Link href="/gestao" className="gp-logo" aria-label="Maestro Pet Gestão">
            <Marca tamanho={36} />
            <span>Maestro Pet <em>Gestão</em></span>
          </Link>
          <nav aria-label="Página">
            <a href="#para-quem" className="gp-link so-pc">Para quem é</a>
            <a href="#funcoes" className="gp-link so-pc">Funções</a>
            <a href="#link" className="gp-link so-pc">Link do cliente</a>
            <a href="#plano" className="gp-link so-pc">Planos</a>
            <a href="#perguntas" className="gp-link so-pc">Perguntas</a>
            <Link href="/gestao/entrar" className="gp-btn contorno">Entrar</Link>
            <Link href={CRIAR} className="gp-btn verde">Teste grátis</Link>
          </nav>
        </header>

        <div className="gp-c gp-capa-grade">
          <div className="gp-capa-texto">
            <h1>Banho e tosa, creche, hotel e loja. <em>Um sistema só</em>, no celular.</h1>
            <p>Você marca o que o seu negócio faz e o sistema mostra só isso. O cliente pede horário ou vaga pelo seu link. E você fala “banho da Mel sexta às 10”: o assistente deixa pronto para você confirmar.</p>
            <ul className="gp-selos">
              <li><Check />Assistente de inteligência artificial incluído</li>
              <li><Check />Link para o cliente pedir banho, creche e hotel</li>
              <li><Check />Todas as funções em qualquer plano</li>
            </ul>
            <div className="gp-acao">
              <Link href={CRIAR} className="gp-btn pri grande">Teste grátis por 7 dias <ArrowRight /></Link>
              <span>Sem cartão. Sem fidelidade.</span>
            </div>
            <a href="#instalar" className="gp-baixar"><Smartphone /><Monitor />Instale direto pelo site, no celular e no computador</a>
          </div>
          <div className="gp-capa-telas">
            <Tela arquivo="pc-hoje" alt="Tela inicial do Maestro Pet Gestão no computador: a chamada da creche, o resumo do dia e o atendimento que está na mesa" prioridade />
            <Tela arquivo="cel-agenda" alt="Agenda do dia no celular, com os horários de cada pet" celular prioridade />
          </div>
        </div>
      </section>

      <section className="gp-areas-sec" id="para-quem">
        <div className="gp-c">
          <p className="gp-ia claro"><ToggleRight />Você liga só o que usa</p>
          <h2>Feito para o <em>seu tipo</em> de negócio.</h2>
          <p className="gp-lead">Na primeira vez, você marca o que faz e qual é a área principal. O menu e a tela inicial se arrumam para ela. O resto fica guardado, e dá para ligar depois.</p>
          <Areas />
        </div>
      </section>

      <section className="gp-pedir">
        <div className="gp-c gp-pedir-grade">
          <div>
            <p className="gp-ia"><Sparkles />Assistente de inteligência artificial</p>
            <h2>Peça como você fala <em>no dia a dia.</em></h2>
            <p className="gp-lead">Toque no microfone e diga o que aconteceu. O assistente de inteligência artificial entende, encontra o pet certo e prepara tudo.</p>
            <ul className="gp-falas">
              {PEDIDOS.map(([fala, faz]) => (
                <li key={fala}><q>{fala.slice(1, -1)}</q><span>{faz}</span></li>
              ))}
            </ul>
            <p className="gp-nota"><Check />Antes de gravar, ele mostra o que vai fazer. Você confirma com um toque.</p>
          </div>
          <Tela arquivo="cel-assistente" alt="O assistente Mozart aberto no celular, com o microfone e exemplos de pedidos" celular />
        </div>
      </section>

      <section className="gp-link-sec" id="link">
        <div className="gp-c gp-link-grade">
          <Tela arquivo="cel-link" alt="Página que o cliente abre pelo link, com o nome do negócio e as opções: creche, hotel, banho e banho e tosa" celular />
          <div>
            <p className="gp-ia claro"><CalendarCheck />Link de agendamento</p>
            <h2>O cliente pede sozinho. <em>Você só aceita.</em></h2>
            <p className="gp-lead">Mande o seu link pelo WhatsApp ou deixe no Instagram. Serve para horário de banho, dia de creche e reserva de hotel.</p>
            <ol className="gp-passos">
              <li><b>O cliente abre o link</b><span>Escolhe banho, creche ou hotel, o dia e a hora. No hotel, já vê uma estimativa do valor. Pode pedir para mais de um pet de uma vez.</span></li>
              <li><b>O pedido chega para você</b><span>Aparece na tela inicial e na agenda. Um toque para aceitar, outro para recusar. A confirmação sai pronta para você enviar pelo WhatsApp.</span></li>
              <li><b>Ele acompanha a resposta</b><span>Na página do pedido, o cliente vê se foi aceito. Se você deixar, ele cancela ou pede outra data por lá.</span></li>
            </ol>
            <p className="gp-nota"><Check />Ele só vê os horários livres. A sua agenda e os outros clientes não aparecem.</p>
            <p className="gp-nota"><Check />Se quiser, o cliente aceita as suas regras e declara as vacinas em dia antes de pedir.</p>
            <p className="gp-nota"><Check />Pelo link o cliente só pede. Nada é pago por lá.</p>
            <p className="gp-nota"><Palette />A página leva a sua logo e as suas cores.</p>
          </div>
        </div>
      </section>

      <section className="gp-mostra" id="funcoes">
        <div className="gp-c">
          <h2>Conheça o sistema <em>por dentro</em></h2>
          <Vitrine />
        </div>
      </section>

      <section className="gp-inclui">
        <div className="gp-c">
          <div className="gp-inclui-cab">
            <h2>É simples. <em>E é completo.</em></h2>
            <Link href={CRIAR} className="gp-btn pri">Teste grátis por 7 dias</Link>
          </div>
          <ul className="gp-grade">
            {INCLUI.map(([t, d]) => <li key={t}><Marca tamanho={26} /><b>{t}</b><span>{d}</span></li>)}
          </ul>
        </div>
      </section>

      <section className="gp-planos" id="plano">
        <div className="gp-c">
          <h2>Planos <em>e preços</em></h2>
          <p className="gp-lead">Todos os planos têm todas as funções e o assistente de inteligência artificial. Você escolhe pelo número de pessoas que entram no sistema e de quanto em quanto tempo quer pagar. O nome do plano não limita o tipo de negócio: creche, hotel e loja usam qualquer um.</p>
          <PlanosVenda criar={CRIAR} />
          <p className="gp-planos-nota">7 dias grátis, sem cartão. Sem fidelidade: você cancela quando quiser e usa até o fim do período já pago. Durante o teste, até 6 pessoas podem entrar.</p>
        </div>
      </section>

      <section className="gp-faq gp-c" id="perguntas">
        <h2>Perguntas <em>frequentes</em></h2>
        <div>
          {PERGUNTAS.map(([p, r]) => <details key={p}><summary>{p}</summary><p>{r}</p></details>)}
          <a className="gp-btn zap" href={linkSuporte()} target="_blank" rel="noopener noreferrer"><MessageCircle />Tirar dúvida no WhatsApp</a>
        </div>
      </section>

      <section className="gp-baixe" id="instalar">
        <div className="gp-c gp-baixe-grade">
          <div className="gp-baixe-telas">
            <Tela arquivo="pc-agenda" alt="A agenda da semana aberta no computador" />
            <Tela arquivo="cel-hoje" alt="A tela inicial aberta no celular" celular />
          </div>
          <div>
            <h2>Instale direto <em>pelo site.</em></h2>
            <p className="gp-lead">Não precisa de loja de aplicativos. O sistema fica com ícone próprio na tela do celular e do computador.</p>
            <Instalar />
          </div>
        </div>
      </section>

      <ChatVendas />

      <footer className="gp-pe">
        <div className="gp-c gp-pe-grade">
          <div>
            <Marca tamanho={56} />
            <p className="gp-pe-frase">Comece a organizar o seu negócio <em>hoje.</em></p>
            <Link href={CRIAR} className="gp-btn pri">Teste grátis por 7 dias <ArrowRight /></Link>
          </div>
          <nav aria-label="Rodapé">
            <Link href="/gestao/entrar">Entrar</Link>
            <Link href="/gestao/termos">Termos de uso</Link>
            <Link href="/gestao/privacidade">Política de privacidade</Link>
            <a href={linkSuporte()} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <Link href="/contato">Contato</Link>
            <Link href="/">Maestro Pet</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
