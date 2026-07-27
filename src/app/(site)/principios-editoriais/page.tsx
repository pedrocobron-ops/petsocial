import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Princípios editoriais",
  description:
    "Como o Maestro Pet apura, checa e publica: fontes utilizadas, limites do nosso conteúdo, política de correções e transparência sobre quem escreve.",
  alternates: { canonical: "/principios-editoriais" },
};

export default function PrincipiosPage() {
  return (
    <div className="prose">
      <h1>Princípios editoriais</h1>
      <p>
        O <strong>Maestro Pet</strong> é um jornal digital sobre o universo pet.
        Esta página explica, de forma aberta, como apuramos e publicamos, quais
        são os limites do nosso conteúdo e como corrigimos erros. Acreditamos
        que transparência sobre o método vale mais do que qualquer promessa.
      </p>

      <h2>Quem escreve e o que isso significa</h2>
      <p>
        As matérias são assinadas por{" "}
        <a href="/autor/pedro-amaral">Pedro Amaral</a>, editor do jornal e tutor
        de longa data. <strong>Não somos uma clínica nem um consultório
        veterinário</strong>, e nenhum texto aqui é escrito por médico-veterinário
        no exercício da profissão. O nosso papel é jornalístico: pesquisar,
        checar, organizar e traduzir informação técnica para quem convive com
        animais em casa.
      </p>

      <h2>Como apuramos</h2>
      <ul>
        <li>
          Toda matéria parte de <strong>fontes verificáveis</strong>: estudos
          publicados em periódicos científicos, órgãos oficiais de saúde,
          universidades, conselhos profissionais e associações veterinárias.
        </li>
        <li>
          As fontes são <strong>citadas no corpo do texto</strong>, com nome da
          publicação ou da instituição, para que o leitor possa conferir.
        </li>
        <li>
          Quando um assunto ainda está em debate científico, dizemos isso com
          todas as letras em vez de apresentar uma conclusão fechada.
        </li>
        <li>
          Cada texto passa por <strong>revisão humana</strong> antes de ir ao ar.
          Nenhuma matéria é publicada automaticamente.
        </li>
      </ul>

      <h2>O que o nosso conteúdo não é</h2>
      <p>
        Conteúdo informativo e educativo <strong>não substitui consulta,
        diagnóstico ou tratamento veterinário</strong>. Cada animal tem
        histórico, idade e condições próprias, e só um profissional que examine
        o seu pet pode indicar o caminho correto. Diante de qualquer sinal de
        doença, procure um médico-veterinário.
      </p>

      <h2>Uso de tecnologia na redação</h2>
      <p>
        Utilizamos ferramentas de pesquisa e de apoio à escrita na produção das
        pautas e dos rascunhos, prática comum em redações modernas. Isso não
        dispensa a etapa mais importante: <strong>toda matéria é lida, checada e
        aprovada por uma pessoa</strong> antes da publicação, e é essa pessoa
        que assina o texto e responde por ele.
      </p>

      <h2>Correções</h2>
      <p>
        Errar faz parte; esconder erro, não. Quando identificamos uma informação
        incorreta, corrigimos o texto e passamos a exibir a data de atualização
        na matéria. Se você encontrou algo errado, escreva para{" "}
        <a href="mailto:contato@maestropet.com">contato@maestropet.com</a> e nos
        ajude a corrigir.
      </p>

      <h2>Independência e publicidade</h2>
      <p>
        O jornal se sustenta com publicidade, exibida de forma identificada e
        separada do conteúdo editorial. Anunciantes não têm influência sobre as
        pautas, o conteúdo ou as conclusões das matérias. Eventuais conteúdos
        patrocinados, quando existirem, serão sinalizados como tal.
      </p>

      <h2>Imagens</h2>
      <p>
        Todas as fotografias vêm de acervos de licença livre e são creditadas na
        própria legenda. Veja a{" "}
        <a href="/creditos-de-imagem">política de créditos de imagem</a>.
      </p>
    </div>
  );
}
