// Segunda rodada no site real (Rafael): porta da creche e do hotel quando o servidor demora.
//  - check-out: o banco responde "canceling statement due to statement timeout" (como no site): a tela diz que demorou, sem o
//    texto em inglês; a nova tentativa fecha a conta uma vez só (mesma chave). 390.
//  - entrada com foto: a foto não sobe (o envio falha 3 vezes): a entrada é salva sem ela, a folha avisa e a foto continua lá com
//    "Tentar de novo"; com a internet de volta, a foto sobe e entra na entrada. 390.
//  - Relatórios numa loja só de creche: "Quanto sobrou" com as mensalidades (sem "Nenhum serviço recebido"). 390 e 1366.
// Capturas em testes/saida/rodada2-h-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('rodada2-h-tela');

async function fotoDeCanvas(page) {
  const b64 = await page.evaluate(() => {
    const t = document.createElement('canvas'); t.width = 800; t.height = 600;
    const g = t.getContext('2d'); g.fillStyle = '#7fb3d5'; g.fillRect(0, 0, 800, 600);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(400, 320, 160, 0, Math.PI * 2); g.fill();
    return t.toDataURL('image/jpeg', 0.9).split(',')[1];
  });
  return { name: 'pata.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Rodada 2 H tela' });
  const { dono } = L.sb;
  const P = L.P;
  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');

  T.secao('check-out: tempo esgotado do banco');
  const ontem = B.instante(B.somaDias(L.hoje, -1), '12:00', L.fuso).toISOString();
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', status: 'em_casa', entrada: ontem, valor_diaria: 130 }).select('id').single(), 'hóspede');
  const entradas = () => B.num(`select count(*) from lancamentos where petshop_id='${P}' and tipo='entrada' and descricao like 'Hotel:%Rex%'`);
  let { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.caixa, L.senha);
  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  let vezes = 0;
  await page.route('**/rest/v1/rpc/estadia_checkout', async (r) => {
    vezes++;
    if (vezes === 1) return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' }) });
    return r.continue();
  });
  await page.locator('.g-ch-cartao', { hasText: 'Rex' }).first().locator('button', { hasText: 'Check-out' }).click();
  let folha = page.locator('.g-folha').last();
  await folha.locator('button.g-btn.pri', { hasText: 'Receber R$' }).waitFor({ timeout: 15000 });
  await folha.locator('.g-chips button, button.g-chip', { hasText: 'Pix' }).first().click();
  await page.waitForTimeout(300);
  await folha.locator('button.g-btn.pri', { hasText: 'Receber' }).click();
  const toast = page.locator('.g-toast.erro').last();
  await toast.waitFor({ timeout: 15000 });
  const msg = (await toast.innerText()).replace(/ /g, ' ');
  await page.screenshot({ path: path.join(saida, 'rodada2-h-checkout-demorou-390.png') });
  T.ok('a tela diz que demorou e que não cobra duas vezes, sem o texto do banco', /demorou demais/.test(msg) && /não cobra duas vezes/.test(msg) && !/canceling|statement|timeout/i.test(msg), msg);
  T.ok('nada foi lançado na tentativa que falhou', entradas() === 0);
  await folha.locator('button.g-btn.pri', { hasText: 'Receber' }).click();
  await page.locator('.g-folha', { hasText: 'Conta fechada' }).waitFor({ timeout: 15000 });
  T.ok('a nova tentativa fecha a conta: 1 entrada só', entradas() === 1, entradas());
  T.ok('sem erro no navegador (fora o 500 de propósito)', !erros.filter((e) => !/rpc\/estadia_checkout/.test(e)).length, erros);
  await ctx.close();

  T.secao('entrada com foto: o envio da foto falha');
  const dezAnos = `${Number(L.hoje.slice(0, 4)) - 10}${L.hoje.slice(4)}`;
  B.sql(`update pets set nascimento = '${dezAnos}' where id = '${L.pets.Thor}'`);
  const ini = B.instante(L.hoje, '10:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString() }).select('id').single(), 'horário').id;
  ({ ctx, page, erros } = await N.contexto(390, 844));
  await N.entrar(page, L.emails.caixa, L.senha);
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Thor' }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('.g-folha').last().locator('button', { hasText: 'Chegou: iniciar atendimento' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.g-folha')].some((f) => /Entrada · Thor/.test(f.textContent ?? '') && f.querySelector('textarea')), null, { timeout: 15000 });
  folha = page.locator('.g-folha').last();
  // o envio da foto falha sempre (como o 544 do site)
  let envios = 0;
  await page.route('**/storage/v1/object/entrada/**', (r) => { envios++; return r.fulfill({ status: 544, contentType: 'application/json', body: '{"statusCode":"544","error":"Gateway Timeout","message":"timeout"}' }); });
  await folha.locator('button.g-chip', { hasText: 'Calmo' }).first().click();
  await folha.locator('[data-teste=fotos-da-entrada]').setInputFiles([await fotoDeCanvas(page)]);
  await folha.locator('[data-teste=foto-tentar-de-novo]').waitFor({ timeout: 30000 });
  T.ok('a foto que não subiu continua na folha, com "Tentar de novo" (3 tentativas)', (await folha.locator('.g-bol-fotos img').count()) === 1 && envios === 3, envios);
  await folha.locator('[data-teste=salvar-entrada]').click();
  await folha.locator('[data-teste=aviso-entrada]').waitFor({ timeout: 30000 });
  const aviso = (await folha.locator('[data-teste=aviso-entrada]').innerText()).replace(/ /g, ' ');
  await page.screenshot({ path: path.join(saida, 'rodada2-h-entrada-foto-390.png'), fullPage: true });
  T.ok('salvou sem a foto e avisa na folha: "1 foto não subiu… Tentar de novo"', /A entrada foi salva, mas 1 foto não subiu/.test(aviso) && /Tentar de novo/.test(aviso), aviso);
  const fotos = () => B.num(`select coalesce(cardinality(fotos), 0) from entradas where agendamento_id='${ag}'`);
  T.ok('a entrada está no banco (sem a foto)', B.num(`select count(*) from entradas where agendamento_id='${ag}'`) === 1 && fotos() === 0);
  T.ok('a foto continua na folha', (await folha.locator('.g-bol-fotos img').count()) === 1);
  await page.unroute('**/storage/v1/object/entrada/**');
  await folha.locator('[data-teste=foto-tentar-de-novo]').click();
  await page.waitForFunction(() => !document.querySelector('.g-folha .g-bol-fotos li.pendente'), null, { timeout: 30000 });
  await folha.locator('[data-teste=salvar-entrada]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.g-folha')].some((f) => /Aceite do tutor · Thor/.test(f.textContent ?? '')), null, { timeout: 20000 });
  T.ok('com a internet de volta, a foto sobe e entra na entrada; segue para o aceite', fotos() === 1, fotos());
  T.ok('sem erro no navegador', !erros.filter((e) => !/544|Failed to load resource/.test(e)).length, erros);
  await ctx.close();

  T.secao('Relatórios numa creche só: Quanto sobrou com as mensalidades');
  B.sql(`update petshops set modulos = array['creche'], principal = 'creche' where id='${P}'`);
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, pago, data, forma) values ('${P}', 'entrada', 1190, 'Creche: mensalidade', 'Mensalidade · Bob', true, '${L.hoje}', 'pix')`);
  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    ({ ctx, page, erros } = await N.contexto(larg, alt));
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/relatorios');
    const qs = page.locator('#quanto-sobrou');
    await qs.locator('text=Creche: mensalidades').first().waitFor({ timeout: 20000 });
    const txt = (await qs.innerText()).replace(/ /g, ' ');
    await qs.screenshot({ path: path.join(saida, `rodada2-h-quanto-sobrou-${larg}.png`) });
    T.ok(`${larg}: a linha "Creche: mensalidades" com R$ 1.190,00, sem "Nenhum serviço recebido" nem "falta informar os custos"`,
      /Creche: mensalidades/.test(txt) && /1\.190,00/.test(txt) && !/Nenhum serviço recebido/.test(txt) && !/falta informar os custos/.test(txt), txt.slice(0, 500));
    T.ok(`${larg}: sem rolagem para o lado`, (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
}))();
