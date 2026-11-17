// Quadro do dia e leva e traz pela tela. 390 (tosador): Agenda › Quadro; abas com a contagem; Thor (Morde, leva e traz) em Esperando,
// "Chegou: começar o banho", secagem, tosa e "Está pronto" com o "Avisar que está pronto" (wa.me com "Já pode vir buscar", grava
// pronto_avisado_em); o leva e traz do dia (mapa, rota, "Estou chegando", dois toques em Buscado = uma viagem, Entregue em casa).
// 1366 (dona): as 5 colunas, arrastar a Mel de Esperando para No banho, Fechar a conta do Thor com "Pôr na conta · R$ 15,00",
// Meu pet shop › Taxa de leva e traz por bairro, e o Modo TV (sem botões, atualiza sozinho em 30 s) em 1366 e 390.
// Em cada tela: nenhum erro de página ou console, nenhum pedido recusado e sem rolagem para o lado. Capturas em testes/saida/quadro-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('quadro-taxi-tela');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Quadro tela' });
  const { dono } = L.sb;
  const P = L.P;
  B.sql(`update pets set alertas = 'Morde · Alergia a shampoo de coco' where id = '${L.pets.Thor}'`);
  B.sql(`update clientes set endereco = 'Rua da Ficha, 99' where id = '${L.tutores.Ana}'`);
  const marcar = async (pet, hora, o = {}) => {
    const ini = B.instante(L.hoje, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S['Banho e tosa'], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 90, ...o }).select('id').single(), 'horário ' + pet).id;
  };
  const thor = await marcar('Thor', '08:00', { leva_traz: true, endereco_leva_traz: 'Rua das Flores, 10 - Centro' });
  const mel = await marcar('Mel', '09:00', { servico_id: L.S.Banho, preco: 50, status: 'confirmado' });
  const bob = await marcar('Bob', '07:30', { status: 'em_atendimento' });
  await marcar('Luna', '07:00', { status: 'concluido' });
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'taxi.taxa': { modo: 'fixo', valor: 15, bairros: [] } } }), 'taxa');
  const linha = (id) => B.sql(`select coalesce(max(etapa),'-') || '|' || case when bool_or(entregue_em is not null) then 't' else 'f' end from quadro_atendimento where agendamento_id='${id}'`);
  const status = (id) => B.sql(`select status from agendamentos where id='${id}'`);
  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const foto = (page, nome) => page.screenshot({ path: path.join(saida, `quadro-${nome}.png`), fullPage: true });
  const semErros = (onde, erros) => { T.ok(`${onde}: nenhum erro de página, console ou pedido recusado`, erros.length === 0, erros); erros.length = 0; };
  const semLado = async (onde, page) => { const x = await N.rolagemLateral(page); T.ok(`${onde}: sem rolagem para o lado`, x <= 0, `${x}px`); };
  const esperar = async (cond, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 250)); } return cond(); };

  T.secao('celular: o tosador move o Thor pelo quadro');
  let { ctx, page, erros } = await N.contexto(390, 844);
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.tosador, L.senha);
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  T.ok('a Agenda tem os botões Quadro e Leva e traz', (await page.locator('a.g-btn', { hasText: 'Quadro' }).count()) === 1 && (await page.locator('a.g-btn', { hasText: 'Leva e traz' }).count()) === 1);
  await semLado('Agenda 390 com os botões novos', page);
  await page.locator('a.g-btn', { hasText: 'Quadro' }).click();
  await page.waitForSelector('.g-qd-abas', { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const aba = (c) => page.locator(`.g-qd-aba.${c}`);
  T.ok('as abas mostram quantos tem em cada etapa', (await aba('esperando').innerText()).includes('2') && (await aba('banho').innerText()).includes('1') && (await aba('entregue').innerText()).includes('1'), await page.locator('.g-qd-abas').innerText());
  T.ok('abre na coluna em andamento (Bob no banho)', (await aba('banho').getAttribute('aria-selected')) === 'true' && await page.locator('.g-qd-col.atual .g-qd-card', { hasText: 'Bob' }).isVisible());
  await aba('esperando').click();
  const cartao = () => page.locator('.g-qd-col.atual .g-qd-card', { hasText: 'Thor' });
  const txt = await cartao().innerText();
  T.ok('o cartão do Thor: serviço, quem faz, hora, alertas e leva e traz', /Banho e tosa/.test(txt) && /com Tito/.test(txt) && /Marcado às 08:00/.test(txt) && /Morde/.test(txt) && /Alergia a shampoo de coco/.test(txt) && /Leva e traz/.test(txt), txt);
  await semLado('Quadro 390', page);
  await foto(page, 'esperando-390');
  await cartao().locator('button', { hasText: 'Chegou: começar o banho' }).click();
  T.ok('Chegou: em atendimento e etapa banho no banco', await esperar(() => status(thor) === 'em_atendimento' && linha(thor) === 'banho|f'), linha(thor));
  await aba('banho').click();
  await cartao().locator('button', { hasText: 'Foi para a secagem' }).click();
  T.ok('secagem', await esperar(() => linha(thor) === 'secagem|f'), linha(thor));
  await aba('secando').click();
  T.ok('na secagem o cartão diz há quanto tempo chegou', /Chegou (agora|há \d+ min)/.test(await cartao().innerText()));
  await cartao().locator('button', { hasText: 'Foi para a tosa' }).click();
  T.ok('tosa (o horário tem tosa)', await esperar(() => linha(thor) === 'tosa|f'), linha(thor));
  await cartao().locator('button', { hasText: 'Está pronto' }).click();
  await page.waitForSelector('.g-folha >> text=Thor está pronto', { timeout: 10000 });
  const zap = page.locator('.g-folha a', { hasText: 'Avisar que está pronto' });
  const href = await zap.getAttribute('href');
  T.ok('o aviso de pronto abre o WhatsApp da Ana com a mensagem de sempre', /^https:\/\/wa\.me\/5511988880001\?text=/.test(href) && /J%C3%A1%20pode%20vir%20buscar/.test(href), href);
  await foto(page, 'pronto-390');
  await zap.click();
  T.ok('avisar grava pronto_avisado_em', await esperar(() => B.sql(`select pronto_avisado_em is not null from agendamentos where id='${thor}'`) === 't'));
  T.ok('pronto no banco', linha(thor) === 'pronto|f');
  await page.waitForTimeout(800);
  await aba('pronto').click();
  T.ok('o cartão em Pronto mostra "Avisado às"', /Avisado às \d\d:\d\d/.test(await cartao().innerText()));
  await semLado('Quadro 390 em Pronto', page);
  semErros('Quadro 390', erros);

  T.secao('celular: leva e traz do dia');
  await N.ir(page, '/gestao/app/agenda/leva-traz');
  const itens = page.locator('.g-lt-item');
  T.ok('duas viagens do Thor: buscar e levar de volta (pronto)', (await itens.count()) === 2 && /buscar/i.test(await itens.nth(0).innerText()) && /levar de volta[\s\S]*pronto/i.test(await itens.nth(1).innerText()), await page.locator('.g-lt-lista').innerText());
  const rota = await page.locator('a', { hasText: 'Abrir rota com todos' }).getAttribute('href');
  T.ok('rota com todos no Google Maps (cidade do pet shop junto)', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Rua%20das%20Flores/.test(rota) && /S%C3%A3o%20Paulo/.test(rota), rota);
  const mapa = await itens.nth(0).locator('a', { hasText: 'Mapa' }).getAttribute('href');
  T.ok('Mapa abre a busca do endereço do horário (não o da ficha)', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Rua%20das%20Flores%2C%2010%20-%20Centro/.test(mapa), mapa);
  const chegando = await itens.nth(0).locator('a', { hasText: 'Estou chegando' }).getAttribute('href');
  T.ok('"Estou chegando" no WhatsApp da Ana', /wa\.me\/5511988880001\?text=.*Estou%20chegando%20para%20buscar%20Thor/.test(chegando), chegando);
  T.ok('Ligar com o telefone da Ana', (await itens.nth(0).locator('a', { hasText: 'Ligar' }).getAttribute('href')) === 'tel:+5511988880001');
  await semLado('Leva e traz 390', page);
  await foto(page, 'leva-traz-390');
  await itens.nth(0).locator('button', { hasText: 'Buscado' }).dblclick();
  T.ok('dois toques em Buscado: uma viagem só', await esperar(() => B.num(`select count(*) from leva_traz_viagens where agendamento_id='${thor}' and perna='buscar'`) === 1));
  await page.waitForTimeout(1200);
  T.ok('a lista fica só com o que falta (levar de volta)', (await page.locator('.g-lt-item').count()) === 1);
  await page.locator('.g-lt-item button', { hasText: 'Entregue em casa' }).click();
  T.ok('Entregue em casa: viagem anotada e entregue no quadro', await esperar(() => B.num(`select count(*) from leva_traz_viagens where agendamento_id='${thor}'`) === 2 && linha(thor) === 'pronto|t'), linha(thor));
  await page.waitForTimeout(1000);
  await page.locator('.g-chip', { hasText: 'Todas' }).click();
  T.ok('Todas mostra a hora e quem fez', /Buscado às \d\d:\d\d por Tito/.test(await page.locator('.g-lt-lista').innerText()));
  await semLado('Leva e traz 390 com tudo feito', page);
  semErros('Leva e traz 390', erros);

  T.secao('celular: Modo TV');
  await N.ir(page, '/gestao/app/agenda/quadro?tv=1', '.g-qd-tv');
  T.ok('Modo TV em 390: sem botões de mexer', (await page.locator('.g-qd-tv .g-qd-bts').count()) === 0 && (await page.locator('.g-qd-tv .g-qd-card').count()) >= 3);
  await semLado('Modo TV 390', page);
  await foto(page, 'tv-390');
  semErros('Modo TV 390', erros);
  await ctx.close();

  T.secao('computador: a dona, arrastar, a conta e a taxa');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app/agenda/quadro', '.g-qd-colunas');
  const col = (c) => page.locator(`section.g-qd-col.${c}`);
  T.ok('as 5 colunas lado a lado', (await page.locator('section.g-qd-col:visible').count()) === 5);
  T.ok('Thor em Entregue (levado para casa), Mel esperando, Bob no banho',
    (await col('entregue').locator('.g-qd-card', { hasText: 'Thor' }).count()) === 1 && (await col('esperando').locator('.g-qd-card', { hasText: 'Mel' }).count()) === 1 && (await col('banho').locator('.g-qd-card', { hasText: 'Bob' }).count()) === 1);
  T.ok('o Thor entregue sem conta fechada avisa', /Falta fechar a conta/.test(await col('entregue').locator('.g-qd-card', { hasText: 'Thor' }).innerText()));
  await semLado('Quadro 1366', page);
  await foto(page, '1366');
  await col('esperando').locator('.g-qd-card', { hasText: 'Mel' }).dragTo(col('banho'));
  T.ok('arrastar a Mel para No banho: chegou (era confirmado)', await esperar(() => status(mel) === 'em_atendimento' && linha(mel) === 'banho|f' && B.sql(`select status_antes from quadro_atendimento where agendamento_id='${mel}'`) === 'confirmado'), linha(mel));
  await page.waitForTimeout(1000);
  await col('entregue').locator('.g-qd-card', { hasText: 'Thor' }).locator('.g-qd-quem').click();
  await page.locator('.g-folha button', { hasText: 'Fechar a conta' }).first().click({ timeout: 15000 });
  await page.waitForSelector('.g-folha >> text=Este horário tem leva e traz', { timeout: 15000 });
  await page.locator('.g-folha .g-chip', { hasText: 'Pôr na conta · R$ 15,00' }).click();
  await page.waitForTimeout(400);
  const conta = await page.locator('.g-folha').last().innerText();
  const campos = await page.locator('.g-folha').last().locator('input').evaluateAll((l) => l.map((i) => i.value));
  T.ok('Fechar a conta sugere a taxa e ela entra com um toque (90 + 15 = 105)', campos.includes('Leva e traz') && campos.includes('15,00') && /Receber R\$\s*105,00/.test(conta), { campos, conta: conta.slice(-300) });
  T.ok('a sugestão some depois de entrar', (await page.locator('.g-folha .g-chip', { hasText: 'Pôr na conta' }).count()) === 0);
  await foto(page, 'conta-1366');
  T.ok('nada foi cobrado sem tocar em Receber', B.num(`select count(*) from lancamentos where agendamento_id='${thor}'`) === 0 && B.sql(`select preco from agendamentos where id='${thor}'`) === '90.00');
  await page.keyboard.press('Escape');
  semErros('Quadro e conta 1366', erros);

  await N.ir(page, '/gestao/app/meu-petshop#opcoes-leva-traz');
  const card = page.locator('#opcoes-leva-traz');
  await card.waitFor({ timeout: 15000 });
  T.ok('Meu pet shop mostra a Taxa de leva e traz', /Taxa de leva e traz/.test(await card.innerText()));
  await card.locator('button', { hasText: 'Por bairro' }).click();
  await card.locator('input[aria-label="Bairro 1"]').fill('Centro');
  await card.locator('input[aria-label="Valor de Centro"]').fill('12,00');
  await card.locator('button', { hasText: 'Mais um bairro' }).click();
  await card.locator('input[aria-label="Bairro 2"]').fill('Jardim América');
  await card.locator('input[aria-label="Valor de Jardim América"]').fill('18,50');
  await card.locator('button', { hasText: 'Salvar a taxa' }).click();
  T.ok('a taxa por bairro fica nas opções', await esperar(() => B.sql(`select opcoes->'taxi.taxa' from petshops where id='${P}'`).replace(/\s/g, '') === '{"modo":"bairro","valor":15,"bairros":[{"nome":"Centro","valor":12},{"nome":"JardimAmérica","valor":18.5}]}'),
    B.sql(`select opcoes->'taxi.taxa' from petshops where id='${P}'`));
  await semLado('Meu pet shop 1366', page);
  semErros('Meu pet shop 1366', erros);

  T.secao('computador: Modo TV');
  await N.ir(page, '/gestao/app/agenda/quadro?tv=1', '.g-qd-tv');
  T.ok('Modo TV: nome do pet shop, hora e sem botões de mexer', (await page.locator('.g-qd-tv-topo h1').innerText()).includes('Quadro tela') && (await page.locator('.g-qd-tv .g-qd-bts').count()) === 0 && (await page.locator('.g-qd-tv .g-qd-quem button, .g-qd-tv button.g-qd-quem').count()) === 0);
  T.ok('o Modo TV cobre o menu', await page.evaluate(() => { const r = document.querySelector('.g-qd-tv').getBoundingClientRect(); return r.left === 0 && r.top === 0 && r.width >= window.innerWidth - 1; }));
  await semLado('Modo TV 1366', page);
  await foto(page, 'tv-1366');
  B.must(await dono.rpc('quadro_mover', { p_petshop: P, p_agendamento: bob, p_para: 'pronto' }), 'Bob pronto por outro aparelho');
  T.ok('o Modo TV se atualiza sozinho (Bob aparece em Pronto em até 35 s)', await page.locator('section.g-qd-col.pronto .g-qd-card', { hasText: 'Bob' }).waitFor({ timeout: 36000 }).then(() => true, () => false));
  await foto(page, 'tv-1366-depois');
  semErros('Modo TV 1366', erros);
  await ctx.close();
  await N.fecharNavegador();
}))();
