// Boletim do pet pela tela: no celular (390) pela Agenda, no fim do banho (fotos geradas num canvas, recados, atenção, "Escrever
// com o Mozart" de teste, salvar, a mensagem do WhatsApp e o "Boletim enviado"); no computador (1366) pelo cartão da creche em Casa
// agora; e a página pública nos dois tamanhos (fotos carregadas, sem rolagem para o lado, sem telefone do tutor, Avaliar no
// Google, Marcar o próximo). O álbum aparece na ficha do pet. Servidor com GESTAO_BOLETIM_FALSO=1 (nunca chama o modelo).
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('boletim-tela');

/** Uma foto inventada (nada de gente de verdade): fundo em degradê e um "pet" de bolinhas, feita num canvas do navegador. */
async function fotoDeCanvas(page, cor) {
  const b64 = await page.evaluate((c) => {
    const t = document.createElement('canvas'); t.width = 1800; t.height = 1350;
    const g = t.getContext('2d');
    const d = g.createLinearGradient(0, 0, 1800, 1350); d.addColorStop(0, c[0]); d.addColorStop(1, c[1]);
    g.fillStyle = d; g.fillRect(0, 0, 1800, 1350);
    g.fillStyle = 'rgba(255,255,255,.85)';
    const bola = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    bola(900, 760, 300); bola(640, 420, 110); bola(800, 330, 110); bola(1000, 330, 110); bola(1160, 420, 110);
    g.fillStyle = 'rgba(31,27,23,.55)'; bola(800, 700, 26); bola(1000, 700, 26); bola(900, 820, 40);
    return t.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, cor);
  return { name: `pet-${cor[0].slice(1)}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Boletim tela' });
  const { dono, tosador, monitor } = L.sb;
  const P = L.P;
  B.sql(`update pets set sexo = 'M' where id in ('${L.pets.Thor}', '${L.pets.Bob}')`);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'loja.google': 'https://g.page/r/CTeste123/review' } }), 'google');
  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: ag, p_servicos: [{ servico_id: L.S['Hidratação'], preco: 30 }] }), 'hidratação');
  B.must(await tosador.from('agendamentos').update({ status: 'concluido' }).eq('id', ag).select('id'), 'conclui');
  B.must(await monitor.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'creche', status: 'em_casa', entrada: new Date().toISOString() }).select('id'), 'check-in');
  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });

  T.secao('celular: pela Agenda, no fim do banho');
  let { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.tosador, L.senha);
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Thor' }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('.g-folha').last().locator('button', { hasText: 'Mandar boletim' }).click();
  await page.waitForTimeout(1200);
  let f = page.locator('.g-folha').last();
  await f.locator('[data-teste=fotos-do-boletim]').setInputFiles([await fotoDeCanvas(page, ['#f6a04d', '#e2557a']), await fotoDeCanvas(page, ['#4da3f6', '#6be2b5'])]);
  await page.waitForFunction(() => document.querySelectorAll('.g-folha .g-bol-fotos img').length === 2 && !document.querySelector('.g-folha .g-bol-fotos li.subindo'), null, { timeout: 30000 });
  const dim = await f.locator('.g-bol-fotos img').first().evaluate((i) => Math.max(i.naturalWidth, i.naturalHeight));
  T.ok('a foto foi reduzida no aparelho para 1600 px', dim === 1600, dim);
  for (const c of ['Comportado', 'Perfume', 'Lacinho']) await f.locator('button.g-chip', { hasText: c }).first().click();
  await f.locator('.g-bol-atencao button.g-chip', { hasText: 'Orelha vermelha' }).click();
  const pronto = await f.locator('textarea.g-bol-texto').inputValue();
  T.ok('o texto pronto sai dos recados (sem IA)', /Thor/.test(pronto) && /perfumado/.test(pronto) && /lacinho/.test(pronto), pronto);
  await f.locator('button', { hasText: 'Escrever com o Mozart' }).click();
  await page.waitForFunction(() => /texto de teste/.test(document.querySelector('.g-folha textarea.g-bol-texto')?.value ?? ''), null, { timeout: 15000 });
  T.ok('Escrever com o Mozart troca o texto (rota de teste, sem modelo)', true);
  await f.locator('textarea.g-bol-texto').fill('Thor fez banho e hidratação e saiu perfumado, com lacinho. Se comportou muito bem!');
  await page.screenshot({ path: path.join(saida, 'boletim-folha-390.png'), fullPage: true });
  await f.locator('button', { hasText: 'Salvar boletim' }).click();
  await page.waitForSelector('.g-folha a[data-teste=mandar-boletim]', { timeout: 15000 });
  const href = await page.locator('.g-folha a[data-teste=mandar-boletim]').getAttribute('href');
  const b = JSON.parse(B.sql(`select row_to_json(x) from (select token, texto, chips, atencao, cardinality(fotos) as n, enviado_em from boletins where agendamento_id='${ag}') x`));
  const msg = decodeURIComponent((href ?? '').split('text=')[1] ?? '');
  T.ok('o banco guardou o boletim (2 fotos, recados, atenção, texto editado)', b.n === 2 && b.chips.includes('Lacinho') && b.atencao === 'Orelha vermelha.' && /Se comportou muito bem!/.test(b.texto), b);
  T.ok('o WhatsApp abre no número da Ana com "Oi, Ana! O boletim do Thor de hoje: <link>"', /^https:\/\/wa\.me\/5511988880001\?/.test(href ?? '') && msg === `Oi, Ana! O boletim do Thor de hoje: ${B.BASE_URL}/gestao/boletim/${b.token}`, msg);
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null), page.locator('.g-folha a[data-teste=mandar-boletim]').click()]);
  if (popup) await popup.close();
  await page.waitForTimeout(1200);
  T.ok('tocar em Mandar no WhatsApp marca o boletim como enviado', B.sql(`select enviado_em is not null from boletins where agendamento_id='${ag}'`) === 't');
  T.ok('a folha mostra "Boletim enviado"', /Boletim enviado/.test(await page.locator('.g-folha').last().innerText()));
  T.ok('sem rolagem para o lado (390)', (await N.rolagemLateral(page)) <= 0);
  T.ok('nenhum erro na tela (390)', erros.length === 0, erros.slice(0, 4));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  T.ok('o horário mostra o botão "Boletim enviado"', /Boletim enviado/.test(await page.locator('.g-folha').last().innerText().catch(() => '')));
  await ctx.close();

  T.secao('computador: pelo cartão da creche em Casa agora');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  await N.entrar(page, L.emails.monitor, L.senha);
  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  const btn = page.getByRole('button', { name: 'Mandar boletim de Bob' });
  if (!(await btn.count())) { const casa = page.locator('button', { hasText: 'Casa agora' }).first(); if (await casa.count()) { await casa.click(); await page.waitForTimeout(800); } }
  await btn.first().click();
  await page.waitForTimeout(1200);
  f = page.locator('.g-folha').last();
  await f.locator('[data-teste=fotos-do-boletim]').setInputFiles([await fotoDeCanvas(page, ['#8bc34a', '#2f7d6d'])]);
  await page.waitForFunction(() => document.querySelectorAll('.g-folha .g-bol-fotos img').length === 1 && !document.querySelector('.g-folha .g-bol-fotos li.subindo'), null, { timeout: 30000 });
  for (const c of ['Comeu tudo', 'Brincou muito', 'Descansou']) await f.locator('button.g-chip', { hasText: c }).first().click();
  await f.locator('input[placeholder^="Nome do amigo"]').fill('Mel');
  const tCasa = await f.locator('textarea.g-bol-texto').inputValue();
  T.ok('o texto pronto da creche fala do dia e da amizade', /Bob passou o dia na creche/.test(tCasa) && /Fez amizade com Mel/.test(tCasa), tCasa);
  await f.locator('button', { hasText: 'Salvar boletim' }).click();
  await page.waitForSelector('.g-folha a[data-teste=mandar-boletim]', { timeout: 15000 });
  const hCasa = decodeURIComponent(((await page.locator('.g-folha a[data-teste=mandar-boletim]').getAttribute('href')) ?? '').split('text=')[1] ?? '');
  T.ok('mensagem da creche: "Oi, Beto! O boletim do Bob de hoje: …"', /^Oi, Beto! O boletim do Bob de hoje: http/.test(hCasa), hCasa);
  const tokCasa = B.sql(`select token from boletins b join estadias e on e.id = b.estadia_id where e.pet_id='${L.pets.Bob}'`);
  T.ok('o banco guardou o boletim da creche com "Fez amizade com Mel"', B.sql(`select chips::text from boletins where token='${tokCasa}'`).includes('Fez amizade com Mel'));
  T.ok('nenhum erro na tela (1366)', erros.length === 0, erros.slice(0, 4));
  await ctx.close();

  T.secao('página pública do tutor (390 e 1366)');
  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    ({ ctx, page, erros } = await N.contexto(larg, alt));
    await page.goto(`${B.BASE_URL}/gestao/boletim/${b.token}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const imgs = await page.locator('.g-bo-fotos img').evaluateAll((l) => l.map((i) => i.complete && i.naturalWidth > 0));
    T.ok(`as 2 fotos carregam (${larg})`, imgs.length === 2 && imgs.every(Boolean), imgs);
    const texto = await page.locator('body').innerText();
    T.ok(`mostra Thor, o texto, a atenção, os serviços, Avaliar no Google e Marcar o próximo (${larg})`,
      /Thor/.test(texto) && /Se comportou muito bem/.test(texto) && /Para você ficar de olho/.test(texto) && /Orelha vermelha/.test(texto) && /Hidratação/.test(texto) && /Avaliar no Google/.test(texto) && /Marcar o próximo/.test(texto), texto.slice(0, 400));
    T.ok(`sem telefone nem nome do tutor (${larg})`, !/98888-?0001|Ana Souza/.test(texto));
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(page)) <= 0);
    T.ok(`nenhum erro na página (${larg})`, erros.length === 0, erros.slice(0, 4));
    await page.screenshot({ path: path.join(saida, `boletim-${larg}.png`), fullPage: true });
    if (larg === 390) {
      await page.goto(`${B.BASE_URL}/gestao/boletim/${tokCasa}`);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.screenshot({ path: path.join(saida, `boletim-creche-${larg}.png`), fullPage: true });
      T.ok('o boletim da creche abre com "Dia de creche"', /Dia de creche/.test(await page.locator('body').innerText()));
    }
    await ctx.close();
  }

  T.secao('álbum na ficha do pet');
  ({ ctx, page, erros } = await N.contexto(390, 844));
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, `/gestao/app/clientes?pet=${L.pets.Thor}`);
  await page.waitForSelector('.g-bol-album', { timeout: 20000 });
  await page.waitForTimeout(1200);
  T.ok('o álbum do Thor mostra as 2 fotos do boletim', (await page.locator('.g-bol-album-visita img').count()) === 2);
  await page.locator('.g-bol-album button', { hasText: 'Mandar o álbum' }).click();
  await page.waitForSelector('.g-bol-album a.g-btn.zap', { timeout: 15000 });
  const hAlbum = decodeURIComponent(((await page.locator('.g-bol-album a.g-btn.zap').getAttribute('href')) ?? '').split('text=')[1] ?? '');
  T.ok('o link do álbum vai pelo WhatsApp', /^Oi, Ana! O álbum do Thor com a gente: http.*\/gestao\/album\/[0-9a-f]{64}$/.test(hAlbum), hAlbum);
  await page.goto(hAlbum.split(': ').pop());
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  T.ok('a página do álbum mostra as fotos', (await page.locator('.g-al-fotos img').evaluateAll((l) => l.filter((i) => i.naturalWidth > 0).length)) === 2);
  await page.screenshot({ path: path.join(saida, 'album-390.png'), fullPage: true });
  T.ok('nenhum erro (álbum)', erros.length === 0, erros.slice(0, 4));
  await ctx.close();
  await N.fecharNavegador();
}))();
