/**
 * Renderiza o crédito de uma foto transformando o nome da licença em link
 * para o texto oficial. Licenças CC BY e CC BY-SA exigem, além do nome do
 * autor, que a licença seja indicada e vinculada.
 */

const LICENCAS: { padrao: RegExp; url: string }[] = [
  { padrao: /CC BY-SA 4\.0/i, url: "https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br" },
  { padrao: /CC BY-SA 3\.0/i, url: "https://creativecommons.org/licenses/by-sa/3.0/deed.pt-br" },
  { padrao: /CC BY-SA 2\.5/i, url: "https://creativecommons.org/licenses/by-sa/2.5/deed.pt-br" },
  { padrao: /CC BY-SA 2\.0/i, url: "https://creativecommons.org/licenses/by-sa/2.0/deed.pt-br" },
  { padrao: /CC BY-SA/i, url: "https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br" },
  { padrao: /CC BY 4\.0/i, url: "https://creativecommons.org/licenses/by/4.0/deed.pt-br" },
  { padrao: /CC BY 3\.0/i, url: "https://creativecommons.org/licenses/by/3.0/deed.pt-br" },
  { padrao: /CC BY 2\.5/i, url: "https://creativecommons.org/licenses/by/2.5/deed.pt-br" },
  { padrao: /CC BY 2\.0/i, url: "https://creativecommons.org/licenses/by/2.0/deed.pt-br" },
  { padrao: /CC BY/i, url: "https://creativecommons.org/licenses/by/4.0/deed.pt-br" },
  { padrao: /CC0/i, url: "https://creativecommons.org/publicdomain/zero/1.0/deed.pt-br" },
];

export default function Credito({ texto }: { texto: string }) {
  for (const { padrao, url } of LICENCAS) {
    const m = texto.match(padrao);
    if (m) {
      const i = m.index ?? 0;
      return (
        <>
          {texto.slice(0, i)}
          <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="credito-licenca">
            {m[0]}
          </a>
          {texto.slice(i + m[0].length)}
        </>
      );
    }
  }
  return <>{texto}</>;
}
