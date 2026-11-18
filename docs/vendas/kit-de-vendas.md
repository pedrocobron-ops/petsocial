# Kit de vendas — Maestro Pet Gestão

Para quem vai apresentar o sistema a donas e donos de pet shop pequeno: banho e tosa, creche, hotel e loja.
Tudo aqui foi conferido com o manual do sistema (`src/lib/gestao/manual.ts`) e com os preços do código
(`src/lib/gestao/planos.ts`). Se o sistema mudar, atualize este arquivo, a página `/gestao` e os Fatos da Nina
(`src/lib/gestao/vendas.ts`) juntos.

**Regras que valem para tudo o que sair daqui (site, post, mensagem, conversa):**

- Não prometer resultado: nada de "fature mais", "dobre os clientes", "nunca mais perca dinheiro".
- Não usar depoimento, número de clientes, estatística ou "x% dos pet shops". Não temos esses dados.
- Sem urgência falsa: nada de "só hoje", "últimas vagas", contador, preço riscado.
- Não dizer o que o sistema não faz: **não emite nota fiscal (nem NF-e, nem NFS-e, nem cupom)**, **não envia WhatsApp
  sozinho e não tem integração com a API do WhatsApp**, **não tem aplicativo na loja** (nem para o pet shop, nem para o tutor),
  não recebe pagamento pela internet, não avisa a hora do remédio, não é para clínica veterinária.
- Não citar outro sistema pelo nome, não comparar, não dizer "único", "o melhor", "ninguém mais tem".
- Português simples, frases curtas, "você".

---

## a) Posicionamento (um parágrafo)

O Maestro Pet Gestão é o sistema para o pet shop pequeno que faz banho e tosa, creche, hotel ou loja — uma coisa só ou
todas — e quer organizar o dia pelo celular, sem pagar à parte por cada função. Todas as funções estão em todos os planos,
desde R$ 79 por mês; o plano muda só pelo número de pessoas que entram. O tutor não precisa instalar nada: recebe o boletim
do pet com fotos, o link de agendamento e as mensagens pelo WhatsApp do próprio pet shop, sem custo por mensagem cobrado por
nós. Quem está saindo do caderno ou de outro sistema traz os clientes por foto, print ou PDF e confere tudo antes de salvar.
E quem está com a mão no banho fala com o Mozart, o assistente de dentro do sistema, que prepara e espera a confirmação.

---

## b) Diferenciais

Cada um com: **o que é**, **por que importa para a dona do pet shop** e **como mostrar em 30 segundos**.

### 1. Boletim do pet pelo link (novo)

- **O que é:** depois do banho, do dia de creche ou de um dia de hotel, a equipe toca em **Mandar boletim**, põe até 4 fotos,
  toca em como foi (Comportado, Perfume, Lacinho, Comeu tudo…) e, se quiser, toca em **Escrever com o Mozart** para o texto
  sair caprichado. Se viu uma pulga ou a orelha vermelha, marca **Atenção à saúde**: aparece num quadro à parte, "Para você
  ficar de olho". A página mostra o que foi feito, o botão **Marcar o próximo** e, se o dono configurar, **Avaliar no Google**.
  O valor só aparece se o dono ligar (e só no banho e tosa). As fotos ficam no **Álbum** do pet, na ficha. O link vale 60 dias.
- **Por que importa:** o tutor vê o cuidado que teve com o pet dele, num lugar só, sem instalar aplicativo. O recado de saúde
  sai registrado e com tom cuidadoso. O botão do Google aparece para todos os clientes, sem pergunta antes (é a regra do Google).
- **Como mostrar em 30 s:** Agenda → toque num horário concluído → **Mandar boletim** → tire uma foto de qualquer coisa
  (um bichinho de pelúcia serve) → toque em **Comportado** e **Perfume** → **Escrever com o Mozart** → **Salvar boletim** →
  abra o link no seu celular e mostre a página. Diga: "É isso que o seu cliente recebe. Ele abre no WhatsApp, sem baixar nada."

### 2. Trazer do caderno ou do outro sistema (novo)

- **O que é:** em **Clientes e pets → Foto do caderno**, a pessoa escolhe o que tem na página (Clientes e pets, Quem me deve,
  Agenda, Tabela de preços ou Não sei, descubra), fotografa uma página por vez ou manda prints e o PDF do sistema antigo. O
  sistema lê e mostra uma tela de conferência: dá para corrigir, desmarcar, **Juntar** com quem **Já existe** e olhar o que
  ficou em **Verificar**. Nada é salvo antes do botão **Salvar**. Na ficha do pet, lê a carteirinha de vacinação.
