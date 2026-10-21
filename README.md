# Maestro Pet — Loja de guias

Site do [maestropet.com](https://maestropet.com): loja de guias digitais (low-ticket) para tutores de cães e
gatos, apresentados pelo Mozart, o border collie da marca. O pagamento, a entrega e a área de membros ficam
na **Cakto**; este site tem a vitrine e as páginas de vendas.

## Stack

- **Next.js 15** (App Router, páginas estáticas) · TypeScript · CSS próprio
- Hospedagem na **Vercel**

## Páginas

| Rota | O que é |
|---|---|
| `/` | Vitrine com todos os guias |
| `/xixi` | Página de vendas do guia **Xixi no Lugar Certo** |
| `/sobre`, `/contato` | Institucional e suporte |
| `/termos-de-uso`, `/politica-de-privacidade` | Exigidas pela Cakto e pelo Meta Ads |

As URLs antigas do jornal e da rede social redirecionam (301) para a página inicial — ver `next.config.ts`.

## Produtos

Tudo fica em `src/lib/produtos.ts`. Para colocar um guia à venda:

1. Crie o produto na Cakto e copie o link de pagamento (`https://pay.cakto.com.br/...`).
2. Cole o link no campo `checkout` do produto. Enquanto estiver vazio, o botão aparece como "Em breve".
3. Para lançar um guia novo, marque `lancado: true` e crie a página `src/app/(site)/<slug>/page.tsx`.

## Variáveis de ambiente (Vercel)

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL canônica (padrão: `https://maestropet.com`) |
| `NEXT_PUBLIC_META_PIXEL_ID` | Liga o Pixel da Meta em todas as páginas |
| `GOOGLE_SITE_VERIFICATION` | Verificação do Google Search Console |

## Rodar localmente

```bash
npm install
npm run dev   # http://localhost:3000
```
