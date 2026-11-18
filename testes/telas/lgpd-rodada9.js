// Privacidade, rodada 9 (migração 20261236), nas telas, em 390 e 1366. Trabalho técnico de conformidade, não parecer jurídico.
//  - Documentos na versão 2.4: o que a IA recebe, quem vende e nota fiscal, aviso de incidente em 48 horas, painel só com
//    números; página "Para o tutor"; política do site com a Nina; aviso de cookies; aviso de IA embaixo do campo da Nina.
//  - Aplicativo (dono): cartões "Acessos da equipe Maestro Pet" e "Aviso de privacidade para os seus clientes" em Meu pet shop;
//    a dica dos campos de observação; "Baixar os meus dados" baixa o .zip.
//  - Painel do administrador: a aba Conversas não mostra o texto; "Abrir para suporte" pede o motivo, mostra o texto e a
//    abertura aparece para o dono.
//  - Quem sai da equipe: a tela diz que saiu (não que o acesso foi tirado) e tem "Apagar o meu login".
// Capturas em testes/saida/lgpd-rodada9-*.png.
const path = require('path');
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const N = require('../lib/navegador');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('lgpd-rodada9-tela');
const DOC = lib('documentos');
const FOTOS = path.join(B.RAIZ, 'testes', 'saida') + '/';
const foto = (page, nome) => page.screenshot({ path: `${FOTOS}lgpd-rodada9-${nome}.png`, fullPage: false }).catch(() => {});

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'LGPD r9 tela' });
  const loja = B.sql(`select nome from petshops where id = '${L.P}'`);
  const uidDono = B.sql(`select id from auth.users where email = ${B.q(L.emails.dono)}`);
  const conv = B.sql(`insert into conversas (petshop_id, user_id, canal, pergunta, resposta, resolveu) values
    ('${L.P}', '${uidDono}', 'mozart', 'quanto o Beto Lima deve? TEXTOSECRETO', 'O Beto Lima deve R$ 80.', false) returning id`);
  // um login da equipe Maestro Pet para o painel
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  const adm = B.cliente();
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uidAdm = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uidAdm}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uidAdm}'`));
  const semRolagem = async (page, onde) => T.ok(`sem rolagem para o lado (${onde})`, (await N.rolagemLateral(page)) <= 0, await N.rolagemLateral(page));

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await ctx.route(/facebook\.(com|net)/, (r) => r.abort());

    T.secao(`${largura}: documentos`);
    await N.ir(page, '/gestao/privacidade', '.g-leg-texto');
    let txt = await page.locator('.g-leg').innerText();
    T.ok(`Política na versão ${DOC.DOCUMENTOS.privacidade.versao}`, txt.includes(`Versão ${DOC.DOCUMENTOS.privacidade.versao}`) && Number(DOC.DOCUMENTOS.privacidade.versao) >= 2.4);
    T.ok('diz o que vai à IA: telefones, alertas, observações e ficha de saúde', /nomes e telefones de tutores, nomes, alertas, observações e ficha de saúde dos pets/.test(txt));
    T.ok('painel só com números; ler uma conversa exige motivo e o dono vê', /mostra só números/.test(txt) && /Acessos da equipe Maestro Pet/.test(txt) && !/não os clientes, os pets nem o dinheiro do pet shop\./.test(txt));
    T.ok('lista de fornecedores: Supabase, Vercel, Anthropic, Cakto e Meta (só depois do Aceitar)', ['Supabase', 'Vercel', 'Anthropic', 'Cakto', 'Meta'].every((f) => txt.includes(f)) && /só depois de você tocar em/.test(txt));
    T.ok('dados fora do Brasil: artigo 33 e quem recebe o quê', /artigo 33 da LGPD/.test(txt) && /Hospedagem \(Vercel\)/.test(txt));
    T.ok('incidente: 48 horas depois de tomarmos conhecimento', /48 horas depois de tomarmos conhecimento/.test(txt) && !/2 dias úteis/.test(txt));
    T.ok('cópia completa: onde fica e por quanto tempo', /no máximo as 4 mais recentes/.test(txt));
    T.ok('prazos novos: pedidos pelo link 90 dias, freio 2 dias', /Pedidos pelo link que não viraram horário/.test(txt) && /2 dias/.test(txt));
    T.ok('quem oferece: nome e documento, sem marcador vazio', /inscrit[oa] no (CPF|CNPJ) sob o nº \S+/.test(txt) && !/\[(NOME|CPF|CNPJ|RAZÃO)/.test(txt));
    await semRolagem(page, 'privacidade');
    await N.ir(page, '/gestao/termos', '.g-leg-texto');
    txt = await page.locator('.g-leg').innerText();
    T.ok(`Termos na versão ${DOC.DOCUMENTOS.termos.versao}`, txt.includes(`Versão ${DOC.DOCUMENTOS.termos.versao}`));
    T.ok('sem nota fiscal, com todas as letras', /Por enquanto a assinatura não tem nota fiscal/.test(txt));
    T.ok('reembolso integral em 7 dias', /em até 7 dias depois do primeiro pagamento/.test(txt));
    T.ok('incidente em 48 horas; conversas só com motivo', /48 horas depois de tomarmos conhecimento/.test(txt) && /Acessos da equipe Maestro Pet/.test(txt) && !/usamos só números gerais/.test(txt));
    await semRolagem(page, 'termos');

    T.secao(`${largura}: Para o tutor, política do site, Nina e cookies`);
    await N.ir(page, '/gestao/para-o-tutor', '.g-leg-texto');
    txt = await page.locator('.g-leg').innerText();
    T.ok('Para o tutor: quem guarda, como pedir, fotos', /Quem guarda os seus dados/.test(txt) && /Fale com o pet shop/.test(txt) && /Não quero mais/.test(txt) && /maiores de 18 anos/.test(txt));
    await semRolagem(page, 'para o tutor');
    await foto(page, `tutor-${largura}`);
    T.ok('o rodapé dos documentos leva a Para o tutor', (await (await fetch(`${B.BASE_URL}/gestao/privacidade`)).text()).includes('href="/gestao/para-o-tutor"'));
    await N.ir(page, '/politica-de-privacidade', 'main');
    txt = await page.locator('main').innerText();
    T.ok('política do site: a Nina, a Anthropic e o Supabase', /No chat da Nina/.test(txt) && /Anthropic/.test(txt) && /Supabase/.test(txt));
    await N.ir(page, '/gestao', null);
    const aviso = page.locator('.cookies');
    if (await aviso.count()) T.ok('aviso de cookies diz para que servem', /cookies da Meta para medir anúncios/.test(await aviso.innerText()), await aviso.innerText().catch(() => ''));
    else T.ok('aviso de cookies: não apareceu nesta página (sem pixel configurado)', true);
    if (await aviso.count()) await aviso.getByRole('button', { name: 'Recusar' }).click().catch(() => {});
    await page.evaluate(() => window.scrollTo(0, 2400));
    await page.waitForSelector('.gp-chat-botao:not(.escondido)', { timeout: 15000 });
    await page.locator('.gp-chat-botao:not(.escondido)').click({ timeout: 15000 });
    await page.waitForSelector('.gp-chat-aviso', { timeout: 15000 });
    const avisoNina = await page.locator('.gp-chat-aviso').innerText();
    T.ok('embaixo do campo da Nina: é IA, vai ao fornecedor fora do Brasil, não escreva dados pessoais', /inteligência artificial/.test(avisoNina) && /Anthropic, fora do Brasil/.test(avisoNina) && /Não escreva dados pessoais/.test(avisoNina), avisoNina);
    const campoNina = await page.locator('.gp-chat form').boundingBox(), caixaAviso = await page.locator('.gp-chat-aviso').boundingBox();
    T.ok('o aviso cabe na tela, logo abaixo do campo', !!campoNina && !!caixaAviso && caixaAviso.y >= campoNina.y && caixaAviso.y + caixaAviso.height <= altura + 1, [campoNina, caixaAviso]);
    await foto(page, `nina-${largura}`);

    T.secao(`${largura}: Meu pet shop (dono)`);
    await N.entrar(page, L.emails.dono, SENHA);
    await N.ir(page, '/gestao/app/meu-petshop');
    const grupo = page.getByRole('button', { name: /Seus dados e a conta/ }).first();
    if (await grupo.count()) await grupo.click().catch(() => {});
    await page.waitForSelector('[data-teste="acessos-maestro"]', { timeout: 20000 });
    const acessos = page.locator('[data-teste="acessos-maestro"]');
    await acessos.scrollIntoViewIfNeeded();
    T.ok('cartão Acessos da equipe Maestro Pet', /Ninguém da equipe Maestro Pet abriu conversas|Leu uma conversa/.test(await acessos.innerText()), await acessos.innerText());
    const avisoLoja = page.locator('[data-teste="aviso-clientes"]');
    T.ok('aviso de privacidade pronto, com o nome do pet shop', (await avisoLoja.locator('textarea').inputValue()).includes(loja) && /ver, corrigir, receber uma cópia ou apagar/.test(await avisoLoja.locator('textarea').inputValue()));
    await avisoLoja.scrollIntoViewIfNeeded();
    await foto(page, `meu-petshop-${largura}`);
    await semRolagem(page, 'Meu pet shop');

    T.secao(`${largura}: dica nos campos de observação`);
    await N.ir(page, '/gestao/app/clientes');
    await page.getByText('Beto Lima').first().click();
    await page.getByRole('button', { name: /Editar/ }).first().click({ timeout: 20000 });
    await page.waitForSelector('.g-folha textarea', { timeout: 20000 });
    T.ok('ficha do tutor: "Escreva só sobre o pet e o atendimento…"', /Escreva só sobre o pet e o atendimento\. Não anote doença, religião ou outro dado íntimo de pessoas\./.test(await page.locator('.g-folha').last().innerText()));
    await foto(page, `dica-obs-${largura}`);
    await page.keyboard.press('Escape');

    T.secao(`${largura}: Baixar os meus dados`);
    await N.ir(page, '/gestao/app');
    if (largura < 900) await page.locator('.g-barra, nav').getByRole('button', { name: /^Mais/ }).first().click();
    const baixar = page.getByRole('button', { name: 'Baixar os meus dados' }).first();
    await baixar.waitFor({ timeout: 15000 });
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), baixar.click()]);
    T.ok('baixa um .zip com o nome certo', /^meus-dados-maestro-pet-\d{4}-\d{2}-\d{2}\.zip$/.test(d.suggestedFilename()), d.suggestedFilename());

    T.secao(`${largura}: painel do administrador, aba Conversas`);
    const A = await N.contexto(largura, altura);
    await A.page.goto(B.BASE_URL + '/gestao/entrar');
    await A.page.fill('input[type=email]', emailAdm);
    await A.page.fill('input[type=password]', SENHA);
    await A.page.click('button.g-btn.pri');
    await A.page.waitForURL(/gestao\/(app|comecar|admin)/, { timeout: 30000 });
    await N.ir(A.page, '/gestao/admin', '.g-chips, [role=tablist], .g-abas');
    await A.page.getByRole('button', { name: 'Conversas' }).or(A.page.getByRole('tab', { name: 'Conversas' })).first().click();
    await A.page.waitForSelector('[data-teste="aviso-conversas"]', { timeout: 30000 });
    await A.page.waitForSelector('[data-teste="conversa"]', { timeout: 30000 });
    const painel = await A.page.locator('.g-main, main').first().innerText();
    T.ok('a lista não mostra o texto de nenhuma conversa', !painel.includes('TEXTOSECRETO') && !painel.includes('Beto Lima'), painel.slice(0, 300));
    T.ok('mostra os números (conversas, erros, ferramentas, tokens)', await A.page.locator('[data-teste="numeros-conversas"]').count() === 1 && /Ferramentas usadas/.test(painel) && /Tokens/.test(painel));
    const minha = A.page.locator('[data-teste="conversa"]', { hasText: loja }).first();
    await minha.scrollIntoViewIfNeeded();
    const jaAberta = /aberta para suporte/.test(await minha.innerText());
    await minha.getByRole('button', { name: 'Abrir para suporte' }).click();
    await minha.getByRole('button', { name: 'Abrir e registrar' }).click();
    T.ok('sem motivo não abre', /Escreva o motivo/.test(await minha.innerText()) && !(await minha.innerText()).includes('TEXTOSECRETO'));
    await minha.locator('textarea').fill(`Teste de suporte em ${largura}: a dona pediu ajuda`);
    await foto(A.page, `admin-motivo-${largura}`);
    await minha.getByRole('button', { name: 'Abrir e registrar' }).click();
    await A.page.waitForFunction((id) => document.body.innerText.includes('TEXTOSECRETO'), conv, { timeout: 20000 }).catch(() => {});
    T.ok('com motivo: mostra o texto e marca "aberta para suporte"', (await minha.innerText()).includes('TEXTOSECRETO') && /aberta para suporte/.test(await minha.innerText()), (await minha.innerText()).slice(0, 300));
    await semRolagem(A.page, 'painel, conversas');
    await foto(A.page, `admin-aberta-${largura}`);
    void jaAberta;
    T.ok('nenhum erro no painel', A.erros.length === 0, A.erros);
    await A.ctx.close();

    T.secao(`${largura}: o dono vê quem abriu`);
    await N.ir(page, '/gestao/app/meu-petshop');
    const grupo2 = page.getByRole('button', { name: /Seus dados e a conta/ }).first();
    if (await grupo2.count()) await grupo2.click().catch(() => {});
    await page.waitForSelector('[data-teste="acessos-maestro"] .gl-registro', { timeout: 20000 });
    const visto = await page.locator('[data-teste="acessos-maestro"]').innerText();
    T.ok('a abertura aparece com quem, quando e o motivo', visto.includes(`Teste de suporte em ${largura}`) && visto.includes(emailAdm) && /Leu uma conversa com o Mozart/.test(visto), visto);
    await page.locator('[data-teste="acessos-maestro"]').scrollIntoViewIfNeeded();
    await foto(page, `acessos-${largura}`);
    await semRolagem(page, 'acessos da equipe');
    T.ok(`nenhum erro nas telas (${largura})`, erros.length === 0, erros);
    await ctx.close();
  }

  // -----------------------------------------------------------------------------------------------------------------
  T.secao('quem sai da equipe: a tela certa e "Apagar o meu login"');
  const { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.monitor, SENHA);
  await page.locator('.g-barra, nav').getByRole('button', { name: /^Mais/ }).first().click();
  await page.getByRole('button', { name: 'Sair desta equipe' }).first().click();
  await page.getByRole('button', { name: 'Sair desta equipe' }).last().click();
  await page.waitForURL('**/gestao/comecar**', { timeout: 30000 });
  await page.getByRole('button', { name: 'Apagar o meu login' }).waitFor({ timeout: 30000 });
  const tela = await page.locator('body').innerText();
  T.ok('a tela diz que a pessoa saiu (não que o acesso foi retirado)', tela.includes(`Você saiu da equipe de ${loja}`) && !/foi retirado/.test(tela), tela.slice(0, 300));
  T.ok('tem Sair desta conta, Baixar os meus dados e Apagar o meu login', /Sair desta conta/.test(tela) && /Baixar os meus dados/.test(tela) && /Apagar o meu login/.test(tela));
  await foto(page, 'saiu-390');
  T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
  await page.getByRole('button', { name: 'Apagar o meu login' }).click();
  T.ok('pede confirmação e explica o que fica', /Apagar este login de vez\?/.test(await page.locator('body').innerText()) && /continua no histórico do pet shop/.test(await page.locator('body').innerText()));
  await foto(page, 'apagar-login-390');
  const uidMonitor = B.sql(`select id from auth.users where email = ${B.q(L.emails.monitor)}`);
  await page.getByRole('button', { name: 'Sim, apagar o meu login' }).click();
  await page.waitForURL('**/gestao/entrar**', { timeout: 30000 });
  const sumiu = B.num(`select count(*) from auth.users where id='${uidMonitor}'`) === 0;
  const naFila = B.num(`select count(*) from logins_lixo where user_id='${uidMonitor}'`) === 1;
  T.ok('o login foi apagado na hora (servidor com a chave de serviço) ou ficou na fila da faxina', sumiu || naFila, { sumiu, naFila });
  T.ok('o nome continua na equipe, sem login', B.sql(`select nome || '|' || coalesce(user_id::text, 'sem') from profissionais where id='${L.ids.monitor}'`) === 'Mário Monitor|sem');
  T.depois(() => B.sql(`delete from logins_lixo where user_id='${uidMonitor}'`));
  T.ok('nenhum erro na tela', erros.length === 0, erros);
  await ctx.close();
  await N.fecharNavegador();
}))();
