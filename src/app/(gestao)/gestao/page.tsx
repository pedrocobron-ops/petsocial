import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, MessageCircle, Monitor, Smartphone } from "lucide-react";
import Instalar from "@/components/gestao/instalar";
import Vitrine from "@/components/gestao/vitrine";
import { Marca } from "@/components/gestao/marca";
import { linkSuporte } from "@/lib/gestao/contato";
import { PLANOS, textoAcessos } from "@/lib/gestao/planos";
import { brlCurto } from "@/lib/gestao/util";
import "./produto.css";

export const metadata: Metadata = {
  title: { absolute: "Maestro Pet Gestão — sistema para pet shop com assistente" },
  description: "Agenda de banho e tosa, clientes, caixa e estoque num lugar só, com um assistente que marca e lança quando você pede por áudio ou texto. 7 dias grátis, sem cartão.",
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
  ["Agenda de banho e tosa", "Por dia e por semana, por profissional, com os horários livres à vista."],
  ["Clientes e pets", "Foto, porte, cuidados e o histórico de cada atendimento."],
  ["Lembrete no WhatsApp", "O sistema monta a mensagem e abre o seu WhatsApp. Você só envia."],
  ["Pacotes e mensalistas", "Quantos banhos o cliente comprou, quantos usou e quando vence."],
  ["Creche e hotel", "Entrada, saída e diárias de quem fica com você."],
  ["Caixa do dia", "Abertura, entradas, saídas e fechamento conferido com a gaveta."],
  ["Financeiro", "Contas a pagar e a receber e o resultado do mês."],
  ["Estoque", "Entradas, saídas e aviso quando um produto está acabando."],
  ["Equipe", "Acesso por função, escala da semana e comissão."],
  ["Relatórios", "Atendimentos, faltas, serviços mais feitos e faturamento."],
  ["Leva e traz", "Marque quem precisa ser buscado, com o endereço no próprio horário."],
  ["Assistente por áudio", "Diga o que precisa. Ele prepara e você confirma."],
];

const PERGUNTAS: [string, React.ReactNode][] = [
  ["Precisa instalar alguma coisa?", "Não. O sistema abre no navegador. Se quiser, você coloca na tela inicial do celular e ele fica como um aplicativo."],
  ["Funciona no celular?", "Sim. Ele foi feito primeiro para o celular. No computador funciona igual, com a tela maior."],
  ["O assistente faz as coisas sozinho?", "Não. Ele entende o pedido, mostra o que vai fazer e espera o seu “confirmar”. Nada entra na agenda, no caixa ou no estoque sem você ver."],
  ["E os dados dos meus clientes?", <>Os dados são do seu pet shop. Você pode exportar e apagar quando quiser, como pede a LGPD. Os detalhes estão na <Link href="/politica-de-privacidade">política de privacidade</Link>.</>],
  ["Emite nota fiscal?", "Ainda não. Hoje o sistema não emite nota fiscal."],
  ["Serve para clínica veterinária?", "O sistema é feito para pet shop, banho e tosa, creche e hotel. Ele não tem prontuário, receituário nem internação. Uma clínica que também faz banho e tosa pode usá-lo para essa parte."],
  ["Tem fidelidade?", "Não. A cobrança é mensal e você cancela quando quiser."],
  ["Posso colocar a minha equipe?", "Sim. Cada pessoa entra com o próprio acesso, e você escolhe quem atende na agenda e quem vê o financeiro. O número de acessos depende do plano: 1, 3 ou 6."],
  ["Posso trocar de plano depois?", "Pode. Você cancela o plano atual e assina o novo. Os dados do pet shop continuam os mesmos."],
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
            <a href="#plano" className="gp-link so-pc">Plano</a>
            <a href="#perguntas" className="gp-link so-pc">Perguntas</a>
            <Link href="/gestao/entrar" className="gp-btn contorno">Entrar</Link>
            <Link href={CRIAR} className="gp-btn verde">Teste grátis</Link>
          </nav>
        </header>

        <div className="gp-c gp-capa-grade">
          <div className="gp-capa-texto">
            <h1>Sistema para <em>pet shop</em> e banho e tosa</h1>
            <p>Agenda, clientes, caixa e estoque em um lugar só. E um assistente que marca e lança para você: é só falar.</p>
            <ul className="gp-selos">
              <li><Check />Agende falando com o assistente</li>
              <li><Check />Tudo o que o pet shop usa, em um plano só</li>
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
            <h2>Peça como você fala <em>no balcão.</em></h2>
            <p className="gp-lead">Toque no microfone e diga o que aconteceu. O assistente entende, encontra o pet certo e prepara tudo.</p>
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
          <p className="gp-lead">Todos os planos têm todas as funções e o assistente. Você escolhe pelo número de pessoas que entram no sistema.</p>
          <ul className="gp-planos-grade">
            {PLANOS.map((p) => (
              <li key={p.id} className={p.id === "equipe" ? "destaque" : undefined}>
                <h3>{p.nome}</h3>
                <p className="gp-para">{p.para}</p>
                <p className="gp-valor">{brlCurto(p.preco)}<small> por mês</small></p>
                <p className="gp-acessos">{textoAcessos(p.acessos)}<span> ao sistema</span></p>
                <ul>
                  <li><Check />Todas as funções</li>
                  <li><Check />Assistente por áudio e texto</li>
                  <li><Check />Celular e computador</li>
                  <li><Check />Suporte por WhatsApp</li>
                </ul>
                <Link href={CRIAR} className={`gp-btn cheio ${p.id === "equipe" ? "pri" : "verde"}`}>Teste grátis</Link>
              </li>
            ))}
          </ul>
          <p className="gp-planos-nota">7 dias grátis, sem cartão. Cobrança mensal, sem fidelidade: você cancela quando quiser. Durante o teste, até 6 pessoas podem entrar.</p>
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

      <a className="gp-zap-flutua" href={linkSuporte()} target="_blank" rel="noopener noreferrer" aria-label="Falar com a gente no WhatsApp"><MessageCircle /></a>

      <footer className="gp-pe">
        <div className="gp-c gp-pe-grade">
          <div>
            <Marca tamanho={56} />
            <p className="gp-pe-frase">O seu pet shop organizado <em>a partir de hoje.</em></p>
            <Link href={CRIAR} className="gp-btn pri">Teste grátis por 7 dias <ArrowRight /></Link>
          </div>
          <nav aria-label="Rodapé">
            <Link href="/gestao/entrar">Entrar</Link>
            <Link href="/termos-de-uso">Termos de uso</Link>
            <Link href="/politica-de-privacidade">Política de privacidade</Link>
            <a href={linkSuporte()} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <Link href="/contato">Contato</Link>
            <Link href="/">Maestro Pet</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
