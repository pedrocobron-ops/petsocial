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
  A conta é feita no banco (função `visitas_dos_pets`, migração 20261174), numa resposta só; `buscarVisitasAqui` é a mesma conta no navegador.
- Celular com internet fraca: consultas que não dependem uma da outra vão juntas (`Promise.all`), nunca uma esperando a outra.
  Folha que só abre com um toque (formulário, detalhe, conta) entra por `next/dynamic` e baixa em segundo plano com `useAdiantar`;
  o que é de fundo espera a tela abrir (`quandoATelaAbrir`, em `ui.tsx`). Nada disso muda o que a tela mostra.
- Gravar: `try { ok(await sb.from(...).insert(...)) ; avisar("…") } catch (e) { avisarErro(e) }`.
- Antes de abrir um formulário de gravação: `if (somenteLeitura()) return;` (`useSomenteLeitura()`), porque a conta
  com teste vencido fica só para consulta. Atalho que leva a gravar (Marcar horário, Cadastrar pet) é `<LinkDeGravar>`: com a conta
  só para consulta vira botão apagado. Teste vencido só trava quando a assinatura abriu (`assinaturaAberta` no `useGestao()`, mesma
  regra do banco em `acesso_liberado`); os textos do fim do teste ficam em `TEXTO_TESTE` (`fim-do-teste.tsx`).
- Dinheiro só aparece para `vejoFinanceiro`. Ajustes do pet shop só para `souDono`.
- Custo e margem de produto (custo médio, último custo, margem, valor em estoque a preço de custo, custo de lote, compra e
  contagem) só para `vejoCusto` (dono, Financeiro, Relatórios ou a chave "custo" em Equipe; banco: `vejo_custo`, migração 20261214).
  Quem não vê recebe o custo vazio: nunca regrave `produtos.custo` com o que veio vazio. No Mozart: `veCusto(c.eu)`.
- Entrada de estoque com a despesa da compra: só por `estoque_entrada` (as duas na mesma transação).
- Estadias: nunca `select("*")` em `estadias` (o banco recusa). Use `COLS_ESTADIA` / `SELECT_ESTADIA`; a diária e o valor cobrado
  vêm por `comValoresDeEstadia` (`src/lib/gestao/reservado.ts`), só para quem recebe. Quem não recebe não manda `valor_diaria`:
  o banco coloca a sugerida. Coluna nova em `estadias` precisa de `grant select (coluna)`. Em produção a 49 e a 57 rodam DEPOIS
  das outras: coluna nova que o app lê direto também entra na lista de `grant` delas (confira com o script de ordem de produção).
  Também não dá para filtrar nem ordenar `estadias` por `valor_diaria` ou `valor_cobrado` pela API: a lista de check-outs para cobrar
  vem de `idsParaCobrar` (função `estadias_para_cobrar`) e o acerto de um check-out pendente é pela função `estadia_acertar`.
  Gravação em `estadias` sempre com `.select("id")` (sem isso o banco devolve a linha inteira e recusa).
- Preços da agenda, da lista de serviços, de venda e diárias padrão: o banco não entrega `agendamentos.preco`,
  `agendamento_servicos.preco`, `servicos.preco_p/m/g/gg`, `produtos.preco_venda` nem `petshops.diaria_creche/diaria_hotel`
  direto da tabela (nem `select("*")` em agendamentos, agendamento_servicos e servicos). Leia `COLS_AGENDAMENTO` / `SELECT_AGENDAMENTO`
  (serviços a mais com `id, servico_id, ordem`), `COLS_SERVICO` / `lerServicos`, `COLS_PRODUTO` e junte os valores com
  `comPrecosDeAgendamento`, `comPrecosDeServico`, `comPrecosDeProduto` (`reservado.ts`); as diárias vêm em `lerPetshop`. Quem não recebe
  recebe os valores vazios; ao marcar ou trocar o serviço, o banco coloca o preço da lista (o que a tela mandar é ignorado).
  Não filtre nem ordene por essas colunas pela API. Coluna nova em `agendamentos`, `agendamento_servicos` ou `servicos` precisa de
  `grant select (coluna)` (migração 20261157). Gravação nessas tabelas sempre com `.select("id")`.
