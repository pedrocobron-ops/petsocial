// Mozart respondendo aos poucos (src/components/gestao/assistente.tsx + rota /api/gestao/assistente).
// O fetch da página é trocado (addInitScript) por um roteiro que manda a resposta em pedaços, com pausas, no formato da rota
// (uma linha JSON por evento: progresso, texto, fim). Confere, em 390 e 1366: o pedido vai com "Accept: application/x-ndjson";
// a frase "Procurando Thor…" aparece embaixo dos três pontinhos; o texto cresce aos poucos na bolha; o cartão continua pedindo
// "Pode fazer" (nada é mandado como decisão antes do toque); depois do toque, a resposta também chega aos poucos; ler em voz
// alta fala frase por frase enquanto chega; sem erro na página e sem rolagem para o lado.
// No servidor de verdade: sem o Accept a rota responde JSON como antes, e os erros antes do modelo continuam em JSON.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('mozart-stream');
const { falsos } = require('../lib/voz-falsa');

/** Roda na página: troca o fetch da rota do Mozart por respostas em pedaços. window.__mz guarda os pedidos. */
function roteiroAosPoucos() {
  const reg = (window.__mz = { pedidos: [] });
  const original = window.fetch.bind(window);
  const linha = (e) => new TextEncoder().encode(JSON.stringify(e) + '\n');
  const cartao = { id: 'toolu_t1', ferramenta: 'marcar_horario', resumo: { titulo: 'Marcar banho do Thor', linhas: [['Pet', 'Thor'], ['Quando', 'amanhã às 10h']] } };
  window.fetch = async (url, op = {}) => {
    if (!String(url).includes('/api/gestao/assistente')) return original(url, op);
    const corpo = JSON.parse(op.body || '{}');
    const accept = (op.headers && (op.headers.accept || op.headers.Accept)) || '';
    reg.pedidos.push({ corpo, accept });
    const decidiu = Array.isArray(corpo.decisoes);
    const passos = decidiu
      ? [[300, { t: 'texto', d: 'Prontinho, ' }], [400, { t: 'texto', d: 'marquei o banho ' }], [400, { t: 'texto', d: 'do Thor.' }],
        [300, { t: 'fim', status: 200, mensagens: [], texto: 'Prontinho, marquei o banho do Thor.', propostas: [], parciais: [], links: [], mudou: true }]]
      : [[150, { t: 'progresso', frase: 'Procurando Thor…' }], [900, { t: 'progresso', frase: 'Vendo os horários livres de amanhã…' }],
        [900, { t: 'texto', d: 'Achei o Thor. ' }], [500, { t: 'texto', d: 'Amanhã às 10h está livre, ' }], [500, { t: 'texto', d: 'confere aí embaixo.' }],
        [400, { t: 'fim', status: 200, mensagens: [], texto: 'Achei o Thor. Amanhã às 10h está livre, confere aí embaixo.', propostas: [cartao], parciais: [], links: [], mudou: false }]];
    const corrente = new ReadableStream({
      async start(ctl) {
        for (const [ms, e] of passos) { await new Promise((ok) => setTimeout(ok, ms)); ctl.enqueue(linha(e)); }
        ctl.close();
      },
    });
    return new Response(corrente, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
  };
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart stream', equipe: false, dados: false });

  T.secao('servidor: compatível com quem pede JSON');
  const token = (await L.sb.dono.auth.getSession()).data.session.access_token;
  const agora = new Date();
  const base = { petshopId: L.P, mensagens: [], texto: '', agora: `${agora.toISOString().slice(0, 16)}`, fusoMin: -180 };
  const pedir = (accept, corpo) => fetch(`${B.BASE_URL}/api/gestao/assistente`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(accept ? { accept } : {}) }, body: JSON.stringify(corpo) });
  const r1 = await pedir(null, base);
  T.ok('sem Accept: pedido vazio volta 400 em JSON, como antes', r1.status === 400 && /json/.test(r1.headers.get('content-type') || '') && (await r1.json()).erro === 'pedido_vazio');
  const r2 = await pedir('application/x-ndjson', base);
  T.ok('pedindo aos poucos: erro antes do modelo continua 400 em JSON', r2.status === 400 && /json/.test(r2.headers.get('content-type') || ''));
  const r3 = await pedir('application/x-ndjson', { ...base, agora: 'ontem' });
  T.ok('pedido incompleto: 400', r3.status === 400);

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const celular = largura < 500;
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await ctx.addInitScript(falsos);
    await ctx.addInitScript(roteiroAosPoucos);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');

    T.secao(`${largura}: texto aos poucos e a frase do que ele está fazendo`);
    await page.locator(celular ? '.g-aba-mic' : '.g-fab').first().click();
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    await painel.waitFor({ timeout: 10000 });
    // ler em voz alta ligado, para conferir que fala enquanto chega
    await painel.locator('button[aria-label="Ajustes da voz"]').click();
    await painel.locator('label', { hasText: 'Ler as respostas do Mozart em voz alta' }).locator('input').check();
    await painel.locator('button[aria-label="Ajustes da voz"]').click();
    const caixa = painel.locator('textarea');
    await caixa.fill('marca banho do thor amanhã às 10');
    await caixa.press('Enter');

    const progresso = painel.locator('.g-ass-progresso');
    await progresso.waitFor({ timeout: 5000 });
    T.ok('a frase aparece embaixo dos três pontinhos', /Procurando Thor…/.test(await progresso.innerText()) && (await painel.locator('.g-bolha.pensa + .g-ass-progresso').count()) === 1);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-stream-progresso-${largura}.png` }).catch(() => {});
    await page.waitForFunction(() => /horários livres de amanhã/.test(document.querySelector('.g-ass-progresso')?.textContent || ''), null, { timeout: 5000 });
    T.ok('a frase muda com a próxima consulta', true);
    const pedido = await page.evaluate(() => window.__mz.pedidos[0]);
    T.ok('o pedido vai pedindo a resposta aos poucos (Accept: application/x-ndjson)', /application\/x-ndjson/.test(pedido.accept) && pedido.corpo.texto === 'marca banho do thor amanhã às 10', pedido);

    // amostra o texto da bolha enquanto chega
    const vistos = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const tx = await painel.locator('.g-ass-aovivo').innerText().catch(() => '');
      if (tx && vistos[vistos.length - 1] !== tx) vistos.push(tx);
      if (await painel.locator('button', { hasText: 'Pode fazer' }).count()) break;
      await page.waitForTimeout(80);
    }
    T.ok('o texto aparece aos poucos (cresce na mesma bolha)', vistos.length >= 2 && vistos.every((v, i) => i === 0 || v.startsWith(vistos[i - 1].trim())) && vistos[0].length < vistos[vistos.length - 1].length, vistos);
    T.ok('enquanto o texto chega, a frase de progresso sai', vistos.length > 0);
    if (largura === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-stream-texto-${largura}.png` }).catch(() => {});

    T.secao(`${largura}: o cartão continua pedindo confirmação`);
    await painel.locator('button', { hasText: 'Pode fazer' }).waitFor({ timeout: 5000 });
    await page.waitForTimeout(200);
    const conversa = await painel.locator('.g-ass-conversa').innerText();
    T.ok('a resposta final fica numa bolha só, com o texto inteiro', (conversa.match(/Achei o Thor\./g) || []).length === 1 && /confere aí embaixo\./.test(conversa) && !(await painel.locator('.g-ass-aovivo').count()));
    T.ok('o cartão aparece com "Pode fazer" e "Agora não"', (await painel.locator('.g-proposta', { hasText: 'Marcar banho do Thor' }).count()) === 1 && (await painel.locator('button', { hasText: 'Agora não' }).count()) === 1);
    T.ok('a frase de progresso sumiu no fim', !(await painel.locator('.g-ass-progresso').count()));
    await page.waitForTimeout(1200);
    T.ok('nada foi mandado como decisão sem o toque', (await page.evaluate(() => window.__mz.pedidos.length)) === 1);
    const falas = await page.evaluate(() => window.__voz.falas.map((f) => f.texto));
    T.ok('leu em voz alta frase por frase, com hora falada', falas.length >= 2 && falas[0] === 'Achei o Thor.' && falas.some((f) => /10 horas/.test(f)), falas);

    await painel.locator('button', { hasText: 'Pode fazer' }).click();
    await page.waitForFunction(() => window.__mz.pedidos.length === 2, null, { timeout: 5000 });
    const dec = await page.evaluate(() => window.__mz.pedidos[1].corpo.decisoes);
    T.ok('o toque manda a decisão (ok) do cartão', Array.isArray(dec) && dec.length === 1 && dec[0].ok === true && dec[0].id === 'toolu_t1', dec);
    await painel.locator('.g-ass-aovivo').waitFor({ timeout: 3000 }).catch(() => {});
    const parcial = await painel.locator('.g-ass-aovivo').innerText().catch(() => '');
    T.ok('a resposta do "Pode fazer" também chega aos poucos', /^Prontinho/.test(parcial) && parcial.length < 'Prontinho, marquei o banho do Thor.'.length, parcial);
    await page.waitForFunction(() => !document.querySelector('.g-bolha.pensa'), null, { timeout: 5000 });
    T.ok('fica "Prontinho, marquei o banho do Thor."', /Prontinho, marquei o banho do Thor\./.test(await painel.locator('.g-ass-conversa').innerText()));
    T.ok('cartão confirmado', (await painel.locator('.g-proposta.feita').count()) === 1);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-stream-fim-${largura}.png` }).catch(() => {});

    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }

  T.secao('390: escolher a voz');
  const EDGE = [
    { name: 'Microsoft Maria - Portuguese (Brazil)', lang: 'pt-BR', voiceURI: 'maria' },
    { name: 'Microsoft Francisca Online (Natural) - Portuguese (Brazil)', lang: 'pt-BR', voiceURI: 'francisca' },
    { name: 'Microsoft Antonio Online (Natural) - Portuguese (Brazil)', lang: 'pt-BR', voiceURI: 'antonio' },
    { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US', voiceURI: 'aria' },
  ];
  for (const [nome, vozes] of [['com vozes do Edge', EDGE], ['sem voz em português', [{ name: 'Samantha', lang: 'en-US', voiceURI: 'sam' }]]]) {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await ctx.addInitScript(falsos);
    // vozes de mentira: a fala de verdade só aceita SpeechSynthesisVoice, então a fala também vira de mentira
    await ctx.addInitScript((v) => {
      window.__vozesFalsas = v;
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.lang = ''; this.voice = null; this.rate = 1; } };
    }, vozes);
    await ctx.addInitScript(roteiroAosPoucos);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    await page.locator('.g-aba-mic').first().click();
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    await painel.waitFor({ timeout: 10000 });
    await page.waitForTimeout(400);
    await painel.locator('button[aria-label="Ajustes da voz"]').click();
    if (vozes === EDGE) {
      const lista = painel.locator('select[aria-label="Voz do Mozart"]');
      const opcoes = await lista.locator('option').allInnerTexts();
      T.ok(`${nome}: a lista tem só as vozes em português, a natural primeiro`, opcoes.length === 4 && /Automática/.test(opcoes[0]) && opcoes[1] === 'Francisca (natural)' && !opcoes.some((o) => /Aria/.test(o)), opcoes);
      await painel.locator('button', { hasText: 'Ouvir exemplo' }).click();
      await page.waitForTimeout(200);
      let falas = await page.evaluate(() => window.__voz.falas);
      T.ok(`${nome}: "Ouvir exemplo" fala com a Francisca, um pouco mais rápido, frase por frase, com o dinheiro por extenso`, falas.length >= 2 && falas.every((f) => /Francisca/.test(f.voz) && f.rate > 1 && f.rate < 1.1) && falas.some((f) => /60 reais/.test(f.texto)), falas);
      await lista.selectOption('antonio');
      T.ok(`${nome}: a escolha fica guardada no aparelho`, (await page.evaluate(() => localStorage.getItem('gestao:voz:voz'))) === 'antonio');
      await painel.locator('button', { hasText: 'Ouvir exemplo' }).click();
      await page.waitForTimeout(200);
      falas = await page.evaluate(() => window.__voz.falas);
      T.ok(`${nome}: depois fala com o Antonio`, /Antonio/.test(falas[falas.length - 1].voz), falas.slice(-1));
      await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-stream-voz-390.png` }).catch(() => {});
    } else {
      T.ok(`${nome}: aparece a dica de como instalar`, /não tem voz em português/.test(await painel.innerText()));
      T.ok(`${nome}: sem "Ler em voz alta"`, !(await painel.locator('label', { hasText: 'Ler as respostas do Mozart em voz alta' }).count()));
      await painel.locator('button[aria-label="Ajustes da voz"]').click();
      await painel.locator('textarea').fill('oi');
      await painel.locator('textarea').press('Enter');
      await painel.locator('button', { hasText: 'Pode fazer' }).waitFor({ timeout: 8000 });
      T.ok(`${nome}: as respostas vêm sem o alto-falante`, !(await painel.locator('button.g-ass-ouvir').count()));
    }
    T.ok(`${nome}: nenhum erro na tela`, erros.length === 0, erros.slice(0, 4));
    T.ok(`${nome}: sem rolagem para o lado`, (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
