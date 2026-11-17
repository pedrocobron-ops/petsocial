import { Camera, Check, FileText, HeartPulse, Mic, PawPrint, Sparkles, Star } from "lucide-react";

/**
 * As três vitrines logo depois da capa (boletim do pet, trazer do caderno e falar em vez de digitar), cada uma com um desenho
 * da tela feito em HTML e SVG. No boletim, as duas fotos são de verdade: a mesma poodle depois do banho (public/gestao/boletim,
 * recortadas das fotos do feed pronto do pet shop). Nada de foto de pessoa. Os nomes (Pipoca, Thor, Ana) são de exemplo.
 * Os textos seguem o manual (src/lib/gestao/manual.ts: boletim, caderno, mozart-voz).
 */

function Boletim() {
  return (
    <div className="gp-nv-fone" role="img" aria-label="Exemplo do boletim do pet no celular do tutor: duas fotos da Pipoca, uma poodle branca de lacinho rosa, depois do banho, o recado da equipe, o quadro Para você ficar de olho, o que foi feito, o botão Marcar o próximo e o convite para avaliar no Google">
      <div className="gp-nv-tela" aria-hidden>
        <div className="gp-bm-loja"><span className="gp-bm-logo"><PawPrint /></span><span><b>Banho &amp; Cia</b><small>Exemplo · SP</small></span></div>
        <p className="gp-bm-sobre">Boletim da Pipoca</p>
        <p className="gp-bm-nome">Pipoca</p>
        <p className="gp-bm-quando"><span>Banho e tosa</span>sexta, 14 de novembro</p>
        <div className="gp-bm-fotos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gestao/boletim/pipoca-1.webp" alt="" width={320} height={400} loading="lazy" decoding="async" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gestao/boletim/pipoca-2.webp" alt="" width={320} height={400} loading="lazy" decoding="async" />
        </div>
        <div className="gp-bm-carta">
          <Sparkles />
          <p>A Pipoca foi um amor hoje! Ficou quietinha na secagem, saiu cheirosa e de lacinho novo.</p>
          <small>Equipe Banho &amp; Cia</small>
        </div>
        <div className="gp-bm-atencao">
          <HeartPulse />
          <div><b>Para você ficar de olho</b><p>A orelha esquerda estava um pouco vermelha.</p></div>
        </div>
        <div className="gp-bm-bloco">
          <b>O que foi feito</b>
          <ul><li><Check />Banho</li><li><Check />Hidratação</li><li><Check />Corte de unhas</li></ul>
          <div className="gp-bm-chips"><span>Comportada</span><span>Perfume</span><span>Lacinho</span></div>
        </div>
        <span className="gp-bm-btn">Marcar o próximo</span>
        <div className="gp-bm-google">
          <span className="gp-bm-estrelas">{[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}</span>
          <b>Gostou do cuidado com a Pipoca?</b>
          <span className="gp-bm-btn sec">Avaliar no Google</span>
        </div>
      </div>
    </div>
  );
}

function Caderno() {
  return (
    <div className="gp-nv-caderno" role="img" aria-label="Desenho de uma página de caderno com nomes, pets e telefones, e ao lado a tela de conferência: cada linha lida, uma marcada como Já existe para juntar, outra como Verificar, e o botão Salvar 3 itens">
      <div className="gp-cd-papel" aria-hidden>
        <span className="gp-cd-foto"><Camera /></span>
        <p>Ana · Thor · 9 9812-3344</p>
        <p>Carla · Mel e Bob · 9 9701-5520</p>
        <p>Joana · Luna · deve 35,00</p>
        <p className="riscado">Seu Zé · Rex · 9 98??-11</p>
      </div>
      <div className="gp-cd-conf" aria-hidden>
        <b className="gp-cd-tit"><FileText />Confira antes de salvar</b>
        <div className="gp-cd-linha"><span className="gp-cd-caixa"><Check /></span><span><b>Ana</b><small>Thor · (11) 9 9812-3344</small></span><em className="ja">Já existe</em></div>
        <div className="gp-cd-linha"><span className="gp-cd-caixa"><Check /></span><span><b>Carla</b><small>Mel, Bob · (11) 9 9701-5520</small></span></div>
        <div className="gp-cd-linha"><span className="gp-cd-caixa"><Check /></span><span><b>Joana</b><small>Luna · deve R$ 35</small></span></div>
        <div className="gp-cd-linha fora"><span className="gp-cd-caixa" /><span><b>Seu Zé</b><small>Rex · telefone em branco</small></span><em className="ver">Verificar</em></div>
        <span className="gp-bm-btn">Salvar 3 itens</span>
      </div>
    </div>
  );
}

function Voz() {
  return (
    <div className="gp-nv-fone" role="img" aria-label="Desenho do Mozart no celular: a pessoa falou marca banho do Thor amanhã às dez e meia, o Mozart mostra o cartão com o pet, o dia e o valor e o botão Pode fazer; embaixo, um campo de observação com o microfone pequeno">
      <div className="gp-nv-tela gp-vz" aria-hidden>
        <p className="gp-vz-cab"><Sparkles />Mozart</p>
        <p className="gp-vz-eu">Marca banho do Thor amanhã às dez e meia</p>
        <div className="gp-vz-cartao">
          <b>Marcar horário</b>
          <dl>
            <div><dt>Pet</dt><dd>Thor · Ana</dd></div>
            <div><dt>Quando</dt><dd>amanhã, 10:30</dd></div>
            <div><dt>Serviço</dt><dd>Banho · R$ 60</dd></div>
          </dl>
          <span className="gp-bm-btn">Pode fazer</span>
        </div>
        <div className="gp-vz-campo">
          <small>Observações do pet</small>
          <p>Tem medo do secador. Usar o shampoo dele<i>|</i></p>
          <span className="gp-vz-mini"><Mic /></span>
        </div>
        <div className="gp-vz-barra">
          <span className="gp-vz-ouvindo"><i />Ouvindo…</span>
          <span className="gp-vz-mic"><Mic /></span>
        </div>
      </div>
    </div>
  );
}

const NOVIDADES: { id: string; selo: string; titulo: React.ReactNode; texto: string; itens: string[]; Desenho: () => React.ReactElement }[] = [
  {
    id: "boletim", selo: "Boletim do pet", titulo: <>O tutor recebe o boletim <em>pelo link.</em></>,
    texto: "Terminou o banho? Tire até 4 fotos, toque em como foi (Comportado, Perfume, Lacinho) e, se quiser, o Mozart escreve o recado. O tutor abre o link no celular, sem instalar nada.",
    itens: [
      "Viu uma pulga ou a orelha vermelha? Vai num quadro à parte: “Para você ficar de olho”.",
      "Mostra o que foi feito. O valor e o que falta pagar só aparecem se você ligar.",
      "Tem o botão Marcar o próximo e, se você quiser, o Avaliar no Google.",
      "As fotos ficam no álbum do pet, na ficha. Dá para mandar o álbum ao tutor.",
      "Serve para banho e tosa, creche e hotel. A mensagem sai pronta para o seu WhatsApp: você só aperta enviar.",
    ],
    Desenho: Boletim,
  },
  {
    id: "caderno", selo: "Trazer do caderno", titulo: <>Do caderno para o sistema, <em>com uma foto.</em></>,
    texto: "Fotografe a página do caderno, mande prints ou o PDF da lista do sistema que você usava. O sistema lê e mostra tudo numa tela para você conferir.",
    itens: [
      "Clientes e pets, quem te deve, agenda e tabela de preços. Na ficha do pet, a carteirinha de vacinação.",
      "Quem já está cadastrado aparece como Já existe, para juntar e não criar outra ficha.",
      "Letra difícil fica marcada em Verificar. O que não deu para ler fica em branco: nada é inventado.",
      "Nada entra antes de você tocar em Salvar. As fotos não ficam guardadas.",
      "Dívida do caderno vira conta a receber, com o dia em que começou. O dinheiro só entra no caixa quando o cliente pagar.",
    ],
    Desenho: Caderno,
  },
  {
    id: "voz", selo: "Falar em vez de digitar", titulo: <>Mão ocupada? <em>Fale com o Mozart.</em></>,
    texto: "Toque no microfone e fale o pedido do seu jeito. O texto aparece na caixa, dá para corrigir, e o Mozart mostra o que vai fazer antes de gravar.",
    itens: [
      "Dá para segurar o microfone enquanto fala e soltar no fim.",
      "Nos campos de observação (ficha do pet, horário, estadia, diário) tem um microfone pequeno: você fala, confere e salva.",
      "A resposta aparece aos poucos, enquanto ele escreve. Se quiser, ele lê em voz alta, com a voz do aparelho que você escolher.",
      "Usa o ditado do próprio navegador (Chrome, Edge, Safari). Vem em todos os planos.",
    ],
    Desenho: Voz,
  },
];

/** Seção logo depois da capa: o boletim do pet, o caderno que vira cadastro e a voz, com o desenho da tela ao lado. */
export default function NovidadesVenda() {
  return (
    <section className="gp-nv-sec" id="destaques" aria-labelledby="destaques-titulo">
      <div className="gp-c">
        <p className="gp-ia"><Sparkles />Para quem está com o pet na mão</p>
        <h2 id="destaques-titulo">Boletim do pet, caderno que vira cadastro <em>e voz no lugar do teclado.</em></h2>
        <p className="gp-lead">Três coisas feitas para a rotina de quem atende: o tutor vê o cuidado, você não digita de novo e fala em vez de escrever.</p>
        <nav className="gp-nv-atalhos" aria-label="Destaques">
          {NOVIDADES.map((n, i) => <a key={n.id} href={`#novo-${n.id}`}><span>{String(i + 1).padStart(2, "0")}</span>{n.selo}</a>)}
        </nav>
        <ol className="gp-nv">
          {NOVIDADES.map(({ id, selo, titulo, texto, itens, Desenho }, i) => (
            <li key={id} id={`novo-${id}`} className={`gp-nv-item${i % 2 ? " inverte" : ""}`}>
              <div className="gp-nv-texto">
                <span className="gp-nv-selo">{selo}</span>
                <h3>{titulo}</h3>
                <p>{texto}</p>
                <ul>{itens.map((t) => <li key={t}><Check />{t}</li>)}</ul>
              </div>
              <div className="gp-nv-desenho"><Desenho /></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
