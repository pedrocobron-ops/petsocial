import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Mic } from "lucide-react";
import { brlCurto } from "@/lib/gestao/util";
import "./produto.css";

export const metadata: Metadata = {
  title: { absolute: "Maestro Pet Gestão — sistema para pet shop com assistente" },
  description: "Agenda de banho e tosa, clientes, caixa e estoque num lugar só. E o Mozart, o assistente que marca e lança quando você pede por áudio ou texto. 7 dias grátis, sem cartão.",
};

const CRIAR = "/gestao/criar-conta";
const PRECO = Number(String(process.env.NEXT_PUBLIC_GESTAO_PRECO ?? "").replace(",", "."));
const TEM_PRECO = Number.isFinite(PRECO) && PRECO > 0;

const ITENS: [string, string][] = [
  ["Agenda por profissional", "Cada pessoa da equipe com os seus horários. O lembrete sai pelo seu WhatsApp com um toque: o sistema monta a mensagem, você envia."],
  ["Clientes e pets", "Ficha do pet com foto, tutor e o histórico do que já foi feito."],
  ["Pacotes e mensalistas", "Venda pacote de banhos ou plano mensal e acompanhe o que cada cliente já usou."],
  ["Creche e hotel", "Entrada, saída e diárias de quem fica hospedado."],
  ["Caixa e contas", "Caixa do dia, contas a pagar e a receber, e o resultado do mês."],
  ["Estoque", "Entrada e saída de produto, com aviso quando algum está acabando."],
  ["Equipe", "Escala de trabalho e comissão de cada profissional."],
  ["Relatórios", "Os números do pet shop reunidos, sem precisar de planilha."],
];

const PERGUNTAS: [string, React.ReactNode][] = [
  ["Precisa instalar alguma coisa?", "Não. O sistema abre no navegador. Se quiser, você coloca na tela inicial do celular e ele fica como um aplicativo."],
  ["Funciona no celular?", "Sim. Ele foi feito primeiro para o celular. No computador funciona igual, com a tela maior."],
  ["E os dados dos meus clientes?", <>Os dados são do seu pet shop. Você pode exportar e apagar quando quiser, como pede a LGPD. Os detalhes estão na <Link href="/politica-de-privacidade">política de privacidade</Link>.</>],
  ["Emite nota fiscal?", "Ainda não. Hoje o sistema não emite nota fiscal."],
  ["Tem fidelidade?", "Não. A cobrança é mensal e você cancela quando quiser."],
  ["Posso colocar a minha equipe?", "Sim. Cada pessoa entra com o próprio acesso, e você escolhe a função de cada uma. A função define o que ela vê."],
];

/** Onda de áudio desenhada: só enfeite. */
const ONDA = [5, 9, 14, 8, 17, 11, 20, 13, 7, 15, 19, 10, 6, 13, 18, 9, 14, 7, 11, 5, 9, 4];
function Audio({ tempo }: { tempo: string }) {
  return (
    <span className="gp-onda" aria-hidden>
      <Mic />
      <svg className="w" viewBox={`0 0 ${ONDA.length * 5} 22`} preserveAspectRatio="none">
        {ONDA.map((h, i) => <rect key={i} x={i * 5} y={(22 - h) / 2} width="2.4" height={h} rx="1.2" fill="currentColor" />)}
      </svg>
      <small>{tempo}</small>
    </span>
  );
}

