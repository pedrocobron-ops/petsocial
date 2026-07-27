/**
 * IndexNow: avisa os buscadores no instante em que uma matéria entra no ar,
 * em vez de esperar o robô passar. Vale sobretudo para notícia, onde uma
 * matéria indexada horas depois já perdeu a corrida.
 *
 * O protocolo é aberto e o mesmo aviso alimenta Bing, Yandex, Seznam e Naver.
 * A prova de propriedade é o arquivo em /{CHAVE}.txt, servido a partir de
 * public/ e contendo a própria chave. Ela não é segredo: fica publicada no
 * site de propósito, é assim que o buscador confere que o aviso veio de quem
 * controla o domínio.
 */

export const INDEXNOW_KEY = "1ef3015007c3db05b3d3c4981cf91943";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

/**
 * Dispara o aviso. Nunca lança: indexação é acessório, e uma falha aqui não
 * pode derrubar a publicação de uma matéria.
 */
export async function avisarIndexNow(urls: string[]): Promise<void> {
  const lista = urls.filter(Boolean);
  if (lista.length === 0) return;

  const host = new URL(SITE_URL).host;

  try {
    await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: lista,
      }),
      // O buscador responde rápido; se travar, não vale segurar a resposta
      // da Redação esperando.
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Silêncio proposital: ver comentário acima.
  }
}
