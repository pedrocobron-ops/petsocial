// Telas: rodada 8, quem está começando num celular pequeno (estreante), em 360 px.
//  - uma conta só: conta nova de banho e tosa vê "Agora, o primeiro cliente" e "Faltam 2 coisas para começar"; nenhum
//    "Cadastrar o primeiro pet" (o pet entra ao marcar); o botão do alto é "Marcar o primeiro horário".
//  - a Ajuda num lugar só: o botão Ajuda do alto já vem com a tela e abre a folha com Tirar uma dúvida, Pedir para o Mozart fazer,
//    Manual e o passo a passo da tela; o Ajuda do menu Mais abre a mesma folha; Tirar uma dúvida abre a conversa.
//  - 360 px: sem rolagem para o lado, o nome do pet shop inteiro no alto (duas linhas), os 7 dias da agenda com 44 px,
//    "Usar o mesmo horário em todos os dias abertos" dentro da tela.
//  - o cartão do pedido pelo link mostra o valor do porte (Banho M = R$ 60,00).
//  - o álbum chama a visita pelos serviços feitos ("Banho e corte de unhas"), não "Banho e tosa".
//  - modo simples: Relatórios vai para Outras áreas, a Agenda fica sem Quadro e Imprimir, o horário guarda o resto em Mais opções
//    (Cliente cancelou, Apagar) e o recebimento só oferece abrir o caixa quando a forma é Dinheiro (rodada 9). Desligado (pet shop de antes): tudo como era.
const B = require('../lib/base');
const N = require('../lib/navegador');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('estreante-m-tela');
const O = require('../lib/app').lib('opcoes');
const FOTOS = process.env.FOTOS ? require('path').join(B.RAIZ, 'testes', 'saida') + '/' : null;
const foto = (page, nome) => (FOTOS ? page.screenshot({ path: FOTOS + 'estreante-m-' + nome + '.png' }) : null);
const txt = async (l) => (await l.innerText()).replace(/ /g, ' ');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Banho e Tosa da Cida', modulos: ['banho_tosa'], dados: false, equipe: false });
  const { ctx, page, erros } = await N.contexto(360, 740);
  await N.entrar(page, L.emails.dono, L.senha);

  T.secao('conta nova: uma conta só, sem pedir o pet três vezes');
  await N.ir(page, '/gestao/app');
  await page.waitForSelector('.g-pps', { timeout: 20000 }).catch(() => {});
  await foto(page, 'hoje');
  const corpo = await txt(page.locator('.g-main'));
  T.ok('o cartão diz "Agora, o primeiro cliente" e "Faltam 2 coisas para começar"', /Agora, o primeiro cliente/.test(corpo) && /Faltam 2 coisas para começar/.test(corpo), corpo.slice(0, 600));
  T.ok('nenhum "Cadastrar o primeiro pet" na tela (antes: três vezes)', !/Cadastrar o primeiro pet/.test(corpo), corpo.match(/.*Cadastrar o primeiro pet.*/g));
  T.ok('o botão do alto é "Marcar o primeiro horário"', (await page.locator('.g-topo .g-btn.pri', { hasText: 'Marcar o primeiro horário' }).count()) === 1);

  T.secao('a Ajuda num lugar só');
  const botao = page.locator('[data-teste=botao-ajuda]');
  T.ok('o botão Ajuda está no alto, com a tela', await botao.isVisible());
  const caixa = await botao.boundingBox();
  T.ok('o botão Ajuda tem 44 px de altura', caixa && caixa.height >= 43.5, caixa);
  await botao.click(); await page.waitForTimeout(900);
  let folha = page.locator('.g-folha').last();
  const f1 = await txt(folha);
  T.ok('abre Tirar uma dúvida, Pedir para o Mozart fazer e Manual', /Tirar uma dúvida/.test(f1) && /Pedir para o Mozart fazer/.test(f1) && /Manual/.test(f1), f1.slice(0, 300));
  T.ok('… e o passo a passo da tela Hoje', /Como usar a tela Hoje/i.test(f1) && /Como ler a tela Hoje/.test(f1), f1.slice(0, 600));
  await foto(page, 'ajuda');
  await folha.locator('[data-teste=ajuda-duvida]').click(); await page.waitForTimeout(700);
  T.ok('Tirar uma dúvida abre a conversa da Ajuda', await page.locator('section[role=dialog][aria-label="Ajuda"]').isVisible());
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.locator('.g-abas button', { hasText: 'Mais' }).click(); await page.waitForTimeout(700);
  await page.locator('.g-folha').last().locator('button', { hasText: 'Ajuda' }).last().click(); await page.waitForTimeout(800);
  folha = page.locator('.g-folha').last();
  T.ok('o Ajuda do menu Mais abre a mesma folha', (await folha.locator('[data-teste=ajuda-mozart]').count()) === 1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  T.secao('360 px');
  for (const r of ['/gestao/app', '/gestao/app/agenda', '/gestao/app/meu-petshop', '/gestao/app/clientes', '/gestao/app/manual']) {
    await N.ir(page, r);
    T.ok(`${r}: sem rolagem para o lado`, (await N.rolagemLateral(page)) <= 0);
  }
  await N.ir(page, '/gestao/app');
  const nome = await page.locator('.g-barra-marca > span:last-child').evaluate((e) => ({ inteiro: e.scrollHeight <= e.clientHeight + 1 && e.scrollWidth <= e.clientWidth + 1, texto: e.textContent }));
  T.ok('o nome do pet shop aparece inteiro no alto (duas linhas)', nome.inteiro, nome);
  await N.ir(page, '/gestao/app/agenda');
  const dias = await page.locator('.g-ag-faixa .g-dia').evaluateAll((l) => l.map((e) => Math.round(e.getBoundingClientRect().width)));
  T.ok('os 7 dias da agenda têm pelo menos 44 px', dias.length === 7 && dias.every((w) => w >= 44), dias);
  await foto(page, 'agenda');
  await N.ir(page, '/gestao/app/meu-petshop');
  const igualar = page.locator('button', { hasText: 'Usar o mesmo horário em todos os dias abertos' });
  if (!(await igualar.isVisible().catch(() => false))) await page.locator('.g-mp-grupo', { hasText: 'Horário de funcionamento' }).first().locator('button').first().click().catch(() => {});
  const bx = await igualar.boundingBox().catch(() => null);
  T.ok('"Usar o mesmo horário em todos os dias abertos" fica dentro da tela', bx && bx.x >= 0 && bx.x + bx.width <= 360.5, bx);

  T.secao('pedido pelo link com o valor');
  B.sql(`insert into pedidos_agendamento (petshop_id, servico_id, inicio, fim, tutor_nome, telefone, pet_nome, especie, porte) values ('${L.P}', '${L.S.Banho}', '${L.dia(2)}T13:00:00-03', '${L.dia(2)}T14:00:00-03', 'Tutor Teste 2', '11977770000', 'Bolinha', 'cao', 'M')`);
  await N.ir(page, '/gestao/app/agenda');
  const pedido = page.locator('.g-pl-item', { hasText: 'Bolinha' }).first();
  await pedido.waitFor({ timeout: 15000 }).catch(() => {});
  T.ok('o cartão do pedido mostra R$ 60,00 (Banho, porte M)', /R\$\s60,00/.test(await txt(pedido).catch(() => '')), await txt(pedido).catch(() => ''));

  T.secao('álbum com os serviços feitos');
  const c = B.must(await L.sb.dono.from('clientes').insert({ petshop_id: L.P, nome: 'Tutor Teste 1', telefone: '11966660000' }).select('id').single(), 'tutor').id;
  const mel = B.must(await L.sb.dono.from('pets').insert({ petshop_id: L.P, cliente_id: c, nome: 'Mel', especie: 'cao', porte: 'P', sexo: 'F' }).select('id').single(), 'pet').id;
  const ag = B.must(await L.sb.dono.from('agendamentos').insert({ petshop_id: L.P, pet_id: mel, servico_id: L.S.Banho, inicio: `${L.hoje}T08:00:00-03:00`, fim: `${L.hoje}T09:00:00-03:00` }).select('id').single(), 'horário').id;
  B.sql(`insert into agendamento_servicos (petshop_id, agendamento_id, servico_id, ordem, preco) values ('${L.P}', '${ag}', '${L.S['Corte de unhas']}', 1, 15); update agendamentos set preco = 50, foto_antes = '${L.P}/teste-antes.jpg' where id = '${ag}'`);
  await N.ir(page, `/gestao/app/clientes?pet=${mel}`);
  const album = page.locator('.g-bol-album');
  await album.waitFor({ timeout: 15000 }).catch(() => {});
  const ta = await txt(album).catch(() => '');
  T.ok('a visita é "Banho e corte de unhas", não "Banho e tosa"', /Banho e corte de unhas/.test(ta) && !/Banho e tosa/.test(ta), ta.slice(0, 300));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  T.secao('modo simples desligado: como sempre');
  await N.ir(page, '/gestao/app/agenda');
  T.ok('a Agenda tem Quadro do dia e Imprimir', (await page.locator('a.g-btn', { hasText: 'Quadro do dia' }).count()) === 1 && (await page.locator('a.g-btn', { hasText: 'Imprimir' }).count()) === 1);

  T.secao('modo simples ligado');
  await O.salvarOpcoes(L.sb.dono, L.P, { 'geral.modo_simples': true });
  await N.ir(page, '/gestao/app/agenda');
  T.ok('a Agenda fica sem Quadro e sem Imprimir', (await page.locator('a.g-btn', { hasText: 'Quadro do dia' }).count()) === 0 && (await page.locator('a.g-btn', { hasText: 'Imprimir' }).count()) === 0);
  await page.locator('.g-abas button', { hasText: 'Mais' }).click(); await page.waitForTimeout(700);
  const mais = page.locator('.g-folha').last();
  const antesDeAbrir = await txt(mais);
  await mais.locator('.g-mais-outras').click().catch(() => {}); await page.waitForTimeout(300);
  const depoisDeAbrir = await txt(mais);
  T.ok('Relatórios e Escola saem da frente e ficam em Outras áreas', !/Relatórios/.test(antesDeAbrir.split('Outras áreas')[0]) && /Relatórios/.test(depoisDeAbrir) && /Escola de Gestão/.test(depoisDeAbrir), antesDeAbrir);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  B.sql(`update agendamentos set foto_antes = null where id = '${ag}'`);
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Mel' }).first().click(); await page.waitForTimeout(1500);
  const det = page.locator('.g-folha').last();
  const resumo = det.locator('.g-agd-mais > summary');
  T.ok('o horário tem "Mais opções" fechado, com Cliente cancelou dentro', (await resumo.count()) === 1 && !(await det.locator('button', { hasText: 'Cliente cancelou' }).isVisible()));
  await resumo.click(); await page.waitForTimeout(300);
  T.ok('abrindo: Cliente cancelou e Apagar (marquei errado)', (await det.locator('button', { hasText: 'Cliente cancelou' }).isVisible()) && (await det.locator('button', { hasText: 'Apagar (marquei errado)' }).isVisible()));
  await foto(page, 'horario-simples');
  await det.locator('button', { hasText: 'Fechar a conta' }).first().click(); await page.waitForTimeout(1500);
  const conta = await txt(page.locator('.g-folha').last());
  T.ok('sem forma escolhida, o recebimento não fala do caixa (Banho 50 + Corte de unhas 15)', !/Falta abrir o caixa/.test(conta) && /Receber R\$\s65,00/.test(conta), conta.slice(-300));
  // rodada 9: escolhendo Dinheiro, o caixa do dia é oferecido ali mesmo (sem isso, o primeiro fechamento dava diferença na gaveta)
  const folhaConta = page.locator('.g-folha').last();
  await folhaConta.locator('.g-chips button, button.g-chip', { hasText: 'Pix' }).first().click(); await page.waitForTimeout(300);
  T.ok('com Pix, continua sem falar do caixa', !/Falta abrir o caixa/.test(await txt(folhaConta)));
  await folhaConta.locator('.g-chips button, button.g-chip', { hasText: 'Dinheiro' }).first().click(); await page.waitForTimeout(600);
  const comDinheiro = await txt(folhaConta);
  T.ok('com Dinheiro: "Falta abrir o caixa do dia", com Troco na gaveta agora e o botão Abrir o caixa', /Falta abrir o caixa do dia/.test(comDinheiro) && /Troco na gaveta agora/.test(comDinheiro) && (await folhaConta.getByRole('button', { name: 'Abrir o caixa' }).isVisible()), comDinheiro.slice(-500));
  await foto(page, 'conta-simples');

  T.ok('nenhum erro de página', erros.length === 0, erros.slice(0, 4));
  await ctx.close();
  await N.fecharNavegador();
}))();
