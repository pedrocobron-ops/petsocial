// Unidade (rodada 9, desempenho e operação), sem banco e sem rede:
//  - a rota da faxina aceita o segredo da Vercel Cron (CRON_SECRET) ou o próprio (GESTAO_FAXINA_SEGREDO); curto demais não vale;
//  - quando a leitura da tela Hoje (`gestao_hoje`) falha, só lê do jeito antigo (25 consultas) se a função não existe ou quebrou
//    por dentro; tempo esgotado, banco cheio ou internet fora sobem o erro (`leituraAntigaVale`);
//  - a abertura do link do cliente pelo servidor: uma ida ao banco (`link_inicial`), as oito de antes só em banco sem a função,
//    nenhuma repetição quando o banco demorou, e o resultado guardado por alguns segundos só para link que existe.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-operacao');
const F = lib('faxina');
const H = lib('hoje-reserva');
const S = lib('link-servidor');
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const pedido = (h) => new Request('http://x/api/gestao/faxina', { headers: h });
function comEnv(v, f) {
  const antes = {};
  for (const k of Object.keys(v)) { antes[k] = process.env[k]; if (v[k] === undefined) delete process.env[k]; else process.env[k] = v[k]; }
  const volta = () => { for (const k of Object.keys(v)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; } };
  try { const r = f(); if (r && typeof r.then === 'function') return r.finally(volta); volta(); return r; } catch (e) { volta(); throw e; }
}