- Link do cliente: todo pedido vai por `pedirPeloLink` (função `link_pedir_com_termos`); as funções de pedido não aceitam chamada direta.
- Opções do negócio: chegam em `petshop.opcoes` pela função `petshop_opcoes` (nunca `select("opcoes")`). Opção nova com preço
  dentro entra na lista da função `opcoes_sem_valores`, no banco, para a equipe sem dinheiro não ler pela API.
- Dinheiro que entra ou sai na hora: `lancarPago()` de `src/lib/gestao/dinheiro.ts` (já liga ao caixa aberto).
- Toque duplo não lança duas vezes: toda folha que grava dinheiro ou estoque usa `useOperacao()` (`src/lib/gestao/uma-vez.ts`).
  `op.fazer(async (chave) => …)` trava na hora do primeiro toque e entrega a chave da operação; passe a chave para
  `lancarPago`, `lancarAReceber`, `receberConta`, `quitarConta`, `baixarEstoque`, `gravarMovimentos` (ou `p_chave` nas funções do banco).
  O banco aceita cada chave uma vez por pet shop e, repetida, devolve o que já gravou. Operação com mais de uma gravação:
  `parteDaChave(chave, "nome")` para cada uma. Devolva `false` quando gravou só uma parte e deu erro (a nova tentativa reaproveita a chave).
- Atendimento concluído sem conta fechada: `useParaCobrar()` e `<AtendimentosParaCobrar />` (`agenda/para-cobrar.tsx`); o banco diz
  quais são, sem valor. Preço mudado e desconto na venda ficam em `precos_alterados` (o banco anota sozinho; só quem cuida do financeiro lê).
  Também anotados pelo banco (migração 20261160): horário marcado abaixo da lista (`preco_agenda`), serviço já feito tirado da conta
  (`servico_tirado`), "não cobrar" (`sem_cobranca`, com `agendamentos.sem_cobranca_nome/_em`) e pacote fora do modelo (`pacote`). Com a trava
  (`dinheiro.preco_travado`), quem não cuida do financeiro é recusado nesses casos e ao baixar o valor de uma venda já recebida.
  Regra única do dinheiro de um atendimento concluído (migração 20261169, função `conferir_valor_baixou`): o banco guarda o valor na hora de
  concluir (`agendamentos.valor_concluido`, sem leitura pela API) e anota (ou, com a trava, recusa para quem não cuida do financeiro) voltar
  para marcado, apagar, concluir de novo por menos, tirar serviço, mudar o preço de venda de produto, saída de estoque como "Venda" sem a venda
  (a saída deve nascer com `lancamento_id` de uma venda com o produto nos itens) e perda/saldo corrigido para menos. Porte trocado para
  menor com horário recente e forma de pagamento trocada (`alterou_forma`) também aparecem em Alterações em valores.
- Faturamento (Relatórios, Hoje, Financeiro, meta): sempre por `ajustesDoFaturamento` + `faturamentoLiquido` (`src/lib/gestao/faturamento.ts`):
  entradas − devoluções (saídas em `CATEGORIAS_DEVOLUCAO`) − crédito deixado para o tutor + crédito usado fora de uma entrada. O Caixa conta só dinheiro.
- Crédito do tutor numa conta: a entrada vai pelo valor cheio com `creditoUsado` em `lancarPago` (parte "outro" no pagamento, montada por
  `pagamentoComCredito`); conta a receber paga com crédito por `receberComCredito` (função `receber_conta_com_credito`). O banco tira do crédito
  na mesma gravação (`clientes_creditos.lancamento_id`; apagar a entrada devolve). Na tela: `<UsarCredito>` (`financeiro/comum.tsx`).
  Somas por forma: `somaPorForma` separa a parte do crédito em `FORMA_CREDITO`; `textoDoPagamento` mostra "Crédito do tutor".
- "Cobrar a diferença": a entrada fica em `lancamentos.diferenca_de` (o banco liga pela marca do item e recusa a segunda); comissão, relatórios
  (`cobradoPorServico(..., diferenca)`) e o horário somam a conta fechada e a diferença.
- Valor em estoque: sempre `valorEmEstoque` (`compra.ts`), que usa o custo médio sem arredondar (`custo_exato`, que `comCustos` traz
  pela função `produtos_custo_exato`, migração 20261222). Entrada de produto com Controlar validade pede a validade (`estoque_entrada` recusa sem ela).
