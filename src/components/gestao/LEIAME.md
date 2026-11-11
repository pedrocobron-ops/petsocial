# Maestro Pet Gestão — como as telas são feitas

Aplicativo em `/gestao/app/*` (Next.js App Router, só componentes de cliente). Os dados vêm direto do Supabase pelo
navegador; quem protege é o banco (RLS). Estrutura do banco: `supabase/migrations/`. Tipos: `src/lib/gestao/banco.ts`
(gerado) e `src/lib/gestao/tipos.ts` (apelidos, listas e rótulos).

## Regras

- Cada tela é `src/app/(gestao)/gestao/app/<rota>/page.tsx`, começa com `"use client"` e usa `useGestao()`.
- Toda consulta filtra por `petshop_id = petshop.id`. Toda inserção envia `petshop_id`.
- Buscar: `useDados(async () => ok(await sb.from(...)...), [deps])`. Depois de gravar: `recarregar()` e, se outra tela
  pode ser afetada, `avisarMudanca()`.
- Gravar: `try { ok(await sb.from(...).insert(...)) ; avisar("…") } catch (e) { avisarErro(e) }`.
- Antes de abrir um formulário de gravação: `if (somenteLeitura()) return;` (`useSomenteLeitura()`), porque a conta
  com teste vencido fica só para consulta.
- Dinheiro só aparece para `vejoFinanceiro`. Ajustes do pet shop só para `souDono`.
- Dinheiro que entra ou sai na hora: `lancarPago()` de `src/lib/gestao/dinheiro.ts` (já liga ao caixa aberto).
- Datas: `agendamentos.inicio/fim` são `timestamptz`; campos `date` são texto `AAAA-MM-DD` (use `isoDia`, `deIsoDia`).
  Formatação em `src/lib/gestao/util.ts` (`brl`, `hora`, `dataAmigavel`, `dataCurta`, `fmtTelefone`, `linkWhatsApp`…).

## Visual

Classes em `src/app/gestao.css` (prefixo `g-`). Não é planilha: cartões (`g-card`), listas de linhas com avatar
(`g-lista` + `g-linha`), números grandes em Fraunces (`g-num`), etiquetas (`g-tag verde|laranja|vermelho|azul|amarelo`),
chips (`g-chip` com `aria-pressed`), seletor (`g-seg`). Nada de `<table>` com grade.

- Cabeçalho da tela: `<header className="g-topo"><div><h1>…</h1><p className="g-muted">…</p></div><div className="g-acoes">…</div></header>`.
- Um só botão laranja (`g-btn pri`) por tela ou folha: a ação principal. Os outros são `sec`, `verde` ou `fantasma`.
- Formulários abrem em `<Folha>` (sobe de baixo no celular, janela no computador), com os botões em `rodape`.
- Campos: `<Campo rotulo="…">` + `g-input` / `g-select` / `g-textarea`; dinheiro com `<CampoValor>`.
- Pet sempre com `<AvatarPet pet={…} />` e o nome do pet em destaque; o tutor vem em segundo.
- Tela sem dados: `<Vazio titulo="…" texto="…">` com uma frase simpática e o botão da próxima ação.
- Carregando: `<Esqueleto />`. Confirmação antes de apagar: `await confirmar({ titulo, texto, perigo: true })`.
- Ícones: `lucide-react`. Sem emoji. Primeiro o celular (390 px), depois o computador.

## Texto

Português do Brasil, frases curtas, tom de gente ("Nenhum banho marcado para hoje."), sem jargão de sistema
("registro", "cadastro efetuado com sucesso"). Sem promessa de resultado, sem número inventado, sem urgência falsa.
O assistente se chama Mozart. Para abrir o assistente com um pedido pronto: `abrirAssistente("texto")`.