(async () => T.rodar(async () => {
  T.secao('segredos da faxina');
  const cron = 'c'.repeat(24), proprio = 'p'.repeat(40);
  await t('só CRON_SECRET configurado: a chamada da Vercel Cron passa (antes era recusada)', () => comEnv({ CRON_SECRET: cron, GESTAO_FAXINA_SEGREDO: undefined }, () => {
    assert.deepEqual(F.segredosDaFaxina(), [cron]);
    assert.equal(F.pedidoAutorizado(pedido({ authorization: `Bearer ${cron}` }), F.segredosDaFaxina()), true);
    assert.equal(F.segredoDaFaxina(), cron);
  }));
  await t('os dois configurados e diferentes: qualquer um dos dois passa', () => comEnv({ CRON_SECRET: cron, GESTAO_FAXINA_SEGREDO: proprio }, () => {
    const s = F.segredosDaFaxina();
    assert.equal(s.length, 2);
    assert.equal(F.pedidoAutorizado(pedido({ authorization: `Bearer ${cron}` }), s), true);
    assert.equal(F.pedidoAutorizado(pedido({ 'x-gestao-faxina': proprio }), s), true);
    assert.equal(F.pedidoAutorizado(pedido({ authorization: `Bearer ${cron}x` }), s), false);
    assert.equal(F.pedidoAutorizado(pedido({}), s), false);
  }));
  await t('segredo curto não vale (CRON_SECRET com menos de 16, o próprio com menos de 32); sem nenhum, a rota não roda', () => comEnv({ CRON_SECRET: 'curto', GESTAO_FAXINA_SEGREDO: 'x'.repeat(31) }, () => {
    assert.deepEqual(F.segredosDaFaxina(), []);
    assert.equal(F.segredoDaFaxina(), null);
    assert.equal(F.pedidoAutorizado(pedido({ authorization: 'Bearer curto' }), F.segredosDaFaxina()), false);
  }));
  await t('chamada que parece agendada (Vercel Cron ou com segredo) vale registro quando é recusada; visita solta não', () => {
    assert.equal(F.pareceAgendada(pedido({ 'user-agent': 'vercel-cron/1.0' })), true);
    assert.equal(F.pareceAgendada(pedido({ authorization: 'Bearer qualquer' })), true);
    assert.equal(F.pareceAgendada(pedido({ 'user-agent': 'Mozilla/5.0' })), false);
  });

  T.secao('tela Hoje: quando ler do jeito antigo');
  await t('função que não existe neste banco: lê do jeito antigo', () => {
    assert.equal(H.leituraAntigaVale({ code: 'PGRST202', message: 'Could not find the function public.gestao_hoje(a, p) in the schema cache' }), true);
    assert.equal(H.leituraAntigaVale({ code: '42883', message: 'function gestao_hoje(uuid, jsonb) does not exist' }), true);
    assert.equal(H.leituraAntigaVale(null), true);
  });
  await t('função que quebrou por dentro: lê do jeito antigo (a tela continua funcionando)', () => {
    assert.equal(H.leituraAntigaVale({ code: '42703', message: 'column x does not exist' }), true);
    assert.equal(H.leituraAntigaVale({ code: '22P02', message: 'invalid input syntax for type uuid' }), true);
  });
  await t('tempo esgotado, banco cheio, servidor fora e internet fora: NÃO dispara as 25 consultas', () => {
    for (const e of [
      { code: '57014', message: 'canceling statement due to statement timeout' },
      { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' },
      { code: '53300', message: 'sorry, too many clients already' },
      { code: '08006', message: 'connection failure' },
      { code: '', message: 'TypeError: Failed to fetch' },
      { code: '', message: 'upstream request timeout' },
      { code: '', message: '504 Gateway Time-out' },
      { code: '', message: 'Service Unavailable' },
    ]) assert.equal(H.leituraAntigaVale(e), false, JSON.stringify(e));
  });

  T.secao('link do cliente: uma ida ao banco e o resultado guardado');
  const partes = {
    link_info: { nome: 'Pet Teste', hotel: true, tema: 'vinho' }, link_nome: ' Pet Teste ', link_google: 'https://g.page/x', link_promocoes: [{ id: 1 }],
    link_fechados: ['2026-12-25'], link_ia_ligada: true, link_hotel_opcoes: { preco: { diaria: 90 } }, link_opcoes: { termos: { texto: 'regras' } },
  };
  const junto = { info: partes.link_info, nome: partes.link_nome, google: partes.link_google, promocoes: partes.link_promocoes, fechados: partes.link_fechados, ia: true, hotel: partes.link_hotel_opcoes, opcoes: partes.link_opcoes };
  const esperado = { info: partes.link_info, nome: 'Pet Teste', google: 'https://g.page/x', promocoes: [{ id: 1 }], fechados: ['2026-12-25'], ia: true, precoHotel: { diaria: 90 }, termos: { texto: 'regras' } };
  const leitor = (o) => { const chamadas = []; const ler = async (f) => { chamadas.push(f); return o(f); }; return { ler, chamadas }; };
  await t('banco com link_inicial: uma chamada só, e a página recebe o mesmo de antes', () => comEnv({ GESTAO_LINK_CACHE_S: '0' }, async () => {
    const L = leitor((f) => (f === 'link_inicial' ? { data: junto, error: null } : { data: null, error: { message: 'não devia chamar' } }));
    assert.deepEqual(await S.lerLinkCom(L.ler, 'abc'), esperado);
    assert.deepEqual(L.chamadas, ['link_inicial']);
  }));
  await t('banco sem link_inicial (antes da migração): as oito leituras de antes, mesmo resultado', () => comEnv({ GESTAO_LINK_CACHE_S: '0' }, async () => {
    const L = leitor((f) => (f === 'link_inicial' ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.link_inicial' } } : { data: partes[f], error: null }));
    assert.deepEqual(await S.lerLinkCom(L.ler, 'abc'), esperado);
    assert.equal(L.chamadas.length, 9);
  }));
  await t('o banco demorou: devolve undefined (o navegador lê) e não repete em oito', () => comEnv({ GESTAO_LINK_CACHE_S: '0' }, async () => {
    const L = leitor(() => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }));
    assert.equal(await S.lerLinkCom(L.ler, 'abc'), undefined);
    assert.deepEqual(L.chamadas, ['link_inicial']);
  }));
  await t('guardado por 30 s: a segunda abertura não vai ao banco; depois do prazo, vai', () => comEnv({ GESTAO_LINK_CACHE_S: '30' }, async () => {
    S.esquecerLinksGuardados();
    const L = leitor(() => ({ data: junto, error: null }));
    const t0 = 1_000_000;
    await S.lerLinkCom(L.ler, 'abc', t0);
    assert.deepEqual(await S.lerLinkCom(L.ler, 'abc', t0 + 29_000), esperado);
    assert.equal(L.chamadas.length, 1);
    await S.lerLinkCom(L.ler, 'outro', t0 + 1000);
    assert.equal(L.chamadas.length, 2, 'outro código é outra leitura');
    await S.lerLinkCom(L.ler, 'abc', t0 + 31_000);
    assert.equal(L.chamadas.length, 3);
    S.esquecerLinksGuardados();
  }));
  await t('link desligado ou código inventado não fica guardado (volta a valer na hora; não enche a memória)', () => comEnv({ GESTAO_LINK_CACHE_S: '30' }, async () => {
    S.esquecerLinksGuardados();
    const L = leitor(() => ({ data: { ...junto, info: null }, error: null }));
    const r = await S.lerLinkCom(L.ler, 'nao-existe', 5000);
    assert.equal(r.info, null);
    assert.equal(r.ia, false);
    await S.lerLinkCom(L.ler, 'nao-existe', 6000);
    assert.equal(L.chamadas.length, 2);
  }));
  await t('tempo do guardado: 30 s na Vercel, desligado fora dela, e a variável troca (no máximo 300)', () => {
    comEnv({ GESTAO_LINK_CACHE_S: undefined, VERCEL: '1' }, () => assert.equal(S.segundosDoLinkGuardado(), 30));
    comEnv({ GESTAO_LINK_CACHE_S: undefined, VERCEL: undefined }, () => assert.equal(S.segundosDoLinkGuardado(), 0));
    comEnv({ GESTAO_LINK_CACHE_S: '0', VERCEL: '1' }, () => assert.equal(S.segundosDoLinkGuardado(), 0));
    comEnv({ GESTAO_LINK_CACHE_S: '9999' }, () => assert.equal(S.segundosDoLinkGuardado(), 300));
    comEnv({ GESTAO_LINK_CACHE_S: 'abc' }, () => assert.equal(S.segundosDoLinkGuardado(), 0));
  });
}))();
