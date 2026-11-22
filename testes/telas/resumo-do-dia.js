// Resumo do dia pela tela (migração 20261246), em 390x844 e 1366x900. Precisa do servidor com GESTAO_RESUMO_FALSO=1.
// A loja: hoje, Thor 09:00 (tosador, confirmado), Mel 10:30 (sem profissional, só marcado) e Bob 14:00 (com a dona); amanhã, três
// horários só marcados; Luna na creche (diária avulsa, R$ 70) e Rex chegando no hotel; a Fumaça sai hoje do hotel (2 noites de R$ 120);
// o Beto tem R$ 45 a receber que vencem hoje; a Ana deve R$ 35 há 40 dias; a conta de luz (R$ 312,40) vence hoje;
// três clientes (Kiko, Totó e Zeca) passaram do intervalo em que costumam voltar. O pet shop abre o dia inteiro (00:00 às 23:59), para sempre haver
// horário livre à frente, a qualquer hora em que o teste rode.
//   · dona (390): abre sozinho na primeira entrada, com a folha acessível (diálogo, foco preso, Esc), os números, a linha do tempo
//     com o não confirmado e os buracos, a semana, o dinheiro, a dica e a frase da IA de teste; "Começar o dia" fecha; recarregar
//     (mesmo com o aparelho limpo) não reabre; o botão "Resumo do dia" da tela Hoje revê; Ouvir lê e para; "Útil".
//   · recepção (1366): vê o dinheiro do dia, não as contas a pagar; "Chamar os 3" e "Chamar quem está no prazo" abrem a lista com os
//     três tutores e nada é enviado sozinho; "Não quero esse tipo".
//   · tosador (390): só a agenda dele, sem dinheiro. Monitor: viu ontem, abre hoje. Estoque, sem cota de IA: texto sem IA.
//   · conta nova (1366): não abre por cima do guia inicial; depois dele, abre com "Para começar".
//   · a IA de teste que inventa um número: o texto é descartado e a folha fica com o texto sem IA.
// Em todas: sem rolagem para o lado, sem erro de console e sem violação da regra de conteúdo (CSP).
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const { lib } = require('../lib/app');
const { falsos } = require('../lib/voz-falsa');
const T = require('../lib/teste')('resumo-do-dia-tela');
const R = lib('resumo-do-dia');

