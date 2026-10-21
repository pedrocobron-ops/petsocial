import type { Metadata } from "next";
import Image from "next/image";
import Comprar from "@/components/comprar";
import { produto, reais } from "@/lib/produtos";

const p = produto("xixi");

export const metadata: Metadata = {
  title: "Xixi no Lugar Certo — o método de 7 dias",
  description:
    "Ensine seu cachorro a fazer xixi e cocô no lugar certo em 7 dias, com reforço positivo e sem bronca. Guia ilustrado com material para imprimir. Acesso imediato.",
  alternates: { canonical: "/xixi" },
  openGraph: { images: [{ url: "/produtos/xixi-capa.webp" }] },
};

const DORES = [
  "Já tentei de tudo e ele continua fazendo xixi no tapete.",
  "Ele acerta quando estou olhando e erra quando saio do cômodo.",
  "Minha casa vive cheirando a xixi.",
  "Chego do trabalho e tem poça em algum canto.",
  "Ele volta sempre ao mesmo lugar, mesmo depois de eu limpar.",
  "Já pensei em deixar ele só no quintal.",
];

const RECEBE = [
  ["Diagnóstico rápido", "Descubra em 2 minutos qual é o caso do seu cachorro e por onde começar."],
  ["Por que ele erra", "As 6 causas por trás do xixi fora do lugar — e os mitos que pioram o problema."],
  ["A casa preparada", "Onde colocar o banheiro, como montar o cercadinho e a limpeza que impede ele de voltar ao mesmo canto."],
  ["As 5 regras de ouro", "Os princípios que fazem o método funcionar, para colar na geladeira."],
  ["Horários-chave", "Os momentos em que a vontade é quase garantida e os sinais de que ele precisa ir."],
  ["O método de 7 dias", "Um cartão por dia: objetivo, checklist e a meta do dia."],
  ["Casos especiais", "Cão adulto, marcação de território, xixi de empolgação, transição para a rua e recaídas."],
];

const FAQ = [
  ["Funciona para cachorro adulto?", "Sim. Cães aprendem em qualquer idade. O guia tem uma parte só para cães adultos e recém-adotados."],
  ["Como recebo o guia?", "Logo depois da confirmação do pagamento você recebe o acesso no seu e-mail. O guia é um PDF ilustrado que você lê no celular, no computador ou imprime."],
  ["Em quanto tempo vejo resultado?", "Muitos cães mostram melhora clara já na primeira semana. A consolidação do hábito costuma levar algumas semanas — depende da idade, do histórico e da constância da rotina."],
  ["Precisa de algum equipamento caro?", "Não. Você vai precisar de tapetes higiênicos (ou a superfície que preferir), petiscos pequenos e, se possível, um limpador enzimático. Tem até receita de limpador caseiro."],
  ["Ele começou a errar de repente. O guia resolve?", "Se o cachorro sempre acertou e passou a errar de uma hora para outra, leve-o primeiro ao veterinário: infecção urinária e outros problemas de saúde causam esse comportamento. O guia ajuda depois que a causa médica for descartada."],
  ["E se eu não gostar?", "Você tem 7 dias de garantia. Se não gostar, pede o reembolso e recebe 100% do valor de volta, sem perguntas."],
];

