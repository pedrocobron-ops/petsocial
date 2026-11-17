# Termos de uso e Política de privacidade do Gestão: resumo para o dono

Versão 2.3 dos dois documentos, vigente desde 18/11/2026. Páginas: `/gestao/termos` e `/gestao/privacidade`
(código em `src/app/(gestao)/gestao/termos/page.tsx` e `.../privacidade/page.tsx`). O dono decidiu não passar por advogado
por enquanto; a 2.2 incorpora uma revisão detalhada feita com o Claude (veja "O que mudou na 2.2"). Nada aqui é parecer jurídico.

## O que mudou na 2.3

Depois do teste com cinco donos de pet shop (17/11/2026). As decisões do dono (pessoa física com CPF, empresa no futuro,
Supabase dividido com o Escala CEO, cláusula de operador) ficam como estavam; só o texto ficou mais claro e calmo.

- **Cópias de segurança (Termos 16 e 22, Política 11):** descreve só o que existe e dá para conferir no código: as cópias
  automáticas do Supabase "na frequência e pelo tempo do plano contratado" (o plano não foi conferido no painel do Supabase; ver
  pendências) e a cópia completa do painel do administrador (aba Dados, lembrete a cada 7 dias, sem senhas e sem fotos, baixada
  e guardada fora do fornecedor). Sem promessa de frequência, prazo de guarda ou restauração; "apagou por engano? fale com a gente,
  podemos tentar recuperar, sem garantia". A Ajuda responde o mesmo (tópico `copias` em `manual.ts`).
- **Mudar de plano ou de período (Termos 7):** cancelar na Cakto e assinar o novo; não deixar duas assinaturas ativas (o banco marca
  a compra nova como "conflito" e as duas cobram). O plano novo conta do pagamento (`cakto_aplicar`: `pago_ate` = o maior entre o
  que já havia e o pagamento + período); os meses que sobraram de um plano de 3 ou 6 meses não viram crédito nem são devolvidos,
  fora dos 7 dias de arrependimento. Nenhuma regra nova de reembolso.
- **Cookies (Política 10 e política do site, parte 5):** o aviso só aparece onde o Pixel carrega (fora de `/gestao/...`), com
  Aceitar e Recusar; recusar faz `fbq('consent', 'revoke')` e apaga o cookie `_fbp`. A frase "o cadastro abre numa página nova"
  (não era verdade) foi trocada pelo que acontece: mesma aba, pixel para de mandar, o cookie `_fbp` antigo não é usado.
- Texto: parte 1 diz em uma frase o que acontece se o serviço parar (60 dias de aviso, devolução do não usado, parte 21) e que a
  empresa futura assume com as mesmas condições; "Escola de Gestão" explicada na parte 19; parte 24 lembra que avisos que pedem ação
  também aparecem na tela; Política 1 "responsável pela marca"; Política 5 diz que quem usa só o Escala CEO não enxerga o Gestão
  (RLS por `meus_petshops()`); e-mail de privacidade aparece uma vez só (Política 13 e 17).

## O que mudou na 2.2

- Quem oferece é pessoa física (CPF); a parte 26 prevê a passagem do contrato para uma empresa (CNPJ), com aviso e direito de
  cancelar com devolução proporcional. O texto troca "dona da marca" por "responsável pela marca" enquanto não houver registro no INPI.
- Cadastro sem e-mail de confirmação: o usuário declara que o e-mail é dele; convites da equipe passam a usar link com código.
- Cláusula de operador (LGPD art. 39) na parte 10: instruções, sigilo, sub-operadores autorizados (lista na Política, aviso de 15 dias
  para fornecedor novo), aviso de incidente ao pet shop em até 2 dias úteis, ajuda com pedidos, eliminação no fim.
- Incidentes (Política, parte 14): dados da conta, nós avisamos ANPD e assinantes; dados do pet shop, avisamos o pet shop, que comunica.
- Prazos: registros de acesso 6 meses (Marco Civil) e conversas com o assistente 12 meses; "Apagar dados deste tutor" limpa também
  orçamentos e conversas.
- Parte 15: multa, juros, taxa de falta e fiado são regras do pet shop com consumidores; taxas da maquininha, lucro e indicadores são estimativas.
- Responsabilidade (parte 17): acesso com login e senha só não é nosso se não houver falha de segurança nossa.
- Política: Escala CEO no mesmo Supabase, Google Maps e link de avaliação, orçamento e acompanhamento de pedido, IP na autorização
  de fotos e no checklist, pixel fora do cadastro, transferência internacional com DPA e cláusulas-padrão da ANPD.

## Pendências para profissionais (quando der)

