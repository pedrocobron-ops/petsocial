// Começo guiado com a página recarregando no meio (achados da Neide, da Bia e da Juliana; celular 390 e computador 1366).
// - Pergunta 1 (/gestao/comecar): o que foi digitado continua depois de recarregar; na pergunta 2, o que foi marcado também.
// - Passo do horário: "Ter a sáb", "8h às 18h" e o almoço marcados, a página recarrega: volta no mesmo passo, com o aviso
//   "Continuei de onde você parou" e o almoço ainda marcado; Continuar grava o almoço (antes: ficava desmarcado).
// - Passo de quem atende: Kátia e "Mais", a página recarrega: Kátia aparece uma vez; adicionar de novo avisa "já está na lista";
//   e se ela já tinha sido gravada antes de recarregar, Continuar não grava outra (antes: duas Kátias e 3 pets por horário).
// - Passo dos preços: a foto da tabela muda o Banho M de 60 para 55 e o campo mostra 55,00 na hora, sem recarregar (Juliana L5).
// - Creche só: o sábado começa inteiro (não meio período) e o fim do guia oferece "Ligar o meu link".
const B = require('../lib/base');
const N = require('../lib/navegador');
const { criarLoja, limpar, SENHA, DOMINIO } = require('../lib/semente');
const T = require('../lib/teste')('telas-guia-recarregar');
const nb = (s) => (s ?? '').replace(/ /g, ' ');
const PADRAO = `'{"0": null, "1": {"abre": "08:00", "fecha": "18:00"}, "2": {"abre": "08:00", "fecha": "18:00"}, "3": {"abre": "08:00", "fecha": "18:00"}, "4": {"abre": "08:00", "fecha": "18:00"}, "5": {"abre": "08:00", "fecha": "18:00"}, "6": {"abre": "08:00", "fecha": "13:00"}}'::jsonb`;