export default function XixiPage() {
  return (
    <>
      {/* HERO */}
      <section className="lp-hero">
        <div className="container lp-hero-grid">
          <div>
            <span className="eyebrow">Guia prático · Método de 7 dias</span>
            <h1>Seu cachorro fazendo xixi <em>no lugar certo</em> — sem bronca e sem castigo.</h1>
            <p className="lead">
              O passo a passo de 7 dias, com reforço positivo, para ensinar seu cachorro a usar o tapete higiênico
              (ou o lugar que você escolher). Para filhotes e adultos.
            </p>
            <div className="hero-ctas">
              <a className="btn btn-lg" href="#oferta">Quero o guia por {reais(p.preco)}</a>
            </div>
            <ul className="selos">
              <li>Acesso imediato</li>
              <li>23 páginas ilustradas</li>
              <li>Garantia de 7 dias</li>
            </ul>
          </div>
          <div className="mockup">
            <div className="livro">
              <Image src="/produtos/xixi-capa.webp" alt="Capa do guia Xixi no Lugar Certo" width={420} height={594} priority />
            </div>
          </div>
        </div>
      </section>

      {/* DORES */}
      <section className="secao">
        <div className="container">
          <span className="eyebrow">Você se identifica?</span>
          <h2>Se você já disse alguma destas frases, este guia é para você</h2>
          <div className="dores">
            {DORES.map((d) => <blockquote key={d}>“{d}”</blockquote>)}
          </div>
        </div>
      </section>

      {/* VIRADA */}
      <section className="secao secao-escura">
        <div className="container virada">
          <Image className="virada-art" src="/produtos/mozart-tapete.webp" alt="Mozart sentado ao lado do tapete higiênico" width={330} height={409} />
          <div>
            <span className="eyebrow">Um segredo de cachorro, contado pelo Mozart</span>
            <h2>Ele não faz xixi no lugar errado para te provocar.</h2>
            <p>
              Ele faz porque <b>ainda não entendeu onde é o lugar certo</b> — ou porque alguma coisa na rotina da casa está
              ensinando o contrário sem você perceber. Bronca, esfregar o focinho no xixi e produtos com amônia costumam
              <b> piorar</b> o problema.
            </p>
            <p>
              O método deste guia faz o contrário: deixa o acerto <b>fácil, previsível e recompensado</b>. É assim que o
              cachorro aprende mais rápido, sem medo e confiando em você.
            </p>
          </div>
        </div>
      </section>

      {/* O QUE RECEBE */}
      <section className="secao">
        <div className="container">
          <span className="eyebrow">O que tem no guia</span>
          <h2>Tudo o que você precisa, organizado em um método simples</h2>
          <div className="recebe">
            <ol>
              {RECEBE.map(([t, d]) => (
                <li key={t}><b>{t}</b><span>{d}</span></li>
              ))}
            </ol>
            <div className="paginas">
              <Image src="/produtos/xixi-pag14.webp" alt="Página do método de 7 dias" width={300} height={424} />
              <Image src="/produtos/xixi-pag9.webp" alt="Página sobre como montar o espaço" width={300} height={424} />
            </div>
          </div>
        </div>
      </section>

      {/* 7 DIAS */}
      <section className="secao secao-creme">
        <div className="container">
          <span className="eyebrow">O método</span>
          <h2>Um dia de cada vez</h2>
          <Image className="metodo-art" src="/produtos/tutora.webp" alt="Tutora elogiando o Mozart no tapete higiênico" width={1100} height={618} />
          <div className="dias">
            {[
              ["Montar o cenário", "Casa preparada e rotina definida"],
              ["Palavra-chave", "O sinal que ajuda ele a lembrar"],
              ["Prever a vontade", "Antecipar em vez de corrigir"],
              ["Liberdade vigiada", "A primeira ida sozinho ao tapete"],
              ["Reduzir a área", "Menos tapetes, mesmos acertos"],
              ["Testar a rotina", "A família toda no mesmo ritmo"],
              ["Consolidar", "O plano para as próximas semanas"],
            ].map(([t, d], i) => (
              <div key={t} className="dia"><small>Dia</small><b>{i + 1}</b><strong>{t}</strong><span>{d}</span></div>
            ))}
          </div>
        </div>
      </section>

      {/* BÔNUS */}
      <section className="secao">
        <div className="container">
          <span className="eyebrow">Incluído no guia</span>
          <h2>Material para imprimir e aplicar</h2>
          <div className="bonus">
            <div className="bonus-card">
              <Image src="/produtos/xixi-pag21.webp" alt="Tabela da semana para imprimir" width={220} height={311} />
              <div><h3>Tabela da semana</h3><p>Para colar na geladeira e anotar acertos e horários. Em 2 ou 3 dias o padrão do seu cachorro aparece.</p></div>
            </div>
            <div className="bonus-card">
              <Image src="/mozart/medalha.webp" alt="Medalha do Mozart" width={220} height={220} />
              <div><h3>Diploma de Xixi no Lugar Certo</h3><p>Um certificado para preencher quando ele concluir o método. A família toda vai querer foto.</p></div>
            </div>
            <div className="bonus-card">
              <div className="bonus-icone">🧴</div>
              <div><h3>Receita de limpador caseiro</h3><p>Para tirar o cheiro que faz ele voltar sempre ao mesmo canto, com o que você já tem em casa.</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* PARA QUEM */}
      <section className="secao secao-creme">
        <div className="container para-quem">
          <div className="pq pq-sim">
            <h3>É para você se…</h3>
            <ul>
              <li>Seu filhote ainda não aprendeu onde fazer</li>
              <li>Seu cão adulto (ou adotado) erra o lugar</li>
              <li>Você quer resolver sem bronca e sem castigo</li>
              <li>Você topa seguir uma rotina simples por 7 dias</li>
            </ul>
          </div>
          <div className="pq pq-nao">
            <h3>Não é para você se…</h3>
            <ul>
              <li>Você procura uma solução mágica, sem rotina</li>
              <li>Seu cachorro começou a errar de repente e ainda não passou no veterinário</li>
            </ul>
          </div>
        </div>
      </section>

      {/* OFERTA */}
      <section className="secao oferta-sec" id="oferta">
        <div className="container oferta">
          <div className="oferta-mockup">
            <div className="livro"><Image src="/produtos/xixi-capa.webp" alt="" width={360} height={509} loading="eager" /></div>
          </div>
          <div className="oferta-box">
            <span className="eyebrow">Oferta de lançamento</span>
            <h2>Xixi no Lugar Certo</h2>
            <ul className="oferta-itens">
              <li>Guia completo ilustrado (23 páginas)</li>
              <li>Diagnóstico rápido do seu caso</li>
              <li>Método de 7 dias, dia a dia</li>
              <li>Tabela da semana para imprimir</li>
              <li>Diploma de Xixi no Lugar Certo</li>
              <li>Receita de limpador caseiro</li>
            </ul>
            <div className="preco">
              <s>De {reais(p.precoDe)}</s>
              <strong>{reais(p.preco)}</strong>
              <small>pagamento único · Pix ou cartão</small>
            </div>
            <Comprar produto={p} texto="Quero o guia agora" grande />
            <p className="seguro">Pagamento seguro processado pela Cakto · acesso enviado por e-mail</p>
          </div>
        </div>
      </section>

      {/* GARANTIA */}
      <section className="secao">
        <div className="container garantia">
          <Image src="/mozart/medalha.webp" alt="Selo de garantia" width={200} height={200} />
          <div>
            <h2>Garantia incondicional de 7 dias</h2>
            <p>
              Leia o guia, aplique o método. Se em até 7 dias você achar que não valeu a pena, é só pedir o reembolso
              e você recebe 100% do valor de volta. Sem perguntas e sem burocracia.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="secao secao-creme">
        <div className="container faq">
          <span className="eyebrow">Dúvidas</span>
          <h2>Perguntas frequentes</h2>
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}</summary><p>{a}</p></details>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="secao cta-final">
        <div className="container">
          <h2>Daqui a 7 dias, sua casa pode estar sem poças.</h2>
          <a className="btn btn-lg" href="#oferta">Quero o guia por {reais(p.preco)}</a>
          <p className="aviso">
            Este guia tem caráter educativo e não substitui a avaliação de um(a) médico(a)-veterinário(a). Os resultados
            variam de acordo com a idade, o histórico e a rotina de cada cachorro.
          </p>
        </div>
      </section>
    </>
  );
}
