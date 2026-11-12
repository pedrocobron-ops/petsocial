import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Check, MessageCircle, Monitor, Palette, Smartphone, Sparkles } from "lucide-react";
import Instalar from "@/components/gestao/instalar";
import Vitrine from "@/components/gestao/vitrine";
import ChatVendas from "@/components/gestao/chat-vendas";
import { Marca } from "@/components/gestao/marca";
import { linkSuporte } from "@/lib/gestao/contato";
import PlanosVenda from "@/components/gestao/planos-venda";
import "./produto.css";

export const metadata: Metadata = {
  title: { absolute: "Maestro Pet Gestão: sistema para pet shop e banho e tosa" },
  description: "Agenda de banho e tosa, link para o cliente agendar, clientes, caixa e estoque num lugar só, com assistente de inteligência artificial. 7 dias grátis, sem cartão.",
  // A página de venda aparece no Google; o aplicativo e as telas de entrada continuam fora (layout do grupo).
  robots: { index: true, follow: true },
  alternates: { canonical: "/gestao" },
  openGraph: { title: "Maestro Pet Gestão: sistema para pet shop e banho e tosa", description: "Agenda, clientes, caixa e estoque num lugar só, com assistente de inteligência artificial. 7 dias grátis, sem cartão.", url: "/gestao" },
};

const CRIAR = "/gestao/criar-conta";

/** O que a pessoa diz e o que o assistente faz com isso. */
const PEDIDOS: [string, string][] = [
  ["“Marca banho e tosa da Mel sexta às dez.”", "Ele acha a Mel, confere o horário e deixa o agendamento pronto para você confirmar."],
  ["“Entrou dez sacos de ração a cento e quarenta.”", "Dá entrada no estoque e lança a compra como despesa."],
  ["“Quanto entrou essa semana?”", "Responde com os números do seu caixa, por forma de pagamento."],
  ["“Quem não aparece há dois meses?”", "Lista os pets e prepara a mensagem de WhatsApp para cada tutor."],
];

const INCLUI: [string, string][] = [
  ["Assistente de inteligência artificial", "Diga o que precisa, por áudio ou texto. Ele prepara e você confirma."],
  ["Agenda de banho e tosa", "Por dia e por semana, por profissional, com os horários livres à vista."],
  ["Link de agendamento", "O cliente escolhe o horário pelo link e você aceita ou recusa com um toque."],
  ["Sua marca no sistema", "Sua logo e as cores do pet shop no link do cliente, nas telas e na agenda impressa."],
  ["Clientes e pets", "Foto, porte, cuidados e o histórico de cada atendimento."],
  ["Saúde do pet", "Vacinas, vermífugo e antipulgas com a data de vencer e aviso quando está chegando."],
  ["Fotos de antes e depois", "Guarde o resultado do banho e mande para o tutor."],
  ["Aviso de pet pronto", "Terminou o banho? O sistema monta a mensagem e abre o seu WhatsApp."],
  ["Lembrete no WhatsApp", "O sistema monta a mensagem do horário e abre o seu WhatsApp. Você só envia."],
  ["Horários que se repetem", "Marque o banho de toda semana de uma vez e bloqueie almoço e folgas."],
  ["Pacotes e mensalistas", "Quantos banhos o cliente comprou, quantos usou e quando vence."],
  ["Creche e hotel", "Entrada, saída e diárias de quem fica com você."],
  ["Comanda e venda no balcão", "Serviço, produto e extra numa conta só, com baixa no estoque."],
  ["Caixa do dia", "Abertura, entradas, saídas e fechamento conferido com a gaveta."],
  ["Financeiro e meta do mês", "Contas a pagar e a receber, o resultado do mês e quanto falta para a meta."],
  ["Estoque", "Entradas, saídas e aviso quando um produto está acabando."],
  ["Equipe com acesso por área", "Você escolhe o que cada pessoa vê: agenda, clientes, caixa, financeiro, estoque."],
  ["Agenda em PDF", "Baixe ou imprima a agenda do dia para deixar na bancada."],
  ["Relatórios", "Atendimentos, faltas, serviços mais feitos, faturamento e comissão."],
  ["Leva e traz", "Marque quem precisa ser buscado, com o endereço no próprio horário."],
];

