// Mensagem escrita enquanto o Mozart ainda responde (achado da Neide): depois de um "Pode fazer", o Enter não enviava e o texto
// ficava parado na caixa, sem aviso. Agora a mensagem entra na conversa com "Na fila" e vai sozinha quando ele termina; se a
// resposta trouxer um cartão para confirmar, a mensagem volta para a caixa com um aviso (nada é descartado sem a pessoa ver).
// O servidor do Mozart é trocado por um roteiro fixo e lento (page.route): só a tela é testada. 390 px.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('mozart-fila');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart fila', equipe: false, dados: false });
  const { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app');

  const pedidos = [];
  const cartao = (id, titulo) => ({ id, ferramenta: 'marcar_horario', resumo: { titulo, linhas: [['Pet', titulo.split(' ').pop()]] } });
  // roteiro: 1) pedido → cartão; 2) Pode fazer → "Pronto"; 3) a mensagem da fila → outro cartão
  const respostas = [
    { espera: 1200, r: { texto: 'Confere?', propostas: [cartao('p1', 'Marcar banho do Thor')] } },
    { espera: 3000, r: { texto: 'Pronto, marquei o banho do Thor.', propostas: [] } },
    { espera: 3000, r: { texto: 'Confere?', propostas: [cartao('p2', 'Marcar banho da Mel')] } },
  ];
  await page.route('**/api/gestao/assistente', async (r) => {
    const corpo = r.request().postDataJSON();
    const n = pedidos.push(corpo) - 1;
    const passo = respostas[Math.min(n, respostas.length - 1)];
    await new Promise((ok) => setTimeout(ok, passo.espera));
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensagens: [], parciais: [], links: [], mudou: false, ...passo.r }) }).catch(() => {});
  });

  await page.locator('button', { hasText: 'Falar com o Mozart' }).first().click();
  const painel = page.locator('.g-ass-painel');
  await painel.waitFor({ timeout: 10000 });
  const caixa = painel.locator('textarea');
  await caixa.fill('marca banho do Thor amanhã às 10');
  await caixa.press('Enter');
  await painel.locator('button', { hasText: 'Pode fazer' }).waitFor({ timeout: 10000 });

  T.secao('escrevendo enquanto o Mozart faz o "Pode fazer"');
  await painel.locator('button', { hasText: 'Pode fazer' }).click();
  await page.waitForTimeout(300);
  await caixa.fill('e a Mel também');
  await caixa.press('Enter');
  await page.waitForTimeout(300);
  const fila = painel.locator('.g-ass-fila');
  const naFila = (await fila.innerText().catch(() => '')).replace(/ /g, ' ');
  await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-fila-390.png` }).catch(() => {});
  T.ok('o Enter não some com a mensagem: ela aparece na conversa com "Na fila"', /e a Mel também/.test(naFila) && /Na fila/.test(naFila), naFila);
  T.ok('a caixa de texto fica livre', (await caixa.inputValue()) === '');
  T.ok('nada foi mandado ainda (só o pedido e o Pode fazer)', pedidos.length === 2, pedidos.map((p) => p.texto ?? 'decisões'));
  await page.waitForFunction(() => !document.querySelector('.g-ass-fila'), null, { timeout: 10000 });
  await page.waitForTimeout(400);
  T.ok('quando o Mozart termina, a mensagem da fila vai sozinha (uma vez)', pedidos.length === 3 && pedidos[2].texto === 'e a Mel também', pedidos.map((p) => p.texto ?? 'decisões'));
  T.ok('a mensagem aparece como enviada, depois da resposta do "Pode fazer"', /Pronto, marquei o banho do Thor\.[\s\S]*e a Mel também/.test(await painel.locator('.g-ass-conversa').innerText()));

  T.secao('a resposta traz um cartão novo: a mensagem da fila volta para a caixa');
  await caixa.fill('obrigado');
  await caixa.press('Enter');
  await page.waitForTimeout(300);
  T.ok('"obrigado" entra na fila', /obrigado/.test(await fila.innerText().catch(() => '')));
  await painel.locator('button', { hasText: 'Pode fazer' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  T.ok('o cartão novo não é descartado sozinho', (await painel.locator('.g-proposta:not(.descartada)', { hasText: 'Marcar banho da Mel' }).count()) === 1);
  T.ok('a mensagem volta para a caixa, com o aviso', (await caixa.inputValue()) === 'obrigado' && /Sua mensagem voltou para a caixa/.test(await painel.innerText()));
  T.ok('e não foi mandada', pedidos.length === 3);
  T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
  T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
  await ctx.close();
  await N.fecharNavegador();
}))();
