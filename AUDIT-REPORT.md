# 🔍 Maestro Pet — Relatório de Auditoria Completa

> Varredura multi-agente automática de **16 domínios** do app. Cada domínio foi lido por um agente de QA; os bugs foram verificados no código (arquivo:linha). Severidade: ALTA / MÉDIA / BAIXA. As melhorias têm impacto + esforço estimados.

> ⚠️ **Documento interno — não publicar.** Lista vulnerabilidades e detalhes internos. Está no `.gitignore` (não vai pro GitHub público). Leia local.

---

## ✅ Correções JÁ APLICADAS e no ar (deploy v28 — 06/06/2026)

Enquanto você esteve fora, apliquei só as correções **seguras e de alta confiança** (verifiquei cada uma no código antes de mexer; nada arquitetural/arriscado no site ao vivo). TypeScript limpo (exit 0), commit `5a7f190`, no ar em produção.

| # | Correção | Onde | Severidade |
|---|----------|------|-----------|
| 1 | 🔴 **LGPD — exclusão de conta estava 100% quebrada.** A RPC `delete_my_account` apagava `memorial_messages.user_id`, coluna que **não existe** (a real é `author_user_id`) → a função inteira dava rollback. **RPC corrigida e recriada no banco + verificada (`delete_rpc_fixed = true`).** | `supabase/delete-account-rpc.sql:47` + DB | ALTA |
| 2 | **Anti-abuso no ranking:** constraint `game_scores_score_range (0..100000)` — bloqueia score injetado absurdo no leaderboard público. Aplicada no banco. | `game_scores` (DB) | MÉDIA |
| 3 | **Estado otimista grudado:** PostCard e MeetupCard re-sincronizam curtida/RSVP/contadores quando a query revalida (antes ficavam errados após refresh). | `components/post-card.tsx`, `meetup-card.tsx` | MÉDIA |
| 4 | **Write-loop no banco:** o card de evolução de saúde fazia `upsert` do snapshot **a cada render**. Agora só quando o score muda de fato (dep estável por valor). | `components/health/health-score-trend.tsx` | MÉDIA |
| 5 | **Não-lidas escondidas:** `fetchUnreadMessageCount` com `last_read_at` null mostrava 0 não-lidas em conversas nunca abertas. Fallback aplicado. | `lib/queries.ts:1716` | MÉDIA |
| 6 | **Deep link de lugares quebrado:** `isValidPlaceKind` não reconhecia `restaurant/cafe/event/beach` → `?kind=restaurant` não filtrava. | `app/(app)/places/index.tsx:400` | MÉDIA |
| 7 | **Admin quebrava em id inexistente:** `adminFetchPlace` usava `.single()` → erro cru. Trocado por `.maybeSingle()` + mensagem clara. | `lib/places-admin.ts:32` | BAIXA |
| 8 | Toast de erro ao falhar curtir; feed pull-to-refresh agora atualiza patrocinados; barra de progresso do quiz alinhada com "Pergunta X/N"; 8 entidades JSX escapadas (lint). | vários | BAIXA |

## 🧭 Decisões que deixei pra VOCÊ (não mexi — não são bug, são escolha)

1. **Onde cair depois do login:** hoje vai pro **feed**; com o "celular do pet" sendo a home, talvez devesse cair no **celular**. É decisão de produto — não mudei pra não te surpreender.
2. **Assinatura Pro — cancelamento é fake (TODO no código).** Só vira problema real quando você ligar pagamento de verdade (hoje o checkout é mock). Precisa de Edge Function antes de cobrar.
3. **PII na carteirinha pública:** a query usa `select('*')` — vale expor só as colunas necessárias antes de divulgar links públicos.
4. **rules-of-hooks** em ~14 telas admin, **paginação/infinite scroll** no feed, **realtime de mensagens** sem filtro server-side, **login social** — refactors maiores, listados nos domínios abaixo.

> O detalhamento completo (todos os bugs + melhorias por domínio, com arquivo:linha) está logo abaixo. Use como backlog: o que você marcar, eu implemento na volta.

---

## Índice de domínios
- Auth & Onboarding
- Feed & Social
- Saúde (health hub)
- Perfil & Carteirinha
- Conquistas & Emocional
- Cassino / Jogos
- Lugares (guia + admin)
- Roles / Encontros
- Chat & Notificacoes
- Achados & Perdidos
- Pro / Monetizacao
- Painel Admin
- Celular do Pet & Navegacao
- Adocao
- Conta / Config / Legal
- Camada de dados

---

## Auth & Onboarding

### BUGS

1. **[ALTA] Cadastro com confirmação de email navega pra área logada sem sessão** — `providers/session-provider.tsx:50-57` + `app/(auth)/sign-up.tsx:51-52` — `signUp()` só lança em caso de `error`. Se o projeto Supabase tiver "Confirm email" ligado (padrão), `signUp` retorna sucesso **sem sessão** (`session: null`), mas o código faz `router.replace('/(app)/phone')` incondicionalmente. O `(app)/_layout.tsx:28` então vê `!session` e redireciona pra `/welcome` — o usuário cria conta e é jogado de volta pra landing sem nenhuma mensagem "confirme seu email", parecendo que o cadastro falhou. **Fix:** checar o retorno de `signUp` (retornar `data.session`/`data.user`); se não houver sessão, mostrar tela/toast "Enviamos um link de confirmação pro seu email" em vez de navegar; ou documentar/garantir que email confirmation está desligado.

2. **[ALTA] Deep link de reset de senha não tem rota no mobile** — `app/(auth)/forgot-password.tsx:29` aponta `redirectTo` pra `petsocial://reset-password`, mas **não existe** `app/reset-password.tsx` na raiz — a única tela é `app/(auth)/reset-password.tsx`. No web funciona (grupos `(auth)` são transparentes na URL, então `/reset-password` resolve), mas no app nativo o esquema `petsocial://reset-password` não casa com nenhuma rota registrada e o usuário cai em 404/tela vazia ao abrir o link do email. **Fix:** garantir que o link profundo resolve pra `(auth)/reset-password` (testar o esquema no `app.json`/linking config) ou criar uma rota raiz que redirecione.

3. **[MÉDIA] `updateUser({ password })` no reset assume sessão de recovery que pode não existir** — `app/(auth)/reset-password.tsx:31` chama `supabase.auth.updateUser({ password })` sem verificar se há sessão de recovery ativa. Se o usuário abrir a tela direto (sem vir do link, ou com token expirado / `detectSessionInUrl` falhando), `updateUser` falha com "Auth session missing"/"not authenticated" e mostra erro genérico, sem orientar a pedir novo link. O `(auth)/_layout.tsx:8-10` ainda libera essa rota mesmo deslogado, reforçando o cenário. **Fix:** ao montar, escutar `onAuthStateChange`/checar `getSession()` pra um evento `PASSWORD_RECOVERY`; se não houver sessão, mostrar estado "Link inválido ou expirado — peça um novo" com CTA pra forgot-password.

4. **[MÉDIA] Destinos de redirect pós-login inconsistentes (`/phone` vs `/(tabs)`)** — `app/index.tsx:18`, `sign-in.tsx:41`, `sign-up.tsx:52` e `reset-password.tsx:34` mandam pra `/(app)/phone` (a "tela base" intencional, per comentário em `(app)/_layout.tsx:12-16`), mas `welcome.tsx:16` e `(auth)/_layout.tsx:10` mandam pra `/(app)/(tabs)` (o feed). Resultado: dependendo do caminho de entrada (já-logado abrindo welcome vs. acabou de logar), o usuário cai em telas diferentes, e quem entra logado pelo welcome pula a "home celular" que é o conceito central do produto. **Fix:** padronizar todos os redirects pós-auth pra `/(app)/phone`.

5. **[MÉDIA] "Mandar de novo" no forgot-password dispara reset com email potencialmente stale e sem await** — `app/(auth)/forgot-password.tsx:54-62` o botão "Mandar de novo" faz `setSent(false); onSubmit();`. Como `onSubmit` lê `email` do state (closure) e re-renderiza pro form, o reenvio funciona, mas (a) não há nenhum debounce/feedback (clica várias vezes = vários emails / rate-limit do Supabase), e (b) se o `resetPasswordForEmail` falhar no reenvio, o `Alert` aparece mas a UI já voltou pro formulário sem o estado "enviado". **Fix:** extrair a chamada de envio numa função própria chamada direto (sem o toggle de `sent`), com guard de `submitting` e feedback de loading no próprio botão de reenvio.

6. **[BAIXA] `globalThis.location.origin` sem guarda pode quebrar fora do web** — `app/(auth)/forgot-password.tsx:28` usa `globalThis.location.origin` no ramo `Platform.OS === 'web'`. Está protegido por `Platform.OS`, mas em SSR/prerender (o projeto tem edge functions de share-meta e meta tags server-rendered) `location` pode ser `undefined`, lançando antes do `try`. **Fix:** usar `typeof window !== 'undefined' ? window.location.origin : <fallback>` como já é feito no sign-up (`sign-up.tsx:159`).

7. **[BAIXA] `reset-password` não recebe `autoComplete="password-new"` nem confirma força adequada** — `app/(auth)/reset-password.tsx:59-69` o campo "Nova senha" usa `showStrength` mas não passa `autoComplete="password-new"` (o sign-up passa, `sign-up.tsx:102`). Gerenciadores de senha não oferecem gerar/salvar a nova senha. **Fix:** adicionar `autoComplete="password-new"` no primeiro campo e `autoComplete="password-new"` (ou `off`) no de confirmação.

8. **[BAIXA] Matching de erro por substring frágil no reset-password** — `app/(auth)/reset-password.tsx:67` e `:78` decidem em qual campo mostrar o erro com `error.toLowerCase().includes('senha')` e `error.includes('conferem')`. Erros vindos do Supabase (em inglês, ex.: "Password should be at least 6 characters") não contêm "senha" nem "conferem", então o erro de backend **não aparece em nenhum campo** — só no toast. **Fix:** separar estado de erro por campo (`passwordError`/`confirmError`) em vez de inferir por substring de uma string única.

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Login social (Google/Apple)** — fricção de email+senha é alta no onboarding mobile. `signInWithOAuth` do Supabase + botões no sign-in/sign-up aumentariam conversão de cadastro significativamente, especialmente em iOS (Sign in with Apple é exigido pela App Store se houver outros logins sociais).

2. **[impacto ALTO · esforço BAIXO] Onboarding inalcançável por quem dá "Pular"** — em `onboarding.tsx:32` o skip vai pra `/(app)/(tabs)`, mas o gate de onboarding está em `phone.tsx:508` (`pets.length === 0 → onboarding`). Quem pula cai no feed sem pet e, ao abrir o "celular", é re-redirecionado pro onboarding — loop confuso. Melhoria: persistir um flag `onboarding_skipped` (AsyncStorage) e mostrar no feed/phone um banner "Cadastre seu pet" em vez de forçar a tela de novo.

3. **[impacto ALTO · esforço BAIXO] Tratar erros do Supabase em PT-BR** — todos os fluxos (`sign-in.tsx:43`, `sign-up.tsx:54`, `reset-password.tsx:36`) exibem `e.message` cru do Supabase (inglês: "Invalid login credentials", "User already registered"). Mapear os códigos comuns pra mensagens em português melhora muito a UX num app BR.

4. **[impacto MÉDIO · esforço BAIXO] Validação de senha mais forte no cadastro** — `validators.ts:12` exige só 6 caracteres. Para um app que guarda histórico de saúde + carteirinha (dados sensíveis, LGPD), subir pra 8+ e exigir variedade (o `PasswordInput` já tem `showStrength`) reduz contas fracas.

5. **[impacto MÉDIO · esforço BAIXO] Trim/normalização de email em todos os formulários** — sign-in (`sign-in.tsx:27`) e sign-up (`sign-up.tsx:33`) passam o email direto pro schema sem `.trim()`/lowercase (só forgot-password faz `trim`). Email com espaço acidental ("voce@email.com ") gera "credenciais inválidas" inexplicáveis. Fix: `.trim().toLowerCase()` no Zod (`z.string().trim().toLowerCase().email()`).

6. **[impacto MÉDIO · esforço MÉDIO] i18n incompleto fora do sign-in** — só `sign-in.tsx` usa `useTranslation()`. `sign-up`, `forgot-password`, `reset-password` e o `onboarding` estão com strings PT-BR hardcoded, apesar de o app ter infra i18n (pt/en/es) e language picker. Migrar essas telas para `t(...)` (as chaves de `auth.signUp.*` já existem parcialmente em `locales/`).

7. **[impacto MÉDIO · esforço BAIXO] `onboarding.tsx` ignora o resultado de `signUp`/sessão e usa `session?.user.id` com `!` implícito** — `onboarding.tsx:20` (`session?.user.id`) e `phone.tsx:368` acessam `.user.id` assumindo user presente; o guard `if (!userId) return null` (`onboarding.tsx:22`) mostra tela em branco sem feedback se a sessão sumir. Trocar o `return null` por um estado de "sessão expirada → voltar pro login" evita telas mortas.

8. **[impacto BAIXO · esforço BAIXO] Acessibilidade: campos de senha e checkbox de termos** — o link "Termos de Uso"/"Política" dentro do texto do checkbox (`sign-up.tsx:156-182`) é um `<Text onPress>` aninhado sem `accessibilityRole="link"`, e o `KeyboardAvoidingView` não envolve um `ScrollView` no sign-up, então em telas pequenas o botão "Criar conta" + checkbox podem ficar atrás do teclado. Adicionar roles de link e tornar o sign-up rolável melhora acessibilidade e usabilidade em telas pequenas.

**Arquivos auditados:** `app/(auth)/sign-in.tsx`, `app/(auth)/sign-up.tsx`, `app/(auth)/forgot-password.tsx`, `app/(auth)/reset-password.tsx`, `app/(auth)/_layout.tsx`, `app/(app)/onboarding.tsx`, `app/(app)/_layout.tsx`, `app/(app)/phone.tsx`, `app/index.tsx`, `app/welcome.tsx`, `providers/session-provider.tsx`, `lib/validators.ts`, `lib/supabase.ts`.

---

## Feed & Social

### BUGS

1. **[ALTA] Comentário inline no feed não invalida o cache do detalhe nem sincroniza contadores** — `petsocial/components/post-card.tsx:178-195` — `submitComment` chama `addComment(...)` e invalida só `['feed']`. Nunca invalida `qk.comments(post.id)` nem `qk.post(post.id)`. Quem comenta pelo feed e depois abre `/post/[id]` vê a lista de comentários cacheada sem o comentário novo, e o `comments_count` do detalhe diverge do card. **Fix:** após `addComment`, `qc.invalidateQueries({ queryKey: qk.comments(post.id) })` e `qk.post(post.id)` além do feed.

2. **[ALTA] Estado otimista do PostCard nunca re-sincroniza quando o prop `post` muda** — `petsocial/components/post-card.tsx:88-89,99` — `liked`, `likesCount` e `commentsCount` são inicializados via `useState(post.liked_by_me)` etc. e nunca atualizados por `useEffect` quando o `post` muda. Depois de um refetch do feed (pull-to-refresh, invalidação após like de outra origem), o card continua mostrando o valor antigo do estado local, ignorando o dado fresco do servidor. **Fix:** adicionar `useEffect(() => { setLiked(post.liked_by_me); setLikesCount(post.likes_count); setCommentsCount(post.comments_count); }, [post.liked_by_me, post.likes_count, post.comments_count])`.

3. **[ALTA] Tela de detalhe sem loading/empty/error: usuário vê tela branca** — `petsocial/app/(app)/post/[id].tsx:159` — `if (!post) return null;` cobre 3 casos distintos com um branco infinito: (a) enquanto carrega (sem skeleton/spinner), (b) post deletado/inexistente (`fetchPost` retorna `null` via `maybeSingle`), (c) usuário logado **sem pet ativo** abrindo link compartilhado — a query está `enabled: !!id && !!activePet` (linha 84), então nunca roda e a tela fica branca pra sempre. **Fix:** tratar `postQuery.isLoading` (skeleton), `postQuery.isError` e `data === null` ("Post não encontrado") separadamente; não exigir `activePet` pra exibir o post (só pra `liked_by_me`).

4. **[MÉDIA] Post órfão sem mídia em falha parcial do create** — `petsocial/app/(app)/(tabs)/create.tsx:195-217` — o `posts.insert` e o `post_media.insert` são duas operações sequenciais sem transação. Se o insert de mídia falhar (linha 217 `throw mediaErr`), a linha em `posts` já foi criada e fica no feed sem nenhuma mídia. No feed, `MediaCarousel` retorna `null` (`media-carousel.tsx:50`) e o card aparece quebrado (header + ações, área de mídia vazia). **Fix:** em `mediaErr`, deletar o post recém-criado (`deletePost(postId)`) antes de lançar o erro; idealmente mover pra RPC transacional.

5. **[MÉDIA] `handleLike` usa `liked` capturado pelo closure → toques rápidos geram estado inconsistente** — `petsocial/components/post-card.tsx:157-176` + double-tap em `197-207` — `toggleLike(post.id, activePet.id, liked)` usa o valor de `liked` antes do `setLiked(next)`. Sem guarda de "in-flight", toques/double-taps rápidos disparam toggles sobrepostos com o mesmo `liked` defasado (ex.: dois inserts de like ou insert+delete na ordem errada). **Fix:** guardar um ref `likePendingRef` pra bloquear reentrância, ou usar a forma funcional e derivar `currentlyLiked` do estado mais recente; idealmente migrar pra `useMutation` com optimistic update + rollback.

