# Maestro Pet Gestão — como as telas são feitas

Aplicativo em `/gestao/app/*` (Next.js App Router, só componentes de cliente). Os dados vêm direto do Supabase pelo
navegador; quem protege é o banco (RLS). Estrutura do banco: `supabase/migrations/`. Tipos: `src/lib/gestao/banco.ts`
(gerado) e `src/lib/gestao/tipos.ts` (apelidos, listas e rótulos).

## Regras

- Cada tela é `src/app/(gestao)/gestao/app/<rota>/page.tsx`, começa com `"use client"` e usa `useGestao()`.
- Toda consulta filtra por `petshop_id = petshop.id`. Toda inserção envia `petshop_id`.
- Buscar: `useDados(async () => ok(await sb.from(...)...), [deps])`. Depois de gravar: `recarregar()` e, se outra tela
  pode ser afetada, `avisarMudanca()`.
- Lista que pode passar de mil linhas (clientes, pets, agendamentos, lançamentos, produtos, movimentos, estadias): o banco
  entrega no máximo 1000 por consulta e `.limit(5000)` não muda isso. Leia em páginas com `lerTudo` + `contando`
  (`src/lib/gestao/paginas.ts`), sempre com ordem fixa terminando em `.order("id")`.
- Última visita de um pet e "sumido" (já veio, sem vir há mais de N dias e sem nada marcado): só por
  `buscarVisitas` e `sumiu` (`src/lib/gestao/visitas.ts`), para a lista de Clientes, o Chamar de volta e o Hoje darem o mesmo número.
- Gravar: `try { ok(await sb.from(...).insert(...)) ; avisar("…") } catch (e) { avisarErro(e) }`.
- Antes de abrir um formulário de gravação: `if (somenteLeitura()) return;` (`useSomenteLeitura()`), porque a conta
  com teste vencido fica só para consulta.
- Dinheiro só aparece para `vejoFinanceiro`. Ajustes do pet shop só para `souDono`.
- Estadias: nunca `select("*")` em `estadias` (o banco recusa). Use `COLS_ESTADIA` / `SELECT_ESTADIA`; a diária e o valor cobrado
  vêm por `comValoresDeEstadia` (`src/lib/gestao/reservado.ts`), só para quem recebe. Quem não recebe não manda `valor_diaria`:
  o banco coloca a sugerida. Coluna nova em `estadias` precisa de `grant select (coluna)`.
  Também não dá para filtrar nem ordenar `estadias` por `valor_diaria` ou `valor_cobrado` pela API: a lista de check-outs para cobrar
  vem de `idsParaCobrar` (função `estadias_para_cobrar`) e o acerto de um check-out pendente é pela função `estadia_acertar`.
  Gravação em `estadias` sempre com `.select("id")` (sem isso o banco devolve a linha inteira e recusa).
- Opções do negócio: chegam em `petshop.opcoes` pela função `petshop_opcoes` (nunca `select("opcoes")`). Opção nova com preço
  dentro entra na lista da função `opcoes_sem_valores`, no banco, para a equipe sem dinheiro não ler pela API.
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

### Painel (segunda demão do visual)

A plataforma não pode parecer "pobrinha": cada tela abre com um resumo visual antes das listas. Peças prontas em
`src/components/gestao/painel.tsx` (SVG simples, sem biblioteca):

- `<Kpi rotulo valor apoio icone tom href lado />`: cartão de indicador com ícone colorido. Agrupe em
  `<div className="g-grade kpis">` (2 colunas no celular, 4 no computador). Em `lado` cabe `<Anel>` ou `<Tendencia>`.
- `<Tile icone tom tamanho? />`: quadradinho colorido com ícone, para linhas de lista e títulos de cartão.
- `<Anel parte={0..1}>texto</Anel>`, `<Tendencia valores={[…]} />`, `<Barras itens destaque />` (colunas),
  `<Ranking itens />` (barras deitadas com cor), `<Rosca fatias>texto</Rosca>` + `g-legenda`.
- Tons: `pessego | menta | ceu | lilas | manteiga | rosa`. Um tom por assunto, não enfeite aleatório: dinheiro que
  entra é `menta`, que sai é `rosa`, agenda `pessego`, hospedagem `ceu`, pacotes `lilas`, avisos `manteiga`.
- Duas colunas no computador: `<div className="g-duas">` (1,5 : 1) ou `g-duas meio` (1 : 1).
- Título de cartão com apoio à direita: `<div className="g-card-t"><h3>…</h3><span className="g-muted g-pp">…</span></div>`.
- Só mostre gráfico com dado de verdade do banco. Sem número inventado, sem "+12% vs mês passado" se não foi calculado.

## Texto

Português do Brasil, frases curtas, tom de gente ("Nenhum banho marcado para hoje."), sem jargão de sistema
("registro", "cadastro efetuado com sucesso"). Sem promessa de resultado, sem número inventado, sem urgência falsa.
O assistente se chama Mozart. Para abrir o assistente com um pedido pronto: `abrirAssistente("texto")`.
