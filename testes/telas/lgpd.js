// LGPD pela tela (migração 20261199), em 390 e 1366:
//  - Meu pet shop, "Seus dados e a conta": "Baixar todos os dados" baixa um .zip com README.txt e uma planilha por parte, em UTF-8
//    com BOM, só com os dados desta loja (o cliente da outra loja nunca aparece); a equipe vem sem senha nem convite;
//  - ficha do tutor: "Baixar os dados deste tutor" (zip só da Ana) e "Apagar dados deste tutor" com o nome digitado (o botão só
//    acende com o nome certo): a ficha vira "Cliente removido" e o dinheiro da loja fica igual;
//  - "Encerrar e apagar a conta" (1366): o nome do pet shop digitado, o aviso vermelho em todas as telas, a recepção não lança
//    (só consulta), "Cancelar a exclusão" volta ao normal;
//  - "Sair desta equipe" no Mais (390) para a recepção, e não para o titular;
//  - painel do administrador, aba Dados: o lembrete da cópia e a lista de contas para apagar.
// Capturas em testes/saida/lgpd-*.png.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const { lib } = require('../lib/app');
const N = require('../lib/navegador');
const T = require('../lib/teste')('lgpd-tela');
const FOTOS = path.join(B.RAIZ, 'testes', 'saida') + '/';
const foto = async (page, nome, inteira = false) => { await page.waitForTimeout(900); return page.screenshot({ path: `${FOTOS}lgpd-${nome}.png`, fullPage: inteira }); };
const D = lib('dinheiro');