async function entrarNoGuia(page, email) {
  await page.goto(B.BASE_URL + '/gestao/entrar');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', SENHA);
  await page.click('button.g-btn.pri');
  await page.waitForSelector('.g-guia', { timeout: 30000 });
  await page.waitForTimeout(600);
}
const recarregar = async (page, seletor = '.g-guia') => { await page.reload(); await page.waitForSelector(seletor, { timeout: 30000 }); await page.waitForTimeout(800); };
const continuar = async (page) => { await page.locator('.g-guia-pe .g-btn.pri').click(); await page.waitForTimeout(1500); };

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const pasta = `${B.RAIZ}/testes/saida`;

  // ---------- pergunta 1 e 2 (conta sem pet shop) ----------
  {
    T.secao('390: perguntas do começo, recarregando');
    const suf = B.sufixo();
    const email = `t-${suf}.dono@${DOMINIO}`;
    T.depois(() => { const P = B.sql(`select coalesce((select p.petshop_id::text from profissionais p join auth.users u on u.id = p.user_id where u.email = '${email}' limit 1), '')`); if (P) limpar({ P, suf }); else B.sql(`delete from auth.users where email = '${email}'`); });
    const sb = B.cliente();
    B.must(await sb.auth.signUp({ email, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro');
    const { ctx, page, erros } = await N.contexto(390, 844);
    await page.goto(B.BASE_URL + '/gestao/entrar');
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', SENHA);
    await page.click('button.g-btn.pri');
    await page.waitForURL('**/gestao/comecar', { timeout: 30000 });
    await page.waitForSelector('.g-guia-h');
    // rodada 9: o WhatsApp saiu da parte recolhida e fica sempre à vista (só "Cidade e estado" continua recolhido)
    T.ok('o WhatsApp já vem à vista, sem abrir nada', await page.locator('input[name=whatsapp]').isVisible());
    await page.fill('input[minlength="2"]', 'Banho da Bia');
    await page.getByLabel('E como eu chamo você?').fill('Bia');
    await page.fill('input[type=tel]', '(11) 98888-7777');
    await page.waitForTimeout(300);
    await recarregar(page, '.g-guia-h');
    T.ok('recarregou na pergunta 1: o nome e o WhatsApp continuam', (await page.locator('input[minlength="2"]').inputValue()) === 'Banho da Bia' && (await page.locator('input[type=tel]').inputValue()) === '(11) 98888-7777');
    await page.locator('button.g-btn.pri', { hasText: 'Continuar' }).click();
    await page.locator('.g-mod-op', { hasText: 'Banho e tosa' }).click();
    await page.waitForTimeout(300);
    T.ok('pergunta 2 explica "Pacotes e planos" (o plano mensal da creche já vem com a Creche)', /plano mensal da creche já vem com a Creche/.test(nb(await page.locator('.g-mod').innerText())));
    await page.screenshot({ path: `${pasta}/guia-pergunta2-390.png` }).catch(() => {});
    await page.reload();
    await page.waitForSelector('.g-mod-op', { timeout: 30000 });
    T.ok('recarregou na pergunta 2: Banho e tosa continua marcado assim que aparece', (await page.locator('.g-mod-op', { hasText: 'Banho e tosa' }).getAttribute('aria-pressed')) === 'true');
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  // ---------- passos do guia (banho e tosa) ----------
  const L = await criarLoja(T, { nome: 'Guia recarregar', modulos: ['banho_tosa'], equipe: false, dados: false });
  const P = L.P;
  // como um pet shop que acabou de nascer: guia por fazer, horário padrão, só a dona na equipe; o Banho com preço por porte
  B.sql(`update petshops set guia_feito_em = null, horario = ${PADRAO}, vagas = null where id = '${P}';
    update servicos set preco_p = 50, preco_m = 60, preco_g = 70, preco_gg = 80 where petshop_id = '${P}' and nome = 'Banho';`);
  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    if (largura === 1366) B.sql(`update petshops set guia_feito_em = null, horario = ${PADRAO}, vagas = null where id = '${P}'; delete from profissionais where petshop_id = '${P}' and papel <> 'dono'; update servicos set preco_m = 60 where petshop_id = '${P}' and nome = 'Banho';`);
    T.secao(`${largura}: horário com almoço, recarregando`);
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await entrarNoGuia(page, L.emails.dono);
    T.ok('o guia abre no passo do horário', /Quando vocês abrem\?/.test(await page.locator('.g-guia').innerText()));
    T.ok('ainda sem o aviso de "continuei de onde parou"', (await page.locator('[data-teste=guia-retomado]').count()) === 0);
    await page.locator('.g-guia .g-chip', { hasText: /^Ter a sáb$/ }).click();
    await page.locator('.g-guia .g-chip', { hasText: /^8h às 18h$/ }).click();
    await page.getByLabel('Fecha para o almoço?').check();
    await page.waitForTimeout(400);
    await recarregar(page);
    T.ok('recarregou: volta no passo do horário, com o aviso', /Quando vocês abrem\?/.test(await page.locator('.g-guia').innerText()) && (await page.locator('[data-teste=guia-retomado]').count()) === 1);
    T.ok('o almoço continua marcado (12:00 às 13:00)', await page.getByLabel('Fecha para o almoço?').isChecked() && (await page.getByLabel('Almoço: começa').inputValue()) === '12:00');
    const frase = nb(await page.locator('.gj-almoco').innerText());
    T.ok('a frase do sábado ficou simples ("No sábado, fecha às 13:00: sem pausa.")', /No sábado, fecha às 13:00: sem pausa\./.test(frase) && !/Em sábado/.test(frase), frase);
    // rodada 8 (estreante): o parágrafo do almoço tinha 70 palavras
    T.ok('o texto do almoço é curto (até 30 palavras)', frase.split(/\s+/).filter(Boolean).length <= 30, frase);
    await page.screenshot({ path: `${pasta}/guia-horario-recarregado-${largura}.png` }).catch(() => {});
    await continuar(page);
    const h = JSON.parse(B.sql(`select horario::text from petshops where id='${P}'`));
    T.ok('o almoço foi gravado nos dias abertos (quarta: 12:00 às 13:00)', h['3']?.almoco?.de === '12:00' && h['3']?.almoco?.ate === '13:00' && h['1'] === null, h);

    T.secao(`${largura}: quem atende, recarregando`);
    T.ok('passo de quem atende', /Quem atende os pets\?/.test(await page.locator('.g-guia').innerText()));
    T.ok('o aviso de "continuei" saiu ao mudar de passo', (await page.locator('[data-teste=guia-retomado]').count()) === 0);
    await page.fill('input[placeholder="Nome de quem mais atende"]', 'Kátia');
    await page.locator('.g-guia button', { hasText: 'Adicionar' }).click();
    await page.locator('.g-guia button[aria-label="Mais"]').click();
    await page.waitForTimeout(400);
    await recarregar(page);
    T.ok('recarregou: volta em quem atende, com o aviso', /Quem atende os pets\?/.test(await page.locator('.g-guia').innerText()) && (await page.locator('[data-teste=guia-retomado]').count()) === 1);
    const katias = () => page.locator('.g-guia-pessoa', { hasText: 'Kátia' }).count();
    T.ok('Kátia aparece uma vez', (await katias()) === 1);
    await page.fill('input[placeholder="Nome de quem mais atende"]', 'katia');
    await page.locator('.g-guia button', { hasText: 'Adicionar' }).click();
    await page.waitForTimeout(300);
    T.ok('adicionar "katia" de novo: avisa que já está na lista e não repete', (await katias()) === 1 && /Kátia já está na lista/.test(nb(await page.locator('.g-guia').innerText())));
    T.ok('o contador ficou no que ela marcou (3)', (await page.locator('.g-guia-conta .g-num').innerText()).trim() === '3');
    await page.screenshot({ path: `${pasta}/guia-equipe-recarregado-${largura}.png` }).catch(() => {});
    // o caso da Neide: o Continuar de antes já tinha gravado a Kátia, e a página recarregou antes de passar de passo
    B.sql(`insert into profissionais (petshop_id, nome, papel, funcao, atende) values ('${P}', 'Kátia', 'funcionario', 'Banhista e tosador(a)', true)`);
    await continuar(page);
    T.ok('Continuar não grava outra Kátia (uma só na equipe)', B.num(`select count(*) from profissionais where petshop_id='${P}' and nome='Kátia' and ativo`) === 1);
    T.ok('vagas gravadas: 3', B.num(`select vagas from petshops where id='${P}'`) === 3);

    T.secao(`${largura}: preços pela foto da tabela`);
    T.ok('passo dos preços', /O que vocês fazem e quanto custa\?/.test(await page.locator('.g-guia').innerText()));
    const banhoM = page.getByLabel('Banho, porte médio');
    T.ok('Banho M começa em 60,00', (await banhoM.inputValue()) === '60,00', await banhoM.inputValue());
    if (largura === 390) {
      await page.locator('.g-guia button', { hasText: 'Tirar foto da tabela de preços' }).click();
      const folha = page.locator('.g-folha');
      await folha.waitFor();
      const img = await page.screenshot({ type: 'png' });
      await folha.locator('input[type=file][multiple]').setInputFiles({ name: 'tabela.png', mimeType: 'image/png', buffer: img });
      await folha.locator('.g-cad-arqs li').first().waitFor({ timeout: 10000 });
      await folha.locator('button', { hasText: /^Ler / }).click();
      await folha.locator('.g-cad-secao').first().waitFor({ timeout: 30000 });
      await page.locator('.g-cad-rodape button', { hasText: /^Salvar/ }).click();
      await folha.locator('.g-imp-resumo').waitFor({ timeout: 30000 });
      await folha.locator('button', { hasText: 'Pronto' }).click();
      await page.waitForTimeout(1200);
      T.ok('depois de salvar a foto, o Banho M mostra 55,00 na hora (sem recarregar)', (await banhoM.inputValue()) === '55,00', await banhoM.inputValue());
      T.ok('o Banho de ofurô novo aparece na lista do guia', (await page.locator('.g-guia-servico', { hasText: 'Banho de ofurô' }).count()) === 1);
      T.ok('no banco, uma vez só', B.num(`select count(*) from servicos where petshop_id='${P}' and nome='Banho de ofurô'`) === 1);
    }
    await continuar(page);
    T.ok('o passo do link diz onde o link fica depois (Agenda, "Link do cliente")', /na Agenda, no botão "Link do cliente"/.test(nb(await page.locator('.g-guia').innerText())));
    await continuar(page);
    await page.waitForSelector('.g-guia-ola', { timeout: 30000 });
    T.ok('fim do guia: o horário gravado continua com o almoço', JSON.parse(B.sql(`select horario::text from petshops where id='${P}'`))['3']?.almoco?.de === '12:00');
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  // ---------- creche só: sábado inteiro e o link no fim ----------
  {
    T.secao('390: creche só');
    const C = await criarLoja(T, { nome: 'Guia creche', modulos: ['creche'], equipe: false, dados: false });
    B.sql(`update petshops set guia_feito_em = null, horario = ${PADRAO}, link_ativo = false, link_creche = false where id = '${C.P}'`);
    const { ctx, page, erros } = await N.contexto(390, 844);
    await entrarNoGuia(page, C.emails.dono);
    T.ok('"Sábado meio período" não vem marcado para a creche', (await page.locator('.g-guia .g-chip', { hasText: 'Sábado meio período' }).getAttribute('aria-pressed')) === 'false');
    T.ok('o sábado começa das 08:00 às 18:00', (await page.getByLabel('sábado: termina').inputValue()) === '18:00');
    await continuar(page);
    await continuar(page);
    await page.waitForSelector('.g-guia-ola', { timeout: 30000 });
    const ligar = page.locator('[data-teste=ligar-link]');
    T.ok('o fim do guia oferece "Ligar o meu link"', await ligar.isVisible());
    await page.screenshot({ path: `${pasta}/guia-creche-fim-390.png` }).catch(() => {});
    await ligar.click();
    await page.locator('[data-teste=copiar-link]').waitFor({ timeout: 15000 });
    T.ok('ligou o link e o pedido de vaga da creche', B.sql(`select link_ativo::text || link_creche::text from petshops where id='${C.P}'`) === 'truetrue');
    T.ok('sábado gravado inteiro', JSON.parse(B.sql(`select horario::text from petshops where id='${C.P}'`))['6']?.fecha === '18:00');
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