- Texto para o tutor que fala do pet: passe o `sexo` do pet (`textoConfirmacao`, `textoLembrete`, `textoPronto`… em `agenda.ts`; `marcadoPara`
  para "Mel marcada"). Nome de alguém da equipe em chip ou lista: `nomeNaEquipe(nome, todos)` (não o primeiro nome solto).
- Saída de estoque de uma conta: `baixarEstoque(..., lancamentoId, chave, estadiaId)`; sem lançamento (check-out pago pelo sinal ou pelo crédito), a estadia.
- Conta do atendimento: o que o tutor deve de antes entra com "Incluir nesta conta?" (baixa por `receberConta` com `parteDaChave`); pagamento em
  parte em qualquer forma por `pagoAMenos` (`EstadoPagamento.parte`/`resto`, só com `aceitaResto`).
- "Recebeu quanto?" fica em `EstadoPagamento.entregue`: `fecharPagamento` recusa dinheiro a menos; a conta do atendimento usa `dinheiroAMenos`
  (recebe a parte e anota o resto para o tutor).
- Orçamento, troca e devolução, limite de fiado (migração 20261200):
  orçamento em `orcamentos` (`loja/orcamento.tsx`, regras em `src/lib/gestao/orcamento.ts`): o banco refaz subtotal e total
  (`orcamento_conferir`); "Transformar em venda" usa `VendaBalcao` com `orcamento` (`fazerTudoOuNada` com `orcamento_vender`) e o
  horário com `FormAgendamento servicosIniciais` + `orcamento_marcar`; página pública `/gestao/orcamento/<código>` (`orcamento_publico`).
  Troca e devolução só por `devolver` (`src/lib/gestao/devolucao.ts`, função `venda_devolver`, folha `loja/devolucao.tsx`): nunca
  apague a venda para devolver um produto. Limite de fiado: toda conta a receber nova de um cliente passa antes por `conferirLimite`
  (`src/lib/gestao/fiado.ts`); o banco recusa sem liberação (`maestro:limite_fiado`), e só dono ou financeiro libera (`fiado_liberar`).
- O que a pessoa começou e não pode se perder ao recarregar (leitura paga do caderno): tabela `rascunhos` (migração 20261217), uma linha
  por pet shop, pessoa e `tipo`, só a própria pessoa lê; sai ao salvar ou descartar e sozinha depois de 7 dias. Rascunho de digitação
  barata (guia inicial, formulários) continua no aparelho (`lembrado.ts`). Planilha de clientes: só por `importar_clientes` (tudo ou nada,
  resumo contado no banco, guardado em `importacoes`), com as linhas montadas por `linhasParaOBanco` (`src/lib/gestao/planilha.ts`).
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
Mozart (migração 20261215): a conversa e o cartão pendente ficam na aba (`assistente/guardada.ts`) e voltam depois de recarregar;
cada cartão confirmado é marcado no banco antes de gravar (`assistente_acao_reservar`, por `responderCartoes`), então a mesma
confirmação de novo não grava duas vezes. Creche e hotel nunca viram horário da agenda: reserva é `reservar_estadia`
(`assistente/ferramenta-estadia.ts`). A bolha mostra negrito e lista por `TextoMozart` (`assistente/markdown.ts`); nada vira HTML.

Modo simples (`src/lib/gestao/modo-simples.ts`, opção `geral.modo_simples`, desligado em quem nunca mexeu): tela nova com coisa avançada
pergunta `modoSimples(petshop)` e esconde (nunca apaga); tela inteira avançada entra em `foraNoModoSimples` e vai para Outras áreas.
Ajuda: um lugar só, o botão "Ajuda" da barra de cima (casca) e o Ajuda do menu abrem a mesma folha (`manual/ajuda-da-tela.tsx`).
Nomes: "Link do cliente" (não "link de agendamento"), "Fechar a conta", "Faço depois"; a mesma conta dos primeiros passos (`textoFaltam`).
Nome da casa: quem usa só hotel lê "Hotel", só creche lê "Creche" (`nomeDaCasa`). A categoria gravada continua "Creche e hotel"; na tela,
use `categoriaAtual(categoria, petshop)` (Financeiro, Caixa, contas). Áreas da equipe com `areasPara(petshop)` / `pilulasDe(p, petshop)`.
O manual troca sozinho (`textoDaCasa` em `manual.ts`). Interruptor (`role="switch"`) sempre com `aria-label` ou texto dentro.