export default function Pagina() {
  return (
    <div className="gp">
      <header className="gp-c gp-topo">
        <Link href="/gestao" className="gp-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mozart/rosto.png" alt="" width={38} height={38} />
          <span>Maestro Pet Gestão</span>
        </Link>
        <nav aria-label="Conta">
          <Link className="gp-entrar" href="/gestao/entrar">Entrar</Link>
          <Link className="gp-btn verde p" href={CRIAR}>Testar grátis</Link>
        </nav>
      </header>

      <main>
        {/* dobra */}
        <section className="gp-c gp-dobra">
          <div className="gp-dobra-t">
            <p className="gp-rotulo">Sistema para pet shop</p>
            <h1 className="gp-h1">O seu pet shop organizado. E{"\u00a0"}um <em className="it">assistente</em> que faz por você.</h1>
            <p className="gp-lead">
              Agenda de banho e tosa, clientes, caixa e estoque num lugar só. E o Mozart, que marca, lança e responde quando você pede por áudio ou texto.
            </p>
            <div className="gp-chamada">
              <Link className="gp-btn pri" href={CRIAR}>Testar 7 dias grátis <ArrowRight aria-hidden /></Link>
              <p className="gp-nota">Sem cartão. Sem fidelidade.</p>
            </div>
          </div>

          <div className="gp-cena" role="img" aria-label="Exemplo de conversa: o dono pede “Marca banho e tosa da Mel sexta às dez” e o Mozart mostra o agendamento para confirmar.">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="gp-cena-mz" src="/mozart/acenando.webp" alt="" width={150} height={150} fetchPriority="high" />
            <span className="gp-fala" aria-hidden>Pode pedir.</span>
            <div className="gp-painel" aria-hidden>
              <div className="gp-painel-topo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mozart/rosto.png" alt="" width={36} height={36} />
                <div><b>Mozart</b><span>assistente do pet shop</span></div>
              </div>
              <div className="gp-conversa">
                <p className="gp-bolha eu">Marca banho e tosa da Mel sexta às dez</p>
                <p className="gp-bolha ele">Achei a Mel, da Dona Célia. Fica assim:</p>
                <div className="gp-proposta">
                  <span className="t">Novo agendamento</span>
                  <b>Banho e tosa · Mel</b>
                  <dl>
                    <dt>Tutora</dt><dd>Dona Célia</dd>
                    <dt>Quando</dt><dd>sexta, 10h</dd>
                    <dt>Valor</dt><dd>R$ 80</dd>
                  </dl>
                  <div className="bts"><span className="gp-fbtn sec">Mudar</span><span className="gp-fbtn">Confirmar</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* pedir ao Mozart */}
        <section className="gp-areia gp-secao">
          <div className="gp-c">
            <div className="gp-cab">
              <p className="gp-rotulo">O assistente</p>
              <h2 className="gp-h2">Como é pedir ao <em className="it">Mozart</em></h2>
              <p className="gp-lead">Você fala ou escreve do seu jeito, no meio do atendimento. Ele entende o pedido e prepara tudo.</p>
            </div>

            <div className="gp-pedidos">
              <article className="gp-pedido">
                <p className="gp-rotulo">Agendar por áudio</p>
                <div className="gp-bolha eu audio">
                  <Audio tempo="0:06" />
                  <span>“Põe o Thor na terça de manhã, só banho.”</span>
                </div>
                <div className="gp-proposta">
                  <span className="t">Novo agendamento</span>
                  <b>Banho · Thor</b>
                  <dl><dt>Tutor</dt><dd>Marcos</dd><dt>Quando</dt><dd>terça, 9h</dd><dt>Valor</dt><dd>R$ 55</dd></dl>
                  <div className="bts"><span className="gp-fbtn sec">Mudar</span><span className="gp-fbtn">Confirmar</span></div>
                </div>
              </article>

              <article className="gp-pedido">
                <p className="gp-rotulo">Dar entrada no estoque</p>
                <p className="gp-bolha eu">Entrou 10 sacos de ração</p>
                <div className="gp-proposta">
                  <span className="t">Entrada de estoque</span>
                  <b>Ração adulto 15 kg</b>
                  <dl><dt>Quantidade</dt><dd>10 sacos</dd><dt>Estoque</dt><dd>de 3 para 13</dd></dl>
                  <div className="bts"><span className="gp-fbtn sec">Mudar</span><span className="gp-fbtn">Confirmar</span></div>
                </div>
              </article>

              <article className="gp-pedido">
                <p className="gp-rotulo">Perguntar do caixa</p>
                <p className="gp-bolha eu">Quanto entrou essa semana?</p>
                <div className="gp-bolha ele">
                  De segunda até hoje entraram R$ 2.340.
                  <ul style={{ marginTop: 8 }}>
                    <li><span>Banho e tosa</span><span>R$ 1.610</span></li>
                    <li><span>Produtos</span><span>R$ 730</span></li>
                  </ul>
                </div>
              </article>

              <article className="gp-pedido">
                <p className="gp-rotulo">Achar quem sumiu</p>
                <p className="gp-bolha eu">Quem não aparece há dois meses?</p>
                <div className="gp-bolha ele">
                  São 3 pets sem visita há mais de dois meses.
                  <ul style={{ marginTop: 8 }}>
                    <li><span>Nina · Paula</span><span>há 2 meses</span></li>
                    <li><span>Bob · Seu Jorge</span><span>há 3 meses</span></li>
                    <li><span>Luna · Carla</span><span>há 3 meses</span></li>
                  </ul>
                </div>
              </article>
            </div>

            <div className="gp-antes">
              <b>Ele mostra antes de gravar.</b>
              <p>Quando o pedido muda alguma coisa, o Mozart mostra o que vai fazer e espera o seu “confirmar”. Nada entra na agenda, no caixa ou no estoque sem você ver.</p>
            </div>
            <p className="gp-exemplo">As conversas acima são exemplos, com nomes e valores inventados.</p>
          </div>
        </section>

        {/* tudo em um plano */}
        <section className="gp-verde gp-secao">
          <div className="gp-c">
            <div className="gp-cab">
              <p className="gp-rotulo">O sistema</p>
              <h2 className="gp-h2">Tudo o que o pet shop usa, em um <em className="it">plano só</em></h2>
              <p className="gp-lead">Sem módulo à parte e sem recurso travado. O que está nesta lista vem junto.</p>
            </div>
            <ul className="gp-itens">
              {ITENS.map(([titulo, texto]) => (
                <li key={titulo}><h3>{titulo}</h3><p>{texto}</p></li>
              ))}
            </ul>
          </div>
        </section>

        {/* celular */}
        <section className="gp-secao">
          <div className="gp-c gp-cel">
            <div className="gp-cel-t">
              <p className="gp-rotulo">No balcão e no banho</p>
              <h2 className="gp-h2">Feito para o <em className="it">celular</em></h2>
              <p className="gp-lead">O pet shop não para na frente do computador. Por isso o sistema cabe na mão.</p>
              <ul>
                <li>Você coloca na tela inicial e abre como um aplicativo.</li>
                <li>Não precisa baixar nada em loja.</li>
                <li>No computador funciona também, com a agenda da semana inteira na tela.</li>
              </ul>
            </div>
            <div className="gp-fone" aria-hidden>
              <div className="gp-tela">
                <span /><span /><span /><span />
                <span /><span /><span /><span />
                <span />
                <div className="app">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mozart/acenando-144.webp" alt="" width={56} height={56} loading="lazy" style={{ background: "#fdf0d9", objectFit: "cover" }} />
                  <small>Maestro Gestão</small>
                </div>
                <span /><span />
                <span /><span /><span /><span />
              </div>
            </div>
          </div>
        </section>

        {/* plano e preço */}
        <section className="gp-areia gp-secao" id="plano">
          <div className="gp-c gp-plano">
            <div className="gp-cab" style={{ marginBottom: 0 }}>
              <p className="gp-rotulo">Plano e preço</p>
              <h2 className="gp-h2">Um plano. <em className="it">Sem letra miúda.</em></h2>
              <p className="gp-lead">Você testa por 7 dias com tudo liberado. Se gostar, assina. Se não assinar, a conta fica só para consulta e nada é cobrado.</p>
            </div>
            <div className="gp-folha">
              <h3>Plano Gestão</h3>
              {TEM_PRECO
                ? <p className="gp-preco"><b>{brlCurto(PRECO)}</b><span>por mês</span></p>
                : <p className="gp-preco-def">Preço de lançamento em definição</p>}
              <ul>
                <li><Check aria-hidden /> O sistema inteiro e o assistente Mozart</li>
                <li><Check aria-hidden /> 7 dias grátis, sem cartão</li>
                <li><Check aria-hidden /> Cobrança mensal pela Cakto</li>
                <li><Check aria-hidden /> Sem fidelidade: cancela quando quiser</li>
              </ul>
              <Link className="gp-btn pri" href={CRIAR}>Testar 7 dias grátis</Link>
            </div>
          </div>
        </section>

        {/* perguntas */}
        <section className="gp-secao">
          <div className="gp-c gp-faq">
            <div className="gp-cab" style={{ marginBottom: 0 }}>
              <p className="gp-rotulo">Antes de testar</p>
              <h2 className="gp-h2">Perguntas <em className="it">frequentes</em></h2>
              <p className="gp-lead">Ficou outra dúvida? <Link href="/contato" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>Fale com a gente</Link>.</p>
            </div>
            <div className="gp-perguntas">
              {PERGUNTAS.map(([pergunta, resposta]) => (
                <details key={pergunta}>
                  <summary>{pergunta}</summary>
                  <p>{resposta}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* chamada final */}
        <section className="gp-verde gp-secao">
          <div className="gp-c gp-final">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mozart/sorrindo-144.webp" alt="" width={112} height={112} loading="lazy" />
            <h2 className="gp-h2">Teste com o seu pet shop <em className="it">de verdade</em></h2>
            <p className="gp-lead">Cadastre dois ou três clientes, marque os banhos da semana e peça alguma coisa ao Mozart. Em 7 dias dá para saber se serve.</p>
            <Link className="gp-btn pri" href={CRIAR}>Testar 7 dias grátis <ArrowRight aria-hidden /></Link>
            <p className="gp-nota">Sem cartão. Sem fidelidade.</p>
          </div>
        </section>
      </main>

      <footer className="gp-pe">
        <div className="gp-c">
          <span>Maestro Pet Gestão</span>
          <nav aria-label="Rodapé">
            <Link href="/termos-de-uso">Termos de uso</Link>
            <Link href="/politica-de-privacidade">Política de privacidade</Link>
            <Link href="/contato">Contato</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