- **Por que importa:** o maior medo de trocar de sistema é digitar tudo de novo. Aqui a dona fotografa e confere. A dívida do
  caderno vira conta a receber com o dia em que começou, e o dinheiro só entra no caixa quando o cliente pagar. O que não deu
  para ler fica em branco: nada é inventado. As fotos não ficam guardadas. Limite de 30 páginas lidas por dia.
- **Como mostrar em 30 s:** Clientes e pets → **Foto do caderno** → **Clientes e pets** → fotografe uma página escrita à mão →
  **Ler** → mostre as linhas, uma marcada como **Já existe** e outra como **Verificar** → desmarque uma → **Salvar**. Diga:
  "Você confere linha por linha antes de entrar. Se a letra estiver difícil, ele avisa em vez de inventar."

### 3. Falar em vez de digitar (novo)

- **O que é:** no Mozart, toque no microfone e fale o pedido ("marca banho do Thor amanhã às dez e meia"). O texto aparece na
  caixa e dá para corrigir. Dá para segurar o microfone enquanto fala. Nos campos de observação (ficha do pet e do tutor,
  horário, estadia, plano da creche, diário, ocorrências) tem um microfone pequeno. O Mozart pode ler as respostas em voz alta.
  Usa o ditado do próprio navegador (Chrome, Edge, Safari).
- **Por que importa:** quem dá banho está com a mão molhada. Falar é mais rápido que digitar no celular, e nada é gravado sem
  confirmar.
- **Como mostrar em 30 s:** abra o Mozart → toque no microfone → fale "marca banho do Thor amanhã às dez e meia" → mostre o
  cartão com o pet, o dia e o valor → **Pode fazer**. Depois abra a ficha de um pet → microfone pequeno em Observações → fale
  "tem medo do secador" → **Salvar**.

### 4. Mozart, o assistente que faz as coisas no sistema

- **O que é:** pedido por texto ou voz; ele prepara e mostra um **cartão de confirmação** antes de gravar. Marca horário, faz
  check-in e check-out, dá entrada no estoque, anota dívida, recebe o que o cliente devia, responde sobre o caixa e prepara
  mensagens de WhatsApp. Vem em todos os planos. Tem um limite de pedidos por dia, igual para todos.
- **Por que importa:** a dona pede do jeito que fala, sem procurar tela. E nada entra sem ela ver.
- **Como mostrar em 30 s:** "Quanto entrou essa semana?" → resposta por forma de pagamento. Depois: "Entrou dez sacos de
  ração a cento e quarenta" → cartão → confirmar.

### 5. Banho e tosa, creche, hotel e loja num sistema só

- **O que é:** todas as funções em todos os planos. Na primeira vez, a dona marca o que faz, e o menu mostra só isso.
  Creche com plano por dia da semana, chamada e cobranças do mês juntas por tutor. Hotel com diária por porte, temporada e
  feriado, sinal e calendário de ocupação. Loja com estoque, código de barras e margem.
- **Por que importa:** não precisa de um sistema para cada coisa nem pagar à parte para ligar uma área nova.
- **Como mostrar em 30 s:** Meu pet shop → **O que você usa** → ligue Hotel → o menu ganha Creche e hotel na hora.

### 6. Link de agendamento com "Tirar dúvida"

- **O que é:** o cliente pede banho, dia de creche ou reserva de hotel pelo link; você aceita ou recusa com um toque. Se o dono
  ligar, o botão **Tirar dúvida** responde perguntas com o que o link já mostra (horário, serviços, preços que aparecem) e,
  quando não sabe, manda para o WhatsApp do pet shop. As respostas não marcam nada.
- **Por que importa:** menos "tem horário?" no WhatsApp. O cliente só vê horários livres, nunca a agenda nem outros clientes.
- **Como mostrar em 30 s:** abra o link do pet shop no celular → escolha banho → dia → hora → enviar. Volte ao sistema: o
  pedido está na tela Hoje para aceitar.

### 7. Dinheiro certo: sem cobrança em dobro, comissão linha por linha, caixa conferido

- **O que é:** toque duplo no botão não lança o mesmo valor duas vezes. Caixa do dia com abertura, entradas, saídas e
  fechamento conferido com a gaveta. Comissão por pessoa, por serviço e sobre produtos, com **Linha por linha** para conferir
  cada atendimento. Quem não cuida do dinheiro não vê valores. Trava de preço opcional e histórico de quem mudou um valor.
- **Por que importa:** quando tem equipe, a dona sabe quem fez o quê, e a comissão dá para conferir antes de pagar.
- **Como mostrar em 30 s:** Relatórios → Comissão por profissional → **Linha por linha**. Depois Financeiro → Alterações.

