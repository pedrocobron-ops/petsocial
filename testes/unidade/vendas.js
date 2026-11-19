// Unidade: rodada 9 (N10), vendas. Sem banco.
//   - link de pagamento: o cupom entra SEM tirar o e-mail preenchido nem a marca assinada do pet shop (linkDoCheckout);
//   - o plano que serve pelo número de pessoas com login (conselhoDoPlano): não empurra o Equipe para quem cabe no Solo;
//   - de onde veio o pet shop: ?v=vendedor e utm_* (origemDaBusca, juntarOrigem) e o resumo por vendedor do painel;
//   - quem vende: só aparece com nome e documento; nada escrito no código (vendedor.ts);
//   - Nina: sabe a devolução em 7 dias, não nega cupom, não diz forma de pagamento que não conhece, não fala "novo";
//     o botão do WhatsApp aparece quando ela manda para a equipe (mandaParaAEquipe);
//   - Ajuda: para o dono, nunca "isso é com o dono" (quemPergunta);
//   - textos: nenhum preço escrito à mão na página, na Assinatura nem na Nina; o kit de vendas bate com planos.ts;
//   - imagem de compartilhar: 1200 x 630, leve; título e descrição do cadastro dentro do limite;
//   - Hoje: "Faltam R$ X para cobrir as contas fixas deste mês" (fraseDasContasFixas).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('../lib/base');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-vendas');
const P = lib('planos');
const O = lib('origem');
const V = lib('vendedor');
const N = lib('vendas');
const A = lib('ajuda');
const FC = lib('falta-cobrir');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const reais = (n) => `R$ ${n.toFixed(2).replace('.', ',').replace(',00', '')}`;

