// Rodada 9, operação, pela tela (390 e 1366):
//  - Hoje: quando a leitura numa ida só (`gestao_hoje`) estoura o tempo do banco, a tela NÃO dispara as ~25 consultas do jeito
//    antigo; mostra "Demorou demais, tente de novo" com o botão Tentar de novo, que carrega a tela quando o banco volta.
//    Em banco sem a função (antes da atualização), continua lendo do jeito antigo.
//  - painel do administrador, aba Dados: "Rotinas automáticas" com a última vez que a faxina rodou bem; atrasada (mais de um dia
//    e meio) vira aviso no alto do painel; conta com a exclusão vencida há mais de 2 dias aparece como atrasada.
// Capturas em testes/saida/operacao-*.png.
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('operacao-tela');
const FOTOS = path.join(B.RAIZ, 'testes', 'saida') + '/';
const foto = async (page, nome, inteira = false) => { await page.waitForTimeout(700); return page.screenshot({ path: `${FOTOS}operacao-${nome}.png`, fullPage: inteira }); };

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) { T.ok('servidor fora do ar: telas não conferidas', false); return; }
  const L = await criarLoja(T, { nome: 'Operação' });
  const O = await criarLoja(T, { nome: 'Operação apagar', equipe: false, dados: false });
  // um horário hoje, para a tela ter o que mostrar quando carregar
  const inicio = new Date(Date.now() + 2 * 3600e3);
  B.must(await L.sb.dono.from('agendamentos').insert({ petshop_id: L.P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 3600e3).toISOString(), status: 'marcado' }).select('id'), 'horário');

  for (const largura of [390, 1366]) {
    T.secao(`${largura}: Hoje quando o banco demora`);
    const { ctx, page, erros } = await N.contexto(largura, largura < 500 ? 844 : 900);
    await N.entrar(page, L.emails.dono, L.senha);
    let modo = 'demora';
    const pedidos = { hoje: 0, antigo: 0 };
    await page.route('**/rest/v1/rpc/gestao_hoje*', async (rota) => {
      pedidos.hoje++;
      if (modo === 'demora') return rota.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' }) });
      if (modo === 'sem_funcao') return rota.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST202', details: null, hint: null, message: 'Could not find the function public.gestao_hoje(a, p) in the schema cache' }) });
      return rota.continue();
    });
    page.on('request', (r) => { if (/\/rest\/v1\/rpc\/gestao_contagens/.test(r.url())) pedidos.antigo++; });
    await N.ir(page, '/gestao/app');
    await page.waitForSelector('[data-teste=hoje-erro]', { timeout: 20000 });
    const aviso = await page.locator('[data-teste=hoje-erro]').innerText();
    T.ok('aparece "Demorou demais, tente de novo" com o botão Tentar de novo', /Demorou demais/.test(aviso) && /Tentar de novo/.test(aviso), aviso);
    T.ok('a leitura antiga (umas 25 consultas) NÃO foi disparada', pedidos.antigo === 0 && pedidos.hoje >= 1, pedidos);
    T.ok('a tela não diz que a agenda está livre enquanto não leu', !/Nenhum (banho|horário|atendimento) marcado para hoje/i.test(await page.locator('.g-main').innerText()));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1);
    await foto(page, `hoje-demora-${largura}`);
    modo = 'normal';
    await page.locator('[data-teste=hoje-erro] button').click();
    await page.waitForSelector('[data-teste=hoje-erro]', { state: 'detached', timeout: 20000 });
    await page.waitForFunction(() => /Thor/.test(document.querySelector('.g-main')?.textContent ?? ''), null, { timeout: 20000 });
    T.ok('Tentar de novo: o aviso some e a agenda de hoje aparece', pedidos.antigo === 0 && /Thor/.test(await page.locator('.g-main').innerText()));
    // banco de antes da atualização: a função não existe e a tela lê do jeito antigo, como sempre
    modo = 'sem_funcao';
    await N.ir(page, '/gestao/app');
    await page.waitForFunction(() => /Thor/.test(document.querySelector('.g-main')?.textContent ?? ''), null, { timeout: 20000 });
    T.ok('função que não existe: lê do jeito antigo e a tela abre sem aviso', pedidos.antigo >= 1 && !(await page.locator('[data-teste=hoje-erro]').count()), pedidos);
    await page.unroute('**/rest/v1/rpc/gestao_hoje*');
    const meus = erros.filter((e) => !/gestao_hoje/.test(e));
    T.ok(`${largura}: nenhum erro de página além do que o teste provocou`, meus.length === 0, meus);
    await ctx.close();
  }

  // painel do administrador
  const uid = B.sql(`select id from auth.users where email='${L.emails.dono}'`);
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'`));
  const antes = B.sql(`select coalesce(row_to_json(r)::text, '') from rotinas_execucoes r where nome = 'faxina'`);
  T.depois(() => { if (antes) B.sql(`update rotinas_execucoes r set ultima_em = x.ultima_em, ultima_ok_em = x.ultima_ok_em, ultimo_erro = x.ultimo_erro, ultimo_erro_em = x.ultimo_erro_em, falhas_seguidas = x.falhas_seguidas, resultado = x.resultado, criada_em = x.criada_em from json_populate_record(null::rotinas_execucoes, ${B.q(antes)}::json) x where r.nome = 'faxina'`); });
  B.must(await O.sb.dono.rpc('conta_exclusao_pedir', { p_petshop: O.P, p_nome: B.sql(`select nome from petshops where id='${O.P}'`) }), 'pedir exclusão');
  B.sql(`update exclusoes_conta set apagar_em = now() - interval '4 days' where petshop_id='${O.P}' and apagado_em is null`);
  const nomeO = B.sql(`select nome from petshops where id='${O.P}'`);

  for (const largura of [1366, 390]) {
    T.secao(`${largura}: painel do administrador, rotinas e exclusão atrasada`);
    const { ctx, page, erros } = await N.contexto(largura, largura < 500 ? 844 : 900);
    await N.entrar(page, L.emails.dono, L.senha);
    B.sql(`select public.rotina_anotar('faxina', true, '{"contas": 0}'::jsonb); update rotinas_execucoes set ultima_ok_em = now() - interval '3 days', ultimo_erro = 'A faxina diária não rodou: falta a chave de serviço do Supabase no servidor', ultimo_erro_em = now() - interval '2 hours' where nome = 'faxina'`);
    await N.ir(page, '/gestao/admin', '.g-adm-abas');
    await page.waitForSelector('[data-teste=lembrete-rotinas]', { timeout: 20000 });
    const lembrete = await page.locator('[data-teste=lembrete-rotinas]').innerText();
    T.ok('aviso no alto: rotina que não roda bem há mais de um dia e meio e conta que já devia ter sido apagada', /rotina.*não roda.*bem há mais de um dia e meio/i.test(lembrete) && /já devia.* ter sido apagada/i.test(lembrete), lembrete);
    await foto(page, `admin-aviso-${largura}`);
    await page.locator('[data-teste=lembrete-rotinas] button').click();
    await page.waitForSelector('[data-teste=rotinas]', { timeout: 20000 });
    const linha = page.locator('[data-teste=rotina]', { hasText: 'Faxina diária' });
    const texto = await linha.innerText();
    T.ok('Rotinas automáticas: a faxina com a última vez boa, o motivo da falha e a etiqueta "atrasada"', /Rodou bem pela última vez/.test(texto) && /falta a chave de serviço/.test(texto) && /atrasada/.test(texto) && /CRON_SECRET/.test(texto), texto);
    const conta = page.locator('.g-linha', { hasText: nomeO });
    const textoConta = await conta.innerText();
    T.ok('Contas para apagar: a conta com o prazo vencido há 4 dias aparece como atrasada', /Já devia ter sido apagada/.test(textoConta) && (await conta.locator('[data-teste=exclusao-atrasada]').count()) === 1, textoConta);
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1);
    await foto(page, `admin-dados-${largura}`, true);
    // rodou bem: volta a ficar em dia
    B.sql(`select public.rotina_anotar('faxina', true, '{"contas": 1}'::jsonb)`);
    await N.ir(page, '/gestao/admin', '.g-adm-abas');
    await page.locator('.g-adm-abas button', { hasText: 'Dados' }).click();
    await page.waitForSelector('[data-teste=rotinas]', { timeout: 20000 });
    const depois = await page.locator('[data-teste=rotina]', { hasText: 'Faxina diária' }).innerText();
    T.ok('depois de rodar bem: "em dia", sem a etiqueta de atrasada', /em dia/.test(depois) && !/atrasada/.test(depois) && /Rodou bem pela última vez/.test(depois), depois);
    T.ok(`${largura}: nenhum erro de página`, erros.length === 0, erros);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
