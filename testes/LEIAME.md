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
#    GESTAO_MOZART_FALSO=1: o Mozart responde por um roteiro fixo (assistente/modelo-de-teste.ts), sem chamar o modelo:
#    "bloqueia…" traz o cartão de bloquear o almoço de amanhã; "markdown" responde com negrito e lista; o resto, uma frase
#    escrita palavra por palavra; "tabela de preços" traz os quatro cartões de serviço juntos (Confirmar tudo). Precisa dele:
#    banco/mozart-rota.js, telas/mozart-consertos.js, telas/mozart-cadastros.js e telas/operacao-estoque.js ("vendi 2 mordedores",
#    "vendi 10 pacotes de ração": cartão de vender_produto).
npx next build
ANTHROPIC_API_KEY=sk-ant-chave-falsa GESTAO_LINK_IA_FALSO=1 GESTAO_ERRO_TESTE=1 GESTAO_BOLETIM_FALSO=1 npx next start -p 3214

# 3. Testes
npm run test:unidade     # só os testes de unidade: sem banco e sem servidor (é o que o CI roda a cada pull request)
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
| `AUTH_CONTAINER` | `DB_CONTAINER` com `_auth_` no lugar de `_db_` | segredo do Auth local para gerar o código do e-mail (`seguranca-email.js`) |
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
- `link-tutor.js`: rodada 9 (N7), o que o tutor vê: valor por pet e total (`link-precos.ts`: porte P e porte G com 15% = 42,41 + 76,41 = 118,82, faixa sem porte, o que o banco guardou), endereço e link do mapa (`endereco.ts`), "Adicionar à agenda" (`ics.ts`), Tirar dúvida com promoções, endereço e resposta pela metade (`link-ia.ts`), abertura do link numa ida só também pelo navegador (`link-inicial.ts`) e a confirmação com o endereço.
- `seguranca-rodada9.js`: célula de planilha segura (`celulaCsv` em `csv.ts`: fórmula vira texto) e o uso dela na exportação dos aceites; `next.config.ts` com os cabeçalhos de segurança em todas as páginas; **`npm audit --omit=dev --audit-level=high`** sem alerta alto ou crítico (sem internet vira problema conhecido, não derruba).
- `caixa-trava-recibos.js`: rodada 9 (N5): comprovante do hotel com o sinal recebido na saída (110,40 + 282,60 = 393,00 = Crédito 2x 200,00 + Pix 193,00; `totalPagoAgora`, `fechoDaConta`), parcelas, troco, hora e quem atendeu nos comprovantes (`formasComValor`, `linhaDeQuem`), comprovante da conta para depois (`textoComprovanteAReceber`), recibo da conta paga (`textoReciboDeConta`: 15,00 + 0,34 = 15,34), troca e devolução (`textoComprovanteDevolucao`: 29,99 por 34,90, diferença 4,91), frases do fiado (`fraseDoLimite`, `fraseDoQueDeve`), Caixa no menu no modo simples e "Conta anterior" na cobrança.
- `equipe-chao.js`: rodada 9 (N6), a equipe do chão e os cuidados do hotel: dose na hora, atrasada ou depois (`situacaoDaDose`, `dosesDeAgora`), ficha de cuidados e ocorrências ligadas por padrão (`hotel.sem_cuidados`, `casa.sem_ocorrencias`), texto livre que fala de remédio (`falaDeRemedio`), atalhos de chegada que entram no Conferir a entrada (`entradaPelosAtalhos`), ordem do Meus pets de hoje, alerta curto, "Cannot coerce…" em português e as áreas das ferramentas do Mozart do chão.
- `desenho.js`: rodada 9 (desenho e acessibilidade): tempo do aviso rápido pelo tamanho do texto (`tempoDoAviso`), falta de internet não é "a tela travou" (`ehFaltaDeInternet`), a volta do Tab na folha (`proximoNoTab`), comprovante em folha comum e em bobina de 80 e 58 mm (`htmlDoComprovante`, `papelDoComprovante`) e o contraste das variáveis do `gestao.css` (dica do campo, borda, WhatsApp, etiqueta pêssego, foco sobre o verde, cores do avatar).
- `dinheiro-j.js`: rodada 8 (J): nascimento e sexo do pet na planilha (`nascimentoDe`, `sexoDe`, `linhasParaOBanco`, resumo), o total do hotel com o nome da temporada, do feriado e do segundo pet (`oQueMudouNasNoites`), comprovante da compra com o pagamento dividido e a linha da promoção, e `dividaPorVencimento`.
- `robustez.js`: rodada 8 (defeitos e robustez): nome sem HTML (`limparNome`), saída prevista longe demais com o ano (`saidaLongeDemais`, `dataAmigavel`), balão do navegador em português (`mensagemDeValidacao`), sem internet nunca vira "caixa fechado" (`conferirCaixa`), Ajuda sem "[EQUIPE] não é necessário…" (`lerRespostaDaAjuda`) e o Mozart pelas áreas da pessoa (quem só tem o Caixa não recebe marcar_horario; cartão forjado recusado no servidor).
- `rodada2-h.js`: segunda rodada (Rafael, Bia, Juliana, Neide): tempo esgotado do banco vira "Demorou demais, tente de novo" (`textoAmigavel`); a foto da entrada tenta de novo e desiste com aviso (`subirFotoDaEntrada`); Termos e Política 2.3 vigentes desde 17/11/2026; mapa sem "Campinas, Campinas" (`comCidade`); comprovante com a data do pagamento (`linhasDaData`); "2 noites (15/11 a 17/11)" no comprovante do hotel; linhas da creche em Quanto sobrou (`linhasDaCasa`); cancelamentos pelo dia do cancelamento e a tela abrindo em Este mês.
- `creche-hotel-final.js`: rodada final (Rafael e Bia): regra de cancelamento do sinal (`destinoPelaRegra`: menos de 7 dias vira crédito, 7 ou mais devolve; sem regra, nada marcado), hora do hotel (`horasDoHotel`), táxi pet na cobrança (`taxiDaCobranca`, `partesDosExtras` com `taxi`, mensagem de cobrança com "táxi pet 2 dias" e a chave Pix do hotel), "Devolver: coleira, guia e remédio da artrose" sem repetir "remédio", texto do aceite sem banho num hotel só, "Saiu uma foto", exemplo das regras do link num hotel só, "veio hoje" no Bom dia, valor médio pelas contas contadas (895 ÷ 2 = 447,50) e cancelamentos com as reservas.
- `operacao.js`: rodada 9 (operação): a rota da faxina aceita `CRON_SECRET` ou `GESTAO_FAXINA_SEGREDO` (`segredosDaFaxina`,
  `pedidoAutorizado`, `pareceAgendada`); a tela Hoje só lê do jeito antigo quando a função não existe ou quebrou, nunca quando o banco
  demorou (`leituraAntigaVale`); a abertura do link do cliente numa ida só, com as oito de antes só em banco sem `link_inicial`, e o
  resultado guardado por alguns segundos (`lerLinkCom`, `segundosDoLinkGuardado`). Sem banco.
- `rede-lenta.js`: o que a página pública põe no HTML (`link-servidor.ts`): cores do pet shop só conferidas (Vinho, cor própria;
  texto com CSS ou HTML nunca entra) e pedido com código inválido sem ir ao banco. Sem rede.
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
- `estreante-m.js`: rodada 8 (estreante): valor no cartão do pedido pelo link (`precoDoPedido`), a anotação do Mozart na ficha do pet (`anotacaoDoPet`), o modo simples (`foraNoModoSimples`) e "Faltam N coisas para começar".
- `venda-produto.js`: venda de produto que bate com o Estoque, sem banco: a entrada escrita à mão em Venda de produtos (`venda-solta.ts`: "Venda de 2 mordedores" acha "Mordedor de plástico") e o aviso; `vender_produto` do Mozart (quem recebe a ferramenta, o cartão com valor, total, forma, saldo e o produto novo), a recusa do `lancar_dinheiro` em Venda de produtos e as instruções.
- `mozart-cadastros.js`: as ferramentas de cadastro do Mozart (`assistente/ferramenta-cadastros.ts`), sem banco: serviços, horário e
  diárias só do dono (nem o gerente), produto só com Estoque, pacote só com Pacotes, tutor com Clientes, Agenda ou Creche e hotel;
  preço único ou por porte, aniversário, horário de funcionamento e almoço; vários cartões juntos gravam em ordem e o primeiro que
  falha para os seguintes (`PAROU_ANTES`); a tabela de preços vira quatro cartões numa resposta.
