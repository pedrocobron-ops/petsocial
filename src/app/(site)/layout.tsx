import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { AdSenseLoader } from "@/components/ad-slot";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

// Dados estruturados do veículo (Google News / rich results)
const organizacaoLd = {
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  name: "Maestro Pet",
  alternateName: "Maestro Pet — Jornal do Universo Pet",
  url: SITE_URL,
  logo: {
    "@type": "ImageObject",
    url: `${SITE_URL}/logos/logo-horizontal-1000x120.png`,
    width: 1000,
    height: 120,
  },
  // Perfis oficiais. É por aqui que o buscador liga o site à marca que já
  // existe fora dele, em vez de tratar os dois como coisas sem relação.
  sameAs: ["https://www.instagram.com/maestro_pet_/"],
  // Propriedades que o Google usa para aferir a seriedade de um veículo de
  // notícias. Apontam para páginas que já existem e descrevem como o jornal
  // apura, corrige e assina o que publica.
  publishingPrinciples: `${SITE_URL}/principios-editoriais`,
  ethicsPolicy: `${SITE_URL}/principios-editoriais`,
  masthead: `${SITE_URL}/sobre`,
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "editorial",
    email: "contato@maestropet.com",
  },
};

const siteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Maestro Pet",
  url: SITE_URL,
  inLanguage: "pt-BR",
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizacaoLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(siteLd) }}
      />
      <AdSenseLoader />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
