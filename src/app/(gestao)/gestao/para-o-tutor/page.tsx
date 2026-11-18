import type { Metadata } from "next";
import Link from "next/link";
import { Selo } from "@/components/gestao/marca";
import { EmailPrivacidade } from "@/components/gestao/legal";
import { DIAS_DO_BOLETIM } from "@/lib/gestao/boletim";
import "@/components/gestao/legal.css";

export const metadata: Metadata = {
  title: "Para o tutor: os seus dados no pet shop",
  description: "O seu pet shop usa o Maestro Pet Gestão. Veja quem guarda os seus dados, o que o Maestro Pet faz e como pedir uma cópia ou a exclusão.",
  alternates: { canonical: "/gestao/para-o-tutor" },
};

/**
 * "Para o tutor": uma tela só, em palavras simples, para quem recebeu um link de um pet shop (agendamento, página do tutor,
 * boletim, checklist, orçamento) e quer saber o que acontece com os dados dele. O texto completo é a Política de privacidade;
 * aqui fica só o que importa ao tutor. Trabalho técnico de conformidade, não parecer jurídico.
 */
export default function ParaOTutor() {
  return (
    <div className="g-leg">
      <header className="g-leg-topo">
        <Link href="/gestao" className="g-leg-marca"><Selo tamanho={36} tom="verde" /><span>Maestro Pet Gestão</span></Link>
        <nav className="g-leg-nav" aria-label="Documentos">
          <Link href="/gestao/privacidade">Privacidade</Link>
        </nav>
      </header>
      <main className="g-leg-folha">
        <div className="g-leg-abre">
          <h1>Para o tutor</h1>
          <p className="g-leg-resumo">
            O pet shop, o banho e tosa, a creche ou o hotel do seu pet usa o Maestro Pet Gestão para se organizar. Esta página explica, em poucas linhas,
            o que acontece com os seus dados e como pedir para ver, corrigir ou apagar.
          </p>
        </div>
        <div className="g-leg-texto">
          <section className="g-leg-parte" aria-labelledby="quem-t">
            <h2 id="quem-t">1. Quem guarda os seus dados</h2>
            <p>
              <b>O pet shop.</b> É ele quem decide o que anotar sobre você e o seu pet e responde por esses dados. O Maestro Pet é o sistema que ele usa:
              guardamos os dados para ele, com segurança, e só fazemos com eles o que o sistema precisa para funcionar.
            </p>
            <p>Não vendemos os seus dados, não fazemos propaganda com eles e não mandamos mensagem para você. Quem fala com você é o pet shop.</p>
          </section>

          <section className="g-leg-parte" aria-labelledby="quais-t">
            <h2 id="quais-t">2. O que o pet shop costuma guardar</h2>
            <ul>
              <li><b>Sobre você:</b> nome, WhatsApp e, se você informar, e-mail, endereço (para o leva e traz) e o dia do aniversário.</li>
              <li><b>Sobre o pet:</b> nome, raça, porte, vacinas e cuidados, observações do atendimento e fotos.</li>
              <li><b>Sobre os atendimentos:</b> horários, estadias, o que foi feito e o que foi pago.</li>
              <li><b>O que você manda pelos links:</b> o pedido de horário e o recado, o aceite das regras ou do checklist de entrada e a autorização de fotos, se você der.</li>
            </ul>
            <p>O sistema não pede CPF nem dados de cartão dos tutores.</p>
          </section>

          <section className="g-leg-parte" aria-labelledby="links-t">
            <h2 id="links-t">3. Os links que você recebe</h2>
            <ul>
              <li>Os links (agendamento, página do tutor, boletim, álbum, checklist, orçamento) abrem para quem tiver o endereço. Não repasse o seu a quem não deve ver.</li>
              <li>O boletim e o álbum abrem por {DIAS_DO_BOLETIM} dias. O link do checklist de entrada, por 7 dias.</li>
              <li>Se você tirar uma dúvida pelo link de agendamento, a pergunta é respondida por inteligência artificial (de um fornecedor fora do Brasil) e não fica guardada. Não escreva dados pessoais ali.</li>
              <li>Os pedidos pelo link são para maiores de 18 anos.</li>
            </ul>
          </section>

          <section className="g-leg-parte" aria-labelledby="fotos-t">
            <h2 id="fotos-t">4. Fotos do seu pet nas redes sociais</h2>
            <p>
              O pet shop só pode postar as fotos do seu pet se você autorizar, pelo botão &quot;Pode postar a foto&quot; do boletim. Nada vem marcado.
              Mudou de ideia? Use o link <b>&quot;Não quero mais&quot;</b> que veio junto: ele funciona sempre e tira a autorização na hora. O sistema não posta nada sozinho.
            </p>
          </section>

          <section className="g-leg-parte" aria-labelledby="pedir-t">
            <h2 id="pedir-t">5. Como ver, corrigir, receber uma cópia ou apagar</h2>
            <ol>
              <li><b>Fale com o pet shop.</b> Pelo sistema, ele consegue corrigir o seu cadastro, baixar uma cópia de tudo o que guarda sobre você e os seus pets e apagar os seus dados.</li>
              <li>Quando ele apaga, saem o seu nome, telefone, e-mail, endereço, as observações, a ficha de saúde e as fotos do pet. Ficam só os valores já pagos, sem o seu nome, porque o pet shop precisa deles para a contabilidade.</li>
              <li>Se o pet shop não responder, escreva para <EmailPrivacidade /> dizendo qual é o pet shop: encaminhamos o pedido a ele e ajudamos a atender.</li>
              <li>Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em <a href="https://www.gov.br/anpd" rel="noopener noreferrer">gov.br/anpd</a>.</li>
            </ol>
          </section>

          <section className="g-leg-parte" aria-labelledby="mais-t">
            <h2 id="mais-t">6. Quer ler tudo?</h2>
            <p>
              O texto completo, com fornecedores, prazos e segurança, está na <Link href="/gestao/privacidade">Política de privacidade do Maestro Pet Gestão</Link>.
            </p>
          </section>
        </div>
      </main>
      <footer className="g-leg-pe">
        <Link href="/gestao/privacidade">Política de privacidade</Link>
        <Link href="/gestao/termos">Termos de uso</Link>
      </footer>
    </div>
  );
}