### 8. WhatsApp do próprio pet shop, sem custo por mensagem

- **O que é:** lembrete, pet pronto, boletim, cobrança da creche, comprovante, confirmação de pedido: a mensagem sai pronta e
  abre o WhatsApp do pet shop. A pessoa aperta enviar. **Não há envio automático nem integração com a API do WhatsApp.**
- **Por que importa:** a mensagem sai do número que o tutor já conhece, e não existe cobrança por mensagem da nossa parte.
- **Como mostrar em 30 s:** Hoje → Pede a sua atenção → lembretes de amanhã → toque num → o WhatsApp abre com o texto.

### 9. O tutor não instala nada

- **O que é:** boletim, álbum, link de agendamento e página do tutor abrem no navegador do celular, sem login. O pet shop
  também usa no navegador e pode pôr o ícone na tela inicial, sem loja de aplicativos.
- **Por que importa:** pedir para o cliente baixar aplicativo afasta. Link no WhatsApp todo mundo abre.
- **Como mostrar em 30 s:** mande o link do boletim para o celular da pessoa que está assistindo e peça para ela abrir.

---

## c) Roteiro de demonstração (5 minutos)

**Antes da demonstração (uma vez):**

1. Crie uma conta de teste em `/gestao/criar-conta` com um nome claramente de exemplo, como **"Banho & Cia (demonstração)"**.
   Marque banho e tosa, creche e hotel; área principal: banho e tosa.
2. Cadastre 3 serviços (Banho, Banho e tosa, Hidratação) com preço, uma pessoa da equipe e o link de agendamento ligado.
3. Escreva à mão, numa folha, 4 ou 5 clientes no estilo do caderno (nome, pet, telefone, um "deve 35,00"). Use nomes
   inventados. Deixe um telefone meio ilegível.
4. Deixe um horário de hoje concluído (pet "Thor", tutora "Ana") para o boletim.
5. Em Meu pet shop, cole um link de avaliação do Google de exemplo só se for o do próprio pet shop de demonstração; se não
   houver, pule o botão do Google na demo e apenas mencione.
6. Use um bichinho de pelúcia para as fotos. Nada de foto de pet ou pessoa de verdade.

Durante o teste de 7 dias a conta fica no plano maior. Se o teste acabar, a conta fica só para consulta.

**Na demonstração:**

| Tempo | O que clicar | O que dizer |
| --- | --- | --- |
| 0:00–0:30 | Abra a tela **Hoje** no celular. | "Esse é o dia do pet shop num lugar só: quem chega, a chamada da creche, o que precisa de atenção. Tudo no celular." Pergunte: "Hoje você controla como? Caderno, WhatsApp, outro sistema?" |
| 0:30–1:30 | **Clientes e pets → Foto do caderno → Clientes e pets → Tirar foto do caderno**. Fotografe a folha. **Ler**. | "Em vez de digitar o caderno inteiro, você tira foto. Olha: ele leu, e você confere cada linha. Esse aqui ele marcou para verificar porque a letra está difícil — ele não inventa." Desmarque uma linha, toque em **Salvar**. |
| 1:30–2:30 | Abra o **Mozart**, toque no **microfone**: "marca banho do Thor amanhã às dez e meia". **Pode fazer**. | "Com a mão molhada, você fala. Ele mostra o que vai fazer — pet, dia, valor — e só grava quando você confirma." |
| 2:30–3:45 | **Agenda** → horário do Thor concluído → **Mandar boletim** → foto do pelúcia → **Comportado**, **Perfume** → **Atenção à saúde**: "orelha um pouco vermelha" → **Escrever com o Mozart** → **Salvar boletim** → **Mandar no WhatsApp**. Abra o link no celular de quem assiste. | "É isso que o tutor recebe: fotos, recado, o que foi feito, e o aviso de saúde num quadro à parte. Ele abre pelo WhatsApp, sem instalar nada. A mensagem sai do seu número; quem aperta enviar é você." |
| 3:45–4:30 | **Relatórios → Comissão por profissional → Linha por linha**. Depois **Caixa**. | "Se tem equipe: a comissão você confere atendimento por atendimento. E quem não cuida do dinheiro nem vê valor." (Pule se a pessoa atende sozinha e mostre o link de agendamento.) |
| 4:30–5:00 | Volte para a página `/gestao`, seção **Planos e preços**. | "Todas as funções estão em todos os planos. Muda só quantas pessoas entram. Dá para testar 7 dias sem cartão. Quer começar com uma página do seu caderno?" |

