# preencher-imagens

Edge Function que preenche a imagem das matérias pendentes.

Roda na infraestrutura do Supabase, que tem saída para a internet. Existe porque
a busca de foto precisa alcançar o Wikimedia Commons, e o ambiente onde a
redação automática roda tem política de rede que recusa esse host.

## Fila

`news_articles.cover_query` guarda o termo de busca em inglês escolhido pela
redação. Vale para dois casos:

- matéria que nunca teve capa;
- matéria cuja capa veio do aplicativo antigo, sem autor e sem licença.

As fotos de corpo saem das notas ao editor, que carregam o termo escolhido na
hora em que a matéria foi escrita.

Rascunho é processado antes de matéria publicada, porque é ele que trava a
aprovação.

## Licença

Só entra imagem de domínio público, CC0 ou CC BY, com crédito do autor montado
na legenda, que é o que a licença CC BY exige.

## Como chamar

    GET /functions/v1/preencher-imagens?key=<chave>

Trabalha até a fila zerar ou até o orçamento de tempo acabar, e devolve quantas
capas e fotos entraram, quantas matérias restam e quais não acharam candidata.
Basta chamar de novo enquanto `restantes` for maior que zero.

O agendador da Vercel chama diariamente via `/api/cron-imagens`, às 8h15 de
Brasília, depois que a rotina das 7h termina de escrever.

A fonte de verdade do código é o deploy no Supabase; esta pasta guarda a cópia
versionada.
