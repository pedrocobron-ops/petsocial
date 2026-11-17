// Checklist de entrada com termo pela tela. 390 (recepção): Thor (10 anos, "Alergia a shampoo de coco" na ficha) chega pela Agenda;
// a folha abre sozinha (opção padrão: só pet idoso), com os cuidados vindos da ficha e "Pet idoso ou doente" marcado; chips, uma
// foto feita num canvas (nada de gente de verdade), pertences, observação; "Assinar aqui no aparelho": o termo padrão com o nome do
// pet, "Li e concordo", o nome e uma assinatura desenhada no quadro com o dedo; o banco guarda o PNG; o horário mostra
// "Entrada conferida ✓ · aceite do tutor ✓" e "Devolver: coleira, caminha e cobertor azul" com a caixa; o comprovante com a
// assinatura. 1366 (dona): Meu pet shop, "Todos os pets"; a monitora faz o check-in do Bob no hotel, a folha abre sozinha,
// "Mandar o link pelo WhatsApp" (mensagem "Oi, Beto! …"); o tutor abre o link (390 e 1366) e toca em "Li e concordo"; o cartão
// mostra o aceite e o check-out mostra "Devolver: ração". Capturas em testes/saida/entrada-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('entrada-tela');

/** Uma foto inventada: fundo em degradê e um "pet" de bolinhas, feita num canvas do navegador. */
async function fotoDeCanvas(page, cor) {
  const b64 = await page.evaluate((c) => {
    const t = document.createElement('canvas'); t.width = 1400; t.height = 1050;
    const g = t.getContext('2d');
    const d = g.createLinearGradient(0, 0, 1400, 1050); d.addColorStop(0, c[0]); d.addColorStop(1, c[1]);
    g.fillStyle = d; g.fillRect(0, 0, 1400, 1050);
    g.fillStyle = 'rgba(255,255,255,.85)';
    const bola = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    bola(700, 600, 240); bola(500, 330, 90); bola(900, 330, 90);
    g.fillStyle = 'rgba(200,40,40,.7)'; bola(800, 650, 30);
    return t.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, cor);
  return { name: 'pata.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

/** Desenha uma assinatura no quadro (vários traços, como um dedo). */
async function assinar(page) {
  const q = page.locator('[data-teste=quadro-assinatura]');
  await q.scrollIntoViewIfNeeded();
  const r = await q.boundingBox();
  const traco = async (pts) => {
    await page.mouse.move(r.x + pts[0][0] * r.width, r.y + pts[0][1] * r.height);
    await page.mouse.down();
    for (const [x, y] of pts.slice(1)) await page.mouse.move(r.x + x * r.width, r.y + y * r.height, { steps: 6 });
    await page.mouse.up();
  };
  await traco([[0.12, 0.6], [0.18, 0.3], [0.24, 0.62], [0.3, 0.35], [0.36, 0.6], [0.44, 0.4]]);
  await traco([[0.5, 0.55], [0.56, 0.32], [0.6, 0.6], [0.66, 0.42], [0.72, 0.58], [0.86, 0.45]]);
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Entrada tela' });
  const { dono, monitor } = L.sb;
  const P = L.P;
  const dezAnos = `${Number(L.hoje.slice(0, 4)) - 10}${L.hoje.slice(4)}`;
  B.sql(`update pets set nascimento = '${dezAnos}', alertas = 'Alergia a shampoo de coco' where id = '${L.pets.Thor}'`);
  const ini = B.instante(L.hoje, '10:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  const est = B.must(await monitor.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'hotel', status: 'reservada', entrada: B.instante(L.hoje, '08:00', L.fuso).toISOString(), saida_prevista: B.instante(B.somaDias(L.hoje, 2), '18:00', L.fuso).toISOString() }).select('id').single(), 'reserva').id;
  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });

  T.secao('celular: Chegou pela Agenda e assinatura no aparelho');
  let { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.caixa, L.senha);
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Thor' }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('.g-folha').last().locator('button', { hasText: 'Chegou: iniciar atendimento' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.g-folha')].some((f) => /Entrada · Thor/.test(f.textContent ?? '') && f.querySelector('textarea')), null, { timeout: 15000 });
  let f = page.locator('.g-folha').last();
  T.ok('a folha da entrada abre sozinha no Chegou (pet de 10 anos)', /Entrada · Thor/.test(await f.innerText()));
  T.ok('os cuidados vêm da ficha do pet', (await f.locator('textarea[aria-label="Alergias e cuidados"]').inputValue()) === 'Alergia a shampoo de coco');
  T.ok('"Pet idoso ou doente" já vem marcado, com a nota', (await f.locator('button.g-chip', { hasText: 'Pet idoso ou doente' }).getAttribute('aria-pressed')) === 'true' && /Manuseio com mais calma/.test(await f.innerText()));
  T.ok('dá para pular ("Pular agora")', (await f.locator('button', { hasText: 'Pular agora' }).count()) === 1);
  for (const c of ['Agitado', 'Pulgas', 'Coleira', 'Caminha']) await f.locator('button.g-chip', { hasText: c }).first().click();
  await f.locator('input[aria-label="Onde e como"]').fill('Pulgas no pescoço');
  await f.locator('input[aria-label="Outros pertences"]').fill('Cobertor azul');
  await f.locator('textarea[aria-label="Observações da entrada"]').fill('Chegou sem comer');
  await f.locator('[data-teste=fotos-da-entrada]').setInputFiles([await fotoDeCanvas(page, ['#f6a04d', '#e2557a'])]);
  await page.waitForFunction(() => document.querySelectorAll('.g-folha .g-bol-fotos img').length === 1 && !document.querySelector('.g-folha .g-bol-fotos li.subindo'), null, { timeout: 30000 });
  await page.screenshot({ path: path.join(saida, 'entrada-checklist-390.png'), fullPage: true });
  T.ok('sem rolagem para o lado na folha (390)', (await N.rolagemLateral(page)) <= 0);
  await f.locator('[data-teste=salvar-entrada]').click();
  await page.locator('.g-folha').last().locator('button', { hasText: 'Assinar aqui no aparelho' }).click();
  await page.waitForSelector('[data-teste=quadro-assinatura]', { timeout: 10000 });
  f = page.locator('.g-folha').last();
  const termo = await f.locator('[data-teste=termo-da-entrada]').innerText();
  T.ok('o termo padrão com o nome do pet', /Conferi com a equipe como Thor chegou hoje/.test(termo) && /pets idosos, doentes/.test(termo), termo.slice(0, 120));
  T.ok('o resumo mostra o que foi anotado', /Agitado/.test(await f.innerText()) && /Coleira, Caminha e Cobertor azul/.test(await f.innerText()));
  T.ok('sem assinatura, o botão fica apagado', await f.locator('[data-teste=confirmar-assinatura]').isDisabled());
  await f.locator('label', { hasText: 'Li e concordo' }).locator('input').check();
  T.ok('o nome vem do tutor', (await f.locator('input').filter({ hasNot: page.locator('[type=checkbox]') }).last().inputValue()) === 'Ana Souza');
  await assinar(page);
  await page.screenshot({ path: path.join(saida, 'entrada-assinatura-390.png'), fullPage: true });
  await f.locator('[data-teste=confirmar-assinatura]').click();
  await page.waitForFunction(() => /Aceito por Ana Souza/.test(document.querySelector('.g-folha:last-of-type')?.textContent ?? document.body.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
  const e1 = JSON.parse(B.sql(`select row_to_json(x) from (select id, aceite, aceite_nome, aceite_assinatura, temperamento, lesoes, lesoes_obs, pertences, pertences_outros, obs, idoso_doente, cuidados, cardinality(fotos) as n from entradas where agendamento_id='${ag}') x`));
  T.ok('o banco guardou a entrada (chips, cuidados, foto, pertences, observação)', e1.n === 1 && e1.temperamento.join() === 'agitado' && e1.lesoes.join() === 'pulgas' && e1.pertences.join() === 'caminha,coleira' && e1.pertences_outros === 'Cobertor azul' && e1.obs === 'Chegou sem comer' && e1.idoso_doente && e1.cuidados === 'Alergia a shampoo de coco', e1);
  T.ok('aceite no aparelho: Ana Souza, com a assinatura (PNG no bucket)', e1.aceite === 'aparelho' && e1.aceite_nome === 'Ana Souza' && /\.png$/.test(e1.aceite_assinatura ?? '') && B.num(`select count(*) from storage.objects where bucket_id='entrada' and name='${e1.aceite_assinatura}'`) === 1, e1);
  const tam = B.num(`select coalesce((metadata->>'size')::int, 0) from storage.objects where bucket_id='entrada' and name='${e1.aceite_assinatura}'`);
  T.ok('a assinatura tem traço (PNG com mais que o fundo branco)', tam > 1500, tam);
  await page.screenshot({ path: path.join(saida, 'entrada-aceita-390.png'), fullPage: true });
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  f = page.locator('.g-folha').last();
  const noHorario = await f.innerText();
  T.ok('o horário mostra "Entrada conferida ✓ · aceite do tutor ✓"', /Entrada conferida ✓ · aceite do tutor ✓/.test(noHorario), noHorario.slice(0, 300));
  T.ok('e "Devolver: coleira, caminha e Cobertor azul" com a caixa', /Devolver: coleira, caminha e Cobertor azul/.test(noHorario));
  await f.locator('[data-teste=devolver-pertences] input').check();
  await page.waitForTimeout(1000);
  T.ok('marcar devolvido grava a hora', B.sql(`select devolvido_em is not null from entradas where id='${e1.id}'`) === 't');
  await page.screenshot({ path: path.join(saida, 'entrada-horario-390.png'), fullPage: true });
  T.ok('nenhum erro na tela (390)', erros.length === 0, erros.slice(0, 4));
  await N.ir(page, `/gestao/app/entrada?id=${e1.id}`);
  await page.waitForSelector('[data-teste=assinatura-impressa]', { timeout: 15000 });
  await page.waitForFunction(() => { const i = document.querySelector('[data-teste=assinatura-impressa]'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
  const comp = await page.locator('[data-teste=comprovante-entrada]').innerText();
  T.ok('o comprovante tem o resumo, o texto aceito e a assinatura', /Agitado/.test(comp) && /Conferi com a equipe/.test(comp) && /Ana Souza/.test(comp) && /com assinatura no aparelho da loja/.test(comp));
  await page.screenshot({ path: path.join(saida, 'entrada-comprovante-390.png'), fullPage: true });
  T.ok('nenhum erro no comprovante', erros.length === 0, erros.slice(0, 4));
  await ctx.close();

  T.secao('computador: opção, check-in do hotel e aceite pelo link');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app/meu-petshop');
  const grupo = page.locator('section#grupo-negocio');
  if (!(await page.locator('#opcoes-entrada').isVisible().catch(() => false))) await grupo.locator('button').first().click().catch(() => {});
  await page.locator('#opcoes-entrada').scrollIntoViewIfNeeded();
  await page.locator('#opcoes-entrada button[role=radio]', { hasText: 'Todos os pets' }).click();
  await page.waitForTimeout(1200);
  T.ok('Meu pet shop: "Todos os pets" gravado', B.sql(`select opcoes->>'entrada.exigir' from petshops where id='${P}'`) === 'todos');
  await page.locator('#opcoes-entrada').screenshot({ path: path.join(saida, 'entrada-opcoes-1366.png') });
  T.ok('nenhum erro em Meu pet shop', erros.length === 0, erros.slice(0, 4));
  await ctx.close();

  ({ ctx, page, erros } = await N.contexto(1366, 900));
  await N.entrar(page, L.emails.monitor, L.senha);
  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  await page.locator('.g-seg button', { hasText: /^Reservas/ }).first().click();
  await page.locator('.g-ch-cartao', { hasText: 'Bob' }).first().locator('button', { hasText: 'Check-in' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.g-folha')].some((x) => /Entrada · Bob/.test(x.textContent ?? '') && x.querySelector('textarea')), null, { timeout: 15000 });
  f = page.locator('.g-folha').last();
  T.ok('a folha abre sozinha no check-in (todos os pets)', /Entrada · Bob/.test(await f.innerText()));
  for (const c of ['Calmo', 'Ração']) await f.locator('button.g-chip', { hasText: c }).first().click();
  await f.locator('[data-teste=salvar-entrada]').click();
  await page.locator('.g-folha').last().locator('button', { hasText: 'Mandar o link pelo WhatsApp' }).click();
  await page.waitForSelector('.g-folha a[data-teste=mandar-entrada]', { timeout: 15000 });
  const href = await page.locator('.g-folha a[data-teste=mandar-entrada]').getAttribute('href');
  const tk = B.sql(`select token from entradas where estadia_id='${est}'`);
  const msg = decodeURIComponent((href ?? '').split('text=')[1] ?? '');
  T.ok('o WhatsApp abre no número do Beto com o link', /^https:\/\/wa\.me\/5511988880002\?/.test(href ?? '') && msg === `Oi, Beto! Anotamos como Bob chegou aqui hoje. Confira e dê o seu ok: ${B.BASE_URL}/gestao/entrada/${tk}`, msg);
  await page.screenshot({ path: path.join(saida, 'entrada-link-1366.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.locator('.g-seg button', { hasText: /^Na casa agora/ }).first().click();
  await page.waitForTimeout(600);
  const cartao = page.locator('.g-ch-cartao', { hasText: 'Bob' }).first();
  T.ok('o cartão mostra "aceite do tutor pendente"', /Entrada conferida ✓ · aceite do tutor pendente/.test(await cartao.innerText()));

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const t = await N.contexto(larg, alt);
    await t.page.goto(`${B.BASE_URL}/gestao/entrada/${tk}`);
    await t.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const texto = await t.page.locator('body').innerText();
    T.ok(`a página do tutor mostra o resumo e o termo (${larg})`, /Como Bob chegou/.test(texto) && /Calmo/.test(texto) && /Ração/.test(texto) && /Conferi com a equipe como Bob/.test(texto), texto.slice(0, 300));
    // em 1366 a página já mostra "Aceito por Beto Lima": o nome que o próprio tutor escreveu ao aceitar
    T.ok(`sem telefone nem nome do tutor da ficha (${larg})`, !/98888-?0002/.test(texto) && (larg !== 390 || !/Beto Lima/.test(texto)));
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(t.page)) <= 0);
    if (larg === 390) {
      await t.page.locator('input[autocomplete=name]').fill('Beto Lima');
      await t.page.locator('.g-en-li input').check();
      await t.page.locator('[data-teste=li-e-concordo]').click();
      await t.page.waitForSelector('[data-teste=entrada-aceita]', { timeout: 15000 });
      T.ok('"Li e concordo" mostra "Pronto, obrigado!"', /Aceito por Beto Lima/.test(await t.page.locator('[data-teste=entrada-aceita]').innerText()));
    } else {
      T.ok('depois de aceito, a página mostra o aceite (1366)', /Aceito por Beto Lima/.test(texto));
    }
    await t.page.screenshot({ path: path.join(saida, `entrada-tutor-${larg}.png`), fullPage: true });
    T.ok(`nenhum erro na página do tutor (${larg})`, t.erros.length === 0, t.erros.slice(0, 4));
    await t.ctx.close();
  }
  T.ok('o banco guardou o aceite pelo link, com o navegador', B.sql(`select aceite || '|' || aceite_nome || '|' || (aceite_navegador is not null) from entradas where estadia_id='${est}'`) === 'link|Beto Lima|true');
  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  await page.waitForTimeout(1200);
  T.ok('o cartão mostra "aceite do tutor ✓" e "Devolver: ração"', /aceite do tutor ✓/.test(await page.locator('.g-ch-cartao', { hasText: 'Bob' }).first().innerText()) && /Devolver: ração/.test(await page.locator('.g-ch-cartao', { hasText: 'Bob' }).first().innerText()));
  await page.locator('.g-ch-cartao', { hasText: 'Bob' }).first().locator('button', { hasText: 'Check-out' }).click();
  await page.waitForTimeout(1500);
  T.ok('o check-out mostra "Devolver: ração" com a caixa', /Devolver: ração/.test(await page.locator('.g-folha').last().innerText()));
  await page.screenshot({ path: path.join(saida, 'entrada-checkout-1366.png') });
  T.ok('nenhum erro na tela (1366)', erros.length === 0, erros.slice(0, 4));
  await ctx.close();
}))();
