// Caixa e fichas num hotel só (achados da Bia, itens 11, 14 a 18), pela tela, em 390 e 1366. Conta feita à mão:
//   Caixa aberto com R$ 100,00 de troco. Entrou hoje (tudo Pix, menos a diária do Bob):
//     sinal do Thor 107,25 + sinal da Mel 62,40 (reservas para daqui a 3 dias) + sinal da Luna 285,00 (na casa desde hoje)
//     + sinal do Bob 220,00 + diária do Bob 2,75 em dinheiro = 677,40.
//   Saiu hoje: devolução ao Beto 110,00 (Pix).  Saldo de hoje: 677,40 − 110,00 = 567,40.
//   Gaveta: 100,00 + 2,75 em dinheiro = 102,75.
//   Luna sai hoje (1 diária de 95,00, sinal 285,00): pago a mais 190,00, deixado de crédito. Conta fechada: Recebido agora
//   R$ 0,00 e, à parte, "Ficou de crédito para o tutor: R$ 190,00". O caixa avisa os 190,00 de crédito (não saiu dinheiro).
//   Fichas dos pets: Mel 62,40 (só o sinal), Thor 107,25, Luna 285,00 − 190,00 = 95,00, Bob 220,00 + 2,75 − 110,00 = 112,75.
//   Ficha da Ana: categoria "Hotel" (nunca "Creche e hotel"); sinal sem a data velha.
//   Relatórios: 4 noites reservadas de hoje em diante (Thor e Mel, 2 noites cada), a última em +4; a estadia da Luna,
//   encerrada hoje, não conta. Página do tutor: "Luna veio hoje. Ainda não tem diário nem fotos."; Rex, que nunca veio, o texto de antes.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('caixa-fichas');

