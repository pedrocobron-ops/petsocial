// Achados da Camila (loja + banho e tosa), pela tela:
// - Pacotes: o pacote vendido aparece na lista na hora, mesmo com a lista do banco demorando (internet lenta), e não repete depois;
// - Financeiro › Alterações: a dona vê o próprio desconto em "Todas (inclui as minhas)" e não em "Só da equipe"; o aviso do
//   Caixa leva para lá, no período do caixa;
// - a parte recebida de uma conta com desconto mostra "Preço e desconto";
// - Relatórios: a comissão abre linha por linha.
// Em 390 px e 1366 px, sem rolagem lateral e sem erro na página.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const N = require('../lib/navegador');
const T = require('../lib/teste')('financeiro-loja');
const D = lib('dinheiro');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Fin loja' });
  const { dono } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  B.sql(`insert into pacotes (petshop_id, nome, servico_id, quantidade, validade_dias, preco) values ('${P}', '4 banhos no mês', '${L.S.Banho}', 4, 30, 180)`);

  // conta do Thor com desconto (120,00 → 113,60), 100 no débito e o resto depois: a dona fecha, como a tela
  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S['Banho e tosa'], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 90 * 6e4).toISOString(), preco: 90 }).select('id').single(), 'horário').id;
  B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: ag, p_servicos: [{ servico_id: L.S['Hidratação'], preco: 30 }] }), 'hidratação');
  const ch = D.novaChaveDeOperacao();
  const itens = [{ tipo: 'servico', nome: 'Banho e tosa', qtd: 1, valor: 90, servico_id: L.S['Banho e tosa'] }, { tipo: 'servico', nome: 'Hidratação', qtd: 1, valor: 30, servico_id: L.S['Hidratação'] }];
  B.must(await dono.rpc('agendamento_fechar_conta', { p_petshop: P, p_agendamento: ag, p_chave: ch, p_passos: [
    { t: 'sem_recebimento', agendamento: ag },
    { t: 'lancamento', nome: 'conta', chave: D.parteDaChave(ch, 'conta'), linha: { tipo: 'entrada', valor: 113.6, forma: null, categoria: 'Banho e tosa', descricao: 'Banho e tosa + Hidratação · Thor', data: L.dia(3), vencimento: L.dia(3), pago: false, agendamento_id: ag, cliente_id: L.tutores.Ana, itens } },
    { t: 'agendamento', id: ag, status: 'concluido' },
    { t: 'receber', conta: '$ref:conta', valor: 100, forma: 'debito', chave: D.parteDaChave(ch, 'parte') },
  ] }), 'fechar a conta');

  for (const [larg, alt, pet] of [[390, 844, 'Mel'], [1366, 900, 'Bob']]) {
    T.secao(`${larg} px`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);

    // Pacotes: a lista do banco demora 4 s depois da venda; o pacote aparece antes disso
    await N.ir(page, '/gestao/app/pacotes');
    let lento = false;
    await page.route(/\/rest\/v1\/pacotes_clientes\?select=/, async (r) => { if (lento && r.request().method() === 'GET') await new Promise((ok) => setTimeout(ok, 4000)); await r.continue(); });
    await page.getByRole('button', { name: 'Vender pacote' }).first().click(); await page.waitForTimeout(700);
    await page.locator('.g-folha').last().getByRole('button', { name: new RegExp(`^${pet}`) }).first().click(); await page.waitForTimeout(700);
    await page.locator('.g-folha').last().getByRole('button', { name: /^4 banhos no mês/ }).first().click(); await page.waitForTimeout(700);
    const f = page.locator('.g-folha').last();
    await f.locator('button', { hasText: 'Pix' }).first().click(); await page.waitForTimeout(300);
    lento = true;
    await f.getByRole('button', { name: /^Receber R\$/ }).click();
    const t0 = Date.now();
    let lista = '';
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(100);
      lista = (await page.locator('.g-main').innerText()).split(/Clientes com pacote/i)[1] ?? '';
      if (lista.includes(pet)) break;
    }
    const ms = Date.now() - t0;
    if (!lista.includes(pet)) await page.screenshot({ path: B.RAIZ + `/testes/saida/pacotes-${larg}.png`, fullPage: true }).catch(() => {});
    T.ok(`o pacote de ${pet} aparece na lista antes de a lista do banco voltar (${ms} ms)`, ms < 3000 && lista.includes(pet) && !/Nenhum pacote vendido/.test(lista), lista.slice(0, 200));
    await page.waitForTimeout(4800);
    lento = false;
    const depois = (await page.locator('.g-main').innerText()).split(/Clientes com pacote/i)[1] ?? '';
    T.ok(`depois que a lista do banco volta, ${pet} aparece uma vez só`, (depois.match(new RegExp(`\\n${pet}\\n`, 'g')) ?? []).length === 1, depois.slice(0, 300));
    T.ok('o banco tem a venda uma vez', B.num(`select count(*) from pacotes_clientes pc join pets p on p.id = pc.pet_id where pc.petshop_id='${P}' and p.nome='${pet}'`) === 1);
    await page.unroute(/\/rest\/v1\/pacotes_clientes\?select=/);

    // Caixa → Financeiro › Alterações (este caixa, todas)
    await N.ir(page, '/gestao/app/caixa');
    await page.getByRole('button', { name: 'Fechar o caixa' }).first().click(); await page.waitForTimeout(1500);
    const link = page.getByRole('link', { name: 'Financeiro, Alterações' });
    T.ok('o Caixa avisa as alterações e leva para Financeiro, Alterações', await link.count() > 0);
    if (await link.count()) {
      await link.first().click();
      await page.waitForURL('**/financeiro?aba=alteracoes**', { timeout: 15000 });
      await page.waitForSelector('[aria-label="Alterações em valores"]', { timeout: 15000 });
      await page.waitForTimeout(1500);
      const sec = page.locator('section[aria-label="Alterações em valores"]');
      const t = (await sec.innerText()).replace(/[\u00a0\u202f]/g, ' ');
      T.ok('abre no período "Este caixa", com "Todas": o desconto da própria dona aparece (de R$ 120,00 para R$ 113,60, feita por você)', /Este caixa/.test(t) && /desconto de R\$ 6,40/.test(t) && /de R\$ 120,00 para R\$ 113,60/.test(t) && /feita por você/.test(t), t.slice(0, 600));
      await sec.getByRole('button', { name: 'Só da equipe' }).click(); await page.waitForTimeout(500);
      const t2 = (await sec.innerText()).replace(/[\u00a0\u202f]/g, ' ');
      T.ok('"Só da equipe": o desconto dela sai e a tela diz que há 1 feito por ela', !/desconto de R\$ 6,40/.test(t2) && /1 feita por você/.test(t2), t2.slice(0, 400));
    }
    T.ok(`sem rolagem lateral em Alterações (${larg})`, (await N.rolagemLateral(page)) <= 0);
    if (larg === 1366) await page.screenshot({ path: B.RAIZ + '/testes/saida/alteracoes-1366.png', fullPage: true }).catch(() => {});

    // a parte recebida mostra o desconto da conta
    await page.locator('.g-seg button', { hasText: 'Lançamentos' }).click(); await page.waitForTimeout(800);
    await page.locator('.g-main .g-linha', { hasText: '(parte)' }).first().click(); await page.waitForTimeout(1500);
    const folha = (await page.locator('.g-folha').last().innerText()).replace(/[\u00a0\u202f]/g, ' ');
    T.ok('a parte de R$ 100,00 mostra "Preço e desconto": desconto de R$ 6,40, de R$ 120,00 para R$ 113,60', /Preço e desconto/i.test(folha) && /Desconto de R\$ 6,40/.test(folha) && /de R\$ 120,00 para R\$ 113,60/.test(folha), folha.slice(0, 500));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);

    // Relatórios: comissão linha por linha
    await N.ir(page, '/gestao/app/relatorios');
    const bt = page.getByRole('button', { name: 'Linha por linha' }).first();
    if (await bt.count()) { await bt.scrollIntoViewIfNeeded(); await bt.click(); await page.waitForTimeout(1500); }
    const ext = (await page.locator('.gr-com-extrato').first().innerText().catch(() => '')).replace(/[\u00a0\u202f]/g, ' ');
    T.ok('Relatórios: a comissão abre linha por linha (85,20 × 40% = 34,08; 28,40 × 40% = 11,36; total 45,44)', /Banho e tosa/.test(ext) && /R\$ 85,20 × 40%/.test(ext) && /R\$ 34,08/.test(ext) && /R\$ 28,40 × 40%/.test(ext) && /R\$ 11,36/.test(ext) && /Total R\$ 45,44/.test(ext), ext.slice(0, 400));
    T.ok(`sem rolagem lateral em Relatórios (${larg})`, (await N.rolagemLateral(page)) <= 0);
    T.ok(`nenhum erro na tela (${larg})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