- **Contador:** imposto sobre o que recebe como pessoa física (carnê-leão/IRPF, ISS como autônomo, NFS-e), o que responder a
  clientes PJ que pedirem nota, quando abrir a empresa (CNAE, regime) e como passar a Cakto do CPF para o CNPJ.
- **Advogado (ao abrir o CNPJ ou crescer):** teto de responsabilidade e reclamações de terceiros em contrato de adesão; se MEIs e
  autônomos podem ser tratados como consumidores; DPAs e cláusulas-padrão com Supabase, Vercel e Anthropic; registro da marca no
  INPI; plano de resposta a incidentes (e uma planilha de registro de incidentes); separar Maestro Pet e Escala CEO.
- Conferir o plano do Supabase (cópias de segurança: frequência e por quantos dias ficam) e a "garantia" de 7 dias configurada no
  produto da Cakto. Se o plano tiver cópia diária com prazo conhecido, dá para escrever o número na parte 16 (versão nova).

## As principais proteções

1. **Relação entre empresas.** O serviço é para uso profissional (pet shops e autônomos do ramo), maiores de 18 anos; a relação
   é regida pelo Código Civil. Se o CDC se aplicar a alguém, os direitos dele ficam ressalvados (sem isso a cláusula cairia inteira).
2. **Dados dos clientes: o pet shop é o controlador**, nós somos operadores (LGPD). Base legal, aviso aos tutores, autorização
   para fotos e mensagens e atendimento aos pedidos dos tutores são do pet shop; nós ajudamos.
3. **Fotos e imagem.** Fotografar o pet, não pessoas; autorização do tutor antes de postar em redes sociais. O sistema oferece a
   autorização pelo boletim (migração 20261196, `fotos_autorizacoes`): nada vem marcado, o tutor escolhe "só as fotos deste boletim"
   ou "também as das próximas visitas" e, se quiser, o @ para marcar; o banco guarda o texto exato, dia e hora; só o tutor autoriza
   (a equipe não grava); "Não quero mais" tira todas as autorizações do pet a qualquer hora (o link vale para sempre). O sistema não
   posta nada: quem posta e responde pela postagem é o pet shop, que deve parar de postar e avaliar retirar o que já postou quando
   o tutor tira a autorização. Boletim e álbum: link de 60 dias; fotos ficam no álbum enquanto o pet existir.
4. **Inteligência artificial pode errar.** Mozart (com cartão de confirmação), leitura do caderno/carteirinha/tabela de preço (arquivos
   não ficam guardados), textos do boletim e dúvidas do link: a conferência é do usuário, nada é orientação veterinária, jurídica ou
   contábil, e o que é confirmado vale como feito pelo pet shop.
5. **WhatsApp.** O sistema não envia nada sozinho; quem envia, e responde por consentimento e spam, é o pet shop.
6. **Números não são contabilidade.** Caixa e relatórios são ferramentas; nota fiscal e impostos são do pet shop.
7. **Disponibilidade.** Melhor esforço, sem garantia de tempo no ar; o usuário deve baixar cópias e guardar os registros que a lei exige dele.
8. **Limite de responsabilidade.** Só danos diretos, teto = valor pago nos 12 meses anteriores; sem lucros cessantes e danos
   indiretos; ressalva de dolo/culpa grave e de direitos irrenunciáveis.
9. **Reclamações de terceiros.** O pet shop assume a defesa e os custos quando a reclamação vem do conteúdo, das mensagens, das fotos
   ou do atendimento dele.
10. **Uso proibido.** Ilegalidade, spam, se passar por outro, revenda, engenharia reversa, scraping, burlar limites de logins/IA/link;
    bem-estar animal e normas sanitárias são dever do pet shop. Suspensão com aviso quando possível; imediata em caso grave.
11. **Cobrança.** Cakto, recorrente, preço novo com 30 dias de aviso; sem fidelidade; reembolso integral em até 7 dias do primeiro
    pagamento (também nos planos de 3 e 6 meses); depois, sem devolução de período começado (salvo lei ou falha nossa).
