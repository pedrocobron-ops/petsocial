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

## Maestro Pet Gestão (`/gestao`)

Sistema por assinatura para pet shops, dentro deste site. Fica fora do Google (`noindex`) e sem link no site até o lançamento.

| Rota | O que é |
|---|---|
| `/gestao` | Página de apresentação do produto |
| `/gestao/criar-conta`, `/gestao/entrar`, `/gestao/recuperar` | Cadastro (7 dias grátis, sem cartão), login e senha |
| `/gestao/app/*` | O aplicativo do pet shop: Hoje, Agenda, Clientes e pets, Creche e hotel, Pacotes, Caixa, Financeiro, Relatórios, Estoque, Equipe, Meu pet shop, Assinatura |
| `/gestao/admin` | Painel interno da Maestro Pet (só para quem está na tabela `admins`) |
| `/gestao/agendar/<código>` | Link público de agendamento: o tutor pede um horário e a equipe aceita ou recusa (liga em Meu pet shop) |
| `/api/gestao/assistente` | O Mozart (assistente): entende o pedido, consulta e propõe ações; só grava depois do "Confirmar" |
| `/api/gestao/cakto` | Aviso de pagamento da Cakto (webhook): libera ou bloqueia a assinatura |

Como as telas são feitas: `src/components/gestao/LEIAME.md`. Banco (tabelas e regras de acesso): `supabase/migrations/`.

### Variáveis de ambiente (Vercel)

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Endereço do projeto no Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública do Supabase (a proteção é a regra do banco, RLS) |
| `ANTHROPIC_API_KEY` | Chave da IA do Mozart e da Ajuda. Segredo: só na Vercel, nos ambientes Production e Preview. Depois de criar ou trocar, é preciso uma publicação nova para valer |
| `GESTAO_MODELO` | Modelo do Mozart (padrão `claude-haiku-5-5`) |
| `GESTAO_AJUDA_MODELO` | Opcional. Modelo da Ajuda (dúvidas de uso; padrão `claude-haiku-5-5`). Sem a chave da IA, a Ajuda responde pelo guia em `src/lib/gestao/ajuda.ts` |
| `GESTAO_ASSISTENTE_LIMITE_DIA` | Pedidos ao Mozart por pet shop por dia (padrão 150) |
| `NEXT_PUBLIC_GESTAO_CHECKOUT_SOLO`, `_EQUIPE`, `_PETSHOP` | Link do checkout de cada plano na Cakto. Os planos e preços ficam em `src/lib/gestao/planos.ts` |
| `GESTAO_CAKTO_PRODUTO` | Id do produto na Cakto: eventos de outros produtos são ignorados |

### Para colocar no ar

1. Criar o projeto no Supabase (plano com backup) e aplicar `supabase/migrations/`. Manter a confirmação de e-mail ligada e configurar o envio de e-mail (SMTP).
2. Preencher as variáveis acima na Vercel.
3. Na Cakto: criar o produto de assinatura mensal com uma oferta por plano (Solo, Equipe e Pet shop) e ligar cada oferta ao plano: `insert into config_interna values ('cakto_oferta_<id da oferta>', 'solo');` (ou `equipe`, `petshop`). Criar também um webhook para `https://maestropet.com/api/gestao/cakto` com os eventos de compra e de assinatura. Guardar o segredo do webhook no banco, só como hash:
   `insert into config_interna values ('cakto_segredo_sha256', encode(extensions.digest('<segredo>', 'sha256'), 'hex'));`
4. Dar acesso ao painel interno: `insert into admins (user_id) select id from auth.users where email = '<e-mail>';`

### Rodar localmente

`npx supabase start` (precisa de Docker) sobe o banco com as migrations; copie o endereço e a chave pública para `.env.local` e rode `npm run dev`.
