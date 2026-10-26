import Image from "next/image";
import Link from "next/link";
import { Instagram, Lock } from "lucide-react";
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

/** "O que acontece depois que você paga" (6.17): 4 passos numerados com filetes. */
export function DepoisDaCompra({ item }: { item: string }) {
  const wa = linkWhatsapp();
  return (
    <section className="secao depois-compra">
      <div className="container">
        <div className="cab rv">
          <span className="rotulo">Sem surpresa</span>
          <h2>O que acontece <em>depois que você paga.</em></h2>
        </div>
        <ol className="passos4">
          <li className="rv"><span className="passo-n" aria-hidden>1</span><b>Você paga na Cakto</b><span>Pix ou cartão, numa página segura. O valor final aparece antes de você confirmar.</span></li>
          <li className="rv"><span className="passo-n" aria-hidden>2</span><b>Chega um e-mail com o acesso</b><span>Em poucos minutos, no e-mail que você informou.</span></li>
          <li className="rv"><span className="passo-n" aria-hidden>3</span><b>Você baixa e guarda</b><span>Abra {item} no celular ou no computador, salve uma cópia e, se quiser, imprima.</span></li>
          <li className="rv"><span className="passo-n" aria-hidden>4</span><b>Não gostou? 7 dias para desistir</b><span>Peça o reembolso e o dinheiro volta pelo mesmo meio, no Pix ou no cartão.</span></li>
        </ol>
        <div className="depois-ajuda">
          <p>Problema com o acesso? <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>{wa && <> ou <a href={wa}>WhatsApp</a></>}. Respondemos em até 2 dias úteis.</p>
          <p>Já comprou e não achou o e-mail? Olhe o spam e a aba Promoções.</p>
        </div>
      </div>
    </section>
  );
}

/**
 * "Quem faz" (6.21). Com foto e nome do fundador: retrato em moldura e os 4 pilares.
 * Sem foto ou sem nome: vira "Como fazemos", só o título e os pilares (nunca moldura vazia nem rosto gerado).
 */
export function QuemFaz({ negocios }: { negocios: boolean }) {
  const ig = linkInstagram();
  const id = identificacao();
  const f = EMPRESA.fundador;
  const comRetrato = Boolean(f.foto && f.nome);
  const pilares: [string, string][] = negocios
    ? [
        ["Pesquisa com fonte e data", "Leis, preços e dados de mercado vêm de órgãos oficiais e entidades do setor, citados no próprio manual."],
        ["As regras certas, com o texto da norma", "O que a lei pede, com o link de cada norma, e o que confirmar com o contador."],
        ["Ferramentas para usar", "Planilhas, modelos e checklists prontos para o dia a dia do negócio."],
        ["Sem promessa de renda", "As contas são exemplos marcados como exemplo. Nenhum manual garante clientes."],
      ]
    : [
        ["Pesquisa com fonte e data", "O que está no guia vem de fontes citadas, não de achismo."],
        ["Reforço positivo, veterinário primeiro", "Nada de castigo. Quando pode ser saúde, o guia manda ao veterinário."],
        ["Sem depoimento inventado", "Preferimos mostrar as páginas de verdade a inventar elogios."],
        ["7 dias para desistir", "Se não valer a pena, o dinheiro volta pelo mesmo meio."],
      ];
  return (
    <section className={`secao quem-faz${comRetrato ? " quem-faz-retrato" : ""}`}>
      <div className="container quem-grid">
        {comRetrato && (
          <figure className="quem-foto rv"><Image src={f.foto} alt={`${f.nome}, ${f.papel}`} width={800} height={1000} sizes="(max-width: 899px) 100vw, 440px" /></figure>
        )}
        <div>
          <div className="cab rv">
            <span className="rotulo">{comRetrato ? "Quem faz" : "Como fazemos"}</span>
            {comRetrato ? (
              <h2>Um tutor, um border collie e uma regra: <em>só o que dá para provar.</em></h2>
            ) : (
              <h2>Só o que dá <em>para provar.</em></h2>
            )}
            {comRetrato && <p>{f.nome}, {f.papel}</p>}
          </div>
          <ol className="pilares-n">
            {pilares.map(([t, d], i) => (
              <li key={t} className="rv"><span aria-hidden>{String(i + 1).padStart(2, "0")}</span><b>{t}</b><p>{d}</p></li>
            ))}
          </ol>
          {/* O separador é ::before do item seguinte: nunca fica sozinho no fim da linha. */}
          <ul className="quem-links">
            <li><Link href="/sobre">Conheça a Maestro Pet</Link></li>
            {ig && <li><a href={ig} rel="noopener noreferrer"><Instagram size={16} strokeWidth={1.75} aria-hidden /> @{EMPRESA.instagram}</a></li>}
            <li><Link href="/contato">Fale com a gente</Link></li>
          </ul>
          {id && <p className="quem-id">{id}</p>}
        </div>
      </div>
    </section>
  );
}
