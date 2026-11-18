// Rodada 9 (N6) pela tela, no celular de 360 px da equipe do chão e no computador da dona.
//  - Tosador (Agenda + Clientes, sem dinheiro): a tela Hoje abre por "Meus pets de hoje" (só os dele, alerta em vermelho, botão do
//    próximo passo, Fotos), sem "Mandar o link do cliente" nem Primeiros passos; leva o Thor de Esperando até Entregue ao tutor e o
//    horário fica concluído; a Agenda abre em "Só os meus", lembra a escolha depois de recarregar, mostra o alerta na linha e não
//    corta o serviço; "Minha comissão" mostra o total, sem base; NENHUMA resposta da sessão traz um preço semeado.
//  - Monitora (Clientes + Creche e hotel, sem Agenda): a tela Hoje não mostra a agenda do banho; "Cuidados de agora" traz o remédio
//    atrasado em vermelho e um toque marca; o botão de cada dose tem pelo menos 48 px; a ficha impressa não diz "Nenhum remédio
//    anotado" com Gardenal nas observações; nenhuma resposta traz preço.
//  - Dona (1366): o Thor entregue pelo quadro está em Atendimentos para cobrar; Meu pet shop tem a chave da comissão por atendimento.
// Em cada tela: nenhum erro de página ou console, nenhum pedido recusado e sem rolagem para o lado. Capturas em testes/saida/chao-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('equipe-chao-tela');