Se perguntarem algo que você não sabe, diga que vai confirmar e mande depois. Não improvise função.

---

## d) Objeções comuns (respostas honestas)

**"Já uso outro sistema."**
"Faz sentido não querer trocar à toa. Se quiser comparar com calma, dá para testar 7 dias sem cartão. Para não ter que digitar
tudo de novo, você tira print ou exporta o PDF da lista de clientes do sistema que usa e manda em Foto do caderno: o Maestro
lê e você confere antes de salvar. Planilha também serve. Você decide depois de ver funcionando com os seus dados."

**"Não tem WhatsApp automático?"**
"Não tem, e prefiro ser direto: o sistema não envia sozinho e não tem integração com a API do WhatsApp. Ele deixa a mensagem
pronta — lembrete, boletim, cobrança — e abre o seu WhatsApp; você aperta enviar. A mensagem sai do seu número, que o cliente
já conhece, e não tem custo por mensagem da nossa parte."

**"Emite nota fiscal?"**
"Não. Hoje o Maestro Pet não emite nota fiscal nem cupom fiscal. O comprovante que ele monta para o WhatsApp não é documento
fiscal. Se você precisa emitir nota, continua usando o emissor que usa hoje."

**"É caro?"**
"O Solo, para quem trabalha sozinho, é R$ 79 por mês. Para até 3 pessoas, R$ 129; para até 6, R$ 179. Todos têm as mesmas
funções, inclusive o Mozart, creche e hotel. Pagando 3 ou 6 meses de uma vez sai mais barato. Não tem fidelidade, e você
testa 7 dias sem cartão antes de decidir."

**Cupom de desconto (só o vendedor oferece, na conversa).** O vendedor pode dar um cupom da Cakto para fechar a venda. Regras:
- Use só os cupons criados pela dona na Cakto, com o valor e a validade que ela definiu. Não invente cupom nem porcentagem.
- Diga o que o cupom é de verdade: "Consigo um cupom de X% para você assinar até [data]". A data tem que ser a validade real do
  cupom na Cakto.
- Não diga que o preço "vai subir", que "é a última vaga" ou que "é só hoje" se não for verdade. Não fale em "primeiros
  clientes".
- O cupom é digitado pelo cliente na tela de pagamento da Cakto, no campo de cupom.

**"Minha equipe não sabe usar."**
"Foi feito primeiro para o celular. Cada pessoa vê só as áreas que você libera, então a tela dela é menor. Quem não gosta de
digitar pode falar com o Mozart pelo microfone, e nada é gravado sem confirmar. Tem manual dentro do sistema, o botão 'Como
usar esta tela' no alto e suporte pelo WhatsApp. No teste de 7 dias a equipe toda pode entrar para experimentar."

Outras que aparecem:

- **"Meu cliente vai ter que baixar aplicativo?"** — "Não. Boletim, link de agendamento e página do tutor abrem pelo link."
- **"E se a leitura do caderno errar?"** — "Pode errar, principalmente letra difícil. Por isso você confere tudo antes de salvar,
  e o que ele não conseguiu ler fica em branco."
- **"Recebe pagamento pelo link?"** — "Não. O cliente paga a você, como hoje, e você anota."

---

## e) Conteúdo para prospecção

### 6 posts curtos para Instagram

Use o desenho do boletim (seção Novidades da página) ou prints da conta de demonstração. Sem foto de cliente real.

**Post 1 — Boletim do pet**
> Terminou o banho? Em poucos toques sai o boletim do pet: fotos, o recado da equipe e o que foi feito.
> O tutor abre pelo link no WhatsApp, sem instalar nada.
> Maestro Pet Gestão. Teste 7 dias grátis, sem cartão. Link na bio.

**Post 2 — Atenção à saúde**
> Viu uma pulga ou a orelha vermelha durante o banho?
> No boletim do pet isso vai num quadro à parte: "Para você ficar de olho".
> O tutor fica sabendo do jeito certo, por escrito.
> Maestro Pet Gestão. Link na bio.

**Post 3 — Caderno**
> Tem tudo num caderno e dá preguiça de passar para o sistema?
> Tire foto da página. O Maestro Pet lê clientes, pets, quem te deve e a agenda, e você confere linha por linha antes de salvar.
> O que ele não consegue ler, fica em branco. Nada é inventado.
> 7 dias grátis, sem cartão.

**Post 4 — Voz**
> Mão molhada do banho? Fala.
> "Marca banho do Thor amanhã às dez e meia."
> O Mozart mostra o que vai fazer e espera você confirmar.
> Vem em todos os planos do Maestro Pet Gestão.

