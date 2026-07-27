/*
 * ads.txt exigido pelo Google AdSense.
 * Gera o conteúdo automaticamente a partir de NEXT_PUBLIC_ADSENSE_CLIENT
 * (ex.: ca-pub-1234567890123456) quando a conta for aprovada.
 */
export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
  const pub = client.replace(/^ca-/, ""); // "ca-pub-123..." -> "pub-123..."
  const body = pub ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n` : "";
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
