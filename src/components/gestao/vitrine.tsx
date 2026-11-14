"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";

const ABAS: { id: string; rotulo: string; frase: string; alt: string }[] = [
  { id: "agenda", rotulo: "Agenda", frase: "A semana inteira de relance, por profissional, com os horários livres à vista. Feriado e dia fechado já aparecem marcados.", alt: "Agenda da semana no computador, com os atendimentos de cada dia coloridos por profissional" },
  { id: "assistente", rotulo: "Assistente de IA", frase: "Um assistente de inteligência artificial: fale ou escreva o que precisa. Ele prepara e você confirma com um toque.", alt: "Painel do assistente Mozart aberto ao lado da tela inicial, com exemplos de pedidos" },
  { id: "clientes", rotulo: "Clientes e pets", frase: "Cada pet com tutor, porte, cuidados e a data da última visita. Dá para trazer a lista de uma planilha.", alt: "Lista de clientes e pets, com o total de pets, de tutores, os sumidos e os que têm alerta" },
  { id: "chamar-de-volta", rotulo: "Chamar de volta", frase: "Quem não vem há 30, 45, 60 ou 90 dias e os aniversariantes da semana, com a mensagem pronta. Você toca e envia pelo seu WhatsApp.", alt: "Chamar de volta: lista de tutores com a mensagem pronta para abrir no WhatsApp" },
  { id: "caixa", rotulo: "Caixa", frase: "Abra o caixa, lance entradas e saídas e feche o dia conferindo a gaveta. Ao lado, quem ficou de pagar depois.", alt: "Caixa aberto, com o dinheiro na gaveta, o recebido no dia e as contas de clientes que ficaram para depois" },
  { id: "financeiro", rotulo: "Financeiro", frase: "O que entrou, o que saiu, as contas que vencem, o resultado do mês e quanto falta para a meta.", alt: "Financeiro do mês, com entradas, saídas, resultado, contas a pagar e a meta do mês" },
  { id: "estoque", rotulo: "Estoque", frase: "Entradas e saídas de produto, com aviso quando algum está acabando e o pedido ao fornecedor pronto para enviar.", alt: "Estoque com o saldo de cada produto, o valor em estoque e o aviso de produto acabando" },
  { id: "pacotes", rotulo: "Pacotes", frase: "Venda pacotes de banho e acompanhe o que cada cliente já usou e quando vence.", alt: "Pacotes vendidos, com o que cada pet já usou" },
  { id: "creche-hotel", rotulo: "Creche e hotel", frase: "Quem está na casa agora, quem chega, quem sai e as vagas de hoje na creche e no hotel.", alt: "Creche e hotel: pets na casa agora, saídas de hoje, reservas e as vagas do dia" },
  { id: "checkout", rotulo: "Check-out do hotel", frase: "As diárias, as taxas que você marcar e o sinal já descontado. A conta fecha num lugar só.", alt: "Check-out de um hóspede do hotel, com as diárias, as taxas da estadia e o valor a receber" },
  { id: "relatorios", rotulo: "Relatórios", frase: "Atendimentos, faltas, serviços mais feitos, faturamento, comissão, creche, hotel e produtos, com os números do período anterior ao lado.", alt: "Relatórios do mês, com atendimentos, faltas, valor médio e faturamento, ao lado do período anterior" },
  { id: "equipe", rotulo: "Equipe", frase: "Acesso por área, quem atende na agenda, a comissão de cada um e a escala da semana.", alt: "Equipe, com a função, o acesso e a escala de cada pessoa" },
  { id: "sem-valores", rotulo: "O que a equipe vê", frase: "Quem não cuida do dinheiro trabalha normalmente e não vê valores. O menu dela mostra só as áreas que você liberou.", alt: "A tela de creche e hotel vista por um monitor sem acesso ao dinheiro: menu reduzido e nenhum valor à mostra" },
  { id: "opcoes", rotulo: "Ajustes", frase: "Sinal, preço por porte, temporada, taxas: cada opção começa desligada. Você liga só o que usa.", alt: "Meu pet shop: diária e vagas da creche e do hotel e as opções que o dono liga, como o sinal na reserva" },
  { id: "manual", rotulo: "Manual", frase: "O passo a passo de cada tarefa, com busca e para imprimir. E o botão “Como usar esta tela” no alto das telas.", alt: "Manual dentro do sistema, com busca e os primeiros passos" },
];

