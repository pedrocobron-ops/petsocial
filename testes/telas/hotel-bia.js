// Achados da Bia no hotel, pela tela (390 e 1366). Capturas em testes/saida/hotel-bia-*.png.
//  390 (recepção com caixa): Reservas mostra "Thor e Mel · sinal R$ 69,65" (Thor já pagou 100,00 dos 107,25; Mel 62,40) e
//      "Receber junto" com dois cliques no Pix: R$ 69,65 entram uma vez e os dois sinais ficam pagos (item 9).
//      Folha do dia do dia da chegada: o recado do pedido do link para Thor e Mel aparece uma vez, "Do pedido de Thor e Mel",
//      e o nome do tutor fica numa linha e o telefone na de baixo (item 12).
//  1366 (dono): check-in de quem chegou agora com "Recebeu adiantado?" R$ 50,00 no Pix, dois cliques: uma entrada só e o
//      cartão "Pago adiantado R$ 50,00" (item 8). Lista de espera com "Prefere canil perto da janela": Marcar reserva abre o
//      formulário com a observação (item 10).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('hotel-bia');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Hotel Bia tela' });
  const { dono, caixa } = L.sb;
  const P = L.P;
  const foto = (nome) => `${B.RAIZ}/testes/saida/hotel-bia-${nome}.png`;
  const txt = async (loc) => (await loc.innerText()).replace(/ /g, ' ');
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'casa.espera': { ativo: true, link: false } } }), 'lista de espera');
  const somaEntradas = () => B.centavos(Number(B.sql(`select coalesce(sum(valor),0) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago`)));

  // Thor e Mel da Ana, chegada daqui a 3 dias, como o pedido do link aceito: cada um com o seu sinal em A receber
  const dia = L.dia(3);
  const RECADO = 'Thor é agitado; Mel come ração light.';
  const grupo = B.sql('select gen_random_uuid()');
  async function reserva(pet, sinal) {
    const id = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'hotel', status: 'reservada', entrada: B.instante(dia, '09:00', L.fuso).toISOString(),
      saida_prevista: B.instante(B.somaDias(dia, 3), '17:00', L.fuso).toISOString(), valor_diaria: 110, obs: RECADO }).select('id').single(), pet).id;
    B.must(await caixa.rpc('estadia_sinal', { p_petshop: P, p_estadia: id, p_chave: `t-sinal-${B.sufixo()}`, p_passos: [
      { t: 'lancamento', nome: 'sinal', linha: { tipo: 'entrada', valor: sinal, forma: null, categoria: 'Creche e hotel', descricao: `Sinal da reserva: hotel de ${pet}`, cliente_id: L.tutores.Ana, pago: false, data: L.hoje, vencimento: L.hoje } },
      { t: 'estadia_valores', estadia: id, modo: 'upsert', campos: { sinal, sinal_estado: 'a_receber', sinal_lancamento_id: '$ref:sinal', sinal_pago_em: null } },
    ] }), 'sinal ' + pet);
    B.sql(`insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, inicio, fim, obs, status, tipo, grupo_id, estadia_id)
      select '${P}', 'Ana', '11900000001', '${pet}', e.entrada, e.saida_prevista, '${RECADO}', 'aceito', 'hotel', '${grupo}', e.id from estadias e where e.id = '${id}'`);
    return id;
  }
  const thor = await reserva('Thor', 107.25), mel = await reserva('Mel', 62.40);
  B.must(await caixa.rpc('receber_conta', { p_conta: B.sql(`select sinal_lancamento_id from estadias_valores where estadia_id='${thor}'`), p_valor: 100, p_forma: 'pix', p_chave: `t-parte-${B.sufixo()}` }), 'parte do sinal');

  {
    T.secao('390: Thor e Mel, sinal recebido junto');
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.caixa, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    await page.locator('.g-seg button', { hasText: /^Reservas/ }).first().click();
    const linha = page.locator('.g-ht-junto').first();
    await linha.waitFor({ timeout: 15000 });
    T.ok('a aba Reservas mostra "Thor e Mel · sinal R$ 69,65"', /Thor e Mel · sinal R\$ 69,65/.test(await txt(linha)), await txt(linha));
    await linha.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
    await page.screenshot({ path: foto('reservas-390'), fullPage: false }).catch(() => {});
    await linha.locator('button', { hasText: 'Receber junto' }).click();
    const folha = page.locator('.g-folha').last();
    await folha.waitFor({ timeout: 10000 });
    const corpo = await txt(folha);
    T.ok('a folha lista Thor (falta R$ 7,25) e Mel (R$ 62,40) e o total R$ 69,65', /Thor[\s\S]*falta R\$ 7,25[\s\S]*Mel[\s\S]*R\$ 62,40[\s\S]*Total: R\$ 69,65/.test(corpo), corpo.slice(0, 500));
    await folha.locator('button.g-chip', { hasText: 'Pix' }).first().click();
    await page.screenshot({ path: foto('sinal-junto-390'), fullPage: false }).catch(() => {});
    const s0 = somaEntradas();
    await folha.locator('button.g-btn.pri', { hasText: 'Receber R$ 69,65' }).dblclick();
    await folha.waitFor({ state: 'detached', timeout: 15000 });
    await page.waitForTimeout(800);
    T.ok('dois cliques: entrou R$ 69,65 uma vez', somaEntradas() - s0 === 6965, somaEntradas() - s0);
    T.ok('os dois sinais ficaram pagos', B.sql(`select string_agg(sinal_estado, ',') from estadias_valores where estadia_id in ('${thor}','${mel}')`) === 'pago,pago');
    T.ok('a linha do grupo sumiu (nada mais a receber)', (await page.locator('.g-ht-junto').count()) === 0);
    T.ok('nenhum erro na tela (390)', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado (390)', (await N.rolagemLateral(page)) <= 0);

    T.secao('390: folha do dia com o recado do pedido uma vez');
    await N.ir(page, `/gestao/app/creche-hotel/folha?dia=${dia}`, '.g-imp-folha');
    await page.locator('.g-imp-folha td', { hasText: 'Thor' }).first().waitFor({ timeout: 15000 });
    const folhaTxt = await txt(page.locator('.g-imp-folha'));
    T.ok('"Do pedido de Thor e Mel" aparece uma vez, e o recado não se repete', (folhaTxt.match(/Do pedido de Thor e Mel/g) ?? []).length === 1 && (folhaTxt.match(/Thor é agitado/g) ?? []).length === 1, folhaTxt.slice(0, 800));
    const caixas = await page.locator('.g-imp-folha td.tutor').first().evaluate((td) => {
      const n = td.querySelector('.nome').getBoundingClientRect(), t = td.querySelector('.tel').getBoundingClientRect();
      return { nomeFim: n.bottom, telTopo: t.top, telEsq: t.left, tdEsq: td.getBoundingClientRect().left };
    });
    T.ok('nome do tutor numa linha e o telefone embaixo, alinhado à esquerda', caixas.telTopo >= caixas.nomeFim - 1 && Math.abs(caixas.telEsq - caixas.tdEsq) < 12, caixas);
    await page.screenshot({ path: foto('folha-390'), fullPage: true }).catch(() => {});
    // no papel (a regra de impressão deixava o telefone na mesma linha do fim do nome)
    await page.emulateMedia({ media: 'print' });
    const papel = await page.locator('.g-imp-folha td.tutor').first().evaluate((td) => {
      const n = td.querySelector('.nome').getBoundingClientRect(), t = td.querySelector('.tel').getBoundingClientRect();
      return { nomeFim: n.bottom, telTopo: t.top, display: getComputedStyle(td.querySelector('.tel')).display };
    });
    T.ok('no papel também: telefone em bloco, embaixo do nome', papel.display === 'block' && papel.telTopo >= papel.nomeFim - 1, papel);
    await page.pdf({ path: `${B.RAIZ}/testes/saida/hotel-bia-folha.pdf`, format: 'A4' }).catch(() => {});
    await page.emulateMedia({ media: 'screen' });
    T.ok('nenhum erro na folha', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  {
    T.secao('1366: chegou agora com valor adiantado');
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    await page.locator('button', { hasText: 'Nova reserva / Check-in' }).first().click();
    let folha = page.locator('.g-folha').last();
    await folha.locator('input[placeholder="Nome do pet ou do tutor"]').fill('Bob');
    await folha.locator('button.g-linha', { hasText: 'Bob' }).first().click();
    await folha.locator('.g-seg button', { hasText: 'Chegou agora' }).click();
    await folha.locator('.g-seg button', { hasText: 'Sim, recebi agora' }).click();
    await folha.locator('input[aria-label="Valor recebido adiantado"]').fill('50');
    await folha.locator('button.g-chip', { hasText: 'Pix' }).first().click();
    await page.screenshot({ path: foto('adiantado-1366'), fullPage: false }).catch(() => {});
    const s0 = somaEntradas();
    await folha.locator('button.g-btn.pri', { hasText: 'Fazer check-in' }).dblclick();
    await folha.waitFor({ state: 'detached', timeout: 15000 });
    await page.waitForTimeout(1200);
    const bob = B.sql(`select id from estadias where petshop_id='${P}' and pet_id='${L.pets.Bob}' and status='em_casa'`);
    T.ok('Bob está na casa (uma estadia só)', B.num(`select count(*) from estadias where petshop_id='${P}' and pet_id='${L.pets.Bob}'`) === 1 && Boolean(bob));
    T.ok('dois cliques: R$ 50,00 entraram uma vez, no Pix', somaEntradas() - s0 === 5000 && B.num(`select count(*) from lancamentos where petshop_id='${P}' and descricao like 'Pago adiantado%' and forma='pix' and valor=50`) === 1);
    T.ok('guardado como o sinal pago da estadia, marcado como adiantado', B.sql(`select sinal||' '||sinal_estado||' '||(sinal_pagamento->>'adiantado') from estadias_valores where estadia_id='${bob}'`) === '50.00 pago true');
    const cartao = page.locator('.g-ch-cartao', { hasText: 'Bob' }).first();
    await cartao.waitFor({ timeout: 10000 });
    T.ok('o cartão mostra "Pago adiantado R$ 50,00"', /Pago adiantado R\$ 50,00/.test(await txt(cartao)), await txt(cartao));
    await page.screenshot({ path: foto('na-casa-1366'), fullPage: false }).catch(() => {});

    T.secao('1366: a observação da lista de espera vai para a reserva');
    B.sql(`insert into lista_espera (petshop_id, tipo, entrada, saida, pet_id, pet_nome, tutor_nome, obs, origem, status)
      values ('${P}', 'hotel', '${L.dia(5)}', '${L.dia(7)}', '${L.pets.Luna}', 'Luna', 'Clara', 'Prefere canil perto da janela', 'equipe', 'esperando')`);
    await N.ir(page, '/gestao/app/creche-hotel?ver=espera');
    const fila = page.locator('#lista-de-espera');
    await fila.locator('button', { hasText: 'Marcar reserva' }).first().click();
    folha = page.locator('.g-folha').last();
    await folha.waitFor({ timeout: 10000 });
    const obs = await folha.locator('textarea').last().inputValue();
    T.ok('Marcar reserva abre com "Prefere canil perto da janela" em Observações', obs === 'Prefere canil perto da janela', obs);
    await page.waitForTimeout(600);
    await page.screenshot({ path: foto('espera-1366'), fullPage: false }).catch(() => {});
    await folha.locator('button.g-btn.pri', { hasText: 'Marcar reserva' }).click();
    await folha.waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);
    T.ok('a reserva da Luna foi salva com a observação', B.sql(`select obs from estadias where petshop_id='${P}' and pet_id='${L.pets.Luna}' and status='reservada'`) === 'Prefere canil perto da janela');
    T.ok('nenhum erro na tela (1366)', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado (1366)', (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
