// Trazer do caderno ou do outro sistema, pela tela, com a leitura de teste (GESTAO_CADERNO_FALSO=1: o servidor nunca chama
// o modelo). 390: Clientes → Foto do caderno → "Não sei, descubra" → a conferência (Ana Souza "Já existe" e juntada, Marta
// sem telefone com "Verificar", Beto devendo desde 12/10, Joana nova, horário que já passou fora) → Salvar com dois toques
// seguidos: tudo uma vez só. 1366: tabela de preços (Banho M de R$ 60 para R$ 55, Hidratação igual, Banho de ofurô novo) e
// carteirinha do Thor (a próxima dose que não está escrita fica em branco, "Definir vencimento").
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const N = require('../lib/navegador');
const T = require('../lib/teste')('telas-caderno');
const C = lib('caderno');
const nb = (s) => (s ?? '').replace(/ /g, ' ');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Caderno telas' });
  const P = L.P;
  const pasta = `${B.RAIZ}/testes/saida`;

  /** Uma foto de verdade (o navegador precisa abrir para diminuir): a captura da própria tela. */
  async function escolherFoto(page) {
    const img = await page.screenshot({ type: 'png' });
    await page.locator('.g-folha input[type=file][multiple]').setInputFiles({ name: 'caderno.png', mimeType: 'image/png', buffer: img });
    await page.locator('.g-cad-arqs li').first().waitFor({ timeout: 10000 });
  }
  async function lerEEsperar(page) {
    await page.locator('.g-folha button', { hasText: /^Ler / }).click();
    await page.locator('.g-cad-secao').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
  }

  // ---------- 390: clientes, dívidas e agenda ----------
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/clientes');
    T.secao('390: abrir e ler');
    await N.doAlto(page, 'Foto do caderno');
    const folha = page.locator('.g-folha');
    await folha.waitFor();
    T.ok('título e aviso de que a foto não fica guardada', /Trazer do caderno ou do outro sistema/.test(await folha.innerText()) && /não ficam guardados/.test(await folha.innerText()));
    await folha.getByText(/Hoje ainda dá para ler/).first().waitFor({ timeout: 8000 }).catch(() => {}); // a contagem chega um instante depois da folha
    // loja em teste: 10 páginas por dia (quem paga: 20), no mesmo saldo dos anexos do Mozart (migração 20261248)
    const limiteDoTeste = B.num(`select (public.paginas_ia_limites('${P}') ->> 'limite')::int`);
    T.ok(`mostra quantas páginas ainda dá para ler hoje (${limiteDoTeste}, o limite do teste)`, new RegExp(`Hoje ainda dá para ler ${limiteDoTeste} páginas`).test(await folha.innerText()) && /as fotos mandadas ao Mozart usam o mesmo saldo/.test(await folha.innerText()), await folha.locator('[data-cota]').innerText().catch(() => ''));
    T.ok('os quatro tipos e o "Não sei" (dono)', (await folha.locator('.g-cad-tipo').count()) === 5);
    await folha.locator('.g-cad-tipo', { hasText: 'Não sei, descubra' }).click();
    await escolherFoto(page);
    await page.screenshot({ path: `${pasta}/caderno-escolher-390.png`, fullPage: false }).catch(() => {});
    await lerEEsperar(page);
    const texto = nb(await folha.innerText());
    await page.screenshot({ path: `${pasta}/caderno-conferir-390.png`, fullPage: false }).catch(() => {});

    T.secao('390: a conferência');
    T.ok('nada salvo ainda', /Nada foi salvo ainda/.test(texto) && B.num(`select count(*) from clientes where petshop_id='${P}'`) === 4);
    const ana = folha.locator('[data-linha=cliente]').filter({ has: page.locator('input[value="Ana Souza"]') });
    T.ok('Ana Souza: "Já existe" e "Juntar com a ficha" marcado', (await ana.locator('.g-tag', { hasText: 'Já existe' }).count()) === 1
      && await ana.locator('.g-cad-juntar input').isChecked() && /Juntar com a ficha de Ana Souza/.test(await ana.innerText()));
    T.ok('Thor já é dela: "só completa"', /Já cadastrado: só completa/.test(await ana.innerText()));
    const marta = folha.locator('[data-linha=cliente]').filter({ has: page.locator('input[value="Marta Gomes"]') });
    T.ok('Marta Gomes: "Verificar: sem telefone"', /Verificar: sem telefone/.test(await marta.innerText()));
    T.ok('o que não deu para ler aparece', /telefone está borrado/.test(texto));
    const beto = folha.locator('[data-linha=divida]').filter({ has: page.locator('input[value="Beto Lima"]') });
    const desde = C.lerDataDoCaderno('12/10', L.hoje, 'passado');
    T.ok('Beto Lima deve: "Já existe", desde 12/10', /Já existe/.test(await beto.innerText()) && (await beto.locator('input[type=date]').inputValue()) === desde);
    T.ok('total das dívidas: R$ 85,00', /Total marcado: R\$ 85,00/.test(texto), texto.match(/Total marcado.{0,20}/)?.[0]);
    const passado = folha.locator('[data-linha=horario]').filter({ has: page.locator('input[value="Bolinha"]') });
    T.ok('horário de dia que já passou: "Já passou: não entra", desmarcado', /Já passou: não entra/.test(await passado.innerText()) && !(await passado.locator('.g-cad-cab input[type=checkbox]').isChecked()));
    const salvar = page.locator('.g-cad-rodape button', { hasText: /^Salvar/ });
    T.ok('o botão diz quantos itens: 5 (2 clientes, 2 dívidas, 1 horário)', (await salvar.innerText()).trim() === 'Salvar 5 itens', await salvar.innerText());

    T.secao('390: salvar com dois toques');
    await salvar.click();
    await salvar.click({ force: true, timeout: 2000 }).catch(() => {});
    await folha.locator('.g-imp-resumo').waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    const resumo = nb(await folha.innerText());
    await page.screenshot({ path: `${pasta}/caderno-pronto-390.png` }).catch(() => {});
    T.ok('resumo: 2 novos e 2 juntos (Ana e Beto), pets, contas e horário', /2 clientes novos e 2 juntos com fichas que já existiam/.test(resumo) && /2 contas anotadas/.test(resumo) && /1 horário marcado/.test(resumo), resumo);
    const n = (q) => B.num(q);
    T.ok('Ana Souza continua uma ficha só (juntou, não duplicou)', n(`select count(*) from clientes where petshop_id='${P}' and nome='Ana Souza'`) === 1);
    T.ok('Pipoca entrou na ficha da Ana; Thor não duplicou', n(`select count(*) from pets where cliente_id='${L.tutores.Ana}' and nome='Pipoca' and porte='P' and raca='Poodle'`) === 1
      && n(`select count(*) from pets where petshop_id='${P}' and nome='Thor'`) === 1);
    T.ok('Marta Gomes nova, sem telefone, com Bolinha e a observação', n(`select count(*) from clientes c join pets p on p.cliente_id=c.id where c.petshop_id='${P}' and c.nome='Marta Gomes' and c.telefone is null and c.obs='Só vem de manhã' and p.nome='Bolinha'`) === 1);
    T.ok('Beto: R$ 35 a receber, ligado à ficha dele, desde 12/10 (uma vez só)', n(`select count(*) from lancamentos where petshop_id='${P}' and cliente_id='${L.tutores.Beto}' and valor=35 and not pago and devido_desde='${desde}'`) === 1
      && n(`select count(*) from lancamentos where petshop_id='${P}' and cliente_id='${L.tutores.Beto}'`) === 1);
    T.ok('Joana Prado nova (com o telefone) e R$ 50 sem "desde"', n(`select count(*) from lancamentos l join clientes c on c.id=l.cliente_id where l.petshop_id='${P}' and c.nome='Joana Prado' and c.telefone='21998765432' and l.valor=50 and l.devido_desde is null`) === 1);
    T.ok('nenhuma dívida entrou como dinheiro', n(`select count(*) from lancamentos where petshop_id='${P}' and pago`) === 0);
    const quando = B.instante(L.dia(3), '10:00', L.fuso).toISOString();
    T.ok('Thor marcado no dia +3 às 10:00, Banho, uma vez só', n(`select count(*) from agendamentos where petshop_id='${P}' and pet_id='${L.pets.Thor}' and inicio='${quando}' and servico_id='${L.S.Banho}'`) === 1
      && n(`select count(*) from agendamentos where petshop_id='${P}'`) === 1);
    T.ok('o horário que já passou não entrou', n(`select count(*) from agendamentos a join pets p on p.id=a.pet_id where a.petshop_id='${P}' and p.nome='Bolinha'`) === 0);
    T.ok('a leitura contou 1 página', n(`select coalesce(sum(paginas), 0) from caderno_uso where petshop_id='${P}'`) === 1);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }

  // ---------- 1366: tabela de preços e carteirinha ----------
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/clientes');
    T.secao('1366: tabela de preços');
    await N.doAlto(page, 'Foto do caderno');
    const folha = page.locator('.g-folha');
    await folha.locator('.g-cad-tipo', { hasText: 'Tabela de preços' }).click();
    T.ok('o botão da câmera fala da tabela', (await folha.locator('label.g-btn', { hasText: 'Tirar foto da tabela' }).count()) === 1);
    await escolherFoto(page);
    await lerEEsperar(page);
    const texto = nb(await folha.innerText());
    await page.screenshot({ path: `${pasta}/caderno-precos-1366.png` }).catch(() => {});
    T.ok('"Atualizar o preço de Banho M de R$ 60,00 para R$ 55,00?"', /Atualizar o preço de Banho M de R\$ 60,00 para R\$ 55,00\?/.test(texto), texto.slice(0, 600));
    T.ok('só o M muda no Banho (P, G e GG iguais não aparecem)', !/Banho P de|Banho G de|Banho GG de/.test(texto));
    T.ok('Hidratação: "Igual ao que já está", sem marcar', /Igual ao que já está/.test(texto));
    T.ok('Banho de ofurô: "Serviço novo"', /Serviço novo/.test(texto));
    await page.locator('.g-cad-rodape button', { hasText: 'Salvar 2 itens' }).dblclick();
    await folha.locator('.g-imp-resumo').waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    const precos = (nome) => B.sql(`select concat_ws('|', preco_p, preco_m, preco_g, preco_gg, duracao_min) from servicos where petshop_id='${P}' and nome='${nome}'`);
    T.ok('Banho: M de 60 para 55, os outros iguais', precos('Banho').startsWith('50.00|55.00|70.00|80.00'), precos('Banho'));
    T.ok('Hidratação sem mudança', precos('Hidratação').startsWith('25.00|30.00|35.00|40.00'), precos('Hidratação'));
    T.ok('Banho de ofurô novo uma vez só: R$ 35 em todos os portes, 40 min', B.num(`select count(*) from servicos where petshop_id='${P}' and nome='Banho de ofurô'`) === 1 && precos('Banho de ofurô') === '35.00|35.00|35.00|35.00|40', precos('Banho de ofurô'));
    await folha.locator('button', { hasText: 'Pronto' }).click();

    T.secao('1366: foto HEIC e PDF grande (migração 20261195)');
    await page.waitForTimeout(400);
    await N.doAlto(page, 'Foto do caderno');
    const f3 = page.locator('.g-folha');
    await f3.locator('.g-cad-tipo', { hasText: 'Clientes e pets' }).click();
    // uma "foto do iPhone" que o Chromium não abre
    await f3.locator('input[type=file][multiple]').setInputFiles({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(400, 1)]) });
    await f3.locator('.g-aviso.vermelho').waitFor({ timeout: 10000 });
    T.ok('HEIC que o navegador não abre: diz o que fazer (Safari ou print)', /HEIC.*iPhone.*Safari.*print/s.test(nb(await f3.locator('.g-aviso.vermelho').innerText())), await f3.locator('.g-aviso.vermelho').innerText());
    // PDF de 5 MB: passa do limite de envio da Vercel (~4,5 MB), sobe antes para a pasta temporária
    const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1'), Buffer.alloc(5 * 1024 * 1024, 32)]);
    await f3.locator('input[type=file][multiple]').setInputFiles({ name: 'lista-do-sistema.pdf', mimeType: 'application/pdf', buffer: pdf });
    await f3.locator('.g-cad-arqs li').first().waitFor({ timeout: 15000 });
    const subidas = [], envios = [];
    const ouvir = (rq) => {
      if (/\/storage\/v1\/object\/caderno-tmp\//.test(rq.url()) && rq.method() === 'POST') subidas.push(rq.url());
      if (/\/api\/gestao\/caderno$/.test(rq.url())) envios.push(rq.postDataBuffer()?.length ?? 0);
    };
    page.on('request', ouvir);
    await lerEEsperar(page);
    page.off('request', ouvir);
    T.ok('o PDF subiu antes para a pasta temporária e o envio foi pequeno', subidas.length === 1 && envios.length === 1 && envios[0] < 1024 * 1024, { subidas: subidas.length, envio: envios[0] });
    T.ok('a leitura veio (a conferência aparece)', (await f3.locator('.g-cad-secao').count()) > 0);
    await page.waitForTimeout(500);
    T.ok('nada ficou na pasta temporária (apagado logo depois de ler)', B.num(`select count(*) from storage.objects where bucket_id = 'caderno-tmp' and name like '${P}/%'`) === 0);
    await f3.locator('.g-folha-x, button[aria-label="Fechar"]').first().click().catch(() => {});
    await page.waitForTimeout(400);

    T.secao('1366: carteirinha do Thor');
    await N.ir(page, `/gestao/app/clientes?pet=${L.pets.Thor}`);
    await page.locator('button', { hasText: 'Ler a carteirinha' }).click();
    const f2 = page.locator('.g-folha');
    T.ok('título com o nome do pet, sem escolher o tipo', /Ler a carteirinha de Thor/.test(await f2.innerText()) && (await f2.locator('.g-cad-tipo').count()) === 0);
    await escolherFoto(page);
    await lerEEsperar(page);
    await page.screenshot({ path: `${pasta}/caderno-carteirinha-1366.png` }).catch(() => {});
    const anti = f2.locator('[data-linha=vacina]').filter({ has: page.locator('input[value="Antirrábica"]') });
    T.ok('Antirrábica sem a próxima dose escrita: em branco e "Definir vencimento"', /Definir vencimento/.test(await anti.innerText()) && (await anti.locator('input[type=date]').nth(1).inputValue()) === '');
    const v10 = f2.locator('[data-linha=vacina]').filter({ has: page.locator('input[value="V10"]') });
    T.ok('V10 com a próxima dose escrita', (await v10.locator('input[type=date]').nth(1).inputValue()) === L.dia(335));
    await page.locator('.g-cad-rodape button', { hasText: 'Salvar 3 itens' }).dblclick();
    await f2.locator('.g-imp-resumo').waitFor({ timeout: 30000 });
    await page.waitForTimeout(500);
    T.ok('3 cuidados na saúde do Thor, uma vez só', B.num(`select count(*) from pets_saude where pet_id='${L.pets.Thor}'`) === 3);
    T.ok('Antirrábica sem vencimento; V10 com o vencimento e a veterinária', B.num(`select count(*) from pets_saude where pet_id='${L.pets.Thor}' and nome='Antirrábica' and vence_em is null`) === 1
      && B.num(`select count(*) from pets_saude where pet_id='${L.pets.Thor}' and nome='V10' and vence_em='${L.dia(335)}' and aplicado_em='${L.dia(-30)}' and obs='Veterinário: Dra. Paula Reis'`) === 1);
    await f2.locator('button', { hasText: 'Pronto' }).click();
    await page.waitForTimeout(600);
    T.ok('a ficha mostra a V10 depois de salvar', /V10/.test(await page.locator('.g-cli-saude').innerText()));
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