const SAIDA = path.join(__dirname, '..', 'saida');
const foto = async (page, nome) => { if (process.env.FOTOS) await page.screenshot({ path: path.join(SAIDA, `resumo-${nome}.png`) }); };
const sp = (x) => (x || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

async function vigiarCsp(ctx, page) {
  const visto = [];
  await ctx.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.log(`CSP-VIOLACAO ${e.effectiveDirective} ${e.blockedURI || '(em linha)'} ${e.sourceFile || ''}:${e.lineNumber || ''}`));
  });
  page.on('console', (m) => { const t = m.text(); if (/^CSP-VIOLACAO|Content Security Policy|Refused to (load|execute|apply|connect|frame)/.test(t)) visto.push(`${new URL(page.url()).pathname}: ${t.slice(0, 240)}`); });
  return visto;
}
/** Um navegador novo (como outro aparelho), com a voz de mentira e o vigia da regra de conteúdo. */
async function aparelho(largura, altura) {
  const c = await N.contexto(largura, altura);
  await c.ctx.addInitScript(falsos);
  await c.ctx.addInitScript(() => { window.__vozesFalsas = [{ name: 'Google português do Brasil', lang: 'pt-BR', voiceURI: 'teste' }]; });
  c.csp = await vigiarCsp(c.ctx, c.page);
  return c;
}
const folha = (page) => page.locator('[data-teste=resumo-dia][data-estado=pronto]');
const esperarFolha = (page) => folha(page).waitFor({ timeout: 25000 }).then(() => true, () => false);
const semErros = (c) => c.erros.filter((e) => !/Content Security Policy|CSP-VIOLACAO/.test(e));

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  fs.mkdirSync(SAIDA, { recursive: true });
  const L = await criarLoja(T, { nome: 'Resumo tela', resumo: true });
  const { dono } = L.sb;
  const P = L.P;
  const uid = (papel) => B.sql(`select user_id from profissionais where id = '${L.ids[papel]}'`);
  const linha = (papel, col) => B.sql(`select coalesce(${col}::text, '') from resumo_do_dia where petshop_id = '${P}' and user_id = '${uid(papel)}' order by dia desc limit 1`);

  // ---------- a loja ----------
  const horario = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { abre: '00:00', fecha: '23:59' }]));
  B.must(await dono.from('petshops').update({ horario }).eq('id', P).select('id'), 'horário');
  B.must(await dono.from('profissionais').update({ atende: true }).eq('id', L.ids.dono).select('id'), 'a dona atende');
  const ag = async (pet, dia, hora, extra = {}) => {
    const ini = B.instante(dia, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: pet, servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60, ...extra }).select('id').single(), 'horário').id;
  };
  await ag(L.pets.Thor, L.hoje, '09:00', { profissional_id: L.ids.tosador, status: 'confirmado' });
  await ag(L.pets.Mel, L.hoje, '10:30');
  await ag(L.pets.Bob, L.hoje, '14:00', { profissional_id: L.ids.dono, status: 'confirmado', preco: 70 });
  for (const [pet, hora] of [['Thor', '09:00'], ['Mel', '10:00'], ['Bob', '11:00']]) await ag(L.pets[pet], L.dia(1), hora, { profissional_id: L.ids.tosador });
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Luna, tipo: 'creche', status: 'em_casa', entrada: B.instante(L.hoje, '07:30', L.fuso).toISOString() }).select('id'), 'creche');
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', status: 'reservada', entrada: B.instante(L.hoje, '18:00', L.fuso).toISOString(), saida_prevista: B.instante(L.dia(2), '10:00', L.fuso).toISOString() }).select('id'), 'hotel');
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem) values
           ('${P}', 'entrada', 35, 'Banho e tosa', 'Banho', '${L.dia(-45)}', '${L.dia(-40)}', false, '${L.tutores.Ana}', 'tela'),
           ('${P}', 'saida', 312.40, 'Contas', 'Conta de luz', '${L.hoje}', '${L.hoje}', false, null, 'tela')`);
  // previsto de hoje: agenda 190 + creche e hotel 310 (Luna 70 + Fumaça 240) + a receber 45 = 545
  const zelia = B.must(await dono.from('clientes').insert({ petshop_id: P, nome: 'Zélia Rocha', telefone: '11988880020' }).select('id').single(), 'Zélia').id;
  const fumaca = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: zelia, nome: 'Fumaça', especie: 'cao', porte: 'M' }).select('id').single(), 'Fumaça').id;
  B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida_prevista, valor_diaria)
    values ('${P}', '${fumaca}', 'hotel', 'em_casa', (date '${L.dia(-2)}' + time '10:00') at time zone '${L.fuso}', (date '${L.hoje}' + time '12:00') at time zone '${L.fuso}', 120)`);
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem)
    values ('${P}', 'entrada', 45, 'Banho e tosa', 'Banho', '${L.dia(-10)}', '${L.hoje}', false, '${L.tutores.Beto}', 'tela')`);
  const novoPet = async (tutor, tel, pet) => {
    const cli = B.must(await dono.from('clientes').insert({ petshop_id: P, nome: tutor, telefone: tel }).select('id').single(), tutor).id;
    return B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: cli, nome: pet, especie: 'cao', porte: 'P' }).select('id').single(), pet).id;
  };
  const kiko = await novoPet('Eva Prado', '11988880009', 'Kiko'), toto = await novoPet('Hugo Maia', '11988880012', 'Totó'), zeca = await novoPet('Iara Luz', '11988880013', 'Zeca');
  const visita = (pet, dias) => `('${P}', '${pet}', '${L.S.Banho}', (date '${L.dia(-dias)}' + time '09:00') at time zone '${L.fuso}', (date '${L.dia(-dias)}' + time '10:00') at time zone '${L.fuso}', 'concluido')`;
  B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim, status) values ${[kiko, toto, zeca].flatMap((pet) => [58, 44, 30].map((n) => visita(pet, n))).join(',\n')}`);
  // a recepção já disse que não quer a dica dos não confirmados: para ela vem a de quem está no prazo de voltar
  B.sql(`insert into resumo_dica_votos (petshop_id, user_id, tipo, dia, voto) values ('${P}', '${uid('caixa')}', 'sem_confirmar', current_date - 3, 'nao_quero')`);
  // o monitor viu o resumo de ontem
  B.sql(`insert into resumo_do_dia (petshop_id, user_id, dia, visto_em) values ('${P}', '${uid('monitor')}', public.resumo_dia_em(now(), '${L.fuso}') - 1, now() - interval '1 day')`);

  // =====================================================================================================================
  T.secao('dona, 390: abre sozinho na primeira entrada do dia');
  let c = await aparelho(390, 844);
  let { page } = c;
  await N.entrar(page, L.emails.dono, L.senha);
  T.ok('a folha abre sozinha', await esperarFolha(page));
  const dados = B.must(await dono.rpc('gestao_resumo_do_dia', { p: P }), 'leitura');
  const dialogo = page.locator('.g-folha[role=dialog]').filter({ has: page.locator('[data-teste=resumo-dia]') });
  T.ok('é a folha do aplicativo: diálogo modal com o título "Resumo do dia"', (await dialogo.count()) === 1 && (await dialogo.getAttribute('aria-modal')) === 'true' && sp(await dialogo.locator('.g-folha-topo h2').textContent()) === 'Resumo do dia');
  T.ok('o foco está dentro da folha', await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('.g-folha'))));
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  T.ok('o Tab não sai da folha (foco preso)', await page.evaluate(() => Boolean(document.activeElement && document.activeElement.closest('.g-folha'))));
  T.ok('cabeçalho: a saudação com o primeiro nome', /^(Bom dia|Boa tarde|Boa noite), Dona$/.test(sp(await page.locator('[data-teste=resumo-saudacao]').textContent())), await page.locator('[data-teste=resumo-saudacao]').textContent());
  const bloco = R.blocoDaData(dados);
  T.ok('o bloco da data: mês, dia e dia da semana de hoje', sp(await page.locator('.g-rd-data').textContent()) === `${bloco.mes}${bloco.dia}${bloco.semana}`, await page.locator('.g-rd-data').textContent());
  const numeros = await page.locator('.g-rd-numeros > div').evaluateAll((l) => l.map((x) => x.textContent));
  T.ok('três números: 3 atendimentos, 1 sem confirmar, 3 na creche e no hotel', numeros.join('|') === '3atendimentos|1sem confirmar|3na creche e no hotel', numeros);
  const tempo = await page.locator('[data-teste=resumo-tempo] li').evaluateAll((l) => l.map((x) => `${x.dataset.tipo} ${x.querySelector('time').textContent} ${x.querySelector('.g-rd-i').firstChild.textContent}`));
  const esperado = R.linhaDoTempo(dados).map((l) => `${l.tipo} ${l.hora} ${l.texto}`);
  T.ok('a linha do tempo é a que a função monta com os dados do banco', tempo.join('|') === esperado.join('|') && tempo.length > 0, { tempo, esperado });
  T.ok('… com o Thor confirmado e a Mel destacada como "ainda não confirmou"', tempo.includes('item 09:00 Thor · banho') && tempo.includes('falta 10:30 Mel · banho · ainda não confirmou'), tempo);
  const buracos = R.buracosDoDia(dados.agenda, dados.agora);
  T.ok('os buracos à frente aparecem tracejados ("Livre até…"), com o botão de chamar', (await page.locator('[data-teste=resumo-tempo] li[data-tipo=buraco]').count()) === esperado.filter((l) => l.startsWith('buraco')).length
    && (buracos.length === 0 || (await page.locator('[data-teste=resumo-chamar-buraco]').count()) >= 1), { buracos, tempo });
  const semana = R.semanaDoResumo(dados);
  const barras = await page.locator('.g-rd-semana .g-rd-d').evaluateAll((l) => l.map((x) => x.querySelector('b').textContent));
  T.ok('a semana: uma barra por dia aberto (7), hoje e amanhã com 3 horários', barras.length === 7 && barras[0] === '3' && barras[1] === '3', barras);
  T.ok('… e a frase da semana', sp(await page.locator('[data-teste=resumo-semana-nota]').textContent()) === semana.nota, semana.nota);
  const dinheiro = (await page.locator('.g-rd-dinheiro li').evaluateAll((l) => l.map((x) => x.textContent))).map(sp);
  T.ok('dinheiro: uma linha só de previsto, R$ 545,00 (agenda, creche e hotel e a receber), a conta de luz de hoje e 2 clientes devendo R$ 80,00',
    dinheiro.join('|') === 'Previsto para entrar hojeAgenda R$ 190,00 · Creche e hotel R$ 310,00 · A receber R$ 45,00R$ 545,00|Conta de luz vence hojeR$ 312,40|2 clientes devendoR$ 80,00', dinheiro);
  T.ok('… com as origens em texto pequeno, embaixo', sp(await page.locator('[data-teste=resumo-previsto-origens]').textContent()) === 'Agenda R$ 190,00 · Creche e hotel R$ 310,00 · A receber R$ 45,00');
  const dica = page.locator('[data-teste=resumo-dica]');
  T.ok('dica do dia: uma só, a dos horários sem confirmar, com "Útil", "Não quero esse tipo" e a ação', (await dica.count()) === 1 && (await dica.getAttribute('data-tipo')) === 'sem_confirmar'
    && await page.locator('[data-teste=resumo-util]').isVisible() && await page.locator('[data-teste=resumo-nao-quero]').isVisible() && sp(await page.locator('[data-teste=resumo-dica-acao]').textContent()) === 'Mandar os lembretes');
  await page.waitForFunction(() => document.querySelector('[data-teste=resumo-dia]')?.getAttribute('data-ia') === 'sim', null, { timeout: 15000 }).catch(() => {});
  const frase = sp(await page.locator('[data-teste=resumo-frase]').textContent());
  T.ok('a frase e a dica são trocadas pelo texto do Mozart (IA de teste) quando ele chega', /pelo Mozart de teste\.$/.test(frase) && /Texto do Mozart de teste\.$/.test(sp(await page.locator('[data-teste=resumo-dica-texto]').textContent())), frase);
  T.ok('os números da folha continuam os do banco depois do texto da IA', (await page.locator('.g-rd-numeros > div').evaluateAll((l) => l.map((x) => x.textContent))).join('|') === numeros.join('|'));
  T.ok('sem rolagem para o lado (390)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '390-dona');
  T.ok('"já viu hoje" foi para o banco', linha('dono', 'visto_em') !== '');
  await page.locator('[data-teste=resumo-comecar]').click();
  T.ok('"Começar o dia" fecha a folha', (await page.locator('[data-teste=resumo-dia]').count()) === 0);

  T.secao('dona, 390: não reabre no mesmo dia; o botão da tela Hoje revê');
  await page.reload();
  await page.waitForSelector('.g-main');
  await page.waitForTimeout(3000);
  T.ok('recarregando, não reabre', (await page.locator('[data-teste=resumo-dia]').count()) === 0);
  await page.evaluate(() => { localStorage.removeItem(Object.keys(localStorage).find((k) => k.startsWith('maestro-gestao-resumo-')) || ''); });
  await page.reload();
  await page.waitForSelector('.g-main');
  await page.waitForTimeout(3000);
  T.ok('com o aparelho sem a lembrança (como em outro aparelho), também não: quem vale é o banco', (await page.locator('[data-teste=resumo-dia]').count()) === 0);
  const rever = page.locator('[data-teste=resumo-rever]');
  T.ok('a tela Hoje tem o botão "Resumo do dia" e não tem mais o cartão do Bom dia', await rever.isVisible() && (await page.locator('[data-teste=bom-dia]').count()) === 0);
  await rever.click();
  T.ok('o botão abre a folha de novo', await esperarFolha(page));
  T.ok('… com o mesmo texto do Mozart, guardado (uma vez por dia)', sp(await page.locator('[data-teste=resumo-frase]').textContent()) === frase && B.sql(`select pedidos from assistente_uso where petshop_id = '${P}' and canal = 'mozart'`) === '1');
  await page.locator('[data-teste=resumo-ouvir]').click();
  await page.waitForFunction(() => window.__voz.falas.length > 0, null, { timeout: 5000 }).catch(() => {});
  const falas = (await page.evaluate(() => window.__voz.falas.map((f) => f.texto))).join(' ');
  T.ok('"Ouvir" lê o resumo em voz alta (a saudação, os números e o previsto com as origens)', /Dona/.test(falas) && /3 atendimentos/.test(falas) && /Previsto para entrar hoje/.test(falas) && /Creche e hotel/.test(falas), falas.slice(0, 600));
  const ouvir = page.locator('[data-teste=resumo-ouvir]');
  const lendo = sp(await ouvir.textContent()) === 'Parar';
  const cancelou = await page.evaluate(() => window.__voz.cancelou);
  if (lendo) await ouvir.click();
  T.ok('… e o mesmo botão para a leitura', lendo && (await page.evaluate(() => window.__voz.cancelou)) > cancelou && sp(await ouvir.textContent()) === 'Ouvir');
  await page.locator('[data-teste=resumo-util]').click();
  await page.locator('[data-teste=resumo-voto]').waitFor({ timeout: 8000 }).catch(() => {});
  T.ok('"Útil" fica anotado na tela e no banco', /Anotado/.test(sp(await page.locator('[data-teste=resumo-voto]').textContent().catch(() => '')))
    && B.sql(`select voto from resumo_dica_votos where petshop_id = '${P}' and user_id = '${uid('dono')}' and tipo = 'sem_confirmar'`) === 'util');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  T.ok('Esc fecha a folha e o foco volta para o botão', (await page.locator('[data-teste=resumo-dia]').count()) === 0 && await page.evaluate(() => document.activeElement?.getAttribute('data-teste') === 'resumo-rever'));
  T.ok('sem rolagem para o lado na tela Hoje (390)', (await N.rolagemLateral(page)) <= 0);
  T.ok('nenhum erro de console (dona, 390)', semErros(c).length === 0, semErros(c));
  T.ok('nenhuma violação da regra de conteúdo (dona, 390)', c.csp.length === 0, c.csp);
  await c.ctx.close();

  // =====================================================================================================================
  T.secao('recepção, 1366: dinheiro do dia, chamar quem está no prazo');
  c = await aparelho(1366, 900);
  page = c.page;
  await N.entrar(page, L.emails.caixa, L.senha);
  T.ok('a folha abre sozinha para a recepção', await esperarFolha(page));
  const din = (await page.locator('.g-rd-dinheiro li').evaluateAll((l) => l.map((x) => x.dataset.linha))).join();
  T.ok('vê o previsto (o mesmo total, R$ 545,00) e quem deve, não as contas a pagar', din === 'previsto,devendo' && /R\$ 545,00$/.test(sp(await page.locator('.g-rd-dinheiro li[data-linha=previsto]').textContent())), din);
  T.ok('a dica é a de quem passou do intervalo habitual, com o botão "Chamar os 3"', (await page.locator('[data-teste=resumo-dica]').getAttribute('data-tipo')) === 'retorno' && sp(await page.locator('[data-teste=resumo-dica-acao]').textContent()) === 'Chamar os 3');
  T.ok('sem rolagem para o lado (1366)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '1366-recepcao');
  await page.locator('[data-teste=resumo-dica-acao]').click();
  const chamar = page.locator('.g-folha[role=dialog]').filter({ hasText: 'Chamar de volta' });
  await chamar.locator('.g-lb-linha').first().waitFor({ timeout: 20000 }).catch(() => {});
  const nomes = (await chamar.locator('.g-lb-linha .t b').allTextContents()).sort().join();
  T.ok('abre a lista "Chamar de volta" só com os três tutores escolhidos (Kiko, Totó e Zeca)', nomes === 'Kiko,Totó,Zeca' && (await chamar.locator('.g-cv-abas').count()) === 0, nomes);
  T.ok('cada um com a mensagem pronta para o WhatsApp, e nada enviado sozinho', (await chamar.locator('a.g-btn[href*="wa.me"], a.g-btn[href*="whatsapp"]').count()) === 3 && B.num(`select count(*) from mensagens_enviadas where petshop_id = '${P}'`) === 0);
  T.ok('sem rolagem para o lado na lista (1366)', (await N.rolagemLateral(page)) <= 0);
  await chamar.locator('.g-folha-pe button', { hasText: 'Fechar' }).click();
  T.ok('fechando a lista, o resumo volta', await esperarFolha(page));
  const botaoDoBuraco = page.locator('[data-teste=resumo-chamar-buraco]').first();
  if (await botaoDoBuraco.count()) {
    await botaoDoBuraco.click();
    await chamar.locator('.g-lb-linha').first().waitFor({ timeout: 20000 }).catch(() => {});
    T.ok('"Chamar quem está no prazo", no horário livre, abre a mesma lista com os três', (await chamar.locator('.g-lb-linha').count()) === 3);
    await chamar.locator('.g-folha-pe button', { hasText: 'Fechar' }).click();
    await esperarFolha(page);
  } else T.ok('sem horário livre à frente a esta hora: o botão do buraco não aparece', R.buracosDoDia(dados.agenda, B.sql(`select to_char(now() at time zone '${L.fuso}', 'HH24:MI')`)).length === 0);
  await page.locator('[data-teste=resumo-nao-quero]').click();
  await page.locator('[data-teste=resumo-voto]').waitFor({ timeout: 8000 }).catch(() => {});
  T.ok('"Não quero esse tipo": a tela confirma, os botões somem e o banco guarda', /não mostro mais dicas desse tipo/.test(sp(await page.locator('[data-teste=resumo-voto]').textContent().catch(() => ''))) && (await page.locator('[data-teste=resumo-dica-acao]').count()) === 0
    && B.sql(`select voto from resumo_dica_votos where petshop_id = '${P}' and user_id = '${uid('caixa')}' and tipo = 'retorno'`) === 'nao_quero');
  await page.locator('[data-teste=resumo-comecar]').click();
  T.ok('nenhum erro de console (recepção, 1366)', semErros(c).length === 0, semErros(c));
  T.ok('nenhuma violação da regra de conteúdo (recepção, 1366)', c.csp.length === 0, c.csp);
  await c.ctx.close();

  // =====================================================================================================================
  T.secao('tosador, 390: só a agenda dele, sem dinheiro');
  c = await aparelho(390, 844);
  page = c.page;
  await N.entrar(page, L.emails.tosador, L.senha);
  T.ok('a folha abre sozinha para o tosador', await esperarFolha(page));
  const tudo = sp(await folha(page).textContent());
  T.ok('nenhuma parte de dinheiro e nenhum valor (nem o previsto, nem as origens)', (await page.locator('[data-teste=resumo-dinheiro], [data-teste=resumo-previsto-origens]').count()) === 0 && !/R\$|devendo|Previsto|A receber/.test(tudo), tudo.slice(0, 400));
  const numT = await page.locator('.g-rd-numeros > div').evaluateAll((l) => l.map((x) => x.textContent));
  T.ok('"Hoje, na sua agenda": 2 atendimentos seus (Thor e Mel), sem o Bob da dona', /Hoje, na sua agenda/.test(tudo) && numT.join('|') === '2atendimentos seus|1sem confirmar' && /Thor · banho/.test(tudo) && /Mel · banho/.test(tudo) && !/Bob/.test(tudo), numT);
  T.ok('sem botão de chamar clientes', (await page.locator('[data-teste=resumo-chamar-buraco]').count()) === 0);
  T.ok('sem rolagem para o lado (tosador, 390)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '390-tosador');
  await page.locator('[data-teste=resumo-comecar]').click();
  T.ok('nenhum erro nem violação (tosador, 390)', semErros(c).length === 0 && c.csp.length === 0, [...semErros(c), ...c.csp]);
  await c.ctx.close();

  // =====================================================================================================================
  T.secao('monitor (viu ontem) e estoque (sem cota de IA), 1366');
  c = await aparelho(1366, 900);
  page = c.page;
  await N.entrar(page, L.emails.monitor, L.senha);
  T.ok('quem viu o resumo de ontem vê o de hoje abrir', await esperarFolha(page));
  T.ok('monitor: só a casa (3 na creche e no hotel), sem agenda, semana, dinheiro e dica', (await page.locator('.g-rd-numeros > div').evaluateAll((l) => l.map((x) => x.textContent))).join('|') === '3na creche e no hotel'
    && (await page.locator('[data-teste=resumo-tempo], [data-teste=resumo-semana], [data-teste=resumo-dinheiro], [data-teste=resumo-dica]').count()) === 0);
  await page.locator('[data-teste=resumo-comecar]').click();
  T.ok('nenhum erro nem violação (monitor, 1366)', semErros(c).length === 0 && c.csp.length === 0, [...semErros(c), ...c.csp]);
  await c.ctx.close();

  B.sql(`insert into assistente_uso (petshop_id, canal, dia, pedidos, chamadas) values ('${P}', 'mozart', (now() at time zone '${L.fuso}')::date, 99999, 99999)
         on conflict (petshop_id, canal, dia) do update set pedidos = 99999, chamadas = 99999`);
  B.must(await dono.from('produtos').update({ estoque: 1, estoque_minimo: 2 }).eq('id', L.prod).select('id'), 'shampoo abaixo do mínimo');
  c = await aparelho(1366, 900);
  page = c.page;
  await N.entrar(page, L.emails.estoque, L.senha);
  T.ok('sem cota de IA, a folha abre igual', await esperarFolha(page));
  await page.waitForTimeout(2500);
  T.ok('… com o texto escrito sem IA (a dica do estoque, com o nome do produto)', (await folha(page).getAttribute('data-ia')) === 'nao' && sp(await page.locator('[data-teste=resumo-dica-texto]').textContent()) === 'Shampoo Neutro está no estoque mínimo ou abaixo dele.'
    && sp(await page.locator('[data-teste=resumo-frase]').textContent()) === 'Aqui está o seu dia.', await page.locator('[data-teste=resumo-dica-texto]').textContent());
  T.ok('… nada da IA guardado, e a vez de hoje continua livre', linha('estoque', 'ia_estado') === '' && linha('estoque', 'ia_frase') === '');
  T.ok('a ação da dica leva para o Estoque', (await page.locator('[data-teste=resumo-dica-acao]').getAttribute('href')) === '/gestao/app/estoque');
  await page.locator('[data-teste=resumo-comecar]').click();
  T.ok('nenhum erro nem violação (estoque, 1366)', semErros(c).length === 0 && c.csp.length === 0, [...semErros(c), ...c.csp]);
  await c.ctx.close();
  B.sql(`delete from assistente_uso where petshop_id = '${P}' and canal = 'mozart'`);

  // =====================================================================================================================
  T.secao('conta nova, 1366: não abre por cima do guia inicial');
  const G = await criarLoja(T, { nome: 'Resumo Nova tela', equipe: false, dados: false, resumo: true });
  B.must(await G.sb.dono.from('petshops').update({ link_ativo: false }).eq('id', G.P).select('id'), 'link desligado');
  B.sql(`update petshops set guia_feito_em = null where id = '${G.P}'`);
  c = await aparelho(1366, 900);
  page = c.page;
  await page.goto(B.BASE_URL + '/gestao/entrar');
  await page.fill('input[type=email]', G.emails.dono);
  await page.fill('input[type=password]', G.senha);
  await page.click('button.g-btn.pri');
  await page.waitForURL('**/gestao/app**', { timeout: 30000 });
  await page.locator('.g-guia').waitFor({ timeout: 30000 });
  await page.waitForTimeout(3500);
  T.ok('com o guia inicial na frente, o resumo espera', await page.locator('.g-guia').isVisible() && (await page.locator('[data-teste=resumo-dia]').count()) === 0);
  T.ok('… e ainda não conta como visto', B.sql(`select count(*) from resumo_do_dia where petshop_id = '${G.P}' and visto_em is not null`) === '0');
  await page.locator('button[aria-label="Fechar o guia"]').click();
  T.ok('fechado o guia, o resumo abre', await esperarFolha(page));
  const nova = page.locator('[data-teste=resumo-conta-nova]');
  const falta = await nova.locator('a').allTextContents();
  T.ok('conta nova: "Para começar", com o que falta no cadastro (primeiro pet e ligar o link)', /Para começar/.test(await nova.textContent()) && falta.includes('Cadastrar o primeiro pet') && falta.includes('Ligar o link do cliente'), falta);
  T.ok('… sem linha do tempo, semana e dinheiro vazios, e com a dica de começo', (await page.locator('[data-teste=resumo-tempo], [data-teste=resumo-semana]').count()) === 0 && (await page.locator('[data-teste=resumo-dica]').getAttribute('data-tipo')) === 'cadastro');
  T.ok('sem rolagem para o lado (conta nova, 1366)', (await N.rolagemLateral(page)) <= 0);
  await foto(page, '1366-conta-nova');
  await page.locator('[data-teste=resumo-comecar]').click();
  T.ok('nenhum erro nem violação (conta nova, 1366)', semErros(c).length === 0 && c.csp.length === 0, [...semErros(c), ...c.csp]);
  await c.ctx.close();

  // =====================================================================================================================
  T.secao('a IA inventa um número, 390: o texto é descartado');
  const I = await criarLoja(T, { nome: `Resumo ${R.MARCA_IA_INVENTA}`, equipe: false, resumo: true });
  c = await aparelho(390, 844);
  page = c.page;
  await N.entrar(page, I.emails.dono, I.senha);
  T.ok('a folha abre', await esperarFolha(page));
  for (let i = 0; i < 30 && B.sql(`select coalesce(max(ia_estado), '') from resumo_do_dia where petshop_id = '${I.P}'`) !== 'falhou'; i++) await page.waitForTimeout(300);
  await page.waitForTimeout(600);
  const texto = sp(await folha(page).textContent());
  T.ok('o número inventado (97) e a promessa não aparecem: fica o texto sem IA', !/97|faturar/.test(texto) && (await folha(page).getAttribute('data-ia')) === 'nao' && B.sql(`select ia_estado || '|' || coalesce(ia_frase, '') from resumo_do_dia where petshop_id = '${I.P}'`) === 'falhou|', texto.slice(0, 200));
  T.ok('nenhum erro nem violação (390)', semErros(c).length === 0 && c.csp.length === 0, [...semErros(c), ...c.csp]);
  await c.ctx.close();
  await N.fecharNavegador();
}))();
