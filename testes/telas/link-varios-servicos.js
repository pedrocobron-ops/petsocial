// Link do cliente com mais de um serviço no mesmo pedido (migração 20261239), no navegador, em 390x844 (celular) e 1366x900:
// - passo 1: um toque marca o serviço (✓), outro tira; a barra de baixo diz quantos serviços, o tempo somado e o preço,
//   e leva ao dia e à hora; Creche e Hotel continuam abrindo na hora (um toque);
// - passo 2: os três serviços e o tempo somado (2h15); o último horário do dia é 17:30 (fecha às 20:00);
// - passo 3: o valor do pet é a soma (porte M: 90 + 30 + 15 = R$ 135,00), com cada serviço numa linha pequena;
// - "Pedido enviado" e a página do pedido com os três serviços; o pedido guarda os outros serviços e dura 135 min;
// - quem recebe (1366): o cartão diz os três serviços e "o cliente viu: R$ 135,00"; Aceitar vira UM horário com os três.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('link-varios-servicos-telas');

const foto = async (page, nome) => { if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/link-varios-${nome}.png`, fullPage: true }).catch(() => {}); };
const abrir = async (page, url) => { await page.goto(url); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(300); };

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Varios Telas' });
  const { dono } = L.sb;
  const TOSA = L.S['Banho e tosa'], HIDRA = L.S['Hidratação'], UNHA = L.S['Corte de unhas'];
  for (const [id, min] of [[TOSA, 90], [HIDRA, 30], [UNHA, 15]]) B.must(await dono.from('servicos').update({ duracao_min: min, ativo: true }).eq('id', id).select('id'), 'duração');
  const LINK = `${B.BASE_URL}/gestao/agendar/${L.codigo}`;
  const cartao = (page, nome) => page.locator('.g-lk-serv', { has: page.locator('b', { hasText: new RegExp(`^${nome}$`) }) });
  const pedidos = {};

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    T.secao(`${larg} px: escolher três serviços`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await abrir(page, LINK);
    await cartao(page, 'Banho e tosa').waitFor({ timeout: 30000 });
    T.ok('o passo 1 diz que dá para escolher mais de um', /Pode escolher mais de um serviço/.test(await page.locator('[data-teste=dica-varios]').innerText()));
    T.ok('sem nada escolhido, sem a barra de continuar', (await page.locator('[data-teste=escolha-servicos]').count()) === 0);
    await cartao(page, 'Banho e tosa').click();
    T.ok('um toque marca o serviço e não sai do passo 1', (await cartao(page, 'Banho e tosa').getAttribute('aria-pressed')) === 'true' && (await page.locator('.g-lk-passos li.atual').innerText()).includes('Serviço'));
    const barra = page.locator('[data-teste=escolha-servicos]');
    T.ok('a barra mostra o serviço, 1h30 e o preço (a partir de R$ 80)', /Banho e tosa/.test(await barra.innerText()) && /1h30/.test(await barra.innerText()) && /a partir de R\$\s?80/.test(await barra.innerText()), await barra.innerText());
    await cartao(page, 'Hidratação').click();
    await cartao(page, 'Corte de unhas').click();
    await cartao(page, 'Corte de unhas').click();
    T.ok('outro toque tira o serviço', (await cartao(page, 'Corte de unhas').getAttribute('aria-pressed')) === 'false' && /2 serviços/.test(await barra.innerText()), await barra.innerText());
    await cartao(page, 'Corte de unhas').click();
    T.ok('três marcados (✓)', (await page.locator('.g-lk-serv[aria-pressed="true"]').count()) === 3);
    const txt = await barra.innerText();
    T.ok('a barra: "3 serviços", 2h15 e a partir de R$ 120 (80 + 25 + 15)', /3 serviços/.test(txt) && /2h15/.test(txt) && /a partir de R\$\s?120/.test(txt), txt);
    const caixa = await barra.boundingBox();
    T.ok('a barra fica à vista, na parte de baixo da tela', caixa && caixa.y + caixa.height <= alt + 1 && caixa.y > alt / 2, caixa);
    T.ok(`sem rolagem para o lado no passo 1 (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, `${larg}-1-escolha`);
    await barra.getByRole('button', { name: 'Continuar' }).click();

    T.secao(`${larg} px: dia e hora com o tempo de todos`);
    const escolhido = page.locator('[data-teste=servicos-escolhidos]');
    await escolhido.waitFor({ timeout: 15000 });
    T.ok('o passo 2 mostra os três serviços e 2h15', /Banho e tosa \+ Hidratação \+ Corte de unhas/.test(await escolhido.innerText()) && /2h15/.test(await escolhido.innerText()), await escolhido.innerText());
    // espera a resposta dos horários do dia novo: sem isso, a lista do dia anterior (ou vazia, na troca) era lida antes
    const horariosDoDia = page.waitForResponse((r) => /\/rpc\/link_horarios/.test(r.url()), { timeout: 20000 }).catch(() => null);
    await page.locator('.g-lk-dia:not([disabled])').nth(3).click();
    await horariosDoDia;
    // os horários do dia novo (enquanto lê, a página mostra o esqueleto)
    await page.waitForFunction(() => !document.querySelector('.g-lk-hora-esq') && document.querySelectorAll('.g-lk-hora').length > 0, null, { timeout: 20000 });
    const horas = await page.locator('.g-lk-hora').allInnerTexts();
    const ultima = horas.map((h) => h.slice(0, 5)).sort().pop();
    T.ok('o último horário do dia é 17:30 (135 min antes das 20:00)', ultima === '17:30', horas.slice(-3));
    await page.locator('.g-lk-hora').nth(larg === 390 ? 2 : 4).click();
    const hora = (await page.locator('.g-lk-hora[aria-pressed="true"]').innerText()).slice(0, 5);
    const fim = B.sql(`select to_char('2026-01-01 ${hora}'::timestamp + interval '135 minutes', 'HH24:MI')`);
    T.ok(`começa às ${hora} e termina por volta das ${fim}`, new RegExp(`termina por volta das ${fim}`).test(await page.locator('.g-lk-termino').innerText()), await page.locator('.g-lk-termino').innerText());
    await foto(page, `${larg}-2-quando`);
    await page.getByRole('button', { name: 'Continuar' }).click();

    T.secao(`${larg} px: o valor somado e o pedido enviado`);
    const pet = page.locator('.g-lk-pet').first();
    await pet.locator('input').fill(larg === 390 ? 'Thor' : 'Luna');
    await pet.locator('.g-lk-opcao.porte', { hasText: 'M' }).first().click();
    const valor = page.locator('[data-teste=valor-do-pedido]');
    T.ok('porte M: R$ 135,00', /R\$\s135,00/.test(await valor.locator('[data-teste=valor-do-pet]').innerText()), await valor.innerText());
    T.ok('com cada serviço: Banho e tosa R$ 90,00 + Hidratação R$ 30,00 + Corte de unhas R$ 15,00',
      /Banho e tosa R\$\s90,00 \+ Hidratação R\$\s30,00 \+ Corte de unhas R\$\s15,00/.test(await valor.locator('[data-teste=valor-partes]').innerText()), await valor.innerText());
    await page.locator('input[autocomplete=name]').fill(larg === 390 ? 'Tutora Celular' : 'Tutor Computador');
    await page.locator('input[type=tel]').fill(larg === 390 ? '11987651001' : '11987651002');
    T.ok(`sem rolagem para o lado no passo 3 (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, `${larg}-3-dados`);
    await page.getByRole('button', { name: 'Enviar pedido' }).click();
    await page.locator('.g-lk-ok').waitFor({ timeout: 20000 });
    const ok = await page.locator('.g-lk-ok').innerText();
    T.ok('"Pedido enviado": "Serviços" com os três e o valor R$ 135,00', /Serviços/.test(ok) && /Banho e tosa \+ Hidratação \+ Corte de unhas/.test(await page.locator('[data-teste=servicos-enviados]').innerText()) && /R\$\s135,00/.test(ok), ok);
    const zap = decodeURIComponent(((await page.locator('.g-lk-ok a.g-btn.fantasma').getAttribute('href')) ?? '').split('text=')[1] ?? '');
    T.ok('a mensagem do WhatsApp cita os três serviços', /pedir banho e tosa, hidratação e corte de unhas para/.test(zap), zap);
    const linha = B.sql(`select id || '|' || cardinality(outros_servicos) || '|' || (extract(epoch from fim - inicio)::int / 60) from pedidos_agendamento where petshop_id='${L.P}' and pet_nome='${larg === 390 ? 'Thor' : 'Luna'}' and status='pendente'`).split('|');
    T.ok('o pedido guarda os outros dois serviços e dura 135 min', linha[1] === '2' && linha[2] === '135', linha);
    pedidos[larg] = linha[0];
    await foto(page, `${larg}-4-enviado`);

    await abrir(page, `${LINK}/pedido/${linha[0]}`);
    await page.locator('[data-teste=valor-do-pedido]').waitFor({ timeout: 30000 });
    const pg = await page.locator('body').innerText();
    T.ok('a página do pedido mostra os três serviços e o valor de cada um', /Banho e tosa \+ Hidratação \+ Corte de unhas/.test(pg) && /R\$\s135,00/.test(pg)
      && /Hidratação R\$\s30,00/.test(await page.locator('[data-teste=valor-partes]').innerText()), pg.slice(0, 600));
    T.ok(`sem rolagem para o lado na página do pedido (${larg})`, (await N.rolagemLateral(page)) <= 0);
    T.ok('nenhum erro na página', erros.length === 0, erros);
    await foto(page, `${larg}-5-pedido`);
    await ctx.close();
  }

  T.secao('quem recebe (1366): o cartão e o aceite');
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/agenda');
    const c = page.locator('.g-pl-item', { hasText: 'Tutora Celular' }).first();
    await c.waitFor({ timeout: 30000 });
    const t = await c.innerText();
    T.ok('o cartão diz os três serviços', /Banho e tosa \+ Hidratação \+ Corte de unhas/.test(t), t);
    T.ok('e o que o cliente viu: R$ 135,00', /o cliente viu: R\$\s135,00/.test(await c.locator('[data-teste=cliente-viu]').innerText()), t);
    await foto(page, '1366-6-cartao');
    await c.getByRole('button', { name: /^Aceitar/ }).first().click();
    await page.locator('.g-pl-item.respondido', { hasText: 'Thor' }).first().waitFor({ timeout: 30000 });
    const ag = B.sql(`select a.preco || '|' || (extract(epoch from a.fim - a.inicio)::int / 60) || '|' || (select string_agg(x.preco::text, '+' order by x.ordem) from agendamento_servicos x where x.agendamento_id = a.id)
      from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id where p.id='${pedidos[390]}'`);
    T.ok('aceito: UM horário com banho e tosa 90,00, 135 min e os outros dois (30,00 + 15,00)', ag === '90.00|135|30.00+15.00', ag);
    const msg = decodeURIComponent(((await page.locator('.g-pl-item.respondido', { hasText: 'Thor' }).first().locator('a.g-btn.zap').getAttribute('href')) ?? '').split('text=')[1] ?? '');
    T.ok('a mensagem de confirmação cita os três serviços e o valor', /Banho e tosa, Hidratação e Corte de unhas de Thor/.test(msg) && /Valor: R\$\s135,00/.test(msg), msg);
    T.ok('nenhum erro na tela de quem recebe', erros.length === 0, erros);
    await foto(page, '1366-7-aceito');
    await ctx.close();
  }
}))();
