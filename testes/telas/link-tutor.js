// Rodada 9 (N7), no navegador: o link do cliente e tudo o que o tutor vê, em 360x740 (celular) e 1366 (computador).
//  1. dois pets de portes diferentes numa promoção: uma linha por pet e o total (42,41 + 76,41 = 118,82), no formulário,
//     no "Pedido enviado" e na página do pedido; nada de "cada pet";
//  2. endereço do pet shop no link (com "Abrir no mapa"), no "Pedido enviado" e na página do pedido;
//  3. prévia do link (Open Graph) com o nome do pet shop, nunca a do site da Maestro Pet; páginas com código fora dos buscadores;
//  4. voltar do celular volta um passo; recarregar não perde o que foi escrito; enviado, o rascunho some; dois toques = um pedido;
//  5. link desligado no meio: a página avisa, guarda o que foi escrito e oferece o WhatsApp;
//  6. "Tirar dúvida" não cobre o preço do primeiro serviço em 360x740; responde a parte que sabe de uma pergunta dupla;
//  7. creche fora do horário de funcionamento: a página avisa antes de enviar;
//  8. quem recebe: o cartão diz "o cliente viu: R$ 118,82 …", "Aceitar todos" aceita os dois, a mensagem leva valor e endereço;
//  9. página do pedido confirmado: "Adicionar à agenda" (.ics), outro horário escolhendo um horário livre; atendido, o título muda;
// 10. link vencido ou errado (boletim, álbum, entrada, página do tutor, orçamento, autorização): "Este link não abre mais".
// 11. Meu pet shop: os campos do endereço gravam.
const fs = require('fs');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('link-tutor-telas');