**Post 5 — Tudo num plano**
> Banho e tosa, creche, hotel e loja no mesmo sistema.
> Todas as funções em todos os planos, desde R$ 79 por mês. Você escolhe o plano só pelo número de pessoas que entram.
> Sem fidelidade. 7 dias grátis, sem cartão.

**Post 6 — WhatsApp do seu número**
> Lembrete, aviso de pet pronto, boletim, cobrança da creche: a mensagem sai pronta e abre o seu WhatsApp.
> Você aperta enviar, do seu número, que o cliente já conhece.
> O Maestro Pet não envia sozinho e não cobra por mensagem.

### 4 mensagens de WhatsApp para prospecção

Mande só para quem você já conhece ou que deu o contato. Uma mensagem, sem insistir. Troque [Nome] e [Pet shop].

**Mensagem 1 — Primeiro contato (banho e tosa)**
> Oi, [Nome], tudo bem? Aqui é [seu nome], do Maestro Pet. A gente fez um sistema para pet shop pequeno que roda no celular.
> Uma coisa que talvez te interesse: depois do banho, você manda ao tutor um boletim com as fotos e o recado, por link, sem ele
> instalar nada. Posso te mandar um exemplo?

**Mensagem 2 — Quem usa caderno**
> Oi, [Nome]! Você ainda anota os clientes e o fiado no caderno? No Maestro Pet Gestão dá para tirar foto da página: ele lê e
> você confere tudo antes de salvar. Dá para testar 7 dias sem cartão. Se quiser, te mostro em 5 minutos por vídeo.

**Mensagem 3 — Creche ou hotel**
> Oi, [Nome]! Vi que a [Pet shop] tem creche/hotel. O Maestro Pet Gestão tem plano da creche por dia da semana, chamada com um
> toque e as cobranças do mês juntas por tutor, e no hotel a diária por porte e temporada. Tudo no mesmo plano do banho e tosa.
> Quer que eu te mande o link para conhecer?

**Mensagem 4 — Retorno depois de mostrar**
> Oi, [Nome], obrigado pelo tempo ontem. Ficou alguma dúvida? Só para lembrar com franqueza: o sistema não emite nota fiscal e
> não envia WhatsApp sozinho, ele deixa a mensagem pronta para você. Se fizer sentido, o teste é 7 dias sem cartão:
> maestropet.com/gestao

---

## f) Checklist do que ainda depende da dona do Maestro Pet

- [ ] **Preços confirmados.** O código (`src/lib/gestao/planos.ts`) tem hoje:
      Solo (1 pessoa) R$ 79/mês, R$ 215 a cada 3 meses, R$ 399 a cada 6 meses;
      Equipe (até 3) R$ 129/mês, R$ 349 a cada 3 meses, R$ 659 a cada 6 meses;
      Pet shop (até 6) R$ 179/mês, R$ 479 a cada 3 meses, R$ 909 a cada 6 meses.
      Se algum valor mudar, mudar no código (a página e a Nina leem dali) e neste kit.
- [ ] **Checkout da Cakto pendente.** Criar o produto de assinatura e as ofertas (mensal, 3 e 6 meses de cada plano), colar os
      links no painel do administrador (aba Cakto) ou nas variáveis `NEXT_PUBLIC_GESTAO_CHECKOUT_*`, ligar cada oferta ao plano
      em `config_interna` e criar o webhook para `/api/gestao/cakto` (passo a passo no `README.md`). Sem link, o botão de assinar
      aparece como "em breve".
- [ ] **Chave da IA em produção** (`ANTHROPIC_API_KEY` na Vercel) para o Mozart, o boletim ("Escrever com o Mozart"), a leitura
      do caderno, a Nina e o "Tirar dúvida" do link. Sem ela, essas partes avisam e o resto funciona.
- [ ] **Conta de demonstração** criada e preparada (seção c), com nome de exemplo e sem dado de cliente real.
- [ ] **Número do suporte** no WhatsApp conferido (`src/lib/gestao/contato.ts`, hoje (13) 99137-6169).
- [ ] **Aprovar os textos** de posts e mensagens antes de publicar, e definir quem responde os contatos.
- [ ] **Material visual** para os posts: prints da conta de demonstração ou o desenho do boletim da página. Nada de foto de
      pet ou pessoa sem autorização.
- [ ] **Nota fiscal**: decidir se e quando entra. Até lá, a resposta é "não emite".
- [ ] **Termos e privacidade** revistos com o boletim (fotos de pets no link de 60 dias) e a leitura do caderno (as fotos não
      ficam guardadas).