6. **[MÉDIA] Like e comentário no detalhe sem feedback otimista e sem tratamento de erro** — `petsocial/app/(app)/post/[id].tsx:91-110` — `likeMutation` e `commentMutation` só atualizam a UI no `onSuccess` (round-trip de rede antes de qualquer reação visível), e `commentMutation` não tem `onError` (falha silenciosa; o `draft` só é limpo no sucesso, então o texto fica, mas o usuário não recebe aviso). Inconsistente com o PostCard, que é otimista. **Fix:** adicionar optimistic update no `onMutate`/rollback no `onError`, e `onError` com `Alert/toast` no `commentMutation`.

7. **[MÉDIA] Repost não invalida o cache do detalhe e permite "repost de repost"** — `petsocial/components/post-card.tsx:578-590` + `petsocial/lib/queries.ts:613-624` — após `repostPost` invalida `qk.petPosts` e `qk.feed(activePet.id)`, mas não `qk.post(post.id)` (contadores no detalhe ficam velhos). Além disso `repostPost` grava `reposted_from: originalPostId` direto: se `post.id` já for um repost, cria-se um repost apontando pra outro repost, e a cadeia `original_post` (resolvida em `hydrateRepostsAndTags`) pode não achatar pro post raiz. **Fix:** invalidar `qk.post`; e em `repostPost`/UI, usar `post.original_post?.id ?? post.id` como alvo do repost.

8. **[BAIXA] Botões de ação do feed sem `accessibilityLabel`** — `petsocial/components/post-card.tsx:380-400` (curtir/comentar/enviar/salvar via `IconAction`), botão de menu `314-323`, botão expandir `343-363` — só ícones, sem rótulo acessível. Os controles de vídeo no `media-carousel.tsx` têm `accessibilityLabel`, mas as ações principais do post não, quebrando leitor de tela. **Fix:** passar `accessibilityLabel`/`accessibilityRole="button"` em cada `IconAction` ("Curtir", "Comentar", "Compartilhar", "Salvar", "Mais opções", "Ampliar imagem").

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Feed sem paginação/infinite scroll** — `index.tsx:54-58` + `queries.ts:268` (`.limit(80)`) — o feed busca no máximo 80 posts de uma vez e não há `useInfiniteQuery`/`onEndReached`. Usuário ativo bate o teto e nunca vê mais nada. Migrar pra `useInfiniteQuery` com cursor por `created_at`.

2. **[impacto ALTO · esforço MÉDIO] Trocar like/comment do feed por `useMutation` com optimistic + rollback unificado** — hoje o PostCard reimplementa otimismo manual com `useState` solto (raiz dos bugs 2 e 5). Centralizar em mutations com `onMutate`/`setQueryData` no cache do feed elimina a dessincronização e remove o estado local duplicado.

3. **[impacto MÉDIO · esforço BAIXO] `FlatList` do feed sem tuning de performance** — `index.tsx:159-192` — falta `initialNumToRender`, `maxToRenderPerBatch`, `windowSize` e `removeClippedSubviews`. Com cards de mídia pesada (vídeos com `useVideoPlayer` por item), o scroll sofre. Ajustar esses props e considerar `getItemLayout` aproximado.

4. **[impacto MÉDIO · esforço BAIXO] Aspect ratio do carrossel multi-mídia fixado na 1ª imagem** — `media-carousel.tsx:99` — só o índice 0 reporta aspecto (`onAspect={i === 0 ? setAspect : undefined}`), então um álbum com retrato + paisagem corta os demais. Calcular altura por slide ou usar um aspecto consensual.

5. **[impacto MÉDIO · esforço MÉDIO] Pausar/liberar players de vídeo fora de vista de forma mais agressiva** — `media-carousel.tsx:257-277` — cada `VideoItem` mantém um `useVideoPlayer` vivo mesmo fora da viewport (só dá `pause`). Em feeds longos isso acumula players. Considerar desmontar o player quando `!active` por muito tempo, ou virtualizar.

6. **[impacto MÉDIO · esforço BAIXO] Limpeza de mídia órfã no Storage ao falhar/cancelar o post** — `create.tsx:187-217` — os arquivos já subiram pro bucket `posts` antes do insert; se o insert falhar, ficam órfãos no Storage (custo + lixo). Remover do bucket no `catch`.

7. **[impacto MÉDIO · esforço BAIXO] Contador de caracteres + validação de legenda no create** — `create.tsx:421-427` — `TextArea` da legenda não mostra limite nem conta caracteres (o detalhe já limita comentário a 500 em `post/[id].tsx:625`). Padronizar limite e exibir contador.

8. **[impacto BAIXO · esforço BAIXO] Replies aninhados só 1 nível e sem "responder" em reply** — `post/[id].tsx:543-561` — o botão "Responder" só aparece em comentário raiz (`!c.parent_id`), e a ordenação agrupa replies só no 1º nível. Para threads reais, permitir responder a replies (com `parent_id` apontando pra raiz) e indentação/colapso.

Arquivos auditados: `petsocial/app/(app)/(tabs)/index.tsx`, `petsocial/components/post-card.tsx`, `petsocial/components/media-carousel.tsx`, `petsocial/app/(app)/post/[id].tsx`, `petsocial/app/(app)/(tabs)/create.tsx`, com checagens cruzadas em `petsocial/lib/queries.ts` e `petsocial/lib/sponsored.ts`.

---

## Saúde (health hub)

### BUGS

1. **[ALTA] Snapshot do Score é re-gravado a cada render (write loop)** — `components/health/health-score-trend.tsx:40-48` + `app/(app)/pet/[id]/health.tsx:109` — o `useEffect` que faz `upsertHealthSnapshot` depende de `currentComponents`, mas o hub passa `currentComponents={{ components: computedScore.components }}` — um **objeto literal novo a cada render**. Logo a identidade muda sempre, o effect dispara em todo render e faz um UPDATE no banco repetidamente (toda vez que qualquer query do hub revalida/re-renderiza). Desperdício de writes e tráfego. **Fix:** memoizar o objeto (`useMemo`) no hub, ou no effect depender de um valor estável (ex: `JSON.stringify(currentComponents)` ou só `currentScore` + `thisMonth`).

2. **[ALTA] Mutations de saúde não invalidam timeline/score/summary do hub** — `app/(app)/pet/[id]/weight.tsx:38-43,102-107`, `vaccinations.tsx:116,236`, `symptoms.tsx:91,99,107` — ao adicionar/editar/excluir vacina, peso ou sintoma, só se invalida a queryKey daquela lista. O hub (`healthTimeline`, `healthSnapshots`) e, no caso de sintomas/vacinas, o `healthSummary` **não são invalidados** → a Timeline, o Score e os atalhos do hub ficam com dado velho até refetch manual. Ex.: resolver um sintoma grave não atualiza o alerta/atalho "⚠️ grave ativo" no hub. **Fix:** nas mutations, invalidar também `qk.healthSummary(id)`, `qk.healthTimeline(id)` e `qk.healthSnapshots(id)` (peso/vacina já mexem no score).

3. **[MÉDIA] Preview de Lembretes do hub ignora peso, consultas e parasitas detalhados** — `app/(app)/pet/[id]/health.tsx:117-123` — `computeHealthAlerts` é chamado só com `{ pet, summary, symptoms }`. Alertas de `weightAlerts` (variação brusca >15%, sem pesar há 90d), `vetVisitAlerts` (consulta atrasada) e parasitas reais **nunca aparecem na preview do hub** — só na tela dedicada, que recebe tudo. Resultado: contagem "Lembretes (N)" e o conteúdo divergem entre hub e `/health-alerts`, e alertas importantes de peso somem da home. **Fix:** carregar `fetchWeightRecords`/`fetchVetVisits`/`fetchParasiteTreatments` no hub (ou um RPC consolidado) e passar ao `computeHealthAlerts`, ou alinhar a fonte das duas telas.

4. **[MÉDIA] Fotos de sintoma viram órfãs no storage ao excluir** — `lib/queries.ts:1954-1957` (`deletePetSymptom`) — deleta só a linha; `photo_urls` enviadas via `uploadToBucket` nunca são removidas do bucket. Ao excluir um sintoma com fotos, os arquivos ficam pra sempre (custo + vazamento de imagem ainda acessível por URL). **Fix:** antes do delete, buscar `photo_urls` e chamar `deleteFromBucket` (já importado em symptoms.tsx) para cada uma — idealmente no mesmo fluxo da mutation.

5. **[MÉDIA] N+1 de queries em `fetchHealthSummary`** — `lib/queries.ts:2041-2057` — para cada medicação ativa dispara um `count` separado em `medication_logs` dentro de um `for`. Pet com várias medicações = várias round-trips sequenciais por carga do hub (e a função roda em todo hub/alerts/share). **Fix:** uma única query agregada em `medication_logs` filtrando por `medication_id IN (...)` e `administered_at >= dayStart`, agrupando no cliente; ou um RPC.

6. **[MÉDIA] Gráfico de peso espaça os pontos por índice, não por data** — `app/(app)/pet/[id]/weight.tsx:193-197` — `x = padX + (i / (n-1)) * innerW`. Pesagens irregulares (ex.: 3 em janeiro + 1 em dezembro) ficam equidistantes, distorcendo a evolução temporal. **Fix:** calcular `x` proporcional ao tempo real (`(weighed_at - min) / (max - min)`).

7. **[BAIXA] Delete de pesagem sem tratamento de erro** — `app/(app)/pet/[id]/weight.tsx:36-43` — `deleteMut` não tem `onError`; se o delete falhar (RLS/rede), o usuário vê "Pesagem removida" só não acontece no `onSuccess`, mas qualquer falha é silenciosa (sem toast de erro, diferente do padrão das outras telas). **Fix:** adicionar `onError: () => toast.error('Não foi possível remover')`.

8. **[BAIXA] Score de "Consultas" usa `differenceInMonths` que pode dar 0m enganoso e nunca marca `bad`** — `lib/health-score.ts:145-161` — consulta de 11 meses e 29 dias retorna `11` (ok), e mesmo com >12 meses o pior status é `warn` (50), nunca `bad`. Já a dimensão de consultas "Última > 1 ano" some o número de meses real. Inconsistente com `health-alerts.ts` que trata sênior (180d) vs adulto (365d). **Fix:** alinhar thresholds com os alertas e considerar `bad` para atraso grande (ex.: >18-24 meses).

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Consolidar dados de saúde do hub num RPC único** — hoje o hub dispara 7 `useQuery` independentes (`pet`, `summary`, `parasiteSummary`, `timeline`, `symptoms`, `snapshots`, `diet`), e `fetchHealthSummary` ainda faz N+1 interno. Um RPC `pet_health_overview(pet_id)` reduziria drasticamente round-trips, eliminaria a divergência de alertas (bug #3) e daria loading mais rápido/consistente.

2. **[impacto ALTO · esforço BAIXO] Acessibilidade nos atalhos e cards** — `ShortcutCard`, `AlertRow`, `VaccineCard`, chart SVG não têm `accessibilityRole="button"`/`accessibilityLabel`. Emojis (💉, ⚖️) são lidos crus por leitores de tela. Adicionar labels descritivos ("Vacinas, próxima Antirrábica") melhora muito a navegação assistiva.

3. **[impacto MÉDIO · esforço BAIXO] Refetch/`isError` states no hub** — o hub só trata `!summary || !pet` mostrando skeleton; se uma query falhar (ex.: timeline), a seção fica vazia sem mensagem nem retry. Adicionar empty/erro com botão "tentar de novo" e pull-to-refresh (`RefreshControl`) no ScrollView.

4. **[impacto MÉDIO · esforço MÉDIO] Editar/registrar a partir do alerta e do calendário** — `health-alerts.tsx` e `health-calendar.tsx` só navegam pra lista. Permitir ação direta (ex.: "Marcar aplicado" do parasita, "Registrar peso") via deep-link que já abre o form preenchido encurtaria o fluxo principal do produto.

5. **[impacto MÉDIO · esforço BAIXO] Validação de data futura na pesagem mobile** — `weight.tsx:355-411`: no web o `<input type="date" max={today}>` bloqueia futuro, mas no native o `TextInput` aceita qualquer string; `valid` só checa o formato `YYYY-MM-DD`, não se é futura. Bloquear datas futuras (e impossíveis) no native também.

6. **[impacto MÉDIO · esforço MÉDIO] Faixa de peso saudável por espécie/raça no gráfico** — hoje o chart só mostra a curva. Sobrepor uma banda de referência (ou pelo menos destacar variações >15% como os alertas já calculam) daria valor clínico real e conectaria com o `weight-jump` alert.

7. **[impacto BAIXO · esforço BAIXO] Tipar as rotas e remover `as never`** — `health.tsx:403,415,481`, `health-alerts.tsx:274` usam `href={... as never}`, desligando a verificação de rotas do expo-router. Tipar os hrefs (ou usar `Href` types) evita links quebrados silenciosos em refactors.

8. **[impacto BAIXO · esforço BAIXO] Empty state do hub quando saúde está 100% vazia** — quando `healthIncomplete` é true, some o trend mas o resto dos atalhos aparece sem um "comece por aqui" guiado. Um card de onboarding ("Registre a 1ª vacina/peso para ativar o Score") aumentaria ativação da feature central.

**Arquivos auditados:** `lib/health-score.ts`, `lib/health-alerts.ts`, `app/(app)/pet/[id]/health.tsx`, `app/(app)/pet/[id]/vaccinations.tsx`, `app/(app)/pet/[id]/weight.tsx`, `app/(app)/pet/[id]/symptoms.tsx`, `app/(app)/pet/[id]/health-alerts.tsx`, `app/(app)/pet/[id]/health-calendar.tsx`, `components/health/health-score-trend.tsx`, `lib/queries.ts` (funções de saúde + queryKeys).

---

## Perfil & Carteirinha

### BUGS

1. **[ALTA] Deep-link da galeria sempre abre na primeira foto** — `petsocial/app/(app)/pet/[id]/gallery.tsx:57,127` — `startIndex` é derivado de `items.length`, mas `items` vem de `postsQuery` (async) e está **vazio no primeiro render**. Logo `startIndex = clamp(N, 0, max(0, -1)) = 0` e tanto `useState(startIndex)` quanto `initialScrollIndex={startIndex}` congelam em 0. Tocar num tile do grid (`index.tsx:386`, que passa `start: String(mediaIndex)`) **nunca** abre na mídia certa — sempre cai na primeira. **Fix:** recomputar/forçar scroll quando os dados chegarem: num `useEffect([items.length])` chamar `listRef.current?.scrollToIndex({ index: startIndex, animated: false })`, e/ou só renderizar a FlatList depois de `items.length > 0` (ou usar `key` derivado pra remontar).

2. **[ALTA] Vazamento de PII na carteirinha pública (RLS + `select('*')`)** — `petsocial/lib/queries.ts:142-149` (`fetchPetByIdToken`) + `app/id/[token].tsx` — a rota pública **sem auth** faz `select('*')` na tabela `pets`, retornando ao cliente **todas** as colunas, incluindo `owner_id` (UUID do tutor, útil pra enumerar/cruzar dados), além de microchip, RGA, `sinpatinhas_id`, tipo sanguíneo, condições e endereço de contato — mesmo campos que a UI nem exibe. Qualquer um com o token (ou varrendo tokens) lê tudo via API. **Fix:** trocar por uma RPC `SECURITY DEFINER` (ou view pública) que devolve **apenas** os campos exibidos na carteirinha (nome, espécie/raça, avatar, telefones de emergência/vet, alergias, etc.) e **nunca** `owner_id`; restringir o RLS de leitura pública a essa view.

3. **[ALTA] Carteirinha pública fica desatualizada após editar (cache não invalidado)** — `petsocial/app/(app)/pet/[id]/edit.tsx:112-113` invalida só `qk.pet(pet.id)` e `qk.myPets(userId)`. A rota pública usa a queryKey `['pet-by-token', token]` (`app/id/[token].tsx:31`), que **nunca** é invalidada. Depois de trocar telefone de emergência/microchip, quem abre o QR continua vendo dado velho (até o cache expirar). **Fix:** no `onSubmit` do edit, também `qc.invalidateQueries({ queryKey: ['pet-by-token'] })` (ou a key exata se o token for conhecido).

4. **[MÉDIA] WhatsApp/`tel:` da carteirinha pública falham com números sem DDI** — `app/id/[token].tsx:66-72,59-64` — `handleWhatsApp` monta `https://wa.me/${cleaned}` com `cleaned = phone.replace(/[^\d+]/g,'')`. Se o tutor salvou "(11) 98888-7777" (formato BR comum, sem +55), o `wa.me` abre número inválido e o `.catch(() => {})` engole o erro **silenciosamente** — quem achou o pet acha que mandou msg e não mandou. **Fix:** normalizar pra E.164 (assumir +55 quando faltar DDI/DDD plausível) e, no fail, mostrar fallback (copiar número/toast) em vez de `catch` vazio.

5. **[MÉDIA] `petPosts` ignora `viewerPetId` na queryKey (colisão de cache entre pets ativos)** — `petsocial/lib/queries.ts:61` (`qk.petPosts(petId)`) + `index.tsx:60-64`/`gallery.tsx:41-45` — `fetchPostsByPet(id, activePet.id)` depende de `activePet.id` (monta o `likedSet`), mas a key só tem `petId`. Ao trocar o pet ativo, o cache do mesmo perfil é reaproveitado com estado de "curtido" do pet anterior. No grid/galeria o like não é renderizado (impacto baixo aí), mas a mesma key é compartilhada e o dado fica logicamente errado. **Fix:** incluir o viewer na key: `petPosts: (petId, viewerPetId) => ['pet-posts', petId, viewerPetId]`.

6. **[MÉDIA] `postsQuery` não habilita sem `activePet` → visitante deslogado/sem pet vê perfil sem posts** — `index.tsx:60-64` e `gallery.tsx:41-45` usam `enabled: !!id && !!activePet`. Como o perfil do pet e a carteirinha são conteúdo público (há `MetaTags type="profile"` e rota pública), um usuário sem pet ativo nunca dispara a query e vê o `EmptyState` "Sem posts ainda" mesmo havendo posts. **Fix:** desacoplar — buscar posts com `enabled: !!id` e tratar `viewerPetId` opcional (sem `likedSet` quando não há pet ativo), em vez de bloquear a query inteira.

7. **[BAIXA] `Alert.alert` não funciona no web (ações de Reportar/Bloquear inertes)** — `index.tsx:137,144` — o menu "Mais ações" e a confirmação de bloqueio usam `Alert.alert` com botões. Em React Native Web o `Alert` com múltiplos botões é no-op/limitado, então no web (PWA, que é alvo do projeto) tocar em "⋯" não abre nada útil. **Fix:** usar um ActionSheet/Modal próprio (já existe padrão de bottom-sheet em `id-card.tsx`) com fallback web, ou `confirm()` no web.

8. **[BAIXA] Aviso "Complete a carteirinha" ignora campos que a própria carteirinha destaca** — `id-card.tsx:571-577` (`missingFields`) só checa `microchip_number`, `emergency_contact_phone`, `preferred_vet_name`. Não considera `birthdate`/`breed`/`avatar_url` nem `emergency_contact_name`, então um pet sem foto/raça aparece como "completo". Além disso o `tutorQuery` pode falhar e a carteirinha mostra "Tutor(a): —" sem nenhum aviso. **Fix:** alinhar `missingFields` aos campos realmente exibidos e tratar erro do `tutorQuery` (fallback/aviso).

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] QR gerado localmente, não via `api.qrserver.com`** — `pet-id-card.tsx:57-59` depende de serviço externo (`api.qrserver.com`) pra renderizar o QR. Isso quebra offline, vaza a URL pública pra terceiros e adiciona latência/ponto de falha justamente no recurso "pet perdido". Gerar o QR client-side (ex. `react-native-qrcode-svg`/lib local) deixa a carteirinha robusta e privada.

