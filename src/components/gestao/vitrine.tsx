"use client";

import { useRef, useState } from "react";

const ABAS: { id: string; rotulo: string; frase: string; alt: string }[] = [
  { id: "agenda", rotulo: "Agenda", frase: "A semana inteira de relance, por profissional, com os horários livres à vista.", alt: "Agenda da semana com os atendimentos coloridos por serviço" },
  { id: "assistente", rotulo: "Assistente", frase: "Fale ou escreva o que precisa. Ele prepara e você confirma com um toque.", alt: "Painel do assistente aberto ao lado da tela inicial" },
  { id: "clientes", rotulo: "Clientes e pets", frase: "Cada pet com foto, tutor, cuidados e a data da última visita.", alt: "Lista de pets com foto, tutor e última visita" },
  { id: "caixa", rotulo: "Caixa", frase: "Abra o caixa, lance entradas e saídas e feche o dia conferindo a gaveta.", alt: "Caixa do dia com entradas e saídas" },
  { id: "financeiro", rotulo: "Financeiro", frase: "O que entrou, o que saiu, as contas que vencem e o resultado do mês.", alt: "Financeiro do mês com entradas, saídas e resultado" },
  { id: "estoque", rotulo: "Estoque", frase: "Entradas e saídas de produto, com aviso quando algum está acabando.", alt: "Estoque com saldo de cada produto" },
  { id: "pacotes", rotulo: "Pacotes", frase: "Venda pacotes de banho e acompanhe o que cada cliente já usou.", alt: "Pacotes e mensalistas" },
  { id: "creche-hotel", rotulo: "Creche e hotel", frase: "Quem está na casa agora, as reservas e o check-out com as diárias.", alt: "Creche e hotel" },
  { id: "relatorios", rotulo: "Relatórios", frase: "Atendimentos, faltas, serviços mais feitos, faturamento e comissão.", alt: "Relatórios do período" },
  { id: "equipe", rotulo: "Equipe", frase: "Acesso por função, quem atende na agenda e a escala da semana.", alt: "Equipe e escala da semana" },
];

/** Vitrine das funções: uma aba por parte do sistema, cada uma com a tela real e uma frase. */
export default function Vitrine() {
  const [ativa, setAtiva] = useState(0);
  const abas = useRef<(HTMLButtonElement | null)[]>([]);
  const a = ABAS[ativa];
  const ir = (i: number) => {
    const n = (i + ABAS.length) % ABAS.length;
    setAtiva(n);
    abas.current[n]?.focus();
    abas.current[n]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };
  return (
    <div className="gp-vitrine">
      <div className="gp-abas" role="tablist" aria-label="Funções do sistema">
        {ABAS.map((x, i) => (
          <button key={x.id} ref={(el) => { abas.current[i] = el; }} role="tab" id={`aba-${x.id}`} aria-selected={i === ativa} aria-controls="vitrine-painel"
            tabIndex={i === ativa ? 0 : -1} onClick={() => setAtiva(i)}
            onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); ir(i + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); ir(i - 1); } }}>
            {x.rotulo}
          </button>
        ))}
      </div>
      <div id="vitrine-painel" role="tabpanel" aria-labelledby={`aba-${a.id}`} className="gp-vitrine-painel">
        <p>{a.frase}</p>
        <span className="gp-tela" key={a.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/gestao/telas/pc-${a.id}.webp`} alt={a.alt} width={1760} height={1093} decoding="async" />
        </span>
      </div>
    </div>
  );
}
