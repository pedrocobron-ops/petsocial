import { Selo } from "./marca";
import Link from "next/link";
import { Check } from "lucide-react";

/** Moldura das telas de entrada (login, cadastro, senha): formulário de um lado, a promessa do outro. */
export default function Porta({ titulo, texto, children }: { titulo: string; texto?: string; children: React.ReactNode }) {
  return (
    <div className="g-porta">
      <aside className="g-porta-lado">
        <div className="g-pilha g">
          <h2>O pet shop organizado. E uma <em className="it">assistente</em> para fazer por você.</h2>
          <ul>
            <li><Check /> Agenda de banho e tosa, clientes, caixa e estoque em um lugar só</li>
            <li><Check /> Mande um áudio: “marca banho da Mel sexta às dez” e está marcado</li>
            <li><Check /> 7 dias grátis, sem cartão</li>
          </ul>
        </div>
      </aside>
      <main className="g-porta-form">
        <Link href="/gestao" className="logo">
          <Selo tamanho={40} tom="verde" />
          Maestro Pet Gestão
        </Link>
        <div className="g-pilha p">
          <h1>{titulo}</h1>
          {texto && <p className="g-muted">{texto}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