- `lembrete-zap.js`: o lembrete de WhatsApp aprovado pelo dono (`lembrete-zap.ts`), o mesmo da Agenda, do Modo envio e do Mozart:
  com e sem endereço, hoje e amanhã, término previsto, dois pets no mesmo horário, serviços por pet, creche e hotel, e o link
  `wa.me` com emoji e quebra de linha codificados.
- `mozart-consertos.js`: os consertos depois dos cinco testadores, com modelo de mentira e sem banco: creche e hotel nunca viram
  horário da agenda (`ferramenta-estadia.ts`: o serviço "Creche diária" é recusado em marcar_horario), quem não vê dinheiro nunca
  ouve "não deve nada", ver_sinais, frase de espera com o nome da casa, o texto do cartão sem "Pode fazer" (`semPedidoDeConfirmar`),
  negrito e lista na bolha (`assistente/markdown.ts`), a tabela de preços que manda creche e hotel para a diária e o modelo de plano
  (`tabela-precos.ts`, `destinoDaLinha`), o "Tirar dúvida" com dois pets, o preço de cada porte e a creche calculada no código
  (`estimarCreche`), a conversa guardada na aba (`assistente/guardada.ts`) e o cartão que grava uma vez só (`reservar`/`liberar`).
- `mozart-link-v2.js`: 2ª rodada dos testadores, sem banco: o "Tirar dúvida" não desmente um total da estimativa (`semDesmentir`),
  sabe os planos mensais da creche e o táxi pet (sem valor com o preço escondido); a linha "Pensando…" antes de cada volta do modelo;
  nome interno de ferramenta vira palavras (`assistente/sem-nomes.ts`); feriado dos próximos 14 dias no contexto; táxi do mensalista e
  `ver_maquininha` nas instruções; a resposta cortada por um recarregar guardada como interrompida.
- `mozart-rapido.js`: a voz (`src/lib/gestao/fala.ts`: a melhor voz em português do aparelho, natural do Edge > Google > aprimorada
  da Apple > outras do Brasil > Portugal; texto limpo para falar, "R$ 60,00" = "60 reais", "10h30" = "10 e 30"; frases que fecham
  enquanto o texto chega), as frases de progresso (`assistente/progresso.ts`, toda consulta tem a sua), as voltas com modelo e banco de
  mentira (texto aos poucos, consultas da mesma volta ao mesmo tempo e na ordem pedida, tokens somados, cartão continua parando), os
  próximos dias no contexto e as marcas de cache da rota. Sem banco.
- `parecido.js`: nomes parecidos para pedidos falados (`assistente/parecido.ts`, usado por `buscar_pets` quando o nome não bate):
  "tor" acha o Thor, "luna" a Lunna, "mau" a Mel (e a Bel: mais de um, o Mozart pergunta), pelo tutor e pelo começo do nome; nada
  inventado para nomes longe.
- `juliana.js`: o que a testadora Juliana achou: o nome do cadastro na resposta do Mozart (`parecido.ts`, `manterNomes`: "Tutora Teste 1"
  volta a ser "Tutor Teste 1"; Bruno Silva e Bruna Silva no cadastro, nome de uma palavra e palavra dentro de outra ficam como estão;
  `nomesDosResultados` tira os nomes de `buscar_pets` e do cartão confirmado), as cores da agenda (`cores.ts`: `corLivre`, `trocasDeCor`
  com o primeiro de cada cor ficando e os outros ganhando cor livre, desativado fora, mais serviços que cores), onde cada opção de
  Personalizar fica no menu (`noMenu`: Agenda, Estoque e Caixa, Pacotes, "Creche e hotel" com as duas e "Creche"/"Hotel" com uma, igual
  a `nomeDaCasa`) e quando ligar creche ou hotel pergunta do link (`linkPergunta`: só com o link ligado e a área nova fora do link).
