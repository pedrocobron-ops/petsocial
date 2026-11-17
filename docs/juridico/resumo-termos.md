# Termos de uso e Política de privacidade do Gestão: resumo para o dono

Versão 2.0 dos dois documentos, vigente desde 17/11/2026. Páginas: `/gestao/termos` e `/gestao/privacidade`
(código em `src/app/(gestao)/gestao/termos/page.tsx` e `.../privacidade/page.tsx`). **Rascunho: precisa da revisão de um
advogado brasileiro antes de valer.** Nada aqui é parecer jurídico.

## As principais proteções

1. **Relação entre empresas.** O serviço é para uso profissional (pet shops e autônomos do ramo), maiores de 18 anos; a relação
   é regida pelo Código Civil. Se o CDC se aplicar a alguém, os direitos dele ficam ressalvados (sem isso a cláusula cairia inteira).
2. **Dados dos clientes: o pet shop é o controlador**, nós somos operadores (LGPD). Base legal, aviso aos tutores, autorização
   para fotos e mensagens e atendimento aos pedidos dos tutores são do pet shop; nós ajudamos.
3. **Fotos e imagem.** Fotografar o pet, não pessoas; autorização do tutor antes de postar em redes sociais é do pet shop (o
   sistema não pede nem guarda essa autorização). Boletim e álbum: link de 60 dias; fotos ficam no álbum enquanto o pet existir.
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

## Como o aceite funciona

- Cadastro: caixa desmarcada com os dois links; a versão aceita vai nos dados do cadastro e um gatilho grava na tabela `aceites`.
- Versão nova: subir `versao`/`vigenteDesde` e reescrever `MUDANCAS` em `src/lib/gestao/documentos.ts`. Cada pessoa vê a tela
  "atualizamos as nossas regras" e só segue depois de aceitar.
- Painel do administrador, aba **Aceites**: contagem por versão, busca por e-mail e exportação em CSV.
- Migração: `supabase/migrations/20261197000000_gestao_aceites.sql` (só acrescenta).

## O que falta preencher (aparece em amarelo nas páginas)

| Marcador | Onde preencher |
| --- | --- |
| [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO] | `src/lib/empresa.ts` (`razaoSocial`, `cnpj`, `endereco`) |
| [E-MAIL DE CONTATO] (privacidade e jurídico) | `src/lib/empresa.ts` (`emailJuridico`) |
| [NOME DO ENCARREGADO] (DPO) | `src/lib/empresa.ts` (`encarregado`) |
| [FORO] (comarca, ex. "Santos/SP") | `src/lib/empresa.ts` (`foro`) |
| [PROVEDOR DE E-MAIL] (quem envia os e-mails de login) | texto em `privacidade/page.tsx`, parte 5 |

## Decisões de negócio para confirmar com o advogado

- Reembolso de 7 dias para todos (inclusive planos de 3 e 6 meses) e nenhum reembolso depois; regras de reembolso da Cakto.
- 180 dias até apagar conta sem pagamento e 30 dias de aviso; 30 dias de aviso para reajuste; 60 dias para encerrar o serviço.
- Teto de responsabilidade em 12 meses de assinatura e a cláusula de reclamações de terceiros (validade em contrato de adesão,
  arts. 423 e 424 do Código Civil).
- Nota fiscal da própria assinatura (quem emite e como) e guarda dos registros de acesso por 6 meses (Marco Civil, art. 15):
  confirmar que os registros da hospedagem ficam guardados por esse prazo.
- Contratos de tratamento de dados (DPA) e cláusulas de transferência internacional com Supabase, Vercel e Anthropic.
- Conversas com o Mozart guardadas enquanto a conta existir: definir um prazo menor, se possível.
