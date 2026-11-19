import { Link2Off } from "lucide-react";
import "@/app/(gestao)/gestao/agendar/[codigo]/agendar.css";

/**
 * O que o tutor vê quando o link que o pet shop mandou (boletim, álbum, entrada, página do tutor, orçamento, autorização)
 * está errado, foi trocado ou já passou do prazo. Sem o Mozart e sem link para o site: o tutor veio do WhatsApp do pet shop,
 * e é para lá que ele volta. A resposta continua sendo 404 (fora dos buscadores).
 */
export default function LinkQueNaoAbre() {
  return (
    <div className="g-lk">
      <main className="g-lk-miolo">
        <div className="g-lk-fim" data-teste="link-que-nao-abre">
          <span className="g-lk-fim-ico" aria-hidden><Link2Off /></span>
          <h1>Este link não abre mais</h1>
          <p className="g-muted">Os links que o pet shop manda valem por um tempo, e este já saiu do ar ou está incompleto.</p>
          <p><b>Peça outro ao pet shop.</b></p>
          <p className="g-muted">É só responder a mensagem em que o link chegou.</p>
        </div>
      </main>
    </div>
  );
}
