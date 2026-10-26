import Link from "next/link";
import { Instagram, Lock, Mail } from "lucide-react";
import { LogosPagamento } from "@/components/pagamento";
import { EMPRESA, identificacao, linkInstagram, linkWhatsapp } from "@/lib/empresa";

/** Caixa "Checkout seguro da Cakto" (brief 20, 6.14 item 8), logo abaixo do botão de compra da oferta. */
export function Selos() {
  return (
    <div className="cakto">
      <b><Lock size={16} strokeWidth={1.75} aria-hidden /> Checkout seguro da Cakto</b>
      <LogosPagamento />
      <p>A Cakto é uma plataforma brasileira de pagamento. Nós não vemos os dados do seu cartão. O valor final aparece no checkout antes de você confirmar.</p>
    </div>
  );
}

/** O passo a passo do que acontece depois de pagar, para quem tem medo de comprar on-line. */
export function DepoisDaCompra({ item }: { item: string }) {
  const wa = linkWhatsapp();
  return (
    <section className="secao depois-compra">
      <div className="container">
        <span className="eyebrow">Sem surpresa</span>
        <h2>O que acontece depois que você paga</h2>
        <ol className="depois-passos">
          <li><b>Você paga na Cakto</b><span>Pix ou cartão, numa página segura. O valor final aparece antes de você confirmar. Nós não vemos os dados do seu cartão.</span></li>
          <li><b>Chega um e-mail com o acesso</b><span>Em poucos minutos, no e-mail que você informou. Se não aparecer, olhe o spam e a aba Promoções.</span></li>
          <li><b>Você baixa e guarda</b><span>Abra {item} no celular ou no computador, salve uma cópia e, se quiser, imprima.</span></li>
          <li><b>Não gostou? 7 dias para desistir</b><span>Peça o reembolso pelo e-mail da Cakto ou para {EMPRESA.email}. Devolvemos 100%, no Pix ou no cartão.</span></li>
        </ol>
        <p className="depois-ajuda">
          <Mail size={16} aria-hidden /> Problema com o acesso? Escreva para <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>
          {wa && <> ou chame no <a href={wa}>WhatsApp</a></>}. Respondemos em até 2 dias úteis.
        </p>
      </div>
    </section>
  );
}

/** Quem faz e como: método, fontes e onde ver a marca fora do site. */
export function QuemFaz({ negocios }: { negocios: boolean }) {
  const ig = linkInstagram();
  const id = identificacao();
  const f = EMPRESA.fundador;
  return (
    <section className="secao quem-faz">
      <div className="container">
        <span className="eyebrow">Quem faz</span>
        <h2>Como fazemos os materiais</h2>
        <ul className="quem-faz-lista">
          <li><b>Pesquisa com fonte e data.</b> Leis, preços e dados de mercado vêm de órgãos oficiais, entidades do setor e imprensa especializada, citados no próprio material.</li>
          {negocios ? (
            <li><b>Sem promessa de renda.</b> As contas são exemplos marcados como exemplo. Impostos e contratos do seu caso, com um contador ou advogado.</li>
          ) : (
            <li><b>Reforço positivo e veterinário primeiro.</b> Nada de castigo. Quando um comportamento pode ter causa de saúde, o guia manda consultar o veterinário.</li>
          )}
          <li><b>Sem depoimento inventado.</b> Preferimos mostrar as páginas de verdade a inventar elogios.</li>
        </ul>
        <p className="quem-faz-links">
          {f.nome ? <>Feito por <b>{f.nome}</b>, {f.papel}. </> : null}
          <Link href="/sobre">Conheça a Maestro Pet</Link>
          {ig && <> · <a href={ig} rel="noopener noreferrer"><Instagram size={15} aria-hidden /> @{EMPRESA.instagram}</a></>}
          {" · "}<Link href="/contato">Fale com a gente</Link>
        </p>
        {id && <p className="quem-faz-id">{id}</p>}
      </div>
    </section>
  );
}
