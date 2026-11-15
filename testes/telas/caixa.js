// Fechar a conta pela tela, como a recepção faz: no celular pela Agenda, no computador pela lista "para cobrar" do Caixa.
// Toque duplo no "Receber" (dois cliques seguidos) tem de lançar uma vez só. Confere no banco o valor, os itens e o caixa.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('caixa-tela');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Caixa tela' });
  const { dono, tosador } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  const marca = async (pet, h) => {
    const ini = B.instante(L.hoje, h, L.fuso);
    const id = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
    B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: id, p_servicos: [{ servico_id: L.S['Hidratação'], preco: 30 }] }), 'hidratação');
    B.must(await tosador.from('agendamentos').update({ status: 'concluido' }).eq('id', id).select('id'), 'conclui');
    return id;
  };
  const A = { Thor: await marca('Thor', '09:00'), Luna: await marca('Luna', '10:00') };
  const contas = (id) => JSON.parse(B.sql(`select coalesce(json_agg(json_build_object('valor', valor, 'pago', pago, 'forma', forma, 'caixa', caixa_id is not null, 'itens', itens)), '[]') from lancamentos where agendamento_id='${id}'`));

  const receber = async (page, larg) => {
    const f = page.locator('.g-folha').last();
    const total = (await f.innerText()).replace(/ /g, ' ');
    T.ok(`a conta mostra Banho + Hidratação = R$ 90,00 (${larg})`, /Receber R\$ 90,00/.test(total), total.match(/Receber R\$[^\n]*/)?.[0] ?? total.slice(0, 300));
    await f.locator('.g-chips button, button.g-chip', { hasText: 'Pix' }).first().click();
    await page.waitForTimeout(300);
    await f.locator('button.g-btn.pri', { hasText: 'Receber' }).dblclick(); // toque duplo
    await page.waitForTimeout(3500);
  };

  T.secao('celular: pela Agenda');
  let { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.caixa, L.senha);
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Thor' }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('.g-folha').last().locator('button', { hasText: 'Fechar a conta' }).click();
  await page.waitForTimeout(1200);
  await receber(page, 390);
  let c = contas(A.Thor);
  T.ok('toque duplo: UMA entrada de R$ 90,00 no pix, no caixa aberto, com os dois serviços', c.length === 1 && Number(c[0].valor) === 90 && c[0].pago && c[0].forma === 'pix' && c[0].caixa && c[0].itens?.length === 2, c);
  T.ok('nenhum erro na tela (390)', erros.length === 0, erros.slice(0, 4));
  await ctx.close();

  T.secao('computador: pela lista "para cobrar" do Caixa');
  ({ ctx, page, erros } = await N.contexto(1366, 900));
  await N.entrar(page, L.emails.caixa, L.senha);
  await N.ir(page, '/gestao/app/caixa');
  const lista = page.locator('#atendimentos-para-cobrar');
  const t1 = (await lista.innerText().catch(() => '')).replace(/ /g, ' ');
  T.ok('a lista mostra só a Luna (1 concluído sem conta, R$ 90,00)', /1 concluído sem conta fechada · R\$ 90,00/.test(t1) && /Luna/.test(t1) && !/Thor/.test(t1), t1.slice(0, 300));
  await lista.locator('.g-ag-cobrar-linha', { hasText: 'Luna' }).locator('button.g-linha').click();
  await page.waitForTimeout(1300);
  await receber(page, 1366);
  c = contas(A.Luna);
  T.ok('toque duplo: UMA entrada de R$ 90,00', c.length === 1 && Number(c[0].valor) === 90 && c[0].pago, c);
  await page.keyboard.press('Escape');
  await N.ir(page, '/gestao/app/caixa');
  T.ok('a lista "para cobrar" esvazia', !(await page.locator('#atendimentos-para-cobrar .g-ag-cobrar-linha').count()));
  T.ok('nenhum erro na tela (1366)', erros.length === 0, erros.slice(0, 4));
  await ctx.close();
  await N.fecharNavegador();
}))();
