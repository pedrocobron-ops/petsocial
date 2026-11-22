// Mozart com anexos, na tela, com a rota de verdade e o roteiro de teste (GESTAO_MOZART_FALSO=1 e GESTAO_CADERNO_FALSO=1;
// o modelo nunca é chamado). Em 390 x 844 e 1366 x 900:
//  - o clipe ao lado do microfone: rótulo, menu (Tirar foto, Fotos da galeria, Arquivo), teclado (setas, Esc devolve o foco);
//  - a miniatura antes de enviar, com o botão de tirar; dá para mandar só o anexo;
//  - só a foto: o Mozart diz o que entendeu e pergunta; foto + "marca esses horários": dois cartões, Confirmar tudo grava;
//  - PDF + "lança essa conta": cartão Conta a pagar, "Pode fazer" grava;
//  - o que não serve é avisado antes de enviar (PDF longo, PDF pesado, mais de 4 fotos, arquivo que não é foto) e a planilha
//    ganha a resposta do Mozart apontando Trazer de planilha, sem gastar pedido nem página;
//  - o saldo de páginas aparece perto do clipe quando está acabando e quando acabou (teste: 10 por dia e os 20 do plano pago;
//    quem paga: 20), e é o mesmo da Foto do caderno;
//  - o limite de pedidos com a mensagem do teste (50, e os 150 do plano pago) e de quem paga (150);
//  - modo automático: os bloqueios da foto são feitos na hora, com Desfazer;
//  - o Mozart não respondeu: o anexo volta para a caixa e a página volta para o saldo;
//  - a conversa guardada na aba não leva o arquivo; sem erro de console, sem violação da regra de conteúdo, sem rolagem lateral.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('mozart-anexos-telas');

