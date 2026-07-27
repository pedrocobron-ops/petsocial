import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a redação do Maestro Pet.",
  alternates: { canonical: "/contato" },
};

export default function ContatoPage() {
  return (
    <div className="prose">
      <h1>Contato</h1>
      <p>
        Tem uma pauta, sugestão, correção ou proposta de parceria? A redação do
        Maestro Pet adora receber mensagens (o Mozart abana o rabo a cada
        e-mail novo 🐾).
      </p>
      <h2>Fale com a redação</h2>
      <ul>
        <li>
          E-mail: <a href="mailto:contato@maestropet.com">contato@maestropet.com</a>
        </li>
      </ul>
      <p>Respondemos o mais rápido possível, geralmente em até 2 dias úteis.</p>
    </div>
  );
}