(async () => T.rodar(async () => {
  T.secao('link de pagamento com cupom');
  const base = 'https://pay.cakto.com.br/abc123';
  const cb = '11111111-2222-3333-4444-555555555555.0123456789abcdef0123456789abcdef';
  t('sem cupom: e-mail duas vezes e a marca; nada de coupon', () => {
    const u = new URL(P.linkDoCheckout(base, 'dona@loja.com', cb));
    assert.equal(u.searchParams.get('email'), 'dona@loja.com');
    assert.equal(u.searchParams.get('confirmEmail'), 'dona@loja.com');
    assert.equal(u.searchParams.get('callback'), cb);
    assert.equal(u.searchParams.has('coupon'), false);
  });
  t('com cupom: o cupom entra e o e-mail e a marca continuam', () => {
    const u = new URL(P.linkDoCheckout(base, 'dona@loja.com', cb, ' ana10 '));
    assert.equal(u.searchParams.get('coupon'), 'ANA10');
    assert.equal(u.searchParams.get('email'), 'dona@loja.com');
    assert.equal(u.searchParams.get('confirmEmail'), 'dona@loja.com');
    assert.equal(u.searchParams.get('callback'), cb);
    assert.equal(u.origin + u.pathname, base);
  });
  t('link que já tinha parâmetros: nada se perde', () => {
    const u = new URL(P.linkDoCheckout(base + '?utm_source=app', 'a@b.co', cb, 'BIA15'));
    assert.deepEqual([u.searchParams.get('utm_source'), u.searchParams.get('coupon'), u.searchParams.get('callback')], ['app', 'BIA15', cb]);
  });
  t('link cadastrado que não é endereço: junta do mesmo jeito', () => {
    const s = P.linkDoCheckout('pay.cakto/x', 'a@b.co', cb, 'ana10');
    assert.ok(s.includes('email=a%40b.co') && s.includes('callback=') && s.endsWith('coupon=ANA10'), s);
  });
  t('limparCupom: maiúsculas, sem espaço nem acento; lixo e uma letra só viram vazio', () => {
    assert.equal(P.limparCupom(' ana-10 '), 'ANA-10');
    assert.equal(P.limparCupom('josé 15'), 'JOSE15');
    assert.equal(P.limparCupom('a'), '');
    assert.equal(P.limparCupom('&coupon=x'), 'COUPONX');
    assert.equal(P.limparCupom(null), '');
    assert.equal(P.limparCupom('x'.repeat(80)).length, 40);
  });
  t('mensagem para assinar pelo WhatsApp leva plano, período, pet shop, e-mail e cupom', () => {
    const m = P.textoParaAssinar('equipe', 'semestral', 'Banho & Cia', 'dona@loja.com', 'ana15');
    for (const pedaco of ['Equipe', '6 meses', 'Banho & Cia', 'dona@loja.com', 'ANA15']) assert.ok(m.includes(pedaco), pedaco);
    assert.ok(!/R\$/.test(m), 'sem preço escrito');
    assert.ok(!P.textoParaAssinar('solo', 'mensal', 'X').includes('cupom'));
  });

  T.secao('plano que serve');
  t('1 pessoa: Solo; 2 e 3: Equipe; 4 a 6: Pet shop', () => {
    assert.deepEqual([1, 2, 3, 4, 6].map((n) => P.conselhoDoPlano(n).plano.id), ['solo', 'equipe', 'equipe', 'petshop', 'petshop']);
    assert.equal(P.conselhoDoPlano(0).plano.id, 'solo');
  });
  t('quem só aparece na agenda não conta: o conselho do Solo diz isso', () => {
    const c = P.conselhoDoPlano(1);
    assert.ok(c.cabe && /Solo/.test(c.texto) && /só aparece na agenda/.test(c.texto), c.texto);
  });
  t('7 pessoas com login: não cabe em plano nenhum, e a tela diz o que fazer', () => {
    const c = P.conselhoDoPlano(7);
    assert.equal(c.cabe, false);
    assert.ok(/Equipe/.test(c.texto) && /6 logins/.test(c.texto), c.texto);
  });
  t('as frases de venda falam da devolução em 7 dias, do fim do teste e da tela da Cakto', () => {
    assert.ok(P.TEXTOS_ASSINAR.arrependimento.includes(`${P.DIAS_DE_ARREPENDIMENTO} dias`) && /3 e 6 meses/.test(P.TEXTOS_ASSINAR.arrependimento));
    assert.ok(/Nada é cobrado/.test(P.TEXTOS_ASSINAR.nadaCobrado));
    assert.ok(/aparecem na tela da Cakto/.test(P.TEXTOS_ASSINAR.pagamento) && !/pix|cartão|boleto/i.test(P.TEXTOS_ASSINAR.pagamento));
  });

  T.secao('de onde veio o pet shop');
  t('?v=Ana&utm_source=instagram', () => assert.deepEqual(O.origemDaBusca('?v=Ana&utm_source=instagram&utm_campaign=novembro&x=1'), { vendedor: 'ana', utm: { utm_source: 'instagram', utm_campaign: 'novembro' } }));
  t('sem nada: null; código com lixo é ignorado', () => {
    assert.equal(O.origemDaBusca('?x=1'), null);
    assert.equal(O.origemDaBusca('?v=<script>'), null);
    assert.equal(O.limparVendedor('José_2'), 'jose_2');
    assert.equal(O.limparVendedor('a b'), '');
  });
  t('o primeiro vendedor fica; utm novo só entra se não havia', () => {
    assert.deepEqual(O.juntarOrigem({ vendedor: 'ana', utm: {} }, { vendedor: 'bia', utm: { utm_source: 'google' } }), { vendedor: 'ana', utm: { utm_source: 'google' } });
    assert.deepEqual(O.juntarOrigem({ vendedor: '', utm: { utm_source: 'ig' } }, { vendedor: 'bia', utm: { utm_source: 'google' } }), { vendedor: 'bia', utm: { utm_source: 'ig' } });
    assert.deepEqual(O.juntarOrigem(null, { vendedor: 'bia', utm: {} }), { vendedor: 'bia', utm: {} });
  });
  t('resumo por vendedor: cadastros, em teste, pagantes, pagamentos e cupons', () => {
    const loja = (id, vendedor, status) => ({ id, nome: id, criado_em: '2026-11-01', status, plano: 'solo', meses: 1, teste_ate: '2026-11-08', vendedor, utm: {}, quer_ajuda: false, telefone: null, cupom: null });
    const pago = (id, vendedor, cupom, valor) => ({ id, recebido_em: '2026-11-05', evento: 'purchase_approved', petshop_id: 'x', nome: 'x', vendedor, cupom, valor, desconto: null, plano: 'solo:1' });
    const r = O.resumoPorVendedor([loja('a', 'ana', 'ativa'), loja('b', 'ana', 'teste'), loja('c', 'bia', 'teste'), loja('d', null, 'ativa')],
      [pago(1, 'ana', 'ANA10', 71.1), pago(2, 'ana', 'ANA10', 79), pago(3, null, 'SOLTO', 79)]);
    assert.deepEqual(r, [
      { vendedor: 'ana', cadastros: 2, testando: 1, pagantes: 1, pagamentos: 2, valor: 150.1, cupons: ['ANA10'] },
      { vendedor: 'bia', cadastros: 1, testando: 1, pagantes: 0, pagamentos: 0, valor: 0, cupons: [] },
    ]);
  });

  T.secao('quem vende');
  t('só aparece com nome E documento', () => {
    assert.equal(V.temVendedor(V.vendedorDe({ nome: 'Fulana' })), false);
    assert.equal(V.temVendedor(V.vendedorDe({ documento: '1' })), false);
    assert.equal(V.temVendedor(V.vendedorDe(null)), false);
    assert.equal(V.temVendedor(V.vendedorDe({ nome: ' Empresa de Teste Ltda ', documento: '00.000.000/0001-00' })), true);
  });
  t('a linha diz CPF ou CNPJ pelo número de dígitos, com endereço e contato se houver', () => {
    assert.equal(V.linhaDoVendedor(V.vendedorDe({ nome: 'Pessoa de Teste', documento: '000.000.000-00' })), 'Vendido por Pessoa de Teste, CPF 000.000.000-00.');
    assert.equal(V.linhaDoVendedor(V.vendedorDe({ nome: 'Empresa de Teste Ltda.', documento: '00.000.000/0001-00', endereco: 'Santos/SP', contato: 'oi@teste.local' })),
      'Vendido por Empresa de Teste Ltda, CNPJ 00.000.000/0001-00. Santos/SP. Contato: oi@teste.local.');
    assert.equal(V.rotuloDoDocumento('123'), 'Documento');
  });
  t('nenhum nome nem documento escrito no código', () => {
    const fonte = ler('src', 'lib', 'gestao', 'vendedor.ts') + ler('src', 'app', '(gestao)', 'gestao', 'page.tsx') + ler('src', 'app', '(gestao)', 'gestao', 'app', 'assinatura', 'page.tsx');
    assert.ok(!/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(fonte.replace(/000\.000\.000-00/g, '')), 'CPF escrito');
    assert.ok(!/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(fonte), 'CNPJ escrito');
  });

  T.secao('Nina');
  const I = N.INSTRUCOES_VENDAS;
  t('sabe a devolução em 7 dias, inclusive nos planos de 3 e 6 meses', () => assert.ok(/Devolução: quem pede o cancelamento em até 7 dias depois do primeiro pagamento recebe de volta o valor inteiro/.test(I) && /inclusive nos planos de 3 e 6 meses/.test(I)));
  t('nada é cobrado no fim do teste, e depois a conta fica só para consulta', () => assert.ok(/Nada é cobrado sozinho no fim do teste/.test(I) && /fica só para consulta/.test(I)));
  t('pagamento: as formas aparecem na tela da Cakto; ela não afirma Pix nem cartão', () => assert.ok(/As formas de pagamento aparecem na tela da Cakto/.test(I) && /não afirme que aceita Pix, cartão, boleto ou parcelamento/.test(I)));
  t('cupom: existe, é da equipe, digitado ao assinar; nunca nega, nunca inventa', () => assert.ok(/cupom existe/.test(I) && /nunca diga que não existe cupom/.test(I) && /Nunca diga o código nem o valor de um cupom/.test(I) && /Tenho um cupom/.test(I)));
  t('plano: o menor que serve; ajudante que só atende não pede o Equipe', () => assert.ok(/MENOR plano que serve/.test(I) && /ela vai mexer no sistema ou só atender\?/.test(I) && /o Solo basta/.test(I)));
  t('"vocês são novos?": nem idade nem novidade', () => assert.ok(/Não diga há quanto tempo o sistema existe/.test(I) && /não invente tempo de mercado nem diga que é antigo/.test(I)));
  t('sem "(novo)" nos fatos e com o número certo de tópicos do manual', () => {
    assert.ok(!/\(novo\)/.test(I));
    assert.ok(!/150 tópicos/.test(I) && /mais de 200 tópicos/.test(I));
    assert.ok(lib('manual').TOPICOS.length > 200, String(lib('manual').TOPICOS.length));
  });
  t('os preços dos Fatos saem de planos.ts', () => { for (const p of P.PLANOS) for (const pe of P.PERIODOS) assert.ok(I.includes(reais(P.ofertaDe(p.id, pe.id).preco)), `${p.id} ${pe.id}`); });
  t('o botão do WhatsApp aparece quando a resposta manda para a equipe', () => {
    assert.equal(N.mandaParaAEquipe('Isso a nossa equipe confirma pelo WhatsApp.'), true);
    assert.equal(N.mandaParaAEquipe('Pode chamar no (13) 99137-6169.'), true);
    assert.equal(N.mandaParaAEquipe('A mensagem sai pronta para o seu WhatsApp. Você só aperta enviar.'), false);
    assert.equal(N.mandaParaAEquipe('O plano Solo custa R$ 79 por mês.'), false);
  });

  T.secao('Ajuda para o dono');
  t('dono: nunca "é com o dono"', () => { const q = A.quemPergunta('dono'); assert.ok(/DONO/.test(q) && /Nunca diga que algo "é com o dono"/.test(q)); });
  t('equipe: continua dizendo quem libera', () => assert.ok(/não é o dono/.test(A.quemPergunta('funcionario')) && /não é o dono/.test(A.quemPergunta(null))));
  t('a rota manda o bloco com o papel de quem pergunta', () => assert.ok(/quemPergunta\(eu\.papel\)/.test(ler('src', 'app', 'api', 'gestao', 'ajuda', 'route.ts'))));

  T.secao('textos sem preço escrito à mão e sem "em breve"');
  const telas = {
    pagina: ler('src', 'app', '(gestao)', 'gestao', 'page.tsx'),
    planosVenda: ler('src', 'components', 'gestao', 'planos-venda.tsx'),
    destaques: ler('src', 'components', 'gestao', 'novidades-venda.tsx'),
    assinatura: ler('src', 'app', '(gestao)', 'gestao', 'app', 'assinatura', 'page.tsx'),
    fimDoTeste: ler('src', 'components', 'gestao', 'fim-do-teste.tsx'),
    casca: ler('src', 'components', 'gestao', 'casca.tsx'),
    nina: ler('src', 'lib', 'gestao', 'vendas.ts'),
    cadastro: ler('src', 'app', '(gestao)', 'gestao', 'criar-conta', 'layout.tsx'),
  };
  const precos = P.PLANOS.flatMap((p) => P.PERIODOS.map((pe) => String(P.ofertaDe(p.id, pe.id).preco)));
  for (const [nome, fonte] of Object.entries(telas)) {
    t(`${nome}: nenhum preço dos planos escrito no texto`, () => { for (const v of precos) assert.ok(!new RegExp(`R\\$\\s?${v}(?![\\d,])`).test(fonte), `R$ ${v}`); });
    t(`${nome}: sem "em breve", "ainda não abriu", "lançamento" nem "primeiros clientes" na tela`, () => {
      const semRegras = fonte.split('\n').filter((l) => !/não diga|nunca diga|Nunca crie|nem "primeiros clientes"/i.test(l)).join('\n');
      assert.ok(!/Disponível em breve|ainda não abriu|até a assinatura abrir|preço de lançamento|primeiros clientes/i.test(semRegras));
    });
  }
  t('página de venda: título até 60 letras', () => {
    const m = /const TITULO = "([^"]+)";/.exec(telas.pagina);
    assert.ok(m && m[1].length <= 60, m?.[1]);
  });
  t('página de venda: a descrição cabe em 155 letras com o preço de hoje', () => {
    const m = /const DESCRICAO = `([^`]+)`;/.exec(telas.pagina);
    assert.ok(m);
    const pronta = m[1].replace('${DESDE}', reais(P.PLANOS[0].preco));
    assert.ok(pronta.length <= 155 && !pronta.includes('${'), `${pronta.length}: ${pronta}`);
  });
  t('cadastro: título até 60 e descrição até 155', () => {
    const ti = /const TITULO = "([^"]+)";/.exec(telas.cadastro), d = /const DESCRICAO = "([^"]+)";/.exec(telas.cadastro);
    assert.ok(ti && ti[1].length <= 60, String(ti?.[1].length));
    assert.ok(d && d[1].length <= 155, String(d?.[1].length));
  });
  t('a página tem as quatro partes na ordem: exemplo do boletim, preços, o que não faz, o resto', () => {
    const corpo = telas.pagina.slice(telas.pagina.indexOf('export default async function Pagina'));
    const ordem = ['<NovidadesVenda parte="boletim" />', 'id="plano"', 'id="nao-faz"', 'id="diferencas"', 'id="mozart"', '<NovidadesVenda parte="resto" />', 'id="funcoes"', 'id="todas-as-funcoes"', 'id="perguntas"'].map((x) => corpo.indexOf(x));
    assert.ok(ordem.every((p) => p > 0), JSON.stringify(ordem));
    assert.deepEqual(ordem, [...ordem].sort((a, b) => a - b));
  });
  t('a nota de versão "Mozart mais rápido" saiu da página', () => assert.ok(!/Mozart mais rápido/.test(telas.pagina)));

  T.secao('imagem de compartilhar');
  const imagem = path.join(RAIZ, 'public', 'gestao', 'compartilhar.jpg');
  t('existe, é JPEG e pesa menos de 300 KB', () => {
    const b = fs.readFileSync(imagem);
    assert.ok(b[0] === 0xff && b[1] === 0xd8, 'não é JPEG');
    assert.ok(b.length < 300 * 1024, String(b.length));
  });
  await (async () => {
    try {
      const sharp = require(path.join(RAIZ, 'node_modules', 'sharp'));
      const m = await sharp(imagem).metadata();
      T.ok('mede 1200 x 630', m.width === 1200 && m.height === 630, [m.width, m.height]);
    } catch (e) { T.ok('mede 1200 x 630', false, e.message); }
  })();
  t('o script que gera a imagem não escreve preço nela', () => assert.ok(!/R\$/.test(ler('scripts', 'gerar-imagem-de-compartilhar.mjs').split('\n').filter((l) => !l.startsWith('//')).join('\n'))));

  T.secao('kit de vendas');
  const kit = ler('docs', 'vendas', 'kit-de-vendas.md');
  t('a regra da linha 14 não manda esconder o que o sistema não faz', () => {
    assert.ok(!/Não dizer o que o sistema não faz/.test(kit));
    assert.ok(/Não afirmar que o sistema faz o que ele não faz\. E dizer com franqueza/.test(kit));
  });
  t('sem "(novo)" e sem "a gente fez um sistema"', () => assert.ok(!/\(novo\)/.test(kit) && !/A gente fez um sistema/.test(kit)));
  t('sem "em breve"', () => assert.ok(!/em breve/i.test(kit)));
  t('os preços do kit são os de planos.ts', () => {
    for (const p of P.PLANOS) for (const pe of P.PERIODOS) assert.ok(kit.includes(reais(P.ofertaDe(p.id, pe.id).preco)), `${p.nome} ${pe.nome}`);
    // todo "R$ 79/129/179" solto no kit tem de ser preço mensal de algum plano
    const mensais = new Set(P.PLANOS.map((p) => p.preco));
    for (const m of kit.matchAll(/R\$ (\d+) por mês/g)) assert.ok(mensais.has(Number(m[1])), m[0]);
  });
  t('os valores com cupom (10%, 15%, 20%) são a conta certa sobre planos.ts', () => {
    const br = (n) => `R$ ${(Math.round(n * 100) / 100).toFixed(2).replace('.', ',')}`;
    for (const p of P.PLANOS) {
      assert.ok(kit.includes(br(p.preco * 0.9)), `10% ${p.nome}`);
      assert.ok(kit.includes(br(p.preco * 0.8)), `20% ${p.nome}`);
      assert.ok(kit.includes(br(P.ofertaDe(p.id, 'trimestral').preco * 0.85)), `15% 3 meses ${p.nome}`);
      assert.ok(kit.includes(br(P.ofertaDe(p.id, 'semestral').preco * 0.85)), `15% 6 meses ${p.nome}`);
    }
  });
  t('política de cupom: só na primeira cobrança, um código por vendedor, 20% só com a dona, validade real', () => {
    assert.ok(/só na primeira cobrança/.test(kit) && /Um código por vendedor e por nível/.test(kit) && /só com aprovação da dona/.test(kit) && /data de validade gravada na Cakto/.test(kit));
  });
  t('tem as mensagens do teste (dia 0 ou 1, dia 3 ou 4, dia 6 ou 7), a devolução e a lista do que nunca dizer', () => {
    assert.ok(/Dia 0 ou 1/.test(kit) && /Dia 3 ou 4/.test(kit) && /Dia 6 ou 7/.test(kit));
    assert.ok(/devolvemos o primeiro pagamento inteiro/.test(kit) && /O que nunca dizer/.test(kit));
    assert.ok(/Vocês são novos\?/.test(kit) && /\?v=seucodigo/.test(kit));
  });
  t('os 11 números do funil', () => {
    const parte = kit.slice(kit.indexOf('## h) Os 11 números do funil'), kit.indexOf('## i)'));
    assert.equal((parte.match(/^\d+\. \*\*/gm) ?? []).length, 11);
  });

  T.secao('Hoje: contas fixas');
  t('faltam R$ 2.623,00', () => assert.equal(FC.fraseDasContasFixas({ total_mensal: 4759, faturamento_mes: 2136, falta: 2623 }).titulo.replace(/ /g, ' '), 'Faltam R$ 2.623,00 para cobrir as contas fixas deste mês'));
  t('já cobriu', () => assert.deepEqual(FC.fraseDasContasFixas({ total_mensal: 1000, faturamento_mes: 1500, falta: 0 }), { titulo: 'O faturamento deste mês já cobre as contas fixas', cobriu: true }));
  t('sem contas fixas: não aparece', () => assert.equal(FC.fraseDasContasFixas({ total_mensal: 0, faturamento_mes: 500, falta: 0 }), null));
}))();