const txt = (s) => s.replace(/ /g, ' ');
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Caixa fichas', modulos: ['hotel'] });
  const { dono, caixa } = L.sb;
  const P = L.P;
  const cx = B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id').single(), 'caixa').id;
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'casa.tutor': { ativo: true, dias_fotos: 90 } } }), 'página do tutor');

  async function estadia(pet, status, entrada, saida, diaria, sinal, cliente) {
    const id = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'hotel', status, entrada, saida_prevista: saida, valor_diaria: diaria }).select('id').single(), pet).id;
    // a descrição como o app gravava: com o dia da chegada reservada
    B.must(await caixa.rpc('estadia_sinal', { p_petshop: P, p_estadia: id, p_chave: `t-sinal-${B.sufixo()}`, p_passos: [
      { t: 'lancamento', nome: 'sinal', linha: { tipo: 'entrada', valor: sinal, forma: 'pix', categoria: 'Creche e hotel', descricao: `Sinal da reserva: hotel de ${pet}, ${ddmm(entrada === chega ? L.dia(3) : L.hoje)}`, cliente_id: cliente, pago: true, data: L.hoje } },
      { t: 'estadia_valores', estadia: id, modo: 'upsert', campos: { sinal, sinal_estado: 'pago', sinal_lancamento_id: '$ref:sinal', sinal_pago_em: L.hoje } },
    ] }), 'sinal ' + pet);
    return id;
  }
  const chega = B.instante(L.dia(3), '12:00', L.fuso).toISOString(), sai = B.instante(L.dia(5), '12:00', L.fuso).toISOString();
  await estadia('Thor', 'reservada', chega, sai, 110, 107.25, L.tutores.Ana);
  await estadia('Mel', 'reservada', chega, sai, 80, 62.40, L.tutores.Ana);
  const luna = await estadia('Luna', 'em_casa', B.instante(L.hoje, '08:00', L.fuso).toISOString(), B.instante(L.dia(3), '17:00', L.fuso).toISOString(), 95, 285, L.tutores.Clara);
  const lanc = (l) => ({ petshop_id: P, pago: true, data: L.hoje, caixa_id: cx, cliente_id: L.tutores.Beto, ...l });
  B.must(await dono.from('lancamentos').insert([
    lanc({ tipo: 'entrada', valor: 220, forma: 'pix', categoria: 'Creche e hotel', descricao: `Sinal da reserva: hotel de Bob, ${ddmm(L.hoje)}` }),
    lanc({ tipo: 'entrada', valor: 2.75, forma: 'dinheiro', categoria: 'Creche e hotel', descricao: 'Hotel: 1 diária · Bob' }),
    lanc({ tipo: 'saida', valor: 110, forma: 'pix', categoria: 'Devolução', descricao: `Devolução: hotel de Bob, ${ddmm(L.hoje)} a ${ddmm(L.hoje)} (pago antes R$ 220,00, estadia R$ 110,00)` }),
  ]).select('id'), 'lançamentos do Bob');

  T.secao('390: check-out da Luna deixando de crédito');
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    await page.locator('.g-ch-cartao', { hasText: 'Luna' }).first().locator('button', { hasText: 'Check-out' }).click();
    let folha = page.locator('.g-folha').last();
    await folha.waitFor({ timeout: 10000 });
    const seguir = folha.locator('button', { hasText: 'Confirmar e seguir' });
    if (await seguir.count()) { await seguir.click(); folha = page.locator('.g-folha').last(); }
    await folha.locator('#g-ht-sobra').waitFor({ timeout: 15000 });
    T.ok('a conta mostra o pago a mais de R$ 190,00', /Pago a mais\s*R\$ 190,00/.test(txt(await folha.innerText())), txt(await folha.innerText()).slice(0, 500));
    await folha.locator('label', { hasText: 'Deixar como crédito do tutor' }).click();
    await folha.locator('button.g-btn.pri').click();
    const fechada = page.locator('.g-folha', { hasText: 'Conta fechada' });
    await fechada.waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    const corpo = txt(await fechada.innerText());
    const grande = txt(await fechada.locator('.g-num').first().innerText());
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/caixa-fichas-conta-390.png` }).catch(() => {});
    T.ok('o número grande é o dinheiro recebido: R$ 0,00, com "Recebido agora"', grande === 'R$ 0,00' && /Recebido agora/.test(corpo), { grande, corpo: corpo.slice(0, 300) });
    T.ok('o crédito vem à parte: "Ficou de crédito para o tutor: R$ 190,00"', /Ficou de crédito para o tutor: R\$ 190,00/.test(corpo), corpo.slice(0, 500));
    T.ok('banco: crédito de 190,00 para a Clara, ligado à estadia', B.sql(`select coalesce(sum(valor),0) from clientes_creditos where petshop_id='${P}' and cliente_id='${L.tutores.Clara}' and estadia_id='${luna}'`) === '190.00');
    T.ok('nenhuma entrada nova na saída da Luna', B.num(`select count(*) from lancamentos where petshop_id='${P}' and tipo='entrada'`) === 5);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  async function telas(larg, alt) {
    T.secao(`${larg}px: caixa, fichas, relatórios`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);

    await N.ir(page, '/gestao/app/caixa');
    const heroi = page.locator('.g-cx-heroi');
    await heroi.locator('.g-cx-dia').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => /ficou de crédito/.test(document.querySelector('.g-cx-heroi')?.textContent ?? ''), null, { timeout: 10000 }).catch(() => {});
    const h = txt(await heroi.innerText());
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/caixa-fichas-caixa-${larg}.png`, fullPage: larg === 390 }).catch(() => {});
    T.ok('gaveta R$ 102,75 (100,00 + 2,75 em dinheiro)', /Dinheiro na gaveta\s*R\$ 102,75/.test(h), h.slice(0, 400));
    T.ok('Saldo de hoje R$ 567,40', /Saldo de hoje\s*R\$ 567,40/.test(h), h.slice(0, 400));
    T.ok('Entrou hoje + R$ 677,40 e Saiu hoje (devoluções e saídas) − R$ 110,00', /Entrou hoje\s*\+ R\$ 677,40/.test(h) && /Saiu hoje \(devoluções e saídas\)\s*− R\$ 110,00/.test(h), h.slice(0, 600));
    T.ok('a gaveta com os números: troco R$ 100,00 + R$ 2,75 que entrou em dinheiro', /troco de R\$ 100,00 \+ R\$ 2,75 que entrou em dinheiro\./.test(h), h.slice(0, 800));
    T.ok('o crédito deixado é avisado: R$ 190,00 do que entrou ficou de crédito', /R\$ 190,00 do que entrou ficou de crédito para tutores/.test(h), h.slice(0, 900));
    T.ok('não diz mais "Recebido hoje" sozinho', !/Recebido hoje/.test(h));
    const lista = txt(await page.locator('.g-card', { hasText: 'Lançamentos deste caixa' }).innerText());
    T.ok('sinal sem a data velha na lista ("Sinal da reserva: hotel de Thor", nada de ", dd/mm")', /Sinal da reserva: hotel de Thor/.test(lista) && !/hotel de Thor, \d\d\/\d\d/.test(lista), lista.slice(0, 600));
    T.ok('categoria "Hotel" na lista, nunca "Creche e hotel"', !/Creche e hotel/.test(lista) && /Hotel/.test(lista));
    T.ok(`sem rolagem para o lado no caixa (${larg})`, (await N.rolagemLateral(page)) <= 0);

    const gasto = async (pet) => {
      await N.ir(page, `/gestao/app/clientes?pet=${L.pets[pet]}`);
      const c = page.locator('.g-rotulo', { hasText: /Gasto/ }).first();
      await c.waitFor({ timeout: 15000 });
      await page.waitForTimeout(400);
      return txt(await c.locator('xpath=..').innerText());
    };
    const esperado = { Mel: '62,40', Thor: '107,25', Luna: '95,00', Bob: '112,75' };
    for (const [pet, v] of Object.entries(esperado)) {
      const g = await gasto(pet);
      T.ok(`ficha de ${pet}: gasto aqui R$ ${v}`, new RegExp(`R\\$ ${v}`).test(g) && !/nada pago ainda/.test(g), g);
      if (pet === 'Mel' && larg === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/caixa-fichas-mel-${larg}.png` }).catch(() => {});
    }

    await N.ir(page, `/gestao/app/clientes?cliente=${L.tutores.Ana}`);
    const hist = page.locator('.g-card', { hasText: 'Quanto já gastou aqui' });
    await hist.waitFor({ timeout: 15000 });
    await page.waitForTimeout(300);
    const ht = txt(await hist.innerText());
    T.ok('ficha da Ana: "Hotel" no histórico, sem "Creche e hotel", sinal sem a data', /· Hotel/.test(ht) && !/Creche e hotel/.test(ht) && /Sinal da reserva: hotel de Mel/.test(ht) && !/hotel de (Mel|Thor), \d\d\/\d\d/.test(ht), ht.slice(0, 500));
    T.ok('ficha da Ana: já gastou R$ 169,65', /R\$ 169,65/.test(ht), ht.slice(0, 200));

    await N.ir(page, '/gestao/app/relatorios');
    const rel = page.locator('.g-card', { hasText: 'Hotel: ocupação e contas' });
    await rel.waitFor({ timeout: 20000 });
    const rt = txt(await rel.innerText());
    if (larg === 1366) await rel.screenshot({ path: `${B.RAIZ}/testes/saida/caixa-fichas-relatorio-${larg}.png` }).catch(() => {});
    T.ok(`relatórios: 4 noites reservadas de hoje em diante, a última em ${ddmm(L.dia(4))} (a Luna, encerrada hoje, não conta)`, new RegExp(`\\b4 noites reservadas de hoje em diante \\(reservas e pets na casa\\), a última em ${ddmm(L.dia(4))}`).test(rt), rt.slice(0, 700));
    T.ok(`nenhum erro na tela (${larg})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await telas(390, 844);
  await telas(1366, 900);

  T.secao('página do tutor');
  const anon = B.cliente(B.ipAleatorio());
  const tokClara = B.must(await dono.rpc('tutor_link', { p_cliente: L.tutores.Clara }), 'link da Clara');
  const tokDavi = B.must(await dono.rpc('tutor_link', { p_cliente: L.tutores.Davi }), 'link do Davi');
  const pg = B.must(await anon.rpc('tutor_pagina', { p_token: tokClara }), 'página da Clara');
  T.ok('banco: Luna com ultima_vez = hoje', pg.pets?.[0]?.ultima_vez === L.hoje, pg.pets?.[0]);
  const pd = B.must(await anon.rpc('tutor_pagina', { p_token: tokDavi }), 'página do Davi');
  T.ok('banco: Rex, que nunca veio, sem ultima_vez', pd.pets?.[0]?.ultima_vez == null, pd.pets?.[0]);
  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await page.goto(`${B.BASE_URL}/gestao/tutor/${tokClara}`, { waitUntil: 'networkidle' });
    const corpo = txt(await page.locator('main').innerText());
    if (larg === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/caixa-fichas-tutor-${larg}.png` }).catch(() => {});
    T.ok(`${larg}: "Luna veio hoje. Ainda não tem diário nem fotos."`, /Luna veio hoje\. Ainda não tem diário nem fotos\./.test(corpo) && !/Quando .* vier/.test(corpo), corpo.slice(0, 400));
    await page.goto(`${B.BASE_URL}/gestao/tutor/${tokDavi}`, { waitUntil: 'networkidle' });
    const cd = txt(await page.locator('main').innerText());
    T.ok(`${larg}: Rex nunca veio: "Quando ele vier, o dia aparece aqui."`, /Ainda não tem diário nem fotos de Rex\. Quando o pet vier, o dia aparece aqui\./.test(cd) || /Quando ele vier, o dia aparece aqui\./.test(cd), cd.slice(0, 400));
    T.ok(`${larg}: nenhum erro e sem rolagem para o lado`, erros.length === 0 && (await N.rolagemLateral(page)) <= 0, erros.slice(0, 3));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