const foto = async (page, nome) => { if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/link-tutor-${nome}.png`, fullPage: true }).catch(() => {}); };
const texto = (page) => page.locator('body').innerText();
/** Abre e espera a página assentar (o HTML chega pronto; os botões só respondem depois que o JavaScript liga). */
const abrir = async (page, url) => { const r = await page.goto(url); await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(300); return r; };

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Vila do Banho' });
  const { dono } = L.sb;
  const nome = `Vila do Banho ${L.suf}`;
  B.must(await dono.from('servicos').update({ preco_p: 49.9, preco_m: 64.9, preco_g: 89.9, preco_gg: 119.9, ordem: 0 }).eq('id', L.S.Banho).select('id'), 'preços');
  B.must(await dono.from('petshops').update({ endereco: 'Rua das Flores, 120', bairro: 'Vila Nova', complemento: 'loja 2' }).eq('id', L.P).select('id'), 'endereço');
  B.must(await dono.rpc('promocao_salvar', { p: L.P, p_id: null, p_dados: { nome: 'Semana do banho', dias: [0, 1, 2, 3, 4, 5, 6], hora_de: null, hora_ate: null, servicos: [L.S.Banho], tipo: 'pct', valor: 15, comeca_em: null, termina_em: null, ativa: true } }), 'promoção');
  B.sql(`update petshops set opcoes = coalesce(opcoes, '{}'::jsonb) || '{"link.cancelar": true, "link.cancelar_horas": 2, "link.ia": true}'::jsonb where id='${L.P}'`);
  const iaLigada = (await B.cliente().rpc('link_ia_ligada', { p_codigo: L.codigo })).data === true;
  const LINK = `${B.BASE_URL}/gestao/agendar/${L.codigo}`;

  /** Do começo até o passo 3, com dois pets (Mel, porte P; Bob, porte G). */
  async function ateOsDados(page) {
    await abrir(page, LINK);
    await page.locator('.g-lk-serv', { has: page.locator('b', { hasText: /^Banho$/ }) }).click();
    // migração 20261239: um toque marca o serviço; a barra de baixo leva ao dia e à hora
    await page.locator('[data-teste=escolha-servicos] button').click();
    await page.locator('.g-lk-qtd[aria-label="2 pets"]').click();
    // um dia com folga (não hoje): o terceiro dia aberto
    await page.locator('.g-lk-dia:not([disabled])').nth(3).click();
    await page.locator('.g-lk-hora').first().waitFor({ timeout: 20000 });
    await page.locator('.g-lk-hora').nth(2).click();
    await page.getByRole('button', { name: 'Continuar' }).click();
    const pets = page.locator('.g-lk-pet');
    await pets.nth(0).locator('input').fill('Mel');
    await pets.nth(0).locator('.g-lk-opcao.porte', { hasText: 'P' }).first().click();
    await pets.nth(1).locator('input').fill('Bob');
    await pets.nth(1).locator('.g-lk-opcao.porte').nth(2).click(); // G
  }

  let pedidoId = null;
  for (const [larg, alt] of [[360, 740], [1366, 900]]) {
    T.secao(`${larg} px: o link, do serviço ao pedido enviado`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await abrir(page, LINK);
    await page.locator('.g-lk-serv').first().waitFor({ timeout: 30000 });
    const cab = await page.locator('[data-teste=endereco]').innerText();
    T.ok('o cabeçalho mostra o endereço', /Rua das Flores, 120, loja 2 · Vila Nova · São Paulo\/SP/.test(cab), cab);
    const mapa = await page.locator('[data-teste=endereco] a').getAttribute('href');
    T.ok('"Abrir no mapa" leva a uma busca no mapa com a rua', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(mapa ?? '') && decodeURIComponent(mapa).includes('Rua das Flores, 120'), mapa);
    if (larg === 360 && iaLigada) {
      const botao = await page.locator('.g-lk-duv-abrir').boundingBox();
      const preco = await page.locator('.g-lk-serv').first().locator('em').first().boundingBox();
      const cruza = botao && preco && !(botao.x >= preco.x + preco.width || botao.x + botao.width <= preco.x || botao.y >= preco.y + preco.height || botao.y + botao.height <= preco.y);
      T.ok('o "Tirar dúvida" não cobre o preço do primeiro serviço', botao && preco && !cruza, { botao, preco });
      const fixo = await page.locator('.g-lk-duv-abrir').evaluate((e) => getComputedStyle(e).position);
      T.ok('no celular o botão de dúvidas fica no fim da página, não flutuando', fixo !== 'fixed', fixo);
    }
    await foto(page, `${larg}-1-servicos`);

    await ateOsDados(page);
    const valor = page.locator('[data-teste=valor-do-pedido]');
    const linhas = await valor.locator('[data-teste=valor-do-pet]').allInnerTexts();
    T.ok('passo 3: uma linha por pet, cada um no seu porte', linhas.length === 2 && /Mel/.test(linhas[0]) && /porte P/.test(linhas[0]) && /R\$\s49,90/.test(linhas[0]) && /R\$\s42,41/.test(linhas[0])
      && /Bob/.test(linhas[1]) && /porte G/.test(linhas[1]) && /R\$\s89,90/.test(linhas[1]) && /R\$\s76,41/.test(linhas[1]), linhas);
    T.ok('passo 3: total R$ 118,82', /R\$\s118,82/.test(await valor.locator('[data-teste=valor-total]').innerText()), await valor.innerText());
    T.ok('passo 3: nada de "cada pet" com o preço do primeiro', !/cada pet/.test(await page.locator('form.g-lk-secao').innerText()));
    T.ok('passo 3: diz quem confirma o valor', new RegExp(`Quem confirma o valor é ${nome}`).test(await valor.innerText()));
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, `${larg}-2-dados`);

    if (larg === 360) {
      T.secao('360 px: voltar do celular, recarregar e link desligado no meio');
      await page.locator('input[autocomplete=name]').fill('Tutora Teste');
      await page.locator('input[type=tel]').fill('11987650001');
      await page.goBack();
      await page.locator('.g-lk-hora').first().waitFor({ timeout: 15000 });
      T.ok('voltar do celular no passo 3 volta para o passo 2 (não sai da página)', page.url() === LINK && (await page.locator('.g-lk-passos li.atual').innerText()).includes('Quando'), page.url());
      await page.getByRole('button', { name: 'Continuar' }).click();
      T.ok('o que foi escrito continua lá', (await page.locator('.g-lk-pet').nth(1).locator('input').inputValue()) === 'Bob' && (await page.locator('input[autocomplete=name]').inputValue()) === 'Tutora Teste');
      await page.reload();
      await page.locator('[data-teste=valor-do-pedido]').waitFor({ timeout: 20000 });
      T.ok('recarregar no passo 3: volta no passo 3, com os pets, o nome e o WhatsApp', (await page.locator('.g-lk-pet').nth(0).locator('input').inputValue()) === 'Mel'
        && (await page.locator('.g-lk-pet').nth(1).locator('input').inputValue()) === 'Bob' && (await page.locator('input[autocomplete=name]').inputValue()) === 'Tutora Teste'
        && /98765/.test(await page.locator('input[type=tel]').inputValue()));
      T.ok('recarregado: o valor continua certo (118,82)', /R\$\s118,82/.test(await page.locator('[data-teste=valor-total]').innerText()));
      T.ok('o rascunho fica só nesta aba (sessionStorage), nada em localStorage', await page.evaluate(() => Object.keys(sessionStorage).some((k) => k.startsWith('maestro-link-rascunho:')) && !Object.keys(localStorage).some((k) => /rascunho/.test(k))));

      // o pet shop desliga o link enquanto o tutor está no passo 3
      B.sql(`update petshops set link_ativo = false where id='${L.P}'`);
      await page.getByRole('button', { name: 'Enviar pedido' }).click();
      await page.locator('.g-lk-fim').waitFor({ timeout: 15000 });
      const fim = await page.locator('.g-lk-fim').innerText();
      T.ok('link desligado no envio: "Este link não está disponível", com o que a pessoa pedia', /Este link não está disponível/.test(fim) && /continua guardado nesta página: banho para Mel e Bob/.test(fim), fim);
      const zap = await page.locator('.g-lk-fim a.g-btn.zap').getAttribute('href');
      T.ok('tem o botão do WhatsApp, já com o pedido escrito', /^https:\/\/wa\.me\/5511999990000\?text=/.test(zap ?? '') && decodeURIComponent(zap).includes('banho para Mel e Bob'), zap);
      await foto(page, '360-3-link-desligado');
      B.sql(`update petshops set link_ativo = true where id='${L.P}'`);
      await page.getByRole('button', { name: 'Tentar de novo' }).click();
      await page.locator('[data-teste=valor-do-pedido]').waitFor({ timeout: 20000 });
      T.ok('link religado: "Tentar de novo" traz o formulário de volta com tudo', (await page.locator('.g-lk-pet').nth(1).locator('input').inputValue()) === 'Bob' && (await page.locator('input[autocomplete=name]').inputValue()) === 'Tutora Teste');
    } else {
      await page.locator('input[autocomplete=name]').fill('Tutor Computador');
      await page.locator('input[type=tel]').fill('11987650002');
    }

    T.secao(`${larg} px: enviar (dois toques) e o pedido enviado`);
    const antes = B.num(`select count(*) from pedidos_agendamento where petshop_id='${L.P}'`);
    const enviar = page.getByRole('button', { name: 'Enviar pedido' });
    await enviar.evaluate((b) => { b.click(); b.click(); });
    await page.locator('.g-lk-ok').waitFor({ timeout: 20000 });
    T.ok('dois toques em Enviar pedido: um pedido só (dois pets)', B.num(`select count(*) from pedidos_agendamento where petshop_id='${L.P}'`) === antes + 2);
    const ok = await page.locator('.g-lk-ok').innerText();
    T.ok('"Pedido enviado": o valor de cada pet e o total', /Mel/.test(ok) && /R\$\s42,41/.test(ok) && /R\$\s76,41/.test(ok) && /R\$\s118,82/.test(ok), ok);
    T.ok('"Pedido enviado": o endereço com "Abrir no mapa"', /Rua das Flores, 120/.test(await page.locator('[data-teste=endereco-enviado]').innerText()) && (await page.locator('[data-teste=endereco-enviado] a').count()) === 1);
    T.ok('enviado: o rascunho saiu da aba (nome e telefone não ficam guardados)', await page.evaluate(() => !Object.keys(sessionStorage).some((k) => k.startsWith('maestro-link-rascunho:'))));
    T.ok(`sem rolagem para o lado no pedido enviado (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, `${larg}-4-enviado`);
    const href = await page.locator('.g-lk-ok a.g-btn.verde').getAttribute('href');
    if (larg === 360) pedidoId = href.split('/').pop();

    T.secao(`${larg} px: a página do pedido`);
    await abrir(page, B.BASE_URL + href);
    await page.locator('[data-teste=valor-do-pedido]').waitFor({ timeout: 20000 });
    const v = await page.locator('[data-teste=valor-do-pedido]').innerText();
    T.ok('página do pedido: valor de cada pet e total, iguais aos do formulário', /Mel/.test(v) && /R\$\s42,41/.test(v) && /Bob/.test(v) && /R\$\s76,41/.test(v) && /R\$\s118,82/.test(v) && /Semana do banho/.test(v), v);
    T.ok('página do pedido: o endereço com "Abrir no mapa"', /Rua das Flores, 120/.test(await page.locator('[data-teste=endereco]').innerText()));
    T.ok(`sem rolagem para o lado na página do pedido (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, `${larg}-5-pedido`);
    T.ok(`nenhum erro na página (${larg})`, erros.length === 0, erros);
    await ctx.close();
  }

  T.secao('prévia do link (o que o WhatsApp mostra)');
  {
    const meta = (html, prop) => (new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`).exec(html) ?? [])[1] ?? null;
    const html = await (await fetch(LINK)).text();
    T.ok('link: og:title "Agendar: <pet shop>"', meta(html, 'og:title') === `Agendar: ${nome}`, meta(html, 'og:title'));
    T.ok('link: og:site_name é o pet shop, não "Maestro Pet"', meta(html, 'og:site_name') === nome, meta(html, 'og:site_name'));
    T.ok('link: a descrição fala do pedido e da cidade, não de "guias e manuais"', /Escolha o serviço, o dia e a hora/.test(meta(html, 'og:description') ?? '') && /São Paulo\/SP/.test(meta(html, 'og:description') ?? '') && !/Guias para tutores/.test(html.slice(0, html.indexOf('</head>'))), meta(html, 'og:description'));
    const img = meta(html, 'og:image');
    T.ok('link: a imagem é a do pet shop (cartão neutro com o nome), nunca a do site', !!img && !/og\/home\.png/.test(html.slice(0, html.indexOf('</head>'))) && img.endsWith(`/gestao/agendar/${L.codigo}/previa`), img);
    const ri = await fetch(img.replace(/^https?:\/\/[^/]+/, B.BASE_URL));
    T.ok('a imagem neutra abre (PNG de 1200x630)', ri.status === 200 && /image\/png/.test(ri.headers.get('content-type') ?? ''), `${ri.status} ${ri.headers.get('content-type')}`);
    if (process.env.FOTOS) fs.writeFileSync(`${B.RAIZ}/testes/saida/link-tutor-previa.png`, Buffer.from(await ri.arrayBuffer()));
    const maiusculas = await (await fetch(`${B.BASE_URL}/gestao/agendar/${L.codigo.toUpperCase()}`)).text();
    T.ok('código do link em MAIÚSCULAS (cartaz) abre o mesmo link', maiusculas.includes(nome) && !/Este link não está disponível/.test(maiusculas));
    const ped = await (await fetch(`${LINK}/pedido/${pedidoId}`)).text();
    T.ok('pedido: título e prévia com o pet shop', meta(ped, 'og:title') === `Seu pedido em ${nome}` && meta(ped, 'og:site_name') === nome && />Seu pedido em /.test(ped), meta(ped, 'og:title'));
    T.ok('pedido: fora dos buscadores (noindex) e sem nome de pet ou tutor na prévia', /noindex/.test(meta(ped, 'robots') ?? '') && !/Mel|Bob|Tutora/.test((meta(ped, 'og:title') ?? '') + (meta(ped, 'og:description') ?? '')), meta(ped, 'robots'));
    T.ok('link: noindex também', /noindex/.test(meta(html, 'robots') ?? ''), meta(html, 'robots'));
    const fora = await (await fetch(`${B.BASE_URL}/gestao/agendar/naoexiste99`)).text();
    T.ok('link que não existe: nada do site da Maestro Pet na prévia', !/og\/home\.png|Guias para tutores/.test(fora.slice(0, fora.indexOf('</head>'))));
  }

  T.secao('Tirar dúvida: pergunta de duas partes');
  if (iaLigada) {
    const r = await fetch(`${B.BASE_URL}/api/gestao/link-ia`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': B.ipAleatorio() }, body: JSON.stringify({ codigo: L.codigo, falas: [{ de: 'eu', texto: 'Quanto fica o banho de um cachorro grande na quinta? E vocês aceitam cartão de crédito?' }] }) });
    const j = await r.json();
    T.ok('responde o preço com a promoção (de 89,90 por 76,41) em vez de recusar tudo', r.status === 200 && j.naoSei === false && /R\$\s89,90 por R\$\s76,41/.test(j.texto), j);
    T.ok('e manda o resto para o WhatsApp', j.resto === true, j);
    const r2 = await fetch(`${B.BASE_URL}/api/gestao/link-ia`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': B.ipAleatorio() }, body: JSON.stringify({ codigo: L.codigo, falas: [{ de: 'eu', texto: 'Qual o endereço de vocês?' }] }) });
    const j2 = await r2.json();
    T.ok('sabe o endereço', /Rua das Flores, 120/.test(j2.texto ?? ''), j2);
  } else T.conhecido('Tirar dúvida ligado', false, 'a opção do Tirar dúvida não ligou nesta loja de teste');

  T.secao('creche: horário de funcionamento (360)');
  {
    const { ctx, page, erros } = await N.contexto(360, 740);
    await abrir(page, LINK);
    await page.locator('.g-lk-serv', { hasText: 'Creche' }).click();
    await page.locator('input[type=time]').first().waitFor({ timeout: 20000 });
    T.ok('a página diz o horário do dia ("abrimos das 7h às 20h")', /abrimos das 7h às 20h/.test(await page.locator('[data-teste=horario-do-dia]').innerText()));
    await page.locator('input[type=time]').first().fill('06:00');
    const alerta = await page.locator('.g-lk-alerta').first().innerText();
    T.ok('chegada às 06:00: avisa que atende das 7h às 20h', /atendemos das 7h às 20h/.test(alerta) && /chegada/.test(alerta), alerta);
    T.ok('e não deixa continuar', await page.getByRole('button', { name: /Continuar|Conferindo/ }).isDisabled());
    await page.locator('input[type=time]').first().fill('08:00');
    await page.locator('input[type=time]').nth(1).fill('21:00');
    T.ok('buscar às 21:00: avisa também', /atendemos das 7h às 20h/.test(await page.locator('.g-lk-alerta').first().innerText()));
    await page.locator('input[type=time]').nth(1).fill('18:00');
    await page.getByRole('button', { name: 'Continuar' }).click({ timeout: 20000 });
    await page.locator('.g-lk-pet input').first().waitFor({ timeout: 15000 });
    await page.goBack();
    await page.locator('input[type=time]').first().waitFor({ timeout: 15000 });
    T.ok('creche: voltar do celular no passo dos dados volta para as datas', (await page.locator('input[type=time]').count()) === 2 && page.url() === LINK);
    await page.goBack();
    await page.locator('.g-lk-serv').first().waitFor({ timeout: 15000 });
    T.ok('e mais um voltar fecha a creche e mostra os serviços (ainda na página)', page.url() === LINK);
    T.ok('nenhum erro na página (creche)', erros.length === 0, erros);
    await ctx.close();
  }

  T.secao('quem recebe o pedido (1366): o cliente viu, aceitar todos e a mensagem');
  const idsDoPedido = B.sql(`select string_agg(x.id::text, ',' order by x.inicio) from pedidos_agendamento x where x.id='${pedidoId}' or x.grupo_id = (select grupo_id from pedidos_agendamento where id='${pedidoId}')`).split(',');
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/agenda');
    const cartao = page.locator('.g-pl-item', { hasText: 'Tutora Teste' }).first();
    await cartao.waitFor({ timeout: 30000 });
    const viu = await cartao.locator('[data-teste=cliente-viu]').innerText();
    T.ok('o cartão diz o que o cliente viu: R$ 118,82 (Mel R$ 42,41 e Bob R$ 76,41)', /o cliente viu: R\$\s118,82 \(Mel R\$\s42,41 e Bob R\$\s76,41\)/.test(viu), viu);
    await foto(page, '1366-6-cartao');
    await cartao.getByRole('button', { name: 'Aceitar todos' }).click();
    // os dois pets já são da casa? não: tutor novo. O porte veio no pedido, então não há pergunta.
    await page.locator('.g-pl-item.respondido', { hasText: 'Mel' }).first().waitFor({ timeout: 30000 });
    T.ok('"Aceitar todos": os dois pedidos aceitos', B.num(`select count(*) from pedidos_agendamento where id in ('${idsDoPedido.join("','")}') and status='aceito' and agendamento_id is not null`) === 2);
    const zap = await page.locator('.g-pl-item.respondido', { hasText: 'Mel' }).first().locator('a.g-btn.zap').getAttribute('href');
    const msg = decodeURIComponent((zap ?? '').split('text=')[1] ?? '');
    T.ok('a mensagem de confirmação leva o valor que o tutor viu', /Valor: R\$\s118,82 \(Mel R\$\s42,41 e Bob R\$\s76,41\)\./.test(msg), msg);
    T.ok('e o endereço do pet shop', /Nosso endereço: Rua das Flores, 120, loja 2, Vila Nova, São Paulo\/SP\./.test(msg), msg);
    await foto(page, '1366-7-aceito');

    T.secao('Meu pet shop: endereço');
    await N.ir(page, '/gestao/app/meu-petshop');
    const rua = page.getByLabel('Endereço (rua e número)');
    // o cartão Dados fica no grupo "O negócio", que abre com um toque
    if (!(await rua.isVisible().catch(() => false))) await page.locator('section#grupo-negocio button').first().click().catch(() => {});
    await rua.waitFor({ timeout: 30000 });
    T.ok('os campos vêm com o que está gravado', (await rua.inputValue()) === 'Rua das Flores, 120' && (await page.getByLabel('Bairro').inputValue()) === 'Vila Nova' && (await page.getByLabel('Complemento').inputValue()) === 'loja 2');
    await rua.fill('Av. Brasil, 500');
    await page.getByLabel('Complemento').fill('');
    await page.getByRole('button', { name: 'Salvar dados' }).click();
    await page.waitForFunction(() => /Dados salvos/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {});
    const gravado = B.sql(`select endereco || '|' || bairro || '|' || coalesce(complemento, '-') from petshops where id='${L.P}'`);
    T.ok('salvar grava a rua nova e limpa o complemento', gravado === 'Av. Brasil, 500|Vila Nova|-', gravado);
    await foto(page, '1366-8-meu-petshop');
    T.ok('nenhum erro nas telas de quem recebe', erros.length === 0, erros);
    await ctx.close();
  }

  T.secao('página do pedido confirmado (360): agenda, outro horário e o título');
  {
    const { ctx, page, erros } = await N.contexto(360, 740);
    await abrir(page, `${LINK}/pedido/${pedidoId}`);
    await page.locator('h1').first().waitFor({ timeout: 30000 });
    T.ok('aceito: "Está confirmado!"', /Está confirmado!/.test(await page.locator('h1').first().innerText()));
    T.ok('o endereço novo aparece (com "Abrir no mapa")', /Av\. Brasil, 500/.test(await page.locator('[data-teste=endereco]').innerText()) && (await page.locator('[data-teste=endereco] a').count()) === 1);
    const [baixado] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: 'Adicionar à agenda' }).click()]);
    const ics = fs.readFileSync(await baixado.path(), 'utf8');
    T.ok('"Adicionar à agenda" entrega um .ics com os dois horários e o endereço', baixado.suggestedFilename() === 'pedido.ics' && (ics.match(/BEGIN:VEVENT/g) ?? []).length === 2 && /SUMMARY:Banho de Mel/.test(ics) && /LOCATION:Av\. Brasil\\, 500/.test(ics), ics.slice(0, 400));
    const zap = decodeURIComponent((await page.locator('.g-lkp-acoes a.g-btn.zap').first().getAttribute('href')).split('text=')[1]);
    T.ok('"Falar com" já diz de que pedido se trata (pet, serviço e dia)', /banho para Mel e Bob/.test(zap), zap);
    await foto(page, '360-9-confirmado');

    await page.getByRole('button', { name: 'Pedir outra data' }).click();
    await page.locator('[data-teste=outro-horario] .g-lkp-dia:not([disabled])').first().waitFor({ timeout: 20000 });
    await page.locator('[data-teste=outro-horario] .g-lkp-dia:not([disabled])').nth(5).click();
    await page.locator('.g-lkp-hora').first().waitFor({ timeout: 20000 });
    await page.locator('.g-lkp-hora').first().click();
    T.ok(`sem rolagem para o lado com os horários abertos (360)`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, '360-10-outro-horario');
    await page.getByRole('button', { name: 'Pedir este horário' }).click();
    await page.locator('.g-lkp-feito').waitFor({ timeout: 15000 });
    T.ok('pediu outro horário: a página confirma uma vez só (sem a frase repetida)', /Pedido de outro horário enviado/.test(await page.locator('.g-lkp-feito').innerText()) && (await page.locator('.g-lkp-recado').count()) === 0);
    T.ok('o recado ficou no pedido, com o dia e a hora', /^Quero mudar para .+, às \d\d:\d\d/.test(B.sql(`select cliente_recado from pedidos_agendamento where id='${pedidoId}'`)));
    await page.reload();
    await page.locator('.g-lkp-recado').waitFor({ timeout: 20000 });
    T.ok('recarregando, o recado aparece na página', /Você pediu outra data/.test(await page.locator('.g-lkp-recado').innerText()));
    T.ok('nenhum erro na página do pedido (nem de hidratação)', erros.length === 0, erros);

    // atendido: o título não diz mais "Está confirmado!"
    B.sql(`set session_replication_role = replica; update agendamentos set status = 'concluido' where id in (select agendamento_id from pedidos_agendamento where id in ('${idsDoPedido.join("','")}')); set session_replication_role = origin;`);
    await page.reload();
    await page.locator('h1').first().waitFor({ timeout: 20000 });
    const h1 = await page.locator('h1').first().innerText();
    T.ok('atendido: o título vira "Atendimento feito." (não "Está confirmado!")', h1 === 'Atendimento feito.' && !/Está confirmado/.test(await texto(page)), h1);
    T.ok('atendido: oferece um novo pedido e não oferece mais a agenda', (await page.getByRole('link', { name: 'Fazer um novo pedido' }).count()) === 1 && (await page.getByRole('button', { name: 'Adicionar à agenda' }).count()) === 0);
    await foto(page, '360-11-atendido');
    await ctx.close();
  }

  T.secao('link errado ou vencido: página simples para o tutor');
  {
    const { ctx, page } = await N.contexto(360, 740);
    for (const rota of ['boletim/naoexiste0000000000000000', 'album/naoexiste0000000000000000', 'entrada/naoexiste0000000000000000', 'tutor/naoexiste0000000000000000', 'orcamento/naoexiste0000000000000000', 'autorizacao/naoexiste0000000000000000']) {
      const r = await page.goto(`${B.BASE_URL}/gestao/${rota}`);
      const t = await texto(page);
      T.ok(`${rota.split('/')[0]}: "Este link não abre mais. Peça outro ao pet shop." (404, sem Mozart, sem link para o site)`,
        r.status() === 404 && /Este link não abre mais/.test(t) && /Peça outro ao pet shop\./.test(t) && !/Mozart|Voltar ao início|Página não encontrada/.test(t) && (await page.locator('a[href="/"]').count()) === 0, `${r.status()} ${t.slice(0, 200)}`);
    }
    T.ok('sem rolagem para o lado (360)', (await N.rolagemLateral(page)) <= 0);
    await foto(page, '360-12-nao-abre');
    await ctx.close();
  }
}))();