/** Lê um .zip baixado: { nome: texto } (python3, que já confere o zip). */
function lerZip(arquivo) {
  const py = execFileSync('python3', ['-I', '-c', `
import sys, zipfile, json
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps({n: z.read(n).decode('utf-8') for n in z.namelist()}, ensure_ascii=False))
`, arquivo]).toString();
  return JSON.parse(py);
}
async function baixar(page, clicar) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), clicar()]);
  const destino = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lgpd-')), d.suggestedFilename());
  await d.saveAs(destino);
  return { nome: d.suggestedFilename(), arquivos: lerZip(destino) };
}
const soma = (P) => B.sql(`select coalesce(sum(case when tipo='entrada' then valor else -valor end), 0)::text from lancamentos where petshop_id='${P}'`);

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'LGPD Tela' });
  const O = await criarLoja(T, { nome: 'LGPD Vizinha', equipe: false });
  B.must(await O.sb.dono.from('clientes').insert({ petshop_id: O.P, nome: 'Zuleica Vizinha', telefone: '11955554444' }).select('id'), 'cliente da outra loja');
  await D.lancarPago(L.sb.dono, L.P, { tipo: 'entrada', valor: 60, forma: 'pix', categoria: 'Banho e tosa', clienteId: L.tutores.Ana, descricao: 'Banho · Thor', chave: D.novaChaveDeOperacao() });
  await D.lancarPago(L.sb.dono, L.P, { tipo: 'entrada', valor: 70, forma: 'pix', categoria: 'Banho e tosa', clienteId: L.tutores.Beto, descricao: 'Banho · Bob', chave: D.novaChaveDeOperacao() });
  const nomeLoja = B.sql(`select nome from petshops where id='${L.P}'`);

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await N.entrar(page, L.emails.dono, SENHA);

    T.secao(`${largura}: Meu pet shop, Seus dados e a conta`);
    await N.ir(page, '/gestao/app/meu-petshop#encerrar-conta');
    await page.waitForSelector('#encerrar-conta', { state: 'visible', timeout: 15000 });
    const grupo = page.locator('#grupo-copia');
    T.ok('o grupo "Seus dados e a conta" com os três cartões', /Seus dados e a conta/.test(await grupo.innerText()) && await grupo.locator('.g-mp-cartao').count() === 3);
    await grupo.scrollIntoViewIfNeeded();
    await foto(page, `meu-petshop-${largura}`);
    const z = await baixar(page, () => grupo.getByRole('button', { name: 'Baixar todos os dados' }).click());
    const nomes = Object.keys(z.arquivos);
    T.ok('baixa um .zip com README.txt', /^maestro-.*\.zip$/.test(z.nome) && nomes.includes('README.txt'), z.nome);
    const esperados = ['clientes.csv', 'pets.csv', 'cuidados-de-saude.csv', 'agendamentos.csv', 'estadias.csv', 'mensalistas.csv', 'pacotes.csv', 'pacotes-vendidos.csv', 'lancamentos.csv', 'vendas.csv',
      'caixas.csv', 'produtos.csv', 'movimentos-de-estoque.csv', 'boletins.csv', 'autorizacoes-de-fotos.csv', 'equipe.csv'];
    T.ok('uma planilha por parte (clientes, pets, saúde, agenda, estadias, creche, pacotes, financeiro, vendas, caixa, estoque, boletins, autorizações, equipe)', esperados.every((n) => nomes.includes(n)), esperados.filter((n) => !nomes.includes(n)));
    T.ok('o README explica cada planilha', esperados.every((n) => z.arquivos['README.txt'].includes(n)));
    T.ok('planilhas em UTF-8 com BOM (acentos certos no Excel)', nomes.filter((n) => n.endsWith('.csv')).every((n) => z.arquivos[n].startsWith('﻿')) && z.arquivos['equipe.csv'].includes('Função'));
    T.ok('só os clientes desta loja', /Beto Lima/.test(z.arquivos['clientes.csv']) && !/Zuleica/.test(Object.values(z.arquivos).join('\n')));
    T.ok('a equipe sem senha nem código de convite', !/senha|token|codigo_convite/i.test(z.arquivos['equipe.csv']) && /Rita Recepção/.test(z.arquivos['equipe.csv']));
    T.ok('fica no registro de pedidos de dados', B.num(`select count(*) from lgpd_registros where petshop_id='${L.P}' and acao='baixou_dados'`) >= 1);
    T.ok('sem rolagem para o lado', await N.rolagemLateral(page) <= 0);

    if (largura === 390) {
      T.secao('390: ficha do tutor, baixar e apagar os dados');
      await N.ir(page, `/gestao/app/clientes?cliente=${L.tutores.Ana}`);
      const cartao = page.locator('.gl-tutor');
      await cartao.waitFor({ timeout: 15000 });
      await cartao.scrollIntoViewIfNeeded();
      await foto(page, 'tutor-390');
      const zt = await baixar(page, () => cartao.getByRole('button', { name: 'Baixar os dados deste tutor' }).click());
      T.ok('o zip da Ana com README e o cadastro dela', zt.arquivos['README.txt'].includes('Ana Souza') && /Ana Souza/.test(zt.arquivos['cadastro.csv'] ?? ''), Object.keys(zt.arquivos));
      T.ok('só os pets dela e nada do Beto', /Thor/.test(zt.arquivos['pets.csv']) && !/Bob|Beto/.test(Object.values(zt.arquivos).join('\n')));
      const antes = soma(L.P);
      await cartao.getByRole('button', { name: 'Apagar dados deste tutor' }).click();
      const folha = page.locator('[role=dialog]').last();
      await folha.waitFor();
      const botao = folha.getByRole('button', { name: 'Apagar os dados' });
      await folha.locator('input').fill('Ana');
      T.ok('com o nome incompleto o botão fica apagado', await botao.isDisabled());
      await folha.locator('input').fill('ana souza');
      await foto(page, 'tutor-apagar-390');
      T.ok('com o nome certo o botão acende', await botao.isEnabled());
      await botao.click();
      await page.waitForFunction(() => document.body.innerText.includes('Cliente removido'), null, { timeout: 15000 });
      T.ok('a ficha vira "Cliente removido"', B.sql(`select nome from clientes where id='${L.tutores.Ana}'`) === 'Cliente removido');
      T.ok('o dinheiro da loja fica igual', soma(L.P) === antes, [antes, soma(L.P)]);
      await foto(page, 'tutor-removido-390');

      T.secao('390: Sair desta equipe');
      const mais = page.locator('nav.g-abas button', { hasText: 'Mais' }).first();
      if (await mais.count()) {
        await mais.click();
        await page.waitForTimeout(400);
        T.ok('o titular não vê "Sair desta equipe"', !(await page.locator('[role=dialog] button', { hasText: 'Sair desta equipe' }).count()));
        await page.keyboard.press('Escape');
      }
      const r = await N.contexto(390, 844);
      await N.entrar(r.page, L.emails.caixa, SENHA);
      await r.page.locator('nav.g-abas button', { hasText: 'Mais' }).first().click();
      const sair = r.page.locator('[role=dialog] button', { hasText: 'Sair desta equipe' });
      await sair.waitFor({ timeout: 10000 });
      await sair.scrollIntoViewIfNeeded();
      await r.page.waitForTimeout(900); await r.page.screenshot({ path: `${FOTOS}lgpd-sair-equipe-390.png` });
      T.ok('a recepção vê "Sair desta equipe" no Mais', await sair.isVisible());
      T.ok('sem erros na tela da recepção', r.erros.length === 0, r.erros);
      await r.ctx.close();
    }

    if (largura === 1366) {
      T.secao('1366: Encerrar e apagar a conta');
      const cartao = page.locator('#encerrar-conta');
      await cartao.scrollIntoViewIfNeeded();
      await cartao.getByRole('button', { name: 'Encerrar e apagar a conta' }).click();
      const folha = page.locator('[role=dialog]').last();
      await folha.waitFor();
      const botao = folha.getByRole('button', { name: /Apagar em 30 dias/ });
      T.ok('sem o nome do pet shop o botão fica apagado', await botao.isDisabled());
      await folha.locator('input').fill(nomeLoja.toLowerCase());
      await foto(page, 'encerrar-1366');
      await botao.click();
      await page.waitForSelector('.gl-marcada', { timeout: 15000 });
      T.ok('pedido registrado, com a data', /Pedido registrado\. A conta vai ser apagada em \d\d\/\d\d\/\d{4}/.test(await page.locator('.gl-marcada').innerText()));
      T.ok('no banco: marcada para daqui a 30 dias', B.num(`select count(*) from exclusoes_conta where petshop_id='${L.P}' and cancelado_em is null and apagado_em is null and apagar_em > now() + interval '29 days'`) === 1);
      await N.ir(page, '/gestao/app');
      const aviso = page.locator('.g-aviso.vermelho', { hasText: 'vai ser apagada' });
      T.ok('o aviso vermelho aparece nas telas', await aviso.isVisible());
      await foto(page, 'aviso-1366');
      const r = await N.contexto(1366, 900);
      await N.entrar(r.page, L.emails.caixa, SENHA);
      T.ok('a recepção também vê o aviso', await r.page.locator('.g-aviso.vermelho', { hasText: 'vai ser apagada' }).isVisible());
      T.recusa('… e o banco não deixa a recepção lançar', await L.sb.caixa.from('clientes').insert({ petshop_id: L.P, nome: 'Novo', telefone: '11966665555' }).select('id'));
      await r.ctx.close();
      await aviso.getByRole('link', { name: 'Ver ou cancelar' }).click();
      await page.waitForSelector('#encerrar-conta .gl-marcada', { state: 'visible', timeout: 15000 });
      await page.locator('#encerrar-conta').getByRole('button', { name: 'Cancelar a exclusão' }).click();
      await page.locator('[role=alertdialog], [role=dialog]').last().getByRole('button', { name: 'Cancelar a exclusão' }).click();
      await page.waitForSelector('#encerrar-conta .gl-marcada', { state: 'detached', timeout: 15000 });
      T.ok('cancelada: o cartão volta ao começo e o aviso some', !(await page.locator('.g-aviso.vermelho', { hasText: 'vai ser apagada' }).count()));
      T.ok('no banco: cancelada e a conta lança de novo', B.sql(`select acesso_liberado('${L.P}')::text`) === 'true');

      T.secao('1366: painel do administrador, aba Dados');
      const uid = B.sql(`select id from auth.users where email='${L.emails.dono}'`);
      B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
      try {
        await N.ir(page, '/gestao/admin', '.g-adm-abas');
        await page.locator('.g-adm-abas button', { hasText: 'Dados' }).click();
        await page.getByRole('button', { name: 'Baixar cópia completa' }).waitFor({ timeout: 15000 });
        T.ok('mostra a última cópia (ou que não houve) e as contas para apagar', /cópia completa/i.test(await page.locator('.g-main').innerText()) && /Contas para apagar/.test(await page.locator('.g-main').innerText()));
        T.ok('a conta cancelada aparece no histórico', (await page.locator('.g-main').innerText()).includes(nomeLoja));
        await foto(page, 'admin-dados-1366', true);
      } finally { B.sql(`delete from admins where user_id='${uid}'`); }
    }

    T.ok(`${largura}: nenhum erro de página`, erros.length === 0, erros);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
