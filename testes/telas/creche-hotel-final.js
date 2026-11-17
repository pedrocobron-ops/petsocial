// Creche e hotel, rodada final dos testadores (Rafael e Bia), pela tela. Capturas em testes/saida/creche-hotel-final-*.png.
//  - Chamada: Chegou do mensalista abre o checklist de entrada (opção "Todos os pets"), e o cartão do mensalista em Casa agora tem
//    Conferir a entrada; o plano com táxi aparece na Chamada e no Leva e traz (Buscar e Levar de volta);
//  - Hotel: cancelar a reserva com sinal pago oferece Virar crédito do tutor, já marcado pela regra (menos de 7 dias), e o cartão
//    sai da lista na hora; o crédito fica na ficha;
//  - Hoje: Aceitar todos tira o cartão do pedido na hora;
//  - Link do hotel: a hora de buscar já vem na saída do hotel (12h), sem a taxa; buscar às 18h mostra a taxa sem "até as 15h";
//  - Fotos de hoje: a primeira foto sobe e aparece (tempo medido);
//  - Indicadores num hotel só: sem mapa de horários nem serviços, com a ocupação e as reservas canceladas.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('creche-hotel-final');
const path = require('path');
const fs = require('fs');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Creche Hotel Final tela' });
  const { dono } = L.sb;
  const P = L.P;
  const saida = path.join(B.RAIZ, 'testes', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const foto = (page, nome) => page.screenshot({ path: path.join(saida, `creche-hotel-final-${nome}.png`), fullPage: false }).catch(() => {});
  const txt = async (loc) => (await loc.innerText()).replace(/[\u00a0\u202f]/g, ' ');
  const opcoes = async (m) => B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: m }), 'opções');
  await opcoes({ 'entrada.exigir': 'todos', 'casa.tutor': { ativo: true } });
  const TODOS = [0, 1, 2, 3, 4, 5, 6];
  const pThor = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets.Thor, dias: TODOS, inicio: L.mesAnterior, vence_dia: 10, taxi: 'ida_volta' }).select('id').single(), 'plano').id;
  B.must(await dono.from('creche_planos_valores').upsert({ plano_id: pThor, petshop_id: P, valor_mensal: 700, taxi_valor: 35 }).select('plano_id'), 'valor');
  B.sql(`update clientes set endereco = 'Rua das Flores, 10' where id='${L.tutores.Ana}'`);

  {
    T.secao('390: Chamada, checklist de entrada e táxi do mensalista');
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=chamada');
    const linha = page.locator('.g-cm-linha', { hasText: 'Thor' }).first();
    await linha.waitFor({ timeout: 15000 });
    T.ok('a linha do Thor diz "táxi ida e volta"', /táxi ida e volta/.test(await txt(linha)), await txt(linha));
    await linha.locator('button', { hasText: 'Chegou' }).click();
    const folha = page.locator('.g-folha', { hasText: 'Entrada' }).last();
    T.ok('o Chegou do mensalista abre a folha Entrada (Todos os pets)', await folha.waitFor({ timeout: 10000 }).then(() => true, () => false));
    await page.waitForTimeout(500);
    T.ok('na creche, a folha não fala em "pelo horário"', !/pelo horário/.test(await txt(folha)), (await txt(folha)).slice(0, 300));
    await foto(page, 'entrada-chamada-390');
    await folha.locator('button', { hasText: 'Pular agora' }).click();
    await folha.waitFor({ state: 'detached', timeout: 10000 });
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    const cartao = page.locator('.g-ch-cartao', { hasText: 'Thor' }).first();
    await cartao.waitFor({ timeout: 15000 });
    T.ok('o cartão do mensalista em Casa agora tem Conferir a entrada', await cartao.locator('button', { hasText: 'Conferir a entrada' }).count() === 1);
    const leva = page.locator('a', { hasText: /Leva e traz \(/ }).first();
    T.ok('o botão Leva e traz aparece com o táxi do mensalista', await leva.count() === 1);
    await N.ir(page, `/gestao/app/creche-hotel/leva-traz?dia=${L.hoje}`, '.g-lt-topo');
    await page.locator('.g-lt-item', { hasText: 'Thor' }).first().waitFor({ timeout: 15000 });
    const lt = await txt(page.locator('.g-lt-lista'));
    T.ok('o Leva e traz lista Buscar e Levar de volta do Thor, com o endereço', /Buscar[\s\S]*Thor[\s\S]*Rua das Flores/i.test(lt) && /Levar de volta[\s\S]*Thor/i.test(lt), lt.slice(0, 400));
    await page.locator('.g-lt-item.buscar', { hasText: 'Thor' }).locator('button', { hasText: 'Buscado' }).click();
    await page.waitForTimeout(1500);
    T.ok('Buscado fica anotado', B.num(`select count(*) from creche_taxi_viagens where plano_id='${pThor}' and dia='${L.hoje}' and perna='buscar'`) === 1);
    await foto(page, 'leva-traz-390');
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);

    T.secao('390: Fotos de hoje (primeira foto)');
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    const c2 = page.locator('.g-ch-cartao', { hasText: 'Thor' }).first();
    await c2.locator('button', { hasText: 'Fotos' }).click();
    const ff = page.locator('.g-folha', { hasText: 'Fotos de hoje' }).last();
    await ff.waitFor({ timeout: 10000 });
    const t0 = Date.now();
    await ff.locator('input[data-teste="fotos-do-dia"]').setInputFiles({ name: 'cao.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
    const subiu = await ff.locator('.g-cs-fotos li').first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    const ms = Date.now() - t0;
    T.ok(`a primeira foto sobe e aparece (${ms} ms)`, subiu && ms < 15000, ms);
    await page.keyboard.press('Escape');
    await ctx.close();
  }

  {
    T.secao('390: cancelar reserva com sinal (vira crédito, pela regra)');
    await opcoes({ 'hotel.sinal': { ativo: true, modo: 'pct', valor: 30, politica: 'Com menos de 7 dias, o sinal vira crédito.', creche: false, cancela: { dias: 7, perto: 'credito', longe: 'devolver' } } });
    const e = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'hotel', status: 'reservada', entrada: B.instante(L.dia(3), '14:00', L.fuso).toISOString(),
      saida_prevista: B.instante(L.dia(5), '12:00', L.fuso).toISOString(), valor_diaria: 130 }).select('id').single(), 'reserva').id;
    B.must(await dono.rpc('estadia_sinal', { p_petshop: P, p_estadia: e, p_chave: `t-sinal-${B.sufixo()}`, p_passos: [
      { t: 'lancamento', nome: 'sinal', linha: { tipo: 'entrada', valor: 78, forma: 'pix', categoria: 'Creche e hotel', descricao: 'Sinal da reserva: hotel de Bob', cliente_id: L.tutores.Beto, pago: true, data: L.hoje } },
      { t: 'estadia_valores', estadia: e, modo: 'upsert', campos: { sinal: 78, sinal_estado: 'pago', sinal_lancamento_id: '$ref:sinal', sinal_pago_em: L.hoje } },
    ] }), 'sinal pago');
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    await page.locator('.g-seg button', { hasText: /^Reservas/ }).first().click();
    const cartao = page.locator('.g-ch-cartao.reserva', { hasText: 'Bob' }).first();
    await cartao.waitFor({ timeout: 15000 });
    await cartao.locator('button', { hasText: 'Cancelar' }).click();
    const folha = page.locator('.g-folha', { hasText: 'Cancelar a reserva de Bob' }).last();
    await folha.waitFor({ timeout: 10000 });
    const credito = folha.locator('label', { hasText: 'Virar crédito do tutor' });
    T.ok('a folha oferece Virar crédito do tutor', await credito.count() === 1);
    T.ok('… já marcado pela regra (faltam 3 dias, menos de 7)', await credito.locator('input').isChecked(), await txt(folha));
    T.ok('e diz que é pela sua regra', /Pela sua regra/.test(await txt(folha)));
    await foto(page, 'cancelar-credito-390');
    await folha.locator('button', { hasText: 'Cancelar reserva' }).click();
    await folha.waitFor({ state: 'detached', timeout: 15000 });
    const t0 = Date.now();
    const sumiu = await cartao.waitFor({ state: 'detached', timeout: 1500 }).then(() => true, () => false);
    T.ok(`o cartão da reserva sai na hora (${Date.now() - t0} ms depois do aviso)`, sumiu);
    T.ok('a reserva ficou cancelada e o sinal mantido', B.sql(`select e.status || '|' || v.sinal_estado from estadias e join estadias_valores v on v.estadia_id = e.id where e.id='${e}'`) === 'cancelada|mantido');
    T.ok('R$ 78 viraram crédito do Beto', B.num(`select coalesce(sum(valor), 0) from clientes_creditos where petshop_id='${P}' and cliente_id='${L.tutores.Beto}'`) === 78);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  {
    T.secao('390: Aceitar todos tira o cartão do pedido na hora');
    const grupo = B.sql('select gen_random_uuid()');
    for (const pet of ['Rex', 'Luna']) {
      B.sql(`insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, inicio, fim, status, tipo, grupo_id)
        values ('${P}', 'Davi Reis', '11988880004', '${pet}', '${L.dia(9)} 17:00+00', '${L.dia(11)} 15:00+00', 'pendente', 'hotel', '${grupo}')`);
    }
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    const botao = page.locator('button', { hasText: 'Aceitar todos' }).first();
    await botao.waitFor({ timeout: 15000 });
    await botao.click();
    // pode perguntar se é a mesma pessoa ou o porte: responde o que aparecer
    for (let k = 0; k < 3; k++) {
      await page.waitForTimeout(700);
      const mesma = page.locator('.g-folha button', { hasText: /Usar|mesma pessoa|Aceitar/ }).last();
      if (await mesma.count() && await mesma.isVisible().catch(() => false)) await mesma.click().catch(() => {});
      if (B.num(`select count(*) from pedidos_agendamento where petshop_id='${P}' and grupo_id='${grupo}' and status='aceito'`) === 2) break;
    }
    const t0 = Date.now();
    const foi = await page.waitForFunction(() => !/espera a sua resposta/.test(document.body.innerText), null, { timeout: 2000 }).then(() => true, () => false);
    T.ok(`o "espera a sua resposta" sai logo depois de aceitar (${Date.now() - t0} ms)`, foi);
    T.ok('os dois pedidos viraram reserva', B.num(`select count(*) from pedidos_agendamento where petshop_id='${P}' and grupo_id='${grupo}' and status='aceito' and estadia_id is not null`) === 2);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  {
    T.secao('390: link do hotel com a hora de saída e a taxa');
    await opcoes({ 'hotel.horas': { entrada: '14:00', saida: '12:00' } });
    B.must(await dono.from('hotel_precos').upsert({ petshop_id: P, atraso: { ativo: true, tolerancia: 30, hotel: { hora: '12:00', valor: 40 }, creche: { hora: '', valor: null } } }, { onConflict: 'petshop_id' }).select('petshop_id'), 'taxa de busca');
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.ir(page, `/gestao/agendar/${L.codigo}`, '.g-lk');
    const hotel = page.locator('button.g-lk-serv', { hasText: 'Hotel' }).first();
    await hotel.waitFor({ timeout: 15000 });
    await hotel.click();
    await page.waitForTimeout(2500);
    const horas = page.locator('input[type=time]');
    T.ok('a hora de chegada vem 14:00 e a de buscar 12:00', (await horas.nth(0).inputValue()) === '14:00' && (await horas.nth(1).inputValue()) === '12:00', [await horas.nth(0).inputValue(), await horas.nth(1).inputValue()]);
    let corpo = await txt(page.locator('body'));
    T.ok('mostra "Entrada a partir das 14h e saída até as 12h"', /Entrada a partir das 14h e saída até as 12h/.test(corpo));
    T.ok('com a hora sugerida, nada de taxa de busca', !/taxa de busca/.test(corpo), corpo.slice(0, 600));
    await foto(page, 'link-hotel-390');
    await horas.nth(1).fill('18:00');
    await page.waitForTimeout(600);
    corpo = await txt(page.locator('body'));
    T.ok('buscar às 18h mostra a taxa de R$ 40,00', /Buscar às 18h tem taxa de busca fora do horário[\s\S]*R\$ 40,00/.test(corpo), corpo.slice(0, 900));
    T.ok('e não diz "até as 15h" (o hotel abre até as 20h)', !/até as 15h/.test(corpo));
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }

  {
    T.secao('1366: indicadores num hotel só');
    const H = await criarLoja(T, { nome: 'Hotel so tela', modulos: ['hotel'], equipe: false });
    for (const pet of ['Thor', 'Mel']) {
      B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida_prevista) values ('${H.P}', '${H.pets[pet]}', 'hotel', 'cancelada', now(), now() + interval '2 days')`);
    }
    B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida, saida_prevista, valor_diaria, valor_cobrado, diarias_cobradas) values ('${H.P}', '${H.pets.Bob}', 'hotel', 'encerrada', now() - interval '2 days', now(), now(), 120, 240, 2)`);
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, H.emails.dono, H.senha);
    await N.ir(page, '/gestao/app/relatorios/indicadores');
    await page.locator('[aria-label="Faltas e cancelamentos"]').waitFor({ timeout: 20000 });
    const corpo = await txt(page.locator('.g-main'));
    T.ok('cancelamentos contam as 2 reservas canceladas', /2 reservas canceladas de 3 reservas/.test(corpo), corpo.slice(0, 1200));
    T.ok('sem "Dias e horários mais cheios", "Serviços mais vendidos" e "Produtos mais vendidos"', !/Dias e horários mais cheios|Serviços mais vendidos|Produtos mais vendidos/.test(corpo));
    T.ok('mostra a ocupação do hotel', /Ocupação do hotel/i.test(corpo));
    await foto(page, 'indicadores-hotel-1366');
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
