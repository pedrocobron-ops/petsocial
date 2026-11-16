// Ficha do horário com internet lenta (achado da Neide): logo depois de abrir a página, a ficha da Luna abriu só com
// "Fechar a conta · R$ 50,00", sem a opção do pacote e sem o aviso do que o tutor devia de antes: a cobrança em dobro
// ficava a um toque. Atrasa de propósito a leitura dos pacotes e do que já foi pago (2,5 s) e confere: enquanto carrega,
// nenhum botão de cobrar ou concluir; depois, o pacote vem primeiro, o aviso da dívida aparece e o "Fechar a conta" vira
// "Cobrar à parte". Leitura que falha: nada de cobrar, só "Tentar de novo". 390 e 1366.
//   Luna: banho R$ 50,00, pacote de 4 banhos (sobram 4), tutor deve R$ 30,00 de antes.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('agenda-lenta');

const COBRAR = /Fechar a conta|Cobrar à parte|Concluir|Usar o pacote/;

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Agenda lenta' });
  const { dono } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  const tutor = B.sql(`select cliente_id from pets where id='${L.pets.Luna}'`);
  B.sql(`insert into pacotes_clientes (petshop_id, pet_id, nome, servico_id, total, usados, preco) values ('${P}', '${L.pets.Luna}', 'Pacote 4 banhos', '${L.S.Banho}', 4, 0, 180)`);
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, pago, forma, data, vencimento, cliente_id, origem) values ('${P}', 'entrada', 30, 'Outros', 'Fiado do caderno', false, null, '${L.hoje}', '${L.hoje}', '${tutor}', 'tela')`);
  const ini = B.instante(L.hoje, '15:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Luna, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 50 }).select('id').single(), 'horário').id;
  const entradas = () => Number(B.sql(`select count(*) from lancamentos where petshop_id='${P}' and agendamento_id='${ag}'`));

  async function ficha(larg, alt) {
    T.secao(`${larg}px: a ficha da Luna com a leitura do pacote e do pago atrasada`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.caixa, L.senha);
    await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
    const atrasar = async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); await r.continue().catch(() => {}); };
    await page.route('**/rest/v1/pacotes_clientes?*', atrasar);
    await page.route('**/rest/v1/rpc/recebimentos_do_agendamento*', atrasar);
    await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Luna' }).first().click();
    const folha = page.locator('.g-folha').last();
    await folha.waitFor({ timeout: 10000 });
    const amostras = [];
    for (let k = 0; k < 6; k++) {
      await page.waitForTimeout(250);
      const botoes = (await folha.locator('button').allInnerTexts()).map((t) => t.replace(/ /g, ' '));
      amostras.push({ cobrar: botoes.filter((t) => COBRAR.test(t)), corpo: (await folha.innerText()).replace(/ /g, ' ') });
    }
    if (larg === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/agenda-lenta-carregando-${larg}.png` }).catch(() => {});
    T.ok('enquanto carrega: nenhum botão de cobrar, concluir ou usar o pacote', amostras.every((a) => !a.cobrar.length), amostras.map((a) => a.cobrar.join(' | ') || '(nenhum)'));
    T.ok('enquanto carrega: a ficha diz que está carregando a conta', amostras.every((a) => /Carregando a conta/.test(a.corpo)), amostras[0].corpo.slice(0, 300));
    T.ok('enquanto carrega: os botões que não mexem com dinheiro continuam (Cliente confirmou)', /Cliente confirmou/.test(amostras[0].corpo));
    await folha.locator('button', { hasText: 'Cobrar à parte' }).waitFor({ timeout: 15000 });
    const corpo = (await folha.innerText()).replace(/ /g, ' ');
    if (larg === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/agenda-lenta-pronto-${larg}.png` }).catch(() => {});
    T.ok('com tudo carregado: o pacote vem primeiro', /tem pacote para este serviço/.test(corpo) && /Concluir usando o pacote|Usar o pacote/.test(corpo), corpo.slice(0, 600));
    T.ok('com tudo carregado: o aviso do que deve de antes (R$ 30,00)', /deve R\$ 30,00 de antes/.test(corpo), corpo.slice(0, 600));
    T.ok('com tudo carregado: cobrar vira "Cobrar à parte, sem usar o pacote · R$ 50,00"', /Cobrar à parte, sem usar o pacote · R\$ 50,00/.test(corpo));
    T.ok('nada foi lançado', entradas() === 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});

    T.secao(`${larg}px: a leitura do pacote falha`);
    let falhar = true;
    await page.route('**/rest/v1/pacotes_clientes?*', async (r) => { if (falhar) await r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"falha de teste"}' }); else await r.continue(); });
    await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Luna' }).first().click();
    await folha.waitFor({ timeout: 10000 });
    await folha.locator('text=Não consegui buscar a conta deste horário').waitFor({ timeout: 10000 });
    const botoes = (await folha.locator('button').allInnerTexts()).filter((t) => COBRAR.test(t));
    T.ok('com erro: nenhum botão de cobrar, e "Tentar de novo"', !botoes.length && (await folha.locator('button', { hasText: 'Tentar de novo' }).count()) === 1, botoes);
    falhar = false;
    await folha.locator('button', { hasText: 'Tentar de novo' }).click();
    await folha.locator('button', { hasText: 'Cobrar à parte' }).waitFor({ timeout: 15000 });
    T.ok('Tentar de novo: a conta aparece inteira (pacote e dívida)', /tem pacote para este serviço/.test(await folha.innerText()) && /de antes/.test(await folha.innerText()));
    // o erro de propósito (HTTP 500) não conta como erro da tela
    const outros = erros.filter((e) => !/HTTP 500 GET .*pacotes_clientes|status of 500/.test(e));
    T.ok(`nenhum outro erro na tela (${larg})`, outros.length === 0, outros.slice(0, 4));
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
  await ficha(390, 844);
  await ficha(1366, 900);
  await N.fecharNavegador();
}))();
