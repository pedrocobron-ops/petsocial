// Camada de dados e casca do aplicativo (rodada 9, N3), no navegador:
//  1. Abertura "Abrindo <pet shop>…" que demora: aos 12 s a tela diz o que está acontecendo e oferece "Tentar de novo";
//     o botão refaz a abertura e o aplicativo abre (antes ficava só "Abrindo…", sem saída).
//  2. Leitura que falhou e a tela não trata: o aviso comum "Uma parte desta tela não carregou" com "Tentar de novo"
//     (a leitura que falha nunca fica parecendo "nada cadastrado"); com a leitura principal da Hoje falhando, a tela diz
//     "Não deu para ler a agenda agora" e não "Agenda livre".
//  3. Pedido preso (o servidor não responde): termina em erro com "Tentar de novo", em vez de esperar para sempre.
//  4. Memória curta: voltar para a Hoje pelo menu não baixa tudo de novo; depois de uma gravação, baixa.
//  5. Atualização sozinha: o que outro aparelho marcou aparece na Agenda sem recarregar a página, e a tela Hoje não baixa
//     mais os pets e o histórico inteiro (lê gestao_hoje_extras).
//  6. Telas em 390 e 1366 px sem rolagem lateral, com o aviso comum à vista.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('telas-dados-das-telas');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Dados telas', equipe: false });
  const { dono } = L.sb;
  const P = L.P;
  const ag = async (pet, hora, dia = L.hoje) => {
    const ini = B.instante(dia, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  };
  await ag('Luna', '19:00');
  T.depois(() => N.fecharNavegador());
  const pedidos = (page) => { const l = []; page.on('request', (r) => { if (/\/rest\/v1\//.test(r.url()) && r.method() !== 'OPTIONS') l.push(r.url().replace(/^.*\/rest\/v1\//, '').replace(/\?.*/, '')); }); return l; };

  T.secao('1. abertura que demora: explica e oferece "Tentar de novo"');
  {
    const { page } = await N.contexto(390, 800);
    await N.entrar(page, L.emails.dono, L.senha);
    // o servidor para de responder à abertura (a conta não chega)
    let preso = true;
    await page.route('**/rest/v1/rpc/entrar', async (rota) => { if (preso) return; await rota.continue(); });
    await page.goto(B.BASE_URL + '/gestao/app');
    const demora = page.locator('#g-abrindo-demora');
    await page.waitForTimeout(8500); // aos 8,5 s ainda não: num 4G fraco a abertura normal passa de 8 s
    T.ok('aos 8,5 s (antes dos 12 s): só "Abrindo <pet shop>…"', !(await demora.isVisible()) && /Abrindo Dados telas/.test(await page.locator('#g-abrindo').innerText()), await page.locator('body').innerText());
    await demora.waitFor({ state: 'visible', timeout: 13000 });
    const texto = await demora.innerText();
    T.ok('aos 12 s a tela diz o que está acontecendo', /Ainda buscando a sua conta|Ainda conferindo o seu login/.test(texto) && /Nada do que você salvou se perdeu/.test(texto), texto);
    T.ok('e oferece "Tentar de novo"', await demora.getByRole('button', { name: 'Tentar de novo' }).isVisible());
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/dados-abertura-demora-390.png` }).catch(() => {});
    preso = false;
    await demora.getByRole('button', { name: 'Tentar de novo' }).click();
    await page.waitForSelector('.g-main', { timeout: 20000 });
    T.ok('"Tentar de novo" refaz a abertura e o aplicativo abre', await page.locator('.g-main').isVisible());
    await page.context().close();
  }
  {
    // antes de o aplicativo baixar (internet fraca): a saída já está no HTML, ligada por um script pequeno
    const { page } = await N.contexto(390, 800);
    await page.route('**/_next/static/chunks/**', (rota) => new Promise(() => { void rota; }));
    await page.goto(B.BASE_URL + '/gestao/app', { waitUntil: 'commit' });
    await page.locator('#g-abrindo-demora').waitFor({ state: 'visible', timeout: 16000 });
    T.ok('com o aplicativo ainda baixando, aos 12 s o aviso e o botão já aparecem (vêm no HTML)', /ainda está baixando/.test(await page.locator('#g-abrindo-demora').innerText()), await page.locator('#g-abrindo-demora').innerText());
    await page.context().close();
  }

  T.secao('2. leitura que falhou nunca parece "nada cadastrado"');
  for (const [largura, altura] of [[390, 800], [1366, 800]]) {
    const { page } = await N.contexto(largura, altura);
    await N.entrar(page, L.emails.dono, L.senha);
    // os cartões de baixo da Hoje (a tela não olha o erro deles): o servidor responde 500
    let quebrado = true;
    await page.route('**/rest/v1/rpc/gestao_hoje_extras', async (rota) => { if (quebrado) return rota.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal Server Error"}' }); await rota.continue(); });
    await N.ir(page, '/gestao/app');
    const aviso = page.locator('[data-teste="leitura-falhou"]');
    await aviso.waitFor({ state: 'visible', timeout: 15000 });
    const texto = await aviso.innerText();
    T.ok(`${largura}: aviso comum "Uma parte desta tela não carregou", sem dizer que não há nada`, /Uma parte desta tela não carregou/.test(texto) && /não quer dizer que não há nada cadastrado/.test(texto) && /O servidor falhou agora/.test(texto), texto);
    T.ok(`${largura}: sem rolagem lateral com o aviso na tela`, (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/dados-leitura-falhou-${largura}.png` }).catch(() => {});
    quebrado = false;
    await aviso.getByRole('button', { name: 'Tentar de novo' }).click();
    await aviso.waitFor({ state: 'detached', timeout: 15000 });
    T.ok(`${largura}: "Tentar de novo" busca de novo e o aviso some`, !(await aviso.count()));
    await page.context().close();
  }
  {
    const { page } = await N.contexto(390, 800);
    await N.entrar(page, L.emails.dono, L.senha);
    await page.route('**/rest/v1/rpc/gestao_hoje', (rota) => rota.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Internal Server Error"}' }));
    await N.ir(page, '/gestao/app');
    await page.locator('[data-teste="hoje-erro"]').waitFor({ state: 'visible', timeout: 15000 });
    const corpo = await page.locator('.g-main').innerText();
    T.ok('Hoje com a leitura principal falhando: diz o erro, com "Tentar de novo", e não "Agenda livre"', /Tentar de novo/.test(corpo) && !/Agenda livre/i.test(corpo) && !/Nenhum banho marcado para hoje/.test(corpo), corpo.slice(0, 600));
    T.ok('a tela já trata esse erro: o aviso comum não repete', !(await page.locator('[data-teste="leitura-falhou"]').count()));
    await page.context().close();
  }

  T.secao('3. pedido preso termina em "Tentar de novo"');
  {
    const { page } = await N.contexto(390, 800);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/agenda');
    // relógio do navegador na mão: os 30 s do prazo passam num instante
    await page.clock.install();
    let preso = true;
    await page.route('**/rest/v1/pets?**', async (rota) => { if (preso) return; await rota.continue(); });
    await page.locator('a[href="/gestao/app/clientes"]').first().click().catch(() => {});
    if (!/clientes/.test(page.url())) await page.goto(B.BASE_URL + '/gestao/app/clientes');
    await page.waitForTimeout(1500);
    // cada pedido preso é cortado em 30 s (a biblioteca do banco tenta de novo); a leitura inteira desiste em 60 s
    await page.clock.runFor(31_000);
    await page.waitForTimeout(300);
    await page.clock.runFor(31_000);
    const erro = page.getByText(/Demorou demais, tente de novo/).first();
    await erro.waitFor({ state: 'visible', timeout: 15000 });
    T.ok('a lista de Clientes que não respondeu em um minuto mostra "Demorou demais, tente de novo."', await erro.isVisible());
    T.ok('com o botão "Tentar de novo"', await page.getByRole('button', { name: 'Tentar de novo' }).first().isVisible());
    preso = false;
    await page.getByRole('button', { name: 'Tentar de novo' }).first().click();
    await page.getByText('Thor').first().waitFor({ state: 'visible', timeout: 15000 });
    T.ok('e o "Tentar de novo" traz a lista', await page.getByText('Thor').first().isVisible());
    await page.context().close();
  }

  T.secao('4. memória curta: voltar pelo menu não baixa tudo de novo');
  {
    const { page } = await N.contexto(1366, 800);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    const lista = pedidos(page);
    const menu = async (rota) => { await page.locator(`aside a[href="${rota}"]`).first().click(); await page.waitForURL(`**${rota}`); await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(500); };
    await menu('/gestao/app/agenda');
    lista.length = 0;
    await menu('/gestao/app');
    await page.locator('.g-main h1').first().waitFor();
    T.ok('Hoje de volta em menos de 30 s: aparece na hora e não pede gestao_hoje nem os cartões de novo', !lista.includes('rpc/gestao_hoje') && !lista.includes('rpc/gestao_hoje_extras'), lista);
    T.ok('e mostra a agenda de hoje (Luna às 19:00)', /Luna/.test(await page.locator('.g-main').innerText()));
    await menu('/gestao/app/agenda');
    lista.length = 0;
    await menu('/gestao/app/agenda');
    // uma gravação em qualquer tela (aqui, o aviso que as telas mandam depois de gravar)
    await page.evaluate(() => window.dispatchEvent(new Event('gestao:mudou')));
    await page.waitForTimeout(800);
    lista.length = 0;
    await menu('/gestao/app');
    await page.waitForTimeout(1200);
    T.ok('depois de uma gravação, a Hoje busca de novo', lista.includes('rpc/gestao_hoje'), lista);
    await page.context().close();
  }

  T.secao('5. atualização sozinha e Hoje leve');
  {
    const { page } = await N.contexto(1366, 800);
    await N.entrar(page, L.emails.dono, L.senha);
    const lista = pedidos(page);
    // a tela aberta logo depois do login termina de carregar antes da contagem (os pedidos dela não entram)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    lista.length = 0;
    await N.ir(page, '/gestao/app');
    await page.waitForTimeout(2500);
    T.ok('a Hoje lê os cartões de baixo numa resposta só (gestao_hoje_extras)', lista.filter((u) => u === 'rpc/gestao_hoje_extras').length === 1, lista);
    T.ok('e não baixa mais os pets, as visitas nem a fila de mensagens', !lista.includes('pets') && !lista.includes('rpc/visitas_dos_pets') && !lista.includes('rpc/gestao_modo_envio'), lista);
    T.ok('nem pede as contas fixas duas vezes', lista.filter((u) => u === 'rpc/contas_fixas_gerar').length <= 1, lista.filter((u) => u === 'rpc/contas_fixas_gerar'));
    console.log(`        (Hoje: ${lista.length} pedidos ao banco na abertura)`);
    await page.clock.install();
    await N.ir(page, '/gestao/app/agenda');
    await page.waitForTimeout(1500);
    T.ok('a Agenda aberta ainda não tem o Bob', !/Bob/.test(await page.locator('.g-main').innerText()));
    // outro aparelho (a recepção) marca o Bob para hoje
    await ag('Bob', '17:00');
    lista.length = 0;
    await page.clock.runFor(61_000);
    await page.getByText('Bob').first().waitFor({ state: 'visible', timeout: 15000 });
    T.ok('um minuto depois o Bob aparece sozinho, sem recarregar a página', /Bob/.test(await page.locator('.g-main').innerText()));
    T.ok('a tela perguntou "mudou algo?" (gestao_sinal) antes de baixar', lista.includes('rpc/gestao_sinal'), lista);
    lista.length = 0;
    await page.clock.runFor(61_000);
    await page.waitForTimeout(1500);
    T.ok('sem mudança, o minuto seguinte só pergunta: não baixa a agenda de novo', lista.includes('rpc/gestao_sinal') && !lista.includes('agendamentos'), lista);
    await page.context().close();
  }
}))();