/** Para cada tipo de negócio: o que o sistema faz, com a tela real ao lado. */
const AREAS: { id: string; rotulo: string; titulo: string; itens: string[]; tela: string; alt: string; fone?: string; altFone?: string }[] = [
  {
    id: "banho", rotulo: "Banho e tosa", titulo: "Para quem dá banho e tosa, sozinho ou com equipe",
    itens: [
      "Agenda por dia e por semana, com os horários livres à vista. No celular, a semana vira uma lista.",
      "Banho, hidratação e corte de unhas no mesmo horário, cada um com o seu valor.",
      "Cliente fixo: marque uma vez e repita toda semana ou quinzena, até você cancelar.",
      "Feriados e dias fechados saem dos horários livres.",
      "Lembrete, aviso de pet pronto e comprovante: a mensagem vem pronta e você envia pelo seu WhatsApp.",
      "Comissão por pessoa ou por serviço. Cada um vê só a própria.",
    ],
    tela: "pc-varios-servicos", alt: "Um horário da agenda com três serviços juntos (banho, hidratação e corte de unhas), cada um com o seu valor",
  },
  {
    id: "creche", rotulo: "Creche", titulo: "Para creche e escolinha",
    itens: [
      "Plano mensal pelos dias da semana de cada pet, com modelos prontos: 2, 3 ou 5 vezes.",
      "Chamada do dia: um toque quando o pet chega, outro quando sai.",
      "Dia extra entra na cobrança do mês seguinte. Reposição de falta não é cobrada.",
      "Cobranças do mês juntas por tutor: quem tem dois pets paga tudo de uma vez.",
      "Taxa de busca fora do horário, se você quiser cobrar. O sistema pergunta antes.",
      "Diário do dia para o tutor, pronto para você enviar pelo WhatsApp.",
      "Quem pode buscar cada pet e lista de espera para dia cheio.",
    ],
    tela: "pc-cobrancas", alt: "Cobranças do mês da creche: o que foi cobrado, o que já foi recebido e as mensalidades atrasadas, por tutor",
    fone: "cel-chamada", altFone: "Chamada do dia da creche no celular, com os botões Chegou, Faltou e Saiu em cada pet",
  },
  {
    id: "hotel", rotulo: "Hotel", titulo: "Para hotel e hospedagem",
    itens: [
      "Reserva com sinal, recebido na hora ou a receber. No check-out, o sinal sai da conta.",
      "Diária por porte, por temporada e em feriado. Desconto para o segundo pet do mesmo tutor.",
      "Calendário de ocupação: as vagas tomadas em cada dia e o aviso de casa cheia.",
      "Folha do dia para imprimir e ficha de cuidados, com comida e remédio de cada hóspede.",
      "Check-out com as taxas que você marcar: banho de saída, leva e traz e o que mais for.",
      "Mensagens prontas para o tutor: confirmar a reserva, avisar a chegada, contar como ele está.",
    ],
    tela: "pc-ocupacao", alt: "Calendário de ocupação do mês, com as vagas tomadas do hotel e da creche em cada dia e o feriado lotado em destaque",
    fone: "cel-link-hotel", altFone: "Pedido de vaga no hotel pelo link do cliente, com as datas e a estimativa do valor conforme o porte",
  },
  {
    id: "loja", rotulo: "Loja", titulo: "Para quem vende produtos",
    itens: [
      "Estoque com entrada, saída e aviso quando um produto está acabando.",
      "Venda no balcão passando o leitor de código de barras ou digitando o nome.",
      "Fornecedores e pedido de reposição pronto para você enviar pelo WhatsApp.",
      "Margem e custo médio de cada produto, e o relatório de vendas por produto.",
      "Fiado: quem deve, quanto e desde quando. Dá para receber em partes.",
      "O sistema não emite nota fiscal nem cupom fiscal.",
    ],
    tela: "pc-produtos", alt: "Relatório de produtos: receita, custo e margem de cada produto vendido no mês",
  },
];

/** Abas com setas do teclado: devolve a aba ativa e o que cada botão precisa. */
function useAbas(total: number) {
  const [ativa, setAtiva] = useState(0);
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);
  const ir = (i: number) => {
    const n = (i + total) % total;
    setAtiva(n);
    botoes.current[n]?.focus();
    botoes.current[n]?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  };
  const props = (i: number, id: string, painel: string) => ({
    ref: (el: HTMLButtonElement | null) => { botoes.current[i] = el; },
    role: "tab" as const, id, "aria-selected": i === ativa, "aria-controls": painel, tabIndex: i === ativa ? 0 : -1,
    onClick: () => setAtiva(i),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "ArrowRight") { e.preventDefault(); ir(i + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); ir(i - 1); } },
  });
  return { ativa, props };
}

/** Vitrine das funções: uma aba por parte do sistema, cada uma com a tela real e uma frase. */
export default function Vitrine() {
  const { ativa, props } = useAbas(ABAS.length);
  const a = ABAS[ativa];
  return (
    <div className="gp-vitrine">
      <div className="gp-abas" role="tablist" aria-label="Funções do sistema">
        {ABAS.map((x, i) => <button key={x.id} {...props(i, `aba-${x.id}`, "vitrine-painel")}>{x.rotulo}</button>)}
      </div>
      <div id="vitrine-painel" role="tabpanel" aria-labelledby={`aba-${a.id}`} className="gp-vitrine-painel">
        <p>{a.frase}</p>
        <span className="gp-tela" key={a.id}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/gestao/telas/pc-${a.id}.webp`} alt={a.alt} width={1760} height={1093} loading="lazy" decoding="async" />
        </span>
      </div>
    </div>
  );
}

/** Uma aba por tipo de negócio: o dono da creche, do hotel e da loja vê a parte dele sem procurar. */
export function Areas() {
  const { ativa, props } = useAbas(AREAS.length);
  const a = AREAS[ativa];
  return (
    <div className="gp-areas">
      <div className="gp-abas" role="tablist" aria-label="Tipo de negócio">
        {AREAS.map((x, i) => <button key={x.id} {...props(i, `area-${x.id}`, "areas-painel")}>{x.rotulo}</button>)}
      </div>
      <div id="areas-painel" role="tabpanel" aria-labelledby={`area-${a.id}`} className="gp-areas-painel">
        <div>
          <h3>{a.titulo}</h3>
          <ul>{a.itens.map((t) => <li key={t}><Check />{t}</li>)}</ul>
        </div>
        <div className={`gp-areas-telas${a.fone ? " com-fone" : ""}`} key={a.id}>
          <span className="gp-tela">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/gestao/telas/${a.tela}.webp`} alt={a.alt} width={1760} height={1093} loading="lazy" decoding="async" />
          </span>
          {a.fone && (
            <span className="gp-fone">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/gestao/telas/${a.fone}.webp`} alt={a.altFone ?? ""} width={780} height={1328} loading="lazy" decoding="async" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
