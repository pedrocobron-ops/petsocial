// Marcar horário com vários serviços (um bloco só, "O que o pet vai fazer?"): ordem do toque, preço por porte, total e tempo somados,
// o que vai para o banco (principal + a mais), a agenda, a conta e a comissão por serviço; tirar o primeiro; alterar; pet sem porte;
// tosador sem dinheiro (o banco põe o preço da lista); preço travado para a recepção. Em 390 e 1366.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('servicos-tela');
const ok = (nome, cond, det) => T.ok(nome, cond, det);
const j = (q) => JSON.parse(B.sql(q) || 'null');
const FOTOS = process.env.FOTOS ? require('path').join(B.RAIZ, 'testes', 'saida') + '/' : null;
const foto = (page, nome) => (FOTOS ? page.screenshot({ path: FOTOS + 'servicos-' + nome + '.png' }) : null);

const folha = (page) => page.locator('.g-folha').last();
const grupo = (page) => folha(page).locator('[aria-labelledby=oque-rotulo]');
const chip = (page, nome) => grupo(page).getByRole('button', { name: nome, exact: true });
const lista = (page) => folha(page).locator('ul[aria-label="Serviços deste horário"] li');
const nomesDaLista = async (page) => (await lista(page).locator('.t b').allInnerTexts());
const txt = async (l) => (await l.innerText()).replace(/ /g, ' ');

async function abrirMarcar(page, dia, pet) {
  await N.ir(page, `/gestao/app/agenda?dia=${dia}`);
  await page.locator('button.g-btn.pri', { hasText: 'Marcar horário' }).first().click();
  await page.waitForTimeout(800);
  await folha(page).locator('.g-busca input').fill(pet);
  await page.waitForTimeout(900);
  await folha(page).locator('button.g-linha', { hasText: pet }).first().click();
  await page.waitForTimeout(600);
}
async function marcar(page, botao = /^(Marcar|Salvar)$/) {
  await folha(page).locator('button.g-btn.pri').filter({ hasText: botao }).click();
  for (let k = 0; k < 3; k++) {
    await page.waitForTimeout(1200);
    const m = page.locator('button', { hasText: 'Marcar mesmo assim' });
    if (await m.count() && await m.first().isVisible().catch(() => false)) await m.first().click(); else break;
  }
  await page.waitForTimeout(1500);
}
const agDo = (pet, dia) => j(`select row_to_json(x) from (select a.id, s.nome principal, a.preco::float, extract(epoch from a.fim - a.inicio)/60 as min,
  (select coalesce(json_agg(json_build_object('nome', s2.nome, 'preco', x.preco::float, 'ordem', x.ordem) order by x.ordem), '[]') from agendamento_servicos x join servicos s2 on s2.id = x.servico_id where x.agendamento_id = a.id) extras
  from agendamentos a join pets p on p.id = a.pet_id left join servicos s on s.id = a.servico_id where p.nome = '${pet}' and a.petshop_id = '${L.P}' and a.inicio::date >= '${dia}' order by a.criado_em desc limit 1) x`);

