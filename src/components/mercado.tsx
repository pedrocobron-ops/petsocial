import { MERCADO } from "@/lib/mercado";

/**
 * "O mercado pet no Brasil": números grandes, cada um com a fonte e o link (linha Negócios).
 * No hub vão os 4; na página de vendas, 3 (sem o ranking mundial), com título curto.
 */
export function FaixaMercado({ hub = false, children }: { hub?: boolean; children?: React.ReactNode }) {
  const itens = hub ? MERCADO : MERCADO.filter(([n]) => n !== "3º");
  return (
    <section className="secao secao-escura fatos-fonte mercado-sec" aria-labelledby="mercado-titulo">
      <div className="container">
        <div className="cab cab-lado rv">
          <div>
            <span className="rotulo">O mercado pet no Brasil</span>
            {hub ? (
              <h2 id="mercado-titulo">Um mercado grande, <em>que segue crescendo.</em></h2>
            ) : (
              <h2 id="mercado-titulo">Tem espaço para <em>quem atende bem.</em></h2>
            )}
          </div>
          <p>
            {hub
              ? "Números públicos, com a fonte em cada um. Eles não garantem venda para ninguém. Mostram que muita gente cuida do seu pet e paga por isso."
              : "O setor cresce e mais gente abre o próprio negócio pet. Número com fonte, não promessa."}
          </p>
        </div>
        <ul className={`fatos-fonte-lista${hub ? "" : " fatos-fonte-3"}`}>
          {itens.map(([n, frase, fonte, url]) => (
            <li key={n} className="rv">
              <b className="num">{n}</b>
              <p>{frase}</p>
              <a href={url} target="_blank" rel="noopener noreferrer">Fonte: {fonte}</a>
            </li>
          ))}
        </ul>
        {children}
      </div>
    </section>
  );
}
