import Image from "next/image";
import Link from "next/link";
import { getCategories } from "@/lib/news";
import { ANIMAIS } from "@/lib/animais";

export default async function SiteFooter() {
  const categorias = await getCategories();
  const ano = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <span className="face">
                <Image src="/mozart/rosto.png" alt="" width={44} height={44} />
              </span>
              <span className="nome">Maestro Pet</span>
            </div>
            <p className="footer-desc">
              Jornalismo dedicado ao universo pet: saúde, comportamento,
              nutrição, adoção e curiosidades — com a curadoria carinhosa do
              Mozart, nosso border collie editor-chefe.
            </p>
          </div>

          <div className="footer-col">
            <h4>Editorias</h4>
            <ul>
              {categorias.map((c) => (
                <li key={c.id}>
                  <Link href={`/categoria/${c.slug}`}>{c.name}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-col">
            <h4>Por animal</h4>
            <ul>
              {ANIMAIS.map((a) => (
                <li key={a.slug}>
                  <Link href={`/animal/${a.slug}`}>{a.emoji} {a.nome}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-col">
            <h4>Institucional</h4>
            <ul>
              <li><Link href="/sobre">Sobre o Maestro Pet</Link></li>
              <li><Link href="/contato">Contato</Link></li>
              <li><Link href="/principios-editoriais">Princípios Editoriais</Link></li>
              <li><Link href="/creditos-de-imagem">Créditos de Imagem</Link></li>
              <li><Link href="/politica-de-privacidade">Política de Privacidade</Link></li>
              <li><Link href="/termos-de-uso">Termos de Uso</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {ano} Maestro Pet — Todos os direitos reservados.</span>
          <span>
            Conteúdo informativo: não substitui a consulta com um médico-veterinário.
          </span>
        </div>
      </div>
    </footer>
  );
}