const PRECO = { Banho: 67.31, 'Banho e tosa': 123.47, 'Hidratação': 44.83, 'Corte de unhas': 21.77 };
const DIARIAS = { creche: 58.13, hotel: 96.29 };
const PROIBIDOS = [...Object.values(PRECO), ...Object.values(DIARIAS)];
const achados = (texto) => PROIBIDOS.filter((v) => new RegExp(`(?<![\\d:.,])${v.toFixed(2).replace('.', '[.,]')}(?!\\d)`).test(texto));

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Chão tela' });
  const { dono } = L.sb;
  const P = L.P;
  for (const [nome, v] of Object.entries(PRECO)) B.must(await dono.from('servicos').update({ preco_p: v, preco_m: v, preco_g: v, preco_gg: v }).eq('id', L.S[nome]).select('id'), 'preço ' + nome);
  B.must(await dono.from('petshops').update({ diaria_creche: DIARIAS.creche, diaria_hotel: DIARIAS.hotel }).eq('id', P).select('id'), 'diárias');
  // a recepção também atende: com duas pessoas atendendo, a agenda tem o filtro por pessoa
  B.sql(`update profissionais set atende = true where id = '${L.ids.caixa}'`);
  B.sql(`update pets set alertas = 'BRAVO: morde na hora de cortar unha. Usar focinheira' where id = '${L.pets.Thor}'`);
  B.sql(`update pets set sexo = 'F' where id = '${L.pets.Mel}'`);
  const marcar = async (pet, hora, servico, quem, o = {}) => {
    const ini = B.instante(L.hoje, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S[servico], profissional_id: L.ids[quem], inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: PRECO[servico], ...o }).select('id').single(), 'marcar ' + pet).id;
  };
  const thor = await marcar('Thor', '08:00', 'Banho e tosa', 'tosador');
  const mel = await marcar('Mel', '09:00', 'Banho', 'tosador', { obs: 'Tosa na máquina 4' });
  await marcar('Luna', '10:00', 'Banho', 'caixa');
  // hotel: o Rex com a lista de cuidados (remédio da meia-noite sem marcar = atrasado a qualquer hora do dia) e o Bob só com texto livre
  const cuidados = [{ id: 'gard1', tipo: 'remedio', oque: 'Gardenal', quanto: '1 comprimido', horas: ['00:00', '23:59'] }, { id: 'racao1', tipo: 'comida', oque: 'Ração', quanto: '1 xícara', horas: ['00:01'] }];
  const estadia = async (pet, o) => B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'hotel', status: 'em_casa', entrada: B.instante(L.dia(-1), '09:00', L.fuso).toISOString(), saida_prevista: B.instante(L.dia(2), '18:00', L.fuso).toISOString(), ...o }).select('id').single(), 'check-in ' + pet).id;
  const rex = await estadia('Rex', { cuidados });
  const bobE = await estadia('Bob', { obs: 'Epilepsia: toma Gardenal 8h e 20h. Não pode atrasar' });
  const status = (id) => B.sql(`select status from agendamentos where id='${id}'`);
  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const foto = (page, nome) => page.screenshot({ path: path.join(saida, `chao-${nome}.png`), fullPage: true });
  const semErros = (onde, erros) => { T.ok(`${onde}: nenhum erro de página, console ou pedido recusado`, erros.length === 0, erros); erros.length = 0; };
  const semLado = async (onde, page) => { const x = await N.rolagemLateral(page); T.ok(`${onde}: sem rolagem para o lado`, x <= 0, `${x}px`); };
  const esperar = async (cond, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 250)); } return cond(); };
  /** Guarda o corpo de toda resposta do banco e das rotas do aplicativo desta sessão. */
  const escutar = (page) => {
    const corpos = [];
    page.on('response', (r) => { const u = r.url(); if (/\/rest\/v1\/|\/api\/gestao\//.test(u)) void r.text().then((t) => corpos.push({ u: u.replace(/^https?:\/\/[^/]+/, '').slice(0, 90), t })).catch(() => {}); });
    return corpos;
  };
  const precosEm = (corpos) => corpos.flatMap((c) => achados(c.t).map((v) => `${c.u}: ${v}`));

  /* ---------- tosador ---------- */
  T.secao('celular 360: o tosador abre o dia dele');
  let { ctx, page, erros } = await N.contexto(360, 740);
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  let corpos = escutar(page);
  await N.entrar(page, L.emails.tosador, L.senha);
  await N.ir(page, '/gestao/app');
  const meu = page.locator('section[aria-label="Meus pets de hoje"]');
  await meu.waitFor({ timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const topo = (await meu.boundingBox())?.y ?? 9999;
  T.ok('"Meus pets de hoje" abre a tela (dentro da primeira tela do celular)', topo < 740, `y=${Math.round(topo)}`);
  const txtMeu = await meu.innerText();
  T.ok('só os pets marcados com ele: Thor e Mel, sem a Luna (que é da Rita)', /Thor/.test(txtMeu) && /Mel/.test(txtMeu) && !/Luna/.test(txtMeu), txtMeu);
  const cartao = (pet) => meu.locator('.g-qd-card', { hasText: pet });
  T.ok('o alerta do Thor aparece inteiro, em vermelho, antes de tocar no pet', (await cartao('Thor').locator('.g-tag.vermelho').allInnerTexts()).join(' ').includes('BRAVO: morde na hora de cortar unha. Usar focinheira'), await cartao('Thor').innerText());
  T.ok('cada pet tem o botão do próximo passo', await cartao('Thor').locator('button', { hasText: 'Chegou: começar o banho' }).isVisible() && await cartao('Mel').locator('button', { hasText: 'Chegou: começar o banho' }).isVisible());
  const pagina = await page.locator('.g-main').innerText();
  T.ok('sem "Mandar o link do cliente", sem Primeiros passos e sem "Próximo atendimento" do pet shop', !/Mandar o link do cliente/.test(pagina) && !/Primeiros passos/.test(pagina) && !/Próximo atendimento/i.test(pagina), pagina.slice(0, 300));
  T.ok('o Mozart fala do dia dele ("Hoje você tem 2 pets")', /Hoje você tem 2 pets/.test(pagina), pagina.match(/Hoje[^.]*\./)?.[0]);
  const agendaDoDia = page.locator('.g-tempo .g-ag', { hasText: 'Thor' });
  T.ok('na Agenda de hoje do pet shop, a linha do Thor também traz o alerta e com quem', /BRAVO/.test(await agendaDoDia.innerText()) && /com Tito/.test(await agendaDoDia.innerText()), await agendaDoDia.innerText());
  await semLado('Hoje do tosador 360', page);
  await foto(page, 'hoje-tosador-360');

  T.secao('celular 360: um toque por etapa, do Chegou ao Entregue');
  const tocar = async (rotulo, cond, oque) => {
    await cartao('Thor').locator('button', { hasText: rotulo }).click();
    T.ok(oque, await esperar(cond), `${status(thor)} ${B.sql(`select coalesce(max(etapa),'-') from quadro_atendimento where agendamento_id='${thor}'`)}`);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  };
  const etapa = () => B.sql(`select coalesce(max(etapa),'-') from quadro_atendimento where agendamento_id='${thor}'`);
  await tocar('Chegou: começar o banho', () => status(thor) === 'em_atendimento' && etapa() === 'banho', 'Chegou: em atendimento, no banho');
  T.ok('depois de chegar aparece o botão Fotos', await cartao('Thor').locator('button', { hasText: 'Fotos' }).isVisible());
  await tocar('Foi para a secagem', () => etapa() === 'secagem', 'secagem');
  await tocar('Foi para a tosa', () => etapa() === 'tosa', 'tosa (o horário tem tosa)');
  await tocar('Está pronto', () => etapa() === 'pronto', 'pronto');
  await cartao('Thor').locator('button', { hasText: 'Entregue ao tutor' }).click();
  const confirma = page.getByRole('button', { name: 'Entregar', exact: true });
  await confirma.waitFor({ timeout: 8000 });
  T.ok('antes de entregar, avisa que fica concluído e Falta cobrar para o caixa', /Falta cobrar/.test(await page.locator('body').innerText()));
  await confirma.click();
  T.ok('Entregue ao tutor: o horário fica concluído (antes ficava "em atendimento" para sempre)', await esperar(() => status(thor) === 'concluido'), status(thor));
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  T.ok('o Thor sai da lista do que falta ("Falta 1 pet") e fica em Ver os entregues', await esperar(async () => /Falta 1 pet/.test(await meu.innerText()) && /Ver os entregues \(1\)/.test(await meu.innerText())), await meu.innerText());
  const comissao = page.locator('section[aria-label="Minha comissão"]');
  await comissao.waitFor({ timeout: 15000 });
  const txtCom = await comissao.innerText();
  T.ok('Minha comissão: o total do mês (40% de R$ 123,47 = R$ 49,39) e 1 atendimento, sem a base', /49,39/.test(txtCom) && /1 atendimento/.test(txtCom) && !/base/i.test(txtCom) && !/123,47/.test(txtCom), txtCom);
  await foto(page, 'hoje-tosador-entregue-360');
  semErros('Hoje do tosador', erros);

  T.secao('celular 360: a Agenda do tosador');
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.waitForSelector('.g-tempo .g-ag', { timeout: 20000 });
  const chip = (nome) => page.locator('.g-chips .g-chip', { hasText: nome }).first();
  T.ok('abre em "Só os meus"', (await chip('Só os meus').getAttribute('aria-pressed')) === 'true');
  const linhas = () => page.locator('.g-tempo .g-ag').allInnerTexts();
  T.ok('só os horários dele: Thor e Mel, sem a Luna', (await linhas()).length === 2 && !(await linhas()).join(' ').includes('Luna'), await linhas());
  const linhaThor = page.locator('.g-tempo .g-ag', { hasText: 'Thor' });
  T.ok('o alerta aparece na linha, antes de abrir o horário', await linhaThor.locator('.g-agd-alerta').isVisible() && /BRAVO: morde na hora de cortar unha/.test(await linhaThor.locator('.g-agd-alerta').innerText()), await linhaThor.innerText());
  const cortado = await page.locator('.g-tempo .g-ag .serv').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
  T.ok('o serviço não é cortado (quebra a linha)', cortado.length === 0, cortado);
  T.ok('o serviço do Thor aparece inteiro', /Banho e tosa/.test(await linhaThor.locator('.serv').innerText()));
  await semLado('Agenda do tosador 360', page);
  await foto(page, 'agenda-tosador-360');
  await chip('Todos').click();
  T.ok('em Todos aparecem os três', await esperar(async () => (await linhas()).length === 3));
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.waitForSelector('.g-tempo .g-ag', { timeout: 20000 });
  T.ok('recarregou: a Agenda lembra a última escolha (Todos)', (await chip('Todos').getAttribute('aria-pressed')) === 'true' && (await linhas()).length === 3);
  await chip('Só os meus').click();
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.waitForSelector('.g-tempo .g-ag', { timeout: 20000 });
  T.ok('e lembra de novo quando volta para Só os meus', (await chip('Só os meus').getAttribute('aria-pressed')) === 'true' && (await linhas()).length === 2);

  T.secao('celular 360: anotação do atendimento e uma lista de chegada só');
  await cartaoDaAgenda(page, 'Mel');
  const folha = page.locator('.g-folha').last();
  await folha.locator('button', { hasText: 'Chegou: iniciar atendimento' }).click();
  T.ok('a Mel chegou', await esperar(() => status(mel) === 'em_atendimento'));
  // a folha Entrada abre sozinha só quando o pet shop pede: aqui não pede
  const chegou = folha.locator('.g-campo', { hasText: 'Como o pet chegou' });
  await chegou.waitFor({ timeout: 10000 });
  await chegou.locator('.g-chip', { hasText: 'Nós no pelo' }).click();
  T.ok('o atalho fica gravado no horário', await esperar(() => B.sql(`select coalesce(checklist->>'nos','') from agendamentos where id='${mel}'`) === 'true'));
  T.ok('a tela diz que o atalho entra na conferência que o tutor assina', /já entra marcado em Conferir a entrada/.test(await chegou.innerText()));
  await folha.locator('button', { hasText: 'Conferir a entrada' }).click();
  const entrada = page.locator('.g-folha').last();
  await entrada.locator('.g-chip', { hasText: 'Nós no pelo' }).first().waitFor({ timeout: 10000 });
  T.ok('Conferir a entrada já abre com "Nós no pelo" marcado (antes abria desmarcado)', (await entrada.locator('.g-chip', { hasText: 'Nós no pelo' }).first().getAttribute('aria-pressed')) === 'true');
  await foto(page, 'entrada-com-atalho-360');
  semErros('Agenda do tosador', erros);
  T.ok('NENHUMA resposta da sessão do tosador traz um preço semeado', precosEm(corpos).length === 0 && corpos.length > 30, precosEm(corpos).length ? precosEm(corpos) : `${corpos.length} respostas`);
  await ctx.close();

  /* ---------- monitora ---------- */
  T.secao('celular 360: a monitora (sem Agenda)');
  ({ ctx, page, erros } = await N.contexto(360, 740));
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  corpos = escutar(page);
  await N.entrar(page, L.emails.monitor, L.senha);
  await N.ir(page, '/gestao/app');
  const agora = page.locator('section[aria-label="Cuidados de agora"]');
  await agora.waitFor({ timeout: 20000 });
  const hoje = await page.locator('.g-main').innerText();
  T.ok('a tela Hoje não mostra a agenda do banho e tosa (nem "Agenda de hoje", nem Thor, nem "atendimentos")', !/Agenda de hoje/.test(hoje) && !/Thor/.test(hoje) && !/Próximo atendimento/i.test(hoje) && !/atendimento/i.test(hoje.replace(/Cuidados de agora[\s\S]*/, '')), hoje.slice(0, 400));
  T.ok('nem "Meus pets de hoje" (ela não atende no banho)', (await page.locator('section[aria-label="Meus pets de hoje"]').count()) === 0);
  const linhaRex = agora.locator('li', { hasText: 'Gardenal' });
  const txtAgora = await agora.innerText();
  T.ok('Cuidados de agora: o Gardenal do Rex atrasado, em destaque, com a palavra', (await linhaRex.getAttribute('class')).includes('atrasada') && /Rex/.test(await linhaRex.innerText()) && /atrasado há/.test(await linhaRex.innerText()) && /atrasados?/.test(txtAgora), txtAgora);
  T.ok('o remédio vem antes da comida', txtAgora.indexOf('Gardenal') < txtAgora.indexOf('Ração'), txtAgora);
  await semLado('Hoje da monitora 360', page);
  await foto(page, 'hoje-monitora-360');
  await linhaRex.locator('button', { hasText: 'Feito' }).click();
  T.ok('um toque marca a dose, em nome dela', await esperar(() => B.sql(`select coalesce(max(feito_nome),'') from estadias_cuidados where estadia_id='${rex}' and item='gard1' and hora='00:00'`) === 'Mário Monitor'));
  T.ok('a dose marcada sai da lista', await esperar(async () => !(await agora.innerText().catch(() => '')).includes('Gardenal')), await agora.innerText().catch(() => 'sumiu'));
  semErros('Hoje da monitora', erros);

  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  await page.waitForSelector('.g-ht-cuid', { timeout: 20000 });
  const medidas = await page.locator('.g-ht-feito').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), t: e.textContent, c: e.className }; }));
  T.ok('o botão de cada dose tem pelo menos 48 px nos dois sentidos (era 40 x 43)', medidas.length >= 3 && medidas.every((m) => m.w >= 48 && m.h >= 48), medidas);
  T.ok('a dose que passou e ninguém marcou fica marcada como atrasada no cartão; a das 23h59 não', medidas.some((m) => /atrasada/.test(m.c) && /atrasado/.test(m.t)) && medidas.some((m) => /23h59/.test(m.t) && !/atrasada/.test(m.c)), medidas);
  T.ok('a tela da casa também traz Cuidados de agora', (await page.locator('section[aria-label="Cuidados de agora"]').count()) === 1);
  await semLado('Casa agora 360', page);
  await foto(page, 'casa-monitora-360');
  semErros('Casa agora', erros);

  await N.ir(page, `/gestao/app/creche-hotel/ficha?estadia=${bobE}`, '.g-pa-ficha');
  const ficha = await page.locator('.g-pa-ficha').innerText();
  T.ok('a ficha do Bob (Gardenal só nas observações) NÃO diz "Nenhum remédio anotado"', !/Nenhum remédio anotado/i.test(ficha) && !/nenhum remédio/i.test(ficha), ficha);
  T.ok('e manda ler as observações, em destaque', /as observações abaixo falam de remédio/i.test(ficha) && /Há remédio escrito nas observações/i.test(ficha) && /Gardenal 8h e 20h/.test(ficha), ficha);
  await foto(page, 'ficha-bob-360');
  await N.ir(page, `/gestao/app/creche-hotel/ficha?estadia=${rex}`, '.g-pa-ficha');
  const fichaRex = await page.locator('.g-pa-ficha').innerText();
  T.ok('a ficha do Rex traz o Gardenal com os horários', /Gardenal, 1 comprimido/.test(fichaRex) && /23h59/.test(fichaRex) && !/falam de remédio/.test(fichaRex), fichaRex);
  semErros('Ficha de cuidados', erros);
  T.ok('NENHUMA resposta da sessão da monitora traz um preço semeado', precosEm(corpos).length === 0 && corpos.length > 20, precosEm(corpos).length ? precosEm(corpos) : `${corpos.length} respostas`);
  await ctx.close();

  /* ---------- dona ---------- */
  T.secao('computador 1366: a dona');
  ({ ctx, page, erros } = await N.contexto(1366, 800));
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app');
  const cobrar = page.locator('#atendimentos-para-cobrar');
  await cobrar.waitFor({ timeout: 20000 });
  T.ok('o Thor, entregue pelo tosador sem pagar, está em Atendimentos para cobrar', /Thor/.test(await cobrar.innerText()) && /123,47/.test(await cobrar.innerText()), await cobrar.innerText());
  T.ok('a dona não ganha "Meus pets de hoje" (a tela dela é a do pet shop)', (await page.locator('section[aria-label="Meus pets de hoje"]').count()) === 0);
  await semLado('Hoje da dona 1366', page);
  await foto(page, 'hoje-dona-1366');
  await N.ir(page, '/gestao/app/agenda/quadro');
  await page.waitForSelector('.g-qd-colunas', { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  const entregue = page.locator('.g-qd-col.entregue .g-qd-card', { hasText: 'Thor' });
  T.ok('no Quadro, o Thor está em Entregue com "Falta fechar a conta"', await esperar(async () => /Falta fechar a conta/.test(await entregue.innerText().catch(() => ''))), await entregue.innerText().catch(() => 'sem cartão'));
  await foto(page, 'quadro-dona-1366');
  await N.ir(page, '/gestao/app/meu-petshop');
  const chave = page.locator('[role="switch"][aria-label="Mostrar o valor de cada atendimento na comissão"]');
  await chave.waitFor({ state: 'attached', timeout: 20000 });
  T.ok('Meu pet shop tem a chave "A pessoa vê o valor de cada atendimento", desligada', (await chave.getAttribute('aria-checked')) === 'false');
  const hotel = page.locator('[role="switch"]', { hasText: 'Ficha de cuidados' }).or(page.locator('[role="switch"][aria-label*="Ficha de cuidados"]')).first();
  T.ok('a Ficha de cuidados vem ligada num pet shop que nunca mexeu nas opções', (await hotel.count()) === 1 && (await hotel.getAttribute('aria-checked')) === 'true', await hotel.count());
  await semLado('Meu pet shop 1366', page);
  semErros('Dona', erros);
  await ctx.close();
  await N.fecharNavegador();
}))();

/** Abre o horário de um pet pela linha da Agenda. */
async function cartaoDaAgenda(page, pet) {
  await page.locator('.g-tempo .g-ag', { hasText: pet }).first().click();
  await page.locator('.g-folha').last().waitFor({ timeout: 10000 });
}
