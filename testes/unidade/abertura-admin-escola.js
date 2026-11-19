// Unidade, sem banco e sem rede (abertura do aplicativo, conta de teste no painel e materiais pagos da Escola):
//  - a abertura tenta mais uma vez, quieta, quando o banco demora ou a rede pisca (`comUmaTentativaAMais`, `erroPassageiro`);
//    erro que não é passageiro (sem permissão, PGRST116) não repete; a segunda tentativa não sai se a tela já fechou;
//  - `lerBase` com o banco demorando sobe o erro (para a tentativa quieta) e não lê em pedaços; com a função ausente, lê;
//  - a abertura só explica a demora aos 12 s (num 4G fraco, 8 s era cedo demais);
//  - Escola: com a venda desligada, nenhum material pago na estante do cliente nem no manual; a chave liga de volta;
//    o painel do administrador continua com todos.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lib } = require('../lib/app');
const B = require('../lib/base');
const T = require('../lib/teste')('unidade-abertura-admin-escola');
const A = lib('abertura');
const R = lib('reservado');
const E = lib('escola');
const M = lib('manual');
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.stack || e.message); } };
const semEsperar = () => Promise.resolve();
const TEMPO = { code: '57014', message: 'canceling statement due to statement timeout' };

(async () => T.rodar(async () => {
  T.secao('o que é passageiro');
  await t('tempo esgotado do banco, pedido preso, gateway, rede e banco cheio: passageiros', () => {
    for (const e of [TEMPO, { message: 'tempo esgotado: o servidor não respondeu a tempo' }, { message: 'TypeError: Failed to fetch' },
      { message: 'Load failed' }, { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' },
      { message: '504 Gateway Time-out' }, { message: 'Service Unavailable' }, { code: '08006', message: 'connection failure' },
      { name: 'TempoEsgotado', message: 'x' }, { name: 'AbortError', message: 'The operation was aborted.' }]) assert.equal(A.erroPassageiro(e), true, JSON.stringify(e));
  });
  await t('sem permissão, linha que não existe (PGRST116), função ausente: não são passageiros', () => {
    for (const e of [{ code: '42501', message: 'permission denied for table petshops' }, { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' },
      { code: 'PGRST202', message: 'Could not find the function public.gestao_base' }, null, undefined, { message: 'pet shop' }]) assert.equal(A.erroPassageiro(e), false, JSON.stringify(e));
  });

  T.secao('mais uma tentativa, quieta');
  await t('primeira leitura cortada por demora ({ error }): tenta de novo e devolve a segunda', async () => {
    let n = 0, repetiu = null;
    const r = await A.comUmaTentativaAMais(async () => (++n === 1 ? { data: null, error: TEMPO } : { data: [{ id: 'a' }], error: null }), { esperar: semEsperar, aoRepetir: (e) => { repetiu = e; } });
    assert.equal(n, 2); assert.deepEqual(r.data, [{ id: 'a' }]); assert.equal(repetiu, TEMPO);
  });
  await t('primeira leitura lança erro de rede: tenta de novo', async () => {
    let n = 0;
    const r = await A.comUmaTentativaAMais(async () => { if (++n === 1) throw new TypeError('Failed to fetch'); return 'ok'; }, { esperar: semEsperar });
    assert.equal(r, 'ok'); assert.equal(n, 2);
  });
  await t('espera um pouco antes da segunda (padrão 1,2 s), nunca mais de duas vezes', async () => {
    let n = 0; const esperas = [];
    const r = await A.comUmaTentativaAMais(async () => { n++; return { error: TEMPO }; }, { esperar: (ms) => { esperas.push(ms); return Promise.resolve(); } });
    assert.equal(n, 2); assert.deepEqual(esperas, [A.ESPERA_ANTES_DE_TENTAR_DE_NOVO_MS]); assert.equal(r.error, TEMPO);
    assert.ok(A.ESPERA_ANTES_DE_TENTAR_DE_NOVO_MS >= 500 && A.ESPERA_ANTES_DE_TENTAR_DE_NOVO_MS <= 3000);
  });
  await t('segunda que também lança: o erro dela sobe', async () => {
    let n = 0;
    await assert.rejects(A.comUmaTentativaAMais(async () => { n++; throw new Error(n === 1 ? 'Failed to fetch' : 'Failed to fetch de novo'); }, { esperar: semEsperar }), /de novo/);
    assert.equal(n, 2);
  });
  await t('erro que não é passageiro (sem permissão, PGRST116): uma vez só', async () => {
    for (const e of [{ code: '42501', message: 'permission denied' }, { code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' }]) {
      let n = 0;
      const r = await A.comUmaTentativaAMais(async () => { n++; return { error: e }; }, { esperar: semEsperar });
      assert.equal(n, 1); assert.equal(r.error, e);
    }
    let n = 0;
    await assert.rejects(A.comUmaTentativaAMais(async () => { n++; throw new Error('pet shop'); }, { esperar: semEsperar }), /pet shop/);
    assert.equal(n, 1);
  });
  await t('deu certo de primeira: uma ida só', async () => {
    let n = 0;
    const r = await A.comUmaTentativaAMais(async () => { n++; return { data: 1, error: null }; }, { esperar: semEsperar });
    assert.equal(n, 1); assert.equal(r.data, 1);
  });
  await t('a tela fechou durante a espera: não faz a segunda', async () => {
    let n = 0, viva = true;
    const r = await A.comUmaTentativaAMais(async () => { n++; return { error: TEMPO }; }, { esperar: () => { viva = false; return Promise.resolve(); }, seguir: () => viva });
    assert.equal(n, 1); assert.equal(r.error, TEMPO);
  });

  T.secao('lerBase: banco demorando não vira 3 leituras');
  const falso = (erro) => {
    const chamadas = [];
    const sb = {
      rpc: (f) => { chamadas.push(`rpc:${f}`); const p = Promise.resolve({ data: null, error: f === 'gestao_base' ? erro : { code: 'PGRST202', message: 'x' } }); p.order = () => ({ range: () => p }); return p; },
      from: (tab) => { chamadas.push(`from:${tab}`); const q = new Proxy({}, { get: (_, k) => (k === 'then' ? (ok) => ok({ data: tab === 'petshops' ? { id: 'p', nome: 'Loja' } : [], error: null }) : () => q) }); return q; },
    };
    return { sb, chamadas };
  };
  await t('gestao_base cortada por demora: devolve o erro, sem ler pet shop, equipe e serviços em pedaços', async () => {
    const { sb, chamadas } = falso(TEMPO);
    const b = await R.lerBase(sb, 'p');
    assert.equal(b.petshop, null); assert.ok(b.erro && /statement timeout/.test(b.erro.message), JSON.stringify(b.erro));
    assert.deepEqual(chamadas, ['rpc:gestao_base']);
    assert.equal(A.erroPassageiro(b.erro), true);
  });
  await t('gestao_base que não existe neste banco: lê em pedaços, como antes', async () => {
    const { sb, chamadas } = falso({ code: 'PGRST202', message: 'Could not find the function public.gestao_base(p) in the schema cache' });
    const b = await R.lerBase(sb, 'p');
    assert.equal(b.erro, null); assert.equal(b.petshop && b.petshop.nome, 'Loja');
    assert.ok(chamadas.includes('from:petshops'), chamadas.join(' '));
  });

  T.secao('quando a abertura explica a demora');
  await t('aviso "Ainda buscando a sua conta" aos 12 s (antes 8 s), com a tentativa quieta e o "Tentar de novo"', () => {
    const fonte = fs.readFileSync(path.join(B.RAIZ, 'src/components/gestao/contexto.tsx'), 'utf8');
    assert.match(fonte, /export const DEMORA_DA_ABERTURA_MS = 12_000;/);
    assert.match(fonte, /comUmaTentativaAMais\(\(\) => sb\.rpc\("entrar"\)/);
    assert.match(fonte, /comUmaTentativaAMais\(\(\) => lerBase\(sb, petshopId\)/);
    assert.match(fonte, /Tentar de novo/);
    assert.doesNotMatch(fonte, /\.single\(\)/);
  });
  await t('nenhum .single() na abertura (contexto, base, opções, aceites, exclusão, assinatura)', () => {
    for (const f of ['src/components/gestao/contexto.tsx', 'src/lib/gestao/reservado.ts', 'src/lib/gestao/opcoes.ts', 'src/components/gestao/reaceite.tsx', 'src/components/gestao/casca.tsx', 'src/lib/gestao/registro-acesso.ts', 'src/lib/gestao/planos.ts']) {
      const p = path.join(B.RAIZ, f);
      if (fs.existsSync(p)) assert.doesNotMatch(fs.readFileSync(p, 'utf8'), /\.single\(\)/, f);
    }
  });

  T.secao('Escola: materiais pagos fora da loja');
  await t('a chave está desligada e a estante do cliente não tem material pago', () => {
    assert.equal(E.MATERIAIS_PAGOS_A_VENDA, false);
    assert.ok(E.MATERIAIS.length >= 6, `${E.MATERIAIS.length} materiais`);
    assert.ok(E.MATERIAIS_NA_LOJA.every((m) => !(m.preco > 0)), E.MATERIAIS_NA_LOJA.map((m) => m.nome).join(', '));
    assert.equal(E.MATERIAIS_NA_LOJA.length, E.MATERIAIS.filter((m) => !(m.preco > 0)).length);
  });
  await t('material gratuito continua; ligando a chave, os pagos voltam (uma chave só)', () => {
    assert.equal(E.foraDaLoja({ preco: 0 }), false);
    assert.equal(E.foraDaLoja({ preco: 49.9 }), true);
    assert.equal(E.foraDaLoja({ preco: 49.9 }, true), false);
    assert.equal(E.materiaisNaLoja(true).length, E.MATERIAIS.length);
  });
  await t('manual (e a Ajuda, que lê dele): o tópico da Escola fala só das aulas, sem compra nem "em breve"', () => {
    const top = M.TOPICOS.find((x) => x.id === 'escola');
    assert.ok(top, 'tópico escola');
    const texto = JSON.stringify([top.passos, top.dicas, top.atencao]);
    assert.doesNotMatch(texto, /vendidos à parte|comprou|comprar um material|Meus materiais|em breve/i, texto);
    assert.match(texto, /Aulas gratuitas/);
  });
  await t('tela Escola: estante e textos pelo que está à venda; sem "em breve"', () => {
    const fonte = fs.readFileSync(path.join(B.RAIZ, 'src/app/(gestao)/gestao/app/escola/page.tsx'), 'utf8');
    assert.match(fonte, /MATERIAIS_NA_LOJA\.filter/);
    assert.doesNotMatch(fonte, /em breve/i);
  });
  await t('painel do administrador: todos os materiais, com o aviso "escondido da loja até ter PDF e o aviso de pagamento"', () => {
    const fonte = fs.readFileSync(path.join(B.RAIZ, 'src/components/gestao/admin/escola.tsx'), 'utf8');
    assert.match(fonte, /MATERIAIS\.map/);
    assert.match(fonte, /scondido da loja até ter PDF e o aviso de pagamento/);
  });
}))();
