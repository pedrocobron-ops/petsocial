# Maestro Pet — Jornal do Universo Pet 🐾📰

Portal de notícias sobre o universo pet (cães, gatos e companhia), construído
para **performance no Google** e monetização com **Google AdSense**.

- **Site:** [maestropet.com](https://maestropet.com)
- **Mascote:** Mozart, o border collie editor-chefe 🐶

## Stack

- **Next.js 15** (App Router, renderização no servidor + ISR) — HTML pronto
  para o Google indexar, atualizado a cada 5 minutos sem rebuild.
- **Supabase** (Postgres) — o CMS: matérias ficam nas tabelas `news_articles`
  e `news_categories` (leitura pública via RLS).
- **TypeScript** · CSS puro (design system próprio, tipografia de jornal).

## SEO embutido

| Recurso | Onde |
|---|---|
| Meta tags + Open Graph + Twitter Card | `layout.tsx` e `generateMetadata` por página |
| Dados estruturados `NewsArticle` (JSON-LD) | página da matéria |
| `sitemap.xml` automático | `src/app/sitemap.ts` |
| `robots.txt` | `src/app/robots.ts` |
| Feed RSS | `/rss.xml` |
| `ads.txt` (AdSense) | `/ads.txt` — gerado da env `NEXT_PUBLIC_ADSENSE_CLIENT` |
| URLs canônicas e limpas | `/noticias/[slug]`, `/categoria/[slug]` |

## Como rodar localmente

```bash
npm install
npm run dev        # abre em http://localhost:3000
```

Não precisa configurar nada: a conexão com o Supabase usa a chave pública
(anon), que é segura para exposição — o banco é protegido por Row Level
Security e só serve matérias com `status = 'published'`.

## Publicar (Vercel)

1. Importe este repositório em [vercel.com/new](https://vercel.com/new).
2. Framework: **Next.js** (detectado sozinho). Deploy.
3. Aponte o domínio `maestropet.com` no painel da Vercel.

### Ligar o AdSense (quando a conta for aprovada)

Na Vercel → Settings → Environment Variables, adicione:

```
NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-SEU-ID-AQUI
```

Redeploy — os blocos de anúncio e o `/ads.txt` ligam automaticamente.

## Onde está o app antigo (rede social)?

O aplicativo social original do Maestro Pet está preservado na branch
[`legado-app-rede-social`](../../tree/legado-app-rede-social). O banco de
dados no Supabase é compartilhado — nada foi apagado.

## Publicar uma nova matéria

Inserir uma linha em `news_articles` no Supabase com `status='published'`
(via painel do Supabase ou automação). O site atualiza sozinho em até 5
minutos. Campos principais: `slug`, `title`, `dek` (subtítulo), `cover_url`,
`body` (parágrafos separados por linha em branco), `category_id`,
`published_at`, `is_featured`.
