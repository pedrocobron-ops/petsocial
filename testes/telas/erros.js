// Erros na tela: com o servidor em GESTAO_ERRO_TESTE=1, a tela Hoje quebra de propósito (?__erro_teste=tela|janela|promessa).
// Confere a tela amigável (Tentar de novo / Voltar para Hoje, com o menu), o registro no banco (limpo, com papel, tela e versão)
// e a aba Erros do painel do administrador em 390 e 1366 (aparece agrupado, abre os detalhes, marca como resolvido).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('erros-tela');

const MSG = { tela: 'Erro de teste da tela (pode ignorar)', janela: 'Erro de teste solto (pode ignorar)', promessa: 'Erro de teste em promessa (pode ignorar)' };

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const ligado = await fetch(`${B.BASE_URL}/api/gestao/erro-teste`, { cache: 'no-store' });
  if (!T.ok('servidor com GESTAO_ERRO_TESTE=1 (gatilho de erro de teste ligado)', ligado.status === 200, ligado.status)) return;
  const L = await criarLoja(T, { nome: 'Erros tela', equipe: false });
  // o dono desta loja vira admin só durante o teste (por SQL: ninguém vira admin pela API)
  const uid = B.sql(`select user_id from profissionais where petshop_id='${L.P}' and papel='dono'`);
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'; delete from erros_app_resolvidos where assinatura in (select assinatura from erros_app where petshop_id='${L.P}');`));
  const linha = (msg) => B.sql(`select coalesce(json_agg(json_build_object('tipo', tipo, 'papel', papel, 'tela', tela, 'rota', rota, 'versao', versao, 'nav', navegador, 'pilha', pilha, 'n', contagem)), '[]') from erros_app where petshop_id='${L.P}' and mensagem='${msg}'`);
  const esperar = async (msg) => { for (let i = 0; i < 20; i++) { const r = JSON.parse(linha(msg)); if (r.length) return r; await new Promise((x) => setTimeout(x, 300)); } return []; };

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    T.secao(`tela que quebra (${larg})`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app?__erro_teste=tela', null);
    const aviso = page.locator('[role=alert]', { hasText: 'esta tela travou' });
    await aviso.waitFor({ timeout: 20000 }).catch(() => {});
    T.ok('aparece "Opa, esta tela travou" com Tentar de novo e Voltar para Hoje', await aviso.isVisible() && await aviso.locator('button', { hasText: 'Tentar de novo' }).isVisible() && await aviso.locator('a', { hasText: 'Voltar para Hoje' }).isVisible());
    T.ok('o menu do aplicativo continua na tela', await page.locator('a[href="/gestao/app/agenda"]').first().count() > 0);
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));
    if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/erros-tela-${larg}.png`, fullPage: true });
    const r = await esperar(MSG.tela);
    const x = r[0] || {};
    T.ok('registrado no banco: tipo tela, papel dono, rota /gestao/app', r.length === 1 && x.tipo === 'tela' && x.papel === 'dono' && x.rota === '/gestao/app', r);
    T.ok(`… com o tamanho da tela (${larg}x…), versão e navegador`, new RegExp(`^${larg}x\\d+$`).test(x.tela ?? '') && !!x.versao && /Chrome/.test(x.nav ?? ''), x);
    T.ok('… sem consulta (?__erro_teste) nem endereço do site na pilha', !/__erro_teste|https?:\/\//.test(JSON.stringify(r)), x.pilha);
    await aviso.locator('a', { hasText: 'Voltar para Hoje' }).click();
    await page.waitForSelector('.g-topo h1', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(800);
    T.ok('"Voltar para Hoje" abre o Hoje normal', !(await page.locator('[role=alert]', { hasText: 'esta tela travou' }).count()) && /\/gestao\/app$/.test(new URL(page.url()).pathname));
    B.sql(`delete from erros_app where petshop_id='${L.P}' and mensagem='${MSG.tela}'`);

    if (larg === 390) {
      T.secao('erro solto e promessa recusada');
      for (const tipo of ['janela', 'promessa']) {
        await N.ir(page, `/gestao/app?__erro_teste=${tipo}`, '.g-topo h1');
        const q = await esperar(MSG[tipo]);
        T.ok(`${tipo}: registrado como ${tipo === 'janela' ? 'erro' : 'promessa'}`, q.length === 1 && q[0].tipo === (tipo === 'janela' ? 'erro' : 'promessa'), q);
        T.ok(`${tipo}: a tela segue funcionando`, !(await page.locator('[role=alert]', { hasText: 'esta tela travou' }).count()));
      }
      T.secao('falha do banco mostrada na tela');
      // a Agenda lê os horários; o banco "responde" um erro técnico: a tela avisa e o erro é registrado como do banco
      await page.route('**/rest/v1/agendamentos*', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'XX000', message: 'falha de teste no banco zqx', details: null, hint: null }) }));
      await N.ir(page, '/gestao/app/agenda', '.g-main');
      const b = await esperar('[XX000] falha de teste no banco zqx');
      T.ok('erro técnico do banco na tela: registrado como banco, com o código e a rota', b.length === 1 && b[0].tipo === 'banco' && b[0].rota === '/gestao/app/agenda', b);
      await page.unroute('**/rest/v1/agendamentos*');
      erros.splice(0, erros.length); // a falha de propósito acima aparece como HTTP 500 na lista de erros da página
      await page.route('**/rest/v1/agendamentos*', (r) => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Escolha um horário de teste zqx.', details: null, hint: null }) }));
      await N.ir(page, '/gestao/app/agenda', '.g-main');
      await page.waitForTimeout(1500);
      T.ok('frase de regra do banco (feita para a pessoa) não é registrada', B.num(`select count(*) from erros_app where petshop_id='${L.P}' and mensagem like '%horário de teste zqx%'`) === 0);
      await page.unroute('**/rest/v1/agendamentos*');
      erros.splice(0, erros.length);

      T.secao('sem o gatilho, nada acontece');
      await N.ir(page, '/gestao/app', '.g-topo h1');
      T.ok('Hoje sem ?__erro_teste não registra nada', B.num(`select count(*) from erros_app where petshop_id='${L.P}' and mensagem like 'Erro de teste%' and tipo='tela'`) === 0);
    }
    T.ok('nenhum outro erro na página além dos de propósito', erros.filter((e) => !/Erro de teste/.test(e)).length === 0, erros.filter((e) => !/Erro de teste/.test(e)).slice(0, 4));
    await ctx.close();
  }

  T.secao('painel do administrador, aba Erros');
  // deixa um erro guardado para a aba mostrar
  {
    const { ctx, page } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app?__erro_teste=tela', null);
    await esperar(MSG.tela);
    await ctx.close();
  }
  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/admin', '.g-adm-abas');
    await page.locator('.g-adm-abas button', { hasText: 'Erros' }).click();
    const grupo = page.locator('[data-teste=erro-grupo]', { hasText: MSG.tela }).first();
    await grupo.waitFor({ timeout: 20000 }).catch(() => {});
    T.ok(`o erro aparece na aba Erros (${larg})`, await grupo.isVisible());
    const txt = (await grupo.innerText().catch(() => '')).replace(/\s+/g, ' ');
    T.ok(`… com vezes, aparelhos, pet shops, rota e tipo (${larg})`, /\d+ vez(es)? · \d+ aparelhos? · \d+ pet shops? · primeira vez/.test(txt) && txt.includes('/gestao/app') && txt.includes('tela travou'), txt.slice(0, 300));
    await grupo.locator('button', { hasText: 'Ver detalhes' }).click();
    const det = (await grupo.innerText()).replace(/\s+/g, ' ');
    T.ok(`detalhes: quem (dono) e telas (${larg})`, /Quem: [^·]*dono/.test(det) && /telas: .*\d+x\d+/.test(det), det.slice(0, 400));
    for (const p of ['24 horas', '7 dias', '30 dias']) {
      await page.locator('.g-chip', { hasText: p }).click(); await page.waitForTimeout(600);
      T.ok(`filtro ${p} mostra o erro (${larg})`, await page.locator('[data-teste=erro-grupo]', { hasText: MSG.tela }).first().isVisible().catch(() => false));
    }
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));
    if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/erros-admin-${larg}.png`, fullPage: true });
    if (larg === 1366) {
      await page.locator('[data-teste=erro-grupo]', { hasText: MSG.tela }).first().locator('button', { hasText: 'Marcar como resolvido' }).click();
      await page.waitForTimeout(1500);
      T.ok('marcar como resolvido tira da lista', !(await page.locator('[data-teste=erro-grupo]', { hasText: MSG.tela }).count()));
      await page.locator('.g-chip', { hasText: 'Mostrar resolvidos' }).click(); await page.waitForTimeout(1000);
      const res = page.locator('[data-teste=erro-grupo]', { hasText: MSG.tela }).first();
      T.ok('… e aparece em "Mostrar resolvidos" com a etiqueta resolvido', await res.isVisible() && /resolvido/.test(await res.innerText()));
      await res.locator('button', { hasText: 'Voltar para a lista' }).click(); await page.waitForTimeout(1200);
      T.ok('"Voltar para a lista" desfaz', B.num(`select count(*) from erros_app_resolvidos where assinatura in (select assinatura from erros_app where petshop_id='${L.P}')`) === 0);
    }
    T.ok(`nenhum erro na página do painel (${larg})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