let L;
(async () => T.rodar(async () => {
    if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
    L = await criarLoja(T, { nome: 'Servicos tela' });
    const { dono } = L.sb;
    const P = L.P;
    // Tosa higiênica com preço por porte; comissão por serviço (tosador 40%, Hidratação 50%, Corte 10%)
    B.must(await dono.from('servicos').update({ preco_p: 35, preco_m: 40, preco_g: 45, preco_gg: 50, ativo: true }).eq('id', L.S['Tosa higiênica']).select('id'), 'tosa');
    B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'comissao.por_servico': true } }), 'opções');
    B.must(await dono.from('comissao_servicos').insert([{ petshop_id: P, servico_id: L.S['Hidratação'], pct: 50 }, { petshop_id: P, servico_id: L.S['Corte de unhas'], pct: 10 }]).select('servico_id'), 'comissão por serviço');
    B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
    const amanha = L.dia(1);

    T.secao('390: quatro serviços, banco e agenda');
    // 1. dono, 390: 4 serviços para o Thor (M), hoje 15:00 com o Tito ----------
    let { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await abrirMarcar(page, L.hoje, 'Thor');
    const f0 = await txt(folha(page));
    ok('não existe mais "Juntar outro serviço"', !/Juntar outro/.test(f0));
    ok('bloco "O que o pet vai fazer?"', /O que o pet vai fazer\?/.test(f0));
    ok('nada escolhido no começo', (await lista(page).count()) === 0);
    for (const n of ['Banho', 'Tosa higiênica', 'Hidratação', 'Corte de unhas']) { await chip(page, n).click(); await page.waitForTimeout(250); }
    ok('lista na ordem do toque', JSON.stringify(await nomesDaLista(page)) === JSON.stringify(['Banho', 'Tosa higiênica', 'Hidratação', 'Corte de unhas']), await nomesDaLista(page));
    const vals = await lista(page).locator('input').evaluateAll((xs) => xs.map((x) => x.value));
    ok('preço por porte M em cada linha (60/40/30/15)', JSON.stringify(vals) === JSON.stringify(['60,00', '40,00', '30,00', '15,00']), vals);
    const tot = await txt(folha(page).locator('.g-agd-total'));
    ok('Tempo total 2h 30 e Total R$ 145,00', /Tempo total\s*2h 30/.test(tot) && /Total\s*R\$ 145,00/.test(tot), tot);
    ok('Duração = 2h 30 (soma)', (await folha(page).locator('select.g-select').last().inputValue()) === '150');
    ok('4 chips marcados', (await grupo(page).locator('button[aria-pressed=true]').count()) === 4);
    await folha(page).locator('.g-campo', { hasText: 'Quem atende' }).getByRole('button', { name: 'Tito' }).click();
    await folha(page).locator('input[type=time]').fill('15:00');
    await lista(page).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await foto(page, '390-form-4-servicos');
    await folha(page).locator('.g-agd-total').scrollIntoViewIfNeeded();
    await foto(page, '390-form-4-servicos-total');
    ok('sem rolagem lateral (390)', (await N.rolagemLateral(page)) <= 0);
    await marcar(page);
    let a = agDo('Thor', L.hoje);
    ok('banco: principal Banho R$ 60, 150 min', a && a.principal === 'Banho' && a.preco === 60 && a.min === 150, a);
    ok('banco: 3 a mais na ordem com preço (Tosa 40, Hidr 30, Corte 15)', a && JSON.stringify(a.extras.map((x) => [x.nome, x.preco])) === JSON.stringify([['Tosa higiênica', 40], ['Hidratação', 30], ['Corte de unhas', 15]]), a?.extras);
    const thorId = a.id;
    await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
    const bloco = page.locator('.g-ag, .g-hora-grupo, .g-linha', { hasText: 'Thor' }).first();
    const tb = await bloco.innerText().catch(() => '') + ' ' + (await bloco.getAttribute('title').catch(() => '') ?? '');
    ok('bloco da agenda mostra os 4 serviços', ['Banho', 'Tosa higiênica', 'Hidratação', 'Corte de unhas'].every((n) => tb.includes(n)), tb);
    await bloco.scrollIntoViewIfNeeded();
    await foto(page, '390-agenda-bloco');
    ok('nenhum erro (dono 390)', erros.length === 0, erros);
    await ctx.close();

    T.secao('390: a conta e a comissão por serviço');
    // 2. conta: tosador conclui, Rita fecha a conta pela Agenda (390) ----------
    B.must(await L.sb.tosador.from('agendamentos').update({ status: 'concluido' }).eq('id', thorId).select('id'), 'conclui');
    ({ ctx, page, erros } = await N.contexto(390, 844));
    await N.entrar(page, L.emails.caixa, L.senha);
    await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
    await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Thor' }).first().click();
    await page.waitForTimeout(1200);
    await folha(page).locator('button', { hasText: 'Fechar a conta' }).click();
    await page.waitForTimeout(1500);
    const conta = await txt(folha(page));
    ok('conta lista os 4 serviços', ['Banho', 'Tosa higiênica', 'Hidratação', 'Corte de unhas'].every((n) => conta.includes(n)), conta.slice(0, 500));
    ok('conta: Receber R$ 145,00', /Receber R\$ 145,00/.test(conta), conta.match(/Receber R\$[^\n]*/)?.[0]);
    await foto(page, '390-conta');
    await folha(page).locator('.g-chips button, button.g-chip', { hasText: 'Pix' }).first().click();
    await page.waitForTimeout(300);
    await folha(page).locator('button.g-btn.pri', { hasText: 'Receber' }).click();
    await page.waitForTimeout(3000);
    const lan = j(`select json_agg(json_build_object('valor', valor::float, 'itens', jsonb_array_length(itens))) from lancamentos where agendamento_id='${thorId}'`);
    ok('uma entrada de R$ 145 com 4 itens', lan?.length === 1 && lan[0].valor === 145 && lan[0].itens === 4, lan);
    const com = B.must(await dono.rpc('comissao_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje }), 'comissão').find((x) => x.profissional_id === L.ids.tosador);
    ok('comissão por serviço: 60·40% + 40·40% + 30·50% + 15·10% = R$ 56,50', com && B.centavos(com.comissao) === 5650 && B.centavos(com.base) === 14500, com);
    ok('nenhum erro (Rita 390)', erros.length === 0, erros);
    await ctx.close();

    T.secao('1366: tirar o primeiro');
    // 3. dono 1366: tira o principal, o seguinte assume (Luna M, amanhã 09:00) ----------
    ({ ctx, page, erros } = await N.contexto(1366, 900));
    await N.entrar(page, L.emails.dono, L.senha);
    await abrirMarcar(page, amanha, 'Luna');
    for (const n of ['Banho', 'Hidratação', 'Corte de unhas']) { await chip(page, n).click(); await page.waitForTimeout(200); }
    await chip(page, 'Banho').click();
    await page.waitForTimeout(300);
    ok('sem o Banho, Hidratação vira o primeiro', JSON.stringify(await nomesDaLista(page)) === JSON.stringify(['Hidratação', 'Corte de unhas']), await nomesDaLista(page));
    ok('Duração 45 min', (await folha(page).locator('select.g-select').last().inputValue()) === '45');
    await folha(page).locator('input[type=time]').fill('09:00');
    await foto(page, '1366-tirou-principal');
    await marcar(page);
    a = agDo('Luna', amanha);
    ok('banco: principal Hidratação R$ 30, a mais Corte R$ 15, 45 min', a && a.principal === 'Hidratação' && a.preco === 30 && a.min === 45 && JSON.stringify(a.extras.map((x) => [x.nome, x.preco])) === '[["Corte de unhas",15]]', a);

    T.secao('1366: alterar um horário com três serviços');
    // 4. alterar horário existente (Bob G, Banho + Hidratação + Corte) ----------
    const ini = B.instante(amanha, '10:00', L.fuso);
    const bobId = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Bob, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 105 * 6e4).toISOString(), preco: 70 }).select('id').single(), 'bob').id;
    B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: bobId, p_servicos: [{ servico_id: L.S['Hidratação'], preco: 35 }, { servico_id: L.S['Corte de unhas'], preco: 15 }] }), 'extras bob');
    await N.ir(page, `/gestao/app/agenda?dia=${amanha}`);
    await page.locator('.g-hora-grupo, .g-ag, .g-linha', { hasText: 'Bob' }).first().click();
    await page.waitForTimeout(1200);
    await folha(page).locator('button', { hasText: 'Remarcar ou alterar' }).click();
    await page.waitForTimeout(1500);
    ok('alterar: os 3 serviços já escolhidos, na ordem', JSON.stringify(await nomesDaLista(page)) === JSON.stringify(['Banho', 'Hidratação', 'Corte de unhas']), await nomesDaLista(page));
    ok('alterar: 3 chips marcados', (await grupo(page).locator('button[aria-pressed=true]').count()) === 3);
    const v4 = await lista(page).locator('input').evaluateAll((xs) => xs.map((x) => x.value));
    ok('alterar: valores 70/35/15', JSON.stringify(v4) === JSON.stringify(['70,00', '35,00', '15,00']), v4);
    await foto(page, '1366-alterar-antes');
    await chip(page, 'Banho').click();
    await chip(page, 'Tosa higiênica').click();
    await lista(page).filter({ hasText: 'Hidratação' }).locator('input').fill('33');
    await page.waitForTimeout(300);
    const t4 = await txt(folha(page).locator('.g-agd-total'));
    ok('alterar: Total R$ 93,00 (33 + 15 + 45)', /R\$ 93,00/.test(t4), t4);
    await foto(page, '1366-alterar-depois');
    await marcar(page);
    a = agDo('Bob', amanha);
    ok('banco: Bob agora Hidratação 33 + Corte 15 + Tosa 45, 90 min', a && a.principal === 'Hidratação' && a.preco === 33 && a.min === 90 && JSON.stringify(a.extras.map((x) => [x.nome, x.preco])) === '[["Corte de unhas",15],["Tosa higiênica",45]]', a);

    T.secao('1366: pet sem porte');
    // 5. pet sem porte: a pergunta continua ----------
    const nina = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: L.tutores.Ana, nome: 'Nina', especie: 'cao' }).select('id').single(), 'nina').id;
    await abrirMarcar(page, amanha, 'Nina');
    await chip(page, 'Banho').click(); await chip(page, 'Hidratação').click();
    await page.waitForTimeout(300);
    ok('pergunta do porte aparece', /Qual é o porte de Nina\?/.test(await txt(folha(page))));
    await folha(page).locator('input[type=time]').fill('11:00');
    await folha(page).locator('button.g-btn.pri').filter({ hasText: /^Marcar$/ }).click();
    await page.waitForTimeout(800);
    ok('sem porte, não marca', !agDo('Nina', amanha));
    await folha(page).locator('[aria-label="Porte de Nina"] button', { hasText: /^G/ }).first().click();
    await page.waitForTimeout(1500);
    const v5 = await lista(page).locator('input').evaluateAll((xs) => xs.map((x) => x.value));
    ok('porte G: valores 70/35', JSON.stringify(v5) === JSON.stringify(['70,00', '35,00']), v5);
    await marcar(page);
    a = agDo('Nina', amanha);
    ok('banco: Nina Banho 70 + Hidratação 35', a && a.preco === 70 && JSON.stringify(a.extras.map((x) => [x.nome, x.preco])) === '[["Hidratação",35]]', a);
    T.secao('1366: pacote de Banho, Hidratação tocada antes');
    // Pipoca (M) tem pacote de Banho: tocando Hidratação e depois Banho, o Banho vira o principal (o pacote vale); a lista fica na ordem do toque
    const pipoca = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: L.tutores.Clara, nome: 'Pipoca', especie: 'cao', porte: 'M' }).select('id').single(), 'pipoca').id;
    B.sql(`insert into pacotes_clientes (petshop_id, pet_id, nome, servico_id, total, usados, preco) values ('${P}', '${pipoca}', 'Pacote 4 banhos', '${L.S.Banho}', 4, 0, 200)`);
    await abrirMarcar(page, L.hoje, 'Pipoca');
    await chip(page, 'Hidratação').click(); await page.waitForTimeout(200);
    await chip(page, 'Banho').click(); await page.waitForTimeout(300);
    ok('pacote: a lista fica na ordem do toque (Hidratação, Banho)', JSON.stringify(await nomesDaLista(page)) === JSON.stringify(['Hidratação', 'Banho']), await nomesDaLista(page));
    await folha(page).locator('input[type=time]').fill('12:00');
    await foto(page, '1366-pacote');
    await marcar(page);
    a = agDo('Pipoca', L.hoje);
    ok('pacote: banco com Banho de principal (R$ 60) e Hidratação a mais (R$ 30)', a && a.principal === 'Banho' && a.preco === 60 && JSON.stringify(a.extras.map((x) => [x.nome, x.preco])) === '[["Hidratação",30]]', a);
    await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
    await page.locator('.g-hora-grupo, .g-ag, .g-linha', { hasText: 'Pipoca' }).first().click();
    await page.waitForTimeout(1500);
    const det = await txt(folha(page));
    ok('pacote: o horário oferece "Usar o pacote e cobrar o resto · R$ 30,00"', /Usar o pacote e cobrar o resto · R\$ 30,00/.test(det), det.slice(0, 600));
    await folha(page).locator('button', { hasText: 'Usar o pacote e cobrar o resto' }).click();
    await page.waitForTimeout(1500);
    const cp = await txt(folha(page));
    ok('pacote: a conta cobra só a Hidratação (Receber R$ 30,00)', /Hidratação/.test(cp) && /Receber R\$ 30,00/.test(cp), cp.match(/Receber R\$[^\n]*/)?.[0] ?? cp.slice(0, 400));
    await foto(page, '1366-pacote-conta');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    // alterar mantém a regra: Hidratação gravada de principal com o Banho a mais vira Banho principal ao salvar
    const ini2 = B.instante(amanha, '13:00', L.fuso);
    const pipId = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: pipoca, servico_id: L.S['Hidratação'], inicio: ini2.toISOString(), fim: new Date(+ini2 + 90 * 6e4).toISOString(), preco: 30 }).select('id').single(), 'pipoca 2').id;
    B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: pipId, p_servicos: [{ servico_id: L.S.Banho, preco: 60 }] }), 'banho a mais');
    await N.ir(page, `/gestao/app/agenda?dia=${amanha}`);
    await page.locator('.g-hora-grupo, .g-ag, .g-linha', { hasText: 'Pipoca' }).first().click();
    await page.waitForTimeout(1200);
    await folha(page).locator('button', { hasText: 'Remarcar ou alterar' }).click();
    await page.waitForTimeout(1500);
    await marcar(page);
    a = j(`select row_to_json(x) from (select s.nome principal, a.preco::float, (select json_agg(s2.nome order by x.ordem) from agendamento_servicos x join servicos s2 on s2.id = x.servico_id where x.agendamento_id = a.id) extras from agendamentos a join servicos s on s.id = a.servico_id where a.id = '${pipId}') x`);
    ok('pacote ao alterar: Banho vira o principal (R$ 60), Hidratação a mais', a && a.principal === 'Banho' && a.preco === 60 && JSON.stringify(a.extras) === '["Hidratação"]', a);
    ok('nenhum erro (dono 1366)', erros.length === 0, erros);
    await ctx.close();

    T.secao('390: tosador sem dinheiro');
    // 6. tosador (sem dinheiro), 390: sem preço na tela; o banco põe os da lista ----------
    ({ ctx, page, erros } = await N.contexto(390, 844));
    await N.entrar(page, L.emails.tosador, L.senha);
    await abrirMarcar(page, amanha, 'Mel');
    for (const n of ['Banho', 'Hidratação', 'Corte de unhas']) { await chip(page, n).click(); await page.waitForTimeout(200); }
    const f6 = await txt(folha(page));
    ok('tosador: nenhum R$ e nenhum campo de valor', !/R\$/.test(f6) && (await lista(page).locator('input').count()) === 0, f6.slice(0, 400));
    ok('tosador: Tempo total 1h 45', /Tempo total\s*1h 45/.test(f6) && !/Total\s*R/.test(f6));
    await folha(page).locator('input[type=time]').fill('14:00');
    await lista(page).first().scrollIntoViewIfNeeded();
    await foto(page, '390-tosador');
    await marcar(page);
    a = agDo('Mel', amanha);
    ok('banco: Mel (P) com preços da lista 50 + 25 + 15', a && a.principal === 'Banho' && a.preco === 50 && JSON.stringify(a.extras.map((x) => [x.nome, x.preco])) === '[["Hidratação",25],["Corte de unhas",15]]', a);
    ok('nenhum erro (tosador)', erros.length === 0, erros);
    await ctx.close();

    T.secao('1366: preço travado (recepção)');
    // 7. preço travado: Rita (só Caixa) 1366 ----------
    B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.preco_travado': true } }), 'trava');
    ({ ctx, page, erros } = await N.contexto(1366, 900));
    await N.entrar(page, L.emails.caixa, L.senha);
    await abrirMarcar(page, amanha, 'Rex');
    await chip(page, 'Banho').click(); await chip(page, 'Hidratação').click();
    await page.waitForTimeout(300);
    const f7 = await txt(folha(page));
    ok('trava: sem campo de valor, mostra R$ 80,00 e R$ 40,00 e Total R$ 120,00', (await lista(page).locator('input').count()) === 0 && /R\$ 80,00/.test(f7) && /R\$ 40,00/.test(f7) && /Total\s*R\$ 120,00/.test(f7), f7.slice(0, 600));
    await folha(page).locator('input[type=time]').fill('16:00');
    await foto(page, '1366-trava');
    await marcar(page);
    a = agDo('Rex', amanha);
    ok('banco: Rex 80 + 40', a && a.preco === 80 && JSON.stringify(a.extras.map((x) => [x.nome, x.preco])) === '[["Hidratação",40]]', a);
    ok('nenhum erro (Rita trava)', erros.length === 0, erros);
    await ctx.close();
    await N.fecharNavegador();
}))();
