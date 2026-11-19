// Modo envio pela tela (migração 20261198), em 390 e 1366, com a dona.
// A loja tem 3 mensagens prontas: lembrete de amanhã do Thor e da Mel (Ana, uma mensagem), a cobrança dos R$ 35 da Ana e o
// aniversário da Mel; a Luna (amanhã) é da Clara, que não quer receber mensagens. 390: a tela Hoje mostra "Mandar 3 mensagens";
// a tela mostra as contagens com interruptores (desligar o aniversário: "Começar: 2"), quem ficou de fora e por quê; uma por vez
// ("1 de 3"), texto mudado vai no link do WhatsApp; ao abrir, a pergunta só vem quando a pessoa volta para a aba (sai e volta
// simulados); "Sim, próxima" grava o lembrete_em; "Pular"; "Não enviou" deixa na mesma; fim com 2 enviadas e 1 para depois.
// 1366: só a cobrança sobrou; teclado (Enter abre, S = sim); cobrado_em e o registro com quem mandou; a ficha da Clara mostra
// "Não quer receber mensagens". Nada é enviado sozinho: sem abrir o WhatsApp, nada é marcado. Sem rolagem para o lado, sem erro.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('modo-envio-tela');

const SAIDA = path.join(__dirname, '..', 'saida');

