# Testes automáticos do Maestro Pet Gestão

Suíte que roda contra o Supabase local e o servidor do Next. Cada teste **cria o próprio pet shop** (cadastro e convites pela
API de verdade, e-mails `t-<sufixo>.<papel>@teste-auto.local`) e **apaga tudo no fim**. Nada depende de lojas antigas de teste,
de datas fixas nem do dia da semana: as datas saem de "hoje" no fuso da loja e a loja de teste abre todos os dias das 07:00 às 20:00.

## Como rodar

```bash
# 1. Supabase local no ar, com todas as migrações (supabase/migrations) aplicadas
npx supabase start            # contêiner supabase_db_petsocial; o .env.local aponta para ele

# 2. Build e servidor (outra aba). GESTAO_LINK_IA_FALSO=1: o "Tirar dúvidas do link" responde sem chamar o modelo.
#    GESTAO_ERRO_TESTE=1: liga o gatilho de erro de propósito (tela Hoje com ?__erro_teste=…, rota /api/gestao/erro-teste).
npx next build
ANTHROPIC_API_KEY=sk-ant-chave-falsa GESTAO_LINK_IA_FALSO=1 GESTAO_ERRO_TESTE=1 npx next start -p 3214

# 3. Testes
npm run test:banco       # unidade + banco/API + rotas do servidor   (~1,5 min)
npm run test:telas       # navegador: passeio pelas telas e conta pelo caixa   (~2,5 min)
npm run test:migracoes   # prova de ordem das migrações num banco de rascunho   (~10 s)
npm run test:tudo        # tudo   (~4 min)
npm run test:limpar      # apaga o que um teste interrompido deixou (lojas @teste-auto.local)

node testes/rodar.js banco/dinheiro telas/caixa    # só alguns arquivos
SO=hotel npm run test:banco                       # filtra pelo nome
```