## Painel do administrador (`/gestao/admin`, só `sou_admin()`)
- Abas: Visão geral (`admin/visao.tsx`, função `admin_visao_geral`), Uso (`admin/uso.tsx`, `admin_uso` + `admin_uso_contas`, sinais em `sinaisDe`),
  Contas (lista de `admin_painel`; a folha usa `admin/conta.tsx` com `admin_conta`: histórico e mensagens prontas), Conversas, Escola, Cakto.
- Regra: o painel recebe só dados da conta e quantidades. Nada de nome/telefone de cliente, pets ou valores do pet shop. Função nova de admin
  é security definer, começa com `if not public.sou_admin() then raise exception`, e tira o `execute` de `public, anon`.
- Aba Erros (`admin/erros.tsx`, `admin_erros` e `admin_erro_resolver`, migração 20261180): erros que as pessoas encontraram, agrupados.
  Quem registra: `VigiaDeErros` (layout de /gestao: erro solto e promessa), `error.tsx` (tela que quebrou), `avisarErro`/`useDados`
  quando o erro é técnico (`classificar` em `src/lib/gestao/erros.ts`) e as rotas do servidor (`comRegistro` e `registrarErroServidor`,
  `src/lib/gestao/erros-servidor.ts`; o que escapa cai em `src/instrumentation.ts`). Tudo passa por `montarErro` (limpa) e o banco limpa
  de novo. Rota nova do servidor: exporte `comRegistro("/api/gestao/<rota>", tratar)`. Nunca mande corpo de pedido, nome, telefone ou valor.
- Trocas de status ficam em `petshop_status_hist` (gatilho em `petshops`, migração 20261175); sem regra de RLS, só as funções leem.

## E-mail da conta não prova nada (migração 20261209)

"Confirm email" está desligado no Supabase: qualquer um cria conta com qualquer e-mail. Nada que dá acesso usa só o e-mail:
- convite da equipe: código no link (`convite_gerar`, só o hash em `convites_equipe`, 7 dias, uso único) e `convite_aceitar`
  com o e-mail da conta igual ao do convite; `entrar()` só lista os pet shops. Telas: `criar-conta?email=…&convite=…`,
  `entrar?convite=…`, `equipe/pecas.tsx` (`Convite`, `useLinksDosConvites`);
- Escola: `meu_email()` só devolve o e-mail provado (`emails_confirmados`, gravado por `email_provar` quando a sessão nasceu de
  um código ou link mandado para o e-mail depois que ele foi posto na conta);
- Cakto: ver abaixo.

## Cakto (assinatura)

- Aviso de pagamento: `src/app/api/gestao/cakto/route.ts` → função `cakto_evento` (casa a loja pela assinatura, pelo `callback` do link
  = `<id do pet shop>.<ficha>` assinado pelo banco em `assinatura_callback` e, por último, pelo e-mail do dono só se esse e-mail
  já estava na conta antes da compra: `emails_desde`, `pago_em` = paidAt; o `cakto_email` de uma compra antiga não puxa mais
  compras novas, migração 20261209) →
  `cakto_aplicar` (status, plano, período, `pago_ate`). Por callback ou e-mail, compra para uma conta com outra assinatura em dia
  vira "conflito" (fica em Pagamentos sem conta), e cancelamento/reembolso só vale para a assinatura gravada ou o mesmo pedido.
- Contagens de uso de IA: Mozart e Ajuda contam no banco (`assistente_contar`, por dia no fuso do pet shop; toda chamada ao
  modelo conta). O "Tirar dúvida" do link e o chat de venda contam com o segredo do servidor (`src/lib/gestao/servidor.ts`;
  ligue a "Trava do servidor" na aba Cakto do painel depois de publicar).
- Tudo se configura no painel do administrador, aba **Cakto** (`src/components/gestao/admin/cakto.tsx`): chave secreta de cada
  webhook (o banco guarda só o sha256), link e código de cada uma das 9 ofertas, código do produto, abrir a assinatura e
  ligar pagamentos que chegaram com outro e-mail. Nada disso precisa de SQL nem de publicar o site.
- Links de pagamento: `linkDe()` em `src/lib/gestao/planos.ts` (banco primeiro, pela função pública `gestao_assinatura`; variável
  `NEXT_PUBLIC_GESTAO_CHECKOUT_*` da Vercel como reserva). O app carrega os links no `GestaoProvider`.
