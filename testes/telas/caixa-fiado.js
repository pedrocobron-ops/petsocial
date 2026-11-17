// Caixa, fiado, comprovante, desconto em % e pacote por porte pela tela (migração 20261216; achados da Neide), com a dona.
// 390: Fechar a conta da Luna (Banho 70 + Hidratação 25): desconto em % (10% = R$ 9,50) e de volta a reais; "Incluir nesta conta?"
//      com o fiado de R$ 55, Dinheiro 100 + Pix 20 e "Pagou só isso" → o comprovante (na hora e depois, pelo horário) diz
//      Dinheiro R$ 100,00 + Pix R$ 20,00, o que foi para o fiado e que ainda deve R$ 30,00 (antes: "Pagamento: Dinheiro").
//      O fiado do caderno aparece como "deve desde" (sem vencimento inventado). Concluir o horário de amanhã pergunta antes.
//      Com o caixa já fechado hoje, a conta diz "O caixa de hoje já foi fechado" (e não "Falta abrir o caixa do dia").
// 1366: Pacotes › modelo com preço por porte; na venda para a Mel (porte P) vale o preço do P.
// Em cada tela: nenhum erro de página ou console e sem rolagem para o lado. Capturas em testes/saida/caixa-fiado-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('caixa-fiado-tela');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Caixa fiado tela', modulos: ['banho_tosa', 'loja', 'pacotes'] });
  const { dono } = L.sb;
  const P = L.P;
  const caixa = B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 50 }).select('id').single(), 'caixa').id;
  // o fiado do caderno, como a importação grava agora: vence no dia anotado
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 55, categoria: 'Outros', descricao: 'fiado (banho)', pago: false, forma: null,
    data: L.dia(-15), vencimento: L.dia(-15), devido_desde: L.dia(-15), cliente_id: L.tutores.Clara, origem: 'tela' }).select('id'), 'fiado');
  const marca = async (pet, dia, h, preco) => {
    const ini = B.instante(dia, h, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco }).select('id').single(), 'horário').id;
  };
  const luna = await marca('Luna', L.hoje, '07:30', 70);
  B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: luna, p_servicos: [{ servico_id: L.S['Hidratação'], preco: 25 }] }), 'hidratação');
  const thor = await marca('Thor', L.dia(1), '10:00', 60);

  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const foto = (page, nome, cheia = false) => page.screenshot({ path: path.join(saida, `caixa-fiado-${nome}.png`), fullPage: cheia }).catch(() => {});
  const semErros = (onde, erros) => { T.ok(`${onde}: nenhum erro de página, console ou pedido recusado`, erros.length === 0, erros); erros.length = 0; };
  const semLado = async (onde, page) => { const x = await N.rolagemLateral(page); T.ok(`${onde}: sem rolagem para o lado`, x <= 0, `${x}px`); };
  const txt = async (l) => (await l.innerText()).replace(/\u00a0/g, ' ');
  const zap = async (l) => decodeURIComponent(((await l.getAttribute('href')) ?? '').split('text=')[1] ?? '').replace(/\u00a0/g, ' ');

  let { ctx, page, erros } = await N.contexto(390, 844);
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);

  T.secao('390: desconto em % na conta');
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Luna' }).first().click();
  let det = page.locator('.g-folha').last();
  await det.locator('button', { hasText: 'Fechar a conta' }).click({ timeout: 15000 });
  let conta = page.locator('.g-folha').last();
  await conta.locator('button.g-btn.pri', { hasText: 'Receber R$ 95,00' }).waitFor({ timeout: 15000 });
  await conta.locator('button', { hasText: /^%$/ }).click();
  await conta.locator('input[aria-label="Desconto em porcentagem"]').fill('10');
  await conta.locator('button.g-btn.pri', { hasText: 'Receber R$ 85,50' }).waitFor({ timeout: 5000 });
  T.ok('10% vira R$ 9,50 e a conta fica R$ 85,50', /10% = R\$ 9,50 de desconto/.test(await txt(conta)), (await txt(conta)).match(/10%[^\n]*/)?.[0]);
  await conta.locator('.g-vd-desconto').scrollIntoViewIfNeeded();
  await foto(page, 'desconto-pct-390');
  await semLado('Desconto em % 390', page);
  await conta.locator('button', { hasText: /^R\$$/ }).click();
  await conta.locator('button.g-btn.pri', { hasText: 'Receber R$ 95,00' }).waitFor({ timeout: 5000 });
  T.ok('voltar para R$ limpa o desconto (R$ 95,00)', true);

  T.secao('390: fiado junto e pagamento dividido (Neide M1)');
  T.ok('a conta mostra o fiado do caderno, em atraso', /fiado \(banho\) \(R\$ 55,00, em atraso\)/.test(await txt(conta)), (await txt(conta)).match(/Deve de antes[^\n]*\n[^\n]*\n[^\n]*/)?.[0]);
  await conta.locator('.g-agd-junto input[type=checkbox]').check();
  await conta.locator('button', { hasText: 'Dividir o pagamento' }).click();
  await conta.locator('select[aria-label="Forma da 1ª parte"]').selectOption({ label: 'Dinheiro' });
  await conta.locator('input[aria-label="Valor da 1ª parte"]').fill('100');
  await conta.locator('select[aria-label="Forma da 2ª parte"]').selectOption({ label: 'Pix' });
  await conta.locator('input[aria-label="Valor da 2ª parte"]').fill('20');
  await page.waitForTimeout(300);
  await conta.locator('button', { hasText: 'Pagou só isso, o resto fica para depois' }).click();
  await conta.locator('button.g-btn.pri', { hasText: 'Receber R$ 120,00' }).click({ timeout: 5000 });
  const fechada = page.locator('.g-folha', { hasText: 'Conta fechada' });
  await fechada.waitFor({ timeout: 15000 });
  const naHora = await zap(fechada.locator('a', { hasText: 'Mandar comprovante' }));
  T.ok('o comprovante na hora: R$ 120 em Dinheiro R$ 100,00 + Pix R$ 20,00, R$ 25 do fiado, ainda deve R$ 30,00',
    /Pago agora: R\$ 120,00 \(Dinheiro R\$ 100,00 \+ Pix R\$ 20,00\)/.test(naHora) && /Pagou R\$ 25,00 do que devia de antes \(R\$ 55,00\); ainda deve R\$ 30,00/.test(naHora), naHora);
  await foto(page, 'conta-fechada-390');
  await fechada.locator('button', { hasText: 'Pronto' }).click();
  await page.waitForTimeout(800);
  // depois, pelo horário (o comprovante que a Neide mandou)
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Luna' }).first().click();
  det = page.locator('.g-folha').last();
  const link = det.locator('a', { hasText: 'Mandar comprovante' });
  await link.waitFor({ timeout: 15000 });
  let depois = '';
  for (let i = 0; i < 30 && !/ainda deve R\$ 30,00/.test(depois); i++) { depois = await zap(link); if (!/ainda deve/.test(depois)) await page.waitForTimeout(250); }
  T.ok('pelo horário, depois: o comprovante diz o que foi para o fiado e que ainda deve R$ 30,00', /Pagou R\$ 25,00 do que devia de antes \(R\$ 55,00\); ainda deve R\$ 30,00/.test(depois), depois);
  T.ok('… com Total R$ 95,00, Total pago agora R$ 120,00 e Pagamento: Dinheiro R$ 100,00 + Pix R$ 20,00 (antes: "Pagamento: Dinheiro")',
    /Total: R\$ 95,00/.test(depois) && /Total pago agora: R\$ 120,00/.test(depois) && /Pagamento: Dinheiro R\$ 100,00 \+ Pix R\$ 20,00/.test(depois), depois);
  await det.locator('a', { hasText: 'Mandar comprovante' }).scrollIntoViewIfNeeded();
  await foto(page, 'horario-pago-390');
  await semLado('Horário pago 390', page);
  semErros('Conta da Luna 390', erros);

  T.secao('390: a ficha da Clara mostra "deve desde" (Neide M2)');
  await N.ir(page, `/gestao/app/caixa`);
  const cartao = page.locator('.gr-devedor', { hasText: 'Clara' }).first();
  await cartao.waitFor({ timeout: 15000 });
  const ct = await txt(cartao);
  T.ok('Contas de clientes: "deve desde" a data do caderno, sem "vence em" inventado', /deve desde \d\d\/\d\d/.test(ct) && !/vence em/.test(ct) && /R\$ 30,00/.test(ct), ct);
  semErros('Caixa 390', erros);

  T.secao('390: concluir o horário de amanhã pergunta antes (Neide L2)');
  await N.ir(page, `/gestao/app/agenda?dia=${L.dia(1)}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Thor' }).first().click();
  det = page.locator('.g-folha').last();
  await det.locator('button', { hasText: 'Fechar a conta' }).click({ timeout: 15000 });
  conta = page.locator('.g-folha').last();
  await conta.locator('button.g-btn.pri', { hasText: 'Receber' }).waitFor({ timeout: 15000 });
  await conta.locator('.g-chips button, button.g-chip', { hasText: 'Pix' }).first().click();
  await conta.locator('button.g-btn.pri', { hasText: 'Receber' }).click();
  const pergunta = page.locator('[role=dialog], [role=alertdialog]', { hasText: 'Este horário é de amanhã' }).last();
  await pergunta.waitFor({ timeout: 8000 });
  T.ok('aparece "Este horário é de amanhã (…)" com Concluir hoje mesmo assim', /Este horário é de amanhã \(\w+/.test(await txt(pergunta)) && /Concluir hoje mesmo assim/.test(await txt(pergunta)), await txt(pergunta));
  await foto(page, 'amanha-390');
  await pergunta.locator('button', { hasText: 'Voltar' }).click();
  await page.waitForTimeout(800);
  T.ok('voltou: o Thor continua marcado e nada foi lançado', B.sql(`select status from agendamentos where id='${thor}'`) === 'marcado' && B.num(`select count(*) from lancamentos where agendamento_id='${thor}'`) === 0);

  T.secao('390: o caixa de hoje já foi fechado');
  B.sql(`update caixas set fechado_em = now(), valor_contado = 150 where id='${caixa}'`);
  await N.ir(page, `/gestao/app/agenda?dia=${L.dia(1)}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Thor' }).first().click();
  det = page.locator('.g-folha').last();
  await det.locator('button', { hasText: 'Fechar a conta' }).click({ timeout: 15000 });
  conta = page.locator('.g-folha').last();
  const aviso = conta.locator('.g-cx-fora');
  await aviso.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1200);
  const av = await txt(aviso);
  T.ok('a conta diz "O caixa de hoje já foi fechado", com Abrir de novo (não "Falta abrir")', /O caixa de hoje já foi fechado, às \d\d:\d\d/.test(av) && /Abrir de novo/.test(av) && !/Falta abrir/.test(av), av);
  await aviso.scrollIntoViewIfNeeded();
  await foto(page, 'caixa-fechado-390');
  await semLado('Caixa fechado 390', page);
  semErros('Conta do Thor 390', erros);
  await ctx.close();

  T.secao('1366: pacote com preço por porte');
  B.must(await dono.from('pacotes').insert({ petshop_id: P, nome: '4 banhos', servico_id: L.S.Banho, quantidade: 4, validade_dias: 30, preco: 170, precos_porte: { P: 160, M: 180, G: 200 } }).select('id'), 'modelo');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app/pacotes');
  await page.locator('button', { hasText: 'Modelos de pacote' }).click();
  const mod = page.locator('.g-pac-modelo', { hasText: '4 banhos' });
  await mod.waitFor({ timeout: 15000 });
  T.ok('o modelo mostra P R$ 160 · M R$ 180 · G R$ 200', /P R\$ 160,00 · M R\$ 180,00 · G R\$ 200,00/.test(await txt(mod)), await txt(mod));
  await mod.locator('button.corpo').click();
  let folha = page.locator('.g-folha').last();
  await folha.locator('input[aria-label="Preço do pacote para porte M"]').waitFor({ timeout: 8000 });
  T.ok('a folha do modelo abre com Preço por porte marcado e os preços', (await folha.locator('label', { hasText: 'Preço por porte' }).locator('input').isChecked()) && (await folha.locator('input[aria-label="Preço do pacote para porte M"]').inputValue()) === '180,00');
  await foto(page, 'modelo-1366');
  await semLado('Modelo de pacote 1366', page);
  await folha.locator('button', { hasText: 'Voltar' }).click();
  await page.locator('button', { hasText: 'Vender pacote' }).first().click();
  folha = page.locator('.g-folha').last();
  await folha.locator('input').first().fill('Mel');
  await folha.locator('button.g-linha', { hasText: 'Mel' }).first().click();
  folha = page.locator('.g-folha').last();
  const linha = folha.locator('button.g-linha', { hasText: '4 banhos' });
  await linha.waitFor({ timeout: 8000 });
  T.ok('na venda para a Mel (P): R$ 160,00, porte P', /R\$ 160,00/.test(await txt(linha)) && /porte P/.test(await txt(linha)), await txt(linha));
  await linha.click();
  await page.locator('.g-folha').last().locator('button.g-btn.pri', { hasText: 'Receber R$ 160,00' }).waitFor({ timeout: 8000 });
  T.ok('… e o botão Receber R$ 160,00', true);
  await foto(page, 'venda-pacote-1366');
  semErros('Pacotes 1366', erros);
  await ctx.close();
  await N.fecharNavegador();
}))();
