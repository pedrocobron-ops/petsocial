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
| `/filhote` | Página de vendas do guia **Filhote Sem Caos** |
| `/petiscos` | Página de vendas do livro de receitas **Petiscos do Maestro** |
| `/tedio` | Página de vendas do guia **Cão Sem Tédio** (dois planos: Básico e Kit Completo). Ainda fora da vitrine e do Google (`lancado: false`) |
| `/fogos` | Guia grátis **Plano Anti-Fogos**, com cadastro |
| `/sobre`, `/contato` | Institucional e suporte |
| `/termos-de-uso`, `/politica-de-privacidade` | Exigidas pela Cakto e pelo Meta Ads |

As URLs antigas do jornal e da rede social redirecionam (301) para a página inicial — ver `next.config.ts`.

## Produtos

Tudo fica em `src/lib/produtos.ts`. Para colocar um guia à venda:

1. Crie o produto na Cakto e copie o link de pagamento (`https://pay.cakto.com.br/...`).
2. Cole o link no campo `checkout` do produto. Enquanto estiver vazio, o botão aparece como "Em breve".
3. Para lançar um guia novo, escreva o conteúdo da página de vendas em `src/lib/vendas/<slug>.ts`
   (mesmo formato de `xixi.ts`), registre em `src/lib/vendas/index.ts` e marque `lancado: true` no catálogo.
   A rota `/<slug>` é gerada automaticamente. Enquanto `lancado` for `false`, a página abre pelo link, mas fica
   fora da vitrine, do sitemap e do Google (`noindex`).
4. **Guia com dois planos** (ex.: Cão Sem Tédio): em vez de `checkout`, preencha `ofertas` no catálogo, cada uma com
   `id`, `nome`, `preco`, `checkout` e, na principal, `destaque: true`. O texto de cada plano fica na página de vendas,
   em `oferta.planos`, pelo mesmo `id`. Oferta sem link aparece como "Em breve".

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
