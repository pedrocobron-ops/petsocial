import { Marca, Selo } from "./marca";
import Link from "next/link";
import { Check } from "lucide-react";

/** Moldura das telas de entrada (login, cadastro, senha): formulário de um lado, a promessa do outro. */
export default function Porta({ titulo, texto, children }: { titulo: string; texto?: string; children: React.ReactNode }) {
  return (
    <div className="g-porta">
      <aside className="g-porta-lado">
        <Marca tamanho={520} className="fundo" />
        <div className="g-porta-papo" aria-hidden>
          <div className="cab"><span className="foto"><Selo tamanho={38} /><i /></span><div><b>Mozart</b><span>online</span></div></div>
          <div className="corpo">
            <p className="eu">Marca banho da Mel sexta às dez</p>
            <p className="ele">Deixa comigo. Sexta às 10h está livre.</p>
            <div className="cartao"><b>Banho da Mel</b><span>sexta, 10h · com a Carla</span><i>Pode fazer</i></div>
          </div>
        </div>
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
