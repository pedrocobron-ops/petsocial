// Telas da senha do painel do administrador (migração 20261247, src/components/gestao/admin/senha-do-painel.tsx), no celular
// (390×844) e no computador (1366×900):
//   - admin sem senha: a porta explica e oferece o link por e-mail; nada do painel aparece;
//   - o link chega no e-mail (Mailpit do Supabase local) e traz de volta para escolher a senha; senha curta e senhas
//     diferentes são avisadas; a senha boa abre o painel;
//   - "Fechar o painel" volta para a porta sem sair da conta e pede a senha; senha errada avisa quantas tentativas restam;
//     a quinta errada trava (campo parado e aviso com o horário); passada a trava, a senha certa abre;
//   - outro login do mesmo admin não herda o painel aberto; trocar a senha pelo e-mail fecha o painel do outro aparelho;
//   - o link aberto num aparelho sem login entra na conta e cai na escolha da senha; o link só vale uma vez;
//   - quem não é admin vê a página de sempre, sem porta e sem falar de senha;
//   - nenhuma violação da regra de conteúdo, nenhum erro de console e nada de rolagem lateral.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('senha-do-painel-tela');

/** Junta as violações da regra de conteúdo (o evento do navegador e a linha "Refused to…" do console). */
async function vigiarCsp(ctx, page) {
  const visto = [];
  await ctx.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.log(`CSP-VIOLACAO ${e.effectiveDirective} ${e.blockedURI || '(em linha)'} ${e.sourceFile || ''}:${e.lineNumber || ''}`));
  });
  page.on('console', (m) => { const t = m.text(); if (/^CSP-VIOLACAO|Content Security Policy|Refused to (load|execute|apply|connect|frame)/.test(t)) visto.push(`${new URL(page.url()).pathname}: ${t.slice(0, 240)}`); });
  return visto;
}
const porta = (page, modo) => page.locator(`[data-teste=painel-porta]${modo ? `[data-modo=${modo}]` : ''}`);
/**
 * Abre no navegador o link que chegou no e-mail. O Auth local só volta para o endereço do pedido quando o nome da máquina é
 * o do site_url (127.0.0.1); para o teste valer também com BASE_URL=http://localhost:…, a volta é montada aqui com a mesma
 * resposta do link (#access_token…), que é o que o navegador receberia.
 */
