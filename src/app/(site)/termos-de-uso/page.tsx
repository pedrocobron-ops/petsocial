import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termos de uso",
  alternates: { canonical: "/termos-de-uso" },
};

export default function TermosPage() {
  return (
    <div className="container prose">
      <h1>Termos de uso</h1>
      <p>Ao comprar ou usar os produtos do Maestro Pet, você concorda com estes termos.</p>
      <h2>1. Produtos</h2>
      <p>
        O Maestro Pet vende guias digitais (arquivos e conteúdos on-line) sobre cuidados e comportamento de animais de
        estimação. O acesso é pessoal e intransferível; é proibido copiar, revender ou distribuir o material.
      </p>
      <h2>2. Pagamento e entrega</h2>
      <p>
        Os pagamentos são processados pela plataforma Cakto. O acesso é liberado após a confirmação do pagamento e
        enviado ao e-mail informado na compra.
      </p>
      <h2>3. Garantia e reembolso</h2>
      <p>
        Em conformidade com o artigo 49 do Código de Defesa do Consumidor, você pode desistir da compra em até 7 dias
        e receber de volta 100% do valor pago, sem precisar justificar.
      </p>
      <h2>4. Caráter educativo</h2>
      <p>
        Os guias têm caráter educativo e não substituem a avaliação de um(a) médico(a)-veterinário(a) ou de um
        profissional de comportamento animal. Os resultados variam conforme o animal, sua saúde, idade e rotina.
        Procure um veterinário sempre que houver mudança repentina de comportamento ou sinais de dor ou doença.
      </p>
      <h2>5. Contato</h2>
      <p>Dúvidas sobre estes termos: <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>.</p>
    </div>
  );
}
