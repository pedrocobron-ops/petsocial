// Creche: o que sobrou do teste do Rafael.
//  1. Opções da creche: os três cartões (Opções do hotel e da creche, Cuidado com o tutor, Mais opções da creche) salvam num botão
//     só ("Falta salvar: …"), e sair da tela com mudança sem salvar pede confirmação.
//  2. Rascunho no aparelho: as opções e o cadastro do mensalista voltam depois de recarregar ("Rascunho recuperado · Descartar");
//     salvar apaga o rascunho.
//  3. Primeira cobrança proporcional desde o COMEÇO do plano (não "a partir de hoje"), conferida ao centavo contra a conta à mão.
//  4. Folhas para imprimir na mesma aba, com Voltar, cada uma com os dados lidos numa leva só (ondas de pedidos com 600 ms de atraso),
//     PDF A4 e o título de cada parte nunca sozinho no pé da folha.
//  5. Com 800 ms em cada pedido: o primeiro mensalista aparece na lista assim que a janela fecha, e na chamada o placar e a linha
//     das vagas mudam juntos depois de uma reposição.
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('creche-sobras');

const SAIDA = `${B.RAIZ}/testes/saida`;
const SUPA = /127\.0\.0\.1:54321|localhost:54321/;
const brl = (n) => 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const texto = async (loc) => (await loc.innerText()).replace(/ /g, ' ');

