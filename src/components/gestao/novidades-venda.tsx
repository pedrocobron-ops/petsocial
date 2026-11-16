import { Camera, Check, FileText, HeartPulse, Mic, PawPrint, Sparkles, Star } from "lucide-react";

/**
 * As três novidades na página de venda (boletim do pet, trazer do caderno e falar em vez de digitar), cada uma com um desenho
 * da tela feito em HTML e SVG: nada de foto de pessoa nem de pet de verdade, e nenhuma imagem a mais para baixar.
 * Os nomes (Pipoca, Thor, Ana) são de exemplo. Os textos seguem o manual (src/lib/gestao/manual.ts: boletim, caderno, mozart-voz).
 */

/** Desenho de um cachorrinho de lacinho, no lugar da foto do banho. */
function Cachorro({ fundo }: { fundo: string }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden>
      <rect width="120" height="120" rx="14" fill={fundo} />
      <g opacity=".18" fill="#1e3a2f">
        <circle cx="20" cy="24" r="4" /><circle cx="28" cy="18" r="3" /><circle cx="14" cy="16" r="3" /><circle cx="22" cy="11" r="3" />
        <circle cx="100" cy="98" r="4" /><circle cx="108" cy="92" r="3" /><circle cx="94" cy="90" r="3" /><circle cx="102" cy="85" r="3" />
      </g>
      <ellipse cx="34" cy="56" rx="13" ry="24" fill="#a8693c" transform="rotate(18 34 56)" />
      <ellipse cx="86" cy="56" rx="13" ry="24" fill="#a8693c" transform="rotate(-18 86 56)" />
      <circle cx="60" cy="64" r="30" fill="#e7b98a" />
      <ellipse cx="60" cy="78" rx="17" ry="13" fill="#f7e3cc" />
      <circle cx="49" cy="60" r="4" fill="#1f1b17" /><circle cx="71" cy="60" r="4" fill="#1f1b17" />
      <circle cx="50.3" cy="58.6" r="1.3" fill="#fff" /><circle cx="72.3" cy="58.6" r="1.3" fill="#fff" />
      <ellipse cx="60" cy="72" rx="6" ry="4.4" fill="#1f1b17" />
      <path d="M54 79q6 5 12 0" stroke="#1f1b17" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M57 81q3 8 6 0" fill="#ef7b7b" />
      <path d="M60 36l-12-7v14zM60 36l12-7v14z" fill="#f97316" /><circle cx="60" cy="36" r="3.4" fill="#ea670c" />
    </svg>
  );
}

function Boletim() {
  return (
    <div className="gp-nv-fone" role="img" aria-label="Desenho do boletim do pet no celular do tutor: fotos do banho, o recado da equipe, o quadro Para você ficar de olho, o que foi feito, o botão Marcar o próximo e o convite para avaliar no Google">
      <div className="gp-nv-tela" aria-hidden>
        <div className="gp-bm-loja"><span className="gp-bm-logo"><PawPrint /></span><span><b>Banho &amp; Cia</b><small>Exemplo · SP</small></span></div>
        <p className="gp-bm-sobre">Boletim da Pipoca</p>
        <p className="gp-bm-nome">Pipoca</p>
        <p className="gp-bm-quando"><span>Banho e tosa</span>sexta, 14 de novembro</p>
        <div className="gp-bm-fotos">
          <Cachorro fundo="#dcebe2" />
          <Cachorro fundo="#fde7d4" />
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
      "Se quiser, o Mozart lê as respostas em voz alta.",
      "Usa o ditado do próprio navegador (Chrome, Edge, Safari). Vem em todos os planos.",
    ],
    Desenho: Voz,
  },
];

/** Seção "Novidades": as três coisas novas, logo depois da capa. */
export default function NovidadesVenda() {
  return (
    <section className="gp-nv-sec" id="novidades" aria-labelledby="novidades-titulo">
      <div className="gp-c">
        <p className="gp-ia"><Sparkles />Novo no Maestro Pet</p>
        <h2 id="novidades-titulo">Boletim do pet, caderno que vira cadastro <em>e voz no lugar do teclado.</em></h2>
        <p className="gp-lead">Três coisas novas, feitas para a rotina de quem está com o pet na mão.</p>
        <nav className="gp-nv-atalhos" aria-label="Novidades">
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
