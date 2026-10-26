import Image from "next/image";
import Link from "next/link";
import Logo from "@/components/logo";
import { LogosPagamento } from "@/components/pagamento";
import { EMPRESA, identificacao, linkInstagram, linkWhatsapp } from "@/lib/empresa";
import { FEED_AREAS } from "@/lib/feed-pronto";
import { PRODUTOS, linhaDe, urlProduto } from "@/lib/produtos";
import { nomeCurto } from "@/components/vitrine";

/**
 * Rodapé único (brief 20, 6.3), para vitrines, institucionais e páginas de venda.
 * Na linha Negócios o fundo vira verde-garrafa e sai o Mozart (pelo wrapper `.negocios` ou por `main:has(.negocios)`).
 */
export default function Rodape({ linha = "tutor" }: { linha?: "tutor" | "negocios" }) {
  const guias = PRODUTOS.filter((p) => p.lancado && linhaDe(p) === "tutor");
  const manuais = PRODUTOS.filter((p) => linhaDe(p) === "negocios" && p.grupo === "comece");
  const feedLancado = FEED_AREAS.some((a) => a.lancado);
  const wa = linkWhatsapp();
  const ig = linkInstagram();
  const id = identificacao();
  return (
    <footer className={`rodape${linha === "negocios" ? " negocios" : ""}`}>
      <div className="container rodape-grade">
        <div className="rodape-marca">
          <Logo clara preguicosa />
          <p className="rodape-tag so-tutor">Guias feitos com calma, para tutores com pressa.</p>
          <p className="rodape-tag so-negocios">Manuais para quem vive do mercado pet.</p>
          <Image className="rodape-mozart so-tutor" src="/mozart/acenando-144.webp" alt="" width={72} height={72} />
        </div>
        <nav aria-label="Guias">
          <h2 className="rotulo">Guias</h2>
          <ul>
            {guias.map((p) => <li key={p.slug}><Link href={urlProduto(p)}>{p.nome}</Link></li>)}
            <li><Link href="/tutor">Todos os guias e kits</Link></li>
          </ul>
        </nav>
        <nav aria-label="Manuais">
          <h2 className="rotulo">Manuais</h2>
          <ul>
            {manuais.map((p) => <li key={p.slug}><Link href={urlProduto(p)}>{nomeCurto(p.nome)}</Link></li>)}
            {feedLancado && <li><Link href="/negocios/feed-pronto">Feed Pronto</Link></li>}
          </ul>
        </nav>
        <nav aria-label="Ajuda">
          <h2 className="rotulo">Ajuda</h2>
          <ul>
            <li><Link href="/contato#acesso">Como recebo</Link></li>
            <li><Link href="/contato#reembolso">Reembolso em 7 dias</Link></li>
            <li><Link href="/contato#acesso">Não achei o e-mail</Link></li>
            <li><Link href="/contato">Fale com a gente</Link></li>
          </ul>
        </nav>
        <nav aria-label="Maestro Pet">
          <h2 className="rotulo">Maestro Pet</h2>
          <ul>
            <li><Link href="/sobre">Quem faz</Link></li>
            <li><a href={`mailto:${EMPRESA.email}`}>Contato</a></li>
            {ig && <li><a href={ig} rel="noopener noreferrer">Instagram</a></li>}
            {wa && <li><a href={wa}>WhatsApp</a></li>}
          </ul>
        </nav>
      </div>
      <div className="container rodape-legal">
        {id && <p>{id}</p>}
        <p className="rodape-cakto">Pagamentos processados pela Cakto <LogosPagamento /></p>
        <p className="rodape-links"><Link href="/termos-de-uso">Termos de uso</Link><Link href="/politica-de-privacidade">Política de privacidade</Link></p>
        <p className="so-tutor rodape-aviso">Os guias do Maestro Pet têm caráter educativo e não substituem a avaliação de um(a) médico(a)-veterinário(a).</p>
        <p className="so-negocios rodape-aviso">Os manuais têm caráter educativo e não garantem renda ou resultado. Para impostos, contratos e regras do seu ramo, procure um contador ou o órgão responsável.</p>
        <p>© {new Date().getFullYear()} Maestro Pet</p>
      </div>
    </footer>
  );
}
