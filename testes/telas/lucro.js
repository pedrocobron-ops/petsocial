// "Quanto sobrou" e "Por pessoa" pela tela (migração 20261193), em 390 e 1366:
// - Relatórios (dono, Este mês): Banho com custo do material e "custo não informado" na Hidratação, Como fecha com o
//   Financeiro com o mesmo Resultado do mês da tela Financeiro, Exportar baixa a planilha, Por pessoa com o tosador e a recepção;
// - Meu pet shop: o dono vê e grava o Custo do material do serviço;
// - Hoje do tosador: "Meu mês" com os atendimentos, sem valor em reais.
// Sem rolagem lateral e sem erro na página. Capturas em testes/saida/lucro-*.png.
const fs = require('fs');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const N = require('../lib/navegador');
const T = require('../lib/teste')('lucro-telas');
const D = lib('dinheiro');
const limpo = (s) => String(s ?? '').replace(/[  ]/g, ' ');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Lucro telas' });
  const { dono, caixa: cx, tosador: tos } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  B.must(await dono.from('servicos').update({ custo_material: 8.5 }).eq('id', L.S.Banho).select('id'), 'material do banho');
  const marca = async (pet, h, servico, outros = []) => {
    const ini = B.instante(L.hoje, h, L.fuso);
    const porte = B.sql(`select porte from pets where id='${L.pets[pet]}'`);
    const id = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S[servico], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 45 * 6e4).toISOString(), preco: L.preco(servico, porte) }).select('id').single(), 'horário').id;
    if (outros.length) B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: id, p_servicos: outros.map((s) => ({ servico_id: L.S[s], preco: L.preco(s, porte) })) }), 'outros');
    B.must(await tos.from('agendamentos').update({ status: 'concluido' }).eq('id', id).select('id').single(), 'conclui');
    return id;
  };
  const thor = await marca('Thor', '08:00', 'Banho', ['Hidratação']);
  const luna = await marca('Luna', '10:00', 'Banho');
  // Thor (M): Banho 60 + Hidratação 30 por 80 → Banho 53,33, Hidratação 26,67; Luna: Banho 60
  await D.lancarPago(dono, P, { tipo: 'entrada', valor: 80, forma: 'pix', categoria: 'Banho e tosa', agendamentoId: thor, clienteId: L.tutores.Ana, chave: D.novaChaveDeOperacao(),
    itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60 }, { tipo: 'servico', nome: 'Hidratação', qtd: 1, valor: 30, servico_id: L.S['Hidratação'] }] });
  await D.lancarPago(cx, P, { tipo: 'entrada', valor: 60, forma: 'dinheiro', categoria: 'Banho e tosa', agendamentoId: luna, clienteId: L.tutores.Davi, chave: D.novaChaveDeOperacao(), itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60 }] });
  await D.lancarPago(cx, P, { tipo: 'entrada', valor: 59.8, forma: 'pix', categoria: 'Venda de produtos', chave: D.novaChaveDeOperacao(), itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 2, valor: 29.9, produto_id: L.prod }] });
  await D.lancarPago(dono, P, { tipo: 'entrada', valor: 200, forma: 'pix', categoria: 'Pacotes', descricao: 'Pacote 4 banhos', clienteId: L.tutores.Clara, chave: D.novaChaveDeOperacao() });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 450, forma: 'pix', categoria: 'Aluguel', descricao: 'Aluguel', chave: D.novaChaveDeOperacao() });
  // à mão: entrou 80 + 60 + 59,80 + 200 = 399,80; resultado 399,80 − 450 = −50,20
  // Banho: 53,33 + 60 = 113,33, 2 vezes, material 17,00, sobrou 96,33; Hidratação 26,67 sem custo; Shampoo 59,80 − 24 = 35,80

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    T.secao(`${larg} px`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/relatorios');
    const sec = page.locator('section[aria-label="Quanto sobrou"]');
    await sec.waitFor({ timeout: 20000 });
    await sec.getByText('Como fecha com o Financeiro').waitFor({ timeout: 20000 });
    const t = limpo(await sec.innerText());
    T.ok('Banho: 2 vezes, entrou R$ 113,33, custo R$ 17,00, sobrou R$ 96,33', /Banho[\s\S]{0,120}material R\$ 17,00/.test(t) && /R\$ 113,33/.test(t) && /R\$ 96,33/.test(t), t.slice(0, 900));
    const linhaH = limpo(await sec.locator('.g-lu-l', { hasText: 'Hidratação' }).first().innerText());
    T.ok('Hidratação: R$ 26,67 com "custo não informado" (e sem 100%)', /Hidratação[\s\S]{0,200}R\$ 26,67[\s\S]{0,80}custo não informado/.test(linhaH) && !/100/.test(linhaH), linhaH);
    T.ok('Como fecha: serviços e produtos R$ 199,80 + outros R$ 200,00 = Entrou R$ 399,80; resultado − R$ 50,20', /Serviços, produtos e extras\s*R\$ 199,80/.test(t) && /Entrou\s*R\$ 399,80/.test(t) && /Resultado do mês \(o mesmo do Financeiro\)\s*\S*\s*R?\$?\s*-?50,20/.test(t), t.slice(t.indexOf('Como fecha'), t.indexOf('Como fecha') + 600));
    if (larg === 390) {
      // a lista de produtos
      await sec.getByRole('button', { name: 'Produtos' }).click(); await page.waitForTimeout(400);
      const tp = limpo(await sec.innerText());
      T.ok('Produtos: Shampoo Neutro 2 un, R$ 59,80, custo R$ 24,00, sobrou R$ 35,80', /Shampoo Neutro[\s\S]{0,200}R\$ 59,80[\s\S]{0,60}R\$ 24,00[\s\S]{0,60}R\$ 35,80/.test(tp), tp.slice(0, 700));
      await sec.getByRole('button', { name: 'Serviços' }).click(); await page.waitForTimeout(300);
    }
    await sec.screenshot({ path: B.RAIZ + `/testes/saida/lucro-${larg}.png` }).catch(() => {});
    // Exportar
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), sec.getByRole('button', { name: 'Exportar' }).click()]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    T.ok('Exportar baixa a planilha com as linhas e a conta do Financeiro', /Quanto sobrou/.test(csv) && /Banho/.test(csv) && /custo não informado/.test(csv) && /Resultado do período/.test(csv) && /-50,20/.test(csv), csv.slice(0, 300));

    const pp = page.locator('section[aria-label="Por pessoa"]');
    await pp.waitFor({ timeout: 20000 });
    await pp.getByText('Tito Tosador').waitFor({ timeout: 20000 });
    const tpp = limpo(await pp.innerText());
    T.ok('Por pessoa: Tito Tosador com 2 atendimentos e R$ 140,00; Rita Recepção com a venda de R$ 59,80', /Tito Tosador[\s\S]{0,200}2[\s\S]{0,120}R\$ 140,00/.test(tpp) && /Rita Recepção[\s\S]{0,200}R\$ 59,80/.test(tpp), tpp.slice(0, 700));
    await pp.screenshot({ path: B.RAIZ + `/testes/saida/lucro-pessoa-${larg}.png` }).catch(() => {});
    T.ok(`sem rolagem lateral em Relatórios (${larg})`, (await N.rolagemLateral(page)) <= 0);

    // o mesmo resultado na tela Financeiro
    await N.ir(page, '/gestao/app/financeiro');
    const kpi = limpo(await page.locator('.g-kpi', { hasText: 'Resultado do mês' }).first().innerText());
    T.ok('Financeiro: Resultado do mês − R$ 50,20 (o mesmo de Quanto sobrou)', /50,20/.test(kpi) && /-|−/.test(kpi.split(/Resultado do mês/i)[1] ?? ''), kpi);

    if (larg === 1366) {
      // Meu pet shop: o custo do material do Banho aparece e a Hidratação ganha um
      await N.ir(page, '/gestao/app/meu-petshop');
      await page.locator('.g-mp-serv', { hasText: 'Hidratação' }).first().click(); await page.waitForTimeout(800);
      const f = page.locator('.g-folha').last();
      const campo = f.getByLabel(/Custo do material de/);
      await campo.waitFor({ timeout: 10000 });
      for (let i = 0; i < 20 && await campo.isDisabled(); i++) await page.waitForTimeout(200);
      await campo.fill('4,20');
      await f.getByRole('button', { name: 'Salvar' }).click(); await page.waitForTimeout(1500);
      T.ok('o dono grava R$ 4,20 de material na Hidratação', B.num(`select custo_material from servicos where id='${L.S['Hidratação']}'`) === 4.2);
      await page.locator('.g-mp-serv', { hasText: 'Banho' }).first().click(); await page.waitForTimeout(1200);
      const v = await page.locator('.g-folha').last().getByLabel(/Custo do material de/).inputValue();
      T.ok('o Banho abre com R$ 8,50', v === '8,50', v);
      const fb = page.locator('.g-folha').last();
      await fb.getByLabel(/Custo do material de/).scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: B.RAIZ + '/testes/saida/lucro-servico-1366.png' }).catch(() => {});
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      B.sql(`update servicos set custo_material = null where id='${L.S['Hidratação']}'`);
    }
    T.ok(`nenhum erro na tela (${larg})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();

    // o tosador, na tela Hoje: "Meu mês" com os atendimentos e sem reais
    const tc = await N.contexto(larg, alt);
    await N.entrar(tc.page, L.emails.tosador, L.senha);
    const mm = tc.page.locator('section[aria-label="Meu mês"]');
    await mm.waitFor({ timeout: 20000 }).catch(() => {});
    const tm = limpo(await mm.innerText().catch(() => ''));
    T.ok('tosador: Meu mês com 2 atendimentos, sem valor em reais', /2 atendimentos/.test(tm) && !/R\$/.test(tm), tm);
    if (larg === 390) { await mm.scrollIntoViewIfNeeded().catch(() => {}); await tc.page.waitForTimeout(1200); }
    if (larg === 390) await mm.screenshot({ path: B.RAIZ + '/testes/saida/lucro-meu-mes-390.png' }).catch(() => {});
    T.ok(`tosador: sem erro e sem rolagem lateral (${larg})`, tc.erros.length === 0 && (await N.rolagemLateral(tc.page)) <= 0, tc.erros.slice(0, 4));
    await tc.ctx.close();
  }
  await N.fecharNavegador();
}))();
