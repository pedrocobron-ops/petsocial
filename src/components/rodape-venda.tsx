import Link from "next/link";
import { identificacao, linkWhatsapp } from "@/lib/empresa";
import type { Linha } from "@/lib/produtos";

/** Rodapé das páginas de venda: quem somos e as páginas institucionais, sem vitrine de outros produtos. */
export default function RodapeVenda({ linha }: { linha: Linha }) {
  return (
    <footer className="rodape rodape-venda">
      <div className="container">
        <p className="rodape-venda-marca">
          <b>Maestro Pet</b>{" "}
          {linha === "tutor"
            ? "· guias e kits para tutores de cães e gatos, e manuais para quem trabalha no mercado pet."
            : "Negócios · manuais e posts prontos para quem trabalha no mercado pet, da mesma Maestro Pet dos guias para tutores."}
        </p>
        <nav aria-label="Institucional" className="rodape-venda-links">
          <Link href="/sobre">Quem somos</Link>
          <Link href="/contato">Contato e suporte</Link>
          <Link href="/termos-de-uso">Termos de uso</Link>
          <Link href="/politica-de-privacidade">Política de privacidade</Link>
        </nav>
        <p className="rodape-legal-txt">
          {linha === "tutor"
            ? "Os guias do Maestro Pet têm caráter educativo e não substituem a avaliação de um(a) médico(a)-veterinário(a)."
            : "Os materiais têm caráter educativo e não garantem renda ou resultado. Para impostos, contratos e regras do seu ramo, procure um contador ou o órgão responsável."}{" "}
          Pagamentos processados pela Cakto. Suporte: <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>{linkWhatsapp() && <> · <a href={linkWhatsapp()}>WhatsApp (13) 99137-6169</a></>}. © {new Date().getFullYear()} Maestro Pet.
          {identificacao() && <><br />{identificacao()}</>}
        </p>
      </div>
    </footer>
  );
}