function pdf(n, peso = 0) {
  const kids = Array.from({ length: n }, (_, i) => `${i + 3} 0 R`).join(' ');
  const pags = Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj`).join('\n');
  const b = Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${kids}] /Count ${n} >> endobj\n${pags}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, 'latin1');
  return peso ? Buffer.concat([b, Buffer.alloc(peso, 32)]) : b;
}
const nb = (s) => (s ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart anexos telas' });
  const P = L.P;
  const q = (s) => B.sql(s);
  const hojeDaLoja = `(now() at time zone 'America/Sao_Paulo')::date`;
  const paginas = () => B.num(`select coalesce(sum(paginas), 0) from caderno_uso where petshop_id='${P}' and dia = ${hojeDaLoja}`);
  const pedidos = () => B.num(`select coalesce(sum(pedidos), 0) from assistente_uso where petshop_id='${P}' and canal='mozart' and dia = ${hojeDaLoja}`);
  const porPaginas = (n) => q(`insert into caderno_uso (petshop_id, dia, paginas, leituras) values ('${P}', ${hojeDaLoja}, ${n}, 1) on conflict (petshop_id, dia) do update set paginas = ${n}`);
  const porPedidos = (n) => q(`insert into assistente_uso (petshop_id, canal, dia, pedidos, chamadas) values ('${P}', 'mozart', ${hojeDaLoja}, ${n}, 0) on conflict (petshop_id, canal, dia) do update set pedidos = ${n}, chamadas = 0`);
  const bloqueios = () => B.num(`select count(*) from bloqueios where petshop_id='${P}'`);
  const lim = { pago: B.num(`select public.link_limite('caderno_dia', 20)`), teste: Math.min(B.num(`select public.link_limite('caderno_dia', 20)`), B.num(`select public.link_limite('caderno_teste_dia', 10)`)),
    mozartPago: B.num(`select public.link_limite('mozart_loja_dia', 150)`), mozartTeste: B.num(`select public.link_limite('mozart_teste_dia', 50)`) };

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const celular = largura < 500;
    q(`delete from bloqueios where petshop_id='${P}'; delete from lancamentos where petshop_id='${P}' and descricao = 'Luz (boleto)'; delete from caderno_uso where petshop_id='${P}'; delete from assistente_uso where petshop_id='${P}';
       update profissionais set mozart_automatico = false where id='${L.ids.dono}'; update petshops set status = 'teste' where id = '${P}'`);
    const { ctx, page, erros } = await N.contexto(largura, altura);
    // violações da regra de conteúdo (CSP) ficam anotadas na página
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`)); });
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    const abrir = async () => {
      await page.locator(celular ? '.g-aba-mic' : '.g-fab').first().click();
      await page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]').waitFor({ timeout: 10000 });
    };
    await abrir();
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    const clipe = painel.locator('.g-ass-clipe-bt');
    const menu = painel.locator('.g-ass-clipe-menu');
    const bandeja = painel.locator('.g-ass-anexos');
    const caixa = painel.locator('textarea');
    const enviar = painel.locator('button.g-mic.enviar');
    const terminou = async () => { await page.waitForTimeout(150); await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 30000 }); await page.waitForTimeout(150); };
    const semRolagem = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const dentro = async (loc) => { const [a, p] = [await loc.boundingBox(), await painel.boundingBox()]; return Boolean(a && p && a.x >= p.x - 1 && a.x + a.width <= p.x + p.width + 1); };
    const fotoDeVerdade = await page.screenshot({ type: 'png' });
    const fotos = (n) => Array.from({ length: n }, (_, i) => ({ name: `foto${i + 1}.png`, mimeType: 'image/png', buffer: fotoDeVerdade }));
    const anexar = async (arquivos, entrada = 'galeria') => { await painel.locator(`input[data-anexo="${entrada}"]`).setInputFiles(arquivos); await page.waitForFunction(() => !/Preparando o anexo/.test(document.querySelector('.g-ass-anexos')?.textContent ?? ''), null, { timeout: 20000 }); await page.waitForTimeout(150); };
    const novaConversa = async () => { const b = painel.locator('button[title="Conversa nova"]'); if (await b.count()) await b.click(); await page.waitForTimeout(150); };
    const ultimaDoMozart = async () => nb(await painel.locator('.g-bolha.ela').last().innerText());

    T.secao(`${largura}: o clipe, o menu e o teclado`);
    T.ok('o clipe está ao lado do microfone, com rótulo', (await clipe.count()) === 1 && (await clipe.getAttribute('aria-label')) === 'Anexar foto ou PDF' && (await clipe.getAttribute('aria-haspopup')) === 'menu' && (await clipe.getAttribute('aria-expanded')) === 'false');
    const [bc, bx] = [await clipe.boundingBox(), await caixa.boundingBox()];
    T.ok('o clipe tem 44 px ou mais e fica depois da caixa de mensagem', bc && bx && bc.width >= 44 && bc.height >= 44 && bc.x >= bx.x + bx.width - 1, { bc, bx });
    T.ok('sem anexo e sem saldo acabando, nada aparece em cima da caixa', (await bandeja.count()) === 0);
    await clipe.focus();
    await page.keyboard.press('Enter');
    await menu.waitFor({ timeout: 5000 });
    const itens = await menu.locator('[role="menuitem"]').allInnerTexts();
    T.ok('o menu tem Tirar foto, Fotos da galeria e Arquivo (foto ou PDF)', JSON.stringify(itens.map(nb)) === JSON.stringify(['Tirar foto', 'Fotos da galeria', 'Arquivo (foto ou PDF)']), itens);
    T.ok('o menu diz os limites e que o arquivo não fica guardado', /Até 4 fotos, ou 1 PDF de até 10 páginas\. O arquivo não fica guardado\./.test(nb(await menu.innerText())), await menu.innerText());
    T.ok('aberto pelo teclado: o foco vai para a primeira opção', await page.evaluate(() => document.activeElement?.textContent?.includes('Tirar foto') === true));
    await page.keyboard.press('ArrowDown');
    T.ok('seta para baixo: Fotos da galeria', await page.evaluate(() => document.activeElement?.textContent?.includes('Fotos da galeria') === true));
    await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
    T.ok('seta para cima dá a volta: Arquivo', await page.evaluate(() => document.activeElement?.textContent?.includes('Arquivo') === true));
    T.ok('o menu cabe no painel e não cria rolagem para o lado', (await dentro(menu)) && (await semRolagem()) <= 1, await menu.boundingBox());
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-anexos-menu-${largura}.png` }).catch(() => {});
    await painel.locator('.g-ass-topo b').click();
    T.ok('toque fora fecha o menu', (await menu.count()) === 0);
    await clipe.click();
    await menu.waitFor({ timeout: 5000 });
    await page.keyboard.press('Escape');
    T.ok('Esc fecha o menu, devolve o foco ao clipe e a conversa continua aberta', (await menu.count()) === 0 && (await painel.count()) === 1 && await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Anexar foto ou PDF'));
    T.ok('as três entradas de arquivo: câmera (capture), galeria (imagens, várias) e arquivo (imagem e PDF)', (await painel.locator('input[data-anexo="camera"][capture="environment"][accept="image/*"]').count()) === 1
      && (await painel.locator('input[data-anexo="galeria"][accept="image/*"][multiple]').count()) === 1 && (await painel.locator('input[data-anexo="arquivo"][accept*="application/pdf"]').count()) === 1);

    T.secao(`${largura}: miniatura antes de enviar, com tirar`);
    await anexar(fotos(1));
    T.ok('a miniatura aparece em cima da caixa', (await bandeja.locator('li img').count()) === 1 && (await bandeja.locator('li img').getAttribute('alt')) === 'Foto 1 para enviar');
    T.ok('a miniatura é uma prévia local (blob:)', /^blob:/.test(await bandeja.locator('li img').getAttribute('src')));
    T.ok('o botão de enviar aparece só com o anexo (sem texto)', (await enviar.count()) === 1 && !(await enviar.isDisabled()) && (await enviar.getAttribute('aria-label')) === 'Enviar com o anexo');
    T.ok('o botão de tirar tem rótulo', (await bandeja.locator('li button').getAttribute('aria-label')) === 'Tirar a foto 1');
    await bandeja.locator('li button').click();
    T.ok('tirar: a miniatura some e nada foi gasto', (await bandeja.locator('li').count()) === 0 && paginas() === 0 && pedidos() === 0);
    await anexar(fotos(2));
    T.ok('duas fotos: duas miniaturas', (await bandeja.locator('li img').count()) === 2);
    T.ok('clipe, microfone e enviar cabem na largura, sem rolagem para o lado', (await dentro(clipe)) && (await dentro(enviar)) && (await dentro(bandeja)) && (await semRolagem()) <= 1, { clipe: await clipe.boundingBox(), enviar: await enviar.boundingBox() });
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-anexos-previa-${largura}.png` }).catch(() => {});

    T.secao(`${largura}: só o anexo — o Mozart diz o que entendeu e pergunta`);
    await enviar.click();
    await terminou();
    T.ok('a mensagem da pessoa mostra "2 fotos" (sem o arquivo)', nb(await painel.locator('.g-bolha.eu .g-ass-anexado').last().innerText()).startsWith('2 fotos') && (await painel.locator('.g-bolha.eu img').count()) === 0);
    const fala = await ultimaDoMozart();
    T.ok('o Mozart diz em uma frase o que entendeu e pergunta antes de agir', /Parece uma página de agenda com dois horários reservados para amanhã: das 9h às 10h e das 15h às 16h\. Quer que eu marque esses horários\?/.test(fala), fala);
    T.ok('nenhum cartão', (await painel.locator('.g-proposta').count()) === 0);
    T.ok('as miniaturas saíram da caixa depois de enviar', (await bandeja.locator('li').count()) === 0);
    T.ok('gastou 2 páginas e 1 pedido', paginas() === 2 && pedidos() === 1, { paginas: paginas(), pedidos: pedidos() });
    const guardada = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('gestao:mozart:')).map((k) => sessionStorage.getItem(k)).join('\n'));
    T.ok('a conversa guardada na aba tem a marca "[2 fotos enviadas]" e nenhum arquivo', guardada.includes('[2 fotos enviadas]') && !/base64|blob:|iVBORw0KGgo|\/9j\//.test(guardada), guardada.length);

    T.secao(`${largura}: conversa retomada — os cartões saem do que foi descrito`);
    await caixa.fill('sim, marca os horários da foto');
    await caixa.press('Enter');
    await painel.locator('.g-proposta').first().waitFor({ timeout: 20000 });
    await terminou();
    T.ok('dois cartões de bloqueio com Confirmar tudo, sem gastar outra página', (await painel.locator('.g-proposta button', { hasText: 'Pode fazer' }).count()) === 2 && (await painel.locator('button', { hasText: 'Confirmar tudo (2)' }).count()) === 1 && paginas() === 2, paginas());
    await painel.locator('button', { hasText: 'Confirmar tudo (2)' }).click();
    await terminou();
    T.ok('Confirmar tudo: os dois bloqueios de amanhã no banco', bloqueios() === 2, bloqueios());

    T.secao(`${largura}: foto + pedido escrito — cartões na hora`);
    await novaConversa();
    await anexar(fotos(1));
    await caixa.fill('marca esses horários');
    await caixa.press('Enter');
    await painel.locator('.g-proposta').first().waitFor({ timeout: 20000 });
    await terminou();
    const cartoes = nb(await painel.locator('.g-ass-conversa').innerText());
    T.ok('a descrição do anexo e dois cartões (9h às 10h e 15h às 16h)', /Parece uma página de agenda/.test(cartoes) && /09:00 às 10:00/.test(cartoes) && /15:00 às 16:00/.test(cartoes) && (await painel.locator('.g-proposta button', { hasText: 'Pode fazer' }).count()) === 2, cartoes.slice(-500));
    T.ok('a mensagem da pessoa mostra o anexo e o texto', /1 foto/.test(nb(await painel.locator('.g-bolha.eu').last().innerText())) && /marca esses horários/.test(nb(await painel.locator('.g-bolha.eu').last().innerText())));
    T.ok('sem rolagem para o lado com os cartões', (await semRolagem()) <= 1);
    await painel.locator('button', { hasText: 'Nenhum' }).click();
    await terminou();
    T.ok('"Nenhum": nada gravado a mais', bloqueios() === 2, bloqueios());

    T.secao(`${largura}: PDF + "lança essa conta"`);
    await novaConversa();
    await anexar([{ name: 'boleto-da-luz.pdf', mimeType: 'application/pdf', buffer: pdf(2) }], 'arquivo');
    const linhaPdf = nb(await bandeja.locator('li.pdf').innerText());
    T.ok('o PDF aparece com o nome e as páginas contadas no aparelho', /boleto-da-luz\.pdf/.test(linhaPdf) && /2 páginas/.test(linhaPdf), linhaPdf);
    T.ok('o botão de tirar o PDF tem rótulo e o PDF cabe na largura', (await bandeja.locator('li.pdf button').getAttribute('aria-label')) === 'Tirar o PDF boleto-da-luz.pdf' && (await dentro(bandeja.locator('li.pdf'))) && (await semRolagem()) <= 1);
    const antesPdf = paginas();
    await caixa.fill('lança essa conta');
    await caixa.press('Enter');
    await painel.locator('.g-proposta').first().waitFor({ timeout: 20000 });
    await terminou();
    const cartaoConta = nb(await painel.locator('.g-proposta').last().innerText());
    T.ok('o Mozart diz que é um boleto e traz o cartão Conta a pagar de R$ 380,00', /É um boleto de luz de R\$ 380,00 que vence em/.test(nb(await painel.locator('.g-ass-conversa').innerText())) && /Conta a pagar/.test(cartaoConta) && /380,00/.test(cartaoConta) && /Luz \(boleto\)/.test(cartaoConta), cartaoConta);
    T.ok('o PDF de 2 páginas gastou 2 do saldo', paginas() === antesPdf + 2, paginas() - antesPdf);
    T.ok('a mensagem da pessoa mostra "PDF · 2 páginas"', /PDF · 2 páginas/.test(nb(await painel.locator('.g-bolha.eu').last().innerText())));
    await painel.locator('.g-proposta button', { hasText: 'Pode fazer' }).click();
    await terminou();
    T.ok('"Pode fazer": a conta de R$ 380,00 está em A pagar', q(`select valor::text || '|' || pago::text from lancamentos where petshop_id='${P}' and descricao = 'Luz (boleto)'`) === '380.00|false');

    T.secao(`${largura}: o que não serve é avisado antes de enviar (nada é gasto)`);
    await novaConversa();
    const [pg0, pd0] = [paginas(), pedidos()];
    const pedidosDaRota = [];
    const ouvir = (rq) => { if (/\/api\/gestao\/assistente$/.test(rq.url())) pedidosDaRota.push(rq.method()); };
    page.on('request', ouvir);
    const erroAnexo = bandeja.locator('p.erro[role="alert"]');
    await anexar([{ name: 'relatorio.pdf', mimeType: 'application/pdf', buffer: pdf(11) }], 'arquivo');
    T.ok('PDF de 11 páginas: diz quantas tem, o limite de 10 e o caminho da Foto do caderno; nada anexado', /Este PDF tem 11 páginas\. Por aqui eu leio PDF de até 10 páginas: divida em partes, ou mande pela Foto do caderno/.test(nb(await erroAnexo.innerText())) && (await bandeja.locator('li').count()) === 0, await erroAnexo.innerText().catch(() => ''));
    await anexar([{ name: 'pesado.pdf', mimeType: 'application/pdf', buffer: pdf(1, 5 * 1024 * 1024) }], 'arquivo');
    T.ok('PDF de 5 MB: pesado demais para a conversa (4 MB), com o caminho da Foto do caderno', /pesado demais para mandar pela conversa \(cabem até 4 MB\)/.test(nb(await erroAnexo.innerText())) && (await bandeja.locator('li').count()) === 0, await erroAnexo.innerText().catch(() => ''));
    await anexar([{ name: 'enorme.pdf', mimeType: 'application/pdf', buffer: pdf(1, 10 * 1024 * 1024 + 10) }], 'arquivo');
    T.ok('PDF acima de 10 MB: "passa de 10 MB"', /Este PDF passa de 10 MB/.test(nb(await erroAnexo.innerText())), await erroAnexo.innerText().catch(() => ''));
    await anexar([{ name: 'contrato.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK não é foto') }], 'arquivo');
    T.ok('arquivo que não é foto nem PDF: diz o que dá para mandar', /Por aqui eu leio foto, print \(JPG, PNG, WEBP\) e PDF/.test(nb(await erroAnexo.innerText())) && (await bandeja.locator('li').count()) === 0, await erroAnexo.innerText().catch(() => ''));
    await anexar([{ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(400, 1)]) }]);
    T.ok('foto HEIC que o navegador não abre: Safari ou print', /HEIC.*iPhone.*Safari.*print/.test(nb(await erroAnexo.innerText())), await erroAnexo.innerText().catch(() => ''));
    await anexar(fotos(5));
    T.ok('5 fotos: entram 4 e o aviso diz o limite', (await bandeja.locator('li img').count()) === 4 && /Dá para mandar até 4 fotos ou prints, ou 1 PDF, de cada vez\./.test(nb(await erroAnexo.innerText())), await erroAnexo.innerText().catch(() => ''));
    T.ok('4 miniaturas cabem sem rolagem para o lado', (await dentro(bandeja)) && (await semRolagem()) <= 1);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-anexos-quatro-${largura}.png` }).catch(() => {});
    await anexar([{ name: 'a.pdf', mimeType: 'application/pdf', buffer: pdf(1) }], 'arquivo');
    T.ok('PDF junto com fotos: um tipo de cada vez', /Mande fotos ou um PDF, um tipo de cada vez/.test(nb(await erroAnexo.innerText())) && (await bandeja.locator('li.pdf').count()) === 0, await erroAnexo.innerText().catch(() => ''));
    for (let k = 0; k < 4; k++) await bandeja.locator('li button').first().click();
    T.ok('tirando as quatro, a caixa volta ao normal', (await bandeja.locator('li').count()) === 0);
    await anexar([{ name: 'clientes.csv', mimeType: 'text/csv', buffer: Buffer.from('nome,telefone\nAna,11999990000') }], 'arquivo');
    const planilha = await ultimaDoMozart();
    T.ok('planilha: o Mozart responde apontando Trazer de planilha (Clientes e pets e Estoque)', /Planilha eu não leio por aqui\. Para trazer clientes e pets de uma planilha, abra Clientes e pets e toque em Trazer de planilha/.test(planilha) && /Estoque, Trazer de planilha/.test(planilha), planilha);
    T.ok('… com os atalhos das duas telas, e nada anexado', (await painel.locator('.g-bolha.ela a[href="/gestao/app/clientes"]').count()) === 1 && (await painel.locator('.g-bolha.ela a[href="/gestao/app/estoque"]').count()) === 1 && (await bandeja.locator('li').count()) === 0);
    await anexar([{ name: 'estoque.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK\u0003\u0004 planilha') }], 'arquivo');
    T.ok('.xlsx também', (await painel.locator('.g-bolha.ela a[href="/gestao/app/clientes"]').count()) === 2);
    page.off('request', ouvir);
    T.ok('nada disso chamou o servidor nem gastou pedido ou página', pedidosDaRota.length === 0 && paginas() === pg0 && pedidos() === pd0, { pedidosDaRota, paginas: paginas() - pg0, pedidos: pedidos() - pd0 });

    T.secao(`${largura}: o Mozart não respondeu — o anexo volta para a caixa e a página volta para o saldo`);
    await novaConversa();
    const pg1 = paginas();
    await anexar(fotos(1));
    await caixa.fill('falha de teste');
    await caixa.press('Enter');
    await painel.locator('.g-bolha.erro').last().waitFor({ timeout: 20000 });
    await terminou();
    T.ok('a frase de sempre ("não respondeu agora")', /O Mozart não respondeu agora\. Tente de novo em instantes\./.test(nb(await painel.locator('.g-bolha.erro').last().innerText())));
    T.ok('a página voltou para o saldo', paginas() === pg1, paginas() - pg1);
    T.ok('a miniatura voltou para a caixa, para tentar de novo', (await bandeja.locator('li img').count()) === 1);
    await bandeja.locator('li button').click();

    T.secao(`${largura}: modo automático — faz na hora, com Desfazer`);
    await novaConversa();
    B.must(await L.sb.dono.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: true, p_versao: '1' }), 'ligar o automático');
    const b0 = bloqueios();
    await anexar(fotos(1));
    await caixa.fill('marca esses horários');
    await caixa.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.g-ass-painel .g-ass-feito').length === 2, null, { timeout: 25000 });
    await terminou();
    T.ok('nenhum cartão de confirmação: dois cartões Feito, cada um com Desfazer', (await painel.locator('button', { hasText: 'Pode fazer' }).count()) === 0 && (await painel.locator('.g-ass-feito button', { hasText: 'Desfazer' }).count()) === 2 && bloqueios() === b0 + 2, bloqueios() - b0);
    T.ok('o Mozart disse o que entendeu da foto antes de fazer', /Parece uma página de agenda/.test(nb(await painel.locator('.g-ass-conversa').innerText())));
    await painel.locator('.g-ass-feito button', { hasText: 'Desfazer' }).first().click();
    await page.waitForFunction(() => /Desfeito/.test(document.querySelector('.g-ass-painel .g-ass-feito')?.textContent ?? ''), null, { timeout: 15000 });
    T.ok('Desfazer: um bloqueio a menos', bloqueios() === b0 + 1, bloqueios() - b0);
    B.must(await L.sb.dono.rpc('mozart_automatico_ligar', { p_petshop: P, p_ligar: false }), 'desligar o automático');

    T.secao(`${largura}: saldo de páginas perto do clipe (o mesmo da Foto do caderno)`);
    const reabrir = async () => { await painel.locator('button[title="Fechar"]').click(); await page.waitForTimeout(900); await abrir(); await novaConversa(); };
    const saldoNaTela = bandeja.locator('[data-saldo]');
    porPaginas(lim.teste - 2);
    await reabrir();
    await saldoNaTela.waitFor({ timeout: 10000 });
    T.ok('acabando: "Hoje ainda dá para ler 2 fotos ou páginas (no teste são 10 por dia)" e que o saldo é o mesmo do caderno', nb(await saldoNaTela.innerText()) === `Hoje ainda dá para ler 2 fotos ou páginas (no teste são ${lim.teste} por dia). A Foto do caderno e o Mozart usam o mesmo saldo.`, await saldoNaTela.innerText());
    await anexar(fotos(3));
    await enviar.click();
    await erroAnexo.waitFor({ timeout: 5000 });
    T.ok('3 fotos com 2 sobrando: avisa antes de mandar, com o limite do teste e o do plano pago', nb(await erroAnexo.innerText()) === `Hoje ainda dá para ler 2 fotos ou páginas (o limite do período de teste é de ${lim.teste} por dia). Mande menos, ou continue amanhã. No plano pago são ${lim.pago} por dia.` && paginas() === lim.teste - 2 && (await bandeja.locator('li img').count()) === 3, await erroAnexo.innerText());
    await bandeja.locator('li button').first().click();
    await enviar.click();
    await terminou();
    await saldoNaTela.waitFor({ timeout: 10000 });
    T.ok('2 fotos cabem; depois, o aviso do limite do teste: 10 por dia, renova amanhã, 20 no plano pago', paginas() === lim.teste && nb(await saldoNaTela.innerText()) === `Você chegou ao limite do período de teste: ${lim.teste} fotos ou páginas por dia. Amanhã renova. No plano pago são ${lim.pago} por dia.`, await saldoNaTela.innerText());
    T.ok('o aviso do saldo cabe na largura', (await dentro(saldoNaTela)) && (await semRolagem()) <= 1);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-anexos-limite-${largura}.png` }).catch(() => {});
    // a Foto do caderno, no mesmo saldo, diz o mesmo
    await painel.locator('button[title="Fechar"]').click();
    await N.ir(page, '/gestao/app/clientes');
    await N.doAlto(page, 'Foto do caderno');
    const cota = page.locator('.g-folha [data-cota]');
    await cota.waitFor({ timeout: 10000 });
    T.ok('a Foto do caderno mostra o mesmo aviso (o saldo é um só)', nb(await cota.innerText()) === `Você chegou ao limite do período de teste: ${lim.teste} fotos ou páginas por dia. Amanhã renova. No plano pago são ${lim.pago} por dia.`, await cota.innerText());
    porPaginas(lim.teste - 4);
    await page.keyboard.press('Escape');
    await N.ir(page, '/gestao/app/clientes');
    await N.doAlto(page, 'Foto do caderno');
    await cota.waitFor({ timeout: 10000 });
    T.ok('com 4 sobrando, o caderno diz quantas dá para ler e que o Mozart usa o mesmo saldo', /Hoje ainda dá para ler 4 páginas \(cada foto, print ou página de PDF conta uma; as fotos mandadas ao Mozart usam o mesmo saldo\)/.test(nb(await cota.innerText())), await cota.innerText());
    await page.keyboard.press('Escape');
    await N.ir(page, '/gestao/app');
    // quem paga: 20 por dia, sem falar de plano
    q(`update petshops set status = 'ativa' where id = '${P}'`);
    porPaginas(lim.pago);
    await N.ir(page, '/gestao/app');
    await abrir(); await novaConversa();
    await saldoNaTela.waitFor({ timeout: 10000 });
    T.ok('quem paga no limite: "limite de hoje: 20 fotos ou páginas por dia. Amanhã renova." (sem falar de plano)', nb(await saldoNaTela.innerText()) === `Você chegou ao limite de hoje: ${lim.pago} fotos ou páginas por dia. Amanhã renova.`, await saldoNaTela.innerText());
    porPaginas(0);

    T.secao(`${largura}: limite de pedidos ao Mozart — a mensagem de quem paga e a do teste`);
    porPedidos(lim.mozartPago);
    await caixa.fill('oi');
    await caixa.press('Enter');
    await painel.locator('.g-bolha.erro').last().waitFor({ timeout: 20000 });
    await terminou();
    T.ok('quem paga: "limite de hoje: 150 pedidos ao Mozart por dia. Amanhã renova." e que as telas seguem pelos botões', nb(await painel.locator('.g-bolha.erro').last().innerText()) === `Você chegou ao limite de hoje: ${lim.mozartPago} pedidos ao Mozart por dia. Amanhã renova. Enquanto isso, as telas continuam funcionando pelos botões.`, await painel.locator('.g-bolha.erro').last().innerText());
    q(`update petshops set status = 'teste' where id = '${P}'`);
    porPedidos(lim.mozartTeste);
    await novaConversa();
    await caixa.fill('oi');
    await caixa.press('Enter');
    await painel.locator('.g-bolha.erro').last().waitFor({ timeout: 20000 });
    await terminou();
    const avisoTeste = nb(await painel.locator('.g-bolha.erro').last().innerText());
    T.ok('teste: limite do período de teste (50 por dia), renova amanhã, telas pelos botões e 150 no plano pago', avisoTeste === `Você chegou ao limite do período de teste: ${lim.mozartTeste} pedidos ao Mozart por dia. Amanhã renova. Enquanto isso, as telas continuam funcionando pelos botões. No plano pago, o limite é de ${lim.mozartPago} pedidos por dia.`, avisoTeste);
    T.ok('o aviso cabe na bolha, sem rolagem para o lado', (await dentro(painel.locator('.g-bolha.erro').last())) && (await semRolagem()) <= 1);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-anexos-pedidos-${largura}.png` }).catch(() => {});
    porPedidos(0);

    T.secao(`${largura}: página limpa`);
    const csp = await page.evaluate(() => window.__csp ?? []);
    T.ok('nenhuma violação da regra de conteúdo (CSP)', csp.length === 0, csp);
    T.ok('nenhum erro de console nem da página', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
}))();
