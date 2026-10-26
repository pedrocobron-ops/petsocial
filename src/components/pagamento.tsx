import { BellRing, CreditCard, FileText, Mail, ShieldCheck } from "lucide-react";
import { LogoElo, LogoMastercard, LogoPix, LogoVisa } from "@/components/icones";

/** Logos oficiais de Pix, Visa, Mastercard e Elo em chips de folha (brief 20, 6.5). */
export function LogosPagamento() {
  return (
    <span className="logos-pag" role="img" aria-label="Aceitamos Pix, Visa, Mastercard e Elo">
      <span><LogoPix /></span>
      <span><LogoVisa /></span>
      <span><LogoMastercard /></span>
      <span><LogoElo /></span>
    </span>
  );
}

/** Linha "Pagamento único" + logos, acima do botão de compra da dobra. */
export function LinhaPagamento({ texto = "Pagamento único" }: { texto?: string }) {
  return (
    <div className="pagar">
      <span>{texto}</span>
      <LogosPagamento />
    </div>
  );
}

/** Linha de risco sob todo botão de compra (6.6). O primeiro fato em semibold. */
export function Risco({ fato = "Acesso no e-mail logo após o pagamento", resto = "se não valer a pena, o dinheiro volta em até 7 dias" }: { fato?: string; resto?: string }) {
  return (
    <p className="risco">
      <b>{fato}</b> · {resto}
    </p>
  );
}

/**
 * Faixa de prova (6.7): 4 fatos com ícone, sem marquee. A linha Negócios troca o quarto.
 * Títulos curtos, para caberem numa linha a 390 px. `breve`: produto ainda não lançado, sem falar de pagamento como se já desse para pagar.
 */
export function FaixaProva({ negocios = false, breve = false, className = "" }: { negocios?: boolean; breve?: boolean; className?: string }) {
  const quarto: [typeof Mail, string, string] = negocios ? [FileText, "Fonte e data", "nenhum número sem origem"] : [FileText, "Páginas reais", "nenhum depoimento inventado"];
  const itens: [typeof Mail, string, string][] = breve
    ? [
        [BellRing, "Aviso por e-mail", "no dia do lançamento, sem spam"],
        [FileText, "Páginas reais", "veja o PDF por dentro aqui"],
        [CreditCard, "Pix ou cartão", "quando a venda abrir"],
        [ShieldCheck, "7 dias para desistir", "em toda compra"],
      ]
    : [
        [Mail, "Acesso por e-mail", "logo após o pagamento"],
        [ShieldCheck, "7 dias para desistir", "volta pelo mesmo meio"],
        [CreditCard, "Pix ou cartão", "checkout seguro da Cakto"],
        quarto,
      ];
  return (
    <ul className={`prova ${className}`.trim()} aria-label="Como funciona a compra">
      {itens.map(([Icone, t, d]) => (
        <li key={t}>
          <Icone size={20} strokeWidth={1.75} aria-hidden />
          <div><b>{t}</b><span>{d}</span></div>
        </li>
      ))}
    </ul>
  );
}
