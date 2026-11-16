// Check-out do hotel com internet lenta (achado da Bia): a folha não pode mostrar "Receber R$ 110,00" antes do sinal pago e
// do desconto do segundo pet chegarem. Atrasa de propósito a leitura do sinal (2,5 s) e confere: enquanto carrega, nenhum
// valor e o botão apagado (o clique não faz nada); depois, o valor certo ao centavo e uma entrada só. 390 e 1366.
//   Thor: diária 110, 1 noite, sinal pago 107,25 → falta 2,75.
//   Mel (mesmo tutor, diária 80, 2º pet 20%): noite 80 − 16 = 64, sinal pago 62,40 → falta 1,60.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('checkout-lento');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Check-out lento' });
  const { dono, caixa } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'hotel.desconto_segundo_pet': { ativo: true, pct: 20 } } }), 'segundo pet');
  // entrou ontem ao meio-dia: 1 noite
  const ontem = B.instante(B.somaDias(L.hoje, -1), '12:00', L.fuso).toISOString();
  async function hospede(pet, diaria, sinal) {
    const id = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'hotel', status: 'em_casa', entrada: ontem, valor_diaria: diaria }).select('id').single(), pet).id;
    B.must(await caixa.rpc('estadia_sinal', { p_petshop: P, p_estadia: id, p_chave: `t-sinal-${B.sufixo()}`, p_passos: [
      { t: 'lancamento', nome: 'sinal', linha: { tipo: 'entrada', valor: sinal, forma: 'pix', categoria: 'Creche e hotel', descricao: `Sinal da reserva: hotel de ${pet}`, cliente_id: L.tutores.Ana, pago: true, data: L.hoje } },
      { t: 'estadia_valores', estadia: id, modo: 'upsert', campos: { sinal, sinal_estado: 'pago', sinal_lancamento_id: '$ref:sinal', sinal_pago_em: L.hoje } },
    ] }), 'sinal ' + pet);
    return id;
  }
  const E = { Thor: await hospede('Thor', 110, 107.25), Mel: await hospede('Mel', 80, 62.40) };
  const entradas = (pet) => JSON.parse(B.sql(`select coalesce(json_agg(json_build_object('valor', valor, 'forma', forma, 'cat', categoria) order by criado_em), '[]') from lancamentos where petshop_id='${P}' and tipo='entrada' and descricao like 'Hotel:%${pet}%'`));

  async function saida(larg, alt, pet, falta, forma) {
    T.secao(`${larg}px: check-out de ${pet} com a leitura do sinal atrasada`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.caixa, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    // a leitura do sinal e das taxas da estadia demora 2,5 s (como num celular com internet fraca)
    await page.route('**/rest/v1/estadias_valores?*', async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); await r.continue().catch(() => {}); });
    await page.locator('.g-ch-cartao', { hasText: pet }).first().locator('button', { hasText: 'Check-out' }).click();
    const folha = page.locator('.g-folha').last();
    await folha.waitFor({ timeout: 10000 });
    const botao = folha.locator('button.g-btn.pri');
    const amostras = [];
    for (let k = 0; k < 6; k++) {
      await page.waitForTimeout(250);
      amostras.push({ txt: (await botao.innerText()).replace(/\u00a0/g, ' '), off: await botao.isDisabled(), corpo: (await folha.innerText()).replace(/\u00a0/g, ' ') });
    }
    if (larg === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/checkout-lento-carregando-${larg}.png` }).catch(() => {});
    T.ok('enquanto carrega: botão apagado, "Carregando a conta…", sem valor nenhum na folha', amostras.every((a) => a.off && /Carregando a conta/.test(a.txt) && !/R\$/.test(a.corpo)), amostras.map((a) => `${a.off ? 'apagado' : 'ATIVO'} ${a.txt}${/R\$/.test(a.corpo) ? ' (com valor)' : ''}`));
    T.ok('a folha diz o que está buscando', /Buscando o sinal, os descontos/.test(amostras[0].corpo), amostras[0].corpo.slice(0, 200));
    await botao.click({ force: true }).catch(() => {});
    await page.waitForTimeout(300);
    T.ok('clicar no botão apagado não grava nada', entradas(pet).length === 0);
    await folha.locator('button.g-btn.pri', { hasText: `Receber R$ ${falta}` }).waitFor({ timeout: 15000 });
    const corpo = (await folha.innerText()).replace(/\u00a0/g, ' ');
    if (larg === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/checkout-lento-pronto-${larg}.png` }).catch(() => {});
    T.ok(`com tudo carregado: "Receber R$ ${falta}" e a linha do sinal já pago`, /Sinal já pago/.test(corpo) && new RegExp(`Falta receber\\s*R\\$ ${falta.replace(',', ',')}`).test(corpo), corpo.slice(0, 600));
    await folha.locator('.g-chips button, button.g-chip', { hasText: forma }).first().click();
    await page.waitForTimeout(300);
    await folha.locator('button.g-btn.pri', { hasText: 'Receber' }).dblclick();
    await page.locator('.g-folha', { hasText: 'Conta fechada' }).waitFor({ timeout: 15000 });
    const c = entradas(pet);
    T.ok(`uma entrada só, de R$ ${falta}`, c.length === 1 && B.centavos(c[0].valor) === B.centavos(Number(falta.replace(',', '.'))), c);
    T.ok(`nenhum erro na tela (${larg})`, erros.length === 0, erros.slice(0, 4));
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
  await saida(390, 844, 'Thor', '2,75', 'Dinheiro');
  await saida(1366, 900, 'Mel', '1,60', 'Pix');
  const tot = (id) => B.sql(`select valor_cobrado from estadias where id='${id}'`);
  T.ok('estadias gravadas com o total certo: Thor 110,00, Mel 64,00', Number(tot(E.Thor)) === 110 && Number(tot(E.Mel)) === 64, [tot(E.Thor), tot(E.Mel)]);
  await N.fecharNavegador();
}))();