const PERGUNTAS: [string, React.ReactNode][] = [
  ["Precisa instalar alguma coisa?", "Não. O sistema abre no navegador. Se quiser, você coloca na tela inicial do celular e ele fica como um aplicativo."],
  ["Funciona no celular?", "Sim. Ele foi feito primeiro para o celular. No computador funciona igual, com a tela maior."],
  ["O assistente faz as coisas sozinho?", "Não. Ele entende o pedido, mostra o que vai fazer e espera o seu “confirmar”. Nada entra na agenda, no caixa ou no estoque sem você ver."],
  ["E os dados dos meus clientes?", <>Os dados são do seu pet shop. Você pode exportar e apagar quando quiser, como pede a LGPD. Os detalhes estão na <Link href="/gestao/privacidade">política de privacidade</Link>.</>],
  ["Emite nota fiscal?", "Ainda não. Hoje o sistema não emite nota fiscal."],
  ["Serve para creche e hotel de cães?", "Sim. Tem reserva, entrada e saída, diária fixa, número de vagas com aviso de casa cheia, aviso de vacina vencida na entrada, pacotes de diárias e pedido de vaga pelo link do cliente."],
  ["Estou em outro sistema. Consigo trazer meus clientes?", "Sim. Você traz clientes, pets e produtos de uma planilha, colando as células ou enviando o arquivo. O que já está no sistema não é apagado."],
  ["Serve para clínica veterinária?", "O sistema é feito para pet shop, banho e tosa, creche e hotel. Ele não tem prontuário, receituário nem internação. Uma clínica que também faz banho e tosa pode usá-lo para essa parte."],
  ["Tem fidelidade?", "Não. No plano mensal a cobrança é todo mês. Nos planos de 3 e 6 meses você paga o período de uma vez, por um valor menor. Em qualquer um, você cancela quando quiser e usa até o fim do período já pago."],
  ["Como o meu cliente agenda pelo link?", "Você manda o link pelo WhatsApp ou deixa no Instagram. O cliente escolhe o serviço, o dia e um dos horários livres, e você recebe o pedido para aceitar ou recusar. Ele não vê a sua agenda nem os dados de outros clientes, só os horários que estão livres."],
  ["O que o cliente vê tem a minha marca?", "Sim. Você coloca a sua logo e escolhe as cores do pet shop. Elas aparecem no link de agendamento, nas telas do sistema e na agenda impressa."],
  ["Posso colocar a minha equipe?", "Sim. Cada pessoa entra com o próprio acesso, e você escolhe o que ela vê: agenda, clientes, caixa, financeiro, estoque. Dá para ter mais de um dono. O número de acessos depende do plano: 1, 3 ou 6."],
  ["Posso trocar de plano depois?", "Pode. Hoje a troca é feita cancelando o plano atual e assinando o novo; os dados do pet shop continuam os mesmos."],
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
            <h1>Agenda, clientes e caixa do seu <em>pet shop</em>, no celular.</h1>
            <p>O cliente marca o banho sozinho pelo seu link. Você fala o que aconteceu e o assistente de inteligência artificial deixa pronto para você confirmar. Feito para pet shop, banho e tosa, creche e hotel.</p>
            <ul className="gp-selos">
              <li><Check />Assistente de inteligência artificial incluído</li>
              <li><Check />Link para o cliente agendar, com a sua marca</li>
              <li><Check />Todas as funções em qualquer plano</li>
            </ul>
            <div className="gp-acao">
              <Link href={CRIAR} className="gp-btn pri grande">Teste grátis por 7 dias <ArrowRight /></Link>
              <span>Sem cartão. Sem fidelidade.</span>
            </div>
            <a href="#instalar" className="gp-baixar"><Smartphone /><Monitor />Instale direto pelo site, no celular e no computador</a>
          </div>
          <div className="gp-capa-telas">
            <Tela arquivo="pc-hoje" alt="Tela inicial do Maestro Pet Gestão no computador: atendimentos do dia, o que pede atenção e a agenda de hoje" prioridade />
            <Tela arquivo="cel-agenda" alt="Agenda do dia no celular, com a foto de cada pet" celular prioridade />
          </div>
        </div>
      </section>

      <section className="gp-pedir">
        <div className="gp-c gp-pedir-grade">
          <div>
            <p className="gp-ia"><Sparkles />Assistente de inteligência artificial</p>
            <h2>Peça como você fala <em>no balcão.</em></h2>
            <p className="gp-lead">Toque no microfone e diga o que aconteceu. O assistente de inteligência artificial entende, encontra o pet certo e prepara tudo.</p>
            <ul className="gp-falas">
              {PEDIDOS.map(([fala, faz]) => (
                <li key={fala}><q>{fala.slice(1, -1)}</q><span>{faz}</span></li>
              ))}
            </ul>
            <p className="gp-nota"><Check />Antes de gravar, ele mostra o que vai fazer. Você confirma com um toque.</p>
          </div>
          <Tela arquivo="cel-assistente" alt="O assistente aberto no celular, com o microfone e exemplos de pedidos" celular />
        </div>
      </section>

      <section className="gp-link-sec" id="link">
        <div className="gp-c gp-link-grade">
          <Tela arquivo="cel-link" alt="Página de agendamento que o cliente abre pelo link, com a logo e as cores do pet shop" celular />
          <div>
            <p className="gp-ia claro"><CalendarCheck />Link de agendamento</p>
            <h2>O cliente agenda sozinho. <em>Você só aceita.</em></h2>
            <p className="gp-lead">Mande o seu link pelo WhatsApp ou deixe no Instagram. Chega de responder “tem horário sábado?” o dia inteiro.</p>
            <ol className="gp-passos">
              <li><b>O cliente abre o link</b><span>Escolhe o serviço, o dia e um dos horários livres. Pode pedir para mais de um pet de uma vez.</span></li>
              <li><b>O pedido chega para você</b><span>Aparece na tela inicial e na agenda. Um toque para aceitar, outro para recusar.</span></li>
              <li><b>Ele acompanha a resposta</b><span>O cliente vê na hora se o horário foi confirmado, pelo mesmo link.</span></li>
            </ol>
            <p className="gp-nota"><Check />Ele só vê os horários livres. A sua agenda e os outros clientes não aparecem.</p>
            <p className="gp-nota"><Palette />A página leva a sua logo e as cores do seu pet shop.</p>
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
          <p className="gp-lead">Todos os planos têm todas as funções e o assistente de inteligência artificial. Você escolhe pelo número de pessoas que entram no sistema e de quanto em quanto tempo quer pagar.</p>
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
            <Tela arquivo="pc-agenda" alt="O sistema aberto no computador" />
            <Tela arquivo="cel-hoje" alt="O sistema aberto no celular" celular />
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
            <p className="gp-pe-frase">Comece a organizar o seu pet shop <em>hoje.</em></p>
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