Configuração por variável (todas opcionais):

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `BASE_URL` | `http://localhost:3214` | servidor do Next |
| `SUPABASE_URL`, `SUPABASE_KEY` | do `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `..._PUBLISHABLE_KEY`) | API do Supabase |
| `DB_CONTAINER` | `supabase_db_petsocial` | SQL de preparo e conferência (`docker exec … psql`) |
| `DATABASE_URL` | — | se definida, o SQL vai por `psql $DATABASE_URL` em vez do docker |
| `PLAYWRIGHT` | procura `playwright` no Node e em `/opt/node-tools` | caminho do pacote Playwright |
| `TZ` | `America/Sao_Paulo` (o executor põe) | as funções do app usam o fuso da máquina |
| `MANTER_DADOS=1` | — | não apaga a loja de teste no fim (para olhar) |
| `VERBOSO=1` | — | mostra todas as linhas (com detalhes) |
| `FOTOS=1` | — | o passeio guarda capturas em `testes/saida/` |
| `ESTRITO=1` | — | problema conhecido passa a derrubar a suíte |

Saída: cada arquivo mostra só o que falhou; no fim vem o resumo por arquivo e o total. Código de saída 1 se algo falhou,
2 se o ambiente não está pronto (banco, API ou servidor fora do ar). O log inteiro de cada arquivo fica em `testes/saida/`.

O Playwright não é dependência do projeto (é pesado): o executor usa o que estiver instalado na máquina. Para ter um local:
`npm i --no-save playwright && npx playwright install chromium`.

## O que cada suíte confere

**unidade/**
- `link-ia.js`: o contexto que o assistente do link recebe (horário, preços, hotel com ou sem preço, regras), a leitura da resposta
  (não sei, sugestão de pedido só com serviço e dia válidos, sem links), limites de conversa. Sem banco.
- `valor.js`: leitura estrita do dinheiro digitado (`lerValorEstrito`, `lerValor`, `lerNumeroEstrito`): "abc-5" e "52o,00" são recusados
  (nunca viram 5,00 ou 52,00), milhar e centavos com vírgula ou ponto, "R$" na frente, negativo só onde pode.
- `conflito-estadia.js`: reservas do mesmo pet que se cruzam (`conflitoDoPet`): dia extra para depois com o cão na creche hoje passa;
  outro check-in e reserva para hoje continuam recusados; hotel sem saída prevista continua cruzando.
- `erros.js`: limpeza dos erros antes de irem para o banco (`src/lib/gestao/erros.ts`): e-mail, telefone, valor, uuid, ficha (JWT e
  códigos longos), consulta e âncora do endereço saem; rota com `:id`; pilha só com arquivo:linha; navegador; o que entra e o que é
  ignorado (frases para a pessoa, regra do banco, Mozart fora do ar, sem internet só conta).

**banco/** (API do Supabase com o login de cada papel, como o navegador faz; SQL só para preparar e conferir)
- `seguranca.js`: isolamento entre pet shops e anônimo; dono não mexe na própria assinatura nem vira admin; o que cada papel grava
  (recepção, monitora, tosador, estoque); caixa fechado travado; **matriz de leitura das colunas com dinheiro** por papel
  (dono, recepção, monitora, tosador, estoque, anônimo) e das funções de preço.
- `dinheiro.js`: um dia de banho e tosa pelo **mesmo código das telas** (`lancarPago`, `receberConta`, `receberComCredito`,
  `moverCredito`, `ajustesDoFaturamento`): conta com 3 serviços + produto (baixa o estoque), toque duplo e segundo recebimento
  recusados, pagamento em parte e dívida, crédito do tutor, devolução, "não cobrar", preço travado (o que a recepção não consegue),
  desconto anotado em Alterações em valores, faturamento líquido do dia e **comissão ao centavo** (por serviço e sobre produto) contra a
  conta feita à mão, pagamento da comissão.
- `toque-duplo.js`: cada gravação de dinheiro ou vaga chamada duas vezes ao mesmo tempo: cobranças da creche, receber (com e sem chave,
  em parte, com multa), "pagas por fora", desfazer baixa, dia extra, chamada, pedido do link aceito e sinal, check-out, acerto,
  reserva com sinal, venda de balcão com estoque, entrada de mercadoria, pagamento de comissão.
- `creche.js`: mensalidade cheia, proporcional na entrada e na saída do plano (banco = `sugestaoDoMes` do app = conta à mão),
  dia extra cobrado no mês seguinte, desconto de irmão (banco = `descontoIrmao` do app) e a troca de quem paga cheio, recebimento.
- `creche-rafael.js`: falta avisada com antecedência (quem marca, que dias, vaga livre, reposição só depois do dia, resumo do cartão),
  corrigir a hora de chegada e de saída (só dono e financeiro, mesmo dia, motivo anotado, taxa de busca anotada/tirada/mantida/recusada),
  o acerto da saída que volta até ser feito, e o Mozart `ver_planos_creche` (falta avisada; valor só para quem recebe).
- `hotel.js`: **preço do hotel, banco × aplicativo**: ~740 noites comparadas (`hotel_noite` × `precoDasNoites`) com temporadas
  sobrepostas e empatadas, feriado nos três modos, segundo pet; estadia inteira (`hotel_previsto` × `contaDasDiarias`) com diária por porte;
  faixa de preço do link e "Esconder o preço".
- `hotel-checkout.js`: check-out conferido com o que já foi pago (migração 20261181): receber na saída o total sem descontar o sinal
  pago (ou o sinal a receber em parte) é recusado sem gravar nada (`maestro:passa_do_devido`); a conta certa, o acréscimo digitado, o
  pago a mais virando crédito e a conta paga com o crédito passam; crédito + dinheiro acima do total é recusado. Desfazer check-in:
  a data reservada fica guardada, a monitora desfaz no mesmo dia, tosador/estoque/anônimo não, de novo ou em outro dia não, o check-out apaga.
- `link.js`: link do cliente anônimo: o que mostra, pedido de banho, chamada direta recusada, regras e aceite (texto e vacinas),
  hotel em dia fechado e fora do horário, dia de experiência, nada vira cliente antes de aceitar, link desligado, **freios de envio**
  (por WhatsApp, por rede, por loja; o teste põe os limites padrão em `config_interna` durante o teste e devolve os de antes).
- `link-ia.js`: rota `/api/gestao/link-ia` e funções: ligar/desligar (só o dono), respostas pelo contexto, dados de outro pet shop
  nunca entram, contagens sem texto, limites por conversa, por rede e por dia (o do dia sem mexer na configuração global: a contagem
  da loja de teste sobe até faltar uma). Precisa do servidor com `GESTAO_LINK_IA_FALSO=1`.
- `tutor.js`: página do tutor: só os pets do tutor, fotos pela rota do servidor (assinatura e caminho reserva, bytes certos, cache privado),
  prazo das fotos, faxina dos arquivos (fila, órfãos), quem lê e grava, freio de 30 acessos por minuto. Precisa do servidor.
- `admin.js`: funções do painel do administrador recusadas para anônimo e dono; o admin recebe só dados da conta e quantidades;
  troca de status vai para o histórico. (O admin de teste é criado por SQL: ninguém vira admin pela API.)
- `cakto.js`: webhook da Cakto de ponta a ponta pela rota do servidor: 9 ofertas, ciclo da assinatura (renovada, atrasada, recuperada,
  cancelada), reembolso, contestação, MED, segredo errado, outro produto, e-mail diferente (callback e pagamento sem conta), Escola.
  A configuração da Cakto (`config_interna`) é guardada antes e devolvida igual no fim.
- `erros.js`: registro de erros (migração 20261180): ninguém lê as tabelas; funções do painel só para o admin; papel e áreas vêm do
  banco; limpeza e limites no banco; repetição junta (mesmo aparelho e versão, 10 min); freio por aparelho (30/min), por pet shop
  (60/min) e geral (1000/h, posto no limite durante o teste e devolvido); sem internet só conta; resolvido some e volta numa versão
  nova; rota do servidor que quebra vira registro com origem "servidor". Precisa do servidor com `GESTAO_ERRO_TESTE=1`.
- `mozart.js`: o Mozart e o dinheiro dos clientes com um **modelo de mentira** (roteiro fixo; as voltas de `assistente/conversa.ts` e as
  ferramentas rodam de verdade, com o login de cada papel): "o dono do Bob me pagou os 35" com duas contas abertas (5 + 30) quita as duas
  e o mês ganha 35 uma vez só (a entrada solta é recusada; o toque duplo não recebe de novo), pagamento em parte, pagou a mais (pergunta;
  com `sobra: "credito"` vira crédito), `anotar_divida` ligada ao tutor, `quem_me_deve` por pessoa, papéis (`cliente_receber_contas`
  recusado para quem não mexe com dinheiro, conta e crédito de outro cliente recusados) e o teto de voltas e de tempo.
- `visitas.js`: última visita de cada pet: a função do banco (`visitas_dos_pets`) = a conta do navegador, para o dono e para o tosador.

**migracoes/**
- `prova-ordem.sh`: cria um banco de rascunho no mesmo Postgres (chão copiado do banco local sem o `public`), aplica todas as
  migrações em ordem **menos as adiadas** (`ADIAR`, padrão `20261149 20261157`, as que entram depois de publicar o app) e depois as
  adiadas por cima, cada uma numa transação. Apaga o rascunho no fim (mesmo se falhar). `ADIAR=""` aplica tudo em ordem;
  `MIGRACOES=/outra/pasta` testa outra pasta.

**telas/** (Playwright, Chromium)
- `passeio.js`: todas as telas principais (Hoje, Agenda, Clientes, Creche e hotel, Pacotes, Caixa, Financeiro, Relatórios, Estoque,
  Equipe, Meu pet shop, Assinatura, Manual, Escola) em **390 e 1366**, com o dono e com cada papel da equipe (só as áreas dele, e
  algumas fora da área), as telas de impressão, `/gestao/admin` com dono comum e as páginas públicas (produto, entrar, link do
  cliente, página do tutor). Em cada uma: nenhum erro de página ou console, nenhum pedido recusado, sem rolagem para o lado e com conteúdo.
- `erros.js`: com `GESTAO_ERRO_TESTE=1`, a tela Hoje quebra de propósito (tela, erro solto, promessa) em 390 e 1366: tela
  "Opa, esta tela travou" com Tentar de novo e Voltar para Hoje e o menu, registro no banco (papel, tamanho da tela, versão, sem
  consulta) e a aba Erros do painel (agrupado, detalhes, filtros 24 h / 7 / 30 dias, marcar como resolvido e desfazer).
- `servicos.js`: Marcar horário com vários serviços ("O que o pet vai fazer?"): quatro serviços em 390 (ordem do toque, preço por
  porte, Tempo total e Total, o banco com o principal e os 3 a mais, a agenda, a conta de R$ 145,00 e a comissão por serviço ao centavo);
  em 1366, tirar o primeiro (o seguinte assume), alterar um horário com três serviços, pet sem porte; tosador sem nenhum valor na tela
  (o banco põe o preço da lista) e preço travado para a recepção.
- `checkout-lento.js`: check-out do hotel com a leitura do sinal atrasada 2,5 s (390 e 1366): enquanto carrega, a folha não mostra valor
  e o botão fica apagado (clicar não grava); depois, "Receber R$ 2,75" (110 − sinal 107,25) e "Receber R$ 1,60" (80 − 20% do segundo
  pet − sinal 62,40), uma entrada só cada.
- `caixa.js`: a recepção fecha a conta pela tela (celular pela Agenda, computador pela lista "para cobrar" do Caixa) com **dois
  cliques seguidos no Receber**: uma entrada só, com o valor e os itens certos.

## Resultados que são assim de propósito

- **Ninguém lê preço direto das tabelas** (`agendamentos.preco`, `servicos.preco_*`, `produtos.preco_venda/custo`, diárias, `opcoes`…):
  nem o dono. Os valores vêm pelas funções (`servicos_precos`, `agendamentos_precos`…), só para quem tem área de dinheiro.
- **Cobranças e valores dos planos da creche** só para quem cuida do financeiro: a recepção com Caixa não lê.
- **Dono que marca horário manda o preço**; quem não recebe não manda e o banco põe o da lista.
- **Toque duplo em "aceitar pedido do link" e "reservar dia extra"** pela API: o segundo ouve "Esse pedido já foi respondido." /
  "já está marcado nesse dia" (uma reserva só). A tela trava o segundo toque antes; o teste confere que não duplica.
- **Cobrança da creche já criada não muda de valor** quando o valor do plano muda (acerta-se pela edição da cobrança);
  o desconto de irmão, esse, é refeito na hora em todas as cobranças abertas da família.
- **Status da cobrança da creche** fica `aberta` mesmo paga: "paga" é a conta (`lancamentos.pago`).
- **IA com chave falsa**: o Mozart, a Ajuda e a venda respondem erro no servidor de teste; o passeio ignora esses pedidos e não abre o assistente.

## Problemas conhecidos

`T.conhecido(...)` marca uma conferência de algo que está errado e ainda não foi consertado: roda sempre, aparece no resumo como
"conhecido" e não derruba a suíte (com `ESTRITO=1`, derruba). Quando começa a passar, o teste avisa para virar `T.ok`.

Nenhum no momento. (O freio de envios do link, que a 20261168 e a 20261173 tinham perdido, voltou com a 20261177.)

## Como acrescentar um teste

1. Crie `testes/banco/<assunto>.js` (ou `telas/`). Modelo:

   ```js
   const B = require('../lib/base');
   const { criarLoja } = require('../lib/semente');
   const T = require('../lib/teste')('assunto');
   (async () => T.rodar(async () => {
     const L = await criarLoja(T, { nome: 'Assunto' });   // loja nova; apagada no fim
     T.secao('o que está sendo conferido');
     const r = await L.sb.caixa.from('lancamentos').insert({ ... }).select('id');
     T.recusa('a recepção não lança em outro dia', r);
     T.ok('o banco guardou 1', B.num(`select count(*) from ... where petshop_id='${L.P}'`) === 1);
   }))();
   ```
2. O que a loja já traz (`lib/semente.js`): `L.P`, `L.sb.{dono,caixa,monitor,tosador,estoque}` logados, `L.emails`, `L.senha`, `L.ids`
   (profissionais), `L.S` (serviços por nome, com preço por porte), `L.tutores` (Ana, Beto, Clara, Davi), `L.pets` (Thor M e Mel P da Ana,
   Bob G, Luna M, Rex GG), `L.prod` (Shampoo Neutro, R$ 29,90, estoque 20), `L.codigo` (link), `L.hoje`, `L.dia(n)`, `L.mes1`, `L.mesAnterior`.
   `criarLoja(T, { equipe: false, dados: false })` faz uma loja vazia.
3. Para chamar código do app (`src/lib/gestao/*.ts`): `const { lib } = require('../lib/app'); const D = lib('dinheiro');`.
4. Datas: nunca fixas. Use `L.dia(n)`, `B.proximoDia(L.hoje, [1, 3])`, `B.instante(dia, '10:00', L.fuso)`.
5. Configuração global (`config_interna`, `admins`): guarde o valor de antes e devolva com `T.depois(() => ...)`.
6. Freios por rede: use `B.cliente(B.ipAleatorio())` para não esbarrar no freio de uma rodada anterior.
7. Rode duas vezes seguidas (`node testes/rodar.js banco/<assunto>` duas vezes): tem de passar nas duas.

## Tempo

Medido em 15/11/2026 (servidor já no ar, banco local): `npm run test:tudo` levou 193 a 206 s em quatro rodadas seguidas, 588
conferências em 15 arquivos. Por parte: unidade + banco ~60 s, migrações ~9 s, telas ~130 s (o passeio sozinho ~110 s).
Duas rodadas seguidas passaram sem limpar nada entre elas (cada teste cria e apaga a sua loja).

Cuidado com banco compartilhado: `link.js` e `cakto.js` mudam `config_interna` (global) durante alguns segundos e devolvem no fim.
Outro processo testando o link ou a Cakto no mesmo banco ao mesmo tempo pode ver esses valores.