2. **[impacto ALTO · esforço BAIXO] Token público sem rotação/revogação** — não há UI pra regenerar `id_card_token` nem desativar a carteirinha (o empty state em `[token].tsx:127` já promete "o tutor desativou", mas não existe a ação). Adicionar "gerar novo link / desativar carteirinha" é essencial: se a plaquinha for perdida/clonada, o tutor precisa invalidar o link antigo.

3. **[impacto ALTO · esforço MÉDIO] Acessibilidade: ações só por ícone sem label** — `index.tsx:341-348` (share/ellipsis), `id-card.tsx:160-166` (lápis editar) e os `Ionicons` decorativos não têm `accessibilityLabel`/`accessibilityRole`. Em leitor de tela viram botões mudos. Adicionar labels ("Compartilhar perfil", "Mais ações", "Editar carteirinha").

4. **[impacto MÉDIO · esforço BAIXO] Estado de loading do tutor na carteirinha** — em `id-card.tsx` e `[token].tsx` o card renderiza com "Tutor(a): —" enquanto `tutorQuery` carrega, depois "pula" pro nome (layout shift + parece dado faltando). Um skeleton/placeholder no bloco do tutor melhora a percepção.

5. **[impacto MÉDIO · esforço BAIXO] Botão "Ver como aparece pra quem escaneia" abre URL externa em vez de preview in-app** — `id-card.tsx:146-153` faz `Linking.openURL(publicUrl)`, tirando o tutor do app. Como a rota `/id/[token]` é interna, dava pra `router.push` e manter o usuário no app (no web abre nova aba; no native sai pro browser à toa).

6. **[impacto MÉDIO · esforço MÉDIO] `index.tsx`: cálculo O(n²) de `mediaIndex` por tile** — `index.tsx:379-380` recomputa o offset de mídia somando `media.length` de todos os posts anteriores **a cada render de cada tile**. Com muitos posts vira O(n²). Pré-computar um array de offsets cumulativos com `useMemo` (ou anexar `mediaIndex` ao montar os dados) resolve.

7. **[impacto MÉDIO · esforço BAIXO] Carteirinha não expõe link pro perfil/posts do pet** — a página pública (`[token].tsx`) é ótima pra "achei o pet", mas não tem CTA pro perfil real do pet (`/pet/[id]`) pra quem quiser ver mais. Um link discreto "Ver perfil de {nome}" aumenta engajamento e conversão pro app.

8. **[impacto BAIXO · esforço BAIXO] Limpar `as never` nas navegações** — `index.tsx:102,228,386` e `[token].tsx:130,380` usam `pathname/params as never`, mascarando tipos do expo-router e escondendo erros de rota em tempo de compilação (note que `id-card.tsx:163` já navega tipado, sem `as never` — inconsistente). Tipar as rotas corretamente recupera a checagem estática.

Arquivos auditados: `petsocial/app/(app)/pet/[id]/index.tsx`, `petsocial/app/(app)/pet/[id]/id-card.tsx`, `petsocial/app/(app)/pet/[id]/gallery.tsx`, `petsocial/app/id/[token].tsx`, `petsocial/components/pet-id-card.tsx`, `petsocial/lib/queries.ts`, `petsocial/app/(app)/pet/[id]/edit.tsx`, `petsocial/lib/types.ts`, `petsocial/lib/pet-age.ts`.

---

## Conquistas & Emocional

### BUGS

1. **[ALTA] Delete-account RPC referencia coluna inexistente `memorial_messages.user_id`** — `petsocial/supabase/delete-account-rpc.sql:47` (e idêntico em `URGENT-apply-all-pending.sql:203`) — o RPC faz `delete from public.memorial_messages where user_id = uid`, mas a coluna real é `author_user_id` (schema.sql:1190, types.ts:874). O RPC vai abortar com erro de coluna inexistente, quebrando o fluxo LGPD de exclusão de conta inteiro (a transação inteira faz rollback). **Fix:** trocar para `where author_user_id = uid` — ou simplesmente remover a linha, já que a FK `author_user_id ... on delete cascade` (schema.sql:1190) já apaga essas mensagens quando o usuário é deletado de `auth.users`.

2. **[ALTA] `petPosts` compartilha queryKey mas o `viewerPetId` varia entre telas → cache cruzado / "curtido" errado** — `birthday.tsx:39-43`, `memorial.tsx:51-55` (e qualquer outra tela) usam `queryKey: qk.petPosts(id)` porém chamam `fetchPostsByPet(id, activePet?.id ?? id)`. O segundo argumento (`viewerPetId`) define o set de likes (queries.ts:445), mas NÃO faz parte da queryKey. Logo, ao trocar de pet ativo, o cache devolve dados com `liked` calculado pro pet errado, e telas diferentes sobrescrevem o cache uma da outra. **Fix:** incluir o viewer na key, ex.: `['pet-posts', id, activePet?.id ?? id]`, ou padronizar `qk.petPosts(petId, viewerPetId)`.

3. **[MÉDIA] Confetti dispara em todo novo unlock incremental misturado com "primeiro acesso", e a comparação de IDs é frágil** — `achievements.tsx:69-83` — a lógica grava o conjunto ordenado de IDs em AsyncStorage e dispara confetti quando muda e `seen !== null`. Problema: a key `SEEN_KEY` é setada já no primeiro `getItem`/`setItem`, mas se `unlocked` ainda estiver vazio no primeiro render (query não resolveu) e depois popular, a primeira gravação pode ser `''`/lista parcial, fazendo o próximo render disparar confetti "falso" por diff. Como o efeito depende de `unlocked` (recriado a cada `query.data`), há também re-disparos enquanto a lista estabiliza. **Fix:** só rodar o efeito quando `query.isSuccess` e `unlocked` estiver estável; idealmente comparar contra um count persistido por achievement em vez de string concatenada.

4. **[MÉDIA] Falta tratamento de erro/estado em todas as mutations do memorial** — `memorial.tsx:68-92` — `sendMut`, `markMut` e `unmarkMut` têm `onSuccess` mas nenhum `onError`. Se o insert/update falhar (rede, RLS, etc.), o usuário não recebe feedback: o draft some só no success, mas em erro a UI fica silenciosa. `markPetAsMemorial`/`postMemorialMessage` fazem `throw` (queries.ts:2465/2502) sem ninguém pegar. **Fix:** adicionar `onError: (e) => toast.error(...)` nas três mutations.

5. **[MÉDIA] Telas emocionais sem loading/error state — tela "pisca" em branco** — `birthday.tsx:67` e `memorial.tsx:95` fazem `if (!pet) return null;`. Enquanto `petQuery` carrega (ou se falhar), a tela renderiza `null` — nada de spinner, nada de erro. Em conexão lenta o usuário vê tela vazia; em erro de fetch, vê vazio pra sempre. (O recap.tsx:62 trata isso corretamente com `loading`, mostrando inconsistência.) **Fix:** distinguir `isLoading` (spinner) de `isError`/`data === null` (empty/erro) em vez de `return null` genérico.

6. **[MÉDIA] "Then & Now" no aniversário usa primeira/última foto por ordem de criação, não por idade do pet** — `birthday.tsx:47-48` — `firstPostMedia = posts[posts.length-1].media[0]` (post mais antigo) e `recentPostMedia = posts[0].media[0]`. Como `fetchPostsByPet` ordena por `created_at desc` (queries.ts:436), "Primeira foto" é o post mais antigo *publicado*, que pode ser uma foto recente do pet (ex.: tutor entrou no app há 1 mês com um pet de 5 anos). O label "Olha como cresceu" (birthday.tsx:180) fica enganoso. **Fix:** ordenar por data do conteúdo/idade quando disponível, ou suavizar o copy ("Antes e agora no app").

7. **[BAIXA] `isBirthdayToday`/`birthdayYears`/`petAgeText` quebram em 29/Fev e com timezone de strings date-only** — `pet-age.ts:8,39,75` usam `new Date(birthdate)` direto. Para `birthdate` no formato `YYYY-MM-DD`, o JS interpreta como UTC meia-noite, então em fusos a oeste (BR é UTC-3) `getDate()`/`getMonth()` podem cair no dia anterior, fazendo o aniversário "atrasar" 1 dia. Além disso, pet nascido em 29/02 nunca cai como "hoje" em anos não-bissextos (aceitável, mas não tratado). **Fix:** parsear como data local (`parseISO` ou split manual `Y/M/D`) consistentemente, como o memorial já faz com `parseISO` (memorial.tsx:209).

8. **[BAIXA] Compartilhamento e Pressables sem acessibilidade** — `achievements.tsx:432` (botão share via `Ionicons` sem `accessibilityLabel`/`accessibilityRole`), `birthday.tsx:217` e `recap.tsx:90,100` (Pressables/PressScale de navegação sem label). Leitores de tela anunciam "botão" sem rótulo. **Fix:** adicionar `accessibilityRole="button"` + `accessibilityLabel` descritivo nesses controles.

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Apagar a própria mensagem de memorial** — a RLS já permite delete do próprio autor (`schema.sql:1206-1207`) e `MessageCard` (memorial.tsx:371) recebe a message inteira, mas não há UI nem mutation pra deletar. Adicionar long-press/ícone de lixeira quando `message.author_user_id === session.user.id`, invalidando `qk.memorialMessages(id)`.

2. **[impacto ALTO · esforço BAIXO] Notificação/lembrete de aniversário próximo** — `daysUntilBirthday` (pet-age.ts:73) já existe e a infra de push web está implementada (tasks 185-188). Disparar um lembrete "Faltam 3 dias pro aniversário do {pet}" agendado aumenta retorno emocional e retenção, reusando o enviador agendado existente.

3. **[impacto ALTO · esforço MÉDIO] Mostrar erro real nas conquistas (hoje some em silêncio)** — `achievements.tsx:36-45` só usa `query.data`; se `fetchAchievementInput` falhar, a tela mostra `0/0` como se o usuário não tivesse nada. Adicionar `query.isError` → empty state com retry, e `query.isLoading` → skeleton (telas de saúde já têm skeletons reutilizáveis, task 110).

