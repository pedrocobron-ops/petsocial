import Image from "next/image";
import Link from "next/link";
import { identificacao } from "@/lib/empresa";
import { PRODUTOS, linhaDe, urlProduto } from "@/lib/produtos";

export default function SiteFooter() {
  const tutor = PRODUTOS.filter((p) => p.lancado && linhaDe(p) === "tutor");
  const negocios = PRODUTOS.filter((p) => p.lancado && linhaDe(p) === "negocios");
  return (
    <footer className="rodape">
      <div className="container rodape-grid rodape-grid-4">
        <div>
          <div className="marca marca-clara">
            <Image src="/mozart/rosto.png" alt="" width={40} height={40} />
            <span>Maestro<em>Pet</em></span>
          </div>
          <p>Conhecimento prático para quem ama pets e para quem vive deles: guias para tutores e manuais para quem trabalha no mercado pet.</p>
        </div>
        <div>
          <h4><Link href="/tutor">Para tutores</Link></h4>
          <ul>{tutor.map((p) => <li key={p.slug}><Link href={urlProduto(p)}>{p.nome}</Link></li>)}</ul>
        </div>
        <div>
          <h4><Link href="/negocios">Para negócios pet</Link></h4>
          <ul>
            {negocios.map((p) => <li key={p.slug}><Link href={urlProduto(p)}>{p.nome}</Link></li>)}
            <li><Link href="/negocios/feed-pronto">Feed Pronto (posts no Canva)</Link></li>
          </ul>
        </div>
        <div>
          <h4>Institucional</h4>
          <ul>
            <li><Link href="/sobre">Quem somos</Link></li>
            <li><Link href="/contato">Contato e suporte</Link></li>
            <li><Link href="/termos-de-uso">Termos de uso</Link></li>
            <li><Link href="/politica-de-privacidade">Política de privacidade</Link></li>
          </ul>
        </div>
      </div>
      <div className="container rodape-legal">
        <p>
          Os materiais do Maestro Pet têm caráter educativo: não substituem a avaliação de um(a) médico(a)-veterinário(a) e não garantem renda ou resultado.
          Pagamentos processados pela Cakto. Suporte: contato@maestropet.com. © {new Date().getFullYear()} Maestro Pet.
          {identificacao() && <><br />{identificacao()}</>}
        </p>
      </div>
    </footer>
  );
}
