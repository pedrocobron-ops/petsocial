// Pedido pelo link com o nome do pet parecido com um da ficha (migração 20261243), no navegador, em 390x844 e 1366x900:
// - "Tor" com o Thor na ficha: Aceitar pergunta "É o Thor que já está cadastrado?"; "Sim, é ele" põe o horário no Thor, e o
//   aviso, o cartão e a mensagem de confirmação no WhatsApp usam o nome da ficha (Thor, não "Tor");
// - "Thorr": a mesma pergunta; "É outro pet" cria o pet Thorr;
// - "Rex" (bem diferente): aceita sem perguntar, o cartão mostra "pet novo"; "Era outro pet?" → Mel passa o horário para a
//   Mel, o Rex criado no aceite sai da ficha e o cartão e a confirmação passam a dizer Mel;
// - a página do pedido (o link do tutor) não mostra nenhum pet da ficha.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('pet-parecido-telas');

const foto = async (page, nome) => { if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/pet-parecido-${nome}.png`, fullPage: true }).catch(() => {}); };

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Parecido Telas', dados: false });
  const { dono } = L.sb;
  const BANHO = L.S['Banho'];
  const ins = async (tabela, linha, oque) => B.must(await dono.from(tabela).insert(linha).select('id').single(), oque).id;
  let n = 0;

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const fone = `119${larg === 390 ? 3 : 4}${String(Date.now()).slice(-7)}`;
    const tutor = larg === 390 ? 'Ana Lima' : 'Bia Lima';
    const cli = await ins('clientes', { petshop_id: L.P, nome: tutor, telefone: fone }, 'tutora');
    const THOR = await ins('pets', { petshop_id: L.P, cliente_id: cli, nome: 'Thor', especie: 'cao', porte: 'M', sexo: 'M' }, 'Thor');
    const MEL = await ins('pets', { petshop_id: L.P, cliente_id: cli, nome: 'Mel', especie: 'cao', porte: 'P', sexo: 'F' }, 'Mel');
    const pedido = (nome) => {
      n++;
      const dia = L.dia(2 + n);
      return B.sql(`insert into pedidos_agendamento (petshop_id, tipo, servico_id, inicio, fim, tutor_nome, telefone, pet_nome, especie, porte)
        values ('${L.P}', 'servico', '${BANHO}', ('${dia} 10:00'::timestamp at time zone '${L.fuso}'), ('${dia} 11:00'::timestamp at time zone '${L.fuso}'),
          '${tutor}', '${fone}', '${nome}', 'cao', 'P') returning id`);
    };
    const petDo = (id) => B.sql(`select a.pet_id from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id where p.id='${id}'`);
    const pTor = pedido('Tor'), pThorr = pedido('Thorr'), pRex = pedido('Rex');

    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/agenda');
    const pendente = (nome) => page.locator('.g-pl-item:not(.respondido)').filter({ has: page.locator('.g-pl-nome b', { hasText: new RegExp(`^${nome}\\b`) }) }).first();
    const respondido = (nome) => page.locator('.g-pl-item.respondido').filter({ has: page.locator('.g-pl-nome b', { hasText: new RegExp(`^${nome}$`) }) }).first();
    const pergunta = page.locator('[data-teste=pergunta-pet]');

    T.secao(`${larg} px: "Tor" com o Thor na ficha`);
    await pendente('Tor').waitFor({ timeout: 30000 });
    await pendente('Tor').getByRole('button', { name: /^Aceitar/ }).click();
    await pergunta.waitFor({ timeout: 20000 });
    const titulo = await page.getByText('É o Thor que já está cadastrado?').count();
    T.ok('pergunta "É o Thor que já está cadastrado?"', titulo > 0, await page.locator('body').innerText().then((t) => t.slice(0, 300)));
    const caixa = await pergunta.innerText();
    T.ok('mostra o pedido (Tor) e o Thor da ficha com o porte', /No pedido: Tor/.test(caixa) && /Thor/.test(caixa) && /porte M/.test(caixa), caixa);
    T.ok('os dois botões: "Sim, é ele" e "É outro pet"', (await pergunta.getByRole('button', { name: 'Sim, é ele' }).count()) === 1 && (await pergunta.getByRole('button', { name: 'É outro pet' }).count()) === 1);
    T.ok(`sem rolagem para o lado com a pergunta aberta (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, `${larg}-1-pergunta`);
    await pergunta.getByRole('button', { name: 'Sim, é ele' }).click();
    T.ok('o aviso diz o nome da ficha: "Horário de Thor marcado."', await page.getByText('Horário de Thor marcado.').first().waitFor({ timeout: 20000 }).then(() => true, () => false));
    await respondido('Thor').waitFor({ timeout: 30000 });
    const zapDe = async (c) => decodeURIComponent(((await c.locator('a.g-btn.zap').getAttribute('href')) ?? '').split('text=')[1] ?? '');
    const zapThor = await zapDe(respondido('Thor'));
    T.ok('o cartão e a confirmação no WhatsApp usam "Thor" (e não "Tor")', /de Thor\b/.test(zapThor) && !/\bTor\b/.test(zapThor.split('Veja a confirmação')[0]), zapThor);
    T.ok('"Sim, é ele": o horário é do Thor', petDo(pTor) === THOR, petDo(pTor));
    T.ok('sem "pet novo" no cartão', (await respondido('Thor').locator('[data-teste=pet-novo]').count()) === 0);

    T.secao(`${larg} px: "Thorr" é outro pet`);
    await pendente('Thorr').getByRole('button', { name: /^Aceitar/ }).click();
    await pergunta.waitFor({ timeout: 20000 });
    await pergunta.getByRole('button', { name: 'É outro pet' }).click();
    await respondido('Thorr').waitFor({ timeout: 30000 });
    const novo = B.sql(`select t.nome || '|' || t.cliente_id from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id join pets t on t.id = a.pet_id where p.id='${pThorr}'`);
    T.ok('"É outro pet": nasceu o Thorr na ficha da tutora', novo === `Thorr|${cli}`, novo);

    T.secao(`${larg} px: "Rex" é bem diferente`);
    await pendente('Rex').getByRole('button', { name: /^Aceitar/ }).click();
    const cartao = respondido('Rex');
    await cartao.waitFor({ timeout: 30000 });
    T.ok('aceitou sem perguntar', (await pergunta.count()) === 0);
    const REX = petDo(pRex);
    T.ok('o cartão mostra "pet novo"', /pet novo/.test(await cartao.locator('[data-teste=pet-novo]').innerText().catch(() => '')), await cartao.innerText());
    T.ok(`sem rolagem para o lado com os cartões (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, `${larg}-2-pet-novo`);
    await cartao.getByRole('button', { name: /era outro pet/i }).click();
    const troca = page.locator('[data-teste=troca-pet]');
    await troca.waitFor({ timeout: 20000 });
    T.ok('a escolha lista os outros pets da tutora (Thor, Thorr e Mel), sem o Rex', /Thor/.test(await troca.innerText()) && /Mel/.test(await troca.innerText()) && !/\bRex\b[^,]*porte/.test(await troca.innerText()), await troca.innerText());
    await foto(page, `${larg}-3-troca`);
    await troca.locator('button', { hasText: /^Mel/ }).first().click();
    await page.getByText(/agora é de Mel/).first().waitFor({ timeout: 20000 });
    T.ok('o horário passou para a Mel', petDo(pRex) === MEL, petDo(pRex));
    T.ok('o Rex criado no aceite saiu da ficha', B.num(`select count(*) from pets where id='${REX}'`) === 0);
    await page.waitForTimeout(1500);
    await respondido('Mel').waitFor({ timeout: 20000 });
    T.ok('o cartão passa a dizer Mel, sem o "pet novo"', (await respondido('Rex').count()) === 0 && (await respondido('Mel').locator('[data-teste=pet-novo]').count()) === 0);
    const zapMel = await zapDe(respondido('Mel'));
    T.ok('e a confirmação no WhatsApp diz Mel', /de Mel\b/.test(zapMel) && !/\bRex\b/.test(zapMel), zapMel);

    T.secao(`${larg} px: o link do tutor não muda`);
    await page.goto(`${B.BASE_URL}/gestao/agendar/${L.codigo}/pedido/${pTor}`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const pg = await page.locator('body').innerText();
    T.ok('a página do pedido fala do "Tor" e não mostra os pets da ficha (Thor, Mel)', /Tor/.test(pg) && !/\bThor\b/.test(pg) && !/\bMel\b/.test(pg), pg.slice(0, 400));
    T.ok('nenhum erro na página', erros.length === 0, erros);
    await ctx.close();
    // os cartões desta largura saem da lista (como se o tutor já tivesse sido avisado)
    B.sql(`update pedidos_agendamento set avisado_em = now() where petshop_id='${L.P}'`);
  }
  await N.fecharNavegador();
}))();