4. **[impacto MÉDIO · esforço BAIXO] Skeleton no aniversário/memorial enquanto carrega** — substituir os `return null` (bugs #5) por skeletons reusa o padrão já adotado no app e evita o flash em branco numa tela de alto valor emocional (primeira impressão de share).

5. **[impacto MÉDIO · esforço MÉDIO] Memorial: campo de data de partida + nota do tutor** — o schema já tem `memorial_note` (schema.sql, types.ts:216) e `markPetAsMemorial` aceita `note` (queries.ts:2460), mas a UI sempre passa `undefined` e usa `new Date()` como data fixa (memorial.tsx:78). Permitir escolher a data real de partida e escrever uma homenagem do tutor aproveita campos que já existem no banco.

6. **[impacto MÉDIO · esforço BAIXO] Compartilhar o memorial e o recap está incompleto/ausente** — o memorial (memorial.tsx) não tem botão de compartilhar (diferente de birthday e recap que têm). Um "Compartilhar memória de {pet}" com `petUrl` reusaria `lib/share` e ajudaria a reunir mais mensagens de carinho da comunidade.

7. **[impacto MÉDIO · esforço MÉDIO] Card de conquista compartilhável como imagem (não só texto)** — `achievements.tsx:223-233` compartilha texto puro. O app já gera PNGs compartilháveis em outras features (carteirinha, prontuário, cartaz lost&found — tasks 4/17). Gerar um card visual da conquista aumenta muito o apelo de share viral.

8. **[impacto BAIXO · esforço BAIXO] Acessibilidade + `accessibilityRole="progressbar"` nas barras de progresso** — as barras em achievements.tsx (linhas 134, 312, 403) e o badge de tier são puramente visuais. Adicionar roles/labels (ex.: "Progresso 3 de 10") melhora leitura por screen reader numa tela cheia de progresso numérico.

Arquivos analisados (todos absolutos):
- `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\achievements.tsx`
- `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\pet\[id]\birthday.tsx`
- `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\pet\[id]\memorial.tsx`
- `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\pet\[id]\recap.tsx`
- `C:\Users\pedro\Downloads\pet social\petsocial\lib\queries.ts` (fetchPostsByPet, memorial fns, fetchAchievementInput)
- `C:\Users\pedro\Downloads\pet social\petsocial\lib\pet-age.ts`
- `C:\Users\pedro\Downloads\pet social\petsocial\lib\types.ts`
- `C:\Users\pedro\Downloads\pet social\petsocial\supabase\schema.sql` (memorial_messages)
- `C:\Users\pedro\Downloads\pet social\petsocial\supabase\delete-account-rpc.sql` + `URGENT-apply-all-pending.sql`

---

## Cassino / Jogos

### BUGS

1. **[ALTA] Score do quiz fica desatualizado no submit (stale closure) quando a última resposta é certa** — `quiz.tsx:44-72` — A última pergunta segue o fluxo `choose(i)` → render do card de explicação → botão "Ver resultado" → `next()`. Em `choose`, `setScore((s) => s + 10 + bonus)` é assíncrono. Como há um render intermediário (o card de explicação só aparece com `picked !== null`), o `next()` é chamado num render onde `score` JÁ reflete o ponto da última questão — então nesse caminho normal funciona. **Porém** o `Text` do resultado (`{score} pts`, linha 178) e o emoji/trophy dependem de `score` no MESMO render em que `phase` vira `'over'`: ao chamar `setPhase('over')` e ler `score` (linha 61) no mesmo batch, o snapshot de `finalScore` é o valor pré-última-questão SE o usuário pular a explicação. Confirme o caminho: não há como pular, então o risco real é menor — mas o uso de `score` cru (não ref) em `next()` é frágil. **Fix:** manter `score` num `scoreRef` (como em treats.tsx) e usar `scoreRef.current` tanto no submit quanto na tela "over", eliminando dependência de timing de render.

2. **[ALTA] Sem proteção anti-cheat / score arbitrário no `game_scores`** — `games.sql:19-21` e `lib/games.ts:27-32` — A policy de insert só valida `auth.uid() = user_id`. Qualquer usuário autenticado pode inserir `score: 999999` direto via cliente Supabase e dominar o ranking público permanentemente (`game_leaderboard` pega o melhor por user). Não há teto, rate-limit nem validação server-side. **Fix:** adicionar `check (score >= 0 and score <= <teto plausível por jogo>)`; idealmente mover a submissão para uma RPC `security definer` que valide duração mínima da partida / nonce de sessão, e/ou limitar inserts por janela de tempo.

3. **[MÉDIA] `combo` não zera ao perder item dourado já está OK, mas perder item quando combo===0 e depois ganhar não dá feedback de "perdeu" — e o `bestRef` desatualiza no fim** — `treats.tsx:84,88,157` — `bestRef.current = best` é setado a cada render, mas no fim da partida (dentro do `setInterval`, linha 157) compara-se `finalScore > bestRef.current`. Se o `best` carregado do AsyncStorage chegou DEPOIS do início da partida (efeito async, linhas 92-100), `bestRef` está correto. Mas há um caso: a comparação `score >= best` na tela de resultado (linha 282/285) usa o state `best` que pode ter sido atualizado por `setBest(finalScore)` (linha 158) — fazendo `score >= best` ser sempre true ("Novo recorde") mesmo num jogo pior, porque `best` virou o próprio score. **Fix:** capturar `const prevBest = bestRef.current` antes do `setBest`, e na tela "over" comparar com esse valor (ex.: guardar `lastWasRecord` em state) em vez de reler `best`.

4. **[MÉDIA] `fetchLeaderboard` não trata erro de RPC ausente / cache sem retry distinto; leaderboard fica em loading infinito mascarado** — `game-leaderboard.tsx:22-25` — O `useQuery` não tem `staleTime`, `retry` custom nem tratamento de `q.isError`. Se a RPC `game_leaderboard` falhar (ex.: migration não aplicada — situação que já ocorreu neste projeto, ver histórico de tasks), o componente cai no `rows.length === 0` e mostra "Ninguém pontuou ainda" — um **estado de erro disfarçado de empty state**, enganoso. **Fix:** tratar `q.isError` com mensagem "Não foi possível carregar o ranking" + botão "Tentar de novo" (`q.refetch`).

5. **[MÉDIA] Navegação com `href as never` mascara rota e desabilita type-safety** — `index.tsx:81` (`<Link href={g.href as never}>`) — O cast `as never` desliga a verificação de rota tipada do Expo Router. Se `treats.tsx`/`quiz.tsx` forem renomeados/movidos, o link quebra silenciosamente em runtime sem erro de compilação. **Fix:** tipar `href` como `Href` (`expo-router`) e remover o cast; usar caminhos literais que o Router valide.

6. **[BAIXA] Submissão de score perde silenciosamente todo erro (`.catch(() => {})`)** — `quiz.tsx:65`, `treats.tsx:164` — Falhas de rede/RLS ao salvar o placar são engolidas: o usuário acha que entrou no ranking mas não entrou, sem nenhum toast/log. **Fix:** ao menos logar (Sentry/console) e exibir toast discreto "Não deu pra salvar seu placar".

7. **[BAIXA] Barra de progresso do quiz fica em 0% na 1ª pergunta e nunca chega a 100% na última** — `quiz.tsx:113` — `width: ((index)/questions.length)*100%`. Com 10 perguntas, a barra mostra 0% na Q1 e 90% na Q10 (nunca 100% durante o jogo). UX confusa. **Fix:** usar `(index + (picked !== null ? 1 : 0)) / questions.length` ou `(index+1)/length` para refletir progresso real.

8. **[BAIXA] Acessibilidade: itens do jogo e botões de jogo sem `accessibilityLabel`/`role`** — `treats.tsx:325` (Pressable do item) e `index.tsx:82` (card de jogo) — Os `Pressable` não têm `accessibilityRole="button"` nem label; leitores de tela anunciam vazio. O emoji do item também não é anunciado. **Fix:** adicionar `accessibilityRole="button"` e `accessibilityLabel` (ex.: "Petisco", "Abelha, evite", "Jogar Quiz Pet").

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Mostrar a posição do usuário quando ele está fora do top-20** — Hoje `game_leaderboard` retorna só os 20 primeiros; quem está em 50º não se vê. Adicionar uma linha "Você: #47 · 120 pts" fixa no rodapé (RPC extra `my_rank`) aumenta retenção e o loop competitivo.

2. **[impacto ALTO · esforço BAIXO] Teto/validação de score + ranking semanal** — Além do fix de segurança, um ranking "desta semana" (reset semanal via `where created_at >= date_trunc('week', now())`) dá chance a novos jogadores e cria recorrência, em vez de um all-time que congela no topo.

3. **[impacto MÉDIO · esforço BAIXO] Estado de erro + skeleton no leaderboard** — Trocar o `ActivityIndicator` por skeleton rows e adicionar empty/error states ricos (já é padrão no resto do app, conforme histórico de tasks) deixa o ranking consistente com o restante da UI.

4. **[impacto MÉDIO · esforço MÉDIO] Persistir recorde do quiz e dar bônus por sequência** — Treats salva recorde local por pet, mas o quiz não tem recorde nem persistência. Guardar melhor pontuação do quiz e mostrar "Seu recorde: X" na tela idle incentiva o "jogar de novo".

5. **[impacto MÉDIO · esforço BAIXO] Compartilhar resultado (Web Share + PNG)** — O app já tem helpers de share/PNG (tasks de meetups/lost). Botão "Compartilhar placar" na tela "over" de ambos os jogos vira alça de growth viral barata.

6. **[impacto MÉDIO · esforço MÉDIO] Animação de combo e som/haptic escalonado no treats** — `haptic.light()` é igual pra tudo. Escalar o haptic com o combo, pulsar o contador de combo e dar um "milestone" visual a cada 10 combos aumenta o feel de cassino prometido pelo tema.

7. **[impacto BAIXO · esforço BAIXO] Aumentar o banco de perguntas e evitar repetição entre partidas** — São 26 perguntas para `N=10`; em 3 partidas o usuário já viu quase tudo. Ampliar o pool e/ou memorizar perguntas recém-vistas (AsyncStorage) mantém o quiz fresco.

8. **[impacto BAIXO · esforço BAIXO] Pausar/limpar o `setInterval` do treats ao sair da tela ou perder foco** — O loop roda a cada 100ms enquanto `phase==='playing'`; se o usuário navegar para fora sem terminar, o cleanup só ocorre no unmount. Pausar em `blur` (useFocusEffect) economiza CPU/bateria no web e evita timers órfãos.

Arquivos auditados: `C:\Users\pedro\Downloads\pet social\petsocial\lib\games.ts`, `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\games\index.tsx`, `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\games\quiz.tsx`, `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\games\treats.tsx`, `C:\Users\pedro\Downloads\pet social\petsocial\components\game-leaderboard.tsx`, `C:\Users\pedro\Downloads\pet social\petsocial\lib\pet-quiz.ts`, `C:\Users\pedro\Downloads\pet social\petsocial\supabase\games.sql`, `C:\Users\pedro\Downloads\pet social\petsocial\components\ui\button.tsx`.

---

## Lugares (guia + admin)
### BUGS
1. **[ALTA] Hooks chamados depois de `return` condicional (viola Rules of Hooks)** — `app/(app)/admin/places/index.tsx:21-24` (e idêntico em `admin/places/[id].tsx:25-29`, `new.tsx:22-23`) — os early returns `if (!session)` / `if (email !== ADMIN_EMAIL)` rodam **antes** do `useQuery`. Quando a sessão sai do estado inicial (ex.: login carrega e `session` deixa de ser null), a quantidade de hooks chamados muda entre renders → React lança "Rendered more hooks than during the previous render" e a tela quebra. **Fix:** mover toda a checagem de auth para depois de declarar todos os hooks (ou usar `enabled: !!session && isAdmin` no `useQuery` e só então renderizar `<Redirect>`).

2. **[ALTA] `adminFetchPlace` usa `.single()` — quebra em vez de tratar lugar inexistente** — `lib/places-admin.ts:31-35` — `.single()` lança erro (PGRST116) se o id não existir (ex.: lugar apagado em outra aba, link velho). A tela de edição mostra "Erro: ..." cru em vez de um empty state amigável. **Fix:** trocar por `.maybeSingle()` e retornar/render condicional de "lugar não encontrado" (o `fetchPlace` público em queries.ts:2282 já faz certo).

3. **[ALTA] `isValidPlaceKind` não reconhece metade das categorias → deep link ignorado** — `app/(app)/places/index.tsx:398-401` — a whitelist só tem `vet, pet_shop, grooming, hotel, daycare, park, training, other`, faltando `restaurant`, `cafe`, `event`, `beach`. Um deep link `?kind=cafe` (ou navegação a partir de outro lugar do app) cai no fallback `'all'` silenciosamente, e o `useEffect` de sincronização (linha 56-60) também nunca aplica. **Fix:** derivar a lista de `Object.keys(PLACE_KIND_META)` ou incluir todas as 12 categorias.

4. **[ALTA] Criação pública de lugar não envia `species` e diverge do schema admin** — `app/(app)/places/new.tsx:45-58` + `lib/queries.ts:2343-2358` — `createPlace` não tem o campo `species` no input nem no insert, enquanto a listagem filtra por espécie (`index.tsx:87-90`). Lugares criados pelo fluxo público ficam com `species` no default do banco (ou null), o que afeta o filtro. Além disso o form público não tem campo de espécie nem toggle `verified` (sempre entra como default), gerando inconsistência com o `PlaceForm` do admin. **Fix:** incluir `species` (e idealmente reusar `PlaceForm`) no fluxo público, ou documentar/forçar default consistente.

5. **[MÉDIA] Invalidação de cache incompleta no save/delete do admin — guia público não atualiza** — `admin/places/[id].tsx:36-40,56` e `new.tsx:29-32` — invalidam `['places']` (lista) mas **nunca** `['place', id]` (`qk.place`). Após editar um lugar pelo admin, a tela de detalhe público (`qk.place(id)`) continua mostrando dados velhos até refetch manual. No delete (linha 55-58) nem `['places']` nem `['place', id]` são invalidados — só `['admin-places-list']` — então o card apagado persiste no guia público em cache. **Fix:** adicionar `qc.invalidateQueries({ queryKey: qk.place(id) })` no update e incluir `['places']` + `qk.place(id)` no delete.

6. **[MÉDIA] Save de favorito sem optimistic update nem rollback — UI engana o usuário** — `app/(app)/places/[id].tsx:71-79` — `saveMut` só invalida no `onSuccess`; durante a requisição o ícone bookmark não muda, e em caso de corrida (dois toques rápidos) pode disparar insert duplicado. O `onError` mostra toast mas o estado visual nunca refletiu a intenção. **Fix:** `onMutate` com update otimista do cache `['saved-place-ids', userId]` + rollback no `onError`, e desabilitar o Pressable enquanto `saveMut.isPending`.

7. **[MÉDIA] `place_favorites` ordenado por `created_at` sem garantia de coluna/RLS** — `lib/queries.ts:2328` — `fetchSavedPlaces` faz `.order('created_at')` em `place_favorites`; se a tabela não tiver essa coluna (o insert em toggleSavePlace só grava `user_id`+`place_id`), o order lança erro e a "Minha agenda" fica vazia/quebrada. Vale confirmar o schema. **Fix:** garantir `created_at default now()` na tabela ou ordenar por outra coluna existente.

8. **[BAIXA] `placeKindMeta` com fallback redundante mas `?? 'other'` nunca dispara em string vazia** — `lib/places-meta.ts:106-107` — `PLACE_KIND_META[(kind as PlaceKind) ?? 'other']` — o `?? 'other'` só cobre `null`/`undefined`, não string desconhecida (ex.: kind novo no banco que ainda não está no map). O `?? PLACE_KIND_META.other` final salva o caso, então é mais code-smell que bug, mas o primeiro `?? 'other'` é morto. **Fix:** simplificar para `PLACE_KIND_META[kind as PlaceKind] ?? PLACE_KIND_META.other`.

### MELHORIAS
1. **[impacto ALTO · esforço MÉDIO] Filtro de espécie e busca por endereço no servidor (admin)** — `adminListPlaces` (places-admin.ts:23-29) só busca por `name`; o guia público busca name+address mas o admin não. Padronizar `.or(name,address)` e adicionar filtro por kind/cidade no admin reduz scroll em catálogos grandes (limit 300 já vai estourar).

2. **[impacto ALTO · esforço MÉDIO] Reusar `PlaceForm` no fluxo público `places/new.tsx`** — hoje há dois forms duplicados (campos, validação e categorias copiados). Unificar elimina a divergência de `species`/`verified` (bug #4) e centraliza manutenção.

3. **[impacto MÉDIO · esforço BAIXO] Empty/error state na tela de detalhe pública** — `places/[id].tsx:90` faz `if (!place || !meta) return null;` — tela em branco se o lugar não existe ou enquanto carrega. Adicionar skeleton durante `placeQuery.isLoading` e um "Lugar não encontrado" quando `data === null`.

4. **[impacto MÉDIO · esforço BAIXO] Debounce na busca do guia** — `places/index.tsx:62-67` recria a queryKey a cada tecla, disparando uma query Supabase por caractere. Um debounce de ~300ms corta requests e flicker.

5. **[impacto MÉDIO · esforço BAIXO] Acessibilidade nos chips de filtro/sort e cards** — os `Pressable` de kind/species/sort (index.tsx:151,184,220) e os `PlaceCard`/`PlaceRow` não têm `accessibilityRole="button"` nem `accessibilityState={{ selected: active }}`. Leitores de tela não anunciam o filtro ativo. (O detalhe já tem labels nos ícones de header — bom padrão a replicar.)

6. **[impacto MÉDIO · esforço BAIXO] Pull-to-refresh + tratamento de erro no guia público** — `places/index.tsx` FlatList não tem `RefreshControl` nem trata `query.isError` (só loading/empty). Se o fetch falhar, mostra empty state enganoso ("Sem lugares ainda"). Adicionar refresh e um estado de erro com retry.

7. **[impacto MÉDIO · esforço MÉDIO] Validação de UF e normalização de website/telefone no `PlaceForm`** — UF aceita qualquer string (deveria ser 2 letras), website não é validado e telefone não é mascarado. Validar UF contra lista de estados e normalizar URL melhora a qualidade do guia curado.

8. **[impacto BAIXO · esforço BAIXO] Confirmar delete com toast/route no web (admin usa `Alert.alert`)** — `admin/places/[id].tsx:47-65` usa `Alert.alert` para confirmar — no React Native Web `Alert` é limitado/inconsistente. Trocar por um modal de confirmação próprio garante o fluxo de exclusão no painel admin (que roda no browser).

Arquivos auditados: `petsocial/app/(app)/places/index.tsx`, `petsocial/app/(app)/places/[id].tsx`, `petsocial/app/(app)/places/new.tsx`, `petsocial/app/(app)/admin/places/index.tsx`, `petsocial/app/(app)/admin/places/[id].tsx`, `petsocial/app/(app)/admin/places/new.tsx`, `petsocial/components/admin/place-form.tsx`, `petsocial/lib/places-admin.ts`, `petsocial/lib/queries.ts` (funções places), `petsocial/lib/places-meta.ts`.

---

## Roles / Encontros

### BUGS
1. **[ALTA] Estado otimista do RSVP no card nunca re-sincroniza com o servidor** — `components/meetup-card.tsx:26-27` — `going` e `count` são inicializados via `useState(meetup.my_rsvp_status === 'going')` / `useState(meetup.rsvps_count)`, que só roda na montagem. Depois do `invalidateQueries(['meetups'])` (linha 38) a query refaz o fetch e as props mudam, mas o `useState` ignora as novas props. Resultado: o número de confirmados e o estado do botão ficam grudados no valor antigo (ex.: outro pet confirma e o `count` aqui não mexe; abriu o detalhe, confirmou lá, voltou pra lista e o card mostra "Vou!" desatualizado). Em `agenda.tsx:51` o mesmo card lista os "que vou" — cancelar presença ali não tira o item nem corrige a contagem até remontar a tela. **Fix:** derivar do prop em vez de espelhar em state, ou ressincronizar com `useEffect([meetup.my_rsvp_status, meetup.rsvps_count])`, ou usar `useMutation` com `onMutate` otimista no cache (`setQueryData`) em vez de `useState` local.

2. **[ALTA] Erro do RSVP do host é engolido ao criar encontro** — `app/(app)/meetup/new.tsx:73-76` — o segundo `supabase...insert({...status:'going'})` não checa `error`. Se o insert do `meetup_rsvps` falhar (RLS, conflito, rede), o encontro é criado mas o host não fica marcado como "going" — e o usuário é redirecionado pro detalhe sem nenhum aviso, vendo "Ninguém confirmou ainda" no próprio evento que criou. **Fix:** capturar e tratar o erro (`const { error: rsvpErr } = await ...; if (rsvpErr) ...`), e usar `upsert` com `onConflict: 'meetup_id,pet_id'` (consistente com `setRsvp`) pra ser idempotente.

3. **[MÉDIA] `featuredQuery` duplica a query da lista e `onRefresh` não cobre a faixa "Bombando"** — `app/(app)/(tabs)/meetups.tsx:41-45,50-54` — `featuredQuery` usa exatamente a mesma `queryKey` (`qk.meetups('upcoming')`) que a lista quando o filtro é `upcoming`, então são a mesma entrada de cache (ok), mas `onRefresh` só invalida `qk.meetups(filter)` (linha 52). Estando em qualquer aba que não seja "Próximos" (ex.: "Passados"), puxar pra atualizar não revalida a faixa "Bombando", que continua exibindo dados velhos. **Fix:** invalidar o prefixo `['meetups']` no refresh, ou invalidar explicitamente `qk.meetups('upcoming')` junto.

4. **[MÉDIA] Botão "Vou!" aparece e é clicável em encontros já passados** — `components/meetup-card.tsx:116-142` — o card não recebe nem checa se o evento já passou; no filtro "Passados" (`meetups.tsx:24`) e no histórico, o usuário ainda vê "Vou!"/"Você vai" e consegue confirmar presença num rolê que já aconteceu. O detalhe (`[id]/index.tsx:255`) esconde os CTAs quando `countdown.tone === 'past'`, mas o card não tem essa proteção. **Fix:** passar/derivar `isPast = new Date(meetup.starts_at) < Date.now()` e ocultar ou desabilitar o botão de RSVP quando passado.

5. **[MÉDIA] Rota de mapa ignora o lugar vinculado e usa só texto livre** — `app/(app)/meetup/[id]/index.tsx:70-85` + `meetup/new.tsx:66` — o encontro pode ter `place_id` (lugar do guia, com endereço/coords), mas `openMapsRoute`/`openWaze` montam o destino apenas com `encodeURIComponent(m.location_name)`. Se o `location_name` for genérico ("portão 3"), a navegação cai em lugar errado ou não encontra. **Fix:** quando houver `place_id`, buscar o place e usar `address`/lat-lng no deep link; cair pro `location_name` só como fallback.

6. **[BAIXA] `as never` na navegação de Editar esconde a tipagem da rota** — `app/(app)/meetup/[id]/index.tsx:131` — `router.push({ pathname: '/meetup/[id]/edit' as never, params: { id } as never })`. A rota existe (`meetup/[id]/edit.tsx`), então o cast duplo só mascara o type-checking do Expo Router — se a rota for renomeada, o TS não acusa. **Fix:** remover os `as never` e usar o pathname tipado `'/meetup/[id]/edit'`.

7. **[BAIXA] `featured` recalculado (sort + spread) a cada render sem memo** — `app/(app)/(tabs)/meetups.tsx:46-48` — `[...(data ?? [])].sort(...).slice(0,6)` roda em todo render do screen (inclusive ao trocar de aba ou ao digitar em outro estado). Com a lista de até 50 itens é barato, mas é trabalho desnecessário e cria novo array sempre. **Fix:** `useMemo(() => ..., [featuredQuery.data])`.

8. **[BAIXA] Contagem de "confirmados" no card vs. detalhe pode divergir** — `lib/queries.ts:395` (conta `status='going'`) vs `[id]/index.tsx:60,340` (filtra `rsvps` por `going` no cliente) — as duas fontes contam só `going`, então hoje batem; porém o `rsvps_count` da lista vem de uma query separada e o detalhe recomputa de `m.rsvps`. Em janelas de concorrência (alguém confirma entre os dois fetches) os números aparecem diferentes entre a lista e o detalhe sem invalidação cruzada imediata. **Fix:** unificar a fonte da contagem (derivar sempre de `rsvps.filter('going')`) ou invalidar `qk.meetup(id)` + `['meetups']` juntos em toda mutação de RSVP (o detalhe já faz; o card só invalida `['meetups']`, então o detalhe aberto não atualiza — ver bug #1).

### MELHORIAS
1. **[impacto ALTO · esforço MÉDIO] RSVP otimista via cache em vez de state local** — substituir o `useState` do card por `setQueryData`/`onMutate` do TanStack, eliminando os bugs #1 e #8 de uma vez e mantendo lista, faixa "Bombando", agenda e detalhe sempre coerentes.

2. **[impacto ALTO · esforço MÉDIO] Lembrete/push antes do encontro** — o app já tem infra de push web e notificações agendadas (features existentes); agendar um lembrete "seu rolê é em 1h/amanhã" pra quem deu RSVP `going` aumenta comparecimento e retenção. Gancho natural no countdown que já existe no detalhe.

3. **[impacto MÉDIO · esforço BAIXO] Mostrar o local vinculado do guia no card e no detalhe** — quando há `place_id`, exibir badge "📍 lugar do guia" com link pro `/places/[id]` (a tela de criação já vincula, mas detalhe/card não expõem isso). Reaproveita o guia pet-friendly e melhora a precisão do "Como chegar" (bug #5).

4. **[impacto MÉDIO · esforço BAIXO] Capacidade/limite e lista de "talvez"** — o schema já suporta `status: 'maybe'`, mas a UI só usa going/not_going. Expor "Talvez" no card/detalhe e, opcionalmente, um limite de vagas com contador "X/Y" dá mais sinal social e organização ao host.

5. **[impacto MÉDIO · esforço MÉDIO] Skeleton/loading state na lista e no detalhe** — `meetups.tsx:108-109` mostra `null` enquanto `isLoading` e `[id]/index.tsx:59` retorna `null` quando `!m` (cobre loading E erro). Trocar por skeletons e por um estado de erro explícito ("não rolou carregar, tentar de novo") evita tela em branco e o caso de meetup deletado/404 ficar travado em branco.

6. **[impacto MÉDIO · esforço BAIXO] Compartilhar como deep link em vez de só texto** — `handleShare` (`[id]/index.tsx:113-124`) monta um texto; incluir a URL canônica `/share/meetup/[id]` (já há infra de share-meta/OG) deixa o link clicável e rastreável, e permite abrir o evento direto.

7. **[impacto BAIXO · esforço BAIXO] Agrupar a agenda por data (Hoje / Esta semana / Depois)** — `agenda.tsx:50-51` lista os rolês confirmados em sequência simples; agrupar por proximidade temporal (padrão que o app já usa em notificações) deixa o "roteiro pet" mais legível.

8. **[impacto BAIXO · esforço MÉDIO] Paginação / "ver mais"** — `fetchMeetups` corta em `.limit(50)` (`queries.ts:387`) sem indicação ao usuário; em cidades ativas isso esconde eventos silenciosamente. Adicionar paginação por cursor de `starts_at` ou um "carregar mais" no fim da `FlatList`.

Arquivos auditados: `petsocial/app/(app)/(tabs)/meetups.tsx`, `petsocial/app/(app)/meetup/new.tsx`, `petsocial/app/(app)/meetup/[id]/index.tsx`, `petsocial/app/(app)/meetup/[id]/edit.tsx`, `petsocial/app/(app)/agenda.tsx`, `petsocial/components/meetup-card.tsx`, `petsocial/lib/queries.ts` (fetchMeetups/fetchMeetup/setRsvp/clearRsvp/deleteMeetup/qk).

---

## Chat & Notificações

### BUGS

1. **[ALTA] Realtime de mensagens vaza entre todos os usuários** — `petsocial/providers/realtime-provider.tsx:36-51` — o canal `messages:${userId}` faz subscribe em `INSERT` na tabela `messages` **sem `filter`**. Todo cliente conectado recebe um evento para **cada mensagem de qualquer conversa do app inteiro**, e dispara `invalidateQueries` em `conversations`/`unreadMessages` do próprio user a cada mensagem global. Em escala isso é refetch storm + possível vazamento de metadados (sender_id/conversation_id de terceiros chegam no payload do cliente). **Fix:** não dá pra filtrar por `conversation_id IN (...)` no Postgres CDC facilmente; assine um canal por conversa aberta, ou crie uma tabela/trigger `conversation_participants` com filtro `user_id=eq.${userId}`, ou use Broadcast por conversa. No mínimo, valide no callback se `conversation_id` pertence a uma conversa do user antes de invalidar.

2. **[ALTA] Invalidação de cache inconsistente: badge de não-lidas das mensagens não some no app inteiro** — `petsocial/app/(app)/chat/[id].tsx:92-96` e `82-85` — ao abrir/enviar, o chat invalida `qk.unreadMessages(userId)` e `qk.conversations(userId)`, mas o realtime-provider e o resto do app usam **`qk.unreadMessages`** para o badge de DMs enquanto as **notificações** usam `qk.unreadCount`. Ao marcar conversa como lida, nada reconcilia o **badge da aba/tab** se ele consumir outra key. Confirme: realtime de mensagens invalida `unreadMessages` (linha 44) — ok — mas `markConversationRead` é chamado e só invalida client-side; se o badge da tab usa `unreadCount` (notificações) ele nunca atualiza com DMs. **Fix:** padronizar uma única source para o contador de DMs e garantir que `chat/[id]` invalide exatamente essa key.

3. **[MÉDIA] `markConversationRead` no `useEffect` re-dispara a cada mensagem nova e a cada re-render** — `petsocial/app/(app)/chat/[id].tsx:89-98` — a dependência `messagesQuery.data?.length` faz o efeito rodar um `UPDATE` em `conversation_participants` **toda vez que chega/envia mensagem** (incluindo cada optimistic update, que muda o length). Isso gera writes desnecessários + invalidações em cascata (`conversations` refetch a cada keystroke-enviado). **Fix:** debounce, ou só marcar lido on-mount + on-focus (`useFocusEffect`), não a cada mudança de length.

4. **[MÉDIA] `renderMessageContent` perde URLs e/ou erra o split por estado do regex global** — `petsocial/app/(app)/chat/[id].tsx:306-332` — `URL_RE` é `/.../gi` (global, stateful) e é usado em `content.split(URL_RE)` **e** em `URL_RE.test(part)` dentro do `.map`. `String.split` com regex global já é frágil, e `.test()` sobre regex global avança `lastIndex`; embora haja resets manuais (`URL_RE.lastIndex = 0`), o reset acontece **depois** do `test` no ramo "não-URL" (linha 329) mas o `test` da linha 311 roda antes do reset — em sequências com múltiplas URLs o `lastIndex` pode estar sujo e classificar errado. **Fix:** use um regex **não-global** para o `.test()` (clone sem flag `g`), ou troque por `matchAll` para tokenizar de forma determinística.

5. **[MÉDIA] `notifications.tsx`: `useEffect` marca tudo como lido no mount mas sem tratamento de erro e com risco de loop** — `petsocial/app/(app)/notifications.tsx:78-81` — `markAllMutation.mutate()` roda no mount sempre que `userId` muda; a mutation **não tem `onError`** (linha 69-75 só tem `onSuccess`), então se o `UPDATE` falhar o usuário vê notificações "lidas" visualmente após próximo refetch mas nada avisa, e um erro silencioso. Além disso marca **tudo** como lido na abertura — não há como o usuário re-encontrar "o que era novo". **Fix:** adicionar `onError` (toast), e considerar marcar como lido só on-leave ou manter destaque visual da sessão.

6. **[MÉDIA] `onPress` da notificação tem ramo morto + falha silenciosa quando `post_id` é null** — `petsocial/app/(app)/notifications.tsx:231-245` — há **dois** `else if (n.kind === 'mention')` (linhas 242-243 são inalcançáveis: `mention` já foi tratado no primeiro `if` junto com like/comment/pet_tagged quando há `post_id`). E se um `like`/`comment`/`mention`/`pet_tagged` tiver `post_id` nulo (dado inconsistente), o `onPress` **não faz nada** — toque morto sem feedback. **Fix:** remover o segundo ramo `mention` (dead code) e adicionar fallback (ex.: navegar pro perfil do actor ou toast) quando `post_id` faltar.

7. **[BAIXA] `sendMessage` usa `.single()` — quebra com erro feio se a RLS bloquear o insert** — `petsocial/lib/queries.ts:1679-1689` — `.insert(...).select('*').single()` lança PostgREST error se o insert retornar 0 linhas (ex.: RLS de `messages` rejeita silenciosamente o `returning`). O optimistic update já está aplicado, então o usuário vê a bolha "enviada" e o rollback só ocorre via `onError`. É o comportamento esperado para insert único, mas `.single()` aqui transforma um problema de permissão numa exceção genérica. **Fix:** ok manter `.single()` para insert, mas garantir mensagem de erro clara no toast distinguindo "sem permissão" de "rede".

8. **[BAIXA] `ListEmptyComponent` do chat aparece junto com day-headers / não cobre erro de carregamento** — `petsocial/app/(app)/chat/[id].tsx:173-214` — trata `isLoading` (spinner) e vazio ("Diga oi"), mas **não trata `messagesQuery.isError`** nem `otherUserQuery.isError`. Se `fetchMessages` falhar, a tela fica presa em estado vazio "Diga oi!" como se fosse conversa nova — enganoso. **Fix:** ramo de erro com retry. Mesmo padrão falta em `messages.tsx` (lista de conversas não trata `listQuery.isError`, linha 100 só checa `isLoading`).

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Paginação/virtualização do histórico de mensagens** — `fetchMessages` faz `.limit(200)` e carrega tudo de uma vez (`queries.ts:1654-1662`), e o `FlatList` renderiza de baixo pra cima com `scrollToEnd`. Conversas longas vão truncar silenciosamente em 200 msgs e perder o início. Implementar infinite scroll reverso (`useInfiniteQuery` + `inverted` FlatList) e cursor por `created_at`.

2. **[impacto ALTO · esforço MÉDIO] `fetchConversations` tem N+1 de queries** — `queries.ts:1606-1630` dispara 2 queries por conversa (última msg + count de não-lidas) em paralelo. Com 50 conversas são 100+ round-trips. Mover para uma RPC/view SQL que retorne `last_message` e `unread_count` agregados de uma vez.

3. **[impacto ALTO · esforço MÉDIO] Realtime do chat aberto via Broadcast em vez de invalidar+refetch** — hoje cada mensagem nova invalida `qk.messages(conversationId)` e refaz o fetch inteiro (`realtime-provider.tsx:46-48`). Trocar por append incremental no cache (inserir o payload `new` direto via `setQueryData`) elimina refetch e dá entrega instantânea.

4. **[impacto MÉDIO · esforço BAIXO] Indicador de "digitando" e recibo de leitura (visto)** — o app já tem `last_read_at` por participante; expor um segundo check azul (estilo WhatsApp) quando `other.last_read_at > message.created_at` é barato e aumenta muito a sensação de produto.

5. **[impacto MÉDIO · esforço BAIXO] Acessibilidade nos botões de chat/notif** — o botão de enviar (`chat/[id].tsx:248-261`) e as linhas de notificação/conversa não têm `accessibilityLabel`/`accessibilityRole`. O ícone `arrow-up` sozinho é mudo pra leitor de tela. Adicionar labels ("Enviar mensagem", "Conversa com X, 2 não lidas").

6. **[impacto MÉDIO · esforço MÉDIO] Notificações: agrupar curtidas/follows repetidos** — `notifications.tsx` renderiza 1 linha por evento. "Rex e mais 12 curtiram seu post" reduz ruído drasticamente. Agregar por `(kind, post_id)` no `useMemo` de `items`.

7. **[impacto MÉDIO · esforço BAIXO] Empty/error states e retry na lista de conversas** — `messages.tsx:100-114` só diferencia loading vs vazio; falta estado de erro com botão "Tentar de novo". Reaproveitar o `EmptyState` já importado.

8. **[impacto BAIXO · esforço BAIXO] Remover casts `as never` que escondem tipagem de rota** — `chat/[id].tsx:179` (`ref={listRef as never}`) e `messages.tsx:128` (`href={... as never}`). O `as never` no `href` do `Link` mascara tipos de rota do expo-router e some com erros de rota inválida em tempo de compilação. Tipar corretamente o `href` e o `ref` do `FlatList<ChatItem>`.

Arquivos auditados: `petsocial/providers/realtime-provider.tsx`, `petsocial/app/(app)/chat/[id].tsx`, `petsocial/app/(app)/messages.tsx`, `petsocial/app/(app)/notifications.tsx`, `petsocial/lib/queries.ts` (funções de chat/notificações + `qk`).

---

## Achados & Perdidos

### BUGS

1. **[ALTA] Detalhe não trata loading nem not-found — tela em branco** — `app/(app)/lost-found/[id].tsx:61-62` — `const r = query.data; if (!r) return null;` retorna `null` enquanto `query.isLoading` (antes do fetch resolver) E quando o reporte não existe / deu erro. Resultado: ao abrir o detalhe via deep-link ou navegação, o usuário vê uma tela 100% branca sem spinner; se o ID for inválido/removido, fica branco pra sempre. **Fix:** ramificar em `query.isLoading` (mostrar skeleton/`ActivityIndicator`), `query.isError`/`!r` (mostrar `EmptyState` "Reporte não encontrado" + botão voltar), e só então renderizar `r`.

2. **[MÉDIA] Lista mostra empty-state enganoso em caso de erro** — `app/(app)/lost-found/index.tsx:67-86` — `ListEmptyComponent` só checa `query.isLoading`; em `query.isError` (falha de rede/RLS) `query.data` é `undefined` → cai no `EmptyState` "Nenhum pet perdido por aqui", comunicando "está tudo certo, não há nada" quando na verdade a busca falhou. **Fix:** adicionar branch `query.isError` com mensagem de erro + ação "Tentar de novo" (`query.refetch()`).

3. **[MÉDIA] Foto do reporte some no bucket `avatars` e vira lixo órfão** — `app/(app)/lost-found/report.tsx:102` + `lib/queries.ts:1387-1390` — a foto do achado/perdido é enviada pra `uploadToBucket('avatars', ...)` (mesmo bucket dos avatares de pet/perfil), e `deleteLostReport` só faz `DELETE` na linha do banco — nunca chama `removeFromBucket` (que existe em `lib/storage.ts:55`). Toda foto de reporte excluído (e toda foto escolhida em formulário abandonado) fica órfã no storage indefinidamente, inflando custo e misturando domínios. **Fix:** usar um bucket dedicado `lost-reports` (ou prefixo de pasta) e, no `deleteLostReport`/`resolveLostReport`, remover o objeto via `report.photo_url` antes/depois do delete.

4. **[MÉDIA] `as never` nas rotas mascara erros de navegação** — `index.tsx:47,80,105`, `report.tsx:79`, `[id].tsx:265` — todos os `href`/`router.replace`/`router.push` usam `pathname: '...' as never` e `params: {...} as never`, desligando o type-check de rotas tipadas do Expo Router. Um typo no path (ex.: `/lost-found/[id]`) passaria batido em build e só quebraria em runtime. Note ainda a inconsistência: a lista usa `'/lost-found/[id]'` (sem grupo) e o report usa `'/(app)/lost-found/report'` (com grupo). **Fix:** remover os casts e usar os tipos gerados de rota; se o TS reclamar, corrigir o path real em vez de silenciar com `as never`.

5. **[BAIXA] `tel:` pode abrir discador vazio com contato em texto livre** — `[id].tsx:88-95` — `callContact` só trata `@` como email; qualquer outra coisa vira `tel:` após `replace(/[^0-9+]/g,'')`. Se o usuário digitou contato sem dígitos (ex.: "falar com porteiro do prédio"), `clean` fica `''` e abre `tel:` vazio. **Fix:** se `clean.length < 8` (sem número discável), copiar o contato pro clipboard + toast em vez de abrir discador quebrado.

6. **[BAIXA] Sem confirmação ao marcar como resolvido (ação some o reporte)** — `[id].tsx:101-104` — "Marcar como resolvido" dispara `resolveMutation` direto, sem confirmação, enquanto "Excluir" tem dupla confirmação. Resolver remove o reporte da lista pública (filtro `status='open'` em `queries.ts:1343`) e esconde o botão de compartilhar — um toque acidental tira o pet perdido de circulação. **Fix:** adicionar `Alert.alert` de confirmação ("Achou o pet? Isso vai parar de mostrar o reporte na busca").

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Geolocalização real em vez de texto livre** — `last_seen_location` é uma string digitada (`report.tsx:326-331`) e o mapa abre por `?q=texto` (`[id].tsx:76-86`). Capturar lat/long (com `expo-location` + autocomplete) habilitaria raio de busca, ordenação por proximidade e pin exato — o recurso mais valioso pra achados & perdidos.

2. **[impacto ALTO · esforço MÉDIO] Notificar usuários próximos de um novo reporte** — hoje um reporte só aparece se a pessoa abrir a aba. Push/match por espécie+raça+região (já há infra de web-push no projeto) multiplica a chance de reencontro, que é o KPI central do domínio.

3. **[impacto MÉDIO · esforço BAIXO] Skeleton loaders na lista e no detalhe** — a lista mostra branco durante `isLoading` (`index.tsx:68`) e o detalhe idem. Adicionar skeletons (o projeto já tem esse padrão em telas de saúde) elimina o flash em branco e melhora percepção de performance.

4. **[impacto MÉDIO · esforço BAIXO] Filtrar/ordenar por espécie e distância na lista** — só existe o segmented `Todos/Perdidos/Encontrados` (`index.tsx:19-23`). Um filtro por espécie e ordenação "mais recentes/mais antigos/mais perto" ajuda muito quando o volume crescer (a query já traz até 80 itens).

5. **[impacto MÉDIO · esforço MÉDIO] Galeria de fotos por reporte (não só 1)** — `photo_url` é single (`types.ts:187`). Pets se identificam por múltiplos ângulos/sinais; permitir 2-4 fotos aumenta taxa de reconhecimento. Requer tabela filha ou array + ajustes no cartaz/detalhe.

6. **[impacto MÉDIO · esforço BAIXO] Acessibilidade nos toques de mapa/contato/menu** — o `Pressable` de localização (`[id].tsx:192`), o ícone de menu do dono (`:126`) e os cards da lista não têm `accessibilityRole="button"`/`accessibilityLabel`. Adicionar rótulos ("Abrir local no mapa", "Opções do reporte", "Ver reporte de {nome}") melhora leitor de tela.

7. **[impacto MÉDIO · esforço BAIXO] Aviso de privacidade no campo de contato** — o `contact_info` (telefone/email) é exibido em texto puro publicamente (`[id].tsx:245`) numa tabela com `select using (true)`. Adicionar microcopy no formulário ("Esse contato fica visível publicamente") e considerar proxy de contato in-app reduz risco de scraping/abuso.

8. **[impacto BAIXO · esforço BAIXO] Limpar foto órfã ao trocar/abandonar e desabilitar submit durante upload** — em `report.tsx`, trocar a foto não remove a anterior do storage e o botão "Publicar" fica clicável durante `uploading` (`:353` só usa `submitting`). Bloquear submit enquanto `uploading` e remover a foto anterior ao re-selecionar evita lixo e estado inconsistente.

---

## Pro / Monetizacao

### BUGS

1. **[ALTA] `media_kind: 'video'` é dead/quebrado — vídeo nunca renderiza** — `components/sponsored-post-card.tsx:175` + `components/admin/sponsored-form.tsx:103,131` — O tipo `SponsoredPost.media_kind` aceita `'image' | 'video'` e o card tem `aspectRatio: 1` fixo, mas o componente SEMPRE renderiza `<Image source={{ uri: post.media_url }}>`, ignorando `media_kind`. Se algum dia entrar um post com `media_kind: 'video'`, o `<Image>` do expo-image tenta carregar uma URL de vídeo e mostra área cinza/quebrada. Pior: o admin form **hard-coda `media_kind: 'image'`** em dois lugares (submit e preview), então não há nem como criar vídeo — a metade da feature é morta. **Fix:** ou remover `'video'` do tipo e do schema (assumir só imagem), ou renderizar `expo-video` quando `media_kind === 'video'` e adicionar seletor no form.

2. **[MÉDIA] Pull-to-refresh não atualiza os sponsored posts** — `app/(app)/(tabs)/index.tsx:83-87` — `onRefresh` invalida `['feed']`, `unreadCount` e `unreadMessages`, mas NÃO invalida `['sponsored-active']`. Com `staleTime: 2*60_000` (linha 64), um anúncio recém-pausado/expirado pelo admin continua aparecendo por até 2min mesmo o usuário puxando pra atualizar — receita exibindo anúncio inválido (CTA pode levar a campanha encerrada). **Fix:** adicionar `qc.invalidateQueries({ queryKey: ['sponsored-active'] })` ao `Promise.all` do `onRefresh`.

3. **[MÉDIA] Checkout mock retorna URL falsa do Stripe em produção** — `lib/queries.ts:2418-2431` — Se a Edge Function `create-checkout-session` falhar por QUALQUER motivo em produção (timeout, erro de rede, 500), o `catch` engole o erro e retorna `https://stripe.com/?dev_placeholder=true&plan=...`. Em produção isso abre o site institucional do Stripe no navegador do usuário — parece que "funcionou" mas nunca cobra, e o checkout real (que a UI diz ser "Mercado Pago") nunca acontece. Falha de pagamento mascarada como sucesso. **Fix:** o fallback mock só deveria rodar com `__DEV__`; em produção, propagar o erro pro `onError` do mutation (`toast.error`).

4. **[BAIXA] Impression pode não ser logada em reuso de instância da FlatList** — `components/sponsored-post-card.tsx:37-44` — `impressionLoggedRef` é setado `true` no 1º mount e nunca resetado, enquanto o `useEffect` depende de `[post.id]`. Se a FlatList reaproveitar a mesma instância do `SponsoredPostCard` para um `post.id` diferente, o guard `if (impressionLoggedRef.current) return` bloqueia a impression do novo anúncio → subcontagem de impressões (receita medida a menos). Como o `keyExtractor` usa `s-${id}` estável, o React tende a preservar identidade por key, então o impacto é baixo, mas o guard está logicamente incorreto. **Fix:** comparar contra o id já logado em vez de um booleano: `const loggedFor = useRef<string|null>(null); if (loggedFor.current === post.id) return; loggedFor.current = post.id;`.

5. **[BAIXA] `as never` esconde a rota de navegação** — `app/(app)/pro.tsx:429` — `router.push('/(app)/account' as never)`. A rota `account.tsx` existe, então funciona em runtime, mas o `as never` suprime a checagem de tipo do expo-router: se a rota for renomeada/movida, o TS não acusa e vira 404 silencioso. **Fix:** usar a string tipada `router.push('/(app)/account')` sem o cast (ou `'/account'` conforme o roteamento) — se o tipo não resolver, é sinal de rota não registrada que deve ser corrigida, não silenciada.

6. **[BAIXA] Sem `accessibilityRole`/label no card patrocinado inteiro e no header/mídia Pressables** — `components/sponsored-post-card.tsx:108-118,159-165` — O `Pressable` do header (avatar+nome) e o da mídia abrem o CTA externo, mas não têm `accessibilityRole="link"` nem `accessibilityLabel` (só a barra CTA na linha 203 tem). Leitores de tela anunciam dois alvos clicáveis sem rótulo. Além disso o badge "Patrocinado" é puramente visual — um usuário de screen reader não distingue anúncio de post orgânico, o que é problema de transparência publicitária. **Fix:** adicionar `accessibilityRole="link"` + label aos Pressables e um `accessibilityLabel="Conteúdo patrocinado"` no container `Animated.View`.

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Validação/normalização de `cta_url` no anúncio e nas ofertas** — O card só faz `try/catch` ao abrir (`sponsored-post-card.tsx:49-57`) e `prettifyUrl` cai pra string crua se a URL for inválida. O form de sponsored não valida `cta_url` (só o offers-form valida `^https?://`). Um admin que digite `petshop.com` sem `https://` gera link que falha silenciosamente. Normalizar/validar URL na escrita evita anúncio com CTA morto.

2. **[impacto ALTO · esforço MÉDIO] Pix no checkout (já prometido na copy)** — `pro.tsx:53` o FAQ diz "Pix em breve", mas é o método preferido no BR e reduz fricção/custo de cartão. Priorizar Pix no `create-checkout-session` provavelmente eleva conversão mais que qualquer polish de UI nessa tela.

3. **[impacto MÉDIO · esforço BAIXO] Frequency capping / rotação de sponsored** — `interleaveSponsored` (`lib/sponsored.ts:151`) sempre insere os mesmos anúncios na mesma ordem de prioridade, nas mesmas posições (5, 11, 17…). Embaralhar a janela de candidatos por sessão (ou ponderar por prioridade com leve random) distribui impressões entre anunciantes e evita fadiga do mesmo anúncio no topo sempre.

4. **[impacto MÉDIO · esforço BAIXO] Empty/skeleton state e tratamento de erro na tela de Vantagens** — `offers.tsx:27` o `useQuery` não trata `query.isError` (só `isLoading`/empty). Como `fetchActiveOffers` engole erro e retorna `[]` (`offers.ts:60`), uma falha de rede vira "Nenhuma oferta no momento" — mensagem enganosa. Diferenciar erro de vazio com retry melhora confiança.

5. **[impacto MÉDIO · esforço BAIXO] `track`/analytics nas ofertas e no card patrocinado** — A tela `/pro` loga `pro_screen_view`, `checkout_started`, etc., mas `offers.tsx` só chama `trackOfferClick` (contador no DB) e não emite `track()` de view/scroll de ofertas. Sem `offers_screen_view` e impressões de oferta, não dá pra medir CTR real do clube de vantagens (segundo motor de receita) como se mede o sponsored.

6. **[impacto MÉDIO · esforço MÉDIO] Deep-link/retorno pós-checkout e refresh do estado Pro** — Após `Linking.openURL(url)` (`pro.tsx:79`) não há fluxo de retorno: o usuário paga no navegador externo e volta pro app sem o `subscription` ser revalidado. Invalidar a query da subscription em foco da tela (ou via deep link de sucesso) faz o badge "Você já é Pet Pro!" aparecer sem precisar reiniciar o app.

7. **[impacto BAIXO · esforço BAIXO] Estado de "expira em breve" / `valid_until` visível nas ofertas** — `Offer.valid_until` existe (`offers.ts:26`) mas a UI nunca mostra a data de validade do cupom. Exibir "Válido até dd/mm" ou "Expira em X dias" cria urgência e evita frustração de cupom vencido no parceiro.

8. **[impacto BAIXO · esforço BAIXO] Skeleton no card sponsored e fallback de mídia** — Enquanto `sponsoredQuery` carrega, o feed simplesmente não mostra anúncio (sem placeholder), e a `<Image>` do card não tem `placeholder`/estado de erro (só um `backgroundColor: '#F5F3F0'`). Um blurhash/placeholder no expo-image e um fallback visual se a mídia falhar deixam o anúncio mais polido e evitam "buraco" cinza.

Arquivos auditados: `petsocial/app/(app)/pro.tsx`, `petsocial/app/(app)/offers.tsx`, `petsocial/lib/sponsored.ts`, `petsocial/components/sponsored-post-card.tsx`, `petsocial/lib/offers.ts`, `petsocial/components/admin/sponsored-form.tsx`, `petsocial/app/(app)/(tabs)/index.tsx` (consumo do feed), `petsocial/lib/queries.ts:2418` (checkout), `petsocial/lib/types.ts:860` (PRICING).

Nota: investiguei suspeitas de `\` no lugar de `//` em `queries.ts:2428/2438`, `types.ts:868` e `index.tsx:110` — confirmei via Read que são `//` corretos (era artefato de renderização do Grep), portanto NÃO são bugs. `.single()` em `adminCreateSponsoredPost`/`adminCreateOffer` é apropriado (insert sempre retorna 1 linha); os fetch-by-id já usam `.maybeSingle()` corretamente.

---

## Painel Admin

### BUGS

1. **[ALTA] Hooks chamados após early-return condicional (Rules of Hooks)** — `admin.tsx:94-113`, `admin/users.tsx:52-63`, `admin/sponsored/index.tsx:20-27`, `admin/sponsored/[id].tsx:31-43`, `admin/offers/[id].tsx:25-32`, `admin/recalls/[id].tsx:30-37`, `admin/sponsored/new.tsx:22-25`, `admin/offers/new.tsx:22-23` — todas as telas fazem `if (!session) return <Redirect/>` / `if (email !== ADMIN_EMAIL) return` / `if (!id) return null` **antes** de `useQuery`/`useState`/`useQueryClient`. Quando a condição muda entre renders (ex.: sessão carrega de `null`→válida, ou o gate de email reavalia), a contagem/ordem de hooks muda e o React quebra com "Rendered more hooks than during the previous render". **Fix:** mover todos os hooks para o topo do componente (antes de qualquer `return`) e só então renderizar `Redirect`/`null` condicionalmente, ou extrair o conteúdo para um subcomponente montado só após o gate.

2. **[ALTA] `adminUpdateSponsoredPost` envia patch cru pro `.update()` sem normalizar campos** — `lib/sponsored.ts:228-234` — o `create` mapeia cada campo com defaults (`?? null`, `?? 'image'`, etc.), mas o `update` faz `.update(patch)` direto com o que o form mandar. Como `SponsoredForm` passa um `SponsoredPostInput` completo, campos `undefined` viram update parcial inconsistente e qualquer chave extra do form que não seja coluna real causa erro 400 do PostgREST. Diferente do create, não há saneamento. **Fix:** mapear o patch explicitamente como no create (whitelist de colunas), convertendo `undefined`→`null` onde aplicável.

3. **[MÉDIA] `staleTime` sem `keepPreviousData` faz a lista de usuários piscar a cada tecla/página** — `admin/users.tsx:59-63` — `queryKey: ['admin-users', search, sort, offset]` muda a cada caractere digitado e a query não usa `placeholderData`/`keepPreviousData`, então `users` volta a `[]` e a lista some/reaparece durante a digitação e ao paginar. Também não há debounce na busca (request por tecla). **Fix:** adicionar `placeholderData: keepPreviousData` (v5) e debouncar `search` (~300ms) antes de entrar na queryKey.

4. **[MÉDIA] Paginação "Próximo" quebra quando a última página tem exatamente PAGE_SIZE itens** — `admin/users.tsx:267,277` — `disabled={users.length < PAGE_SIZE}` assume que página cheia ⇒ há próxima. Se o total for múltiplo de 25, a última página enche, o botão fica habilitado e leva a uma página vazia (sem empty-state, ver bug 5). **Fix:** retornar `has_more`/`total` da RPC, ou desabilitar quando a próxima página vier vazia.

5. **[MÉDIA] Lista de usuários sem empty-state** — `admin/users.tsx:151-244` — quando `users` é `[]` (busca sem resultado, página vazia, ou base zerada) e não está loading/erro, a tela renderiza só a barra de busca e os botões de paginação, sem nenhuma mensagem "nenhum usuário encontrado". As telas de sponsored/recalls têm empty-state; esta não. **Fix:** adicionar bloco `users.length === 0 && !isLoading` com mensagem e dica de limpar a busca.

6. **[MÉDIA] Invalidação de cache incompleta no edit de sponsored/offer (a própria lista de detalhe e métricas)** — `admin/offers/[id].tsx:35-48` e `admin/sponsored/[id].tsx:48-61` — no `handleSubmit` o edit invalida list + detail + feed, mas **não** invalida `['admin-stats']`/`['admin-engagement']` (que mostram `sponsored.active_count`, impressões, etc. no overview e têm `refetchInterval` longo de 60s) nem `['admin-sponsored-metrics', id]`. Após ativar/pausar/apagar um sponsored, o card "Sponsored" do overview e o contador "X ativos" do NavCard ficam defasados até 60s. **Fix:** incluir `['admin-stats']` e `['admin-engagement']` nas invalidações de create/update/delete de sponsored (e offers, se afetam KPIs).

7. **[BAIXA] `parseISO` sem guarda em campos de data potencialmente nulos quebra a renderização** — `admin.tsx:155` (`engagement.generated_at`), `admin/sponsored/index.tsx:244` (`post.starts_at`) — `format(parseISO(...))` assume string ISO sempre presente; se a RPC retornar `null`/`''` (ex.: sponsored sem `starts_at`), `parseISO` produz `Invalid Date` e `format` lança, derrubando o item/tela inteira em vez de degradar. `ends_at` já é tratado com ternário, `starts_at` não. **Fix:** validar antes de formatar (`isValid(d)`), ou usar um helper `safeFormat`.

8. **[BAIXA] Gate de admin só por `session.user.email` hardcoded — segurança frágil no client** — `admin.tsx:13,95`, e repetido literalmente em todas as 8+ telas — o e-mail admin está hardcoded e o gate é client-side. Se a fonte de verdade real (as RPCs `SECURITY DEFINER`) não checar o `auth.uid()`/role, ou se as tabelas `sponsored_posts`/`offers`/`recalls` tiverem RLS permissiva, qualquer usuário autenticado poderia chamar `adminUpdate*`/`adminDelete*` direto (não passam por RPC, são `.from().update()/.delete()`). O comentário "Gate duplo (client + server via SECURITY DEFINER)" só vale pras RPCs de leitura; os CRUDs de escrita dependem 100% de RLS. **Fix:** confirmar RLS de escrita nas tabelas (policy `is_admin()`), e centralizar o e-mail/checagem num único helper em vez de constante duplicada por arquivo.

### MELHORIAS

1. **[impacto ALTO · esforço BAIXO] Extrair o gate de admin para um layout/guard único** — hoje `const ADMIN_EMAIL` + `if (!session)` + `if (email !== ...)` está copiado em ~10 arquivos. Um `admin/_layout.tsx` (ou hook `useAdminGuard`) que faz o redirect uma vez elimina a duplicação, resolve de raiz o bug #1 (gate antes dos hooks de tela) e centraliza a regra de segurança.

2. **[impacto ALTO · esforço MÉDIO] Toggle ativar/pausar inline na lista de sponsored/recalls/offers** — hoje só dá pra mudar `active`/status entrando no detalhe. Um switch direto na row (com mutation otimista) agiliza muito a operação diária do painel.

3. **[impacto MÉDIO · esforço BAIXO] `RefreshControl` (pull-to-refresh) nas listas** — `users`, `sponsored`, `recalls`, `offers` usam `ScrollView` sem `refreshControl`. O sponsored tem só um botão "Recarregar" no fim; padronizar pull-to-refresh em todas melhora consistência.

4. **[impacto MÉDIO · esforço BAIXO] Skeleton/placeholder em vez de só `ActivityIndicator` centralizado** — o projeto já tem skeletons (tasks de saúde). Reusar nas listas admin reduz o "piscar" (ligado ao bug #3) e dá percepção de velocidade.

5. **[impacto MÉDIO · esforço MÉDIO] Confirmação de delete no Web** — os `handleDelete` usam `Alert.alert` (sponsored/offers/recalls). Em React Native Web, `Alert.alert` com botões custom frequentemente não dispara o `onPress` destrutivo de forma confiável; usar um modal de confirmação próprio garante o fluxo de apagar no painel (que roda em web/Vercel).

6. **[impacto MÉDIO · esforço BAIXO] Contadores/empty-state coerentes e estado de erro padronizado** — a tela de users não tem empty-state nem mostra total; padronizar com as demais (header com contagem + bloco vazio + bloco de erro estilizado) deixa o painel uniforme.

7. **[impacto BAIXO · esforço BAIXO] Acessibilidade nos botões só-ícone** — o `headerRight` de delete (`Ionicons name="trash"`) em sponsored/offers/recalls e os ícones de NavCard não têm `accessibilityLabel`/`accessibilityRole="button"`. Adicionar rótulos ("Apagar sponsored", etc.) — especialmente importante porque o app já passou por auditoria de a11y (task #135).

8. **[impacto BAIXO · esforço MÉDIO] Quick-action "Pausar/Apagar" e busca/filtro por status nas listas** — filtros por `status` (sponsored) / `severity` e `active` (recalls) / vigência (offers) e ordenação tornam o painel utilizável quando o volume crescer; hoje as listas são flat sem filtro.

Arquivos auditados: `petsocial/app/(app)/admin.tsx`, `petsocial/app/(app)/admin/users.tsx`, `petsocial/app/(app)/admin/sponsored/index.tsx`, `petsocial/app/(app)/admin/sponsored/[id].tsx`, `petsocial/app/(app)/admin/sponsored/new.tsx`, `petsocial/app/(app)/admin/offers/[id].tsx`, `petsocial/app/(app)/admin/offers/new.tsx`, `petsocial/app/(app)/admin/recalls/index.tsx`, `petsocial/app/(app)/admin/recalls/[id].tsx`, `petsocial/lib/sponsored.ts`, `petsocial/app/(app)/_layout.tsx`.

---

## Celular do Pet & Navegacao
### BUGS
1. **[MÉDIA] Wallpaper "foto do pet" não reverte ao trocar pra pet sem foto** — `phone.tsx:436-439, 514, 725` — `wallpaperId` é persistido por `userId` (não por pet). Se o usuário escolhe `pet-photo` e depois troca pro pet ativo via carrossel (`setActivePet`), `wp.id` continua `'pet-photo'` mas `photoUri` pode ser `null`; `Wallpaper` cai no `else` e renderiza o gradiente `DEFAULT_WP` (gold), ignorando silenciosamente a escolha. O seletor (`hasPetPhoto`) some, mas o estado fica preso em `pet-photo`. **Fix:** ao trocar de pet, se `wallpaperId === 'pet-photo' && !isPhoto(photoUri)` cair pra um gradiente; ou derivar `wp` validando a foto e resetar `wallpaperId`.

2. **[MÉDIA] `sessionUnlocked` global trava o lock screen em hot-reload/multi-conta** — `phone.tsx:38, 376, 516-519` — a flag é um módulo-level `let`. Uma vez destravado, qualquer remontagem do componente (troca de conta, logout/login na mesma sessão JS, ou navegação que recria a tela) nunca mais mostra o lock screen, porque `useState(() => !sessionUnlocked)` inicia `false`. Em web (sem cold start de processo) isso significa que o "bloqueio por sessão" some pro resto da vida da aba, inclusive após trocar de usuário. **Fix:** resetar `sessionUnlocked = false` no logout (no `session-provider`) ou keyar por `userId`.

3. **[MÉDIA] Animação de "abrir app" não trata `router.push` que falha/race** — `phone.tsx:423-434, 686-711` — o `openingTile` overlay só é limpo dentro do callback `.start(() => { router.push(...); setTimeout(() => setOpeningTile(null), 80) })`. Se a navegação demorar ou o componente desmontar antes dos 80ms, o `setState` ocorre fora da tela; e se duas ativações dispararem rápido (sem debounce no `Pressable`), `tileAnim` é resetado no meio (`setValue(0)`), causando flicker. Não há guard de "já abrindo". **Fix:** ignorar `handleActivate` enquanto `openingTile != null`, e limpar o overlay no `useEffect` de cleanup.

4. **[BAIXA] `dockApps`/`gridApps` geram rotas com `pid` vazio** — `phone.tsx:475-499` — `href: \`/(app)/pet/${pid}/health\`` etc. usam `pid = activePet?.id ?? ''`. O componente já faz early-return `if (!activePet) return null` (linha 509) antes de renderizar, então na prática `pid` está preenchido — mas os `useMemo` calculam os arrays antes desse guard com `pid` possivelmente `''`, e o cast `as never` em `handleActivate` (linha 425) esconde rotas tipo `/(app)/pet//health`. Robustez frágil se a ordem de hooks/guards mudar. **Fix:** computar `dockApps`/`gridApps` só com `activePet` garantido, ou desabilitar ícones de pet quando `!pid`.

5. **[BAIXA] `notice` no lock/widget ignora `healthAlerts` quando score não computou** — `phone.tsx:444-448, 462-469` — `healthAlerts` depende de `computedScore`, que é `null` enquanto `summaryQuery`/`parasiteQuery` carregam. Não há tratamento de erro dessas queries (`isError` nunca é olhado), então se `fetchHealthSummary` falhar, a bateria/score e o `notice` somem sem qualquer indicação — o usuário acha que o pet "não tem lembrete". **Fix:** considerar `summaryQuery.isError` (ex.: mostrar bateria neutra/ícone de alerta) em vez de tratar erro como "sem dados".

6. **[BAIXA] Lock screen recria `PanResponder`/`Animated` a cada unlock e não é acessível por teclado** — `phone.tsx:286-301, 351-357` — o `PanResponder` em web não responde a swipe de mouse/trackpad bem, e o único fallback é o `Pressable` na seta. Em web (React Native Web) o gesto `dy < -6` raramente dispara com mouse; teclado (Tab+Enter) funciona só na seta. Aceitável, mas é a única barreira pra entrar no app. **Fix:** garantir foco/teclado na área de unlock e/ou também destravar em click em qualquer lugar da lock screen.

### MELHORIAS
1. **[impacto ALTO · esforço BAIXO] `accessibilityRole="button"` + estado nos ícones do dock/grid** — os `AppIcon` têm `accessibilityLabel` mas badges (ex.: "3 não lidas") não são anunciados. Adicionar `accessibilityValue`/sufixo no label (`${app.label}, ${badge} novos`) melhora muito leitor de tela, já que essa é a tela inicial.

2. **[impacto ALTO · esforço MÉDIO] Persistir wallpaper por pet, não por usuário** — keyar `petsocial:phone-wallpaper:${userId}:${petId}` resolve o bug #1 e deixa cada pet com seu tema/foto, reforçando a metáfora de "celular do pet".

3. **[impacto MÉDIO · esforço BAIXO] Debounce/guard de duplo-toque na abertura de apps** — além de corrigir o flicker (bug #3), evita `router.push` duplicado que empilha duas telas iguais na stack.

4. **[impacto MÉDIO · esforço BAIXO] Empty/error state nas queries de badge** — hoje `?? 0` mascara erro de rede como "zero não lidas". Um indicador sutil (ponto cinza) quando `isError` evita falso "tudo lido".

5. **[impacto MÉDIO · esforço MÉDIO] Long-press nos ícones = reordenar/ações rápidas** — o app já tem Quick Actions (task #118); trazer um menu contextual (ex.: "Marcar saúde como lida", "Fixar no dock") na home reforça a fantasia de iPhone.

6. **[impacto MÉDIO · esforço BAIXO] `refetchInterval: 30_000` só quando a tela está em foco** — as duas queries de unread fazem polling fixo a cada 30s mesmo com o app em background/aba inativa. Usar `refetchIntervalInBackground: false` (default) já ajuda, mas pausar via `useFocusEffect`/`AppState` economiza rede/bateria.

7. **[impacto BAIXO · esforço BAIXO] `HeaderBackAndHome` duplica affordance de "voltar"** — `header-home-logo.tsx:68-90` mostra chevron-back **e** logo-home lado a lado em toda tela; a logo faz `router.replace('/(app)/phone')` (perde a stack), o que pode confundir ("voltar" vs "home"). Considerar só a logo quando `!canGoBack()`, e só o chevron quando há histórico.

8. **[impacto BAIXO · esforço BAIXO] Relógio atualiza a cada 30s mas pode pular o minuto** — `phone.tsx:380-383` e lock (`281-284`) usam `setInterval(30_000)`. O `HH:mm` pode ficar até ~30s defasado na virada do minuto. Alinhar o primeiro tick ao próximo minuto cheio deixa o relógio "de celular" preciso.

Arquivos auditados (todos absolutos):
- `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\phone.tsx`
- `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\_layout.tsx`
- `C:\Users\pedro\Downloads\pet social\petsocial\app\(app)\(tabs)\_layout.tsx`
- `C:\Users\pedro\Downloads\pet social\petsocial\components\header-home-logo.tsx`
- `C:\Users\pedro\Downloads\pet social\petsocial\providers\active-pet-provider.tsx` (suporte)
- `C:\Users\pedro\Downloads\pet social\petsocial\lib\queries.ts` (verificação de queryKeys e fetchers)

---

## Adocao

### BUGS

1. **[ALTA] Apagar anúncio deixa fotos órfãs no bucket** — `app/(app)/adoption/[id].tsx:105` + `lib/adoption.ts:167` — `deleteAdoptionListing` faz só `DELETE` na linha do banco; as imagens enviadas pro bucket público `posts` nunca são removidas. `deleteFromBucket` existe em `lib/storage.ts:54` e já é usado em `symptoms.tsx:612`, mas aqui não é chamado. Resultado: storage cresce indefinidamente com lixo e as URLs continuam públicas mesmo após "apagar". **Fix:** antes/depois do delete, iterar `listing.image_urls` e chamar `deleteFromBucket('posts', url)` (best-effort, ignora erro).

2. **[ALTA] Feed engole erros e mostra "vazio" como se não houvesse pets** — `lib/adoption.ts:76` (`if (error) return []`) + `app/(app)/adoption/index.tsx:90-92` — `fetchAdoptionListings` retorna `[]` em qualquer erro (rede/RLS), e a tela só distingue `isLoading` vs `length === 0`. Falha de rede vira o EmptyState "Nenhum pet por aqui ainda", enganando o usuário e sem opção de retry. Como o `queryFn` nunca lança, `query.isError` jamais dispara. **Fix:** deixar `fetchAdoptionListings` lançar o erro (`if (error) throw error`) e tratar `query.isError` na tela com mensagem + botão "Tentar de novo" (refetch). Mesma observação para `fetchAdoptionListing:89`.

3. **[MÉDIA] Sem pull-to-refresh / refetch ao voltar pra lista** — `app/(app)/adoption/index.tsx:26-29,52` — a query usa só `['adoption-listings']` sem `RefreshControl` no `ScrollView` nem `refetchOnWindowFocus`. Depois de criar/apagar/marcar adotado e voltar, ou quando outra pessoa anuncia, o mural pode ficar desatualizado e não há gesto de atualizar. **Fix:** adicionar `RefreshControl` chamando `query.refetch()` (e considerar `staleTime` curto).

4. **[MÉDIA] `priority` no tipo mas nunca exposto/usado na ordenação efetiva** — `lib/adoption.ts:36,70` + `:80` — o `select` ordena por `priority desc`, mas logo depois `rows.sort(...)` reordena **apenas por status**, com sort estável; dentro do mesmo status a ordem do banco é preservada, então até funciona — porém `priority` nunca aparece na UI e não há caminho pra setá-lo (nenhum admin/owner control). É feature morta/meio-implementada que pode confundir manutenção. **Fix:** ou remover `priority` do escopo, ou de fato usá-lo no `rank`/sort e expor (ex.: destaque ONG).

5. **[MÉDIA] Dead code: `updateAdoptionListing` e `fetchMyAdoptionListings` sem uso + falta tela de editar** — `lib/adoption.ts:93,157` — nenhuma das duas é importada em lugar nenhum (confirmado por grep). Não existe rota de edição (`app/(app)/adoption/` só tem `index`, `new`, `[id]`), então um anúncio com erro de digitação só pode ser apagado e recriado (perdendo as fotos, ver bug #1). **Fix:** ou criar `edit.tsx` reutilizando `updateAdoptionListing`, ou remover o código morto. "Meus anúncios" (`fetchMyAdoptionListings`) também não tem entrada na UI.

6. **[BAIXA] WhatsApp: número curto vira link inválido sem validação** — `app/(app)/adoption/[id].tsx:60-65` — `contact_phone` é texto livre (`new.tsx:219`), sem máscara/validação. Se o anunciante digitar algo curto/incompleto, monta-se `https://wa.me/55<lixo>` e abre o WhatsApp num número inexistente, sem feedback. **Fix:** validar comprimento (DDD+número ≈ 10–11 dígitos) antes de montar a URL; se inválido, `toast.info` em vez de abrir. Idealmente máscara no input.

7. **[BAIXA] Botão "Marcar adotado" sem estado de loading e sem proteção contra duplo toque** — `app/(app)/adoption/[id].tsx:84-94,219-226` — `onToggleAdopted` é `async` mas o `Pressable` não desabilita durante a chamada nem mostra spinner; toques repetidos disparam vários `update`. Mesmo padrão no delete. **Fix:** `useMutation` (ou flag local `busy`) desabilitando o botão e mostrando loading.

8. **[BAIXA] Acessibilidade: ícones-só sem `accessibilityLabel`** — `app/(app)/adoption/[id].tsx:145` (share), `:227-232` (lixeira/apagar) e `app/(app)/adoption/new.tsx:123,142` (remover foto / adicionar foto) — `Pressable`s com apenas `Ionicons` não têm `accessibilityLabel`/`accessibilityRole`, ficando ilegíveis pra leitores de tela. **Fix:** adicionar `accessibilityRole="button"` + `accessibilityLabel` ("Compartilhar", "Apagar anúncio", "Remover foto", "Adicionar foto").

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Filtro por UF/cidade no mural** — `lib/adoption.ts` já tem `AdoptionFilters.uf` e a query suporta `.eq('uf', ...)`, mas `index.tsx:28` chama `fetchAdoptionListings()` sem filtro e só há chip de espécie. Adoção é hiperlocal; expor filtro de estado/cidade (ou geolocalização) é o recurso que mais aumenta conversão real de adoção.

2. **[impacto ALTO · esforço BAIXO] Upload de fotos antes de salvar = lixo no bucket se desistir** — `new.tsx:66` faz upload imediato no `pickImage`. Se o usuário sair sem publicar, os arquivos ficam órfãos (mesmo problema do bug #1 pelo outro lado). Melhoria: subir as fotos só no `onSubmit`, ou limpar via `deleteFromBucket` as imagens não publicadas ao desmontar a tela.

3. **[impacto MÉDIO · esforço BAIXO] Compartilhar respeita Pet do usuário / status adotado** — `[id].tsx:240` esconde o CTA WhatsApp quando `adopted`, ótimo; complementar mostrando um aviso "Este pet já foi adotado 🎉" no lugar do CTA (hoje fica um vazio), e desabilitar o share de um anúncio adotado ou ajustar a mensagem.

4. **[impacto MÉDIO · esforço MÉDIO] Optimistic update no toggle adotado/delete** — em vez de `await setAdoptionStatus` → `invalidate` → refetch (flicker), usar `onMutate` do `useMutation` pra atualizar o cache `['adoption-listing', id]` e `['adoption-listings']` na hora, com rollback no erro. UX instantânea.

5. **[impacto MÉDIO · esforço BAIXO] Contagem/feedback de fotos e reordenar** — `new.tsx:119-164` permite até 5 fotos mas não mostra "2/5", não permite reordenar (a 1ª é a capa, `index.tsx:150`) nem indica qual é a capa. Adicionar contador, label "Capa" na primeira e drag/▲ para reordenar melhora bastante o anúncio.

6. **[impacto MÉDIO · esforço MÉDIO] Denúncia / moderação de anúncios** — mural público sem botão "Denunciar" nem flag de moderação. Pra adoção responsável (e evitar venda/maus-tratos), adicionar report → tabela de denúncias + esconder após N reports. Importante pré-launch.

7. **[impacto BAIXO · esforço BAIXO] Tela de detalhe sem data nem "há X dias"** — `AdoptionListing.created_at` existe (`lib/adoption.ts:18`) mas nunca é exibido. Mostrar "Anunciado há 3 dias" dá noção de urgência/frescor e ajuda a priorizar pets há muito esperando.

8. **[impacto BAIXO · esforço BAIXO] Hardcode de cores fora do theme** — `index.tsx:57,67,70` e `new.tsx:225-235,336-339` usam hex fixos (`#FEF2F2`, `#F97316`, `#9A3412`…) ignorando `theme`, o que quebra no dark mode (o resto do app é theme-aware via `useTheme`). Migrar pros tokens do tema garante consistência visual.

**Observação de segurança (não-bug, depende do banco):** o código confia em RLS para `update`/`delete`/`insert` (`lib/adoption.ts:158,163,168`) — `setAdoptionStatus`/`deleteAdoptionListing` filtram só por `id`, sem checar `owner_id` no cliente. Isso é correto **se e somente se** existir policy RLS de owner em `adoption_listings` (o cabeçalho do arquivo afirma que sim). Vale confirmar que a migration aplicou as policies de `UPDATE`/`DELETE` restritas a `auth.uid() = owner_id`; senão, qualquer usuário autenticado consegue apagar/alterar anúncios alheios via API. Não consegui validar o SQL aqui — recomendo verificar no Supabase.

---

## Conta / Config / Legal
### BUGS
1. **[ALTA] Cancelamento de assinatura é fake (não cancela no provedor de pagamento)** — `lib/queries.ts:2437-2445` — `cancelSubscription` só faz `UPDATE subscriptions SET cancel_at_period_end = true` com um `TODO: chamar Edge Function cancel-subscription`. O usuário vê "Cancelamento agendado" em `account.tsx:45`, mas a cobrança no Stripe/loja continua ativa. Isso gera cobrança indevida → chargeback/reclamação no Procon. **Fix:** chamar a Edge Function real de cancelamento; enquanto não existir, não prometer cancelamento ("entre em contato pra cancelar") ou bloquear o botão.

2. **[ALTA] Invite de cuidador criado mas lista não atualiza se o modal for fechado pelo backdrop/X** — `pet/[id]/caretakers.tsx:453-475, 492-499` — `handleSubmit` cria o convite no banco e seta `createdInvite`, mas a invalidação de `qk.petCaretakers(id)` só roda em `done()` (botão "Pronto, fechar", linha 501-508). Se o usuário fechar pelo backdrop (`onPress={close}`, linha 520) ou pelo X (linha 639) após gerar o link, o convite **existe no DB** mas some da UI até refazer a query. Pode levar o tutor a convidar a mesma pessoa de novo. **Fix:** invalidar `qk.petCaretakers(id)` dentro de `close()` quando `createdInvite` não é nulo (ou sempre invalidar ao desmontar o modal).

3. **[MÉDIA] Web sempre reporta permissão "denied", mascarando push já ativo** — `notification-settings.tsx:49-52` — em `refresh()`, no web seta `setPermission('denied')` incondicionalmente. Isso é usado no empty state (linha 134-137) que diz "Habilite as notificações" mesmo quando o usuário já ativou o Web Push via `WebPushToggle`. O estado real do navegador (`pushPermission()`) é ignorado nesse caminho. **Fix:** no web, derivar `permission` de `pushPermission()`/`isPushSubscribed()` em vez de hardcodar `'denied'`.

4. **[MÉDIA] `inviteCaretaker` usa `.single()` e quebra em corrida com trigger/RLS** — `lib/queries.ts:1155-1161` — `.insert(input).select('*').single()` lança erro (`PGRST116`) se o `RETURNING` vier vazio (ex.: RLS de SELECT mais restrita que a de INSERT, ou trigger que move a linha). Como o `invite_token` provavelmente é gerado por `DEFAULT`/trigger, qualquer divergência de policy derruba o fluxo inteiro com "Erro ao convidar". **Fix:** manter `.single()` só se a policy de SELECT garantir leitura; caso contrário tratar retorno nulo explicitamente e validar `result.invite_token` antes de montar a URL em `caretakers.tsx:469`.

5. **[MÉDIA] Email de convite "fake" (`@invite.local`) é gravado como email real** — `pet/[id]/caretakers.tsx:463` — quando o tutor informa só o apelido, grava `invited_email = \`${nickname}@invite.local\``. Esse valor entra na coluna `invited_email` e vaza na UI (fallback em `caretakers.tsx:287` e no toast/alert de remoção linha 125). Se houver qualquer rotina de envio de email por convite, vai disparar pra um endereço inválido; e o apelido com espaços/acentos ("Petshop Doggy") gera email malformado. **Fix:** deixar `invited_email = null` quando só há apelido (a coluna já é `string | null`, types.ts:113) e não exibir o pseudo-email.

6. **[MÉDIA] Guard de cancelamento esconde o botão silenciosamente quando falta `current_period_end`** — `account.tsx:80-81` — `onCancel` faz `if (!subscription?.current_period_end) return;` sem feedback. Para um Pro cujo registro ainda não tem `current_period_end` populado (ex.: grant manual via admin, que seta `is_pro`/`plan` mas pode não setar a data), o botão "Cancelar assinatura" aparece (condição da linha 164 só checa `cancel_at_period_end`) mas **não faz nada** ao tocar. **Fix:** ou esconder o botão quando não há `current_period_end`, ou permitir cancelar sem a data e mostrar toast.

7. **[BAIXA] `delete_my_account` não dispara cancelamento real da assinatura** — `account.tsx:506-526` + modal lista "Assinatura Pet Pro (se houver)" (linha 620) como removida — o RPC apaga dados locais mas, pela mesma lacuna do #1 (sem Edge Function de cancelamento), a assinatura no provedor segue cobrando após a conta sumir. Usuário deletado continua sendo cobrado sem ter como acessar o app. **Fix:** garantir cancelamento no provedor dentro do fluxo de delete antes de remover a linha de `subscriptions`.

8. **[BAIXA] Empty state de notificações usa `permission` que no web é sempre "denied"** — `notification-settings.tsx:129-138` — consequência do #3: o ramo nativo do `EmptyState` nunca mostra a mensagem "granted" no web, e como `scheduled` é sempre `[]` no web (linha 51), o empty state aparece sempre junto do `WebPushToggle`, com copy redundante/contraditória ("Habilite as notificações" embaixo de um toggle que diz "Push do navegador ativo"). **Fix:** no web, ocultar o bloco de lista/empty state de lembretes locais (eles não existem no web) e mostrar só o `WebPushToggle` + disclaimer.

### MELHORIAS
1. **[impacto ALTO · esforço MÉDIO] Confirmar identidade/senha antes de excluir conta** — hoje basta digitar "DELETAR" + checkbox (`account.tsx:504`). Para uma ação irreversível que apaga tudo, pedir reautenticação (senha ou OTP) reduz exclusões acidentais e ataques com sessão sequestrada.

2. **[impacto ALTO · esforço BAIXO] Exportar dados também no mobile** — `account.tsx:72-74` o export cai em "Disponível só na web" no nativo. Usar `expo-file-system` + `expo-sharing` pra salvar/compartilhar o JSON resolve a paridade LGPD no app nativo (que é onde o usuário mais está).

3. **[impacto MÉDIO · esforço BAIXO] Banner "tradução parcial" não é traduzido** — `language.tsx:87-89` o aviso está hardcoded em inglês ("Translation is rolling out..."), mesmo com `t()` disponível. Mover pra chave i18n e traduzir nos 3 locales.

4. **[impacto MÉDIO · esforço BAIXO] Reabrir o app não reflete idioma em libs de data** — `i18n/index.tsx` controla strings, mas `account.tsx:3-4` formata datas com `date-fns/locale/ptBR` fixo. Ao escolher en/es, as datas de assinatura continuam em português. Selecionar o locale de date-fns conforme `locale`.

5. **[impacto MÉDIO · esforço MÉDIO] Optimistic update / loading na lista de cuidadores** — `caretakers.tsx:69-86` as mutations de revoke/role só invalidam no `onSuccess`, sem estado pendente nas linhas. Adicionar `isPending` por item (desabilitar botões + spinner) e/ou optimistic update evita duplo-toque e a sensação de travamento.

6. **[impacto MÉDIO · esforço BAIXO] Feedback ao copiar/compartilhar convite quando falha** — `caretakers.tsx:97-101` `handleCopyInvite` só dá toast de sucesso (`if (ok)`); se `copyToClipboard` falhar, o usuário não recebe nada. Adicionar toast de erro no `else`.

7. **[impacto MÉDIO · esforço BAIXO] Acessibilidade dos botões de ícone** — em `caretakers.tsx` os `PressScale` de copiar/compartilhar/editar/remover (linhas 339-397) e o "Cancelar lembrete" (`notification-settings.tsx:484`) não têm `accessibilityLabel`/`accessibilityRole`. São só ícones — leitor de tela anuncia "botão" sem contexto. Adicionar labels ("Remover cuidador", "Compartilhar convite", etc.).

8. **[impacto BAIXO · esforço BAIXO] `t('language.saved')` ok, mas tela de idioma ignora `isReady`/erro de persistência** — `language.tsx:22-26` faz `await setLocale(l)` e já mostra sucesso; `setLocale` engole erros de `AsyncStorage` (`i18n/index.tsx:94`). Em falha de storage o usuário vê "Idioma atualizado" mas a escolha não persiste no próximo boot. Propagar o resultado e avisar se não persistiu.

Arquivos auditados: `petsocial/app/(app)/account.tsx`, `petsocial/app/(app)/notification-settings.tsx`, `petsocial/app/(app)/language.tsx`, `petsocial/app/(app)/edit-profile.tsx`, `petsocial/app/(app)/pet/[id]/caretakers.tsx`, com apoio de `petsocial/lib/queries.ts`, `petsocial/lib/i18n/index.tsx`, `petsocial/lib/i18n/locales/pt-BR.ts` e `petsocial/lib/types.ts`.

Observação: `edit-profile.tsx` está sólido (usa `maybeSingle` via `fetchProfile`, invalida `qk.profile`, valida nome/bio, trata upload com erro) — nenhum bug confirmado ali.

---

## Camada de dados

### BUGS

1. **[ALTA] `toggleLike`/`toggleFollow` não são idempotentes — race condition em double-tap** — `lib/queries.ts:336-344` e `716-729` — fazem `insert` puro na tabela `likes`/`follows`. Se o usuário tocar 2x rápido (ou o duplo-tap de curtir do `post-card.tsx:197` disparar junto com o tap no coração), o segundo `insert` viola a unique constraint `(post_id, pet_id)` e estoura erro 23505, que no `handleLike` faz rollback visual indevido (descurte algo que já está curtido). **Fix:** usar `.upsert(..., { onConflict: 'post_id,pet_id', ignoreDuplicates: true })` no insert e tratar o delete como idempotente; ou no `post-card.tsx` guardar um `inFlight` ref pra ignorar taps enquanto a mutação não resolve.

2. **[ALTA] `PostCard` nunca re-sincroniza `liked`/`likesCount` quando o feed é invalidado** — `components/post-card.tsx:88-89,175` — `liked` e `likesCount` são inicializados do prop só na montagem; depois `handleLike` chama `qc.invalidateQueries({ queryKey: ['feed'] })`, o React Query refetcha e o `post` chega com `likes_count` correto do servidor, mas como o componente é reutilizado (mesma key) e não há `useEffect` resincronizando o state a partir de `post.likes_count`/`post.liked_by_me`, o número exibido fica colado no valor otimista local. Curtidas de outros usuários nunca aparecem sem unmount. **Fix:** adicionar `useEffect(() => { setLiked(post.liked_by_me); setLikesCount(post.likes_count); }, [post.liked_by_me, post.likes_count])`, idem para `commentsCount`.

3. **[ALTA] `handleLike` engole o erro silenciosamente — usuário acha que curtiu mas não curtiu** — `components/post-card.tsx:168-174` — o `catch {}` reverte o state mas não mostra nenhum toast (diferente de `submitComment` em `:191` que faz `toast.error`). Combinado com o bug #1, o like falha em silêncio e o coração só "pisca" de volta. **Fix:** adicionar `toast.error('Erro ao curtir', 'Tenta de novo.')` no catch.

4. **[MÉDIA] `fetchTimeCapsule` usa `.single()` em leitura e ignora o erro** — `lib/queries.ts:2533` — `supabase.from('pets').select('*').eq('id', petId).single()` sem desestruturar `error`; `.single()` lança PostgREST error (PGRST116) se o pet não existir / RLS bloquear, mas aqui o erro é descartado e cai no `if (!pet) throw new Error('pet not found')` — perdendo a causa real (ex.: problema de permissão). **Fix:** trocar por `.maybeSingle()` e desestruturar `{ data: pet, error }`, propagando o erro real.

5. **[MÉDIA] `fetchUnreadMessageCount` quebra quando `last_read_at` é null** — `lib/queries.ts:1700-1721` — para um participante que nunca leu a conversa, `last_read_at` é `null` e o filtro `.gt('created_at', p.last_read_at)` vira `created_at > null`, que no PostgREST retorna zero linhas — ou seja, conversas nunca lidas mostram contador 0 em vez de "todas não lidas". **Fix:** usar fallback `p.last_read_at ?? '1970-01-01'` (ou tratar null com `.or(...)`).

6. **[MÉDIA] Realtime de mensagens invalida cache de TODOS os usuários no canal** — `providers/realtime-provider.tsx:36-51` — o channel `messages` assina `INSERT` sem `filter`, então qualquer mensagem inserida em qualquer conversa do banco chega a todos os clientes conectados e dispara `invalidateQueries(conversations/unreadMessages)` mesmo que o usuário não participe. Vaza metadados (existência de tráfego) e gera refetches desnecessários. **Fix:** filtrar server-side ou checar no callback se `payload.new.sender_id`/`conversation_id` pertence ao usuário antes de invalidar (idealmente RLS no Realtime + filtro por conversas do user).

7. **[MÉDIA] `sendAiMessage` mistura escrita otimista com fallback que polui o banco** — `lib/queries.ts:2666-2704` — quando a Edge Function não está deployada, o catch insere uma mensagem `assistant` "canned" de dev direto na tabela `ai_messages` (`:2693`). Isso persiste texto de placeholder no histórico real do usuário em produção (se a função falhar por qualquer motivo transitório), e ainda conta no rate-limit. **Fix:** não persistir o fallback; retornar mensagem efêmera só pra UI, ou gate por `__DEV__`.

8. **[BAIXA] `addPetTags` / `notify_pet_tag` engolem todos os erros** — `lib/queries.ts:643-657` — o `.then(() => {}, () => {})` descarta silenciosamente falhas de RPC de notificação; se a RPC quebrar (assinatura mudou, RLS), ninguém recebe notificação de tag e não há sinal nenhum. Aceitável como best-effort, mas sem nem um `console.warn` é dead-silent. **Fix:** logar o erro no branch de rejeição (`(e) => console.warn('notify_pet_tag', e)`).

### MELHORIAS

1. **[impacto ALTO · esforço MÉDIO] Mutations centralizadas com optimistic update + rollback no React Query** — Hoje `toggleLike`/`addComment` fazem state local manual no `post-card.tsx` e invalidam `['feed']` inteiro (refetch de tudo). Migrar para `useMutation` com `onMutate`/`onError`/`setQueryData` cirúrgico no item do feed elimina os bugs #1-#3 de uma vez e evita refetch da lista toda a cada like.

2. **[impacto ALTO · esforço BAIXO] Handler global de erro de query** — `providers/query-provider.tsx` não tem `QueryCache({ onError })`. Hoje toda query que falha (perda de rede, RLS) falha em silêncio e a tela fica em loading/empty sem feedback. Adicionar um `onError` global que dispara um toast discreto cobre dezenas de telas de uma vez.

3. **[impacto MÉDIO · esforço BAIXO] Padronizar `.single()` → `.maybeSingle()` em todas as LEITURAS** — Os inserts/upserts com `.single()` estão corretos, mas convém auditar que nenhuma leitura nova use `.single()` (só sobrou o caso #4). Criar lint rule / helper `selectOne()` evita regressão futura.

4. **[impacto MÉDIO · esforço MÉDIO] Paginação no feed e listas** — `fetchFeed`/`fetchMeetups`/`lost_reports` usam `.limit(50/80)` fixo sem cursor. Trocar por `useInfiniteQuery` com keyset (`created_at < cursor`) melhora performance e UX em contas ativas.

5. **[impacto MÉDIO · esforço BAIXO] `staleTime`/`gcTime` por domínio** — `query-provider.tsx` usa `staleTime: 30s` global. Dados estáticos (perfil de pet, protocolos de vacina, places) poderiam ter `staleTime` muito maior; dados sociais (feed, unread) menor. Reduz requests redundantes.

6. **[impacto MÉDIO · esforço MÉDIO] Mover contagens client-side para RPC/SQL** — `fetchUnreadMessageCount` (`:1710`) e `fetchMedications` (`:1742`) fazem `Promise.all` de N queries por linha (N+1). Uma RPC SQL única (ou view com `count`) corta dezenas de round-trips em telas com muitos itens.

7. **[impacto BAIXO · esforço BAIXO] Tipagem real em vez de `as unknown as T`** — Vários retornos fazem `as unknown as LostReportWithPet[]` (`:1349`, `:1359`), `as unknown as FeedRow[]` (`:2544`). Gerar tipos do Supabase (`supabase gen types`) e usar `.returns<T>()` (já usado em alguns pontos como `:387`) remove os casts cegos que escondem mismatch schema↔código.

8. **[impacto BAIXO · esforço BAIXO] `active-pet-provider`: evitar flash de "sem pet ativo" no boot** — `providers/active-pet-provider.tsx:32-45` — `activeId` começa `null` e só é lido do AsyncStorage num `useEffect` assíncrono; durante o primeiro frame `activePet` é `null` mesmo havendo pet salvo, causando piscada. Expor um `hydrated` flag (ou inicializar com o primeiro pet enquanto carrega) suaviza a transição.

Arquivos auditados: `C:\Users\pedro\Downloads\pet social\petsocial\lib\queries.ts`, `C:\Users\pedro\Downloads\pet social\petsocial\providers\active-pet-provider.tsx`, `C:\Users\pedro\Downloads\pet social\petsocial\lib\supabase.ts`, `C:\Users\pedro\Downloads\pet social\petsocial\providers\query-provider.tsx`, `C:\Users\pedro\Downloads\pet social\petsocial\providers\realtime-provider.tsx`, `C:\Users\pedro\Downloads\pet social\petsocial\components\post-card.tsx`.

---