async function abrirLinkDoEmail(page, email, desde) {
  const { link, assunto } = await B.emailRecebido(email, desde);
  const destino = (await fetch(link, { redirect: 'manual' })).headers.get('location') ?? '';
  await page.goto('about:blank');
  await page.goto(`${B.BASE_URL}/gestao/admin#${destino.split('#')[1] ?? ''}`);
  return { link, assunto, destino };
}
async function pedirLink(page) {
  const desde = Date.now();
  await page.locator('[data-teste=painel-pedir-link]').click();
  await page.locator('[data-teste=painel-enviado]').waitFor({ timeout: 20000 });
  return desde;
}
/** Digita a senha do painel, manda e espera o banco responder. */
async function digitarSenha(page, senha) {
  await page.fill('[data-teste=painel-senha]', senha);
  await Promise.all([
    page.waitForResponse((x) => /rpc\/admin_painel_abrir/.test(x.url()), { timeout: 20000 }),
    page.locator('[data-teste=painel-abrir] button[type=submit]').click(),
  ]);
  await page.waitForTimeout(200);
}
/** Quem chegou pelo link há pouco vê primeiro a troca de senha: vai para o pedido da senha. */
async function pedirASenha(page) {
  await porta(page).waitFor({ timeout: 30000 });
  if (await page.locator('[data-teste=painel-usar-atual]').isVisible().catch(() => false)) await page.locator('[data-teste=painel-usar-atual]').click();
  await porta(page, 'abrir').waitFor({ timeout: 10000 });
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  T.depois(() => N.fecharNavegador());
  const L = await criarLoja(T, { nome: 'Senha painel tela' });
  const uid = B.sql(`select user_id from profissionais where petshop_id='${L.P}' and papel='dono'`);
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'; delete from admin_senha_tentativas where user_id='${uid}'`));
  const zerar = () => B.sql(`delete from admin_senhas where user_id='${uid}'; delete from admin_senha_tentativas where user_id='${uid}'`);

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const SENHA_1 = `Primeira-${larg}-${L.suf}`;
    zerar();
    await new Promise((r) => setTimeout(r, 1200)); // o Auth local manda um e-mail por segundo para a mesma pessoa
    const { ctx, page, erros } = await N.contexto(larg, alt);
    const csp = await vigiarCsp(ctx, page);
    await N.entrar(page, L.emails.dono, L.senha);

    T.secao(`admin sem senha (${larg})`);
    await page.goto(B.BASE_URL + '/gestao/admin');
    await porta(page, 'sem_senha').waitFor({ timeout: 30000 });
    let texto = await porta(page).innerText();
    T.ok(`sem senha: a porta explica e oferece o link por e-mail (${larg})`, /Senha do painel/.test(texto) && /ainda não registrou a senha do painel/.test(texto) && /Receber o link por e-mail/.test(texto), texto.slice(0, 200));
    T.ok(`… sem campo de senha e sem nada do painel (${larg})`, (await page.locator('[data-teste=painel-senha], .g-adm-abas, [data-teste=painel-fechar]').count()) === 0);
    T.ok(`… o e-mail aparece disfarçado (${larg})`, !texto.includes(L.emails.dono) && texto.includes('•••@teste-auto.local'));
    T.ok(`sem rolagem lateral na porta (${larg})`, (await N.rolagemLateral(page)) <= 0);

    T.secao(`o link por e-mail e a senha nova (${larg})`);
    const desde = await pedirLink(page);
    texto = await porta(page).innerText();
    T.ok(`depois de pedir: diz para onde foi e o que fazer (${larg})`, /Mandamos um link para/.test(texto) && /toque no link/.test(texto) && /spam/.test(texto), texto.slice(0, 200));
    // código errado (se o e-mail trouxer código em vez do link): avisa e segue na porta
    await page.fill('[data-teste=painel-codigo]', '000000');
    await page.locator('[data-teste=painel-enviado] button[type=submit]').click();
    await page.locator('[data-teste=painel-email] .g-erro').waitFor({ timeout: 15000 }).catch(() => {});
    T.ok(`código errado: avisa e não muda nada (${larg})`, /não confere/.test(await page.locator('[data-teste=painel-email]').innerText()) && (await porta(page, 'sem_senha').count()) === 1);
    const ida = await abrirLinkDoEmail(page, L.emails.dono, desde);
    T.ok(`o e-mail traz o link que volta para /gestao/admin (${larg})`, ida.link.includes(`redirect_to=${B.BASE_URL}/gestao/admin`), ida.link);
    await porta(page, 'definir').waitFor({ timeout: 30000 });
    texto = await porta(page).innerText();
    T.ok(`chegando pelo link: a tela pede a senha nova (${larg})`, /Escolha a senha do painel/.test(texto) && /diferente da senha da sua conta/.test(texto) && /Pelo menos 10/.test(texto), texto.slice(0, 200));
    T.ok(`… o endereço fica limpo, sem o código do link (${larg})`, !/access_token|refresh_token/.test(page.url()), page.url());
    T.ok(`… e o painel ainda não abriu (${larg})`, (await page.locator('.g-adm-abas').count()) === 0);
    await page.fill('[data-teste=painel-nova]', 'curta123'); await page.fill('[data-teste=painel-repetida]', 'curta123');
    await page.locator('[data-teste=painel-definir] button[type=submit]').click();
    T.ok(`senha curta: avisa (${larg})`, /pelo menos 10/.test(await page.locator('[data-teste=painel-definir] .g-erro').innerText()));
    await page.fill('[data-teste=painel-nova]', SENHA_1); await page.fill('[data-teste=painel-repetida]', SENHA_1 + 'x');
    await page.locator('[data-teste=painel-definir] button[type=submit]').click();
    T.ok(`senhas diferentes: avisa (${larg})`, /diferentes/.test(await page.locator('[data-teste=painel-definir] .g-erro').innerText()));
    await page.fill('[data-teste=painel-nova]', L.emails.dono); await page.fill('[data-teste=painel-repetida]', L.emails.dono);
    await page.locator('[data-teste=painel-definir] button[type=submit]').click();
    T.ok(`senha igual ao e-mail: avisa (${larg})`, /não pode ser o seu e-mail/.test(await page.locator('[data-teste=painel-definir] .g-erro').innerText()));
    T.ok(`nada gravado até aqui (${larg})`, B.num(`select count(*) from admin_senhas where user_id='${uid}'`) === 0);
    await page.fill('[data-teste=painel-nova]', SENHA_1); await page.fill('[data-teste=painel-repetida]', SENHA_1);
    await page.locator('[data-teste=painel-definir] button[type=submit]').click();
    await page.locator('.g-adm-abas').waitFor({ timeout: 30000 });
    T.ok(`senha boa: fica guardada (só o hash) e o painel abre (${larg})`, await page.locator('.g-adm-abas').isVisible() && /^\$2[aby]\$12\$/.test(B.sql(`select hash from admin_senhas where user_id='${uid}'`)));
    await page.locator('[data-aba]:not([data-aba-carregando])').first().waitFor({ timeout: 20000 }).catch(() => {});
    T.ok(`sem rolagem lateral no painel (${larg})`, (await N.rolagemLateral(page)) <= 0);

    T.secao(`fechar o painel, senha errada e a trava (${larg})`);
    await page.locator('[data-teste=painel-fechar]').click();
    await porta(page, 'abrir').waitFor({ timeout: 30000 });
    T.ok(`"Fechar o painel": volta para a porta pedindo a senha, sem sair da conta (${larg})`, (await page.locator('.g-adm-abas').count()) === 0 && new URL(page.url()).pathname === '/gestao/admin'
      && B.num(`select count(*) from admin_painel_sessoes where user_id='${uid}'`) === 0 && /Esqueci ou quero trocar a senha: receber o link por e-mail/.test(await porta(page).innerText()), page.url());
    T.ok(`… e os dados do painel saíram da tela (${larg})`, !/Pet shops|Visão geral/.test(await page.locator('body').innerText()));
    await page.reload();
    await porta(page, 'definir').waitFor({ timeout: 30000 });
    T.ok(`recarregando logo depois do link: oferece trocar, com a saída "usar a senha que já tenho" (${larg})`, await page.locator('[data-teste=painel-usar-atual]').isVisible());
    await page.locator('[data-teste=painel-usar-atual]').click();
    await porta(page, 'abrir').waitFor({ timeout: 10000 });
    await digitarSenha(page, SENHA_1 + '-errada');
    await page.locator('[data-teste=painel-abrir] .g-erro').waitFor({ timeout: 15000 });
    T.ok(`senha errada: avisa quantas tentativas restam e não abre (${larg})`, /Senha errada\. Você ainda pode tentar 4 vezes/.test(await page.locator('[data-teste=painel-abrir] .g-erro').innerText()) && (await page.locator('.g-adm-abas').count()) === 0);
    T.ok(`… e o campo fica vazio para digitar de novo (${larg})`, (await page.inputValue('[data-teste=painel-senha]')) === '');
    for (let k = 0; k < 4; k++) await digitarSenha(page, `errada-${k}-xxxx`);
    await page.locator('[data-teste=painel-travado]').waitFor({ timeout: 15000 });
    texto = await page.locator('[data-teste=painel-travado]').innerText();
    T.ok(`quinta errada: trava com aviso claro e o horário (${larg})`, /Muitas senhas erradas/.test(texto) && /espere 1[45] minutos \(até as \d{2}:\d{2}\)/.test(texto) && /link por e-mail/.test(texto), texto);
    T.ok(`… com o campo e o botão parados (${larg})`, await page.locator('[data-teste=painel-senha]').isDisabled() && await page.locator('[data-teste=painel-abrir] button[type=submit]').isDisabled());
    await page.reload();
    await pedirASenha(page);
    await page.locator('[data-teste=painel-travado]').waitFor({ timeout: 30000 });
    T.ok(`recarregar não tira a trava (${larg})`, await page.locator('[data-teste=painel-senha]').isDisabled());
    B.sql(`update admin_senha_tentativas set bloqueado_ate = now() - interval '1 second' where user_id='${uid}'`);
    await page.reload();
    await pedirASenha(page);
    await digitarSenha(page, SENHA_1);
    await page.locator('.g-adm-abas').waitFor({ timeout: 30000 });
    T.ok(`passada a trava, a senha certa abre (${larg})`, await page.locator('.g-adm-abas').isVisible());
    await page.reload();
    await page.locator('.g-adm-abas').waitFor({ timeout: 30000 });
    T.ok(`recarregando com o painel aberto: continua aberto, sem pedir a senha (${larg})`, (await porta(page).count()) === 0);

    T.secao(`outro login não herda; trocar a senha fecha os outros (${larg})`);
    const outro = await N.contexto(larg === 390 ? 1366 : 390, larg === 390 ? 900 : 844);
    const cspOutro = await vigiarCsp(outro.ctx, outro.page);
    await N.entrar(outro.page, L.emails.dono, L.senha);
    await outro.page.goto(B.BASE_URL + '/gestao/admin');
    await porta(outro.page, 'abrir').waitFor({ timeout: 30000 });
    T.ok(`outro aparelho com a senha da conta: pede a senha do painel (${larg})`, (await outro.page.locator('.g-adm-abas').count()) === 0);
    T.ok(`… e o banco não entrega o painel a esse login (${larg})`, await outro.page.evaluate(async ({ url, chave }) => {
      const k = Object.keys(localStorage).find((x) => { try { return !!JSON.parse(localStorage.getItem(x))?.access_token; } catch { return false; } });
      const r = await fetch(`${url}/rest/v1/rpc/admin_painel`, { method: 'POST', headers: { apikey: chave, authorization: `Bearer ${JSON.parse(localStorage.getItem(k)).access_token}`, 'content-type': 'application/json' }, body: '{}' });
      return r.status;
    }, { url: B.SUPABASE_URL, chave: B.SUPABASE_KEY }) >= 400);
    outro.erros.splice(0, outro.erros.length, ...outro.erros.filter((e) => !/rpc\/admin_painel\b/.test(e)));
    // troca pelo e-mail no outro aparelho
    const SENHA_2 = `Segunda-${larg}-${L.suf}`;
    await new Promise((r) => setTimeout(r, 1200));
    const desde2 = await pedirLink(outro.page);
    await abrirLinkDoEmail(outro.page, L.emails.dono, desde2);
    await porta(outro.page, 'definir').waitFor({ timeout: 30000 });
    T.ok(`com senha registrada, o link leva a "Escolha a senha nova" (${larg})`, /Escolha a senha nova do painel/.test(await porta(outro.page).innerText()));
    await outro.page.fill('[data-teste=painel-nova]', SENHA_2); await outro.page.fill('[data-teste=painel-repetida]', SENHA_2);
    await outro.page.locator('[data-teste=painel-definir] button[type=submit]').click();
    await outro.page.locator('.g-adm-abas').waitFor({ timeout: 30000 });
    T.ok(`senha trocada: o painel abre no aparelho que trocou (${larg})`, await outro.page.locator('.g-adm-abas').isVisible());
    const antesDeFechar = erros.length;
    await page.locator('.g-topo .g-acoes button', { hasText: 'Atualizar' }).click();
    await pedirASenha(page);
    T.ok(`… e fecha no primeiro aparelho, que volta para a porta ao atualizar (${larg})`, (await page.locator('.g-adm-abas').count()) === 0);
    await digitarSenha(page, SENHA_1);
    await page.locator('[data-teste=painel-abrir] .g-erro').waitFor({ timeout: 15000 });
    T.ok(`a senha antiga não abre mais (${larg})`, /Senha errada/.test(await page.locator('[data-teste=painel-abrir] .g-erro').innerText()));
    await digitarSenha(page, SENHA_2);
    await page.locator('.g-adm-abas').waitFor({ timeout: 30000 });
    T.ok(`a senha nova abre (${larg})`, await page.locator('.g-adm-abas').isVisible());

    // os avisos esperados: o código errado (403 do Auth) e, no primeiro aparelho, os pedidos recusados quando o outro fechou o painel
    const sobra = [...erros.slice(0, antesDeFechar).filter((e) => !/\/auth\/v1\/verify/.test(e)), ...erros.slice(antesDeFechar).filter((e) => !/rpc\/admin_/.test(e)), ...outro.erros];
    T.ok(`nenhuma violação da regra de conteúdo (${larg})`, csp.length === 0 && cspOutro.length === 0, [...csp, ...cspOutro]);
    T.ok(`sem erro de console nem pedido falhado fora do esperado (${larg})`, sobra.length === 0, sobra);
    T.ok(`… e o esperado é só o código errado e a recusa depois que o outro aparelho fechou o painel (${larg})`, erros.filter((e) => /\/auth\/v1\/verify/.test(e)).length === 1 && erros.length - 1 <= 6, erros);
    await outro.ctx.close();
    await ctx.close();
  }

  T.secao('quem não é admin');
  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(larg, alt);
    const csp = await vigiarCsp(ctx, page);
    await N.entrar(page, L.emails.caixa, L.senha);
    await page.goto(B.BASE_URL + '/gestao/admin');
    await page.locator('.g-vazio').waitFor({ timeout: 30000 });
    const texto = await page.locator('body').innerText();
    T.ok(`vê a página de sempre, sem porta e sem falar de senha (${larg})`, /Esta página é da equipe Maestro Pet/.test(texto) && !/senha/i.test(texto) && (await porta(page).count()) === 0, texto.slice(0, 200));
    T.ok(`sem violação e sem erro (${larg})`, csp.length === 0 && erros.length === 0, [...csp, ...erros]);
    await ctx.close();
  }

  T.secao('o link aberto num aparelho que não estava logado');
  {
    // o pedido sai de um aparelho (aqui, pela API) e o e-mail é aberto em outro, sem login nenhum
    await new Promise((r) => setTimeout(r, 1200));
    const desde = Date.now();
    B.must(await B.cliente().auth.signInWithOtp({ email: L.emails.dono, options: { shouldCreateUser: false, emailRedirectTo: `${B.BASE_URL}/gestao/admin` } }), 'pedido do link');
    const { ctx, page, erros } = await N.contexto(390, 844);
    const csp = await vigiarCsp(ctx, page);
    await abrirLinkDoEmail(page, L.emails.dono, desde);
    await porta(page, 'definir').waitFor({ timeout: 30000 });
    T.ok('o link entra na conta e cai direto em "Escolha a senha nova do painel"', /Escolha a senha nova do painel/.test(await porta(page).innerText()) && (await page.locator('.g-adm-abas').count()) === 0);
    const SENHA_3 = `Terceira-${L.suf}-abc`;
    await page.fill('[data-teste=painel-nova]', SENHA_3); await page.fill('[data-teste=painel-repetida]', SENHA_3);
    await page.locator('[data-teste=painel-definir] button[type=submit]').click();
    await page.locator('.g-adm-abas').waitFor({ timeout: 30000 });
    T.ok('… e a senha escolhida ali abre o painel', await page.locator('.g-adm-abas').isVisible());
    T.ok('o mesmo link não vale duas vezes', await (async () => {
      const { link } = await B.emailRecebido(L.emails.dono, desde);
      return !/access_token=/.test((await fetch(link, { redirect: 'manual' })).headers.get('location') ?? '');
    })());
    T.ok('sem violação e sem erro', csp.length === 0 && erros.length === 0, [...csp, ...erros]);
    await ctx.close();
  }

  T.secao('as outras telas do painel abrem com a senha de teste');
  {
    zerar();
    const { ctx, page } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/admin', '.g-adm-abas');
    T.ok('N.ir registra a senha de teste de quem não tem e abre o painel', await page.locator('.g-adm-abas').isVisible());
    await ctx.close();
  }
}))();