/** Simula a pessoa indo para o WhatsApp (aba escondida) e voltando. */
async function sairEVoltar(page) {
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Envio tela' });
  const { dono } = L.sb;
  const P = L.P;
  fs.mkdirSync(SAIDA, { recursive: true });
  const foto = async (page, nome) => { await page.waitForTimeout(700); return page.screenshot({ path: path.join(SAIDA, `modo-envio-${nome}.png`), fullPage: true }); };
  const ag = async (pet, hora) => {
    const ini = B.instante(L.dia(1), hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: pet, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  };
  const aThor = await ag(L.pets.Thor, '09:00'), aMel = await ag(L.pets.Mel, '10:00');
  await ag(L.pets.Luna, '11:00');
  B.must(await dono.from('clientes').update({ nao_quer_mensagens: true }).eq('id', L.tutores.Clara).select('id'), 'Clara não quer');
  const conta = B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem)
         values ('${P}', 'entrada', 35, 'Banho e tosa', 'Banho', '${L.dia(-3)}', '${L.dia(-1)}', false, '${L.tutores.Ana}', 'tela') returning id`).split('\n')[0];
  B.sql(`update pets set nascimento = ('${L.hoje}'::date - interval '3 years')::date, sexo = 'F' where id = '${L.pets.Mel}'`);

  T.secao('celular (390)');
  let { ctx, page, erros } = await N.contexto(390, 844);
  const abertos = [];
  await ctx.route('https://wa.me/**', (r) => { abertos.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }); });
  ctx.on('page', (p) => { void p.waitForLoadState().then(() => p.close()).catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);
  const entrada = page.locator('.g-me-entrada');
  await entrada.waitFor({ timeout: 30000 });
  T.ok('Hoje mostra "Mandar 3 mensagens" com o que é cada uma', /Mandar 3 mensagens/.test(await entrada.innerText()) && /Lembrete/.test(await entrada.innerText()), await entrada.innerText());
  await foto(page, '390-hoje');
  await entrada.click();
  await page.waitForURL('**/gestao/app/mensagens');
  await page.locator('.g-me-tipos').waitFor({ timeout: 30000 });
  const chaves = page.locator('.g-me-chave');
  T.ok('três tipos, todos ligados', (await chaves.count()) === 3 && (await page.locator('.g-me-chave[aria-checked=true]').count()) === 3);
  T.ok('quem ficou de fora: 1 (Clara, não quer receber mensagens)', /1 ficou de fora/.test(await page.locator('.g-me-pulados summary').innerText()));
  await page.locator('.g-me-pulados summary').click();
  T.ok('… com o motivo', /Clara Dias[\s\S]*não quer receber mensagens/.test(await page.locator('.g-me-pulados').innerText()));
  await page.locator('.g-me-chave[aria-label^="Aniversário"]').click();
  const comecar = page.locator('.g-me-comecar');
  T.ok('desligar o aniversário: "Começar: 2 mensagens"', /Começar: 2 mensagens/.test(await comecar.innerText()), await comecar.innerText());
  await page.locator('.g-me-chave[aria-label^="Aniversário"]').click();
  T.ok('ligar de novo: "Começar: 3 mensagens"', /Começar: 3 mensagens/.test(await comecar.innerText()));
  T.ok('sem rolagem para o lado (lista)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '390-lista');
  await comecar.click();

  const progresso = page.locator('.g-me-progresso');
  await progresso.waitFor();
  T.ok('"1 de 3": o lembrete da Ana, com Thor e Mel', /1 de 3/.test(await progresso.innerText()) && /Ana Souza/.test(await page.locator('.g-me-msg h2').innerText()) && /Thor[\s\S]*Mel/.test(await page.locator('.g-me-msg textarea').inputValue()));
  const caixaTexto = page.locator('.g-me-msg textarea');
  await caixaTexto.fill((await caixaTexto.inputValue()) + ' Obrigada!');
  const href = await page.locator('.g-me-abrir').getAttribute('href');
  T.ok('o texto mudado vai no link do WhatsApp (wa.me com o número da Ana)', href.startsWith('https://wa.me/5511988880001?text=') && decodeURIComponent(href.split('text=')[1]).endsWith('Até lá! Obrigada!'), href);
  await foto(page, '390-mensagem');
  await page.locator('.g-me-abrir').click();
  await page.waitForTimeout(500);
  T.ok('abriu o WhatsApp uma vez', abertos.length === 1, abertos);
  T.ok('enquanto a pessoa não volta, a tela não pergunta nem marca nada', !(await page.locator('.g-me-pergunta').count()) && B.num(`select count(*) from agendamentos where id in ('${aThor}', '${aMel}') and lembrete_em is not null`) === 0);
  await sairEVoltar(page);
  const pergunta = page.locator('.g-me-pergunta');
  await pergunta.waitFor({ timeout: 5000 });
  T.ok('voltou para a aba: "Enviou a mensagem para Ana?"', /Enviou a mensagem para Ana\?/.test(await pergunta.innerText()));
  await foto(page, '390-enviou');
  await pergunta.locator('button', { hasText: 'Sim, próxima' }).click();
  await page.locator('.g-me-progresso', { hasText: '2 de 3' }).waitFor({ timeout: 10000 });
  T.ok('"Sim, próxima": lembrete_em nos dois horários e "2 de 3"', B.num(`select count(*) from agendamentos where id in ('${aThor}', '${aMel}') and lembrete_em is not null`) === 2);
  const cobr = (await caixaTexto.inputValue()).replace(/\s+/g, ' ');
  T.ok('2 de 3: a cobrança da Ana com o total', /Cobrança/i.test(await page.locator('.g-me-msg').innerText()) && /R\$ 35,00/.test(cobr), cobr);
  await page.locator('.g-me-acoes button', { hasText: 'Pular' }).click();
  await page.locator('.g-me-progresso', { hasText: '3 de 3' }).waitFor({ timeout: 5000 });
  T.ok('"Pular": a cobrança não foi marcada', B.num(`select count(*) from lancamentos where id='${conta}' and cobrado_em is not null`) === 0);
  T.ok('3 de 3: o aniversário da Mel', /Aniversário/i.test(await page.locator('.g-me-msg').innerText()));
  await page.locator('.g-me-abrir').click();
  await sairEVoltar(page);
  await pergunta.waitFor({ timeout: 5000 });
  await pergunta.locator('button', { hasText: 'Não enviou' }).click();
  T.ok('"Não enviou": continua na mesma, com o botão do WhatsApp, e nada marcado', /3 de 3/.test(await progresso.innerText()) && await page.locator('.g-me-abrir').isVisible()
    && B.num(`select count(*) from mensagens_enviadas where petshop_id='${P}' and tipo='niver'`) === 0);
  await page.locator('.g-me-abrir').click();
  await sairEVoltar(page);
  await pergunta.waitFor({ timeout: 5000 });
  await pergunta.locator('button', { hasText: 'Sim, terminar' }).click();
  const fim = page.locator('.g-me-fim');
  await fim.waitFor({ timeout: 10000 });
  T.ok('fim: 2 enviadas e 1 para depois', /2 mensagens enviadas/.test(await fim.innerText()) && /1 ficou para depois/.test(await fim.innerText()), await fim.innerText());
  T.ok('o aniversário ficou no registro, com quem mandou', B.num(`select count(*) from mensagens_enviadas where petshop_id='${P}' and tipo='niver' and enviado_por='${L.ids.dono}'`) === 1);
  T.ok('sem rolagem para o lado (fim)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '390-fim');
  T.ok('nenhum erro na página (390)', erros.length === 0, erros);
  await ctx.close();

  T.secao('computador (1366)');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  abertos.length = 0;
  await ctx.route('https://wa.me/**', (r) => { abertos.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>WhatsApp</p>' }); });
  ctx.on('page', (p) => { void p.waitForLoadState().then(() => p.close()).catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);
  T.ok('o menu tem "Mandar mensagens"', await page.locator('.g-lado a[href="/gestao/app/mensagens"]').count() > 0);
  await N.ir(page, '/gestao/app/mensagens', '.g-me-tipos');
  T.ok('sobrou só a cobrança (o lembrete e o aniversário já foram)', (await page.locator('.g-me-chave').count()) === 1 && /Cobrança/.test(await page.locator('.g-me-tipos').innerText()));
  await page.locator('.g-me-comecar').click();
  await page.locator('.g-me-abrir').waitFor();
  T.ok('"1 de 1" e o botão do WhatsApp com o foco', /1 de 1/.test(await page.locator('.g-me-progresso').innerText()) && await page.evaluate(() => document.activeElement?.classList.contains('g-me-abrir')));
  T.ok('o atalho do teclado aparece no computador', await page.locator('.g-me-teclas').first().isVisible());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  T.ok('Enter abre o WhatsApp', abertos.length === 1, abertos);
  await page.bringToFront();
  await sairEVoltar(page);
  await page.locator('.g-me-pergunta').waitFor({ timeout: 5000 });
  await foto(page, '1366-enviou');
  await page.keyboard.press('s');
  await page.locator('.g-me-fim').waitFor({ timeout: 10000 });
  T.ok('S = sim: cobrado_em gravado (o mesmo do "Cobrar no WhatsApp") e o registro', B.num(`select count(*) from lancamentos where id='${conta}' and cobrado_em is not null`) === 1
    && B.num(`select count(*) from mensagens_enviadas where petshop_id='${P}' and tipo='cobranca' and enviado_por='${L.ids.dono}'`) === 1);
  T.ok('fim: 1 mensagem enviada', /1 mensagem enviada/.test(await page.locator('.g-me-fim').innerText()));
  await foto(page, '1366-fim');
  await N.ir(page, `/gestao/app/clientes?cliente=${L.tutores.Clara}`, '.g-cli-heroi');
  T.ok('a ficha da Clara mostra "Não quer receber mensagens"', /Não quer receber mensagens/.test(await page.locator('.g-cli-heroi').innerText()));
  await page.locator('.g-cli-heroi button', { hasText: 'Editar' }).click();
  const marca = page.locator('label.g-check', { hasText: 'Não quer receber mensagens' }).locator('input');
  await marca.waitFor();
  T.ok('… e o formulário do tutor traz a caixa marcada', await marca.isChecked());
  await foto(page, '1366-ficha');
  T.ok('sem rolagem para o lado (1366)', (await N.rolagemLateral(page)) <= 0);
  T.ok('nenhum erro na página (1366)', erros.length === 0, erros);
  await ctx.close();
  await N.fecharNavegador();
}))();
