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
#    GESTAO_CADERNO_FALSO=1: "Trazer do caderno" devolve uma leitura fixa (caderno-ia.ts, leituraDeTeste) sem chamar o modelo.
npx next build
ANTHROPIC_API_KEY=sk-ant-chave-falsa GESTAO_LINK_IA_FALSO=1 GESTAO_ERRO_TESTE=1 GESTAO_CADERNO_FALSO=1 npx next start -p 3214
#    GESTAO_BOLETIM_FALSO=1: "Escrever com o Mozart" no boletim do pet responde sem chamar o modelo.
npx next build
ANTHROPIC_API_KEY=sk-ant-chave-falsa GESTAO_LINK_IA_FALSO=1 GESTAO_ERRO_TESTE=1 GESTAO_BOLETIM_FALSO=1 npx next start -p 3214

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
- `link-ia.js`: o contexto que o assistente do link recebe (horário, preços, hotel com ou sem preço, desconto do segundo pet, regras), a leitura da resposta
  (não sei, sugestão de pedido só com serviço e dia válidos, sem links), limites de conversa. Sem banco.
- `boletim.js`: textos do boletim do pet (`src/lib/gestao/boletim.ts`): "Oi, Ana! O boletim do Thor de hoje: <link>" (primeiro nome
  do tutor, do/da/de pelo sexo do pet), texto pronto só com os recados marcados, recados guardados e lidos de volta, dados do
  modelo sem nada do tutor, limpeza da resposta do modelo (markdown, link, telefone) e o link do Google (aceitos e recusados).
- `valor.js`: leitura estrita do dinheiro digitado (`lerValorEstrito`, `lerValor`, `lerNumeroEstrito`): "abc-5" e "52o,00" são recusados
  (nunca viram 5,00 ou 52,00), milhar e centavos com vírgula ou ponto, "R$" na frente, negativo só onde pode.
- `proporcional.js`: primeira cobrança proporcional do mensalista **desde o começo do plano** (`sugestaoDoMes`), conferida à mão ao
  centavo em novembro de 2026: 8 de 13 dias × R$ 720 = 443,08; 7 de 13 = 387,69 (o valor que a tela dava "a partir de hoje" para um
  plano de 01/11, que agora é o mês inteiro); seg a sex 9 de 21 × 1.100 = 471,43; dia fechado fora da conta; pausa no mês.
- `conflito-estadia.js`: reservas do mesmo pet que se cruzam (`conflitoDoPet`): dia extra para depois com o cão na creche hoje passa;
  outro check-in e reserva para hoje continuam recusados; hotel sem saída prevista continua cruzando.
- `parecido.js`: nomes parecidos para pedidos falados (`assistente/parecido.ts`, usado por `buscar_pets` quando o nome não bate):
  "tor" acha o Thor, "luna" a Lunna, "mau" a Mel (e a Bel: mais de um, o Mozart pergunta), pelo tutor e pelo começo do nome; nada
  inventado para nomes longe.
- `juliana.js`: o que a testadora Juliana achou: o nome do cadastro na resposta do Mozart (`parecido.ts`, `manterNomes`: "Tutora Teste 1"
  volta a ser "Tutor Teste 1"; Bruno Silva e Bruna Silva no cadastro, nome de uma palavra e palavra dentro de outra ficam como estão;
  `nomesDosResultados` tira os nomes de `buscar_pets` e do cartão confirmado), as cores da agenda (`cores.ts`: `corLivre`, `trocasDeCor`
  com o primeiro de cada cor ficando e os outros ganhando cor livre, desativado fora, mais serviços que cores), onde cada opção de
  Personalizar fica no menu (`noMenu`: Agenda, Estoque e Caixa, Pacotes, "Creche e hotel" com as duas e "Creche"/"Hotel" com uma, igual
  a `nomeDaCasa`) e quando ligar creche ou hotel pergunta do link (`linkPergunta`: só com o link ligado e a área nova fora do link).
