// Leva e traz e promoção em dias fracos na creche e no hotel, pela tela (servidor no ar).
// 390 (monitora, só Creche e hotel): o botão "Leva e traz (2)" na Creche e hotel, os cartões com "Leva e traz" e "Promoção", a lista
// do dia (estadias, sem os horários da Agenda): buscar o Rex (hotel) com dois toques = uma viagem e "Entregue em casa" o Thor (creche);
// nova reserva de hotel da Luna com "Buscar em casa" e o endereço do tutor já preenchido.
// 1366 (dona): check-out do Thor com a linha da promoção (−15% da diária) e a taxa de leva e traz sugerida (Pôr na conta), tirar e pôr
// de volta a promoção, receber (o desconto vai para promo_usos); Meu pet shop › Nova promoção só do hotel ("Onde vale").
// 390 (cliente): o link mostra a promoção na Creche.
// Em cada tela: nenhum erro de página ou console, nenhum pedido recusado e sem rolagem para o lado. Capturas em testes/saida/casa-taxi-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('casa-taxi-promo-tela');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Casa taxi tela', modulos: ['creche', 'hotel', 'banho_tosa', 'loja'] });
  const { dono } = L.sb;
  const P = L.P;
  B.sql(`update clientes set endereco = 'Rua das Flores, 10 - Centro' where id = '${L.tutores.Ana}'`);
  B.sql(`update clientes set endereco = 'Rua da Ficha, 99' where id = '${L.tutores.Clara}'`);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'taxi.taxa': { modo: 'fixo', valor: 15, bairros: [] } } }), 'taxa');
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');
  // a promoção da creche no dia de hoje (antes das estadias)
  const DOW = B.diaDaSemana(L.hoje);
  B.must(await dono.rpc('promocao_salvar', { p: P, p_id: null, p_dados: { nome: 'Dia da creche', dias: [DOW], servicos: [], tipo: 'pct', valor: 15, ativa: true, banho_tosa: false, casa: ['creche'] } }), 'promoção');
  const thor = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Thor, tipo: 'creche', status: 'em_casa', entrada: B.instante(L.hoje, '07:30', L.fuso).toISOString(), valor_diaria: 70, leva_traz_levar: true }).select('id, promo').single(), 'Thor na creche');
  T.ok('o Thor (creche de hoje) ganhou a promoção', thor.promo?.nome === 'Dia da creche', thor.promo);
  const rex = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', status: 'reservada', entrada: B.instante(L.hoje, '23:00', L.fuso).toISOString(),
    saida_prevista: B.instante(L.dia(2), '12:00', L.fuso).toISOString(), valor_diaria: 120, leva_traz_buscar: true, endereco_leva_traz: 'Av. Brasil, 500 - Jardim' }).select('id').single(), 'Rex no hotel').id;
  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const foto = (page, nome, cheia = true) => page.screenshot({ path: path.join(saida, `casa-taxi-${nome}.png`), fullPage: cheia }).catch(() => {});
  const semErros = (onde, erros) => { T.ok(`${onde}: nenhum erro de página, console ou pedido recusado`, erros.length === 0, erros); erros.length = 0; };
  const semLado = async (onde, page) => { const x = await N.rolagemLateral(page); T.ok(`${onde}: sem rolagem para o lado`, x <= 0, `${x}px`); };
  const esperar = async (cond, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 250)); } return cond(); };
  const txt = async (l) => (await l.innerText()).replace(/\u00a0/g, ' ');

  T.secao('390: a monitora e o leva e traz da creche e do hotel');
  let { ctx, page, erros } = await N.contexto(390, 844);
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.monitor, L.senha);
  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  const botao = page.locator('a.g-btn', { hasText: 'Leva e traz' });
  await botao.waitFor({ timeout: 15000 });
  T.ok('a Creche e hotel mostra "Leva e traz (2)"', /Leva e traz \(2\)/.test(await txt(botao)), await txt(botao));
  const cartao = page.locator('.g-ch-cartao', { hasText: 'Thor' }).first();
  T.ok('o cartão do Thor diz o leva e traz e a promoção', /Leva e traz: levar de volta/.test(await txt(cartao)) && /Promoção Dia da creche \(15% na diária da creche\)/.test(await txt(cartao)), await txt(cartao));
  await semLado('Creche e hotel 390', page);
  await foto(page, 'casa-390', false);
  await cartao.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await foto(page, 'cartao-390', false);
  semErros('Creche e hotel 390', erros);

  await botao.click();
  await page.waitForURL(/creche-hotel\/leva-traz/, { timeout: 15000 });
  const itens = page.locator('.g-lt-item');
  await itens.first().waitFor({ timeout: 15000 });
  const lista = await txt(page.locator('.g-lt-lista'));
  T.ok('a lista tem o Thor (levar de volta, saída de hoje) e o Rex (buscar, hotel)', (await itens.count()) === 2 && /Levar de volta[\s\S]*Thor[\s\S]*Creche/i.test(lista) && /Buscar[\s\S]*Rex[\s\S]*Hotel/i.test(lista), lista);
  T.ok('o endereço do Thor vem da ficha da Ana; o do Rex, da reserva', /Rua das Flores, 10 - Centro/.test(lista) && /Av\. Brasil, 500 - Jardim/.test(lista));
  T.ok('o botão de voltar leva para a Creche e hotel', (await page.locator('a.g-btn', { hasText: 'Creche e hotel' }).getAttribute('href')) === '/gestao/app/creche-hotel');
  await semLado('Leva e traz 390', page);
  await page.waitForTimeout(900);
  await foto(page, 'leva-traz-390', false);
  await page.locator('.g-lt-item', { hasText: 'Rex' }).locator('button', { hasText: 'Buscado' }).dblclick();
  T.ok('dois toques em Buscado: uma viagem só', await esperar(() => B.num(`select count(*) from leva_traz_estadias where estadia_id='${rex}' and perna='buscar'`) === 1));
  await page.waitForTimeout(1200);
  await page.locator('.g-lt-item', { hasText: 'Thor' }).locator('button', { hasText: 'Entregue em casa' }).click();
  T.ok('Entregue em casa do Thor: viagem anotada, sem check-out', await esperar(() => B.num(`select count(*) from leva_traz_estadias where estadia_id='${thor.id}' and perna='levar'`) === 1)
    && B.sql(`select status from estadias where id='${thor.id}'`) === 'em_casa');
  await page.waitForTimeout(1000);
  await page.locator('.g-chip', { hasText: 'Todas' }).click();
  T.ok('Todas mostra a hora e quem fez', /Buscado às \d\d:\d\d por Mário/.test(await txt(page.locator('.g-lt-lista'))));
  await semLado('Leva e traz 390 com tudo feito', page);
  semErros('Leva e traz 390', erros);

  T.secao('390: nova reserva com leva e traz');
  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  await page.locator('button', { hasText: 'Nova reserva / Check-in' }).first().click();
  let folha = page.locator('.g-folha').last();
  await folha.locator('input[placeholder="Nome do pet ou do tutor"]').fill('Luna');
  await folha.locator('button.g-linha', { hasText: 'Luna' }).first().click();
  await folha.locator('.g-chip', { hasText: 'Hotel' }).first().click();
  await folha.locator('.g-seg button', { hasText: 'Reservar para outro dia' }).click();
  await folha.locator('input[type="date"]').first().fill(L.dia(3));
  await folha.locator('input[type="date"]').nth(1).fill(L.dia(5));
  await page.waitForTimeout(500);
  await folha.locator('label', { hasText: 'Buscar em casa' }).click();
  const end = folha.locator('.g-ch-lt input.g-input');
  await end.waitFor({ timeout: 5000 });
  await page.waitForTimeout(300);
  T.ok('marcar Buscar em casa traz o endereço da Clara', (await end.inputValue()) === 'Rua da Ficha, 99', await end.inputValue());
  await semLado('Nova reserva 390 com leva e traz', page);
  await folha.locator('.g-ch-lt').scrollIntoViewIfNeeded();
  await foto(page, 'reserva-390', false);
  await folha.locator('button.g-btn.pri', { hasText: 'Marcar reserva' }).click();
  await folha.waitFor({ state: 'detached', timeout: 15000 });
  T.ok('a reserva da Luna tem buscar, não levar, e o endereço', await esperar(() => B.sql(`select leva_traz_buscar || '|' || leva_traz_levar || '|' || coalesce(endereco_leva_traz, '-') from estadias where petshop_id='${P}' and pet_id='${L.pets.Luna}'`) === 'true|false|Rua da Ficha, 99'),
    B.sql(`select leva_traz_buscar || '|' || leva_traz_levar || '|' || coalesce(endereco_leva_traz, '-') from estadias where petshop_id='${P}' and pet_id='${L.pets.Luna}'`));
  semErros('Nova reserva 390', erros);
  await ctx.close();

  T.secao('1366: a dona faz o check-out do Thor');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  await page.locator('.g-ch-cartao', { hasText: 'Thor' }).first().locator('button', { hasText: 'Check-out' }).click();
  folha = page.locator('.g-folha').last();
  await folha.locator('button.g-btn.pri', { hasText: 'Receber' }).waitFor({ timeout: 15000 });
  let corpo = await txt(folha);
  T.ok('a conta mostra a linha da promoção (−15%, − R$ 10,50) e a taxa de leva e traz sugerida', /Promoção Dia da creche −15%[\s\S]*− R\$ 10,50/.test(corpo) && /Esta estadia tem leva e traz \(só levar\): taxa de R\$ 15,00/.test(corpo), corpo.slice(0, 900));
  T.ok('a taxa não entrou sozinha: Receber R$ 59,50', /Receber R\$ 59,50/.test(await txt(folha.locator('button.g-btn.pri'))), await txt(folha.locator('button.g-btn.pri')));
  await folha.locator('.g-chip', { hasText: 'Pôr na conta · R$ 15,00' }).click();
  await folha.locator('button.g-btn.pri', { hasText: 'Receber R$ 74,50' }).waitFor({ timeout: 5000 });
  T.ok('Pôr na conta: 70 − 10,50 + 15 = R$ 74,50', true);
  await folha.locator('.g-promo-linha button', { hasText: 'Tirar' }).click();
  await page.getByRole('button', { name: 'Tirar a promoção', exact: true }).click();
  await folha.locator('button.g-btn.pri', { hasText: 'Receber R$ 85,00' }).waitFor({ timeout: 8000 });
  T.ok('tirar a promoção: R$ 85,00, e fica anotado na estadia', B.sql(`select promo->>'tirada' from estadias where id='${thor.id}'`) === 'true');
  await folha.locator('.g-promo-linha button', { hasText: 'Pôr de volta' }).click();
  await folha.locator('button.g-btn.pri', { hasText: 'Receber R$ 74,50' }).waitFor({ timeout: 8000 });
  T.ok('pôr de volta: R$ 74,50 de novo', B.sql(`select coalesce(promo->>'tirada', '-') from estadias where id='${thor.id}'`) === '-');
  corpo = await txt(folha);
  T.ok('o resumo da conta tem as linhas: diárias, promoção e leva e traz', /Diárias \(1\)\s*R\$ 70,00[\s\S]*Promoção Dia da creche\s*- R\$ 10,50[\s\S]*Leva e traz\s*R\$ 15,00[\s\S]*Total da estadia\s*R\$ 74,50/.test(corpo), corpo.slice(-700));
  await semLado('Check-out 1366', page);
  await foto(page, 'checkout-1366', false);
  await folha.locator('button.g-chip', { hasText: 'Pix' }).first().click();
  await folha.locator('button.g-btn.pri', { hasText: 'Receber R$ 74,50' }).dblclick();
  await page.locator('.g-folha', { hasText: 'Conta fechada' }).waitFor({ timeout: 15000 });
  T.ok('dois cliques: uma entrada de R$ 74,50, com a linha da promoção', await esperar(() => B.sql(`select count(*) || '|' || max(valor) from lancamentos where petshop_id='${P}' and tipo='entrada' and categoria='Creche e hotel'`) === '1|74.50')
    && /Promoção Dia da creche/.test(B.sql(`select itens::text from lancamentos where petshop_id='${P}' and tipo='entrada' and categoria='Creche e hotel'`)));
  T.ok('o desconto da promoção foi para promo_usos (R$ 10,50)', await esperar(() => B.sql(`select coalesce(max(desconto)::text, '-') from promo_usos where estadia_id='${thor.id}'`) === '10.50'));
  const comp = decodeURIComponent((await page.locator('.g-folha', { hasText: 'Conta fechada' }).locator('a', { hasText: 'Mandar comprovante' }).getAttribute('href')) ?? '').replace(/\u00a0/g, ' ');
  T.ok('o comprovante do WhatsApp leva a linha da promoção e a do leva e traz', /Promoção Dia da creche -15% \(\d\d\/\d\d\): - R\$ 10,50/.test(comp) && /Leva e traz: R\$ 15,00/.test(comp), comp);
  await semLado('Conta fechada 1366', page);
  await foto(page, 'conta-fechada-1366', false);
  await page.keyboard.press('Escape');
  semErros('Check-out 1366', erros);

  T.secao('1366: promoção só do hotel em Meu pet shop');
  await N.ir(page, '/gestao/app/meu-petshop#promocoes');
  const card = page.locator('#promocoes');
  await card.waitFor({ timeout: 15000 });
  T.ok('a lista diz onde a promoção vale', /Dia da creche[\s\S]*15% de desconto na diária da creche/.test(await txt(card)), await txt(card));
  await card.locator('button', { hasText: 'Nova promoção' }).click();
  folha = page.locator('.g-folha').last();
  await folha.locator('input.g-input').first().fill('Noite tranquila');
  T.ok('"Onde vale" com Banho e tosa, Creche (diária) e Hotel (diária)', (await folha.locator('[aria-labelledby="promo-onde"] .g-chip').count()) === 3);
  await folha.locator('[aria-labelledby="promo-onde"] .g-chip', { hasText: 'Banho e tosa' }).click();
  await folha.locator('[aria-labelledby="promo-onde"] .g-chip', { hasText: 'Hotel (diária)' }).click();
  T.ok('sem banho e tosa, somem o horário e os serviços', (await folha.locator('text=Em que horário').count()) === 0 && (await folha.locator('#promo-serv').count()) === 0);
  T.ok('o texto explica a noite por noite', /em cada noite do hotel nos dias escolhidos/.test(await txt(folha)));
  await semLado('Nova promoção 1366', page);
  await foto(page, 'promo-form-1366', false);
  await folha.locator('button.g-btn.pri', { hasText: 'Salvar' }).click();
  T.ok('salva só do hotel', await esperar(() => B.sql(`select banho_tosa || '|' || array_to_string(casa, ',') from promocoes where petshop_id='${P}' and nome='Noite tranquila'`) === 'false|hotel'));
  semErros('Meu pet shop 1366', erros);
  await ctx.close();

  T.secao('390: o link do cliente mostra a promoção da creche');
  ({ ctx, page, erros } = await N.contexto(390, 844));
  await N.ir(page, `/gestao/agendar/${L.codigo}`, '.g-lk');
  const creche = page.locator('button.g-lk-serv', { hasText: 'Creche' }).first();
  await creche.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  const tCreche = await txt(creche);
  T.ok('o botão da Creche mostra "15% off na diária"', /15% off na diária/.test(tCreche), tCreche);
  T.ok('sem preço riscado nem "últimas vagas"', !/últim|só hoje|corra/i.test(await txt(page.locator('body'))) && (await page.locator('s, del').count()) === 0);
  await semLado('Link 390', page);
  await foto(page, 'link-390', false);
  await creche.click();
  await page.waitForTimeout(800);
  T.ok('a página da creche diz a promoção', /Promoção Dia da creche: 15% off na diária \(/.test(await txt(page.locator('body'))));
  await semLado('Link creche 390', page);
  await page.waitForTimeout(600);
  await foto(page, 'link-creche-390', false);
  semErros('Link 390', erros);
  await ctx.close();
  await N.fecharNavegador();
}))();