12. **Sem pagamento.** Só consulta; depois de 180 dias só para consulta, a conta pode ser apagada com 30 dias de aviso por e-mail.
13. **Propriedade intelectual, sugestões, cessão do contrato, prova eletrônica e aceite registrado** (versão, data, IP e navegador).
14. **Mudanças.** Versão nova = aviso + tela de aceite obrigatória ao abrir o aplicativo (resumo do que mudou).
15. **Dados e exclusão (LGPD).** Termos parte 22 e Política partes 3, 11 e 13:
    - *Baixar todos os dados* (dono, Meu pet shop): .zip com uma planilha CSV por área (UTF-8 com BOM) e um README.txt; equipe sem senhas.
    - *Dados de um tutor* (dono, ficha do tutor): baixar os dados daquele cliente; *Apagar dados deste tutor* com o nome digitado:
      anonimiza (nome "Cliente removido", contato e observações apagados, pets sem nome/foto/saúde/boletins/autorizações), mantém
      os valores no financeiro sem o nome. Irreversível.
    - *Encerrar e apagar a conta* (só o titular, com o nome do pet shop digitado): 30 dias só para consulta, qualquer dono cancela;
      depois a faxina diária apaga o pet shop, os arquivos e os logins da equipe que não estão em outro pet shop. Não cancela a
      assinatura na Cakto. Fica o registro de que a conta foi apagada (nome, quem pediu, quando).
    - *Sair desta equipe*: quem não é o titular tira o próprio acesso.
    - Tudo isso fica no registro de pedidos de dados (`lgpd_registros`), sem dados de clientes.

## Como o aceite funciona

- Cadastro: caixa desmarcada com os dois links; a versão aceita vai nos dados do cadastro e um gatilho grava na tabela `aceites`.
- Versão nova: subir `versao`/`vigenteDesde` e reescrever `MUDANCAS` em `src/lib/gestao/documentos.ts`. Cada pessoa vê a tela
  "atualizamos as nossas regras" e só segue depois de aceitar.
- Painel do administrador, aba **Aceites**: contagem por versão, busca por e-mail e exportação em CSV.
- Migração: `supabase/migrations/20261197000000_gestao_aceites.sql` (só acrescenta).

## O que mudou na 2.1

- A 2.0 dizia que o sistema não pede nem guarda a autorização para postar fotos. O produto já tem essa função (boletim,
  "Pode postar a foto" e "Não quero mais"): os textos agora descrevem como ela funciona (Termos parte 11, Política partes 3, 7 e 11).
- Novas funções de dados (item 15 acima), com os prazos: 30 dias só para consulta antes de apagar a conta; fotos de tutor apagado
  saem na faxina diária; o registro de pedidos de dados fica depois de a conta ser apagada.
- Na migração `20261199000000_gestao_lgpd.sql`: `cliente_dados`, `cliente_anonimizar`, `conta_exclusao_*`, `equipe_sair`,
  `gestao_exclusoes_processar` (faxina), a cópia completa do administrador e o registro.

## O que falta preencher (aparece em amarelo nas páginas)

| Marcador | Onde preencher |
| --- | --- |
| [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO] | `src/lib/empresa.ts` (`razaoSocial`, `cnpj`, `endereco`) |
| [E-MAIL DE CONTATO] (privacidade e jurídico) | `src/lib/empresa.ts` (`emailJuridico`) |
| [NOME DO ENCARREGADO] (DPO) | `src/lib/empresa.ts` (`encarregado`) |
| [FORO] (comarca, ex. "Santos/SP") | `src/lib/empresa.ts` (`foro`) |

## Decisões de negócio (antigas; ver também as pendências acima)

- Reembolso de 7 dias para todos (inclusive planos de 3 e 6 meses) e nenhum reembolso depois; regras de reembolso da Cakto.
- 180 dias até apagar conta sem pagamento e 30 dias de aviso; 30 dias de aviso para reajuste; 60 dias para encerrar o serviço.
- Teto de responsabilidade em 12 meses de assinatura e a cláusula de reclamações de terceiros (validade em contrato de adesão,
  arts. 423 e 424 do Código Civil).
- Nota fiscal da própria assinatura (quem emite e como) e guarda dos registros de acesso por 6 meses (Marco Civil, art. 15):
  confirmar que os registros da hospedagem ficam guardados por esse prazo.
- Contratos de tratamento de dados (DPA) e cláusulas de transferência internacional com Supabase, Vercel e Anthropic.
- Conversas com o Mozart guardadas enquanto a conta existir: definir um prazo menor, se possível.
- Anonimização do tutor: confirmar que manter os valores sem o nome (e os horários sem observação) atende o pedido de exclusão e a
  guarda contábil; conversas com o Mozart que citam o tutor não são apagadas por ela.
- Prazo de 30 dias para apagar a conta e o que fica depois (registro do pedido, aceites, pagamentos da assinatura); se o e-mail de
  confirmação do pedido de exclusão é necessário (hoje a confirmação é só na tela).
- Autorização de fotos: se o texto montado pelo banco basta como consentimento (art. 7º, I e art. 8º da LGPD; direito de imagem),
  e o que o pet shop deve fazer com fotos já postadas quando o tutor tira a autorização.