- `textos.js`: textos que as testadoras acharam confusos: o comprovante com parte da dívida antiga ("Pagou R$ 40,00 do que devia de
  antes (R$ 75,00); ainda deve R$ 35,00", sem repetir o resto; quitado; chamada antiga sem o total) e as iniciais sem as palavras
  pequenas ("Banho e Tosa" = BT, "Hotelzinho da Bia" = HB).
- `caderno.js`: leitura do caderno ou do outro sistema (`caderno.ts`, `caderno-ia.ts`): datas como estão escritas ("12/10" sem ano:
  para quem deve, a mais recente até hoje; na agenda, a mais perto de hoje), horas ("14h", "9h30"), a limpeza do que a IA devolve
  (valor ilegível fica em branco com "Verificar", preço único espalhado pelos portes, próxima dose da carteirinha só quando escrita),
  a leitura de teste, o esquema estrito (todo objeto fecha e pede todos os campos), o tipo do arquivo pelos bytes e as páginas do PDF.
- `caixa-fichas.js`: textos e contas do caixa e das fichas (Bia, hotel só): o sinal sem a data velha (`descricaoAtual`: "Sinal da
  reserva: hotel de Thor, 19/11" vira "Sinal da reserva: hotel de Thor", "(parte)" fica); "Creche e hotel" como "Hotel" ou "Creche"
  pela entrada e pelo que o pet shop faz (`nomeDaCategoria`); o que é de cada pet (`lancamentoDoPet`: diária, sinal, devolução, sem
  pegar "Melissa" pela "Mel"); o Mozart num hotel só diz "Hotel".
- `bom-dia.js`: o "Bom dia" do Mozart (`src/lib/gestao/bom-dia.ts`): no máximo 3 linhas na ordem dia (agenda, buraco livre, casa),
  quem deve e vem hoje, vacina de quem vem, pacote no último uso, aniversário; sem `devem` (papel sem dinheiro) nada de R$; só
  "agenda livre" não vira cartão; buraco na agenda com almoço e funcionamento; a linha da validade (quem cuida do estoque:
  "Validade: 2 produtos vencidos na prateleira e 3 vencem em até 30 dias.") depois de quem deve e antes da vacina. E a prévia da autorização das fotos
  (`fotos-redes.ts`): o @ arrumado igual ao banco e a frase "Sem marcar o meu perfil." trocada.
- `erros.js`: limpeza dos erros antes de irem para o banco (`src/lib/gestao/erros.ts`): e-mail, telefone, valor, uuid, ficha (JWT e
  códigos longos), consulta e âncora do endereço saem; rota com `:id`; pilha só com arquivo:linha; navegador; o que entra e o que é
  ignorado (frases para a pessoa, regra do banco, Mozart fora do ar, sem internet só conta).
- `modo-envio.js`: a fila do Mandar mensagens (`src/lib/gestao/modo-envio.ts`, `montarFila`): uma mensagem por tutor e por tipo, na ordem
  pronto, lembrete, chegada, cobrança, saúde, pacote, aniversário, aniversário do tutor, chamar de volta; o texto igual ao das outras telas (`mensagemDoLembrete`,
  `textoPronto`, `mensagemSaude`, `montarMensagem` com o texto do pet shop, `mensagemDeDivida`, chegada do hotel) e a renovação do pacote;
  de fora com o motivo: sem telefone, telefone incompleto, "não quer receber mensagens"; o texto mudado vai no link wa.me.
- `promo-niver-pacote.js`: as contas da promoção em dias fracos (`promocoes.ts`, as mesmas do banco): qual vale (dia, hora, serviço,
  "todos do banho e tosa" sem creche, fim, desligada, criada depois do horário; mais de uma: a que dá mais desconto), quanto tira da conta
  (só os serviços da promoção, % arredondado no centavo, R$ uma vez até a soma, tirada não tira), "de R$ 60 por R$ 54", o texto para
  copiar sem "só hoje"; o aniversário do tutor (`aniversario.ts`: sem ano = 1904, 29/02 no dia 28 em ano não bissexto, datas que não
  existem) e as frases e o texto de oferecer renovar do pacote acabando (`pacote-acabando.ts`, 1 uso / 7 dias / 30 dias).
- `compra-etiquetas.js`: códigos de barras das etiquetas (`codigo-barras.ts`): EAN-13 só com 13 números e dígito certo, senão
  Code 128; a tabela do Code 128 conferida (106 símbolos de 11 módulos, barras pares, todos diferentes); vetores conhecidos
  (MP000001 = início B, M, P, troca C, 00 00 01, verificador 33; 7891234567890 com o verificador 43; os desenhos de
  4006381333931 e MP000001 conferidos com um leitor de verdade, zxing-cpp, ao escrever) e o decodificador de `lib/barras.js`
  (tabela do EAN em larguras, independente da do app) lendo de volta 16 códigos. Sugestão de compra (`compra.ts`) à mão:
  21 em 6 semanas = 3,5 por semana, 7 + mínimo 3 = 10, tem 4: comprar 6 (com a explicação escrita); 8 semanas; caixa de 12;
  venda desfeita desconta e uso no banho conta; perda à parte; sem vendas recentes sem sugestão; produto de 10 dias; parados,
  acabando e valor em estoque (custo × quantidade). Kits e contagem (migração 20261201): o kit fica de fora do O que comprar e do
  valor em estoque (a venda dele conta nos produtos do kit); a diferença da contagem sobre o esperado (−1 e +1, −R$ 2,36 ao centavo),
  o que está só na tela comparado com o saldo de agora, e a planilha sem colunas de R$ para quem não vê o financeiro.

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
- `hotel-bia.js`: achados da Bia no hotel. **Sinal recebido junto** (`receberSinaisJuntos`, `src/lib/gestao/sinal-junto.ts`):
  Thor (sinal 107,25, já pagou 100,00) e Mel (62,40) da Ana, chegada no mesmo dia, viram o grupo "Thor e Mel · sinal R$ 69,65"
  (o Bob, de outro tutor, fica fora); dois toques com a mesma chave ao mesmo tempo: R$ 69,65 entram uma vez, nenhum lançamento
  novo, os dois sinais pagos; a mesma chave depois devolve "repetido"; outra chave com os sinais já pagos é recusada
  (`maestro:conta_mudou`). Pagamento dividido (Pix 60 + dinheiro 20 para sinais de 50 e 30) repartido ao centavo entre as contas.
  Um dos sinais recebido em outra tela: recusado e nada entra; o tosador não recebe. **Pago adiantado** no check-in de quem chegou
  agora (mesmos passos de `lancarSinal`, `sinal_pagamento.adiantado`): dois toques entram uma vez; o check-out que recebe o total
  sem descontar é recusado (`maestro:passa_do_devido`) e o certo (110 − 100 = 10) passa.
- `link.js`: link do cliente anônimo: o que mostra, pedido de banho, chamada direta recusada, regras e aceite (texto e vacinas),
  hotel em dia fechado e fora do horário, dia de experiência, nada vira cliente antes de aceitar, link desligado, **freios de envio**
  (por WhatsApp, por rede, por loja; o teste põe os limites padrão em `config_interna` durante o teste e devolve os de antes).
- `link-ia.js`: rota `/api/gestao/link-ia` e funções: ligar/desligar (só o dono), respostas pelo contexto, dados de outro pet shop
  nunca entram, **desconto do segundo pet** ("Se eu levar dois cachorros juntos tem desconto?": sem desconto, "Não sei"; com 20%
  ligado, `link_hotel_opcoes.segundo` = 20 e a resposta de teste, que lê o mesmo texto que iria ao modelo, traz "20% de desconto";
  com "Esconder o preço", some), contagens sem texto, limites por conversa, por rede e por dia (o do dia sem mexer na configuração global: a contagem
  da loja de teste sobe até faltar uma). Precisa do servidor com `GESTAO_LINK_IA_FALSO=1`.
- `tutor.js`: página do tutor: só os pets do tutor, fotos pela rota do servidor (assinatura e caminho reserva, bytes certos, cache privado),
  prazo das fotos, faxina dos arquivos (fila, órfãos), quem lê e grava, freio de 30 acessos por minuto. Precisa do servidor.
- `boletim.js`: boletim do pet (migração 20261189): quem sobe foto e grava por área (agenda para o banho, creche e hotel para a
  estadia; estoque, outro pet shop e anônimo não), conferências do `boletim_salvar` (visita, pet, pasta, assinatura, até 4 fotos,
  foto de outro boletim), leitura por área, gravar direto na tabela recusado, foto trocada vai para a fila, `boletim_enviado`;
  página pública (`boletim_publico`: só o que mostra, nada do tutor, nenhum caminho de foto), rota da foto (bytes, 404), página com
  og:image e noindex; **valor e pagamento** só com `boletim.valores` (sem conta: R$ 90 falta 90; conta a receber paga em parte:
  pago 50, falta 40; outra dívida do tutor nunca entra; creche sem valor); link do Google (válido, recusado, no link de
  agendamento); rota "Escrever com o Mozart" (`GESTAO_BOLETIM_FALSO=1`: texto de teste, nunca o modelo; 401, 403; **limite do dia**
  `boletim_ia_dia` sem mexer na configuração global: a contagem da loja sobe até faltar um, depois volta o texto pronto);
  prazo de 60 dias (página e foto somem, as fotos ficam), freio de 60 aberturas por minuto (PT429); álbum (`album_criar`,
  `album_publico`, rota da foto, vencido some); foto apagada só pelo dono (sai do boletim e do álbum, vai para a fila), faxina dos
  arquivos (fila, órfãos de mais de um dia), faxina geral e pet apagado. Precisa do servidor com `GESTAO_BOLETIM_FALSO=1`.
- `fotos-redes.js`: autorização para postar a foto do pet (migração 20261196): texto exato montado pelo banco (do/da, dia, @),
  nada vem marcado (sem escolha é recusado), @ inválido recusado, mesma escolha devolve a mesma, quem lê (dono, recepção, tosador,
  monitora; estoque, outra loja e anônimo não; ninguém lê o código do "Não quero mais"; ninguém grava direto), freio de 5 por minuto
  por boletim (PT429), "todas" vale para o boletim e os seguintes (nunca os mais velhos), rotas do servidor (autorizar 200/400,
  página do link 200/404, "Não quero mais" tira todas). `gestao_bom_dia` por papel: dono e recepção veem quem deve; tosador sem
  dinheiro e sem pacote; monitora só a casa; estoque só o dia; outra loja nada; anônimo recusado. Precisa do servidor.
- `admin.js`: funções do painel do administrador recusadas para anônimo e dono; o admin recebe só dados da conta e quantidades;
  troca de status vai para o histórico. (O admin de teste é criado por SQL: ninguém vira admin pela API.)
- `admin-pagantes.js`: clientes pagantes rumo aos 15 (migração 20261206): `admin_pagantes` e `admin_empresa_marcar` recusados para
  anônimo, dono e recepção; ninguém (nem o admin) lê ou grava `admin_empresa_passos` direto; `admin_status_em` fora da API. Pagante =
  ativa ou atrasada (teste, cortesia e cancelada com período pago ficam de fora); `hoje` = tamanho da lista; cada loja com desde e pago
  até. Passos: marcar (sem duplicar, com quem marcou), desmarcar, passo desconhecido recusado. Evolução: 6 meses fechados; histórico
  montado (teste → ativa → cancelada) dá o status certo no fim de cada mês; mês antes do primeiro registro volta como não confiável;
  a contagem do mês bate com o banco. Os passos são globais: o teste guarda e devolve como estavam.
- `aceites.js`: aceite dos Termos e da Política (migração 20261197): cadastro com `aceite` nos dados grava os dois documentos na versão
  em vigor (`src/lib/gestao/documentos.ts`), sem `aceite` (ou com lixo) não grava e não derruba o cadastro; cada um lê só os seus;
  gravar, mudar ou apagar direto recusado; `aceitar_documentos` (anônimo e versão estranha recusados, dois toques gravam uma vez,
  com o navegador); `admin_aceites` só para o admin (com o pet shop e a contagem por versão); login apagado deixa o aceite com o e-mail.
  **Contas de teste:** todo cadastro dos testes passa `B.dadosDoCadastro()` (o mesmo aceite da tela Criar conta); sem isso o login
  pararia na tela de aceite de versão nova e `N.entrar` não acharia o aplicativo.
- `entrada.js`: checklist de entrada com termo (migração 20261202): quem grava e lê por área (agenda para o banho, creche e hotel para a
  estadia; estoque, outro pet shop e anônimo não), conferências de `entrada_salvar` (visita, pet, chips fora da lista, foto fora da pasta
  ou que não subiu, até 4, foto de outra entrada), dois toques no Salvar = uma entrada, gravar direto na tabela recusado; assinatura no
  aparelho (`entrada_assinar`: nome, PNG na pasta, uma vez só); mudar depois do aceite apaga o aceite e põe a assinatura antiga e a foto
  tirada na fila; link de 7 dias (`entrada_link`: precisa da assinatura de cada foto, o mesmo código de novo), página pública
  (`entrada_publica`: nada do tutor nem caminho de arquivo; página com noindex), foto pela rota do servidor (bytes, 404), "Li e concordo"
  pela rota `/gestao/entrada/<código>/aceite` duas vezes ao mesmo tempo = um aceite, com o navegador; vencido some; pertences devolvidos
  (`entrada_devolver`); faxina (arquivo solto de mais de um dia, fila, nunca o que está em uso) e horário apagado. Precisa do servidor.
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
  recusado para quem não mexe com dinheiro, conta e crédito de outro cliente recusados) e o teto de voltas e de tempo. **Nome do tutor**
  (Juliana): "pipokinha" acha a Pipoquinha pelo nome parecido, o cartão mostra "Pipoquinha (Tutor Teste 1)", o resultado gravado leva o
  `cartao_confirmado`, e o "Ela é da Tutora Teste 1." do modelo de mentira sai como "Tutor Teste 1"; as instruções pedem os nomes exatos.
- `divida-caderno.js`: dívida trazida do caderno (migração 20261186, `lancamentos.devido_desde`): dono e recepção anotam com o dia
  em que começou; o banco recusa dia depois de hoje, valor já recebido, saída, antes de 2000 e o tosador; anotar não vira dinheiro em
  dia nenhum; receber uma parte entra hoje, no caixa, e a conta segue "desde" o dia do caderno; a dona corrige o dia depois.
- `caderno.js`: rota `/api/gestao/caderno` com a leitura de teste e o freio `caderno_contar` (migração 20261188). Papéis: sem login 401,
  sem Clientes (estoque) 403, Quem me deve só com dinheiro, Agenda só com a área Agenda, Tabela de preços só o dono, carteirinha
  com quem edita a saúde (monitora); "Não sei" tira o que a pessoa não pode trazer (com aviso) e nunca devolve carteirinha nem preços.
  PDF do outro sistema lido e contando as páginas (o número do aparelho, menor, não vale). Recusados sem contar: planilha/texto (415),
  ".jpg" que não é foto, PDF acima de 10 MB e de 25 páginas (413), 6 fotos ou 3 PDFs (400), sem arquivo. Limite do dia por pet shop
  (`caderno_dia`, padrão 30; a contagem da loja sobe até faltar uma) com quanto resta, e o geral (`caderno_dia_geral`, posto logo
  acima do lido hoje durante o teste e devolvido); ninguém lê a tabela de uso e ela não tem texto. Dívida com "desde" pelo mesmo
  `lancarAReceber` da tela, duas vezes ao mesmo tempo com a mesma chave: uma conta só; o tosador não anota. **Leitura que falha não
  conta** (migração 20261195, `caderno_reservar`/`caderno_devolver`; o campo `teste_falha` só vale com `GESTAO_CADERNO_FALSO=1`):
  erro do modelo 502 e recusa 422 devolvem as páginas; a reserva nunca volta para o aparelho; outro pet shop e anônimo não devolvem;
  devolver duas vezes não tira mais nada; duas leituras ao mesmo tempo na última página: uma passa. **PDF grande pela pasta
  temporária** (`caderno-tmp`): PDF de 6 MB sobe e vai só pelo caminho, lido e apagado logo depois; o que não é PDF 415 e apagado;
  estoque, outro pet shop, anônimo, nome fora do padrão e outro tipo não sobem; pasta de outro pet shop 400. Precisa do servidor com
  `GESTAO_CADERNO_FALSO=1`.
- `hoje.js`: tela Hoje numa ida só ao banco (migração 20261195, `gestao_hoje`): cada parte igual à leitura antiga pela API
  (agenda de hoje com pet, tutor, serviços a mais e profissional; preços por `agendamentos_precos`; amanhã; estadias; semana;
  serviços mais pedidos na mesma ordem; próximos; sem fechar; contagens; produtos acabando; o que entrou; contas; últimos 7 dias;
  saúde vencendo; check-outs sem cobrança; concluídos de hoje sem cobrança) para dono, recepção, monitora, tosador e estoque,
  com estoque, dinheiro e pacotes só para quem tem a área; anônimo recusado; dono de outra loja não lê nada.
- `faxina.js`: faxina agendada (migração 20261195; a 20261199 junta as contas com o prazo de exclusão vencido e a fila `arquivos_lixo`, ver `lgpd.js`): rota `/api/gestao/faxina` recusada sem o segredo (401; 503 no servidor de teste,
  que não tem `GESTAO_FAXINA_SEGREDO`), segredo pelo `Authorization: Bearer` (Vercel Cron) ou `x-gestao-faxina`; as funções só com a
  chave de serviço; a tarefa `gestao-faxina-diaria` no pg_cron (quando o banco tem); `faxinaGeral` com a chave de serviço local
  (`SUPABASE_SERVICE_ROLE_KEY` ou `npx supabase status -o env`), só na loja de teste: foto do boletim sem boletim há mais de um dia
  sai, a de agora fica; PDF do caderno-tmp com mais de uma hora sai, o de agora fica; o de outro pet shop fica.
- `lgpd.js`: LGPD (migração 20261199). **Dados de um tutor** (`cliente_dados`): o dono baixa só a Ana (cadastro, Thor e Mel, vacina,
  horário com preço, autorização de fotos, financeiro 60 + 45,50 + 33,30), nada do Beto, do Bob nem da outra loja, nenhum código do
  "Não quero mais"; recepção, tosador, dono de outra loja e anônimo recusados; fica no registro sem o nome. "Baixar todos os dados":
  `lgpd_registrar_copia` e `lgpd_registros_ver` só do dono (recepção e outra loja recusadas); ninguém lê as tabelas novas direto.
  **Apagar dados do tutor** (`cliente_anonimizar`): nome errado, recepção, outra loja e anônimo recusados sem mudar nada; com o nome
  ("  ana   SOUZA ") vira "Cliente removido" sem telefone/e-mail/endereço/obs, Thor e Mel "Pet removido" desativados sem foto (a foto vai
  para `arquivos_lixo`), saúde e autorização apagadas, horário sem obs/endereço; **soma e quantidade dos lançamentos iguais** e o
  recebido de hoje igual; nenhum lançamento aponta para a Ana (nem o de caixa fechado, que não ganha "alterado depois"); nomes fora
  das descrições; Beto e Bob intactos; registro com quantidades e sem nome; de novo = "já". **Sair da equipe** (`equipe_sair`): o
  titular, anônimo e quem é de fora recusados; o tosador sai, não entra mais, o nome fica sem login, registro, não lê clientes.
  **Encerrar a conta**: recepção, outra loja, anônimo, nome errado e sócio que não é titular recusados; o titular pede (nome em
  maiúsculas), +30 dias, de novo devolve o mesmo; a equipe vê, a outra loja não; `acesso_liberado` falso: dono e recepção não
  cadastram, mas leem e baixam; a outra loja segue; recepção e outra loja não cancelam; o dono cancela e volta a lançar; registro.
  **Admin**: `admin_copias`/`admin_exclusoes` recusados para anônimo e dono; funções da chave de serviço recusadas para dono e admin
  logado; rota `/api/gestao/admin/copia`: sem login 401, dono e recepção 403, admin 200 (zip) ou 503 sem a chave no servidor. Com a
  chave de serviço local: **cópia completa** (`copia-completa.ts`) com o manifesto, uma tabela por arquivo, sem o token do tutor, sem
  segredos da configuração e sem nada do auth; abre no `zipfile` do Python; "última cópia" no `admin_copias`. **Conta apagada**: antes
  do prazo a faxina não apaga; o painel lista; com `apagar_em` no passado, `faxinaGeral` apaga o pet shop, clientes, pets, equipe,
  arquivos do Storage e os 5 logins, marca `apagado_em` e o registro; as outras lojas ficam; de novo não apaga nada.
- `visitas.js`: última visita de cada pet: a função do banco (`visitas_dos_pets`) = a conta do navegador, para o dono e para o tosador.
- `lucro.js`: **Quanto sobrou** e **Por pessoa** (migração 20261193: `lucro_do_periodo`, `equipe_do_periodo`, `servicos.custo_material`,
  `lancamentos.vendido_por`), lançando pelo mesmo código das telas e montando por `src/lib/gestao/lucro.ts`. Conta do Thor (Banho 60 +
  Hidratação 30 + Corte 15 + shampoo 29,90 por R$ 120,00), parte de R$ 40 da conta do Bob, Luna sem conta, venda de balcão da recepção,
  laço sem custo, pacote, entrada solta, aluguel, comissão paga e devolução: **linhas + outros lançamentos = Entrou do Financeiro**
  (445,30), faturamento (435,30) e **resultado = Resultado do mês** (−98,03) pela mesma conta da tela; divisão da conta entre os
  serviços igual à da comissão (53,37 / 26,69 / 13,34), a parte conta a receita e não a vez; material do Banho 8,50 × vezes; produto
  pelo custo guardado na venda e, sem ele, pelo custo de hoje; Hidratação e laço com "custo não informado" (sem margem);
  **comissão das linhas = `comissao_do_periodo`** (92,02, o centavo do arredondamento na maior linha) e "contar a comissão como custo".
  Custo do material: só o dono grava e lê (`servicos_custos`; a coluna não tem select). Quem vendeu: `vendido_por` = quem lançou
  (vendedor de outra loja é trocado). Por pessoa: atendimentos = os da comissão, conta do atendimento para quem atendeu, balcão para
  quem lançou, **soma das pessoas = linhas de Quanto sobrou**; tosador e recepção só a própria linha. Recepção, tosador, estoque e
  anônimo não leem Quanto sobrou; funções internas fechadas. Mozart `ver_lucro`: o de mais sobra primeiro, sem custo = null, mesmo
  resultado do Financeiro, recusado para quem não cuida do financeiro.
- `compra.js`: sugestão de compra e etiquetas (migração 20261194): "vem em caixa de" (`produtos.embalagem_qtd`) lido por todos
  (permissão por coluna), gravado só por quem cuida do estoque, 0 recusado; código interno (`produtos_gerar_codigos`): MP + 6
  números na ordem do nome, depois do maior já usado (também em produto fora da lista), produto com código fica igual, pedir de
  novo não gera outro, dois pedidos ao mesmo tempo não repetem, outro pet shop não muda, tosador/recepção/anônimo/dona de outra
  loja recusados; o Mozart `o_que_comprar` com os movimentos de verdade (grupo do fornecedor, 3,5 por semana, comprar 6 com a
  explicação, 4 semanas = 13, caixa de 12), valor em estoque só para quem vê o financeiro, recusado para quem não tem Estoque.
- `modo-envio.js`: Mandar mensagens (migração 20261198: `gestao_modo_envio`, `modo_envio_marcar`, `mensagens_enviadas`,
  (Continua passando com a 20261205: o tipo novo 'niver_tutor' só aparece com o aniversário do tutor anotado.)
  `clientes.nao_quer_mensagens`). Lembrete de amanhã do Thor e da Mel numa mensagem só, pet pronto, cobrança (35, vencida), V10 em 5 dias,
  aniversário, pacote que acabou há 3 dias e o Bob sem vir há 70 dias: 7 mensagens para o dono (pela `montarFila` do app); Clara (não quer),
  Eva (sem telefone) e Davi (telefone incompleto) de fora. Por área: recepção tudo; tosador sem cobrança, pacote e chegada; monitora sem
  agenda nem dinheiro; estoque nada; anônimo recusado; outra loja nada. Mozart `mensagens_para_mandar` (7 e 5 para o tosador). Marcar grava a
  marca das outras telas (`lembrete_em`, `pronto_avisado_em`, `avisos.chegada`, `cobrado_em`) e o registro com quem e quando, uma vez por
  (tipo, ref, dia), também com dois toques ao mesmo tempo; tipo de outra área, anônimo, tipo estranho e mais de 50 recusados; ref de outra
  loja ignorada; depois, a fila fica vazia. Ninguém grava nem apaga direto no registro; outra loja não lê.
- `promo-niver-pacote.js`: promoção, aniversário do tutor e pacote acabando (migração 20261205). Promoção: só o dono cria e muda
  (`promocao_salvar`; recepção, tosador, anônimo e outra loja recusados; validações), a equipe lê, ninguém grava direto; ao marcar, o
  banco põe a promoção pelo dia da semana, pela hora ("antes das 11h") e pelo serviço, com o preço da lista de sempre (R$ 60; o tosador
  sem dinheiro marca e ganha R$ 70 do porte G); a API não escreve a promoção (nem ao marcar nem ao alterar); marcar pedindo sem ela;
  remarcar tira e põe de volta; horário marcado antes de a promoção existir não ganha nem ao remarcar; mudar a promoção não mexe no que
  foi marcado; tirar e pôr de volta (`agendamento_promo_usar`) por papel; a conta com a promoção (R$ 10) passa com o preço travado e o
  caixa sem desconto, vai para `promo_usos` e não para Alterações em valores; R$ 1 a mais é recusado para a recepção e anotado de 40
  para 39 para a dona; promoção tirada vira desconto do caixa; depois da conta, não muda mais; `relatorio_promocoes` (marcados, feitos,
  contas, desconto; só quem vê o dinheiro); `link_promocoes` só com o que o cliente precisa, o horário com "10% off" e "de R$ 60 por R$ 54",
  o pedido leva a promoção até o horário aceito mesmo depois de ela ser desligada; link desligado sem nada. Aniversário do tutor:
  sem ano = 1904 (1900 recusado), 29/02 no dia 28, 'niver_tutor' no Mandar mensagens (texto padrão e do pet shop, a Clara que não quer
  fica de fora, por área, marcar uma vez por ano, volta depois de um ano, tutor sem pet ativo não entra). Pacote acabando
  (`pacotes_acabando`): último uso, acabou, vencendo, vencido, quem renovou fica de fora, só de um pet, outra loja e anônimo; `acabou_em`
  ao usar o último e limpo ao desfazer. LGPD: `cliente_dados` leva o aniversário (dia e mês) e `cliente_anonimizar` o apaga.
- `lotes-kits.js`: validade e lote, kits e contagem de estoque (migração 20261201). **Lotes**: entrada com lote e validade (o mesmo
  lote, com espaço e outra caixa de letra, soma num lote só; custo do lote guardado e fora da leitura direta), venda de 6 sai do lote
  que vence antes (B2: 5, depois A1: 1, anotado em `movimentos_lotes`), venda com o lote escolhido, lote de outro produto recusado,
  saldo corrigido para menos do que está nos lotes (os lotes acompanham), produto sem lote igual a antes, ninguém grava nos lotes.
  **Vencendo** (`estoque_vencendo`): dias e quantidades, valor só para quem vê o financeiro, 30 × 60 dias, tosador/anônimo/outra loja
  recusados; `gestao_bom_dia` com `validade` só para quem cuida do estoque (e só com algo vencendo: o `fotos-redes.js` continua com
  "estoque: só o dia"); **perda num toque** (`lotes_baixar_perda`, dois toques ao mesmo tempo: uma saída "Vencido" por lote, anotada
  para o dono; a mesma chave de novo não tira outra vez; O que comprar põe à parte). **Kits**: nasce com saldo zero, monta só quem
  cuida do estoque, kit não entra em kit, saldo = quantos dá para montar (min(10, 7/2) = 3), custo = soma (32,33) e refeito quando
  o custo de um produto muda, não vira produto, sem ajuste nem entrada de compra; venda de 2 kits baixa cada produto (e os lotes, o
  que vence antes), a saída do kit ligada à venda com o custo do kit e as dos produtos sem ligar; **Quanto sobrou** com o kit
  (receita 110,00, custo 64,66 uma vez só) e sem linha dos produtos; `custos_das_vendas` sem as saídas dos produtos do kit; O que
  comprar conta 2 shampoos e 4 condicionadores; venda desfeita devolve os produtos. **Contagem**: começar por categoria (sem o kit,
  mesma chave = mesma contagem), tabelas fechadas, pausar e continuar, venda no meio (a diferença é sobre o esperado: 9 − 1 = 8),
  revisão com valor só para quem vê o financeiro, **Ajustar estoque com dois toques ao mesmo tempo: ajusta uma vez** (dois
  movimentos "Contagem"), histórico com quem começou e quem ajustou e −R$ 2,35, concluída não muda, papéis.
- `velocidade.js`: abrir o aplicativo numa ida só ao banco (migração 20261185): `lerBase` (`gestao_base`) = a leitura antiga parte por
  parte (`lerPetshop` + `lerEquipe` + `lerServicos`) para dono, recepção, monitora, tosador e estoque, com meta, diárias, opções com valor,
  comissão, convite e preços só para quem pode; as seis contagens da tela Hoje (`gestao_contagens`) = as contagens pela API; anônimo
  recusado; dono de outra loja não lê nada e conta zero.
- `orcamento-troca.js`: orçamento, troca e devolução e limite de fiado (migração 20261200), contas à mão. **Orçamento**: 2 × 29,90 +
  Banho 60,00 − 9,80 = 110,00 (o total mandado pela tela é ignorado, `orcamento_conferir`); número em sequência; estoque não mexe;
  tosador e estoque não leem nem criam; "convertido" direto recusado; página pública (`orcamento_publico`, anônimo) com loja, itens,
  total, status e só o primeiro nome (sem telefone nem ids), vencido pela validade; texto do WhatsApp (`textoDoOrcamento`).
  "Transformar em venda" (`orcamento_vender`) com **dois toques ao mesmo tempo**: uma venda, estoque −2 uma vez, convertido;
  outra chave recusada; convertido não muda nem é apagado; o horário fica ligado (`orcamento_marcar`). **Devolução**
  (`venda_devolver`): venda de 3 × 29,90 com 9,70 de desconto = 80,00; volta 1 = 26,67 em dinheiro (dois toques = uma saída
  "Devolução" no caixa, estoque +1 uma vez); o resto (2, um avariado) = 53,33 de crédito (fecha ao centavo), estoque +2 e perda
  de 1; mais que isso recusado; venda a receber e crédito sem tutor recusados. **Troca**: 29,90 por coleira de 45,00 = paga
  15,10 no Pix (saída 29,90 "outro" + entrada 45,00 = 29,90 "outro" + 15,10 Pix; a recepção não muda o preço); por laço de 5,00
  = volta 24,90 em dinheiro. **Relatórios**: comissão de 10% sobre o shampoo da conta do atendimento 2,99 → 0,00 depois da
  devolução; `lucro_do_periodo` = `faturamento.ts` (devolvido 116,37, crédito 53,33), devoluções por produto (6 voltaram, 1
  avariado, 169,70, custo de volta 60,00), `montarLucro` com a margem líquida e a ponte fechando. **Fiado**: a recepção não muda
  o limite; Ana deve 180 de 200, mais 30 recusado com "Ana já deve R$ 180,00; com esta conta passa do limite de R$ 200,00."
  (também pela venda de balcão); pagamento na hora passa; a recepção não libera; o dono libera (anotado, uma vez só); padrão da
  loja (50) para quem não tem limite próprio, e a opção não vai para o tosador.
- `taxas-indicadores.js`: **taxas da maquininha** e **Indicadores** (migração 20261204), contas à mão. Sem taxas cadastradas, nada é
  guardado; só o dono grava (`taxas_maquininha`: recepção e tosador recusados, % acima de 30 e parcela 13 recusadas), recepção e
  tosador não leem. Taxa guardada no pagamento (`lancamentos_taxas`): débito 100 × 2% = 2,00; crédito 150 × 4% + 0,50 = 6,50;
  **dividido** 200 (Pix 50 × 0,99% = 0,495 → 0,50, crédito 100 → 4,50, dinheiro 50 sem taxa) = 5,00; dinheiro sem linha; crédito
  300 à vista 12,50 e, anotado 3x pela recepção (`maquininha_parcelas`), 7,5% + 0,50 = 23,00; 2x pela % do parcelado = 6,50; a
  recepção não anota na venda do dono, o tosador é recusado. `calcularTaxa` (maquininha.ts) = banco nos 5 casos. **Mudar as
  taxas não muda o que já foi pago** (débito 2,00 e crédito 6,50 ficam; débito novo 3,00); valor corrigido 150 → 200 refaz com a
  regra do dia (8,50, não a nova). Ninguém grava nem muda a tabela das taxas guardadas; caixa fechado não deixa anotar parcelas.
  `taxas_do_periodo`: 48,00 em 6 pagamentos, por forma, a receber 195,00 amanhã e o crédito em parcelas por mês (20261208): 426,09
  em 30 dias, 139,08 em 60 e 92,33 em 90; `lucro_do_periodo`: resultado
  igual ao Financeiro (1.140,00) e a taxa à parte (depois das taxas 1.092,00). Outra loja e anônimo não leem nem chamam nada.
  **Indicadores** (`indicadores_do_periodo`, 3 meses): cada mês com faturamento, resultado e taxas iguais a `lucro_do_periodo` do
  mesmo mês e ao `faturamento.ts`; 3 atendimentos, faltas 25%, cancelados 1 de 6, retorno em 60 dias 1 de 2, mapa = marcados sem
  cancelados, Banho o mais feito; recepção, tosador, outra loja e período de mais de um ano recusados; loja sem movimento: sem dados.

- `parcelas-todas.js`: **crédito em quantas vezes** em todas as telas que recebem (migração 20261208), pelo código das telas e
  conferido à mão (crédito 4% + 0,50; parcelado 6%; 3x 7,5%). **Recebi** (`receber_conta`): a conta inteira devolve o id da própria
  conta e a recepção anota 3x na conta que o dono anotou (200 → 15,50), fica anotado quem recebeu (`lancamentos_recebidos`); a
  recepção não anota numa conta que o dono recebeu, nem numa que ela recebeu há mais de 30 minutos; parte com multa = dois ids (parte
  6,50 e multa 1,10 em 2x). `conta_receber_junto` (idsDaOperacao acha a conta quitada pelo passo da tela) 4x 3,50; `venda_registrar`
  3x 9,50; `orcamento_vender` 2x 4,10; `estadia_sinal` 2x 6,50; `estadia_checkout` (creche) 3x 5,75; **troca** com diferença no
  crédito (`venda_devolver`, só a diferença de 100 paga taxa) 4,50 → 3x 8,00. Débito e Pix: as vezes não mudam nada.
  `anotarParcelasComRetry`: duas falhas de internet e a terceira anota; recusa do banco não insiste; à vista nem chama o banco.
  **Mozart**: `lancar_dinheiro` no crédito sem as vezes não sai (pede para perguntar), com 3x 15,50; `receber_de_cliente` 2x 5,90;
  1x à vista; loja sem taxa de parcelado não pergunta. **A receber da maquininha** (`taxas_do_periodo`): débito 98,00 amanhã; 3x de
  277,00 = 92,34 + 92,33 + 92,33 em +30, +60, +90; 2x 46,75 + 46,75; à vista 143,50 em +30; um 12x de 1.200,00 pago há 200 dias
  (líquido 1.127,50: 93,95 por parcela) com as parcelas 7 a 12 em +10, +40, …, +160; Pix já caiu; total 1.175,70; "parcelado" na
  resposta. Loja sem parcelado: débito 176,40 amanhã e crédito à vista 143,50 em 30 dias, como antes.

- `quadro-taxi.js`: quadro de atendimento e leva e traz (migração 20261203). `quadro_mover`: só quem tem Agenda (monitora, estoque,
  outro pet shop e anônimo recusados), etapa fora da lista, horário de amanhã e desmarcado recusados; a chegada pelo quadro (ou pelo
  "Chegou" da Agenda, pelo gatilho) anota a hora e o status de antes; voltar para Esperando devolve o confirmado; dois toques (tosador e
  recepção ao mesmo tempo) = uma linha e a mesma hora; Entregue nunca conclui nem lança dinheiro, e voltar de Entregue tira a marca;
  concluído não volta para Esperando; voltar para marcado ou falta apaga o quadro. Ninguém grava direto em `quadro_atendimento` nem em
  `leva_traz_viagens`, e só quem tem Agenda lê. `leva_traz_marcar`: horário sem leva e traz e levar antes de chegar recusados, dois
  toques em Buscado = uma viagem, levar = entregue no quadro, desfazer. Taxa (`taxi.taxa`): só o dono grava, a recepção (caixa) lê e o
  tosador não (`opcoes_sem_valores`). Contas do app (`quadro.ts`): bairro achado no endereço (o nome mais comprido), valor fixo, bairro
  repetido recusado, próxima etapa (pula a tosa sem tosa), viagens na ordem do relógio, rota com no máximo 10 endereços e "Estou chegando".
- `casa-taxi-promo.js`: leva e traz e promoção em dias fracos na creche e no hotel (migração 20261207). Leva e traz: a monitora grava
  `leva_traz_buscar`, `leva_traz_levar` e `endereco_leva_traz` pela API e a equipe lê (leitura coluna por coluna); endereço com mais de
  300 letras recusado. `leva_traz_estadia_marcar`: só quem tem Creche e hotel (tosador, estoque, outro pet shop, pelo id dele também,
  e anônimo recusados), estadia sem leva e traz, viagem fora da lista, levar antes do check-in e estadia cancelada recusados; **dois
  toques** (monitora e recepção) = uma viagem e a mesma hora; buscar não faz check-in, levar não faz check-out; desfazer (duas vezes sem
  erro). Ninguém grava direto em `leva_traz_estadias` (nem o dono); só quem tem Creche e hotel lê. Contas do app (`quadro.ts`): hotel
  busca no dia da entrada e leva no dia da saída prevista (ou da de verdade, se saiu antes), creche no mesmo dia, mensalista e cancelada
  fora, horários e estadias juntos na ordem do relógio. Promoção: `promocao_salvar` com `banho_tosa` e `casa` (só o dono; sem lugar ou
  lugar fora da lista recusados; só creche apaga serviços e faixa de hora); a creche no dia ganha a cópia (nome, %, dias, casa) e a
  diária fica a da lista; outro dia, hotel no mesmo dia e dia de experiência não; a API não escreve a promoção (ao marcar, ao editar, nem
  para apagar, nem o dono); `{"tirada": true}`; estadia marcada antes da promoção não ganha (nem ao remarcar); remarcar para outro dia
  tira e de volta põe; mudar a promoção não mexe na cópia; a promoção só da creche não entra no banho e tosa (nem ao pôr de volta no
  horário). Hotel: R$ 25 só na noite que cai no dia (3 noites, 1 no dia), 15% nas noites do dia, tirada não desconta, a escolha do app
  igual à do banco. `estadia_promo_usar`: tosador, outro pet shop e anônimo recusados, dois toques em Tirar, pôr de volta a mesma cópia,
  estadia sem cópia e dia de experiência. promo_usos pela conta guardada (`estadias_valores.conta.promo`): quem não recebe não grava a
  conta, o desconto forjado é limitado ao que a promoção pode dar, gravar de novo não anota duas vezes, tirada não anota, ninguém lê
  promo_usos direto; depois da conta, a promoção não muda. `relatorio_promocoes` com estadias e encerradas (monitora e outro pet shop
  recusados). `link_promocoes` com `casa` (sem id), e sem a creche quando ela sai do link. Pedido do link de creche leva a promoção e,
  aceito, a estadia fica com ela.

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
- `admin-pagantes.js`: cartão "Clientes pagantes" na Visão geral do painel do administrador, em 390 e 1366: número e barra "X de 15",
  a loja ativa na lista ("pagante desde", "pago até"); com a resposta de `admin_pagantes` trocada no navegador, abaixo de 15 os passos
  ficam fechados em "Quando chegar em 15" (6 passos, MEI e "confirme com o contador") e sem histórico confiável aparece "vale só o
  número de hoje"; com 15, o aviso "Chegou a hora de abrir a empresa" com os passos abertos; em 1366 marcar "Abrir o CNPJ" grava,
  continua marcado ao abrir de novo e desmarcar tira. Sem rolagem para o lado e sem erro na página.
- `erros.js`: com `GESTAO_ERRO_TESTE=1`, a tela Hoje quebra de propósito (tela, erro solto, promessa) em 390 e 1366: tela
  "Opa, esta tela travou" com Tentar de novo e Voltar para Hoje e o menu, registro no banco (papel, tamanho da tela, versão, sem
  consulta) e a aba Erros do painel (agrupado, detalhes, filtros 24 h / 7 / 30 dias, marcar como resolvido e desfazer).
- `servicos.js`: Marcar horário com vários serviços ("O que o pet vai fazer?"): quatro serviços em 390 (ordem do toque, preço por
  porte, Tempo total e Total, o banco com o principal e os 3 a mais, a agenda, a conta de R$ 145,00 e a comissão por serviço ao centavo);
  em 1366, tirar o primeiro (o seguinte assume), alterar um horário com três serviços, pet sem porte; tosador sem nenhum valor na tela
  (o banco põe o preço da lista) e preço travado para a recepção.
- `primeiro-acesso.js`: dono novo do zero (criar conta, duas perguntas, "Começar já") até o primeiro resultado: no fim do guia
  "Pronto em X minutos", "Marcar o primeiro horário" (botão principal) e "Copiar meu link de agendamento"; o link copiado em 7
  toques e 4 campos; o primeiro horário (pet novo cadastrado na própria folha) em até 13 toques e 7 campos, com "Pronto em X
  minutos" no aviso do marcado (antes da mudança: 19 toques e 9 campos). 390 até o horário, 1366 até o link.
- `fotos-redes.js`: a página do boletim em 390 ("Pode postar a foto do Thor…", nada marcado, prévia com o @ = texto guardado,
  "Pode postar desde", "Não quero mais" com confirmação); a ficha e o álbum em 1366 ("Pode postar ✓ (desde dd/mm)", depois
  "Sem autorização"); o Bom dia do dono (quem deve) e do tosador (sem valor), "Perguntar ao Mozart", "Dispensar por hoje" que não volta.
- `checkout-lento.js`: check-out do hotel com a leitura do sinal atrasada 2,5 s (390 e 1366): enquanto carrega, a folha não mostra valor
  e o botão fica apagado (clicar não grava); depois, "Receber R$ 2,75" (110 − sinal 107,25) e "Receber R$ 1,60" (80 − 20% do segundo
  pet − sinal 62,40), uma entrada só cada.
- `agenda-lenta.js`: ficha do horário com a leitura dos pacotes e do que já foi pago atrasada 2,5 s (390 e 1366): enquanto carrega,
  nenhum botão de cobrar, concluir ou usar o pacote (só "Carregando a conta"; Cliente confirmou continua); depois, o pacote primeiro,
  o aviso do que o tutor deve de antes e "Cobrar à parte, sem usar o pacote · R$ 50,00". Com a leitura falhando: nada de cobrar,
  só "Tentar de novo", que traz a conta inteira.
- `caderno.js`: Trazer do caderno pela tela, com a leitura de teste (`GESTAO_CADERNO_FALSO=1`). 390: Clientes → Foto do caderno →
  "Não sei, descubra" → foto → a conferência (nada salvo ainda; Ana Souza "Já existe" com "Juntar com a ficha" marcado e o Thor "só
  completa"; Marta "Verificar: sem telefone"; Beto devendo desde 12/10; total R$ 85,00; horário de dia que já passou fora) → dois
  toques em "Salvar 5 itens": Ana uma ficha só (ganha a Pipoca), Marta e Joana novas, R$ 35 do Beto a receber com `devido_desde`,
  R$ 50 da Joana sem data, nada no caixa, Thor marcado no dia +3 às 10:00 uma vez só. 1366: Tabela de preços ("Atualizar o preço de
  Banho M de R$ 60,00 para R$ 55,00?", Hidratação "Igual ao que já está", Banho de ofurô novo: no banco, só o M muda e o novo entra
  uma vez) e "Ler a carteirinha" do Thor (Antirrábica em branco com "Definir vencimento"; três cuidados uma vez só, com a
  veterinária nas observações). Foto HEIC que o Chromium não abre: o aviso diz para mandar pelo Safari ou tirar um print. PDF de 5 MB:
  sobe antes para o `caderno-tmp`, o envio à rota fica pequeno, a leitura vem e nada fica na pasta. Capturas em `testes/saida/caderno-*.png`.
- `mozart-fila.js`: escrever enquanto o Mozart responde (o servidor do Mozart vira um roteiro lento com `page.route`): depois do
  "Pode fazer", o Enter põe a mensagem na conversa com "Na fila" e ela vai sozinha, uma vez, quando ele termina; se a resposta trouxer
  um cartão para confirmar, a mensagem volta para a caixa com o aviso e o cartão não é descartado.
- `mozart-voz.js`: falar com o Mozart com um ditado de mentira (`lib/voz-falsa.js`, por `addInitScript`; o servidor do Mozart é um
  roteiro lento por `page.route`). 390 e 1366: microfone de 56 px, pt-BR com resultados provisórios na caixa, "Ouvindo…" com a bolinha
  vermelha; ao terminar, "Enviando… 2 · Editar" e o envio vai uma vez só depois de 2 s; tocar na caixa ou em Editar cancela; "Enviar
  sozinho depois de falar" desligado deixa o texto na caixa (guardado no aparelho); "Ler as respostas em voz alta" (desligado de início)
  e o alto-falante de cada resposta; segurar para falar (toque de dedo no 390, mouse no 1366) e tocar para parar; "Não ouvi nada";
  microfone bloqueado ("Libere o microfone nas configurações do navegador"); microfone na Ajuda (não manda sozinho); para sozinho em
  8 s de silêncio e em 30 s (`page.clock`); navegador sem ditado: sem botão, escrever continua igual. Capturas em `testes/saida/mozart-voz-*`.
- `ditado.js`: microfone nos campos de texto livre (`CampoComVoz`, `src/components/gestao/ditado.tsx`): na ficha do pet nova (cuidados e
  alertas, observações) e em Marcar horário (observação), o falado entra depois do que estava escrito, com espaço, ao vivo; respeita o
  tamanho do campo; nada é salvo sozinho; bloqueado mostra a ajuda; navegador sem ditado não mostra botão. 390 e 1366.
- `creche-sobras.js`: sobras da creche (Rafael). Opções da creche (os três cartões) num botão só, com "Falta salvar: …", e sair da
  tela com mudança sem salvar pergunta "Sair sem salvar?"; **rascunho no aparelho**: recarregar no meio das opções ou do cadastro do
  mensalista volta com tudo ("Rascunho recuperado · Descartar", "Ficou sem salvar · Continuar"), salvar apaga; primeira cobrança
  **proporcional desde o começo do plano** pela tela, gravada ao centavo; com 800 ms por pedido, o primeiro mensalista aparece na
  lista logo que a janela fecha e, na chamada, o placar e a linha das vagas mudam juntos depois de uma reposição; **folhas para
  imprimir** (lista e extrato das cobranças, extrato do cão, folha do dia, fichas de cuidados) na mesma aba, com Voltar, os dados
  numa leva só (ondas de pedidos com 600 ms de atraso), PDF A4 (`page.pdf`) e o título de cada parte da folha do dia na mesma
  folha que a primeira linha dela (cada parte empurrada para o pé da página em 21 pontos). 390 e 1366.
- `caixa-fichas.js`: caixa e fichas num hotel só (migração 20261191), conta à mão em 390 e 1366. Check-out da Luna (1 diária de 95,
  sinal 285) deixando de crédito: Conta fechada com "Recebido agora R$ 0,00" e, à parte, "Ficou de crédito para o tutor: R$ 190,00".
  Caixa: gaveta R$ 102,75 (troco 100 + 2,75 em dinheiro), Entrou hoje 677,40 − Saiu hoje (devoluções e saídas) 110,00 = Saldo de
  hoje 567,40, aviso dos 190,00 de crédito, sinal sem a data velha e categoria Hotel. Gasto aqui na ficha de cada pet (Mel 62,40 só
  com o sinal, Thor 107,25, Luna 285 − 190 = 95,00, Bob 220 + 2,75 − 110 = 112,75) e na do tutor (Ana 169,65, "Hotel"). Relatórios:
  4 noites reservadas de hoje em diante, a última em +4 (a estadia encerrada hoje não conta). Página do tutor: `ultima_vez` no banco,
  "Luna veio hoje. Ainda não tem diário nem fotos." e, para quem nunca veio, o texto de antes. Capturas em `testes/saida/caixa-fichas-*.png`.
- `juliana.js`: o que a Juliana achou, em 390 e 1366, numa loja só de banho e tosa com o link ligado e os serviços sem preço. Conta nova:
  o botão do alto, o Mozart e o passo em destaque de Primeiros passos são o mesmo ("Colocar os preços dos serviços") e a agenda vazia não
  oferece outro caminho. 1366: Personalizar mostra "No menu: Agenda / Estoque e Caixa / Pacotes / Hotel" e, com creche e hotel, "Creche e
  hotel" nos dois cartões; ligar os dois pergunta do link sem nada marcado; "Ligar no link" só na creche grava creche no link e o hotel
  fora, com o recado "continua sem hotel". Serviço novo: a linha da área (Hotel: extra na saída, entra na conta), um ponto em cada cor
  em uso, roxo avisa "Essa cor já é de Tosa higiênica"; salvo repetido (390), Serviços e preços avisa e "Dar uma cor para cada" deixa
  todas diferentes (a Tosa higiênica fica roxa). Check-out do hotel (1366): "Banho de saída do hotel · R$ 40,00" num toque e o total
  R$ 160,00. Capturas em `testes/saida/juliana-*.png`.
- `hotel-bia.js`: achados da Bia pela tela. 390 (recepção): Reservas mostra "Thor e Mel · sinal R$ 69,65" e "Receber junto"
  com dois cliques no Pix recebe R$ 69,65 uma vez, os dois sinais pagos; Folha do dia da chegada com o recado do pedido do link
  uma vez só ("Do pedido de Thor e Mel") e o nome do tutor numa linha e o telefone na de baixo, na tela e no papel
  (`emulateMedia('print')`, PDF em `testes/saida/hotel-bia-folha.pdf`). 1366 (dono): check-in de quem chegou agora com
  "Recebeu adiantado?" R$ 50,00 no Pix, dois cliques: uma entrada e o cartão "Pago adiantado R$ 50,00"; lista de espera com
  "Prefere canil perto da janela": Marcar reserva abre com a observação e a reserva é salva com ela. Capturas em
  `testes/saida/hotel-bia-*.png`.
- `lucro.js`: Quanto sobrou e Por pessoa pela tela, em 390 e 1366 (dono): Banho 2 vezes, R$ 113,33, material R$ 17,00, sobrou R$ 96,33;
  Hidratação R$ 26,67 com "custo não informado" (nunca 100%); Produtos (390): shampoo de balcão R$ 59,80 − R$ 24,00; Como fecha com o
  Financeiro (R$ 199,80 + outros R$ 200,00 = Entrou R$ 399,80; resultado −R$ 50,20) e o **mesmo Resultado do mês na tela Financeiro**;
  Exportar baixa a planilha; Por pessoa com o tosador (2 atendimentos, R$ 140,00) e a recepção (venda R$ 59,80). 1366: Meu pet shop,
  Custo do material por atendimento (grava R$ 4,20; o Banho abre com R$ 8,50). Tosador na tela Hoje: "Meu mês" com 2 atendimentos e sem
  reais. Capturas em `testes/saida/lucro-*.png`.
- `lgpd.js`: LGPD pela tela, em 390 e 1366. Meu pet shop, "Seus dados e a conta" com três cartões; "Baixar todos os dados" baixa um
  .zip (lido com o `zipfile` do Python) com README.txt e uma planilha por parte (clientes, pets, saúde, agenda, estadias, mensalistas,
  pacotes, lançamentos, vendas, caixas, produtos, movimentos, boletins, autorizações de fotos, equipe), todas com BOM, só os clientes
  desta loja (a "Zuleica" da vizinha nunca aparece), equipe sem senha. 390: ficha da Ana, "Baixar os dados deste tutor" (zip só dela)
  e "Apagar dados deste tutor" (o botão só acende com o nome certo; a ficha vira "Cliente removido"; a soma do dinheiro fica igual);
  "Sair desta equipe" no Mais da recepção e não do titular. 1366: "Encerrar e apagar a conta" com o nome digitado, "Pedido registrado"
  com a data, aviso vermelho para o dono e para a recepção (o banco não deixa lançar), "Ver ou cancelar" e "Cancelar a exclusão";
  painel do administrador, aba Dados (cópia completa e contas para apagar). Capturas em `testes/saida/lgpd-*.png`.
- `aceite.js`: Termos, Política e aceite pela tela, em 390 e 1366: Criar conta com a caixa desmarcada e os dois links (sem marcar, a conta
  não nasce; marcada, em 390, nasce com os dois aceites "cadastro" no banco); as páginas com "Versão 2.1 — vigente desde 17/11/2026", o
  resumo de cada parte e o índice; a dona sem aceite da versão em vigor entra e vê "Dona, atualizamos as nossas regras" (o resumo das
  mudanças, os dois documentos, a caixa desmarcada; sem marcar não segue), aceita com dois cliques e o aplicativo abre com os dois
  aceites "reaceite" gravados uma vez. Capturas em `testes/saida/aceite-*.png`.
- `modo-envio.js`: Mandar mensagens pela tela, 390 e 1366 (dona). 390: a tela Hoje mostra "Mandar 3 mensagens"; contagens com interruptores
  (desligar o aniversário: "Começar: 2 mensagens"), "1 ficou de fora" com a Clara e o motivo; "1 de 3" com o lembrete do Thor e da Mel, texto
  mudado no link wa.me; ao abrir, nada é perguntado nem marcado até a aba ser escondida e voltar (simulado com `visibilitychange`); "Sim,
  próxima" grava o `lembrete_em`; "Pular" não grava; "Não enviou" fica na mesma; fim com 2 enviadas e 1 para depois. 1366: só a cobrança
  sobra; Enter abre o WhatsApp e S responde sim (`cobrado_em` e o registro com quem mandou); a ficha da Clara com "Não quer receber
  mensagens" e a caixa marcada no formulário. Capturas em `testes/saida/modo-envio-*.png`.
- `promo-niver-pacote.js`: promoção, aniversário do tutor e pacote acabando pela tela, 390 e 1366 (dona). 390: Meu pet shop (atalho
  `#promocoes`) com a promoção, "Copiar o texto" e "Abrir no WhatsApp" (wa.me sem número), "Nova promoção" (terça, antes das 11h, R$ 10)
  gravada; o horário do Thor com a linha da promoção (− R$ 6,00), o aviso do pacote (falta 1 uso, "Oferecer renovar") e o botão com
  R$ 54; Fechar a conta com a linha da promoção, "Tirar" (volta a R$ 60) e "Pôr de volta"; a ficha da Ana com "Aniversário hoje" e o
  pacote acabando; Aniversariantes do mês com "Dar parabéns". Link do cliente: "10% off" no Banho e nos horários, sem "de/por" enquanto o
  porte não é escolhido, "De R$ 60 por R$ 54" no porte M. 1366: Pacotes acabando com "Vender de novo" (abre a renovação), Relatórios com o
  bloco Promoções, Mandar mensagens com o aniversário do tutor, Editar o tutor com dia e mês e o ano gravado. Sem rolagem para o lado,
  sem erro na página. Capturas em `testes/saida/promo-niver-pacote-*.png`.
- `entrada.js`: checklist de entrada pela tela. 390 (recepção): Thor com 10 anos chega pela Agenda e a folha abre sozinha (padrão: só pet
  idoso), com os Cuidados e alertas da ficha e "Pet idoso ou doente" marcado; chips, foto feita num canvas, pertences, observação;
  "Assinar aqui no aparelho" com o termo padrão, "Li e concordo", o nome do tutor e uma assinatura desenhada no quadro (PNG no bucket);
  o horário mostra "Entrada conferida ✓ · aceite do tutor ✓" e "Devolver: coleira, caminha e Cobertor azul" com a caixa; o comprovante
  com a assinatura. 1366: Meu pet shop "Todos os pets"; a monitora faz o check-in do hotel, a folha abre sozinha, "Mandar o link pelo
  WhatsApp" ("Oi, Beto! …"); a página do tutor em 390 e 1366 (sem telefone, sem rolagem para o lado) e "Li e concordo"; o cartão mostra o
  aceite e o check-out "Devolver: ração". Capturas em `testes/saida/entrada-*.png`.
- `caixa.js`: a recepção fecha a conta pela tela (celular pela Agenda, computador pela lista "para cobrar" do Caixa) com **dois
  cliques seguidos no Receber**: uma entrada só, com o valor e os itens certos.
- `compra-etiquetas.js`: Estoque pela tela, 390 e 1366. O que comprar: "Vendeu em média 3,5 por semana nas últimas 6 semanas",
  comprar 6 (13 com 4 semanas), parados e Valor em estoque R$ 640,00 para a dona; Montar pedido abre a mensagem do WhatsApp com
  "- 6 unidades de Ração Golden 15 kg" e mudar para 8 muda a mensagem e o link. Etiquetas na mesma aba com Voltar: 5 etiquetas,
  "Gerar código interno" (MP000001 no banco), os códigos da página lidos de volta (`lib/barras.js`), nome comprido com
  reticências; PDF (`page.pdf` com o tamanho do `@page`): A4 3 × 10 e 4 × 16 numa folha A4, 40 × 25 e 50 × 30 mm com uma
  etiqueta por página; Entrada com "Imprimir etiquetas do que entrou" abre com uma por unidade. Quem cuida do estoque (sem
  dinheiro) vê a sugestão sem nenhum R$. Capturas em `testes/saida/compra-*.png`, `etiquetas-*.png` e PDFs `etiquetas-*.pdf`
  (conferidos com zxing-cpp ao escrever: todos os códigos lidos).
- `estoque-lotes.js`: validade, kits e contagem pela tela (migração 20261201). 390, quem cuida do estoque (sem dinheiro): o aviso da
  tela Hoje ("1 lote vencido e 1 lote vence em até 30 dias no estoque") abre Estoque, Vencendo sem nenhum R$; "Perda" dá baixa no
  lote vencido (no banco: saída "Vencido" de 3, lote zerado); a contagem no celular: começar, + e −, vai ao banco sozinho (contado e
  esperado), **sem internet** (`ctx.setOffline`: "Sem internet: 1 contagem guardada neste aparelho", nada no banco) e de volta (vai
  sozinho), revisão (shampoo −1, condicionador +2, sem R$, sem rolagem para o lado), "Ajustar estoque" (saldos e dois movimentos
  "Contagem", com uma saída no meio). 1366, o dono: Entrada com lote e validade; kit novo ("Dá para montar 7 kits", custo R$ 22,50;
  no banco tipo kit, 2 produtos, saldo 7); Vencendo com R$; o histórico (+R$ 7,50, Edu Estoque) e a folha impressa. Capturas em
  `testes/saida/lotes-*.png` e `contagem-*.png`.
- `boletim.js`: boletim do pet pela tela. 390: o tosador, pela Agenda, no fim do banho: duas fotos feitas num canvas (nada de gente
  de verdade) reduzidas a 1600 px no aparelho, recados, atenção à saúde, texto pronto, "Escrever com o Mozart" (de teste), salvar,
  o WhatsApp com "Oi, Ana! O boletim do Thor de hoje: <link>" e o "Boletim enviado". 1366: a monitora, pelo cartão da creche em
  Casa agora ("Fez amizade com Mel"). A página pública em 390 e 1366 (fotos carregadas, atenção, serviços, Avaliar no Google, Marcar
  o próximo, sem telefone do tutor, sem rolagem para o lado) e o álbum na ficha do pet com o link para o tutor. Capturas em
  `testes/saida/boletim-*.png` e `album-390.png`.

- `orcamento-troca.js`: orçamento, troca e limite de fiado pela tela. 390 (recepção): Caixa › Orçamentos › Orçamento novo com Ana,
  2 shampoos e o Banho (entra a 50,00, o primeiro preço; ela põe 60,00), desconto 9,80 = R$ 110,00; Mandar no WhatsApp (número da
  Ana, "Oi, Ana!", total e link); a página pública (Para Ana, itens, total, validade, "Quero fechar" para o WhatsApp da loja, 404
  com código errado); Transformar em venda: venda de 54,91 (desconto repartido: 9,80 × 59,80 / 119,80 = 4,89) e depois o horário
  com o Banho a 55,09; banco com a venda, estoque −2 e o orçamento convertido. Fiado acima do limite pela Venda no balcão: a
  recepção vê a frase e nada é anotado. 1366 (dono): Caixa › a venda › Troca ou devolução: 1 shampoo volta = 27,46 em dinheiro,
  **dois toques** = uma saída; o dono vê "Passa do limite de fiado", toca em "Liberar mesmo assim" e a conta entra (anotado quem
  liberou); a ficha mostra "Limite R$ 200,00 · passou R$ 9,90 do limite" e Fazer orçamento. Capturas em `testes/saida/orc-*.png`.
- `indicadores.js`: taxas da maquininha e Indicadores pela tela, em 390 e 1366 (dono). Relatórios › **Indicadores** (a primeira aba):
  faturamento do período, 3 atendimentos, voltaram em 60 dias 50% (1 de 2), faltas 25%, mapa de dias e horários, serviços mais
  vendidos, Quanto sobrou por mês com "depois das taxas", Ver os números; Mês passado compara só com número de verdade. **Venda
  no balcão**: Débito de 29,90 mostra "Taxa da maquininha R$ 0,60 · Você recebe R$ 29,30"; Crédito em 3 vezes, 2,74 / 27,16, e a
  venda fica no banco com 2,74 e 3 parcelas. Financeiro e Relatórios com o cartão Taxas da maquininha; Quanto sobrou com a linha
  das taxas depois do resultado. Meu pet shop: o dono muda o débito (o exemplo de R$ 100,00 muda na hora) e o débito de antes
  continua com 2,00. Loja nova: "Ainda não tem dados neste período." sem nenhum R$. Capturas em `testes/saida/indicadores-*.png`.

- `parcelas-todas.js`: crédito em quantas vezes nas telas que antes gravavam à vista, em 390 e 1366. A recepção: Caixa › **Entrada**
  (no Pix não pergunta; no crédito, "Crédito em quantas vezes?", 3x de 200,00 = 15,50 no banco) e Caixa › Contas de clientes ›
  **Recebi** a conta que o dono anotou, em 2x (6,50 e 2 vezes no banco). O dono: Pacotes › **Vender pacote** em 4x (vê "R$ 14,90 ·
  Você recebe R$ 225,10"; 14,90 e 4 vezes no banco) e vê no Financeiro "Crédito parcelado: uma parcela por mês…" no a
  receber da maquininha. Sem rolagem lateral e sem erro. Capturas em `testes/saida/parcelas-*.png`.

- `quadro-taxi.js`: quadro do dia e leva e traz pela tela (servidor no ar). 390 (tosador): Agenda › Quadro, abas com a contagem, o cartão
  do Thor (Banho e tosa, com Tito, Morde, alergia, Leva e traz), "Chegou: começar o banho", secagem, tosa e "Está pronto" com
  "Avisar que está pronto" (wa.me da Ana com "Já pode vir buscar"; grava `pronto_avisado_em`); Leva e traz: buscar e levar de volta
  (pronto), rota no Google Maps com a cidade, Mapa com o endereço do horário, Ligar, "Estou chegando", **dois toques** em Buscado = uma
  viagem, Entregue em casa (entregue no quadro); Modo TV sem botões. 1366 (dona): 5 colunas, arrastar a Mel para No banho, Fechar a conta
  do Thor com "Pôr na conta · R$ 15,00" (Receber R$ 105,00, nada cobrado antes de receber), Meu pet shop › Taxa de leva e traz por bairro,
  Modo TV cobrindo o menu e atualizando sozinho (o Bob aparece em Pronto em até 35 s). Capturas em `testes/saida/quadro-*.png`.
- `casa-taxi-promo.js`: leva e traz e promoção na creche e no hotel pela tela (servidor no ar). 390 (monitora, só Creche e hotel): o botão
  "Leva e traz (2)" na Creche e hotel, o cartão do Thor com "Leva e traz: levar de volta" e "Promoção Dia da creche (15% na diária da
  creche)", a lista do dia em Creche e hotel › Leva e traz (Thor levar de volta com o endereço da ficha, Rex buscar no hotel com o
  endereço da reserva, voltar para a Creche e hotel), **dois toques** em Buscado = uma viagem, Entregue em casa sem check-out, Todas com
  quem fez; nova reserva de hotel da Luna com Buscar em casa e o endereço da Clara já preenchido (grava buscar, não levar, e o endereço).
  1366 (dona): check-out do Thor com a linha "Promoção Dia da creche −15%" (− R$ 10,50) e a taxa sugerida que não entra sozinha
  (Receber R$ 59,50; Pôr na conta → R$ 74,50), Tirar (R$ 85,00, anotado na estadia) e Pôr de volta, o resumo com diárias, promoção e
  leva e traz, **dois cliques** em Receber = uma entrada de R$ 74,50 com a linha da promoção, R$ 10,50 em promo_usos, o comprovante do
  WhatsApp com as duas linhas; Meu pet shop › Nova promoção com "Onde vale" (sem banho e tosa somem o horário e os serviços) salva só
  do hotel. 390 (cliente): o link mostra "15% off na diária" na Creche e na página da creche, sem preço riscado nem "últimas vagas".
  Em cada tela: sem erro e sem rolagem para o lado. Capturas em `testes/saida/casa-taxi-*.png`.

## Variáveis do servidor de produção (não precisa para os testes)

A faxina diária (`/api/gestao/faxina`, `vercel.json` → crons, todo dia às 07:23 UTC) precisa, na Vercel:
`SUPABASE_SERVICE_ROLE_KEY` (chave de serviço do Supabase; só esta rota usa, nunca vai para o navegador),
`GESTAO_FAXINA_SEGREDO` (32+ caracteres aleatórios) e `CRON_SECRET` com **o mesmo valor** (a Vercel Cron manda
`Authorization: Bearer <CRON_SECRET>`). Sem elas a rota responde 503 e não faz nada. A faxina do banco (álbuns vencidos,
freios antigos, reservas do caderno) também roda pelo pg_cron (`gestao-faxina-diaria`, 06:17 UTC) quando o banco tem pg_cron.
Para testar a rota à mão: `curl -H "x-gestao-faxina: <segredo>" https://…/api/gestao/faxina` (devolve só quantidades).
A mesma faxina apaga as contas com o prazo de "Encerrar e apagar a conta" vencido (pet shop, arquivos e os logins do Maestro que
ficaram sem pet shop) e os arquivos da fila da LGPD. A **cópia completa** do painel do administrador (`/api/gestao/admin/copia`)
também usa `SUPABASE_SERVICE_ROLE_KEY` (sem ela, 503); só passa quem `sou_admin` diz que é admin.

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

Tela Hoje (migração 20261195), medida em 17/11/2026 com o Playwright e 150 ms de latência em cada pedido (dono, loja com banho,
creche, hotel e loja, 3 horários hoje; três aberturas em 390 e três em 1366): antes, 40 a 44 pedidos ao Supabase, a frase do Mozart
em 1,56 a 1,71 s e a rede quieta em 1,78 a 2,72 s; depois, 24 a 26 pedidos, a frase em 0,73 a 0,83 s e a rede quieta em 1,58 a 2,08 s
(o que fica: a abertura do aplicativo, a creche, os pedidos do link e o que vem abaixo da dobra depois do primeiro olhar).

Cuidado com banco compartilhado: `link.js` e `cakto.js` mudam `config_interna` (global) durante alguns segundos e devolvem no fim.
Outro processo testando o link ou a Cakto no mesmo banco ao mesmo tempo pode ver esses valores.