- `convite-termos.js`: depois do teste de 17/11: os textos do link de convite que não vale (`convite.ts`, `avisoDoConvite`: vencido,
  usado, trocado por um mais novo, cancelado, inválido, outro e-mail, muitas tentativas; com o nome do pet shop, sem repetir "Peça ao
  dono…"), Termos e Política 2.3 (`documentos.ts`: quem aceitou a 2.2 vê o aceite de novo, resumo com cópias, troca de plano e cookies) e
  a Ajuda achando "vocês fazem cópia dos meus dados?" (tópico `copias`, sem prometer prazo) e "como mudar de plano".
- `loja-textos-lgpd.js`: 2ª rodada (Camila, Neide, Juliana): mensagens com do/da pelo sexo do pet e o verbo concordando ("Pipoca
  marcada", "O banho e a hidratação da Luna ficaram marcados", o lembrete no modelo aprovado ("✂️ Banho + hidratação"); sem sexo, como antes;
  serviço desconhecido diz "O horário"); nome curto da equipe que diferencia ("Banhista Ana"/"Banhista Beto", `nomeNaEquipe`);
  valor em estoque com o custo médio sem arredondar (5 × 142 + 4 × 150 = 1.310,00, não 1.310,04); unidade e validade da planilha de
  produtos (`planilha-produtos.ts`); selo do boletim com os serviços e "Comportada"; aniversário do pet sem o ano (1904: sem idade, sem idoso).
- `textos.js`: textos que as testadoras acharam confusos: o comprovante com parte da dívida antiga ("Pagou R$ 40,00 do que devia de
  antes (R$ 75,00); ainda deve R$ 35,00", sem repetir o resto; quitado; chamada antiga sem o total) e as iniciais sem as palavras
  pequenas ("Banho e Tosa" = BT, "Hotelzinho da Bia" = HB).
- `planilha.js`: trazer clientes de uma planilha (`planilha.ts`, `xlsx.ts`): .xlsx de verdade (montado por `lib/xlsx.js`, compactado ou
  não, a primeira aba pela ordem das abas, telefone salvo como número "1.1912345678E10"), o texto separado por tabulação que volta
  igual pela leitura da tela, "Luna, Bob" / "Mel e Bob" em dois pets ("Thor filhote" não), observação de alergia/medo/bravo que vira
  alerta, as linhas para o banco (um pet por linha, telefone limpo, listas de telefone incompleto e de dois telefones) e as frases do resumo.
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
- `dinheiro-n4.js`: migração 20261234 (rodada 9, N4): `centavos` contra o `round()` do banco em 6 mil combinações de preço × quantidade × % (também negativos); venda por peso (0,35 kg × 18,90 = 6,62) sem "desconto dado" e com um centavo de folga; a cadeia do dinheiro (`dinheiro_cadeia`: Recebido 168,61 → Faturamento 121,30 → Resultado −28,70 → depois das taxas −31,58) igual a `faturamento.ts`, `lucro_do_periodo`, `taxas_do_periodo` e `indicadores_do_periodo`; valor médio por conta com uma definição; quem não cuida do financeiro e outra loja recusados; as planilhas de `contador.ts` somadas contra a tela (Conta no resultado, Conta no faturamento, Taxa, repasses a receber, Já recebido e Em aberto, conta em parte, data da conta em aberto, retroativo); saldos em aberto; o crédito datado pelo fuso do pet shop.
- `caixa-trava-recibos.js`: migração 20261231 (rodada 9, N5): trava de preço em creche e hotel (diária da lista, noites pelas datas, valor da saída com o desconto máximo, pela função do check-out e pela API direta, pacote só do próprio pet, check-out pendente), Alterações (`diaria`, `diarias`, `checkout`, `devolucao`), apagar e baixar valor recebido com a trava, limite de fiado pelo que fica (`fiado_limite_no_fim`: 175,50 com 100,00 pagos fica 75,50), falta com a taxa numa gravação (`agendamento_faltou`), devolução ligada à entrada (`entrada_devolver`, `entradas_devolvidas`), troca fora do dinheiro do caixa (`trocas_do_caixa`) e o Mozart dando baixa em conta de A pagar (`ferramenta-pagar-conta.ts`: a luz de 268,40 sai uma vez só).
- `equipe-chao.js`: rodada 9 (N6, migração 20261232): comissão de quem não mexe com dinheiro só com o total (minha_comissao, comissao_extrato por mês inteiro, ver_comissao do Mozart) e a opção `comissao.mostrar_valores`; VARREDURA: todas as tabelas e todas as funções de leitura chamadas com a sessão do tosador e a da monitora, sem nenhum preço semeado (67,31; 123,47; 58,13; 96,29…); "Entregue ao tutor" conclui (entra em Atendimentos para cobrar e na comissão); mensalista numa gravação só (`creche_plano_salvar`: falhou uma parte, nada fica); Mozart do chão (`ver_cuidados`, `marcar_cuidado`, `mover_no_quadro`, `registrar_ocorrencia`) com o cartão, as áreas e a recusa do banco.
- `dinheiro-relatorios-j.js`: migração 20261224 (rodada 8, Sandra): a devolução sai de Relatórios > Produtos, dos Indicadores e do Mozart (`devolucoes_por_produto`, `vendasPorProduto` com as devoluções) e bate com Quanto sobrou; mensalidade e sinal que ainda não venceram não contam no limite de fiado (`fiado_deve`, `fiado_situacao` com vencido / vence hoje / a vencer); a promoção do horário como linha negativa sai só do serviço (partes, comissão 40% de 72,00, `promo_usos`, sem "desconto do caixa"); crédito do tutor na venda no balcão; `resumo_financeiro` do Mozart igual ao Financeiro; `cobradoPorItem` da cópia; planilha de clientes com nascimento e sexo do pet.
- `robustez.js`: migração 20261226: nomes limpos pelo banco (pet shop, tutor, pet, equipe), nome só de marcação recusado, saída prevista a mais de 366 dias recusada (estadia antiga com outra mudança passa) e duas abas fechando o mesmo caixa (a segunda recebe `ja_fechado` com a hora e o valor contado).
- `estreante-m.js`: rodada 8 (estreante): o Mozart anota na ficha do pet ("a Mel é brava, morde"): cartão "Anotar na ficha do pet", nada gravado antes do Pode fazer, o texto entra no fim de Cuidados e alertas sem apagar nada, a mesma confirmação não grava duas vezes, o que outra pessoa escreveu no meio fica; o tosador também anota; outro pet shop não acha o pet. Modo simples: o dono liga pelas opções, a equipe recebe e não muda.
- `rodada2-h.js`: migração 20261221: "Táxi pet do mês" e "Táxi pet (datas)" na conta da mensalidade (a busca fora do horário com o nome dela); reserva cancelada hoje para o mês que vem nos indicadores (`estadias_canceladas_no_periodo`); `lista_espera.cheio_ao_entrar`; quem só usa a agenda não apaga horário marcado (o caixa e o dono apagam).
- `creche-hotel-final.js`: migração 20261218. Táxi pet do mensalista: o Chegou da chamada anota o dia de táxi (só com táxi por dia e preço), Desfazer tira, a cobrança do mês seguinte leva os dias (`taxas` com "tipo": "taxi", somado em valor_extras e na conta a receber), cancelar a cobrança solta os dias, táxi fixo por mês entra no próprio mês ("taxi_mes"); o monitor lê ida/volta mas não o preço; viagens do Leva e traz (`creche_taxi_viagem_marcar`: levar só depois do Chegou, plano sem táxi recusado). Indicadores: 2 reservas canceladas de 3, o sinal não conta como conta (1 conta de R$ 300 = 222 + sinal de 78). Link: `link_hotel_opcoes.horas` e `.pix` (só com sinal), `link_creche_planos` (só com a opção; sem preço quando o link esconde preços), `link_fechados_nomes`.
- `seguranca.js`: isolamento entre pet shops e anônimo; dono não mexe na própria assinatura nem vira admin; o que cada papel grava
  (recepção, monitora, tosador, estoque); caixa fechado travado; **matriz de leitura das colunas com dinheiro** por papel
  (dono, recepção, monitora, tosador, estoque, anônimo) e das funções de preço. No fim, a **varredura** (rodada 9): a lista de
  TODAS as tabelas/visões e de TODAS as funções que a API alcança sai do próprio banco na hora do teste (tabela ou função nova
  entra sozinha). O dono de outro pet shop e o anônimo tentam ler, mudar e apagar em cada tabela e chamam cada função com os ids
  de A; nada pode trazer a marca posta nos dados de A (nome, e-mail, endereço, R$ 7.777,77) e o retrato dos dados de A tem de
  ficar igual. Anônimo que lê qualquer linha de qualquer tabela derruba o teste (catálogo público de propósito entra em `PUBLICAS`).
  Ficam fora da chamada (lista `PULA`): funções que apagam a conta de quem chama, criam loja, do painel e as que só contam uso.
- `seguranca-rodada9.js` (migração 20261228; a parte dos cabeçalhos e da rota do Mozart precisa do servidor, de preferência com
  `GESTAO_MOZART_FALSO=1`): teto geral da IA por dia (Mozart, Ajuda, boletim, Tirar dúvida: o que passa do teto volta "geral"),
  conta só para consulta sem IA ("fechado"; a rota responde 403 `so_consulta` com frase simples), teto menor no teste grátis;
  trava do servidor (carência → fechada; com a trava, segredo errado é recusado e não gasta a cota de ninguém; só `service_role`
  grava); Cakto por e-mail só com o e-mail provado (sem prova: "sem conta" com `payload.sem_prova`; ao provar, liga sozinho;
  callback assinado continua direto); clientes, pets e saúde por área (só Estoque não lê; sem Clientes não edita o tutor; Caixa e
  Financeiro só o limite do fiado); aceite só de versão conhecida (`documentos_versoes`; **subiu a versão em documentos.ts? ponha
  a linha na tabela numa migração**, senão este teste falha); IP do aceite da entrada; freio de lojas novas por rede; nome de
  arquivo nos buckets `pets` e `diario`; cabeçalhos de segurança em todas as páginas e a rota `/api/gestao/csp`.
  O que mexe em `config_interna` roda numa transação desfeita no fim (`ensaio`, com `set local role` e `request.jwt.claims`):
  não atrapalha outro teste rodando ao mesmo tempo. O executor (`rodar.js`) renova a carência da trava num banco LOCAL sem trava.
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
- `convite-conferir.js`: conferir o link do convite antes de criar a conta (migração 20261219, `convite_conferir`, sem login): link que
  vale responde só a situação e o nome do pet shop (nunca o e-mail do convite); outro e-mail = "outro_email" sem criar nada; link de
  antes do "Reenviar" = "substituido"; vencido, e-mail trocado ("cancelado"), usado (e continua "usado" depois que a pessoa sai);
  limites de 10 tentativas de e-mail por código e 30 conferências por rede por hora; apagar a loja com convites não trava.
- `seguranca-email.js`: e-mail da conta não prova nada ("Confirm email" desligado; migração 20261209). Convite da equipe: só o dono
  gera o código (`convite_gerar`; recepção, outro dono e anônimo recusados; só o hash no banco; 7 dias); quem cria conta com o e-mail
  do convite **sem o código não entra** (`entrar()` não liga mais pelo e-mail); código inventado, de outro e-mail, antigo (gerou de
  novo), vencido e já usado (outra conta) recusados; o certo entra uma vez (a mesma pessoa de novo só confirma); trocar o e-mail ou
  tirar o acesso invalida o código; convite antigo sem código aparece sem link em `convites_situacao` e entra depois de mandar de
  novo. Escola: conta nova com o e-mail da compra (só senha) não vê a compra (`meu_email()` vazio, `email_provar` falso); com o código
  do e-mail (gerado pela API de administrador do Auth local, com a chave assinada pelo segredo do contêiner `AUTH_CONTAINER`, padrão
  `supabase_auth_petsocial`) vê; quem prova o próprio e-mail e depois troca para o da compradora não vê. Cakto: compra de antes da conta
  existir ou do e-mail ser posto na conta fica "sem_conta"; o `cakto_email` de uma compra antiga não puxa compra nova; o callback
  assinado liga com outro e-mail; pela rota, o `paidAt` chega como `pago_em`. Mexe em `config_interna` e devolve no fim, como `cakto.js`.
- `erros.js`: registro de erros (migração 20261180): ninguém lê as tabelas; funções do painel só para o admin; papel e áreas vêm do
  banco; limpeza e limites no banco; repetição junta (mesmo aparelho e versão, 10 min); freio por aparelho (30/min), por pet shop
  (60/min) e geral (1000/h, posto no limite durante o teste e devolvido); sem internet só conta; resolvido some e volta numa versão
  nova; rota do servidor que quebra vira registro com origem "servidor". Precisa do servidor com `GESTAO_ERRO_TESTE=1`.
- `mozart-link-v2.js` (servidor com GESTAO_LINK_IA_FALSO=1 e GESTAO_MOZART_FALSO=1): `link_taxi` (táxi pet do link, sem valor com o preço escondido) e o "Tirar dúvida" respondendo o plano de 3x e o táxi; `ver_sinais` com o sinal que virou crédito (219,60 − 54 − 89,70 = 75,90 com o pet shop); táxi do mensalista em `ver_planos_creche` e `ver_hospedes` (preço só para quem recebe); dia fechado em creche_por_dia; `ver_maquininha` igual a `taxas_do_periodo`; `ver_descontos`; "Pensando…" como primeiro evento da rota.
- `mozart-consertos.js`: com o banco de verdade e modelo de mentira: "coloca a Mel na creche amanhã" vira reserva da creche (e a
  confirmação repetida grava uma vez só, pela função `assistente_acao_reservar`, migração 20261215), mensalista no dia do plano não
  reserva e em outro dia vira dia extra, hotel com entrada e saída, `ver_hospedes` com a creche dia a dia (mensalista de todo dia),
  a busca do tosador sem valor, `ver_sinais` igual a `lerSinaisDoPeriodo` (Relatórios), conta fixa que "não entrou este mês",
  criar_conta_fixa, e a tabela de preços gravando a diária da creche, o modelo de plano e a diária do hotel por porte.
- `mozart-venda.js`: o Mozart vende produto pelo caminho da Venda no balcão (`venda_registrar`): mordedor sem preço vendido a R$ 100 vira um lançamento só ligado à saída com motivo Venda (saldo 98, 1 venda no Estoque, o produto ganha o preço), sem repetir na segunda confirmação; ração fora do Estoque cadastrada e vendida no mesmo cartão; `lancar_dinheiro` em Venda de produtos e saída de estoque "de venda" recusados; Rita (Caixa) vende mas não cadastra; Edu (só Estoque) dá baixa sem dinheiro; pagar depois em A receber.
- `mozart-cadastros.js`: com o banco de verdade e modelo de mentira: a tabela de preços do dono em quatro cartões (Confirmar tudo grava
  os quatro), leva que para na falha, produto novo que chegou com quantidade entra com o preço de venda, produto pelo Edu (sem custo),
  tutor pelo Tito, modelo de pacote pela Rita, horário e diárias só do dono, e o lembrete para tutor sem telefone (pede o número,
  um cartão salva na ficha e o botão do WhatsApp já vem pronto; sem salvar, o botão sem número).
- `mozart-rota.js` (servidor com GESTAO_MOZART_FALSO=1 e GESTAO_LINK_IA_FALSO=1): a resposta do Mozart chega palavra por palavra
  pela rota de verdade mesmo pedindo gzip (content-encoding identity), o texto do cartão sem "Pode fazer", a mesma confirmação
  mandada duas vezes grava um bloqueio só, e o "Tirar dúvida" responde o total dos dois pets igual a `link_hotel_estimativa`.
- `mozart.js`: o Mozart e o dinheiro dos clientes com um **modelo de mentira** (roteiro fixo; as voltas de `assistente/conversa.ts` e as
  ferramentas rodam de verdade, com o login de cada papel): "o dono do Bob me pagou os 35" com duas contas abertas (5 + 30) quita as duas
  e o mês ganha 35 uma vez só (a entrada solta é recusada; o toque duplo não recebe de novo), pagamento em parte, pagou a mais (pergunta;
  com `sobra: "credito"` vira crédito), `anotar_divida` ligada ao tutor, `quem_me_deve` por pessoa, papéis (`cliente_receber_contas`
  recusado para quem não mexe com dinheiro, conta e crédito de outro cliente recusados) e o teto de voltas e de tempo. **Nome do tutor**
  (Juliana): "pipokinha" acha a Pipoquinha pelo nome parecido, o cartão mostra "Pipoquinha (Tutor Teste 1)", o resultado gravado leva o
  `cartao_confirmado`, e o "Ela é da Tutora Teste 1." do modelo de mentira sai como "Tutor Teste 1"; as instruções pedem os nomes exatos.
- `importar.js`: planilha de clientes numa operação só (migração 20261217, `importar_clientes`; achado da Juliana: parou em 7 de 10 e o
  resumo errou): 10 linhas com "Luna, Bob", alergia, telefone incompleto, a Ana pelo telefone, linha repetida e homônimo; o resumo bate
  com o que entrou no banco (7 tutores e 9 pets); a mesma chave devolve o que já entrou; outra chave: "Nada novo"; linha estranha é
  pulada; erro no meio (gatilho de teste) recusa tudo e não gasta a chave; recepção importa, estoque e outro pet shop não; ninguém grava
  na tabela direto; a última importação é lida de outro login; `importacao_desfazer_registro` desfaz uma vez só; 2.000 linhas dentro do
  limite de 8 s do banco. Rascunhos (`rascunhos`): guardar e regravar, cada pessoa só vê os seus, tipo estranho recusado, faxina de 7 dias.
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
- `desempenho-operacao.js`: rodada 9, desempenho do banco e operação (migração 20261229), numa loja de teste com história
  (`testes/lib/semente-volume.js`: 420 horários em 14 meses, contas com serviço e produto, partes de conta, "cobrar a diferença",
  devoluções, créditos, taxas, estadias com sinal, pacotes, bloqueios, pedidos do link, caixas fechados). As funções trocadas devolvem
  **exatamente** o mesmo que as de antes (`testes/lib/antes-20261229.sql`, num esquema só da rodada): `indicadores_do_periodo` (um dia,
  30 dias, 3 meses e 12 meses), `pacotes_acabando`, `link_vaga` (65 dias de horários), `conflitos_agenda`, `partes_do_lancamento`,
  `partes_por_servico`, `lucro_repartir` e `comissao_linhas_calc`. `gestao_hoje` diz as partes que falharam (`falhas`); `erro_do_banco`
  grava em `erros_app`; `link_inicial` igual às oito funções públicas; rotinas (`rotina_anotar`, `admin_rotinas`, atraso de 36 h); índices
  e o plano de exclusão (toda tabela da cascata coberta, com índice por pet shop). **Apagar a conta**: um lote e para (andamento gravado,
  nada solto, cancelar recusado), a faxina retoma e termina (todas as linhas, tabelas sem `petshop_id`, logins, registro), loja com erro
  fica anotada sem travar as outras, e a fila `logins_lixo` tenta de novo o login que o Auth não apagou. Precisa da chave de serviço local.
- `faxina.js`: faxina agendada (migração 20261195; a 20261199 junta as contas com o prazo de exclusão vencido e a fila `arquivos_lixo`, ver `lgpd.js`): rota `/api/gestao/faxina` recusada sem o segredo (401; 503 no servidor de teste,
  que não tem `GESTAO_FAXINA_SEGREDO`), segredo pelo `Authorization: Bearer` (Vercel Cron) ou `x-gestao-faxina`; as funções só com a
  chave de serviço; a tarefa `gestao-faxina-diaria` no pg_cron (quando o banco tem); `faxinaGeral` com a chave de serviço local
  (`SUPABASE_SERVICE_ROLE_KEY` ou `npx supabase status -o env`), só na loja de teste: foto do boletim sem boletim há mais de um dia
  sai, a de agora fica; PDF do caderno-tmp com mais de uma hora sai, o de agora fica; o de outro pet shop fica.
- `lgpd-ajustes.js`: ajustes da revisão jurídica (migração 20261210). **Registro de acesso** (`registrar_acesso`): o login grava quem,
  quando, o IP (x-forwarded-for) e o navegador (cortado em 300 letras); dois logins no mesmo minuto e a abertura no mesmo dia não gravam
  de novo; anônimo recusado; ninguém (anônimo, dono, recepção) lê ou grava a tabela `registros_acesso` direto; `admin_registros_acesso`
  recusado para o dono e lido pelo admin (por e-mail ou login). **Faxina** (`gestao_faxina_banco`): acesso com mais de 6 meses sai, com
  menos fica; conversas (`conversas`) e histórico do Mozart (`assistente_eventos`) com mais de 12 meses saem, os de 11 meses ficam.
  **Apagar o tutor** (`cliente_anonimizar`): orçamentos da Ana (pela ficha, só pelo telefone com +55, e um já convertido) ficam sem nome,
  telefone e ficha, com o nome tirado da observação e o valor igual; o do Beto fica; conversas com o nome dela (maiúsculas e espaços
  diferentes) ou o telefone formatado e o histórico com o nome ou o id do pet dela saem; as de outro tutor e de outra loja ficam.
  **Autorização de foto**: o texto novo (sem cobrar, não vende, pessoas na foto, do/da/de, com e sem @), IP e navegador gravados (pela
  API e pela rota da página do boletim, com os do tutor); autorização antiga fica com o texto da época. **Checklist de entrada**:
  `aceite_hash` = SHA-256 de `termo + "\n" + fotos` na assinatura e no aceite pelo link, apagado quando a entrada muda, não muda em
  outra gravação, a equipe lê e ninguém grava. Precisa do servidor só para a rota do boletim.
- `lgpd-rodada9.js`: privacidade, rodada 9 (migração 20261236). **Varredura do banco inteiro**: `semear` cria um tutor com uma
  marca em todos os campos pessoais (ficha, pet, saúde, contatos, horário, estadia com endereço, cuidados e avisos, diário,
  lista de espera, pedidos pelo link com o telefone dele, com outro telefone e o nome completo, e com outro telefone e outro
  nome mas ligado ao horário, orçamento, dinheiro, crédito, boletim, checklist, autorização de fotos, álbum, conversas,
  rascunho, freio do link) e fotos em `pets`, `diario`, `boletim` e `entrada`; depois de "Apagar dados deste tutor", de
  "Excluir de vez" (o `delete` que a tela faz) e de apagar direto no banco, `varrer` procura a marca e os telefones em TODA
  coluna de texto, lista ou jsonb de TODA tabela do esquema public e o Storage: não sobra nada, e a faxina tira os arquivos.
  Campo pessoal novo? Ponha em `semear`. O que não pode sair junto: pedido de outra pessoa com o mesmo telefone, e o que é da
  ficha que fica ao juntar duas repetidas. **Fotos**: trocada e tirada vão para a fila pelo banco; sem ficha com mais de 1 dia
  sai na faxina; em uso nunca sai. **Prazos**: freio do link 2 dias, pedido que não virou horário 90 dias. **Painel**:
  `admin_conversas` sem texto, `admin_conversas_numeros`, `admin_conversa_abrir` só com motivo e com registro, o dono vê em
  `equipe_maestro_acessos_ver`. **Titular**: planilhas novas em `cliente_dados`, `meus_dados`, `meu_login_apagar` e a rota
  `/api/gestao/minha-conta/apagar`. **Login de outro produto**: cria um esquema `zz_outro_<sufixo>` com uma tabela que aponta
  para `auth.users` (e apaga no fim); o login com linha lá não entra na fila, não sai com a conta apagada e fica em
  `logins_mantidos`. Sem a chave de serviço local, a parte da faxina é pulada.
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
- `contas-fixas.js`: **contas fixas** (migração 20261212), com as datas de 2030 em diante pela geração interna
  (`contas_fixas_gerar_interno(p, dia)`, sem depender de hoje). A conta do mês entra 10 dias antes do vencimento (nada 16 dias
  antes), uma vez só (chamar de novo e duas telas ao mesmo tempo não repetem); dia 31 em fevereiro vence em 28/02 (29/02 em ano
  bissexto, 30/04 em abril, banco e app); trimestral desde fevereiro (fev, mai, ago, nov), semestral (abr, out), anual (março, e o
  de 2031 10 dias antes); começo 15/03 e fim 30/06 só abril a junho; nada antes do mês do cadastro; no máximo 12 meses para trás;
  pausada não gera e ligada de novo usa o valor novo; a conta excluída de A pagar não volta (e "veio R$ 2.600" é recusado);
  apagar a conta fixa deixa as contas já criadas. Valor que varia: entra com a marca de estimado, que sai ao escrever o valor ou ao
  pagar; mudar depois de paga fica em `lancamentos_alteracoes`; `contas_fixas_valor` cria a do mês já com o valor certo, sem
  repetir, e recusa conta paga e mês fora do trimestre. Quem pode: dono e quem cuida do financeiro; recepção (caixa, sem
  financeiro), tosador, outra loja e anônimo não leem nem gravam; ninguém grava direto na tabela nem liga ou desliga um lançamento
  de uma conta fixa. Bom dia e Hoje: "Luz da loja venceu em dd/mm (R$ 380,00, valor estimado); Aluguel da loja vence amanhã
  (R$ 2.500,00)", só para quem cuida do financeiro. **Quanto custa manter**, à mão: 2.500 + 380 + 1.200 ÷ 12 + 600 ÷ 3 = 3.180
  (sem a pausada e a que terminou), faturou 795 = 25%, faltam 2.385, o faturamento igual ao de `lucro_do_periodo`. Relatórios:
  saiu 480 (luz 380 + produtos 100, devolução fora), resultado 275 em Quanto sobrou e Indicadores; `contas_fixas_do_periodo`
  separa 380 + 100 = o mesmo saiu, por mês também; sem a ligação com a conta fixa, os totais são idênticos; `lucro_do_periodo` e
  `indicadores_do_periodo` não foram trocados. Mozart: `ver_contas_fixas` (3.180, 23% depois da devolução) e `valor_conta_fixa`
  (cartão com o valor de antes; grava 2.610; conta paga recusada). A faxina diária chama a geração.

- `loja-camila.js`: o que a testadora Camila achou na loja (migração 20261214). **Ver custo e margem**: pela API, quem tem Estoque
  sem dinheiro não recebe custo nenhum (produtos_reservado, custos_dos_produtos, compras, movimentos, lotes, Vencendo e contagem sem
  valor, `produtos.custo` direto recusado, devoluções vazias), a recepção (Caixa) e o tosador também não; o dono recebe tudo; com a
  chave "custo" o Estoque passa a receber, sem ganhar o dinheiro (ve_financeiro falso, lançamentos e devoluções vazios); `veCusto`
  da tela igual; o Mozart (ver_estoque, o_que_comprar) só manda custo para quem vê. **Entrada com despesa** (`estoque_entrada`):
  4 × 150 com R$ 600,00 no Pix (estoque +4, despesa paga hoje), mesma chave não repete, sem forma / Estoque sem dinheiro / recepção
  "a pagar" são recusados e nada entra (nem a entrada), "Vou pagar depois" vira conta a pagar, lote e validade da entrada. Estoque
  inicial no lote. **Orçamento** 364,70 (produtos 320,90 + banho 43,80): virou venda sem horário = "falta marcar", valor_vendido
  320,90, o horário marcado depois completa; a observação vai no texto do WhatsApp. **Contas fixas**: o aluguel do dia 1 cadastrado
  hoje "não existe" neste mês (antes_do_inicio), o DAS em A pagar, o Mozart diz isso e a regra de não deduzir; faturamento com a
  margem (4.759 ÷ 37% = 12.862,16; sem custo suficiente, nenhuma estimativa).

**migracoes/**
- `prova-ordem.sh`: cria um banco de rascunho no mesmo Postgres (chão copiado do banco local sem o `public`), aplica todas as
  migrações em ordem **menos as adiadas** (`ADIAR`, padrão `20261149 20261157`, as que entram depois de publicar o app) e depois as
  adiadas por cima, cada uma numa transação. Apaga o rascunho no fim (mesmo se falhar). `ADIAR=""` aplica tudo em ordem;
  `MIGRACOES=/outra/pasta` testa outra pasta.

- `loja-textos-lgpd.js`: migração 20261222. `estoque_entrada` recusa produto com Controlar validade sem a validade (só lote também);
  com a validade e sem lote vira um lote; produto sem o controle e volta de venda desfeita continuam; `produtos_custo_exato`
  (1.310 ÷ 9, só para quem vê o custo, custo da ficha esquece a média exata, a média seguinte parte dele); aniversário sem o ano
  sai "20/11" na planilha do tutor. `lgpd.js` ganhou: planilhas com palavras e "R$ 60,00", protocolo do pedido, o nome do tutor no
  registro e "Cliente removido" depois de apagar.

**telas/** (Playwright, Chromium)
- `seguranca-rodada9.js` (390 e 1366): com os cabeçalhos novos, o site de vendas, a entrada, o cadastro, o link do cliente e as telas do aplicativo abrem sem erro, sem rolagem lateral e **sem nenhum aviso "[Report Only]"** da lista de carregamento (Supabase, fotos, fontes); o Manual tem "O Mozart tem limite de uso?"; no painel do administrador (aba Cakto), o cartão Trava do servidor e o Teto de uso da inteligência artificial hoje.
- `dinheiro-n4.js`: rodada 9 (N4) com a dona: Financeiro com Faturamento − Despesas = Resultado e "Como os números se ligam" (9 passos), as quatro planilhas de Para o contador e o Exportar somando o Resultado da tela; Relatórios e Indicadores com o mesmo Valor médio por conta; a opção do feriado no repasse; Hoje ("Faturamento de hoje"), Caixa ("Recebido hoje") e a retirada do dono pelo Caixa virando despesa; aparelho em Tóquio.
- `caixa-trava-recibos.js`: rodada 9 (N5) com a recepção e o preço travado (10%): check-out da creche abaixo da conta com o botão apagado e o menor valor na folha (R$ 63,00), comprovante com "Dinheiro R$ 63,00" e quem recebeu; desconto acima do máximo ("Desconto acima do permitido", total de R$ 63,00); Faltou com a taxa num aviso só e gravada mesmo recarregando; venda no balcão com "Ana deve R$ 119,80 · … cabe mais R$ 30,20" e a recusa do limite escrita na venda; entrada recebida sem Excluir e com Devolver ao cliente (comprovante da devolução); 1366: Caixa depois de uma troca conta só o dinheiro (Entrou hoje R$ 147,90) e Alterações mostra o check-out abaixo da conta e as devoluções. Capturas em `testes/saida/caixa-trava-*.png`.
- `equipe-chao.js`: rodada 9 (N6) em 360 px: o tosador abre o Hoje por Meus pets de hoje (alerta em vermelho, um toque por etapa até Entregue, que conclui), Agenda em Só os meus (lembra a escolha, alerta na linha, serviço sem corte), atalho de chegada que entra no Conferir a entrada, Minha comissão só com o total, e nenhuma resposta da sessão com preço; a monitora sem Agenda não vê o banho, marca o remédio atrasado em Cuidados de agora, botões de dose com 48 px e a ficha impressa sem "Nenhum remédio anotado"; a dona (1366) vê o Thor em Atendimentos para cobrar. Capturas `testes/saida/chao-*.png`.
- `desenho-nomes-longos.js`: rodada 9: com pet de 40 letras, tutor de 61, produto de 67 e pet shop de nome comprido, nada passa da largura da tela em 17 telas (360, 390, 768, 1366 px e celular deitado 740 x 360) nem nas folhas abertas pelo cabeçalho (Nova conta fixa, Novo lançamento, Marcar horário, Pet novo, Vender…); cartão do horário com o pet em até duas linhas e o tutor em uma; letra do aparelho em 150% e zoom de 200% sem corte e sem botão por cima de outro. `RELATORIO=/caminho.json` grava as medidas.
- `acessibilidade.js`: rodada 9: "Pular para o conteúdo" no primeiro Tab, nome do botão do Mozart, folha com nome, foco que entra, Tab preso, Esc e foco de volta, confirmação de apagar com o foco em Voltar, cantos dos avisos (alert e status), tela "Sem internet agora" (`?__erro_teste=pedaco`) e axe-core em 13 telas e numa folha, em 390 e 1366 px, sem regra grave quebrada. O axe-core não é dependência: `AXE=/caminho/axe.min.js` (sem ele, essa parte é pulada). `RELATORIO=/caminho.json` grava a contagem por tela.
- `robustez.js`: check-in que troca pet e tipo limpa a saída prevista e recusa a data a dois anos (390 e 1366), cartão com o ano, aba velha do caixa avisa "Este caixa já foi fechado", foco visível, "Preencha este campo.", rascunho do Pet novo depois de recarregar e a faixa "Sem internet agora".
- `estreante-m.js` (360 px): conta nova com "Agora, o primeiro cliente" e "Faltam 2 coisas para começar", sem "Cadastrar o primeiro pet"; o botão Ajuda do alto (44 px) abre Tirar uma dúvida, Pedir para o Mozart fazer, Manual e o passo a passo da tela, e o Ajuda do Mais abre a mesma folha; sem rolagem para o lado, nome do pet shop inteiro, dias da agenda com 44 px; valor do porte no pedido pelo link; álbum com "Banho e corte de unhas"; modo simples (Outras áreas, Agenda sem Quadro, Mais opções no horário, recebimento sem pedir para abrir o caixa).
- `rodada2-h.js`: segunda rodada no site real (Rafael): check-out com o banco respondendo "statement timeout" (a tela diz que demorou, sem o texto do banco, e a nova tentativa fecha a conta uma vez só); entrada com a foto que não sobe (salva sem ela, avisa na folha, a foto fica com Tentar de novo e entra depois); Quanto sobrou numa creche só com as mensalidades (390 e 1366).
- `creche-hotel-final.js`: rodada final pela tela. Chegou da Chamada abre a folha Entrada (Todos os pets) e o cartão do mensalista tem Conferir a entrada; plano com táxi na Chamada e no Leva e traz (Buscado anotado); primeira foto de Fotos de hoje sobe e aparece (tempo medido); cancelar reserva com sinal pago traz Virar crédito do tutor já marcado pela regra e o cartão sai na hora (crédito de R$ 78 gravado); Aceitar todos tira o cartão do pedido na hora; link do hotel com 14:00/12:00 sem taxa e com a taxa às 18h sem "até as 15h"; Indicadores num hotel só sem mapa de horários, com ocupação e reservas canceladas.
- `passeio.js`: todas as telas principais (Hoje, Agenda, Clientes, Creche e hotel, Pacotes, Caixa, Financeiro, Relatórios, Estoque,
  Equipe, Meu pet shop, Assinatura, Manual, Escola) em **390 e 1366**, com o dono e com cada papel da equipe (só as áreas dele, e
  algumas fora da área), as telas de impressão, `/gestao/admin` com dono comum e as páginas públicas (produto, entrar, link do
  cliente, página do tutor). Em cada uma: nenhum erro de página ou console, nenhum pedido recusado, sem rolagem para o lado e com conteúdo.
- `loja-textos-lgpd.js`: 2ª rodada pela tela (390, captura 1366): planilha de produtos com validade e lote aparece sem recarregar;
  Entrada sem validade não anota; "Pode pagar assim mesmo"; Vencendo com Ver produto e Dar baixa (abre a Saída com o lote);
  horário num dia que já passou: "Mel marcada", sem confirmação nem lembrete; "Banhista Ana" e "Banhista Beto" nos chips;
  aniversário do pet só com dia e mês e na lista Aniversariantes do mês; cartão "Promoção de aniversário do pet"; Registro de pedidos
  de dados com o nome e o protocolo. `cookies-termos.js` ganhou: sem escolha o fbevents.js não baixa, só depois do Aceitar; Termos
  "vigente desde 17/11/2026" e sem palavras grudadas.
- `loja-camila.js`: a loja da Camila pela tela, em 390 e 1366. Quem cuida do estoque sem "Ver custo e margem": a lista e a ficha
  sem margem, custo médio, último custo nem valor em estoque; Produto novo com "Controlar validade" pede o lote ou a validade do que já
  está na prateleira e guarda no lote. O dono: vê a margem; Entrada com "Lançar a compra como despesa" desmarcado, que marcado pede a
  forma antes de anotar (nada grava sem ela) e com o Pix grava as duas, a próxima entrada desmarcada; Venda no balcão com a lista
  demorando 2,5 s: três códigos lidos antes entram na conta (R$ 198,90) e "Código não encontrado: …"; orçamento que virou venda com
  o horário fechado sem marcar: "Falta marcar", R$ 320,90 e Marcar o horário; crédito à vista virando 3x na edição (taxa do 3x);
  Quanto sobrou com as contas fixas ainda não pagas. Capturas em testes/saida/camila-*.png.
- `contas-fixas.js`: Financeiro, Contas fixas, em 390 e 1366: cadastrar pelo modelo (Aluguel; Luz com "Muda todo mês"),
  "Quanto custa manter o pet shop" com a soma das contas (2.500, depois 2.880; sem custo do que vende, o mínimo a faturar), a conta do mês em A pagar como "conta fixa"
  (a luz com "valor estimado: confira a conta"), Paguei (Pix, hoje) tira de A pagar; Relatórios, Quanto sobrou com "Contas fixas
  R$ 2.880,00" e cada conta embaixo; Hoje abre sem erro. Sem rolagem lateral e sem erro na página; capturas em
  `testes/saida/contas-fixas-*.png`.
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
- `convite-conferir.js`: convite depois do teste de 17/11, em 390 e 1366: "Reenviar" com o link valendo pergunta antes ("Manter o
  link atual" não troca nada); o link de antes mostra "Este link foi trocado por um mais novo" (criar conta e entrar, sem formulário);
  o link que vale mostra o nome do pet shop; outro e-mail avisa e não cria a conta; o dono conectado vê "Você está conectado como".
- `cookies-termos.js`: aviso de cookies só onde o Pixel carrega (não em cadastro, entrada, Termos e Política do Gestão), com Aceitar e
  Recusar; recusar guarda a escolha, apaga o `_fbp`, não baixa o fbevents.js e não mostra o aviso de novo; a política do site (parte 5)
  mostra e muda a escolha; Política e Termos 2.3 (e-mail de privacidade uma vez, "responsável pela marca", cópias, troca de plano).
- `convite.js`: convite da equipe pelo link com código (migração 20261209), em 390: na Equipe, convite antigo sem código aparece com
  "Mande o convite de novo"; "Mandar de novo" mostra o texto com `criar-conta?email=…&convite=<código>` (7 dias, uma vez), o mesmo no
  WhatsApp, o hash no banco, e o cartão passa a mostrar "link vale até dd/mm"; a pessoa abre o link, cria a conta e cai direto no
  pet shop; quem já tem conta abre `entrar?convite=…`, entra e fica na equipe; o mesmo link com outra conta mostra "O convite não
  entrou" e não liga nada.
- `guia-recarregar.js`: começo guiado com a página recarregando (Neide, Bia, Juliana). 390: pergunta 1 com nome e WhatsApp, recarrega,
  continua; pergunta 2 explica "Pacotes e planos" e o marcado continua. 390 e 1366: horário Ter a sáb 8h às 18h com almoço, recarrega:
  "Continuei de onde você parou", almoço marcado, frase simples do sábado, Continuar grava o almoço; Kátia + "Mais", recarrega: Kátia
  uma vez, "Kátia já está na lista", e com ela já gravada antes, Continuar não grava outra (3 pets por horário, como marcado). 390: foto
  da tabela de preços muda o Banho M de 60,00 para 55,00 no campo na hora. Creche só: sábado inteiro e "Ligar o meu link" no fim.
- `primeiro-acesso.js`: dono novo do zero (criar conta, duas perguntas, "Começar já") até o primeiro resultado: no fim do guia
  "Pronto em X minutos", "Marcar o primeiro horário" (botão principal) e "Copiar o link do cliente"; o link copiado em 7
  toques e 4 campos; o primeiro horário (pet novo cadastrado na própria folha) em até 13 toques e 7 campos, com "Pronto em X
  minutos" no aviso do marcado (antes da mudança: 19 toques e 9 campos). 390 até o horário, 1366 até o link.
- `fotos-redes.js`: a página do boletim em 390 ("Pode postar a foto do Thor…", nada marcado, prévia com o @ = texto guardado,
  "Pode postar desde", "Não quero mais" com confirmação); a ficha e o álbum em 1366 ("Pode postar ✓ (desde dd/mm)", depois
  "Sem autorização"); o Bom dia do dono (quem deve) e do tosador (sem valor), "Perguntar ao Mozart", "Dispensar por hoje" que não volta.
- `checkout-lento.js`: check-out do hotel com a leitura do sinal atrasada 2,5 s (390 e 1366): enquanto carrega, a folha não mostra valor
  e o botão fica apagado (clicar não grava); depois, "Receber R$ 2,75" (110 − sinal 107,25) e "Receber R$ 1,60" (80 − 20% do segundo
  pet − sinal 62,40), uma entrada só cada.
- `rede-lenta.js`: internet fraca (estreante, 3ª rodada). Com o JavaScript desligado em 360, o link do cliente já mostra o nome do pet
  shop, o recado, os serviços com preço, as cores (Vinho) e o título "Agendar: …"; a página do pedido mostra "Tutora, seu pedido chegou."
  com o pet e a situação; pedido que não existe e link errado com a mensagem de sempre. O HTML do link não traz a biblioteca do Supabase
  nem dado do tutor. 390 e 1366: o pedido vai até "Pedido enviado" e o Atualizar da página do pedido funciona, sem erro de hidratação.
  A abertura do aplicativo diz "Abrindo <pet shop>…" com os pacotes de JavaScript bloqueados. A Hoje (390 e 1366) não baixa outra tela
  antes de aparecer com os dados, e depois volta a adiantar. No fim, uma medida informativa com 400 kbps, 400 ms e CPU 4x.
- `agenda-lenta.js`: ficha do horário com a leitura dos pacotes e do que já foi pago atrasada 2,5 s (390 e 1366): enquanto carrega,
  nenhum botão de cobrar, concluir ou usar o pacote (só "Carregando a conta"; Cliente confirmou continua); depois, o pacote primeiro,
  o aviso do que o tutor deve de antes e "Cobrar à parte, sem usar o pacote · R$ 50,00". Com a leitura falhando: nada de cobrar,
  só "Tentar de novo", que traz a conta inteira.
- `importar-rascunho.js`: 390: .xlsx de 10 linhas pela tela (9 para trazer), Trazer e sair da tela na hora: entram 8 tutores e 9 pets;
  1366 (outro aparelho): a última importação diz "8 tutores novos e 9 pets novos" com separados e alertas, e desfaz. Caderno: a leitura
  fica no banco assim que chega; corrige a Marta, recarrega, "Você tem uma leitura que ainda não foi salva" → Continuar a revisão (com a
  correção, sem contar outra página) → Salvar apaga o rascunho; dívida de tutor novo da mesma leitura diz "Cliente novo, desta leitura";
  Descartar apaga. 1366: o aviso com Continuar e Descartar, sem rolagem para o lado.
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
- `mozart-v2.js` (servidor com GESTAO_MOZART_FALSO=1): "Pensando…" logo depois de mandar; recarregar no meio da resposta traz a parte que chegou marcada "Resposta interrompida" e "Perguntar de novo" traz a resposta inteira (390 e 1366).
- `operacao-estoque.js` (servidor com GESTAO_MOZART_FALSO=1), em 390 e 1366: o Mozart vende 2 mordedores (cartão, um lançamento ligado à saída, o Estoque conta a venda) e cadastra e vende a ração; no Caixa, Entrada em Venda de produtos escrita à mão mostra o aviso ("Mordedor de plástico está no Estoque" / "Este item não está no Estoque"), sem travar o Lançar, e "Escolher o produto do Estoque" abre a Venda no balcão; Creche e hotel: a reserva de hoje que passou da hora aparece "atrasada · não chegou", primeiro, com o Check-in, e o número Reservas diz "1 atrasada · não chegou"; Primeiros passos: com 1 de N serviços com preço, o passo dos preços não fica feito e diz "1 de N com preço".
- `mozart-cadastros.js` (servidor com GESTAO_MOZART_FALSO=1): a tabela de preços em quatro cartões com "Confirmar tudo (4)" (cabe
  no painel em 390 e 1366), um toque grava os quatro e os preços ficam no banco.
- `mozart-consertos.js` (servidor com GESTAO_MOZART_FALSO=1): negrito e lista na bolha; recarregar traz a conversa e o cartão
  pendente (o painel abre sozinho) e confirmar grava uma vez; recarregar no meio do "Pode fazer" termina sozinho, sem gravar duas
  vezes; "Ouvir esta resposta" sem voz no aparelho mostra o aviso; com o Tirar dúvida aberto no celular, o fim da página sobe acima
  da folha; loja só de creche não sugere banho. 390 e 1366.
- `mozart-stream.js`: o Mozart respondendo aos poucos (o fetch da página vira um roteiro em pedaços, no formato da rota: uma linha JSON
  por evento). 390 e 1366: o pedido vai com `Accept: application/x-ndjson`; "Procurando Thor…" embaixo dos três pontinhos; o texto cresce
  na mesma bolha; o cartão continua pedindo "Pode fazer" (nenhuma decisão vai antes do toque); a resposta do "Pode fazer" também chega
  aos poucos; ler em voz alta fala frase por frase enquanto chega. 390: "Voz" com as vozes do Edge (só português, a natural primeiro,
  "Ouvir exemplo", a escolha guardada) e aparelho sem voz em português (dica de como instalar, sem alto-falante). No servidor de
  verdade: sem o Accept a rota responde JSON como antes. Capturas em `testes/saida/mozart-stream-*`.
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
- `lgpd-ajustes.js`: revisão jurídica pela tela, em 390 e 1366. **Meta Pixel**: na capa `/gestao` a fila do fbq tem
  `set autoConfig false` antes do `init`; "Teste grátis" e "Entrar" são links comuns (página inteira): em criar conta e entrar não há
  fbq nem script do Pixel e nenhum pedido sai para o Facebook, nem digitando o e-mail (os pedidos para facebook.com/net são barrados e
  anotados); capa → Termos pelo menu (1366) manda `consent revoke` ao fbq que ficou; no aplicativo, sem fbq. **Login** pela tela grava um
  registro de acesso com o navegador (a abertura no mesmo dia não grava outro). **Opções de cobrança**: multa de 2% sem aviso, 10% com
  "Para clientes pessoa física, a multa por atraso costuma ser limitada a 2%..." e salva assim mesmo; só juros também avisa. **Link de
  agendamento**: o texto das dúvidas (inteligência artificial, podem errar) e "Seus dados vão só para <loja>, para responder ao seu
  pedido." em "Com quem a gente fala?"; sem rolagem para o lado. Capturas em `testes/saida/lgpd-ajustes-*.png`.
- `operacao.js`: rodada 9 (operação), em 390 e 1366. Hoje com o banco demorando (resposta de tempo esgotado em `gestao_hoje`): aparece
  "Demorou demais, tente de novo" com Tentar de novo, a leitura antiga de ~25 consultas não é disparada e a tela não diz "agenda livre";
  com a função inexistente, lê do jeito antigo. Painel do administrador: aviso no alto e, na aba Dados, "Rotinas automáticas" (faxina
  atrasada com o motivo; "em dia" depois de rodar bem) e a conta com a exclusão vencida há 4 dias marcada como atrasada.
- `lgpd-rodada9.js`: privacidade, rodada 9, pela tela, em 390 e 1366. Termos e Política na 2.4 (o que a IA recebe, sem nota
  fiscal, 48 horas, painel só com números, fornecedores, quem oferece sem marcador vazio); página Para o tutor; política do
  site com a Nina; aviso embaixo do campo da Nina; Meu pet shop com "Acessos da equipe Maestro Pet" e o aviso de privacidade
  pronto; dica nos campos de observação; "Baixar os meus dados" baixa o .zip; painel do administrador: a lista não mostra
  texto, "Abrir para suporte" pede o motivo e o dono vê a abertura; quem sai da equipe vê "Você saiu da equipe de…" e apaga o
  login. Capturas em `testes/saida/lgpd-rodada9-*.png`.
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

- `dinheiro-j.js`: rodada 8 (J) pela tela: venda no balcão paga com o crédito do tutor e o comprovante (WhatsApp e Imprimir); Contas de clientes com vencido / a vencer e o limite sem a mensalidade futura ("venceu em"); Relatórios › Produtos sem o que voltou (1366); a cópia completa com total cobrado, devolução, crédito dos tutores, lotes e "Entra no resultado".
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

**Trava do servidor (migração 20261228).** O Tirar dúvida do link, o chat da página de vendas e o IP do aceite da entrada
dependem de o banco conhecer o segredo do servidor (`GESTAO_SEGREDO_SERVIDOR`, 32+ caracteres; sem ela, o segredo é derivado
da `ANTHROPIC_API_KEY`). Como fica em produção:
1. com `SUPABASE_SERVICE_ROLE_KEY` na Vercel, o servidor grava a trava sozinho no primeiro pedido depois de publicar
   (`garantirTrava` em `src/lib/gestao/servidor.ts`) e regrava se a chave for trocada; ninguém precisa tocar em nada;
2. sem essa chave, vale o botão **Ligar a trava** do painel do administrador (aba Cakto);
3. enquanto nenhuma das duas coisas acontece, o banco aceita a contagem só até a data de carência (7 dias depois da migração,
   `config_interna.servidor_trava_carencia_ate`, mostrada no painel). Passou a data sem trava: o Tirar dúvida responde "fora do
   ar" e o chat de vendas responde o texto fixo com o WhatsApp, até a trava ser ligada. Com a trava ligada, segredo errado ou
   ausente é sempre recusado (quem chama a função direto com a chave pública não gasta a cota de ninguém).

**Tetos de gasto com IA por dia, somando todos os pet shops** (`config_interna`, número de até 6 dígitos; sem a linha vale o padrão):
`mozart_dia_geral` 8000 chamadas ao modelo · `ajuda_dia_geral` 3000 perguntas · `boletim_dia_geral` 1500 textos ·
`link_ia_dia_geral` 3000 perguntas · `vendas_limite_dia` 2000 mensagens · `caderno_dia_geral` 3000 páginas ·
`mozart_teste_dia` 60 e `ajuda_teste_dia` 40 pedidos por dia de um pet shop em teste grátis · `lojas_por_rede_dia` 10 pet shops
novos por rede por dia. Para mudar: `insert into config_interna (chave, valor) values ('mozart_dia_geral', '12000') on conflict
(chave) do update set valor = excluded.valor;`. O painel do administrador (aba Cakto) mostra o usado e o teto de cada canal no dia.
Além disso, ponha um limite mensal de gasto na chave da Anthropic (console da Anthropic): é a última barreira.

**Senha mínima.** As telas pedem 8 caracteres e `supabase/config.toml` (banco local) também. Em produção quem recusa a senha curta
é o Supabase Auth: mude no painel do Supabase, Authentication → Policies (ou Providers → Email) → Minimum password length = 8,
e ligue "Prevent use of leaked passwords" se o plano tiver. O projeto é dividido com o Escala CEO: vale para os dois.

**Cabeçalhos de segurança** (`next.config.ts`, `cabecalhosDeSeguranca`): valem em todas as páginas. A lista do que a página pode
carregar está em modo "só avisando" (`Content-Security-Policy-Report-Only`); os avisos caem em `/api/gestao/csp` e aparecem nos
logs da Vercel como `[csp] …`. Depois de alguns dias sem aviso legítimo, troque o nome do cabeçalho para `Content-Security-Policy`.
Script, imagem ou serviço novo de fora? Ponha o endereço na lista (o teste `telas/seguranca-rodada9.js` acusa aviso nas telas).

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

### Rodada 9 (N7): o link do tutor
- `banco/link-tutor.js`: migração 20261235 pela API: valor guardado por pet (42,41 e 76,41) igual ao que a conta cobra, quem lê `pedidos_vistos`, `pedidos_valores` sem leitura direta, estimativa do hotel e diárias da creche guardadas, `pedidos_aceitar_juntos` (os dois ou nenhum; segundo toque recusado), endereço no link e no pedido, `link_contato`, creche dentro do horário, hora que já passou hoje (só confere entre 07:20 e 19:30 no fuso da loja) e `link_pedido_pedir_horario`.
- `telas/link-tutor.js`: o link em 360x740 e 1366: valor por pet e total nos três lugares, endereço e mapa, prévia do link (Open Graph) do pet shop, voltar do celular, rascunho ao recarregar, link desligado com WhatsApp, dois toques = um pedido, Tirar dúvida fora de cima do preço, creche no horário, cartão "o cliente viu", Aceitar todos, mensagem com valor e endereço, .ics, outro horário, "Atendimento feito." e "Este link não abre mais". `FOTOS=1` guarda as capturas em `testes/saida/link-tutor-*.png`.

### Link com mais de um serviço no mesmo pedido (migração 20261239)
- `banco/link-varios-servicos.js`: Banho e tosa (90 min) + Hidratação (30) + Corte de unhas (15) pela API: `link_horarios` com `p_extras` conta os 135 min (último horário 17:30; dois pets com dois serviços, 16:00), lista com serviço de outra loja ou id inválido recusada, o pedido guarda `outros_servicos` e dura 135 min, o valor visto é a soma com a promoção só no principal (de 135,00 por 126,00, cada serviço guardado) igual à conta da página (`valorDosServicos`), outra data que não comporta os três recusada, aceitar vira UM horário com os outros serviços em `agendamento_servicos` (30,00 e 15,00) e a conta dá 126,00; dois pets (P e G) com o preço de cada porte; sem porte, faixa 95,00 a 135,00 e o porte respondido ao aceitar põe o preço em todos; pedido de um serviço só segue igual.
- `telas/link-varios-servicos.js`: em 390x844 e 1366x900: um toque marca (✓) e outro tira, a barra de baixo com "3 serviços", 2h15 e "a partir de R$ 120", o passo 2 com os três serviços e o último horário 17:30, o valor somado (R$ 135,00) com cada serviço, o "Pedido enviado" e a página do pedido com os três, a mensagem do WhatsApp; quem recebe vê os três serviços e "o cliente viu: R$ 135,00", e Aceitar cria um horário só. `FOTOS=1` guarda as capturas em `testes/saida/link-varios-*.png`.