/** Atraso em todo pedido ao Supabase (como no celular). Devolve a função que desliga. */
async function atrasar(page, ms) {
  const f = async (r) => { await new Promise((ok) => setTimeout(ok, ms)); await r.continue().catch(() => {}); };
  await page.route(SUPA, f);
  return () => page.unroute(SUPA, f);
}
/** Grava a hora em que cada pedido de dados começa (rest/v1). */
function gravarPedidos(page) {
  const l = [];
  const f = (req) => { if (/\/rest\/v1\//.test(req.url())) l.push({ t: Date.now(), url: req.url().replace(/^.*\/rest\/v1\//, '').slice(0, 90) }); };
  page.on('request', f);
  return { lista: l, parar: () => page.off('request', f) };
}
/** Ondas de pedidos: um pedido que começa mais de 400 ms depois do anterior abriu uma onda nova (o atraso é de 600 ms). */
function ondas(l) {
  // o aviso de uso (marcar_uso) sai depois que a tela abre, de propósito: não é dado da folha
  const ts = l.filter((x) => !/rpc\/marcar_uso/.test(x.url)).map((x) => x.t).sort((a, b) => a - b);
  let n = ts.length ? 1 : 0;
  for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 400) n++;
  return n;
}
/** PDF A4 da página, como "Salvar como PDF": devolve o texto de cada folha. */
async function pdf(page, nome) {
  await page.emulateMedia({ media: 'print' });
  const arq = `${SAIDA}/${nome}.pdf`;
  await page.pdf({ path: arq, format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  return execFileSync('pdftotext', ['-layout', arq, '-'], { encoding: 'utf8' }).split('\f').filter((p, i, a) => i < a.length - 1 || p.trim());
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  fs.mkdirSync(SAIDA, { recursive: true });
  const L = await criarLoja(T, { nome: 'Creche sobras', equipe: false });
  const { dono } = L.sb;
  const P = L.P;
  const opcoes = () => JSON.parse(B.sql(`select json_build_object('extrato', opcoes->'creche.extrato_pet', 'ocorrencias', opcoes->'casa.ocorrencias') from petshops where id='${P}'`));

  /* ---------- 1 e 2: opções da creche, um botão só, aviso ao sair e rascunho ---------- */
  {
    T.secao('390px: Opções da creche num botão só, aviso ao sair e rascunho das opções');
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/meu-petshop#opcoes-creche');
    const grupo = page.locator('#grupo-casa');
    await grupo.locator('#opcoes-creche').waitFor({ timeout: 15000 });
    const botoes = () => grupo.locator('button', { hasText: /^Salvar opções$/ }).count();
    T.ok('sem mudança, nenhum botão Salvar opções nos três cartões', (await botoes()) === 0, await botoes());
    await grupo.locator('#opcoes-creche [role=switch][aria-label="Extrato do mês por cachorro"]').click();
    // Ocorrências vem ligada (rodada 9): o toque desliga
    await grupo.locator('#opcoes-casa [role=switch][aria-label="Ocorrências"]').click();
    const barra = page.locator('.g-salvar-junto');
    await barra.waitFor({ timeout: 5000 });
    const tBarra = await texto(barra);
    T.ok('a faixa diz o que falta salvar, com os dois cartões', /Falta salvar/.test(tBarra) && /Cuidado com o tutor/.test(tBarra) && /Mais opções da creche/.test(tBarra), tBarra);
    T.ok('um botão Salvar opções só', (await botoes()) === 1, await botoes());
    await barra.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SAIDA}/creche-sobras-opcoes-390.png` }).catch(() => {});

    // sair por um link do aplicativo pergunta; "Ficar aqui" fica
    await page.locator('.g-abas a').first().click();
    const pergunta = page.locator('.g-folha, [role=dialog], [role=alertdialog]', { hasText: 'Sair sem salvar?' }).last();
    await pergunta.waitFor({ timeout: 5000 });
    T.ok('sair com mudança sem salvar pergunta "Sair sem salvar?"', await pergunta.isVisible());
    await pergunta.locator('button', { hasText: 'Ficar aqui' }).click();
    await page.waitForTimeout(500);
    T.ok('"Ficar aqui" continua em Meu pet shop, com a faixa', /meu-petshop/.test(page.url()) && await barra.isVisible(), page.url());

    // recarregar: o navegador pergunta (aceita) e as mudanças voltam como rascunho
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await page.reload();
    await page.waitForSelector('#opcoes-creche', { timeout: 20000 });
    await page.waitForTimeout(800);
    const avisos = await page.locator('#grupo-casa .g-rascunho', { hasText: 'Rascunho recuperado' }).count();
    const extratoLigado = await page.locator('#opcoes-creche [role=switch][aria-label="Extrato do mês por cachorro"]').getAttribute('aria-checked');
    const ocorrLigado = await page.locator('#opcoes-casa [role=switch][aria-label="Ocorrências"]').getAttribute('aria-checked');
    T.ok('depois de recarregar: "Rascunho recuperado" nos dois cartões, chaves como estavam, faixa de volta', avisos === 2 && extratoLigado === 'true' && ocorrLigado === 'false' && await barra.isVisible(), { avisos, extratoLigado, ocorrLigado });
    T.ok('nada foi gravado antes de salvar', JSON.stringify(opcoes()) === JSON.stringify({ extrato: null, ocorrencias: null }), opcoes());
    await page.screenshot({ path: `${SAIDA}/creche-sobras-rascunho-opcoes-390.png` }).catch(() => {});

    await barra.locator('button', { hasText: 'Salvar opções' }).click();
    await barra.waitFor({ state: 'detached', timeout: 10000 });
    const o = opcoes();
    T.ok('um toque salvou os dois cartões', o.extrato === true && o.ocorrencias === false && B.sql(`select opcoes->>'casa.sem_ocorrencias' from petshops where id='${P}'`) === 'true', o);
    const sobra = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('maestro:rascunho:') && /opcoes-/.test(k)));
    T.ok('salvou: o rascunho some do aparelho', sobra.length === 0, sobra);

    // descartar volta ao que está salvo
    await page.locator('#opcoes-creche [role=switch][aria-label="Extrato do mês por cachorro"]').click();
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await page.reload();
    await page.waitForSelector('#opcoes-creche .g-rascunho', { timeout: 20000 });
    await page.locator('#opcoes-creche .g-rascunho button', { hasText: 'Descartar' }).click();
    await page.waitForTimeout(400);
    T.ok('Descartar: a chave volta ao que está salvo e a faixa some', (await page.locator('#opcoes-creche [role=switch][aria-label="Extrato do mês por cachorro"]').getAttribute('aria-checked')) === 'true'
      && !(await barra.count()) && !(await page.locator('#grupo-casa .g-rascunho').count()));
    await page.reload();
    await page.waitForSelector('#opcoes-creche', { timeout: 20000 });
    await page.waitForTimeout(600);
    T.ok('recarregar de novo: nenhum rascunho', !(await page.locator('#grupo-casa .g-rascunho').count()));
    T.ok('nenhum erro na tela (opções, 390)', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado (opções, 390)', (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }

  /* ---------- 2, 3 e 5: primeiro mensalista (rascunho, proporcional desde o começo, aparece na hora) ---------- */
  // começo do plano: o dia seguinte ao primeiro dia de seg/qua/sex do mês (fica sempre no mês e sempre proporcional)
  const SQS = [1, 3, 5];
  const dows = (iso) => new Date(iso + 'T12:00:00').getDay();
  const fimDoMes = B.somaDias(B.somaDias(L.mes1, 40).slice(0, 8) + '01', -1);
  const diasDoMes = []; for (let d = L.mes1; d <= fimDoMes; d = B.somaDias(d, 1)) diasDoMes.push(d);
  const primeiro = diasDoMes.find((d) => SQS.includes(dows(d)));
  const inicio = B.somaDias(primeiro, 1);
  const todos = diasDoMes.filter((d) => SQS.includes(dows(d))).length, restam = diasDoMes.filter((d) => d >= inicio && SQS.includes(dows(d))).length;
  const esperado = Math.round((720 * restam / todos) * 100) / 100;
  {
    T.secao(`1366px: primeiro mensalista começando em ${dm(inicio)} (${restam} de ${todos} dias, ${brl(esperado)}), rascunho e lista na hora`);
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=mensalistas');
    await page.locator('button', { hasText: 'Cadastrar o primeiro mensalista' }).click();
    const folha = page.locator('.g-folha').last();
    await folha.locator('input').first().fill('Thor');
    await folha.locator('.g-linha, button', { hasText: 'Thor' }).first().click();
    for (const d of ['Seg', 'Qua', 'Sex']) await page.locator('.g-cm-dias button', { hasText: d }).click();
    await page.locator('.g-folha .g-campo', { hasText: 'Começa em' }).locator('input[type=date]').fill(inicio);
    await page.locator('.g-folha .g-campo', { hasText: 'Mensalidade' }).locator('input').first().fill('720');
    await page.locator('.g-folha textarea').fill('Chega às 8h (rascunho)');
    await page.waitForTimeout(400);

    await page.reload();
    await page.waitForSelector('.g-main', { timeout: 20000 });
    const ficou = page.locator('.g-rascunho', { hasText: 'Ficou sem salvar' });
    await ficou.waitFor({ timeout: 15000 });
    T.ok('depois de recarregar, Mensalistas mostra "Ficou sem salvar: cadastro de Thor…" com Continuar', /Thor/.test(await texto(ficou)), await texto(ficou));
    await ficou.locator('button', { hasText: 'Continuar' }).click();
    const f2 = page.locator('.g-folha').last();
    await f2.locator('.g-rascunho', { hasText: 'Rascunho recuperado' }).waitFor({ timeout: 10000 });
    const valores = {
      pet: (await texto(f2)).includes('Thor'),
      dias: await Promise.all(['Seg', 'Qua', 'Sex', 'Ter'].map((d) => page.locator('.g-cm-dias button', { hasText: d }).getAttribute('aria-pressed'))),
      inicio: await f2.locator('.g-campo', { hasText: 'Começa em' }).locator('input[type=date]').inputValue(),
      mensal: await f2.locator('.g-campo', { hasText: 'Mensalidade' }).locator('input').first().inputValue(),
      obs: await f2.locator('textarea').inputValue(),
    };
    T.ok('o formulário volta com o pet, os dias, o começo, a mensalidade e a observação', valores.pet && valores.dias.join() === 'true,true,true,false' && valores.inicio === inicio && /^720(,00)?$/.test(valores.mensal) && valores.obs === 'Chega às 8h (rascunho)', valores);
    await page.screenshot({ path: `${SAIDA}/creche-sobras-rascunho-plano-1366.png` }).catch(() => {});

    const opcao = f2.locator('label.g-check', { hasText: 'proporcional' });
    const tOpcao = (await texto(opcao)).replace(/\s+/g, ' ');
    T.ok(`proporcional desde o começo do plano: "${brl(esperado)} (${restam} de ${todos} dias…)"`, tOpcao.includes(`desde o começo do plano (${dm(inicio)})`) && tOpcao.includes(`${brl(esperado)} (${restam} de ${todos} dias do plano no mês)`), tOpcao);
    T.ok('não fala mais em "a partir de hoje"', !/a partir de hoje/.test(await texto(f2)));
    await opcao.locator('input').check();

    // 5: com 800 ms por pedido, o plano aparece na lista assim que a janela fecha
    const soltar = await atrasar(page, 800);
    await f2.locator('button.g-btn.pri', { hasText: 'Cadastrar mensalista' }).click();
    await page.locator('.g-folha').waitFor({ state: 'detached', timeout: 30000 });
    const t0 = Date.now();
    await page.locator('.g-main').getByText('Thor').first().waitFor({ timeout: 5000 }).catch(() => {});
    const demorou = Date.now() - t0;
    T.ok('com 800 ms por pedido, o primeiro mensalista aparece na lista logo que a janela fecha (sem esperar a tela buscar tudo)', demorou < 600 && !(await page.getByText('Nenhum mensalista ainda').count()), `${demorou} ms`);
    await page.screenshot({ path: `${SAIDA}/creche-sobras-lista-na-hora-1366.png` }).catch(() => {});
    await page.waitForTimeout(4000);
    await soltar();
    const plano = B.sql(`select id from creche_planos where petshop_id='${P}' and pet_id='${L.pets.Thor}'`);
    const c = JSON.parse(B.sql(`select json_build_object('valor', valor_mensal, 'cheio', valor_cheio, 'total', total) from creche_cobrancas where plano_id='${plano}'`) || 'null');
    T.ok(`a primeira cobrança gravada é ${brl(esperado)} (mensalidade ${brl(720)} × ${restam} ÷ ${todos})`, c && B.centavos(c.valor) === B.centavos(esperado) && B.centavos(c.total) === B.centavos(esperado), c);
    T.ok('o plano começa no dia escolhido', B.sql(`select inicio from creche_planos where id='${plano}'`) === inicio);
    const sobra = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('maestro:rascunho:') && /plano:/.test(k)));
    T.ok('salvou: o rascunho do plano some', sobra.length === 0, sobra);
    T.ok('nenhum erro na tela (mensalista, 1366)', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  /* ---------- dados para as folhas e para a chamada ---------- */
  const novoPlano = async (pet, dias, mensal) => {
    const id = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets[pet], dias, inicio: L.mes1, vence_dia: 10, primeira_cobranca: L.mes1 }).select('id').single(), 'plano ' + pet).id;
    B.must(await dono.from('creche_planos_valores').upsert({ plano_id: id, petshop_id: P, valor_mensal: mensal }).select('plano_id'), 'valor ' + pet);
    B.must(await dono.rpc('creche_cobranca_criar', { p_plano: id, p_mes: L.mes1 }), 'cobrança ' + pet);
    return id;
  };
  const hojeDow = dows(L.hoje);
  const pBob = await novoPlano('Bob', [0, 1, 2, 3, 4, 5, 6], 650);
  const pLuna = await novoPlano('Luna', [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== hojeDow), 590.5);
  B.must(await dono.rpc('creche_chamada', { p_plano: pBob, p_dia: L.hoje, p_acao: 'chegou' }), 'Bob chegou');
  // muitos hóspedes para a folha do dia passar de uma página: na casa (hotel), chegam (reservas de hoje) e saem (creche de hoje)
  const cli = L.tutores.Davi;
  const hospedes = [];
  for (let i = 1; i <= 36; i++) {
    const nome = `Hosp${String(i).padStart(2, '0')}`;
    const pet = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: cli, nome, especie: 'cao', porte: 'M', alertas: i % 3 ? null : 'Não dividir o pote' }).select('id').single(), nome).id;
    const grupo = i <= 12 ? 'casa' : i <= 24 ? 'chega' : 'sai';
    const linha = grupo === 'casa' ? { tipo: 'hotel', status: 'em_casa', entrada: B.instante(L.dia(-1), '10:00', L.fuso).toISOString(), saida_prevista: B.instante(L.dia(2), '10:00', L.fuso).toISOString() }
      : grupo === 'chega' ? { tipo: 'hotel', status: 'reservada', entrada: B.instante(L.hoje, '19:30', L.fuso).toISOString(), saida_prevista: B.instante(L.dia(3), '10:00', L.fuso).toISOString() }
        : { tipo: 'creche', status: 'em_casa', entrada: B.instante(L.hoje, '07:30', L.fuso).toISOString(), saida_prevista: B.instante(L.hoje, '19:45', L.fuso).toISOString() };
    hospedes.push(B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: pet, ...linha }).select('id').single(), 'estadia ' + nome).id);
  }

  /* ---------- 5: chamada com reposição, 800 ms por pedido ---------- */
  {
    T.secao('390px: reposição na chamada com 800 ms por pedido: o placar e as vagas mudam juntos');
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=chamada');
    await page.waitForSelector('.g-cm-placar', { timeout: 30000 });
    await page.waitForTimeout(800);
    const ler = async () => {
      const casa = Number(await page.locator('.g-cm-placar .casa b').innerText().catch(() => 'NaN'));
      const v = (await page.locator('.g-cm-vagas').innerText().catch(() => '')).match(/(\d+) de (\d+) vagas/);
      return { casa, vagas: v ? Number(v[1]) : NaN };
    };
    const antes = await ler();
    const soltar = await atrasar(page, 800);
    await page.locator('button', { hasText: 'Veio fora do dia' }).click();
    await page.locator('.g-folha .g-linha', { hasText: 'Luna' }).click();
    await page.locator('.g-folha label.g-check', { hasText: 'reposição' }).locator('input').check();
    await page.waitForTimeout(2500); // o saldo de reposição chega
    await page.locator('.g-folha button.g-btn.pri').click();
    const amostras = [];
    for (let k = 0; k < 50; k++) { await page.waitForTimeout(120); amostras.push(await ler()); }
    await soltar();
    const depois = amostras[amostras.length - 1];
    T.ok('Luna entrou: na casa +1 e vagas +1', depois.casa === antes.casa + 1 && depois.vagas === antes.vagas + 1, { antes, depois });
    const descasadas = amostras.filter((a) => a.vagas - a.casa !== antes.vagas - antes.casa);
    T.ok('em nenhum momento o placar mudou sem a linha das vagas (antes: "4 na casa" com "3 de 20 vagas")', descasadas.length === 0, descasadas.slice(0, 5));
    T.ok('nenhum erro na tela (chamada, 390)', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  /* ---------- 4: folhas na mesma aba, uma leva só, PDF A4, título junto da lista ---------- */
  for (const [larg, alt] of [[1366, 900], [390, 844]]) {
    T.secao(`${larg}px: folhas para imprimir na mesma aba, Voltar, uma leva de pedidos e PDF A4`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);

    /** Abre a folha pelo link da tela (navegação do aplicativo), contando as ondas de pedidos com 600 ms de atraso. */
    async function abrir(link, rota, pronto) {
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      const soltar = await atrasar(page, 600);
      const g = gravarPedidos(page);
      const abas = ctx.pages().length;
      await link.click();
      await page.waitForURL(`**${rota}**`, { timeout: 15000 });
      await page.locator(pronto).first().waitFor({ timeout: 20000 });
      await page.waitForTimeout(1500);
      g.parar(); await soltar();
      return { mesmaAba: ctx.pages().length === abas, ondas: ondas(g.lista), pedidos: g.lista };
    }
    const voltar = page.locator('.g-imp-voltar');

    // cobranças do mês
    await N.ir(page, '/gestao/app/creche-hotel?ver=cobrancas');
    await page.locator('.g-cm-imprimir').waitFor({ timeout: 20000 });
    let r = await abrir(page.locator('.g-cm-imprimir'), '/creche-hotel/cobrancas/imprimir', 'table.g-pa-lista');
    T.ok('Cobranças › Imprimir abre na mesma aba', r.mesmaAba);
    T.ok(`lista do mês: os dados chegam numa leva só (${r.ondas} onda)`, r.ondas === 1, r.pedidos);
    T.ok('Voltar bem à vista no alto', await voltar.isVisible() && /Voltar para/.test(await voltar.innerText()));
    if (larg === 390) await page.screenshot({ path: `${SAIDA}/creche-sobras-imprimir-cobrancas-390.png` }).catch(() => {});
    let folhas = await pdf(page, `creche-sobras-cobrancas-${larg}`);
    T.ok('PDF A4 da lista: 1 folha, com Thor, Bob e Luna e os valores', folhas.length === 1 && /Thor/.test(folhas[0]) && /Bob/.test(folhas[0]) && /Luna/.test(folhas[0]) && folhas[0].includes(brl(esperado).replace('R$ ', '')) && folhas[0].includes('590,50'), folhas.map((f) => f.slice(0, 300)));
    await voltar.click();
    await page.waitForURL('**/creche-hotel?ver=cobrancas', { timeout: 15000 });
    await page.locator('.g-cm-imprimir').waitFor({ timeout: 20000 });
    T.ok('Voltar leva de volta para Cobranças', /ver=cobrancas/.test(page.url()));

    // extrato do tutor
    r = await abrir(page.locator('.g-cm-grupo a', { hasText: 'Extrato' }).first(), '/creche-hotel/cobrancas/imprimir', '.g-pa-total');
    T.ok(`extrato do tutor: mesma aba e uma leva só (${r.ondas})`, r.mesmaAba && r.ondas === 1, r.pedidos);
    folhas = await pdf(page, `creche-sobras-extrato-${larg}`);
    T.ok('PDF A4 do extrato: 1 folha com o total a pagar', folhas.length === 1 && /Total a pagar|Tudo pago/.test(folhas[0]), folhas.map((f) => f.slice(0, 300)));

    // extrato do cão, pela ficha do pet (com o plano no link: o saldo de reposição sai junto)
    await N.ir(page, `/gestao/app/clientes?pet=${L.pets.Thor}`);
    const linkExtrato = page.locator('a', { hasText: 'Extrato do mês' }).first();
    await linkExtrato.waitFor({ timeout: 20000 });
    T.ok('o link do extrato do cão leva o plano', /plano=/.test(await linkExtrato.getAttribute('href')), await linkExtrato.getAttribute('href'));
    r = await abrir(linkExtrato, '/creche-hotel/extrato', '.g-imp-folha');
    T.ok(`extrato do cão: mesma aba e uma leva só (${r.ondas})`, r.mesmaAba && r.ondas === 1, r.pedidos);
    await voltar.click();
    await page.waitForURL('**/clientes?pet=**', { timeout: 15000 });
    T.ok('Voltar do extrato do cão volta para a ficha do pet', true);

    // folha do dia
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    const linkFolha = page.locator('a', { hasText: 'Folha do dia' }).first();
    await linkFolha.waitFor({ timeout: 20000 });
    r = await abrir(linkFolha, '/creche-hotel/folha', '.g-imp-dia table');
    T.ok(`folha do dia: mesma aba e uma leva só (${r.ondas})`, r.mesmaAba && r.ondas === 1, r.pedidos);
    T.ok('folha do dia com o Voltar à vista', await voltar.isVisible());
    if (larg === 390) await page.screenshot({ path: `${SAIDA}/creche-sobras-folha-390.png`, fullPage: true }).catch(() => {});
    folhas = await pdf(page, `creche-sobras-folha-${larg}`);
    T.ok(`PDF A4 da folha do dia: ${folhas.length} folhas, com os 36 hóspedes`, folhas.length >= 2 && [1, 13, 25, 36].every((i) => folhas.join('\n').includes(`Hosp${String(i).padStart(2, '0')}`)), folhas.length);
    if (larg === 1366) {
      // o título de cada parte nunca fica sozinho no pé da folha: empurra cada parte para perto do pé, em vários pontos, e confere
      const partes = await page.$$eval('.g-imp-dia', (s) => s.map((x) => ({ h: x.querySelector('h2')?.firstChild?.textContent?.trim() ?? '', linha: x.querySelector('tbody tr td b')?.textContent?.trim() ?? '' })));
      const problemas = [];
      // a primeira parte vem colada no cabeçalho da folha (que não fica sozinho no fim da página): começa sempre no alto da 1ª folha
      for (const [k, p] of partes.entries()) {
        if (!k || !p.linha || !p.h) continue;
        for (let px = 0; px <= 1100; px += 55) {
          await page.$$eval('.g-imp-dia', (s, [k, px]) => s.forEach((x, i) => { x.style.marginTop = i === k ? `${px}px` : ''; }), [k, px]);
          const fl = await pdf(page, 'creche-sobras-folha-quebra');
          const ondeH = fl.findIndex((f) => new RegExp(`^\\s*${p.h}\\b`, 'm').test(f)), ondeL = fl.findIndex((f) => f.includes(p.linha));
          if (ondeH !== ondeL) problemas.push(`${p.h} na folha ${ondeH + 1}, ${p.linha} na folha ${ondeL + 1} (empurrão de ${px}px)`);
        }
      }
      await page.$$eval('.g-imp-dia', (s) => s.forEach((x) => { x.style.marginTop = ''; }));
      T.ok(`o título de cada parte (${partes.slice(1).map((p) => p.h).join(', ')}) sai na mesma folha que a primeira linha dela`, problemas.length === 0, problemas.slice(0, 6));
    }
    await voltar.click();
    await page.waitForURL('**/creche-hotel**', { timeout: 15000 });

    // fichas de cuidados
    await page.locator('a', { hasText: 'Fichas de cuidados' }).first().waitFor({ timeout: 20000 });
    r = await abrir(page.locator('a', { hasText: 'Fichas de cuidados' }).first(), '/creche-hotel/ficha', '.g-pa-ficha');
    T.ok(`fichas de cuidados: mesma aba e uma leva só (${r.ondas})`, r.mesmaAba && r.ondas === 1, r.pedidos);
    folhas = await pdf(page, `creche-sobras-fichas-${larg}`);
    T.ok('PDF A4 das fichas: uma por folha, com os hóspedes na casa', folhas.length >= 12 && /Hosp01/.test(folhas.join('\n')), folhas.length);
    await voltar.click();
    await page.waitForURL('**/creche-hotel**', { timeout: 15000 });

    T.ok(`nenhum erro na tela (folhas, ${larg})`, erros.length === 0, erros.slice(0, 4));
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
