import Image from "next/image";
import Link from "next/link";
import { PRODUTOS } from "@/lib/produtos";

export default function SiteFooter() {
  return (
    <footer className="rodape">
      <div className="container rodape-grid">
        <div>
          <div className="marca marca-clara">
            <Image src="/mozart/rosto.png" alt="" width={40} height={40} />
            <span>Maestro<em>Pet</em></span>
          </div>
          <p>Guias práticos para tutores de cães e gatos, com o carinho e a paciência do Mozart, nosso border collie.</p>
        </div>
        <div>
          <h4>Guias</h4>
          <ul>
            {PRODUTOS.map((p) => (
              <li key={p.slug}>{p.lancado ? <Link href={`/${p.slug}`}>{p.nome}</Link> : <span>{p.nome} <small>(em breve)</small></span>}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Institucional</h4>
          <ul>
            <li><Link href="/sobre">Sobre</Link></li>
            <li><Link href="/contato">Contato e suporte</Link></li>
            <li><Link href="/termos-de-uso">Termos de uso</Link></li>
            <li><Link href="/politica-de-privacidade">Política de privacidade</Link></li>
          </ul>
        </div>
      </div>
      <div className="container rodape-legal">
        <p>
          Os guias do Maestro Pet têm caráter educativo e não substituem a avaliação de um(a) médico(a)-veterinário(a).
          Pagamentos processados pela Cakto. © {new Date().getFullYear()} Maestro Pet.
        </p>
      </div>
    </footer>
  );
}
