import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import Animacoes from "@/components/animacoes";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

const organizacaoLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Maestro Pet",
  url: SITE_URL,
  logo: `${SITE_URL}/logos/logo-quadrado-1024.png`,
  sameAs: ["https://www.instagram.com/maestro_pet_/"],
  contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: "contato@maestropet.com" },
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizacaoLd) }} />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <Animacoes />
    </>
  );
}
