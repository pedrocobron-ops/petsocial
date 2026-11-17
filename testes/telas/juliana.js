// O que a testadora Juliana achou (16/11/2026), pela tela, em 390 e 1366:
//  - conta nova: o botão do alto, o Mozart e o cartão Primeiros passos apontam o mesmo próximo passo (eram três);
//  - Personalizar: cada opção diz em que item do menu fica; ligar o hotel não liga o hotel no link sozinho (pergunta
//    "Quer que os tutores também peçam reserva de hotel pelo link?"; só "Ligar no link" muda o link);
//  - serviço novo: a linha que explica cada área (Hotel: extra na saída) e a cor já usada ("Essa cor já é de Tosa higiênica");
//    duas cores iguais em Serviços e preços: "Dar uma cor para cada";
//  - check-out do hotel: o serviço da área Hotel entra num toque, com o preço do porte do pet.
// Capturas em testes/saida/juliana-*.png.
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('juliana-tela');
const FOTOS = path.join(B.RAIZ, 'testes', 'saida') + '/';
const foto = (page, nome, inteira = false) => page.screenshot({ path: `${FOTOS}juliana-${nome}.png`, fullPage: inteira });
const folha = (page) => page.locator('.g-folha').last();
const sqlLoja = (L, campos) => B.sql(`select ${campos} from petshops where id='${L.P}'`);

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Juliana', modulos: ['banho_tosa'], equipe: false, dados: false });
  // como a Juliana: só banho e tosa, link ligado sem creche nem hotel, serviços sem preço ainda
  B.sql(`update petshops set link_ativo = true, link_hotel = false, link_creche = false where id='${L.P}'`);
  B.sql(`update servicos set preco_p = null, preco_m = null, preco_g = null, preco_gg = null where petshop_id='${L.P}'`);

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    T.secao(`${largura}: conta nova, um próximo passo só`);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    await page.waitForSelector('.g-pps', { timeout: 20000 });
    const agora = (await page.locator('.g-pps-passo.agora b').first().innerText()).trim();
    const topo = (await page.locator('.g-topo .g-acoes .g-btn.pri').first().innerText()).trim();
    const fala = (await page.locator('.g-mozart .fala').innerText()).trim();
    T.ok('o passo em destaque é "Colocar os preços dos serviços"', agora === 'Colocar os preços dos serviços', agora);
    T.ok('o botão do alto é o mesmo passo', topo === agora, topo);
    T.ok('o Mozart fala o mesmo passo', fala.includes('O próximo passo é colocar os preços dos serviços'), fala);
    T.ok('a agenda vazia não oferece outro caminho (sem "Cadastrar o primeiro pet")', await page.locator('.g-duas .g-btn', { hasText: 'Cadastrar o primeiro pet' }).count() === 0);
    await foto(page, `hoje-${largura}`, true);

    if (largura === 1366) {
      T.secao('1366: Personalizar diz onde cada opção fica e pergunta do link');
      await page.getByRole('button', { name: 'Personalizar o menu Dia a dia' }).first().click();
      await page.waitForTimeout(800);
      const f = folha(page);
      await foto(page, 'personalizar-aberto-1366');
      const op = (nome) => f.locator('.g-mod-op').filter({ has: page.locator('.t > b', { hasText: new RegExp(`^${nome}$`) }) });
      const linha = async (nome) => (await op(nome).locator('small.g-mod-menu').innerText()).trim();
      T.ok('Banho e tosa: "No menu: Agenda"', await linha('Banho e tosa') === 'No menu: Agenda');
      T.ok('Venda de produtos: "No menu: Estoque e Caixa"', await linha('Venda de produtos') === 'No menu: Estoque e Caixa');
      T.ok('Pacotes: "No menu: Pacotes"', await linha('Pacotes e planos') === 'No menu: Pacotes');
      T.ok('Hotel sozinho: "No menu: Hotel"', await linha('Hotel') === 'No menu: Hotel');
      await op('Creche').click();
      await op('Hotel').click();
      T.ok('creche e hotel ligados: "No menu: Creche e hotel" nos dois cartões', /^No menu: Creche e hotel/.test(await linha('Creche')) && /^No menu: Creche e hotel/.test(await linha('Hotel')));
      T.ok('pergunta do hotel e da creche, sem nada marcado', await f.getByText('Quer que os tutores também peçam reserva de hotel pelo link?').count() === 1
        && await f.getByText('Quer que os tutores também peçam vaga na creche pelo link?').count() === 1
        && await f.locator('.g-mod-link button[aria-pressed=true]').count() === 0);
      // liga só a creche no link; o hotel fica como está
      await f.locator('.g-mod-link .g-pilha', { hasText: 'creche' }).getByRole('button', { name: 'Ligar no link' }).click();
      await foto(page, 'personalizar-1366');
      await f.getByRole('button', { name: 'Salvar' }).click();
      await page.waitForSelector('.g-toast', { timeout: 15000 }).catch(() => {});
      T.ok('gravou: creche e hotel ligados; link com creche e sem hotel', sqlLoja(L, `array_to_string(modulos, ',') || '|' || link_creche || '|' || link_hotel`) === 'banho_tosa,creche,hotel|true|false', sqlLoja(L, `modulos, link_creche, link_hotel`));
      const recado = await page.locator('.g-toast').allInnerTexts();
      T.ok('o recado diz que o link continua sem o hotel', recado.some((x) => /continua sem hotel/.test(x)), recado);
      T.ok('o menu mostra um item só "Creche e hotel"', await page.locator('.g-side a', { hasText: /^Creche e hotel$/ }).count() === 1 || await page.locator('nav a', { hasText: 'Creche e hotel' }).count() >= 1);
    }

    T.secao(`${largura}: serviço novo com área e cor`);
    await N.ir(page, '/gestao/app/meu-petshop');
    await page.getByRole('button', { name: 'Serviço novo' }).click();
    await page.waitForTimeout(600);
    const f = folha(page);
    await f.locator('input.g-input').first().fill(largura === 390 ? 'Banho de ofurô' : 'Banho de saída do hotel');
    if (largura === 1366) {
      T.ok('Banho e tosa: "Vira horário na Agenda…"', /Vira horário na Agenda/.test(await f.locator('.g-sv-area-dica').innerText()));
      await f.getByRole('group', { name: /Área de/ }).getByRole('button', { name: 'Hotel' }).click();
      T.ok('Hotel: "Aparece como extra da estadia na saída do hotel (check-out) e entra na conta…"', /extra da estadia na saída do hotel .*entra na conta/.test(await f.locator('.g-sv-area-dica').innerText()));
    }
    const emUso = B.num(`select count(distinct lower(cor)) from servicos where petshop_id='${L.P}' and ativo`);
    T.ok('as cores já usadas têm o ponto (uma por cor em uso)', await f.locator('.gj-cor.usada').count() === emUso, { tela: await f.locator('.gj-cor.usada').count(), emUso });
    T.ok('a cor que já vem marcada é livre', await f.locator('.gj-cor[aria-pressed=true].usada').count() === 0);
    await f.getByRole('button', { name: /^roxo/ }).click();
    T.ok('roxo: "Essa cor já é de Tosa higiênica"', /Essa cor já é de Tosa higiênica/.test(await f.locator('.gj-cor-aviso').innerText()));
    await foto(page, `servico-${largura}`);
    if (largura === 390) {
      // deixa repetido de propósito, para o aviso da lista
      await f.locator('.g-folha-rodape .g-btn.pri, button.g-btn.pri', { hasText: 'Salvar' }).last().click();
      await page.waitForTimeout(2500);
      const aviso = page.locator('.g-aviso', { hasText: 'mesma cor na agenda' });
      T.ok('Serviços e preços avisa: "Tosa higiênica e Banho de ofurô"', await aviso.count() === 1 && /Tosa higiênica e Banho de ofurô/.test(await aviso.innerText()));
      await aviso.scrollIntoViewIfNeeded();
      await foto(page, 'cores-repetidas-390');
      await aviso.getByRole('button', { name: 'Dar uma cor para cada' }).click();
      await page.waitForTimeout(2500);
      T.ok('depois de "Dar uma cor para cada": nenhuma cor repetida entre os ativos', B.num(`select count(*) - count(distinct lower(cor)) from servicos where petshop_id='${L.P}' and ativo`) === 0);
      T.ok('a Tosa higiênica continua roxa', B.sql(`select cor from servicos where petshop_id='${L.P}' and nome='Tosa higiênica'`) === '#7c6fb0');
      T.ok('o aviso some', await page.locator('.g-aviso', { hasText: 'mesma cor na agenda' }).count() === 0);
    } else {
      await f.getByRole('button', { name: /^anil/ }).click();
      await f.locator('.precos input').first().fill('40');
      await f.locator('button.g-btn.pri', { hasText: 'Salvar' }).last().click();
      await page.waitForTimeout(2500);
      T.ok('o serviço do hotel foi salvo com a área Hotel', B.sql(`select categoria from servicos where petshop_id='${L.P}' and nome='Banho de saída do hotel'`) === 'hotel');

      T.secao('1366: check-out do hotel com o serviço da área Hotel num toque');
      const tutor = B.must(await L.sb.dono.from('clientes').insert({ petshop_id: L.P, nome: 'Tutor Teste 1', telefone: '11900000001' }).select('id').single(), 'tutor').id;
      const mel = B.must(await L.sb.dono.from('pets').insert({ petshop_id: L.P, cliente_id: tutor, nome: 'Mel', especie: 'cao', porte: 'M' }).select('id').single(), 'pet').id;
      const ontem = new Date(Date.now() - 26 * 3600e3).toISOString();
      B.must(await L.sb.dono.from('estadias').insert({ petshop_id: L.P, pet_id: mel, tipo: 'hotel', status: 'em_casa', entrada: ontem, valor_diaria: 120 }).select('id'), 'estadia');
      await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
      await page.locator('.g-ch-cartao', { hasText: 'Mel' }).first().locator('button', { hasText: 'Check-out' }).click();
      await page.waitForTimeout(2500);
      const chip = folha(page).locator('.g-vd-chips button', { hasText: 'Banho de saída do hotel' });
      T.ok('a conta oferece "Banho de saída do hotel · R$ 40,00"', await chip.count() === 1 && /R\$\s40,00/.test(await chip.innerText()), await chip.count() ? await chip.innerText() : null);
      await chip.click();
      await page.waitForTimeout(500);
      T.ok('um toque põe o serviço na conta: 1 diária de R$ 120 + R$ 40 = R$ 160,00', await folha(page).locator('.g-vd-itens input[value="Banho de saída do hotel"]').count() === 1
        && /Total da estadia\s*R\$\s160,00/.test((await folha(page).innerText()).replace(/\u00a0/g, ' ')));
      await foto(page, 'checkout-1366');
    }
    T.ok(`${largura}: sem rolagem para o lado`, await N.rolagemLateral(page) <= 0);
    T.ok(`${largura}: nenhum erro de página`, erros.length === 0, erros);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
